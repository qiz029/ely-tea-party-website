const shader = /* wgsl */ `
struct Uniforms { size: vec2f, pointer: vec2f, time: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), s.x), mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), s.x), s.y);
}

fn caustic(uv: vec2f, time: f32) -> f32 {
  let p = uv * 6.2831 - 250.0;
  var q = p;
  var c = 1.0;
  for (var n = 0; n < 4; n++) {
    let t = time * (1.0 - 3.5 / f32(n + 1));
    q = p + vec2f(cos(t - q.x) + sin(t + q.y), sin(t - q.y) + cos(t + q.x));
    c += 1.0 / length(vec2f(p.x / (sin(q.x + t) / 0.005), p.y / (cos(q.y + t) / 0.005)));
  }
  c = 1.17 - pow(c / 4.0, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

fn rays(p: vec2f, t: f32) -> f32 {
  let d = p - vec2f(0.12 * sin(t * 0.07), -0.9);
  let a = atan2(d.x, d.y);
  let r = noise(vec2f(a * 10.0, t * 0.12)) * 0.65 + noise(vec2f(a * 27.0, -t * 0.2)) * 0.35;
  return pow(r, 3.0) * smoothstep(1.9, 0.4, length(d));
}

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / u.size;
  let p = (pos.xy - 0.5 * u.size) / u.size.y;
  let t = u.time;
  var color = mix(vec3f(0.106, 0.243, 0.553), vec3f(0.051, 0.094, 0.220), smoothstep(0.0, 0.5, uv.y));
  color = mix(color, vec3f(0.027, 0.043, 0.122), smoothstep(0.5, 1.0, uv.y));
  let shallow = 1.0 - smoothstep(0.0, 0.75, uv.y);
  let wobble = vec2f(noise(p * 3.0 + t * 0.1), noise(p * 3.0 - t * 0.1)) * 0.04;
  color += vec3f(0.45, 0.75, 1.0) * caustic(p * 0.8 + wobble, t * 0.3) * 0.5 * shallow;
  color += vec3f(0.55, 0.8, 1.0) * rays(p, t) * 0.2 * shallow;
  let m = (u.pointer - 0.5 * u.size) / u.size.y;
  color += vec3f(0.3, 0.5, 1.0) * 0.14 * exp(-7.0 * dot(p - m, p - m)) * (1.0 - uv.y * 0.6);
  color += (hash(pos.xy + fract(t)) - 0.5) / 255.0;
  return vec4f(color, 1.0);
}
`;

export async function startOcean(canvas) {
  if (!navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
  });
  if (await device.popErrorScope()) return null;

  const uniforms = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniforms } }] });
  const data = new Float32Array(8);
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let paused = false;
  let visible = true;
  let lost = false;
  let frame = 0;
  let elapsed = 0;
  let last = performance.now();

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (!pointer.tx) {
      pointer.x = pointer.tx = canvas.width * 0.5;
      pointer.y = pointer.ty = canvas.height * 0.32;
    }
  }

  function draw(now) {
    if (!paused) elapsed += Math.min(now - last, 100) / 1000;
    last = now;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    data.set([canvas.width, canvas.height, pointer.x, pointer.y, elapsed]);
    device.queue.writeBuffer(uniforms, 0, data);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function loop(now) {
    frame = 0;
    draw(now);
    schedule();
  }

  function schedule() {
    if (!frame && !paused && visible && !lost && !document.hidden) frame = requestAnimationFrame(loop);
  }

  new ResizeObserver(() => { resize(); if (paused) draw(performance.now()); }).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = performance.now(); schedule(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => { last = performance.now(); schedule(); });
  canvas.parentElement.addEventListener('pointermove', event => {
    const box = canvas.getBoundingClientRect();
    pointer.tx = (event.clientX - box.left) * (canvas.width / box.width);
    pointer.ty = (event.clientY - box.top) * (canvas.height / box.height);
  });
  device.lost.then(() => {
    lost = true;
    document.documentElement.classList.remove('gpu');
  });

  resize();
  draw(last);
  document.documentElement.classList.add('gpu');
  schedule();

  return {
    setPaused(value) {
      paused = value;
      last = performance.now();
      if (paused) draw(last);
      schedule();
    },
  };
}

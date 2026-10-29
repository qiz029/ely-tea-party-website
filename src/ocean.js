// The page's water: caustics near the surface that darken as you scroll down, and glowing plankton
// that gathers into the picture of whichever [data-form] element is centred on screen.
const common = /* wgsl */ `
struct Uniforms {
  size: vec2f, pointer: vec2f,
  time: f32, depth: f32, dt: f32, scroll: f32,
  box: vec4f,
  strength: f32, ratio: f32, view: f32, follow: f32,
};
struct Mote { pos: vec2f, vel: vec2f, seed: vec2f, glow: f32, pad: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), s.x), mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), s.x), s.y);
}
`;

const water = common + /* wgsl */ `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
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
  // y counts screens from the top of the page, so the surface scrolls away and the abyss stays.
  let y = (pos.y + u.depth) / u.view;
  let p = (pos.xy - 0.5 * u.size) / u.size.y;
  let t = u.time;
  var color = mix(vec3f(0.106, 0.243, 0.553), vec3f(0.051, 0.094, 0.220), smoothstep(0.0, 0.5, y));
  color = mix(color, vec3f(0.027, 0.043, 0.122), smoothstep(0.5, 1.0, y));
  color = mix(color, vec3f(0.012, 0.022, 0.066), smoothstep(1.4, 4.0, y));
  let shallow = 1.0 - smoothstep(0.0, 0.75, y);
  let wobble = vec2f(noise(p * 3.0 + t * 0.1), noise(p * 3.0 - t * 0.1)) * 0.04;
  color += vec3f(0.45, 0.75, 1.0) * caustic(p * 0.8 + wobble, t * 0.3) * 0.5 * shallow;
  color += vec3f(0.55, 0.8, 1.0) * rays(p, t) * 0.2 * shallow;
  let m = (u.pointer - 0.5 * u.size) / u.size.y;
  color += vec3f(0.3, 0.5, 1.0) * 0.14 * exp(-7.0 * dot(p - m, p - m)) * (1.0 - 0.6 * pos.y / u.size.y);
  // A gathered picture lights the water around it.
  let c = (u.box.xy + 0.5 * u.box.zw - 0.5 * u.size) / u.size.y;
  let r = max(u.box.z, u.box.w) / u.size.y;
  color += vec3f(0.18, 0.4, 0.9) * 0.22 * u.strength * exp(-dot(p - c, p - c) / (r * r * 0.35));
  color += (hash(pos.xy + fract(t)) - 0.5) / 255.0;
  return vec4f(color, 1.0);
}
`;

const motes = common + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> drifting: array<Mote>;
@group(0) @binding(2) var<storage, read> goals: array<vec4f>;

@compute @workgroup_size(64) fn advance(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&drifting)) { return; }
  var m = drifting[i];
  let goal = goals[i];
  let dt = u.dt;
  // Each mote joins at its own point in the gathering, so the picture fills in rather than snapping.
  let join = smoothstep(m.seed.y * 0.55, m.seed.y * 0.55 + 0.45, u.strength) * goal.w;
  let layer = 0.25 + 0.75 * m.seed.x;
  // Loose motes scroll by depth; gathered ones move as their element does, which stays put while it is pinned.
  m.pos.y -= mix(u.scroll * layer, u.follow, join);

  let q = m.pos / u.size.y * 2.2;
  let t = u.time * 0.04;
  let flow = vec2f(noise(q + vec2f(t, 1.7)) - 0.5, noise(q * 1.3 + vec2f(5.2, t)) - 0.5);
  var drift = flow * 70.0 * u.ratio + vec2f(0.0, -6.0 * u.ratio * layer) - m.vel * 1.2;
  let shimmer = vec2f(noise(vec2f(f32(i), u.time * 0.8)) - 0.5, noise(vec2f(u.time * 0.8, f32(i))) - 0.5) * 2.4 * u.ratio;
  let spot = u.box.xy + goal.xy * u.box.zw + shimmer;
  let pull = (spot - m.pos) * 46.0 - m.vel * 11.0;
  var acc = mix(drift, pull, join);
  // Letting go, a picture bursts outward instead of leaving a clump where it was.
  let outward = m.pos - (u.box.xy + 0.5 * u.box.zw);
  let fling = outward / max(length(outward), 1.0) + vec2f(cos(m.seed.x * 40.0), sin(m.seed.y * 40.0)) * 0.8;
  acc += fling * 2600.0 * u.ratio * max(m.glow - join, 0.0);

  let away = m.pos - u.pointer;
  let near = 130.0 * u.ratio;
  let d = length(away);
  if (d < near && d > 0.5) { acc += away / d * pow(1.0 - d / near, 2.0) * 5200.0 * u.ratio; }

  m.vel += acc * dt;
  m.pos += m.vel * dt;
  if (join < 0.01) {
    let edge = 40.0 * u.ratio;
    let span = u.size + 2.0 * edge;
    m.pos = ((m.pos + edge) % span + span) % span - edge;
  }
  m.glow = mix(m.glow, join, min(1.0, dt * 4.0));
  drifting[i] = m;
}

@group(0) @binding(3) var<storage, read> seen: array<Mote>;

struct Out { @builtin(position) pos: vec4f, @location(0) at: vec2f, @location(1) color: vec4f };

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let m = seen[i];
  let goal = goals[i];
  let corner = corners[v];
  let twinkle = 0.6 + 0.4 * sin(u.time * (0.6 + 1.6 * m.seed.y) + m.seed.x * 40.0);
  // A fifth of the loose plankton shows, and only below the hero; gathered motes always show.
  let below = smoothstep(0.55, 1.35, (m.pos.y + u.depth) / u.view);
  let loose = below * smoothstep(0.78, 1.0, m.seed.y) * 0.5 * twinkle;
  let held = 0.07 + 0.42 * goal.z * goal.z;
  let alpha = mix(loose, held, m.glow);
  let radius = mix(1.4 + 3.0 * m.seed.x * m.seed.x, 0.9 + 0.9 * goal.z, m.glow) * u.ratio * 2.6;
  var tint = mix(vec3f(0.36, 0.78, 1.0), vec3f(0.55, 0.62, 1.0), m.seed.y);
  if (m.seed.x > 0.95) { tint = vec3f(1.0, 0.8, 0.45); }
  tint = mix(tint, mix(vec3f(0.42, 0.62, 1.0), vec3f(0.85, 0.94, 1.0), goal.z), m.glow);
  let at = m.pos + corner * radius;
  var out: Out;
  out.pos = vec4f(at.x / u.size.x * 2.0 - 1.0, 1.0 - at.y / u.size.y * 2.0, 0.0, 1.0);
  out.at = corner;
  out.color = vec4f(tint, alpha);
  return out;
}

@fragment fn fs(input: Out) -> @location(0) vec4f {
  let a = exp(-dot(input.at, input.at) * 4.5) * input.color.a;
  return vec4f(input.color.rgb * a, a);
}
`;

// The same picture always falls into the same points, whoever opens the page.
function seeded(text) {
  let state = [...text].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Picks `count` points over an image, denser where it is bright, opaque and edged, as [x, y, brightness, joins] in 0..1.
async function sample(src, count, share) {
  const random = seeded(src);
  const image = new Image();
  image.src = src;
  await image.decode();
  const w = 240;
  const h = Math.round(w * image.naturalHeight / image.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, w, h);
  const { data } = context.getImageData(0, 0, w, h);
  const light = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) light[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255 * (data[i * 4 + 3] / 255);
  const weight = new Float32Array(w * h);
  let total = 0;
  const edged = i => {
    const x = i % w;
    const y = Math.floor(i / w);
    if (x < 1 || y < 1 || x > w - 2 || y > h - 2) return 0;
    return Math.hypot(light[i + 1] - light[i - 1], light[i + w] - light[i - w]);
  };
  // A running total, so a random point along it lands on each pixel as often as it weighs.
  for (let i = 0; i < w * h; i++) {
    total += data[i * 4 + 3] / 255 * (0.02 + 0.1 * light[i]) + edged(i) * 6;
    weight[i] = total;
  }
  const goals = new Float32Array(count * 4);
  const joined = Math.floor(count * share);
  for (let n = 0; n < joined; n++) {
    const pick = random() * total;
    let lo = 0;
    let hi = weight.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (weight[mid] < pick) lo = mid + 1; else hi = mid;
    }
    const x = lo % w;
    const y = Math.floor(lo / w);
    goals.set([(x + random()) / w, (y + random()) / h, Math.min(1, light[lo] * 0.45 + edged(lo) * 3), 1], n * 4);
  }
  // Shuffle so whichever motes are nearest do not all take the same corner of the picture.
  for (let n = joined - 1; n > 0; n--) {
    const k = Math.floor(random() * (n + 1));
    for (let c = 0; c < 4; c++) [goals[n * 4 + c], goals[k * 4 + c]] = [goals[k * 4 + c], goals[n * 4 + c]];
  }
  return goals;
}

export async function startOcean(canvas) {
  if (!navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  const count = innerWidth < 720 ? 5000 : 11000;

  device.pushErrorScope('validation');
  const waterModule = device.createShaderModule({ code: water });
  const moteModule = device.createShaderModule({ code: motes });
  const sea = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: waterModule, entryPoint: 'vs' },
    fragment: { module: waterModule, entryPoint: 'fs', targets: [{ format }] },
  });
  const stepper = device.createComputePipeline({ layout: 'auto', compute: { module: moteModule, entryPoint: 'advance' } });
  const add = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
  const glow = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: moteModule, entryPoint: 'vs' },
    fragment: { module: moteModule, entryPoint: 'fs', targets: [{ format, blend: { color: add, alpha: add } }] },
  });
  if (await device.popErrorScope()) return null;

  const uniforms = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const moteBuffer = device.createBuffer({ size: count * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const goalBuffer = device.createBuffer({ size: count * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const seaGroup = device.createBindGroup({ layout: sea.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniforms } }] });
  const stepGroup = device.createBindGroup({ layout: stepper.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: { buffer: moteBuffer } }, { binding: 2, resource: { buffer: goalBuffer } },
  ] });
  const glowGroup = device.createBindGroup({ layout: glow.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: uniforms } }, { binding: 2, resource: { buffer: goalBuffer } }, { binding: 3, resource: { buffer: moteBuffer } },
  ] });

  const data = new Float32Array(16);
  const pointer = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 };
  const forms = [...document.querySelectorAll('[data-form]')].map(el => ({ el, goals: null, loading: null }));
  let current = null;
  let strength = 0;
  let lastTop = null;
  let ratio = 1;
  let paused = false;
  let lost = false;
  let frame = 0;
  let elapsed = 0;
  let last = performance.now();
  let lastScroll = scrollY;

  let scattered = false;

  function resize() {
    ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (!scattered) scatter();
    scattered = true;
  }

  function scatter() {
    const seed = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) seed.set([Math.random() * canvas.width, Math.random() * canvas.height, 0, 0, Math.random(), Math.random(), 0, 0], i * 8);
    device.queue.writeBuffer(moteBuffer, 0, seed);
  }

  // The form closest to the middle of the screen gathers; how close sets how far it has gathered.
  function choose() {
    let best = null;
    let near = 0;
    for (const form of forms) {
      const box = form.el.getBoundingClientRect();
      if (!box.height) continue;
      const off = Math.abs(box.top + box.height / 2 - innerHeight / 2) / innerHeight;
      const s = 1 - Math.min(1, Math.max(0, (off - 0.18) / 0.5));
      form.el.style.setProperty('--formed', (form === current ? strength : 0).toFixed(3));
      if (form === current && strength > 0.95) form.el.dataset.shown = '';
      // Once the real picture has taken over, the plankton behind it goes back to drifting.
      if ('shown' in form.el.dataset) continue;
      if (s > near) { near = s; best = form; }
      if (s > 0 && !form.goals && !form.loading) {
        form.loading = sample(form.el.dataset.form, count, Number(form.el.dataset.share ?? 0.8)).then(goals => { form.goals = goals; });
      }
    }
    if (best && best !== current && best.goals && strength < 0.05) {
      current = best;
      lastTop = null;
      device.queue.writeBuffer(goalBuffer, 0, best.goals);
    }
    const want = current && current === best ? near : 0;
    strength += (want - strength) * 0.08;
    if (!current) return [0, 0, 0, 0];
    const box = current.el.getBoundingClientRect();
    return [box.left * ratio, box.top * ratio, box.width * ratio, box.height * ratio];
  }

  function draw(now) {
    const dt = paused ? 0 : Math.min(now - last, 50) / 1000;
    elapsed += dt;
    last = now;
    const scroll = (scrollY - lastScroll) * ratio;
    lastScroll = scrollY;
    pointer.x += (pointer.tx - pointer.x) * 0.12;
    pointer.y += (pointer.ty - pointer.y) * 0.12;
    const box = choose();
    const follow = lastTop === null ? 0 : lastTop - box[1];
    lastTop = box[1];
    data.set([canvas.width, canvas.height, pointer.x, pointer.y, elapsed, scrollY * ratio, dt, scroll, ...box, strength, ratio, innerHeight * ratio, follow]);
    device.queue.writeBuffer(uniforms, 0, data);
    const encoder = device.createCommandEncoder();
    const compute = encoder.beginComputePass();
    compute.setPipeline(stepper);
    compute.setBindGroup(0, stepGroup);
    compute.dispatchWorkgroups(Math.ceil(count / 64));
    compute.end();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    pass.setPipeline(sea);
    pass.setBindGroup(0, seaGroup);
    pass.draw(3);
    pass.setPipeline(glow);
    pass.setBindGroup(0, glowGroup);
    pass.draw(6, count);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function loop(now) {
    frame = 0;
    draw(now);
    schedule();
  }

  function schedule() {
    if (!frame && !paused && !lost && !document.hidden) frame = requestAnimationFrame(loop);
  }

  new ResizeObserver(() => { resize(); if (paused) draw(performance.now()); }).observe(canvas);
  addEventListener('scroll', () => { if (paused && !frame) frame = requestAnimationFrame(now => { frame = 0; draw(now); }); }, { passive: true });
  document.addEventListener('visibilitychange', () => { last = performance.now(); schedule(); });
  addEventListener('pointermove', event => {
    pointer.tx = event.clientX * ratio;
    pointer.ty = event.clientY * ratio;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.tx = pointer.ty = -1e4; });
  device.lost.then(() => {
    lost = true;
    document.documentElement.classList.remove('gpu');
  });

  resize();
  draw(last);
  document.documentElement.classList.add('gpu');
  schedule();

  return {
    // Paused, everything holds still and only scrolling redraws; the page shows its real pictures instead.
    setPaused(value) {
      paused = value;
      last = performance.now();
      if (paused) draw(last);
      schedule();
    },
  };
}

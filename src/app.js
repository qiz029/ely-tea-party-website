import { cast, poses, quipFor } from '/cast.js';

const images = [...document.querySelectorAll('img.animated')];
const toggle = document.querySelector('#motion-toggle');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let paused = motionPreference.matches;
let ocean = null;
const frames = new WeakMap();

function syncFrame(img) {
  const previous = frames.get(img);
  if (!paused) {
    previous?.remove();
    frames.delete(img);
    img.hidden = false;
    return;
  }
  if (!img.complete || !img.naturalWidth) return;
  const canvas = previous ?? document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(img, 0, 0);
  canvas.className = `${img.className} frozen-frame`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', img.alt);
  if (!previous) img.after(canvas);
  frames.set(img, canvas);
  img.hidden = true;
}

function syncMotion() {
  toggle.textContent = paused ? '播放动画 ▷' : '暂停动画 Ⅱ';
  toggle.setAttribute('aria-pressed', String(paused));
  document.documentElement.classList.toggle('still', paused);
  images.forEach(syncFrame);
  ocean?.setPaused(paused);
}

images.forEach(img => img.addEventListener('load', () => syncFrame(img)));
toggle.addEventListener('click', () => { paused = !paused; syncMotion(); });
motionPreference.addEventListener('change', event => { paused = event.matches; syncMotion(); });
syncMotion();

function setArt(img, name, folder = 'agents') {
  img.previousElementSibling.srcset = `/art/${folder}/${name}.avif`;
  img.src = `/assets/agents/${name}.webp`;
}

const ready = new Set();
const absolute = url => new URL(url, location.href).href;
const avif = () => images.some(img => img.currentSrc.endsWith('.avif'));
const artUrl = (name, folder) => avif() ? `/art/${folder}/${name}.avif` : `/assets/agents/${name}.webp`;
images.forEach(img => {
  if (img.complete && img.naturalWidth) ready.add(img.currentSrc);
  img.addEventListener('load', () => ready.add(img.currentSrc));
});

function preload(url) {
  const href = absolute(url);
  if (ready.has(href)) return Promise.resolve();
  const img = new Image();
  img.src = href;
  return img.decode().then(() => ready.add(href), () => {});
}

const connection = navigator.connection;
const frugal = connection?.saveData || /2g/.test(connection?.effectiveType ?? '');
let pending = [];
let pumping = false;
let dwell = 0;

// One preload at a time, in the order the latest call asked for.
async function warm(names) {
  if (frugal) return;
  pending = names.slice();
  if (pumping) return;
  pumping = true;
  while (pending.length) await preload(artUrl(pending.shift(), 'cast'));
  pumping = false;
}

// Everyone in the pose on show; a character picked and lingered on also gets her other poses.
function warmAround(picked = true) {
  const others = Object.keys(cast).map(agent => `${agent}-${castPose}`);
  warm(others);
  clearTimeout(dwell);
  if (picked) dwell = setTimeout(() => warm([...poses.map(pose => `${castAgent}-${pose}`), ...others]), 1200);
}

const castView = document.querySelector('.cast');
const castArt = document.querySelector('#cast-art');
const quip = document.querySelector('#cast-quip');
const poseButtons = [...document.querySelectorAll('[data-pose]')];
const rosterButtons = [...document.querySelectorAll('[data-cast]')];
let castAgent = 'claude';
let castPose = 'working';

function showArt(name) {
  const sharp = artUrl(name, 'cast');
  if (ready.has(absolute(sharp))) {
    castView.classList.remove('switching');
    return setArt(castArt, name, 'cast');
  }
  // The table and roster already hold a 256 px take of some poses; show it until the sharp one arrives.
  const rough = ready.has(absolute(artUrl(name, 'agents')));
  castView.classList.toggle('switching', !rough);
  if (rough) setArt(castArt, name);
  preload(sharp).then(() => {
    if (name !== `${castAgent}-${castPose}`) return;
    castView.classList.remove('switching');
    setArt(castArt, name, 'cast');
  });
}

function showCast() {
  const who = cast[castAgent];
  castView.style.setProperty('--tint', who.color);
  document.querySelector('#cast-index').textContent = String(Object.keys(cast).indexOf(castAgent) + 1).padStart(2, '0');
  document.querySelector('#cast-name').textContent = who.name;
  const tool = document.querySelector('#cast-tool');
  tool.textContent = who.url ? `${who.tool} ↗` : who.tool;
  if (who.url) tool.href = who.url;
  else tool.removeAttribute('href');
  document.querySelector('#cast-line').textContent = who.line;
  poseButtons.forEach((button, i) => {
    button.querySelector('span').textContent = who.labels[i];
    button.setAttribute('aria-pressed', String(button.dataset.pose === castPose));
  });
  rosterButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cast === castAgent)));
  quip.hidden = !(castPose in quipFor);
  quip.textContent = who.quips[quipFor[castPose]] ?? '';
  quip.classList.remove('say');
  void quip.offsetWidth;
  quip.classList.add('say');
  castArt.alt = `${who.name}：${who.labels[poses.indexOf(castPose)]}`;
  showArt(`${castAgent}-${castPose}`);
  document.querySelector('#pose-announcement').textContent = castArt.alt;
  warmAround();
}

function onIntent(button, name) {
  for (const type of ['pointerenter', 'pointerdown', 'focus']) {
    button.addEventListener(type, () => preload(artUrl(name(), 'cast')), { passive: true });
  }
}

poseButtons.forEach(button => {
  onIntent(button, () => `${castAgent}-${button.dataset.pose}`);
  button.addEventListener('click', () => { castPose = button.dataset.pose; showCast(); });
});
rosterButtons.forEach(button => {
  onIntent(button, () => `${button.dataset.cast}-${castPose}`);
  button.addEventListener('click', () => { castAgent = button.dataset.cast; showCast(); });
});
new IntersectionObserver(([entry], observer) => {
  if (!entry.isIntersecting) return;
  observer.disconnect();
  warmAround(false);
}, { rootMargin: '800px 0px' }).observe(castView);

const tourShot = document.querySelector('.tour-shot');
const tourImage = tourShot.querySelector('img');
if (!tourImage.complete) {
  tourShot.classList.add('waiting');
  const shown = () => tourShot.classList.remove('waiting');
  tourImage.addEventListener('load', shown, { once: true });
  tourImage.addEventListener('error', shown, { once: true });
}

const header = document.querySelector('.site-header');
const onScroll = () => header.classList.toggle('scrolled', scrollY > 24);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const bubbles = document.querySelector('.bubbles');
for (let i = 0; i < 22; i++) {
  const bubble = document.createElement('span');
  const size = 4 + Math.random() * 14;
  bubble.className = 'bubble';
  Object.assign(bubble.style, {
    left: `${Math.random() * 100}%`,
    width: `${size}px`,
    height: `${size}px`,
    opacity: String(0.35 + Math.random() * 0.6),
    animationDuration: `${14 + Math.random() * 20}s`,
    animationDelay: `${-Math.random() * 34}s`,
  });
  bubbles.append(bubble);
}

const states = { working: '工作中', thinking: '思考中', needs_input: '等你回答', sleeping: '打个盹' };
const weights = ['working', 'working', 'working', 'thinking', 'thinking', 'needs_input', 'sleeping'];
const seats = [...document.querySelectorAll('.seat[data-agent]')];
let heroVisible = true;
let switching = false;
new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; }).observe(document.querySelector('.stage'));
setInterval(() => {
  if (paused || switching || !heroVisible || document.hidden) return;
  const waiting = seats.filter(seat => seat.dataset.state === 'needs_input').length;
  const seat = seats[Math.floor(Math.random() * seats.length)];
  const options = weights.filter(state => state !== seat.dataset.state && !(state === 'needs_input' && waiting >= 2));
  const state = options[Math.floor(Math.random() * options.length)];
  const img = seat.querySelector('img');
  const name = `${seat.dataset.agent}-${state}`;
  const next = new Image();
  next.src = img.currentSrc.endsWith('.avif') ? `/art/agents/${name}.avif` : `/assets/agents/${name}.webp`;
  switching = true;
  next.decode().catch(() => {}).then(() => {
    switching = false;
    if (paused) return;
    seat.dataset.state = state;
    seat.querySelector('.state em').textContent = states[state];
    setArt(img, name);
    seat.classList.remove('changed');
    void seat.offsetWidth;
    seat.classList.add('changed');
  });
}, 2400);

// Below the hero, each block rises into place once, the first time it scrolls into view.
const revealed = [
  '.heading', '.tour-copy > h2', '.tour-copy > .sub', '.notes li', '.tour-shot', '.spot', '.cast-info', '.roster',
  '.skin-line', '.platform', '.download-footnote', '.first-time', '.faq-inner > div', '.faq-list details', '.footer-inner > *',
].join(',');
if (!motionPreference.matches && 'IntersectionObserver' in window) {
  const watcher = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('in');
    watcher.unobserve(entry.target);
  }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  document.querySelectorAll(revealed).forEach(element => {
    const peers = [...element.parentElement.children].filter(child => child.matches(revealed));
    element.style.setProperty('--d', `${Math.min(peers.indexOf(element), 5) * 90}ms`);
    element.classList.add('reveal');
    watcher.observe(element);
  });
}

const platform = navigator.userAgentData?.platform ?? navigator.platform;
const current = /Mac/i.test(platform) ? 'mac' : /Win/i.test(platform) ? 'windows' : /Linux/i.test(platform) && !/Android/i.test(navigator.userAgent) ? 'linux' : null;
if (current && navigator.maxTouchPoints < 2) {
  const card = document.querySelector(`[data-platform="${current}"]`);
  card.classList.add('recommended');
  const hint = document.createElement('span');
  hint.className = 'platform-hint';
  hint.textContent = '你正在使用的平台';
  const name = card.querySelector('h3').textContent;
  card.querySelector('h3').append(hint);
  const heroDownload = document.querySelector('#hero-download');
  heroDownload.href = card.querySelector('.download-button').href;
  heroDownload.firstChild.textContent = `下载 ${name} 版 `;
  document.querySelector('#hero-meta').innerHTML = `${card.querySelector('.os-spec').textContent} · <a class="text-link" href="#download">其他平台</a>`;
}

const canvas = document.querySelector('#ocean');
import('/ocean.js')
  .then(module => module.startOcean(canvas))
  .then(result => { ocean = result; ocean?.setPaused(paused); })
  .catch(() => document.documentElement.classList.remove('gpu'));

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

const castView = document.querySelector('.cast');
const castArt = document.querySelector('#cast-art');
const quip = document.querySelector('#cast-quip');
const poseButtons = [...document.querySelectorAll('[data-pose]')];
const rosterButtons = [...document.querySelectorAll('[data-cast]')];
let castAgent = 'claude';
let castPose = 'working';

function showCast() {
  const who = cast[castAgent];
  castView.style.setProperty('--tint', who.color);
  document.querySelector('#cast-index').textContent = String(Object.keys(cast).indexOf(castAgent) + 1).padStart(2, '0');
  document.querySelector('#cast-name').textContent = who.name;
  document.querySelector('#cast-tool').textContent = who.tool;
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
  setArt(castArt, `${castAgent}-${castPose}`, 'cast');
  document.querySelector('#pose-announcement').textContent = castArt.alt;
}

poseButtons.forEach(button => button.addEventListener('click', () => { castPose = button.dataset.pose; showCast(); }));
rosterButtons.forEach(button => button.addEventListener('click', () => { castAgent = button.dataset.cast; showCast(); }));

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

const platform = navigator.userAgentData?.platform ?? navigator.platform;
const current = /Mac/i.test(platform) ? 'mac' : /Win/i.test(platform) ? 'windows' : /Linux/i.test(platform) && !/Android/i.test(navigator.userAgent) ? 'linux' : null;
if (current && navigator.maxTouchPoints < 2) {
  const card = document.querySelector(`[data-platform="${current}"]`);
  card.classList.add('recommended');
  const hint = document.createElement('span');
  hint.className = 'platform-hint';
  hint.textContent = '你正在使用的平台';
  card.querySelector('h3').append(hint);
  const name = card.querySelector('h3').textContent;
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

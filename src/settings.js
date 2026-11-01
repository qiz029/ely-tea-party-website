// /settings/: the handle on first sign-in, then the profile, picture, sessions and deleting the account.
import { api, english, prefix } from '/market.js';
import { avatar } from '/account.js';

const words = english ? {
  saved: 'Saved.', methods: { GoogleOAuth: 'Google', GitHubOAuth: 'GitHub' }, emailCode: 'Email code', unknown: 'Couldn’t be loaded',
  sessions: n => `${n} device${n === 1 ? '' : 's'}`, confirmAll: 'Sign out on every device, this one included?',
  confirmDelete: 'Delete your account and every skin you published? This can’t be undone.', badImage: 'That file couldn’t be read as an image.',
  uploading: 'Uploading…',
} : {
  saved: '已保存。', methods: { GoogleOAuth: 'Google', GitHubOAuth: 'GitHub' }, emailCode: '邮箱验证码', unknown: '暂时读取不到',
  sessions: n => `${n} 台设备`, confirmAll: '要在所有设备上退出登录吗？包括当前这台。',
  confirmDelete: '确定注销账号并删除你发布的所有皮肤吗？此操作无法恢复。', badImage: '这个文件无法作为图片读取。',
  uploading: '正在上传…',
};

const $ = selector => document.querySelector(selector);
const note = (box, text) => { box.querySelector('.form-note').textContent = text; };
const params = new URLSearchParams(location.search);
const wanted = params.get('next');
const next = wanted && /^\/(?!\/)[^\s\\]*$/.test(wanted) ? wanted : null;
let user;

function showPicture() {
  $('#picture').replaceChildren(avatar(user, 96));
  $('#picture-remove').hidden = !user.avatar;
}

async function start() {
  try {
    ({ user } = await api('me'));
  } catch (error) {
    $('#status').textContent = error.message;
    return;
  }
  if (!user) return location.replace(`${prefix}/login/?next=${encodeURIComponent(location.pathname + location.search)}`);
  if (!user.handle) {
    $('#handle').hidden = false;
    $('#handle-input').focus();
    return;
  }
  const account = await api('me/account');
  $('#view-profile').href = `${prefix}/u/${user.handle}`;
  $('#name').value = user.name ?? '';
  $('#bio').value = account.bio ?? '';
  const inputs = [...$('#links').querySelectorAll('input')];
  inputs.forEach((input, i) => { input.value = account.links[i] ?? ''; });
  showPicture();
  $('#email').textContent = user.email;
  $('#methods').textContent = account.providers === null ? words.unknown
    : [...account.providers.map(p => words.methods[p] ?? p), words.emailCode].join(' · ');
  $('#sessions').textContent = words.sessions(account.sessions);
  for (const id of ['#profile-form', '#account', '#danger']) $(id).hidden = false;
}

$('#handle-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('me/handle', { method: 'POST', body: { handle: $('#handle-input').value.trim() } });
    if (next) location.replace(next); else location.reload();
  } catch (error) { note($('#handle'), error.message); }
});

$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const links = [...$('#links').querySelectorAll('input')].map(input => input.value.trim()).filter(Boolean);
    ({ user } = await api('me/profile', { method: 'PATCH', body: { name: $('#name').value, bio: $('#bio').value, links } }));
    note(form, words.saved);
  } catch (error) { note(form, error.message); }
});

// The chosen picture, cropped to its middle square and drawn at 256 pixels, goes up as WebP (PNG where WebP can't be made).
async function square(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(256, side);
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  const webp = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
  return webp?.type === 'image/webp' ? webp : new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

$('#picture-file').addEventListener('change', async event => {
  const form = $('#profile-form');
  const file = event.currentTarget.files[0];
  event.currentTarget.value = '';
  if (!file) return;
  let blob;
  try { blob = await square(file); } catch { return note(form, words.badImage); }
  note(form, words.uploading);
  try {
    ({ user } = await api('me/avatar', { method: 'PUT', raw: blob, type: blob.type }));
    showPicture();
    note(form, words.saved);
  } catch (error) { note(form, error.message); }
});

$('#picture-remove').addEventListener('click', async () => {
  try {
    ({ user } = await api('me/avatar', { method: 'DELETE' }));
    showPicture();
  } catch (error) { note($('#profile-form'), error.message); }
});

$('#sign-out-all').addEventListener('click', async () => {
  if (!confirm(words.confirmAll)) return;
  try {
    await api('me/sessions', { method: 'DELETE' });
    location.replace(`${prefix}/`);
  } catch (error) { note($('#account'), error.message); }
});

$('#delete-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!confirm(words.confirmDelete)) return;
  try {
    await api('me', { method: 'DELETE', body: { confirm: $('#confirm').value } });
    location.replace(`${prefix}/`);
  } catch (error) { note($('#danger'), error.message); }
});

start();

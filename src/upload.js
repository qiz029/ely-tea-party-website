// /skins/upload/: sign in by email code, choose a handle, publish and manage your skins.
import { api, say, english, card, el, size, AGENT_ACTIONS, WHALE_ACTIONS } from '/market.js';

const words = english ? {
  sent: email => `A code is on its way to ${email}. It works for 10 minutes.`,
  who: (email, handle) => `Signed in as ${email} (@${handle})`,
  notPack: 'This file isn’t an .elyskin pack.',
  old: 'This pack is version 1. Import it in Ely Tea Party 0.3.17 or later, fill in Pack info, and export it again.',
  noMeta: 'This pack has no name or author. Fill in Pack info in the app and export it again.',
  tooBig: 'A pack can be at most 44 MiB.',
  publishing: 'Uploading and checking…', published: 'Published!', view: 'View it',
  invalid: message => `The market can’t accept this pack: ${message}`,
  update: (name, id) => `Update “${name}” (${id})`,
  none: 'You haven’t shared any skins yet.',
  target: 'Made for', actions: 'Actions',
} : {
  sent: email => `验证码已发到 ${email}，10 分钟内有效。`,
  who: (email, handle) => `已登录：${email}（@${handle}）`,
  notPack: '这个文件不是 .elyskin 角色包。',
  old: '这是第 1 版格式的角色包。请在 Ely Tea Party 0.3.17 或更新版本里导入，填好“角色包信息”后重新导出。',
  noMeta: '这个角色包没有名称或作者。请在 App 里填好“角色包信息”后重新导出。',
  tooBig: '角色包最大 44 MiB。',
  publishing: '正在上传并校验…', published: '发布成功！', view: '去看看',
  invalid: message => `皮肤市场无法接收这个角色包：${message}`,
  update: (name, id) => `更新“${name}”（${id}）`,
  none: '你还没有分享过皮肤。',
  target: '适用', actions: '动作',
};

const $ = selector => document.querySelector(selector);
const status = $('#status');
const sections = { signin: $('#signin'), handle: $('#handle'), publish: $('#publish') };
const note = (form, text) => { form.closest('.panel').querySelector('.form-note').textContent = text; };
let user = null;
let file = null;

function view(name) {
  status.hidden = true;
  for (const [key, section] of Object.entries(sections)) section.hidden = key !== name;
}

async function refresh() {
  try {
    ({ user } = await api('me'));
  } catch (error) {
    status.textContent = error.message;
    return;
  }
  if (!user) return view('signin');
  if (!user.handle) return view('handle');
  $('#who').textContent = words.who(user.email, user.handle);
  view('publish');
  mine();
}

async function mine() {
  const list = $('#mine');
  const replace = $('#replace');
  const { skins } = await api('mine');
  list.replaceChildren(...skins.map(card));
  if (!skins.length) list.append(el('li', { class: 'empty' }, words.none));
  replace.replaceChildren(replace.options[0], ...skins.map(skin => el('option', { value: skin.id }, words.update(skin.name, skin.id))));
}

let email = '';
$('#email-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  email = $('#email').value.trim();
  try {
    await api('auth/code', { method: 'POST', body: { email, lang: english ? 'en' : 'zh' } });
    note(form, words.sent(email));
    $('#code-form').hidden = false;
    $('#code').focus();
  } catch (error) { note(form, error.message); }
});

$('#code-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api('auth/verify', { method: 'POST', body: { email, code: $('#code').value } });
    await refresh();
  } catch (error) { note(form, error.message); }
});

$('#handle-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api('me/handle', { method: 'POST', body: { handle: $('#handle-input').value.trim() } });
    await refresh();
  } catch (error) { note(form, error.message); }
});

$('#sign-out').addEventListener('click', async () => {
  await api('auth/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

// A first look at the chosen pack in the browser; the server checks everything again.
$('#file').addEventListener('change', async event => {
  const form = $('#upload-form');
  const preview = $('#preview');
  preview.hidden = true;
  note(form, '');
  file = null;
  const chosen = event.currentTarget.files[0];
  if (!chosen) return;
  if (chosen.size > 44 * 1024 * 1024) return note(form, words.tooBig);
  let doc;
  try { doc = JSON.parse(await chosen.text()); } catch { return note(form, words.notPack); }
  if (!doc || typeof doc !== 'object' || !doc.images) return note(form, words.notPack);
  if (doc.version === 1) return note(form, words.old);
  if (!doc.meta?.name || !doc.meta?.author) return note(form, words.noMeta);
  file = chosen;
  const known = doc.target === 'whale' ? WHALE_ACTIONS : AGENT_ACTIONS;
  const types = { i: 'image/png', R: 'image/gif', U: 'image/webp' };
  const thumbs = known.filter(name => typeof doc.images[name] === 'string').map(name => el('figure', {},
    el('img', { src: `data:${types[doc.images[name][0]] ?? 'image/png'};base64,${doc.images[name]}`, alt: '', width: '72', height: '72' }),
    el('figcaption', {}, say.actions[name] ?? name)));
  preview.replaceChildren(
    el('p', {}, el('b', {}, doc.meta.name), ' · ', say.by(doc.meta.author), ' · ', size(chosen.size)),
    el('p', { class: 'hint' }, `${words.target}: ${say.madeFor(doc.target)} · ${words.actions}: ${thumbs.length} / ${known.length}`),
    el('div', { class: 'thumbs' }, thumbs),
  );
  preview.hidden = false;
  const owned = [...$('#replace').options].find(option => option.value && option.value === doc.meta.id);
  if (owned) $('#replace').value = owned.value;
});

$('#upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!file) return note(form, words.notPack);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  note(form, words.publishing);
  try {
    const replace = $('#replace').value;
    const { skin } = await api(`skins${replace ? `?replace=${encodeURIComponent(replace)}` : ''}`, { method: 'POST', raw: file });
    form.reset();
    file = null;
    $('#preview').hidden = true;
    const span = form.querySelector('.form-note');
    span.replaceChildren(`${words.published} `, el('a', { class: 'text-link', href: `${english ? '/en' : ''}/skins/${skin.id}` }, words.view));
    mine();
  } catch (error) {
    note(form, error.code === 'invalid_pack' ? words.invalid(error.message) : error.message);
  } finally {
    button.disabled = false;
  }
});

refresh();

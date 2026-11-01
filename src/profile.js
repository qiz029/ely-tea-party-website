// /u/<handle> (the item template): a person's picture, name, bio, links and the skins they shared.
import { api, english, card, el } from '/market.js';
import { avatar } from '/account.js';

const words = english ? {
  missing: 'No one here has that handle.', none: 'No skins shared yet.',
  stats: (skins, downloads, joined) => `${skins} skin${skins === 1 ? '' : 's'} · ${downloads.toLocaleString('en-US')} download${downloads === 1 ? '' : 's'} · joined ${joined}`,
  date: s => new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long' }).format(new Date(s * 1000)),
} : {
  missing: '没有这个用户。', none: '还没有分享皮肤。',
  stats: (skins, downloads, joined) => `${skins} 个皮肤 · ${downloads.toLocaleString('zh-CN')} 次下载 · ${joined}加入`,
  date: s => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(s * 1000)),
};

const $ = selector => document.querySelector(selector);

async function start() {
  const handle = decodeURIComponent(location.pathname.replace(/\/$/, '').split('/').pop());
  let data;
  try {
    data = await api(`users/${encodeURIComponent(handle)}`);
  } catch (error) {
    $('#status').textContent = error.status === 404 ? words.missing : error.message;
    return;
  }
  const { user, skins } = data;
  $('#status').hidden = true;
  document.title = document.title.replace(/^[^—]*/, `${user.name || `@${user.handle}`} `);
  $('#picture').replaceChildren(avatar(user, 120));
  $('.profile-name').textContent = user.name || `@${user.handle}`;
  $('#handle').textContent = `@${user.handle}`;
  $('#handle').hidden = !user.name;
  $('#bio').textContent = user.bio ?? '';
  $('#bio').hidden = !user.bio;
  $('#links').replaceChildren(...user.links.map(link => {
    const url = new URL(link);
    return el('li', {}, el('a', { class: 'text-link', href: url.href, rel: 'noopener nofollow ugc me', target: '_blank' }, `${url.host}${url.pathname === '/' ? '' : url.pathname}`));
  }));
  $('#stats').textContent = words.stats(user.skins, user.downloads, words.date(user.joined));
  $('#own').hidden = !user.own;
  $('#profile').hidden = false;
  $('#skins').replaceChildren(...(skins.length ? skins.map(card) : [el('li', { class: 'empty' }, words.none)]));
  $('#shelf').hidden = false;
}

start();

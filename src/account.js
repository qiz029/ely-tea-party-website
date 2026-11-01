// The header's account corner on every page: "Sign in", or the signed-in person's picture and menu.
const english = document.documentElement.lang === 'en';
const prefix = english ? '/en' : '';
const words = english
  ? { profile: 'My profile', upload: 'Upload a skin', settings: 'Settings', signOut: 'Sign out', menu: 'Account menu' }
  : { profile: '我的主页', upload: '上传皮肤', settings: '设置', signOut: '退出登录', menu: '账号菜单' };

// A round picture, or the name's first letter on a colored disc.
export function avatar(user, size = 32) {
  if (user.avatar) {
    const img = document.createElement('img');
    Object.assign(img, { src: user.avatar, alt: '', width: size, height: size, className: 'avatar' });
    return img;
  }
  const disc = document.createElement('span');
  disc.className = 'avatar initial';
  disc.style.setProperty('--size', `${size}px`);
  disc.textContent = [...(user.name || user.handle || user.email || '?')][0].toUpperCase();
  return disc;
}

function item(label, href) {
  const link = document.createElement('a');
  Object.assign(link, { href, textContent: label });
  link.setAttribute('role', 'menuitem');
  return link;
}

function menu(slot, user) {
  const box = document.createElement('div');
  box.className = 'account-menu';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'account-toggle';
  toggle.setAttribute('aria-haspopup', 'menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', words.menu);
  toggle.append(avatar(user, 32));
  const list = document.createElement('div');
  list.className = 'account-list';
  list.setAttribute('role', 'menu');
  list.hidden = true;
  const who = document.createElement('p');
  who.className = 'account-who';
  who.textContent = user.handle ? `@${user.handle}` : user.email;
  const signOut = document.createElement('button');
  Object.assign(signOut, { type: 'button', textContent: words.signOut });
  signOut.setAttribute('role', 'menuitem');
  signOut.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    location.reload();
  });
  list.append(who,
    item(words.profile, user.handle ? `${prefix}/u/${user.handle}` : `${prefix}/settings/`),
    item(words.upload, `${prefix}/skins/upload/`),
    item(words.settings, `${prefix}/settings/`),
    signOut);
  const open = show => {
    list.hidden = !show;
    toggle.setAttribute('aria-expanded', String(show));
  };
  toggle.addEventListener('click', () => open(list.hidden));
  document.addEventListener('click', event => { if (!box.contains(event.target)) open(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !list.hidden) { open(false); toggle.focus(); } });
  box.append(toggle, list);
  slot.replaceWith(box);
}

const slot = document.querySelector('.site-header .account');
if (slot) {
  const here = location.pathname + location.search;
  if (!/^\/(en\/)?login\//.test(location.pathname)) slot.href = `${prefix}/login/?next=${encodeURIComponent(here)}`;
  fetch('/api/me', { credentials: 'same-origin' })
    .then(response => (response.ok ? response.json() : null))
    .then(data => { if (data?.user) menu(slot, data.user); })
    .catch(() => {});
}

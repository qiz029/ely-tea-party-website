// Account pages: /login/, /settings/ and /u/item/ (the template the Worker serves at /u/<handle>), in Chinese and English.
import { shell } from './market.mjs';

const words = {
  zh: {
    description: '登录 Ely Tea Party 皮肤市场，分享你做的角色皮肤。',
    signIn: '登录', signInLead: '登录后就能上传皮肤、编辑个人主页。第一次登录会自动创建账号。',
    google: '使用 Google 继续', github: '使用 GitHub 继续', email: '使用邮箱验证码继续',
    signInHint: '登录由 WorkOS 提供，我们不会拿到你的密码。同一个邮箱不管用哪种方式登录，都是同一个账号。',
    settings: '设置', settingsTitle: '设置 — Ely Tea Party',
    welcome: '欢迎！先选一个用户名', handleLead: '用户名会显示在你的个人主页和分享的皮肤上，主页地址和皮肤 ID 也以它开头。设定后不能修改。',
    handle: '用户名', save: '保存', profile: '个人资料', picture: '头像', pictureHint: 'PNG、JPEG、GIF 或 WebP，会裁成正方形。',
    choosePicture: '换头像', removePicture: '移除头像', name: '显示名称', namePlaceholder: '不填则显示用户名',
    bio: '简介', bioPlaceholder: '介绍一下自己，最多 300 字', links: '链接', linksHint: '最多 4 个，必须以 https:// 开头，例如 GitHub 或个人网站。',
    account: '账号', emailLabel: '邮箱', methods: '登录方式', sessions: '登录设备', signOutAll: '退出所有设备',
    danger: '注销账号', dangerLead: '永久删除你的账号、个人主页和所有发布的皮肤，无法恢复。', confirm: '输入你的用户名确认', remove: '永久注销',
    viewProfile: '查看我的主页 →',
    profileTitle: '个人主页 — Ely Tea Party 皮肤市场', skins: '发布的皮肤', edit: '编辑资料', upload: '上传皮肤',
  },
  en: {
    description: 'Sign in to the Ely Tea Party skin market and share the character skins you make.',
    signIn: 'Sign in', signInLead: 'Sign in to upload skins and edit your profile. Your account is made the first time you sign in.',
    google: 'Continue with Google', github: 'Continue with GitHub', email: 'Continue with an email code',
    signInHint: 'Sign-in is run by WorkOS; we never see a password. One email address is one account, whichever way you sign in.',
    settings: 'Settings', settingsTitle: 'Settings — Ely Tea Party',
    welcome: 'Welcome! First, pick a handle', handleLead: 'Your handle shows on your profile and the skins you share, and your profile’s address and skin ids start with it. It can’t be changed later.',
    handle: 'Handle', save: 'Save', profile: 'Profile', picture: 'Picture', pictureHint: 'PNG, JPEG, GIF or WebP, cropped to a square.',
    choosePicture: 'Change picture', removePicture: 'Remove picture', name: 'Display name', namePlaceholder: 'Your handle shows when this is empty',
    bio: 'Bio', bioPlaceholder: 'A few words about you, up to 300 characters', links: 'Links', linksHint: 'Up to 4, each starting with https://, such as GitHub or your website.',
    account: 'Account', emailLabel: 'Email', methods: 'Sign-in methods', sessions: 'Signed-in devices', signOutAll: 'Sign out everywhere',
    danger: 'Delete account', dangerLead: 'Permanently delete your account, profile and every skin you published. This can’t be undone.', confirm: 'Type your handle to confirm', remove: 'Delete for good',
    viewProfile: 'View my profile →',
    profileTitle: 'Profile — Ely Tea Party skins', skins: 'Skins', edit: 'Edit profile', upload: 'Upload a skin',
  },
};

const GOOGLE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"/></svg>';
const GITHUB = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>';
const MAIL = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 5.5h18v13H3zM3.5 6l8.5 7 8.5-7"/></svg>';

export function renderAccounts(lang, chrome) {
  const w = words[lang];
  const login = shell(lang, chrome, {
    title: `${w.signIn} — Ely Tea Party`, description: w.description, path: '/login/', robots: 'noindex', script: 'login.js',
    body: `  <main id="main" class="wrap market login-page">
    <section class="panel login-card">
      <h1>${w.signIn}</h1>
      <p class="sub">${w.signInLead}</p>
      <p class="login-error" id="error" role="alert" hidden></p>
      <a class="button provider" data-provider="google" href="/api/auth/login?provider=google">${GOOGLE}<span>${w.google}</span></a>
      <a class="button provider" data-provider="github" href="/api/auth/login?provider=github">${GITHUB}<span>${w.github}</span></a>
      <a class="button provider ghost" data-provider="email" href="/api/auth/login?provider=email">${MAIL}<span>${w.email}</span></a>
      <p class="hint">${w.signInHint}</p>
    </section>
  </main>`,
  });
  const settings = shell(lang, chrome, {
    title: w.settingsTitle, description: w.description, path: '/settings/', robots: 'noindex', script: 'settings.js',
    body: `  <main id="main" class="wrap market settings-page">
    <h1>${w.settings}</h1>
    <p class="market-status" id="status" role="status"></p>
    <section class="panel" id="handle" hidden>
      <h2>${w.welcome}</h2>
      <p>${w.handleLead}</p>
      <form id="handle-form" class="row"><label class="sr-only" for="handle-input">${w.handle}</label><input id="handle-input" required minlength="2" maxlength="24" pattern="[a-z0-9](?:[a-z0-9\\-]{0,22}[a-z0-9])?" autocapitalize="none" spellcheck="false" placeholder="${w.handle}"><button class="button tea small" type="submit">${w.save}</button></form>
      <span class="form-note" role="status"></span>
    </section>
    <form class="panel" id="profile-form" hidden>
      <h2>${w.profile}</h2>
      <p class="whoami"><a class="text-link" id="view-profile" href="#">${w.viewProfile}</a></p>
      <div class="picture-row">
        <span id="picture"></span>
        <div>
          <label class="button ghost small file-button">${w.choosePicture}<input id="picture-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="sr-only"></label>
          <button class="button ghost small" type="button" id="picture-remove">${w.removePicture}</button>
          <p class="hint">${w.pictureHint}</p>
        </div>
      </div>
      <label class="field">${w.name}<input id="name" maxlength="40" placeholder="${w.namePlaceholder}"></label>
      <label class="field">${w.bio}<textarea id="bio" maxlength="300" rows="3" placeholder="${w.bioPlaceholder}"></textarea></label>
      <fieldset class="field"><legend>${w.links}</legend>
        <div class="links" id="links">${[0, 1, 2, 3].map(i => `<input type="url" inputmode="url" maxlength="200" placeholder="https://" aria-label="${w.links} ${i + 1}">`).join('')}</div>
        <p class="hint">${w.linksHint}</p>
      </fieldset>
      <div class="row"><button class="button tea small" type="submit">${w.save}</button><span class="form-note" role="status"></span></div>
    </form>
    <section class="panel" id="account" hidden>
      <h2>${w.account}</h2>
      <dl class="skin-facts">
        <dt>${w.emailLabel}</dt><dd id="email"></dd>
        <dt>${w.methods}</dt><dd id="methods"></dd>
        <dt>${w.sessions}</dt><dd id="sessions"></dd>
      </dl>
      <div class="row"><button class="button ghost small" type="button" id="sign-out-all">${w.signOutAll}</button><span class="form-note" role="status"></span></div>
    </section>
    <section class="panel danger" id="danger" hidden>
      <h2>${w.danger}</h2>
      <p>${w.dangerLead}</p>
      <form id="delete-form" class="row"><label class="sr-only" for="confirm">${w.confirm}</label><input id="confirm" required autocomplete="off" placeholder="${w.confirm}"><button class="button danger small" type="submit">${w.remove}</button></form>
      <span class="form-note" role="status"></span>
    </section>
  </main>`,
  });
  const profile = shell(lang, chrome, {
    title: w.profileTitle, description: w.description, path: '/u/item/', robots: 'noindex', script: 'profile.js',
    body: `  <main id="main" class="wrap market profile-page">
    <p class="market-status" id="status" role="status"></p>
    <section class="profile" id="profile" hidden>
      <span id="picture"></span>
      <div class="profile-info">
        <h1 class="profile-name"></h1>
        <p class="profile-handle" id="handle"></p>
        <p class="profile-bio" id="bio"></p>
        <ul class="profile-links" id="links"></ul>
        <p class="profile-stats" id="stats"></p>
        <div class="cta" id="own" hidden><a class="button ghost small" href="${lang === 'en' ? '/en' : ''}/settings/">${w.edit}</a><a class="button tea small" href="${lang === 'en' ? '/en' : ''}/skins/upload/">${w.upload}</a></div>
      </div>
    </section>
    <section id="shelf" hidden><h2>${w.skins}</h2><ul class="skin-grid" id="skins"></ul></section>
  </main>`,
  });
  return { 'login/index.html': login, 'settings/index.html': settings, 'u/item/index.html': profile };
}

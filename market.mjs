// The skin market's pages: /skins/ (browse), /skins/item/ (the template the Worker serves at /skins/<id>)
// and /skins/upload/, in Chinese and English. Their contents come from the API at run time.

const words = {
  zh: {
    market: '皮肤市场',
    lead: '大家做的 Ely Tea Party 角色包。挑一个喜欢的，一键装进 App，或者下载 .elyskin 后在“设置 → 角色 → 导入角色包…”里导入。',
    description: '下载和分享 Ely Tea Party 的角色皮肤：给 Claude、GPT、Gemini 等 coding agent 和鲸鱼娘换上新形象。',
    upload: '上传皮肤',
    all: '全部', agents: 'Agent 角色', whale: '鲸鱼娘',
    newest: '最新', popular: '下载最多', search: '搜索名字或作者',
    more: '加载更多', loading: '正在加载…',
    back: '← 皮肤市场',
    install: '在 Ely Tea Party 中安装', download: '下载 .elyskin',
    installHint: '一键安装需要 Ely Tea Party 0.3.18 或更新版本。也可以下载文件，在 App 的“设置 → 角色 → 导入角色包…”里导入。',
    actions: '动作', report: '举报这个皮肤', reportHint: '图片侵权、不适宜公开，或者冒充他人？告诉我们原因，多人举报后会先自动隐藏。', reportSend: '提交举报',
    itemTitle: '角色皮肤 — Ely Tea Party 皮肤市场',
    uploadTitle: '上传皮肤 — Ely Tea Party 皮肤市场',
    uploadLead: '在 App 的“设置 → 角色”里换好形象、填写“角色包信息”，再用“导出角色包…”得到 .elyskin 文件，就可以上传到这里。',
    email: '邮箱', sendCode: '发送验证码', code: '验证码', signIn: '登录', signInLead: '用邮箱验证码登录，不需要密码。',
    handle: '用户名', handleLead: '选一个用户名，它会显示在你分享的皮肤上，皮肤 ID 也以它开头。设定后不能修改。', handleSave: '确定',
    file: '选择 .elyskin 文件', replace: '发布为', replaceNew: '新的皮肤',
    consent: '这些图片是我自己创作的，或者我有权分享；我同意它们在这里公开展示和下载。',
    publish: '发布', mine: '我的皮肤', signOut: '退出登录',
  },
  en: {
    market: 'Skin market',
    lead: 'Character packs for Ely Tea Party, made by its users. Pick one and install it in one click, or download the .elyskin and use Settings → Characters → Import skin….',
    description: 'Download and share Ely Tea Party character skins: new looks for Claude, GPT, Gemini and the other coding agents, and for the whale.',
    upload: 'Upload a skin',
    all: 'All', agents: 'Agents', whale: 'Whale',
    newest: 'Newest', popular: 'Most downloaded', search: 'Search names or authors',
    more: 'Load more', loading: 'Loading…',
    back: '← Skin market',
    install: 'Install in Ely Tea Party', download: 'Download .elyskin',
    installHint: 'One-click install needs Ely Tea Party 0.3.18 or later. You can also download the file and use Settings → Characters → Import skin… in the app.',
    actions: 'Actions', report: 'Report this skin', reportHint: 'Stolen art, not fit to show, or impersonating someone? Tell us why. A skin several people report is hidden until a moderator looks.', reportSend: 'Send report',
    itemTitle: 'Character skin — Ely Tea Party skins',
    uploadTitle: 'Upload a skin — Ely Tea Party skins',
    uploadLead: 'In the app, set up a character under Settings → Characters, fill in Pack info, then use Export skin… to get an .elyskin file you can upload here.',
    email: 'Email', sendCode: 'Send code', code: 'Code', signIn: 'Sign in', signInLead: 'Sign in with a code sent to your email. No password.',
    handle: 'Handle', handleLead: 'Pick a handle. It shows on the skins you share, and their ids start with it. It can’t be changed later.', handleSave: 'Save',
    file: 'Choose an .elyskin file', replace: 'Publish as', replaceNew: 'A new skin',
    consent: 'I made these images or have the right to share them, and I agree to them being shown and downloaded here.',
    publish: 'Publish', mine: 'My skins', signOut: 'Sign out',
  },
};

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function shell(lang, chrome, { title, description, path, robots = 'index, follow', body, script }) {
  const self = `https://elyteaparty.com${lang === 'en' ? '/en' : ''}${path}`;
  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'zh-CN'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0d1838">
  <meta name="color-scheme" content="dark">
  <meta name="robots" content="${robots}">
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description)}">
  <link rel="canonical" href="${self}">
  <link rel="alternate" hreflang="zh-CN" href="https://elyteaparty.com${path}">
  <link rel="alternate" hreflang="en" href="https://elyteaparty.com/en${path}">
  <link rel="alternate" hreflang="x-default" href="https://elyteaparty.com${path}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Ely Tea Party">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${self}">
  <meta property="og:image" content="https://elyteaparty.com/art/${lang === 'en' ? 'og-en' : 'og'}.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" href="/assets/icon.png">
  <link rel="apple-touch-icon" href="/assets/icon.png">
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/market.css">
  <script type="module" src="/${script}"></script>
</head>
<body class="market-page">
  ${chrome.header}
${body}
  ${chrome.footer}
</body>
</html>
`;
}

export function renderMarket(lang, chrome) {
  const w = words[lang];
  const home = lang === 'en' ? '/en/skins/' : '/skins/';
  const browse = shell(lang, chrome, {
    title: `${w.market} — Ely Tea Party`, description: w.description, path: '/skins/', script: 'skins.js',
    body: `  <main id="main" class="wrap market" data-view="browse">
    <div class="market-head">
      <div><h1>${w.market}</h1><p class="sub">${w.lead}</p></div>
      <a class="button tea" href="${home}upload/">${w.upload}</a>
    </div>
    <div class="market-tools">
      <div class="segmented" role="group" aria-label="${w.market}">
        <button type="button" data-kind="" aria-pressed="true">${w.all}</button><button type="button" data-kind="agent" aria-pressed="false">${w.agents}</button><button type="button" data-kind="whale" aria-pressed="false">${w.whale}</button>
      </div>
      <select id="sort" aria-label="${w.newest} / ${w.popular}"><option value="new">${w.newest}</option><option value="popular">${w.popular}</option></select>
      <input id="search" type="search" maxlength="64" placeholder="${w.search}" aria-label="${w.search}">
    </div>
    <p class="market-status" id="status" role="status">${w.loading}</p>
    <ul class="skin-grid" id="skins"></ul>
    <div class="market-more"><button type="button" class="button ghost" id="more" hidden>${w.more}</button></div>
  </main>`,
  });
  const item = shell(lang, chrome, {
    title: w.itemTitle, description: w.description, path: '/skins/item/', robots: 'noindex', script: 'skins.js',
    body: `  <main id="main" class="wrap market skin-page" data-view="item">
    <a class="back text-link" href="${home}">${w.back}</a>
    <p class="market-status" id="status" role="status">${w.loading}</p>
    <article class="skin-detail" id="detail" hidden>
      <div class="skin-stage"><img id="stage" alt="" width="320" height="320"></div>
      <div class="skin-info">
        <h1 class="skin-name"></h1>
        <p class="skin-by" id="by"></p>
        <p class="skin-desc" id="desc"></p>
        <div class="cta"><a class="button tea" id="install" href="#">${w.install}</a><a class="button ghost" id="download" href="#" download>${w.download}</a></div>
        <p class="hint">${w.installHint}</p>
        <dl class="skin-facts" id="facts"></dl>
        <div class="owner-tools" id="tools" hidden></div>
        <details class="report"><summary>${w.report}</summary>
          <form id="report"><p class="hint">${w.reportHint}</p><textarea name="reason" maxlength="500" rows="3" required></textarea><button class="button ghost small" type="submit">${w.reportSend}</button><span class="form-note" role="status"></span></form>
        </details>
      </div>
    </article>
    <section id="poses" hidden><h2>${w.actions}</h2><ul class="pose-grid" id="pose-list"></ul></section>
  </main>`,
  });
  const upload = shell(lang, chrome, {
    title: w.uploadTitle, description: w.description, path: '/skins/upload/', robots: 'noindex', script: 'upload.js',
    body: `  <main id="main" class="wrap market upload-page">
    <a class="back text-link" href="${home}">${w.back}</a>
    <h1>${w.upload}</h1>
    <p class="sub">${w.uploadLead}</p>
    <p class="market-status" id="status" role="status">${w.loading}</p>
    <section class="panel" id="signin" hidden>
      <p>${w.signInLead}</p>
      <form id="email-form" class="row"><label class="sr-only" for="email">${w.email}</label><input id="email" type="email" autocomplete="email" required placeholder="${w.email}"><button class="button tea small" type="submit">${w.sendCode}</button></form>
      <form id="code-form" class="row" hidden><label class="sr-only" for="code">${w.code}</label><input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required placeholder="${w.code}"><button class="button tea small" type="submit">${w.signIn}</button></form>
      <span class="form-note" role="status"></span>
    </section>
    <section class="panel" id="handle" hidden>
      <p>${w.handleLead}</p>
      <form id="handle-form" class="row"><label class="sr-only" for="handle-input">${w.handle}</label><input id="handle-input" required minlength="2" maxlength="24" pattern="[a-z0-9](?:[a-z0-9\\-]{0,22}[a-z0-9])?" placeholder="${w.handle}"><button class="button tea small" type="submit">${w.handleSave}</button></form>
      <span class="form-note" role="status"></span>
    </section>
    <section id="publish" hidden>
      <p class="whoami"><span id="who"></span> · <button type="button" class="link-button" id="sign-out">${w.signOut}</button></p>
      <form class="panel" id="upload-form">
        <label class="file-pick"><input id="file" type="file" accept=".elyskin,application/json" required><span>${w.file}</span></label>
        <div class="pack-preview" id="preview" hidden></div>
        <label class="row-label">${w.replace} <select id="replace"><option value="">${w.replaceNew}</option></select></label>
        <label class="consent"><input type="checkbox" id="consent" required> ${w.consent}</label>
        <button class="button tea" type="submit">${w.publish}</button>
        <span class="form-note" role="status"></span>
      </form>
      <h2>${w.mine}</h2>
      <ul class="skin-grid" id="mine"></ul>
    </section>
  </main>`,
  });
  return { 'skins/index.html': browse, 'skins/item/index.html': item, 'skins/upload/index.html': upload };
}

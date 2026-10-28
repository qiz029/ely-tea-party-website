// The changelog pages, /releases/ and /en/releases/, from data/releases.json; data/releases.<lang>.json translates notes a release lacks in that language.

const cjk = /[㐀-鿿]/g;
const skipped = /^(builds|构建|安装包)$/i;
const linksOnly = /^(\[[^\]]+\]\(https:\/\/[^)\s]+\)\s*(·\s*)?)+$/;

const words = {
  zh: {
    title: '更新日志 — Ely Tea Party',
    heading: '更新日志',
    lead: count => `从 0.2.0 起的 ${count} 个版本，每一版的新功能和修复。安装包都在 GitHub Releases。`,
    description: latest => `Ely Tea Party 每个版本的新功能和修复，最新是 ${latest.tag}（${latest.date.slice(0, 10)}）。`,
    latest: '最新',
    onlyOther: '这一版的说明只有英文。',
    none: '这一版没有写说明。',
    github: '在 GitHub 上查看 ↗',
    date: iso => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`; },
  },
  en: {
    title: 'Changelog — Ely Tea Party',
    heading: 'Changelog',
    lead: count => `What’s new and fixed in each of ${count} versions since 0.2.0. Installers live on GitHub Releases.`,
    description: latest => `What’s new and fixed in every Ely Tea Party version. Latest: ${latest.tag} (${latest.date.slice(0, 10)}).`,
    latest: 'Latest',
    onlyOther: 'This release’s notes are in Chinese only.',
    none: 'No notes were written for this release.',
    github: 'View on GitHub ↗',
    date: iso => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso)),
  },
};

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = text => escape(text)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');

// Headings start sections; lists and paragraphs fill them.
function sections(body) {
  const out = [{ heading: null, blocks: [] }];
  let list = null;
  let para = null;
  for (const raw of body.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const heading = raw.match(/^#{1,4}\s+(.*)/);
    const item = raw.match(/^\s*[-*]\s+(.*)/);
    if (heading) {
      list = para = null;
      out.push({ heading: heading[1].trim(), blocks: [] });
    } else if (item) {
      para = null;
      if (!list) out.at(-1).blocks.push(list = { items: [] });
      list.items.push(item[1]);
    } else if (!line) {
      list = para = null;
    } else if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      list = null;
      if (!para) out.at(-1).blocks.push(para = { lines: [] });
      para.lines.push(line);
    }
  }
  return out.filter(section => section.heading || section.blocks.length);
}

function language(section) {
  if (section.heading) return section.heading.match(cjk) ? 'zh' : 'en';
  const text = section.blocks.flatMap(block => block.items ?? block.lines).join(' ');
  return (text.match(cjk)?.length ?? 0) * 2 > (text.match(/[A-Za-z]/g)?.length ?? 0) ? 'zh' : 'en';
}

function renderRelease(release, lang, latest, translated) {
  const say = words[lang];
  const links = [];
  const all = sections(release.body).filter(section => !skipped.test(section.heading ?? ''));
  for (const section of all) {
    section.blocks = section.blocks.filter(block => {
      if (!block.lines || !linksOnly.test(block.lines.join(' '))) return true;
      const line = inline(block.lines.join(' '));
      links.push(lang === 'zh' ? line.replace('>Full changelog<', '>完整改动<') : line);
      return false;
    });
  }
  const filled = all.filter(section => section.blocks.length || section.heading);
  const mine = filled.filter(section => language(section) === lang);
  const translation = !mine.length && translated[release.tag];
  if (!mine.length && !translation && filled.length) {
    console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : ''}changelog: ${release.tag} has no ${lang} notes; add them to data/releases.${lang}.json`);
  }
  const shown = mine.length ? mine : translation ? sections(translation) : filled;
  const html = shown.map(section => [
    section.heading ? `<h3>${inline(section.heading)}</h3>` : '',
    ...section.blocks.map(block => block.items
      ? `<ul>${block.items.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`
      : `<p>${inline(block.lines.join(' '))}</p>`),
  ].join('')).join('\n');
  const note = !shown.length ? `<p class="release-note">${say.none}</p>` : mine.length || translation ? '' : `<p class="release-note">${say.onlyOther}</p>`;
  const id = release.tag;
  return `<li class="release${latest ? ' newest' : ''}" id="${id}">
  <div class="when"><h2><a href="#${id}">${id}</a></h2><time datetime="${release.date.slice(0, 10)}">${say.date(release.date)}</time>${latest ? `<span class="newest-badge">${say.latest}</span>` : ''}</div>
  <div class="release-body">${note}${html}<p class="release-links">${[...links, `<a href="${release.url}">${say.github}</a>`].join(' · ')}</p></div>
</li>`;
}

// `chrome` is the landing page's header and footer for this language, its in-page links already pointed home.
export function renderChangelog(lang, releases, chrome, translated = {}) {
  const say = words[lang];
  const self = lang === 'en' ? 'https://elyteaparty.com/en/releases/' : 'https://elyteaparty.com/releases/';
  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'zh-CN'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0d1838">
  <meta name="color-scheme" content="dark">
  <title>${say.title}</title>
  <meta name="description" content="${escape(say.description(releases[0]))}">
  <link rel="canonical" href="${self}">
  <link rel="alternate" hreflang="zh-CN" href="https://elyteaparty.com/releases/">
  <link rel="alternate" hreflang="en" href="https://elyteaparty.com/en/releases/">
  <link rel="alternate" hreflang="x-default" href="https://elyteaparty.com/releases/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Ely Tea Party">
  <meta property="og:title" content="${say.title}">
  <meta property="og:description" content="${escape(say.description(releases[0]))}">
  <meta property="og:url" content="${self}">
  <meta property="og:image" content="https://elyteaparty.com/art/${lang === 'en' ? 'og-en' : 'og'}.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" href="/assets/icon.png">
  <link rel="apple-touch-icon" href="/assets/icon.png">
  <link rel="stylesheet" href="/style.css">
</head>
<body class="changelog">
  ${chrome.header}
  <main id="main" class="wrap releases">
    <h1>${say.heading}</h1>
    <p class="sub">${say.lead(releases.length)}</p>
    <ol class="timeline">
${releases.map((release, i) => renderRelease(release, lang, i === 0, translated)).join('\n')}
    </ol>
  </main>
  ${chrome.footer}
</body>
</html>
`;
}

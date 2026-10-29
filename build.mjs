import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderChangelog } from './changelog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const repo = path.resolve(process.env.ELY_REPO ?? path.join(root, '..', 'ELYTerminal'));
if (!existsSync(path.join(repo, 'assets', 'agents'))) throw new Error(`website: no ELYTerminal checkout at ${repo}; set ELY_REPO`);
// Downloads come from the Cloudflare store's latest.json, which scripts/mirror.mjs writes; release.json, GitHub's, stands in when it can't be read.
async function stored() {
  try {
    const response = await fetch('https://download.elyteaparty.com/latest.json', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    return {
      VERSION: manifest.version, RELEASE_URL: manifest.pages.github, CHECKSUM_URL: manifest.checksums,
      MAC_URL: manifest.files.mac.url, WINDOWS_URL: manifest.files.windows.url, LINUX_URL: manifest.files.linux.url,
    };
  } catch (error) {
    console.log(`website: the download store answered ${error.message}, so release.json's GitHub links stand`);
    return null;
  }
}
// scripts/downloads.mjs counts every installer download, GitHub's and the store's, into stats.json; without it the count is left off.
async function downloads() {
  try {
    const response = await fetch('https://download.elyteaparty.com/stats.json', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { total } = await response.json();
    if (!Number.isSafeInteger(total) || total < 0) throw new Error(`a count of ${total}`);
    return total.toLocaleString('en-US');
  } catch (error) {
    console.log(`website: the download count answered ${error.message}, so the page leaves it off`);
    return '';
  }
}
const uncounted = page => values.DOWNLOADS ? page : page.replace(/ <span class="downloads">.*?<\/span>/, '');
const release = JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'));
const values = (await stored()) ?? { VERSION: release.version, RELEASE_URL: release.page, CHECKSUM_URL: `${release.base}/SHA256SUMS` };
for (const platform of ['mac', 'windows', 'linux']) {
  values[`${platform.toUpperCase()}_URL`] ??= `${release.base}/${release[platform]}`;
  if (!values[`${platform.toUpperCase()}_URL`].includes(values.VERSION)) throw new Error(`website: invalid ${platform} asset`);
}
if (!/^\d+\.\d+\.\d+$/.test(values.VERSION)) throw new Error('website: invalid release version');
values.BUILT = new Date().toISOString().slice(0, 10);
values.DOWNLOADS = await downloads();
for (const [key, value] of Object.entries(values)) {
  if (key.endsWith('_URL') && (!value.startsWith('https://') || /["<>]/.test(value))) {
    throw new Error(`website: invalid URL in ${key}`);
  }
}
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets', 'agents'), { recursive: true });
await mkdir(path.join(dist, 'assets', 'mascot'), { recursive: true });
let pages;
for (const file of await readdir(path.join(root, 'src'))) {
  let content = await readFile(path.join(root, 'src', file), 'utf8');
  content = content.replace(/@@([A-Z_]+)@@/g, (_, key) => {
    if (!(key in values)) throw new Error(`website: missing template value ${key}`);
    return values[key];
  });
  await writeFile(path.join(dist, file), uncounted(content));
  if (file === 'index.html') pages = { zh: content, en: await writeEnglish(content) };
}

const releases = JSON.parse(await readFile(path.join(root, 'data', 'releases.json'), 'utf8'));
for (const [lang, page] of Object.entries(pages)) {
  const home = lang === 'en' ? '/en/' : '/';
  const pick = tag => page.match(new RegExp(`<${tag} class="site-${tag}">[\\s\\S]*?</${tag}>`))[0];
  const chrome = {
    header: pick('header').replace('class="site-header"', 'class="site-header scrolled"')
      .replace(/href="#/g, `href="${home}#`).replace(/(class="lang" href="[^"]*)"/, '$1releases/"'),
    footer: pick('footer'),
  };
  await mkdir(path.join(dist, home, 'releases'), { recursive: true });
  const translations = path.join(root, 'data', `releases.${lang}.json`);
  const translated = existsSync(translations) ? JSON.parse(await readFile(translations, 'utf8')) : {};
  await writeFile(path.join(dist, home, 'releases', 'index.html'), renderChangelog(lang, releases, chrome, translated));
}

// /en/ is the Chinese page with every phrase in i18n/en.json swapped; any phrase left over fails the build.
async function writeEnglish(page) {
  const pairs = JSON.parse(await readFile(path.join(root, 'i18n', 'en.json'), 'utf8'));
  for (const { zh, en } of pairs.sort((a, b) => b.zh.length - a.zh.length)) {
    if (!page.includes(zh)) throw new Error(`website: en.json phrase not on the page: ${zh}`);
    page = page.split(zh).join(en);
  }
  const left = page.replaceAll('>中文<', '').match(/.{0,40}[　-〿㐀-鿿＀-￯].{0,40}/);
  if (left) throw new Error(`website: untranslated text on /en/: ${left[0]}`);
  await mkdir(path.join(dist, 'en'), { recursive: true });
  await writeFile(path.join(dist, 'en', 'index.html'), uncounted(page));
  return page;
}
for (const file of await readdir(path.join(repo, 'assets', 'agents'))) {
  if (/-(working(-research|-special|-slack)?|thinking|needs_input|idle|sleeping)\.webp$/.test(file)) {
    await cp(path.join(repo, 'assets', 'agents', file), path.join(dist, 'assets', 'agents', file));
  }
}
for (const pose of ['idle', 'working', 'puzzled-down']) {
  await cp(path.join(repo, `assets/mascot/whale-${pose}.webp`), path.join(dist, `assets/mascot/whale-${pose}.webp`));
}
await cp(path.join(root, 'art'), path.join(dist, 'art'), { recursive: true });
await cp(path.join(repo, 'docs/screenshot.png'), path.join(dist, 'assets/screenshot.png'));
await cp(path.join(repo, 'docs/icon.png'), path.join(dist, 'assets/icon.png'));
await cp(path.join(repo, 'LICENSE'), path.join(dist, 'LICENSE.txt'));
console.log(`website: built Ely Tea Party ${values.VERSION} into ${dist}`);

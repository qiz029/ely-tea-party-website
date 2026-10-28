import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const repo = path.resolve(process.env.ELY_REPO ?? path.join(root, '..', 'ELYTerminal'));
if (!existsSync(path.join(repo, 'assets', 'agents'))) throw new Error(`website: no ELYTerminal checkout at ${repo}; set ELY_REPO`);
const release = JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('website: invalid release version');
const values = { VERSION: release.version, RELEASE_URL: release.page };
for (const platform of ['mac', 'windows', 'linux']) {
  if (!release[platform]?.includes(release.version)) throw new Error(`website: invalid ${platform} asset`);
  values[`${platform.toUpperCase()}_URL`] = `${release.base}/${release[platform]}`;
}
values.CHECKSUM_URL = `${release.base}/SHA256SUMS`;
values.BUILT = new Date().toISOString().slice(0, 10);
for (const [key, value] of Object.entries(values)) {
  if (key.endsWith('_URL') && (!value.startsWith('https://') || /["<>]/.test(value))) {
    throw new Error(`website: invalid URL in ${key}`);
  }
}
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets', 'agents'), { recursive: true });
await mkdir(path.join(dist, 'assets', 'mascot'), { recursive: true });
for (const file of await readdir(path.join(root, 'src'))) {
  let content = await readFile(path.join(root, 'src', file), 'utf8');
  content = content.replace(/@@([A-Z_]+)@@/g, (_, key) => {
    if (!(key in values)) throw new Error(`website: missing template value ${key}`);
    return values[key];
  });
  await writeFile(path.join(dist, file), content);
  if (file === 'index.html') await writeEnglish(content);
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
  await writeFile(path.join(dist, 'en', 'index.html'), page);
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
console.log(`website: built Ely Tea Party ${release.version} into ${dist}`);

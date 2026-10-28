// Saves Ely Tea Party's published GitHub releases to data/releases.json, which the changelog pages read.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const headers = { accept: 'application/vnd.github+json', 'user-agent': 'ely-tea-party-website' };
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const releases = [];
for (let page = 1; ; page++) {
  const url = `https://api.github.com/repos/ELY-Open-Source/ely-tea-party/releases?per_page=100&page=${page}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`releases: GitHub answered ${response.status}`);
  const batch = await response.json();
  releases.push(...batch);
  if (batch.length < 100) break;
}

const kept = releases
  .filter(release => !release.draft && !release.prerelease)
  .map(release => ({ tag: release.tag_name, date: release.published_at, url: release.html_url, body: release.body ?? '' }))
  .sort((a, b) => b.date.localeCompare(a.date));
if (!kept.length) throw new Error('releases: none published');
await mkdir(path.join(root, 'data'), { recursive: true });
await writeFile(path.join(root, 'data', 'releases.json'), `${JSON.stringify(kept, null, 1)}\n`);
console.log(`releases: saved ${kept.length}, latest ${kept[0].tag}`);

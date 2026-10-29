// Copies the newest published GitHub release to R2, checked against its SHA256SUMS, then points latest.json at it.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BUCKET, ORIGIN, github, put, say, stored, wrangler } from './store.mjs';

const KEEP = 10;
const FILES = {
  mac: [version => `ely-tea-party-${version}.dmg`, 'application/x-apple-diskimage'],
  windows: [version => `ely-tea-party-${version}-windows-x86_64.zip`, 'application/zip'],
  linux: [version => `ely-tea-party-${version}-linux-x86_64.tar.gz`, 'application/gzip'],
};

async function download(url, file) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`mirror: ${response.status} downloading ${url}`);
  const hash = createHash('sha256');
  const out = createWriteStream(file);
  await pipeline(Readable.fromWeb(response.body), async function* (chunks) {
    for await (const chunk of chunks) {
      hash.update(chunk);
      yield chunk;
    }
  }, out);
  return hash.digest('hex');
}

const release = await github('https://api.github.com/repos/ELY-Open-Source/ely-tea-party/releases/latest');
const version = release.tag_name.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`mirror: tag ${release.tag_name} names no version`);
const work = await mkdtemp(path.join(tmpdir(), 'ely-mirror-'));
try {
  const before = await stored('latest.json', path.join(work, 'latest.json'));
  if (before?.version === version && !process.argv.includes('--force')) {
    console.log(`mirror: ${version} is already on R2`);
    await say('published', 'false');
  } else {
    await mirror(work, before);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}

async function mirror(work, before) {
  const asset = name => release.assets.find(item => item.name === name) ?? (() => { throw new Error(`mirror: ${release.tag_name} lacks ${name}`); })();
  const sums = path.join(work, 'SHA256SUMS');
  await download(asset('SHA256SUMS').browser_download_url, sums);
  const listed = Object.fromEntries((await readFile(sums, 'utf8')).trim().split('\n').map(line => line.trim().split(/\s+\*?/).reverse()));
  const files = {};
  for (const [platform, [name, type]] of Object.entries(FILES)) {
    const file = name(version);
    const local = path.join(work, file);
    const sha256 = await download(asset(file).browser_download_url, local);
    if (listed[file] !== sha256) throw new Error(`mirror: ${file} hashes ${sha256}, SHA256SUMS says ${listed[file]}`);
    put(`v${version}/${file}`, local, type, 'public, max-age=31536000, immutable');
    files[platform] = { name: file, url: `${ORIGIN}/v${version}/${file}`, size: asset(file).size, sha256 };
    console.log(`mirror: ${file} on R2 (${(asset(file).size / 1048576).toFixed(0)} MB)`);
  }
  put(`v${version}/SHA256SUMS`, sums, 'text/plain; charset=utf-8', 'public, max-age=31536000, immutable');

  const kept = [{ version, files: [...Object.values(files).map(file => file.name), 'SHA256SUMS'] }, ...(before?.kept ?? []).filter(entry => entry.version !== version)];
  const manifest = {
    version,
    published: release.published_at,
    files,
    checksums: `${ORIGIN}/v${version}/SHA256SUMS`,
    pages: {
      download: { zh: 'https://elyteaparty.com/#download', en: 'https://elyteaparty.com/en/#download' },
      notes: { zh: `https://elyteaparty.com/releases/#v${version}`, en: `https://elyteaparty.com/en/releases/#v${version}` },
      github: release.html_url,
    },
    kept: kept.slice(0, KEEP),
  };
  const latest = path.join(work, 'latest.json');
  await writeFile(latest, `${JSON.stringify(manifest, null, 1)}\n`);
  put('latest.json', latest, 'application/json; charset=utf-8', 'public, max-age=300');
  console.log(`mirror: latest.json now names ${version}`);
  for (const old of kept.slice(KEEP)) {
    for (const file of old.files) wrangler('delete', `${BUCKET}/v${old.version}/${file}`);
    console.log(`mirror: removed ${old.version} from R2`);
  }
  await say('published', 'true');
}

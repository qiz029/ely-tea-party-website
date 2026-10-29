// What scripts/mirror.mjs and scripts/downloads.mjs share: the R2 bucket, its domain, and GitHub's API.
import { execFileSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const BUCKET = 'ely-tea-party-downloads';
export const ORIGIN = 'https://download.elyteaparty.com';
export const ACCOUNT = '221784d24eb2a95d148bc96b6f06d6be';

export const wrangler = (...args) => execFileSync('npx', ['--yes', 'wrangler@4.154.0', 'r2', 'object', ...args, '--remote'], { cwd: root, stdio: ['ignore', 'pipe', args[0] === 'get' ? 'ignore' : 'inherit'] });
export const put = (key, file, type, cache) => wrangler('put', `${BUCKET}/${key}`, '--file', file, '--content-type', type, '--cache-control', cache);
export const say = async (key, value) => process.env.GITHUB_OUTPUT && appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);

// The JSON object at `key`, or null when the bucket has none yet.
export async function stored(key, file) {
  try {
    wrangler('get', `${BUCKET}/${key}`, '--file', file);
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function github(url) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'ely-tea-party-website' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`store: GitHub answered ${response.status} for ${url}`);
  return response.json();
}

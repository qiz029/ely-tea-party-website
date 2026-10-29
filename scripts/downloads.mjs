// Counts installer downloads, GitHub's for every release plus the R2 store's, into stats.json for the site to show.
// R2's analytics keep only 31 days, so the store's count is a running total, added to hour by hour from `through`.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ACCOUNT, BUCKET, github, put, say, stored } from './store.mjs';

const OPENED = '2026-10-28T00:00:00Z';
const WINDOW = 31 * 24 * 3600 * 1000;
const INSTALLER = /^v\d+\.\d+\.\d+\/ely-tea-party-[^/]+\.(dmg|zip|tar\.gz)$/;

async function fromGitHub() {
  let count = 0;
  for (let page = 1; ; page++) {
    const releases = await github(`https://api.github.com/repos/ELY-Open-Source/ely-tea-party/releases?per_page=100&page=${page}`);
    for (const release of releases) {
      for (const asset of release.assets) if (asset.name !== 'SHA256SUMS') count += asset.download_count;
    }
    if (releases.length < 100) return count;
  }
}

// Whole successful GETs of an installer between the two times; a ranged or HEAD request is not a download.
async function fromStore(start, end) {
  const query = `query ($account: string!, $bucket: string!, $start: Time!, $end: Time!) {
    viewer { accounts(filter: { accountTag: $account }) {
      r2OperationsAdaptiveGroups(limit: 10000, filter: { bucketName: $bucket, actionType: "GetObject", responseStatusCode: 200, datetime_gt: $start, datetime_leq: $end }) {
        sum { requests } dimensions { objectName }
      }
    } }
  }`;
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: ACCOUNT, bucket: BUCKET, start, end } }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(`downloads: Cloudflare analytics answered ${body.errors?.[0]?.message ?? response.status}`);
  return body.data.viewer.accounts[0].r2OperationsAdaptiveGroups
    .filter(group => INSTALLER.test(group.dimensions.objectName))
    .reduce((sum, group) => sum + group.sum.requests, 0);
}

const work = await mkdtemp(path.join(tmpdir(), 'ely-downloads-'));
try {
  const before = await stored('stats.json', path.join(work, 'before.json'));
  const fromGitHubNow = await fromGitHub();
  // Analytics land a few minutes late, so this run counts up to the last whole hour at least ten minutes old.
  const end = new Date(Math.floor((Date.now() - 600000) / 3600000) * 3600000);
  let through = before?.through ?? OPENED;
  let store = before?.store ?? 0;
  if (new Date(through) < end) {
    if (end - new Date(through) > WINDOW) {
      console.log(`::warning::downloads: R2 analytics only reach back 31 days, so the store's downloads since ${through} are partly lost`);
      through = new Date(end - WINDOW).toISOString();
    }
    try {
      store += await fromStore(through, end.toISOString());
      through = end.toISOString();
    } catch (error) {
      console.log(`::warning::${error.message}; the store's count stays at ${store} through ${through}`);
    }
  }
  const stats = { total: fromGitHubNow + store, github: fromGitHubNow, store, through, updated: new Date().toISOString() };
  console.log(`downloads: ${stats.total} (GitHub ${stats.github}, store ${stats.store} through ${through})`);
  const file = path.join(work, 'stats.json');
  await writeFile(file, `${JSON.stringify(stats, null, 1)}\n`);
  put('stats.json', file, 'application/json; charset=utf-8', 'public, max-age=300');
  await say('changed', String(stats.total !== before?.total));
} finally {
  await rm(work, { recursive: true, force: true });
}

// The market end to end against `npm run dev` (MARKET_URL, default http://localhost:8787): sign in with the
// code the local email simulator prints into DEV_LOG, upload, list, download, replace, report, moderate, delete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makePack } from './pack.test.mjs';

const base = process.env.MARKET_URL ?? 'http://localhost:8787';
const log = process.env.DEV_LOG;

async function ready() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/api/me`)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`no market at ${base}`);
}

function client(ip) {
  let cookie = '';
  return async (path, { method = 'GET', body, raw, headers = {} } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'cf-connecting-ip': ip, ...(cookie ? { cookie } : {}), ...(body || raw ? { 'content-type': 'application/json' } : {}), ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      redirect: 'manual',
    });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return response;
  };
}

async function codeFor(email) {
  // The local email simulator logs each mail's recipient and subject, which holds the code.
  for (let i = 0; i < 20; i++) {
    const mails = [...readFileSync(log, 'utf8').matchAll(/To: (\S+)\nSubject: [^\n]*?(\d{6})/g)].filter(m => m[1] === email);
    if (mails.length) return mails.at(-1)[2];
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('no code mail in the dev log');
}

async function signIn(call, email, handle) {
  assert.equal((await call('/api/auth/code', { method: 'POST', body: { email } })).status, 200);
  const wrong = await call('/api/auth/verify', { method: 'POST', body: { email, code: '000000' } });
  assert.equal(wrong.status, 400);
  const ok = await call('/api/auth/verify', { method: 'POST', body: { email, code: await codeFor(email) } });
  assert.equal(ok.status, 200, await ok.clone().text());
  if (handle) assert.equal((await call('/api/me/handle', { method: 'POST', body: { handle } })).status, 200);
}

test('the market from sign-in to delete', async () => {
  await ready();
  const stamp = Date.now().toString(36);
  const alice = client('10.0.0.1');
  const bob = client('10.0.0.2');
  const admin = client('10.0.0.3');

  assert.equal((await alice('/api/skins', { method: 'POST', raw: JSON.stringify(makePack()) })).status, 401);
  assert.equal((await alice('/api/auth/code', { method: 'POST', body: { email: 'x' }, headers: { origin: 'https://evil.example' } })).status, 403);
  await signIn(alice, `alice-${stamp}@example.com`, `alice-${stamp}`);
  assert.equal((await alice('/api/me/handle', { method: 'POST', body: { handle: 'other' } })).status, 409);

  const bad = await alice('/api/skins', { method: 'POST', raw: JSON.stringify(makePack({ images: { idle: 'aGVsbG8=' } })) });
  assert.equal(bad.status, 422);
  assert.match((await bad.json()).error, /PNG, GIF or WebP/);

  const pack = JSON.stringify(makePack({ meta: { name: 'Blue Otter', author: 'Tester', description: 'An otter.\nIn a suit.', license: 'CC-BY-4.0' } }));
  const created = await alice('/api/skins', { method: 'POST', raw: pack });
  assert.equal(created.status, 201, await created.clone().text());
  const { skin } = await created.json();
  assert.equal(skin.id, `alice-${stamp}.blue-otter`);
  assert.equal(skin.sha256, createHash('sha256').update(pack).digest('hex'));

  const listed = await (await bob(`/api/skins?q=alice-${stamp}`)).json();
  assert.deepEqual(listed.skins.map(s => s.id), [skin.id]);
  const downloaded = await bob(skin.pack);
  assert.equal(downloaded.headers.get('content-disposition'), `attachment; filename="${skin.id}.elyskin"`);
  assert.equal(await downloaded.text(), pack, 'served unchanged');
  const idle = await bob(skin.actions.idle.url);
  assert.equal(idle.headers.get('content-type'), 'image/webp');
  assert.equal((await bob(skin.actions.idle.url.replace('idle.webp', 'idle.png'))).status, 404);

  const page = await bob(`/en/skins/${skin.id}`);
  const html = await page.text();
  assert.match(html, /<title>Blue Otter by Tester — Ely Tea Party skins<\/title>/);
  assert.match(html, new RegExp(`class="lang" href="/skins/${skin.id.replace('.', '\\.')}"`));
  assert.equal((await bob('/skins/nobody.nothing')).status, 404);

  // Bob can't take Alice's id; Alice replaces her own.
  await signIn(bob, `bob-${stamp}@example.com`, `bob-${stamp}`);
  const stolen = JSON.stringify(makePack({ meta: { name: 'Mine', author: 'Bob', id: skin.id } }));
  assert.equal((await bob('/api/skins', { method: 'POST', raw: stolen })).status, 403);
  assert.equal((await bob(`/api/skins/${skin.id}`, { method: 'DELETE' })).status, 404);
  const v2 = JSON.stringify(makePack({ meta: { name: 'Blue Otter', author: 'Tester', id: skin.id } }));
  const replaced = await alice('/api/skins', { method: 'POST', raw: v2 });
  assert.equal(replaced.status, 200, await replaced.clone().text());
  assert.equal((await replaced.json()).skin.revision, 2);
  assert.equal((await bob(skin.actions.idle.url)).status, 404, 'the old revision is gone');

  // Three reporters hide it; the owner still sees it; an admin restores it.
  for (const ip of ['10.1.0.1', '10.1.0.2', '10.1.0.3']) {
    const r = await client(ip)(`/api/skins/${skin.id}/report`, { method: 'POST', body: { reason: 'stolen art' } });
    assert.equal(r.status, 200);
  }
  assert.equal((await bob(`/api/skins/${skin.id}`)).status, 404);
  assert.equal((await alice(`/api/skins/${skin.id}`)).status, 200);
  assert.equal((await alice(`/api/skins/${skin.id}/status`, { method: 'POST', body: { status: 'public' } })).status, 403);
  await signIn(admin, 'admin@example.com');
  const seen = await (await admin(`/api/skins/${skin.id}`)).json();
  assert.equal(seen.skin.reports, 3);
  assert.equal((await admin(`/api/skins/${skin.id}/status`, { method: 'POST', body: { status: 'public' } })).status, 200);
  assert.equal((await bob(`/api/skins/${skin.id}`)).status, 200);

  assert.equal((await alice(`/api/skins/${skin.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await bob(`/api/skins/${skin.id}`)).status, 404);
  assert.equal((await bob(skin.pack)).status, 404);
});

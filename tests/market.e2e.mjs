// The market end to end against a local Worker (MARKET_URL, default http://localhost:8787) whose WorkOS is the mock
// this test runs on port 8788: start it with
//   npm run build && npx wrangler dev --port 8787 --local-upstream localhost:8787 --var WORKOS_CLIENT_ID:client_mock --var WORKOS_API_KEY:sk_mock --var WORKOS_API_URL:http://localhost:8788
// It signs in, sets up a profile, uploads, lists, downloads, replaces, reports, moderates and deletes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { makePack } from './pack.test.mjs';

const base = process.env.MARKET_URL ?? 'http://localhost:8787';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// The mock WorkOS: /authorize hands back a code for whoever `next` names; /authenticate trades it for that person.
const workos = { next: null, codes: new Map(), removed: [] };
const mock = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8788');
  const send = (status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
  if (url.pathname === '/user_management/authorize') {
    assert.equal(url.searchParams.get('client_id'), 'client_mock');
    const code = randomBytes(8).toString('hex');
    workos.codes.set(code, workos.next);
    const back = new URL(url.searchParams.get('redirect_uri'));
    back.search = new URLSearchParams({ code, state: url.searchParams.get('state') });
    return send(302, '', { Location: back.href });
  }
  if (req.headers.authorization !== 'Bearer sk_mock' && url.pathname !== '/avatar.png') return send(401, '{}');
  if (url.pathname === '/user_management/authenticate') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { code, client_secret: secret, grant_type: grant } = JSON.parse(body);
    const user = workos.codes.get(code);
    if (!user || secret !== 'sk_mock' || grant !== 'authorization_code') return send(400, '{"error":"invalid_grant"}');
    workos.codes.delete(code);
    return send(200, JSON.stringify({ user, authentication_method: 'GoogleOAuth' }), { 'Content-Type': 'application/json' });
  }
  if (url.pathname === '/avatar.png') return send(200, PNG, { 'Content-Type': 'image/png' });
  const identities = url.pathname.match(/^\/user_management\/users\/([^/]+)\/identities$/);
  if (identities) return send(200, JSON.stringify([{ idp_id: '1', type: 'OAuth', provider: 'GoogleOAuth' }]), { 'Content-Type': 'application/json' });
  const user = url.pathname.match(/^\/user_management\/users\/([^/]+)$/);
  if (user && req.method === 'DELETE') { workos.removed.push(user[1]); return send(202, ''); }
  send(404, '{}');
});
await new Promise(resolve => mock.listen(8788, resolve));
after(() => mock.close());

async function ready() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/api/me`)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`no market at ${base}`);
}

function client(ip) {
  const jar = new Map();
  const call = async (path, { method = 'GET', body, raw, headers = {} } = {}) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const response = await fetch(path.startsWith('http') ? path : `${base}${path}`, {
      method,
      headers: { 'cf-connecting-ip': ip, ...(cookie ? { cookie } : {}), ...(body || raw ? { 'content-type': 'application/json' } : {}), ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      redirect: 'manual',
    });
    for (const set of response.headers.getSetCookie()) {
      const [pair] = set.split(';');
      const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
      if (/Max-Age=0/.test(set)) jar.delete(name); else jar.set(name, value);
    }
    return response;
  };
  return call;
}

// Signs in through the mock as `person`; answers where the site lands afterwards.
async function signIn(call, person, next = '/skins/upload/') {
  workos.next = { object: 'user', email_verified: true, first_name: null, last_name: null, profile_picture_url: null, ...person };
  const start = await call(`/api/auth/login?provider=google&next=${encodeURIComponent(next)}`);
  assert.equal(start.status, 302, await start.clone().text());
  const authorize = await fetch(start.headers.get('location'), { redirect: 'manual' });
  const done = await call(authorize.headers.get('location'));
  assert.equal(done.status, 302, await done.clone().text());
  return done.headers.get('location');
}

const person = (name, extra = {}) => ({ id: `user_${name}`, email: `${name}@example.com`, ...extra });

test('the market from sign-in to delete', async () => {
  await ready();
  const stamp = Date.now().toString(36);
  const alice = client('10.0.0.1');
  const bob = client('10.0.0.2');
  const admin = client('10.0.0.3');

  assert.equal((await alice('/api/skins', { method: 'POST', raw: JSON.stringify(makePack()) })).status, 401);
  assert.equal((await alice('/api/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await alice('/api/auth/login?provider=myspace&next=/en/skins/')).headers.get('location'), '/en/login/?error=bad_provider&next=%2Fen%2Fskins%2F');
  const forged = await alice('/api/auth/callback?code=x&state=0123456789abcdef0123456789abcdef');
  assert.match(forged.headers.get('location'), /^\/login\/\?error=expired/);
  assert.match(await signIn(client('10.0.0.9'), person(`eve-${stamp}`, { email_verified: false })), /error=unverified/);

  // A new account lands on /settings/ to pick a handle; its name and picture come from the provider.
  const alicePerson = person(`alice-${stamp}`, { first_name: 'Alice', last_name: 'Liddell', profile_picture_url: 'http://localhost:8788/avatar.png' });
  assert.equal(await signIn(alice, alicePerson), '/settings/?next=%2Fskins%2Fupload%2F');
  assert.equal((await alice('/api/skins', { method: 'POST', raw: JSON.stringify(makePack()) })).status, 403, 'no handle yet');
  assert.equal((await alice('/api/me/handle', { method: 'POST', body: { handle: 'admin' } })).status, 409);
  assert.equal((await alice('/api/me/handle', { method: 'POST', body: { handle: `alice-${stamp}` } })).status, 200);
  assert.equal((await alice('/api/me/handle', { method: 'POST', body: { handle: 'other' } })).status, 409);
  let me;
  for (let i = 0; i < 20 && !me?.avatar; i++) {
    ({ user: me } = await (await alice('/api/me')).json());
    if (!me.avatar) await new Promise(r => setTimeout(r, 250));
  }
  assert.equal(me.name, 'Alice Liddell');
  assert.match(me.avatar ?? '', /^\/api\/avatars\/\d+\/[0-9a-f]{16}\.png$/, 'the provider picture was copied');
  assert.equal((await alice(me.avatar)).headers.get('content-type'), 'image/png');
  // Signing in again finds the same account and goes straight on.
  assert.equal(await signIn(alice, alicePerson, '/en/skins/'), '/en/skins/');

  // The profile: edit, picture, public view.
  assert.equal((await alice('/api/me/profile', { method: 'PATCH', body: { name: 'Alice', links: ['http://plain.example'] } })).status, 400);
  assert.equal((await alice('/api/me/profile', { method: 'PATCH', body: { name: 'Al\u202Eice' } })).status, 400);
  const edited = await alice('/api/me/profile', { method: 'PATCH', body: { name: ' Alice ', bio: 'Draws otters.\nMostly blue.', links: ['https://github.com/alice', ''] } });
  assert.equal(edited.status, 200, await edited.clone().text());
  const picture = await alice('/api/me/avatar', { method: 'PUT', raw: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(picture.status, 200);
  assert.equal((await alice('/api/me/avatar', { method: 'PUT', raw: 'not an image' })).status, 422);
  const account = await (await alice('/api/me/account')).json();
  assert.deepEqual(account.providers, ['GoogleOAuth']);
  assert.equal(account.sessions, 2);

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
  await signIn(bob, person(`bob-${stamp}`));
  assert.equal((await bob('/api/me/handle', { method: 'POST', body: { handle: `bob-${stamp}` } })).status, 200);
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
  await signIn(admin, { id: 'user_admin', email: 'admin@example.com' });
  const seen = await (await admin(`/api/skins/${skin.id}`)).json();
  assert.equal(seen.skin.reports, 3);
  assert.equal((await admin(`/api/skins/${skin.id}/status`, { method: 'POST', body: { status: 'public' } })).status, 200);
  assert.equal((await bob(`/api/skins/${skin.id}`)).status, 200);

  // Alice's public profile lists the skin; its page carries her name.
  const shown = await (await bob(`/api/users/alice-${stamp}`)).json();
  assert.equal(shown.user.name, 'Alice');
  assert.equal(shown.user.bio, 'Draws otters.\nMostly blue.');
  assert.deepEqual(shown.user.links, ['https://github.com/alice']);
  assert.equal(shown.user.own, false);
  assert.deepEqual(shown.skins.map(s => s.id), [skin.id]);
  assert.match(await (await bob(`/en/u/alice-${stamp}`)).text(), /<title>Alice \(@alice-[a-z0-9]+\) — Ely Tea Party skins<\/title>/);
  assert.equal((await bob('/u/nobody-here')).status, 404);
  assert.equal((await bob('/api/users/nobody-here')).status, 404);

  assert.equal((await alice(`/api/skins/${skin.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await bob(`/api/skins/${skin.id}`)).status, 404);
  assert.equal((await bob(skin.pack)).status, 404);

  // Signing out everywhere ends both of Alice's sessions; deleting Bob takes his skins and his WorkOS user.
  assert.equal((await alice('/api/me/sessions', { method: 'DELETE' })).status, 200);
  assert.equal((await (await alice('/api/me')).json()).user, null);
  const bobs = await bob('/api/skins', { method: 'POST', raw: JSON.stringify(makePack({ meta: { name: 'Bob Pack', author: 'Bob' } })) });
  assert.equal(bobs.status, 201);
  const bobSkin = (await bobs.json()).skin;
  assert.equal((await bob('/api/me', { method: 'DELETE', body: { confirm: 'alice' } })).status, 400);
  assert.equal((await bob('/api/me', { method: 'DELETE', body: { confirm: `bob-${stamp}` } })).status, 200);
  assert.deepEqual(workos.removed, [`user_bob-${stamp}`]);
  assert.equal((await bob(`/api/skins/${bobSkin.id}`)).status, 404);
  assert.equal((await bob(`/api/users/bob-${stamp}`)).status, 404);
});

// Profiles and accounts: the public /u/<handle> data, editing one's own, the picture, sessions and deleting it all.
import { HttpError, json, readJson, cleanText, limit } from './http.js';
import { currentUser, requireUser, isAdmin, describe, clearSession } from './auth.js';
import { avatarUrl, storeAvatar, clearAvatar, serveAvatar } from './avatars.js';
import { present, SELECT, removeFiles } from './skins.js';
import { removeUser } from './workos.js';
import { MOST_AVATAR_BYTES } from './images.js';

const HANDLE = /^[a-z0-9][a-z0-9-]{0,22}[a-z0-9]$/;
const MOST_LINKS = 4;

export async function loadProfile(env, handle) {
  if (!HANDLE.test(handle)) return null;
  return env.DB.prepare('SELECT id, handle, name, bio, links, avatar, created FROM users WHERE handle = ? AND banned = 0').bind(handle).first();
}

async function profile(request, env, handle) {
  const row = await loadProfile(env, handle);
  if (!row) throw new HttpError(404, 'no such person', 'no_user');
  const viewer = await currentUser(request, env);
  const admin = isAdmin(env, viewer);
  const own = viewer?.id === row.id;
  const { results } = await env.DB.prepare(`${SELECT} WHERE s.user_id = ?${own || admin ? '' : " AND s.status = 'public'"} ORDER BY s.updated DESC`).bind(row.id).all();
  const shown = results.filter(skin => skin.status === 'public');
  return json({
    user: {
      handle: row.handle, name: row.name, bio: row.bio, links: JSON.parse(row.links), avatar: avatarUrl(row), joined: row.created,
      skins: shown.length, downloads: shown.reduce((sum, skin) => sum + skin.downloads, 0), own,
    },
    skins: results.map(skin => present(skin, viewer, admin)),
  });
}

function cleanLinks(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MOST_LINKS) throw new HttpError(400, `at most ${MOST_LINKS} links`, 'bad_profile');
  return value.map(item => cleanText(item, 200, 'a link')).filter(Boolean).map(text => {
    let url;
    try { url = new URL(text); } catch { throw new HttpError(400, `${text} is not a web address`, 'bad_link'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new HttpError(400, `${text} must be an https address`, 'bad_link');
    return url.href;
  });
}

async function editProfile(request, env) {
  const user = await requireUser(request, env, { handle: false });
  const body = await readJson(request);
  const name = cleanText(body.name, 40, 'the name');
  const bio = cleanText(body.bio, 300, 'the bio', { lines: true });
  const links = cleanLinks(body.links);
  await env.DB.prepare('UPDATE users SET name = ?, bio = ?, links = ? WHERE id = ?').bind(name, bio, JSON.stringify(links), user.id).run();
  return json({ user: describe(env, { ...user, name }) });
}

async function uploadAvatar(request, env) {
  const user = await requireUser(request, env, { handle: false });
  if (Number(request.headers.get('content-length') ?? 0) > MOST_AVATAR_BYTES) throw new HttpError(413, 'the picture is larger than 1 MiB', 'bad_avatar');
  await limit(env, `avatar:${user.id}`, 20, 86400, 'too many new pictures today; try again tomorrow');
  const bytes = new Uint8Array(await request.arrayBuffer());
  const avatar = await storeAvatar(env, user.id, bytes);
  return json({ user: describe(env, { ...user, avatar }) });
}

async function deleteAvatar(request, env) {
  const user = await requireUser(request, env, { handle: false });
  await clearAvatar(env, user.id);
  return json({ user: describe(env, { ...user, avatar: null }) });
}

// The account page's facts: the address and the open sessions.
async function account(request, env) {
  const user = await requireUser(request, env, { handle: false });
  const row = await env.DB.prepare('SELECT bio, links, created, (SELECT count(*) FROM sessions WHERE user_id = ? AND expires > unixepoch()) AS sessions FROM users WHERE id = ?')
    .bind(user.id, user.id).first();
  return json({ user: describe(env, user), bio: row.bio, links: JSON.parse(row.links), joined: row.created, sessions: row.sessions });
}

async function signOutEverywhere(request, env) {
  const user = await requireUser(request, env, { handle: false });
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  console.log(`profile: account ${user.id} signed out everywhere`);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSession() });
}

// Deletes the account, its skins, picture and sessions here, and its WorkOS user. The body repeats the handle or email.
async function deleteAccount(request, env) {
  const user = await requireUser(request, env, { handle: false });
  const { confirm } = await readJson(request);
  if (typeof confirm !== 'string' || ![user.handle, user.email].includes(confirm.trim().toLowerCase())) {
    throw new HttpError(400, 'type your handle to confirm', 'bad_confirm');
  }
  const { results } = await env.DB.prepare('SELECT id FROM skins WHERE user_id = ?').bind(user.id).all();
  for (const { id } of results) await removeFiles(env, id);
  await clearAvatar(env, user.id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reports WHERE skin_id IN (SELECT id FROM skins WHERE user_id = ?)').bind(user.id),
    env.DB.prepare('DELETE FROM skins WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  console.log(`profile: account ${user.id} deleted with ${results.length} skins`);
  if (user.workosId) {
    try { await removeUser(env, user.workosId); } catch (error) { console.error('profile: the WorkOS user was not removed', error.message); }
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearSession() });
}

export async function profileRoutes(request, env, route) {
  const method = request.method;
  const person = route.match(/^users\/([a-z0-9-]+)$/);
  if (person && method === 'GET') return profile(request, env, person[1]);
  const picture = route.match(/^avatars\/(\d+)\/([0-9a-f]{16}\.(?:png|gif|webp|jpg))$/);
  if (picture && method === 'GET') return serveAvatar(env, picture[1], picture[2]);
  if (route === 'me/profile' && method === 'PATCH') return editProfile(request, env);
  if (route === 'me/avatar' && method === 'PUT') return uploadAvatar(request, env);
  if (route === 'me/avatar' && method === 'DELETE') return deleteAvatar(request, env);
  if (route === 'me/account' && method === 'GET') return account(request, env);
  if (route === 'me/sessions' && method === 'DELETE') return signOutEverywhere(request, env);
  if (route === 'me' && method === 'DELETE') return deleteAccount(request, env);
  return null;
}

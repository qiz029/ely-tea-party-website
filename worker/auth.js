// Sign-in with an emailed code through WorkOS AuthKit; a session is an HttpOnly cookie.
import { HttpError, json, readJson, now, sha256, random, keyed, ip, limit } from './http.js';
import { authorizeUrl, authenticate } from './workos.js';
import { avatarUrl } from './avatars.js';

const COOKIE = '__Host-ely_session';
const LOGIN_COOKIE = '__Host-ely_login';
const SESSION_SECONDS = 30 * 24 * 3600;
const LOGIN_SECONDS = 10 * 60;
const RESERVED = new Set(['admin', 'administrator', 'ely', 'elyteaparty', 'ely-tea-party', 'official', 'system', 'support', 'staff', 'moderator', 'root', 'whale', 'anthropic', 'openai', 'login', 'settings', 'me']);

const cookie = (name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
export const clearSession = () => cookie(COOKIE, '', 0);

export const isAdmin = (env, user) => !!user && (env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).includes(user.email);

function readCookie(request, name, pattern) {
  const match = (request.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=(${pattern})`));
  return match?.[1];
}

const USER = 'u.id, u.email, u.handle, u.banned, u.name, u.avatar, u.workos_id';
const shape = row => ({ id: row.id, email: row.email, handle: row.handle, banned: !!row.banned, name: row.name, avatar: row.avatar, workosId: row.workos_id });

// The signed-in user, or null.
export async function currentUser(request, env) {
  const token = readCookie(request, COOKIE, '[a-f0-9]{64}');
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT ${USER} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?`)
    .bind(await sha256(token), now()).first();
  return row ? shape(row) : null;
}

export async function requireUser(request, env, { handle = true } = {}) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, 'sign in first', 'signed_out');
  if (user.banned) throw new HttpError(403, 'this account cannot upload', 'banned');
  if (handle && !user.handle) throw new HttpError(403, 'choose a handle first', 'no_handle');
  return user;
}

export const describe = (env, user) => user && {
  email: user.email, handle: user.handle, name: user.name, avatar: avatarUrl(user), admin: isAdmin(env, user),
};

// Where to land after signing in: a path on this site, never another host.
export function landing(value) {
  return typeof value === 'string' && value.length <= 200 && /^\/(?!\/)[^\s\\]*$/.test(value) ? value : '/skins/';
}
const english = path => path === '/en' || path.startsWith('/en/');

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers });
}

async function login(request, env) {
  const url = new URL(request.url);
  const next = landing(url.searchParams.get('next'));
  await limit(env, `login:${await keyed(env.SECRET, ip(request))}`, 30, 600, 'too many sign-ins from this network; try again in a few minutes');
  const state = random(16);
  const target = authorizeUrl(env, { redirect: `${url.origin}/api/auth/callback`, state });
  return redirect(target, [cookie(LOGIN_COOKIE, `${state}.${encodeURIComponent(next)}`, LOGIN_SECONDS)]);
}

// The WorkOS user's account here: found by WorkOS id, else by verified email, else made.
async function account(env, person) {
  const email = person.email.trim().toLowerCase();
  const byId = await env.DB.prepare(`SELECT ${USER} FROM users u WHERE u.workos_id = ?`).bind(person.id).first();
  if (byId) {
    if (byId.email !== email) {
      await env.DB.prepare('UPDATE users SET email = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM users WHERE email = ?)').bind(email, byId.id, email).run();
    }
    return shape(byId);
  }
  if (!person.email_verified) throw new HttpError(403, 'verify your email address first', 'unverified');
  const byEmail = await env.DB.prepare(`SELECT ${USER} FROM users u WHERE u.email = ?`).bind(email).first();
  if (byEmail) {
    if (byEmail.workos_id) throw new HttpError(409, 'this email belongs to another account', 'email_taken');
    await env.DB.prepare('UPDATE users SET workos_id = ? WHERE id = ?').bind(person.id, byEmail.id).run();
    console.log(`auth: linked account ${byEmail.id} to its WorkOS user`);
    return shape(byEmail);
  }
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim().slice(0, 40) || null;
  const made = await env.DB.prepare('INSERT INTO users (email, workos_id, name, created) VALUES (?, ?, ?, ?) RETURNING id').bind(email, person.id, name, now()).first();
  console.log(`auth: made account ${made.id}`);
  return { id: made.id, email, handle: null, banned: false, name, avatar: null, workosId: person.id };
}

async function callback(request, env) {
  const url = new URL(request.url);
  const saved = readCookie(request, LOGIN_COOKIE, '[a-f0-9]{32}\\.[^;]*');
  const decode = text => { try { return decodeURIComponent(text); } catch { return ''; } };
  const [state, rawNext] = saved ? [saved.slice(0, 32), decode(saved.slice(33))] : [];
  const next = landing(rawNext);
  const prefix = english(next) ? '/en' : '';
  const fail = code => redirect(`${prefix}/login/?error=${code}&next=${encodeURIComponent(next)}`, [cookie(LOGIN_COOKIE, '', 0)]);
  if (url.searchParams.get('error')) return fail('denied');
  const code = url.searchParams.get('code');
  if (!state || !code || url.searchParams.get('state') !== state) return fail('expired');
  let user;
  try {
    user = await account(env, await authenticate(env, code, request));
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code);
    throw error;
  }
  const token = random(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now()),
    env.DB.prepare('INSERT INTO sessions (hash, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), user.id, now() + SESSION_SECONDS),
  ]);
  const landingPage = user.handle ? next : `${prefix}/settings/?next=${encodeURIComponent(next)}`;
  return redirect(landingPage, [cookie(LOGIN_COOKIE, '', 0), cookie(COOKIE, token, SESSION_SECONDS)]);
}

async function logout(request, env) {
  const token = readCookie(request, COOKIE, '[a-f0-9]{64}');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': clearSession() });
}

// A handle is chosen once, right after the first sign-in; pack ids and the profile's address start with it.
async function setHandle(request, env) {
  const user = await requireUser(request, env, { handle: false });
  if (user.handle) throw new HttpError(409, 'your handle is already set', 'handle_set');
  const { handle } = await readJson(request);
  if (typeof handle !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/.test(handle) || handle.length < 2) {
    throw new HttpError(400, 'a handle is 2 to 24 of a-z, 0-9 and "-", starting and ending with a letter or digit', 'bad_handle');
  }
  if (RESERVED.has(handle)) throw new HttpError(409, 'that handle is taken', 'handle_taken');
  const done = await env.DB.prepare('UPDATE users SET handle = ? WHERE id = ? AND handle IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE handle = ?)')
    .bind(handle, user.id, handle).run();
  if (!done.meta.changes) throw new HttpError(409, 'that handle is taken', 'handle_taken');
  console.log(`auth: account ${user.id} is @${handle}`);
  return json({ user: describe(env, { ...user, handle }) });
}

export async function authRoutes(request, env, route) {
  if (route === 'auth/login' && request.method === 'GET') {
    try {
      return await login(request, env);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      const next = landing(new URL(request.url).searchParams.get('next'));
      return redirect(`${english(next) ? '/en' : ''}/login/?error=${error.code}&next=${encodeURIComponent(next)}`);
    }
  }
  if (route === 'auth/callback' && request.method === 'GET') return callback(request, env);
  if (route === 'auth/logout' && request.method === 'POST') return logout(request, env);
  if (route === 'me' && request.method === 'GET') return json({ user: describe(env, await currentUser(request, env)) });
  if (route === 'me/handle' && request.method === 'POST') return setHandle(request, env);
  return null;
}

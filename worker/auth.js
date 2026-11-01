// Sign-in by a code mailed through Cloudflare Email Sending; a session is an HttpOnly cookie.
import { HttpError, json, readJson, now, keyed, sha256, random, ip, limit } from './http.js';

const COOKIE = '__Host-ely_session';
const SESSION_SECONDS = 30 * 24 * 3600;
const CODE_SECONDS = 10 * 60;
const RESERVED = new Set(['admin', 'administrator', 'ely', 'elyteaparty', 'ely-tea-party', 'official', 'system', 'support', 'staff', 'moderator', 'root', 'whale', 'anthropic', 'openai']);

const emailPattern = /^[^\s@<>"',;]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
function normalEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 200 || !emailPattern.test(email)) throw new HttpError(400, 'enter a valid email address', 'bad_email');
  return email;
}

export const isAdmin = (env, user) => !!user && (env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).includes(user.email);

function cookieToken(request) {
  const match = (request.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return match?.[1];
}

// The signed-in user, or null.
export async function currentUser(request, env) {
  const token = cookieToken(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT u.id, u.email, u.handle, u.banned FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?',
  ).bind(await sha256(token), now()).first();
  if (!row) return null;
  return { id: row.id, email: row.email, handle: row.handle, banned: !!row.banned };
}

export async function requireUser(request, env, { handle = true } = {}) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, 'sign in first', 'signed_out');
  if (user.banned) throw new HttpError(403, 'this account cannot upload', 'banned');
  if (handle && !user.handle) throw new HttpError(403, 'choose a handle first', 'no_handle');
  return user;
}

export const describe = (env, user) => user && { email: user.email, handle: user.handle, admin: isAdmin(env, user) };

async function sendCode(request, env) {
  const { email: raw, lang } = await readJson(request);
  const email = normalEmail(raw);
  await limit(env, `ip:${await keyed(env.SECRET, ip(request))}`, 20, 3600, 'too many codes from this network; try again in an hour');
  await limit(env, `mail-min:${email}`, 1, 60, 'wait a minute before asking for another code');
  await limit(env, `mail:${email}`, 6, 3600, 'too many codes for this address; try again in an hour');
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  await env.DB.prepare('INSERT INTO codes (email, hash, expires, tries) VALUES (?, ?, ?, 0) ON CONFLICT (email) DO UPDATE SET hash = excluded.hash, expires = excluded.expires, tries = 0')
    .bind(email, await keyed(env.SECRET, `${email}:${code}`), now() + CODE_SECONDS).run();
  const en = lang === 'en';
  try {
    await env.EMAIL.send({
      from: { email: env.EMAIL_FROM, name: 'Ely Tea Party' },
      to: email,
      subject: en ? `Your Ely Tea Party code: ${code}` : `Ely Tea Party 登录验证码：${code}`,
      text: en
        ? `Your sign-in code for the Ely Tea Party skin market is ${code}. It works for 10 minutes.\n\nIf you didn't ask for it, ignore this email.\n\nhttps://elyteaparty.com/en/skins/`
        : `你在 Ely Tea Party 皮肤市场的登录验证码是 ${code}，10 分钟内有效。\n\n如果不是你本人操作，忽略这封邮件即可。\n\nhttps://elyteaparty.com/skins/`,
    });
  } catch (error) {
    console.error('auth: the code mail failed', error);
    await env.DB.prepare('DELETE FROM codes WHERE email = ?').bind(email).run();
    throw new HttpError(503, 'the code could not be sent; try again later', 'mail_failed');
  }
  return json({ ok: true });
}

async function verify(request, env) {
  const body = await readJson(request);
  const email = normalEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const row = await env.DB.prepare('SELECT hash, expires, tries FROM codes WHERE email = ?').bind(email).first();
  const wrong = new HttpError(400, 'that code is wrong or has expired', 'bad_code');
  if (!row || row.expires < now() || row.tries >= 5) throw wrong;
  if (!/^\d{6}$/.test(code) || (await keyed(env.SECRET, `${email}:${code}`)) !== row.hash) {
    await env.DB.prepare('UPDATE codes SET tries = tries + 1 WHERE email = ?').bind(email).run();
    throw wrong;
  }
  await env.DB.prepare('DELETE FROM codes WHERE email = ?').bind(email).run();
  await env.DB.prepare('INSERT INTO users (email, created) VALUES (?, ?) ON CONFLICT (email) DO NOTHING').bind(email, now()).run();
  const user = await env.DB.prepare('SELECT id, email, handle, banned FROM users WHERE email = ?').bind(email).first();
  const token = random(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now()),
    env.DB.prepare('INSERT INTO sessions (hash, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), user.id, now() + SESSION_SECONDS),
  ]);
  return json({ user: describe(env, { ...user, banned: !!user.banned }) }, 200, {
    'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`,
  });
}

async function logout(request, env) {
  const token = cookieToken(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
}

// A handle is chosen once, before the first upload; pack ids start with it.
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
  return json({ user: describe(env, { ...user, handle }) });
}

export async function authRoutes(request, env, route) {
  if (route === 'auth/code' && request.method === 'POST') return sendCode(request, env);
  if (route === 'auth/verify' && request.method === 'POST') return verify(request, env);
  if (route === 'auth/logout' && request.method === 'POST') return logout(request, env);
  if (route === 'me' && request.method === 'GET') return json({ user: describe(env, await currentUser(request, env)) });
  if (route === 'me/handle' && request.method === 'POST') return setHandle(request, env);
  return null;
}

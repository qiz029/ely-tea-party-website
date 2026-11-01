// Small helpers every API route shares: errors, JSON, hashing, limits.

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY, ...headers },
  });
}

export function secure(response) {
  const out = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY)) out.headers.set(key, value);
  return out;
}

export async function readJson(request, most = 4096) {
  const text = await request.text();
  if (text.length > most) throw new HttpError(413, 'request too large');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'invalid JSON'); }
}

export const now = () => Math.floor(Date.now() / 1000);

const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async data => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data));

export async function keyed(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

export const random = bytes => hex(crypto.getRandomValues(new Uint8Array(bytes)));

export const ip = request => request.headers.get('cf-connecting-ip') ?? '127.0.0.1';

// Records an event for `key` and refuses it beyond `most` within `seconds`.
export async function limit(env, key, most, seconds, message) {
  const since = now() - seconds;
  const { n } = await env.DB.prepare('SELECT count(*) AS n FROM events WHERE key = ? AND at > ?').bind(key, since).first();
  if (n >= most) throw new HttpError(429, message, 'rate_limited');
  await env.DB.prepare('INSERT INTO events (key, at) VALUES (?, ?)').bind(key, now()).run();
}

// State changes come from this site's own pages, never another origin.
export function sameOrigin(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'cross-origin request refused');
  if (!origin && request.headers.get('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin') throw new HttpError(403, 'cross-origin request refused');
}

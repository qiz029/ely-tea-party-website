// WorkOS AuthKit over its REST API: the email-code sign-in page's URL, the code exchange and removing a user.
import { HttpError } from './http.js';

const base = env => (env.WORKOS_API_URL || 'https://api.workos.com').replace(/\/$/, '');

function configured(env) {
  if (!env.WORKOS_CLIENT_ID || !env.WORKOS_API_KEY) throw new HttpError(503, 'sign-in is not set up yet', 'no_auth');
}

export function authorizeUrl(env, { redirect, state }) {
  configured(env);
  const url = new URL(`${base(env)}/user_management/authorize`);
  url.search = new URLSearchParams({ response_type: 'code', client_id: env.WORKOS_CLIENT_ID, redirect_uri: redirect, provider: 'authkit', state });
  return url.href;
}

async function call(env, path, init = {}) {
  configured(env);
  const response = await fetch(`${base(env)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.WORKOS_API_KEY}`, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`workos: ${init.method ?? 'GET'} ${path} answered ${response.status}`, detail.slice(0, 300));
    throw new HttpError(502, 'the sign-in service refused', 'auth_failed');
  }
  return response.status === 204 || response.status === 202 ? null : response.json();
}

// The signed-in WorkOS user for an authorization code.
export async function authenticate(env, code, request) {
  const answer = await call(env, '/user_management/authenticate', {
    method: 'POST',
    body: JSON.stringify({
      client_id: env.WORKOS_CLIENT_ID, client_secret: env.WORKOS_API_KEY, grant_type: 'authorization_code', code,
      ip_address: request.headers.get('cf-connecting-ip') ?? undefined, user_agent: request.headers.get('user-agent') ?? undefined,
    }),
  });
  if (!answer?.user?.id || !answer.user.email) throw new HttpError(502, 'the sign-in service answered without a user', 'auth_failed');
  return answer.user;
}

export async function removeUser(env, id) {
  await call(env, `/user_management/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

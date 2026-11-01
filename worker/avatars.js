// Profile pictures in R2 under avatars/<user id>/, named by their hash so each address can be cached for good.
import { HttpError, sha256 } from './http.js';
import { inspectAvatar, ImageError, MOST_AVATAR_BYTES } from './images.js';

export const avatarUrl = user => user?.avatar ? `/api/avatars/${user.id}/${user.avatar}` : null;

async function removeAll(env, id, keep) {
  const listed = await env.SKINS.list({ prefix: `avatars/${id}/` });
  const old = listed.objects.map(o => o.key).filter(key => key !== keep);
  if (old.length) await env.SKINS.delete(old);
}

// Stores `bytes` as the user's picture in place of any other; throws HttpError 422 for an image it refuses.
export async function storeAvatar(env, id, bytes) {
  let image;
  try { image = inspectAvatar(bytes); } catch (error) {
    if (error instanceof ImageError) throw new HttpError(422, `the picture ${error.message}`, 'bad_avatar');
    throw error;
  }
  const file = `${(await sha256(bytes)).slice(0, 16)}.${image.format}`;
  const key = `avatars/${id}/${file}`;
  await env.SKINS.put(key, bytes, { httpMetadata: { contentType: image.type } });
  await env.DB.prepare('UPDATE users SET avatar = ? WHERE id = ?').bind(file, id).run();
  await removeAll(env, id, key);
  return file;
}

export async function clearAvatar(env, id) {
  await env.DB.prepare('UPDATE users SET avatar = NULL WHERE id = ?').bind(id).run();
  await removeAll(env, id);
}

// A new account's picture from Google or GitHub, copied here so visitors never load it from them.
export async function importAvatar(env, id, url) {
  try {
    const parsed = new URL(url);
    const local = (env.WORKOS_API_URL ?? '').startsWith('http://') && parsed.protocol === 'http:';
    if (parsed.protocol !== 'https:' && !local) return;
    const response = await fetch(parsed, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get('content-length') ?? 0) > MOST_AVATAR_BYTES) throw new Error('too large');
    const bytes = new Uint8Array(await response.arrayBuffer());
    await storeAvatar(env, id, bytes);
    console.log(`avatars: imported account ${id}'s picture`);
  } catch (error) {
    console.error(`avatars: account ${id}'s picture was not imported:`, error.message);
  }
}

export async function serveAvatar(env, id, file) {
  const object = await env.SKINS.get(`avatars/${id}/${file}`);
  if (!object) throw new HttpError(404, 'no such picture', 'not_found');
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

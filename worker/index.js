// elyteaparty.com: static pages from dist/, plus the skin market's API, its per-skin pages and profiles.
import { HttpError, json, secure, sameOrigin } from './http.js';
import { authRoutes } from './auth.js';
import { skinRoutes } from './skins.js';
import { profileRoutes, loadProfile } from './profile.js';
import { avatarUrl } from './avatars.js';

const DETAIL = /^\/(en\/)?skins\/([a-z0-9-]+\.[a-z0-9.-]+)\/?$/;
const PROFILE = /^\/(en\/)?u\/([a-z0-9-]+)\/?$/;

async function api(request, env, ctx, route) {
  try {
    sameOrigin(request);
    const response = (await authRoutes(request, env, route)) ?? (await profileRoutes(request, env, route)) ?? (await skinRoutes(request, env, ctx, route));
    if (!response) throw new HttpError(404, 'no such API', 'not_found');
    return response;
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
    console.error('api:', route, error);
    return json({ error: 'something went wrong on our side', code: 'internal' }, 500);
  }
}

// The skin page template, its title and share card filled in for crawlers and link previews.
async function detailPage(request, env, en, id) {
  const url = new URL(request.url);
  const template = await env.ASSETS.fetch(new URL(en ? '/en/skins/item/' : '/skins/item/', url));
  const row = await env.DB.prepare("SELECT s.id, s.name, s.author, s.description, s.sha256, s.actions, s.status, u.handle FROM skins s JOIN users u ON u.id = s.user_id WHERE s.id = ?").bind(id).first();
  const lang = ['a.lang', { element: el => el.setAttribute('href', `${en ? '' : '/en'}/skins/${id}`) }];
  if (!row || row.status !== 'public') return share(template, [lang], row ? 200 : 404);
  const title = en ? `${row.name} by ${row.author} — Ely Tea Party skins` : `${row.name}（${row.author}）— Ely Tea Party 皮肤市场`;
  const description = (row.description || (en ? `A character skin for Ely Tea Party, shared by @${row.handle}.` : `@${row.handle} 分享的 Ely Tea Party 角色皮肤。`)).slice(0, 200);
  const type = JSON.parse(row.actions).idle.type.split('/')[1];
  const image = `${url.origin}/api/skins/${row.id}/img/${row.sha256.slice(0, 16)}/idle.${type}`;
  const self = `${url.origin}${en ? '/en' : ''}/skins/${row.id}`;
  return share(template, [
    ['title', { element: el => el.setInnerContent(title) }],
    set('meta[name="description"]', 'content', description),
    set('meta[property="og:title"]', 'content', title),
    set('meta[property="og:description"]', 'content', description),
    set('meta[property="og:url"]', 'content', self),
    set('meta[property="og:image"]', 'content', image),
    set('link[rel="canonical"]', 'href', self),
    set('link[hreflang="zh-CN"]', 'href', `${url.origin}/skins/${row.id}`),
    set('link[hreflang="en"]', 'href', `${url.origin}/en/skins/${row.id}`),
    set('link[hreflang="x-default"]', 'href', `${url.origin}/skins/${row.id}`),
    set('meta[name="robots"]', 'content', 'index, follow'),
    ['h1.skin-name', { element: el => el.setInnerContent(row.name) }],
    lang,
  ]);
}

const set = (selector, attr, value) => [selector, { element: el => el.setAttribute(attr, value) }];

function share(template, rules, status = 200) {
  let rewriter = new HTMLRewriter();
  for (const [selector, handler] of rules) rewriter = rewriter.on(selector, handler);
  const page = secure(rewriter.transform(template));
  return new Response(page.body, { status, headers: page.headers });
}

// The profile template, named for the person; 404 when no one has that handle.
async function profilePage(request, env, en, handle) {
  const url = new URL(request.url);
  const template = await env.ASSETS.fetch(new URL(en ? '/en/u/item/' : '/u/item/', url));
  const row = await loadProfile(env, handle);
  const lang = ['a.lang', { element: el => el.setAttribute('href', `${en ? '' : '/en'}/u/${handle}`) }];
  if (!row) return share(template, [lang], 404);
  const who = row.name ? `${row.name} (@${row.handle})` : `@${row.handle}`;
  const title = en ? `${who} — Ely Tea Party skins` : `${who} — Ely Tea Party 皮肤市场`;
  const description = (row.bio || (en ? `Character skins shared by @${row.handle}.` : `@${row.handle} 分享的角色皮肤。`)).slice(0, 200);
  const self = `${url.origin}${en ? '/en' : ''}/u/${row.handle}`;
  return share(template, [
    ['title', { element: el => el.setInnerContent(title) }],
    set('meta[name="description"]', 'content', description),
    set('meta[property="og:title"]', 'content', title),
    set('meta[property="og:description"]', 'content', description),
    set('meta[property="og:url"]', 'content', self),
    ...(row.avatar ? [set('meta[property="og:image"]', 'content', `${url.origin}${avatarUrl(row)}`)] : []),
    set('link[rel="canonical"]', 'href', self),
    set('link[hreflang="zh-CN"]', 'href', `${url.origin}/u/${row.handle}`),
    set('link[hreflang="en"]', 'href', `${url.origin}/en/u/${row.handle}`),
    set('link[hreflang="x-default"]', 'href', `${url.origin}/u/${row.handle}`),
    set('meta[name="robots"]', 'content', 'index, follow'),
    ['h1.profile-name', { element: el => el.setInnerContent(row.name || `@${row.handle}`) }],
    lang,
  ]);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, ctx, url.pathname.slice(5).replace(/\/$/, ''));
    const detail = url.pathname.match(DETAIL);
    if (detail && (request.method === 'GET' || request.method === 'HEAD')) return detailPage(request, env, !!detail[1], detail[2]);
    const person = url.pathname.match(PROFILE);
    if (person && person[2] !== 'item' && (request.method === 'GET' || request.method === 'HEAD')) return profilePage(request, env, !!person[1], person[2]);
    return env.ASSETS.fetch(request);
  },
};

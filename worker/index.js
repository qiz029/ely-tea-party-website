// elyteaparty.com: static pages from dist/, plus the skin market's API and its per-skin pages.
import { HttpError, json, secure, sameOrigin } from './http.js';
import { authRoutes } from './auth.js';
import { skinRoutes } from './skins.js';

const DETAIL = /^\/(en\/)?skins\/([a-z0-9-]+\.[a-z0-9.-]+)\/?$/;

async function api(request, env, ctx, route) {
  try {
    sameOrigin(request);
    const response = (await authRoutes(request, env, route)) ?? (await skinRoutes(request, env, ctx, route));
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
  if (!row || row.status !== 'public') {
    const page = secure(new HTMLRewriter().on(...lang).transform(template));
    return new Response(page.body, { status: row ? 200 : 404, headers: page.headers });
  }
  const title = en ? `${row.name} by ${row.author} — Ely Tea Party skins` : `${row.name}（${row.author}）— Ely Tea Party 皮肤市场`;
  const description = (row.description || (en ? `A character skin for Ely Tea Party, shared by @${row.handle}.` : `@${row.handle} 分享的 Ely Tea Party 角色皮肤。`)).slice(0, 200);
  const type = JSON.parse(row.actions).idle.type.split('/')[1];
  const image = `${url.origin}/api/skins/${row.id}/img/${row.sha256.slice(0, 16)}/idle.${type}`;
  const self = `${url.origin}${en ? '/en' : ''}/skins/${row.id}`;
  const set = (selector, attr, value) => [selector, { element: el => el.setAttribute(attr, value) }];
  const rules = [
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
  ];
  let rewriter = new HTMLRewriter();
  for (const [selector, handler] of rules) rewriter = rewriter.on(selector, handler);
  return secure(rewriter.transform(template));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, ctx, url.pathname.slice(5).replace(/\/$/, ''));
    const detail = url.pathname.match(DETAIL);
    if (detail && (request.method === 'GET' || request.method === 'HEAD')) return detailPage(request, env, !!detail[1], detail[2]);
    return env.ASSETS.fetch(request);
  },
};

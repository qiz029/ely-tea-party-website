// The market's packs: list, read, download, upload, report, moderate.
import { HttpError, json, readJson, now, sha256, keyed, ip, limit } from './http.js';
import { currentUser, requireUser, isAdmin } from './auth.js';
import { readPack, PackError, MOST_DOCUMENT_BYTES } from './pack.js';

const PAGE = 24;
const HIDE_AFTER_REPORTS = 3;
const MOST_SKINS_PER_USER = 50;
const EXT = { 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
const ID = /^[a-z0-9][a-z0-9.-]{1,62}[a-z0-9]$/;

const folder = (id, sha) => `skins/${id}/${sha.slice(0, 16)}`;

// What a page shows about a skin; images by URL, never the pack's bytes.
function present(row, viewer, admin) {
  const actions = JSON.parse(row.actions);
  const base = `/api/skins/${row.id}/img/${row.sha256.slice(0, 16)}`;
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    description: row.description,
    license: row.license,
    homepage: row.homepage,
    target: row.target,
    kind: row.kind,
    uploader: row.handle,
    actions: Object.fromEntries(Object.entries(actions).map(([name, info]) => [name, { ...info, url: `${base}/${name}.${EXT[info.type]}` }])),
    skipped: JSON.parse(row.skipped),
    sha256: row.sha256,
    size: row.size,
    revision: row.revision,
    downloads: row.downloads,
    created: row.created,
    updated: row.updated,
    pack: `/api/skins/${row.id}/pack`,
    ...(viewer && (viewer.id === row.user_id || admin) ? { status: row.status, mine: viewer.id === row.user_id } : {}),
    ...(admin ? { reports: row.reports ?? 0 } : {}),
  };
}

const SELECT = 'SELECT s.*, u.handle, (SELECT count(*) FROM reports r WHERE r.skin_id = s.id) AS reports FROM skins s JOIN users u ON u.id = s.user_id';

async function load(env, id) {
  if (!ID.test(id)) return null;
  return env.DB.prepare(`${SELECT} WHERE s.id = ?`).bind(id).first();
}

// A visible skin, or 404; its owner and admins also see it hidden.
async function visible(request, env, id) {
  const row = await load(env, id);
  if (!row) throw new HttpError(404, 'no such skin', 'not_found');
  if (row.status === 'public') return { row };
  const viewer = await currentUser(request, env);
  if (viewer && (viewer.id === row.user_id || isAdmin(env, viewer))) return { row, viewer };
  throw new HttpError(404, 'no such skin', 'not_found');
}

async function list(request, env) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const sort = url.searchParams.get('sort') === 'popular' ? 'popular' : 'new';
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 64);
  const page = Math.max(0, Math.min(200, Number.parseInt(url.searchParams.get('page') ?? '0', 10) || 0));
  const where = ["s.status = 'public'"];
  const binds = [];
  if (kind === 'agent' || kind === 'whale') { where.push('s.kind = ?'); binds.push(kind); }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
    where.push("(s.name LIKE ? ESCAPE '\\' OR s.author LIKE ? ESCAPE '\\' OR u.handle LIKE ? ESCAPE '\\' OR s.description LIKE ? ESCAPE '\\')");
    binds.push(like, like, like, like);
  }
  const order = sort === 'popular' ? 's.downloads DESC, s.updated DESC' : 's.updated DESC';
  const { results } = await env.DB.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...binds, PAGE + 1, page * PAGE).all();
  return json({ skins: results.slice(0, PAGE).map(row => present(row)), more: results.length > PAGE }, 200, { 'Cache-Control': 'public, max-age=30' });
}

async function detail(request, env, id) {
  const { row, viewer } = await visible(request, env, id);
  const user = viewer ?? await currentUser(request, env);
  return json({ skin: present(row, user, isAdmin(env, user)) });
}

async function mine(request, env) {
  const user = await requireUser(request, env, { handle: false });
  const { results } = await env.DB.prepare(`${SELECT} WHERE s.user_id = ? ORDER BY s.updated DESC`).bind(user.id).all();
  return json({ skins: results.map(row => present(row, user, isAdmin(env, user))) });
}

async function pack(request, env, ctx, id) {
  const { row } = await visible(request, env, id);
  const object = await env.SKINS.get(`${folder(row.id, row.sha256)}/pack.elyskin`);
  if (!object) throw new HttpError(404, 'the pack file is missing', 'not_found');
  if (request.method === 'GET') ctx.waitUntil(env.DB.prepare('UPDATE skins SET downloads = downloads + 1 WHERE id = ?').bind(row.id).run());
  return new Response(request.method === 'HEAD' ? null : object.body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${row.id}.elyskin"`,
      'Content-Length': String(row.size),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Elyskin-Sha256': row.sha256,
    },
  });
}

async function image(request, env, id, sha, file) {
  const { row } = await visible(request, env, id);
  if (row.sha256.slice(0, 16) !== sha) throw new HttpError(404, 'this image was replaced', 'not_found');
  const [action, ext] = file.split('.');
  const info = JSON.parse(row.actions)[action];
  if (!info || EXT[info.type] !== ext) throw new HttpError(404, 'no such image', 'not_found');
  const object = await env.SKINS.get(`${folder(row.id, row.sha256)}/${action}.${ext}`);
  if (!object) throw new HttpError(404, 'no such image', 'not_found');
  return new Response(object.body, {
    headers: {
      'Content-Type': info.type,
      'Cache-Control': row.status === 'public' ? 'public, max-age=86400' : 'private, no-store',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function slug(name) {
  const ascii = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
  return ascii.length >= 2 ? ascii : Math.random().toString(36).slice(2, 8);
}

async function removeFiles(env, id, sha) {
  const prefix = sha ? `${folder(id, sha)}/` : `skins/${id}/`;
  for (let cursor; ;) {
    const listed = await env.SKINS.list({ prefix, cursor });
    if (listed.objects.length) await env.SKINS.delete(listed.objects.map(o => o.key));
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }
}

async function upload(request, env) {
  const user = await requireUser(request, env);
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MOST_DOCUMENT_BYTES) throw new HttpError(413, 'the pack is larger than 44 MiB', 'too_large');
  await limit(env, `upload:${user.id}`, 30, 86400, 'too many uploads today; try again tomorrow');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MOST_DOCUMENT_BYTES) throw new HttpError(413, 'the pack is larger than 44 MiB', 'too_large');
  let read;
  try { read = readPack(bytes); } catch (error) {
    if (error instanceof PackError) throw new HttpError(422, error.message, 'invalid_pack');
    throw error;
  }
  const replace = new URL(request.url).searchParams.get('replace');
  let id = read.meta.id ?? replace;
  let old = null;
  if (id) {
    if (!id.startsWith(`${user.handle}.`)) throw new HttpError(403, `this pack's id must start with "${user.handle}."`, 'foreign_id');
    if (!ID.test(id)) throw new HttpError(400, 'invalid skin id', 'bad_id');
    old = await load(env, id);
    if (old && old.user_id !== user.id) throw new HttpError(409, 'another account owns that id', 'foreign_id');
    if (replace && !old) throw new HttpError(404, 'no such skin to replace', 'not_found');
  } else {
    const base = `${user.handle}.${slug(read.meta.name)}`;
    id = base;
    for (let n = 2; await load(env, id); n++) id = `${base}-${n}`;
  }
  if (!old) {
    const { n } = await env.DB.prepare('SELECT count(*) AS n FROM skins WHERE user_id = ?').bind(user.id).first();
    if (n >= MOST_SKINS_PER_USER) throw new HttpError(403, `an account can publish at most ${MOST_SKINS_PER_USER} skins`, 'too_many');
  }
  const sha = await sha256(bytes);
  if (old && old.sha256 === sha) throw new HttpError(409, 'this exact pack is already published', 'unchanged');
  const dir = folder(id, sha);
  await env.SKINS.put(`${dir}/pack.elyskin`, bytes, { httpMetadata: { contentType: 'application/json' }, sha256: sha });
  const actions = {};
  for (const [name, info] of Object.entries(read.actions)) {
    await env.SKINS.put(`${dir}/${name}.${EXT[info.type]}`, info.bytes, { httpMetadata: { contentType: info.type } });
    actions[name] = { type: info.type, width: info.width, height: info.height, frames: info.frames, size: info.size };
  }
  const m = read.meta;
  const t = now();
  const values = [m.name, m.author, m.description ?? null, m.license ?? null, m.homepage ?? null, read.target, read.kind, JSON.stringify(actions), JSON.stringify(read.skipped), sha, bytes.length];
  try {
    if (old) {
      const done = await env.DB.prepare(`UPDATE skins SET name = ?, author = ?, description = ?, license = ?, homepage = ?, target = ?, kind = ?, actions = ?, skipped = ?, sha256 = ?, size = ?,
        revision = revision + 1, updated = ? WHERE id = ? AND user_id = ? AND sha256 = ?`).bind(...values, t, id, user.id, old.sha256).run();
      if (!done.meta.changes) throw new HttpError(409, 'the skin changed while uploading; try again', 'conflict');
    } else {
      await env.DB.prepare(`INSERT INTO skins (name, author, description, license, homepage, target, kind, actions, skipped, sha256, size, id, user_id, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values, id, user.id, t, t).run();
    }
  } catch (error) {
    await removeFiles(env, id, sha);
    if (error instanceof HttpError) throw error;
    if (/UNIQUE/.test(String(error))) throw new HttpError(409, 'that id was just taken; try again', 'conflict');
    throw error;
  }
  if (old) await removeFiles(env, id, old.sha256);
  return json({ skin: present(await load(env, id), user, isAdmin(env, user)) }, old ? 200 : 201);
}

async function remove(request, env, id) {
  const user = await requireUser(request, env, { handle: false });
  const row = await load(env, id);
  if (!row || (row.user_id !== user.id && !isAdmin(env, user))) throw new HttpError(404, 'no such skin', 'not_found');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reports WHERE skin_id = ?').bind(id),
    env.DB.prepare('DELETE FROM skins WHERE id = ?').bind(id),
  ]);
  await removeFiles(env, id);
  return json({ ok: true });
}

async function notifyAdmins(env, subject, text) {
  const admins = (env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  for (const to of admins) {
    try { await env.EMAIL.send({ from: { email: env.EMAIL_FROM, name: 'Ely Tea Party' }, to, subject, text }); } catch (error) { console.error('report: the admin mail failed', error); }
  }
}

async function report(request, env, ctx, id) {
  const { row } = await visible(request, env, id);
  const { reason } = await readJson(request);
  const text = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
  if (!text) throw new HttpError(400, 'say what is wrong with this skin', 'no_reason');
  const reporter = await keyed(env.SECRET, `report:${ip(request)}`);
  await limit(env, `report:${reporter}`, 10, 86400, 'too many reports today');
  const added = await env.DB.prepare('INSERT INTO reports (skin_id, reporter, reason, at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(id, reporter, text, now()).run();
  if (!added.meta.changes) return json({ ok: true, already: true });
  const { n } = await env.DB.prepare('SELECT count(*) AS n FROM reports WHERE skin_id = ?').bind(id).first();
  let hidden = false;
  if (n >= HIDE_AFTER_REPORTS && row.status === 'public') {
    hidden = (await env.DB.prepare("UPDATE skins SET status = 'hidden' WHERE id = ? AND status = 'public'").bind(id).run()).meta.changes > 0;
  }
  ctx.waitUntil(notifyAdmins(env, `[Ely skins] ${hidden ? 'Hidden after reports' : 'Report'}: ${row.name} (${id})`,
    `${row.name} by ${row.author}, uploaded by @${row.handle}\nReports: ${n}${hidden ? ' — now hidden until you restore it' : ''}\n\nReason:\n${text}\n\nhttps://elyteaparty.com/skins/${id}`));
  return json({ ok: true });
}

async function setStatus(request, env, id) {
  const user = await requireUser(request, env, { handle: false });
  if (!isAdmin(env, user)) throw new HttpError(403, 'only moderators can do that', 'forbidden');
  const { status } = await readJson(request);
  if (status !== 'public' && status !== 'hidden') throw new HttpError(400, 'status is public or hidden');
  const done = await env.DB.prepare('UPDATE skins SET status = ? WHERE id = ?').bind(status, id).run();
  if (!done.meta.changes) throw new HttpError(404, 'no such skin', 'not_found');
  if (status === 'public') await env.DB.prepare('DELETE FROM reports WHERE skin_id = ?').bind(id).run();
  return json({ ok: true });
}

export async function skinRoutes(request, env, ctx, route) {
  const m = route.match(/^skins(?:\/([a-z0-9.-]+)(?:\/(pack|report|status|img\/([0-9a-f]{16})\/([a-z0-9_-]+\.[a-z]+)))?)?$/);
  if (route === 'mine' && request.method === 'GET') return mine(request, env);
  if (!m) return null;
  const [, id, action, sha, file] = m;
  const method = request.method;
  if (!id) {
    if (method === 'GET') return list(request, env);
    if (method === 'POST') return upload(request, env);
  } else if (!action) {
    if (method === 'GET') return detail(request, env, id);
    if (method === 'DELETE') return remove(request, env, id);
  } else if (action === 'pack' && (method === 'GET' || method === 'HEAD')) return pack(request, env, ctx, id);
  else if (action === 'report' && method === 'POST') return report(request, env, ctx, id);
  else if (action === 'status' && method === 'POST') return setStatus(request, env, id);
  else if (sha && method === 'GET') return image(request, env, id, sha, file);
  throw new HttpError(405, 'method not allowed');
}

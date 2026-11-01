// /skins/ lists the market; /skins/<id> (the item template) shows one skin.
import { api, say, home, prefix, card, el, size, AGENT_ACTIONS, WHALE_ACTIONS } from '/market.js';

const main = document.querySelector('main');
const status = document.querySelector('#status');
const loading = status.textContent;
const show = text => { status.textContent = text; status.hidden = !text; };

async function browse() {
  const grid = document.querySelector('#skins');
  const more = document.querySelector('#more');
  const sort = document.querySelector('#sort');
  const search = document.querySelector('#search');
  const kinds = [...document.querySelectorAll('[data-kind]')];
  const params = new URLSearchParams(location.search);
  const state = { kind: params.get('kind') ?? '', sort: params.get('sort') === 'popular' ? 'popular' : 'new', q: params.get('q') ?? '', page: 0 };
  sort.value = state.sort;
  search.value = state.q;
  let ticket = 0;

  async function load(append) {
    const mine = ++ticket;
    if (!append) { state.page = 0; grid.replaceChildren(); show(loading); }
    more.hidden = true;
    for (const button of kinds) button.setAttribute('aria-pressed', String(button.dataset.kind === state.kind));
    const query = new URLSearchParams({ sort: state.sort, page: state.page });
    if (state.kind) query.set('kind', state.kind);
    if (state.q) query.set('q', state.q);
    const shown = new URLSearchParams(query);
    shown.delete('page');
    if (state.sort === 'new') shown.delete('sort');
    history.replaceState(null, '', shown.size ? `?${shown}` : location.pathname);
    try {
      const data = await api(`skins?${query}`);
      if (mine !== ticket) return;
      grid.append(...data.skins.map(card));
      show(grid.children.length ? '' : state.q ? say.noMatch : say.empty);
      more.hidden = !data.more;
    } catch (error) {
      if (mine === ticket) show(error.message);
    }
  }

  for (const button of kinds) button.addEventListener('click', () => { state.kind = button.dataset.kind; load(false); });
  sort.addEventListener('change', () => { state.sort = sort.value; load(false); });
  let typing;
  search.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => { state.q = search.value.trim(); load(false); }, 300); });
  more.addEventListener('click', () => { state.page += 1; load(true); });
  load(false);
}

function fact(term, ...value) {
  return [el('dt', {}, term), el('dd', {}, ...value)];
}

function tools(skin, id) {
  const box = document.querySelector('#tools');
  if (!skin.status) return;
  box.hidden = false;
  const note = el('span', { class: 'form-note', role: 'status' });
  const act = (label, run) => el('button', { type: 'button', class: 'button ghost small', onclick: async () => {
    try { await run(); } catch (error) { note.textContent = error.message; }
  } }, label);
  const admin = 'reports' in skin;
  box.replaceChildren(
    skin.status === 'hidden' ? el('p', { class: 'hidden-note' }, say.hidden) : null,
    admin ? el('p', { class: 'hint' }, say.reports(skin.reports)) : null,
    admin ? act(skin.status === 'hidden' ? say.restore : say.hide, async () => {
      await api(`skins/${id}/status`, { method: 'POST', body: { status: skin.status === 'hidden' ? 'public' : 'hidden' } });
      location.reload();
    }) : null,
    skin.mine ? el('a', { class: 'button ghost small', href: `${home}upload/?replace=${encodeURIComponent(id)}` }, say.update) : null,
    act(say.remove, async () => {
      if (!confirm(say.confirmRemove)) return;
      await api(`skins/${id}`, { method: 'DELETE' });
      location.href = skin.mine ? `${prefix}/u/${skin.uploader}` : home;
    }),
    note,
  );
}

async function item() {
  const id = decodeURIComponent(location.pathname.replace(/\/$/, '').split('/').pop());
  let skin;
  try {
    ({ skin } = await api(`skins/${encodeURIComponent(id)}`));
  } catch (error) {
    show(error.status === 404 ? say.notFound : error.message);
    return;
  }
  show('');
  document.title = document.title.replace(/^[^—]*/, `${skin.name} `);
  document.querySelector('.skin-name').textContent = skin.name;
  document.querySelector('#by').replaceChildren(say.by(skin.author), ' · ',
    el('a', { class: 'text-link', href: `${prefix}/u/${skin.uploader}` }, say.uploader(skin.uploader)));
  const desc = document.querySelector('#desc');
  desc.textContent = skin.description ?? '';
  desc.hidden = !skin.description;
  document.querySelector('#install').href = `elyteaparty://skin/${skin.id}`;
  const download = document.querySelector('#download');
  download.href = skin.pack;
  download.setAttribute('download', `${skin.id}.elyskin`);

  const known = skin.kind === 'whale' ? WHALE_ACTIONS : AGENT_ACTIONS;
  const drawn = known.filter(name => skin.actions[name]);
  const missing = known.length - drawn.length;
  const homepage = skin.homepage ? el('a', { class: 'text-link', href: skin.homepage, rel: 'noopener nofollow ugc', target: '_blank' }, new URL(skin.homepage).host) : null;
  document.querySelector('#facts').replaceChildren(
    ...fact(say.facts.target, say.madeFor(skin.target)),
    ...fact(say.facts.actions, `${drawn.length} / ${known.length}`, missing ? el('small', {}, ` · ${say.missing(missing)}`) : null),
    ...fact(say.facts.size, size(skin.size)),
    ...fact(say.facts.downloads, say.downloads(skin.downloads)),
    ...(skin.license ? fact(say.facts.license, skin.license) : []),
    ...(homepage ? fact(say.facts.homepage, homepage) : []),
    ...fact(say.facts.updated, say.date(skin.updated)),
    ...fact(say.facts.sha, el('code', { class: 'sha' }, skin.sha256)),
  );

  const stage = document.querySelector('#stage');
  const pick = name => {
    stage.src = skin.actions[name].url;
    stage.alt = `${skin.name} — ${say.actions[name] ?? name}`;
    for (const button of document.querySelectorAll('.pose-grid button')) button.setAttribute('aria-pressed', String(button.dataset.action === name));
  };
  document.querySelector('#pose-list').replaceChildren(...drawn.map(name => el('li', {},
    el('button', { type: 'button', 'data-action': name, 'aria-pressed': 'false', onclick: () => pick(name) },
      el('img', { src: skin.actions[name].url, alt: '', loading: 'lazy', width: '120', height: '120' }),
      el('span', {}, say.actions[name] ?? name),
      el('small', {}, `${skin.actions[name].width}×${skin.actions[name].height} · ${say.frames(skin.actions[name].frames)}`)))));
  pick('idle');
  document.querySelector('#detail').hidden = false;
  document.querySelector('#poses').hidden = false;
  tools(skin, skin.id);

  const form = document.querySelector('#report');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const note = form.querySelector('.form-note');
    try {
      const result = await api(`skins/${skin.id}/report`, { method: 'POST', body: { reason: form.reason.value } });
      note.textContent = result.already ? say.already : say.reported;
      form.reason.value = '';
    } catch (error) {
      note.textContent = error.message;
    }
  });
}

if (main.dataset.view === 'item') item(); else browse();

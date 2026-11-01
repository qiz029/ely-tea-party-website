// What the skin market's pages share: words, the API, skin cards.
export const english = document.documentElement.lang === 'en';
export const home = english ? '/en/skins/' : '/skins/';

const agents = { claude: 'Claude', gpt: 'GPT', deepseek: 'DeepSeek', grok: 'Grok', kimi: 'Kimi', gemini: 'Gemini', pi: 'Pi', opencode: 'OpenCode' };

export const say = english ? {
  by: author => `by ${author}`, uploader: handle => `shared by @${handle}`,
  kind: { agent: 'Agent', whale: 'Whale' },
  madeFor: target => target === 'whale' ? 'the whale' : `${agents[target] ?? target} (fits every agent)`,
  downloads: n => `${n.toLocaleString('en-US')} download${n === 1 ? '' : 's'}`,
  empty: 'No skins here yet. Be the first to share one!', noMatch: 'Nothing matches that search.',
  failed: 'The market could not be reached. Try again in a moment.', notFound: 'This skin doesn’t exist, or it was taken down.',
  facts: { target: 'Made for', actions: 'Actions', size: 'Size', downloads: 'Downloads', license: 'License', homepage: 'Homepage', updated: 'Updated', sha: 'SHA-256' },
  actions: { idle: 'Idle', calm: 'Resting', working: 'Working', 'working-research': 'Researching', 'working-special': 'Celebrating', 'working-slack': 'Taking a break', thinking: 'Thinking', needs_input: 'Waiting for input', sleeping: 'Sleeping', walking: 'Walking right', 'walking-left': 'Walking left', 'puzzled-up': 'Peeking up', 'puzzled-down': 'Peeking down' },
  missing: n => `${n} action${n === 1 ? '' : 's'} not drawn; the app shows idle for ${n === 1 ? 'it' : 'them'}`,
  hidden: 'Hidden: only you and moderators can see this skin.', hide: 'Hide', restore: 'Make public', remove: 'Delete', reports: n => `${n} report${n === 1 ? '' : 's'}`,
  confirmRemove: 'Delete this skin for good? Its download link stops working.', hiddenTag: 'Hidden', reported: 'Thanks. A moderator will take a look.', already: 'You already reported this skin.',
  frames: n => `${n} frame${n === 1 ? '' : 's'}`,
  date: s => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(s * 1000)),
} : {
  by: author => `作者 ${author}`, uploader: handle => `由 @${handle} 分享`,
  kind: { agent: 'Agent', whale: '鲸鱼娘' },
  madeFor: target => target === 'whale' ? '鲸鱼娘' : `${agents[target] ?? target}（可用于任意 Agent）`,
  downloads: n => `${n.toLocaleString('zh-CN')} 次下载`,
  empty: '这里还没有皮肤，来分享第一个吧！', noMatch: '没有找到符合的皮肤。',
  failed: '暂时连不上皮肤市场，请稍后再试。', notFound: '这个皮肤不存在，或者已经下架。',
  facts: { target: '适用', actions: '动作', size: '大小', downloads: '下载', license: '许可证', homepage: '主页', updated: '更新于', sha: 'SHA-256' },
  actions: { idle: '待机', calm: '静止', working: '工作', 'working-research': '研究', 'working-special': '特别动作', 'working-slack': '摸鱼', thinking: '思考', needs_input: '等待输入', sleeping: '睡觉', walking: '向右走', 'walking-left': '向左走', 'puzzled-up': '向上探头', 'puzzled-down': '向下探头' },
  missing: n => `有 ${n} 个动作没有画，App 里会用待机图代替`,
  hidden: '已隐藏：只有你和管理员能看到这个皮肤。', hide: '隐藏', restore: '公开', remove: '删除', reports: n => `${n} 次举报`,
  confirmRemove: '确定永久删除这个皮肤？下载链接会失效。', hiddenTag: '已隐藏', reported: '谢谢，管理员会尽快查看。', already: '你已经举报过这个皮肤了。',
  frames: n => `${n} 帧`,
  date: s => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(s * 1000)),
};

export const AGENT_ACTIONS = ['idle', 'working', 'working-research', 'working-special', 'working-slack', 'thinking', 'needs_input', 'sleeping'];
export const WHALE_ACTIONS = ['idle', 'calm', 'working', 'working-special', 'working-slack', 'thinking', 'needs_input', 'sleeping', 'walking', 'walking-left', 'puzzled-up', 'puzzled-down'];

// The API answers in English; the Chinese page says the common ones in Chinese. Pack problems stay as they are.
const zhErrors = {
  bad_email: '请输入有效的邮箱地址。', rate_limited: '操作太频繁了，请稍后再试。', mail_failed: '验证码暂时发不出去，请稍后再试。',
  bad_code: '验证码不对，或者已经过期。', bad_handle: '用户名只能用 2 到 24 个小写字母、数字和“-”，开头和结尾不能是“-”。',
  handle_taken: '这个用户名已经被用了。', handle_set: '你已经设置过用户名了。', no_handle: '请先设置用户名。', signed_out: '请先登录。',
  banned: '这个账号不能上传。', too_large: '角色包最大 44 MiB。', foreign_id: '这个角色包的 ID 属于别的账号，或者没有以你的用户名开头。',
  unchanged: '这个角色包和已发布的版本完全一样。', too_many: '每个账号最多发布 50 个皮肤。', not_found: '这个皮肤不存在，或者已经下架。',
  no_reason: '请写一下举报原因。', forbidden: '只有管理员能这样做。', conflict: '刚才有冲突，请再试一次。', internal: '服务器出错了，请稍后再试。',
};

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export async function api(path, { method = 'GET', body, raw } = {}) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (raw) { init.body = raw; init.headers['Content-Type'] = 'application/json'; }
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  let response;
  try { response = await fetch(`/api/${path}`, init); } catch { throw new ApiError(0, say.failed, 'offline'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, (!english && zhErrors[data.code]) || data.error || say.failed, data.code);
  return data;
}

export const size = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.flat().filter(c => c !== null && c !== undefined && c !== false));
  return node;
}

export function card(skin) {
  return el('li', { class: 'skin-card' },
    el('a', { href: `${home}${skin.id}` },
      el('div', { class: 'skin-art' }, el('img', { src: skin.actions.idle.url, alt: '', loading: 'lazy', decoding: 'async', width: '160', height: '160' })),
      el('b', { class: 'skin-card-name' }, skin.name),
      el('span', { class: 'skin-card-by' }, say.by(skin.author)),
      el('span', { class: 'skin-card-meta' },
        el('span', { class: `tag ${skin.kind}` }, say.kind[skin.kind]),
        skin.status === 'hidden' ? el('span', { class: 'tag hidden' }, say.hiddenTag) : null,
        el('span', {}, say.downloads(skin.downloads))),
    ));
}

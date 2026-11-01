// The market's reader for .elyskin version 2, the rules of ELYTerminal docs/elyskin.md. It walks the bytes
// itself so a 44 MiB pack never becomes one big string, and so a key repeated in any object is refused.
import { inspect, ImageError } from './images.js';

export const MOST_DOCUMENT_BYTES = 44 * 1024 * 1024;
const MOST_PACK_IMAGE_BYTES = 32 * 1024 * 1024;
const MOST_ENTRIES = 64;
const MOST_DEPTH = 32;

export const AGENT_ACTIONS = ['idle', 'working', 'working-research', 'working-special', 'working-slack', 'thinking', 'needs_input', 'sleeping'];
export const WHALE_ACTIONS = ['idle', 'calm', 'working', 'working-special', 'working-slack', 'thinking', 'needs_input', 'sleeping', 'walking', 'walking-left', 'puzzled-up', 'puzzled-down'];

export class PackError extends Error {}
const fail = message => { throw new PackError(message); };

// A string the reader left as bytes: an image's base64.
class Slice {
  constructor(bytes, start, end, escaped) { Object.assign(this, { bytes, start, end, escaped }); }
}

const decoder = new TextDecoder('utf-8', { fatal: true });

function parse(bytes) {
  let at = 0;
  const space = () => { while (at < bytes.length && (bytes[at] === 0x20 || bytes[at] === 0x0a || bytes[at] === 0x0d || bytes[at] === 0x09)) at++; };
  const expect = byte => { if (bytes[at] !== byte) fail(`invalid JSON at byte ${at}`); at++; };

  function string(keep) {
    expect(0x22);
    const start = at;
    let escaped = false;
    for (;;) {
      if (at >= bytes.length) fail('invalid JSON: a string never ends');
      const c = bytes[at];
      if (c === 0x22) break;
      if (c < 0x20) fail(`invalid JSON: a control character in a string at byte ${at}`);
      if (c === 0x5c) { escaped = true; at += 2; } else at++;
    }
    const end = at++;
    if (keep) return new Slice(bytes, start, end, escaped);
    let text;
    try { text = decoder.decode(bytes.subarray(start, end)); } catch { fail('the pack is not UTF-8'); }
    if (escaped) {
      try { text = JSON.parse(`"${text}"`); } catch { fail(`invalid JSON escape in a string at byte ${start}`); }
      if (!text.isWellFormed()) fail(`a lone surrogate in a string at byte ${start}`);
    }
    return text;
  }

  function number() {
    const start = at;
    while (at < bytes.length && /[-+.eE0-9]/.test(String.fromCharCode(bytes[at]))) at++;
    const raw = String.fromCharCode(...bytes.subarray(start, at));
    if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$/.test(raw)) fail(`invalid JSON number at byte ${start}`);
    return { raw, value: Number(raw) };
  }

  function word(text, value) {
    for (let i = 0; i < text.length; i++) if (bytes[at + i] !== text.charCodeAt(i)) fail(`invalid JSON at byte ${at}`);
    at += text.length;
    return value;
  }

  // `images` is true for the images object, whose values stay as bytes.
  function value(depth, images) {
    if (depth > MOST_DEPTH) fail('the pack nests too deeply');
    space();
    const c = bytes[at];
    if (c === 0x7b) {
      at++;
      const out = Object.create(null);
      space();
      if (bytes[at] === 0x7d) { at++; return out; }
      for (;;) {
        space();
        const key = string(false);
        if (Object.hasOwn(out, key)) fail(`the key "${key}" appears twice`);
        space();
        expect(0x3a);
        space();
        out[key] = images ? (bytes[at] === 0x22 ? string(true) : fail(`images.${key} must be a string`))
          : value(depth + 1, depth === 0 && key === 'images');
        space();
        if (bytes[at] === 0x2c) { at++; continue; }
        expect(0x7d);
        return out;
      }
    }
    if (c === 0x5b) {
      at++;
      const out = [];
      space();
      if (bytes[at] === 0x5d) { at++; return out; }
      for (;;) {
        out.push(value(depth + 1, false));
        space();
        if (bytes[at] === 0x2c) { at++; continue; }
        expect(0x5d);
        return out;
      }
    }
    if (c === 0x22) return string(false);
    if (c === 0x74) return word('true', true);
    if (c === 0x66) return word('false', false);
    if (c === 0x6e) return word('null', null);
    return number();
  }

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('the pack starts with a byte order mark');
  const root = value(0, false);
  space();
  if (at !== bytes.length) fail('invalid JSON: text after the document');
  return root;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(256).fill(-1);
for (let i = 0; i < 64; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

// Standard base64 with padding and no line breaks, canonical as the app's decoder wants it.
function base64(slice) {
  let src = slice.bytes.subarray(slice.start, slice.end);
  if (slice.escaped) {
    try { src = new TextEncoder().encode(JSON.parse(`"${decoder.decode(src)}"`)); } catch { fail('an image is not standard base64'); }
  }
  if (src.length % 4) fail('an image is not padded base64');
  if (src.length > Math.ceil(8 * 1024 * 1024 / 3) * 4) fail('an image is larger than 8 MiB');
  const pad = src.length && src[src.length - 1] === 0x3d ? (src[src.length - 2] === 0x3d ? 2 : 1) : 0;
  const out = new Uint8Array(src.length / 4 * 3 - pad);
  let o = 0;
  for (let i = 0; i < src.length; i += 4) {
    const last = i + 4 === src.length;
    const a = LOOKUP[src[i]], b = LOOKUP[src[i + 1]];
    const c = last && pad === 2 ? 0 : LOOKUP[src[i + 2]];
    const d = last && pad >= 1 ? 0 : LOOKUP[src[i + 3]];
    if ((a | b | c | d) < 0) fail('an image is not standard base64');
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = n >> 16;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
    if (last && ((pad === 1 && (c & 3)) || (pad === 2 && (b & 15)))) fail('an image is not canonical base64');
  }
  return out;
}

const bidi = /[؜‎‏‪-‮⁦-⁩]/;
function text(field, value, most, lines) {
  if (typeof value !== 'string') fail(`meta.${field} must be text`);
  if ([...value].length > most) fail(`meta.${field} is longer than ${most} characters`);
  // eslint-disable-next-line no-control-regex
  const controls = lines ? /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/ : /[\u0000-\u001F\u007F-\u009F]/;
  if (controls.test(value) || bidi.test(value)) fail(`meta.${field} holds a control or bidirectional character`);
}
function line(field, value, most) {
  text(field, value, most, false);
  if (!value.trim() || value.trim() !== value) fail(`meta.${field} must be non-empty, without leading or trailing spaces`);
}
const optional = value => value !== undefined && value !== null;

function checkMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) fail('the pack has no meta');
  line('name', meta.name, 64);
  line('author', meta.author, 64);
  const out = { name: meta.name, author: meta.author };
  if (optional(meta.id)) {
    if (typeof meta.id !== 'string' || !/^[a-z0-9][a-z0-9.-]{1,62}[a-z0-9]$/.test(meta.id)) fail('meta.id must be 3 to 64 of a-z, 0-9, "." and "-", starting and ending with a letter or digit');
    out.id = meta.id;
  }
  if (optional(meta.description)) { text('description', meta.description, 500, true); out.description = meta.description; }
  if (optional(meta.license)) {
    line('license', meta.license, 64);
    if (!/^[A-Za-z0-9 .+\-()]+$/.test(meta.license)) fail('meta.license must be an SPDX expression');
    out.license = meta.license;
  }
  if (optional(meta.homepage)) {
    const h = meta.homepage;
    if (typeof h !== 'string' || new TextEncoder().encode(h).length > 200 || !h.startsWith('https://') || h.length <= 8 || /[\s\u0000-\u001F\u007F-\u009F]/.test(h)) fail('meta.homepage must be an https URL of at most 200 bytes');
    out.homepage = h;
  }
  return out;
}

function checkLayout(layout) {
  const out = { scale: 1, x: 0, y: 0 };
  if (!optional(layout)) return out;
  if (typeof layout !== 'object' || Array.isArray(layout)) fail('layout must be an object');
  for (const [key, low, high] of [['scale', 0.5, 1], ['x', -30, 30], ['y', -30, 30]]) {
    if (!optional(layout[key])) continue;
    const n = layout[key]?.value;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < low || n > high) fail(`layout.${key} must be from ${low} to ${high}`);
    out[key] = n;
  }
  return out;
}

// Everything the market keeps about a pack: its credits, its kind and each action's image, checked.
export function readPack(bytes) {
  if (bytes.length > MOST_DOCUMENT_BYTES) fail('the pack is larger than 44 MiB');
  const doc = parse(bytes);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('the pack is not a JSON object');
  if (doc.format !== 'elyskin') fail('format must be "elyskin"');
  if (doc.version?.raw !== '2') fail(doc.version?.raw === '1' ? 'version 1 packs are not accepted; export the skin again from Ely Tea Party 0.3.17 or later' : 'version must be 2');
  if (typeof doc.target !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(doc.target)) fail('target is not a valid character id');
  const meta = checkMeta(doc.meta);
  const layout = checkLayout(doc.layout);
  const images = doc.images;
  if (!images || typeof images !== 'object' || Array.isArray(images)) fail('the pack has no images');
  const names = Object.keys(images);
  if (names.length > MOST_ENTRIES) fail('the pack has more than 64 actions');
  if (!names.includes('idle')) fail('the pack has no idle image');
  const kind = doc.target === 'whale' ? 'whale' : 'agent';
  const known = kind === 'whale' ? WHALE_ACTIONS : AGENT_ACTIONS;
  const actions = {};
  const skipped = [];
  let total = 0;
  for (const name of names) {
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) fail(`"${name}" is not a valid action name`);
    const image = base64(images[name]);
    total += image.length;
    if (total > MOST_PACK_IMAGE_BYTES) fail('the images come to more than 32 MiB');
    let info;
    try { info = inspect(image); } catch (error) {
      if (error instanceof ImageError) fail(`the ${name} image ${error.message}`);
      throw error;
    }
    if (known.includes(name)) actions[name] = { bytes: image, ...info };
    else skipped.push(name);
  }
  return { target: doc.target, kind, meta, layout, actions, skipped };
}

// What an .elyskin image is, read from its headers: the format, canvas and frame count the app's decoder
// (ELYTerminal src/skins/decode.rs) would check. Pixels are not decoded; the app decodes every frame on install.

export const MOST_IMAGE_BYTES = 8 * 1024 * 1024;
const MOST_SIDE = 2048;
const MOST_FRAMES = 240;
const MOST_FRAME_BYTES = 128 * 1024 * 1024;

const TYPES = { png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

const u32be = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));

class ImageError extends Error {}
const fail = message => { throw new ImageError(message); };

function png(b) {
  if (b.length < 33 || ascii(b, 12, 4) !== 'IHDR') fail('a PNG without its header');
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  let frames = 1;
  let at = 8;
  let ended = false;
  let seenData = false;
  while (at + 12 <= b.length) {
    const length = u32be(b, at);
    const type = ascii(b, at + 4, 4);
    if (at + 12 + length > b.length) fail('a PNG chunk runs past the end');
    if (type === 'acTL' && !seenData) {
      if (length < 8) fail('a damaged APNG header');
      frames = u32be(b, at + 8);
    }
    if (type === 'IDAT') seenData = true;
    if (type === 'IEND') { ended = true; break; }
    at += 12 + length;
  }
  if (!ended || !seenData) fail('a PNG cut short');
  return { width, height, frames };
}

function skipSubBlocks(b, at) {
  for (;;) {
    if (at >= b.length) fail('a GIF cut short');
    const size = b[at];
    at += 1 + size;
    if (size === 0) return at;
  }
}

function gif(b) {
  if (b.length < 13) fail('a GIF without its header');
  const width = u16le(b, 6);
  const height = u16le(b, 8);
  let at = 13;
  if (b[10] & 0x80) at += 3 * (2 << (b[10] & 7));
  let frames = 0;
  for (;;) {
    if (at >= b.length) fail('a GIF cut short');
    const kind = b[at];
    if (kind === 0x3b) break;
    if (kind === 0x21) {
      at = skipSubBlocks(b, at + 2);
    } else if (kind === 0x2c) {
      if (at + 10 > b.length) fail('a GIF cut short');
      const flags = b[at + 9];
      at += 10;
      if (flags & 0x80) at += 3 * (2 << (flags & 7));
      at = skipSubBlocks(b, at + 1);
      frames += 1;
      if (frames > MOST_FRAMES) break;
    } else {
      fail('a damaged GIF block');
    }
  }
  return { width, height, frames };
}

function webp(b) {
  if (b.length < 20 || ascii(b, 8, 4) !== 'WEBP') fail('a WebP without its header');
  if (u32le(b, 4) + 8 > b.length) fail('a WebP cut short');
  const end = Math.min(b.length, u32le(b, 4) + 8);
  let width = 0;
  let height = 0;
  let frames = 0;
  let animated = false;
  let at = 12;
  while (at + 8 <= end) {
    const type = ascii(b, at, 4);
    const size = u32le(b, at + 4);
    const data = at + 8;
    if (data + size > end) fail('a WebP chunk runs past the end');
    if (type === 'VP8X' && at === 12) {
      if (size < 10) fail('a damaged WebP header');
      animated = (b[data] & 0x02) !== 0;
      width = u24le(b, data + 4) + 1;
      height = u24le(b, data + 7) + 1;
    } else if (type === 'ANMF') {
      frames += 1;
    } else if ((type === 'VP8 ' || type === 'VP8L') && at === 12) {
      if (type === 'VP8 ') {
        if (size < 10 || b[data + 3] !== 0x9d || b[data + 4] !== 0x01 || b[data + 5] !== 0x2a) fail('a damaged WebP image');
        width = u16le(b, data + 6) & 0x3fff;
        height = u16le(b, data + 8) & 0x3fff;
      } else {
        if (size < 5 || b[data] !== 0x2f) fail('a damaged WebP image');
        const bits = u32le(b, data + 1);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
      }
      frames = 1;
    }
    at = data + size + (size & 1);
  }
  if (animated && frames === 0) fail('an animated WebP without frames');
  if (!animated && frames === 0) frames = 1;
  return { width, height, frames };
}

// The format, MIME type and size of `bytes`, or an ImageError naming what breaks the pack's rules.
export function inspect(bytes) {
  if (bytes.length > MOST_IMAGE_BYTES) fail('is larger than 8 MiB');
  const b = bytes;
  let format;
  if (b.length >= 8 && u32be(b, 0) === 0x89504e47 && u32be(b, 4) === 0x0d0a1a0a) format = 'png';
  else if (b.length >= 6 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')) format = 'gif';
  else if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') format = 'webp';
  else fail('is not a PNG, GIF or WebP image');
  const { width, height, frames } = { png, gif, webp }[format](b);
  if (width < 1 || height < 1 || width > MOST_SIDE || height > MOST_SIDE) fail(`is ${width} × ${height}; each side must be 1 to 2048 pixels`);
  if (frames < 1) fail('has no frames');
  if (frames > MOST_FRAMES) fail('has more than 240 frames');
  if (frames * width * height * 4 > MOST_FRAME_BYTES) fail('holds more than 128 MiB of frame pixels');
  return { format, type: TYPES[format], width, height, frames, size: b.length };
}

export { ImageError };

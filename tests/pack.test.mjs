// The market's pack reader against packs built from the app's own character art.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPack, PackError, AGENT_ACTIONS } from '../worker/pack.js';
import { inspect } from '../worker/images.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.env.ELY_REPO ?? path.join(root, '..', '..', 'ELYTerminal'));
const art = name => readFileSync(path.join(repo, 'assets', name));

export function makePack({ target = 'claude', meta = { name: 'Blue Otter', author: 'Tester' }, images, extra = {} } = {}) {
  images ??= Object.fromEntries(AGENT_ACTIONS.map(a => [a, art(`agents/claude-${a}.webp`).toString('base64')]));
  return { format: 'elyskin', version: 2, target, meta, layout: { scale: 1, x: 0, y: 0 }, images, ...extra };
}
const bytes = doc => new TextEncoder().encode(typeof doc === 'string' ? doc : JSON.stringify(doc));
const refused = (doc, pattern) => assert.throws(() => readPack(bytes(doc)), e => e instanceof PackError && pattern.test(e.message));

test('every built-in character image passes', () => {
  for (const dir of ['agents', 'mascot']) {
    for (const file of readdirSync(path.join(repo, 'assets', dir)).filter(f => f.endsWith('.webp'))) {
      const info = inspect(art(`${dir}/${file}`));
      assert.equal(info.format, 'webp', file);
      assert.ok(info.frames >= 1 && info.width <= 2048, file);
    }
  }
});

test('a full agent pack reads with every action', () => {
  const read = readPack(bytes(makePack({ extra: { 'x-tool': { a: 1 } } })));
  assert.equal(read.kind, 'agent');
  assert.deepEqual(Object.keys(read.actions).sort(), [...AGENT_ACTIONS].sort());
  assert.equal(read.meta.name, 'Blue Otter');
  assert.ok(read.actions.idle.frames > 1, 'the idle clip is animated');
});

test('a whale pack is a mascot pack', () => {
  const idle = art('mascot/whale-idle.webp').toString('base64');
  const read = readPack(bytes(makePack({ target: 'whale', images: { idle, 'puzzled-up': idle } })));
  assert.equal(read.kind, 'whale');
  assert.deepEqual(Object.keys(read.actions).sort(), ['idle', 'puzzled-up']);
});

test('unknown actions are skipped, invalid names refused', () => {
  const idle = art('agents/claude-idle.webp').toString('base64');
  assert.deepEqual(readPack(bytes(makePack({ images: { idle, dancing: idle } }))).skipped, ['dancing']);
  refused(makePack({ images: { idle, Dancing: idle } }), /not a valid action/);
});

test('structure is refused as the spec says', () => {
  const idle = art('agents/claude-idle.webp').toString('base64');
  refused({ ...makePack(), version: 1 }, /version 1/);
  refused({ ...makePack(), version: 3 }, /version must be 2/);
  refused({ ...makePack(), format: 'skin' }, /format/);
  refused(makePack({ images: { working: idle } }), /no idle/);
  refused(makePack({ meta: { name: ' x', author: 'a' } }), /meta.name/);
  refused(makePack({ meta: { name: 'x‮', author: 'a' } }), /bidirectional/);
  refused(makePack({ meta: { name: 'x', author: 'a', homepage: 'http://a.b' } }), /homepage/);
  refused(makePack({ meta: { name: 'x', author: 'a', id: 'A.b' } }), /meta.id/);
  refused({ ...makePack(), layout: { scale: 2 } }, /layout.scale/);
  refused(`{"format":"elyskin","version":2,"target":"claude","meta":{"name":"a","author":"b"},"images":{"idle":"${idle}","idle":"${idle}"}}`, /appears twice/);
  refused(`{"format":"elyskin","format":"elyskin","version":2,"target":"claude","meta":{"name":"a","author":"b"},"images":{"idle":"${idle}"}}`, /appears twice/);
  refused('﻿' + JSON.stringify(makePack()), /byte order mark/);
  refused(JSON.stringify(makePack()) + 'x', /after the document/);
});

test('images must be real, canonical and within limits', () => {
  refused(makePack({ images: { idle: 'aGVsbG8=' } }), /not a PNG, GIF or WebP/);
  refused(makePack({ images: { idle: 'aGVsbG8' } }), /padded/);
  refused(makePack({ images: { idle: 'aGVsbG9=' } }), /canonical/);
  refused(makePack({ images: { idle: 'aGVs\nbG8=' } }), /base64/);
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  assert.deepEqual(readPack(bytes(makePack({ images: { idle: gif.toString('base64') } }))).actions.idle.frames, 1);
  const huge = Buffer.from(gif);
  huge.writeUInt16LE(4096, 6);
  refused(makePack({ images: { idle: huge.toString('base64') } }), /1 to 2048/);
});

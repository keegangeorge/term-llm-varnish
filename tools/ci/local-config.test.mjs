import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Load the real util.js with the few browser globals it touches at import time.
const BASE = 'https://hub.test/node/alakazam/extensions/gen/varnish/util.js';
const storage = new Map();
globalThis.localStorage = {
  get length() { return storage.size; },
  key: (index) => [...storage.keys()][index] ?? null,
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.location = { pathname: '/node/alakazam/' };
globalThis.document = { documentElement: {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
let served = null;
globalThis.fetch = async () =>
  served === null
    ? { ok: false, status: 404, text: async () => '' }
    : { ok: true, status: 200, text: async () => served };

const source = fs
  .readFileSync(new URL('../../util.js', import.meta.url), 'utf8')
  .replaceAll('import.meta.url', JSON.stringify(BASE));
const util = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const KEY = 'term-llm:varnish:local-config';

test('applies the last local.json before the request answers', async () => {
  storage.set(KEY, JSON.stringify({ nodeAccents: { alakazam: 'purple' } }));
  served = storage.get(KEY);
  const fresh = util.loadLocalConfig();
  assert.equal(util.nodeAccent('alakazam'), 'purple');
  assert.equal(await fresh, false);
});

test('applies and remembers an edited local.json', async () => {
  storage.set(KEY, JSON.stringify({ nodeAccents: { alakazam: 'purple' } }));
  served = JSON.stringify({ nodeAccents: { alakazam: 'green' }, nodeImages: { alakazam: 'local/a.png' } });
  const fresh = util.loadLocalConfig();
  assert.equal(util.nodeAccent('alakazam'), 'purple');
  assert.equal(await fresh, true);
  assert.equal(util.nodeAccent('alakazam'), 'green');
  assert.equal(util.NODE_IMAGES.alakazam, 'url("https://hub.test/node/alakazam/extensions/gen/varnish/local/a.png")');
  assert.equal(storage.get(KEY), served);
});

test('a removed local.json clears the remembered settings', async () => {
  storage.set(KEY, JSON.stringify({ nodeAccents: { alakazam: 'green' } }));
  served = null;
  assert.equal(await util.loadLocalConfig(), true);
  assert.equal(util.nodeAccent('alakazam'), 'indigo');
  assert.equal(storage.has(KEY), false);
});

test('keeps the remembered settings when the request fails', async () => {
  storage.set(KEY, JSON.stringify({ nodeAccents: { alakazam: 'orange' } }));
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    assert.equal(await util.loadLocalConfig(), false);
    assert.equal(util.nodeAccent('alakazam'), 'orange');
    assert.equal(storage.has(KEY), true);
  } finally {
    globalThis.fetch = original;
  }
});

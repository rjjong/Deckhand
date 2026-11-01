import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { openStorage } from '../server/storage.mjs';
import { createApp } from '../server/app.mjs';
import { createDataCache } from '../server/data.mjs';
import { handle as sync } from '../netlify/functions/sync.mjs';
import { downloadSample, SAMPLE_NAMES } from '../scripts/download-data.mjs';

const code = 'TEST1234567890123456';
async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(), 'deckhand-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('SQLite persists across restart and conditional writes reject stale versions', async t => {
  const path = join(await temporary(t), 'test.sqlite');
  let db = openStorage(path), store = db.store('test');
  await store.setJSON('key', { value: 1 }, { onlyIfNew: true, metadata: { rev: 1 } });
  const old = await store.getWithMetadata('key');
  assert.equal((await store.setJSON('key', { value: 9 }, { onlyIfNew: true })).modified, false);
  assert.equal((await store.setJSON('key', { value: 2 }, { onlyIfMatch: old.etag, metadata: { rev: 2 } })).modified, true);
  assert.equal((await store.setJSON('key', { value: 3 }, { onlyIfMatch: old.etag })).modified, false);
  db.close();
  db = openStorage(path);
  t.after(() => db.close());
  store = db.store('test');
  assert.deepEqual(await store.get('key'), { value: 2 });
  assert.equal((await store.getMetadata('key')).metadata.rev, 2);
  assert.equal(await db.store('other').get('key'), null);
});

test('sync retries concurrent writes and preserves newer values and deletion tombstones', async t => {
  const db = openStorage(':memory:');
  t.after(() => db.close());
  const ctx = { store: db.store('deckhand-sync') };
  // No more than five overlapping writers: the existing handler retries five times.
  const results = await Promise.all(Array.from({ length: 4 }, (_, i) => sync({
    op: 'sync', code, changes: { ['deck' + i]: { t: i + 1, v: 'value' + i } }
  }, ctx)));
  assert.ok(results.every(r => r.status === 200));
  let result = await sync({ op: 'sync', code, since: 0 }, ctx);
  assert.equal(Object.keys(result.json.changes).length, 4);
  assert.equal(result.json.rev, 4);
  await sync({ op: 'sync', code, changes: { deck0: { t: 20, del: 1 } } }, ctx);
  await sync({ op: 'sync', code, changes: { deck0: { t: 10, v: 'stale' } } }, ctx);
  result = await sync({ op: 'sync', code, since: 4 }, ctx);
  assert.deepEqual(result.json.changes.deck0, { t: 20, del: 1 });
  const invalid = JSON.parse('{"__proto__":{"t":50,"v":"bad"},"constructor":{"t":50,"v":"bad"}}');
  await sync({ op: 'sync', code, changes: invalid }, ctx);
  result = await sync({ op: 'sync', code, since: 0 }, ctx);
  assert.equal(Object.hasOwn(result.json.changes, '__proto__'), false);
  assert.equal(Object.hasOwn(result.json.changes, 'constructor'), false);
});

test('sync paginates large documents without losing the remaining entries', async t => {
  const db = openStorage(':memory:');
  t.after(() => db.close());
  const ctx = { store: db.store('deckhand-sync') };
  const value = 'x'.repeat(2_000_000);
  await sync({ op: 'sync', code, changes: { a: { t: 1, v: value }, b: { t: 2, v: value } } }, ctx);
  const first = await sync({ op: 'sync', code, since: 0 }, ctx);
  assert.deepEqual(Object.keys(first.json.changes), ['a']);
  assert.ok(first.json.more);
  const second = await sync({ op: 'sync', code, since: 0, after: first.json.more }, ctx);
  assert.deepEqual(Object.keys(second.json.changes), ['b']);
  assert.equal(second.json.more, null);
  assert.equal(second.json.rev, first.json.rev);
});

test('sample download is bounded and local data requests never download bulk files', async t => {
  const directory = await temporary(t);
  let calls = 0;
  const result = await downloadSample({ directory, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.scryfall.com/cards/collection');
    assert.equal(JSON.parse(options.body).identifiers.length, 30);
    return Response.json({ data: [{ id: 'test-id', oracle_id: 'test-oracle', name: 'Sol Ring',
      type_line: 'Artifact', mana_cost: '{1}', cmc: 1, oracle_text: '{T}: Add {C}{C}.' }] });
  } });
  assert.equal(SAMPLE_NAMES.length, 30);
  assert.equal(calls, 1);
  assert.equal(result.count, 1);
  assert.ok(result.storedBytes < 2048);
  assert.equal(JSON.parse(gunzipSync(await readFile(join(directory, 'oracle-slim.jsonl.gz'))).toString()).n, 'Sol Ring');
  const cache = createDataCache({ directory });
  assert.equal(JSON.parse(await readFile(await cache.get('bulk-meta.json'), 'utf8')).sample, true);
  await assert.rejects(cache.get('arthash.tsv.gz'), { code: 'ENOENT' });
  await assert.rejects(cache.get('../.env'));
  await assert.rejects(downloadSample({ directory, fetchImpl: async () => new Response('x'.repeat(512 * 1024 + 1)) }), /download limit/);
});

test('HTTP serves the frontend, protects source/secrets, and supports legacy and new API routes', async t => {
  const directory = await temporary(t);
  const compressed = gzipSync('{"name":"Test Card"}\n');
  await writeFile(join(directory, 'oracle-slim.jsonl.gz'), compressed);
  const app = createApp({ databasePath: join(directory, 'app.sqlite'), dataDirectory: directory,
    env: { DATA_SOURCE_URL: '' } });
  await new Promise((done, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', done);
  });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (path, value, headers = {}) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value)
  });
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /runtime-config.js/);
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const path of ['/.env', '/.git/config', '/server/storage.mjs', '/package.json', '/var/app.sqlite', '/Deckhand.apk', '/api/constructor']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const runtime = await (await fetch(base + '/runtime-config.js')).text();
  assert.match(runtime, /"selfHosted":true/);
  assert.match(runtime, /"scryfallBase":"\/api\/scryfall"/);
  assert.match(runtime, /oracle-slim.jsonl.gz/);
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { ok: true, storage: 'sqlite' });
  assert.equal((await fetch(base + '/api/sync')).status, 405);
  assert.equal((await post('/api/sync', null)).status, 400);
  assert.equal((await post('/api/sync', { code, op: 'probe' }, { origin: 'https://another.invalid' })).status, 403);
  assert.equal((await post('/api/sync', { op: 'probe', code: 'short' })).status, 400);
  let response = await post('/.netlify/functions/sync', { op: 'sync', code, changes: { deck: { t: 1, v: 'saved' } } });
  assert.equal(response.status, 200);
  response = await post('/api/sync', { op: 'sync', code, since: 0 });
  assert.deepEqual((await response.json()).changes.deck, { t: 1, v: 'saved' });
  response = await post('/api/judge', { q: 'Can this card attack?' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'nokey');
  assert.equal((await post('/api/push-subscribe', {})).status, 501);
  response = await fetch(base + '/oracle-slim.jsonl.gz');
  assert.equal(response.headers.get('content-type'), 'application/gzip');
  assert.equal(response.headers.get('content-encoding'), null);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), compressed);
  assert.equal((await fetch(base + '/rulings-slim.jsonl.gz')).status, 404);
});

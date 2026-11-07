import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { openStorage } from '../server/storage.mjs';
import { createApp } from '../server/app.mjs';
import { createDataCache } from '../server/data.mjs';
import { handle as sync } from '../server/services/sync.mjs';
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

test('sync commits concurrent writes and retains deletion tombstones', async t => {
  const db = openStorage(':memory:');
  t.after(() => db.close());
  const ctx = { sync: db.sync };
  const code = (await sync({ op: 'create' }, ctx)).json.code;
  const value = id => JSON.stringify({ id, name: id, cards: [] });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => sync({
    op: 'sync', code, changes: { ['deck:' + i]: { t: i + 1, v: value(String(i)) } }
  }, ctx)));
  assert.ok(results.every(r => r.status === 200));
  let result = await sync({ op: 'sync', code, since: 0 }, ctx);
  assert.equal(Object.keys(result.json.changes).length, 20);
  assert.equal(result.json.rev, 20);
  await sync({ op: 'sync', code, changes: { 'deck:0': { t: 40, del: 1 } } }, ctx);
  const rejected = await sync({ op: 'sync', code, since: 21, changes: { 'deck:0': { t: 10, v: value('0') } } }, ctx);
  assert.deepEqual(rejected.json.current['deck:0'], { t: 40, del: 1 });
  result = await sync({ op: 'sync', code, since: 20 }, ctx);
  assert.deepEqual(result.json.changes['deck:0'], { t: 40, del: 1 });
  const invalid = JSON.parse('{"__proto__":{"t":50,"v":"bad"},"constructor":{"t":50,"v":"bad"}}');
  assert.equal((await sync({ op: 'sync', code, changes: invalid }, ctx)).status, 400);
});

test('sync pagination keeps a stable revision while another device writes', async t => {
  const db = openStorage(':memory:');
  t.after(() => db.close());
  const ctx = { sync: db.sync };
  const code = (await sync({ op: 'create' }, ctx)).json.code;
  const value = id => JSON.stringify({ id, cards: [], description: 'x'.repeat(2_000_000) });
  await sync({ op: 'sync', code, changes: { 'deck:a': { t: 1, v: value('a') }, 'deck:b': { t: 2, v: value('b') } } }, ctx);
  const first = await sync({ op: 'sync', code, since: 0 }, ctx);
  assert.deepEqual(Object.keys(first.json.changes), ['deck:a']);
  assert.ok(first.json.more);
  await sync({ op: 'sync', code, changes: { 'deck:c': { t: 3, v: value('c') } } }, ctx);
  const second = await sync({ op: 'sync', code, since: 0, after: first.json.more }, ctx);
  assert.deepEqual(Object.keys(second.json.changes), ['deck:b']);
  assert.equal(second.json.more, null);
  assert.equal(second.json.rev, first.json.rev);
  const newer = await sync({ op: 'sync', code, since: second.json.rev }, ctx);
  assert.deepEqual(Object.keys(newer.json.changes), ['deck:c']);
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

test('HTTP serves the frontend, protects source/secrets, and supports local API routes', async t => {
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
  const shell = await home.text();
  assert.match(shell, /runtime-config.js/);
  assert.match(shell, /assets\/app.js/);
  assert.match(shell, /assets\/app.css/);
  const build = shell.match(/name="deckhand-build" content="([a-f0-9]{12})"/)[1];
  assert.ok(shell.includes('assets/app.js?v=' + build));
  assert.ok(shell.includes('assets/app.css?v=' + build));
  const worker = await (await fetch(base + '/sw.js')).text();
  assert.ok(worker.includes("const BUILD = '" + build + "'"));
  const javascript = await fetch(base + '/assets/app.js');
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers.get('content-type'), /javascript/);
  const bundle = await javascript.text();
  assert.match(bundle, /function searchPageHtml/);
  assert.ok(bundle.startsWith("const DECKHAND_BUILD = '" + build + "';"));
  const version = await (await fetch(base + '/version.json')).json();
  assert.match(version.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(Object.keys(version).sort(), ['date', 'version']);
  assert.ok(bundle.includes("const DECKHAND_VERSION = '" + version.version + "';"));
  assert.ok(bundle.includes("const DECKHAND_RELEASE_DATE = '" + version.date + "';"));
  const stylesheet = await fetch(base + '/assets/app.css');
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /text\/css/);
  assert.match(await stylesheet.text(), /\.hub-card/);
  const sourceMap = await (await fetch(base + '/assets/app.js.map')).json();
  assert.equal(sourceMap.version, 3);
  assert.ok(sourceMap.sections.some(section => section.map.sources.includes('../../src/pages/life/setup.js')));
  const badge = await fetch(base + '/assets/images/deckhand-badge.webp');
  assert.equal(badge.status, 200);
  assert.equal(badge.headers.get('content-type'), 'image/webp');
  const scannerWorker = await fetch(base + '/assets/scanner/collectorvision/scanner.worker.mjs');
  assert.equal(scannerWorker.status, 200);
  assert.match(scannerWorker.headers.get('content-type'), /javascript/);
  assert.match(await scannerWorker.text(), /WorkerRuntime/);
  const scannerWasm = await fetch(base + '/assets/scanner/collectorvision/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm', { method: 'HEAD' });
  assert.equal(scannerWasm.status, 200);
  assert.equal(scannerWasm.headers.get('content-type'), 'application/wasm');
  assert.equal((await fetch(base + '/assets/scanner/opencv.js')).status, 404);
  assert.equal((await fetch(base + '/assets/scanner/tesseract.min.js')).status, 404);
  const manifest = await (await fetch(base + '/manifest.json')).json();
  const installAssets = [
    ...manifest.icons,
    ...(manifest.screenshots || []),
    ...manifest.shortcuts.flatMap(shortcut => shortcut.icons || [])
  ];
  for (const src of new Set(installAssets.map(asset => asset.src))) {
    const asset = await fetch(new URL(src, base + '/'), { method: 'HEAD' });
    assert.equal(asset.status, 200, 'Missing installation asset: ' + src);
    assert.match(asset.headers.get('content-type'), /^image\//);
  }
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const path of ['/.env', '/.git/config', '/server/storage.mjs', '/src/core/state.js', '/assets/private.js', '/package.json', '/var/app.sqlite', '/Deckhand.apk', '/api/constructor', '/screenshot-decklist.png', '/screenshot-inspiration.png', '/screenshot-life.png']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const runtime = await (await fetch(base + '/runtime-config.js')).text();
  assert.match(runtime, /"selfHosted":true/);
  assert.match(runtime, /"scryfallBase":"\/api\/scryfall"/);
  assert.match(runtime, /oracle-slim.jsonl.gz/);
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { ok: true, storage: 'sqlite' });
  const login = await fetch(base + '/api/login?returnTo=https://another.invalid', { redirect: 'manual' });
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), '/');
  assert.equal(login.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/api/sync')).status, 405);
  assert.equal((await post('/api/sync', null)).status, 401);
  assert.equal((await post('/api/sync', { code, op: 'probe' }, { origin: 'https://another.invalid' })).status, 403);
  assert.equal((await post('/api/sync', { op: 'probe', code: 'short' })).status, 401);
  assert.equal((await post('/api/sync', { op: 'create' })).status, 401);
  assert.equal((await (await fetch(base + '/api/account')).json()).user, null);
  let response = await post('/api/judge', { q: 'Can this card attack?' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'notconfigured');
  assert.equal((await post('/api/push-subscribe', {})).status, 404);
  response = await fetch(base + '/oracle-slim.jsonl.gz');
  assert.equal(response.headers.get('content-type'), 'application/gzip');
  assert.equal(response.headers.get('content-encoding'), null);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), compressed);
  assert.equal((await fetch(base + '/rulings-slim.jsonl.gz')).status, 404);
});

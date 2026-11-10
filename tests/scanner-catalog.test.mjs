import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { updateCatalog, loadCatalog, saveCatalog, FEED_URL, MODEL } from '../server/scanner/catalog.mjs';
import { createScannerService } from '../server/scanner/service.mjs';
import { createApp } from '../server/app.mjs';
import { scannerFixture } from './fixtures/scanner-catalog.mjs';

async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'deckhand-catalog-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function publisher() {
  const fixture = scannerFixture(), assets = new Map(), requests = [];
  function asset(path, bytes) {
    const url = new URL(path, FEED_URL).href;
    const compressed = gzipSync(bytes);
    assets.set(url, compressed);
    return { url, size: compressed.length, sha256: createHash('sha256').update(compressed).digest('hex') };
  }
  const record = fixture.records[0];
  const { faceIndex, ...core } = record;
  const base = { version: 1, rows: 1, source_updated_at: fixture.sourceUpdatedAt, assets: {
    records: asset('test/base-records.gz', JSON.stringify({ ...core, metadata: null }) + '\n'),
    embeddings: asset('test/base-embeddings.gz', Buffer.from(fixture.embeddings.buffer)),
  } };
  const catalog = { public_name: fixture.publicName, descriptor: fixture.descriptor, current_version: 1,
    rows: 1, source_updated_at: fixture.sourceUpdatedAt, base, updates: {} };
  const feed = { checked_at: fixture.sourceUpdatedAt, families: {
    milo1: { embedding: { ...fixture.embedding }, catalogs: { 'scryfall/mtg': catalog } },
  } };
  const fetchImpl = async url => {
    url = String(url); requests.push(url);
    if (url === FEED_URL) return Response.json(feed);
    assert.ok(assets.has(url), 'unexpected download: ' + url);
    return new Response(assets.get(url));
  };
  return { fixture, feed, catalog, assets, requests, asset, fetchImpl, core };
}

test('catalog downloads verified base, applies incremental recognition and metadata updates, then reuses unchanged state', async () => {
  const p = publisher();
  const first = await updateCatalog(null, p);
  assert.equal(first.rows, 1);
  assert.equal(first.records[0].name, 'Scrying Glass');
  assert.equal(first.records[0].metadata, undefined);
  p.requests.length = 0;
  p.catalog.current_version = 2;
  const changed = { ...p.core, name: 'New printing' };
  p.catalog.updates['2'] = { from_version: 1, to_version: 2, source_updated_at: p.fixture.sourceUpdatedAt,
    rows: { added: 0, updated: 1, deleted: 0 }, recognition_rows: 1, metadata_rows: 0,
    assets: { records: p.asset('test/update-records.gz', JSON.stringify({ op: 'upsert', record: changed, embedding_index: 0 }) + '\n'),
      embeddings: p.asset('test/update-embeddings.gz', Buffer.from(p.fixture.embeddings.buffer)) } };
  const second = await updateCatalog(first, p);
  assert.equal(second.version, 2);
  assert.equal(second.records[0].name, 'New printing');
  assert.equal(first.records[0].name, 'Scrying Glass', 'updates must not mutate active matches');
  assert.ok(!p.requests.some(url => url.includes('base-')));
  p.catalog.current_version = 3;
  p.catalog.updates['3'] = { from_version: 2, to_version: 3, source_updated_at: p.fixture.sourceUpdatedAt,
    rows: { added: 0, updated: 1, deleted: 0 }, recognition_rows: 0, metadata_rows: 1,
    assets: { records: p.asset('test/metadata.gz', JSON.stringify({ op: 'upsert', record: changed, metadata: { text: 'New metadata' } }) + '\n') } };
  const third = await updateCatalog(second, p);
  assert.equal(third.version, 3);
  assert.deepEqual(third.embeddings, second.embeddings);
  p.requests.length = 0;
  assert.equal(await updateCatalog(third, p), third);
  assert.deepEqual(p.requests, [FEED_URL]);
});

test('expired deltas fall back to a new full base; deletes and additions preserve exact printing identities', async () => {
  const p = publisher(), first = await updateCatalog(null, p);
  const newRecord = { ...p.core, id: '11111111-1111-4111-8111-111111111111' };
  p.catalog.current_version = 2;
  p.catalog.updates['2'] = { from_version: 1, to_version: 2, source_updated_at: p.fixture.sourceUpdatedAt,
    rows: { added: 1, updated: 0, deleted: 1 }, recognition_rows: 2, metadata_rows: 0,
    assets: { records: p.asset('test/replace.gz', [
      { op: 'delete', id: p.core.id }, { op: 'upsert', record: newRecord, embedding_index: 0 },
    ].map(JSON.stringify).join('\n') + '\n'),
    embeddings: p.asset('test/replace-embeddings.gz', Buffer.from(p.fixture.embeddings.buffer)) } };
  const second = await updateCatalog(first, p);
  assert.equal(second.rows, 1);
  assert.equal(second.records[0].id, newRecord.id);
  assert.equal(second.records[0].identifiers.scryfall_oracle, first.records[0].identifiers.scryfall_oracle);
  p.requests.length = 0;
  p.catalog.current_version = 10;
  p.catalog.base.version = 10;
  p.catalog.updates = {};
  const checkpoint = await updateCatalog(second, p);
  assert.equal(checkpoint.version, 10);
  assert.ok(p.requests.some(url => url.includes('base-embeddings')));
});

test('bad checksums, incompatible models, oversized downloads and rollbacks cannot replace active data', async () => {
  const p = publisher(), first = await updateCatalog(null, p);
  p.feed.families.milo1.embedding.model = 'different-model';
  await assert.rejects(updateCatalog(first, p), /different Milo1/);
  p.feed.families.milo1.embedding.model = p.fixture.embedding.model;
  p.assets.set(p.catalog.base.assets.records.url, Buffer.from('bad'));
  await assert.rejects(updateCatalog(null, p), /size mismatch/);
  const corrupt = publisher();
  corrupt.catalog.base.assets.records.sha256 = '0'.repeat(64);
  await assert.rejects(updateCatalog(null, corrupt), /checksum mismatch/);
  const unsafe = publisher();
  unsafe.catalog.base.assets.records.url = 'http://localhost/private';
  await assert.rejects(updateCatalog(null, unsafe), /Untrusted|https/i);
  await assert.rejects(updateCatalog(null, { fetchImpl: async () => new Response('x', { headers: { 'content-length': '5000000' } }) }), /too large/);
  p.catalog.current_version = 0;
  await assert.rejects(updateCatalog(first, p), /backwards/);
  assert.equal(first.version, 1);
});

test('snapshots survive restart, validate integrity and fall back to previous generation', async t => {
  const directory = await temporary(t), first = scannerFixture();
  await saveCatalog(directory, first);
  const second = scannerFixture(); second.version = 2;
  await saveCatalog(directory, second);
  assert.equal((await loadCatalog(directory)).version, 2);
  const pointer = JSON.parse(await readFile(join(directory, 'current.json'), 'utf8'));
  await writeFile(join(directory, pointer.current, 'records.json'), '[]');
  assert.equal((await loadCatalog(directory)).version, 1);
  await writeFile(join(directory, pointer.previous, 'embeddings.f16'), 'bad');
  await assert.rejects(loadCatalog(directory), /No intact/);
});

test('HTTP scanner lookup works for guests, accepts only normalized embeddings and bounds load', async t => {
  const directory = await temporary(t), fixture = scannerFixture();
  await saveCatalog(directory, fixture);
  const scanner = createScannerService({ directory, autoUpdate: false });
  const app = createApp({ databasePath: ':memory:', scanner });
  t.after(() => app.close());
  await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  for (let i = 0; i < 100 && !scanner.status().ready; i++) await delay(10);
  assert.equal(scanner.status().ready, true);
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const values = new Float32Array(128);
  // Float16 reference -> normalized float vector (without ONNX/browser network).
  for (let i = 0; i < 128; i++) {
    const bits = fixture.embeddings[i], exponent = (bits >>> 10) & 31;
    values[i] = (bits & 32768 ? -1 : 1) * (exponent ? 1 + (bits & 1023) / 1024 : (bits & 1023) / 1024) * 2 ** (exponent ? exponent - 15 : -14);
  }
  const norm = Math.hypot(...values);
  const body = { model: MODEL, embedding: Array.from(values, v => v / norm) };
  const post = (value, headers = {}) => fetch(origin + '/api/scanner/lookup', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value),
  });
  const response = await post(body);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.match.cardId, fixture.records[0].id);
  assert.ok(result.match.score > 0.99);
  assert.equal(result.catalog.rows, 1);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await post({ ...body, image: 'camera frame' })).status, 400);
  assert.equal((await post({ ...body, model: 'wrong' })).status, 400);
  assert.equal((await post({ ...body, embedding: [1] })).status, 400);
  assert.equal((await post({ ...body, embedding: Array(128).fill(0) })).status, 400);
  assert.equal((await post({ ...body, embedding: Array(128).fill('1') })).status, 400);
  assert.equal((await post(body, { origin: 'https://other-site.example' })).status, 403);
  assert.equal((await fetch(origin + '/api/scanner/lookup')).status, 405);
  const many = await Promise.all(Array.from({ length: 100 }, () => post(body)));
  assert.ok(many.some(response => response.status === 429));
  assert.ok(many.every(response => [200, 429].includes(response.status)));
  assert.equal((await fetch(origin + '/api/health')).status, 200);
});

test('an empty/offline catalog returns availability status without breaking the rest of the app', async t => {
  const directory = await temporary(t);
  const scanner = createScannerService({ directory, autoUpdate: false });
  const app = createApp({ databasePath: ':memory:', scanner });
  t.after(() => app.close());
  await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  const url = 'http://127.0.0.1:' + app.server.address().port;
  assert.equal((await (await fetch(url + '/api/scanner/status')).json()).ready, false);
  const result = await fetch(url + '/api/scanner/lookup', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, embedding: [1, ...Array(127).fill(0)] }) });
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('retry-after'), '2');
  assert.equal((await fetch(url + '/api/health')).status, 200);
});

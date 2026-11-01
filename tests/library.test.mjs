import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { downloadLibrary } from '../scripts/download-library.mjs';

test('full library publishes compressed cards and rulings and keeps the cache on refresh failure', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'deckhand-library-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let fail = false;
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    if (url.endsWith('/bulk-data')) return Response.json({ data: [
      { type: 'oracle_cards', download_uri: 'https://example.test/cards.jsonl', updated_at: '2026-11-01' },
      { type: 'rulings', download_uri: 'https://example.test/rulings.jsonl' }
    ] });
    if (fail) return new Response('unavailable', { status: 503 });
    if (url.endsWith('/cards.jsonl')) return new Response(Array.from({ length: 1001 }, (_, i) => JSON.stringify({
      id: 'card-' + i, name: 'Card ' + i, oracle_id: 'oracle-' + i, type_line: 'Creature', layout: 'normal'
    })).join('\n'));
    if (url.endsWith('/rulings.jsonl')) return new Response(Array.from({ length: 101 }, (_, i) => JSON.stringify({
      oracle_id: 'oracle-' + i, comment: 'Official ruling ' + i, published_at: '2026-11-01'
    })).join('\n'));
    throw new Error('Unexpected URL: ' + url);
  };
  const result = await downloadLibrary({ directory, fetchImpl, log() {} });
  assert.equal(result.sample, false);
  assert.equal(result.oracle.count, 1001);
  assert.equal(result.rulings.count, 101);
  assert.equal(requests.length, 3);
  const path = join(directory, 'oracle-slim.jsonl.gz');
  const previous = await readFile(path);
  const cards = gunzipSync(previous).toString().trim().split('\n').map(JSON.parse);
  assert.equal(cards.length, 1001);
  assert.equal(cards[0].n, 'Card 0');
  fail = true;
  await assert.rejects(downloadLibrary({ directory, fetchImpl, log() {} }), /HTTP 503/);
  assert.deepEqual(await readFile(path), previous);
  assert.equal((await readdir(directory)).some(name => name.startsWith('.library-')), false);
});

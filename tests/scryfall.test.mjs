import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScryfallClient } from '../server/scryfall.mjs';
import { openStorage } from '../server/storage.mjs';

test('GET and POST share pacing, duplicate queries coalesce, and cache hits avoid upstream requests', async () => {
  let clock = 1000;
  const starts = [];
  const client = createScryfallClient({ now: () => clock, wait: async ms => { clock += ms; },
    fetchImpl: async (url, options) => {
      assert.equal(options.headers['user-agent'], 'Deckhand-Selfhost/1.0');
      assert.equal(options.headers.accept, 'application/json');
      assert.equal(options.redirect, 'manual');
      starts.push({ time: clock, method: options.method });
      return Response.json({ object: 'list', data: [] });
    } });
  await Promise.all([
    client.request('/sets'), client.request('/sets'),
    client.request('/cards/collection', { method: 'POST', body: { identifiers: [{ name: 'Sol Ring' }] } }),
    client.request('/cards/collection', { method: 'POST', body: { identifiers: [{ name: 'Sol Ring' }] } }),
    client.request('/cards/autocomplete?q=Sol')
  ]);
  assert.equal(starts.length, 3);
  assert.equal(starts[1].time - starts[0].time, 500);
  assert.equal(starts[2].time - starts[1].time, 500);
  await client.request('/sets');
  await client.request('/cards/collection', { method: 'POST', body: { identifiers: [{ name: 'Sol Ring' }] } });
  assert.equal(starts.length, 3);
});

test('SQLite retains GET/POST caches and refusal cooldowns across actual server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'deckhand-card-guard-'));
  let storage, clock = 1000, calls = 0;
  const body = { identifiers: [{ name: 'Sol Ring' }] };
  const start = () => {
    storage = openStorage(join(directory, 'cache.sqlite'));
    return createScryfallClient({ store: storage.store('scryfall-http'), now: () => clock,
      wait: async ms => { clock += ms; }, fetchImpl: async () => {
        calls++;
        return calls < 3 ? Response.json({ data: [{ name: 'Sol Ring' }] })
          : new Response('<html>blocked</html>', { status: 403, headers: { 'content-type': 'text/html' } });
      } });
  };
  try {
    let client = start();
    await client.request('/sets');
    await client.request('/cards/collection', { method: 'POST', body });
    storage.close();
    client = start();
    assert.equal((await client.request('/sets')).status, 200);
    assert.equal((await client.request('/cards/collection', { method: 'POST', body })).status, 200);
    assert.equal(calls, 2);
    const blocked = await client.request('/cards/search?q=new');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers['retry-after'], '900');
    storage.close();
    client = start();
    assert.equal((await client.request('/cards/autocomplete?q=new')).status, 429);
    assert.equal((await client.request('/sets')).status, 200, 'cached data works during a cooldown');
    assert.equal(calls, 3);
    const saved = (await storage.store('scryfall-http').list()).blobs;
    assert.equal(saved.filter(({ key }) => key.startsWith('cache:')).length, 2);
  } finally {
    storage?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('blocks, challenges, redirects and invalid responses stop queued requests without retries', async t => {
  const timestamp = Date.UTC(2026, 0, 1);
  const cases = [
    ['forbidden', () => Response.json({ code: 'forbidden' }, { status: 403 }), 900],
    ['HTML challenge', () => new Response('<html>challenge</html>', { headers: { 'content-type': 'text/html' } }), 900],
    ['Cloudflare challenge header', () => Response.json({}, { headers: { 'cf-mitigated': 'challenge' } }), 900],
    ['HTTP-date Retry-After', () => Response.json({}, { status: 429,
      headers: { 'retry-after': new Date(timestamp + 120_000).toUTCString() } }), 120],
    ['redirect', () => new Response(null, { status: 302, headers: { location: 'https://www.cardmarket.com/' } }), 60],
    ['upstream unavailable', () => Response.json({}, { status: 503, headers: { 'retry-after': '180' } }), 180],
    ['malformed JSON', () => new Response('{broken', { headers: { 'content-type': 'application/json' } }), 60],
    ['non-JSON', () => new Response('blocked', { headers: { 'content-type': 'text/plain' } }), 60],
    ['network failure', () => { throw new TypeError('fetch failed'); }, 60]
  ];
  for (const [name, response, seconds] of cases) await t.test(name, async () => {
    let calls = 0;
    const client = createScryfallClient({ now: () => timestamp, fetchImpl: async (_url, options) => {
      calls++;
      assert.equal(options.redirect, 'manual');
      return response();
    } });
    const results = await Promise.all([client.request('/sets'), client.request('/cards/random'),
      client.request('/cards/collection', { method: 'POST', body: { identifiers: [{ name: 'Island' }] } })]);
    assert.deepEqual(results.map(result => result.status), [429, 429, 429]);
    assert.equal(results[0].headers['retry-after'], String(seconds));
    assert.equal(calls, 1);
  });
});

test('persisted hourly and daily budgets count upstream calls, while cache hits remain available', async () => {
  const storage = openStorage(':memory:');
  let clock = 2 * 3_600_000 + 1000, calls = 0;
  const start = () => createScryfallClient({ store: storage.store('scryfall-http'),
    now: () => clock, gapMs: 0, maxHourly: 2, maxDaily: 3,
    fetchImpl: async () => { calls++; return Response.json({ data: [] }); } });
  try {
    let client = start();
    assert.equal((await client.request('/sets')).status, 200);
    await client.request('/cards/named?exact=Island');
    assert.equal((await client.request('/cards/named?exact=Forest')).json.code, 'request_budget_exceeded');
    client = start();
    assert.equal((await client.request('/sets')).status, 200);
    assert.equal((await client.request('/cards/named?exact=Forest')).status, 429);
    assert.equal(calls, 2);
    clock = 3 * 3_600_000 + 1000;
    assert.equal((await client.request('/cards/named?exact=Forest')).status, 200);
    const daily = await client.request('/cards/random');
    assert.equal(daily.status, 429);
    assert.equal(Number(daily.headers['retry-after']), (24 * 3_600_000 - clock) / 1000);
    assert.equal(calls, 3);
    clock = 24 * 3_600_000 + 1000;
    assert.equal((await client.request('/cards/random')).status, 200);
    assert.equal(calls, 4);
  } finally { storage.close(); }
});

test('pacing across an hour boundary uses the new request budget', async () => {
  let clock = 3_600_000 - 100, calls = 0;
  const client = createScryfallClient({ now: () => clock, wait: async ms => { clock += ms; }, maxHourly: 1,
    fetchImpl: async () => { calls++; return Response.json({}); } });
  await client.request('/sets');
  assert.equal((await client.request('/cards/random')).status, 200);
  assert.equal(calls, 2);
});

test('search cache expires after thirty minutes, collections after a day, and random cards are fresh', async () => {
  let clock = 1000, calls = 0;
  const client = createScryfallClient({ now: () => clock, gapMs: 0,
    fetchImpl: async () => Response.json({ call: ++calls }) });
  const post = { method: 'POST', body: { identifiers: [{ name: 'Sol Ring' }] } };
  await client.request('/cards/search?q=dragon');
  await client.request('/cards/collection', post);
  assert.notDeepEqual((await client.request('/cards/random')).json, (await client.request('/cards/random')).json);
  clock += 30 * 60_000;
  assert.equal((await client.request('/cards/search?q=dragon')).json.call, 5);
  assert.equal((await client.request('/cards/collection', post)).json.call, 2);
  clock += 24 * 3_600_000;
  assert.equal((await client.request('/cards/collection', post)).json.call, 6);
});

test('the persistent response cache stays bounded and removes expired entries', async () => {
  const storage = openStorage(':memory:');
  let clock = 1000;
  const store = storage.store('scryfall-http');
  const client = createScryfallClient({ store, gapMs: 0, now: () => clock,
    fetchImpl: async () => Response.json({ data: [] }) });
  try {
    for (let index = 0; index < 101; index++) await client.request('/cards/search?q=' + index);
    assert.equal((await store.list()).blobs.filter(({ key }) => key.startsWith('cache:')).length, 100);
    clock += 31 * 60_000;
    await client.request('/cards/search?q=new');
    assert.equal((await store.list()).blobs.filter(({ key }) => key.startsWith('cache:')).length, 1);
  } finally { storage.close(); }
});

test('rate limits stop queued and future upstream calls until Retry-After expires', async () => {
  let clock = 1000, calls = 0;
  const client = createScryfallClient({ now: () => clock, wait: async ms => { clock += ms; },
    fetchImpl: async () => {
      calls++;
      return calls === 1 ? Response.json({ code: 'rate_limited' }, { status: 429, headers: { 'retry-after': '120' } })
        : Response.json({ object: 'list', data: [] });
    } });
  const responses = await Promise.all([client.request('/sets'), client.request('/cards/random')]);
  assert.deepEqual(responses.map(x => x.status), [429, 429]);
  assert.equal(responses[0].headers['retry-after'], '120');
  await client.request('/cards/search?q=dragon');
  assert.equal(calls, 1);
  clock += 120_001;
  assert.equal((await client.request('/sets')).status, 200);
  assert.equal(calls, 2);
});

test('empty searches are normal results, named card 404s stay errors, and arbitrary destinations are rejected', async () => {
  let calls = 0;
  const client = createScryfallClient({ gapMs: 0, fetchImpl: async () => {
    calls++;
    return Response.json({ object: 'error', code: 'not_found' }, { status: 404 });
  } });
  const result = await client.request('/cards/search?q=set%3Anau');
  assert.equal(result.status, 200);
  assert.deepEqual(result.json.data, []);
  assert.equal((await client.request('/cards/named?exact=Nonexistent')).status, 404);
  assert.equal((await client.request('https://example.com/cards/search')).status, 400);
  assert.equal((await client.request('/bulk-data')).status, 400);
  assert.equal((await client.request('/sets', { method: 'POST' })).status, 400);
  assert.equal(calls, 2);
});

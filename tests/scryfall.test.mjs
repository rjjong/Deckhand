import test from 'node:test';
import assert from 'node:assert/strict';
import { createScryfallClient } from '../server/scryfall.mjs';

test('GET and POST share pacing, duplicate queries coalesce, and cache hits avoid upstream requests', async () => {
  let clock = 1000;
  const starts = [];
  const client = createScryfallClient({ now: () => clock, wait: async ms => { clock += ms; },
    fetchImpl: async (url, options) => {
      assert.equal(options.headers['user-agent'], 'Deckhand-Selfhost/1.0');
      assert.equal(options.headers.accept, 'application/json');
      starts.push({ time: clock, method: options.method });
      return Response.json({ object: 'list', data: [] });
    } });
  await Promise.all([
    client.request('/sets'), client.request('/sets'),
    client.request('/cards/collection', { method: 'POST', body: { identifiers: [{ name: 'Sol Ring' }] } }),
    client.request('/cards/autocomplete?q=Sol')
  ]);
  assert.equal(starts.length, 3);
  assert.equal(starts[1].time - starts[0].time, 250);
  assert.equal(starts[2].time - starts[1].time, 250);
  await client.request('/sets');
  assert.equal(starts.length, 3);
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

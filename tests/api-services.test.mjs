import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.mjs';

async function listen(app) {
  await new Promise((done, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', done);
  });
  return `http://127.0.0.1:${app.server.address().port}`;
}

test('local news aggregates sources and shares its cache across concurrent requests', async (t) => {
  let calls = 0;
  const app = createApp({
    databasePath: ':memory:',
    fetchImpl: async (url) => {
      calls++;
      const source = new URL(url);
      if (source.hostname === 'edhrec.com')
        return Response.json([
          {
            title: { rendered: 'Commander &amp; cards' },
            link: 'https://edhrec.com/articles/commander-cards',
            date: '2026-10-31T12:00:00Z',
            excerpt: { rendered: '<p>A Commander article.</p>' },
          },
        ]);
      assert.equal(url, 'https://www.mtggoldfish.com/feed');
      return new Response(`<feed><entry><title>Modern deck ideas</title>
        <link href="https://www.mtggoldfish.com/articles/modern-deck-ideas"/>
        <published>2026-11-01T12:00:00Z</published><summary>New ideas.</summary>
        </entry></feed>`);
    },
  });
  t.after(() => app.close());
  const base = await listen(app);
  const results = await Promise.all(
    Array.from({ length: 3 }, async () => {
      const response = await fetch(base + '/api/news');
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /max-age=1800/);
      return response.json();
    }),
  );
  assert.equal(calls, 2);
  assert.deepEqual(
    results[0].items.map(({ t, fmt }) => ({ t, fmt })),
    [
      { t: 'Modern deck ideas', fmt: 'modern' },
      { t: 'Commander & cards', fmt: 'commander' },
    ],
  );
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(await (await fetch(base + '/api/news')).json(), results[0]);
  assert.equal(calls, 2);
});

test('local AI endpoints keep answers in SQLite across server restarts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'deckhand-services-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const options = {
    databasePath: join(directory, 'app.sqlite'),
    dataDirectory: directory,
    env: { OLLAMA_URL: 'http://ollama:11434' },
    fetchImpl: async (url, options) => {
      calls++;
      const request = JSON.parse(options.body);
      const judge = request.messages[1].content.startsWith('QUESTION:');
      assert.equal(url, 'http://ollama:11434/api/chat');
      const content = judge
        ? {
            answer: 'Yes.',
            reasoning: 'The given rules allow it.',
            cites: ['100'],
            confident: true,
          }
        : {
            plan: 'Draw cards.',
            cuts: [{ name: 'Clunky Spell', why: 'Too expensive for this plan.' }],
          };
      return Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify(content) } });
    },
  };
  let app = createApp(options);
  t.after(() => app.close());
  let base = await listen(app);
  const post = async (path, body) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const judge = {
    device: 'test-device',
    q: 'Can this card attack?',
    rules: [{ n: '100', t: 'General rules.' }],
  };
  const deck = {
    device: 'test-device',
    kind: 'cuts',
    deck: { leaders: [{ name: 'Example Commander' }], over: 1 },
    cands: [{ name: 'Clunky Spell' }, { name: 'Useful Spell' }],
  };
  assert.equal((await post('/api/judge', judge)).cached, false);
  const advice = await post('/api/deckai', deck);
  assert.equal(advice.cached, false);
  assert.equal(advice.cuts[0].name, 'Clunky Spell');
  assert.equal(calls, 2);
  await app.close();
  app = createApp(options);
  base = await listen(app);
  const cachedJudge = await post('/api/judge', judge);
  assert.equal(cachedJudge.cached, true);
  assert.equal(cachedJudge.answer, 'Yes.');
  assert.equal((await post('/api/deckai', deck)).cached, true);
  assert.equal(calls, 2);
});

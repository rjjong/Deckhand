import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../server/storage.mjs';
import {
  handle,
  DEFAULT_GROQ_MODEL,
  userMessage,
  clean,
  systemPrompt,
} from '../server/services/judge.mjs';

const question = {
  q: 'Does a creature with zero toughness die?',
  device: 'judge-test-device',
  cards: [{ name: 'Example Creature', type: 'Creature', oracle: 'Indestructible', rulings: [] }],
  rules: [
    { n: '704.5f', t: 'A creature with toughness 0 or less is put into its owner’s graveyard.' },
  ],
};
const answer = {
  answer: 'Yes.',
  reasoning: 'Zero toughness is a state-based action.',
  cites: ['704.5f'],
  confident: true,
};
const completion = (value = answer) =>
  Response.json({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }],
  });

function fixture(t, fetchImpl, env = {}) {
  const storage = openStorage(':memory:');
  t.after(() => storage.close());
  return { store: storage.store, fetch: fetchImpl, env: { GROQ_API_KEY: 'groq-test-key', ...env } };
}

test('Judge uses one Groq request with structured output even when other provider keys exist', async (t) => {
  let calls = 0;
  const deps = fixture(
    t,
    async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(options.headers.authorization, 'Bearer groq-test-key');
      const request = JSON.parse(options.body);
      assert.equal(request.model, DEFAULT_GROQ_MODEL);
      assert.equal(request.response_format.json_schema.strict, true);
      assert.equal(request.include_reasoning, false);
      assert.equal(request.max_completion_tokens, 2048);
      assert.match(request.messages[1].content, /Example Creature/);
      assert.match(request.messages[1].content, /704\.5f/);
      return completion();
    },
    { GEMINI_API_KEY: 'unused', CEREBRAS_API_KEY: 'unused' },
  );
  const result = await handle(question, deps);
  assert.equal(result.status, 200);
  assert.equal(result.json.provider, 'groq');
  assert.equal(result.json.cached, false);
  assert.deepEqual(result.json.readRules, ['704.5f']);
  assert.equal(calls, 1);
  assert.equal((await handle(question, deps)).json.cached, true);
  assert.equal(calls, 1);
});

test('Judge requires a Groq key and never falls back to another configured provider', async (t) => {
  const deps = fixture(t, async () => assert.fail('No external request is allowed'), {
    GROQ_API_KEY: '',
    GEMINI_API_KEY: 'unused',
    CEREBRAS_API_KEY: 'unused',
  });
  assert.deepEqual(await handle(question, deps), {
    status: 503,
    json: { ok: false, error: 'nokey' },
  });
});

test('Groq cooldown persists in SQLite across restarts while cached answers remain available', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'deckhand-judge-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'judge.sqlite');
  let storage = openStorage(file),
    calls = 0;
  t.after(() => storage.close());
  const fetchImpl = async () => {
    calls++;
    return calls === 1
      ? completion()
      : new Response('', { status: 429, headers: { 'retry-after': '120' } });
  };
  const deps = () => ({ store: storage.store, fetch: fetchImpl, env: { GROQ_API_KEY: 'test' } });
  assert.equal((await handle(question, deps())).status, 200);
  const another = { ...question, q: 'Can indestructible prevent zero toughness?' };
  const limited = await handle(another, deps());
  assert.equal(limited.status, 429);
  assert.equal(limited.json.retryAfter, 120);
  storage.close();
  storage = openStorage(file);
  const paused = await handle(another, deps());
  assert.equal(paused.status, 429);
  assert.ok(paused.json.retryAfter > 0 && paused.json.retryAfter <= 120);
  assert.equal((await handle(question, deps())).json.cached, true);
  assert.equal(calls, 2);
  await storage.store('judge-count').setJSON('groq-cooldown', { until: Date.now() - 1 });
  await handle(another, deps());
  assert.equal(calls, 3);
});

test('authentication, model, and malformed-output failures do not trigger retries or provider fallback', async (t) => {
  for (const [status, error] of [
    [401, 'key'],
    [403, 'key'],
    [404, 'model'],
    [400, 'down'],
    [413, 'context'],
    [200, 'shape'],
  ]) {
    let calls = 0;
    const deps = fixture(
      t,
      async () => {
        calls++;
        return status === 200
          ? Response.json({ choices: [{ message: { content: 'not JSON' } }] })
          : new Response('', { status });
      },
      { GEMINI_API_KEY: 'unused' },
    );
    const result = await handle(question, deps);
    assert.equal(result.json.error, error);
    assert.equal(calls, 1);
  }
});

test('cache identity includes current card text, rules, and configured Groq model', async (t) => {
  let calls = 0;
  const deps = fixture(t, async () => {
    calls++;
    return completion();
  });
  await handle(question, deps);
  await handle(question, deps);
  assert.equal(calls, 1);
  await handle({ ...question, cards: [{ ...question.cards[0], oracle: 'Flying' }] }, deps);
  await handle({ ...question, rules: [{ ...question.rules[0], t: 'Updated rules text.' }] }, deps);
  await handle(question, { ...deps, env: { ...deps.env, GROQ_MODEL: 'openai/gpt-oss-20b' } });
  assert.equal(calls, 4);
});

test('free-tier context budgeting keeps complete card texts and whole rule excerpts', async (t) => {
  const body = clean({
    ...question,
    rules: Array.from({ length: 40 }, (_, i) => ({
      n: '100.' + i,
      t: 'rule '.repeat(110) + 'END',
    })),
  });
  const read = [];
  const text = userMessage(body, 14000 - systemPrompt().length, read);
  assert.ok(text.length + systemPrompt().length <= 14000);
  assert.ok(read.length > 0 && read.length < body.rules.length);
  assert.ok(text.endsWith('END'));
  assert.match(text, /Example Creature — Creature\nIndestructible/);
  const longCard = clean({
    ...question,
    cards: [{ name: 'Long card', oracle: 'card text '.repeat(250) + 'END' }],
  });
  assert.match(userMessage(longCard), /card text END/);
  const deps = fixture(t, async () => assert.fail('Oversized context must not be sent'));
  const oversized = { ...question, rules: [{ n: '100', t: 'long '.repeat(3000) }] };
  assert.equal((await handle(oversized, deps)).json.error, 'context');
});

test('unsupported rule citations are not cached as confident answers', async (t) => {
  let calls = 0;
  const deps = fixture(t, async () => {
    calls++;
    return completion({ ...answer, cites: ['999.1'] });
  });
  const result = await handle(question, deps);
  assert.equal(result.json.confident, false);
  assert.deepEqual(result.json.cites, []);
  await handle(question, deps);
  assert.equal(calls, 2);
});

test('failed Groq attempts consume the local daily allowance without spending quota on cache hits', async (t) => {
  let calls = 0;
  const deps = fixture(
    t,
    async () => {
      calls++;
      return new Response('', { status: 500 });
    },
    { JUDGE_DAILY: '1' },
  );
  assert.equal((await handle(question, deps)).json.left, 0);
  const result = await handle(question, deps);
  assert.equal(result.status, 429);
  assert.equal(result.json.error, 'limit');
  assert.equal(calls, 1);
});

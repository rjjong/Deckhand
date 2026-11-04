import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, userMessage, clean, systemPrompt } from '../server/services/judge.mjs';
import {
  askLocal,
  DEFAULT_LOCAL_MODEL,
  localConfig,
  MAX_LOCAL_PROMPT_CHARS,
} from '../server/services/local-ai.mjs';
import { openStorage } from '../server/storage.mjs';

const question = {
  q: 'Does a creature with zero toughness die?',
  device: 'local-judge-test',
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
  Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify(value) } });
function fixture(t, fetchImpl, env = {}) {
  const storage = openStorage(':memory:');
  t.after(() => storage.close());
  return {
    store: storage.store,
    fetch: fetchImpl,
    env: { OLLAMA_URL: 'http://ollama:11434', ...env },
  };
}

test('Judge sends JSON requests to the private local model and caches grounded answers', async (t) => {
  let calls = 0;
  const deps = fixture(t, async (url, options) => {
    calls++;
    assert.equal(url, 'http://ollama:11434/api/chat');
    assert.equal(options.headers.authorization, undefined);
    const request = JSON.parse(options.body);
    assert.equal(request.model, DEFAULT_LOCAL_MODEL);
    assert.equal(request.think, false);
    assert.equal(request.stream, false);
    assert.equal(request.options.num_ctx, 4096);
    assert.equal(request.format, 'json');
    assert.match(request.messages[1].content, /Example Creature/);
    return completion();
  });
  const result = await handle(question, deps);
  assert.equal(result.status, 200);
  assert.equal(result.json.provider, 'ollama');
  assert.deepEqual(result.json.readRules, ['704.5f']);
  assert.equal((await handle(question, deps)).json.cached, true);
  assert.equal(calls, 1);
});

test('No public inference endpoint or cloud model can be configured', async (t) => {
  for (const env of [
    { OLLAMA_URL: '' },
    { OLLAMA_URL: 'https://ollama.com' },
    { OLLAMA_URL: 'http://127.attacker.invalid' },
    { OLLAMA_URL: 'http://ollama:11434/api/chat' },
    { OLLAMA_MODEL: 'some-model:cloud' },
  ]) {
    const deps = fixture(t, () => assert.fail('No request allowed'), env);
    assert.equal((await handle(question, deps)).json.error, 'notconfigured');
  }
  assert.equal(localConfig({ OLLAMA_URL: 'http://192.168.2.50:11434' }).model, DEFAULT_LOCAL_MODEL);
});

test('Local failures never retry or switch models', async (t) => {
  for (const [status, error] of [
    [404, 'model'],
    [503, 'busy'],
    [429, 'busy'],
    [500, 'down'],
    [200, 'shape'],
  ]) {
    let calls = 0;
    const deps = fixture(t, async () => {
      calls++;
      return status === 200 ? completion({ invalid: true }) : new Response('', { status });
    });
    assert.equal((await handle(question, deps)).json.error, error);
    assert.equal(calls, 1);
  }
});

test('Local cache identity includes current Oracle text, excerpts and model', async (t) => {
  let calls = 0;
  const deps = fixture(t, async () => {
    calls++;
    return completion();
  });
  await handle(question, deps);
  await handle(question, deps);
  assert.equal(calls, 1);
  await handle({ ...question, cards: [{ ...question.cards[0], oracle: 'Flying' }] }, deps);
  await handle({ ...question, rules: [{ ...question.rules[0], t: 'Updated rule.' }] }, deps);
  await handle(question, { ...deps, env: { ...deps.env, OLLAMA_MODEL: 'local-test:4b' } });
  assert.equal(calls, 4);
});

test('Local context budgeting preserves complete card texts and selected excerpts', async (t) => {
  const body = clean({
    ...question,
    rules: Array.from({ length: 40 }, (_, i) => ({
      n: '100.' + i,
      t: 'rule '.repeat(110) + 'END',
    })),
  });
  const read = [];
  const text = userMessage(body, MAX_LOCAL_PROMPT_CHARS - systemPrompt().length, read);
  assert.ok(text.length + systemPrompt().length <= MAX_LOCAL_PROMPT_CHARS);
  assert.ok(read.length > 0 && read.length < body.rules.length);
  assert.ok(text.endsWith('END'));
  assert.match(text, /Example Creature — Creature\nIndestructible/);
  const deps = fixture(t, () => assert.fail('Oversized context must not be sent'));
  assert.equal(
    (await handle({ ...question, rules: [{ n: '100', t: 'long '.repeat(3000) }] }, deps)).json
      .error,
    'context',
  );
});

test('Unsupported citations and truncated generations are not cached as confident answers', async (t) => {
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
  const cut = fixture(t, async () =>
    Response.json({
      done: true,
      done_reason: 'length',
      message: { content: JSON.stringify(answer) },
    }),
  );
  assert.equal((await handle(question, cut)).json.error, 'shape');
});

test('One local request runs at a time; a small bounded queue protects memory', async () => {
  const finishes = [];
  let active = 0,
    maxActive = 0;
  const fetchImpl = async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => finishes.push(resolve));
    active--;
    return completion();
  };
  const env = { OLLAMA_URL: 'http://ollama:11434' };
  const jobs = Array.from({ length: 4 }, () => askLocal(env, fetchImpl, 'system', 'question'));
  assert.equal((await askLocal(env, fetchImpl, 'system', 'question')).error, 'busy');
  for (let i = 0; i < jobs.length; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    finishes.shift()();
    assert.equal((await jobs[i]).provider, 'ollama');
  }
  assert.equal(maxActive, 1);
});

test('Inference timeout aborts the request and frees the local slot', async () => {
  let calls = 0;
  const fetchImpl = async (_url, { signal }) => {
    calls++;
    if (calls > 1) return completion();
    await new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
  };
  const env = { OLLAMA_URL: 'http://ollama:11434', OLLAMA_TIMEOUT_MS: '2000' };
  assert.equal((await askLocal(env, fetchImpl, 'system', 'question')).error, 'timeout');
  assert.equal((await askLocal(env, fetchImpl, 'system', 'question')).provider, 'ollama');
});

test('Failed attempts consume the daily allowance without charging cache hits', async (t) => {
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
  assert.equal((await handle(question, deps)).json.error, 'limit');
  assert.equal(calls, 1);
});

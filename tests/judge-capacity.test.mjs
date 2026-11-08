import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handle } from '../server/services/judge.mjs';
import { judgePolicy, judgeAllowance, judgeStatus } from '../server/services/judge-limits.mjs';
import { createApp } from '../server/app.mjs';
import { openStorage } from '../server/storage.mjs';

const question = { q: 'Does a creature with zero toughness die?', device: 'first-player' };
const completion = () =>
  Response.json({
    done: true,
    done_reason: 'stop',
    message: {
      content: JSON.stringify({
        answer: 'Yes.',
        reasoning: 'The supplied rule applies.',
        cites: [],
        confident: true,
      }),
    },
  });
const env = { OLLAMA_URL: 'http://ollama:11434' };

function fixture(t, fetchImpl = async () => completion(), config = {}) {
  const storage = openStorage(':memory:');
  t.after(() => storage.close());
  let now = Date.parse('2026-11-08T12:00:00Z');
  return {
    store: storage.store,
    fetch: fetchImpl,
    env: { ...env, ...config },
    now: () => now,
    advance: (ms) => {
      now += ms;
    },
  };
}

test('Judge defaults and configurable bounds keep a modest daily and burst budget', () => {
  assert.deepEqual(judgePolicy(), { limit: 10, global: 100, cooldownSeconds: 30 });
  assert.deepEqual(
    judgePolicy({ JUDGE_DAILY: '-1', JUDGE_GLOBAL: 'invalid', JUDGE_COOLDOWN_SECONDS: 'Infinity' }),
    judgePolicy(),
  );
  assert.equal(judgePolicy({ JUDGE_COOLDOWN_SECONDS: '0' }).cooldownSeconds, 0);
});

test('a burst admits one inference, immediately reports busy to other players, and never charges declined requests', async (t) => {
  const started = Promise.withResolvers(),
    finish = Promise.withResolvers();
  let calls = 0;
  const deps = fixture(
    t,
    async () => {
      calls++;
      started.resolve();
      await finish.promise;
      return completion();
    },
    { JUDGE_COOLDOWN_SECONDS: '0' },
  );
  const first = handle(question, deps);
  await started.promise;
  try {
    const replies = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        handle({ ...question, q: 'Different question ' + i, device: 'player-' + i }, deps),
      ),
    );
    assert.ok(
      replies.every(
        (reply) => reply.status === 503 && reply.json.error === 'busy' && reply.json.left === 10,
      ),
    );
    assert.ok(replies.every((reply) => reply.headers['retry-after'] === '10'));
    const status = await judgeStatus('another-player', deps);
    assert.equal(status.state, 'busy');
    assert.equal(status.left, 10);
    assert.equal(Object.hasOwn(status, 'question'), false);
    assert.equal(calls, 1);
  } finally {
    finish.resolve();
  }
  assert.equal((await first).json.left, 9);
  assert.equal((await judgeStatus('another-player', deps)).state, 'ready');
  assert.equal((await judgeAllowance('another-player', deps)).total, 1);
});

test('cooldowns persist across handler instances, while cached rulings stay free during cooldown and at the daily limit', async (t) => {
  let calls = 0;
  const deps = fixture(
    t,
    async () => {
      calls++;
      return completion();
    },
    { JUDGE_DAILY: '2' },
  );
  assert.equal((await handle(question, deps)).json.left, 1);
  assert.equal((await handle(question, { ...deps })).json.cached, true);
  const next = { ...question, q: 'Can a different creature attack?' };
  const cooldown = await handle(next, { ...deps });
  assert.equal(cooldown.status, 429);
  assert.equal(cooldown.json.error, 'cooldown');
  assert.equal(cooldown.json.retryAfter, 30);
  assert.equal(cooldown.json.left, 1);
  deps.advance(30000);
  assert.equal((await handle(next, deps)).json.left, 0);
  assert.equal((await handle({ ...next, q: 'A third new question?' }, deps)).json.error, 'limit');
  assert.equal((await handle(question, deps)).json.cached, true);
  assert.equal(calls, 2);
  deps.advance(12 * 3600000);
  assert.equal((await judgeStatus(question.device, deps)).left, 2);
  assert.equal((await judgeStatus(question.device, deps)).state, 'ready');
});

test('signed-in devices share their daily allowance while other accounts and guest browsers stay independent', async (t) => {
  const deps = fixture(t, undefined, { JUDGE_DAILY: '1' });
  await handle(question, { ...deps, accountId: 'account-a', ip: '192.168.1.2' });
  const result = await handle(
    { q: 'Another rules question?', device: 'other-device' },
    { ...deps, accountId: 'account-a', ip: '192.168.1.7' },
  );
  assert.equal(result.json.error, 'limit');
  assert.equal((await judgeStatus('third-device', { ...deps, accountId: 'account-a' })).left, 0);
  assert.equal(
    (await handle({ q: 'Another account question?' }, { ...deps, accountId: 'account-b' })).status,
    200,
  );
  assert.equal(
    (await handle({ q: 'Guest first question?', device: 'guest-one' }, deps)).status,
    200,
  );
  assert.equal((await judgeStatus('guest-two', deps)).left, 1);
});

test('the shared daily ceiling stops new inference for every player and preserves cached answers', async (t) => {
  let calls = 0;
  const deps = fixture(
    t,
    async () => {
      calls++;
      return completion();
    },
    { JUDGE_GLOBAL: '2', JUDGE_COOLDOWN_SECONDS: '0' },
  );
  await handle(question, deps);
  await handle({ q: 'A second question?', device: 'second' }, deps);
  const result = await handle({ q: 'A third question?', device: 'third' }, deps);
  assert.equal(result.status, 429);
  assert.equal(result.json.error, 'quota');
  assert.equal(result.json.left, 10);
  assert.equal((await judgeStatus('third', deps)).state, 'quota');
  assert.equal((await handle({ ...question, device: 'third' }, deps)).json.cached, true);
  assert.equal(calls, 2);
});

test('cached answers remain available while another player occupies the GPU', async (t) => {
  let calls = 0;
  const started = Promise.withResolvers(),
    finish = Promise.withResolvers();
  const deps = fixture(t, async () => {
    if (++calls > 1) {
      started.resolve();
      await finish.promise;
    }
    return completion();
  });
  await handle(question, deps);
  const running = handle({ q: 'A different uncached question?', device: 'another-player' }, deps);
  await started.promise;
  try {
    const cached = await handle({ ...question, device: 'third-player' }, deps);
    assert.equal(cached.json.cached, true);
    assert.equal(cached.json.left, 10);
    assert.equal(calls, 2);
  } finally {
    finish.resolve();
  }
  await running;
});

test('an unavailable or upstream-busy model does not spend daily allowance or impose a cooldown', async (t) => {
  for (const status of [429, 503, 500, 404]) {
    const deps = fixture(t, async () => new Response('', { status }));
    const result = await handle(question, deps);
    assert.equal(result.json.left, 10);
    assert.equal((await judgeStatus(question.device, deps)).state, 'ready');
    assert.equal((await judgeAllowance(question.device, deps)).total, 0);
  }
});

async function httpFixture(t, fetchImpl, config = {}) {
  const app = createApp({
    databasePath: ':memory:',
    env: { ...env, JUDGE_COOLDOWN_SECONDS: '0', ...config },
    fetchImpl,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    app.server.closeAllConnections();
    await app.close();
  });
  const post = (body, headers = {}, signal) =>
    fetch(base + '/api/judge', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  return { app, base, post };
}

test('the HTTP status endpoint and SSE clients get immediate JSON busy responses with Retry-After', async (t) => {
  const started = Promise.withResolvers(),
    finish = Promise.withResolvers();
  t.after(() => finish.resolve());
  const f = await httpFixture(t, async () => {
    started.resolve();
    await finish.promise;
    return completion();
  });
  const running = f.post(question);
  await started.promise;
  const status = await fetch(f.base + '/api/judge/status?device=other');
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.equal((await status.json()).state, 'busy');
  const busy = await f.post({ ...question, device: 'other' }, { accept: 'text/event-stream' });
  assert.equal(busy.status, 503);
  assert.match(busy.headers.get('content-type'), /application\/json/);
  assert.equal(busy.headers.get('retry-after'), '10');
  assert.equal((await busy.json()).left, 10);
  finish.resolve();
  assert.equal((await (await running).json()).ok, true);
  const ready = await fetch(f.base + '/api/judge/status?device=other');
  assert.equal((await ready.json()).state, 'ready');
});

test('ordinary JSON request disconnection also cancels model work and releases capacity', async (t) => {
  const started = Promise.withResolvers(),
    aborted = Promise.withResolvers();
  let calls = 0;
  const f = await httpFixture(t, async (_url, { signal }) => {
    if (++calls > 1) return completion();
    started.resolve();
    await new Promise((_resolve, reject) =>
      signal.addEventListener(
        'abort',
        () => {
          aborted.resolve();
          reject(signal.reason);
        },
        { once: true },
      ),
    );
  });
  const controller = new AbortController();
  const running = f.post(question, {}, controller.signal);
  await started.promise;
  controller.abort();
  await assert.rejects(running);
  await aborted.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await (await f.post(question)).json()).ok, true);
});

test('HTTP cookies bind allowances to the verified account instead of a client-supplied account identifier', async (t) => {
  const f = await httpFixture(t, async () => completion(), { JUDGE_DAILY: '1' });
  const db = f.app.storage.accounts,
    now = Date.now();
  const user = db.create('judge-capacity@example.test', 'unused-in-this-test', now);
  db.addToken('verify-test', user.id, 'verify', now + 60000);
  db.consumeToken('verify-test', 'verify', now);
  const raw = 'a'.repeat(64);
  db.addSession(createHash('sha256').update(raw).digest('hex'), user.id, 'csrf-test', now + 60000);
  const cookie = 'deckhand_session=' + raw;
  assert.equal((await (await f.post(question, { cookie })).json()).left, 0);
  const result = await f.post(
    { q: 'Another device question?', device: 'another-browser', accountId: 'pretend-someone-else' },
    { cookie },
  );
  assert.equal((await result.json()).error, 'limit');
  const status = await fetch(f.base + '/api/judge/status?device=third-browser', {
    headers: { cookie },
  });
  assert.equal((await status.json()).left, 0);
  assert.equal((await (await f.post({ q: 'A guest question?', device: 'guest' })).json()).ok, true);
});

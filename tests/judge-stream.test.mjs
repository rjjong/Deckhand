import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeProgress } from '../server/services/judge-progress.mjs';
import { readOllamaStream } from '../server/services/ollama-stream.mjs';
import { askLocal } from '../server/services/local-ai.mjs';
import { createApp } from '../server/app.mjs';

const answer = {
  reasoning: 'The quoted rule applies.',
  answer: 'Yes.',
  cites: ['704.5f'],
  confident: true,
};
const question = {
  q: 'Does a creature with zero toughness die?',
  device: 'stream-test',
  rules: [
    { n: '704.5f', t: 'A creature with toughness 0 or less is put into its owner’s graveyard.' },
  ],
};
const env = { OLLAMA_URL: 'http://ollama:11434', JUDGE_COOLDOWN_SECONDS: '0' };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const completion = () =>
  Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify(answer) } });

function nativeStream() {
  let controller;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(value) {
      controller = value;
    },
  });
  return {
    response: new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }),
    emit: (value) => controller.enqueue(encoder.encode(JSON.stringify(value) + '\n')),
    close: () => controller.close(),
    fail: (error) => controller.error(error),
  };
}

async function listen(t, fetchImpl) {
  const app = createApp({ databasePath: ':memory:', env, fetchImpl });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  return `http://127.0.0.1:${app.server.address().port}/api/judge`;
}

test('unfinished Judge JSON decodes escaped strings without exposing nested fields or syntax', () => {
  const value = {
    metadata: { answer: 'Nested text must not appear.' },
    reasoning: 'A "quote", a \\slash, a\nnewline and 🔥.',
    answer: 'Yes. It applies.',
    cites: ['704.5f'],
  };
  const encoded = JSON.stringify(value);
  for (let end = 0; end <= encoded.length; end++) {
    const progress = judgeProgress(encoded.slice(0, end));
    for (const [key, text] of Object.entries(progress)) {
      assert.ok(['reasoning', 'answer'].includes(key));
      assert.ok(value[key].startsWith(text), JSON.stringify({ end, progress }));
      assert.doesNotMatch(text, /[\ud800-\udbff]$/);
    }
  }
  assert.deepEqual(judgeProgress(encoded), { reasoning: value.reasoning, answer: value.answer });
  assert.deepEqual(judgeProgress('{"reasoning":"hello\\u12'), { reasoning: 'hello' });
  assert.deepEqual(judgeProgress('{"reasoning":"hello\\'), { reasoning: 'hello' });
});

test('Ollama streaming handles split UTF-8, multiple lines, and a final line without a newline', async () => {
  const expected = JSON.stringify({ ...answer, reasoning: '🔥 A quoted rule.' });
  const bytes = new TextEncoder().encode(
    JSON.stringify({ done: false, message: { content: expected } }) +
      '\n' +
      JSON.stringify({ done: true, done_reason: 'stop', message: { content: '' } }),
  );
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 3)
          controller.enqueue(bytes.slice(offset, offset + 3));
        controller.close();
      },
    }),
  );
  const tokens = [];
  assert.equal(await readOllamaStream(response, (token) => tokens.push(token)), expected);
  assert.equal(tokens.join(''), expected);
});

test('incomplete and truncated Ollama streams cannot become completed answers', async () => {
  for (const end of [null, { done: true, done_reason: 'length' }]) {
    const stream = nativeStream();
    stream.emit({ message: { content: JSON.stringify(answer) }, done: false });
    if (end) stream.emit(end);
    stream.close();
    await assert.rejects(
      readOllamaStream(stream.response, () => {}),
      /shape/,
    );
  }
});

test('an already-cancelled request neither calls the model nor blocks the following request', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return completion();
  };
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (await askLocal(env, fetchImpl, 'system', 'question', { signal: controller.signal })).error,
    'cancelled',
  );
  assert.equal((await askLocal(env, fetchImpl, 'system', 'question')).provider, 'ollama');
  assert.equal(calls, 1);
});

test('a streaming timeout includes the response body and releases the model lane', async () => {
  let calls = 0;
  const fetchImpl = async (_url, { signal }) => {
    if (++calls > 1) return completion();
    const stream = nativeStream();
    stream.emit({ done: false, message: { content: '{"reasoning":"Partial' } });
    signal.addEventListener('abort', () => stream.fail(signal.reason), { once: true });
    return stream.response;
  };
  const options = { onToken: () => {} };
  assert.equal(
    (
      await askLocal(
        { ...env, OLLAMA_TIMEOUT_MS: '2000' },
        fetchImpl,
        'system',
        'question',
        options,
      )
    ).error,
    'timeout',
  );
  assert.equal((await askLocal(env, fetchImpl, 'system', 'question', options)).provider, 'ollama');
});

test('HTTP streams progress before inference ends and returns a validated cacheable result', async (t) => {
  const started = Promise.withResolvers();
  const stream = nativeStream();
  let calls = 0;
  const url = await listen(t, async (_url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).stream, true);
    started.resolve();
    return stream.response;
  });
  const request = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(question),
    });
  const pending = request();
  await started.promise;
  stream.emit({ done: false, message: { content: '{"reasoning":"The quoted' } });
  const response = await pending;
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.match(response.headers.get('cache-control'), /no-transform/);
  const reader = response.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: progress/);
  assert.match(first, /The quoted/);
  assert.doesNotMatch(first, /event: result/);
  stream.emit({
    done: false,
    message: { content: JSON.stringify(answer).slice('{"reasoning":"The quoted'.length) },
  });
  stream.emit({ done: true, done_reason: 'stop' });
  stream.close();
  let rest = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    rest += new TextDecoder().decode(chunk.value);
  }
  const final = JSON.parse(rest.split('event: result\ndata: ')[1].split('\n')[0]);
  assert.equal(final.ok, true);
  assert.deepEqual(final.cites, ['704.5f']);
  assert.equal(final.cached, false);
  const cached = await request();
  assert.match(cached.headers.get('content-type'), /application\/json/);
  assert.equal((await cached.json()).cached, true);
  assert.equal(calls, 1);
});

test(
  'a browser disconnect aborts native generation and the following request can run',
  { timeout: 5000 },
  async (t) => {
    const started = Promise.withResolvers(),
      aborted = Promise.withResolvers();
    const stream = nativeStream();
    let calls = 0;
    const url = await listen(t, async (_url, { signal }) => {
      if (++calls > 1) return completion();
      signal.addEventListener(
        'abort',
        () => {
          stream.fail(signal.reason);
          aborted.resolve();
        },
        { once: true },
      );
      started.resolve();
      return stream.response;
    });
    const controller = new AbortController();
    const pending = fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(question),
      signal: controller.signal,
    });
    await started.promise;
    stream.emit({ done: false, message: { content: '{"reasoning":"Partial explanation' } });
    const response = await pending;
    await response.body.getReader().read();
    controller.abort();
    await aborted.promise;
    await tick();
    const next = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(question),
    });
    assert.equal((await next.json()).ok, true);
    assert.equal(calls, 2);
  },
);

test('failure after a partial response emits an error result and does not cache the draft', async (t) => {
  let calls = 0;
  const url = await listen(t, async () => {
    calls++;
    const stream = nativeStream();
    stream.emit({ done: false, message: { content: JSON.stringify(answer) } });
    stream.close();
    return stream.response;
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(question),
    });
    const text = await response.text();
    assert.match(text, /event: progress/);
    const final = JSON.parse(text.split('event: result\ndata: ')[1].split('\n')[0]);
    assert.equal(final.ok, false);
    assert.equal(final.error, 'shape');
  }
  assert.equal(calls, 2);
});

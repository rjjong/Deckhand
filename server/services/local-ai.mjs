/* Local inference shared by the rules judge and deck advisor. */
import { isIP } from 'node:net';
import { readOllamaStream } from './ollama-stream.mjs';
export const DEFAULT_LOCAL_MODEL = 'qwen3:4b-instruct-2507-q4_K_M';
export const MAX_LOCAL_PROMPT_CHARS = 9000;
const lanes = new WeakMap();

export function localConfig(env = {}) {
  const model = env.OLLAMA_MODEL?.trim() || DEFAULT_LOCAL_MODEL;
  let url;
  try {
    url = new URL(env.OLLAMA_URL);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const privateHost =
    /^(localhost|ollama|host\.docker\.internal|::1)$/.test(host) ||
    (isIP(host) === 4 && /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host));
  if (
    !privateHost ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    /cloud/i.test(model)
  )
    return null;
  return {
    url: url.origin,
    model,
    timeout: Math.min(85000, Math.max(2000, Number(env.OLLAMA_TIMEOUT_MS) || 75000)),
  };
}

function reserve(fetchImpl, url, signal) {
  signal?.throwIfAborted();
  let endpoints = lanes.get(fetchImpl);
  if (!endpoints) lanes.set(fetchImpl, (endpoints = new Map()));
  let lane = endpoints.get(url);
  if (!lane) endpoints.set(url, (lane = { active: false, waiting: [] }));
  const release = () => {
    const next = lane.waiting.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve(release);
    } else lane.active = false;
  };
  if (!lane.active) {
    lane.active = true;
    return Promise.resolve(release);
  }
  if (lane.waiting.length >= 3) return Promise.reject(new Error('busy'));
  return new Promise((resolve, reject) => {
    const entry = {
      resolve: (release) => {
        signal?.removeEventListener('abort', aborted);
        resolve(release);
      },
      timer: setTimeout(() => {
        lane.waiting.splice(lane.waiting.indexOf(entry), 1);
        signal?.removeEventListener('abort', aborted);
        reject(new Error('busy'));
      }, 10000),
    };
    const aborted = () => {
      const index = lane.waiting.indexOf(entry);
      if (index < 0) return;
      lane.waiting.splice(index, 1);
      clearTimeout(entry.timer);
      signal.removeEventListener('abort', aborted);
      reject(signal.reason);
    };
    lane.waiting.push(entry);
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

export async function askLocal(
  env,
  fetchImpl,
  sys,
  user,
  { schema = 'json', maxTokens = 640, onToken, signal } = {},
) {
  const config = localConfig(env);
  if (!config) return { error: 'notconfigured' };
  if (typeof user !== 'string' || sys.length + user.length > MAX_LOCAL_PROMPT_CHARS)
    return { error: 'context' };
  let release, timer;
  try {
    release = await reserve(fetchImpl, config.url, signal);
    signal?.throwIfAborted();
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), config.timeout);
    const response = await fetchImpl(config.url + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
      body: JSON.stringify({
        model: config.model,
        stream: !!onToken,
        think: false,
        keep_alive: '30m',
        format: schema,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        options: {
          temperature: 0,
          num_ctx: 4096,
          num_predict: maxTokens,
          num_thread: 3,
          num_batch: 128,
        },
      }),
    });
    if (!response.ok)
      return {
        error:
          response.status === 404
            ? 'model'
            : response.status === 503 || response.status === 429
              ? 'busy'
              : 'down',
        retryAfter: 10,
      };
    if (onToken) {
      const text = await readOllamaStream(response, onToken);
      return { text, provider: 'ollama', model: config.model };
    }
    const result = await response.json();
    if (result.done !== true || result.done_reason === 'length' || !result.message?.content)
      return { error: 'shape' };
    return { text: result.message.content, provider: 'ollama', model: config.model };
  } catch (error) {
    return {
      error: signal?.aborted
        ? 'cancelled'
        : ['busy', 'shape'].includes(error.message)
          ? error.message
          : error.name === 'AbortError'
            ? 'timeout'
            : 'down',
      retryAfter: 10,
    };
  } finally {
    clearTimeout(timer);
    release?.();
  }
}

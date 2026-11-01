const EMPTY_SEARCH = { object: 'list', data: [], has_more: false, total_cards: 0 };

// Shared across browser tabs/devices and GET/POST requests. Coalesce GETs,
// cache repeated queries, and stop all outgoing traffic on a rate limit.
export function createScryfallClient({ fetchImpl = fetch, gapMs = 250,
  now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let queue = Promise.resolve(), nextStart = 0, blockedUntil = 0, cacheBytes = 0;
  const pending = new Map(), cache = new Map();
  const limited = () => ({ status: 429, json: { object: 'error', code: 'rate_limited',
    details: 'Scryfall is cooling down. Please try again later.' },
    headers: { 'retry-after': String(Math.max(1, Math.ceil((blockedUntil - now()) / 1000))) } });
  function remember(key, result, ttl) {
    const bytes = Buffer.byteLength(JSON.stringify(result.json));
    if (bytes > 4 * 1024 * 1024) return;
    cache.set(key, { result, expires: now() + ttl, bytes });
    cacheBytes += bytes;
    while (cache.size > 100 || cacheBytes > 20 * 1024 * 1024) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).bytes;
      cache.delete(oldest);
    }
  }
  async function request(path, { method = 'GET', body } = {}) {
    const url = new URL(path, 'https://api.scryfall.com');
    if (url.origin !== 'https://api.scryfall.com' || !/^\/(cards|sets|catalog)(\/[a-zA-Z0-9._~-]+)*$/.test(url.pathname)
      || url.href.length > 8192 || !['GET', 'POST'].includes(method)
      || (method === 'POST' && url.pathname !== '/cards/collection')) {
      return { status: 400, json: { ok: false, error: 'invalid_scryfall_request' } };
    }
    url.searchParams.sort();
    const key = url.href;
    if (method === 'GET') {
      const entry = cache.get(key);
      if (entry && entry.expires > now()) return entry.result;
      if (entry) { cacheBytes -= entry.bytes; cache.delete(key); }
      if (pending.has(key)) return pending.get(key);
    }
    if (blockedUntil > now()) return limited();
    const work = queue.then(async () => {
      if (blockedUntil > now()) return limited();
      const pause = nextStart - now();
      if (pause > 0) await wait(pause);
      if (blockedUntil > now()) return limited();
      nextStart = now() + gapMs;
      const response = await fetchImpl(url.href, {
        method, headers: { accept: 'application/json', 'user-agent': 'Deckhand-Selfhost/1.0',
          ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20_000)
      });
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        const duration = /^\d+(\.\d+)?$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - now();
        blockedUntil = now() + Math.max(60_000, Number.isFinite(duration) ? duration : 0);
        return limited();
      }
      const json = await response.json();
      const result = response.status === 404 && json.code === 'not_found' && url.pathname === '/cards/search'
        ? { status: 200, json: { ...EMPTY_SEARCH } }
        : { status: response.status, json };
      if (method === 'GET' && (result.status === 200 || result.status === 404)) {
        remember(key, result, url.pathname === '/sets' || url.pathname.startsWith('/catalog/')
          ? 24 * 3600_000 : 10 * 60_000);
      }
      return result;
    });
    queue = work.catch(() => {});
    if (method !== 'GET') return work;
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }
  return { request };
}

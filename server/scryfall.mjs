import { createHash } from 'node:crypto';

const EMPTY_SEARCH = { object: 'list', data: [], has_more: false, total_cards: 0 };
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const MAX_CACHE_ENTRIES = 100, MAX_CACHE_BYTES = 20 * 1024 * 1024;

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function retryDelay(value, now) {
  if (!value) return null;
  const delay = /^\d+(\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : null;
}

// One queue serves every tab/device and both HTTP methods. SQLite retains the
// response cache, request budgets and cooldown across server restarts.
export function createScryfallClient({ fetchImpl = fetch, gapMs = 500, store,
  maxHourly = 600, maxDaily = 3000,
  now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let queue = Promise.resolve(), cacheBytes = 0;
  let guard = {};
  const pending = new Map(), cache = new Map();
  const persistGuard = () => store?.setJSON('guard', guard);
  const limited = () => ({
    status: 429,
    json: { object: 'error', code: guard.code || 'rate_limited',
      details: guard.code === 'request_budget_exceeded'
        ? 'Deckhand paused external card requests after reaching its request budget. Cached data is still available.'
        : 'External card requests are paused to protect this connection. Cached data is still available.' },
    headers: { 'retry-after': String(Math.max(1, Math.ceil(((guard.blockedUntil || now() + MINUTE) - now()) / 1000))) }
  });
  async function pause(code, delay) {
    guard.failures = Math.min(5, (guard.failures || 0) + 1);
    guard.code = code;
    guard.blockedUntil = now() + Math.max(MINUTE, delay);
    await persistGuard();
    return limited();
  }
  function rememberMemory(key, entry) {
    if (cache.has(key)) cacheBytes -= cache.get(key).bytes;
    cache.set(key, entry);
    cacheBytes += entry.bytes;
    while (cache.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).bytes;
      cache.delete(oldest);
    }
  }
  async function cached(key) {
    let entry = cache.get(key);
    if (!entry && store) entry = await store.get(key);
    if (!entry) return null;
    if (entry.expires <= now()) {
      if (cache.delete(key)) cacheBytes -= entry.bytes;
      await store?.delete(key);
      return null;
    }
    if (!cache.has(key)) rememberMemory(key, entry);
    return entry.result;
  }
  async function remember(key, result, ttl) {
    const bytes = Buffer.byteLength(JSON.stringify(result.json));
    if (bytes > 4 * 1024 * 1024) return;
    const entry = { result, expires: now() + ttl, bytes };
    rememberMemory(key, entry);
    if (!store) return;
    await store.setJSON(key, entry, { metadata: { expires: entry.expires, bytes, savedAt: now() } });
    const entries = [];
    let totalBytes = 0;
    for (const { key: savedKey } of (await store.list()).blobs) {
      if (!savedKey.startsWith('cache:')) continue;
      const meta = (await store.getMetadata(savedKey))?.metadata;
      if (!meta || meta.expires <= now()) { await store.delete(savedKey); continue; }
      totalBytes += meta.bytes;
      entries.push({ key: savedKey, ...meta });
    }
    entries.sort((a, b) => a.savedAt - b.savedAt);
    while (entries.length > MAX_CACHE_ENTRIES || totalBytes > MAX_CACHE_BYTES) {
      const oldest = entries.shift();
      totalBytes -= oldest.bytes;
      await store.delete(oldest.key);
    }
  }
  async function request(path, { method = 'GET', body } = {}) {
    let url, payload;
    try {
      url = new URL(path, 'https://api.scryfall.com');
      if (url.origin !== 'https://api.scryfall.com' || url.username || url.password
        || !/^\/(cards|sets|catalog)(\/[a-zA-Z0-9._~-]+)*$/.test(url.pathname)
        || url.href.length > 8192 || !['GET', 'POST'].includes(method)
        || (method === 'POST' && (url.pathname !== '/cards/collection'
          || !Array.isArray(body?.identifiers) || body.identifiers.length < 1 || body.identifiers.length > 75))) {
        throw new Error('Invalid card request');
      }
      url.hash = '';
      url.searchParams.sort();
      payload = method === 'POST' ? stableJson(body) : '';
    } catch {
      return { status: 400, json: { object: 'error', code: 'invalid_scryfall_request' } };
    }
    const key = 'cache:' + createHash('sha256').update(method + ' ' + url.href + ' ' + payload).digest('hex');
    const cacheable = url.pathname !== '/cards/random';
    if (cacheable) {
      const hit = await cached(key);
      if (hit) return hit;
    }
    if (pending.has(key)) return pending.get(key);
    const work = queue.then(async () => {
      if (store) guard = await store.get('guard') || {};
      if (guard.blockedUntil > now()) return limited();
      // Cache checks inside the queue also cover requests that arrived together.
      if (cacheable) {
        const hit = await cached(key);
        if (hit) return hit;
      }
      const delay = (guard.lastStart ?? -Infinity) + gapMs - now();
      if (delay > 0) await wait(delay);
      const hour = Math.floor(now() / HOUR), day = Math.floor(now() / DAY);
      if (guard.hour !== hour) { guard.hour = hour; guard.hourly = 0; }
      if (guard.day !== day) { guard.day = day; guard.daily = 0; }
      if (guard.hourly >= maxHourly || guard.daily >= maxDaily) {
        guard.code = 'request_budget_exceeded';
        guard.blockedUntil = Math.max(guard.hourly >= maxHourly ? (hour + 1) * HOUR : 0,
          guard.daily >= maxDaily ? (day + 1) * DAY : 0);
        await persistGuard();
        return limited();
      }
      guard.lastStart = now();
      guard.hourly = (guard.hourly || 0) + 1;
      guard.daily = (guard.daily || 0) + 1;
      await persistGuard();
      let response;
      try {
        response = await fetchImpl(url.href, {
          method, redirect: 'manual',
          headers: { accept: 'application/json', 'user-agent': 'Deckhand-Selfhost/1.0',
            ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
          ...(method === 'POST' ? { body: payload } : {}),
          signal: AbortSignal.timeout(20_000)
        });
      } catch {
        return pause('upstream_unavailable', MINUTE * 2 ** Math.min(guard.failures || 0, 4));
      }
      const retry = retryDelay(response.headers.get('retry-after'), now());
      if (response.status === 429 || response.status === 403
        || response.headers.get('cf-mitigated') === 'challenge'
        || /text\/html/i.test(response.headers.get('content-type') || '')) {
        return pause(response.status === 429 ? 'rate_limited' : 'upstream_blocked',
          Math.max(retry ?? 0, retry == null ? 15 * MINUTE * 2 ** Math.min(guard.failures || 0, 4) : MINUTE));
      }
      if (response.status >= 500 || (response.status >= 300 && response.status < 400)) {
        return pause('upstream_unavailable', Math.max(retry ?? 0, MINUTE * 2 ** Math.min(guard.failures || 0, 4)));
      }
      let json;
      try {
        if (!/application\/(?:[a-z0-9.+-]*\+)?json/i.test(response.headers.get('content-type') || '')) throw new Error('Not JSON');
        json = await response.json();
        if (!json || typeof json !== 'object') throw new Error('Invalid JSON');
      } catch {
        return pause('upstream_unavailable', MINUTE);
      }
      guard.failures = 0;
      guard.blockedUntil = 0;
      delete guard.code;
      await persistGuard();
      const result = response.status === 404 && json.code === 'not_found' && url.pathname === '/cards/search'
        ? { status: 200, json: { ...EMPTY_SEARCH } }
        : { status: response.status, json };
      if (cacheable && (result.status === 200 || result.status === 404)) {
        const ttl = result.status === 404 ? 5 * MINUTE
          : method === 'POST' || url.pathname === '/sets' || url.pathname.startsWith('/catalog/')
            || /^\/cards\/(?!search|autocomplete)/.test(url.pathname) ? DAY : 30 * MINUTE;
        await remember(key, result, ttl);
      }
      return result;
    });
    queue = work.catch(() => {});
    pending.set(key, work);
    try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
  }
  return { request };
}

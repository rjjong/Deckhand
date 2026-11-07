import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { openStorage } from './storage.mjs';
import { createDataCache, DATA_FILES } from './data.mjs';
import { createScryfallClient } from './scryfall.mjs';
import { handle as sync } from './services/sync.mjs';
import { handle as judge } from './services/judge.mjs';
import { handle as deckai, DECKAI_V } from './services/deckai.mjs';
import { handle as news } from './services/news.mjs';
import { scannerAssets } from '../scripts/scanner-assets.mjs';
import { createAccountService } from './services/accounts.mjs';
import { createMailer } from './mail.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STATIC = new Map([
  ...scannerAssets.map(({ target }) => ['/' + target, 'public/' + target]),
  ['/', 'public/index.html'], ['/index.html', 'public/index.html'], ['/sw.js', 'public/sw.js'],
  ...['app.js', 'app.css', 'app.js.map', 'app.css.map', 'images/deckhand-badge.webp']
    .map(name => ['/assets/' + name, 'public/assets/' + name]),
  ['/manifest.json', 'manifest.json'], ['/version.json', 'version.json'],
  ['/favicon.ico', 'icon-192.png'],
  ...['icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png',
    'og-image.png', 'badge-d.png'].map(name => ['/' + name, name])
]);
const MIME = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  png: 'image/png', webp: 'image/webp', map: 'application/json; charset=utf-8', gz: 'application/gzip', wasm: 'application/wasm' };

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': MIME.json, 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('Use application/json'), { status: 415 });
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Expected a JSON object'), { status: 400 });
  }
  return body;
}

/* Cached replies and early errors retain ordinary JSON status codes. Model
   output uses SSE; heartbeats also keep cold loads alive through the tunnel. */
async function streamResult(res, run) {
  if (res.destroyed) return;
  const controller = new AbortController();
  let started = false;
  const start = () => {
    if (started) return;
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no',
      'x-content-type-options': 'nosniff' });
    res.flushHeaders();
    started = true;
  };
  const send = (event, value) => {
    if (res.destroyed || res.writableEnded) return;
    start();
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(value) + '\n\n');
  };
  const closed = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', closed);
  const heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) return;
    start();
    res.write(': keep-alive\n\n');
  }, 10000);
  heartbeat.unref();
  try {
    const result = await run({ signal: controller.signal,
      onProgress: fields => send('progress', fields) });
    if (res.destroyed) return;
    if (!started) return json(res, result.status, result.json);
    send('result', result.json);
    res.end();
  } catch (error) {
    if (res.destroyed) return;
    if (!started) throw error;
    send('result', { ok: false, error: 'server' });
    res.end();
  } finally {
    clearInterval(heartbeat);
    res.off('close', closed);
  }
}

export function createApp({ databasePath = resolve('./var/deckhand.dev.sqlite'),
  dataDirectory = resolve('./var/data-sample'), env = process.env, fetchImpl = fetch, mailer } = {}) {
  const storage = openStorage(databasePath);
  const accounts = createAccountService({ storage, env, mailer: mailer || createMailer(env, fetchImpl) });
  const cache = createDataCache({ directory: dataDirectory });
  const scryfall = createScryfallClient({ fetchImpl, store: storage.store('scryfall-http') });
  let newsCache, newsPending;
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const api = path.startsWith('/api/') ? path.slice('/api/'.length) : null;
      if (req.headers.origin) {
        let sameOrigin = false;
        try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch {}
        if (!sameOrigin) return json(res, 403, { ok: false, error: 'origin' });
      }
      if (api !== null) {
        // A full navigation bypasses the cached PWA shell, allowing an Access
        // proxy to renew its login before returning to the application.
        if (api === 'login' && req.method === 'GET') {
          res.writeHead(302, { location: '/', 'cache-control': 'no-store' });
          return res.end();
        }
        if (api.startsWith('scryfall/')) {
          if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { ok: false, error: 'method' });
          const body = req.method === 'POST' ? await readBody(req, 128 * 1024) : undefined;
          const query = new URL(req.url, 'http://localhost');
          const result = await scryfall.request('/' + api.slice('scryfall/'.length) + query.search,
            { method: req.method, body });
          return json(res, result.status, result.json, result.headers);
        }
        if (api === 'health' && req.method === 'GET') {
          storage.healthy();
          return json(res, 200, { ok: true, storage: 'sqlite' });
        }
        if (api === 'account') {
          if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { ok: false, error: 'method' });
          const body = req.method === 'POST' ? await readBody(req, 4096) : null;
          const result = await accounts.handle(req, body);
          return json(res, result.status, result.json, result.headers);
        }
        if (api === 'news' && req.method === 'GET') {
          if (!newsCache || newsCache.expires < Date.now()) {
            if (!newsPending) newsPending = news({ fetchImpl }).then(value => {
              newsCache = { value, expires: Date.now() + 30 * 60_000 };
            }).finally(() => { newsPending = null; });
            await newsPending;
          }
          return json(res, 200, newsCache.value, { 'cache-control': 'public, max-age=1800' });
        }
        const handler = { sync, judge, deckai }[api];
        if (!Object.hasOwn({ sync, judge, deckai }, api)) return json(res, 404, { ok: false, error: 'not_found' });
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method' }, { allow: 'POST' });
        const auth = api === 'sync' ? accounts.authorize(req) : null;
        if (auth?.failure) return json(res, auth.failure.status, auth.failure.json);
        const body = await readBody(req, api === 'sync' ? 64 * 1024 * 1024 : 1024 * 1024);
        const deps = api === 'sync' ? { sync: storage.sync, accountScope: auth.user.sync_space }
          : { store: storage.store, env, fetch: fetchImpl, ip: req.socket.remoteAddress || '' };
        if (api === 'judge' && String(req.headers.accept || '').includes('text/event-stream'))
          return await streamResult(res, hooks => judge(body, { ...deps, ...hooks }));
        const result = await handler(body, deps);
        if (api === 'deckai') result.json.v = DECKAI_V;
        return json(res, result.status, result.json);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { ok: false, error: 'method' }, { allow: 'GET, HEAD' });
      }
      if (path === '/runtime-config.js') {
        const dataFiles = [];
        for (const name of DATA_FILES) {
          try { await cache.get(name); dataFiles.push(name); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        res.writeHead(200, { 'content-type': MIME.js, 'cache-control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined :
          'window.DECKHAND_CONFIG = ' + JSON.stringify({ selfHosted: true,
            scryfallBase: '/api/scryfall', dataFiles }) + ';');
      }
      const name = path.slice(1);
      let file;
      if (STATIC.has(path)) file = join(ROOT, STATIC.get(path));
      else if (DATA_FILES.has(name)) {
        try { file = await cache.get(name); }
        catch (error) {
          return json(res, error.code === 'ENOENT' ? 404 : 503, { ok: false, error: 'data_unavailable' });
        }
      } else return json(res, 404, { ok: false, error: 'not_found' });
      const info = await stat(file);
      res.writeHead(200, { 'content-type': MIME[file.split('.').pop()] || 'application/octet-stream',
        'content-length': info.size, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(file), res);
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.destroy();
      if (!error.status) console.error(error);
      json(res, error.status || 500, { ok: false, error: error.status ? error.message : 'server' });
    }
  });
  return { server, storage, async close() {
    if (server.listening) {
      await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
    }
    await accounts.flush();
    storage.close();
  } };
}

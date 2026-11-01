import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { openStorage } from './storage.mjs';
import { createDataCache, DATA_FILES } from './data.mjs';
import { createScryfallClient } from './scryfall.mjs';
import { handle as sync } from '../netlify/functions/sync.mjs';
import { handle as judge } from '../netlify/functions/judge.mjs';
import { handle as deckai, DECKAI_V } from '../netlify/functions/deckai.mjs';
const { handler: news } = createRequire(import.meta.url)('../netlify/functions/news.js');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STATIC = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/sw.js', 'sw.js'],
  ['/navigation.css', 'navigation.css'],
  ['/layout.css', 'layout.css'],
  ['/manifest.json', 'manifest.json'], ['/version.json', 'version.json'],
  ['/favicon.ico', 'icon-192.png'],
  ...['icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png',
    'og-image.png', 'badge-d.png', 'screenshot-decklist.png', 'screenshot-inspiration.png',
    'screenshot-life.png'].map(name => ['/' + name, name])
]);
const MIME = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  png: 'image/png', gz: 'application/gzip' };

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

export function createApp({ databasePath = resolve('./var/deckhand.dev.sqlite'),
  dataDirectory = resolve('./var/data-sample'), env = process.env, fetchImpl = fetch } = {}) {
  const storage = openStorage(databasePath);
  const cache = createDataCache({ directory: dataDirectory });
  const scryfall = createScryfallClient({ fetchImpl });
  let newsCache, newsPending;
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const api = path.startsWith('/.netlify/functions/')
        ? path.slice('/.netlify/functions/'.length)
        : path.startsWith('/api/') ? path.slice('/api/'.length) : null;
      if (req.headers.origin) {
        let sameOrigin = false;
        try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch {}
        if (!sameOrigin) return json(res, 403, { ok: false, error: 'origin' });
      }
      if (api !== null) {
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
        if (api === 'news' && req.method === 'GET') {
          if (!newsCache || newsCache.expires < Date.now()) {
            if (!newsPending) newsPending = news().then(value => {
              newsCache = { value, expires: Date.now() + 30 * 60_000 };
            }).finally(() => { newsPending = null; });
            await newsPending;
          }
          const result = newsCache.value;
          res.writeHead(result.statusCode, { 'content-type': MIME.json, 'cache-control': 'public, max-age=1800' });
          return res.end(result.body);
        }
        if (api === 'push-subscribe' || api === 'push-check') {
          return json(res, 501, { ok: false, error: 'disabled', message: 'Push notifications are disabled on this server.' });
        }
        const handler = { sync, judge, deckai }[api];
        if (!Object.hasOwn({ sync, judge, deckai }, api)) return json(res, 404, { ok: false, error: 'not_found' });
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method' }, { allow: 'POST' });
        const body = await readBody(req, api === 'sync' ? 64 * 1024 * 1024 : 1024 * 1024);
        const deps = api === 'sync' ? { store: storage.store('deckhand-sync') }
          : { store: storage.store, env, fetch: fetchImpl, ip: req.socket.remoteAddress || '' };
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
          'window.DECKHAND_CONFIG = ' + JSON.stringify({ selfHosted: true, webPushEnabled: false,
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
    storage.close();
  } };
}

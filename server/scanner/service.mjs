import { Worker } from 'node:worker_threads';
import { isIP } from 'node:net';
import { MODEL, DIMENSIONS, catalogStatus } from './catalog.mjs';

const failure = (status, message) => Object.assign(new Error(message), { status });

export function createScannerService({ directory, autoUpdate = true } = {}) {
  let worker, closed = false, sequence = 0, restart;
  let status = catalogStatus(null);
  const pending = new Map(), clients = new Map();
  function start() {
    if (closed) return;
    worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { directory, autoUpdate } });
    worker.on('message', message => {
      if (message.type === 'status') { status = message.status; return; }
      const job = pending.get(message.id);
      if (!job) return;
      clearTimeout(job.timer);
      pending.delete(message.id);
      if (message.error) job.reject(failure(503, message.error));
      else job.resolve(message.result);
    });
    worker.on('error', error => console.error('Scanner worker:', error.message));
    worker.on('exit', () => {
      status = { ...status, ready: false };
      for (const job of pending.values()) { clearTimeout(job.timer); job.reject(failure(503, 'catalog_unavailable')); }
      pending.clear();
      if (!closed) { restart = setTimeout(start, 5000); restart.unref(); }
    });
  }
  start();
  return {
    status: () => ({ ...status }),
    async lookup(body, req, env = {}) {
      if (!body || Object.keys(body).some(key => !['model', 'embedding'].includes(key)) ||
          body.model !== MODEL || !Array.isArray(body.embedding) || body.embedding.length !== DIMENSIONS ||
          !body.embedding.every(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1.01))
        throw failure(400, 'invalid_embedding');
      const norm = Math.hypot(...body.embedding);
      if (norm < 0.95 || norm > 1.05) throw failure(400, 'invalid_embedding');
      if (!status.ready) throw failure(503, 'catalog_unavailable');
      // Trust Cloudflare's address only on the same internal proxy path as
      // account requests. LAN clients cannot choose another caller's budget.
      const remote = req.socket.remoteAddress || '';
      const internal = /^(::ffff:)?(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(remote) || remote === '::1';
      const forwarded = req.headers['cf-connecting-ip'];
      const ip = env.TRUST_CLOUDFLARE_PROXY === '1' && internal && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : remote;
      const now = Date.now();
      const previous = clients.get(ip);
      const client = { at: now, tokens: Math.min(40, (previous?.tokens ?? 40) + (now - (previous?.at ?? now)) / 50) };
      clients.set(ip, client);
      // Twenty/sec with a short burst budget accommodates rotations and shared
      // home networks. The global queue separately bounds CPU work at all times.
      if (client.tokens < 1 || pending.size >= 8) throw failure(429, 'scanner_busy');
      client.tokens--;
      if (clients.size > 1024) for (const [key, value] of clients) if (now - value.at >= 2000) clients.delete(key);
      if (clients.size > 2048) clients.delete(clients.keys().next().value);
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          status = { ...status, ready: false };
          void worker.terminate();
          reject(failure(503, 'scanner_busy'));
        }, 5000);
        pending.set(id, { resolve, reject, timer });
        worker.postMessage({ type: 'lookup', id, embedding: body.embedding.map(value => value / norm) });
      });
    },
    async close() {
      closed = true;
      clearTimeout(restart);
      await worker.terminate();
    },
  };
}

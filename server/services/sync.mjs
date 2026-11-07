/* Record exchange on this server. The HTTP route always supplies an
   authenticated accountScope. Legacy code helpers remain for migration. */
import crypto from 'node:crypto';
import records from '../../shared/sync-records.cjs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function idOf(code) {
  if (typeof code !== 'string' || !/^[A-Z0-9\s-]+$/i.test(code)) return null;
  const clean = code.toUpperCase().replace(/[\s-]/g, '');
  if (clean.length < 16 || clean.length > 40) return null;
  return crypto
    .createHash('sha256')
    .update('deckhand-sync:' + clean)
    .digest('hex');
}

export async function handle(body, ctx) {
  if (!ctx?.sync) return { status: 503, json: { ok: false, error: 'store' } };
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { status: 400, json: { ok: false, error: 'request' } };
  if (!ctx.accountScope && body.op === 'create') {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = [...crypto.randomBytes(24)]
        .map((byte) => ALPHABET[byte % ALPHABET.length])
        .join('');
      if (ctx.sync.create(idOf(code)))
        return {
          status: 201,
          json: { ok: true, code: code.match(/.{4}/g).join('-'), rev: 0, protocol: 2 },
        };
    }
    return { status: 503, json: { ok: false, error: 'busy' } };
  }
  const id = ctx.accountScope || idOf(body.code);
  if (!id) return { status: 400, json: { ok: false, error: 'code' } };
  if (body.op !== 'probe' && body.op !== 'sync')
    return { status: 400, json: { ok: false, error: 'op' } };
  if (ctx.sync.probe(id) === null && ctx.legacy) {
    const old = await ctx.legacy.get(id);
    if (old && typeof old === 'object' && old.keys) ctx.sync.migrate(id, old);
  }
  const rev = ctx.sync.probe(id);
  if (rev === null) return { status: 404, json: { ok: false, error: 'code_not_found' } };
  if (body.op === 'probe') return { status: 200, json: { ok: true, rev, protocol: 2 } };
  const since = body.since ?? 0;
  const changes = body.changes ?? {};
  const after = body.after ?? null;
  if (
    !Number.isSafeInteger(since) ||
    since < 0 ||
    !changes ||
    typeof changes !== 'object' ||
    Array.isArray(changes) ||
    (after &&
      (!Number.isSafeInteger(after.r) ||
        after.r < since ||
        !Number.isSafeInteger(after.until) ||
        after.until < after.r ||
        typeof after.k !== 'string')) ||
    (after && Object.keys(changes).length)
  )
    return { status: 400, json: { ok: false, error: 'request' } };
  for (const [key, change] of Object.entries(changes)) {
    if (
      !records.syncRecordAllowed(key) ||
      !change ||
      !Number.isFinite(change.t) ||
      change.t <= 0 ||
      change.t > Number.MAX_SAFE_INTEGER ||
      (!change.del &&
        (!records.syncRecordValid(key, change.v) || Buffer.byteLength(change.v) > 16_000_000))
    )
      return { status: 400, json: { ok: false, error: 'change' } };
  }
  try {
    const result = ctx.sync.exchange(id, { since, changes, after });
    return { status: 200, json: { ok: true, ...result, protocol: 2 } };
  } catch (error) {
    if (error.status) return { status: error.status, json: { ok: false, error: error.message } };
    throw error;
  }
}

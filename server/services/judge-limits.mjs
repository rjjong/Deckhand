import { createHash } from 'node:crypto';
import { localAvailability } from './local-ai.mjs';

const dayMs = 86400000;
const bounded = (value, fallback, min, max) => {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= min ? Math.min(max, Math.floor(number)) : fallback;
};

export function judgePolicy(env = {}) {
  return {
    limit: bounded(env.JUDGE_DAILY, 10, 1, 10000),
    global: bounded(env.JUDGE_GLOBAL, 100, 1, 100000),
    cooldownSeconds: bounded(env.JUDGE_COOLDOWN_SECONDS, 30, 0, 3600),
  };
}

export function judgeClientKey(device, deps) {
  // A signed-in account shares its allowance across browsers and devices.
  // Guests retain the existing browser/IP identity; this is not proof of a person.
  const identity = deps.accountId
    ? 'account|' + deps.accountId
    : String(device || '').slice(0, 200) + '|' + (deps.ip || '');
  return createHash('sha256').update(identity).digest('hex').slice(0, 24);
}

export async function judgeAllowance(device, deps) {
  const now = deps.now ? deps.now() : Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const policy = judgePolicy(deps.env);
  const client = judgeClientKey(device, deps);
  const count = deps.store?.('judge-count');
  const keys = { personal: 'd|' + day + '|' + client, global: 'g|' + day, last: 'last|' + client };
  const [personal, global, last] = count
    ? await Promise.all([count.get(keys.personal), count.get(keys.global), count.get(keys.last)])
    : [];
  const used = Math.max(0, Number(personal?.n) || 0);
  const total = Math.max(0, Number(global?.n) || 0);
  const cooldownLeft = Math.max(
    0,
    Math.ceil(((Number(last?.t) || 0) + policy.cooldownSeconds * 1000 - now) / 1000),
  );
  return {
    ...policy,
    left: Math.max(0, policy.limit - used),
    resetAfter: Math.max(1, Math.ceil(((Math.floor(now / dayMs) + 1) * dayMs - now) / 1000)),
    cooldownLeft,
    used,
    total,
    now,
    count,
    keys,
  };
}

export function judgeRefusal(allowance) {
  const { left, limit, global, total, resetAfter, cooldownLeft } = allowance;
  if (!left) return { error: 'limit', left, limit, retryAfter: resetAfter };
  if (total >= global) return { error: 'quota', left, limit, retryAfter: resetAfter };
  if (cooldownLeft) return { error: 'cooldown', left, limit, retryAfter: cooldownLeft };
  return null;
}

// Called only while holding the shared model slot. Busy/cache requests skip it.
export async function consumeJudgeAllowance(allowance) {
  const { count, keys, used, total, now } = allowance;
  if (!count) return;
  await count.setJSON(keys.personal, { n: used + 1 });
  await count.setJSON(keys.global, { n: total + 1 });
  await count.setJSON(keys.last, { t: now });
}

export async function judgeStatus(device, deps) {
  const availability = localAvailability(deps.env, deps.fetch);
  const allowance = await judgeAllowance(device, deps);
  const refusal = judgeRefusal(allowance);
  return {
    ok: true,
    ...availability,
    left: allowance.left,
    limit: allowance.limit,
    cooldownSeconds: allowance.cooldownSeconds,
    state: !availability.configured
      ? 'notconfigured'
      : availability.busy
        ? 'busy'
        : refusal?.error || 'ready',
    retryAfter: availability.busy ? 10 : refusal?.retryAfter || 0,
  };
}

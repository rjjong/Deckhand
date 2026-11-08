/* Rules questions use the server's local model with supplied Oracle text and rule excerpts. */
import crypto from 'node:crypto';
import { askLocal, localConfig, DEFAULT_LOCAL_MODEL, MAX_LOCAL_PROMPT_CHARS } from './local-ai.mjs';
import { judgeProgress } from './judge-progress.mjs';
import { judgeAllowance, judgeRefusal, consumeJudgeAllowance } from './judge-limits.mjs';

const MAX_Q = 500,
  MAX_CARDS = 5,
  MAX_RULES = 40,
  MAX_RULE_CHARS = 18000,
  MAX_CARD_CHARS = 2500,
  MAX_PROMPT_CHARS = MAX_LOCAL_PROMPT_CHARS;

const modelOf = (env) => localConfig(env)?.model || DEFAULT_LOCAL_MODEL;
export function systemPrompt() {
  return [
    'Answer the rules question using only the supplied card texts, rulings and rules excerpts.',
    'Quote the relevant words, apply their exact conditions to the event, then conclude. Keep differently named actions distinct. Do not add exceptions the sources do not state. Read negative conditions literally.',
    'If required card text or a relevant fact is missing, say what is missing instead of guessing.',
    'Reply in English with one JSON object. Write these fields in order:',
    'reasoning: a short explanation, at most 100 words, quoting the evidence.',
    'answer: one or two sentences directly answering the question, starting with Yes or No when appropriate.',
    'cites: an array containing only rule numbers supplied in the excerpts.',
    'confident: true when the supplied evidence determines the answer; false when a necessary fact is missing.',
  ].join('\n');
}

export function clean(body) {
  const q = String((body && body.q) || '')
    .trim()
    .slice(0, MAX_Q);
  const lang = 'en';
  const cards = (Array.isArray(body && body.cards) ? body.cards : [])
    .slice(0, MAX_CARDS)
    .map((c) => ({
      name: String((c && c.name) || '').slice(0, 150),
      type: String((c && c.type) || '').slice(0, 150),
      oracle: String((c && c.oracle) || '').slice(0, MAX_PROMPT_CHARS + 1),
      rulings: (Array.isArray(c && c.rulings) ? c.rulings : [])
        .slice(0, 12)
        .map((r) => String(r || '').slice(0, MAX_PROMPT_CHARS + 1)),
    }))
    .filter((c) => c.name);
  let room = MAX_RULE_CHARS;
  const rules = [];
  for (const r of (Array.isArray(body && body.rules) ? body.rules : []).slice(0, MAX_RULES)) {
    const n = String((r && r.n) || '').trim(),
      t = String((r && r.t) || '').trim();
    if (!/^\d{3}(\.\d+[a-z]?)?$/.test(n) || !t) continue;
    if (t.length > room) break;
    room -= t.length;
    rules.push({ n, t });
  }
  return { q, lang, cards, rules };
}

export function userMessage(
  c,
  maxChars = MAX_PROMPT_CHARS - systemPrompt().length,
  readRules = [],
) {
  const cardTxt = c.cards
    .map((k) => {
      let s = `${k.name}${k.type ? ' — ' + k.type : ''}\n${k.oracle}`;
      for (const ruling of k.rulings) {
        const text = '\nOfficial ruling: ' + ruling;
        if (s.length + text.length <= MAX_CARD_CHARS) s += text;
      }
      return s;
    })
    .join('\n\n');
  let message = [
    'QUESTION:',
    c.q,
    '',
    'CARDS:',
    cardTxt || '(none tagged)',
    '',
    'COMPREHENSIVE RULES EXCERPTS:',
  ].join('\n');
  if (message.length > maxChars) return null;
  let included = 0;
  for (const rule of c.rules) {
    const text = '\n' + rule.n + ' ' + rule.t;
    if (message.length + text.length > maxChars) continue;
    message += text;
    readRules.push(rule.n);
    included++;
  }
  // Keep whole excerpts and card texts. Ask for a smaller question when
  // no supplied rule fits, instead of silently sending a partial rule.
  return c.rules.length && !included ? null : message;
}

/* The model's reply -> our shape. Tolerates prose around the JSON. */
export function parseReply(text) {
  let o = null;
  try {
    o = JSON.parse(text);
  } catch (e) {
    const m = String(text || '').match(/\{[\s\S]*\}/);
    if (m) {
      try {
        o = JSON.parse(m[0]);
      } catch (e2) {
        o = null;
      }
    }
  }
  if (!o || typeof o.answer !== 'string' || !o.answer.trim()) return null;
  const cites = Array.from(
    new Set(
      (Array.isArray(o.cites) ? o.cites : [])
        .map((x) =>
          String(x)
            .trim()
            .replace(/^(CR|rule)\s*/i, '')
            .replace(/\.$/, ''),
        )
        .filter((x) => /^\d{3}(\.\d+[a-z]?)?$/.test(x)),
    ),
  ).slice(0, 12);
  return {
    answer: o.answer.trim().slice(0, 600),
    reasoning: String(o.reasoning || '')
      .trim()
      .slice(0, 2000),
    cites,
    confident: o.confident === true,
  };
}

export async function askJudge(
  env,
  fetchImpl,
  sys,
  user,
  { onProgress, signal, beforeStart, onStart } = {},
) {
  let previous = '';
  const onToken = onProgress
    ? (_token, text) => {
        const fields = judgeProgress(text);
        const current = JSON.stringify(fields);
        if (current !== previous && (fields.reasoning || fields.answer)) {
          previous = current;
          onProgress(fields);
        }
      }
    : undefined;
  const result = await askLocal(env, fetchImpl, sys, user, {
    schema: 'json',
    onToken,
    signal,
    beforeStart,
    onStart,
  });
  if (result.error) return result;
  const out = parseReply(result.text);
  return out ? { ...out, provider: result.provider, model: result.model } : { error: 'shape' };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* Testable core: deps = { env, fetch, store(name) -> {get(key,{type}), setJSON(key,val)} | null, ip } */
export async function handle(body, deps) {
  const env = deps.env || {};
  const c = clean(body);
  if (c.q.length < 4) return { status: 400, json: { ok: false, error: 'empty' } };
  const sys = systemPrompt(),
    readRules = [],
    user = userMessage(c, MAX_PROMPT_CHARS - sys.length, readRules);
  const cacheKey = sha(JSON.stringify(['local-v1', modelOf(env), sys, user]));
  const cache = deps.store ? deps.store('judge-cache') : null;
  // 1. asked before: free and instant
  try {
    const hit = cache && (await cache.get(cacheKey, { type: 'json' }));
    if (hit && hit.answer) {
      const { left, limit } = await judgeAllowance(body?.device, deps);
      return { status: 200, json: Object.assign({ ok: true, cached: true, left, limit }, hit) };
    }
  } catch (e) {}
  if (!localConfig(env)) return { status: 503, json: { ok: false, error: 'notconfigured' } };
  if (!user) return { status: 400, json: { ok: false, error: 'context' } };
  // Quotas are checked inside the shared model slot. Busy requests never
  // enter the quota transaction, and cache hits remain usable at the limit.
  let allowance,
    charged = false;
  const out = await askJudge(env, deps.fetch, sys, user, {
    ...deps,
    beforeStart: async () => {
      allowance = await judgeAllowance(body?.device, deps);
      return judgeRefusal(allowance);
    },
    onStart: async () => {
      await consumeJudgeAllowance(allowance);
      charged = true;
    },
  });
  const { left: remaining, limit } = allowance || (await judgeAllowance(body?.device, deps));
  const left = Math.max(0, remaining - Number(charged));
  if (out.error) {
    const status = ['limit', 'quota', 'cooldown'].includes(out.error)
      ? 429
      : ['busy', 'notconfigured'].includes(out.error)
        ? 503
        : out.error === 'context'
          ? 400
          : 502;
    return {
      status,
      headers: out.retryAfter ? { 'retry-after': String(out.retryAfter) } : undefined,
      json: { ok: false, ...out, left, limit },
    };
  }
  const allowed = new Set(readRules);
  if (out.cites.some((number) => !allowed.has(number))) {
    out.confident = false;
    out.cites = out.cites.filter((number) => allowed.has(number));
  }
  out.readRules = readRules;
  try {
    // only answers the AI is sure of are kept for the next player
    if (cache && out.confident)
      await cache.setJSON(cacheKey, {
        answer: out.answer,
        reasoning: out.reasoning,
        cites: out.cites,
        confident: out.confident,
        provider: out.provider,
        model: out.model,
        readRules,
        t: Date.now(),
      });
  } catch (e) {}
  return {
    status: 200,
    json: Object.assign({ ok: true, cached: false, left, limit }, out),
  };
}

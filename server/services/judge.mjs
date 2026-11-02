/* Deckhand rules judge, run by the self-hosted Node.js server.

   The app sends: the question, the cards tagged with @ (oracle text and
   official rulings, from the phone's own card database) and the Comprehensive
   Rules that its local search found for the question. This function asks a
   Groq to answer from THAT material only, and returns
     { ok, answer, reasoning, cites: ["603.2", ...], confident, provider, cached }.

   Use a Groq Free account. Billing tier is controlled by Groq, not an API
   request option. There are no alternate providers or automatic retries.
   A rate limit pauses requests; the app still shows its local rule search.

   Guards, because a public endpoint is a free AI for anyone who finds it:
   - size limits on everything that comes in;
   - JUDGE_DAILY (default 20) attempts per device per day, and
     JUDGE_GLOBAL (default 800) attempts for the whole app per day (SQLite);
   - the same question about the same cards comes from the cache, free.
   The rules text and system prompt live HERE, so a caller cannot change
   the instructions. */
import crypto from 'node:crypto';

const MAX_Q = 500,
  MAX_CARDS = 5,
  MAX_RULES = 40,
  MAX_RULE_CHARS = 18000,
  MAX_CARD_CHARS = 2500,
  MAX_PROMPT_CHARS = 14000;

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const modelOf = (env) => env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    reasoning: { type: 'string' },
    cites: { type: 'array', items: { type: 'string' } },
    confident: { type: 'boolean' },
  },
  required: ['answer', 'reasoning', 'cites', 'confident'],
  additionalProperties: false,
};

export function systemPrompt() {
  return [
    'You are a Magic: The Gathering rules judge assistant answering a player at the table.',
    'Use ONLY the Comprehensive Rules excerpts and card texts/rulings given in the user message. Do not rely on memory of other rules or cards.',
    'Card texts are the official Oracle text. Official rulings for a card outrank your own reading.',
    'Read every card text word for word. Words such as card, token, permanent, spell, creature and player have exact rules meanings (for example 108.2: a token is not a card). A trigger only happens when the event matches its wording exactly.',
    'Work it out in order: 1) what each card text says exactly, 2) what event happens in the question, 3) whether that event matches the wording, 4) the result.',
    'If the question names a card whose text is not given, say that you need that card and do not guess what it does.',
    'Cite the rule numbers you rely on (for example 603.2 or 702.19b). Only cite numbers that appear in the excerpts.',
    'If the excerpts do not settle the question, say so plainly, give your best reading and set "confident" to false.',
    'Write in English.',
    'Reply with ONE JSON object and nothing else:',
    '{"answer": "one or two sentences, starting with Yes, No, or the direct outcome",',
    ' "reasoning": "a short explanation, at most 150 words, quoting the key rule words",',
    ' "cites": ["rule numbers used"], "confident": true}',
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

async function chat(fetchImpl, key, model, sys, user) {
  const gpt = /^openai\/gpt-oss-(20|120)b$/.test(model);
  const req = {
    model,
    temperature: 0.1,
    max_completion_tokens: 2048,
    stream: false,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
  };
  req.response_format = gpt
    ? {
        type: 'json_schema',
        json_schema: { name: 'judge_answer', strict: true, schema: REPLY_SCHEMA },
      }
    : { type: 'json_object' };
  if (gpt) {
    req.reasoning_effort = 'medium';
    req.include_reasoning = false;
  }
  // one slow model must not eat the whole wait: give up on it after 28 s
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tm = ctl
    ? setTimeout(() => {
        try {
          ctl.abort();
        } catch (e) {}
      }, 28000)
    : null;
  try {
    const res = await fetchImpl(GROQ_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify(req),
      signal: ctl ? ctl.signal : undefined,
    });
    if (!res.ok) {
      const e = new Error('http ' + res.status);
      e.status = res.status;
      const retry = res.headers.get('retry-after');
      const seconds =
        retry &&
        (Number.isFinite(Number(retry)) ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000);
      e.retryAfter = Math.max(1, Math.ceil(seconds || 60));
      throw e;
    }
    const j = await res.json();
    const choice = j?.choices?.[0];
    return choice?.finish_reason === 'length' ? '' : choice?.message?.content || '';
  } finally {
    if (tm) clearTimeout(tm);
  }
}

/* One Groq request. Quota errors never switch providers or retry models. */
export async function askGroq(env, fetchImpl, sys, user) {
  const key = env.GROQ_API_KEY?.trim();
  if (!key) return { error: 'nokey' };
  if (typeof user !== 'string' || user.length + sys.length > MAX_PROMPT_CHARS)
    return { error: 'context' };
  const model = modelOf(env);
  try {
    const out = parseReply(await chat(fetchImpl, key, model, sys, user));
    return out ? { ...out, provider: 'groq', model } : { error: 'shape' };
  } catch (e) {
    if (e.status === 429) return { error: 'quota', retryAfter: e.retryAfter };
    if (e.status === 401 || e.status === 403) return { error: 'key' };
    if (e.status === 404) return { error: 'model' };
    if (e.status === 413) return { error: 'context' };
    return { error: 'down' };
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* Testable core: deps = { env, fetch, store(name) -> {get(key,{type}), setJSON(key,val)} | null, ip } */
export async function handle(body, deps) {
  const env = deps.env || {};
  const c = clean(body);
  if (c.q.length < 4) return { status: 400, json: { ok: false, error: 'empty' } };
  const sys = systemPrompt(),
    readRules = [],
    user = userMessage(c, MAX_PROMPT_CHARS - sys.length, readRules);
  const dev = sha(String((body && body.device) || '') + '|' + (deps.ip || '')).slice(0, 24);
  const cacheKey = sha(JSON.stringify(['groq-v3', modelOf(env), sys, user]));
  const cache = deps.store ? deps.store('judge-cache') : null;
  const count = deps.store ? deps.store('judge-count') : null;
  // 1. asked before: free and instant
  try {
    const hit = cache && (await cache.get(cacheKey, { type: 'json' }));
    if (hit && hit.answer)
      return { status: 200, json: Object.assign({ ok: true, cached: true }, hit) };
  } catch (e) {}
  if (!env.GROQ_API_KEY?.trim()) return { status: 503, json: { ok: false, error: 'nokey' } };
  if (!user) return { status: 400, json: { ok: false, error: 'context' } };
  // 2. limits
  const day = today(),
    perDev = +env.JUDGE_DAILY || 20,
    all = +env.JUDGE_GLOBAL || 800;
  let devN = 0,
    allN = 0;
  try {
    if (count) {
      devN = ((await count.get('d|' + day + '|' + dev, { type: 'json' })) || {}).n || 0;
      allN = ((await count.get('g|' + day, { type: 'json' })) || {}).n || 0;
    }
  } catch (e) {}
  if (devN >= perDev) return { status: 429, json: { ok: false, error: 'limit', limit: perDev } };
  if (allN >= all) return { status: 429, json: { ok: false, error: 'quota' } };
  try {
    const cooldown = count && (await count.get('groq-cooldown'));
    if (cooldown?.until > Date.now())
      return {
        status: 429,
        json: {
          ok: false,
          error: 'quota',
          retryAfter: Math.ceil((cooldown.until - Date.now()) / 1000),
        },
      };
    // Attempts consume the local budget too: malformed responses and provider
    // failures must not allow unlimited requests against the free allowance.
    if (count) {
      await count.setJSON('d|' + day + '|' + dev, { n: devN + 1 });
      await count.setJSON('g|' + day, { n: allN + 1 });
    }
  } catch (e) {}
  // 3. ask
  const out = await askGroq(env, deps.fetch, sys, user);
  if (out.error) {
    if (out.error === 'quota' && count) {
      try {
        await count.setJSON('groq-cooldown', { until: Date.now() + out.retryAfter * 1000 });
      } catch (e) {}
    }
    return {
      status: out.error === 'quota' ? 429 : 502,
      json: { ok: false, ...out, left: Math.max(0, perDev - devN - 1) },
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
    json: Object.assign({ ok: true, cached: false, left: Math.max(0, perDev - devN - 1) }, out),
  };
}

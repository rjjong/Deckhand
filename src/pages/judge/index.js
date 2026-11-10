// pages / judge / index

// retired: there is one app now
/* ---------------- COMPREHENSIVE RULES ORACLE ----------------
   The full official CR, fetched once from the Academy Ruins API (the
   community's CORS-enabled mirror of WotC's rules, updated each set) and
   cached in IndexedDB for 7 days. Everything after that first fetch is
   local: browsing, rule-number jump, full-text search, and the question
   box — which answers by FINDING and QUOTING the official rules, so it is
   correct by construction. A /crules/ mirror can be used when one is
   configured by the host. */
const CR_TTL = 7 * 24 * 60 * 60 * 1000;

async function ensureCR() {
  if (state._cr) return state._cr;
  try {
    const hit = await qdbGet('cr|full');
    // New records carry the rules array in .v; the old shape nested them one
    // level deeper — accept both so no one re-downloads the whole CR.
    const crRules =
      hit && (Array.isArray(hit.v) ? hit.v : (hit.v && hit.v.rules) || hit.rules || null);
    if (hit && Date.now() - (hit.t || 0) < CR_TTL && crRules && crRules.length) {
      state._cr = crRules;
      return crRules;
    }
  } catch (e) {}
  let data = null;
  for (const base of ['https://api.academyruins.com', '/crules']) {
    try {
      const res = await fetch(base + '/cr', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        data = await res.json();
        break;
      }
    } catch (e) {}
  }
  if (!data) return null;
  // Paranoid normalizer: accept a dict of number→entry, an array, or nests —
  // collect anything that looks like {ruleNumber, ruleText}.
  const rules = [];
  const seen = new Set();
  const eat = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      o.forEach(eat);
      return;
    }
    const num = o.ruleNumber || o.rule_number || o.number;
    const txt = o.ruleText || o.rule_text || o.text;
    if (typeof num === 'string' && typeof txt === 'string' && !seen.has(num)) {
      seen.add(num);
      rules.push({ n: num, t: txt });
    }
    Object.keys(o).forEach((k) => {
      const v = o[k];
      if (typeof v === 'string' && /^\d{3}(\.\d+[a-z]?)?\.?$/.test(k) && !seen.has(k)) {
        seen.add(k);
        rules.push({ n: k.replace(/\.$/, ''), t: v });
      } else if (v && typeof v === 'object') eat(v);
    });
  };
  eat(data);
  rules.sort((a, b) => {
    const pa = a.n.match(/^(\d+)(?:\.(\d+))?([a-z])?/),
      pb = b.n.match(/^(\d+)(?:\.(\d+))?([a-z])?/);
    return (
      +pa[1] - +pb[1] ||
      (+pa[2] || 0) - (+pb[2] || 0) ||
      String(pa[3] || '').localeCompare(String(pb[3] || ''))
    );
  });
  if (!rules.length) return null;
  state._cr = rules;
  try {
    qdbSet('cr|full', rules);
  } catch (e) {}
  return rules;
}

const CR_STOP = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
  'is',
  'are',
  'it',
  'its',
  'and',
  'or',
  'if',
  'do',
  'does',
  'can',
  'i',
  'my',
  'you',
  'your',
  'when',
  'what',
  'how',
  'with',
  'that',
  'this',
  'was',
  'were',
  'be',
  'at',
  'as',
  'for',
  'from',
  'into',
  'by',
  'have',
  'has',
  'had',
  'will',
  'would',
  'they',
  'them',
  'their',
  'there',
  'then',
  'than',
  'but',
  'not',
  'no',
  'also',
  'any',
  'all',
  'each',
  'may',
  'must',
]);

function crTokens(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9 .]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !CR_STOP.has(w));
}

function crSearch(rules, query, limit) {
  // Exact rule number wins outright ("601.2", "702.19b")
  const nm = String(query || '')
    .trim()
    .match(/^(\d{3}(?:\.\d+)?[a-z]?)\.?$/);
  if (nm) {
    const pre = nm[1];
    const hits = rules.filter(
      (r) =>
        r.n === pre || r.n.startsWith(pre + '.') || (pre.indexOf('.') > 0 && r.n.startsWith(pre)),
    );
    if (hits.length) return hits.slice(0, limit || 30);
  }
  const toks = crTokens(query);
  if (!toks.length) return [];
  const phrase = String(query || '')
    .trim()
    .toLowerCase();
  const scored = [];
  for (const r of rules) {
    const lt = r.t.toLowerCase();
    let sc = 0;
    for (const w of toks) {
      if (lt.includes(w)) sc += 2;
    }
    if (sc === 0) continue;
    if (toks.every((w) => lt.includes(w))) sc += toks.length * 2; // all terms present
    if (phrase.length > 6 && lt.includes(phrase)) sc += 8; // literal phrase
    sc -= Math.min(2, r.t.length / 900); // favor tighter rules
    scored.push([sc, r]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit || 12).map((x) => x[1]);
}

function crRuleHtml(r, toks) {
  let t = escapeHtml(r.t);
  (toks || []).forEach((w) => {
    t = t.replace(
      new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
      '<mark>$1</mark>',
    );
  });
  // Cross-references become jump buttons ("see rule 601.2a")
  t = t.replace(
    /\b(\d{3}\.\d+[a-z]?|\d{3})\b(?!<)/g,
    (m) => `<button class="cr-jump" data-crjump="${m}">${m}</button>`,
  );
  return /* HTML */ `<div class="cr-rule">
    <div class="cr-num">${escapeHtml(r.n)}</div>
    <div class="cr-txt">${t}</div>
  </div>`;
}

/* ---- 1.33: Ask the judge ----
   The app does the finding (rules from its own CR search, oracle text and
   rulings of the tagged cards from its own card database); a free AI service
   behind /api/judge only does the reasoning. Every rule number
   it cites is checked against the real CR on the phone. */
// "@sol ri" at the caret -> the names to offer (local card database)
function judgeTagMatches(fragment, names, limit) {
  const q = scanNorm(fragment);
  if (q.length < 2 || !names) return [];
  const starts = [],
    inside = [];
  for (const [k, n] of names) {
    if (k.startsWith(q)) starts.push(n);
    else if (inside.length < 40 && k.includes(q)) inside.push(n);
    if (starts.length >= (limit || 6)) break;
  }
  return Array.from(new Set(starts.concat(inside))).slice(0, limit || 6);
}

/* 1.34: card names written plainly ("ketramose", "sol ring") are found too.
   idx = { full: Map(norm name -> name), short: Map(norm part before the
   comma -> name, only when unique), common: Set of words in the rules }.
   A name made only of rules words ("Cast Out", "Exile") is NOT matched from
   plain text -- it would fire on ordinary questions; @ still finds those. */
function judgeNameIndex(names, rules) {
  const full = new Map(),
    short = new Map(),
    dup = new Set(),
    common = new Set();
  (rules || []).forEach((r) =>
    String(r.t || '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .forEach((w) => {
        if (w) common.add(w);
      }),
  );
  (names || []).forEach(([k, n]) => {
    if (!full.has(k)) full.set(k, n);
    const cut = n.indexOf(',');
    if (cut > 0) {
      const sk = scanNorm(n.slice(0, cut));
      if (sk.length >= 5) {
        if (short.has(sk) && short.get(sk) !== n) dup.add(sk);
        else short.set(sk, n);
      }
    }
  });
  dup.forEach((k) => short.delete(k));
  return { full, short, common };
}

function judgeFindCards(text, idx) {
  if (!idx) return [];
  const w = scanNorm(text).split(' ').filter(Boolean);
  const used = new Array(w.length).fill(false),
    out = [];
  const plainOk = (words) => words.some((x) => x.length >= 3 && !idx.common.has(x));
  for (let len = Math.min(8, w.length); len >= 1; len--) {
    for (let i = 0; i + len <= w.length; i++) {
      if (used.slice(i, i + len).some(Boolean)) continue;
      const words = w.slice(i, i + len),
        key = words.join(' ');
      let hit = idx.full.get(key) || null;
      if (!hit && idx.short.has(key)) hit = idx.short.get(key);
      if (!hit || !plainOk(words)) continue;
      if (len === 1 && words[0].length < 5) continue;
      if (out.indexOf(hit) < 0) out.push(hit);
      for (let k = i; k < i + len; k++) used[k] = true;
    }
  }
  return out.slice(0, 5);
}

/* The rules a judge always wants at hand for these concepts -- the search
   by words alone does not reliably find them. Only numbers that exist in
   the loaded rules are used. */
const JUDGE_CONCEPTS = [
  [/\btokens?\b/i, ['111.1', '111.7', '108.2']],
  [/\bcards?\b/i, ['108.2', '108.3']],
  [/\bexile/i, ['406.1', '406.3']],
  [/\b(whenever|when|trigger)/i, ['603.2', '603.6', '603.10']],
  [/\b(dies|die|died|leaves? the battlefield)\b/i, ['700.4', '603.6c', '603.10a']],
  [/\bcounters?\b/i, ['122.1']],
  [/\b(copy|copies|clone)\b/i, ['707.2']],
  [/\b(layer|loses? all abilities|becomes? a)\b/i, ['613.1']],
  [/\btrample\b/i, ['702.19b', '702.19c']],
  [/\b(state-based|legend rule)\b/i, ['704.3', '704.5j']],
  [/\b(replace|instead)\b/i, ['614.1']],
  [/\b(stack|respond|in response)\b/i, ['405.1', '117.3']],
  [/\bindestructible\b/i, ['702.12b', '704.5f', '704.5g']],
  [/\btoughness\b|-1\/-1/i, ['704.5f']],
  [/-1\/-1|\+1\/\+1/, ['122.1', '704.5q']],
];

/* 1.38: a keyword (702) or keyword action (701) named in the question or on
   a tagged card brings its WHOLE rule: the heading ("702.12 Indestructible")
   and every sub-rule (702.12a, 702.12b ...). A heading alone says nothing --
   that is why "indestructible vs -1/-1 counters" got no answer. */
function judgeKeywordRules(text, rules) {
  const t =
    ' ' +
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ') +
    ' ';
  const out = [];
  (rules || []).forEach((h) => {
    if (!/^70[12]\.\d+$/.test(h.n) || !h.t || h.t.length > 40) return;
    const k = h.t
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim();
    if (k.length < 4) return;
    const re = new RegExp('[\\s-]' + k.replace(/-/g, '\\-') + '(s|es|d|ed|ing)?[\\s-]');
    if (!re.test(t)) return;
    (rules || []).forEach((r) => {
      if (out.length >= 30) return;
      if (r.n === h.n || (r.n.startsWith(h.n) && /^[a-z]$/.test(r.n.slice(h.n.length))))
        out.push(r);
    });
  });
  return out;
}

// ... and the state-based actions (704.5x) that speak to the question
function judgeSbaRules(text, rules) {
  if (
    !/\b(dies?|died|toughness|damage|destroy\w*|indestructible|counters?|life|legend\w*|graveyard)\b|-\d\/-\d/i.test(
      String(text || ''),
    )
  )
    return [];
  return crSearch(
    (rules || []).filter((r) => /^704\.5[a-z]$/.test(r.n)),
    text,
    3,
  );
}

function judgeConceptRules(text, rules) {
  const by = new Map((rules || []).map((r) => [r.n, r])),
    out = [];
  JUDGE_CONCEPTS.forEach(([re, nums]) => {
    if (re.test(text))
      nums.forEach((n) => {
        const r = by.get(n);
        if (r && out.indexOf(r) < 0) out.push(r);
      });
  });
  return out;
}

// The cards tagged in the text: every "@Name" whose name was picked, as a
// whole name ("@Opt" in "@Optimus" is not a tag of Opt).
function judgeTagsIn(text, picked) {
  const t = String(text || '');
  return (picked || []).filter((n) => {
    let i = -1;
    while ((i = t.indexOf('@' + n, i + 1)) >= 0) {
      if (!/[A-Za-z0-9]/.test(t.charAt(i + n.length + 1))) return true;
    }
    return false;
  });
}

/* 1.36: the cards' names in a piece of (already escaped) text -> underlined
   and tappable (the card view). The short name before the comma counts too
   ("Ketramose"); an "@" in front is dropped. */
function judgeMarkCards(h, names) {
  const alts = [];
  (names || []).forEach((n) => {
    alts.push([escapeHtml(n), n]);
    const cut = n.indexOf(',');
    if (cut >= 4) alts.push([escapeHtml(n.slice(0, cut)), n]);
  });
  if (!alts.length) return h;
  alts.sort((a, b) => b[0].length - a[0].length);
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    '(?<![A-Za-z0-9])@?(' + alts.map((a) => esc(a[0])).join('|') + ')(?![A-Za-z0-9])',
    'gi',
  );
  return String(h).replace(re, (m, nm) => {
    const hit = alts.find((a) => a[0].toLowerCase() === nm.toLowerCase());
    return hit
      ? `<span class="cj-card" role="button" data-jcard="${escapeHtml(hit[1])}">${nm}</span>`
      : m;
  });
}

// A card in the answer -> the card view (pinch to zoom), from the phone's
// own card database first.
async function judgeOpenCard(name) {
  let card = null;
  try {
    card = await scanCardFor(name);
  } catch (e) {}
  if (!card) {
    toast('Card not found.');
    return;
  }
  showCardPreview(card, cardImageLarge(card));
}

// Rule numbers the AI cited -> the real rules, and the ones that do not exist.
function judgeVerify(cites, rules) {
  const by = new Map((rules || []).map((r) => [r.n, r]));
  const ok = [],
    bad = [];
  (cites || []).forEach((c) => {
    const r = by.get(String(c));
    if (r) ok.push(r);
    else bad.push(String(c));
  });
  return { ok, bad };
}

async function judgeGather(q, tagged, rules) {
  const cards = [];
  for (const nm of (tagged || []).slice(0, 5)) {
    let oracle = '',
      type = '';
    try {
      const c = await bulkCardByName(nm);
      if (c) {
        oracle = c.ot || '';
        type = c.tl || '';
      }
    } catch (e) {}
    if (!oracle) {
      try {
        const full = await scanCardFor(nm);
        if (full) {
          type = full.type_line || type;
          oracle =
            full.oracle_text ||
            (full.card_faces || []).map((f) => f.name + ': ' + (f.oracle_text || '')).join('\n');
        }
      } catch (e) {}
    }
    let rulings = [];
    try {
      const r = await bulkRulingsFor({ name: nm });
      if (Array.isArray(r))
        rulings = r
          .map((x) => x.c)
          .filter(Boolean)
          .slice(0, 10);
    } catch (e) {}
    cards.push({ name: nm, type, oracle, rulings });
  }
  // the question without the card names, then each card's own words
  let plain = String(q || '');
  (tagged || []).forEach((n) => {
    plain = plain.split('@' + n).join(' ');
  });
  // names written plainly go too, so their words do not steer the rule search
  const nw = new Set((tagged || []).flatMap((n) => scanNorm(n).split(' ')));
  if (nw.size)
    plain = scanNorm(plain)
      .split(' ')
      .filter((x) => !nw.has(x))
      .join(' ');
  const pool = new Map();
  const add = (list) =>
    list.forEach((r) => {
      if (!pool.has(r.n)) pool.set(r.n, r);
    });
  const all = q + ' ' + cards.map((k) => k.oracle).join(' ');
  add(judgeKeywordRules(all, rules));
  add(judgeConceptRules(all, rules));
  add(judgeSbaRules(String(q || ''), rules));
  add(crSearch(rules, plain, 22));
  cards.forEach((k) => add(crSearch(rules, (k.type + ' ' + k.oracle).slice(0, 400), 7)));
  return { cards, rules: Array.from(pool.values()).slice(0, 36) };
}

function judgeDevice() {
  try {
    let id = localStorage.getItem(LS_PREFIX + 'judgeId');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(LS_PREFIX + 'judgeId', id);
    }
    return id;
  } catch (e) {
    return '';
  }
}

// 1.37: questions left today, as the judge last said (its day is the UTC day)
function judgeLeftGet() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_PREFIX + 'judgeLeft') || 'null');
    if (o && o.d === new Date().toISOString().slice(0, 10) && typeof o.n === 'number') return o.n;
  } catch (e) {}
  return null;
}

function judgeLeftSet(n) {
  try {
    localStorage.setItem(
      LS_PREFIX + 'judgeLeft',
      JSON.stringify({ d: new Date().toISOString().slice(0, 10), n }),
    );
  } catch (e) {}
}

// The answer leads, followed by its cited rules in reading order.
function judgeAnswerHtml(res, rules, q) {
  const cards = res._cards || [];
  const lnk = (txt) =>
    judgeMarkCards(escapeHtml(txt), cards)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>')
      .replace(
        /\b(\d{3}\.\d+[a-z]?)\b/g,
        (m) => `<button class="cr-jump" data-crjump="${m}">${m}</button>`,
      );
  // 1.37: the rules shown are the ones the AI listed PLUS every rule number
  // it wrote in its answer or reasoning (its list sometimes comes back empty);
  // with none at all, the key rules it was given.
  const nums = [];
  (res.cites || []).forEach((c) => {
    c = String(c);
    if (nums.indexOf(c) < 0) nums.push(c);
  });
  (String(res.answer || '') + ' ' + String(res.reasoning || '')).replace(
    /\b(\d{3}\.\d+[a-z]?)\b/g,
    (m) => {
      if (nums.indexOf(m) < 0) nums.push(m);
      return m;
    },
  );
  const v = judgeVerify(nums, rules);
  let shown = v.ok,
    head = 'Rules cited';
  if (!v.ok.length && !v.bad.length && res._read && res._read.length) {
    shown = res._read.slice(0, 3);
    head = 'Rules the judge read';
  }
  const unsure =
    res.confident === false
      ? `<div class="cja-meta">\u26a0 ${'Careful: the AI is not sure \u2014 the official rules always take priority.'}</div>`
      : '';
  return (
    `<div class="cja" data-notr><div class="cja-a">${lnk(res.answer)}</div>${unsure}` +
    (res.reasoning
      ? `<button type="button" class="cja-whyt" data-cjwhy aria-expanded="false">${'The AI\u2019s reasoning'} <span class="fold-ico">\u25BE</span></button><div class="cja-why" hidden>${lnk(res.reasoning)}</div>`
      : '') +
    `</div>` +
    (shown.length || v.bad.length ? `<div class="cja-h">${head}</div>` : '') +
    shown.map((r) => crRuleHtml(r, [])).join('') +
    v.bad
      .map(
        (n) =>
          `<div class="cr-rule"><div class="cr-num">⚠ ${escapeHtml(n)}</div><div class="cr-txt">${'This rule does not exist in the official rules \u2014 that part of the answer cannot be checked.'}</div></div>`,
      )
      .join('')
  );
}

function openCROverlay(startMode) {
  document.getElementById('crOverlay')?._cancelJudge?.();
  document.getElementById('crOverlay')?.remove();
  const el = document.createElement('div');
  el.id = 'crOverlay';
  el.className = 'overlay';

  // 1.35: the judge first; the Comprehensive Rules behind a button.
  let mode = startMode === 'rules' ? 'rules' : 'judge';
  el.innerHTML = `
    ${overlayCapHtml('Ask AI judge', `<button type="button" id="crOpenRules" aria-label="${'Read the Comprehensive Rules'}" title="${'Read the Comprehensive Rules'}">${inlIco('library', 24)}</button>`)}
    <div id="crBody"></div>
    <div class="cr-bar">
      <div class="cr-qwrap"><div class="cr-qmirror" id="crQMirror" aria-hidden="true"></div><textarea id="crQ" rows="3" maxlength="500" enterkeyhint="send" autocomplete="off" spellcheck="false"></textarea></div>
      <div class="cr-side"><button type="button" class="primary-btn cr-judge" id="crJudge" title="${'Ask the judge'}" aria-label="${'Ask the judge'}"><svg class="judge-button-progress" viewBox="0 0 56 56" aria-hidden="true"><circle class="judge-progress-track" cx="28" cy="28" r="25"/><circle class="judge-progress-arc" cx="28" cy="28" r="25" pathLength="1"/></svg><span class="judge-button-icon">${ICONS.gavel}</span><span class="judge-button-timer" aria-hidden="true"></span></button><span class="cr-count" id="crCount">0/500</span></div>
      <div class="cr-tagpop" id="crTagPop" hidden></div>
    </div>
    ${overlayNavHtml()}`;
  document.body.appendChild(el);
  wireOverlayNav(el);
  const body = el.querySelector('#crBody');
  let judgeBusy = false,
    judgeController = null,
    judgeRequest = 0;
  const cancelJudge = () => {
    judgeRequest++;
    judgeController?.abort();
    judgeController = null;
    judgeBusy = false;
    el.querySelector('#crJudge').disabled = false;
    availability.paint();
    availability.refresh();
  };
  const q = el.querySelector('#crQ');
  const count = el.querySelector('#crCount');
  const mirror = el.querySelector('#crQMirror');
  // the count only shows near the limit (500 characters per question)
  // under the gavel: the questions left today; near the 500-character limit
  // the character count instead
  const setCount = () => {
    if (q.value.length >= 400) {
      count.textContent = q.value.length + '/500';
      count.classList.remove('cr-left');
      return;
    }
    const l = judgeLeftGet();
    count.textContent = (l == null ? '—' : l) + ' left';
    count.title = 'New questions left today; saved answers are free';
    count.classList.add('cr-left');
  };
  const availability = watchJudgeAvailability(el, {
    active: () => mode === 'judge' && !judgeBusy,
    working: () => judgeBusy,
    onStatus: (status) => {
      judgeLeftSet(status.left);
      setCount();
    },
  });
  el._cancelJudge = () => {
    availability.stop();
    cancelJudge();
  };
  const title = el.querySelector('.ov-title');
  // TWO-stage back, the app's blessed way: every level pushes its own history
  // entry at the moment of a real user gesture. Opening pushes the close-
  // entry; the rules pushes a back-to-the-judge entry; an answer or a search
  // pushes a clear-entry on top. Back pops one level at a time.
  state._crqArmed = false;
  function crClearStep() {
    cancelJudge();
    state._crqArmed = false;
    if (!document.getElementById('crOverlay')) return;
    q.value = '';
    setCount();
    paintQ(null);
    home();
  }
  const arm = () => {
    if (!state._crqArmed) {
      state._crqArmed = true;
      pushOverlay('crq', crClearStep);
    }
  };
  // 1.38: the page under the judge keeps its place -- back on Extras you are
  // exactly where you left it (the root is locked while the judge is open)
  const keepY = pageScroller().scrollTop,
    keepScreen = state.screen;
  pushOverlay('cr', () => {
    el._cancelJudge();
    state._crqArmed = false;
    document.getElementById('crOverlay')?.remove();
    if (state.screen === keepScreen) {
      try {
        pageScroller().scrollTo({ top: keepY, behavior: 'instant' });
      } catch (e) {
        pageScroller().scrollTo(0, keepY);
      }
      requestAnimationFrame(() => {
        if (state.screen === keepScreen && Math.abs(pageScroller().scrollTop - keepY) > 1)
          pageScroller().scrollTo(0, keepY);
      });
    }
  });
  // 1.38: examples that have a real answer -- the card is tagged, so its text
  // goes along; the rest is answered by the keyword rules themselves
  const examples = [
    { q: 'Does an indestructible creature with 0 toughness die?', tags: [] },
    { q: 'Can @Counterspell counter a triggered ability?', tags: ['Counterspell'] },
    { q: 'Does trample carry damage through a blocker with protection?', tags: [] },
  ];
  const judgeHome = () => {
    body.innerHTML = /* HTML */ `<section class="hub-intro cj-hero">
        <span class="hub-eyebrow">${'RULES COMPANION'}</span>
        <h1>${'Ask the AI judge.'}</h1>
        <p>${'Describe the situation. Tag cards with @ to include their card text.'}</p>
      </section>
      <div class="hub-actions cj-try">
        <div class="cj-lab">${'Try one'}</div>
        ${examples.map((x) => `<button type="button" class="hub-card cj-ex" data-cjex="${escapeHtml(x.q)}" data-cjtags="${escapeHtml(x.tags.join('|'))}"><span class="hub-icon" aria-hidden="true">${ICONS.gavel}</span><span class="hub-copy"><strong>${escapeHtml(x.q)}</strong></span><span class="hub-arrow" aria-hidden="true">›</span></button>`).join('')}
      </div>`;
    body.scrollTop = 0;
  };
  const showToc = (rules) => {
    // Chapters: one per three-digit number, built from the numbers themselves.
    const byChap = new Map();
    rules.forEach((r) => {
      const m = /^(\d{3})(\.?)(\d*)/.exec(r.n || '');
      if (!m) return;
      const own = !m[3];
      const cur = byChap.get(m[1]);
      if (!cur || (own && !cur.own)) byChap.set(m[1], { n: m[1], t: r.t, own });
    });
    const chapters = Array.from(byChap.values()).sort((a, b) => +a.n - +b.n);
    body.innerHTML = /* HTML */ `<section class="hub-intro cr-rules-intro">
        <span class="hub-eyebrow">${'OFFICIAL RULES'}</span>
        <h1>${'Know the rules.'}</h1>
        <p>
          ${`${rules.length} rules loaded, kept a week for offline reading. Tap a section, or search by words or a rule number (601.2).`}
        </p>
      </section>
      <div class="hub-actions cr-toc">
        ${chapters.map((r) => `<button type="button" class="hub-card cr-toc-row" data-crjump="${r.n}"><span class="hub-icon cr-num">${r.n}</span><span class="hub-copy"><strong>${escapeHtml(r.t.slice(0, 70))}${r.t.length > 70 ? '…' : ''}</strong></span><span class="hub-arrow" aria-hidden="true">›</span></button>`).join('')}
      </div>`;
    body.scrollTop = 0;
  };
  const home = () => {
    if (mode === 'judge') {
      judgeHome();
      return;
    }
    if (state._cr) showToc(state._cr);
    else
      body.innerHTML = /* HTML */ `<div class="empty-note" style="padding:14px;">
        ${'Loading the rules…'}
      </div>`;
  };
  const setMode = (m) => {
    mode = m;
    cancelJudge();
    availability.refresh();
    el.classList.toggle('cr-mode-rules', m === 'rules');
    title.textContent = m === 'rules' ? 'Comprehensive Rules' : 'Ask AI judge';
    q.rows = m === 'rules' ? 1 : 3;
    q.placeholder =
      m === 'rules' ? 'Words or rule (601.2)…' : 'Ask your rules question… tag cards with @';
    state._crqArmed = false;
    q.value = '';
    setCount();
    paintQ(null);
    tagPop.hidden = true;
    home();
  };
  const openRules = () => {
    pushOverlay('crrules', () => {
      if (document.getElementById('crOverlay')) setMode('judge');
    });
    setMode('rules');
    ensureCR().then((r) => {
      if (r && mode === 'rules' && !q.value.trim()) showToc(r);
    });
  };
  const run = () => {
    const rules = state._cr;
    if (!rules) return;
    const query = q.value.trim();
    if (!query) {
      showToc(rules);
      return;
    }
    arm();
    const toks = crTokens(query);
    const hits = crSearch(rules, query, 14);
    body.innerHTML = hits.length
      ? `<p class="hint" style="margin:4px 12px 8px;">${'The official rules answering that, best match first:'}</p>` +
        hits.map((r) => crRuleHtml(r, toks)).join('')
      : `<div class="empty-note" style="padding:14px;">${'No rule matches those words — try fewer or different terms, or a rule number like 903 for Commander.'}</div>`;
    body.scrollTop = 0;
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('#crOpenRules')) {
      openRules();
      return;
    }
    const ex = e.target.closest('[data-cjex]');
    if (ex) {
      (ex.dataset.cjtags || '')
        .split('|')
        .filter(Boolean)
        .forEach((n) => {
          if (picked.indexOf(n) < 0) picked.push(n);
        });
      q.value = ex.dataset.cjex;
      setCount();
      paintQ(null);
      askJudge();
      return;
    }
    const jc = e.target.closest('[data-jcard]');
    if (jc) {
      judgeOpenCard(jc.dataset.jcard);
      return;
    }
    const wt = e.target.closest('[data-cjwhy]');
    if (wt) {
      const w = wt.nextElementSibling;
      if (w) {
        w.hidden = !w.hidden;
        wt.setAttribute('aria-expanded', String(!w.hidden));
        const ic = wt.querySelector('.fold-ico');
        if (ic) ic.textContent = w.hidden ? '\u25BE' : '\u25B4';
      }
      return;
    }
    const j = e.target.closest('[data-crjump]');
    if (j) {
      // in an answer: the cited rule is right there -- go to it
      if (mode === 'judge') {
        const there = Array.from(body.querySelectorAll('.cr-rule .cr-num')).find(
          (n) => n.textContent.trim() === j.dataset.crjump,
        );
        if (there) {
          there.closest('.cr-rule').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        openRules();
      }
      q.value = j.dataset.crjump;
      run();
    }
  });
  q.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    tagPop.hidden = true;
    if (mode === 'rules') run();
    else askJudge();
  });
  // ---- @-tags and the judge ----
  // 1.36: a tag is the only way a card reaches the judge. Typing @ opens a
  // list right above the @, filtered live; a tap completes the name. A name
  // typed out in full is recognised by itself. Tagged cards are underlined
  // in the field (the mirror behind it).
  const tagPop = el.querySelector('#crTagPop');
  const picked = [];
  let nameMap = null,
    tagSeq = 0;
  function paintQ(atIdx) {
    const v = q.value,
      spans = [];
    picked.forEach((n) => {
      const t = '@' + n;
      let i = -1;
      while ((i = v.indexOf(t, i + 1)) >= 0) {
        if (!/[A-Za-z0-9]/.test(v.charAt(i + t.length))) spans.push([i, i + t.length]);
      }
    });
    spans.sort((a, b) => a[0] - b[0]);
    let out = '',
      pos = 0;
    const plain = (a, b) => {
      if (atIdx != null && atIdx >= a && atIdx < b)
        out +=
          escapeHtml(v.slice(a, atIdx)) +
          '<span class="cr-at">@</span>' +
          escapeHtml(v.slice(atIdx + 1, b));
      else out += escapeHtml(v.slice(a, b));
    };
    spans.forEach(([a, b]) => {
      if (a < pos) return;
      plain(pos, a);
      out += '<span class="cr-tagu">' + escapeHtml(v.slice(a, b)) + '</span>';
      pos = b;
    });
    plain(pos, v.length);
    mirror.innerHTML = out + '\u200b';
    mirror.scrollTop = q.scrollTop;
  }
  // the @-fragment at the caret, or null (a finished tag + more words is not one)
  const tagAt = () => {
    const pos = q.selectionStart == null ? q.value.length : q.selectionStart;
    const m = q.value.slice(0, pos).match(/@([^@\n]{0,40})$/);
    if (!m) return null;
    const at = pos - m[0].length,
      frag = m[1];
    if (
      picked.some(
        (n) =>
          frag.startsWith(n) &&
          q.value.startsWith('@' + n, at) &&
          (frag.length === n.length || !/[A-Za-z0-9]/.test(frag.charAt(n.length))),
      )
    )
      return null;
    return { at, frag, pos };
  };
  // put the canonical name in for the typed part, and tag it
  const tagIt = (at, typedLen, name, tail) => {
    const head = q.value.slice(0, at) + '@' + name + (tail || '');
    q.value = head + q.value.slice(at + 1 + typedLen);
    if (picked.indexOf(name) < 0) picked.push(name);
    setCount();
    return head.length;
  };
  const placeTagPop = () => {
    const bar = el.querySelector('.cr-bar'),
      at = mirror.querySelector('.cr-at');
    const br = bar.getBoundingClientRect();
    const w = Math.round(Math.min(320, br.width - 28));
    let left = 14;
    if (at) {
      const ar = at.getBoundingClientRect();
      left = Math.round(Math.max(14, Math.min(ar.left - br.left - 10, br.width - 14 - w)));
      tagPop.style.bottom = Math.round(br.bottom - ar.top + 4) + 'px';
    } else tagPop.style.bottom = '';
    tagPop.style.left = left + 'px';
    tagPop.style.right = 'auto';
    tagPop.style.width = w + 'px';
  };
  const showTags = async () => {
    const my = ++tagSeq;
    let t = mode === 'judge' ? tagAt() : null;
    paintQ(t ? t.at : null);
    if (!t) {
      tagPop.hidden = true;
      return;
    }

    const f = t.frag.trim();
    let html;
    if (f.length < 2) html = `<div class="cr-tagnote">${'Type the card name\u2026'}</div>`;
    else {
      const names = await scanNameList();
      if (my !== tagSeq) return;
      if (!nameMap && names) nameMap = new Map(names);
      const hits = judgeTagMatches(f, names, 30);
      const key = scanNorm(f);
      // typed out in full (and no longer name starts with it): tagged by itself
      const exact = nameMap && nameMap.get(key);
      if (exact && !hits.some((n) => n !== exact && scanNorm(n).startsWith(key + ' '))) {
        const end = tagIt(t.at, t.frag.length, exact, '');
        try {
          q.setSelectionRange(end, end);
        } catch (e) {}
        tagPop.hidden = true;
        paintQ(null);
        return;
      }
      if (!hits.length && nameMap) {
        // the name ended a few words back ("@shock does it ..."): tag that part
        const words = t.frag.split(' ');
        for (let k = words.length - 1; k >= 1; k--) {
          const part = words.slice(0, k).join(' ');
          const nm = nameMap.get(scanNorm(part));
          if (nm) {
            const shift = nm.length - part.length;
            tagIt(t.at, part.length, nm, '');
            try {
              q.setSelectionRange(t.pos + shift, t.pos + shift);
            } catch (e) {}
            tagPop.hidden = true;
            paintQ(null);
            return;
          }
        }
      }
      // Show the best matching card first.
      html = hits.length
        ? hits
            .map(
              (n) =>
                `<button type="button" data-tagname="${escapeHtml(n)}">${escapeHtml(n)}</button>`,
            )
            .join('')
        : `<div class="cr-tagnote">${'No card by that name'}</div>`;
    }
    tagPop.innerHTML = html;
    tagPop.hidden = false;
    placeTagPop();
    tagPop.scrollTop = 0;
  };
  q.addEventListener('input', () => {
    setCount();
    showTags();
  });
  q.addEventListener('click', showTags);
  q.addEventListener('keyup', (e) => {
    if (/^Arrow|^Home$|^End$/.test(e.key)) showTags();
  });
  q.addEventListener('scroll', () => {
    mirror.scrollTop = q.scrollTop;
    if (!tagPop.hidden) placeTagPop();
  });
  // a tap in the list keeps the keyboard up (no focus change), and still scrolls
  tagPop.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-tagname]')) e.preventDefault();
  });
  tagPop.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener(
    'pointerdown',
    (e) => {
      if (!tagPop.hidden && !e.target.closest('#crTagPop, #crQ')) tagPop.hidden = true;
    },
    true,
  );
  tagPop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tagname]');
    if (!b) return;
    const t = tagAt();
    const pos = q.selectionStart == null ? q.value.length : q.selectionStart;
    const at = t ? t.at : q.value.lastIndexOf('@', pos - 1);
    if (at < 0) return;
    const end = tagIt(at, pos - at - 1, b.dataset.tagname, ' ');
    tagPop.hidden = true;
    q.focus();
    try {
      q.setSelectionRange(end, end);
    } catch (err) {}
    paintQ(null);
  });
  const askJudge = async () => {
    const query = q.value.trim();
    tagPop.hidden = true;
    if (query.length < 4) {
      toast('Type your question first.');
      q.focus();
      return;
    }
    if (judgeBusy) return;
    const rules = state._cr || (await ensureCR());
    if (!rules) {
      toast('The rules could not be loaded — check your connection.');
      return;
    }
    if (judgeBusy || !el.isConnected || mode !== 'judge') return;
    arm();
    judgeBusy = true;
    availability.paint();
    const request = ++judgeRequest;
    const controller = new AbortController();
    judgeController = controller;
    el.querySelector('#crJudge').disabled = true;
    try {
      q.blur();
    } catch (e) {}
    // 1.36: only tagged cards go to the judge
    const tagged = judgeTagsIn(query, picked).slice(0, 5);
    body.innerHTML = /* HTML */ `<div class="status" style="margin:16px 0;">
      <div class="spinner"></div>
      ${'The judge is reading the rules…'}
    </div>`;
    body.scrollTop = 0;
    let g = { cards: [], rules: crSearch(rules, query, 14) },
      res,
      streamed = false;
    try {
      g = await judgeGather(query, tagged, rules);
      if (controller.signal.aborted) return;
      res = await judgeAsk(
        {
          q: query,
          lang: 'en',
          cards: g.cards,
          rules: g.rules.map((r) => ({ n: r.n, t: r.t })),
          device: judgeDevice(),
        },
        {
          signal: controller.signal,
          onProgress: (fields) => {
            if (request === judgeRequest && el.isConnected && mode === 'judge')
              streamed = showJudgeProgress(body, fields) || streamed;
          },
        },
      );
    } catch (error) {
      res = { ok: false, error: 'down' };
    } finally {
      if (request === judgeRequest) {
        judgeBusy = false;
        judgeController = null;
        el.querySelector('#crJudge').disabled = false;
        availability.paint();
        availability.refresh();
      }
    }
    if (
      request !== judgeRequest ||
      !el.isConnected ||
      mode !== 'judge' ||
      res?.error === 'cancelled'
    )
      return;
    if (res && typeof res.left === 'number') {
      judgeLeftSet(res.left);
    }
    if (res && res.error === 'limit') judgeLeftSet(0);
    setCount();
    if (res && res.ok) {
      res._cards = g.cards.map((k) => k.name);
      res._read = res.readRules
        ? g.rules.filter((rule) => res.readRules.includes(rule.n))
        : g.rules;
      const scroll = streamed ? body.scrollTop : 0;
      body.innerHTML = judgeAnswerHtml(res, rules, query);
      if (streamed && res.reasoning) body.querySelector('[data-cjwhy]')?.click();
      body.scrollTop = scroll;
      return;
    }
    // no judge: say why, and show what the app found itself
    const retry = res?.retryAfter;
    const retryText =
      Number.isFinite(retry) && retry > 0
        ? ` Try again in about ${judgeRetryTime(retry)}.`
        : ' Please try again later.';
    const why =
      res && res.error === 'limit'
        ? `You have used your ${res.limit || ''} new questions for today. More after midnight UTC; saved answers are still free. Below, what the rules themselves say.`
        : res && res.error === 'notconfigured'
          ? 'The local judge is not set up on this server yet. Below, what the rules themselves say.'
          : res && res.error === 'quota'
            ? 'The server has reached its AI question allowance for today. More after midnight UTC; saved answers are still free. Below, what the rules themselves say.'
            : res && res.error === 'busy'
              ? 'The AI judge is currently helping another player. Your question was not queued and your allowance was not used. Please try again shortly. Below, what the rules themselves say.'
              : res && res.error === 'cooldown'
                ? `Please wait before asking another new question.${retryText} Saved answers are still free. Below, what the rules themselves say.`
                : res && res.error === 'model'
                  ? 'The local judge model is not downloaded on this server yet. Below, what the rules themselves say.'
                  : res && res.error === 'context'
                    ? 'This question needs too much card or rules text. Try asking about fewer cards. Below, what the rules themselves say.'
                    : res && res.error === 'timeout'
                      ? 'The local judge took too long to answer. Try a shorter question. Below, what the rules themselves say.'
                      : res && res.error === 'offline'
                        ? 'No connection to the judge. Below, what the rules themselves say.'
                        : 'The judge cannot be reached right now. Below, what the rules themselves say.';
    const toks = crTokens(query);
    body.innerHTML =
      `<p class="hint" style="margin:4px 12px 8px;">⚠ ${escapeHtml(why)}</p>` +
      g.rules
        .slice(0, 14)
        .map((r) => crRuleHtml(r, toks))
        .join('');
    body.scrollTop = 0;
  };
  el.querySelector('#crJudge').addEventListener('click', askJudge);
  setMode(mode);
  // the rules load in the background: the judge needs them, the rules page shows them
  ensureCR().then((rules) => {
    if (!document.getElementById('crOverlay')) return;
    if (!rules && mode === 'rules') {
      body.innerHTML = /* HTML */ `<div class="empty-note" style="padding:14px;">
        ${'The rules service could not be reached. Check your connection and try again — after the first load they stay available offline for a week.'}
      </div>`;
      return;
    }
    if (rules && mode === 'rules' && !q.value.trim()) showToc(rules);
  });
}

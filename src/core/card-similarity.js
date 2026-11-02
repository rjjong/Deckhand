// core / card-similarity

/* ---- Similar cards ----
   EDHREC publishes no per-card similarity list (its card pages carry top
   commanders, inclusion, synergy, salt) — so "similar" is built from what
   the app already trusts: Scryfall Tagger's curated function tags say what
   the card DOES (same engine as Budget alternatives, minus the price cap),
   and EDHREC play-rank orders every result. Colored cards stay inside their
   own identity; colorless cards compete across all identities. */
/* Weighted PHRASE features: the specific rules-text patterns that define a
   card's JOB (Stef's priority one). Weight = specificity; q = a Scryfall
   search finding other cards that share the feature, used to build text
   candidate pools so even cards without curated tags find true cousins. */
/* ================= THE MAGIC-WORD ENGINE =================
   Stef's curated index of single rules-language words, and his ranking:
     Step 1  magic-word overlap — all > a good amount (≥60%) > some,
             rarer shared words weighing more within a tier
     Step 2  curated Scryfall-tag overlap — all > good > some
     Step 3  color similarity
     Step 4  EDHREC popularity (Budget adds price as the final tiebreak)
   Matching is word-boundary with light stemming (destroy/destroys/
   destroyed, copy/copies, sacrifice/sacrificing); "player" never fires
   "play". Glue words (at, a, the, of…) are deliberately absent — they
   would make everything kin to everything. */
function _mwRegex(word) {
  if (word.includes(' ')) return new RegExp('\\b' + word + '\\b');
  if (word.endsWith('y') && !/[aeiou]y$/.test(word))
    return new RegExp('\\b' + word.slice(0, -1) + '(y|ies|ied)\\b'); // copy→copies; destroy/play take plain suffixes
  if (word.endsWith('e')) return new RegExp('\\b' + word.slice(0, -1) + '(e|es|ed|ing)\\b');
  return new RegExp('\\b' + word + '(s|es|ed|ing)?\\b');
}

const MAGIC_WORDS = (() => {
  const words = [
    /* zones */ 'hand',
    'library',
    'graveyard',
    'battlefield',
    'exile',
    'command',
    'stack',
    /* removal+interaction */ 'destroy',
    'sacrifice',
    'fight',
    'prevent',
    'redirect',
    'tap',
    'untap',
    'attach',
    'detach',
    'regenerate',
    'exchange',
    /* cards & knowledge */ 'draw',
    'discard',
    'mill',
    'scry',
    'surveil',
    'look',
    'reveal',
    'search',
    'shuffle',
    'return',
    'put',
    'cast',
    'play',
    /* building & growing */ 'create',
    'copy',
    'double',
    'proliferate',
    'populate',
    'transform',
    'flicker',
    'blink',
    'equip',
    'enchant',
    'gain',
    'lose',
    /* objects */ 'creature',
    'artifact',
    'enchantment',
    'planeswalker',
    'land',
    'token',
    'spell',
    'ability',
    'permanent',
    'aura',
    'equipment',
    'commander',
    'emblem',
    'nonland',
    /* targeting & scope */ 'target',
    'each',
    'all',
    'any',
    'another',
    'random',
    'opponent',
    'player',
    'controller',
    'owner',
    'control',
    /* resources & stats */ 'mana',
    'life',
    'damage',
    'treasure',
    'clue',
    'food',
    'blood',
    'energy',
    'poison',
    'power',
    'toughness',
    'loyalty',
    'top',
    'bottom',
    'extra',
    /* timing */ 'whenever',
    'when',
    'beginning',
    'upkeep',
    'combat',
    'turn',
    'phase',
    'attack',
    'block',
    /* keywords */ 'flying',
    'deathtouch',
    'lifelink',
    'haste',
    'vigilance',
    'trample',
    'menace',
    'reach',
    'defender',
    'hexproof',
    'ward',
    'indestructible',
    'flash',
    'prowess',
    'landfall',
    'cascade',
    'cycling',
    'flashback',
    'first strike',
    'double strike',
    'fear',
    'intimidate',
    'skulk',
    'shadow',
  ];
  const out = words.map((w) => ({ k: w, re: _mwRegex(w) }));
  // The two senses of "counter" are opposite worlds — Counterspell is no
  // kin of Hardened Scales — so they are separate index entries, plus the
  // +1/+1 literal that marks the growth family unambiguously.
  out.push({
    k: 'counter-spell',
    re: /\bcounters?\b(?=\s+(target|it|that|all|each|a\b|an\b|any|the))/,
  });
  out.push({ k: 'counter-on', re: /\bcounters?\s+(on|from|among)\b/ });
  out.push({ k: '+1/+1', re: /\+1\/\+1/ });
  return out;
})();

const MW_KEYS = new Set(MAGIC_WORDS.map((w) => w.k));

/* Multi-word MAGIC PHRASES — whole functional sentences that single words
   can't capture. They ride the same corpus rarity weighting as words (the
   frequency pass calls magicWordSet, so their counts fall out for free),
   and with the quadratic curve a rare phrase like “choose new targets”
   is worth the full seven points. One engine — Similar AND Budget. */
const MAGIC_PHRASES = [
  'choose new targets',
  'without paying its mana cost',
  "can't be countered",
  'extra turn',
  'extra combat phase',
  'untap all',
  'damage to each opponent',
  'whenever you cast',
  'first noncreature spell',
  'from your graveyard',
  'loses the game',
  'wins the game',
  "can't untap",
  "doesn't untap",
  'skip your',
  'each opponent sacrifices',
  'return it to the battlefield',
  'damage that would be dealt',
];

function magicWordSet(card) {
  if (card._mws) return card._mws;
  const faces =
    card.card_faces && card.card_faces.length
      ? card.card_faces
      : card.f && card.f.length
        ? card.f
        : [card];
  const t = faces
    .map((fc) => fc.oracle_text || fc.ot || '')
    .join(' ')
    .toLowerCase()
    .replace(/\u2019/g, "'");
  const out = new Set();
  for (const w of MAGIC_WORDS) {
    if (w.re.test(t)) out.add(w.k);
  }
  for (const ph of MAGIC_PHRASES) {
    if (t.includes(ph)) out.add('p:' + ph);
  }
  (card.keywords || card.kw || []).forEach((k) => {
    const lk = String(k).toLowerCase();
    if (MW_KEYS.has(lk)) out.add(lk);
  });
  card._mws = out; // session cache; SLIM_KEYS strips it on save
  return out;
}

/* Word rarity across the whole local corpus — sharing "look" (rare) says
   far more than sharing "creature" (everywhere). Without the local
   database everything weighs 1 and the tiers still hold. */
let _mwFreq = null,
  _mwFreqP = null;

function magicWordWeights() {
  if (_mwFreq) return Promise.resolve(_mwFreq);
  if (_mwFreqP) return _mwFreqP;
  _mwFreqP = (async () => {
    try {
      const ix = await bulkIndexReady();
      if (ix && ix.cards && ix.cards.length) {
        const freq = new Map();
        for (let i = 0; i < ix.cards.length; i++) {
          magicWordSet(ix.cards[i]).forEach((k) => freq.set(k, (freq.get(k) || 0) + 1));
          if (i % 1500 === 0) await _bulkYield();
        }
        _mwFreq = { total: ix.cards.length, freq };
        return _mwFreq;
      }
    } catch (e) {}
    _mwFreq = { total: 0, freq: new Map() };
    return _mwFreq;
  })();
  return _mwFreqP;
}

function mwWeight(k, fw) {
  if (!fw || !fw.total) return 1;
  const f = fw.freq.get(k) || 1;
  return Math.log(1 + fw.total / f);
}

function colorIdOf(c) {
  if (typeof c.ci === 'string') return c.ci;
  return (c.color_identity || []).join('');
}

/* The source card's own EDHREC page: every card EDHREC lists alongside it
   (synergy lists first, then the rest), as name → position. One fetch,
   week-cached like every EDHREC page; absence (offline, brand-new card,
   page missing) returns an empty map and the ranking stands unchanged. */
/* Every card list on an EDHREC page, in payload order — with the defensive
   walk for the day EDHREC moves cardviews again. */
function _edhrecWalkLists(data) {
  const lists = (((data || {}).container || {}).json_dict || {}).cardlists || [];
  const out = lists.map((L) => ({
    tag: String(L.tag || L.header || ''),
    names: ((L && L.cardviews) || []).map((cv) => cv && cv.name).filter(Boolean),
  }));
  if (!out.some((L) => L.names.length)) {
    (function walk(o, d) {
      if (!o || typeof o !== 'object' || d > 6) return;
      if (Array.isArray(o.cardviews))
        out.push({
          tag: String(o.tag || o.header || ''),
          names: o.cardviews.map((cv) => cv && cv.name).filter(Boolean),
        });
      for (const k in o) walk(o[k], d + 1);
    })(data, 0);
  }
  return out;
}

/* The source card's own EDHREC page as name → {i, syn}: position for
   tie-breaking, syn marking membership in a synergy list (worth more). */
async function edhrecPageNames(card) {
  try {
    const data = await edhrecFetchJson('/pages/cards/' + edhrecSlug(card.name) + '.json');
    const out = new Map();
    const take = (L, syn) =>
      L.names.forEach((n) => {
        if (!out.has(n)) out.set(n, { i: out.size, syn });
      });
    const lists = _edhrecWalkLists(data);
    lists.filter((L) => /synergy/i.test(L.tag)).forEach((L) => take(L, true));
    lists.forEach((L) => take(L, false));
    out.delete(card.name);
    return out;
  } catch (e) {
    return new Map();
  }
}

/* The themes the source card belongs to, read from the SAME cached card
   page — theme links look like /tags/discard; pure colour-combo slugs are
   noise and skipped. Up to three, in order of appearance. */
async function edhrecCardThemes(card) {
  try {
    const data = await edhrecFetchJson('/pages/cards/' + edhrecSlug(card.name) + '.json');
    const seen = new Set();
    const out = [];
    const re = /\/tags\/([a-z0-9-]{3,40})/g;
    const text = JSON.stringify(data) || '';
    let m2;
    while ((m2 = re.exec(text)) && out.length < 3) {
      const slug = m2[1];
      if (seen.has(slug) || /^[wubrgc]{1,5}$/.test(slug)) continue;
      seen.add(slug);
      out.push(slug);
    }
    return out;
  } catch (e) {
    return [];
  }
}

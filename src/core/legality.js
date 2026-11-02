// core / legality

/* ================= CONSTRUCTED LEGALITY =================
   The same shape as Commander's: bans by NAME from a list that stays
   current by itself (seeded, then refreshed from Scryfall once a day per
   format), and the per-card facts -- legal or not in this format at all
   (rotation, rarity, card pool) -- from the weekly card file (lx), a fresh
   Scryfall object, or a small live cache for whatever neither knows yet. */
const LX_FORMATS = [
  'standard',
  'pauper',
  'modern',
  'legacy',
  'vintage',
  'paupercommander',
  'duel',
  'predh',
  'premodern',
];

const LX_WORD = { l: 'legal', b: 'banned', r: 'restricted', n: 'not_legal' };

/* Seed lists as announced on 10 August 2026 (next announcement 12 October
   2026). They only speak until the first daily refresh lands. */
const FMT_BAN_SEED_T = Date.parse('2026-08-10T00:00:00Z');

const FMT_BAN_SEED = {
  standard: [
    "Abuelo's Awakening",
    'Badgermole Cub',
    'Cori-Steel Cutter',
    'Gran-Gran',
    'Heartfire Hero',
    'Hopeless Nightmare',
    'Monstrous Rage',
    "Proft's Eidetic Memory",
    'Screaming Nemesis',
    "Stormchaser's Talent",
    "This Town Ain't Big Enough",
    'Up the Beanstalk',
    'Vivi Ornitier',
  ],
  modern: [
    'Amped Raptor',
    'Ancient Den',
    "Arcum's Astrolabe",
    'Birthing Pod',
    'Blazing Shoal',
    'Bridge from Below',
    'Chrome Mox',
    'Cloudpost',
    'Dark Depths',
    'Deathrite Shaman',
    'Dig Through Time',
    'Dread Return',
    'Eye of Ugin',
    'Field of the Dead',
    'Fury',
    'Gitaxian Probe',
    'Glimpse of Nature',
    'Golgari Grave-Troll',
    'Great Furnace',
    'Grief',
    'Hogaak, Arisen Necropolis',
    'Hypergenesis',
    'Jegantha, the Wellspring',
    'Krark-Clan Ironworks',
    'Lotus Field',
    'Lurrus of the Dream-Den',
    'Mental Misstep',
    'Mycosynth Lattice',
    'Mystic Sanctuary',
    'Nadu, Winged Wisdom',
    'Oko, Thief of Crowns',
    'Once Upon a Time',
    "Phlage, Titan of Fire's Fury",
    'Ponder',
    'Punishing Fire',
    'Rite of Flame',
    'Seat of the Synod',
    'Second Sunrise',
    'Seething Song',
    "Sensei's Divining Top",
    'Simian Spirit Guide',
    'Skullclamp',
    'Summer Bloom',
    'The One Ring',
    "Tibalt's Trickery",
    'Treasure Cruise',
    'Tree of Tales',
    'Underworld Breach',
    'Up the Beanstalk',
    'Uro, Titan of Critical Acclaim',
    'Vault of Whispers',
    'Yorion, Sky Nomad',
  ],
  pauper: [
    'Aarakocra Sneak',
    'All That Glitters',
    "Arcum's Astrolabe",
    'Atog',
    'Basking Broodscale',
    'Chatterstorm',
    'Cloud of Faeries',
    'Cloudpost',
    'Cranial Plating',
    'Cranial Ram',
    'Daze',
    'Deadly Dispute',
    'Disciple of the Vault',
    'Empty the Warrens',
    'Fall from Favor',
    'Frantic Search',
    'Galvanic Relay',
    'Gitaxian Probe',
    'Grapeshot',
    'Gush',
    'High Tide',
    'Hymn to Tourach',
    'Invigorate',
    'Kuldotha Rebirth',
    'Monastery Swiftspear',
    'Mystic Sanctuary',
    'Narcomoeba',
    'Peregrine Drake',
    'Price of Progress',
    'Seeker of Skybreak',
    'Sinkhole',
    "Sojourner's Companion",
    'Stirring Bard',
    'Temporal Fissure',
    'Treasure Cruise',
    'Underdark Explorer',
    'Vicious Battlerager',
  ],
  legacy: [
    'Ancestral Recall',
    "Arcum's Astrolabe",
    'Balance',
    'Bazaar of Baghdad',
    'Black Lotus',
    'Candelabra of Tawnos',
    'Channel',
    'Chaos Orb',
    'Deathrite Shaman',
    'Demonic Consultation',
    'Demonic Tutor',
    'Dig Through Time',
    'Dreadhorde Arcanist',
    'Earthcraft',
    'Entomb',
    'Expressive Iteration',
    'Falling Star',
    'Fastbond',
    'Flash',
    'Frantic Search',
    'Gitaxian Probe',
    'Goblin Recruiter',
    'Grief',
    'Gush',
    'Hermit Druid',
    'Imperial Seal',
    'Library of Alexandria',
    'Lurrus of the Dream-Den',
    'Mana Crypt',
    'Mana Drain',
    'Mana Vault',
    'Memory Jar',
    'Mental Misstep',
    'Mind Twist',
    "Mishra's Workshop",
    'Mox Emerald',
    'Mox Jet',
    'Mox Pearl',
    'Mox Ruby',
    'Mox Sapphire',
    'Mystical Tutor',
    'Nadu, Winged Wisdom',
    'Necropotence',
    'Oath of Druids',
    'Oko, Thief of Crowns',
    'Psychic Frog',
    'Ragavan, Nimble Pilferer',
    "Sensei's Divining Top",
    'Shahrazad',
    'Skullclamp',
    'Sol Ring',
    'Sowing Mycospawn',
    'Strip Mine',
    'Survival of the Fittest',
    'The Fantasticar',
    'Time Vault',
    'Time Walk',
    'Timetwister',
    'Tinker',
    'Tolarian Academy',
    'Treasure Cruise',
    'Troll of Khazad-dûm',
    'Undercity Informer',
    'Underworld Breach',
    'Vampiric Tutor',
    'Vexing Bauble',
    'Wheel of Fortune',
    'White Plume Adventurer',
    'Windfall',
    'Wrenn and Six',
    "Yawgmoth's Bargain",
    "Yawgmoth's Will",
    'Zirda, the Dawnwaker',
  ],
  vintage: ['Chaos Orb', 'Falling Star', 'Shahrazad'],
  vintageRestricted: [
    'Ancestral Recall',
    'Balance',
    'Black Lotus',
    'Brainstorm',
    'Chalice of the Void',
    'Channel',
    'Demonic Consultation',
    'Demonic Tutor',
    'Dig Through Time',
    'Flash',
    'Gitaxian Probe',
    'Golgari Grave-Troll',
    'Gush',
    'Imperial Seal',
    'Karn, the Great Creator',
    'Library of Alexandria',
    "Lion's Eye Diamond",
    'Lodestone Golem',
    'Lotus Petal',
    'Mana Crypt',
    'Mana Vault',
    'Memory Jar',
    'Mental Misstep',
    'Merchant Scroll',
    "Mind's Desire",
    'Monastery Mentor',
    'Mox Emerald',
    'Mox Jet',
    'Mox Pearl',
    'Mox Ruby',
    'Mox Sapphire',
    'Mystic Forge',
    'Mystical Tutor',
    'Narset, Parter of Veils',
    'Necropotence',
    'Sol Ring',
    'Strip Mine',
    'The Fantasticar',
    'Thorn of Amethyst',
    'Time Vault',
    'Time Walk',
    'Timetwister',
    'Tinker',
    'Tolarian Academy',
    'Treasure Cruise',
    'Trinisphere',
    "Urza's Saga",
    'Vampiric Tutor',
    'Vexing Bauble',
    'Wheel of Fortune',
    'Windfall',
    "Yawgmoth's Will",
  ],
};

const FMT_BAN_TTL = 24 * 60 * 60 * 1000;

let _fmtBansLoading = {};

const _fmtBanSetCache = {};

function _fmtBansStore() {
  if (!state.fmtBans) {
    try {
      state.fmtBans = JSON.parse(localStorage.getItem(LS_PREFIX + 'fmtBans') || 'null') || {};
    } catch (e) {
      state.fmtBans = {};
    }
  }
  return state.fmtBans;
}

/* {banned, restricted, t, live} for a constructed format, as lookup sets. */
function fmtBanSets(fmt) {
  const st = _fmtBansStore();
  const rec = st[fmt];
  const t = rec ? rec.t || 0 : -1;
  const c = _fmtBanSetCache[fmt];
  if (c && c.t === t) return c;
  const names = rec && Array.isArray(rec.names) ? rec.names : FMT_BAN_SEED[fmt] || [];
  const restr =
    fmt === 'vintage'
      ? rec && Array.isArray(rec.restricted)
        ? rec.restricted
        : FMT_BAN_SEED.vintageRestricted
      : [];
  const out = {
    t,
    live: !!rec,
    banned: new Set(names.map(norm)),
    restricted: new Set(restr.map(norm)),
    names: names.slice().sort((a, b) => a.localeCompare(b)),
    restrictedNames: restr.slice().sort((a, b) => a.localeCompare(b)),
  };
  _fmtBanSetCache[fmt] = out;
  return out;
}

/* Once a day per format: the official list, straight from Scryfall. */
async function ensureFmtBans(fmt, force) {
  if (!isConstructedFmt(fmt)) return;
  const st = _fmtBansStore();
  const rec = st[fmt];
  if (rec && !force && Date.now() - (rec.t || 0) < FMT_BAN_TTL) return;
  if (_fmtBansLoading[fmt]) return;
  _fmtBansLoading[fmt] = true;
  try {
    const pull = async (q) => {
      const names = new Set();
      let next = `${SF_BASE}/cards/search?order=name&q=${encodeURIComponent(q)}`,
        guard = 0;
      while (next && guard < 6) {
        guard++;
        const r = await sfFetch(next, 0, !force);
        if (!r.ok) {
          if (r.status === 404) break;
          return null;
        }
        const d = await r.json();
        (d.data || []).forEach((c) => {
          if (c && c.name) names.add(c.name.split(' // ')[0]);
        });
        next = d.has_more ? d.next_page : null;
      }
      return Array.from(names);
    };
    const banned = await pull('banned:' + fmt);
    const restricted = fmt === 'vintage' ? await pull('restricted:vintage') : [];
    // Vintage bans next to nothing, so an empty answer is fine there; for
    // the others an empty list means the request failed, not a clean slate.
    if (banned && restricted && (banned.length || fmt === 'vintage')) {
      st[fmt] = { t: Date.now(), names: banned, restricted };
      try {
        localStorage.setItem(LS_PREFIX + 'fmtBans', JSON.stringify(st));
      } catch (e) {}
      _cmdrBansTouchUi();
    }
  } catch (e) {
  } finally {
    _fmtBansLoading[fmt] = false;
  }
}

/* A card's standing in any format the weekly file carries (lx). */
function bulkLegality(name, fmt) {
  const i = LX_FORMATS.indexOf(fmt);
  if (i < 0) return null;
  let ix = null;
  try {
    ix = _bulkIdx;
  } catch (e) {}
  if (!ix || !ix.byName || !ix.hasLx) return null;
  const bc =
    ix.byName.get(String(name || '').toLowerCase()) ||
    ix.byName.get(
      String(name || '')
        .split(' // ')[0]
        .toLowerCase(),
    );
  if (!bc) return null;
  return LX_WORD[(bc.lx || '')[i]] || 'not_legal';
}

/* Live cache for cards the weekly file does not know yet (a set newer than
   the build): one batched POST per 75 names, kept for a week. */
const FMT_LEG_TTL = 7 * 24 * 60 * 60 * 1000;

let _fmtLegMem = null,
  _fmtLegQueue = new Set(),
  _fmtLegTimer = null;

function _fmtLegStore() {
  if (!_fmtLegMem) {
    try {
      _fmtLegMem = JSON.parse(localStorage.getItem(LS_PREFIX + 'fmtLeg') || 'null') || {};
    } catch (e) {
      _fmtLegMem = {};
    }
  }
  return _fmtLegMem;
}

function liveLegality(name, fmt) {
  const i = LX_FORMATS.indexOf(fmt);
  if (i < 0) return null;
  const rec = _fmtLegStore()[String(name || '')];
  if (!rec || Date.now() - (rec[0] || 0) > FMT_LEG_TTL) return null;
  return LX_WORD[(rec[1] || '')[i]] || 'not_legal';
}

function lxLetters(leg) {
  return LX_FORMATS.map(
    (f) => ({ legal: 'l', banned: 'b', restricted: 'r', not_legal: 'n' })[leg && leg[f]] || 'n',
  ).join('');
}

function queueFmtLegality(names) {
  (names || []).forEach((n) => {
    if (n) _fmtLegQueue.add(n);
  });
  if (!_fmtLegQueue.size || _fmtLegTimer) return;
  _fmtLegTimer = setTimeout(async () => {
    _fmtLegTimer = null;
    const all = Array.from(_fmtLegQueue);
    _fmtLegQueue.clear();
    const store = _fmtLegStore();
    let got = 0;
    for (let i = 0; i < all.length; i += 75) {
      const chunk = all.slice(i, i + 75);
      try {
        const r = await postWithTimeout(
          `${SF_BASE}/cards/collection`,
          { identifiers: chunk.map((n) => ({ name: n.split(' // ')[0] })) },
          6000,
        );
        if (!r || !r.ok) continue;
        const j = await r.json();
        (j.data || []).forEach((c) => {
          if (!c || !c.name || !c.legalities) return;
          const rec = [Date.now(), lxLetters(c.legalities)];
          store[c.name] = rec;
          const cut = c.name.indexOf(' // ');
          if (cut > 0) store[c.name.slice(0, cut)] = rec;
          got++;
        });
      } catch (e) {}
    }
    if (got) {
      try {
        localStorage.setItem(LS_PREFIX + 'fmtLeg', JSON.stringify(store));
      } catch (e) {}
      _cmdrBansTouchUi();
    }
  }, 900);
}

/* The verdict for one card in one format: 'legal' | 'restricted' |
   'banned' | 'not_legal' | 'preview' | 'unknown'. Bans come from the list
   by name (a stale snapshot never outvotes an unban); legal-or-not comes
   from the card's own facts. */
function fmtVerdict(card, fmt) {
  if (!card) return 'legal';
  if (fmt === 'commander') return commanderVerdict(card);
  if (isPreviewCard(card)) return 'preview';
  const nm = norm(String(card.name || '').split(' // ')[0]);
  if (isConstructedFmt(fmt)) {
    const B = fmtBanSets(fmt);
    if (B.banned.has(nm)) return 'banned';
    if (fmt === 'vintage' && B.restricted.has(nm)) return 'restricted';
  }
  if (
    ['funny', 'memorabilia', 'token', 'minigame', 'alchemy'].includes(card.set_type) ||
    [
      'token',
      'art_series',
      'emblem',
      'planar',
      'scheme',
      'vanguard',
      'double_faced_token',
    ].includes(card.layout) ||
    card.digital === true
  )
    return 'not_legal';
  let v =
    (card.legalities && card.legalities[fmt]) ||
    bulkLegality(card.name, fmt) ||
    liveLegality(card.name, fmt);
  if (!v) return 'unknown';
  // Bans and restrictions are the list's call: a snapshot saying 'banned'
  // for a card the current list no longer carries means it came off.
  if (isConstructedFmt(fmt) && (v === 'banned' || v === 'restricted')) v = 'legal';
  return v;
}

/* May this card go into this deck at all? '' when yes, else the reason. */
function deckBlockReason(card, d) {
  if (!d || !card) return '';
  if (deckIsConstructed(d)) {
    const v = fmtVerdict(card, deckFormat(d));
    if (v === 'banned') return 'Banned';
    if (v === 'not_legal') return 'Not legal in ' + fmtLabelOf(deckFormat(d));
    if (v === 'unknown') queueFmtLegality([card.name]);
    return '';
  }

  // format has Scryfall's word on the card.
  const f = deckFormat(d);
  const v = fmtVerdict(card, f);
  if (v === 'banned') return 'Banned';
  if (v === 'not_legal') return 'Not legal in ' + fmtLabelOf(f);
  if (v === 'unknown') queueFmtLegality([card.name]);
  return '';
}

function copyLimit(card, d) {
  if (!card || allowsDuplicates(card)) return Infinity;
  if (deckIsConstructed(d)) {
    if (deckFormat(d) === 'vintage' && fmtVerdict(card, 'vintage') === 'restricted') return 1;
    return 4;
  }
  return 1;
}

function copiesIn(list, name) {
  let n = 0;
  (list || []).forEach((c) => {
    if (c && c.name === name) n++;
  });
  return n;
}

/* Copy limits count main deck and sideboard together, as the rules do. */
function atCopyLimit(d, card, list) {
  if (!d || !card) return false;
  const lim = copyLimit(card, d);
  if (lim === Infinity) return false;
  const pool =
    list || (deckIsConstructed(d) ? (d.cards || []).concat(ensureMaybeboard(d)) : d.cards);
  return copiesIn(pool, card.name) >= lim;
}

/* Banned in which format? A deck answers for itself, a format id is taken
   as given, and without either the page in front of the player decides. */
function banFmtOf(ctx) {
  if (ctx && typeof ctx === 'object') return deckFormat(ctx);
  if (typeof ctx === 'string' && ctx) return ctx;
  return ctxFmt();
}

function isBanned(card, ctx) {
  if (!card) return false;
  const f = banFmtOf(ctx);
  if (f === 'any') return false; // no format chosen: nothing is banned
  if (f === 'commander') {
    // The live name list is the truth; a per-card snapshot (when a card
    // still carries one — slim storage drops it) only fills an empty list.
    const bans = cmdrBanSet();
    if (bans.size) return bans.has(norm((card.name || '').split(' // ')[0]));
    return !!(card.legalities && card.legalities.commander === 'banned');
  }
  return fmtVerdict(card, f) === 'banned';
}

function frontFace(card) {
  return card.card_faces && card.card_faces.length ? card.card_faces[0] : card;
}

function isNonlandFront(card) {
  const f = frontFace(card);
  return f.type_line && !f.type_line.includes('Land');
}

function hasPowerToughness(card) {
  const f = frontFace(card);
  return f.power !== undefined && f.power !== null;
}

function isLegendary(card) {
  return (card.type_line || '').includes('Legendary');
}

function allowsDuplicates(card) {
  // Basic lands may always repeat (rule 903.5c) — their text doesn't say so.
  const tl =
    card.type_line ||
    (card.card_faces && card.card_faces[0] ? card.card_faces[0].type_line : '') ||
    '';
  if (/\bBasic\b/i.test(tl)) return true;
  const text =
    card.oracle_text ||
    (card.card_faces ? card.card_faces.map((f) => f.oracle_text || '').join(' ') : '') ||
    '';
  return /a deck can have any number of cards named/i.test(text);
}

/* ---- multi-leader (partner) mechanics ------------------------------------
   Commander lets certain cards share command: Partner, Partner with <name>,
   Friends forever, Choose a Background + Background enchantments, and
   Time Lord Doctors + Doctor's companion. Each leader card is classified
   into one "pair kind"; canPair() encodes which kinds accept each other. */
function oracleAllText(card) {
  return (
    card.oracle_text ||
    (card.card_faces ? card.card_faces.map((f) => f.oracle_text || '').join('\n') : '') ||
    ''
  );
}

function pairAbility(card) {
  if (!card) return null;
  const t = card.type_line || frontFace(card).type_line || '';
  const o = oracleAllText(card);
  const kw = card.keywords || [];
  if (/Time Lord Doctor/i.test(t)) return { kind: 'doctor', label: 'Time Lord Doctor' };
  if (kw.includes("Doctor's companion") || /Doctor's companion/i.test(o))
    return { kind: 'companion', label: "Doctor's companion" };
  if (/\bBackground\b/.test(t)) return { kind: 'background', label: 'Background' };
  if (kw.includes('Choose a Background') || /Choose a Background/i.test(o))
    return { kind: 'chooseBg', label: 'Choose a Background' };
  if (kw.includes('Friends forever') || /Friends forever/i.test(o))
    return { kind: 'friends', label: 'Friends forever' };
  // 1.22: Partner—<group> (Father & son, Survivors, Character select ...):
  // only cards with the SAME group text, never plain Partner (CR 702.124)
  const pq = o.match(/(?:^|\n)Partner\s*[\u2014\u2013]\s*([^\n(]+?)\s*(?:\(|\n|$)/);
  if (pq) return { kind: 'partnerQ', q: pq[1].trim(), label: 'Partner\u2014' + pq[1].trim() };
  const pw = o.match(/Partner with ([^\n(]+?)(?:\s*\(|\s*$|\n)/i);
  if (pw || kw.includes('Partner with'))
    return {
      kind: 'partnerWith',
      with: pw ? pw[1].trim().replace(/[.,;]+$/, '') : '',
      label: 'Partner with',
    };
  if (kw.includes('Partner') || /(^|\n)Partner(\s*\(|\s*$)/.test(o))
    return { kind: 'partner', label: 'Partner' };
  return null;
}

function cardBaseName(card) {
  return ((card && card.name) || '').split('//')[0].trim().toLowerCase();
}

function canPair(a, b) {
  if (!a || !b || cardBaseName(a) === cardBaseName(b)) return false;
  const A = pairAbility(a),
    B = pairAbility(b);
  if (!A || !B) return false;
  switch (A.kind) {
    case 'partner':
      return B.kind === 'partner';
    case 'partnerQ':
      return B.kind === 'partnerQ' && (A.q || '').toLowerCase() === (B.q || '').toLowerCase();
    case 'partnerWith':
      return B.kind === 'partnerWith' && (A.with || '').toLowerCase() === cardBaseName(b);
    case 'friends':
      return B.kind === 'friends';
    case 'chooseBg':
      return B.kind === 'background';
    case 'background':
      return B.kind === 'chooseBg';
    case 'doctor':
      return B.kind === 'companion';
    case 'companion':
      return B.kind === 'doctor';
  }
  return false;
}

/* Scryfall clause that over-fetches candidates for a given leader's pair
   mechanic; canPair() does the exact filtering client-side. */
function pairSearchClause(card) {
  const A = pairAbility(card);
  if (!A) return null;
  switch (A.kind) {
    case 'partner':
      return 't:legendary o:partner -o:"partner with"';
    case 'partnerQ':
      return 't:legendary o:partner o:"' + String(A.q || '').replace(/"/g, '') + '"';
    case 'partnerWith':
      return A.with ? '!"' + A.with.replace(/"/g, '') + '"' : null;
    case 'friends':
      return 't:legendary o:"friends forever"';
    case 'chooseBg':
      return 't:legendary t:background';
    case 'background':
      return 't:legendary o:"choose a background"';
    case 'doctor':
      return 't:legendary o:"doctor\'s companion"';
    case 'companion':
      return 't:legendary t:"time lord doctor"';
  }
  return null;
}

/* One clause matching every pair-capable leader — used by the browse page to
   assemble two-commander pairs for a chosen color combination. */
const ANY_PAIR_CLAUSE =
  '(o:partner or o:"friends forever" or o:"choose a background" or t:background or o:"doctor\'s companion" or t:"time lord doctor")';

// The serialized `admiral` field stores the commander in existing decks and backups.
function deckLeaders(d) {
  const out = [];
  if (d && d.admiral) out.push(d.admiral);
  if (d && d.partner) out.push(d.partner);
  return out;
}

const WUBRG_ORDER = ['W', 'U', 'B', 'R', 'G'];

function deckColorIdentity(d) {
  const set = new Set();
  deckLeaders(d).forEach((c) => (c.color_identity || []).forEach((x) => set.add(x)));
  return WUBRG_ORDER.filter((x) => set.has(x));
}

function colorIdentityOkDeck(card, d) {
  if (!d || !deckLeaders(d).length) return true;
  const need = new Set(deckColorIdentity(d));
  return (card.color_identity || []).every((c) => need.has(c));
}

/* Second-in-command eligibility for the current mode. */
function partnerEligible(d, c) {
  if (!c || !d || !d.admiral) return false;
  if (!canPair(d.admiral, c)) return false;
  if (!isNonlandFront(c) || !isLegendary(c)) return false;
  if (deckFormat(d) === 'commander') {
    if (commanderVerdict(c) === 'banned') return false;
  } else {
    if (isBanned(c)) return false;

    const A = pairAbility(c);
    if (!(A && A.kind === 'background') && !hasPowerToughness(c)) return false;
  }
  return true;
}

/* 1.21: a tap into the Search field while it holds text selects ALL of it,
   so a backspace or the first letter typed replaces it at once. Document-level,
   so every render of the page (and every route to it) is covered. Only the
   first tap: a second tap places the cursor as usual. */
(function () {
  const isSearch = (t) => t && t.id === 'searchName';
  const selAll = (t) => {
    try {
      if (t.value) t.setSelectionRange(0, t.value.length);
    } catch (e) {}
  };
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target;
      if (!isSearch(t) || !t.value) return;
      t._selOnTap = true;
      setTimeout(() => {
        if (document.activeElement === t) selAll(t);
      }, 0);
    },
    true,
  );
  // the tap's own mouseup/click would drop the caret into the text: select again after it
  ['pointerup', 'click'].forEach((ev) =>
    document.addEventListener(
      ev,
      (e) => {
        const t = e.target;
        if (!isSearch(t) || !t._selOnTap) return;
        if (ev === 'click') t._selOnTap = false;
        setTimeout(() => selAll(t), 0);
      },
      true,
    ),
  );
  document.addEventListener(
    'focusout',
    (e) => {
      if (isSearch(e.target)) e.target._selOnTap = false;
    },
    true,
  );
})();

/* Called whenever the first seat changes: a partner that no longer pairs
   steps down into the main deck rather than being lost. */
function reconcilePartner(d) {
  if (!d || !d.partner) return;
  if (d.admiral && canPair(d.admiral, d.partner)) return;
  const p = d.partner;
  d.partner = null;
  if (!d.cards.some((x) => x.name === p.name) || allowsDuplicates(p)) {
    d.cards.push(p);
    logDeckChange(d, { type: 'add', name: p.name, card: p });
    toast(`${p.name} no longer pairs — moved into the deck instead.`);
  } else {
    toast(`${p.name} no longer pairs and a copy was already in the deck.`);
  }
}

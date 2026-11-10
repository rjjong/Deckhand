// core / formats

/* ========================= FORMAT DEFINITION ========================= */

/* ---------- Formats ----------
   ONE app. Every deck carries its own format; what may go in it is the
   card's legality in that format. The library groups decks by format.
   Nothing else splits the app. */

function fmtName(d) {
  const f = d && d.format ? d.format : 'commander';
  if (isConstructedFmt(f)) return fmtLabelOf(f);
  return 'Commander';
}

function leaderNoun(fmt, plural) {
  const w = 'Commander';
  return plural ? w + 's' : w;
}

/* Who may lead a deck of this format: the Scryfall words for a search,
   and the same rule for a card in hand. */
/* 1.19: legal in this format -- or not yet released (a spoiler is marked
   not_legal until release day), never on the format's ban list. */
function sfLegalClause(fmt) {
  const today = new Date().toISOString().slice(0, 10);
  return `((legal:${fmt} or date>${today}) -banned:${fmt})`;
}

function leaderSearchClause(fmt) {
  if (fmt === 'paupercommander') return 't:creature r:uncommon';
  if (fmt === 'duel') return 'is:duelcommander'; // Scryfall knows Duel's banned-as-commander list
  return 'is:commander';
}

/* The format a leader SEARCH may filter by. Pauper Commander's leaders are
   uncommon creatures, which Scryfall (since the PDH framework of Nov 2024)
   marks not_legal -- they are only legal in the command zone -- so that
   search must not demand legal:paupercommander. */
function leaderSearchFmt(fmt) {
  return fmt === 'paupercommander' ? 'any' : fmt;
}

function leaderFitsFormat(c, fmt) {
  if (!c || !isNonlandFront(c)) return false;
  if (fmt === 'paupercommander') return (frontFace(c).type_line || '').includes('Creature');
  const face = frontFace(c);
  return (
    (isLegendary(c) && (face.type_line || '').includes('Creature')) ||
    /can be your commander/i.test(c.oracle_text || face.oracle_text || '')
  );
}

/* The format the page in front of the player is about: the recommendation
   being built, the open deck, the Inspiration format, the Search filter or
   its pinned deck. Legality asked without a deck in hand takes this. */
function ctxFmt() {
  try {
    if (state.reco && state.reco.format && document.getElementById('recoOverlay'))
      return state.reco.format;
    const sc = state.screen;
    if (sc === 'decklist') {
      const d = getDeck(state.activeDeckId);
      if (d) return deckFormat(d);
    }
    if (sc === 'inspiration') {
      const d = getDeck(state.inspireDeckId);
      if (d) return deckFormat(d);
    }
    if (sc === 'browse') return browseFmt();
    // Search: ONLY the Format filter restricts. With no format chosen every
    // card is findable -- no ban, no card pool, no land rule -- even with a
    // deck pinned (its format pre-fills the filter; clearing it opens all).
    if (sc === 'search')
      return state.searchFormat && state.searchFormat !== 'any' ? state.searchFormat : 'any';
  } catch (e) {}
  return 'commander';
}

/* Colour scheme: the ten two-colour guilds. main = the INK role (the page,
   what used to be the dark red), side = the SURFACE role (panels and fields,
   what used to be the dark blue) — Stef's fixed assignment, guild by guild.
   GUILD_SWATCH mirrors the CSS palettes' ink and panel hexes for the picker's
   swatches. Device defaults use Rakdos in dark mode and Azorius in light mode. */
const GUILDS = [
  { k: 'azorius', n: 'Azorius', main: 'W', side: 'U' },
  { k: 'dimir', n: 'Dimir', main: 'U', side: 'B' },
  { k: 'rakdos', n: 'Rakdos', main: 'B', side: 'R' },
  { k: 'gruul', n: 'Gruul', main: 'R', side: 'G' },
  { k: 'selesnya', n: 'Selesnya', main: 'G', side: 'W' },
  { k: 'orzhov', n: 'Orzhov', main: 'W', side: 'B' },
  { k: 'izzet', n: 'Izzet', main: 'U', side: 'R' },
  { k: 'golgari', n: 'Golgari', main: 'B', side: 'G' },
  { k: 'boros', n: 'Boros', main: 'R', side: 'W' },
  { k: 'simic', n: 'Simic', main: 'G', side: 'U' },
];

const GUILD_SWATCH = {
  W: ['#F1E0AC', '#EEDBA5'],
  U: ['#08395E', '#0B4E80'],
  B: ['#0E0A07', '#1F1B18'],
  R: ['#741217', '#9E1820'],
  G: ['#003F22', '#00562F'],
};

function currentGuild() {
  return GUILDS.find((g) => g.k === state.guild) || GUILDS.find((g) => g.k === 'rakdos');
}

/* Format catalog — the buildable formats, in the order their library groups
   appear on My Decks. Labels live here (not in FORMAT_RULES, declared much
   later) so early renders never trip a temporal dead zone. */
const FMT_ORDER = [
  'commander',
  'paupercommander',
  'predh',
  'duel',
  'standard',
  'pauper',
  'modern',
  'legacy',
  'vintage',
];

const FMT_LABELS = {
  commander: 'Commander',
  paupercommander: 'Pauper Commander',
  predh: 'PreDH',
  duel: 'Duel Commander',
  standard: 'Standard',
  pauper: 'Pauper',
  modern: 'Modern',
  legacy: 'Legacy',
  vintage: 'Vintage',
};

/* The 60-card formats: no leader, up to four copies of a card (Vintage's
   restricted list: one), a sideboard of up to fifteen, 20 life. */
const CONSTRUCTED_FMTS = ['standard', 'pauper', 'modern', 'legacy', 'vintage'];

function isConstructedFmt(f) {
  return CONSTRUCTED_FMTS.indexOf(f) >= 0;
}

function fmtKind(f) {
  return isConstructedFmt(f) ? 'constructed' : 'cmdr';
}

function deckKind(d) {
  return fmtKind(deckFormat(d));
}

function deckIsConstructed(d) {
  return !!d && isConstructedFmt(deckFormat(d));
}

function sideName(d) {
  return deckIsConstructed(d) ? 'Sideboard' : 'Maybeboard';
}

/* Every format the search filter knows: the five buildable ones, then the
   reference formats Scryfall can judge with legal:<id>. */
const SEARCH_FORMATS = [
  ['commander', 'Commander'],
  ['paupercommander', 'Pauper Commander'],
  ['predh', 'PreDH'],
  ['duel', 'Duel Commander'],
  ['standard', 'Standard'],
  ['pauper', 'Pauper'],
  ['modern', 'Modern'],
  ['legacy', 'Legacy'],
  ['vintage', 'Vintage'],
  ['premodern', 'Premodern'],
];

function fmtLabelOf(id) {
  return FMT_LABELS[id] || SEARCH_FORMATS.find(([key]) => key === id)?.[1] || 'Commander';
}

/* Welke formats een aanvoerder kennen, en met welk woord die daar heet.
   Staat een format hier niet in (Standard, mocht het ooit komen), dan
   verschijnt de aanvoerder-balk helemaal niet. */
const FMT_LEADER = {
  commander: 'commander',
  paupercommander: 'commander',
  predh: 'commander',
  duel: 'commander',
};

function fmtLeaderWord(id) {
  return FMT_LEADER[id] || null;
}

/* Legacy virtual format IDs remain valid in saved folder parents and imports.
   The deck library presents formats as sections rather than folder tiles. */
const FMT_FOLDER_PREFIX = '__fmt__:';

function isFmtFolder(id) {
  return typeof id === 'string' && id.startsWith(FMT_FOLDER_PREFIX);
}

function fmtOfFolder(id) {
  return isFmtFolder(id) ? id.slice(FMT_FOLDER_PREFIX.length) : null;
}

function fmtFolderId(fmt) {
  return FMT_FOLDER_PREFIX + fmt;
}

function fmtFolderDecks(fmt) {
  return state.decksIndex.filter(
    (d) => deckFormat(d) === fmt && !(d.folderId || null) && !d.collected,
  );
}

/* Which format folder (if any) a user folder ultimately sits under. */
function fmtAncestorOf(folderId) {
  let cur = folderId,
    guard = 0;
  while (cur && guard++ < 50) {
    if (isFmtFolder(cur)) return fmtOfFolder(cur);
    const f = (state.folders || []).find((x) => x.id === cur);
    if (!f) return null;
    cur = f.parentId || null;
  }
  return null;
}

function fmtFolderGlyph(fmt, sz) {
  return isConstructedFmt(fmt) ? cardsSvg(sz || 40) : '⚔';
}

/* Two cards fanned: the house line-art glyph for the 60-card formats. */
function cardsSvg(sz) {
  return `<svg viewBox="0 0 24 24" style="width:${sz || 16}px;height:${sz || 16}px;vertical-align:-2px;" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="10" height="14" rx="1.6" transform="rotate(-10 9 12)"/><rect x="10" y="5" width="10" height="14" rx="1.6" transform="rotate(8 15 12)"/></svg>`;
}

function leaderLineLabel() {
  return 'COMMANDER';
}

const FMT_SPEC = {
  commander: { min: 100, max: 100, side: 0, copies: 1, life: 40, cmdDmg: 21, lands: true },
  paupercommander: { min: 100, max: 100, side: 0, copies: 1, life: 30, cmdDmg: 16, lands: true },
  predh: { min: 100, max: 100, side: 0, copies: 1, life: 40, cmdDmg: 21, lands: true },
  duel: { min: 100, max: 100, side: 0, copies: 1, life: 20, cmdDmg: 0, lands: true },
  standard: { min: 60, max: Infinity, side: 15, copies: 4, life: 20, cmdDmg: 0, lands: true },
  pauper: { min: 60, max: Infinity, side: 15, copies: 4, life: 20, cmdDmg: 0, lands: true },
  modern: { min: 60, max: Infinity, side: 15, copies: 4, life: 20, cmdDmg: 0, lands: true },
  legacy: { min: 60, max: Infinity, side: 15, copies: 4, life: 20, cmdDmg: 0, lands: true },
  vintage: { min: 60, max: Infinity, side: 15, copies: 4, life: 20, cmdDmg: 0, lands: true },
};

function fmtSpec(f) {
  return FMT_SPEC[f] || FMT_SPEC.commander;
}

function deckSpec(d) {
  return fmtSpec(deckFormat(d));
}

function deckTotal(d) {
  return deckSpec(d).min;
}

/* The deck's count: a 60-card format with a sideboard has no maximum to
   count toward, so it reads "main + sideboard"; the rest "have/need". */
function deckCountLabel(d) {
  if (deckIsConstructed(d)) return (d.cards || []).length + ' + ' + ensureMaybeboard(d).length;
  return (d.cards || []).length + deckLeaders(d).length + '/' + deckTotal(d);
}

function deckCountState(d, issues) {
  issues = issues || checkDeckLegality(d);
  const SP = deckSpec(d),
    con = deckIsConstructed(d);
  const n = (d.cards || []).length + (con ? 0 : deckLeaders(d).length);
  if (n > SP.max || n < SP.min) return 'bad';
  if (SP.side && ensureMaybeboard(d).length > SP.side) return 'bad';
  if (issues.some((i) => i.level === 'error')) return 'bad';
  return 'ok';
}

function deckCountColor(st) {
  return st === 'bad' ? 'var(--count-bad)' : 'var(--head-ink)';
}

function brandTitle() {
  return 'Deckhand';
}

function modeGlyph() {
  return '⚔';
}

function anchorSvg(sz) {
  // The anchor, in-house style: gold line art like every other glyph — the
  // colored emoji ⚓ is retired from all rendered HTML.
  return `<svg viewBox="0 0 24 24" style="width:${sz || 16}px;height:${sz || 16}px;vertical-align:-2px;" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><line x1="12" y1="7.2" x2="12" y2="19"/><line x1="8" y1="10" x2="16" y2="10"/><path d="M5 14c0 4 3.5 6 7 6s7-2 7-6"/><path d="M5 14l-1.8 1.4M5 14l2.2.6M19 14l1.8 1.4M19 14l-2.2.6"/></svg>`;
}

/* One on one starts at 20 -- Duel Commander and every constructed format
   do; four at a table start at 40 as Commander always has. */
/* The life counter plays ONE format at a time, chosen at New Game and
   remembered: it sets the starting life and the leader damage that knocks a
   player out (none in Duel Commander and the 60-card formats). */
const LIFE_FMTS = ['commander', 'paupercommander', 'duel', 'constructed'];

function lifeFmt() {
  let f = null;
  try {
    f = localStorage.getItem(LS_PREFIX + 'lifeFmt');
  } catch (e) {}
  return LIFE_FMTS.indexOf(f) >= 0 ? f : 'commander';
}

function lifeSpec() {
  const f = lifeFmt();
  return fmtSpec(f === 'constructed' ? 'standard' : f);
}

function lifeFmtLabel(f) {
  return f === 'constructed' ? '60 cards' : fmtLabelOf(f);
}

function lifeStart(count) {
  return lifeSpec().life;
}

function lethalDmg() {
  return lifeSpec().cmdDmg || 0;
}

function lifeLeaderWord() {
  return 'Commander';
}

const PLAYER_COLORS = [
  { base: '#8A6A2E', dark: '#4A3814' }, // amber
  { base: '#7A3B44', dark: '#3E1D22' }, // crimson
  { base: '#4F5A85', dark: '#282D44' }, // indigo
  { base: '#3F6B5C', dark: '#20372F' }, // teal
  { base: '#7A5A8A', dark: '#3D2D45' }, // plum
  { base: '#8A5A32', dark: '#452D19' }, // burnt orange
];

/* The Deckhand badge: the finished launch scene (conjuring hand, green magic,
   BUILD/PLAY/COLLECT fan) rendered as a round gold-rimmed emblem. Used by the
   nav home button and the home-page logo; the same art ships as icon-512/192
   and apple-touch-icon for the installed app. */
const DECKHAND_BADGE = 'assets/images/deckhand-badge.webp';

const SALTY_MESSAGES = [
  'Top-decked into oblivion.',
  'The stack resolved without you.',
  'Should have kept that counterspell.',
  'Mana screwed by fate itself.',
  'Your graveyard sends its regards.',
  'Exiled, face down, forever.',
  'Wrathed and forgotten.',
  'The table has spoken.',
  'Out-drawn, out-played, out of luck.',
  'No flashback for this one.',
  'Scooped before the end step.',
  'Better luck next shuffle.',
];

const CATS_CMDR = [
  'Creatures',
  'Planeswalkers',
  'Battles',
  'Instants',
  'Sorceries',
  'Artifacts',
  'Enchantments',
  'Lands',
  'Other',
];

function catsFor() {
  return CATS_CMDR;
}

const SORT_MODES = [
  { key: 'type-cmc-name', label: 'Type → Mana Value → Name' },
  { key: 'type-name', label: 'Type → Name' },
  { key: 'cmc-name', label: 'Mana Value → Name' },
  { key: 'name', label: 'Name only' },
  { key: 'tags', label: 'Tags → Mana Value → Name' },
];

const TYPE_CHIPS = [
  { key: 'top', label: 'Top Cards', clause: '' },
  { key: 'creature', label: 'Creatures', clause: 't:creature' },
  { key: 'instant', label: 'Instants', clause: 't:instant' },
  { key: 'sorcery', label: 'Sorceries', clause: 't:sorcery' },
  { key: 'artifact', label: 'Artifacts', clause: 't:artifact' },
  { key: 'enchantment', label: 'Enchantments', clause: 't:enchantment' },
  { key: 'pwbattle', label: 'PW / Battles', clause: '(t:planeswalker or t:battle)' },
];

const THEME_CHIPS = [
  {
    key: 'enchantress',
    label: 'Enchantress',
    clause:
      '(t:enchantment or o:"whenever you cast an enchantment spell" or o:"whenever an enchantment enters the battlefield under your control" or o:"whenever an enchantment you control enters")',
  },
  {
    key: 'aristocrats',
    label: 'Aristocrats',
    clause:
      '(o:"whenever a creature you control dies" or o:"sacrifice a creature" or o:"sacrifice another creature")',
  },
  {
    key: 'spellslinger',
    label: 'Spellslinger',
    clause:
      '(o:"whenever you cast an instant or sorcery spell" or o:"whenever you cast an instant spell" or o:"whenever you cast a noncreature spell")',
  },
  { key: 'tokens', label: 'Tokens', clause: '(o:"create a" o:"token")' },
  {
    key: 'reanimator',
    label: 'Reanimator',
    clause:
      '(o:"return target creature card from your graveyard to the battlefield" or o:"from your graveyard to the battlefield")',
  },
  { key: 'voltron', label: 'Voltron', clause: '(t:aura or t:equipment or o:"equip ")' },
  {
    key: 'grouphug',
    label: 'Group Hug',
    clause: '(o:"each player draws" or o:"each opponent draws" or o:"each player may")',
  },
  { key: 'stax', label: 'Stax', clause: '(o:"players can\'t" or o:"opponents can\'t")' },
  { key: 'superfriends', label: 'Superfriends', clause: '(t:planeswalker or o:proliferate)' },
  { key: 'landfall', label: 'Landfall', clause: 'o:landfall' },
  {
    key: 'lifegain',
    label: 'Lifegain',
    clause: '(o:"gain life" or o:"you gain life" or o:"whenever you gain life")',
  },
  { key: 'mill', label: 'Mill', clause: '(o:mill or o:"into their graveyard")' },
  { key: 'storm', label: 'Storm', clause: '(o:storm or o:"copy target instant or sorcery")' },
  { key: 'counters', label: '+1/+1 Counters', clause: 'o:"+1/+1 counter"' },
  { key: 'wheels', label: 'Wheels', clause: '(o:"draw seven" or o:"discards their hand")' },
  {
    key: 'ramp',
    label: 'Ramp',
    clause: '(o:"search your library for a" o:land or o:"add one mana" or o:"add {c}")',
  },
];

// core / cards

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[’'"():.\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/* The Commander banned list comes live from Scryfall itself (banned:commander),
   cached for a day — always the official, current list, zero maintenance. */
let _cmdrBansLoading = false;

function _cmdrBansTouchUi() {
  // A refreshed banlist re-judges whatever is on screen: the settings
  // list, or the open deck's legality box, cap count and red rims.
  // Extras: never redraw the whole page -- that folded every open list shut
  // the moment a ban list finished loading. An open list fills itself.
  if (state.screen === 'menu') return;
  if (state.screen === 'collection' && colLegalFmt(state.colFilter)) {
    try {
      csRerender();
    } catch (e) {}
    return;
  }
  if (state.screen === 'decklist') {
    try {
      const d = getDeck(state.activeDeckId);
      if (d) {
        refreshLegality(d);
        if (state.builderTab === 'list') renderBuilderBody(d);
      }
    } catch (e) {}
  }
}

async function ensureCmdrBans(force) {
  if (!state.cmdrBans) {
    try {
      state.cmdrBans = JSON.parse(localStorage.getItem(LS_PREFIX + 'cmdrBans') || 'null');
    } catch (e) {}
  }
  const fresh =
    state.cmdrBans &&
    state.cmdrBans.names &&
    state.cmdrBans.names.length &&
    Date.now() - (state.cmdrBans.t || 0) < 24 * 60 * 60 * 1000;
  if (fresh && !force) return;
  // Local-first seed: the weekly bulk file already knows every card's
  // Commander legality — fill an empty list instantly from disk, stamped
  // with the bulk BUILD time so the live Scryfall fetch below still runs
  // and keeps the list current between Mondays.
  if (!state.cmdrBans || !state.cmdrBans.names || !state.cmdrBans.names.length) {
    try {
      const seed = await bulkKvGet('bannedCommander');
      if (seed && Array.isArray(seed.names) && seed.names.length > 20) {
        state.cmdrBans = {
          t: seed.t || 0,
          names: seed.names.slice().sort((a, b) => a.localeCompare(b)),
        };
        try {
          localStorage.setItem(LS_PREFIX + 'cmdrBans', JSON.stringify(state.cmdrBans));
        } catch (e) {}
        _cmdrBansTouchUi();
      }
    } catch (e) {}
  }
  if (_cmdrBansLoading) return;
  _cmdrBansLoading = true;
  try {
    const names = new Set();
    // Scryfall lists ban status per legality; the surest query is the banlist
    // itself. unique=cards can collapse reprints, so dedupe by name ourselves.
    let next = `${SF_BASE}/cards/search?order=name&q=${encodeURIComponent('banned:commander')}`;
    let guard = 0;
    while (next && guard < 6) {
      guard++;
      // Forced = the person is waiting for it: front lane, no 90s-expiry
      // starvation behind background price/spoiler traffic.
      const r = await sfFetch(next, 0, !force);
      if (!r.ok) {
        break;
      }
      const d = await r.json();
      (d.data || []).forEach((c) => {
        if (c && c.name) names.add(c.name.split(' // ')[0]);
      });
      next = d.has_more ? d.next_page : null;
    }
    if (names.size) {
      state.cmdrBans = {
        t: Date.now(),
        names: Array.from(names).sort((a, b) => a.localeCompare(b)),
      };
      try {
        localStorage.setItem(LS_PREFIX + 'cmdrBans', JSON.stringify(state.cmdrBans));
      } catch (e) {}
      _cmdrBansTouchUi();
    }
  } catch (e) {
  } finally {
    _cmdrBansLoading = false;
  }
}

/* Upcoming set previews use the Scryfall catalog. Format legality is
   determined by each card's official legality flags. */
function loadAutoSets() {
  try {
    const raw = localStorage.getItem(LS_PREFIX + 'autoSets');
    const v = raw ? JSON.parse(raw) : { names: {}, previewMeta: {}, previewSeen: {}, lastCheck: 0 };
    if (!v.previewMeta || typeof v.previewMeta !== 'object') v.previewMeta = {};
    if (!v.previewSeen || typeof v.previewSeen !== 'object') v.previewSeen = {};
    return v;
  } catch (e) {
    return { names: {}, previewMeta: {}, previewSeen: {}, lastCheck: 0 };
  }
}

const autoSets = loadAutoSets();

function saveAutoSets() {
  try {
    localStorage.setItem(LS_PREFIX + 'autoSets', JSON.stringify(autoSets));
  } catch (e) {}
}

async function checkForNewSets(force) {
  if (window.DECKHAND_CONFIG?.selfHosted && !force) return;
  if (!force && Date.now() - (autoSets.lastCheck || 0) < 20 * 3600 * 1000) return;
  await resolveLegalSets(force);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 150 * 86400000).toISOString().slice(0, 10);
  const candidates = (state.allSetsRaw || [])
    .filter(
      (x) =>
        !x.digital &&
        !x.parent &&
        ['core', 'expansion', 'masters', 'draft_innovation'].includes(x.set_type) &&
        x.released_at > today &&
        x.released_at <= horizon,
    )
    .slice(0, 5);
  for (const set of candidates) {
    try {
      const r = await sfFetch(
        `${SF_BASE}/cards/search?unique=cards&q=${encodeURIComponent('set:' + set.code)}`,
        0,
        true,
      );
      if (!r.ok) continue;
      const data = await r.json();
      if (!(data.data || []).length) continue;
      autoSets.previewMeta[set.code] = set.released_at;
      autoSets.names[set.code] = set.name;
      autoSets.previewSeen[set.code] = data.total_cards || data.data.length;
    } catch (e) {}
  }
  for (const code of Object.keys(autoSets.previewMeta)) {
    if (autoSets.previewMeta[code] <= today) delete autoSets.previewMeta[code];
  }
  autoSets.lastCheck = Date.now();
  saveAutoSets();
}

const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

let _cmdrBanSetCache = null,
  _cmdrBanSetT = -1;

/* Set types that hold no playable card of their own -- token sheets, memo-
   rabilia, minigame inserts. Nothing in them can be searched for, spoiled,
   or stamped Universes Beyond, so every sweep skips them. */
const NO_CARDS_SET_TYPES = new Set(['token', 'memorabilia', 'minigame']);

/* Not a Magic card at all: Jumpstart front cards ("Orcish", the theme
   cards in every Jumpstart pack), art cards, tokens, emblems, minigame
   inserts. They are printed paper, so game:paper alone let them in. */
function isRealCard(c) {
  if (!c) return false;
  if (NO_CARDS_SET_TYPES.has(c.set_type)) return false;
  if (['token', 'double_faced_token', 'art_series', 'emblem'].includes(c.layout)) return false;
  const tl = String(
    c.type_line || (c.card_faces && c.card_faces[0] && c.card_faces[0].type_line) || '',
  ).trim();
  if (/^Card(\s|$|\/)/.test(tl) || /^(Token|Emblem)\b/.test(tl)) return false;
  return true;
}

function cmdrBanSet() {
  // The live official Commander banlist as a lookup set, rebuilt only when
  // the fetched list changes. This is the ONLY banlist a Commander deck may

  const t = (state.cmdrBans && state.cmdrBans.t) || 0;
  if (!_cmdrBanSetCache || _cmdrBanSetT !== t) {
    _cmdrBanSetCache = new Set(((state.cmdrBans && state.cmdrBans.names) || []).map(norm));
    _cmdrBanSetT = t;
  }
  return _cmdrBanSetCache;
}

/* Name-based, offline-first Commander legality. One verdict for the deck
   check, the cap count and the red tile rims, built from data that stays
   current by itself: the live official banlist (weekly bulk seed + daily
   name refresh, one request a day for the whole app) plus fields every
   stored card keeps (set_type, layout, released_at). Frozen per-card
   legality snapshots — which slim storage drops anyway — only speak when
   the banlist hasn't loaded yet, and for product-type illegality, which
   never heals with time. No per-deck network, no stale verdicts. */
function commanderVerdict(card) {
  if (!card) return 'legal';
  if (isPreviewCard(card)) return 'preview';
  const bans = cmdrBanSet();
  const nm = norm((card.name || '').split(' // ')[0]);
  if (bans.size ? bans.has(nm) : !!(card.legalities && card.legalities.commander === 'banned'))
    return 'banned';
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
  // 1.5: "not legal" (a playtest or promo-only card, never a ban) holds also
  // once the ban list is in -- Myntasha showed up as addable in Search
  if (card.legalities && card.legalities.commander === 'not_legal') return 'not_legal';
  return 'legal';
}

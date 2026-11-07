// services / collection-storage

/* ---------- Collection: binders + owned cards, stored locally ---------- */
function loadCollection() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_PREFIX + 'collection') || 'null');
    if (v && Array.isArray(v.items) && Array.isArray(v.binders)) {
      if (!Array.isArray(v.wantsExclude)) v.wantsExclude = [];
      if (!Array.isArray(v.wantsManual)) v.wantsManual = [];
      return v;
    }
  } catch (e) {}
  return { binders: [], items: [], wantsExclude: [], wantsManual: [] };
}

/* Collection items froze their price (it.eur) on the day they were added —
   which made the total-value graph a flat recording of a number that could
   not move. Once a day, when the collection opens, every unique printing is
   re-priced in batches through /cards/collection (name+set identifiers via
   postWithTimeout, honoring the POST rule), it.eur thaws to the live trend,
   per-card breadcrumbs are left, and the header total re-renders — so the
   graphs finally track the market instead of the import date. */
async function repriceCollectionDaily() {
  try {
    // Price data is cached daily; opening the collection is not a live-price poll.
    const KEY = LS_PREFIX + 'colRepriceAt';
    const last = parseInt(localStorage.getItem(KEY) || '0', 10) || 0;
    if (Date.now() - last < 24 * 3600 * 1000) return;
    const today = String(Date.now());
    const items = state.collection && state.collection.items;
    if (!items || !items.length) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    localStorage.setItem(KEY, today);
    const uniq = new Map();
    items.forEach((it) => {
      if (it && it.name) {
        const k = it.name + '|' + (it.set || '');
        if (!uniq.has(k)) uniq.set(k, it);
      }
    });
    const ids = Array.from(uniq.values()).map((it) =>
      it.set ? { name: it.name, set: it.set } : { name: it.name },
    );
    let changed = false;
    for (let i = 0; i < ids.length; i += 75) {
      const chunk = ids.slice(i, i + 75);
      try {
        const r = await postWithTimeout(
          `${SF_BASE}/cards/collection`,
          { identifiers: chunk },
          6000,
        );
        if (!r || !r.ok) continue;
        const data = await r.json();
        const got = new Map();
        (data.data || []).forEach((f) => {
          const raw = f.prices && (f.prices.eur || f.prices.eur_foil);
          const e = raw ? parseFloat(raw) : NaN;
          if (isFinite(e)) got.set(f.name + '|' + (f.set || ''), e);
        });
        items.forEach((it) => {
          const e = got.get(it.name + '|' + (it.set || ''));
          if (e == null) return;
          if (e !== it.eur) {
            it.eur = e;
            changed = true;
          }
          notePrice(it.name, e);
        });
      } catch (err) {}
    }
    if (changed) {
      _syncQuiet++;
      try {
        saveCollection();
      } finally {
        _syncQuiet--;
      } // 1.26: a price refresh is not an edit
      if (state.screen === 'collection') render(); // header total + '__col' breadcrumb re-record
    }
  } catch (err) {}
}

function saveCollection() {
  state._ownedSet = null;
  if (typeof refreshCardCollectionQuantities === 'function') refreshCardCollectionQuantities();
  try {
    localStorage.setItem(LS_PREFIX + 'collection', JSON.stringify(state.collection));
  } catch (e) {
    // Make room: move any decks still in localStorage to the deck store, then retry.
    (async () => {
      try {
        const moves = (state.decksIndex || []).filter((d) => {
          try {
            return localStorage.getItem(LS_PREFIX + 'deck:' + d.id) !== null;
          } catch (err) {
            return false;
          }
        });
        for (const d of moves) await persistDeck(d);
        localStorage.setItem(LS_PREFIX + 'collection', JSON.stringify(state.collection));
      } catch (err) {
        toast(
          '\u26A0 Storage full \u2014 the collection could not be saved. Make a backup in Extras.',
        );
      }
    })();
  }
}

const COL_CONDS = [
  ['MT', 'Mint'],
  ['NM', 'Near Mint'],
  ['EX', 'Excellent'],
  ['GD', 'Good'],
  ['LP', 'Light Played'],
  ['PL', 'Played'],
  ['PO', 'Poor'],
];

// Mark a copy as foil, with the printing's foil price when there is one.
function colFoilSlim(slim, card, foil) {
  if (!foil) return slim;
  slim.foil = true;
  const fe = card && card.prices && parseFloat(card.prices.eur_foil);
  if (isFinite(fe)) slim.eur = fe;
  return slim;
}

function slimForCollection(card) {
  return {
    name: card.name,
    set: card.set,
    set_name: card.set_name || '',
    cn: card.collector_number || '',
    img: cardImageMed(card),
    eur: (card.prices && (parseFloat(card.prices.eur) || parseFloat(card.prices.eur_foil))) || null,
    type_line: card.type_line || '',
    colors: card.color_identity || card.colors || [],
    foil: card._foilPick ? true : undefined,
    mv: typeof card.cmc === 'number' ? card.cmc : undefined,
    cc: Array.isArray(card.colors)
      ? card.colors
      : card.card_faces && card.card_faces[0] && Array.isArray(card.card_faces[0].colors)
        ? card.card_faces[0].colors
        : undefined,
    rarity: card.rarity || '',
    border_color: card.border_color || '',
    legal_std: (card.legalities && card.legalities.standard) || '',
    legal_cmd: (card.legalities && card.legalities.commander) || '',
  };
}

/* The Banned / Illegal marker on a collection tile speaks Commander, the
   format a loose card is most often built into; the format filter above the
   collection judges every other format. Older items saved before we stored
   legalities fall back to the ban list. */
function collectionCardStatus(it, legalCodeSet) {
  const nm = norm(it.name || '');
  if (isPreviewCard(it)) return null; // 1.19: a spoiler becomes legal by itself on release day

  // pillars list. (Sol Ring wore a BANNED pill because an old branch
  // consulted bannedSet first.)
  if (it.legal_cmd === 'banned') return 'banned';
  if (it.legal_cmd && it.legal_cmd !== 'legal') return 'illegal'; // not_legal (e.g. un-set cards)
  if (!it.legal_cmd && cmdrBanSet().has(nm)) return 'banned'; // old items without stored legalities
  return null;
}

function collectionMarkHtml(it, legalCodeSet) {
  const s = collectionCardStatus(it, legalCodeSet);
  if (s === 'banned') return '<span class="banned-mark">Banned</span>';
  if (s === 'illegal') return '<span class="illegal-mark">Illegal</span>';
  return '';
}

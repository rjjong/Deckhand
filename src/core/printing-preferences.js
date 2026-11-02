// core / printing-preferences

/* ---- remembered printing preference ----
   Choosing a printing on the card sheet (search, inspiration ...) is
   remembered app-wide by card name: tiles and sheets show that printing from
   then on. Stored slim — just the print id and two image sizes.
   1.39: a printing chosen INSIDE a deck belongs to that deck slot only: the
   slot carries pin:1 and wears its own printing, whatever the app-wide pick
   is, and the pick never leaks into other decks. A collection copy is its
   own physical printing too. */
function _printPrefs() {
  if (!state._printPrefs) {
    try {
      state._printPrefs = JSON.parse(localStorage.getItem(LS_PREFIX + 'printPrefs') || '{}') || {};
    } catch (e) {
      state._printPrefs = {};
    }
    // One-time repair: v264 mistook Scryfall's foil AVAILABILITY for a foil
    // CHOICE and marked half the world foil. Reset to the non-foil default;
    // explicit foil picks from here on carry their own flag.
    try {
      if (!localStorage.getItem(LS_PREFIX + 'foilPickFix')) {
        Object.values(state._printPrefs).forEach((r) => {
          if (r && r.f) r.f = false;
        });
        localStorage.setItem(LS_PREFIX + 'printPrefs', JSON.stringify(state._printPrefs));
        localStorage.setItem(LS_PREFIX + 'foilPickFix', '1');
      }
    } catch (e) {}
    // 1.18: picks were app-wide by name; now each belongs to one place. The
    // old ones were nearly all made from Search, so that is where they stay.
    try {
      if (!localStorage.getItem(LS_PREFIX + 'printPrefsPlaced')) {
        const moved = {};
        Object.keys(state._printPrefs).forEach((k) => {
          moved[k.indexOf('|') >= 0 ? k : 'page:search|' + k] = state._printPrefs[k];
        });
        state._printPrefs = moved;
        localStorage.setItem(LS_PREFIX + 'printPrefs', JSON.stringify(moved));
        localStorage.setItem(LS_PREFIX + 'printPrefsPlaced', '1');
      }
    } catch (e) {}
  }
  return state._printPrefs;
}

/* 1.18: WHERE a printing is being chosen or shown. The card sheet, the
   printing grid and other small sheets on top do not count: the place is the
   page or list beneath them (Search, an Inspiration page, a recommendations
   overlay, Similar cards ...). Each place keeps its own picks. */
const PRINT_SHEETS = new Set([
  'printing',
  'cardInfo',
  'cardSheet',
  'cardPeek',
  'preview',
  'pricehist',
  'cutWhy',
  'tagBox',
  'appoint',
  'addColl',
  'colItem',
  'colAddSheet',
  'deckMenu',
  'history',
  'wantSheet',
]);

/* Decks and the collection never wear a browse pick: a deck slot and a
   collection copy carry their own printing. */
const PRINT_OWN_PLACES = new Set(['page:decklist', 'page:decks', 'page:collection']);

function printPlace() {
  const st = state.overlayStack || [];
  for (let i = st.length - 1; i >= 0; i--) {
    const id = st[i] && st[i].id;
    if (id && !PRINT_SHEETS.has(id)) return 'ov:' + id;
  }
  return 'page:' + (state.screen || 'home');
}

function _printPrefRec(name) {
  const place = printPlace();
  if (PRINT_OWN_PLACES.has(place)) return null;
  return _printPrefs()[place + '|' + name] || null;
}

function printPrefFor(card) {
  if (!card || !card.name || card.pin) return null;
  const p = _printPrefRec(card.name);
  return p && p.id && p.id !== card.id && p.i ? p : null;
}

function setPrintPref(chosen) {
  if (!chosen || !chosen.name || !chosen.id) return;
  const iu =
    chosen.image_uris ||
    (chosen.card_faces && chosen.card_faces[0] && chosen.card_faces[0].image_uris) ||
    null;
  if (!iu) return;
  const prefs = _printPrefs();
  const place = printPlace();
  if (PRINT_OWN_PLACES.has(place)) return; // decks and the collection pick per slot / per copy
  const rec = {
    id: chosen.id,
    f: !!chosen._foilPick,
    p: printEur(chosen),
    i: { s: iu.small || iu.normal || '', n: iu.normal || iu.large || iu.small || '' },
  };
  prefs[place + '|' + chosen.name] = rec;
  try {
    localStorage.setItem(LS_PREFIX + 'printPrefs', JSON.stringify(prefs));
  } catch (e) {}
  // Already-rendered tiles keep their old art until something repaints them --
  // sweep the images of this card IN THIS PLACE ONLY (the list under the
  // sheet: its overlay, or the page) and swap the art in place.
  const SHEET_EL = new Set(['printOverlay', 'cardSheetOverlay', 'cardPeekOverlay']);
  const ovs = Array.from(document.querySelectorAll('body > .overlay:not(.swipe-leaving)')).filter(
    (el) => !SHEET_EL.has(el.id),
  );
  const root =
    place.indexOf('ov:') === 0 ? ovs[ovs.length - 1] || null : document.querySelector('.app');
  try {
    if (root)
      root.querySelectorAll('img[alt]').forEach((img) => {
        if (img.alt !== chosen.name) return;
        const cur = img.getAttribute('src') || '';
        img.src = /\/small\//.test(cur) ? rec.i.s || rec.i.n : rec.i.n || rec.i.s;
        if (img.dataset && img.dataset.preview) img.dataset.preview = rec.i.n || rec.i.s;
        // the foil star follows the choice live, in place
        const tile = img.parentElement;
        if (tile) {
          const star = tile.querySelector(':scope > .foil-star');
          if (rec.f && !star) {
            const i = document.createElement('i');
            i.className = 'foil-star';
            i.title = 'Foil printing';
            i.textContent = '✨';
            tile.appendChild(i);
          } else if (!rec.f && star) {
            star.remove();
          }
        }
        // The tile's PRICE follows the pick too — art swapping while the old
        // number stayed put was the loudest “nothing changed” signal around.
        const pt = img.closest('.sr-tile');
        const pe = pt && pt.querySelector('.st-price[data-pricecard]');
        if (pe && rec.p != null && !isNaN(rec.p)) pe.textContent = fmtEur(rec.p);
      });
  } catch (e) {}
}

function cardImage(card) {
  const pp = printPrefFor(card);
  if (pp) return pp.i.s || pp.i.n;
  if (card.image_uris) return card.image_uris.small || card.image_uris.normal;
  if (card.card_faces && card.card_faces[0].image_uris)
    return card.card_faces[0].image_uris.small || card.card_faces[0].image_uris.normal;
  return '';
}

function cardImageMedRaw(card) {
  // No preference override — the Choose Printing grid needs each printing's
  // own face, otherwise every tile wears the remembered art.
  if (card.image_uris)
    return card.image_uris.normal || card.image_uris.large || card.image_uris.small;
  if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
    const iu = card.card_faces[0].image_uris;
    return iu.normal || iu.large || iu.small;
  }
  return '';
}

function cardImageMed(card) {
  const pp = printPrefFor(card);
  if (pp) return pp.i.n || pp.i.s;
  if (card.image_uris)
    return card.image_uris.normal || card.image_uris.large || card.image_uris.small;
  if (card.card_faces && card.card_faces[0].image_uris)
    return card.card_faces[0].image_uris.normal || card.card_faces[0].image_uris.small;
  return '';
}

function cardImageLargeRaw(card) {
  if (card.image_uris) return card.image_uris.normal || card.image_uris.large;
  if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
    const iu = card.card_faces[0].image_uris;
    return iu.normal || iu.large;
  }
  return '';
}

function cardImageLarge(card) {
  const pp = printPrefFor(card);
  if (pp) return pp.i.n || pp.i.s;
  if (card.image_uris) return card.image_uris.normal || card.image_uris.large;
  if (card.card_faces && card.card_faces[0].image_uris) return card.card_faces[0].image_uris.normal;
  return '';
}

function rawManaCost(card) {
  return card.mana_cost || (card.card_faces && card.card_faces[0].mana_cost) || '';
}

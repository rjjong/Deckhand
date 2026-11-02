// core / tags

/* ---- card tags: GLOBAL adds, LOCAL removes ----
   A tag added to a card anywhere follows that card into every deck (stored in
   one global registry). Removing a tag only hides it in the deck you're
   working in (per-deck hide list) — other decks keep showing it. */
function loadGlobalTags() {
  try {
    return JSON.parse(localStorage.getItem(LS_PREFIX + 'globalTags') || '{}');
  } catch (e) {
    return {};
  }
}

function saveGlobalTags() {
  try {
    localStorage.setItem(LS_PREFIX + 'globalTags', JSON.stringify(state.globalTags || {}));
  } catch (e) {
    warnStorageOnce();
  }
}

function ensureGlobalTags() {
  if (!state.globalTags) state.globalTags = loadGlobalTags();
  return state.globalTags;
}

/* Most-recently-administered order for the tag picker: every successful add
   (or un-hide) stamps the tag. Own storage key — existing keys untouched. */
function tagRecency() {
  if (!state._tagRecency) {
    try {
      state._tagRecency = JSON.parse(localStorage.getItem(LS_PREFIX + 'tagRecency') || '{}') || {};
    } catch (e) {
      state._tagRecency = {};
    }
  }
  return state._tagRecency;
}

function touchTagRecency(t) {
  try {
    const m = tagRecency();
    m[(t || '').toLowerCase()] = Date.now();
    localStorage.setItem(LS_PREFIX + 'tagRecency', JSON.stringify(m));
  } catch (e) {}
}

/* One-time migration: fold every deck's old per-deck tags into the registry */
function migrateTagsToGlobal() {
  try {
    if (localStorage.getItem(LS_PREFIX + 'tagsGlobalized')) return;
    const g = ensureGlobalTags();
    state.decksIndex.forEach((d) => {
      Object.entries(d.tags || {}).forEach(([name, list]) => {
        const cur = g[name] || (g[name] = []);
        (list || []).forEach((t) => {
          if (!cur.some((x) => x.toLowerCase() === t.toLowerCase())) cur.push(t);
        });
      });
    });
    saveGlobalTags();
    localStorage.setItem(LS_PREFIX + 'tagsGlobalized', '1');
  } catch (e) {}
}

// legacy field, kept for share payloads
function tagHides(d) {
  if (!d) return {};
  if (!d.tagHide) d.tagHide = {};
  return d.tagHide;
}

function getCardTags(d, name) {
  let g = ensureGlobalTags()[name] || [];
  // In a deck, a card starts WITH its Scryfall recommended tags. They are not
  // copied anywhere: removing one simply hides it in this deck, like any tag.
  // 1.45: the deck's "Scryfall tags" switch (Sort Decklist) can turn them off;
  // tags you added yourself always stay.
  if (d && d.scryTags !== false) {
    let auto = null;
    try {
      auto = (state._otagCache || loadOtagCache())[name];
    } catch (e) {}
    if (auto && auto.length) {
      const have = new Set(g.map((t) => String(t).toLowerCase()));
      const extra = auto.filter((t) => !have.has(String(t).toLowerCase()));
      if (extra.length) g = g.concat(extra);
    }
  }
  const hidden = (d && d.tagHide && d.tagHide[name]) || [];
  return g.filter((t) => !hidden.some((h) => h.toLowerCase() === t.toLowerCase()));
}

/* Every card of a deck gets its recommended tags from the phone's own tag
   file, once per deck per session -- no network convoy for a whole deck.
   Cards the file does not know yet get theirs when their tag box opens. */
const _deckOtagsDone = new Set();

async function ensureDeckOtags(d) {
  try {
    if (!d || _deckOtagsDone.has(d.id)) return;
    _deckOtagsDone.add(d.id);
    const ix = await bulkIndexReady();
    if (!ix || !ix.tagByOid) {
      _deckOtagsDone.delete(d.id);
      return;
    }
    const cache = loadOtagCache();
    let added = 0;
    deckLeaders(d)
      .concat(d.cards || [], d.maybeboard || [])
      .forEach((c) => {
        if (!c || !c.name || cache[c.name]) return;
        const t = _localTagsDecide(ix, c);
        if (Array.isArray(t)) {
          cache[c.name] = t.slice();
          added++;
        }
      });
    if (added) {
      saveOtagCache();
      if (state.screen === 'decklist' && state.activeDeckId === d.id) {
        try {
          refreshDecklistBox(d);
        } catch (e) {}
      }
    }
  } catch (e) {}
}

function addCardTag(d, name, tag) {
  const t = (tag || '').trim();
  if (!t) return false;
  const g = ensureGlobalTags();
  const list = g[name] || (g[name] = []);
  const already = list.some((x) => x.toLowerCase() === t.toLowerCase());
  // Adding also un-hides it in THIS deck, so the add always takes effect here
  const hides = tagHides(d);
  const wasHidden = (hides[name] || []).some((x) => x.toLowerCase() === t.toLowerCase());
  if (wasHidden) {
    hides[name] = hides[name].filter((x) => x.toLowerCase() !== t.toLowerCase());
    if (!hides[name].length) delete hides[name];
  }
  if (already && !wasHidden) return false; // visible here already
  if (!already) {
    list.push(t);
    saveGlobalTags();
  }
  touchTagRecency(t);
  return true;
}

function removeCardTag(d, name, tag) {
  // LOCAL: hide in this deck only — the global registry is untouched
  const hides = tagHides(d);
  const list = hides[name] || (hides[name] = []);
  if (!list.some((x) => x.toLowerCase() === tag.toLowerCase())) list.push(tag);
}

/* On a deckless sheet there is no deck to hide in — the × removes the tag
   from the card's global registry itself. */
function removeCardTagGlobal(name, tag) {
  const g = ensureGlobalTags();
  if (!g[name]) return;
  g[name] = g[name].filter((x) => x.toLowerCase() !== String(tag).toLowerCase());
  if (!g[name].length) delete g[name];
  saveGlobalTags();
}

function infoBtnHtml(text) {
  return /* HTML */ `<button
    type="button"
    class="info-i"
    data-info="${encodeURIComponent(text)}"
    aria-label="Info"
  >
    i
  </button>`;
}

document.addEventListener('click', (e) => {
  const b = e.target && e.target.closest && e.target.closest('.info-i');
  if (b) {
    e.stopPropagation();
    try {
      toast(decodeURIComponent(b.dataset.info || ''));
    } catch (err) {}
  }
});

function allAppTags() {
  // every tag on any card, anywhere in the app (tags are stored globally)
  const set = new Set();
  try {
    Object.values(ensureGlobalTags()).forEach((arr) => (arr || []).forEach((t) => set.add(t)));
  } catch (e) {}
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function allDeckTags(d) {
  const set = new Set();
  const cards = deckLeaders(d).concat(d.cards || [], d.maybeboard || []);
  cards.forEach((c) => getCardTags(d, c.name).forEach((t) => set.add(t)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

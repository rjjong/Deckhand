// app / router

/* ========================= ROUTER ========================= */

function resetSearchFilters() {
  Object.keys(state.searchColors).forEach((k) => (state.searchColors[k] = false));
  Object.keys(state.searchCardColors).forEach((k) => (state.searchCardColors[k] = false));
  state.searchColorMode = 'atmost';
  state.searchCardColorMode = 'all';
  state.searchSetCode = '';
  state.searchManaCost = '';
  {
    const _pd = state.searchPinnedDeckId && getDeck(state.searchPinnedDeckId);
    state.searchFormat = _pd ? deckFormat(_pd) : '';
  }
  state.searchCmcOp = '';
  state.searchCmcVal = '';
  state.searchPowOp = '';
  state.searchPowVal = '';
  state.searchTouOp = '';
  state.searchTouVal = '';
  state.searchLoyOp = '';
  state.searchLoyVal = '';
  state.searchTypeText = '';
  state.searchOracleText = '';
  Object.keys(state.searchRarity).forEach((k) => (state.searchRarity[k] = false));
  state.searchKeyword = '';
  state.searchFlavorText = '';
  state.searchArtist = '';
  state.searchOtag = '';
  state.searchEurMin = 0;
  state.searchEurMax = null;
  state.searchSort = 'name';
  state.searchSortDir = 'asc';
}

/* Anything off its neutral default counts as an active filter — the same
   fields resetSearchFilters() puts back. The search NAME is not a filter
   and never gets swept by the back button. */
function searchFiltersActive() {
  const s = state;
  return !!(
    Object.values(s.searchColors).some(Boolean) ||
    Object.values(s.searchCardColors).some(Boolean) ||
    s.searchColorMode !== 'atmost' ||
    s.searchCardColorMode !== 'all' ||
    s.searchSetCode ||
    s.searchFormat ||
    s.searchManaCost ||
    s.searchCmcOp ||
    s.searchCmcVal ||
    s.searchPowOp ||
    s.searchPowVal ||
    s.searchTouOp ||
    s.searchTouVal ||
    s.searchLoyOp ||
    s.searchLoyVal ||
    s.searchTypeText ||
    s.searchOracleText ||
    Object.values(s.searchRarity).some(Boolean) ||
    s.searchKeyword ||
    s.searchFlavorText ||
    s.searchArtist ||
    s.searchEurMin > 0 ||
    s.searchEurMax != null ||
    s.searchSort !== 'name' ||
    s.searchSortDir !== 'asc'
  );
}

function switchPage(p, topnav) {
  // Navigation is absolute: a nav-bar jump dismisses any overlays still
  // floating (card sheets leave the nav bar exposed and tappable now).
  dismissAllOverlays();
  closeAllFolds(); // leaving a page closes its folds: nothing is still open on return
  if (p !== 'spoilers' && state.spSel) state.spSel.clear(); // 1.19: a spoiler selection belongs to that page
  // A tap on the top navigation bar starts a FRESH ladder — back from there
  // goes straight home, never through whatever came before.
  if (topnav) state.navLadder = ['home'];
  state._focusSearchOnce = p === 'search' && state.screen !== 'search';
  // A second tap on the Search compass wipes the slate for a fresh hunt —
  // name, results, AND every advanced filter (same routine as Reset filters).
  if (p === 'search' && state.screen === 'search' && topnav) {
    state.searchName = '';
    state.searchRan = false;
    state.searchResults = [];
    resetSearchFilters();
  }
  if (p === 'spoilers') {
    state.spoilerSetFilter = null; // always land on the all-sets, newest-first feed
    state.spAdvOpen = false; // and with a clean advanced filter
    state.spFilter = {
      q: '',
      type: '',
      colors: { W: false, U: false, B: false, R: false, G: false, C: false },
      colorMode: 'all',
      rarity: { common: false, uncommon: false, rare: false, mythic: false },
    };
  }
  // A deck pinned via "Search Cards" only lives for that one visit to the
  // Search page — any navigation elsewhere returns Search to popup mode.
  // ENTRY guard too: leaving Search by the BACK button bypasses switchPage,
  // so a stale pin could otherwise greet the next ordinary visit. Arriving
  // at Search clears the pin unless this visit was armed by an Add Cards
  // button a moment ago.
  if (p === 'search') {
    state.searchProxy = false;
    if (!state._pinArm) state.searchPinnedDeckId = null;
    state._pinArm = false;
  }
  if (p !== 'search' && p !== 'browse') {
    state.searchPinnedDeckId = null;
  }
  if (p !== 'browse') state.switchSeat = null;
  if (p !== 'search') {
    // Every visit to Search starts completely fresh: results cleared AND all
    // advanced filters wiped, so no invisible filter quietly hides cards.
    state.searchRan = false;
    state.searchResults = [];
    state.searchName = '';
    state.advOpen = false;
    state.searchSel = null;
    resetSearchFilters();
  }
  if (p !== 'decklist') state._dlSel = null;
  if (p !== 'browse') {
    // Inspiration resets the same way — a fresh landing has no selections,
    // and no name typed in its search box either. (A recommendations page
    // is an overlay ON Inspiration, not a page change: it keeps everything.)
    state.browseSel = { count: '', combo: '', theme: '', tribe: '', type: '' };
    state.browseTypal = null;
    state.browseNameQ = '';
  }
  if (p === 'decks') {
    state.folderNav = null;
    state.deckFilter = '';
  }
  if (p === 'collection') {
    state.colFilter.binder = null;
    state.colFilter.q = '';
  } else if (state.screen === 'collection') {
    state.colFilter.q = '';
  } // leaving clears the search box too
  state.screen = p;
  state.menuOpen = false;
  state.openCSelect = null;
  state.colSel = null;
  state.wantSel = null;
  pushHistory(p);
  state._deskTop = true;
  render();
  scrollToPageFoot();
}

function pageScroller() {
  return (
    document.querySelector('.app .tab-viewport[data-screen]') ||
    document.scrollingElement ||
    document.documentElement
  );
}

function scrollToPageFoot() {
  // Compatibility name retained for existing callers; all pages now open at the top.
  state._deskTop = false;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.querySelector('.app .tab-viewport[data-screen]')?.scrollTo(0, 0);
    }),
  );
}

/* Back is the app's own ladder (overlays, panels, pages) -- the browser must
   not ALSO put back an old scroll position on every history step. With
   'auto' it did: closing a card sheet after removing a card restored the
   pre-removal scrollTop a moment later, and the page jumped a row. */
try {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
} catch (e) {}

function pushHistory(screen) {
  state._exiting = false; // navigating again means the exit is off
  const extra = screen === 'decks' ? { folder: state.folderNav || null } : {};
  try {
    history.pushState(Object.assign({ screen }, extra), '', '#' + screen);
  } catch (e) {}
}

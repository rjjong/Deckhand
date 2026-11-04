// app / history

window.addEventListener('popstate', (e) => {
  // Exit drain: once Exit is accepted, walk straight down to the bottom of
  // the history without rendering a thing — parked at the root, the very
  // next system back closes the app natively.
  if (state._exiting) {
    try {
      history.back();
    } catch (err) {}
    return;
  }
  // Back-press ownership, top of the screen first. Truly topmost transients
  // (the deck-picker popup, a tile context menu) consume the press; then any
  // open OVERLAY (card sheet, Budget, reco…) closes; and only when no overlay
  // is stacked may the base page's panels and dropdowns eat a press — a panel
  // buried under two overlays must never silently swallow "back".
  if (e.state && e.state.exitGuard) {
    // Landing here puts the guard at the TOP of the stack. Re-arm before
    // anything else: a rapid second back press must land on the guard again
    // and be swallowed — not sail past it out of the app, dialog still open.
    try {
      history.pushState(
        { screen: state.screen || 'home', folder: state.folderNav || null },
        '',
        '#' + (state.screen || 'home'),
      );
    } catch (err) {}
    if (state._exitAsk) return;
    state._exitAsk = true;
    openInAppConfirm(
      trS('Exit this app?'),
      (ok) => {
        state._exitAsk = false;
        if (!ok) return; // guard already re-armed above — stay right here
        // window.close() is ignored for installed apps more often than not.
        // The reliable road out: drain to the bottom of the history — the next
        // system back then closes the app natively — with close() as a bonus.
        state._exiting = true;
        // Jump straight to the bottom of the history in ONE hop, then close.
        // The old walk (one back per popstate) still had entries alive when
        // window.close() ran 60ms in, so the browser refused it and a toast
        // coached the user into another back press. One go(-depth), then
        // close() after the drain settles: a single Exit tap closes the app.
        try {
          const depth = history.length - 1;
          if (depth > 0) history.go(-depth);
        } catch (err) {}
        setTimeout(() => {
          try {
            window.close();
          } catch (err) {}
        }, 180);
      },
      { ok: trS('Exit') },
    );
    return;
  }
  appBackStep(true);
});

/* One back press, one decision — the SAME chain whether the press arrived
   through history (popstate) or was absorbed by the CloseWatcher before
   history could move. Only the history path re-arms consumed entries;
   returns true when the press was consumed, false at the home floor. */
/* The Android shell hands its hardware back press to this, so one decision
   chain serves both the browser and the app. Returns 1 when the app dealt
   with the press (an overlay closed, a page stepped back) and 0 when it is
   standing on the home floor -- the shell then asks for a second press
   before it puts the app away, and the wording stays here, in the app's
   own language. */
window.androidBack = function () {
  try {
    if (appBackStep(false)) return 1;
  } catch (e) {}
  try {
    toast(trS('Press back once more to close.'));
  } catch (e) {}
  return 0;
};

function appBackStep(viaHistory) {
  const rearm = (obj, tag) => {
    if (viaHistory) {
      try {
        history.pushState(obj, '', tag);
      } catch (err) {}
    }
  };
  // An open picker inside a sheet (the game-log MVP/Weakest drop-ups) is the
  // topmost transient of all: back closes it and nothing else moves.
  if (state._localCsClose) {
    const f = state._localCsClose;
    state._localCsClose = null;
    try {
      f();
    } catch (err) {}
    rearm({ screen: state.screen }, '#' + (state.screen || 'home'));
    return true;
  }
  // An ordinary confirm dialog (delete deck, clear trade…) owns the press:
  // back answers it with Cancel — proper settle through its own button, so
  // the caller's onResult(false) fires — and never navigates underneath it.
  // (The EXIT question is handled before this chain: there, back means Exit.)
  const iac = document.getElementById('inAppConfirm');
  if (iac && !state._exitAsk) {
    const c = document.getElementById('iacCancel');
    if (c) c.click();
    else iac.remove();
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  // A name popup (new folder, new binder, rename) answers back with Cancel,
  // and a sheet from openModal (new deck, delete, sort, a new life game)
  // closes -- the page underneath stays where it is.
  const iap = document.getElementById('inAppPrompt');
  if (iap) {
    const c = document.getElementById('iapCancel');
    if (c) c.click();
    else iap.remove();
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  const setLife = document.getElementById('setLifePopup');
  if (setLife) {
    document.getElementById('setLifeCancel')?.click();
    rearm({ screen: state.screen }, '#' + state.screen);
    return true;
  }
  if (state.modal) {
    try {
      if (state.modal.type === 'lifeSetup') cancelLifeSetup();
      else closeModal();
    } catch (err) {
      state.modal = null;
    }
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  if (document.getElementById('nselPop')) {
    closeNselMenu();
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  // A dice / coin result over the life counter: back clears it first.
  const diceRes = document.getElementById('diceResultPop');
  // 1.49: while the dice picker is still stacked, this back step is the
  // picker closing itself (a die was tapped) -- the fresh result must stay.
  const _ovTop = state.overlayStack && state.overlayStack[state.overlayStack.length - 1];
  if (diceRes && !(_ovTop && _ovTop.id === 'lifeDice')) {
    diceRes.click();
    rearm({ screen: state.screen }, '#' + (state.screen || 'home'));
    return true;
  }
  // The table menu closes before the life counter does.
  if (state.lifeOpen && state.life && state.life.menuOpen) {
    state.life.menuOpen = false;
    try {
      renderLifeOverlay();
    } catch (err) {}
    rearm({ screen: state.screen }, '#' + (state.screen || 'home'));
    return true;
  }
  // A binder's long-press menu goes like any other tile menu.
  const binderLong = document.getElementById('binderLongPop');
  if (binderLong) {
    binderLong.remove();
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  const tileMenu = document.getElementById('tileMenuPop');
  const deckPick = document.getElementById('deckPickScrim');
  const fabMenu = document.getElementById('fabMenu');
  const bindersPopEl = document.getElementById('bindersPop');
  const openPd = Array.from(document.querySelectorAll('.pd-panel')).find((p) => !p.hidden);
  if (tileMenu || deckPick || fabMenu || bindersPopEl || openPd) {
    if (tileMenu) tileMenu.remove();
    if (deckPick) deckPick.remove();
    if (fabMenu) fabMenu.remove();
    if (bindersPopEl) bindersPopEl.remove();
    if (openPd) openPd.hidden = true;
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  // A multi-select on screen: back drops the selection and nothing else.
  if (!state.openCSelect && clearSelectionOnBack()) {
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  // A page carrying RESULTS is its own step: the first back press wipes it
  // to a clean sheet, only the next one actually leaves. Search and
  // Inspiration both work this way, so the hardware back always means the
  // same thing. An open dropdown closes first (its own handler below), and
  // an open overlay still outranks the page.
  // Adding cards to a deck: the Search page was opened FROM that deck and
  // every add goes into it, so back belongs there -- not to a blank search.
  if (
    state.screen === 'search' &&
    state.searchPinnedDeckId &&
    !state.openCSelect &&
    !state.overlayStack.length
  ) {
    const pinned = state.searchPinnedDeckId;
    if (getDeck(pinned)) {
      state.searchPinnedDeckId = null;
      state._pinArm = false;
      state.searchResults = [];
      state.searchRan = false;
      state.searchName = '';
      state.activeDeckId = pinned;
      switchPage('decklist');
      rearm({ screen: 'decklist' }, '#decklist');
      return true;
    }
  }
  if (
    state.screen === 'search' &&
    !state.openCSelect &&
    !state.overlayStack.length &&
    ((state.searchResults && state.searchResults.length) ||
      state.searchRan ||
      (state.searchName || '').trim() ||
      searchFiltersActive())
  ) {
    _searchSeq++; // a search still in flight cannot paint onto the clean sheet
    resetSearchFilters();
    state.searchName = '';
    state.searchResults = [];
    state.searchRan = false;
    state.searchError = false;
    state.searching = false;
    render();
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  if (
    state.screen === 'browse' &&
    !state.openCSelect &&
    !state.overlayStack.length &&
    (state.browseNameQ ||
      state.browseTypal ||
      state.browseSel.count ||
      state.browseSel.combo ||
      state.browseSel.theme ||
      state.browseSel.tribe ||
      state.browseSel.type)
  ) {
    state.browseSel = { count: '', combo: '', theme: '', tribe: '', type: '' };
    state.browseNameQ = '';
    state.browseTypal = null;
    render();
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  if (state.overlayStack.length) {
    const top = state.overlayStack.pop();
    try {
      top.closeFn();
    } catch (err) {
      console.error(err);
    }
    return true;
  }
  // On Extras, every fold the user opened consumes one back press before
  // navigation does — the most recently opened first, one fold per press.
  if (
    ['menu', 'settings', 'formatrules', 'banlists'].includes(state.screen) &&
    !state.openCSelect &&
    closeLastFold()
  ) {
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  // An open Advanced-filter panel consumes the back press — Search page and
  // My Collection alike. First press: sweep any set filters clean (the panel
  // stays open, its fields visibly reset). Next press: close the panel. An
  // open dropdown inside the panel is more transient still and goes first
  // (its own handler below), so these steps stand aside while one is open.
  if (!state.openCSelect && state.advOpen && state.screen === 'search') {
    if (searchFiltersActive()) {
      resetSearchFilters();
      render();
      rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
      return true;
    }
    state.advOpen = false;
    render();
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  // Inside a binder, back returns to the binder overview. Opening a binder
  // pushed its own history entry, so this pop simply consumes it — history
  // stays balanced, and repeated open/close can never eat the app's exit path.
  if (state.screen === 'collection' && state.colFilter && state.colFilter.binder) {
    state.colFilter.binder = null;
    render();
    if (!viaHistory) {
      /* the binder's own entry stays inert */
    }
    return true;
  }
  // The find-in-deck bar consumes the back press: close it, restore the list.
  if (state.screen === 'decklist' && state.dlSearchOpen && !state.dlPanel) {
    state.dlSearchOpen = false;
    state.dlSearchQ = '';
    state.dlFilter = { ci: [] };
    state.dlFilterOn = false;
    try {
      closeNameSuggest();
    } catch (err) {}
    scrollToPageFoot();
    const dd = getDeck(state.activeDeckId);
    try {
      updateDeckMeter(dd);
      if (dd) refreshDecklistBox(dd);
    } catch (err) {}
    rearm({ screen: state.screen }, '#' + state.screen);
    return true;
  }
  // A page-level dropdown consumes the back press: close it and stay put.
  if (state.openCSelect) {
    state.openCSelect = null;
    try {
      csRerender();
    } catch (err) {}
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  // The Cuts fold on deck Inspiration works like Theme and Kindred: an open
  // fold eats the back press and closes, the page stays where it is.
  if (
    state.screen === 'inspiration' &&
    state._cutsOpenFor &&
    document.querySelector('#cutSlot .cut-body')
  ) {
    const dc = getDeck(state.inspireDeckId);
    state._cutsOpenFor = null;
    try {
      if (dc) paintCuts(dc);
      scrollToPageFoot();
    } catch (err) {}
    rearm({ screen: state.screen, folder: state.folderNav || null }, '#' + state.screen);
    return true;
  }
  // An open Import / Bulk-edit panel consumes the back press: close it and stay.
  if (state.dlPanel) {
    const wasSearch = state.dlPanel === 'dsearch';
    state.dlPanel = null;
    const box = document.getElementById('dlPanelBox');
    if (box) {
      box.className = '';
      syncDeckEditorModal();
      const d = getDeck(state.activeDeckId);
      if (d) {
        box.innerHTML = dlPanelHtml(d);
        document.querySelectorAll('[data-panel]').forEach((x) => x.classList.remove('active'));
        // Closing Search deck clears the search whole: the full deck returns.
        if (wasSearch) {
          if (!state.dlSearchOpen) {
            state.dlFilter = { ci: [] };
            state.dlFilterOn = false;
          }
          try {
            refreshDecklistBox(d);
          } catch (err) {}
          scrollToPageFoot();
        }
        const _chv = document.getElementById('dockFilterChev');
        _chv?.setAttribute('aria-expanded', 'false');
        document
          .getElementById(wasSearch ? 'dockFilterChev' : 'menuBtn')
          ?.focus({ preventScroll: true });
      }
      rearm({ screen: state.screen }, '#' + state.screen);
      return true;
    }
  }
  // On Stats or Deck Log, back returns to the Decklist tab before leaving
  // the page; only from the Decklist tab does back climb the page ladder.
  if (state.screen === 'decklist' && state.builderTab !== 'list') {
    state.builderTab = 'list';
    state.dlPanel = null;
    const d = getDeck(state.activeDeckId);
    if (d) {
      try {
        renderBuilderBody(d);
        syncTabsUI();
        scrollToPageFoot();
      } catch (err) {}
    }
    rearm({ screen: state.screen }, '#' + state.screen);
    return true;
  }
  // Inside a My Decks folder, back climbs ONE level: a user folder returns to
  // its parent (a format folder counts), a format folder returns to the root.
  if (state.screen === 'decks' && state.folderNav) {
    const _cur = state.folderNav;
    const _f = isFmtFolder(_cur) ? null : (state.folders || []).find((x) => x.id === _cur);
    state.folderNav = _f ? _f.parentId || null : null;
    render();
    scrollToPageFoot();
    rearm({ screen: 'decks' }, '#decks');
    return true;
  }
  // Ladder navigation: back climbs the exact path you descended — budget to
  // deck to My Stuff to Home — never wandering into older history. Home is
  // the floor: once there, presses drain toward the exit guard beneath.
  if (state.navLadder && state.navLadder.length > 1) {
    state.navLadder.pop();
    const dest = state.navLadder[state.navLadder.length - 1] || 'home';
    state._ladderBack = true;
    state.screen = dest;
    if (dest !== 'decks') state.folderNav = null;
    state.menuOpen = false;
    render();
    state._ladderBack = false;
    scrollToPageFoot();
    rearm({ screen: dest }, '#' + dest);
    return true;
  }
  if (state.screen !== 'home') {
    state._ladderBack = true;
    state.screen = 'home';
    state.folderNav = null;
    state.menuOpen = false;
    render();
    state._ladderBack = false;
    scrollToPageFoot();
    rearm({ screen: 'home' }, '#home');
    return true;
  }
  // Home floor: history path lets stale entries drain toward the exit
  // guard; the watcher path asks to exit right here.
  return false;
}

initialSettings.then(() => {
  render();
  try {
    ensureCmdrBans();
  } catch (e) {}
});

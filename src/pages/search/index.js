// pages / search / index

/* ---------------- SEARCH PAGE ---------------- */

function searchPageHtml() {
  const pinned = state.searchPinnedDeckId ? getDeck(state.searchPinnedDeckId) : null;
  return /* HTML */ ` <main class="search-page">
    <div id="advSlot">${state.advOpen ? advancedSearchScreenHtml() : ''}</div>
    <div class="search-content tab-viewport" data-screen="search">
      <div class="searchbar page-searchbar sticky-searchbar">
        <input
          id="searchName"
          enterkeyhint="search"
          placeholder="Card name…"
          value="${escapeHtml(state.searchName)}"
        /><button
          type="button"
          class="ghost-btn search-tool"
          id="qChev"
          title="${trS('Advanced filters')}"
          aria-label="Advanced search"
          aria-haspopup="dialog"
          aria-expanded="${state.advOpen}"
        >
          ${ICONS.filter}</button
        ><button
          id="srSortBtn"
          class="ghost-btn${state.searchSort !== 'name' ? ' active' : ''}"
          title="${trS('Sort')}"
          style="padding:0 11px;flex:none;"
        >
          ${SORT_ICON}</button
        ><button
          id="srSelFab"
          class="sel-fab"
          title="${trS('Add to deck…')}"
          ${state.searchSel && state.searchSel.size ? '' : ' hidden'}
        >
          ${selFabLabel(state.searchSel ? state.searchSel.size : 0)}
        </button>
      </div>
      ${
        pinned
          ? `<div class="pin-pill"><span class="pp-txt">Adding straight to <strong>${escapeHtml(pinned.name)}</strong></span><button id="unpinBtn" title="Stop adding to this deck">✕</button></div>${playingProxyOptionHtml('pinnedDeckProxy', state.searchProxy)}`
          : ''
      }
      <div id="searchResultsBox"></div>
      <div
        class="cotd"
        id="cotdBox"
        ${state.searchRan || state.advOpen ? 'style="display:none;"' : ''}
      ></div>
    </div>
  </main>`;
}

/* The gold loupe in every advanced-filter drop-up: picking from a list (a
   set, a format) brings up no keyboard, so there was no search key to press.
   First child of the column-reverse panel = the panel's FOOT, bottom-left
   under the Name row; position:sticky keeps it at the bottom edge while the
   panel scrolls. It lives inside the panel, so a folded panel has none. */
function advGoHtml(id, extra) {
  return /* HTML */ `<div class="adv-go-row">
    <button
      type="button"
      class="adv-go"
      id="${id}"
      title="${trS('Search')}"
      aria-label="${trS('Search')}"
    >
      ${ICONS.search}</button
    >${extra || ''}
  </div>`;
}

function opSelectHtml(id, val) {
  const ops = [
    { v: '', l: 'Any' },
    { v: '=', l: 'Equals' },
    { v: '<', l: '<' },
    { v: '<=', l: '≤' },
    { v: '>', l: '>' },
    { v: '>=', l: '≥' },
  ];
  return cselectHtml(id, ops, val, 'Any', { cls: 'cs-op' });
}

let advancedApplyOnClose = false;

function advancedSearchScreenHtml() {
  const spoilers = state.screen === 'spoilers';
  const collection = state.screen === 'collection';
  const browse = state.screen === 'browse';
  const title = browse
    ? 'Inspiration filters'
    : collection
      ? 'Collection filters'
      : spoilers
        ? 'Spoiler filters'
        : 'Advanced search';
  const back = browse
    ? 'Back to inspiration'
    : collection
      ? 'Back to collection'
      : spoilers
        ? 'Back to spoilers'
        : 'Back to search';
  return /* HTML */ `<section
    id="advancedSearchScreen"
    role="dialog"
    aria-modal="true"
    aria-labelledby="advancedSearchTitle"
  >
    ${appTitlebarHtml(
      'advanced-search-header',
      /* HTML */ `
        <button type="button" id="advancedSearchClose" aria-label="${back}" title="${trS('Back')}">
          ${ICONS.back}
        </button>
        <h1 id="advancedSearchTitle">${title}</h1>
        <button
          type="button"
          id="advancedSearchReset"
          aria-label="${'Reset search filters'}"
          title="${'Reset'}"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6" />
          </svg>
        </button>
      `,
    )}
    <div id="advancedSearchBody">
      ${browse ? browseFiltersHtml() : collection ? collectionAdvancedPanelHtml() : spoilers ? spoilerAdvancedPanelHtml() : `<div class="adv-row"><label for="advName">${trS('Name')}</label><input id="advName" type="text" value="${escapeHtml(state.searchName)}" placeholder="Card name…"></div>${advancedPanelHtml()}`}
    </div>
    <button type="button" id="advGo" aria-label="${'Search cards'}" title="${'Search cards'}">
      ${ICONS.search}
    </button>
  </section>`;
}

function openAdvancedSearch(mode) {
  const spoilers = mode === 'spoilers';
  const collection = mode === 'collection';
  const browse = mode === 'browse';
  if (browse) {
    state.browseNameQ = document.getElementById('bsName')?.value || '';
    state.bsAdvOpen = true;
  } else if (spoilers) state.spAdvOpen = true;
  else if (collection) state.colAdvOpen = true;
  else state.advOpen = true;
  advancedApplyOnClose = false;
  state.openCSelect = null;
  pushOverlay(
    browse
      ? 'inspirationFilters'
      : collection
        ? 'collectionFilters'
        : spoilers
          ? 'spoilerFilters'
          : 'advancedSearch',
    () => {
      const apply = advancedApplyOnClose;
      advancedApplyOnClose = false;
      if (browse) state.bsAdvOpen = false;
      else if (spoilers) state.spAdvOpen = false;
      else if (collection) state.colAdvOpen = false;
      else state.advOpen = false;
      state.openCSelect = null;
      render();
      document
        .getElementById(
          browse ? 'bsChev' : collection ? 'colChev' : spoilers ? 'spAdvToggle' : 'qChev',
        )
        ?.focus({ preventScroll: true });
      if (apply && collection) scrollToPageFoot();
      else if (apply && !spoilers && !browse) runAdvancedSearch();
    },
  );
  render();
  const screen = document.getElementById('advancedSearchScreen');
  screen?.classList.add('entering');
  screen?.addEventListener('animationend', () => screen.classList.remove('entering'), {
    once: true,
  });
  document.getElementById('advancedSearchClose')?.focus({ preventScroll: true });
}

function applyAdvancedSearch() {
  document.activeElement?.blur();
  state.openCSelect = null;
  advancedApplyOnClose = true;
  closeTopOverlay();
}

function advancedPanelHtml() {
  const s = state;
  const colorOrder = ['W', 'U', 'B', 'R', 'G', 'C'];
  // The picker offers EVERY paper set (Portal Three Kingdoms included), not
  // just the legality pool — the Format filter handles legality. DOM order is
  // youngest-first because the drop-up panel is column-reverse: first in DOM
  // = nearest the foot, so the list reads oldest at the top, youngest at the
  // bottom beside the filter box.
  const NONPLAY_SET_TYPES = new Set(['token', 'memorabilia', 'minigame', 'alchemy']);
  const sets =
    state.allSetsRaw && state.allSetsRaw.length
      ? state.allSetsRaw
          .filter((x) => !x.digital && !NONPLAY_SET_TYPES.has(x.set_type))
          .sort((a, b) => String(b.released_at).localeCompare(String(a.released_at)))
          .map((x) => [x.code, x.name])
      : [];
  // Spoiler-season sets join the picker before release. Commander searches

  // its law — a preview appears only once it's in the active pool (in-
  // universe previews automatically, UB sets via their switch in Extras).
  try {
    (currentPreviewSets() || []).forEach((x) => {
      if (!x || !x.code || sets.some(([c]) => c === x.code)) return;
      sets.unshift([x.code, x.name]); // unreleased = youngest of all, right at the foot
    });
  } catch (e) {}
  const colorChecks = (attr, stateObj) =>
    `<div class="color-check-row">${colorOrder.map((c) => `<label class="ccheck"><input type="checkbox" ${attr}="${c}" ${stateObj[c] ? 'checked' : ''}><span class="mana-check">${manaIconSvg(c, 26)}</span></label>`).join('')}</div>`;
  return /* HTML */ `<div class="adv-panel" style="display:flex;flex-direction:column;">
    <div class="adv-row">
      <label>Format</label>
      ${cselectHtml('fmtSel', [{ v: '', l: 'Any format' }].concat(SEARCH_FORMATS.map(([v, l]) => ({ v, l }))), s.searchFormat, 'Any format', { cls: 'cs-up' })}
    </div>
    <div class="adv-row">
      <label>Oracle Text</label
      ><input
        id="oracleText"
        type="text"
        placeholder="Any text, e.g. draw a card"
        value="${escapeHtml(s.searchOracleText)}"
      />
    </div>
    <div class="adv-row">
      <label>Card Type</label
      ><input
        id="typeText"
        type="text"
        placeholder="e.g. Dragon, Equipment"
        value="${escapeHtml(s.searchTypeText)}"
      />
    </div>
    <div class="adv-row">
      <label>Tags</label>
      <div class="otag-wrap">
        <input
          id="otagText"
          type="text"
          placeholder="e.g. removal, ramp, tutor"
          value=""
          autocomplete="off"
          autocapitalize="off"
        />
        <div id="otagPop" class="otag-pop" hidden></div>
        <div class="otag-chips" id="otagChips"></div>
      </div>
    </div>
    <div class="adv-row">
      <label>Colors</label>${colorChecks('data-ccolor', s.searchCardColors)}
      <div class="adv-sub" style="max-width:220px;">
        ${cselectHtml(
          'ccmSel',
          [
            { v: 'all', l: 'Must have all selected' },
            { v: 'exact', l: 'Exactly these colors' },
            { v: 'atmost', l: 'At most these colors' },
          ],
          s.searchCardColorMode,
          'Match mode',
        )}
      </div>
    </div>
    <div class="adv-row">
      <label>Color Identity</label>${colorChecks('data-color', s.searchColors)}
      <div class="adv-sub" style="max-width:220px;">
        ${cselectHtml(
          'cmSel',
          [
            { v: 'atmost', l: 'At most these colors' },
            { v: 'exact', l: 'Exactly these colors' },
            { v: 'including', l: 'Including these colors' },
          ],
          s.searchColorMode,
          'Match mode',
        )}
      </div>
    </div>
    <div class="adv-row">
      <label>Set / Expansion</label>
      ${cselectHtml('setSel', [{ v: '', l: 'Any Set' }].concat(sets.map(([code, name]) => ({ v: code, l: escapeHtml(name), icons: setIconHtml(code) }))), s.searchSetCode, 'Any Set', { search: true, cls: 'cs-up cs-foot' })}
      ${sets.length ? '' : `<p class="adv-hint">Set list still loading…</p>`}
    </div>
    <div class="adv-row">
      <label>Mana Value</label>
      <div class="cmc-row">
        ${opSelectHtml('cmcOp', s.searchCmcOp)}
        <input id="cmcVal" type="number" min="0" placeholder="" value="${s.searchCmcVal}" />
      </div>
    </div>
    <div class="adv-row">
      <label>Mana Cost</label
      ><input
        id="manaCost"
        type="text"
        placeholder="(e.g., {2}{G})"
        value="${escapeHtml(s.searchManaCost)}"
      />
    </div>
    <div class="adv-row">
      <label>Power</label>
      <div class="cmc-row">
        ${opSelectHtml('powOp', s.searchPowOp)}
        <input id="powVal" type="text" placeholder="" value="${escapeHtml(s.searchPowVal)}" />
      </div>
    </div>
    <div class="adv-row">
      <label>Toughness</label>
      <div class="cmc-row">
        ${opSelectHtml('touOp', s.searchTouOp)}
        <input id="touVal" type="text" placeholder="" value="${escapeHtml(s.searchTouVal)}" />
      </div>
    </div>
    <div class="adv-row">
      <label>Loyalty</label>
      <div class="cmc-row">
        ${opSelectHtml('loyOp', s.searchLoyOp)}
        <input id="loyVal" type="text" placeholder="" value="${escapeHtml(s.searchLoyVal)}" />
      </div>
    </div>
    <div class="adv-row">
      <label>Rarity</label>
      <div class="rarity-row">
        ${[
          ['common', 'Common'],
          ['uncommon', 'Uncommon'],
          ['rare', 'Rare'],
          ['mythic', 'Mythic'],
        ]
          .map(
            ([v, l]) =>
              `<label class="rcheck"><input type="checkbox" data-rarity="${v}" ${s.searchRarity[v] ? 'checked' : ''}><span class="rpill r-${v}">${l}</span></label>`,
          )
          .join('')}
      </div>
    </div>
    <div class="adv-row">
      <label>Price</label>${priceSliderHtml('srchPr', s.searchEurMin, s.searchEurMax)}
    </div>
    <div class="adv-row">
      <label>Flavor Text</label
      ><input
        id="flavText"
        type="text"
        placeholder="e.g. dragon"
        value="${escapeHtml(s.searchFlavorText)}"
      />
    </div>
    <div class="adv-row">
      <label>Artist</label
      ><input
        id="artistText"
        type="text"
        placeholder="e.g. Rebecca Guay"
        value="${escapeHtml(s.searchArtist)}"
      />
    </div>
    ${(state.searchPinnedDeckId && getDeck(state.searchPinnedDeckId)) || (s.searchFormat && s.searchFormat !== 'any') ? `<div class="adv-row adv-showall-top"><label>${trS('Show everything')}</label><div style="display:flex;justify-content:flex-end;"><label class="toggle-switch"><input type="checkbox" id="advOffColor" ${s.searchShowOffColor ? 'checked' : ''}><span class="track"></span><span class="knob"></span></label></div></div>` : ''}
  </div>`;
}

function wireSearchPage() {
  document
    .getElementById('srSelFab')
    ?.addEventListener('click', (e) => openSearchSelMenu(e.currentTarget));
  // Pop the keyboard right away — the user came here to type. This runs
  // inside the navigation tap's own event chain, so mobile browsers allow it.
  if (state._focusSearchOnce && !state.searchRan) {
    state._focusSearchOnce = false; // arrival only — never on dropdown/filter re-renders
    try {
      document.getElementById('searchName')?.focus();
    } catch (e) {}
  }
  document.getElementById('unpinBtn')?.addEventListener('click', () => {
    state.searchPinnedDeckId = null;
    state.searchProxy = false;
    render();
  });
  document.getElementById('pinnedDeckProxy')?.addEventListener('change', (event) => {
    state.searchProxy = event.target.checked;
  });
  // Enter (the keyboard's search key) does what the Search button did:
  // fold the filter menu away, then run the search.
  document.getElementById('searchName').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (state.advOpen) {
      state.advOpen = false;
      render();
    }
    runAdvancedSearch();
  });
  wireNameSuggest(document.getElementById('searchName'), allCardNamesFor, (name) => {
    const inp = document.getElementById('searchName');
    if (inp) inp.value = name;
    state.searchName = name;
    const adv = document.getElementById('advName');
    if (adv) adv.value = name;
    if (state.advOpen) {
      state.advOpen = false;
      render();
    }
    runAdvancedSearch();
  });
  document.getElementById('searchName').addEventListener('input', (e) => {
    state.searchName = e.target.value;
    const adv = document.getElementById('advName');
    if (adv && adv.value !== e.target.value) adv.value = e.target.value; // mirror into the filters panel
  });
  document.getElementById('spoilersBtn')?.addEventListener('click', () => switchPage('spoilers'));
  document.getElementById('srSortBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openSearchSortMenu(e.currentTarget);
  });
  document.getElementById('qChev')?.addEventListener('click', openAdvancedSearch);
  if (state.advOpen) wireAdvancedPanel();
  if (state.searchRan) renderSearchResultsBox();
  loadCardOfTheDay();
  wireRandomCardRefresh();
}

function setCotdVisible(v) {
  const box = document.getElementById('cotdBox');
  if (box) box.style.display = v ? '' : 'none';
}

async function fetchRandomCotd(bg, excludeName) {
  if (window.DECKHAND_CONFIG?.selfHosted) {
    const ix = await bulkIndexReady();
    const legal = ix?.cards?.filter((c) => c.lg === 'legal');
    if (legal?.length) {
      const alternatives = legal.filter((c) => c.n !== excludeName);
      const pool = alternatives.length ? alternatives : legal;
      return bulkToCardish(pool[Math.floor(Math.random() * pool.length)]);
    }
  }
  let card = null;
  {
    // The random card rolls across EVERY Commander-legal card ever printed.
    for (let attempt = 0; attempt < 5 && !card; attempt++) {
      try {
        const res = await sfFetch(
          `${SF_BASE}/cards/random?q=${encodeURIComponent('game:paper -is:digital legal:commander')}`,
          0,
          !!bg,
        );
        if (!res.ok) break;
        const c = await res.json();
        if (c && c.name && c.name !== excludeName && !isBanned(c, 'commander')) card = c;
      } catch (e) {}
    }
  }
  return card;
}

/* Draw the session's random card quietly at launch, so arriving on the Search
   page finds it already waiting instead of a spinner. */
function preloadCotd() {
  if (window.DECKHAND_CONFIG?.selfHosted) return;
  if (state.cotd && state.cotd.card) return;
  fetchRandomCotd(true)
    .then((card) => {
      if (card && !(state.cotd && state.cotd.card)) state.cotd = { card };
    })
    .catch(() => {});
}

let cotdLoading = false;

async function loadCardOfTheDay(force) {
  const box = document.getElementById('cotdBox');
  if (!box) return;
  if (state.cotd && state.cotd.card && !force) {
    renderCotd(state.cotd.card);
    return;
  }
  if (cotdLoading) return;
  cotdLoading = true;
  box.innerHTML = /* HTML */ `<div class="status"><div class="spinner"></div></div>`;
  let card;
  try {
    card = await fetchRandomCotd(false, force ? state.cotd?.card?.name : null);
  } catch (e) {
  } finally {
    cotdLoading = false;
  }
  const live = document.getElementById('cotdBox');
  if (!live) return; // user navigated away or ran a search
  if (!card) {
    if (state.cotd?.card) renderCotd(state.cotd.card);
    else live.innerHTML = '';
    return;
  }
  state.cotd = { card };
  renderCotd(card);
}

function renderCotd(card) {
  const box = document.getElementById('cotdBox');
  if (!box) return;
  box.innerHTML = /* HTML */ ` <div
      class="cotd-refresh-status"
      role="status"
      aria-live="polite"
      hidden
    ></div>
    <img
      class="${wbClass(card)}"
      src="${cardImageLarge(card) || cardImage(card)}"
      alt="${escapeHtml(card.name)}"
      id="cotdImg"
    />
    <button type="button" class="cotd-h cotd-h-btn" id="cotdReroll">↻ Random Card</button>`;
  document.getElementById('cotdImg').addEventListener('click', () => openCardInfo(card));
  document.getElementById('cotdReroll').addEventListener('click', () => loadCardOfTheDay(true));
}

function wireRandomCardRefresh() {
  const main = document.querySelector('.app > main');
  if (!main) return;
  const scroller = main.querySelector('.tab-viewport') || main;
  let start = null,
    distance = 0;
  const eligible = () => {
    const box = document.getElementById('cotdBox');
    return (
      state.screen === 'search' &&
      !state.searchRan &&
      !state.advOpen &&
      !cotdLoading &&
      !state.overlayStack.length &&
      !document.getElementById('nameSuggest') &&
      box?.getClientRects().length &&
      getComputedStyle(box).display !== 'none' &&
      document.getElementById('cotdImg') &&
      scroller.scrollTop <= 0
    );
  };
  const clear = () => {
    start = null;
    distance = 0;
    const status = document.querySelector('#cotdBox .cotd-refresh-status');
    if (status) status.hidden = true;
  };
  main.addEventListener(
    'touchstart',
    (e) => {
      clear();
      if (e.touches.length !== 1 || !eligible() || e.target.closest('button,input,select,textarea'))
        return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    { passive: true },
  );
  main.addEventListener(
    'touchmove',
    (e) => {
      if (!start) return;
      if (e.touches.length !== 1 || !eligible()) {
        clear();
        return;
      }
      const dx = e.touches[0].clientX - start.x,
        dy = e.touches[0].clientY - start.y;
      if (dy < 0 || Math.abs(dx) > Math.max(12, dy)) {
        clear();
        return;
      }
      distance = dy;
      if (dy < 10) return;
      e.preventDefault();
      const status = document.querySelector('#cotdBox .cotd-refresh-status');
      if (status) {
        status.hidden = false;
        status.textContent = dy >= 80 ? 'Release to refresh' : 'Pull to refresh';
      }
    },
    { passive: false },
  );
  main.addEventListener(
    'touchend',
    (e) => {
      const refresh = start && distance >= 80 && eligible();
      if (start && distance >= 10) e.preventDefault();
      clear();
      if (refresh) loadCardOfTheDay(true);
    },
    { passive: false },
  );
  main.addEventListener('touchcancel', clear, { passive: true });
}

function wireAdvancedPanel() {
  const screen = document.getElementById('advancedSearchScreen');
  document
    .querySelectorAll(
      '.app > .app-header, .app > .app-navigation, .app > main > :not(#advSlot):not(#spAdvSlot):not(#colAdvSlot):not(#bsAdvSlot)',
    )
    .forEach((el) => {
      el.inert = true;
    });
  document
    .getElementById('advancedSearchClose')
    ?.addEventListener('click', () => closeTopOverlay());
  document.getElementById('advancedSearchReset')?.addEventListener('click', () => {
    if (state.screen === 'browse') {
      sfDropQueuedFor('browse');
      state.browseFormat = 'commander';
      state.browseSel = { count: '', combo: '', theme: '', type: '' };
      state.browseTypal = null;
      state.browseCache = {};
      _inspCancelRetry();
      _inspRetryN = 0;
      _inspFeedWin = 'week';
    } else if (state.screen === 'collection') clearCollectionFilters(false);
    else if (state.screen === 'spoilers') resetSpoilerFilters();
    else {
      resetSearchFilters();
      state.searchName = '';
    }
    state.openCSelect = null;
    render();
    document.getElementById('advancedSearchReset')?.focus({ preventScroll: true });
  });
  screen?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (state.openCSelect) {
        state.openCSelect = null;
        render();
        document.getElementById('advancedSearchClose')?.focus();
      } else closeTopOverlay();
    }
    if (e.key === 'Tab') {
      const controls = [...screen.querySelectorAll('button, input, select, [tabindex="0"]')].filter(
        (el) => !el.disabled && el.getClientRects().length,
      );
      const first = controls[0],
        last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  document.getElementById('advGo')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
    } catch (err) {} // a pending 'change' lands first
    applyAdvancedSearch();
  });
  if (state.screen === 'browse' || state.screen === 'spoilers' || state.screen === 'collection') {
    screen?.querySelectorAll('input:not([type]), input[type="text"]').forEach((inp) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyAdvancedSearch();
        }
      });
    });
    return;
  }
  document.getElementById('advName')?.addEventListener('input', (e) => {
    state.searchName = e.target.value;
    const top = document.getElementById('searchName');
    if (top) top.value = e.target.value; // keep the top search box in step
  });
  document
    .querySelectorAll(
      '#advancedSearchBody input[type="text"], #advancedSearchBody input:not([type]), #advancedSearchBody input[type="number"]',
    )
    .forEach((inp) => {
      if (inp.id === 'otagText') return;
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyAdvancedSearch();
        }
      });
    });
  document.getElementById('advOffColor')?.addEventListener('change', (e) => {
    state.searchShowOffColor = e.target.checked;
    renderSearchResultsBox();
  });
  document.querySelectorAll('[data-color]').forEach((chk) =>
    chk.addEventListener('change', () => {
      state.searchColors[chk.dataset.color] = chk.checked;
    }),
  );
  document.querySelectorAll('[data-ccolor]').forEach((chk) =>
    chk.addEventListener('change', () => {
      state.searchCardColors[chk.dataset.ccolor] = chk.checked;
    }),
  );
  _csHandlers.ccmSel = (v) => {
    state.searchCardColorMode = v;
    render();
  };
  _csHandlers.cmSel = (v) => {
    state.searchColorMode = v;
    render();
  };
  _csHandlers.sortSel = (v) => {
    state.searchSort = v;
    render();
  };
  _csHandlers.dirSel = (v) => {
    state.searchSortDir = v;
    render();
  };
  _csHandlers.cmcOp = (v) => {
    state.searchCmcOp = v;
    render();
  };
  _csHandlers.powOp = (v) => {
    state.searchPowOp = v;
    render();
  };
  _csHandlers.touOp = (v) => {
    state.searchTouOp = v;
    render();
  };
  _csHandlers.loyOp = (v) => {
    state.searchLoyOp = v;
    render();
  };
  _csHandlers.setSel = (v) => {
    state.searchSetCode = v;
    render();
  };
  _csHandlers.fmtSel = (v) => {
    state.searchFormat = v;
    if (isConstructedFmt(v)) {
      try {
        ensureFmtBans(v);
      } catch (e) {}
    }
    render();
  };
  wireCSelects();
  document.querySelectorAll('[data-rarity]').forEach((chk) =>
    chk.addEventListener('change', () => {
      state.searchRarity[chk.dataset.rarity] = chk.checked;
    }),
  );
  wirePriceSlider('srchPr', (mn, mx) => {
    state.searchEurMin = mn;
    state.searchEurMax = mx;
  });
  // Tag (Scryfall function): a searchable DROP-UP over the preloaded local
  // catalog (~170 slugs — the same list Similar/Budget rank with, so no
  // network and no wait). Column-reverse: best matches sit by the input.
  {
    // 1.33: SEVERAL tags. The picked ones live in state.searchOtag as a
    // comma list and show as chips under the field (tap a chip to drop it);
    // the field itself only filters the list. A card must carry them all.
    const inp = document.getElementById('otagText');
    const pop = document.getElementById('otagPop');
    const chips = document.getElementById('otagChips');
    const setList = (arr) => {
      state.searchOtag = arr.join(',');
    };
    const drawChips = () => {
      if (!chips) return;
      chips.innerHTML = otagSearchList(state.searchOtag)
        .map(
          (t) =>
            `<button type="button" class="otag-chip" data-otagrm="${escapeHtml(t)}">${escapeHtml(t)} <span aria-hidden="true">\u2715</span></button>`,
        )
        .join('');
      chips.querySelectorAll('[data-otagrm]').forEach((b) =>
        b.addEventListener('click', () => {
          setList(otagSearchList(state.searchOtag).filter((t) => t !== b.dataset.otagrm));
          drawChips();
          if (pop && !pop.hidden) fill();
        }),
      );
    };
    const toggle = (t) => {
      const cur = otagSearchList(state.searchOtag);
      setList(cur.includes(t) ? cur.filter((x) => x !== t) : cur.concat([t]));
      drawChips();
    };
    const fill = () => {
      if (!inp || !pop) return;
      const q = inp.value.trim().toLowerCase().replace(/\s+/g, '-');
      const on = new Set(otagSearchList(state.searchOtag));
      const hits = BUDGET_OTAGS.filter((t) => !q || t.includes(q))
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 400);
      pop.innerHTML = hits
        .map(
          (t) =>
            `<button type="button" data-otagpick="${t}" class="${on.has(t) ? 'on' : ''}">${on.has(t) ? '\u2713 ' : ''}${t}</button>`,
        )
        .join('');
      pop.hidden = !hits.length;
      pop.querySelectorAll('[data-otagpick]').forEach((o) =>
        o.addEventListener('click', () => {
          toggle(o.dataset.otagpick);
          inp.value = '';
          fill(); // the list stays open: pick the next one
        }),
      );
    };
    // a tap in the list must not take the focus away (that would fold it)
    pop?.addEventListener('mousedown', (e) => e.preventDefault());
    inp?.addEventListener('input', fill);
    inp?.addEventListener('focus', fill);
    inp?.addEventListener('blur', () =>
      setTimeout(() => {
        if (pop) pop.hidden = true;
      }, 250),
    );
    // Enter on a typed tag that matches one exactly picks it before searching
    inp?.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Enter') return;
        const q = inp.value.trim().toLowerCase().replace(/\s+/g, '-');
        if (!q) return;
        const hit = BUDGET_OTAGS.includes(q)
          ? q
          : BUDGET_OTAGS.filter((t) => t.includes(q)).length === 1
            ? BUDGET_OTAGS.find((t) => t.includes(q))
            : q;
        if (!otagSearchList(state.searchOtag).includes(hit)) toggle(hit);
        inp.value = '';
      },
      true,
    );
    drawChips();
  }
  document
    .getElementById('flavText')
    ?.addEventListener('input', (e) => (state.searchFlavorText = e.target.value));
  document
    .getElementById('artistText')
    ?.addEventListener('input', (e) => (state.searchArtist = e.target.value));
  document
    .getElementById('cmcVal')
    .addEventListener('input', (e) => (state.searchCmcVal = e.target.value));
  document
    .getElementById('manaCost')
    .addEventListener('input', (e) => (state.searchManaCost = e.target.value));
  document
    .getElementById('powVal')
    .addEventListener('input', (e) => (state.searchPowVal = e.target.value));
  document
    .getElementById('touVal')
    .addEventListener('input', (e) => (state.searchTouVal = e.target.value));
  document
    .getElementById('loyVal')
    .addEventListener('input', (e) => (state.searchLoyVal = e.target.value));
  document
    .getElementById('typeText')
    .addEventListener('input', (e) => (state.searchTypeText = e.target.value));
  document
    .getElementById('oracleText')
    .addEventListener('input', (e) => (state.searchOracleText = e.target.value));
}

function buildAdvancedClause() {
  state.searchName = document.getElementById('searchName')?.value ?? state.searchName;
  const parts = [];
  // Unquoted words each match anywhere in the name — the placeholder promises
  // "Any words in the name", so "storm aether" must find Aether Storm.
  if (state.searchName.trim())
    state.searchName
      .trim()
      .replace(/"/g, '')
      .split(/\s+/)
      .forEach((w) => parts.push(`name:"${w}"`));

  const chosen = Object.keys(state.searchColors).filter((c) => c !== 'C' && state.searchColors[c]);
  if (state.searchColors.C && !chosen.length) parts.push('id=c');
  else if (chosen.length) {
    const str = chosen.join('').toLowerCase();
    if (state.searchColorMode === 'exact') parts.push(`id=${str}`);
    else if (state.searchColorMode === 'including') parts.push(`id>=${str}`);
    else parts.push(`id<=${str}`);
  }

  // Colours actually printed on the card
  const cc = Object.keys(state.searchCardColors).filter(
    (c) => c !== 'C' && state.searchCardColors[c],
  );
  if (state.searchCardColors.C && !cc.length) parts.push('c=c');
  else if (cc.length) {
    const str = cc.join('').toLowerCase();
    if (state.searchCardColorMode === 'exact') parts.push(`c=${str}`);
    else if (state.searchCardColorMode === 'atmost') parts.push(`c<=${str}`);
    else parts.push(`c>=${str}`);
  }

  if (state.searchCmcOp && state.searchCmcVal !== '')
    parts.push(`cmc${state.searchCmcOp}${state.searchCmcVal}`);
  if (state.searchManaCost.trim())
    parts.push(`m:${state.searchManaCost.trim().replace(/\s+/g, '')}`);
  if (state.searchPowOp && state.searchPowVal !== '')
    parts.push(`pow${state.searchPowOp}${state.searchPowVal.trim()}`);
  if (state.searchTouOp && state.searchTouVal !== '')
    parts.push(`tou${state.searchTouOp}${state.searchTouVal.trim()}`);
  if (state.searchLoyOp && state.searchLoyVal !== '')
    parts.push(`loy${state.searchLoyOp}${state.searchLoyVal.trim()}`);
  if (state.searchTypeText.trim())
    state.searchTypeText
      .trim()
      .replace(/"/g, '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .forEach((w) => parts.push(`t:"${w}"`));
  if (state.searchOracleText.trim()) {
    let o = state.searchOracleText.trim();
    // Stray/unbalanced quotes are stripped — one lone " used to poison the
    // whole query with a 400.
    if ((o.match(/"/g) || []).length % 2) o = o.replace(/"/g, '');
    // Moxfield-style semantics: unquoted words each match anywhere in the
    // text, so "Any player activate ability" finds "Any player may activate
    // this ability". Quoted segments stay exact phrases.
    (o.match(/"[^"]*"|\S+/g) || []).forEach((t) => {
      if (/^".*"$/.test(t)) {
        if (t.length > 2) parts.push(`o:${t}`);
      } else parts.push(`o:"${t.replace(/"/g, '')}"`);
    });
  }
  if (state.searchKeyword.trim())
    parts.push(`keyword:"${state.searchKeyword.trim().replace(/"/g, '')}"`);
  otagSearchList(state.searchOtag).forEach((t) => parts.push('otag:' + t)); // 1.33: every picked tag
  if (state.searchFlavorText.trim())
    parts.push(`ft:"${state.searchFlavorText.trim().replace(/"/g, '')}"`);
  if (state.searchArtist.trim()) parts.push(`a:"${state.searchArtist.trim().replace(/"/g, '')}"`);

  // Rarity: several ticked boxes mean "any of these", so OR them together
  const rars = Object.keys(state.searchRarity).filter((r) => state.searchRarity[r]);
  if (rars.length)
    parts.push(
      rars.length === 1 ? `r:${rars[0]}` : '(' + rars.map((r) => `r:${r}`).join(' OR ') + ')',
    );

  // Price range: Scryfall filters on its own Cardmarket price. Only applied
  // when a thumb has moved — an untouched slider must not exclude the many
  // cards that carry no EUR price at all.
  if (state.searchEurMin > 0) parts.push(`eur>=${state.searchEurMin}`);
  if (state.searchEurMax != null) parts.push(`eur<=${state.searchEurMax}`);

  let clause = parts.join(' ');
  // Belt and braces: a clause with an odd number of quotes is guaranteed
  // malformed — strip them all rather than send Scryfall a broken query.
  if ((clause.match(/"/g) || []).length % 2) clause = clause.replace(/"/g, '');
  return clause;
}

/* ── LOCAL SEARCH ────────────────────────────────────────────────────────
   The weekly database already holds every card's name, type, oracle text,
   colours, cost, rarity, price, EDHREC rank and Scryfall function tags.
   Answering from it turns a search from "a trip down the one serial lane to
   Scryfall" into a few milliseconds of filtering — and, just as valuable,
   keeps that lane free for the things that genuinely must be live.
   Anything the corpus cannot express falls through to the network. */
function _lsOp(a, op, b) {
  if (a == null || isNaN(a)) return false;
  a = +a;
  b = +b;
  if (op === '>=') return a >= b;
  if (op === '<=') return a <= b;
  if (op === '>') return a > b;
  if (op === '<') return a < b;
  return a === b;
}

function _lsColors(have, want, mode) {
  const H = new Set(
    String(have || '')
      .toUpperCase()
      .split('')
      .filter(Boolean),
  );
  const W = new Set(want);
  if (mode === 'exact') return H.size === W.size && [...W].every((x) => H.has(x));
  if (mode === 'including') return [...W].every((x) => H.has(x)); // id>= / c>=
  if (mode === 'all') return [...W].every((x) => H.has(x)); // "must have all selected"
  return [...H].every((x) => W.has(x)); // at most
}

/* Mana-cost symbols as a multiset; generic is summed so {2} matches a cost
   with two or more generic pips, the way Scryfall's m: behaves. */
function _lsCostBag(str) {
  const up = String(str || '').toUpperCase();
  const bag = {};
  let generic = 0;
  const syms = up.match(/\{[^}]+\}/g);
  if (syms) {
    syms.forEach((sym) => {
      const in_ = sym.slice(1, -1);
      if (/^\d+$/.test(in_)) generic += +in_;
      else bag[in_] = (bag[in_] || 0) + 1;
    });
  } else {
    (up.match(/\d+|[WUBRGCXSP]/g) || []).forEach((t) => {
      if (/^\d+$/.test(t)) generic += +t;
      else bag[t] = (bag[t] || 0) + 1;
    });
  }
  bag.__generic = generic;
  return bag;
}

/* One sort order, two card shapes: raw database rows on the way out of the
   local engine, dressed Scryfall-ish objects when a local list and a live
   list are merged. Same comparator either way, so a merged page is ordered
   exactly like a purely local one. */
function _lsCmp(sortKey, sortDir, acc) {
  const dir = sortDir === 'desc' ? -1 : 1;
  const nm = acc.nm,
    cmc = acc.cmc,
    rk = acc.rk;
  return (a, b) => {
    if (sortKey === 'cmc')
      return ((cmc(a) || 0) - (cmc(b) || 0)) * dir || String(nm(a)).localeCompare(String(nm(b)));
    if (sortKey === 'edhrec') {
      const ra = rk(a) == null ? Infinity : rk(a),
        rb = rk(b) == null ? Infinity : rk(b);
      return (ra - rb) * dir || String(nm(a)).localeCompare(String(nm(b)));
    }
    if (sortKey === 'eur' || sortKey === 'salt') {
      // A card without a price / salt score sits at the END either way;
      // among those, the most played come first.
      const get = sortKey === 'eur' ? acc.eur : acc.salt;
      const va = get(a),
        vb = get(b);
      const na = va == null || isNaN(va),
        nb = vb == null || isNaN(vb);
      if (na !== nb) return na ? 1 : -1;
      if (!na && va !== vb) return (va - vb) * dir;
      const ra = rk(a) == null ? Infinity : rk(a),
        rb = rk(b) == null ? Infinity : rk(b);
      return ra - rb || String(nm(a)).localeCompare(String(nm(b)));
    }
    return String(nm(a)).localeCompare(String(nm(b))) * dir;
  };
}

const _LS_BULK = {
  nm: (c) => c.n,
  cmc: (c) => c.mv,
  rk: (c) => c.rk,
  eur: (c) => (c.eur != null ? +c.eur : null),
  salt: () => null,
};

const _LS_CARD = {
  nm: (c) => c.name,
  cmc: (c) => c.cmc,
  rk: (c) => c.edhrec_rank,
  eur: (c) => printEur(c),
  salt: (c) => (c._salt == null ? null : c._salt),
};

function _lsCostFits(cardCost, wanted) {
  const A = _lsCostBag(cardCost),
    B = _lsCostBag(wanted);
  for (const k in B) {
    if (k === '__generic') continue;
    if ((A[k] || 0) < B[k]) return false;
  }
  return (A.__generic || 0) >= (B.__generic || 0);
}

function localSearchable() {
  const st = state;
  if ((st.searchFlavorText || '').trim()) return false;
  if ((st.searchArtist || '').trim()) return false;
  if (st.searchLoyOp && st.searchLoyVal !== '') return false;
  if ((st.searchSetCode || '').trim()) return false;
  const f = st.searchFormat || 'any';
  if (f === 'any' || f === 'commander') return true;
  // The other formats are local too once the weekly file carries their
  // legality (lx) -- until then they go to Scryfall as before.
  let ix = null;
  try {
    ix = _bulkIdx;
  } catch (e) {}
  return LX_FORMATS.indexOf(f) >= 0 && !!(ix && ix.hasLx);
}

async function localSearch(limit) {
  let ix = null;
  try {
    ix = await bulkIndexReady();
  } catch (e) {
    return null;
  }
  if (!ix || !ix.cards || !ix.cards.length) return null;
  const st = state;
  const low = (x) => String(x || '').toLowerCase();

  const nameWords = (st.searchName || '')
    .trim()
    .replace(/"/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(low);
  const typeWords = (st.searchTypeText || '')
    .trim()
    .replace(/"/g, '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(low);
  let oracleToks = [];
  if ((st.searchOracleText || '').trim()) {
    let o = st.searchOracleText.trim();
    if ((o.match(/"/g) || []).length % 2) o = o.replace(/"/g, '');
    oracleToks = (o.match(/"[^"]*"|\S+/g) || [])
      .map((t) => (/^".*"$/.test(t) ? t.slice(1, -1) : t.replace(/"/g, '')))
      .map(low)
      .filter(Boolean);
  }
  const kw = low((st.searchKeyword || '').trim());
  const otagWant = otagSearchList(st.searchOtag).map(normTagKey); // 1.33: all of them
  const idWant = Object.keys(st.searchColors || {}).filter((c) => c !== 'C' && st.searchColors[c]);
  const idColorless = !!(st.searchColors && st.searchColors.C) && !idWant.length;
  const ccWant = Object.keys(st.searchCardColors || {}).filter(
    (c) => c !== 'C' && st.searchCardColors[c],
  );
  const ccColorless = !!(st.searchCardColors && st.searchCardColors.C) && !ccWant.length;
  const rars = Object.keys(st.searchRarity || {}).filter((r) => st.searchRarity[r]);
  const fmt = st.searchFormat || 'any';
  const cmdrBans = fmt === 'commander' ? cmdrBanSet() : null;
  const lxI = LX_FORMATS.indexOf(fmt);
  const fmtBans = isConstructedFmt(fmt) ? fmtBanSets(fmt) : null;

  const out = [];
  for (const c of ix.cards) {
    if (!c || !c.n) continue;
    const nm = low(c.n);
    if (nameWords.length && !nameWords.every((w) => nm.includes(w))) continue;
    if (typeWords.length) {
      const tl = low(c.tl) + ' ' + (c.f || []).map((f) => low(f.tl)).join(' ');
      if (!typeWords.every((w) => tl.includes(w))) continue;
    }
    if (oracleToks.length) {
      const ot = low(c.ot) + ' ' + (c.f || []).map((f) => low(f.ot)).join(' ');
      if (!oracleToks.every((t) => ot.includes(t))) continue;
    }
    if (idColorless) {
      if ((c.ci || '') !== '') continue;
    } else if (idWant.length && !_lsColors(c.ci, idWant, st.searchColorMode)) continue;
    if (ccColorless) {
      if ((c.c || '') !== '') continue;
    } else if (ccWant.length && !_lsColors(c.c, ccWant, st.searchCardColorMode)) continue;
    if (st.searchCmcOp && st.searchCmcVal !== '' && !_lsOp(c.mv, st.searchCmcOp, st.searchCmcVal))
      continue;
    if ((st.searchManaCost || '').trim() && !_lsCostFits(c.mc, st.searchManaCost.trim())) continue;
    if (st.searchPowOp && st.searchPowVal !== '' && !_lsOp(c.pw, st.searchPowOp, st.searchPowVal))
      continue;
    if (st.searchTouOp && st.searchTouVal !== '' && !_lsOp(c.tg, st.searchTouOp, st.searchTouVal))
      continue;
    if (kw && !(c.kw || []).some((k) => low(k) === kw)) continue;
    if (otagWant.length) {
      const tags = new Set((ix.tagByOid && c.o ? ix.tagByOid.get(c.o) || [] : []).map(normTagKey));
      if (!otagWant.every((t) => tags.has(t))) continue;
    }
    if (rars.length && !rars.includes(low(c.r))) continue;
    if (st.searchEurMin > 0 && !(c.eur != null && +c.eur >= st.searchEurMin)) continue;
    if (st.searchEurMax != null && !(c.eur != null && +c.eur <= st.searchEurMax)) continue;
    // Mode isolation: Commander is judged the way commanderVerdict() judges
    // it -- by NAME against the official ban list, with the per-card flag
    // only when that list is empty. 'not_legal' is deliberately NOT a bar:
    // the corpus keeps one printing per card, and a collector reprint (30th
    // Anniversary, for one) carries not_legal for a card that is entirely

    if (fmt === 'commander') {
      if (cmdrBans && cmdrBans.size) {
        if (cmdrBans.has(norm(String(c.n).split(' // ')[0]))) continue;
      } else if (c.lg === 'banned') continue;
    }
    if (lxI >= 0) {
      // Legal or restricted in the file, and not on today's ban list. A
      // 'b' the live list no longer carries is an unban the file missed.
      const L = (c.lx || '')[lxI] || 'n';
      const nm = norm(String(c.n).split(' // ')[0]);
      if (fmtBans && fmtBans.banned.has(nm)) continue;
      if (!(L === 'l' || L === 'r' || (L === 'b' && fmtBans && fmtBans.live))) continue;
    }
    out.push(c);
    if (out.length > 4000) break; // a runaway query cannot hog the frame
  }
  out.sort(_lsCmp(st.searchSort, st.searchSortDir, _LS_BULK));
  return out
    .slice(0, limit || 300)
    .map(bulkToCardish)
    .filter(Boolean);
}

/* ── WHAT THE WEEKLY BUILD CANNOT KNOW ───────────────────────────────────
   The local database is a snapshot with a date on it. A card can be missing
   from it for exactly one reason: it was printed in a set that Scryfall
   published after that date. So instead of asking Scryfall the whole
   question again and comparing card by card, the app asks a far smaller
   one: WHICH SETS are newer than my snapshot? -- and then searches only
   inside those. Most weeks the answer is "none", and then the network is
   not touched at all.
   Returns [] when the snapshot is complete, a list of set codes when it is
   not, and null when the question cannot be answered (no snapshot date, no
   set catalogue yet, or an implausibly long list) -- null means "fall back
   to the full online search", never "assume complete". */
const _NEW_SET_SKIP = new Set([...NO_CARDS_SET_TYPES, 'funny', 'alchemy', 'vanguard']);

// The window only has to reach back past ONE build interval: a set older
// than that was already complete in an earlier weekly snapshot. Ten days
// covers the seven-day cadence with room to spare -- and every day shaved
// off is a set code that no longer rides along in the query.
const _NEW_SET_GRACE_DAYS = 10;

const _NEW_SET_MAX = 45;
// Scryfall caps a query around 1000 chars
async function newerThanBuildSets() {
  let ix = null;
  try {
    ix = await bulkIndexReady();
  } catch (e) {
    return null;
  }
  if (!ix || !ix.built) return null;
  const builtMs = Date.parse(ix.built);
  if (!builtMs) return null;
  const cutoff = new Date(builtMs - _NEW_SET_GRACE_DAYS * 86400000).toISOString().slice(0, 10);
  try {
    await resolveLegalSets();
  } catch (e) {}
  const all = state.allSetsRaw || [];
  if (!all.length) return null; // catalogue unknown -- do not guess
  const codes = [];
  for (const x of all) {
    if (x.digital) continue;
    if (_NEW_SET_SKIP.has(x.set_type)) continue;
    // An announced set with nothing in it yet cannot hold a missing card.
    // (cards === undefined means an older catalogue that never carried the
    // count -- then we keep the set rather than silently dropping it.)
    if (x.cards === 0) continue;
    // No release date at all = an announced set already being spoiled:
    // newer than any snapshot by definition.
    if (x.released_at && x.released_at < cutoff) continue;
    codes.push(x.code);
  }
  return codes.length > _NEW_SET_MAX ? null : codes;
}

/* The top-up query: the same clause, but fenced inside the newer sets.
   Legality is judged AFTER the fact rather than in the query, because a set
   still in preview is marked not_legal until release day -- demanding
   legal:commander there would hide the very cards this lane exists for. */
async function searchNewSets(baseClause, codes, limit) {
  const fmt = state.searchFormat || 'any';
  const base = (baseClause || '').replace(/\s*-t:land/g, '');
  const setClause = '(' + codes.map((c) => 'set:' + c).join(' OR ') + ')';
  const q = (base + ' ' + setClause + ' game:paper -is:digital').trim();
  const orderParam =
    state.searchSort === 'cmc'
      ? 'cmc'
      : state.searchSort === 'eur'
        ? 'eur'
        : state.searchSort === 'edhrec' || state.searchSort === 'salt'
          ? 'edhrec'
          : 'name';
  const dir = state.searchSortDir === 'desc' ? 'desc' : 'auto';
  const url = `${SF_BASE}/cards/search?unique=cards&order=${orderParam}&dir=${dir}&q=${encodeURIComponent(q)}`;
  const res = await sfFetch(url, 0, false);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw res.status;
  }
  const dd = await res.json();
  let data = (dd.data || []).slice(0, limit || 300);
  if (fmt === 'commander') {
    // Mode isolation holds here too: the OFFICIAL flag plus the OFFICIAL

    // an unreleased card looks like, not a ruling against it.
    let bans = null;
    try {
      bans = cmdrBanSet();
    } catch (e) {}
    data = data.filter((c) => {
      if ((c.legalities || {}).commander === 'banned') return false;
      if (bans && bans.size && bans.has(norm(String(c.name).split(' // ')[0]))) return false;
      return true;
    });
  } else if (isConstructedFmt(fmt)) {
    const B = fmtBanSets(fmt);
    data = data.filter((c) => !B.banned.has(norm(String(c.name).split(' // ')[0])));
  }
  return data;
}

/* Local list first, live extras folded in, duplicates (a reprint in a new
   set) resolved in favour of the copy we already have. */
function _lsMerge(localList, extras) {
  const seen = new Set((localList || []).map((c) => String(c.name).toLowerCase()));
  const out = (localList || []).slice();
  (extras || []).forEach((c) => {
    const k = String(c.name || '').toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(c);
  });
  out.sort(_lsCmp(state.searchSort, state.searchSortDir, _LS_CARD));
  return out.slice(0, 300);
}

let _searchSeq = 0;

async function runAdvancedSearch() {
  const clause = buildAdvancedClause();
  state.searchRan = true;
  state.searchError = false;
  if (!clause && !state.searchSetCode && !state.searchFormat) {
    document.getElementById('searchResultsBox').innerHTML = /* HTML */ `<div class="empty-note">
      Enter a name or set at least one filter.
    </div>`;
    return;
  }
  state.searching = true;
  renderSearchResultsBox();
  const mySeq = ++_searchSeq;
  const priceOk = (list) => {
    if (!(state.searchEurMin > 0 || state.searchEurMax != null)) return list;
    return list.filter((c) => {
      const p = shownEurOf(c);
      if (p == null) return false;
      if (state.searchEurMin > 0 && p < state.searchEurMin) return false;
      if (state.searchEurMax != null && p > state.searchEurMax) return false;
      return true;
    });
  };
  const paint = (list, err) => {
    state.searchResults = searchSortList((list || []).filter(isRealCard));
    state.searchError = !!err;
    state.searching = false;
    renderSearchResultsBox();
    if (state.searchSort === 'salt') loadSearchSalt();
  };
  // 1. The device answers first — instantly, and without touching the queue.
  //    An EMPTY array is a real answer ("nothing matches"); only null means
  //    the device could not answer at all.
  let localShown = null,
    painted = false;
  if (localSearchable()) {
    try {
      const loc = await localSearch(300);
      if (mySeq !== _searchSeq) return;
      if (loc) {
        localShown = priceOk(loc);
        if (localShown.length) {
          paint(localShown, false);
          painted = true;
        } // show it now; an empty list waits for the top-up
      }
    } catch (e) {}
  }
  // Nothing on screen may be redrawn to say the same thing: a repaint costs
  // the scroll position and shows as a flicker.
  const sameAsShown = (list) =>
    painted &&
    list.length === localShown.length &&
    list.every((c, i) => c.name === localShown[i].name);
  // 2. Only what the snapshot CANNOT know is asked of Scryfall. When the
  //    phone found NOTHING, the full online search runs instead: a card the
  //    snapshot lacks (it only ever knew one printing per card) must still
  //    be findable.
  if (localShown && localShown.length) {
    const newCodes = await newerThanBuildSets();
    if (mySeq !== _searchSeq) return;
    if (newCodes) {
      if (!newCodes.length) {
        if (!painted) paint(localShown, false);
        return;
      } // snapshot complete — no request at all
      let extras = null;
      try {
        extras = await searchNewSets(clause, newCodes, 300);
      } catch (e) {
        extras = null;
      } // the bulk of the answer is already right
      if (mySeq !== _searchSeq) return;
      const next = extras && extras.length ? _lsMerge(localShown, priceOk(extras)) : localShown;
      if (sameAsShown(next)) return;
      paint(next, false);
      return;
    }
    // newCodes === null: the snapshot's reach is unknown, so ask in full.
  }
  // 3. The full online search — for everything the device never answered,
  //    and as the fallback when the set catalogue is not known yet.
  const { results, error } = await searchAndVerifyLegal(clause, state.searchSort, 300, {
    restrictSet: state.searchSetCode,
    dir: state.searchSortDir,
    format: state.searchFormat || 'any',
  });
  if (mySeq !== _searchSeq) return;
  if (localShown && localShown.length && (error || !results.length)) return; // keep what the device found
  const shownRes = priceOk(results);
  if (sameAsShown(shownRes)) return;
  paint(shownRes, localShown && localShown.length ? false : error);
}

/* Surgical badge refresh: replace only the affected tile in place. A full
   grid rebuild for one IN DECK badge is what made the page lurch, however
   carefully the scroll was put back afterwards — this touches nothing else,
   so there is nothing to put back. */
/* 1.5: what Search shows. Deck-pinned: only cards that may join the deck
   (colour identity AND legality) -- a card already in it stays, so it can be
   taken out. Without a deck, a chosen Format hides what is not legal in it.
   "Show everything" in the advanced filter shows it all. */
function searchVisiblePool(d) {
  const all = state.searchResults || [];
  if (state.searchShowOffColor) return all;
  if (d)
    return all.filter(
      (c) =>
        copiesIn(d.cards || [], c.name) > 0 ||
        (colorIdentityOkDeck(c, d) && !deckBlockReason(c, d)),
    );
  const f = state.searchFormat;
  if (f && f !== 'any')
    return all.filter((c) => {
      const v = fmtVerdict(c, f);
      return v !== 'banned' && v !== 'not_legal';
    });
  return all;
}

function refreshSearchTile(name) {
  const box = document.getElementById('searchResultsBox');
  const d = state.searchPinnedDeckId ? getDeck(state.searchPinnedDeckId) : null;
  const c = state.searchResults.find((x) => x.name === name);
  if (!box || !c) return false;
  let tile = null;
  try {
    tile = box.querySelector(`.sr-tile[data-name="${CSS.escape(encodeURIComponent(name))}"]`);
  } catch (e) {}
  if (!tile) return false;
  const tmp = document.createElement('div');
  tmp.innerHTML = searchRowHtml(c, d, { showCommanderBtn: true });
  const fresh = tmp.firstElementChild;
  if (!fresh) return false;
  tile.replaceWith(fresh);
  const srPool = state.searchResults; // every result stays wirable (a tile may just have changed state)
  wireResultButtons(srPool, d, searchGridRefresh); // fresh node is unwired; everyone else skips
  wireSearchSelect(box, srPool);
  loadTilePrices([c]); // cached — fills in instantly
  return true;
}

/* The grid's refresh hook: with the changed card known, only its tile is
   touched; without it (leader change, toggle, …) the full rebuild runs. */
function searchGridRefresh(c) {
  if (c && c.name && refreshSearchTile(c.name)) return;
  renderSearchResultsBox();
}

/* Search results: LONG-PRESS a card to start picking several; while any are
   picked, every tap toggles one. The gold button in the search bar (＋ for
   one pick, the count from two) takes the 🔮's place and holds the actions. */
function wireSearchSelect(box, pool) {
  box.querySelectorAll('.sr-tile[data-name]').forEach((tile) => {
    const name = decodeURIComponent(tile.dataset.name);
    if (!tile.querySelector('.sel-check')) {
      const m = document.createElement('span');
      m.className = 'sel-check';
      m.textContent = '\u2713';
      tile.appendChild(m);
    }
    tile.classList.toggle('selected', !!(state.searchSel && state.searchSel.has(name)));
    if (tile.dataset.sw) return;
    tile.dataset.sw = '1';
    let lpT = null,
      lpFired = false;
    const toggle = () => {
      const c =
        pool.find((x) => x.name === name) ||
        (state.searchResults || []).find((x) => x.name === name);
      if (!c) return;
      if (!state.searchSel) state.searchSel = new Map();
      if (state.searchSel.has(name)) state.searchSel.delete(name);
      else state.searchSel.set(name, c);
      tile.classList.toggle('selected', state.searchSel.has(name));
      if (!state.searchSel.size) state.searchSel = null;
      updateSearchSelFab();
    };
    const arm = () => {
      lpFired = false;
      clearTimeout(lpT);
      lpT = setTimeout(() => {
        lpFired = true;
        try {
          navigator.vibrate && navigator.vibrate(8);
        } catch (err) {}
        toggle();
      }, 480);
    };
    const disarm = () => clearTimeout(lpT);
    tile.addEventListener('pointerdown', arm);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
      tile.addEventListener(ev, disarm),
    );
    // Capture phase: runs before the image's own "open the card" tap.
    tile.addEventListener(
      'click',
      (e) => {
        if (lpFired) {
          lpFired = false;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        if (state.searchSel && state.searchSel.size) {
          e.stopPropagation();
          e.preventDefault();
          toggle();
        }
      },
      true,
    );
  });
}

function updateSearchSelFab() {
  const n = state.searchSel ? state.searchSel.size : 0;
  const fab = document.getElementById('srSelFab');
  if (fab) {
    fab.hidden = !n;
    fab.innerHTML = selFabLabel(n);
  }
}

function openSearchSelMenu(anchor) {
  const cards = state.searchSel ? Array.from(state.searchSel.values()) : [];
  if (!cards.length) return;
  const pinned = state.searchPinnedDeckId ? getDeck(state.searchPinnedDeckId) : null;
  const done = () => {
    searchSelClear();
    try {
      renderSearchResultsBox();
    } catch (e) {}
  };
  // Drop-up: the first choice sits nearest the thumb (last here).
  const items = [
    { label: '\u2715 ' + trS('Deselect all'), fn: () => searchSelClear() },
    {
      label: mIco('binder') + trS('Add to collection…'),
      fn: () => openAddManyToCollection(cards, () => searchSelClear()),
    },
    pinned
      ? {
          label: '\uFF0B ' + escapeHtml(pinned.name),
          fn: () => {
            if (
              addCardsToDeckQuiet(
                pinned,
                cards.map((card) => playingDeckCopy(card, state.searchProxy)),
              )
            )
              done();
          },
        }
      : { label: '\uFF0B ' + trS('Add to deck…'), fn: () => openMultiDeckChooser(cards, done) },
  ];
  openTileMenu(anchor, items);
}

// pages / search / results

/* ---- Sorting the results: popularity, price, mana value, salt ----------
   The sort button sits between the filter \u25BE and the \uD83D\uDD2E. Its drop-up names
   every order in plain words; the current one wears a \u2713. Results re-sort
   on the spot, and the next search keeps the order. */
const SORT_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M7 4v16M3.5 16.5 7 20l3.5-3.5"/><path d="M17 20V4M13.5 7.5 17 4l3.5 3.5"/></svg>';

function searchSortList(list) {
  return (list || []).slice().sort(_lsCmp(state.searchSort, state.searchSortDir, _LS_CARD));
}

function searchSortOptions() {
  // Drop-up, bottom-up: the most used order sits at the foot, by the thumb.
  return [
    ['name', 'asc', 'Name A \u2192 Z'],
    ['salt', 'asc', 'Salt: least salty first'],
    ['salt', 'desc', 'Salt: saltiest first'],
    ['cmc', 'desc', 'Mana value: high \u2192 low'],
    ['cmc', 'asc', 'Mana value: low \u2192 high'],
    ['eur', 'desc', 'Price: high \u2192 low'],
    ['eur', 'asc', 'Price: low \u2192 high'],
    ['edhrec', 'desc', 'Popularity: least played first'],
    ['edhrec', 'asc', 'Popularity: most played first'],
  ];
}

function openSearchSortMenu(anchor) {
  openCardSortMenu(
    anchor,
    searchSortOptions(),
    state.searchSort,
    state.searchSortDir,
    applySearchSort,
  );
}

function openCardSortMenu(anchor, options, key, direction, onPick) {
  openTileMenu(
    anchor,
    options.map(([k, dir, label]) => {
      const on = key === k && direction === dir;
      return {
        label:
          `<span style="display:inline-block;width:1.2em;">${on ? '\u2713' : ''}</span>` + label,
        fn: () => onPick(k, dir),
      };
    }),
  );
  // One line per order, the whole sheet just above the button.
  const pop = document.getElementById('tileMenuPop');
  if (pop) {
    pop.querySelectorAll('button').forEach((b) => {
      b.style.whiteSpace = 'nowrap';
    });
    const r = anchor.getBoundingClientRect();
    pop.style.top = Math.min(r.bottom + 6, window.innerHeight - 16 - pop.offsetHeight) + 'px';
    pop.style.left =
      Math.max(8, Math.min(r.right - pop.offsetWidth, window.innerWidth - 8 - pop.offsetWidth)) +
      'px';
    pop.scrollTop = 0;
  }
}

function applySearchSort(k, dir) {
  state.searchSort = k;
  state.searchSortDir = dir;
  const b = document.getElementById('srSortBtn');
  if (b) b.classList.toggle('active', k !== 'name');
  if (state.searchRan && (state.searchResults || []).length) {
    state.searchResults = searchSortList(state.searchResults);
    const box = document.getElementById('searchResultsBox');
    if (box) box.innerHTML = ''; // a fresh grid: the new best result at the foot
    renderSearchResultsBox();
    if (k === 'salt') loadSearchSalt();
  }
}

/* Salt scores come from EDHREC, card by card. The saltiest hundred arrive in
   one list; the rest of the leading results are looked up a few at a time
   (week-cached, so a second sort is instant). The grid re-sorts as they land. */
let _saltSeq = 0;

async function loadSearchSalt() {
  const seq = ++_saltSeq;
  const live = () => seq === _saltSeq && state.screen === 'search' && state.searchSort === 'salt';
  const list = state.searchResults || [];
  if (!list.length) return;
  try {
    if (!state._saltTop) {
      const data = await edhrecFetchJson('/pages/top/salt.json');
      const m = new Map();
      ((((data || {}).container || {}).json_dict || {}).cardlists || []).forEach((L) =>
        ((L && L.cardviews) || []).forEach((cv) => {
          let v = Number(cv && cv.salt);
          if (!isFinite(v)) {
            const mm = /([0-9]+(?:\.[0-9]+)?)/.exec(String((cv && (cv.label || cv.value)) || ''));
            v = mm ? Number(mm[1]) : NaN;
          }
          if (cv && cv.name && isFinite(v)) m.set(String(cv.name).toLowerCase(), v);
        }),
      );
      state._saltTop = m;
    }
  } catch (e) {}
  if (!live()) return;
  const top = state._saltTop || new Map();
  list.forEach((c) => {
    if (c._salt === undefined && top.has(String(c.name).toLowerCase()))
      c._salt = top.get(String(c.name).toLowerCase());
  });
  const todo = list.filter((c) => c._salt === undefined).slice(0, 60);
  const repaint = () => {
    if (!live()) return;
    state.searchResults = searchSortList(state.searchResults);
    const box = document.getElementById('searchResultsBox');
    if (box) box.innerHTML = '';
    renderSearchResultsBox();
  };
  repaint();
  if (!todo.length) return;
  toast('\uD83E\uDDC2 Fetching salt scores\u2026');
  let i = 0,
    done = 0;
  const worker = async () => {
    while (i < todo.length && live()) {
      const c = todo[i++];
      try {
        await edhrecSaltFor(c);
      } catch (e) {}
      if (++done % 12 === 0) repaint();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  repaint();
}

function renderSearchResultsBox() {
  const box = document.getElementById('searchResultsBox');
  if (!box) return;
  const d = state.searchPinnedDeckId ? getDeck(state.searchPinnedDeckId) : null;
  setCotdVisible(!state.searching && !state.searchRan);
  if (state.searching) {
    box.innerHTML = /* HTML */ `<div class="status"><div class="spinner"></div></div>`;
    if (state.searchSel) searchSelClear();
    return;
  }
  if (!state.searchRan) return;
  if (state.searchError === 'badquery') {
    box.innerHTML = /* HTML */ `<div class="error-note">
      One of the filters contains something Scryfall can't read — most often a stray quote (") or a
      symbol in Mana Cost. Clear or fix that filter and search again.
    </div>`;
    return;
  }
  if (state.searchError) {
    box.innerHTML = /* HTML */ `<div class="error-note">
      Scryfall couldn't be reached just now. Check your connection and try again — the search
      retries on its own, so this only appears after several failed attempts.
    </div>`;
    return;
  }
  // Deck-pinned searches show only cards that can actually join the deck;
  // without a deck, the chosen Format hides what is not legal there (1.5).
  // "Show everything" in the Advanced filter opens the door again --
  // filtered at render time, so flipping it needs no new Scryfall query.
  const srPool = searchVisiblePool(d);
  if (!srPool.length) {
    box.innerHTML = /* HTML */ `<div class="empty-note">
      ${
        state.searchResults.length
          ? trS(
              'Every match is off-color or not legal here — turn on “Show everything” under Advanced filters to see them.',
            )
          : state.searchFormat && state.searchFormat !== 'any'
            ? `${'Nothing legal in ' + escapeHtml(fmtLabelOf(state.searchFormat)) + ' matches this search — the Format filter is set to ' + escapeHtml(fmtLabelOf(state.searchFormat)) + '.'}<button type="button" class="ghost-btn" id="srAllFmts" style="display:block;width:100%;margin-top:10px;">${trS('Search all formats')}</button>`
            : trS('No legal cards found for that search.')
      }
    </div>`;
    const _af = document.getElementById('srAllFmts');
    if (_af)
      _af.addEventListener('click', () => {
        state.searchFormat = '';
        render();
        runAdvancedSearch();
      });
    return;
  }
  // Rebuilding after an add used to restart at the first 20 tiles: the page
  // shrank, the browser clamped the scroll, and the view jumped somewhere
  // else. Re-render to the previous depth and put the scroll right back.
  const prevShown = box.querySelectorAll('.sr-tile').length;
  const scroller = box.closest('.tab-viewport') || window;
  const y =
    scroller === window
      ? pageScroller().scrollTop
      : scroller.scrollTop || Number(scroller.dataset.restoreScroll) || 0;
  box.innerHTML = '';
  pagedGrid(
    box,
    srPool,
    (c) => searchRowHtml(c, d, { showCommanderBtn: true }),
    // Live array, not the cumulative slice: a tile wires its tap handler
    // exactly once, so a slice frozen at chunk time gave early tiles a pool
    // that ended mid-list — swiping forward off the last card of a chunk
    // went nowhere. Every other grid already passes its live pool.
    (chunk, shown) => {
      wireResultButtons(srPool, d, searchGridRefresh);
      wireSearchSelect(box, srPool);
      loadTilePrices(chunk);
    },
    { initial: prevShown },
  );
  if (prevShown || y > 0) scroller.scrollTo(0, y);
  else {
    // Fresh results open at the top. Keep that position as images settle,
    // unless the user has already started scrolling.
    const _t0 = Date.now();
    scrollToPageFoot();
    const _reanchor = () => {
      if ((state._userScrollAt || 0) > _t0) return;
      scrollToPageFoot();
    };
    setTimeout(_reanchor, 250);
    setTimeout(_reanchor, 800);
  }
}

/* Sort for recommendation lists: color first (WUBRG, then multicolor, then
   colorless), mana value second, name third. */
function colorGroupOf(c) {
  const cols = frontFace(c).colors || c.colors || [];
  if (cols.length === 0) return 6;
  if (cols.length > 1) return 5;
  return { W: 0, U: 1, B: 2, R: 3, G: 4 }[cols[0]] ?? 6;
}

/* Fill in the little price line on every visible result tile. Prices come
   from the same cheapest-Cardmarket-printing lookup the decklist uses, so
   anything already priced is instant from cache. */
/* Tile prices are INSTANT: each tile shows a price already in hand — the
   fresh cached cheapest when we know it, otherwise the returned printing's
   own Cardmarket trend — with ZERO network requests. The true cheapest
   across printings is computed only when a card's page opens
   (loadCardPrice), which also refreshes the cache these tiles read next
   time. A whole grid used to queue one prints-walk per tile through the
   serial queue; that trickle is gone. */
function loadTilePrices(cards) {
  for (const c of cards) {
    const els = document.querySelectorAll(
      `.st-price[data-pricecard="${encodeURIComponent(c.name)}"]`,
    );
    if (!els.length) continue;
    // The card object's own price is TODAY's Scryfall value — it outranks
    // yesterday's cached cheapest. The cache answers only for objects that
    // carry no prices of their own (collection items between syncs). And a
    // remembered printing outranks everything: the tile WEARS that printing,
    // so it must charge that printing's price.
    const ppr = printPrefFor(c);
    const own = ppr && typeof ppr.p === 'number' && !isNaN(ppr.p) ? ppr.p : printEur(c);
    const hit = state.priceCache[c.name];
    const v =
      own != null && !isNaN(own) ? own : hit && Date.now() - hit.t < PRICE_TTL ? hit.v : null;
    els.forEach((el) => {
      if (v === null || v === undefined) {
        el.innerHTML = '<span class="nopr" role="button">€✕</span>';
      } else {
        el.textContent = fmtEur(v);
      }
    });
  }
}

/* Why the card sheet's Add button is off: the pinned deck's own rule, or,
   with no deck pinned, a ban in the format the page is about. */
function ciBlockWhy(card, deck) {
  return deck ? deckBlockReason(card, deck) : isBanned(card) ? 'Banned' : '';
}

function searchRowHtml(c, d, opts) {
  opts = opts || {};
  const banned = d ? !!deckBlockReason(c, d) : isBanned(c);
  let tag = 'ok',
    tagTxt = '',
    disabled = banned;
  if (d) {
    const colorOk = colorIdentityOkDeck(c, d);
    const alreadyIn = atCopyLimit(d, c);
    const noCommander = !d.admiral && !deckIsConstructed(d);
    disabled = banned || !colorOk || alreadyIn || noCommander;
    if (banned) {
      tag = 'banned';
      tagTxt = deckBlockReason(c, d) || 'Banned';
    } else if (noCommander) {
      tag = 'dupe';
      tagTxt = 'Pick ' + fmtName(d) + ' first';
    } else if (!colorOk) {
      tag = 'banned';
      tagTxt = 'Off-color';
    }
    // 1.30: no IN DECK pill -- the red minus already says the card is in
  } else if (banned) {
    tag = 'banned';
    tagTxt = 'Banned';
  }
  const canBeCommander = opts.showCommanderBtn && leaderFitsFormat(c, ctxFmt()) && !banned;
  // 1.5: in the deck (main deck, not in command) -> a "-" takes one out again;
  // at the copy limit it replaces the "+", below it (the 60s) it sits beside
  const inMain = d ? copiesIn(d.cards || [], c.name) : 0;
  const showRm = inMain > 0 && !deckLeaders(d).some((L) => L.name === c.name);
  const showAdd = !(showRm && atCopyLimit(d, c));
  // 1.21: a card that can share command shows its pairings in a popup
  const canPairPop = !!opts.showCommanderBtn && !!pairAbility(c);
  if (canPairPop) {
    (window._pairPopReg = window._pairPopReg || new Map()).set(c.name, c);
  }
  return /* HTML */ `<div class="sr-tile" data-name="${encodeURIComponent(c.name)}">
    <img
      class="${wbClass(c)}"
      src="${cardImageMed(c)}"
      data-preview="${cardImageLarge(c)}"
      data-wb="${wbClass(c) ? 1 : ''}"
      alt="${escapeHtml(c.name)}"
      loading="lazy"
    />${cardBadgesHtml(c)}${gcMarkHtml(c)}${canPairPop ? `<span class="pair-pop-wrap"><button type="button" class="pair-pop-btn" data-pairpop="${encodeURIComponent(c.name)}" title="${trS('Partner pairings')}" aria-label="${trS('Partner pairings')}">${PAIR_ICON}</button></span>` : ''}
    <div class="st-body">
      ${tag !== 'ok' ? `<div class="st-meta"><span class="tag ${tag}">${tagTxt}</span></div>` : ''}
      <div class="st-meta-row">
        <div class="st-price st-price-lg" data-pricecard="${encodeURIComponent(c.name)}">…</div>
        <span style="display:flex;gap:6px;">
          ${canBeCommander ? `<button class="add-btn add-btn-slim" data-admiral="1" data-name="${encodeURIComponent(c.name)}" title="Set as ${fmtName(d)}">${modeGlyph()}</button>` : ''}
          ${showRm && !opts.noAdd ? `<button class="add-btn add-btn-slim add-btn-rm" data-rm="${encodeURIComponent(c.name)}" title="${trS('Remove from deck')}" aria-label="${trS('Remove from deck')}">\u2212</button>` : ''}
          ${showAdd && !opts.noAdd ? `<button class="add-btn add-btn-slim" data-name="${encodeURIComponent(c.name)}" title="${d ? 'Add to Deck' : 'Add card'}" aria-label="${d ? 'Add to Deck' : 'Add card'}" ${disabled ? 'disabled' : ''}>+</button>` : ''}
        </span>
      </div>
      ${opts.sub ? `<div class="st-decks">${escapeHtml(opts.sub)}</div>` : decksNoteHtml(opts.decks)}
    </div>
  </div>`;
}

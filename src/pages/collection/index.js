// pages / collection / index

/* ---------------- COLLECTION PAGE ---------------- */
function colMatch(it, codes) {
  if (isCollectionBasicLand(it)) return false;
  const f = state.colFilter;
  if (f.q && !it.name.toLowerCase().includes(f.q.toLowerCase())) return false;
  if (f.type) {
    // Same semantics as the Search page's Card Type box: every word must
    // appear in the type line, commas and spaces both separate words.
    const tl = (it.type_line || '').toLowerCase();
    const wants = f.type
      .toLowerCase()
      .replace(/"/g, '')
      .split(/[\s,]+/)
      .filter(Boolean);
    if (wants.length && !wants.every((w) => tl.includes(w))) return false;
  }
  if (f.set && it.set !== f.set) return false;
  const rsel = Object.keys(f.rarity || {}).filter((k) => f.rarity[k]);
  if (rsel.length && !rsel.includes(it.rarity)) return false;
  const csel = Object.keys(f.colors || {}).filter((k) => k !== 'C' && f.colors[k]);
  const wantC = !!(f.colors || {}).C;
  if (csel.length || wantC) {
    const cs = it.colors || [];
    if (wantC && !csel.length) {
      if (cs.length) return false;
    } // C alone = colorless only
    else if (f.colorMode === 'exact') {
      if (!(cs.length === csel.length && csel.every((c) => cs.includes(c)))) return false;
    } else if (f.colorMode === 'atmost') {
      if (!cs.every((c) => csel.includes(c))) return false;
    } else {
      if (!csel.every((c) => cs.includes(c))) return false;
    } // 'all' — must have all selected
  }
  if (f.eurMin > 0 && (it.eur || 0) < f.eurMin) return false;
  if (f.eurMax != null && (it.eur || 0) > f.eurMax) return false;
  const lf = colLegalFmt(f);
  if (lf) {
    codes = codes || new Set();
    if (!colItemLegalIn(it, lf, codes)) return false;
  }
  return true;
}

/* The collection's format filter speaks the Search page's language: pick a
   format, see what is legal in it. Old saved choices ('legal' / 'illegal',
   Commander-only) map onto it. */
function colLegalFmt(f) {
  const v = (f && f.legal) || '';
  if (v === 'legal') return 'commander';
  if (v === 'illegal') return '';
  return v;
}

function colItemLegalIn(it, fmt, codes) {
  if (fmt === 'commander') return collectionCardStatus(it, codes) === null;
  const v = fmtVerdict(
    { name: it.name, set: it.set, set_type: it.set_type, layout: it.layout },
    fmt,
  );
  if (v === 'unknown') {
    queueFmtLegality([it.name]);
    return true;
  } // judged as soon as the answer lands
  return v === 'legal' || v === 'restricted' || v === 'preview';
}

function colFilteredItems() {
  const f = state.colFilter;
  const codes = new Set();
  if (f.binder === '__playing__') return computePlaying().filter((item) => colMatch(item, codes));
  if (!f.binder && !colFilterActive())
    return collectionUnsortedItems().filter((item) => colMatch(item, codes));
  return state.collection.items.filter((it) => {
    // Three scopes: the automatic All binder shows every owned card; a real
    // binder shows its own; the front page shows only LOOSE (unfiled) cards —
    // the filed ones live in their binders, which keeps the landing light.
    if (f.binder === '__all__') {
      /* everything owned */
    } else if (f.binder) {
      if (it.binder !== f.binder) return false;
    } else {
      if (it.binder && !colFilterActive()) return false;
    } // searching the front page = searching everything
    return colMatch(it, codes);
  });
}

function collectionSelectedRows() {
  const indices = new Map(state.collection.items.map((item, index) => [item, index]));
  return colFilteredItems()
    .filter((row) => state.colSel?.has(indices.get(row._collectionItem || row)))
    .map((row) => ({ item: row._collectionItem || row, qty: Number(row.qty ?? 1) || 0 }));
}

function collectionSelectedQuantity() {
  return collectionSelectedRows().reduce((sum, row) => sum + row.qty, 0);
}

function colFilterActive() {
  const f = state.colFilter;
  return !!(
    f.q ||
    f.set ||
    f.type ||
    f.legal ||
    f.eurMin > 0 ||
    f.eurMax != null ||
    Object.values(f.colors || {}).some(Boolean) ||
    Object.values(f.rarity || {}).some(Boolean)
  );
}

function collectionValueItems() {
  const f = state.colFilter;
  if (f.binder === '__wants__') return computeWants().filter((it) => colMatch(it));
  return !f.binder && !colFilterActive() ? collectionTrackedItems() : colFilteredItems();
}

function collectionTotalValue(items) {
  return collectionTrackedItems(items).reduce(
    (total, it) => total + (it.eur || 0) * (it.qty ?? 1),
    0,
  );
}

function collectionValueKey() {
  const f = state.colFilter;
  // Filtered snapshots must not overwrite the whole collection's price history.
  return colFilterActive()
    ? '__col_filtered:' + JSON.stringify(f)
    : '__col:' + (!f.binder || f.binder === '__all__' ? 'all' : f.binder);
}

function collectionHeaderActionHtml() {
  const id = state.colFilter.binder;
  if (!id)
    return `<button type="button" id="tradeBtn" class="header-filter" aria-label="Trade calculator" title="${trS('Trade')}">${ICONS.trade}</button>`;
  if (id === '__all__')
    return `<button type="button" id="collectionStatsBtn" class="header-filter" aria-label="Collection stats" title="Collection value & history">${ICONS.chart}</button>`;
  if (state.collection.binders.some((b) => b.id === id))
    return `<button type="button" id="binderSettingsBtn" class="header-filter" aria-label="Edit binder settings" title="Binder settings">${ICONS.edit}</button>`;
  return '';
}

function openCollectionStats() {
  const items = collectionTrackedItems();
  const value = collectionTotalValue(items);
  const quantity = items.reduce((n, it) => n + (it.qty ?? 1), 0);
  recordCollectionTotal(value);
  openPriceHistory('Collection Value', '__col:all');
  document.querySelector('#phOverlay main')?.insertAdjacentHTML(
    'afterbegin',
    `<section class="collection-stats-summary" aria-label="Total collection">
      <div><span>Collection Value</span><strong>${fmtEur(value)}</strong></div>
      <div><span>Cards owned</span><strong>${quantity}</strong></div>
    </section>`,
  );
}

function recordCollectionTotal(value) {
  // Earlier All cards visits used a separate key. Keep those daily points
  // alongside the overview's history, with its canonical points taking priority.
  const legacy = priceHistOf('__col:__all__');
  if (legacy.length) {
    _phist['__col:all'] = [...new Map([...legacy, ...priceHistOf('__col:all')]).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30);
    delete _phist['__col:__all__'];
  }
  notePrice('__col:all', value, true);
}

function clearCollectionFilters(rerender = true) {
  state.colFilter = {
    ...state.colFilter,
    q: '',
    set: '',
    type: '',
    legal: '',
    colors: { W: false, U: false, B: false, R: false, G: false, C: false },
    colorMode: 'all',
    rarity: { common: false, uncommon: false, rare: false, mythic: false },
    eurMin: 0,
    eurMax: null,
  };
  if (rerender) csRerender();
}

function binderName(id) {
  if (id === '__playing__') return 'Playing';
  if (id === '__wants__') return 'Wants';
  if (id === '__all__') return 'All cards';
  const b = state.collection.binders.find((x) => x.id === id);
  return b ? b.name : null;
}

/* Wants includes missing deck copies and explicit proxies, even when another
   physical copy of that card is already owned. Manual additions remain supported. */
function computeWants() {
  const owned = playingOwnedCounts();
  const excluded = new Set((state.collection.wantsExclude || []).map(playingNameKey));
  const map = new Map();
  const src = (state._wantsSrc = new Map());
  const take = (card, decks, qty, manual = false) => {
    if (!card?.name || qty < 1 || isCollectionBasicLand(card)) return;
    const key = playingNameKey(card.name);
    // Deck proxies are always wanted; exclusions only apply to manual wants.
    if (manual && excluded.has(key)) return;
    if (!src.has(card.name) && (card.oracle_text != null || Array.isArray(card.card_faces)))
      src.set(card.name, card);
    const existing = map.get(key);
    if (existing) {
      existing.qty = Math.max(existing.qty, qty);
      existing.manual ||= manual;
      for (const name of decks) if (!existing.decks.includes(name)) existing.decks.push(name);
      return;
    }
    const hit = state.priceCache[card.name];
    map.set(key, {
      name: card.name,
      img: card.img || cardImageMed(card),
      type_line: card.type_line || '',
      set: card.set || '',
      set_name: card.set_name || '',
      colors: card.colors || card.color_identity || [],
      rarity: card.rarity || '',
      border_color: card.border_color || '',
      qty,
      eur:
        card.eur != null
          ? card.eur
          : hit && typeof hit.v === 'number'
            ? hit.v
            : brItemEur({ name: card.name }),
      decks,
      manual,
    });
  };
  for (const [key, entry] of playingDeckDemand()) {
    const missing = Math.max(0, entry.physical.length - (owned.get(key) || 0));
    const proxies = entry.proxies.filter(({ card }) => !card._wantsDismissed);
    const sources = proxies.concat(missing ? entry.physical : []);
    const decks = Array.from(new Set(sources.map(({ deck }) => deck.name || 'Untitled deck')));
    take(sources[0]?.card || entry.card, decks, missing + proxies.length);
  }
  for (const card of state.collection.wantsManual || [])
    if (!(owned.get(playingNameKey(card.name)) > 0)) take(card, [], card.qty || 1, true);
  return Array.from(map.values());
}

function collectionAdvancedPanelHtml() {
  const f = state.colFilter;
  const sets = Array.from(
    new Map(collectionTrackedItems().map((it) => [it.set, it.set_name || it.set])).entries(),
  ).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const setOpts = [{ v: '', l: 'All sets' }].concat(
    sets.map(([code, name]) => ({ v: code, l: name, icons: setIconHtml(code) })),
  );
  const colorOrder = ['W', 'U', 'B', 'R', 'G', 'C'];
  return /* HTML */ `<div class="adv-panel" id="colAdvBox">
    <div id="colAdvPanel" style="display:flex;flex-direction:column;">
      <div class="adv-row collection-view-setting">
        <label>Binder view</label>${folderViewToggleHtml('col')}
      </div>
      <div class="adv-row">
        <label>Name</label
        ><input
          id="colFq"
          class="col-filter-input"
          placeholder="Card name…"
          value="${escapeHtml(f.q)}"
        />
      </div>
      <div class="adv-row">
        <label>Set</label>${cselectHtml('colSet', setOpts, f.set, 'All sets', { search: true })}
      </div>
      <div class="adv-row">
        <label>Type</label
        ><input
          id="colTypeText"
          class="col-filter-input"
          placeholder="e.g. Dragon, Equipment"
          value="${escapeHtml(f.type)}"
        />
      </div>
      <div class="adv-row">
        <label>Colors</label>
        <div class="color-check-row">
          ${colorOrder.map((c) => `<label class="ccheck"><input type="checkbox" data-colcolor="${c}" ${f.colors[c] ? 'checked' : ''}><span class="mana-check">${manaIconSvg(c, 26)}</span></label>`).join('')}
        </div>
        <div class="adv-sub" style="max-width:220px;">
          ${cselectHtml(
            'colCM',
            [
              { v: 'all', l: 'Must have all selected' },
              { v: 'exact', l: 'Exactly these colors' },
              { v: 'atmost', l: 'At most these colors' },
            ],
            f.colorMode,
            'Match mode',
          )}
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
                `<label class="rcheck"><input type="checkbox" data-colrarity="${v}" ${f.rarity[v] ? 'checked' : ''}><span class="rpill r-${v}">${l}</span></label>`,
            )
            .join('')}
        </div>
      </div>
      <div class="adv-row">
        <label>${trS('Format')}</label
        >${cselectHtml('colLegal', [{ v: '', l: trS('All cards') }].concat(SEARCH_FORMATS.map(([v, l]) => ({ v, l }))), colLegalFmt(f), trS('All cards'))}
      </div>
      <div class="adv-row"><label>Price</label>${priceSliderHtml('colPr', f.eurMin, f.eurMax)}</div>
    </div>
  </div>`;
}

function collectionPageHtml() {
  const f = state.colFilter;
  const wantsMode = f.binder === '__wants__';
  const playingMode = f.binder === '__playing__';
  const _colLegalCodes = new Set();
  const items = wantsMode
    ? computeWants().filter((it) => colMatch(it, _colLegalCodes))
    : colFilteredItems();
  if (wantsMode) pruneWantsSelection(items);
  else state.wantSel = null;
  const sortChoice = collectionSortChoice();
  const _idxOf = new Map(state.collection.items.map((x, i) => [x, i]));
  const itemIndex = (item) => _idxOf.get(item._collectionItem || item);
  const valueItems = !f.binder && !colFilterActive() ? collectionTrackedItems() : items;
  const totalEur = collectionTotalValue(valueItems);
  recordCollectionTotal(collectionTotalValue(state.collection.items));
  if (!colFilterActive()) notePrice(collectionValueKey(), totalEur);
  return /* HTML */ `<main
    class="collection-page${wantsMode ? ' wants-page' : ''}${wantsMode && state.wantSel?.size ? ' wants-selecting' : ''}"
  >
    <div class="account-warning-slot">${accountWarningHtml()}</div>
    <div class="searchbar page-searchbar collection-searchbar">
      <input
        id="colSearchQ"
        enterkeyhint="search"
        placeholder="${playingMode ? 'Search Playing…' : f.binder && f.binder !== '__all__' && f.binder !== '__wants__' ? trS('Search this binder…') : trS('Search collection…')}"
        value="${escapeHtml(f.q || '')}"
        autocomplete="off"
      /><button
        type="button"
        class="ghost-btn search-tool"
        id="colChev"
        aria-label="Advanced collection filters"
        title="${trS('Advanced filters')}"
        aria-haspopup="dialog"
        aria-expanded="${state.colAdvOpen}"
      >
        ${ICONS.filter}
      </button>
      <button
        type="button"
        id="colSortBtn"
        class="ghost-btn search-tool${sortChoice.sort !== 'name' || sortChoice.sortDir !== 'asc' ? ' active' : ''}"
        aria-label="Sort collection"
        title="Sort"
        style="padding:0 11px;flex:none;"
      >
        ${SORT_ICON}
      </button>
    </div>
    <div id="colAdvSlot">${state.colAdvOpen ? advancedSearchScreenHtml() : ''}</div>
    ${wantsMode ? wantsSelectionHtml(items) : ''}
    ${f.binder || colFilterActive() ? '' : collectionBindersGridHtml()}
    ${!f.binder && !colFilterActive() ? '<h2 class="section-label collection-unsorted-title">Unsorted</h2>' : ''}
    ${f.binder ? `<button class="deck-fab" id="binderFab" title="${trS('Add cards to collection…')}">${ICONS.plus}</button>` : ''}
    ${
      items.length
        ? colGridsHtml(items, (it) =>
            wantsMode
              ? `
      <div class="sr-tile col-tile want-tile${state.wantSel?.has(playingNameKey(it.name)) ? ' csel' : ''}" data-wn="${escapeHtml(it.name)}" tabindex="0" role="group" aria-label="${escapeHtml(it.name)}${state.wantSel?.has(playingNameKey(it.name)) ? ', selected' : ''}">
        <div class="want-img"><img loading="lazy" class="${it.border_color === 'white' ? 'wb-card' : ''}" src="${it.img}" alt="${escapeHtml(it.name)}">${it.qty > 1 ? `<span class="vg-qty">×${it.qty}</span>` : ''}${pwPillHtml(it.name)}<button type="button" class="want-have" data-wanthave="${escapeHtml(it.name)}" title="${'I got it'}" aria-label="${'I got it'}">\uFF0B</button></div>
        <div class="col-tile-info">
          <div class="l1">${escapeHtml(it.name)}</div>
          <div class="l2 want-in">${it.eur != null ? `<span class="wi-eur">€${it.eur.toFixed(2)}</span>` : ''}${wantInLabel(it)}</div>
        </div>
        ${state.wantSel?.has(playingNameKey(it.name)) ? '<span class="csel-mark">✓</span>' : ''}
      </div>`
              : `
      <button class="sr-tile col-tile ${!playingMode && state.colSel && state.colSel.has(itemIndex(it)) ? 'csel' : ''}" ${playingMode ? 'data-playing-ci' : 'data-ci'}="${itemIndex(it)}">
        <img loading="lazy" class="${it.border_color === 'white' ? 'wb-card' : ''}" src="${it.img}" alt="${escapeHtml(it.name)}">${it.qty > 1 ? `<span class="vg-qty">×${it.qty}</span>` : ''}${it.foil ? '<i class="foil-star col-foil" title="Foil">✨</i>' : ''}${!playingMode && state.colSel && state.colSel.has(itemIndex(it)) ? '<span class="csel-mark">✓</span>' : ''}${collectionMarkHtml(it, _colLegalCodes)}
        <div class="col-tile-info">
          <div class="l1">${escapeHtml(it.name)}</div>
          ${playingMode ? `<div class="l2 playing-decks">In ${escapeHtml(it.decks.join(', '))}</div>` : ''}
          ${(!f.binder && colFilterActive()) || f.binder === '__all__' ? `<div class="l2 col-bnd">${inlIco('binder', 13)}${escapeHtml(it.binder ? binderName(it.binder) || trS('Binder') : trS('No binder'))}</div>` : ''}
          <div class="l2" style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml((it.set || '').toUpperCase())}${it.cn ? ' #' + escapeHtml(it.cn) : ''} · ${escapeHtml(it.cond)}</span>${it.eur != null ? `<span style="color:var(--brass);font-family:'JetBrains Mono',monospace;flex:none;">€${(it.eur * it.qty).toFixed(2)}</span>` : ''}</div>
        </div>
      </button>`,
          )
        : `<div class="empty-note" style="margin-top:20px;">${playingMode ? (colFilterActive() ? 'Nothing matches these filters.' : 'Owned cards used in your decks appear here. Proxies appear in Wants.') : wantsMode ? 'Nothing on the Wants list — every card in your decks is in your collection.' : !f.binder && !colFilterActive() ? 'Cards without a binder appear here.' : collectionTrackedItems().length ? 'Nothing matches these filters.' : 'Your collection is empty. Search above, or use "Add to collection" on any card in the app.'}</div>`
    }
    ${
      state.colSel && state.colSel.size
        ? `<button class="deck-fab col-sel-fab" id="colSelFab" title="Selected cards">${selFabLabel(
            collectionSelectedQuantity(),
            true,
          )}</button>`
        : ''
    }
  </main>`;
}

/* Shared Scryfall art-crop helper, also used by Inspiration. */
function artCropFrom(img) {
  // Scryfall image paths swap format in-place: …/normal/… → …/art_crop/…
  return img ? String(img).replace('/normal/', '/art_crop/').replace('/large/', '/art_crop/') : img;
}

function wireCollectionPage() {
  wireLibraryTileImages();
  document.getElementById('colSortBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    openCollectionSortMenu(event.currentTarget);
  });
  wireFolderViewToggle('col');
  wireBinderGroups();
  requestAnimationFrame(() => requestAnimationFrame(fitColTileHeight));
  document.querySelectorAll('[data-brinfo]').forEach((btn) => {
    const stop = (e) => e.stopPropagation();
    btn.addEventListener('pointerdown', stop);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const b = state.collection.binders.find((x) => x.id === btn.dataset.brinfo);
      if (b) toast(binderRulesList(b));
    });
  });
  document.querySelectorAll('[data-binderopen]').forEach((t) => {
    // Long-press manages the binder; a plain tap opens it.
    let lpT = null,
      lpFired = false;
    const id = t.dataset.binderopen;
    const binder = state.collection.binders.find((x) => x.id === id) || {
      id,
      name: collectionFolderTitle(id),
    };
    const arm = (e) => {
      lpFired = false;
      clearTimeout(lpT);
      const px = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
      const py = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
      lpT = setTimeout(() => {
        lpFired = true;
        try {
          navigator.vibrate && navigator.vibrate(8);
        } catch (err) {}
        openBinderLongMenu(binder, px, py);
      }, 480);
    };
    const disarm = () => clearTimeout(lpT);
    t.addEventListener('pointerdown', arm);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => t.addEventListener(ev, disarm));
    t.addEventListener('contextmenu', (e) => e.preventDefault());
    t.addEventListener('click', (e) => {
      if (lpFired) {
        lpFired = false;
        e.preventDefault();
        return;
      }
      openBinderIn(t.dataset.binderopen);
    });
  });
  document.getElementById('colBackBtn')?.addEventListener('click', () => history.back());
  document.getElementById('tradeBtn')?.addEventListener('click', () => switchPage('trade'));
  document.getElementById('collectionStatsBtn')?.addEventListener('click', openCollectionStats);
  document.getElementById('binderSettingsBtn')?.addEventListener('click', () => {
    const binder = state.collection.binders.find((b) => b.id === state.colFilter.binder);
    if (binder) openBinderRules(binder, false);
  });
  document.getElementById('binderFab')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const bid = state.colFilter.binder;
    if (bid === '__playing__') {
      openFabMenu(
        [
          [
            'bfAddCard',
            `<span class="ib">${ICONS.search}</span>Add card to deck`,
            () => switchPage('search'),
          ],
          [
            'bfScanCards',
            `<span class="ib">${SCANNER_ICON}</span>Scan deck`,
            () => openCardScanner({ mode: 'deck' }),
          ],
        ],
        e.currentTarget,
      );
      return;
    }
    openFabMenu(
      [
        [
          'bfAddCard',
          `<span class="ib">${ICONS.search}</span>${trS('Add card')}`,
          openCollectionCardSearch,
        ],
        [
          'bfScanCards',
          `<span class="ib">${SCANNER_ICON}</span>Scan cards`,
          () => openCardScanner({ binder: bid }),
        ],
        ['bfImport', mIco('file') + trS('Import'), () => openCollectionImport(bid)],
      ],
      e.currentTarget,
    );
  });
  document.getElementById('colFab')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openFabMenu(
      [
        [
          'fabAddCard',
          `<span class="ib">${ICONS.search}</span>${trS('Add card')}`,
          openCollectionCardSearch,
        ],
        ['fabScanCards', `<span class="ib">${SCANNER_ICON}</span>Scan cards`, openCardScanner],
        [
          'fabAddBinder',
          `<span class="ib">${ICONS.collection}</span>${trS('New binder')}`,
          () => {
            openInAppPrompt('New binder name', 'Binder name', '', (name) => {
              if (name && name.trim()) {
                const nb = { id: 'bnd_' + Date.now().toString(36), name: name.trim() };
                state.collection.binders.push(nb);
                saveCollection();
                openBinderIn(nb.id);
                openBinderRules(nb, true);
              }
            });
          },
        ],
        ['fabImport', mIco('file') + trS('Import'), () => openCollectionImport()],
      ].concat(
        ruledBinders().length
          ? [['fabResort', '↻ ' + 'Re-sort binders', () => binderResort()]]
          : [],
      ),
      e.currentTarget,
    );
  });
  document
    .getElementById('colChev')
    ?.addEventListener('click', () => openAdvancedSearch('collection'));
  _csHandlers['colSet'] = (v) => {
    state.colFilter.set = v;
    csRerender();
  };
  _csHandlers['colCM'] = (v) => {
    state.colFilter.colorMode = v;
    csRerender();
  };
  _csHandlers['colLegal'] = (v) => {
    state.colFilter.legal = v;
    if (isConstructedFmt(v)) {
      try {
        ensureFmtBans(v);
      } catch (e) {}
    }
    csRerender();
  };
  wireCSelects();
  document.querySelectorAll('[data-colcolor]').forEach((chk) =>
    chk.addEventListener('change', () => {
      state.colFilter.colors[chk.dataset.colcolor] = chk.checked;
    }),
  );
  document.querySelectorAll('[data-colrarity]').forEach((chk) =>
    chk.addEventListener('change', () => {
      state.colFilter.rarity[chk.dataset.colrarity] = chk.checked;
    }),
  );
  wirePriceSlider('colPr', (mn, mx) => {
    state.colFilter.eurMin = mn;
    state.colFilter.eurMax = mx;
  });
  document.getElementById('colFq')?.addEventListener('input', (e) => {
    state.colFilter.q = e.target.value;
    const top = document.getElementById('colSearchQ');
    if (top) top.value = e.target.value;
  });
  document.getElementById('colTypeText')?.addEventListener('input', (e) => {
    state.colFilter.type = e.target.value;
  });
  if (state.colAdvOpen) wireAdvancedPanel();
  document.querySelectorAll('[data-wantbell]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openPriceWatchSheet(btn.dataset.wantbell);
    });
  });
  document.querySelectorAll('[data-wanthave]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      wantGotIt(btn.dataset.wanthave);
    });
  });
  wireWantsSelection();
  document.querySelectorAll('[data-playing-ci]').forEach((tile) => {
    tile.addEventListener('click', () =>
      openCollectionCard(
        Number(tile.dataset.playingCi),
        Array.from(document.querySelectorAll('[data-playing-ci]')).map((item) =>
          Number(item.dataset.playingCi),
        ),
      ),
    );
  });
  // The top box searches WHAT YOU OWN — the whole collection, or just the
  // open binder (the filter chain already scopes by binder). Instant while
  // typing; adding cards moved to the ＋ button.
  {
    const colQ = document.getElementById('colSearchQ');
    let cqT = null;
    const applyColQ = () => {
      state.colFilter.q = colQ ? colQ.value : '';
      const y = pageScroller().scrollTop;
      render();
      pageScroller().scrollTo(0, y);
      const el = document.getElementById('colSearchQ');
      if (el) {
        el.focus();
        const v = el.value;
        el.value = '';
        el.value = v;
      }
    };
    colQ?.addEventListener('input', () => {
      clearTimeout(cqT);
      cqT = setTimeout(applyColQ, 300);
    });
    colQ?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(cqT);
        applyColQ();
      }
    });
  }

  // Long-press selects a card; once anything is selected, every further tap
  // (long or short) toggles selection instead of opening the card. The last
  // deselection exits selection mode. Wants tiles keep their own handler.
  // Toggling mutates the DOM in place — a full re-render per tap made
  // selection visibly lag behind the finger.
  // The selection counts CARDS (quantities summed), matching the header's
  // "N cards" — a ×2 stack selected counts as 2, not 1.
  const colSelQty = collectionSelectedQuantity;
  const wireColSelFab = (fab) => {
    fab.addEventListener('click', (e) => {
      const anchor = e.currentTarget;
      if (!state.colSel || !state.colSel.size) return;
      openColSelMenu(anchor);
    });
  };
  const updateColSelFab = () => {
    let fab = document.getElementById('colSelFab');
    const n = state.colSel ? state.colSel.size : 0;
    if (!n) {
      fab?.remove();
      return;
    }
    if (!fab) {
      fab = document.createElement('button');
      fab.className = 'deck-fab col-sel-fab';
      fab.id = 'colSelFab';
      fab.title = 'Selected cards';
      (document.querySelector('main') || document.body).appendChild(fab);
      wireColSelFab(fab);
    }
    fab.innerHTML = selFabLabel(colSelQty(), true);
  };
  const colToggleSel = (ci, tile) => {
    if (!state.colSel) state.colSel = new Set();
    const on = !state.colSel.has(ci);
    if (on) state.colSel.add(ci);
    else state.colSel.delete(ci);
    if (!state.colSel.size) state.colSel = null;
    if (tile) {
      tile.classList.toggle('csel', on);
      const mark = tile.querySelector('.csel-mark');
      if (on && !mark) {
        const m = document.createElement('span');
        m.className = 'csel-mark';
        m.textContent = '✓';
        tile.appendChild(m);
      }
      if (!on && mark) mark.remove();
    }
    updateColSelFab();
  };
  document.querySelectorAll('.col-tile').forEach((tile) => {
    if (tile.dataset.ci == null) return;
    const ci = +tile.dataset.ci;
    let lpT = null,
      lpFired = false;
    const arm = () => {
      lpFired = false;
      clearTimeout(lpT);
      lpT = setTimeout(() => {
        lpFired = true;
        try {
          navigator.vibrate && navigator.vibrate(8);
        } catch (e) {}
        colToggleSel(ci, tile);
      }, 480);
    };
    const disarm = () => clearTimeout(lpT);
    tile.addEventListener('pointerdown', arm);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
      tile.addEventListener(ev, disarm),
    );
    tile.addEventListener('contextmenu', (e) => e.preventDefault());
    tile.addEventListener('click', (e) => {
      if (lpFired) {
        lpFired = false;
        e.preventDefault();
        return;
      }
      if (state.colSel && state.colSel.size) {
        colToggleSel(ci, tile);
        return;
      }
      // Hand over the grid's rendered order so the card page's chevrons and
      // swipe gestures sail through it copy by copy.
      openCollectionCard(
        ci,
        Array.from(document.querySelectorAll('.col-tile[data-ci]'))
          .filter((t) => !t.closest('.col-group[hidden]'))
          .map((t) => +t.dataset.ci),
      );
    });
  });
  const sf = document.getElementById('colSelFab');
  if (sf) wireColSelFab(sf);
  function openColSelMenu(anchor) {
    const n = colSelQty();
    openFabMenu(
      [
        {
          label: `<span class="ib">${ICONS.selectAll}</span>` + trS('Select all'),
          fn: () => {
            state.colSel = new Set(
              Array.from(document.querySelectorAll('.col-tile[data-ci]')).map((t) => +t.dataset.ci),
            );
            const y = pageScroller().scrollTop;
            render();
            pageScroller().scrollTo(0, y);
          },
        },
        {
          label: mIco('folder') + trS('Move to binder…'),
          fn: () => {
            openBindersPop(
              anchor,
              (bid) => {
                collectionSelectedRows().forEach(({ item, qty }) =>
                  collectionMoveCopies(item, qty, bid),
                );
                state.colSel = null;
                saveCollection();
                toast(trS('Moved.'));
                render();
              },
              false,
            );
          },
        },
        {
          label: mIco('trash') + trS('Remove from collection'),
          danger: true,
          fn: () => {
            const q = 'Remove ' + n + ' card' + (n === 1 ? '' : 's') + ' from your collection?';
            openInAppConfirm(
              q,
              (ok) => {
                if (!ok) return;
                const removed = new Set();
                collectionSelectedRows().forEach(({ item, qty }) => {
                  item.qty = Math.max(0, Number(item.qty ?? 1) - qty);
                  if (!item.qty) removed.add(item);
                });
                state.collection.items = state.collection.items.filter(
                  (item) => !removed.has(item),
                );
                state.colSel = null;
                saveCollection();
                render();
              },
              { danger: true, ok: trS('Delete') },
            );
          },
        },
        {
          label: `<span class="ib">${ICONS.close}</span>` + trS('Deselect all'),
          fn: () => colSelClear(),
        },
      ],
      anchor,
      { label: 'Selected cards', closeLabel: 'Close selection menu' },
    );
  }
}

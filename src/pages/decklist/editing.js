// pages / decklist / editing

/* ---- Redraw without the page moving under the thumb -------------------
   Replacing a list's markup changes its height, and in a bottom-anchored
   page that height change lands entirely above the viewport -- which reads
   as the page jumping to the top. Measure where the element the person
   touched sat, redraw, find it again, and give the scroll back exactly the
   difference. The tapped heading stays put; the list grows around it. */
function scrollParentOf(el) {
  let p = el && el.parentElement;
  while (p && p !== document.body) {
    // a floating Extras fold scrolls on its own, never the page behind it
    if (p.classList && p.classList.contains('xt-body') && p.closest('main.xt-tiles')) return p;
    const cs = getComputedStyle(p);
    if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) return p;
    p = p.parentElement;
  }
  return pageScroller();
}

function keepAnchored(anchorEl, redraw, findAgain) {
  let before = 0;
  try {
    before = anchorEl.getBoundingClientRect().top;
  } catch (e) {}
  redraw();
  let again = null;
  try {
    again = findAgain ? findAgain() : null;
  } catch (e) {}
  if (!again) return;
  // The scroller has to be found on the NEW element: a redraw that replaces
  // the markup leaves the old one detached, and correcting a detached node's
  // scrollTop moves nothing -- which is why the filter sheet kept jumping
  // while the pages that scroll as a whole behaved.
  const sc = scrollParentOf(again);
  if (!sc) return;
  const shift = again.getBoundingClientRect().top - before;
  if (Math.abs(shift) > 0.5) sc.scrollTop += shift;
}

function refreshDecklistBox(d) {
  const box = document.getElementById('decklistBox');
  const se = pageScroller();
  const fromTop = se.scrollTop;
  if (box) {
    box.innerHTML = categorizedListHtml(d);
    wireDecklistInteractions(d);
  }
  if (box && state.screen === 'decklist') {
    const want = fromTop;
    if (Math.abs(se.scrollTop - want) > 1) se.scrollTop = want;
  }
  updateDeckMeter(d); // the dock's Main x/y and Maybe counts follow every refresh
  updateDeckMeter(d);
}

/* The command zone in the deck header: first leader, then either the second
   leader or — when the first one's ability allows a pairing — a big + that
   opens the partner picker. */
function leaderZoneHtml(d) {
  // The 60s have no leader: the seat shows the format and its numbers.
  if (deckIsConstructed(d)) {
    const side = ensureMaybeboard(d).length;
    return /* HTML */ `<div class="dl-adm-empty dl-fmt-seat">
      <span style="color:var(--brass);">${cardsSvg(30)}</span><br /><b
        >${fmtLabelOf(deckFormat(d))}</b
      ><br />${(d.cards || []).length}/60 · ${trS('Sideboard')} ${side}/15
    </div>`;
  }
  if (!d.admiral)
    return /* HTML */ `<div class="dl-adm-empty" id="findCommanderBtn">
      ${deckFormat(d) === 'commander' ? '⚔' : anchorSvg(26)}<br />No ${fmtName(d)} appointed.<br />Tap
      to find one.
    </div>`;
  const A = pairAbility(d.admiral);
  let inner = cardTileHtml(d.admiral, -1, 'admiral');
  if (!d.partner && A)
    inner += `<button class="pair-add" id="pairAddBtn" title="Add a second ${fmtName(d)} — ${escapeHtml(A.label)}">+</button>`;
  if (!d.partner) return /* HTML */ `<div class="leader-wrap">${inner}</div>`;
  // Two seats: the second card overlaps the first diagonally, so the command
  // zone stays compact — the first card's name band remains visible and
  // tappable above the overlap.
  return /* HTML */ `<div class="leader-stack">
    <div class="leader-wrap">${inner}</div>
    <div class="leader-wrap leader-overlap">${cardTileHtml(d.partner, -1, 'partner')}</div>
  </div>`;
}

function setPartner(d, c) {
  // A copy already sitting in the deck is the one promoted to the second seat.
  const dupIdx = d.cards.findIndex((x) => x.name === c.name);
  if (dupIdx >= 0) d.cards.splice(dupIdx, 1);
  d.partner = c;
  logDeckChange(d, { type: 'add', name: c.name, card: c });
  state.inspireCache = {};
  scheduleSave(d);
  toast(`${c.name} joins ${d.admiral ? d.admiral.name : 'the deck'} in command.`);
}

function removePartner(d) {
  if (!d.partner) return;
  const p = d.partner;
  d.partner = null;
  if (!d.cards.some((x) => x.name === p.name) || allowsDuplicates(p)) {
    d.cards.push(p);
    logDeckChange(d, { type: 'add', name: p.name, card: p });
    toast(`${p.name} steps down into the deck.`);
  } else {
    logDeckChange(d, { type: 'remove', name: p.name, card: p });
    toast(`${p.name} steps down — a copy was already in the deck.`);
  }
  state.inspireCache = {};
  scheduleSave(d);
}

/* Partner picker: opens pre-filled with every leader that can legally share
   command with the sitting one; typing narrows the list by name. */
function openPartnerSearch(d, onDone, opts) {
  opts = opts || {};
  if (!d.admiral || !pairAbility(d.admiral)) return;
  document.getElementById('appointOverlay')?.remove();
  const label = fmtName(d);
  const A = pairAbility(d.admiral);
  const el = document.createElement('div');
  el.id = 'appointOverlay';
  el.innerHTML = /* HTML */ ` <div class="appoint-sheet">
    <div class="appoint-head">
      <span
        >${deckFormat(d) === 'commander' ? '⚔' : anchorSvg(14)} Second ${escapeHtml(label)} —
        ${escapeHtml(A.label)}</span
      ><button class="icon-btn" id="appointClose" style="flex:none;">${ICONS.close || '✕'}</button>
    </div>
    <div class="searchbar" style="margin:0 0 10px;">
      <input
        id="appointInput"
        placeholder="Filter eligible pairings…"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
      />
    </div>
    ${opts.skippable ? `<button class="ghost-btn" id="pairSkipBtn" style="width:100%;margin:0 0 10px;">Continue without a second ${escapeHtml(label)} →</button>` : ''}
    <div id="appointResults" class="appoint-results">
      <div class="status">
        <div class="spinner"></div>
        Finding who can share command…
      </div>
    </div>
  </div>`;
  document.body.appendChild(el);
  pushOverlay('appoint', () => {
    document.getElementById('appointOverlay')?.remove();
  });
  el.addEventListener('click', (e) => {
    if (!e.target.closest('.appoint-sheet')) closeTopOverlay();
  });
  document.getElementById('appointClose').addEventListener('click', () => closeTopOverlay());
  document.getElementById('pairSkipBtn')?.addEventListener('click', () => {
    closeOverlayThen(() => {
      if (opts.onSkip) opts.onSkip();
    });
  });
  const input = document.getElementById('appointInput');
  let pool = null;
  const draw = () => {
    const box = document.getElementById('appointResults');
    if (!box) return;
    if (pool === null) {
      box.innerHTML = /* HTML */ `<div class="status">
        <div class="spinner"></div>
        Finding who can share command…
      </div>`;
      return;
    }
    const q = (input.value || '').trim().toLowerCase();
    const list = pool.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 40);
    if (!list.length) {
      box.innerHTML = /* HTML */ `<div class="empty-note" style="padding:14px 4px;">
        No eligible pairing${q ? ` matches “${escapeHtml(q)}”` : ' found'}.
      </div>`;
      return;
    }
    box.innerHTML = list
      .map(
        (c, i) => `
      <button class="appoint-row" data-idx="${i}">
        <img loading="lazy" class="${wbClass(c)}" src="${cardImageMed(c) || cardImage(c)}" alt="">
        <div class="appoint-row-txt"><div class="ar-name">${escapeHtml(c.name)}</div><div class="ar-type">${escapeHtml(frontFace(c).type_line || '')}</div></div>
        <span class="ar-set">Pair ▸</span>
      </button>`,
      )
      .join('');
    box.querySelectorAll('.appoint-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = list[+btn.dataset.idx];
        if (!c) return;
        if (onDone) {
          closeOverlayThen(() => onDone(c));
          return;
        }
        setPartner(d, c);
        closeTopOverlay();
        render();
      });
    });
  };
  (async () => {
    const clause = pairSearchClause(d.admiral);
    let results = [];
    if (clause) {
      try {
        const r = await searchAndVerifyLegal(clause, 'edhrec', 300);
        results = r.results || [];
      } catch (e) {}
    }
    pool = results.filter((c) => partnerEligible(d, c));
    draw();
  })();
  input.addEventListener('input', draw);
}

function wireDecklistInteractions(d) {
  document.getElementById('dlEmptyAdd')?.addEventListener('click', () => openAddCardsFor(d));
  document.getElementById('pairAddBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openPartnerSearch(d);
  });
  document.getElementById('findCommanderBtn')?.addEventListener('click', () => {
    openAppointSearch(d);
  });
  document.querySelectorAll('.cat-head').forEach((h) => {
    h.addEventListener('click', () => {
      const key = h.dataset.cat;
      // The heading you tapped keeps its exact place on screen; the section
      // opens around it, upward, instead of the page jumping to the top.
      keepAnchored(
        h,
        () => {
          state.collapsed[key] = !state.collapsed[key];
          refreshDecklistBox(d);
        },
        () => {
          try {
            return document.querySelector('.cat-head[data-cat="' + CSS.escape(key) + '"]');
          } catch (e) {
            return null;
          }
        },
      );
    });
  });
  // LONG-PRESS a card = start multi-select; short taps then toggle more.
  // Main-deck and maybeboard cards select; leaders stay out of it.
  document.querySelectorAll('.vg-card img, .vg-card .vg-hit').forEach((img) => {
    const parent = img.closest('[data-idx]');
    if (!parent) return;
    const idx = +parent.dataset.idx;
    const loc = parent.dataset.loc;
    const key = loc + ':' + idx;
    let lpT = null,
      lpFired = false;
    const selectable = loc === 'main' || loc === 'maybe';
    if (selectable) {
      const arm = () => {
        lpFired = false;
        clearTimeout(lpT);
        lpT = setTimeout(() => {
          lpFired = true;
          try {
            navigator.vibrate && navigator.vibrate(8);
          } catch (err) {}
          dlSelToggle(d, key, parent);
        }, 480);
      };
      const disarm = () => clearTimeout(lpT);
      parent.addEventListener('pointerdown', arm);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
        parent.addEventListener(ev, disarm),
      );
      parent.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    img.addEventListener('click', () => {
      if (lpFired) {
        lpFired = false;
        return;
      }
      if (state._dlSel) {
        if (selectable) dlSelToggle(d, key, parent);
        return;
      }
      const card =
        loc === 'admiral'
          ? d.admiral
          : loc === 'partner'
            ? d.partner
            : loc === 'maybe'
              ? d.maybeboard[idx]
              : d.cards[idx];
      openCardActionSheet(d, card, loc, idx);
    });
    if (state._dlSel && state._dlSel.has(key)) parent.classList.add('dl-msel');
  });
}

function dlSelToggle(d, key, tile) {
  if (!state._dlSel) state._dlSel = new Set();
  if (state._dlSel.has(key)) {
    state._dlSel.delete(key);
    tile.classList.remove('dl-msel');
  } else {
    state._dlSel.add(key);
    tile.classList.add('dl-msel');
  }
  if (!state._dlSel.size) state._dlSel = null;
  const dd = getDeck(state.activeDeckId);
  if (dd) updateDeckMeter(dd);
}

function dlSelApply(d, mode) {
  const es = Array.from(state._dlSel || []).map((k) => {
    const [loc, i] = k.split(':');
    return { loc, idx: parseInt(i, 10) };
  });
  if (mode === 'maybe') {
    ensureMaybeboard(d);
    es.filter((e) => e.loc === 'main')
      .sort((a, b) => b.idx - a.idx)
      .forEach((e) => {
        const [c] = d.cards.splice(e.idx, 1);
        if (c) d.maybeboard.push(c);
      });
  } else if (mode === 'main') {
    ensureMaybeboard(d);
    const moved = [];
    es.filter((e) => e.loc === 'maybe')
      .sort((a, b) => b.idx - a.idx)
      .forEach((e) => {
        const [c] = d.maybeboard.splice(e.idx, 1);
        if (c) {
          d.cards.push(c);
          moved.push(c);
        }
      });
    if (moved.length) budgetNoteAdded(d, moved, 'toMain');
  } else {
    es.filter((e) => e.loc === 'main')
      .sort((a, b) => b.idx - a.idx)
      .forEach((e) => d.cards.splice(e.idx, 1));
    es.filter((e) => e.loc === 'maybe')
      .sort((a, b) => b.idx - a.idx)
      .forEach((e) => d.maybeboard.splice(e.idx, 1));
  }
  state._dlSel = null;
  scheduleSave(d);
  render();
}

function updateDeckMeter(d) {
  const row = document.getElementById('deckMeterRow');
  if (row) {
    row.outerHTML = deckMeterHtml(d);
    wireMeterRow(d);
  }
  refreshLegality(d);
}

function refreshLegality(d) {
  const wrap = document.getElementById('legalityWrap');
  if (wrap) wrap.innerHTML = legalityHtml(d);
  refreshCapDeckCount(d);
}

/* The count in the top page cap follows every add, cut and maybeboard move
   live: same math as the initial render, patched into the span in place.
   Riding refreshLegality means every path that refreshes the deck's
   legality line (all card mutations) refreshes the cap for free. */
function refreshCapDeckCount(d) {
  try {
    const el = document.getElementById('capDeckCount');
    if (!el || state.screen !== 'decklist') return;
    const dd = d && d.id === state.activeDeckId ? d : getDeck(state.activeDeckId);
    if (!dd) return;
    const issues = checkDeckLegality(dd);
    el.style.color = deckCountColor(deckCountState(dd, issues));
    el.textContent = deckCountLabel(dd) + (issues.length ? ' \u26A0' : '');
  } catch (err) {}
}

/* Type counts wider than their strip (8 types, a big system font): the
   counts step down a pixel at a time until they fit, never below 9px;
   anything still left over scrolls sideways. */
function fitDockTypes() {
  const strip = document.querySelector('#deckMeterRow .dk-mid');
  const items = strip ? Array.from(strip.querySelectorAll('.dk-type')) : [];
  if (!items.length) return;
  let fs = parseFloat(getComputedStyle(items[0]).fontSize) || 13,
    n = 0;
  while (strip.scrollWidth > strip.clientWidth + 1 && fs > 9 && n++ < 10) {
    fs -= 1;
    items.forEach((b) => {
      b.style.fontSize = fs + 'px';
    });
  }
}

function wireMeterRow(d) {
  // 1.45 desk: the Menu drops down right under its own button
  if (isDesk())
    requestAnimationFrame(() => {
      const mp = document.querySelector('#deckMeterRow .menu-pop'),
        mb = document.getElementById('menuBtn');
      if (mp && mb) {
        mp.style.left = mb.offsetLeft + 'px';
        mp.style.right = 'auto';
        mp.style.top = mb.offsetTop + mb.offsetHeight + 6 + 'px';
      }
    });
  try {
    document.body.classList.toggle(
      'dl-searching',
      !!state.dlSearchOpen && state.screen === 'decklist',
    );
  } catch (e) {}
  try {
    fitDockTypes();
    requestAnimationFrame(fitDockTypes);
  } catch (e) {}
  document.getElementById('menuBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.menuOpen) {
      popDeckMenu();
    } else {
      state.menuOpen = true;
      pushOverlay('deckMenu', () => {
        state.menuOpen = false;
        try {
          const dd = getDeck(state.activeDeckId);
          if (dd) updateDeckMeter(dd);
        } catch (err) {}
      });
    }
    updateDeckMeter(d);
  });
  // The tools bar: every button opens what its bridge ancestor used to.
  document
    .querySelectorAll('#deckMeterRow [data-panel]')
    .forEach((b) => b.addEventListener('click', () => toggleDlPanel(d, b.dataset.panel)));
  // The jump menu: one square tool left of the chevron (it used to float
  // round over the list). From Stats or Deck Log it first goes to the list.
  document.getElementById('dlCatJump')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const anchor = e.currentTarget;
    const open = () => {
      const heads = Array.from(document.querySelectorAll('.cat-group > .cat-head'));
      const items = heads
        .map((h) => {
          const t = h.querySelector('.t');
          // 1.40: a folded section (the Maybeboard starts folded) opens first,
          // then its name lands at the foot with its cards above it
          return {
            label: t ? t.textContent.trim() : '—',
            fn: () => {
              const key = h.dataset.cat;
              const go = () => {
                let nh = null;
                try {
                  nh = document.querySelector('.cat-head[data-cat="' + CSS.escape(key) + '"]');
                } catch (e) {}
                (nh || h).scrollIntoView({ behavior: 'smooth', block: 'end' });
              };
              if (key && state.collapsed[key]) {
                state.collapsed[key] = false;
                refreshDecklistBox(d);
                requestAnimationFrame(() => requestAnimationFrame(go));
              } else go();
            },
          };
        })
        .filter((x) => x.label && x.label !== '—');
      // The menu mirrors the page: the deck reads bottom-up, so the list
      // flips — Creatures at the menu's foot, Maybeboard at its head.
      items.reverse();
      if (items.length) openTileMenu(document.getElementById('dlCatJump') || anchor, items);
    };
    if (state.builderTab !== 'list') {
      state.builderTab = 'list';
      state.dlPanel = null;
      try {
        renderBuilderBody(d);
        syncTabsUI();
      } catch (err) {}
      requestAnimationFrame(open);
      return;
    }
    open();
  });
  document.getElementById('dockInspire')?.addEventListener('click', () => {
    state.inspireDeckId = d.id;
    switchPage('inspiration');
  });
  document.getElementById('dockAddCards')?.addEventListener('click', () => openAddCardsFor(d));
  document.querySelectorAll('.dk-type').forEach((b) =>
    b.addEventListener('click', () => {
      // A tap on a type count JUMPS to that category and names it — the map
      // also repairs the old "Sorcerys" toast.
      const names = {
        Creatures: 'Creatures',
        Instants: 'Instants',
        Sorcerys: 'Sorceries',
        Artifacts: 'Artifacts',
        Enchantments: 'Enchantments',
        Planeswalkers: 'Planeswalkers',
        Battles: 'Battles',
        Lands: 'Lands',
      };
      const want = names[b.dataset.tt] || b.dataset.tt;
      const heads = Array.from(document.querySelectorAll('.cat-group > .cat-head'));
      const hit = heads.find((h) => {
        const t = h.querySelector('.t');
        return t && t.textContent.trim().toLowerCase().startsWith(want.toLowerCase());
      });
      if (hit) hit.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(want);
    }),
  );
  // The loupe opens the find bar (cursor in it at once); tapped again it
  // closes the bar -- and the full filter with it.
  document.getElementById('dockSearchBtn')?.addEventListener('click', () => {
    if (state.dlSearchOpen) {
      closeNameSuggest();
      if (state.dlPanel === 'dsearch') toggleDlPanel(d, 'dsearch');
      state.dlFilter = { ci: [] };
      state.dlFilterOn = false;
      state.dlSearchOpen = false;
      state.dlSearchQ = '';
      updateDeckMeter(d);
      refreshDecklistBox(d);
      scrollToPageFoot();
      return;
    }
    if (state.builderTab !== 'list') {
      state.builderTab = 'list';
      state.dlPanel = null;
      try {
        renderBuilderBody(d);
        syncTabsUI();
      } catch (err) {}
    }
    if (state.dlPanel && state.dlPanel !== 'dsearch') {
      try {
        toggleDlPanel(d, state.dlPanel);
      } catch (err) {}
    }
    state.dlSearchOpen = true;
    refreshDecklistBox(d);
    state._dlSearchFocus = true;
    updateDeckMeter(d); // last: it puts the cursor in the new bar
    scrollToPageFoot();
  });
  document.getElementById('dockFilterChev')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeNameSuggest();
    // 1.35: the keyboard goes down ONCE, before the panel opens; once it is
    // gone the page settles on its foot again.
    try {
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
    } catch (err) {}
    toggleDlPanel(d, 'dsearch');
    const ch = document.getElementById('dockFilterChev');
    if (ch) ch.textContent = state.dlPanel === 'dsearch' ? '▴' : '▾';
    if (state.dlPanel === 'dsearch')
      setTimeout(() => {
        try {
          scrollToPageFoot();
        } catch (err) {}
      }, 380);
  });
  {
    const dsi = document.getElementById('dockSearchInput');
    if (dsi) {
      // Filter AS YOU TYPE: only the list body repaints, so the input (and
      // the phone keyboard) stay exactly where they are.
      dsi.addEventListener('input', () => {
        state.dlSearchQ = dsi.value;
        const box = document.getElementById('decklistBox');
        if (box) {
          box.innerHTML = categorizedListHtml(d);
          wireDecklistInteractions(d);
        }
        scrollToPageFoot();
      });
      dsi.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          try {
            dsi.blur();
          } catch (err) {}
        }
      });
      if (state._dlSearchFocus) {
        state._dlSearchFocus = false;
        requestAnimationFrame(() => {
          try {
            dsi.focus();
            dsi.setSelectionRange(dsi.value.length, dsi.value.length);
          } catch (e) {}
        });
      }
    }
  }
  document.getElementById('dockNext')?.addEventListener('click', () => {
    state.dockSet = ((state.dockSet || 0) + 1) % 2;
    updateDeckMeter(d);
  });
  document.getElementById('dlSelX')?.addEventListener('click', () => dlSelClear());
  const selN = () => (state._dlSel ? state._dlSel.size : 0);
  // 1.40: no hidden menu -- the binder adds to the collection, the
  // maybeboard button moves the picks (deck cards to the maybeboard; a
  // pick of maybeboard cards only goes to the deck)
  document
    .getElementById('dlSelColl')
    ?.addEventListener('click', () => openAddManyToCollection(dlSelCards(d), () => dlSelClear()));
  document.getElementById('dlSelMaybe')?.addEventListener('click', () => {
    const keys = Array.from(state._dlSel || []);
    dlSelApply(d, keys.some((k) => k.startsWith('main:')) ? 'maybe' : 'main');
  });
  document.getElementById('dlSelDel')?.addEventListener('click', () =>
    openInAppConfirm(`Delete ${selN()} card${selN() === 1 ? '' : 's'} from the deck?`, (ok) => {
      if (ok) dlSelApply(d, 'del');
    }),
  );
  // Bracket chip: refine with 2-card combos when the fast lane answers
  (async () => {
    try {
      const chip = document.getElementById('dlBracket');
      if (!chip) return;
      const ix = await combosReady();
      const names = new Set(
        d.cards
          .map((c) => String(c.name).toLowerCase())
          .concat(deckLeaders(d).map((c) => String(c.name).toLowerCase())),
      );
      const c2 = (combosInNames(ix, names) || []).filter(
        (c) => c.nm.length === 2 && comboEndsGames(c),
      ).length;
      const e = bracketEstimate(d, c2);
      chip.textContent = `⚔ Bracket ~${e.b} · ${e.gc} GC`;
    } catch (err) {}
  })();
  document.getElementById('dockMainCount')?.addEventListener('click', () => {
    state.dockCount = state.dockCount === 'maybe' ? 'main' : 'maybe';
    updateDeckMeter(d);
  });
  if (state.menuOpen) wireMenu(d);
}

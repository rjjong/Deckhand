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
    wireDecklistInteractions(d, box);
  }
  if (box && state.screen === 'decklist') {
    const want = fromTop;
    if (Math.abs(se.scrollTop - want) > 1) se.scrollTop = want;
  }
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

function wireDecklistInteractions(d, root = document) {
  root.querySelector('#dlEmptyAdd')?.addEventListener('click', () => openAddCardsFor(d));
  root.querySelector('#pairAddBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openPartnerSearch(d);
  });
  root.querySelector('#findCommanderBtn')?.addEventListener('click', () => {
    openAppointSearch(d);
  });
  root.querySelectorAll('.cat-head').forEach((h) => {
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
  root.querySelectorAll('.vg-card img, .vg-card .vg-hit').forEach((img) => {
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
  refreshCapPrice();
}

function refreshLegality(d) {
  const wrap = document.getElementById('legalityWrap');
  if (wrap) wrap.innerHTML = legalityHtml(d);
  refreshCapDeckCount(d);
}

/* Keep overview counts and legality in sync with card edits. */
function refreshCapDeckCount(d) {
  if (state.screen !== 'decklist') return;
  const deck = d?.id === state.activeDeckId ? d : getDeck(state.activeDeckId);
  if (!deck) return;
  const value = document.getElementById('deckCardCountValue');
  if (value) value.textContent = deckSummaryCount(deck);
  const issues = checkDeckLegality(deck);
  const status = document.getElementById('deckLegalityStatus');
  if (status) {
    status.textContent = issues.length
      ? `${issues.length} issue${issues.length === 1 ? '' : 's'} · Review`
      : 'Legal deck · Review';
    status.classList.toggle('needs-review', !!issues.length);
  }
  const hint = document.getElementById('deckCountHint');
  if (hint)
    hint.textContent = deckIsConstructed(deck)
      ? `${ensureMaybeboard(deck).length} in sideboard`
      : 'Including commander';
  const issue = document.getElementById('deckIssueText');
  if (issue)
    issue.textContent = issues[0]?.text || issues[0]?.label || 'No deck-building issues found.';
  document
    .getElementById('capDeckCount')
    ?.setAttribute('aria-expanded', String(!!state.legalityOpen));
  document
    .getElementById('deckReview')
    ?.setAttribute('aria-expanded', String(!!state.legalityOpen));
}

function wireMeterRow(d) {
  const input = document.getElementById('dockSearchInput');
  input?.addEventListener('input', () => {
    state.dlSearchQ = input.value;
    state.dlSearchOpen = true;
    showDeckList(d);
    const box = document.getElementById('decklistBox');
    if (box) {
      box.innerHTML = categorizedListHtml(d);
      wireDecklistInteractions(d, box);
      box.scrollIntoView({ block: 'start' });
    }
    const clear = document.getElementById('dockSearchBtn');
    if (clear) clear.hidden = !state.dlSearchQ && !state.dlFilterOn;
  });
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });
  document.getElementById('dockSearchBtn')?.addEventListener('click', () => {
    closeNameSuggest();
    state.dlSearchQ = '';
    state.dlSearchOpen = false;
    state.dlFilter = { ci: [] };
    state.dlFilterOn = false;
    if (state.dlPanel === 'dsearch') toggleDlPanel(d, 'dsearch');
    refreshDecklistBox(d);
    document.getElementById('dockSearchInput')?.focus();
  });
  document.getElementById('dockFilterChev')?.addEventListener('click', () => {
    document.activeElement?.blur?.();
    closeNameSuggest();
    state.dlSearchOpen = true;
    toggleDlPanel(d, 'dsearch');
    document
      .getElementById('dockFilterChev')
      ?.setAttribute('aria-expanded', String(state.dlPanel === 'dsearch'));
  });
  document.getElementById('dlSelX')?.addEventListener('click', dlSelClear);
  document
    .getElementById('dlSelColl')
    ?.addEventListener('click', () => openAddManyToCollection(dlSelCards(d), () => dlSelClear()));
  document.getElementById('dlSelMaybe')?.addEventListener('click', () => {
    const toSide = [...(state._dlSel || [])].some((key) => key.startsWith('main:'));
    dlSelApply(d, toSide ? 'maybe' : 'main');
  });
  document.getElementById('dlSelDel')?.addEventListener('click', () => {
    const n = state._dlSel?.size || 0;
    openInAppConfirm(
      `Remove ${n} card${n === 1 ? '' : 's'} from the deck?`,
      (ok) => {
        if (ok) dlSelApply(d, 'del');
      },
      { title: 'Remove cards', danger: true, ok: 'Remove' },
    );
  });
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
}

// app / navigation

/* ---------- Swipe navigation across the main pages ----------
   Drag left-to-right to move one page left, right-to-left to move right:
   Home · My Decks · Search · Inspiration · Extras. Deliberately strict —
   a clearly horizontal, decisive swipe only — so vertical scrolling, grids,
   dropdowns and controls are never hijacked. */
const PAGE_STRIP = ['decks', 'collection', 'search', 'browse', 'life'];

// My Collection lives under My Stuff, so it rides the strip at the 'decks'
// position — swiping there works like My Stuff, and swiping back returns to
// My Stuff rather than the collection.
const stripScreen = (s) => (s === 'trade' ? 'collection' : s);

(function () {
  return; // v2.51.530: page-swipe navigation removed per request -- the
  // nav bar is the way between pages; no gesture ever hijacks a
  // scroll or a drop-up again. Card-sheet swiping is untouched.
  /* Launcher-style page strip: once a horizontal drag is unmistakable, the
     current page follows the finger and the destination page rides in beside
     it as a live, unwired preview. Release past a third of the screen (in
     the drag's own direction) commits — the pair glides home, the real page
     renders, and the ladder starts fresh exactly as a top-bar tap would.
     Release short of that snaps everything back. At the strip's edge the
     page rubber-bands with no neighbor shown. */
  let sx = null,
    sy = null,
    ok = false,
    engaged = false,
    dir = 0;
  let pane = null,
    appEl = null,
    W = 1,
    curDx = 0;
  const neighborOf = (d) => {
    const idx = PAGE_STRIP.indexOf(stripScreen(state.screen));
    const n = d > 0 ? idx - 1 : idx + 1; // L→R drag = page to the LEFT
    return idx === -1 || n < 0 || n >= PAGE_STRIP.length ? null : PAGE_STRIP[n];
  };
  function engage(d) {
    engaged = true;
    dir = d;
    curDx = 0;
    appEl = document.querySelector('.app');
    W = window.innerWidth || 360;
    document.documentElement.style.overflowX = 'hidden';
    if (appEl) {
      appEl.style.willChange = 'transform';
      appEl.style.transition = 'none';
    }
    const tgt = neighborOf(d);
    pane = null;
    if (tgt) {
      pane = document.createElement('div');
      pane.className = 'swipe-pane';
      const inner = document.createElement('div');
      inner.className = 'app';
      const navEl = appEl && appEl.firstElementChild;
      if (navEl) inner.appendChild(navEl.cloneNode(true));
      try {
        inner.insertAdjacentHTML('beforeend', pageBodyHtml(tgt));
      } catch (e) {}
      pane.appendChild(inner);
      pane.style.transform = `translateX(${d > 0 ? -W : W}px)`;
      document.body.appendChild(pane);
    }
  }
  function moveTo(dx) {
    curDx = dx;
    const x = dx * (pane ? 1 : 0.28); // rubber-band at the strip's edge
    if (appEl) appEl.style.transform = `translateX(${x}px)`;
    if (pane) pane.style.transform = `translateX(${(dir > 0 ? -W : W) + x}px)`;
  }
  function cleanup() {
    const a = document.querySelector('.app');
    [a, appEl].forEach((el) => {
      if (el) {
        el.style.transition = '';
        el.style.transform = '';
        el.style.willChange = '';
      }
    });
    if (pane) {
      pane.remove();
      pane = null;
    }
    document.documentElement.style.overflowX = '';
    engaged = false;
    dir = 0;
    appEl = null;
    curDx = 0;
  }
  function finish(commit) {
    const tgt = neighborOf(dir);
    if (commit && tgt && pane) {
      const dur = 190;
      if (appEl) {
        appEl.style.transition = `transform ${dur}ms cubic-bezier(.22,.9,.3,1)`;
        appEl.style.transform = `translateX(${dir > 0 ? W : -W}px)`;
      }
      pane.style.transition = `transform ${dur}ms cubic-bezier(.22,.9,.3,1)`;
      pane.style.transform = 'translateX(0)';
      try {
        navigator.vibrate && navigator.vibrate(8);
      } catch (err) {}
      setTimeout(() => {
        switchPage(tgt, true); // a swipe between main pages starts a fresh ladder, like the top bar
        setTimeout(scrollToPageFoot, 220); // late content (covers, prices) can lift the foot — re-pin once settled
        cleanup();
      }, dur);
    } else {
      if (appEl) {
        appEl.style.transition = 'transform 160ms ease-out';
        appEl.style.transform = 'translateX(0)';
      }
      if (pane) {
        pane.style.transition = 'transform 160ms ease-out';
        pane.style.transform = `translateX(${dir > 0 ? -W : W}px)`;
      }
      setTimeout(cleanup, 180);
    }
  }
  document.addEventListener(
    'touchstart',
    (e) => {
      ok = false;
      sx = null;
      if (engaged) return;
      if (!PAGE_STRIP.includes(stripScreen(state.screen))) return;
      if (state.overlayStack.length) return; // card views, life tracker…
      if (document.querySelector('.deckpick-scrim')) return; // popups
      if (state.openCSelect || document.getElementById('tileMenuPop')) return;
      if (
        e.target.closest &&
        e.target.closest('input,textarea,select,.toggle-switch,.cselect,.pr-track')
      )
        return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      ok = true;
    },
    { passive: true },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!ok || sx === null) return;
      const t = e.touches[0];
      const dx = t.clientX - sx,
        dy = t.clientY - sy;
      if (!engaged) {
        if (Math.abs(dy) > 34 && Math.abs(dy) > Math.abs(dx)) {
          ok = false;
          return;
        } // vertical intent: scrolling wins
        if (Math.abs(dx) > 26 && Math.abs(dx) > 1.6 * Math.abs(dy)) engage(dx > 0 ? 1 : -1);
        else return;
      }
      e.preventDefault(); // the strip owns this gesture now
      moveTo(dx);
    },
    { passive: false },
  );
  const end = () => {
    if (!engaged) {
      ok = false;
      sx = null;
      return;
    }
    const commit = curDx * dir > 0 && Math.abs(curDx) > Math.min(150, W * 0.3);
    finish(commit);
    ok = false;
    sx = null;
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener(
    'touchcancel',
    () => {
      if (engaged) finish(false);
      ok = false;
      sx = null;
    },
    { passive: true },
  );
})();

function closeDeckFilterPanel(d, keepFilter) {
  state.dlPanel = null;
  const box = document.getElementById('dlPanelBox');
  if (box) {
    box.className = '';
    box.innerHTML = dlPanelHtml(d);
  }
  document.querySelectorAll('[data-panel]').forEach((x) => x.classList.remove('active'));
  const ch = document.getElementById('dockFilterChev');
  if (ch) ch.textContent = '▾';
  if (!keepFilter) {
    state.dlFilter = { ci: [] };
    state.dlFilterOn = false;
  }
  try {
    refreshDecklistBox(d);
  } catch (e) {}
  scrollToPageFoot();
}

document.addEventListener(
  'pointerdown',
  (e) => {
    if (state.screen !== 'decklist' || !state.dlSearchOpen || state.dlPanel !== 'dsearch') return;
    const t = e.target;
    if (!t || !t.closest) return;
    if (
      t.closest('#dlPanelBox') ||
      t.closest('#dockFilterChev') ||
      t.closest('#nameSuggest') ||
      t.closest('.cselect-panel') ||
      t.closest('.otag-pop') ||
      t.closest('#inAppConfirm')
    )
      return;
    const d = getDeck(state.activeDeckId);
    if (d) closeDeckFilterPanel(d, true);
  },
  true,
);

/* An open dropdown or context menu claims the next tap: touching anything
   outside it closes the menu and NOTHING else happens — the element under the
   finger is not activated. (Capture phase, so it runs before any handler.) */
document.addEventListener(
  'click',
  (e) => {
    // Name suggestions are not a menu the user opened: a tap on them works,
    // and a tap anywhere else closes them AND still does what it was for.
    if (state._localCsClose === closeNameSuggest) {
      const onIt =
        e.target.closest && (e.target.closest('#nameSuggest') || e.target === _sug.input);
      if (onIt) return;
      closeNameSuggest();
    }
    if (state._localCsClose) {
      const inside =
        e.target.closest && (e.target.closest('.cselect') || e.target.closest('.tag-add-row'));
      if (!inside) {
        e.preventDefault();
        e.stopPropagation();
        const f = state._localCsClose;
        state._localCsClose = null;
        try {
          f();
        } catch (err) {}
        return;
      }
    }
    if (state.openCSelect) {
      const inside = e.target.closest && e.target.closest('.cselect');
      if (!inside) {
        e.preventDefault();
        e.stopPropagation();
        state.openCSelect = null;
        try {
          csRerender();
        } catch (err) {}
        return;
      }
    }
    const pop = document.getElementById('tileMenuPop');
    if (pop && !pop.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      pop.remove();
    }
  },
  true,
);

function _promoteDeferredOverlay() {
  const top = state.overlayStack[state.overlayStack.length - 1];
  if (top && !top.pushed && !top.noHist) {
    top.pushed = true;
    try {
      history.pushState({ overlay: top.id }, '', '#' + top.id);
    } catch (e) {}
  }
}

['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach((ev) =>
  window.addEventListener(ev, _promoteDeferredOverlay, { capture: true, passive: true }),
);

function closeTopOverlay() {
  if (!state.overlayStack.length) return;
  const top = state.overlayStack[state.overlayStack.length - 1];
  if (!top.pushed) {
    // No history entry exists for this overlay — close it directly.
    state.overlayStack.pop();
    top.closeFn();
    return;
  }
  try {
    history.back();
  } catch (e) {
    // popstate runs the closeFn
    const t = state.overlayStack.pop();
    if (t) t.closeFn();
  }
}

/* Synchronous sweep used by nav-bar jumps: run every overlay's closeFn
   directly and drop the entries. Their history entries stay behind as
   inert pops — the state-driven ladder re-arms on every press (same
   pattern as the binder's inert entry), so back keeps behaving. */
function dismissAllOverlays() {
  while (state.overlayStack && state.overlayStack.length) {
    const t = state.overlayStack.pop();
    try {
      t.closeFn();
    } catch (e) {}
  }
}

/* One page's HTML without wiring — render() uses it for the live screen,
   the swipe strip uses it to paint the NEIGHBOR page while your finger
   drags, launcher-style. */
function pageBodyHtml(screen) {
  if (screen === 'menu') return menuPageHtml();
  if (screen === 'life') return lifePageHtml();
  if (screen === 'home') return homePageHtml();
  if (screen === 'decks') return homeHtml();
  if (screen === 'decklist') return decklistPageHtml();
  if (screen === 'search') return searchPageHtml();
  if (screen === 'inspiration') return inspirationPageHtml();
  if (screen === 'browse') return browsePageHtml();
  if (screen === 'settings') return settingsPageHtml();
  if (screen === 'formatrules' || screen === 'banlists') return formatReferencePageHtml(screen);
  if (screen === 'spoilers') return spoilersPageHtml();
  if (screen === 'collection') return collectionPageHtml();
  if (screen === 'trade') return tradePageHtml();
  if (screen === 'draft') return draftPageHtml();
  return '';
}

/* Set the moment the first screen has been painted; see the foot of render(). */
var _firstPaintDone = false;

var _bootScriptMs = 0,
  _bootRenderMs = 0,
  _bootPaintMs = 0;

try {
  _bootScriptMs = Math.round(performance.now());
} catch (e) {}

function render() {
  // The navigation ladder: every screen change made by the USER (not by a
  // back press) records its rung. Home resets the ladder; returning to a
  // screen already on it trims back to that rung, so back always retraces
  // the way you actually came down.
  if (state.screen !== 'decklist' && (state.dlSearchOpen || state.dlSearchQ)) {
    state._dlSel = null; // any multi-select ends with the page
    state.dlSearchOpen = false;
    state.dlSearchQ = ''; // the find bar lives on the decklist only
  }
  // Category folds are page-scoped too: leaving the decklist (any way \u2014
  // navigation, back press, swipe) clears them, so the next visit opens
  // with the defaults \u2014 every category unfolded, the Maybeboard folded.
  if (state.screen !== 'decklist' && Object.keys(state.collapsed || {}).length)
    state.collapsed = {};
  if (state.screen !== 'decklist' && state.legalityOpen) state.legalityOpen = false;
  // Opening a deck (re)loads the banlist at most once a day — the whole
  // legality check is otherwise offline name comparison, zero per-deck
  // network. ensureCmdrBans throttles itself via its 24h freshness stamp.
  if (state.screen === 'decklist') {
    try {
      ensureCmdrBans(false);
    } catch (err) {}
  }
  if (state.screen === 'collection') {
    try {
      repriceCollectionDaily();
    } catch (err) {}
  }
  state._newPrevScreen = state.screen;
  if (!state._ladderBack) {
    const L = (state.navLadder = state.navLadder || ['home']);
    const sc = state.screen || 'home';
    if (sc === 'home') {
      L.length = 0;
      L.push('home');
    } else if (L[L.length - 1] !== sc) {
      const i = L.indexOf(sc);
      if (i >= 0) L.length = i + 1;
      else L.push(sc);
    }
  }
  // The single choke point every screen flows through. If ANY page render
  // throws, the app must never die silently: show a recovery screen with the
  // ACTUAL error text (one screenshot ends any future hunt), and offer a way
  // home plus a targeted heal for the Inspiration catalog data.
  try {
    renderInner();
  } catch (err) {
    try {
      console.error('render failed:', err);
    } catch (_e) {}
    try {
      const esc = (x) =>
        String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      const msg =
        esc((err && (err.message || err.toString())) || 'unknown error') +
        (err && err.stack ? '\n' + esc(String(err.stack).split('\n').slice(1, 3).join('\n')) : '');
      const root = document.getElementById('root');
      root.innerHTML = /* HTML */ `<div
        style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px;text-align:center;background:var(--ink);color:var(--ink-text);"
      >
        <div style="font-family:'Cinzel',serif;font-size:19px;color:var(--brass);">
          Something broke while drawing this screen
        </div>
        <div style="font-size:14px;opacity:.8;">
          Er ging iets mis bij het tekenen van dit scherm — dit is de foutmelding:
        </div>
        <pre
          style="max-width:100%;overflow:auto;text-align:left;font-size:12px;background:rgba(0,0,0,0.35);border:2px solid var(--line);border-radius:8px;padding:10px 12px;white-space:pre-wrap;word-break:break-word;"
        >
${msg}</pre>
        <button id="recHome" class="primary-btn" style="width:auto;padding:12px 26px;">
          Back to start
        </button>
        <button id="recHeal" class="ghost-btn" style="padding:11px 20px;font-size:14px;">
          Reset Inspiration data &amp; go back to start
        </button>
      </div>`;
      document.getElementById('recHome').onclick = () => {
        state.screen = 'home';
        render();
      };
      document.getElementById('recHeal').onclick = () => {
        try {
          localStorage.removeItem('admiral_app:edhrecTags4');
          localStorage.removeItem('admiral_app:edhrecTags3');
        } catch (_e) {}
        state.edhrecTags = null;
        state._kindredSet = null;
        state.screen = 'home';
        render();
      };
    } catch (_e2) {}
  }
  // The very first screen is on: tell the Android shell it may drop the
  // launcher splash. Two frames, because a screen that has been BUILT has not
  // yet been DRAWN -- letting go one frame too early is exactly what showed a
  // black, then a dark red, then Home.
  if (!_firstPaintDone) {
    _firstPaintDone = true;
    try {
      try {
        paintPendingArt();
      } catch (e) {}
      try {
        csFitSheetFoot();
      } catch (e) {}
      try {
        if (!_bootRenderMs) _bootRenderMs = Math.round(performance.now());
      } catch (e) {}
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(appReady, 120)));
    } catch (e) {
      appReady();
    }
  }
}

const headerObserver = new ResizeObserver((entries) => {
  for (const entry of entries)
    document.documentElement.style.setProperty(
      '--app-header-h',
      `${entry.target.getBoundingClientRect().height}px`,
    );
});

function layoutPageViewport(page) {
  if (!page || page.classList.contains('search-page')) return;
  if (page.classList.contains('has-dock')) {
    const controls = document.createElement('section');
    controls.className = 'deck-controls';
    controls.setAttribute('aria-label', 'Deck controls');
    for (const child of page.querySelectorAll(':scope > .builder-tabs, :scope > .deck-dock'))
      controls.appendChild(child);
    page.prepend(controls);
  }
  page.classList.add('page-frame');
  const content = document.createElement('div');
  content.className = 'page-content tab-viewport';
  content.dataset.screen = state.screen;
  const bars =
    '.searchbar, .browse-selects, .reco-themes, .deck-controls, .sp-jump, .adv-toggle, #colAdvBox, #spAdvBox, #spAdvToggle';
  for (const child of [...page.children]) {
    const controls =
      (!child.classList.contains('page-searchbar') && child.matches(bars)) ||
      child.querySelector(':scope > #colAdvToggle');
    const floating = child.matches(
      '#advSlot, #spAdvSlot, #colAdvSlot, #bsAdvSlot, .deck-fab, .reco-fab',
    );
    if (controls) child.classList.add('page-controls');
    else if (!floating) content.appendChild(child);
  }
  page.appendChild(content);
}

function renderInner() {
  const root = document.getElementById('root');
  const previousViewport = root.querySelector('.tab-viewport');
  const tabScroll =
    previousViewport?.dataset.screen === state.screen ? previousViewport.scrollTop : 0;
  const advancedScroll = document.getElementById('advancedSearchBody')?.scrollTop || 0;
  const advancedFocus = document
    .getElementById('advancedSearchScreen')
    ?.contains(document.activeElement)
    ? document.activeElement.id
    : null;
  state._capNote = ''; // pages may set it while building
  let body = pageBodyHtml(state.screen);
  const nav = navHtml();
  root.innerHTML = /* HTML */ `<div class="app">${nav}${body}</div>`;
  const page = root.querySelector('.app > main');
  layoutPageViewport(page);
  const viewport = root.querySelector('.tab-viewport');
  if (viewport) viewport.dataset.restoreScroll = String(tabScroll);
  headerObserver.disconnect();
  const header = root.querySelector('.app-header');
  if (header) {
    document.documentElement.style.setProperty(
      '--app-header-h',
      `${header.getBoundingClientRect().height}px`,
    );
    headerObserver.observe(header);
  }
  try {
    if (state.screen === 'home') wireHomePage();
    else if (state.screen === 'menu') wireMenuPage();
    else if (state.screen === 'life') wireLifePage();
    else if (state.screen === 'decks') wireHome();
    else if (state.screen === 'decklist') wireDecklistPage();
    else if (state.screen === 'search') wireSearchPage();
    else if (state.screen === 'inspiration') wireInspirationPage();
    else if (state.screen === 'browse') wireBrowsePage();
    else if (state.screen === 'settings') wireSettingsPage();
    else if (state.screen === 'spoilers') wireSpoilersPage();
    else if (state.screen === 'collection') wireCollectionPage();
    else if (state.screen === 'trade') wireTradePage();
    else if (state.screen === 'draft') wireDraftPage();
  } catch (e) {
    console.error('page wiring failed', state.screen, e);
  }
  wireNav(); // the header (nav, home, mode long-press) must survive any page's failure
  renderModal();
  renderPreview();
  renderLifeOverlay();
  if (viewport) {
    viewport.scrollTop = tabScroll;
    requestAnimationFrame(() => {
      if (viewport.isConnected) viewport.scrollTop = tabScroll;
      delete viewport.dataset.restoreScroll;
    });
  }
  if (state.advOpen || state.spAdvOpen || state.colAdvOpen || state.bsAdvOpen) {
    const scroller = document.getElementById('advancedSearchBody');
    if (scroller) scroller.scrollTop = advancedScroll;
    if (advancedFocus) document.getElementById(advancedFocus)?.focus({ preventScroll: true });
  }
}

/* Sub-pages (Similar, Recommendations, Printings, Combos, Saltiest) carry
   the REAL app navigation: same banner, back in its cross-fleet colors. The
   banner rides as a flex child UNDER the scroller, so sticky bottoms pin
   right above it and no padding arithmetic is needed. The top bar keeps
   only the page name, styled like every main page word. */
function overlayCapHtml(title, extra) {
  return /* HTML */ `<div class="topbar ov-cap app-overlay-header">
    <button type="button" class="header-menu" data-app-menu aria-label="Open menu">
      <img src="icon-192.png" alt="" width="36" height="36" />${backupBadgeHtml()}</button
    ><button
      type="button"
      class="brand-txt two-line ov-title"
      data-app-home
      aria-label="Go to home"
    >
      ${escapeHtml(title)}</button
    >${extra || ''}
  </div>`;
}

function primaryNavItems() {
  return [
    { k: 'decks', l: 'Decks', i: ICONS.decks },
    { k: 'collection', l: 'Collection', i: ICONS.binder },
    { k: 'search', l: 'Search', i: ICONS.search },
    { k: 'browse', l: 'Inspiration', i: ICONS.inspire },
    { k: 'life', l: 'Life', i: ICONS.heart },
  ];
}

function activeNavKey() {
  return state.screen === 'decklist'
    ? 'decks'
    : state.screen === 'trade'
      ? 'collection'
      : state.screen === 'inspiration'
        ? 'browse'
        : state.screen;
}

function overlayNavHtml() {
  return /* HTML */ `<nav class="brand-banner ov-nav app-navigation" aria-label="Main navigation">
    <div class="banner-tabs">
      ${primaryNavItems()
        .map(
          (it) =>
            `<button type="button" class="banner-tab ${activeNavKey() === it.k ? 'active' : ''}" data-ovnav="page:${it.k}" title="${it.l}" aria-label="${it.l}"${activeNavKey() === it.k ? ' aria-current="page"' : ''}>${it.i}<span class="tab-label">${it.l}</span></button>`,
        )
        .join('')}
    </div>
  </nav>`;
}

function wireOverlayNav(el) {
  el.querySelectorAll('[data-ovnav]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.ovnav;
      if (v === 'back') {
        closeTopOverlay();
        return;
      }
      dismissAllOverlays();
      switchPage(v === 'home' ? 'home' : v.slice(5));
    }),
  );
}

/* Inspiration cap: with a selection active, the page word gives way to the
   selection itself — mana symbols of the chosen combination plus the theme
   and kindred words, in the cap's own gold. */
function browseCapSelHtml() {
  try {
    const sel = state.browseSel || {};
    if (!(sel.combo || sel.theme || sel.tribe)) return '';
    const icons = sel.combo
      ? sel.combo === 'c'
        ? manaIconSvg('C', 16)
        : manaRowSvg(sel.combo, 16)
      : '';
    const cap1 = (t) => String(t).replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
    const words = [];
    if (sel.theme === 'typal') {
      words.push(state.browseTypal ? cap1(state.browseTypal) : 'Kindred');
    } else if (sel.theme) {
      let l = '';
      try {
        const o = (browseThemeOptions() || []).find((x) => x.v === sel.theme);
        if (o) l = o.l;
      } catch (e) {}
      if (!l) l = cap1(String(sel.theme).replace(/^ed:/, '').replace(/-/g, ' '));
      words.push(l);
    }
    if (sel.tribe) {
      let l = '';
      try {
        const o = (browseKindredOptions() || []).find((t) => t.slug === sel.tribe);
        if (o) l = o.label;
      } catch (e) {}
      if (!l) l = cap1(String(sel.tribe).replace(/-/g, ' '));
      words.push(l);
    }
    const wHtml = words.map((w) => `<b>${escapeHtml(w)}</b>`).join('<span class="cs-dot">·</span>');
    return /* HTML */ `<span class="cap-sel"
      >${icons}${icons && wHtml ? '<span class="cs-dot">·</span>' : ''}${wHtml}</span
    >`;
  } catch (e) {
    return '';
  }
}

function inspirationCapTitle() {
  try {
    const d = getDeck(state.inspireDeckId);
    if (!d || deckIsConstructed(d)) return '';
    const word = appLang() === 'nl' ? 'Inspiratie' : 'Inspiration';
    const parts = [word, d.name || 'Untitled deck'];
    if (d.admiral) {
      const sel = state.inspireSel || {};
      const themes = inspEdhThemes(d);
      const lab = (sl) => {
        const t = themes.find((x) => x.slug === sl);
        return t
          ? String(t.label)
          : String(sl)
              .replace(/-/g, ' ')
              .replace(/\b\w/g, (ch) => ch.toUpperCase());
      };
      const picked = [sel.kindred, sel.theme].filter(Boolean).map(lab);
      if (picked.length) parts.push(picked.join(' + '));
    }
    // A no-break space keeps each "-" on the line of the part before it.
    return parts.join('\u00a0- ');
  } catch (e) {
    return '';
  }
}

function navHtml() {
  const items = primaryNavItems();
  const titles = {
    home: 'DECKHAND',
    menu: 'MENU',
    life: 'LIFE TRACKER',
    decks: 'MY DECKS',
    search: 'SEARCH',
    browse: 'INSPIRATION',
    inspiration: 'INSPIRATION',
    settings: 'SETTINGS',
    formatrules: 'FORMAT RULES',
    banlists: 'BAN LISTS',
    spoilers: 'SPOILERS',
    trade: 'TRADE',
    draft: 'DRAFT',
    collection: 'COLLECTION',
  };
  let title = titles[state.screen] || 'DECKHAND';
  if (state.screen === 'decks' && state.folderNav) {
    const _p = isFmtFolder(state.folderNav)
      ? [{ name: fmtLabelOf(fmtOfFolder(state.folderNav)) }]
      : folderPath(state.folderNav);
    if (_p.length) title = _p[_p.length - 1].name;
  }
  // A deck's Inspiration says what you are looking at while you scroll:
  // "Inspiration - <deck> - <Kindred + Theme>". The cap wraps to two lines
  // and shrinks to fit like every page name (fitBrandTitle).
  if (state.screen === 'inspiration') {
    const _it = inspirationCapTitle();
    if (_it) title = _it;
  }
  let editable = false;
  if (state.screen === 'decklist') {
    const d = getDeck(state.activeDeckId);
    if (d) {
      title = d.name || 'Untitled deck';
      editable = true;
    }
  }
  if (state.screen === 'collection' && state.colFilter && state.colFilter.binder) {
    // Inside a binder the page word IS the binder: its name in the top-left,
    // prefixed with a chevron that (like the hardware back button) returns
    // to the binder overview.
    title =
      state.colFilter.binder === '__wants__'
        ? trS('Wants')
        : state.colFilter.binder === '__all__'
          ? trS('All cards')
          : binderName(state.colFilter.binder) || 'Binder';
  }
  let capInner = escapeHtml(title);
  if (state.screen === 'browse') {
    const _cs = browseCapSelHtml();
    if (_cs) capInner = _cs;
  }
  const activeKey = activeNavKey();
  return /* HTML */ `<header class="page-cap app-header">
      <button
        type="button"
        class="header-menu ${['menu', 'settings', 'formatrules', 'banlists'].includes(state.screen) ? 'active' : ''}"
        id="homeBtn"
        data-app-menu
        aria-label="Open menu"
        title="Menu"
      >
        <img src="icon-192.png" alt="" width="36" height="36" />${backupBadgeHtml()}
      </button>
      <button
        type="button"
        class="brand-txt two-line"
        id="brandTitle"
        data-app-home
        aria-label="Go to home"
        title="Go to home"
      >
        <span id="brandTitleInner">${capInner}</span>
      </button>
      <div class="cap-tools">
        ${netChipHtml()}
        ${state.screen === 'search' ? '<button type="button" id="spoilersBtn" title="Spoilers from upcoming sets" aria-label="Spoilers">🔮</button>' : ''}
        ${state.screen === 'spoilers' ? `<button type="button" id="spAdvToggle" class="header-filter" aria-label="Advanced spoiler filters" title="${trS('Advanced filters')}" aria-haspopup="dialog" aria-expanded="${state.spAdvOpen}">${ICONS.filter}</button>` : ''}
        ${state.screen === 'draft' && state.draft?.phase !== 'setup' ? `<button type="button" id="draftResetBtn" class="header-filter" aria-label="${dT('Reset draft', 'Draft opnieuw beginnen')}" title="${dT('Reset draft', 'Draft opnieuw beginnen')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6"/></svg></button>` : ''}
        ${(() => {
          if (state.screen !== 'decklist') return '';
          const dd = getDeck(state.activeDeckId);
          if (!dd) return '';
          const issues = checkDeckLegality(dd);
          return /* HTML */ `<span
            id="capDeckCount"
            title="Tap to see the deck's legality check"
            style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:13px;font-family:'JetBrains Mono',monospace;color:${deckCountColor(deckCountState(dd, issues))};white-space:nowrap;cursor:pointer;padding:8px 6px 8px 0;"
            >${deckCountLabel(dd)}${issues.length ? ' ⚠' : ''}</span
          >`;
        })()}
        ${state.screen === 'collection' ? `<button type="button" id="tradeBtn" class="header-filter" aria-label="Trade calculator" title="${trS('Trade')}">${ICONS.trade}</button>` : ''}
        ${state.screen === 'trade' ? `<button type="button" id="tradeConfirm" class="header-filter" aria-label="${trS('Confirm trade')}" title="${trS('Confirm trade')}"${state.trade?.a.length || state.trade?.b.length ? '' : ' disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button><button type="button" id="tradeClear" class="header-filter" aria-label="${trS('Clear trade')}" title="${trS('Clear trade')}"${state.trade?.a.length || state.trade?.b.length ? '' : ' disabled'}>${ICONS.trash}</button>` : ''}
        ${editable ? `<button type="button" class="icon-btn" id="renameDeckBtn" aria-label="Rename deck" title="Rename deck">${ICONS.edit || inlIco('edit', 18)}</button>` : ''}
        ${state._capNote ? `<span class="cap-note${state.screen === 'collection' || state.screen === 'decklist' ? ' cap-tap' : ''}" id="capNoteBtn"${state.screen === 'decklist' ? ' role="button"' : ''}>${state._capNote}</span>` : ''}
      </div>
    </header>
    <nav class="brand-banner app-navigation" aria-label="Main navigation">
      <div class="banner-tabs">
        ${items.map((it) => `<button type="button" class="banner-tab ${activeKey === it.k ? 'active' : ''}" data-page="${it.k}" title="${it.l}" aria-label="${it.l}"${activeKey === it.k ? ' aria-current="page"' : ''}>${it.i}<span class="tab-label">${it.l}</span></button>`).join('')}
      </div>
    </nav>`;
}

/* The page word / deck name shrinks its font (down to a floor) until it fits,
   only ellipsizing for truly enormous deck names. Re-measured after the
   display font finishes loading and on every resize — the original bug was
   measuring with the fallback font, which is narrower than Cinzel Decorative,
   so "fits" flipped to overflow once the real font arrived. */
function fitBrandTitle() {
  // Shrink the title font (floor 8.5px) until the name truly fits: canvas
  // text metrics with the computed font, greedy word-wrap against the line
  // budget. Immune to -webkit-box's silent clipping.
  const box = document.getElementById('brandTitle');
  const inner = document.getElementById('brandTitleInner');
  if (!box || !inner) return;
  if (inner.querySelector('.cap-sel')) {
    box.style.fontSize = '';
    return;
  }
  const avail = box.clientWidth - 2;
  // Mid-render the box can report a sliver of its real width — fitting
  // against that shrinks titles like INSPIRATION to a whisper, and the size
  // sticks. Wait a frame and measure the finished layout instead.
  // 1.11: a few frames at most -- a short name in a narrow cap (SEARCH, HOME)
  // IS that narrow, and the endless retry measured the page every frame,
  // which is what made card swipes stutter on those pages
  if (avail < 80) {
    if ((fitBrandTitle._tries = (fitBrandTitle._tries || 0) + 1) <= 4)
      requestAnimationFrame(fitBrandTitle);
    else fitBrandTitle._tries = 0; // still narrow: leave the size alone (as before), just stop asking
    return;
  }
  fitBrandTitle._tries = 0;
  // Measuring against the fallback serif (wider than Cinzel) also shrinks
  // titles — refit once the real face arrives.
  if (document.fonts && document.fonts.status !== 'loaded' && !fitBrandTitle._waitFonts) {
    fitBrandTitle._waitFonts = true; // one wait, not one per call
    document.fonts.ready.then(() => {
      fitBrandTitle._waitFonts = false;
      requestAnimationFrame(fitBrandTitle);
    });
  }
  const text = (inner.textContent || '').trim();
  if (!text) {
    state._brandSize = '18px';
    return;
  }
  const maxLines = box.classList.contains('two-line') ? 2 : 1;
  const cs = getComputedStyle(box);
  const ls = parseFloat(cs.letterSpacing) || 0;
  const canvas = fitBrandTitle._c || (fitBrandTitle._c = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  const measure = (t, px) => {
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${px}px ${cs.fontFamily}`;
    return ctx.measureText(t).width + ls * Math.max(0, t.length - 1);
  };
  // Break where the browser breaks: ordinary spaces, never a no-break one.
  const words = text.split(/[^\S\u00a0]+/).filter(Boolean);
  let size = 18;
  for (; size >= 8.5; size -= 0.5) {
    if (words.some((w0) => measure(w0, size) > avail)) continue; // a word can never break
    if (maxLines === 1) {
      if (measure(text, size) <= avail) break;
      continue;
    }
    let lines = 1,
      cur = '';
    for (const w0 of words) {
      const t = cur ? cur + ' ' + w0 : w0;
      if (measure(t, size) <= avail) cur = t;
      else {
        lines++;
        cur = w0;
      }
    }
    if (lines <= maxLines) break;
  }
  // A one- or two-word title on a phone can never truly need single digits
  // — if the measurer says so, it was measuring the wrong font or a
  // half-laid-out box. Floor it.
  if (words.length <= 2 && text.length <= 16) size = Math.max(size, 15);
  box.style.fontSize = size + 'px';
  state._brandSize = size + 'px';
}

if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitBrandTitle());

window.addEventListener('resize', fitBrandTitle);

document.addEventListener('click', (e) => {
  if (e.target.closest?.('[data-app-menu]')) {
    switchPage('menu', true);
    return;
  }
  if (e.target.closest?.('[data-app-home]')) {
    switchPage('home', true);
    return;
  }
  // The compact €✕ badge explains itself on tap, anywhere in the app.
  if (e.target && e.target.closest && e.target.closest('.nopr')) {
    toast(trS('Price not listed yet'));
  }
  // The count in the cap ("100/100 \u26a0") answers when tapped with a
  // toast: all clear, or the deck's actual issues (up to four, then a
  // count of the rest).
  if (
    e.target &&
    e.target.closest &&
    e.target.closest('#capDeckCount') &&
    state.screen === 'decklist'
  ) {
    const d = getDeck(state.activeDeckId);
    if (d) {
      const issues = checkDeckLegality(d);
      if (!issues.length) toast('\u2713 ' + trS('Deck is legal.'));
      else {
        const texts = issues.map((i) => i.text || i.label || '').filter(Boolean);
        const shown = texts.slice(0, 4);
        const rest = texts.length - shown.length;
        toast(
          '\u26a0 ' +
            shown.join('\n') +
            (rest > 0 ? '\n' + trS('and') + ' ' + rest + ' ' + trS('more issues\u2026') : ''),
        );
      }
    }
  }
});

/* Drop-up menus and sheets dismiss on a downward swipe on their header —
   headers never scroll, so the gesture can't fight content scrolling. */
(function () {
  let sy = null,
    sheet = null;
  document.addEventListener(
    'touchstart',
    (e) => {
      const h = e.target.closest('.appoint-head, .dp-title, #fabMenu');
      sheet = h ? (h.id === 'fabMenu' ? h : h.closest('.appoint-sheet, .deckpick')) : null;
      sy = sheet ? e.touches[0].clientY : null;
    },
    { passive: true },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!sheet || sy === null) return;
      if (e.touches[0].clientY - sy > 64) {
        const el = sheet;
        sheet = null;
        sy = null;
        if (el.id === 'fabMenu') {
          el.remove();
          return;
        }
        const btn = el.querySelector('#appointClose, #ciClose, .dp-cancel');
        if (btn) {
          btn.click();
          return;
        }
        const ov = el.parentElement;
        if (ov) ov.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    },
    { passive: true },
  );
})();

function wireNav() {
  const bt = document.getElementById('brandTitle');
  if (bt) {
    const t = bt.textContent;
    const changed = state._lastBrand !== t;
    if (changed) {
      bt.classList.add('swap');
      state._brandSize = null;
    }
    // Apply the last known good size for this exact word immediately, so a
    // re-render of the same title doesn't flash big-then-small.
    if (!changed && state._brandSize) {
      bt.style.fontSize = state._brandSize;
    }
    state._lastBrand = t;
  }
  requestAnimationFrame(() => requestAnimationFrame(fitBrandTitle));
  setTimeout(fitBrandTitle, 250);
  setTimeout(fitBrandTitle, 700); // late settle (fonts, async deck load)
  document
    .querySelectorAll('[data-page]')
    .forEach((b) => b.addEventListener('click', () => switchPage(b.dataset.page, true)));
  const hb = document.getElementById('homeBtn');
  if (hb) {
    hb.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // Titles always return home; renaming has its own action.
  if (state.screen === 'decklist') {
    document.getElementById('renameDeckBtn')?.addEventListener('click', () => {
      const d = getDeck(state.activeDeckId);
      if (!d) return;
      openInAppPrompt('Rename this deck', 'Deck name', d.name, (name) => {
        if (name === null) return;
        d.name = name.trim() || 'Untitled deck';
        scheduleSave(d);
        render();
      });
    });
  }
}

function needDeckHtml(msg) {
  return /* HTML */ `<div class="need-deck">
    <div class="anchor">${modeGlyph()}</div>
    <p>${msg}</p>
    <button id="goDecksBtn">Go to My Decks</button>
  </div>`;
}

function banListsBodyHtml() {
  const labels = Object.fromEntries(FORMAT_RULES.map(([id, label]) => [id, label]));
  return EXTRAS_FMT_ORDER.filter((id) => labels[id] && id !== 'premodern')
    .map(
      (id) =>
        `<div class="settings-row" data-banfmt="${id}" style="cursor:pointer;flex-wrap:wrap;"><div style="flex:1;"><div class="l1 sub-fold">${labels[id]}${foldIcoHtml(false)}</div><div class="l2" data-banbox="${id}" hidden></div></div></div>`,
    )
    .join('');
}

function wirePreferenceCards() {
  const tools = document.querySelector('.menu-tools');
  for (const group of tools.querySelectorAll(':scope > .settings-section')) {
    const card = group.querySelector(':scope > .hub-card');
    if (card) group.prepend(card);
  }
  const syncCards = () => {
    for (const group of tools.querySelectorAll(':scope > .settings-section')) {
      const card = group.querySelector(':scope > .hub-card');
      const body = group.querySelector(':scope > .xt-body, :scope > .menu-tool-body');
      if (card && body) {
        card.setAttribute('aria-controls', body.id);
        card.setAttribute('aria-expanded', String(!body.hidden));
      }
    }
  };
  syncCards();
  new MutationObserver(syncCards).observe(tools, {
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden'],
  });
  const language = document.getElementById('languageBody');
  document
    .getElementById('langRow')
    ?.addEventListener('click', () =>
      foldToggle(language, null, document.getElementById('langRow')),
    );
  document
    .getElementById('startupRow')
    ?.addEventListener('click', () =>
      foldToggle(
        document.getElementById('startupBody'),
        null,
        document.getElementById('startupRow'),
      ),
    );
}

function wireNeedDeck() {
  document.getElementById('goDecksBtn')?.addEventListener('click', () => switchPage('decks'));
}

// ui / name-suggestions

/* ---- overlay history stack ----
   Every full-screen overlay pushes one history entry when it opens, so the
   phone's hardware back button closes the top overlay instead of navigating
   the page underneath it. Always close via closeTopOverlay() so the stack and
   the browser history stay in sync. */
/* ================= NAME SUGGESTIONS (Moxfield-style) =================
   From the third letter on, a scrollable drop-up rises right above the
   search bar with card names. Every typed word must match the START of a
   word in the name, in the same order ("starnheim me" -> Starnheim
   Memento); in-order fragments anywhere come after. Bottom-up: the best
   match sits at the foot, right above the bar, and the list opens there.
   Back closes it (state._localCsClose), as does Enter or leaving the field. */
function suggestNorm(x) {
  return String(x || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u00e6/g, 'ae')
    .replace(/\u0153/g, 'oe');
}

const _sugTok = new WeakMap();

function suggestMatch(names, q, limit) {
  const qn = suggestNorm(q).trim();
  if (qn.replace(/\s+/g, '').length < 3) return [];
  const words = qn.split(/\s+/).filter(Boolean);
  let prep = _sugTok.get(names);
  if (!prep) {
    prep = names.map((n) => {
      const ln = suggestNorm(n);
      return { n, ln, toks: ln.split(/[^a-z0-9]+/).filter(Boolean) };
    });
    _sugTok.set(names, prep);
  }
  const seen = new Set(),
    hits = [];
  for (const x of prep) {
    if (seen.has(x.n)) continue;
    let tier = -1,
      at = 0;
    // 1) every word opens a name word, in order
    let ti = 0,
      ok = true,
      first = -1;
    for (const w of words) {
      const wt = w.replace(/[^a-z0-9]+/g, '');
      if (!wt) continue;
      while (ti < x.toks.length && !x.toks[ti].startsWith(wt)) ti++;
      if (ti >= x.toks.length) {
        ok = false;
        break;
      }
      if (first < 0) first = ti;
      ti++;
    }
    if (ok) {
      tier = x.ln.startsWith(qn) ? 0 : 1;
      at = first;
    } else {
      // 2) every word appears somewhere, still in order
      let pos = 0,
        ok2 = true;
      for (const w of words) {
        const i = x.ln.indexOf(w, pos);
        if (i < 0) {
          ok2 = false;
          break;
        }
        if (pos === 0) at = i;
        pos = i + w.length;
      }
      if (ok2) tier = 2;
    }
    if (tier < 0) continue;
    seen.add(x.n);
    hits.push({ n: x.n, tier, at, len: x.n.length });
  }
  hits.sort((a, b) => a.tier - b.tier || a.at - b.at || a.len - b.len || a.n.localeCompare(b.n));
  return hits.slice(0, limit || 40).map((h) => h.n);
}

const _sug = { el: null, input: null, seq: 0 };

function closeNameSuggest() {
  if (_sug.el) {
    _sug.el.remove();
    _sug.el = null;
  }
  _sug.input = null;
  if (state._localCsClose === closeNameSuggest) state._localCsClose = null;
}

function placeNameSuggest() {
  const el = _sug.el,
    inp = _sug.input;
  if (!el) return;
  if (!inp || !inp.isConnected) {
    closeNameSuggest();
    return;
  }
  const r = inp.getBoundingClientRect();
  const viewport = window.visualViewport;
  const nav = document.querySelector('.app > .app-navigation');
  const visibleBottom = Math.min(
    window.innerHeight,
    viewport ? viewport.offsetTop + viewport.height : Infinity,
    nav ? nav.getBoundingClientRect().top : Infinity,
  );
  const top = Math.round(r.bottom + 6);
  const available = Math.max(0, Math.floor(visibleBottom - top - 8));
  el.style.left = Math.round(r.left) + 'px';
  el.style.width = Math.round(r.width) + 'px';
  el.style.top = top + 'px';
  el.style.bottom = 'auto';
  el.style.maxHeight = Math.min(320, available) + 'px';
  el.style.visibility = available > 0 ? 'visible' : 'hidden';
}

function showNameSuggest(input, list, onPick) {
  if (!list.length) {
    closeNameSuggest();
    return;
  }
  let el = _sug.el;
  if (!el) {
    el = document.createElement('div');
    el.id = 'nameSuggest';
    el.className = 'name-suggest';
    // Tapping a name must not steal the focus (the keyboard stays up).
    el.addEventListener('pointerdown', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => e.preventDefault());
    document.body.appendChild(el);
    _sug.el = el;
  }
  _sug.input = input;
  // Best matches lead the dropdown directly below the input.
  el.innerHTML = list
    .map((n, i) => `<button type="button" class="ns-opt" data-i="${i}">${escapeHtml(n)}</button>`)
    .join('');
  el.querySelectorAll('.ns-opt').forEach((b) =>
    b.addEventListener('click', () => {
      const n = list[+b.dataset.i];
      closeNameSuggest();
      try {
        onPick(n);
      } catch (e) {}
    }),
  );
  placeNameSuggest();
  el.scrollTop = 0;
  state._localCsClose = closeNameSuggest;
}

window.addEventListener('resize', () => {
  // Let responsive headers and fields finish moving before anchoring the list.
  requestAnimationFrame(() => {
    try {
      placeNameSuggest();
    } catch (e) {}
  });
});

window.addEventListener(
  'scroll',
  () => {
    try {
      placeNameSuggest();
    } catch (e) {}
  },
  { capture: true, passive: true },
);

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    try {
      placeNameSuggest();
    } catch (e) {}
  });
  window.visualViewport.addEventListener('scroll', () => {
    try {
      placeNameSuggest();
    } catch (e) {}
  });
}

/* getNames(q) may return an array or a promise of one. */
function wireNameSuggest(input, getNames, onPick) {
  if (!input || input._nsWired) return;
  input._nsWired = true;
  let t = null;
  const run = async () => {
    const my = ++_sug.seq;
    const q = input.value;
    if (suggestNorm(q).replace(/\s+/g, '').length < 3) {
      if (_sug.input === input) closeNameSuggest();
      return;
    }
    let names = [];
    try {
      names = (await getNames(q)) || [];
    } catch (e) {
      names = [];
    }
    if (my !== _sug.seq || !input.isConnected || document.activeElement !== input) return;
    let list = suggestMatch(names, q, 40);
    if (list.length === 1 && suggestNorm(list[0]) === suggestNorm(q).trim()) list = [];
    if (list.length) showNameSuggest(input, list, onPick);
    else if (_sug.input === input) closeNameSuggest();
  };
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(run, 110);
  });
  input.addEventListener('focus', () => {
    clearTimeout(t);
    t = setTimeout(run, 60);
  });
  input.addEventListener('blur', () =>
    setTimeout(() => {
      if (_sug.input === input && document.activeElement !== input) closeNameSuggest();
    }, 180),
  );
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(t);
      _sug.seq++;
      closeNameSuggest();
    }
  });
  // A re-render hands a fresh field the old query while it still has focus.
  if (document.activeElement === input && input.value) run();
}

/* Every card name the app knows: the phone's card database when it is
   there, Scryfall's own autocomplete while it is not. */
let _allNamesCache = null;

function allCardNamesFor(q) {
  if (_bulkIdx && _bulkIdx.cards) {
    if (!_allNamesCache || _allNamesCache.src !== _bulkIdx) {
      const set = new Set();
      _bulkIdx.cards.forEach((c) => {
        if (c && c.n && !/^A-/.test(c.n) && isRealCard({ type_line: c.tl, layout: c.ly }))
          set.add(c.n);
      });
      _allNamesCache = { src: _bulkIdx, names: Array.from(set) };
    }
    return _allNamesCache.names;
  }
  try {
    bulkIndexReady();
  } catch (e) {}
  return sfFetch(SF_BASE + '/cards/autocomplete?q=' + encodeURIComponent(q), 0, true)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => ((j && j.data) || []).filter((n) => !/^A-/.test(n)))
    .catch(() => []);
}

const _leaderNames = {};

function leaderNamesFor(q) {
  const fmt = state.browseFormat || 'commander';
  const k = fmt === 'paupercommander' ? 'pdh' : 'cmd';
  if (_bulkIdx && _bulkIdx.cards) {
    const hit = _leaderNames[k];
    if (hit && hit.src === _bulkIdx) return hit.names;
    const set = new Set();
    _bulkIdx.cards.forEach((c) => {
      if (!c || !c.n || /^A-/.test(c.n)) return;
      const tl = String(c.tl || '').split('//')[0],
        ot = String(c.ot || '');
      const ok =
        k === 'pdh'
          ? /\bCreature\b/.test(tl) && c.r === 'uncommon'
          : (/\bLegendary\b/.test(tl) && /\bCreature\b/.test(tl)) ||
            /can be your commander/i.test(ot);
      if (ok && isRealCard({ type_line: c.tl, layout: c.ly })) set.add(c.n);
    });
    _leaderNames[k] = { src: _bulkIdx, names: Array.from(set) };
    return _leaderNames[k].names;
  }
  return allCardNamesFor(q); // no card database yet: every name (the search itself still filters)
}

function pushOverlay(id, closeFn, defer) {
  // Reopening the overlay that is ALREADY on top must not mint a second
  // stack entry — those zombies made back presses vanish into silent no-op
  // pops (the element was long gone by the second pop). Reuse the entry.
  const _top = state.overlayStack[state.overlayStack.length - 1];
  if (_top && _top.id === id) {
    _top.closeFn = closeFn;
    return;
  }
  // History entries created during page load (no user interaction yet) are
  // SKIPPED by the browser's back button as an anti-abuse measure — which
  // made hardware-back on a freshly opened share link exit the app entirely.
  // Deferred entries are pushed on the user's first touch instead, which
  // makes them legitimate: back then returns to the app's home page.
  state.overlayStack.push({ id, closeFn, pushed: !defer });
  if (!defer) {
    try {
      history.pushState({ overlay: id }, '', '#' + id);
    } catch (e) {}
  }
}

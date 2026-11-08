// ui / progressive-results

/* ---------------- PROGRESSIVE RESULTS ----------------
   Big result sets render 40 tiles at a time; scrolling near the bottom loads
   the next 40 (order preserved). Prices are fetched per revealed chunk, so a
   300-card result costs the same up front as a 40-card one. Small sets render
   in one go — no sentinel, no observer. */
function pagedGrid(box, items, tileHtml, afterChunk, opts) {
  opts = opts || {};
  // 20 per step: halves the images the phone must fetch and decode before the
  // first grid appears, without touching how many results exist — scrolling
  // streams the rest in just as before.
  const pageSize = opts.pageSize || 20;
  // A rebuild mid-scroll (e.g. refreshing badges after an add) can ask for
  // its previous depth back: the first chunk renders opts.initial tiles at
  // once, so the page keeps its height and the scroll position stays honest.
  let firstStep = Math.max(pageSize, opts.initial || 0);
  if (opts.prefixHtml) box.insertAdjacentHTML('beforeend', opts.prefixHtml);
  const grid = document.createElement('div');
  grid.className = opts.gridClass || 'sr-grid';
  box.appendChild(grid);
  let shown = 0,
    io = null,
    sentinel = null;
  const done = () => {
    if (io) {
      io.disconnect();
      io = null;
    }
    if (sentinel) {
      sentinel.remove();
      sentinel = null;
    }
  };
  const renderMore = () => {
    if (shown >= items.length) {
      // Streaming mode: the array may still be growing in the background —
      // poll briefly instead of tearing down, so new arrivals keep flowing.
      if (opts.stream && !items._complete) {
        setTimeout(renderMore, 450);
        return;
      }
      done();
      return;
    }
    const upto = Math.min(items.length, shown + firstStep);
    firstStep = pageSize;
    const chunk = items.slice(shown, upto);
    // Pin the reader: anchor on the grid's DOM-first tile (the visual FOOT
    // in wrap-reverse grids) and give back exactly the shift the new chunk
    // caused, into whichever ancestor actually scrolls. In normal grids the
    // anchor doesn't move and this is a no-op.
    const _sc = (() => {
      let n = grid.parentElement;
      while (n && n !== document.body) {
        let cs;
        try {
          cs = getComputedStyle(n);
        } catch (e) {
          break;
        }
        if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) return n;
        n = n.parentElement;
      }
      return pageScroller();
    })();
    const _anchor = grid.firstElementChild;
    const _y0 = _anchor ? _anchor.getBoundingClientRect().top : null;
    grid.insertAdjacentHTML('beforeend', chunk.map((it, k) => tileHtml(it, shown + k)).join(''));
    if (_anchor && _y0 !== null) {
      const _dy = _anchor.getBoundingClientRect().top - _y0;
      if (_dy) _sc.scrollTop += _dy;
    }
    shown = upto;
    if (afterChunk) afterChunk(chunk, items.slice(0, shown));
    if (shown >= items.length && (!opts.stream || items._complete)) done();
    else if (sentinel) seatSentinel(); // keep it at the loading edge
  };
  const seatSentinel = () => {
    if (!sentinel) return;
    let rev = false;
    try {
      rev = getComputedStyle(grid).flexWrap === 'wrap-reverse';
    } catch (e) {}
    if (rev)
      box.insertBefore(sentinel, grid); // edge = visual top
    else box.appendChild(sentinel); // edge = visual bottom
  };
  if ((items.length > pageSize || opts.stream) && 'IntersectionObserver' in window) {
    sentinel = document.createElement('div');
    sentinel.style.cssText = 'height:1px;';
    io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) renderMore();
      },
      { rootMargin: '900px' },
    );
    renderMore();
    if (sentinel) {
      seatSentinel();
      io.observe(sentinel);
    }
  } else {
    while (shown < items.length) renderMore();
  }
}

function wireResultButtons(list, d, refreshFn, opts) {
  opts = opts || {};

  // any way of choosing an eligible leader performs the swap and returns to
  // the deck — nothing gets silently added to the main deck instead.
  const swd = state.switchSeat ? getDeck(state.switchSeat) : null;
  const leaderReady = (c) =>
    swd
      ? leaderFitsFormat(c, deckFormat(swd)) && !isBanned(c, swd)
      : isLegendary(c) && isNonlandFront(c) && !isBanned(c);
  const doSwitch = (c) => {
    if (!swd) return false;
    if (!leaderReady(c)) {
      toast(`${c.name} can't take command.`);
      return true;
    }
    promoteToCommander(swd, c);
    state.switchSeat = null;
    openDeck(swd.id);
    return true;
  };
  // d = a specific deck (pinned search, inspiration, browse-with-pin) → direct adds.
  // d = null → Add offers deck and collection destinations in the popup.
  const _has = (nm) => list.some((x) => x.name === nm); // 1.7: only claim tiles whose card this list holds
  document
    .querySelectorAll('.add-btn[data-name]:not([data-mb]):not([data-admiral])')
    .forEach((btn) => {
      if (btn.dataset.w || !_has(decodeURIComponent(btn.dataset.name))) return;
      btn.dataset.w = '1';
      btn.addEventListener('click', () => {
        const c = list.find((x) => x.name === decodeURIComponent(btn.dataset.name));
        if (!c) return;
        if (swd) {
          doSwitch(c);
          return;
        }
        if (d)
          addCardToDeckValidated(
            d,
            playingDeckCopy(
              c,
              state.screen === 'search' && state.searchPinnedDeckId === d.id && state.searchProxy,
            ),
            refreshFn,
          );
        else openDeckPickPopup(c, 'main', refreshFn, null, true);
      });
    });
  // 1.5: "-" takes one copy out of the pinned deck again
  if (d)
    document.querySelectorAll('.add-btn[data-rm]').forEach((btn) => {
      if (btn.dataset.w) return;
      btn.dataset.w = '1';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nm = decodeURIComponent(btn.dataset.rm);
        let i = -1;
        for (let k = (d.cards || []).length - 1; k >= 0; k--) {
          if (d.cards[k].name === nm) {
            i = k;
            break;
          }
        }
        if (i < 0) return;
        const rm = d.cards.splice(i, 1)[0];
        logDeckChange(d, { type: 'remove', name: rm.name, card: rm });
        toast(`${rm.name} ${'removed from'} ${d.name}${''}.`);
        scheduleSave(d);
        const c = list.find((x) => x.name === nm) || rm;
        if (refreshFn) refreshFn(c);
      });
    });
  document.querySelectorAll('.add-btn[data-insp]').forEach((btn) => {
    if (btn.dataset.w || !_has(decodeURIComponent(btn.dataset.name))) return;
    btn.dataset.w = '1';
    btn.addEventListener('click', () => {
      const c = list.find((x) => x.name === decodeURIComponent(btn.dataset.name));
      if (!c) return;
      if (d) openCardReco(c, d);
      else if (state.decksIndex.length) openDeckPickPopup(c, 'reco');
      else openCardReco(c, null);
    });
  });
  document.querySelectorAll('.add-btn[data-mb]').forEach((btn) => {
    if (btn.dataset.w || !_has(decodeURIComponent(btn.dataset.name))) return;
    btn.dataset.w = '1';
    btn.addEventListener('click', () => {
      const c = list.find((x) => x.name === decodeURIComponent(btn.dataset.name));
      if (!c) return;
      if (d) addToMaybeValidated(d, c, refreshFn);
      else openDeckPickPopup(c, 'maybe', refreshFn);
    });
  });
  document.querySelectorAll('.add-btn[data-admiral]').forEach((btn) => {
    if (btn.dataset.w || !_has(decodeURIComponent(btn.dataset.name))) return;
    btn.dataset.w = '1';
    btn.addEventListener('click', () => {
      const c = list.find((x) => x.name === decodeURIComponent(btn.dataset.name));
      if (!c) return;
      if (swd) {
        doSwitch(c);
        return;
      }
      if (d) setCommanderValidated(d, c, refreshFn);
      else openDeckPickPopup(c, 'admiral', refreshFn);
    });
  });
  document.querySelectorAll('.sr-tile img, .sr-row img').forEach((img) => {
    const _t = img.closest('[data-name]');
    if (img.dataset.w || (_t && !_has(decodeURIComponent(_t.dataset.name)))) return;
    img.dataset.w = '1'; // wireResultButtons runs repeatedly (per trio, per chunk) — one listener only
    img.addEventListener('click', () => {
      const tile = img.closest('[data-name]');
      const c = tile && list.find((x) => x.name === decodeURIComponent(tile.dataset.name));
      if (swd && c && leaderReady(c)) {
        doSwitch(c);
        return;
      }
      if (opts.onCardTap && c) {
        opts.onCardTap(c);
        return;
      }
      if (c) {
        openCardInfo(c, { pool: list, refreshFn });
        return;
      } // full details: price, Oracle text, rulings
      showPreview(img.dataset.preview, img.dataset.wb === '1');
    });
  });
}

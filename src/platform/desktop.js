// platform / desktop

/* ===== 1.26 PC: right-click card popup, shift-click, '/' and Ctrl+V ===== */
function pcFinePointer() {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch (e) {
    return false;
  }
}

function cardImgShape(el) {
  if (!el || el.tagName !== 'IMG') return false;
  const r = el.getBoundingClientRect();
  if (r.width < 24) return false;
  const q = r.height / r.width;
  return q > 1.3 && q < 1.45;
}

/* What a right-click lands on: a card picture (or a decklist text row). */
function ctxCardTarget(t) {
  if (!t || !t.closest) return null;
  if (t.closest('.overlay.cs-pop, #hoverPrevBox, .cd-hero, .life-grid-v2')) return null;
  const row = t.closest('[data-himg]');
  if (row) return row;
  let img = t.tagName === 'IMG' ? t : null;
  if (!img) {
    const tile = t.closest('.sr-tile, .sc-tile, .vg-card, .col-tile, .pair-cell');
    img = tile ? tile.querySelector('img') : null;
  }
  return img && cardImgShape(img) ? img : null;
}

function csPopTop() {
  const ovs = document.querySelectorAll('body > .overlay:not(.swipe-leaving)');
  const top = ovs[ovs.length - 1];
  return top && top.classList.contains('cs-pop') ? top : null;
}

/* Close the popup at once (its history entry stays behind, inert -- the
   same as a nav-bar jump), so a new card can open in the same instant. */
function csPopCloseNow() {
  const pop = csPopTop();
  if (!pop) return false;
  const st = state.overlayStack;
  const top = st.length ? st[st.length - 1] : null;
  if (top && (top.id === 'cardInfo' || top.id === 'cardSheet')) {
    st.pop();
    try {
      top.closeFn();
    } catch (e) {}
  }
  if (pop.isConnected) pop.remove();
  return true;
}

function csPopApply(el) {
  const P = state._csPopAt;
  if (P && Date.now() - P.t < 1200) {
    state._csPopAt = null;
    el.classList.add('cs-pop');
    el._csPopXY = { x: P.x, y: P.y };
    if (!el._csPopWired) {
      el._csPopWired = true;
      // Legality and Rulings start folded; their heading opens them.
      el.addEventListener('click', (e) => {
        if (!el.classList.contains('cs-pop')) return;
        const h =
          e.target.closest && e.target.closest('main.card-detail > .detail-sec > .detail-h');
        if (!h) return;
        const sec = h.parentElement;
        if (sec.querySelector('#sheetOracle')) return;
        el.classList.toggle(sec.querySelector('#csRulings') ? 'rul-open' : 'leg-open');
      });
    }
  }
  if (el.classList.contains('cs-pop')) {
    requestAnimationFrame(() => csPopPlace(el));
    setTimeout(() => csPopPlace(el), 350);
  }
}

/* Beside the mouse: right of it when there is room, else left; it grows
   UPWARD from the pointer when there is more room above (bottom-up). */
function csPopPlace(el) {
  const P = el && el._csPopXY;
  if (!P || !el.isConnected || !el.classList.contains('cs-pop')) return;
  if (!el.querySelector(':scope > .cs-pop-x')) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'cs-pop-x desk-x';
    x.textContent = '✕';
    x.title = appLang() === 'nl' ? 'Sluiten' : 'Close';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      csPopCloseNow();
    });
    el.appendChild(x);
  }
  const vw = window.innerWidth,
    vh = window.innerHeight,
    pad = 8,
    gap = 14;
  const w = Math.min(460, vw - 2 * pad);
  let x = P.x + gap;
  if (x + w > vw - pad) x = P.x - gap - w;
  if (x < pad) x = Math.max(pad, Math.min(vw - w - pad, P.x - w / 2));
  const above = P.y - pad,
    below = vh - P.y - pad;
  el.style.width = w + 'px';
  el.style.left = Math.round(x) + 'px';
  el.style.right = 'auto';
  if (above >= below) {
    el.style.top = 'auto';
    el.style.bottom = Math.round(vh - P.y) + 'px';
    el.style.maxHeight = Math.round(Math.min(760, above)) + 'px';
  } else {
    el.style.bottom = 'auto';
    el.style.top = Math.round(P.y) + 'px';
    el.style.maxHeight = Math.round(Math.min(760, below)) + 'px';
  }
}

// Right mouse button on a card: no long-press timers, no native menu.
document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 2 || e.pointerType !== 'mouse') return;
    if (ctxCardTarget(e.target)) e.stopPropagation();
  },
  true,
);

document.addEventListener(
  'mousedown',
  (e) => {
    if (e.button === 2 && ctxCardTarget(e.target)) e.stopPropagation();
  },
  true,
);

document.addEventListener(
  'contextmenu',
  (e) => {
    if (state._zoomEat && Date.now() - state._zoomEat < 700) {
      state._zoomEat = 0;
      e.preventDefault();
      e.stopPropagation();
      return;
    } // 1.45
    if (!pcFinePointer()) return;
    const tg = ctxCardTarget(e.target);
    if (!tg) {
      if (csPopTop() && !e.target.closest('.overlay.cs-pop')) csPopCloseNow();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const scope = tg.closest('.overlay') || document.querySelector('.app > main') || document;
    // While cards are being multi-selected, a click toggles -- leave it be.
    if (
      scope.querySelector('.sr-tile.selected, .sc-tile.selected, .vg-card.dl-msel, .col-tile.csel')
    )
      return;
    csPopCloseNow();
    state._csPopAt = { x: e.clientX, y: e.clientY, t: Date.now() };
    try {
      tg.click();
    } catch (err) {}
    setTimeout(() => {
      if (state._csPopAt && Date.now() - state._csPopAt.t >= 1100) state._csPopAt = null;
    }, 1250);
  },
  true,
);

// A left click on the page outside the popup closes it.
document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 0) return;
    const pop = csPopTop();
    if (!pop) return;
    if (pop.contains(e.target)) return;
    // 1.45: menus and sheets the popup opened stay; anything else closes it --
    // the page AND the empty margins beside it
    if (
      e.target.closest &&
      e.target.closest(
        '.overlay, .deckpick-scrim, .menu-pop, #nselPop, .cselect-panel, #cardZoomBox, .toast, .modal-backdrop',
      )
    )
      return;
    csPopCloseNow();
  },
  true,
);

window.addEventListener('resize', () => {
  const p = csPopTop();
  if (p) csPopPlace(p);
});

/* Any page the menu opens (Similar cards, Recommendations, Change printing)
   replaces it: the menu closes instead of hanging over the new page. A
   desk dialog without a close button gets a cross. */
try {
  new MutationObserver((muts) => {
    muts.forEach((m) =>
      m.addedNodes.forEach((n) => {
        if (!n || n.nodeType !== 1) return;
        if (
          n.classList.contains('overlay') &&
          !n.classList.contains('cs-pop') &&
          !n.classList.contains('swipe-leaving')
        ) {
          document.querySelectorAll('body > .overlay.cs-pop').forEach((pop) => {
            if (pop === n) return;
            const st = state.overlayStack;
            for (let i = st.length - 1; i >= 0; i--) {
              if (st[i].id === 'cardInfo' || st[i].id === 'cardSheet') {
                if (
                  i < st.length - 1 ||
                  !document.getElementById('cardSheetOverlay') ||
                  document.getElementById('cardSheetOverlay') === pop
                ) {
                  st.splice(i, 1);
                }
                break;
              }
            }
            pop.remove();
          });
        }
        if (isDesk()) deskAddCross(n);
      }),
    );
  }).observe(document.body, { childList: true });
} catch (e) {}

function deskAddCross(n) {
  try {
    if (
      !n.matches ||
      !n.matches('.deckpick-scrim, .modal-backdrop, #appointOverlay, #cutWhyOverlay')
    )
      return;
    if (n.id === 'tourScrim' || n.querySelector('.app-dialog')) return; // These dialogs have their own cancel action.
    const sheet = n.querySelector('.deckpick, .modal-sheet, .appoint-sheet');
    if (
      !sheet ||
      sheet.querySelector(
        '.desk-x, .life-popup-close, #appointClose, #cwClose, .appoint-head .icon-btn',
      )
    )
      return;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'desk-x';
    x.textContent = '✕';
    x.title = appLang() === 'nl' ? 'Sluiten' : 'Close';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      // the dialog's own outside-tap close, as if its backdrop was clicked
      try {
        n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } catch (err) {}
      setTimeout(() => {
        if (n.isConnected) {
          const c = n.querySelector('#iacCancel, #iapCancel, #cancelBtn, .dp-cancel');
          if (c) c.click();
        }
      }, 60);
    });
    sheet.style.position = sheet.style.position || 'relative';
    sheet.appendChild(x);
  } catch (e) {}
}

/* Shift-click: start a selection, or select everything from the last
   picked card to this one -- the same selection a long-press makes. */
(function shiftSelect() {
  const SEL =
    '.sr-tile[data-name], .sc-tile, .col-tile[data-ci], .vg-card[data-loc="main"][data-idx], .vg-card[data-loc="maybe"][data-idx]';
  const isSel = (t) =>
    t.classList.contains('selected') ||
    t.classList.contains('dl-msel') ||
    t.classList.contains('csel');
  const hitEl = (t) => t.querySelector('img, .vg-hit') || t;
  const tap = (t) => {
    try {
      hitEl(t).dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
      );
    } catch (e) {}
  };
  let anchor = null;
  const scopeOf = (t) =>
    t.closest('.overlay') || document.querySelector('.app > main') || document.body;
  document.addEventListener(
    'mousedown',
    (e) => {
      if (
        e.shiftKey &&
        e.button === 0 &&
        e.target.closest &&
        e.target.closest(SEL) &&
        !e.target.closest('button:not(.vg-hit)')
      )
        e.preventDefault();
    },
    true,
  );
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target.closest && e.target.closest(SEL);
      if (!t) return;
      if (!e.isTrusted) return;
      if (e.target.closest('button:not(.vg-hit), .sel-check, .pair-pop-wrap')) return;
      if (!e.shiftKey) {
        anchor = t;
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const scope = scopeOf(t);
      const tiles = Array.from(scope.querySelectorAll(SEL));
      const active = tiles.some(isSel);
      if (!active) {
        // Start the selection the way a long-press does.
        const h = hitEl(t);
        try {
          h.dispatchEvent(
            new PointerEvent('pointerdown', {
              bubbles: true,
              pointerType: 'mouse',
              button: 0,
              isPrimary: true,
            }),
          );
        } catch (err) {}
        setTimeout(() => {
          try {
            h.dispatchEvent(
              new PointerEvent('pointerup', {
                bubbles: true,
                pointerType: 'mouse',
                button: 0,
                isPrimary: true,
              }),
            );
          } catch (err) {}
          if (isSel(t)) tap(t); // spends the long-press flag, so the next tap is a normal one
          // tap() toggled it off again on some pages -- make sure it stays on
          if (!isSel(t)) tap(t);
        }, 520);
        anchor = t;
        return;
      }
      if (anchor && anchor.isConnected && tiles.includes(anchor)) {
        const a = tiles.indexOf(anchor),
          b = tiles.indexOf(t);
        const lo = Math.min(a, b),
          hi = Math.max(a, b);
        for (let i = lo; i <= hi; i++) {
          const x = tiles[i];
          if (x.isConnected && !isSel(x)) tap(x);
        }
      } else tap(t);
      anchor = t;
    },
    true,
  );
})();

/* Keyboard: '/' jumps to the search field of the page (Search when the page
   has none). Typing in a field is left alone. */
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (
    t &&
    (t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      t.isContentEditable)
  )
    return;
  const vis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const ovs = document.querySelectorAll('body > .overlay:not(.swipe-leaving)');
  const top = ovs[ovs.length - 1];
  let f = null;
  if (top) f = Array.from(top.querySelectorAll('input[type="text"], input:not([type])')).find(vis);
  else
    f = Array.from(
      document.querySelectorAll(
        '.app > main #searchName, .app > main .searchbar input, .app > main input.col-filter-input, .app > main input[type="text"], .app > main input:not([type])',
      ),
    ).find(vis);
  e.preventDefault();
  if (f) {
    f.focus();
    try {
      f.select();
    } catch (err) {}
    return;
  }
  if (top) return;
  try {
    switchPage('search');
  } catch (err) {}
  setTimeout(() => {
    const s2 = document.getElementById('searchName');
    if (s2) {
      s2.focus();
      try {
        s2.select();
      } catch (err) {}
    }
  }, 80);
});

/* Ctrl+V of a deck list anywhere outside a text field: the import sheet
   opens with the list already in it. */
function looksLikeDeckList(txt) {
  const lines = String(txt || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (lines.length < 4) return false;
  const qty = lines.filter((l) => /^\d{1,3}\s*x?\s+\S/i.test(l)).length;
  return qty >= 4 && qty / lines.length >= 0.6;
}

document.addEventListener('paste', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  let txt = '';
  try {
    txt = (e.clipboardData || window.clipboardData).getData('text') || '';
  } catch (err) {}
  if (!looksLikeDeckList(txt)) return;
  e.preventDefault();
  try {
    openPasteListSheet({ text: txt });
  } catch (err) {}
});

/* Mouse hover preview (PC / laptop only -- a real mouse, not touch): resting
   the pointer on any card picture shows a big copy beside the pointer, on
   whichever side has room: right, left, then below or above. It never
   catches clicks. The big card page's own picture is skipped. */
/* 1.28 PC: a click on a card shows it BIG beside the mouse; the right
   mouse button opens its menu. (The hover preview of 1.24 is gone.) */
const cardZoom = (function () {
  let box = null,
    open = false;
  const hide = () => {
    if (box) box.style.display = 'none';
    open = false;
  };
  const ensure = () => {
    if (box) return box;
    box = document.createElement('div');
    box.id = 'cardZoomBox';
    box.innerHTML =
      '<img id="cardZoomImg" alt=""><button type="button" class="cz-x" aria-label="Close" title="Close">✕</button>';
    document.body.appendChild(box);
    box.querySelector('.cz-x').addEventListener('click', (e) => {
      e.stopPropagation();
      hide();
    });
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      hide();
    });
    return box;
  };
  const show = (src, x, y) => {
    if (!src) return;
    ensure();
    const vw = window.innerWidth,
      vh = window.innerHeight,
      pad = 12,
      gap = 22;
    let h = Math.min(760, vh - 2 * pad),
      w = Math.round((h * 488) / 680);
    if (w > vw - 2 * pad) {
      w = vw - 2 * pad;
      h = Math.round((w * 680) / 488);
    }
    let left = x + gap;
    if (left + w > vw - pad) left = x - gap - w;
    if (left < pad) left = Math.max(pad, Math.round((vw - w) / 2));
    const top = Math.max(pad, Math.min(vh - h - pad, Math.round(y - h / 2)));
    const im = box.querySelector('img');
    if (im.getAttribute('src') !== src) im.setAttribute('src', src);
    box.style.cssText = `display:block;left:${left}px;top:${top}px;width:${w}px;height:${h}px;`;
    open = true;
  };
  document.addEventListener(
    'mousedown',
    (e) => {
      if (!open || (box && box.contains(e.target))) return;
      // 1.45: a click (left or right) on the card that is zoomed only closes it
      let tg = null;
      try {
        tg = ctxCardTarget(e.target);
      } catch (err) {}
      if (tg && tg === state._zoomTg) state._zoomEat = Date.now();
      hide();
    },
    true,
  );
  window.addEventListener(
    'wheel',
    () => {
      if (open) hide();
    },
    { passive: true, capture: true },
  );
  window.addEventListener('resize', () => {
    if (open) hide();
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (open && e.key === 'Escape') hide();
    },
    true,
  );
  return { show, hide, isOpen: () => open };
})();

// A plain left click on a card (desk, mouse): note where, and let the
// click run -- the card page it would open shows the big card instead.
document.addEventListener(
  'click',
  (e) => {
    if (state._zoomEat && Date.now() - state._zoomEat < 700) {
      state._zoomEat = 0;
      e.preventDefault();
      e.stopPropagation();
      return;
    } // 1.45
    if (!isDesk() || !pcFinePointer() || !e.isTrusted || e.button !== 0) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = ctxCardTarget(e.target);
    if (!tg) return;
    if (e.target.closest('button:not(.vg-hit), .sel-check, .pair-pop-wrap, .dfc-flip, a')) return;
    const scope = tg.closest('.overlay') || document.querySelector('.app > main') || document;
    if (
      scope.querySelector('.sr-tile.selected, .sc-tile.selected, .vg-card.dl-msel, .col-tile.csel')
    )
      return;
    state._zoomAt = {
      x: e.clientX,
      y: e.clientY,
      t: Date.now(),
      src: tg.tagName === 'IMG' ? tg.currentSrc || tg.src : tg.getAttribute('data-himg'),
    };
    state._zoomTg = tg;
  },
  true,
);

function zoomTake(card) {
  const z = state._zoomAt;
  if (!z || Date.now() - z.t > 800) return false;
  state._zoomAt = null;
  let src = '';
  try {
    const iu =
      card &&
      (card.image_uris || (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris));
    src =
      (printPrefFor(card) && cardImageLarge(card)) ||
      (iu && (iu.large || iu.normal)) ||
      cardImageLarge(card) ||
      '';
  } catch (e) {}
  if (!src)
    src = String(z.src || '')
      .replace('/small/', '/large/')
      .replace('/normal/', '/large/');
  cardZoom.show(src, z.x, z.y);
  return true;
}

/* Any text input the user focuses gets the keyboard's 🔍 Enter key unless it
   opted for another hint — search is what Enter does in this app's fields. */
document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (t && t.tagName === 'INPUT' && !t.hasAttribute('enterkeyhint')) {
    const ty = (t.getAttribute('type') || 'text').toLowerCase();
    if (ty === 'text' || ty === 'search') t.setAttribute('enterkeyhint', 'search');
  }
});

/* And when that 🔍 key is pressed, the keyboard should get out of the way:
   the search fires (every Enter handler runs first — this waits a tick),
   then the field lets go of focus, app-wide. Textareas keep Enter. */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const t = e.target;
  if (t && t.tagName === 'INPUT')
    setTimeout(() => {
      try {
        t.blur();
      } catch (_e) {}
    }, 0);
});

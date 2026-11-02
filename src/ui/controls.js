// ui / controls

/* ========================= HELPERS ========================= */

/* Original mana-color icons — sun, droplet, skull, flame, tree, and a
   colorless diamond. Deliberately our own designs (WotC's official symbols
   are their IP), but color-coded so they read instantly. */
/* ---- custom dropdown (cselect) ----
   One component replaces every native <select>: it can render icons in its
   options, matches the app's styling, and only one is open at a time
   (state.openCSelect). Handlers register per id in _csHandlers. */
const _csHandlers = {};

/* The symbol for a set code, as ink-coloured HTML — empty when the set list
   has not arrived yet, so a picker never waits on it. */
function setIconHtml(code) {
  try {
    if (!code) return '';
    const row = (state.allSetsRaw || []).find(
      (x) => x && String(x.code).toLowerCase() === String(code).toLowerCase(),
    );
    if (!row || !row.icon) return '';
    const u = String(row.icon).replace(/'/g, '%27');
    return /* HTML */ `<span
      class="set-ico"
      style="-webkit-mask-image:url('${u}');mask-image:url('${u}');"
    ></span>`;
  } catch (e) {
    return '';
  }
}

function cselectHtml(id, options, value, placeholder, o) {
  o = o || {};
  const cur = options.find((x) => String(x.v) === String(value ?? ''));
  const open = state.openCSelect === id && !o.disabled;
  // bl: an option may carry a separate compact button label (the card pickers
  // show image-only tiles in the panel but the plain name on the closed button).
  const label = cur ? (cur.bl != null ? cur.bl : cur.l) : placeholder || 'Select…';
  return /* HTML */ `<div class="cselect ${o.cls || ''}">
    <button class="cselect-btn" data-cs="${id}" ${o.disabled ? 'disabled' : ''} type="button">
      ${cur && cur.icons ? `<span class="co-icons">${cur.icons}</span>` : ''}
      <span class="cs-label">${label}</span>
      <span class="cs-car">${open ? '▴' : '▾'}</span>
    </button>
    ${
      open
        ? (() => {
            const searchRow = o.search
              ? `<div class="cselect-search"><span class="cs-mag">${ICONS.search}</span><input type="text" placeholder="Type to filter…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>`
              : '';
            const noRes = o.search
              ? `<div class="cs-noresults" style="display:none;">No matches — try fewer letters</div>`
              : '';
            // Dedupe pass in POPULARITY order (the options array as given, before
            // the bottom-up reverse): the most-played entry keeps the primary art,
            // later duplicates slide to their next candidate.
            const artPick = {};
            if (o.tiles && typeof _tileArtReady !== 'undefined') {
              const usedArts = new Set();
              options.forEach((x) => {
                if (x.gen || !x.art || artPick[x.art]) return;
                const rd0 = _tileArtReady[x.art];
                if (rd0) artPick[x.art] = tileArtPick(rd0, usedArts);
              });
            }
            const opts = options
              .map((x) => {
                const selCls = String(x.v) === String(value ?? '') ? 'sel' : '';
                if (o.tiles) {
                  // Art keys can carry Scryfall clauses with double quotes
                  // (o:"draw a card") — escapeHtml leaves " alone, so the data-art
                  // attribute used to be CUT OFF there, handing the lazy resolver a
                  // broken clause (BAD_QUERY, art never loads). Escaped explicitly
                  // since v2.51.585.
                  const rd = !x.gen && x.art ? artPick[x.art] : null;
                  const img = x.gen
                    ? `<span class="at-img at-gen">${x.gen === true ? '' : x.gen}</span>`
                    : `<span class="at-img"${rd ? ` style="background-image:url('${escapeHtml(rd.a)}')"` : ''}></span>`;
                  return /* HTML */ `<button
                    class="cselect-opt art-tile ${selCls} ${x.disabled ? 'opt-disabled' : ''}"
                    ${x.disabled ? 'disabled' : ''}
                    data-csopt="${id}"
                    data-val="${escapeHtml(String(x.v))}"
                    ${!x.gen && x.art ? ` data-art="${escapeHtml(String(x.art)).replace(/"/g, '&quot;')}"` : ''}
                  >
                    ${img}<span class="at-label"
                      >${x.icons ? `<span class="co-icons">${x.icons}</span>` : ''}<span
                        class="at-txt"
                        >${x.l}</span
                      ></span
                    >
                  </button>`;
                }
                return /* HTML */ `<button
                  class="cselect-opt ${selCls} ${x.disabled ? 'opt-disabled' : ''}"
                  ${x.disabled ? 'disabled' : ''}
                  data-csopt="${id}"
                  data-val="${escapeHtml(String(x.v))}"
                >
                  ${x.icons ? `<span class="co-icons">${x.icons}</span>` : ''}${x.l}
                </button>`;
              })
              .join('');
            // BOTTOM-UP tile panels: the tiles live in their own inner scroller
            // (reversed, most popular at the foot) and the search bar is a plain
            // flex child at the panel's foot -- the list scrolls away behind it
            // by construction, no sticky involved.
            return /* HTML */ `<div
              class="cselect-panel${o.tall ? ' tall' : ''}${o.inline ? ' inline' : ''}${o.tiles ? ' cs-artgrid' : ''}"
            >
              ${o.tiles ? `<div class="cs-artscroll">${opts}</div>` + noRes + searchRow : searchRow + opts + noRes}
            </div>`;
          })()
        : ''
    }
  </div>`;
}

/* Inspiration drop-ups: each panel opens upward from its own button, so the
   room it has differs per select. Size the open panel to reach just under
   the page cap, then keep the foot (most popular) in view. */
/* The open filter sheet must rest ON the bar stack underneath it -- the
   search row and its Advanced toggle -- instead of floating a fixed 120px
   above the nav and leaving a strip of page showing through. Measured live,
   because the stack is one bar on some pages and two on others. */
function csFitSheetFoot() {
  // Compatibility hook: filter panels now follow their search bar in flow.
}

function csFitBrowsePanel() {
  try {
    const wrap = document.querySelector('.app > main > .browse-selects');
    if (!wrap) return;
    const p = wrap.querySelector('.cselect-panel');
    if (!p) return;
    const host = p.closest('.cselect');
    if (!host) return;
    const hb = host.getBoundingClientRect().bottom;
    p.style.bottom = 'auto';
    p.style.top = 'calc(100% + 4px)';
    p.style.maxHeight = Math.max(160, Math.floor(window.innerHeight - hb - 100)) + 'px';
  } catch (e) {}
}

const CS_SHEETS = '.adv-panel, #colAdvBox';

function csRerender() {
  // Opening or closing a dropdown re-renders the whole page — without this,
  // the browser would snap the scroll back to the top every time.
  const y = pageScroller().scrollTop;
  // On Inspiration the page behind a drop-up is taken OUT of the layout,
  // so the scroll collapses to nothing. Remember where the feed stood when
  // the sheet opened and put it back when it closes.
  const csHides = !!document.querySelector('.app > main > .browse-selects');
  if (csHides) {
    if (state.openCSelect) {
      if (state._csPageY == null) state._csPageY = y;
    }
  }
  const offsets = Array.from(document.querySelectorAll(CS_SHEETS)).map((el) => el.scrollTop);
  render();
  pageScroller().scrollTo(0, y);
  if (csHides && !state.openCSelect && state._csPageY != null) {
    const back = state._csPageY;
    state._csPageY = null;
    requestAnimationFrame(() => {
      try {
        pageScroller().scrollTo(0, back);
      } catch (e) {}
    });
  }
  Array.from(document.querySelectorAll(CS_SHEETS)).forEach((el, i) => {
    if (offsets[i] == null) return;
    el.scrollTop = offsets[i];
  });
  // Dropdowns now live inside the reco overlay too; the page render above
  // never touches overlays, so refresh the reco body when it's up (outside
  // taps and hardware back both land here via the gatekeeper).
  if (document.getElementById('recoOverlay') && state.reco) {
    const m = document.querySelector('#recoOverlay main');
    const t = m ? m.scrollTop : 0;
    try {
      if (state.reco.loading) paintRecoMenus();
      else renderRecoBody();
    } catch (e) {}
    if (m) m.scrollTop = t;
  }
  const dpPick = document.querySelector('#deckPickScrim #recoColorPick');
  if (dpPick && dpPick._paint) {
    try {
      dpPick._paint();
    } catch (e) {}
  }
  csFitBrowsePanel();
  csFitSheetFoot();
  try {
    const m = document.querySelector('.app > main');
    if (m) m.classList.toggle('cs-open', !!state.openCSelect);
  } catch (e) {}
}

function wireCSelects() {
  document.querySelectorAll('[data-cs]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const csId = b.dataset.cs;
      // Inspiration stacks MOVE the opened select to the bottom slot, so there
      // the tapped button must not be held in place -- it has somewhere to go.
      if (b.closest('.browse-selects, .reco-themes')) {
        state.openCSelect = state.openCSelect === csId ? null : csId;
        csRerender();
        return;
      }
      // The button you tapped keeps its place on screen while the page is
      // rebuilt around it — the list opens upward, nothing springs.
      keepAnchored(
        b,
        () => {
          state.openCSelect = state.openCSelect === csId ? null : csId;
          csRerender();
        },
        () => {
          try {
            return document.querySelector('[data-cs="' + CSS.escape(csId) + '"]');
          } catch (err) {
            return null;
          }
        },
      );
      // Inside a scrolling filter sheet the panel opens UPWARD -- nudge the
      // sheet so the freshly opened panel is actually in view. Only sheet
      // panels match this selector, so nothing else ever moves.
      // (The sheet panels used to be scrolled into view here; that scroll WAS
      //  the jump. The anchor above already keeps them in sight.)
    }),
  );
  document.querySelectorAll('[data-csopt]').forEach((opt) =>
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = opt.dataset.csopt,
        val = opt.dataset.val;
      state.openCSelect = null;
      const h = _csHandlers[id];
      if (h) h(val);
      else csRerender();
    }),
  );
  wireCsSearchRows(document);
  wireArtTiles(document);
}

/* Searchable panels (long lists like Theme / Kindred): filter rows in place
   — no re-render, so the keyboard stays up and the panel stays open. Scoped
   by root so overlays can wire their own dropdowns. */
function wireCsSearchRows(root) {
  (root || document).querySelectorAll('.cselect-search').forEach((row) => {
    row.addEventListener('click', (e) => e.stopPropagation());
    const inp = row.querySelector('input');
    const panel = row.closest('.cselect-panel');
    if (!inp || !panel) return;
    const visibleOpts = () =>
      Array.from(panel.querySelectorAll('.cselect-opt')).filter((b) => b.style.display !== 'none');
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      panel.querySelectorAll('.cselect-opt').forEach((b) => {
        b.style.display = !q || b.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
      const nr = panel.querySelector('.cs-noresults');
      if (nr) nr.style.display = visibleOpts().length ? 'none' : '';
      if (panel.classList.contains('cs-artgrid')) {
        const sc = panel.querySelector('.cs-artscroll') || panel;
        sc.scrollTop = 0;
      }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const vis = visibleOpts().filter((b) => !b.classList.contains('opt-disabled'));
      // Bottom-up tile panels put the most popular option at the FOOT.
      const first = vis[0];
      if (first) first.click();
    });
  });
}

/* One capture-phase gatekeeper for every transient dropdown/menu: when one
   is open and a tap lands OUTSIDE it, the tap only closes it — nothing
   underneath fires. Taps inside the open menu keep working normally. */
document.addEventListener(
  'click',
  (e) => {
    const inside = (sel) => !!(e.target.closest && e.target.closest(sel));
    // A tap on a page in the bottom navigation is never just "close the menu":
    // the menu closes AND the page opens, in one tap. (The on-screen back
    // button and the hardware back still close the menu first.)
    const navHit = !!(
      e.target.closest && e.target.closest('.brand-banner [data-page], .brand-banner #homeBtn')
    );
    const swallow = () => {
      if (navHit) return;
      e.preventDefault();
      e.stopPropagation();
    };
    if (state.openCSelect) {
      const wrap = e.target.closest && e.target.closest('.cselect');
      if (!(wrap && wrap.querySelector('.cselect-panel'))) {
        swallow();
        state.openCSelect = null;
        try {
          csRerender();
        } catch (err) {}
      }
      return;
    }
    const tm = document.getElementById('tileMenuPop');
    if (tm) {
      if (!inside('#tileMenuPop')) {
        swallow();
        tm.remove();
      }
      return;
    }
    const fm = document.getElementById('fabMenu');
    if (fm) {
      if (!inside('#fabMenu')) {
        swallow();
        fm.remove();
      }
      return;
    }
    const bp = document.getElementById('bindersPop');
    if (bp) {
      if (!inside('#bindersPop')) {
        swallow();
        bp.remove();
      }
      return;
    }
    const pd = Array.from(document.querySelectorAll('.pd-panel')).find((p) => !p.hidden);
    if (pd) {
      if (!inside('.pd')) {
        swallow();
        pd.hidden = true;
      }
      return;
    }
  },
  true,
);

/* The ✕ beside Search is gone: the hardware back press wipes Inspiration
   to its clean start (see appBackStep), so the button only duplicated a
   gesture on an already crowded row. */
/* One handler flips every double-faced card in place. The tap is fully
   consumed — it never opens the card page or selects the tile beneath. */
document.addEventListener(
  'click',
  async (e) => {
    const btn = e.target.closest && e.target.closest('.dfc-flip');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const host = btn.closest('.dfc-flip-box') && btn.closest('.dfc-flip-box').parentElement;
    const img = host && host.querySelector('img');
    if (!img) return;
    // Meld halves fetch their COMPLETE meld result on first flip.
    if (btn.dataset.meld && !btn.dataset.back) {
      if (btn.dataset.loading) return;
      btn.dataset.loading = '1';
      try {
        const b = await meldResultImage(btn.dataset.meld);
        if (b) btn.dataset.back = b;
      } catch (_) {}
      delete btn.dataset.loading;
      if (!btn.dataset.back) return;
    }
    const toBack = btn.dataset.showing !== 'back';
    // Remembered per card for the session: the card page, the full view and
    // every tile of that card show the face you turned to.
    const key = dfcKey(btn.dataset.front);
    if (toBack) _dfcBack.add(key);
    else _dfcBack.delete(key);
    dfcPaint(btn, toBack);
    document.querySelectorAll('.dfc-flip').forEach((b) => {
      if (b !== btn && dfcKey(b.dataset.front) === key && (b.dataset.showing === 'back') !== toBack)
        dfcPaint(b, toBack);
    });
  },
  true,
);

/* Which two-faced cards are turned over right now (by card id). */
const _dfcBack = new Set();

function dfcKey(u) {
  const m = String(u || '').match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return m ? m[1].toLowerCase() : String(u || '').split('?')[0];
}

function dfcPaint(btn, toBack) {
  const host = btn.closest('.dfc-flip-box') && btn.closest('.dfc-flip-box').parentElement;
  const img = host && host.querySelector('img');
  if (!img || (toBack && !btn.dataset.back)) return;
  img.src = toBack ? btn.dataset.back : btn.dataset.front;
  img.dataset.dfcBack = toBack ? '1' : '';
  btn.dataset.showing = toBack ? 'back' : 'front';
  btn.classList.toggle('flipped', toBack);
}

// A card drawn anew (the card page opening, a tile re-rendered, the full
// view) turns to the remembered face before it is painted.
try {
  new MutationObserver((muts) => {
    if (!_dfcBack.size) return;
    for (const m of muts)
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const btns =
          n.matches && n.matches('.dfc-flip')
            ? [n]
            : n.querySelectorAll
              ? n.querySelectorAll('.dfc-flip')
              : [];
        btns.forEach((b) => {
          if (b.dataset.showing !== 'back' && _dfcBack.has(dfcKey(b.dataset.front)))
            dfcPaint(b, true);
        });
      }
  }).observe(document.documentElement, { childList: true, subtree: true });
} catch (e) {}

/* The full view of a card: a two-faced card opens on the face that is
   showing, and carries the same flip button at the same spot on the card. */
function showCardPreview(card, src) {
  const d = card ? dfcBackFace(card) : null;
  if (!d) {
    showPreview(src, card && card.border_color === 'white');
    return;
  }
  const big = (u) => String(u).replace('/normal/', '/large/');
  // The card's own two faces (its printing), large; the id in their paths
  // ties this view to the remembered face.
  const front = big(d.front);
  state.preview = null;
  showPreview(front, card.border_color === 'white');
  state.preview.flip = { front, back: big(d.back), key: dfcKey(d.front) };
  renderPreview();
}

/* An unfolded Extras accordion joins the overlay ladder, so hardware back
   folds it instead of leaving Extras. Folding by tap drops its entry the
   dismissAll way (history entry left inert; the ladder re-arms). */

function foldIcoHtml(open) {
  return /* HTML */ `<span class="fold-ico">${open ? '\u25B4' : '\u25BE'}</span>`;
}

const _folds = [];

function foldSet(body, open, onChange, row) {
  if (!body) return;
  if (open) {
    body.hidden = false;
    const i = _folds.findIndex((f) => f.body === body);
    if (i >= 0) _folds.splice(i, 1);
    _folds.push({ body, onChange, row });
  } else {
    for (let i = _folds.length - 1; i >= 0; i--) {
      const f = _folds[i];
      if (f.body !== body && body.contains(f.body)) {
        _folds.splice(i, 1);
        f.body.hidden = true;
        try {
          f.onChange && f.onChange(false);
        } catch (e) {}
      }
    }
    body.hidden = true;
    const i = _folds.findIndex((f) => f.body === body);
    if (i >= 0) _folds.splice(i, 1);
  }
  try {
    onChange && onChange(open);
  } catch (e) {}
}

function foldToggle(body, onChange, row) {
  foldSet(body, !!(body && body.hidden), onChange, row);
}

function closeLastFold() {
  while (_folds.length) {
    const f = _folds[_folds.length - 1];
    if (!f.body.isConnected || f.body.hidden) {
      _folds.pop();
      continue;
    }
    const shut = () => foldSet(f.body, false, f.onChange);
    if (f.row && f.row.isConnected)
      keepAnchored(f.row, shut, () => (f.row.isConnected ? f.row : null));
    else shut();
    return true;
  }
  return false;
}

function closeAllFolds() {
  while (_folds.length) {
    const f = _folds.pop();
    if (f.body.isConnected) {
      f.body.hidden = true;
      try {
        f.onChange && f.onChange(false);
      } catch (e) {}
    }
  }
}

function toggleAccordionBody(body, id) {
  const ico = {
    guild: '#guildCur .fold-ico',
    dataSrc: '#dataSourcesRow .fold-ico',
    about: '#aboutRow .fold-ico',
  }[id];
  const row = { guild: 'guildRow', dataSrc: 'dataSourcesRow', about: 'aboutRow' }[id];
  foldToggle(
    body,
    (open) => {
      const c = ico && document.querySelector(ico);
      if (c) c.textContent = open ? '\u25B4' : '\u25BE';
    },
    row ? document.getElementById(row) : null,
  );
}

document.addEventListener('click', (e) => {
  const gRow = e.target.closest && e.target.closest('#guildRow');
  if (gRow) {
    const b = document.getElementById('guildBody');
    if (b)
      keepAnchored(
        gRow,
        () => toggleAccordionBody(b, 'guild'),
        () => (gRow.isConnected ? gRow : null),
      );
    return;
  }
  const abRow = e.target.closest && e.target.closest('#aboutRow');
  if (abRow) {
    const b = document.getElementById('aboutBody');
    if (b) {
      keepAnchored(
        abRow,
        () => toggleAccordionBody(b, 'about'),
        () => (abRow.isConnected ? abRow : null),
      );
      if (!b.hidden) dropReveal(abRow);
    }
    return;
  }
  const dsRow = e.target.closest && e.target.closest('#dataSourcesRow');
  if (dsRow) {
    const b = document.getElementById('dataSourcesBody');
    if (b)
      keepAnchored(
        dsRow,
        () => toggleAccordionBody(b, 'dataSrc'),
        () => (dsRow.isConnected ? dsRow : null),
      );
    return;
  }
  const gOpt = e.target.closest && e.target.closest('[data-guild]');
  if (gOpt) {
    const g = GUILDS.find((x) => x.k === gOpt.dataset.guild);
    if (g) {
      state.guild = g.k;
      applyTheme();
      persistSettings();
      document
        .querySelectorAll('[data-guild]')
        .forEach((x) => x.classList.toggle('sel', x.dataset.guild === g.k));
      const cur = document.getElementById('guildCur');
      if (cur) cur.innerHTML = manaIconSvg(g.main, 22) + manaIconSvg(g.side, 22);
      const b = document.getElementById('guildBody');
      if (b && !b.hidden) toggleAccordionBody(b, 'guild');
    }
    return;
  }
  const frRow = e.target.closest && e.target.closest('#fmtRulesRow');
  // Short folds open UPWARD (the row stays under your thumb, the rest grows
  // above it). The long reads -- format rules, ban lists, About -- open
  // DOWNWARD and bring their row up under the title (dropReveal).
  const _up = (el, fn) => keepAnchored(el, fn, () => (el.isConnected ? el : null));
  if (frRow) {
    switchPage('formatrules');
    return;
  }
  const ff = e.target.closest && e.target.closest('[data-fmtfull]');
  if (ff) {
    const fbox = ff.parentElement.querySelector('[data-fmtfullbox="' + ff.dataset.fmtfull + '"]');
    if (fbox) {
      _up(ff, () => {
        if (fbox.hidden && !fbox.innerHTML) fbox.innerHTML = fmtFullRulesHtml(ff.dataset.fmtfull);
        foldToggle(
          fbox,
          (open) => {
            ff.innerHTML = foldIcoHtml(open) + ' ' + trS('Complete rules');
          },
          ff,
        );
      });
      if (!fbox.hidden) dropReveal(ff);
    }
    return;
  }
  const fr = e.target.closest && e.target.closest('[data-fmtrule]');
  if (fr) {
    if (e.target.closest('[data-fmtfullbox]')) return; // reading the full rules, not a toggle
    const t = fr.querySelector('[data-fmtruletxt]');
    const lab = fr.querySelector('.l1') || fr;
    if (t) {
      _up(lab, () => {
        foldToggle(
          t,
          (open) => {
            const ic = lab.querySelector('.fold-ico');
            if (ic) ic.textContent = open ? '\u25B4' : '\u25BE';
          },
          lab,
        );
      });
      if (!t.hidden) dropReveal(lab);
    }
    return;
  }
  const blRow = e.target.closest && e.target.closest('#banListsRow');
  if (blRow) {
    switchPage('banlists');
    return;
  }
  const bw = e.target.closest && e.target.closest('[data-banwhy]');
  if (bw) {
    const wbox = bw.parentElement.querySelector('[data-banwhybox]');
    if (wbox)
      _up(bw, () => {
        if (wbox.hidden && !wbox.innerHTML) wbox.innerHTML = banInfoHtml(bw.dataset.banwhy);
        foldToggle(
          wbox,
          (open) => {
            bw.innerHTML = foldIcoHtml(open) + ' ' + trS('About this ban list');
          },
          bw,
        );
      });
    // A long read, top to bottom: once open, its first line sits just under
    // the page title (inside a floating Extras fold: at the fold's top).
    if (!wbox.hidden && bw.closest('main.xt-tiles .xt-body')) {
      dropReveal(bw);
      return;
    }
    if (!wbox.hidden)
      requestAnimationFrame(() => {
        try {
          // The page title bar is the element at the very top of the screen.
          const top = document.elementFromPoint(window.innerWidth / 2, 4);
          const bar =
            top && top.closest
              ? top.closest('header, .topbar, .page-cap, .app-top, [class*="cap"]')
              : null;
          const br = bar ? bar.getBoundingClientRect().bottom : 0;
          const off = (br > 20 && br < 200 ? br : 90) + 8;
          pageScroller().scrollBy(0, bw.getBoundingClientRect().top - off);
        } catch (err) {}
      });
    return;
  }
  const bi = e.target.closest && e.target.closest('.ban-item');
  if (bi && bi.closest('[data-banbox]')) {
    e.stopPropagation();
    openBanCardPreview(bi);
    return;
  }
  const bf = e.target.closest && e.target.closest('[data-banfmt]');
  if (bf) {
    if (e.target.closest('[data-banwhybox]')) return; // reading the notes or setting the sets, not a toggle
    const box = bf.querySelector('[data-banbox]');
    const lab = bf.querySelector('.l1') || bf;
    if (box) {
      _up(lab, () => {
        foldToggle(
          box,
          (open) => {
            const ic = lab.querySelector('.fold-ico');
            if (ic) ic.textContent = open ? '\u25B4' : '\u25BE';
          },
          lab,
        );
        if (!box.hidden && !box.dataset.loaded) {
          box.dataset.loaded = '1';
          fillBanList(bf.dataset.banfmt, box);
        }
      });
      if (!box.hidden) dropReveal(lab);
    }
    return;
  }
  if (
    e.target &&
    e.target.closest &&
    e.target.closest('#capNoteBtn') &&
    state.screen === 'decklist'
  ) {
    const dd = getDeck(state.activeDeckId);
    if (dd) openDeckPricePage(dd);
    return;
  }
  if (e.target?.closest?.('#capNoteBtn') && state.screen === 'collection') {
    const key = collectionValueKey();
    notePrice(key, collectionTotalValue(collectionValueItems()));
    openPriceHistory('Collection Value', key);
  }
  if (e.target && e.target.id === 'blSuggestLands') {
    const d = getDeck(state.activeDeckId);
    if (d) openLandSuggest(d);
  }
  if (e.target?.closest?.('#proxyExport')) {
    const d = getDeck(state.activeDeckId);
    if (d) openProxySheet(d);
  }
});

/* Quoted-name links in the deck's description & primer: tap opens the card's
   normal detail sheet — fetched fuzzily so small typos still land. */
document.addEventListener(
  'click',
  async (e) => {
    const a = e.target.closest && e.target.closest('.card-ql');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const nm = (a.textContent || '').trim();
    if (!nm) return;
    try {
      const r = await sfFetch(`${SF_BASE}/cards/named?fuzzy=${encodeURIComponent(nm)}`);
      if (r.ok) openCardInfo(await r.json());
      else toast(`No card found for “${nm}”.`);
    } catch (err) {
      toast('Couldn\u2019t reach Scryfall.');
    }
  },
  true,
);

// The last moment the person touched or wheeled the page: delayed
// re-anchors (fresh search results settling) must never yank the view
// after the person has started scrolling themselves.
window.addEventListener(
  'touchstart',
  () => {
    state._userScrollAt = Date.now();
  },
  { passive: true, capture: true },
);

window.addEventListener(
  'wheel',
  () => {
    state._userScrollAt = Date.now();
  },
  { passive: true, capture: true },
);

/* ---- Card names and prices NEVER overlap ----
   The CSS hard-caps every title's box beside its price pill; this fitter
   then AUTO-SCALES the name down until it truly fits that box. */
const _fitCache = new Map();

/* A title always fits, fully visible, never cut off and never an ellipsis:
   1. at its own size on one line, if it fits;
   2. else, for a two-line title, the largest size at which it fits on two
      lines -- wrapping only between words (a hyphen may break, a word never);
   3. else smaller, until it fits (single-line titles go straight to this).
   Fitness is measured on the element itself: no word may stick out
   sideways (scrollWidth) and the text may not need more lines (scrollHeight). */
function fitTitleText(el) {
  try {
    if (!el || !el.isConnected || !el.clientWidth) return;
    // The main title has its own canvas fitter. Overlay titles fit their text
    // inside the shared header's fixed-size button, rather than measuring the button.
    if (el.matches('.app-header > .brand-txt')) return;
    if (el.matches('.app-titlebar > .brand-txt')) {
      let text = el.querySelector(':scope > .app-title-text');
      if (!text) {
        text = document.createElement('span');
        text.className = 'app-title-text two-line';
        text.textContent = el.textContent.trim();
        el.replaceChildren(text);
      }
      fitTitleText(text);
      return;
    }
    // Same words in the same space always settle at the same size.
    const key =
      el.className +
      '|' +
      el.clientWidth +
      '|' +
      (el.style.maxWidth || '') +
      '|' +
      (el.textContent || '').trim();
    if (el.dataset.fitKey === key) return; // this node is already settled
    const two = el.classList.contains('two-line');
    const st = el.style;
    st.display = 'block';
    st.webkitLineClamp = 'unset';
    st.maxHeight = 'none';
    st.textOverflow = 'clip';
    st.lineHeight = '1.2';
    st.overflowWrap = 'normal';
    st.wordBreak = 'keep-all';
    st.hyphens = 'manual';
    st.whiteSpace = two ? 'normal' : 'nowrap';
    const known = _fitCache.get(key);
    if (known != null) {
      // seen before: no reset, no shrinking
      st.fontSize = known + 'px';
      el.dataset.fitKey = key;
      return;
    }
    if (!el.dataset.fitBase) {
      st.fontSize = '';
      el.dataset.fitBase = String(parseFloat(getComputedStyle(el).fontSize) || 16);
    }
    const base = parseFloat(el.dataset.fitBase);
    const fitsAt = (sz, lines) => {
      st.fontSize = sz + 'px';
      return (
        el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= Math.ceil(sz * 1.2 * lines) + 2
      );
    };
    let size = base;
    if (!fitsAt(size, 1)) {
      const lines = two ? 2 : 1;
      while (size > 7 && !fitsAt(size, lines)) size -= 0.5;
      fitsAt(size, lines);
    }
    if (_fitCache.size > 400) _fitCache.clear(); // deck names come and go; never grow without bound
    _fitCache.set(key, size);
    el.dataset.fitKey = key;
  } catch (e) {}
}

let _fitQueued = false;

/* The title sits centred between whatever rides the cap's corners (a card
   count on the left, the collection's value on the right). A fixed CSS
   allowance guessed that room -- and on the phone, with the real title
   font, "MY COLLECTION" did not fit and was cut off although there was
   space enough. Measure it: twice the distance from the centre to the
   nearer corner item. */
function fitCapRoom(cap) {
  try {
    const t = cap.querySelector(':scope > .brand-txt');
    if (!t) return;
    const cr = cap.getBoundingClientRect();
    if (!cr.width) return;
    const mid = (cr.left + cr.right) / 2;
    const ccs = getComputedStyle(cap);
    let L = cr.left + Math.max(8, parseFloat(ccs.paddingLeft) || 0),
      Rr = cr.right - Math.max(8, parseFloat(ccs.paddingRight) || 0);
    Array.from(cap.children).forEach((k) => {
      if (k === t) return;
      // A corner item that changes size later (the price arriving in its
      // pill) must re-measure the room -- a text change alone was not enough.
      if (!k._fitRO && window.ResizeObserver) {
        k._fitRO = new ResizeObserver(() => {
          delete t.dataset.fitKey;
          fitTitleBars();
        });
        k._fitRO.observe(k);
      }
      const cs = getComputedStyle(k);
      if (cs.position !== 'absolute' || cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = k.getBoundingClientRect();
      if (!r.width) return;
      if (r.right <= mid) L = Math.max(L, r.right + 12);
      else if (r.left >= mid) Rr = Math.min(Rr, r.left - 12);
    });
    const room = Math.max(80, Math.floor(2 * Math.min(mid - L, Rr - mid)));
    if (t.style.maxWidth !== room + 'px') {
      t.style.maxWidth = room + 'px';
      delete t.dataset.fitKey;
    }
  } catch (e) {}
}

/* Typing fields never autocorrect: a card name, a deck name, a filter --
   the phone's keyboard must not "fix" a word when space is pressed. Longer
   prose (textareas: notes, primers) keeps the keyboard's help. */
function hardenInputs(root) {
  (root || document)
    .querySelectorAll(
      'input:not([type]):not([data-noac]), input[type=text]:not([data-noac]), input[type=search]:not([data-noac])',
    )
    .forEach((el) => {
      el.setAttribute('autocorrect', 'off');
      el.setAttribute('autocomplete', 'off');
      el.setAttribute('spellcheck', 'false');
      if (!el.hasAttribute('autocapitalize')) el.setAttribute('autocapitalize', 'off');
      el.setAttribute('data-noac', '1');
    });
}

/* No native pickers: every <select> is drawn as the app's own field, and
   opens the app's own menu -- a DROP-UP above the field, first option at
   the foot, nearest the thumb. The real <select> stays (hidden) as the
   value holder, so every existing .value read and 'change' handler works. */
function nselLabel(sel) {
  const o = sel.options[sel.selectedIndex] || sel.options[0];
  return o ? o.textContent : '';
}

function enhanceSelects(root) {
  (root || document).querySelectorAll('select:not([multiple]):not([data-nsel])').forEach((sel) => {
    sel.setAttribute('data-nsel', '1');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cselect-btn nsel-btn';
    if (sel.style.flex) btn.style.flex = sel.style.flex;
    btn.innerHTML = /* HTML */ `<span class="nsel-lbl"></span><span class="nsel-caret">▴</span>`;
    btn.querySelector('.nsel-lbl').textContent = nselLabel(sel);
    sel.style.display = 'none';
    sel.insertAdjacentElement('afterend', btn);
    btn._sel = sel;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openNselMenu(btn);
    });
    sel.addEventListener('change', () => {
      const l = btn.querySelector('.nsel-lbl');
      if (l) l.textContent = nselLabel(sel);
    });
  });
  // Options can arrive after the field was drawn (filled in later): keep labels true.
  (root || document).querySelectorAll('.nsel-btn').forEach((b) => {
    const l = b.querySelector('.nsel-lbl');
    if (b._sel && l) {
      const t = nselLabel(b._sel);
      if (l.textContent !== t) l.textContent = t;
    }
  });
}

function closeNselMenu() {
  document.getElementById('nselPop')?.remove();
  document.getElementById('nselShield')?.remove();
}

function openNselMenu(btn) {
  closeNselMenu();
  const sel = btn._sel;
  if (!sel) return;
  const r = btn.getBoundingClientRect();
  const shield = document.createElement('div');
  shield.id = 'nselShield';
  shield.addEventListener('click', closeNselMenu);
  const pop = document.createElement('div');
  pop.id = 'nselPop';
  pop.className = 'cselect-panel nsel-pop';
  // Drop-up: glued to the field's top edge, growing upward; the list is
  // column-reverse, so the FIRST option sits at the foot, right above the field.
  pop.style.left = Math.max(8, r.left) + 'px';
  pop.style.width = Math.min(window.innerWidth - 16, Math.max(r.width, 200)) + 'px';
  {
    // A dropdown under the field, first option at the top.
    pop.style.top = Math.round(r.bottom + 4) + 'px';
    pop.style.bottom = 'auto';
    pop.style.maxHeight = Math.max(160, window.innerHeight - r.bottom - 16) + 'px';
  }
  Array.from(sel.options).forEach((o, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className =
      'cselect-opt' + (i === sel.selectedIndex ? ' on' : '') + (o.disabled ? ' opt-disabled' : '');
    b.textContent = o.textContent;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (o.disabled) return;
      closeNselMenu();
      if (sel.selectedIndex !== i) {
        sel.selectedIndex = i;
        const l = btn.querySelector('.nsel-lbl');
        if (l) l.textContent = nselLabel(sel);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    pop.appendChild(b);
  });
  document.body.appendChild(shield);
  document.body.appendChild(pop);
  pop.scrollTop = 0;
}

try {
  let _enhQ = false;
  const enh = () => {
    if (_enhQ) return;
    _enhQ = true;
    requestAnimationFrame(() => {
      _enhQ = false;
      hardenInputs();
      enhanceSelects();
    });
  };
  new MutationObserver(enh).observe(document.body, { childList: true, subtree: true });
  // Belt and braces: a field focused before the observer ran still gets it.
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT') hardenInputs(t.parentNode || document);
    },
    true,
  );
  hardenInputs();
  enhanceSelects();
} catch (e) {}

function fitTitleBars() {
  if (_fitQueued) return;
  _fitQueued = true;
  requestAnimationFrame(() => {
    _fitQueued = false;
    document.querySelectorAll('.page-cap, .ov-cap, .overlay .topbar').forEach(fitCapRoom);
    document
      .querySelectorAll(
        '.page-cap .brand-txt, .ov-cap .brand-txt, .overlay .topbar .brand-txt, .tb-titles .t1',
      )
      .forEach(fitTitleText);
  });
}

/* A title measured in the fallback font is measured wrong: the display
   font arrives a moment later and is wider. Forget every settled size the
   moment it lands, and fit again. */
function refitAllTitles() {
  _fitCache.clear();
  document.querySelectorAll('[data-fit-key]').forEach((el) => {
    delete el.dataset.fitKey;
  });
  fitTitleBars();
}

try {
  new MutationObserver(fitTitleBars).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', refitAllTitles);
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(refitAllTitles).catch(() => {});
    document.fonts.addEventListener &&
      document.fonts.addEventListener('loadingdone', refitAllTitles);
  }
  fitTitleBars();
} catch (e) {}

document.addEventListener('click', (e) => {
  // A tap anywhere outside the deck's ⋯ menu folds it away.
  if (
    state.menuOpen &&
    !(e.target.closest && (e.target.closest('#menuPop') || e.target.closest('#menuBtn')))
  ) {
    popDeckMenu();
    try {
      const dd = getDeck(state.activeDeckId);
      if (dd) updateDeckMeter(dd);
    } catch (err) {}
  }
});

/* Mana symbols from "Mana" by Andrew Gioia (SIL OFL 1.1) — the official
   glyphs, drawn dark on the classic colored circles, everywhere the app
   shows a color: filters, folders, binders, color breakdowns, pickers. */
const MANA_GLYPHS = {
  W: {
    bg: '#f8f6d8',
    d: 'M31.915 18.358c-2.189-1.234-3.593-1.852-4.21-1.852-0.448 0-0.799 0.344-1.052 1.032s-0.758 1.031-1.515 1.031c-0.309 0-0.94-0.112-1.895-0.336-0.533 0.814-0.8 1.334-0.8 1.558 0 0.309 0.23 0.673 0.689 1.095s0.846 0.631 1.162 0.631c0.201 0 0.473-0.042 0.817-0.127 0.344-0.083 0.574-0.126 0.689-0.126 0.345 0 0.516 0.632 0.516 1.895 0 1.207-0.28 3.059-0.842 5.558-0.73-2.863-1.502-4.295-2.315-4.295-0.113 0-0.344 0.084-0.695 0.254-0.351 0.168-0.611 0.252-0.779 0.252-0.814 0-1.543-0.743-2.189-2.232-1.291 0.197-1.937 0.857-1.937 1.98 0 0.562 0.259 1.010 0.779 1.347 0.518 0.336 0.779 0.576 0.779 0.716 0 0.759-1.109 1.924-3.327 3.495-1.178 0.842-1.993 1.431-2.441 1.768 0.392-0.505 0.785-1.164 1.179-1.978 0.448-0.926 0.673-1.642 0.673-2.148 0-0.28-0.323-0.674-0.968-1.179s-0.968-1.038-0.968-1.599c0-0.477 0.168-1.066 0.505-1.768-0.365-0.421-0.799-0.632-1.305-0.632-1.123 0-1.684 0.366-1.684 1.095 0-0.505 0-0.127 0 1.137 0.027 0.926-0.674 1.39-2.106 1.39-1.094 0-2.934-0.253-5.515-0.758 2.919-0.73 4.379-1.572 4.379-2.526 0 0.112-0.056-0.224-0.168-1.011-0.113-0.869 0.505-1.656 1.852-2.357-0.253-1.291-0.925-1.938-2.021-1.938-0.168 0-0.478 0.295-0.926 0.883-0.449 0.591-0.87 0.885-1.262 0.885-0.674 0-1.545-0.73-2.61-2.19-0.506-0.729-1.278-1.81-2.316-3.242 0.645 0.338 1.291 0.674 1.937 1.011 0.842 0.392 1.515 0.589 2.021 0.589 0.393 0 0.779-0.344 1.158-1.032s0.877-1.032 1.495-1.032c0.085 0 0.646 0.168 1.684 0.506 0.533-0.814 0.8-1.418 0.8-1.811 0-0.337-0.204-0.723-0.611-1.158s-0.779-0.652-1.116-0.652c-0.141 0-0.358 0.042-0.653 0.126-0.294 0.084-0.512 0.127-0.652 0.127-0.506 0-0.758-0.632-0.758-1.895 0-0.337 0.323-2.259 0.969-5.768-0.029 0.42 0.154 1.207 0.547 2.357 0.477 1.404 1.038 2.105 1.685 2.105 0.111 0 0.336-0.084 0.673-0.253s0.603-0.252 0.8-0.252c0.645 0 1.178 0.365 1.6 1.094l0.632 1.137c0.589 0 1.081-0.21 1.473-0.631s0.59-0.927 0.59-1.516c0-0.617-0.259-1.088-0.779-1.411s-0.78-0.568-0.78-0.737c0-0.59 0.927-1.586 2.779-2.989 1.487-1.122 2.456-1.782 2.906-1.979-1.207 1.628-1.811 2.82-1.811 3.579 0 0.393 0.238 0.815 0.716 1.263 0.589 0.533 0.926 0.912 1.010 1.137 0.28 0.647 0.252 1.53-0.084 2.653 0.758 0.534 1.333 0.8 1.727 0.8 0.813 0 1.221-0.422 1.221-1.263 0-0.084-0.035-0.351-0.105-0.8-0.071-0.449-0.091-0.702-0.064-0.758 0.112-0.393 0.884-0.59 2.316-0.59 0.898 0 2.764 0.253 5.6 0.758-0.618 0.168-1.544 0.42-2.779 0.758-1.123 0.337-1.685 0.716-1.685 1.137 0 0.197 0.070 0.533 0.211 1.010s0.211 0.828 0.211 1.053c0 0.392-0.253 0.758-0.758 1.094l-1.432 1.011c0.337 0.618 0.561 0.983 0.674 1.094 0.28 0.336 0.659 0.505 1.137 0.505 0.337 0 0.645-0.295 0.926-0.884s0.73-0.884 1.347-0.884c0.758 0 1.614 0.702 2.569 2.106 0.532 0.788 1.36 1.98 2.483 3.58zM22.569 15.917c0-1.796-0.66-3.354-1.98-4.674s-2.877-1.979-4.673-1.979c-1.825 0-3.397 0.653-4.716 1.959s-1.993 2.87-2.021 4.694c-0.029 1.796 0.638 3.347 2 4.651 1.362 1.305 2.94 1.959 4.736 1.959 1.909 0 3.501-0.625 4.778-1.874 1.278-1.248 1.902-2.827 1.875-4.736zM21.937 15.917c0 1.712-0.576 3.131-1.727 4.252-1.152 1.124-2.583 1.685-4.295 1.685-1.656 0-3.074-0.575-4.252-1.727-1.178-1.15-1.768-2.554-1.768-4.21 0-1.627 0.596-3.025 1.788-4.189 1.194-1.165 2.604-1.748 4.232-1.748s3.038 0.589 4.232 1.769c1.193 1.179 1.79 2.568 1.79 4.168z',
  },
  U: {
    bg: '#c1d7e9',
    d: 'M23.11 29.095c-1.903 1.937-4.248 2.905-7.033 2.905-3.126 0-5.605-1.070-7.439-3.21-1.733-2.038-2.599-4.637-2.599-7.795 0-3.397 1.478-7.271 4.433-11.62 2.411-3.566 5.248-6.692 8.509-9.375-0.476 2.175-0.713 3.72-0.713 4.637 0 2.107 0.662 4.162 1.986 6.166 1.631 2.378 2.87 4.145 3.72 5.299 1.325 2.005 1.987 3.958 1.987 5.859 0.001 2.82-0.951 5.198-2.852 7.133zM23.058 18.216c-0.509-1.138-1.104-1.893-1.784-2.268 0.102 0.204 0.153 0.493 0.153 0.867 0 0.714-0.204 1.732-0.612 3.057l-0.662 2.038c0 1.189 0.593 1.784 1.783 1.784 1.256 0 1.885-0.833 1.885-2.497 0-0.848-0.254-1.842-0.764-2.981z',
  },
  B: {
    bg: '#cbc2bf',
    d: 'M31.406 15.477c0 2.089-0.76 3.513-2.279 4.273-0.444 0.222-1.836 0.522-4.178 0.902-1.519 0.254-2.278 0.839-2.278 1.756v3.845c0 0.16 0.047 0.649 0.142 1.472l0.143 1.52c0 0.475-0.111 1.251-0.333 2.327-0.601 0.126-1.298 0.268-2.089 0.428-0.254-0.951-0.38-1.599-0.38-1.948 0-0.157 0.040-0.396 0.119-0.712 0.078-0.316 0.12-0.553 0.12-0.713 0-0.22-0.197-0.838-0.59-1.85h-0.736c-0.098 0.158-0.13 0.364-0.098 0.617 0.126 0.538 0.174 0.997 0.143 1.377-0.538 0.38-1.282 0.886-2.232 1.519-0.222-0.063-0.3-0.095-0.238-0.095v-3.371c-0.062-0.157-0.221-0.22-0.475-0.19h-0.569l-0.569 4.462c-0.444 0.032-0.981 0.032-1.614 0-0.223-1.044-0.617-2.594-1.187-4.652h-0.38c-0.349 1.109-0.538 1.711-0.57 1.805 0 0.126 0.039 0.371 0.119 0.735 0.078 0.364 0.118 0.609 0.118 0.736 0 0.095-0.032 0.332-0.095 0.712l-0.143 1.139c-0.064 0.063-0.143 0.095-0.237 0.095-0.949 0-1.583-0.237-1.899-0.711-0.316-0.475-0.444-1.14-0.38-1.995l0.38-5.696c0-0.095 0.031-0.222 0.095-0.38 0.062-0.158 0.095-0.269 0.095-0.332 0-0.254-0.269-0.76-0.807-1.52-0.094-0.031-0.586-0.143-1.471-0.333-0.539-0.126-1.599-0.348-3.181-0.665-2.185-0.41-3.276-2.167-3.276-5.269 0-4.621 1.9-8.466 5.698-11.536 0.157 0.855 0.427 1.993 0.806 3.418 0.285 0.064 0.903 0.206 1.852 0.427 0.191 0.064 1.156 0.412 2.897 1.045-0.887-0.538-2.042-1.408-3.466-2.611-0.538-0.633-0.807-1.692-0.807-3.18 0-0.348 0.602-0.76 1.805-1.236 1.075-0.443 1.883-0.695 2.421-0.759 1.709-0.22 3.022-0.333 3.941-0.333 3.955 0 7.151 1.014 9.588 3.039-0.79 0.918-2.152 1.898-4.082 2.942 0.76 0.032 1.868-0.268 3.323-0.902 1.455-0.632 2.073-0.949 1.852-0.949 0.253 0 0.76 0.507 1.52 1.519 0.569 0.759 1.028 1.441 1.377 2.041 1.012 1.805 1.692 3.751 2.042 5.839 0 0.729 0.015 1.251 0.047 1.567v0.38h0.001zM13.224 16.332c0-1.361-0.594-2.651-1.78-3.87s-2.461-1.827-3.822-1.827c-1.203 0-2.263 0.51-3.181 1.529s-1.377 2.151-1.377 3.393c0 1.082 0.522 1.784 1.567 2.102 0.665 0.192 1.597 0.303 2.801 0.334h2.611c2.119 0.032 3.181-0.522 3.181-1.661zM18.398 22.219v-1.472c-0.221-0.411-0.443-0.838-0.664-1.282-0.19-0.634-0.538-1.52-1.045-2.659l-0.523 5.555c0 0.444-0.095 0.665-0.285 0.665-0.126 0-0.221-0.031-0.285-0.094-0.222-3.355-0.333-4.811-0.333-4.369v-1.661c-0.064-0.096-0.142-0.143-0.237-0.143-1.077 1.109-1.614 2.897-1.614 5.365 0 1.361 0.125 2.2 0.379 2.517 0.254-0.063 0.538-0.174 0.855-0.332 0.126-0.064 0.49-0.095 1.093-0.095 0.6 0 1.329 0.19 2.183 0.569 0.316 0 0.475-0.854 0.475-2.562zM29.127 15.604c0-1.275-0.475-2.413-1.424-3.416s-2.042-1.505-3.275-1.505c-1.329 0-2.572 0.608-3.727 1.827s-1.733 2.492-1.733 3.822c0 1.108 0.538 1.661 1.614 1.661h5.459c2.057-0.031 3.086-0.828 3.086-2.389z',
  },
  R: {
    bg: '#e49977',
    d: 'M30.857 22.306c-1.393 3.322-4.16 4.983-8.304 4.983-0.759 0-1.583 0.095-2.468 0.284-1.329 0.285-1.993 0.681-1.993 1.188 0 0.158 0.11 0.339 0.332 0.545 0.221 0.206 0.412 0.308 0.569 0.308-0.791 0-0.253 0.024 1.613 0.071s3.038 0.071 3.512 0.071c-2.752 1.613-7.356 2.356-13.81 2.23-2.12-0.031-3.939-0.965-5.457-2.8-1.488-1.741-2.231-3.686-2.231-5.837 0-2.277 0.767-4.216 2.302-5.814 1.533-1.596 3.441-2.396 5.718-2.396 0.506 0 1.178 0.111 2.017 0.332s1.4 0.332 1.684 0.332c1.17 0 2.626-0.482 4.367-1.448s2.563-1.448 2.468-1.448c-0.317 3.322-1.424 5.553-3.323 6.691-1.36 0.791-2.040 1.566-2.040 2.325 0 0.475 0.285 0.855 0.854 1.14 0.443 0.222 0.933 0.333 1.471 0.333 0.823 0 1.63-0.506 2.421-1.518 0.79-1.013 1.139-1.93 1.044-2.753-0.095-0.949-0.031-2.089 0.19-3.416 0.063-0.38 0.292-0.846 0.687-1.399s0.752-0.894 1.068-1.021c0 0.284-0.103 0.759-0.309 1.423s-0.308 1.156-0.308 1.471c0 0.696 0.189 1.234 0.569 1.613 0.569-0.221 1.075-0.933 1.519-2.136 0.379-0.917 0.6-1.803 0.664-2.657-1.329-0.063-2.603-0.664-3.82-1.804s-1.827-2.373-1.827-3.701c0-0.221 0.031-0.443 0.095-0.665 0.189 0.285 0.474 0.728 0.853 1.329 0.538 0.791 0.95 1.186 1.235 1.186 0.379 0 0.569-0.396 0.569-1.186 0-1.012-0.27-1.93-0.807-2.752-0.601-0.981-1.377-1.471-2.326-1.471-0.443 0-1.108 0.238-1.992 0.712-0.887 0.474-1.694 0.712-2.42 0.712-0.222 0-1.204-0.286-2.943-0.855 3.068-0.505 4.603-0.964 4.603-1.376 0-1.075-2.104-1.804-6.311-2.183-0.412-0.031-1.171-0.095-2.278-0.19 0.126-0.158 1.028-0.332 2.706-0.522 1.423-0.157 2.42-0.237 2.989-0.237 7.529 0 12.307 3.655 14.332 10.963 0.348-0.288 0.523-0.77 0.523-1.443 0-0.866-0.253-1.957-0.759-3.272-0.191-0.513-0.491-1.283-0.902-2.309 2.594 3.306 3.892 6.438 3.892 9.394 0 1.558-0.365 2.972-1.092 4.243-0.474 0.859-1.361 1.955-2.657 3.29-1.297 1.335-2.183 2.368-2.658 3.099 1.74-0.474 2.88-0.838 3.418-1.092 1.201-0.537 2.293-1.344 3.274-2.42 0 0.412-0.174 1.030-0.522 1.852zM10.166 3.656c0 0.569-0.317 0.933-0.949 1.091l-1.234 0.19c-0.443 0.221-1.092 1.092-1.946 2.61-0.095-0.474-0.237-1.138-0.427-1.993-0.285 0.032-0.759 0.285-1.423 0.759-0.285 0.221-0.744 0.553-1.377 0.996 0.191-1.139 0.823-2.292 1.899-3.464 1.139-1.296 2.246-1.945 3.322-1.945 1.423 0 2.135 0.586 2.135 1.756zM18.424 8.022c0 0.538-0.293 0.989-0.878 1.353s-1.163 0.546-1.732 0.546c-0.759 0-1.44-0.427-2.040-1.282-0.729-1.044-1.472-1.724-2.231-2.042 0.158-0.157 0.348-0.237 0.57-0.237 0.285 0 0.766 0.221 1.447 0.664s1.115 0.665 1.306 0.665c0.158 0 0.419-0.221 0.783-0.665s0.767-0.664 1.21-0.664c1.044 0 1.566 0.554 1.566 1.661z',
  },
  G: {
    bg: '#a3c095',
    d: 'M31.729 17.957c0 0.601-0.232 1.14-0.698 1.621s-0.998 0.72-1.598 0.72c-0.959 0-1.666-0.45-2.115-1.35l-2.115-0.090c-0.451 0-1.336 0.196-2.656 0.585-1.41 0.39-2.221 0.705-2.431 0.945-0.33 0.36-0.599 1.2-0.81 2.521-0.181 1.080-0.27 1.875-0.27 2.386 0 0.809 0.127 1.403 0.382 1.778s0.78 0.69 1.575 0.945c0.794 0.255 1.283 0.398 1.463 0.428 0.12 0 0.314-0.015 0.585-0.045h0.54c0.389 0 0.794 0.061 1.215 0.18 0.6 0.18 0.856 0.42 0.766 0.721-0.421-0.060-1.155 0.030-2.205 0.27l1.26 0.63c0 0.36-0.51 0.54-1.53 0.54-0.271 0-0.638-0.060-1.104-0.179-0.465-0.121-0.773-0.18-0.922-0.18h-0.585c-0.030 0.3-0.12 0.749-0.27 1.35-0.511-0.030-1.11-0.331-1.8-0.9s-1.125-0.855-1.305-0.855c-0.181 0-0.436 0.286-0.766 0.855-0.331 0.569-0.495 0.96-0.495 1.17-0.39-0.21-0.719-0.601-0.991-1.17-0.12-0.391-0.255-0.78-0.404-1.17-0.3 0.030-0.856 0.661-1.665 1.891h-0.226c-0.060-0.091-0.286-0.721-0.675-1.891-0.93-0.3-1.8-0.45-2.611-0.45-0.39 0-0.99 0.090-1.8 0.27l-1.26-0.089c0.179-0.18 0.704-0.525 1.575-1.035 1.020-0.6 1.8-0.901 2.34-0.901 0.089 0 0.208 0.015 0.36 0.045 0.149 0.031 0.27 0.045 0.36 0.045 0.208 0 0.547-0.112 1.012-0.338 0.465-0.224 0.735-0.427 0.809-0.607 0.076-0.182 0.114-0.646 0.114-1.396 0-1.71-0.45-2.985-1.351-3.825-0.781-0.75-2.070-1.29-3.871-1.621-0.48 1.71-1.83 2.566-4.050 2.566-0.721 0-1.441-0.435-2.16-1.305s-1.079-1.666-1.079-2.386c0-1.11 0.464-2.025 1.394-2.747-0.749-0.779-1.125-1.574-1.125-2.384 0-0.751 0.232-1.41 0.698-1.982 0.465-0.569 1.073-0.899 1.823-0.99-0.060-0.959 0.255-1.62 0.945-1.98-0.33-0.329-0.495-0.914-0.495-1.754 0-0.99 0.33-1.816 0.99-2.476s1.485-0.991 2.475-0.991c1.081 0 1.966 0.377 2.656 1.126 0.87-2.97 2.746-4.456 5.625-4.456 1.5 0 2.82 0.6 3.961 1.801 0.42 0.45 0.63 0.69 0.63 0.719-0.36 0-0.179-0.068 0.54-0.202s1.244-0.203 1.576-0.203c1.169 0 2.205 0.435 3.105 1.305 0.78 0.78 1.32 1.77 1.621 2.97 0.209 0.030 0.54 0.12 0.99 0.269 0.659 0.332 0.99 0.9 0.99 1.711 0 0.151-0.121 0.436-0.36 0.855 1.92 1.080 2.88 2.58 2.88 4.501 0 0.54-0.21 1.291-0.63 2.251 0.78 0.449 1.17 1.11 1.17 1.98zM13.186 19.937v-0.585c0-0.69-0.337-1.32-1.012-1.89s-1.358-0.855-2.048-0.855c-0.841 0-1.62 0.195-2.341 0.584 1.59-0.089 3.391 0.826 5.4 2.746zM12.377 14.357c-0.45-0.511-0.84-1.036-1.171-1.576-1.26 0.33-1.89 0.705-1.89 1.124 0.36-0.029 0.885 0.038 1.575 0.203s1.186 0.248 1.486 0.248zM15.123 12.961v-1.98c-0.721-0.12-1.157-0.18-1.305-0.18v0.675l1.305 1.486zM20.973 11.701c-0.36-0.15-1.036-0.45-2.025-0.9v3.87c1.41-0.811 2.084-1.801 2.025-2.97zM23.447 17.012l-0.989-1.215c-0.6 0.42-1.208 0.848-1.823 1.283s-1.148 0.923-1.597 1.463c1.35-0.721 2.821-1.23 4.41-1.531z',
  },
  C: {
    bg: '#cac5c0',
    d: 'M13.407 5.933c1.013-1.434 1.676-3.071 2.587-4.569 0.88 1.447 1.519 3.030 2.483 4.426 2.052 3.033 4.694 5.67 7.727 7.722 1.401 0.967 2.987 1.608 4.434 2.495-1.456 0.868-3.038 1.512-4.436 2.478-3.081 2.085-5.76 4.771-7.821 7.869-0.919 1.357-1.536 2.886-2.389 4.279-0.882-1.444-1.521-3.028-2.486-4.424-2.054-3.030-4.687-5.678-7.725-7.724-1.396-0.962-2.977-1.603-4.419-2.493 1.5-0.899 3.129-1.569 4.564-2.575 2.924-2.006 5.47-4.566 7.481-7.486zM7.373 15.999c3.358 2.334 6.29 5.258 8.617 8.621 2.339-3.356 5.256-6.3 8.631-8.617-3.366-2.334-6.295-5.263-8.631-8.624-2.334 3.356-5.256 6.288-8.617 8.619z',
  },
};

function manaIconSvg(c, px) {
  px = px || 20;
  const key = (c || '').toUpperCase();
  if (key === 'GEN')
    return `<svg class="mana-ic" width="${px}" height="${px}" viewBox="0 0 32 32" aria-label="GEN"><circle cx="16" cy="16" r="15" fill="#CFC9C2" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/><circle cx="16" cy="16" r="10" fill="#5C574D" opacity="0.14"/></svg>`;
  const d = MANA_GLYPHS[key];
  if (!d) return '';
  return `<svg class="mana-ic" width="${px}" height="${px}" viewBox="0 0 32 32" aria-label="${key}"><circle cx="16" cy="16" r="15" fill="${d.bg}" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/><g transform="translate(16 16) scale(0.68) translate(-16 -16)"><path fill="#130c0e" d="${d.d}"/></g></svg>`;
}

function manaRowSvg(letters, px) {
  return (letters || '')
    .split('')
    .map((l) => manaIconSvg(l, px))
    .join('');
}

/* The five colors arranged as on a Magic card back: White on top, then
   clockwise Blue, Black, Red, Green around a pentagon. */
function manaPentagonSvg(px) {
  const d = Math.round(px * 3.1);
  const R = d / 2 - px / 2;
  return (
    `<span class="mana-pentagon" style="width:${d}px;height:${d}px;">` +
    ['W', 'U', 'B', 'R', 'G']
      .map((l, i) => {
        const a = ((-90 + i * 72) * Math.PI) / 180;
        const x = Math.round(d / 2 + R * Math.cos(a) - px / 2);
        const y = Math.round(d / 2 + R * Math.sin(a) - px / 2);
        return `<span style="position:absolute;left:${x}px;top:${y}px;line-height:0;">${manaIconSvg(l, px)}</span>`;
      })
      .join('') +
    `</span>`
  );
}

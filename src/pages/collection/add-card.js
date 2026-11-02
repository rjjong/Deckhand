// pages / collection / add-card

/* ---- Add to collection: printing, condition, amount, binder ---- */
function openCollectionCardSearch() {
  state.searchDeckId = null;
  state.searchPinnedDeckId = null;
  state._pinArm = false;
  switchPage('search');
}

/* Several cards into the collection at once (a multi-select's ＋ menu): one
   condition, one amount per card, one binder -- the single-card sheet's
   fields, each card keeping the printing it already shows. */
function openAddManyToCollection(cards, onDone) {
  cards = (cards || []).filter(Boolean);
  if (!cards.length) return;
  if (cards.length === 1) {
    openAddToCollection(cards[0]);
    if (onDone) onDone();
    return;
  }
  const n = cards.length;
  pushOverlay('addColl', () => document.getElementById('addCollOverlay')?.remove());
  let el = document.getElementById('addCollOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'addCollOverlay';
  }
  document.body.appendChild(el);
  el.innerHTML = /* HTML */ `<div class="overlay-inner" style="max-width:380px;">
    <main style="padding:14px;">
      <div class="panel-card">
        <div class="panel-h">
          <span class="ib">${ICONS.collection}</span>${trS('Add to collection')}
        </div>
        <div class="acm-fan">
          ${cards
            .slice(0, 5)
            .map((c) => `<img class="${wbClass(c)}" src="${cardImageMed(c)}" alt="">`)
            .join('')}
        </div>
        <p class="hint" style="margin-bottom:8px;text-align:center;">${n} cards</p>
        <div class="adv-row" style="margin-top:10px;">
          <label>Condition</label>
          <select id="acCond" class="col-select">
            ${COL_CONDS.map(([k, l]) => `<option value="${k}" ${k === 'NM' ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="adv-row">
          <label>Foil</label
          ><label class="ac-foil"><input type="checkbox" id="acFoil" /> ✨ Foil</label>
        </div>
        <div class="adv-row">
          <label>${trS('Amount (each)')}</label>
          <div class="action-row" style="margin:0;">
            <button class="ghost-btn" id="acQminus" style="flex:none;width:44px;">−</button>
            <input
              id="acQty"
              type="number"
              min="1"
              value="1"
              class="col-filter-input"
              style="max-width:70px;text-align:center;"
            />
            <button class="ghost-btn" id="acQplus" style="flex:none;width:44px;">＋</button>
          </div>
        </div>
        <div class="adv-row">
          <label>Binder</label>
          <select id="acBinder" class="col-select">
            ${ruledBinders().length ? `<option value="__auto__" selected>✦ ${'Automatic (binder rules)'}</option>` : ''}
            <option value="">— No binder —</option>
            ${state.collection.binders.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}
            <option value="__wants__">🔖 Wants list</option>
            <option value="__new__">＋ New binder…</option>
          </select>
        </div>
        <button class="primary-btn" id="acAdd" style="margin-top:12px;">
          ${trS('Add to collection')} (${n})
        </button>
        <button class="ghost-btn" id="acCancel" style="width:100%;margin-top:8px;">Cancel</button>
      </div>
    </main>
  </div>`;
  document.getElementById('acQplus')?.addEventListener('click', () => {
    const q = document.getElementById('acQty');
    q.value = (+q.value || 1) + 1;
  });
  document.getElementById('acQminus')?.addEventListener('click', () => {
    const q = document.getElementById('acQty');
    q.value = Math.max(1, (+q.value || 1) - 1);
  });
  document.getElementById('acCancel')?.addEventListener('click', closeTopOverlay);
  document.getElementById('acAdd')?.addEventListener('click', () => {
    const chosen = document.getElementById('acBinder').value || null;
    if (chosen === '__new__') {
      openInAppPrompt('New binder name', 'Binder name', '', (name) => {
        if (!name || !name.trim()) return;
        const b = { id: 'bnd_' + Date.now().toString(36), name: name.trim() };
        state.collection.binders.push(b);
        finish(b.id);
      });
      return;
    }
    finish(chosen);
  });
  async function finish(binder0) {
    const cond = document.getElementById('acCond').value;
    const qty = Math.max(1, +document.getElementById('acQty').value || 1);
    const memo = {};
    const foil = !!document.getElementById('acFoil')?.checked;
    for (const card of cards) {
      const slim = colFoilSlim(slimForCollection(card), card, foil);
      if (binder0 === '__wants__') {
        state.collection.wantsExclude = state.collection.wantsExclude.filter(
          (x) => x !== slim.name,
        );
        if (!state.collection.wantsManual.some((w) => w.name === slim.name))
          state.collection.wantsManual.push(slim);
        continue;
      }
      const binder =
        binder0 === '__auto__' ? await routeBinder({ ...slim, cond, qty }, memo) : binder0;
      const same = state.collection.items.find(
        (x) =>
          x.name === slim.name &&
          x.set === slim.set &&
          x.cn === slim.cn &&
          x.cond === cond &&
          !!x.foil === !!slim.foil &&
          (x.binder || null) === (binder || null),
      );
      if (same) same.qty += qty;
      else state.collection.items.unshift({ ...slim, cond, qty, binder, addedAt: Date.now() });
      state.collection.wantsManual = state.collection.wantsManual.filter(
        (w) => w.name !== slim.name,
      );
    }
    const binder = binder0;
    saveCollection();
    toast(
      binder === '__wants__'
        ? `${n} cards added to your Wants list.`
        : `${n} cards added to your collection.`,
    );
    closeTopOverlay();
    if (onDone) onDone();
    if (state.screen === 'collection') render();
  }
}

/* Several cards into one deck, the same checks as a single add, one summary. */
function addCardsToDeckQuiet(d, cards) {
  let added = 0,
    skipped = 0;
  if (!d.admiral && !deckIsConstructed(d)) {
    toast(`Appoint a ${fmtName(d)} for ${d.name} first.`);
    return 0;
  }
  cards.forEach((c) => {
    const blocked =
      deckBlockReason(c, d) ||
      (deckLeaders(d).some((L) => L.name === c.name) && !allowsDuplicates(c)) ||
      !colorIdentityOkDeck(c, d) ||
      atCopyLimit(d, c);
    if (blocked) {
      skipped++;
      return;
    }
    d.cards.push(c);
    logDeckChange(d, { type: 'add', name: c.name, card: c });
    added++;
  });
  if (added) scheduleSave(d);
  toast(`${added} added to ${d.name}` + (skipped ? ` \u00B7 ${skipped} can't join it` : '') + '.');
  return added;
}

function openMultiDeckChooser(cards, onDone) {
  let el = document.getElementById('deckPickPopup');
  if (!el) {
    el = document.createElement('div');
    el.className = 'deckpick-scrim';
    el.id = 'deckPickPopup';
  }
  document.body.appendChild(el);
  const n = cards.length;
  el.innerHTML = /* HTML */ `<div class="deckpick">
    <h4>Add ${n} card${n > 1 ? 's' : ''} to…</h4>
    <div class="deckpick-list">
      ${
        state.decksIndex
          .map(
            (d) => `<button class="dp-row" data-deck="${d.id}">
        <div class="dp-txt">${escapeHtml(d.name)}<div class="dp-meta">${d.cards.length} cards${d.admiral ? ` \u00B7 ${escapeHtml(d.admiral.name)}` : ''}</div></div>
        ${dpPipsHtml(d)}
      </button>`,
          )
          .join('') || `<div class="empty-note">No decks yet.</div>`
      }
    </div>
    <button class="dp-cancel" id="dpCancel">Cancel</button>
  </div>`;
  const close = () => el.remove();
  document.getElementById('dpCancel').addEventListener('click', close);
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  el.querySelectorAll('.dp-row[data-deck]').forEach((row) =>
    row.addEventListener('click', () => {
      close();
      const d = getDeck(row.dataset.deck);
      if (d && addCardsToDeckQuiet(d, cards) && onDone) onDone();
    }),
  );
}

/* ---- clearing a multi-select (back press, ✕, after an action) ---- */
function dlSelCards(d) {
  return Array.from(state._dlSel || [])
    .map((k) => {
      const [loc, i] = k.split(':');
      return loc === 'maybe' ? (d.maybeboard || [])[+i] : d.cards[+i];
    })
    .filter(Boolean);
}

function dlSelClear() {
  state._dlSel = null;
  document.querySelectorAll('.vg-card.dl-msel').forEach((t) => t.classList.remove('dl-msel'));
  const dd = getDeck(state.activeDeckId);
  if (dd) updateDeckMeter(dd);
}

function colSelClear() {
  state.colSel = null;
  document.querySelectorAll('.col-tile.csel').forEach((t) => t.classList.remove('csel'));
  document.querySelectorAll('.col-tile .csel-mark').forEach((m) => m.remove());
  document.getElementById('colSelFab')?.remove();
}

function searchSelClear() {
  state.searchSel = null;
  document
    .querySelectorAll('#searchResultsBox .sr-tile.selected')
    .forEach((t) => t.classList.remove('selected'));
  updateSearchSelFab();
}

/* 1.8: multi-select on a card list inside an overlay (Similar cards, a
   card's recommendations) -- the house gestures: long-press picks a card
   (gold tick), then every tap picks one more; the gold count button at the
   bottom right holds Add to deck / collection. A tap with nothing picked
   opens the card (onOpen, or the tile's own handler). */
function wireOverlayPick(el, box, pool, onOpen) {
  if (!el || !box) return;
  const sel = el._pick || (el._pick = new Map());
  let fab = el.querySelector('.ov-pick-fab');
  const paint = () => {
    const f = el.querySelector('.ov-pick-fab');
    if (!f) return;
    const n = sel.size;
    f.hidden = !n;
    f.innerHTML = selFabLabel(n);
  };
  const clear = () => {
    sel.clear();
    el.querySelectorAll('.sr-tile.selected').forEach((t) => t.classList.remove('selected'));
    paint();
  };
  el._pickClear = clear;
  if (!fab) {
    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'reco-fab ov-pick-fab';
    fab.hidden = true;
    fab.setAttribute('aria-label', trS('Add to\u2026'));
    el.appendChild(fab);
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      const cards = Array.from(sel.values());
      if (!cards.length) return;
      // drop-up: the first choice sits nearest the thumb (last here)
      openTileMenu(fab, [
        { label: '\u2715 ' + trS('Deselect all'), fn: () => el._pickClear() },
        {
          label: mIco('binder') + trS('Add to collection\u2026'),
          fn: () => openAddManyToCollection(cards, () => el._pickClear()),
        },
        {
          label: '\uFF0B ' + trS('Add to deck\u2026'),
          fn: () => openMultiDeckChooser(cards, () => el._pickClear()),
        },
      ]);
    });
  }
  box.querySelectorAll('.sr-tile[data-name]').forEach((tile) => {
    if (tile.dataset.pk) return;
    tile.dataset.pk = '1';
    tile.classList.add('selectable');
    if (!tile.querySelector('.sel-check')) {
      const m = document.createElement('span');
      m.className = 'sel-check';
      m.textContent = '\u2713';
      tile.appendChild(m);
    }
    const nm = decodeURIComponent(tile.dataset.name);
    tile.classList.toggle('selected', sel.has(nm));
    let lpT = null,
      fired = false;
    const toggle = () => {
      const c = pool.find((x) => x.name === nm);
      if (!c) return;
      if (sel.has(nm)) sel.delete(nm);
      else sel.set(nm, c);
      tile.classList.toggle('selected', sel.has(nm));
      paint();
    };
    tile.addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('button')) return;
      fired = false;
      clearTimeout(lpT);
      lpT = setTimeout(() => {
        fired = true;
        try {
          navigator.vibrate && navigator.vibrate(8);
        } catch (err) {}
        toggle();
      }, 480);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
      tile.addEventListener(ev, () => clearTimeout(lpT)),
    );
    tile.addEventListener('contextmenu', (e) => e.preventDefault());
    // capture: decide before the picture's own tap handler sees the click
    tile.addEventListener(
      'click',
      (e) => {
        if (fired) {
          fired = false;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        // 1.36: the + / − (and other tile buttons) do their own job
        if (e.target.closest && e.target.closest('button') && e.target.closest('button') !== tile)
          return;
        if (sel.size) {
          e.stopPropagation();
          e.preventDefault();
          toggle();
          return;
        }
        if (onOpen) {
          e.stopPropagation();
          onOpen(nm);
        }
      },
      true,
    );
  });
  paint();
}

function recoSelClear() {
  const R = state.reco;
  if (!R || !R.selected) return;
  R.selected.clear();
  document
    .querySelectorAll('#recoOverlay .sr-tile.selected')
    .forEach((t) => t.classList.remove('selected'));
  const fb = document.getElementById('recoCreate');
  if (fb) {
    fb.hidden = true;
    fb.innerHTML = selFabLabel(0);
  }
  placeRecoJump();
}

/* One back press drops the multi-select on screen, before anything else
   moves. A page's selection waits while an overlay covers it. */
function clearSelectionOnBack() {
  const top = state.overlayStack[state.overlayStack.length - 1];
  if (top) {
    if (top.id === 'reco' && state.reco && state.reco.selected && state.reco.selected.size) {
      recoSelClear();
      return true;
    }
    if (top.id === 'similar' || top.id === 'cardReco') {
      // 1.8
      const ov = document.getElementById(
        top.id === 'similar' ? 'similarOverlay' : 'cardRecoOverlay',
      );
      if (ov && ov._pick && ov._pick.size) {
        ov._pickClear();
        return true;
      }
    }
    return false;
  }
  if (state.screen === 'decklist' && state._dlSel && state._dlSel.size) {
    dlSelClear();
    return true;
  }
  if (state.screen === 'collection' && state.colSel && state.colSel.size) {
    colSelClear();
    return true;
  }
  if (state.screen === 'search' && state.searchSel && state.searchSel.size) {
    searchSelClear();
    return true;
  }
  if (state.screen === 'spoilers' && state.spSel && state.spSel.size) {
    spSelClear();
    return true;
  } // 1.19
  return false;
}

async function openAddToCollection(card) {
  pushOverlay('addColl', () => document.getElementById('addCollOverlay')?.remove());
  let el = document.getElementById('addCollOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'addCollOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  el.innerHTML = /* HTML */ `<div class="overlay-inner" style="max-width:380px;">
    <main style="padding:14px;">
      <div class="panel-card">
        <div class="panel-h"><span class="ib">${ICONS.collection}</span>Add to collection</div>
        <div style="text-align:center;margin:6px 0 10px;">
          <img
            class="${wbClass(card)}"
            src="${cardImageMed(card)}"
            alt="${escapeHtml(card.name)}"
            style="width:120px;"
          />
        </div>
        <p class="hint" style="margin-bottom:8px;text-align:center;">${escapeHtml(card.name)}</p>
        <div class="adv-row">
          <label>Printing</label>
          <div id="acPdBox">${printsDropdownHtml('acPd', [card], 0, true)}</div>
        </div>
        <div class="adv-row" style="margin-top:10px;">
          <label>Condition</label>
          <select id="acCond" class="col-select">
            ${COL_CONDS.map(([k, l]) => `<option value="${k}" ${k === 'NM' ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="adv-row">
          <label>Foil</label
          ><label class="ac-foil"><input type="checkbox" id="acFoil" /> ✨ Foil</label>
        </div>
        <div class="adv-row">
          <label>Amount</label>
          <div class="action-row" style="margin:0;">
            <button class="ghost-btn" id="acQminus" style="flex:none;width:44px;">−</button>
            <input
              id="acQty"
              type="number"
              min="1"
              value="1"
              class="col-filter-input"
              style="max-width:70px;text-align:center;"
            />
            <button class="ghost-btn" id="acQplus" style="flex:none;width:44px;">＋</button>
          </div>
        </div>
        <div class="adv-row">
          <label>Binder</label>
          <select id="acBinder" class="col-select">
            ${ruledBinders().length ? `<option value="__auto__"${state.colFilter && state.collection.binders.some((b) => b.id === state.colFilter.binder) ? '' : ' selected'}>✦ ${'Automatic (binder rules)'}</option>` : ''}
            <option value="">— No binder —</option>
            ${state.collection.binders.map((b) => `<option value="${b.id}" ${state.colFilter && state.colFilter.binder === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
            <option value="__wants__">🔖 Wants list</option>
            <option value="__new__">＋ New binder…</option>
          </select>
        </div>
        <button class="primary-btn" id="acAdd" style="margin-top:12px;">Add to collection</button>
        <button class="ghost-btn" id="acCancel" style="width:100%;margin-top:8px;">Cancel</button>
      </div>
    </main>
  </div>`;
  let prints = [card],
    sel = 0,
    loadingPrints = true;
  const paintPd = () => {
    const box = document.getElementById('acPdBox');
    if (!box) return;
    box.innerHTML = printsDropdownHtml('acPd', prints, sel, loadingPrints);
    wirePrintsDropdown(box, 'acPd', (i) => {
      sel = i;
      paintPd();
    });
  };
  paintPd();
  if (card.prints_search_uri) {
    try {
      const r = await sfFetch(card.prints_search_uri);
      if (r.ok) {
        const d = await r.json();
        if ((d.data || []).length) {
          prints = d.data.slice(0, 30);
          sel = Math.max(
            0,
            prints.findIndex(
              (p) => p.set === card.set && p.collector_number === card.collector_number,
            ),
          );
        }
      }
    } catch (e) {}
  }
  loadingPrints = false;
  paintPd();
  document.getElementById('acQplus')?.addEventListener('click', () => {
    const q = document.getElementById('acQty');
    q.value = (+q.value || 1) + 1;
  });
  document.getElementById('acQminus')?.addEventListener('click', () => {
    const q = document.getElementById('acQty');
    q.value = Math.max(1, (+q.value || 1) - 1);
  });
  document.getElementById('acCancel')?.addEventListener('click', closeTopOverlay);
  document.getElementById('acAdd')?.addEventListener('click', () => {
    const p = prints[sel] || card;
    const chosen = document.getElementById('acBinder').value || null;
    // The __new__ choice needs a name first — the rest of the add runs as a
    // second phase once the house-style prompt resolves.
    if (chosen === '__new__') {
      openInAppPrompt('New binder name', 'Binder name', '', (name) => {
        if (!name || !name.trim()) return;
        const b = { id: 'bnd_' + Date.now().toString(36), name: name.trim() };
        state.collection.binders.push(b);
        finishAdd(p, b.id);
      });
      return;
    }
    finishAdd(p, chosen);
  });
  async function finishAdd(p, binder) {
    const cond = document.getElementById('acCond').value;
    const qty = Math.max(1, +document.getElementById('acQty').value || 1);
    const slim = colFoilSlim(slimForCollection(p), p, !!document.getElementById('acFoil')?.checked);
    if (binder === '__auto__') binder = await routeBinder({ ...slim, cond, qty }, {});
    if (binder === '__wants__') {
      state.collection.wantsExclude = state.collection.wantsExclude.filter((n) => n !== slim.name);
      if (!state.collection.wantsManual.some((w) => w.name === slim.name))
        state.collection.wantsManual.push(slim);
      saveCollection();
      toast(slim.name + ' added to your Wants list.');
      closeTopOverlay();
      if (state.screen === 'collection') render();
      return;
    }
    const same = state.collection.items.find(
      (x) =>
        x.name === slim.name &&
        x.set === slim.set &&
        x.cn === slim.cn &&
        x.cond === cond &&
        !!x.foil === !!slim.foil &&
        (x.binder || null) === (binder || null),
    );
    if (same) {
      same.qty += qty;
    } else state.collection.items.unshift({ ...slim, cond, qty, binder, addedAt: Date.now() });
    state.collection.wantsManual = state.collection.wantsManual.filter((w) => w.name !== slim.name);
    saveCollection();
    toast(
      binder
        ? `${slim.name} ×${qty} → ${brBinderName(binder)}`
        : `${slim.name} ×${qty} added to your collection.`,
    );
    closeTopOverlay();
    if (state.screen === 'collection') render();
  }
}

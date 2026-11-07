// ui / modals

/* ---------------- MODALS ---------------- */

let newDeckViewportCleanup = null;

function revealNewDeckField(input) {
  const fields = input?.closest('.nd-fields');
  if (!fields) return;
  const bounds = fields.getBoundingClientRect();
  const field = input.getBoundingClientRect();
  if (field.bottom > bounds.bottom - 8) fields.scrollTop += field.bottom - bounds.bottom + 8;
  const top = input.getBoundingClientRect().top;
  if (top < bounds.top + 8) fields.scrollTop -= bounds.top + 8 - top;
  placeNewDeckPopovers(fields.closest('.new-deck-backdrop'));
}

function placeNewDeckPopovers(backdrop) {
  if (!backdrop?.isConnected) return;
  const sheet = backdrop.querySelector('.nd-sheet');
  const bounds = backdrop.getBoundingClientRect();
  const sheetBounds = sheet.getBoundingClientRect();
  const fields = sheet.querySelector('.nd-fields').getBoundingClientRect();
  const actions = sheet.querySelector('.modal-actions').getBoundingClientRect();
  for (const pop of sheet.querySelectorAll(':scope > .nd-popover:not([hidden])')) {
    const anchor = pop._ndAnchor;
    const field = anchor.getBoundingClientRect();
    if (
      !anchor.getClientRects().length ||
      field.bottom <= fields.top ||
      field.top >= fields.bottom
    ) {
      pop.hidden = true;
      continue;
    }
    const above = Math.max(0, field.top - 4 - bounds.top - 8);
    // A dropdown must finish before the fixed Cancel/Create row.
    const below = Math.max(0, Math.min(actions.top - 8, bounds.bottom - 8) - field.bottom - 4);
    const up = above > below;
    const available = Math.min(200, up ? above : below);
    if (available < 44) {
      pop.hidden = true;
      continue;
    }
    const width = Math.min(field.width, bounds.width - 16);
    const left = Math.max(bounds.left + 8, Math.min(field.left, bounds.right - width - 8));
    pop.style.setProperty('--nd-pop-height', available + 'px');
    pop.style.setProperty('--nd-pop-width', width + 'px');
    pop.style.setProperty('--nd-pop-left', left - sheetBounds.left - sheet.clientLeft + 'px');
    const top = up
      ? Math.max(bounds.top + 8, field.top - 4 - pop.getBoundingClientRect().height)
      : field.bottom + 4;
    pop.style.setProperty('--nd-pop-top', top - sheetBounds.top - sheet.clientTop + 'px');
    pop.dataset.direction = up ? 'up' : 'down';
  }
}

function wireNewDeckViewport(backdrop) {
  const controller = new AbortController();
  const viewport = window.visualViewport;
  const sheet = backdrop.querySelector('.nd-sheet');
  // Keep the popovers inside the accessible dialog, outside its scrolling form.
  for (const pop of sheet.querySelectorAll('.otag-pop')) {
    pop._ndAnchor = pop.parentElement.querySelector('input, button');
    pop.classList.add('nd-popover');
    sheet.appendChild(pop);
  }
  let frame = null;
  const update = () => {
    backdrop.style.setProperty('--nd-viewport-top', (viewport?.offsetTop || 0) + 'px');
    backdrop.style.setProperty('--nd-viewport-height', (viewport?.height || innerHeight) + 'px');
    backdrop.style.setProperty('--nd-viewport-left', (viewport?.offsetLeft || 0) + 'px');
    backdrop.style.setProperty('--nd-viewport-width', (viewport?.width || innerWidth) + 'px');
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      revealNewDeckField(document.activeElement);
      placeNewDeckPopovers(backdrop);
    });
  };
  viewport?.addEventListener('resize', update, { signal: controller.signal });
  viewport?.addEventListener('scroll', update, { signal: controller.signal });
  window.addEventListener('resize', update, { signal: controller.signal });
  backdrop.addEventListener(
    'focusin',
    (event) => {
      for (const pop of sheet.querySelectorAll(':scope > .nd-popover'))
        if (event.target !== pop._ndAnchor && !pop.contains(event.target)) pop.hidden = true;
      update();
    },
    { signal: controller.signal },
  );
  sheet
    .querySelector('.nd-fields')
    .addEventListener('scroll', () => placeNewDeckPopovers(backdrop), {
      passive: true,
      signal: controller.signal,
    });
  update();
  return () => {
    controller.abort();
    cancelAnimationFrame(frame);
  };
}

function openModal(type, extra) {
  state.modal = Object.assign({ type }, extra || {});
  renderModal();
}

function closeModal() {
  const trigger = state.modal?.returnFocus;
  state.modal = null;
  renderModal();
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
}

function renderModal() {
  newDeckViewportCleanup?.();
  newDeckViewportCleanup = null;
  let el = document.getElementById('modalRoot');
  if (!state.modal) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'modalRoot';
    document.body.appendChild(el);
  }
  const m = state.modal;
  if (m.type === 'lifeSetup') {
    renderLifeSetup(el, m);
  } else if (m.type === 'installApp') {
    renderPwaInstallHelp(el);
  } else if (m.type === 'sort') {
    el.innerHTML = /* HTML */ `<div class="modal-backdrop" id="mbd">
      <div class="modal-sheet">
        <h3>Sort Decklist</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${SORT_MODES.map((s) => {
            const btn = `<button class="ghost-btn ${state.sortMode === s.key ? 'active' : ''}" data-sortpick="${s.key}" style="width:100%;text-align:left;">${s.label}</button>`;
            if (s.key !== 'tags') return btn;
            const dd = getDeck(state.activeDeckId);
            return `<div class="sort-tags-row">${btn}<label class="sort-scry" title="Scryfall tags"><span class="toggle-switch"><input type="checkbox" id="scryTagsSw" ${!dd || dd.scryTags !== false ? 'checked' : ''}><span class="track"></span><span class="knob"></span></span><span class="sort-scry-l">Scryfall tags</span></label></div>`;
          }).join('')}
        </div>
        <div class="modal-actions" style="margin-top:14px;">
          <button class="cancel" id="cancelBtn">Close</button>
        </div>
      </div>
    </div>`;
    document.getElementById('scryTagsSw')?.addEventListener('change', (e) => {
      const dd = getDeck(state.activeDeckId);
      if (!dd) return;
      dd.scryTags = !!e.target.checked;
      scheduleSave(dd);
      try {
        if (dd.scryTags) ensureDeckOtags(dd).then(() => refreshDecklistBox(dd));
      } catch (err) {}
      refreshDecklistBox(dd);
      toast(
        dd.scryTags
          ? 'Scryfall tags on for this deck.'
          : 'Scryfall tags off for this deck; your own tags stay.',
      );
    });
    document.querySelectorAll('[data-sortpick]').forEach((b) => {
      b.addEventListener('click', () => {
        state.sortMode = b.dataset.sortpick;
        closeModal();
        const d = getDeck(state.activeDeckId);
        if (d) refreshDecklistBox(d);
      });
    });
  } else if (m.type === 'newdeck') {
    el.innerHTML = /* HTML */ `<div class="modal-backdrop new-deck-backdrop" id="mbd">
      <div
        class="modal-sheet nd-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="newDeckTitle"
      >
        <h3 id="newDeckTitle">New Deck</h3>
        <div class="nd-fields">
          <input
            id="newDeckName"
            placeholder="Deck name"
            maxlength="${MAX_DECK_NAME_LENGTH}"
            autofocus
          />
          <div class="otag-wrap" style="margin-bottom:10px;">
            <button
              type="button"
              id="newDeckFmtBtn"
              class="col-filter-input"
              style="width:100%;text-align:left;"
            >
              ${ndFmtBtnHtml('commander')}
            </button>
            <div id="newDeckFmtPop" class="otag-pop" hidden>
              ${FMT_ORDER.map((f) => `<button type="button" data-ndfmt="${f}">${FMT_LABELS[f]}</button>`).join('')}
            </div>
          </div>
          <div class="otag-wrap" id="ndCmdWrap" style="margin-bottom:10px;">
            <input
              id="ndCmd"
              class="col-filter-input"
              placeholder="Who is your commander? (optional)"
              autocomplete="off"
              style="width:100%;"
            />
            <div id="ndCmdPop" class="otag-pop" hidden></div>
          </div>
          <div class="otag-wrap" id="ndP2Wrap" hidden style="margin-bottom:10px;">
            <input
              id="ndCmd2"
              class="col-filter-input"
              placeholder="Partner…"
              autocomplete="off"
              style="width:100%;"
            />
            <div id="ndCmd2Pop" class="otag-pop" hidden></div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="cancel" id="cancelBtn">Cancel</button
          ><button class="confirm" id="createBtn">Create</button>
        </div>
      </div>
    </div>`;
    newDeckViewportCleanup = wireNewDeckViewport(el.querySelector('.new-deck-backdrop'));
    wireAppDialogKeys(el.querySelector('.new-deck-backdrop'), closeModal);
    window._ndFmt = 'commander';

    // krijgt de balk niet te zien.
    const ndSyncLeader = () => {
      const woord = fmtLeaderWord(window._ndFmt || 'commander');
      const wrap = document.getElementById('ndCmdWrap');
      const inp = document.getElementById('ndCmd');
      if (wrap) wrap.hidden = !woord;
      if (inp) {
        inp.placeholder = woord ? `Who is your ${woord}? (optional)` : '';
        if (!woord) inp.value = '';
      }
      if (!woord) {
        window._ndPick = null;
        window._ndPick2 = null;
        const w2 = document.getElementById('ndP2Wrap');
        if (w2) w2.hidden = true;
      }
    };
    {
      const _ff = fmtAncestorOf(state.screen === 'decks' ? state.folderNav : null);
      if (_ff && FMT_LABELS[_ff]) {
        window._ndFmt = _ff;
        const _fb = document.getElementById('newDeckFmtBtn');
        if (_fb) _fb.innerHTML = ndFmtBtnHtml(_ff);
      }
      const fb = document.getElementById('newDeckFmtBtn');
      const fp = document.getElementById('newDeckFmtPop');
      if (fb && fp) {
        fb.addEventListener('click', (ev) => {
          ev.stopPropagation();
          fp.hidden = !fp.hidden;
          if (!fp.hidden) requestAnimationFrame(() => revealNewDeckField(fb));
        });
        fp.querySelectorAll('[data-ndfmt]').forEach((o) =>
          o.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation(); // the pick must never reach the modal backdrop
            window._ndFmt = o.dataset.ndfmt;
            fb.innerHTML = ndFmtBtnHtml(o.dataset.ndfmt);
            fp.hidden = true;
            window._ndPick = null;
            window._ndPick2 = null;
            const c1 = document.getElementById('ndCmd');
            if (c1) c1.value = '';
            const w2 = document.getElementById('ndP2Wrap');
            if (w2) w2.hidden = true;
            ndSyncLeader();
          }),
        );
        document.addEventListener(
          'pointerdown',
          (ev) => {
            if (
              !fp.hidden &&
              ev.target.closest &&
              !ev.target.closest('#newDeckFmtBtn') &&
              !ev.target.closest('#newDeckFmtPop')
            )
              fp.hidden = true;
          },
          true,
        );
      }
      ndSyncLeader();
    }
    // Commander pickers: per-format-legal search, partner box unlocks
    // when the chosen commander's text allows one.
    window._ndPick = null;
    window._ndPick2 = null;
    const wirePicker = (inpId, popId, slot) => {
      const inp = document.getElementById(inpId),
        pop = document.getElementById(popId);
      if (!inp || !pop) return;
      let t = null;
      const fill = async () => {
        const q = inp.value.trim();
        if (q.length < 2) {
          pop.hidden = true;
          return;
        }
        const fmt2 = window._ndFmt || 'commander';
        try {
          const r = await sfFetch(
            `${SF_BASE}/cards/search?q=${encodeURIComponent(leaderSearchClause(fmt2) + (leaderSearchFmt(fmt2) === 'any' ? ' ' : ' ' + sfLegalClause(fmt2) + ' ') + q)}`,
          );
          if (!r.ok) throw 0;
          const j = await r.json();
          if (!inp.isConnected || inp.value.trim() !== q || window._ndFmt !== fmt2) return;
          const hits = (j.data || []).slice(0, 24);
          pop.innerHTML = hits
            .map((c, i) => `<button type="button" data-ndp="${i}">${escapeHtml(c.name)}</button>`)
            .join('');
          pop.hidden = !hits.length;
          pop.scrollTop = 0;
          if (hits.length) requestAnimationFrame(() => revealNewDeckField(inp));
          pop.querySelectorAll('[data-ndp]').forEach((o) =>
            o.addEventListener('mousedown', (ev) => {
              ev.preventDefault();
              const c = hits[parseInt(o.dataset.ndp, 10)];
              if (slot === 1) {
                window._ndPick = c;
              } else {
                window._ndPick2 = c;
              }
              inp.value = c.name;
              pop.hidden = true;
              if (slot === 1) {
                const ox = String(
                  c.oracle_text ||
                    (c.card_faces && c.card_faces[0] && c.card_faces[0].oracle_text) ||
                    '',
                );
                const w2 = document.getElementById('ndP2Wrap');
                if (w2)
                  w2.hidden =
                    !/\bPartner\b/.test(ox) && !(c.keywords || []).some((k) => /partner/i.test(k));
              }
            }),
          );
        } catch (e) {
          pop.hidden = true;
        }
      };
      inp.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(fill, 320);
        if (slot === 1) {
          window._ndPick = null;
          window._ndPick2 = null;
          const w2 = document.getElementById('ndP2Wrap');
          if (w2) {
            w2.hidden = true;
          }
        } else {
          window._ndPick2 = null;
        }
      });
      inp.addEventListener('blur', () =>
        setTimeout(() => {
          pop.hidden = true;
        }, 250),
      );
    };
    wirePicker('ndCmd', 'ndCmdPop', 1);
    wirePicker('ndCmd2', 'ndCmd2Pop', 2);
    document.getElementById('createBtn').addEventListener('click', () => {
      const name = document.getElementById('newDeckName').value.trim() || 'Untitled deck';
      const fmt = window._ndFmt || 'commander';
      const cmd = window._ndPick,
        p2 = window._ndPick2;
      closeModal();
      createNewDeck(name, fmt, cmd, p2);
    });
  } else if (m.type === 'delete') {
    const d = getDeck(state.activeDeckId);
    el.innerHTML = /* HTML */ `<div class="modal-backdrop" id="mbd">
      <div class="modal-sheet">
        <h3>Delete "${escapeHtml(d.name)}"?</h3>
        <p style="font-size:14px;color:var(--sub-text);margin:0 0 14px;">
          ${'You can bring it back for 60 days: Extras → Backup → Deleted decks.'}
        </p>
        <div class="modal-actions">
          <button class="cancel" id="cancelBtn">Cancel</button
          ><button class="confirm danger" id="delBtn">Delete</button>
        </div>
      </div>
    </div>`;
    document.getElementById('delBtn').addEventListener('click', async () => {
      await deleteDeckStorage(d.id);
      state.decksIndex = state.decksIndex.filter((x) => x.id !== d.id);
      if (state.activeDeckId === d.id) state.activeDeckId = null;
      if (state.searchDeckId === d.id) state.searchDeckId = null;
      if (state.searchPinnedDeckId === d.id) state.searchPinnedDeckId = null;
      if (state.inspireDeckId === d.id) state.inspireDeckId = null;
      closeModal();
      toast('Deck deleted.');
      if (state.screen === 'decks') {
        render(); // stay put — same folder, same view
      } else {
        const home = d.folderId || fmtFolderId(deckFormat(d)); // deleted the open deck: land in its (auto) folder
        switchPage('decks');
        state.folderNav = home;
        render();
      }
    });
  } else if (m.type === 'deleteFolder') {
    const f = (state.folders || []).find((x) => x.id === m.folderId);
    if (!f) {
      closeModal();
      return;
    }
    const deckN = decksInFolder(f.id).length;
    const subN = (state.folders || []).filter((x) => (x.parentId || null) === f.id).length;
    const parts = [];
    if (deckN) parts.push(`${deckN} deck${deckN === 1 ? '' : 's'}`);
    if (subN) parts.push(`${subN} subfolder${subN === 1 ? '' : 's'}`);
    const inside = parts.join(' and ');
    const body = inside
      ? `The ${inside} inside will be moved up a level — nothing is deleted.`
      : `This folder is empty.`;
    el.innerHTML = /* HTML */ `<div class="modal-backdrop" id="mbd">
      <div class="modal-sheet">
        <h3>Delete folder “${escapeHtml(f.name)}”?</h3>
        <p style="font-size:14px;color:var(--sub-text);margin:0 0 14px;">${body}</p>
        <div class="modal-actions">
          <button class="cancel" id="cancelBtn">Cancel</button
          ><button class="confirm danger" id="delFolderBtn">Delete folder</button>
        </div>
      </div>
    </div>`;
    document.getElementById('delFolderBtn').addEventListener('click', () => {
      deleteFolder(f.id);
      closeModal();
      toast(inside ? 'Folder deleted — its contents moved up a level.' : 'Folder deleted.');
      render();
    });
  } else if (m.type === 'resetAll') {
    el.innerHTML = /* HTML */ `<div class="modal-backdrop" id="mbd">
      <div class="modal-sheet">
        <h3>Reset all app data?</h3>
        <p style="font-size:14px;color:var(--sub-text);margin:0 0 14px;">
          This deletes every saved deck on this device. This can't be undone.
        </p>
        <div class="modal-actions">
          <button class="cancel" id="cancelBtn">Cancel</button
          ><button class="confirm danger" id="resetBtn">Delete Everything</button>
        </div>
      </div>
    </div>`;
    document.getElementById('resetBtn').addEventListener('click', async () => {
      await Promise.all(state.decksIndex.map((x) => deleteDeckStorage(x.id)));
      state.decksIndex = [];
      state.activeDeckId = null;
      state.searchDeckId = null;
      state.inspireDeckId = null;
      state.priceCache = {};
      try {
        localStorage.removeItem(LS_PREFIX + 'prices');
      } catch (e) {}
      closeModal();
      toast('All app data cleared.');
      switchPage('decks');
    });
  }
  document.getElementById('cancelBtn')?.addEventListener('click', closeModal);
  document.getElementById('mbd')?.addEventListener('click', (e) => {
    if (e.target.id === 'mbd') closeModal();
  });
}

function showPreview(src, wb) {
  state.preview = { src, wb: !!wb };
  pushOverlay('preview', () => {
    state.preview = null;
    renderPreview();
  });
  renderPreview();
}

/* Pinch, pan and double-tap on the opened card only. Pointer events are
   used so touch and mouse behave alike; the backdrop takes touch-action:none
   so the browser never claims the gesture. A tap that did not move and did
   not zoom closes the preview, as it always has. */
function _wirePreviewZoom(bd) {
  // A two-faced card zooms as one piece: the card and its flip button.
  const img = bd.querySelector('.pv-card') || bd.querySelector('img');
  if (!img) return;
  const pts = new Map();
  let scale = 1,
    tx = 0,
    ty = 0;
  let start = null,
    moved = false,
    lastTap = 0;
  const apply = () => {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };
  const clampPan = () => {
    // never let a zoomed card drift entirely off the screen
    const r = img.getBoundingClientRect();
    const maxX = Math.max(0, (r.width - bd.clientWidth) / 2);
    const maxY = Math.max(0, (r.height - bd.clientHeight) / 2);
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  };
  const dist = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const mid = () => {
    const [a, b] = [...pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  bd.addEventListener('pointerdown', (e) => {
    // The flip button is a button: it flips, it never closes or zooms.
    if (e.target.closest && e.target.closest('.dfc-flip')) return;
    bd.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.size === 2) {
      start = { d: dist(), s: scale, m: mid(), tx, ty };
    } else if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY, tx, ty };
    }
  });
  bd.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && start && start.d) {
      const m = mid();
      scale = Math.max(1, Math.min(4, start.s * (dist() / start.d)));
      // keep the point between the fingers where it was
      tx = start.tx + (m.x - start.m.x);
      ty = start.ty + (m.y - start.m.y);
      moved = true;
      clampPan();
      apply();
    } else if (pts.size === 1 && start && scale > 1) {
      tx = start.tx + (e.clientX - start.x);
      ty = start.ty + (e.clientY - start.y);
      if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 4) moved = true;
      clampPan();
      apply();
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 1) {
      const [p] = [...pts.values()];
      start = { x: p.x, y: p.y, tx, ty };
      return;
    }
    if (pts.size) return;
    if (moved) {
      start = null;
      return;
    }
    // 1.12: a touch the system took over (gesture navigation's back swipe
    // starts at the screen's side) is no tap -- it must not close anything
    if (e.type === 'pointercancel') {
      start = null;
      return;
    }
    const now = Date.now();
    if (now - lastTap < 320) {
      // double tap: toggle 1x / 2.5x
      lastTap = 0;
      if (scale > 1) {
        scale = 1;
        tx = 0;
        ty = 0;
      } else {
        scale = 2.5;
      }
      apply();
      return;
    }
    lastTap = now;
    // 1.12: only a tap ABOVE or BELOW the card closes it. Beside it is where
    // gesture navigation's back swipe begins: a tap there closed the big
    // card and the back swipe then closed the page beneath as well.
    const cr = img.getBoundingClientRect();
    if (e.clientY >= cr.top && e.clientY <= cr.bottom) return;
    // a plain tap closes -- but only once we know it is not half a double tap
    setTimeout(() => {
      if (lastTap === now && scale === 1) {
        try {
          closeTopOverlay();
        } catch (err) {}
      }
    }, 330);
  };
  bd.addEventListener('pointerup', up);
  bd.addEventListener('pointercancel', up);
}

function renderPreview() {
  let el = document.getElementById('previewRoot');
  if (!state.preview) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'previewRoot';
    document.body.appendChild(el);
  }
  const fl = state.preview.flip;
  if (fl) {
    // data-front carries the card id too, so the remembered face applies here.
    el.innerHTML = /* HTML */ `<div
      class="card-preview-backdrop"
      id="pbd"
      style="touch-action:none;"
    >
      <span class="pv-card" style="transform-origin:center center;will-change:transform;"
        ><img class="${state.preview.wb ? 'wb-card' : ''}" src="${fl.front}" /><span
          class="dfc-flip-box"
          ><button
            class="dfc-flip"
            title="Flip to the other face"
            data-front="${escapeHtml(fl.front)}"
            data-back="${escapeHtml(fl.back)}"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 5V2L7 6l5 4V7c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 13c0-4.42-3.58-8-8-8zm-5.3 2.74L5.24 6.28A7.93 7.93 0 0 0 4 13c0 4.42 3.58 8 8 8v3l5-4-5-4v3c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8z"
              />
            </svg></button></span
      ></span>
    </div>`;
  } else
    el.innerHTML = /* HTML */ `<div
      class="card-preview-backdrop"
      id="pbd"
      style="touch-action:none;"
    >
      <img
        class="${state.preview.wb ? 'wb-card' : ''}"
        src="${state.preview.src}"
        style="transform-origin:center center;will-change:transform;"
      />
    </div>`;
  _wirePreviewZoom(document.getElementById('pbd'));
  // A dead image URL must not strand the person behind a dim scrim with a
  // broken icon — note it and take the preview down.
  el.querySelector('img').addEventListener(
    'error',
    () => {
      _noteCrash(
        'preview img 404',
        state.preview && state.preview.src ? state.preview.src.split('/').slice(-3).join('/') : '',
      );
      try {
        closeTopOverlay();
      } catch (e) {}
    },
    { once: true },
  );
}

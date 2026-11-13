// Games and notes remain available from Deck actions, outside the main tabs.
function openDeckLog(d, { editDescription = false } = {}) {
  if (document.getElementById('deckLogOverlay')) return;
  if (editDescription) {
    state._dpEdit = true;
    state._focusDeckDesc = true;
  }
  const root = document.createElement('div');
  root.id = 'deckLogOverlay';
  root.className = 'overlay deck-log-page deck-workspace';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Deck Log');
  root.innerHTML = `<div class="overlay-inner">
    ${overlayCapHtml('Deck Log', `<button type="button" class="header-filter" id="deckLogClose" aria-label="Back to deck">${ICONS.back}</button>`)}
    <div class="deck-log-body tab-viewport"><div id="deckLogBody" class="deck-log" data-deck-id="${escapeHtml(d.id)}">${primerTabHtml(d)}</div></div>
    ${overlayNavHtml()}</div>`;
  document.body.appendChild(root);
  pushOverlay('deckLog', () => {
    root.remove();
    if (state.screen === 'decklist' && state.activeDeckId === d.id) {
      const viewport = pageScroller(),
        scroll = viewport.scrollTop;
      renderBuilderBody(d);
      updateDeckMeter(d);
      viewport.scrollTop = scroll;
      document.getElementById('menuBtn')?.focus({ preventScroll: true });
    }
  });
  root.querySelector('#deckLogClose').addEventListener('click', closeTopOverlay);
  wireOverlayNav(root);
  wireAppDialogKeys(root, closeTopOverlay);
  wireDeckLog(d, root.querySelector('#deckLogBody'));
  if (!editDescription) root.querySelector('#deckLogClose').focus({ preventScroll: true });
}

function refreshDeckLog(d) {
  const box = document.getElementById('deckLogBody');
  if (!box || box.dataset.deckId !== d.id) return false;
  box.innerHTML = primerTabHtml(d);
  wireDeckLog(d, box);
  return true;
}

function wireDeckLog(d, root) {
  if (!root) return;
  const find = (id) => root.querySelector('#' + id);
  const ta = find('primerText');
  ta?.addEventListener('input', () => {
    d.primer = ta.value;
    scheduleSave(d);
  });
  find('dpSaveEdit')?.addEventListener('click', () => {
    if (find('primerText')) {
      // Save: commit both boxes, show the rendered view
      const t1 = find('deckDescText'),
        t2 = find('primerText');
      if (t1) d.description = t1.value;
      if (t2) d.primer = t2.value;
      scheduleSave(d);
      state._dpEdit = false;
    } else {
      // Edit: back to the two boxes
      state._dpEdit = true;
    }
    const box = root;
    box.innerHTML = primerTabHtml(d);
    wireDeckLog(d, root);
  });
  // Hand tester: goldfish opening hands from the maindeck. Classic
  // simulator mulligan: redraw with one fewer card each time.
  {
    const hand = [];
    let lib = [],
      mull = 7;
    const paint = () => {
      const b = find('htHand');
      if (!b) return;
      b.innerHTML =
        hand
          .map((c) => {
            const u = cardImageMed(c);
            return u
              ? `<img src="${u}" style="width:23%;border-radius:6px;" alt="">`
              : `<span style="font-size:12px;border:2px solid var(--line);border-radius:6px;padding:4px;">${escapeHtml(c.name)}</span>`;
          })
          .join('') || `<span class="hint">${'Draw an opening hand.'}</span>`;
      const m = find('htMull'),
        dr = find('htDraw');
      if (m) {
        m.disabled = !hand.length || mull <= 1;
        m.textContent = 'Mulligan' + (hand.length && mull > 1 ? ' (' + (mull - 1) + ')' : '');
      }
      if (dr) dr.disabled = !hand.length;
    };
    const shuffle = () => {
      lib = d.cards.slice();
      for (let i = lib.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lib[i], lib[j]] = [lib[j], lib[i]];
      }
    };
    const deal = (n) => {
      shuffle();
      hand.length = 0;
      for (let i = 0; i < n && lib.length; i++) hand.push(lib.pop());
      paint();
    };
    find('htNew')?.addEventListener('click', () => {
      mull = 7;
      deal(7);
    });
    find('ptOpen')?.addEventListener('click', () => openPlaytest(d));
    find('htMull')?.addEventListener('click', () => {
      mull = Math.max(1, mull - 1);
      deal(mull);
    });
    find('htDraw')?.addEventListener('click', () => {
      if (lib.length) {
        hand.push(lib.pop());
        paint();
      }
    });
    paint();
  }
  find('logGameBtn')?.addEventListener('click', () => openLogGameOverlay(d));
  if (deckIsConstructed(d)) wireMatchupPanel(d);
  const dta = find('deckDescText');
  dta?.addEventListener('input', () => {
    d.description = dta.value;
    scheduleSave(d);
  });
  if (state._focusDeckDesc && dta) {
    state._focusDeckDesc = false;
    requestAnimationFrame(() => {
      try {
        dta.focus();
        dta.setSelectionRange(dta.value.length, dta.value.length);
        dta.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {}
    });
  }
  find('glogToggle')?.addEventListener('click', () => {
    state._glogOpen = !state._glogOpen;
    const l = find('glogList');
    if (l) l.style.display = state._glogOpen ? '' : 'none';
    const t = find('glogToggle');
    if (t) t.innerHTML = foldIcoHtml(state._glogOpen) + ' ' + escapeHtml(t.dataset.lbl || '');
  });
  root.querySelectorAll('.glog-row').forEach((r) =>
    r.addEventListener('click', (e) => {
      if (e.target.closest('.glog-del')) return; // deleting is not expanding
      r.classList.toggle('open');
    }),
  );
  root.querySelectorAll('[data-dellog]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = parseInt(b.dataset.dellog, 10);
      openInAppConfirm(
        trS('Delete this game from the log?'),
        (ok) => {
          if (!ok) return;
          d.playLog.splice(i, 1);
          scheduleSave(d);
          const box = root;
          box.innerHTML = primerTabHtml(d);
          wireDeckLog(d, root);
        },
        { danger: true, ok: trS('Delete') },
      );
    }),
  );
}

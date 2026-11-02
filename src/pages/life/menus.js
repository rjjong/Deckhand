// pages / life / menus

function closeLifeOverlayUI() {
  closeTopOverlay();
}

function lifePopupCloseHtml(id, label) {
  return /* HTML */ `<button
    type="button"
    class="life-popup-close"
    ${id ? `id="${id}"` : 'data-life-close'}
    aria-label="${escapeHtml(label || trS('Close'))}"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  </button>`;
}

function lifePopupHeadHtml(title, description) {
  return /* HTML */ `<div class="life-popup-head">
    <div>
      <span class="hub-eyebrow">${trS('Life tracker')}</span>
      <h2>${escapeHtml(title)}</h2>
      ${description ? `<p>${escapeHtml(description)}</p>` : ''}
    </div>
    ${lifePopupCloseHtml()}
  </div>`;
}

function lifeMenuPopHtml() {
  const option = (id, icon, label) =>
    `<button type="button" class="lm-opt" id="${id}"><span aria-hidden="true">${icon}</span><span>${escapeHtml(label)}</span></button>`;
  return /* HTML */ `<div
    class="life-radial"
    id="lifeMenuPop"
    role="dialog"
    aria-modal="true"
    aria-label="${'Table menu'}"
  >
    ${option('mHistory', ICONS.list, trS('History'))} ${option('mTools', ICONS.tools, trS('Tools'))}
    ${option('mLifeSettings', ICONS.settings, trS('Settings'))}
    ${option('leaveLifeBtn', ICONS.return, 'Leave')}
  </div>`;
}

/* Restore the four diagonal buttons around the table's center logo. */
function placeLifeRadial() {
  const pop = document.getElementById('lifeMenuPop');
  const cog = document.getElementById('lifeCogBtn');
  if (!pop || !cog) return;
  const r = cog.getBoundingClientRect();
  const cx = r.left + r.width / 2,
    cy = r.top + r.height / 2;
  const q = Math.SQRT1_2;
  const blades = [
    { id: 'mHistory', rot: -45, a: [q, -q], n: [-q, -q], start: true },
    { id: 'mTools', rot: 45, a: [q, q], n: [q, -q], start: true },
    { id: 'mLifeSettings', rot: -45, a: [q, -q], n: [q, q], start: false },
    { id: 'leaveLifeBtn', rot: 45, a: [q, q], n: [-q, q], start: false },
  ];
  const buttons = blades.map((b) => document.getElementById(b.id));
  buttons.forEach((b) => (b.style.width = ''));
  const width = Math.ceil(Math.max(...buttons.map((b) => b.offsetWidth))) + 2;
  const height = Math.max(...buttons.map((b) => b.offsetHeight));
  const edge = r.width / 2 + 4,
    gap = 4;
  const radius = (width + height + gap) * q;
  const room = Math.min(cx, innerWidth - cx, cy, innerHeight - cy) - 12;
  const scale = Math.min(1, Math.max(0.5, room / radius));
  blades.forEach((b, i) => {
    const off = edge + height / 2;
    const along = b.start ? -edge + gap + width / 2 : edge - gap - width / 2;
    const button = buttons[i];
    button.style.width = width + 'px';
    button.style.setProperty('--x', cx + (b.n[0] * off + b.a[0] * along) * scale + 'px');
    button.style.setProperty('--y', cy + (b.n[1] * off + b.a[1] * along) * scale + 'px');
    button.style.setProperty('--a', b.rot + 'deg');
    button.style.setProperty('--scale', scale);
  });
}

/* The dice picker: one popup for every die and the coin. */
function dicePopHtml() {
  const d = (value, label, icon = ICONS.dice) =>
    `<button type="button" class="hub-card dice-opt" data-die="${value}"><span class="hub-icon" aria-hidden="true">${icon}</span><strong>${label}</strong></button>`;
  return /* HTML */ `<div id="diceShield"></div>
    <section
      id="dicePop"
      class="life-panel life-popup"
      role="dialog"
      aria-modal="true"
      aria-label="${trS('Dice')}"
    >
      ${lifePopupHeadHtml(trS('Dice'), 'Choose what to roll.')}
      <div class="dice-grid life-popup-body">
        ${[4, 6, 8, 10, 12, 20].map((n) => d(n, `D${n}`)).join('')}${d('coin', trS('Coin'), ICONS.coin)}${d('high', trS('High Roll'))}
      </div>
    </section>`;
}

function closeLifePopup() {
  if (state.life.menuOpen) {
    closeLifeMenuOnce();
    return;
  }
  const top = state.overlayStack[state.overlayStack.length - 1];
  if (top && ['lifeDice', 'lifeHist', 'lifeSet', 'lifeTools'].includes(top.id)) closeTopOverlay();
  else {
    state.life.diceOpen = false;
    state.life.historyOpen = false;
    state.life.settingsOpen = false;
    state.life.toolsOpen = false;
    renderLifeOverlay();
  }
}

function renderLifeOverlay() {
  let el = document.getElementById('lifeOverlay');
  if (!state.lifeOpen) {
    if (el) el.remove();
    return;
  }
  ensureLifePlayers();
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'lifeOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  // The table stays full screen; the center logo opens its four controls.
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    <main>
      <div id="lifeHistoryPanel"></div>
      <div id="lifeSettingsPanel"></div>
      <div id="lifeToolsPanel"></div>
      <div id="lifeGrid"></div>
    </main>
    ${state.life.menuOpen ? `<div id="lifeMenuShield"></div>${lifeMenuPopHtml()}` : ''}
    ${state.life.diceOpen ? dicePopHtml() : ''}
    ${(state.life.historyOpen || state.life.settingsOpen || state.life.toolsOpen) && !state.life.diceOpen ? '<div id="lifePanelShield"></div>' : ''}
  </div>`;
  if (state.life.menuOpen) {
    // Back closes a panel before leaving the table.
    const _lifeSub = (id, key) => {
      state.life.menuOpen = false;
      const top = state.overlayStack[state.overlayStack.length - 1];
      if (state.life[key]) {
        if (top && top.id === id) closeTopOverlay();
        else {
          state.life[key] = false;
          renderLifeOverlay();
        }
        return;
      }
      state.life[key] = true;
      renderLifeOverlay();
      pushOverlay(id, () => {
        state.life[key] = false;
        renderLifeOverlay();
      });
    };
    document
      .getElementById('mHistory')
      .addEventListener('click', () => _lifeSub('lifeHist', 'historyOpen'));
    document
      .getElementById('mTools')
      ?.addEventListener('click', () => _lifeSub('lifeTools', 'toolsOpen'));
    document
      .getElementById('mLifeSettings')
      .addEventListener('click', () => _lifeSub('lifeSet', 'settingsOpen'));
    document.getElementById('leaveLifeBtn')?.addEventListener('click', () => {
      lifeAutosave();
      state.life.menuOpen = false;
      dismissAllOverlays();
      render();
    });
    // The shield sits over the whole table, under the menu: any tap outside
    // the menu lands here first, closes the menu, and goes NO further — the
    // tap-hold zones use pointer events, so only a physical layer stops them.
    const shield = document.getElementById('lifeMenuShield');
    if (shield) {
      ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach((ev) => {
        shield.addEventListener(
          ev,
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (state.life.menuOpen) {
              state.life.menuOpen = false;
              renderLifeOverlay();
            }
          },
          { passive: false },
        );
      });
    }
  }
  renderHistoryPanel();
  renderSettingsPanel();
  renderLifeToolsPanel();
  renderLifeGrid();
  // The panel shield sits under the floating History/Settings panel: a tap
  // outside the panel closes it (via the back-press ladder) and goes NO
  // further -- the life tap-zones never see the touch.
  const pShield = document.getElementById('lifePanelShield');
  if (pShield) {
    const closePanel = () => {
      const top = state.overlayStack[state.overlayStack.length - 1];
      if (top && ['lifeHist', 'lifeSet', 'lifeTools'].includes(top.id)) closeTopOverlay();
      else {
        state.life.historyOpen = false;
        state.life.settingsOpen = false;
        state.life.toolsOpen = false;
        renderLifeOverlay();
      }
    };
    let pClosed = false; // pointerdown+touchstart both fire on touch -- close once
    ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach((ev) => {
      pShield.addEventListener(
        ev,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!pClosed) {
            pClosed = true;
            closePanel();
          }
        },
        { passive: false },
      );
    });
  }
  el.querySelectorAll('[data-life-close]').forEach((b) =>
    b.addEventListener('click', closeLifePopup),
  );
  const popup = el.querySelector('#dicePop, #lifeMenuPop') || el.querySelector('.life-popup');
  if (popup) {
    wireAppDialogKeys(popup, closeLifePopup);
    popup.querySelector('.life-popup-close, .lm-opt')?.focus({ preventScroll: true });
  }
  // Dice picker wiring: any die rolls and closes; the shield or back closes.
  if (state.life.diceOpen) {
    const closeDice = () => {
      const top = state.overlayStack[state.overlayStack.length - 1];
      if (top && top.id === 'lifeDice') closeTopOverlay();
      else {
        state.life.diceOpen = false;
        renderLifeOverlay();
      }
    };
    const dShield = document.getElementById('diceShield');
    if (dShield) {
      let dClosed = false; // pointerdown+touchstart both fire on touch -- close once
      ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach((ev) => {
        dShield.addEventListener(
          ev,
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!dClosed) {
              dClosed = true;
              closeDice();
            }
          },
          { passive: false },
        );
      });
    }
    document.querySelectorAll('#dicePop .dice-opt').forEach((b) =>
      b.addEventListener('click', () => {
        const v = b.dataset.die;
        closeDice();
        if (v === 'coin') flipCoin();
        else if (v === 'high') animatedHighRoll('high');
        else rollDie(parseInt(v, 10));
      }),
    );
  }
}

function renderLifeToolsPanel() {
  const box = document.getElementById('lifeToolsPanel');
  if (!box) return;
  if (!state.life.toolsOpen || state.life.diceOpen) {
    box.innerHTML = '';
    return;
  }

  const tool = (id, icon, label) =>
    `<button type="button" class="hub-card life-tool" id="${id}"><span class="hub-icon" aria-hidden="true">${icon}</span><strong>${escapeHtml(label)}</strong></button>`;
  box.innerHTML = /* HTML */ `<section
    class="life-panel life-popup"
    role="dialog"
    aria-modal="true"
    aria-label="${trS('Tools')}"
  >
    ${lifePopupHeadHtml(trS('Tools'))}
    <div class="life-tools-grid life-popup-body">
      ${tool('mDice', ICONS.dice, trS('Dice'))} ${tool('lifeJudgeBtn', ICONS.gavel, 'Ask AI Judge')}
      ${tool('lifeRestoreBtn', ICONS.restore, 'Restore a game')}
      ${tool('restartLifeBtn', ICONS.close, 'Restart game')}
    </div>
  </section>`;
  box.querySelector('#mDice').addEventListener('click', () => {
    state.life.diceOpen = true;
    renderLifeOverlay();
    pushOverlay('lifeDice', () => {
      state.life.diceOpen = false;
      renderLifeOverlay();
    });
  });
  box.querySelector('#lifeJudgeBtn').addEventListener('click', openJudgePopup);
  box.querySelector('#lifeRestoreBtn').addEventListener('click', openLifeRestore);
  box.querySelector('#restartLifeBtn').addEventListener('click', restartLife);
}

function renderHistoryPanel() {
  const box = document.getElementById('lifeHistoryPanel');
  if (!box) return;
  if (!state.life.historyOpen) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = /* HTML */ `<section
    class="life-panel life-popup"
    role="dialog"
    aria-modal="true"
    aria-label="${trS('History')}"
  >
    ${lifePopupHeadHtml(trS('History'), 'The latest events appear first.')}
    <div class="hub-actions life-popup-body history-list">
      ${state.life.history.length ? state.life.history.map((h) => `<div class="hub-card life-history-row">${escapeHtml(h)}</div>`).join('') : `<p class="hub-footnote">${'No events yet.'}</p>`}
    </div>
  </section>`;
}

function renderSettingsPanel() {
  const box = document.getElementById('lifeSettingsPanel');
  if (!box) return;
  if (!state.life.settingsOpen) {
    box.innerHTML = '';
    return;
  }
  const S = state.life.settings;

  const rows = [
    {
      key: 'autoKill',
      label: 'Auto-Kill',
      sub: lethalDmg()
        ? `Mark a player defeated at 0 life, 10 poison, or ${lethalDmg()} ${lifeLeaderWord()} damage`
        : 'Mark a player defeated at 0 life or 10 poison',
    },
    ...(lethalDmg()
      ? [
          {
            key: 'admiralDamage',
            label: `Track ${lifeLeaderWord()} Damage`,
            sub: `${lethalDmg()} from one ${lifeLeaderWord()} is lethal`,
          },
        ]
      : []),
    {
      key: 'poison',
      label: 'Track Poison',
      sub: '10 poison counters is lethal',
    },
    { key: 'salty', label: 'Salty Defeat Messages', sub: 'Show a flavor message on defeat' },
  ];
  box.innerHTML = /* HTML */ `<section
    class="life-panel life-popup"
    role="dialog"
    aria-modal="true"
    aria-label="${trS('Settings')}"
  >
    ${lifePopupHeadHtml(trS('Settings'), 'Make the table work for your game.')}
    <div class="hub-actions life-popup-body">
      ${rows.map((r) => `<div class="hub-card life-toggle"><div class="hub-copy"><strong>${escapeHtml(r.label)}</strong><small>${escapeHtml(r.sub)}</small></div><label class="toggle-switch"><input type="checkbox" aria-label="${escapeHtml(r.label)}" data-lset="${r.key}" ${S[r.key] ? 'checked' : ''}><span class="track"></span><span class="knob"></span></label></div>`).join('')}
      <div class="hub-card life-toggle">
        <div class="hub-copy">
          <strong>Rotate for Pass-and-Play</strong
          ><small>Flip cards to face each seat around the table</small>
        </div>
        <label class="toggle-switch"
          ><input
            type="checkbox"
            aria-label="Rotate for Pass-and-Play"
            id="rotateToggle"
            ${state.life.rotate ? 'checked' : ''} /><span class="track"></span
          ><span class="knob"></span
        ></label>
      </div>
      ${canSetLifeBright() ? `<div class="hub-card life-bright"><div class="hub-copy"><strong>${'Brightness'} <b id="lifeBrightVal">${lifeBrightLabel(lifeBrightPct())}</b></strong><small>${'All the way left: your phone decides. Further: locked at that level while the life counter is open, and remembered.'}</small><input type="range" aria-label="${'Brightness'}" id="lifeBrightRange" min="0" max="100" step="5" value="${lifeBrightPct()}"></div></div>` : ''}
    </div>
  </section>`;
  document.querySelectorAll('[data-lset]').forEach((chk) => {
    chk.addEventListener('change', () => {
      state.life.settings[chk.dataset.lset] = chk.checked;
    });
  });
  document.getElementById('rotateToggle').addEventListener('change', (e) => {
    state.life.rotate = e.target.checked;
    renderLifeGrid();
  });
  const br = document.getElementById('lifeBrightRange');
  br?.addEventListener('input', () => {
    let v = Math.max(0, Math.min(100, parseInt(br.value, 10) || 0));
    try {
      localStorage.setItem(LS_PREFIX + 'lifeBright', String(v));
    } catch (e) {}
    const lab = document.getElementById('lifeBrightVal');
    if (lab) lab.textContent = lifeBrightLabel(v);
    try {
      sendLifeBright(window.DeckhandNotify, v);
    } catch (e) {}
  });
}

/* In-app sheet for typing an exact life total (no ugly native prompt). */
function openSetLifePopup(idx) {
  const p = ensureLifePlayers()[idx];
  let el = document.getElementById('setLifePopup');
  if (!el) {
    el = document.createElement('div');
    el.className = 'deckpick-scrim';
    el.id = 'setLifePopup';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  el.style.alignItems = 'center';
  el.style.zIndex = 10020;
  el.innerHTML = /* HTML */ `<div
    class="deckpick app-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="setLifeTitle"
  >
    <span class="hub-icon dialog-icon" aria-hidden="true">${ICONS.heart}</span>
    <h2 id="setLifeTitle">${escapeHtml(p.name)}</h2>
    <label class="hub-footnote" for="setLifeInput">${'Set life total'}</label>
    <input id="setLifeInput" type="number" inputmode="numeric" value="${p.life}" />
    <div class="dialog-actions">
      <button type="button" class="dp-cancel dialog-secondary" id="setLifeCancel">
        ${trS('Cancel')}
      </button>
      <button type="button" class="primary-btn dialog-primary" id="setLifeOk">${'Set'}</button>
    </div>
  </div>`;
  const close = () => el.remove();
  const commit = () => {
    const target = parseInt(document.getElementById('setLifeInput').value, 10);
    if (isNaN(target)) {
      toast('Enter a number.');
      return;
    }
    close();
    const diff = target - p.life;
    if (diff !== 0) adjustLifeField(idx, 'life', diff);
  };
  document.getElementById('setLifeCancel').addEventListener('click', close);
  document.getElementById('setLifeOk').addEventListener('click', commit);
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  wireAppDialogKeys(el, close);
  const inp = document.getElementById('setLifeInput');
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
  });
  setTimeout(() => {
    if (inp.isConnected) {
      inp.focus();
      inp.select();
    }
  }, 50);
}

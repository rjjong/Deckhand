// pages / life / table

function closeLifeMenuOnce() {
  if (!state.lifeOpen) {
    state.life.menuOpen = false;
    return;
  }
  if (state.life.menuOpen) {
    state.life.menuOpen = false;
    renderLifeOverlay();
  }
}

/* 1.45 desk: measure the free strip of the top bar (between Back and the
   page buttons) so the page's name can sit in it. */
function deskCapFit() {
  if (!isDesk()) return;
  const nav =
    document.querySelector('.app .brand-banner:not(.ov-nav)') ||
    document.querySelector('.brand-banner');
  if (!nav) return;
  const kids = Array.from(nav.children).filter((k) => k.getBoundingClientRect().width > 0);
  const sp = kids.findIndex((k) => k.classList.contains('spacer'));
  if (sp < 0) return;
  let L = 0,
    R = window.innerWidth;
  kids.slice(0, sp).forEach((k) => {
    L = Math.max(L, k.getBoundingClientRect().right);
  });
  kids.slice(sp + 1).forEach((k) => {
    R = Math.min(R, k.getBoundingClientRect().left);
  });
  const root = document.documentElement.style;
  root.setProperty('--capL', Math.round(L + 12) + 'px');
  root.setProperty('--capR', Math.round(window.innerWidth - R + 12) + 'px');
}

{
  let _cfT = 0;
  const go = () => {
    if (_cfT) return;
    _cfT = requestAnimationFrame(() => {
      _cfT = 0;
      try {
        deskCapFit();
      } catch (e) {}
    });
  };
  window.addEventListener('resize', go);
  try {
    new MutationObserver(go).observe(document.body, { childList: true });
  } catch (e) {}
  try {
    const a = document.querySelector('.app');
    if (a) new MutationObserver(go).observe(a, { childList: true });
  } catch (e) {}
  setTimeout(go, 300);
}

function phyrexianSvg(sz) {
  return `<svg viewBox="0 0 24 24" style="width:${sz || 18}px;height:${sz || 18}px;" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><ellipse cx="12" cy="12.5" rx="7.2" ry="6.4"/><line x1="12" y1="2.5" x2="12" y2="21.5"/></svg>`;
}

function cmdrDmgSvg(sz) {
  return `<svg viewBox="0 0 24 24" style="width:${sz || 18}px;height:${sz || 18}px;" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 4l11 11M19 4L8 15"/><path d="M13.5 17.5l5-5M5.5 12.5l5 5"/><path d="M16 15l4 4M8 15l-4 4"/></svg>`;
}

/* The pill on every life card: poison counters, and the highest commander
   damage this player has taken -- icon and number wear the colour of the
   card that dealt it. Follows the life-counter settings. */
function lifeBadgeHtml(p, idx) {
  const S = state.life.settings || {};
  let hi = 0,
    from = -1;
  (p.dmg || []).forEach((v, j) => {
    if (j !== idx && v > hi) {
      hi = v;
      from = j;
    }
  });
  const col = from >= 0 ? PLAYER_COLORS[from % PLAYER_COLORS.length].base : '';
  const poison =
    S.poison !== false
      ? `<span class="lb-grp pz ${p.poison >= 10 ? 'danger' : ''}">${phyrexianSvg(19)}<b>${p.poison}</b></span>`
      : '';
  const cmd =
    S.admiralDamage !== false && lethalDmg() > 0
      ? `<span class="lb-grp cd ${hi ? 'hit' : ''} ${hi >= lethalDmg() ? 'danger' : ''}"${col ? ` style="--lbc:${col}"` : ''}>${cmdrDmgSvg(19)}<b>${hi}</b></span>`
      : '';
  return poison + cmd || '\u2620';
}

/* The running −N (left of a number) or +N (right of it) that fades a moment
   after the tapping stops -- life, poison and commander damage alike. */
function ldeltaHtml(v, fresh, plusSide) {
  v = v || 0;
  if (plusSide)
    return /* HTML */ `<span
      class="ldelta plus ${v > 0 ? 'show' : ''} ${v > 0 && fresh ? 'pop' : ''}"
      >${v > 0 ? '+' + v : ''}</span
    >`;
  return /* HTML */ `<span
    class="ldelta minus ${v < 0 ? 'show' : ''} ${v < 0 && fresh ? 'pop' : ''}"
    >${v < 0 ? '\u2212' + Math.abs(v) : ''}</span
  >`;
}

function lifeRolesHtml(p) {
  if (!p.monarch && !p.initiative) return '';
  return `<div class="life-roles">
    ${p.monarch ? `<span class="life-role-icon lmonarch" role="img" aria-label="Monarch" title="Monarch">${CROWN_SVG}</span>` : ''}
    ${p.initiative ? `<span class="life-role-icon linitiative" role="img" aria-label="Initiative" title="Initiative">${INITIATIVE_SVG}</span>` : ''}
  </div>`;
}

function lifeCardHtml(p, idx, count) {
  const rot = state.life.rotate ? (lifeLayout().rot[idx] ?? seatRotation(idx, count)) : 0;
  const open = state.life.expandedIdx === idx;
  const col = PLAYER_COLORS[idx % PLAYER_COLORS.length];
  const players = ensureLifePlayers();
  const focus = state.life.expandedIdx;
  const style = `transform:translate(-50%,-50%) rotate(${rot}deg); background:linear-gradient(160deg, ${col.base}, ${col.dark});`;

  // Damage-entry mode: one player is tallying what they've taken, so every
  // *other* player's card becomes a tappable counter laid over their life total.
  if (focus !== null && !open) {
    const fp = players[focus];
    const taken = (fp.dmg && fp.dmg[idx]) || 0;
    return /* HTML */ `<div class="life-cell">
      <div class="life-card-v2" data-idx="${idx}" data-rot="${rot}" style="${style}">
        <div class="life-face front">
          <div class="lval2 ghosted">${p.life}</div>
        </div>
        <div
          class="dmg-overlay ${lethalDmg() && taken >= lethalDmg() ? 'lethal' : ''}"
          data-dmgfrom="${idx}"
        >
          <div class="tap-zone left" data-dmgside="minus"><span class="tap-glyph">−</span></div>
          <div class="tap-zone right" data-dmgside="plus"><span class="tap-glyph">+</span></div>
          <div class="lval-row">
            ${ldeltaHtml((fp._dmgDelta || {})[idx], !!(fp._dmgFresh || {})[idx])}
            <div class="dmg-ov-val">${taken}</div>
            ${ldeltaHtml((fp._dmgDelta || {})[idx], !!(fp._dmgFresh || {})[idx], true)}
          </div>
        </div>
      </div>
    </div>`;
  }

  if (open) {
    // Same grammar as the life total: the left half of the card is minus,
    // the right half plus, a held finger walks by 10. Everything sits on the
    // centre line, clear of the corner cut for the cog.
    const S = state.life.settings || {};
    const pz = S.poison !== false;
    return /* HTML */ `<div class="life-cell">
      <div class="life-card-v2 focused" data-idx="${idx}" data-rot="${rot}" style="${style}">
        <div class="life-face front pz-face">
          ${
            pz
              ? `<div class="tap-zone left" data-poison="${idx}" data-side="minus"><span class="tap-glyph">−</span></div>
        <div class="tap-zone right" data-poison="${idx}" data-side="plus"><span class="tap-glyph">+</span></div>`
              : ''
          }
          <div class="focus-name">${escapeHtml(p.name)}</div>
          ${
            pz
              ? `<div class="pz-label">${phyrexianSvg(15)}<span>Poison</span></div>
        <div class="lval-row">${ldeltaHtml(p._pzDelta, p._pzFresh)}<div class="lval2 pz-val ${p.poison >= 10 ? 'danger' : ''}">${p.poison}</div>${ldeltaHtml(p._pzDelta, p._pzFresh, true)}</div>`
              : `<div class="pz-label" style="max-width:80%;white-space:normal;text-transform:none;">${trS('Tap another player to count the damage you took from them.')}</div>`
          }
          <div class="lf-extras">
            <button
              type="button"
              class="lf-x${p.monarch ? ' on' : ''}"
              data-lmonarch="${idx}"
              title="Monarch"
              aria-label="Monarch"
              aria-pressed="${!!p.monarch}"
            >
              ${CROWN_SVG}<span>Monarch</span></button
            ><button
              type="button"
              class="lf-x${p.initiative ? ' on' : ''}"
              data-linitiative="${idx}"
              title="Initiative"
              aria-label="Initiative"
              aria-pressed="${!!p.initiative}"
            >
              ${INITIATIVE_SVG}<span>Initiative</span></button
            ><button
              type="button"
              class="lf-x${p.dg ? ' on' : ''}"
              data-ldungeon="${idx}"
              title="Dungeon"
              aria-label="Dungeon"
            >
              ${DUNGEON_SVG}<span>${p.dg ? escapeHtml(p.dg.room) : 'Dungeon'}</span>
            </button>
          </div>
          <button class="submenu-toggle done" data-idx="${idx}">${trS('\u2713 Done')}</button>
        </div>
      </div>
    </div>`;
  }

  const isTurn = false;
  // 1.48: everyone else is out -- this player won
  const _alive = players.filter((q) => !q.defeated);
  const won = players.length > 1 && !p.defeated && _alive.length === 1;
  return /* HTML */ `<div class="life-cell">
    <div
      class="life-card-v2 ${isTurn ? 'active-turn' : ''}${won ? ' winner' : ''}"
      data-idx="${idx}"
      data-rot="${rot}"
      style="${style}"
    >
      ${won ? `<div class="win-fx" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div><div class="win-banner">\u{1F3C6} ${appLang() === 'nl' ? 'Winnaar!' : 'Winner!'}</div>` : ''}
      <div class="life-face front ${p.defeated ? 'defeated' : ''}">
        ${p.medal ? `<div class="medal-badge" title="High roll winner">${modeGlyph()}</div>` : ''}
        <div class="tap-zone left" data-idx="${idx}" data-side="minus">
          <span class="tap-glyph">−</span>
        </div>
        <div class="tap-zone right" data-idx="${idx}" data-side="plus">
          <span class="tap-glyph">+</span>
        </div>
        <input
          class="pname-input"
          data-idx="${idx}"
          value="${escapeHtml(p.name)}"
          size="${Math.max(4, Math.min(14, p.name.length || 8))}"
        />
        ${p.dg ? `<div class="ldungeon">${DUNGEON_SVG}<span>${escapeHtml(p.dg.room)}</span></div>` : ''}
        <div class="lval-row">
          ${lifeRolesHtml(p)}
          <span
            class="ldelta minus ${p._delta < 0 ? 'show' : ''} ${p._delta < 0 && p._deltaFresh ? 'pop' : ''}"
            >${p._delta < 0 ? '−' + Math.abs(p._delta) : ''}</span
          >
          <div class="lval2" data-setlife="${idx}" title="Tap to set life">${p.life}</div>
          <span
            class="ldelta plus ${p._delta > 0 ? 'show' : ''} ${p._delta > 0 && p._deltaFresh ? 'pop' : ''}"
            >${p._delta > 0 ? '+' + p._delta : ''}</span
          >
        </div>
        <button
          class="submenu-toggle lbadge"
          data-idx="${idx}"
          title="${escapeHtml('Poison & ' + lifeLeaderWord() + ' damage')}"
        >
          ${lifeBadgeHtml(p, idx)}
        </button>
        ${p.defeated ? `<div class="defeat-banner"><div class="dtxt">${escapeHtml(p.defeatMsg)}</div><button class="revive-btn" data-idx="${idx}">Revive</button></div>` : ''}
      </div>
    </div>
  </div>`;
}

/* Which corner/edge of each player rectangle gets a square cut out to make
   room for the central turn hub. Depends on where the seat sits relative to
   the middle of the table grid. */
function renderLifeGrid() {
  const box = document.getElementById('lifeGrid');
  if (!box) return;
  const players = ensureLifePlayers();
  const lay = lifeLayout();
  const cols = lay.areas[0].split(' ').length;
  box.className = 'life-grid-v2';
  box.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  box.style.gridTemplateAreas = lay.areas.map((r) => `"${r}"`).join(' ');
  box.style.gridAutoRows = '';
  box.innerHTML = players.map((p, i) => lifeCardHtml(p, i, players.length)).join('');
  players.forEach((p) => {
    delete p._deltaFresh;
    delete p._pzFresh;
    delete p._dmgFresh;
  });
  Array.from(box.children).forEach((cell, i) => {
    cell.style.gridArea = 'abcdefgh'[i] || 'auto';
  });
  // The cog lives at the table's centre (absolutely positioned, so it is no
  // grid cell); the cards around it get their facing corner cut in
  // layoutLifeCards, where their pixel sizes are known.
  box.insertAdjacentHTML(
    'beforeend',
    `<button id="lifeCogBtn" title="Menu" aria-label="Menu"><img src="${DECKHAND_BADGE}" alt=""></button>`,
  );
  document.getElementById('lifeCogBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.life.menuOpen = !state.life.menuOpen;
    renderLifeOverlay();
  });
  wireLifeGrid();
  requestAnimationFrame(layoutLifeCards);
  if (state.life.setupDone) lifeAutosave(); // 1.46
  {
    // 1.48: the win goes into the history once
    const alive = players.filter((q) => !q.defeated);
    const wid = players.length > 1 && alive.length === 1 ? players.indexOf(alive[0]) : -1;
    if (wid >= 0 && state.life._winLogged !== wid) {
      state.life._winLogged = wid;
      lifeLog(`\u{1F3C6} ${alive[0].name} ${appLang() === 'nl' ? 'wint!' : 'wins!'}`);
      try {
        navigator.vibrate && navigator.vibrate([30, 60, 30]);
      } catch (e) {}
    }
    if (wid < 0) state.life._winLogged = null;
  }
}

/* 1.29: the logo sits where the most cards MEET -- a corner shared by four
   cards beats a T, and a T beats the bare middle -- nearest the middle of
   the table. Corner cuts leave every life total clear; a cut in the middle
   of a narrow card's edge ran into its number. */
function lifeHubPoint(grid) {
  const gr = grid.getBoundingClientRect();
  const cells = Array.from(grid.querySelectorAll(':scope > .life-cell')).map((c) =>
    c.getBoundingClientRect(),
  );
  const mid = { x: gr.left + gr.width / 2, y: gr.top + gr.height / 2 };
  if (cells.length < 3) return mid;
  const pts = [];
  cells.forEach((r, ci) => {
    [
      [r.left, r.top, -1, -1],
      [r.right, r.top, 1, -1],
      [r.left, r.bottom, -1, 1],
      [r.right, r.bottom, 1, 1],
    ].forEach(([x, y, sx, sy]) => {
      const px = x + sx * 5,
        py = y + sy * 5;
      if (px < gr.left + 12 || px > gr.right - 12 || py < gr.top + 12 || py > gr.bottom - 12)
        return; // the table's own rim
      let hit = pts.find((q) => Math.abs(q.x - px) < 18 && Math.abs(q.y - py) < 18);
      if (!hit) {
        hit = { x: px, y: py, cells: new Set() };
        pts.push(hit);
      }
      hit.cells.add(ci);
    });
  });
  if (!pts.length) return mid;
  pts.forEach((q) => {
    q.n = q.cells.size;
    q.d = Math.hypot(q.x - mid.x, q.y - mid.y);
  });
  pts.sort((a, b) => b.n - a.n || a.d - b.d);
  return { x: pts[0].x, y: pts[0].y };
}

function layoutLifeCards() {
  const grid = document.getElementById('lifeGrid');
  const gr = grid ? grid.getBoundingClientRect() : null;
  const hub = grid && gr ? lifeHubPoint(grid) : null;
  if (hub) {
    const cog = document.getElementById('lifeCogBtn');
    if (cog) {
      cog.style.left = Math.round(hub.x - gr.left) + 'px';
      cog.style.top = Math.round(hub.y - gr.top) + 'px';
    }
  }
  document.querySelectorAll('.life-cell').forEach((cell) => {
    const card = cell.querySelector('.life-card-v2');
    if (!card) return;
    const rot = +card.dataset.rot;
    const w = cell.clientWidth,
      h = cell.clientHeight;
    if (!w || !h) return;
    if (rot === 90 || rot === 270) {
      card.style.width = h + 'px';
      card.style.height = w + 'px';
    } else {
      card.style.width = w + 'px';
      card.style.height = h + 'px';
    }
    // Cut the corner (or mid-edge, when the cell straddles the centre line)
    // that faces the table's centre, making room for the cog. Cell-space
    // corner/edge indices (0 TL/top, 1 TR/right, 2 BR/bottom, 3 BL/left) are
    // mapped into CARD space by undoing the card's rotation: a corner at
    // index i shows at i + rot/90 after a clockwise rotation, so the local
    // index is (facing − rot/90) mod 4.
    if (gr) {
      const cr = cell.getBoundingClientRect();
      const gx = hub ? hub.x : gr.left + gr.width / 2,
        gy = hub ? hub.y : gr.top + gr.height / 2;
      const dx = cr.left + cr.width / 2 - gx;
      const dy = cr.top + cr.height / 2 - gy;
      const C = 70,
        D = 58; // 1.29: deeper cuts for the bigger logo button
      let clip = '';
      const steps = Math.round((((rot % 360) + 360) % 360) / 90) % 4;
      // 1.39: only a card that TOUCHES the cog gets a cut -- the nearest
      // point of the card to the table's centre must lie within reach of it.
      // (Rows away from the centre, in 5-8 player tables, stay whole.)
      const nx = Math.max(cr.left, Math.min(gx, cr.right)),
        ny = Math.max(cr.top, Math.min(gy, cr.bottom));
      const near = Math.hypot(nx - gx, ny - gy) < 36;
      // the centre runs through the card's width or height: a mid-edge notch
      const inX = gx > cr.left + 24 && gx < cr.right - 24,
        inY = gy > cr.top + 24 && gy < cr.bottom - 24;
      if (!near) {
        card._cutKind = '';
        card._cutIdx = -1;
      } else if (inX || inY) {
        // straddles the centre on one axis → notch the middle of the facing edge
        const edge = inX ? (dy > 0 ? 0 : 2) : dx > 0 ? 3 : 1; // facing edge in cell space
        const e = (edge - steps + 4) % 4;
        const notch = {
          0: `polygon(0 0, calc(50% - ${C}px) 0, 50% ${D}px, calc(50% + ${C}px) 0, 100% 0, 100% 100%, 0 100%)`,
          1: `polygon(0 0, 100% 0, 100% calc(50% - ${C}px), calc(100% - ${D}px) 50%, 100% calc(50% + ${C}px), 100% 100%, 0 100%)`,
          2: `polygon(0 0, 100% 0, 100% 100%, calc(50% + ${C}px) 100%, 50% calc(100% - ${D}px), calc(50% - ${C}px) 100%, 0 100%)`,
          3: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 calc(50% + ${C}px), ${D}px 50%, 0 calc(50% - ${C}px))`,
        };
        clip = notch[e];
        card._cutKind = 'edge';
        card._cutIdx = e;
      } else {
        const corner = dy < 0 ? (dx < 0 ? 2 : 3) : dx < 0 ? 1 : 0; // facing corner in cell space
        const k = (corner - steps + 4) % 4;
        const cut = {
          0: `polygon(${C}px 0, 100% 0, 100% 100%, 0 100%, 0 ${C}px)`,
          1: `polygon(0 0, calc(100% - ${C}px) 0, 100% ${C}px, 100% 100%, 0 100%)`,
          2: `polygon(0 0, 100% 0, 100% calc(100% - ${C}px), calc(100% - ${C}px) 100%, 0 100%)`,
          3: `polygon(0 0, 100% 0, 100% 100%, ${C}px 100%, 0 calc(100% - ${C}px))`,
        };
        clip = cut[k];
        card._cutKind = 'corner';
        card._cutIdx = k;
      }
      card.style.clipPath = clip;
      // the first-player mark sits top-right; when that corner is cut, top-left
      card.classList.toggle('medal-alt', card._cutKind === 'corner' && card._cutIdx === 1);
      // (The old trim bars along the cuts drew the dark diagonal strokes —
      //  retired: the cuts stay clean, no line of any kind.)
      card.querySelectorAll('.life-trim').forEach((t) => t.remove());
    }
  });
  if (state.life.menuOpen) placeLifeRadial();
}

window.addEventListener('resize', () => {
  if (state.lifeOpen) layoutLifeCards();
});

function wireTapHold(el, onTap, onHold, holdMs, repeatMs) {
  holdMs = holdMs || 550;
  let timer = null,
    rep = null,
    moved = false,
    startX = 0,
    startY = 0,
    held = false;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (rep) {
      clearInterval(rep);
      rep = null;
    }
  };
  el.addEventListener(
    'touchstart',
    (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      moved = false;
      held = false;
      if (onHold)
        timer = setTimeout(() => {
          held = true;
          onHold();
          if (navigator.vibrate) navigator.vibrate(25);
          // Keep the finger down and the action repeats on an interval — one
          // long press can walk life up or down as far as needed.
          if (repeatMs)
            rep = setInterval(() => {
              onHold();
              if (navigator.vibrate) navigator.vibrate(12);
            }, repeatMs);
        }, holdMs);
    },
    { passive: true },
  );
  el.addEventListener(
    'touchmove',
    (e) => {
      const dx = e.touches[0].clientX - startX,
        dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        moved = true;
        clear();
      }
    },
    { passive: true },
  );
  el.addEventListener('touchend', () => {
    clear();
    if (!moved && !held) onTap();
  });
  el.addEventListener('touchcancel', clear);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function wireLifeGrid() {
  document.querySelectorAll('.lbtn').forEach((b) => {
    b.addEventListener('click', () =>
      adjustLifeField(
        +b.dataset.idx,
        b.dataset.field,
        +b.dataset.d,
        b.dataset.from !== undefined ? +b.dataset.from : undefined,
      ),
    );
  });
  document.querySelectorAll('.pname-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      ensureLifePlayers()[+inp.dataset.idx].name = inp.value || 'Player ' + (+inp.dataset.idx + 1);
    });
    inp.addEventListener('blur', renderLifeGrid);
    inp.addEventListener('click', (e) => e.stopPropagation());
  });
  document.querySelectorAll('.lval2[data-setlife]').forEach((v) => {
    v.addEventListener('click', (e) => {
      e.stopPropagation();
      openSetLifePopup(+v.dataset.setlife);
    });
  });
  // Table roles and dungeons share the player's counter controls.
  document.querySelectorAll('[data-lmonarch]').forEach((b) => {
    ['pointerdown', 'touchstart'].forEach((ev) =>
      b.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }),
    );
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      lifeSetMonarch(+b.dataset.lmonarch);
    });
  });
  document.querySelectorAll('[data-linitiative]').forEach((b) => {
    ['pointerdown', 'touchstart'].forEach((ev) =>
      b.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }),
    );
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      lifeSetInitiative(+b.dataset.linitiative);
    });
  });
  document.querySelectorAll('[data-ldungeon]').forEach((b) => {
    ['pointerdown', 'touchstart'].forEach((ev) =>
      b.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }),
    );
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openLifeDungeon(+b.dataset.ldungeon);
    });
  });
  document.querySelectorAll('.revive-btn').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = ensureLifePlayers()[+b.dataset.idx];
      p.defeated = false;
      p.defeatMsg = '';
      lifeLog(`${p.name} was revived.`);
      renderLifeGrid();
    });
  });
  document.querySelectorAll('.submenu-toggle').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = +b.dataset.idx;
      if (state.life.expandedIdx === idx) {
        closeTopOverlay(); // Done — pops the damage-mode history entry
      } else {
        state.life.expandedIdx = idx;
        pushOverlay('lifeDamage', () => {
          state.life.expandedIdx = null;
          renderLifeGrid();
        });
        renderLifeGrid();
      }
    });
  });
  // Only the life zones carry data-idx. The damage-mode zones have their own
  // handler below; wiring them here too sent adjustLifeField a player index
  // of NaN ("Cannot read properties of undefined (reading 'life')").
  document.querySelectorAll('.tap-zone[data-idx]').forEach((zone) => {
    const idx = +zone.dataset.idx,
      side = zone.dataset.side;
    wireTapHold(
      zone,
      () => adjustLifeField(idx, 'life', side === 'minus' ? -1 : 1),
      () => adjustLifeField(idx, 'life', side === 'minus' ? -10 : 10),
      550,
      700, // held finger: another ±10 every 0.7s
    );
  });
  document.querySelectorAll('.tap-zone[data-poison]').forEach((zone) => {
    const idx = +zone.dataset.poison,
      sign = zone.dataset.side === 'minus' ? -1 : 1;
    wireTapHold(
      zone,
      () => adjustLifeField(idx, 'poison', sign),
      () => adjustLifeField(idx, 'poison', sign * 10),
      550,
      700,
    );
  });
  document.querySelectorAll('.dmg-overlay').forEach((ov) => {
    const from = +ov.dataset.dmgfrom;
    const focus = state.life.expandedIdx;
    if (focus === null) return;
    // Same grammar as the life total: minus zone left, plus zone right,
    // tap steps by 1, a held finger walks by 10.
    ov.querySelectorAll('.tap-zone').forEach((zone) => {
      const sign = zone.dataset.dmgside === 'minus' ? -1 : 1;
      wireTapHold(
        zone,
        () => adjustLifeField(focus, 'dmg', sign, from),
        () => adjustLifeField(focus, 'dmg', sign * 10, from),
        550,
        700,
      );
    });
  });
  document.querySelectorAll('.life-card-v2').forEach((card) => {
    card.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

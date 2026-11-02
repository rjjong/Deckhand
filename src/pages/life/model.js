// pages / life / model

/* ---------------- LIFE COUNTER (overlay) ---------------- */

function ensureLifePlayers() {
  const L = state.life;
  if (!L.players) L.players = [];
  while (L.players.length < L.count)
    L.players.push({
      name: (L._keepNames && L._keepNames[L.players.length]) || 'Player ' + (L.players.length + 1),
      life: lifeStart(L.count),
      poison: 0,
      dmg: [],
      defeated: false,
      defeatMsg: '',
      medal: false,
      monarch: false,
      initiative: false,
    });
  L.players.length = L.count;
  const _pw = 'Player ';
  L.players.forEach((p, i) => {
    if (!p.name) p.name = _pw + (i + 1);
    else if (/^(Player|Speler) \d+$/.test(p.name))
      p.name = p.name.replace(/^(Player|Speler) /, _pw);
    if (!p.dmg) p.dmg = [];
    while (p.dmg.length < L.count) p.dmg.push(0);
    p.dmg.length = L.count;
  });
  return L.players;
}

/* 1.46 DUNGEONS -- every room and where it leads. */
const LIFE_DUNGEONS = [
  {
    id: 'lmp',
    name: 'Lost Mine of Phandelver',
    rooms: {
      'Cave Entrance': ['Goblin Lair', 'Mine Tunnels'],
      'Goblin Lair': ['Storeroom', 'Dark Pool'],
      'Mine Tunnels': ['Dark Pool', 'Fungi Cavern'],
      Storeroom: ['Temple of Dumathoin'],
      'Dark Pool': ['Temple of Dumathoin'],
      'Fungi Cavern': ['Temple of Dumathoin'],
      'Temple of Dumathoin': [],
    },
    levels: [
      ['Cave Entrance'],
      ['Goblin Lair', 'Mine Tunnels'],
      ['Storeroom', 'Dark Pool', 'Fungi Cavern'],
      ['Temple of Dumathoin'],
    ],
  },
  {
    id: 'toa',
    name: 'Tomb of Annihilation',
    rooms: {
      'Trapped Entry': ['Veils of Fear', 'Oubliette'],
      'Veils of Fear': ['Sandfall Cell'],
      Oubliette: ['Cradle of the Death God'],
      'Sandfall Cell': ['Cradle of the Death God'],
      'Cradle of the Death God': [],
    },
    levels: [
      ['Trapped Entry'],
      ['Veils of Fear', 'Oubliette'],
      ['Sandfall Cell'],
      ['Cradle of the Death God'],
    ],
  },
  {
    id: 'dmm',
    name: 'Dungeon of the Mad Mage',
    rooms: {
      'Yawning Portal': ['Dungeon Level'],
      'Dungeon Level': ['Goblin Bazaar', 'Twisted Caverns'],
      'Goblin Bazaar': ['Lost Level'],
      'Twisted Caverns': ['Lost Level'],
      'Lost Level': ['Runestone Caverns', "Muiral's Graveyard"],
      'Runestone Caverns': ['Deep Mines'],
      "Muiral's Graveyard": ['Deep Mines'],
      'Deep Mines': ["Mad Wizard's Lair"],
      "Mad Wizard's Lair": [],
    },
    levels: [
      ['Yawning Portal'],
      ['Dungeon Level'],
      ['Goblin Bazaar', 'Twisted Caverns'],
      ['Lost Level'],
      ['Runestone Caverns', "Muiral's Graveyard"],
      ['Deep Mines'],
      ["Mad Wizard's Lair"],
    ],
  },
  {
    id: 'uc',
    name: 'Undercity',
    rooms: {
      'Secret Entrance': ['Forge', 'Lost Well'],
      Forge: ['Trap!', 'Arena'],
      'Lost Well': ['Arena', 'Stash'],
      'Trap!': ['Archives'],
      Arena: ['Archives', 'Catacombs'],
      Stash: ['Catacombs'],
      Archives: ['Throne of the Dead Three'],
      Catacombs: ['Throne of the Dead Three'],
      'Throne of the Dead Three': [],
    },
    levels: [
      ['Secret Entrance'],
      ['Forge', 'Lost Well'],
      ['Trap!', 'Arena', 'Stash'],
      ['Archives', 'Catacombs'],
      ['Throne of the Dead Three'],
    ],
  },
];

/* 1.47: the printed dungeon cards, and where each room sits on them (%). */
const DUNGEON_CARD = {
  lmp: {
    set: 'tafr',
    cn: '21',
    pos: {
      'Cave Entrance': [50, 19],
      'Goblin Lair': [28, 41],
      'Mine Tunnels': [72, 41],
      Storeroom: [18, 63],
      'Dark Pool': [50, 63],
      'Fungi Cavern': [82, 63],
      'Temple of Dumathoin': [50, 85],
    },
  },
  toa: {
    set: 'tafr',
    cn: '22',
    pos: {
      'Trapped Entry': [50, 19],
      'Veils of Fear': [30, 41],
      Oubliette: [72, 52],
      'Sandfall Cell': [30, 63],
      'Cradle of the Death God': [50, 85],
    },
  },
  dmm: {
    set: 'tafr',
    cn: '20',
    pos: {
      'Yawning Portal': [50, 17],
      'Dungeon Level': [50, 29],
      'Goblin Bazaar': [28, 41],
      'Twisted Caverns': [72, 41],
      'Lost Level': [50, 53],
      'Runestone Caverns': [28, 65],
      "Muiral's Graveyard": [72, 65],
      'Deep Mines': [50, 77],
      "Mad Wizard's Lair": [50, 89],
    },
  },
  uc: {
    set: 'tclb',
    cn: '20',
    image:
      'https://cards.scryfall.io/normal/front/2/c/2c65185b-6cf0-451d-985e-56aa45d9a57d.jpg?1788840929',
    pos: {
      'Secret Entrance': [50, 23],
      Forge: [28, 34],
      'Lost Well': [72, 34],
      'Trap!': [18, 51],
      Arena: [50, 51],
      Stash: [82, 51],
      Archives: [30, 68],
      Catacombs: [70, 68],
      'Throne of the Dead Three': [50, 85],
    },
  },
};

function dungeonImg(id) {
  const c = DUNGEON_CARD[id];
  return c
    ? c.image ||
        `https://api.scryfall.com/cards/${c.set}/${c.cn}?format=image&version=normal${c.back ? '&face=back' : ''}`
    : '';
}

const CROWN_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="rgba(0,0,0,0.55)" stroke-width="0.9" stroke-linejoin="round" d="M3 8.5l4.6 3.6L12 5l4.4 7.1L21 8.5l-1.8 9.5H4.8z"/><rect x="4.8" y="18.6" width="14.4" height="2.2" rx="0.8" fill="currentColor"/></svg>';

const INITIATIVE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11c-3-3 1-5 2-9 4 3 6 6 4 9" fill="currentColor"/><path d="M7 13h10l-3 5h-4zM10 18h4v4h-4z"/></svg>';

const DUNGEON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V9a8 8 0 0 1 16 0v12"/><path d="M2 21h20"/><path d="M9 21v-6a3 3 0 0 1 6 0v6"/></svg>';

function lifeSetMonarch(idx) {
  const ps = ensureLifePlayers();
  const was = !!ps[idx].monarch;
  ps.forEach((p) => {
    p.monarch = false;
  });
  if (!was) {
    ps[idx].monarch = true;
    lifeLog(`👑 ${ps[idx].name} ${'became the monarch.'}`);
  } else lifeLog(`${ps[idx].name} ${'is no longer the monarch.'}`);
  renderLifeGrid();
}

function lifeSetInitiative(idx) {
  const ps = ensureLifePlayers();
  const was = !!ps[idx].initiative;
  ps.forEach((p) => {
    p.initiative = false;
  });
  if (!was) {
    ps[idx].initiative = true;
    lifeLog(`${ps[idx].name} ${'took the initiative.'}`);
  } else {
    lifeLog(`${ps[idx].name} ${'no longer has the initiative.'}`);
  }
  renderLifeGrid();
}

function openLifeDungeon(idx) {
  const ps = ensureLifePlayers();
  let me = idx; // whose move a tap makes
  let view = ps[me].dg ? ps[me].dg.id : null; // a dungeon up close, or all four
  ps.forEach((p) => {
    if (!p.dgDone) p.dgDone = {};
  });
  document.getElementById('lifeDgSheet')?.remove();
  const m = document.createElement('div');
  m.className = 'deckpick-scrim';
  m.id = 'lifeDgSheet';
  m.style.zIndex = 9000;
  m.style.alignItems = 'flex-end';
  const dotCol = (i) => PLAYER_COLORS[i % PLAYER_COLORS.length].base;
  const venture = (D, room) => {
    const p = ps[me];
    p.dg = { id: D.id, room };
    lifeLog(`${p.name}: ${room} (${D.name})`);
    if (!(D.rooms[room] || []).length) {
      p.dgDone[D.id] = (p.dgDone[D.id] || 0) + 1;
      p.dg = null;
      lifeLog(`${p.name} ${'completed'} ${D.name}.`);
      toast(`${p.name}: ${D.name} completed!`);
    }
    paint();
    renderLifeGrid();
  };
  // one dungeon card with every player's dot on it; big = rooms can be tapped
  const cardHtml = (D, big) => {
    const C = DUNGEON_CARD[D.id];
    const p = ps[me];
    const nextOk = (room) =>
      p.dg
        ? p.dg.id === D.id && (D.rooms[p.dg.room] || []).includes(room)
        : D.levels[0][0] === room;
    const dots = {};
    ps.forEach((q, i) => {
      if (q.dg && q.dg.id === D.id) (dots[q.dg.room] = dots[q.dg.room] || []).push(i);
    });
    const done = ps
      .map((q, i) =>
        q.dgDone[D.id]
          ? `<span class="dg-donechip" style="--pc:${dotCol(i)}">${escapeHtml(q.name)} ×${q.dgDone[D.id]}</span>`
          : '',
      )
      .join('');
    return `<div class="dg-card${big ? ' big' : ''}" data-dgcard="${D.id}">
      <div class="dg-pic"><img src="${dungeonImg(D.id)}" alt="${escapeHtml(D.name)}" loading="lazy" onerror="this.closest('.dg-pic').classList.add('noimg')"><span class="dg-noimg-name">${escapeHtml(D.name)}</span>
        ${Object.keys(C.pos)
          .map((room) => {
            const [x, y] = C.pos[room],
              who = dots[room] || [];
            return `<${big ? 'button type="button"' : 'span'} class="dg-spot${big && nextOk(room) ? ' next' : ''}" data-room="${escapeHtml(room)}" style="left:${x}%;top:${y}%;" title="${escapeHtml(room)}"><span class="dg-spot-name">${escapeHtml(room)}</span>${who.map((i) => `<i class="dg-dot${i === me ? ' me' : ''}" style="--pc:${dotCol(i)}"></i>`).join('')}</${big ? 'button' : 'span'}>`;
          })
          .join('')}
      </div>
      ${!big ? `<strong class="dg-card-name">${escapeHtml(D.name)}</strong>` : ''}
      ${done ? `<div class="dg-done">${done}</div>` : ''}
    </div>`;
  };
  const paint = () => {
    const p = ps[me];
    const D = view ? LIFE_DUNGEONS.find((x) => x.id === view) : null;
    m.innerHTML = /* HTML */ `<section
      class="deckpick life-sheet dg-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Dungeons"
    >
      ${lifePopupHeadHtml(
        D ? D.name : 'Dungeons',
        D
          ? `Tap the room ${p.name} ventures into. Gold = can go next.`
          : 'Tap a dungeon. The dots show who is where.',
      )}
      <div class="life-popup-body">
        <div class="dg-players">
          ${ps.map((q, i) => `<button type="button" class="dg-pl${i === me ? ' on' : ''}" data-dgme="${i}" style="--pc:${dotCol(i)}"><i class="dg-dot" style="--pc:${dotCol(i)}"></i>${escapeHtml(q.name)}</button>`).join('')}
        </div>
        ${D ? cardHtml(D, true) : `<div class="dg-grid">${LIFE_DUNGEONS.map((X) => cardHtml(X, false)).join('')}</div>`}
      </div>
      <div class="dg-actions life-popup-footer">
        ${D ? `<button type="button" class="ghost-btn" id="dgAll">← ${'All dungeons'}</button>` : ''}${p.dg ? `<button type="button" class="ghost-btn" id="dgLeave">${'Leave'}</button>` : ''}<button
          type="button"
          class="primary-btn"
          id="dgOk"
        >
          ${'Done'}
        </button>
      </div>
    </section>`;
    m.querySelector('[data-life-close]').addEventListener('click', () =>
      brSheetClose('lifeDgSheet'),
    );
    m.querySelectorAll('[data-dgme]').forEach((b) =>
      b.addEventListener('click', () => {
        me = +b.dataset.dgme;
        paint();
      }),
    );
    m.querySelectorAll('.dg-grid [data-dgcard]').forEach((c) =>
      c.addEventListener('click', () => {
        view = c.dataset.dgcard;
        paint();
      }),
    );
    if (D)
      m.querySelectorAll('.dg-card.big .dg-spot').forEach((b) =>
        b.addEventListener('click', () => venture(D, b.dataset.room)),
      );
    m.querySelector('#dgAll')?.addEventListener('click', () => {
      view = null;
      paint();
    });
    m.querySelector('#dgLeave')?.addEventListener('click', () => {
      ps[me].dg = null;
      paint();
      renderLifeGrid();
    });
    m.querySelector('#dgOk').addEventListener('click', () => brSheetClose('lifeDgSheet'));
  };
  paint();
  m.addEventListener('click', (e) => {
    if (e.target === m) brSheetClose('lifeDgSheet');
  });
  wireAppDialogKeys(m, () => brSheetClose('lifeDgSheet'));
  brSheetOpen(m, 'lifeDgSheet', () => {});
  m.querySelector('[data-life-close]')?.focus({ preventScroll: true });
}

/* 1.46 GAME SAVES -- the table is saved as you play (the last 10 games), so
   a game survives the app closing; Settings -> Restore a game brings one back. */
const LIFE_SAVE_KEY = 'lifeSaves';

function lifeSavesAll() {
  try {
    const a = JSON.parse(localStorage.getItem(LS_PREFIX + LIFE_SAVE_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

let _lifeSaveT = null;

function lifeAutosave() {
  clearTimeout(_lifeSaveT);
  _lifeSaveT = setTimeout(() => {
    try {
      const L = state.life;
      if (!L.players || !L.players.length) return;
      if (!L.gameId) L.gameId = 'g' + uid();
      const clean = L.players.map((p) => {
        const o = {};
        Object.keys(p).forEach((k) => {
          if (k[0] !== '_') o[k] = p[k];
        });
        return o;
      });
      const rec = {
        id: L.gameId,
        t: Date.now(),
        d: {
          count: L.count,
          layout: L.layout,
          rotate: L.rotate,
          players: clean,
          history: (L.history || []).slice(0, 40),
          turnNum: L.turnNum,
          startIdx: L.startIdx,
          turnIdx: L.turnIdx,
          settings: L.settings,
        },
      };
      const all = lifeSavesAll().filter((x) => x && x.id !== rec.id);
      all.unshift(rec);
      localStorage.setItem(LS_PREFIX + LIFE_SAVE_KEY, JSON.stringify(all.slice(0, 10)));
    } catch (e) {}
  }, 1200);
}

function openLifeRestore() {
  const all = lifeSavesAll();
  document.getElementById('lifeRestoreSheet')?.remove();
  const m = document.createElement('div');
  m.className = 'deckpick-scrim';
  m.id = 'lifeRestoreSheet';
  m.style.zIndex = 9000;
  m.style.alignItems = 'flex-end';
  const when = (t) => {
    try {
      return new Date(t).toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return '';
    }
  };
  let pick = null;
  m.innerHTML = /* HTML */ `<section
    class="deckpick life-sheet"
    role="dialog"
    aria-modal="true"
    aria-label="${'Saved games'}"
  >
    ${lifePopupHeadHtml('Saved games', 'Choose one of your last ten games to resume.')}
    <div class="hub-actions life-popup-body">
      ${
        all.length
          ? all
              .map(
                (g, i) =>
                  `<button type="button" class="hub-card${g.id === state.life.gameId ? ' cur' : ''}" data-lr="${i}"><span class="hub-icon" aria-hidden="true">${ICONS.restore}</span><span class="hub-copy"><strong>${escapeHtml(when(g.t))}${g.id === state.life.gameId ? ' \u00b7 this game' : ''}</strong><small>${(g.d.players || []).map((p) => `${escapeHtml(p.name)} ${p.life}${p.monarch ? ' 👑' : ''}`).join(' \u00b7 ')}</small></span><span class="hub-arrow" aria-hidden="true">›</span></button>`,
              )
              .join('')
          : `<p class="hub-footnote">${'No saved games yet.'}</p>`
      }
    </div>
  </section>`;
  m.querySelector('[data-life-close]').addEventListener('click', () =>
    brSheetClose('lifeRestoreSheet'),
  );
  m.querySelectorAll('[data-lr]').forEach((b) =>
    b.addEventListener('click', () => {
      pick = all[+b.dataset.lr];
      brSheetClose('lifeRestoreSheet');
    }),
  );
  m.addEventListener('click', (e) => {
    if (e.target === m) brSheetClose('lifeRestoreSheet');
  });
  wireAppDialogKeys(m, () => brSheetClose('lifeRestoreSheet'));
  brSheetOpen(m, 'lifeRestoreSheet', () => {
    if (!pick) return;
    const g = pick;
    pick = null;
    setTimeout(() => {
      const L = state.life,
        D = g.d || {};
      ['count', 'layout', 'rotate', 'turnNum', 'startIdx', 'turnIdx'].forEach((k) => {
        if (D[k] !== undefined) L[k] = D[k];
      });
      if (D.settings) L.settings = Object.assign({}, L.settings, D.settings);
      L.players = (D.players || []).map((p) => Object.assign({}, p));
      L.history = (D.history || []).slice();
      L.gameId = g.id;
      L.setupDone = true;
      L.expandedIdx = null;
      const top = state.overlayStack[state.overlayStack.length - 1];
      if (top && ['lifeSet', 'lifeTools'].includes(top.id)) closeTopOverlay();
      L.settingsOpen = false;
      L.toolsOpen = false;
      if (!state.lifeOpen) openLifeOverlay();
      else renderLifeOverlay();
      toast('Game restored.');
    }, 0);
  });
  m.querySelector('[data-life-close]')?.focus({ preventScroll: true });
}

/* 1.46: the judge as a popup over the table */
function openJudgePopup() {
  openCROverlay();
  const el = document.getElementById('crOverlay');
  if (!el) return;
  el.classList.add('cr-popup');
  el.querySelector(':scope > .ov-nav, :scope > .brand-banner')?.remove();
  const sc = document.createElement('div');
  sc.id = 'crScrim';
  el.parentNode.insertBefore(sc, el);
  // the scrim closes the judge's layers one by one (question, rules, judge)
  const shut = (n) => {
    const top = state.overlayStack[state.overlayStack.length - 1];
    if (!el.isConnected || n > 4) return;
    if (top && /^cr/.test(top.id)) {
      closeTopOverlay();
      setTimeout(() => shut(n + 1), 60);
    } else el.remove();
  };
  sc.addEventListener('click', () => shut(0));
  const mo = new MutationObserver(() => {
    if (!el.isConnected) {
      sc.remove();
      mo.disconnect();
    }
  });
  mo.observe(document.body, { childList: true });
}

/* 1.48: while the running +N / -N is on screen, more taps on the same
   counter update ONE history line instead of adding a line per tap. */
function lifeLogLive(p, key, msg) {
  const h = state.life.history;
  const live = p._hl && p._hl[key];
  if (live && Date.now() - live.t < 2500) {
    const i = h.indexOf(live.s);
    if (i >= 0) {
      if (msg === null) {
        h.splice(i, 1);
        delete p._hl[key];
        return;
      }
      h[i] = msg;
      live.s = msg;
      live.t = Date.now();
      return;
    }
  }
  if (msg === null) return;
  lifeLog(msg);
  (p._hl = p._hl || {})[key] = { s: msg, t: Date.now() };
}

function lifeRunStart(p, key, before) {
  const live = p._hl && p._hl[key];
  const fresh = !(live && Date.now() - live.t < 2500 && state.life.history.indexOf(live.s) >= 0);
  p._hlFrom = p._hlFrom || {};
  if (fresh) p._hlFrom[key] = before;
  return p._hlFrom[key];
}

const _sgn = (n) => (n > 0 ? '+' + n : '\u2212' + Math.abs(n));

function lifeLog(msg) {
  state.life.history.unshift(msg);
  if (state.life.history.length > 40) state.life.history.length = 40;
}

function checkDefeat(p) {
  const L = state.life;
  if (!L.settings.autoKill || p.defeated) return;
  let cause = null;
  if (p.life <= 0) cause = 'life';
  else if (L.settings.poison && p.poison >= 10) cause = 'poison';
  else if (L.settings.admiralDamage && lethalDmg() > 0 && p.dmg.some((d) => d >= lethalDmg()))
    cause = 'admiral';
  if (cause) {
    p.defeated = true;
    p.defeatMsg = L.settings.salty
      ? SALTY_MESSAGES[Math.floor(Math.random() * SALTY_MESSAGES.length)]
      : 'Defeated.';
    lifeLog(
      `⚔ ${p.name} was defeated (${cause === 'life' ? '0 life' : cause === 'poison' ? '10 poison' : lethalDmg() + ' ' + lifeLeaderWord() + ' damage'}).`,
    );
  }
}

/* Table layouts for the life counter, phone flat in the middle. Per seat:
   0 = this edge (you), 180 = across, 90 = left edge, 270 = right edge —
   the same convention seatRotation always used. areas are CSS grid rows;
   seat i takes the letter 'abcdef'[i]. */
const LIFE_LAYOUTS = [
  { id: '2f', count: 2, areas: ['a', 'b'], rot: [180, 0] },
  { id: '3t', count: 3, areas: ['a b', 'c c'], rot: [90, 270, 0] },
  { id: '4q', count: 4, areas: ['a b', 'c d'], rot: [90, 270, 90, 270] },
  { id: '4m', count: 4, areas: ['a a', 'b c', 'd d'], rot: [180, 90, 270, 0] },
  { id: '5q', count: 5, areas: ['a b', 'c d', 'e e'], rot: [90, 270, 90, 270, 0] },
  { id: '6q', count: 6, areas: ['a b', 'c d', 'e f'], rot: [90, 270, 90, 270, 90, 270] },
  { id: '6e', count: 6, areas: ['a b', 'c d', 'e f'], rot: [180, 180, 90, 270, 0, 0] },
  { id: '6m', count: 6, areas: ['a a', 'b c', 'd e', 'f f'], rot: [180, 90, 270, 90, 270, 0] },
  { id: '7q', count: 7, areas: ['a b', 'c d', 'e f', 'g g'], rot: [90, 270, 90, 270, 90, 270, 0] },
  {
    id: '7m',
    count: 7,
    areas: ['a a', 'b c', 'd e', 'f g'],
    rot: [180, 90, 270, 90, 270, 90, 270],
  },
  {
    id: '8q',
    count: 8,
    areas: ['a b', 'c d', 'e f', 'g h'],
    rot: [90, 270, 90, 270, 90, 270, 90, 270],
  },
  {
    id: '8e',
    count: 8,
    areas: ['a b', 'c d', 'e f', 'g h'],
    rot: [180, 180, 90, 270, 90, 270, 0, 0],
  },
];

function lifeLayout() {
  const L = LIFE_LAYOUTS.find((x) => x.id === state.life.layout);
  if (L && L.count === state.life.count) return L;
  return (
    LIFE_LAYOUTS.find((x) => x.count === state.life.count) ||
    LIFE_LAYOUTS.find((x) => x.id === '4q')
  );
}

function seatRotation(i, count) {
  // With the phone lying flat in the middle of the table: two players facing
  // across get 180/0 (classic 2-up layout). For 3+ players in the 2-column
  // grid, every card in the left column reads sideways one way and every
  // card in the right column reads sideways the other way, regardless of
  // row — this matches how the app is actually held between players.
  if (count === 2) return i === 0 ? 180 : 0;
  return i % 2 === 0 ? 90 : 270;
}

function adjustLifeField(idx, field, d, from) {
  const players = ensureLifePlayers();
  const p = players[idx];
  if (field === 'life') {
    p.life += d;
    if (p.defeated && p.life > 0) {
    }
    // Running −X / +X beside the total: rapid taps accumulate into one
    // number, which fades out a moment after the tapping stops.
    p._delta = (p._delta || 0) + d;
    p._deltaFresh = true; // only THIS player's counter re-pops; re-renders from other taps keep it steady
    if (p._delta === 0) {
      delete p._delta;
      delete p._deltaFresh;
    }
    clearTimeout(p._deltaT);
    p._deltaT = setTimeout(() => {
      delete p._delta;
      renderLifeGrid();
    }, 2500);
    {
      const from = lifeRunStart(p, 'life', p.life - d),
        sum = p.life - from;
      lifeLogLive(p, 'life', sum ? `${p.name}: life ${_sgn(sum)} → ${p.life}` : null);
    }
  } else if (field === 'poison') {
    const before = p.poison;
    p.poison = Math.max(0, p.poison + d);
    const ap = p.poison - before;
    if (ap) {
      // The same running −N / +N the life total shows, beside the poison count.
      p._pzDelta = (p._pzDelta || 0) + ap;
      p._pzFresh = true;
      if (p._pzDelta === 0) {
        delete p._pzDelta;
        delete p._pzFresh;
      }
      clearTimeout(p._pzT);
      p._pzT = setTimeout(() => {
        delete p._pzDelta;
        renderLifeGrid();
      }, 2500);
    }
    {
      const from = lifeRunStart(p, 'poison', p.poison - ap),
        sum = p.poison - from;
      lifeLogLive(p, 'poison', sum ? `${p.name}: poison ${_sgn(sum)} → ${p.poison}` : null);
    }
  } else if (field === 'dmg') {
    // Commander damage IS damage: the tally and the life total move together.
    // Clamp-aware so correcting a mistake with − gives the life back exactly.
    const before = p.dmg[from];
    p.dmg[from] = Math.max(0, p.dmg[from] + d);
    const applied = p.dmg[from] - before;
    if (applied !== 0) {
      p.life -= applied;
      p._delta = (p._delta || 0) - applied;
      if (p._delta === 0) delete p._delta;
      clearTimeout(p._deltaT);
      p._deltaT = setTimeout(() => {
        delete p._delta;
        renderLifeGrid();
      }, 2500);
      // … and beside the damage tally on the attacker's card.
      p._dmgDelta = p._dmgDelta || {};
      p._dmgFresh = p._dmgFresh || {};
      p._dmgT = p._dmgT || {};
      p._dmgDelta[from] = (p._dmgDelta[from] || 0) + applied;
      p._dmgFresh[from] = true;
      if (p._dmgDelta[from] === 0) delete p._dmgDelta[from];
      clearTimeout(p._dmgT[from]);
      p._dmgT[from] = setTimeout(() => {
        if (p._dmgDelta) delete p._dmgDelta[from];
        renderLifeGrid();
      }, 2500);
    }
    {
      const k = 'dmg' + from,
        st = lifeRunStart(p, k, p.dmg[from] - applied),
        sum = p.dmg[from] - st;
      lifeLogLive(
        p,
        k,
        sum
          ? `${p.name}: cmdr dmg from ${players[from].name} ${_sgn(sum)} → ${p.dmg[from]} · life → ${p.life}`
          : null,
      );
    }
  }
  checkDefeat(p);
  renderLifeGrid();
}

async function animatedHighRoll(mode) {
  mode = mode || 'first';
  const players = ensureLifePlayers();
  const n = players.length;
  if (state.life.spinning) return;
  state.life.spinning = true;
  const winner = Math.floor(Math.random() * n);
  const extraLoops = 2 + Math.floor(Math.random() * 2); // 2-3 full loops before landing
  const totalSteps = n * extraLoops + winner + 1;
  let delay = 70;
  for (let step = 0; step < totalSteps; step++) {
    setSpinHighlight(step % n);
    await new Promise((r) => setTimeout(r, delay));
    const remaining = totalSteps - step;
    if (remaining <= n)
      delay = Math.min(480, delay * 1.35); // decelerate hard on the final loop
    else delay = Math.min(140, delay * 1.06);
  }
  setSpinHighlight(null);
  if (mode === 'high') {
    lifeLog(`High roll — ${players[winner].name} rolls highest!`);
    showDiceResult(
      inlIco('dice', 16) + 'High Roll',
      escapeHtml(players[winner].name),
      'rolls highest!',
      true,
    );
  } else {
    players.forEach((p, i) => {
      p.medal = i === winner;
    });
    state.life.turnIdx = winner;
    state.life.startIdx = winner;
    state.life.turnNum = 1;
    lifeLog(`Spin the wheel — ${players[winner].name} goes first!`);
    toast(`${players[winner].name} goes first!`);
  }
  state.life.spinning = false;
  renderLifeGrid();
}

/* Seats in *visually clockwise* order around the 2-column table grid:
   top row left→right, then down the right column, then the bottom row
   right→left, then up the left column. */
function clockwiseOrder(count) {
  switch (count) {
    case 2:
      return [0, 1];
    case 3:
      return [0, 1, 2];
    case 4:
      return [0, 1, 3, 2];
    case 5:
      return [0, 1, 3, 4, 2];
    case 6:
      return [0, 1, 3, 5, 4, 2];
    default:
      return Array.from({ length: count }, (_, i) => i);
  }
}

function setSpinHighlight(idx) {
  document.querySelectorAll('.life-card-v2').forEach((card) => {
    card.classList.toggle('spin-active', idx !== null && +card.dataset.idx === idx);
  });
}

/* Result popup: same panel dress as History/Settings, dead centre, closes
   itself after a beat -- or on a tap. */
function showDiceResult(title, big, sub, small) {
  document.getElementById('diceResultPop')?.remove();
  const el = document.createElement('div');
  el.id = 'diceResultPop';
  el.className = 'life-panel';
  el.innerHTML = `<h4>${title}</h4><div class="dice-result${small ? ' small' : ''}">${big}</div>${sub ? `<div class="dice-result-sub">${sub}</div>` : ''}`;
  document.body.appendChild(el);
  const kill = () => {
    clearTimeout(t);
    el.remove();
  };
  const t = setTimeout(kill, 2200);
  el.addEventListener('click', kill);
}

function rollDie(sides) {
  const r = 1 + Math.floor(Math.random() * sides);
  lifeLog(`Rolled a d${sides}: ${r}`);
  showDiceResult(inlIco('dice', 16) + `D${sides}`, r);
}

function flipCoin() {
  const heads = Math.random() < 0.5;
  const face = heads ? 'Heads' : 'Tails';
  lifeLog(`Coin flip: ${face}`);
  showDiceResult(inlIco('coin', 16) + `Coin`, face, '', true);
}

function restartLife() {
  openInAppConfirm(
    trS('Reset all life totals, poison, Commander damage, and medals?'),
    (ok) => {
      if (!ok) return;
      doRestartLife();
    },
    {
      danger: true,
      title: 'Restart game',
      ok: 'Restart game',
      icon: 'close',
    },
  );
}

function doRestartLife() {
  // Leave any table submenus before opening the new setup page. Their old
  // history entries become inert, as with navigation between app pages.
  const stack = state.overlayStack;
  while (
    stack.length &&
    ['lifeDamage', 'lifeHist', 'lifeSet', 'lifeDice', 'lifeTools'].includes(
      stack[stack.length - 1].id,
    )
  )
    stack.pop().closeFn();
  state.life.menuOpen = false;
  state.life.historyOpen = false;
  state.life.settingsOpen = false;
  state.life.toolsOpen = false;
  state.life.diceOpen = false;
  // The table keeps its names between games — only the numbers reset.
  state.life._keepNames = (state.life.players || []).map((p) => p.name);
  state.life.players = null;
  state.life.history = [];
  state.life.gameId = 'g' + uid(); // A distinct save slot across devices.
  state.life.setupDone = false;
  state.life.expandedIdx = null;
  state.life.turnIdx = null;
  state.life.startIdx = null;
  state.life.turnNum = 1;
  ensureLifePlayers();
  lifeLog('↺ Game restarted.');
  renderLifeOverlay();
  openModal('lifeSetup');
}

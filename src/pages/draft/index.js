// pages / draft / index

const DRAFT_KEY = LS_PREFIX + 'draft';

const DRAFT_NAMES_KEY = LS_PREFIX + 'draftNames';

// Seconds per pick by cards left in the pack (MTR Appendix B); the last card
// is simply taken.
const DRAFT_PICK_SECS = {
  15: 40,
  14: 40,
  13: 35,
  12: 30,
  11: 25,
  10: 25,
  9: 20,
  8: 20,
  7: 15,
  6: 10,
  5: 10,
  4: 5,
  3: 5,
  2: 5,
  1: 0,
};

function draftPickSecs(cardsLeft) {
  return DRAFT_PICK_SECS[cardsLeft] != null ? DRAFT_PICK_SECS[cardsLeft] : cardsLeft > 15 ? 40 : 0;
}

// Review after pack 1 is 60 s, each later review 30 s longer.
function draftReviewSecs(packDone) {
  return 60 + 30 * (packDone - 1);
}

function draftNew(keep) {
  const k = keep || {};
  return {
    v: 1,
    phase: 'setup',
    players: k.players || [],
    seats: [],
    packSize: k.packSize || 14,
    packs: 3,
    bo: k.bo || 3,
    rounds: k.rounds || 3,
    roundsAuto: k.roundsAuto !== false,
    roundMin: k.roundMin || 50,
    buildMin: k.buildMin || 30,
    pickTimer: k.pickTimer !== false,
    pick: null,
    build: null,
    rs: [],
    landCounts: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    landTotal: 17,
    createdAt: Date.now(),
  };
}

function draftLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.v === 1 && Array.isArray(d.players)) return d;
  } catch (e) {}
  return draftNew();
}

function draftSave() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.draft));
  } catch (e) {}
}

function draftRecentNames() {
  try {
    const a = JSON.parse(localStorage.getItem(DRAFT_NAMES_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

function draftRememberNames(names) {
  const seen = new Set(),
    out = [];
  names.concat(draftRecentNames()).forEach((n) => {
    const k = String(n).trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(String(n).trim());
    }
  });
  try {
    localStorage.setItem(DRAFT_NAMES_KEY, JSON.stringify(out.slice(0, 30)));
  } catch (e) {}
}

// 8 players play 3 rounds, 4 play 2, 16 play 4 -- enough to find one unbeaten.
function draftAutoRounds(n) {
  return n <= 2 ? 1 : Math.min(6, Math.ceil(Math.log2(n)));
}

function draftShuffle(a, rnd) {
  rnd = rnd || Math.random;
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = b[i];
    b[i] = b[j];
    b[j] = t;
  }
  return b;
}

// Packs 1 and 3 pass left (clockwise round the table), pack 2 passes right.
function draftPassLeft(pack) {
  return pack % 2 === 1;
}

/* Round 1 goes straight across the table: in a pod of 8, seat 1 plays seat
   5, 2 plays 6, 3 plays 7, 4 plays 8 -- you never face the player you fed.
   An odd pod gives the last seat the bye (seats are random already). */
function draftCrossPairs(seats) {
  const s = seats.slice();
  let bye = null;
  if (s.length % 2) bye = s.pop();
  const h = s.length / 2,
    out = [];
  for (let i = 0; i < h; i++) out.push({ a: s[i], b: s[i + h], res: null });
  if (bye != null) out.push({ a: bye, b: null, res: { aw: 2, bw: 0, d: 0 } });
  return out;
}

/* Standings, MTR Appendix C: 3 points a match win, 1 a draw; ties broken by
   opponents' match-win %, then game-win %, then opponents' game-win %. Every
   percentage counts for at least 33%. A bye is a 2-0 win, but never an
   opponent. */
function draftStandings(d) {
  const P = {};
  d.players.forEach((p) => {
    P[p.id] = {
      id: p.id,
      name: p.name,
      dropped: !!p.dropped,
      mp: 0,
      m: 0,
      w: 0,
      l: 0,
      dr: 0,
      gp: 0,
      g: 0,
      opp: [],
    };
  });
  (d.rs || []).forEach((r) =>
    r.matches.forEach((mt) => {
      if (!mt.res) return;
      const aw = mt.res.aw || 0,
        bw = mt.res.bw || 0,
        dg = mt.res.d || 0;
      const add = (id, mine, theirs, oppId) => {
        const x = P[id];
        if (!x) return;
        x.m++;
        x.g += mine + theirs + dg;
        x.gp += 3 * mine + dg;
        if (mine > theirs) {
          x.w++;
          x.mp += 3;
        } else if (mine < theirs) x.l++;
        else {
          x.dr++;
          x.mp += 1;
        }
        if (oppId != null) x.opp.push(oppId);
      };
      add(mt.a, aw, bw, mt.b);
      if (mt.b != null) add(mt.b, bw, aw, mt.a);
    }),
  );
  const fl = (v) => Math.max(0.33, v);
  const mwp = (x) => (x.m ? fl(x.mp / (3 * x.m)) : 0.33);
  const gwp = (x) => (x.g ? fl(x.gp / (3 * x.g)) : 0.33);
  const list = Object.keys(P).map((k) => {
    const x = P[k];
    const ops = x.opp.map((o) => P[o]).filter(Boolean);
    x.mwp = mwp(x);
    x.gwp = gwp(x);
    x.omw = ops.length ? ops.reduce((a, o) => a + mwp(o), 0) / ops.length : 0;
    x.ogw = ops.length ? ops.reduce((a, o) => a + gwp(o), 0) / ops.length : 0;
    return x;
  });
  const order = {};
  d.players.forEach((p, i) => {
    order[p.id] = i;
  });
  list.sort(
    (a, b) =>
      b.mp - a.mp || b.omw - a.omw || b.gwp - a.gwp || b.ogw - a.ogw || order[a.id] - order[b.id],
  );
  return list;
}

/* Swiss: pair down the standings, never a rematch while any other pairing
   exists. An odd count gives the bye to the lowest-ranked player who has not
   had one yet. Dropped players are left out. */
function draftSwissPairs(d) {
  const st = draftStandings(d).filter((x) => !x.dropped);
  const opp = {};
  st.forEach((x) => {
    opp[x.id] = new Set(x.opp);
  });
  const byes = new Set();
  (d.rs || []).forEach((r) =>
    r.matches.forEach((m) => {
      if (m.b == null) byes.add(m.a);
    }),
  );
  let ids = st.map((x) => x.id),
    bye = null;
  if (ids.length % 2) {
    for (let i = ids.length - 1; i >= 0; i--) {
      if (!byes.has(ids[i])) {
        bye = ids[i];
        break;
      }
    }
    if (bye == null) bye = ids[ids.length - 1];
    ids = ids.filter((x) => x !== bye);
  }
  let budget = 50000;
  const solve = (rest, strict) => {
    if (!rest.length) return [];
    if (--budget < 0) return null;
    const a = rest[0];
    for (let j = 1; j < rest.length; j++) {
      const b = rest[j];
      if (strict && opp[a] && opp[a].has(b)) continue;
      const sub = solve(rest.slice(1, j).concat(rest.slice(j + 1)), strict);
      if (sub) return [{ a, b, res: null }].concat(sub);
    }
    return null;
  };
  let pairs = solve(ids, true);
  if (!pairs) {
    budget = 50000;
    pairs = solve(ids, false) || [];
  }
  if (bye != null) pairs.push({ a: bye, b: null, res: { aw: 2, bw: 0, d: 0 } });
  return pairs;
}

/* The pick clock's next step when a countdown runs out: one card fewer per
   pack; the last card is simply taken; a review follows packs 1 and 2. */
function draftPickStep(p, packSize, packs) {
  if (p.mode === 'pick') {
    const left = p.left - 1;
    if (left > 1) return { pack: p.pack, left, mode: 'pick' };
    return p.pack < packs
      ? { pack: p.pack, left: 0, mode: 'review' }
      : { pack: p.pack, left: 0, mode: 'done' };
  }
  if (p.mode === 'review') return { pack: p.pack + 1, left: packSize, mode: 'wait' };
  return { pack: p.pack, left: p.left, mode: p.mode };
}

function draftStepSecs(p) {
  return p.mode === 'pick'
    ? draftPickSecs(p.left)
    : p.mode === 'review'
      ? draftReviewSecs(p.pack)
      : 0;
}

// Basic lands split over the colours by how many spells each colour has
// (largest remainder, so the total is always exact).
function draftLandSplit(counts, total) {
  const cols = Object.keys(counts).filter((c) => counts[c] > 0);
  const sum = cols.reduce((a, c) => a + counts[c], 0);
  const out = {};
  if (!sum || !total) return out;
  const raw = cols.map((c) => ({ c, v: (total * counts[c]) / sum }));
  let used = 0;
  raw.forEach((r) => {
    out[r.c] = Math.floor(r.v);
    used += out[r.c];
  });
  raw.sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || counts[b.c] - counts[a.c]);
  for (let i = 0; used < total; i = (i + 1) % raw.length) {
    out[raw[i].c]++;
    used++;
  }
  return out;
}

const DRAFT_BASICS = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

// ---- countdown timers: {total, endsAt, pausedLeft} -- idle, running, or paused
function drTLeft(t, now) {
  if (!t) return 0;
  if (t.pausedLeft != null) return t.pausedLeft;
  if (t.endsAt) return Math.max(0, t.endsAt - (now || Date.now()));
  return t.total || 0;
}

function drTStart(t) {
  const left = drTLeft(t);
  t.endsAt = Date.now() + left;
  t.pausedLeft = null;
  t.over = false;
}

function drTPause(t) {
  if (t.endsAt) {
    t.pausedLeft = Math.max(0, t.endsAt - Date.now());
    t.endsAt = null;
  }
}

function draftClockFmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60),
    r = s % 60;
  return m ? m + ':' + String(r).padStart(2, '0') : String(r);
}

let _drAudio = null;

function draftAudioArm() {
  // The first tap on a Start button unlocks sound for the rest of the draft.
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !_drAudio) _drAudio = new AC();
    if (_drAudio && _drAudio.state === 'suspended') _drAudio.resume();
  } catch (e) {}
}

function draftBeep(long) {
  try {
    navigator.vibrate && navigator.vibrate(long ? [220, 120, 220] : 140);
  } catch (e) {}
  try {
    if (!_drAudio) return;
    const o = _drAudio.createOscillator(),
      g = _drAudio.createGain();
    o.frequency.value = long ? 660 : 880;
    g.gain.value = 0.18;
    o.connect(g);
    g.connect(_drAudio.destination);
    o.start();
    o.stop(_drAudio.currentTime + (long ? 0.6 : 0.16));
  } catch (e) {}
}

let _draftT = null;

function draftTick() {
  if (state.screen !== 'draft') {
    clearInterval(_draftT);
    _draftT = null;
    try {
      if (!state.lifeOpen) releaseWakeLock();
    } catch (e) {}
    return;
  }
  const d = state.draft;
  if (!d) return;
  const now = Date.now();
  let structural = false,
    beep = 0;
  const p = d.pick;
  if (d.phase === 'drafting' && p && p.endsAt && now >= p.endsAt) {
    // Catch up on every step that ran out (the phone may have slept).
    let guard = 0;
    while (p.endsAt && now >= p.endsAt && guard++ < 200) {
      const prevEnd = p.endsAt;
      Object.assign(p, draftPickStep(p, d.packSize, d.packs));
      const secs = draftStepSecs(p);
      if ((p.mode === 'pick' || p.mode === 'review') && secs > 0) {
        p.total = secs * 1000;
        p.endsAt = prevEnd + p.total;
      } else {
        p.endsAt = null;
        p.pausedLeft = null;
        p.total = 0;
      }
    }
    structural = true;
    beep = p.mode === 'pick' ? 1 : 2;
  }
  const end = (t) => {
    if (t && t.endsAt && now >= t.endsAt) {
      t.endsAt = null;
      t.pausedLeft = 0;
      t.over = true;
      structural = true;
      beep = 2;
    }
  };
  if (d.phase === 'building') end(d.build);
  if (d.phase === 'rounds') end((d.rs[d.rs.length - 1] || {}).t);
  if (structural) {
    draftSave();
    draftBeep(beep === 2);
    render();
    return;
  }
  draftPaintClock();
}

function draftActiveTimer(d) {
  if (d.phase === 'drafting' && d.pick && (d.pick.mode === 'pick' || d.pick.mode === 'review'))
    return d.pick;
  if (d.phase === 'building') return d.build;
  if (d.phase === 'rounds') return (d.rs[d.rs.length - 1] || {}).t;
  return null;
}

function draftPaintClock() {
  const d = state.draft;
  if (!d) return;
  const t = draftActiveTimer(d);
  const el = document.getElementById('drClock');
  if (!el || !t) return;
  const left = drTLeft(t);
  el.textContent = draftClockFmt(left);
  el.classList.toggle('low', left > 0 && left <= (d.phase === 'drafting' ? 5000 : 300000));
  const bar = document.getElementById('drBar');
  if (bar)
    bar.style.width = (t.total ? Math.max(0, Math.min(100, (100 * left) / t.total)) : 0) + '%';
}

function draftName(d, id) {
  const p = d.players.find((x) => x.id === id);
  return p ? p.name : '?';
}

function draftPassHtml(pack) {
  const left = draftPassLeft(pack);
  return `<span class="dr-dir">${left ? '↻' : '↺'}</span> ${left ? 'pass left' : 'pass right'}`;
}

/* Draft tools share the menu's layout and read from setup to the next action. */
function draftPageHtml() {
  const d = state.draft || (state.draft = draftLoad());
  const intros = {
    setup: [
      'Gather your pod.',
      'Add your players, choose your draft settings, and find everyone a seat.',
    ],
    seating: ['Find your seat.', 'Settle around the table and get ready to pass the packs.'],
    drafting: ['Make your picks.', 'Follow the pack direction and keep the table moving together.'],
    building: [
      'Build your deck.',
      'Turn your picks into a deck, set your lands, and get ready to play.',
    ],
    rounds: ['Play the round.', 'Check your pairing, track the time, and record each result.'],
    final: ['See the results.', 'Your final standings and every round, together in one place.'],
  };
  const intro = intros[d.phase] || intros.setup;
  return /* HTML */ `<main class="hub-page tools-page draft-main">
    <section class="hub-intro">
      <span class="hub-eyebrow">DRAFT TOOLS</span>
      <h1>${intro[0]}</h1>
      <p>${intro[1]}</p>
    </section>
    ${draftTopHtml(d)}
    <section class="hub-actions tool-sections" aria-label="${'Draft tools'}">
      ${draftPhaseHtml(d)} ${draftFootHtml(d)} ${draftStandingsHtml(d)} ${draftHistoryHtml(d)}
    </section>
  </main>`;
}

function draftTopHtml(d) {
  const steps = [
    ['setup', 'Players'],
    ['seating', 'Seats'],
    ['drafting', 'Draft'],
    ['building', 'Build'],
    ['rounds', 'Rounds'],
    ['final', 'Final'],
  ];
  const at = steps.findIndex((s) => s[0] === d.phase);
  return /* HTML */ `<div class="dr-top">
    <nav class="dr-steps" aria-label="${'Draft progress'}">
      ${steps
        .map((s, i) => {
          const available =
            s[0] === d.phase ||
            (['setup', 'seating'].includes(d.phase) &&
              (s[0] === 'setup' || (s[0] === 'seating' && d.players.length >= 2)));
          return /* HTML */ `<button
            type="button"
            data-dr="step"
            data-phase="${s[0]}"
            class="${i === at ? 'on' : i < at ? 'done' : ''}"
            ${i === at ? ' aria-current="step"' : ''}${available ? '' : ' disabled'}
          >
            ${s[1]}
          </button>`;
        })
        .join('')}
    </nav>
  </div>`;
}

function draftFootHtml(d) {
  const btn = (act, label, o) =>
    `<button type="button" class="${o && o.ghost ? 'ghost-btn' : 'hub-card hub-primary'}" data-dr="${act}"${o && o.off ? ' disabled' : ''}>${o && o.ghost ? label : `<span class="hub-icon" aria-hidden="true">${ICONS.draft}</span><span class="hub-copy"><strong>${label}</strong></span><span class="hub-arrow" aria-hidden="true">›</span>`}</button>`;
  let html = '';
  if (d.phase === 'setup')
    html = btn('seat', 'Seat the players' + ' →', {
      off: d.players.length < 2,
    });
  else if (d.phase === 'seating') html = btn('draft-start', 'To the draft' + ' →');
  else if (d.phase === 'drafting') {
    const p = d.pick || {};
    if (p.mode === 'wait') html = btn('pack-start', 'Start pack ' + p.pack);
    else if (p.mode === 'manual') html = btn('pack-done', 'Pack ' + p.pack + ' done');
    else if (p.mode === 'done') html = btn('build-start', 'To deckbuilding' + ' →');
    else
      html =
        btn('pick-skip', 'Next' + ' ⏭', { ghost: true }) +
        (p.endsAt ? btn('pick-pause', '⏸ ' + 'Pause') : btn('pick-resume', '▶ ' + 'Resume'));
  } else if (d.phase === 'building') html = btn('round1', 'Pair round 1' + ' →');
  else if (d.phase === 'rounds') {
    const r = d.rs[d.rs.length - 1];
    const all = r && r.matches.every((m) => m.res);
    html =
      r && r.n >= d.rounds
        ? btn('final', 'Final standings' + ' →', { off: !all })
        : btn('next-round', 'Pair round ' + ((r ? r.n : 0) + 1) + '' + ' →', { off: !all });
  }
  return html ? `<div class="dr-foot">${html}</div>` : '';
}

function draftClockHtml(t, label) {
  return `<div class="dr-clock" id="drClock">${draftClockFmt(drTLeft(t))}</div>
    <div class="dr-bar"><i id="drBar"></i></div>
    ${label ? `<div class="dr-sub">${label}</div>` : ''}`;
}

function draftStepHtml(act, val) {
  return /* HTML */ `<div class="dr-step">
    <button type="button" data-dr="${act}-" aria-label="-">−</button><span>${val}</span
    ><button type="button" data-dr="${act}+" aria-label="+">+</button>
  </div>`;
}

function draftPhaseHtml(d) {
  const nm = (id) => escapeHtml(draftName(d, id));
  if (d.phase === 'setup') {
    const taken = new Set(d.players.map((p) => p.name.toLowerCase()));
    const recent = draftRecentNames()
      .filter((n) => !taken.has(n.toLowerCase()))
      .slice(0, 12);
    const seg = (cur, opts) =>
      `<div class="seg seg-inline dr-seg">${opts.map(([v, l, act]) => `<button type="button" class="${cur === v ? 'active' : ''}" data-dr="${act}">${l}</button>`).join('')}</div>`;
    return /* HTML */ `<div class="panel-card">
        ${toolPanelHeadingHtml(ICONS.draft, 'Players' + ' (' + d.players.length + ')', 'Everyone at the table')}
        ${
          d.players.length
            ? `<div class="dr-chips">${d.players.map((p) => `<span class="dr-chip">${escapeHtml(p.name)}<button type="button" data-dr="del" data-id="${p.id}" aria-label="${'Remove'}">✕</button></span>`).join('')}</div>`
            : `<p class="hint">${'Add everyone at the table. Two players is enough; a pod of 8 is classic.'}</p>`
        }
        ${recent.length ? `<div class="dr-recent-h">${'Played before'}</div><div class="dr-chips">${recent.map((n) => `<button type="button" class="dr-chip recent" data-dr="recent" data-name="${escapeHtml(n)}">+ ${escapeHtml(n)}</button>`).join('')}</div>` : ''}
        <div class="dr-add">
          <input
            id="drName"
            type="text"
            enterkeyhint="done"
            autocomplete="off"
            autocapitalize="words"
            placeholder="${'Player name'}"
            maxlength="24"
          /><button type="button" class="primary-btn" data-dr="add">+ ${'Add'}</button>
        </div>
      </div>
      <div class="panel-card">
        ${toolPanelHeadingHtml(ICONS.settings, 'Settings', 'Set up your draft')}
        <div class="dr-set">
          <div>
            <div class="l1">${'Pack size'}</div>
            <div class="l2">${'Play Booster 14 · Draft Booster 15'}</div>
          </div>
          ${seg(d.packSize, [
            [14, '14', 'pack14'],
            [15, '15', 'pack15'],
          ])}
        </div>
        <div class="dr-set">
          <div>
            <div class="l1">${'Pick timer'}</div>
            <div class="l2">${'Tournament timing per pick'}</div>
          </div>
          ${seg(d.pickTimer ? 1 : 0, [
            [1, 'On', 'ptimer-on'],
            [0, 'Off', 'ptimer-off'],
          ])}
        </div>
        <div class="dr-set">
          <div>
            <div class="l1">${'Matches'}</div>
            <div class="l2">${'Best of one or best of three'}</div>
          </div>
          ${seg(d.bo, [
            [1, 'Bo1', 'bo1'],
            [3, 'Bo3', 'bo3'],
          ])}
        </div>
        <div class="dr-set">
          <div>
            <div class="l1">${'Rounds'}</div>
            <div class="l2">${d.roundsAuto ? 'Set by the number of players' : 'Set by you'}</div>
          </div>
          ${draftStepHtml('rounds', d.rounds)}
        </div>
        <div class="dr-set">
          <div><div class="l1">${'Round time'}</div></div>
          ${draftStepHtml('rmin', d.roundMin + ' min')}
        </div>
        <div class="dr-set">
          <div><div class="l1">${'Deckbuilding time'}</div></div>
          ${draftStepHtml('bmin', d.buildMin + ' min')}
        </div>
      </div>`;
  }
  if (d.phase === 'seating') {
    const n = d.seats.length,
      R = 41;
    const seats = d.seats
      .map((id, i) => {
        // Seat 1 at the foot of the ring, the rest clockwise -- the way pack 1 travels.
        const a = ((90 + (i * 360) / n) * Math.PI) / 180;
        return /* HTML */ `<div
          class="dr-seat"
          style="left:${(50 + R * Math.cos(a)).toFixed(1)}%;top:${(50 + R * Math.sin(a)).toFixed(1)}%;"
        >
          <b>${i + 1}</b><span>${nm(id)}</span>
        </div>`;
      })
      .join('');
    const r1 = draftCrossPairs(d.seats);
    return /* HTML */ `<div class="panel-card">
        <div class="panel-h">${'The table'}</div>
        <div class="dr-ring">
          ${seats}
          <div class="dr-ring-mid">
            <span class="dr-arrow">↻</span>${'Pack 1 and 3: left'}<br />${'Pack 2: right'}
          </div>
        </div>
        <button type="button" class="ghost-btn" data-dr="reshuffle" style="width:100%;">
          ⇄ ${'Shuffle the seats'}
        </button>
      </div>
      <div class="panel-card">
        <div class="panel-h">${'Round 1'}</div>
        <div class="dr-pairs">
          ${r1.map((m) => (m.b == null ? `<div>${nm(m.a)} — <i>${'bye'}</i></div>` : `<div>${nm(m.a)} <i>vs</i> ${nm(m.b)}</div>`)).join('')}
        </div>
        <p class="hint" style="margin:8px 0 0;">
          ${'Straight across the table: you never face the player you passed to.'}
        </p>
      </div>`;
  }
  if (d.phase === 'drafting') {
    const p = d.pick || { pack: 1, left: d.packSize, mode: 'wait' };
    if (p.mode === 'wait')
      return /* HTML */ `<div class="panel-card dr-center">
        <div class="dr-big">${'Open pack '}${p.pack} ${'of'} ${d.packs}</div>
        <div class="dr-sub">${draftPassHtml(p.pack)}</div>
        <p class="hint" style="margin:10px 0 0;">
          ${d.pickTimer ? 'Everyone opens their pack, then tap Start: the clock runs every pick by itself.' : 'Pick timer is off: tap the button when this pack is finished.'}
        </p>
      </div>`;
    if (p.mode === 'manual')
      return /* HTML */ `<div class="panel-card dr-center">
        <div class="dr-big">Pack ${p.pack} ${'of'} ${d.packs}</div>
        <div class="dr-sub">${draftPassHtml(p.pack)}</div>
      </div>`;
    if (p.mode === 'done')
      return /* HTML */ `<div class="panel-card dr-center">
        <div class="dr-big">${'Draft complete'}</div>
        <div class="dr-sub">${'Time to build a 40-card deck.'}</div>
      </div>`;
    const pickNo = d.packSize - p.left + 1;
    return /* HTML */ `<div class="panel-card dr-center">
      <div class="dr-big">
        ${p.mode === 'review' ? 'Review your picks' : `Pack ${p.pack} · Pick ${pickNo}`}
      </div>
      ${draftClockHtml(p, p.mode === 'review' ? 'Next: pack ' + (p.pack + 1) + ' · ' + draftPassHtml(p.pack + 1) : draftPassHtml(p.pack))}
    </div>`;
  }
  if (d.phase === 'building') {
    const t = d.build;
    const split = draftLandSplit(d.landCounts || {}, d.landTotal || 17);
    const res = Object.keys(split)
      .map((c) => `<b>${split[c]}</b> ${DRAFT_BASICS[c]}`)
      .join(' · ');
    return /* HTML */ `<div class="panel-card dr-center">
        <div class="dr-big">${'Deckbuilding'}</div>
        ${draftClockHtml(t, t.over ? `<b class="dr-over">${'Time! Decks down.'}</b>` : '40 cards: about 23 spells and 17 lands')}
        <div class="dr-row">
          ${t.endsAt ? `<button type="button" class="ghost-btn" data-dr="build-pause">⏸ ${'Pause'}</button>` : `<button type="button" class="ghost-btn" data-dr="build-go">▶ ${t.pausedLeft != null && !t.over ? 'Resume' : 'Start'}</button>`}<button
            type="button"
            class="ghost-btn"
            data-dr="build-plus"
          >
            +5 min
          </button>
        </div>
      </div>
      <div class="panel-card">
        <div class="panel-h">${'Basic lands'}</div>
        <p class="hint">${'How many spells of each colour? The lands follow.'}</p>
        ${['W', 'U', 'B', 'R', 'G'].map((c) => `<div class="dr-set"><div class="dr-mana">${manaIconSvg(c, 22)}<span>${DRAFT_BASICS[c]}</span></div>${draftStepHtml('land' + c, (d.landCounts || {})[c] || 0)}</div>`).join('')}
        <div class="dr-set">
          <div><div class="l1">${'Lands in total'}</div></div>
          ${draftStepHtml('ltot', d.landTotal || 17)}
        </div>
        <div class="dr-lands">${res || 'Add your spells per colour above.'}</div>
      </div>`;
  }
  if (d.phase === 'rounds') {
    const r = d.rs[d.rs.length - 1];
    const t = r.t;
    const rows = r.matches
      .map((m, i) => {
        if (m.b == null)
          return /* HTML */ `<div class="dr-match">
            <span class="dr-tbl">–</span>
            <div class="dr-vs">
              <div class="dr-p win"><span>${nm(m.a)}</span><span>${'bye'}</span></div>
            </div>
          </div>`;
        const res = m.res,
          aw = res ? res.aw : null,
          bw = res ? res.bw : null;
        return /* HTML */ `<div class="dr-match">
          <span class="dr-tbl">${i + 1}</span>
          <button type="button" class="dr-vs" data-dr="result" data-i="${i}">
            <span class="dr-p ${res && aw > bw ? 'win' : ''}"
              ><span>${nm(m.a)}</span><span>${res ? aw : ''}</span></span
            >
            <span class="dr-p ${res && bw > aw ? 'win' : ''}"
              ><span>${nm(m.b)}</span><span>${res ? bw : ''}</span></span
            >
            ${res ? '' : `<span class="dr-tap">${'Tap to enter the result'}</span>`}
          </button>
          <button
            type="button"
            class="dr-life"
            data-dr="life"
            data-i="${i}"
            title="Life Counter"
            aria-label="Life Counter"
          >
            ♥
          </button>
        </div>`;
      })
      .join('');
    return /* HTML */ `<div class="panel-card">
        <div class="panel-h">
          ${'Round '}${r.n} ${'of'} ${d.rounds} · ${d.bo === 1 ? 'Bo1' : 'Bo3'}
        </div>
        <div class="dr-matches">${rows}</div>
      </div>
      <div class="panel-card dr-center">
        ${draftClockHtml(t, t.over ? `<b class="dr-over">${'Time! Finish this turn, then 5 more turns.'}</b>` : '')}
        <div class="dr-row">
          ${t.endsAt ? `<button type="button" class="ghost-btn" data-dr="rt-pause">⏸ ${'Pause'}</button>` : `<button type="button" class="ghost-btn" data-dr="rt-go">▶ ${t.pausedLeft != null && !t.over ? 'Resume' : 'Start round'}</button>`}<button
            type="button"
            class="ghost-btn"
            data-dr="rt-plus"
          >
            +5 min
          </button>
        </div>
      </div>`;
  }
  if (d.phase === 'final') {
    const st = draftStandings(d);
    const w = st[0];
    return /* HTML */ `<div class="panel-card dr-center">
      <div class="dr-sub">${'Champion'}</div>
      <div class="dr-champ">${w ? escapeHtml(w.name) : ''}</div>
      ${w ? `<div class="dr-sub">${w.w}-${w.l}-${w.dr} · ${w.mp} ${'points'}</div>` : ''}
    </div>`;
  }
  return '';
}

function draftStandingsHtml(d) {
  if (!(d.phase === 'rounds' || d.phase === 'final') || !d.rs.length) return '';
  const st = draftStandings(d);
  const pct = (v) => Math.round(v * 100) + '%';
  return /* HTML */ `<div class="panel-card">
    <div class="panel-h">${'Standings'}</div>
    <table class="dr-stand">
      <tr>
        <th>#</th>
        <th>${'Player'}</th>
        <th>W-L-D</th>
        <th>${'Pts'}</th>
        <th>OMW</th>
        <th>GW</th>
        <th>OGW</th>
      </tr>
      ${st.map((x, i) => `<tr${d.phase === 'rounds' ? ` data-dr="drop" data-id="${x.id}"` : ''} class="${x.dropped ? 'dropped' : ''}"><td>${i + 1}</td><td>${escapeHtml(x.name)}</td><td>${x.w}-${x.l}-${x.dr}</td><td><b>${x.mp}</b></td><td>${pct(x.omw)}</td><td>${pct(x.gwp)}</td><td>${pct(x.ogw)}</td></tr>`).join('')}
    </table>
    <p class="hint" style="margin:8px 0 0;">
      ${'Ties: opponents’ match-win %, then game-win %, then opponents’ game-win %.'}${d.phase === 'rounds' ? ' ' + 'Tap a player to drop them.' : ''}
    </p>
  </div>`;
}

function draftHistoryHtml(d) {
  const done = d.phase === 'final' ? d.rs : d.rs.slice(0, -1);
  if (!(d.phase === 'rounds' || d.phase === 'final') || !done.length) return '';
  const nm = (id) => escapeHtml(draftName(d, id));
  return done
    .slice()
    .reverse()
    .map(
      (r) => `<div class="panel-card dr-past">
    <div class="panel-h">${'Round '}${r.n}</div>
    ${r.matches.map((m) => (m.b == null ? `<div>${nm(m.a)} — ${'bye'}</div>` : `<div>${nm(m.a)} <b>${m.res ? m.res.aw + '–' + m.res.bw : ''}</b> ${nm(m.b)}</div>`)).join('')}
  </div>`,
    )
    .join('');
}

function draftOpenLife(a, b) {
  // A draft game is a 2-player game at 20 life, names already on the panels.
  try {
    localStorage.setItem(LS_PREFIX + 'lifeFmt', 'constructed');
  } catch (e) {}
  const L = state.life;
  L._keepNames = [a, b];
  L.players = null;
  L.count = 2;
  L.layout = '2f';
  L.setupDone = false;
  L.history = [];
  L.expandedIdx = null;
  L.turnIdx = null;
  L.startIdx = null;
  L.turnNum = 1;
  ensureLifePlayers();
  openLifeOverlay();
}

function draftResultMenu(anchor, d, i) {
  const r = d.rs[d.rs.length - 1],
    mt = r && r.matches[i];
  if (!mt || mt.b == null) return;
  const A = escapeHtml(draftName(d, mt.a)),
    B = escapeHtml(draftName(d, mt.b));
  const set = (aw, bw, dd) => () => {
    mt.res = aw == null ? null : { aw, bw, d: dd || 0 };
    draftSave();
    render();
  };
  const items =
    d.bo === 1
      ? [
          { label: A + ' ' + 'wins', fn: set(1, 0) },
          { label: 'Draw', fn: set(0, 0, 1) },
          { label: B + ' ' + 'wins', fn: set(0, 1) },
        ]
      : [
          { label: A + ' 2–0', fn: set(2, 0) },
          { label: A + ' 2–1', fn: set(2, 1) },
          { label: '1–1 ' + '(draw)', fn: set(1, 1) },
          { label: B + ' 2–1', fn: set(1, 2) },
          { label: B + ' 2–0', fn: set(0, 2) },
        ];
  if (mt.res) items.push({ label: 'Clear result', fn: set(null), danger: true });
  openTileMenu(anchor, items);
}

function draftGo(phase) {
  state.draft.phase = phase;
  draftSave();
  render();
  scrollToPageFoot();
}

function draftAction(act, el) {
  const d = state.draft;
  if (!d) return;
  const save = () => {
    draftSave();
    render();
  };
  const addName = (name) => {
    name = String(name || '')
      .trim()
      .slice(0, 24);
    if (!name) return false;
    if (d.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      toast('That name is already in.');
      return false;
    }
    d.players.push({
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      dropped: false,
    });
    if (d.roundsAuto) d.rounds = draftAutoRounds(d.players.length);
    return true;
  };
  const m = /^(rounds|rmin|bmin|ltot|land[WUBRG])([+-])$/.exec(act);
  if (m) {
    const up = m[2] === '+';
    if (m[1] === 'rounds') {
      d.rounds = Math.max(1, Math.min(8, d.rounds + (up ? 1 : -1)));
      d.roundsAuto = false;
    } else if (m[1] === 'rmin') d.roundMin = Math.max(10, Math.min(90, d.roundMin + (up ? 5 : -5)));
    else if (m[1] === 'bmin') d.buildMin = Math.max(5, Math.min(60, d.buildMin + (up ? 5 : -5)));
    else if (m[1] === 'ltot')
      d.landTotal = Math.max(14, Math.min(19, (d.landTotal || 17) + (up ? 1 : -1)));
    else {
      const c = m[1].slice(4);
      d.landCounts = d.landCounts || {};
      d.landCounts[c] = Math.max(0, Math.min(30, (d.landCounts[c] || 0) + (up ? 1 : -1)));
    }
    save();
    return;
  }
  switch (act) {
    case 'step': {
      const phase = el?.dataset.phase;
      if (!['setup', 'seating'].includes(d.phase) || phase === d.phase) return;
      if (phase === 'setup') {
        draftGo('setup');
        return;
      }
      if (phase === 'seating' && d.players.length >= 2) {
        const ids = new Set(d.players.map((p) => p.id));
        if (d.seats.length !== ids.size || !d.seats.every((id) => ids.has(id))) {
          draftRememberNames(d.players.map((p) => p.name));
          d.seats = draftShuffle([...ids]);
        }
        draftGo('seating');
      }
      return;
    }
    case 'add': {
      const inp = document.getElementById('drName');
      state._drFocusName = true;
      if (addName(inp ? inp.value : '')) save();
      else if (inp) {
        state._drFocusName = false;
        try {
          inp.focus({ preventScroll: true });
        } catch (e) {}
      }
      return;
    }
    case 'recent':
      if (addName(el && el.dataset.name)) save();
      return;
    case 'del':
      d.players = d.players.filter((p) => p.id !== el.dataset.id);
      if (d.roundsAuto) d.rounds = draftAutoRounds(d.players.length);
      save();
      return;
    case 'pack14':
      d.packSize = 14;
      save();
      return;
    case 'pack15':
      d.packSize = 15;
      save();
      return;
    case 'ptimer-on':
      d.pickTimer = true;
      save();
      return;
    case 'ptimer-off':
      d.pickTimer = false;
      save();
      return;
    case 'bo1':
      d.bo = 1;
      save();
      return;
    case 'bo3':
      d.bo = 3;
      save();
      return;
    case 'seat':
      if (d.players.length < 2) return;
      draftRememberNames(d.players.map((p) => p.name));
      d.seats = draftShuffle(d.players.map((p) => p.id));
      draftGo('seating');
      return;
    case 'reshuffle':
      d.seats = draftShuffle(d.seats);
      save();
      return;
    case 'draft-start':
      d.pick = {
        pack: 1,
        left: d.packSize,
        mode: 'wait',
        endsAt: null,
        pausedLeft: null,
        total: 0,
      };
      draftGo('drafting');
      return;
    case 'pack-start': {
      draftAudioArm();
      const p = d.pick;
      if (!d.pickTimer) {
        p.mode = 'manual';
        save();
        return;
      }
      p.mode = 'pick';
      p.left = d.packSize;
      p.total = draftPickSecs(p.left) * 1000;
      p.endsAt = Date.now() + p.total;
      p.pausedLeft = null;
      try {
        acquireWakeLock();
      } catch (e) {}
      save();
      return;
    }
    case 'pack-done': {
      const p = d.pick;
      if (p.pack < d.packs) {
        p.pack++;
        p.mode = 'wait';
      } else p.mode = 'done';
      save();
      return;
    }
    case 'pick-pause':
      drTPause(d.pick);
      save();
      return;
    case 'pick-resume':
      draftAudioArm();
      drTStart(d.pick);
      save();
      return;
    case 'pick-skip': {
      const p = d.pick;
      if (!p.endsAt) {
        p.endsAt = Date.now();
        p.pausedLeft = null;
      } else p.endsAt = Date.now();
      draftTick();
      return;
    }
    case 'build-start':
      d.build = { total: d.buildMin * 60000, endsAt: null, pausedLeft: null, over: false };
      draftGo('building');
      return;
    case 'build-go':
      draftAudioArm();
      if (d.build.over) {
        d.build.pausedLeft = null;
        d.build.over = false;
      }
      drTStart(d.build);
      try {
        acquireWakeLock();
      } catch (e) {}
      save();
      return;
    case 'build-pause':
      drTPause(d.build);
      save();
      return;
    case 'build-plus': {
      const t = d.build;
      t.total += 300000;
      if (t.endsAt) t.endsAt += 300000;
      else if (t.pausedLeft != null) t.pausedLeft += 300000;
      t.over = false;
      save();
      return;
    }
    case 'round1': {
      const seats = d.seats.filter((id) => {
        const p = d.players.find((x) => x.id === id);
        return p && !p.dropped;
      });
      d.rs = [
        {
          n: 1,
          matches: draftCrossPairs(seats),
          t: { total: d.roundMin * 60000, endsAt: null, pausedLeft: null, over: false },
        },
      ];
      draftGo('rounds');
      return;
    }
    case 'next-round': {
      const r = d.rs[d.rs.length - 1];
      if (!r || !r.matches.every((x) => x.res)) return;
      d.rs.push({
        n: r.n + 1,
        matches: draftSwissPairs(d),
        t: { total: d.roundMin * 60000, endsAt: null, pausedLeft: null, over: false },
      });
      draftGo('rounds');
      return;
    }
    case 'final':
      draftGo('final');
      return;
    case 'rt-go': {
      draftAudioArm();
      const t = d.rs[d.rs.length - 1].t;
      if (t.over) {
        t.pausedLeft = null;
        t.over = false;
      }
      drTStart(t);
      try {
        acquireWakeLock();
      } catch (e) {}
      save();
      return;
    }
    case 'rt-pause':
      drTPause(d.rs[d.rs.length - 1].t);
      save();
      return;
    case 'rt-plus': {
      const t = d.rs[d.rs.length - 1].t;
      t.total += 300000;
      if (t.endsAt) t.endsAt += 300000;
      else if (t.pausedLeft != null) t.pausedLeft += 300000;
      t.over = false;
      save();
      return;
    }
    case 'result':
      draftResultMenu(el, d, +el.dataset.i);
      return;
    case 'life': {
      const mt = d.rs[d.rs.length - 1].matches[+el.dataset.i];
      if (mt && mt.b != null) draftOpenLife(draftName(d, mt.a), draftName(d, mt.b));
      return;
    }
    case 'drop': {
      const p = d.players.find((x) => x.id === el.dataset.id);
      if (!p) return;
      openTileMenu(el, [
        p.dropped
          ? {
              label: 'Back in the event',
              fn: () => {
                p.dropped = false;
                save();
              },
            }
          : {
              label: 'Drop ' + escapeHtml(p.name) + ' from the event',
              danger: true,
              fn: () => {
                p.dropped = true;
                save();
              },
            },
      ]);
      return;
    }
    case 'new':
      openInAppConfirm(
        'Start a new draft? Seats, rounds and results are cleared; the players and settings stay.',
        (ok) => {
          if (!ok) return;
          state.draft = draftNew({
            players: d.players.map((p) => ({ id: p.id, name: p.name, dropped: false })),
            packSize: d.packSize,
            bo: d.bo,
            rounds: d.rounds,
            roundsAuto: d.roundsAuto,
            roundMin: d.roundMin,
            buildMin: d.buildMin,
            pickTimer: d.pickTimer,
          });
          draftSave();
          render();
          scrollToPageFoot();
        },
      );
      return;
  }
}

function wireDraftPage() {
  if (!state.draft) state.draft = draftLoad();
  const main = document.querySelector('.app > main.draft-main');
  if (!main) return;
  document.getElementById('draftResetBtn')?.addEventListener('click', () => draftAction('new'));
  // The + button must not steal focus from the name field: the keyboard
  // stays up while you type the whole table in.
  main.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-dr="add"]')) e.preventDefault();
  });
  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dr]');
    if (!b || b.disabled || !main.contains(b)) return;
    draftAction(b.dataset.dr, b);
  });
  const inp = document.getElementById('drName');
  inp?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      draftAction('add');
    }
  });
  if (state._drFocusName && inp) {
    state._drFocusName = false;
    try {
      inp.focus({ preventScroll: true });
    } catch (e) {}
  }
  if (!_draftT) _draftT = setInterval(draftTick, 250);
  draftTick();
}

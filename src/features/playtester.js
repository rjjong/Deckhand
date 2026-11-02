// features / playtester

/* ================= PLAYTESTER — Deckhand 1.2 =================
   A game on your own: London mulligan (in Commander the first one is free,
   CR 103.5c), draw, play lands and spells, tap, tokens, scry, and a short
   look back at the end. Bottom-up: the buttons at the foot, the hand right
   above them, the battlefield above that. */
function ptShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function ptTypeLine(c) {
  return String(((c.card_faces && c.card_faces[0]) || c).type_line || c.type_line || '').split(
    '//',
  )[0];
}

function ptIsLand(c) {
  return /\bLand\b/.test(ptTypeLine(c));
}

function ptMv(c) {
  return typeof c.cmc === 'number' ? c.cmc : 0;
}

// The tokens a card says it makes: "create a 1/1 white Soldier creature token".
function ptTokensOf(c) {
  const text =
    String(c.oracle_text || '') +
    '\n' +
    (c.card_faces || []).map((f) => f.oracle_text || '').join('\n');
  const out = [];
  const re =
    /creates? (?:a|an|one|two|three|four|five|six|x|that many|a number of|\d+) ((?:tapped )?(?:legendary )?(?:\d+\/\d+ )?[a-z ,\-]*?) (?:artifact |enchantment |creature )*tokens?\b/gi;
  let m;
  while ((m = re.exec(text))) {
    let t = m[1]
      .replace(/^tapped /i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t || t.length > 40) continue;
    t = t.replace(/\b(white|blue|black|red|green|colorless)\b/gi, (w) => w.toLowerCase());
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (out.indexOf(t) < 0) out.push(t);
  }
  return out;
}

function ptIsArtifactX(x) {
  if (x.c.token)
    return /^(treasure|food|clue|blood|gold|map|powerstone|junk|incubator)\b/i.test(
      String(x.c.name || ''),
    );
  return /\bArtifact\b/.test(ptTypeLine(x.c)) && !/\bCreature\b/.test(ptTypeLine(x.c));
}

function ptIsCreatureX(x) {
  if (x.c.token) return !ptIsArtifactX(x);
  return /\bCreature\b/.test(ptTypeLine(x.c));
}

function ptSmartOn() {
  try {
    return localStorage.getItem(LS_PREFIX + 'ptSmart') === '1';
  } catch (e) {
    return false;
  }
}

function ptSmartSet(on) {
  try {
    localStorage.setItem(LS_PREFIX + 'ptSmart', on ? '1' : '0');
  } catch (e) {}
}

/* 1.39: a card press in the playtest -- tap: its action; hold still: the
   menu; hold and drag: carry the card to any zone (the zone under the
   finger lights up). Before the hold, a moving finger simply scrolls. */
function ptDragPress(node, onTap, onHold, onDrop) {
  let tmr = null,
    armed = false,
    dragging = false,
    moved = false,
    sx = 0,
    sy = 0,
    ghost = null,
    over = null,
    skip = false;
  const zoneAt = (cx, cy) => {
    const t = document.elementFromPoint(cx, cy);
    return t && t.closest ? t.closest('[data-ptdrop]') : null;
  };
  const lite = (z) => {
    if (over === z) return;
    if (over) over.classList.remove('pt-over');
    over = z;
    if (z) z.classList.add('pt-over');
  };
  const place = (cx, cy) => {
    if (!ghost) return;
    ghost.style.left = cx - ghost.offsetWidth / 2 + 'px';
    ghost.style.top = cy - ghost.offsetHeight * 0.65 + 'px';
    lite(zoneAt(cx, cy));
  };
  const end = () => {
    clearTimeout(tmr);
    if (ghost) {
      ghost.remove();
      ghost = null;
    }
    node.classList.remove('pt-dragsrc', 'pt-armed');
    lite(null);
    armed = false;
    dragging = false;
  };
  node.addEventListener('pointerdown', (e) => {
    if (e.button) {
      return;
    }
    end();
    moved = false;
    sx = e.clientX;
    sy = e.clientY;
    const pid = e.pointerId;
    tmr = setTimeout(() => {
      if (moved) return;
      armed = true;
      node.classList.add('pt-armed');
      try {
        navigator.vibrate && navigator.vibrate(10);
      } catch (err) {}
      try {
        node.setPointerCapture(pid);
      } catch (err) {}
    }, 380);
  });
  node.addEventListener('pointermove', (e) => {
    const dx = e.clientX - sx,
      dy = e.clientY - sy;
    if (!armed) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        moved = true;
        clearTimeout(tmr);
      }
      return;
    }
    if (!dragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      dragging = true;
      const r = node.getBoundingClientRect();
      ghost = node.cloneNode(true);
      ghost.classList.remove('pt-armed', 'tapped');
      ghost.classList.add('pt-ghost');
      ghost.style.width = r.width + 'px';
      ghost.style.height = (r.width * 88) / 63 + 'px';
      document.body.appendChild(ghost);
      node.classList.add('pt-dragsrc');
    }
    if (dragging) place(e.clientX, e.clientY);
  });
  // once held, the finger belongs to the card: no scrolling underneath
  node.addEventListener(
    'touchmove',
    (e) => {
      if (armed) e.preventDefault();
    },
    { passive: false },
  );
  node.addEventListener('pointerup', (e) => {
    clearTimeout(tmr);
    if (dragging) {
      const z = zoneAt(e.clientX, e.clientY);
      end();
      skip = true;
      if (z && onDrop) onDrop(z.dataset.ptdrop);
      return;
    }
    if (armed) {
      end();
      skip = true;
      onHold();
      return;
    }
  });
  node.addEventListener('pointercancel', end);
  node.addEventListener('contextmenu', (e) => e.preventDefault());
  node.addEventListener('click', (e) => {
    e.stopPropagation();
    if (skip) {
      skip = false;
      return;
    }
    onTap();
  });
}

function ptLongPress(el, onTap, onHold) {
  let tm = null,
    held = false;
  el.addEventListener('pointerdown', () => {
    held = false;
    clearTimeout(tm);
    tm = setTimeout(() => {
      held = true;
      onHold();
    }, 480);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
    el.addEventListener(ev, () => clearTimeout(tm));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (held) {
      held = false;
      return;
    }
    onTap();
  });
}

function openPlaytest(d) {
  if (!d || !(d.cards || []).length) {
    toast('This deck has no cards yet.');
    return;
  }
  const con = deckIsConstructed(d);
  const wrap = (c) => ({ c, id: uid(), tapped: false });
  let S;
  const fresh = () => {
    S = {
      lib: ptShuffle(d.cards.map(wrap)),
      hand: [],
      bf: [],
      gy: [],
      ex: [],
      cz: deckLeaders(d).map(wrap),
      turn: 0,
      mull: 0,
      phase: 'mull',
      bottomNeed: 0,
      lands: {},
      cmdrTurn: null,
      casts: {},
      life: con ? 20 : 40,
    };
    for (let i = 0; i < 7 && S.lib.length; i++) S.hand.push(S.lib.pop());
  };
  const tokenNames = (() => {
    const all = [];
    deckLeaders(d)
      .concat(d.cards)
      .forEach((c) =>
        ptTokensOf(c).forEach((t) => {
          if (all.indexOf(t) < 0) all.push(t);
        }),
      );
    ['Treasure', 'Food', 'Clue'].forEach((t) => {
      if (
        all.indexOf(t) < 0 &&
        deckLeaders(d)
          .concat(d.cards)
          .some((c) => new RegExp('\\b' + t + ' token', 'i').test(String(c.oracle_text || '')))
      )
        all.push(t);
    });
    return all.slice(0, 12);
  })();
  fresh();
  document.getElementById('ptOverlay')?.remove();
  const el = document.createElement('div');
  el.className = 'overlay pt-ov';
  el.id = 'ptOverlay';
  document.body.appendChild(el);
  pushOverlay('playtest', () => {
    document.getElementById('ptOverlay')?.remove();
  });

  const landsOnBf = () => S.bf.filter((x) => ptIsLand(x.c)).length;
  const zones = {
    hand: () => S.hand,
    bf: () => S.bf,
    cz: () => S.cz,
    gy: () => S.gy,
    ex: () => S.ex,
  };
  const find = (id) => {
    for (const k of Object.keys(zones)) {
      const a = zones[k]();
      const i = a.findIndex((x) => x.id === id);
      if (i >= 0) return { k, a, i, x: a[i] };
    }
    return null;
  };
  const take = (id) => {
    const f = find(id);
    if (!f) return null;
    f.a.splice(f.i, 1);
    f.x.tapped = false;
    return f;
  };
  const isLeader = (x) => deckLeaders(d).some((c) => c === x.c);
  const draw = (n) => {
    for (let i = 0; i < (n || 1); i++) {
      if (!S.lib.length) {
        toast('Your library is empty.');
        break;
      }
      S.hand.push(S.lib.pop());
    }
  };
  const tile = (x, zone, extra) => {
    const img = x.c.token ? '' : cardImageMed(x.c);
    return `<div class="pt-card${x.tapped ? ' tapped' : ''}${x.c.token ? ' token' : ''}${extra ? ' ' + extra : ''}" data-ptid="${x.id}" data-zone="${zone}">${img ? `<img src="${img}" alt="${escapeHtml(x.c.name)}" draggable="false">` : `<span>${escapeHtml(x.c.name)}</span>`}</div>`;
  };
  const msg = () => {
    if (S.phase === 'mull')
      return S.mull
        ? `Mulligan ${S.mull}${!con && S.mull === 1 ? ' (free)' : ''} — keep or again?`
        : 'Your opening hand. Keep or mulligan?';
    if (S.phase === 'bottom')
      return `Tap ${S.bottomNeed} card${S.bottomNeed === 1 ? '' : 's'} to put on the bottom.`;
    return 'Tap: play / tap · hold: more';
  };
  const paint = () => {
    const perms = S.bf.filter((x) => !ptIsLand(x.c)),
      lands = S.bf.filter((x) => ptIsLand(x.c));
    // 1.39: the battlefield sorts itself -- creatures on the top row; below
    // them enchantments on the left, other permanents mid, artifacts right
    const cre = perms.filter((x) => ptIsCreatureX(x));
    const nc = perms.filter((x) => !ptIsCreatureX(x));
    const ench = nc.filter(
      (x) => /Enchantment/.test(ptTypeLine(x.c)) && !/Artifact/.test(ptTypeLine(x.c)),
    );
    const art = nc.filter((x) => ptIsArtifactX(x));
    const mid = nc.filter((x) => ench.indexOf(x) < 0 && art.indexOf(x) < 0);
    const ncHtml =
      ench.map((x) => tile(x, 'bf')).join('') +
      mid.map((x) => tile(x, 'bf')).join('') +
      art.map((x, i) => tile(x, 'bf', i === 0 ? 'pt-art-first' : '')).join('');
    const tax = (x) => {
      const n = S.casts[x.id] || 0;
      return n ? ` +${n * 2}` : '';
    };
    el.innerHTML = /* HTML */ `<div class="overlay-inner pt-wrap">
      ${overlayCapHtml('Playtest' + ' — ' + (d.name || ''), `<label class="pt-smart" title="${'Smart opponents'}"><span class="toggle-switch"><input type="checkbox" id="ptSmart" ${ptSmartOn() ? 'checked' : ''}><span class="track"></span><span class="knob"></span></span><span class="pt-smart-l">Smart</span></label>`)}
      <div class="pt-stats">
        <span>${'Turn'} <b>${S.turn || '–'}</b></span>
        <span data-ptdrop="top" title="${'Top of library'}"
          >${inlIco('library', 15)}<b>${S.lib.length}</b></span
        >
        <button type="button" class="pt-zone" data-ptpile="gy" data-ptdrop="gy">
          ${inlIco('grave', 15)}<b>${S.gy.length}</b>
        </button>
        <button type="button" class="pt-zone" data-ptpile="ex" data-ptdrop="ex">
          ✖ <b>${S.ex.length}</b>
        </button>
        <span class="pt-life"
          ><button type="button" data-ptlife="-1">−</button>❤ <b>${S.life}</b
          ><button type="button" data-ptlife="1">+</button></span
        >
      </div>
      <div class="pt-field" data-ptdrop="bf">
        ${
          perms.length
            ? (cre.length
                ? `<div class="pt-row pt-cre">${cre.map((x) => tile(x, 'bf')).join('')}</div>`
                : '') + (nc.length ? `<div class="pt-row pt-nc">${ncHtml}</div>` : '')
            : `<div class="pt-row pt-perms"><div class="pt-empty">${'Battlefield'}</div></div>`
        }
        <div class="pt-row pt-lands">
          ${lands.length ? lands.map((x) => tile(x, 'bf')).join('') : `<div class="pt-empty">${'Lands'}</div>`}
        </div>
      </div>
      <div class="pt-czrow">
        ${deckLeaders(d).length ? `<div class="pt-cz" data-ptdrop="cz"><div class="pt-czs">${S.cz.length ? S.cz.map((x) => `<div class="pt-czc">${tile(x, 'cz')}<i>${tax(x).trim()}</i></div>`).join('') : '<div class="pt-czc pt-cz-empty"></div>'}</div><span class="pt-cz-l">${'Command zone'}</span></div>` : ''}
        <div class="pt-gy" data-ptdrop="gy" data-ptpile="gy" role="button">
          <div class="pt-gy-cards">
            ${S.gy
              .slice(-8)
              .reverse()
              .map((x) => tile(x, 'gy'))
              .join('')}
          </div>
          <span class="pt-gy-l">Graveyard${S.gy.length ? ' · ' + S.gy.length : ''}</span>
        </div>
      </div>
      <div class="pt-msg">${msg()}</div>
      <div class="pt-hand" data-ptdrop="hand">
        ${S.hand
          .slice()
          .reverse()
          .map((x) => tile(x, 'hand'))
          .join('')}
      </div>
      <div class="pt-bar">
        ${
          S.phase === 'mull'
            ? `<button type="button" class="ghost-btn" id="ptMull">Mulligan</button><button type="button" class="primary-btn" id="ptKeep">${'Keep'}</button>`
            : S.phase === 'bottom'
              ? `<button type="button" class="ghost-btn" disabled>${'Left'} ${S.bottomNeed}</button>`
              : `<button type="button" class="ghost-btn" id="ptMore">${'More'} ▴</button><button type="button" class="ghost-btn" id="ptDraw">${'Draw'}</button><button type="button" class="primary-btn" id="ptNext">${'Next turn'} ▸</button>`
        }
      </div>
    </div>`;
    wire();
  };
  /* 1.39 SMART OPPONENTS -- plain rules, no AI: Commander pods are
     well-measured, so each opponent turn rolls the averages (attack odds and
     damage that grow with the turn, spot removal ~1 in 9 turns, a board
     wipe now and then once games get going, a counterspell on some casts).
     Every hit is aimed: the most dangerous permanent first (commander,
     planeswalkers, big creatures, engines). */
  const threat = (x) => {
    if (x.c.token) return 1;
    const tl = ptTypeLine(x.c),
      o = String(x.c.oracle_text || '').toLowerCase();
    let sc = ptMv(x.c);
    if (/Creature/.test(tl))
      sc += (parseFloat(x.c.power) || 0) + (parseFloat(x.c.toughness) || 0) / 2;
    if (/Planeswalker/.test(tl)) sc += 8;
    if (isLeader(x)) sc += 6;
    if (/whenever|at the beginning of|draw/.test(o)) sc += 3;
    if (/add \{/.test(o)) sc += 1;
    return sc;
  };
  const pickTarget = (list) => {
    const s2 = list.slice().sort((a, b) => threat(b) - threat(a));
    return s2.length > 1 && Math.random() < 0.3 ? s2[1] : s2[0];
  };
  const sendAway = (x, where) => {
    if (isLeader(x)) {
      take(x.id);
      S.cz.push(x);
      return;
    } // a commander goes home
    moveTo(x, where);
  };
  const countered = (x) => {
    if (!ptSmartOn() || ptIsLand(x.c) || S.turn < 2) return false;
    const big = isLeader(x) || ptMv(x.c) >= 5 || threat(x) >= 9;
    if (Math.random() >= (big ? 0.16 : 0.06)) return false;
    const f = take(x.id);
    if (!f) return false;
    if (isLeader(x))
      S.cz.push(x); // back home; the cast still raised its tax
    else S.gy.push(x);
    toast(`${x.c.name} was countered by an opponent.`);
    return true;
  };
  const smartRound = () => {
    const ev = [],
      t = Math.max(1, S.turn),
      opps = con ? 1 : 3;
    for (let o = 1; o <= opps; o++) {
      const who = con ? 'Opponent' : 'Opponent ' + o;
      const crs = S.bf.filter((x) => ptIsCreatureX(x));
      // board wipe: from turn 4, likelier the more you have out
      if (crs.length >= 2 && t >= 4 && Math.random() < 0.03 * (1 + crs.length / 4)) {
        crs.forEach((x) => sendAway(x, 'gy'));
        ev.push(`${who}: board wipe \u2014 ${crs.length} ${'creatures gone'}`);
        continue;
      }
      // spot removal on your most dangerous permanent
      const perms = S.bf.filter((x) => !ptIsLand(x.c));
      if (perms.length && Math.random() < (t < 2 ? 0.03 : 0.11)) {
        const x = pickTarget(perms),
          ex = Math.random() < 0.35;
        sendAway(x, ex ? 'ex' : 'gy');
        ev.push(
          `${who}: ${ex ? 'exile' : 'removal'} ${'on'} ${x.c.name}${isLeader(x) ? ' (back to the command zone)' : ''}`,
        );
      }
      // an attack: odds and damage grow with the turn. 1.40: YOU decide --
      // block an attacker or take it all (asked when it happens)
      if (Math.random() < (t < 2 ? 0.08 : t < 4 ? 0.3 : 0.45)) {
        const dmg = Math.max(1, Math.round((1 + 0.9 * t) * (0.6 + Math.random() * 0.8)));
        const n = Math.max(1, Math.min(3, 1 + Math.floor(t / 4), dmg));
        ev.push({ attack: true, who, dmg, n });
      }
    }
    return ev;
  };
  // the round plays out step by step; an attack waits for your choice
  const runRound = (steps, done) => {
    const lines = [];
    const next = () => {
      while (steps.length) {
        const st = steps.shift();
        if (typeof st === 'string') {
          lines.push(st);
          continue;
        }
        const bl = S.bf.filter((x) => ptIsCreatureX(x) && !x.tapped);
        const per = Math.max(1, Math.round(st.dmg / st.n));
        if (!bl.length) {
          S.life -= st.dmg;
          lines.push(`${st.who}: ${'attacks'} \u2014 ${st.dmg} ${'damage'}`);
          continue;
        }
        const head = `${st.who}: ${'attacks with'} ${st.n} ${st.n === 1 ? 'creature' : 'creatures'} \u2014 ${st.dmg} ${'damage'}`;
        const opts = [['take', `Take ${st.dmg} damage`]].concat(
          bl.slice(0, 6).map((x) => ['b:' + x.id, 'Block with ' + escapeHtml(x.c.name)]),
        );
        ptMenu(
          head,
          opts,
          (k) => {
            if (k && k.indexOf('b:') === 0) {
              const f = find(k.slice(2));
              const x = f && f.x;
              const taken = Math.max(0, st.dmg - per);
              S.life -= taken;
              const tough = x && !x.c.token ? parseFloat(x.c.toughness) || 1 : 1;
              const dies = x && tough <= per;
              if (dies) sendAway(x, 'gy');
              lines.push(
                `${st.who}: ${'attacks'} \u2014 ${x ? x.c.name : '?'} ${'blocks'}${dies ? ' and dies' : ''} \u00b7 ${taken} ${'damage'}`,
              );
            } else {
              S.life -= st.dmg;
              lines.push(`${st.who}: ${'attacks'} \u2014 ${st.dmg} ${'damage'}`);
            }
            paint();
            next();
          },
          () => {
            S.life -= st.dmg;
            lines.push(`${st.who}: ${'attacks'} \u2014 ${st.dmg} ${'damage'}`);
            paint();
            next();
          },
        );
        return;
      }
      done();
      showRound(lines);
    };
    next();
  };
  const showRound = (ev) => {
    if (!ev.length) {
      toast('The opponents left you alone.');
      return;
    }
    const lines = ev.concat(S.life <= 0 ? ['You are out of life.'] : []);
    ptMenu(
      'Between your turns',
      [['ok', 'OK']].concat(S.life <= 0 ? [['end', 'Finish']] : []),
      (k) => {
        if (k === 'end') summary();
      },
    );
    const tt = document.querySelector('#ptMenu .br-title');
    if (tt)
      tt.insertAdjacentHTML(
        'beforeend',
        `<ul class="pt-sum">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
      );
  };
  const playFromHand = (x) => {
    if (countered(x)) return;
    const f = take(x.id);
    if (!f) return;
    S.bf.push(x);
    if (ptIsLand(x.c)) S.lands[S.turn] = (S.lands[S.turn] || 0) + 1;
  };
  const castLeader = (x) => {
    S.casts[x.id] = (S.casts[x.id] || 0) + 1; // the tax counts even when it is countered
    if (S.cmdrTurn == null) S.cmdrTurn = S.turn;
    if (countered(x)) return;
    take(x.id);
    S.bf.push(x);
  };
  // a card dropped on a zone (drag and drop)
  const dropTo = (x, from, to) => {
    if (!to || to === from || (from === 'pile' && to === 'pile')) return;
    if (from === 'hand' && S.phase !== 'play') return;
    if (to === 'bf') {
      if (from === 'hand') playFromHand(x);
      else if (from === 'cz') castLeader(x);
      else moveTo(x, 'bf');
    } else if (to === 'cz') {
      if (!isLeader(x)) {
        toast('Only your commander belongs in the command zone.');
        return;
      }
      moveTo(x, 'cz');
    } else if (to === 'hand') {
      if (x.c.token) return;
      moveTo(x, 'hand');
    } else moveTo(x, to);
    paint();
  };
  const moveTo = (x, where) => {
    const f = take(x.id);
    if (!f) return;
    if (x.c.token && where !== 'bf' && where !== 'hand') {
      return;
    } // a token that leaves the battlefield is gone
    if (where === 'top') S.lib.push(x);
    else if (where === 'bottom') S.lib.unshift(x);
    else if (where === 'shuffle') {
      S.lib.push(x);
      ptShuffle(S.lib);
    } else zones[where]().push(x);
  };
  const cardMenu = (x) => {
    const f = find(x.id);
    if (!f) return;
    const opts = [];
    if (!x.c.token) opts.push(['view', 'View']);
    if (f.k !== 'hand' && !x.c.token) opts.push(['hand', 'To hand']);
    if (f.k !== 'bf') opts.push(['bf', 'Onto the battlefield']);
    if (isLeader(x) && f.k !== 'cz') opts.push(['cz', 'To the command zone']);
    if (f.k !== 'gy' && !x.c.token) opts.push(['gy', 'Graveyard']);
    if (f.k !== 'ex' && !x.c.token) opts.push(['ex', 'Exile']);
    if (!x.c.token) opts.push(['top', 'Top of library'], ['bottom', 'Bottom of library']);
    if (x.c.token) opts.push(['gone', 'Remove token']);
    ptMenu(x.c.name, opts, (k) => {
      if (k === 'view') {
        try {
          showCardPreview(x.c, cardImageLarge(x.c));
        } catch (e) {}
        return;
      }
      if (k === 'gone') {
        take(x.id);
        paint();
        return;
      }
      moveTo(x, k);
      paint();
    });
  };
  const ptMenu = (title, opts, pick, onNone) => {
    document.getElementById('ptMenu')?.remove();
    const m = document.createElement('div');
    m.className = 'deckpick-scrim';
    m.id = 'ptMenu';
    m.style.zIndex = 210;
    m.style.alignItems = 'flex-end';
    m.innerHTML = /* HTML */ `<div class="deckpick br-sheet pt-menu">
      ${opts.map(([k, l]) => `<button type="button" class="ghost-btn" data-ptk="${k}">${l}</button>`).join('')}
      <div class="br-title"><b>${escapeHtml(title)}</b></div>
    </div>`;
    let chosen = null;
    brSheetOpen(m, 'ptMenu', () => {
      if (chosen != null) {
        const k = chosen;
        chosen = null;
        setTimeout(() => pick(k), 0);
      } else if (onNone) setTimeout(onNone, 0);
    });
    m.addEventListener('click', (e) => {
      if (e.target === m) brSheetClose('ptMenu');
    });
    m.querySelectorAll('[data-ptk]').forEach((b) =>
      b.addEventListener('click', () => {
        chosen = b.dataset.ptk;
        brSheetClose('ptMenu');
      }),
    );
  };
  const nextTurn = () => {
    S.turn++;
    S.bf.forEach((x) => {
      x.tapped = false;
    });
    // Two players: whoever starts skips the first draw (CR 103.8a). In a
    // multiplayer Commander game nobody does (103.8c).
    if (!(S.turn === 1 && con)) draw(1);
  };
  const scry = () => {
    const n = Math.min(3, S.lib.length);
    if (!n) return;
    const top = S.lib.slice(-n).reverse(); // top card first
    const bottom = new Set();
    document.getElementById('ptScry')?.remove();
    const m = document.createElement('div');
    m.className = 'deckpick-scrim';
    m.id = 'ptScry';
    m.style.zIndex = 210;
    m.style.alignItems = 'flex-end';
    const draw2 = () => {
      m.innerHTML = /* HTML */ `<div class="deckpick br-sheet pt-menu">
        <div class="br-actions">
          <button type="button" class="primary-btn" id="ptScryOk">${'Done'}</button>
        </div>
        <div class="pt-scry">
          ${top.map((x) => `<button type="button" class="pt-scry-c${bottom.has(x.id) ? ' down' : ''}" data-scry="${x.id}">${tile(x, 'lib')}<span>${bottom.has(x.id) ? 'Bottom' : 'Top'}</span></button>`).join('')}
        </div>
        <div class="br-title">
          <b>Scry ${n}</b><span>${'Tap a card to send it to the bottom. Leftmost is on top.'}</span>
        </div>
      </div>`;
      m.querySelectorAll('[data-scry]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = b.dataset.scry;
          if (bottom.has(id)) bottom.delete(id);
          else bottom.add(id);
          draw2();
        }),
      );
      m.querySelector('#ptScryOk').addEventListener('click', () => brSheetClose('ptScry'));
    };
    draw2();
    brSheetOpen(m, 'ptScry', () => {
      S.lib.splice(S.lib.length - n, n);
      const keep = top.filter((x) => !bottom.has(x.id)),
        down = top.filter((x) => bottom.has(x.id));
      down.forEach((x) => S.lib.unshift(x));
      keep
        .slice()
        .reverse()
        .forEach((x) => S.lib.push(x));
      setTimeout(paint, 0);
    });
  };
  // 1.39: the pile as pictures, three across, newest first: tap = zoom,
  // hold = the card's moves
  const pile = (k) => {
    const a = zones[k]();
    if (!a.length) return;
    document.getElementById('ptPile')?.remove();
    const m = document.createElement('div');
    m.className = 'deckpick-scrim';
    m.id = 'ptPile';
    m.style.zIndex = 210;
    m.style.alignItems = 'flex-end';
    m.innerHTML = /* HTML */ `<div class="deckpick br-sheet pt-menu">
      <div class="pt-pile-grid">
        ${a
          .slice()
          .reverse()
          .map((x) => tile(x, 'pile'))
          .join('')}
      </div>
      <div class="br-title">
        <b>${k === 'gy' ? 'Graveyard' : 'Exile'} · ${a.length}</b
        ><span>${'Tap: zoom · hold: move'}</span>
      </div>
    </div>`;
    let after = null;
    brSheetOpen(m, 'ptPile', () => {
      if (after) {
        const f = after;
        after = null;
        setTimeout(f, 0);
      }
    });
    m.addEventListener('click', (e) => {
      if (e.target === m) brSheetClose('ptPile');
    });
    m.querySelectorAll('.pt-card').forEach((c) => {
      const f = find(c.dataset.ptid);
      if (!f) return;
      ptLongPress(
        c,
        () => {
          try {
            showCardPreview(f.x.c, cardImageLarge(f.x.c));
          } catch (e) {}
        },
        () => {
          after = () => cardMenu(f.x);
          brSheetClose('ptPile');
        },
      );
    });
  };
  const summary = () => {
    const missed = [];
    for (let t = 1; t <= S.turn; t++) if (!S.lands[t]) missed.push(t);
    const L = landsOnBf();
    const dead = S.hand.filter((x) => !ptIsLand(x.c) && ptMv(x.c) > L).map((x) => x.c.name);
    const lines = [
      `Turns played: ${S.turn}`,
      `Lands on the battlefield: ${L}`,
      missed.length ? `Missed a land drop on turn ${missed.join(', ')}` : 'No land drop missed',
      S.cz.length || S.cmdrTurn != null
        ? S.cmdrTurn != null
          ? `Commander cast on turn ${S.cmdrTurn}`
          : 'Commander not cast'
        : '',
      dead.length ? `Still too expensive in hand: ${dead.join(', ')}` : '',
    ].filter(Boolean);
    ptMenu(
      'How did it go?',
      [
        ['again', 'Another game'],
        ['close', 'Close'],
      ],
      (k) => {
        if (k === 'again') {
          fresh();
          paint();
        } else closeTopOverlay();
      },
    );
    const t = document.querySelector('#ptMenu .br-title');
    if (t)
      t.insertAdjacentHTML(
        'beforeend',
        `<ul class="pt-sum">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
      );
  };
  const more = () => {
    const opts = [
      ['scry', 'Scry 3 / look at the top'],
      ['token', 'Make a token'],
      ['shuffle', 'Shuffle library'],
      ['untap', 'Untap all'],
      ['restart', 'Start over'],
      ['end', 'Finish'],
    ];
    ptMenu('More', opts, (k) => {
      if (k === 'scry') scry();
      else if (k === 'shuffle') {
        ptShuffle(S.lib);
        toast('Shuffled.');
      } else if (k === 'untap') {
        S.bf.forEach((x) => {
          x.tapped = false;
        });
        paint();
      } else if (k === 'restart') {
        fresh();
        paint();
      } else if (k === 'end') summary();
      else if (k === 'token') {
        const list = tokenNames
          .map((t) => ['tk:' + t, escapeHtml(t)])
          .concat([['tk:', 'Other token…']]);
        ptMenu('Which token?', list, (tk) => {
          const make = (name) => {
            if (!name) return;
            S.bf.push({ c: { name, token: true, type_line: 'Token' }, id: uid(), tapped: false });
            paint();
          };
          const nm = tk.slice(3);
          if (nm) make(nm);
          else openInAppPrompt('Token', 'E.g. 1/1 Soldier', '', (v) => make((v || '').trim()));
        });
      }
    });
  };
  const wire = () => {
    el.querySelectorAll('.pt-card').forEach((c) => {
      const id = c.dataset.ptid,
        zone = c.dataset.zone;
      const f = find(id);
      if (!f) return;
      const x = f.x;
      if (zone === 'gy') {
        ptDragPress(
          c,
          () => pile('gy'),
          () => cardMenu(x),
          (to) => dropTo(x, 'gy', to),
        );
        return;
      }
      ptDragPress(
        c,
        () => {
          if (zone === 'hand') {
            if (S.phase === 'bottom') {
              take(id);
              S.lib.unshift(x);
              if (--S.bottomNeed <= 0) {
                S.phase = 'play';
                nextTurn();
              }
              paint();
              return;
            }
            if (S.phase !== 'play') return;
            playFromHand(x);
            paint();
          } else if (zone === 'bf') {
            x.tapped = !x.tapped;
            c.classList.toggle('tapped', x.tapped);
          } else if (zone === 'cz') {
            if (S.phase === 'play') {
              castLeader(x);
              paint();
            }
          }
        },
        () => {
          if (S.phase === 'play' || zone !== 'hand') cardMenu(x);
        },
        (to) => dropTo(x, zone, to),
      );
    });
    el.querySelector('.pt-gy')?.addEventListener('click', (e) => {
      if (e.target.closest('.pt-card')) return;
      pile('gy');
    });
    el.querySelector('#ptKeep')?.addEventListener('click', () => {
      S.bottomNeed = Math.max(0, S.mull - (!con ? 1 : 0));
      if (S.bottomNeed > 0) {
        S.phase = 'bottom';
      } else {
        S.phase = 'play';
        nextTurn();
      }
      paint();
    });
    el.querySelector('#ptMull')?.addEventListener('click', () => {
      if (S.mull >= 6) return;
      S.mull++;
      S.lib = ptShuffle(S.lib.concat(S.hand));
      S.hand = [];
      for (let i = 0; i < 7 && S.lib.length; i++) S.hand.push(S.lib.pop());
      paint();
    });
    el.querySelector('#ptDraw')?.addEventListener('click', () => {
      draw(1);
      paint();
    });
    el.querySelector('#ptNext')?.addEventListener('click', () => {
      // 1.39: with Smart on, the opponents take their turns first -- your
      // creatures are still tapped from your turn until you untap after it
      if (ptSmartOn() && S.turn >= 1) {
        runRound(smartRound(), () => {
          nextTurn();
          paint();
        });
        return;
      }
      nextTurn();
      paint();
    });
    el.querySelector('#ptSmart')?.addEventListener('change', (e) => {
      ptSmartSet(e.target.checked);
      if (e.target.checked)
        toast('Smart on: opponents attack, remove and counter by Commander averages.');
    });
    el.querySelector('#ptMore')?.addEventListener('click', more);
    el.querySelectorAll('button[data-ptpile]').forEach((b) =>
      b.addEventListener('click', () => pile(b.dataset.ptpile)),
    );
    el.querySelectorAll('[data-ptlife]').forEach((b) =>
      b.addEventListener('click', () => {
        S.life += +b.dataset.ptlife;
        el.querySelector('.pt-life b').textContent = S.life;
      }),
    );
    const h = el.querySelector('.pt-hand');
    if (h) h.scrollLeft = 0;
  };
  paint();
}

/* 1.50: the card scanner is gone. These name helpers stay -- the AI judge and
   the name matching use them. */
function scanNorm(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let _scanNames = null;

async function scanNameList() {
  if (_scanNames) return _scanNames;
  let ix = null;
  try {
    ix = await bulkIndexReady();
  } catch (e) {}
  if (!ix || !ix.cards || !ix.cards.length) return null;
  const seen = new Set(),
    out = [];
  ix.cards.forEach((c) => {
    const full = String(c.n || '');
    if (!full) return;
    [full, full.split(' // ')[0]].forEach((n) => {
      const k = scanNorm(n);
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push([k, full]);
      }
    });
  });
  return (_scanNames = out);
}

async function scanCardFor(name) {
  try {
    const ix = await bulkIndexReady();
    const bc = ix && ix.byName && ix.byName.get(String(name).toLowerCase());
    if (bc) {
      const c = bulkToCardish(bc);
      if (c) return c;
    }
  } catch (e) {}
  try {
    const r = await sfFetch(
      `${SF_BASE}/cards/named?exact=${encodeURIComponent(name)}`,
      0,
      false,
      false,
      true,
    );
    if (r && r.ok) return await r.json();
  } catch (e) {}
  return null;
}

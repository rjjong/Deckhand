// pages / decklist / matchups

/* ---- Matchups: a sideboard guide per 60-card deck -----------------------
   One plan per opposing deck: how they win, how we play it, what comes in
   and what goes out, loose notes. The record against that deck is read from
   the play log -- a logged game carries the opposing deck's name. */
function deckMatchups(d) {
  if (!Array.isArray(d.matchups)) d.matchups = [];
  return d.matchups;
}

function oppKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function matchupRecord(d, opp) {
  const k = oppKey(opp);
  let w = 0,
    l = 0;
  if (k)
    (d.playLog || []).forEach((g) => {
      if (oppKey(g.opp) === k) {
        if (g.res === 'W') w++;
        else l++;
      }
    });
  return { w, l, n: w + l };
}

function metaArchFor(d, name) {
  const F = metaFormat(deckFormat(d));
  if (!F) return null;
  const k = oppKey(name);
  return F.archetypes.find((a) => oppKey(a.name) === k) || null;
}

/* Suggestions for the opponent field: the deck's own plans first, then the
   format's meta decks, most played first; every typed word must match. */
function oppSuggestions(d, q, limit) {
  const toks = oppKey(q).split(' ').filter(Boolean);
  const seen = new Set(),
    out = [];
  const push = (name, plan) => {
    const k = oppKey(name);
    if (!k || seen.has(k) || !toks.every((t) => k.includes(t))) return;
    seen.add(k);
    out.push({ name, plan, a: metaArchFor(d, name) });
  };
  deckMatchups(d).forEach((m) => push(m.opp, true));
  const F = metaFormat(deckFormat(d));
  (F ? F.archetypes : []).forEach((a) => push(a.name, false));
  return out.slice(0, limit || 8);
}

// Chip rows wrap-reverse: the best suggestion sits bottom-left, next to the field.
function oppChipsHtml(list) {
  return list
    .map(
      (x) =>
        `<button type="button" class="opp-chip${x.plan ? ' plan' : ''}" data-opp="${escapeHtml(x.name)}">${x.a && x.a.colors ? manaRowSvg(x.a.colors, 11) : ''}<span>${escapeHtml(x.name)}</span>${x.a ? `<small>${Number(x.a.share || 0).toFixed(1)}%</small>` : ''}</button>`,
    )
    .join('');
}

function sbLineHtml(arr, sign) {
  return (arr || [])
    .filter((x) => x && x.n > 0)
    .map(
      (x) =>
        `<span class="mu-sb ${sign === '+' ? 'in' : 'out'}">${sign}${x.n} ${escapeHtml(x.name)}</span>`,
    )
    .join('');
}

function sbCount(arr) {
  return (arr || []).reduce((t, x) => t + (x.n || 0), 0);
}

function matchupPanelHtml(d) {
  const list = deckMatchups(d).map((m, i) => ({ m, i, a: metaArchFor(d, m.opp) }));
  // Bottom-up: .mu-list is column-reverse, so the most-played opposing deck
  // (first in the array) lands at the foot, right above the add button.
  list.sort(
    (x, y) => (y.a ? y.a.share : -1) - (x.a ? x.a.share : -1) || x.m.opp.localeCompare(y.m.opp),
  );
  const open = state._muOpen;
  const rows = list
    .map(({ m, i, a }) => {
      const r = matchupRecord(d, m.opp);
      const inN = sbCount(m.in),
        outN = sbCount(m.out);
      const txt = (h, v) =>
        v && v.trim()
          ? `<div class="mu-sec"><div class="mu-sec-h">${trS(h)}</div><div class="mu-txt">${escapeHtml(v.trim()).replace(/\n/g, '<br>')}</div></div>`
          : '';
      const sb =
        inN || outN
          ? `<div class="mu-sec"><div class="mu-sec-h">${trS('Sideboard')}</div><div class="mu-sbline">${sbLineHtml(m.in, '+')}${sbLineHtml(m.out, '−')}</div></div>`
          : '';
      const on = open === m.id;
      // Each row is column-reverse too: the head stays at the row's foot and
      // the plan unfolds ABOVE it.
      return /* HTML */ `<div class="mu-row${on ? ' open' : ''}" data-mu="${escapeHtml(m.id)}">
        <div class="mu-head">
          <span class="glog-res mu-rec ${r.n ? (r.w >= r.l ? 'w' : 'l') : 'none'}"
            >${r.n ? `${r.w}–${r.l}` : '—'}</span
          >
          <span class="mu-name"
            >${a && a.colors ? manaRowSvg(a.colors, 12) : ''}<b>${escapeHtml(m.opp)}</b>${a ? `<small>${Number(a.share || 0).toFixed(1)}%</small>` : ''}</span
          >
          ${inN || outN ? `<span class="mu-count">+${inN}/−${outN}</span>` : ''}
          <span class="mu-chev">${on ? '▴' : '▾'}</span>
        </div>
        <div class="mu-detail">
          ${txt('Their plan', m.theirs)}${txt('Our plan', m.ours)}${sb}${txt('Notes', m.notes)}
          <div class="mu-btns">
            <button type="button" class="ghost-btn" data-muedit="${i}">
              ${inlIco('edit')}${trS('Edit')}</button
            ><button type="button" class="ghost-btn danger-ghost" data-mudel="${i}">
              ${inlIco('trash')}${trS('Delete')}
            </button>
          </div>
        </div>
      </div>`;
    })
    .join('');
  const F = metaFormat(deckFormat(d));
  const quick = !list.length && F ? F.archetypes.slice(0, 6).map((a) => ({ name: a.name, a })) : [];
  return /* HTML */ `<div class="panel-card" id="muPanel">
    <div class="panel-h">${trS('Matchups — sideboard guide')}</div>
    ${list.length ? '' : `<p class="empty-note" style="padding:4px 0 8px;">${trS('One plan per opposing deck: how they win, how you play it, what comes in and what goes out. Games you log against that deck count toward the record.')}</p>`}
    ${quick.length ? `<div class="mu-quick-h">${trS('Most played right now — tap one to start its plan')}</div><div class="opp-chips" id="muQuick">${oppChipsHtml(quick)}</div>` : ''}
    <div class="mu-list">${rows}</div>
    <button class="primary-btn" id="muAddBtn" style="margin-top:8px;">
      ⊕ ${trS('New matchup plan')}
    </button>
  </div>`;
}

function rerenderMatchupPanel(d) {
  const p = document.getElementById('muPanel');
  if (!p) return;
  p.outerHTML = matchupPanelHtml(d);
  wireMatchupPanel(d);
}

function wireMatchupPanel(d) {
  const p = document.getElementById('muPanel');
  if (!p) return;
  p.querySelectorAll('.mu-head').forEach((h) =>
    h.addEventListener('click', () => {
      const row = h.closest('.mu-row');
      const id = row && row.dataset.mu;
      // The tapped head stays under the thumb; the plan grows above it.
      keepAnchored(
        h,
        () => {
          state._muOpen = state._muOpen === id ? null : id;
          p.querySelectorAll('.mu-row').forEach((r) => {
            const on = r.dataset.mu === state._muOpen;
            r.classList.toggle('open', on);
            const c = r.querySelector('.mu-chev');
            if (c) c.textContent = on ? '▴' : '▾';
          });
        },
        () => h,
      );
    }),
  );
  p.querySelectorAll('[data-muedit]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openMatchupEditor(d, +b.dataset.muedit);
    }),
  );
  p.querySelectorAll('[data-mudel]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = +b.dataset.mudel;
      const m = deckMatchups(d)[i];
      if (!m) return;
      openInAppConfirm(
        `${trS('Delete the plan against')} ${m.opp}?`,
        (ok) => {
          if (!ok) return;
          deckMatchups(d).splice(i, 1);
          scheduleSave(d);
          rerenderMatchupPanel(d);
        },
        { danger: true, ok: trS('Delete') },
      );
    }),
  );
  document.getElementById('muAddBtn')?.addEventListener('click', () => openMatchupEditor(d, -1));
  p.querySelectorAll('#muQuick [data-opp]').forEach((b) =>
    b.addEventListener('click', () => openMatchupEditor(d, -1, b.dataset.opp)),
  );
  // The meta list may still be on its way; the quick picks follow it in.
  if (!metaFormat(deckFormat(d)))
    loadMetaData()
      .then(() => {
        if (metaFormat(deckFormat(d)) && document.getElementById('muPanel'))
          rerenderMatchupPanel(d);
      })
      .catch(() => {});
}

function openMatchupEditor(d, idx, presetOpp) {
  document.getElementById('muOverlay')?.remove();
  const src = idx >= 0 ? deckMatchups(d)[idx] : null;
  const local = {
    opp: src ? src.opp : presetOpp || '',
    theirs: src ? src.theirs || '' : '',
    ours: src ? src.ours || '' : '',
    notes: src ? src.notes || '' : '',
    in: new Map(((src && src.in) || []).map((x) => [x.name, x.n])),
    out: new Map(((src && src.out) || []).map((x) => [x.name, x.n])),
    pick: null,
  };
  const uniq = (list) => {
    const m = new Map();
    list.forEach((c) => m.set(c.name, (m.get(c.name) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  };
  const sidePool = uniq(ensureMaybeboard(d)),
    mainPool = uniq(d.cards || []);
  const el = document.createElement('div');
  el.id = 'muOverlay';
  document.body.appendChild(el);
  pushOverlay('matchup', () => {
    document.getElementById('muOverlay')?.remove();
  });
  const asArr = (which) =>
    Array.from(local[which].entries())
      .filter(([, n]) => n > 0)
      .map(([name, n]) => ({ name, n }));
  const tagsHtml = (which) => {
    const arr = asArr(which);
    return arr.length
      ? sbLineHtml(arr, which === 'in' ? '+' : '−')
      : `<span class="hint" style="margin:0;">${trS(which === 'in' ? 'Nothing comes in yet.' : 'Nothing goes out yet.')}</span>`;
  };
  // Bottom-up: the card list is column-reverse (A at its foot) and sits
  // ABOVE its row, because .mu-sbblock is column-reverse as well.
  const pickerHtml = (which) => {
    const pool = which === 'in' ? sidePool : mainPool;
    if (!pool.length)
      return `<div class="hint" style="margin:0;">${trS(which === 'in' ? 'The sideboard is empty — add cards to it first.' : 'The main deck is empty.')}</div>`;
    return `<div class="mu-pick">${pool
      .map(([name, max]) => {
        const n = local[which].get(name) || 0;
        return `<div class="mu-step${n ? ' on' : ''}" data-step="${which}" data-name="${escapeHtml(name)}" data-max="${max}"><span class="mu-step-nm">${escapeHtml(name)}</span><button type="button" class="icon-btn" data-dd="-1">−</button><b>${n}</b><button type="button" class="icon-btn" data-dd="1">+</button></div>`;
      })
      .join('')}</div>`;
  };
  const sbBlock = (which) => `<div class="mu-sbblock" data-sbb="${which}">
      <div class="mu-sbrow"><span class="glog-lbl">${trS(which === 'in' ? 'In' : 'Out')}</span><div class="mu-sbtags" data-tags="${which}">${tagsHtml(which)}</div><button type="button" class="ghost-btn mu-pickbtn" data-pickbtn="${which}">${local.pick === which ? '▾' : '▴'} ${trS('Pick')}</button></div>
      ${local.pick === which ? pickerHtml(which) : ''}
    </div>`;
  const sync = () => {
    local.opp = el.querySelector('#muOpp')?.value ?? local.opp;
    local.theirs = el.querySelector('#muTheirs')?.value ?? local.theirs;
    local.ours = el.querySelector('#muOurs')?.value ?? local.ours;
    local.notes = el.querySelector('#muNotes')?.value ?? local.notes;
  };
  const paintBal = () => {
    const b = el.querySelector('#muBal');
    if (!b) return;
    const i = sbCount(asArr('in')),
      o = sbCount(asArr('out'));
    b.innerHTML =
      i || o
        ? `+${i} / −${o}${i !== o ? ` <span class="bad">· ${trS('in and out differ')}</span>` : ''}`
        : '';
  };
  const paintChips = () => {
    const c = el.querySelector('#muOppChips');
    if (c) c.innerHTML = oppChipsHtml(oppSuggestions(d, local.opp, 8));
  };
  const draw = () => {
    el.innerHTML = /* HTML */ `<div class="glog-sheet">
      <div class="appoint-head">
        <span>⚔ ${trS(src ? 'Matchup plan' : 'New matchup plan')}</span
        ><button class="icon-btn" id="muClose" style="flex:none;">✕</button>
      </div>
      <div class="glog-form">
        <div class="opp-chips" id="muOppChips">
          ${oppChipsHtml(oppSuggestions(d, local.opp, 8))}
        </div>
        <div class="glog-frow">
          <span class="glog-lbl">${trS('Opponent')}</span
          ><input
            id="muOpp"
            type="text"
            class="glog-num"
            maxlength="60"
            enterkeyhint="done"
            autocomplete="off"
            placeholder="${escapeHtml(trS('Their deck, e.g. Izzet Prowess'))}"
            value="${escapeHtml(local.opp)}"
          />
        </div>
        <textarea
          id="muTheirs"
          class="bulk-textarea mu-ta"
          placeholder="${escapeHtml(trS('Their plan — how they win, the cards to watch for'))}"
        >
${escapeHtml(local.theirs)}</textarea>
        <textarea
          id="muOurs"
          class="bulk-textarea mu-ta"
          placeholder="${escapeHtml(trS('Our plan — how to play it: mulligans, what to hold back, when to race'))}"
        >
${escapeHtml(local.ours)}</textarea>
        <div class="mu-sbh">${trS('Sideboard')} <span id="muBal"></span></div>
        ${sbBlock('in')}${sbBlock('out')}
        <textarea
          id="muNotes"
          class="bulk-textarea mu-ta"
          style="min-height:48px;"
          placeholder="${escapeHtml(trS('Notes — on the play vs on the draw, what they side in, …'))}"
        >
${escapeHtml(local.notes)}</textarea>
        <button class="primary-btn" id="muSave">${trS('Save plan')}</button>
      </div>
    </div>`;
    wire();
    paintBal();
  };
  function wire() {
    el.querySelector('#muClose').addEventListener('click', () => history.back());
    const inp = el.querySelector('#muOpp');
    inp.addEventListener('input', () => {
      local.opp = inp.value;
      paintChips();
    });
    el.querySelector('#muOppChips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-opp]');
      if (!c) return;
      local.opp = c.dataset.opp;
      inp.value = local.opp;
      paintChips();
    });
    el.querySelectorAll('[data-pickbtn]').forEach((b) =>
      b.addEventListener('click', () => {
        sync();
        const which = b.dataset.pickbtn;
        keepAnchored(
          b,
          () => {
            local.pick = local.pick === which ? null : which;
            draw();
          },
          () => el.querySelector(`[data-pickbtn="${which}"]`),
        );
      }),
    );
    el.querySelectorAll('[data-step] [data-dd]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const row = btn.closest('[data-step]');
        const which = row.dataset.step,
          name = row.dataset.name,
          max = +row.dataset.max || 1;
        const n = Math.max(0, Math.min(max, (local[which].get(name) || 0) + +btn.dataset.dd));
        local[which].set(name, n);
        row.querySelector('b').textContent = n;
        row.classList.toggle('on', n > 0);
        const t = el.querySelector(`[data-tags="${which}"]`);
        if (t) t.innerHTML = tagsHtml(which);
        paintBal();
      }),
    );
    el.querySelector('#muSave').addEventListener('click', () => {
      sync();
      const opp = local.opp.trim();
      if (!opp) {
        toast(trS('Name the opposing deck first.'));
        el.querySelector('#muOpp')?.focus();
        return;
      }
      const plan = {
        id: src ? src.id : uid(),
        opp,
        theirs: local.theirs.trim(),
        ours: local.ours.trim(),
        notes: local.notes.trim(),
        in: asArr('in'),
        out: asArr('out'),
        t: Date.now(),
      };
      const list = deckMatchups(d);
      let at = src ? idx : list.findIndex((m) => oppKey(m.opp) === oppKey(opp));
      if (at >= 0) list[at] = plan;
      else list.push(plan);
      state._muOpen = plan.id;
      scheduleSave(d);
      history.back();
      setTimeout(() => {
        if (state.builderTab === 'primer') rerenderMatchupPanel(d);
        else if (state.builderTab === 'list') renderBuilderBody(d);
      }, 60);
      toast(trS('Plan saved.'));
    });
  }
  draw();
  // The sheet opens at its foot: the Save button and the sideboard first.
  requestAnimationFrame(() => {
    const sh = el.querySelector('.glog-sheet');
    if (sh) sh.scrollTop = sh.scrollHeight;
  });
  if (!metaFormat(deckFormat(d)))
    loadMetaData()
      .then(paintChips)
      .catch(() => {});
}

/* The 60s have no command zone: the header gives its left half to the
   deck's description and its right half to the play log. */
function bridge60Html(d) {
  const st = logStatsFor(d);
  const recent = (d.playLog || []).slice(-8);
  const mu = deckMatchups(d).length;
  const desc = d.description
    ? escapeHtml(d.description).replace(/\n/g, '<br>')
    : `<span class="hint" style="margin:0;">${trS('No description yet — write one on the Deck Log page.')}</span><button class="icon-btn dl-mini-add" id="descAddBtn" title="${escapeHtml(trS('A few lines about this deck — shown on the Decklist page.'))}">${ICONS.plus}</button>`;
  return /* HTML */ `<div class="dl-bridge dl-bridge-60">
      <div class="dl-bridge-adm dl60-left">
        <div class="dl-desc-text">${desc}</div>
      </div>
      <div class="dl-bridge-desc dl60-log">
        ${recent.length ? `<div class="dl60-form">${recent.map((g) => `<span class="glog-res ${g.res === 'W' ? 'w' : 'l'}">${g.res}</span>`).join('')}</div>` : ''}
        <div class="dl60-wr">
          ${st ? `${trS('Winrate')} <b>${st.winrate}%</b> · ${st.wins}–${st.losses}` : trS('No games logged yet.')}
        </div>
        ${mu ? `<button type="button" class="ghost-btn dl60-mu" id="dl60Mu">⚔ ${mu} ${trS(mu === 1 ? 'matchup plan' : 'matchup plans')}</button>` : ''}
        <button type="button" class="dl60-logrow" id="bridgeLogGame">
          <span class="icon-btn dl-mini-add">${ICONS.plus}</span><span>${trS('Log a game')}</span>
        </button>
      </div>
      <div id="dlPanelBox" class="${dlBoxClass()}">${dlPanelHtml(d)}</div>
    </div>
    <div id="decklistBox">${categorizedListHtml(d)}</div>`;
}

function listTabHtml(d) {
  if (deckIsConstructed(d)) return bridge60Html(d);
  return /* HTML */ `<div class="dl-bridge">
      <div class="dl-bridge-adm">
        ${leaderZoneHtml(d)}
        <div class="dl-leader-cat">${leaderNoun(deckFormat(d), deckLeaders(d).length > 1)}</div>
      </div>
      <div class="dl-bridge-desc">
        ${deckKind(d) === 'cmdr' ? `<div class="dl-bracket" id="dlBracket" title="Estimate from Game Changers and 2-card combos">⚔ Bracket ~${bracketEstimate(d, null).b} · ${bracketEstimate(d, null).gc} GC</div>` : ''}
        <div class="dl-desc-text">
          ${
            d.description
              ? escapeHtml(d.description).replace(/\n/g, '<br>')
              : `<span class="hint" style="margin:0;">${trS('No description yet — write one on the Deck Log page.')}</span><button class="icon-btn dl-mini-add" id="descAddBtn" title="${escapeHtml(trS('A few lines about this deck — shown on the Decklist page.'))}">${ICONS.plus}</button>`
          }
        </div>
        ${(() => {
          const st = logStatsFor(d);
          return /* HTML */ `<div class="dl-winrate">
              <button
                class="icon-btn dl-mini-add"
                id="bridgeLogGame"
                title="${escapeHtml(trS('Log a game'))}"
                style="margin-left:0;"
              >
                ${ICONS.plus}</button
              ><span
                >${st ? `${trS('Winrate')} <b>${st.winrate}%</b> · ${st.wins}–${st.losses}` : trS('No games logged yet.')}</span
              >
            </div>
            <div class="dl-leader-cat" style="visibility:hidden;margin-top:0;" aria-hidden="true">
              &nbsp;
            </div>`;
        })()}
      </div>
      <div id="dlPanelBox" class="${dlBoxClass()}">${dlPanelHtml(d)}</div>
    </div>
    <div id="decklistBox">${categorizedListHtml(d)}</div>`;
}

/* Live deck filter: every field empty → null (no filtering). Missing card
   fields are backfilled from the local bulk index, tags from the global
   registry plus the Scryfall memberships — all offline. */
function _deckFilterPredicate(d, f) {
  if (!f) return null;
  const has = (v) => v != null && String(v).trim() !== '';
  if (!(
    has(f.name) ||
    has(f.text) ||
    has(f.type) ||
    has(f.tag) ||
    has(f.mvVal) ||
    (f.ci && f.ci.length)
  ))
    return null;
  const ix = _bulkIdx;
  const low = (v) => String(v || '').toLowerCase();
  // Word-based matching like the Search page: every word must appear, in
  // any order — and text/type words must be COMPLETE words (plus their
  // s/es/ed/ing endings), so "car" no longer catches "card". Names keep
  // loose substring tokens: a half-typed name should still find its card.
  const toks = (v) => low(v).split(/\s+/).filter(Boolean);
  const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRe = (t) => new RegExp('\\b' + escRe(t) + '(s|es|ed|ing)?\\b');
  const nameQ = toks(f.name),
    textQ = toks(f.text).map(wordRe),
    typeQ = toks(f.type).map(wordRe),
    tagQ = low(f.tag);
  return (c) => {
    const e = ix && ix.byName ? ix.byName.get(low(c.name)) : null;
    if (nameQ.length && !nameQ.every((t) => low(c.name).includes(t))) return false;
    if (typeQ.length) {
      const tl = low(c.type_line || (e && e.tl));
      if (!typeQ.every((re) => re.test(tl))) return false;
    }
    if (textQ.length) {
      const ot = low(
        c.oracle_text ||
          (c.card_faces && c.card_faces.map((x) => x.oracle_text || '').join(' ')) ||
          (e && e.ot) ||
          (e && e.f && e.f.map((x) => x.ot || '').join(' ')),
      );
      if (!textQ.every((re) => re.test(ot))) return false;
    }
    if (f.ci && f.ci.length) {
      const raw =
        c.color_identity && c.color_identity.join ? c.color_identity.join('') : (e && e.ci) || '';
      const set = raw.toUpperCase();
      for (const col of f.ci) {
        if (col === 'C') {
          if (set !== '') return false;
        } else if (!set.includes(col)) return false;
      }
    }
    if (has(f.mvVal)) {
      const mv = c.cmc != null ? c.cmc : e ? e.mv || 0 : null;
      if (mv == null) return false;
      const v = +f.mvVal;
      const op = f.mvOp || '=';
      if (op === '<=' ? !(mv <= v) : op === '>=' ? !(mv >= v) : mv !== v) return false;
    }
    if (tagQ) {
      const user = getCardTags(d, c.name).map(low);
      let auto = [];
      if (e && e.o && ix.tagByOid) {
        auto = ix.tagByOid.get(e.o) || [];
      }
      if (!user.some((t) => t.includes(tagQ)) && !auto.some((t) => low(t).includes(tagQ)))
        return false;
    }
    return true;
  };
}

function dlPanelHtml(d) {
  if (state.dlPanel === 'bulk') {
    const lines = [];
    if (d.admiral) lines.push(leaderLineLabel(d) + ': ' + d.admiral.name);
    if (d.partner) lines.push('PARTNER: ' + d.partner.name);
    {
      const m = new Map();
      d.cards.forEach((c) => m.set(c.name, (m.get(c.name) || 0) + 1));
      m.forEach((q, n) => lines.push((q > 1 ? q + ' ' : '') + n));
    }
    {
      const mb = ensureMaybeboard(d);
      if (mb.length) {
        lines.push('', deckIsConstructed(d) ? 'SIDEBOARD:' : 'MAYBEBOARD:');
        const mm = new Map();
        mb.forEach((c) => mm.set(c.name, (mm.get(c.name) || 0) + 1));
        mm.forEach((q, n) => lines.push((q > 1 ? q + ' ' : '') + n));
      }
    }
    return /* HTML */ `<div class="panel-card">
      <div class="panel-h" style="display:flex;align-items:center;">
        <span>Bulk Edit</span><button type="button" class="icon-btn dl-panel-x">✕</button>
      </div>
      <textarea id="bulkText" class="bulk-textarea">${lines.join('\n')}</textarea>
      <button class="primary-btn" id="applyBulkBtn">Check &amp; Save Changes</button>
      <div id="bulkReport"></div>
    </div>`;
  }
  if (state.dlPanel === 'dsearch') {
    const f = state.dlFilter || (state.dlFilter = { ci: [] });
    // Row-for-row the Collection's Advanced filter: labels down the left,
    // fields on the right, the hand-drawn mana icons as checkboxes, and the
    // ≤/=/≥ choice as a page-style dropdown — one filter language app-wide.
    const colorOrder = ['W', 'U', 'B', 'R', 'G', 'C'];
    // 1.35: no Name field -- "Find in deck" in the dock already searches names
    if (f.name) f.name = '';
    return /* HTML */ `<div
      class="panel-card df-compact"
      style="display:flex;flex-direction:column-reverse;"
    >
      ${advGoHtml('dfGo')}
      <div class="adv-row">
        <label>${trS('Oracle text')}${advInfo('oracle')}</label
        ><input
          id="dfText"
          class="col-filter-input"
          placeholder="${trS('Any text, e.g. draw a card')}"
          value="${escapeHtml(f.text || '')}"
          autocomplete="off"
        />
      </div>
      <div class="adv-row">
        <label>Type</label
        ><input
          id="dfType"
          class="col-filter-input"
          placeholder="${trS('e.g. Dragon, Equipment')}"
          value="${escapeHtml(f.type || '')}"
          autocomplete="off"
        />
      </div>
      <div class="adv-row">
        <label>${trS('Colors')}${advInfo('deckColors')}</label>
        <div class="color-check-row">
          ${colorOrder.map((c) => `<label class="ccheck"><input type="checkbox" data-dfci="${c}" ${f.ci && f.ci.includes(c) ? 'checked' : ''}><span class="mana-check">${manaIconSvg(c, 26)}</span></label>`).join('')}
        </div>
      </div>
      <div class="adv-row">
        <label>${trS('Mana Value')}</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <div style="flex:0 0 92px;">
            ${cselectHtml(
              'dfMvOp',
              [
                { v: '<=', l: '≤' },
                { v: '=', l: '=' },
                { v: '>=', l: '≥' },
              ],
              f.mvOp || '<=',
              '≤',
            )}
          </div>
          <input
            id="dfMvVal"
            class="col-filter-input"
            type="number"
            inputmode="numeric"
            style="flex:1;"
            value="${escapeHtml(f.mvVal || '')}"
          />
        </div>
      </div>
      <div class="adv-row">
        <label>Tag${advInfo('tag')}</label>
        <div class="otag-wrap">
          <input
            id="dfTag"
            class="col-filter-input"
            placeholder="Tag…"
            value="${escapeHtml(f.tag || '')}"
            autocomplete="off"
          />
          <div id="dfTagPop" class="otag-pop" hidden></div>
        </div>
      </div>
      <div class="panel-h" style="display:flex;align-items:center;">
        <span>${trS('Search deck')}</span
        ><button type="button" class="icon-btn dl-panel-x">✕</button>
      </div>
    </div>`;
  }
  if (state.dlPanel === 'impexp') {
    // First question first: which way is the list traveling? The choice
    // opens just that half — no more scrolling past export to reach import.
    return /* HTML */ `<div class="panel-card">
      <div class="panel-h" style="display:flex;align-items:center;">
        <span>Import / Export</span><button type="button" class="icon-btn dl-panel-x">✕</button>
      </div>
      <button
        class="ghost-btn"
        id="ieChooseExport"
        style="width:100%;padding:16px 10px;font-size:15px;"
      >
        ⬆ ${trS('Export')}
      </button>
      <button
        class="ghost-btn"
        id="ieChooseImport"
        style="width:100%;margin-top:10px;padding:16px 10px;font-size:15px;"
      >
        ⬇ ${trS('Import')}
      </button>
    </div>`;
  }
  if (state.dlPanel === 'import') {
    return /* HTML */ `<div class="panel-card">
      <div class="panel-h" style="display:flex;align-items:center;">
        <span>Import Deck</span><button type="button" class="icon-btn dl-panel-x">✕</button>
      </div>
      <textarea
        id="importText"
        class="bulk-textarea"
        placeholder="${leaderLineLabel(d)}: ${deckFormat(d) === 'commander' ? "Atraxa, Praetors' Voice" : 'Admiral Beckett Brass'}&#10;Sol Ring&#10;..."
      ></textarea>
      <input type="file" id="importFile" accept=".txt,.dec,text/plain" style="display:none;" />
      <button class="ghost-btn" id="importFileBtn" style="width:100%;margin:8px 0 2px;">
        ${inlIco('file')}${trS('Load a .txt file')}
      </button>
      <button class="primary-btn danger-fill" id="applyImportBtn">Replace Deck</button>
      <div id="importReport"></div>
    </div>`;
  }
  if (state.dlPanel === 'export') {
    const fmt = state.exportFmt || 'plain';
    const text = buildExport(d, fmt);
    return /* HTML */ `<div class="panel-card">
      <div class="panel-h" style="display:flex;align-items:center;">
        <span>Export Deck</span><button type="button" class="icon-btn dl-panel-x">✕</button>
      </div>
      <div class="seg" style="margin-bottom:10px;">
        ${EXPORT_FORMATS.map((f) => `<button data-expfmt="${f.key}" class="${fmt === f.key ? 'active' : ''}">${f.label}</button>`).join('')}
      </div>
      <textarea class="bulk-textarea" id="exportText" readonly>${escapeHtml(text)}</textarea>
      <div class="action-row">
        <button class="ghost-btn" id="copyExport">Copy</button
        ><button class="ghost-btn" id="proxyExport">${inlIco('printer')}Proxies</button
        ><button class="ghost-btn" id="downloadExport">Download .${exportExt(fmt)}</button>
      </div>
    </div>`;
  }
  return '';
}

const EXPORT_FORMATS = [
  { key: 'moxfield', label: 'Moxfield' },
  { key: 'cockatrice', label: 'Cockatrice' },
  { key: 'plain', label: 'Plain' },
];

function buildExport(d, fmt) {
  const mb = d.maybeboard || [];
  if (fmt === 'moxfield') {
    const lines = [];
    if (d.admiral) lines.push(`1 ${d.admiral.name} *CMDR*`);
    if (d.partner) lines.push(`1 ${d.partner.name} *CMDR*`);
    d.cards.forEach((c) => lines.push(`1 ${c.name}`));
    if (mb.length) {
      lines.push('', 'SIDEBOARD:');
      mb.forEach((c) => lines.push(`1 ${c.name}`));
    }
    return lines.join('\n');
  }
  if (fmt === 'cockatrice') {
    const esc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const rows = [];
    rows.push('<?xml version="1.0" encoding="UTF-8"?>');
    rows.push('<cockatrice_deck version="1">');
    rows.push(`  <deckname>${esc(d.name || 'Deckhand deck')}</deckname>`);
    rows.push(`  <comments>${esc((d.primer || '').slice(0, 500))}</comments>`);
    rows.push('  <zone name="main">');
    if (d.admiral) rows.push(`    <card number="1" price="0" name="${esc(d.admiral.name)}"/>`);
    if (d.partner) rows.push(`    <card number="1" price="0" name="${esc(d.partner.name)}"/>`);
    d.cards.forEach((c) => rows.push(`    <card number="1" price="0" name="${esc(c.name)}"/>`));
    rows.push('  </zone>');
    if (mb.length) {
      rows.push('  <zone name="side">');
      mb.forEach((c) => rows.push(`    <card number="1" price="0" name="${esc(c.name)}"/>`));
      rows.push('  </zone>');
    }
    rows.push('</cockatrice_deck>');
    return rows.join('\n');
  }
  // The 60s travel with their sideboard, the way MTGO and Arena write it:
  // a blank line, then "Sideboard", then the fifteen.
  const sideLines = (lines) => {
    if (!deckIsConstructed(d) || !mb.length) return;
    const m = new Map();
    mb.forEach((c) => m.set(c.name, (m.get(c.name) || 0) + 1));
    lines.push('', 'Sideboard');
    m.forEach((q, n) => lines.push(q + ' ' + n));
  };
  if (fmt === 'plain') {
    const lines = [];
    if (d.admiral) lines.push(d.admiral.name);
    if (d.partner) lines.push(d.partner.name);
    {
      const m = new Map();
      d.cards.forEach((c) => m.set(c.name, (m.get(c.name) || 0) + 1));
      m.forEach((q, n) => lines.push((q > 1 || deckIsConstructed(d) ? q + ' ' : '') + n));
    }
    sideLines(lines);
    return lines.join('\n');
  }
  const lines = [];
  if (d.admiral) lines.push(leaderLineLabel(d) + ': ' + d.admiral.name);
  if (d.partner) lines.push('PARTNER: ' + d.partner.name);
  {
    const m = new Map();
    d.cards.forEach((c) => m.set(c.name, (m.get(c.name) || 0) + 1));
    m.forEach((q, n) => lines.push((q > 1 || deckIsConstructed(d) ? q + ' ' : '') + n));
  }
  sideLines(lines);
  return lines.join('\n');
}

function exportExt(fmt) {
  return fmt === 'cockatrice' ? 'cod' : 'txt';
}

function sortIdxs(idxs, cards, mode) {
  const byNameOnly = mode === 'type-name' || mode === 'name';
  return idxs.sort((a, b) =>
    byNameOnly
      ? cards[a].name.localeCompare(cards[b].name)
      : (cards[a].cmc || 0) - (cards[b].cmc || 0) || cards[a].name.localeCompare(cards[b].name),
  );
}

function groupPriceLabel(cards) {
  const now = Date.now();
  let total = 0,
    complete = true;
  const seen = new Set();
  cards.forEach((c) => {
    if (seen.has(c.name)) return;
    seen.add(c.name);
    const hit = state.priceCache[c.name];
    if (hit && now - hit.t < PRICE_TTL) {
      if (typeof hit.v === 'number') total += hit.v;
    } else complete = false;
  });
  return complete ? fmtEur(total) : '';
}

function dlEmptyAddHtml(d) {
  return /* HTML */ `<div class="dl-empty-add">
    <button
      type="button"
      class="deck-fab dl-empty-plus"
      id="dlEmptyAdd"
      aria-label="${'Add cards'}"
    >
      ＋
    </button>
    <div class="dl-empty-t">${'Add some cards'}</div>
    <div class="dl-empty-s">
      ${'Search adds them straight to'}
      <strong>${escapeHtml(d.name || '')}</strong>
    </div>
  </div>`;
}

/* Search, pinned to this deck: every card added there goes straight in. */
function openAddCardsFor(d) {
  if (!d) return;
  // Pin: every card added during *this* visit to Search goes straight into
  // this deck. The pin dissolves as soon as the user navigates elsewhere.
  state.searchPinnedDeckId = d.id;
  state._pinArm = true;
  state.searchFormat = deckFormat(d); // search pre-filters on this deck's format
  switchPage('search');
}

function categorizedListHtml(d) {
  ensureMaybeboard(d);
  // Instant deck search from the dock: an active query narrows every group
  // to matching names — main and maybeboard alike — with REAL indexes kept
  // (tile actions keep pointing at the true deck slots), groups forced open
  // and empty ones hidden while the search is live.
  const _dlq = (state.dlSearchQ || '').trim().toLowerCase();
  const _fPred =
    (state.dlPanel === 'dsearch' || state.dlSearchOpen) && state.dlFilterOn
      ? _deckFilterPredicate(d, state.dlFilter)
      : null;
  const _dlLive = !!(_dlq || _fPred);
  const _dlMain = (idxs) =>
    !_dlLive
      ? idxs
      : idxs.filter((i) => {
          const c = d.cards[i];
          if (!c) return false;
          if (_dlq && !c.name.toLowerCase().includes(_dlq)) return false;
          if (_fPred && !_fPred(c)) return false;
          return true;
        });
  // An empty main deck: one big + in the free room (DOM-first in the
  // reversed box = right above the leader strip), the same errand as the
  // dock's small + -- Search, adding straight into this deck.
  const _emptyAdd = !d.cards.length && !_dlLive ? dlEmptyAddHtml(d) : '';
  if (!d.cards.length && !d.admiral && !d.maybeboard.length) return _emptyAdd;
  let html = _emptyAdd;

  const grouped =
    state.sortMode === 'type-cmc-name' || state.sortMode === 'type-name' || !state.sortMode;
  if (state.sortMode === 'tags') {
    // Group by tag. A card carrying several tags shows up under each of them,
    // so a group's count reflects how many cards wear that tag.
    const tagNames = allDeckTags(d);
    const byTag = {};
    tagNames.forEach((t) => (byTag[t] = []));
    const untagged = [];
    d.cards.forEach((c, i) => {
      const tags = getCardTags(d, c.name);
      if (!tags.length) {
        untagged.push(i);
        return;
      }
      tags.forEach((t) => {
        if (!byTag[t]) byTag[t] = [];
        byTag[t].push(i);
      });
    });
    const groups = tagNames.map((t) => [t, byTag[t]]).filter((g) => g[1].length);
    if (untagged.length) groups.push(['Untagged', untagged]);
    if (!groups.length) {
      html += `<div class="empty-note">No tags yet. Tap a card and use <strong>Tags</strong> to label it — then this view groups your deck by those tags.</div>`;
    }
    groups.forEach(([tag, idxs]) => {
      const sorted = _dlMain(sortIdxs(idxs.slice(), d.cards, 'cmc-name'));
      if (!sorted.length) return;
      const key = 'tag:' + tag;
      const collapsed = _dlq ? false : !!state.collapsed[key];
      html += `<div class="cat-group">
        <div class="cat-head ${collapsed ? 'collapsed' : ''}" data-cat="${escapeHtml(key)}"><span class="t">${escapeHtml(tag)}</span><span class="cat-price">${groupPriceLabel(sorted.map((i) => d.cards[i]))}</span><span class="n">${sorted.length}</span><span class="car">▾</span></div>
        <div class="cat-body ${collapsed ? 'collapsed' : ''}">${dlGroupGridHtml(dedupeIdxs(sorted, d.cards), d.cards, 'main')}</div>
      </div>`;
    });
  } else if (grouped) {
    const byCat = {};
    catsFor(d).forEach((c) => (byCat[c] = []));
    d.cards.forEach((c, i) => byCat[categoryOf(c, d)].push(i));
    catsFor(d).forEach((cat) => {
      let idxs = byCat[cat];
      if (!idxs.length) return;
      idxs = _dlMain(sortIdxs(idxs, d.cards, state.sortMode));
      if (!idxs.length) return;
      const collapsed = _dlq ? false : !!state.collapsed[cat];
      // The Lands header counts PURE lands; modal double-faced cards filed
      // under their nonland front add a note: 36 (40 incl. 4 mdfc).
      let nLabel = String(idxs.length);
      if (cat === 'Lands' && !_dlq) {
        const mdfcN = d.cards.filter((c) => {
          const f = (c.type_line || '').split('//');
          return (
            f.length > 1 && !f[0].includes('Land') && f.slice(1).some((x) => x.includes('Land'))
          );
        }).length;
        if (mdfcN) nLabel = `${idxs.length} (${idxs.length + mdfcN} incl. ${mdfcN} mdfc)`;
      }
      html += `<div class="cat-group">
        <div class="cat-head ${collapsed ? 'collapsed' : ''}" data-cat="${cat}"><span class="t">${cat}</span><span class="cat-price">${groupPriceLabel(idxs.map((i) => d.cards[i]))}</span><span class="n">${nLabel}</span><span class="car">▾</span></div>
        <div class="cat-body ${collapsed ? 'collapsed' : ''}">${dlGroupGridHtml(dedupeIdxs(idxs, d.cards), d.cards, 'main')}</div>
      </div>`;
    });
  } else if (d.cards.length) {
    let idxs = _dlMain(
      sortIdxs(
        d.cards.map((_, i) => i),
        d.cards,
        state.sortMode,
      ),
    );
    if (!idxs.length) idxs = [];
    const collapsed = _dlq ? false : !!state.collapsed['AllCards'];
    html += `<div class="cat-group">
      <div class="cat-head ${collapsed ? 'collapsed' : ''}" data-cat="AllCards"><span class="t">All Cards</span><span class="cat-price">${groupPriceLabel(idxs.map((i) => d.cards[i]))}</span><span class="n">${idxs.length}</span><span class="car">▾</span></div>
      <div class="cat-body ${collapsed ? 'collapsed' : ''}">${dlGroupGridHtml(dedupeIdxs(idxs, d.cards), d.cards, 'main')}</div>
    </div>`;
  }

  if (d.maybeboard.length) {
    let mIdxs = d.maybeboard
      .map((_, i) => i)
      .sort((a, b) => d.maybeboard[a].name.localeCompare(d.maybeboard[b].name));
    if (_dlq) mIdxs = mIdxs.filter((i) => d.maybeboard[i].name.toLowerCase().includes(_dlq));
    if (mIdxs.length) {
      if (!('Maybeboard' in state.collapsed)) state.collapsed['Maybeboard'] = true; // closed until opened
      // A sideboard is part of the deck, not a pile of maybes: it starts open.
      const collapsed = _dlq
        ? false
        : deckIsConstructed(d)
          ? !!state.collapsed['Sideboard']
          : !!state.collapsed['Maybeboard'];
      html += `<div class="cat-group">
        <div class="cat-head ${collapsed ? 'collapsed' : ''}" data-cat="${deckIsConstructed(d) ? 'Sideboard' : 'Maybeboard'}"><span class="t">${trS(sideName(d))}</span><span class="cat-price">${groupPriceLabel(mIdxs.map((i) => d.maybeboard[i]))}</span><span class="n">${mIdxs.length}</span><span class="car">▾</span></div>
        <div class="cat-body ${collapsed ? 'collapsed' : ''}">${dlGroupGridHtml(dedupeIdxs(mIdxs, d.maybeboard), d.maybeboard, 'maybe')}</div>
      </div>`;
    }
  }
  if (_dlLive && !html)
    html = `<div class="empty-note">${trS('No cards match')}${_dlq ? ` “${escapeHtml(state.dlSearchQ)}”` : ' ' + trS('these filters').trim()}.</div>`;
  return html;
}

/* The on-screen order of a deck's tiles, as raw array indices — the same
   branch logic the list tab renders with (tag groups / type groups / flat,
   duplicates collapsed). Card-sheet navigation walks THIS, so swipe and
   chevrons move by visual proximity, exactly as the grid reads. */
function displayOrderIdxs(d, loc) {
  if (loc === 'maybe') {
    const mIdxs = d.maybeboard
      .map((_, i) => i)
      .sort((a, b) => d.maybeboard[a].name.localeCompare(d.maybeboard[b].name));
    return dedupeIdxs(mIdxs, d.maybeboard).map((g) => g.i);
  }
  const out = [];
  const grouped =
    state.sortMode === 'type-cmc-name' || state.sortMode === 'type-name' || !state.sortMode;
  if (state.sortMode === 'tags') {
    const tagNames = allDeckTags(d);
    const byTag = {};
    tagNames.forEach((t) => (byTag[t] = []));
    const untagged = [];
    d.cards.forEach((c, i) => {
      const tags = getCardTags(d, c.name);
      if (!tags.length) {
        untagged.push(i);
        return;
      }
      tags.forEach((t) => {
        if (!byTag[t]) byTag[t] = [];
        byTag[t].push(i);
      });
    });
    const groups = tagNames.map((t) => byTag[t]).filter((a) => a.length);
    if (untagged.length) groups.push(untagged);
    groups.forEach((idxs) => {
      dedupeIdxs(sortIdxs(idxs.slice(), d.cards, 'cmc-name'), d.cards).forEach((g) =>
        out.push(g.i),
      );
    });
  } else if (grouped) {
    const byCat = {};
    catsFor(d).forEach((c) => (byCat[c] = []));
    d.cards.forEach((c, i) => byCat[categoryOf(c, d)].push(i));
    catsFor(d).forEach((cat) => {
      const idxs = byCat[cat];
      if (!idxs.length) return;
      dedupeIdxs(sortIdxs(idxs, d.cards, state.sortMode), d.cards).forEach((g) => out.push(g.i));
    });
  } else {
    dedupeIdxs(
      sortIdxs(
        d.cards.map((_, i) => i),
        d.cards,
        state.sortMode,
      ),
      d.cards,
    ).forEach((g) => out.push(g.i));
  }
  return out;
}

function dedupeIdxs(idxs, arr) {
  // Collapse identical names into one tile carrying a quantity — basics and
  // any-number cards render Moxfield-style instead of as a wall of twins.
  const seen = new Map();
  const out = [];
  idxs.forEach((i) => {
    const n = arr[i].name;
    if (seen.has(n)) out[seen.get(n)].qty++;
    else {
      seen.set(n, out.length);
      out.push({ i, qty: 1 });
    }
  });
  return out;
}

/* The deck's cards as tiles (default), Moxfield-style stacks, or a text
   list -- picked from the \u22EF menu, remembered on this phone. */
function dlView() {
  // 1.26: on a wide screen a deck without a stored choice opens as stacks in
  // columns, Moxfield-style; a phone keeps the tiles.
  let v = null;
  try {
    v = localStorage.getItem(LS_PREFIX + 'dlView');
  } catch (e) {}
  if (v === 'stack' || v === 'text' || v === 'grid') return v;
  try {
    if (window.matchMedia('(min-width: 1000px)').matches) return 'stack';
  } catch (e) {}
  return 'grid';
}

function setDlView(v) {
  try {
    localStorage.setItem(LS_PREFIX + 'dlView', v);
  } catch (e) {}
}

function dlGroupGridHtml(groups, arr, loc) {
  const v = dlView();
  // Stack: the group's FIRST card is the bottom one, shown whole; every next
  // card peeks out above it by its name bar (later DOM paints on top, so the
  // list is written last-to-first).
  if (v === 'stack')
    return /* HTML */ `<div class="visual-grid vg-stack">
      ${(isDesk() ? groups.slice() : groups.slice().reverse()).map((g) => cardTileHtml(arr[g.i], g.i, loc, g.qty)).join('')}
    </div>`;
  if (v === 'text')
    return /* HTML */ `<div class="visual-grid vg-text">
      ${groups.map((g) => cardRowHtml(arr[g.i], g.i, loc, g.qty)).join('')}
    </div>`;
  return /* HTML */ `<div class="visual-grid">
    ${groups.map((g) => cardTileHtml(arr[g.i], g.i, loc, g.qty)).join('')}
  </div>`;
}

function costPipsHtml(card) {
  const raw = rawManaCost(card);
  if (!raw) return '';
  return (raw.match(/\x7b[^\x7d]+\x7d/g) || [])
    .map((t) => {
      const k = t.slice(1, -1).toUpperCase();
      if (/^[WUBRGC]$/.test(k)) return manaIconSvg(k, 16);
      const parts = k.split('/');
      if (parts.length === 2) return manaHybridSvg(parts[0], parts[1], 16);
      return manaGenericSvg(k, 16);
    })
    .join('');
}

/* Symbols the card-symbol set draws beyond the five colours, built from the
   same glyphs: a grey numbered pip (2, X, S), a hybrid pip split diagonally
   into its two colours (W/U, B/G, 2/W), and a Phyrexian pip (colour + \u03A6). */
function manaGenericSvg(k, px) {
  const t = escapeHtml(String(k));
  const fs = t.length > 1 ? 15 : 20;
  return `<svg class="mana-ic" width="${px}" height="${px}" viewBox="0 0 32 32" aria-label="${t}"><circle cx="16" cy="16" r="15" fill="#CFC9C2" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/><text x="16" y="16.5" text-anchor="middle" dominant-baseline="central" font-family="Inter, sans-serif" font-weight="800" font-size="${fs}" fill="#130c0e">${t}</text></svg>`;
}

function manaHybridSvg(a, b, px) {
  const bgOf = (x) => (MANA_GLYPHS[x] ? MANA_GLYPHS[x].bg : '#CFC9C2');
  if (b === 'P') {
    return `<svg class="mana-ic" width="${px}" height="${px}" viewBox="0 0 32 32" aria-label="${escapeHtml(a)}/P"><circle cx="16" cy="16" r="15" fill="${bgOf(a)}" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/><g fill="none" stroke="#130c0e" stroke-width="2.6"><ellipse cx="16" cy="16" rx="7" ry="5.6"/><path d="M16 7v18"/></g></svg>`;
  }
  const glyph = (x, cx) =>
    MANA_GLYPHS[x]
      ? `<g transform="translate(${cx} ${cx}) scale(0.4) translate(-16 -16)"><path fill="#130c0e" d="${MANA_GLYPHS[x].d}"/></g>`
      : `<text x="${cx}" y="${cx + 0.5}" text-anchor="middle" dominant-baseline="central" font-family="Inter, sans-serif" font-weight="800" font-size="12" fill="#130c0e">${escapeHtml(x)}</text>`;
  // The diagonal runs bottom-left to top-right: first colour top-left.
  return (
    `<svg class="mana-ic" width="${px}" height="${px}" viewBox="0 0 32 32" aria-label="${escapeHtml(a)}/${escapeHtml(b)}">` +
    `<path d="M5.4 26.6A15 15 0 0 1 26.6 5.4Z" fill="${bgOf(a)}"/><path d="M26.6 5.4A15 15 0 0 1 5.4 26.6Z" fill="${bgOf(b)}"/>` +
    `<circle cx="16" cy="16" r="15" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>` +
    glyph(a, 10.6) +
    glyph(b, 21.4) +
    `</svg>`
  );
}

function cardRowHtml(card, idx, loc, qty) {
  const _rd = getDeck(state.activeDeckId);
  const _v = !_rd
    ? 'legal'
    : deckFormat(_rd) === 'commander'
      ? commanderVerdict(card)
      : deckIsConstructed(_rd)
        ? fmtVerdict(card, deckFormat(_rd))
        : 'legal';
  const _ill = _v === 'banned' || _v === 'not_legal';
  const hit = state.priceCache && state.priceCache[card.name];
  const pv = hit && typeof hit.v === 'number' ? fmtEur(hit.v) : '';
  return /* HTML */ `<div
    class="vg-card vg-row${_ill ? ' vg-illegal' : ''}"
    data-idx="${idx}"
    data-loc="${loc}"
  >
    <button type="button" class="vg-hit" data-himg="${escapeHtml(cardImageMed(card))}">
      <span class="vr-q">${qty || 1}</span><span class="vr-n">${escapeHtml(card.name)}</span
      ><span class="vr-cost">${costPipsHtml(card)}</span><span class="vr-p">${pv}</span>
    </button>
  </div>`;
}

function cardTileHtml(card, idx, loc, qty) {
  // No quick-remove cross on tiles: it was too easy to hit by accident.
  // Removing a card is a deliberate act — tap the card, then Remove.
  // A card the format check would flag (banned, or not legal and not a
  // preview) trades its gold rim for a clearly red one.
  const _rd = getDeck(state.activeDeckId);
  const _v = !_rd
    ? 'legal'
    : deckFormat(_rd) === 'commander'
      ? commanderVerdict(card)
      : deckIsConstructed(_rd)
        ? fmtVerdict(card, deckFormat(_rd))
        : 'legal';
  const _ill = _v === 'banned' || _v === 'not_legal';
  return /* HTML */ `<div
    class="vg-card${_ill ? ' vg-illegal' : ''}"
    data-idx="${idx}"
    data-loc="${loc}"
  >
    <img
      class="${wbClass(card)}"
      src="${cardImageMed(card)}"
      alt="${escapeHtml(card.name)}"
    />${qty && qty > 1 ? `<span class="vg-qty">×${qty}</span>` : ''}${cardBadgesHtml(card)}${gcMarkHtml(card)}
  </div>`;
}

/* Open or close a stats drill-down without moving what was tapped: the list
   grows UPWARD from it (bottom-up), the tapped symbol or bar stays put. */
function statKeepPlace(anchor, fn) {
  const t0 = anchor ? anchor.getBoundingClientRect().top : null;
  fn();
  if (anchor && t0 != null) {
    const dy = anchor.getBoundingClientRect().top - t0;
    if (Math.abs(dy) > 1) pageScroller().scrollBy(0, dy);
  }
}

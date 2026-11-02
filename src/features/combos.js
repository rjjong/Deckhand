// features / combos

/* One theme page's full card membership, week-cached like everything EDHREC. */
/* EDHREC's community salt score (0–4), read from the same week-cached
   card page the ranking already uses. Null when unknown — shown nowhere. */
const MANA_INF =
  '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M21.482 12.75q-0.761 0.488-1.779 1.296t-2.17 1.916q2.14 2.16 3.939 3.222t3.199 1.061q0.967 0 1.79-0.348t1.43-0.958 0.957-1.409 0.35-1.7-0.35-1.644-0.967-1.277-1.461-0.836-1.851-0.301q-1.481 0-3.086 0.977zM7.514 20.246q1.481 0 3.261-1.024t3.775-3.090q-2.037-2.179-3.888-3.269t-3.456-1.090q-0.967 0-1.78 0.329t-1.399 0.892-0.915 1.315-0.329 1.597q0 0.902 0.36 1.691t0.998 1.381 1.502 0.93 1.872 0.338zM7.144 9.425q4.361 0 8.969 4.884 1.358-1.315 2.633-2.311t2.242-1.522q0.988-0.526 2.037-0.789t2.078-0.263q1.481 0 2.746 0.488t2.191 1.353 1.44 2.076 0.514 2.639q0 1.447-0.566 2.658t-1.574 2.085-2.397 1.362-3.014 0.488q-1.913 0-4.053-1.174t-4.505-3.522q-2.304 2.348-4.526 3.522t-4.402 1.174q-1.461 0-2.726-0.507t-2.212-1.381-1.481-2.067-0.535-2.583q0-1.409 0.555-2.621t1.522-2.095 2.273-1.39 2.787-0.507z"></path></svg>';

/* ── The ∞ combos button ─ always in the card view's name bar, top right.
   Rides the FAST combo lane (never the slow full index — the old sin).
   Shows the count of the card's 2–4 card combos; a tap opens the combo
   page, or — at zero — says so in a toast. DFC names fall back to the
   front face. */
function wireCombosButton(el, card) {
  (async () => {
    const b = el.querySelector('[data-cmbbtn]');
    if (!b) return;
    try {
      const ix = await combosReady();
      let list = combosWithCard(ix, card.name) || [];
      if (!list.length && String(card.name).includes(' // '))
        list = combosWithCard(ix, String(card.name).split(' // ')[0]) || [];
      list = list.filter((c) => c.nm.length >= 2 && c.nm.length <= 4);
      if (!b.isConnected) return;
      b.textContent = '∞ ' + list.length;
      b.onclick = list.length
        ? () => openCombosOverlay(card.name + ' — combos', list)
        : () => toast(trS('No 2, 3 or 4 card combos for this card.'));
    } catch (e) {
      console.error('combos button for', card.name, e);
    }
  })();
}

async function wireDeckCombosPanel(d) {
  // Stef's spec: the Stats page shows HOW MANY 2-, 3- and 4-card combos the
  // deck holds; one tap opens the combo page (2-card combos at the foot —
  // sortCombos orders by size first). Counts ride the fast combo lane, so
  // they never wait for the big card index.
  const body = document.getElementById('deckCombosBody');
  if (!body) return;
  try {
    const ix = await combosReady();
    if (!ix || !ix.combos || !ix.combos.length) {
      body.textContent = trS('Combo data arrives with a coming weekly update.');
      return;
    }
    const names = new Set(
      d.cards
        .map((c) => String(c.name).toLowerCase())
        .concat(deckLeaders(d).map((c) => String(c.name).toLowerCase())),
    );
    const found = (combosInNames(ix, names) || []).filter(
      (c) => c.nm.length >= 2 && c.nm.length <= 4,
    );
    if (!found.length) {
      body.textContent = trS('No known combos in this deck.');
      return;
    }
    const by = { 2: 0, 3: 0, 4: 0 };
    found.forEach((c) => {
      by[c.nm.length]++;
    });
    const u = appLang() === 'nl' ? 'kaarts' : 'card';
    body.innerHTML = /* HTML */ `<button
      type="button"
      class="ghost-btn"
      id="deckCombosOpen"
      style="width:100%;"
    >
      <b>${by[2]}</b> × 2-${u} · <b>${by[3]}</b> × 3-${u} · <b>${by[4]}</b> × 4-${u}
    </button>`;
    document
      .getElementById('deckCombosOpen')
      ?.addEventListener('click', () => openCombosOverlay(d.name + ' — combos', found));
  } catch (e) {
    body.textContent = '—';
  }
}

function combosWithCard(ix, name) {
  if (!ix || !ix.comboByName) return null; // data not synced yet
  const idxs = ix.comboByName.get(String(name).toLowerCase()) || [];
  return idxs.map((i) => ix.combos[i]);
}

function combosInNames(ix, nameSet) {
  if (!ix || !ix.combos) return null;
  return ix.combos.filter((c) => c.nm.every((n) => nameSet.has(String(n).toLowerCase())));
}

/* Combo ordering, Stef's spec: number of cards first (2-card combos are
   the famous, playable ones), then EDHREC playability — a combo is as
   playable as its LEAST-played piece, so the worst EDHREC rank among its
   cards decides, straight from the local database. Spellbook popularity
   (p, when the file someday carries it) and the alphabet break ties. */
function comboPlayRank(c) {
  if (c._rk !== undefined) return c._rk;
  const ix = _bulkIdx;
  let worst = 0;
  if (ix && ix.byName) {
    for (const n of c.nm) {
      const e = ix.byName.get(String(n).toLowerCase());
      const rk = e && e.rk ? e.rk : 999999; // unknown or unplayed sinks
      if (rk > worst) worst = rk;
    }
  } else worst = 999999;
  return (c._rk = worst);
}

function sortCombos(list) {
  return list
    .slice()
    .sort(
      (a, b) =>
        a.nm.length - b.nm.length ||
        comboPlayRank(a) - comboPlayRank(b) ||
        (b.p || 0) - (a.p || 0) ||
        String(a.nm[0] || '').localeCompare(String(b.nm[0] || '')),
    );
}

async function openCombosOverlay(title, combos) {
  combos = (combos || []).filter(
    (c) => c && Array.isArray(c.nm) && c.nm.length >= 2 && c.nm.length <= 4,
  );
  combos = sortCombos(combos);
  // The stacked-page dance, same as Similar: an earlier combos page steps
  // aside intact instead of being hijacked mid-research.
  {
    const ex = document.getElementById('combosOverlay');
    const topId = state.overlayStack.length
      ? state.overlayStack[state.overlayStack.length - 1].id
      : null;
    if (ex && topId !== 'combos') {
      window._cmbBgSeq = (window._cmbBgSeq || 0) + 1;
      ex.id = 'combosOverlay_bg' + window._cmbBgSeq;
      ex.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      const bgEl = ex;
      const oldEntry = state.overlayStack
        .slice()
        .reverse()
        .find((e) => e.id === 'combos');
      if (oldEntry)
        oldEntry.closeFn = () => {
          try {
            bgEl.remove();
          } catch (e) {}
        };
    }
  }
  pushOverlay('combos', () => {
    document.getElementById('combosOverlay')?.remove();
  });
  let el = document.getElementById('combosOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'combosOverlay';
  }
  document.body.appendChild(el);
  const top = combos.slice(0, 80);
  // Bottom-up, per the ship's charter: the main is column-reverse, so the
  // BEST combo (first after sorting) sits at the foot where the eye starts,
  // and reading proceeds upward. Every section is BORN open now — names,
  // result, and the card images four across, each tappable to its card page.
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml(title)}
    <main style="display:flex;flex-direction:column-reverse;justify-content:flex-start;">
      <div class="status"><div class="spinner"></div></div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  let ix = null;
  try {
    ix = await bulkIndexReady();
  } catch (e) {}
  const main = el.querySelector('main');
  if (!main || !document.getElementById('combosOverlay')) return; // closed while the index loaded
  const gridHtml = (c) =>
    c.nm
      .map((n) => {
        const entry = ix && ix.byName ? ix.byName.get(String(n).toLowerCase()) : null;
        const src = entry
          ? cardImage(bulkToCardish(entry))
          : SF_BASE + '/cards/named?format=image&version=normal&exact=' + encodeURIComponent(n);
        return `<button type="button" class="cmb-card" data-cmbn="${escapeHtml(n)}"><img src="${src}" alt="${escapeHtml(n)}" loading="lazy"></button>`;
      })
      .join('');
  // Twenty at a time, best (sortCombos' playability order) first at the
  // FOOT; the More button sits just above the topmost visible combo and
  // deals the next twenty — images and wiring only for what's shown.
  // The filter box lives at the page FOOT (first child of the reversed
  // column) and stays mounted while only the rows re-render — so the
  // keyboard never loses its grip mid-word.
  let shown = 20,
    q = '';
  main.innerHTML = /* HTML */ `<div class="cmb-search-row">
      <input
        id="cmbFilter"
        class="col-filter-input"
        placeholder="${trS('Filter combos by card…')}"
        enterkeyhint="search"
        autocomplete="off"
      />
    </div>
    <div id="cmbRows" style="display:contents"></div>`;
  const rowsBox = main.querySelector('#cmbRows');
  const pool = () => {
    if (!q) return top;
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    return top.filter((c) =>
      toks.every((t) => c.nm.some((n) => String(n).toLowerCase().includes(t))),
    );
  };
  const renderRows = () => {
    const keep = main.scrollTop;
    const P = pool();
    const vis = P.slice(0, shown);
    rowsBox.innerHTML = `${vis
      .map(
        (c, i) => `<div class="panel-card cmb-row" style="margin-bottom:10px;">
        <div class="cmb-grid" style="margin-top:0;">${gridHtml(c)}</div>
        <button type="button" class="cmb-res-btn" data-cmbres="${i}">${trS('Tap to see what this combo does')}</button>
        <div class="cmb-res hint" hidden style="margin:6px 0 0;">${escapeHtml(c.r || '')}</div>
      </div>`,
      )
      .join('')}
      ${!P.length ? `<p class="hint" style="text-align:center;margin:10px 0;">${trS('No combos match that name.')}</p>` : ''}
      ${shown < P.length ? `<button class="ghost-btn" id="cmbMore" style="width:100%;margin:4px 0 10px;">${trS('More combos')} (${P.length - shown})</button>` : ''}
      <p class="hint" style="text-align:center;margin:8px 0 0;">${q ? P.length + ' / ' + combos.length : combos.length} · Commander Spellbook</p>`;
    rowsBox.querySelectorAll('[data-cmbres]').forEach((b) =>
      b.addEventListener('click', () => {
        const res = b.parentElement.querySelector('.cmb-res');
        if (res) res.hidden = !res.hidden;
      }),
    );
    rowsBox.querySelectorAll('[data-cmbn]').forEach((b) =>
      b.addEventListener('click', async () => {
        const name = b.dataset.cmbn;
        const entry = ix && ix.byName ? ix.byName.get(String(name).toLowerCase()) : null;
        if (entry) {
          openCardInfo(bulkToCardish(entry));
          return;
        }
        try {
          const r = await sfFetch(SF_BASE + '/cards/named?exact=' + encodeURIComponent(name));
          if (r.ok) openCardInfo(await r.json());
        } catch (e) {}
      }),
    );
    rowsBox.querySelector('#cmbMore')?.addEventListener('click', () => {
      shown += 20;
      renderRows();
    });
    main.scrollTop = keep; // column-reverse: restoring keeps the eye where it was
  };
  renderRows();
  const fi = main.querySelector('#cmbFilter');
  let _ft = null;
  fi?.addEventListener('input', () => {
    clearTimeout(_ft);
    _ft = setTimeout(() => {
      q = fi.value.trim();
      shown = 20;
      renderRows();
      main.scrollTop = 0;
    }, 140);
  });
}

/* ── Landbase suggester ─ the most-played lands for this deck's identity,
   EDHREC-ordered, best at the FOOT (array renders worst-first, so the top
   pick lands by the confirm bar). Basics fill the remainder split by the
   deck's own mana-pip ratio. Confirm adds everything selected. ── */
async function openLandSuggest(d) {
  const ex = document.getElementById('landSugOverlay');
  if (ex) ex.remove();
  const el = document.createElement('div');
  el.className = 'overlay';
  el.id = 'landSugOverlay';
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml('⛰ ' + escapeHtml(d.name))}
    <main style="flex:1;overflow-y:auto;padding:12px 14px;">
      <div class="empty-note">Curving out…</div>
    </main>
  </div>`;
  document.body.appendChild(el);
  pushOverlay('landsug', () => {
    document.getElementById('landSugOverlay')?.remove();
  });
  const main = el.querySelector('main');
  try {
    const inDeck = new Set(d.cards.map((c) => String(c.name).toLowerCase()));
    let landCount = d.cards.filter((c) => String(c.type_line || '').includes('Land')).length;
    // 1.13: the goal is 37, or the land count the AI advised for this deck
    let goal = 37,
      target = Math.max(0, goal - landCount);
    // Mana pips of the nonland deck decide the basics split
    const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    d.cards.concat(deckLeaders(d)).forEach((c) => {
      if (String(c.type_line || '').includes('Land')) return;
      String(c.mana_cost || '').replace(/\{([WUBRG])\}/g, (m, p) => {
        pips[p]++;
        return m;
      });
    });
    const basicOf = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
    const r = await searchAndVerifyLegal(
      ((d.admiral ? idClauseForDeck(d) : '') + ' t:land').trim(),
      'edhrec',
      100,
    );
    const pool = ((r && r.results) || []).filter(
      (x) =>
        !isBanned(x) &&
        !inDeck.has(String(x.name).toLowerCase()) &&
        !String(x.type_line || '').includes('Basic'),
    );
    // Rank by THIS COMMANDER'S own EDHREC landbase — the same week-cached
    // page Inspiration reads. Lands EDHREC lists for the deck's commander
    // rise to the foot; context-blind global staples (devotion shrines,
    // tribal cities, off-plan legendaries) sink beneath every listed land.
    // Offline or pageless, the global order stands untouched.
    let rankNote = '';
    const dbg = [];
    let rkOut = null;
    try {
      const rk = new Map();
      rkOut = rk;
      for (const lead of deckLeaders(d)) {
        try {
          const page = await edhrecCommanderPage(lead);
          const Ls = _edhrecWalkLists(page);
          dbg.push(
            lead.name +
              ': [' +
              (Ls.map((L) => (L.tag || '?') + ':' + L.names.length).join(', ') || 'no lists') +
              ']',
          );
          Ls.forEach((L) => {
            if (!/land/i.test(L.tag)) return;
            L.names.forEach((nm) => {
              const k = String(nm).toLowerCase();
              if (!rk.has(k)) rk.set(k, rk.size);
            });
          });
        } catch (err) {
          dbg.push(lead.name + ': ERR ' + ((err && err.message) || err));
          console.warn('suggest lands: page failed for', lead && lead.name, err);
        }
      }
      if (rk.size) {
        pool.sort((x, y) => {
          const rx = rk.has(String(x.name).toLowerCase())
            ? rk.get(String(x.name).toLowerCase())
            : 1e6;
          const ry = rk.has(String(y.name).toLowerCase())
            ? rk.get(String(y.name).toLowerCase())
            : 1e6;
          return rx - ry;
        });
        rankNote =
          appLang() === 'nl'
            ? 'Gerangschikt op de EDHREC-landbase van ' +
              deckLeaders(d)
                .map((l) => l.name)
                .join(' & ') +
              ' (' +
              rk.size +
              ' lands).'
            : 'Ranked by ' +
              deckLeaders(d)
                .map((l) => l.name)
                .join(' & ') +
              '\u2019s EDHREC landbase (' +
              rk.size +
              ' lands).';
      } else {
        rankNote =
          appLang() === 'nl'
            ? 'Landbase van EDHREC niet beschikbaar \u2014 dit is de algemene populariteit.'
            : 'EDHREC landbase unavailable \u2014 showing global popularity.';
        try {
          console.info('suggest lands:', dbg.join(' | '));
        } catch (e) {}
      }
    } catch (e) {
      rankNote =
        appLang() === 'nl'
          ? 'Landbase van EDHREC niet beschikbaar \u2014 dit is de algemene populariteit.'
          : 'EDHREC landbase unavailable \u2014 showing global popularity.';
      console.warn('suggest lands: edhrec landbase unavailable', e);
    }
    const sel = new Set();
    const preN = Math.min(target, 12, pool.length);
    for (let i = 0; i < preN; i++) sel.add(i);
    const aiWhy = new Map();
    // Two-column card grid, wrap-reverse: array is EDHREC-ordered (most
    // played first), so index 0 — the best land — lands at the page FOOT.
    // After the AI answered, its picks lead (at the foot) with their reason.
    const gridHtml = () =>
      `<div id="lsGrid" style="display:flex;flex-wrap:wrap-reverse;gap:10px;justify-content:center;align-content:flex-start;">${pool
        .map((x, i) => {
          const p = shownEurOf(x);
          const img = cardImageMed(x);
          const why = aiWhy.get(x.name);
          return `<div class="ls-tile${sel.has(i) ? ' on' : ''}" data-i="${i}">${img ? `<img loading="lazy" src="${img}" alt="">` : `<div class="ls-noimg">${escapeHtml(x.name)}</div>`}<div class="ls-p">${p != null ? '\u20ac' + p.toFixed(2) : '\u2014'}</div>${why != null ? `<div class="ls-why"><span class="ai-badge">\u2726 AI</span> ${escapeHtml(why)}</div>` : ''}</div>`;
        })
        .join('')}</div>`;
    const hintHtml = () =>
      `<p class="hint" id="lsHint" style="margin:6px 0;text-align:center;">${appLang() === 'nl' ? `${landCount} ${landCount === 1 ? 'land' : 'lands'} in het deck \u00b7 doel ${goal}${aiWhy.size ? ' (AI)' : ''} \u00b7 ${aiWhy.size ? 'AI-keuzes onderaan' : 'meest gespeeld onderaan'}` : `${landCount} land${landCount === 1 ? '' : 's'} in the deck \u00b7 target ${goal}${aiWhy.size ? ' (AI)' : ''} \u00b7 ${aiWhy.size ? 'AI picks at the bottom' : 'most played at the bottom'}`}<br><span style="white-space:pre-line;">${escapeHtml(rankNote)}</span></p>`;
    // bottom-up: grid, its hint, then the AI box at the very foot of the scroller
    const aiOk = false; // 1.39: the land AI is gone (Stef) -- EDHREC + the deck's own pips decide
    main.innerHTML = `${gridHtml()}${hintHtml()}${aiOk ? '<div class="ls-ai" id="lsAi"></div>' : ''}`;
    const foot = document.createElement('div');
    foot.style.cssText =
      'flex:0 0 auto;background:var(--ink);border-top:2px solid var(--line);padding:10px 14px calc(12px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:10px;';
    el.querySelector('.overlay-inner').appendChild(foot);
    const totalPips = () =>
      Math.max(
        1,
        ['W', 'U', 'B', 'R', 'G'].reduce((a, k) => a + pips[k], 0),
      );
    const basicsPlan = (rest) => {
      const tp = totalPips();
      const plan = [];
      let assigned = 0;
      ['W', 'U', 'B', 'R', 'G'].forEach((k) => {
        const n = Math.floor((rest * pips[k]) / tp);
        if (n > 0) {
          plan.push([basicOf[k], n]);
          assigned += n;
        }
      });
      let extra = rest - assigned;
      const order = ['W', 'U', 'B', 'R', 'G']
        .filter((k) => pips[k] > 0)
        .sort((a, b) => pips[b] - pips[a]);
      for (let i = 0; extra > 0 && order.length; i = (i + 1) % order.length, extra--) {
        const nm = basicOf[order[i]];
        const hit = plan.find((p) => p[0] === nm);
        if (hit) hit[1]++;
        else plan.push([nm, 1]);
      }
      return plan;
    };
    const repaintGrid = () => {
      const g = main.querySelector('#lsGrid');
      if (g) g.outerHTML = gridHtml();
      const h = main.querySelector('#lsHint');
      if (h) h.outerHTML = hintHtml();
    };
    // ── the AI box: the button; while it reads, a ring; then its land count
    // with the reason, and the deck's lands it would swap out (each its own
    // Remove button). Bottom-up inside: the answer lowest, swaps above it.
    let aiState = null;
    const NLl = appLang() === 'nl';
    const paintAi = () => {
      const box = main.querySelector('#lsAi');
      if (!box) return;
      const left = deckAiLeftGet();
      const leftTxt =
        left == null ? '' : NLl ? ` \u00b7 nog ${left} vandaag` : ` \u00b7 ${left} left today`;
      if (aiState && aiState.busy) {
        box.innerHTML = /* HTML */ `<div class="ai-row busy">
          <span class="ai-spin" aria-hidden="true"></span
          ><span class="ai-txt"
            >${NLl ? 'De AI leest je deck\u2026 (tot een halve minuut)' : 'The AI is reading your deck\u2026 (up to half a minute)'}</span
          >
        </div>`;
        return;
      }
      if (aiState && aiState.res) {
        const r = aiState.res;
        const swaps = (r.swap || []).filter((x) => d.cards.some((c) => c.name === x.name));
        box.innerHTML =
          (swaps.length
            ? `<div class="ai-sub">${NLl ? 'Lands die de AI zou wisselen' : 'Lands the AI would swap out'}</div>` +
              swaps
                .map(
                  (x) =>
                    `<div class="ls-swap"><div class="ai-txt"><b>${escapeHtml(x.name)}</b> \u2014 ${escapeHtml(x.why || '')}</div><button type="button" class="ghost-btn ls-swap-btn" data-lsswap="${escapeHtml(x.name)}"><span class="ib">${ICONS.removeOne}</span>${trS('Remove one')}</button></div>`,
                )
                .join('')
            : '') +
          `<div class="ai-row done"><span class="ai-badge" aria-hidden="true">\u2726 AI</span><span class="ai-txt">${r.count ? `<b>${r.count} lands</b> \u2014 ` : ''}${escapeHtml(r.countWhy || r.plan || '')}${deckAiModelHtml(r, NLl)}</span></div>` +
          (r.plan && r.countWhy
            ? `<div class="ai-hint" style="text-align:left;">${escapeHtml(r.plan)}</div>`
            : '');
        box.querySelectorAll('[data-lsswap]').forEach((b) =>
          b.addEventListener('click', () => {
            const i = d.cards.findIndex((c) => c.name === b.dataset.lsswap);
            if (i < 0) return;
            const [c] = d.cards.splice(i, 1);
            logDeckChange(d, { type: 'remove', name: c.name, card: c });
            scheduleSave(d);
            toast(NLl ? `${c.name} is eruit.` : `${c.name} removed.`);
            landCount = d.cards.filter((x) => String(x.type_line || '').includes('Land')).length;
            target = Math.max(0, goal - landCount);
            repaintGrid();
            paintAi();
            refresh();
          }),
        );
        return;
      }
      box.innerHTML = `${aiState && aiState.err ? `<div class="ai-err">${escapeHtml(aiState.err)}</div>` : ''}<button type="button" class="ghost-btn ai-btn" id="lsAiBtn"><span class="ai-star" aria-hidden="true">\u2726</span>${NLl ? 'Vraag de AI om lands' : 'Ask the AI for lands'}</button><div class="ai-hint">${NLl ? 'Kijkt naar je curve, ramp en kleuren' : 'Looks at your curve, ramp and colours'}${leftTxt}</div>`;
      box.querySelector('#lsAiBtn').addEventListener('click', askAi);
    };
    const askAi = async () => {
      if (aiState && aiState.busy) return;
      aiState = { busy: true };
      paintAi();
      main.scrollTop = main.scrollHeight;
      const base = deckAiDeckInfo(d);
      const nonland = d.cards.filter((c) => !cutRoles(c).has('land'));
      const rkOf = (x) =>
        rkOut && rkOut.has(String(x.name).toLowerCase())
          ? rkOut.get(String(x.name).toLowerCase())
          : null;
      const cands = pool
        .slice(0, 50)
        .map((x) => {
          const k = rkOf(x);
          return {
            name: x.name,
            type: String(x.type_line || ''),
            oracle: deckAiOracle(x, 170),
            note: k != null ? `EDHREC #${k + 1} for this commander` : '',
          };
        })
        .concat(
          base.lands
            .filter((c) => !/\bBasic\b/.test(c.type_line || ''))
            .map((c) => ({
              name: c.name,
              type: String(c.type_line || ''),
              oracle: deckAiOracle(c, 170),
              inDeck: true,
            })),
        );
      const res = await deckAiAsk({
        kind: 'lands',
        lang: NLl ? 'nl' : 'en',
        device: judgeDevice(),
        want: 12,
        deck: Object.assign(base.info, { others: deckAiNameList(nonland) }),
        cands,
      });
      if (!document.getElementById('landSugOverlay')) return;
      if (res && res.ok && typeof res.left === 'number') deckAiLeftSet(res.left);
      if (res && res.error === 'limit') deckAiLeftSet(0);
      if (!(res && res.ok && res.kind === 'lands')) {
        aiState = { err: deckAiErrText(res, NLl) };
        paintAi();
        return;
      }
      aiState = { res };
      // the AI's picks lead, in its order; the selection follows them
      const order = new Map((res.add || []).map((x, i) => [x.name, i]));
      (res.add || []).forEach((x) => aiWhy.set(x.name, x.why || ''));
      if (res.count) {
        goal = res.count;
        target = Math.max(0, goal - landCount);
      }
      pool.sort(
        (a, b) =>
          (order.has(a.name) ? order.get(a.name) : 1e6) -
          (order.has(b.name) ? order.get(b.name) : 1e6),
      );
      sel.clear();
      pool.forEach((x, i) => {
        if (order.has(x.name) && sel.size < target) sel.add(i);
      });
      repaintGrid();
      paintAi();
      refresh();
      main.scrollTop = main.scrollHeight;
    };
    const refresh = () => {
      const picked = sel.size;
      const rest = Math.max(0, target - picked);
      const plan = basicsPlan(rest);
      foot.innerHTML = /* HTML */ `<label
          style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;"
          ><input type="checkbox" id="lsugBasics" checked /><span
            style="font-size:13.5px;overflow:hidden;text-overflow:ellipsis;"
            >${rest > 0 ? (appLang() === 'nl' ? 'Vul ' + rest + ' aan met basics: ' : 'Fill ' + rest + ' with basics: ') + plan.map((p) => p[1] + ' ' + p[0]).join(' · ') : appLang() === 'nl' ? 'Basics: niet nodig' : 'Basics: none needed'}</span
          ></label
        >
        <button type="button" class="primary-btn" id="lsugGo" style="width:auto;flex:0 0 auto;">
          ${appLang() === 'nl' ? 'Voeg toe' : 'Add'}${sel.size ? ' (' + sel.size + ')' : ''}
        </button>`;
      foot.querySelector('#lsugGo').addEventListener('click', async () => {
        const picks = Array.from(sel).map((i) => pool[i]);
        picks.forEach((x) => {
          d.cards.push(x);
          logDeckChange(d, { type: 'add', name: x.name, card: x });
        });
        if (foot.querySelector('#lsugBasics')?.checked) {
          for (const [nm, n] of basicsPlan(Math.max(0, target - picks.length))) {
            try {
              const rr = await sfFetch(`${SF_BASE}/cards/named?exact=${encodeURIComponent(nm)}`);
              if (rr.ok) {
                const bc = await rr.json();
                for (let i = 0; i < n; i++) {
                  d.cards.push(bc);
                  logDeckChange(d, { type: 'add', name: bc.name, card: bc });
                }
              }
            } catch (err) {}
          }
        }
        scheduleSave(d);
        toast(trS('Added.'));
        closeTopOverlay();
        render();
      });
    };
    el.querySelector('.overlay-inner').insertAdjacentHTML('beforeend', overlayNavHtml());
    wireOverlayNav(el);
    main.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('.ls-tile');
      if (!t) return;
      const i = parseInt(t.dataset.i, 10);
      if (sel.has(i)) {
        sel.delete(i);
        t.classList.remove('on');
      } else {
        sel.add(i);
        t.classList.add('on');
      }
      refresh();
    });
    paintAi();
    refresh();
    // The overlay's own main is the scroller — land the view at ITS foot.
    main.scrollTop = main.scrollHeight;
  } catch (e) {
    console.error('suggest lands', e);
    main.innerHTML = /* HTML */ `<div class="empty-note">
      Couldn't load suggestions — ${escapeHtml((e && e.message) || String(e))}
    </div>`;
  }
}

/* ── Proxy sheet ─ nine 63×88 mm cards per A4, printed from the browser ── */
function openProxySheet(d) {
  const imgs = deckLeaders(d)
    .concat(d.cards)
    .map((c) => cardImageMed(c))
    .filter(Boolean);
  if (!imgs.length) {
    toast('No card images to print yet.');
    return;
  }
  const w = window.open('', '_blank');
  if (!w) {
    toast('Allow pop-ups to print proxies.');
    return;
  }
  w.document
    .write(`<html><head><title>${escapeHtml(d.name)} — proxies</title><style>@page{size:A4;margin:8mm;}*{margin:0;padding:0;}body{display:flex;flex-wrap:wrap;align-content:flex-start;}img{width:63mm;height:88mm;object-fit:cover;display:block;page-break-inside:avoid;}
</style></head><body>${imgs.map((u) => `<img src="${u}">`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);
  w.document.close();
}

/* ── Bracket estimate ─ the WotC power brackets, approximated from local
   signals: Game Changer count and 2-card combos. No GC and no combo ≈
   bracket 2 (core); a few of either ≈ 3 (upgraded); heavy ≈ 4 (optimized).
   Bracket 5 (cEDH) is a human claim, never an app's — we cap at 4. ── */
function comboEndsGames(c) {
  const r = String((c && c.r) || '').toLowerCase();
  if (!r) return false;
  if (/win(s)? the game|lose(s)? the game/.test(r)) return true;
  return /(near-)?infinite/.test(r) && /(mana|damage|draw|life)/.test(r);
}

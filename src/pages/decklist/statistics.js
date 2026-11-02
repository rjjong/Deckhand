// pages / decklist / statistics

/* ---- Cast-ability of the whole deck ----
   Same model as the single-card picker: by a card's own turn you have seen
   7 + MV cards; each colour's pips are met when enough of that colour's
   sources are among them (hypergeometric). A card's chance is the product
   over its colours. Pure: tested in Node. */
function castabilityReport(d) {
  const cards = (d && d.cards) || [];
  const N = cards.length;
  if (!N) return null;
  const COLS = ['W', 'U', 'B', 'R', 'G'];
  const pmOf = (c) => producedManaOf(c);
  const src = {};
  COLS.forEach((k) => {
    src[k] = 0;
  });
  cards.forEach((c) =>
    new Set(pmOf(c)).forEach((k) => {
      if (src[k] != null) src[k]++;
    }),
  );
  const lnF = (a) => {
    let t = 0;
    for (let i = 2; i <= a; i++) t += Math.log(i);
    return t;
  };
  const logC = (n, k) => (k < 0 || k > n ? -Infinity : lnF(n) - lnF(k) - lnF(n - k));
  const pAt = (S, k, draw) => {
    if (S < k) return 0;
    let miss = 0;
    for (let x = 0; x < k; x++) {
      const l = logC(S, x) + logC(N - S, draw - x) - logC(N, draw);
      if (isFinite(l)) miss += Math.exp(l);
    }
    return Math.max(0, Math.min(1, 1 - miss));
  };
  const spells = [],
    seen = new Set();
  cards.forEach((c) => {
    if (!c || seen.has(c.name)) return;
    const f = c.card_faces && c.card_faces.length ? c.card_faces[0] : c;
    if (/\bLand\b/.test(String(f.type_line || c.type_line || ''))) return;
    const cost = String(c.mana_cost || f.mana_cost || '');
    const needs = {};
    cost.replace(/\{([WUBRG])\}/g, (m, p) => {
      needs[p] = (needs[p] || 0) + 1;
      return m;
    });
    if (!Object.keys(needs).length) return;
    seen.add(c.name);
    const mv = Math.max(1, Math.round(c.cmc || 0) || 1);
    spells.push({ c, needs, mv, draw: Math.min(N, 7 + mv) });
  });
  if (!spells.length) return { avg: null, n: 0, hardest: [], tip: null, tapped: 0, src };
  const odds = (S) =>
    spells.map((sp) =>
      Object.keys(sp.needs).reduce((acc, k) => acc * pAt(S[k], sp.needs[k], sp.draw), 1),
    );
  const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
  const base = odds(src);
  const avg = mean(base);
  const hardest = spells
    .map((sp, i) => ({ c: sp.c, needs: sp.needs, mv: sp.mv, p: base[i] }))
    .sort((a, b) => a.p - b.p || a.mv - b.mv || String(a.c.name).localeCompare(String(b.c.name)))
    .slice(0, 5);
  // Lands that always enter tapped (not the "unless…"/"you may pay" kind).
  const tapped = cards.filter((c) => {
    const f = c.card_faces && c.card_faces.length ? c.card_faces[0] : c;
    if (!/\bLand\b/.test(String(f.type_line || c.type_line || ''))) return false;
    const t = String(f.oracle_text || c.oracle_text || '');
    return (
      /enters (the battlefield )?tapped/i.test(t) &&
      !/unless|you may pay|if you control|if it's not your/i.test(t)
    );
  }).length;
  // The one change that helps most: two more sources of one colour.
  let best = null;
  COLS.forEach((k) => {
    if (!spells.some((sp) => sp.needs[k])) return;
    const S2 = Object.assign({}, src);
    S2[k] += 2;
    const gain = mean(odds(S2)) - avg;
    if (!best || gain > best.gain) best = { k, gain };
  });
  // Or one card that is a real problem on its own (RRR on turn 4 in a
  // three-colour deck): the colour that rescues it most.
  let worst = null;
  const h0 = hardest[0];
  if (h0 && h0.p < 0.5) {
    const sp = spells.find((x) => x.c === h0.c);
    Object.keys(sp.needs).forEach((k) => {
      const S2 = Object.assign({}, src);
      S2[k] += 2;
      const p2 = Object.keys(sp.needs).reduce(
        (acc, kk) => acc * pAt(S2[kk], sp.needs[kk], sp.draw),
        1,
      );
      if (!worst || p2 > worst.p2)
        worst = { name: h0.c.name, k, p: h0.p, p2, S: src[k], mv: sp.mv };
    });
  }
  let tip = null;
  if (best && best.gain >= 0.03) tip = { kind: 'color', k: best.k, gain: best.gain };
  else if (worst) tip = Object.assign({ kind: 'card' }, worst);
  else if (tapped >= 6) tip = { kind: 'tapped', n: tapped };
  else tip = { kind: 'ok' };
  return { avg, n: spells.length, hardest, tip, tapped, src };
}

function castabilitySummaryHtml(d) {
  const r = castabilityReport(d);
  if (!r || r.avg == null) return '';

  const pct = (v) => Math.round(v * 100) + '%';
  const col = (v) =>
    v >= 0.9
      ? 'var(--brass)'
      : v >= 0.75
        ? 'var(--ink-text)'
        : 'color-mix(in srgb, var(--danger) 55%, #fff)';
  const CN = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
  let tip = '';
  if (r.tip.kind === 'color')
    tip = `2 more ${CN[r.tip.k]} sources ${manaIconSvg(r.tip.k, 15)} make your coloured spells <b>${Math.round(r.tip.gain * 100)}%</b> more castable on curve, on average.`;
  else if (r.tip.kind === 'card') {
    const t = r.tip,
      more = t.p2 - t.p >= 0.05;
    tip = `<b>${escapeHtml(t.name)}</b> is castable on turn ${t.mv} only ${pct(t.p)} of the time (${t.S} ${CN[t.k]} sources ${manaIconSvg(t.k, 15)}). ${more ? `2 more sources raise that to <b>${pct(t.p2)}</b>.` : 'More sources barely help here: consider a card with fewer of those pips.'}`;
  } else if (r.tip.kind === 'tapped')
    tip = `${r.tip.n} lands always enter tapped — consider swapping 2 of them for lands that enter untapped.`;
  else tip = 'Your mana base fits this deck well.';
  const pips = (needs) =>
    Object.keys(needs)
      .map((k) => Array.from({ length: needs[k] }, () => manaIconSvg(k, 14)).join(''))
      .join('');
  return /* HTML */ `<div class="cast-sum">
    <div class="cast-score">
      <b style="color:${col(r.avg)};">${pct(r.avg)}</b
      ><span>${`castable on curve · average of ${r.n} coloured spells`}</span>
    </div>
    <div class="cast-tip"><span class="cast-tip-k">Tip</span><span>${tip}</span></div>
    <div class="chip-label" style="margin:10px 0 4px;">${'Hardest on curve'}</div>
    ${r.hardest.map((h, i) => `<button type="button" class="cast-row" data-casthard="${i}"><span class="cast-mv">${h.mv}</span><span class="cast-nm">${escapeHtml(h.c.name)}</span><span class="cast-pips">${pips(h.needs)}</span><span class="cast-p${h.p < 0.75 ? ' low' : ''}" style="color:${col(h.p)};">${pct(h.p)}</span></button>`).join('')}
  </div>`;
}

function statsTabHtml(d) {
  const curve = [0, 0, 0, 0, 0, 0, 0];
  const curveCards = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const typeCounts = {};
  const rarityCounts = {};
  let cmcSum = 0,
    curveCount = 0;
  d.cards.forEach((c) => {
    if (countsForCurve(c)) {
      const b = Math.min(Math.round(c.cmc || 0), 6);
      curve[b]++;
      curveCards[b].push(c);
      cmcSum += c.cmc || 0;
      curveCount++;
    }
    const cat = categoryOf(c, d);
    typeCounts[cat] = (typeCounts[cat] || 0) + 1;
    const rar = c.rarity ? c.rarity[0].toUpperCase() + c.rarity.slice(1) : 'Unknown';
    rarityCounts[rar] = (rarityCounts[rar] || 0) + 1;
  });
  const avgCmc = curveCount ? (cmcSum / curveCount).toFixed(2) : '0.00';
  const { counts: symCounts, total: symTotal } = manaSymbolCounts(d.cards);
  const maxB = Math.max(1, ...curve),
    maxT = Math.max(1, ...Object.values(typeCounts)),
    maxR = Math.max(1, ...Object.values(rarityCounts));
  const colorFill = { W: '#F1E6C8', U: '#7CB8DB', B: '#8B7EA8', R: '#D98A6B', G: '#8FBD8F' };
  const rarityFill = {
    Common: '#9FB0BC',
    Uncommon: '#8FBD8F',
    Rare: '#D9B24C',
    Mythic: '#D9702E',
    Special: '#B48CD6',
    Bonus: '#B48CD6',
    Unknown: '#6C8394',
  };

  return /* HTML */ `
    <div class="panel-card">
      <div class="panel-h">Recent Changes</div>
      ${
        ensureChangelog(d).length
          ? ensureChangelog(d).slice(0, 5).map(histRowHtml).join('') +
            `<button class="hist-more" id="histMoreBtn">View full history →</button>`
          : `<div class="empty-note" style="padding:8px 0;">No changes logged yet — new edits will appear here.</div>`
      }
    </div>
    <div class="panel-card">
      <div
        class="panel-h"
        style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;"
      >
        <span
          >Mana Curve
          <span style="text-transform:none;color:var(--sub-text);font-weight:400;"
            >— tap a bar to see those cards</span
          ></span
        ><span
          id="avgMvBadge"
          style="text-transform:none;color:var(--brass);font-weight:700;white-space:nowrap;"
        ></span>
      </div>
      <div id="curveDetail" class="st-detail"></div>
      <div class="curve-panel">
        ${curve.map((n, i) => `<div class="curve-col" data-cmc="${i}" style="cursor:${n ? 'pointer' : 'default'};"><div class="curve-bar" style="height:${n ? 14 + (n / maxB) * 54 : 2}px"></div><div class="curve-n">${n || ''}</div><div class="curve-lbl">${i === 6 ? '6+' : i}</div></div>`).join('')}
      </div>
    </div>
    ${
      d.cards.length
        ? `<div class="panel-card"><div class="panel-h">Cast-ability</div>
      ${castabilitySummaryHtml(d)}
      <div id="castResult" class="hint" style="margin:0 0 8px;">Pick a card from this deck to see its odds.</div>
      <div class="otag-wrap"><input id="castPick" class="col-filter-input" placeholder="Card in this deck…" autocomplete="off"><div id="castPop" class="otag-pop" hidden></div></div>
    </div>`
        : ''
    }
    ${(() => {
      // Moxfield-proper: each colour gets its BIG mana pip with the symbol
      // percentage inside it, and (Commander mode) a bar in that colour below
      // showing production — "White production", percentage inside the bar.
      // Two columns, fixed W|U / B|R / G|C order; vertical room well spent.
      const prod = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      let prodAny = false,
        prodTotal = 1; // prodTotal = sum of colour hits, for share-of-production bars
      {
        const all = deckLeaders(d).concat(d.cards);
        all.forEach((c) => {
          const pm = producedManaOf(c);
          const seen = new Set(pm);
          Object.keys(prod).forEach((k) => {
            if (seen.has(k)) prod[k]++;
          });
        });
        prodAny = Object.keys(prod).some((k) => prod[k] > 0);
      }
      if (!symTotal && !prodAny) {
        return /* HTML */ `<div class="panel-card">
          <div class="panel-h">Color Distribution</div>
          <div class="empty-note" style="padding:10px 0;">No colored mana symbols yet.</div>
        </div>`;
      }
      const CNAME = {
        W: 'White',
        U: 'Blue',
        B: 'Black',
        R: 'Red',
        G: 'Green',
        GEN: 'Generic',
        C: 'Colorless',
      };
      // Identity colours plus GENERIC, always. The Eldrazi diamond {C} appears
      // only when the maindeck truly demands it in a mana cost — and it shows
      // symbols only, since colourless production already backs Generic.
      const idSet = new Set();
      deckLeaders(d).forEach((l) => (l.color_identity || []).forEach((c) => idSet.add(c)));
      const order = ['W', 'U', 'B', 'R', 'G']
        .filter((k) => (idSet.size ? idSet.has(k) : true))
        .concat(['GEN']);
      if ((symCounts.C || 0) > 0) order.push('C');
      // Bars are shares of production across the SHOWN bars (identity colours
      // + Generic, fed by colourless producers) — together one full 100% bar.
      const prodKeyOf = (k) => (k === 'GEN' ? 'C' : k);
      prodTotal = order.filter((k) => k !== 'C').reduce((t, k) => t + prod[prodKeyOf(k)], 0) || 1;
      const cell = (k) => {
        const symPct = symTotal ? Math.round(((symCounts[k] || 0) / symTotal) * 100) : 0;
        const pk = prodKeyOf(k);
        const prodPct = Math.round((prod[pk] / prodTotal) * 100);
        const showBar = prodAny && k !== 'C';
        return /* HTML */ `<div class="ms-cell">
          <div class="ms-big" data-msym="${k}" style="cursor:pointer;">
            ${manaIconSvg(k, 92)}<span class="ms-pct"><i>${symPct}%</i></span>
          </div>
          ${
            showBar
              ? `<div class="ms-prod-lbl">${CNAME[k]} production</div>
          <div class="ms-prod" data-mprod="${k}" style="cursor:pointer;"><div class="ms-prod-fill" style="width:${(prod[pk] / prodTotal) * 100}%;background:${colorFill[pk] || '#8a8f98'}"></div><span class="ms-prod-n"><b>${prodPct}%</b></span></div>`
              : ''
          }
        </div>`;
      };
      return /* HTML */ `<div class="panel-card">
        <div class="panel-h">
          Color Distribution
          <span style="text-transform:none;color:var(--sub-text);font-weight:400;"
            >— tap a symbol or bar to see those cards</span
          >
        </div>
        <div class="ms-grid">
          ${order.map(cell).join('')}
          <div id="msDetail" class="st-detail"></div>
        </div>
      </div>`;
    })()}
    <div class="panel-card" id="deckCombosPanel">
      <div class="panel-h">${MANA_INF} Combos</div>
      <div
        id="deckCombosBody"
        class="hint"
        style="margin:0;min-height:40px;display:flex;flex-direction:column;justify-content:center;"
      >
        Scanning…
      </div>
    </div>
  `;
}

function renderTopPriced(d) {
  const box = document.getElementById('topPriceBox');
  if (!box) return;
  const all = deckLeaders(d).concat(d.cards);
  const seen = new Set();
  const rows = [];
  const now = Date.now();
  all.forEach((c) => {
    if (seen.has(c.name)) return;
    seen.add(c.name);
    const hit = state.priceCache[c.name];
    if (hit && now - hit.t < PRICE_TTL && typeof hit.v === 'number')
      rows.push({ card: c, v: hit.v });
  });
  if (!rows.length) {
    box.innerHTML = /* HTML */ `<div class="empty-note" style="padding:8px 0;">
      No prices available yet.
    </div>`;
    return;
  }
  rows.sort((a, b) => b.v - a.v);
  const top = rows.slice(0, 5);
  box.innerHTML = top
    .map(
      (r) => `<div class="top-price-row" data-name="${encodeURIComponent(r.card.name)}">
      <img src="${cardImage(r.card)}" alt="">
      <span class="tp-name">${escapeHtml(r.card.name)}</span>
      <span class="tp-val">${fmtEur(r.v)}</span>
    </div>`,
    )
    .join('');
  box.querySelectorAll('.top-price-row').forEach((row) => {
    row.addEventListener('click', () => {
      const nm = decodeURIComponent(row.dataset.name);
      if (d.admiral && d.admiral.name === nm) {
        openCardActionSheet(d, d.admiral, 'admiral', -1);
        return;
      }
      const i = d.cards.findIndex((c) => c.name === nm);
      if (i >= 0) openCardActionSheet(d, d.cards[i], 'main', i);
    });
  });
}

async function loadDeckPrice(d) {
  const cardCount = d.cards.length + deckLeaders(d).length;
  if (!cardCount) {
    const badge0 = document.getElementById('deckTotalBadge');
    if (badge0) badge0.textContent = 'Deck total: ' + fmtEur(0);
    return;
  }
  const token = ++state._priceRun; // a later render supersedes this one
  const { total, missing, counted, refreshed } = await priceDeck(d, (done, all) => {
    if (state._priceRun !== token) return;
    const live = document.getElementById('deckPriceVal');
    if (live && done < all) live.textContent = `${done}/${all}…`;
  });
  if (state._priceRun !== token) return;
  const live = document.getElementById('deckPriceVal');
  const liveNote = document.getElementById('deckPriceNote');
  if (live) live.textContent = fmtEur(total);
  const badge = document.getElementById('deckTotalBadge');
  if (badge) badge.textContent = 'Deck total: ' + fmtEur(total);
  if (liveNote) {
    liveNote.textContent = missing
      ? `Cardmarket trend price, cheapest printing of each card. ${missing} card${missing > 1 ? 's have' : ' has'} no price listed.`
      : trS('Cardmarket trend price, cheapest printing of each card.');
  }
  renderTopPriced(d);
  prefetchBudgetData(d); // pricing is done — quietly warm the budget engine
  if (refreshed)
    refreshed.then(() => {
      if (state._priceRun !== token) return; // user moved on
      let t2 = 0,
        m2 = 0;
      const seen2 = new Set();
      deckLeaders(d)
        .concat(d.cards)
        .forEach((c) => {
          if (seen2.has(c.name)) return;
          seen2.add(c.name);
          const hit = state.priceCache[c.name];
          const v = hit ? hit.v : null;
          if (v === null || v === undefined) m2++;
          else t2 += v;
        });
      const live = document.getElementById('deckPriceVal');
      if (live) live.textContent = fmtEur(t2);
      const badge = document.getElementById('deckTotalBadge');
      if (badge) badge.textContent = 'Deck total: ' + fmtEur(t2);
      renderTopPriced(d);
    });
}

function wireStatsTab(d) {
  loadDeckPrice(d);
  // Castability picker: choose any deck card, see its colour odds by its
  // own turn — hypergeometric P(pips-needed sources among cards seen).
  {
    const inp = document.getElementById('castPick');
    const pop = document.getElementById('castPop');
    const res = document.getElementById('castResult');
    if (inp && pop && res) {
      const N = d.cards.length;
      const srcOf = (k) => {
        let n = 0;
        d.cards.forEach((c) => {
          const pm = producedManaOf(c);
          if (pm.includes(k)) n++;
        });
        return n;
      };
      const lnF = (a2) => {
        let t = 0;
        for (let i = 2; i <= a2; i++) t += Math.log(i);
        return t;
      };
      const logC = (n, k) => (k < 0 || k > n ? -Infinity : lnF(n) - lnF(k) - lnF(n - k));
      const pAtLeast = (S, k, draw) => {
        if (S < k) return 0;
        let miss = 0;
        for (let x = 0; x < k; x++) {
          const l = logC(S, x) + logC(N - S, draw - x) - logC(N, draw);
          if (isFinite(l)) miss += Math.exp(l);
        }
        return Math.max(0, Math.min(1, 1 - miss));
      };
      const show = (c) => {
        const cost = String(
          c.mana_cost || (c.card_faces && c.card_faces[0] && c.card_faces[0].mana_cost) || '',
        );
        const needs = {};
        cost.replace(/\{([WUBRG])\}/g, (m, p) => {
          needs[p] = (needs[p] || 0) + 1;
          return m;
        });
        const mv = Math.max(1, Math.round(c.cmc || 0) || 1);
        const draw = Math.min(N, 7 + mv);
        const ks = Object.keys(needs);
        res.innerHTML =
          `<div style="font-size:14px;margin-bottom:6px;"><b>${escapeHtml(c.name)}</b> · by its turn (${mv}) you've seen ~${draw} cards</div>` +
          (ks.length
            ? ks
                .map((k) => {
                  const S = srcOf(k),
                    p = Math.round(pAtLeast(S, needs[k], draw) * 100);
                  return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">${manaIconSvg(k, 18)}<span style="flex:1;font-size:13.5px;">${needs[k]} needed · ${S} source${S === 1 ? '' : 's'} in the deck</span><span style="font-family:'JetBrains Mono',monospace;color:${p >= 90 ? 'var(--brass)' : p >= 75 ? 'var(--ink-text)' : 'var(--danger)'};">${p}%</span></div>`;
                })
                .join('')
            : `<div class="hint">No coloured pips — castable on generic mana alone.</div>`);
      };
      const fill = () => {
        const q = inp.value.trim().toLowerCase();
        const hits = d.cards
          .map((c, i) => ({ c, i }))
          .filter((h) => !q || String(h.c.name).toLowerCase().includes(q))
          .sort((x, y) => String(x.c.name).localeCompare(String(y.c.name)))
          .slice(0, 200);
        pop.innerHTML = hits
          .map(
            (h) => `<button type="button" data-castpick="${h.i}">${escapeHtml(h.c.name)}</button>`,
          )
          .join('');
        pop.hidden = !hits.length;
        pop.querySelectorAll('[data-castpick]').forEach((o) =>
          o.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            const c = d.cards[parseInt(o.dataset.castpick, 10)];
            inp.value = c.name;
            pop.hidden = true;
            show(c);
          }),
        );
      };
      inp.addEventListener('focus', fill);
      inp.addEventListener('input', fill);
      inp.addEventListener('blur', () =>
        setTimeout(() => {
          pop.hidden = true;
        }, 250),
      );
    }
  }
  {
    const rep0 = document.querySelector('.cast-sum') ? castabilityReport(d) : null;
    if (rep0)
      document.querySelectorAll('[data-casthard]').forEach((b) =>
        b.addEventListener('click', () => {
          const pool = rep0.hardest.map((h) => h.c);
          const i = +b.dataset.casthard;
          openCardInfo(pool[i], { pool, poolIdx: i });
        }),
      );
  }
  wireDeckCombosPanel(d);
  document.getElementById('budgetBtn')?.addEventListener('click', () => openBudgetOverlay(d));
  {
    const pool = deckLeaders(d)
      .concat(d.cards || [])
      .filter((c) => !/\bLand\b/.test(frontFace(c).type_line || ''));
    const avg = pool.length ? pool.reduce((a, c) => a + (c.cmc || 0), 0) / pool.length : 0;
    const b = document.getElementById('avgMvBadge');
    if (b) b.textContent = pool.length ? 'Avg MV ' + avg.toFixed(2) : '';
  }
  document.getElementById('histMoreBtn')?.addEventListener('click', () => openHistoryOverlay(d));
  wireHistImages(document.getElementById('builderBody'));
  document.querySelectorAll('#builderBody [data-undo]').forEach((b) =>
    b.addEventListener('click', () => {
      applyHistAction(d, b.dataset.undo);
      renderBuilderBody(d); // refresh the stats view (and its history card)
    }),
  );
  let selectedCmc = null;
  // The back handler sweeps open drill-downs via this hook — the selection
  // marker lives in this closure, so clearing innerHTML alone would leave
  // the next tap on the same column thinking it was still open.
  {
    const cd = document.getElementById('curveDetail');
    if (cd)
      cd._clear = () => {
        selectedCmc = null;
        cd.innerHTML = '';
      };
  }
  const curveCards = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  // Shared membership rule with the rendered curve — see countsForCurve.
  d.cards.forEach((c) => {
    if (!countsForCurve(c)) return;
    const b = Math.min(Math.round(c.cmc || 0), 6);
    curveCards[b].push(c);
  });
  document.querySelectorAll('.curve-col[data-cmc]').forEach((col) => {
    col.addEventListener('click', () => {
      const cmc = col.dataset.cmc;
      const box = document.getElementById('curveDetail');
      if (selectedCmc === cmc) {
        selectedCmc = null;
        statKeepPlace(col, () => {
          box.innerHTML = '';
        });
        return;
      }
      selectedCmc = cmc;
      const cards = curveCards[cmc].slice().sort((a, b) => a.name.localeCompare(b.name));
      if (!cards.length) {
        statKeepPlace(col, () => {
          box.innerHTML = '';
        });
        return;
      }
      statKeepPlace(col, () => {
        box.innerHTML = /* HTML */ `<div class="chip-label">
            Mana value ${cmc === '6' ? '6+' : cmc} (${cards.length})
          </div>
          <div class="visual-grid">
            ${cards.map((c) => `<div class="vg-card" data-name="${encodeURIComponent(c.name)}"><img src="${cardImage(c)}" alt="${escapeHtml(c.name)}"></div>`).join('')}
          </div>`;
      });
      box.querySelectorAll('.vg-card img').forEach((img) => {
        img.addEventListener('click', () => {
          const nm = decodeURIComponent(img.closest('[data-name]').dataset.name);
          const card = d.cards.find((x) => x.name === nm);
          if (card) {
            showCardPreview(card, cardImageLarge(card));
          }
        });
      });
    });
  });
  // Color Distribution taps — same pattern as the curve: tap a big symbol
  // for the cards whose costs feed that percentage, tap a production bar
  // for the cards that can make that color. Membership mirrors the exact
  // counting rules (front face, lands out of symbols, pure-generic = GEN,
  // hybrid halves count their colour, GEN bar fed by colourless producers).
  (function () {
    if (!document.querySelector('[data-msym]') || !document.getElementById('msDetail')) return;
    const symCards = { W: [], U: [], B: [], R: [], G: [], C: [], GEN: [] };
    d.cards.forEach((c) => {
      const tl = (
        c.type_line ||
        (c.card_faces && c.card_faces[0] && c.card_faces[0].type_line) ||
        ''
      ).split('//')[0];
      if (/\bLand\b/i.test(tl)) return;
      const symbols = rawManaCost(c).match(/\{([^}]+)\}/g) || [];
      if (!symbols.length) return;
      const pureGeneric = symbols.every((sym) => /^\d+$|^X$/i.test(sym.slice(1, -1)));
      if (pureGeneric) {
        symCards.GEN.push(c);
        return;
      }
      const mine = new Set();
      symbols.forEach((sym) => {
        sym
          .slice(1, -1)
          .split('/')
          .forEach((part) => {
            if (symCards[part] !== undefined && part !== 'GEN') mine.add(part);
          });
      });
      mine.forEach((k) => symCards[k].push(c));
    });
    const prodCards = { W: [], U: [], B: [], R: [], G: [], C: [] };
    deckLeaders(d)
      .concat(d.cards)
      .forEach((c) => {
        const pm = producedManaOf(c);
        new Set(pm).forEach((k) => {
          if (prodCards[k]) prodCards[k].push(c);
        });
      });
    let msSel = null;
    {
      const md = document.getElementById('msDetail');
      if (md)
        md._clear = () => {
          msSel = null;
          md.innerHTML = '';
        };
    }
    const NAME = {
      W: 'White',
      U: 'Blue',
      B: 'Black',
      R: 'Red',
      G: 'Green',
      GEN: 'Generic',
      C: 'Colorless',
    };
    const show = (key, cards, label, from) => {
      const b = document.getElementById('msDetail');
      if (!b) return;
      const cellEl = from && from.closest('.ms-cell');
      if (msSel === key) {
        msSel = null;
        statKeepPlace(cellEl, () => {
          b.innerHTML = '';
        });
        return;
      }
      msSel = key;
      const list = cards.slice().sort((a, x) => a.name.localeCompare(x.name));
      if (!list.length) {
        msSel = null;
        statKeepPlace(cellEl, () => {
          b.innerHTML = '';
        });
        return;
      }
      statKeepPlace(cellEl, () => {
        // The list takes a full row of the grid right ABOVE the tapped
        // symbol's row; label at its foot, cards growing upward.
        const grid = b.parentNode,
          cells = Array.from(grid.querySelectorAll(':scope > .ms-cell'));
        const i = cellEl ? cells.indexOf(cellEl) : -1;
        const rowStart = i >= 0 ? cells[i - (i % 2)] : null;
        if (rowStart) grid.insertBefore(b, rowStart);
        else grid.appendChild(b);
        b.innerHTML = /* HTML */ `<div class="chip-label">${label} (${list.length})</div>
          <div class="visual-grid">
            ${list.map((c) => `<div class="vg-card" data-name="${encodeURIComponent(c.name)}"><img src="${cardImage(c)}" alt="${escapeHtml(c.name)}"></div>`).join('')}
          </div>`;
      });
      b.querySelectorAll('.vg-card img').forEach((img) => {
        img.addEventListener('click', () => {
          const nm = decodeURIComponent(img.closest('[data-name]').dataset.name);
          const card = list.find((x) => x.name === nm);
          if (card) showCardPreview(card, cardImageLarge(card));
        });
      });
    };
    document.querySelectorAll('[data-msym]').forEach((elx) =>
      elx.addEventListener('click', () => {
        const k = elx.dataset.msym;
        show('s' + k, symCards[k] || [], `${NAME[k] || k} symbols`, elx);
      }),
    );
    document.querySelectorAll('[data-mprod]').forEach((elx) =>
      elx.addEventListener('click', () => {
        const k = elx.dataset.mprod;
        show('p' + k, prodCards[k === 'GEN' ? 'C' : k] || [], `${NAME[k] || k} production`, elx);
      }),
    );
  })();
}

function logStatsFor(d) {
  const log = d.playLog || [];
  if (!log.length) return null;
  const games = log.length;
  const wins = log.filter((g) => g.res === 'W').length;
  const num = (arr) => arr.filter((v) => typeof v === 'number' && !isNaN(v));
  const avg = (arr) => {
    const a = num(arr);
    return a.length ? a.reduce((t, v) => t + v, 0) / a.length : null;
  };
  const avgTurns = avg(log.map((g) => g.turns));
  const avgDead = avg(log.map((g) => g.dead));
  const trouble = log.filter((g) => g.mana === 'screw' || g.mana === 'flood').length;
  const tally = (key) => {
    const m = {};
    log.forEach((g) => {
      const v = (g[key] || '').trim();
      if (v) m[v] = (m[v] || 0) + 1;
    });
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  };
  return {
    games,
    wins,
    losses: games - wins,
    winrate: Math.round((wins / games) * 100),
    avgTurns: avgTurns === null ? null : Math.round(avgTurns * 10) / 10,
    avgDead: avgDead === null ? null : Math.round(avgDead * 10) / 10,
    troublePct: Math.round((trouble / games) * 100),
    topMvp: tally('mvp'),
    topWeak: tally('weak'),
  };
}

const LOG_ENDINGS = [
  'Combat',
  'Commander damage',
  'Combo',
  'Poison',
  'Mill',
  'Attrition',
  'Concession',
  'Other',
];

function primerTabHtml(d) {
  const st = logStatsFor(d);
  const log = (d.playLog || []).slice().reverse();
  const statHtml = st
    ? `<div class="glog-stats">
      <div class="glog-chip"><b>${st.games}</b>Games</div>
      <div class="glog-chip"><b>${st.wins}–${st.losses}</b>Winrate ${st.winrate}%</div>
      ${st.avgTurns !== null ? `<div class="glog-chip"><b>${st.avgTurns}</b>Avg turns</div>` : ''}
      ${st.avgDead !== null ? `<div class="glog-chip"><b>${st.avgDead}</b>Avg dead turns</div>` : ''}
      <div class="glog-chip"><b>${st.troublePct}%</b>Mana trouble</div>
      ${(() => {
        if (!deckIsConstructed(d)) return '';
        const pd = (k) => {
          const gs = (d.playLog || []).filter((g) => g.play === k);
          return gs.length
            ? Math.round((gs.filter((g) => g.res === 'W').length / gs.length) * 100) + '%'
            : null;
        };
        return ['play', 'draw']
          .map((k) =>
            pd(k)
              ? `<div class="glog-chip"><b>${pd(k)}</b>${k === 'play' ? 'On the play' : 'On the draw'}</div>`
              : '',
          )
          .join('');
      })()}
    </div>
    ${st.topMvp.length ? `<div class="glog-tally"><span class="glog-tally-h">Top performers</span>${st.topMvp.map(([n, c]) => `<span class="glog-tag">${escapeHtml(n)} ×${c}</span>`).join('')}</div>` : ''}
    ${st.topWeak.length ? `<div class="glog-tally"><span class="glog-tally-h">Cut candidates</span>${st.topWeak.map(([n, c]) => `<span class="glog-tag weak">${escapeHtml(n)} ×${c}</span>`).join('')}</div>` : ''}`
    : `<p class="empty-note" style="padding:8px 0 4px;">No games logged yet — every logged game sharpens the picture: winrate, dead turns, which cards earn their slot and which don't.</p>`;
  const rows = log
    .map((g, i) => {
      const idx = d.playLog.length - 1 - i;
      const dt = new Date(g.t || Date.now());
      const bits = [];
      if (g.opp) bits.push('vs ' + g.opp);
      if (g.play) bits.push(g.play === 'draw' ? 'draw' : 'play');
      if (g.by) bits.push(g.by);
      if (g.pod && !g.opp && !g.play) bits.push(g.pod + 'p');
      if (typeof g.turns === 'number') bits.push('T' + g.turns);
      if (g.mana === 'screw') bits.push('screw');
      else if (g.mana === 'flood') bits.push('flood');
      if (typeof g.dead === 'number' && g.dead > 0) bits.push(g.dead + ' dead');
      // Collapsed: one summary line. Tapping the row unfolds EVERY field the
      // log dialog offers — result, ending, pod, turns, mulligans, mana, dead
      // turns, MVP, weakest, notes — right here in place.
      const manaTxt =
        g.mana === 'screw' ? trS('Screwed') : g.mana === 'flood' ? trS('Flooded') : trS('Smooth');
      const det =
        [
          [trS('Result'), g.res === 'W' ? trS('Won') : trS('Lost')],
          [trS('Ended by'), g.by || '—'],
          ...(deckIsConstructed(d)
            ? [
                [trS('Opponent'), g.opp || '—'],
                [
                  trS('Start'),
                  g.play === 'draw' ? 'On the draw' : g.play === 'play' ? 'On the play' : '—',
                ],
              ]
            : [[trS('Pod size'), g.pod ? g.pod + 'p' : '—']]),
          [trS('Turns'), typeof g.turns === 'number' ? g.turns : '—'],
          [trS('Mulligans'), typeof g.mull === 'number' ? g.mull : '—'],
          [trS('Mana'), manaTxt],
          [trS('Dead turns'), typeof g.dead === 'number' ? g.dead : '—'],
          [trS('MVP card'), g.mvp || '—'],
          [trS('Weakest card'), g.weak || '—'],
        ]
          .map(([k, v]) => `<div><b>${escapeHtml(String(k))}:</b> ${escapeHtml(String(v))}</div>`)
          .join('') + (g.note ? `<div><b>${'Notes'}:</b> ${escapeHtml(g.note)}</div>` : '');
      return /* HTML */ `<div class="glog-row">
        <span class="glog-res ${g.res === 'W' ? 'w' : 'l'}">${g.res}</span>
        <div class="glog-mid">
          <div class="glog-line1">
            ${dt.getDate()}/${dt.getMonth() + 1} · ${bits.map(escapeHtml).join(' · ') || '—'}
          </div>
          <div class="glog-detail">${det}</div>
        </div>
        <button class="icon-btn glog-del" data-dellog="${idx}" title="Delete">✕</button>
      </div>`;
    })
    .join('');
  // Bottom-up: the container is column-reverse, so the combined
  // Description & primer panel FIRST in the DOM lands at the page FOOT,
  // with Play Log rendering ABOVE it. The old Preview panel stays
  // retired: the SAVED state IS the rendered view.
  const dpEditing =
    state._dpEdit != null
      ? !!state._dpEdit
      : !String((d.description || '') + (d.primer || '')).trim();
  const playLogPanel = `<div class="panel-card"><div class="panel-h">Play Log</div>
    ${statHtml}
    <button class="primary-btn" id="logGameBtn" style="margin-top:6px;">⊕ Log a game</button>
    ${rows ? `<button class="ghost-btn" id="glogToggle" data-lbl="${'Games'} (${log.length})" style="width:100%;margin-top:8px;">${foldIcoHtml(state._glogOpen)} ${'Games'} (${log.length})</button><div class="glog-list" id="glogList"${state._glogOpen ? '' : ' style="display:none;"'}>${rows}</div>` : ''}
  </div>`;
  const handPanel = `<div class="panel-card"><div class="panel-h">${'Hand tester'}</div>
    <div id="htHand" style="display:flex;flex-wrap:wrap;gap:6px;min-height:44px;align-items:flex-start;"></div>
    <div style="margin-top:8px;display:flex;gap:8px;">
      <button type="button" class="primary-btn" id="htNew" style="flex:1;">${'Draw 7'}</button>
      <button type="button" class="ghost-btn" id="htMull" style="flex:1;" disabled>Mulligan</button>
      <button type="button" class="ghost-btn" id="htDraw" style="flex:1;" disabled>+1</button>
    </div>
    <button type="button" class="primary-btn" id="ptOpen" style="width:100%;margin-top:8px;">▶ ${'Playtest: play a game'}</button></div>`;
  // The 60s: the matchup guide sits right above the hand tester, nearest the thumb.
  return `${handPanel}${deckIsConstructed(d) ? matchupPanelHtml(d) : ''}${playLogPanel}<div class="panel-card"><div class="panel-h">${'Description & primer'}</div>
    ${
      dpEditing
        ? `
      <textarea id="deckDescText" class="bulk-textarea" style="min-height:70px;" placeholder="${escapeHtml(trS('A few lines about this deck — shown on the Decklist page.'))}">${escapeHtml(d.description || '')}</textarea>
      <textarea id="primerText" class="bulk-textarea" style="min-height:200px;margin-top:8px;" placeholder="${escapeHtml(trS('Primer — strategy notes'))}">${escapeHtml(d.primer || '')}</textarea>
      <p class="hint" style="margin:4px 0 2px;"># headers, **bold**, *italics*, - lists · ${'a card name between &quot;quotes&quot; becomes a link'}</p>
    `
        : `<div class="rules-text" id="dpView">${renderPrimerHtml([String(d.description || '').trim(), String(d.primer || '').trim()].filter(Boolean).join('\n\n'))}</div>`
    }
    <button class="primary-btn" id="dpSaveEdit" style="margin-top:8px;">${dpEditing ? trS('Save') : '✎ ' + trS('Edit')}</button>
  </div>`;
}

function openLogGameOverlay(d) {
  document.getElementById('logGameOverlay')?.remove();
  // Unique deck cards (leaders first), each carrying its thumbnail for the pickers.
  const seen = new Set();
  const cardOpts = [{ v: '', l: '—' }];
  deckLeaders(d)
    .concat(d.cards)
    .forEach((c) => {
      if (seen.has(c.name)) return;
      seen.add(c.name);
      const img = cardImage(c) || '';
      cardOpts.push({
        v: c.name,
        bl: escapeHtml(c.name),
        l: `<span class="glog-cimg">${img ? `<img src="${img}" loading="lazy" alt="">` : `<span class="glog-cname">${escapeHtml(c.name)}</span>`}<span class="cs-vh">${escapeHtml(c.name)}</span></span>`,
      });
    });
  cardOpts.splice(
    1,
    cardOpts.length - 1,
    ...cardOpts.slice(1).sort((a, b) => a.v.localeCompare(b.v)),
  );
  // The 60s are one-on-one: no pod size, no commander damage -- but the
  // opposing deck and who started are worth keeping.
  const isC = deckIsConstructed(d);
  const byOpts = LOG_ENDINGS.filter((x) => !(isC && x === 'Commander damage')).map((x) => ({
    v: x,
    l: x,
  }));
  // The sheet renders from LOCAL state (the page-level cselect machinery
  // can't reach an overlay outside #root), using the exact same markup and
  // classes so it looks identical to every other dropdown in the app.
  const local = {
    res: 'W',
    by: 'Combat',
    pod: isC ? '2' : '4',
    mull: '0',
    mana: 'ok',
    turns: '',
    dead: '',
    mvp: '',
    weak: '',
    note: '',
    byTxt: '',
    open: null,
    opp: '',
    play: 'play',
  };
  const el = document.createElement('div');
  el.id = 'logGameOverlay';
  document.body.appendChild(el);
  pushOverlay('gamelog', () => {
    document.getElementById('logGameOverlay')?.remove();
  });
  // Bottom-up grid: Z→A in DOM puts A on the bottom row, nearest the eye.
  const cardOptsUp = cardOpts.slice(1).reverse().concat([cardOpts[0]]);
  const csLocal = (id, options, value, ph, cls) => {
    const keep = state.openCSelect;
    state.openCSelect = local.open;
    // Panels float over the rows beneath — exactly like every page-level
    // dropdown (Inspiration) — instead of shoving the form down.
    const html = cselectHtml(id, options, value, ph, {
      cls: cls || '',
      search: options.length > 12,
    });
    state.openCSelect = keep;
    return html;
  };
  const segHtml = (id, field, pairs) =>
    `<div class="seg" data-lseg="${id}">${pairs.map(([v, l]) => `<button data-v="${v}" data-f="${field}" class="${local[field] === v ? 'active' : ''}" type="button">${l}</button>`).join('')}</div>`;
  const renderSheet = () => {
    el.innerHTML = /* HTML */ `<div class="glog-sheet">
      <div class="appoint-head">
        <span>⊕ Log a game</span><button class="icon-btn" id="lgClose" style="flex:none;">✕</button>
      </div>
      <div class="glog-form">
        <div class="glog-frow">
          <span class="glog-lbl">Result</span>${segHtml('res', 'res', [
            ['W', 'Won'],
            ['L', 'Lost'],
          ])}
        </div>
        ${
          isC
            ? `<div class="opp-chips" id="lgOppChips">${oppChipsHtml(oppSuggestions(d, local.opp, 6))}</div>
        <div class="glog-frow"><span class="glog-lbl">${trS('Opponent')}</span><input id="lgOpp" type="text" enterkeyhint="done" autocomplete="off" class="glog-num" maxlength="60" placeholder="${escapeHtml(trS('Their deck'))}" value="${escapeHtml(local.opp)}"></div>
        <div class="glog-frow"><span class="glog-lbl">${trS('Start')}</span>${segHtml(
          'play',
          'play',
          [
            ['play', 'On the play'],
            ['draw', 'On the draw'],
          ],
        )}</div>`
            : ''
        }
        <div class="glog-frow">
          <span class="glog-lbl">Ended by</span>
          <div class="glog-csbox">${csLocal('lgBy', byOpts, local.by, 'Ended by…')}</div>
        </div>
        ${local.by === 'Other' ? `<div class="glog-frow"><span class="glog-lbl"></span><input id="lgByTxt" type="text" enterkeyhint="done" class="glog-num" maxlength="60" placeholder="${escapeHtml(trS('How did it end?'))}" value="${escapeHtml(local.byTxt)}"></div>` : ''}
        ${
          isC
            ? ''
            : `<div class="glog-frow"><span class="glog-lbl">Pod size</span>${segHtml(
                'pod',
                'pod',
                [
                  ['2', '2'],
                  ['3', '3'],
                  ['4', '4'],
                  ['5', '5'],
                ],
              )}</div>`
        }
        <div class="glog-frow">
          <span class="glog-lbl">Turns</span
          ><input
            id="lgTurns"
            type="number"
            min="1"
            max="99"
            inputmode="numeric"
            class="glog-num"
            value="${escapeHtml(local.turns)}"
          />
        </div>
        <div class="glog-frow">
          <span class="glog-lbl">Mulligans</span>${segHtml('mull', 'mull', [
            ['0', '0'],
            ['1', '1'],
            ['2', '2'],
            ['3', '3+'],
          ])}
        </div>
        <div class="glog-frow">
          <span class="glog-lbl">Mana</span>${segHtml('mana', 'mana', [
            ['ok', 'Smooth'],
            ['screw', 'Screwed'],
            ['flood', 'Flooded'],
          ])}
        </div>
        <div class="glog-frow">
          <span class="glog-lbl">Dead turns</span
          ><input
            id="lgDead"
            type="number"
            min="0"
            max="99"
            inputmode="numeric"
            class="glog-num"
            placeholder="0"
            value="${escapeHtml(local.dead)}"
          />
        </div>
        <div class="glog-frow">
          <span class="glog-lbl">MVP card</span>
          <div class="glog-csbox">
            ${csLocal('lgMvp', cardOptsUp, local.mvp, '—', 'cs-cardgrid')}
          </div>
        </div>
        <div class="glog-frow">
          <span class="glog-lbl">Weakest card</span>
          <div class="glog-csbox">
            ${csLocal('lgWeak', cardOptsUp, local.weak, '—', 'cs-cardgrid')}
          </div>
        </div>
        <textarea
          id="lgNote"
          class="bulk-textarea"
          style="min-height:64px;"
          placeholder="Notes — what decided this game?"
        >
${escapeHtml(local.note)}</textarea>
        <button class="primary-btn" id="lgSave">Save game</button>
      </div>
    </div>`;
    wireSheet();
    if (local.open) {
      el.querySelector('.cselect-panel')?.scrollIntoView({ block: 'nearest' });
    }
  };
  const syncInputs = () => {
    local.turns = el.querySelector('#lgTurns')?.value ?? local.turns;
    local.dead = el.querySelector('#lgDead')?.value ?? local.dead;
    local.note = el.querySelector('#lgNote')?.value ?? local.note;
    local.byTxt = el.querySelector('#lgByTxt')?.value ?? local.byTxt;
    local.opp = el.querySelector('#lgOpp')?.value ?? local.opp;
  };
  const fieldOf = (id) => (id === 'lgBy' ? 'by' : id === 'lgMvp' ? 'mvp' : 'weak');
  function wireSheet() {
    el.querySelector('#lgClose').addEventListener('click', () => history.back());
    const oppIn = el.querySelector('#lgOpp');
    if (oppIn) {
      const paintOpp = () => {
        const c = el.querySelector('#lgOppChips');
        if (c) c.innerHTML = oppChipsHtml(oppSuggestions(d, local.opp, 6));
      };
      oppIn.addEventListener('input', () => {
        local.opp = oppIn.value;
        paintOpp();
      });
      el.querySelector('#lgOppChips')?.addEventListener('click', (e) => {
        const c = e.target.closest('[data-opp]');
        if (!c) return;
        local.opp = c.dataset.opp;
        oppIn.value = local.opp;
        paintOpp();
      });
      if (!metaFormat(deckFormat(d)))
        loadMetaData()
          .then(paintOpp)
          .catch(() => {});
    }
    el.querySelectorAll('[data-lseg] button').forEach((b) =>
      b.addEventListener('click', () => {
        syncInputs();
        local[b.dataset.f] = b.dataset.v;
        renderSheet();
      }),
    );
    el.querySelectorAll('[data-cs]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        syncInputs();
        local.open = local.open === b.dataset.cs ? null : b.dataset.cs;
        // The gatekeeper's first rung: while this picker is open, a hardware
        // back press closes IT, not the whole sheet.
        state._localCsClose = local.open
          ? () => {
              local.open = null;
              state._localCsClose = null;
              renderSheet();
            }
          : null;
        renderSheet();
      }),
    );
    el.querySelectorAll('[data-csopt]').forEach((opt) =>
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        syncInputs();
        local[fieldOf(opt.dataset.csopt)] = opt.dataset.val;
        local.open = null;
        state._localCsClose = null;
        renderSheet();
      }),
    );
    const si = el.querySelector('.cselect-search input');
    if (si) {
      si.focus();
      si.addEventListener('input', () => {
        const q = si.value.trim().toLowerCase();
        let any = false;
        el.querySelectorAll('[data-csopt]').forEach((o) => {
          const hit = !q || o.textContent.toLowerCase().includes(q);
          o.style.display = hit ? '' : 'none';
          if (hit) any = true;
        });
        const nr = el.querySelector('.cs-noresults');
        if (nr) nr.style.display = any ? 'none' : '';
      });
    }
    el.querySelector('#lgSave').addEventListener('click', () => {
      syncInputs();
      const numOf = (v) => {
        const n = parseInt(v, 10);
        return isNaN(n) ? undefined : n;
      };
      const entry = {
        t: Date.now(),
        res: local.res === 'L' ? 'L' : 'W',
        by: local.by === 'Other' && local.byTxt.trim() ? local.byTxt.trim() : local.by,
        pod: parseInt(local.pod, 10) || 4,
        turns: numOf(local.turns),
        mull: parseInt(local.mull, 10) || 0,
        mana: local.mana || 'ok',
        dead: numOf(local.dead),
        mvp: local.mvp || '',
        weak: local.weak || '',
        note: local.note.trim(),
      };
      if (isC) {
        entry.pod = 2;
        entry.play = local.play === 'draw' ? 'draw' : 'play';
        if (local.opp.trim()) entry.opp = local.opp.trim();
      }
      if (!d.playLog) d.playLog = [];
      d.playLog.push(entry);
      scheduleSave(d);
      history.back();
      // The page behind must show the fresh winrate IMMEDIATELY — the
      // bridge row on the list tab and the log itself on the primer tab.
      setTimeout(() => {
        const box = document.getElementById('builderBody');
        if (!box) return;
        if (state.builderTab === 'primer') {
          box.innerHTML = primerTabHtml(d);
          wireBuilderBody(d);
        } else if (state.builderTab === 'list') renderBuilderBody(d);
      }, 60);
      toast(entry.res === 'W' ? 'Victory logged. ⚔' : 'Logged — every loss is data.');
    });
  }
  renderSheet();
}

/* Import/Export (and its Import / Export halves) floats as a centered
   POPUP; the other tool panels keep their cover over the bridge. */
function dlBoxClass() {
  const p = state.dlPanel;
  if (!p) return '';
  return p === 'impexp' || p === 'import' || p === 'export' ? 'dl-popup' : 'dl-cover';
}

function toggleDlPanel(d, panelKey) {
  // Dock tools always work ON the decklist: pressed from Stats or Deck
  // Log, the page first returns to the Decklist tab (rebuilding
  // #dlPanelBox), then the pressed tool opens exactly as normal.
  if (state.builderTab !== 'list') {
    state.builderTab = 'list';
    state.dlPanel = null;
    try {
      renderBuilderBody(d);
      syncTabsUI();
    } catch (err) {}
  }
  const wasOpen = state.dlPanel;
  const ieFam = (p) => p === 'impexp' || p === 'import' || p === 'export';
  const hit = panelKey === 'impexp' ? ieFam(state.dlPanel) : state.dlPanel === panelKey;
  state.dlPanel = hit ? null : panelKey;
  // Give the open panel its own history entry so the hardware back button
  // closes the panel rather than leaving the deck page.
  if (state.dlPanel && !wasOpen) {
    try {
      history.pushState({ dlPanel: state.dlPanel, screen: state.screen }, '', '#' + state.screen);
    } catch (e) {}
  }
  const pBox = document.getElementById('dlPanelBox');
  // The cover class is what floats the panel OVER the commander block and
  // buttons — the initial page render sets it, and this click path must
  // set it too, or the panel drops into the grid flow below the buttons.
  pBox.className = dlBoxClass();
  if (
    state.dlPanel !== 'dsearch' &&
    (state.dlFilterOn ||
      (state.dlFilter && (state.dlFilter.ci || []).length) ||
      (state.dlFilter &&
        (state.dlFilter.name ||
          state.dlFilter.text ||
          state.dlFilter.type ||
          state.dlFilter.tag ||
          state.dlFilter.mvVal)))
  ) {
    state.dlFilter = { ci: [] };
    const hadHits = state.dlFilterOn;
    state.dlFilterOn = false;
    if (hadHits) refreshDecklistBox(d);
  }
  pBox.innerHTML = dlPanelHtml(d);
  document
    .querySelectorAll('[data-panel]')
    .forEach((x) =>
      x.classList.toggle(
        'active',
        x.dataset.panel === state.dlPanel || (x.dataset.panel === 'impexp' && ieFam(state.dlPanel)),
      ),
    );
  wireDlPanel(d);
  // The panel ELEMENT anchors the view: scrollIntoView with a
  // scroll-margin that clears the dock stack — immune to whichever
  // scroller the page uses, retried past the keyboard's animation.
  const snapPanel = () => {
    try {
      const b = document.getElementById('dlPanelBox');
      if (b) {
        b.scrollTop = b.scrollHeight;
        b.scrollIntoView({ block: 'end' });
      }
    } catch (e) {}
  };
  snapPanel();
  setTimeout(snapPanel, 160);
  setTimeout(snapPanel, 480);
}

function wireBuilderBody(d) {
  if (state.builderTab === 'list') {
    document
      .getElementById('bridgeLogGame')
      ?.addEventListener('click', () => openLogGameOverlay(d));
    document.getElementById('dl60Mu')?.addEventListener('click', () => {
      state.builderTab = 'primer';
      render();
      requestAnimationFrame(() => {
        try {
          document.getElementById('muPanel')?.scrollIntoView({ block: 'end' });
        } catch (e) {}
      });
    });
    document.getElementById('descAddBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.builderTab = 'primer';
      state._dpEdit = true; // the combined panel must open on its text boxes
      state._focusDeckDesc = true;
      render();
    });
    document.querySelector('.dl-desc-text')?.addEventListener('click', () => {
      // Straight to the pen: Deck Log tab, description field focused, cursor
      // at the end — the tap IS the edit intent.
      state.builderTab = 'primer';
      state._dpEdit = true; // the combined panel must open on its text boxes
      state._focusDeckDesc = true;
      render();
    });
    ensureDeckPriced(d);
    wireDlPanel(d);
    wireDecklistInteractions(d);
  } else if (state.builderTab === 'stats') {
    wireStatsTab(d);
  } else if (state.builderTab === 'primer') {
    const ta = document.getElementById('primerText');
    ta?.addEventListener('input', () => {
      d.primer = ta.value;
      scheduleSave(d);
    });
    document.getElementById('dpSaveEdit')?.addEventListener('click', () => {
      if (document.getElementById('primerText')) {
        // Save: commit both boxes, show the rendered view
        const t1 = document.getElementById('deckDescText'),
          t2 = document.getElementById('primerText');
        if (t1) d.description = t1.value;
        if (t2) d.primer = t2.value;
        scheduleSave(d);
        state._dpEdit = false;
      } else {
        // Edit: back to the two boxes
        state._dpEdit = true;
      }
      const box = document.getElementById('builderBody');
      box.innerHTML = primerTabHtml(d);
      wireBuilderBody(d);
    });
    // Hand tester: goldfish opening hands from the maindeck. Classic
    // simulator mulligan: redraw with one fewer card each time.
    {
      const hand = [];
      let lib = [],
        mull = 7;
      const paint = () => {
        const b = document.getElementById('htHand');
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
        const m = document.getElementById('htMull'),
          dr = document.getElementById('htDraw');
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
      document.getElementById('htNew')?.addEventListener('click', () => {
        mull = 7;
        deal(7);
      });
      document.getElementById('ptOpen')?.addEventListener('click', () => openPlaytest(d));
      document.getElementById('htMull')?.addEventListener('click', () => {
        mull = Math.max(1, mull - 1);
        deal(mull);
      });
      document.getElementById('htDraw')?.addEventListener('click', () => {
        if (lib.length) {
          hand.push(lib.pop());
          paint();
        }
      });
      paint();
    }
    document.getElementById('logGameBtn')?.addEventListener('click', () => openLogGameOverlay(d));
    if (deckIsConstructed(d)) wireMatchupPanel(d);
    const dta = document.getElementById('deckDescText');
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
    document.getElementById('glogToggle')?.addEventListener('click', () => {
      state._glogOpen = !state._glogOpen;
      const l = document.getElementById('glogList');
      if (l) l.style.display = state._glogOpen ? '' : 'none';
      const t = document.getElementById('glogToggle');
      if (t) t.innerHTML = foldIcoHtml(state._glogOpen) + ' ' + escapeHtml(t.dataset.lbl || '');
    });
    document.querySelectorAll('.glog-row').forEach((r) =>
      r.addEventListener('click', (e) => {
        if (e.target.closest('.glog-del')) return; // deleting is not expanding
        r.classList.toggle('open');
      }),
    );
    document.querySelectorAll('[data-dellog]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = parseInt(b.dataset.dellog, 10);
        openInAppConfirm(
          trS('Delete this game from the log?'),
          (ok) => {
            if (!ok) return;
            d.playLog.splice(i, 1);
            scheduleSave(d);
            const box = document.getElementById('builderBody');
            box.innerHTML = primerTabHtml(d);
            wireBuilderBody(d);
          },
          { danger: true, ok: trS('Delete') },
        );
      }),
    );
  }
}

function wireDlPanel(d) {
  document.querySelector('.dl-panel-x')?.addEventListener('click', () => {
    try {
      history.back();
    } catch (e) {
      state.dlPanel = null;
      render();
    }
  });
  if (state.dlPanel === 'dsearch') {
    const f = state.dlFilter || (state.dlFilter = { ci: [] });
    // No live filtering anymore — fields only collect values; the Search
    // button below applies them, exactly like the Search page.
    const bind = (id, key) => {
      const el2 = document.getElementById(id);
      if (!el2) return;
      // LIVE filtering: the buttons are gone — the list narrows as you type,
      // debounced a breath so mid-word keystrokes don't thrash the render.
      el2.addEventListener('input', (e) => {
        f[key] = e.target.value;
        state.dlFilterOn = true;
        clearTimeout(state._dfT);
        state._dfT = setTimeout(() => refreshDecklistBox(d), 220);
      });
      el2.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          el2.blur();
        }
      });
      el2.setAttribute('enterkeyhint', 'search');
    };
    // The Tag field carries the same full-catalog drop-up as the search
    // page: ascending, A at the bottom by the input, tap fills and filters.
    {
      const inp = document.getElementById('dfTag');
      const pop = document.getElementById('dfTagPop');
      const fill = () => {
        if (!inp || !pop) return;
        const q = inp.value.trim().toLowerCase().replace(/\s+/g, '-');
        const hits = BUDGET_OTAGS.filter((t) => !q || t.includes(q))
          .slice()
          .sort((a, b) => a.localeCompare(b))
          .slice(0, 400);
        pop.innerHTML = hits
          .map((t) => `<button type="button" data-dftagpick="${t}">${t}</button>`)
          .join('');
        pop.hidden = !hits.length;
        pop.querySelectorAll('[data-dftagpick]').forEach((o) =>
          o.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            inp.value = o.dataset.dftagpick;
            f.tag = o.dataset.dftagpick;
            state.dlFilterOn = true;
            refreshDecklistBox(d);
            pop.hidden = true;
          }),
        );
      };
      inp?.addEventListener('focus', fill);
      inp?.addEventListener('input', fill);
      inp?.addEventListener('blur', () =>
        setTimeout(() => {
          if (pop) pop.hidden = true;
        }, 250),
      );
    }
    bind('dfName', 'name');
    bind('dfText', 'text');
    bind('dfType', 'type');
    bind('dfTag', 'tag');
    bind('dfMvVal', 'mvVal');
    document.getElementById('dfGo')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(state._dfT);
      [
        ['dfName', 'name'],
        ['dfText', 'text'],
        ['dfType', 'type'],
        ['dfTag', 'tag'],
        ['dfMvVal', 'mvVal'],
      ].forEach(([id, key]) => {
        const el2 = document.getElementById(id);
        if (el2) f[key] = el2.value;
      });
      if (f.name || f.text || f.type || f.tag || f.mvVal || (f.ci && f.ci.length))
        state.dlFilterOn = true;
      try {
        document.activeElement && document.activeElement.blur && document.activeElement.blur();
      } catch (err) {}
      state.openCSelect = null;
      closeDeckFilterPanel(d, true);
    });
    // 1.35: no auto-focus any more. Focusing a field right after the tap
    // closed the keyboard and opened it again -- the panel bounced.
    // Color identity rides the same checkbox-under-mana-icon control the
    // Collection filter uses.
    document.querySelectorAll('#dlPanelBox [data-dfci]').forEach((chk) =>
      chk.addEventListener('change', () => {
        const col = chk.dataset.dfci;
        f.ci = f.ci || [];
        const at = f.ci.indexOf(col);
        if (chk.checked) {
          if (at < 0) f.ci.push(col);
        } else if (at >= 0) f.ci.splice(at, 1);
        state.dlFilterOn = true;
        // Unticking the last colour brings the whole deck back, and that
        // height change used to shove the panel off the screen -- it looked
        // as if the menu had closed. The panel keeps its place instead.
        const box = document.getElementById('dlPanelBox');
        if (box)
          keepAnchored(
            box,
            () => refreshDecklistBox(d),
            () => document.getElementById('dlPanelBox'),
          );
        else refreshDecklistBox(d);
      }),
    );
    // The deck page never calls wireCSelects, so the panel wires its own
    // ≤/=/≥ dropdown — the _csw flag keeps a re-render from ever stacking a
    // second listener on the same element.
    document.querySelectorAll('#dlPanelBox [data-cs]').forEach((b) => {
      if (b._csw) return;
      b._csw = 1;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        state.openCSelect = state.openCSelect === b.dataset.cs ? null : b.dataset.cs;
        csRerender();
      });
    });
    document.querySelectorAll('#dlPanelBox [data-csopt]').forEach((o) => {
      if (o._csw) return;
      o._csw = 1;
      o.addEventListener('click', (e) => {
        e.stopPropagation();
        state.openCSelect = null;
        const h = _csHandlers[o.dataset.csopt];
        if (h) h(o.dataset.val);
        else csRerender();
      });
    });
    _csHandlers['dfMvOp'] = (v) => {
      if (state.dlFilter) state.dlFilter.mvOp = v;
      state.dlFilterOn = true;
      csRerender();
    }; // redraw only — filtering waits for Search
    return;
  }
  if (state.dlPanel === 'impexp') {
    const go = (which) => {
      state.dlPanel = which;
      const box = document.getElementById('dlPanelBox');
      if (box) {
        box.innerHTML = dlPanelHtml(d);
        wireDlPanel(d);
      }
    };
    document.getElementById('ieChooseImport')?.addEventListener('click', () => go('import'));
    document.getElementById('ieChooseExport')?.addEventListener('click', () => go('export'));
    return;
  }
  if (state.dlPanel === 'bulk') {
    document
      .getElementById('applyBulkBtn')
      .addEventListener('click', () =>
        applyTextToDeck(d, document.getElementById('bulkText').value, 'bulkReport', false),
      );
  } else if (state.dlPanel === 'import') {
    // Load a downloaded deck list (.txt) straight into the paste box — the
    // person reviews it there and presses Replace Deck themselves; the red
    // button stays the one deliberate, destructive step.
    document
      .getElementById('importFileBtn')
      ?.addEventListener('click', () => document.getElementById('importFile')?.click());
    document.getElementById('importFile')?.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const ta = document.getElementById('importText');
        if (ta) {
          ta.value = text;
          ta.scrollTop = 0;
        }
        toast(`${f.name} ${trS('loaded — press Replace Deck when ready.')}`);
      } catch (err) {
        console.error(err);
        toast(trS('Could not read that file.'));
      }
      e.target.value = ''; // same file can be picked again next time
    });
    document.getElementById('applyImportBtn').addEventListener('click', () => {
      const val = document.getElementById('importText').value;
      if (!val.trim()) return;
      const go = () => applyTextToDeck(d, val, 'importReport', true);
      if (d.cards.length || d.admiral) {
        openInAppConfirm(
          'This replaces the current ' + fmtName(d) + ' and all cards in this deck. Continue?',
          (ok) => {
            if (ok) go();
          },
          { danger: true },
        );
      } else go();
    });
  }
  if (state.dlPanel === 'export') {
    document.querySelectorAll('[data-expfmt]').forEach((b) =>
      b.addEventListener('click', () => {
        state.exportFmt = b.dataset.expfmt;
        document.getElementById('dlPanelBox').innerHTML = dlPanelHtml(d);
        wireDlPanel(d);
      }),
    );
    document.getElementById('copyExport').addEventListener('click', () => {
      const text = document.getElementById('exportText').value;
      navigator.clipboard
        ?.writeText(text)
        .then(() => toast('Copied.'))
        .catch(() => toast('Select and copy manually.'));
    });
    document.getElementById('downloadExport').addEventListener('click', () => {
      const fmt = state.exportFmt || 'plain';
      const text = document.getElementById('exportText').value;
      const blob = new Blob([text], {
        type: fmt === 'cockatrice' ? 'application/xml' : 'text/plain',
      });
      const url = URL.createObjectURL(blob);
      const safe = (d.name || 'deckhand-deck').replace(/[^\w\- ]+/g, '').trim() || 'deckhand-deck';
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe}.${exportExt(fmt)}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }
}

async function ensureDeckPriced(d) {
  if (deckPriceFromCache(d).complete) return; // nothing to fetch
  if (state._pricingDeck === d.id) return; // already in flight
  // A run that ended in a refusal left a hold. Without it, every glance at the
  // deck page started the same doomed burst over again -- which is why the same
  // decks never finished while fully cached ones opened instantly.
  if (state._priceHoldUntil && Date.now() < state._priceHoldUntil) return;
  state._pricingDeck = d.id;
  try {
    await priceDeck(d, () => {
      try {
        refreshCapPrice(d);
      } catch (e) {}
    });
    // Only repaint if the user is still looking at this deck's list
    if (state.screen === 'decklist' && state.activeDeckId === d.id && state.builderTab === 'list') {
      refreshDecklistBox(d);
    }
  } finally {
    state._pricingDeck = null;
  }
}

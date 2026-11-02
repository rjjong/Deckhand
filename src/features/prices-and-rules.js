// features / prices-and-rules

/* WHERE a deck is stored decides which rules it plays by: a deck inside a
   format folder -- directly or in any folder beneath it -- IS that format,
   whatever its stored field says (the field is brought in line). Only a
   deck outside every format folder falls back on its own field. */
function deckFormat(d) {
  if (!d) return 'commander';
  if (isFmtFolder(d.folderId) && !FMT_SPEC[fmtOfFolder(d.folderId)]) d.folderId = null;
  if (d.folderId) {
    const anc = fmtAncestorOf(d.folderId);
    if (anc && FMT_SPEC[anc]) {
      if (d.format !== anc) d.format = anc;
      return anc;
    }
  }
  if (!FMT_SPEC[d.format]) d.format = 'commander';
  return d.format;
}

function bracketEstimate(d, combos2) {
  let gc = 0;
  d.cards.concat(deckLeaders(d)).forEach((c) => {
    try {
      if (isGameChanger(c)) gc++;
    } catch (e) {}
  });
  const c2 = combos2 == null ? 0 : combos2;
  let b = 2;
  if (gc > 0 || c2 > 0) b = 3;
  if (gc > 3 || c2 >= 2) b = 4;
  return { b, gc, c2 };
}

/* ── Price history ─ the daily breadcrumbs the recorder has been leaving
   since v421, drawn as a brass line. Young histories say so honestly. ── */
function priceHistOf(name) {
  try {
    if (_phist == null) {
      _phist = JSON.parse(localStorage.getItem(LS_PREFIX + 'priceHist') || '{}');
    }
    return _phist[String(name).toLowerCase()] || [];
  } catch (e) {
    return [];
  }
}

function openPriceHistory(card, key) {
  const _title = typeof card === 'string' ? card : (card && card.name) || '';
  const _key = key || _title;
  card = { name: _title, _k: _key };

  // Dates on this page read day-month-year (26-8-2026), matching the app.
  const dmy = (iso) => {
    const p = String(iso).split('-');
    return p.length === 3 ? +p[2] + '-' + +p[1] + '-' + p[0] : iso;
  };
  const ex = document.getElementById('phOverlay');
  if (ex) ex.remove();
  const el = document.createElement('div');
  el.className = 'overlay';
  el.id = 'phOverlay';
  const pts = priceHistOf(card._k);
  let body,
    chart = null;
  if (pts.length < 2) {
    body = `<div class="empty-note" style="padding:24px 12px;text-align:center;">${pts.length ? 'One price point so far (' + dmy(pts[0][0]) + ' · €' + Number(pts[0][1]).toFixed(2) + ').' : 'No history yet.'}<br>Recording runs daily as prices load — the line grows from here.</div>`;
  } else {
    const vs = pts.map((p) => p[1]);
    const lo = Math.min.apply(null, vs),
      hi = Math.max.apply(null, vs);
    const span = hi - lo || Math.max(0.05, hi * 0.1);
    const y0 = lo - span * 0.15,
      y1 = hi + span * 0.15;
    const W = 320,
      H = 170,
      Lp = 8,
      Rp = 8,
      Tp = 10,
      Bp = 22;
    const x = (i) => Lp + (W - Lp - Rp) * (i / (pts.length - 1));
    const y = (v) => Tp + (H - Tp - Bp) * (1 - (v - y0) / (y1 - y0));
    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
    chart = { W, H, Tp, Bp, xs: pts.map((p, i) => x(i)), ys: pts.map((p) => y(p[1])) };
    body = `<div id="phChart" style="position:relative;max-width:520px;margin:0 auto;touch-action:pan-y;">
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;">
      <line id="phGuide" x1="0" x2="0" y1="${Tp}" y2="${H - Bp}" stroke="var(--sub-text)" stroke-width="0.8" stroke-dasharray="3 3" visibility="hidden"/>
      <polyline points="${line}" fill="none" stroke="var(--brass)" stroke-width="2"/>
      ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="2.6" fill="var(--brass)"/>`).join('')}
      <text x="${Lp}" y="${H - 6}" fill="var(--sub-text)" font-size="9">${dmy(pts[0][0])}</text>
      <text x="${W - Rp}" y="${H - 6}" fill="var(--sub-text)" font-size="9" text-anchor="end">${dmy(pts[pts.length - 1][0])}</text>
      <text x="${Lp}" y="${Tp + 4}" fill="var(--sub-text)" font-size="9">€${hi.toFixed(2)}</text>
      <text x="${Lp}" y="${H - Bp}" fill="var(--sub-text)" font-size="9">€${lo.toFixed(2)}</text>
      <circle id="phDot" r="5" fill="var(--brass)" stroke="var(--ink)" stroke-width="2" visibility="hidden"/>
    </svg>
    <div id="phTip" style="position:absolute;display:none;pointer-events:none;background:var(--pop-bg);border:1.5px solid var(--pop-line);border-radius:8px;padding:5px 9px;font-size:13px;line-height:1.35;white-space:nowrap;box-shadow:0 6px 16px rgba(0,0,0,0.45);color:var(--ink-text);"></div>
    </div>
    <p class="hint" style="text-align:center;">${pts.length} ${appLang() === 'nl' ? 'dagen' : 'daily points'} · €${Number(pts[0][1]).toFixed(2)} → €${Number(pts[pts.length - 1][1]).toFixed(2)}<br><span style="font-size:12px;">${appLang() === 'nl' ? 'Tik op de lijn om een dag te lezen.' : 'Tap the line to read a day.'}</span></p>`;
  }
  let movers = '';
  if (_key.startsWith('__col:')) {
    const b = _key.slice(6);
    if (b !== '__wants__') {
      const scope = state.collection.items.filter((it) => (b === 'all' ? true : it.binder === b));
      const seen = new Set();
      const deltas = [];
      scope.forEach((it) => {
        const nm = String(it.name),
          kk = nm.toLowerCase();
        if (seen.has(kk)) return;
        seen.add(kk);
        const h = priceHistOf(nm);
        if (h.length >= 2) {
          const dlt = h[h.length - 1][1] - h[0][1];
          if (Math.abs(dlt) >= 0.01) deltas.push([nm, dlt]);
        }
      });
      deltas.sort((a2, z2) => z2[1] - a2[1]);
      const up = deltas.filter((x) => x[1] > 0).slice(0, 20);
      const down = deltas
        .filter((x) => x[1] < 0)
        .slice(-20)
        .reverse();
      const row = (nm, dv) =>
        `<div data-phcard="${encodeURIComponent(nm)}" role="button" style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;font-size:13.5px;cursor:pointer;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(nm)}</span><span style="font-family:'JetBrains Mono',monospace;color:${dv > 0 ? 'var(--brass)' : 'var(--danger)'};">${dv > 0 ? '+' : ''}€${dv.toFixed(2)}</span></div>`;
      movers =
        up.length || down.length
          ? `<div style="max-width:520px;margin:14px auto 0;">
            ${up.length ? `<div class="panel-h" style="margin:0 0 4px;">Biggest risers</div><div class="ph-movers">${up.map((x) => row(x[0], x[1])).join('')}</div>` : ''}
            ${down.length ? `<div class="panel-h" style="margin:10px 0 4px;">Biggest fallers</div><div class="ph-movers">${down.map((x) => row(x[0], x[1])).join('')}</div>` : ''}
          </div>`
          : `<p class="hint" style="text-align:center;margin-top:12px;">No card has two recorded days yet — movers appear as histories grow.</p>`;
    }
  }
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml(card.name)}
    <main style="flex:1;overflow-y:auto;padding:16px 14px;">${body}${movers}</main>
    ${overlayNavHtml()}
  </div>`;
  document.body.appendChild(el);
  wireOverlayNav(el);
  pushOverlay('pricehist', () => {
    document.getElementById('phOverlay')?.remove();
  });
  // Five rows in view, like before; the rest (up to 20) scroll inside.
  el.querySelectorAll('.ph-movers').forEach((box) => {
    const r0 = box.firstElementChild;
    const h = r0 ? r0.getBoundingClientRect().height : 0;
    box.style.maxHeight = (h > 0 ? Math.round(h * 5) : 160) + 'px';
  });
  // A riser or faller opens its card, the owned copy first (its printing).
  el.querySelectorAll('[data-phcard]').forEach((r) =>
    r.addEventListener('click', () => {
      let nm = '';
      try {
        nm = decodeURIComponent(r.dataset.phcard);
      } catch (e) {
        nm = r.dataset.phcard;
      }
      const idx = state.collection.items.findIndex((it) => it && it.name === nm);
      if (idx >= 0) openCollectionCard(idx);
      else
        sfFetch(`${SF_BASE}/cards/named?exact=${encodeURIComponent(nm)}`)
          .then((x) => (x.ok ? x.json() : null))
          .then((c) => {
            if (c) openCardInfo(c);
          })
          .catch(() => {});
    }),
  );
  // Tap or slide along the line: the nearest day lights up with its date
  // and price, Cardmarket-style. The last pick stays up after you let go.
  const box = chart && el.querySelector('#phChart');
  if (box) {
    const svg = box.querySelector('svg'),
      tip = box.querySelector('#phTip');
    const guide = box.querySelector('#phGuide'),
      dot = box.querySelector('#phDot');
    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      const vx = ((clientX - r.left) / r.width) * chart.W;
      let i = 0;
      chart.xs.forEach((xx, k) => {
        if (Math.abs(xx - vx) < Math.abs(chart.xs[i] - vx)) i = k;
      });
      const px = chart.xs[i],
        py = chart.ys[i];
      guide.setAttribute('x1', px);
      guide.setAttribute('x2', px);
      guide.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', px);
      dot.setAttribute('cy', py);
      dot.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${dmy(pts[i][0])}</b><br>€${Number(pts[i][1]).toFixed(2)}`;
      tip.style.display = 'block';
      const fx = px / chart.W,
        fy = py / chart.H;
      tip.style.left = fx * 100 + '%';
      tip.style.top = fy * 100 + '%';
      const tx = fx < 0.18 ? '0%' : fx > 0.82 ? '-100%' : '-50%';
      tip.style.transform = `translate(${tx}, ${fy < 0.4 ? '14px' : 'calc(-100% - 14px)'})`;
    };
    box.addEventListener('pointerdown', (e) => {
      show(e.clientX);
    });
    box.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') show(e.clientX);
    });
  }
}

/* ── Deck prices ─ the price in a deck's cap opens this page. ─────────────
   Average price per card, every card by price (a slider narrows the list),
   the deck's card budget and deck budget, and the way to Budget
   Alternatives. Prices follow the cap's own rule: one price per card name,
   the cheapest paper printing. The budgets live on the deck (d.budget) and
   are watched on every add: see budgetNoteAdded below. */
function deckBudgetOf(d) {
  const b = d && d.budget;
  if (!b) return null;
  const card = typeof b.card === 'number' && b.card > 0 ? b.card : null;
  const deck = typeof b.deck === 'number' && b.deck > 0 ? b.deck : null;
  return card == null && deck == null ? null : { card, deck };
}

function parseEurInput(v) {
  const t = String(v == null ? '' : v)
    .replace(/[€\s]/g, '')
    .replace(',', '.');
  if (!t) return null;
  const n = parseFloat(t);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// What this phone knows about a card's price right now, without asking:
// a number, null (Cardmarket lists no price) or undefined (not known yet).
function knownEur(name) {
  const hit = state.priceCache[name];
  if (hit && typeof hit.v === 'number') return hit.v;
  const b = bulkEurFor(name);
  if (b !== undefined) return b;
  if (hit && hit.v === null) return null;
  return undefined;
}

function deckPriceRows(d) {
  const by = new Map();
  deckLeaders(d)
    .concat(d.cards || [])
    .forEach((c) => {
      if (!c || !c.name) return;
      const r = by.get(c.name);
      if (r) r.qty++;
      else by.set(c.name, { card: c, qty: 1, eur: knownEur(c.name) });
    });
  const val = (r) => (typeof r.eur === 'number' ? r.eur : -1);
  return Array.from(by.values()).sort(
    (a, b) => val(b) - val(a) || a.card.name.localeCompare(b.card.name),
  );
}

function deckPriceSums(rows) {
  let total = 0,
    priced = 0,
    unknown = 0;
  rows.forEach((r) => {
    if (typeof r.eur === 'number') {
      total += r.eur;
      priced++;
    } else if (r.eur === undefined) unknown++;
  });
  return { total, priced, unknown, avg: priced ? total / priced : 0 };
}

function openDeckPricePage(d) {
  if (!d) return;
  const NL = appLang() === 'nl';
  document.getElementById('deckPriceOverlay')?.remove();
  const el = document.createElement('div');
  el.className = 'overlay';
  el.id = 'deckPriceOverlay';
  const b0 = d.budget || {};
  const fmtIn = (v) => (typeof v === 'number' && v > 0 ? v.toFixed(2) : '');
  const filt = { lo: 0, hi: null };
  // Written foot-first: main is column-reverse, so the summary (with the
  // budgets and the coin button) lands at the foot, the list above it.
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml((NL ? 'Prijzen' : 'Prices') + ' · ' + d.name)}
    <main>
      <div class="panel-card" id="dppSum">
        <div class="dpp-grid" id="dppStats"></div>
        <div class="dpp-grid" style="margin-top:10px;">
          <label class="dpp-k" for="dppCard">${NL ? 'Kaartbudget' : 'Card budget'}</label>
          <label class="dpp-k" for="dppDeck">${NL ? 'Deckbudget' : 'Deck budget'}</label>
          <input
            class="dpp-in"
            id="dppCard"
            inputmode="decimal"
            enterkeyhint="done"
            autocomplete="off"
            placeholder="€ —"
            value="${fmtIn(b0.card)}"
          />
          <input
            class="dpp-in"
            id="dppDeck"
            inputmode="decimal"
            enterkeyhint="done"
            autocomplete="off"
            placeholder="€ —"
            value="${fmtIn(b0.deck)}"
          />
        </div>
        <button type="button" class="ghost-btn dpp-alt" id="dppAlt">
          ${ICONS.coins}<span>${NL ? 'Budgetalternatieven' : 'Budget alternatives'}</span>
        </button>
      </div>
      <div class="panel-card">
        <div class="dpp-head">
          <div class="panel-h" style="margin:0 0 6px;">
            ${NL ? 'Kaarten op prijs' : 'Cards by price'}
          </div>
          <span class="dpp-cnt" id="dppCnt"></span>
        </div>
        <div class="dpp-box" id="dppList"></div>
        ${priceSliderHtml('dppSlider', 0, null)}
      </div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  document.body.appendChild(el);
  wireOverlayNav(el);
  pushOverlay('deckprice', () => {
    document.getElementById('deckPriceOverlay')?.remove();
  });
  const main = el.querySelector('main'),
    box = el.querySelector('#dppList');
  let shown = [];
  const paint = () => {
    const rows = deckPriceRows(d),
      sums = deckPriceSums(rows),
      bud = deckBudgetOf(d) || {};
    const overDeck = bud.deck != null && sums.total > bud.deck + 1e-9;
    const overCards =
      bud.card != null
        ? rows.filter((r) => typeof r.eur === 'number' && r.eur > bud.card + 1e-9).length
        : 0;
    const left = bud.deck != null ? bud.deck - sums.total : null;
    el.querySelector('#dppStats').innerHTML = /* HTML */ ` <div class="dpp-k">
        ${NL ? 'Gemiddeld per kaart' : 'Average per card'}
      </div>
      <div class="dpp-k">${NL ? 'Deck totaal' : 'Deck total'}</div>
      <div class="dpp-v">${sums.priced ? fmtEur(sums.avg) : '—'}</div>
      <div class="dpp-v${overDeck ? ' over' : ''}">${fmtEur(sums.total)}</div>
      <div class="dpp-note${overCards ? ' over' : ''}">
        ${overCards ? (NL ? overCards + ' boven budget' : overCards + ' over budget') : sums.unknown ? (NL ? sums.unknown + ' nog onbekend' : sums.unknown + ' not known yet') : ''}
      </div>
      <div class="dpp-note${overDeck ? ' over' : ''}">
        ${left == null ? '' : overDeck ? fmtEur(-left) + (NL ? ' te veel' : ' over') : fmtEur(left) + (NL ? ' over' : ' left')}
      </div>`;
    shown = rows.filter((r) => {
      if (typeof r.eur !== 'number') return filt.lo <= 0 && filt.hi == null; // unknown prices only in the full range
      return r.eur >= filt.lo - 1e-9 && (filt.hi == null || r.eur <= filt.hi + 1e-9);
    });
    el.querySelector('#dppCnt').textContent = shown.length + ' / ' + rows.length;
    // Most expensive first in the markup = at the foot of the reversed box.
    box.innerHTML =
      shown
        .map((r, i) => {
          const over = bud.card != null && typeof r.eur === 'number' && r.eur > bud.card + 1e-9;
          return `<div class="dpp-row${over ? ' over' : ''}" data-dpp="${i}" role="button"><span class="dpp-nm">${r.qty > 1 ? `<span class="dpp-q">${r.qty}×</span>` : ''}${escapeHtml(r.card.name)}</span><span class="dpp-eur">${typeof r.eur === 'number' ? fmtEur(r.eur) : '—'}</span></div>`;
        })
        .join('') ||
      `<div class="hint" style="text-align:center;margin:10px 0;">${NL ? 'Geen kaarten in deze prijsklasse.' : 'No cards in this price range.'}</div>`;
    box.scrollTop = box.scrollHeight; // the foot: in a reversed box that is where it starts
  };
  paint();
  box.addEventListener('click', (e) => {
    const r = e.target.closest && e.target.closest('[data-dpp]');
    if (!r) return;
    const i = +r.dataset.dpp,
      pool = shown.map((x) => x.card);
    if (pool[i]) openCardInfo(pool[i], { pool, poolIdx: i });
  });
  // The slider filters while it moves, not only when it is let go.
  wirePriceSlider('dppSlider', (lo, hi) => {
    filt.lo = lo || 0;
    filt.hi = hi == null ? null : hi;
    paint();
  });
  {
    const sl = el.querySelector('#dppSlider'),
      lo = sl.querySelector('[data-prlo]'),
      hi = sl.querySelector('[data-prhi]');
    const live = () => {
      filt.lo = PRICE_STOPS[+lo.value] || 0;
      filt.hi = PRICE_STOPS[+hi.value];
      filt.hi = filt.hi == null ? null : filt.hi;
      paint();
    };
    lo.addEventListener('input', live);
    hi.addEventListener('input', live);
  }
  const setB = (k, inp) => {
    const v = parseEurInput(inp.value);
    d.budget = Object.assign({}, d.budget || {}, { [k]: v });
    paint();
    return v;
  };
  [
    ['card', '#dppCard'],
    ['deck', '#dppDeck'],
  ].forEach(([k, sel]) => {
    const inp = el.querySelector(sel);
    inp.addEventListener('input', () => setB(k, inp));
    inp.addEventListener('change', () => {
      const v = setB(k, inp);
      inp.value = v == null ? '' : v.toFixed(2);
      scheduleSave(d);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        try {
          inp.blur();
        } catch (err) {}
      }
    });
  });
  el.querySelector('#dppAlt').addEventListener('click', () => openBudgetOverlay(d));
  // Opens at the foot: the summary, right above the bar.
  requestAnimationFrame(() => {
    main.scrollTop = main.scrollHeight;
    box.scrollTop = box.scrollHeight;
  });
  // Cards the phone had no price for yet: fetch, then fill in place.
  if (!deckPriceFromCache(d).complete) {
    ensureDeckPriced(d)
      .then(() => {
        if (document.getElementById('deckPriceOverlay') === el) paint();
      })
      .catch(() => {});
  }
}

/* Budget watch. Every card that joins a deck's main board passes here (via
   logDeckChange, plus the multi-select move); a burst -- a bulk add, a
   pasted list -- is gathered for a moment and judged once. Over the card
   budget, or the deck pushed past its budget: one popup, with the choice
   to take those cards out again. */
const _budgetQ = new Map();

let _budgetT = null;

function budgetNoteAdded(d, cards, kind) {
  if (!d || !deckBudgetOf(d) || !cards || !cards.length) return;
  const q = _budgetQ.get(d.id) || { d, items: [] };
  cards.forEach((c) => {
    if (c && c.name) q.items.push({ card: c, kind: kind === 'toMain' ? 'toMain' : 'add' });
  });
  _budgetQ.set(d.id, q);
  clearTimeout(_budgetT);
  _budgetT = setTimeout(() => {
    const qs = Array.from(_budgetQ.values());
    _budgetQ.clear();
    (async () => {
      for (const x of qs) {
        try {
          await budgetCheckBatch(x.d, x.items);
        } catch (e) {}
      }
    })();
  }, 450);
}

function deckTotalNow(d) {
  return deckPriceSums(deckPriceRows(d)).total;
}

async function budgetCheckBatch(d, items) {
  const bud = deckBudgetOf(d);
  if (!bud) return;
  try {
    await bulkIndexReady();
  } catch (e) {}
  const seen = new Set();
  for (const it of items) {
    const nm = it.card.name;
    if (seen.has(nm)) continue;
    seen.add(nm);
    if (knownEur(nm) === undefined) {
      try {
        await cheapestEur(it.card, true);
      } catch (e) {}
    }
  }
  // Only what is still in the main deck counts (an undo may have beaten us).
  const live = items.filter((it) => d.cards.includes(it.card));
  if (!live.length) return;
  const NL = appLang() === 'nl';
  const priceOf = (it) => knownEur(it.card.name);
  const overCard =
    bud.card != null
      ? live.filter((it) => {
          const v = priceOf(it);
          return typeof v === 'number' && v > bud.card + 1e-9;
        })
      : [];
  const total = deckTotalNow(d);
  const addsMoney = live.some((it) => {
    const v = priceOf(it);
    return typeof v === 'number' && v > 0;
  });
  const overDeck = bud.deck != null && total > bud.deck + 1e-9 && addsMoney;
  if (!overCard.length && !overDeck) return;
  const lines = [];
  if (overCard.length) {
    const names = [];
    overCard.forEach((it) => {
      const s = it.card.name + ' (' + fmtEur(priceOf(it)) + ')';
      if (!names.includes(s)) names.push(s);
    });
    const list =
      names.slice(0, 5).join(', ') +
      (names.length > 5
        ? (NL ? ' en nog ' : ' and ') + (names.length - 5) + (NL ? '' : ' more')
        : '');
    lines.push(
      NL
        ? names.length === 1
          ? list + ' kost meer dan je kaartbudget van ' + fmtEur(bud.card) + '.'
          : names.length +
            ' kaarten kosten meer dan je kaartbudget van ' +
            fmtEur(bud.card) +
            ': ' +
            list +
            '.'
        : names.length === 1
          ? list + ' costs more than your card budget of ' + fmtEur(bud.card) + '.'
          : names.length +
            ' cards cost more than your card budget of ' +
            fmtEur(bud.card) +
            ': ' +
            list +
            '.',
    );
  }
  if (overDeck) {
    lines.push(
      NL
        ? d.name +
            ' kost nu ' +
            fmtEur(total) +
            ', ' +
            fmtEur(total - bud.deck) +
            ' boven je deckbudget van ' +
            fmtEur(bud.deck) +
            '.'
        : d.name +
            ' now costs ' +
            fmtEur(total) +
            ', ' +
            fmtEur(total - bud.deck) +
            ' over your deck budget of ' +
            fmtEur(bud.deck) +
            '.',
    );
  }
  // Remove what caused it: the whole batch when the deck went over, else
  // only the cards above the card budget.
  const drop = overDeck ? live : overCard;
  const n = drop.length;
  openInAppConfirm(
    (NL ? 'Buiten budget\n' : 'Over budget\n') + lines.join('\n'),
    (ok) => {
      if (!ok) return;
      let gone = 0;
      drop.forEach((it) => {
        const i = d.cards.indexOf(it.card);
        if (i < 0) return;
        d.cards.splice(i, 1);
        if (it.kind === 'toMain') {
          ensureMaybeboard(d).push(it.card);
          logDeckChange(d, { type: 'toMaybe', name: it.card.name, card: it.card });
        } else logDeckChange(d, { type: 'remove', name: it.card.name, card: it.card });
        gone++;
      });
      if (!gone) return;
      scheduleSave(d);
      toast(
        NL
          ? gone === 1
            ? drop[0].card.name + ' is er weer uit.'
            : gone + ' kaarten zijn er weer uit.'
          : gone === 1
            ? drop[0].card.name + ' is out again.'
            : gone + ' cards are out again.',
      );
      if (
        state.screen === 'decklist' &&
        state.activeDeckId === d.id &&
        !document.querySelector('.overlay:not(.swipe-leaving)')
      )
        render();
    },
    {
      ok: NL ? (n === 1 ? 'Verwijderen' : n + ' verwijderen') : n === 1 ? 'Remove' : 'Remove ' + n,
      cancel: NL ? 'Houden' : 'Keep',
      icon: 'coins',
    },
  );
}

/* ── Format legality ─ Scryfall's legalities map as a chip grid, the
   Moxfield way: green = legal, red = banned, amber = restricted, grey =
   not legal. Sits between Oracle text and Rulings on every card view. ── */
const LEG_GRID_ROWS = [
  ['standard', 'Standard'],
  ['modern', 'Modern'],
  ['legacy', 'Legacy'],
  ['vintage', 'Vintage'],
  ['pauper', 'Pauper'],
  ['premodern', 'Premodern'],
  ['commander', 'Commander'],
  ['paupercommander', 'Pauper Cmdr'],
  ['duel', 'Duel Cmdr'],
  ['predh', 'PreDH'],
];

function _legRowsHtml(L, pending) {
  return LEG_GRID_ROWS.map(([k, label]) => {
    const v = L[k] || (pending ? 'pending' : 'not_legal');
    const cls = v === 'legal' ? 'ok' : v === 'banned' ? 'ban' : v === 'restricted' ? 'res' : 'no';
    const word =
      v === 'legal'
        ? 'Legal'
        : v === 'banned'
          ? 'Banned'
          : v === 'restricted'
            ? 'Restr.'
            : v === 'pending'
              ? '\u2026'
              : 'Not legal';
    return /* HTML */ `<div class="leg-row">
      <span class="leg-name">${label}</span><span class="leg-chip ${cls}">${word}</span>
    </div>`;
  }).join('');
}

/* Stored legality snapshots freeze (previews stay 'not legal' forever) and
   slim storage drops them entirely — which used to paint honest absence as
   "Not legal" in every row. The grid now shows '\u2026' for unknowns and always
   re-reads the live card once per session, repainting itself in place. */
const _legLiveCache = new Map();

function legalityBlockHtml(card) {
  const L = (card && card.legalities) || {};
  const cached = card && _legLiveCache.get(card.name);
  const use = cached || L;
  const gid = 'leg' + Math.random().toString(36).slice(2, 9);
  if (card && !cached) queueMicrotask(() => _legBlockRefresh(gid, card));
  return /* HTML */ `<div class="leg-grid" id="${gid}">
    ${_legRowsHtml(use, !Object.keys(use).length)}
  </div>`;
}

async function _legBlockRefresh(gid, card) {
  try {
    const r = await sfFetch(
      SF_BASE + '/cards/named?exact=' + encodeURIComponent(card.name),
      0,
      false,
    );
    if (!r || !r.ok) return;
    const f = await r.json();
    if (!f || !f.legalities) return;
    _legLiveCache.set(card.name, f.legalities);
    card.legalities = f.legalities; // in-memory heal for this session
    const el = document.getElementById(gid);
    if (el) el.innerHTML = _legRowsHtml(f.legalities, false);
  } catch (err) {}
}

/* ── Format reference ─ rules digests for the accordion in Extras. ── */
const FORMAT_RULES = [
  [
    'standard',
    'Standard',
    '60+ cards, sideboard up to 15, max 4 copies, 20 life. The newest sets only: about three years. No rotation in 2026; from 2027 the oldest sets leave with the year\u2019s first set.',
  ],
  [
    'pauper',
    'Pauper',
    '60+ cards, sideboard up to 15, max 4 copies, 20 life. Only cards ever printed at common.',
  ],
  [
    'modern',
    'Modern',
    '60+ cards, sideboard up to 15, max 4 copies, 20 life. Every set from Eighth Edition and Mirrodin (2003) on. Never rotates.',
  ],
  [
    'legacy',
    'Legacy',
    '60+ cards, sideboard up to 15, max 4 copies, 20 life. All of Magic, with a long ban list.',
  ],
  [
    'vintage',
    'Vintage',
    '60+ cards, sideboard up to 15, max 4 copies, 20 life. All of Magic; the strongest cards are restricted to 1 copy.',
  ],
  [
    'premodern',
    'Premodern',
    '60-card minimum, 4 copies max, sets from Fourth Edition through Scourge (1995–2003).',
  ],
  [
    'commander',
    'Commander',
    '100-card singleton led by a legendary commander, 40 life, colour identity rules, official ban list.',
  ],
  [
    'paupercommander',
    'Pauper Commander',
    'Commander, but the 99 are commons and the commander is any uncommon creature. 30 life, 16 commander damage.',
  ],
  [
    'duel',
    'Duel Commander',
    'Competitive 1v1 Commander: 20 life, no commander damage, no sideboard, its own stricter ban list.',
  ],
  [
    'predh',
    'PreDH',
    'Commander frozen in time: only cards printed before New Phyrexia (2011), no cards or rules from after.',
  ],
];

const FORMAT_RULES_NL = {
  standard:
    '60+ kaarten, sideboard tot 15, max. 4 exemplaren, 20 life. Alleen de nieuwste sets: ongeveer drie jaar. Geen rotatie in 2026; vanaf 2027 vallen de oudste sets af bij de eerste set van het jaar.',
  pauper:
    '60+ kaarten, sideboard tot 15, max. 4 exemplaren, 20 life. Alleen kaarten die ooit als common zijn uitgebracht.',
  modern:
    '60+ kaarten, sideboard tot 15, max. 4 exemplaren, 20 life. Elke set vanaf Eighth Edition en Mirrodin (2003). Roteert nooit.',
  legacy:
    '60+ kaarten, sideboard tot 15, max. 4 exemplaren, 20 life. Heel Magic, met een lange banlijst.',
  vintage:
    '60+ kaarten, sideboard tot 15, max. 4 exemplaren, 20 life. Heel Magic; de sterkste kaarten zijn restricted tot 1 exemplaar.',
  premodern:
    'Minstens 60 kaarten, max. 4 exemplaren, sets van Fourth Edition tot en met Scourge (1995\u20132003).',
  commander:
    'Singleton-deck van 100 kaarten onder leiding van een legendary commander, 40 life, color identity-regels, offici\u00eble banlijst.',
  paupercommander:
    'Commander, maar de 99 zijn commons en de commander is een uncommon creature naar keuze. 30 life, 16 commander damage.',
  duel: 'Competitieve Commander voor twee: 20 life, geen commander damage, geen sideboard en een eigen, strengere banlijst.',
  predh:
    'Commander bevroren in de tijd: alleen kaarten van v\u00f3\u00f3r New Phyrexia (2011), geen kaarten of regels van daarna.',
};

function fmtRulesBodyHtml() {
  // Bottom-up (.acc-up): the digest sits right above the format's name, the
  // Complete rules button above that, the full text above the button.
  const _fnl = appLang() === 'nl';
  const byId = {};
  FORMAT_RULES.forEach((r) => {
    byId[r[0]] = r;
  });
  return EXTRAS_FMT_ORDER.filter((k) => byId[k])
    .map((k) => byId[k])
    .map(
      ([id, label, txt]) =>
        `<div class="settings-row" data-fmtrule="${id}" style="cursor:pointer;flex-wrap:wrap;"><div style="flex:1;"><div class="l1 sub-fold">${label}${foldIcoHtml(false)}</div><div class="l2" data-fmtruletxt="${id}" hidden><span>${(_fnl && FORMAT_RULES_NL[id]) || txt}</span><button type="button" class="ghost-btn" data-fmtfull="${id}" style="display:block;width:100%;margin:2px 0;">${foldIcoHtml(false)} ${trS('Complete rules')}</button><div data-fmtfullbox="${id}" hidden></div></div></div></div>`,
    )
    .join('');
}

const FMT_FULL_NL = {
  standard:
    '<div class="rules-text"><h4>Deckbouw</h4><p>Een main deck van minstens 60 kaarten — zonder maximum — en een sideboard van hooguit 15. Niet meer dan vier exemplaren van een kaart met dezelfde Engelse naam, main deck en sideboard samen. Basic lands, en kaarten waarvan de eigen tekst het toestaat, zijn onbeperkt.</p><h4>Kaartpool</h4><p>De nieuwste premier sets — zo’n drie jaar aan sets. In 2026 is er geen rotatie. Vanaf 2027 roteren de oudste sets eens per jaar uit, als de eerste set van het jaar verschijnt. Foundations blijft legaal tot minstens 2029. Een kaart is legaal als een van zijn prints in een van die sets zit.</p><h4>Spelen</h4><p>Twee spelers, elk 20 life, een starthand van 7 kaarten en de London mulligan. Toernooien spelen best-of-three; tussen de potjes mag je kaarten één-op-één wisselen met je sideboard.</p><h4>Bans</h4><p>Wizards of the Coast kondigt wijzigingen aan op vaste momenten. Deze app haalt de officiële lijst één keer per dag op — zie Banlijsten hierboven.</p></div>',
  modern:
    '<div class="rules-text"><h4>Deckbouw</h4><p>Een main deck van minstens 60 kaarten — zonder maximum — en een sideboard van hooguit 15. Niet meer dan vier exemplaren van een kaart met dezelfde Engelse naam, main deck en sideboard samen. Basic lands, en kaarten waarvan de eigen tekst het toestaat, zijn onbeperkt.</p><h4>Kaartpool</h4><p>Elke kaart uit Eighth Edition, Mirrodin en elke Standard-set daarna, plus de sets die rechtstreeks voor Modern zijn gemaakt (Modern Horizons). Modern roteert nooit — het groeit alleen.</p><h4>Spelen</h4><p>Twee spelers, elk 20 life, een starthand van 7 kaarten en de London mulligan. Toernooien spelen best-of-three; tussen de potjes mag je kaarten één-op-één wisselen met je sideboard.</p><h4>Bans</h4><p>Wizards of the Coast kondigt wijzigingen aan op vaste momenten. Deze app haalt de officiële lijst één keer per dag op — zie Banlijsten hierboven.</p></div>',
  legacy:
    '<div class="rules-text"><h4>Deckbouw</h4><p>Een main deck van minstens 60 kaarten — zonder maximum — en een sideboard van hooguit 15. Niet meer dan vier exemplaren van een kaart met dezelfde Engelse naam, main deck en sideboard samen. Basic lands, en kaarten waarvan de eigen tekst het toestaat, zijn onbeperkt.</p><h4>Kaartpool</h4><p>Elke set uit de geschiedenis van Magic. Conspiracy-kaarten, ante-kaarten en kaarten met stickers of Attractions zijn gebannen op hun type.</p><h4>Spelen</h4><p>Twee spelers, elk 20 life, een starthand van 7 kaarten en de London mulligan. Toernooien spelen best-of-three; tussen de potjes mag je kaarten één-op-één wisselen met je sideboard.</p><h4>Bans</h4><p>Een lange lijst: de kaarten die een potje beëindigen voordat het begonnen is, of de andere speler buitenspel zetten. Wizards kondigt wijzigingen aan op vaste momenten; de app haalt de lijst dagelijks op — zie Banlijsten hierboven.</p></div>',
  vintage:
    '<div class="rules-text"><h4>Deckbouw</h4><p>Een main deck van minstens 60 kaarten en een sideboard van hooguit 15. Tot vier exemplaren van een kaart — maar een kaart op de <em>restricted</em>-lijst mag maar één keer voorkomen, main deck en sideboard samen. Basic lands zijn onbeperkt.</p><h4>Kaartpool</h4><p>Heel Magic, terug tot Alpha — de Power Nine incluis. Conspiracy-kaarten, ante-kaarten en kaarten met stickers of Attractions zijn gebannen op hun type.</p><h4>Spelen</h4><p>Twee spelers, elk 20 life, een starthand van 7 kaarten en de London mulligan. Toernooien spelen best-of-three; tussen de potjes mag je kaarten één-op-één wisselen met je sideboard.</p><h4>Bans en restricties</h4><p>Bijna niets is gebannen; de sterkste kaarten zijn in plaats daarvan restricted tot één exemplaar. Beide lijsten worden dagelijks opgehaald — zie Banlijsten hierboven.</p></div>',
  pauper:
    '<div class="rules-text"><h4>Deckbouw</h4><p>Een main deck van minstens 60 kaarten — zonder maximum — en een sideboard van hooguit 15. Niet meer dan vier exemplaren van een kaart met dezelfde Engelse naam, main deck en sideboard samen. Basic lands, en kaarten waarvan de eigen tekst het toestaat, zijn onbeperkt.</p><h4>Kaartpool</h4><p>Elke kaart die ooit als common is uitgebracht, op papier of op Magic Online — welke rarity zijn andere prints ook hebben.</p><h4>Spelen</h4><p>Twee spelers, elk 20 life, een starthand van 7 kaarten en de London mulligan. Toernooien spelen best-of-three; tussen de potjes mag je kaarten één-op-één wisselen met je sideboard.</p><h4>Bans</h4><p>Het Pauper Format Panel stelt de lijst op samen met Wizards of the Coast. De app haalt hem dagelijks op — zie Banlijsten hierboven.</p></div>',
  premodern:
    '<div class="rules-text"><h4>Deckbouw</h4><p>Minstens 60 kaarten, een sideboard van 15 als je wilt, maximaal 4 exemplaren per kaartnaam (basic lands uitgezonderd).</p><h4>Kaartpool</h4><p>Sets van Fourth Edition tot en met Scourge (1995–2003) — het tijdperk tussen de oudste kaarten van Magic en het moderne kaartframe.</p><h4>Spelen</h4><p>20 life, London mulligan, matches in best-of-three.</p><h4>Bans</h4><p>Een banlijst die de community zelf bijhoudt, afgestemd op een gevarieerde old-school meta — zie Banlijsten hierboven.</p></div>',
  paupercommander:
    '<div class="rules-text"><h4>Je commander</h4><p>Elke creature die ooit als <em>uncommon</em> is uitgebracht, mag het deck leiden. Zijn color identity bepaalt de kleuren van het deck, precies zoals in Commander.</p><h4>Deckbouw</h4><p>De commander plus 99 andere kaarten, die elk ooit ergens als <em>common</em> zijn uitgebracht. Singleton: geen twee kaarten met dezelfde naam (basic lands uitgezonderd). Geen enkele kaart mag buiten de color identity van de commander vallen.</p><h4>Spelen</h4><p>Multiplayer; spelers beginnen met 30 life. De commander werkt zoals in Commander — command zone, {2} extra voor elke keer dat je hem opnieuw cast — en 16 combat damage van dezelfde commander schakelt een speler uit.</p><p>Sinds november 2024 telt alleen een uncommon-druk uit een gewone set (core, expansion, Masters, draft innovation, precons); Secret Lair, promo\u2019s en dergelijke tellen niet mee.</p><h4>Bans</h4><p>Een heel korte communitylijst — de common-rarity doet het meeste werk — zie Banlijsten hierboven.</p></div>',
  duel: '<div class="rules-text"><h4>Deckbouw</h4><p>Een singleton-deck van 100 kaarten onder leiding van een legendary commander, gebouwd binnen zijn color identity — het Commander-skelet, afgestemd op één tegen één.</p><h4>Spelen</h4><p>Twee spelers, elk 20 life; wie begint, slaat zijn eerste draw over. Commander damage bestaat niet: je wint op life, poison en de gewone manieren. Er wordt zonder sideboard gespeeld.</p><h4>Bans</h4><p>Een onafhankelijk regelcomité houdt een eigen, strengere banlijst bij, met ook kaarten die alleen <em>als commander</em> gebannen zijn — zie Banlijsten hierboven.</p></div>',
  predh:
    '<div class="rules-text"><h4>Het idee</h4><p>Commander zoals het er in het voorjaar van 2011 uitzag: alleen kaarten van vóór New Phyrexia zijn legaal, en niets wat later kwam — geen planeswalker-commanders, geen partners, geen kaarten die voor Commander-producten zijn ontworpen.</p><h4>Deckbouw</h4><p>Een singleton-deck van 100 kaarten onder leiding van een legendary creature, gebouwd binnen zijn color identity, alleen met prints van vóór 2011.</p><h4>Spelen</h4><p>Multiplayer, 40 life; 21 commander damage van dezelfde commander schakelt een speler uit — de klassieke regels van toen.</p><h4>Bans</h4><p>De banlijst staat stil op de Commander-lijst van 2011 en wordt bewaard door de PreDH-community — zie Banlijsten hierboven.</p></div>',
};

function fmtFullRulesHtml(id) {
  if (id === 'commander') return commanderFullRulesHtml();
  if (appLang() === 'nl' && FMT_FULL_NL[id]) return FMT_FULL_NL[id];
  const F = {
    standard: `<div class="rules-text"><h4>Deck construction</h4><p>A main deck of at least 60 cards — no maximum — and a sideboard of up to 15. No more than four copies of any card by English name, counting main deck and sideboard together. Basic lands, and cards whose own text says so, are unlimited.</p><h4>Card pool</h4><p>The newest premier sets — about three years of them. There is no rotation in 2026. From 2027 the oldest sets rotate out once a year, when the year's first set comes out. Foundations stays legal until at least 2029. A card is legal if any printing of it is in one of those sets.</p><h4>Playing</h4><p>Two players, 20 life each, a 7-card hand and the London mulligan. Tournaments play best-of-three; between games you may swap cards with your sideboard, one for one.</p><h4>Bans</h4><p>Wizards of the Coast announces changes on a fixed schedule. This app fetches the official list once a day — see Ban lists above.</p></div>`,
    modern: `<div class="rules-text"><h4>Deck construction</h4><p>A main deck of at least 60 cards — no maximum — and a sideboard of up to 15. No more than four copies of any card by English name, counting main deck and sideboard together. Basic lands, and cards whose own text says so, are unlimited.</p><h4>Card pool</h4><p>Every card printed in Eighth Edition, Mirrodin and every Standard set after them, plus sets made straight for Modern (Modern Horizons). It never rotates — it only grows.</p><h4>Playing</h4><p>Two players, 20 life each, a 7-card hand and the London mulligan. Tournaments play best-of-three; between games you may swap cards with your sideboard, one for one.</p><h4>Bans</h4><p>Wizards of the Coast announces changes on a fixed schedule. This app fetches the official list once a day — see Ban lists above.</p></div>`,
    legacy: `<div class="rules-text"><h4>Deck construction</h4><p>A main deck of at least 60 cards — no maximum — and a sideboard of up to 15. No more than four copies of any card by English name, counting main deck and sideboard together. Basic lands, and cards whose own text says so, are unlimited.</p><h4>Card pool</h4><p>Every set in Magic's history. Conspiracy cards, ante cards and cards with stickers or Attractions are banned by type.</p><h4>Playing</h4><p>Two players, 20 life each, a 7-card hand and the London mulligan. Tournaments play best-of-three; between games you may swap cards with your sideboard, one for one.</p><h4>Bans</h4><p>A long list: the cards that would end games before they start, or lock the other player out. Wizards announces changes on a fixed schedule; the app fetches the list daily — see Ban lists above.</p></div>`,
    vintage: `<div class="rules-text"><h4>Deck construction</h4><p>A main deck of at least 60 cards and a sideboard of up to 15. Up to four copies of any card — but a card on the <em>restricted</em> list may appear only once, main deck and sideboard together. Basic lands are unlimited.</p><h4>Card pool</h4><p>All of Magic, back to Alpha — the Power Nine included. Conspiracy cards, ante cards and cards with stickers or Attractions are banned by type.</p><h4>Playing</h4><p>Two players, 20 life each, a 7-card hand and the London mulligan. Tournaments play best-of-three; between games you may swap cards with your sideboard, one for one.</p><h4>Bans and restrictions</h4><p>Almost nothing is banned; the most powerful cards are restricted to one copy instead. Both lists are fetched daily — see Ban lists above.</p></div>`,
    pauper: `<div class="rules-text"><h4>Deck construction</h4><p>A main deck of at least 60 cards — no maximum — and a sideboard of up to 15. No more than four copies of any card by English name, counting main deck and sideboard together. Basic lands, and cards whose own text says so, are unlimited.</p><h4>Card pool</h4><p>Any card that has ever been printed at common, in paper or on Magic Online — whatever rarity its other printings carry.</p><h4>Playing</h4><p>Two players, 20 life each, a 7-card hand and the London mulligan. Tournaments play best-of-three; between games you may swap cards with your sideboard, one for one.</p><h4>Bans</h4><p>The Pauper Format Panel works with Wizards of the Coast on the list. The app fetches it daily — see Ban lists above.</p></div>`,
    premodern: `<div class="rules-text"><h4>Deck construction</h4><p>At least 60 cards, optional 15-card sideboard, maximum 4 copies of any card by name (basic lands excepted).</p><h4>Card pool</h4><p>Sets from Fourth Edition through Scourge (1995–2003) — the era between Magic's oldest cards and the modern frame.</p><h4>Playing</h4><p>20 life, London mulligan, best-of-three matches.</p><h4>Bans</h4><p>A community-maintained banned list tuned for a diverse old-school metagame — see the Banned List section.</p></div>`,
    paupercommander: `<div class="rules-text"><h4>Your commander</h4><p>Any creature that has been printed at <em>uncommon</em> rarity may lead the deck. Its color identity sets the deck's colors, exactly as in Commander.</p><h4>Deck construction</h4><p>The commander plus 99 other cards, every one of them printed at <em>common</em> somewhere in Magic's history. Singleton: no two cards share a name (basic lands excepted). No card's color identity may leave the commander's.</p><h4>Playing</h4><p>Multiplayer, players start at 30 life. The commander works as in Commander — command zone, tax of {2} per recast — and 16 combat damage from the same commander eliminates a player.</p><p>Since November 2024 only an uncommon printing from a regular product counts (core, expansion, Masters, draft innovation, precons); Secret Lair, promos and the like do not.</p><h4>Bans</h4><p>A very short community list — common rarity does most of the policing — see the Banned List section.</p></div>`,
    duel: `<div class="rules-text"><h4>Deck construction</h4><p>A 100-card singleton deck led by a legendary commander, built within its color identity — the Commander skeleton, tuned for one-on-one play.</p><h4>Playing</h4><p>Two players, 20 life each, first player skips their first draw. There is no commander damage rule: games are won on life, poison and the usual ways. No sideboards.</p><h4>Bans</h4><p>An independent rules committee maintains a stricter banned list of its own, including cards <em>banned as commander</em> only — see the Banned List section.</p></div>`,
    predh: `<div class="rules-text"><h4>The idea</h4><p>Commander as it stood in spring 2011: only cards printed before New Phyrexia are legal, and nothing that arrived later — no planeswalker commanders, no partners, no cards designed for Commander products.</p><h4>Deck construction</h4><p>A 100-card singleton deck led by a legendary creature, built within its color identity, from pre-2011 printings only.</p><h4>Playing</h4><p>Multiplayer, 40 life, 21 commander damage from the same commander eliminates a player — the classic rules of the era.</p><h4>Bans</h4><p>The banned list is frozen to the Commander list as it stood in 2011, kept by the PreDH community — see the Banned List section.</p></div>`,
  };
  return F[id] || `<div class="rules-text"><p>No further rules recorded for this format.</p></div>`;
}

function banInfoHtml(fmt) {
  const M = {
    standard: `<p style="margin-top:0;">Wizards of the Coast tends this list through official Banned &amp; Restricted announcements. Standard bans are rare and aimed at cards that dominate the metagame or produce play patterns the format is not meant to have; rotation quietly retires most problems on its own.</p>`,
    modern: `<p style="margin-top:0;">Wizards of the Coast tends this list. Modern never rotates, so bans are its only pressure valve — cards land here when they make games too fast, too repetitive, or push out too many other strategies.</p>`,
    legacy: `<p style="margin-top:0;">Wizards of the Coast tends this list. Legacy welcomes almost all of Magic's power, so the list concentrates on free wins: cards that end games before they begin or lock an opponent out of playing.</p>`,
    vintage: `<p style="margin-top:0;">Wizards of the Coast tends this list — but Vintage bans almost nothing. Cards that would be banned anywhere else are <em>restricted</em> to a single copy instead; the short banned list holds only cards impractical for tournament play.</p>`,
    pauper: `<p style="margin-top:0;">The Pauper Format Panel — community members working with Wizards of the Coast — tends this list, banning commons that outgrow the format's budget-friendly, interactive spirit.</p>`,
    premodern: `<p style="margin-top:0;">The Premodern community maintains this list itself, tuning it for a diverse metagame across the 1995–2003 card pool rather than raw power level.</p>`,
    commander: `<p style="margin-top:0;">The Commander Format Panel, together with Wizards of the Coast, tends this list. Commander is a social format: bans target cards that create miserable tables — not just strong cards — and the list is deliberately short, trusting Rule Zero conversations to do the rest.</p>`,
    paupercommander: `<p style="margin-top:0;">The Pauper Commander community keeps this list deliberately tiny — common rarity already filters out most of Magic's problem cards.</p>`,
    duel: `<p style="margin-top:0;">An independent Duel Commander rules committee maintains this list, updated on its own schedule. One-on-one play is far less forgiving than a four-player table, so many cards that are fine in regular Commander are banned here — some only from the command zone.</p>`,
    predh: `<p style="margin-top:0;">Frozen history: this is the Commander banned list as it stood in spring 2011, before New Phyrexia — the PreDH community preserves it rather than updates it.</p>`,
  };
  const MN = {
    standard: `<p style="margin-top:0;">Wizards of the Coast houdt deze lijst bij via offici\u00eble Banned &amp; Restricted-aankondigingen. Bans in Standard zijn zeldzaam en richten zich op kaarten die de meta domineren of speelpatronen opleveren die het format niet hoort te hebben; rotatie ruimt de meeste problemen vanzelf op.</p>`,
    modern: `<p style="margin-top:0;">Wizards of the Coast houdt deze lijst bij. Modern roteert nooit, dus bans zijn het enige ventiel \u2014 kaarten belanden hier als ze potjes te snel of te eentonig maken, of te veel andere strategie\u00ebn wegdrukken.</p>`,
    legacy: `<p style="margin-top:0;">Wizards of the Coast houdt deze lijst bij. Legacy verwelkomt bijna alle kracht van Magic, dus de lijst richt zich op gratis overwinningen: kaarten die een potje be\u00ebindigen voordat het begint, of een tegenstander buitensluiten.</p>`,
    vintage: `<p style="margin-top:0;">Wizards of the Coast houdt deze lijst bij \u2014 maar Vintage bant bijna niets. Kaarten die overal elders gebannen zouden zijn, zijn hier <em>restricted</em> tot \u00e9\u00e9n exemplaar; de korte banlijst bevat alleen kaarten die onpraktisch zijn op toernooien.</p>`,
    pauper: `<p style="margin-top:0;">Het Pauper Format Panel \u2014 communityleden die samenwerken met Wizards of the Coast \u2014 houdt deze lijst bij en bant commons die boven de betaalbare, interactieve geest van het format uitgroeien.</p>`,
    premodern: `<p style="margin-top:0;">De Premodern-community houdt deze lijst zelf bij en stemt hem af op een gevarieerde meta binnen de kaartpool van 1995\u20132003, niet op pure kracht.</p>`,
    commander: `<p style="margin-top:0;">Het Commander Format Panel houdt deze lijst bij, samen met Wizards of the Coast. Commander is een sociaal format: bans richten zich op kaarten die voor ellendige potjes zorgen \u2014 niet alleen op sterke kaarten \u2014 en de lijst is bewust kort, in vertrouwen op Rule Zero-gesprekken voor de rest.</p>`,
    paupercommander: `<p style="margin-top:0;">De Pauper Commander-community houdt deze lijst bewust piepklein \u2014 de common-rarity filtert de meeste probleemkaarten van Magic al weg.</p>`,
    duel: `<p style="margin-top:0;">Een onafhankelijk regelcomit\u00e9 voor Duel Commander houdt deze lijst bij, op een eigen schema. Een\u2011tegen\u2011een is veel minder vergevingsgezind dan een tafel met vier, dus veel kaarten die in gewone Commander prima zijn, zijn hier gebannen \u2014 sommige alleen vanuit de command zone.</p>`,
    predh: `<p style="margin-top:0;">Bevroren geschiedenis: dit is de Commander-banlijst zoals die in het voorjaar van 2011 was, v\u00f3\u00f3r New Phyrexia \u2014 de PreDH-community bewaart hem in plaats van hem bij te werken.</p>`,
  };
  const _bm = (appLang() === 'nl' && MN[fmt]) || M[fmt];
  return /* HTML */ `<div
    class="rules-text"
    style="margin-bottom:10px;padding:12px;background:var(--ink-2);border-radius:8px;border:2px solid var(--line);"
  >
    ${_bm || `<p style="margin-top:0;">${appLang() === 'nl' ? 'Geen achtergrond bij deze lijst.' : 'No background notes for this list.'}</p>`}
  </div>`;
}

/* Magic news: served by this site's own Netlify Function (see
   netlify/functions/news.js in the repo), which aggregates EDHREC's
   WordPress JSON and MTGGoldfish's RSS server-side — same origin, no CORS.
   Served from a 3h qdb cache first; the function itself also caches. */
let _newsItems = [];

/* The format a news item belongs to, in words. EDHREC pieces are Commander
   by definition; MTGGoldfish pieces carry whatever its slug/title revealed. */
const NEWS_FMT_LABELS = {
  commander: 'Commander',
  brawl: 'Brawl',
  premodern: 'Premodern',
  pauper: 'Pauper',
  legacy: 'Legacy',
  vintage: 'Vintage',
  modern: 'Modern',
  pioneer: 'Pioneer',
  standard: 'Standard',
  historic: 'Arena',
  limited: 'Limited',
};

function newsFmtLabel(a) {
  return (a && a.fmt && NEWS_FMT_LABELS[a.fmt]) || '';
}

/* Preview sheet: image, title, excerpt — reading happens on the source's
   own site via the single outbound button (their work, their page). */
function openNewsPreview(a) {
  if (!a || document.getElementById('newsPrevPop')) return;
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.id = 'newsPrevPop';
  const d = a.d ? new Date(a.d) : null;
  const ds =
    d && !isNaN(d)
      ? d.toLocaleDateString(appLang() === 'nl' ? 'nl-NL' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';
  bd.innerHTML = /* HTML */ `<div class="modal-sheet nw-sheet">
    ${a.img && /^https:\/\//.test(a.img) ? `<img class="nw-hero" src="${escapeHtml(a.img)}" alt="" onerror="this.remove()">` : ''}
    <h3 style="margin:10px 0 2px;">${escapeHtml(a.t)}</h3>
    <div class="nw-m" style="margin-bottom:8px;">
      ${newsFmtLabel(a) ? `<span class="nw-fmt">${escapeHtml(newsFmtLabel(a))}</span>` : ''}${escapeHtml(a.src || '')}${ds ? ' · ' + ds : ''}
    </div>
    ${a.x ? `<p class="nw-x">${escapeHtml(a.x)}</p>` : ''}
    <button class="add-btn nw-read" id="newsPrevGo">
      Read on ${escapeHtml(a.src || 'the site')} →
    </button>
    <button class="ghost-btn" id="newsPrevClose" style="width:100%;margin-top:8px;">Close</button>
  </div>`;
  const close = () => {
    const el = document.getElementById('newsPrevPop');
    if (el) el.remove();
  };
  const closeAndPop = () => {
    close();
    const st = state.overlayStack;
    if (st.length && st[st.length - 1].id === 'newsPrev') st.pop();
  };
  bd.addEventListener('click', (e) => {
    if (e.target === bd) closeAndPop();
  });
  bd.querySelector('#newsPrevClose').addEventListener('click', closeAndPop);
  bd.querySelector('#newsPrevGo').addEventListener('click', () => {
    try {
      window.open(a.u, '_blank', 'noopener');
    } catch (e) {}
  });
  document.body.appendChild(bd);
  pushOverlay('newsPrev', close);
}

async function loadMtgNews(box) {
  if (!box.dataset.nwWired) {
    box.dataset.nwWired = '1';
    box.addEventListener('click', (e) => {
      const a = e.target.closest('.news-item');
      if (!a) return;
      e.preventDefault();
      openNewsPreview(_newsItems[+a.dataset.ni]);
    });
  }
  box.innerHTML = '<span class="l2">Loading…</span>';
  try {
    const ck = 'mtgnews5'; // v5: items carry a detected format
    let data = null;
    try {
      const disk = await qdbGet(ck);
      if (
        disk &&
        Array.isArray(disk.v) &&
        disk.v.length &&
        Date.now() - (disk.t || 0) < 3 * 3600e3 &&
        disk.v.some((a) => a && (a.img || a.x))
      )
        data = disk.v; // old-shape cache never squats
    } catch (e) {}
    if (!data) {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch('/.netlify/functions/news', { signal: ctl.signal });
      clearTimeout(tm);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      data = Array.isArray(j.items) ? j.items : [];
      if (data.length) qdbSet(ck, data);
    }
    if (!data || !data.length) {
      box.innerHTML = '<span class="l2">No articles right now.</span>';
      return;
    }
    _newsItems = data.slice(0, 20);
    box.innerHTML = _newsItems
      .map((a, ni) => {
        const d = a.d ? new Date(a.d) : null;
        const ds =
          d && !isNaN(d)
            ? d.toLocaleDateString(appLang() === 'nl' ? 'nl-NL' : 'en-GB', {
                day: 'numeric',
                month: 'short',
              })
            : '';
        const im =
          a.img && /^https:\/\//.test(a.img)
            ? `<img class="nw-img" src="${escapeHtml(a.img)}" alt="" loading="lazy" onerror="this.style.display='none'">`
            : '';
        const fl = newsFmtLabel(a);
        return `<a class="news-item" data-ni="${ni}" href="${escapeHtml(a.u)}" target="_blank" rel="noopener noreferrer">${im}<span class="nw-body"><span class="nw-t">${escapeHtml(a.t)}</span><span class="nw-m">${fl ? `<span class="nw-fmt">${escapeHtml(fl)}</span>` : ''}${escapeHtml(a.src || '')}${ds ? ' · ' + ds : ''}</span></span></a>`;
      })
      .join('');
    // 1.27: a wide screen reads the news in rows of three. The box stays
    // column-reverse, so the first row (newest) sits at its foot.
    try {
      if (window.matchMedia('(min-width: 1000px)').matches) {
        const items = Array.from(box.querySelectorAll(':scope > .news-item'));
        const frag = document.createDocumentFragment();
        for (let i = 0; i < items.length; i += 3) {
          const row = document.createElement('div');
          row.className = 'news-row';
          items.slice(i, i + 3).forEach((x) => row.appendChild(x));
          frag.appendChild(row);
        }
        box.innerHTML = '';
        box.appendChild(frag);
        box.classList.add('news-grid');
      }
    } catch (e) {}
  } catch (e) {
    box.innerHTML =
      '<span class="l2">Couldn’t load articles right now — check your connection, or the news function isn’t deployed yet.</span>';
  }
}

async function fillBanList(fmt, box) {
  box.innerHTML = '<span class="l2">Loading…</span>';
  try {
    if (!window._banCache) window._banCache = {};
    if (isConstructedFmt(fmt)) {
      // The same list the deck checks use: seeded, then refreshed daily.
      await ensureFmtBans(fmt, !_fmtBansStore()[fmt]);
      const B = fmtBanSets(fmt);
      window._banCache[fmt] = {
        names: B.names,
        more: false,
        total: B.names.length,
        restricted: B.restrictedNames,
      };
    } else if (!window._banCache[fmt]) {
      const r = await sfFetch(
        `${SF_BASE}/cards/search?order=name&q=${encodeURIComponent('banned:' + fmt)}`,
      );
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      window._banCache[fmt] = {
        names: (j.data || []).map((c) => c.name),
        more: !!j.has_more,
        total: j.total_cards || (j.data || []).length,
      };
    }
    const b = window._banCache[fmt];
    // Two columns of tappable names — tap one for the card image.
    // Bottom-up (.acc-up): the hint sits right above the format's name,
    // the list above it, the restricted list (Vintage) and the notes on top.
    const grid = (names) =>
      `<div class="banlist-grid">${names.map((n) => `<button type="button" class="ban-item" data-name="${encodeURIComponent(n)}">${escapeHtml(n)}</button>`).join('')}</div>`;
    // The notes are a long read, top to bottom: the one fold that opens

    // for the other formats).
    const whyHtml = `<div class="banwhy-wrap"><button type="button" class="ghost-btn" data-banwhy="${fmt}" style="display:block;width:100%;margin:2px 0;">${foldIcoHtml(false)} ${trS('About this ban list')}</button><div data-banwhybox hidden></div></div>`;
    box.innerHTML =
      `<div class="l2">${trS('Tap a name for the card.')}</div>` +
      whyHtml +
      `<div>${isConstructedFmt(fmt) ? `<div class="ban-sub">${trS('Banned')} · ${b.names.length}</div>` : ''}${b.names.length ? grid(b.names) : `<div class="l2">${trS('Nothing banned beyond ante, Conspiracy and sticker cards.')}</div>`}</div>` +
      (b.more ? `<div class="l2">… ${b.total} total — full list on Scryfall.</div>` : '') +
      (b.restricted && b.restricted.length
        ? `<div><div class="ban-sub">${trS('Restricted — 1 copy')} · ${b.restricted.length}</div>${grid(b.restricted)}</div>`
        : '');
  } catch (e) {
    box.innerHTML = '<span class="l2">Couldn\u2019t load this ban list right now.</span>';
  }
}

async function openBanCardPreview(btn) {
  const name = decodeURIComponent(btn.dataset.name);
  if (btn.disabled) return;
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Loading…';
  try {
    const res = await sfFetch(SF_BASE + '/cards/named?fuzzy=' + encodeURIComponent(name));
    if (res.ok) {
      const card = await res.json();
      showPreview(cardImageLarge(card), card.border_color === 'white');
    } else toast("Couldn't find that card on Scryfall.");
  } catch (e) {
    toast("Couldn't reach Scryfall.");
  }
  btn.disabled = false;
  btn.textContent = orig;
}

/* The community's 100 saltiest cards, from EDHREC's top-salt page (same
   week cache as everything EDHREC). Bottom-up, per the charter: saltiest at
   the FOOT where the eye starts, sweeter climbing upward — the page opens
   scrolled to the bottom. Two columns, salt score under each card image,
   standard app navigation beneath. */
async function openSaltiestOverlay() {
  pushOverlay('saltiest', () => {
    document.getElementById('saltOverlay')?.remove();
  });
  let el = document.getElementById('saltOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'saltOverlay';
  }
  document.body.appendChild(el);
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml('Saltiest Cards')}
    <main>
      <div class="status"><div class="spinner"></div></div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  let ix = null;
  try {
    ix = await bulkIndexReady();
  } catch (e) {}
  let rows = [];
  try {
    const data = await edhrecFetchJson('/pages/top/salt.json');
    const lists = (((data || {}).container || {}).json_dict || {}).cardlists || [];
    let cvs = [];
    lists.forEach((L) => {
      if (cvs.length < 100) cvs = cvs.concat((L && L.cardviews) || []);
    });
    rows = cvs
      .slice(0, 100)
      .map((cv, i) => {
        let sv = Number(cv && cv.salt);
        if (!isFinite(sv)) {
          const m = /([0-9]+(?:\.[0-9]+)?)/.exec(String((cv && (cv.label || cv.value)) || ''));
          sv = m ? Number(m[1]) : NaN;
        }
        return { name: cv && cv.name, salt: isFinite(sv) ? sv : null, rank: i + 1 };
      })
      .filter((r) => r.name);
  } catch (e) {}
  const main = el.querySelector('main');
  if (!main || !document.getElementById('saltOverlay')) return; // closed while loading
  if (!rows.length) {
    main.innerHTML = /* HTML */ `<div class="error-note">
      Couldn't reach EDHREC's salt list. Check your connection and try again.
    </div>`;
    return;
  }
  // Bottom-up: rank 1 is written FIRST into a wrap-reverse grid, so it sits
  // bottom-left, by the thumb; the list climbs upward from there.
  const ordered = rows.slice();
  const fetched = {};
  main.innerHTML = /* HTML */ `<div class="salt-grid">
    ${ordered
      .map((r) => {
        const entry = ix && ix.byName ? ix.byName.get(String(r.name).toLowerCase()) : null;
        const img = entry
          ? `<img src="${cardImage(bulkToCardish(entry))}" alt="${escapeHtml(r.name)}" loading="lazy">`
          : `<div class="salt-noimg">${escapeHtml(r.name)}</div>`;
        return `<div class="salt-tile" role="button" tabindex="0" data-saltn="${escapeHtml(r.name)}">${img}
      <div class="salt-meta">#${r.rank} · 🧂 ${r.salt != null ? r.salt.toFixed(2) : '—'}</div>
    </div>`;
      })
      .join('')}
  </div>`;
  main.querySelectorAll('[data-saltn]').forEach((b) =>
    b.addEventListener('click', async () => {
      const name = b.dataset.saltn;
      const entry = ix && ix.byName ? ix.byName.get(String(name).toLowerCase()) : null;
      if (entry) {
        openCardInfo(bulkToCardish(entry));
        return;
      }
      if (fetched[name]) {
        openCardInfo(fetched[name]);
        return;
      }
      try {
        const r = await sfFetch(SF_BASE + '/cards/named?exact=' + encodeURIComponent(name));
        if (r.ok) openCardInfo(await r.json());
      } catch (e) {}
    }),
  );
  // The story starts at the salt mine's floor -- and stays there while the
  // images arrive, until the reader scrolls.
  let touched = false;
  main.addEventListener(
    'touchstart',
    () => {
      touched = true;
    },
    { passive: true, once: true },
  );
  main.addEventListener(
    'wheel',
    () => {
      touched = true;
    },
    { passive: true, once: true },
  );
  const toFoot = () => {
    if (!touched && main.isConnected) main.scrollTop = main.scrollHeight;
  };
  toFoot();
  requestAnimationFrame(toFoot);
  main.querySelectorAll('img').forEach((im) => im.addEventListener('load', toFoot, { once: true }));
  // Cards the phone's card file does not know (banned or very old ones):
  // one lookup each on the quiet lane, and their picture drops in.
  for (const r of ordered) {
    const hold = main.querySelector(`[data-saltn="${CSS.escape(r.name)}"] .salt-noimg`);
    if (!hold) continue;
    try {
      const res = await sfFetch(
        SF_BASE + '/cards/named?exact=' + encodeURIComponent(r.name),
        0,
        true,
      );
      if (!res.ok) continue;
      const card = await res.json();
      fetched[r.name] = card;
      const src = cardImage(card);
      if (src && hold.isConnected) {
        const im = document.createElement('img');
        im.src = src;
        im.alt = r.name;
        im.loading = 'lazy';
        im.addEventListener('load', toFoot, { once: true });
        hold.replaceWith(im);
      }
    } catch (e) {}
    if (!document.getElementById('saltOverlay')) break;
  }
}

async function edhrecSaltFor(card) {
  if (card._salt !== undefined) return card._salt;
  {
    const k = cardSaltKnown(card.name);
    if (k !== undefined) return (card._salt = k);
  }
  try {
    const data = await edhrecFetchJson('/pages/cards/' + edhrecSlug(card.name) + '.json');
    const c2 = (((data || {}).container || {}).json_dict || {}).card || {};
    let v = Number(c2.salt);
    if (!isFinite(v)) {
      const m2 = /"salt":\s*([0-9.]+)/.exec(JSON.stringify(data) || '');
      v = m2 ? Number(m2[1]) : NaN;
    }
    card._salt = isFinite(v) ? v : null;
    cardSaltPut(card.name, card._salt);
    saltStoreSave();
    return card._salt;
  } catch (e) {
    return (card._salt = null);
  }
}

async function edhrecThemeNames(slug) {
  const data = await edhrecFetchJson('/pages/tags/' + slug + '.json');
  const names = new Set();
  _edhrecWalkLists(data).forEach((L) => L.names.forEach((n) => names.add(n)));
  return names;
}

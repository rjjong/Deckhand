// pages / trade / index

/* ---------------- TRADE PAGE ----------------
   A Cardmarket-trend trade calculator behind the ⚖ button on Search. Two
   sides (You give / You get), each card added as one exact printing carrying
   that printing's trend price; the verdict line says who adds how much to
   balance the trade. Persists in localStorage so a trade survives closing
   the app mid-negotiation. */
function loadTrade() {
  if (state.trade) return state.trade;
  let t = null;
  try {
    t = JSON.parse(localStorage.getItem(LS_PREFIX + 'trade') || 'null');
  } catch (e) {}
  state.trade = t && Array.isArray(t.a) && Array.isArray(t.b) ? t : { a: [], b: [] };
  return state.trade;
}

function saveTrade() {
  try {
    localStorage.setItem(LS_PREFIX + 'trade', JSON.stringify(state.trade));
  } catch (e) {}
}

/* Trade prices are always LIVE: each time the trade page shows, every card
   on the table is priced afresh (one batched request, through
   postWithTimeout). A price younger than ten minutes counts as live. Without
   a line -- or when Scryfall does not answer -- the stored price stays: that
   is the fallback, never the first choice. */
let _tradeFailAt = 0;

async function refreshTradePrices() {
  try {
    loadTrade();
    const all = state.trade.a.concat(state.trade.b);
    const stale = all.filter((it) => !(it.pt && Date.now() - it.pt < 10 * 60 * 1000));
    if (!stale.length) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (Date.now() - _tradeFailAt < 30 * 1000) return; // just failed: no retry storm
    const idOf = (it) =>
      it.set && it.cn
        ? { set: String(it.set).toLowerCase(), collector_number: String(it.cn) }
        : it.set
          ? { name: it.name, set: String(it.set).toLowerCase() }
          : { name: it.name };
    const uniq = new Map();
    stale.forEach((it) => {
      const id = idOf(it);
      uniq.set(JSON.stringify(id), id);
    });
    const ids = Array.from(uniq.values());
    let changed = false,
      answered = false;
    for (let i = 0; i < ids.length; i += 75) {
      const r = await postWithTimeout(
        `${SF_BASE}/cards/collection`,
        { identifiers: ids.slice(i, i + 75) },
        6000,
      );
      if (!r || !r.ok) continue;
      answered = true;
      const data = await r.json();
      (data.data || []).forEach((f) => {
        stale.forEach((it) => {
          const hit =
            it.set && it.cn
              ? String(f.set) === String(it.set).toLowerCase() &&
                String(f.collector_number) === String(it.cn)
              : (f.name === it.name || String(f.name).split(' // ')[0] === it.name) &&
                (!it.set || String(f.set) === String(it.set).toLowerCase());
          if (!hit) return;
          const p = f.prices || {};
          const raw = it.foil ? p.eur_foil || p.eur : p.eur || p.eur_foil;
          const e = raw ? parseFloat(raw) : NaN;
          it.pt = Date.now();
          if (isFinite(e) && e !== it.eur) {
            it.eur = e;
            changed = true;
          }
        });
      });
    }
    if (!answered) {
      _tradeFailAt = Date.now();
      return;
    }
    saveTrade();
    if (changed && state.screen === 'trade') render();
  } catch (e) {
    _tradeFailAt = Date.now();
  }
}

function tradeSideTotal(side) {
  return side.reduce((t, it) => t + (it.eur != null ? it.eur * it.qty : 0), 0);
}

function tradeRowsHtml(key) {
  const rows = state.trade[key];
  if (!rows.length)
    return /* HTML */ `<p class="hint" style="margin:4px 0 2px;">
      ${trS('No cards on this side yet.')}
    </p>`;
  return rows
    .map(
      (it, i) => `<div class="trade-row">
    <img src="${it.img || ''}" alt="" data-tprev="${key}:${i}">
    <div class="tr-body"><div class="nm">${escapeHtml(it.name)}</div><div class="tl">${escapeHtml((it.set || '').toUpperCase())}${it.cn ? ' #' + escapeHtml(it.cn) : ''} · ${it.eur != null ? `<span class="tr-eur">€${it.eur.toFixed(2)}</span>` : '—'}</div></div>
    <div class="tr-qty"><button data-tq="${key}:${i}:-1">−</button><span>×${it.qty}</span><button data-tq="${key}:${i}:1">＋</button></div>
    <button class="icon-btn tr-del" data-tdel="${key}:${i}">✕</button>
  </div>`,
    )
    .join('');
}

function tradePageHtml() {
  loadTrade();
  const nl = appLang() === 'nl';
  const totA = tradeSideTotal(state.trade.a),
    totB = tradeSideTotal(state.trade.b);
  const missing = state.trade.a.concat(state.trade.b).some((it) => it.eur == null);
  // Me (a) receives cards; You (b) holds the cards leaving my collection.
  const diff = totA - totB;
  const even = Math.abs(diff) < 0.005;
  const verdict = even
    ? trS('Even trade.')
    : diff > 0
      ? `${trS('You add')} <span class="tr-eur">€${diff.toFixed(2)}</span>`
      : `${trS('I add')} <span class="tr-eur">€${(-diff).toFixed(2)}</span>`;
  const sideCard = (
    key,
    label,
    tot,
  ) => `<section class="panel-card trade-side" aria-label="${label}">
    ${toolPanelHeadingHtml(key === 'a' ? ICONS.imp : ICONS.exp, label, key === 'a' ? (nl ? 'Kaarten die je ontvangt' : 'Cards you receive') : nl ? 'Kaarten die je geeft' : 'Cards you give', `<strong class="trade-total">€${tot.toFixed(2)}</strong>`)}
    ${tradeRowsHtml(key)}
    <button type="button" class="hub-card trade-add" data-tradeadd="${key}"><span class="hub-icon" aria-hidden="true">${ICONS.plus}</span><span class="hub-copy"><strong>${trS('Add card')}</strong><small>${nl ? 'Kies de juiste printing' : 'Choose the exact printing'}</small></span><span class="hub-arrow" aria-hidden="true">›</span></button>
  </section>`;
  return /* HTML */ `<main class="hub-page tools-page trade-page">
    <div class="trade-overview">
      <div
        class="trade-verdict ${even ? 'even' : ''}"
        role="status"
        aria-label="${nl ? 'Ruilverschil' : 'Trade difference'}"
      >
        ${verdict}
      </div>
    </div>
    <section class="hub-actions tool-sections" aria-label="${nl ? 'Ruilkaarten' : 'Trade cards'}">
      ${sideCard('b', nl ? 'Jij' : 'You', totB)} ${sideCard('a', nl ? 'Ik' : 'Me', totA)}
    </section>
    ${missing ? `<p class="hint">${trS('Some cards have no listed price and count as €0.00.')}</p>` : ''}
    <p class="hub-footnote">
      ${nl ? 'Cardmarket-trendprijzen · Kies de juiste printing als je een kaart toevoegt.' : 'Cardmarket trend prices · Choose the exact printing when adding a card.'}
    </p>
  </main>`;
}

function wireTradePage() {
  loadTrade();
  refreshTradePrices();
  document
    .querySelectorAll('[data-tradeadd]')
    .forEach((b) => b.addEventListener('click', () => openTradeAdd(b.dataset.tradeadd)));
  document.querySelectorAll('[data-tq]').forEach((b) =>
    b.addEventListener('click', () => {
      const [k, i, d] = b.dataset.tq.split(':');
      const it = state.trade[k] && state.trade[k][+i];
      if (!it) return;
      it.qty = Math.max(1, Math.min(99, it.qty + parseInt(d, 10)));
      saveTrade();
      render();
    }),
  );
  document.querySelectorAll('[data-tdel]').forEach((b) =>
    b.addEventListener('click', () => {
      const [k, i] = b.dataset.tdel.split(':');
      if (!state.trade[k]) return;
      state.trade[k].splice(+i, 1);
      saveTrade();
      render();
    }),
  );
  document.querySelectorAll('[data-tprev]').forEach((img) =>
    img.addEventListener('click', () => {
      const [k, i] = img.dataset.tprev.split(':');
      const it = state.trade[k] && state.trade[k][+i];
      if (it && it.img) showPreview(it.img, !!it.wb);
    }),
  );
  document.getElementById('tradeConfirm')?.addEventListener('click', confirmTrade);
  document.getElementById('tradeClear')?.addEventListener('click', () => {
    openInAppConfirm(
      trS('Clear the whole trade?'),
      (ok) => {
        if (!ok) return;
        state.trade = { a: [], b: [] };
        saveTrade();
        render();
      },
      { danger: true, ok: trS('Clear trade'), title: trS('Clear trade'), icon: 'trash' },
    );
  });
}

/* Sealing the deal. Cards under Me (side a) join the collection — unfiled,
   condition NM, ready to be sorted into binders later — and leave the Wants
   list by name, whatever printing was wanted. Cards under You (side b) leave
   the collection as their exact printing (name+set+number), pulled from any
   binder and condition until the traded quantity is covered. */
function confirmTrade() {
  loadTrade();
  // Panels swapped in .358: ME (a) = what I RECEIVE, YOU (b) = what leaves
  // my binders. Joining and leaving follow suit.
  const gives = state.trade.b,
    gets = state.trade.a;
  if (!gives.length && !gets.length) return;
  const q =
    appLang() === 'nl'
      ? 'Deze ruil bevestigen? Kaarten onder Ik komen in je collectie; kaarten onder Jij gaan eruit.'
      : 'Confirm this trade? Cards under Me join your collection; cards under You leave it.';
  openInAppConfirm(
    q,
    async (okd) => {
      if (!okd) return;
      const _memo = {};
      for (const it of gets) {
        const neu = {
          name: it.name,
          set: it.set || '',
          set_name: it.set_name || '',
          cn: it.cn || '',
          img: it.img || '',
          type_line: it.type_line || '',
          colors: it.colors || [],
          rarity: it.rarity || '',
          border_color: it.wb ? 'white' : '',
          eur: it.eur != null ? it.eur : null,
          foil: it.foil ? true : undefined,
          cond: 'NM',
          qty: it.qty,
          binder: null,
          addedAt: Date.now(),
        };
        neu.binder = ruledBinders().length ? await routeBinder(neu, _memo) : null;
        const same = state.collection.items.find(
          (x) =>
            x.name === it.name &&
            x.set === (it.set || '') &&
            (x.cn || '') === (it.cn || '') &&
            x.cond === 'NM' &&
            !!x.foil === !!neu.foil &&
            (x.binder || null) === (neu.binder || null),
        );
        if (same) same.qty += it.qty;
        else state.collection.items.unshift(neu);
        state.collection.wantsManual = (state.collection.wantsManual || []).filter(
          (w) => w.name !== it.name,
        );
      }
      gives.forEach((it) => {
        let need = it.qty;
        state.collection.items.forEach((ci) => {
          if (need <= 0) return;
          if (ci.name === it.name && ci.set === (it.set || '') && (ci.cn || '') === (it.cn || '')) {
            const take = Math.min(ci.qty, need);
            ci.qty -= take;
            need -= take;
          }
        });
      });
      state.collection.items = state.collection.items.filter((x) => x.qty > 0);
      saveCollection();
      state.trade = { a: [], b: [] };
      saveTrade();
      tradeFireworks();
      // The new cards wait unfiled on the collection page — land there so
      // filing them into a binder is the natural next tap.
      setTimeout(() => switchPage('collection'), 900);
      toast(trS('Trade confirmed. Enjoy the new cards.') + ' 🎆');
      render();
    },
    { ok: trS('Confirm trade'), title: trS('Confirm trade'), icon: 'trade' },
  );
}

function tradeFireworks() {
  // A short burst of house-colored sparks. Skipped entirely for players who
  // prefer reduced motion.
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const wrap = document.createElement('div');
    wrap.className = 'fw-wrap';
    document.body.appendChild(wrap);
    const colors = ['#C9A24B', '#F5EDD3', '#E07818', '#7B5CD6', '#1F9A63'];
    for (let b = 0; b < 3; b++) {
      const cx = 20 + Math.random() * 60,
        cy = 22 + Math.random() * 36; // viewport %
      for (let i = 0; i < 22; i++) {
        const p = document.createElement('span');
        p.className = 'fw-p';
        p.style.left = cx + '%';
        p.style.top = cy + '%';
        p.style.background = colors[(Math.random() * colors.length) | 0];
        wrap.appendChild(p);
        const a = Math.random() * Math.PI * 2,
          r = 40 + Math.random() * 80;
        p.animate(
          [
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            {
              transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r + 30}px) scale(0.4)`,
              opacity: 0,
            },
          ],
          {
            duration: 900 + Math.random() * 500,
            delay: b * 180,
            easing: 'cubic-bezier(0.1,0.8,0.3,1)',
            fill: 'forwards',
          },
        );
      }
    }
    setTimeout(() => wrap.remove(), 2100);
  } catch (e) {}
}

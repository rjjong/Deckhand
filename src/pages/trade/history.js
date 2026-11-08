const TRADE_HISTORY_LIMIT = 100;

function normalizeTradePartnerName(value) {
  return String(value || '')
    .trim()
    .slice(0, 99)
    .replace(/[\uD800-\uDBFF]$/u, '')
    .trimEnd();
}

function tradeHistoryRecords(trade = loadTrade()) {
  return (Array.isArray(trade.history) ? trade.history : [])
    .filter(
      (entry) =>
        entry &&
        typeof entry.id === 'string' &&
        Number.isFinite(entry.at) &&
        Number.isFinite(new Date(entry.at).getTime()) &&
        Array.isArray(entry.a) &&
        Array.isArray(entry.b),
    )
    .slice()
    .sort((a, b) => b.at - a.at)
    .slice(0, TRADE_HISTORY_LIMIT);
}

function captureTradeHistory(trade) {
  const copy = (cards) => cards.map((card) => ({ ...card }));
  return {
    id: uid(),
    at: Date.now(),
    partnerName: normalizeTradePartnerName(trade.partnerName),
    a: copy(trade.a),
    b: copy(trade.b),
  };
}

function resetCurrentTrade() {
  state.trade = { ...loadTrade(), a: [], b: [], partnerName: '' };
}

function clearTradeHistory() {
  const previous = loadTrade();
  state.trade = { ...previous, history: [] };
  if (!saveTrade()) {
    state.trade = previous;
    return false;
  }
  return true;
}

function completeTradeHistory(snapshot, original) {
  const current = loadTrade();
  const history = [
    { ...snapshot, at: Date.now() },
    ...tradeHistoryRecords(current).filter((entry) => entry.id !== snapshot.id),
  ].slice(0, TRADE_HISTORY_LIMIT);
  state.trade = {
    ...current,
    ...(current === original ? { a: [], b: [], partnerName: '' } : {}),
    history,
  };
}

function tradeHistoryCardsHtml(cards) {
  return (
    cards
      .map(
        (card) => `<div class="trade-history-row">
    ${card.img ? `<img src="${escapeHtml(card.img)}" alt="" loading="lazy">` : ''}
    <span><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(String(card.set || '').toUpperCase())}${card.cn ? ' #' + escapeHtml(card.cn) : ''}${card.foil ? ' · Foil' : ''}</small></span>
    <span class="trade-history-quantity">×${Number(card.qty) || 1}</span>
    <span class="trade-history-value">${card.eur == null ? '—' : fmtEur(Number(card.eur) * (Number(card.qty) || 1))}</span>
  </div>`,
      )
      .join('') || '<p class="hint">No cards on this side.</p>'
  );
}

function tradeHistoryHtml() {
  const history = tradeHistoryRecords();
  return (
    history
      .map((entry) => {
        const received = tradeSideTotal(entry.a),
          given = tradeSideTotal(entry.b);
        const qty = (cards) => cards.reduce((sum, card) => sum + (Number(card.qty) || 1), 0);
        return `<details class="panel-card trade-history-entry">
      <summary class="hub-card"><span class="hub-icon" aria-hidden="true">${ICONS.history}</span>
        <span class="hub-copy"><strong>${escapeHtml(entry.partnerName || 'Unnamed trader')}</strong><time datetime="${new Date(entry.at).toISOString()}">${escapeHtml(new Date(entry.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}</time><small>${qty(entry.a)} received · ${qty(entry.b)} given</small></span>
        <span class="hub-arrow" aria-hidden="true">⌄</span>
      </summary>
      <div class="trade-history-details">
        <section><h2>Received <span>${fmtEur(received)}</span></h2>${tradeHistoryCardsHtml(entry.a)}</section>
        <section><h2>Given <span>${fmtEur(given)}</span></h2>${tradeHistoryCardsHtml(entry.b)}</section>
        <p class="trade-history-difference">Difference <strong>${fmtEur(Math.abs(received - given))}</strong></p>
      </div>
    </details>`;
      })
      .join('') ||
    `<section class="panel-card trade-history-empty">${toolPanelHeadingHtml(ICONS.history, 'No previous trades', 'Confirmed trades will appear here.')}</section>`
  );
}

function openTradeHistory() {
  if (document.getElementById('tradeHistoryOverlay')) return;
  loadTrade();
  const trigger = document.activeElement;
  const el = document.createElement('div');
  el.id = 'tradeHistoryOverlay';
  el.className = 'overlay trade-history-page';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Trade history');
  el.innerHTML = `<div class="overlay-inner">
    ${overlayCapHtml('Trade history', `<button type="button" class="header-filter" id="tradeHistoryBack" aria-label="Back to trade">${ICONS.back}</button>`)}
    <main class="hub-page trade-history-body">${tradeHistoryHtml()}<p class="hub-footnote">Your most recent ${TRADE_HISTORY_LIMIT} confirmed trades. Prices are saved at confirmation.</p></main>
    ${overlayNavHtml()}
  </div>`;
  document.body.appendChild(el);
  pushOverlay('trade-history', () => {
    const finish = () => {
      el.remove();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else {
      el.classList.add('leaving');
      setTimeout(finish, 240);
    }
  });
  wireOverlayNav(el);
  wireAppDialogKeys(el, closeTopOverlay);
  el.querySelector('#tradeHistoryBack').onclick = closeTopOverlay;
  el.querySelector('#tradeHistoryBack').focus({ preventScroll: true });
}

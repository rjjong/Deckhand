// SPDX-License-Identifier: AGPL-3.0-or-later
// Insert immediately so slow card details cannot change detection order.
function scannerCreateLog(root, { signal, onReview, onIgnored, settings = {} }) {
  const list = root.querySelector('#scannerDetections');
  const empty = root.querySelector('#scannerLogEmpty');
  const count = root.querySelector('#scannerLogCount');
  const cards = new Map();
  const entries = [];
  const identityNames = new Map();
  const silentIdentities = new Set();
  const repeatOptions = {
    debounceMs: settings.scannerDebounceMs,
    ignoreSession: settings.scannerIgnoreSession,
  };
  let repeats = scannerCreateRepeatFilter(repeatOptions);
  function refresh() {
    // Rebuild in detection order: the earliest accepted scan wins even when
    // later card details resolve first. Hidden rows keep their original place.
    repeats = scannerCreateRepeatFilter(repeatOptions);
    let total = 0;
    for (const entry of entries) {
      if (entry.silent) continue;
      const reason = entry.card ? repeats.reason(entry.card.name, entry.at) : null;
      entry.row.hidden = !!reason;
      if (entry.card && !reason) repeats.accept(entry.card.name, entry.at);
      if (reason && !entry.notified) {
        entry.notified = true;
        onIgnored?.({ name: entry.card.name, reason });
      }
      if (!entry.row.hidden) total++;
    }
    empty.hidden = total > 0;
    count.textContent = `${total} ${total === 1 ? 'card' : 'cards'}`;
  }
  function details(result) {
    if (!cards.has(result.cardId)) {
      cards.set(
        result.cardId,
        Promise.resolve()
          .then(() =>
            scannerResolveCard(result, {
              idThreshold: settings.scannerIdThreshold,
              cornerThreshold: settings.scannerCornerThreshold,
            }),
          )
          .catch((error) => {
            cards.delete(result.cardId);
            throw error;
          }),
      );
    }
    return cards.get(result.cardId);
  }
  function ignored(detection, at = Date.now()) {
    if (
      scannerIsIgnoredCard(detection) ||
      silentIdentities.has(detection.secondaryId || detection.cardId)
    )
      return null;
    const name = identityNames.get(detection.secondaryId || detection.cardId);
    const reason = name ? repeats.reason(name, at) : null;
    return reason ? { name, reason } : null;
  }
  return {
    ignored,
    append(detection) {
      if (signal.aborted || scannerIsIgnoredCard(detection)) return;
      const at = new Date();
      const identity = detection.secondaryId || detection.cardId;
      if (silentIdentities.has(identity)) return;
      const repeat = ignored(detection, at.getTime());
      if (repeat) {
        onIgnored?.(repeat);
        return;
      }
      const result = {
        cardId: detection.cardId,
        secondaryId: detection.secondaryId,
        cardPresent: true,
        cornersValid: true,
        score: detection.score,
        confidence: detection.confidence,
        thumb: detection.thumb,
      };
      const row = document.createElement('li');
      row.className = 'scanner-detection';
      row.dataset.state = 'loading';
      row.innerHTML = `<button type="button" class="scanner-detection-button" disabled>
        ${result.thumb ? `<img src="${result.thumb}" alt="Scanned card" width="43" height="60">` : `<span class="scanner-detection-art" aria-hidden="true">${SCANNER_ICON}</span>`}
        <span class="scanner-detection-details"><strong class="scanner-detection-name">Identifying card…</strong>
          <small class="scanner-detection-set">Please wait</small></span>
        <span class="scanner-detection-meta"><time datetime="${at.toISOString()}">${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
          <span aria-hidden="true">›</span></span>
      </button>`;
      list.prepend(row);
      const entry = { row, at: at.getTime(), card: null };
      entries.push(entry);
      refresh();
      const button = row.querySelector('button');
      const name = row.querySelector('.scanner-detection-name');
      const set = row.querySelector('.scanner-detection-set');
      async function load() {
        button.disabled = true;
        row.dataset.state = 'loading';
        name.textContent = 'Identifying card…';
        set.textContent = 'Please wait';
        try {
          const card = await details(result);
          if (signal.aborted) return;
          if (scannerIsIgnoredCard(card)) {
            silentIdentities.add(identity);
            entry.silent = true;
            row.remove();
            refresh();
            return;
          }
          entry.card = card;
          identityNames.set(identity, card.name);
          name.textContent = card.name;
          set.textContent =
            (card.set_name || card.set?.toUpperCase() || '') +
            (card.collector_number ? ' · #' + card.collector_number : '');
          button.setAttribute('aria-label', 'Review ' + card.name);
          button.onclick = () => onReview(result, card, button);
          row.dataset.state = 'ready';
          refresh();
        } catch (error) {
          if (signal.aborted) return;
          name.textContent = 'Card details unavailable';
          set.textContent = 'Tap to try again';
          button.setAttribute('aria-label', 'Retry card details');
          button.onclick = load;
          row.dataset.state = 'error';
        } finally {
          if (!signal.aborted) button.disabled = false;
        }
      }
      load();
    },
  };
}

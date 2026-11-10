// SPDX-License-Identifier: AGPL-3.0-or-later
// Session-only scan results, selection and collection ownership. No photo storage.
function scannerCreateLog(
  root,
  {
    signal,
    binder = null,
    mode = 'collection',
    onReview,
    onIgnored,
    onAccepted,
    onChange = () => {},
    settings = {},
  },
) {
  const list = root.querySelector('#scannerDetections');
  const empty = root.querySelector('#scannerLogEmpty');
  const count = root.querySelector('#scannerLogCount');
  const cards = new Map(),
    entries = [],
    selected = new Set();
  const identifiedCards = new Map(),
    silentIdentities = new Set();
  const repeatOptions = {
    ignoreSession: settings.scannerIgnoreSession,
  };
  let repeats = scannerCreateRepeatFilter(repeatOptions),
    disposed = false;
  const live = () => !disposed && !signal.aborted;
  const pending = () =>
    entries.filter(
      (entry) =>
        !entry.deleted && !entry.row.hidden && entry.card && !entry.added && selected.has(entry),
    );
  function ownership() {
    const counts = scannerCollectionCounts();
    for (const entry of entries) {
      if (entry.deleted || !entry.card) continue;
      const qty = counts.get(scannerCollectionKey(entry.card.name)) || 0;
      const indicator = entry.row.querySelector('.scanner-detection-owned');
      if (isCollectionBasicLand(entry.card)) {
        indicator.hidden = true;
        continue;
      }
      indicator.hidden = false;
      indicator.textContent = `${entry.added ? (entry.addedLabel || 'Added') + ' · ' : ''}${qty ? '✓ ' : ''}In collection: ${qty}`;
      indicator.classList.toggle('owned', qty > 0);
    }
  }
  function refresh() {
    if (!live()) return;
    // Keep detection order for repeat rules, including removed rows. Deleting
    // an accepted row must not resurrect a previously ignored repeat.
    repeats = scannerCreateRepeatFilter(repeatOptions);
    let total = 0;
    for (const entry of entries) {
      if (entry.silent) continue;
      const reason = entry.card ? repeats.reason(entry.result) : null;
      entry.row.hidden = !!reason;
      if (entry.card && !reason) repeats.accept(entry.result);
      if (reason && !entry.notified && !entry.deleted) {
        entry.notified = true;
        onIgnored?.(repeatNotice(entry.card, entry.result, reason));
      }
      if (reason || entry.deleted) selected.delete(entry);
      if (!entry.row.hidden && !entry.deleted) total++;
      const chosen = selected.has(entry);
      const button = entry.row.querySelector('button');
      button.setAttribute('aria-pressed', String(chosen));
      entry.row.classList.toggle('selected', chosen);
      entry.row.querySelector('.scanner-detection-mark').textContent = chosen ? '✓' : '›';
    }
    empty.hidden = total > 0;
    count.textContent = `${total} ${total === 1 ? 'card' : 'cards'}`;
    ownership();
    // Exact printing IDs make unrelated metadata lookups independent. Each
    // accepted printing can signal success as soon as its details are ready.
    for (const entry of entries) {
      if (!entry.card || entry.deleted || entry.row.hidden || entry.feedbackSent) continue;
      entry.feedbackSent = true;
      onAccepted?.(entry.card);
    }
    onChange({ total, selected: selected.size, addable: pending().length });
  }
  function repeatNotice(card, detection, reason) {
    return {
      name: card.name,
      printingId: scannerPrintingIdentity(detection),
      printing: [card.set?.toUpperCase(), card.collector_number].filter(Boolean).join(' #'),
      reason,
    };
  }
  function releasePhoto(entry) {
    entry.result.thumb = null;
    entry.cancelHold?.();
    for (const image of entry.row.querySelectorAll('img')) image.removeAttribute('src');
  }
  function removeEntries(removing) {
    for (const entry of removing) {
      entry.deleted = true;
      selected.delete(entry);
      releasePhoto(entry);
      entry.row.remove();
    }
  }
  function details(result) {
    if (!cards.has(result.cardId))
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
    return cards.get(result.cardId);
  }
  function ignored(detection) {
    const identity = scannerPrintingIdentity(detection);
    if (scannerIsIgnoredCard(detection) || !identity || silentIdentities.has(identity)) return null;
    const card = identifiedCards.get(identity);
    const reason = card ? repeats.reason(detection) : null;
    return reason ? repeatNotice(card, detection, reason) : null;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    entries.forEach(releasePhoto);
    entries.length = 0;
    selected.clear();
    cards.clear();
    identifiedCards.clear();
    silentIdentities.clear();
    list.replaceChildren();
    repeats = scannerCreateRepeatFilter(repeatOptions);
  }
  function prepareAdd(candidates = pending()) {
    const batch = candidates.filter(
      (entry) => !entry.deleted && !entry.added && !entry.row.hidden && entry.card,
    );
    const isValid = () =>
      live() &&
      batch.length > 0 &&
      batch.every((entry) => !entry.deleted && !entry.added && !entry.row.hidden);
    return {
      cards: batch.map((entry) => entry.card),
      isValid,
      commit(label, { remove = false } = {}) {
        if (!isValid()) return false;
        for (const entry of batch) {
          entry.added = true;
          entry.addedLabel = label;
          selected.delete(entry);
        }
        for (const entry of selected) if (entry.added) selected.delete(entry);
        if (remove) removeEntries(batch);
        refresh();
        return true;
      },
    };
  }
  signal.addEventListener('abort', dispose, { once: true });
  return {
    ignored,
    refresh,
    dispose,
    prepareAdd,
    selectAll() {
      if (!live()) return;
      for (const entry of entries) if (!entry.deleted && !entry.row.hidden) selected.add(entry);
      refresh();
    },
    clearSelection() {
      selected.clear();
      refresh();
    },
    addToCollection() {
      if (!live()) return 0;
      const batch = prepareAdd();
      const added = scannerAddToCollection(batch.cards, binder);
      batch.commit(undefined, { remove: true });
      return added;
    },
    deleteSelected() {
      if (!live()) return 0;
      const size = selected.size;
      removeEntries(Array.from(selected));
      selected.clear();
      refresh();
      return size;
    },
    append(detection) {
      if (!live() || scannerIsIgnoredCard(detection)) return;
      const at = new Date(),
        identity = scannerPrintingIdentity(detection);
      if (identity && silentIdentities.has(identity)) return;
      const repeat = ignored(detection);
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
      row.innerHTML = `<button type="button" class="scanner-detection-button" aria-pressed="false" aria-busy="true">
        ${result.thumb ? `<img src="${escapeHtml(result.thumb)}" alt="Scanned card" width="43" height="60" draggable="false">` : `<span class="scanner-detection-art" aria-hidden="true">${SCANNER_ICON}</span>`}
        <span class="scanner-detection-details"><strong class="scanner-detection-name">Identifying card…</strong>
          <small class="scanner-detection-set">Please wait</small><small class="scanner-detection-owned" hidden></small></span>
        <span class="scanner-detection-meta"><time datetime="${at.toISOString()}">${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
          <span class="scanner-detection-mark" aria-hidden="true">›</span></span>
      </button>`;
      list.prepend(row);
      const entry = { row, result, at: at.getTime(), card: null, added: false, deleted: false };
      entries.push(entry);
      refresh();
      const button = row.querySelector('button'),
        name = row.querySelector('.scanner-detection-name'),
        set = row.querySelector('.scanner-detection-set');
      entry.cancelHold = scannerWireSelection(button, {
        signal,
        selecting: () => selected.size > 0,
        onToggle: () => {
          if (!live() || entry.deleted || row.hidden) return;
          if (selected.has(entry)) selected.delete(entry);
          else selected.add(entry);
          refresh();
        },
        onOpen: () => {
          if (!live() || entry.deleted) return;
          if (row.dataset.state === 'error') {
            load();
            return;
          }
          if (!entry.card) return;
          onReview(result, entry.card, button, {
            prepareAdd: () => prepareAdd([entry]),
            added: entry.added,
            onAdded: (added) => {
              if (added?.binder !== '__wants__') {
                entry.added = true;
                removeEntries([entry]);
              }
              refresh();
            },
            onClose: refresh,
          });
        },
      });
      async function load() {
        row.dataset.state = 'loading';
        button.setAttribute('aria-busy', 'true');
        name.textContent = 'Identifying card…';
        set.textContent = 'Please wait';
        try {
          const card = await details(result);
          if (!live() || entry.deleted) return;
          if (scannerIsIgnoredCard(card) || (mode !== 'deck' && isCollectionBasicLand(card))) {
            if (identity) silentIdentities.add(identity);
            entry.silent = true;
            entry.deleted = true;
            selected.delete(entry);
            releasePhoto(entry);
            row.remove();
            refresh();
            return;
          }
          entry.card = card;
          if (identity) identifiedCards.set(identity, card);
          name.textContent = card.name;
          set.textContent =
            (card.set_name || card.set?.toUpperCase() || '') +
            (card.collector_number ? ' · #' + card.collector_number : '');
          button.setAttribute('aria-label', 'Review ' + card.name);
          row.dataset.state = 'ready';
          refresh();
        } catch (error) {
          if (!live() || entry.deleted) return;
          name.textContent = 'Card details unavailable';
          set.textContent = 'Tap to try again';
          button.setAttribute('aria-label', 'Retry card details');
          row.dataset.state = 'error';
          refresh();
        } finally {
          if (live() && !entry.deleted) button.setAttribute('aria-busy', 'false');
        }
      }
      load();
    },
  };
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Live detections stay in the camera log; review opens only when requested.
const SCANNER_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4M3 12h18"/><rect x="8" y="6" width="8" height="12" rx="1"/></svg>';

function openCardScanner({ mode = 'collection', binder = null, deckId = null } = {}) {
  if (document.getElementById('cardScannerCamera') || document.getElementById('cardScannerOverlay'))
    return;
  const claimedLeaders = new Map();
  const targetBinder =
    mode === 'collection' && state.collection.binders.some((b) => b.id === binder) ? binder : null;
  openScannerCamera({
    mode,
    binder: targetBinder,
    onReview: openScannerReview,
    onAdd: (batch, options) =>
      openScannerDeckChooser(batch, { ...options, claimedLeaders, deckId }),
    onClose() {
      if (['collection', 'decks', 'decklist'].includes(state.screen)) render();
    },
  });
}

function openScannerReview(result, card, trigger, options = {}) {
  if (document.getElementById('cardScannerOverlay')) return;
  const el = document.createElement('div');
  el.id = 'cardScannerOverlay';
  el.className = 'overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Review scanned card');
  const deckMode = options.mode === 'deck';
  el.innerHTML = `<div class="overlay-inner scanner-screen">
    ${overlayCapHtml('Review card', `<button type="button" class="header-filter" id="scannerClose" aria-label="Close scanner">${ICONS.close}</button>`)}
    <main class="scanner-body">
      <section class="scanner-intro">
        <p>${deckMode ? 'Review this scanned card before adding it to a deck.' : 'Review the printing and collection details before adding your card.'}</p>
      </section>
      <section class="scanner-result">
        ${result.thumb ? `<img src="${result.thumb}" alt="Scanned card">` : ''}
        <div><span class="scanner-eyebrow">Match to review</span><h2>${escapeHtml(card.name)}</h2>
          <p>${escapeHtml(card.set_name || card.set?.toUpperCase() || '')}${card.collector_number ? ' · #' + escapeHtml(card.collector_number) : ''}</p>
        </div>
      </section>
      ${deckMode ? '' : `<section class="scanner-collection" aria-label="Collection details">${collectionAddFieldsHtml(card, { binder: options.binder })}</section>`}
      <div class="scanner-credits"><span class="scanner-badge">Experimental</span>
        <p>Photos stay on your device. Powered by <a href="https://github.com/HanClinto/CollectorVision" target="_blank" rel="noopener">CollectorVision</a> · <a href="${SCANNER_ASSET_BASE}/NOTICE.txt" target="_blank" rel="noopener">Licenses &amp; source</a></p>
      </div>
    </main>
    <footer class="scanner-footer"><button type="button" class="primary-btn" id="${deckMode ? 'scannerReviewDeckAdd' : 'acAdd'}"${deckMode && options.added ? ' disabled' : ''}>${deckMode ? (options.added ? 'Added to deck' : 'Add to deck') : 'Add to collection'}</button></footer>
  </div>`;
  const camera = document.getElementById('cardScannerCamera');
  if (camera) camera.inert = true;
  document.body.appendChild(el);
  pushOverlay('scanner-review', () => {
    for (const image of el.querySelectorAll('.scanner-result img')) image.removeAttribute('src');
    el.remove();
    if (camera?.isConnected) {
      camera.inert = false;
      const target = trigger?.isConnected
        ? trigger
        : camera.querySelector('#scannerSelectAll:not(:disabled)') ||
          camera.querySelector('#scannerCameraBack');
      target?.focus({ preventScroll: true });
    }
    options.onClose?.();
  });
  wireAppDialogKeys(el, closeTopOverlay);
  el.querySelector('#scannerClose').onclick = closeTopOverlay;
  if (deckMode) {
    el.querySelector('#scannerReviewDeckAdd').onclick = (event) =>
      options.onAdd(options.prepareAdd(), {
        returnFocus: event.currentTarget,
        onDone: () => {
          if (state.overlayStack.at(-1)?.id === 'scanner-review') closeTopOverlay();
        },
      });
  } else
    wireCollectionAddForm(el, card, {
      onAdded(added) {
        options.onAdded?.(added);
        closeTopOverlay();
        if (state.screen === 'collection') render();
      },
      onPrintingChange(printing) {
        el.querySelector('.scanner-result p').textContent =
          (printing.set_name || printing.set?.toUpperCase() || '') +
          (printing.collector_number ? ' · #' + printing.collector_number : '');
      },
    });
  el.querySelector('#scannerClose').focus({ preventScroll: true });
}

// ui / menu-cards

function menuCardHtml(id, icon, title, detail, extra) {
  return /* HTML */ `<button type="button" class="hub-card" id="${id}">
    <span class="hub-icon">${icon}</span
    ><span class="hub-copy"
      ><strong>${title}</strong><small class="l2">${detail || ''}</small>${extra || ''}</span
    ><span class="hub-arrow" aria-hidden="true">›</span>
  </button>`;
}

function toolPanelHeadingHtml(icon, title, detail, extra) {
  return /* HTML */ `<div class="tool-panel-heading">
    <span class="hub-icon" aria-hidden="true">${icon}</span>
    <div class="tool-heading-copy">
      <h2>${title}</h2>
      ${detail ? `<p>${detail}</p>` : ''}
    </div>
    ${extra || ''}
  </div>`;
}

function transferHeaderHtml(
  title,
  detail,
  closeId = '',
  closeClass = '',
  closeLabel = 'Close import/export',
) {
  return /* HTML */ `<header class="transfer-heading">
    <div>
      <h2>${escapeHtml(title)}</h2>
      ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
    </div>
    <button
      type="button"
      class="transfer-close ${closeClass}"
      ${closeId ? ` id="${closeId}"` : ''}
      aria-label="${escapeHtml(closeLabel)}"
    >
      ${ICONS.close}
    </button>
  </header>`;
}

function cardTransferDialogHtml(title, detail, content, actions) {
  return /* HTML */ `<section
    class="deckpick app-dialog transfer-dialog card-transfer-dialog"
    role="dialog"
    aria-modal="true"
    aria-label="${escapeHtml(title)}"
  >
    ${transferHeaderHtml(title, detail, '', 'card-transfer-close', 'Close ' + title.toLowerCase())}
    <div class="card-transfer-body">${content}</div>
    <footer class="card-transfer-actions">${actions}</footer>
  </section>`;
}

function wireCardTransferDialog(root, close = closeTopOverlay) {
  root._cardTransferClose = close;
  if (!root._cardTransferWired) {
    root._cardTransferWired = true;
    wireAppDialogKeys(root, () => root._cardTransferClose());
    root.addEventListener('click', (event) => {
      if (event.target === root) root._cardTransferClose();
    });
  }
  const button = root.querySelector('.card-transfer-close');
  button.addEventListener('click', close);
  button.focus({ preventScroll: true });
}

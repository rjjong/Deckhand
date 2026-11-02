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

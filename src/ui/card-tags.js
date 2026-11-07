// The editor is shared by deck cards and standalone card details.
function openCardTagPopup(deck, card, trigger) {
  if (document.getElementById('cardTagsDialog')) return;
  const parent = trigger.closest('.overlay');
  const wasInert = parent?.inert;
  const el = document.createElement('div');
  el.id = 'cardTagsDialog';
  el.className = 'deckpick-scrim card-tags-dialog';
  el.innerHTML = `<section class="deckpick app-dialog card-tags-sheet" role="dialog" aria-modal="true" aria-labelledby="cardTagsTitle">
    <header><span class="hub-icon" aria-hidden="true">${ICONS.tag}</span><div><h2 id="cardTagsTitle">Tags</h2><p>${escapeHtml(card.name)}</p></div></header>
    <div class="card-tags-body"></div>
    <button type="button" class="primary-btn dialog-primary" id="cardTagsDone">Done</button>
  </section>`;
  el.style.zIndex = String(
    Math.max(250, (parseInt(getComputedStyle(parent || document.body).zIndex, 10) || 0) + 1),
  );
  document.body.appendChild(el);
  if (parent) parent.inert = true;
  const controller = new AbortController();
  const box = el.querySelector('.card-tags-body');
  const viewport = window.visualViewport;
  const fit = () => {
    Object.assign(el.style, {
      top: (viewport?.offsetTop || 0) + 'px',
      left: (viewport?.offsetLeft || 0) + 'px',
      width: (viewport?.width || innerWidth) + 'px',
      height: (viewport?.height || innerHeight) + 'px',
    });
  };
  fit();
  viewport?.addEventListener('resize', fit, { signal: controller.signal });
  viewport?.addEventListener('scroll', fit, { signal: controller.signal });
  window.addEventListener('resize', fit, { signal: controller.signal });
  pushOverlay('card-tags', () => {
    controller.abort();
    box._tagAbort?.abort();
    el.remove();
    if (parent?.isConnected) parent.inert = wasInert;
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  });
  wireAppDialogKeys(el, closeTopOverlay);
  el.querySelector('#cardTagsDone').onclick = closeTopOverlay;
  el.addEventListener('click', (event) => {
    if (event.target === el) closeTopOverlay();
  });
  renderTagEditor(deck, card, box);
  el.querySelector('#cardTagsDone').focus({ preventScroll: true });
}

// ui / dialogs

/* Small reusable in-app text prompt (replaces native prompt). */
function wireAppDialogKeys(el, close) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const controls = Array.from(
      el.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]'),
    ).filter((n) => n.getClientRects().length);
    const first = controls[0],
      last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  });
}

function openInAppPrompt(title, placeholder, initial, onOk) {
  // Contract: null on cancel, the typed value on OK.
  const trigger = document.activeElement;
  document.getElementById('inAppPrompt')?.remove();
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'inAppPrompt';
  document.body.appendChild(el);
  el.style.alignItems = 'center';
  el.style.zIndex = 10020;
  el.innerHTML = /* HTML */ `<div
    class="deckpick app-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="iapTitle"
  >
    <span class="hub-icon dialog-icon" aria-hidden="true">${ICONS.edit || inlIco('edit', 24)}</span>
    <h2 id="iapTitle">${escapeHtml(trS(title))}</h2>
    <input
      id="iapInput"
      aria-labelledby="iapTitle"
      enterkeyhint="done"
      placeholder="${escapeHtml(trS(placeholder || ''))}"
      value="${escapeHtml(initial || '')}"
    />
    <div class="dialog-actions">
      <button type="button" class="dp-cancel dialog-secondary" id="iapCancel">
        ${escapeHtml(trS('Cancel'))}</button
      ><button type="button" class="primary-btn dialog-primary" id="iapOk">OK</button>
    </div>
  </div>`;
  let settled = false;
  const finish = (v) => {
    if (settled) return;
    settled = true;
    el.remove();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    onOk(v);
  };
  const close = () => finish(null);
  const ok = () => finish(document.getElementById('iapInput').value);
  document.getElementById('iapCancel').addEventListener('click', close);
  document.getElementById('iapOk').addEventListener('click', ok);
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  wireAppDialogKeys(el, close);
  const inp = document.getElementById('iapInput');
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ok();
    }
  });
  setTimeout(() => {
    if (inp.isConnected) {
      inp.focus();
      inp.select();
    }
  }, 50);
}

function openInAppConfirm(msg, onResult, o) {
  // o: { title, ok, cancel, danger, must, icon } — `must` disables
  // scrim-tap dismissal for choices where "outside" would be ambiguous.
  o = o || {};
  const trigger = document.activeElement;
  document.getElementById('inAppConfirm')?.remove();
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'inAppConfirm';
  document.body.appendChild(el);
  el.style.alignItems = 'center';
  el.style.zIndex = 10020;
  const icon = ICONS[o.icon] || ICONS[o.danger ? 'trash' : 'shield'];
  el.innerHTML = /* HTML */ `<div
    class="deckpick app-dialog${o.danger ? ' dialog-danger' : ''}"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="iacTitle"
    aria-describedby="iacMessage"
  >
    <span class="hub-icon dialog-icon" aria-hidden="true">${icon}</span>
    <h2 id="iacTitle">${escapeHtml(o.title || o.ok || trS('Confirm'))}</h2>
    <p class="iac-msg" id="iacMessage">${escapeHtml(msg)}</p>
    <div class="dialog-actions">
      <button type="button" class="dp-cancel dialog-secondary" id="iacCancel">
        ${escapeHtml(o.cancel || trS('Cancel'))}</button
      ><button type="button" class="primary-btn dialog-primary" id="iacOk">
        ${escapeHtml(o.ok || 'OK')}
      </button>
    </div>
  </div>`;
  let settled = false;
  const finish = (v) => {
    if (settled) return;
    settled = true;
    el.remove();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    onResult(v);
  };
  document.getElementById('iacCancel').addEventListener('click', () => finish(false));
  document.getElementById('iacOk').addEventListener('click', () => finish(true));
  if (!o.must)
    el.addEventListener('click', (ev) => {
      if (ev.target === el) finish(false);
    });
  wireAppDialogKeys(el, () => {
    if (!o.must) finish(false);
  });
  el.querySelector('#iacCancel').focus({ preventScroll: true });
}

function openTileMenu(anchorEl, items) {
  document.getElementById('tileMenuPop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'menu-pop';
  pop.id = 'tileMenuPop';
  pop.innerHTML = items
    .map(
      (it, i) =>
        `${it.danger && i > 0 ? '<hr>' : ''}<button data-i="${i}" ${it.danger ? 'class="danger"' : ''}>${menuLabel(it.label)}</button>`,
    )
    .join('');
  document.body.appendChild(pop);
  const r = anchorEl.getBoundingClientRect();
  pop.style.position = 'fixed';
  const below = r.bottom + 4;
  const room = window.innerHeight - below - 90;
  pop.style.top = (room >= 120 ? below : Math.max(72, r.top - pop.offsetHeight - 4)) + 'px';
  pop.style.maxHeight = Math.max(120, room) + 'px';
  pop.scrollTop = 0;
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - pop.offsetWidth)) + 'px';
  pop.style.zIndex = 200;
  items.forEach((it, i) =>
    pop.querySelector(`[data-i="${i}"]`).addEventListener('click', () => {
      pop.remove();
      it.fn();
    }),
  );
  setTimeout(
    () =>
      document.addEventListener('click', function c(e) {
        if (!pop.contains(e.target)) {
          pop.remove();
          document.removeEventListener('click', c);
        }
      }),
    0,
  );
}

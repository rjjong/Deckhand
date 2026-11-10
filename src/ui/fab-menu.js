// Floating add actions share one speed dial, independent of their destination.
let activeFabMenu = null;

function closeFabMenu({ immediate = false } = {}) {
  const current = activeFabMenu;
  if (!current) {
    document.getElementById('fabMenu')?.remove();
    return;
  }
  activeFabMenu = null;
  current.controller.abort();
  current.anchor.style.visibility = current.visibility;
  current.anchor.setAttribute('aria-expanded', 'false');
  current.menu.classList.add('leaving');
  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) current.menu.remove();
  else setTimeout(() => current.menu.remove(), 160);
  current.anchor.focus({ preventScroll: true });
}

function openFabMenu(items, anchor = document.activeElement) {
  if (!anchor?.getBoundingClientRect || !anchor.classList.contains('deck-fab'))
    anchor = [...document.querySelectorAll('.deck-fab:not(.col-sel-fab)')].find(
      (button) => button.getClientRects().length,
    );
  if (!anchor) return;
  const toggle = activeFabMenu?.menu.isConnected && activeFabMenu.anchor === anchor;
  closeFabMenu({ immediate: true });
  if (toggle) return;
  const bounds = anchor.getBoundingClientRect();
  const controller = new AbortController();
  const menu = document.createElement('div');
  menu.id = 'fabMenu';
  menu.className = 'fab-speed-dial';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-modal', 'true');
  menu.setAttribute('aria-label', 'Add options');
  const icons = {
    fabNewDeck: ICONS.plus,
    fabNewFolder: ICONS.folderPlus,
    fabImportDeck: ICONS.imp,
  };
  const rows = items
    .map(([id, html], index) => {
      const template = document.createElement('template');
      template.innerHTML = menuLabel(html);
      const graphic = template.content.querySelector('.ib, svg');
      const icon =
        icons[id] ||
        (graphic?.tagName.toLowerCase() === 'svg' ? graphic.outerHTML : graphic?.innerHTML) ||
        ICONS.plus;
      graphic?.remove();
      const label = template.content.textContent.trim();
      return `<button type="button" class="fab-action" id="${id}" style="--fab-order:${index}"><span class="fab-action-label">${escapeHtml(label)}</span><span class="fab-action-icon" aria-hidden="true">${icon}</span></button>`;
    })
    .reverse()
    .join('');
  menu.innerHTML = `<div class="fab-menu-backdrop"></div><div class="fab-menu-options">${rows}</div><button type="button" class="fab-menu-close" aria-label="Close add menu">${ICONS.close}</button>`;
  const close = menu.querySelector('.fab-menu-close');
  const options = menu.querySelector('.fab-menu-options');
  const right = Math.max(8, innerWidth - bounds.right);
  const header = document.querySelector('.app-header')?.getBoundingClientRect();
  const top = Math.max(8, (header?.bottom || 0) + 8);
  Object.assign(close.style, {
    left: bounds.left + 'px',
    top: bounds.top + 'px',
    width: bounds.width + 'px',
    height: bounds.height + 'px',
  });
  Object.assign(options.style, {
    right: right + 'px',
    bottom: innerHeight - bounds.top + 12 + 'px',
    maxHeight: Math.max(54, bounds.top - top - 12) + 'px',
  });
  document.body.appendChild(menu);
  activeFabMenu = { menu, anchor, visibility: anchor.style.visibility, controller };
  anchor.style.visibility = 'hidden';
  anchor.setAttribute('aria-haspopup', 'dialog');
  anchor.setAttribute('aria-expanded', 'true');
  options.scrollTop = options.scrollHeight;
  items.forEach(([id, , action]) =>
    menu.querySelector('#' + id).addEventListener(
      'click',
      (event) => {
        event.stopPropagation();
        closeFabMenu({ immediate: true });
        action();
      },
      { signal: controller.signal },
    ),
  );
  menu
    .querySelector('.fab-menu-backdrop')
    .addEventListener('click', () => closeFabMenu(), { signal: controller.signal });
  close.addEventListener('click', () => closeFabMenu(), { signal: controller.signal });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeFabMenu();
      } else if (event.key === 'Tab') {
        const buttons = [...menu.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      }
    },
    { capture: true, signal: controller.signal },
  );
  menu.querySelector('#' + items[0][0]).focus({ preventScroll: true });
}

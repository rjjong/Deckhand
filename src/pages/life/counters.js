// Saved values stay per player. Commander stores casts; the UI displays {2}
// per cast, preserving the meaning of counters in existing saved games.
const LIFE_COUNTERS = [
  { id: 'commander', name: 'Commander tax' },
  { id: 'mana', name: 'Mana' },
  { id: 'storm', name: 'Storm counter' },
  { id: 'energy', name: 'Energy' },
  { id: 'experience', name: 'Experience' },
];
const LIFE_MANA_COUNTERS = [
  { id: 'manaW', name: 'White mana', color: 'W' },
  { id: 'manaU', name: 'Blue mana', color: 'U' },
  { id: 'manaB', name: 'Black mana', color: 'B' },
  { id: 'manaR', name: 'Red mana', color: 'R' },
  { id: 'manaG', name: 'Green mana', color: 'G' },
  { id: 'manaC', name: 'Colorless mana', color: 'C' },
];
const LIFE_VISIBLE_COUNTERS = LIFE_COUNTERS.filter(({ id }) => id !== 'mana').concat(
  LIFE_MANA_COUNTERS,
);

function lifeCounterValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(9999, Math.trunc(number))) : 0;
}

function lifeDefaultCounters() {
  return Object.fromEntries(
    LIFE_COUNTERS.concat(LIFE_MANA_COUNTERS).map(({ id }) => [
      id,
      { enabled: id === 'commander' && lifeFmt() !== 'constructed', value: 0 },
    ]),
  );
}

function ensureLifeCounters(player) {
  const defaults = lifeDefaultCounters();
  if (!player.counters || typeof player.counters !== 'object') player.counters = {};
  // The former single mana counter becomes colorless without dropping its
  // saved amount. Once color counters exist, toggling one off stays off.
  if (!LIFE_MANA_COUNTERS.some(({ id }) => player.counters[id]) && player.counters.mana)
    player.counters.manaC = { ...player.counters.mana };
  LIFE_COUNTERS.concat(LIFE_MANA_COUNTERS).forEach(({ id }) => {
    const counter = player.counters[id];
    player.counters[id] = {
      enabled: typeof counter?.enabled === 'boolean' ? counter.enabled : defaults[id].enabled,
      value: lifeCounterValue(counter?.value),
    };
  });
  return player.counters;
}

function lifeCounterGlyph(id) {
  const mana = LIFE_MANA_COUNTERS.find((spec) => spec.id === id);
  if (mana) return manaIconSvg(mana.color, 22);
  if (id === 'commander') return CROWN_SVG;
  const paths = {
    mana: '<path d="M12 3C9 7 5 10.8 5 15a7 7 0 0 0 14 0c0-4.2-4-8-7-12Z"/>',
    storm: '<path d="M5 7a5 5 0 0 1 9-2 4 4 0 1 1 4 7h-1M5 7a4 4 0 0 0-1 8h3m5-5-3 6h5l-3 6"/>',
    energy: '<path d="m14 2-9 12h6l-1 8 9-12h-6z"/>',
    experience:
      '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${paths[id] || ''}</svg>`;
}

function lifeCounterDisplay(id, counter) {
  return counter.value * (id === 'commander' ? 2 : 1);
}

function lifeCounterLabel(spec, counter) {
  return `${spec.name}: ${lifeCounterDisplay(spec.id, counter)}. Tap to increase; hold to reset`;
}

function lifeCounterChipHtml(player, idx, id) {
  const counter = player.counters[id];
  if (!counter?.enabled) return '';
  const spec = LIFE_VISIBLE_COUNTERS.find((item) => item.id === id);
  if (!spec) return '';
  return `<button type="button" class="life-counter-chip${id === 'commander' ? ' commander-casts' : ' extra'}" data-life-counter="${id}" data-player="${idx}" aria-label="${lifeCounterLabel(spec, counter)}" title="${spec.name} · Tap to increase; hold to reset"><span aria-hidden="true">${lifeCounterGlyph(id)}</span><b>${lifeCounterDisplay(id, counter)}</b></button>`;
}

function openLifeCounters(idx) {
  if (!ensureLifePlayers()[idx]) return;
  const open = state.life.counterPicker?.idx === idx;
  state.life.counterPicker = open ? null : { idx, view: 'counters' };
  renderLifeGrid();
  if (!open) animateLifeCounterPicker(idx);
  document
    .querySelector(
      `.life-card-v2[data-idx="${idx}"] ${open ? '[data-lcounters]' : '.life-counter-picker button'}`,
    )
    ?.focus({ preventScroll: true });
}

function animateLifeCounterPicker(idx) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const card = document.querySelector(`.life-card-v2[data-idx="${idx}"]`);
  const picker = card?.querySelector('.life-counter-picker');
  const button = card?.querySelector('[data-lcounters]');
  const bar = button?.offsetParent;
  if (!picker || !button || !bar) return;
  // Both offsets are measured in the player's local coordinates, so the
  // opening point follows # even when their panel is rotated.
  const scale = 0.12;
  const x =
    bar.offsetLeft +
    button.offsetLeft +
    button.offsetWidth / 2 -
    picker.offsetLeft -
    picker.offsetWidth +
    (picker.offsetWidth * scale) / 2;
  const y =
    bar.offsetTop +
    button.offsetTop +
    button.offsetHeight / 2 -
    picker.offsetTop -
    picker.offsetHeight +
    (picker.offsetHeight * scale) / 2;
  picker.animate(
    [
      { transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity: 0 },
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
    ],
    { duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)' },
  );
}

function lifeCounterPickerHtml(player, idx) {
  const picker = state.life.counterPicker;
  if (picker?.idx !== idx) return '';
  const mana = picker.view === 'mana';
  const options = mana ? LIFE_MANA_COUNTERS : LIFE_COUNTERS;
  return `<div class="life-counter-picker" id="lifeCounterPicker-${idx}" role="dialog" aria-label="${mana ? 'Mana colors' : 'Player counters'}">
    <div class="life-counter-picker-scroll">${mana ? `<button type="button" class="life-counter-choice" data-counter-back aria-label="Back to counters" title="Back to counters">${ICONS.back}</button>` : ''}${options
      .map((spec) => {
        const submenu = spec.id === 'mana';
        const enabled = submenu
          ? LIFE_MANA_COUNTERS.some(({ id }) => player.counters[id].enabled)
          : player.counters[spec.id].enabled;
        return `<button type="button" class="life-counter-choice${enabled ? ' on' : ''}" ${submenu ? 'data-counter-mana aria-haspopup="dialog"' : `data-counter-enable="${spec.id}" aria-pressed="${enabled}"`} aria-label="${spec.name}" title="${spec.name}">${lifeCounterGlyph(spec.id)}</button>`;
      })
      .join('')}</div>
  </div>`;
}

function wireLifeCounterPicker(card, idx) {
  const picker = card.querySelector('.life-counter-picker');
  if (!picker) return;
  picker.addEventListener('click', (event) => event.stopPropagation());
  const repaint = (selector) => {
    renderLifeGrid();
    document
      .querySelector(`.life-card-v2[data-idx="${idx}"] ${selector}`)
      ?.focus({ preventScroll: true });
  };
  picker.querySelector('[data-counter-mana]')?.addEventListener('click', () => {
    state.life.counterPicker.view = 'mana';
    repaint('[data-counter-back]');
  });
  picker.querySelector('[data-counter-back]')?.addEventListener('click', () => {
    state.life.counterPicker.view = 'counters';
    repaint('[data-counter-mana]');
  });
  picker.querySelectorAll('[data-counter-enable]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.counterEnable;
      const counter = ensureLifePlayers()[idx].counters[id];
      counter.enabled = !counter.enabled;
      repaint(`[data-counter-enable="${id}"]`);
    });
  });
  picker.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    state.life.counterPicker = null;
    repaint('[data-lcounters]');
  });
}

function adjustLifeCounter(idx, id, reset = false) {
  const player = ensureLifePlayers()[idx];
  const spec = LIFE_VISIBLE_COUNTERS.find((item) => item.id === id);
  const counter = player?.counters[id];
  if (!spec || !counter?.enabled) return;
  const next = reset ? 0 : lifeCounterValue(counter.value + 1);
  if (next === counter.value) return;
  counter.value = next;
  lifeLogLive(
    player,
    'counter:' + id,
    `${player.name}: ${spec.name} ${lifeCounterDisplay(id, counter)}.`,
  );
  // Updating the chip in place keeps a scrolling row and held pointer stable.
  document
    .querySelectorAll(`[data-life-counter="${id}"][data-player="${idx}"]`)
    .forEach((button) => {
      button.querySelector('b').textContent = String(lifeCounterDisplay(id, counter));
      button.setAttribute('aria-label', lifeCounterLabel(spec, counter));
    });
  lifeAutosave();
}

function wireLifeCounterChip(button) {
  let timer = null,
    held = false,
    moved = false,
    x = 0,
    y = 0;
  const clear = () => {
    clearTimeout(timer);
    timer = null;
  };
  button._cancelLifeCounterHold = () => {
    moved = true;
    clear();
  };
  button.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.stopPropagation();
    clear();
    held = moved = false;
    x = event.clientX;
    y = event.clientY;
    timer = setTimeout(() => {
      if (!button.isConnected || !state.lifeOpen) return;
      held = true;
      adjustLifeCounter(Number(button.dataset.player), button.dataset.lifeCounter, true);
      try {
        navigator.vibrate?.(25);
      } catch (error) {}
    }, 550);
  });
  button.addEventListener('pointermove', (event) => {
    if (Math.hypot(event.clientX - x, event.clientY - y) > 10) {
      moved = true;
      clear();
    }
  });
  button.addEventListener('pointerup', clear);
  button.addEventListener('pointercancel', () => {
    moved = true;
    clear();
  });
  button.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') {
      moved = true;
      clear();
    }
  });
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.detail && (held || moved)) return;
    adjustLifeCounter(Number(button.dataset.player), button.dataset.lifeCounter);
  });
}

// A player's horizontal axis rotates with their panel. Native pan-x gestures
// do not reliably scroll these transformed strips on Android, so translate
// screen movement into that local axis and keep taps/holds separate from drags.
function wireLifeCounterStrip(row) {
  let drag = null,
    suppressClickUntil = 0;
  row.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      const rotation = (Number(row.closest('.life-card-v2').dataset.rot) * Math.PI) / 180;
      suppressClickUntil = 0;
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        cos: Math.cos(rotation),
        sin: Math.sin(rotation),
        start: row.scrollLeft,
        button: event.target.closest('[data-life-counter]'),
        moved: false,
      };
    },
    { capture: true },
  );
  row.addEventListener(
    'pointermove',
    (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      const along = dx * drag.cos + dy * drag.sin;
      if (!drag.moved && Math.hypot(dx, dy) > 8) {
        drag.moved = true;
        drag.button?._cancelLifeCounterHold?.();
        try {
          row.setPointerCapture(event.pointerId);
        } catch (error) {}
      }
      if (!drag.moved) return;
      row.scrollLeft = drag.start - along;
      if (event.cancelable) event.preventDefault();
    },
    { capture: true, passive: false },
  );
  const finish = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.moved || event.type === 'pointercancel') {
      suppressClickUntil = Date.now() + 350;
      drag.button?._cancelLifeCounterHold?.();
    }
    drag = null;
  };
  row.addEventListener('pointerup', finish, { capture: true });
  row.addEventListener('pointercancel', finish, { capture: true });
  row.addEventListener(
    'click',
    (event) => {
      if (event.detail && Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  row.addEventListener(
    'wheel',
    (event) => {
      if (row.scrollWidth <= row.clientWidth) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? row.clientWidth : 1;
      row.scrollLeft += (event.deltaX || event.deltaY) * unit;
      event.preventDefault();
    },
    { passive: false },
  );
}

// Per-player counters are part of the saved game, including which ones are visible.
const LIFE_COUNTERS = [
  { id: 'mana', name: 'Mana', glyph: '◇' },
  { id: 'energy', name: 'Energy', glyph: 'ϟ' },
  { id: 'experience', name: 'Experience', glyph: '✧' },
  { id: 'commander', name: 'Commander casts', glyph: 'C' },
  { id: 'storm', name: 'Storm', glyph: '≋' },
];

function lifeCounterValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(9999, Math.trunc(number))) : 0;
}

function lifeDefaultCounters() {
  return Object.fromEntries(
    LIFE_COUNTERS.map(({ id }) => [
      id,
      { enabled: id === 'commander' && lifeFmt() !== 'constructed', value: 0 },
    ]),
  );
}

function ensureLifeCounters(player) {
  const defaults = lifeDefaultCounters();
  if (!player.counters || typeof player.counters !== 'object') player.counters = {};
  LIFE_COUNTERS.forEach(({ id }) => {
    const counter = player.counters[id];
    player.counters[id] = {
      enabled: typeof counter?.enabled === 'boolean' ? counter.enabled : defaults[id].enabled,
      value: lifeCounterValue(counter?.value),
    };
  });
  return player.counters;
}

function lifeCounterChipHtml(player, idx, id) {
  const counter = player.counters[id];
  if (!counter?.enabled) return '';
  const spec = LIFE_COUNTERS.find((item) => item.id === id);
  return `<button type="button" class="life-counter-chip${id === 'commander' ? ' commander-casts' : ' extra'}" data-life-counter="${id}" data-player="${idx}" aria-label="${spec.name}: ${counter.value}. Edit counter" title="${spec.name}"><span aria-hidden="true">${spec.glyph}</span><b>${counter.value}</b></button>`;
}

function openLifeCounters(idx, focusKey) {
  const player = ensureLifePlayers()[idx];
  if (!player) return;
  document.getElementById('lifeCountersSheet')?.remove();
  const sheet = document.createElement('div');
  sheet.id = 'lifeCountersSheet';
  sheet.className = 'deckpick-scrim';
  sheet.style.zIndex = 9000;
  const close = () => brSheetClose('lifeCountersSheet');
  const paint = () => {
    const counters = ensureLifeCounters(player);
    sheet.innerHTML = `<section class="deckpick life-sheet life-counters-sheet" role="dialog" aria-modal="true" aria-label="Player counters">
      ${lifePopupHeadHtml('Counters', player.name)}
      <div class="life-popup-body life-counter-options">${LIFE_COUNTERS.map(
        ({ id, name, glyph }) => {
          const counter = counters[id];
          return `<div class="life-counter-option" data-counter-row="${id}">
          <label class="life-counter-choice"><input type="checkbox" aria-label="${name}" data-counter-enable="${id}" ${counter.enabled ? 'checked' : ''}><span class="life-counter-glyph" aria-hidden="true">${glyph}</span><span>${name}</span></label>
          <div class="life-counter-stepper">
            <button type="button" class="ghost-btn" data-counter-adjust="${id}" data-delta="-1" aria-label="Decrease ${name}" ${!counter.enabled || !counter.value ? 'disabled' : ''}>−</button>
            <input type="number" inputmode="numeric" min="0" max="9999" step="1" data-counter-value="${id}" aria-label="${name} count" value="${counter.value}" ${counter.enabled ? '' : 'disabled'}>
            <button type="button" class="ghost-btn" data-counter-adjust="${id}" data-delta="1" aria-label="Increase ${name}" ${!counter.enabled || counter.value === 9999 ? 'disabled' : ''}>+</button>
          </div>
        </div>`;
        },
      ).join('')}</div>
      <div class="life-popup-footer"><button type="button" class="primary-btn" data-counters-done>Done</button></div>
    </section>`;
    sheet.querySelector('[data-life-close]').addEventListener('click', close);
    sheet.querySelector('[data-counters-done]').addEventListener('click', close);
    sheet.querySelectorAll('[data-counter-enable]').forEach((input) => {
      input.addEventListener('change', () => {
        counters[input.dataset.counterEnable].enabled = input.checked;
        renderLifeGrid();
        paint();
        sheet
          .querySelector(`[data-counter-enable="${input.dataset.counterEnable}"]`)
          .focus({ preventScroll: true });
      });
    });
    const update = (id, value) => {
      const counter = counters[id];
      if (!counter.enabled) return;
      const next = lifeCounterValue(value);
      if (next !== counter.value) {
        counter.value = next;
        const name = LIFE_COUNTERS.find((spec) => spec.id === id).name;
        lifeLog(`${player.name}: ${name} ${next}.`);
        renderLifeGrid();
      }
      const row = sheet.querySelector(`[data-counter-row="${id}"]`);
      row.querySelector('input[type="number"]').value = String(next);
      row.querySelector('[data-delta="-1"]').disabled = !next;
      row.querySelector('[data-delta="1"]').disabled = next === 9999;
    };
    sheet.querySelectorAll('[data-counter-adjust]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.counterAdjust;
        update(id, counters[id].value + Number(button.dataset.delta));
      });
    });
    sheet.querySelectorAll('[data-counter-value]').forEach((input) => {
      input.addEventListener('change', () => update(input.dataset.counterValue, input.value));
      input.addEventListener('focus', () => input.select());
    });
  };
  paint();
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) close();
  });
  wireAppDialogKeys(sheet, close);
  brSheetOpen(sheet, 'lifeCountersSheet', () => {});
  (
    sheet.querySelector(`[data-counter-value="${focusKey}"]:enabled`) ||
    sheet.querySelector('[data-life-close]')
  ).focus({ preventScroll: true });
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// A hold starts selection; scrolling must never select a card by accident.
function scannerWireSelection(button, { signal, onToggle, onOpen, selecting }) {
  let timer,
    start,
    held = false;
  const cancel = () => clearTimeout(timer);
  button.addEventListener(
    'pointerdown',
    (event) => {
      cancel();
      held = false;
      if (event.button !== 0 || !event.isPrimary) return;
      start = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => {
        held = true;
        onToggle();
      }, 480);
    },
    { signal },
  );
  button.addEventListener(
    'pointermove',
    (event) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancel();
    },
    { signal },
  );
  for (const name of ['pointerup', 'pointercancel', 'pointerleave'])
    button.addEventListener(name, cancel, { signal });
  button.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
  button.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
  button.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== ' ') return;
      event.preventDefault();
      if (!event.repeat) onToggle();
    },
    { signal },
  );
  button.addEventListener(
    'click',
    (event) => {
      if (held) {
        held = false;
        event.preventDefault();
      } else if (selecting() || event.ctrlKey || event.metaKey || event.shiftKey) onToggle();
      else onOpen();
    },
    { signal },
  );
  signal.addEventListener('abort', cancel, { once: true });
  return cancel;
}

let stopDeckStacks = null;
const DECK_STACK_FOCUS = 0.82;

function cleanupDeckStacks() {
  stopDeckStacks?.();
  stopDeckStacks = null;
}

function wireDeckStacks() {
  cleanupDeckStacks();
  const stacks = [...document.querySelectorAll('#decklistBox .vg-stack')].filter(
    (stack) => stack.children.length,
  );
  if (!stacks.length) return;
  const viewport = pageScroller();
  let frame = 0;
  const groups = stacks.map((stack) => ({
    stack,
    cards: [...stack.children],
    width: 0,
    active: stack.querySelector('.stack-active') || stack.firstElementChild,
  }));

  function update() {
    frame = 0;
    const visible = viewport.getBoundingClientRect();
    for (const group of groups) {
      const bounds = group.stack.getBoundingClientRect();
      group.stack.classList.add('stack-ready');
      if (!bounds.width || bounds.bottom < visible.top || bounds.top > visible.bottom) continue;
      // Open the card nearest a comfortable reading position. Header strips
      // before it stay compact; strips after it move below the full card.
      const offset = Math.max(0, (visible.height - group.height) * DECK_STACK_FOCUS);
      const top = bounds.top - visible.top + viewport.scrollTop;
      const start = Math.max(0, top - offset);
      const end = Math.max(start, top + (group.cards.length - 1) * group.peek - offset);
      // When the stack starts above the reading point on the first screen,
      // spread its cards over the available scroll range instead of skipping
      // the first few cards. Later stacks use the ordinary header spacing.
      const progress =
        end > start ? Math.max(0, Math.min(1, (viewport.scrollTop - start) / (end - start))) : 0;
      const index = Math.round(progress * (group.cards.length - 1));
      const card = group.cards[index];
      if (card === group.active) continue;
      // Keep a transform control under the keyboard user's focus while flipping.
      if (
        group.active?.contains(document.activeElement) &&
        document.activeElement.matches(':focus-visible')
      )
        continue;
      group.active?.classList.remove('stack-active');
      card.classList.add('stack-active');
      group.active = card;
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function measure() {
    for (const group of groups) {
      const width = group.stack.clientWidth;
      if (!width || width === group.width) continue;
      group.width = width;
      group.height = (width * 88) / 63;
      group.peek = Math.max(32, Math.min(46, width * 0.16));
      group.stack.style.setProperty('--stack-card-height', group.height + 'px');
      group.stack.style.setProperty('--stack-peek', group.peek + 'px');
    }
    // Give the final stack enough runway to reach the same reading position.
    const tail = Math.max(
      0,
      ...groups.map(
        (group) => Math.max(0, viewport.clientHeight - group.height) * (1 - DECK_STACK_FOCUS) + 16,
      ),
    );
    viewport.style.setProperty('--deck-stack-tail', tail + 'px');
    schedule();
  }
  const observer = new ResizeObserver(measure);
  stacks.forEach((stack) => observer.observe(stack));
  observer.observe(viewport);
  viewport.addEventListener('scroll', schedule, { passive: true });
  measure();
  stopDeckStacks = () => {
    observer.disconnect();
    viewport.removeEventListener('scroll', schedule);
    cancelAnimationFrame(frame);
    viewport.style.removeProperty('--deck-stack-tail');
  };
}

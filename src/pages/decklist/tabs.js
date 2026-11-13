// Deck categories are a bounded sequence: swipes and arrow keys never wrap.
const DECK_TABS = ['list', 'stats', 'inspiration'];

let deckTabMotion = null;

function stopDeckTabMotion() {
  deckTabMotion?.cancel();
  deckTabMotion = null;
}

function animateDeckTab(direction) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const body = document.getElementById('builderBody');
  const width = pageScroller().clientWidth;
  const animation = body.animate(
    [
      { transform: `translateX(${direction * width}px)`, opacity: 0.65 },
      { transform: 'translateX(0)', opacity: 1 },
    ],
    { duration: 240, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
  );
  deckTabMotion = animation;
  animation.finished
    .then(() => {
      if (deckTabMotion === animation) deckTabMotion = null;
    })
    .catch(() => {});
}

function selectDeckTab(d, tab, focus = false, swipe = false) {
  if (!DECK_TABS.includes(tab) || state.builderTab === tab) return;
  const direction = DECK_TABS.indexOf(tab) > DECK_TABS.indexOf(state.builderTab) ? 1 : -1;
  stopDeckTabMotion();
  state.builderTab = tab;
  state.dlPanel = null;
  state.dockSet = 0;
  renderBuilderBody(d);
  updateDeckMeter(d);
  syncTabsUI();
  pageScroller().scrollTop = 0;
  if (swipe) animateDeckTab(direction);
  if (focus) document.getElementById('deckTab-' + tab)?.focus({ preventScroll: true });
}

function wireDeckTabs(d) {
  const page = document.querySelector('.deck-workspace');
  const tabs = page.querySelector('.builder-tabs');
  tabs.querySelectorAll('[data-btab]').forEach((button) => {
    button.addEventListener('click', () => selectDeckTab(d, button.dataset.btab));
    button.addEventListener('keydown', (event) => {
      const current = DECK_TABS.indexOf(state.builderTab);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? 2
            : event.key === 'ArrowRight'
              ? current + 1
              : event.key === 'ArrowLeft'
                ? current - 1
                : null;
      if (next === null) return;
      event.preventDefault();
      if (DECK_TABS[next]) selectDeckTab(d, DECK_TABS[next], true);
    });
  });

  let gesture = null,
    suppressClickUntil = 0;
  page.addEventListener(
    'touchstart',
    (event) => {
      gesture = null;
      if (
        event.touches.length !== 1 ||
        state.dlPanel ||
        state._dlSel?.size ||
        state.overlayStack.length ||
        event.target.closest(
          'button, input, textarea, select, a, summary, [contenteditable], canvas',
        )
      )
        return;
      // Horizontal charts and lists keep their native scrolling.
      for (let node = event.target; node && node !== page; node = node.parentElement) {
        if (
          node.scrollWidth > node.clientWidth + 2 &&
          /auto|scroll/.test(getComputedStyle(node).overflowX)
        )
          return;
      }
      const point = event.touches[0];
      gesture = {
        id: point.identifier,
        x: point.clientX,
        y: point.clientY,
        at: performance.now(),
        horizontal: false,
      };
    },
    { passive: true },
  );
  page.addEventListener(
    'touchmove',
    (event) => {
      if (!gesture || event.touches.length !== 1) {
        gesture = null;
        return;
      }
      const point = event.touches[0];
      const dx = point.clientX - gesture.x,
        dy = point.clientY - gesture.y;
      if (!gesture.horizontal && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        gesture = null;
        return;
      }
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        gesture.horizontal = true;
        // Cancel a card's pending long-press without canceling this swipe.
        event.target.closest('.vg-card')?.dispatchEvent(new Event('pointerleave'));
        if (event.cancelable) event.preventDefault();
      }
    },
    { passive: false },
  );
  page.addEventListener(
    'touchend',
    (event) => {
      const start = gesture;
      gesture = null;
      if (!start || !start.horizontal || state._dlSel?.size) return;
      const point = [...event.changedTouches].find((touch) => touch.identifier === start.id);
      if (!point) return;
      const dx = point.clientX - start.x,
        dy = point.clientY - start.y;
      if (
        Math.abs(dx) < Math.max(48, Math.min(90, page.clientWidth * 0.15)) ||
        Math.abs(dx) <= Math.abs(dy) * 1.5 ||
        performance.now() - start.at > 1000
      )
        return;
      if (event.cancelable) event.preventDefault();
      suppressClickUntil = performance.now() + 400;
      const next = DECK_TABS.indexOf(state.builderTab) + (dx < 0 ? 1 : -1);
      if (DECK_TABS[next]) selectDeckTab(d, DECK_TABS[next], false, true);
    },
    { passive: false },
  );
  page.addEventListener('touchcancel', () => {
    gesture = null;
  });
  page.addEventListener(
    'click',
    (event) => {
      if (
        performance.now() < suppressClickUntil &&
        !event.target.closest('button, input, textarea, select, a, summary')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}

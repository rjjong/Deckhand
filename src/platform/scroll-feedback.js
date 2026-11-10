// Shared scroll-boundary feedback. Passive listeners leave native scrolling,
// pull-to-refresh, card swipes and slider gestures in control of their pages.
function installScrollBoundaryFeedback() {
  const intents = new WeakMap();
  const lastPulse = new WeakMap();
  let touch = null;

  function boundary(element, direction) {
    if (direction < 0 && element.scrollTop <= 1) return 'top';
    if (direction > 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - 1)
      return 'bottom';
    return null;
  }

  function owner(target, direction) {
    let element = target instanceof Element ? target : target?.parentElement;
    if (element?.closest('input, textarea, select, [contenteditable="true"]')) return null;
    let candidate = null;
    for (; element; element = element.parentElement) {
      if (element.clientHeight < 1 || element.scrollHeight <= element.clientHeight + 1) continue;
      const style = getComputedStyle(element);
      if (!/auto|scroll|overlay/.test(style.overflowY)) continue;
      candidate = element;
      // A nested scroller can hand its motion to a scrollable parent unless
      // that page deliberately contains overscroll (for example search).
      if (!boundary(element, direction) || /contain|none/.test(style.overscrollBehaviorY))
        return element;
    }
    const page = document.scrollingElement;
    if (page && page.scrollHeight > page.clientHeight + 1) return page;
    return candidate;
  }

  function pulse(element, edge) {
    if (!element.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const now = performance.now();
    const previous = lastPulse.get(element);
    if (previous?.edge === edge && now - previous.at < 500) return;
    lastPulse.set(element, { edge, at: now });
    let rect = element.getBoundingClientRect();
    let left = Math.max(0, rect.left),
      right = Math.min(innerWidth, rect.right);
    let top = Math.max(0, rect.top),
      bottom = Math.min(innerHeight, rect.bottom);
    for (
      let parent = element.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent);
      rect = parent.getBoundingClientRect();
      if (rect.height && /auto|scroll|hidden|clip/.test(style.overflowY)) {
        top = Math.max(top, rect.top);
        bottom = Math.min(bottom, rect.bottom);
      }
      if (rect.width && /auto|scroll|hidden|clip/.test(style.overflowX)) {
        left = Math.max(left, rect.left);
        right = Math.min(right, rect.right);
      }
    }
    if (bottom <= top || right <= left) return;
    document.querySelector('.scroll-boundary-feedback')?.remove();
    const effect = document.createElement('div');
    effect.className = 'scroll-boundary-feedback';
    effect.dataset.edge = edge;
    effect.setAttribute('aria-hidden', 'true');
    const height = Math.min(28, bottom - top);
    Object.assign(effect.style, {
      left: left + 'px',
      width: right - left + 'px',
      height: height + 'px',
      top: (edge === 'top' ? top : bottom - height) + 'px',
    });
    document.body.appendChild(effect);
    effect.addEventListener('animationend', () => effect.remove(), { once: true });
    setTimeout(() => effect.remove(), 650);
  }

  function intent(target, direction) {
    const element = owner(target, direction);
    if (!element) return;
    intents.set(element, { direction, until: performance.now() + 1500 });
    const edge = boundary(element, direction);
    if (edge) pulse(element, edge);
  }

  document.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX))
        intent(event.target, Math.sign(event.deltaY));
    },
    { passive: true },
  );
  document.addEventListener(
    'touchstart',
    (event) => {
      document.querySelector('.scroll-boundary-feedback')?.remove();
      const point = event.touches.length === 1 && event.touches[0];
      touch = point
        ? { target: event.target, x: point.clientX, y: point.clientY, lastY: point.clientY }
        : null;
    },
    { passive: true },
  );
  document.addEventListener(
    'touchmove',
    (event) => {
      if (!touch || event.touches.length !== 1) return;
      const point = event.touches[0];
      const dy = touch.y - point.clientY;
      if (Math.abs(point.clientX - touch.x) > Math.abs(dy) || Math.abs(dy) < 12) return;
      const direction = Math.sign(touch.lastY - point.clientY);
      touch.lastY = point.clientY;
      if (direction) intent(touch.target, direction);
    },
    { passive: true },
  );
  for (const event of ['touchend', 'touchcancel'])
    document.addEventListener(
      event,
      () => {
        touch = null;
      },
      { passive: true },
    );
  document.addEventListener('keydown', (event) => {
    const direction = { ArrowDown: 1, PageDown: 1, End: 1, ArrowUp: -1, PageUp: -1, Home: -1 }[
      event.key
    ];
    if (!direction || event.ctrlKey || event.altKey || event.metaKey) return;
    const target =
      event.target === document.body
        ? document.elementFromPoint(innerWidth / 2, innerHeight / 2)
        : event.target;
    intent(target, direction);
  });
  document.addEventListener(
    'scroll',
    (event) => {
      const element = event.target === document ? document.scrollingElement : event.target;
      const pending = intents.get(element);
      if (!pending || performance.now() > pending.until) return;
      const edge = boundary(element, pending.direction);
      if (edge) pulse(element, edge);
    },
    { capture: true, passive: true },
  );
}

installScrollBoundaryFeedback();

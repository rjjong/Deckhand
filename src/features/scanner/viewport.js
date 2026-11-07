// SPDX-License-Identifier: AGPL-3.0-or-later
// The log scrolls over the preview; release the camera once it is covered.
function scannerCreateViewport(scroller, stage, toolbar, { signal, onVisible }) {
  let visible = true,
    frame;
  const update = () => {
    frame = null;
    if (signal.aborted) return;
    scroller.style.setProperty(
      '--scanner-log-min',
      `${Math.max(0, scroller.clientHeight - toolbar.offsetHeight)}px`,
    );
    const next = scroller.scrollTop < stage.offsetHeight - 2;
    if (next !== visible) {
      visible = next;
      onVisible(visible);
    }
  };
  const changed = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(changed);
  observer.observe(scroller);
  observer.observe(toolbar);
  scroller.addEventListener('scroll', changed, { passive: true, signal });
  signal.addEventListener(
    'abort',
    () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    },
    { once: true },
  );
  update();
}

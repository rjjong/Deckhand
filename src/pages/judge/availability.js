function judgeRetryTime(seconds) {
  const value = Math.max(1, Math.ceil(Number(seconds) || 10));
  if (value < 60) return `${value} second${value === 1 ? '' : 's'}`;
  const minutes = Math.ceil(value / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

// Status lives on the gavel: a spinner while busy and a countdown for cooldowns.
// Cached questions stay usable while new inference is temporarily unavailable.
function watchJudgeAvailability(el, { active, working, onStatus }) {
  let stopped = false,
    timer,
    controller,
    latest,
    deadline = 0,
    duration = 1,
    expiryChecked = false;
  const button = el.querySelector('#crJudge');
  const counter = button.querySelector('.judge-button-timer');
  const paint = () => {
    if (stopped || !el.isConnected) return;
    const own = working();
    if (own) controller?.abort();
    const mode = own ? 'working' : latest?.state || 'unknown';
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const waiting = mode === 'cooldown' && remaining > 0;
    const text = own
      ? 'The judge is working on your question.'
      : mode === 'busy'
        ? 'The judge is helping another player. Saved answers are still available.'
        : mode === 'cooldown'
          ? `New questions available in ${judgeRetryTime(remaining)}. Saved answers are still available.`
          : mode === 'limit'
            ? 'Daily allowance used. Saved answers are still available.'
            : mode === 'quota'
              ? 'New AI questions are paused until midnight UTC. Saved answers are still available.'
              : mode === 'notconfigured'
                ? 'The local judge is not set up on this server.'
                : mode === 'ready'
                  ? 'Ask the judge'
                  : 'Ask the judge. Availability is temporarily unknown.';
    button.dataset.state = mode;
    button.setAttribute('aria-label', mode === 'ready' ? text : 'Ask the judge. ' + text);
    button.title = text;
    button.setAttribute('aria-busy', String(own || mode === 'busy'));
    button.classList.toggle('judge-waiting', waiting);
    button.style.setProperty(
      '--judge-progress',
      String(Math.min(1, Math.max(0.02, 1 - remaining / duration))),
    );
    counter.textContent = waiting ? `${remaining}s` : '';
    if (waiting) button.setAttribute('data-remaining', String(remaining));
    else button.removeAttribute('data-remaining');
  };
  const refresh = async () => {
    clearTimeout(timer);
    if (stopped || !el.isConnected || document.hidden || !active() || controller) return;
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), 5000);
    try {
      const response = await fetch(
        '/api/judge/status?device=' + encodeURIComponent(judgeDevice()),
        { signal: request.signal, cache: 'no-store' },
      );
      const status = await response.json();
      if (
        !response.ok ||
        !status?.ok ||
        !Number.isFinite(status.left) ||
        !Number.isFinite(status.limit)
      )
        throw new Error('status');
      if (stopped || !el.isConnected) return;
      latest = status;
      duration = Math.max(1, Number(status.cooldownSeconds) || Number(status.retryAfter) || 1);
      deadline = Date.now() + Math.max(0, Number(status.retryAfter) || 0) * 1000;
      expiryChecked = false;
      onStatus(status);
    } catch (error) {
      if (stopped) return;
      if (!request.signal.aborted) latest = null;
    } finally {
      clearTimeout(timeout);
      controller = null;
      if (!stopped && el.isConnected) {
        paint();
        if (!document.hidden && active()) timer = setTimeout(refresh, 10000);
      }
    }
  };
  const tick = setInterval(() => {
    if (stopped || !el.isConnected || document.hidden || !active() || latest?.state !== 'cooldown')
      return;
    paint();
    if (latest?.state === 'cooldown' && Date.now() >= deadline && !expiryChecked) {
      expiryChecked = true;
      refresh();
    }
  }, 1000);
  const visible = () => {
    clearTimeout(timer);
    if (document.hidden) controller?.abort();
    else refresh();
  };
  document.addEventListener('visibilitychange', visible);
  paint();
  refresh();
  return {
    refresh,
    paint,
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearInterval(tick);
      controller?.abort();
      document.removeEventListener('visibilitychange', visible);
    },
  };
}

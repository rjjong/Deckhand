function judgeRetryTime(seconds) {
  const value = Math.max(1, Math.ceil(Number(seconds) || 10));
  if (value < 60) return `${value} second${value === 1 ? '' : 's'}`;
  const minutes = Math.ceil(value / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

// Only the visible Judge page polls. No questions or player details are returned.
function watchJudgeAvailability(el, { active, working, onStatus }) {
  let stopped = false,
    timer,
    controller,
    latest;
  const banner = el.querySelector('#cjAvailability');
  const paint = () => {
    const own = working();
    if (own) controller?.abort();
    const state = own ? 'working' : latest?.state || 'unknown';
    const text = own
      ? 'The judge is working on your question…'
      : state === 'busy'
        ? 'The judge is currently helping another player.'
        : state === 'limit'
          ? 'Your daily allowance is used. Saved answers are still available.'
          : state === 'quota'
            ? 'New AI questions are paused until midnight UTC.'
            : state === 'cooldown'
              ? `Please wait ${judgeRetryTime(latest.retryAfter)} before a new question.`
              : state === 'notconfigured'
                ? 'The local judge is not set up on this server.'
                : state === 'ready'
                  ? 'The judge is ready for a question.'
                  : 'Judge availability is temporarily unknown.';
    banner.dataset.state = state;
    const label = banner.querySelector('[data-judge-availability]');
    if (label.textContent !== text) label.textContent = text;
    const detail = banner.querySelector('[data-judge-policy]');
    detail.textContent = latest
      ? `${latest.limit} new questions per day · ${latest.cooldownSeconds}s between questions · Saved answers are free.`
      : 'Saved answers do not use your daily allowance.';
  };
  const refresh = async () => {
    clearTimeout(timer);
    if (stopped || !el.isConnected || document.hidden || !active()) return;
    if (controller) return;
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), 5000);
    try {
      const response = await fetch(
        '/api/judge/status?device=' + encodeURIComponent(judgeDevice()),
        {
          signal: request.signal,
          cache: 'no-store',
        },
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
      onStatus(status);
    } catch (error) {
      if (stopped) return;
      latest = null;
    } finally {
      clearTimeout(timeout);
      controller = null;
      if (!stopped && el.isConnected) {
        paint();
        if (!document.hidden && active()) timer = setTimeout(refresh, 10000);
      }
    }
  };
  const visible = () => {
    clearTimeout(timer);
    if (document.hidden) controller?.abort();
    else refresh();
  };
  document.addEventListener('visibilitychange', visible);
  refresh();
  return {
    refresh,
    paint,
    stop() {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visible);
    },
  };
}

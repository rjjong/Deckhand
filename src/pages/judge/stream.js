// Judge responses arrive as readable progress followed by a validated result.
async function judgeAsk(payload, { signal, onProgress } = {}) {
  const ctl = new AbortController();
  const cancel = () => ctl.abort();
  const timer = setTimeout(cancel, 100000);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  let reader;
  try {
    const response = await fetch('/api/judge', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    // Cache hits, early errors and older servers still return ordinary JSON.
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      return (await response.json()) || { ok: false, error: 'down' };
    }
    reader = response.body?.getReader();
    if (!reader) return { ok: false, error: 'down' };
    const decoder = new TextDecoder();
    let buffer = '',
      event = '',
      lines = [],
      result = null;
    const dispatch = () => {
      if (lines.length) {
        const value = JSON.parse(lines.join('\n'));
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          if (event === 'progress') onProgress?.(value);
          if (event === 'result') result = value;
        }
      }
      event = '';
      lines = [];
    };
    const receive = (line) => {
      line = line.replace(/\r$/, '');
      if (!line) dispatch();
      else if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''));
    };
    while (!result) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (buffer.length > 128 * 1024) return { ok: false, error: 'down' };
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        receive(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (chunk.done) {
        if (buffer) receive(buffer);
        dispatch();
        break;
      }
    }
    return result || { ok: false, error: 'down' };
  } catch (error) {
    return {
      ok: false,
      error: signal?.aborted
        ? 'cancelled'
        : ctl.signal.aborted
          ? 'timeout'
          : error instanceof SyntaxError
            ? 'down'
            : 'offline',
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    if (reader) {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

function showJudgeProgress(body, fields) {
  if (!fields.reasoning && !fields.answer) return false;
  let preview = body.querySelector('.cja-stream');
  if (!preview) {
    body.innerHTML = /* HTML */ `<div class="cja cja-stream" aria-busy="true">
      <div class="cja-stream-status" role="status">Writing the ruling…</div>
      <div class="cja-a cja-stream-answer" hidden></div>
      <div class="cja-why cja-stream-reasoning" hidden></div>
    </div>`;
    preview = body.querySelector('.cja-stream');
  }
  for (const key of ['answer', 'reasoning']) {
    if (typeof fields[key] !== 'string') continue;
    const text = preview.querySelector('.cja-stream-' + key);
    text.textContent = fields[key];
    text.hidden = !fields[key];
  }
  return true;
}

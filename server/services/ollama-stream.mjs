/* Ollama sends one JSON object per line, independently of network chunks. */
export async function readOllamaStream(response, onToken) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('shape');
  const decoder = new TextDecoder();
  let buffer = '',
    text = '',
    finished = false;
  const accept = async (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.error) throw new Error('down');
    if (finished) throw new Error('shape');
    const token = event.message?.content;
    if (token != null && typeof token !== 'string') throw new Error('shape');
    if (token) {
      text += token;
      if (text.length > 64 * 1024) throw new Error('shape');
      await onToken(token, text);
    }
    if (event.done) {
      if (event.done_reason === 'length') throw new Error('shape');
      finished = true;
    }
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (buffer.length > 128 * 1024) throw new Error('shape');
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        await accept(line);
      }
      if (chunk.done) break;
    }
    if (buffer.trim()) await accept(buffer);
    if (!finished || !text) throw new Error('shape');
    return text;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

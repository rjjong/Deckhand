/* Read only top-level answer/explanation strings from unfinished model JSON.
   Incomplete escapes stay buffered; nested fields and JSON syntax never reach
   the page. The complete document is still validated by the Judge handler. */
function readString(text, start) {
  let value = '';
  const escapes = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
  let i = start + 1;
  for (; i < text.length; i++) {
    const char = text[i];
    if (char === '"') return { value, end: i + 1, complete: true };
    if (char !== '\\') {
      if (char < ' ') break;
      value += char;
      continue;
    }
    const escaped = text[++i];
    if (escaped === 'u') {
      const hex = text.slice(i + 1, i + 5);
      if (!/^[\da-f]{4}$/i.test(hex)) break;
      value += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else if (Object.hasOwn(escapes, escaped)) value += escapes[escaped];
    else break;
  }
  // Hold a lone high surrogate until its matching character arrives.
  if (/[\ud800-\udbff]$/.test(value)) value = value.slice(0, -1);
  return { value, end: i, complete: false };
}

export function judgeProgress(text) {
  const fields = {};
  let i = text.indexOf('{');
  if (i < 0) return fields;
  i++;
  const whitespace = () => {
    while (/\s/.test(text[i] || '') && i < text.length) i++;
  };
  while (i < text.length) {
    whitespace();
    if (text[i] !== '"') break;
    const key = readString(text, i);
    if (!key.complete) break;
    i = key.end;
    whitespace();
    if (text[i++] !== ':') break;
    whitespace();
    if (text[i] === '"') {
      const value = readString(text, i);
      if (key.value === 'reasoning' || key.value === 'answer') fields[key.value] = value.value;
      if (!value.complete) break;
      i = value.end;
    } else {
      // Skip other JSON values, including nested objects and arrays.
      let depth = 0;
      for (; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          const value = readString(text, i);
          if (!value.complete) return fields;
          i = value.end - 1;
        } else if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') {
          if (!depth) break;
          depth--;
        } else if (char === ',' && !depth) break;
      }
    }
    whitespace();
    if (text[i++] !== ',') break;
  }
  return fields;
}

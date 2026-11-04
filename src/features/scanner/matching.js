// OCR matching stays local and never guesses a set, printing, language or foil.
function scannerNameKey(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function scannerDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < b.length; j++)
      row.push(Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1)));
    previous = row;
  }
  return previous[b.length];
}

function scannerMatches(text, cards) {
  const lines = String(text || '')
    .split(/\n/)
    .map(scannerNameKey)
    .filter((x) => x.length >= 3 && x.length <= 70);
  const found = [];
  for (const card of cards) {
    const name = card.n || card.name;
    const faces = String(name || '')
      .split(' // ')
      .map(scannerNameKey);
    let score = 0;
    for (const key of faces)
      for (const line of lines) {
        if (key === line) {
          score = 1;
          break;
        }
        if (Math.abs(key.length - line.length) > 4 || key.length < 4) continue;
        const overlap = [...new Set(key)].filter((letter) => line.includes(letter)).length;
        if (overlap < new Set(key).size * 0.6) continue;
        score = Math.max(score, 1 - scannerDistance(key, line) / Math.max(key.length, line.length));
      }
    if (score >= 0.62) found.push({ card, score });
  }
  return found.sort((a, b) => b.score - a.score).slice(0, 5);
}

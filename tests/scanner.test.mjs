import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const context = vm.createContext({});
vm.runInContext(
  await readFile(new URL('../src/features/scanner/matching.js', import.meta.url), 'utf8'),
  context,
);
const matches = (text, cards) => context.scannerMatches(text, cards);

test('Scanner normalizes OCR punctuation and matches split card names', () => {
  const cards = [{ n: "Atraxa, Praetors' Voice" }, { n: 'Sol Ring' }, { n: 'Fire // Ice' }];
  assert.equal(matches('Atraxa Praetors Voice', cards)[0].card.n, cards[0].n);
  assert.equal(matches('Fire', cards)[0].card.n, 'Fire // Ice');
  assert.equal(matches('Sol Ring', cards)[0].score, 1);
});

test('Scanner offers OCR corrections but rejects unrelated text and blank card backs', () => {
  const cards = [{ n: 'Arcane Signet' }, { n: 'Sol Ring' }];
  assert.ok(matches('Arcane Slgnet', cards)[0].score > 0.85);
  assert.equal(matches('Unrelated background words', cards).length, 0);
  assert.equal(matches('', cards).length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const stored = new Map();
const context = vm.createContext({
  LS_PREFIX: 'test:',
  localStorage: { getItem: (key) => stored.get(key) || null },
  deckPriceFromCache: (deck) => deck.price || { total: 0, complete: false },
});
vm.runInContext(
  await readFile(new URL('../src/pages/decks/sort.js', import.meta.url), 'utf8'),
  context,
);

test('deck library sorts timestamps, names and cached prices without mutating decks', () => {
  const decks = [
    { id: 'missing', name: 'Unknown', createdAt: 10 },
    { id: 'beta', name: 'Beta', updatedAt: 30, price: { total: 0, complete: true } },
    { id: 'alpha', name: 'Alpha', updatedAt: 20, price: { total: 4, complete: true } },
    { id: 'tie', name: 'Tie', updatedAt: 20, price: { total: 4, complete: false } },
  ];
  const sort = (key, dir) =>
    Array.from(context.sortLibraryDecks(decks, { sort: key, sortDir: dir }), (deck) => deck.id);
  assert.deepEqual(sort('updated', 'desc'), ['beta', 'alpha', 'tie', 'missing']);
  assert.deepEqual(sort('updated', 'asc'), ['missing', 'alpha', 'tie', 'beta']);
  assert.deepEqual(sort('name', 'asc'), ['alpha', 'beta', 'tie', 'missing']);
  assert.deepEqual(sort('name', 'desc'), ['missing', 'tie', 'beta', 'alpha']);
  assert.deepEqual(sort('price', 'asc'), ['beta', 'alpha', 'tie', 'missing']);
  assert.deepEqual(sort('price', 'desc'), ['alpha', 'tie', 'beta', 'missing']);
  assert.deepEqual(
    decks.map((deck) => deck.id),
    ['missing', 'beta', 'alpha', 'tie'],
  );
});

test('saved deck sorting defaults safely when absent or malformed', () => {
  for (const value of [null, '{broken', '{}', '{"sort":"missing"}']) {
    if (value) stored.set('test:deckSort', value);
    else stored.delete('test:deckSort');
    assert.equal(context.deckSortChoice().sort, 'updated');
    assert.equal(context.deckSortChoice().sortDir, 'desc');
  }
  stored.set('test:deckSort', '{"sort":"price","sortDir":"asc"}');
  assert.equal(context.deckSortChoice().sort, 'price');
  assert.equal(context.deckSortChoice().sortDir, 'asc');
});

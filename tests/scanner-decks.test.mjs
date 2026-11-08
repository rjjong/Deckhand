import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function setup() {
  const changes = [],
    saves = [];
  const context = vm.createContext({
    state: {
      decksIndex: [],
      collection: { items: [], binders: [], wantsManual: [], wantsExclude: [] },
    },
    deckLeaders: (deck) => [deck.admiral, deck.partner].filter(Boolean),
    deckIsConstructed: (deck) => deck.format === 'modern',
    cardImageMed: () => '/icon-192.png',
    scheduleSave() {},
    logDeckChange: (deck, change) => changes.push(change),
    persistDeck: (deck) => saves.push(deck),
  });
  vm.runInContext(
    await readFile(new URL('../src/services/collection-storage.js', import.meta.url), 'utf8'),
    context,
  );
  context.saveCollection = () => {};
  vm.runInContext(
    await readFile(new URL('../src/pages/collection/playing.js', import.meta.url), 'utf8'),
    context,
  );
  for (const name of ['collection', 'decks'])
    vm.runInContext(
      await readFile(new URL(`../src/features/scanner/${name}.js`, import.meta.url), 'utf8'),
      context,
    );
  return { context, changes, saves };
}

test('deck scanning keeps every physical copy and printing without touching scan metadata or existing cards', async () => {
  const { context, changes, saves } = await setup();
  const old = { name: 'Existing card' };
  const deck = { id: 'deck', cards: [old], format: 'modern' };
  const first = { name: 'Physical copy', id: 'first-printing', legalities: { modern: 'banned' } };
  const second = { ...first, id: 'second-printing' };
  const scanned = [first, first, second, first, first];
  const result = context.scannerAddScansToDeck(deck, scanned);
  assert.equal(result.count, 5);
  assert.equal(result.added, 5);
  assert.equal(deck.cards.length, 6);
  assert.equal(deck.cards[0], old);
  assert.deepEqual(
    deck.cards.slice(1).map((card) => card.id),
    scanned.map((card) => card.id),
  );
  assert.ok(deck.cards.slice(1).every((card) => card.pin === true));
  assert.equal(first.pin, undefined);
  assert.notEqual(deck.cards[1], deck.cards[2]);
  assert.equal(changes.length, 5);
  assert.equal(saves.length, 1);
});

test('a scanned commander or partner occupies its existing command slot once across multiple additions', async () => {
  const { context, changes, saves } = await setup();
  const deck = {
    id: 'deck',
    cards: [],
    admiral: { name: 'Commander' },
    partner: { name: 'Partner' },
  };
  const claimed = new Set();
  const first = context.scannerAddScansToDeck(
    deck,
    [{ name: 'Commander' }, { name: 'Partner' }, { name: 'Plains' }],
    claimed,
  );
  assert.equal(first.matched, 2);
  assert.equal(first.added, 1);
  assert.deepEqual(
    deck.cards.map((card) => card.name),
    ['Plains'],
  );
  const second = context.scannerAddScansToDeck(
    deck,
    [{ name: 'Commander' }, { name: 'Plains' }],
    claimed,
  );
  assert.equal(second.matched, 0);
  assert.equal(second.added, 2);
  assert.deepEqual(
    deck.cards.map((card) => card.name),
    ['Plains', 'Commander', 'Plains'],
  );
  assert.equal(changes.length, 3);
  assert.equal(saves.length, 2);
});

test('a commander-only new deck is saved even when all scans match a command slot', async () => {
  const { context, saves } = await setup();
  const commander = { name: 'Commander' };
  const deck = { id: 'deck', cards: [], admiral: commander };
  const result = context.scannerAddScansToDeck(deck, [commander]);
  assert.equal(result.matched, 1);
  assert.equal(deck.cards.length, 0);
  assert.equal(saves.length, 1);
  assert.equal(deck.admiral, commander);
});

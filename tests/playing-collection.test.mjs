import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const fixture = (name = 'Adept') => ({
  name,
  set: 'tst',
  collector_number: '1',
  colors: ['U'],
  color_identity: ['U'],
  prices: { eur: '2' },
  type_line: 'Creature',
  oracle_text: 'Draw a card.',
});

async function setup() {
  let collectionSaves = 0;
  const deckSaves = [];
  const state = {
    decksIndex: [],
    collection: { items: [], binders: [], wantsManual: [], wantsExclude: [] },
    priceCache: {},
  };
  const context = vm.createContext({
    state,
    deckLeaders: (deck) => [deck.admiral, deck.partner].filter(Boolean),
    deckIsConstructed: (deck) => deck.format === 'modern',
    cardImageMed: () => '/icon-192.png',
    scheduleSave: (deck) => deckSaves.push(deck.id),
    brItemEur: (item) => item.eur ?? null,
    deckBlockReason: () => null,
    allowsDuplicates: () => true,
    colorIdentityOkDeck: () => true,
    atCopyLimit: () => false,
    logDeckChange() {},
    toast() {},
    sfFetch: async () => ({ ok: false }),
  });
  for (const path of [
    'src/services/collection-storage.js',
    'src/pages/collection/playing.js',
    'src/pages/collection/index.js',
    'src/pages/collection/wants.js',
    'src/core/deck-cards.js',
  ])
    vm.runInContext(await read(path), context);
  context.saveCollection = () => collectionSaves++;
  return { context, state, deckSaves, collectionSaves: () => collectionSaves };
}

test('Unsorted displays only spare copies without changing inventory or duplicating Playing', async () => {
  const { context, state } = await setup();
  const card = fixture();
  const item = { name: card.name, set: 'tst', cn: '1', cond: 'NM', qty: 4 };
  state.collection.items.push(item, { name: 'Loose relic', qty: 1 }, { name: 'Filed relic', qty: 2, binder: 'safe' });
  state.decksIndex.push({ id: 'a', name: 'A', format: 'modern', cards: [{ ...card, proxy: false }, { ...card, proxy: false }] });
  const rows = context.collectionUnsortedItems();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].qty, 2);
  assert.equal(rows[0]._collectionItem, item);
  assert.equal(item.qty, 4);
  assert.equal(context.computePlaying()[0].qty, 2);
  context.collectionMoveCopies(item, rows[0].qty, 'safe');
  assert.equal(item.qty, 2);
  assert.equal(item.binder, undefined);
  assert.equal(state.collection.items.find((row) => row.name === item.name && row.binder === 'safe').qty, 2);
  assert.equal(context.computePlaying()[0].qty, 2);
  assert.equal(context.collectionUnsortedItems().some((row) => row.name === item.name), false);
  assert.equal(state.collection.items.filter((row) => row.name === item.name).reduce((sum, row) => sum + row.qty, 0), 4);
});

test('cards shown in Wants are excluded from Unsorted while remaining in All cards', async () => {
  const { context, state } = await setup();
  const card = fixture();
  const item = { name: card.name, set: 'tst', cn: '1', cond: 'NM', qty: 2 };
  state.collection.items.push(item);
  state.decksIndex.push({ id: 'proxy', name: 'Proxy deck', format: 'modern', cards: [{ ...card, proxy: true }] });
  assert.equal(context.computeWants()[0].name, item.name);
  assert.equal(context.collectionUnsortedItems().length, 0);
  assert.equal(state.collection.items[0].qty, 2);
});

test('moving spare copies into a legacy binder stack preserves its implicit single copy', async () => {
  const { context, state } = await setup();
  const item = { name: 'Adept', set: 'tst', cn: '1', cond: 'NM', qty: 4 };
  const legacy = { name: 'Adept', set: 'tst', cn: '1', cond: 'NM', binder: 'safe' };
  state.collection.items.push(item, legacy);
  context.collectionMoveCopies(item, 2, 'safe');
  assert.equal(item.qty, 2);
  assert.equal(legacy.qty, 3);
});

test('deck adds reuse owned copies and create only the shortfall without moving binders', async () => {
  const { context, state } = await setup();
  const card = fixture();
  const deck = { id: 'a', name: 'A', format: 'modern', cards: [] };
  state.decksIndex.push(deck);
  const owned = {
    name: card.name,
    set: 'tst',
    cn: '1',
    qty: 2,
    binder: 'binder-a',
    cond: 'EX',
    eur: 2,
  };
  state.collection.items.push(owned);
  for (let i = 0; i < 3; i++) assert.equal(context.addCardToDeckValidated(deck, card), true);
  assert.equal(owned.qty, 2);
  assert.equal(owned.binder, 'binder-a');
  assert.equal(
    state.collection.items.reduce((n, item) => n + item.qty, 0),
    3,
  );
  assert.equal(state.collection.items.find((item) => !item.binder).qty, 1);
  assert.equal(
    context.computePlaying().reduce((n, row) => n + row.qty, 0),
    3,
  );
  assert.equal(context.computeWants().length, 0);
  assert.equal(card._playingOwned, undefined);
  assert.equal(card.proxy, undefined);
  assert.notEqual(deck.cards[0], deck.cards[1]);
  deck.cards.length = 0;
  assert.equal(context.computePlaying().length, 0);
  assert.equal(
    state.collection.items.reduce((n, item) => n + item.qty, 0),
    3,
  );
});

test('proxies always appear in Wants and changing an auto-added copy removes only its linked inventory', async () => {
  const { context, state } = await setup();
  const card = fixture();
  const deck = { id: 'a', name: 'A', format: 'modern', cards: [] };
  state.decksIndex.push(deck);
  state.collection.items.push({
    name: card.name,
    set: 'old',
    cn: '9',
    qty: 1,
    binder: 'keep',
    cond: 'NM',
  });
  context.addCardToDeckValidated(deck, card);
  context.addCardToDeckValidated(deck, card);
  assert.equal(
    state.collection.items.reduce((n, item) => n + item.qty, 0),
    2,
  );
  const added = deck.cards[1];
  assert.ok(added._playingOwned);
  context.setPlayingProxy(deck, added, true);
  assert.equal(state.collection.items.length, 1);
  assert.equal(state.collection.items[0].binder, 'keep');
  assert.equal(context.computePlaying()[0].qty, 1);
  assert.equal(context.computeWants()[0].qty, 1);
  context.setPlayingProxy(deck, added, false);
  assert.equal(
    state.collection.items.reduce((n, item) => n + item.qty, 0),
    2,
  );
  assert.equal(context.computeWants().length, 0);
  context.setPlayingProxy(deck, deck.cards[0], true);
  assert.equal(
    state.collection.items.reduce((n, item) => n + item.qty, 0),
    2,
    'a reused real copy remains owned',
  );
  assert.equal(
    context.computeWants()[0].qty,
    1,
    'an explicitly proxied slot is wanted even when another copy is owned',
  );
});

test('Playing allocates exact owned printings once across decks and excludes proxies and Commander maybeboard', async () => {
  const { context, state } = await setup();
  const first = fixture();
  const second = { ...first, set: 'new', collector_number: '2' };
  const older = { name: first.name, set: 'tst', cn: '1', qty: 5, cond: 'NM' };
  const newer = { name: first.name, set: 'new', cn: '2', qty: 1, cond: 'NM' };
  state.collection.items.push(older, newer);
  state.decksIndex.push(
    {
      id: 'a',
      name: 'A',
      format: 'modern',
      cards: [first, { ...first, proxy: true }],
      maybeboard: [second],
    },
    {
      id: 'b',
      name: 'B',
      format: 'commander',
      admiral: first,
      cards: [],
      maybeboard: [fixture('Wishlist')],
    },
  );
  const rows = context.computePlaying();
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.set === 'tst').qty, 2);
  assert.equal(rows.find((row) => row.set === 'new').qty, 1);
  assert.equal(rows.find((row) => row.set === 'tst')._collectionItem, older);
  assert.equal(older.qty, 5);
  assert.equal(context.computeWants()[0].qty, 1);
});

test('legacy decks do not inflate inventory and future adds do not backfill unrelated missing copies', async () => {
  const { context, state, collectionSaves } = await setup();
  const card = fixture();
  const legacy = { id: 'legacy', name: 'Old deck', format: 'modern', cards: [card, { ...card }] };
  const fresh = { id: 'fresh', name: 'New deck', format: 'modern', cards: [] };
  state.decksIndex.push(legacy, fresh);
  assert.equal(context.computePlaying().length, 0);
  assert.equal(context.computeWants()[0].qty, 2);
  assert.equal(collectionSaves(), 0);
  context.addCardToDeckValidated(fresh, card);
  assert.equal(state.collection.items[0].qty, 1);
  assert.deepEqual(Array.from(context.computePlaying()[0].decks), ['New deck']);
  assert.equal(context.computeWants()[0].qty, 2);
});

test('acquiring a wanted card replaces a proxy using the acquired copy', async () => {
  const { context, state, deckSaves } = await setup();
  const proxy = { ...fixture(), proxy: true };
  const deck = { id: 'a', name: 'A', format: 'modern', cards: [proxy] };
  state.decksIndex.push(deck);
  state.collection.items.push({ name: proxy.name, set: 'tst', cn: '1', qty: 1, cond: 'NM' });
  context.fulfillPlayingProxy(proxy.name);
  assert.equal(proxy.proxy, false);
  assert.equal(context.computePlaying()[0].qty, 1);
  assert.equal(context.computeWants().length, 0);
  assert.deepEqual(deckSaves, ['a']);
});

test('proxy status and ownership links survive compact deck storage', async () => {
  const { context } = await setup();
  const storage = await read('src/core/deck-storage.js');
  vm.runInContext(
    storage.slice(storage.indexOf('const SLIM_KEYS'), storage.indexOf('function slimDeckForSave')),
    context,
  );
  const card = {
    ...fixture(),
    proxy: true,
    _playingMissing: true,
    _wantsDismissed: true,
    _playingOwned: { name: 'Adept', set: 'tst', cn: '1', cond: 'NM', foil: false, binder: null },
  };
  const saved = JSON.parse(JSON.stringify(context.slimCard(card)));
  assert.equal(saved.proxy, true);
  assert.equal(saved._playingMissing, true);
  assert.equal(saved._wantsDismissed, true);
  assert.deepEqual(saved._playingOwned, card._playingOwned);
});

test('existing unowned deck copies become persistent automatic proxies without inventing inventory', async () => {
  const { context, state, deckSaves, collectionSaves } = await setup();
  const deck = {
    id: 'old',
    name: 'Old deck',
    format: 'modern',
    cards: [fixture(), { ...fixture(), proxy: false }],
  };
  state.decksIndex.push(deck);
  state.collection.wantsExclude = ['Adept'];
  context.reconcilePlayingOwnership();
  assert.ok(deck.cards.every((card) => card.proxy === true && card._playingMissing === true));
  assert.equal(state.collection.items.length, 0);
  assert.equal(collectionSaves(), 0);
  assert.deepEqual(deckSaves, ['old']);
  assert.equal(
    context.computeWants()[0].qty,
    2,
    'deck proxies cannot be hidden with a Wants exclusion',
  );
  context.reconcilePlayingOwnership();
  assert.deepEqual(deckSaves, ['old'], 'unchanged reconciliation does not schedule more writes');
});

test('each owned copy covers one slot across decks and removing inventory turns the shortage into proxies', async () => {
  const { context, state } = await setup();
  const a = { id: 'a', format: 'modern', cards: [fixture()], maybeboard: [fixture()] };
  const b = {
    id: 'b',
    format: 'commander',
    admiral: fixture(),
    cards: [],
    maybeboard: [fixture('Consideration')],
  };
  state.decksIndex.push(a, b);
  state.collection.items.push({ name: 'Adept', qty: 1, set: 'tst', cn: '1', cond: 'NM' });
  context.reconcilePlayingOwnership();
  const slots = a.cards.concat(a.maybeboard, b.admiral);
  assert.equal(slots.filter((card) => card.proxy === false).length, 1);
  assert.equal(slots.filter((card) => card.proxy === true).length, 2);
  assert.equal(
    b.maybeboard[0].proxy,
    undefined,
    'Commander considerations are outside the physical deck',
  );
  state.collection.items = [];
  context.reconcilePlayingOwnership();
  assert.ok(slots.every((card) => card.proxy === true));
  assert.equal(context.computePlaying().length, 0);
  assert.equal(context.computeWants()[0].qty, 3);
  state.collection.items.push({ name: 'Adept', qty: 2, set: 'tst', cn: '1', cond: 'NM' });
  context.reconcilePlayingOwnership();
  assert.equal(slots.filter((card) => card.proxy === false).length, 2);
  assert.equal(context.computeWants()[0].qty, 1);
});

test('inventory restores automatic proxies but leaves explicit proxies wanted', async () => {
  const { context, state } = await setup();
  const automatic = { ...fixture(), proxy: true, _playingMissing: true };
  const explicit = { ...fixture(), proxy: true };
  state.decksIndex.push({ id: 'a', format: 'modern', cards: [automatic, explicit] });
  state.collection.items.push({ name: 'Adept', qty: 2, set: 'tst', cn: '1', cond: 'NM' });
  context.reconcilePlayingOwnership();
  assert.equal(automatic.proxy, false);
  assert.equal(automatic._playingMissing, undefined);
  assert.equal(explicit.proxy, true);
  assert.equal(context.computeWants()[0].qty, 1);
  assert.equal(
    context.playingDeckCopy({ ...automatic, _playingMissing: true })._playingMissing,
    undefined,
  );
});

test('sync reconciles after deck and collection records have both arrived', async () => {
  const { context, state } = await setup();
  const card = fixture();
  state.decksIndex.push({ id: 'a', format: 'modern', cards: [card] });
  context._syncBusy = true;
  context.reconcilePlayingOwnership();
  assert.equal(card.proxy, undefined);
  state.collection.items.push({ name: card.name, qty: 1 });
  context._syncBusy = false;
  context.reconcilePlayingOwnership();
  assert.equal(card.proxy, false);
  assert.equal(context.computeWants().length, 0);
});

test('lost generated inventory clears its stale link so switching back to physical can add a real copy', async () => {
  const { context, state } = await setup();
  const card = fixture();
  const deck = { id: 'a', format: 'modern', cards: [card] };
  state.decksIndex.push(deck);
  context.ensurePlayingOwnership(deck, [card]);
  assert.ok(card._playingOwned);
  state.collection.items = [];
  context.reconcilePlayingOwnership();
  assert.equal(card.proxy, true);
  assert.equal(card._playingOwned, undefined);
  context.setPlayingProxy(deck, card, false);
  assert.equal(card.proxy, false);
  assert.equal(card._playingMissing, undefined);
  assert.equal(state.collection.items[0].qty, 1);
});

test('all basics, snow basics and Wastes are excluded while nonbasic lands with basic land types remain tracked', async () => {
  const { context } = await setup();
  for (const name of [
    'Plains',
    'Island',
    'Swamp',
    'Mountain',
    'Forest',
    'Wastes',
    'Snow-Covered Plains',
    'Snow-Covered Island',
    'Snow-Covered Swamp',
    'Snow-Covered Mountain',
    'Snow-Covered Forest',
  ])
    assert.equal(
      context.isCollectionBasicLand({ name }),
      true,
      name + ' in older records without a type line',
    );
  assert.equal(
    context.isCollectionBasicLand({ name: 'Future basic', type_line: 'Basic Snow Land — Forest' }),
    true,
  );
  for (const card of [
    { name: 'Hallowed Fountain', type_line: 'Land — Plains Island' },
    { name: 'Wasteland', type_line: 'Land' },
    { name: 'Dryad Arbor', type_line: 'Land Creature — Forest Dryad' },
  ])
    assert.equal(context.isCollectionBasicLand(card), false);
});

test('basics never generate collection inventory or Wants when added as physical copies or proxies', async () => {
  const { context, state } = await setup();
  const deck = { id: 'basics', name: 'Basics', format: 'modern', cards: [] };
  state.decksIndex.push(deck);
  for (const name of ['Forest', 'Snow-Covered Island', 'Wastes']) {
    context.addCardToDeckValidated(deck, {
      ...fixture(name),
      type_line: 'Basic Land',
      proxy: false,
    });
    context.addCardToDeckValidated(deck, {
      ...fixture(name),
      type_line: 'Basic Land',
      proxy: true,
    });
    state.collection.wantsManual.push({ name });
  }
  context.reconcilePlayingOwnership();
  assert.equal(deck.cards.length, 6, 'deck contents are retained');
  assert.ok(deck.cards.every((card) => !card.proxy && !card._playingMissing));
  assert.equal(state.collection.items.length, 0);
  assert.equal(context.computePlaying().length, 0);
  assert.equal(context.computeWants().length, 0);
  context.addCardToDeckValidated(deck, {
    ...fixture('Hallowed Fountain'),
    type_line: 'Land — Plains Island',
  });
  assert.equal(state.collection.items[0].name, 'Hallowed Fountain');
  assert.equal(context.computePlaying()[0].qty, 1);
});

test('legacy basic records remain in storage but are excluded from inventory totals and automatic proxies', async () => {
  const { context, state } = await setup();
  state.collection.items.push(
    { name: 'Forest', qty: 100, eur: 5 },
    { name: 'Snow-Covered Island', qty: 40, eur: 3 },
    { name: 'Hallowed Fountain', qty: 2, eur: 10, type_line: 'Land — Plains Island' },
  );
  const basic = {
    ...fixture('Forest'),
    proxy: true,
    _playingMissing: true,
    _playingOwned: { name: 'Forest' },
  };
  state.decksIndex.push({ id: 'old', format: 'modern', cards: [basic] });
  context.reconcilePlayingOwnership();
  assert.equal(basic.proxy, false);
  assert.equal(basic._playingMissing, undefined);
  assert.equal(basic._playingOwned, undefined);
  assert.equal(context.collectionTrackedItems().length, 1);
  assert.equal(context.collectionTotalValue(state.collection.items), 20);
  assert.equal(context.playingOwnedCounts().has('forest'), false);
  assert.equal(state.collection.items.length, 3, 'existing records are preserved for backups');
  assert.equal(state.collection.items[0].qty, 100);
});

test('bulk dismiss removes manual Wants and hides current proxies without deleting owned or deck cards', async () => {
  const { context, state } = await setup();
  const proxy = { ...fixture(), proxy: true };
  const deck = { id: 'a', format: 'modern', cards: [proxy, { ...proxy }] };
  state.decksIndex.push(deck);
  state.collection.items.push({ name: 'Kept owned card', qty: 4 });
  state.collection.wantsManual.push(fixture('Manual wish'));
  context.dismissWantedCards(['Adept', 'Manual wish']);
  assert.equal(context.computeWants().length, 0);
  assert.equal(deck.cards.length, 2);
  assert.ok(deck.cards.every((card) => card.proxy && card._wantsDismissed));
  assert.equal(state.collection.items[0].qty, 4);
  assert.equal(state.collection.wantsManual.length, 0);
  context.addCardToDeckValidated(deck, proxy);
  assert.equal(context.computeWants()[0].qty, 1, 'a newly added proxy is wanted again');
  assert.equal(deck.cards.length, 3);
  assert.equal(deck.cards[2]._wantsDismissed, undefined);
});

test('bulk acquisition adds displayed quantities to one binder and fulfills proxies without duplicating deck cards', async () => {
  const { context, state } = await setup();
  const a = fixture();
  const b = fixture('Manual wish');
  state.collection.binders.push({ id: 'destination' });
  state.decksIndex.push({
    id: 'a',
    format: 'modern',
    cards: [
      { ...a, proxy: true },
      { ...a, proxy: true },
    ],
  });
  state.collection.wantsManual.push({ ...b, qty: 3 });
  const rows = context.computeWants();
  const result = context.addWantedCardsToBinder(
    rows,
    rows.map((row) => (row.name === a.name ? a : b)),
    'destination',
  );
  assert.equal(result.added, 5);
  assert.equal(result.failed.length, 0);
  assert.equal(state.collection.items.find((card) => card.name === a.name).qty, 2);
  assert.equal(state.collection.items.find((card) => card.name === b.name).qty, 3);
  assert.ok(state.collection.items.every((card) => card.binder === 'destination'));
  assert.equal(state.decksIndex[0].cards.length, 2);
  assert.ok(state.decksIndex[0].cards.every((card) => card.proxy === false));
  assert.equal(context.computeWants().length, 0);
});

test('bulk acquisition leaves unresolved cards wanted and rejects a deleted destination without writing inventory', async () => {
  const { context, state } = await setup();
  state.collection.binders.push({ id: 'destination' });
  state.collection.wantsManual.push(fixture(), fixture('Missing card'));
  const rows = context.computeWants();
  assert.throws(() => context.addWantedCardsToBinder(rows, [fixture(), null], 'deleted'));
  assert.equal(state.collection.items.length, 0);
  const result = context.addWantedCardsToBinder(rows, [fixture(), null], 'destination');
  assert.equal(result.added, 1);
  assert.deepEqual(Array.from(result.failed), ['Missing card']);
  assert.equal(context.computeWants()[0].name, 'Missing card');
});

test('acquiring a visible wanted proxy prioritizes it over previously dismissed copies', async () => {
  const { context, state } = await setup();
  const hidden = { ...fixture(), proxy: true, _wantsDismissed: true };
  const wanted = { ...fixture(), proxy: true };
  state.decksIndex.push({ id: 'a', format: 'modern', cards: [hidden, wanted] });
  state.collection.items.push({ name: 'Adept', qty: 1 });
  context.fulfillPlayingProxy('Adept');
  assert.equal(hidden.proxy, true);
  assert.equal(wanted.proxy, false);
  assert.equal(context.computeWants().length, 0);
});

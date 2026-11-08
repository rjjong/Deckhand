import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import syncRecords from '../shared/sync-records.cjs';

async function setup() {
  const stored = new Map();
  let id = 0;
  const context = vm.createContext({
    state: {},
    LS_PREFIX: 'test:',
    uid: () => 'trade-' + ++id,
    toast() {},
    localStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
    },
  });
  const source = await readFile(new URL('../src/pages/trade/index.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('/* Trade prices')), context);
  vm.runInContext(
    source.slice(
      source.indexOf('function tradeSideTotal'),
      source.indexOf('function tradeCardmarketUrl'),
    ),
    context,
  );
  vm.runInContext(
    await readFile(new URL('../src/pages/trade/history.js', import.meta.url), 'utf8'),
    context,
  );
  return { context, stored };
}

test('confirmed trades snapshot the partner, printings, quantities and agreed prices and survive storage and sync', async () => {
  const { context, stored } = await setup();
  const original = {
    a: [{ name: 'Received', set: 'tst', cn: '1', qty: 2, eur: 7 }],
    b: [{ name: 'Given', qty: 1, eur: 5, foil: true }],
    partnerName: ' Riley ',
    history: [],
  };
  context.state.trade = original;
  const snapshot = context.captureTradeHistory(context.loadTrade());
  original.a[0].qty = 9;
  original.a[0].eur = 999;
  original.partnerName = 'Changed afterward';
  context.completeTradeHistory(snapshot, original);
  context.saveTrade();
  assert.equal(context.state.trade.a.length, 0);
  assert.equal(context.state.trade.partnerName, '');
  const record = context.state.trade.history[0];
  assert.equal(record.partnerName, 'Riley');
  assert.equal(record.a[0].qty, 2);
  assert.equal(context.tradeSideTotal(record.a), 14);
  assert.equal(context.tradeSideTotal(record.b), 5);
  assert.equal(record.b[0].foil, true);
  const raw = stored.get('test:trade');
  const projected = syncRecords.syncProjectStorage('trade', raw);
  assert.equal(syncRecords.syncRestoreStorage('trade', projected), raw);
  context.state.trade = null;
  assert.equal(context.loadTrade().history[0].partnerName, 'Riley');
});

test('clearing a draft keeps confirmed history and does not archive the cleared cards', async () => {
  const { context } = await setup();
  context.state.trade = {
    a: [{ name: 'Draft card' }],
    b: [],
    partnerName: 'Riley',
    history: [{ id: 'confirmed', at: Date.now(), a: [], b: [] }],
  };
  context.resetCurrentTrade();
  assert.equal(context.state.trade.a.length, 0);
  assert.equal(context.state.trade.partnerName, '');
  assert.equal(context.state.trade.history.length, 1);
  assert.equal(context.state.trade.history[0].id, 'confirmed');
});

test('clearing confirmed history preserves the current trade and clears its synced storage', async () => {
  const { context, stored } = await setup();
  context.state.trade = {
    a: [{ name: 'Incoming', qty: 2, eur: 4 }],
    b: [{ name: 'Outgoing', qty: 1, eur: 3 }],
    partnerName: 'Riley',
    history: [{ id: 'old', at: Date.now(), a: [], b: [] }],
  };
  const current = context.state.trade;
  assert.equal(context.clearTradeHistory(), true);
  assert.equal(context.state.trade.a, current.a);
  assert.equal(context.state.trade.b, current.b);
  assert.equal(context.state.trade.partnerName, 'Riley');
  const raw = stored.get('test:trade');
  const projected = syncRecords.syncProjectStorage('trade', raw);
  assert.equal(JSON.parse(syncRecords.syncRestoreStorage('trade', projected)).history.length, 0);
  context.state.trade = null;
  assert.equal(context.loadTrade().history.length, 0);
  assert.equal(context.state.trade.a[0].qty, 2);
});

test('history remains available when saving the cleared trade fails', async () => {
  const { context } = await setup();
  const previous = (context.state.trade = {
    a: [],
    b: [],
    history: [{ id: 'old', at: Date.now(), a: [], b: [] }],
  });
  context.localStorage.setItem = () => {
    throw new Error('Storage unavailable');
  };
  assert.equal(context.clearTradeHistory(), false);
  assert.equal(context.state.trade, previous);
  assert.equal(context.tradeHistoryRecords().length, 1);
});

test('history is bounded, ordered newest first and ignores malformed records', async () => {
  const { context } = await setup();
  const history = Array.from({ length: 110 }, (_, i) => ({
    id: 'old-' + i,
    at: Date.now() - i * 1000,
    a: [],
    b: [],
  }));
  history.push(
    { id: 'bad', at: null, a: [], b: [] },
    { id: 'invalid-date', at: 1e100, a: [], b: [] },
  );
  context.state.trade = { a: [], b: [], history };
  const records = context.tradeHistoryRecords();
  assert.equal(records.length, 100);
  assert.equal(records[0].id, 'old-0');
  assert.equal(records.at(-1).id, 'old-99');
});

test('an incoming draft is preserved when the already-confirmed trade finishes', async () => {
  const { context } = await setup();
  const original = { a: [{ name: 'Confirmed' }], b: [], partnerName: 'First trader' };
  const snapshot = context.captureTradeHistory(original);
  context.state.trade = { a: [{ name: 'Another draft' }], b: [], partnerName: 'Next trader' };
  context.completeTradeHistory(snapshot, original);
  assert.equal(context.state.trade.a[0].name, 'Another draft');
  assert.equal(context.state.trade.partnerName, 'Next trader');
  assert.equal(context.state.trade.history[0].partnerName, 'First trader');
  assert.equal(context.normalizeTradePartnerName('  Riley  '), 'Riley');
  assert.ok(context.normalizeTradePartnerName('a'.repeat(98) + '🙂').length <= 99);
});

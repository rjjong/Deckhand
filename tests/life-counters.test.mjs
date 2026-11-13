import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import syncRecords from '../shared/sync-records.cjs';

async function setup(format = 'commander') {
  const stored = new Map();
  let pending;
  const context = vm.createContext({
    state: { life: { count: 2, history: [], layout: '2f' } },
    lifeFmt: () => format,
    lifeStart: () => 40,
    LS_PREFIX: 'test:',
    uid: () => 'counter-game',
    clearTimeout() {},
    setTimeout: (callback) => {
      pending = callback;
    },
    localStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
    },
  });
  for (const name of ['counters', 'model'])
    vm.runInContext(
      await readFile(new URL(`../src/pages/life/${name}.js`, import.meta.url), 'utf8'),
      context,
    );
  return { context, stored, flush: () => pending() };
}

test('only commander casts start enabled in Commander variants; constructed starts without counters', async () => {
  for (const format of ['commander', 'paupercommander', 'duel', 'constructed']) {
    const { context } = await setup(format);
    const counters = context.ensureLifePlayers()[0].counters;
    assert.deepEqual(
      Object.keys(counters).filter((id) => counters[id].enabled),
      format === 'constructed' ? [] : ['commander'],
    );
    assert.ok(Object.values(counters).every((counter) => counter.value === 0));
    counters.energy.enabled = true;
    counters.energy.value = 8;
    assert.equal(context.ensureLifePlayers()[1].counters.energy.value, 0);
    assert.equal(context.ensureLifePlayers()[1].counters.energy.enabled, false);
  }
});

test('legacy saved players gain defaults, while explicit choices and valid values survive repeated normalization', async () => {
  const { context } = await setup();
  const player = {
    counters: {
      commander: { enabled: false, value: 3 },
      energy: { enabled: true, value: 7.9 },
      mana: { enabled: true, value: -10 },
      experience: { value: 'invalid' },
      storm: { enabled: true, value: 100000 },
    },
  };
  context.ensureLifeCounters(player);
  context.ensureLifeCounters(player);
  assert.equal(player.counters.commander.enabled, false);
  assert.equal(player.counters.commander.value, 3);
  assert.equal(player.counters.energy.value, 7);
  assert.equal(player.counters.mana.value, 0);
  assert.equal(player.counters.experience.value, 0);
  assert.equal(player.counters.storm.value, 9999);
  for (const value of [Infinity, -Infinity, NaN, undefined])
    assert.equal(context.lifeCounterValue(value), 0);
});

test('saved games and account sync retain independent counter values and visibility', async () => {
  const { context, stored, flush } = await setup();
  const players = context.ensureLifePlayers();
  players[0].counters.mana = { enabled: true, value: 12 };
  players[0].counters.commander = { enabled: false, value: 2 };
  players[1].counters.energy = { enabled: true, value: 9 };
  context.lifeAutosave();
  flush();
  const raw = stored.get('test:lifeSaves');
  const projected = syncRecords.syncProjectStorage('lifeSaves', raw);
  const restored = JSON.parse(syncRecords.syncRestoreStorage('lifeSaves', projected));
  context.state.life.players = restored[0].d.players;
  const next = context.ensureLifePlayers();
  assert.equal(next[0].counters.mana.value, 12);
  assert.equal(next[0].counters.commander.enabled, false);
  assert.equal(next[0].counters.commander.value, 2);
  assert.equal(next[1].counters.energy.value, 9);
  assert.equal(next[1].counters.mana.enabled, false);
});

test('legacy mana becomes colorless once, and color selections keep independent amounts', async () => {
  const { context } = await setup();
  const player = { counters: { mana: { enabled: true, value: 12 } } };
  context.ensureLifeCounters(player);
  assert.equal(player.counters.manaC.enabled, true);
  assert.equal(player.counters.manaC.value, 12);
  player.counters.manaC.enabled = false;
  player.counters.manaU = { enabled: true, value: 3 };
  context.ensureLifeCounters(player);
  assert.equal(player.counters.manaC.enabled, false);
  assert.equal(player.counters.manaU.value, 3);
  assert.equal(player.counters.manaR.value, 0);
});

test('commander casts display twice their value as tax, and colored mana survives save and sync', async () => {
  const { context, stored, flush } = await setup();
  const player = context.ensureLifePlayers()[0];
  player.counters.commander.value = 3;
  assert.equal(context.lifeCounterDisplay('commander', player.counters.commander), 6);
  player.counters.manaW = { enabled: true, value: 4 };
  player.counters.manaU = { enabled: true, value: 8 };
  player.counters.manaR = { enabled: false, value: 2 };
  context.lifeAutosave();
  flush();
  const projected = syncRecords.syncProjectStorage('lifeSaves', stored.get('test:lifeSaves'));
  const restored = JSON.parse(syncRecords.syncRestoreStorage('lifeSaves', projected));
  context.state.life.players = restored[0].d.players;
  const next = context.ensureLifePlayers()[0];
  assert.equal(context.lifeCounterDisplay('commander', next.counters.commander), 6);
  assert.equal(next.counters.manaW.value, 4);
  assert.equal(next.counters.manaU.value, 8);
  assert.equal(next.counters.manaR.value, 2);
  assert.equal(next.counters.manaR.enabled, false);
});

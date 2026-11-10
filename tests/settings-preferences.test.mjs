import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import records from '../shared/sync-records.cjs';

async function setup({ dark = true } = {}) {
  const stored = new Map();
  const context = vm.createContext({
    state: {},
    LS_PREFIX: 'test:',
    GUILDS: [{ k: 'dimir' }, { k: 'rakdos' }, { k: 'azorius' }],
    matchMedia: () => ({ matches: dark }),
    loadCollection: () => ({ items: [], binders: [] }),
    loadPriceCache: () => ({}),
    applyTheme() {},
    localStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
    },
  });
  const stateSource = await readFile(new URL('../src/core/state.js', import.meta.url), 'utf8');
  vm.runInContext(
    stateSource.slice(stateSource.indexOf('const STARTUP_PAGES'), stateSource.indexOf('let state')),
    context,
  );
  const source = await readFile(new URL('../src/core/preferences.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('function applyTheme')), context);
  return { context, stored };
}

test('device appearance defaults use Rakdos in dark mode and Azorius in light mode', async () => {
  for (const dark of [true, false]) {
    const { context, stored } = await setup({ dark });
    await context.loadSettings();
    assert.equal(context.state.theme, dark ? 'dark' : 'light');
    assert.equal(context.state.guild, dark ? 'rakdos' : 'azorius');
    stored.set('test:settings:app', JSON.stringify({ theme: 'dark', guild: 'dimir' }));
    await context.loadSettings();
    assert.equal(context.state.theme, 'dark');
    assert.equal(context.state.guild, 'dimir');
    stored.set('test:settings:app', JSON.stringify({ theme: 'invalid', guild: 'missing', scannerIgnoreSession: true }));
    await context.loadSettings();
    assert.equal(context.state.theme, dark ? 'dark' : 'light');
    assert.equal(context.state.guild, dark ? 'rakdos' : 'azorius');
    assert.equal(context.state.scannerIgnoreSession, true);
  }
});

test('scanner startup and hidden collection totals survive saving, loading and independent preference sync', async () => {
  const { context, stored } = await setup();
  Object.assign(context.state, {
    startupPage: 'scan-collection',
    hideCollectionFolderPrices: true,
    theme: 'dark',
    guild: 'dimir',
    scannerIdThreshold: 0.8,
  });
  await context.persistSettings();
  const projected = records.syncProjectStorage('settings:app', stored.get('test:settings:app'));
  const savedSettings = JSON.parse(stored.get('test:settings:app'));
  for (const field of Object.keys(savedSettings)) {
    const key = 'setting:' + field;
    assert.equal(
      projected[key],
      JSON.stringify(savedSettings[field]),
      `${field} must be projected`,
    );
    assert.equal(
      records.syncRecordValid(key, projected[key]),
      true,
      `${field} must pass server validation`,
    );
  }
  assert.equal(projected['setting:hideCollectionFolderPrices'], 'true');
  assert.equal(projected['setting:startupPage'], '"scan-collection"');
  assert.equal(records.syncRecordAllowed('setting:hideCollectionFolderPrices'), true);
  stored.set('test:settings:app', records.syncRestoreStorage('settings:app', projected));
  context.state = {};
  await context.loadSettings();
  assert.equal(context.state.hideCollectionFolderPrices, true);
  assert.equal(context.state.startupPage, 'scan-collection');
  assert.equal(context.state.scannerIdThreshold, 0.8);
  context.state.hideCollectionFolderPrices = false;
  await context.persistSettings();
  assert.equal(
    records.syncProjectStorage('settings:app', stored.get('test:settings:app'))[
      'setting:hideCollectionFolderPrices'
    ],
    'false',
  );
  assert.equal(records.syncRecordValid('setting:hideCollectionFolderPrices', 'false'), true);
  for (const value of ['true', 'false', 0, 1, null, {}, []])
    assert.equal(
      records.syncRecordValid('setting:hideCollectionFolderPrices', JSON.stringify(value)),
      false,
    );
});

test('existing or malformed preferences show collection totals by default', async () => {
  const { context, stored } = await setup();
  for (const value of ['{invalid', '{}', '{"hideCollectionFolderPrices":"true"}']) {
    stored.set('test:settings:app', value);
    context.state.hideCollectionFolderPrices = true;
    await context.loadSettings();
    assert.equal(context.state.hideCollectionFolderPrices, false);
  }
});

test('scanner timing upgrades the old default once while preserving custom and later choices', async () => {
  const { context, stored } = await setup();
  stored.set('test:settings:app', JSON.stringify({ scannerIntervalMs: 650, scannerIdThreshold: 0.8 }));
  await context.loadSettings();
  assert.equal(context.state.scannerIntervalMs, 200);
  assert.equal(context.state.scannerIdThreshold, 0.8);
  assert.equal(JSON.parse(stored.get('test:settings:app')).scannerIntervalMs, 200);
  context.state.scannerIntervalMs = 650;
  await context.persistSettings();
  await context.loadSettings();
  assert.equal(context.state.scannerIntervalMs, 650);
  const custom = await setup();
  custom.stored.set('test:settings:app', JSON.stringify({ scannerIntervalMs: 900 }));
  await custom.context.loadSettings();
  assert.equal(custom.context.state.scannerIntervalMs, 900);
});

test('removed scanner debounce is discarded from saved and backed-up preferences', async () => {
  const { context, stored } = await setup();
  stored.set('test:settings:app', JSON.stringify({
    scannerDebounceMs: 60000, scannerIntervalMs: 500, scannerIgnoreSession: true,
  }));
  await context.loadSettings();
  assert.equal(Object.hasOwn(context.state, 'scannerDebounceMs'), false);
  assert.equal(Object.hasOwn(JSON.parse(stored.get('test:settings:app')), 'scannerDebounceMs'), false);
  assert.equal(context.state.scannerIntervalMs, 500);
  assert.equal(context.state.scannerIgnoreSession, true);
  await context.persistSettings();
  assert.equal(Object.hasOwn(JSON.parse(stored.get('test:settings:app')), 'scannerDebounceMs'), false);
});

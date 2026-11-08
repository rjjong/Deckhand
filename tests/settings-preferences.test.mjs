import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import records from '../shared/sync-records.cjs';

async function setup() {
  const stored = new Map();
  const context = vm.createContext({
    state: {},
    LS_PREFIX: 'test:',
    GUILDS: [{ k: 'dimir' }],
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

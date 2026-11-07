import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/pages/collection/binders.js', import.meta.url),
  'utf8',
);
const context = vm.createContext({ brItemEur: (item) => item.eur ?? null });
vm.runInContext(
  source.slice(source.indexOf('const BR_GROUPS'), source.indexOf('const BR_TYPE_ORDER')),
  context,
);

test('collection sorting keeps zero values, unknown values last, and stable name ties in both directions', () => {
  const items = [
    { name: 'Missing' },
    { name: 'Beta', mv: 5, eur: 0 },
    { name: 'Alpha', mv: 1, eur: 3 },
    { name: 'Tie', mv: 1, eur: 3 },
  ];
  const sorted = (key, dir) =>
    Array.from(context.binderSortItems(items.slice(), key, dir), (item) => item.name);
  assert.deepEqual(sorted('name', 'desc'), ['Tie', 'Missing', 'Beta', 'Alpha']);
  assert.deepEqual(sorted('mv', 'asc'), ['Alpha', 'Tie', 'Beta', 'Missing']);
  assert.deepEqual(sorted('mv', 'desc'), ['Beta', 'Alpha', 'Tie', 'Missing']);
  assert.deepEqual(sorted('price', 'asc'), ['Beta', 'Alpha', 'Tie', 'Missing']);
  assert.deepEqual(sorted('price', 'desc'), ['Alpha', 'Tie', 'Beta', 'Missing']);
  assert.equal(items[0].name, 'Missing');
});

test('older binder views retain their default direction while new choices preserve both sort and grouping', () => {
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(context.binderView({ view: { group: 'color', sort: 'price' } })), {
    group: 'color',
    sort: 'price',
    sortDir: 'desc',
  });
  assert.deepEqual(
    plain(context.binderView({ view: { group: 'type', sort: 'mv', sortDir: 'desc' } })),
    { group: 'type', sort: 'mv', sortDir: 'desc' },
  );
  assert.deepEqual(plain(context.binderView({ view: {} })), {
    group: 'none',
    sort: 'name',
    sortDir: 'asc',
  });
});

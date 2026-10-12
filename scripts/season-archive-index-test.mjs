import assert from 'node:assert/strict';

class MemoryStorage {
  data = new Map();
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.get(String(key)) ?? null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
}

globalThis.window = { localStorage: new MemoryStorage() };
globalThis.localStorage = globalThis.window.localStorage;
const { setSaveItem } = await import('../src/lib/saveStorage.ts');
const { getSeasonArchiveIndex, seasonArchiveKey } = await import('../src/lib/season/seasonHistory.ts');

setSaveItem(seasonArchiveKey('career-index-test', '2026/27'), '{"version":1}');
setSaveItem(seasonArchiveKey('career-index-test', '2027/28'), '{"version":1}');
setSaveItem(seasonArchiveKey('another-career', '2030/31'), '{"version":1}');

assert.deepEqual(getSeasonArchiveIndex('career-index-test'), {
  count: 2,
  latestSeason: '2027/28',
});
assert.deepEqual(getSeasonArchiveIndex('missing-career'), {
  count: 0,
  latestSeason: null,
});
console.log('season-archive-index-test: OK');

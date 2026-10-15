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
const { getSeasonArchiveIndex, getSeasonArchive, listSeasonArchives, seasonArchiveKey } = await import('../src/lib/season/seasonHistory.ts');

setSaveItem(seasonArchiveKey('career-index-test', '2026/27'), JSON.stringify({ version: 1, saveId: 'career-index-test', season: '2026/27' }));
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
const legacyArchive = getSeasonArchive('career-index-test', '2026/27');
assert.deepEqual(legacyArchive?.leagues, [], 'legacy archive without tables gets a safe empty array');
assert.deepEqual(legacyArchive?.topScorers, [], 'legacy archive without scorer data does not crash new history panels');
assert.deepEqual(legacyArchive?.europeanChampions, { ucl: null, uel: null, uecl: null }, 'legacy archive without European champions gets safe defaults');
assert.equal(listSeasonArchives('career-index-test').find((archive) => archive.season === '2026/27')?.retirements.length, 0, 'legacy archive without retirements remains readable');
console.log('season-archive-index-test: OK');

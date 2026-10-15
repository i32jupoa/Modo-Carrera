import assert from 'node:assert/strict';
import { getSeasonRolloverDates, remainingInjuryDays, resetPlayerSeasonCounters } from '../src/lib/season/seasonRolloverCore.ts';
import { retirementProbability, selectSeasonRetirements } from '../src/lib/season/retirements.ts';
import { buildSeasonArchive } from '../src/lib/season/seasonHistory.ts';

const first = getSeasonRolloverDates('2026/27');
assert.equal(first.fromSeason, '2026/27');
assert.equal(first.toSeason, '2027/28');
assert.equal(first.endDate, '2027-06-30');
assert.equal(first.nextStartDate, '2027-07-01');
const century = getSeasonRolloverDates('2099/00');
assert.equal(century.toSeason, '2100/01');
assert.equal(century.nextStartDate, '2100-07-01');
assert.equal(remainingInjuryDays('2027-07-10', '2027-07-01'), 9);
assert.equal(remainingInjuryDays('2027-07-01', '2027-07-01'), 0);

const preserved = resetPlayerSeasonCounters({
  goals: 12, appearances: 25, morale: 48, energy: 27,
  injuredUntilDate: '2027-08-01', injuryType: 'Muscular', injuryDurationDays: 40,
  ageOverride: 31, ageOverrideSeason: '2026/27',
  dynamicStats: { seasonGoals: 12, seasonAssists: 5, seasonAppearances: 25, seasonMinutes: 1600, seasonAverageRating: 7.1, monthlyStats: [{ month: 3 }], currentOVR: 82, careerSeasons: [{ season: 1 }] },
}, { goals: 0, appearances: 0, morale: 70, energy: 100, injuredUntil: 0 }, '2027-07-01');
assert.equal(preserved.goals, 0);
assert.equal(preserved.morale, 65);
assert.equal(preserved.energy, 100);
assert.equal(preserved.injuredUntilDate, '2027-08-01');
assert.equal(preserved.dynamicStats.seasonGoals, 0);
assert.equal(preserved.dynamicStats.seasonAppearances, 0);
assert.equal(preserved.dynamicStats.currentOVR, 82);
assert.equal(preserved.dynamicStats.careerSeasons.length, 1);
assert.deepEqual(preserved.dynamicStats.monthlyStats, []);

const young = { id: 'young', name: 'Young Player', age: 20, ovr: 60, clubId: 'club' };
assert.equal(retirementProbability(young), 0);
const older = { id: 'old', name: 'Veteran', age: 41, ovr: 64, clubId: null };
const retire1 = selectSeasonRetirements([older], { seed: 12345, season: '2040/41', retiredAt: '2041-06-30' });
const retire2 = selectSeasonRetirements([older], { seed: 12345, season: '2040/41', retiredAt: '2041-06-30' });
assert.deepEqual(retire1, retire2, 'retirements must be deterministic for the same career/season/player');
assert.equal(retire1.length, 1, 'a 41-year-old free agent has a high retirement probability');

const olderWithContract = { id: 'older-contract', name: 'Veteran With Contract', age: 36, ovr: 64, clubId: 'club', contractYearsLeft: 1 };
const olderWithoutContractExpiry = { ...olderWithContract, id: 'older-long-contract', contractYearsLeft: 3 };
assert.ok(
  retirementProbability(olderWithContract) > retirementProbability(olderWithoutContractExpiry),
  'contract ending should modestly increase retirement probability for an older player',
);
assert.equal(
  retirementProbability({ id: 'young-star', name: 'Young Star', age: 30, ovr: 93, clubId: 'club', contractYearsLeft: 1 }),
  0,
  'a player in his peak must not retire only because his contract is ending',
);

const archive = buildSeasonArchive({
  saveId: 'career-test',
  save: {
    version: 2, myTeamId: 'club-a', myLeague: 'laliga', season: '2026/27',
    fixtures: {}, currentMatchday: {}, lineups: {}, formations: {}, suspensions: {},
    standings: { laliga: [
      { teamId: 'club-b', points: 80, played: 38, won: 24, drawn: 8, lost: 6, gf: 75, ga: 30, gd: 45 },
      { teamId: 'club-a', points: 78, played: 38, won: 23, drawn: 9, lost: 6, gf: 70, ga: 29, gd: 41 },
    ] },
    cupFixtures: {}, cupChampion: { laliga: 'club-a' }, cupDrawPending: null, pendingBackgroundSims: [],
    uclFixtures: [], uelFixtures: [], ueclFixtures: [], uclChampion: 'club-c', uelChampion: null, ueclChampion: null,
    ucl: null, uel: null, uecl: null,
  },
  awards: { ballonDor: 'Star Player' },
  topScorers: [{ playerId: 'p1', playerName: 'Scorer', clubId: 'club-a', goals: 31 }],
});
assert.equal(archive.leagues[0].championId, 'club-b');
assert.equal(archive.leagues[0].table[0].position, 1);
assert.equal(archive.domesticCupChampions[0].teamId, 'club-a');
assert.equal(archive.europeanChampions.ucl, 'club-c');
assert.equal(archive.awards.ballonDor, 'Star Player');
assert.equal(archive.topScorers[0].goals, 31);

console.log('season-rollover-test: OK');

import assert from 'node:assert/strict';
import { buildSeasonArchive, buildClubPalmares, buildPlayerPalmares, getSeasonArchiveAwards } from '../src/lib/season/seasonHistory.ts';

function archive(season, patches = {}) {
  return {
    version: 1,
    saveId: 'history-test',
    season,
    archivedAt: `${Number(season.slice(0, 4)) + 1}-06-30T00:00:00.000Z`,
    myTeamId: 'club-a',
    myLeague: 'laliga',
    myFinalPosition: 2,
    leagues: [{ leagueId: 'laliga', championId: 'club-b', table: [{ teamId: 'club-b', position: 1, played: 38, won: 25, drawn: 8, lost: 5, gf: 80, ga: 30, gd: 50, points: 83 }] }],
    domesticCupChampions: [{ leagueId: 'laliga', teamId: 'club-a' }],
    europeanChampions: { ucl: 'club-a', uel: null, uecl: 'club-c' },
    awards: { ballonDor: 'Player A' },
    awardWinners: [{ category: 'Balón de Oro', playerId: 'p1', playerName: 'Player A' }],
    topScorers: [{ playerId: 'p1', playerName: 'Player A', clubId: 'club-a', goals: 30 }],
    playerSeasonRecords: [{ playerId: 'p1', playerName: 'Player A', clubId: 'club-a', goals: 30, assists: 7, appearances: 35, trophies: ['Copa · laliga', 'Champions League'] }],
    retirements: [], promotions: [], relegations: [],
    ...patches,
  };
}

const built = buildSeasonArchive({
  saveId: 'history-test',
  save: {
    version: 2, myTeamId: 'club-a', myLeague: 'laliga', season: '2026/27',
    fixtures: {}, currentMatchday: {}, lineups: {}, formations: {}, suspensions: {},
    standings: { laliga: [
      { teamId: 'club-b', points: 83, played: 38, won: 25, drawn: 8, lost: 5, gf: 80, ga: 30, gd: 50 },
      { teamId: 'club-a', points: 78, played: 38, won: 23, drawn: 9, lost: 6, gf: 70, ga: 29, gd: 41 },
    ] },
    cupFixtures: {}, cupChampion: { laliga: 'club-a' }, cupDrawPending: null, pendingBackgroundSims: [],
    uclFixtures: [], uelFixtures: [], ueclFixtures: [], uclChampion: 'club-a', uelChampion: null, ueclChampion: 'club-c',
    ucl: null, uel: null, uecl: null,
  },
  awards: { ballonDor: 'Player A' },
  awardWinners: [{ category: 'Balón de Oro', playerId: 'p1', playerName: 'Player A' }],
  topScorers: [{ playerId: 'p1', playerName: 'Player A', clubId: 'club-a', goals: 30 }],
  playerSeasonRecords: [{ playerId: 'p1', playerName: 'Player A', clubId: 'club-a', goals: 30, assists: 7, appearances: 35 }],
  featuredTransfers: [{ id: 'transfer-1', date: '2027-01-15', playerId: 'p2', playerName: 'Player B', fromClubId: 'club-b', toClubId: 'club-a', fee: 42000000, type: 'permanent' }],
  nextSeasonEuropeanQualification: { seasonStartYear: 2027, ucl: Array.from({ length: 36 }, (_, i) => `ucl-${i}`), uel: Array.from({ length: 36 }, (_, i) => `uel-${i}`), uecl: Array.from({ length: 36 }, (_, i) => `uecl-${i}`), associationRanking: ['laliga'], associationScores: { laliga: 22.5 } },
  archivedAt: '2027-06-30T00:00:00.000Z',
});
assert.equal(built.myTeamId, 'club-a');
assert.equal(built.myFinalPosition, 2);
assert.equal(built.awardWinners[0].playerId, 'p1');
assert.deepEqual(new Set(built.playerSeasonRecords[0].trophies), new Set(['Copa · laliga', 'Champions League']), 'player archives inherit trophies won by their club');
assert.equal(built.featuredTransfers[0].fee, 42000000, 'featured transfers are compactly archived');
assert.equal(built.nextSeasonEuropeanQualification.ucl.length, 36, 'next season European qualification persists all clubs');
assert.equal(getSeasonArchiveAwards({ ...archive('2024/25'), awardWinners: undefined, awards: { goldenBoy: 'Legacy Star' } })[0].category, 'Golden Boy', 'old award keys normalize to display labels');

const archives = [archive('2026/27'), archive('2027/28', {
  europeanChampions: { ucl: 'club-b', uel: 'club-a', uecl: null },
  awardWinners: [{ category: 'Balón de Oro', playerId: 'p1', playerName: 'Player A' }, { category: 'Golden Boy', playerId: 'p2', playerName: 'Player B' }],
  topScorers: [{ playerId: 'p2', playerName: 'Player B', clubId: 'club-b', goals: 27 }],
  playerSeasonRecords: [
    { playerId: 'p1', playerName: 'Player A', clubId: 'club-a', goals: 15, assists: 5, appearances: 32, trophies: ['Copa · laliga', 'Europa League'] },
    { playerId: 'p2', playerName: 'Player B', clubId: 'club-b', goals: 27, assists: 10, appearances: 34 },
  ],
})];
const clubs = buildClubPalmares(archives);
assert.equal(clubs.find((item) => item.teamId === 'club-a')?.totalTitles, 4, 'club A should aggregate two cups, one UCL and one UEL');
assert.equal(clubs.find((item) => item.teamId === 'club-b')?.leagueTitles, 2, 'league titles aggregate over seasons');
const players = buildPlayerPalmares(archives);
assert.equal(players.find((item) => item.playerId === 'p1')?.awards.length, 2, 'individual awards aggregate by player ID');
assert.equal(players.find((item) => item.playerId === 'p1')?.topScorerSeasons.length, 1, 'top-scoring seasons persist for a player');
assert.equal(players.find((item) => item.playerId === 'p1')?.careerGoals, 45, 'career goals accumulate across archived seasons');
assert.equal(players.find((item) => item.playerId === 'p1')?.careerAssists, 12);
assert.equal(players.find((item) => item.playerId === 'p1')?.seasonsPlayed, 2);
assert.equal(players.find((item) => item.playerId === 'p1')?.titles.length, 4, 'players inherit their club titles while active');
assert.equal(players.find((item) => item.playerId === 'p2')?.topScorerSeasons[0]?.goals, 27);

// A legacy archive lacking player IDs must still contribute to player honours.
const legacyPlayers = buildPlayerPalmares([archive('2025/26', { awardWinners: undefined, awards: { goldenBoy: 'Legacy Star' } })]);
assert.equal(legacyPlayers.find((item) => item.playerName === 'Legacy Star')?.awards.length, 1);
console.log('season-history-test: OK');

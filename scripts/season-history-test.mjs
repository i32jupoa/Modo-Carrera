import assert from 'node:assert/strict';
import { buildSeasonArchive, buildClubPalmares, buildPlayerPalmares, buildSeasonTeamOfSeason, getSeasonArchiveAwards, MAX_ARCHIVED_SEASON_TRANSFERS } from '../src/lib/season/seasonHistory.ts';

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
    fixtures: { laliga: [
      { id: 'm1', competition: 'league', league: 'laliga', matchday: 36, homeId: 'club-b', awayId: 'club-a', result: { homeGoals: 0, awayGoals: 1 } },
      { id: 'm2', competition: 'league', league: 'laliga', matchday: 37, homeId: 'club-a', awayId: 'club-b', result: { homeGoals: 2, awayGoals: 2 } },
      { id: 'm3', competition: 'league', league: 'laliga', matchday: 38, homeId: 'club-b', awayId: 'club-a', result: { homeGoals: 3, awayGoals: 1 } },
    ] }, currentMatchday: {}, lineups: {}, formations: {}, suspensions: {},
    standings: { laliga: [
      { teamId: 'club-b', points: 83, played: 38, won: 25, drawn: 8, lost: 5, gf: 80, ga: 30, gd: 50 },
      { teamId: 'club-a', points: 78, played: 38, won: 23, drawn: 9, lost: 6, gf: 70, ga: 29, gd: 41 },
    ] },
    cupFixtures: { laliga: [{ id: 'cup-final', competition: 'cup', league: 'laliga', matchday: 4, round: 'Final', date: '2027-05-30', homeId: 'club-a', awayId: 'club-b', result: { homeGoals: 2, awayGoals: 1 } }] }, cupChampion: { laliga: 'club-a' }, cupDrawPending: null, pendingBackgroundSims: [],
    uclFixtures: [{ id: 'ucl-final', competition: 'ucl', league: 'laliga', matchday: 12, round: 'Final', date: '2027-05-26', homeId: 'club-a', awayId: 'club-c', result: { homeGoals: 3, awayGoals: 1 } }],
    uelFixtures: [], ueclFixtures: [], uclChampion: 'club-a', uelChampion: null, ueclChampion: 'club-c',
    ucl: { phase: 'done', seasonNumber: 1, participants: ['club-a', 'club-c'], table: [{ teamId: 'club-a', played: 8, won: 6, drawn: 1, lost: 1, gf: 18, ga: 8, gd: 10, points: 19 }], leaguePhaseTable: [{ teamId: 'club-a', played: 8, won: 6, drawn: 1, lost: 1, gf: 18, ga: 8, gd: 10, points: 19 }], drawState: { leagueDone: true, playoffDone: true, knockoutDone: true }, bracket: [] }, uel: null, uecl: null,
  },
  awards: { ballonDor: 'Player A' },
  awardWinners: [{ category: 'Balón de Oro', playerId: 'p1', playerName: 'Player A' }],
  topScorers: [{ playerId: 'p1', playerName: 'Player A', clubId: 'club-a', goals: 30 }],
  playerSeasonRecords: [{ playerId: 'p1', playerName: 'Player A', clubId: 'club-a', goals: 30, assists: 7, appearances: 35 }],
  featuredTransfers: [{ id: 'transfer-1', date: '2027-01-15', playerId: 'p2', playerName: 'Player B', fromClubId: 'club-b', toClubId: 'club-a', fee: 42000000, type: 'permanent' }],
  seasonTransfers: [{ id: 'transfer-1', date: '2027-01-15', playerId: 'p2', playerName: 'Player B', fromClubId: 'club-b', toClubId: 'club-a', fromLeague: 'laliga', toLeague: 'laliga', fee: 42000000, type: 'permanent' }, { id: 'transfer-2', date: '2027-01-16', playerId: 'p3', playerName: 'Player C', fromClubId: null, toClubId: 'club-a', fromLeague: null, toLeague: 'laliga', fee: 0, type: 'free' }],
  nextSeasonEuropeanQualification: { seasonStartYear: 2027, ucl: Array.from({ length: 36 }, (_, i) => `ucl-${i}`), uel: Array.from({ length: 36 }, (_, i) => `uel-${i}`), uecl: Array.from({ length: 36 }, (_, i) => `uecl-${i}`), associationRanking: ['laliga'], associationScores: { laliga: 22.5 } },
  archivedAt: '2027-06-30T00:00:00.000Z',
});
assert.equal(built.myTeamId, 'club-a');
assert.equal(built.myFinalPosition, 2);
assert.equal(built.awardWinners[0].playerId, 'p1');
assert.deepEqual(built.leagues[0].table.find((row) => row.teamId === 'club-a')?.form, ['W', 'D', 'L'], 'league form archives the last five results available at rollover');
const elevenInputs = [
  { playerId: 'gk', playerName: 'Keeper', clubId: 'club-a', goals: 0, assists: 0, appearances: 30, positions: ['GK'], ovr: 85 },
  ...Array.from({ length: 4 }, (_, i) => ({ playerId: `def-${i}`, playerName: `Defender ${i}`, clubId: 'club-a', goals: i, assists: 1, appearances: 30, positions: ['DFC'], ovr: 80 + i })),
  ...Array.from({ length: 3 }, (_, i) => ({ playerId: `mid-${i}`, playerName: `Midfielder ${i}`, clubId: 'club-a', goals: 5 + i, assists: 8, appearances: 32, positions: ['MC'], ovr: 82 + i })),
  ...Array.from({ length: 3 }, (_, i) => ({ playerId: `fwd-${i}`, playerName: `Forward ${i}`, clubId: 'club-a', goals: 18 + i, assists: 7, appearances: 34, positions: ['DC'], ovr: 86 + i })),
];
const teamOfSeason = buildSeasonTeamOfSeason(elevenInputs);
assert.equal(teamOfSeason.length, 11, 'season best XI contains eleven unique players when position coverage is sufficient');
assert.equal(new Set(teamOfSeason.map((player) => player.playerId)).size, 11, 'season best XI cannot duplicate players');
assert.equal(teamOfSeason.filter((player) => player.slot === 'GK').length, 1, 'season best XI contains one goalkeeper');
assert.equal(teamOfSeason.filter((player) => player.slot === 'DEF').length, 4, 'season best XI contains four defenders');
assert.equal(teamOfSeason.filter((player) => player.slot === 'MID').length, 3, 'season best XI contains three midfielders');
assert.equal(teamOfSeason.filter((player) => player.slot === 'FWD').length, 3, 'season best XI contains three forwards');
const positionRegression = buildSeasonTeamOfSeason([
  { playerId: 'dembele', playerName: 'Ousmane Dembélé', clubId: 'club-a', goals: 22, assists: 12, appearances: 40, positions: ['ST', 'MCO', 'ED'], ovr: 90 },
  { playerId: 'tchouameni', playerName: 'Aurélien Tchouaméni', clubId: 'club-a', goals: 2, assists: 3, appearances: 30, positions: ['MCD', 'MC', 'DFC'], ovr: 86 },
]);
assert.equal(positionRegression.find((player) => player.playerId === 'dembele')?.slot, 'FWD', 'Dembélé must use his main forward position, not an alternative defensive role');
assert.equal(positionRegression.find((player) => player.playerId === 'tchouameni')?.slot, 'MID', 'a defensive alternative cannot turn a primary midfielder into a defender');
assert.deepEqual(new Set(built.playerSeasonRecords[0].trophies), new Set(['Copa · laliga', 'Champions League']), 'player archives inherit trophies won by their club');
assert.equal(built.featuredTransfers[0].fee, 42000000, 'featured transfers are compactly archived');
assert.equal(built.seasonTransfers.length, 2, 'the archive stores more than the featured transfer shortlist');
assert.equal(built.seasonTransfers.find((item) => item.id === 'transfer-2')?.type, 'free', 'free signings remain filterable in the archive');
assert.equal(built.domesticCupDetails.find((cup) => cup.leagueId === 'laliga')?.fixtures[0]?.homeGoals, 2, 'completed domestic cup scores are archived');
assert.equal(built.europeanCompetitionDetails.find((competition) => competition.competition === 'ucl')?.fixtures[0]?.awayGoals, 1, 'completed European knockout scores are archived');
assert.equal(built.europeanCompetitionDetails.find((competition) => competition.competition === 'ucl')?.leaguePhaseTable?.[0]?.points, 19, 'European league phase standings are archived');
assert.equal(built.nextSeasonEuropeanQualification.ucl.length, 36, 'next season European qualification persists all clubs');
const tooManyTransfers = Array.from({ length: MAX_ARCHIVED_SEASON_TRANSFERS + 25 }, (_, index) => ({
  id: `transfer-cap-${index}`, date: `2027-01-${String((index % 28) + 1).padStart(2, '0')}`,
  playerId: `p-${index}`, playerName: `Player ${index}`, fromClubId: null, toClubId: 'club-a',
  fee: index * 1000, type: index % 4 === 0 ? 'free' : 'permanent',
}));
const bounded = buildSeasonArchive({
  saveId: 'bounded-test',
  save: { version: 2, myTeamId: 'club-a', myLeague: 'laliga', season: '2026/27', standings: {}, cupFixtures: {}, cupChampion: {}, uclFixtures: [], uelFixtures: [], ueclFixtures: [], uclChampion: null, uelChampion: null, ueclChampion: null },
  seasonTransfers: tooManyTransfers,
});
assert.equal(bounded.seasonTransfers.length, MAX_ARCHIVED_SEASON_TRANSFERS, 'full transfer archive is capped to protect save size');
assert.equal(bounded.seasonTransfers.some((transfer) => transfer.fee === (MAX_ARCHIVED_SEASON_TRANSFERS + 24) * 1000), true, 'the cap preserves high-value deals');
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

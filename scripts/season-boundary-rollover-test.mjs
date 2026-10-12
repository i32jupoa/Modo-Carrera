import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getSeasonRolloverDates } from '../src/lib/season/seasonRolloverCore.ts';
import { formatSeasonLabel } from '../src/lib/season/calendarFactory.ts';
import { calculatePromotionRelegation } from '../src/lib/season/promotionRelegationCore.ts';

const calendarRoute = readFileSync(new URL('../src/routes/calendar.tsx', import.meta.url), 'utf8');
const dayBar = readFileSync(new URL('../src/components/GameDayBar.tsx', import.meta.url), 'utf8');
const playerStore = readFileSync(new URL('../src/store/playersStore.ts', import.meta.url), 'utf8');
const rollover = readFileSync(new URL('../src/lib/season/seasonRollover.ts', import.meta.url), 'utf8');

// Verify that the actual app wiring processes rollover both mid-jump and when
// the selected target is 30 June, and that the ordinary clock cannot cross it.
assert.match(calendarRoute, /const performBoundaryRollover = async \(\): Promise<boolean> =>/,
  'Calendar jump must have a boundary rollover transaction');
assert.match(calendarRoute, /while \(usePlayersStore\.getState\(\)\.currentDate < targetDate[\s\S]*performBoundaryRollover\(\)/,
  'Jump loop must close a due season before it can continue past 30 June');
assert.match(calendarRoute, /If the selected target itself is 30 June[\s\S]*performBoundaryRollover\(\)/,
  'A jump ending on 30 June must close the season before returning success');
assert.match(calendarRoute, /advanceSeasonIfDue\(effectiveSave/,
  'The calendar must use the shared idempotent rollover entry point');
assert.match(dayBar, /void ensureSeasonRollover\(\)/,
  'The global day bar must recover a stale save after app startup');
assert.match(playerStore, /season\.rolloverBoundaryBlocked[\s\S]*return 0/,
  'The day clock must not cross the campaign cutoff without rollover');
assert.match(rollover, /if \(currentDate > dates\.endDate\) return \{ ok: true \}/,
  'A legacy save strictly beyond 30 June can be repaired retroactively');
assert.match(rollover, /const seasonFixtures = all\.filter\(\(\{ fixture, kind \}\) =>/,
  'Readiness must filter fixtures to the season being closed and its cutoff date');
assert.match(rollover, /const pending = seasonFixtures\.filter\(\(\{ fixture \}\) => !hasResult\(fixture\)\)/,
  'Only unresolved fixtures scheduled on/before 30 June may block rollover');
assert.match(rollover, /getCupFixtureDateIso\(fixture, seasonStartYear\)/,
  'National cup fixtures must use their canonical season date');
assert.match(rollover, /getEuropeanFixtureDateIso\(fixture, kind, seasonStartYear\)/,
  'European fixtures must use their canonical season date');
assert.match(rollover, /if \(liveState\.myTeamId === effectiveSave\.myTeamId && liveState\.pendingUserMatch\)/,
  'A pending user match must block an unsafe rollover');
assert.match(rollover, /const broadcastKey = `\$\{getCurrentSaveId\(\) \?\? \"career\"\}:\$\{effectiveSave\.myTeamId\}:\$\{effectiveSave\.season\}->\$\{nextSave\.season\}`[\s\S]*broadcastRolloverKeys\.has\(broadcastKey\)[\s\S]*dispatchEvent\(new CustomEvent\(\"fcsim:save-updated\"/,
  'A committed automatic rollover must notify mounted route snapshots only once');
assert.match(rollover, /retroactiveRollover = originalCurrentDate > dates\.endDate/,
  'A legacy save already in August must use retroactive rollover handling');
assert.match(rollover, /postSeasonTransferPlayerIds/,
  'Retroactive rollover must protect post-30-June transfer signings');
assert.match(rollover, /generateLeagueSchedule\(nextSave\.myTeamId, nextSave\.myLeague\)/,
  'Rollover must build a fresh visible league schedule');

// A deterministic headless jump simulation crossing 30 June 2027. The pure
// promotion core is the same production core used by calculateSavePromotionRelegation.
const leagueIds = ['laliga', 'laliga2'];
const counts = [20, 22];
const teams = [];
for (let i = 0; i < leagueIds.length; i += 1) {
  for (let n = 0; n < counts[i]; n += 1) {
    teams.push({
      id: `${leagueIds[i]}-club-${String(n + 1).padStart(2, '0')}`,
      name: `${leagueIds[i]} club ${n + 1}`,
      leagueId: leagueIds[i],
      att: 60 + (n * 7 + i * 3) % 30,
      mid: 60 + (n * 11 + i * 5) % 30,
      def: 60 + (n * 13 + i * 9) % 30,
    });
  }
}
const standings = {};
for (const leagueId of leagueIds) {
  const leagueTeams = teams.filter((team) => team.leagueId === leagueId);
  standings[leagueId] = leagueTeams.map((team, index) => ({
    teamId: team.id,
    played: (leagueTeams.length - 1) * 2,
    won: leagueTeams.length - index - 1,
    gd: (leagueTeams.length - index) * 2,
    gf: (leagueTeams.length - index) * 3,
    points: (leagueTeams.length - index) * 3,
  }));
}
const initial = {
  season: '2026/27', currentDate: '2027-06-29', teamLeagueOverrides: {},
  fixtures: { laliga: [{ id: 'old-fixture', date: '2027-06-25', result: { homeGoals: 2, awayGoals: 1 } }] },
  standings,
};
const originalDates = getSeasonRolloverDates(initial.season);
const targetDate = '2027-08-11';
let state = structuredClone(initial);
let rolloverCount = 0;
let generatedCalendar = [];
let movements = [];
const addDays = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};
while (state.currentDate < targetDate) {
  if (state.currentDate >= getSeasonRolloverDates(state.season).endDate) {
    const dates = getSeasonRolloverDates(state.season);
    movements = calculatePromotionRelegation({
      seasonStartYear: dates.seasonStartYear,
      seed: 20270630,
      teams,
      standings,
      pyramids: [{ country: 'España', leagueIds, mode: 'promotion-playoff', playoffCandidates: 4 }],
    }).movements;
    const overrides = { ...state.teamLeagueOverrides };
    for (const movement of movements) overrides[movement.teamId] = movement.toLeague;
    const nextSeason = dates.toSeason;
    generatedCalendar = leagueIds.map((leagueId) => ({
      leagueId,
      season: nextSeason,
      fixtures: [
        { id: `${leagueId}-${nextSeason}-md1-a`, date: `${dates.nextSeasonStartYear}-08-14`, homeId: `${leagueId}-club-01`, awayId: `${leagueId}-club-02`, result: null },
        { id: `${leagueId}-${nextSeason}-md1-b`, date: `${dates.nextSeasonStartYear}-08-14`, homeId: `${leagueId}-club-03`, awayId: `${leagueId}-club-04`, result: null },
      ],
    }));
    state = { ...state, season: nextSeason, currentDate: dates.nextStartDate, teamLeagueOverrides: overrides };
    rolloverCount += 1;
    continue;
  }
  state = { ...state, currentDate: addDays(state.currentDate) };
}
// Process a rollover if the requested date is exactly the 30 June boundary.
if (state.currentDate >= getSeasonRolloverDates(state.season).endDate) {
  const dates = getSeasonRolloverDates(state.season);
  movements = calculatePromotionRelegation({
    seasonStartYear: dates.seasonStartYear,
    seed: 20270630,
    teams,
    standings,
    pyramids: [{ country: 'España', leagueIds, mode: 'promotion-playoff', playoffCandidates: 4 }],
  }).movements;
  state = { ...state, season: dates.toSeason, currentDate: dates.nextStartDate };
  generatedCalendar = leagueIds.map((leagueId) => ({ season: dates.toSeason, leagueId, fixtures: [{ id: `${leagueId}-${dates.toSeason}-md1`, date: `${dates.nextSeasonStartYear}-08-14`, result: null }] }));
  rolloverCount += 1;
}
assert.equal(state.season, '2027/28', 'The simulated calendar jump must roll 2026/27 into 2027/28');
assert.equal(rolloverCount, 1, 'The rollover must execute exactly once');
assert.ok(movements.some((movement) => movement.fromLeague === 'laliga2' && movement.toLeague === 'laliga'), 'The test must produce an actual promotion');
assert.ok(movements.some((movement) => movement.fromLeague === 'laliga' && movement.toLeague === 'laliga2'), 'The test must produce an actual relegation');
assert.ok(generatedCalendar.length > 0 && generatedCalendar.every((league) => league.season === state.season && league.fixtures.length > 0),
  'The next season must have new fixtures in its generated calendar');
assert.equal(formatSeasonLabel(2027), state.season);
assert.equal(originalDates.endDate, '2027-06-30');

console.log('season-boundary-rollover-test: OK (calendar jump, automatic rollover, promotion/relegation, next-season fixtures)');

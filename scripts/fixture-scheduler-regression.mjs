import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assignFixtureDates,
  rescheduleLeagueAroundSpecialFixtures,
  MIN_REST_DAYS,
} from "../src/lib/fixtureScheduler.ts";
import { getSeasonCalendarAnchors } from "../src/lib/season/calendarFactory.ts";

const SEASON = 2026;
const SEED = 827364;
const firstFriday = getSeasonCalendarAnchors(SEASON).leagueMatchday1Friday;

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86_400_000);
}

function buildRoundRobin(teamIds, roundCount = teamIds.length - 1) {
  const ids = teamIds.slice();
  const fixtures = [];
  const n = ids.length;
  const rounds = Math.min(roundCount, n - 1);
  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < n / 2; index += 1) {
      const homeId = ids[index];
      const awayId = ids[n - 1 - index];
      fixtures.push({
        id: `laliga-r${round + 1}-${homeId}-${awayId}`,
        matchday: round + 1,
        homeId,
        awayId,
      });
    }
    ids.splice(1, 0, ids.pop());
  }
  return fixtures;
}

function weekday(iso) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

const teams = ["REAL", ...Array.from({ length: 19 }, (_, index) => `CLUB${index + 1}`)];
const raw = buildRoundRobin(teams, 18);
const cupDate = addDays(firstFriday, -1); // Thursday: a Friday league fixture would be too soon.
const protectedDates = new Map([["REAL", new Set([cupDate])]]);
const dates = assignFixtureDates(raw, protectedDates, { seasonStartYear: SEASON, seed: SEED });

const realFixtures = raw.filter((fixture) => fixture.homeId === "REAL" || fixture.awayId === "REAL");
assert.equal(realFixtures.length, 18, "The controlled team must have one fixture per matchday");
const realWeekdays = new Set(realFixtures.map((fixture) => weekday(dates.get(fixture.id))));
assert.ok(realWeekdays.size >= 2, "First-season fixtures must no longer pin the first-listed club to Friday");
for (const fixture of realFixtures) {
  const date = dates.get(fixture.id);
  assert.ok(Math.abs(daysBetween(cupDate, date)) >= MIN_REST_DAYS,
    `League fixture ${fixture.id} on ${date} must leave 72h from cup match ${cupDate}`);
}

// Every club must retain at least 72h between its scheduled league fixtures.
for (const teamId of teams) {
  const teamDates = raw
    .filter((fixture) => fixture.homeId === teamId || fixture.awayId === teamId)
    .map((fixture) => dates.get(fixture.id))
    .sort();
  for (let index = 1; index < teamDates.length; index += 1) {
    assert.ok(daysBetween(teamDates[index - 1], teamDates[index]) >= MIN_REST_DAYS,
      `${teamId} has less than ${MIN_REST_DAYS} days between league fixtures`);
  }
}

// If every ordinary slot is reserved, the scheduler must spill to a safe day,
// never silently fall back to the forbidden Friday.
const congestedProtection = new Map([[
  "REAL",
  new Set([firstFriday, addDays(firstFriday, 1), addDays(firstFriday, 2)]),
]]);
const congestedFixture = [{ id: "laliga-r1-REAL-CLUB1", matchday: 1, homeId: "REAL", awayId: "CLUB1" }];
const congestedDate = assignFixtureDates(congestedFixture, congestedProtection, { seasonStartYear: SEASON, seed: SEED })
  .get(congestedFixture[0].id);
assert.ok(congestedDate > addDays(firstFriday, 2), "A blocked weekend must move to a later safe date");
for (const reserved of congestedProtection.get("REAL")) {
  assert.ok(Math.abs(daysBetween(reserved, congestedDate)) >= MIN_REST_DAYS,
    "A fallback date must also respect the rest interval");
}

// Full 38-round first-division schedules must not cascade postponed fixtures
// beyond the end-of-season deadline. This reproduces the Rayo-Real Sociedad
// creation failure reported for the 2026/27 calendar.
function buildDoubleRoundRobin(teamIds, leagueId) {
  const rotation = teamIds.slice();
  const firstLeg = [];
  const oneLegRounds = teamIds.length - 1;
  for (let round = 1; round <= oneLegRounds; round += 1) {
    for (let index = 0; index < teamIds.length / 2; index += 1) {
      firstLeg.push({
        id: `${leagueId}-r${round}-${rotation[index]}-${rotation[teamIds.length - 1 - index]}`,
        league: leagueId,
        matchday: round,
        homeId: rotation[index],
        awayId: rotation[teamIds.length - 1 - index],
      });
    }
    rotation.splice(1, 0, rotation.pop());
  }
  return [
    ...firstLeg,
    ...firstLeg.map((fixture) => ({
      ...fixture,
      id: fixture.id.replace(`${leagueId}-r`, `${leagueId}-r${oneLegRounds + 1}-`),
      matchday: fixture.matchday + oneLegRounds,
      homeId: fixture.awayId,
      awayId: fixture.homeId,
    })),
  ];
}

const fullLeagueTeams = ["rayo", "rso", ...Array.from({ length: 18 }, (_, index) => `laliga-club-${index + 1}`)];
const fullLeagueFixtures = buildDoubleRoundRobin(fullLeagueTeams, "laliga");
const fullLeagueProtection = new Map();
for (const protectedDate of [
  "2026-09-22", "2026-10-20", "2026-11-24", "2027-02-16", "2027-03-16", "2027-04-13", "2027-05-04",
]) {
  for (const teamId of fullLeagueTeams) {
    const reservations = fullLeagueProtection.get(teamId) ?? new Set();
    reservations.add(protectedDate);
    fullLeagueProtection.set(teamId, reservations);
  }
}
for (const protectedDate of [
  "2026-09-24", "2026-10-22", "2026-11-26", "2027-02-18", "2027-03-18", "2027-04-15", "2027-05-06",
]) {
  const reservations = fullLeagueProtection.get("rso") ?? new Set();
  reservations.add(protectedDate);
  fullLeagueProtection.set("rso", reservations);
}
const fullLeagueDates = assignFixtureDates(fullLeagueFixtures, fullLeagueProtection, {
  seasonStartYear: SEASON,
  seed: SEED,
  europeanTeamIds: ["rso"],
});
assert.equal(fullLeagueDates.size, fullLeagueFixtures.length, "All 38-round league fixtures must receive dates");
const fullLeagueDatesByTeam = new Map(fullLeagueTeams.map((teamId) => [teamId, []]));
for (const fixture of fullLeagueFixtures) {
  const date = fullLeagueDates.get(fixture.id);
  assert.ok(date && date <= "2027-05-29", `${fixture.id} must fit before the domestic deadline`);
  fullLeagueDatesByTeam.get(fixture.homeId).push(date);
  fullLeagueDatesByTeam.get(fixture.awayId).push(date);
}
for (const [teamId, teamDates] of fullLeagueDatesByTeam) {
  const ordered = teamDates.sort();
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(daysBetween(ordered[index - 1], ordered[index]) >= MIN_REST_DAYS,
      `${teamId} must retain 72h between all 38 league fixtures`);
  }
  // First-division clubs may play a domestic match in the same calendar week
  // as a UEFA match, but never within the protected 72h rest interval.
  for (const protectedDate of fullLeagueProtection.get(teamId) ?? []) {
    for (const leagueDate of ordered) {
      assert.ok(Math.abs(daysBetween(protectedDate, leagueDate)) >= MIN_REST_DAYS,
        `${teamId} must retain 72h from UEFA/cup match ${protectedDate}`);
    }
  }
}

// Version-6 save migration must keep completed matches/results and only re-date
// outstanding fixtures, removing the legacy all-Friday schedule.
const legacySchedule = raw.map((fixture) => ({
  id: fixture.id,
  date: addDays(firstFriday, (fixture.matchday - 1) * 7),
  homeTeam: fixture.homeId,
  awayTeam: fixture.awayId,
  isPlayed: false,
  homeScore: null,
  awayScore: null,
  competition: "Liga",
  matchday: fixture.matchday,
}));
legacySchedule[0] = {
  ...legacySchedule[0],
  isPlayed: true,
  homeScore: 2,
  awayScore: 1,
};
const migrated = rescheduleLeagueAroundSpecialFixtures(legacySchedule, protectedDates, {
  seasonStartYear: SEASON,
  seed: SEED,
});
assert.equal(migrated[0].date, legacySchedule[0].date, "Played match date must not change");
assert.equal(migrated[0].homeScore, 2, "Played match score must not change");
assert.equal(migrated[0].awayScore, 1, "Played match score must not change");
assert.ok(migrated.filter((fixture) => !fixture.isPlayed).every((fixture) => weekday(fixture.date) !== 5),
  "The migration must not preserve the legacy all-Friday schedule");

const playersStore = fs.readFileSync(new URL("../src/store/playersStore.ts", import.meta.url), "utf8");
const saveStore = fs.readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
assert.match(playersStore, /leagueScheduleVersion: 7/);
assert.match(playersStore, /rescheduleLeagueAroundSpecialFixtures\(migrated, protectedDates, calendarOptions\)/);
assert.match(saveStore, /generateLeagueSchedule\(myTeamId, team\.league, calendarSeed\)/);
assert.match(saveStore, /generateLeagueFixtures\(lg, \{ seasonStartYear: 2026, seed: calendarSeed \}\)/);

console.log("OK: seeded fixture slots, exact UEFA/cup rest protection, reverse matchday scheduling and v7 schedule migration");

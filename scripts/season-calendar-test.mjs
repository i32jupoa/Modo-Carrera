import assert from "node:assert/strict";
import {
  INITIAL_SEASON_START_YEAR,
  addIsoDays,
  createSeasonTeamOrder,
  deriveCareerCalendarSeed,
  formatSeasonLabel,
  getDateOffset,
  getLeagueKickoffSaturday,
  getSeasonCalendarAnchors,
  getSeasonStartYear,
  inferSeasonStartYearFromDate,
  scopedCalendarSeed,
  seededShuffle,
  shiftReferenceDateToSeason,
} from "../src/lib/season/calendarFactory.ts";

assert.equal(INITIAL_SEASON_START_YEAR, 2026);
assert.equal(getSeasonStartYear("2026/27"), 2026);
assert.equal(getSeasonStartYear("2099/00"), 2099);
assert.equal(formatSeasonLabel(2099), "2099/00");
assert.equal(inferSeasonStartYearFromDate("2028-01-05"), 2027);
assert.equal(inferSeasonStartYearFromDate("2028-07-01"), 2028);
assert.equal(addIsoDays("2028-02-28", 1), "2028-02-29");
assert.equal(addIsoDays("2028-02-29", 1), "2028-03-01");
assert.equal(shiftReferenceDateToSeason("2028-02-29", 2028, false), "2029-03-01");
assert.equal(getDateOffset("2028-02-28", "2028-03-01"), 2);

const firstSeason = getSeasonCalendarAnchors(2026);
assert.equal(firstSeason.gameStartDate, "2026-07-01");
assert.equal(firstSeason.nationalCupStart, "2026-07-07");
assert.equal(firstSeason.leagueKickoffSaturday, "2026-08-15");
assert.equal(firstSeason.leagueMatchday1Friday, "2026-08-14");
assert.equal(getLeagueKickoffSaturday(2027), "2027-08-14");

for (const year of [2026, 2027, 2028, 2030, 2099, 2100]) {
  const anchors = getSeasonCalendarAnchors(year);
  assert.match(anchors.gameStartDate, /^\d{4}-07-01$/);
  assert.equal(new Date(`${anchors.leagueKickoffSaturday}T12:00:00Z`).getUTCDay(), 6,
    `Kickoff must be Saturday for season ${year}`);
  assert.equal(addIsoDays(anchors.leagueMatchday1Friday, 1), anchors.leagueKickoffSaturday,
    `Matchday 1 Friday must directly precede kickoff for season ${year}`);
  assert.ok(anchors.winterWindowStart.startsWith(`${year + 1}-01-`));
}

const teams = Array.from({ length: 36 }, (_, index) => `club-${index + 1}`);
const seed2027 = scopedCalendarSeed(deriveCareerCalendarSeed("career-a", 2026), 2027, "laliga");
const shuffledOnce = seededShuffle(teams, seed2027);
const shuffledAgain = seededShuffle(teams, seed2027);
assert.deepEqual(shuffledOnce, shuffledAgain, "Same seed must always reproduce the same order");
assert.notDeepEqual(
  shuffledOnce,
  seededShuffle(teams, scopedCalendarSeed(deriveCareerCalendarSeed("career-a", 2026), 2028, "laliga")),
  "Different season years should produce different team orders",
);
assert.notDeepEqual(
  seededShuffle(teams, scopedCalendarSeed(111, 2027, "laliga")),
  seededShuffle(teams, scopedCalendarSeed(222, 2027, "laliga")),
  "Different career seeds should produce different orders",
);

const order2026 = createSeasonTeamOrder(teams, 2026, 1234, "laliga");
const order2027 = createSeasonTeamOrder(teams, 2027, 1234, "laliga");
const order2028 = createSeasonTeamOrder(teams, 2028, 1234, "laliga");
assert.deepEqual(order2026, teams, "The initial season keeps the existing canonical team order");
assert.deepEqual(order2027, createSeasonTeamOrder(teams, 2027, 1234, "laliga"), "Season order is reproducible");
assert.notDeepEqual(order2027, order2028, "Consecutive seasons are guaranteed not to reuse the exact order");

const reference = "2027-02-16"; // Tuesday
const shifted = shiftReferenceDateToSeason(reference, 2027, true);
assert.equal(new Date(`${shifted}T12:00:00Z`).getUTCDay(), new Date(`${reference}T12:00:00Z`).getUTCDay(),
  "Seasonal reference shifts must preserve weekdays for UEFA anchors");

console.log("OK: season calendar anchors, century rollover, leap years, stable seeds and deterministic shuffling");

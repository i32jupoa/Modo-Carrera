import assert from "node:assert/strict";
import { LEAGUES, teamsByLeague } from "../src/data/teams.ts";
import { uclCalendarForSeason, uclStartForSeason } from "../src/data/ucl.ts";
import { europeanCalendar } from "../src/data/europeanCompetitions.ts";
import { getInitialEuropeanQualification } from "../src/lib/season/europeanQualification.ts";
import { generateLeagueFixtures } from "../src/lib/season.ts";
import { getLeagueCupProtectedDates } from "../src/lib/leagueSchedule.ts";
import { assignFixtureDates, getLeagueSchedulingDeadline, MIN_REST_DAYS } from "../src/lib/fixtureScheduler.ts";
import { addDaysToIso, parseDateOnly } from "../src/lib/transferWindows.ts";
import { deriveCareerCalendarSeed } from "../src/lib/season/calendarFactory.ts";

const seasonStartYear = 2026;
const qualification = getInitialEuropeanQualification(seasonStartYear, {});
const participants = [...new Set([...qualification.ucl, ...qualification.uel, ...qualification.uecl])];
const exactEuropeanDates = new Map();
const addProtectedDate = (teamId, date) => {
  const dates = exactEuropeanDates.get(teamId) ?? new Set();
  dates.add(date);
  exactEuropeanDates.set(teamId, dates);
};
const ucl = uclCalendarForSeason(seasonStartYear);
const uclStart = uclStartForSeason(seasonStartYear);
const european = europeanCalendar(seasonStartYear);
const uclOffsets = [
  ...ucl.leagueDay, ucl.playoffLeg1, ucl.playoffLeg2, ucl.r16Leg1,
  ucl.r16Leg2, ucl.qfLeg1, ucl.qfLeg2, ucl.sfLeg1, ucl.sfLeg2, ucl.final,
];
const europeanOffsets = [
  ...european.leagueDay, european.playoffLeg1, european.playoffLeg2,
  european.r16Leg1, european.r16Leg2, european.qfLeg1, european.qfLeg2,
  european.sfLeg1, european.sfLeg2, european.final,
];
for (const teamId of qualification.ucl) {
  for (const offset of uclOffsets) addProtectedDate(teamId, addDaysToIso(uclStart, offset));
}
for (const competition of ["uel", "uecl"]) {
  for (const teamId of qualification[competition]) {
    for (const offset of europeanOffsets) addProtectedDate(teamId, addDaysToIso(uclStart, offset));
  }
}

function daysBetween(a, b) {
  return Math.round((parseDateOnly(b).getTime() - parseDateOnly(a).getTime()) / 86_400_000);
}

let checkedSchedules = 0;
for (const leagueId of Object.keys(LEAGUES)) {
  const teams = teamsByLeague(leagueId);
  if (teams.length < 2) continue;

  // Career creation derives its deterministic seed from the club selected by
  // the user. Test every club seed against the complete real league schedule.
  for (const userTeam of teams) {
    const seed = deriveCareerCalendarSeed(userTeam.id, seasonStartYear);
    const fixtures = generateLeagueFixtures(leagueId, { seasonStartYear, seed });
    const protectedDates = new Map(
      [...getLeagueCupProtectedDates(leagueId, seasonStartYear)].map(([id, dates]) => [id, new Set(dates)]),
    );
    for (const [teamId, dates] of exactEuropeanDates) {
      if (!teams.some((team) => team.id === teamId)) continue;
      const merged = protectedDates.get(teamId) ?? new Set();
      for (const date of dates) merged.add(date);
      protectedDates.set(teamId, merged);
    }

    const dates = assignFixtureDates(fixtures, protectedDates, {
      seasonStartYear,
      seed,
      europeanTeamIds: participants,
    });
    assert.equal(dates.size, fixtures.length, `${leagueId}/${userTeam.id}: no debe faltar ningún partido`);

    const datesByTeam = new Map(teams.map((team) => [team.id, []]));
    for (const fixture of fixtures) {
      const date = dates.get(fixture.id);
      assert.ok(date, `${fixture.id}: fecha asignada`);
      assert.ok(date <= getLeagueSchedulingDeadline(leagueId, Math.max(...fixtures.map((f) => f.matchday)), seasonStartYear),
        `${leagueId}/${userTeam.id}: ${fixture.id} debe quedar antes del cierre liguero`);
      datesByTeam.get(fixture.homeId).push(date);
      datesByTeam.get(fixture.awayId).push(date);
    }

    for (const [teamId, teamDates] of datesByTeam) {
      const ordered = teamDates.sort();
      for (let index = 1; index < ordered.length; index += 1) {
        assert.ok(daysBetween(ordered[index - 1], ordered[index]) >= MIN_REST_DAYS,
          `${leagueId}/${userTeam.id}/${teamId}: descanso insuficiente entre jornadas`);
      }
      for (const protectedDate of protectedDates.get(teamId) ?? []) {
        for (const leagueDate of ordered) {
          assert.ok(Math.abs(daysBetween(protectedDate, leagueDate)) >= MIN_REST_DAYS,
            `${leagueId}/${userTeam.id}/${teamId}: descanso insuficiente respecto a ${protectedDate}`);
        }
      }
    }
    checkedSchedules += 1;
  }
}

console.log(`OK: ${checkedSchedules} calendarios reales generados (uno por cada equipo seleccionable), con cierre de liga y descansos protegidos`);

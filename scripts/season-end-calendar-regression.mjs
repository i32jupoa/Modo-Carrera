import assert from "node:assert/strict";
import {
  getChampionsLeagueFinalDate,
  getDomesticSeasonEndDate,
  getDomesticPlayoffCalendar,
  addIsoDays,
} from "../src/lib/season/calendarFactory.ts";
import { assignFixtureDates, getLeagueRoundTargetDates, getLeagueSchedulingDeadline } from "../src/lib/fixtureScheduler.ts";
import { europeanCalendar, europeanCalendarDate } from "../src/data/europeanCompetitions.ts";
import { isEuropeanMatchWeek } from "../src/lib/calendarRules.ts";
import { LEAGUES, teamsByLeague } from "../src/data/teams.ts";

const season = 2026;

function buildDoubleRoundRobin(league, teamCount, rounds) {
  const ids = Array.from({ length: teamCount }, (_, index) => `${league}-club-${index + 1}`);
  const rotation = ids.slice();
  const firstLeg = [];
  const oneLegRounds = teamCount - 1;
  for (let round = 0; round < oneLegRounds; round += 1) {
    for (let index = 0; index < teamCount / 2; index += 1) {
      firstLeg.push({
        id: `${league}-r${round + 1}-${rotation[index]}-${rotation[teamCount - 1 - index]}`,
        league,
        matchday: round + 1,
        homeId: rotation[index],
        awayId: rotation[teamCount - 1 - index],
      });
    }
    rotation.splice(1, 0, rotation.pop());
  }
  const secondLeg = firstLeg.map((fixture) => ({
    ...fixture,
    id: fixture.id.replace(`${league}-r`, `${league}-r${oneLegRounds + 1}-`),
    matchday: fixture.matchday + oneLegRounds,
    homeId: fixture.awayId,
    awayId: fixture.homeId,
  }));
  return [...firstLeg, ...secondLeg].filter((fixture) => fixture.matchday <= rounds);
}

function assertAssignedFixtureDates(league, rounds, hasEuropeanClub, deadline) {
  const raw = buildDoubleRoundRobin(league, 24, rounds);
  const europeanTeamIds = hasEuropeanClub ? [`${league}-club-1`] : [];
  const dates = assignFixtureDates(raw, new Map(), { seasonStartYear: season, seed: 9182, europeanTeamIds });
  assert.equal(dates.size, raw.length, `${league}: cada partido debe recibir una fecha`);
  const datesByTeam = new Map();
  for (const fixture of raw) {
    const date = dates.get(fixture.id);
    assert.ok(date && date <= deadline, `${league}: partido fuera de la fecha límite ${deadline}`);
    for (const teamId of [fixture.homeId, fixture.awayId]) {
      const list = datesByTeam.get(teamId) ?? [];
      list.push(date);
      datesByTeam.set(teamId, list);
    }
    if (hasEuropeanClub && europeanTeamIds.includes(fixture.homeId) || hasEuropeanClub && europeanTeamIds.includes(fixture.awayId)) {
      assert.equal(isEuropeanMatchWeek(date, season), false, `${league}: el club europeo no puede jugar liga en semana UEFA`);
    }
  }
  for (const [teamId, teamDates] of datesByTeam) {
    const sorted = teamDates.sort();
    for (let index = 1; index < sorted.length; index += 1) {
      assert.ok(daysBetween(sorted[index - 1], sorted[index]) >= 3,
        `${teamId}: la asignación real debe respetar tres días entre partidos`);
    }
  }
  return raw;
}
const championsFinal = getChampionsLeagueFinalDate(season);
const domesticEnd = getDomesticSeasonEndDate(season);
assert.equal(championsFinal, "2027-06-05", "La final de Champions 2026/27 debe ser el primer sábado de junio");
assert.equal(new Date(`${championsFinal}T12:00:00Z`).getUTCDay(), 6);
assert.equal(domesticEnd, "2027-05-29", "El cierre de liga debe quedar exactamente una semana antes");
const playoffCalendar = getDomesticPlayoffCalendar(season);
assert.deepEqual(playoffCalendar, {
  semifinalLeg1: "2027-06-01",
  semifinalLeg2: "2027-06-04",
  finalLeg1: "2027-06-08",
  finalLeg2: "2027-06-12",
  singleLegFinal: "2027-06-12",
  survivalLeg1: "2027-05-24",
  survivalLeg2: "2027-05-27",
  latestLeagueFixture: domesticEnd,
  latestEarlyPlayoffFixture: domesticEnd,
  latestDomesticFixture: "2027-06-12",
}, "España/Inglaterra pueden cerrar playoffs una semana después de Champions y Francia/Alemania antes");
assert.ok(playoffCalendar.semifinalLeg1 > domesticEnd && playoffCalendar.semifinalLeg2 < championsFinal,
  "las semifinales españolas/inglesas deben disputarse después del cierre liguero y antes de Champions");
assert.equal(playoffCalendar.finalLeg1, addIsoDays(championsFinal, 3));
assert.equal(playoffCalendar.finalLeg2, addIsoDays(championsFinal, 7));
assert.equal(playoffCalendar.singleLegFinal, addIsoDays(championsFinal, 7));
assert.ok(playoffCalendar.survivalLeg2 <= domesticEnd,
  "los playoffs de permanencia pueden resolverse antes de Champions");
assert.equal(europeanCalendarDate(europeanCalendar(season).final, season), "2027-06-03", "UEL y Conference deben terminar el jueves anterior a Champions");
assert.ok(europeanCalendarDate(europeanCalendar(season).final, season) < championsFinal, "Ninguna final europea puede quedar después de Champions");

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
}
function assertCalendar(league, rounds, hasEuropeanClub, expectedDeadline) {
  const dates = getLeagueRoundTargetDates(league, rounds, season, hasEuropeanClub);
  assert.equal(dates.length, rounds, `${league} debe recibir sus ${rounds} jornadas`);
  assert.equal(getLeagueSchedulingDeadline(league, rounds, season), expectedDeadline);
  assert.ok(dates.at(-1) <= expectedDeadline, `${league} no puede superar su fecha límite`);
  for (let i = 1; i < dates.length; i += 1) {
    assert.ok(daysBetween(dates[i - 1], dates[i]) >= 3, `${league}: deben quedar 72h entre jornadas`);
  }
  if (hasEuropeanClub) {
    assert.ok(dates.every((date) => !isEuropeanMatchWeek(date, season)), `${league}: no debe programar liga en semanas UEFA`);
  }
  return dates;
}

const standard38 = assertCalendar("laliga", 38, false, domesticEnd);
assert.equal(standard38.at(-1), domesticEnd, "Las ligas ordinarias deben agotar su último sábado permitido");

// Validate every competition loaded by the game, not just the representative
// 38/42/46-round leagues above. Odd team counts include one bye round per leg.
for (const leagueId of Object.keys(LEAGUES)) {
  const teamCount = teamsByLeague(leagueId).length;
  if (teamCount < 2) continue;
  const oneLegRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  const rounds = oneLegRounds * 2;
  const deadline = getLeagueSchedulingDeadline(leagueId, rounds, season);
  const dates = getLeagueRoundTargetDates(leagueId, rounds, season, false);
  assert.equal(dates.length, rounds, `${leagueId}: calendario completo de ${rounds} jornadas`);
  assert.ok(dates.every((date) => date <= domesticEnd), `${leagueId}: todas las ligas deben acabar antes del ${domesticEnd}`);
  assert.ok(dates.at(-1) <= deadline, `${leagueId}: fecha límite respetada (${deadline})`);
}
const spanish42 = assertCalendar("laliga2", 42, false, "2027-05-14");
assert.equal(spanish42.at(-1), "2027-05-11", "La Hypermotion debe cerrar la fase regular antes del playoff");
const championship46 = assertCalendar("championship", 46, false, "2027-05-14");
assert.equal(championship46.at(-1), "2027-05-11", "La Championship debe encajar sus 46 jornadas con varias fechas entre semana");
const europeanChampionship46 = assertCalendar("championship", 46, true, "2027-05-14");
assert.equal(europeanChampionship46.length, 46, "Un participante europeo no debe reducir el número de jornadas de Championship");
assert.ok(europeanChampionship46.some((date) => new Date(`${date}T12:00:00Z`).getUTCDay() === 2),
  "La Championship debe usar martes en semanas sin competición europea");
const french34 = assertCalendar("ligue2", 34, false, "2027-05-16");
assert.ok(french34.at(-1) <= "2027-05-16");

// Full synthetic round-robin assignments verify that match-level date placement
// retains every fixture, keeps 72h per club, and respects the Europe-week block.
assert.equal(assertAssignedFixtureDates("championship", 46, false, "2027-05-14").length, 24 * 23);
assert.equal(assertAssignedFixtureDates("championship", 46, true, "2027-05-14").length, 24 * 23);

for (const year of [2026, 2027, 2028, 2029, 2030, 2031]) {
  const finalDate = getChampionsLeagueFinalDate(year);
  assert.equal(new Date(`${finalDate}T12:00:00Z`).getUTCDay(), 6, `La final ${year} debe ser sábado`);
  assert.equal(finalDate, `${year + 1}-06-${String(new Date(`${year + 1}-06-01T12:00:00Z`).getUTCDay() === 6 ? 1 : ((6 - new Date(`${year + 1}-06-01T12:00:00Z`).getUTCDay() + 7) % 7) + 1).padStart(2, "0")}`);
  assert.equal(getDomesticSeasonEndDate(year), addIsoDays(finalDate, -7));
  const playoffs = getDomesticPlayoffCalendar(year);
  assert.equal(playoffs.latestLeagueFixture, addIsoDays(finalDate, -7),
    `las ligas regulares ${year} deben acabar una semana antes de Champions`);
  assert.equal(playoffs.finalLeg2, addIsoDays(finalDate, 7),
    `la final española de playoff ${year} debe acabar una semana después de Champions`);
  assert.equal(playoffs.singleLegFinal, addIsoDays(finalDate, 7),
    `la final inglesa de playoff ${year} debe acabar una semana después de Champions`);
  assert.ok(playoffs.survivalLeg2 < finalDate,
    `los playoffs de permanencia de Francia/Alemania ${year} pueden acabar antes de Champions`);
  assert.equal(europeanCalendarDate(europeanCalendar(year).final, year), addIsoDays(finalDate, -2));
}

console.log("OK: UCL final first Saturday of June, regular league deadlines, extended Spain/England promotion play-offs, earlier France/Germany survival play-offs, 42/46-round calendars and UEFA-week protection");

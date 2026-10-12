import assert from "node:assert/strict";
import { calculatePromotionRelegation, DEFAULT_PROMOTION_PYRAMIDS } from "../src/lib/season/promotionRelegationCore.ts";

function buildTeams(counts, leagueIds, assignments = null) {
  const teams = [];
  for (const [leagueIndex, leagueId] of leagueIds.entries()) {
    for (let index = 0; index < counts[leagueIndex]; index += 1) {
      const id = `${leagueId}-club-${String(index + 1).padStart(2, "0")}`;
      teams.push({
        id,
        name: `${leagueId} ${index + 1}`,
        leagueId: assignments?.[id] ?? leagueId,
        att: 55 + ((index * 7 + leagueIndex * 5) % 40),
        mid: 55 + ((index * 11 + leagueIndex * 3) % 40),
        def: 55 + ((index * 13 + leagueIndex * 9) % 40),
      });
    }
  }
  return teams;
}

function createStandings(teams, leagueIds, year) {
  const standings = {};
  for (const leagueId of leagueIds) {
    const members = teams
      .filter((team) => team.leagueId === leagueId)
      .slice()
      .sort((a, b) => {
        const scoreA = Math.imul(hash(`${a.id}|${year}`), 31) >>> 0;
        const scoreB = Math.imul(hash(`${b.id}|${year}`), 31) >>> 0;
        return scoreB - scoreA;
      });
    standings[leagueId] = members.map((team, index) => ({
      teamId: team.id,
      played: Math.max(0, (members.length - 1) * 2),
      won: Math.max(0, members.length - index - 1),
      gd: (members.length - index) * 2,
      gf: (members.length - index) * 3,
      points: (members.length - index) * 3,
    }));
  }
  return standings;
}

function hash(input) {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

assert.deepEqual(
  DEFAULT_PROMOTION_PYRAMIDS.map((pyramid) => [pyramid.country, [...pyramid.leagueIds], pyramid.mode]),
  [
    ["España", ["laliga", "laliga2"], "promotion-playoff"],
    ["Inglaterra", ["premier", "championship", "leagueone", "leaguetwo"], "promotion-playoff"],
    ["Italia", ["seriea", "serieb"], "promotion-playoff"],
    ["Alemania", ["bundesliga", "bundesliga2", "liga3"], "relegation-playoff"],
    ["Francia", ["ligue1", "ligue2"], "relegation-playoff"],
  ],
  "Las pirámides por defecto deben usar las claves reales del proyecto",
);

function assertLeagueCounts(teams, leagueIds, expectedCounts, label) {
  const counts = Object.fromEntries(leagueIds.map((leagueId) => [
    leagueId,
    teams.filter((team) => team.leagueId === leagueId).length,
  ]));
  assert.deepEqual(
    leagueIds.map((leagueId) => counts[leagueId]),
    expectedCounts,
    `${label}: los tamaños de división deben conservarse`,
  );
}

// Playoff-style pyramids must exchange three clubs for the common Spanish / English / Italian rules.
for (const scenario of [
  { country: "España", leagueIds: ["top", "second"], counts: [20, 22], mode: "promotion-playoff", playoffCandidates: 4 },
  { country: "Inglaterra", leagueIds: ["top", "second", "third", "fourth"], counts: [20, 24, 24, 24], mode: "promotion-playoff", playoffCandidates: 4 },
  { country: "Italia", leagueIds: ["top", "second"], counts: [20, 20], mode: "promotion-playoff", playoffCandidates: 6 },
]) {
  const teams = buildTeams(scenario.counts, scenario.leagueIds);
  const standings = createStandings(teams, scenario.leagueIds, 2026);
  const input = {
    seasonStartYear: 2026,
    seed: 123456,
    teams,
    standings,
    pyramids: [{ country: scenario.country, leagueIds: scenario.leagueIds, mode: scenario.mode, playoffCandidates: scenario.playoffCandidates }],
  };
  const before = structuredClone({ teams, standings });
  const result = calculatePromotionRelegation(input);
  assert.deepEqual({ teams, standings }, before, `${scenario.country}: el motor no debe mutar la entrada`);
  assert.deepEqual(result, calculatePromotionRelegation(input), `${scenario.country}: resultado reproducible`);
  assert.equal(new Set(result.movements.map((movement) => movement.teamId)).size, result.movements.length,
    `${scenario.country}: un club no puede moverse dos veces en la misma transición`);
  for (let index = 0; index < scenario.leagueIds.length - 1; index += 1) {
    const upper = scenario.leagueIds[index];
    const lower = scenario.leagueIds[index + 1];
    const movedUp = result.movements.filter((movement) => movement.fromLeague === lower && movement.toLeague === upper);
    const movedDown = result.movements.filter((movement) => movement.fromLeague === upper && movement.toLeague === lower);
    assert.equal(movedUp.length, 3, `${scenario.country} ${lower}->${upper}: tres ascendidos`);
    assert.equal(movedDown.length, 3, `${scenario.country} ${upper}->${lower}: tres descendidos`);
  }
}

// Germany / France have direct changes plus a two-leg survival playoff; regardless of outcome,
// club counts remain unchanged and the bottom division never sends clubs into a missing tier.
for (const scenario of [
  { country: "Alemania", leagueIds: ["top", "second", "third"], counts: [18, 18, 20] },
  { country: "Francia", leagueIds: ["top", "second"], counts: [18, 18] },
]) {
  const teams = buildTeams(scenario.counts, scenario.leagueIds);
  const result = calculatePromotionRelegation({
    seasonStartYear: 2026,
    seed: 98765,
    teams,
    standings: createStandings(teams, scenario.leagueIds, 2026),
    pyramids: [{ country: scenario.country, leagueIds: scenario.leagueIds, mode: "relegation-playoff" }],
  });
  const assignments = Object.fromEntries(teams.map((team) => [team.id, team.leagueId]));
  for (const movement of result.movements) assignments[movement.teamId] = movement.toLeague;
  const movedTeams = teams.map((team) => ({ ...team, leagueId: assignments[team.id] }));
  assertLeagueCounts(movedTeams, scenario.leagueIds, scenario.counts, scenario.country);
  const bottom = scenario.leagueIds.at(-1);
  assert.equal(result.movements.some((movement) => movement.fromLeague === bottom && !scenario.leagueIds.includes(movement.toLeague)), false,
    `${scenario.country}: la división inferior no puede descender fuera de la pirámide`);
  assert.deepEqual(result, calculatePromotionRelegation({
    seasonStartYear: 2026,
    seed: 98765,
    teams,
    standings: createStandings(teams, scenario.leagueIds, 2026),
    pyramids: [{ country: scenario.country, leagueIds: scenario.leagueIds, mode: "relegation-playoff" }],
  }));
}

// Badly undersized data must be skipped as a whole, never apply only half an exchange.
{
  const leagueIds = ["top", "second"];
  const teams = buildTeams([5, 4], leagueIds);
  const result = calculatePromotionRelegation({
    seasonStartYear: 2026,
    seed: 1,
    teams,
    standings: createStandings(teams, leagueIds, 2026),
    pyramids: [{ country: "Small league", leagueIds, mode: "promotion-playoff", playoffCandidates: 4 }],
  });
  assert.equal(result.movements.length, 0, "No se deben ejecutar movimientos parciales si no hay aspirantes suficientes");
  assert.equal(result.skippedPyramids.length, 1, "Debe registrarse la pirámide incompatible con la regla de playoff");
}

// Headless stress test: twenty consecutive campaigns with mutable assignments and fixed division sizes.
const leagueIds = ["top", "middle", "bottom"];
const expectedCounts = [20, 22, 24];
const firstTeams = buildTeams(expectedCounts, leagueIds);
const baseTeams = firstTeams.map(({ id, name, att, mid, def }) => ({ id, name, att, mid, def }));
const assignments = Object.fromEntries(firstTeams.map((team) => [team.id, team.leagueId]));
for (let seasonOffset = 0; seasonOffset < 20; seasonOffset += 1) {
  const year = 2026 + seasonOffset;
  const currentTeams = baseTeams.map((team) => ({ ...team, leagueId: assignments[team.id] }));
  const result = calculatePromotionRelegation({
    seasonStartYear: year,
    seed: 80421,
    teams: currentTeams,
    standings: createStandings(currentTeams, leagueIds, year),
    pyramids: [{ country: "Testland", leagueIds, mode: "promotion-playoff", playoffCandidates: 4 }],
  });
  assert.equal(new Set(result.movements.map((movement) => movement.teamId)).size, result.movements.length,
    `Temporada ${year}: sin dobles movimientos`);
  for (const movement of result.movements) assignments[movement.teamId] = movement.toLeague;
  const nextTeams = baseTeams.map((team) => ({ ...team, leagueId: assignments[team.id] }));
  assertLeagueCounts(nextTeams, leagueIds, expectedCounts, `Temporada ${year}`);
  assert.equal(new Set(nextTeams.map((team) => team.id)).size, nextTeams.length,
    `Temporada ${year}: sin duplicados de club`);
}

console.log("OK: ascensos/descensos deterministas, playoffs, pirámides estables y simulación headless de 20 temporadas");

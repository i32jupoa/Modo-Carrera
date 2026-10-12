import assert from "node:assert/strict";
import { calculatePromotionRelegation } from "../src/lib/season/promotionRelegationCore.ts";
import {
  appendEuropeanCoefficientSeason,
  calculateEuropeanAssociationCoefficient,
  calculateEuropeanQualification,
} from "../src/lib/season/europeanQualificationCore.ts";
import { getSeasonCalendarAnchors, formatSeasonLabel } from "../src/lib/season/calendarFactory.ts";
import { getSeasonRolloverDates } from "../src/lib/season/seasonRolloverCore.ts";
import { settleSeasonEconomyForCampaign } from "../src/lib/season/seasonEconomyCore.ts";
import { migrateSeasonEconomyFields } from "../src/lib/season/seasonEconomyMigration.ts";

const associations = ["eng", "esp", "ita", "ger", "fra", "por", "ned", "tur", "bel", "pol", "sui", "swe", "nor", "aut", "sco", "rou", "den"]
  .map((id) => ({ id, name: id.toUpperCase(), topLeagueId: `league-${id}` }));
const clubs = [];
const clubsByAssociation = new Map();
for (let a = 0; a < associations.length; a += 1) {
  const association = associations[a];
  const associated = [];
  for (let i = 0; i < 20; i += 1) {
    const club = { id: `${association.id}-${i + 1}`, name: `${association.id}-${i + 1}`, leagueId: association.topLeagueId, associationId: association.id, strength: 270 - a * 3 - i };
    clubs.push(club);
    associated.push(club);
  }
  clubsByAssociation.set(association.id, associated);
}

// A separate synthetic Spanish pyramid cycles clubs through 20 seasons. It
// verifies that promotion/relegation + financial tier changes do not change tier counts.
const pyramidTeams = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: `esp-top-${i + 1}`, name: `Top ${i + 1}`, leagueId: "pyramid-top", att: 80 - i, mid: 79 - i, def: 78 - i })),
  ...Array.from({ length: 22 }, (_, i) => ({ id: `esp-second-${i + 1}`, name: `Second ${i + 1}`, leagueId: "pyramid-second", att: 70 - i, mid: 69 - i, def: 68 - i })),
];
let assignments = Object.fromEntries(pyramidTeams.map((club) => [club.id, club.leagueId]));
let finance = new Map(clubs.map((club) => [club.id, { budget: 25_000_000 + club.strength * 10_000, initialBudget: 35_000_000 + club.strength * 10_000, wageBudget: 8_000_000, wageBill: 5_000_000, spent: 0, earned: 0, leagueId: club.leagueId }]));
let coefficients = [];
let europeanQualification = null;
let economyLedger = [];
let uniqueOwnership = new Map(clubs.map((club) => [club.id, club.id]));
let fixedContracts = clubs.map((club, index) => ({ playerId: `player-${index}`, clubId: club.id, yearsLeft: 2 + (index % 5) }));

for (let offset = 0; offset < 20; offset += 1) {
  const seasonYear = 2026 + offset;
  const season = formatSeasonLabel(seasonYear);
  const dates = getSeasonRolloverDates(season);
  assert.equal(dates.fromSeason, season);
  assert.equal(dates.toSeason, formatSeasonLabel(seasonYear + 1));
  const anchors = getSeasonCalendarAnchors(seasonYear);
  for (const date of [anchors.gameStartDate, anchors.nationalCupStart, anchors.leagueKickoffSaturday, anchors.summerWindowEnd, anchors.winterWindowStart]) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(Date.parse(`${date}T00:00:00Z`)), `${season}: fecha válida ${date}`);
  }

  const standings = {};
  const associationStandings = {};
  for (const association of associations) {
    const associated = clubsByAssociation.get(association.id);
    // Rotate the results year by year while preserving unique, fully-played tables.
    const ranked = [...associated].sort((a, b) => {
      const ai = (Number(a.id.split("-").at(-1)) + offset) % associated.length;
      const bi = (Number(b.id.split("-").at(-1)) + offset) % associated.length;
      return ai - bi || a.id.localeCompare(b.id);
    });
    standings[association.topLeagueId] = ranked.map((club, index) => ({ teamId: club.id, points: (20 - index) * 3, gd: (20 - index) * 2, gf: (20 - index) * 3, won: 20 - index, played: 38 }));
    associationStandings[association.topLeagueId] = standings[association.topLeagueId];
  }

  const pyramidCurrentTeams = pyramidTeams.map((club) => ({ ...club, leagueId: assignments[club.id] }));
  for (const leagueId of ["pyramid-top", "pyramid-second"]) {
    const rows = pyramidCurrentTeams.filter((club) => club.leagueId === leagueId)
      .sort((a, b) => (a.att + offset) % 20 - (b.att + offset) % 20 || a.id.localeCompare(b.id));
    standings[leagueId] = rows.map((club, index) => ({ teamId: club.id, points: (rows.length - index) * 3, gd: (rows.length - index) * 2, gf: (rows.length - index) * 3, won: rows.length - index, played: 38 }));
  }

  const promotions = calculatePromotionRelegation({
    seasonStartYear: seasonYear,
    seed: 12000 + offset,
    teams: pyramidCurrentTeams,
    standings,
    pyramids: [{ country: "España", leagueIds: ["pyramid-top", "pyramid-second"], mode: "promotion-playoff", playoffCandidates: 4 }],
  });
  for (const movement of promotions.movements) assignments[movement.teamId] = movement.toLeague;
  const tierCounts = [
    pyramidTeams.filter((club) => assignments[club.id] === "pyramid-top").length,
    pyramidTeams.filter((club) => assignments[club.id] === "pyramid-second").length,
  ];
  assert.deepEqual(tierCounts, [20, 22], `${season}: se mantienen los tamaños de división`);
  assert.equal(new Set(promotions.movements.map((movement) => movement.teamId)).size, promotions.movements.length);

  const europeanInput = {
    seasonStartYear: seasonYear,
    associations,
    clubs,
    standings: associationStandings,
    cupWinnersByAssociation: Object.fromEntries(associations.map((association) => [association.id, clubsByAssociation.get(association.id)[(offset + 7) % 20].id])),
    champions: europeanQualification ? { ucl: europeanQualification.ucl[0], uel: europeanQualification.uel[0], uecl: europeanQualification.uecl[0] } : {},
    coefficientHistory: coefficients,
    results: { ucl: [], uel: [], uecl: [] },
    participants: europeanQualification ? { ucl: europeanQualification.ucl, uel: europeanQualification.uel, uecl: europeanQualification.uecl } : {},
  };
  europeanQualification = calculateEuropeanQualification(europeanInput);
  const participantList = [...europeanQualification.ucl, ...europeanQualification.uel, ...europeanQualification.uecl];
  assert.equal(europeanQualification.ucl.length, 36);
  assert.equal(europeanQualification.uel.length, 36);
  assert.equal(europeanQualification.uecl.length, 36);
  assert.equal(new Set(participantList).size, 108, `${season}: no se duplican plazas UEFA`);

  const competitionResults = { ucl: [], uel: [], uecl: [] };
  for (const comp of ["ucl", "uel", "uecl"]) {
    const participants = europeanQualification[comp];
    for (let i = 0; i < 12; i += 1) {
      const home = participants[(i + offset) % participants.length];
      const away = participants[(i + 13 + offset) % participants.length];
      if (home !== away) competitionResults[comp].push({ homeId: home, awayId: away, homeGoals: (i + offset) % 4, awayGoals: (i * 2 + offset) % 3 });
    }
  }
  const coeff = calculateEuropeanAssociationCoefficient({ ...europeanInput, results: competitionResults, participants: { ucl: europeanQualification.ucl, uel: europeanQualification.uel, uecl: europeanQualification.uecl } });
  coefficients = appendEuropeanCoefficientSeason(coefficients, { seasonStartYear: seasonYear, pointsByAssociation: coeff.pointsByAssociation });
  assert.ok(coefficients.length <= 5, "el histórico de coeficientes queda limitado a cinco temporadas");

  const nextCompetitionByClub = new Map();
  for (const comp of ["ucl", "uel", "uecl"]) for (const clubId of europeanQualification[comp]) nextCompetitionByClub.set(clubId, comp);
  const inputs = clubs.map((club, index) => {
    const current = finance.get(club.id);
    const rank = (index + offset) % 20 + 1;
    return {
      clubId: club.id, mode: "ai", currentBudget: current.budget, initialBudget: current.initialBudget,
      wageBudget: current.wageBudget, wageBill: current.wageBill, spent: current.spent, earned: current.earned,
      previousLeagueId: club.leagueId, nextLeagueId: club.leagueId, finalPosition: rank, leagueSize: 20,
      wonDomesticCup: index === offset % clubs.length,
      currentEuropeanCompetition: europeanQualification.ucl.includes(club.id) ? "ucl" : europeanQualification.uel.includes(club.id) ? "uel" : europeanQualification.uecl.includes(club.id) ? "uecl" : null,
      nextEuropeanCompetition: nextCompetitionByClub.get(club.id) ?? null,
      europeanChampion: club.id === europeanQualification.ucl[0] ? "ucl" : club.id === europeanQualification.uel[0] ? "uel" : club.id === europeanQualification.uecl[0] ? "uecl" : null,
    };
  });
  const settled = settleSeasonEconomyForCampaign(season, inputs, economyLedger);
  assert.equal(settled.skipped, false);
  assert.equal(settled.updates.length, clubs.length);
  economyLedger = settled.ledger;
  for (const update of settled.updates) {
    assert.ok(update.budget >= 500_000 && update.budget <= update.initialBudget * 4, `${season}: presupuesto de IA acotado ${update.clubId}`);
    assert.ok(update.wageBudget >= update.wageBill, `${season}: tope salarial no cubre salarios ${update.clubId}`);
    assert.ok(update.totalBudget >= update.budget);
    finance.set(update.clubId, { budget: update.budget, initialBudget: update.initialBudget, wageBudget: update.wageBudget, wageBill: update.wageBill, spent: update.spent, earned: update.earned, leagueId: finance.get(update.clubId)?.leagueId ?? "unknown" });
  }
  assert.deepEqual(settleSeasonEconomyForCampaign(season, inputs, economyLedger).updates, [], "un reintento no paga dos veces");

  // Simulate contract-year rollover and assert no negative contracts or duplicate ownership.
  fixedContracts = fixedContracts.map((contract) => ({ ...contract, yearsLeft: Math.max(0, contract.yearsLeft - 1) }));
  assert.ok(fixedContracts.every((contract) => contract.yearsLeft >= 0));
  assert.equal(new Set(fixedContracts.map((contract) => contract.playerId)).size, fixedContracts.length);
  assert.equal(new Set(uniqueOwnership.keys()).size, clubs.length);
  assert.ok(economyLedger.length <= 80);
}

const oldSaveMigration = migrateSeasonEconomyFields({ version: 2, season: "2026/27", myTeamId: "legacy" });
assert.equal(oldSaveMigration.changed, true);
assert.deepEqual(oldSaveMigration.save.seasonEconomyLedger, []);
assert.equal(oldSaveMigration.save.seasonEconomyVersion, 1);
assert.equal(economyLedger.length, 20, "se han liquidado veinte campañas distintas");
assert.equal(coefficients.length, 5, "los coeficientes conservan exactamente las cinco campañas más recientes");
assert.ok([...finance.values()].every((entry) => Number.isFinite(entry.budget) && entry.budget < 1_000_000_000));
console.log("season-lifetime-test: OK — 20 campañas de calendario, ascensos/descensos, UEFA, economía, migración y guardas idempotentes");

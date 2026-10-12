import assert from "node:assert/strict";
import {
  appendEuropeanCoefficientSeason,
  calculateEuropeanAssociationCoefficient,
  calculateEuropeanQualification,
  rankEuropeanAssociations,
} from "../src/lib/season/europeanQualificationCore.ts";

const associationIds = [
  "eng", "esp", "ita", "ger", "fra", "por", "ned", "tur", "bel", "pol", "sui", "den", "swe", "nor", "aut", "sco", "rou",
];
const associations = associationIds.map((id, index) => ({ id, name: id.toUpperCase(), topLeagueId: `league-${id}` }));
const clubs = [];
const standings = {};
for (let associationIndex = 0; associationIndex < associations.length; associationIndex += 1) {
  const association = associations[associationIndex];
  const leagueClubs = [];
  for (let clubIndex = 0; clubIndex < 20; clubIndex += 1) {
    const club = {
      id: `${association.id}-club-${String(clubIndex + 1).padStart(2, "0")}`,
      name: `${association.name} Club ${clubIndex + 1}`,
      leagueId: association.topLeagueId,
      associationId: association.id,
      strength: 270 - associationIndex * 5 - clubIndex * 2,
    };
    clubs.push(club);
    leagueClubs.push(club);
  }
  standings[association.topLeagueId] = leagueClubs.map((club, index) => ({
    teamId: club.id,
    points: (20 - index) * 3,
    gd: (20 - index) * 2,
    gf: (20 - index) * 3,
    won: 20 - index,
    played: 38,
  }));
}
const cupWinnersByAssociation = Object.fromEntries(
  associations.map((association) => [association.id, `${association.id}-club-10`]),
);
const input = {
  seasonStartYear: 2028,
  associations,
  clubs,
  standings,
  cupWinnersByAssociation,
  champions: { ucl: "eng-club-01", uel: "esp-club-01", uecl: "ita-club-19" },
  coefficientHistory: [],
  results: {
    ucl: [
      { homeId: "eng-club-01", awayId: "esp-club-01", homeGoals: 2, awayGoals: 0 },
      { homeId: "ita-club-01", awayId: "ger-club-01", homeGoals: 1, awayGoals: 1 },
    ],
    uel: [{ homeId: "por-club-01", awayId: "ned-club-01", homeGoals: 0, awayGoals: 1 }],
    uecl: [{ homeId: "tur-club-01", awayId: "bel-club-01", homeGoals: 3, awayGoals: 2 }],
  },
  participants: {
    ucl: ["eng-club-01", "esp-club-01", "ita-club-01", "ger-club-01"],
    uel: ["por-club-01", "ned-club-01"],
    uecl: ["tur-club-01", "bel-club-01"],
  },
};

const qualification = calculateEuropeanQualification(input);
const again = calculateEuropeanQualification(input);
assert.deepEqual(qualification, again, "La clasificación debe ser determinista");
for (const competition of ["ucl", "uel", "uecl"]) {
  assert.equal(qualification[competition].length, 36, `${competition}: debe haber 36 participantes`);
  assert.equal(new Set(qualification[competition]).size, 36, `${competition}: no puede haber duplicados internos`);
}
const combined = [...qualification.ucl, ...qualification.uel, ...qualification.uecl];
assert.equal(combined.length, 108);
assert.equal(new Set(combined).size, 108, "No puede haber equipos en dos competiciones en la misma temporada");
assert.equal(qualification.ucl.includes("eng-club-01"), true, "Debe entrar el campeón de Champions");
assert.equal(qualification.ucl.includes("esp-club-01"), true, "Debe entrar el campeón de Europa League");
assert.equal(qualification.uel.includes("ita-club-19"), true, "El campeón de Conference debe entrar en Europa League");

const coefficient = calculateEuropeanAssociationCoefficient(input);
assert.equal(coefficient.completedMatches, 4);
assert.ok(coefficient.pointsByAssociation.eng > coefficient.pointsByAssociation.ger, "Las victorias deben sumar más puntos que las derrotas");
assert.ok(coefficient.pointsByAssociation.ita > 0, "Los empates deben sumar un punto por club participante");

const history = appendEuropeanCoefficientSeason([], {
  seasonStartYear: 2028,
  pointsByAssociation: coefficient.pointsByAssociation,
});
assert.equal(history.length, 1);
assert.deepEqual(
  appendEuropeanCoefficientSeason(history, {
    seasonStartYear: 2028,
    pointsByAssociation: { ...coefficient.pointsByAssociation, eng: 999 },
  }),
  history,
  "Una temporada de coeficientes ya registrada no debe duplicarse ni mutarse al reintentar",
);
const ranked = rankEuropeanAssociations({ ...input, coefficientHistory: history });
assert.equal(ranked.ranking.length, associations.length);
assert.equal(new Set(ranked.ranking).size, associations.length);

const fiveYearHistory = Array.from({ length: 7 }, (_, index) => ({
  seasonStartYear: 2020 + index,
  pointsByAssociation: Object.fromEntries(associationIds.map((id) => [id, index + 1])),
}));
const compacted = appendEuropeanCoefficientSeason(fiveYearHistory, {
  seasonStartYear: 2027,
  pointsByAssociation: Object.fromEntries(associationIds.map((id) => [id, 12])),
});
assert.equal(compacted.length, 5, "El historial debe conservar solo cinco temporadas");
assert.deepEqual(compacted.map((item) => item.seasonStartYear), [2023, 2024, 2025, 2026, 2027]);

console.log("OK: clasificación europea, 108 plazas únicas, coeficientes reproducibles y ventana histórica de cinco temporadas.");

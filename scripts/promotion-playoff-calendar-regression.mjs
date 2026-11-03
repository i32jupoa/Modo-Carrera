import assert from "node:assert/strict";
import { ensurePromotionPlayoffFixtures } from "../src/lib/season/promotionPlayoffs.ts";
import { getDomesticPlayoffCalendar } from "../src/lib/season/calendarFactory.ts";
import { teamsByLeague } from "../src/data/teams.ts";

const seasonStartYear = 2026;
const calendar = getDomesticPlayoffCalendar(seasonStartYear);
const fixture = (country, stage, leg, id, date, result) => ({
  id,
  competition: "cup",
  league: country === "España" ? "laliga2" : country === "Inglaterra" ? "championship" : country === "Francia" ? "ligue2" : "bundesliga2",
  matchday: 1,
  date,
  homeId: `${id}-home`,
  awayId: `${id}-away`,
  ...(result ? { result } : {}),
  promotionPlayoff: {
    country,
    seasonStartYear,
    tieId: `${country}-${stage}`,
    stage,
    leg,
    homeSeed: 1,
    awaySeed: 2,
  },
});

const playedHistorical = fixture("España", "semifinal", 1, "played-historical", "2027-05-15", {
  homeGoals: 2,
  awayGoals: 1,
});
const input = {
  season: "2026/27",
  fixtures: {},
  standings: {},
  cupFixtures: {
    laliga2: [
      fixture("España", "semifinal", 1, "es-sf-1", "2027-05-15"),
      fixture("España", "semifinal", 2, "es-sf-2", "2027-05-18"),
      fixture("España", "final", 1, "es-final-1", "2027-05-24"),
      fixture("España", "final", 2, "es-final-2", "2027-05-27"),
      playedHistorical,
    ],
    championship: [
      fixture("Inglaterra", "semifinal", 1, "en-sf-1", "2027-05-15"),
      fixture("Inglaterra", "semifinal", 2, "en-sf-2", "2027-05-18"),
      fixture("Inglaterra", "final", 1, "en-final", "2027-05-24"),
    ],
    ligue2: [
      fixture("Francia", "survival", 1, "fr-survival-1", "2027-05-24"),
      fixture("Francia", "survival", 2, "fr-survival-2", "2027-05-27"),
    ],
    bundesliga2: [
      fixture("Alemania", "survival", 1, "de-survival-1", "2027-05-24"),
      fixture("Alemania", "survival", 2, "de-survival-2", "2027-05-27"),
    ],
  },
};

const migrated = ensurePromotionPlayoffFixtures(input);
const byId = new Map(Object.values(migrated.cupFixtures).flat().map((item) => [item.id, item]));
for (const [id, expected] of [
  ["es-sf-1", calendar.semifinalLeg1],
  ["es-sf-2", calendar.semifinalLeg2],
  ["es-final-1", calendar.finalLeg1],
  ["es-final-2", calendar.finalLeg2],
  ["en-sf-1", calendar.semifinalLeg1],
  ["en-sf-2", calendar.semifinalLeg2],
  ["en-final", calendar.singleLegFinal],
  ["fr-survival-1", calendar.survivalLeg1],
  ["fr-survival-2", calendar.survivalLeg2],
  ["de-survival-1", calendar.survivalLeg1],
  ["de-survival-2", calendar.survivalLeg2],
]) {
  assert.equal(byId.get(id)?.date, expected, `${id} debe migrar a la ventana propia de su país`);
}
assert.equal(byId.get("played-historical")?.date, "2027-05-15", "los partidos ya disputados conservan su fecha histórica");
assert.equal(byId.get("played-historical")?.result.homeGoals, 2, "los resultados disputados se conservan");

// Exercise the real generator as well: regular seasons finish, semi-finals are
// created before the UCL final, and their winners unlock finals after it.
const leagues = ["laliga2", "championship", "ligue1", "ligue2", "bundesliga", "bundesliga2"];
const generatedSave = {
  season: "2026/27",
  myTeamId: "test-user-team",
  fixtures: Object.fromEntries(leagues.map((league) => [league, [{
    id: `${league}-last`, competition: "league", league, matchday: 1,
    homeId: "test-home", awayId: "test-away", result: { homeGoals: 1, awayGoals: 0 },
  }]])),
  standings: Object.fromEntries(leagues.map((league) => [league, teamsByLeague(league).slice(0, 6).map((team, index) => ({
    teamId: team.id, played: 1, won: 1, drawn: 0, lost: 0,
    gf: 6 - index, ga: 0, gd: 6 - index, points: 18 - index * 3,
  }))])),
  cupFixtures: {},
};
const generatedSemifinals = ensurePromotionPlayoffFixtures(generatedSave);
const generatedSpainSemis = generatedSemifinals.cupFixtures.laliga2.filter((item) => item.promotionPlayoff?.country === "España");
const generatedEnglandSemis = generatedSemifinals.cupFixtures.championship.filter((item) => item.promotionPlayoff?.country === "Inglaterra");
assert.equal(generatedSpainSemis.length, 4);
assert.ok(generatedSpainSemis.every((item) => item.date === (item.promotionPlayoff.leg === 1 ? calendar.semifinalLeg1 : calendar.semifinalLeg2)));
assert.equal(generatedEnglandSemis.length, 4);
assert.ok(generatedEnglandSemis.every((item) => item.date === (item.promotionPlayoff.leg === 1 ? calendar.semifinalLeg1 : calendar.semifinalLeg2)));
const semisWithResults = {
  ...generatedSemifinals,
  cupFixtures: Object.fromEntries(Object.entries(generatedSemifinals.cupFixtures).map(([league, fixtures]) => [league,
    fixtures.map((item) => item.promotionPlayoff?.stage === "semifinal"
      ? { ...item, result: { homeGoals: item.promotionPlayoff.leg === 1 ? 0 : 2, awayGoals: item.promotionPlayoff.leg === 1 ? 1 : 0 } }
      : item),
  ])),
};
const generatedFinals = ensurePromotionPlayoffFixtures(semisWithResults);
assert.equal(generatedFinals.cupFixtures.laliga2.find((item) => item.promotionPlayoff?.country === "España" && item.promotionPlayoff.stage === "final" && item.promotionPlayoff.leg === 1)?.date, calendar.finalLeg1);
assert.equal(generatedFinals.cupFixtures.laliga2.find((item) => item.promotionPlayoff?.country === "España" && item.promotionPlayoff.stage === "final" && item.promotionPlayoff.leg === 2)?.date, calendar.finalLeg2);
assert.equal(generatedFinals.cupFixtures.championship.find((item) => item.promotionPlayoff?.country === "Inglaterra" && item.promotionPlayoff.stage === "final")?.date, calendar.singleLegFinal);

console.log("OK: generación y migración de playoffs; finales de España/Inglaterra una semana después de Champions; resultados históricos preservados");

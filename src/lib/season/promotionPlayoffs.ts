import type { LeagueId } from "@/data/teams";
import { sortStandings, type Fixture } from "@/lib/season";
import { getSeasonStartYear } from "@/lib/season/calendarFactory";
import { addDaysToIso } from "@/lib/transferWindows";
import type { SaveGame } from "@/lib/store";

export type PromotionPlayoffCountry = "España" | "Francia" | "Alemania";
export type PromotionPlayoffStage = "semifinal" | "final" | "survival";
export type PromotionPlayoffMeta = {
  country: PromotionPlayoffCountry;
  seasonStartYear: number;
  tieId: string;
  stage: PromotionPlayoffStage;
  leg: 1 | 2;
  homeSeed: number;
  awaySeed: number;
};

const SPANISH_LEAGUE: LeagueId = "laliga2";
const FRENCH_LOWER: LeagueId = "ligue2";
const FRENCH_UPPER: LeagueId = "ligue1";
const GERMAN_LOWER: LeagueId = "bundesliga2";
const GERMAN_UPPER: LeagueId = "bundesliga";

function regularSeasonIsComplete(save: SaveGame, league: LeagueId): boolean {
  const list = save.fixtures?.[league];
  return Array.isArray(list) && list.length > 0 && list.every((fixture) => Boolean(fixture.result));
}

function rankedTeamIds(save: SaveGame, league: LeagueId): string[] {
  return sortStandings(Array.isArray(save.standings?.[league]) ? save.standings[league] : [])
    .map((row) => row.teamId);
}

function existingPlayoffs(save: Pick<SaveGame, "cupFixtures">, league: LeagueId): Fixture[] {
  const fixtures = save.cupFixtures?.[league];
  return Array.isArray(fixtures) ? fixtures.filter((fixture) => Boolean(fixture.promotionPlayoff)) : [];
}

function latestRegularFixtureDate(save: SaveGame, leagues: LeagueId[]): string | null {
  const dates = leagues.flatMap((league) => (save.fixtures?.[league] ?? [])
    .map((fixture) => typeof fixture.date === "string" ? fixture.date.slice(0, 10) : "")
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
  return dates.sort().at(-1) ?? null;
}

function laterDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function playoffStartDate(save: SaveGame, leagues: LeagueId[], currentDate?: string): string {
  const latest = latestRegularFixtureDate(save, leagues) ?? `${getSeasonStartYear(save.season) + 1}-05-25`;
  const afterSeason = addDaysToIso(latest, 3);
  const afterToday = addDaysToIso(currentDate || save.currentDate || latest, 2);
  return laterDate(afterSeason, afterToday);
}

function makeLeg(
  country: PromotionPlayoffCountry,
  league: LeagueId,
  seasonStartYear: number,
  matchday: number,
  round: string,
  tieId: string,
  stage: PromotionPlayoffStage,
  leg: 1 | 2,
  date: string,
  homeId: string,
  awayId: string,
  homeSeed: number,
  awaySeed: number,
): Fixture {
  const id = `promotion-playoff:${seasonStartYear}:${country}:${tieId}:leg${leg}`;
  return {
    id,
    competition: "cup",
    league,
    matchday,
    round,
    date,
    homeId,
    awayId,
    promotionPlayoff: { country, seasonStartYear, tieId, stage, leg, homeSeed, awaySeed },
  };
}

function ensureCupList(save: SaveGame, league: LeagueId): Fixture[] {
  const list = save.cupFixtures?.[league];
  return Array.isArray(list) ? list : [];
}

function generateSpanishSemifinals(save: SaveGame, currentDate?: string): SaveGame {
  if (!regularSeasonIsComplete(save, SPANISH_LEAGUE)) return save;
  const existing = existingPlayoffs(save, SPANISH_LEAGUE);
  if (existing.some((fixture) => fixture.promotionPlayoff?.stage === "semifinal")) return save;
  const ranked = rankedTeamIds(save, SPANISH_LEAGUE);
  if (ranked.length < 6) return save;
  const start = playoffStartDate(save, [SPANISH_LEAGUE], currentDate);
  const leg2Date = addDaysToIso(start, 3);
  const seasonStartYear = getSeasonStartYear(save.season);
  const fixtures: Fixture[] = [
    // 3.º vs 6.º: ida en casa del 6.º, vuelta en casa del 3.º.
    makeLeg("España", SPANISH_LEAGUE, seasonStartYear, 901, "Playoff ascenso · Semifinal 3.º-6.º-Leg1", "es-laliga2-sf-3-6", "semifinal", 1, start, ranked[5], ranked[2], 6, 3),
    makeLeg("España", SPANISH_LEAGUE, seasonStartYear, 902, "Playoff ascenso · Semifinal 3.º-6.º-Leg2", "es-laliga2-sf-3-6", "semifinal", 2, leg2Date, ranked[2], ranked[5], 3, 6),
    // 4.º vs 5.º: ida en casa del 5.º, vuelta en casa del 4.º.
    makeLeg("España", SPANISH_LEAGUE, seasonStartYear, 901, "Playoff ascenso · Semifinal 4.º-5.º-Leg1", "es-laliga2-sf-4-5", "semifinal", 1, start, ranked[4], ranked[3], 5, 4),
    makeLeg("España", SPANISH_LEAGUE, seasonStartYear, 902, "Playoff ascenso · Semifinal 4.º-5.º-Leg2", "es-laliga2-sf-4-5", "semifinal", 2, leg2Date, ranked[3], ranked[4], 4, 5),
  ];
  return {
    ...save,
    cupFixtures: { ...save.cupFixtures, [SPANISH_LEAGUE]: [...ensureCupList(save, SPANISH_LEAGUE), ...fixtures] },
  };
}

function winnerOfTie(fixtures: Fixture[]): string | null {
  const leg1 = fixtures.find((fixture) => fixture.promotionPlayoff?.leg === 1);
  const leg2 = fixtures.find((fixture) => fixture.promotionPlayoff?.leg === 2);
  if (!leg1?.result || !leg2?.result) return null;
  const goalsByTeam = new Map<string, number>([[leg1.homeId, 0], [leg1.awayId, 0]]);
  goalsByTeam.set(leg1.homeId, (goalsByTeam.get(leg1.homeId) ?? 0) + leg1.result.homeGoals);
  goalsByTeam.set(leg1.awayId, (goalsByTeam.get(leg1.awayId) ?? 0) + leg1.result.awayGoals);
  goalsByTeam.set(leg2.homeId, (goalsByTeam.get(leg2.homeId) ?? 0) + leg2.result.homeGoals + (leg2.result.extraTime?.homeGoals ?? 0));
  goalsByTeam.set(leg2.awayId, (goalsByTeam.get(leg2.awayId) ?? 0) + leg2.result.awayGoals + (leg2.result.extraTime?.awayGoals ?? 0));
  const homeTotal = goalsByTeam.get(leg2.homeId) ?? 0;
  const awayTotal = goalsByTeam.get(leg2.awayId) ?? 0;
  if (homeTotal > awayTotal) return leg2.homeId;
  if (awayTotal > homeTotal) return leg2.awayId;
  const penalties = leg2.result.penalties;
  if (!penalties || penalties.homeGoals === penalties.awayGoals) return null;
  return penalties.homeGoals > penalties.awayGoals ? leg2.homeId : leg2.awayId;
}

function generateSpanishFinal(save: SaveGame, currentDate?: string): SaveGame {
  const list = ensureCupList(save, SPANISH_LEAGUE);
  const playoff = list.filter((fixture) => fixture.promotionPlayoff?.country === "España");
  if (playoff.some((fixture) => fixture.promotionPlayoff?.stage === "final")) return save;
  const semifinalTies = ["es-laliga2-sf-3-6", "es-laliga2-sf-4-5"];
  const winners: Array<{ id: string; seed: number }> = [];
  for (const tieId of semifinalTies) {
    const tieFixtures = playoff.filter((fixture) => fixture.promotionPlayoff?.tieId === tieId);
    if (tieFixtures.length !== 2 || tieFixtures.some((fixture) => !fixture.result)) return save;
    const winnerId = winnerOfTie(tieFixtures);
    if (!winnerId) return save;
    const winnerFixture = tieFixtures.find((fixture) => fixture.homeId === winnerId || fixture.awayId === winnerId)!;
    const meta = winnerFixture.promotionPlayoff!;
    const seed = winnerFixture.homeId === winnerId ? meta.homeSeed : meta.awaySeed;
    winners.push({ id: winnerId, seed });
  }
  if (winners.length !== 2) return save;
  const betterSeed = winners.slice().sort((a, b) => a.seed - b.seed)[0];
  const lowerSeed = winners.find((winner) => winner.id !== betterSeed.id)!;
  const start = playoffStartDate(save, [SPANISH_LEAGUE], currentDate);
  const finalLeg1Date = addDaysToIso(start, 4);
  const finalLeg2Date = addDaysToIso(finalLeg1Date, 3);
  const seasonStartYear = getSeasonStartYear(save.season);
  const fixtures = [
    makeLeg("España", SPANISH_LEAGUE, seasonStartYear, 903, "Playoff ascenso · Final-Leg1", "es-laliga2-final", "final", 1, finalLeg1Date, lowerSeed.id, betterSeed.id, lowerSeed.seed, betterSeed.seed),
    makeLeg("España", SPANISH_LEAGUE, seasonStartYear, 904, "Playoff ascenso · Final-Leg2", "es-laliga2-final", "final", 2, finalLeg2Date, betterSeed.id, lowerSeed.id, betterSeed.seed, lowerSeed.seed),
  ];
  return { ...save, cupFixtures: { ...save.cupFixtures, [SPANISH_LEAGUE]: [...list, ...fixtures] } };
}

function generateFrenchSurvivalTie(save: SaveGame, currentDate?: string): SaveGame {
  if (!regularSeasonIsComplete(save, FRENCH_UPPER) || !regularSeasonIsComplete(save, FRENCH_LOWER)) return save;
  const existing = existingPlayoffs(save, FRENCH_LOWER);
  if (existing.some((fixture) => fixture.promotionPlayoff?.country === "Francia")) return save;
  const upper = rankedTeamIds(save, FRENCH_UPPER);
  const lower = rankedTeamIds(save, FRENCH_LOWER);
  if (upper.length < 3 || lower.length < 3) return save;
  // In a 18-team Ligue 1, third from bottom is 16th.
  const ligue1Candidate = upper[upper.length - 3];
  const ligue2Candidate = lower[2];
  const start = playoffStartDate(save, [FRENCH_UPPER, FRENCH_LOWER], currentDate);
  const returnDate = addDaysToIso(start, 3);
  const seasonStartYear = getSeasonStartYear(save.season);
  const fixtures = [
    makeLeg("Francia", FRENCH_LOWER, seasonStartYear, 911, "Playoff permanencia Ligue 1-Ligue 2-Leg1", "fr-ligue1-ligue2-survival", "survival", 1, start, ligue2Candidate, ligue1Candidate, 3, 16),
    makeLeg("Francia", FRENCH_LOWER, seasonStartYear, 912, "Playoff permanencia Ligue 1-Ligue 2-Leg2", "fr-ligue1-ligue2-survival", "survival", 2, returnDate, ligue1Candidate, ligue2Candidate, 16, 3),
  ];
  return { ...save, cupFixtures: { ...save.cupFixtures, [FRENCH_LOWER]: [...ensureCupList(save, FRENCH_LOWER), ...fixtures] } };
}


function generateGermanSurvivalTie(save: SaveGame, currentDate?: string): SaveGame {
  if (!regularSeasonIsComplete(save, GERMAN_UPPER) || !regularSeasonIsComplete(save, GERMAN_LOWER)) return save;
  const existing = existingPlayoffs(save, GERMAN_LOWER);
  if (existing.some((fixture) => fixture.promotionPlayoff?.country === "Alemania")) return save;
  const upper = rankedTeamIds(save, GERMAN_UPPER);
  const lower = rankedTeamIds(save, GERMAN_LOWER);
  if (upper.length < 3 || lower.length < 3) return save;
  // Bundesliga-Relegation: 16.º de Bundesliga contra 3.º de 2. Bundesliga.
  // La ida se juega en casa del equipo de segunda; la vuelta, en casa del de primera.
  const bundesligaCandidate = upper[upper.length - 3];
  const bundesliga2Candidate = lower[2];
  const start = playoffStartDate(save, [GERMAN_UPPER, GERMAN_LOWER], currentDate);
  const returnDate = addDaysToIso(start, 3);
  const seasonStartYear = getSeasonStartYear(save.season);
  const fixtures = [
    makeLeg("Alemania", GERMAN_LOWER, seasonStartYear, 921, "Playoff permanencia Bundesliga-2. Bundesliga-Leg1", "de-bundesliga-bundesliga2-survival", "survival", 1, start, bundesliga2Candidate, bundesligaCandidate, 3, 16),
    makeLeg("Alemania", GERMAN_LOWER, seasonStartYear, 922, "Playoff permanencia Bundesliga-2. Bundesliga-Leg2", "de-bundesliga-bundesliga2-survival", "survival", 2, returnDate, bundesligaCandidate, bundesliga2Candidate, 16, 3),
  ];
  return { ...save, cupFixtures: { ...save.cupFixtures, [GERMAN_LOWER]: [...ensureCupList(save, GERMAN_LOWER), ...fixtures] } };
}

/** Generate real, dated playoff legs only after all involved regular leagues have finished. */
export function ensurePromotionPlayoffFixtures(save: SaveGame, currentDate?: string): SaveGame {
  let next = generateSpanishSemifinals(save, currentDate);
  next = generateSpanishFinal(next, currentDate);
  next = generateFrenchSurvivalTie(next, currentDate);
  next = generateGermanSurvivalTie(next, currentDate);
  return next;
}

/** Winner IDs from the completed, played ties; used by the season rollover instead of random re-draws. */
export function getPlayedPromotionPlayoffWinners(save: Pick<SaveGame, "cupFixtures">): Partial<Record<PromotionPlayoffCountry, string>> {
  const winners: Partial<Record<PromotionPlayoffCountry, string>> = {};
  for (const country of ["España", "Francia", "Alemania"] as const) {
    const league = country === "España"
      ? SPANISH_LEAGUE
      : country === "Francia"
        ? FRENCH_LOWER
        : GERMAN_LOWER;
    const list = existingPlayoffs(save, league).filter((fixture) => fixture.promotionPlayoff?.country === country);
    const finalStage = country === "España" ? "final" : "survival";
    const tie = list.filter((fixture) => fixture.promotionPlayoff?.stage === finalStage);
    const winner = winnerOfTie(tie);
    if (winner) winners[country] = winner;
  }
  return winners;
}

/** Find a saved playable playoff fixture by its stable ID. */
export function findPromotionPlayoffFixture(save: Pick<SaveGame, "cupFixtures">, fixtureId: string): Fixture | null {
  for (const list of Object.values(save.cupFixtures ?? {})) {
    if (!Array.isArray(list)) continue;
    const match = list.find((fixture) => fixture.id === fixtureId && fixture.promotionPlayoff);
    if (match) return match;
  }
  return null;
}

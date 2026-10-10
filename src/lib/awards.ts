import type { LeagueId } from "@/data/teams";
import { ALL_LEAGUES, loadSave, type SaveGame } from "@/lib/store";
import { LEAGUES, teamById } from "@/data/teams";
import { assignFixtureDates } from "@/lib/fixtureScheduler";
import { generateLeagueFixtures, type Fixture } from "@/lib/season";
import { usePlayersStore, type PlayerStats } from "@/store/playersStore";
import type { Player } from "@/data/players";
import type { DynamicPlayerStats, MonthlyStats } from "@/types/playerStats";

export type AwardPlayer = Player & {
  stats: PlayerStats;
  teamName: string;
  leagueId: LeagueId;
  leagueName: string;
  leagueMultiplier: number;
  leagueGoals: number;
  leagueAssists: number;
  leagueAppearances: number;
  leagueMotm: number;
  leagueCleanSheets: number;
  averageRating: number;
  seasonGoals: number;
  seasonAssists: number;
  seasonAppearances: number;
  seasonMinutes: number;
  seasonMVPs: number;
  seasonCleanSheets: number;
  uclGoals: number;
  uclAssists: number;
  uclAppearances: number;
  uclMotm: number;
  uclCleanSheets: number;
  uclFinalMvp: boolean;
  uelGoals: number;
  uelAssists: number;
  uelAppearances: number;
  uelMotm: number;
  uelCleanSheets: number;
  uelFinalMvp: boolean;
  ueclGoals: number;
  ueclAssists: number;
  ueclAppearances: number;
  ueclMotm: number;
  ueclCleanSheets: number;
  ueclFinalMvp: boolean;
  titles: number;
  leagueTitles: number;
  domesticCupTitle: boolean;
  uclChampion: boolean;
  uelChampion: boolean;
  ueclChampion: boolean;
  teamSeasonScore: number;
  uclStageScore: number;
  uclDecisiveScore: number;
  uelStageScore: number;
  uelDecisiveScore: number;
  ueclStageScore: number;
  ueclDecisiveScore: number;
  awardScore: number;
  currentOVR: number;
};

export type SeasonAward = {
  player: AwardPlayer | null;
  score: number;
  label: string;
  detail: string;
  provisional: boolean;
};

export type GoldenShoeCandidate = AwardPlayer & { points: number };
export type GoldenPassCandidate = AwardPlayer & { points: number };
export type BallonDorCandidate = AwardPlayer & {
  points: number;
  ratingPoints: number;
  productionPoints: number;
  mvpPoints: number;
  championsPoints: number;
  trophyPoints: number;
  decisivePoints: number;
  consistencyPoints: number;
  prestigePoints: number;
};
export type ChampionsRankingEntry = AwardPlayer & { points: number };
export type MonthlyRankingEntry = AwardPlayer & { points: number; monthlyStats: MonthlyStats };

export type MonthlyAward = {
  month: number;
  year: number;
  label: string;
  leagueId: LeagueId;
  leagueName: string;
  player: AwardPlayer | null;
  xi: AwardPlayer[];
  ranking: MonthlyRankingEntry[];
  available: boolean;
  published: boolean;
};

export type SeasonXI = AwardPlayer[];

export type AwardsSnapshot = {
  ballon: SeasonAward;
  ballonRanking: BallonDorCandidate[];
  goldenBoy: SeasonAward;
  shoe: { award: SeasonAward; leaderboard: GoldenShoeCandidate[] };
  pass: { award: SeasonAward; leaderboard: GoldenPassCandidate[] };
  glove: SeasonAward;
  seasonXI: SeasonXI;
  championsPlayer: SeasonAward;
  championsRanking: ChampionsRankingEntry[];
  championsXI: SeasonXI;
  europaLeaguePlayer: SeasonAward;
  europaLeagueRanking: ChampionsRankingEntry[];
  europaLeagueXI: SeasonXI;
  conferenceLeaguePlayer: SeasonAward;
  conferenceLeagueRanking: ChampionsRankingEntry[];
  conferenceLeagueXI: SeasonXI;
};

export type MonthlyPeriod = { year: number; month: number; label: string };

function getZeroStats(): PlayerStats {
  return {
    goals: 0,
    assists: 0,
    appearances: 0,
    cupGoals: 0,
    cupAssists: 0,
    cupAppearances: 0,
    uclGoals: 0,
    uclAssists: 0,
    uclAppearances: 0,
    cleanSheets: 0,
    cupCleanSheets: 0,
    uclCleanSheets: 0,
    motm: 0,
    cupMotm: 0,
    uclMotm: 0,
    yellowCards: 0,
    redCards: 0,
    accumulatedYellowCards: 0,
    injuredUntil: 0,
    morale: 70,
    formHistory: [],
    dynamicStats: undefined,
  } as PlayerStats;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 2): number {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

function posCodes(player: Player): string[] {
  return (player.positions ?? []).map((p) => String(p).toUpperCase());
}

function hasPosition(player: Player, positions: string[]): boolean {
  const codes = posCodes(player);
  return positions.some((position) => codes.includes(position));
}

function positionGroup(player: Player): "GK" | "DEF" | "MID" | "FWD" {
  const positions = posCodes(player);
  if (positions.some((p) => ["GK", "POR"].includes(p))) return "GK";
  if (positions.some((p) => ["DFC", "CB", "LD", "LI", "RB", "LB", "RWB", "LWB", "DEF"].includes(p))) return "DEF";
  if (positions.some((p) => ["MCD", "CDM", "MC", "MCO", "CAM", "MD", "MI", "RM", "LM", "MID"].includes(p))) return "MID";
  return "FWD";
}

function isGoalkeeper(player: AwardPlayer): boolean {
  return positionGroup(player) === "GK";
}

function isTopFiveLeague(leagueId: string): boolean {
  return ["laliga", "premier", "seriea", "bundesliga", "ligue1"].includes(leagueId);
}

export function goldenShoeMultiplier(leagueId: LeagueId): number {
  if (isTopFiveLeague(leagueId)) return 2;
  const onePointFiveLeagues = new Set([
    "ligaportugal",
    "eredivisie",
    "trendyolsperlig",
    "1aproleague",
    "scottish",
    "pkobpekstraklasa",
    "bracksuperleague",
    "3fsuperliga",
    "allsvenskan",
    "eliteserien",
    "austrianbundesliga",
    "superliga",
  ]);
  return LEAGUES[leagueId] && onePointFiveLeagues.has(leagueId) ? 1.5 : 1;
}

function isEuropeanTopFlight(leagueId: string): boolean {
  return goldenShoeMultiplier(leagueId) >= 1.5;
}

function seasonLeagueStats(st: PlayerStats) {
  return {
    goals: Math.max(0, (st.goals ?? 0) - (st.cupGoals ?? 0) - (st.uclGoals ?? 0) - (st.uelGoals ?? 0) - (st.ueclGoals ?? 0)),
    assists: Math.max(0, (st.assists ?? 0) - (st.cupAssists ?? 0) - (st.uclAssists ?? 0) - (st.uelAssists ?? 0) - (st.ueclAssists ?? 0)),
    appearances: Math.max(0, (st.appearances ?? 0) - (st.cupAppearances ?? 0) - (st.uclAppearances ?? 0) - (st.uelAppearances ?? 0) - (st.ueclAppearances ?? 0)),
    motm: Math.max(0, (st.motm ?? 0) - (st.cupMotm ?? 0) - (st.uclMotm ?? 0) - (st.uelMotm ?? 0) - (st.ueclMotm ?? 0)),
    cleanSheets: Math.max(0, (st.cleanSheets ?? 0) - (st.cupCleanSheets ?? 0) - (st.uclCleanSheets ?? 0) - (st.uelCleanSheets ?? 0) - (st.ueclCleanSheets ?? 0)),
  };
}

function estimatedRating(player: Player, dynamic: DynamicPlayerStats | undefined, rawStats: PlayerStats): number {
  const count = dynamic?.seasonRatingCount ?? 0;
  if (count > 0) return clamp(dynamic?.seasonAverageRating ?? 6, 1, 10);

  const appearances = Math.max(1, dynamic?.seasonAppearances ?? rawStats.appearances ?? 1);
  const goals = dynamic?.seasonGoals ?? rawStats.goals ?? 0;
  const assists = dynamic?.seasonAssists ?? rawStats.assists ?? 0;
  const mvps = dynamic?.seasonMVPs ?? rawStats.motm ?? 0;
  const contribution = Math.min(0.75, (goals + assists) / appearances * 0.38) + Math.min(0.32, (mvps / appearances) * 0.32);
  return clamp(6.35 + (Math.max(player.rating, Number(dynamic?.currentOVR ?? player.rating)) - 75) * 0.045 + contribution, 6, 8.8);
}

type AwardTeamContext = {
  titlesByTeam: Map<string, number>;
  leagueTitlesByTeam: Map<string, number>;
  seasonScoreByTeam: Map<string, number>;
  uclStageScoreByTeam: Map<string, number>;
  uelStageScoreByTeam: Map<string, number>;
  ueclStageScoreByTeam: Map<string, number>;
};

function domesticCupChampions(save: SaveGame): Set<string> {
  return new Set(
    Object.values(save.cupChampion ?? {})
      .filter((teamId): teamId is string => typeof teamId === "string" && teamId.length > 0),
  );
}

function buildAwardTeamContext(save: SaveGame): AwardTeamContext {
  const titlesByTeam = new Map<string, number>();
  const leagueTitlesByTeam = new Map<string, number>();
  const seasonScoreByTeam = new Map<string, number>();
  const uclStageScoreByTeam = new Map<string, number>();
  const uelStageScoreByTeam = new Map<string, number>();
  const ueclStageScoreByTeam = new Map<string, number>();
  const cupChampions = domesticCupChampions(save);

  const add = (map: Map<string, number>, teamId: string, value: number) => map.set(teamId, (map.get(teamId) ?? 0) + value);

  for (const leagueId of ALL_LEAGUES) {
    const table = save.standings?.[leagueId] ?? [];
    if (!table?.length) continue;
    const fixtures = save.fixtures?.[leagueId] ?? [];
    if (fixtures.length && fixtures.some((fixture) => !fixture.result)) continue;
    const sorted = [...table].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
    for (let pos = 0; pos < sorted.length; pos++) {
      const teamId = sorted[pos].teamId;
      const base = pos === 0 ? 16 : pos === 1 ? 10 : pos === 2 ? 7 : Math.max(0, 5 - pos * 0.25);
      add(seasonScoreByTeam, teamId, base);
    }
    const champion = sorted[0]?.teamId;
    if (champion) {
      add(leagueTitlesByTeam, champion, 1);
      add(titlesByTeam, champion, 1);
      add(seasonScoreByTeam, champion, 10);
    }
  }

  for (const teamId of cupChampions) {
    add(titlesByTeam, teamId, 1);
    add(seasonScoreByTeam, teamId, 6);
  }
  if (save.uclChampion) {
    add(titlesByTeam, save.uclChampion, 1);
    add(seasonScoreByTeam, save.uclChampion, 18);
  }
  if (save.uelChampion) {
    add(titlesByTeam, save.uelChampion, 1);
    add(seasonScoreByTeam, save.uelChampion, 11);
  }
  if (save.ueclChampion) {
    add(titlesByTeam, save.ueclChampion, 1);
    add(seasonScoreByTeam, save.ueclChampion, 7);
  }

  for (const fixture of save.uclFixtures ?? []) {
    if (!fixture.result) continue;
    const weight = europeanRoundWeight(fixture.round);
    if (fixture.homeId) add(uclStageScoreByTeam, fixture.homeId, weight);
    if (fixture.awayId) add(uclStageScoreByTeam, fixture.awayId, weight);
  }
  for (const fixture of save.uelFixtures ?? []) {
    if (!fixture.result) continue;
    const weight = europeanRoundWeight(fixture.round);
    if (fixture.homeId) add(uelStageScoreByTeam, fixture.homeId, weight);
    if (fixture.awayId) add(uelStageScoreByTeam, fixture.awayId, weight);
  }
  for (const fixture of save.ueclFixtures ?? []) {
    if (!fixture.result) continue;
    const weight = europeanRoundWeight(fixture.round);
    if (fixture.homeId) add(ueclStageScoreByTeam, fixture.homeId, weight);
    if (fixture.awayId) add(ueclStageScoreByTeam, fixture.awayId, weight);
  }
  if (save.uclChampion) add(uclStageScoreByTeam, save.uclChampion, 6);
  if (save.uelChampion) add(uelStageScoreByTeam, save.uelChampion, 4);
  if (save.ueclChampion) add(ueclStageScoreByTeam, save.ueclChampion, 3);

  return { titlesByTeam, leagueTitlesByTeam, seasonScoreByTeam, uclStageScoreByTeam, uelStageScoreByTeam, ueclStageScoreByTeam };
}

function worldClassScore(p: AwardPlayer): number {
  const rating = Math.max(p.rating, p.currentOVR);
  const potential = p.potential ?? rating;
  const value = p.marketValue ?? 0;
  return rating * 1.25 + potential * 0.35 + Math.min(value / 10, 24);
}

function europeanRoundWeight(round?: string): number {
  if (!round) return 0;
  if (round === "Final") return 9;
  if (round.includes("SF")) return 7;
  if (round.includes("QF")) return 5;
  if (round.includes("R16")) return 3.5;
  if (round === "Playoff") return 2.5;
  return 1;
}

function uclRoundWeight(round?: string): number {
  return europeanRoundWeight(round);
}

function europeanFixtures(save: SaveGame, competition: "ucl" | "uel" | "uecl"): Fixture[] {
  if (competition === "ucl") return save.uclFixtures ?? [];
  if (competition === "uel") return save.uelFixtures ?? [];
  return save.ueclFixtures ?? [];
}

function europeanChampion(save: SaveGame, competition: "ucl" | "uel" | "uecl"): string | null {
  if (competition === "ucl") return save.uclChampion ?? null;
  if (competition === "uel") return save.uelChampion ?? null;
  return save.ueclChampion ?? null;
}

function europeanFinalMvpIds(save: SaveGame, competition: "ucl" | "uel" | "uecl"): Set<string> {
  const ids = new Set<string>();
  for (const fixture of europeanFixtures(save, competition)) {
    if (fixture.round === "Final" && fixture.result?.mvp?.playerId) ids.add(fixture.result.mvp.playerId);
  }
  return ids;
}

function uclFinalMvpIds(save: SaveGame): Set<string> {
  return europeanFinalMvpIds(save, "ucl");
}

function buildEuropeanDecisivePlayerScores(save: SaveGame, competition: "ucl" | "uel" | "uecl"): Map<string, number> {
  const scores = new Map<string, number>();
  for (const fixture of europeanFixtures(save, competition)) {
    if (!fixture.result) continue;
    const weight = europeanRoundWeight(fixture.round);
    if (weight <= 0) continue;
    const result = fixture.result;
    const lineupIds = new Set<string>([
      ...(result.homeLineup ?? []).map((p) => p.id),
      ...(result.awayLineup ?? []).map((p) => p.id),
    ]);
    const ratingMap = new Map((result.ratings ?? []).map((r) => [r.playerId, r.rating]));
    const goalCount = new Map<string, number>();
    const assistCount = new Map<string, number>();
    for (const event of [...(result.events ?? []), ...(result.extraTime?.events ?? [])]) {
      if (event.type === "own_goal") continue;
      if (event.type === "goal" || event.type === "penalty_goal" || event.type === "free_kick_goal") {
        goalCount.set(event.scorerId, (goalCount.get(event.scorerId) ?? 0) + 1);
        if (event.assistId) assistCount.set(event.assistId, (assistCount.get(event.assistId) ?? 0) + 1);
      }
    }
    for (const playerId of lineupIds) {
      const rating = ratingMap.get(playerId) ?? 6;
      const goals = goalCount.get(playerId) ?? 0;
      const assists = assistCount.get(playerId) ?? 0;
      const mvp = result.mvp?.playerId === playerId ? 1 : 0;
      const performance = Math.max(0, (rating - 6) * 1.9) + goals * 2.3 + assists * 1.2 + mvp * 3.6;
      scores.set(playerId, (scores.get(playerId) ?? 0) + performance * weight);
    }
  }
  return scores;
}

function buildUclDecisivePlayerScores(save: SaveGame): Map<string, number> {
  return buildEuropeanDecisivePlayerScores(save, "ucl");
}

function buildEuropeanTeamStageScore(save: SaveGame, teamId: string, competition: "ucl" | "uel" | "uecl"): number {
  return europeanFixtures(save, competition).reduce((total, fixture) => {
    if (!fixture.result) return total;
    if (fixture.homeId !== teamId && fixture.awayId !== teamId) return total;
    return total + europeanRoundWeight(fixture.round);
  }, 0);
}

function getPlayers(save = loadSave()): AwardPlayer[] {
  const store = usePlayersStore.getState();
  store.init();
  const raw = store.getRawPlayers();
  const stats = (store.stats ?? {}) as Record<string, PlayerStats>;
  const safeSave = save ?? ({} as SaveGame);
  const finalMvpIds = uclFinalMvpIds(safeSave);
  const uclDecisivePlayerScores = buildUclDecisivePlayerScores(safeSave);
  const uelDecisivePlayerScores = buildEuropeanDecisivePlayerScores(safeSave, "uel");
  const ueclDecisivePlayerScores = buildEuropeanDecisivePlayerScores(safeSave, "uecl");
  const uelFinalMvpIds = europeanFinalMvpIds(safeSave, "uel");
  const ueclFinalMvpIds = europeanFinalMvpIds(safeSave, "uecl");
  const cupChampions = domesticCupChampions(safeSave);
  const teamContext = save ? buildAwardTeamContext(save) : {
    titlesByTeam: new Map<string, number>(),
    leagueTitlesByTeam: new Map<string, number>(),
    seasonScoreByTeam: new Map<string, number>(),
    uclStageScoreByTeam: new Map<string, number>(),
    uelStageScoreByTeam: new Map<string, number>(),
    ueclStageScoreByTeam: new Map<string, number>(),
  };

  const out: AwardPlayer[] = [];
  for (const rawPlayer of raw ?? []) {
    const id = String(rawPlayer.ID);
    const player = store.getSimPlayer(id);
    if (!player) continue;
    const team = teamById(player.teamId);
    if (!team || !LEAGUES[team.league]) continue;

    const st = stats[id] ?? getZeroStats();
    const d = st.dynamicStats as DynamicPlayerStats | undefined;
    const totalAppearances = Math.max(d?.seasonAppearances ?? 0, st.appearances ?? 0);
    if (totalAppearances <= 0) continue;
    const league = team.league as LeagueId;
    const domestic = seasonLeagueStats(st);
    const avg = estimatedRating(player, d, st);
    const titleCount = teamContext.titlesByTeam.get(player.teamId) ?? 0;
    const leagueTitleCount = teamContext.leagueTitlesByTeam.get(player.teamId) ?? 0;
    const teamScore = teamContext.seasonScoreByTeam.get(player.teamId) ?? 0;
    const uclStageScore = teamContext.uclStageScoreByTeam.get(player.teamId) ?? 0;
    const uelStageScore = teamContext.uelStageScoreByTeam.get(player.teamId) ?? 0;
    const ueclStageScore = teamContext.ueclStageScoreByTeam.get(player.teamId) ?? 0;
    const currentOVR = Number(d?.currentOVR ?? player.rating);
    const uclChampion = save?.uclChampion === player.teamId;
    const uelChampion = save?.uelChampion === player.teamId;
    const ueclChampion = save?.ueclChampion === player.teamId;
    const domesticCupTitle = cupChampions.has(player.teamId);

    const awardScore =
      (avg - 6.2) * 30 +
      domestic.goals * 1.35 +
      domestic.assists * 0.9 +
      domestic.motm * 2.5 +
      (d?.seasonMVPs ?? st.motm ?? 0) * 0.7 +
      Math.min(20, (d?.seasonAppearances ?? st.appearances ?? 0) * 0.22);

    out.push({
      ...player,
      stats: st,
      teamName: team.name,
      leagueName: LEAGUES[league]?.name ?? league,
      leagueId: league,
      leagueMultiplier: goldenShoeMultiplier(league),
      leagueGoals: domestic.goals,
      leagueAssists: domestic.assists,
      leagueAppearances: domestic.appearances,
      leagueMotm: domestic.motm,
      leagueCleanSheets: domestic.cleanSheets,
      averageRating: avg,
      seasonGoals: d?.seasonGoals ?? st.goals ?? 0,
      seasonAssists: d?.seasonAssists ?? st.assists ?? 0,
      seasonAppearances: d?.seasonAppearances ?? st.appearances ?? 0,
      seasonMinutes: d?.seasonMinutes ?? Math.max(0, (st.appearances ?? 0) * 90),
      seasonMVPs: d?.seasonMVPs ?? st.motm ?? 0,
      seasonCleanSheets: d?.seasonCleanSheets ?? st.cleanSheets ?? 0,
      uclGoals: st.uclGoals ?? 0,
      uclAssists: st.uclAssists ?? 0,
      uclAppearances: st.uclAppearances ?? 0,
      uclMotm: st.uclMotm ?? 0,
      uclCleanSheets: st.uclCleanSheets ?? 0,
      uclFinalMvp: finalMvpIds.has(id),
      uelGoals: st.uelGoals ?? 0,
      uelAssists: st.uelAssists ?? 0,
      uelAppearances: st.uelAppearances ?? 0,
      uelMotm: st.uelMotm ?? 0,
      uelCleanSheets: st.uelCleanSheets ?? 0,
      uelFinalMvp: uelFinalMvpIds.has(id),
      ueclGoals: st.ueclGoals ?? 0,
      ueclAssists: st.ueclAssists ?? 0,
      ueclAppearances: st.ueclAppearances ?? 0,
      ueclMotm: st.ueclMotm ?? 0,
      ueclCleanSheets: st.ueclCleanSheets ?? 0,
      ueclFinalMvp: ueclFinalMvpIds.has(id),
      titles: titleCount,
      leagueTitles: leagueTitleCount,
      domesticCupTitle,
      uclChampion,
      uelChampion,
      ueclChampion,
      teamSeasonScore: teamScore,
      uclStageScore,
      uclDecisiveScore: uclDecisivePlayerScores.get(id) ?? 0,
      uelStageScore,
      uelDecisiveScore: uelDecisivePlayerScores.get(id) ?? 0,
      ueclStageScore,
      ueclDecisiveScore: ueclDecisivePlayerScores.get(id) ?? 0,
      awardScore,
      currentOVR,
    });
  }
  return out;
}

export function getAwardPlayers(save = loadSave()): AwardPlayer[] {
  return getPlayers(save);
}

function ballonDorBreakdown(p: AwardPlayer): BallonDorCandidate {
  // Individual season quality is the foundation. Domestic titles and production
  // carry more weight than a single Champions final, while deep European runs
  // are rewarded without making the champion's squad automatically dominant.
  const bigFiveFactor = isTopFiveLeague(p.leagueId) ? 1.18 : 0.82;
  const ratingPoints = clamp((p.averageRating - 6.65) * 48, 0, 48);
  const domesticProduction = (
    p.leagueGoals * 1.45 + p.leagueAssists * 0.88 +
    p.cupGoals * 1.15 + p.cupAssists * 0.7
  ) * bigFiveFactor;
  const europeanProduction =
    p.uclGoals * 2.35 + p.uclAssists * 1.35 +
    p.uelGoals * 1.85 + p.uelAssists * 1.1 +
    p.ueclGoals * 1.45 + p.ueclAssists * 0.9;
  const otherGoals = Math.max(0, p.seasonGoals - p.leagueGoals - p.cupGoals - p.uclGoals - p.uelGoals - p.ueclGoals);
  const otherAssists = Math.max(0, p.seasonAssists - p.leagueAssists - p.cupAssists - p.uclAssists - p.uelAssists - p.ueclAssists);
  const productionPoints = Math.min(44, domesticProduction + europeanProduction + otherGoals * 0.2 + otherAssists * 0.16);
  const mvpPoints = Math.min(20, p.seasonMVPs * 2.4 + p.leagueMotm * 0.7 + p.uclMotm * 1.15 + p.uelMotm * 0.9 + p.ueclMotm * 0.7);
  const championsPoints = Math.min(28,
    p.uclGoals * 2.35 +
    p.uclAssists * 1.35 +
    p.uclMotm * 3.1 +
    p.uclDecisiveScore * 0.55 +
    (p.uclChampion ? 5 : 0) +
    (p.uclFinalMvp ? 5 : 0),
  );
  const trophyPoints = Math.min(42,
    p.leagueTitles * 8 +
    (p.domesticCupTitle ? 6 : 0) +
    (p.uclChampion ? 7 : 0) +
    (p.uelChampion ? 4.5 : 0) +
    (p.ueclChampion ? 2.5 : 0) +
    Math.min(9, p.teamSeasonScore * 0.12),
  );
  const decisivePoints = Math.min(18,
    p.uclDecisiveScore * 0.75 +
    p.uelDecisiveScore * 0.55 +
    p.ueclDecisiveScore * 0.4 +
    (p.uclFinalMvp ? 5 : 0) +
    (p.uelFinalMvp ? 3 : 0) +
    (p.ueclFinalMvp ? 2 : 0),
  );
  const consistencyPoints = Math.min(14, p.seasonAppearances * 0.28);
  const prestigePoints = Math.min(10, Math.max(0, worldClassScore(p) - 185) * 0.28);
  const points = ratingPoints + productionPoints + mvpPoints + championsPoints + trophyPoints + decisivePoints + consistencyPoints + prestigePoints;

  return { ...p, points, ratingPoints, productionPoints, mvpPoints, championsPoints, trophyPoints, decisivePoints, consistencyPoints, prestigePoints };
}

function ballonDorQuality(p: AwardPlayer): boolean {
  const ovr = Math.max(p.rating, p.currentOVR);
  const topFive = isTopFiveLeague(p.leagueId);
  return ovr >= 84 || p.marketValue >= 60 || (topFive && ovr >= 82) || (p.potential >= 92 && ovr >= 81);
}

function ballonDorElite(p: AwardPlayer): boolean {
  const ovr = Math.max(p.rating, p.currentOVR);
  const topFive = isTopFiveLeague(p.leagueId);
  return ovr >= 89 || p.marketValue >= 90 || (topFive && ovr >= 86) || (p.potential >= 94 && ovr >= 84);
}

export function getBallonDorRanking(
  limit = 30,
  players = getPlayers(loadSave() ?? undefined),
  save = loadSave(),
): BallonDorCandidate[] {
  if (!save) return [];
  const all = players.filter((p) => p.seasonAppearances >= 10).map(ballonDorBreakdown);
  if (!all.length) return [];

  const quality = all.filter(ballonDorQuality).sort((a, b) =>
    b.points - a.points || b.uclDecisiveScore - a.uclDecisiveScore || b.averageRating - a.averageRating || b.currentOVR - a.currentOVR,
  );
  const fallback = all
    .filter((p) => !ballonDorQuality(p))
    .sort((a, b) => worldClassScore(b) - worldClassScore(a) || b.points - a.points || b.averageRating - a.averageRating);
  const pool = [...quality, ...fallback].slice(0, Math.max(limit, 30));
  const elite = quality.filter(ballonDorElite);
  const winner = elite[0] ?? quality[0] ?? pool[0];
  if (!winner) return [];
  return [winner, ...pool.filter((p) => p.id !== winner.id)].slice(0, limit);
}

export function getBallonDor(
  players = getPlayers(loadSave() ?? undefined),
  save = loadSave(),
  ranking?: BallonDorCandidate[],
): SeasonAward {
  if (!save) return { player: null, score: 0, label: "Balón de Oro", detail: "Sin partida activa", provisional: true };
  const top = (ranking ?? getBallonDorRanking(30, players, save))[0];
  return {
    player: top ?? null,
    score: round(top?.points ?? 0),
    label: "Balón de Oro",
    detail: top
      ? `${round(top.averageRating, 2)} de media · ${top.seasonMVPs} MVP · ${top.titles} títulos · ${top.uclGoals + top.uclAssists} G+A en Champions${top.uclFinalMvp ? " · MVP de la final" : ""}`
      : "Necesita una muestra suficiente de partidos.",
    provisional: !seasonIsComplete(save),
  };
}

export function getGoldenBoy(players = getPlayers(loadSave() ?? undefined), save = loadSave()): SeasonAward {
  if (!save) return { player: null, score: 0, label: "Golden Boy", detail: "Sin partida activa", provisional: true };
  const candidates = players
    .filter((p) => p.age <= 21 && p.seasonAppearances >= 5 && (p.rating >= 75 || p.potential >= 85) && isEuropeanTopFlight(p.leagueId))
    .map((p) => ({
      p,
      score:
        (p.averageRating - 6) * 28 +
        (p.seasonGoals + p.seasonAssists) * 1.2 +
        p.seasonMVPs * 2.5 +
        Math.min(12, p.seasonAppearances * 0.18) +
        p.titles * 3 +
        Math.max(0, p.potential - 82) * 0.18,
    }))
    .sort((a, b) => b.score - a.score || b.p.averageRating - a.p.averageRating || b.p.currentOVR - a.p.currentOVR);
  const top = candidates[0];
  return {
    player: top?.p ?? null,
    score: round(top?.score ?? 0),
    label: "Golden Boy",
    detail: top ? `Sub-21 europeo · ${round(top.p.averageRating, 2)} de media · ${top.p.seasonGoals + top.p.seasonAssists} G+A` : "Sin candidato con muestra suficiente.",
    provisional: !seasonIsComplete(save),
  };
}

export function getGoldenShoe(players = getPlayers(loadSave() ?? undefined), save = loadSave()): { award: SeasonAward; leaderboard: GoldenShoeCandidate[] } {
  if (!save) {
    return {
      award: { player: null, score: 0, label: "Bota de Oro", detail: "Sin partida activa", provisional: true },
      leaderboard: [],
    };
  }
  const leaderboard = players
    .filter((p) => p.leagueAppearances > 0 && p.leagueGoals > 0)
    .map((p) => ({ ...p, points: p.leagueGoals * p.leagueMultiplier }))
    .sort((a, b) => b.points - a.points || b.leagueGoals - a.leagueGoals || b.averageRating - a.averageRating || a.leagueAppearances - b.leagueAppearances);
  const top = leaderboard[0];
  return {
    award: {
      player: top ?? null,
      score: top?.points ?? 0,
      label: "Bota de Oro",
      detail: top ? `${top.leagueGoals} goles de liga × ${top.leagueMultiplier} = ${round(top.points, 1)} puntos` : "Sin datos de liga.",
      provisional: !seasonIsComplete(save),
    },
    leaderboard: leaderboard.slice(0, 30),
  };
}

export function getGoldenPass(players = getPlayers(loadSave() ?? undefined), save = loadSave()): { award: SeasonAward; leaderboard: GoldenPassCandidate[] } {
  if (!save) {
    return {
      award: { player: null, score: 0, label: "Pase de Oro", detail: "Sin partida activa", provisional: true },
      leaderboard: [],
    };
  }
  const leaderboard = players
    .filter((p) => p.leagueAppearances > 0 && p.leagueAssists > 0)
    .map((p) => ({ ...p, points: p.leagueAssists * p.leagueMultiplier }))
    .sort((a, b) => b.points - a.points || b.leagueAssists - a.leagueAssists || b.averageRating - a.averageRating || a.leagueAppearances - b.leagueAppearances);
  const top = leaderboard[0];
  return {
    award: {
      player: top ?? null,
      score: top?.points ?? 0,
      label: "Pase de Oro",
      detail: top ? `${top.leagueAssists} asistencias de liga × ${top.leagueMultiplier} = ${round(top.points, 1)} puntos` : "Sin datos de liga.",
      provisional: !seasonIsComplete(save),
    },
    leaderboard: leaderboard.slice(0, 30),
  };
}

export function getGoldenGlove(players = getPlayers(loadSave() ?? undefined), save = loadSave()): SeasonAward {
  if (!save) return { player: null, score: 0, label: "Guante de Oro", detail: "Sin partida activa", provisional: true };
  const candidates = players
    .filter((p) => isGoalkeeper(p) && p.leagueAppearances > 0)
    .sort((a, b) => b.leagueCleanSheets - a.leagueCleanSheets || b.leagueAppearances - a.leagueAppearances || b.averageRating - a.averageRating);
  const top = candidates[0];
  return {
    player: top ?? null,
    score: top?.leagueCleanSheets ?? 0,
    label: "Guante de Oro",
    detail: top ? `${top.leagueCleanSheets} porterías a cero · ${top.leagueAppearances} partidos de liga` : "Sin porteros con partidos de liga.",
    provisional: !seasonIsComplete(save),
  };
}

function europeanProgressBonus(save: SaveGame, teamId: string, competition: "ucl" | "uel" | "uecl"): number {
  const fixtures = europeanFixtures(save, competition).filter((fixture) => fixture.result && (fixture.homeId === teamId || fixture.awayId === teamId));
  if (!fixtures.length) return 0;
  const ranks = fixtures.map((fixture) => {
    const round = String(fixture.round ?? "");
    if (round === "Final") return 10;
    if (round.includes("SF")) return 8;
    if (round.includes("QF")) return 6;
    if (round.includes("R16")) return 4.5;
    if (round === "Playoff") return 3;
    return 1.5;
  });
  return Math.max(...ranks);
}

function playerEuropeanScore(save: SaveGame, p: AwardPlayer, competition: "ucl" | "uel" | "uecl"): number {
  const appearances = competition === "ucl" ? p.uclAppearances : competition === "uel" ? p.uelAppearances : p.ueclAppearances;
  if (appearances <= 0) return -Infinity;
  const goals = competition === "ucl" ? p.uclGoals : competition === "uel" ? p.uelGoals : p.ueclGoals;
  const assists = competition === "ucl" ? p.uclAssists : competition === "uel" ? p.uelAssists : p.ueclAssists;
  const motm = competition === "ucl" ? p.uclMotm : competition === "uel" ? p.uelMotm : p.ueclMotm;
  const cleanSheets = competition === "ucl" ? p.uclCleanSheets : competition === "uel" ? p.uelCleanSheets : p.ueclCleanSheets;
  const stageScore = competition === "ucl" ? p.uclStageScore : competition === "uel" ? p.uelStageScore : p.ueclStageScore;
  const decisive = competition === "ucl" ? p.uclDecisiveScore : competition === "uel" ? p.uelDecisiveScore : p.ueclDecisiveScore;
  const finalMvp = competition === "ucl" ? p.uclFinalMvp : competition === "uel" ? p.uelFinalMvp : p.ueclFinalMvp;
  const champion = competition === "ucl" ? p.uclChampion : competition === "uel" ? p.uelChampion : p.ueclChampion;

  const progressBonus = europeanProgressBonus(save, p.teamId, competition);
  return (
    (p.averageRating - 6.15) * 28 +
    goals * 3.15 +
    assists * 1.9 +
    motm * 4.4 +
    cleanSheets * (isGoalkeeper(p) ? 2.7 : 0.45) +
    appearances * 0.3 +
    progressBonus * 1.6 +
    decisive * 0.9 +
    (champion ? 4 : 0) +
    (finalMvp ? 5 : 0)
  );
}

function playerUclScore(save: SaveGame, p: AwardPlayer): number {
  return playerEuropeanScore(save, p, "ucl");
}

export function getEuropeanRanking(competition: "ucl" | "uel" | "uecl", limit = 25, players = getPlayers(loadSave() ?? undefined), save = loadSave()): ChampionsRankingEntry[] {
  if (!save) return [];
  return players
    .filter((p) => (competition === "ucl" ? p.uclAppearances : competition === "uel" ? p.uelAppearances : p.ueclAppearances) > 0)
    .map((p) => ({ ...p, points: playerEuropeanScore(save, p, competition) }))
    .sort((a, b) => b.points - a.points || b.averageRating - a.averageRating || b.currentOVR - a.currentOVR)
    .slice(0, limit);
}

export function getChampionsRanking(limit = 25, players = getPlayers(loadSave() ?? undefined), save = loadSave()): ChampionsRankingEntry[] {
  return getEuropeanRanking("ucl", limit, players, save);
}

function europeanBestPlayer(competition: "ucl" | "uel" | "uecl", label: string, players = getPlayers(loadSave() ?? undefined), save = loadSave(), ranking?: ChampionsRankingEntry[]): SeasonAward {
  if (!save) return { player: null, score: 0, label, detail: "Sin partida activa", provisional: true };
  const top = (ranking ?? getEuropeanRanking(competition, 25, players, save))[0];
  if (!top) return { player: null, score: 0, label, detail: "Sin datos de competición.", provisional: true };
  const goals = competition === "ucl" ? top.uclGoals : competition === "uel" ? top.uelGoals : top.ueclGoals;
  const assists = competition === "ucl" ? top.uclAssists : competition === "uel" ? top.uelAssists : top.ueclAssists;
  const motm = competition === "ucl" ? top.uclMotm : competition === "uel" ? top.uelMotm : top.ueclMotm;
  const finalMvp = competition === "ucl" ? top.uclFinalMvp : competition === "uel" ? top.uelFinalMvp : top.ueclFinalMvp;
  const champion = competition === "ucl" ? top.uclChampion : competition === "uel" ? top.uelChampion : top.ueclChampion;
  return {
    player: top,
    score: round(top.points),
    label,
    detail: `${goals} goles · ${assists} asistencias · ${motm} MVP · ${round(top.averageRating, 2)} de media${champion ? " · Campeón" : ""}${finalMvp ? " · MVP de la final" : ""}`,
    provisional: !seasonIsComplete(save) || !champion,
  };
}

export function getChampionsBestPlayer(players = getPlayers(loadSave() ?? undefined), save = loadSave(), ranking?: ChampionsRankingEntry[]): SeasonAward {
  return europeanBestPlayer("ucl", "Mejor jugador Champions", players, save, ranking);
}

export function getEuropaLeagueRanking(limit = 25, players = getPlayers(loadSave() ?? undefined), save = loadSave()): ChampionsRankingEntry[] {
  return getEuropeanRanking("uel", limit, players, save);
}

export function getEuropaLeagueBestPlayer(players = getPlayers(loadSave() ?? undefined), save = loadSave(), ranking?: ChampionsRankingEntry[]): SeasonAward {
  return europeanBestPlayer("uel", "Mejor jugador Europa League", players, save, ranking);
}

export function getConferenceLeagueRanking(limit = 25, players = getPlayers(loadSave() ?? undefined), save = loadSave()): ChampionsRankingEntry[] {
  return getEuropeanRanking("uecl", limit, players, save);
}

export function getConferenceLeagueBestPlayer(players = getPlayers(loadSave() ?? undefined), save = loadSave(), ranking?: ChampionsRankingEntry[]): SeasonAward {
  return europeanBestPlayer("uecl", "Mejor jugador Conference League", players, save, ranking);
}

function competitionScore(p: AwardPlayer, competition: "season" | "ucl" | "uel" | "uecl", monthlyById?: Map<string, MonthlyStats>, save?: SaveGame): number {
  const group = positionGroup(p);
  if ((competition === "ucl" || competition === "uel" || competition === "uecl") && save) return playerEuropeanScore(save, p, competition);
  if (monthlyById?.has(p.id)) return monthlyPerformanceScore(monthlyById.get(p.id)!, p);
  return (
    (p.averageRating - 6.2) * 30 +
    p.seasonGoals * (group === "GK" ? 0.35 : 1.35) +
    p.seasonAssists * 0.95 +
    p.seasonMVPs * 3.0 +
    p.seasonCleanSheets * (group === "GK" ? 2.8 : 0.6) +
    Math.min(16, p.seasonAppearances * 0.28) +
    p.titles * 2
  );
}

function monthlyPerformanceScore(month: MonthlyStats, player: AwardPlayer): number {
  const rating = month.ratingCount ? (month.ratingTotal ?? 0) / month.ratingCount : month.averageRating ?? 6;
  return (
    (rating - 6.2) * 31 +
    month.goals * (positionGroup(player) === "GK" ? 0.7 : 2.2) +
    month.assists * 1.55 +
    month.mvpCount * 4.1 +
    month.cleanSheets * (isGoalkeeper(player) ? 3.5 : 0.65) +
    month.appearances * 0.45
  );
}

function slotSuitability(
  player: AwardPlayer,
  slot: "GK" | "LB" | "CB" | "RB" | "CM" | "CAM" | "LW" | "ST" | "RW",
): number {
  if (slot === "GK") return hasPosition(player, ["GK", "POR"]) ? 80 : -1000;
  if (slot === "LB") return hasPosition(player, ["LI", "LB", "LWB"]) ? 80 : -1000;
  if (slot === "CB") return hasPosition(player, ["DFC", "CB"]) ? 80 : -1000;
  if (slot === "RB") return hasPosition(player, ["LD", "RB", "RWB"]) ? 80 : -1000;
  if (slot === "CM") return hasPosition(player, ["MC", "CM"]) ? 80 : -1000;
  if (slot === "CAM") return hasPosition(player, ["MCO", "CAM"]) ? 90 : -1000;
  if (slot === "LW") return hasPosition(player, ["EI", "LW"]) ? 80 : -1000;
  if (slot === "RW") return hasPosition(player, ["ED", "RW"]) ? 80 : -1000;
  return hasPosition(player, ["DC", "ST", "CF"]) ? 90 : -1000;
}

function buildXI(
  candidates: AwardPlayer[],
  competition: "season" | "ucl" | "uel" | "uecl",
  monthlyById?: Map<string, MonthlyStats>,
  save?: SaveGame,
): AwardPlayer[] {
  const slots: Array<"GK" | "LB" | "CB" | "RB" | "CM" | "CAM" | "LW" | "ST" | "RW"> = [
    "GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW",
  ];

  const scored = new Map<string, number>();
  for (const player of candidates) scored.set(player.id, competitionScore(player, competition, monthlyById, save));

  // Resolver las 11 posiciones como una asignación global evita que una elección
  // temprana para una posición flexible consuma al único candidato válido de otra.
  const validPlayers = [...new Map(candidates.filter((player) => Number.isFinite(scored.get(player.id))).map((player) => [player.id, player])).values()];
  if (validPlayers.length < slots.length) return [];

  const suitability = slots.map((slot) => validPlayers.map((player) => slotSuitability(player, slot)));
  const validScores = validPlayers.flatMap((player, playerIndex) =>
    slots.map((_, slotIndex) => suitability[slotIndex][playerIndex] > 0 ? scored.get(player.id)! + (suitability[slotIndex][playerIndex] - 80) * 0.01 : -Infinity),
  ).filter(Number.isFinite);
  if (validScores.length < slots.length) return [];
  const maxScore = validScores.reduce((max, score) => Math.max(max, score), -Infinity);
  const invalidCost = 1e8;
  const costs = slots.map((_, slotIndex) => validPlayers.map((player, playerIndex) => {
    const fit = suitability[slotIndex][playerIndex];
    if (fit <= 0) return invalidCost;
    const score = scored.get(player.id)! + (fit - 80) * 0.01;
    return maxScore - score;
  }));

  // Algoritmo húngaro rectangular (11 puestos x N jugadores), minimizando coste.
  const rowCount = slots.length;
  const colCount = validPlayers.length;
  const u = new Array(rowCount + 1).fill(0);
  const v = new Array(colCount + 1).fill(0);
  const matchedRow = new Array(colCount + 1).fill(0);
  const previousCol = new Array(colCount + 1).fill(0);
  for (let row = 1; row <= rowCount; row++) {
    matchedRow[0] = row;
    let col0 = 0;
    const minCost = new Array(colCount + 1).fill(Infinity);
    const used = new Array(colCount + 1).fill(false);
    do {
      used[col0] = true;
      const row0 = matchedRow[col0];
      let delta = Infinity;
      let col1 = 0;
      for (let col = 1; col <= colCount; col++) {
        if (used[col]) continue;
        const reduced = costs[row0 - 1][col - 1] - u[row0] - v[col];
        if (reduced < minCost[col]) {
          minCost[col] = reduced;
          previousCol[col] = col0;
        }
        if (minCost[col] < delta) {
          delta = minCost[col];
          col1 = col;
        }
      }
      if (!Number.isFinite(delta)) return [];
      for (let col = 0; col <= colCount; col++) {
        if (used[col]) {
          u[matchedRow[col]] += delta;
          v[col] -= delta;
        } else {
          minCost[col] -= delta;
        }
      }
      col0 = col1;
    } while (matchedRow[col0] !== 0);
    do {
      const col1 = previousCol[col0];
      matchedRow[col0] = matchedRow[col1];
      col0 = col1;
    } while (col0 !== 0);
  }

  const assignment = new Array<AwardPlayer | null>(rowCount).fill(null);
  for (let col = 1; col <= colCount; col++) {
    if (matchedRow[col] > 0) assignment[matchedRow[col] - 1] = validPlayers[col - 1];
  }
  if (assignment.some((player, slotIndex) => !player || suitability[slotIndex][validPlayers.findIndex((candidate) => candidate.id === player.id)] <= 0)) return [];
  return assignment as AwardPlayer[];
}

export function getSeasonXI(players = getPlayers(loadSave() ?? undefined), save = loadSave()): SeasonXI {
  return buildXI(players.filter((p) => p.seasonAppearances >= 5), "season", undefined, save ?? undefined);
}

function getEuropeanXI(competition: "ucl" | "uel" | "uecl", players = getPlayers(loadSave() ?? undefined), save = loadSave()): SeasonXI {
  // Una sola aparición no basta para representar una competición en el XI.
  const minApps = 3;
  const candidates = players.filter((p) => (competition === "ucl" ? p.uclAppearances : competition === "uel" ? p.uelAppearances : p.ueclAppearances) >= minApps);
  return buildXI(candidates, competition, undefined, save ?? undefined);
}

export function getChampionsXI(players = getPlayers(loadSave() ?? undefined), save = loadSave()): SeasonXI {
  return getEuropeanXI("ucl", players, save);
}

export function getEuropaLeagueXI(players = getPlayers(loadSave() ?? undefined), save = loadSave()): SeasonXI {
  return getEuropeanXI("uel", players, save);
}

export function getConferenceLeagueXI(players = getPlayers(loadSave() ?? undefined), save = loadSave()): SeasonXI {
  return getEuropeanXI("uecl", players, save);
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function currentMonthKey(): { year: number; month: number } {
  const date = usePlayersStore.getState().currentDate;
  const parsed = (date || new Date().toISOString().slice(0, 10)).split("-").map(Number);
  const year = parsed[0] || new Date().getFullYear();
  const month = Math.max(0, (parsed[1] || 1) - 1);
  return { year, month };
}

function seasonStartYear(save: SaveGame): number {
  const parsed = Number(String(save.season ?? "").slice(0, 4));
  return Number.isFinite(parsed) && parsed >= 2000 ? parsed : 2026;
}

function shiftFixtureDateToSeason(isoDate: string, save: SaveGame): string {
  const targetYear = seasonStartYear(save);
  const baseSeasonYear = 2026;
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCFullYear(date.getUTCFullYear() + (targetYear - baseSeasonYear));
  return date.toISOString().slice(0, 10);
}

function monthlyEntriesForPlayer(p: AwardPlayer, year: number, month: number): MonthlyStats | null {
  return p.stats.dynamicStats?.monthlyStats?.find((m) => m.year === year && m.month === month) ?? null;
}

function ensureMonthly(map: Map<string, MonthlyStats>, playerId: string, patch: Partial<MonthlyStats>): MonthlyStats {
  const existing = map.get(playerId) ?? {
    month: patch.month ?? 0,
    year: patch.year ?? 0,
    goals: 0,
    assists: 0,
    appearances: 0,
    averageRating: 6,
    mvpCount: 0,
    cleanSheets: 0,
    ratingTotal: 0,
    ratingCount: 0,
  };
  Object.assign(existing, patch);
  map.set(playerId, existing);
  return existing;
}

function deriveLeagueMonthlyStats(save: SaveGame, leagueId: LeagueId, year: number, month: number): Map<string, MonthlyStats> {
  const result = new Map<string, MonthlyStats>();
  const rawFixtures = save.fixtures?.[leagueId] ?? [];
  if (!rawFixtures.length) return result;
  const dateMap = assignFixtureDates(generateLeagueFixtures(leagueId));

  for (const fixture of rawFixtures) {
    if (!fixture.result) continue;
    const iso = dateMap.get(fixture.id);
    if (!iso) continue;
    const date = new Date(`${shiftFixtureDateToSeason(iso, save)}T12:00:00Z`);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month) continue;

    const r = fixture.result;
    const playerTeam = new Map<string, string>();
    for (const p of r.homeLineup ?? []) playerTeam.set(p.id, fixture.homeId);
    for (const p of r.awayLineup ?? []) playerTeam.set(p.id, fixture.awayId);

    for (const rating of r.ratings ?? []) {
      const player = usePlayersStore.getState().getSimPlayer(rating.playerId);
      const teamId = playerTeam.get(rating.playerId) ?? player?.teamId;
      if (!teamId) continue;
      const m = ensureMonthly(result, rating.playerId, { month, year, teamId });
      m.appearances += 1;
      m.ratingTotal = (m.ratingTotal ?? 0) + rating.rating;
      m.ratingCount = (m.ratingCount ?? 0) + 1;
      m.averageRating = m.ratingTotal / m.ratingCount;
    }

    for (const lineup of [r.homeLineup ?? [], r.awayLineup ?? []]) {
      for (const p of lineup) {
        if (result.has(p.id)) continue;
        ensureMonthly(result, p.id, { month, year, teamId: p.teamId }).appearances += 1;
      }
    }

    for (const event of [...(r.events ?? []), ...(r.extraTime?.events ?? [])]) {
      if (event.type === "own_goal") continue;
      if (event.type === "goal" || event.type === "penalty_goal" || event.type === "free_kick_goal") {
        const m = ensureMonthly(result, event.scorerId, { month, year, teamId: playerTeam.get(event.scorerId) });
        m.goals += 1;
        if (event.assistId) ensureMonthly(result, event.assistId, { month, year, teamId: playerTeam.get(event.assistId) }).assists += 1;
      }
    }

    if (r.mvp?.playerId) ensureMonthly(result, r.mvp.playerId, { month, year, teamId: playerTeam.get(r.mvp.playerId) }).mvpCount += 1;

    if ((r.awayGoals ?? 0) === 0) {
      const gk = (r.homeLineup ?? []).find((p) => positionGroup(p as AwardPlayer) === "GK");
      if (gk) ensureMonthly(result, gk.id, { month, year, teamId: fixture.homeId }).cleanSheets += 1;
    }
    if ((r.homeGoals ?? 0) === 0) {
      const gk = (r.awayLineup ?? []).find((p) => positionGroup(p as AwardPlayer) === "GK");
      if (gk) ensureMonthly(result, gk.id, { month, year, teamId: fixture.awayId }).cleanSheets += 1;
    }
  }

  return result;
}

function mergeMonthlyStats(persisted: MonthlyStats | null, derived: MonthlyStats | null, year: number, month: number): MonthlyStats | null {
  if (!persisted && !derived) return null;
  const p = persisted;
  const d = derived;
  const ratingTotal = Math.max(p?.ratingTotal ?? 0, d?.ratingTotal ?? 0);
  const ratingCount = Math.max(p?.ratingCount ?? 0, d?.ratingCount ?? 0);
  const averageRating = ratingCount > 0 ? ratingTotal / ratingCount : p?.averageRating ?? d?.averageRating ?? 6;
  return {
    month,
    year,
    goals: Math.max(p?.goals ?? 0, d?.goals ?? 0),
    assists: Math.max(p?.assists ?? 0, d?.assists ?? 0),
    appearances: Math.max(p?.appearances ?? 0, d?.appearances ?? 0),
    averageRating,
    mvpCount: Math.max(p?.mvpCount ?? 0, d?.mvpCount ?? 0),
    cleanSheets: Math.max(p?.cleanSheets ?? 0, d?.cleanSheets ?? 0),
    ratingTotal,
    ratingCount,
    teamId: p?.teamId ?? d?.teamId,
  };
}

function isMonthFinalized(year: number, month: number): boolean {
  const current = currentMonthKey();
  return year < current.year || (year === current.year && month < current.month);
}

export function getMonthlyAward(
  leagueId: LeagueId,
  year = currentMonthKey().year,
  month = currentMonthKey().month,
  players = getPlayers(),
  save = loadSave(),
): MonthlyAward {
  const leagueName = LEAGUES[leagueId]?.name ?? leagueId;

  // Monthly awards are published only once the calendar month has ended.
  if (!isMonthFinalized(year, month)) {
    return {
      month,
      year,
      label: monthLabel(year, month),
      leagueId,
      leagueName,
      player: null,
      xi: [],
      ranking: [],
      available: false,
      published: false,
    };
  }

  const derived = save ? deriveLeagueMonthlyStats(save, leagueId, year, month) : new Map<string, MonthlyStats>();
  const ranking: MonthlyRankingEntry[] = players
    .map((p) => {
      const persisted = monthlyEntriesForPlayer(p, year, month);
      const calculated = derived.get(p.id) ?? null;
      const m = mergeMonthlyStats(persisted, calculated, year, month);
      return m ? { p, m } : null;
    })
    .filter((x): x is { p: AwardPlayer; m: MonthlyStats } => !!x && x.m.appearances >= 3 && ((x.m.teamId ? teamById(x.m.teamId)?.league : x.p.leagueId) === leagueId))
    .map(({ p, m }) => ({ ...p, points: monthlyPerformanceScore(m, p), monthlyStats: m }))
    .sort((a, b) => b.points - a.points || b.monthlyStats.mvpCount - a.monthlyStats.mvpCount || b.monthlyStats.appearances - a.monthlyStats.appearances || b.averageRating - a.averageRating);

  const monthlyById = new Map(ranking.map((entry) => [entry.id, entry.monthlyStats]));
  const xi = buildXI(ranking, "season", monthlyById, save ?? undefined);
  return {
    month,
    year,
    label: monthLabel(year, month),
    leagueId,
    leagueName,
    player: ranking[0] ?? null,
    xi,
    ranking: ranking.slice(0, 20),
    available: ranking.length > 0,
    published: true,
  };
}

export function getMonthlyPeriods(leagueId?: LeagueId, players = getPlayers(), save = loadSave()): MonthlyPeriod[] {
  const periods = new Map<string, MonthlyPeriod>();
  const addPeriod = (year: number, month: number) => {
    // El selector solo debe ofrecer meses que ya han terminado. Así nunca
    // aparece el mes en curso ni meses futuros como si sus premios estuvieran
    // publicados.
    if (!Number.isFinite(year) || !Number.isFinite(month) || !isMonthFinalized(year, month)) return;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    periods.set(key, { year, month, label: monthLabel(year, month) });
  };

  // Conservamos los meses persistidos para partidas antiguas.
  for (const p of players) {
    for (const month of p.stats.dynamicStats?.monthlyStats ?? []) {
      if (month.appearances <= 0) continue;
      const monthLeague = month.teamId ? teamById(month.teamId)?.league : p.leagueId;
      if (leagueId && monthLeague !== leagueId) continue;
      addPeriod(month.year, month.month);
    }
  }

  // Y, de forma autoritativa, reconstruimos todos los meses que realmente
  // tuvieron partidos de liga ya disputados en la partida. Esto evita perder
  // meses cuando faltan snapshots mensuales en una partida antigua.
  if (save) {
    for (const currentLeagueId of ALL_LEAGUES) {
      if (leagueId && currentLeagueId !== leagueId) continue;
      const rawFixtures = save.fixtures?.[currentLeagueId] ?? [];
      if (!rawFixtures.length) continue;
      const dates = assignFixtureDates(generateLeagueFixtures(currentLeagueId));
      for (const fixture of rawFixtures) {
        if (!fixture.result) continue;
        // Prefer the actual date stored on the played fixture. Older saves may
        // not have it, so fall back to the scheduler and normalize that
        // generated date to the current season.
        const actualDate = typeof fixture.date === "string" && fixture.date.trim() ? fixture.date : null;
        const iso = actualDate ?? dates.get(fixture.id);
        if (!iso) continue;
        const normalizedIso = actualDate ? actualDate : shiftFixtureDateToSeason(iso, save);
        const date = new Date(`${normalizedIso}T12:00:00Z`);
        if (Number.isNaN(date.getTime())) continue;
        addPeriod(date.getUTCFullYear(), date.getUTCMonth());
      }
    }
  }

  return [...periods.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

export function getAllLeagueIds(): LeagueId[] {
  return ALL_LEAGUES.filter((league) => !!LEAGUES[league]);
}

export function getAwardsSnapshot(save = loadSave(), players = getPlayers(save ?? undefined)): AwardsSnapshot {
  if (!save) {
    const empty: SeasonAward = { player: null, score: 0, label: "Premio", detail: "Sin partida activa", provisional: true };
    return {
      ballon: { ...empty, label: "Balón de Oro" },
      ballonRanking: [],
      goldenBoy: { ...empty, label: "Golden Boy" },
      shoe: { award: { ...empty, label: "Bota de Oro" }, leaderboard: [] },
      pass: { award: { ...empty, label: "Pase de Oro" }, leaderboard: [] },
      glove: { ...empty, label: "Guante de Oro" },
      seasonXI: [],
      championsPlayer: { ...empty, label: "Mejor jugador Champions" },
      championsRanking: [],
      championsXI: [],
      europaLeaguePlayer: { ...empty, label: "Mejor jugador Europa League" },
      europaLeagueRanking: [],
      europaLeagueXI: [],
      conferenceLeaguePlayer: { ...empty, label: "Mejor jugador Conference League" },
      conferenceLeagueRanking: [],
      conferenceLeagueXI: [],
    };
  }

  const ballonRanking = getBallonDorRanking(30, players, save);
  const championsRanking = getChampionsRanking(25, players, save);
  const europaLeagueRanking = getEuropaLeagueRanking(25, players, save);
  const conferenceLeagueRanking = getConferenceLeagueRanking(25, players, save);
  return {
    ballon: getBallonDor(players, save, ballonRanking),
    ballonRanking,
    goldenBoy: getGoldenBoy(players, save),
    shoe: getGoldenShoe(players, save),
    pass: getGoldenPass(players, save),
    glove: getGoldenGlove(players, save),
    seasonXI: getSeasonXI(players, save),
    championsPlayer: getChampionsBestPlayer(players, save, championsRanking),
    championsRanking,
    championsXI: getChampionsXI(players, save),
    europaLeaguePlayer: getEuropaLeagueBestPlayer(players, save, europaLeagueRanking),
    europaLeagueRanking,
    europaLeagueXI: getEuropaLeagueXI(players, save),
    conferenceLeaguePlayer: getConferenceLeagueBestPlayer(players, save, conferenceLeagueRanking),
    conferenceLeagueRanking,
    conferenceLeagueXI: getConferenceLeagueXI(players, save),
  };
}

export function seasonIsComplete(save = loadSave()): boolean {
  if (!save) return false;
  const leagueComplete = ALL_LEAGUES.every((league) => (save.fixtures?.[league] ?? []).every((fixture) => !!fixture.result));
  const cupComplete = Object.values(save.cupFixtures ?? {}).flat().every((fixture) => !fixture || !!fixture.result);
  const europeanComplete = (fixtures: Fixture[], champion: string | null) => fixtures.length === 0 || champion != null || fixtures.every((fixture) => !!fixture.result);
  return leagueComplete && cupComplete &&
    europeanComplete(save.uclFixtures ?? [], save.uclChampion ?? null) &&
    europeanComplete(save.uelFixtures ?? [], save.uelChampion ?? null) &&
    europeanComplete(save.ueclFixtures ?? [], save.ueclChampion ?? null);
}

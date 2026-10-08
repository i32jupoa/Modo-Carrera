import { getCurrentSaveId } from "@/lib/savedGames";
import { teamById, getAllTeams, applyTeamRating, getLeagueTier, LEAGUES } from "@/data/teams";
import { computeTeamRatingFromSquad, finalizeTeamRating, type RatedSquadMember } from "@/lib/teamRating";
import { getClubProfile } from "@/lib/transfers/ClubStrategy";
import { analyzeSquad } from "@/lib/transfers/SquadAnalyzer";
import { getClubPlayers, registerDynamicMarketPlayer } from "@/lib/transfers/PlayerIndex";
import { registerDynamicPlayer, usePlayersStore } from "@/store/playersStore";
import { SQUAD_LIMITS } from "@/lib/transfers/constants";
import { seededInt } from "@/lib/transfers/random";
import type { PositionGroup, SquadNeed } from "@/lib/transfers/types";
import { DYNAMIC_BY_ID, recordAcademyPromotionEvent } from "./academyRuntime";
import { academyContract, academyMarketValue, academyPlayerToFcPlayer, academyPlayerToStats } from "./academyAdapters";
import { ACADEMY_LIMITS, ACADEMY_PROMOTION_LIMITS, ACADEMY_SCORE_WEIGHTS } from "./academyConstants";
import { generateAcademyState } from "./academyGenerator";
import { advanceAcademyToDate } from "./academyProgression";
import type { AcademyPlayer, ClubAcademyState } from "./academyTypes";

const academyCache = new Map<string, ClubAcademyState>();

function cacheKey(saveId: string, teamId: string, season: number): string {
  return `${saveId}|${teamId}|${season}`;
}

function seasonForDate(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month >= 7 ? year : year - 1;
}

function getState(saveId: string, teamId: string, season: number, date: string): ClubAcademyState {
  const key = cacheKey(saveId, teamId, season);
  const current = academyCache.get(key);
  if (current) {
    const advanced = advanceAcademyToDate(current, date, saveId);
    academyCache.set(key, advanced);
    return advanced;
  }
  const generated = generateAcademyState(saveId, teamId, season);
  const filtered = {
    ...generated,
    players: generated.players.filter((player) => !DYNAMIC_BY_ID.has(String(player.id))),
  };
  const advanced = advanceAcademyToDate(filtered, date, saveId);
  academyCache.set(key, advanced);
  return advanced;
}

function chooseByGroup(players: readonly AcademyPlayer[], group: PositionGroup, squadOvr: number, seed: string): AcademyPlayer | null {
  const candidates = players.filter((player) => {
    const p = player.positions[0];
    if (group === "GK") return p === "GK";
    if (group === "CB") return ["CB"].includes(p);
    if (group === "FB") return ["LB", "RB"].includes(p);
    if (group === "CM") return ["CM", "CAM", "CDM"].includes(p);
    if (group === "WING") return ["LW", "RW"].includes(p);
    return ["ST", "CF"].includes(p);
  });
  if (!candidates.length) return null;
  const ready = candidates.filter((player) => player.age >= 18);
  if (!ready.length) return null;
  return ready
    .slice()
    .sort((a, b) => {
      const score = (player: AcademyPlayer) => {
        const positionFit = 1;
        const ovrScore = 1 - Math.max(0, squadOvr - player.ovr) / 25;
        const potentialScore = player.potential / 88;
        const ageScore = 1 - Math.max(0, player.age - 18) / 5;
        return positionFit * ACADEMY_SCORE_WEIGHTS.positionFit + ovrScore * ACADEMY_SCORE_WEIGHTS.ovr + potentialScore * ACADEMY_SCORE_WEIGHTS.potential + ageScore * ACADEMY_SCORE_WEIGHTS.age;
      };
      return score(b) - score(a);
    })[seededInt(0, Math.min(2, ready.length - 1), seed, "pick")] ?? null;
}

function refreshTeamRating(teamId: string): void {
  const team = teamById(teamId);
  const squad = getClubPlayers(teamId);
  const rated: RatedSquadMember[] = squad.map((player) => ({
    rating: player.ovr,
    position: player.group === "GK" ? "GK" : player.group === "CB" || player.group === "FB" ? "DEF" : player.group === "ST" || player.group === "WING" ? "FWD" : "MID",
    age: player.age,
  }));
  applyTeamRating(teamId, finalizeTeamRating(computeTeamRatingFromSquad(rated), getLeagueTier(team.league)));
}

function promotePlayer(state: ClubAcademyState, player: AcademyPlayer, reason: string, date: string): AcademyPlayer {
  const team = teamById(player.teamId);
  const leagueName = LEAGUES[team.league]?.name ?? team.league;
  const fc = { ...academyPlayerToFcPlayer(player, team.name, leagueName), academyPromotionYear: Number(date.slice(0, 4)) || undefined };
  const contract = academyContract(player);
  const marketValue = academyMarketValue(player);
  registerDynamicPlayer(fc, academyPlayerToStats(player));
  DYNAMIC_BY_ID.set(String(fc.ID), fc);
  recordAcademyPromotionEvent({
    id: `academy-promotion:${player.teamId}:${player.id}:${date}`,
    date,
    playerId: player.id,
    playerName: player.name,
    teamId: player.teamId,
    reason,
    wasUserDecision: false,
  });
  registerDynamicMarketPlayer({
    id: String(fc.ID), name: fc.Name, age: fc.Age, ovr: fc.OVR, potential: fc.potential ?? fc.OVR,
    position: fc.Position, group: fc.Position === "GK" ? "GK" : ["CB"].includes(fc.Position) ? "CB" : ["LB", "RB"].includes(fc.Position) ? "FB" : ["ST", "CF"].includes(fc.Position) ? "ST" : ["LW", "RW"].includes(fc.Position) ? "WING" : "CM",
    nation: fc.Nation ?? "", clubId: team.id, leagueId: team.league, value: marketValue, contract,
    personality: { ambition: 0.62, loyalty: 0.82, greed: 0.18, playingTimeDesire: 0.8, adventure: 0.3 },
    transferListed: false, listReason: null, loanListed: false, loanClubId: null, loanOwnerClubId: null, loanEndDate: null, minutesShare: 0,
    attributes: { pace: fc.PAC, passing: fc.PAS, physical: fc.PHY, defending: fc.DEF },
    academyStatus: "promoted", academyParentClubId: team.id,
  });
  void reason;
  void date;
  return { ...player, status: "promoted", contractYearsLeft: contract.yearsLeft, promotedAt: { date, reason } };
}

export interface AcademyPromotionBatchResult {
  promoted: AcademyPlayer[];
  reasons: Record<string, string>;
}

export function promoteAcademyPlayersForClub(teamId: string, date: string, mode: "preseason" | "window" | "emergency" = "emergency"): AcademyPromotionBatchResult {
  const saveId = getCurrentSaveId();
  if (!saveId) return { promoted: [], reasons: {} };
  const userTeamId = usePlayersStore.getState().myTeamId;
  if (userTeamId === teamId) return { promoted: [], reasons: {} };
  const season = seasonForDate(date);
  let state = getState(saveId, teamId, season, date);
  // Fin de ciclo IA: los juveniles que llegan a 21 años sin promoción salen
  // de la cantera para dejar sitio a la nueva generación. El usuario conserva
  // el control manual y recibe avisos en su propia cantera.
  const cycleReady = state.players.filter((player) => player.status === "academy" && (player.age >= ACADEMY_LIMITS.retireFromAcademyAge || player.contractYearsLeft <= 0));
  if (cycleReady.length) {
    state = { ...state, players: state.players.filter((player) => !cycleReady.some((candidate) => candidate.id === player.id)) };
  }
  const team = teamById(teamId);
  const profile = getClubProfile(teamId);
  const report = analyzeSquad(teamId, `${date}:academy`);
  const capacity = Math.max(0, SQUAD_LIMITS.maxSquadSize - getClubPlayers(teamId).length);
  if (capacity <= 0) return { promoted: [], reasons: {} };

  const limit = mode === "preseason"
    ? Math.min(ACADEMY_PROMOTION_LIMITS.preSeasonMax, Math.max(ACADEMY_PROMOTION_LIMITS.preSeasonMin, Math.round(profile.academyFocus * 3)))
    : mode === "window" ? ACADEMY_PROMOTION_LIMITS.windowMax : ACADEMY_PROMOTION_LIMITS.emergencyMax;
  const chosen: AcademyPlayer[] = [];
  const reasons: Record<string, string> = {};

  const ready = state.players.filter((player) => player.status === "academy" && player.age >= 18 && !DYNAMIC_BY_ID.has(String(player.id)));
  if (!ready.length) return { promoted: [], reasons: {} };

  const needs = report.needs
    .slice()
    .sort((a, b) => b.urgency - a.urgency)
    .filter((need) => need.priority === "critical" || need.priority === "high");

  if (mode === "preseason") {
    ready
      .slice()
      .sort((a, b) => (b.ovr + b.potential * 0.15) - (a.ovr + a.potential * 0.15))
      .slice(0, limit)
      .forEach((player) => {
        chosen.push(player);
        reasons[String(player.id)] = "Promoción planificada de pretemporada";
      });
  } else {
    for (const need of needs) {
      if (chosen.length >= limit) break;
      if (capacity <= chosen.length) break;
      const candidate = chooseByGroup(ready.filter((p) => !chosen.some((x) => x.id === p.id)), need.group, report.startingRating, `${teamId}|${date}|${need.group}`);
      if (!candidate) continue;
      chosen.push(candidate);
      reasons[String(candidate.id)] = need.priority === "critical" ? `Cubre una necesidad crítica de ${need.group}` : `Cubre una necesidad alta de ${need.group}`;
    }
  }

  if (!chosen.length) return { promoted: [], reasons: {} };
  const promoted: AcademyPlayer[] = [];
  for (const candidate of chosen) {
    state = { ...state, players: state.players.filter((player) => player.id !== candidate.id) };
    const promotedPlayer = promotePlayer(state, candidate, reasons[String(candidate.id)] ?? "Promoción de cantera", date);
    promoted.push(promotedPlayer);
  }
  academyCache.set(cacheKey(saveId, teamId, season), state);
  refreshTeamRating(teamId);
  return { promoted, reasons };
}

export function promoteBestAcademySolutionForNeed(clubId: string, date: string, need: SquadNeed): boolean {
  const saveId = getCurrentSaveId();
  if (!saveId) return false;
  if (usePlayersStore.getState().myTeamId === clubId) return false;
  const season = seasonForDate(date);
  let state = getState(saveId, clubId, season, date);
  const profile = getClubProfile(clubId);
  if (profile.academyFocus < 0.55) return false;
  if (SQUAD_LIMITS.maxSquadSize <= getClubPlayers(clubId).length) return false;

  const report = analyzeSquad(clubId, `${date}:academy-internal:${need.group}`);
  const threshold = Math.max(40, report.startingRating - ACADEMY_LIMITS.promotionOvrGapToSquad);
  const candidate = chooseByGroup(
    state.players.filter((player) => !DYNAMIC_BY_ID.has(String(player.id))),
    need.group,
    report.startingRating,
    `${clubId}|${date}|internal|${need.group}`,
  );
  if (!candidate || candidate.ovr < threshold) return false;

  const reason = `Solución interna para una necesidad ${need.priority} de ${need.group}`;
  state = { ...state, players: state.players.filter((player) => player.id !== candidate.id) };
  promotePlayer(state, candidate, reason, date);
  academyCache.set(cacheKey(saveId, clubId, season), state);
  refreshTeamRating(clubId);
  return true;
}

export function runAcademyPreseasonPromotions(date: string): AcademyPromotionBatchResult {
  const saveId = getCurrentSaveId();
  if (!saveId) return { promoted: [], reasons: {} };
  const aggregate: AcademyPromotionBatchResult = { promoted: [], reasons: {} };
  for (const team of getAllTeams()) {
    const result = promoteAcademyPlayersForClub(team.id, date, "preseason");
    aggregate.promoted.push(...result.promoted);
    Object.assign(aggregate.reasons, result.reasons);
  }
  return aggregate;
}

export function runAcademyWindowPromotions(date: string): AcademyPromotionBatchResult {
  const aggregate: AcademyPromotionBatchResult = { promoted: [], reasons: {} };
  for (const team of getAllTeams()) {
    const result = promoteAcademyPlayersForClub(team.id, date, "window");
    aggregate.promoted.push(...result.promoted);
    Object.assign(aggregate.reasons, result.reasons);
  }
  return aggregate;
}

export function runAcademyEmergencyPromotion(teamId: string, date: string): AcademyPromotionBatchResult {
  return promoteAcademyPlayersForClub(teamId, date, "emergency");
}

import { getCurrentSaveId } from "@/lib/savedGames";
import { getAllTeams, LEAGUES, teamById } from "@/data/teams";
import { getClubProfile } from "@/lib/transfers/ClubStrategy";
import { getAcademyPromotionEvents, DYNAMIC_BY_ID } from "./academyRuntime";
import { generateAcademyState } from "./academyGenerator";
import type { AcademyPlayer } from "./academyTypes";

export interface AcademyClubRankingEntry {
  teamId: string;
  teamName: string;
  leagueId: string;
  leagueName: string;
  country: string;
  facilityLevel: 1 | 2 | 3 | 4 | 5;
  academyFocus: number;
  academyScore: number;
  prospectCount: number;
  averageOvr: number;
  bestPotential: number;
  bestProspect: AcademyPlayer | null;
}

export interface AcademyProspectRankingEntry {
  player: AcademyPlayer;
  teamName: string;
  leagueName: string;
  country: string;
  score: number;
}

export interface AcademyHallOfFameEntry {
  playerId: number;
  playerName: string;
  teamId: string;
  teamName: string;
  date: string;
  detail: string;
}

function academyStateFor(teamId: string, saveId: string, season: number, date: string) {
  const generated = generateAcademyState(saveId, teamId, season);
  return {
    ...generated,
    players: generated.players.filter((player) => !DYNAMIC_BY_ID.has(String(player.id))),
  };
}

function seasonFromDate(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month >= 7 ? year : year - 1;
}

function playerScore(player: AcademyPlayer): number {
  const ageBonus = Math.max(0, 21 - player.age) * 0.8;
  const visiblePotential = player.potentialEstimate.max;
  const gap = Math.max(0, visiblePotential - player.ovr);
  const traitBonus = player.traits.includes("diamond") ? 3.5 : player.traits.includes("hard-worker") ? 1.5 : 0;
  return player.ovr * 0.9 + visiblePotential * 0.95 + gap * 0.35 + ageBonus + traitBonus;
}

export function getAcademyClubRanking(date: string, limit = 20): AcademyClubRankingEntry[] {
  const saveId = getCurrentSaveId();
  if (!saveId) return [];
  const season = seasonFromDate(date);
  return getAllTeams()
    .map((team) => {
      const state = academyStateFor(team.id, saveId, season, date);
      const profile = getClubProfile(team.id);
      const candidates = state.players.slice().sort((a, b) => playerScore(b) - playerScore(a));
      const averageOvr = candidates.length ? candidates.reduce((sum, p) => sum + p.ovr, 0) / candidates.length : 0;
      const prospectCount = candidates.filter((p) => p.potentialEstimate.max >= 75 && p.age <= 19).length;
      const bestProspect = candidates[0] ?? null;
      const score = (
        profile.academyFocus * 42
        + state.facilityLevel * 7
        + averageOvr * 0.36
        + prospectCount * 2.2
        + (bestProspect?.potentialEstimate.max ?? 0) * 0.12
      );
      return {
        teamId: team.id,
        teamName: team.name,
        leagueId: team.league,
        leagueName: LEAGUES[team.league]?.name ?? team.league,
        country: profile.country,
        facilityLevel: state.facilityLevel,
        academyFocus: profile.academyFocus,
        academyScore: Number(score.toFixed(1)),
        prospectCount,
        averageOvr: Number(averageOvr.toFixed(1)),
        bestPotential: bestProspect?.potentialEstimate.max ?? 0,
        bestProspect,
      } satisfies AcademyClubRankingEntry;
    })
    .sort((a, b) => b.academyScore - a.academyScore)
    .slice(0, limit);
}

export function getAcademyProspectRanking(date: string, limit = 30): AcademyProspectRankingEntry[] {
  const saveId = getCurrentSaveId();
  if (!saveId) return [];
  const season = seasonFromDate(date);
  const out: AcademyProspectRankingEntry[] = [];
  for (const team of getAllTeams()) {
    const state = academyStateFor(team.id, saveId, season, date);
    const profile = getClubProfile(team.id);
    for (const player of state.players) {
      if (player.age > 21) continue;
      const score = playerScore(player) + profile.academyFocus * 8;
      out.push({
        player,
        teamName: team.name,
        leagueName: LEAGUES[team.league]?.name ?? team.league,
        country: profile.country,
        score: Number(score.toFixed(1)),
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getAcademyHighlightsForClub(teamId: string, date: string, limit = 5): AcademyPlayer[] {
  const saveId = getCurrentSaveId();
  if (!saveId) return [];
  const season = seasonFromDate(date);
  return academyStateFor(teamId, saveId, season, date).players
    .slice()
    .sort((a, b) => playerScore(b) - playerScore(a))
    .slice(0, limit);
}

export function getAcademyHallOfFame(limit = 20): AcademyHallOfFameEntry[] {
  return getAcademyPromotionEvents()
    .filter((event) => event.wasUserDecision || DYNAMIC_BY_ID.has(String(event.playerId)))
    .map((event) => {
      const team = teamById(event.teamId);
      return {
        playerId: event.playerId,
        playerName: event.playerName,
        teamId: event.teamId,
        teamName: team.name,
        date: event.date,
        detail: event.reason,
      };
    })
    .slice(0, limit);
}

export function getAcademySeasonAward(date: string): AcademyProspectRankingEntry | null {
  const ranking = getAcademyProspectRanking(date, 50);
  return ranking[0] ?? null;
}

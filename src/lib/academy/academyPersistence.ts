import { getCurrentSaveId } from "@/lib/savedGames";
import { idbGetItem, idbRemoveItem, idbSetItem } from "@/lib/transfers/marketIdb";
import { createEmptyAcademySeasonStats } from "./academyTypes";
import { toPosCode } from "@/lib/positions";
import type { AcademyMonthlyStats, AcademySeasonStats, AcademyPlayer, ClubAcademyState } from "./academyTypes";

export const ACADEMY_STATE_VERSION = 4;
const PREFIX = "fcsim:academy:v1";

export interface AcademySaveData {
  version: number;
  savedAt: string;
  userTeamId: string | null;
  clubs: Record<string, ClubAcademyState>;
}

function key(saveId = getCurrentSaveId()): string | null {
  return saveId ? `${PREFIX}:${saveId}` : null;
}

function normalizeMonthlyStats(value: unknown): AcademyMonthlyStats[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => {
      const ratingTotal = Number(entry.ratingTotal) || 0;
      const ratingCount = Number(entry.ratingCount) || 0;
      return {
        month: Math.max(1, Math.min(12, Number(entry.month) || 1)),
        year: Number(entry.year) || 2026,
        appearances: Math.max(0, Number(entry.appearances) || 0),
        minutes: Math.max(0, Number(entry.minutes) || 0),
        goals: Math.max(0, Number(entry.goals) || 0),
        assists: Math.max(0, Number(entry.assists) || 0),
        cleanSheets: Math.max(0, Number(entry.cleanSheets) || 0),
        yellowCards: Math.max(0, Number(entry.yellowCards) || 0),
        redCards: Math.max(0, Number(entry.redCards) || 0),
        ratingTotal,
        ratingCount,
        averageRating: ratingCount > 0 ? ratingTotal / ratingCount : 0,
        ovr: Number.isFinite(Number(entry.ovr)) ? Number(entry.ovr) : undefined,
      };
    });
}

function normalizeSeasonStats(value: unknown, season: number): AcademySeasonStats {
  const fallback = createEmptyAcademySeasonStats(season);
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const ratingTotal = Number(raw.ratingTotal) || 0;
  const ratingCount = Number(raw.ratingCount) || 0;
  return {
    ...fallback,
    season: Number(raw.season) || season,
    appearances: Math.max(0, Number(raw.appearances) || 0),
    minutes: Math.max(0, Number(raw.minutes) || 0),
    goals: Math.max(0, Number(raw.goals) || 0),
    assists: Math.max(0, Number(raw.assists) || 0),
    cleanSheets: Math.max(0, Number(raw.cleanSheets) || 0),
    yellowCards: Math.max(0, Number(raw.yellowCards) || 0),
    redCards: Math.max(0, Number(raw.redCards) || 0),
    ratingTotal,
    ratingCount,
    averageRating: ratingCount > 0 ? ratingTotal / ratingCount : 0,
    startingOvr: Number.isFinite(Number(raw.startingOvr)) ? Math.round(Number(raw.startingOvr)) : undefined,
    formHistory: Array.isArray(raw.formHistory) ? raw.formHistory.map(Number).filter(Number.isFinite).slice(-10) : [],
    monthlyStats: normalizeMonthlyStats(raw.monthlyStats),
    lastMatchDate: typeof raw.lastMatchDate === "string" ? raw.lastMatchDate : undefined,
    lastOpponent: typeof raw.lastOpponent === "string" ? raw.lastOpponent : undefined,
  };
}

function normalizePlayer(player: AcademyPlayer, season: number): AcademyPlayer {
  const rawPositions = Array.isArray(player.positions) ? player.positions : [];
  const positions = rawPositions
    .map((position) => toPosCode(String(position)))
    .filter((position): position is NonNullable<ReturnType<typeof toPosCode>> => Boolean(position));
  const finalPositions = positions.length ? positions : ["MC"];
  const normalizedStats = normalizeSeasonStats(player.academyStats, season);
  const rawInternalOvr = Number(player.internalOvr);
  const latestRecordedOvr = normalizedStats.monthlyStats
    .slice()
    .reverse()
    .find((entry) => Number.isFinite(Number(entry.ovr)))?.ovr;
  const internalOvr = Number.isFinite(rawInternalOvr)
    ? rawInternalOvr
    : Number.isFinite(Number(latestRecordedOvr))
      ? Number(latestRecordedOvr)
      : Number(player.ovr) || 0;
  const normalizedOvr = Math.round(internalOvr);
  return {
    ...player,
    positions: finalPositions,
    internalOvr,
    ovr: normalizedOvr,
    potential: Math.round(Number(player.potential) || normalizedOvr),
    minutesThisSeason: Math.max(0, Math.round(Number(player.minutesThisSeason) || 0)),
    academyStats: { ...normalizedStats, startingOvr: normalizedStats.startingOvr || normalizedOvr },
    academyCareerSeasons: Array.isArray(player.academyCareerSeasons) ? player.academyCareerSeasons.slice(-10) : [],
    loanReports: player.loanReports ?? [],
  };
}

function normalizeClub(club: ClubAcademyState): ClubAcademyState {
  const season = Number(club.lastIntakeSeason) || 2026;
  return {
    ...club,
    players: (club.players ?? []).map((player) => normalizePlayer(player, season)),
    mentorAssignments: club.mentorAssignments ?? {},
    history: club.history ?? [],
    manualPromotionAvailable: club.manualPromotionAvailable ?? true,
    lastProgressionDate: club.lastProgressionDate ?? `${season}-07-01`,
    lastAcademyMatchDate: club.lastAcademyMatchDate ?? club.lastProgressionDate ?? `${season}-07-01`,
  };
}

export async function loadAcademySave(saveId = getCurrentSaveId()): Promise<AcademySaveData | null> {
  const storageKey = key(saveId);
  if (!storageKey) return null;
  const value = await idbGetItem(storageKey);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as AcademySaveData;
    if (!parsed || typeof parsed !== "object" || !parsed.clubs) return null;
    const clubs = Object.fromEntries(
      Object.entries(parsed.clubs).map(([teamId, club]) => [teamId, normalizeClub(club)]),
    );
    return { ...parsed, clubs, version: ACADEMY_STATE_VERSION };
  } catch {
    return null;
  }
}

export async function saveAcademySave(data: AcademySaveData, saveId = getCurrentSaveId()): Promise<boolean> {
  const storageKey = key(saveId);
  if (!storageKey) return false;
  try {
    return await idbSetItem(storageKey, JSON.stringify({
      ...data,
      version: ACADEMY_STATE_VERSION,
      savedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error("No se pudo guardar la cantera:", error);
    return false;
  }
}

export async function clearAcademySave(saveId = getCurrentSaveId()): Promise<void> {
  const storageKey = key(saveId);
  if (storageKey) await idbRemoveItem(storageKey);
}

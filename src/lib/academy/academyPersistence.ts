import { getCurrentSaveId } from "@/lib/savedGames";
import { idbGetItem, idbRemoveItem, idbSetItem } from "@/lib/transfers/marketIdb";
import type { ClubAcademyState } from "./academyTypes";

export const ACADEMY_STATE_VERSION = 2;
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

export async function loadAcademySave(saveId = getCurrentSaveId()): Promise<AcademySaveData | null> {
  const storageKey = key(saveId);
  if (!storageKey) return null;
  const value = await idbGetItem(storageKey);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as AcademySaveData;
    if (!parsed || typeof parsed !== "object" || !parsed.clubs) return null;
    const clubs = Object.fromEntries(Object.entries(parsed.clubs).map(([teamId, club]) => [teamId, {
      ...club,
      mentorAssignments: club.mentorAssignments ?? {},
      history: club.history ?? [],
      manualPromotionAvailable: club.manualPromotionAvailable ?? true,
      players: (club.players ?? []).map((player) => ({ ...player, loanReports: player.loanReports ?? [] })),
    }]));
    return { ...parsed, clubs, version: ACADEMY_STATE_VERSION };
  } catch {
    return null;
  }
}

export async function saveAcademySave(data: AcademySaveData, saveId = getCurrentSaveId()): Promise<boolean> {
  const storageKey = key(saveId);
  if (!storageKey) return false;
  try {
    return await idbSetItem(storageKey, JSON.stringify({ ...data, version: ACADEMY_STATE_VERSION, savedAt: new Date().toISOString() }));
  } catch (error) {
    console.error("No se pudo guardar la cantera:", error);
    return false;
  }
}

export async function clearAcademySave(saveId = getCurrentSaveId()): Promise<void> {
  const storageKey = key(saveId);
  if (storageKey) await idbRemoveItem(storageKey);
}

import { idbGetItem, idbGetItems, idbListKeys, idbRemoveItem, idbRemoveItems, idbSetItems } from "@/lib/transfers/marketIdb";
import type { ClubAcademyState } from "./academyTypes";

/** Persistencia separada para las academias de la IA; nunca comparte el save del usuario. */
export const ACADEMY_AI_STATE_VERSION = 1;
const PREFIX = "fcsim:academy-ai:v1";

export interface AcademyAiSaveData {
  version: number;
  savedAt: string;
  clubs: Record<string, ClubAcademyState>;
}

function clubPrefix(saveId: string): string {
  return `${PREFIX}:${saveId}:club:`;
}

function clubKey(saveId: string, teamId: string): string {
  return `${clubPrefix(saveId)}${teamId}`;
}

function legacyKey(saveId: string): string {
  return `${PREFIX}:${saveId}`;
}

function parseClub(value: string | null): ClubAcademyState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ClubAcademyState;
    if (!parsed || typeof parsed !== "object" || !parsed.teamId || !Array.isArray(parsed.players)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Carga todos los estados con un solo listado y una sola transacción de lectura. */
/** Carga una sola cantera IA para pantallas de consulta, sin hidratar todo el mundo. */
export async function loadAcademyAiClub(saveId: string, teamId: string): Promise<ClubAcademyState | null> {
  if (!saveId || !teamId) return null;
  const direct = parseClub(await idbGetItem(clubKey(saveId, teamId)));
  if (direct?.teamId === teamId) return direct;

  // Compatibilidad con partidas creadas por la versión que guardaba todas
  // las academias IA en una única clave.
  const legacyRaw = await idbGetItem(legacyKey(saveId));
  if (!legacyRaw) return null;
  try {
    const legacy = JSON.parse(legacyRaw) as Partial<AcademyAiSaveData>;
    const candidate = legacy.clubs?.[teamId];
    if (!candidate) return null;
    const parsedCandidate = parseClub(JSON.stringify(candidate));
    return parsedCandidate?.teamId === teamId ? parsedCandidate : null;
  } catch {
    return null;
  }
}

export async function loadAcademyAiSave(saveId: string): Promise<AcademyAiSaveData> {
  const prefix = clubPrefix(saveId);
  const keys = await idbListKeys(prefix);
  if (keys.length > 0) {
    const rawValues = await idbGetItems(keys);
    const clubs: Record<string, ClubAcademyState> = {};
    for (const key of keys) {
      const state = parseClub(rawValues[key] ?? null);
      if (state) clubs[state.teamId] = state;
    }
    return { version: ACADEMY_AI_STATE_VERSION, savedAt: new Date().toISOString(), clubs };
  }

  // Compatibilidad por si una build anterior guardó todas las academias como un objeto único.
  const legacyRaw = await idbGetItem(legacyKey(saveId));
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as Partial<AcademyAiSaveData>;
      const clubs = legacy.clubs && typeof legacy.clubs === "object" ? legacy.clubs as Record<string, ClubAcademyState> : {};
      if (Object.keys(clubs).length > 0) {
        await saveAcademyAiClubStates(saveId, clubs);
        await idbRemoveItem(legacyKey(saveId));
      }
      return { version: ACADEMY_AI_STATE_VERSION, savedAt: new Date().toISOString(), clubs };
    } catch {
      /* una clave antigua corrupta no bloquea la carrera */
    }
  }
  return { version: ACADEMY_AI_STATE_VERSION, savedAt: new Date().toISOString(), clubs: {} };
}

/** Persiste solo los clubes modificados, todo en una transacción de escritura. */
export async function saveAcademyAiClubStates(
  saveId: string,
  clubs: Record<string, ClubAcademyState>,
  shouldContinue: () => boolean = () => true,
): Promise<boolean> {
  if (!saveId) return false;
  const entries: Record<string, string> = {};
  const changes = Object.entries(clubs);
  const batchSize = 8;
  for (let index = 0; index < changes.length; index += batchSize) {
    if (!shouldContinue()) return false;
    for (const [teamId, state] of changes.slice(index, index + batchSize)) {
      if (!teamId || !state || state.teamId !== teamId) continue;
      entries[clubKey(saveId, teamId)] = JSON.stringify(state);
    }
    if (index + batchSize < changes.length && typeof window !== "undefined") {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
  if (!Object.keys(entries).length) return true;
  if (!shouldContinue()) return false;
  return idbSetItems(entries);
}

/** Compatibilidad para callers que poseen una fotografía completa del save. */
export async function saveAcademyAiSave(saveId: string, clubs: Record<string, ClubAcademyState>): Promise<boolean> {
  return saveAcademyAiClubStates(saveId, clubs);
}

export async function clearAcademyAiSave(saveId: string): Promise<void> {
  if (!saveId) return;
  const keys = await idbListKeys(clubPrefix(saveId));
  await idbRemoveItems(keys);
  await idbRemoveItem(legacyKey(saveId));
}

import { addDaysToIso } from "@/lib/transferWindows";
import { getCurrentSaveId } from "@/lib/savedGames";

export const MAX_ACTIVE_SCOUTS = 5;
const MIN_SCOUT_DAYS = 3;
const MAX_SCOUT_DAYS = 5;
const STORAGE_PREFIX = "fcsim:scouting:v1:";

type StoredRecord = {
  playerId: string;
  startedAt: string;
  readyAt: string;
};

export type ScoutingStatus = "pending" | "completed";

export type ScoutingEntry = StoredRecord & {
  status: ScoutingStatus;
};

function storageKey(): string | null {
  const saveId = getCurrentSaveId();
  return saveId ? `${STORAGE_PREFIX}${saveId}` : null;
}

function read(): StoredRecord[] {
  if (typeof window === "undefined") return [];
  const key = storageKey();
  if (!key) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredRecord =>
        !!item &&
        typeof item.playerId === "string" &&
        typeof item.startedAt === "string" &&
        typeof item.readyAt === "string",
    );
  } catch {
    return [];
  }
}

function write(records: StoredRecord[]): void {
  if (typeof window === "undefined") return;
  const key = storageKey();
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(records));
  } catch {
    // El ojeador es una comodidad de UI; si el almacenamiento falla no debe
    // bloquear el mercado.
  }
}

function daysForScout(playerId: string, startedAt: string): number {
  // Duración estable de 3–5 días por informe para que un mismo guardado no
  // cambie el resultado al volver a renderizar la pantalla.
  let hash = 2166136261;
  const seed = `${playerId}:${startedAt}`;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return MIN_SCOUT_DAYS + (Math.abs(hash) % (MAX_SCOUT_DAYS - MIN_SCOUT_DAYS + 1));
}

function statusOf(record: StoredRecord, currentDate: string): ScoutingStatus {
  return currentDate >= record.readyAt ? "completed" : "pending";
}

export function listScouting(currentDate: string): ScoutingEntry[] {
  return read()
    .map((record) => ({ ...record, status: statusOf(record, currentDate) }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return b.startedAt.localeCompare(a.startedAt);
    });
}

export function getScoutingEntry(playerId: string, currentDate: string): ScoutingEntry | null {
  const record = read().find((item) => item.playerId === playerId);
  return record ? { ...record, status: statusOf(record, currentDate) } : null;
}

export type StartScoutingResult =
  | { ok: true; entry: ScoutingEntry }
  | { ok: false; reason: string };

export function startScouting(playerId: string, currentDate: string): StartScoutingResult {
  const records = read();
  const existing = records.find((item) => item.playerId === playerId);
  if (existing) {
    const entry = { ...existing, status: statusOf(existing, currentDate) };
    if (entry.status === "completed") {
      return { ok: false, reason: "Este jugador ya ha sido ojeado. Puedes ver sus detalles." };
    }
    return { ok: false, reason: "Ya estás ojeando a este jugador." };
  }

  const activeCount = records.filter((record) => statusOf(record, currentDate) === "pending").length;
  if (activeCount >= MAX_ACTIVE_SCOUTS) {
    return {
      ok: false,
      reason: `Has alcanzado el límite de ${MAX_ACTIVE_SCOUTS} ojeos simultáneos. Espera a que termine uno.`,
    };
  }

  const startedAt = currentDate;
  const readyAt = addDaysToIso(currentDate, daysForScout(playerId, startedAt));
  const record: StoredRecord = { playerId, startedAt, readyAt };
  records.push(record);
  write(records);
  return { ok: true, entry: { ...record, status: "pending" } };
}

export function removeScouting(playerId: string): void {
  write(read().filter((record) => record.playerId !== playerId));
}

export function activeScoutingCount(currentDate: string): number {
  return listScouting(currentDate).filter((entry) => entry.status === "pending").length;
}

export function clearScoutingForCurrentSave(): void {
  const key = storageKey();
  if (!key || typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

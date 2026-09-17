import { addDaysToIso } from "@/lib/transferWindows";
import { getCurrentSaveId } from "@/lib/savedGames";

export type ScoutRating = 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;

/** Máximo teórico de ojeos simultáneos del sistema. */
export const MAX_ACTIVE_SCOUTS = 10;

export type ScoutCandidate = {
  id: string;
  name: string;
  country: string;
  rating: ScoutRating;
  cost: number;
  photoUrl: string;
  catalogMonth: string;
};

export type HiredScout = ScoutCandidate & {
  hiredAt: string;
};

export type ScoutingStatus = "pending" | "completed";

export type ScoutingEntry = {
  playerId: string;
  startedAt: string;
  readyAt: string;
  status: ScoutingStatus;
  scoutId: string;
  scoutRating: ScoutRating;
};

type StoredScoutingEntry = Omit<ScoutingEntry, "status">;

export type ScoutingState = {
  catalogMonth: string;
  catalog: ScoutCandidate[];
  hiredScout: HiredScout | null;
  assignments: StoredScoutingEntry[];
  dismissedScoutIds: string[];
};

export type ScoutCapabilities = {
  slots: number;
  minDays: number;
  maxDays: number;
  potentialSpreadMin: number;
  potentialSpreadMax: number;
  salarySpread: number;
  valueSpread: number;
  unknownChance: number;
};

const STORAGE_PREFIX = "fcsim:scouting:v2:";

const CAPABILITIES: Record<ScoutRating, ScoutCapabilities> = {
  0.5: { slots: 1, minDays: 12, maxDays: 15, potentialSpreadMin: 5, potentialSpreadMax: 9, salarySpread: 0.30, valueSpread: 0.28, unknownChance: 0.30 },
  1: { slots: 2, minDays: 11, maxDays: 14, potentialSpreadMin: 5, potentialSpreadMax: 8, salarySpread: 0.24, valueSpread: 0.23, unknownChance: 0.22 },
  1.5: { slots: 2, minDays: 9, maxDays: 12, potentialSpreadMin: 4, potentialSpreadMax: 7, salarySpread: 0.20, valueSpread: 0.19, unknownChance: 0.18 },
  2: { slots: 3, minDays: 8, maxDays: 11, potentialSpreadMin: 4, potentialSpreadMax: 6, salarySpread: 0.17, valueSpread: 0.16, unknownChance: 0.14 },
  2.5: { slots: 4, minDays: 7, maxDays: 10, potentialSpreadMin: 3, potentialSpreadMax: 6, salarySpread: 0.14, valueSpread: 0.13, unknownChance: 0.11 },
  3: { slots: 5, minDays: 6, maxDays: 9, potentialSpreadMin: 3, potentialSpreadMax: 5, salarySpread: 0.11, valueSpread: 0.10, unknownChance: 0.08 },
  3.5: { slots: 6, minDays: 5, maxDays: 8, potentialSpreadMin: 2, potentialSpreadMax: 4, salarySpread: 0.09, valueSpread: 0.08, unknownChance: 0.06 },
  4: { slots: 7, minDays: 4, maxDays: 7, potentialSpreadMin: 2, potentialSpreadMax: 3, salarySpread: 0.07, valueSpread: 0.06, unknownChance: 0.04 },
  4.5: { slots: 8, minDays: 3, maxDays: 5, potentialSpreadMin: 1, potentialSpreadMax: 2, salarySpread: 0.05, valueSpread: 0.045, unknownChance: 0.02 },
  5: { slots: 10, minDays: 2, maxDays: 4, potentialSpreadMin: 0, potentialSpreadMax: 1, salarySpread: 0.025, valueSpread: 0.02, unknownChance: 0.005 },
};

const PRICE_BANDS: Record<ScoutRating, readonly [number, number]> = {
  0.5: [450_000, 650_000],
  1: [850_000, 1_200_000],
  1.5: [1_700_000, 2_300_000],
  2: [3_100_000, 3_900_000],
  2.5: [5_000_000, 6_000_000],
  3: [6_500_000, 7_600_000],
  3.5: [9_000_000, 10_000_000],
  4: [11_800_000, 13_200_000],
  4.5: [15_200_000, 16_800_000],
  5: [19_000_000, 21_000_000],
};

const NAME_POOL: Array<{ name: string; country: string }> = [
  { name: "Javier Morán", country: "España" },
  { name: "Sergio Valverde", country: "España" },
  { name: "Diego Santamaría", country: "España" },
  { name: "Álvaro Benítez", country: "España" },
  { name: "Nicolás Ferrer", country: "España" },
  { name: "Tiago Nogueira", country: "Portugal" },
  { name: "André Carvalho", country: "Portugal" },
  { name: "Diogo Moreira", country: "Portugal" },
  { name: "Julien Morel", country: "Francia" },
  { name: "Mathieu Lefèvre", country: "Francia" },
  { name: "Adrien Dubois", country: "Francia" },
  { name: "Loïc Bernard", country: "Francia" },
  { name: "Lorenzo Bianchi", country: "Italia" },
  { name: "Matteo Conti", country: "Italia" },
  { name: "Davide Romano", country: "Italia" },
  { name: "Marco Ferraro", country: "Italia" },
  { name: "Lukas Schneider", country: "Alemania" },
  { name: "Jonas Weber", country: "Alemania" },
  { name: "Felix Hoffmann", country: "Alemania" },
  { name: "Niklas Keller", country: "Alemania" },
  { name: "Oliver Bennett", country: "Inglaterra" },
  { name: "Ethan Clarke", country: "Inglaterra" },
  { name: "James Turner", country: "Inglaterra" },
  { name: "Daniel Foster", country: "Inglaterra" },
  { name: "Bram van Dijk", country: "Países Bajos" },
  { name: "Lars de Vries", country: "Países Bajos" },
  { name: "Marko Kovač", country: "Croacia" },
  { name: "Ivan Petrović", country: "Serbia" },
  { name: "Rafael Costa", country: "Brasil" },
  { name: "Martín Acosta", country: "Argentina" },
  { name: "Nicolás Pereyra", country: "Argentina" },
  { name: "Mikkel Andersen", country: "Dinamarca" },
  { name: "Erik Larsson", country: "Suecia" },
  { name: "Oskar Berg", country: "Suecia" },
];

function storageKey(): string | null {
  const saveId = getCurrentSaveId();
  return saveId ? `${STORAGE_PREFIX}${saveId}` : null;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: string): number {
  let value = hashString(seed) || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 1_000_000) / 1_000_000;
}

function seededInt(seed: string, min: number, max: number): number {
  return Math.floor(min + seededUnit(seed) * (max - min + 1));
}

function seededPick<T>(items: T[], seed: string): T {
  return items[seededInt(seed, 0, items.length - 1)];
}

function ratingFromIndex(index: number, month: string, saveId: string): ScoutRating {
  const ratings: ScoutRating[] = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  return seededPick(ratings, `${saveId}:${month}:rating:${index}`);
}

function buildCatalog(month: string): ScoutCandidate[] {
  const saveId = getCurrentSaveId() ?? "default";
  const pool = NAME_POOL.slice();
  const catalog: ScoutCandidate[] = [];
  const usedNames = new Set<string>();

  for (let index = 0; index < 5; index += 1) {
    const available = pool.filter((entry) => !usedNames.has(entry.name));
    const person = seededPick(available, `${saveId}:${month}:name:${index}`);
    usedNames.add(person.name);

    const rating = ratingFromIndex(index, month, saveId);
    const [minCost, maxCost] = PRICE_BANDS[rating];
    const rawCost = minCost + Math.round(seededUnit(`${saveId}:${month}:cost:${index}`) * (maxCost - minCost));
    const cost = Math.round(rawCost / 50_000) * 50_000;
    const id = `scout-${month}-${index}-${hashString(`${saveId}:${month}:${person.name}`).toString(36)}`;

    catalog.push({
      id,
      name: person.name,
      country: person.country,
      rating,
      cost,
      photoUrl: `/scout-avatars/scout-${(index % 5) + 1}.svg`,
      catalogMonth: month,
    });
  }

  return catalog;
}

function isValidRating(value: unknown): value is ScoutRating {
  return typeof value === "number" && [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].includes(value);
}

function sanitizeState(raw: unknown): ScoutingState {
  if (!raw || typeof raw !== "object") {
    return { catalogMonth: "", catalog: [], hiredScout: null, assignments: [], dismissedScoutIds: [] };
  }
  const source = raw as Partial<ScoutingState>;
  const catalog = Array.isArray(source.catalog)
    ? source.catalog.filter(
        (item): item is ScoutCandidate =>
          !!item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.country === "string" &&
          isValidRating(item.rating) &&
          typeof item.cost === "number" &&
          typeof item.photoUrl === "string" &&
          typeof item.catalogMonth === "string",
      )
    : [];
  const hiredScout = source.hiredScout && typeof source.hiredScout === "object"
    ? source.hiredScout as HiredScout
    : null;
  const assignments = Array.isArray(source.assignments)
    ? source.assignments.filter(
        (entry): entry is StoredScoutingEntry =>
          !!entry &&
          typeof entry.playerId === "string" &&
          typeof entry.startedAt === "string" &&
          typeof entry.readyAt === "string" &&
          typeof entry.scoutId === "string" &&
          isValidRating(entry.scoutRating),
      )
    : [];
  const dismissedScoutIds = Array.isArray(source.dismissedScoutIds)
    ? source.dismissedScoutIds.filter((id): id is string => typeof id === "string")
    : [];

  return {
    catalogMonth: typeof source.catalogMonth === "string" ? source.catalogMonth : "",
    catalog,
    hiredScout,
    assignments,
    dismissedScoutIds,
  };
}

function readState(): ScoutingState {
  if (typeof window === "undefined") return { catalogMonth: "", catalog: [], hiredScout: null, assignments: [], dismissedScoutIds: [] };
  const key = storageKey();
  if (!key) return { catalogMonth: "", catalog: [], hiredScout: null, assignments: [], dismissedScoutIds: [] };
  try {
    return sanitizeState(JSON.parse(window.localStorage.getItem(key) || "null"));
  } catch {
    return { catalogMonth: "", catalog: [], hiredScout: null, assignments: [], dismissedScoutIds: [] };
  }
}

function writeState(state: ScoutingState): void {
  if (typeof window === "undefined") return;
  const key = storageKey();
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // El sistema de ojeadores es persistente pero no debe bloquear la partida
    // si el navegador no permite escribir en localStorage.
  }
}

export function ensureScoutingState(currentDate: string): ScoutingState {
  const month = currentDate.slice(0, 7);
  const state = readState();

  if (state.catalogMonth === month && state.catalog.length === 5) {
    // Migración de catálogos creados por versiones anteriores: sustituimos
    // retratos externos por avatares locales para que el sistema sea estable
    // y no dependa de una URL remota.
    const migratedCatalog = state.catalog.map((candidate, index) => {
      const photoUrl = `/scout-avatars/scout-${(index % 5) + 1}.svg`;
      return candidate.photoUrl === photoUrl ? candidate : { ...candidate, photoUrl };
    });
    const changed = migratedCatalog.some((candidate, index) => candidate !== state.catalog[index]);
    if (changed) {
      const next = { ...state, catalog: migratedCatalog };
      writeState(next);
      return next;
    }
    return state;
  }

  const next = {
    ...state,
    catalogMonth: month,
    catalog: buildCatalog(month),
  };
  writeState(next);
  return next;
}

export function getScoutingState(currentDate: string): ScoutingState {
  return ensureScoutingState(currentDate);
}

export function getScoutCapabilities(rating: ScoutRating): ScoutCapabilities {
  return CAPABILITIES[rating];
}

export function getClubScout(currentDate: string): HiredScout | null {
  return ensureScoutingState(currentDate).hiredScout;
}

export function getScoutCapacity(currentDate: string): number {
  const scout = getClubScout(currentDate);
  return scout ? CAPABILITIES[scout.rating].slots : 0;
}

export type HireScoutResult =
  | { ok: true; scout: HiredScout }
  | { ok: false; reason: string };

export function hireScout(scoutId: string, currentDate: string): HireScoutResult {
  const state = ensureScoutingState(currentDate);
  if (state.hiredScout) {
    return { ok: false, reason: `Ya tienes contratado a ${state.hiredScout.name}.` };
  }
  if (state.dismissedScoutIds.includes(scoutId)) {
    return { ok: false, reason: "Este ojeador ha sido despedido y ya no puede volver a contratarse." };
  }
  const candidate = state.catalog.find((item) => item.id === scoutId);
  if (!candidate) return { ok: false, reason: "Ese ojeador ya no está disponible en el catálogo." };

  const hiredScout: HiredScout = { ...candidate, hiredAt: currentDate };
  writeState({ ...state, hiredScout });
  return { ok: true, scout: hiredScout };
}

/**
 * Limpia el ojeador contratado sin marcarlo como despedido. Se usa únicamente
 * para hacer rollback si el descuento del presupuesto falla.
 */
export function releaseHiredScout(): void {
  const state = readState();
  if (!state.hiredScout) return;
  writeState({ ...state, hiredScout: null });
}

/** Despide al ojeador actual y bloquea para siempre su ficha de catálogo. */
export function dismissHiredScout(): HiredScout | null {
  const state = readState();
  const scout = state.hiredScout;
  if (!scout) return null;
  const dismissedScoutIds = state.dismissedScoutIds.includes(scout.id)
    ? state.dismissedScoutIds
    : [...state.dismissedScoutIds, scout.id];
  writeState({ ...state, hiredScout: null, dismissedScoutIds });
  return scout;
}

function statusOf(entry: StoredScoutingEntry, currentDate: string): ScoutingStatus {
  return currentDate >= entry.readyAt ? "completed" : "pending";
}

function daysForScout(playerId: string, startedAt: string, scoutId: string, rating: ScoutRating): number {
  const { minDays, maxDays } = CAPABILITIES[rating];
  return seededInt(`${playerId}:${startedAt}:${scoutId}:duration`, minDays, maxDays);
}

export function listScouting(currentDate: string): ScoutingEntry[] {
  const state = ensureScoutingState(currentDate);
  return state.assignments
    .map((record) => ({ ...record, status: statusOf(record, currentDate) }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return b.startedAt.localeCompare(a.startedAt);
    });
}

export function getScoutingEntry(playerId: string, currentDate: string): ScoutingEntry | null {
  const state = ensureScoutingState(currentDate);
  const record = state.assignments.find((item) => item.playerId === playerId);
  return record ? { ...record, status: statusOf(record, currentDate) } : null;
}

export type StartScoutingResult =
  | { ok: true; entry: ScoutingEntry }
  | { ok: false; reason: string };

export function startScouting(playerId: string, currentDate: string): StartScoutingResult {
  const state = ensureScoutingState(currentDate);
  const scout = state.hiredScout;
  if (!scout) {
    return { ok: false, reason: "Tu club no dispone de ningún ojeador. Contrata uno antes de enviar jugadores." };
  }

  const existing = state.assignments.find((item) => item.playerId === playerId);
  if (existing) {
    const entry = { ...existing, status: statusOf(existing, currentDate) };
    if (entry.status === "completed") {
      return { ok: false, reason: "Este jugador ya ha sido ojeado. Puedes consultar su informe." };
    }
    return { ok: false, reason: "Ya estás ojeando a este jugador." };
  }

  const capacity = CAPABILITIES[scout.rating].slots;
  const activeCount = state.assignments.filter((record) => statusOf(record, currentDate) === "pending").length;
  if (activeCount >= capacity) {
    return {
      ok: false,
      reason: `Tu ojeador permite ${capacity} ojeo${capacity === 1 ? "" : "s"} simultáneo${capacity === 1 ? "" : "s"}. Espera a que termine uno.`,
    };
  }

  const readyAt = addDaysToIso(
    currentDate,
    daysForScout(playerId, currentDate, scout.id, scout.rating),
  );
  const record: StoredScoutingEntry = {
    playerId,
    startedAt: currentDate,
    readyAt,
    scoutId: scout.id,
    scoutRating: scout.rating,
  };
  writeState({ ...state, assignments: [...state.assignments, record] });
  return { ok: true, entry: { ...record, status: "pending" } };
}

export function removeScouting(playerId: string): void {
  const state = readState();
  writeState({ ...state, assignments: state.assignments.filter((record) => record.playerId !== playerId) });
}

export function activeScoutingCount(currentDate: string): number {
  return listScouting(currentDate).filter((entry) => entry.status === "pending").length;
}

export function clearScoutingForCurrentSave(): void {
  const key = storageKey();
  if (!key || typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

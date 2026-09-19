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
  /** Campos concretos que este ojeo consiguió detectar. Son aleatorios por asignación. */
  detectedFields: ScoutField[];
  detectedFieldsVersion?: 2;
};

type StoredScoutingEntry = Omit<ScoutingEntry, "status">;

export type ScoutingState = {
  catalogMonth: string;
  catalog: ScoutCandidate[];
  hiredScout: HiredScout | null;
  assignments: StoredScoutingEntry[];
  dismissedScoutIds: string[];
};

export type ScoutField =
  | "potential"
  | "marketValue"
  | "salary"
  | "askingPrice"
  | "wageDemand";

export type ScoutCapabilities = {
  /** Rango de jugadores que este nivel puede investigar simultáneamente. */
  minSlots: number;
  maxSlots: number;
  /** Compatibilidad con consumidores antiguos; devuelve el máximo del rango. */
  slots: number;
  minDays: number;
  maxDays: number;
  precision: number;
  fieldsDetected: number;
};

const CAPABILITIES: Record<ScoutRating, ScoutCapabilities> = {
  0.5: { minSlots: 2, maxSlots: 2, slots: 2, minDays: 11, maxDays: 12, precision: 2, fieldsDetected: 2 },
  1:   { minSlots: 2, maxSlots: 2, slots: 2, minDays: 10, maxDays: 11, precision: 2.5, fieldsDetected: 2 },
  1.5: { minSlots: 2, maxSlots: 3, slots: 3, minDays: 9, maxDays: 10, precision: 2.5, fieldsDetected: 3 },
  2:   { minSlots: 3, maxSlots: 4, slots: 4, minDays: 8, maxDays: 9, precision: 3, fieldsDetected: 3 },
  2.5: { minSlots: 4, maxSlots: 4, slots: 4, minDays: 7, maxDays: 8, precision: 3.5, fieldsDetected: 3 },
  3:   { minSlots: 4, maxSlots: 5, slots: 5, minDays: 6, maxDays: 7, precision: 3.5, fieldsDetected: 4 },
  3.5: { minSlots: 5, maxSlots: 6, slots: 6, minDays: 5, maxDays: 6, precision: 4, fieldsDetected: 4 },
  4:   { minSlots: 7, maxSlots: 8, slots: 8, minDays: 4, maxDays: 5, precision: 4, fieldsDetected: 5 },
  4.5: { minSlots: 8, maxSlots: 9, slots: 9, minDays: 3, maxDays: 4, precision: 4.5, fieldsDetected: 5 },
  5:   { minSlots: 10, maxSlots: 10, slots: 10, minDays: 2, maxDays: 3, precision: 5, fieldsDetected: 5 },
};

/**
 * Campos que puede llegar a revelar un informe. La progresión desbloquea
 * campos de forma acumulativa a medida que aumenta la calidad del ojeador:
 * potencial, valor de mercado, salario, precio que pide el club y salario que
 * pide el jugador.
 */
const ALL_SCOUT_FIELDS: readonly ScoutField[] = [
  "potential",
  "marketValue",
  "salary",
  "askingPrice",
  "wageDemand",
];

const DETECTED_FIELD_COUNT: Record<number, number> = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
};

const STORAGE_PREFIX = "fcsim:scouting:v2:";

const PRICE_BANDS: Record<ScoutRating, readonly [number, number]> = {
  0.5: [350_000, 700_000],
  1: [800_000, 1_000_000],
  1.5: [1_500_000, 3_000_000],
  2: [3_500_000, 4_500_000],
  2.5: [5_000_000, 6_500_000],
  3: [7_500_000, 9_000_000],
  3.5: [9_500_000, 12_000_000],
  4: [12_500_000, 15_000_000],
  4.5: [16_500_000, 18_500_000],
  5: [20_000_000, 22_500_000],
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

function detectedFieldsForAssignment(rating: ScoutRating, _seed: string): ScoutField[] {
  const count = DETECTED_FIELD_COUNT[CAPABILITIES[rating].fieldsDetected] ?? CAPABILITIES[rating].fieldsDetected;
  const pool = [...ALL_SCOUT_FIELDS];

  // Fisher-Yates no determinista: cada nuevo ojeo obtiene una combinación
  // independiente de campos. El resultado se guarda en la asignación.
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, count);
}

function sanitizeDetectedFields(
  rating: ScoutRating,
  raw: unknown,
  seed: string,
): ScoutField[] {
  const allowed = new Set<ScoutField>(ALL_SCOUT_FIELDS);
  const clean = Array.isArray(raw)
    ? raw.filter((field): field is ScoutField => typeof field === "string" && allowed.has(field as ScoutField))
    : [];
  const required = DETECTED_FIELD_COUNT[CAPABILITIES[rating].fieldsDetected] ?? CAPABILITIES[rating].fieldsDetected;
  const unique = Array.from(new Set(clean));

  if (unique.length === required) return unique;
  return detectedFieldsForAssignment(rating, seed);
}

const SCOUT_RATING_WEIGHTS: ReadonlyArray<readonly [ScoutRating, number]> = [
  [0.5, 17],
  [1, 14],
  [1.5, 12],
  [2, 11],
  [2.5, 10],
  [3, 9],
  [3.5, 8],
  [4, 7],
  [4.5, 6.5],
  [5, 5.5],
];

function ratingFromIndex(index: number, month: string, saveId: string): ScoutRating {
  const roll = seededUnit(`${saveId}:${month}:rating:${index}`) * 100;
  let cursor = 0;
  for (const [rating, weight] of SCOUT_RATING_WEIGHTS) {
    cursor += weight;
    if (roll < cursor) return rating;
  }
  return 0.5;
}

function costForScoutSeed(seed: string, rating: ScoutRating): number {
  const [minCost, maxCost] = PRICE_BANDS[rating];
  const rawCost = minCost + Math.round(seededUnit(seed) * (maxCost - minCost));
  return Math.round(rawCost / 50_000) * 50_000;
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
    const cost = costForScoutSeed(`${saveId}:${month}:cost:${index}`, rating);
    const id = `scout-${month}-${index}-${hashString(`${saveId}:${month}:${person.name}`).toString(36)}`;

    catalog.push({
      id,
      name: person.name,
      country: person.country,
      rating,
      cost,
      photoUrl: `/scout-avatars/generated-${(index % 5) + 1}.png`,
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
    ? source.assignments.reduce<StoredScoutingEntry[]>((result, entry) => {
        if (
          !entry ||
          typeof entry.playerId !== "string" ||
          typeof entry.startedAt !== "string" ||
          typeof entry.readyAt !== "string" ||
          typeof entry.scoutId !== "string" ||
          !isValidRating(entry.scoutRating)
        ) {
          return result;
        }

        const scoutRating = entry.scoutRating;
        result.push({
          playerId: entry.playerId,
          startedAt: entry.startedAt,
          readyAt: entry.readyAt,
          scoutId: entry.scoutId,
          scoutRating,
          detectedFields: sanitizeDetectedFields(
            scoutRating,
            (entry as Partial<StoredScoutingEntry>).detectedFields,
            `${entry.playerId}:${entry.startedAt}:${entry.scoutId}`,
          ),
          detectedFieldsVersion: 2,
        });
        return result;
      }, [])
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
      const photoUrl = `/scout-avatars/generated-${(index % 5) + 1}.png`;
      const cost = costForScoutSeed(candidate.id, candidate.rating);
      return candidate.photoUrl === photoUrl && candidate.cost === cost
        ? candidate
        : { ...candidate, photoUrl, cost };
    });
    const changed = migratedCatalog.some((candidate, index) => candidate !== state.catalog[index]);
    if (changed) {
      const next = { ...state, catalog: migratedCatalog };
      writeState(next);
      return next;
    }
    return state;
  }

  const catalogActuallyChanged = Boolean(state.catalogMonth && state.catalogMonth !== month);
  const next = {
    ...state,
    catalogMonth: month,
    catalog: buildCatalog(month),
  };

  // Solo generamos una notificación cuando realmente se ha producido un
  // cambio de catálogo. Así, un guardado antiguo al estrenar esta función no
  // genera una falsa notificación en su primera apertura.
  if (catalogActuallyChanged) {
    markScoutingCatalogChanged(month);
  }

  writeState(next);
  return next;
}

export function getScoutingState(currentDate: string): ScoutingState {
  return ensureScoutingState(currentDate);
}

export function getScoutCapabilities(rating: ScoutRating): ScoutCapabilities {
  return CAPABILITIES[rating];
}

export function getScoutSlots(scoutId: string, rating: ScoutRating): number {
  const capabilities = CAPABILITIES[rating];
  if (capabilities.minSlots === capabilities.maxSlots) return capabilities.minSlots;
  return seededInt(`${scoutId}:capacity`, capabilities.minSlots, capabilities.maxSlots);
}

export function getDetectedScoutFields(rating: ScoutRating, seed = `rating:${rating}`): readonly ScoutField[] {
  return detectedFieldsForAssignment(rating, seed);
}

export function scoutFieldIsDetected(rating: ScoutRating, field: ScoutField, seed = `rating:${rating}`): boolean {
  return getDetectedScoutFields(rating, seed).includes(field);
}

export function getClubScout(currentDate: string): HiredScout | null {
  return ensureScoutingState(currentDate).hiredScout;
}

export function getScoutCapacity(currentDate: string): number {
  const scout = getClubScout(currentDate);
  return scout ? getScoutSlots(scout.id, scout.rating) : 0;
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

export type StartScoutingBatchResult =
  | { ok: true; entries: ScoutingEntry[] }
  | { ok: false; reason: string };

export function startScoutingBatch(playerIds: string[], currentDate: string): StartScoutingBatchResult {
  const state = ensureScoutingState(currentDate);
  const scout = state.hiredScout;
  if (!scout) {
    return { ok: false, reason: "Tu club no dispone de ningún ojeador. Contrata uno antes de enviar jugadores." };
  }

  const requestedIds = Array.from(new Set(playerIds.map((id) => String(id)).filter(Boolean)));
  if (requestedIds.length === 0) {
    return { ok: false, reason: "Selecciona al menos un jugador para iniciar el ojeo." };
  }

  const capacity = getScoutSlots(scout.id, scout.rating);
  const activeCount = state.assignments.filter((record) => statusOf(record, currentDate) === "pending").length;
  const availableSlots = Math.max(0, capacity - activeCount);
  if (requestedIds.length > availableSlots) {
    return {
      ok: false,
      reason: `Tu ojeador tiene ${availableSlots} hueco${availableSlots === 1 ? "" : "s"} disponible${availableSlots === 1 ? "" : "s"} de ${capacity}.`,
    };
  }

  const existingIds = new Set(state.assignments.map((record) => record.playerId));
  const alreadyScouted = requestedIds.filter((id) => existingIds.has(id));
  if (alreadyScouted.length > 0) {
    return { ok: false, reason: "Uno o varios jugadores ya están ojeados o en proceso de ojeo." };
  }

  const records: StoredScoutingEntry[] = requestedIds.map((playerId) => ({
    playerId,
    startedAt: currentDate,
    readyAt: addDaysToIso(
      currentDate,
      daysForScout(playerId, currentDate, scout.id, scout.rating),
    ),
    scoutId: scout.id,
    scoutRating: scout.rating,
    detectedFields: detectedFieldsForAssignment(
      scout.rating,
      `${playerId}:${currentDate}:${scout.id}:${Math.random()}`,
    ),
    detectedFieldsVersion: 2,
  }));

  writeState({ ...state, assignments: [...state.assignments, ...records] });
  return {
    ok: true,
    entries: records.map((record) => ({ ...record, status: "pending" })),
  };
}

export function startScouting(playerId: string, currentDate: string): StartScoutingResult {
  const result = startScoutingBatch([playerId], currentDate);
  if (!result.ok) return result;
  return { ok: true, entry: result.entries[0] };
}

export function removeScouting(playerId: string): void {
  const state = readState();
  writeState({ ...state, assignments: state.assignments.filter((record) => record.playerId !== playerId) });
}

export function activeScoutingCount(currentDate: string): number {
  return listScouting(currentDate).filter((entry) => entry.status === "pending").length;
}


const SCOUTING_NOTIFICATIONS_STORAGE_PREFIX = "fcsim:scouting-notifications:v2:";
const SCOUTING_CATALOG_EVENT_STORAGE_PREFIX = "fcsim:scouting-catalog-event:v1:";

type ScoutingNotificationSeen = {
  catalogMonth: string;
  completedAssignmentIds: string[];
};

function scoutingNotificationStorageKey(): string | null {
  const saveId = getCurrentSaveId();
  return saveId ? `${SCOUTING_NOTIFICATIONS_STORAGE_PREFIX}${saveId}` : null;
}

function scoutingCatalogEventStorageKey(): string | null {
  const saveId = getCurrentSaveId();
  return saveId ? `${SCOUTING_CATALOG_EVENT_STORAGE_PREFIX}${saveId}` : null;
}

function readScoutingCatalogEvent(): string {
  if (typeof window === "undefined") return "";
  const key = scoutingCatalogEventStorageKey();
  if (!key) return "";
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function markScoutingCatalogChanged(catalogMonth: string): void {
  if (typeof window === "undefined") return;
  const key = scoutingCatalogEventStorageKey();
  if (!key) return;
  try {
    window.localStorage.setItem(key, catalogMonth);
  } catch {
    // No bloqueamos la partida si el almacenamiento no está disponible.
  }
}

function clearScoutingCatalogChanged(): void {
  if (typeof window === "undefined") return;
  const key = scoutingCatalogEventStorageKey();
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // No bloqueamos la partida si el almacenamiento no está disponible.
  }
}

function readScoutingNotificationSeen(): ScoutingNotificationSeen | null {
  if (typeof window === "undefined") return null;
  const key = scoutingNotificationStorageKey();
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ScoutingNotificationSeen>;
    return {
      catalogMonth: typeof parsed.catalogMonth === "string" ? parsed.catalogMonth : "",
      completedAssignmentIds: Array.isArray(parsed.completedAssignmentIds)
        ? parsed.completedAssignmentIds.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function writeScoutingNotificationSeen(value: ScoutingNotificationSeen): void {
  if (typeof window === "undefined") return;
  const key = scoutingNotificationStorageKey();
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // No bloqueamos la partida si el almacenamiento no está disponible.
  }
}

/**
 * Devuelve si hay novedades del ojeador que todavía no se han visto:
 * un cambio de catálogo o al menos un informe que haya pasado a listo.
 * La primera lectura inicializa el estado como ya visto para no crear una
 * falsa notificación al cargar una partida antigua.
 */
export function hasScoutingNotifications(currentDate: string): boolean {
  const state = ensureScoutingState(currentDate);
  const completedIds = state.assignments
    .filter((entry) => statusOf(entry, currentDate) === "completed")
    .map((entry) => `${entry.playerId}:${entry.readyAt}`);

  const seen = readScoutingNotificationSeen();
  const catalogEvent = readScoutingCatalogEvent();

  // En una partida que ya existía antes de esta funcionalidad, no debemos
  // inventarnos una notificación de catálogo. Sin embargo, un informe que ya
  // esté listo sí debe poder avisar al usuario.
  if (!seen) {
    return Boolean(catalogEvent) || completedIds.length > 0;
  }

  const catalogChanged =
    seen.catalogMonth !== state.catalogMonth || catalogEvent === state.catalogMonth;
  const readyReportAvailable = completedIds.some(
    (id) => !seen.completedAssignmentIds.includes(id),
  );

  return catalogChanged || readyReportAvailable;
}

/** Marca como vistas las novedades actuales del ojeador. */
export function markScoutingNotificationsSeen(currentDate: string): void {
  const state = ensureScoutingState(currentDate);
  const completedIds = state.assignments
    .filter((entry) => statusOf(entry, currentDate) === "completed")
    .map((entry) => `${entry.playerId}:${entry.readyAt}`);

  writeScoutingNotificationSeen({
    catalogMonth: state.catalogMonth,
    completedAssignmentIds: completedIds,
  });
  clearScoutingCatalogChanged();
}

export function clearScoutingForCurrentSave(): void {
  const key = storageKey();
  if (!key || typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

/**
 * Persistencia del mercado.
 *
 * Guarda en `localStorage` sólo lo que no se puede reconstruir de forma
 * determinista: el estado de la simulación, las finanzas de los clubes, los
 * cambios sobre las fichas de los jugadores, el historial y los rumores.
 * Todo lo demás (índices, perfiles de club, valoraciones) se recalcula al
 * cargar, porque depende únicamente de los datos base y de semillas estables.
 *
 * IMPORTANTE: el mercado se guarda POR PARTIDA (`fcsim:market:v1:{id}`) y,
 * dentro de cada partida, el historial y los rumores de las ventanas ya
 * cerradas se archivan en una clave propia por ventana de fichajes
 * (`fcsim:market:v1:{id}:w:{temporada}:{ventana}`). Así el mercado de cada
 * año/ventana queda almacenado por separado: no se reescribe en cada
 * guardado (menos presión sobre la cuota del navegador) y no se pierde al
 * simular partidos.
 */

import { restoreFinances, snapshotFinances } from "./BudgetManager";
import { restorePlayerDeltas, snapshotPlayerDeltas, type PlayerDelta } from "./PlayerIndex";
import {
  restoreSimulation,
  snapshotSimulation,
  windowKeyForDate,
  type SimulationSnapshot,
} from "./MarketSimulation";
import { rebuildLocks } from "./MarketLocks";
import {
  dropTransferWindows,
  restoreTransferHistory,
  snapshotTransferHistory,
} from "./TransferHistory";
import { restoreRumors, snapshotRumors } from "./RumorEngine";
import { restoreUserDeals, snapshotUserDeals, type UserDeal } from "./UserNegotiation";
import {
  restorePursuitMemory,
  snapshotPursuitMemory,
  type PursuitMemoryEntry,
} from "./TransferEngine";
import { getCurrentSaveId } from "@/lib/savedGames";
import { safeSetItem, MARKET_ARCHIVE_MARKER } from "@/lib/safeStorage";
import { MARKET_STATE_VERSION, MARKET_STORAGE_KEY_PREFIX } from "./constants";
import type { ClubFinances, Rumor, TransferRecord } from "./types";

// Clave heredada de cuando el mercado era global (una sola partida para todo
// el juego). Se usa sólo para migrar UNA VEZ los datos a la partida activa
// la primera vez que se carga tras esta corrección; después se borra, para
// que ninguna otra partida pueda heredarla por accidente.
const LEGACY_GLOBAL_STORAGE_KEY = MARKET_STORAGE_KEY_PREFIX;
const STORAGE_KEY_PREFIX = MARKET_STORAGE_KEY_PREFIX;
const VERSION = MARKET_STATE_VERSION;

/**
 * Clave de almacenamiento del mercado para la partida actualmente activa.
 */
function storageKeyForActiveSave(): string {
  const saveId = getCurrentSaveId();
  return saveId ? `${STORAGE_KEY_PREFIX}:${saveId}` : LEGACY_GLOBAL_STORAGE_KEY;
}

/** Clave del archivo de una ventana de fichajes concreta. */
function archiveKey(baseKey: string, windowKey: string): string {
  return `${baseKey}${MARKET_ARCHIVE_MARKER}${windowKey}`;
}

/** Mercado archivado de una ventana ya cerrada. */
interface WindowArchive {
  version: number;
  windowKey: string;
  history: TransferRecord[];
  rumors: Rumor[];
}

/** Partida de mercado serializada. */
export interface TransferSaveData {
  version: number;
  savedAt: string;
  simulation: SimulationSnapshot | null;
  finances: ClubFinances[];
  players: PlayerDelta[];
  history: TransferRecord[];
  rumors: Rumor[];
  /** Negociaciones abiertas del usuario. */
  userDeals: UserDeal[];
  /** Últimos rechazos por pareja club-jugador (evita ofertas repetidas). */
  pursuits: PursuitMemoryEntry[];
  /** Ventanas de fichajes cuyo mercado vive en su propia clave. */
  archivedWindows?: string[];
}

/** Construye la instantánea completa del sistema de mercado. */
export function snapshotTransferSystem(): TransferSaveData {
  return {
    version: VERSION,
    savedAt: new Date().toISOString(),
    simulation: snapshotSimulation(),
    finances: snapshotFinances(),
    players: snapshotPlayerDeltas(),
    history: snapshotTransferHistory(),
    rumors: snapshotRumors(),
    userDeals: snapshotUserDeals(),
    pursuits: snapshotPursuitMemory(),
  };
}

/** Reaplica una instantánea sobre el sistema ya inicializado. */
export function applyTransferSnapshot(data: TransferSaveData): boolean {
  if (!data || data.version !== VERSION) return false;
  restorePlayerDeltas(data.players ?? []);
  restoreFinances(data.finances ?? []);
  restoreTransferHistory(data.history ?? []);
  restoreRumors(data.rumors ?? []);
  restoreUserDeals(data.userDeals ?? []);
  restorePursuitMemory(data.pursuits ?? []);
  if (data.simulation) restoreSimulation(data.simulation);
  // Los cerrojos ("ya fichó en esta ventana") se recalculan del historial.
  rebuildLocks(data.history ?? [], windowKeyForDate);
  return true;
}

/** ¿Estamos en un entorno con `localStorage`? */
function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Tamaño ya archivado de cada ventana, para no reescribirla en cada guardado. */
const archivedSizes = new Map<string, number>();

/**
 * Nº máximo de ventanas de mercado archivadas que se conservan por partida
 * (24 ventanas ≈ 12 temporadas de historial y rumores). Sin este tope, una
 * carrera muy larga acumulaba archivos para siempre y acababa agotando la
 * cuota de `localStorage` justo al volver de un partido. Superado el tope,
 * se descartan las ventanas más antiguas (las menos relevantes) tanto del
 * disco como de la memoria; el resto del mercado sigue intacto.
 */
const MAX_ARCHIVED_WINDOWS = 24;

/** Descarta del disco (y de la memoria) las ventanas archivadas más antiguas por encima del tope. */
function enforceArchiveCap(baseKey: string, archivedWindows: string[]): string[] {
  if (archivedWindows.length <= MAX_ARCHIVED_WINDOWS) return archivedWindows;
  const sorted = [...archivedWindows].sort();
  const overflow = sorted.length - MAX_ARCHIVED_WINDOWS;
  const toDrop = sorted.slice(0, overflow);
  const kept = sorted.slice(overflow);

  for (const windowKey of toDrop) {
    const key = archiveKey(baseKey, windowKey);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* si no se puede borrar, seguimos: no es crítico */
    }
    archivedSizes.delete(key);
  }
  dropTransferWindows(new Set(toDrop), windowKeyForDate);
  return kept;
}

function groupByWindow<T extends { date: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = windowKeyForDate(item.date);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/**
 * Guarda el mercado en `localStorage`, en la ranura de la partida activa.
 *
 * El historial y los rumores de ventanas ya cerradas se escriben una sola vez
 * en su propia clave por año/ventana; la clave principal sólo lleva la ventana
 * en curso más el estado vivo (simulación, finanzas, negociaciones). Nunca lanza.
 */
export function saveTransferSystem(): boolean {
  if (!hasStorage()) return false;
  try {
    const snapshot = snapshotTransferSystem();
    const baseKey = storageKeyForActiveSave();
    const currentWindow = snapshot.simulation?.windowKey ?? null;

    const historyByWindow = groupByWindow(snapshot.history);
    const rumorsByWindow = groupByWindow(snapshot.rumors);
    const windows = new Set<string>([...historyByWindow.keys(), ...rumorsByWindow.keys()]);

    const archivedWindows: string[] = [];
    for (const windowKey of windows) {
      if (windowKey === currentWindow) continue;
      const history = historyByWindow.get(windowKey) ?? [];
      const rumors = rumorsByWindow.get(windowKey) ?? [];
      const key = archiveKey(baseKey, windowKey);
      const size = history.length + rumors.length;
      const alreadyStored =
        archivedSizes.get(key) === size && window.localStorage.getItem(key) !== null;
      if (!alreadyStored) {
        const archive: WindowArchive = { version: VERSION, windowKey, history, rumors };
        if (safeSetItem(key, JSON.stringify(archive))) archivedSizes.set(key, size);
        else continue; // sin espacio: esa ventana se queda en la clave principal
      }
      archivedWindows.push(windowKey);
    }

    const cappedArchivedWindows = enforceArchiveCap(baseKey, archivedWindows);
    // Ojo: para filtrar lo que se queda en la clave principal usamos la lista
    // SIN recortar. Una ventana descartada por el tope (`enforceArchiveCap`)
    // ya no está en `cappedArchivedWindows`, pero tampoco debe reaparecer
    // aquí: se ha borrado a propósito, no "vuelto a la ventana en curso".
    const handledSet = new Set(archivedWindows);
    const core: TransferSaveData = {
      ...snapshot,
      history: snapshot.history.filter((r) => !handledSet.has(windowKeyForDate(r.date))),
      rumors: snapshot.rumors.filter((r) => !handledSet.has(windowKeyForDate(r.date))),
      archivedWindows: cappedArchivedWindows,
    };

    return safeSetItem(baseKey, JSON.stringify(core));
  } catch (error) {
    console.warn("[transfers] no se pudo guardar el mercado:", (error as Error)?.message);
    return false;
  }
}

/**
 * Lee el mercado guardado de la partida activa, si existe y es válido,
 * reuniendo la ventana en curso con todas las ventanas archivadas.
 */
export function loadTransferSave(): TransferSaveData | null {
  if (!hasStorage()) return null;
  try {
    const key = storageKeyForActiveSave();
    let raw = window.localStorage.getItem(key);

    if (!raw && key !== LEGACY_GLOBAL_STORAGE_KEY) {
      const legacy = window.localStorage.getItem(LEGACY_GLOBAL_STORAGE_KEY);
      if (legacy) {
        window.localStorage.setItem(key, legacy);
        window.localStorage.removeItem(LEGACY_GLOBAL_STORAGE_KEY);
        raw = legacy;
      }
    }

    if (!raw) return null;
    const parsed = JSON.parse(raw) as TransferSaveData;
    if (parsed?.version !== VERSION) return null;

    const history: TransferRecord[] = [...(parsed.history ?? [])];
    const rumors: Rumor[] = [...(parsed.rumors ?? [])];

    for (const windowKey of parsed.archivedWindows ?? []) {
      const archiveRaw = window.localStorage.getItem(archiveKey(key, windowKey));
      if (!archiveRaw) continue;
      try {
        const archive = JSON.parse(archiveRaw) as WindowArchive;
        if (archive?.version !== VERSION) continue;
        history.push(...(archive.history ?? []));
        rumors.push(...(archive.rumors ?? []));
        archivedSizes.set(
          archiveKey(key, windowKey),
          (archive.history?.length ?? 0) + (archive.rumors?.length ?? 0),
        );
      } catch {
        /* archivo corrupto: se ignora esa ventana */
      }
    }

    const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
    history.sort(byDate);
    rumors.sort(byDate);

    return { ...parsed, history, rumors };
  } catch {
    return null;
  }
}

function removeKeysWithPrefix(prefix: string): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && (key === prefix || key.startsWith(prefix + MARKET_ARCHIVE_MARKER))) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    window.localStorage.removeItem(key);
    archivedSizes.delete(key);
  }
}

/** Borra el mercado guardado de la partida activa (incluidos sus archivos). */
export function clearTransferSave(): void {
  if (!hasStorage()) return;
  try {
    removeKeysWithPrefix(storageKeyForActiveSave());
  } catch {
    /* sin espacio o modo privado: no pasa nada */
  }
}

/** Borra el mercado guardado de una partida concreta por id (al eliminarla). */
export function clearTransferSaveFor(saveId: string): void {
  if (!hasStorage() || !saveId) return;
  try {
    removeKeysWithPrefix(`${STORAGE_KEY_PREFIX}:${saveId}`);
  } catch {
    /* sin espacio o modo privado: no pasa nada */
  }
}

/** Borra TODOS los mercados guardados (al crear una nueva partida desde cero). */
export function clearAllTransferSaves(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(LEGACY_GLOBAL_STORAGE_KEY);
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX + ":")) keysToRemove.push(key);
    }
    for (const key of keysToRemove) window.localStorage.removeItem(key);
    archivedSizes.clear();
  } catch {
    /* sin espacio o modo privado: no pasa nada */
  }
}

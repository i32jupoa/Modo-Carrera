/**
 * Persistencia del mercado.
 *
 * Guarda el estado de la simulación, las finanzas de los clubes, los cambios
 * sobre las fichas de los jugadores, el historial y los rumores — todo lo
 * que no se puede reconstruir de forma determinista. Todo lo demás (índices,
 * perfiles de club, valoraciones) se recalcula al cargar, porque depende
 * únicamente de los datos base y de semillas estables.
 *
 * IMPORTANTE: el mercado se guarda POR PARTIDA (`fcsim:market:v1:{id}`) y,
 * dentro de cada partida, el historial y los rumores de las ventanas ya
 * cerradas se archivan en una clave propia por ventana de fichajes
 * (`fcsim:market:v1:{id}:w:{temporada}:{ventana}`). Así el mercado de cada
 * año/ventana queda almacenado por separado: no se reescribe en cada
 * guardado y no se pierde al simular partidos.
 *
 * DÓNDE VIVE: en IndexedDB (`marketIdb.ts`), no en `localStorage`. El
 * mercado es, con diferencia, lo que más pesa de todo lo que guarda la
 * partida (rumores + historial + negociaciones de una carrera larga pueden
 * ocupar varios MB en una sola clave) y `localStorage` sólo da entre 5 y
 * 10 MB por sitio en la mayoría de navegadores — esa única clave podía
 * agotar la cuota ella sola. IndexedDB usa la cuota del disco, muchísimo más
 * amplia, así que aquí ya no hay techo real que golpear. Todas las funciones
 * de este archivo son asíncronas por eso, pero se llaman siempre desde
 * puntos que ya toleran esperar (el `useEffect` de `useMarketClock.ts`),
 * nunca desde el arranque síncrono de la app.
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
import { idbGetItem, idbListKeys, idbRemoveItem, idbSetItem } from "./marketIdb";
import { MARKET_STATE_VERSION, MARKET_STORAGE_KEY_PREFIX } from "./constants";
import type { ClubFinances, Rumor, TransferRecord } from "./types";

// Clave heredada de cuando el mercado era global (una sola partida para todo
// el juego). Se usa sólo para migrar UNA VEZ los datos a la partida activa
// la primera vez que se carga tras esta corrección; después se borra, para
// que ninguna otra partida pueda heredarla por accidente.
const LEGACY_GLOBAL_STORAGE_KEY = MARKET_STORAGE_KEY_PREFIX;
const STORAGE_KEY_PREFIX = MARKET_STORAGE_KEY_PREFIX;
const VERSION = MARKET_STATE_VERSION;

/** Marca de los archivos de mercado ya cerrados: `...:{saveId}:w:{ventana}`. */
export const MARKET_ARCHIVE_MARKER = ":w:";

/**
 * Clave de almacenamiento del mercado para la partida actualmente activa.
 */
function storageKeyForActiveSave(): string | null {
  const saveId = getCurrentSaveId();
  return saveId ? `${STORAGE_KEY_PREFIX}:${saveId}` : null;
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

/** ¿Estamos en un entorno con `localStorage`? (sólo para la migración). */
function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Migración única: si esta clave (o alguno de sus archivos por ventana)
 * todavía vive en `localStorage` de una versión anterior del juego, se
 * copia a IndexedDB y se borra de `localStorage` para liberar esa cuota tan
 * pequeña. Idempotente y silenciosa: si no hay nada que migrar no hace nada.
 */
async function migrateKeyFromLocalStorage(baseKey: string): Promise<void> {
  if (!hasLocalStorage()) return;
  try {
    const prefix = baseKey; // cubre baseKey y baseKey + MARKET_ARCHIVE_MARKER + ...
    const legacyKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k === prefix || k.startsWith(prefix + MARKET_ARCHIVE_MARKER))) legacyKeys.push(k);
    }
    for (const key of legacyKeys) {
      const value = window.localStorage.getItem(key);
      if (value == null) continue;
      const alreadyInIdb = await idbGetItem(key);
      if (alreadyInIdb == null) await idbSetItem(key, value);
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* no crítico: se reintentará en el próximo arranque */
      }
    }
  } catch {
    /* si la migración falla no debe bloquear el arranque del mercado */
  }
}

/**
 * Barrido único de TODO lo que el mercado dejó en `localStorage` en
 * versiones anteriores del juego, para todas las partidas guardadas y no
 * sólo la activa. Se llama una vez al arrancar la app (ver `__root.tsx`)
 * para que ninguna partida se quede esperando a abrirse para liberar esa
 * cuota.
 */
export async function migrateAllMarketDataFromLocalStorage(): Promise<void> {
  if (!hasLocalStorage()) return;
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      // Solo migramos mercados que ya pertenecen a una partida concreta.
      // La clave global antigua no tiene forma fiable de saber a qué partida
      // pertenecía, así que jamás debe pasar a una carrera nueva.
      if (k && k.startsWith(`${STORAGE_KEY_PREFIX}:`)) legacyKeys.push(k);
    }
    for (const key of legacyKeys) {
      const value = window.localStorage.getItem(key);
      if (value == null) continue;
      const alreadyInIdb = await idbGetItem(key);
      if (alreadyInIdb == null) await idbSetItem(key, value);
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* no crítico */
      }
    }

    // El mercado global de la versión antigua queda invalidado de forma
    // definitiva. Mantenerlo permitiría que una implementación antigua o una
    // migración parcial lo reinyectase en una partida distinta.
    await idbRemoveItem(LEGACY_GLOBAL_STORAGE_KEY);
    const oldArchiveKeys = await idbListKeys(`${LEGACY_GLOBAL_STORAGE_KEY}${MARKET_ARCHIVE_MARKER}`);
    for (const key of oldArchiveKeys) await idbRemoveItem(key);
    try {
      window.localStorage.removeItem(LEGACY_GLOBAL_STORAGE_KEY);
    } catch {
      /* no crítico */
    }
  } catch (e) {
    console.warn("[transfers] no se pudo migrar/limpiar el mercado antiguo:", e);
  }
}

/** Tamaño ya archivado de cada ventana, para no reescribirla en cada guardado. */
const archivedSizes = new Map<string, number>();

/**
 * Nº máximo de ventanas de mercado archivadas que se conservan por partida
 * (24 ventanas ≈ 12 temporadas de historial y rumores). Ahora que el mercado
 * vive en IndexedDB ya no hay presión real de cuota, pero se mantiene un
 * tope para no acumular para siempre: superarlo sólo alargaría cada arranque
 * (hay que leer todas las ventanas archivadas) sin aportar nada, ya que el
 * historial y los rumores tan antiguos casi no se consultan.
 */
const MAX_ARCHIVED_WINDOWS = 24;

/** Descarta las ventanas archivadas más antiguas por encima del tope. */
async function enforceArchiveCap(baseKey: string, archivedWindows: string[]): Promise<string[]> {
  if (archivedWindows.length <= MAX_ARCHIVED_WINDOWS) return archivedWindows;
  const sorted = [...archivedWindows].sort();
  const overflow = sorted.length - MAX_ARCHIVED_WINDOWS;
  const toDrop = sorted.slice(0, overflow);
  const kept = sorted.slice(overflow);

  for (const windowKey of toDrop) {
    const key = archiveKey(baseKey, windowKey);
    await idbRemoveItem(key);
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
 * Guarda el mercado en IndexedDB, en la ranura de la partida activa.
 *
 * El historial y los rumores de ventanas ya cerradas se escriben una sola vez
 * en su propia clave por año/ventana; la clave principal sólo lleva la ventana
 * en curso más el estado vivo (simulación, finanzas, negociaciones). Nunca lanza.
 */
export async function saveTransferSystem(): Promise<boolean> {
  try {
    const baseKey = storageKeyForActiveSave();
    if (!baseKey) return false;
    const snapshot = snapshotTransferSystem();
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
      const alreadyStored = archivedSizes.get(key) === size && (await idbGetItem(key)) !== null;
      if (!alreadyStored) {
        const archive: WindowArchive = { version: VERSION, windowKey, history, rumors };
        if (await idbSetItem(key, JSON.stringify(archive))) archivedSizes.set(key, size);
        else continue; // sin espacio: esa ventana se queda en la clave principal
      }
      archivedWindows.push(windowKey);
    }

    const cappedArchivedWindows = await enforceArchiveCap(baseKey, archivedWindows);
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

    return await idbSetItem(baseKey, JSON.stringify(core));
  } catch (error) {
    console.warn("[transfers] no se pudo guardar el mercado:", (error as Error)?.message);
    return false;
  }
}

/**
 * Lee el mercado guardado de la partida activa, si existe y es válido,
 * reuniendo la ventana en curso con todas las ventanas archivadas. Antes de
 * leer, migra a IndexedDB cualquier resto que esta partida tuviera todavía
 * en `localStorage` de una versión anterior del juego.
 */
export async function loadTransferSave(): Promise<TransferSaveData | null> {
  try {
    const key = storageKeyForActiveSave();
    // Sin id de partida no existe ningún mercado válido que cargar.
    // Esto evita que una carrera nueva pueda heredar el mercado de otra.
    if (!key) return null;

    await migrateKeyFromLocalStorage(key);
    const raw = await idbGetItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as TransferSaveData;
    if (parsed?.version !== VERSION) return null;

    const history: TransferRecord[] = [...(parsed.history ?? [])];
    const rumors: Rumor[] = [...(parsed.rumors ?? [])];

    for (const windowKey of parsed.archivedWindows ?? []) {
      const archiveRaw = await idbGetItem(archiveKey(key, windowKey));
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

async function removeKeysWithPrefix(prefix: string): Promise<void> {
  const keys = await idbListKeys(prefix);
  for (const key of keys) {
    if (key === prefix || key.startsWith(prefix + MARKET_ARCHIVE_MARKER)) {
      await idbRemoveItem(key);
      archivedSizes.delete(key);
    }
  }
  // Por si quedara algún resto sin migrar en localStorage de esta partida.
  if (hasLocalStorage()) {
    try {
      const legacyKeys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (k === prefix || k.startsWith(prefix + MARKET_ARCHIVE_MARKER))) legacyKeys.push(k);
      }
      for (const k of legacyKeys) window.localStorage.removeItem(k);
    } catch {
      /* no crítico */
    }
  }
}

/** Borra el mercado guardado de la partida activa (incluidos sus archivos). */
export async function clearTransferSave(): Promise<void> {
  try {
    const key = storageKeyForActiveSave();
    if (!key) return;
    await removeKeysWithPrefix(key);
  } catch {
    /* sin espacio o modo privado: no pasa nada */
  }
}

/** Borra el mercado guardado de una partida concreta por id (al eliminarla). */
export async function clearTransferSaveFor(saveId: string): Promise<void> {
  if (!saveId) return;
  try {
    await removeKeysWithPrefix(`${STORAGE_KEY_PREFIX}:${saveId}`);
  } catch {
    /* sin espacio o modo privado: no pasa nada */
  }
}

/** Borra TODOS los mercados guardados (al crear una nueva partida desde cero). */
export async function clearAllTransferSaves(): Promise<void> {
  try {
    if (hasLocalStorage()) {
      try {
        window.localStorage.removeItem(LEGACY_GLOBAL_STORAGE_KEY);
      } catch {
        /* no crítico */
      }
    }
    const keys = await idbListKeys(STORAGE_KEY_PREFIX + ":");
    for (const key of keys) await idbRemoveItem(key);
    archivedSizes.clear();
  } catch {
    /* sin espacio o modo privado: no pasa nada */
  }
}

/**
 * Persistencia del mercado.
 *
 * Guarda en `localStorage` sólo lo que no se puede reconstruir de forma
 * determinista: el estado de la simulación, las finanzas de los clubes, los
 * cambios sobre las fichas de los jugadores, el historial y los rumores.
 * Todo lo demás (índices, perfiles de club, valoraciones) se recalcula al
 * cargar, porque depende únicamente de los datos base y de semillas estables.
 *
 * IMPORTANTE: el mercado se guarda POR PARTIDA, igual que el resto del
 * `SaveGame` (`fcsim:save:v2:{id}`). Antes vivía en una única clave global
 * compartida por todas las partidas, así que cargar una partida distinta a
 * la última jugada podía aplicarle el mercado de otra, o disparar un reset
 * completo que borraba los fichajes de la IA ya cerrados. Ver `getCurrentSaveId`.
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
import { restoreTransferHistory, snapshotTransferHistory } from "./TransferHistory";
import { restoreRumors, snapshotRumors } from "./RumorEngine";
import { restoreUserDeals, snapshotUserDeals, type UserDeal } from "./UserNegotiation";
import {
  restorePursuitMemory,
  snapshotPursuitMemory,
  type PursuitMemoryEntry,
} from "./TransferEngine";
import { getCurrentSaveId } from "@/lib/savedGames";
import { MARKET_STATE_VERSION, MARKET_STORAGE_KEY_PREFIX } from "./constants";
import type { ClubFinances, Rumor, TransferRecord } from "./types";

// Clave heredada de cuando el mercado era global (una sola partida para todo
// el juego). Se usa sólo para migrar UNA VEZ los datos a la partida activa
// la primera vez que se carga tras esta corrección; después se borra, para
// que ninguna otra partida pueda heredarla por accidente.
const LEGACY_GLOBAL_STORAGE_KEY = MARKET_STORAGE_KEY_PREFIX;
const STORAGE_KEY_PREFIX = MARKET_STORAGE_KEY_PREFIX;
// v3 añade `pursuits`: la memoria de rechazos recientes por club-jugador.
// Sin ella, cargar una partida "olvidaba" a quién había rechazado ya un
// club y el mercado volvía a ofertar por los mismos jugadores al instante.
// (Ver MARKET_STATE_VERSION en `constants.ts`: es la única fuente de verdad
// de la versión, para que este archivo no pueda desincronizarse de ella.)
const VERSION = MARKET_STATE_VERSION;

/**
 * Clave de almacenamiento del mercado para la partida actualmente activa.
 * Si por algún motivo no hay partida activa (no debería ocurrir mientras el
 * reloj del mercado está en marcha), se usa la clave heredada como último
 * recurso para no perder datos, pero nunca se comparte entre partidas con id.
 */
function storageKeyForActiveSave(): string {
  const saveId = getCurrentSaveId();
  return saveId ? `${STORAGE_KEY_PREFIX}:${saveId}` : LEGACY_GLOBAL_STORAGE_KEY;
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

/** Guarda el mercado en `localStorage`, en la ranura de la partida activa. Nunca lanza. */
export function saveTransferSystem(): boolean {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(storageKeyForActiveSave(), JSON.stringify(snapshotTransferSystem()));
    return true;
  } catch (error) {
    console.warn("[transfers] no se pudo guardar el mercado:", (error as Error)?.message);
    return false;
  }
}

/**
 * Lee el mercado guardado de la partida activa, si existe y es válido.
 *
 * Migración de compatibilidad: si esta partida todavía no tiene su propia
 * ranura pero existe la clave global antigua (de antes de que el mercado
 * fuera por partida), se adopta una única vez para esa partida y se borra la
 * clave global, de forma que ninguna otra partida pueda heredarla después.
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
    return parsed?.version === VERSION ? parsed : null;
  } catch {
    return null;
  }
}

/** Borra el mercado guardado de la partida activa. */
export function clearTransferSave(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(storageKeyForActiveSave());
  } catch {
    /* sin espacio o modo privado: no pasa nada */
  }
}

/** Borra el mercado guardado de una partida concreta por id (al eliminarla). */
export function clearTransferSaveFor(saveId: string): void {
  if (!hasStorage() || !saveId) return;
  try {
    window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}:${saveId}`);
  } catch {
    /* sin espacio o modo privado: no pasa nada */
  }
}

/**
 * Persistencia del mercado.
 *
 * Guarda en `localStorage` sólo lo que no se puede reconstruir de forma
 * determinista: el estado de la simulación, las finanzas de los clubes, los
 * cambios sobre las fichas de los jugadores, el historial y los rumores.
 * Todo lo demás (índices, perfiles de club, valoraciones) se recalcula al
 * cargar, porque depende únicamente de los datos base y de semillas estables.
 */

import { restoreFinances, snapshotFinances } from "./BudgetManager";
import { restorePlayerDeltas, snapshotPlayerDeltas, type PlayerDelta } from "./PlayerIndex";
import { restoreSimulation, snapshotSimulation, type SimulationSnapshot } from "./MarketSimulation";
import { restoreTransferHistory, snapshotTransferHistory } from "./TransferHistory";
import { restoreRumors, snapshotRumors } from "./RumorEngine";
import { restoreUserDeals, snapshotUserDeals, type UserDeal } from "./UserNegotiation";
import {
  restorePursuitMemory,
  snapshotPursuitMemory,
  type PursuitMemoryEntry,
} from "./TransferEngine";
import type { ClubFinances, Rumor, TransferRecord } from "./types";

const STORAGE_KEY = "fcsim:market:v1";
// v3 añade `pursuits`: la memoria de rechazos recientes por club-jugador.
// Sin ella, cargar una partida "olvidaba" a quién había rechazado ya un
// club y el mercado volvía a ofertar por los mismos jugadores al instante.
const VERSION = 3;

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
  return true;
}

/** ¿Estamos en un entorno con `localStorage`? */
function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Guarda el mercado en `localStorage`. Nunca lanza. */
export function saveTransferSystem(): boolean {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotTransferSystem()));
    return true;
  } catch (error) {
    console.warn("[transfers] no se pudo guardar el mercado:", (error as Error)?.message);
    return false;
  }
}

/** Lee la partida de mercado guardada, si existe y es válida. */
export function loadTransferSave(): TransferSaveData | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TransferSaveData;
    return parsed?.version === VERSION ? parsed : null;
  } catch {
    return null;
  }
}

/** Borra la partida de mercado guardada. */
export function clearTransferSave(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sin espacio o modo privado: no pasa nada */
  }
}

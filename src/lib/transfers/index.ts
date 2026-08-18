/**
 * Punto de entrada del sistema de mercado.
 *
 * Mantiene la API que consume la UI (`src/routes/transfers.tsx`) y expone la
 * simulación diaria, el historial de traspasos y los rumores.
 */

import { resetBidWars } from "./BidWar";
import { resetNegotiations } from "./NegotiationEngine";
import { resetTransferEngine } from "./TransferEngine";
import { resetSquadReports } from "./SquadAnalyzer";
import { resetFinances } from "./BudgetManager";
import { resetClubProfiles } from "./ClubStrategy";
import { resetMarketIndex } from "./PlayerIndex";
import { resetTransferHistory } from "./TransferHistory";
import { resetRumors } from "./RumorEngine";
import { resetMarketLocks } from "./MarketLocks";
import { resetUserDeals } from "./UserNegotiation";
import {
  getSimulationState,
  initializeSimulation,
  mergeDayResults,
  resetSimulation,
  simulateUntil,
} from "./MarketSimulation";
import {
  applyTransferSnapshot,
  clearAllTransferSaves,
  loadTransferSave,
  saveTransferSystem,
} from "./Persistence";
import type { MarketDayResult, MarketSimulationState } from "./types";

export * from "./types";
export * from "./constants";
export * from "./random";
export * from "./PlayerIndex";
export * from "./ClubStrategy";
export * from "./SquadAnalyzer";
export * from "./BudgetManager";
export * from "./MarketValuation";
export * from "./PlayerDecision";
export * from "./NegotiationEngine";
export * from "./BidWar";
export * from "./TransferEngine";
export * from "./ContractEngine";
export * from "./LoanEngine";
export * from "./TransferHistory";
export * from "./RumorEngine";
export * from "./MarketLocks";
export * from "./MarketSimulation";
export * from "./Persistence";
export * from "./UserNegotiation";

/** ¿Está el sistema de mercado inicializado? */
export function isTransferSystemInitialized(): boolean {
  return getSimulationState() !== null;
}

/** Inicializa el sistema de mercado para una fecha dada. */
export function initializeTransferSystem(date: string): MarketSimulationState {
  return initializeSimulation(date);
}

/**
 * Todos los `reset*()` de módulo que hay que vaciar al cambiar de partida.
 *
 * Cada módulo del motor guarda su propio estado en variables de módulo
 * (índices, cachés, mapas de interés...). Si uno de ellos no se resetea al
 * cargar otra partida, la fuga de estado entre partidas no da ningún error:
 * simplemente el mercado de la partida nueva arranca "contaminado" con datos
 * de la anterior. Se centraliza en una lista, en vez de siete llamadas
 * sueltas, para que añadir un módulo nuevo con caché propia sea tan fácil
 * como añadir una línea aquí — y para que sea evidente si falta.
 */
const MODULE_RESETTERS: Array<() => void> = [
  resetMarketLocks,
  resetSimulation,
  resetUserDeals,
  resetRumors,
  resetTransferHistory,
  resetNegotiations,
  resetBidWars,
  resetTransferEngine,
  resetSquadReports,
  resetFinances,
  resetClubProfiles,
  resetMarketIndex,
];

/** Reinicia el sistema completo (útil al cargar otra partida). */
export function resetTransferSystem(): void {
  for (const reset of MODULE_RESETTERS) reset();
}

/**
 * Avanza la simulación hasta la fecha indicada y devuelve el resumen agregado
 * de todos los días simulados.
 */
export function simulateMarketForDate(date: string): MarketDayResult {
  return mergeDayResults(simulateUntil(date));
}

/**
 * Carga la partida de mercado guardada si existe; si no, arranca una nueva.
 * Devuelve `true` cuando se ha restaurado una partida previa.
 */
export function loadOrInitTransferSystem(date: string): {
  restored: boolean;
  state: MarketSimulationState;
} {
  const saved = loadTransferSave();
  if (saved && applyTransferSnapshot(saved)) {
    const state = getSimulationState() ?? initializeSimulation(date);
    return { restored: true, state };
  }
  return { restored: false, state: initializeSimulation(date) };
}

/**
 * Sincroniza el mercado con la fecha del juego: simula los días pendientes y
 * guarda el resultado. Si la fecha ya está simulada no hace nada.
 */
export function syncMarketWithGameDate(date: string): MarketDayResult | null {
  const state = getSimulationState();
  if (state && state.lastSimulatedDate === date) return null;
  const result = simulateMarketForDate(date);
  saveTransferSystem();
  return result;
}

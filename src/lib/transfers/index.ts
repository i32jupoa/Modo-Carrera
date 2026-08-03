/**
 * Punto de entrada del sistema de mercado.
 *
 * Mantiene la API que consume la UI (`src/routes/transfers.tsx`) mientras se
 * reconstruye el motor por fases.
 */

import { BALANCE, MARKET_TIMING } from "./constants";
import type { MarketDayResult, MarketSimulationState, MarketWindow } from "./types";

export * from "./types";
export * from "./constants";
export * from "./random";
export * from "./MarketValuation";
export * from "./NegotiationEngine";

// ============================================================================
// ESTADO DEL SISTEMA
// ============================================================================

let simulation: MarketSimulationState | null = null;

function windowForDate(date: string): MarketWindow {
  const month = Number(date.slice(5, 7));
  if (month >= 7 && month <= 8) return "summer";
  if (month === 1) return "winter";
  return "closed";
}

/** ¿Está el sistema de mercado inicializado? */
export function isTransferSystemInitialized(): boolean {
  return simulation !== null;
}

/** Inicializa el sistema de mercado para una fecha dada. */
export function initializeTransferSystem(date: string): MarketSimulationState {
  const window = windowForDate(date);
  simulation = {
    lastSimulatedDate: date,
    window,
    windowDay: 1,
    intensity:
      window === "winter"
        ? BALANCE.minIntensity + BALANCE.winterFactor * 0.3
        : (BALANCE.minIntensity + BALANCE.maxIntensity) / 2,
    deadlineDay: false,
  };
  return simulation;
}

/** Estado actual de la simulación (null si no está inicializado). */
export function getSimulationState(): MarketSimulationState | null {
  return simulation;
}

/** Reinicia el sistema (útil al cargar otra partida). */
export function resetTransferSystem(): void {
  simulation = null;
}

/**
 * Avanza la simulación hasta la fecha indicada.
 *
 * Por ahora sólo actualiza el estado de la ventana; la IA diaria de clubes
 * llega en la fase de simulación.
 */
export function simulateMarketForDate(date: string): MarketDayResult {
  if (!simulation) initializeTransferSystem(date);
  const state = simulation!;

  const nextWindow = windowForDate(date);
  if (nextWindow !== state.window) {
    state.window = nextWindow;
    state.windowDay = 1;
  } else if (date !== state.lastSimulatedDate) {
    state.windowDay += 1;
  }

  state.lastSimulatedDate = date;
  state.deadlineDay =
    state.window !== "closed" &&
    Number(date.slice(8, 10)) > 31 - MARKET_TIMING.deadlineDays;

  return {
    date,
    transfers: [],
    rumors: [],
    offersMade: 0,
    negotiationsOpen: 0,
    renewals: 0,
    loans: 0,
  };
}

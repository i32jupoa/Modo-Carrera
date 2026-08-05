/**
 * Simulación diaria del mercado.
 *
 * Es el reloj del sistema: reparte la actividad de la IA por los días del
 * calendario en lugar de resolver la ventana de golpe.
 *
 *   - cada día actúa sólo un puñado de clubes (elegidos de forma determinista),
 *   - cada club activo renueva, busca, vende, cede o negocia,
 *   - el deadline day multiplica la actividad y hunde los precios,
 *   - y cada ventana tiene su propia intensidad: hay veranos locos y veranos
 *     tranquilos, y nunca gastan todos a la vez.
 *
 * Todo lo que ocurre se vuelca en `TransferHistory` y `RumorEngine`.
 */

import { BALANCE, MARKET_TIMING } from "./constants";
import { getMarketIndex } from "./PlayerIndex";
import { getClubProfile } from "./ClubStrategy";
import { needsToSell, refillForNewWindow } from "./BudgetManager";
import { expireStaleNegotiations, listNegotiations } from "./NegotiationEngine";
import { clubWantsToActToday, priorityNeeds, runClubTransferCycle } from "./TransferEngine";
import { runClubContractCycle, advanceSeason } from "./ContractEngine";
import { runClubLoanCycle, resolveLoansEndOfSeason } from "./LoanEngine";
import { recordTransfers } from "./TransferHistory";
import { rumorBidWar, rumorInterest, rumorRenewal, rumorSearching } from "./RumorEngine";
import { clamp, seededUnit } from "./random";
import type { MarketDayResult, MarketSimulationState, MarketWindow, Rumor } from "./types";

// ============================================================================
// CALENDARIO
// ============================================================================

/** Parte una fecha ISO (YYYY-MM-DD) en sus componentes numéricos. */
function parseDate(date: string): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** Ventana de mercado abierta en una fecha. */
export function windowForDate(date: string): MarketWindow {
  const { month } = parseDate(date);
  if (month >= 7 && month <= 8) return "summer";
  if (month === 1) return "winter";
  return "closed";
}

/** Último día natural del mes de cierre de cada ventana. */
function windowLastDay(window: MarketWindow): { month: number; day: number } | null {
  if (window === "summer") return { month: 8, day: 31 };
  if (window === "winter") return { month: 1, day: 31 };
  return null;
}

/** ¿Estamos en los últimos días de la ventana? */
export function isDeadlineDay(date: string): boolean {
  const window = windowForDate(date);
  const last = windowLastDay(window);
  if (!last) return false;
  const { month, day } = parseDate(date);
  return month === last.month && day > last.day - MARKET_TIMING.deadlineDays;
}

/** Temporada deportiva a la que pertenece la fecha (agosto→junio). */
export function seasonOf(date: string): number {
  const { year, month } = parseDate(date);
  return month >= 7 ? year : year - 1;
}

/** Identificador estable de la ventana actual, usado como semilla. */
function windowKey(date: string): string {
  return `${seasonOf(date)}:${windowForDate(date)}`;
}

// ============================================================================
// ESTADO
// ============================================================================

/** Contadores de una ventana para un club. */
export interface ClubWindowState {
  signings: number;
  sales: number;
  loans: number;
  dormant: boolean;
}

interface SimulationInternals {
  state: MarketSimulationState;
  windowKey: string;
  clubs: Map<string, ClubWindowState>;
  lastSeasonRolled: number;
}

let internals: SimulationInternals | null = null;

/** Intensidad de la ventana: hay mercados locos y mercados muertos. */
function intensityFor(date: string): number {
  const window = windowForDate(date);
  if (window === "closed") return 0;
  const roll = seededUnit(windowKey(date), "intensity");
  const base = BALANCE.minIntensity + roll * (BALANCE.maxIntensity - BALANCE.minIntensity);
  return window === "winter" ? base * BALANCE.winterFactor : base;
}

/** Ids de los clubes con plantilla indexada. */
function allClubIds(): string[] {
  return Array.from(getMarketIndex().byClub.keys());
}

/** Prepara los contadores de una ventana nueva y recarga presupuestos. */
function openWindow(date: string): SimulationInternals {
  const key = windowKey(date);
  const clubs = new Map<string, ClubWindowState>();
  for (const clubId of allClubIds()) {
    refillForNewWindow(clubId);
    clubs.set(clubId, {
      signings: 0,
      sales: 0,
      loans: 0,
      dormant: seededUnit(clubId, key, "dormant") < BALANCE.dormantClubChance,
    });
  }
  return {
    state: {
      lastSimulatedDate: date,
      window: windowForDate(date),
      windowDay: 1,
      intensity: intensityFor(date),
      deadlineDay: isDeadlineDay(date),
    },
    windowKey: key,
    clubs,
    lastSeasonRolled: internals?.lastSeasonRolled ?? seasonOf(date),
  };
}

/** Inicializa (o reinicia) la simulación para una fecha. */
export function initializeSimulation(date: string): MarketSimulationState {
  internals = openWindow(date);
  return internals.state;
}

/** Estado actual, o null si aún no se ha inicializado. */
export function getSimulationState(): MarketSimulationState | null {
  return internals?.state ?? null;
}

/** Limpia el estado de simulación. */
export function resetSimulation(): void {
  internals = null;
}

/** Contadores de un club en la ventana en curso. */
export function clubWindowState(clubId: string): ClubWindowState {
  const existing = internals?.clubs.get(clubId);
  if (existing) return existing;
  const fresh: ClubWindowState = { signings: 0, sales: 0, loans: 0, dormant: false };
  internals?.clubs.set(clubId, fresh);
  return fresh;
}

// ============================================================================
// SELECCIÓN DE CLUBES ACTIVOS
// ============================================================================

/** Porcentaje de clubes que se mueven hoy. */
function activeShare(state: MarketSimulationState): number {
  const base = state.deadlineDay
    ? MARKET_TIMING.deadlineActiveClubShare
    : MARKET_TIMING.dailyActiveClubShare;
  return clamp(base * Math.max(state.intensity, 0.2), 0, 1);
}

/**
 * Clubes que actúan hoy: ni todos a la vez ni siempre los mismos.
 *
 * Los clubes "dormant" (ver `BALANCE.dormantClubChance`) NO se excluyen de
 * aquí: siguen entrando en la rotación diaria igual que cualquier otro, para
 * que sigan renovando contratos, cediendo jugadores y pudiendo vender a
 * quien les haga una oferta. Lo único que se les restringe es salir a
 * comprar por iniciativa propia (ver `runClubDay`), y solo fuera de
 * deadline day. Antes se les excluía de la actividad diaria por completo,
 * así que un ~18% de los clubes pasaba la ventana entera invisible.
 */
export function activeClubsForDate(date: string, state: MarketSimulationState): string[] {
  const share = activeShare(state);
  return allClubIds().filter((clubId) => clubWantsToActToday(clubId, date, share));
}

// ============================================================================
// DÍA DE MERCADO
// ============================================================================

/** Acciones que puede tomar un club en su turno diario. */
function runClubDay(
  clubId: string,
  date: string,
  state: MarketSimulationState,
  result: MarketDayResult,
): void {
  const window = clubWindowState(clubId);
  const profile = getClubProfile(clubId);
  const rumors: Array<Rumor | null> = [];

  // 1. Contratos: renovaciones y revisión de la lista de transferibles.
  if (seededUnit(clubId, date, "contracts") < 0.5) {
    const contracts = runClubContractCycle(clubId, { date });
    for (const renewal of contracts.renewals) {
      if (renewal.renewed) result.renewals += 1;
      rumors.push(rumorRenewal(clubId, renewal.playerId, renewal.renewed, date));
    }
  }

  if (state.window === "closed") {
    pushRumors(result, rumors);
    return;
  }

  // 2. Cesiones: colocar a quien no juega.
  if (window.loans < MARKET_TIMING.maxSalesPerWindow && seededUnit(clubId, date, "loans") < 0.35) {
    const loanCycle = runClubLoanCycle(clubId, { date, deadlineDay: state.deadlineDay });
    for (const loan of loanCycle.loans) {
      if (!loan.agreed) continue;
      window.loans += 1;
      result.loans += 1;
      if (loan.record) {
        recordTransfers([loan.record]);
        result.transfers.push(loan.record);
      }
    }
  }

  // 3. Fichajes: sólo si queda cupo, no está obligado a hacer caja primero,
  // y —si es un club "conservador" esta ventana— si es deadline day (fuera
  // de deadline day, un club dormant no sale a fichar por iniciativa propia,
  // pero sigue pudiendo vender si otro club le hace una oferta).
  const canBuy =
    window.signings < MARKET_TIMING.maxSigningsPerWindow &&
    !needsToSell(clubId) &&
    !(window.dormant && !state.deadlineDay);
  if (canBuy) {
    for (const need of priorityNeeds(clubId, date, state.deadlineDay ? 3 : 2)) {
      rumors.push(rumorSearching(clubId, need.group, date));
    }
    const maxSignings = state.deadlineDay && profile.aggression > 0.6 ? 2 : 1;
    const cycle = runClubTransferCycle(clubId, {
      date,
      deadlineDay: state.deadlineDay,
      maxSignings,
    });
    result.offersMade += cycle.attempts.length;
    for (const attempt of cycle.attempts) {
      const playerId = attempt.playerId;
      rumors.push(rumorInterest(clubId, playerId, date));
      rumors.push(rumorBidWar(playerId, date));
    }
    if (cycle.transfers.length > 0) {
      window.signings += cycle.transfers.length;
      recordTransfers(cycle.transfers);
      result.transfers.push(...cycle.transfers);
      for (const transfer of cycle.transfers) {
        if (!transfer.fromClubId) continue;
        clubWindowState(transfer.fromClubId).sales += 1;
      }
    }
  }

  pushRumors(result, rumors);
}

function pushRumors(result: MarketDayResult, rumors: Array<Rumor | null>): void {
  for (const rumor of rumors) if (rumor) result.rumors.push(rumor);
}

/** Simula un único día de mercado. */
export function simulateDay(date: string): MarketDayResult {
  if (!internals) initializeSimulation(date);
  let sim = internals!;

  // Cambio de temporada: contratos que caducan y cedidos que vuelven (las
  // cesiones con obligación de compra se convierten en traspaso firme aquí).
  const season = seasonOf(date);
  let seasonLoanReturns: ReturnType<typeof resolveLoansEndOfSeason> = [];
  if (season > sim.lastSeasonRolled) {
    advanceSeason(date);
    seasonLoanReturns = resolveLoansEndOfSeason(date);
    sim.lastSeasonRolled = season;
  }

  // Cambio de ventana: presupuestos nuevos e intensidad nueva.
  const key = windowKey(date);
  if (key !== sim.windowKey) {
    const rolled = openWindow(date);
    rolled.lastSeasonRolled = sim.lastSeasonRolled;
    internals = rolled;
    sim = rolled;
  } else if (date !== sim.state.lastSimulatedDate) {
    sim.state.windowDay += 1;
  }

  const state = sim.state;
  state.lastSimulatedDate = date;
  state.window = windowForDate(date);
  state.deadlineDay = isDeadlineDay(date);

  const result: MarketDayResult = {
    date,
    transfers: [],
    rumors: [],
    offersMade: 0,
    negotiationsOpen: 0,
    renewals: 0,
    loans: 0,
  };

  // Las obligaciones de compra ejecutadas hoy son traspasos como cualquier
  // otro: que aparezcan en el resumen del día es lo que antes faltaba.
  for (const loanReturn of seasonLoanReturns) {
    if (loanReturn.purchase) result.transfers.push(loanReturn.purchase);
  }

  // Las negociaciones paradas caducan antes de que nadie abra otras nuevas.
  expireStaleNegotiations(date);

  for (const clubId of activeClubsForDate(date, state)) {
    runClubDay(clubId, date, state, result);
  }

  result.negotiationsOpen = listNegotiations().length;
  return result;
}

/**
 * Avanza la simulación hasta la fecha indicada, día a día.
 * Si el juego salta varios días, todos se simulan en orden.
 */
export function simulateUntil(date: string, maxDays = 40): MarketDayResult[] {
  const results: MarketDayResult[] = [];
  if (!internals) {
    results.push(simulateDay(date));
    return results;
  }

  const from = Date.parse(internals.state.lastSimulatedDate);
  const to = Date.parse(date);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) {
    results.push(simulateDay(date));
    return results;
  }

  const days = Math.min(Math.round((to - from) / 86_400_000), maxDays);
  for (let index = 1; index <= days; index += 1) {
    const current = new Date(to - (days - index) * 86_400_000).toISOString().slice(0, 10);
    results.push(simulateDay(current));
  }
  return results;
}

/** Agrega varios días en un único resultado. */
export function mergeDayResults(results: readonly MarketDayResult[]): MarketDayResult {
  const last = results[results.length - 1];
  return {
    date: last?.date ?? "",
    transfers: results.flatMap((r) => r.transfers),
    rumors: results.flatMap((r) => r.rumors),
    offersMade: results.reduce((sum, r) => sum + r.offersMade, 0),
    negotiationsOpen: last?.negotiationsOpen ?? 0,
    renewals: results.reduce((sum, r) => sum + r.renewals, 0),
    loans: results.reduce((sum, r) => sum + r.loans, 0),
  };
}

// ============================================================================
// PERSISTENCIA
// ============================================================================

/** Instantánea serializable de la simulación. */
export interface SimulationSnapshot {
  state: MarketSimulationState;
  windowKey: string;
  lastSeasonRolled: number;
  clubs: Array<[string, ClubWindowState]>;
}

/** Instantánea de la simulación, o null si no está inicializada. */
export function snapshotSimulation(): SimulationSnapshot | null {
  if (!internals) return null;
  return {
    state: { ...internals.state },
    windowKey: internals.windowKey,
    lastSeasonRolled: internals.lastSeasonRolled,
    clubs: Array.from(internals.clubs.entries()).map(([id, s]) => [id, { ...s }]),
  };
}

/** Restaura una instantánea previa de la simulación. */
export function restoreSimulation(snapshot: SimulationSnapshot): MarketSimulationState {
  internals = {
    state: { ...snapshot.state },
    windowKey: snapshot.windowKey,
    lastSeasonRolled: snapshot.lastSeasonRolled,
    clubs: new Map(snapshot.clubs.map(([id, s]) => [id, { ...s }])),
  };
  return internals.state;
}

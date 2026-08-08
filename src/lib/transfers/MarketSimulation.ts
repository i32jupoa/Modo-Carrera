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
import { getUserClubId, needsToSell, refillForNewWindow } from "./BudgetManager";
import { expireStaleNegotiations, listNegotiations } from "./NegotiationEngine";
import {
  clubWantsToActToday,
  forceSellSurplusPlayer,
  priorityNeeds,
  runClubTransferCycle,
  signBestFreeAgent,
} from "./TransferEngine";
import { runClubContractCycle, advanceSeason } from "./ContractEngine";
import { runClubLoanCycle, resolveLoansEndOfSeason } from "./LoanEngine";
import { recordTransfers } from "./TransferHistory";
import { rumorBidWar, rumorInterest, rumorRenewal, rumorSearching } from "./RumorEngine";
import { setLockWindow, windowDeficit} from "./MarketLocks";
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

/**
 * Primer día de la ventana de mercado vigente o, si el mercado está cerrado,
 * de la última ventana que se cerró. La UI lo usa para mostrar el historial
 * completo de una ventana al filtrar por club.
 */
export function currentWindowStart(date: string): string {
  const { year, month } = parseDate(date);
  if (month >= 7) return `${year}-07-01`;
  if (month === 1) return `${year}-01-01`;
  // Febrero-junio: la última ventana fue el mercado de invierno de ese año.
  return `${year}-01-01`;
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

/** Identificador de ventana de una fecha cualquiera (usado al restaurar). */
export function windowKeyForDate(date: string): string {
  return windowKey(date);
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
  /**
   * Próximo día de ventana en el que la red de seguridad de fichajes puede
   * volver a intentarlo. Cada club arranca en un día distinto (repartido a
   * lo largo de las primeras semanas, no todos el mismo día) y, si falla,
   * lo reintenta pasados unos días en vez de esperar al deadline day. Así
   * la actividad "de repesca" se reparte en vez de amontonarse toda en una
   * única jornada gigante y luego no volver a tocarla hasta el final.
   */
  nextSigningAttempt: number;
  /** Igual que `nextSigningAttempt`, pero para la red de seguridad de ventas. */
  nextSalesAttempt: number;
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
  if (window === "winter") return base * BALANCE.winterFactor;
  if (window === "summer") return base * BALANCE.summerFactor;
  return base;
}

/** Mínimo de fichajes exigido a un club de la IA según la ventana. */
function minSigningsFor(window: MarketWindow): number {
  return window === "summer"
    ? MARKET_TIMING.minSigningsPerWindowSummer
    : MARKET_TIMING.minSigningsPerWindow;
}

/** Mínimo de ventas exigido a un club de la IA según la ventana (0 fuera de verano). */
function minSalesFor(window: MarketWindow): number {
  return window === "summer" ? MARKET_TIMING.minSalesPerWindowSummer : 0;
}

/**
 * Día de ventana en el que un club concreto empieza a poder usar la red de
 * seguridad (fichajes o ventas), repartido de forma determinista dentro de
 * `[minDay, maxDay]`. Cada club "cae" en un día distinto en vez de todos a
 * la vez: así la repesca no se amontona en una única jornada gigantesca.
 */
function staggeredSafetyNetDay(clubId: string, kind: "signing" | "sale", key: string): number {
  const roll = seededUnit(clubId, key, "safety-net-start", kind);
  const { minDay, maxDay } = MARKET_TIMING.safetyNetWindow;
  return minDay + Math.round(roll * (maxDay - minDay));
}

/** Ids de los clubes con plantilla indexada. */
function allClubIds(): string[] {
  return Array.from(getMarketIndex().byClub.keys());
}

/** Prepara los contadores de una ventana nueva y recarga presupuestos. */
function openWindow(date: string): SimulationInternals {
  const key = windowKey(date);
  setLockWindow(key);
  const clubs = new Map<string, ClubWindowState>();
  for (const clubId of allClubIds()) {
    refillForNewWindow(clubId);
    clubs.set(clubId, {
      signings: 0,
      sales: 0,
      loans: 0,
      dormant: seededUnit(clubId, key, "dormant") < BALANCE.dormantClubChance,
      nextSigningAttempt: staggeredSafetyNetDay(clubId, "signing", key),
      nextSalesAttempt: staggeredSafetyNetDay(clubId, "sale", key),
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
  const fresh: ClubWindowState = {
    signings: 0,
    sales: 0,
    loans: 0,
    dormant: false,
    nextSigningAttempt: internals
      ? staggeredSafetyNetDay(clubId, "signing", internals.windowKey)
      : 0,
    nextSalesAttempt: internals ? staggeredSafetyNetDay(clubId, "sale", internals.windowKey) : 0,
  };
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
  // A medida que avanza la ventana, los clubes que todavía no han movido nada
  // (ni entradas ni salidas) entran con más frecuencia en la rotación: en la
  // vida real todos los equipos acaban haciendo algún movimiento.
  const urgency = clamp((state.windowDay - 5) / 25, 0, 1);
  return allClubIds().filter((clubId) => {
    if (clubWantsToActToday(clubId, date, share)) return true;
    if (urgency <= 0) return false;
    const window = clubWindowState(clubId);
    if (window.signings + window.sales + window.loans > 0) return false;
    return seededUnit(clubId, date, "catch-up") < share + urgency * 0.5;
  });
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
  // El club del usuario nunca actúa por su cuenta: ni ficha, ni cede, ni
  // renueva de forma automática. Todo lo suyo pasa por `UserNegotiation`,
  // así que en el feed sólo aparecerán operaciones que el usuario cierre.
  if (clubId === getUserClubId()) return;

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
  if (
    window.loans < MARKET_TIMING.maxSalesPerWindow &&
    windowDeficit(clubId) < MARKET_TIMING.maxWindowDeficit &&
    seededUnit(clubId, date, "loans") < 0.5
  ) {
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
  // Un club con saldo negativo en la ventana (más salidas que llegadas) sale
  // a reponer sí o sí: ni la caja ni la pasividad de la temporada le frenan.
  const deficit = windowDeficit(clubId);
  const idleTooLong = window.signings === 0 && window.sales === 0 && state.windowDay > 12;
  const belowMinimum = window.signings < minSigningsFor(state.window);
  const canBuy =
    window.signings < MARKET_TIMING.maxSigningsPerWindow &&
    (belowMinimum ||
      deficit > 0 ||
      idleTooLong ||
      (!needsToSell(clubId) && !(window.dormant && !state.deadlineDay)));
  if (canBuy) {
    // Una sola nota de "busca refuerzos" al día: el resto de necesidades se
    // trabajan igual, pero sin inundar el feed.
    const [firstNeed] = priorityNeeds(clubId, date, state.deadlineDay ? 3 : 2);
    if (firstNeed) rumors.push(rumorSearching(clubId, firstNeed.group, date));

    // Reponer siempre pesa más que esperar: un club que ha vendido sale a
    // fichar a varios jugadores el mismo día, como en la vida real. En
    // verano, además, se multiplica: es la ventana donde de verdad se mueve
    // el mercado, y un club no puede pasarse el mes entero fichando de uno
    // en uno.
    const burst = state.window === "summer" ? BALANCE.summerSigningBurst : 1;
    const maxSignings = Math.round(
      Math.max(
        deficit > 0 ? Math.min(deficit * 2 + 2, 8) : 3,
        belowMinimum ? 3 : 2,
        state.deadlineDay && profile.aggression > 0.6 ? 6 : 4,
      ) * burst,
    );
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

  // 4. Red de seguridad de fichajes: si el club sigue sin cubrir su mínimo
  // para cuando le toca (cada club tiene su propio día de "repesca", para no
  // amontonar la actividad de todo el mundo en una sola jornada), cierra
  // incorporaciones entre los agentes libres. En la vida real ningún club
  // termina un mercado completamente parado, y desde luego no llega al
  // primer partido de liga sin haber movido una ficha. Si falla, no se
  // reintenta cada día (caro y casi siempre inútil) sino cada pocos días,
  // salvo en el deadline day, que siempre da un último empujón.
  const requiredSignings = minSigningsFor(state.window);
  if (
    window.signings < requiredSignings &&
    (state.deadlineDay || state.windowDay >= window.nextSigningAttempt)
  ) {
    while (window.signings < requiredSignings) {
      const record = signBestFreeAgent(clubId, date);
      if (!record) {
        window.nextSigningAttempt = state.windowDay + MARKET_TIMING.safetyNetRetryGapDays;
        break;
      }
      window.signings += 1;
      recordTransfers([record]);
      result.transfers.push(record);
    }
  }

  // 5. Red de seguridad de ventas (sólo verano): un club que no ha soltado a
  // nadie en toda la ventana no es realista — todo equipo hace sitio en la
  // plantilla durante el verano. Se fuerza a un rival con hueco y
  // presupuesto a quedarse con el transferible más prescindible. Mismo
  // reparto por días y el mismo reintento periódico que en la red de
  // fichajes.
  const requiredSales = minSalesFor(state.window);
  if (
    window.sales < requiredSales &&
    (state.deadlineDay || state.windowDay >= window.nextSalesAttempt)
  ) {
    while (window.sales < requiredSales) {
      const record = forceSellSurplusPlayer(clubId, date);
      if (!record) {
        window.nextSalesAttempt = state.windowDay + MARKET_TIMING.safetyNetRetryGapDays;
        break;
      }
      window.sales += 1;
      recordTransfers([record]);
      result.transfers.push(record);
      if (record.toClubId) clubWindowState(record.toClubId).signings += 1;
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
  setLockWindow(snapshot.windowKey);
  internals = {
    state: { ...snapshot.state },
    windowKey: snapshot.windowKey,
    lastSeasonRolled: snapshot.lastSeasonRolled,
    clubs: new Map(snapshot.clubs.map(([id, s]) => [id, { ...s }])),
  };
  return internals.state;
}

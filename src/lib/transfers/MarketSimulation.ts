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

import { BALANCE, ELITE_EXIT, MARKET_TIMING } from "./constants";
import {
  TRANSFER_WINDOWS,
  isSummerTransferWindow,
  isWinterTransferWindow,
  parseDateOnly,
} from "../transferWindows";
import { getMarketIndex } from "./PlayerIndex";
import { getClubProfile } from "./ClubStrategy";
import { shoppingRamp } from "./MarketPacing";
import { getUserClubId, needsToSell, refillForNewWindow } from "./BudgetManager";
import { expireStaleNegotiations, listNegotiations } from "./NegotiationEngine";
import {
  attemptEliteDeparture,
  clubWantsToActToday,
  forceSellSurplusPlayer,
  priorityNeeds,
  runClubOpportunisticCycle,
  runClubTransferCycle,
  signBestFreeAgent,
} from "./TransferEngine";
import { runClubContractCycle, advanceSeason } from "./ContractEngine";
import { runClubLoanCycle, resolveLoansEndOfSeason } from "./LoanEngine";
import { recordTransfers } from "./TransferHistory";
import { rumorBidWar, rumorInterest, rumorRenewal, rumorSearching } from "./RumorEngine";
import { setLockWindow, windowDeficit, recentCoreLossOvr } from "./MarketLocks";
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

/**
 * Ventana de mercado abierta en una fecha.
 *
 * Usa `transferWindows.ts` como única fuente de verdad de las fechas (1 jul
 * — 1 sep en verano, 1 — 31 ene en invierno). Antes esta función tenía su
 * propia definición local (julio-agosto completos, sin el 1 de septiembre),
 * así que el motor de simulación cerraba el mercado un día antes de lo que
 * decía el resto del juego (banner, `isMarketOpenForIso`...).
 */
export function windowForDate(date: string): MarketWindow {
  const d = parseDateOnly(date);
  if (isSummerTransferWindow(d)) return "summer";
  if (isWinterTransferWindow(d)) return "winter";
  return "closed";
}

/** Último día natural (mes 1-indexado) del cierre de cada ventana. */
function windowLastDay(window: MarketWindow): { month: number; day: number } | null {
  if (window === "summer")
    return { month: TRANSFER_WINDOWS.summer.endMonth + 1, day: TRANSFER_WINDOWS.summer.endDay };
  if (window === "winter")
    return { month: TRANSFER_WINDOWS.winter.endMonth + 1, day: TRANSFER_WINDOWS.winter.endDay };
  return null;
}

/**
 * ¿Estamos en los últimos días de la ventana?
 *
 * Compara fechas reales (no sólo "mismo mes, día alto"): la ventana de
 * verano cierra el 1 de septiembre, así que sus últimos días de verdad caen
 * en agosto (mes distinto al del cierre) y una comparación de "mismo mes"
 * los habría dejado fuera del deadline day.
 */
export function isDeadlineDay(date: string): boolean {
  const window = windowForDate(date);
  const last = windowLastDay(window);
  if (!last) return false;
  const { year } = parseDate(date);
  const lastDate = new Date(year, last.month - 1, last.day).getTime();
  const current = parseDateOnly(date).getTime();
  const daysToClose = Math.round((lastDate - current) / 86_400_000);
  return daysToClose >= 0 && daysToClose < MARKET_TIMING.deadlineDays;
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

  // 2. Cesiones: colocar a quien no juega. La probabilidad diaria también
  // sigue la misma rampa que las compras (`shoppingRamp`): sin esto, las
  // cesiones no se veían afectadas por ningún suavizado y por sí solas
  // representaban más de la mitad del pico de operaciones del día 1 (todo
  // club con una promesa de cantera de sobra la cedía el primer día posible).
  if (
    window.loans < MARKET_TIMING.maxLoansPerWindow &&
    windowDeficit(clubId) < MARKET_TIMING.maxWindowDeficit &&
    seededUnit(clubId, date, "loans") < 0.5 * shoppingRamp(date)
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
  const idleTooLong = window.signings === 0 && window.sales === 0 && state.windowDay > 8;
  const belowMinimum = window.signings < minSigningsFor(state.window);
  // Una necesidad "crítica" (ver `SquadAnalyzer.computeUrgency`) puede venir
  // de dos sitios muy distintos: (a) haber perdido a un titular de nivel
  // hace poco (reposición reactiva de verdad, debe ir ya), o (b) la simple
  // forma de la plantilla al abrir la ventana (un hueco que ya existía antes
  // de que el mercado abriera). Confundir ambas fue el motivo real de que el
  // día 1 siguiera teniendo casi 500 operaciones pese a la rampa: el 70%+ de
  // los clubes arrancan la ventana con AL MENOS una demarcación "crítica"
  // por pura forma de plantilla (no por ninguna venta reciente), así que esa
  // rama bloqueaba la rampa para la inmensa mayoría del mercado. Sólo la
  // pérdida reciente de verdad (`recentCoreLossOvr`) debe saltarse la rampa;
  // un hueco que ya estaba ahí desde el minuto uno se cubre igual, pero
  // repartido en las mismas dos semanas que el resto de compras "por gusto".
  const topNeed = priorityNeeds(clubId, date, 1)[0];
  const hasCriticalReactiveNeed = !!topNeed && recentCoreLossOvr(clubId, topNeed.group) > 0;
  // Compra "por gusto" o para cubrir el cupo mínimo de la ventana: ambas se
  // someten a una misma probabilidad que empieza más baja el día 1 y sube
  // hasta 1 en poco más de una semana (ver `shoppingRamp`). Es una
  // probabilidad diaria, no una fecha fija por club, así que ningún club
  // puede quedarse sin poder fichar durante semanas por mala suerte en un
  // sorteo: como mucho pierde algún intento suelto al principio, y para
  // cuando la rampa llega a 1 (~día 9) todo el mundo puede intentarlo cada
  // día igual que antes. Sólo las urgencias de verdad (déficit de ventana,
  // salida reciente de un titular, o llevar demasiado tiempo sin mover
  // ficha) se saltan esta probabilidad.
  const rollsToShop = seededUnit(clubId, date, "shopping-roll") < shoppingRamp(date);
  const canBuy =
    window.signings < MARKET_TIMING.maxSigningsPerWindow &&
    (deficit > 0 ||
      idleTooLong ||
      hasCriticalReactiveNeed ||
      state.deadlineDay ||
      (rollsToShop &&
        (belowMinimum || (!needsToSell(clubId) && !(window.dormant && !state.deadlineDay)))));
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
    //
    // El tope por operación diaria es deliberadamente bajo fuera de
    // deadline day: antes un único club activo podía cerrar hasta 5-6
    // fichajes en un solo día, así que en cuanto se abría la ventana
    // cientos de clubes con algún hueco cerraban TODAS sus necesidades de
    // golpe la misma jornada (los cientos de fichajes del día 1) y luego no
    // les quedaba nada por hacer el resto del mes. Limitando cuántas
    // operaciones puede cerrar un club por día (no cuántas necesita), cubrir
    // 2-3 huecos reales le lleva varios días activos en vez de una sola
    // jornada, y el mercado se mantiene vivo durante toda la ventana en vez
    // de agotarse el primer día.
    const burst = state.window === "summer" ? BALANCE.summerSigningBurst : 1;
    const baseSignings = state.deadlineDay
      ? (profile.aggression > 0.6 ? 5 : 3)
      : deficit > 0
        ? Math.min(deficit + 1, 3)
        : hasCriticalReactiveNeed
          ? 2
          : belowMinimum
            ? 2
            : 1;
    const maxSignings = Math.max(1, Math.round(baseSignings * burst));
    const cycle = runClubTransferCycle(clubId, {
      date,
      deadlineDay: state.deadlineDay,
      maxSignings,
      belowMinimum,
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

    // 3b. Refuerzos de rotación especulativos: pasadas las primeras semanas
    // de mercado, la mayoría de clubes ya han cubierto sus huecos urgentes
    // (`priorityNeeds` vacío) y dejan de fichar por iniciativa propia hasta
    // el deadline day — el verano se sentía vivo sólo hasta agosto y luego
    // muerto. En la vida real los clubes ambiciosos siguen mirando refuerzos
    // de rotación sin tener un agujero grave, así que aquí se prueba (con
    // baja probabilidad, escalada por ambición) un único fichaje sobre el
    // grupo más flojo de la plantilla aunque no sea urgente.
    if (
      state.window === "summer" &&
      !state.deadlineDay &&
      state.windowDay > 6 &&
      cycle.transfers.length === 0 &&
      window.signings < MARKET_TIMING.maxSigningsPerWindow &&
      // Antes esta comprobación usaba una probabilidad fija (0.05), así que
      // la actividad "de fondo" se notaba las primeras semanas y luego se
      // apagaba según avanzaba julio-agosto, aunque la ventana siguiera
      // abierta hasta el 1 de septiembre. Escalando la probabilidad con lo
      // avanzado que está el mercado, todo el verano (incluida la segunda
      // mitad, agosto) se mantiene vivo en vez de sentirse "muerto" entre el
      // primer estallido de fichajes y el deadline day.
      seededUnit(clubId, date, "opportunistic") <
        clamp(0.07 + (state.windowDay - 6) * 0.0025, 0.07, 0.18) * profile.ambition
    ) {
      const oppCycle = runClubOpportunisticCycle(clubId, { date, deadlineDay: false });
      result.offersMade += oppCycle.attempts.length;
      for (const attempt of oppCycle.attempts) {
        rumors.push(rumorInterest(clubId, attempt.playerId, date));
      }
      if (oppCycle.transfers.length > 0) {
        window.signings += oppCycle.transfers.length;
        recordTransfers(oppCycle.transfers);
        result.transfers.push(...oppCycle.transfers);
        for (const transfer of oppCycle.transfers) {
          if (!transfer.fromClubId) continue;
          clubWindowState(transfer.fromClubId).sales += 1;
        }
      }
    }
  }

  // 3c. Salida de galáctico: sólo en verano y sólo en clubes de máxima
  // reputación, con una probabilidad diaria muy baja (ver `ELITE_EXIT`), un
  // titular de verdad puede hacer las maletas aunque el club no lo necesite.
  // Da variedad de temporada a temporada en vez de que los mismos nombres se
  // queden siempre fijos en los mismos clubes.
  if (
    state.window === "summer" &&
    !state.deadlineDay &&
    seededUnit(clubId, date, "elite-exit-roll") < ELITE_EXIT.dailyChance
  ) {
    const departure = attemptEliteDeparture(clubId, date);
    if (departure) {
      recordTransfers([departure]);
      result.transfers.push(departure);
      window.sales += 1;
      clubWindowState(departure.toClubId).signings += 1;
      rumors.push(rumorInterest(departure.toClubId, departure.playerId, date));
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
      const record = signBestFreeAgent(clubId, date, state.deadlineDay);
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

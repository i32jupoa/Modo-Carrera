/**
 * Gestión económica de los clubes de la IA.
 *
 * Cada club tiene un presupuesto de fichajes y un tope salarial derivados de su
 * poder económico. El presupuesto se mueve con las ventas, los premios de fin
 * de temporada y el gasto en fichajes, siempre con límites duros para que la
 * IA no se arruine ni acumule cantidades absurdas.
 */

import { BUDGET_RULES, WAGE_RULES } from "./constants";
import { getClubProfile, NO_DISCOUNT_LEAGUES, SAUDI_LEAGUE_ID, TOP5_LEAGUES } from "./ClubStrategy";
import { getClubPlayers } from "./PlayerIndex";
import { clamp } from "./random";
import { getProtectedClubId, setProtectedClubId } from "./MarketLocks";
import type { ClubFinances, ClubProfile } from "./types";

/**
 * Multiplicador de "identidad económica" de la liga: el mismo para todo el
 * mercado (equipo del usuario y clubes IA por igual), para que un Real Madrid
 * llevado por la IA y uno llevado por el usuario partan del mismo dinero.
 *  - Liga saudí: +220% (dinero estatal fuera de escala deportiva, pero sin
 *    llegar a superar sistemáticamente a los grandes de Europa).
 *  - Fuera del top 5 (salvo Portugal/Bélgica/Turquía/Países Bajos): -20%.
 *  - Resto: sin ajuste.
 */
function leagueBudgetMultiplier(leagueId: string): number {
  if (leagueId === SAUDI_LEAGUE_ID) return 3.2; // +220%
  if (leagueId && !TOP5_LEAGUES.has(leagueId) && !NO_DISCOUNT_LEAGUES.has(leagueId)) return 0.8; // -20%
  return 1;
}

/**
 * Presupuesto inicial de fichajes según el poder económico y la liga del
 * club. Es la única fórmula de presupuesto inicial del juego: la usan tanto
 * los clubes controlados por la IA (`createFinances`) como el equipo elegido
 * por el usuario (`playersStore.teamInitialBudget`), así que ambos comparten
 * fórmula y escala en vez de tener dos economías que no se hablan entre sí.
 *
 * Los números están calibrados para que un club "0.98 de poder" en el top 5
 * (un Real Madrid o un City) arranque sobre los 230-250M — comparable a lo
 * que un club así mueve en un mercado real contando ventas e ingresos— en
 * vez de las cifras infladas de antes (+40% de "identidad de mercado" plano
 * que no representaba nada concreto).
 */
export function initialBudget(profile: ClubProfile): number {
  const power = clamp(profile.financialPower, 0, 1);
  // Escala exponencial: los grandes manejan cifras de otro orden.
  const base = 2_000_000 + Math.pow(power, 3.2) * 260_000_000;
  const budget = base * leagueBudgetMultiplier(profile.leagueId);
  return Math.max(BUDGET_RULES.floor, Math.round(budget));
}

/** Masa salarial comprometida hoy por el club. */
function currentWageBill(clubId: string): number {
  return getClubPlayers(clubId).reduce((sum, player) => sum + player.contract.wage, 0);
}

/**
 * Techo del presupuesto de un club de la IA (ver `BUDGET_RULES.maxBudgetMultiple`).
 * Se aplica en todos los puntos donde el presupuesto puede crecer (relleno
 * de ventana y ventas), nunca al gastar. El club del usuario nunca pasa por
 * aquí: su presupuesto es el de la partida y no se recorta desde el motor.
 */
function capBudget(entry: ClubFinances): void {
  const ceiling = entry.initialBudget * BUDGET_RULES.maxBudgetMultiple;
  if (entry.budget > ceiling) entry.budget = Math.round(ceiling);
}

function createFinances(clubId: string): ClubFinances {
  const profile = getClubProfile(clubId);
  const budget = initialBudget(profile);
  const wageBill = currentWageBill(clubId);
  return {
    clubId,
    budget,
    initialBudget: budget,
    wageBudget: Math.max(wageBill * 1.12, Math.round(budget * WAGE_RULES.wageBudgetFactor)),
    wageBill,
    spent: 0,
    earned: 0,
  };
}

const finances = new Map<string, ClubFinances>();

// ============================================================================
// PRESUPUESTO DEL CLUB DEL USUARIO
// ----------------------------------------------------------------------------
// El usuario tiene un único presupuesto: el de la partida. El motor no guarda
// una copia propia (eso provocaba dobles descuentos y cifras contradictorias),
// sino que lee y escribe en el estado del juego a través de este puente.
// ============================================================================

interface UserClubBridge {
  clubId: string;
  getBudget: () => number;
  setBudget: (value: number) => void;
}

let userBridge: UserClubBridge | null = null;

/** Conecta el presupuesto del club del usuario con el estado de la partida. */
export function setUserClubBridge(bridge: UserClubBridge | null): void {
  userBridge = bridge;
  // El club protegido se recuerda aunque el puente se desmonte (React puede
  // desmontar y volver a montar el reloj del mercado): así la simulación
  // nunca queda un instante sin la barrera del club del usuario.
  if (bridge) setProtectedClubId(bridge.clubId);
}

/**
 * Id del club del usuario, si hay un puente activo. Lo usa `TransferEngine`
 * para que ningún club rival pueda fichar directamente a un jugador del
 * usuario: esas operaciones tienen que pasar siempre por `UserNegotiation`
 * (oferta -> aceptar/rechazar), nunca resolverse solas en la simulación
 * diaria de club contra club.
 */
export function getUserClubId(): string | null {
  return userBridge?.clubId ?? getProtectedClubId();
}

/** ¿Este club es el del usuario y tiene puente activo? */
function bridgeFor(clubId: string): UserClubBridge | null {
  return userBridge && userBridge.clubId === clubId ? userBridge : null;
}

/** Finanzas de un club (se crean bajo demanda). */
export function getFinances(clubId: string): ClubFinances {
  let entry = finances.get(clubId);
  if (!entry) {
    entry = createFinances(clubId);
    finances.set(clubId, entry);
  }
  // El club del usuario siempre refleja el presupuesto real de la partida.
  const bridge = bridgeFor(clubId);
  if (bridge) entry.budget = bridge.getBudget();
  return entry;
}

/** Sustituye las finanzas de un club (al cargar una partida guardada). */
export function setFinances(entry: ClubFinances): void {
  finances.set(entry.clubId, entry);
}

/** Instantánea de todas las finanzas conocidas (para persistir). */
export function snapshotFinances(): ClubFinances[] {
  return Array.from(finances.values()).map((entry) => ({ ...entry }));
}

/** Reinicia las finanzas de todos los clubes. */
export function resetFinances(): void {
  finances.clear();
  userBridge = null;
}

/** Dinero que un club está dispuesto a gastar en un solo fichaje. */
export function maxSpend(clubId: string): number {
  const entry = getFinances(clubId);
  const usable = entry.budget * (1 - BUDGET_RULES.reserveShare);
  return Math.max(0, Math.round(usable));
}

/** Salario máximo que el club puede ofrecer a un solo jugador. */
export function maxWageOffer(clubId: string): number {
  const entry = getFinances(clubId);
  const room = entry.wageBudget - entry.wageBill;
  const singleCap = entry.wageBudget * WAGE_RULES.maxShareSingle;
  return Math.max(WAGE_RULES.minimumWage, Math.round(Math.min(room, singleCap)));
}

/** ¿Puede el club asumir traspaso y salario? */
export function canAfford(clubId: string, fee: number, wage: number): boolean {
  return fee <= maxSpend(clubId) && wage <= maxWageOffer(clubId);
}

/** Registra un fichaje: descuenta traspaso y suma salario. */
export function registerSigning(clubId: string, fee: number, wage: number): void {
  const entry = getFinances(clubId);
  entry.budget = Math.max(0, entry.budget - fee);
  entry.spent += fee;
  entry.wageBill += wage;
  bridgeFor(clubId)?.setBudget(entry.budget);
}

/** Registra una venta: parte del ingreso vuelve al presupuesto. */
export function registerSale(clubId: string, fee: number, wage: number): void {
  const entry = getFinances(clubId);
  const bridge = bridgeFor(clubId);
  // El usuario cobra el 100% de sus ventas; la IA reinvierte solo una parte.
  entry.budget += bridge ? fee : Math.round(fee * BUDGET_RULES.saleReinvestment);
  entry.earned += fee;
  entry.wageBill = Math.max(0, entry.wageBill - wage);
  if (!bridge) capBudget(entry);
  bridge?.setBudget(entry.budget);
}

/** Registra el ahorro salarial de una cesión con reparto de sueldo. */
export function registerLoanOut(clubId: string, wage: number, wageShareCovered: number): void {
  const entry = getFinances(clubId);
  entry.wageBill = Math.max(0, entry.wageBill - wage * clamp(wageShareCovered, 0, 1));
}

/** ¿El club necesita vender para poder operar? */
export function needsToSell(clubId: string): boolean {
  const entry = getFinances(clubId);
  return entry.budget < entry.initialBudget * 0.1 || entry.wageBill > entry.wageBudget;
}

/** Reinicia la ventana: ingresos por premios y nuevo colchón. */
export function refillForNewWindow(clubId: string): void {
  const entry = getFinances(clubId);
  // El presupuesto del usuario lo gestiona la partida (temporadas, premios).
  if (bridgeFor(clubId)) {
    entry.spent = 0;
    entry.earned = 0;
    entry.wageBill = currentWageBill(clubId);
    return;
  }

  entry.budget = Math.max(
    BUDGET_RULES.floor,
    Math.round(entry.budget + entry.initialBudget * BUDGET_RULES.windowRefill),
  );
  capBudget(entry);
  entry.spent = 0;
  entry.earned = 0;
  entry.wageBill = currentWageBill(clubId);
}

/** Restaura las finanzas guardadas en una partida. */
export function restoreFinances(entries: readonly ClubFinances[]): void {
  finances.clear();
  for (const entry of entries) {
    const copy = { ...entry };
    // Migra partidas guardadas antes del techo de presupuesto: sin esto, una
    // partida vieja con un club de la IA ya inflado a cientos o miles de
    // millones se quedaría así para siempre, porque `capBudget` sólo actúa
    // en los puntos donde el presupuesto crece (relleno de ventana, ventas),
    // no al cargar. No se toca el club del usuario (no pasa por aquí: su
    // presupuesto vive en el estado de la partida, no en este mapa).
    if (!bridgeFor(copy.clubId)) capBudget(copy);
    finances.set(copy.clubId, copy);
  }
}

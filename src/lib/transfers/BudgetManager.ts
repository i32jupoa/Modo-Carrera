/**
 * Gestión económica de los clubes de la IA.
 *
 * Cada club tiene un presupuesto de fichajes y un tope salarial derivados de su
 * poder económico. El presupuesto se mueve con las ventas, los premios de fin
 * de temporada y el gasto en fichajes, siempre con límites duros para que la
 * IA no se arruine ni acumule cantidades absurdas.
 */

import { BUDGET_RULES, WAGE_RULES } from "./constants";
import { getClubProfile, SAUDI_LEAGUE_ID } from "./ClubStrategy";
import { getClubPlayers } from "./PlayerIndex";
import { clamp } from "./random";
import { getProtectedClubId, setProtectedClubId } from "./MarketLocks";
import type { ClubFinances, ClubProfile } from "./types";

/**
 * Multiplicador de "identidad económica" de la liga: el mismo para todo el
 * mercado (equipo del usuario y clubes IA por igual), para que un Real Madrid
 * llevado por la IA y uno llevado por el usuario partan del mismo dinero.
 *  - Arabia Saudí mantiene su multiplicador especial con la reducción del 35%.
 *  - Las demás ligas usan multiplicadores propios para reflejar su capacidad
 *    económica, sin forzar a todos los clubes a compartir un mismo 80%.
 */
function leagueBudgetMultiplier(leagueId: string): number {
  // Arabia mantiene la reducción del 35% acordada anteriormente.
  if (leagueId === SAUDI_LEAGUE_ID) return 2.08;

  // El resto de competiciones usa una escala propia: las ligas con más
  // capacidad económica no pueden quedar artificialmente al 80% de una
  // fórmula genérica, mientras que las competiciones menores parten de
  // cantidades mucho más contenidas.
  const multipliers: Record<string, number> = {
    premier: 1,
    laliga: 1,
    seriea: 1,
    bundesliga: 1,
    ligue1: 1,
    ligaportugal: 0.9,
    eredivisie: 0.85,
    trendyolsperlig: 0.82,
    mls: 0.82,
    lpf: 0.62,
    scottish: 0.6,
    "1aproleague": 0.62,
    bracksuperleague: 0.5,
    austrianbundesliga: 0.52,
    "3fsuperliga": 0.48,
    pkobpekstraklasa: 0.48,
    allsvenskan: 0.4,
    eliteserien: 0.42,
    superliga: 0.36,
    championship: 0.48,
    laliga2: 0.36,
    bundesliga2: 0.36,
    serieb: 0.34,
    ligue2: 0.3,
    liga3: 0.2,
    leagueone: 0.2,
    leaguetwo: 0.16,
  };
  return multipliers[leagueId] ?? 0.3;
}

/**
 * Presupuestos iniciales fijados para las cinco grandes ligas europeas que
 * tienen equipos definidos de forma estática en el juego. Así el presupuesto
 * no depende de pequeñas variaciones en la media del equipo y mantiene una
 * escala coherente entre gigantes, aspirantes y clubes modestos.
 * El resto de ligas conserva la fórmula económica existente y recibe también la reducción global del 30%.
 */
const CLUB_BUDGET_OVERRIDES: Record<string, number> = {
  // LaLiga
  rma: 220,
  bar: 180,
  atm: 125,
  vil: 60,
  bet: 50,
  ath: 45,
  rso: 43,
  val: 36,
  sev: 32,
  cel: 29,
  esp: 24,
  ala: 21,
  get: 20,
  osa: 19,
  rayo: 18,
  elc: 16,
  lev: 14,
  racing: 14,
  depor: 13,
  malaga: 13,
  // Premier League
  mci: 230,
  liv: 220,
  ars: 190,
  che: 175,
  mun: 155,
  new: 100,
  tot: 95,
  avl: 70,
  not: 55,
  bri: 45,
  cry: 42,
  eve: 38,
  ful: 34,
  bou: 32,
  bre: 29,
  lee: 27,
  sun: 22,
  it: 20,
  cc: 15,
  hc: 13,

  // Serie A
  int: 170,
  nap: 120,
  juv: 150,
  mil: 130,
  rom: 80,
  ata: 65,
  laz: 55,
  fio: 45,
  bol: 38,
  com: 30,
  tor: 27,
  udi: 22,
  gen: 22,
  par: 20,
  cag: 18,
  sas: 18,
  lec: 15,
  monz: 14,
  ven: 14,
  fro: 12,

  // Bundesliga
  bay: 200,
  lev2: 100,
  bvb: 140,
  rbl: 90,
  ein: 55,
  stu: 48,
  fre: 32,
  hof: 30,
  bre2: 30,
  bmg: 32,
  mai: 27,
  fcu: 25,
  ham: 24,
  fca: 21,
  koe: 17,
  fs0: 20,
  sp0: 12,
  se: 10,

  // Ligue 1
  psg: 220,
  mar: 85,
  mon: 75,
  lyo: 70,
  lil: 60,
  nic: 42,
  ren: 34,
  str: 30,
  rcl: 32,
  tou: 22,
  bre3: 20,
  par2: 20,
  auxe: 14,
  hav: 13,
  loi: 14,
  ang: 12,
  eta: 11,
  lmf: 10,

  // Portugal
  benfica: 60,
  porto: 55,
  sportingcp: 50,

  // Países Bajos
  ajax: 60,
  psv: 55,
  feyenoord: 48,

  // Turquía
  galatasaray: 65,
  fenerbahce: 58,
  besiktas: 45,
  trabzonspor: 32,

  // MLS
  intermiami: 50,
  lagalaxy: 42,
  lafc: 40,
  seattle: 34,
  atlantautd: 32,
  nycfc: 30,

  // Escocia
  celtic: 35,
  rangers: 32,

  // Bélgica
  clubbrugge: 32,
  anderlecht: 28,
  genk: 24,
  unionsg: 22,

  // Argentina
  riverplate: 32,
  boca: 30,

  // Austria
  salzburg: 30,
  rapidwien: 18,

  // Suiza
  basel: 22,
  youngboys: 20,
  zurich: 15,

  // Dinamarca / Suecia / Noruega / Polonia / Rumanía
  kopenhavn: 18,
  copenhaguen: 18,
  malmo: 14,
  rosenborg: 14,
  bodo: 15,
  legia: 16,
  steauabucuresti: 12,
  cfrcluj: 11,
};

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
const GLOBAL_BUDGET_MULTIPLIER = 0.70; // Ajuste para clubes sin una cifra manual; los clubes anclados usan su cifra exacta.

export function initialBudget(profile: ClubProfile): number {
  const override = CLUB_BUDGET_OVERRIDES[profile.clubId];
  if (override !== undefined) {
    return Math.max(BUDGET_RULES.floor, Math.round(override * 1_000_000));
  }

  const power = clamp(profile.financialPower, 0, 1);

  // Mantener los grandes en la escala que ya estaba funcionando, pero evitar
  // que los clubes medios/bajos arranquen con presupuestos desproporcionados.
  // El ancla de 0.72 conserva aproximadamente el presupuesto de un club
  // grande como el Barcelona; por debajo, la curva cae de forma mucho más
  // pronunciada para que equipos como Ipswich se muevan alrededor de 20M.
  let budget: number;
  if (power >= 0.72) {
    const base = 2_000_000 + Math.pow(power, 3.2) * 260_000_000;
    budget = base * leagueBudgetMultiplier(profile.leagueId);
  } else {
    const referencePower = 0.72;
    const referenceBase = 2_000_000 + Math.pow(referencePower, 3.2) * 260_000_000;
    const referenceBudget = referenceBase * leagueBudgetMultiplier(profile.leagueId);
    const referenceFloor = 2_000_000;
    const ratio = Math.pow(power / referencePower, 7.5);
    budget = referenceFloor + (referenceBudget - referenceFloor) * ratio;
  }

  return Math.max(BUDGET_RULES.floor, Math.round(budget * GLOBAL_BUDGET_MULTIPLIER));
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
  // La masa salarial presupuestada no puede superar el 50% del presupuesto económico
  // total. Partimos con un 25% y dejamos un pequeño colchón sobre la masa actual.
  let wageBudget = Math.max(wageBill * 1.12, Math.round(budget * 0.25));
  // wageBudget <= (budget + wageBudget) / 2  <=>  wageBudget <= budget.
  let totalBudget = Math.max(budget + wageBudget, Math.round(wageBill * 2));
  const maxWageBudget = Math.floor(totalBudget / 2);
  wageBudget = Math.max(wageBill, Math.min(maxWageBudget, wageBudget));
  totalBudget = Math.max(totalBudget, wageBudget * 2);
  return {
    clubId,
    budget,
    initialBudget: budget,
    totalBudget,
    wageBudget,
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
  getWageBudget: () => number;
  setWageBudget: (value: number) => void;
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
  if (bridge) {
    // Para el club del usuario, `budget` es la bolsa TOTAL de dinero del club.
    // `wageBudget` es sólo la parte reservada para salarios y `wageBill` es la
    // masa salarial real. El dinero disponible para fichajes se deriva como
    // `budget - wageBudget`.
    entry.wageBill = currentWageBill(clubId);
    entry.budget = Math.max(0, Math.round(bridge.getBudget()));
    entry.wageBudget = Math.max(0, Math.round(bridge.getWageBudget()));
    entry.totalBudget = entry.budget;
  }
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
  const bridge = bridgeFor(clubId);
  if (bridge) {
    return Math.max(0, Math.round(entry.budget - entry.wageBudget));
  }
  const usable = entry.budget * (1 - BUDGET_RULES.reserveShare);
  return Math.max(0, Math.round(usable));
}

/** Salario máximo que el club puede ofrecer a un solo jugador. */
/** Ajusta el margen salarial disponible del club. */
export function setWageBudget(clubId: string, value: number): void {
  const entry = getFinances(clubId);
  const bridge = bridgeFor(clubId);
  if (bridge) {
    const total = Math.max(0, Math.round(bridge.getBudget()));
    const minWage = Math.ceil(total * 0.05);
    const maxWage = Math.floor(total * 0.30);
    const nextWage = Math.max(minWage, Math.min(maxWage, Math.round(value)));
    entry.budget = total;
    entry.wageBill = currentWageBill(clubId);
    entry.wageBudget = nextWage;
    entry.totalBudget = total;
    bridge.setBudget(total);
    bridge.setWageBudget(nextWage);
    return;
  }

  // La IA conserva su contabilidad interna tradicional.
  let total = Math.max(0, entry.budget + entry.wageBudget);
  const maxAllowed = Math.floor(total * 0.175);
  entry.wageBudget = Math.max(entry.wageBill, Math.min(maxAllowed, Math.round(value)));
  entry.budget = Math.max(0, total - entry.wageBudget);
  entry.totalBudget = entry.budget + entry.wageBudget;
}

export function maxWageOffer(clubId: string): number {
  const entry = getFinances(clubId);
  const bridge = bridgeFor(clubId);
  if (bridge) {
    // Se mantiene la validación de ofertas que funcionaba antes: la ficha
    // máxima se compara con la asignación salarial, sin descontar la masa real.
    return Math.max(0, Math.round(entry.wageBudget));
  }

  // La IA conserva las reglas específicas del motor.
  const profile = getClubProfile(clubId);
  if (profile.leagueId !== SAUDI_LEAGUE_ID) return Number.MAX_SAFE_INTEGER;

  const room = entry.wageBudget;
  const singleCap = entry.wageBudget * WAGE_RULES.maxShareSingle;
  return Math.max(WAGE_RULES.minimumWage, Math.round(Math.min(room, singleCap)));
}

/** ¿Puede el club asumir traspaso y salario? */
export function canAfford(clubId: string, fee: number, wage: number): boolean {
  const entry = getFinances(clubId);
  const bridge = bridgeFor(clubId);
  if (bridge) {
    const cleanFee = Math.max(0, Math.round(fee));
    const cleanWage = Math.max(0, Math.round(wage));
    const transferRoom = Math.max(0, entry.budget - entry.wageBudget);
    // La validación histórica de ofertas compara la ficha solicitada con la
    // asignación salarial configurada, no con la masa salarial ya existente.
    // La masa real es informativa y puede superar temporalmente la asignación;
    // después de cerrar la operación, el presupuesto total y la asignación se
    // recalculan manteniendo el porcentaje elegido.
    return cleanFee <= transferRoom && cleanWage <= entry.wageBudget;
  }
  return fee <= maxSpend(clubId) && wage <= maxWageOffer(clubId);
}

/** Registra un fichaje: descuenta traspaso y salario del margen disponible. */
export function registerSigning(clubId: string, fee: number, wage: number): void {
  const entry = getFinances(clubId);
  const bridge = bridgeFor(clubId);
  const cleanFee = Math.max(0, Math.round(fee));
  const cleanWage = Math.max(0, Math.round(wage));

  if (bridge) {
    const nextTotal = Math.max(0, entry.budget - cleanFee - cleanWage);
    const nextBill = Math.max(0, entry.wageBill + cleanWage);
    const currentRatio =
      entry.budget > 0 ? clamp(entry.wageBudget / entry.budget, 0.05, 0.30) : 0.05;
    const nextWageBudget = Math.round(nextTotal * currentRatio);

    entry.budget = nextTotal;
    entry.wageBill = nextBill;
    entry.wageBudget = nextWageBudget;
    entry.spent += cleanFee;
    entry.totalBudget = nextTotal;
    bridge.setBudget(nextTotal);
    bridge.setWageBudget(nextWageBudget);
    return;
  }

  entry.budget = Math.max(0, entry.budget - cleanFee);
  entry.spent += cleanFee;
  entry.wageBill += cleanWage;
  entry.wageBudget = Math.max(entry.wageBudget, entry.wageBill);
  entry.totalBudget = entry.budget + entry.wageBudget;
}

/** Registra una renovación del club del usuario: ajusta el salario comprometido
 * por la diferencia y descuenta la prima/ficha de renovación del presupuesto.
 */
export function registerRenewal(
  clubId: string,
  previousWage: number,
  newWage: number,
  signingBonus: number,
): void {
  const entry = getFinances(clubId);
  const delta = Math.round(newWage) - Math.round(previousWage);
  const bonus = Math.max(0, Math.round(signingBonus));
  const bridge = bridgeFor(clubId);

  if (bridge) {
    const nextTotal = Math.max(0, entry.budget - bonus - Math.max(0, delta));
    const nextBill = Math.max(0, Math.round(entry.wageBill + delta));
    const currentRatio =
      entry.budget > 0 ? clamp(entry.wageBudget / entry.budget, 0.05, 0.30) : 0.05;
    const nextWageBudget = Math.round(nextTotal * currentRatio);
    entry.budget = nextTotal;
    entry.wageBill = nextBill;
    entry.wageBudget = nextWageBudget;
    entry.spent += bonus;
    entry.totalBudget = nextTotal;
    bridge.setBudget(nextTotal);
    bridge.setWageBudget(nextWageBudget);
    return;
  }

  entry.budget = Math.max(0, entry.budget - bonus);
  entry.spent += bonus;
  entry.wageBill = Math.max(0, Math.round(entry.wageBill + delta));
  entry.wageBudget = Math.max(entry.wageBill, entry.wageBudget);
  entry.totalBudget = entry.budget + entry.wageBudget;
}

/** Registra una venta: parte del ingreso vuelve al presupuesto. */
export function registerSale(clubId: string, fee: number, wage: number): void {
  const entry = getFinances(clubId);
  const bridge = bridgeFor(clubId);
  const cleanFee = Math.max(0, Math.round(fee));
  const cleanWage = Math.max(0, Math.round(wage));

  if (bridge) {
    // Al vender también dejamos de asumir el salario anual del jugador:
    // ese ahorro vuelve a la bolsa económica junto con el precio del traspaso.
    // Ejemplo: 200M + venta 80M + salario liberado 20M = 300M.
    const nextTotal = Math.max(0, entry.budget + cleanFee + cleanWage);
    const nextBill = Math.max(0, entry.wageBill - cleanWage);
    const currentRatio =
      entry.budget > 0 ? clamp(entry.wageBudget / entry.budget, 0.05, 0.30) : 0.05;
    const nextWageBudget = Math.round(nextTotal * currentRatio);

    entry.budget = nextTotal;
    entry.wageBill = nextBill;
    entry.wageBudget = nextWageBudget;
    entry.earned += cleanFee;
    entry.totalBudget = nextTotal;
    bridge.setBudget(nextTotal);
    bridge.setWageBudget(nextWageBudget);
    return;
  }

  // La IA reinvierte sólo una parte de sus ventas.
  entry.budget += Math.round(cleanFee * BUDGET_RULES.saleReinvestment);
  entry.earned += cleanFee;
  entry.wageBill = Math.max(0, entry.wageBill - cleanWage);
  entry.totalBudget = entry.budget + entry.wageBudget;
  capBudget(entry);
}

/** Registra el ahorro salarial de una cesión con reparto de sueldo. */
export function registerLoanOut(clubId: string, wage: number, wageShareCovered: number): void {
  const entry = getFinances(clubId);
  const bridge = bridgeFor(clubId);
  const savedWage = Math.max(0, Math.round(wage * clamp(wageShareCovered, 0, 1)));

  entry.wageBill = Math.max(0, entry.wageBill - savedWage);

  if (bridge) {
    // Si el otro club asume una parte del sueldo, esa cantidad deja de salir
    // de nuestra caja y, por tanto, pasa a formar parte del presupuesto total.
    const nextTotal = entry.budget + savedWage;
    const currentRatio =
      entry.budget > 0 ? clamp(entry.wageBudget / entry.budget, 0.05, 0.30) : 0.05;
    const nextWageBudget = Math.round(nextTotal * currentRatio);
    entry.budget = nextTotal;
    entry.wageBudget = nextWageBudget;
    entry.totalBudget = nextTotal;
    bridge.setBudget(nextTotal);
    bridge.setWageBudget(nextWageBudget);
  }
}

/** Recalcula la masa salarial del club desde los contratos reales del mercado. */
export function syncWageBill(clubId: string): number {
  const entry = getFinances(clubId);
  const actual = currentWageBill(clubId);
  entry.wageBill = actual;

  const bridge = bridgeFor(clubId);
  if (bridge) {
    const total = Math.max(0, Math.round(bridge.getBudget()));
    const currentRatio =
      total > 0 ? clamp(entry.wageBudget / Math.max(1, total), 0.05, 0.30) : 0.05;
    const wageBudget = Math.round(total * currentRatio);
    entry.budget = total;
    entry.wageBudget = wageBudget;
    entry.totalBudget = total;
    bridge.setWageBudget(wageBudget);
  } else {
    entry.wageBudget = Math.max(entry.wageBill, entry.wageBudget);
    entry.totalBudget = entry.budget + entry.wageBudget;
  }
  return actual;
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
    const total = Math.max(0, Math.round(entry.budget));
    const ratio = total > 0 ? clamp(entry.wageBudget / total, 0.05, 0.30) : 0.05;
    entry.wageBudget = Math.round(total * ratio);
    entry.totalBudget = total;
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
  entry.wageBudget = Math.max(entry.wageBill, Math.round(entry.wageBudget));
  entry.totalBudget = entry.budget + entry.wageBudget;
}

/** Restaura las finanzas guardadas en una partida. */
export function restoreFinances(entries: readonly ClubFinances[]): void {
  finances.clear();
  for (const entry of entries) {
    const copy = { ...entry, totalBudget: entry.totalBudget ?? entry.budget + entry.wageBudget };
    copy.wageBudget = Math.max(copy.wageBill, copy.wageBudget);
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

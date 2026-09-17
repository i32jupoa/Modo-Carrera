/**
 * Negociaciones del usuario.
 *
 * Conecta al club del usuario con el mismo motor que usa la IA: valoración por
 * escalones, respuesta del club vendedor (aceptar / contraoferta / rechazo
 * definitivo), espera del vendedor cuando hay competencia, negociación de la
 * ficha con el jugador y cierre real del traspaso en el índice de mercado.
 *
 * Nada se resuelve al instante: cada oferta tarda días en obtener respuesta y
 * el estado vive aquí para persistirse con la partida.
 */

import { getClubProfile, getAllClubProfiles } from "./ClubStrategy";
import { teamById } from "@/data/teams";
import {
  maxSpend,
  maxWageOffer,
  getFinances,
  needsToSell,
  registerSale,
  registerSigning,
  registerLoanOut,
} from "./BudgetManager";
import { getClubPlayers, getPlayer, updatePlayer } from "./PlayerIndex";
import { getSquadReport } from "./SquadAnalyzer";
import { askingPrice, isAvailable, isKeyPlayer, valuePlayer } from "./MarketValuation";
import { decideOnMove, minimumSquadRole, preferredContractYears, roleRank, wageDemand, wantsOut } from "./PlayerDecision";
import { competitionFor, dropInterest, registerInterest, sellerShouldWait } from "./BidWar";
import {
  buildLoanTerms,
  createTransferOffer,
  decideImprovement,
  emptyClauses,
  expectedSellOnValue,
  proposeClauses,
  offerWorth,
  processCounterOffer,
} from "./NegotiationEngine";
import { completeTransfer } from "./TransferEngine";
import { recordTransfer } from "./TransferHistory";
import { withUserApproval, isPlayerSettled } from "./MarketLocks";
import { getSimulationState, isDeadlineDay, windowForDate } from "./MarketSimulation";
import { MARKET_TIMING, WAGE_RULES } from "./constants";
import { clamp, seededInt, seededPick, seededUnit } from "./random";
import type {
  MarketPlayer,
  MarketValuation,
  OfferClauses,
  TransferOffer,
  TransferRecord,
  TransferType,
  SquadRole,
} from "./types";

// ============================================================================
// TIPOS
// ============================================================================

/** Fase en la que se encuentra una operación del usuario. */
export type UserDealStage =
  /** Esperando la respuesta del club (compra) o la decisión del usuario (venta). */
  | "waiting-club"
  /** El club vendedor ha contraofertado. */
  | "club-counter"
  /** El club vendedor espera otras ofertas antes de decidir. */
  | "club-waiting"
  /** Acuerdo entre clubes: falta ofrecer/negociar las condiciones con el jugador. */
  | "player-terms"
  /** El jugador está tomando una decisión automática sobre una cesión. */
  | "player-decision"
  /** Una venta está acordada y espera un día de cierre administrativo. */
  | "closing"
  /** Todo acordado: sólo falta confirmar la operación. */
  | "ready"
  /** Oferta recibida de un club por un jugador del usuario. */
  | "incoming"
  | "completed"
  | "failed";

export type UserDealDirection = "in" | "out";

/** Línea del histórico de una negociación. */
export interface DealLogEntry {
  date: string;
  text: string;
}

/** Operación del usuario en curso. */
export interface UserDeal {
  id: string;
  direction: UserDealDirection;
  playerId: string;
  playerName: string;
  /** Club del usuario. */
  userClubId: string;
  /** Club rival de la operación (vendedor si compra, comprador si vende). */
  otherClubId: string;
  offer: TransferOffer;
  valuation: MarketValuation;
  stage: UserDealStage;
  /** Fecha en la que llegará la próxima respuesta. */
  respondsOn: string;
  /** Importe que pide el club rival, si hay contraoferta. */
  clubDemand: number;
  clubMessage: string;
  /** Ficha anual que pide el jugador para firmar. */
  playerWageDemand: number;
  /** Condiciones que pide el club comprador cuando el usuario vende/cede. */
  clubWageShareDemand?: number;
  /** Duración de cesión solicitada por el usuario en una contraoferta. */
  clubLoanDurationDemand?: number;
  /** Precio de opción/obligación solicitado por el usuario en una contraoferta. */
  clubOptionFeeDemand?: number;
  /** Tipo de cesión solicitado por el usuario en una contraoferta. */
  clubLoanTypeDemand?: Extract<TransferType, "loan" | "loan-option" | "loan-obligation">;
  /** Rol mínimo que exige el jugador en la negociación. */
  playerRoleDemand?: import("./types").SquadRole;
  /** Años de contrato que pide el jugador. */
  playerYearsDemand?: number;
  /** Número de rondas ya disputadas en la fase de condiciones del jugador. */
  playerNegotiationRounds?: number;
  /** Primer día en que comenzó la negociación directa con el jugador. */
  playerTermsStartedOn?: string;
  /** Inicio del bloqueo temporal por falta de presupuesto salarial para este fichaje. */
  playerFinancialBlockStartedOn?: string;
  /** Último día del bloqueo temporal por falta de presupuesto salarial. */
  playerFinancialBlockUntil?: string;
  /** Último día para que el usuario responda al último mensaje del jugador. */
  playerResponseDeadline?: string;
  /** Número de contraofertas que el usuario ha hecho en una salida/cesión.
   *  No se comparte con `rounds`: las respuestas del club no consumen las
   *  oportunidades de contraofertar del usuario. */
  outgoingCounterRounds?: number;
  /** Último importe exacto pedido por el usuario en una contraoferta de salida/cesión. */
  lastUserCounterAmount?: number;
  /** Últimas condiciones exactas pedidas por el usuario; no se mezclan con la propuesta del club. */
  lastUserCounterClauses?: Partial<OfferClauses>;
  /** Rol que el usuario pide al club comprador para una cesión saliente. */
  clubSquadRoleDemand?: import("./types").SquadRole;
  playerMessage: string;
  /** Clubes que compiten por el jugador. */
  competition: number;
  rounds: number;
  createdOn: string;
  updatedOn: string;
  log: DealLogEntry[];
  /**
   * Última vez que se avisó al usuario de que esta operación lleva tiempo
   * esperando una decisión suya (ver `nudgeStaleUserDeals`). `undefined`
   * hasta el primer aviso.
   */
  lastNudgedOn?: string;
  /** Fecha en la que la negociación terminó (éxito o fracaso). */
  finishedOn?: string;
  /** Impide volver a negociar a este jugador durante la ventana tras un rechazo del club/jugador. */
  blockedForWindow?: string;
}

/** Novedad producida al avanzar el calendario. */
/** Tono de la novedad: buena (verde), informativa (azul) o mala (roja). */
export type UserDealEventKind = "good" | "info" | "bad";

export interface UserDealEvent {
  dealId: string;
  /** Tono de la novedad, usado por las notificaciones del menú lateral. */
  kind: UserDealEventKind;
  playerName: string;
  stage: UserDealStage;
  text: string;
  direction: UserDealDirection;
  /** Datos de una liquidación automática que debe reflejarse en playersStore. */
  settlement?: {
    fee: number;
    wage: number;
    type: TransferType;
    /** Parte del salario que paga el club destino en una cesión. */
    wageShare?: number;
  };
}

const deals = new Map<string, UserDeal>();
let dealCounter = 0;

function nextDealId(): string {
  dealCounter += 1;
  return `deal-${dealCounter}-${Date.now().toString(36)}`;
}

function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) return date;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function isOnOrBefore(a: string, b: string): boolean {
  return Date.parse(`${a}T00:00:00Z`) <= Date.parse(`${b}T00:00:00Z`);
}

function log(deal: UserDeal, date: string, text: string): void {
  deal.log.push({ date, text });
  deal.updatedOn = date;
}

function deadlineToday(date: string): boolean {
  return isDeadlineDay(date);
}

/**
 * Fecha de decisión del jugador después de un acuerdo entre clubes.
 * Normalmente tarda 2 días; en los últimos días del mercado la decisión es
 * inmediata para evitar dejar operaciones pendientes al cierre.
 */
function playerDecisionDate(date: string): string {
  return deadlineToday(date) ? date : addDays(date, 2);
}

function cacheKeyFor(date: string): string {
  return date;
}

function marketWindowKey(date: string): string {
  return `${date.slice(0, 4)}:${windowForDate(date)}`;
}

function legacyPlayerNegotiationRounds(deal: UserDeal): number {
  return deal.log.filter((entry) => entry.text.startsWith("Nueva propuesta al jugador:")).length;
}

function playerNegotiationExhausted(deal: UserDeal, _date: string): boolean {
  const rounds = deal.playerNegotiationRounds ?? legacyPlayerNegotiationRounds(deal);
  // La fase con el jugador tiene exactamente cuatro oportunidades. Si la
  // cuarta propuesta no le convence, la operación termina de inmediato.
  return rounds >= MARKET_TIMING.maxPlayerNegotiationRounds;
}

function playerWageBudgetForDeal(deal: UserDeal): number {
  if (deal.direction !== "in" || isLoanOffer(deal.offer.type)) return Number.POSITIVE_INFINITY;
  const finances = getFinances(deal.userClubId);
  const totalBudget = Math.max(0, Math.round(finances.budget));
  const wageBudget = Math.max(0, Math.round(finances.wageBudget));
  const agreedFee = Math.max(0, Math.round(deal.offer.amount));
  return Math.min(wageBudget, Math.max(0, totalBudget - agreedFee));
}

/**
 * Coste salarial anual que todavía tendría que asumir el club del usuario
 * para completar la operación. En una cesión, es la parte de la ficha que
 * no paga el club destino; en un fichaje, es la ficha completa propuesta.
 */
function playerSalaryCommitmentForDeal(deal: UserDeal): number {
  const player = getPlayer(deal.playerId);
  if (!player) return Number.POSITIVE_INFINITY;
  if (!isLoanOffer(deal.offer.type)) {
    return Math.max(0, Math.round(deal.offer.wageOffer));
  }
  const destinationShare = clamp(deal.offer.clauses.wageShare ?? 0, 0, 1);
  return Math.max(0, Math.round(player.contract.wage * (1 - destinationShare)));
}

/** Presupuesto salarial que queda disponible para ESTA operación. */
function playerAvailableWageBudgetForDeal(deal: UserDeal): number {
  const finances = getFinances(deal.userClubId);
  const totalBudget = Math.max(0, Math.round(finances.budget));
  const wageBudget = Math.max(0, Math.round(finances.wageBudget));
  if (deal.direction === "in" && !isLoanOffer(deal.offer.type)) {
    const agreedFee = Math.max(0, Math.round(deal.offer.amount));
    return Math.min(wageBudget, Math.max(0, totalBudget - agreedFee));
  }
  if (isLoanOffer(deal.offer.type)) return wageBudget;
  return Number.POSITIVE_INFINITY;
}

function playerFinanciallyBlockedNow(deal: UserDeal): boolean {
  return playerAvailableWageBudgetForDeal(deal) < playerSalaryCommitmentForDeal(deal);
}

function normalPlayerMessageAfterFinancialBlock(deal: UserDeal, date: string): string {
  const player = getPlayer(deal.playerId);
  if (!player) return `Ya podemos retomar la negociación. Estoy listo para valorar vuestra propuesta.`;
  if (isLoanOffer(deal.offer.type)) {
    return `Ya hay margen para retomar la operación. Quiero seguir valorando las condiciones de la cesión antes de tomar una decisión.`;
  }
  const requiredRole = minimumSquadRole(player.id, deal.userClubId, cacheKeyFor(date));
  const requiredYears = preferredContractYears(player.id);
  return playerNegotiationMessage({
    role: deal.offer.clauses.squadRole ?? requiredRole,
    requiredRole,
    wageOffer: deal.offer.wageOffer,
    wageRequested: wageDemand(player.id, deal.userClubId),
    years: deal.offer.clauses.contractYears ?? requiredYears,
    requiredYears,
    dealId: deal.id,
    round: Math.max(1, deal.playerNegotiationRounds ?? 1),
    date,
    forceRequest: true,
  });
}

function isFinancialBlockMessage(message: string): boolean {
  return message.startsWith("Ahora mismo no dispongo de dinero suficiente para realizar la operación.")
    || message.startsWith("Ahora mismo no dispongo del margen salarial necesario para cerrar esta operación.");
}

function startPlayerFinancialBlock(deal: UserDeal, date: string): void {
  if (deal.playerFinancialBlockStartedOn && deal.playerFinancialBlockUntil) return;
  deal.playerFinancialBlockStartedOn = date;
  deal.playerFinancialBlockUntil = addDays(date, 5);
}

function clearPlayerFinancialBlock(deal: UserDeal): void {
  deal.playerFinancialBlockStartedOn = undefined;
  deal.playerFinancialBlockUntil = undefined;
  // Al recuperar presupuesto, el mensaje de bloqueo no puede sobrevivir en
  // la tarjeta como si la operación siguiera precintada. La siguiente oferta
  // generará la respuesta normal del jugador.
  if (isFinancialBlockMessage(deal.playerMessage)) {
    deal.playerMessage = "";
  }
}

function failPlayerResponseTimeout(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  deal.stage = "failed";
  deal.finishedOn = date;
  deal.blockedForWindow = marketWindowKey(date);
  deal.offer.status = "final-rejection";
  deal.playerMessage = seededPick(
    [
      `He esperado varios días por tu propuesta y necesito una decisión. Como no hemos avanzado, prefiero terminar la negociación.`,
      `Llevo unos días esperando tus condiciones y no quiero mantener la negociación abierta indefinidamente. Por mi parte, lo dejamos aquí.`,
      `Necesito que la negociación avance. Han pasado tres días sin una nueva oferta y prefiero cerrar esta operación.`,
      `He dado tiempo para que me hagáis una propuesta, pero no ha llegado. Para mí, la negociación termina aquí.`,
    ],
    deal.id,
    "player-response-timeout",
    date,
  ) ?? `He esperado varios días por una nueva propuesta y prefiero terminar la negociación.`;
  deal.playerResponseDeadline = undefined;
  clearPlayerFinancialBlock(deal);
  dropInterest(deal.playerId, deal.userClubId);
  log(deal, date, deal.playerMessage);
  pushEvent(events, deal, deal.playerMessage, "bad");
  return events;
}

function failPlayerFinancialBlock(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  deal.stage = "failed";
  deal.finishedOn = date;
  deal.blockedForWindow = marketWindowKey(date);
  deal.offer.status = "final-rejection";
  deal.playerMessage = seededPick(
    [
      "He esperado estos días, pero no habéis podido recuperar el margen necesario para cerrar mi contrato. Prefiero dar por terminada la negociación.",
      "Entiendo la situación del presupuesto, pero después de esperar varios días sigo sin ver margen suficiente para hacer el fichaje. Por mi parte, lo dejamos aquí.",
      "He dado tiempo para que se desbloquee la situación, pero el presupuesto sigue sin permitir la operación. Prefiero terminar la negociación en este punto.",
    ],
    deal.id,
    "player-financial-timeout",
    date,
  ) ?? "El presupuesto sigue sin permitir la operación y prefiero terminar la negociación.";
  clearPlayerFinancialBlock(deal);
  dropInterest(deal.playerId, deal.userClubId);
  log(deal, date, deal.playerMessage);
  pushEvent(events, deal, deal.playerMessage, "bad");
  return events;
}

function playerRoleLabel(role: SquadRole): string {
  switch (role) {
    case "star": return "Estrella";
    case "starter": return "Titular";
    case "rotation": return "Rotación";
    case "prospect": return "Futuro del club / Promesa";
    default: return "Secundario";
  }
}

function playerNegotiationMessage(input: {
  role: SquadRole;
  requiredRole: SquadRole;
  wageOffer: number;
  wageRequested: number;
  years: number;
  requiredYears: number;
  dealId: string;
  round: number;
  date: string;
  forceRequest?: boolean;
}): string {
  const {
    role, requiredRole, wageOffer, wageRequested, years, requiredYears,
    dealId, round, date, forceRequest = false,
  } = input;

  const wageRatio = wageRequested > 0 ? wageOffer / wageRequested : 1;
  const roleGap = roleRank(requiredRole) - roleRank(role);
  const yearsGap = requiredYears - years;

  const positives: string[] = [];
  const requests: string[] = [];

  if (roleGap <= 0) {
    positives.push(`el rol de ${playerRoleLabel(role)} me encaja muy bien`);
  } else if (roleGap === 1) {
    requests.push(`me gustaría subir un escalón el rol, hasta ${playerRoleLabel(requiredRole)}`);
  } else if (roleGap === 2) {
    requests.push(`necesito un rol algo más importante, idealmente ${playerRoleLabel(requiredRole)}`);
  } else {
    requests.push(`para mí es importante que el rol se acerque a ${playerRoleLabel(requiredRole)}`);
  }

  if (wageRatio >= 1.0) {
    positives.push(`la ficha de ${fmt(wageOffer)}/año me parece buena`);
  } else if (wageRatio >= 0.94) {
    positives.push(`el salario está bastante cerca de lo que esperaba`);
  } else if (wageRatio >= 0.82) {
    requests.push(`me gustaría llevar la ficha a unos ${fmt(Math.round(wageRequested * 0.96))}/año`);
  } else if (wageRatio >= 0.68) {
    requests.push(`quiero acercar un poco más la ficha a lo que considero justo`);
  } else {
    requests.push(`necesito una mejora importante en el salario`);
  }

  if (yearsGap <= 0) {
    positives.push(`${years} ${years === 1 ? "año" : "años"} de contrato me encaja perfectamente`);
  } else if (yearsGap === 1) {
    positives.push(`${years} ${years === 1 ? "año" : "años"} de contrato me parece una duración bastante buena`);
  } else if (yearsGap === 2) {
    requests.push(`preferiría acercar la duración a ${Math.max(1, requiredYears - 1)} años`);
  } else {
    requests.push(`me gustaría que el contrato se acercara a ${requiredYears} años`);
  }

  // Si todas las condiciones ya son buenas pero todavía queremos negociar,
  // siempre introducimos una petición concreta. Nunca dejamos al usuario con
  // un mensaje de "no estoy convencido del proyecto" sin saber qué cambiar.
  if (forceRequest && requests.length === 0) {
    const candidates = [
      `me gustaría mejorar ligeramente la ficha hasta ${fmt(Math.round(wageOffer * 1.03))}/año`,
      years < 6 ? `me daría más seguridad ampliar el contrato a ${years + 1} años` : "me gustaría incluir una pequeña mejora salarial antes de firmar",
      roleRank(role) < roleRank("star") ? `me gustaría que el rol fuese un poco más importante: ${playerRoleLabel(nextHigherRole(role))}` : `me gustaría mejorar ligeramente la ficha antes de dar el último paso`,
    ];
    const index = Math.floor(seededUnit(dealId, "fallback-request", round, date) * candidates.length);
    requests.push(candidates[Math.max(0, Math.min(candidates.length - 1, index))]);
  }

  const choices: string[] = [];
  if (requests.length === 0) {
    choices.push(
      `Me gusta la propuesta. ${positives.join(" y ")}. Por mi parte, podemos seguir adelante.`,
      `Estoy cómodo con las condiciones: ${positives.join(" y ")}. Creo que estamos cerca de cerrar.`,
      `La propuesta me convence. ${positives.join(" y ")}. Podemos seguir adelante con el acuerdo.`,
    );
  } else if (positives.length === 0) {
    choices.push(
      `Quiero seguir negociando. Para mí, ${requests.join(" y ")}. Creo que podemos encontrar un punto medio.`,
      `La propuesta me interesa, pero necesito ajustar ${requests.join(" y ")}. Podemos acercarnos.`,
      `Estoy abierto a venir. Lo que necesito ahora es ${requests.join(" y ")}.`,
      `Podemos entendernos. Para terminar de convencerme necesito ${requests.join(" y ")}.`,
    );
  } else {
    const positiveText = positives.join(" y ");
    const requestText = requests.join(" y ");
    choices.push(
      `${positiveText}. Lo único que quiero cambiar es esto: ${requestText}.`,
      `Hay cosas que me gustan, como ${positiveText}. Para cerrar, necesito ${requestText}.`,
      `Voy cómodo con ${positiveText}. Aun así, me gustaría que ${requestText}.`,
      `${positiveText}. Si podemos ajustar ${requestText}, creo que llegaremos a un acuerdo.`,
    );
  }

  return seededPick(choices, dealId, "player-negotiation-chat", round, date) ?? choices[0];
}

function nextHigherRole(role: SquadRole): SquadRole {
  switch (role) {
    case "prospect": return "secondary";
    case "secondary": return "rotation";
    case "rotation": return "starter";
    case "starter": return "star";
    default: return "star";
  }
}

/** El jugador queda bloqueado para este mercado después de un rechazo definitivo. */
export function hasRejectedDealFor(playerId: string, userClubId: string, date: string): boolean {
  const key = marketWindowKey(date);
  return Array.from(deals.values()).some(
    (deal) =>
      deal.playerId === playerId &&
      deal.userClubId === userClubId &&
      deal.stage === "failed" &&
      deal.blockedForWindow === key,
  );
}

function addMonths(date: string, months: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  const day = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0),
  ).getUTCDate();
  parsed.setUTCDate(Math.min(day, lastDay));
  return parsed.toISOString().slice(0, 10);
}

function defaultLoanDuration(date: string): number {
  return windowForDate(date) === "winter" ? 6 : 12;
}

function isLoanOffer(type: TransferType): boolean {
  return type === "loan" || type === "loan-option" || type === "loan-obligation";
}

/** Redondeo comercial de importes para las nuevas contraofertas. */
function roundFee(amount: number): number {
  if (amount <= 0) return 0;
  const step = amount >= 20_000_000 ? 250_000 : amount >= 2_000_000 ? 100_000 : 25_000;
  return Math.max(step, Math.round(amount / step) * step);
}

// ============================================================================
// CONSULTAS
// ============================================================================

/** Todas las operaciones del usuario, de la más reciente a la más antigua. */
export function listUserDeals(direction?: UserDealDirection, currentDate?: string): UserDeal[] {
  const all = Array.from(deals.values());
  const filtered = direction ? all.filter((d) => d.direction === direction) : all;
  const visible = currentDate
    ? filtered.filter((d) => {
        if (d.stage !== "completed" && d.stage !== "failed") return true;
        const finishedOn = d.finishedOn ?? d.updatedOn;
        const elapsed = daysBetween(finishedOn, currentDate);
        return elapsed < 3;
      })
    : filtered;
  return visible.sort((a, b) => (a.updatedOn < b.updatedOn ? 1 : -1));
}

/** Operaciones abiertas (ni cerradas ni fracasadas). */
export function listOpenUserDeals(direction?: UserDealDirection): UserDeal[] {
  return listUserDeals(direction).filter((d) => d.stage !== "completed" && d.stage !== "failed");
}

/**
 * Dinero de traspasos ya comprometido por acuerdos con un club vendedor que
 * todavía están en la fase contractual con el jugador. Ese importe ya no debe
 * poder reutilizarse para mover el reparto presupuestario o para cerrar otra
 * operación.
 */
export function getCommittedIncomingTransferFees(
  userClubId: string,
  excludeDealId?: string,
): number {
  return listOpenUserDeals("in")
    .filter((deal) =>
      deal.id !== excludeDealId &&
      (deal.stage === "player-terms" || deal.stage === "ready") &&
      !isLoanOffer(deal.offer.type),
    )
    .reduce((sum, deal) => sum + Math.max(0, Math.round(deal.offer.amount)), 0);
}

export function getUserDeal(dealId: string): UserDeal | undefined {
  return deals.get(dealId);
}

/** ¿Hay ya una operación abierta por este jugador? */
export function hasOpenDealFor(playerId: string): boolean {
  return listOpenUserDeals().some((d) => d.playerId === playerId);
}

/** Informe previo antes de ofertar: precios, competencia y ficha estimada. */
export interface ScoutingReport {
  playerId: string;
  valuation: MarketValuation;
  askingPrice: number;
  available: boolean;
  competition: number;
  wageDemand: number;
  releaseClause: number;
  contractYearsLeft: number;
  transferListed: boolean;
  wantsOut: boolean;
}

/** Datos que la UI muestra antes de lanzar una oferta. */
export function scoutPlayer(
  playerId: string,
  userClubId: string,
  date: string,
): ScoutingReport | null {
  const player = getPlayer(playerId);
  if (!player) return null;
  const cacheKey = cacheKeyFor(date);
  const competition = competitionFor(playerId, userClubId);
  const valuation = valuePlayer(playerId, {
    competition,
    cacheKey,
    deadlineDay: deadlineToday(date),
  });
  return {
    playerId,
    valuation,
    askingPrice: askingPrice(playerId, { competition, cacheKey }),
    available: isAvailable(playerId, cacheKey),
    competition,
    wageDemand: wageDemand(playerId, userClubId),
    releaseClause: player.contract.releaseClause,
    contractYearsLeft: player.contract.yearsLeft,
    transferListed: player.transferListed,
    wantsOut: wantsOut(playerId, cacheKey),
  };
}

// ============================================================================
// OFERTA DEL USUARIO (COMPRA)
// ============================================================================

export interface SubmitOfferInput {
  playerId: string;
  userClubId: string;
  date: string;
  amount: number;
  wageOffer: number;
  type?: TransferType;
  clauses?: Partial<OfferClauses>;
}

export interface SubmitOfferResult {
  ok: boolean;
  reason?: string;
  deal?: UserDeal;
  silent?: boolean;
}

/** Registra una oferta formal del usuario por un jugador. */
export function submitUserOffer(input: SubmitOfferInput): SubmitOfferResult {
  const player = getPlayer(input.playerId);
  if (!player) return { ok: false, reason: "Jugador no encontrado en el mercado." };
  if (!player.clubId) return { ok: false, reason: "Es agente libre: negocia sólo la ficha." };
  if (player.clubId === input.userClubId) return { ok: false, reason: "Ya es tu jugador." };
  if (player.loanClubId) return { ok: false, reason: "El jugador está cedido y no puede cambiar de operación ahora." };
  if (input.userClubId === "ath" && player.nation.trim().toLowerCase() !== "españa") {
    return { ok: false, reason: "Athletic Club solo puede fichar jugadores españoles." };
  }
  if (windowForDate(input.date) === "closed") {
    return { ok: false, reason: "El mercado está cerrado." };
  }
  if (hasOpenDealFor(input.playerId)) {
    return { ok: false, reason: "Ya tienes una negociación abierta por este jugador." };
  }
  if (hasRejectedDealFor(input.playerId, input.userClubId, input.date)) {
    return { ok: false, reason: "La negociación con este jugador ya terminó este mercado." };
  }
  if (listOpenUserDeals("in").length >= MARKET_TIMING.maxNegotiationsPerClub) {
    return {
      ok: false,
      reason: `No puedes tener más de ${MARKET_TIMING.maxNegotiationsPerClub} negociaciones abiertas.`,
    };
  }

  const cacheKey = cacheKeyFor(input.date);
  const competition = competitionFor(input.playerId, input.userClubId);
  const valuation = valuePlayer(input.playerId, {
    competition,
    cacheKey,
    deadlineDay: deadlineToday(input.date),
  });

  const type = input.type ?? "permanent";
  const isLoan = isLoanOffer(type);
  // Un jugador que ya ha cambiado de club esta misma ventana está "asentado":
  // ningún otro club puede ficharlo en firme hasta la siguiente. Sí puede
  // salir cedido por su club actual (por ejemplo, un joven recién fichado al
  // que le conviene tener minutos en otro sitio esa misma ventana), así que
  // esta comprobación sólo se aplica a ofertas de compra, no a cesiones.
  if (!isLoan && isPlayerSettled(input.playerId)) {
    return {
      ok: false,
      reason: "El jugador acaba de fichar por su club: no se puede ofertar en firme por él hasta la próxima ventana.",
    };
  }
  if (isLoan && isKeyPlayer(input.playerId, input.date)) {
    return {
      ok: false,
      reason: "El club considera al jugador pieza clave y no contempla una cesión.",
    };
  }
  const requestedClauses = {
    ...emptyClauses(),
    ...(input.clauses ?? {}),
    sellOnPercent: clamp(input.clauses?.sellOnPercent ?? 0, 0, 0.5),
    // En un traspaso el rol y los años pertenecen a la fase con el jugador.
    // En una cesión, el rol sí forma parte del acuerdo entre clubes.
    squadRole: isLoan ? (input.clauses?.squadRole ?? "rotation") : undefined,
    contractYears: undefined,
  };
  if (isLoan) {
    requestedClauses.loanDurationMonths =
      requestedClauses.loanDurationMonths > 0
        ? requestedClauses.loanDurationMonths
        : defaultLoanDuration(input.date);
    requestedClauses.wageShare = clamp(
      requestedClauses.wageShare,
      0,
      1,
    );
  }

  const offer = createTransferOffer({
    playerId: player.id,
    playerName: player.name,
    buyerClubId: input.userClubId,
    sellerClubId: player.clubId ?? "",
    amount: input.amount,
    wageOffer: Math.max(
      WAGE_RULES.minimumWage,
      Math.round(isLoan ? player.contract.wage : input.wageOffer),
    ),
    type,
    clauses: requestedClauses,
    date: input.date,
  });

  registerInterest({
    clubId: input.userClubId,
    playerId: player.id,
    amount: offer.amount,
    wageOffer: offer.wageOffer,
    date: input.date,
  });

  // La cláusula pagada se resuelve al día siguiente; el resto, en 1-3 días.
  const instant =
    player.contract.releaseClause > 0 && offer.amount >= player.contract.releaseClause;
  const days = instant ? 1 : seededInt(1, 3, offer.id, player.id, input.date);

  const deal: UserDeal = {
    id: nextDealId(),
    direction: "in",
    playerId: player.id,
    playerName: player.name,
    userClubId: input.userClubId,
    otherClubId: player.clubId,
    offer,
    valuation,
    stage: "waiting-club",
    respondsOn: addDays(input.date, days),
    clubDemand: 0,
    clubMessage: isLoan
      ? "Oferta de cesión enviada. El club la está estudiando."
      : "Oferta enviada. El club la está estudiando.",
    playerWageDemand: wageDemand(player.id, input.userClubId),
    playerRoleDemand: minimumSquadRole(player.id, input.userClubId, cacheKeyFor(input.date)),
    playerYearsDemand: preferredContractYears(player.id),
    playerMessage: "",
    competition,
    rounds: 1,
    createdOn: input.date,
    updatedOn: input.date,
    log: [
      {
        date: input.date,
        text: isLoan
          ? `Oferta de cesión enviada: ${fmt(offer.amount)} de prima y ${Math.round(offer.clauses.wageShare * 100)}% de la ficha.`
          : `Oferta enviada: ${fmt(offer.amount)} más ${fmt(offer.wageOffer)}/año de ficha.`,
      },
    ],
  };
  deals.set(deal.id, deal);
  return { ok: true, deal };
}

/** Mejora la oferta (fijo, ficha y cláusulas) y reabre la negociación. */
export function improveUserOffer(
  dealId: string,
  patch: { amount?: number; wageOffer?: number; clauses?: Partial<OfferClauses> },
  date: string,
): SubmitOfferResult {
  const deal = deals.get(dealId);
  if (!deal || deal.direction !== "in") return { ok: false, reason: "Negociación no encontrada." };
  if (deal.stage === "completed" || deal.stage === "failed") {
    return { ok: false, reason: "Esta negociación ya está cerrada." };
  }
  if (deal.rounds >= MARKET_TIMING.maxNegotiationRounds) {
    // El límite de rondas ya se ha alcanzado: no se inicia otra ronda.
    // La operación termina aquí y el jugador queda bloqueado durante esta
    // ventana, sin mostrar el antiguo mensaje de error.
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    deal.offer.status = "final-rejection";
    deal.clubMessage = "";
    deal.playerMessage = "";
    dropInterest(deal.playerId, deal.userClubId);
    log(deal, date, "La negociación ha terminado definitivamente en esta ventana de fichajes.");
    return { ok: true, deal, silent: true };
  }

  const amount = Math.max(deal.offer.amount, Math.round(patch.amount ?? deal.offer.amount));
  const userFinances = getFinances(deal.userClubId);
  const transferRoom = Math.max(0, Math.round(userFinances.budget - userFinances.wageBudget));
  if (amount > transferRoom) {
    return { ok: false, silent: true };
  }
  deal.offer.amount = amount;
  const loanDeal = isLoanOffer(deal.offer.type);
  if (loanDeal) {
    const player = getPlayer(deal.playerId);
    // En una cesión la ficha anual vigente nunca se negocia con el club.
    if (player) deal.offer.wageOffer = Math.round(player.contract.wage);
    if (patch.clauses) {
      const next = { ...deal.offer.clauses };
      if (patch.clauses.wageShare !== undefined) next.wageShare = clamp(patch.clauses.wageShare, 0, 1);
      if (patch.clauses.loanDurationMonths !== undefined) {
        const duration = Math.round(patch.clauses.loanDurationMonths);
        next.loanDurationMonths = duration === 6 || duration === 12 || duration === 24 ? duration : next.loanDurationMonths;
      }
      if (patch.clauses.optionFee !== undefined && deal.offer.type !== "loan") {
        next.optionFee = Math.max(0, Math.round(patch.clauses.optionFee));
      }
      if (patch.clauses.squadRole !== undefined) next.squadRole = patch.clauses.squadRole;
      next.sellOnPercent = clamp(patch.clauses.sellOnPercent ?? next.sellOnPercent ?? 0, 0, 0.5);
      deal.offer.clauses = next;
    }
  } else if (patch.clauses) {
    deal.offer.clauses = {
      ...deal.offer.clauses,
      sellOnPercent: clamp(
        patch.clauses.sellOnPercent ?? deal.offer.clauses.sellOnPercent,
        0,
        0.5,
      ),
      // Rol/salario/años no se tocan hasta que el club haya aceptado.
      squadRole: undefined,
      contractYears: undefined,
    };
  }
  deal.offer.round += 1;
  deal.offer.status = "pending";
  deal.rounds += 1;
  deal.stage = "waiting-club";
  deal.respondsOn = addDays(date, seededInt(1, 2, deal.id, deal.rounds));
  deal.clubMessage = "El club estudia tu nueva propuesta.";
  registerInterest({
    clubId: deal.userClubId,
    playerId: deal.playerId,
    amount: deal.offer.amount,
    wageOffer: deal.offer.wageOffer,
    date,
  });
  log(deal, date, `Nueva oferta al club: ${fmt(amount)} (ronda ${deal.rounds}).`);
  return { ok: true, deal };
}

/**
 * Acepta todas las condiciones de la contraoferta del club.
 *
 * No se debe volver a enviar una nueva oferta al club: en este punto el usuario
 * ha aceptado exactamente lo que el club ha pedido y la negociación entre
 * clubes termina aquí. En un fichaje permanente pasamos a negociar con el
 * jugador; en una cesión esperamos directamente su decisión.
 */
/**
 * El usuario contraoferta las condiciones del club en una operación de salida.
 * Sirve tanto para una primera oferta recibida (`incoming`) como para una
 * contraoferta posterior del comprador (`club-counter`). En ambos casos la
 * nueva petición del usuario queda separada de la última propuesta del club,
 * para que el motor pueda responder en el siguiente avance de día.
 */
export function counterOutgoingDeal(
  dealId: string,
  demand: number,
  date: string,
  clauses?: Partial<OfferClauses>,
): IncomingResponseResult {
  const deal = deals.get(dealId);
  if (!deal || deal.direction !== "out" || (deal.stage !== "incoming" && deal.stage !== "club-counter")) {
    return { ok: false, reason: "No hay una oferta del club que puedas contraofertar." };
  }
  const outgoingCounterRounds = deal.outgoingCounterRounds ?? 0;
  const outgoingCounterLimitReached = outgoingCounterRounds >= MARKET_TIMING.maxNegotiationRounds;
  if (outgoingCounterLimitReached) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    deal.offer.status = "final-rejection";
    deal.clubMessage = "";
    deal.playerMessage = "";
    log(deal, date, "La negociación ha terminado definitivamente en esta ventana de fichajes.");
    return { ok: true, deal, silent: true };
  }

  const counterDemand = Math.max(0, Math.round(demand));
  deal.outgoingCounterRounds = outgoingCounterRounds + 1;
  deal.clubDemand = counterDemand;
  deal.lastUserCounterAmount = counterDemand;

  if (isLoanOffer(deal.offer.type)) {
    const currentShare = clamp(deal.offer.clauses.wageShare ?? 0, 0, 1);
    const currentDuration = deal.offer.clauses.loanDurationMonths || defaultLoanDuration(date);
    const currentType = deal.offer.type as Extract<TransferType, "loan" | "loan-option" | "loan-obligation">;
    const requestedShare = clamp(
      clauses?.wageShare ?? deal.clubWageShareDemand ?? currentShare,
      0,
      1,
    );
    const requestedDurationRaw = clauses?.loanDurationMonths ?? deal.clubLoanDurationDemand ?? currentDuration;
    const requestedDuration = [6, 12, 24].includes(Math.round(requestedDurationRaw))
      ? Math.round(requestedDurationRaw)
      : currentDuration;
    const requestedType = clauses?.loanType && isLoanOffer(clauses.loanType)
      ? clauses.loanType
      : (deal.clubLoanTypeDemand ?? currentType);
    const requestedOptionFee = requestedType === "loan"
      ? 0
      : Math.max(0, Math.round(clauses?.optionFee ?? deal.clubOptionFeeDemand ?? deal.offer.clauses.optionFee ?? 0));

    // Guardamos TU contraoferta por separado. `offer` sigue representando la
    // última propuesta real del club, para que el motor pueda compararlas y
    // responder con aceptación/rechazo/nueva contraoferta.
    deal.clubWageShareDemand = requestedShare;
    deal.clubLoanDurationDemand = requestedDuration;
    deal.clubLoanTypeDemand = requestedType;
    deal.clubOptionFeeDemand = requestedOptionFee;
    deal.clubSquadRoleDemand = clauses?.squadRole ?? deal.offer.clauses.squadRole ?? "rotation";
    deal.lastUserCounterClauses = {
      wageShare: requestedShare,
      loanDurationMonths: requestedDuration,
      loanType: requestedType,
      optionFee: requestedOptionFee,
      squadRole: deal.clubSquadRoleDemand,
    };

    const purchaseText = requestedType === "loan"
      ? "sin opción de compra"
      : `${requestedType === "loan-option" ? "opción" : "compra obligatoria"} de ${fmt(requestedOptionFee)}`;
    deal.clubMessage =
      `Has contraofertado la cesión: ${fmt(counterDemand)} de prima · `
      + `${Math.round(requestedShare * 100)}% del sueldo al destino · ${requestedDuration} meses · ${purchaseText} · rol ${playerRoleLabel(deal.clubSquadRoleDemand ?? "rotation")}.`;
    log(deal, date, deal.clubMessage);
  } else {
    const sellOn = clamp(
      clauses?.sellOnPercent ?? deal.offer.clauses.sellOnPercent ?? 0,
      0,
      0.5,
    );
    deal.lastUserCounterClauses = { sellOnPercent: sellOn };
    deal.offer.clauses.sellOnPercent = sellOn;
    deal.clubMessage = `Has contraofertado ${fmt(counterDemand)}`
      + (sellOn > 0 ? ` con un ${Math.round(sellOn * 100)}% de futura venta.` : ".");
    log(deal, date, deal.clubMessage);
  }

  deal.offer.status = "pending";
  deal.stage = "waiting-club";
  deal.respondsOn = addDays(date, seededInt(1, 2, deal.id, deal.rounds, "out-counter"));
  log(deal, date, "El club está valorando tu contraoferta. Espera su respuesta.");
  return { ok: true, deal };
}

export function acceptClubDemand(dealId: string, date: string): SubmitOfferResult {
  const deal = deals.get(dealId);
  if (!deal || deal.stage !== "club-counter") {
    return { ok: true, silent: true };
  }

  // Operación de salida: aceptar la contraoferta del comprador cierra la
  // negociación con el club y deja que el jugador decida.
  if (deal.direction === "out") {
    deal.offer.status = "accepted";
    if (isLoanOffer(deal.offer.type)) {
      deal.stage = "player-decision";
      deal.respondsOn = playerDecisionDate(date);
      deal.clubMessage = `${clubNameSafe(deal.otherClubId)} y tu club han acordado las condiciones de la cesión.`;
      deal.playerMessage = `${deal.playerName} está valorando la cesión.`
        + (deal.respondsOn === date
          ? " La decisión es inmediata porque quedan pocos días para el cierre del mercado."
          : " Recibirás su decisión en unos 2 días.");
      log(deal, date, `Has aceptado las condiciones propuestas por ${clubNameSafe(deal.otherClubId)}. ${deal.playerMessage}`);
      return { ok: true, deal };
    }
    deal.stage = "player-decision";
    deal.respondsOn = playerDecisionDate(date);
    deal.clubMessage = `${clubNameSafe(deal.otherClubId)} y tu club han acordado el traspaso.`;
    deal.playerMessage = `${deal.playerName} está valorando su salida al ${clubNameSafe(deal.otherClubId)}.`
      + (deal.respondsOn === date
        ? " La decisión es inmediata porque quedan pocos días para el cierre del mercado."
        : " Recibirás su decisión en unos 2 días.");
    log(deal, date, `Has aceptado las condiciones propuestas por ${clubNameSafe(deal.otherClubId)}. Acuerdo entre clubes.`);
    log(deal, date, deal.playerMessage);
    return { ok: true, deal };
  }

  const acceptedAmount = Math.max(0, Math.round(deal.clubDemand || deal.offer.amount));
  if (deal.direction === "in") {
    const userFinances = getFinances(deal.userClubId);
    const transferRoom = Math.max(0, Math.round(userFinances.budget - userFinances.wageBudget));
    if (acceptedAmount > transferRoom) {
      return { ok: false, silent: true };
    }
  }
  deal.offer.amount = acceptedAmount;
  deal.offer.status = "accepted";

  if (isLoanOffer(deal.offer.type)) {
    // Las condiciones de la contraoferta de cesión ya están reflejadas en la
    // oferta: prima, reparto salarial, duración y, si corresponde, opción.
    deal.stage = "player-decision";
    deal.respondsOn = playerDecisionDate(date);
    deal.clubMessage = `${clubNameSafe(deal.otherClubId)} acepta las condiciones acordadas para la cesión.`;
    deal.playerMessage = `${deal.playerName} está valorando la cesión.`
      + (deal.respondsOn === date
        ? " La decisión es inmediata porque quedan pocos días para el cierre del mercado."
        : " Recibirás su decisión en unos 2 días.");
    log(deal, date, `Has aceptado las condiciones de ${clubNameSafe(deal.otherClubId)}: ${fmt(acceptedAmount)} de prima. ${deal.playerMessage}`);
    return { ok: true, deal };
  }

  // En un fichaje el club ya está de acuerdo. Ahora comienza el paso 2 con el
  // jugador, sin esperar otra respuesta del club.
  preparePlayerTerms(deal, date);
  log(deal, date, `Has aceptado las condiciones propuestas por ${clubNameSafe(deal.otherClubId)}: ${fmt(acceptedAmount)}. Ahora negociaremos con ${deal.playerName}.`);
  return { ok: true, deal };
}

/** Mejora la ficha ofrecida al jugador durante la fase de condiciones. */
export function improvePlayerTerms(
  dealId: string,
  input: { wageOffer?: number; squadRole?: import("./types").SquadRole; contractYears?: number },
  date: string,
): SubmitOfferResult {
  const deal = deals.get(dealId);
  if (!deal || deal.stage !== "player-terms") {
    return { ok: false, reason: "No hay negociación de condiciones del jugador abierta." };
  }
  const player = getPlayer(deal.playerId);
  if (!player) return { ok: false, reason: "Jugador no encontrado." };

  const loanDeal = isLoanOffer(deal.offer.type);
  if (!loanDeal && playerWageBudgetForDeal(deal) <= 0) {
    startPlayerFinancialBlock(deal, date);
    deal.playerMessage = `Ahora mismo no dispongo de dinero suficiente para realizar la operación. La negociación queda en espera por si recuperamos margen salarial.`;
    log(deal, date, deal.playerMessage);
    return { ok: false, silent: true, deal };
  }
  if (!loanDeal && (deal.playerFinancialBlockStartedOn || deal.playerFinancialBlockUntil)) {
    clearPlayerFinancialBlock(deal);
  }
  deal.playerResponseDeadline = undefined;
  if (!loanDeal && input.wageOffer !== undefined) {
    const nextWage = Math.max(WAGE_RULES.minimumWage, Math.round(input.wageOffer));
    const userFinances = getFinances(deal.userClubId);
    const totalBudget = Math.max(0, Math.round(userFinances.budget));
    const wageBudget = Math.max(0, Math.round(userFinances.wageBudget));
    // El presupuesto NO se descuenta hasta que el fichaje se hace oficial.
    // Para este jugador concreto, sin embargo, la ficha máxima queda limitada
    // por el coste del traspaso ya acordado: el salario + el traspaso nunca
    // pueden superar el presupuesto total actual. Ajustar la barra salarial
    // no puede liberar ese importe reservado para esta operación.
    const wageRoomAfterTransfer = Math.max(0, totalBudget - Math.max(0, Math.round(deal.offer.amount)));
    const maxPlayerWage = Math.min(wageBudget, wageRoomAfterTransfer);
    if (nextWage > maxPlayerWage) {
      return { ok: false, silent: true };
    }
    deal.offer.wageOffer = nextWage;
  }
  if (input.squadRole) deal.offer.clauses.squadRole = input.squadRole;
  if (!loanDeal && input.contractYears !== undefined) {
    deal.offer.clauses.contractYears = Math.max(1, Math.min(6, Math.round(input.contractYears)));
  }

  if (deal.playerNegotiationRounds === undefined) {
    deal.playerNegotiationRounds = legacyPlayerNegotiationRounds(deal);
  }
  if (!deal.playerTermsStartedOn) {
    const firstPlayerProposal = deal.log.find((entry) => entry.text.startsWith("Nueva propuesta al jugador:"));
    deal.playerTermsStartedOn = firstPlayerProposal?.date ?? deal.updatedOn;
  }
  deal.playerNegotiationRounds += 1;
  deal.offer.round += 1;
  deal.rounds += 1;
  deal.stage = "player-terms";
  log(
    deal,
    date,
    loanDeal
      ? `La cesión mantiene la ficha vigente del jugador.`
      : `Nueva propuesta al jugador: ${fmt(deal.offer.wageOffer)}/año · ${deal.offer.clauses.squadRole ?? "rotation"} · ${deal.offer.clauses.contractYears ?? preferredContractYears(deal.playerId)} años.`,
  );
  processPlayerTerms(deal, date);
  if (deal.stage === "player-terms" && !deal.playerFinancialBlockStartedOn && !deal.playerFinancialBlockUntil) {
    deal.playerResponseDeadline = addDays(date, 3);
  }
  return { ok: true, deal };
}

/** El usuario retira su oferta o rechaza la operación. */
export function withdrawUserDeal(dealId: string, date: string): SubmitOfferResult {
  const deal = deals.get(dealId);
  if (!deal) return { ok: false, reason: "Negociación no encontrada." };
  deal.stage = "failed";
  deal.finishedOn = date;
  deal.offer.status = "withdrawn";
  if (deal.direction === "in") dropInterest(deal.playerId, deal.userClubId);
  log(deal, date, deal.direction === "in" ? "Has retirado tu oferta." : "Has rechazado la oferta.");
  return { ok: true, deal };
}

/**
 * Retira del panel las operaciones terminadas cuando han pasado 3 días desde
 * que acabó la negociación. Las operaciones exitosas ya aparecen de inmediato
 * en Entradas/Salidas porque su TransferRecord se registra al cerrar.
 */
export function clearFinishedUserDeals(date?: string): boolean {
  if (!date) return false;
  const now = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(now)) return false;
  let removed = false;
  for (const deal of Array.from(deals.values())) {
    if (deal.stage !== "completed" && deal.stage !== "failed") continue;
    const finishedOn = deal.finishedOn ?? deal.updatedOn;
    const finishedAt = Date.parse(`${finishedOn}T00:00:00Z`);
    if (!Number.isFinite(finishedAt)) continue;
    const daysSinceFinished = Math.floor((now - finishedAt) / 86_400_000);
    if (daysSinceFinished >= 3) {
      if (
        deal.stage === "failed" &&
        deal.blockedForWindow &&
        deal.blockedForWindow === marketWindowKey(date)
      ) {
        // El registro puede desaparecer de la UI, pero debe seguir existiendo
        // para mantener el bloqueo del jugador durante toda la ventana.
        continue;
      }
      deals.delete(deal.id);
      removed = true;
    }
  }
  return removed;
}

// ============================================================================
// CIERRE
// ============================================================================

export interface FinalizeResult {
  ok: boolean;
  reason?: string;
  record?: TransferRecord;
  fee?: number;
  wage?: number;
}

/**
 * Confirma la operación acordada: mueve al jugador en el índice, firma el
 * contrato y lo registra en el historial. El store del juego se actualiza
 * fuera (compra/venta real de la plantilla del usuario).
 */
export function finalizeUserDeal(dealId: string, date: string): FinalizeResult {
  if (windowForDate(date) === "closed") {
    return { ok: false, reason: "El mercado de fichajes está cerrado." };
  }
  const deal = deals.get(dealId);
  if (!deal) return { ok: false, reason: "Negociación no encontrada." };
  const canFinalizeDeferredSale = deal.direction === "out" && deal.stage === "closing";
  if (deal.stage !== "ready" && !canFinalizeDeferredSale) {
    return { ok: false, reason: "El acuerdo todavía no está cerrado." };
  }

  // Para una venta necesitamos conservar el salario que tenía el jugador
  // antes de completarTransfer(), porque este último reemplaza su contrato
  // al llegar al club comprador. Ese mismo salario es el que se devuelve a la
  // caja del vendedor y el que debe desaparecer de su masa salarial.
  const sellingPlayerWage =
    deal.direction === "out" ? getPlayer(deal.playerId)?.contract.wage ?? 0 : deal.offer.wageOffer;

  if (deal.direction === "in" && !isLoanOffer(deal.offer.type)) {
    const finances = getFinances(deal.userClubId);
    const totalBudget = Math.max(0, Math.round(finances.budget));
    const wageBudget = Math.max(0, Math.round(finances.wageBudget));
    const finalFee = Math.max(0, Math.round(deal.offer.amount));
    const finalWage = Math.max(0, Math.round(deal.offer.wageOffer));
    const maxPlayerWage = Math.min(wageBudget, Math.max(0, totalBudget - finalFee));
    // Segunda barrera justo antes de hacer oficial el fichaje. El presupuesto
    // sigue intacto hasta aquí; solo se comprueba que traspaso + ficha caben.
    if (finalFee > totalBudget || finalWage > maxPlayerWage) {
      return {
        ok: false,
        reason: "El fichaje supera el presupuesto disponible para esta operación.",
      };
    }
  }

  const record = withUserApproval(() => completeTransfer(deal.offer, date));
  if (!record) return { ok: false, reason: "No se pudo cerrar la operación." };
  record.userNegotiation = {
    direction: deal.direction,
    clubDemand: deal.clubDemand,
    clubMessage: deal.clubMessage,
    playerWageDemand: deal.playerWageDemand,
    playerMessage: deal.playerMessage,
    competition: deal.competition,
    rounds: deal.rounds,
    createdOn: deal.createdOn,
    updatedOn: deal.updatedOn,
    log: [...deal.log],
  };
  recordTransfer(record);
  deal.stage = "completed";
  deal.finishedOn = date;
  log(
    deal,
    date,
    isLoanOffer(record.type)
      ? `Cesión cerrada por ${fmt(record.fee)}.`
      : deal.direction === "in"
        ? `Fichaje cerrado por ${fmt(record.fee)}.`
        : `Venta cerrada por ${fmt(record.fee)}.`,
  );
  return {
    ok: true,
    record,
    fee: record.fee,
    wage: deal.direction === "out" ? sellingPlayerWage : record.wage,
  };
}

// ============================================================================
// AVANCE DIARIO
// ============================================================================

/**
 * Al cerrarse el mercado, toda negociación abierta (tuya o de los clubes que
 * pujaban por tus jugadores) se cae al instante: no se puede aceptar una
 * oferta fuera de plazo.
 */
function cancelOpenDealsOnMarketClose(userClubId: string, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  for (const deal of Array.from(deals.values())) {
    if (deal.userClubId !== userClubId) continue;
    if (deal.stage === "completed" || deal.stage === "failed") continue;
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.offer.status = "withdrawn";
    if (deal.direction === "in") dropInterest(deal.playerId, deal.userClubId);
    log(deal, date, "El mercado se ha cerrado: la operación queda anulada.");
    pushEvent(
      events,
      deal,
      deal.direction === "in"
        ? `Mercado cerrado: se cae la negociación por ${deal.playerName}.`
        : `Mercado cerrado: retirada la oferta por ${deal.playerName}.`,
      "bad",
    );
  }
  return events;
}

/**
 * Días sin que el usuario mueva ficha (mejorar oferta, aceptar demanda,
 * ajustar la ficha, retirarse...) antes de recordarle que hay una operación
 * esperando su decisión. Las fases "club-counter" y "player-terms" paran la
 * negociación durante mucho tiempo (`respondsOn` a 30 días) precisamente
 * porque quien tiene que mover ficha es el usuario, no el motor — pero sin
 * ningún aviso, esa espera podía sentirse como una negociación "muerta" que
 * nadie recuerda que sigue abierta.
 */
const STALE_DEAL_NUDGE_DAYS = 5;

/**
 * Recuerda al usuario las operaciones que llevan un tiempo esperando su
 * decisión (contraoferta del club rival por aceptar/mejorar, o ficha del
 * jugador por ajustar). No repite el aviso más de una vez cada
 * `STALE_DEAL_NUDGE_DAYS`, para no inundar el panel de notificaciones.
 */
function nudgeStaleUserDeals(userClubId: string, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  for (const deal of Array.from(deals.values())) {
    if (deal.userClubId !== userClubId) continue;
    if (deal.stage !== "club-counter" && deal.stage !== "player-terms") continue;
    const since = deal.lastNudgedOn ?? deal.updatedOn;
    const days = Math.round((Date.parse(date) - Date.parse(since)) / 86_400_000);
    if (days < STALE_DEAL_NUDGE_DAYS) continue;
    deal.lastNudgedOn = date;
    pushEvent(
      events,
      deal,
      deal.stage === "club-counter"
        ? `Sigue pendiente tu decisión sobre la contraoferta por ${deal.playerName}.`
        : `${deal.playerName} sigue esperando que cierres sus condiciones para firmar.`,
      "info",
    );
  }
  return events;
}

/** Procesa las respuestas pendientes y genera ofertas de la IA por tus jugadores. */
function isAwaitingClubResponse(deal: UserDeal): boolean {
  // Solo estas fases deben ser resueltas automáticamente al avanzar el día.
  // `club-counter`, `incoming`, `player-terms` y `ready` requieren una acción
  // del usuario y nunca deben volver a entrar en el motor por accidente.
  return deal.stage === "waiting-club" || deal.stage === "club-waiting";
}

function daysBetween(a: string, b: string): number {
  const aa = Date.parse(`${a}T00:00:00Z`);
  const bb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(aa) || !Number.isFinite(bb)) return 0;
  return Math.floor((bb - aa) / 86_400_000);
}

/**
 * Corrige negociaciones antiguas guardadas con una fecha de respuesta
 * artificialmente larga (30 días). Las respuestas de un club deben llegar
 * en pocos días; nunca una espera de semanas sin motivo.
 */
function repairStuckClubWait(deal: UserDeal, date: string): void {
  if (!isAwaitingClubResponse(deal)) return;
  if (isOnOrBefore(deal.respondsOn, date)) return;
  if (daysBetween(deal.updatedOn, date) >= 3) {
    deal.respondsOn = date;
  }
}

export function advanceUserDeals(userClubId: string, date: string): UserDealEvent[] {
  if (windowForDate(date) === "closed") {
    return cancelOpenDealsOnMarketClose(userClubId, date);
  }
  const events: UserDealEvent[] = [];
  for (const deal of Array.from(deals.values())) {
    if (deal.stage === "completed" || deal.stage === "failed") continue;
    if (deal.userClubId !== userClubId) continue;

    // Las ofertas del usuario al club se resuelven solas al llegar su fecha.
    // Las contraofertas que esperan una decisión del usuario quedan congeladas.
    repairStuckClubWait(deal, date);

    // Una oferta que un club te ha enviado no puede quedarse abierta para
    // siempre. Si no la atiendes en 3 días, el club la retira y la tarjeta
    // entra en el periodo normal de 3 días de finalización.
    if (deal.stage === "incoming" && isOnOrBefore(deal.respondsOn, date)) {
      deal.stage = "failed";
      deal.finishedOn = date;
      deal.offer.status = "withdrawn";
      deal.blockedForWindow = undefined;
      dropInterest(deal.playerId, deal.otherClubId);
      log(deal, date, `${clubNameSafe(deal.otherClubId)} retira la oferta por falta de respuesta.`);
      pushEvent(events, deal, `${clubNameSafe(deal.otherClubId)} ha retirado la oferta por ${deal.playerName}.`, "bad");
      continue;
    }

    if (deal.stage === "player-decision") {
      const financialNeed = playerFinanciallyBlockedNow(deal);
      const financiallyBlocked = Boolean(
        deal.playerFinancialBlockStartedOn || deal.playerFinancialBlockUntil,
      );

      if (financialNeed && !financiallyBlocked) {
        startPlayerFinancialBlock(deal, date);
        deal.playerResponseDeadline = undefined;
        const until = deal.playerFinancialBlockUntil;
        deal.playerMessage = `Ahora mismo no dispongo de dinero suficiente para realizar la operación. Voy a esperar un poco por si recuperáis margen salarial. Si no se recupera antes del ${until}, tendré que dar la negociación por terminada.`;
        deal.updatedOn = date;
        continue;
      }

      if (financiallyBlocked && deal.playerFinancialBlockUntil && date >= deal.playerFinancialBlockUntil) {
        events.push(...failPlayerFinancialBlock(deal, date));
        continue;
      }

      if (financiallyBlocked && !financialNeed) {
        clearPlayerFinancialBlock(deal);
        deal.respondsOn = playerDecisionDate(date);
        deal.updatedOn = date;
        deal.playerMessage = isLoanOffer(deal.offer.type)
          ? `${deal.playerName} está valorando la cesión a ${clubNameSafe(deal.otherClubId)}.`
            + (deal.respondsOn === date
              ? " La decisión es inmediata porque quedan pocos días para el cierre del mercado."
              : " Recibirás su decisión en unos 2 días.")
          : normalPlayerMessageAfterFinancialBlock(deal, date);
        log(deal, date, deal.playerMessage);
        pushEvent(events, deal, deal.playerMessage, "info");
        continue;
      }

      if (financiallyBlocked) continue;

      if (isOnOrBefore(deal.respondsOn, date)) {
        events.push(...processLoanPlayerDecision(deal, date));
      }
      continue;
    }

    if (deal.stage === "player-terms") {
      const financialWageLimit = playerWageBudgetForDeal(deal);
      const financialNeed = playerFinanciallyBlockedNow(deal);
      const financiallyBlocked =
        deal.playerFinancialBlockStartedOn !== undefined || deal.playerFinancialBlockUntil !== undefined;

      // Compatibilidad con partidas guardadas antes de existir el plazo de
      // respuesta del jugador: se toma la última actividad como punto de
      // partida y se le conceden tres días, salvo que esté en bloqueo financiero.
      if (!financiallyBlocked && !deal.playerResponseDeadline) {
        deal.playerResponseDeadline = addDays(deal.updatedOn, 3);
      }

      if (!isLoanOffer(deal.offer.type) && (financialNeed || financiallyBlocked)) {
        if (!financiallyBlocked) startPlayerFinancialBlock(deal, date);
        if (deal.playerFinancialBlockUntil && date >= deal.playerFinancialBlockUntil) {
          events.push(...failPlayerFinancialBlock(deal, date));
        } else if (financiallyBlocked && !financialNeed) {
          clearPlayerFinancialBlock(deal);
          deal.respondsOn = date;
          deal.updatedOn = date;
          deal.playerResponseDeadline = addDays(date, 3);
          deal.playerMessage = normalPlayerMessageAfterFinancialBlock(deal, date);
          log(deal, date, deal.playerMessage);
          pushEvent(events, deal, deal.playerMessage, "info");
        } else {
          const until = deal.playerFinancialBlockUntil ?? addDays(date, 5);
          deal.playerMessage = `Ahora mismo no dispongo de dinero suficiente para realizar la operación. Voy a esperar un poco por si recuperáis margen salarial. Si no se recupera antes del ${until}, tendré que dar la negociación por terminada.`;
          deal.updatedOn = date;
        }
        continue;
      }

      if (deal.playerResponseDeadline && isOnOrBefore(deal.playerResponseDeadline, date)) {
        events.push(...failPlayerResponseTimeout(deal, date));
        continue;
      }

      if (playerNegotiationExhausted(deal, date)) {
        deal.stage = "failed";
        deal.finishedOn = date;
        deal.blockedForWindow = marketWindowKey(date);
        deal.offer.status = "final-rejection";
        deal.playerMessage = `He esperado y negociado bastante. Prefiero cerrar esta negociación y no seguir.`;
        dropInterest(deal.playerId, deal.userClubId);
        log(deal, date, deal.playerMessage);
        pushEvent(events, deal, deal.playerMessage, "bad");
      }
      continue;
    }

    if (deal.stage === "closing") {
      if (isOnOrBefore(deal.respondsOn, date)) {
        const result = finalizeUserDeal(deal.id, date);
        if (result.ok) {
          pushEvent(
            events,
            deal,
            `Venta de ${deal.playerName} cerrada por ${fmt(result.fee ?? 0)}. El dinero ya está ingresado.`,
            "good",
            {
              fee: result.fee ?? 0,
              wage: result.wage ?? 0,
              type: result.record?.type ?? deal.offer.type,
              wageShare: result.record?.clauses?.wageShare ?? deal.offer.clauses.wageShare,
            },
          );
        } else {
          deal.stage = "failed";
          deal.finishedOn = date;
          pushEvent(events, deal, result.reason ?? "La venta no se pudo cerrar.", "bad");
        }
      }
      continue;
    }

    if (!isAwaitingClubResponse(deal)) continue;
    if (!isOnOrBefore(deal.respondsOn, date)) continue;

    if (deal.direction === "in") events.push(...processIncomingResponse(deal, date));
    else if (isLoanOffer(deal.offer.type)) events.push(...processOutgoingLoanBid(deal, date));
    else events.push(...processOutgoingBid(deal, date));
  }
  events.push(...nudgeStaleUserDeals(userClubId, date));
  events.push(...generateOffersForUserPlayers(userClubId, date));
  events.push(...generateLoanOffersForUserPlayers(userClubId, date));
  return events;
}

function pushEvent(
  events: UserDealEvent[],
  deal: UserDeal,
  text: string,
  kind: UserDealEventKind = "info",
  settlement?: UserDealEvent["settlement"],
): void {
  events.push({
    dealId: deal.id,
    kind,
    playerName: deal.playerName,
    stage: deal.stage,
    text,
    direction: deal.direction,
    settlement,
  });
}

/** Respuesta del club vendedor a una oferta del usuario. */
function processIncomingResponse(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  const player = getPlayer(deal.playerId);
  if (!player || player.clubId !== deal.otherClubId) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    log(deal, date, "El jugador ya no está disponible.");
    pushEvent(events, deal, `${deal.playerName} ya no está disponible.`, "bad");
    return events;
  }

  const cacheKey = cacheKeyFor(date);
  const competition = competitionFor(deal.playerId, deal.userClubId);
  deal.competition = competition;
  deal.valuation = valuePlayer(deal.playerId, {
    competition,
    cacheKey,
    deadlineDay: deadlineToday(date),
  });

  if (deal.stage === "player-terms") return processPlayerTerms(deal, date);

  if (isLoanOffer(deal.offer.type)) {
    return processIncomingLoanResponse(deal, date);
  }

  // Si ya existe una petición previa del club y el usuario vuelve con una
  // oferta prácticamente equivalente, no tiene sentido reiniciar la escalada.
  // Ejemplo: 141M pedidos -> 140M ofrecidos. Esa diferencia es lo bastante
  // pequeña como para aceptar la oferta, especialmente si lleva futura venta.
  const previousClubDemand = Math.max(0, Math.round(deal.clubDemand));
  const currentOfferWorth = offerWorth(deal.offer, deal.valuation);
  const closeEnoughToPreviousDemand =
    previousClubDemand > 0 && currentOfferWorth >= previousClubDemand * 0.99;

  if (closeEnoughToPreviousDemand) {
    deal.offer.status = "accepted";
    deal.stage = "player-terms";
    deal.clubMessage = `El club acepta tu oferta de ${fmt(deal.offer.amount)}.`;
    log(deal, date, deal.clubMessage);
    preparePlayerTerms(deal, date);
    pushEvent(events, deal, `Acuerdo con el club por ${deal.playerName}: ahora debes ofrecerle sus condiciones.`, "good");
    return events;
  }

  // Con varios pretendientes y sin urgencia, el vendedor deja correr los días.
  const urgent = needsToSell(deal.otherClubId);
  if (
    sellerShouldWait(
      deal.playerId,
      deal.otherClubId,
      currentOfferWorth,
      deal.valuation.expectedPrice,
      urgent,
    )
  ) {
    deal.stage = "club-waiting";
    deal.clubMessage = `Hay ${competition} club(es) más interesados: el ${deal.otherClubId} espera antes de decidir.`;
    deal.respondsOn = addDays(date, 3);
    log(deal, date, "El club aparca la respuesta a la espera de mejores ofertas.");
    pushEvent(events, deal, `El club deja en el aire tu oferta por ${deal.playerName}.`, "info");
    return events;
  }

  const response = processCounterOffer(
    deal.offer,
    deal.valuation,
    previousClubDemand > 0 ? previousClubDemand : undefined,
  );
  deal.clubMessage = response.message;

  if (response.status === "accepted") {
    log(deal, date, response.message);
    preparePlayerTerms(deal, date);
    pushEvent(events, deal, `Acuerdo con el club por ${deal.playerName}: ahora debes ofrecerle sus condiciones.`, "good");
    return events;
  }

  if (response.status === "final-rejection") {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    deal.offer.status = "final-rejection";
    dropInterest(deal.playerId, deal.userClubId);
    log(deal, date, response.message);
    pushEvent(events, deal, `Negociación rota por ${deal.playerName}.`, "bad");
    return events;
  }

  deal.stage = "club-counter";
  deal.clubDemand = response.counterAmount;
  if (response.demands) {
    deal.offer.clauses = {
      ...deal.offer.clauses,
      sellOnPercent: Math.max(deal.offer.clauses.sellOnPercent, response.demands.sellOnPercent),
    };
  }
  deal.respondsOn = addDays(date, 30);
  log(deal, date, response.message);
  pushEvent(
    events,
    deal,
    `Contraoferta por ${deal.playerName}: ${fmt(response.counterAmount)}.`,
    "info",
  );
  return events;
}

/** Respuesta del club propietario a una propuesta de cesión del usuario. */
function processIncomingLoanResponse(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  const player = getPlayer(deal.playerId);
  if (!player || player.clubId !== deal.otherClubId || player.loanClubId) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.offer.status = "final-rejection";
    log(deal, date, "El jugador ya no está disponible para cesión.");
    pushEvent(events, deal, `${deal.playerName} ya no está disponible para cesión.`, "bad");
    return events;
  }

  const minimumFee = Math.max(0, Math.round(player.value * 0.015));
  const minimumWageShare = 0.5;
  const enoughFee = deal.offer.amount >= minimumFee;
  const enoughWage = deal.offer.clauses.wageShare >= minimumWageShare;

  if (enoughFee && enoughWage) {
    deal.offer.status = "pending";
    deal.stage = "player-decision";
    deal.respondsOn = playerDecisionDate(date);
    deal.clubMessage = `El club acepta la cesión por ${fmt(deal.offer.amount)}, el ${Math.round(deal.offer.clauses.wageShare * 100)}% del sueldo y ${deal.offer.clauses.loanDurationMonths} meses.`;
    deal.playerMessage = `${deal.playerName} está valorando la cesión.`
      + (deal.respondsOn === date
        ? " La decisión es inmediata porque quedan pocos días para el cierre del mercado."
        : " Recibirás su decisión en unos 2 días.");
    log(deal, date, deal.clubMessage);
    log(deal, date, deal.playerMessage);
    pushEvent(events, deal, `El club acepta la cesión de ${deal.playerName}. ${deal.playerMessage}`, "good");
    return events;
  }

  deal.rounds += 1;
  deal.offer.round += 1;
  deal.stage = "club-counter";
  deal.clubDemand = Math.max(deal.offer.amount, minimumFee);
  deal.offer.clauses.wageShare = Math.max(
    deal.offer.clauses.wageShare,
    minimumWageShare,
  );
  deal.clubWageShareDemand = undefined;
  deal.clubLoanDurationDemand = undefined;
  deal.clubLoanTypeDemand = undefined;
  deal.clubOptionFeeDemand = undefined;
  deal.respondsOn = addDays(date, seededInt(1, 2, deal.id, deal.rounds));
  deal.clubMessage =
    `Contraoferta de cesión: ${fmt(deal.clubDemand)} de prima y `
    + `${Math.round(deal.offer.clauses.wageShare * 100)}% de la ficha.`;
  log(deal, date, deal.clubMessage);
  pushEvent(events, deal, deal.clubMessage, "info");
  return events;
}

function processOutgoingLoanBid(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  const clubOfferFee = Math.max(0, Math.round(deal.offer.amount));
  const clubOfferShare = clamp(deal.offer.clauses.wageShare ?? 0, 0, 1);
  const clubOfferDuration = deal.offer.clauses.loanDurationMonths || defaultLoanDuration(date);
  const clubOfferType = deal.offer.type as Extract<TransferType, "loan" | "loan-option" | "loan-obligation">;
  const clubOfferOptionFee = clubOfferType === "loan" ? 0 : Math.max(0, Math.round(deal.offer.clauses.optionFee ?? 0));
  const clubOfferRole = deal.offer.clauses.squadRole ?? "rotation";

  const userCounterClauses = deal.lastUserCounterClauses ?? {};
  const askedFee = Math.max(0, Math.round(deal.lastUserCounterAmount ?? deal.clubDemand ?? clubOfferFee));
  const askedShare = clamp((userCounterClauses.wageShare ?? deal.clubWageShareDemand ?? clubOfferShare) as number, 0, 1);
  const askedDuration = [6, 12, 24].includes(Math.round((userCounterClauses.loanDurationMonths ?? deal.clubLoanDurationDemand ?? clubOfferDuration) as number))
    ? Math.round((userCounterClauses.loanDurationMonths ?? deal.clubLoanDurationDemand ?? clubOfferDuration) as number)
    : clubOfferDuration;
  const requestedLoanType = userCounterClauses.loanType ?? deal.clubLoanTypeDemand;
  const askedType = requestedLoanType && isLoanOffer(requestedLoanType)
    ? requestedLoanType
    : clubOfferType;
  const askedOptionFee = askedType === "loan"
    ? 0
    : Math.max(0, Math.round((userCounterClauses.optionFee ?? deal.clubOptionFeeDemand ?? clubOfferOptionFee) as number));
  const askedRole = (userCounterClauses.squadRole as SquadRole | undefined) ?? deal.clubSquadRoleDemand ?? clubOfferRole;

  const profile = getClubProfile(deal.otherClubId);
  const ceiling = Math.max(0, Math.min(maxSpend(deal.otherClubId), deal.valuation.maximumPrice * profile.buyingWillingness));
  const step = clamp(profile.aggression * 0.5 + 0.35, 0.35, 0.85);

  // El club acepta una contraoferta si no empeora sus condiciones más allá
  // de lo que ya había ofrecido: menor prima para el comprador, igual/mayor
  // porcentaje salarial a su cargo, igual/mayor duración y sin encarecer la
  // opción/obligación. También permitimos cambiar el tipo de cesión.
  const feeAcceptable = askedFee <= clubOfferFee && askedFee <= ceiling;
  const shareAcceptable = askedShare <= clubOfferShare;
  const durationAcceptable = askedDuration <= clubOfferDuration;
  const typeAcceptable = askedType === clubOfferType || askedType === "loan";
  const optionAcceptable = askedType === "loan" || askedOptionFee <= clubOfferOptionFee;
  const roleAcceptable = roleRank(askedRole) <= roleRank(clubOfferRole);

  if (feeAcceptable && shareAcceptable && durationAcceptable && typeAcceptable && optionAcceptable && roleAcceptable) {
    deal.offer.amount = askedFee;
    deal.offer.clauses.wageShare = askedShare;
    deal.offer.clauses.loanDurationMonths = askedDuration;
    deal.offer.clauses.optionFee = askedType === "loan" ? 0 : askedOptionFee;
    deal.offer.clauses.squadRole = askedRole;
    deal.offer.type = askedType;
    deal.offer.clauses.loanType = askedType;
    deal.offer.status = "accepted";
    deal.stage = "player-decision";
    deal.clubWageShareDemand = undefined;
    deal.clubLoanDurationDemand = undefined;
    deal.clubLoanTypeDemand = undefined;
    deal.clubOptionFeeDemand = undefined;
    deal.clubSquadRoleDemand = undefined;
    deal.lastUserCounterAmount = undefined;
    deal.lastUserCounterClauses = undefined;
    deal.clubMessage = `${clubNameSafe(deal.otherClubId)} acepta la cesión: ${fmt(askedFee)} de prima, ${Math.round(askedShare * 100)}% de la ficha, ${askedDuration} meses${askedType === "loan" ? " sin opción de compra" : askedType === "loan-option" ? ` con opción de compra de ${fmt(askedOptionFee)}` : ` con compra obligatoria de ${fmt(askedOptionFee)}`} y rol ${playerRoleLabel(askedRole)}.`;
    deal.respondsOn = playerDecisionDate(date);
    deal.playerMessage = `${deal.playerName} está valorando la cesión a ${clubNameSafe(deal.otherClubId)}.`
      + (deal.respondsOn === date
        ? " La decisión es inmediata porque quedan pocos días para el cierre del mercado."
        : " Recibirás su decisión en unos 2 días.");
    log(deal, date, deal.clubMessage);
    log(deal, date, deal.playerMessage);
    pushEvent(events, deal, `El club comprador acepta las condiciones de la cesión de ${deal.playerName}. ${deal.playerMessage}`, "good");
    return events;
  }

  // Cuarta contraoferta del usuario: si el club tampoco acepta ni encuentra
  // un punto de acuerdo en su respuesta, la negociación termina aquí. No
  // dejamos una tarjeta abierta con el botón bloqueado y sin siguiente paso.
  if ((deal.outgoingCounterRounds ?? 0) >= MARKET_TIMING.maxNegotiationRounds) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    deal.offer.status = "final-rejection";
    deal.playerMessage = "";
    deal.clubMessage = seededPick(
      [
        `${clubNameSafe(deal.otherClubId)} no puede aceptar tu última propuesta y prefiere cerrar la negociación.`,
        `${clubNameSafe(deal.otherClubId)} ha valorado todas las propuestas, pero no habéis llegado a un acuerdo. La negociación termina aquí.`,
        `${clubNameSafe(deal.otherClubId)} no encuentra un punto de acuerdo después de estas rondas y retira la operación.`,
      ],
      deal.id,
      "outgoing-loan-final-counter-rejection",
      date,
    ) ?? `${clubNameSafe(deal.otherClubId)} retira la operación al no alcanzarse un acuerdo.`;
    log(deal, date, deal.clubMessage);
    pushEvent(events, deal, deal.clubMessage, "bad");
    return events;
  }

  // Si el precio ya supera el techo del club, se retira definitivamente.
  if (askedFee > ceiling) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    deal.offer.status = "final-rejection";
    log(deal, date, `${clubNameSafe(deal.otherClubId)} no puede alcanzar las condiciones económicas de la cesión.`);
    pushEvent(events, deal, `${clubNameSafe(deal.otherClubId)} se retira de la cesión de ${deal.playerName}.`, "bad");
    return events;
  }

  // El club hace una nueva propuesta acercándose a TU demanda, mejorando solo
  // aquello que está dispuesto a mejorar. Esta nueva propuesta queda visible
  // como `club-counter`, de modo que el usuario puede aceptarla o volver a
  // contraofertar; nunca se queda la negociación bloqueada en espera.
  const nextFee = roundFee(Math.max(clubOfferFee, clubOfferFee + (askedFee - clubOfferFee) * step));
  const nextShare = askedShare >= clubOfferShare
    ? clubOfferShare + (askedShare - clubOfferShare) * step
    : Math.min(clubOfferShare, askedShare + (clubOfferShare - askedShare) * step);
  const nextDuration = askedDuration > clubOfferDuration
    ? Math.round(clubOfferDuration + (askedDuration - clubOfferDuration) * step)
    : askedDuration;
  const nextType = askedType;
  const nextOption = nextType === "loan"
    ? 0
    : Math.round(clubOfferOptionFee + (askedOptionFee - clubOfferOptionFee) * step);
  const roleSequence: SquadRole[] = ["secondary", "prospect", "rotation", "starter", "star"];
  const currentRoleIndex = roleSequence.indexOf(clubOfferRole);
  const askedRoleIndex = roleSequence.indexOf(askedRole);
  const roleDirection = askedRoleIndex >= currentRoleIndex ? 1 : -1;
  const roleDistance = Math.abs(askedRoleIndex - currentRoleIndex);
  const roleStep = Math.max(1, Math.floor(roleDistance * step));
  const nextRoleIndex = Math.max(0, Math.min(roleSequence.length - 1, currentRoleIndex + roleDirection * roleStep));
  const nextRole = roleDistance === 0 ? clubOfferRole : roleSequence[nextRoleIndex];

  deal.offer.amount = Math.min(ceiling, nextFee);
  deal.offer.clauses.wageShare = clamp(nextShare, 0, 1);
  deal.offer.clauses.loanDurationMonths = [6, 12, 24].includes(nextDuration) ? nextDuration : clubOfferDuration;
  deal.offer.type = nextType;
  deal.offer.clauses.loanType = nextType;
  deal.offer.clauses.optionFee = nextType === "loan" ? 0 : Math.max(0, nextOption);
  deal.offer.clauses.squadRole = nextRole;
  // La nueva propuesta del club se convierte en la condición visible de la
  // siguiente ronda. No borramos el dato lógico del rol: la UI debe poder
  // seguir negociándolo en cualquier ronda posterior.
  deal.clubSquadRoleDemand = undefined;
  deal.lastUserCounterAmount = undefined;
  deal.lastUserCounterClauses = undefined;
  deal.offer.round += 1;
  deal.rounds += 1;
  deal.updatedOn = date;
  deal.stage = "club-counter";
  deal.respondsOn = addDays(date, 30);
  deal.clubMessage = `${clubNameSafe(deal.otherClubId)} hace una nueva oferta: ${fmt(deal.offer.amount)} de prima · ${Math.round(deal.offer.clauses.wageShare * 100)}% del sueldo · ${deal.offer.clauses.loanDurationMonths} meses${nextType === "loan" ? " · sin opción de compra" : nextType === "loan-option" ? ` · opción de ${fmt(deal.offer.clauses.optionFee)}` : ` · compra obligatoria de ${fmt(deal.offer.clauses.optionFee)}`} · rol ${playerRoleLabel(nextRole)}.`;
  // La propuesta anterior del usuario ya ha sido contestada; limpiamos sus
  // demandas para que la siguiente interacción parta de la nueva propuesta.
  deal.clubWageShareDemand = undefined;
  deal.clubLoanDurationDemand = undefined;
  deal.clubLoanTypeDemand = undefined;
  deal.clubOptionFeeDemand = undefined;
  log(deal, date, deal.clubMessage);
  pushEvent(events, deal, deal.clubMessage, "info");
  return events;
}

/** Prepara la pantalla de condiciones del jugador sin decidir por él. */
function preparePlayerTerms(deal: UserDeal, date: string): void {
  const player = getPlayer(deal.playerId);
  if (!player) return;

  deal.playerWageDemand = wageDemand(player.id, deal.userClubId);
  deal.playerRoleDemand = minimumSquadRole(player.id, deal.userClubId, cacheKeyFor(date));
  deal.playerYearsDemand = preferredContractYears(player.id);
  deal.playerNegotiationRounds = 0;
  deal.playerTermsStartedOn = date;

  if (!deal.offer.clauses.squadRole) {
    deal.offer.clauses.squadRole = deal.playerRoleDemand ?? "rotation";
  }
  if (!isLoanOffer(deal.offer.type) && !deal.offer.clauses.contractYears) {
    deal.offer.clauses.contractYears = deal.playerYearsDemand;
  }

  deal.playerMessage = isLoanOffer(deal.offer.type)
    ? `Quiero valorar bien la cesión, pero mi ficha actual y el rol que tenga con vosotros serán importantes para mí.`
    : `Quiero conocer bien las condiciones que me ofreces. Para mí son importantes el sueldo, el rol y la duración del contrato.`;
  deal.stage = "player-terms";
  deal.respondsOn = date;
  deal.playerResponseDeadline = addDays(date, 3);

  if (!isLoanOffer(deal.offer.type)) {
    const maxWage = playerWageBudgetForDeal(deal);
    if (maxWage <= 0) {
      startPlayerFinancialBlock(deal, date);
      deal.playerResponseDeadline = undefined;
      deal.playerMessage = `Ahora mismo no dispongo del margen salarial necesario para cerrar esta operación. Podemos esperar unos días por si recuperáis presupuesto.`;
    } else {
      clearPlayerFinancialBlock(deal);
    }
  }
}

/** Negociación de la ficha con el jugador tras el acuerdo entre clubes. */
function processPlayerTerms(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  const player = getPlayer(deal.playerId);
  if (!player) {
    deal.stage = "failed";
    deal.finishedOn = date;
    pushEvent(events, deal, `${deal.playerName} ya no está disponible.`, "bad");
    return events;
  }

  const cacheKey = cacheKeyFor(date);
  const requiredRole = minimumSquadRole(player.id, deal.userClubId, cacheKey);
  const requiredYears = preferredContractYears(player.id);
  const role = deal.offer.clauses.squadRole ?? "rotation";
  const roleGap = roleRank(requiredRole) - roleRank(role);
  const wageRequested = wageDemand(player.id, deal.userClubId);
  const wageRatio = deal.offer.wageOffer / Math.max(1, wageRequested);
  const loanDeal = isLoanOffer(deal.offer.type);
  const years = deal.offer.clauses.contractYears ?? 4;
  const yearsGap = requiredYears - years;
  const round = Math.max(1, deal.playerNegotiationRounds ?? 1);

  deal.playerWageDemand = wageRequested;
  deal.playerRoleDemand = requiredRole;
  deal.playerYearsDemand = requiredYears;

  const hardRoleMismatch = !loanDeal && roleGap >= 4;
  const veryLowWage = !loanDeal && wageRatio < 0.55;
  const immediateBreak = hardRoleMismatch || veryLowWage;

  // El jugador es flexible: solo rompe de inmediato ante una propuesta extrema.
  // En cualquier otro caso intenta encontrar un punto medio antes del límite de
  // cuatro rondas.
  const wageAcceptable = loanDeal || wageRatio >= 0.90;
  const roleAcceptable = loanDeal || roleGap <= 1 || (roleGap === 2 && wageRatio >= 1.00) || (roleGap === 3 && wageRatio >= 1.08);
  const yearsAcceptable = loanDeal || yearsGap <= 2 || (yearsGap === 3 && wageRatio >= 1.02) || yearsGap < 0;
  const conditionsAcceptable = wageAcceptable && roleAcceptable && yearsAcceptable;

  deal.playerWageDemand = wageRequested;
  deal.playerRoleDemand = requiredRole;
  deal.playerYearsDemand = requiredYears;

  deal.playerMessage = playerNegotiationMessage({
    role,
    requiredRole,
    wageOffer: deal.offer.wageOffer,
    wageRequested,
    years,
    requiredYears,
    dealId: deal.id,
    round,
    date,
  });

  if (immediateBreak) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    deal.offer.status = "final-rejection";
    deal.playerResponseDeadline = undefined;
    deal.playerMessage = veryLowWage
      ? seededPick(
          [
            `Te soy sincero: con una ficha tan baja no puedo aceptar la propuesta. No me parece una oferta seria para mi situación.`,
            `Entiendo que tengáis vuestro presupuesto, pero el salario está demasiado lejos de lo que puedo aceptar. Prefiero no seguir.`,
            `Con esta ficha no puedo dar el paso. El sueldo está demasiado por debajo de mis expectativas y no creo que tenga sentido continuar.`,
          ],
          deal.id,
          "player-hard-wage-rejection",
          round,
          date,
        ) ?? `Con estas condiciones económicas no puedo aceptar la propuesta.`
      : seededPick(
          [
            `El rol que me ofreces está demasiado lejos de lo que necesito. Para mí es importante tener un papel acorde a mi nivel y prefiero no seguir así.`,
            `Puedo ser flexible en otras cosas, pero este rol se queda demasiado lejos de lo que busco. En estas condiciones prefiero cerrar aquí.`,
            `No puedo aceptar un papel tan por debajo de mis expectativas. Prefiero no continuar con la negociación.`,
          ],
          deal.id,
          "player-hard-role-rejection",
          round,
          date,
        ) ?? `El rol que me ofreces está demasiado lejos de lo que necesito.`;
    dropInterest(deal.playerId, deal.userClubId);
    log(deal, date, deal.playerMessage);
    pushEvent(events, deal, deal.playerMessage, "bad");
    return events;
  }

  // Si el contrato encaja, el jugador acepta directamente. El proyecto ya no
  // puede tumbar una propuesta contractual que sea razonable: el usuario debe
  // tener una salida clara y negociable en cada ronda.
  if (conditionsAcceptable) {
    deal.stage = "ready";
    deal.playerResponseDeadline = undefined;
    deal.offer.status = "accepted";
    deal.respondsOn = date;
    deal.playerMessage = seededPick(
      [
        `Me parecen buenas condiciones. El salario, el rol y la duración me encajan y estoy dispuesto a firmar.`,
        `Estoy satisfecho con el contrato. Creo que hemos encontrado un punto razonable para los dos y quiero seguir adelante.`,
        `La propuesta me convence. Las condiciones están dentro de lo que buscaba y por mi parte podemos cerrar.`,
        `Me gusta cómo ha quedado el contrato. El sueldo, el rol y los años me parecen adecuados y estoy preparado para firmar.`,
      ],
      deal.id,
      "player-final-acceptance-chat",
      round,
      date,
    ) ?? `Me convencen las condiciones y estoy dispuesto a firmar.`;
    log(deal, date, deal.playerMessage);
    pushEvent(events, deal, `${deal.playerName} ha aceptado las condiciones. Puedes cerrar el fichaje.`, "good");
    return events;
  }

  if (round < MARKET_TIMING.maxPlayerNegotiationRounds) {
    deal.stage = "player-terms";
    deal.respondsOn = date;
    deal.playerResponseDeadline = addDays(date, 3);
    deal.playerMessage = playerNegotiationMessage({
      role,
      requiredRole,
      wageOffer: deal.offer.wageOffer,
      wageRequested,
      years,
      requiredYears,
      dealId: deal.id,
      round,
      date,
      forceRequest: true,
    });
    log(deal, date, deal.playerMessage);
    pushEvent(events, deal, deal.playerMessage, "info");
    return events;
  }

  // Cuarta ronda: si la propuesta sigue fuera de los márgenes flexibles,
  // rechazo definitivo y bloqueo durante el mercado.
  deal.stage = "failed";
  deal.finishedOn = date;
  deal.blockedForWindow = marketWindowKey(date);
  deal.offer.status = "final-rejection";
  deal.playerResponseDeadline = undefined;

  const finalReasons: string[] = [];
  if (!wageAcceptable) finalReasons.push("la ficha todavía se queda algo corta");
  if (!roleAcceptable) finalReasons.push("el rol que tendría sigue siendo menor del que busco");
  if (!yearsAcceptable) finalReasons.push("la duración sigue siendo demasiado corta");
  if (finalReasons.length === 0) finalReasons.push("necesito una pequeña mejora en alguna de las condiciones del contrato");

  deal.playerMessage = seededPick(
    finalReasons.length === 1
      ? [
          `He intentado encontrar un punto medio, pero ${finalReasons[0]}. Prefiero dejarlo aquí.`,
          `Gracias por la negociación. He valorado la propuesta, pero ${finalReasons[0]} y no voy a firmar.`,
          `Hemos negociado bastante y ${finalReasons[0]}. Creo que lo mejor es cerrar aquí.`,
        ]
      : [
          `He intentado acercar posturas, pero ${finalReasons.join(" y ")}. Prefiero terminar aquí la negociación.`,
          `Hemos hablado bastante y todavía ${finalReasons.join(" y ")}. En estas condiciones no voy a firmar.`,
          `Agradezco el esfuerzo, pero después de estas rondas sigo necesitando ${finalReasons.join(" y ")}. Creo que lo mejor es cerrar la negociación.`,
        ],
    deal.id,
    "player-final-rejection-chat",
    round,
    date,
  ) ?? `Hemos negociado varias veces y prefiero no seguir con la operación.`;
  dropInterest(deal.playerId, deal.userClubId);
  log(deal, date, deal.playerMessage);
  pushEvent(events, deal, deal.playerMessage, "bad");
  return events;
}

function clubNameSafe(clubId: string): string {
  return teamById(clubId)?.name ?? clubId;
}

function processLoanPlayerDecision(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  const player = getPlayer(deal.playerId);
  if (!player || player.loanClubId) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.offer.status = "final-rejection";
    deal.playerMessage = `${deal.playerName} ya no está disponible para la cesión.`;
    log(deal, date, deal.playerMessage);
    pushEvent(events, deal, deal.playerMessage, "bad");
    return events;
  }

  const targetClub = deal.otherClubId;
  const decision = decideOnMove({
    playerId: player.id,
    toClubId: targetClub,
    wageOffer: player.contract.wage,
    cacheKey: cacheKeyFor(date),
    loan: true,
    deadlineDay: deadlineToday(date),
  });

  const acceptanceChance = clamp(
    0.82 +
      (decision.score - 0.5) * 0.14 +
      (wantsOut(player.id, cacheKeyFor(date)) ? 0.06 : -0.02),
    0.65,
    0.97,
  );
  const accepted = seededUnit(player.id, targetClub, deal.id, "loan-decision", date) < acceptanceChance;

  if (!accepted) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    deal.offer.status = "final-rejection";
    deal.playerMessage = `${player.name} prefiere no aceptar la cesión a ${clubNameSafe(targetClub)}.`;
    log(deal, date, deal.playerMessage);
    pushEvent(events, deal, deal.playerMessage, "bad");
    return events;
  }

  deal.playerMessage = isLoanOffer(deal.offer.type)
    ? `${player.name} ha aceptado la cesión a ${clubNameSafe(targetClub)}.`
    : `${player.name} ha aceptado su marcha al ${clubNameSafe(targetClub)}.`;
  deal.stage = "ready";
  deal.offer.status = "accepted";
  deal.respondsOn = date;
  log(deal, date, deal.playerMessage);
  pushEvent(events, deal, deal.playerMessage, "good");

  const result = finalizeUserDeal(deal.id, date);
  if (!result.ok) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.offer.status = "final-rejection";
    pushEvent(events, deal, result.reason ?? "La cesión no se pudo cerrar.", "bad");
  } else {
    const settlement = {
      fee: result.fee ?? 0,
      wage: result.wage ?? 0,
      type: result.record?.type ?? deal.offer.type,
      wageShare: result.record?.clauses?.wageShare ?? deal.offer.clauses.wageShare,
    };
    events[events.length - 1].settlement = settlement;
  }
  return events;
}

function finalizeOutgoingPlayerDecision(deal: UserDeal, date: string, events: UserDealEvent[]): UserDealEvent[] {
  const player = getPlayer(deal.playerId);
  if (!player) return events;
  const targetClub = deal.otherClubId;

  // Cuando tú vendes/cedes, el rol y el salario del nuevo contrato los negocia
  // el jugador directamente con el club comprador. El vendedor no promete un
  // rol y no debe bloquear la salida por una supuesta oferta de "rotación".
  // Para una cesión, además, conserva su ficha vigente.
  const baseWage = isLoanOffer(deal.offer.type)
    ? player.contract.wage
    : Math.max(player.contract.wage, wageDemand(player.id, targetClub));

  let decision = decideOnMove({
    playerId: player.id,
    toClubId: targetClub,
    wageOffer: Math.max(deal.offer.wageOffer || 0, baseWage),
    cacheKey: cacheKeyFor(date),
    loan: isLoanOffer(deal.offer.type),
    deadlineDay: deadlineToday(date),
  });

  // El club comprador resuelve internamente una contraoferta del jugador.
  // Si el jugador quiere más ficha, el comprador puede mejorarla sin que el
  // usuario intervenga. Nunca mostramos ni guardamos un rol impuesto por el
  // vendedor en esta fase.
  if (decision.verdict === "negotiating" || decision.verdict === "rejected-wage") {
    const adjustedWage = Math.max(baseWage, decision.wageRequested, deal.offer.wageOffer || 0);
    decision = decideOnMove({
      playerId: player.id,
      toClubId: targetClub,
      wageOffer: adjustedWage,
      cacheKey: cacheKeyFor(date),
      loan: isLoanOffer(deal.offer.type),
      deadlineDay: deadlineToday(date),
    });
    deal.offer.wageOffer = adjustedWage;
  }

  // Para jugadores cedidos o transferibles, una vez acordado el importe entre
  // clubes no hacemos que una tirada secundaria de rol vuelva a tumbar la
  // operación. Solo una incompatibilidad real con el destino puede frustrarla.
  // Una oferta aceptada por el club suele ser una vía de salida razonable para
  // el jugador. La gran mayoría acepta (≈80% de base), pero su decisión sigue
  // dependiendo del destino: un proyecto poco atractivo, un cambio de nivel
  // muy grande o poca afinidad pueden hacer que decline. La tirada es
  // determinista para que una misma partida no cambie de resultado al refrescar.
  const baseAcceptance = 0.80;
  const appealAdjustment = (decision.score - 0.5) * 0.18;
  const willingnessAdjustment = wantsOut(player.id, cacheKeyFor(date)) ? 0.08 : -0.03;
  const transferListedAdjustment = player.transferListed ? 0.05 : 0;
  const loanAdjustment = isLoanOffer(deal.offer.type) ? 0.04 : 0;
  const acceptanceChance = clamp(
    baseAcceptance + appealAdjustment + willingnessAdjustment + transferListedAdjustment + loanAdjustment,
    0.55,
    0.97,
  );
  const playerAcceptanceRoll = seededUnit(player.id, targetClub, deal.id, `exit:${date}`);
  const canLeave = playerAcceptanceRoll < acceptanceChance;

  if (!canLeave) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    deal.offer.status = "final-rejection";
    deal.playerMessage = `${player.name} prefiere no marcharse al ${clubNameSafe(targetClub)} por ahora.`;
    log(deal, date, deal.playerMessage);
    pushEvent(events, deal, deal.playerMessage, "bad");
    return events;
  }

  deal.playerWageDemand = decision.wageRequested;
  // En una venta en firme el rol del nuevo contrato se resuelve entre el
  // jugador y el club comprador. En una cesión, en cambio, el rol sí forma
  // parte de las condiciones negociadas por el club propietario y debe
  // conservarse hasta que la cesión se haga oficial.
  deal.playerRoleDemand = undefined;
  if (!isLoanOffer(deal.offer.type)) {
    deal.offer.clauses.squadRole = undefined;
    deal.offer.clauses.contractYears = preferredContractYears(player.id);
  }
  deal.playerMessage = `${player.name} acepta marcharse al ${clubNameSafe(targetClub)}. La venta queda acordada.`;
  deal.stage = "closing";
  deal.offer.status = "accepted";
  deal.respondsOn = addDays(date, 1);
  log(deal, date, `${deal.playerMessage} El cierre económico se hará mañana.`);
  pushEvent(events, deal, `${deal.playerMessage} El cierre de la venta será mañana.`, "good");
  return events;
}

/** Respuesta de la IA a la contraoferta del usuario cuando el usuario vende. */
function processOutgoingBid(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  const asked = Math.max(0, Math.round(deal.clubDemand));
  const offered = Math.max(0, Math.round(deal.offer.amount));
  const profile = getClubProfile(deal.otherClubId);
  const ceiling = Math.max(
    0,
    Math.min(
      maxSpend(deal.otherClubId),
      deal.valuation.maximumPrice * profile.buyingWillingness,
    ),
  );
  const offeredWorth = offerWorth(deal.offer, deal.valuation);
  const requestedFutureValue = expectedSellOnValue(
    deal.playerId,
    deal.offer.clauses.sellOnPercent,
    deal.valuation,
  );
  const requestedEconomicCost = asked + requestedFutureValue;

  // Cuando el comprador iguala una contraoferta razonable del vendedor, la
  // negociación termina. La comparación usa el valor económico total de la
  // oferta, no solo el fijo, así que 55M + 30% puede superar a 60M + 0%.
  if (requestedEconomicCost <= ceiling && asked <= offeredWorth * 1.05) {
    deal.offer.amount = asked;
    deal.offer.status = "accepted";
    deal.stage = "player-decision";
    deal.clubMessage = `${clubNameSafe(deal.otherClubId)} acepta el precio de ${fmt(asked)}.`;
    deal.respondsOn = playerDecisionDate(date);
    deal.playerMessage = `${deal.playerName} está valorando su salida al ${clubNameSafe(deal.otherClubId)}.`
      + (deal.respondsOn === date
        ? " La decisión es inmediata porque quedan pocos días para el cierre del mercado."
        : " Recibirás su decisión en unos 2 días.");
    log(deal, date, `El club comprador acepta ${fmt(asked)}. Acuerdo entre clubes.`);
    log(deal, date, deal.playerMessage);
    pushEvent(
      events,
      deal,
      `${deal.clubMessage} ${deal.playerMessage}`,
      "good",
    );
    return events;
  }

  if (requestedEconomicCost > ceiling) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    deal.offer.status = "withdrawn";
    log(deal, date, `${clubNameSafe(deal.otherClubId)} retira su oferta: el coste total, incluida la futura venta, está fuera de su alcance.`);
    pushEvent(events, deal, `${clubNameSafe(deal.otherClubId)} retira su oferta por ${deal.playerName}.`, "bad");
    return events;
  }

  const step = clamp(0.35 + profile.aggression * 0.5 - profile.patience * 0.25, 0.2, 0.95);
  const economicGap = Math.max(0, requestedEconomicCost - offeredWorth);
  const next = roundFee(
    Math.min(
      ceiling,
      Math.max(offered, offered + economicGap * step),
    ),
  );
  if (next <= offered) {
    deal.stage = "club-counter";
    deal.respondsOn = date;
    deal.clubMessage = `${clubNameSafe(deal.otherClubId)} mantiene su oferta en ${fmt(offered)}.`;
    log(deal, date, deal.clubMessage);
    pushEvent(events, deal, deal.clubMessage, "info");
    return events;
  }

  deal.offer.amount = next;
  deal.offer.round += 1;
  deal.rounds += 1;
  deal.stage = "incoming";
  deal.clubMessage =
    `${clubNameSafe(deal.otherClubId)} mejora su oferta a ${fmt(next)}.`
    + (deal.offer.clauses.sellOnPercent > 0
      ? ` Mantiene un ${Math.round(deal.offer.clauses.sellOnPercent * 100)}% de futura venta.`
      : "");

  deal.respondsOn = addDays(date, 30);
  log(deal, date, deal.clubMessage);
  pushEvent(events, deal, deal.clubMessage, "info");
  return events;
}
/** Marca un jugador del usuario como disponible para recibir propuestas de cesión.
 * No obliga a indicar un destino: los clubes interesados aparecerán como
 * ofertas recibidas y se negociarán igual que un fichaje.
 */
export function setUserPlayerLoanListed(playerId: string, listed: boolean): void {
  const player = getPlayer(playerId);
  if (!player) return;
  updatePlayer(playerId, { loanListed: listed });
}

/**
 * Abre una negociación de cesión propuesta por el usuario con un club
 * receptor concreto. El propietario sigue siendo el club del usuario.
 */
export function submitUserLoanOutOffer(input: {
  playerId: string;
  userClubId: string;
  borrowerClubId: string;
  date: string;
  loanFee: number;
  wageShare: number;
  durationMonths?: number;
  type?: Extract<TransferType, "loan" | "loan-option" | "loan-obligation">;
  squadRole?: import("./types").SquadRole;
}): SubmitOfferResult {
  const player = getPlayer(input.playerId);
  if (!player) return { ok: false, reason: "Jugador no encontrado." };
  if (player.clubId !== input.userClubId) {
    return { ok: false, reason: "Solo puedes ceder jugadores que pertenecen a tu club." };
  }
  if (player.loanClubId) return { ok: false, reason: "El jugador ya está cedido." };
  if (input.borrowerClubId === input.userClubId) {
    return { ok: false, reason: "El destino de la cesión debe ser otro club." };
  }
  if (windowForDate(input.date) === "closed") {
    return { ok: false, reason: "El mercado está cerrado." };
  }
  if (hasOpenDealFor(input.playerId)) {
    return { ok: false, reason: "Ya tienes una negociación abierta por este jugador." };
  }
  if (listOpenUserDeals("out").length >= MARKET_TIMING.maxNegotiationsPerClub) {
    return {
      ok: false,
      reason: `No puedes tener más de ${MARKET_TIMING.maxNegotiationsPerClub} negociaciones abiertas.`,
    };
  }

  const type = input.type ?? "loan";
  const requestedDuration = Math.round(input.durationMonths ?? defaultLoanDuration(input.date));
  const clauses = {
    ...emptyClauses(),
    wageShare: clamp(input.wageShare, 0, 1),
    loanDurationMonths: requestedDuration === 6 || requestedDuration === 12 || requestedDuration === 24
      ? requestedDuration
      : defaultLoanDuration(input.date),
    squadRole: input.squadRole ?? "rotation",
  };
  if (type !== "loan") {
    clauses.optionFee = Math.max(0, Math.round(player.value * 0.12));
  }

  const offer = createTransferOffer({
    playerId: player.id,
    playerName: player.name,
    buyerClubId: input.borrowerClubId,
    sellerClubId: input.userClubId,
    amount: Math.max(0, Math.round(input.loanFee)),
    wageOffer: Math.round(player.contract.wage),
    type,
    clauses,
    date: input.date,
  });

  const valuation = valuePlayer(input.playerId, {
    cacheKey: input.date,
    deadlineDay: deadlineToday(input.date),
  });

  const deal: UserDeal = {
    id: nextDealId(),
    direction: "out",
    playerId: player.id,
    playerName: player.name,
    userClubId: input.userClubId,
    otherClubId: input.borrowerClubId,
    offer,
    valuation,
    stage: "waiting-club",
    respondsOn: addDays(input.date, seededInt(1, 3, offer.id, "loan-out")),
    clubDemand: 0,
    clubMessage: `Propuesta de cesión enviada al club ${input.borrowerClubId}.`,
    playerWageDemand: player.contract.wage,
    playerMessage: "",
    competition: 0,
    rounds: 1,
    createdOn: input.date,
    updatedOn: input.date,
    log: [
      {
        date: input.date,
        text: `Cesión propuesta: ${fmt(offer.amount)} de prima, ${Math.round(clauses.wageShare * 100)}% de la ficha y ${clauses.loanDurationMonths} meses.`,
      },
    ],
  };
  deals.set(deal.id, deal);
  return { ok: true, deal };
}

// ============================================================================
// OFERTAS DE LA IA POR JUGADORES DEL USUARIO
// ============================================================================

/** Clubes con dinero y necesidad en la demarcación del jugador. */
function suitorsFor(playerId: string, userClubId: string, date: string): string[] {
  const player = getPlayer(playerId);
  if (!player) return [];
  const cacheKey = cacheKeyFor(date);
  const valuation = valuePlayer(playerId, { cacheKey });
  const suitors: string[] = [];
  const fallback: string[] = [];
  for (const profile of getAllClubProfiles()) {
    if (profile.clubId === userClubId) continue;
    if (maxSpend(profile.clubId) < valuation.minimumPrice) continue;
    if (maxWageOffer(profile.clubId) < wageDemand(playerId, profile.clubId)) continue;
    const report = getSquadReport(profile.clubId, cacheKey);
    const need = report.needs.find((n) => n.group === player.group);
    if (need && player.ovr >= report.startingRating - 2) {
      suitors.push(profile.clubId);
      continue;
    }
    // Sin necesidad declarada, un club aún puede tantear a un jugador que
    // mejore claramente su once: si no, había plantillas del usuario a las
    // que no llegaba jamás una oferta.
    if (player.ovr >= report.startingRating - 1) fallback.push(profile.clubId);
  }
  return suitors.length > 0 ? suitors : fallback;
}

/**
 * Cada día, algún club puede presentar una oferta por un jugador del usuario:
 * primero los transferibles y los que quieren salir, después las estrellas.
 */
function generateOffersForUserPlayers(userClubId: string, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  if (windowForDate(date) === "closed") return events;

  const state = getSimulationState();
  const intensity = state?.intensity ?? 0.5;
  const deadline = deadlineToday(date);
  const chance = (deadline ? 0.6 : 0.3) * (0.5 + intensity);
  if (seededUnit("user-offers", userClubId, date) > chance) return events;
  if (listOpenUserDeals("out").length >= 3) return events;

  const cacheKey = cacheKeyFor(date);
  const squad = getClubPlayers(userClubId).filter((p) => !hasOpenDealFor(p.id));
  if (squad.length === 0) return events;

  const scored = squad
    .map((p) => ({
      player: p,
      weight:
        (p.transferListed ? 1 : 0) +
        (wantsOut(p.id, cacheKey) ? 0.8 : 0) +
        clamp((p.ovr - 74) / 20, 0, 0.7) +
        seededUnit("target", p.id, date) * 0.4,
    }))
    .sort((a, b) => b.weight - a.weight);

  // Se prueban varios candidatos: si por el primero no hay pretendientes,
  // se sigue bajando por la lista antes de renunciar a la oferta del día.
  let target: (typeof scored)[number]["player"] | undefined;
  let suitors: string[] = [];
  for (const entry of scored.slice(0, 6)) {
    const found = suitorsFor(entry.player.id, userClubId, date);
    if (found.length === 0) continue;
    target = entry.player;
    suitors = found;
    break;
  }
  if (!target || suitors.length === 0) return events;
  const buyerId = suitors[Math.floor(seededUnit("suitor", target.id, date) * suitors.length)];
  const profile = getClubProfile(buyerId);
  const valuation = valuePlayer(target.id, { cacheKey, deadlineDay: deadline });

  // Cuanto más agresivo y rico, más se acerca al precio ideal.
  const t = clamp(profile.aggression * 0.5 + profile.financialPower * 0.5, 0, 1);
  const base = valuation.minimumPrice + (valuation.idealPrice - valuation.minimumPrice) * t;
  const amount = Math.min(maxSpend(buyerId), Math.round(base / 100_000) * 100_000);
  if (amount <= 0) return events;

  const openingClauses = {
    ...emptyClauses(),
    ...proposeClauses(
      buyerId,
      valuation,
      Math.max(0, valuation.idealPrice - amount),
      `${date}-${target.id}-${buyerId}-opening`,
    ),
  };

  const offer = createTransferOffer({
    playerId: target.id,
    playerName: target.name,
    buyerClubId: buyerId,
    sellerClubId: userClubId,
    amount,
    wageOffer: Math.min(maxWageOffer(buyerId), wageDemand(target.id, buyerId)),
    clauses: openingClauses,
    date,
  });

  registerInterest({
    clubId: buyerId,
    playerId: target.id,
    amount,
    wageOffer: offer.wageOffer,
    date,
  });

  const deal: UserDeal = {
    id: nextDealId(),
    direction: "out",
    playerId: target.id,
    playerName: target.name,
    userClubId,
    otherClubId: buyerId,
    offer,
    valuation,
    stage: "incoming",
    respondsOn: addDays(date, 3),
    clubDemand: 0,
    clubMessage:
      `El ${buyerId} ofrece ${fmt(amount)} por ${target.name}`
      + (offer.clauses.sellOnPercent > 0
        ? ` y ${Math.round(offer.clauses.sellOnPercent * 100)}% de futura venta.`
        : "."),

    playerWageDemand: 0,
    playerMessage: "",
    competition: competitionFor(target.id, userClubId),
    rounds: 1,
    createdOn: date,
    updatedOn: date,
    log: [{
      date,
      text:
        `Oferta recibida: ${fmt(amount)} desde ${buyerId}`
        + (offer.clauses.sellOnPercent > 0
          ? ` con ${Math.round(offer.clauses.sellOnPercent * 100)}% de futura venta.`
          : "."),
    }],

  };
  deals.set(deal.id, deal);
  pushEvent(events, deal, deal.clubMessage, "info");

  return events;
}

function loanCandidateScore(player: MarketPlayer, cacheKey: string): number {
  const playingNeed = clamp(1 - player.minutesShare, 0, 1);
  const youth = clamp((22 - player.age) / 7, 0, 1);
  const potential = clamp((player.potential - player.ovr) / 15, 0, 1);
  const starPenalty = player.ovr >= 88 ? 2.5 : player.ovr >= 84 ? 1.2 : 0;
  const listedBonus = player.loanListed ? 1.6 : 0;
  return playingNeed * 1.4 + youth * 1.2 + potential + listedBonus - starPenalty + seededUnit("loan-candidate", player.id, cacheKey) * 0.5;
}

function loanSuitorsFor(playerId: string, userClubId: string, date: string): string[] {
  const player = getPlayer(playerId);
  if (!player) return [];
  const result: string[] = [];
  const cacheKey = cacheKeyFor(date);
  for (const profile of getAllClubProfiles()) {
    if (profile.clubId === userClubId) continue;
    const report = getSquadReport(profile.clubId, cacheKey);
    const need = report.needs.find((n) => n.group === player.group);
    if (!need || need.urgency < 0.25) continue;
    if (player.ovr > report.startingRating + 2.5 && player.age > 24) continue;
    if (report.size <= 22 && player.age > 24 && player.ovr < report.startingRating - 4) continue;
    if (need.urgency >= 0.55 || player.age <= 22) result.push(profile.clubId);
  }
  return result;
}

function generateLoanOffersForUserPlayers(userClubId: string, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  if (windowForDate(date) === "closed") return events;
  if (listOpenUserDeals("out").length >= 3) return events;
  if (seededUnit("loan-offers", userClubId, date) > 0.38) return events;

  const cacheKey = cacheKeyFor(date);
  const candidates = getClubPlayers(userClubId)
    .filter((p) => !p.loanClubId && !hasOpenDealFor(p.id))
    .filter((p) => !isKeyPlayer(p.id, cacheKey) && p.ovr < 88)
    .map((player) => ({ player, score: loanCandidateScore(player, cacheKey) }))
    .filter(({ score }) => score >= 1.0)
    .sort((a, b) => b.score - a.score);

  for (const { player } of candidates.slice(0, 8)) {
    const suitors = loanSuitorsFor(player.id, userClubId, date);
    if (suitors.length === 0) continue;

    const borrowerId = suitors[Math.floor(seededUnit("loan-suitor", player.id, date) * suitors.length)];
    const typeRoll = seededUnit("loan-type", player.id, date);
    const type: Extract<TransferType, "loan" | "loan-option" | "loan-obligation"> =
      typeRoll < 0.72 ? "loan" : typeRoll < 0.93 ? "loan-option" : "loan-obligation";
    const clauses = {
      ...buildLoanTerms(player.id, type, `${player.id}-${date}`),
      squadRole: minimumSquadRole(player.id, borrowerId, cacheKey),
    };
    const fee = seededUnit("loan-fee", player.id, borrowerId, date) < 0.65
      ? 0
      : Math.max(0, Math.round(player.value * (0.005 + seededUnit("loan-fee-rate", player.id, borrowerId, date) * 0.02) / 100_000) * 100_000);

    const offer = createTransferOffer({
      playerId: player.id,
      playerName: player.name,
      buyerClubId: borrowerId,
      sellerClubId: userClubId,
      amount: fee,
      wageOffer: player.contract.wage,
      type,
      clauses: { ...clauses, loanDurationMonths: defaultLoanDuration(date) },
      date,
    });
    const valuation = valuePlayer(player.id, { cacheKey, deadlineDay: deadlineToday(date) });
    const deal: UserDeal = {
      id: nextDealId(),
      direction: "out",
      playerId: player.id,
      playerName: player.name,
      userClubId,
      otherClubId: borrowerId,
      offer,
      valuation,
      stage: "incoming",
      respondsOn: addDays(date, 3),
      clubDemand: fee,
      clubMessage: `${teamById(borrowerId).name} ofrece hacerse cargo de parte de la ficha de ${player.name} y le reserva un rol de ${playerRoleLabel(clauses.squadRole ?? "rotation")}.`,
      playerWageDemand: 0,
      playerMessage: "",
      competition: 0,
      rounds: 1,
      outgoingCounterRounds: 0,
      createdOn: date,
      updatedOn: date,
      log: [{
        date,
        text: `Oferta de cesión desde ${teamById(borrowerId).name}: ${fmt(fee)} de prima, ${Math.round(clauses.wageShare * 100)}% de la ficha y rol ${playerRoleLabel(clauses.squadRole ?? "rotation")}.`,
      }],
    };
    deals.set(deal.id, deal);
    pushEvent(events, deal, `Oferta de cesión recibida por ${player.name} desde ${teamById(borrowerId).name}.`, "info");
    break;
  }
  return events;
}

// ============================================================================
// RESPUESTA DEL USUARIO A UNA OFERTA RECIBIDA
// ============================================================================

export interface IncomingResponseResult extends FinalizeResult {
  deal?: UserDeal;
  /** Operación atendida sin mostrar un error al usuario (p. ej. decisión del jugador). */
  silent?: boolean;
}

/**
 * El usuario acepta vender. A partir de ese momento el jugador toma una
 * decisión independiente: tiene un 80% de probabilidad de aceptar la salida y
 * un 20% de quedarse en el club. Si se queda, la operación se cancela y no se
 * modifica la plantilla, el presupuesto ni el historial de traspasos.
 */
export function acceptIncomingOffer(
  dealId: string,
  date: string,
  clauses?: Partial<OfferClauses>,
): IncomingResponseResult {
  if (windowForDate(date) === "closed") {
    return { ok: false, reason: "El mercado de fichajes está cerrado." };
  }
  const deal = deals.get(dealId);
  if (!deal || deal.direction !== "out" || deal.stage !== "incoming") {
    return { ok: true, silent: true };
  }

  if (isLoanOffer(deal.offer.type) && clauses?.squadRole) {
    deal.offer.clauses.squadRole = clauses.squadRole;
    deal.clubSquadRoleDemand = undefined;
    log(deal, date, `Has aceptado también el rol de ${playerRoleLabel(clauses.squadRole)} para ${deal.playerName}.`);
  }

  // El club ya ha aceptado la oferta, pero la decisión del jugador nunca debe
  // resolverse en el mismo instante salvo en los últimos 2 días del mercado.
  // Durante el resto de la ventana queda programada a +2 días y será procesada
  // por `advanceUserDeals()`.
  deal.offer.status = "accepted";
  deal.stage = "player-decision";
  deal.respondsOn = playerDecisionDate(date);
  deal.clubMessage = `${clubNameSafe(deal.otherClubId)} acepta tu oferta y el acuerdo entre clubes queda alcanzado.`;
  deal.playerMessage = `${deal.playerName} está valorando su salida al ${clubNameSafe(deal.otherClubId)}.`
    + (deal.respondsOn === date
      ? " La decisión es inmediata porque quedan pocos días para el cierre del mercado."
      : " Recibirás su decisión en unos 2 días.");
  log(deal, date, `Has aceptado la oferta de ${clubNameSafe(deal.otherClubId)}. Acuerdo entre clubes.`);
  log(deal, date, deal.playerMessage);
  return { ok: true, deal };
}

/** El usuario pide más dinero por su jugador. */
export function counterIncomingOffer(
  dealId: string,
  demand: number,
  date: string,
  clauses?: Partial<OfferClauses>,
): IncomingResponseResult {
  const deal = deals.get(dealId);
  if (!deal || deal.direction !== "out" || deal.stage !== "incoming") {
    return { ok: false, reason: "No hay oferta que contraofertar." };
  }
  if (deal.rounds >= MARKET_TIMING.maxNegotiationRounds) {
    deal.stage = "failed";
    deal.finishedOn = date;
    deal.blockedForWindow = marketWindowKey(date);
    deal.offer.status = "final-rejection";
    deal.clubMessage = "";
    deal.playerMessage = "";
    log(deal, date, "La negociación ha terminado definitivamente en esta ventana de fichajes.");
    return { ok: true, deal, silent: true };
  }
  // En una cesión se negocian todas las condiciones económicas/deportivas:
  // prima, porcentaje del salario asumido por el destino, duración y, cuando
  // corresponda, precio de la opción/obligación de compra. La ficha anual
  // nunca se modifica: siempre es el salario vigente del jugador.
  const counterDemand = Math.max(0, Math.round(demand));
  // En una venta/cesión saliente, el importe introducido por el usuario es
  // nuestro nuevo precio pedido; la oferta original del comprador se conserva
  // como referencia hasta que el motor responda.
  if (deal.direction === "out") {
    deal.clubDemand = counterDemand;
  } else {
    deal.clubDemand = counterDemand;
    deal.offer.amount = counterDemand;
  }
  if (isLoanOffer(deal.offer.type)) {
    const requestedShare = clamp(clauses?.wageShare ?? deal.offer.clauses.wageShare ?? 0, 0, 1);
    const requestedDuration = clauses?.loanDurationMonths !== undefined
      ? Math.round(clauses.loanDurationMonths)
      : deal.offer.clauses.loanDurationMonths;
    const validDuration = requestedDuration === 6 || requestedDuration === 12 || requestedDuration === 24
      ? requestedDuration
      : deal.offer.clauses.loanDurationMonths;
    const requestedOptionFee = clauses?.optionFee !== undefined
      ? Math.max(0, Math.round(clauses.optionFee))
      : deal.offer.clauses.optionFee;
    const requestedRole = clauses?.squadRole ?? deal.offer.clauses.squadRole ?? "rotation";

    // La condición de rol pertenece a TODA la negociación de la cesión.
    // Se guarda como demanda del usuario hasta que el club responda, y nunca
    // se elimina al cambiar de ronda.
    deal.clubSquadRoleDemand = requestedRole;
    deal.clubWageShareDemand = requestedShare;
    deal.clubLoanDurationDemand = validDuration;
    deal.clubLoanTypeDemand = clauses?.loanType && isLoanOffer(clauses.loanType)
      ? clauses.loanType
      : (deal.clubLoanTypeDemand ?? deal.offer.type as Extract<TransferType, "loan" | "loan-option" | "loan-obligation">);
    deal.clubOptionFeeDemand = deal.clubLoanTypeDemand === "loan" ? 0 : requestedOptionFee;
    deal.clubSquadRoleDemand = requestedRole;
    deal.offer.clauses.loanType = deal.clubLoanTypeDemand;

    const destinationShare = Math.round(requestedShare * 100);
    const ownerShare = 100 - destinationShare;
    const requestedType = deal.clubLoanTypeDemand ?? deal.offer.type as Extract<TransferType, "loan" | "loan-option" | "loan-obligation">;
    const purchaseText = requestedType === "loan"
      ? "sin opción de compra"
      : `${requestedType === "loan-option" ? "opción" : "compra obligatoria"} de ${fmt(deal.clubOptionFeeDemand)}`;
    deal.clubMessage = `Contraoferta de cesión: ${fmt(deal.clubDemand)} de prima · ${destinationShare}% del sueldo el destino / ${ownerShare}% tu club · ${deal.clubLoanDurationDemand} meses · ${purchaseText} · rol ${playerRoleLabel(requestedRole)}.`;
    log(deal, date, `Has contraofertado la cesión: ${fmt(deal.clubDemand)}, ${destinationShare}% del sueldo al destino, ${deal.clubLoanDurationDemand} meses, ${purchaseText} y rol ${playerRoleLabel(requestedRole)}.`);
  } else {
    // En una venta también puedes negociar el porcentaje de futura venta.
    // Esta cláusula forma parte de la contraoferta y debe quedar guardada para
    // que el comprador la reciba junto al nuevo precio pedido.
    if (clauses?.sellOnPercent !== undefined) {
      deal.offer.clauses.sellOnPercent = clamp(clauses.sellOnPercent, 0, 0.5);
    }
    log(
      deal,
      date,
      `Has pedido ${fmt(deal.clubDemand)} para negociar la salida`
        + (deal.offer.clauses.sellOnPercent > 0
          ? ` con un ${Math.round(deal.offer.clauses.sellOnPercent * 100)}% de futura venta.`
          : "."),
    );
  }
  // Una contraoferta del usuario siempre deja la operación en espera de la
  // respuesta del club, igual que ocurre con los fichajes. `club-waiting` se
  // reserva para la situación en la que el club ha decidido esperar otras
  // ofertas; no debe bloquear el ciclo normal de respuesta.
  deal.stage = "waiting-club";
  deal.respondsOn = addDays(date, seededInt(1, 2, deal.id, deal.rounds));
  log(deal, date, "El club está valorando tu contraoferta. Espera su respuesta.");
  return { ok: true, deal };
}

/** El usuario rechaza la oferta recibida. */
export function rejectIncomingOffer(dealId: string, date: string): IncomingResponseResult {
  const result = withdrawUserDeal(dealId, date);
  const deal = deals.get(dealId);
  if (deal) dropInterest(deal.playerId, deal.otherClubId);
  return { ok: result.ok, reason: result.reason, deal };
}

// ============================================================================
// AGENTES LIBRES
// ============================================================================

/** Firma a un agente libre si acepta la ficha propuesta. */
export function signFreeAgent(
  playerId: string,
  userClubId: string,
  wageOffer: number,
  date: string,
): FinalizeResult {
  const player = getPlayer(playerId);
  if (!player) return { ok: false, reason: "Jugador no encontrado." };
  if (player.clubId) return { ok: false, reason: "No es agente libre." };
  if (userClubId === "ath" && player.nation.trim().toLowerCase() !== "españa") {
    return { ok: false, reason: "Athletic Club solo puede fichar jugadores españoles." };
  }

  const decision = decideOnMove({
    playerId,
    toClubId: userClubId,
    wageOffer,
    cacheKey: cacheKeyFor(date),
    deadlineDay: deadlineToday(date),
  });
  if (decision.verdict !== "accepted") {
    return { ok: false, reason: decision.message };
  }
  const offer = createTransferOffer({
    playerId,
    playerName: player.name,
    buyerClubId: userClubId,
    // Agente libre: no hay vendedor real.
    sellerClubId: "",
    amount: 0,
    wageOffer,
    type: "free",
    date,
  });
  const record = withUserApproval(() => completeTransfer(offer, date));
  if (!record) return { ok: false, reason: "No se pudo firmar." };
  recordTransfer(record);
  return { ok: true, record, fee: 0, wage: wageOffer };
}

// ============================================================================
// UTILIDADES Y PERSISTENCIA
// ============================================================================

/** Formato corto de importes en millones. */
export function fmt(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M €`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K €`;
  return `${Math.round(amount)} €`;
}

/** Etiqueta legible de la fase de una operación. */
export function stageLabel(stage: UserDealStage): string {
  switch (stage) {
    case "waiting-club":
      return "Esperando respuesta";
    case "club-counter":
      return "Contraoferta del club";
    case "club-waiting":
      return "El club espera otras ofertas";
    case "player-terms":
      return "Negociación con el jugador";
    case "player-decision":
      return "El jugador decide";
    case "closing":
      return "Cierre en curso";
    case "ready":
      return "Listo para cerrar";
    case "incoming":
      return "Oferta recibida";
    case "completed":
      return "Cerrada";
    default:
      return "Fracasada";
  }
}

/** Instantánea serializable de las negociaciones del usuario. */
export function snapshotUserDeals(): UserDeal[] {
  return Array.from(deals.values());
}

/** Restaura las negociaciones del usuario desde la partida guardada. */
export function restoreUserDeals(saved: readonly UserDeal[]): void {
  deals.clear();
  for (const deal of saved) deals.set(deal.id, deal);
  dealCounter = saved.length;
}

/** Reinicia el registro (al cargar otra partida). */
export function resetUserDeals(): void {
  deals.clear();
  dealCounter = 0;
}

/** Registra manualmente ingresos/gastos del club del usuario en el motor. */
export function syncUserFinances(
  userClubId: string,
  fee: number,
  wage: number,
  sold: boolean,
): void {
  if (sold) registerSale(userClubId, fee, wage);
  else registerSigning(userClubId, fee, wage);
}

/** Marca a un jugador del usuario como transferible en el motor. */
export function setUserPlayerTransferListed(playerId: string, listed: boolean): void {
  updatePlayer(playerId, { transferListed: listed, listReason: listed ? "user" : null });
}

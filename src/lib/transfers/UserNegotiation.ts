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
  needsToSell,
  registerSale,
  registerSigning,
  registerLoanOut,
} from "./BudgetManager";
import { getClubPlayers, getPlayer, updatePlayer } from "./PlayerIndex";
import { getSquadReport } from "./SquadAnalyzer";
import { askingPrice, isAvailable, isKeyPlayer, valuePlayer } from "./MarketValuation";
import { decideOnMove, wageDemand, wantsOut } from "./PlayerDecision";
import { competitionFor, dropInterest, registerInterest, sellerShouldWait } from "./BidWar";
import {
  buildLoanTerms,
  createTransferOffer,
  decideImprovement,
  emptyClauses,
  offerWorth,
  processCounterOffer,
} from "./NegotiationEngine";
import { completeTransfer } from "./TransferEngine";
import { recordTransfer } from "./TransferHistory";
import { withUserApproval, isPlayerSettled } from "./MarketLocks";
import { getSimulationState, isDeadlineDay, windowForDate } from "./MarketSimulation";
import { MARKET_TIMING, WAGE_RULES } from "./constants";
import { clamp, seededInt, seededUnit } from "./random";
import type {
  MarketPlayer,
  MarketValuation,
  OfferClauses,
  TransferOffer,
  TransferRecord,
  TransferType,
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
  /** Acuerdo entre clubes: falta negociar la ficha con el jugador. */
  | "player-terms"
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

function cacheKeyFor(date: string): string {
  return date;
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

// ============================================================================
// CONSULTAS
// ============================================================================

/** Todas las operaciones del usuario, de la más reciente a la más antigua. */
export function listUserDeals(direction?: UserDealDirection): UserDeal[] {
  const all = Array.from(deals.values());
  const filtered = direction ? all.filter((d) => d.direction === direction) : all;
  return filtered.sort((a, b) => (a.updatedOn < b.updatedOn ? 1 : -1));
}

/** Operaciones abiertas (ni cerradas ni fracasadas). */
export function listOpenUserDeals(direction?: UserDealDirection): UserDeal[] {
  return listUserDeals(direction).filter((d) => d.stage !== "completed" && d.stage !== "failed");
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
    return { ok: false, reason: "El club no aceptará más rondas de negociación." };
  }

  const amount = Math.max(deal.offer.amount, Math.round(patch.amount ?? deal.offer.amount));
  deal.offer.amount = amount;
  const loanDeal = isLoanOffer(deal.offer.type);
  if (!loanDeal && patch.wageOffer !== undefined) {
    deal.offer.wageOffer = Math.max(WAGE_RULES.minimumWage, Math.round(patch.wageOffer));
  }
  if (loanDeal) {
    const player = getPlayer(deal.playerId);
    if (player) deal.offer.wageOffer = Math.round(player.contract.wage);
    if (patch.clauses) {
      const next = { ...deal.offer.clauses };
      if (patch.clauses.wageShare !== undefined) next.wageShare = clamp(patch.clauses.wageShare, 0, 1);
      if (patch.clauses.loanDurationMonths !== undefined) {
        const duration = Math.round(patch.clauses.loanDurationMonths);
        next.loanDurationMonths = duration === 6 || duration === 12 || duration === 24 ? duration : next.loanDurationMonths;
      }
      deal.offer.clauses = next;
    }
  } else if (patch.clauses) {
    deal.offer.clauses = {
      ...deal.offer.clauses,
      ...patch.clauses,
      sellOnPercent: clamp(
        patch.clauses.sellOnPercent ?? deal.offer.clauses.sellOnPercent,
        0,
        0.5,
      ),
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
  log(deal, date, `Oferta mejorada a ${fmt(amount)} (ronda ${deal.rounds}).`);
  return { ok: true, deal };
}

/** Acepta el importe que pide el club vendedor. */
export function acceptClubDemand(dealId: string, date: string): SubmitOfferResult {
  const deal = deals.get(dealId);
  if (!deal || deal.stage !== "club-counter") {
    return { ok: true, silent: true };
  }
  return improveUserOffer(dealId, { amount: deal.clubDemand }, date);
}

/** Mejora la ficha ofrecida al jugador durante la fase de condiciones. */
export function improvePlayerTerms(
  dealId: string,
  wageOffer: number,
  date: string,
): SubmitOfferResult {
  const deal = deals.get(dealId);
  if (!deal || deal.stage !== "player-terms") {
    return { ok: false, reason: "No hay negociación de ficha abierta." };
  }
  if (isLoanOffer(deal.offer.type)) {
    return { ok: false, reason: "En una cesión no se modifica el sueldo anual del jugador; sólo el porcentaje que asume cada club." };
  }
  deal.offer.wageOffer = Math.max(WAGE_RULES.minimumWage, Math.round(wageOffer));
  deal.respondsOn = addDays(date, 1);
  deal.stage = "player-terms";
  deal.playerMessage = "El jugador y su agente estudian la propuesta.";
  log(deal, date, `Nueva ficha ofrecida: ${fmt(deal.offer.wageOffer)}/año.`);
  return { ok: true, deal };
}

/** El usuario retira su oferta o rechaza la operación. */
export function withdrawUserDeal(dealId: string, date: string): SubmitOfferResult {
  const deal = deals.get(dealId);
  if (!deal) return { ok: false, reason: "Negociación no encontrada." };
  deal.stage = "failed";
  deal.offer.status = "withdrawn";
  if (deal.direction === "in") dropInterest(deal.playerId, deal.userClubId);
  log(deal, date, deal.direction === "in" ? "Has retirado tu oferta." : "Has rechazado la oferta.");
  return { ok: true, deal };
}

/** Elimina del panel las operaciones ya cerradas. */
export function clearFinishedUserDeals(): void {
  for (const deal of Array.from(deals.values())) {
    if (deal.stage === "completed" || deal.stage === "failed") deals.delete(deal.id);
  }
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
  if (deal.stage !== "ready") return { ok: false, reason: "El acuerdo todavía no está cerrado." };

  // Para una venta necesitamos conservar el salario que tenía el jugador
  // antes de completarTransfer(), porque este último reemplaza su contrato
  // al llegar al club comprador. Ese mismo salario es el que se devuelve a la
  // caja del vendedor y el que debe desaparecer de su masa salarial.
  const sellingPlayerWage =
    deal.direction === "out" ? getPlayer(deal.playerId)?.contract.wage ?? 0 : deal.offer.wageOffer;

  const record = withUserApproval(() => completeTransfer(deal.offer, date));
  if (!record) return { ok: false, reason: "No se pudo cerrar la operación." };
  recordTransfer(record);
  deal.stage = "completed";
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
        : `${deal.playerName} sigue esperando que ajustes su ficha para firmar.`,
      "info",
    );
  }
  return events;
}

/** Procesa las respuestas pendientes y genera ofertas de la IA por tus jugadores. */
export function advanceUserDeals(userClubId: string, date: string): UserDealEvent[] {
  if (windowForDate(date) === "closed") {
    return cancelOpenDealsOnMarketClose(userClubId, date);
  }
  const events: UserDealEvent[] = [];
  for (const deal of Array.from(deals.values())) {
    if (deal.stage === "completed" || deal.stage === "failed") continue;
    if (deal.userClubId !== userClubId) continue;
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
): void {
  events.push({
    dealId: deal.id,
    kind,
    playerName: deal.playerName,
    stage: deal.stage,
    text,
    direction: deal.direction,
  });
}

/** Respuesta del club vendedor a una oferta del usuario. */
function processIncomingResponse(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  const player = getPlayer(deal.playerId);
  if (!player || player.clubId !== deal.otherClubId) {
    deal.stage = "failed";
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

  // Con varios pretendientes y sin urgencia, el vendedor deja correr los días.
  const urgent = needsToSell(deal.otherClubId);
  if (
    sellerShouldWait(
      deal.playerId,
      deal.otherClubId,
      offerWorth(deal.offer),
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

  const response = processCounterOffer(deal.offer, deal.valuation);
  deal.clubMessage = response.message;

  if (response.status === "accepted") {
    log(deal, date, response.message);
    deal.stage = "player-terms";
    deal.respondsOn = date;
    pushEvent(events, deal, `Acuerdo con el club por ${deal.playerName}: falta la ficha.`, "good");
    return [...events, ...processPlayerTerms(deal, date)];
  }

  if (response.status === "final-rejection") {
    deal.stage = "failed";
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
    deal.offer.status = "accepted";
    deal.stage = "ready";
    deal.respondsOn = date;
    deal.clubMessage = `El club acepta la cesión por ${fmt(deal.offer.amount)}, el ${Math.round(deal.offer.clauses.wageShare * 100)}% del sueldo y ${deal.offer.clauses.loanDurationMonths} meses.`;
    log(deal, date, deal.clubMessage);
    pushEvent(events, deal, `El club acepta la cesión de ${deal.playerName}: puedes cerrar la operación.`, "good");
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
  deal.respondsOn = addDays(date, 30);
  deal.clubMessage =
    `Contraoferta de cesión: ${fmt(deal.clubDemand)} de prima y `
    + `${Math.round(deal.offer.clauses.wageShare * 100)}% de la ficha.`;
  log(deal, date, deal.clubMessage);
  pushEvent(events, deal, deal.clubMessage, "info");
  return events;
}

function processOutgoingLoanBid(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  const minimumFee = Math.max(0, Math.round(deal.valuation.marketValue * 0.015));
  const minimumWageShare = 0.5;
  const enoughFee = deal.offer.amount >= minimumFee;
  const enoughWage = deal.offer.clauses.wageShare >= minimumWageShare;

  if (enoughFee && enoughWage) {
    deal.offer.status = "accepted";
    deal.stage = "incoming";
    deal.clubMessage = `El ${deal.otherClubId} acepta la propuesta de cesión.`;
    deal.respondsOn = addDays(date, 30);
    log(deal, date, deal.clubMessage);
    pushEvent(events, deal, `${deal.otherClubId} acepta la cesión de ${deal.playerName}.`, "good");
    return events;
  }

  if (deal.rounds >= MARKET_TIMING.maxNegotiationRounds) {
    deal.stage = "failed";
    deal.offer.status = "final-rejection";
    log(deal, date, "La negociación de cesión se ha roto.");
    pushEvent(events, deal, `Se rompe la negociación de cesión por ${deal.playerName}.`, "bad");
    return events;
  }

  deal.rounds += 1;
  deal.offer.round += 1;
  deal.stage = "club-counter";
  deal.clubDemand = Math.max(deal.offer.amount, minimumFee);
  deal.offer.clauses.wageShare = Math.min(1, Math.max(deal.offer.clauses.wageShare, minimumWageShare));
  deal.respondsOn = addDays(date, 30);
  deal.clubMessage =
    `El ${deal.otherClubId} pide ${fmt(deal.clubDemand)} de prima y `
    + `${Math.round(deal.offer.clauses.wageShare * 100)}% de la ficha.`;
  log(deal, date, deal.clubMessage);
  pushEvent(events, deal, deal.clubMessage, "info");
  return events;
}

/** Negociación de la ficha con el jugador tras el acuerdo entre clubes. */
function processPlayerTerms(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  const decision = decideOnMove({
    playerId: deal.playerId,
    toClubId: deal.userClubId,
    wageOffer: deal.offer.wageOffer,
    cacheKey: cacheKeyFor(date),
    loan: deal.offer.type !== "permanent" && deal.offer.type !== "free",
    deadlineDay: deadlineToday(date),
  });
  deal.playerWageDemand = decision.wageRequested;
  deal.playerMessage = decision.message;

  if (decision.verdict === "accepted") {
    deal.stage = "ready";
    log(deal, date, decision.message);
    pushEvent(events, deal, `${deal.playerName} quiere firmar: confirma el fichaje.`, "good");
    return events;
  }
  if (decision.verdict === "rejected-project") {
    deal.stage = "failed";
    dropInterest(deal.playerId, deal.userClubId);
    log(deal, date, decision.message);
    pushEvent(events, deal, decision.message, "bad");
    return events;
  }
  deal.stage = "player-terms";
  deal.respondsOn = addDays(date, 30);
  log(deal, date, decision.message);
  pushEvent(events, deal, decision.message);
  return events;
}

/** Respuesta de la IA a la contraoferta del usuario cuando el usuario vende. */
function processOutgoingBid(deal: UserDeal, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  const decision = decideImprovement(
    deal.offer,
    { status: "counter", counterAmount: deal.clubDemand, demands: null, message: "" },
    deal.valuation,
    maxSpend(deal.otherClubId),
  );

  if (decision.action === "withdraw") {
    deal.stage = "failed";
    deal.offer.status = "withdrawn";
    log(deal, date, decision.message);
    pushEvent(
      events,
      deal,
      `El ${deal.otherClubId} retira su oferta por ${deal.playerName}.`,
      "bad",
    );
    return events;
  }

  if (decision.action === "improve") {
    deal.offer.amount = decision.amount;
    deal.offer.clauses = decision.clauses;
    deal.offer.round += 1;
    deal.rounds += 1;
  }
  deal.stage = "incoming";
  deal.clubMessage = decision.message;
  deal.respondsOn = addDays(date, 30);
  log(deal, date, decision.message);
  pushEvent(events, deal, decision.message);
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

  const offer = createTransferOffer({
    playerId: target.id,
    playerName: target.name,
    buyerClubId: buyerId,
    sellerClubId: userClubId,
    amount,
    wageOffer: Math.min(maxWageOffer(buyerId), wageDemand(target.id, buyerId)),
    clauses: emptyClauses(),
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
    respondsOn: addDays(date, 30),
    clubDemand: 0,
    clubMessage: `El ${buyerId} ofrece ${fmt(amount)} por ${target.name}.`,
    playerWageDemand: wageDemand(target.id, buyerId),
    playerMessage: "",
    competition: competitionFor(target.id, userClubId),
    rounds: 1,
    createdOn: date,
    updatedOn: date,
    log: [{ date, text: `Oferta recibida: ${fmt(amount)} desde ${buyerId}.` }],
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
    const clauses = buildLoanTerms(player.id, type, `${player.id}-${date}`);
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
      respondsOn: addDays(date, 30),
      clubDemand: fee,
      clubMessage: `${teamById(borrowerId).name} ofrece hacerse cargo de parte de la ficha de ${player.name}.`,
      playerWageDemand: player.contract.wage,
      playerMessage: "",
      competition: 0,
      rounds: 1,
      createdOn: date,
      updatedOn: date,
      log: [{
        date,
        text: `Oferta de cesión desde ${teamById(borrowerId).name}: ${fmt(fee)} de prima y ${Math.round(clauses.wageShare * 100)}% de la ficha.`,
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
export function acceptIncomingOffer(dealId: string, date: string): IncomingResponseResult {
  if (windowForDate(date) === "closed") {
    return { ok: false, reason: "El mercado de fichajes está cerrado." };
  }
  const deal = deals.get(dealId);
  if (!deal || deal.direction !== "out" || deal.stage !== "incoming") {
    return { ok: true, silent: true };
  }

  // El 80%/20% es deliberadamente una tirada separada de la decisión normal
  // sobre fichajes: aquí el club del usuario ya ha aceptado la oferta recibida.
  // `seededUnit` mantiene el resultado estable dentro de la misma partida.
  if (isLoanOffer(deal.offer.type) && deal.clubDemand > deal.offer.amount) {
    deal.offer.amount = deal.clubDemand;
  }

  const playerLeaves = seededUnit(
    "incoming-sale-player-decision",
    deal.id,
    deal.playerId,
    deal.otherClubId,
    date,
  ) < 0.8;

  if (!playerLeaves) {
    deal.stage = "failed";
    deal.offer.status = "rejected";
    // El rechazo se conserva en el log interno, pero no se fuerza como error
    // rojo ni como toast: es un resultado normal de la negociación.
    const stayMessage = `${deal.playerName} ha decidido quedarse en el club. La venta ha sido cancelada porque no ha querido marcharse.`;
    deal.playerMessage = "";
    dropInterest(deal.playerId, deal.otherClubId);
    log(deal, date, stayMessage);
    return { ok: true, reason: undefined, deal, silent: true };
  }

  deal.playerMessage = `${deal.playerName} ha aceptado marcharse. La venta puede cerrarse.`;
  deal.stage = "ready";
  log(deal, date, deal.playerMessage);
  log(deal, date, "Acuerdo total: la venta puede cerrarse.");

  const result = finalizeUserDeal(deal.id, date);
  return { ...result, deal };
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
    return { ok: false, reason: "El club no negociará más rondas." };
  }
  // En una cesión se negocian todas las condiciones económicas/deportivas:
  // prima, porcentaje del salario asumido por el destino, duración y, cuando
  // corresponda, precio de la opción/obligación de compra. La ficha anual
  // nunca se modifica: siempre es el salario vigente del jugador.
  deal.clubDemand = Math.max(0, Math.round(demand));
  // La contraoferta pasa a ser la nueva propuesta real que debe valorar el
  // otro club; `clubDemand` se conserva como referencia visual.
  deal.offer.amount = deal.clubDemand;
  if (isLoanOffer(deal.offer.type)) {
    const next = { ...deal.offer.clauses };
    if (clauses?.wageShare !== undefined) next.wageShare = clamp(clauses.wageShare, 0, 1);
    if (clauses?.loanDurationMonths !== undefined) {
      const duration = Math.round(clauses.loanDurationMonths);
      if (duration === 6 || duration === 12 || duration === 24) next.loanDurationMonths = duration;
    }
    if (clauses?.optionFee !== undefined && deal.offer.type !== "loan") {
      next.optionFee = Math.max(0, Math.round(clauses.optionFee));
    }
    deal.offer.clauses = next;
    const destinationShare = Math.round(next.wageShare * 100);
    const ownerShare = 100 - destinationShare;
    const purchaseText = deal.offer.type === "loan"
      ? "sin opción de compra"
      : `${deal.offer.type === "loan-option" ? "opción" : "compra obligatoria"} de ${fmt(next.optionFee)}`;
    deal.clubMessage = `Contraoferta de cesión: ${fmt(deal.clubDemand)} de prima · ${destinationShare}% del sueldo el destino / ${ownerShare}% tu club · ${next.loanDurationMonths} meses · ${purchaseText}.`;
    log(deal, date, `Has contraofertado la cesión: ${fmt(deal.clubDemand)}, ${destinationShare}% del sueldo al destino, ${next.loanDurationMonths} meses y ${purchaseText}.`);
  } else {
    log(deal, date, `Has pedido ${fmt(deal.clubDemand)} para negociar la salida.`);
  }
  deal.stage = "waiting-club";
  deal.respondsOn = addDays(date, seededInt(1, 2, deal.id, deal.rounds));
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
      return "Negociando la ficha";
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

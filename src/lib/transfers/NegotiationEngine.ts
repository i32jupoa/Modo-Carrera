/**
 * Motor de negociación.
 *
 * Cubre el ciclo completo de una operación entre dos clubes: creación de la
 * oferta, valoración por parte del vendedor (aceptar / rechazar / contraoferta
 * / rechazo definitivo), cláusulas (porcentaje de futura venta,
 * intercambio de jugadores, cesión con opción u obligación de compra), mejora
 * de la oferta por parte del comprador y abandono de la negociación.
 *
 * El registro de negociaciones vivas también se mantiene aquí para que el
 * motor de fichajes y la simulación diaria trabajen sobre el mismo estado.
 */

import { INSULTING_OFFER_RATIO, LOAN_RULES, MARKET_TIMING, SELL_ON_RULES, WAGE_RULES } from "./constants";
import { getClubProfile } from "./ClubStrategy";
import { minimumSquadRole, preferredContractYears } from "./PlayerDecision";
import { needsToSell } from "./BudgetManager";
import { getPlayer } from "./PlayerIndex";
import {
  calculateMarketValuation,
  isInsultingOffer,
  rateOffer,
  valuePlayer,
} from "./MarketValuation";
import { clamp, seededUnit } from "./random";
import type {
  MarketValuation,
  Negotiation,
  NegotiationResponse,
  NegotiationStatus,
  OfferClauses,
  TransferOffer,
  TransferResult,
  TransferType,
} from "./types";

let offerCounter = 0;

function nextOfferId(): string {
  offerCounter += 1;
  return `offer-${Date.now().toString(36)}-${offerCounter}`;
}

/** Redondeo comercial de importes (los clubes no ofrecen 3.117.442 €). */
function roundFee(amount: number): number {
  if (amount <= 0) return 0;
  const step = amount >= 20_000_000 ? 250_000 : amount >= 2_000_000 ? 100_000 : 25_000;
  return Math.max(step, Math.round(amount / step) * step);
}

export function emptyClauses(): OfferClauses {
  return {
    sellOnPercent: 0,
    wageShare: 0,
    optionFee: 0,
    loanDurationMonths: 0,
    playerSwapIds: [],
    squadRole: "rotation",
  };
}

// ============================================================================
// CREACIÓN DE OFERTAS
// ============================================================================

export interface CreateOfferInput {
  playerId: string;
  playerName: string;
  /** Club comprador (antes `fromClubId`). */
  buyerClubId: string;
  /** Club vendedor conocido al crear la oferta (antes `toClubId`); ver nota en `TransferOffer`. */
  sellerClubId: string;
  amount: number;
  wageOffer?: number;
  type?: TransferType;
  clauses?: Partial<OfferClauses>;
  date?: string;
}

/** Crea una oferta formal por un jugador. */
export function createTransferOffer(input: CreateOfferInput): TransferOffer {
  return {
    id: nextOfferId(),
    playerId: input.playerId,
    playerName: input.playerName,
    buyerClubId: input.buyerClubId,
    sellerClubId: input.sellerClubId,
    amount: Math.max(0, Math.round(input.amount)),
    wageOffer: Math.max(
      WAGE_RULES.minimumWage,
      Math.round(input.wageOffer ?? input.amount * WAGE_RULES.valueToWage * 0.5),
    ),
    type: input.type ?? "permanent",
    clauses: {
      ...emptyClauses(),
      ...(input.clauses ?? {}),
      sellOnPercent: clamp(input.clauses?.sellOnPercent ?? 0, 0, 0.5),
      squadRole: input.clauses?.squadRole ?? (input.date ? minimumSquadRole(input.playerId, input.buyerClubId, input.date) : "rotation"),
      contractYears: input.clauses?.contractYears ?? (input.type === "permanent" || !input.type ? preferredContractYears(input.playerId) : undefined),
    },
    status: "pending",
    date: input.date ?? new Date().toISOString().slice(0, 10),
    round: 1,
  };
}

/**
 * Cláusulas que un comprador puede añadir para acercar posiciones sin subir el
 * fijo: principalmente porcentaje de futura venta según su paciencia y el hueco
 * que le queda respecto a lo que pide el vendedor.
 */
export function proposeClauses(
  buyerClubId: string,
  valuation: MarketValuation,
  gap: number,
  seed: string,
): OfferClauses {
  const profile = getClubProfile(buyerClubId);
  const clauses = emptyClauses();
  if (gap <= 0) return clauses;

  const wantsSellOn =
    seededUnit(seed, "sellon") <
    SELL_ON_RULES.openingOfferChance + profile.patience * SELL_ON_RULES.patienceOfferChance;
  if (wantsSellOn) {
    clauses.sellOnPercent = valuation.isStar
      ? SELL_ON_RULES.starPercent
      : SELL_ON_RULES.normalPercent;
  }
  return clauses;
}

/** Condiciones de una cesión según el tipo pactado. */
export function buildLoanTerms(
  playerId: string,
  type: Extract<TransferType, "loan" | "loan-option" | "loan-obligation">,
  seed: string,
): OfferClauses {
  const player = getPlayer(playerId);
  const value = player?.value ?? 0;
  const clauses = emptyClauses();
  clauses.wageShare = clamp(
    LOAN_RULES.defaultWageShare + (seededUnit(seed, "wageshare") - 0.5) * 0.3,
    0.3,
    1,
  );
  if (type !== "loan") clauses.optionFee = roundFee(value * LOAN_RULES.optionFactor);
  return clauses;
}

/**
 * Valor esperado para el vendedor de una cláusula de futura venta.
 *
 * La futura reventa es incierta, pero tampoco es cero: una cláusula del 30 %
 * puede compensar varios millones menos de fijo en una negociación.
 */
export function expectedSellOnValue(
  playerId: string,
  sellOnPercent: number,
  valuation?: MarketValuation | null,
): number {
  const percent = clamp(sellOnPercent, 0, 0.5);
  if (percent <= 0) return 0;

  const player = getPlayer(playerId);
  const baseValue = Math.max(
    player?.value ?? 0,
    valuation?.marketValue ?? 0,
    valuation?.expectedPrice ?? 0,
  );
  if (baseValue <= 0) return 0;

  return (
    baseValue *
    SELL_ON_RULES.expectedResaleValueFactor *
    SELL_ON_RULES.realizationProbability *
    percent
  );
}

/**
 * Valor real de una oferta para el vendedor: fijo, más una parte de las
 * cláusulas contingentes y de jugadores incluidos en el intercambio.
 */
export function offerWorth(
  offer: TransferOffer,
  valuation?: MarketValuation | null,
): number {
  const swapValue = offer.clauses.playerSwapIds.reduce((sum, id) => {
    const player = getPlayer(id);
    return sum + (player ? player.value * 0.8 : 0);
  }, 0);
  const sellOnValue = expectedSellOnValue(
    offer.playerId,
    offer.clauses.sellOnPercent,
    valuation,
  );
  return Math.max(0, offer.amount + swapValue + offer.clauses.optionFee + sellOnValue);
}

// ============================================================================
// RESPUESTA DEL VENDEDOR
// ============================================================================

/**
 * Calcula la contraoferta del club vendedor.
 * Cada ronda el vendedor cede un poco, pero nunca baja del mínimo.
 */
export function generateCounterOffer(
  amount: number,
  valuation: MarketValuation | null | undefined,
  round = 0,
  sellOnPercent = 0,
  maxCounterAmount?: number,
): number {
  const val = valuation ?? calculateMarketValuation({ marketValue: amount, age: 26, ovr: 75 });
  const concession = Math.min(0.25, round * 0.07);
  const targetWorth = val.idealPrice * (1 - concession);
  const futureValue = expectedSellOnValue(val.playerId, sellOnPercent, val);
  const targetFixed = Math.max(0, targetWorth - futureValue);
  const counter = Math.min(val.maximumPrice, targetFixed);
  // En una ronda posterior el club no debe empeorar su propia demanda anterior:
  // si ya había pedido 141M, no puede responder a 140M pidiendo 142M.
  const naturalMinimum = Math.max(
    amount * 1.02,
    counter,
    sellOnPercent > 0 ? amount : 0,
  );
  const capped = maxCounterAmount !== undefined
    ? Math.min(naturalMinimum, Math.max(0, maxCounterAmount))
    : naturalMinimum;
  return roundFee(capped);
}

/** Respuesta del club propietario a una oferta. */
export function processCounterOffer(
  offer: TransferOffer,
  valuation?: MarketValuation,
  maxCounterAmount?: number,
): NegotiationResponse {
  const val =
    valuation ??
    (getPlayer(offer.playerId)
      ? valuePlayer(offer.playerId, { cacheKey: offer.date })
      : calculateMarketValuation({
          playerId: offer.playerId,
          marketValue: offer.amount,
          age: 26,
          ovr: 75,
        }));

  const worth = offerWorth(offer, val);

  // La cláusula de rescisión se paga y no hay negociación posible.
  const player = getPlayer(offer.playerId);
  const clause = player?.contract.releaseClause ?? 0;
  if (clause > 0 && offer.amount >= clause) {
    return {
      status: "accepted",
      counterAmount: offer.amount,
      demands: null,
      message: "Se ha abonado la cláusula de rescisión: el club no puede negarse.",
    };
  }

  if (isInsultingOffer(worth, val)) {
    return {
      status: "final-rejection",
      counterAmount: 0,
      demands: null,
      message: "El club considera la oferta una falta de respeto y corta la negociación.",
    };
  }

  if (offer.round >= MARKET_TIMING.maxNegotiationRounds && worth < val.minimumPrice) {
    return {
      status: "final-rejection",
      counterAmount: 0,
      demands: null,
      message: "El club da por terminada la negociación.",
    };
  }

  const rating = rateOffer(worth, val);
  const sellerUrgent = player?.clubId ? needsToSell(player.clubId) : false;
  const acceptable =
    rating === "good" || rating === "excellent" || (sellerUrgent && worth >= val.minimumPrice);
  if (acceptable) {
    return {
      status: "accepted",
      counterAmount: offer.amount,
      demands: null,
      message: "El club acepta la oferta.",
    };
  }

  const gap = Math.max(0, val.idealPrice - worth);
  const sellerWantsSellOn =
    gap > 0 &&
    seededUnit(offer.id, offer.round, "seller-sellon") <
      0.18 + (val.isStar ? 0.12 : 0.04);
  const demandedSellOn = sellerWantsSellOn
    ? (val.isStar ? SELL_ON_RULES.starPercent : SELL_ON_RULES.normalPercent)
    : offer.clauses.sellOnPercent;

  const counterAmount = generateCounterOffer(
    offer.amount,
    val,
    offer.round,
    demandedSellOn,
    maxCounterAmount,
  );
  const demands: OfferClauses = {
    ...emptyClauses(),
    sellOnPercent: demandedSellOn,
    wageShare: offer.clauses.wageShare,
    optionFee: offer.clauses.optionFee,
    playerSwapIds: offer.clauses.playerSwapIds,
  };
  return {
    status: "counter",
    counterAmount,
    demands,
    message:
      `El club pide ${(counterAmount / 1_000_000).toFixed(1)}M €`
      + (demandedSellOn > 0
        ? ` y un ${Math.round(demandedSellOn * 100)}% de futura venta`
        : "")
      + " para cerrar el traspaso.",
  };
}

// ============================================================================
// MEJORA Y ABANDONO
// ============================================================================

/** Decisión del comprador tras una contraoferta. */
export interface ImprovementDecision {
  action: "improve" | "hold" | "withdraw";
  amount: number;
  clauses: OfferClauses;
  message: string;
}

/**
 * ¿Sube el comprador su oferta?
 * Depende de su paciencia (los pacientes no entran en subastas), de su
 * disposición a pagar y del techo de gasto disponible.
 */
export function decideImprovement(
  offer: TransferOffer,
  response: NegotiationResponse,
  valuation: MarketValuation,
  budgetCeiling: number,
): ImprovementDecision {
  const profile = getClubProfile(offer.buyerClubId);
  const asked = response.counterAmount;
  const demandedSellOn = Math.max(
    offer.clauses.sellOnPercent,
    response.demands?.sellOnPercent ?? 0,
  );
  const demandedFutureValue = expectedSellOnValue(
    offer.playerId,
    demandedSellOn,
    valuation,
  );
  const effectiveAskedCost = asked + demandedFutureValue;
  const ceiling = Math.min(budgetCeiling, valuation.maximumPrice * profile.buyingWillingness);

  if (effectiveAskedCost > ceiling) {
    return {
      action: "withdraw",
      amount: offer.amount,
      clauses: offer.clauses,
      message: "El club se retira: el precio pedido está fuera de su alcance.",
    };
  }

  // Con mucha paciencia, sube por pasos pequeños; con agresividad, casi iguala.
  // Si el vendedor exige una futura venta, parte de la mejora económica ya se
  // cubre con esa cláusula y no hace falta entregar todo en dinero inmediato.
  const step = clamp(0.35 + profile.aggression * 0.5 - profile.patience * 0.25, 0.2, 0.95);
  const currentEconomicCost =
    offer.amount +
    expectedSellOnValue(offer.playerId, offer.clauses.sellOnPercent, valuation);
  const targetEconomicCost = Math.min(ceiling, effectiveAskedCost);
  const economicGap = Math.max(0, targetEconomicCost - currentEconomicCost);
  const amount = roundFee(
    Math.min(
      asked,
      Math.max(offer.amount, offer.amount + economicGap * step),
    ),
  );

  if (amount <= offer.amount && demandedSellOn <= offer.clauses.sellOnPercent) {
    return {
      action: "hold",
      amount: offer.amount,
      clauses: offer.clauses,
      message: "El club mantiene su oferta y espera.",
    };
  }

  const gap = Math.max(0, asked - amount);
  const extra = proposeClauses(offer.buyerClubId, valuation, gap, `${offer.id}-r${offer.round}`);
  return {
    action: "improve",
    amount,
    clauses: {
      ...offer.clauses,
      sellOnPercent: Math.max(
        offer.clauses.sellOnPercent,
        response.demands?.sellOnPercent ?? extra.sellOnPercent,
      ),
    },
    message:
      `El club mejora su oferta hasta ${(amount / 1_000_000).toFixed(1)}M €`
      + (Math.max(
          offer.clauses.sellOnPercent,
          response.demands?.sellOnPercent ?? extra.sellOnPercent,
        ) > offer.clauses.sellOnPercent
        ? ` e incluye un ${Math.round(
            Math.max(
              offer.clauses.sellOnPercent,
              response.demands?.sellOnPercent ?? extra.sellOnPercent,
            ) * 100,
          )}% de futura venta`
        : "")
      + ".",
  };
}

/** Aplica una mejora a la oferta y avanza la ronda. */
export function applyImprovement(
  offer: TransferOffer,
  decision: ImprovementDecision,
): TransferOffer {
  offer.amount = decision.amount;
  offer.clauses = decision.clauses;
  offer.status = "pending";
  offer.round += 1;
  return offer;
}

/** Marca una oferta como aceptada. */
export function acceptOffer(offer: TransferOffer): TransferResult {
  offer.status = "accepted";
  return { success: true, message: `Acuerdo alcanzado por ${offer.playerName}.` };
}

/** Marca una oferta como rechazada y avanza la ronda. */
export function rejectOffer(offer: TransferOffer, final = false): TransferResult {
  offer.status = final ? "final-rejection" : "rejected";
  offer.round += 1;
  return {
    success: false,
    message: final
      ? `El club cierra la puerta a la venta de ${offer.playerName}.`
      : `Oferta por ${offer.playerName} rechazada.`,
  };
}

/** El comprador abandona la operación. */
export function withdrawOffer(offer: TransferOffer): TransferResult {
  offer.status = "withdrawn";
  closeNegotiation(offer.id);
  return { success: false, message: `El club retira su oferta por ${offer.playerName}.` };
}

// ============================================================================
// NEGOCIACIONES VIVAS
// ============================================================================

const negotiations = new Map<string, Negotiation>();

/** Registra una negociación abierta. */
export function openNegotiation(
  offer: TransferOffer,
  valuation: MarketValuation,
  date: string,
): Negotiation {
  const negotiation: Negotiation = { offer, valuation, lastUpdate: date, rounds: offer.round };
  negotiations.set(offer.id, negotiation);
  return negotiation;
}

/** Negociación por id de oferta. */
export function getNegotiation(offerId: string): Negotiation | undefined {
  return negotiations.get(offerId);
}

/** Negociaciones vivas, opcionalmente filtradas por club comprador. */
export function listNegotiations(clubId?: string): Negotiation[] {
  const all = Array.from(negotiations.values());
  return clubId ? all.filter((n) => n.offer.buyerClubId === clubId) : all;
}

/** Negociaciones vivas por jugador. */
export function negotiationsForPlayer(playerId: string): Negotiation[] {
  return listNegotiations().filter((n) => n.offer.playerId === playerId);
}

/** Cierra una negociación. */
export function closeNegotiation(offerId: string): void {
  negotiations.delete(offerId);
}

/** Estados que dan por terminada una negociación. */
const CLOSED_STATUSES: readonly NegotiationStatus[] = [
  "accepted",
  "final-rejection",
  "withdrawn",
  "expired",
];

/** ¿Ha terminado esta negociación? */
export function isClosed(status: NegotiationStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Caduca las negociaciones que llevan demasiados días paradas. */
export function expireStaleNegotiations(date: string): Negotiation[] {
  const expired: Negotiation[] = [];
  for (const negotiation of Array.from(negotiations.values())) {
    if (daysBetween(negotiation.lastUpdate, date) >= MARKET_TIMING.negotiationExpiryDays) {
      negotiation.offer.status = "expired";
      expired.push(negotiation);
      negotiations.delete(negotiation.offer.id);
    }
  }
  return expired;
}

/** Reinicia el registro de negociaciones (al cargar otra partida). */
export function resetNegotiations(): void {
  negotiations.clear();
  offerCounter = 0;
}

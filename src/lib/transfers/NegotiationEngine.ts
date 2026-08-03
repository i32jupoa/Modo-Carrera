/**
 * Motor de negociación: creación de ofertas, respuesta del club vendedor
 * y contraofertas por rondas.
 */

import { MARKET_TIMING, WAGE_RULES } from "./constants";
import { calculateMarketValuation, isInsultingOffer, rateOffer } from "./MarketValuation";
import type {
  MarketValuation,
  NegotiationResponse,
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

export function emptyClauses(): OfferClauses {
  return { sellOnPercent: 0, addOns: 0, wageShare: 0, optionFee: 0, playerSwapIds: [] };
}

export interface CreateOfferInput {
  playerId: string;
  playerName: string;
  fromClubId: string;
  toClubId: string;
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
    fromClubId: input.fromClubId,
    toClubId: input.toClubId,
    amount: Math.max(0, Math.round(input.amount)),
    wageOffer: Math.max(
      WAGE_RULES.minimumWage,
      Math.round(input.wageOffer ?? input.amount * WAGE_RULES.valueToWage * 0.5),
    ),
    type: input.type ?? "permanent",
    clauses: { ...emptyClauses(), ...(input.clauses ?? {}) },
    status: "pending",
    date: input.date ?? new Date().toISOString().slice(0, 10),
    round: 1,
  };
}

/**
 * Calcula la contraoferta del club vendedor.
 * Cada ronda el vendedor cede un poco, pero nunca baja del mínimo.
 */
export function generateCounterOffer(
  amount: number,
  valuation: MarketValuation | null | undefined,
  round = 0,
): number {
  const val =
    valuation ?? calculateMarketValuation({ marketValue: amount, age: 26, ovr: 75 });
  const concession = Math.min(0.25, round * 0.07);
  const target = val.idealPrice * (1 - concession);
  const counter = Math.max(val.minimumPrice, Math.min(val.maximumPrice, target));
  // Nunca pedir menos de lo ya ofrecido.
  return Math.round(Math.max(counter, amount * 1.02) / 50_000) * 50_000;
}

/** Respuesta del club propietario a una oferta. */
export function processCounterOffer(
  offer: TransferOffer,
  valuation?: MarketValuation,
): NegotiationResponse {
  const val =
    valuation ??
    calculateMarketValuation({ playerId: offer.playerId, marketValue: offer.amount, age: 26, ovr: 75 });

  if (isInsultingOffer(offer.amount, val)) {
    return {
      status: "final-rejection",
      counterAmount: 0,
      demands: null,
      message: "El club considera la oferta una falta de respeto y corta la negociación.",
    };
  }

  if (offer.round >= MARKET_TIMING.maxNegotiationRounds && offer.amount < val.minimumPrice) {
    return {
      status: "final-rejection",
      counterAmount: 0,
      demands: null,
      message: "El club da por terminada la negociación.",
    };
  }

  const rating = rateOffer(offer.amount, val);
  if (rating === "good" || rating === "excellent") {
    return {
      status: "accepted",
      counterAmount: offer.amount,
      demands: null,
      message: "El club acepta la oferta.",
    };
  }

  const counterAmount = generateCounterOffer(offer.amount, val, offer.round);
  return {
    status: "counter",
    counterAmount,
    demands: {
      ...emptyClauses(),
      sellOnPercent: val.isStar ? 0.1 : 0,
    },
    message: `El club pide ${Math.round(counterAmount / 1_000_000)}M € para cerrar el traspaso.`,
  };
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

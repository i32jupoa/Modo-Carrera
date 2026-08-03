/**
 * Valoración de mercado: convierte el valor teórico de un jugador en
 * escalones de precio reales (mínimo, esperado, ideal, techo).
 *
 * El precio nunca es el valor de mercado: depende de la edad, el potencial,
 * el estatus de estrella, el tiempo de contrato restante y —sobre todo— de
 * cuántos clubes compiten por el jugador.
 */

import {
  PRICE_MULTIPLIERS,
  STAR_THRESHOLD,
  WORLD_CLASS_THRESHOLD,
  INSULTING_OFFER_RATIO,
  SQUAD_LIMITS,
} from "./constants";
import type { MarketValuation } from "./types";

export interface ValuationContext {
  playerId?: string;
  /** Valor de mercado base en euros. */
  marketValue: number;
  age: number;
  ovr: number;
  pot?: number;
  /** Clubes que compiten por el jugador (sin contar al comprador). */
  competition?: number;
  /** Años de contrato restantes. */
  contractYearsLeft?: number;
  /** El club lo considera intransferible. */
  keyPlayer?: boolean;
  /** El club lo ha puesto en la lista de transferibles. */
  transferListed?: boolean;
  /** El vendedor necesita hacer caja. */
  needsToSell?: boolean;
  /** Estamos en los últimos días de la ventana. */
  deadlineDay?: boolean;
}

/** Ajuste por edad: los jóvenes con recorrido cuestan más de lo que valen. */
function ageFactor(age: number, ovr: number, pot: number): number {
  const upside = Math.max(0, pot - ovr);
  if (age <= 20) return 1.25 + upside * 0.02;
  if (age <= SQUAD_LIMITS.youngAge) return 1.15 + upside * 0.015;
  if (age <= 26) return 1.05 + upside * 0.01;
  if (age <= 29) return 1;
  if (age <= SQUAD_LIMITS.veteranAge) return 0.9;
  if (age <= 34) return 0.75;
  return 0.6;
}

/** Ajuste por años de contrato restantes. */
function contractFactor(yearsLeft: number): number {
  if (yearsLeft <= 0) return 0.15;
  if (yearsLeft <= 1) return PRICE_MULTIPLIERS.lastYearDiscount;
  if (yearsLeft <= 2) return 0.9;
  if (yearsLeft >= 4) return 1.12;
  return 1;
}

/**
 * Calcula los escalones de precio de un jugador.
 *
 * Acepta tanto un objeto de contexto como la firma posicional histórica
 * `(marketValue, age, ovr, pot, isStar, competition)` usada por la UI.
 */
export function calculateMarketValuation(
  input: ValuationContext | number,
  age?: number,
  ovr?: number,
  pot?: number,
  _isStar?: boolean,
  competition?: number,
): MarketValuation {
  const ctx: ValuationContext =
    typeof input === "number"
      ? {
          marketValue: input,
          age: age ?? 26,
          ovr: ovr ?? 70,
          pot: pot ?? ovr ?? 70,
          competition: competition ?? 0,
        }
      : input;

  const marketValue = Math.max(50_000, Math.round(ctx.marketValue || 0));
  const playerOvr = ctx.ovr || 70;
  const playerPot = Math.max(ctx.pot ?? playerOvr, playerOvr);
  const rivals = Math.max(0, ctx.competition ?? 0);
  const yearsLeft = ctx.contractYearsLeft ?? 3;

  const isStar = playerOvr >= STAR_THRESHOLD;
  const isWorldClass = playerOvr >= WORLD_CLASS_THRESHOLD;

  let factor = ageFactor(ctx.age ?? 26, playerOvr, playerPot);
  factor *= contractFactor(yearsLeft);
  factor *= 1 + Math.min(rivals, 6) * PRICE_MULTIPLIERS.perCompetitor;

  if (isStar) factor *= 1 + PRICE_MULTIPLIERS.starPremium;
  else if (isWorldClass) factor *= 1 + PRICE_MULTIPLIERS.starPremium * 0.4;

  if (ctx.keyPlayer) factor *= 1 + PRICE_MULTIPLIERS.keyPlayerPremium;
  if (ctx.transferListed) factor *= 0.85;
  if (ctx.needsToSell) factor *= 0.9;
  if (ctx.deadlineDay && (ctx.needsToSell || ctx.transferListed)) {
    factor *= PRICE_MULTIPLIERS.deadlineDiscount;
  }

  const base = marketValue * factor;
  const round = (n: number) => Math.max(50_000, Math.round(n / 50_000) * 50_000);

  const minimumPrice = round(base * PRICE_MULTIPLIERS.minimum);
  const expectedPrice = round(base * PRICE_MULTIPLIERS.expected);
  const idealPrice = round(base * PRICE_MULTIPLIERS.ideal);
  const maximumPrice = round(base * PRICE_MULTIPLIERS.maximum);

  return {
    playerId: ctx.playerId ?? "",
    marketValue,
    minimumPrice,
    expectedPrice,
    idealPrice,
    maximumPrice,
    listPrice: ctx.transferListed ? minimumPrice : expectedPrice,
    isStar,
    competition: rivals,
  };
}

/** ¿La oferta es tan baja que ofende al club vendedor? */
export function isInsultingOffer(amount: number, valuation: MarketValuation): boolean {
  return amount < valuation.minimumPrice * INSULTING_OFFER_RATIO;
}

/** Clasifica una oferta respecto a los escalones de precio. */
export function rateOffer(
  amount: number,
  valuation: MarketValuation,
): "insulting" | "low" | "acceptable" | "good" | "excellent" {
  if (isInsultingOffer(amount, valuation)) return "insulting";
  if (amount < valuation.minimumPrice) return "low";
  if (amount < valuation.expectedPrice) return "acceptable";
  if (amount < valuation.idealPrice) return "good";
  return "excellent";
}

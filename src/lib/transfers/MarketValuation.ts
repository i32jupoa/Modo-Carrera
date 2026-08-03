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
import { getClubProfile } from "./ClubStrategy";
import { needsToSell } from "./BudgetManager";
import { getPlayer } from "./PlayerIndex";
import { getSquadReport } from "./SquadAnalyzer";
import { clamp } from "./random";


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

// ============================================================================
// VALORACIÓN CONECTADA AL ÍNDICE REAL
// ============================================================================


export interface PlayerValuationOptions {
  /** Clubes interesados además del comprador. */
  competition?: number;
  /** Últimos días de la ventana. */
  deadlineDay?: boolean;
  /** Clave de caché de informes de plantilla (normalmente la fecha). */
  cacheKey?: string;
}

/**
 * ¿Es un jugador clave para su club?
 * Lo es si está claramente por encima de la media del once o si es de los
 * mejores de su demarcación en una posición sin recambio.
 */
export function isKeyPlayer(playerId: string, cacheKey = "static"): boolean {
  const player = getPlayer(playerId);
  if (!player || !player.clubId) return false;
  if (player.transferListed) return false;
  const report = getSquadReport(player.clubId, cacheKey);
  const aboveSquad = player.ovr >= report.startingRating + 1;
  const scarce = report.countByGroup[player.group] <= 2;
  return aboveSquad || (scarce && player.ovr >= report.startingRating - 1);
}

/**
 * Valoración completa de un jugador real del índice: usa su contrato, su
 * estatus en la plantilla, la dureza negociadora de su club y la situación
 * económica del vendedor. La cláusula de rescisión, si existe, marca el techo.
 */
export function valuePlayer(playerId: string, options: PlayerValuationOptions = {}): MarketValuation {
  const player = getPlayer(playerId);
  if (!player) {
    return calculateMarketValuation({ playerId, marketValue: 0, age: 26, ovr: 70 });
  }

  const cacheKey = options.cacheKey ?? "static";
  const keyPlayer = isKeyPlayer(playerId, cacheKey);
  const sellerNeedsCash = player.clubId ? needsToSell(player.clubId) : false;

  const valuation = calculateMarketValuation({
    playerId: player.id,
    marketValue: player.value,
    age: player.age,
    ovr: player.ovr,
    pot: player.potential,
    competition: options.competition ?? 0,
    contractYearsLeft: player.contract.yearsLeft,
    keyPlayer,
    transferListed: player.transferListed,
    needsToSell: sellerNeedsCash,
    deadlineDay: options.deadlineDay,
  });

  // Dureza negociadora del club vendedor.
  const toughness = player.clubId
    ? clamp(getClubProfile(player.clubId).sellingToughness, 0.7, 1.6)
    : 0.8;
  const scale = (n: number) => Math.max(50_000, Math.round((n * toughness) / 50_000) * 50_000);

  const scaled: MarketValuation = {
    ...valuation,
    minimumPrice: scale(valuation.minimumPrice),
    expectedPrice: scale(valuation.expectedPrice),
    idealPrice: scale(valuation.idealPrice),
    maximumPrice: scale(valuation.maximumPrice),
    listPrice: scale(valuation.listPrice),
  };

  // La cláusula de rescisión siempre cierra el trato.
  const clause = player.contract.releaseClause;
  if (clause > 0 && scaled.maximumPrice > clause) {
    // Se comprimen todos los escalones de forma proporcional para que el techo
    // sea la cláusula sin aplanar la horquilla de negociación.
    const ratio = clause / scaled.maximumPrice;
    const squeeze = (n: number) => Math.max(50_000, Math.round((n * ratio) / 50_000) * 50_000);
    scaled.minimumPrice = squeeze(scaled.minimumPrice);
    scaled.expectedPrice = squeeze(scaled.expectedPrice);
    scaled.idealPrice = squeeze(scaled.idealPrice);
    scaled.listPrice = squeeze(scaled.listPrice);
    scaled.maximumPrice = clause;
  }

  // Agente libre: sin traspaso.
  if (!player.clubId) {
    scaled.minimumPrice = 0;
    scaled.expectedPrice = 0;
    scaled.idealPrice = 0;
    scaled.maximumPrice = 0;
    scaled.listPrice = 0;
  }

  return scaled;
}

/** Precio de salida publicado para un jugador del índice. */
export function askingPrice(playerId: string, options: PlayerValuationOptions = {}): number {
  return valuePlayer(playerId, options).listPrice;
}

/** ¿Está el jugador disponible en el mercado a algún precio? */
export function isAvailable(playerId: string, cacheKey = "static"): boolean {
  const player = getPlayer(playerId);
  if (!player) return false;
  if (!player.clubId) return true;
  if (player.transferListed) return true;
  if (player.contract.yearsLeft <= 1) return true;
  return !isKeyPlayer(playerId, cacheKey);
}

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
import { isPlayerSettled } from "./MarketLocks";
import { getSquadReport } from "./SquadAnalyzer";
import { clamp } from "./random";
import { GLOBAL_MAX_VALUE_M } from "@/data/players";


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

/**
 * Presión de negociación: en vez de encadenar multiplicadores (edad × contrato
 * × competencia × estrella × dureza del club...) —que en la práctica podían
 * multiplicarse entre sí hasta cuadruplicar el valor mostrado en la interfaz—
 * cada factor aporta una puntuación acotada a una "intensidad" de 0 a 1. Esa
 * intensidad decide en qué punto de una horquilla FIJA (anclada siempre al
 * valor de mercado que ve el usuario) cae cada escalón de precio. Así el
 * precio de negociación nunca se dispara muy por encima del valor mostrado en
 * el buscador, por muchos factores que se acumulen a la vez.
 */
function negotiationIntensity(ctx: ValuationContext, isStar: boolean, isWorldClass: boolean): number {
  let score = 0;

  // Proyección/edad: los jóvenes con recorrido tensan algo la negociación,
  // pero de forma mucho más suave que antes (el valor base ya incorpora una
  // buena parte de la prima de juventud).
  const upside = Math.max(0, (ctx.pot ?? ctx.ovr) - ctx.ovr);
  if (ctx.age <= SQUAD_LIMITS.youngAge) score += 0.12 + Math.min(upside, 12) * 0.01;
  else if (ctx.age <= 26) score += 0.05;

  // Contrato: cuanto más le queda, más fuerte negocia el vendedor.
  const yearsLeft = ctx.contractYearsLeft ?? 3;
  if (yearsLeft >= 4) score += 0.18;
  else if (yearsLeft >= 3) score += 0.08;

  // Competencia entre clubes: cada rival adicional presiona el precio al
  // alza, con rendimientos decrecientes.
  const rivals = Math.max(0, ctx.competition ?? 0);
  score += Math.min(rivals, 6) * 0.07;

  // Estatus del jugador.
  if (isStar) score += 0.22;
  else if (isWorldClass) score += 0.1;

  if (ctx.keyPlayer) score += 0.15;

  return clamp(score, 0, 1);
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
  const rivals = Math.max(0, ctx.competition ?? 0);
  const yearsLeft = ctx.contractYearsLeft ?? 3;

  const isStar = playerOvr >= STAR_THRESHOLD;
  const isWorldClass = playerOvr >= WORLD_CLASS_THRESHOLD;

  const intensity = negotiationIntensity(ctx, isStar, isWorldClass);

  // Horquilla FIJA sobre el valor de mercado, deliberadamente estrecha: el
  // objetivo es que el precio de negociación nunca se aleje demasiado del
  // "Valor de mercado" que el usuario ve en el buscador. Ni en el escenario
  // más extremo (jugador estrella, varios clubes pujando, contrato largo)
  // el techo debe acercarse al doble del valor mostrado.
  let minimumMult = 0.9 + intensity * 0.1; // 0.90x – 1.00x
  let expectedMult = 1.0 + intensity * 0.12; // 1.00x – 1.12x
  let idealMult = 1.08 + intensity * 0.17; // 1.08x – 1.25x
  let maximumMult = 1.15 + intensity * 0.25; // 1.15x – 1.40x

  // Descuentos que sí deben notarse: contrato a punto de expirar, jugador
  // transferible o club que necesita liquidez. Se aplican sobre la propia
  // horquilla (no sobre un factor compuesto aparte) para que el resultado
  // siga siendo predecible y nunca negativo.
  let discount = 1;
  if (yearsLeft <= 0) discount *= 0.3;
  else if (yearsLeft <= 1) discount *= PRICE_MULTIPLIERS.lastYearDiscount;
  else if (yearsLeft <= 2) discount *= 0.92;

  if (ctx.transferListed) discount *= 0.85;
  if (ctx.needsToSell) discount *= 0.9;
  if (ctx.deadlineDay && (ctx.needsToSell || ctx.transferListed)) {
    discount *= PRICE_MULTIPLIERS.deadlineDiscount;
  }
  discount = clamp(discount, 0.22, 1);

  minimumMult *= discount;
  expectedMult *= discount;
  idealMult *= discount;
  maximumMult *= discount;

  const round = (n: number) => Math.max(50_000, Math.round(n / 50_000) * 50_000);
  // Techo absoluto en euros: ni el jugador más codiciado del juego puede
  // pedirse por encima del fichaje más caro de la historia real.
  const hardCeiling = GLOBAL_MAX_VALUE_M * 1_000_000;

  const minimumPrice = Math.min(round(marketValue * minimumMult), hardCeiling);
  const expectedPrice = Math.min(round(marketValue * expectedMult), hardCeiling);
  const idealPrice = Math.min(round(marketValue * idealMult), hardCeiling);
  const maximumPrice = Math.min(round(marketValue * maximumMult), hardCeiling);

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

  // Dureza negociadora del club vendedor: mueve el precio dentro de la
  // horquilla, no la multiplica sin límite. Se comprime mucho la desviación
  // respecto a 1 para que un club "duro" presione el precio al alza sin
  // que la interfaz muestre un salto brusco respecto al valor de mercado.
  const rawToughness = player.clubId ? getClubProfile(player.clubId).sellingToughness : 0.9;
  const toughness = clamp(1 + (clamp(rawToughness, 0.7, 1.6) - 1) * 0.15, 0.95, 1.09);
  const hardCeiling = GLOBAL_MAX_VALUE_M * 1_000_000;
  const scale = (n: number) => Math.min(Math.max(50_000, Math.round((n * toughness) / 50_000) * 50_000), hardCeiling);

  const scaled: MarketValuation = {
    ...valuation,
    minimumPrice: scale(valuation.minimumPrice),
    expectedPrice: scale(valuation.expectedPrice),
    idealPrice: scale(valuation.idealPrice),
    // Techo absoluto: como mucho 1.5x el valor de mercado mostrado (y nunca
    // por encima del techo global del juego), pase lo que pase con la
    // competencia, la dureza del club o el estatus del jugador.
    maximumPrice: Math.min(scale(valuation.maximumPrice), Math.round(player.value * 1.5), hardCeiling),
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
  // Recién fichado en esta misma ventana: acaba de firmar contrato y no se
  // vuelve a mover hasta el siguiente mercado.
  if (isPlayerSettled(playerId)) return false;
  if (!player.clubId) return true;
  if (player.transferListed) return true;
  if (player.contract.yearsLeft <= 1) return true;
  return !isKeyPlayer(playerId, cacheKey);
}

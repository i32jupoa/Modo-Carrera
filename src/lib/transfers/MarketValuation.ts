/**
 * MarketValuation - Valoración real de mercado
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { MarketValuation } from './types';
import { 
  VALUATION_RANGES,
  COMPETITION_MULTIPLIERS,
  STAR_PLAYER_MULTIPLIERS,
  AGE_DISCOUNT,
  POTENTIAL_PREMIUM,
} from './constants';

// ============================================================================
// CACHE DE VALORACIONES
// ============================================================================

const valuationCache = new Map<string, MarketValuation>();
const CACHE_DURATION_MS = 60000; // 1 minuto

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Calcula la valoración de mercado de un jugador
 * @param baseValue - Valor base del jugador
 * @param age - Edad del jugador
 * @param rating - Valoración del jugador
 * @param potential - Potencial del jugador (opcional)
 * @param isStar - Si es una estrella (88+)
 * @param competitionLevel - Nivel de competencia (0-3)
 * @returns Valoración de mercado
 */
export function calculateMarketValuation(
  baseValue: number,
  age: number,
  rating: number,
  potential: number = rating,
  isStar: boolean = false,
  competitionLevel: number = 0
): MarketValuation {
  const cacheKey = `${baseValue}-${age}-${rating}-${potential}-${isStar}-${competitionLevel}`;
  
  // Verificar caché
  const cached = valuationCache.get(cacheKey);
  if (cached && Date.now() - (cached as any).cacheTime < CACHE_DURATION_MS) {
    return cached;
  }
  
  // Calcular valor base ajustado
  let adjustedBase = baseValue;
  
  // Aplicar descuento por edad
  if (age >= 30) {
    if (age >= 36) {
      adjustedBase *= AGE_DISCOUNT.age_36_plus;
    } else if (age >= 33) {
      adjustedBase *= AGE_DISCOUNT.age_33_35;
    } else {
      adjustedBase *= AGE_DISCOUNT.age_30_32;
    }
  }
  
  // Aplicar prima por potencial para jóvenes
  if (age <= 22 && potential > rating) {
    if (potential >= 88) {
      adjustedBase *= POTENTIAL_PREMIUM.very_high_potential;
    } else if (potential >= 85) {
      adjustedBase *= POTENTIAL_PREMIUM.high_potential;
    }
  }
  
  // Aplicar multiplicador por competencia
  let competitionMultiplier: number;
  switch (competitionLevel) {
    case 0:
      competitionMultiplier = COMPETITION_MULTIPLIERS.no_competition;
      break;
    case 1:
      competitionMultiplier = COMPETITION_MULTIPLIERS.one_bidder;
      break;
    case 2:
      competitionMultiplier = COMPETITION_MULTIPLIERS.two_bidders;
      break;
    case 3:
      competitionMultiplier = COMPETITION_MULTIPLIERS.three_bidders;
      break;
    default:
      competitionMultiplier = COMPETITION_MULTIPLIERS.bidding_war;
  }
  
  // Aplicar multiplicador para estrellas
  let starMultiplier = 1;
  if (isStar) {
    starMultiplier = STAR_PLAYER_MULTIPLIERS.base;
  }
  
  // Calcular rangos
  const minAcceptable = Math.round(adjustedBase * VALUATION_RANGES.minAcceptable);
  const expectedValue = Math.round(adjustedBase * VALUATION_RANGES.expected);
  const idealValue = Math.round(adjustedBase * VALUATION_RANGES.ideal);
  const maxValue = Math.round(adjustedBase * VALUATION_RANGES.max);
  
  // Aplicar multiplicadores
  const finalMin = Math.round(minAcceptable * competitionMultiplier * starMultiplier);
  const finalExpected = Math.round(expectedValue * competitionMultiplier * starMultiplier);
  const finalIdeal = Math.round(idealValue * competitionMultiplier * starMultiplier);
  const finalMax = Math.round(maxValue * competitionMultiplier * starMultiplier);
  
  const valuation: MarketValuation = {
    baseValue: adjustedBase,
    minAcceptable: finalMin,
    expectedValue: finalExpected,
    idealValue: finalIdeal,
    maxValue: finalMax,
    competitionMultiplier,
  };
  
  // Guardar en caché
  (valuation as any).cacheTime = Date.now();
  valuationCache.set(cacheKey, valuation);
  
  return valuation;
}

/**
 * Calcula el valor base de un jugador según sus atributos
 * @param rating - Valoración del jugador
 * @param age - Edad del jugador
 * @param potential - Potencial del jugador
 * @returns Valor base en euros
 */
export function calculateBaseValue(rating: number, age: number, potential: number = rating): number {
  // Fórmula exponencial para valoración
  const ratingFactor = Math.pow(rating / 70, 4);
  const base = ratingFactor * 5_000_000; // 5M base para 70 OVR
  
  // Ajustar por potencial
  if (potential > rating && age <= 22) {
    const potentialBonus = (potential - rating) * 2_000_000;
    return base + potentialBonus;
  }
  
  return base;
}

/**
 * Determina si un jugador es una estrella
 * @param rating - Valoración del jugador
 * @returns Si es estrella
 */
export function isStarPlayer(rating: number): boolean {
  return rating >= 88;
}

/**
 * Calcula el nivel de competencia por un jugador
 * @param interestedClubs - Número de clubes interesados
 * @param isStar - Si es estrella
 * @returns Nivel de competencia (0-4)
 */
export function calculateCompetitionLevel(
  interestedClubs: number,
  isStar: boolean
): number {
  if (interestedClubs === 0) return 0;
  if (interestedClubs === 1) return 1;
  if (interestedClubs === 2) return 2;
  if (interestedClubs >= 3 && interestedClubs < 5) return 3;
  return 4; // Bidding war
}

/**
 * Ajusta la valoración para un comprador específico
 * @param valuation - Valoración base
 * @param buyerReputation - Reputación del comprador (0-100)
 * @param sellerReputation - Reputación del vendedor (0-100)
 * @returns Valoración ajustada
 */
export function adjustValuationForBuyer(
  valuation: MarketValuation,
  buyerReputation: number,
  sellerReputation: number
): MarketValuation {
  const reputationDiff = buyerReputation - sellerReputation;
  let multiplier = 1;
  
  // Clubes grandes pagan más
  if (reputationDiff > 20) {
    multiplier = 1.15;
  } else if (reputationDiff > 10) {
    multiplier = 1.08;
  } else if (reputationDiff < -20) {
    multiplier = 0.9;
  }
  
  return {
    ...valuation,
    minAcceptable: Math.round(valuation.minAcceptable * multiplier),
    expectedValue: Math.round(valuation.expectedValue * multiplier),
    idealValue: Math.round(valuation.idealValue * multiplier),
    maxValue: Math.round(valuation.maxValue * multiplier),
  };
}

/**
 * Calcula el precio de venta para un jugador en lista de transferencia
 * @param valuation - Valoración de mercado
 * @param urgency - Urgencia de venta (0-100)
 * @returns Precio de venta
 */
export function calculateListPrice(
  valuation: MarketValuation,
  urgency: number
): number {
  let price = valuation.expectedValue;
  
  // Si hay urgencia, reducir precio
  if (urgency > 70) {
    price = valuation.minAcceptable;
  } else if (urgency > 50) {
    price = Math.round((valuation.minAcceptable + valuation.expectedValue) / 2);
  } else if (urgency < 30) {
    // Sin urgencia, pedir más
    price = valuation.idealValue;
  }
  
  return price;
}

/**
 * Determina si una oferta es aceptable
 * @param offer - Oferta recibida
 * @param valuation - Valoración de mercado
 * @param sellerPatience - Paciencia del vendedor (0-100)
 * @returns Si la oferta es aceptable
 */
export function isOfferAcceptable(
  offer: number,
  valuation: MarketValuation,
  sellerPatience: number
): boolean {
  // Si la oferta supera el máximo, siempre aceptar
  if (offer >= valuation.maxValue) {
    return true;
  }
  
  // Si la oferta está por debajo del mínimo, rechazar
  if (offer < valuation.minAcceptable) {
    return false;
  }
  
  // Según paciencia del vendedor
  if (sellerPatience > 70) {
    // Paciente: espera al menos el valor esperado
    return offer >= valuation.expectedValue;
  } else if (sellerPatience > 40) {
    // Normal: acepta entre mínimo y esperado
    return offer >= (valuation.minAcceptable + valuation.expectedValue) / 2;
  } else {
    // Impaciente: acepta cerca del mínimo
    return offer >= valuation.minAcceptable;
  }
}

/**
 * Genera una contraoferta
 * @param offer - Oferta recibida
 * @param valuation - Valoración de mercado
 * @param maxCounters - Número máximo de contraofertas realizadas
 * @returns Contraoferta o null
 */
export function generateCounterOffer(
  offer: number,
  valuation: MarketValuation,
  maxCounters: number
): number | null {
  // Si ya hay muchas contraofertas, no contraofertar más
  if (maxCounters >= 3) {
    return null;
  }
  
  // Si la oferta es muy baja, no contraofertar
  if (offer < valuation.minAcceptable * 0.8) {
    return null;
  }
  
  // Si la oferta ya está cerca del ideal, aceptar
  if (offer >= valuation.idealValue * 0.9) {
    return null;
  }
  
  // Generar contraoferta entre el valor actual y el ideal
  const increment = (valuation.idealValue - offer) * 0.5;
  const counterOffer = Math.round(offer + increment);
  
  // Asegurar que no exceda el máximo
  return Math.min(counterOffer, valuation.maxValue);
}

/**
 * Calcula la depreciación de un jugador por edad
 * @param currentAge - Edad actual
 * @param rating - Valoración actual
 * @returns Porcentaje de depreciación (0-1)
 */
export function calculateAgeDepreciation(currentAge: number, rating: number): number {
  if (currentAge < 28) return 0;
  
  // Las estrellas deprecian más lento
  const starFactor = rating >= 85 ? 0.7 : 1;
  
  const yearsPastPeak = currentAge - 28;
  const depreciation = Math.min(0.8, yearsPastPeak * 0.1 * starFactor);
  
  return depreciation;
}

/**
 * Proyecta el valor futuro de un jugador
 * @param currentValue - Valor actual
 * @param currentAge - Edad actual
 * @param potential - Potencial máximo
 * @param yearsAhead - Años a proyectar
 * @returns Valor proyectado
 */
export function projectFutureValue(
  currentValue: number,
  currentAge: number,
  potential: number,
  yearsAhead: number
): number {
  const futureAge = currentAge + yearsAhead;
  
  // Si el jugador está en edad de mejora
  if (currentAge <= 24 && futureAge <= 26) {
    // Mejora esperada
    const improvement = Math.min(potential - currentAge, yearsAhead * 2);
    const ratingIncrease = improvement / 10; // Asumiendo 10 OVR = 2x valor
    return currentValue * (1 + ratingIncrease);
  }
  
  // Si el jugador está en edad pico
  if (currentAge >= 25 && currentAge <= 29 && futureAge <= 31) {
    // Valor estable
    return currentValue;
  }
  
  // Si el jugador está en declive
  if (futureAge > 31) {
    const depreciation = calculateAgeDepreciation(futureAge, currentAge);
    return currentValue * (1 - depreciation);
  }
  
  return currentValue;
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Limpia la caché de valoraciones
 */
export function clearValuationCache(): void {
  valuationCache.clear();
}

/**
 * Obtiene una valoración de la caché
 * @param cacheKey - Clave de caché
 * @returns Valoración o null
 */
export function getCachedValuation(cacheKey: string): MarketValuation | null {
  return valuationCache.get(cacheKey) || null;
}

/**
 * Formatea un valor de mercado para mostrar
 * @param value - Valor en euros
 * @returns Valor formateado
 */
export function formatMarketValue(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B€`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M€`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K€`;
  }
  return `${value}€`;
}

/**
 * Compara dos valoraciones
 * @param valuation1 - Primera valoración
 * @param valuation2 - Segunda valoración
 * @returns Diferencia porcentual
 */
export function compareValuations(
  valuation1: MarketValuation,
  valuation2: MarketValuation
): number {
  const diff = valuation1.expectedValue - valuation2.expectedValue;
  const avg = (valuation1.expectedValue + valuation2.expectedValue) / 2;
  return (diff / avg) * 100;
}

/**
 * Determina si un jugador está sobrevalorado
 * @param currentValue - Valor actual
 * @param calculatedValue - Valor calculado
 * @param threshold - Umbral de sobrevaloración (porcentaje)
 * @returns Si está sobrevalorado
 */
export function isOvervalued(
  currentValue: number,
  calculatedValue: number,
  threshold: number = 20
): boolean {
  const diff = ((currentValue - calculatedValue) / calculatedValue) * 100;
  return diff > threshold;
}

/**
 * Determina si un jugador está infravalorado
 * @param currentValue - Valor actual
 * @param calculatedValue - Valor calculado
 * @param threshold - Umbral de infravaloración (porcentaje)
 * @returns Si está infravalorado
 */
export function isUndervalued(
  currentValue: number,
  calculatedValue: number,
  threshold: number = 20
): boolean {
  const diff = ((calculatedValue - currentValue) / calculatedValue) * 100;
  return diff > threshold;
}

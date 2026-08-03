/**
 * NegotiationEngine - Sistema de negociaciones
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { 
  TransferOffer, 
  OfferStatus, 
  OfferType,
  OfferEvaluation,
  TransferResult,
  LoanDetails,
} from './types';
import { 
  OFFER_EXPIRY_DAYS,
  MAX_COUNTER_OFFERS,
  COUNTER_OFFER_INCREMENT_MIN,
  COUNTER_OFFER_INCREMENT_MAX,
  COUNTER_OFFER_PROBABILITY,
  OFFER_RESPONSE_DAYS,
} from './constants';
import { getClubStrategy, willAcceptCounterOffer } from './ClubStrategy';
import { calculateMarketValuation, isOfferAcceptable, generateCounterOffer as generateMarketCounter } from './MarketValuation';
import { generatePlayerPersonality, decideOnTransferOffer } from './PlayerDecision';
import { teamById } from '@/data/teams';

// ============================================================================
// ESTADO DE NEGOCIACIONES
// ============================================================================

const activeNegotiations = new Map<string, TransferOffer[]>();

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Crea una nueva oferta de transferencia
 * @param fromClubId - ID del club oferente
 * @param toClubId - ID del club vendedor
 * @param playerId - ID del jugador
 * @param amount - Cantidad ofrecida
 * @param offerType - Tipo de oferta
 * @param loanDetails - Detalles de cesión (opcional)
 * @returns Oferta creada
 */
export function createTransferOffer(
  fromClubId: string,
  toClubId: string,
  playerId: string,
  amount: number,
  offerType: OfferType = 'permanent',
  loanDetails?: LoanDetails
): TransferOffer {
  const offer: TransferOffer = {
    id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    playerId,
    fromClubId,
    toClubId,
    amount,
    status: 'pending',
    offerType,
    loanDetails,
    createdAt: new Date().toISOString(),
    expiresAt: calculateExpiryDate(OFFER_EXPIRY_DAYS),
  };
  
  return offer;
}

/**
 * Procesa una oferta recibida por un club
 * @param offer - Oferta a procesar
 * @param player - Datos del jugador
 * @param sellerPatience - Paciencia del vendedor (0-100)
 * @returns Resultado de la evaluación
 */
export function processIncomingOffer(
  offer: TransferOffer,
  player: any,
  sellerPatience: number = 50
): OfferEvaluation {
  const valuation = calculateMarketValuation(
    calculateBaseValue(player.OVR, player.Age, player.OVR),
    player.Age,
    player.OVR
  );
  
  // Verificar si la oferta es aceptable
  const acceptable = isOfferAcceptable(offer.amount, valuation, sellerPatience);
  
  if (acceptable) {
    return {
      shouldAccept: true,
      score: calculateOfferScore(offer.amount, valuation),
      reason: 'Oferta aceptable según valoración de mercado',
    };
  }
  
  // Generar contraoferta si es apropiado
  if (Math.random() < COUNTER_OFFER_PROBABILITY) {
    const counterAmount = generateMarketCounter(offer.amount, valuation, 0);
    
    if (counterAmount) {
      return {
        shouldAccept: false,
        score: calculateOfferScore(offer.amount, valuation),
        reason: 'Oferta demasiado baja, se sugiere contraoferta',
        counterOffer: counterAmount,
      };
    }
  }
  
  return {
    shouldAccept: false,
    score: calculateOfferScore(offer.amount, valuation),
    reason: 'Oferta rechazada',
  };
}

/**
 * Acepta una oferta
 * @param offer - Oferta a aceptar
 * @returns Oferta actualizada
 */
export function acceptOffer(offer: TransferOffer): TransferOffer {
  return {
    ...offer,
    status: 'accepted',
  };
}

/**
 * Rechaza una oferta
 * @param offer - Oferta a rechazar
 * @param isFinal - Si es rechazo definitivo
 * @returns Oferta actualizada
 */
export function rejectOffer(offer: TransferOffer, isFinal: boolean = false): TransferOffer {
  return {
    ...offer,
    status: isFinal ? 'rejected' : 'rejected',
  };
}

/**
 * Genera una contraoferta
 * @param originalOffer - Oferta original
 * @param counterAmount - Cantidad de la contraoferta
 * @returns Contraoferta creada
 */
export function createCounterOffer(
  originalOffer: TransferOffer,
  counterAmount: number
): TransferOffer {
  const counterOffer: TransferOffer = {
    ...originalOffer,
    id: `counter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    amount: counterAmount,
    status: 'countered',
    counterOffer: originalOffer,
    createdAt: new Date().toISOString(),
    expiresAt: calculateExpiryDate(OFFER_EXPIRY_DAYS),
  };
  
  return counterOffer;
}

/**
 * Procesa una contraoferta recibida
 * @param counterOffer - Contraoferta recibida
 * @param originalOffer - Oferta original
 * @param buyerPatience - Paciencia del comprador (0-100)
 * @returns Resultado de la decisión
 */
export function processCounterOffer(
  counterOffer: TransferOffer,
  originalOffer: TransferOffer,
  buyerPatience: number = 50
): TransferResult {
  const strategy = getClubStrategy(counterOffer.fromClubId);
  
  // Verificar si aceptar la contraoferta
  const shouldAccept = willAcceptCounterOffer(
    counterOffer.toClubId,
    counterOffer.amount,
    originalOffer.amount * 1.2 // Precio objetivo
  );
  
  if (shouldAccept) {
    return {
      success: true,
      message: 'Contraoferta aceptada',
      data: { acceptedAmount: counterOffer.amount },
    };
  }
  
  // Verificar si hacer otra contraoferta
  const counterCount = countCounterOffers(originalOffer);
  if (counterCount < MAX_COUNTER_OFFERS && buyerPatience > 30) {
    const increment = (counterOffer.amount - originalOffer.amount) * 
      (COUNTER_OFFER_INCREMENT_MIN + Math.random() * (COUNTER_OFFER_INCREMENT_MAX - COUNTER_OFFER_INCREMENT_MIN));
    const newAmount = Math.round(counterOffer.amount + increment);
    
    return {
      success: false,
      message: 'Contraoferta rechazada, se sugiere nueva contraoferta',
      data: { suggestedAmount: newAmount },
    };
  }
  
  return {
    success: false,
    message: 'Contraoferta rechazada, negociación terminada',
  };
}

/**
 * Retira una oferta
 * @param offer - Oferta a retirar
 * @returns Oferta actualizada
 */
export function withdrawOffer(offer: TransferOffer): TransferOffer {
  return {
    ...offer,
    status: 'withdrawn',
  };
}

/**
 * Verifica si una oferta ha expirado
 * @param offer - Oferta a verificar
 * @returns Si ha expirado
 */
export function isOfferExpired(offer: TransferOffer): boolean {
  if (!offer.expiresAt) return false;
  
  const expiryDate = new Date(offer.expiresAt);
  const now = new Date();
  
  return now > expiryDate;
}

/**
 * Marca una oferta como expirada
 * @param offer - Oferta a marcar
 * @returns Oferta actualizada
 */
export function markOfferAsExpired(offer: TransferOffer): TransferOffer {
  return {
    ...offer,
    status: 'expired',
  };
}

/**
 * Simula el tiempo de respuesta de un club
 * @param clubId - ID del club
 * @returns Días de respuesta
 */
export function simulateResponseTime(clubId: string): number {
  const strategy = getClubStrategy(clubId);
  
  if (strategy.negotiationPatience > 70) {
    return OFFER_RESPONSE_DAYS.slow;
  } else if (strategy.negotiationPatience > 40) {
    return OFFER_RESPONSE_DAYS.normal;
  } else {
    return OFFER_RESPONSE_DAYS.quick;
  }
}

/**
 * Procesa la decisión del jugador sobre una transferencia
 * @param offer - Oferta de transferencia
 * @param player - Datos del jugador
 * @param currentWage - Salario actual
 * @param offeredWage - Salario ofrecido
 * @param currentPlayingTime - Minutos actuales
 * @param promisedPlayingTime - Minutos prometidos
 * @returns Resultado de la decisión del jugador
 */
export function processPlayerDecision(
  offer: TransferOffer,
  player: any,
  currentWage: number,
  offeredWage: number,
  currentPlayingTime: number,
  promisedPlayingTime: number
): TransferResult {
  const fromTeam = teamById(offer.fromClubId);
  const toTeam = teamById(offer.toClubId);
  
  if (!fromTeam || !toTeam) {
    return { success: false, message: 'Club no encontrado' };
  }
  
  const personality = generatePlayerPersonality(offer.playerId, player.Age, player.OVR);
  
  const decision = decideOnTransferOffer(
    personality,
    toTeam.name,
    fromTeam.name,
    currentWage,
    offeredWage,
    currentPlayingTime,
    promisedPlayingTime,
    fromTeam.league === 'epl' || fromTeam.league === 'laliga', // Champions asumido
    toTeam.league === 'epl' || toTeam.league === 'laliga'
  );
  
  return decision;
}

// ============================================================================
// GESTION DE NEGOCIACIONES
// ============================================================================

/**
 * Añade una oferta a las negociaciones activas
 * @param offer - Oferta a añadir
 */
export function addActiveNegotiation(offer: TransferOffer): void {
  const clubNegotiations = activeNegotiations.get(offer.toClubId) || [];
  clubNegotiations.push(offer);
  activeNegotiations.set(offer.toClubId, clubNegotiations);
}

/**
 * Obtiene las negociaciones activas de un club
 * @param clubId - ID del club
 * @returns Negociaciones activas
 */
export function getActiveNegotiations(clubId: string): TransferOffer[] {
  return activeNegotiations.get(clubId) || [];
}

/**
 * Elimina una oferta de las negociaciones activas
 * @param offerId - ID de la oferta
 */
export function removeActiveNegotiation(offerId: string): void {
  for (const [clubId, negotiations] of activeNegotiations.entries()) {
    const filtered = negotiations.filter(o => o.id !== offerId);
    activeNegotiations.set(clubId, filtered);
  }
}

/**
 * Limpia las negociaciones expiradas
 */
export function clearExpiredNegotiations(): void {
  for (const [clubId, negotiations] of activeNegotiations.entries()) {
    const active = negotiations.filter(o => !isOfferExpired(o));
    activeNegotiations.set(clubId, active);
  }
}

/**
 * Obtiene todas las ofertas pendientes de un jugador
 * @param playerId - ID del jugador
 * @returns Ofertas pendientes
 */
export function getPendingOffersForPlayer(playerId: string): TransferOffer[] {
  const allOffers: TransferOffer[] = [];
  
  for (const negotiations of activeNegotiations.values()) {
    const playerOffers = negotiations.filter(o => 
      o.playerId === playerId && o.status === 'pending'
    );
    allOffers.push(...playerOffers);
  }
  
  return allOffers;
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Calcula la fecha de expiración
 * @param days - Días hasta expiración
 * @returns Fecha de expiración (ISO date)
 */
function calculateExpiryDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Calcula el valor base de un jugador
 * @param rating - Valoración
 * @param age - Edad
 * @param potential - Potencial
 * @returns Valor base
 */
function calculateBaseValue(rating: number, age: number, potential: number): number {
  // Fórmula simplificada
  const ratingFactor = Math.pow(rating / 70, 4);
  return ratingFactor * 5_000_000;
}

/**
 * Calcula la puntuación de una oferta
 * @param amount - Cantidad de la oferta
 * @param valuation - Valoración de mercado
 * @returns Puntuación (0-100)
 */
function calculateOfferScore(amount: number, valuation: any): number {
  if (amount >= valuation.maxValue) return 100;
  if (amount >= valuation.idealValue) return 85;
  if (amount >= valuation.expectedValue) return 70;
  if (amount >= valuation.minAcceptable) return 50;
  
  const ratio = amount / valuation.minAcceptable;
  return Math.round(ratio * 50);
}

/**
 * Cuenta el número de contraofertas en una cadena
 * @param offer - Oferta inicial
 * @returns Número de contraofertas
 */
function countCounterOffers(offer: TransferOffer): number {
  let count = 0;
  let current = offer;
  
  while (current.counterOffer) {
    count++;
    current = current.counterOffer;
  }
  
  return count;
}

/**
 * Determina si una oferta puede ser contraofertada
 * @param offer - Oferta a evaluar
 * @returns Si puede ser contraofertada
 */
export function canCounterOffer(offer: TransferOffer): boolean {
  if (offer.status !== 'pending' && offer.status !== 'countered') {
    return false;
  }
  
  if (isOfferExpired(offer)) {
    return false;
  }
  
  const counterCount = countCounterOffers(offer);
  return counterCount < MAX_COUNTER_OFFERS;
}

/**
 * Obtiene el historial de una negociación
 * @param offer - Oferta actual
 * @returns Historial de ofertas
 */
export function getNegotiationHistory(offer: TransferOffer): TransferOffer[] {
  const history: TransferOffer[] = [offer];
  let current = offer;
  
  while (current.counterOffer) {
    history.unshift(current.counterOffer);
    current = current.counterOffer;
  }
  
  return history;
}

/**
 * Calcula el progreso de una negociación
 * @param offer - Oferta actual
 * @returns Progreso (0-100)
 */
export function calculateNegotiationProgress(offer: TransferOffer): number {
  const history = getNegotiationHistory(offer);
  const counterCount = history.length - 1;
  
  if (counterCount === 0) return 0;
  
  const progress = (counterCount / MAX_COUNTER_OFFERS) * 100;
  return Math.min(100, progress);
}

/**
 * Determina si una negociación está cerca de cerrarse
 * @param offer - Oferta actual
 * @returns Si está cerca de cerrarse
 */
export function isNegotiationNearCompletion(offer: TransferOffer): boolean {
  const progress = calculateNegotiationProgress(offer);
  return progress >= 70;
}

/**
 * LoanEngine - Sistema de cesiones
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { LoanDetails, TransferResult } from './types';
import { 
  LOAN_DURATION,
  LOAN_WAGE_CONTRIBUTION,
  LOAN_OPTION_TO_BUY_PERCENTAGE,
} from './constants';
import { generatePlayerPersonality, decideOnTransferOffer } from './PlayerDecision';
import { calculateMarketValuation } from './MarketValuation';
import { teamById } from '@/data/teams';

// ============================================================================
// CACHE DE CESIONES
// ============================================================================

const loanDecisionCache = new Map<string, boolean>();
const CACHE_DURATION_MS = 300000; // 5 minutos

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Genera detalles de una cesion
 * @param duration - Duracion en meses
 * @param wageContribution - Porcentaje de salario pagado por el club prestamista
 * @param optionToBuy - Si hay opcion de compra
 * @param optionToBuyAmount - Cantidad de opcion de compra
 * @returns Detalles de la cesion
 */
export function generateLoanDetails(
  duration: number = LOAN_DURATION.medium,
  wageContribution: number = LOAN_WAGE_CONTRIBUTION.half,
  optionToBuy?: number,
  obligationToBuy?: number
): LoanDetails {
  return {
    duration,
    wageContribution,
    optionToBuy,
    obligationToBuy,
  };
}

/**
 * Calcula la opcion de compra para una cesion
 * @param marketValue - Valor de mercado del jugador
 * @param playerAge - Edad del jugador
 * @param playerRating - Valoracion del jugador
 * @returns Cantidad de opcion de compra
 */
export function calculateLoanOptionToBuy(
  marketValue: number,
  playerAge: number,
  playerRating: number
): number {
  // Jovenes tienen opciones mas altas (potencial)
  if (playerAge <= 22) {
    return Math.round(marketValue * (1.2 + Math.random() * 0.3));
  }
  
  // Jugadores en su mejor momento
  if (playerAge <= 28) {
    return Math.round(marketValue * (1.0 + Math.random() * 0.2));
  }
  
  // Veteranos tienen opciones mas bajas
  return Math.round(marketValue * (0.8 + Math.random() * 0.2));
}

/**
 * Determina si un jugador es apto para cesion
 * @param player - Jugador a evaluar
 * @param currentClub - Club actual
 * @returns Si es apto para cesion
 */
export function isPlayerLoanEligible(player: any, currentClub: string): boolean {
  // Jugadores jovenes (18-23) son buenos candidatos
  if (player.Age >= 18 && player.Age <= 23) {
    return true;
  }
  
  // Jugadores que no juegan mucho
  // Esto requeriria datos de minutos jugados
  
  return false;
}

/**
 * Determina si un club deberia ceder un jugador
 * @param clubId - ID del club
 * @param player - Jugador a evaluar
 * @param squadNeeds - Necesidades de la plantilla
 * @returns Si deberia ceder
 */
export function shouldLoanPlayer(
  clubId: string,
  player: any,
  squadNeeds: any[]
): boolean {
  // Si el jugador es joven y no juega, ceder para experiencia
  if (player.Age <= 21) {
    // Verificar si hay exceso en su posicion
    return true;
  }
  
  return false;
}

/**
 * Busca clubes interesados en una cesion
 * @param playerId - ID del jugador
 * @param player - Datos del jugador
 * @param allClubs - Todos los clubes
 * @returns Clubes interesados
 */
export function findLoanSuitors(
  playerId: string,
  player: any,
  allClubs: any[]
): any[] {
  // Filtrar clubes que podrian estar interesados
  return allClubs.filter(club => {
    // No el club actual
    if (club.id === player.Team) return false;
    
    // Clubes que valoran jovenes
    // Esto requeriria datos de estrategia del club
    
    // Clubes que necesitan esa posicion
    // Esto requeriria analisis de plantilla
    
    return Math.random() > 0.7; // 30% de probabilidad
  });
}

/**
 * Procesa una solicitud de cesion
 * @param playerId - ID del jugador
 * @param fromClubId - ID del club prestamista
 * @param toClubId - ID del club receptor
 * @param loanDetails - Detalles de la cesion
 * @param player - Datos del jugador
 * @returns Resultado de la cesion
 */
export function processLoanRequest(
  playerId: string,
  fromClubId: string,
  toClubId: string,
  loanDetails: LoanDetails,
  player: any
): TransferResult {
  const fromTeam = teamById(fromClubId);
  const toTeam = teamById(toClubId);
  
  if (!fromTeam || !toTeam) {
    return { success: false, message: 'Club no encontrado' };
  }
  
  // Verificar si el jugador acepta la cesion
  const personality = generatePlayerPersonality(playerId, player.Age, player.OVR);
  
  const decision = decideOnTransferOffer(
    personality,
    fromTeam.name,
    toTeam.name,
    0, // Salario actual (desconocido)
    0, // Cesion sin cambio de salario
    50, // Minutos actuales (desconocido)
    70, // Minutos prometidos
    toTeam.league === 'epl' || toTeam.league === 'laliga', // Champions asumido
    fromTeam.league === 'epl' || fromTeam.league === 'laliga'
  );
  
  if (!decision.success) {
    return decision;
  }
  
  // Verificar si el club prestamista acepta
  const shouldAccept = shouldAcceptLoanOffer(fromClubId, player, loanDetails);
  
  if (!shouldAccept) {
    return { success: false, message: 'El club rechaza la cesion' };
  }
  
  return {
    success: true,
    message: 'Cesion aceptada',
    data: { loanDetails },
  };
}

/**
 * Determina si un club acepta una oferta de cesion
 * @param clubId - ID del club
 * @param player - Jugador
 * @param loanDetails - Detalles de la cesion
 * @returns Si acepta
 */
export function shouldAcceptLoanOffer(
  clubId: string,
  player: any,
  loanDetails: LoanDetails
): boolean {
  // Si el jugador es joven, aceptar para desarrollo
  if (player.Age <= 21) {
    return true;
  }
  
  // Si hay opcion de compra generosa, aceptar
  if (loanDetails.optionToBuy && loanDetails.optionToBuy > 0) {
    const baseValue = calculateMarketValuation(
      5_000_000, // Valor base estimado
      player.Age,
      player.OVR
    );
    
    if (loanDetails.optionToBuy >= baseValue.expectedValue) {
      return true;
    }
  }
  
  // Si el club paga el salario completo, aceptar
  if (loanDetails.wageContribution >= 100) {
    return true;
  }
  
  return false;
}

/**
 * Ejecuta el fin de una cesion
 * @param playerId - ID del jugador
 * @param fromClubId - ID del club prestamista
 * @param toClubId - ID del club receptor
 * @param optionToBuyExercised - Si se ejercio la opcion de compra
 * @param purchaseAmount - Cantidad de compra
 * @returns Resultado
 */
export function endLoan(
  playerId: string,
  fromClubId: string,
  toClubId: string,
  optionToBuyExercised: boolean = false,
  purchaseAmount?: number
): TransferResult {
  if (optionToBuyExercised && purchaseAmount) {
    return {
      success: true,
      message: 'Opcion de compra ejercida',
      data: { purchaseAmount, permanentTransfer: true },
    };
  }
  
  return {
    success: true,
    message: 'Jugador devuelto al club original',
    data: { permanentTransfer: false },
  };
}

/**
 * Calcula el coste total de una cesion
 * @param loanDetails - Detalles de la cesion
 * @param weeklyWage - Salario semanal del jugador
 * @returns Coste total
 */
export function calculateLoanCost(
  loanDetails: LoanDetails,
  weeklyWage: number
): number {
  const weeks = loanDetails.duration * 4; // Aproximadamente 4 semanas por mes
  const wageCost = weeks * weeklyWage * (loanDetails.wageContribution / 100);
  
  return wageCost;
}

/**
 * Genera una oferta de cesion
 * @param playerId - ID del jugador
 * @param fromClubId - ID del club prestamista
 * @param toClubId - ID del club receptor
 * @param player - Datos del jugador
 * @returns Oferta de cesion
 */
export function generateLoanOffer(
  playerId: string,
  fromClubId: string,
  toClubId: string,
  player: any
): { loanDetails: LoanDetails; message: string } {
  const baseValue = calculateMarketValuation(
    5_000_000, // Valor base estimado
    player.Age,
    player.OVR
  );
  
  const duration = LOAN_DURATION.medium;
  const wageContribution = LOAN_WAGE_CONTRIBUTION.half;
  
  // Decidir si incluir opcion de compra
  const includeOption = player.Age <= 25 && Math.random() > 0.5;
  const optionToBuy = includeOption 
    ? calculateLoanOptionToBuy(baseValue.expectedValue, player.Age, player.OVR)
    : undefined;
  
  const loanDetails = generateLoanDetails(
    duration,
    wageContribution,
    optionToBuy
  );
  
  return {
    loanDetails,
    message: includeOption 
      ? `Cesion con opcion de compra por ${optionToBuy?.toLocaleString()}€`
      : 'Cesion sin opcion de compra',
  };
}

// ============================================================================
// GESTION DE CESIONES
// ============================================================================

/**
 * Obtiene jugadores cedidos por un club
 * @param clubId - ID del club
 * @param allPlayers - Todos los jugadores
 * @returns Jugadores cedidos
 */
export function getLoanedOutPlayers(clubId: string, allPlayers: any[]): any[] {
  // Esto requeriria un campo en el jugador para indicar si esta cedido
  return allPlayers.filter(p => p.loanedFrom === clubId);
}

/**
 * Obtiene jugadores prestados a un club
 * @param clubId - ID del club
 * @param allPlayers - Todos los jugadores
 * @returns Jugadores prestados
 */
export function getLoanedInPlayers(clubId: string, allPlayers: any[]): any[] {
  // Esto requeriria un campo en el jugador para indicar si esta cedido
  return allPlayers.filter(p => p.loanedTo === clubId);
}

/**
 * Verifica si un jugador esta cedido
 * @param player - Jugador
 * @returns Si esta cedido
 */
export function isPlayerOnLoan(player: any): boolean {
  return !!player.loanedTo;
}

/**
 * Obtiene el club al que esta cedido un jugador
 * @param player - Jugador
 * @returns ID del club o null
 */
export function getLoanDestination(player: any): string | null {
  return player.loanedTo || null;
}

// ============================================================================
// CACHE
// ============================================================================

/**
 * Limpia la cache de decisiones de cesion
 */
export function clearLoanDecisionCache(): void {
  loanDecisionCache.clear();
}

/**
 * Obtiene una decisión de la caché
 * @param key - Clave de caché
 * @returns Decisión o null
 */
export function getCachedLoanDecision(key: string): boolean | null {
  return loanDecisionCache.get(key) || null;
}

/**
 * Guarda una decisión en la caché
 * @param key - Clave de caché
 * @param decision - Decisión
 */
export function cacheLoanDecision(key: string, decision: boolean): void {
  loanDecisionCache.set(key, decision);
}

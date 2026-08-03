/**
 * ContractEngine - Contratos y salarios
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { Contract, ContractStatus } from './types';
import { 
  CONTRACT_DURATION_BY_AGE,
  WAGE_PERCENTAGE_OF_VALUE,
  CONTRACT_RENEWAL_THRESHOLD_DAYS,
  RENEWAL_PROBABILITY,
  RELEASE_CLAUSE_MULTIPLIER,
} from './constants';

// ============================================================================
// CACHE DE CONTRATOS
// ============================================================================

const contractCache = new Map<string, Contract>();

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Genera un contrato para un nuevo fichaje
 * @param playerId - ID del jugador
 * @param clubId - ID del club
 * @param marketValue - Valor de mercado del jugador
 * @param playerAge - Edad del jugador
 * @param playerRating - Valoración del jugador
 * @param startDate - Fecha de inicio (ISO date)
 * @returns Contrato generado
 */
export function generateContract(
  playerId: string,
  clubId: string,
  marketValue: number,
  playerAge: number,
  playerRating: number,
  startDate: string
): Contract {
  const duration = calculateContractDuration(playerAge);
  const weeklyWage = calculateWeeklyWage(marketValue, playerAge, playerRating);
  const releaseClause = calculateReleaseClause(marketValue, playerRating);
  const signingBonus = calculateSigningBonus(marketValue, playerRating);
  
  // Calcular fecha de fin
  const endDate = calculateEndDate(startDate, duration);
  
  return {
    playerId,
    clubId,
    startDate,
    endDate,
    weeklyWage,
    releaseClause,
    signingBonus,
    performanceBonus: calculatePerformanceBonus(marketValue, playerRating),
  };
}

/**
 * Calcula la duración de un contrato según la edad
 * @param age - Edad del jugador
 * @returns Duración en años
 */
export function calculateContractDuration(age: number): number {
  if (age >= 18 && age <= 21) return CONTRACT_DURATION_BY_AGE.age_18_21;
  if (age >= 22 && age <= 25) return CONTRACT_DURATION_BY_AGE.age_22_25;
  if (age >= 26 && age <= 29) return CONTRACT_DURATION_BY_AGE.age_26_29;
  if (age >= 30 && age <= 33) return CONTRACT_DURATION_BY_AGE.age_30_33;
  return CONTRACT_DURATION_BY_AGE.age_34_plus;
}

/**
 * Calcula el salario semanal de un jugador
 * @param marketValue - Valor de mercado
 * @param age - Edad del jugador
 * @param rating - Valoración del jugador
 * @returns Salario semanal en euros
 */
export function calculateWeeklyWage(
  marketValue: number,
  age: number,
  rating: number
): number {
  // Determinar porcentaje según calidad
  let percentage: number = WAGE_PERCENTAGE_OF_VALUE.mid;
  
  if (rating >= 88) {
    percentage = WAGE_PERCENTAGE_OF_VALUE.elite;
  } else if (rating >= 82) {
    percentage = WAGE_PERCENTAGE_OF_VALUE.high;
  } else if (rating >= 75) {
    percentage = WAGE_PERCENTAGE_OF_VALUE.mid;
  } else {
    percentage = WAGE_PERCENTAGE_OF_VALUE.low;
  }
  
  // Ajustar por edad (jóvenes ganan menos, veteranos más)
  if (age <= 22) {
    percentage *= 0.7; // 30% menos
  } else if (age >= 32) {
    percentage *= 1.2; // 20% más
  }
  
  // Calcular salario anual
  const annualWage = marketValue * percentage;
  
  // Convertir a semanal (52 semanas)
  const weeklyWage = annualWage / 52;
  
  return Math.round(weeklyWage);
}

/**
 * Calcula la cláusula de rescisión
 * @param marketValue - Valor de mercado
 * @param rating - Valoración del jugador
 * @returns Cláusula de rescisión en euros
 */
export function calculateReleaseClause(marketValue: number, rating: number): number {
  let multiplier = RELEASE_CLAUSE_MULTIPLIER;
  
  // Estrellas tienen cláusulas más altas
  if (rating >= 88) {
    multiplier *= 1.5;
  } else if (rating >= 82) {
    multiplier *= 1.2;
  }
  
  return Math.round(marketValue * multiplier);
}

/**
 * Calcula la prima de fichaje
 * @param marketValue - Valor de mercado
 * @param rating - Valoración del jugador
 * @returns Prima de fichaje en euros
 */
export function calculateSigningBonus(marketValue: number, rating: number): number {
  // Solo jugadores de alto nivel tienen prima
  if (rating < 80) return 0;
  
  const percentage = rating >= 88 ? 0.15 : 0.10; // 15% para estrellas, 10% para otros
  return Math.round(marketValue * percentage);
}

/**
 * Calcula el bonus por rendimiento
 * @param marketValue - Valor de mercado
 * @param rating - Valoración del jugador
 * @returns Bonus por rendimiento en euros
 */
export function calculatePerformanceBonus(marketValue: number, rating: number): number {
  if (rating < 75) return 0;
  
  const percentage = rating >= 85 ? 0.05 : 0.03; // 5% para estrellas, 3% para otros
  return Math.round(marketValue * percentage);
}

/**
 * Calcula la fecha de fin de contrato
 * @param startDate - Fecha de inicio (ISO date)
 * @param durationYears - Duración en años
 * @returns Fecha de fin (ISO date)
 */
export function calculateEndDate(startDate: string, durationYears: number): string {
  const date = new Date(startDate);
  date.setFullYear(date.getFullYear() + durationYears);
  return date.toISOString().split('T')[0];
}

/**
 * Determina el estado de un contrato
 * @param contract - Contrato a evaluar
 * @param currentDate - Fecha actual (ISO date)
 * @returns Estado del contrato
 */
export function getContractStatus(contract: Contract, currentDate: string): ContractStatus {
  const endDate = new Date(contract.endDate);
  const current = new Date(currentDate);
  const thresholdDays = CONTRACT_RENEWAL_THRESHOLD_DAYS;
  
  // Contrato expirado
  if (current > endDate) {
    return 'expired';
  }
  
  // Próximo a expirar
  const daysUntilExpiry = Math.floor((endDate.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry <= thresholdDays) {
    return 'expiring_soon';
  }
  
  // Contrato activo
  return 'active';
}

/**
 * Determina si un contrato debe renovarse
 * @param contract - Contrato a evaluar
 * @param playerRating - Valoración actual del jugador
 * @param playerAge - Edad del jugador
 * @returns Si debe renovarse
 */
export function shouldRenewContract(
  contract: Contract,
  playerRating: number,
  playerAge: number
): boolean {
  // No renovar jugadores muy mayores
  if (playerAge >= 35) {
    return false;
  }
  
  // Determinar probabilidad según calidad
  let probability: number = RENEWAL_PROBABILITY.rotation;
  
  if (playerRating >= 85) {
    probability = RENEWAL_PROBABILITY.star;
  } else if (playerRating >= 78) {
    probability = RENEWAL_PROBABILITY.key_player;
  } else if (playerRating >= 72) {
    probability = RENEWAL_PROBABILITY.rotation;
  } else {
    probability = RENEWAL_PROBABILITY.backup;
  }
  
  // Aplicar factor aleatorio
  return Math.random() < probability;
}

/**
 * Genera una oferta de renovación
 * @param currentContract - Contrato actual
 * @param playerRating - Valoración actual del jugador
 * @param playerAge - Edad del jugador
 * @param marketValue - Valor de mercado actual
 * @returns Nueva oferta de contrato
 */
export function generateRenewalOffer(
  currentContract: Contract,
  playerRating: number,
  playerAge: number,
  marketValue: number
): Contract {
  const duration = calculateContractDuration(playerAge);
  const weeklyWage = calculateWeeklyWage(marketValue, playerAge, playerRating);
  
  // Aumentar salario si el jugador ha mejorado
  const wageIncrease = playerRating >= 82 ? 1.15 : 1.10; // 15% o 10% aumento
  const newWeeklyWage = Math.round(weeklyWage * wageIncrease);
  
  return {
    ...currentContract,
    startDate: currentContract.endDate, // Empieza cuando termina el actual
    endDate: calculateEndDate(currentContract.endDate, duration),
    weeklyWage: newWeeklyWage,
    releaseClause: calculateReleaseClause(marketValue, playerRating),
  };
}

/**
 * Calcula el coste total de un contrato
 * @param contract - Contrato
 * @returns Coste total en euros (salarios + primas)
 */
export function calculateTotalContractCost(contract: Contract): number {
  const signingBonus = contract.signingBonus || 0;
  const performanceBonus = contract.performanceBonus || 0;
  
  // Calcular semanas restantes
  const startDate = new Date(contract.startDate);
  const endDate = new Date(contract.endDate);
  const weeksRemaining = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)));
  
  const totalWages = contract.weeklyWage * weeksRemaining;
  
  return signingBonus + totalWages + performanceBonus;
}

/**
 * Calcula el valor de rescisión de un contrato
 * @param contract - Contrato
 * @param currentDate - Fecha actual
 * @returns Valor de rescisión en euros
 */
export function calculateContractTerminationFee(
  contract: Contract,
  currentDate: string
): number {
  const status = getContractStatus(contract, currentDate);
  
  // Si está expirado, no hay coste
  if (status === 'expired') {
    return 0;
  }
  
  // Calcular salarios restantes
  const startDate = new Date(currentDate);
  const endDate = new Date(contract.endDate);
  const weeksRemaining = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)));
  
  // Coste = salarios restantes + 50% de prima de fichaje si aplica
  const remainingWages = contract.weeklyWage * weeksRemaining;
  const signingBonusPortion = contract.signingBonus ? contract.signingBonus * 0.5 : 0;
  
  return remainingWages + signingBonusPortion;
}

// ============================================================================
// GESTIÓN DE CONTRATOS
// ============================================================================

/**
 * Obtiene contratos que expiran pronto
 * @param contracts - Lista de contratos
 * @param currentDate - Fecha actual
 * @param thresholdDays - Días de umbral
 * @returns Contratos que expiran pronto
 */
export function getExpiringContracts(
  contracts: Contract[],
  currentDate: string,
  thresholdDays: number = CONTRACT_RENEWAL_THRESHOLD_DAYS
): Contract[] {
  return contracts.filter(contract => {
    const status = getContractStatus(contract, currentDate);
    if (status !== 'expiring_soon') return false;
    
    const endDate = new Date(contract.endDate);
    const current = new Date(currentDate);
    const daysUntilExpiry = Math.floor((endDate.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysUntilExpiry <= thresholdDays;
  });
}

/**
 * Obtiene contratos expirados
 * @param contracts - Lista de contratos
 * @param currentDate - Fecha actual
 * @returns Contratos expirados
 */
export function getExpiredContracts(
  contracts: Contract[],
  currentDate: string
): Contract[] {
  return contracts.filter(contract => {
    return getContractStatus(contract, currentDate) === 'expired';
  });
}

/**
 * Filtra contratos por club
 * @param contracts - Lista de contratos
 * @param clubId - ID del club
 * @returns Contratos del club
 */
export function filterContractsByClub(
  contracts: Contract[],
  clubId: string
): Contract[] {
  return contracts.filter(contract => contract.clubId === clubId);
}

/**
 * Filtra contratos por jugador
 * @param contracts - Lista de contratos
 * @param playerId - ID del jugador
 * @returns Contratos del jugador
 */
export function filterContractsByPlayer(
  contracts: Contract[],
  playerId: string
): Contract[] {
  return contracts.filter(contract => contract.playerId === playerId);
}

/**
 * Ordena contratos por salario (descendente)
 * @param contracts - Lista de contratos
 * @returns Contratos ordenados
 */
export function sortContractsByWage(contracts: Contract[]): Contract[] {
  return [...contracts].sort((a, b) => b.weeklyWage - a.weeklyWage);
}

/**
 * Calcula la masa salarial total de un club
 * @param contracts - Contratos del club
 * @returns Masa salarial semanal total
 */
export function calculateClubWageBill(contracts: Contract[]): number {
  return contracts.reduce((total, contract) => total + contract.weeklyWage, 0);
}

/**
 * Obtiene los contratos más caros de un club
 * @param contracts - Contratos del club
 * @param limit - Número máximo
 * @returns Contratos más caros
 */
export function getHighestPaidContracts(
  contracts: Contract[],
  limit: number = 5
): Contract[] {
  return sortContractsByWage(contracts).slice(0, limit);
}

// ============================================================================
// CACHE
// ============================================================================

/**
 * Guarda un contrato en caché
 * @param contract - Contrato a guardar
 */
export function cacheContract(contract: Contract): void {
  contractCache.set(`${contract.clubId}-${contract.playerId}`, contract);
}

/**
 * Obtiene un contrato de la caché
 * @param clubId - ID del club
 * @param playerId - ID del jugador
 * @returns Contrato o null
 */
export function getCachedContract(clubId: string, playerId: string): Contract | null {
  return contractCache.get(`${clubId}-${playerId}`) || null;
}

/**
 * Limpia la caché de contratos
 */
export function clearContractCache(): void {
  contractCache.clear();
}

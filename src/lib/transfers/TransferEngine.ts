/**
 * TransferEngine - Lógica de fichajes
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { 
  CandidateScore, 
  TransferResult,
  SquadNeed,
} from './types';
import { 
  CANDIDATES_TO_EVALUATE,
  MAX_PLAYERS_TO_SCAN,
} from './constants';
import { getClubStrategy, calculateInterestScore } from './ClubStrategy';
import { analyzeSquad, getHighPriorityNeeds } from './SquadAnalyzer';
import { canAffordTransfer, calculateMaxTransferFee } from './BudgetManager';
import { calculateMarketValuation, calculateBaseValue, isStarPlayer } from './MarketValuation';
import { generatePlayerPersonality, decideOnTransferOffer } from './PlayerDecision';
import { teamById } from '@/data/teams';
import { mapEaPosition } from '@/store/playersStore';

// ============================================================================
// CACHE DE CANDIDATOS
// ============================================================================

const candidateCache = new Map<string, CandidateScore[]>();
const CACHE_DURATION_MS = 120000; // 2 minutos

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Busca candidatos para fichaje para un club
 * @param clubId - ID del club
 * @param allPlayers - Todos los jugadores disponibles
 * @param budgetState - Estado del presupuesto
 * @param needs - Necesidades de la plantilla
 * @returns Lista de candidatos puntuados
 */
export function findTransferCandidates(
  clubId: string,
  allPlayers: any[],
  budgetState: any,
  needs: SquadNeed[]
): CandidateScore[] {
  const cacheKey = `${clubId}-${needs.map(n => n.position).join('-')}`;
  
  // Verificar caché
  const cached = candidateCache.get(cacheKey);
  if (cached && Date.now() - (cached as any).cacheTime < CACHE_DURATION_MS) {
    return cached;
  }
  
  const strategy = getClubStrategy(clubId);
  const highPriorityNeeds = getHighPriorityNeeds({ clubId, needs } as any);
  
  // Si no hay necesidades críticas o altas, no buscar
  if (highPriorityNeeds.length === 0) {
    return [];
  }
  
  // Limitar jugadores a escanear para rendimiento
  const playersToScan = allPlayers.slice(0, MAX_PLAYERS_TO_SCAN);
  
  // Filtrar jugadores del propio club
  const team = teamById(clubId);
  const availablePlayers = playersToScan.filter(p => p.Team !== team?.name);
  
  const candidates: CandidateScore[] = [];
  
  // Evaluar jugadores para cada necesidad
  for (const need of highPriorityNeeds) {
    const positionCandidates = availablePlayers.filter(p => {
      const playerPos = mapEaPosition(p.Position);
      return playerPos === need.position;
    });
    
    // Tomar muestra aleatoria para rendimiento
    const sample = shuffleArray(positionCandidates).slice(0, CANDIDATES_TO_EVALUATE);
    
    for (const player of sample) {
      const score = scoreCandidate(player, need, strategy, budgetState, clubId);
      if (score.totalScore > 30) { // Umbral mínimo
        candidates.push(score);
      }
    }
  }
  
  // Ordenar por puntuación total
  const sorted = candidates.sort((a, b) => b.totalScore - a.totalScore);
  
  // Guardar en caché
  (sorted as any).cacheTime = Date.now();
  candidateCache.set(cacheKey, sorted);
  
  return sorted;
}

/**
 * Puntua un candidato para fichaje
 * @param player - Jugador a evaluar
 * @param need - Necesidad que cubre
 * @param strategy - Estrategia del club
 * @param budgetState - Estado del presupuesto
 * @param clubId - ID del club
 * @returns Puntuación del candidato
 */
function scoreCandidate(
  player: any,
  need: SquadNeed,
  strategy: any,
  budgetState: any,
  clubId: string
): CandidateScore {
  const baseValue = calculateBaseValue(player.OVR, player.Age, player.OVR);
  const valuation = calculateMarketValuation(baseValue, player.Age, player.OVR);
  
  // Puntuación por necesidad
  const needScore = calculateNeedScore(player, need);
  
  // Puntuación por edad
  const ageScore = calculateAgeScore(player.Age, need.targetAge);
  
  // Puntuación por potencial
  const potentialScore = calculatePotentialScore(player.OVR, player.Age);
  
  // Puntuación por precio
  const priceScore = calculatePriceScore(valuation.expectedValue, need.maxBudget, budgetState);
  
  // Puntuación por salario (estimado)
  const estimatedWage = valuation.expectedValue * 0.04 / 52; // 4% anual
  const wageScore = calculateWageScore(estimatedWage, budgetState);
  
  // Puntuación por nacionalidad/liga
  const interestScore = calculateInterestScore(
    clubId,
    player.Age,
    player.OVR,
    player.Nation || '',
    player.League || ''
  );
  const nationalityScore = interestScore * 0.5;
  const leagueScore = interestScore * 0.5;
  
  // Puntuación por prestigio
  const prestigeScore = calculatePrestigeScore(player.OVR, strategy);
  
  // Calcular puntuación total
  const totalScore = 
    needScore * 0.25 +
    ageScore * 0.15 +
    potentialScore * 0.15 +
    priceScore * 0.2 +
    wageScore * 0.1 +
    nationalityScore * 0.05 +
    leagueScore * 0.05 +
    prestigeScore * 0.05;
  
  return {
    playerId: player.id || String(player.ID),
    totalScore: Math.round(totalScore),
    needScore,
    ageScore,
    potentialScore,
    priceScore,
    wageScore,
    nationalityScore,
    leagueScore,
    prestigeScore,
  };
}

/**
 * Selecciona el mejor candidato para fichar
 * @param candidates - Lista de candidatos
 * @param maxBudget - Presupuesto máximo
 * @returns Mejor candidato o null
 */
export function selectBestCandidate(
  candidates: CandidateScore[],
  maxBudget: number
): CandidateScore | null {
  if (candidates.length === 0) return null;
  
  // Filtrar por presupuesto
  const affordable = candidates.filter(c => {
    // Esto requeriría acceso al precio real del jugador
    // Por ahora asumimos que todos son asequibles
    return true;
  });
  
  if (affordable.length === 0) return null;
  
  // Seleccionar el de mayor puntuación
  return affordable[0];
}

/**
 * Inicia una negociación para un jugador
 * @param clubId - ID del club comprador
 * @param playerId - ID del jugador
 * @param offerAmount - Cantidad de la oferta
 * @param player - Datos del jugador
 * @returns Resultado de la iniciación
 */
export function initiateTransferNegotiation(
  clubId: string,
  playerId: string,
  offerAmount: number,
  player: any
): TransferResult {
  const team = teamById(clubId);
  if (!team) {
    return { success: false, message: 'Club no encontrado' };
  }
  
  const strategy = getClubStrategy(clubId);
  const baseValue = calculateBaseValue(player.OVR, player.Age, player.OVR);
  const valuation = calculateMarketValuation(baseValue, player.Age, player.OVR);
  
  // Verificar si la oferta es razonable
  if (offerAmount < valuation.minAcceptable) {
    return { 
      success: false, 
      message: 'La oferta es demasiado baja' 
    };
  }
  
  // Generar personalidad del jugador
  const personality = generatePlayerPersonality(playerId, player.Age, player.OVR);
  
  // Decidir si el jugador aceptaría
  const decision = decideOnTransferOffer(
    personality,
    player.Team,
    team.name,
    0, // Salario actual (desconocido)
    offerAmount * 0.04 / 52, // Salario estimado
    50, // Minutos actuales (desconocido)
    70, // Minutos prometidos
    team.league === 'epl' || team.league === 'laliga', // Champions asumido
    false // Club actual sin Champions asumido
  );
  
  if (!decision.success) {
    return decision;
  }
  
  return {
    success: true,
    message: 'Negociación iniciada',
    data: {
      valuation,
      personality,
      initialOffer: offerAmount,
    },
  };
}

/**
 * Determina si un club debe vender un jugador
 * @param clubId - ID del club
 * @param player - Jugador a evaluar
 * @param offerAmount - Oferta recibida
 * @returns Si debe vender
 */
export function shouldSellPlayer(
  clubId: string,
  player: any,
  offerAmount: number
): boolean {
  const strategy = getClubStrategy(clubId);
  const baseValue = calculateBaseValue(player.OVR, player.Age, player.OVR);
  const valuation = calculateMarketValuation(baseValue, player.Age, player.OVR, player.OVR, isStarPlayer(player.OVR));
  
  // Si la oferta supera el máximo, vender siempre
  if (offerAmount >= valuation.maxValue) {
    return true;
  }
  
  // Si es estrella y la oferta es baja, no vender
  if (isStarPlayer(player.OVR) && offerAmount < valuation.idealValue) {
    return false;
  }
  
  // Si la oferta está por debajo del mínimo, no vender
  if (offerAmount < valuation.minAcceptable) {
    return false;
  }
  
  // Según agresividad del club
  if (strategy.transferAggressiveness > 80) {
    // Clubes agresivos venden más fácil
    return offerAmount >= valuation.expectedValue;
  } else if (strategy.transferAggressiveness > 50) {
    // Clubes normales
    return offerAmount >= (valuation.expectedValue + valuation.idealValue) / 2;
  } else {
    // Clubes conservadores
    return offerAmount >= valuation.idealValue;
  }
}

// ============================================================================
// CALCULO DE PUNTUACIONES
// ============================================================================

/**
 * Calcula la puntuación por necesidad
 * @param player - Jugador
 * @param need - Necesidad
 * @returns Puntuación (0-100)
 */
function calculateNeedScore(player: any, need: SquadNeed): number {
  let score = 50;
  
  // Si cumple con el rango de edad
  if (player.Age >= need.targetAge.min && player.Age <= need.targetAge.max) {
    score += 30;
  } else if (player.Age < need.targetAge.min + 2 || player.Age > need.targetAge.max - 2) {
    score -= 10;
  }
  
  // Si cumple con el rango de valoración
  if (player.OVR >= need.targetRating.min && player.OVR <= need.targetRating.max) {
    score += 20;
  } else if (player.OVR > need.targetRating.max) {
    score += 10; // Sobrecualificado es bueno
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calcula la puntuación por edad
 * @param playerAge - Edad del jugador
 * @param targetAge - Rango de edad objetivo
 * @returns Puntuación (0-100)
 */
function calculateAgeScore(playerAge: number, targetAge: { min: number; max: number }): number {
  if (playerAge >= targetAge.min && playerAge <= targetAge.max) {
    return 100;
  }
  
  const diff = Math.min(
    Math.abs(playerAge - targetAge.min),
    Math.abs(playerAge - targetAge.max)
  );
  
  return Math.max(0, 100 - diff * 10);
}

/**
 * Calcula la puntuación por potencial
 * @param rating - Valoración actual
 * @param age - Edad
 * @returns Puntuación (0-100)
 */
function calculatePotentialScore(rating: number, age: number): number {
  // Jóvenes con alta valoración tienen más potencial
  if (age <= 22) {
    return rating * 1.2;
  } else if (age <= 25) {
    return rating * 1.0;
  } else if (age <= 28) {
    return rating * 0.8;
  } else {
    return rating * 0.5;
  }
}

/**
 * Calcula la puntuación por precio
 * @param price - Precio del jugador
 * @param maxBudget - Presupuesto máximo
 * @param budgetState - Estado del presupuesto
 * @returns Puntuación (0-100)
 */
function calculatePriceScore(price: number, maxBudget: number, budgetState: any): number {
  if (price > maxBudget) {
    return 0;
  }
  
  const ratio = price / maxBudget;
  
  // Mejor puntuación si usa 50-70% del presupuesto
  if (ratio >= 0.5 && ratio <= 0.7) {
    return 100;
  } else if (ratio < 0.5) {
    // Demasiado barato puede ser sospechoso
    return 80;
  } else {
    // Cerca del límite
    return Math.max(0, 100 - (ratio - 0.7) * 200);
  }
}

/**
 * Calcula la puntuación por salario
 * @param wage - Salario semanal
 * @param budgetState - Estado del presupuesto
 * @returns Puntuación (0-100)
 */
function calculateWageScore(wage: number, budgetState: any): number {
  const maxWage = calculateMaxWeeklyWage(budgetState);
  
  if (wage > maxWage) {
    return 0;
  }
  
  const ratio = wage / maxWage;
  return Math.max(0, 100 - ratio * 50);
}

/**
 * Calcula la puntuación por prestigio
 * @param rating - Valoración del jugador
 * @param strategy - Estrategia del club
 * @returns Puntuación (0-100)
 */
function calculatePrestigeScore(rating: number, strategy: any): number {
  // Clubes ambiciosos valoran más jugadores de alto nivel
  if (strategy.ambitionLevel > 80 && rating >= 85) {
    return 100;
  }
  
  if (strategy.ambitionLevel > 60 && rating >= 80) {
    return 80;
  }
  
  // Clubes conservadores prefieren valoraciones más moderadas
  if (strategy.ambitionLevel < 50 && rating >= 85) {
    return 50; // Demasiado caro
  }
  
  return rating;
}

/**
 * Calcula el salario máximo semanal
 * @param budgetState - Estado del presupuesto
 * @returns Salario máximo
 */
function calculateMaxWeeklyWage(budgetState: any): number {
  // Esto debería venir de BudgetManager
  return budgetState.maxWageBill - budgetState.weeklyWageBill;
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Mezcla un array aleatoriamente (Fisher-Yates)
 * @param array - Array a mezclar
 * @returns Array mezclado
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Limpia la caché de candidatos
 */
export function clearCandidateCache(): void {
  candidateCache.clear();
}

/**
 * Filtra candidatos por posición
 * @param candidates - Lista de candidatos
 * @param position - Posición a filtrar
 * @returns Candidatos filtrados
 */
export function filterCandidatesByPosition(
  candidates: CandidateScore[],
  position: string
): CandidateScore[] {
  // Esto requeriría acceso a los datos de posición del jugador
  // Por ahora retornamos todos
  return candidates;
}

/**
 * Ordena candidatos por puntuación total
 * @param candidates - Lista de candidatos
 * @returns Candidatos ordenados
 */
export function sortCandidatesByScore(candidates: CandidateScore[]): CandidateScore[] {
  return [...candidates].sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Obtiene los mejores N candidatos
 * @param candidates - Lista de candidatos
 * @param n - Número a obtener
 * @returns Mejores N candidatos
 */
export function getTopNCandidates(candidates: CandidateScore[], n: number): CandidateScore[] {
  return sortCandidatesByScore(candidates).slice(0, n);
}

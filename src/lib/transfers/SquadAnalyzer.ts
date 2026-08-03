/**
 * SquadAnalyzer - Análisis de necesidades de plantilla
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { 
  SquadAnalysis, 
  SquadNeed, 
  NeedPriority,
} from './types';
import type { Position } from '@/data/players';
import { 
  IDEAL_SQUAD_COMPOSITION,
  MIN_SQUAD_COMPOSITION,
  IDEAL_AGE_BY_POSITION,
  MAX_AVERAGE_AGE,
  YOUTH_PERCENTAGE_IDEAL,
} from './constants';
import { mapEaPosition } from '@/store/playersStore';

// ============================================================================
// CACHE DE ANÁLISIS
// ============================================================================

const analysisCache = new Map<string, SquadAnalysis>();
const CACHE_DURATION_MS = 300000; // 5 minutos

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Analiza la plantilla de un club y detecta necesidades
 * @param clubId - ID del club
 * @param players - Jugadores del club
 * @param transferList - Lista de transferencia (IDs)
 * @param loanList - Lista de cesión (IDs)
 * @returns Análisis completo de la plantilla
 */
export function analyzeSquad(
  clubId: string,
  players: any[],
  transferList: Set<string> = new Set(),
  loanList: Set<string> = new Set()
): SquadAnalysis {
  // Verificar caché
  const cached = analysisCache.get(clubId);
  if (cached && Date.now() - (cached as any).cacheTime < CACHE_DURATION_MS) {
    return cached;
  }

  // Agrupar jugadores por posición
  const byPosition = groupByPosition(players);
  
  // Calcular estadísticas de edad
  const ageStats = calculateAgeStats(players);
  
  // Calcular valoración media
  const averageRating = calculateAverageRating(players);
  
  // Detectar necesidades
  const needs = detectNeeds(clubId, byPosition, players, ageStats);
  
  const analysis: SquadAnalysis = {
    clubId,
    needs,
    averageAge: ageStats.averageAge,
    startingElevenAge: ageStats.startingElevenAge,
    substitutesAge: ageStats.substitutesAge,
    averageRating,
    transferList: Array.from(transferList),
    loanList: Array.from(loanList),
  };
  
  // Guardar en caché
  (analysis as any).cacheTime = Date.now();
  analysisCache.set(clubId, analysis);
  
  return analysis;
}

/**
 * Limpia la caché de análisis
 */
export function clearAnalysisCache(): void {
  analysisCache.clear();
}

/**
 * Limpia la caché de un club específico
 * @param clubId - ID del club
 */
export function clearClubAnalysisCache(clubId: string): void {
  analysisCache.delete(clubId);
}

// ============================================================================
// AGRUPACIÓN POR POSICIÓN
// ============================================================================

/**
 * Agrupa jugadores por posición
 * @param players - Lista de jugadores
 * @returns Mapa de posición a lista de jugadores
 */
function groupByPosition(players: any[]): Map<Position, any[]> {
  const groups = new Map<Position, any[]>();
  
  for (const player of players) {
    const position = mapEaPosition(player.Position);
    if (!groups.has(position)) {
      groups.set(position, []);
    }
    groups.get(position)!.push(player);
  }
  
  return groups;
}

// ============================================================================
// ESTADÍSTICAS DE EDAD
// ============================================================================

/**
 * Calcula estadísticas de edad de la plantilla
 * @param players - Lista de jugadores
 * @returns Estadísticas de edad
 */
function calculateAgeStats(players: any[]): {
  averageAge: number;
  startingElevenAge: number;
  substitutesAge: number;
} {
  if (players.length === 0) {
    return { averageAge: 0, startingElevenAge: 0, substitutesAge: 0 };
  }
  
  // Edad media total
  const totalAge = players.reduce((sum, p) => sum + p.Age, 0);
  const averageAge = totalAge / players.length;
  
  // Edad media del once titular (primeros 11 por valoración)
  const sortedByRating = [...players].sort((a, b) => b.OVR - a.OVR);
  const startingEleven = sortedByRating.slice(0, 11);
  const startingElevenAge = startingEleven.reduce((sum, p) => sum + p.Age, 0) / startingEleven.length;
  
  // Edad media de suplentes
  const substitutes = sortedByRating.slice(11);
  const substitutesAge = substitutes.length > 0
    ? substitutes.reduce((sum, p) => sum + p.Age, 0) / substitutes.length
    : 0;
  
  return { averageAge, startingElevenAge, substitutesAge };
}

/**
 * Calcula la valoración media de la plantilla
 * @param players - Lista de jugadores
 * @returns Valoración media
 */
function calculateAverageRating(players: any[]): number {
  if (players.length === 0) return 0;
  
  const totalRating = players.reduce((sum, p) => sum + p.OVR, 0);
  return totalRating / players.length;
}

// ============================================================================
// DETECCIÓN DE NECESIDADES
// ============================================================================

/**
 * Detecta necesidades de la plantilla
 * @param clubId - ID del club
 * @param byPosition - Jugadores agrupados por posición
 * @param players - Lista completa de jugadores
 * @param ageStats - Estadísticas de edad
 * @returns Lista de necesidades
 */
function detectNeeds(
  clubId: string,
  byPosition: Map<Position, any[]>,
  players: any[],
  ageStats: { averageAge: number }
): SquadNeed[] {
  const needs: SquadNeed[] = [];
  
  // Analizar cada posición
  const positions: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
  
  for (const position of positions) {
    const positionPlayers = byPosition.get(position) || [];
    const count = positionPlayers.length;
    const ideal = IDEAL_SQUAD_COMPOSITION[position as keyof typeof IDEAL_SQUAD_COMPOSITION];
    const min = MIN_SQUAD_COMPOSITION[position as keyof typeof MIN_SQUAD_COMPOSITION];
    
    // Necesidad por cantidad
    if (count < min) {
      needs.push(createQuantityNeed(position, count, min, ideal, 'critical'));
    } else if (count < ideal) {
      needs.push(createQuantityNeed(position, count, min, ideal, 'high'));
    } else if (count > ideal + 2) {
      needs.push(createExcessNeed(position, count, ideal));
    }
    
    // Necesidad por edad
    const ageNeed = detectAgeNeed(position, positionPlayers);
    if (ageNeed) {
      needs.push(ageNeed);
    }
    
    // Necesidad por calidad
    const qualityNeed = detectQualityNeed(position, positionPlayers);
    if (qualityNeed) {
      needs.push(qualityNeed);
    }
  }
  
  // Necesidad general por edad media
  if (ageStats.averageAge > MAX_AVERAGE_AGE) {
    needs.push({
      position: 'MID', // Genérico
      priority: 'medium',
      targetAge: { min: 18, max: 24 },
      targetRating: { min: 70, max: 85 },
      maxBudget: 50_000_000,
      currentCount: players.length,
      idealCount: players.length,
      reason: `Plantilla envejecida (edad media: ${ageStats.averageAge.toFixed(1)})`,
    });
  }
  
  // Necesidad por falta de jóvenes
  const youthCount = players.filter(p => p.Age <= 22).length;
  const youthPercentage = youthCount / players.length;
  if (youthPercentage < YOUTH_PERCENTAGE_IDEAL) {
    needs.push({
      position: 'MID', // Genérico
      priority: 'low',
      targetAge: { min: 18, max: 22 },
      targetRating: { min: 70, max: 80 },
      maxBudget: 30_000_000,
      currentCount: youthCount,
      idealCount: Math.round(players.length * YOUTH_PERCENTAGE_IDEAL),
      reason: `Falta de jóvenes (${(youthPercentage * 100).toFixed(0)}% vs ideal ${(YOUTH_PERCENTAGE_IDEAL * 100).toFixed(0)}%)`,
    });
  }
  
  return needs;
}

/**
 * Crea una necesidad por cantidad insuficiente
 * @param position - Posición
 * @param current - Cantidad actual
 * @param min - Mínimo requerido
 * @param ideal - Cantidad ideal
 * @param priority - Prioridad
 * @returns Necesidad creada
 */
function createQuantityNeed(
  position: Position,
  current: number,
  min: number,
  ideal: number,
  priority: NeedPriority
): SquadNeed {
  const idealAge = IDEAL_AGE_BY_POSITION[position as keyof typeof IDEAL_AGE_BY_POSITION];
  
  return {
    position,
    priority,
    targetAge: idealAge,
    targetRating: { min: 70, max: 85 },
    maxBudget: 40_000_000,
    currentCount: current,
    idealCount: ideal,
    reason: `Faltan jugadores (${current}/${ideal} ideal, ${min} mínimo)`,
  };
}

/**
 * Crea una necesidad por exceso de jugadores
 * @param position - Posición
 * @param current - Cantidad actual
 * @param ideal - Cantidad ideal
 * @returns Necesidad creada
 */
function createExcessNeed(
  position: Position,
  current: number,
  ideal: number
): SquadNeed {
  return {
    position,
    priority: 'low',
    targetAge: { min: 18, max: 30 },
    targetRating: { min: 0, max: 100 },
    maxBudget: 0,
    currentCount: current,
    idealCount: ideal,
    reason: `Exceso de jugadores (${current}/${ideal} ideal)`,
  };
}

/**
 * Detecta necesidad por edad en una posición
 * @param position - Posición
 * @param players - Jugadores en esa posición
 * @returns Necesidad o null
 */
function detectAgeNeed(position: Position, players: any[]): SquadNeed | null {
  if (players.length === 0) return null;
  
  const idealAge = IDEAL_AGE_BY_POSITION[position as keyof typeof IDEAL_AGE_BY_POSITION];
  const avgAge = players.reduce((sum, p) => sum + p.Age, 0) / players.length;
  
  // Si la media está por encima del rango ideal
  if (avgAge > idealAge.max) {
    return {
      position,
      priority: 'medium',
      targetAge: { min: idealAge.min, max: idealAge.max - 2 },
      targetRating: { min: 70, max: 85 },
      maxBudget: 35_000_000,
      currentCount: players.length,
      idealCount: players.length,
      reason: `Plantilla envejecida en ${position} (edad media: ${avgAge.toFixed(1)})`,
    };
  }
  
  // Si la media está por debajo del rango ideal
  if (avgAge < idealAge.min) {
    return {
      position,
      priority: 'low',
      targetAge: { min: idealAge.min + 2, max: idealAge.max },
      targetRating: { min: 75, max: 90 },
      maxBudget: 50_000_000,
      currentCount: players.length,
      idealCount: players.length,
      reason: `Plantilla demasiado joven en ${position} (edad media: ${avgAge.toFixed(1)})`,
    };
  }
  
  return null;
}

/**
 * Detecta necesidad por calidad en una posición
 * @param position - Posición
 * @param players - Jugadores en esa posición
 * @returns Necesidad o null
 */
function detectQualityNeed(position: Position, players: any[]): SquadNeed | null {
  if (players.length < 2) return null;
  
  // Calcular valoración media
  const avgRating = players.reduce((sum, p) => sum + p.OVR, 0) / players.length;
  
  // Si la calidad es muy baja
  if (avgRating < 72) {
    return {
      position,
      priority: 'high',
      targetAge: { min: 22, max: 28 },
      targetRating: { min: 75, max: 85 },
      maxBudget: 45_000_000,
      currentCount: players.length,
      idealCount: players.length,
      reason: `Calidad insuficiente en ${position} (media: ${avgRating.toFixed(1)})`,
    };
  }
  
  // Si no hay jugadores de alto nivel
  const topPlayers = players.filter(p => p.OVR >= 80);
  if (topPlayers.length === 0 && players.length >= 3) {
    return {
      position,
      priority: 'medium',
      targetAge: { min: 24, max: 30 },
      targetRating: { min: 80, max: 88 },
      maxBudget: 60_000_000,
      currentCount: players.length,
      idealCount: players.length,
      reason: `Falta calidad elite en ${position}`,
    };
  }
  
  return null;
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Obtiene las necesidades críticas de un club
 * @param analysis - Análisis de plantilla
 * @returns Necesidades críticas
 */
export function getCriticalNeeds(analysis: SquadAnalysis): SquadNeed[] {
  return analysis.needs.filter(n => n.priority === 'critical');
}

/**
 * Obtiene las necesidades de alta prioridad
 * @param analysis - Análisis de plantilla
 * @returns Necesidades de alta prioridad
 */
export function getHighPriorityNeeds(analysis: SquadAnalysis): SquadNeed[] {
  return analysis.needs.filter(n => n.priority === 'critical' || n.priority === 'high');
}

/**
 * Ordena necesidades por prioridad
 * @param needs - Lista de necesidades
 * @returns Necesidades ordenadas
 */
export function sortNeedsByPriority(needs: SquadNeed[]): SquadNeed[] {
  const priorityOrder: Record<NeedPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  
  return [...needs].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Filtra necesidades por posición
 * @param needs - Lista de necesidades
 * @param position - Posición a filtrar
 * @returns Necesidades filtradas
 */
export function filterNeedsByPosition(needs: SquadNeed[], position: Position): SquadNeed[] {
  return needs.filter(n => n.position === position);
}

/**
 * Calcula la profundidad de una posición
 * @param players - Jugadores en esa posición
 * @returns Profundidad (cantidad de jugadores con valoración >= 75)
 */
export function calculatePositionDepth(players: any[]): number {
  return players.filter(p => p.OVR >= 75).length;
}

/**
 * Identifica jugadores transferibles
 * @param players - Lista de jugadores
 * @param analysis - Análisis de plantilla
 * @returns IDs de jugadores transferibles
 */
export function identifyTransferablePlayers(players: any[], analysis: SquadAnalysis): string[] {
  const transferable: string[] = [];
  
  for (const player of players) {
    const position = mapEaPosition(player.Position);
    const positionNeeds = analysis.needs.filter(n => n.position === position);
    
    // Si hay exceso en esa posición
    const hasExcess = positionNeeds.some(n => n.reason.includes('Exceso'));
    
    // Si el jugador es mayor y no es estrella
    const isOldAndNotStar = player.Age >= 30 && player.OVR < 82;
    
    // Si el jugador no juega mucho (baja valoración en plantilla grande)
    const isLowRotation = player.OVR < 75 && players.length > 25;
    
    if (hasExcess || isOldAndNotStar || isLowRotation) {
      transferable.push(player.id || String(player.ID));
    }
  }
  
  return transferable;
}

/**
 * Identifica jugadores disponibles para cesión
 * @param players - Lista de jugadores
 * @returns IDs de jugadores disponibles para cesión
 */
export function identifyLoanablePlayers(players: any[]): string[] {
  const loanable: string[] = [];
  
  for (const player of players) {
    // Jóvenes que necesitan minutos
    if (player.Age <= 21 && player.OVR >= 70 && player.OVR <= 78) {
      loanable.push(player.id || String(player.ID));
    }
    
    // Jugadores que no encajan pero tienen potencial
    if (player.Age <= 23 && player.OVR < 75) {
      loanable.push(player.id || String(player.ID));
    }
  }
  
  return loanable;
}

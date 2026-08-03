/**
 * ClubStrategy - Estrategia y personalidad de clubes
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { ClubStrategy as ClubStrategyType } from './types';
import { 
  REAL_MADRID_STRATEGY,
  BRIGHTON_STRATEGY,
  SEVILLA_STRATEGY,
  MAN_CITY_STRATEGY,
  BAYERN_STRATEGY,
  GENERIC_STRATEGY_BY_CATEGORY,
  CLUB_CATEGORY_RANGES,
} from './constants';
import { TEAMS, teamById } from '@/data/teams';

// ============================================================================
// CACHE DE ESTRATEGIAS
// ============================================================================

const strategyCache = new Map<string, ClubStrategyType>();

// ============================================================================
// ESTRATEGIAS PREDEFINIDAS POR CLUB
// ============================================================================

/**
 * Clubes con estrategias personalizadas
 */
const CUSTOM_STRATEGY_CLUBS: Record<string, ClubStrategyType> = {
  'rma': REAL_MADRID_STRATEGY,
  'bar': { ...REAL_MADRID_STRATEGY, academyImportance: 70, youthPreference: 55 },
  'mci': MAN_CITY_STRATEGY,
  'mun': { ...MAN_CITY_STRATEGY, economicPower: 85, transferAggressiveness: 75 },
  'liv': { ...MAN_CITY_STRATEGY, economicPower: 82, transferAggressiveness: 70 },
  'che': { ...MAN_CITY_STRATEGY, economicPower: 88, transferAggressiveness: 80 },
  'ars': { ...MAN_CITY_STRATEGY, economicPower: 78, transferAggressiveness: 65 },
  'bri': BRIGHTON_STRATEGY,
  'bay': BAYERN_STRATEGY,
  'dor': { ...BAYERN_STRATEGY, economicPower: 88, academyImportance: 80 },
  'lev': { ...BAYERN_STRATEGY, economicPower: 75, nationalPreference: 85 },
  'sev': SEVILLA_STRATEGY,
  'atm': { ...SEVILLA_STRATEGY, economicPower: 75, transferAggressiveness: 85 },
  'val': { ...SEVILLA_STRATEGY, economicPower: 70, ambitionLevel: 80 },
  'int': { ...REAL_MADRID_STRATEGY, economicPower: 82, negotiationPatience: 75 },
  'mil': { ...REAL_MADRID_STRATEGY, economicPower: 78, transferAggressiveness: 70 },
  'juv': { ...REAL_MADRID_STRATEGY, economicPower: 80, veteranPreference: 40 },
  'psg': { ...MAN_CITY_STRATEGY, economicPower: 98, ambitionLevel: 99, transferAggressiveness: 95 },
  'oly': { ...MAN_CITY_STRATEGY, economicPower: 85, nationalPreference: 70 },
};

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Obtiene la estrategia de un club
 * @param clubId - ID del club
 * @returns Estrategia del club
 */
export function getClubStrategy(clubId: string): ClubStrategyType {
  // Verificar caché
  if (strategyCache.has(clubId)) {
    return strategyCache.get(clubId)!;
  }

  // Verificar si tiene estrategia personalizada
  if (CUSTOM_STRATEGY_CLUBS[clubId]) {
    const strategy = { ...CUSTOM_STRATEGY_CLUBS[clubId] };
    strategyCache.set(clubId, strategy);
    return strategy;
  }

  // Generar estrategia genérica basada en categoría
  const team = teamById(clubId);
  if (!team) {
    // Fallback a estrategia de club pequeño
    const strategy = { ...GENERIC_STRATEGY_BY_CATEGORY.minnow };
    strategyCache.set(clubId, strategy);
    return strategy;
  }

  const category = getClubCategory(team);
  const strategy = { ...GENERIC_STRATEGY_BY_CATEGORY[category] };
  
  // Ajustar según liga (ligas top tienen más prestigio)
  adjustStrategyForLeague(strategy, team.league);
  
  strategyCache.set(clubId, strategy);
  return strategy;
}

/**
 * Genera estrategia para todos los clubes
 * @returns Mapa de clubId a estrategia
 */
export function generateAllStrategies(): Map<string, ClubStrategyType> {
  const strategies = new Map<string, ClubStrategyType>();
  
  for (const team of TEAMS) {
    strategies.set(team.id, getClubStrategy(team.id));
  }
  
  return strategies;
}

/**
 * Limpia la caché de estrategias
 */
export function clearStrategyCache(): void {
  strategyCache.clear();
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Determina la categoría de un club según su valoración media
 * @param team - Equipo
 * @returns Categoría del club
 */
function getClubCategory(team: { att: number; mid: number; def: number }): keyof typeof CLUB_CATEGORY_RANGES {
  const avgRating = (team.att + team.mid + team.def) / 3;
  
  if (avgRating >= CLUB_CATEGORY_RANGES.elite.min && avgRating <= CLUB_CATEGORY_RANGES.elite.max) {
    return 'elite';
  }
  if (avgRating >= CLUB_CATEGORY_RANGES.big.min && avgRating <= CLUB_CATEGORY_RANGES.big.max) {
    return 'big';
  }
  if (avgRating >= CLUB_CATEGORY_RANGES.mid.min && avgRating <= CLUB_CATEGORY_RANGES.mid.max) {
    return 'mid';
  }
  if (avgRating >= CLUB_CATEGORY_RANGES.small.min && avgRating <= CLUB_CATEGORY_RANGES.small.max) {
    return 'small';
  }
  return 'minnow';
}

/**
 * Ajusta la estrategia según la liga del club
 * @param strategy - Estrategia a ajustar
 * @param leagueId - ID de la liga
 */
function adjustStrategyForLeague(strategy: ClubStrategyType, leagueId: string): void {
  // Ligas top (Premier League, La Liga, Bundesliga, Serie A, Ligue 1)
  const topLeagues = ['epl', 'laliga', 'buli', 'seriea', 'ligue1'];
  
  if (topLeagues.includes(leagueId)) {
    strategy.reputation = Math.min(100, strategy.reputation + 10);
    strategy.economicPower = Math.min(100, strategy.economicPower + 5);
  }
  
  // Ligas secundarias (Eredivisie, Primeira Liga, etc.)
  const secondaryLeagues = ['eredivisie', 'primeiraliga', 'scottish'];
  
  if (secondaryLeagues.includes(leagueId)) {
    strategy.reputation = Math.max(0, strategy.reputation - 5);
    strategy.leaguePreference = Math.min(100, strategy.leaguePreference + 15);
  }
}

// ============================================================================
// DECISIONES DE ESTRATEGIA
// ============================================================================

/**
 * Determina si un club debe buscar fichajes
 * @param clubId - ID del club
 * @param currentBudget - Presupuesto actual
 * @param needs - Necesidades de plantilla
 * @returns Si debe buscar fichajes
 */
export function shouldSeekTransfers(
  clubId: string,
  currentBudget: number,
  needs: any[]
): boolean {
  const strategy = getClubStrategy(clubId);
  
  // Si no hay presupuesto, no buscar
  if (currentBudget < 5_000_000) { // 5M mínimo
    return false;
  }
  
  // Si hay necesidades críticas, buscar siempre
  const hasCriticalNeeds = needs.some(n => n.priority === 'critical');
  if (hasCriticalNeeds) {
    return true;
  }
  
  // Según agresividad y necesidades
  const hasHighNeeds = needs.some(n => n.priority === 'high');
  
  if (strategy.transferAggressiveness > 80) {
    return hasHighNeeds || needs.length > 0;
  }
  
  if (strategy.transferAggressiveness > 60) {
    return hasHighNeeds;
  }
  
  return false;
}

/**
 * Determina si un club debe vender jugadores
 * @param clubId - ID del club
 * @param currentBudget - Presupuesto actual
 * @param transferListSize - Tamaño de la lista de transferencia
 * @returns Si debe vender
 */
export function shouldSellPlayers(
  clubId: string,
  currentBudget: number,
  transferListSize: number
): boolean {
  const strategy = getClubStrategy(clubId);
  
  // Si el presupuesto es muy bajo, vender
  if (currentBudget < 10_000_000) {
    return true;
  }
  
  // Si hay jugadores en lista de transferencia
  if (transferListSize > 0) {
    return true;
  }
  
  // Clubes con baja agresividad venden más para equilibrar
  if (strategy.transferAggressiveness < 50 && currentBudget < 30_000_000) {
    return true;
  }
  
  return false;
}

/**
 * Calcula el presupuesto máximo para un fichaje
 * @param clubId - ID del club
 * @param totalBudget - Presupuesto total
 * @param playerImportance - Importancia del jugador (0-100)
 * @returns Presupuesto máximo
 */
export function calculateMaxTransferSpend(
  clubId: string,
  totalBudget: number,
  playerImportance: number
): number {
  const strategy = getClubStrategy(clubId);
  
  // Porcentaje base según agresividad
  let spendPercentage = strategy.transferAggressiveness / 100;
  
  // Ajustar por importancia del jugador
  spendPercentage *= (0.5 + (playerImportance / 200));
  
  // Ajustar por poder económico
  if (strategy.economicPower > 80) {
    spendPercentage *= 1.2;
  } else if (strategy.economicPower < 50) {
    spendPercentage *= 0.8;
  }
  
  return Math.round(totalBudget * spendPercentage);
}

/**
 * Calcula el precio mínimo aceptable para vender
 * @param clubId - ID del club
 * @param baseValue - Valor base del jugador
 * @returns Precio mínimo aceptable
 */
export function calculateMinSalePrice(
  clubId: string,
  baseValue: number
): number {
  const strategy = getClubStrategy(clubId);
  
  // Clubes con alta reputación no venden barato
  let multiplier = 1.1;
  
  if (strategy.reputation > 85) {
    multiplier = 1.25;
  } else if (strategy.reputation > 70) {
    multiplier = 1.15;
  } else if (strategy.reputation < 50) {
    multiplier = 1.0;
  }
  
  // Clubes con baja paciencia aceptan menos
  if (strategy.negotiationPatience < 50) {
    multiplier *= 0.9;
  }
  
  return Math.round(baseValue * multiplier);
}

/**
 * Determina si un club está interesado en un jugador
 * @param clubId - ID del club
 * @param playerAge - Edad del jugador
 * @param playerRating - Valoración del jugador
 * @param playerNationality - Nacionalidad del jugador
 * @param playerLeague - Liga del jugador
 * @returns Puntuación de interés (0-100)
 */
export function calculateInterestScore(
  clubId: string,
  playerAge: number,
  playerRating: number,
  playerNationality: string,
  playerLeague: string
): number {
  const strategy = getClubStrategy(clubId);
  const team = teamById(clubId);
  
  if (!team) return 0;
  
  let score = 50;
  
  // Preferencia por jóvenes
  if (playerAge <= 22) {
    score += strategy.youthPreference * 0.3;
  } else if (playerAge >= 32) {
    score += strategy.veteranPreference * 0.3;
  }
  
  // Preferencia por liga (usamos liga como proxy de nacionalidad ya que Team no tiene country)
  if (playerLeague === team.league) {
    score += strategy.leaguePreference * 0.15;
  }
  
  // Valoración del jugador
  if (playerRating >= 85) {
    // Clubes de alto prestigio prefieren estrellas
    if (strategy.reputation > 80) {
      score += 20;
    } else {
      score -= 10; // Clubes pequeños evitan estrellas muy caras
    }
  }
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Determina si un club aceptará una contraoferta
 * @param clubId - ID del club
 * @param currentOffer - Oferta actual
 * @param targetPrice - Precio objetivo
 * @returns Si aceptará contraoferta
 */
export function willAcceptCounterOffer(
  clubId: string,
  currentOffer: number,
  targetPrice: number
): boolean {
  const strategy = getClubStrategy(clubId);
  
  const ratio = currentOffer / targetPrice;
  
  // Si la oferta está cerca del objetivo, aceptar
  if (ratio >= 0.9) {
    return true;
  }
  
  // Si la oferta es razonable y el club tiene poca paciencia, aceptar
  if (ratio >= 0.75 && strategy.negotiationPatience < 50) {
    return true;
  }
  
  // Si el club es agresivo, puede aceptar menos
  if (ratio >= 0.7 && strategy.transferAggressiveness > 80) {
    return true;
  }
  
  return false;
}

// ============================================================================
// EXPORTAR PARA COMPATIBILIDAD
// ============================================================================

export { ClubStrategyType as ClubStrategy };

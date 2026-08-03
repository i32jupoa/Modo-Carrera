/**
 * PlayerDecision - Personalidad y decisiones de jugadores
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { 
  PlayerPersonality, 
  PersonalityType,
  TransferResult 
} from './types';
import { 
  PERSONALITY_RANGES,
  PLAYER_DECISION_FACTORS,
  MIN_SALARY_MULTIPLIER,
} from './constants';

// ============================================================================
// CACHE DE PERSONALIDADES
// ============================================================================

const personalityCache = new Map<string, PlayerPersonality>();

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Genera la personalidad de un jugador
 * @param playerId - ID del jugador
 * @param age - Edad del jugador
 * @param rating - Valoración del jugador
 * @returns Personalidad generada
 */
export function generatePlayerPersonality(
  playerId: string,
  age: number,
  rating: number
): PlayerPersonality {
  // Verificar caché
  if (personalityCache.has(playerId)) {
    return personalityCache.get(playerId)!;
  }
  
  // Generar valores aleatorios con sesgos según edad y valoración
  const personality: PlayerPersonality = {
    ambition: generateAmbition(age, rating),
    loyalty: generateLoyalty(age, rating),
    moneyMotivated: generateMoneyMotivation(age, rating),
    playingTimeImportance: generatePlayingTimeImportance(age, rating),
    trophyMotivated: generateTrophyMotivation(age, rating),
    age,
    personalityType: determinePersonalityType(age, rating),
  };
  
  // Guardar en caché
  personalityCache.set(playerId, personality);
  
  return personality;
}

/**
 * Decide si un jugador acepta una oferta de transferencia
 * @param personality - Personalidad del jugador
 * @param currentClub - Club actual
 * @param targetClub - Club objetivo
 * @param currentWage - Salario actual semanal
 * @param offeredWage - Salario ofrecido semanal
 * @param currentPlayingTime - Minutos jugados actualmente (0-100)
 * @param promisedPlayingTime - Minutos prometidos (0-100)
 * @param targetClubInChampions - Si el club objetivo juega Champions
 * @param currentClubInChampions - Si el club actual juega Champions
 * @returns Resultado de la decisión
 */
export function decideOnTransferOffer(
  personality: PlayerPersonality,
  currentClub: string,
  targetClub: string,
  currentWage: number,
  offeredWage: number,
  currentPlayingTime: number,
  promisedPlayingTime: number,
  targetClubInChampions: boolean,
  currentClubInChampions: boolean
): TransferResult {
  // Calcular puntuación de la oferta
  const score = calculateOfferScore(
    personality,
    currentWage,
    offeredWage,
    currentPlayingTime,
    promisedPlayingTime,
    targetClubInChampions,
    currentClubInChampions
  );
  
  // Umbral de aceptación según personalidad
  const threshold = getAcceptanceThreshold(personality);
  
  if (score >= threshold) {
    return {
      success: true,
      message: generateAcceptanceMessage(personality, score),
      data: { score },
    };
  }
  
  return {
    success: false,
    message: generateRejectionMessage(personality, score),
    data: { score },
  };
}

/**
 * Calcula el salario mínimo que un jugador aceptaría
 * @param personality - Personalidad del jugador
 * @param currentWage - Salario actual
 * @returns Salario mínimo aceptable
 */
export function calculateMinimumAcceptableWage(
  personality: PlayerPersonality,
  currentWage: number
): number {
  let multiplier = MIN_SALARY_MULTIPLIER;
  
  // Jugadores motivados por dinero exigen más
  if (personality.moneyMotivated > PERSONALITY_RANGES.very_high) {
    multiplier = 1.5;
  } else if (personality.moneyMotivated > PERSONALITY_RANGES.high) {
    multiplier = 1.3;
  }
  
  // Jugadores leales pueden aceptar menos
  if (personality.loyalty > PERSONALITY_RANGES.very_high) {
    multiplier *= 0.9;
  }
  
  return Math.round(currentWage * multiplier);
}

/**
 * Determina si un jugador quiere salir de su club actual
 * @param personality - Personalidad del jugador
 * @param currentPlayingTime - Minutos jugados actualmente (0-100)
 * @param clubPerformance - Rendimiento del club (0-100)
 * @returns Si quiere salir
 */
export function wantsToLeaveClub(
  personality: PlayerPersonality,
  currentPlayingTime: number,
  clubPerformance: number
): boolean {
  // Si no juega suficiente
  if (currentPlayingTime < 30 && personality.playingTimeImportance > PERSONALITY_RANGES.high) {
    return true;
  }
  
  // Si el club rinde mal y el jugador es ambicioso
  if (clubPerformance < 50 && personality.ambition > PERSONALITY_RANGES.high) {
    return true;
  }
  
  // Si el jugador está motivado por títulos y el club no compite
  if (personality.trophyMotivated > PERSONALITY_RANGES.high && clubPerformance < 60) {
    return true;
  }
  
  return false;
}

// ============================================================================
// GENERACIÓN DE PERSONALIDAD
// ============================================================================

/**
 * Genera el nivel de ambición de un jugador
 * @param age - Edad del jugador
 * @param rating - Valoración del jugador
 * @returns Nivel de ambición (0-100)
 */
function generateAmbition(age: number, rating: number): number {
  let base = 50;
  
  // Jugadores jóvenes son más ambiciosos
  if (age <= 25) {
    base += 20;
  } else if (age >= 32) {
    base -= 10;
  }
  
  // Jugadores de alto nivel son más ambiciosos
  if (rating >= 85) {
    base += 25;
  } else if (rating >= 78) {
    base += 10;
  } else if (rating < 70) {
    base -= 10;
  }
  
  // Añadir variación aleatoria
  base += (Math.random() - 0.5) * 20;
  
  return Math.max(0, Math.min(100, Math.round(base)));
}

/**
 * Genera el nivel de lealtad de un jugador
 * @param age - Edad del jugador
 * @param rating - Valoración del jugador
 * @returns Nivel de lealtad (0-100)
 */
function generateLoyalty(age: number, rating: number): number {
  let base = 50;
  
  // Jugadores mayores son más leales
  if (age >= 30) {
    base += 20;
  } else if (age <= 22) {
    base -= 15;
  }
  
  // Jugadores de nivel medio son más leales
  if (rating >= 75 && rating <= 82) {
    base += 10;
  }
  
  // Añadir variación aleatoria
  base += (Math.random() - 0.5) * 30;
  
  return Math.max(0, Math.min(100, Math.round(base)));
}

/**
 * Genera la motivación por dinero de un jugador
 * @param age - Edad del jugador
 * @param rating - Valoración del jugador
 * @returns Nivel de motivación por dinero (0-100)
 */
function generateMoneyMotivation(age: number, rating: number): number {
  let base = 40;
  
  // Jugadores en edad de ganar dinero (25-30)
  if (age >= 25 && age <= 30) {
    base += 20;
  }
  
  // Jugadores de alto nivel buscan más dinero
  if (rating >= 85) {
    base += 15;
  }
  
  // Añadir variación aleatoria
  base += (Math.random() - 0.5) * 40;
  
  return Math.max(0, Math.min(100, Math.round(base)));
}

/**
 * Genera la importancia de jugar minutos
 * @param age - Edad del jugador
 * @param rating - Valoración del jugador
 * @returns Importancia de jugar minutos (0-100)
 */
function generatePlayingTimeImportance(age: number, rating: number): number {
  let base = 60;
  
  // Jugadores jóvenes necesitan minutos
  if (age <= 23) {
    base += 25;
  } else if (age >= 32) {
    base -= 15;
  }
  
  // Jugadores de alto nivel quieren jugar
  if (rating >= 82) {
    base += 10;
  }
  
  // Añadir variación aleatoria
  base += (Math.random() - 0.5) * 25;
  
  return Math.max(0, Math.min(100, Math.round(base)));
}

/**
 * Genera la motivación por ganar títulos
 * @param age - Edad del jugador
 * @param rating - Valoración del jugador
 * @returns Motivación por títulos (0-100)
 */
function generateTrophyMotivation(age: number, rating: number): number {
  let base = 50;
  
  // Jugadores en su mejor momento quieren títulos
  if (age >= 24 && age <= 30) {
    base += 20;
  }
  
  // Jugadores de alto nivel quieren títulos
  if (rating >= 85) {
    base += 30;
  } else if (rating >= 78) {
    base += 15;
  }
  
  // Añadir variación aleatoria
  base += (Math.random() - 0.5) * 30;
  
  return Math.max(0, Math.min(100, Math.round(base)));
}

/**
 * Determina el tipo de personalidad
 * @param age - Edad del jugador
 * @param rating - Valoración del jugador
 * @returns Tipo de personalidad
 */
function determinePersonalityType(age: number, rating: number): PersonalityType {
  const rand = Math.random();
  
  // Distribución basada en edad y valoración
  if (rating >= 85) {
    if (rand < 0.4) return 'leader';
    if (rand < 0.7) return 'ambitious';
    return 'professional';
  }
  
  if (age <= 22) {
    if (rand < 0.3) return 'ambitious';
    if (rand < 0.6) return 'resilient';
    return 'professional';
  }
  
  if (age >= 30) {
    if (rand < 0.3) return 'loyal';
    if (rand < 0.5) return 'professional';
    return 'resilient';
  }
  
  // Caso general
  if (rand < 0.4) return 'professional';
  if (rand < 0.6) return 'resilient';
  if (rand < 0.8) return 'ambitious';
  if (rand < 0.9) return 'loyal';
  return 'mercurial';
}

// ============================================================================
// CALCULO DE DECISIONES
// ============================================================================

/**
 * Calcula la puntuación de una oferta
 * @param personality - Personalidad del jugador
 * @param currentWage - Salario actual
 * @param offeredWage - Salario ofrecido
 * @param currentPlayingTime - Minutos actuales
 * @param promisedPlayingTime - Minutos prometidos
 * @param targetInChampions - Si el objetivo juega Champions
 * @param currentInChampions - Si el actual juega Champions
 * @returns Puntuación (0-100)
 */
function calculateOfferScore(
  personality: PlayerPersonality,
  currentWage: number,
  offeredWage: number,
  currentPlayingTime: number,
  promisedPlayingTime: number,
  targetInChampions: boolean,
  currentInChampions: boolean
): number {
  let score = 50; // Base neutral
  
  // Factor salario
  const wageRatio = offeredWage / Math.max(currentWage, 1);
  const wageScore = Math.min(100, wageRatio * 50);
  score += (wageScore - 50) * PLAYER_DECISION_FACTORS.salary;
  
  // Factor minutos
  const playingTimeDiff = promisedPlayingTime - currentPlayingTime;
  score += playingTimeDiff * PLAYER_DECISION_FACTORS.playingTime;
  
  // Factor Champions
  if (targetInChampions && !currentInChampions) {
    score += 30 * PLAYER_DECISION_FACTORS.trophies;
  } else if (!targetInChampions && currentInChampions) {
    score -= 20 * PLAYER_DECISION_FACTORS.trophies;
  }
  
  // Ajustar por personalidad
  if (personality.moneyMotivated > PERSONALITY_RANGES.high) {
    score += (wageScore - 50) * 0.3; // Más peso al dinero
  }
  
  if (personality.playingTimeImportance > PERSONALITY_RANGES.high) {
    score += playingTimeDiff * 0.3; // Más peso a minutos
  }
  
  if (personality.trophyMotivated > PERSONALITY_RANGES.high && targetInChampions) {
    score += 15; // Bonus por Champions
  }
  
  if (personality.loyalty > PERSONALITY_RANGES.high) {
    score -= 10; // Penalización por lealtad
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Obtiene el umbral de aceptación según personalidad
 * @param personality - Personalidad del jugador
 * @returns Umbral de aceptación (0-100)
 */
function getAcceptanceThreshold(personality: PlayerPersonality): number {
  let threshold = 60;
  
  // Jugadores leales exigen más
  if (personality.loyalty > PERSONALITY_RANGES.very_high) {
    threshold += 20;
  } else if (personality.loyalty > PERSONALITY_RANGES.high) {
    threshold += 10;
  }
  
  // Jugadores motivados por dinero aceptan más fácil
  if (personality.moneyMotivated > PERSONALITY_RANGES.very_high) {
    threshold -= 15;
  } else if (personality.moneyMotivated > PERSONALITY_RANGES.high) {
    threshold -= 10;
  }
  
  // Jugadores que necesitan minutos aceptan más fácil
  if (personality.playingTimeImportance > PERSONALITY_RANGES.very_high) {
    threshold -= 10;
  }
  
  return Math.max(30, Math.min(90, threshold));
}

/**
 * Genera un mensaje de aceptación
 * @param personality - Personalidad del jugador
 * @param score - Puntuación de la oferta
 * @returns Mensaje de aceptación
 */
function generateAcceptanceMessage(personality: PlayerPersonality, score: number): string {
  const messages: Record<PersonalityType, string[]> = {
    professional: [
      "La oferta es profesionalmente atractiva",
      "Es un buen paso para mi carrera",
      "El proyecto me convence",
    ],
    leader: [
      "Puedo liderar este proyecto",
      "Es un reto que acepto",
      "El club tiene ambición",
    ],
    mercurial: [
      "Me siento inspirado por este cambio",
      "Es momento de un nuevo desafío",
      "La oportunidad es tentadora",
    ],
    resilient: [
      "Trabajaré duro en este nuevo club",
      "Es una oportunidad para crecer",
      "Acepto el desafío",
    ],
    ambitious: [
      "Este club me ayudará a alcanzar mis objetivos",
      "Es el paso que necesito para triunfar",
      "El proyecto es ambicioso",
    ],
    loyal: [
      "Es difícil dejar mi club, pero esta oferta es única",
      "Agradezco la oportunidad",
      "Es un cambio necesario para mi desarrollo",
    ],
    money_driven: [
      "Las condiciones económicas son excelentes",
      "La oferta es irrechazable",
      "Es una gran oportunidad financiera",
    ],
  };
  
  const typeMessages = messages[personality.personalityType];
  return typeMessages[Math.floor(Math.random() * typeMessages.length)];
}

/**
 * Genera un mensaje de rechazo
 * @param personality - Personalidad del jugador
 * @param score - Puntuación de la oferta
 * @returns Mensaje de rechazo
 */
function generateRejectionMessage(personality: PlayerPersonality, score: number): string {
  const messages: Record<PersonalityType, string[]> = {
    professional: [
      "La oferta no se ajusta a mis expectativas profesionales",
      "Prefiero continuar en mi actual situación",
      "No es el momento de cambiar",
    ],
    leader: [
      "Mi rol actual es más importante",
      "No veo liderazgo en este proyecto",
      "Prefiero quedarme donde soy valorado",
    ],
    mercurial: [
      "No me siente inspirado por esta oferta",
      "Prefiero esperar una mejor oportunidad",
      "No es el cambio que busco",
    ],
    resilient: [
      "Me quedo a luchar por mi lugar",
      "Prefiero superar la situación actual",
      "No es el momento de rendirse",
    ],
    ambitious: [
      "Este proyecto no es suficientemente ambicioso",
      "Prefiero esperar una oportunidad mejor",
      "No me ayuda a alcanzar mis metas",
    ],
    loyal: [
      "Soy leal a mi club actual",
      "No puedo abandonar a mis compañeros",
      "Mi lugar está aquí",
    ],
    money_driven: [
      "La oferta económica no es suficiente",
      "Espero una propuesta mejor",
      "Las condiciones no son las adecuadas",
    ],
  };
  
  const typeMessages = messages[personality.personalityType];
  return typeMessages[Math.floor(Math.random() * typeMessages.length)];
}

// ============================================================================
// CACHE
// ============================================================================

/**
 * Limpia la caché de personalidades
 */
export function clearPersonalityCache(): void {
  personalityCache.clear();
}

/**
 * Obtiene una personalidad de la caché
 * @param playerId - ID del jugador
 * @returns Personalidad o null
 */
export function getCachedPersonality(playerId: string): PlayerPersonality | null {
  return personalityCache.get(playerId) || null;
}

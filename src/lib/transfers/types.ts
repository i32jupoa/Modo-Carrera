/**
 * Tipos TypeScript compartidos para el sistema de mercado de fichajes
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { Position } from "@/data/players";

// ============================================================================
// ESTRATEGIA DE CLUB
// ============================================================================

/**
 * Personalidad y estrategia de transferencia de un club
 * Valores de 0-100 para todos los atributos
 */
export interface ClubStrategy {
  /** Poder económico del club (0-100) */
  economicPower: number;
  /** Reputación global del club (0-100) */
  reputation: number;
  /** Paciencia en negociaciones (0-100) */
  negotiationPatience: number;
  /** Agresividad en fichajes (0-100) */
  transferAggressiveness: number;
  /** Preferencia por jugadores jóvenes (0-100) */
  youthPreference: number;
  /** Preferencia por jugadores veteranos (0-100) */
  veteranPreference: number;
  /** Preferencia por jugadores nacionales (0-100) */
  nationalPreference: number;
  /** Preferencia por jugadores de su liga (0-100) */
  leaguePreference: number;
  /** Importancia de la cantera (0-100) */
  academyImportance: number;
  /** Nivel de ambición deportiva (0-100) */
  ambitionLevel: number;
}

// ============================================================================
// CONTRATOS
// ============================================================================

/**
 * Contrato de un jugador
 */
export interface Contract {
  /** ID del jugador */
  playerId: string;
  /** ID del club */
  clubId: string;
  /** Fecha de inicio (ISO date) */
  startDate: string;
  /** Fecha de fin (ISO date) */
  endDate: string;
  /** Salario semanal en euros */
  weeklyWage: number;
  /** Cláusula de rescisión en euros (opcional) */
  releaseClause?: number;
  /** Prima de fichaje en euros (opcional) */
  signingBonus?: number;
  /** Bonus por rendimiento en euros (opcional) */
  performanceBonus?: number;
}

/**
 * Estado de un contrato
 */
export type ContractStatus = 'active' | 'expiring_soon' | 'expired' | 'terminated';

// ============================================================================
// PERSONALIDAD DE JUGADOR
// ============================================================================

/**
 * Personalidad y preferencias de un jugador
 */
export interface PlayerPersonality {
  /** Ambición del jugador (0-100) */
  ambition: number;
  /** Lealtad al club actual (0-100) */
  loyalty: number;
  /** Motivación por dinero (0-100) */
  moneyMotivated: number;
  /** Importancia de jugar minutos (0-100) */
  playingTimeImportance: number;
  /** Motivación por ganar títulos (0-100) */
  trophyMotivated: number;
  /** Edad del jugador */
  age: number;
  /** Tipo de personalidad */
  personalityType: PersonalityType;
}

/**
 * Tipos de personalidad de jugador
 */
export type PersonalityType = 
  | 'professional'      // Equilibrado, profesional
  | 'leader'           // Liderazgo, influencia
  | 'mercurial'        // Volátil, impredecible
  | 'resilient'        // Resistente, trabajador
  | 'ambitious'        // Muy ambicioso
  | 'loyal'            // Muy leal
  | 'money_driven';    // Motivado por dinero

// ============================================================================
// VALORACIÓN DE MERCADO
// ============================================================================

/**
 * Valoración de mercado de un jugador
 */
export interface MarketValuation {
  /** Valor base del jugador */
  baseValue: number;
  /** Precio mínimo aceptable */
  minAcceptable: number;
  /** Precio esperado */
  expectedValue: number;
  /** Precio ideal para el vendedor */
  idealValue: number;
  /** Precio máximo que pagarían */
  maxValue: number;
  /** Multiplicador por competencia */
  competitionMultiplier: number;
}

// ============================================================================
// OFERTAS DE TRANSFERENCIA
// ============================================================================

/**
 * Estado de una oferta de transferencia
 */
export type OfferStatus = 
  | 'pending'      // Pendiente de respuesta
  | 'accepted'     // Aceptada
  | 'rejected'     // Rechazada
  | 'countered'    // Contraoferta realizada
  | 'withdrawn'    // Retirada por el oferente
  | 'expired';     // Expirada por tiempo

/**
 * Tipo de oferta de transferencia
 */
export type OfferType = 
  | 'permanent'              // Traspaso definitivo
  | 'loan'                   // Cesión simple
  | 'loan_with_option'       // Cesión con opción de compra
  | 'loan_with_obligation';  // Cesión con obligación de compra

/**
 * Oferta de transferencia
 */
export interface TransferOffer {
  /** ID único de la oferta */
  id: string;
  /** ID del jugador */
  playerId: string;
  /** ID del club oferente */
  fromClubId: string;
  /** ID del club vendedor */
  toClubId: string;
  /** Cantidad ofrecida en euros */
  amount: number;
  /** Estado de la oferta */
  status: OfferStatus;
  /** Tipo de oferta */
  offerType: OfferType;
  /** Detalles del contrato (opcional) */
  contractDetails?: Contract;
  /** Detalles de la cesión (opcional) */
  loanDetails?: LoanDetails;
  /** Contraoferta relacionada (opcional) */
  counterOffer?: TransferOffer;
  /** Fecha de creación (ISO date) */
  createdAt: string;
  /** Fecha de expiración (ISO date, opcional) */
  expiresAt?: string;
}

// ============================================================================
// CESIONES
// ============================================================================

/**
 * Detalles de una cesión
 */
export interface LoanDetails {
  /** Duración en meses */
  duration: number;
  /** Porcentaje del salario pagado por el club cedente (0-100) */
  wageContribution: number;
  /** Opción de compra en euros (opcional) */
  optionToBuy?: number;
  /** Obligación de compra en euros (opcional) */
  obligationToBuy?: number;
  /** Disparador de la cláusula de compra */
  buyClauseTrigger?: 'automatic' | 'negotiated' | 'conditions_met';
}

/**
 * Estado de una cesión
 */
export type LoanStatus = 
  | 'active'       // Cesión activa
  | 'returned'     // Jugador devuelto
  | 'bought'       // Ejercida opción/obligación de compra
  | 'terminated';  // Cesión terminada anticipadamente

// ============================================================================
// NECESIDADES DE PLANTILLA
// ============================================================================

/**
 * Prioridad de una necesidad
 */
export type NeedPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Necesidad de plantilla detectada
 */
export interface SquadNeed {
  /** Posición requerida */
  position: Position;
  /** Prioridad de la necesidad */
  priority: NeedPriority;
  /** Rango de edad objetivo */
  targetAge: { min: number; max: number };
  /** Rango de valoración objetivo */
  targetRating: { min: number; max: number };
  /** Presupuesto máximo */
  maxBudget: number;
  /** Número actual de jugadores en esa posición */
  currentCount: number;
  /** Número ideal de jugadores en esa posición */
  idealCount: number;
  /** Razón de la necesidad */
  reason: string;
}

/**
 * Análisis completo de la plantilla
 */
export interface SquadAnalysis {
  /** ID del club */
  clubId: string;
  /** Necesidades detectadas */
  needs: SquadNeed[];
  /** Edad media de la plantilla */
  averageAge: number;
  /** Edad media del once titular */
  startingElevenAge: number;
  /** Edad media de los suplentes */
  substitutesAge: number;
  /** Valoración media de la plantilla */
  averageRating: number;
  /** Jugadores en lista de transferencia */
  transferList: string[];
  /** Jugadores disponibles para cesión */
  loanList: string[];
}

// ============================================================================
// RUMORES
// ============================================================================

/**
 * Tipo de rumor
 */
export type RumorType = 
  | 'club_following'        // Club sigue a un jugador
  | 'player_wants_out'      // Jugador quiere salir
  | 'club_seeking'          // Club busca jugador en una posición
  | 'negotiation_started'  // Negociación iniciada
  | 'medical_scheduled';    // Médico programado

/**
 * Rumor de transferencia
 */
export interface TransferRumor {
  /** ID único del rumor */
  id: string;
  /** Tipo de rumor */
  type: RumorType;
  /** ID del jugador (opcional) */
  playerId?: string;
  /** ID del club interesado (opcional) */
  fromClubId?: string;
  /** ID del club del jugador (opcional) */
  toClubId?: string;
  /** Posición buscada (opcional) */
  position?: Position;
  /** Credibilidad del rumor (0-100) */
  credibility: number;
  /** Fecha de creación (ISO date) */
  createdAt: string;
  /** Fecha de expiración (ISO date) */
  expiresAt: string;
  /** Fuente del rumor */
  source: 'reliable' | 'speculative' | 'unconfirmed';
}

// ============================================================================
// HISTORIAL DE TRANSFERENCIAS
// ============================================================================

/**
 * Tipo de transferencia en el historial
 */
export type TransferType = 
  | 'purchase'     // Compra
  | 'sale'         // Venta
  | 'loan_out'     // Cesión saliente
  | 'loan_in'      // Cesión entrante
  | 'free_transfer'; // Fichaje libre

/**
 * Registro de transferencia en el historial
 */
export interface TransferRecord {
  /** ID único del registro */
  id: string;
  /** Tipo de transferencia */
  type: TransferType;
  /** ID del jugador */
  playerId: string;
  /** Nombre del jugador */
  playerName: string;
  /** ID del club origen */
  fromClubId: string;
  /** Nombre del club origen */
  fromClubName: string;
  /** ID del club destino */
  toClubId: string;
  /** Nombre del club destino */
  toClubName: string;
  /** Cantidad de la transferencia en euros */
  amount: number;
  /** Fecha de la transferencia (ISO date) */
  date: string;
  /** Ventana de mercado */
  window: 'summer' | 'winter';
  /** Temporada */
  season: string;
}

// ============================================================================
// PRESUPUESTO
// ============================================================================

/**
 * Estado del presupuesto de un club
 */
export interface BudgetState {
  /** ID del club */
  clubId: string;
  /** Presupuesto actual disponible */
  currentBudget: number;
  /** Presupuesto total de la ventana */
  totalWindowBudget: number;
  /** Gastos de la ventana actual */
  windowSpending: number;
  /** Ingresos de la ventana actual */
  windowIncome: number;
  /** Masa salarial semanal total */
  weeklyWageBill: number;
  /** Masa salarial máxima permitida */
  maxWageBill: number;
  /** Última actualización (ISO date) */
  lastUpdated: string;
}

// ============================================================================
// SIMULACIÓN DE MERCADO
// ============================================================================

/**
 * Estado de la simulación del mercado
 */
export interface MarketSimulationState {
  /** Día actual de la simulación */
  currentDay: number;
  /** Ventana de mercado actual */
  currentWindow: 'summer' | 'winter' | 'closed';
  /** Ofertas activas */
  activeOffers: TransferOffer[];
  /** Rumores activos */
  activeRumors: TransferRumor[];
  /** Clubes que ya han actuado hoy */
  clubsActedToday: Set<string>;
  /** Última simulación (ISO date) */
  lastSimulationDate: string;
}

// ============================================================================
// RESULTADOS DE OPERACIONES
// ============================================================================

/**
 * Resultado de una operación de transferencia
 */
export interface TransferResult {
  /** Si la operación fue exitosa */
  success: boolean;
  /** Mensaje de éxito o error */
  message: string;
  /** Datos adicionales (opcional) */
  data?: any;
}

/**
 * Resultado de una evaluación de oferta
 */
export interface OfferEvaluation {
  /** Si la oferta debe ser aceptada */
  shouldAccept: boolean;
  /** Puntuación de la oferta (0-100) */
  score: number;
  /** Razón de la decisión */
  reason: string;
  /** Contraoferta sugerida (opcional) */
  counterOffer?: number;
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Rango de valores
 */
export interface Range {
  min: number;
  max: number;
}

/**
 * Puntuación de candidato para fichaje
 */
export interface CandidateScore {
  /** ID del jugador */
  playerId: string;
  /** Puntuación total */
  totalScore: number;
  /** Puntuación por necesidad */
  needScore: number;
  /** Puntuación por edad */
  ageScore: number;
  /** Puntuación por potencial */
  potentialScore: number;
  /** Puntuación por precio */
  priceScore: number;
  /** Puntuación por salario */
  wageScore: number;
  /** Puntuación por nacionalidad */
  nationalityScore: number;
  /** Puntuación por liga */
  leagueScore: number;
  /** Puntuación por prestigio */
  prestigeScore: number;
}

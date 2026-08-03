/**
 * Constantes de configuración para el sistema de mercado de fichajes
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

// ============================================================================
// VENTANAS DE MERCADO
// ============================================================================

/**
 * Duración de las ventanas de mercado en días
 */
export const TRANSFER_WINDOW_DAYS = {
  summer: 62,  // 1 julio - 31 agosto
  winter: 31,  // 1 enero - 31 enero
} as const;

/**
 * Días antes del cierre para activar el comportamiento de Deadline Day
 */
export const DEADLINE_DAY_THRESHOLD = 5;

// ============================================================================
// PRESUPUESTOS
// ============================================================================

/**
 * Porcentaje del presupuesto que un club está dispuesto a gastar en una ventana
 */
export const BUDGET_SPENDING_PERCENTAGE = {
  conservative: 0.4,   // Clubes conservadores
  moderate: 0.6,       // Clubes moderados
  aggressive: 0.85,     // Clubes agresivos
} as const;

/**
 * Porcentaje del presupuesto reservado para salarios
 */
export const WAGE_BILL_PERCENTAGE = 0.4;

/**
 * Presupuestos iniciales por categoría de club (en millones de euros)
 */
export const INITIAL_BUDGET_BY_CATEGORY = {
  elite: 250,      // Top clubs (Real Madrid, Man City, etc.)
  big: 150,        // Grandes clubes (Arsenal, Juventus, etc.)
  mid: 80,         // Clubes medios (Everton, Valencia, etc.)
  small: 30,       // Clubes pequeños (Brentford, Real Sociedad, etc.)
  minnow: 15,      // Clubes modestos
} as const;

/**
 * Categorías de club por valoración media
 */
export const CLUB_CATEGORY_RANGES = {
  elite: { min: 85, max: 100 },
  big: { min: 80, max: 84 },
  mid: { min: 75, max: 79 },
  small: { min: 70, max: 74 },
  minnow: { min: 60, max: 69 },
} as const;

// ============================================================================
// VALORACIÓN DE MERCADO
// ============================================================================

/**
 * Multiplicadores de valoración según la competencia
 */
export const COMPETITION_MULTIPLIERS = {
  no_competition: 1.0,
  one_bidder: 1.15,
  two_bidders: 1.3,
  three_bidders: 1.5,
  bidding_war: 1.7,
} as const;

/**
 * Multiplicadores para estrellas (88+)
 */
export const STAR_PLAYER_MULTIPLIERS = {
  base: 1.5,
  top_club: 2.0,
  champions_league: 2.2,
  desperate_buyer: 2.5,
} as const;

/**
 * Rangos de valoración como porcentaje del valor base
 */
export const VALUATION_RANGES = {
  minAcceptable: 1.1,      // 110% del valor base
  expected: 1.25,         // 125% del valor base
  ideal: 1.4,             // 140% del valor base
  max: 1.8,               // 180% del valor base
} as const;

/**
 * Descuento por edad (jugadores mayores de 30)
 */
export const AGE_DISCOUNT = {
  age_30_32: 0.85,        // 15% descuento
  age_33_35: 0.7,         // 30% descuento
  age_36_plus: 0.5,       // 50% descuento
} as const;

/**
 * Prima por potencial (jugadores jóvenes con alto potencial)
 */
export const POTENTIAL_PREMIUM = {
  high_potential: 1.3,     // +30% para jugadores 18-22 con potencial >85
  very_high_potential: 1.5, // +50% para jugadores 18-20 con potencial >88
} as const;

// ============================================================================
// NEGOCIACIONES
// ============================================================================

/**
 * Tiempo de expiración de ofertas en días
 */
export const OFFER_EXPIRY_DAYS = 7;

/**
 * Número máximo de contraofertas permitidas
 */
export const MAX_COUNTER_OFFERS = 3;

/**
 * Porcentaje mínimo de incremento para contraoferta
 */
export const COUNTER_OFFER_INCREMENT_MIN = 0.05; // 5%

/**
 * Porcentaje máximo de incremento para contraoferta
 */
export const COUNTER_OFFER_INCREMENT_MAX = 0.25; // 25%

/**
 * Probabilidad de generar contraoferta
 */
export const COUNTER_OFFER_PROBABILITY = 0.6;

/**
 * Días que un club espera antes de responder a una oferta
 */
export const OFFER_RESPONSE_DAYS = {
  quick: 1,       // Respuesta rápida
  normal: 3,      // Respuesta normal
  slow: 5,        // Respuesta lenta
} as const;

// ============================================================================
// CONTRATOS
// ============================================================================

/**
 * Duración de contratos en años por edad
 */
export const CONTRACT_DURATION_BY_AGE = {
  age_18_21: 5,    // 5 años para jóvenes
  age_22_25: 4,    // 4 años para jóvenes adultos
  age_26_29: 3,    // 3 años para adultos
  age_30_33: 2,    // 2 años para veteranos
  age_34_plus: 1,   // 1 año para mayores
} as const;

/**
 * Salario semanal como porcentaje del valor anual del jugador
 */
export const WAGE_PERCENTAGE_OF_VALUE = {
  elite: 0.08,      // 8% anual para estrellas
  high: 0.06,       // 6% anual para buenos jugadores
  mid: 0.04,        // 4% anual para medios
  low: 0.02,        // 2% anual para bajos
} as const;

/**
 * Días antes de la expiración para iniciar renovaciones
 */
export const CONTRACT_RENEWAL_THRESHOLD_DAYS = 180; // 6 meses

/**
 * Probabilidad de renovación según calidad del jugador
 */
export const RENEWAL_PROBABILITY = {
  star: 0.95,       // 95% para estrellas
  key_player: 0.85, // 85% para jugadores clave
  rotation: 0.6,    // 60% para rotación
  backup: 0.3,      // 30% para suplentes
} as const;

/**
 * Cláusula de rescisión como múltiplo del valor
 */
export const RELEASE_CLAUSE_MULTIPLIER = 2.5;

// ============================================================================
// PERSONALIDAD DE JUGADOR
// ============================================================================

/**
 * Rangos de personalidad (0-100)
 */
export const PERSONALITY_RANGES = {
  very_low: 20,
  low: 40,
  medium: 50,
  high: 70,
  very_high: 85,
} as const;

/**
 * Factores de decisión del jugador
 */
export const PLAYER_DECISION_FACTORS = {
  salary: 0.3,           // 30% peso al salario
  playingTime: 0.25,      // 25% peso a minutos
  trophies: 0.2,          // 20% peso a títulos
  clubPrestige: 0.15,     // 15% peso a prestigio
  location: 0.1,          // 10% peso a ubicación
} as const;

/**
 * Salario mínimo aceptable como múltiplo del salario actual
 */
export const MIN_SALARY_MULTIPLIER = 1.2;

/**
// ============================================================================
// ANÁLISIS DE PLANTILLA
// ============================================================================

/**
 * Número ideal de jugadores por posición
 */
export const IDEAL_SQUAD_COMPOSITION = {
  GK: 3,      // Porteros
  DEF: 8,     // Defensas
  MID: 8,     // Mediocentros
  FWD: 6,     // Delanteros
} as const;

/**
 * Número mínimo de jugadores por posición
 */
export const MIN_SQUAD_COMPOSITION = {
  GK: 2,
  DEF: 6,
  MID: 6,
  FWD: 4,
} as const;

/**
 * Edad media ideal por posición
 */
export const IDEAL_AGE_BY_POSITION = {
  GK: { min: 24, max: 32 },
  DEF: { min: 22, max: 30 },
  MID: { min: 21, max: 29 },
  FWD: { min: 20, max: 28 },
} as const;

/**
 * Edad media máxima aceptable
 */
export const MAX_AVERAGE_AGE = 28;

/**
 * Porcentaje de jugadores jóvenes (18-22) ideal
 */
export const YOUTH_PERCENTAGE_IDEAL = 0.25; // 25%

/**
// ============================================================================
// SIMULACIÓN DE MERCADO
// ============================================================================

/**
 * Días entre acciones de mercado de cada club
 */
export const MARKET_ACTION_INTERVAL_DAYS = 3;

/**
 * Número máximo de ofertas simultáneas por club
 */
export const MAX_SIMULTANEOUS_OFFERS = 3;

/**
 * Probabilidad de que un club busque fichajes en un día dado
 */
export const TRANSFER_SEARCH_PROBABILITY = 0.3;

/**
 * Probabilidad de Deadline Day (últimos días)
 */
export const DEADLINE_DAY_PROBABILITY = 0.7;

/**
 * Número de candidatos a evaluar por búsqueda
 */
export const CANDIDATES_TO_EVALUATE = 20;

/**
// ============================================================================
// CESIONES
// ============================================================================

/**
 * Duración de cesiones en meses
 */
export const LOAN_DURATION = {
  short: 6,      // 6 meses (media temporada)
  medium: 12,    // 12 meses (1 temporada)
  long: 18,      // 18 meses (1.5 temporadas)
} as const;

/**
 * Porcentaje del salario pagado por el club cedente
 */
export const LOAN_WAGE_CONTRIBUTION = {
  full: 100,     // Club cedente paga todo
  majority: 75,   // Club cedente paga 75%
  half: 50,      // Club cedente paga 50%
  minority: 25,   // Club cedente paga 25%
  none: 0,       // Club receptor paga todo
} as const;

/**
 * Opción de compra como porcentaje del valor base
 */
export const LOAN_OPTION_TO_BUY_PERCENTAGE = {
  low: 0.8,       // 80% del valor
  standard: 1.0,  // 100% del valor
  high: 1.2,      // 120% del valor
} as const;

/**
// ============================================================================
// RUMORES
// ============================================================================

/**
 * Duración de rumores en días
 */
export const RUMOR_DURATION_DAYS = 14;

/**
 * Probabilidad de generación de rumores por día
 */
export const RUMOR_GENERATION_PROBABILITY = 0.15;

/**
 * Credibilidad de rumores por fuente
 */
export const RUMOR_CREDIBILITY = {
  reliable: 80,      // Fuentes fiables
  speculative: 50,   // Especulativo
  unconfirmed: 30,   // No confirmado
} as const;

/**
// ============================================================================
// RENDIMIENTO
// ============================================================================

/**
 * Tamaño de lote para operaciones masivas
 */
export const BATCH_SIZE = 50;

/**
 * Número máximo de jugadores a evaluar por búsqueda (para evitar O(n²))
 */
export const MAX_PLAYERS_TO_SCAN = 500;

/**
 * Caché de resultados en milisegundos
 */
export const CACHE_DURATION_MS = 60000; // 1 minuto

/**
// ============================================================================
// ESTRATEGIAS PREDEFINIDAS
// ============================================================================

/**
 * Estrategia del Real Madrid
 */
export const REAL_MADRID_STRATEGY = {
  economicPower: 95,
  reputation: 98,
  negotiationPatience: 70,
  transferAggressiveness: 85,
  youthPreference: 40,
  veteranPreference: 30,
  nationalPreference: 60,
  leaguePreference: 50,
  academyImportance: 50,
  ambitionLevel: 95,
} as const;

/**
 * Estrategia de Brighton
 */
export const BRIGHTON_STRATEGY = {
  economicPower: 65,
  reputation: 70,
  negotiationPatience: 80,
  transferAggressiveness: 75,
  youthPreference: 90,
  veteranPreference: 20,
  nationalPreference: 70,
  leaguePreference: 80,
  academyImportance: 85,
  ambitionLevel: 70,
} as const;

/**
 * Estrategia de Sevilla
 */
export const SEVILLA_STRATEGY = {
  economicPower: 55,
  reputation: 75,
  negotiationPatience: 75,
  transferAggressiveness: 80,
  youthPreference: 60,
  veteranPreference: 50,
  nationalPreference: 85,
  leaguePreference: 90,
  academyImportance: 70,
  ambitionLevel: 75,
} as const;

/**
 * Estrategia de Manchester City
 */
export const MAN_CITY_STRATEGY = {
  economicPower: 98,
  reputation: 97,
  negotiationPatience: 60,
  transferAggressiveness: 90,
  youthPreference: 55,
  veteranPreference: 25,
  nationalPreference: 40,
  leaguePreference: 40,
  academyImportance: 60,
  ambitionLevel: 98,
} as const;

/**
 * Estrategia de Bayern Munich
 */
export const BAYERN_STRATEGY = {
  economicPower: 92,
  reputation: 96,
  negotiationPatience: 65,
  transferAggressiveness: 70,
  youthPreference: 65,
  veteranPreference: 35,
  nationalPreference: 90,
  leaguePreference: 85,
  academyImportance: 75,
  ambitionLevel: 92,
} as const;

/**
 * Estrategia genérica por categoría de club
 */
export const GENERIC_STRATEGY_BY_CATEGORY = {
  elite: {
    economicPower: 90,
    reputation: 92,
    negotiationPatience: 65,
    transferAggressiveness: 80,
    youthPreference: 50,
    veteranPreference: 30,
    nationalPreference: 50,
    leaguePreference: 45,
    academyImportance: 55,
    ambitionLevel: 90,
  },
  big: {
    economicPower: 75,
    reputation: 80,
    negotiationPatience: 70,
    transferAggressiveness: 70,
    youthPreference: 60,
    veteranPreference: 40,
    nationalPreference: 60,
    leaguePreference: 60,
    academyImportance: 60,
    ambitionLevel: 75,
  },
  mid: {
    economicPower: 55,
    reputation: 60,
    negotiationPatience: 75,
    transferAggressiveness: 60,
    youthPreference: 70,
    veteranPreference: 50,
    nationalPreference: 70,
    leaguePreference: 75,
    academyImportance: 65,
    ambitionLevel: 60,
  },
  small: {
    economicPower: 40,
    reputation: 45,
    negotiationPatience: 80,
    transferAggressiveness: 50,
    youthPreference: 85,
    veteranPreference: 55,
    nationalPreference: 80,
    leaguePreference: 85,
    academyImportance: 75,
    ambitionLevel: 50,
  },
  minnow: {
    economicPower: 25,
    reputation: 30,
    negotiationPatience: 85,
    transferAggressiveness: 40,
    youthPreference: 90,
    veteranPreference: 60,
    nationalPreference: 90,
    leaguePreference: 90,
    academyImportance: 85,
    ambitionLevel: 40,
  },
} as const;

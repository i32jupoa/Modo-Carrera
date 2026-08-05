/**
 * Configuración central del mercado de fichajes.
 *
 * Ningún módulo del motor debe contener números mágicos: todo umbral,
 * multiplicador o peso vive aquí y está documentado.
 */

import type { PositionGroup } from "./types";

// ============================================================================
// CALENDARIO Y RITMO DE LA IA
// ============================================================================

export const MARKET_TIMING = {
  /** Porcentaje de clubes que actúan cada día de mercado. */
  dailyActiveClubShare: 0.16,
  /** Porcentaje de clubes activos durante el deadline day. */
  deadlineActiveClubShare: 0.5,
  /** Días finales de ventana considerados deadline day. */
  deadlineDays: 3,
  /** Máximo de negociaciones abiertas simultáneas por club. */
  maxNegotiationsPerClub: 3,
  /** Rondas máximas antes del rechazo definitivo. */
  maxNegotiationRounds: 4,
  /** Días que una negociación puede quedarse parada antes de expirar. */
  negotiationExpiryDays: 7,
  /** Máximo de fichajes por club y ventana. */
  maxSigningsPerWindow: 6,
  /** Máximo de ventas por club y ventana. */
  maxSalesPerWindow: 8,
  /**
   * Saldo negativo máximo de una ventana: un club no puede terminar el
   * mercado con más de estas salidas por encima de sus llegadas. Sin este
   * tope, los clubes de la IA perdían seis jugadores y fichaban uno.
   */
  maxWindowDeficit: 2,
} as const;

// ============================================================================
// PLANTILLA
// ============================================================================

/** Plantilla objetivo por demarcación. */
export const IDEAL_SQUAD_SHAPE: Record<PositionGroup, { min: number; ideal: number; max: number }> =
  {
    GK: { min: 2, ideal: 3, max: 4 },
    CB: { min: 3, ideal: 4, max: 6 },
    FB: { min: 3, ideal: 4, max: 6 },
    CM: { min: 4, ideal: 6, max: 8 },
    WING: { min: 3, ideal: 4, max: 6 },
    ST: { min: 2, ideal: 3, max: 5 },
  };

export const SQUAD_LIMITS = {
  /** Tamaño mínimo de plantilla antes de bloquear ventas. */
  minSquadSize: 18,
  /** Tamaño a partir del cual el club considera que sobra gente. */
  maxSquadSize: 28,
  /** Edad a partir de la cual un jugador se considera veterano. */
  veteranAge: 32,
  /** Edad máxima para considerarse joven promesa. */
  youngAge: 22,
  /** Diferencia de media respecto al once para considerarse descarte. */
  benchGapForSale: 6,
  /** Media relativa mínima para que un fichaje mejore la plantilla. */
  improvementMargin: 1,
} as const;

// ============================================================================
// EDAD SEGÚN POSICIÓN
// ----------------------------------------------------------------------------
// Antes había una única curva de edad para todo el mundo: un portero de 34 y
// un lateral de 34 se trataban igual de "viejos". No tiene sentido: un
// portero suele rendir a gran nivel bien entrados los 30 y un extremo,
// normalmente no. `peakStart`/`peakEnd` marcan el tramo de mejor rendimiento
// y `declineEnd` el punto a partir del cual el club empieza a considerarlo
// veterano de verdad (se usa en fichajes, renovaciones y ventas).
// ============================================================================

export const POSITION_AGE_CURVE: Record<
  PositionGroup,
  { peakStart: number; peakEnd: number; declineEnd: number }
> = {
  GK: { peakStart: 27, peakEnd: 34, declineEnd: 38 },
  CB: { peakStart: 25, peakEnd: 31, declineEnd: 35 },
  FB: { peakStart: 24, peakEnd: 29, declineEnd: 33 },
  CM: { peakStart: 24, peakEnd: 30, declineEnd: 34 },
  WING: { peakStart: 23, peakEnd: 28, declineEnd: 32 },
  ST: { peakStart: 23, peakEnd: 29, declineEnd: 33 },
};

// ============================================================================
// RACIONALIDAD DE LA IA
// ----------------------------------------------------------------------------
// Ningún director deportivo acierta siempre. Estos parámetros introducen
// errores de juicio controlados y deterministas (mismo club + jugador + día
// siempre produce el mismo resultado, para no romper la reproducibilidad),
// de forma que el mercado deje de ser perfectamente racional en cada operación.
// ============================================================================

export const DECISION_ACCURACY = {
  /** Probabilidad de que un club se "encandile" con un nombre conocido y
   *  puntúe a un jugador estrella por encima de lo que le corresponde,
   *  aunque encaje mal con la necesidad real del equipo. */
  starstruckChance: 0.07,
  /** Puntos extra (sobre la puntuación 0..1) que da ese encandilamiento. */
  starstruckBonus: 0.18,
  /** Probabilidad de que un club esté "generoso" en una negociación concreta
   *  y abra más cerca de su techo de gasto de lo habitual (paga de más). */
  generousMoodChance: 0.15,
  /** Cuánto se acerca al techo de gasto un club generoso al abrir la oferta. */
  generousMoodBoost: 0.12,
} as const;

// ============================================================================
// PUNTUACIÓN DE CANDIDATOS
// ============================================================================

/** Pesos del sistema de puntuación de fichajes (suman 1). */
export const SCORE_WEIGHTS = {
  need: 0.26,
  quality: 0.16,
  potential: 0.12,
  age: 0.1,
  price: 0.14,
  wage: 0.06,
  nationality: 0.04,
  league: 0.03,
  prestige: 0.02,
  /** Encaje con la identidad táctica del club (posesión, pace, físico...). */
  style: 0.07,
} as const;

export const SEARCH_LIMITS = {
  /** Candidatos evaluados por necesidad (tras filtrar por índices). */
  candidatesPerNeed: 60,
  /** Tamaño de la lista corta final. */
  shortlistSize: 5,
  /** Puntuación mínima para intentar el fichaje. */
  minimumScore: 0.45,
} as const;

// ============================================================================
// VALORACIÓN Y PRECIOS
// ============================================================================

export const PRICE_MULTIPLIERS = {
  /** Descuento si al jugador le queda un año de contrato. */
  lastYearDiscount: 0.7,
  /** Descuento en deadline day para clubes que necesitan vender. */
  deadlineDiscount: 0.85,
} as const;

export const STAR_THRESHOLD = 88;
export const WORLD_CLASS_THRESHOLD = 84;

/** Ofertas por debajo de este ratio sobre el mínimo son insultantes. */
export const INSULTING_OFFER_RATIO = 0.6;

// ============================================================================
// SALARIOS Y PRESUPUESTOS
// ============================================================================

export const WAGE_RULES = {
  /** Salario anual como fracción del valor de mercado. */
  valueToWage: 0.13,
  /** Salario mínimo anual. */
  minimumWage: 60_000,
  /** Subida mínima que pide un jugador al fichar. */
  moveRaise: 1.15,
  /** Porcentaje máximo del tope salarial que puede ocupar un solo jugador. */
  maxShareSingle: 0.18,
  /** Tope salarial como múltiplo del presupuesto inicial de fichajes. */
  wageBudgetFactor: 1.1,
} as const;

export const BUDGET_RULES = {
  /** Porcentaje del ingreso por ventas que vuelve al presupuesto. */
  saleReinvestment: 0.85,
  /** Reserva que ningún club gasta (colchón). */
  reserveShare: 0.1,
  /** Ingresos por premios al reiniciar la ventana, sobre el presupuesto. */
  windowRefill: 0.35,
  /** Presupuesto mínimo garantizado por club. */
  floor: 500_000,
} as const;

// ============================================================================
// CONTRATOS Y RENOVACIONES
// ============================================================================

export const CONTRACT_RULES = {
  minYears: 1,
  maxYears: 5,
  /** Años típicos según edad. */
  yearsByAge: [
    { maxAge: 23, years: 5 },
    { maxAge: 28, years: 4 },
    { maxAge: 31, years: 3 },
    { maxAge: 34, years: 2 },
    { maxAge: 99, years: 1 },
  ],
  /** Cláusula de rescisión como múltiplo del valor: se paga para cerrar un
   *  fichaje al instante sin negociar. Con el valor de mercado ya realista
   *  (techo global 220M), 1.6x es una prima disuasoria pero no fantasiosa. */
  releaseClauseFactor: 1.6,
  /** Prima de fichaje como fracción del salario anual. */
  signingBonusShare: 0.25,
  /** Edad máxima para renovar salvo excepción (leyenda del club). */
  maxRenewalAge: 34,
  /** Subida salarial típica en una renovación. */
  renewalRaise: 1.2,
  /** Meses antes del fin de contrato en los que se puede negociar libre. */
  preContractMonth: 0,
} as const;

// ============================================================================
// CESIONES
// ============================================================================

export const LOAN_RULES = {
  /** Edad máxima del cedido habitual. */
  maxAge: 23,
  /** Diferencia con el once que justifica una cesión. */
  ratingGap: 4,
  /** Reparto salarial por defecto que asume el club receptor. */
  defaultWageShare: 0.6,
  /** Coste de la opción de compra como múltiplo del valor. */
  optionFactor: 1.1,
  /** Probabilidad base de que una cesión incluya opción de compra. */
  optionChance: 0.35,
  /** Probabilidad de que la opción sea obligatoria. */
  obligationChance: 0.15,
} as const;

// ============================================================================
// RUMORES
// ============================================================================

export const RUMOR_RULES = {
  /** Máximo de rumores almacenados. */
  maxStored: 120,
  /** Probabilidad de publicar un rumor cuando nace un interés. */
  publishChance: 0.35,
  /** Días que un rumor se considera reciente. */
  freshnessDays: 10,
} as const;

// ============================================================================
// EQUILIBRIO GENERAL
// ============================================================================

export const BALANCE = {
  /** Intensidad mínima de una ventana (temporadas tranquilas). */
  minIntensity: 0.45,
  /** Intensidad máxima (mercados locos). */
  maxIntensity: 1.25,
  /**
   * Probabilidad de que un club sea "conservador" en la ventana: no sale a
   * fichar por iniciativa propia salvo en deadline day. IMPORTANTE: esto ya
   * no lo deja mudo el resto del tiempo — sigue renovando contratos,
   * gestionando cesiones y puede vender si otro club le hace una oferta (ver
   * `MarketSimulation.runClubDay`). Antes excluía al club por completo de la
   * actividad diaria durante 18% de los clubes × toda la ventana, así que
   * daba la sensación de que "no todos los equipos fichan"; ahora solo se
   * abstienen de salir a comprar.
   */
  dormantClubChance: 0.12,
  /** Multiplicador de actividad de la ventana de invierno. */
  winterFactor: 0.45,
} as const;

/**
 * Prefijo de la clave de persistencia del mercado (cada partida añade su
 * propio id: `${MARKET_STORAGE_KEY_PREFIX}:${saveId}`, ver `Persistence.ts`).
 * Se llamó "v1" cuando el mercado era una única partida global; el nombre se
 * mantiene porque cambiarlo invalidaría todas las partidas guardadas, pero
 * ahora es solo un prefijo, no la clave completa.
 */
export const MARKET_STORAGE_KEY_PREFIX = "fcsim:market:v1";

/**
 * Versión del estado persistido; se usa para migrar/invalidar partidas
 * antiguas. Súbela cada vez que cambie la forma de `TransferSaveData`
 * (ver `Persistence.ts`) de un modo incompatible con el formato anterior.
 */
export const MARKET_STATE_VERSION = 3;

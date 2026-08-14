/**
 * Tipos del sistema de mercado de fichajes.
 *
 * Todo el dominio del mercado se modela aquí con tipos fuertes; ningún módulo
 * del motor debe usar `any`.
 */

// ============================================================================
// POSICIONES
// ============================================================================

/** Grupos de posición usados por el análisis de plantilla. */
export type PositionGroup = "GK" | "CB" | "FB" | "CM" | "WING" | "ST";

export const POSITION_GROUPS: readonly PositionGroup[] = ["GK", "CB", "FB", "CM", "WING", "ST"];

// ============================================================================
// JUGADORES
// ============================================================================

/** Contrato de un jugador con su club. */
export interface Contract {
  /** Temporadas completas restantes (0 = acaba este verano). */
  yearsLeft: number;
  /** Salario bruto anual en euros. */
  wage: number;
  /** Cláusula de rescisión en euros (0 = sin cláusula). */
  releaseClause: number;
  /** Prima de fichaje pactada en euros. */
  signingBonus: number;
}

/** Rasgos de personalidad que guían las decisiones del jugador (0..1). */
export interface PlayerPersonality {
  /** Cuánto le importa competir por títulos y jugar en un club grande. */
  ambition: number;
  /** Apego a su club actual. */
  loyalty: number;
  /** Peso del dinero en su decisión. */
  greed: number;
  /** Necesidad de minutos. */
  playingTimeDesire: number;
  /** Disposición a cambiar de país o de liga. */
  adventure: number;
}

/** Motivo por el que un club pone a un jugador en la lista de transferibles. */
export type TransferListReason =
  | "surplus"
  | "no-minutes"
  | "contract-ending"
  | "too-old"
  | "needs-cash"
  | "user";

/** Jugador tal y como lo entiende el mercado. */
export interface MarketPlayer {
  id: string;
  name: string;
  age: number;
  /** Media actual. */
  ovr: number;
  /** Potencial estimado. */
  potential: number;
  position: string;
  group: PositionGroup;
  nation: string;
  /** Club actual (id de `TEAMS`) o null si es agente libre. */
  clubId: string | null;
  leagueId: string;
  /** Valor de mercado base en euros. */
  value: number;
  contract: Contract;
  personality: PlayerPersonality;
  /** Está en la lista de transferibles. */
  transferListed: boolean;
  listReason: TransferListReason | null;
  /** Está disponible para cesión. */
  loanListed: boolean;
  /** Club al que está cedido, si procede. */
  loanClubId: string | null;
  /** Minutos acumulados en la temporada (aproximación para decisiones). */
  minutesShare: number;
  /**
   * Atributos de estilo 0..99 (de los datos base de EA FC), usados sólo para
   * el encaje táctico con la identidad de reclutamiento del club.
   */
  attributes: {
    pace: number;
    passing: number;
    physical: number;
    defending: number;
  };
}

// ============================================================================
// CLUBES
// ============================================================================

/** Personalidad y estrategia de mercado de un club. */
export interface ClubProfile {
  clubId: string;
  leagueId: string;
  /** Poder económico relativo 0..1. */
  financialPower: number;
  /** Reputación deportiva 0..1. */
  reputation: number;
  /** Paciencia negociando 0..1 (más paciencia = menos sube su oferta). */
  patience: number;
  /** Agresividad fichando 0..1. */
  aggression: number;
  /** Preferencia por jóvenes 0..1. */
  youthPreference: number;
  /** Preferencia por veteranos 0..1. */
  veteranPreference: number;
  /** Preferencia por jugadores del país del club 0..1. */
  nationalPreference: number;
  /** Preferencia por jugadores de su propia liga 0..1. */
  leaguePreference: number;
  /** Importancia de la cantera 0..1. */
  academyFocus: number;
  /** Ambición general 0..1. */
  ambition: number;
  /** Multiplicador aplicado al precio que exige al vender. */
  sellingToughness: number;
  /** Multiplicador aplicado al precio que está dispuesto a pagar. */
  buyingWillingness: number;
  /** País del club (derivado de su liga). */
  country: string;
  /**
   * Identidad táctica de reclutamiento (0..1 cada una, no tienen que sumar 1).
   * Un club de posesión pesa mucho `passing`; uno de presión/contragolpe,
   * `pace`; uno físico, `physical`; uno disciplinado atrás, `defending`.
   * Así el Manchester City y el Atlético no persiguen al mismo delantero.
   */
  style: {
    pace: number;
    passing: number;
    physical: number;
    defending: number;
  };
}

/** Situación económica de un club. */
export interface ClubFinances {
  clubId: string;
  /** Presupuesto de fichajes disponible en euros. */
  budget: number;
  /** Presupuesto inicial de la ventana (para métricas). */
  initialBudget: number;
  /** Límite de masa salarial anual en euros. */
  wageBudget: number;
  /** Masa salarial comprometida en euros. */
  wageBill: number;
  /** Gasto acumulado en la ventana. */
  spent: number;
  /** Ingresos por ventas en la ventana. */
  earned: number;
}

/** Necesidad detectada en una posición. */
export interface SquadNeed {
  group: PositionGroup;
  /** 0..1, cuanto mayor más urgente. */
  urgency: number;
  /** Número de jugadores en esa demarcación. */
  count: number;
  /** Media de los titulares de esa demarcación. */
  quality: number;
  priority: "critical" | "high" | "medium" | "low";
}

/** Informe completo de una plantilla. */
export interface SquadReport {
  clubId: string;
  size: number;
  averageAge: number;
  /** Media del once ideal. */
  startingRating: number;
  /** Media de los suplentes. */
  benchRating: number;
  /** Conteo por demarcación. */
  countByGroup: Record<PositionGroup, number>;
  /** Media por demarcación. */
  ratingByGroup: Record<PositionGroup, number>;
  needs: SquadNeed[];
  /** Demarcaciones con exceso de jugadores. */
  surplus: PositionGroup[];
  /** Jugadores candidatos a salir. */
  transferables: string[];
  /** Jóvenes candidatos a cesión. */
  loanables: string[];
}

// ============================================================================
// VALORACIÓN
// ============================================================================

/** Escalones de precio de un jugador. */
export interface MarketValuation {
  playerId: string;
  /** Valor de mercado mostrado. */
  marketValue: number;
  /** Mínimo que el club vendedor aceptaría. */
  minimumPrice: number;
  /** Precio que espera obtener. */
  expectedPrice: number;
  /** Precio con el que estaría encantado. */
  idealPrice: number;
  /** Techo que nadie superará. */
  maximumPrice: number;
  /** Precio de salida publicado. */
  listPrice: number;
  isStar: boolean;
  /** Número de clubes interesados considerados en la valoración. */
  competition: number;
}

// ============================================================================
// NEGOCIACIONES
// ============================================================================

export type TransferType = "permanent" | "loan" | "loan-option" | "loan-obligation" | "free";

export type NegotiationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "counter"
  | "final-rejection"
  | "withdrawn"
  | "expired";

/** Cláusulas adicionales de una oferta. */
export interface OfferClauses {
  /** Porcentaje de futura venta (0..1). */
  sellOnPercent: number;
  /** Variables en euros condicionadas al rendimiento. */
  addOns: number;
  /** Porcentaje del salario que asume el club receptor en cesiones (0..1). */
  wageShare: number;
  /** Coste de la opción/obligación de compra en cesiones. */
  optionFee: number;
  /** Jugadores incluidos en el trato. */
  playerSwapIds: string[];
}

/** Oferta concreta por un jugador. */
export interface TransferOffer {
  id: string;
  playerId: string;
  playerName: string;
  /**
   * Club que hace la oferta (comprador/destino).
   *
   * Antes se llamaba `fromClubId`, un nombre que sugería justo lo contrario
   * (el club de origen del jugador). El vendedor real nunca se lee de aquí
   * — `completeTransfer` lo obtiene siempre de `player.clubId` en el momento
   * de cerrar el traspaso — así que renombrarlo a lo que realmente es evita
   * que alguien confíe en el nombre antiguo y calcule mal comprador/vendedor.
   */
  buyerClubId: string;
  /**
   * Club vendedor conocido en el momento de crear la oferta (informativo).
   * No es la fuente de verdad del vendedor al cerrar el traspaso: usa
   * `player.clubId` para eso. Antes se llamaba `toClubId`.
   */
  sellerClubId: string;
  amount: number;
  wageOffer: number;
  type: TransferType;
  clauses: OfferClauses;
  status: NegotiationStatus;
  /** Fecha ISO de creación. */
  date: string;
  /** Número de rondas ya negociadas. */
  round: number;
}

/** Respuesta del club vendedor a una oferta. */
export interface NegotiationResponse {
  status: NegotiationStatus;
  /** Importe pedido si hay contraoferta. */
  counterAmount: number;
  /** Peticiones adicionales del vendedor. */
  demands: OfferClauses | null;
  message: string;
}

/** Negociación viva entre dos clubes. */
export interface Negotiation {
  offer: TransferOffer;
  valuation: MarketValuation;
  /** Fecha ISO del último movimiento. */
  lastUpdate: string;
  rounds: number;
}

// ============================================================================
// HISTORIAL Y RUMORES
// ============================================================================

/** Traspaso completado. */
export interface TransferRecord {
  id: string;
  date: string;
  playerId: string;
  playerName: string;
  fromClubId: string | null;
  toClubId: string;
  fee: number;
  wage: number;
  type: TransferType;
  clauses: OfferClauses;
}

export type RumorKind = "interest" | "wants-out" | "searching" | "bid-war" | "renewal";

/** Rumor de mercado mostrado al usuario. */
export interface Rumor {
  id: string;
  date: string;
  kind: RumorKind;
  clubId: string;
  playerId: string | null;
  text: string;
  /** Fiabilidad 0..1. */
  reliability: number;
}

// ============================================================================
// SIMULACIÓN
// ============================================================================

export type MarketWindow = "summer" | "winter" | "closed";

/** Estado de la simulación diaria. */
export interface MarketSimulationState {
  lastSimulatedDate: string;
  window: MarketWindow;
  /** Día de la ventana actual (1 = primer día). */
  windowDay: number;
  /** Intensidad de la ventana 0..1 (algunas temporadas son tranquilas). */
  intensity: number;
  deadlineDay: boolean;
}

/** Resultado de un día simulado. */
export interface MarketDayResult {
  date: string;
  transfers: TransferRecord[];
  rumors: Rumor[];
  offersMade: number;
  negotiationsOpen: number;
  renewals: number;
  loans: number;
}

/** Resultado genérico de una operación del motor. */
export interface TransferResult {
  success: boolean;
  message: string;
}

// ============================================================================
// DECISIÓN DEL JUGADOR
// ============================================================================

/** Resultado de la decisión de un jugador ante una oferta. */
export type PlayerDecisionVerdict =
  | "accepted"
  | "negotiating"
  | "rejected-wage"
  | "rejected-project";

/** Respuesta del jugador a una propuesta de traspaso o cesión. */
export interface PlayerDecision {
  playerId: string;
  verdict: PlayerDecisionVerdict;
  /** Puntuación global de la propuesta 0..1. */
  score: number;
  /** Atractivo del club de destino 0..1. */
  appeal: number;
  /** Salario anual que pide para firmar. */
  wageRequested: number;
  /** Minutos esperados en el nuevo club 0..1. */
  playingTime: number;
  message: string;
}

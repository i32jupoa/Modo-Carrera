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
  dailyActiveClubShare: 0.55,
  /** Porcentaje de clubes activos durante el deadline day. */
  deadlineActiveClubShare: 1,
  /** Días finales de ventana considerados deadline day. */
  deadlineDays: 3,
  /** Máximo de negociaciones abiertas simultáneas por club. */
  maxNegotiationsPerClub: 5,
  /** Rondas máximas antes del rechazo definitivo. */
  maxNegotiationRounds: 4,
  /** Días que una negociación puede quedarse parada antes de expirar. */
  negotiationExpiryDays: 7,
  /**
   * Máximo de fichajes por club y ventana. Antes no tenía tope real (99), lo
   * que permitía a un club encadenar decenas de fichajes en una sola ventana
   * — nada realista ni siquiera para los clubes más activos del mercado. 10
   * ya cubre holgadamente hasta las ventanas de reconstrucción más locas.
   */
  maxSigningsPerWindow: 10,
  /** Mínimo de fichajes que todo club de la IA debe cerrar en la ventana de invierno. */
  minSigningsPerWindow: 2,
  /**
   * Mínimo de fichajes que todo club de la IA (menos el del usuario) debe
   * cerrar en la ventana de verano. Un mercado de verano real mueve muchos
   * más nombres que el de invierno, así que el suelo es bastante más alto.
   */
  minSigningsPerWindowSummer: 3,
  /**
   * Mínimo de ventas que todo club de la IA (menos el del usuario) debe
   * cerrar en verano. Sin este suelo, un club podía vender jugadores porque
   * otros los reclamaban y no reponer nunca por su cuenta, o al revés:
   * fichar sin soltar lastre. En la vida real todo equipo mueve salidas.
   */
  minSalesPerWindowSummer: 2,
  /** Máximo de ventas por club y ventana. */
  maxSalesPerWindow: 12,
  /**
   * Máximo de cesiones por club y ventana. Antes reutilizaba
   * `maxSalesPerWindow` (12), demasiado alto: un club real cede a un puñado
   * de canteranos o suplentes por verano, no a una docena. Un tope bajo
   * también evita que un club pierda de golpe tantos titulares cedidos que
   * su nivel de plantilla se desplome y acabe "necesitando" fichar
   * cualquier cosa para tapar agujeros.
   */
  maxLoansPerWindow: 5,
  /**
   * Saldo negativo máximo de una ventana: un club no puede terminar el
   * mercado con más de estas salidas por encima de sus llegadas. Sin este
   * tope, los clubes de la IA perdían seis jugadores y fichaban uno.
   */
  maxWindowDeficit: 1,
  /**
   * Ventana de días en la que cada club puede empezar a usar la red de
   * seguridad (fichajes o ventas de emergencia), repartida de forma
   * determinista por club: no todos caen el mismo día. Con un único día fijo
   * para todo el mundo, cientos de clubes disparaban su repesca a la vez y
   * el mercado pasaba de "nada" a "450 fichajes de golpe" en una sola
   * jornada. La ventana de invierno, más corta, usa el mismo rango pero
   * llega a menos días porque la ventana entera dura menos.
   *
   * `maxDay: 35` (antes 20): con un máximo tan bajo, la inmensa mayoría de
   * los clubes cubrían su cupo mínimo antes de terminar julio y, al no tener
   * ya ninguna necesidad real de plantilla, dejaban de fichar por completo
   * hasta el deadline day — el mercado de verano se sentía "vivo" sólo las
   * primeras 3-4 semanas y luego muerto hasta el final, aunque la ventana
   * siga abierta hasta el 1 de septiembre. Al repartir la repesca en un
   * rango más amplio (hasta mediados de agosto), la actividad se nota más
   * a lo largo de toda la ventana en vez de agotarse de golpe al principio.
   */
  safetyNetWindow: { minDay: 5, maxDay: 50 },
  /**
   * Si la red de seguridad no encuentra con quién cerrar el cupo, no se
   * reintenta al día siguiente (casi siempre inútil y caro de comprobar):
   * se espera este número de días antes de volver a probar. El deadline day
   * salta esta espera y siempre da un último empujón.
   */
  safetyNetRetryGapDays: 4,
  /**
   * Diferencia máxima de media (OVR) que la red de seguridad de fichajes
   * tolera entre el techo de plantilla del club (`startingRating`) y el
   * mejor agente libre disponible. El filtro original sólo ponía techo
   * (nunca fichar por encima del nivel del once) pero no suelo, así que un
   * club sin agentes libres decentes cerca de su nivel acababa fichando "el
   * menos malo" aunque estuviera muy por debajo — de ahí fichajes de relleno
   * tipo un jugador de league one por unos pocos miles de euros para un
   * equipo top. Si nadie entra dentro de este margen, la red de seguridad se
   * rinde esta vez (se reintenta más adelante) en vez de forzar un fichaje
   * embarazoso.
   */
  freeAgentMaxOvrGap: 10,
  /**
   * Máximo de traspasos (no cesiones) que un mismo club comprador puede
   * cerrar con un mismo club vendedor dentro de una misma ventana. Sin este
   * tope, si un rival necesitaba varias posiciones a la vez y el mismo
   * vendedor encajaba en todas (p. ej. un lateral, un central y un extremo
   * del mismo equipo), la búsqueda por puntuación podía acabar mandando dos
   * o tres titulares del mismo club al mismo rival en la misma ventana —
   * algo que en la vida real casi nunca pasa entre dos clubes que compiten
   * por lo mismo.
   */
  maxSameSellerPurchasesPerBuyer: 2,
  /**
   * Máximo de salidas "de nivel" (titulares o casi, ver `coreDeparturesFor`
   * en `MarketLocks`) que un mismo club puede sufrir en una sola ventana,
   * sin importar si la salida viene de una puja rival o de la red de
   * seguridad de ventas. Sin este tope un club de la IA podía perder a
   * media alineación titular (los dos porteros, media defensa...) en la
   * misma ventana porque cada venta se decidía de forma aislada. No cuenta
   * a los descartes/suplentes: esos pueden salir sin límite, como en la
   * vida real.
   */
  maxCoreDeparturesPerWindow: 2,
} as const;

/**
 * Mercado de jugadores clave (titulares indiscutibles, ver `isKeyPlayer` en
 * `MarketValuation`). Por defecto un jugador clave con contrato largo no
 * entra en el mercado — así se evita que la IA se los vaya robando entre sí
 * como si fueran suplentes. Pero "por defecto intransferible" no puede
 * significar "nunca, bajo ninguna circunstancia": en la vida real los
 * grandes bombazos existen (un crack que pide salir, un club que paga la
 * cláusula). Sin ninguna válvula de escape, ni siquiera esos casos límite
 * pasaban, y perder a un titular de nivel se convertía en un callejón sin
 * salida: el club afectado no encontraba con quién reponerlo porque todos
 * los buenos reemplazos eran, a su vez, intransferibles en sus clubes.
 */
export const KEY_PLAYER_MARKET = {
  /**
   * Probabilidad, por día y por pareja comprador-jugador que ya cumple el
   * resto de condiciones (necesidad crítica, presupuesto para pagar la
   * cláusula), de que el comprador se atreva a intentarlo. Deliberadamente
   * baja: la rareza real no viene sólo de este número sino de lo poco común
   * que es cumplir las condiciones previas (casi ningún club puede pagar la
   * cláusula de una estrella ajena), así que no hace falta bajarla más para
   * que el bombazo siga siendo la excepción y no la norma.
   */
  approachChance: 0.12,
} as const;

/**
 * Salidas de galáctico: de vez en cuando un club de referencia deja salir a
 * un titular de verdad (no un descarte) porque llega una oferta que no
 * puede rechazar — un Bellingham, un Mbappé, un Griezmann cambiando de aires
 * en pleno verano aunque su club no "necesite" vender. Es un evento
 * narrativo aparte de `KEY_PLAYER_MARKET` (que exige pagar la cláusula al
 * contado): aquí basta con un comprador de peso real y una negociación
 * normal a precio pleno, pero sólo se prueba en los clubes de reputación
 * más alta y con muy poca frecuencia, para que siga siendo la excepción.
 */
export const ELITE_EXIT = {
  /** Reputación mínima (0-1) del club vendedor para que aplique este evento. */
  reputationThreshold: 0.9,
  /** Probabilidad diaria, sólo en verano y fuera de deadline day. */
  dailyChance: 0.006,
  /** Poder financiero mínimo (0-1) que necesita el club comprador. */
  minBuyerFinancialPower: 0.6,
  /** Diferencia máxima de reputación admitida entre vendedor y comprador. */
  maxReputationGap: 0.25,
} as const;

/**
 * Ritmo de los fichajes "grandes" (caros respecto al presupuesto del club)
 * dentro de una ventana. En la vida real ni los clubes más ricos cierran sus
 * fichajes estrella el primer día de mercado: hay pretemporada, cesiones que
 * resolver, ruedas de prensa escalonadas... Ver `transfers/MarketPacing.ts`,
 * que traduce esto en un tope de gasto por operación que empieza bajo y se
 * abre progresivamente a lo largo de la ventana, a un ritmo propio de cada
 * club (no todos "se destapan" el mismo día), para que los traspasos
 * importantes se repartan por todo el mercado en vez de amontonarse en la
 * primera semana.
 */
export const BIG_SIGNING_PACING = {
  /** Fracción del techo de gasto disponible para una sola operación desde
   *  el primer día de la ventana, en una necesidad normal. */
  startRatio: 0.32,
  /** Igual, pero para una necesidad crítica (agujero grave de plantilla):
   *  un club real también tapa urgencias de verdad más rápido. */
  startRatioCritical: 0.55,
  /**
   * Rango, como fracción de la duración total de la ventana, en el que un
   * club deja de tener restricción de gasto por operación. Es un rango
   * amplio a propósito: unos clubes "se lanzan" pronto y otros esperan casi
   * hasta el final, así los grandes anuncios no llegan todos el mismo día.
   */
  rampFractionMin: 0.08,
  rampFractionMax: 0.7,
} as const;

/**
 * Tope de "bombazos" (fichajes muy caros, con eco mediático) que el mercado
 * global puede cerrar el mismo día. `MarketPacing` ya limita cuánto puede
 * comprometer un club por operación según lo avanzada que esté la ventana,
 * pero eso no evita que, por pura coincidencia, varios clubes ricos con
 * necesidades distintas cierren su fichaje estrella justo el mismo día
 * (típicamente muy pronto, nada más abrir el mercado). Este tope hace que,
 * si ya se han anunciado suficientes bombazos hoy, el resto de acuerdos ya
 * cerrados con el club y el jugador esperen a otro día para hacerse
 * oficiales — como en la vida real, donde los grandes anuncios se reparten
 * en el calendario en vez de amontonarse. El deadline day, como el resto de
 * restricciones de ritmo, queda exento: en la última jornada todo se cierra
 * cueste lo que cueste.
 */
export const BIG_DEAL_DAILY_LIMIT = {
  /** Ficha a partir de la cual una operación cuenta como "bombazo". */
  minFee: 35_000_000,
  /** Máximo de bombazos que se anuncian el mismo día en todo el mercado. */
  maxPerDay: 2,
} as const;

/**
 * Suelo de calidad ligado a la reputación del club, no a su plantilla actual.
 *
 * `report.startingRating` se recalcula cada día a partir del once actual, así
 * que si un club pierde a varios titulares seguidos en la misma ventana (unas
 * cesiones, una venta...) esa media se desploma temporalmente. Sin este
 * suelo, un club como el Real Madrid podía terminar "buscando" jugadores por
 * debajo de su nivel real sólo porque su rating recién recalculado había
 * bajado, y acababa fichando suplentes de ligas menores por unos pocos miles
 * de euros — nada realista para un club de máxima reputación. El suelo se
 * basa en `reputation` (0-1, estable durante toda la ventana) y actúa como
 * límite mínimo, no como sustituto del cálculo normal.
 */
export const REPUTATION_OVR_FLOOR = {
  /** OVR base para un club de reputación 0. */
  base: 58,
  /** Puntos de OVR añadidos a `base` para un club de reputación máxima (1). */
  maxBonus: 28,
  /** Margen que se resta al suelo antes de aplicarlo a la lista corta normal
   *  (deja algo de margen para fichajes de rotación por debajo del once). */
  shortlistSlack: 8,
  /** Margen (mayor, porque el mercado de libres es más limitado) para la red
   *  de seguridad de agentes libres. */
  freeAgentSlack: 12,
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
  /**
   * Penalización sobre la puntuación 0..1 cuando el candidato juega en un
   * club "Gigante" de la misma liga que el comprador (un rival directo de
   * arriba de la tabla). En la vida real dos grandes de la misma liga casi
   * nunca se venden titulares entre sí en directo (Real Madrid-Barça,
   * City-Liverpool...); no se bloquea del todo porque alguna vez ocurre
   * (Figo al Madrid en 2000), pero se hace muy improbable.
   */
  domesticRivalScorePenalty: 0.55,
  /**
   * Ruido de "ojeador" añadido a la puntuación final (0..1) de cada pareja
   * club-jugador, estable durante toda la partida (no cambia día a día) pero
   * distinto en cada partida nueva. Sin esto, la puntuación es determinista
   * y puramente jerárquica: el jugador objetivamente mejor de cada
   * demarcación siempre puntúa más alto para cualquier club ambicioso, así
   * que las mismas quince o veinte estrellas mundiales acaban protagonizando
   * todos los traspasos caros de todas las partidas. Este ruido no cambia
   * qué necesita un club (eso lo sigue marcando `need`), pero sí baraja el
   * orden entre candidatos de nivel similar para que no gane siempre el
   * mismo nombre.
   */
  scoutingNoise: 0.16,
} as const;

// ============================================================================
// PUNTUACIÓN DE CANDIDATOS
// ============================================================================

/**
 * Pesos del sistema de puntuación de fichajes (suman 1).
 *
 * `prestige` y `league` estaban casi a cero (0.02 y 0.03): un jugador barato
 * de una liga menor que tapaba un hueco podía puntuar casi igual de bien
 * para el Real Madrid que para un equipo de mitad de tabla, porque `need` +
 * `price` + `wage` (0.46 combinado) dominaban por completo el resultado. Se
 * suben `prestige` y `league` y se baja un poco `need`/`price`/`wage` para
 * que el encaje de nivel entre club y jugador (no sólo si es barato y cubre
 * la posición) pese de verdad en la puntuación final.
 */
export const SCORE_WEIGHTS = {
  need: 0.2,
  quality: 0.16,
  potential: 0.12,
  age: 0.1,
  price: 0.1,
  wage: 0.05,
  nationality: 0.04,
  league: 0.06,
  prestige: 0.1,
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
  /**
   * Techo del presupuesto de un club de la IA, como múltiplo de su
   * presupuesto inicial (`ClubFinances.initialBudget`). `refillForNewWindow`
   * suma cada ventana un porcentaje del presupuesto inicial (premios,
   * ingresos de temporada...) sin descontar nada si el club no gasta, así
   * que sin este techo un club pasivo acumula indefinidamente: en partidas
   * largas (10+ temporadas) un club top podía terminar con miles de
   * millones de euros sin ningún jugador en el mundo capaz de costar tanto
   * (el valor de un jugador ya tiene techo duro, ver `GLOBAL_MAX_VALUE_M`
   * en `data/players.ts`), rompiendo por completo la sensación de escasez
   * del mercado. 3x da margen de sobra para que un club ahorre para un
   * fichaje muy por encima de lo habitual sin permitir una acumulación sin
   * límite. Sólo aplica a clubes de la IA: el presupuesto del club del
   * usuario lo gestiona la partida y nunca se recorta aquí.
   */
  maxBudgetMultiple: 3,
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
  /**
   * Máximo de rumores almacenados. Alto a propósito: al filtrar por un club
   * concreto se muestra su ventana de mercado completa, no sólo los últimos
   * días, así que el histórico tiene que sobrevivir a toda la ventana.
   */
  maxStored: 4000,
  /** Probabilidad de publicar un rumor cuando nace un interés. */
  publishChance: 0.16,
  /**
   * Máximo de rumores que puede protagonizar un mismo club el mismo día.
   * Evita que el feed se llene de diez noticias seguidas del mismo equipo.
   */
  maxPerClubPerDay: 2,
  /** Días que un rumor se considera reciente. */
  freshnessDays: 10,
} as const;


// ============================================================================
// EQUILIBRIO GENERAL
// ============================================================================

export const BALANCE = {
  /** Intensidad mínima de una ventana (temporadas tranquilas). */
  minIntensity: 0.7,
  /** Intensidad máxima (mercados locos). */
  maxIntensity: 1.6,
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
  dormantClubChance: 0.02,
  /** Multiplicador de actividad de la ventana de invierno. */
  winterFactor: 0.55,
  /**
   * Multiplicador de actividad de la ventana de verano. La pretemporada es,
   * con diferencia, el momento de más movimiento del mercado: se aplica
   * sobre la intensidad base para que el verano se note mucho más vivo que
   * el resto del año (más clubes activos cada día y más operaciones por
   * ciclo, ver `MarketSimulation.runClubDay`).
   */
  summerFactor: 1.25,
  /**
   * Multiplicador sobre el número de fichajes que un club puede intentar
   * cerrar en un mismo ciclo diario durante el verano. En invierno no se
   * aplica: la ventana corta y el mercado más parado hacen que un club rara
   * vez necesite firmar varios jugadores el mismo día.
   */
  summerSigningBurst: 1.3,
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

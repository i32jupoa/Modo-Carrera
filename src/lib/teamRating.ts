// ============================================================================
// MEDIA DE EQUIPO A PARTIR DE LA PLANTILLA REAL
// ----------------------------------------------------------------------------
// Antes, la media (att/mid/def) de cada equipo era un número fijo escrito a
// mano en `src/data/teams.ts`, totalmente desconectado de los jugadores reales
// de la plantilla. Esto provocaba situaciones absurdas: un equipo de Segunda
// con mejores jugadores que uno de Primera podía figurar con una media mayor,
// y fichar o vender jugadores no cambiaba en nada la media del club.
//
// Este módulo calcula la media de un equipo directamente a partir de su
// plantilla actual (la que ya tiene en cuenta todos los traspasos), dando
// mucho más peso a los jugadores que formarían el once titular que a los
// suplentes, y con un peso decreciente cuanto más al fondo de la plantilla
// esté un jugador. Al depender solo de los jugadores reales, la media se
// recalcula sola cada vez que el equipo ficha o vende.
// ============================================================================

export type RatedSquadMember = {
  rating: number;
  /** Línea del jugador: portero, defensa, centrocampista o delantero. */
  position: "GK" | "DEF" | "MID" | "FWD";
  /** Edad del jugador. Se usa para no penalizar fichajes de proyección. */
  age?: number;
};

export type TeamRating = {
  att: number;
  mid: number;
  def: number;
};

/** Cuántos jugadores se consideran "el once titular" a efectos de peso. */
const STARTERS = 11;

/**
 * Edad máxima para considerar a un suplente un "jugador de proyección"
 * (cantera/promesa). Un fichaje joven que no entra en el once titular no
 * debe bajar la media del equipo: puede ser una apuesta de futuro, no un
 * refuerzo para el once de ahora.
 */
const PROSPECT_MAX_AGE = 21;

/** Peso de un titular según su puesto en el ranking interno del equipo (0 = mejor jugador). */
function starterWeight(rankInSquad: number): number {
  // 1.30 el mejor jugador del equipo -> 1.10 el "titular número 11".
  // Todos pesan mucho y de forma parecida entre sí: el once es lo que de
  // verdad define el nivel del equipo.
  return 1.3 - rankInSquad * 0.02;
}

/** Peso de un suplente: mucho menor que cualquier titular y decreciente con la profundidad de plantilla. */
function benchWeight(rankInBench: number): number {
  // Empieza en 0.35 (menos de un tercio que el peor titular) y sigue cayendo:
  // el 4º o 5º suplente apenas influye ya en la media del equipo.
  return 0.35 * Math.pow(0.88, rankInBench);
}

/** Peso final de un jugador según su puesto en el ranking del equipo y su edad. */
function weightForMember(rank: number, age?: number): number {
  if (rank < STARTERS) return starterWeight(rank);
  // Suplente joven (posible jugador de proyección/cantera): no cuenta para
  // la media, así que ficharlo nunca puede bajarla.
  if (age !== undefined && age <= PROSPECT_MAX_AGE) return 0;
  return benchWeight(rank - STARTERS);
}

export function clampRating(value: number): number {
  return Math.max(40, Math.min(99, Math.round(value)));
}

/**
 * Calcula la media (att/mid/def) de un equipo a partir de su plantilla real.
 * Los jugadores se ordenan de mejor a peor; los ~11 mejores actúan como el
 * "once titular" (peso alto y homogéneo) y el resto como banquillo (peso bajo
 * y decreciente). La media de cada línea (ataque/medio/defensa) usa el mismo
 * peso por jugador, de forma que un crack en el once cuenta mucho más que un
 * suplente aunque jueguen en la misma posición.
 */
export function computeTeamRatingFromSquad(
  squad: RatedSquadMember[],
  fallback: TeamRating = { att: 65, mid: 65, def: 65 },
): TeamRating {
  if (!squad || squad.length === 0) return fallback;

  const sorted = [...squad].sort((a, b) => (b.rating || 0) - (a.rating || 0));

  const weightedAverage = (bucket: (member: RatedSquadMember) => boolean): number | null => {
    let weightSum = 0;
    let ratingSum = 0;
    sorted.forEach((member, rank) => {
      if (!bucket(member)) return;
      const w = weightForMember(rank, member.age);
      if (w <= 0) return;
      weightSum += w;
      ratingSum += w * (member.rating || 0);
    });
    return weightSum > 0 ? ratingSum / weightSum : null;
  };

  // Media general del equipo (todas las posiciones); sirve de respaldo cuando
  // una línea concreta no tiene jugadores clasificados (p. ej. datos raros).
  const overallAvg = weightedAverage(() => true) ?? (fallback.att + fallback.mid + fallback.def) / 3;

  const attAvg = weightedAverage((m) => m.position === "FWD");
  const midAvg = weightedAverage((m) => m.position === "MID");
  const defAvg = weightedAverage((m) => m.position === "DEF");

  return {
    att: clampRating(attAvg ?? overallAvg),
    mid: clampRating(midAvg ?? overallAvg),
    def: clampRating(defAvg ?? overallAvg),
  };
}

// ============================================================================
// HÁNDICAP POR CATEGORÍA Y ESCALADO DE ÉLITE
// ----------------------------------------------------------------------------
// Dos ajustes finales sobre la media "pura" calculada a partir de la
// plantilla:
//
// 1. Hándicap por categoría: dentro de un mismo país, un equipo de una
//    división inferior recibe una penalización fija en su media aunque su
//    plantilla, jugador a jugador, sea competitiva con la de arriba. Un
//    equipo de Segunda no puede tener más media que uno de Primera del mismo
//    país solo porque sus fichajes puntuales tengan buen OVR.
// 2. Escalado de élite: por encima de un umbral, la diferencia respecto a
//    ese umbral se amplifica, de forma que los mejores equipos del mundo
//    (ej. el mejor equipo, en teoría el PSG) alcancen medias altas (~90) y
//    haya más equipos top con 85 de media o más, no solo un puñado.
// ============================================================================

/** Penalización (en puntos de media) por cada nivel de división por debajo de la 1ª. */
const TIER_PENALTIES = [0, 5, 10, 10];

export function tierHandicap(tier: number): number {
  if (!tier || tier <= 1) return 0;
  const idx = tier - 1;
  if (idx < TIER_PENALTIES.length) return TIER_PENALTIES[idx];
  const last = TIER_PENALTIES[TIER_PENALTIES.length - 1];
  return last + (idx - TIER_PENALTIES.length + 1) * 5;
}

/** A partir de aquí, cada punto por encima se amplifica (ver BOOST_FACTOR). */
const BOOST_BASELINE = 75;
/** Cuánto se amplifica la diferencia sobre el umbral (1.25 = un 25% más de recorrido hacia arriba). */
const BOOST_FACTOR = 1.25;

export function applyEliteBoost(value: number): number {
  if (value <= BOOST_BASELINE) return value;
  return BOOST_BASELINE + (value - BOOST_BASELINE) * BOOST_FACTOR;
}

/**
 * Aplica sobre una media "pura" (ya calculada desde la plantilla) el
 * hándicap de categoría y el escalado de élite, y redondea/limita el
 * resultado final.
 */
export function finalizeTeamRating(raw: TeamRating, leagueTier: number): TeamRating {
  const handicap = tierHandicap(leagueTier);
  const adjust = (v: number) => clampRating(applyEliteBoost(v - handicap));
  return { att: adjust(raw.att), mid: adjust(raw.mid), def: adjust(raw.def) };
}

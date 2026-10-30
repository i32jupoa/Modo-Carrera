import { Team, TEAMS, teamById, findTeamStrict } from "./teams";
import playersData from "./playersData";
import {
  buildPositions,
  canPlayPosition,
  isNaturalFor,
  playerPosCodes,
  toPosCode,
  calculateVersatilityBonus,
  type PosCode,
} from "@/lib/positions";
import type { DynamicPlayerStats, PlayerAttributeRatings } from "@/types/playerStats";
import { ALL_FORMATIONS, FORMATION_COORDINATES, slotPosCode, type FormationName } from "@/lib/formations";

/**
 * Estadísticas ofensivas del dataset FC26 usadas por el motor de partido.
 * Se resuelven por ID directamente desde los datos originales para que
 * también funcionen con partidas guardadas antiguas cuyos objetos Player
 * todavía no contienen estos campos opcionales.
 */
export type PlayerShootingStats = {
  shooting: number;
  finishing: number;
  shotPower: number;
  longShots: number;
  volleys: number;
  penalties: number;
  composure: number;
  positioning: number;
};

export type PlayerCreativeStats = {
  vision: number;
  crossing: number;
  shortPassing: number;
  longPassing: number;
  dribbling: number;
  ballControl: number;
};

const SHOOTING_STATS_BY_ID = new Map<string, PlayerShootingStats>();
const CREATIVE_STATS_BY_ID = new Map<string, PlayerCreativeStats>();
const BASE_SHO_BY_ID = new Map<string, number>();
const BASE_PAS_BY_ID = new Map<string, number>();

for (const raw of Array.isArray(playersData) ? playersData : []) {
  if (raw?.ID == null) continue;
  SHOOTING_STATS_BY_ID.set(String(raw.ID), {
    shooting: Number(raw.SHO ?? raw.shooting ?? 0),
    finishing: Number(raw.Finishing ?? raw.finishing ?? 0),
    shotPower: Number(raw["Shot Power"] ?? raw.shotPower ?? 0),
    longShots: Number(raw["Long Shots"] ?? raw.longShots ?? 0),
    volleys: Number(raw.Volleys ?? raw.volleys ?? 0),
    penalties: Number(raw.Penalties ?? raw.penalties ?? 0),
    composure: Number(raw.Composure ?? raw.composure ?? 0),
    positioning: Number(raw.Positioning ?? raw.positioning ?? 0),
  });
  CREATIVE_STATS_BY_ID.set(String(raw.ID), {
    vision: Number(raw.Vision ?? raw.vision ?? 0),
    crossing: Number(raw.Crossing ?? raw.crossing ?? 0),
    shortPassing: Number(raw["Short Passing"] ?? raw.shortPassing ?? raw.PAS ?? 0),
    longPassing: Number(raw["Long Passing"] ?? raw.longPassing ?? 0),
    dribbling: Number(raw.Dribbling ?? raw.dribbling ?? 0),
    ballControl: Number(raw["Ball Control"] ?? raw.ballControl ?? 0),
  });
  BASE_SHO_BY_ID.set(String(raw.ID), Number(raw.SHO ?? raw.shooting ?? 0));
  BASE_PAS_BY_ID.set(String(raw.ID), Number(raw.PAS ?? raw.passing ?? raw["Short Passing"] ?? 0));
}

export function getPlayerShootingStats(
  playerId: string | number | undefined,
  dynamicAttributes?: Partial<PlayerAttributeRatings>,
): PlayerShootingStats {
  const base = (playerId != null ? SHOOTING_STATS_BY_ID.get(String(playerId)) : undefined) ?? {
    shooting: 0,
    finishing: 0,
    shotPower: 0,
    longShots: 0,
    volleys: 0,
    penalties: 0,
    composure: 0,
    positioning: 0,
  };

  // El OVR dinámico no debe borrar el perfil real del futbolista. Por ejemplo,
  // Kane (96 finishing) sigue siendo mejor finalizador que otro 90 OVR aunque
  // ambos tengan ahora mismo la misma media. El atributo SHO solo mueve el perfil
  // hacia arriba/abajo a medida que progresa.
  const baseSHO = playerId != null ? BASE_SHO_BY_ID.get(String(playerId)) : undefined;
  const dynamicSHO = Number(dynamicAttributes?.SHO);
  const deltaSHO = baseSHO !== undefined && Number.isFinite(baseSHO) && Number.isFinite(dynamicSHO) ? (dynamicSHO - baseSHO) : 0;
  const adjust = (value: number, influence: number) => Math.max(1, Math.min(99, value + deltaSHO * influence));

  return {
    shooting: adjust(base.shooting, 0.70),
    finishing: adjust(base.finishing, 0.82),
    shotPower: adjust(base.shotPower, 0.55),
    longShots: adjust(base.longShots, 0.60),
    volleys: adjust(base.volleys, 0.65),
    penalties: adjust(base.penalties, 0.35),
    composure: adjust(base.composure, 0.45),
    positioning: adjust(base.positioning, 0.60),
  };
}

export function getPlayerCreativeStats(
  playerId: string | number | undefined,
  dynamicAttributes?: Partial<PlayerAttributeRatings>,
): PlayerCreativeStats {
  const base = (playerId != null ? CREATIVE_STATS_BY_ID.get(String(playerId)) : undefined) ?? {
    vision: 0,
    crossing: 0,
    shortPassing: 0,
    longPassing: 0,
    dribbling: 0,
    ballControl: 0,
  };
  const basePAS = playerId != null ? BASE_PAS_BY_ID.get(String(playerId)) : undefined;
  const dynamicPAS = Number(dynamicAttributes?.PAS);
  const deltaPAS = basePAS !== undefined && Number.isFinite(basePAS) && Number.isFinite(dynamicPAS) ? (dynamicPAS - basePAS) : 0;
  const adjust = (value: number, influence: number) => Math.max(1, Math.min(99, value + deltaPAS * influence));

  return {
    vision: adjust(base.vision, 0.75),
    crossing: adjust(base.crossing, 0.65),
    shortPassing: adjust(base.shortPassing, 0.80),
    longPassing: adjust(base.longPassing, 0.55),
    dribbling: adjust(base.dribbling, 0.60),
    ballControl: adjust(base.ballControl, 0.55),
  };
}

export type Position = "GK" | "DEF" | "MID" | "FWD";

export type Player = {
  id: string;
  name: string;
  /** Demarcaciones reales: la primera es la principal; las siguientes son alternativas. */
  positions: PosCode[];
  rating: number;
  /** Potencial real del dataset (techo esperado del jugador). */
  potential: number;
  age: number;
  teamId: string;
  marketValue: number;
  isReal: boolean;
  goals: number;
  assists: number;
  appearances: number;
  injuredUntil: number;
  injuredUntilDate?: string;
  injuryStartDate?: string;
  injuryDurationDays?: number;
  injuryType?: string;
  injuryArea?: string;
  injuryReason?: string;
  morale: number;
  formHistory: number[];
  /** Energía física actual (0-100). La forma no participa en la simulación. */
  energy?: number;
  cardImage?: string;
  /** Estadísticas de balón parado importadas del dataset original. */
  penalties?: number;
  passing?: number;
  longPassing?: number;
  freeKickAccuracy?: number;
  /** Atributos técnicos dinámicos que evolucionan con la progresión. */
  attributes?: PlayerAttributeRatings;
  /** Estadísticas dinámicas que cambian con el tiempo (persistidas por partida) */
  dynamicStats?: DynamicPlayerStats;
};

// ==================== REALISTIC MARKET VALUATION SYSTEM ====================
// Modelo único basado en una curva suave (sin descuentos apilados) para que
// el "valor de mercado" que ve el usuario en el buscador sea la MISMA base
// que usa el motor de negociación (ver src/lib/transfers/MarketValuation.ts).
// Antes existían decenas de multiplicadores y descuentos porcentuales
// aplicados en cadena (edad, posición, liga, media del equipo, umbrales de
// rating...) que hacían que casi cualquier jugador de 90+ de un equipo top
// terminara exactamente en el mismo techo de 220M, sin diferenciar a un
// Mbappé de un Haaland de un canterano de 90 en un equipo pequeño. Esta
// versión usa una curva continua por posición, con techos realistas
// (inspirados en las valoraciones más altas del mercado real) y sin saltos
// bruscos entre rating 85 y 86 o entre liga "top" y "media".

/** Techo de valor por posición específica (en millones de €). Techo global
 *  absoluto añadido más abajo (GLOBAL_MAX_VALUE_M) para que ni el mejor
 *  jugador del juego supere el fichaje más caro de la historia real
 *  (≈220M, Mbappé al PSG). */
const POSITION_VALUE_CAP: Record<PosCode, number> = {
  GK: 75,
  DFC: 120,
  LD: 110,
  LI: 110,
  MCD: 140,
  MC: 150,
  MCO: 165,
  MD: 155,
  MI: 155,
  ED: 180,
  EI: 180,
  DC: 200,
};

/** Techo absoluto en millones de € para CUALQUIER valor o precio del juego
 *  (valor de mercado, precio de negociación, cláusula...). Ni el mejor
 *  jugador del mundo en las mejores condiciones puede superarlo. */
export const GLOBAL_MAX_VALUE_M = 220;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Obtiene el código de posición canónico desde una posición en crudo. */
function getPosCode(pos: string): PosCode {
  const code = toPosCode(pos);
  return code || "MC"; // Fallback a mediocentro si no se reconoce
}

/** Matiz dentro de cada grupo: dos jugadores con el mismo rating no valen
 *  exactamente igual si uno es un extremo desequilibrante y el otro un
 *  pivote defensivo, aunque ambos entren en el grupo "MID". */
function positionRoleModifier(pos: string): number {
  const up = String(pos || "").toUpperCase();
  // Extremos y mediapuntas ofensivos: más valorados por su rareza y atractivo
  if (["LW", "RW", "CAM", "MCO", "LM", "RM", "MD", "MI"].includes(up)) return 1.12;
  // Mediocentros defensivos: menos valorados por su rol más limitado
  if (["CDM", "MCD"].includes(up)) return 0.88;
  // Delanteros centro: valorados por su rol principal
  if (["ST", "CF", "DC"].includes(up)) return 1.08;
  // Centrales defensivos: menos valorados que laterales por su rol más estático
  if (["CB", "DFC", "DEF"].includes(up)) return 0.92;
  // Laterales: valorados por su versatilidad y rareza
  if (["LB", "RB", "LWB", "RWB"].includes(up)) return 1.05;
  return 1.0; // mediocentros puros, GK, etc.
}

/** Curva de rating: continua y muy progresiva (exponente alto). Un jugador
 *  de 91 (el máximo real del juego) se acerca al techo de su posición; un
 *  jugador de 80 se queda en una fracción pequeña de ese techo, como ocurre
 *  en el mercado real, donde la diferencia de precio entre un 91 y un 85 es
 *  enorme y entre un 70 y un 65 es casi simbólica. */
function ratingCurve(rating: number): number {
  const normalized = clamp((rating - 35) / 59, 0, 1.02);
  return Math.pow(normalized, 5);
}

/**
 * Reduce la inflación de jugadores buenos, pero no de élite, especialmente
 * cuando la edad y el potencial disparan el precio por encima de lo que el
 * mercado real pagaría por un futbolista de un club medio. Los jugadores de
 * 88+ conservan intacta la curva anterior para no alterar los precios ya
 * razonables de estrellas como Vinícius o Mbappé.
 */
function playerQualityMarketMultiplier(rating: number): number {
  const points: Array<[number, number]> = [
    [55, 0.32],
    [60, 0.35],
    [65, 0.39],
    [70, 0.43],
    [75, 0.53],
    [80, 0.70],
    [84, 0.86],
    [88, 1.0],
  ];

  if (rating >= 88) return 1;
  if (rating <= points[0][0]) return points[0][1];

  for (let i = 1; i < points.length; i += 1) {
    const [upperRating, upperMultiplier] = points[i];
    const [lowerRating, lowerMultiplier] = points[i - 1];
    if (rating <= upperRating) {
      const progress = (rating - lowerRating) / (upperRating - lowerRating);
      return lowerMultiplier + (upperMultiplier - lowerMultiplier) * progress;
    }
  }

  return 1;
}

/** Curva de edad: pico entre 24 y 27, prima moderada a la proyección joven
 *  y caída progresiva (sin escalones) a partir de los 30. */
function ageCurveMultiplier(age: number): number {
  if (age <= 17) return 1.0;
  if (age <= 19) return 1.1;
  if (age <= 21) return 1.12;
  if (age <= 23) return 1.15;
  if (age <= 27) return 1.2;
  if (age <= 29) return 1.0;
  if (age <= 31) return 0.78;
  if (age <= 33) return 0.56;
  if (age <= 35) return 0.36;
  return 0.22;
}

const TOP_LEAGUES = new Set(["laliga", "premier", "seriea", "bundesliga", "ligue1"]);
const MID_LEAGUES = new Set([
  "championship",
  "ligaportugal",
  "eredivisie",
  "roshnsaudileague",
  "trendyolsperlig",
  "1aproleague",
]);
const SECOND_DIVISION_LEAGUES = new Set(["laliga2", "serieb", "bundesliga2", "ligue2"]);
const LOWER_DIVISION_LEAGUES = new Set(["leagueone", "liga3", "leaguetwo"]);
const OTHER_PRO_LEAGUES = new Set([
  "mls", "lpf", "scottish", "ekstraklasa", "pkobpekstraklaska",
  "bracksuperleague", "3fsuperliga", "allsvenskan", "eliteserien",
  "austrianbundesliga", "superliga",
]);

/**
 * Multiplicador de mercado por nivel real de la competición. Jugar en Segunda
 * no puede dar el mismo escaparate ni la misma valoración que jugar en Primera:
 * las segundas divisiones principales bajan al 60% y las categorías inferiores
 * todavía más. Se mantienen primas para mercados con gran capacidad económica
 * o de reventa, aunque no pertenezcan al top 5.
 */
function leagueValueMultiplier(leagueId: string): number {
  const id = String(leagueId || "").toLowerCase().trim();
  if (TOP_LEAGUES.has(id)) return 1.0;
  if (id === "championship") return 0.68;
  if (id === "roshnsaudileague") return 0.72;
  if (MID_LEAGUES.has(id)) return 0.64;
  // Las segundas divisiones no pueden pagar ni generar el mismo mercado que
  // Primera. Antes el 60% seguía inflando demasiado a promesas de 75-80 OVR.
  if (SECOND_DIVISION_LEAGUES.has(id)) return 0.45;
  if (LOWER_DIVISION_LEAGUES.has(id)) return id === "leagueone" ? 0.36 : 0.32;
  if (OTHER_PRO_LEAGUES.has(id)) return 0.55;
  return 0.46;
}

/** Prima de reputación para clubes con una marca y capacidad de retención global. */
const CLUB_PRESTIGE_BONUS: Record<string, number> = {
  rma: 0.065, bar: 0.06, psg: 0.06, mci: 0.055, liv: 0.05, bay: 0.055,
  ars: 0.04, che: 0.04, mun: 0.04, atm: 0.035, juv: 0.04, int: 0.035,
  mil: 0.03, bvb: 0.025, nap: 0.025, tot: 0.025,
};

/**
 * El nivel del club importa de verdad. Se mezcla la media de su plantilla
 * (cuando está disponible) con la calidad del club registrada en teams.ts;
 * así un jugador igual de bueno vale más en un candidato europeo que en un
 * equipo modesto, incluso si el OVR individual es idéntico.
 */
function teamValueMultiplier(teamAvgRating: number, teamId = ""): number {
  let effectiveRating = Number.isFinite(teamAvgRating) ? teamAvgRating : 75;
  let team: Team | undefined;
  if (teamId) {
    try {
      const candidate = teamById(teamId);
      if (candidate.id.toLowerCase() === teamId.toLowerCase()) team = candidate;
    } catch {
      // Un agente libre o un club inexistente no debe heredar la reputación de otro equipo.
    }
  }

  let categoryBonus = 0;
  if (team) {
    const registeredRating = (team.att + team.mid + team.def) / 3;
    effectiveRating = effectiveRating > 50
      ? effectiveRating * 0.68 + registeredRating * 0.32
      : registeredRating;
    if (team.category === "Gigante") categoryBonus = 0.055;
    else if (team.category === "Aspirante") categoryBonus = 0.025;
  }

  // Una plantilla modesta recibe un descuento apreciable; el nivel deportivo
  // y la reputación elevan el multiplicador hasta los valores de los gigantes.
  const sportingLevel = clamp((effectiveRating - 58) / 34, 0, 1);
  const prestigeBonus = CLUB_PRESTIGE_BONUS[team?.id ?? teamId] ?? 0;
  return clamp(0.62 + sportingLevel * 0.46 + categoryBonus + prestigeBonus, 0.58, 1.18);
}


/**
 * Ajuste de poder adquisitivo del club. La fórmula de reputación anterior se
 * mantiene para los gigantes, pero los clubes de nivel medio/bajo reciben un
 * descuento adicional: sus jugadores no deben conservar precios de mercado
 * propios de equipos con presencia europea constante.
 */
function clubMarketAccessibilityMultiplier(teamAvgRating: number, teamId = ""): number {
  if (!teamId) return 1;

  let team: Team | undefined;
  try {
    const candidate = teamById(teamId);
    if (candidate.id.toLowerCase() === teamId.toLowerCase()) team = candidate;
  } catch {
    // Los agentes libres no heredan el nivel de un club de respaldo.
  }
  if (!team) return 1;

  const registeredRating = (team.att + team.mid + team.def) / 3;
  const suppliedRating = Number.isFinite(teamAvgRating) ? teamAvgRating : registeredRating;
  const effectiveRating = suppliedRating > 50
    ? suppliedRating * 0.68 + registeredRating * 0.32
    : registeredRating;
  const normalizedLevel = clamp((effectiveRating - 60) / 25, 0, 1);
  return 0.78 + normalizedLevel * 0.22;
}

/**
 * Descuento estructural adicional para los clubes modestos. El nivel de liga
 * por sí solo no basta: un jugador del Elche, Málaga u otro club de la zona
 * baja no debe costar lo mismo que un futbolista equivalente de un aspirante
 * europeo. En clubes con valoración global <=73 se reduce a la mitad el valor
 * base; el descuento se suaviza progresivamente en clubes de nivel medio.
 * Los jugadores de élite (88+) quedan protegidos por la regla de estrellas.
 */
function modestClubMarketMultiplier(teamAvgRating: number, teamId = ""): number {
  if (!teamId) return 1;
  let team: Team | undefined;
  try {
    const candidate = teamById(teamId);
    if (candidate.id.toLowerCase() === teamId.toLowerCase()) team = candidate;
  } catch {
    // No aplicar descuento a agentes libres o IDs sin resolver.
  }
  if (!team) return 1;

  // Este descuento depende del nivel estructural del club, no de la media
  // momentánea de su plantilla: evita que un par de jugadores buenos eleven
  // artificialmente el precio de todo el equipo.
  const effectiveRating = (team.att + team.mid + team.def) / 3;

  if (effectiveRating <= 73) return 0.5;
  if (effectiveRating <= 78) return 0.5 + ((effectiveRating - 73) / 5) * 0.2;
  if (effectiveRating <= 83) return 0.7 + ((effectiveRating - 78) / 5) * 0.3;
  return 1;
}

// Generate transfermarkt-style value string
export function formatMarketValue(valueM: number): string {
  if (valueM >= 100) return `€${valueM.toFixed(0)}M`;
  if (valueM >= 10) return `€${valueM.toFixed(1)}M`;
  if (valueM >= 1) return `€${valueM.toFixed(2)}M`;
  return `€${Math.round(valueM * 1000)}K`;
}

// Main valuation function — curva continua por posición, edad, potencial, liga y equipo.
// Este es el ÚNICO valor de mercado del juego: tanto la interfaz de
// scouting como el motor de negociación (MarketValuation.ts) parten de este
// número, así que el precio que se negocia nunca se dispara muy por encima
// del valor que el usuario ve en la lista.
export function marketValueFor(
  rating: number,
  age: number,
  pos = "MID",
  teamId = "",
  leagueId = "",
  goals = 0,
  assists = 0,
  appearances = 0,
  isStar = false,
  teamAvgRating = 75,
  positions?: PosCode[],
  dynamicOVR?: number,
  potential?: number,
): { value: number; explanation: string } {
  // Use dynamic OVR if provided, otherwise use static rating
  const effectiveRating = dynamicOVR || rating;

  if (effectiveRating < 55)
    return { value: 0.05, explanation: "Jugador amateur sin valor de mercado" };

  const posCode = getPosCode(pos);
  const cap = POSITION_VALUE_CAP[posCode] || 150;

  const curve = ratingCurve(effectiveRating);
  const ageMult = ageCurveMultiplier(age);
  const roleMult = positionRoleModifier(pos);
  let valuationTeam: Team | undefined;
  if (teamId) {
    try {
      const candidate = teamById(teamId);
      if (candidate.id.toLowerCase() === teamId.toLowerCase()) valuationTeam = candidate;
    } catch {
      // Continúa con los parámetros recibidos para agentes libres o IDs antiguos.
    }
  }
  const effectiveLeagueId = leagueId || valuationTeam?.league || "";
  const leagueMult = leagueValueMultiplier(effectiveLeagueId);
  const teamMult = teamValueMultiplier(teamAvgRating, teamId);
  const qualityMarketMult = playerQualityMarketMultiplier(effectiveRating);
  // Las estrellas de 88+ mantienen exactamente su valoración previa. Para el
  // resto, media individual, liga y poder adquisitivo del club pesan más.
  const clubAccessibilityMult = effectiveRating >= 88
    ? 1
    : clubMarketAccessibilityMultiplier(teamAvgRating, teamId);
  const versatilityMult = positions ? calculateVersatilityBonus(positions) : 1.0;

  // Prima de potencial basada en el dato REAL de players.json.
  // El potencial no sustituye al OVR actual: se suma como una prima de
  // proyección sobre el valor ya calculado. Cuanto mayor sea la distancia
  // entre OVR y potencial y cuanto más joven sea el jugador, mayor será la
  // prima. Así un talento generacional de 19 años puede valer bastante más
  // que un jugador de la misma media sin proyección, sin inflar por igual a
  // todos los jóvenes.
  const effectivePotential = clamp(potential ?? effectiveRating, effectiveRating, 99);
  const potentialGap = Math.max(0, effectivePotential - effectiveRating);
  const potentialWeight =
    age <= 19 ? 0.06 :
    age <= 21 ? 0.05 :
    age <= 23 ? 0.04 :
    age <= 25 ? 0.025 :
    age <= 27 ? 0.015 :
    0.005;
  const potentialPremium = clamp(1 + potentialGap * potentialWeight, 1, 1.45);

  const modestClubMult = effectiveRating >= 88
    ? 1
    : modestClubMarketMultiplier(teamAvgRating, teamId);

  let finalValue =
    cap * curve * ageMult * roleMult * leagueMult * teamMult * qualityMarketMult * clubAccessibilityMult * modestClubMult * versatilityMult * potentialPremium;

  // Techo absoluto global: ni el mejor jugador del juego en las mejores
  // condiciones puede superar el fichaje más caro de la historia real.
  finalValue = Math.min(finalValue, GLOBAL_MAX_VALUE_M);
  finalValue = Math.max(0.08, finalValue);
  finalValue = Math.round(finalValue * 100) / 100;

  // Explicación legible para la ficha del jugador.
  const reasons: string[] = [];
  if (effectiveRating >= 90) reasons.push("jugador de clase mundial");
  else if (effectiveRating >= 87) reasons.push("jugador de élite");
  else if (effectiveRating >= 84) reasons.push("muy buen nivel");
  else if (effectiveRating >= 80) reasons.push("buen nivel");
  else if (effectiveRating >= 75) reasons.push("nivel sólido");
  else reasons.push("jugador de rol");

  if (age <= 21) reasons.push("gran proyección");
  else if (age <= 29) reasons.push("edad óptima");
  else reasons.push("veterano");

  // Determinar tipo de posición basado en PosCode
  const isDefensive = ["GK", "DFC", "LD", "LI", "MCD"].includes(posCode);
  const isAttacking = ["ED", "EI", "DC", "MCO", "MD", "MI"].includes(posCode);

  if (isAttacking) reasons.push("posición ofensiva");
  else if (isDefensive) reasons.push("posición defensiva");
  else reasons.push("posición mixta");

  if (positions && positions.length > 1) reasons.push("versátil");
  if (potentialGap >= 5) reasons.push(`potencial ${Math.round(effectivePotential)}`);

  if (TOP_LEAGUES.has(effectiveLeagueId)) reasons.push("liga top");
  else if (SECOND_DIVISION_LEAGUES.has(effectiveLeagueId)) reasons.push("segunda división");
  else if (MID_LEAGUES.has(effectiveLeagueId) || OTHER_PRO_LEAGUES.has(effectiveLeagueId)) reasons.push("liga profesional secundaria");
  else reasons.push("liga de menor nivel");

  if (teamMult >= 1.05) reasons.push("club de gran prestigio");
  else if (teamMult <= 0.85) reasons.push("club de nivel modesto");
  else if (teamAvgRating >= 80) reasons.push("equipo de primer nivel");

  const explanation = `Valorado en ${formatMarketValue(finalValue)}: ${reasons.join(", ")}.`;

  return { value: finalValue, explanation };
}

// Legacy function for backwards compatibility
export function legacyMarketValueFor(
  rating: number,
  age: number,
  pos = "MID",
  teamAvgRating = 75,
): number {
  const result = marketValueFor(rating, age, pos, "", "", 0, 0, 0, false, teamAvgRating);
  return result.value;
}

// Vincula el string de club del dataset con los IDs de teams.ts usando SOLO
// coincidencias exactas o alias declarados (y la liga, si está disponible).
// Cualquier club que no exista en el juego devuelve "free_agent", de forma que
// las plantillas iniciales son exactamente las de la base de datos.
function findTeamIdForPlayer(jsonTeamName: string, jsonLeagueName?: string): string {
  if (!jsonTeamName) return "free_agent";
  const team = findTeamStrict(jsonTeamName, jsonLeagueName);
  return team ? team.id : "free_agent";
}

let cachedSquads: Record<string, Player[]> | null = null;
const CACHE_VERSION = 14; // Added discount logging for debugging

export function invalidateSquadsCache() {
  cachedSquads = null;
}

export function generateAllSquads(dynamicStatsMap?: Record<string, any>): Record<string, Player[]> {
  // Always regenerate to ensure fresh market values with new system
  // (Remove this check if performance becomes an issue)
  // if (cachedSquads) return cachedSquads;

  const map: Record<string, Player[]> = {};

  // Inicializamos las listas de todos los equipos registrados en el sistema
  TEAMS.forEach((t) => {
    map[t.id] = [];
  });
  map["free_agent"] = [];

  const dataArray = Array.isArray(playersData) ? playersData : [];

  // PASO 1: Primero recolectamos todos los jugadores sin calcular valores de mercado
  const rawPlayers: Array<{
    id: string;
    name: string;
    rating: number;
    age: number;
    teamId: string;
    leagueId: string;
    pos: string;
    cardImage: string;
    rawData: any;
    idx: number;
  }> = [];

  const teamRatings: Record<string, number[]> = {};

  dataArray.forEach((p: any, idx: number) => {
    const rating = p.OVR || p.rating || 70;
    const age = p.Age || p.age || 24;
    const pos = p.Position || p.position || "MID";
    const jsonTeamName = p.Team || p.Club || p.team || p.club || "";
    const jsonLeagueName = p.League || p.league || "";

    const teamId = findTeamIdForPlayer(jsonTeamName, jsonLeagueName);
    const team = teamId === "free_agent" ? null : teamById(teamId);
    const leagueId = team?.league || "";
    const effectiveTeamId = map[teamId] ? teamId : "free_agent";

    // Acumulamos ratings por equipo para calcular la media
    if (!teamRatings[effectiveTeamId]) {
      teamRatings[effectiveTeamId] = [];
    }
    teamRatings[effectiveTeamId].push(rating);

    rawPlayers.push({
      id: p.ID ? String(p.ID) : `p-${idx}`,
      name: p.Name || p.name || "Jugador",
      rating,
      age,
      teamId: effectiveTeamId,
      leagueId,
      pos,
      cardImage: p.card || p.cardImage || p.PhotoUrl || "",
      rawData: p,
      idx,
    });
  });

  // Calculamos la media de cada equipo
  const teamAverages: Record<string, number> = {};
  for (const [tid, ratings] of Object.entries(teamRatings)) {
    teamAverages[tid] =
      ratings.length > 0 ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 75;
  }

  // PASO 2: Calculamos valores de mercado con las medias de equipo reales
  rawPlayers.forEach((rp) => {
    const teamAvgRating = teamAverages[rp.teamId] || 75;

    // Use dynamic OVR if available, otherwise use static rating
    const dynamicOVR = dynamicStatsMap?.[rp.id]?.dynamicStats?.currentOVR;
    const effectiveRating = Math.round(Number(dynamicOVR ?? rp.rating));

    const playerPositions = buildPositions(
      rp.rawData?.Position ?? rp.pos,
      rp.rawData?.["Alternative positions"],
    );

    const marketValueResult = marketValueFor(
      effectiveRating,
      rp.age,
      rp.pos,
      rp.teamId,
      rp.leagueId,
      0,
      0,
      0,
      false,
      teamAvgRating,
      playerPositions,
      Math.round(Number(dynamicOVR ?? effectiveRating)),
      Math.round(Number(rp.rawData?.potential ?? rp.rating)),
    );

    const playerObj: Player = {
      id: rp.id,
      name: rp.name,
      positions: buildPositions(
        rp.rawData?.Position ?? rp.pos,
        rp.rawData?.["Alternative positions"],
      ),
      rating: effectiveRating,
      potential: Math.max(effectiveRating, Math.round(Number(rp.rawData?.potential ?? rp.rating))),
      age: rp.age,
      teamId: rp.teamId,
      marketValue: marketValueResult.value,
      isReal: true,
      goals: 0,
      assists: 0,
      appearances: 0,
      injuredUntil: 0,
      injuredUntilDate: undefined,
      injuryStartDate: undefined,
      injuryDurationDays: undefined,
      injuryType: undefined,
      injuryArea: undefined,
      morale: 70,
      formHistory: [],
      cardImage: rp.cardImage,
      penalties: Number(rp.rawData?.Penalties ?? rp.rawData?.penalties ?? 0),
      passing: Number(rp.rawData?.PAS ?? rp.rawData?.Passing ?? rp.rawData?.['Short Passing'] ?? 0),
      longPassing: Number(rp.rawData?.['Long Passing'] ?? rp.rawData?.longPassing ?? 0),
      freeKickAccuracy: Number(
        rp.rawData?.['Free Kick Accuracy'] ?? rp.rawData?.freeKickAccuracy ?? 0,
      ),
    };

    if (map[rp.teamId]) {
      map[rp.teamId].push(playerObj);
    } else {
      map["free_agent"].push(playerObj);
    }
  });

  // Ordenamos las plantillas (mejores arriba). NO se inyectan jugadores de
  // relleno: la plantilla inicial de cada equipo es exactamente la que
  // aparece en la base de datos.
  const positionOrder: Record<PosCode, number> = {
    GK: 0,
    DFC: 1,
    LD: 2,
    LI: 3,
    MCD: 4,
    MC: 5,
    MCO: 6,
    MD: 7,
    MI: 8,
    ED: 9,
    EI: 10,
    DC: 11,
  };
  TEAMS.forEach((t) => {
    if (map[t.id]) {
      map[t.id].sort((a, b) => {
        const aPos = a.positions[0] || "MC";
        const bPos = b.positions[0] || "MC";
        return (positionOrder[aPos] ?? 99) - (positionOrder[bPos] ?? 99) || b.rating - a.rating;
      });
    }
  });

  cachedSquads = map;
  return map;
}

export function generateSquad(team: Team, dynamicStatsMap?: Record<string, any>): Player[] {
  const all = generateAllSquads(dynamicStatsMap);
  return all[team.id] || [];
}

/** Resultado de elegir automáticamente el sistema que mejor encaja con una plantilla. */
export type BestStartingLineup = {
  formation: FormationName;
  ids: string[];
  filledSlots: number;
  totalRating: number;
};

/** Asignación óptima de futbolistas a huecos, sin repetir jugadores. */
function maximumWeightLineupAssignment(weights: number[][]): number[] {
  const rowCount = weights.length;
  if (!rowCount) return [];
  const columnCount = weights[0]?.length ?? 0;
  if (columnCount < rowCount) throw new Error("La matriz de alineación debe tener suficientes columnas");

  const u = new Array(rowCount + 1).fill(0);
  const v = new Array(columnCount + 1).fill(0);
  const matchedRow = new Array(columnCount + 1).fill(0);
  const previousColumn = new Array(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row++) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minimum = new Array(columnCount + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array(columnCount + 1).fill(false);

    do {
      used[currentColumn] = true;
      const currentRow = matchedRow[currentColumn];
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let column = 1; column <= columnCount; column++) {
        if (used[column]) continue;
        const cost = -weights[currentRow - 1][column - 1] - u[currentRow] - v[column];
        if (cost < minimum[column]) {
          minimum[column] = cost;
          previousColumn[column] = currentColumn;
        }
        if (minimum[column] < delta) {
          delta = minimum[column];
          nextColumn = column;
        }
      }
      for (let column = 0; column <= columnCount; column++) {
        if (used[column]) {
          u[matchedRow[column]] += delta;
          v[column] -= delta;
        } else {
          minimum[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);

    do {
      const previous = previousColumn[currentColumn];
      matchedRow[currentColumn] = matchedRow[previous];
      currentColumn = previous;
    } while (currentColumn !== 0);
  }

  const assignment = new Array(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column++) {
    if (matchedRow[column] > 0) assignment[matchedRow[column] - 1] = column - 1;
  }
  return assignment;
}

/**
 * Calcula qué formación permite alinear el mayor número de jugadores y, entre
 * esas opciones, suma la mayor valoración posible. Solo admite la posición
 * principal o una alternativa declarada; las columnas ficticias representan
 * huecos vacíos cuando la plantilla no tiene un especialista.
 */
export function bestStartingLineup(
  squad: Player[],
  unavailable: Set<string> = new Set(),
): BestStartingLineup {
  const available = squad.filter((player) => !unavailable.has(player.id));
  const candidates: Array<{ setup: BestStartingLineup; positionFit: number }> = [];

  for (const formation of ALL_FORMATIONS) {
    const coordinates = FORMATION_COORDINATES[formation];
    const slotKeys = Object.keys(coordinates ?? {});
    if (slotKeys.length !== 11 || slotKeys.filter((key) => slotPosCode(key) === "GK").length !== 1) continue;

    // Primero se maximiza el número de huecos cubiertos; después, el nivel del
    // once y la preferencia por la posición principal frente a una alternativa.
    const weights = slotKeys.map((key) => {
      const required = slotPosCode(key);
      const playerWeights = available.map((player) => {
        const positions = playerPosCodes(player);
        if (!positions.includes(required)) return -1_000_000_000;
        const rating = Number(player.rating) || 0;
        const positionBonus = positions[0] === required ? 4 : 2;
        return 1_000_000 + rating * 100 + positionBonus;
      });
      return [...playerWeights, ...new Array(11).fill(0)];
    });

    const assignment = maximumWeightLineupAssignment(weights);
    const ids = slotKeys.map((key, index) => {
      const playerIndex = assignment[index];
      if (playerIndex < 0 || playerIndex >= available.length) return "";
      const player = available[playerIndex];
      return playerPosCodes(player).includes(slotPosCode(key)) ? player.id : "";
    });
    const selected = ids.map((id, index) => ({
      player: id ? available.find((candidate) => candidate.id === id) : undefined,
      required: slotPosCode(slotKeys[index]),
    })).filter((entry): entry is { player: Player; required: PosCode } => !!entry.player);
    const setup: BestStartingLineup = {
      formation,
      ids,
      filledSlots: selected.length,
      totalRating: selected.reduce((sum, entry) => sum + (Number(entry.player.rating) || 0), 0),
    };
    const positionFit = selected.reduce((sum, entry) =>
      sum + (playerPosCodes(entry.player)[0] === entry.required ? 4 : 2), 0);
    candidates.push({ setup, positionFit });
  }

  return candidates.sort((a, b) =>
    b.setup.filledSlots - a.setup.filledSlots ||
    b.setup.totalRating - a.setup.totalRating ||
    b.positionFit - a.positionFit ||
    ALL_FORMATIONS.indexOf(a.setup.formation) - ALL_FORMATIONS.indexOf(b.setup.formation),
  )[0]?.setup ?? {
    formation: "Táctica 4-3-3",
    ids: new Array(11).fill(""),
    filledSlots: 0,
    totalRating: 0,
  };
}

/**
 * Demarcaciones exactas del 4-3-3 por defecto, en el MISMO orden que los
 * huecos de FORMATION_COORDINATES["Táctica 4-3-3"]
 * (gk, lb, cb1, cb2, rb, cm1..cm3, lw, st, rw).
 */
const DEFAULT_LINEUP_SLOTS: PosCode[] = [
  "GK",
  "LI",
  "DFC",
  "DFC",
  "LD",
  "MC",
  "MC",
  "MC",
  "EI",
  "DC",
  "ED",
];

export function defaultLineup(squad: Player[], unavailable: Set<string> = new Set()): string[] {
  const available = squad.filter((p) => !unavailable.has(p.id));
  const used = new Set<string>();
  const lineup: string[] = DEFAULT_LINEUP_SLOTS.map(() => "");
  const scoreFor = (player: Player, slot: PosCode) => {
    const positions = playerPosCodes(player);
    // La valoración o la similitud entre demarcaciones nunca habilitan una
    // posición que el jugador no tenga declarada. Lautaro (DC), por ejemplo,
    // no puede ocupar un MC en el once automático.
    if (!positions.includes(slot)) return -10000;
    const rating = Number(player.rating) || 0;
    return rating + (positions[0] === slot ? 4 : 2);
  };

  // El portero se asigna primero. Cada jugador de campo solo puede ocupar
  // una demarcación que tenga declarada; los huecos sin especialista quedan libres.
  const keeperIndex = DEFAULT_LINEUP_SLOTS.findIndex((slot) => slot === "GK");
  if (keeperIndex >= 0) {
    const keeper = available.filter((p) => !used.has(p.id) && playerPosCodes(p).includes("GK"))
      .sort((a, b) => scoreFor(b, "GK") - scoreFor(a, "GK"))[0];
    if (keeper) { lineup[keeperIndex] = keeper.id; used.add(keeper.id); }
  }
  DEFAULT_LINEUP_SLOTS.forEach((slot, i) => {
    if (slot === "GK") return;
    const pick = available
      .filter((p) => !used.has(p.id) && playerPosCodes(p).includes(slot))
      .sort((a, b) => scoreFor(b, slot) - scoreFor(a, slot) || b.rating - a.rating)[0];
    if (pick) { used.add(pick.id); lineup[i] = pick.id; }
  });
  // Los huecos sin especialista se dejan vacíos: nunca se completa el once
  // colocando a un delantero como centrocampista o viceversa.
  return lineup;
}

export function avgForm(p: Player): number {
  if (p.formHistory.length === 0) return 50;
  const avg = p.formHistory.reduce((a, b) => a + b, 0) / p.formHistory.length;
  return Math.round(avg * 10);
}

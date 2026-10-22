/**
 * Sistema dinámico de progresión/regresión de jugadores.
 *
 * Principios:
 * - La media evoluciona durante la temporada, no solo en verano.
 * - El potencial es una estimación dinámica de la media que el jugador podría alcanzar; no es un techo rígido.
 * - Un jugador con media baja y la misma proyección estimada crece más rápido porque tiene
 *   más margen de desarrollo.
 * - Edad, rendimiento, producción ofensiva, minutos, MVP, forma y lesiones
 *   largas modifican la velocidad de crecimiento.
 * - Los atributos técnicos evolucionan junto a la media, con especialización
 *   según la posición.
 */

import type {
  DynamicPlayerStats,
  PlayerAttributeRatings,
  SeasonStats,
} from "@/types/playerStats";
import type { PosCode } from "@/lib/positions";

const ATTRIBUTE_KEYS: Array<keyof PlayerAttributeRatings> = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"];

export function normalizeDynamicStats(
  raw: Partial<DynamicPlayerStats> | null | undefined,
  baseOVR = 70,
  basePotential = Math.min(99, baseOVR + 10),
  baseAttributes?: Partial<PlayerAttributeRatings>,
): DynamicPlayerStats {
  const source = raw ?? {};
  const n = (value: unknown, fallback = 0) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;
  const arr = (value: unknown): any[] => (Array.isArray(value) ? value : []);

  const fallbackAttributes: PlayerAttributeRatings = {
    PAC: n(baseAttributes?.PAC, baseOVR),
    SHO: n(baseAttributes?.SHO, baseOVR),
    PAS: n(baseAttributes?.PAS, baseOVR),
    DRI: n(baseAttributes?.DRI, baseOVR),
    DEF: n(baseAttributes?.DEF, baseOVR),
    PHY: n(baseAttributes?.PHY, baseOVR),
  };

  const sourceAttributes = (source as any).attributes ?? {};
  const attributes: PlayerAttributeRatings = {
    PAC: Math.max(1, Math.min(99, n(sourceAttributes.PAC, fallbackAttributes.PAC))),
    SHO: Math.max(1, Math.min(99, n(sourceAttributes.SHO, fallbackAttributes.SHO))),
    PAS: Math.max(1, Math.min(99, n(sourceAttributes.PAS, fallbackAttributes.PAS))),
    DRI: Math.max(1, Math.min(99, n(sourceAttributes.DRI, fallbackAttributes.DRI))),
    DEF: Math.max(1, Math.min(99, n(sourceAttributes.DEF, fallbackAttributes.DEF))),
    PHY: Math.max(1, Math.min(99, n(sourceAttributes.PHY, fallbackAttributes.PHY))),
  };

  // Conservamos los decimales del OVR dinámico. La interfaz sigue mostrando
  // un entero, pero el motor acumula la evolución real mes a mes y entre temporadas.
  const currentOVR = clamp(n(source.currentOVR, baseOVR), 50, 99);
  // Saves creados antes del sistema de progresión persistente podían mover
  // `baseOVR` al final de cada temporada. Cuando falta `lastProgressionDelta`
  // sabemos que aún no llevan el nuevo esquema y restauramos como referencia
  // la media real del dataset.
  const legacyProgression = !Object.prototype.hasOwnProperty.call(source, "lastProgressionDelta");
  const normalizedBase = Math.round(Math.max(50, Math.min(99, legacyProgression ? baseOVR : n(source.baseOVR, baseOVR))));
  // El potencial es una previsión, no un límite: puede quedar por debajo o por encima
  // de la media actual y reajustarse con la evolución del jugador.
  const normalizedPotential = clamp(n(source.potentialOVR, basePotential), 50, 99);

  return {
    seasonGoals: n(source.seasonGoals),
    seasonAssists: n(source.seasonAssists),
    seasonAppearances: n(source.seasonAppearances),
    seasonMinutes: n(source.seasonMinutes),
    seasonMVPs: n(source.seasonMVPs),
    seasonCleanSheets: n(source.seasonCleanSheets),
    seasonAverageRating: n(source.seasonAverageRating, 6),
    seasonRatingTotal: n(source.seasonRatingTotal),
    seasonRatingCount: n(source.seasonRatingCount),
    seasonTrophies: n(source.seasonTrophies),
    monthlyStats: arr(source.monthlyStats).map((m: any) => ({
      month: n(m?.month),
      year: n(m?.year),
      goals: n(m?.goals),
      assists: n(m?.assists),
      appearances: n(m?.appearances),
      averageRating: n(m?.averageRating, 6),
      mvpCount: n(m?.mvpCount),
      cleanSheets: n(m?.cleanSheets),
      ratingTotal: n(m?.ratingTotal),
      ratingCount: n(m?.ratingCount),
      teamId: typeof m?.teamId === "string" ? m.teamId : undefined,
      ovr: Number.isFinite(Number(m?.ovr)) ? clamp(Number(m.ovr), 50, 99) : undefined,
    })),
    currentOVR,
    baseOVR: normalizedBase,
    potentialOVR: Math.round(normalizedPotential),
    attributes,
    formHistory: arr(source.formHistory).map((v) => n(v)).slice(-10),
    careerSeasons: arr(source.careerSeasons) as SeasonStats[],
    lastProgressionMonth: n(source.lastProgressionMonth, -1),
    lastProgressionYear: n(source.lastProgressionYear, -1),
    lastProgressionDelta: n(source.lastProgressionDelta),
    lastProgressionDate:
      typeof source.lastProgressionDate === "string" ? source.lastProgressionDate : undefined,
    lastProgressionReason:
      typeof source.lastProgressionReason === "string" ? source.lastProgressionReason : undefined,
    lastSeasonEndSeason: n(source.lastSeasonEndSeason),
  };
}

function ageGrowthFactor(age: number): number {
  // La edad es un modificador suave: el rendimiento de la temporada manda.
  if (age <= 18) return 1.18;
  if (age <= 20) return 1.14;
  if (age <= 22) return 1.10;
  if (age <= 24) return 1.07;
  if (age <= 27) return 1.03;
  if (age <= 30) return 1.00;
  if (age <= 32) return 0.97;
  if (age <= 34) return 0.93;
  if (age <= 36) return 0.87;
  return 0.80;
}

function roleFromPositions(positions: PosCode[]): "GK" | "DEF" | "MID" | "FWD" {
  if (positions.includes("GK")) return "GK";

  // La demarcación principal manda. Esto evita clasificar a un CAM/MC que
  // también puede jugar de delantero como atacante a tiempo completo (caso
  // especialmente importante para centrocampistas como Bellingham).
  const primary = positions[0];
  if (["MCO", "MCD", "MC", "MD", "MI"].includes(primary)) return "MID";
  if (["DFC", "LD", "LI"].includes(primary)) return "DEF";
  if (["DC", "ED", "EI"].includes(primary)) return "FWD";

  if (positions.some((p) => ["MCO", "MCD", "MC", "MD", "MI"].includes(p))) return "MID";
  if (positions.some((p) => ["DFC", "LD", "LI"].includes(p))) return "DEF";
  if (positions.some((p) => ["DC", "ED", "EI"].includes(p))) return "FWD";
  return "DEF";
}

function roleWeights(positions: PosCode[]) {
  const role = roleFromPositions(positions);
  const primary = positions[0];

  // Cada demarcación tiene referencias propias por 90 minutos. En especial,
  // al MCD no se le exige producir goles como un MCO: pesan más la fiabilidad
  // defensiva, la limpieza de portería y la contribución con balón. Si marca
  // mucho, aun así obtiene una recompensa notable.
  if (primary === "MCD") {
    return {
      goal: 0.07,
      assist: 0.18,
      clean: 0.24,
      goalWeight: 0.18,
      assistWeight: 0.32,
      cleanWeight: 0.50,
    };
  }
  if (primary === "MCO") {
    return {
      goal: 0.24,
      assist: 0.28,
      clean: 0.08,
      goalWeight: 0.43,
      assistWeight: 0.50,
      cleanWeight: 0.07,
    };
  }

  switch (role) {
    case "GK":
      return {
        goal: 0.01,
        assist: 0.03,
        clean: 0.32,
        goalWeight: 0.10,
        assistWeight: 0.15,
        cleanWeight: 0.75,
      };
    case "DEF":
      return {
        // Para defensas, las notas y porterías a cero tienen mucho más peso
        // que los goles o las asistencias.
        goal: 0.025,
        assist: 0.06,
        clean: 0.24,
        goalWeight: 0.06,
        assistWeight: 0.09,
        cleanWeight: 0.85,
      };
    case "MID":
      return {
        goal: 0.20,
        assist: 0.28,
        clean: 0.20,
        goalWeight: 0.32,
        assistWeight: 0.48,
        cleanWeight: 0.20,
      };
    default:
      return {
        goal: 0.48,
        assist: 0.22,
        clean: 0.10,
        goalWeight: 0.62,
        assistWeight: 0.33,
        cleanWeight: 0.05,
      };
  }
}

/** Factor de crecimiento positivo según la media: subir de 94 a 95 requiere
 * mucho más rendimiento y desarrollo que pasar de 80 a 81. No frena las caídas
 * cuando el rendimiento o la edad justifican una regresión. */
function overallGrowthFactor(ovr: number): number {
  if (ovr < 70) return 1.10;
  if (ovr < 76) return 1.00;
  if (ovr < 80) return 0.90;
  if (ovr < 84) return 0.76;
  if (ovr < 88) return 0.62;
  if (ovr < 91) return 0.48;
  if (ovr < 94) return 0.34;
  return 0.22;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateProductionImpact(
  stats: DynamicPlayerStats,
  positions: PosCode[],
  context?: { teamAverageOVR?: number },
): number {
  const weights = roleWeights(positions);
  const apps = Math.max(1, stats.seasonAppearances);
  const minutes = Math.max(90, Number(stats.seasonMinutes) || apps * 75);
  const goalsPer90 = (Math.max(0, stats.seasonGoals) / minutes) * 90;
  const assistsPer90 = (Math.max(0, stats.seasonAssists) / minutes) * 90;
  const cleanPerMatch = Math.max(0, stats.seasonCleanSheets) / apps;
  const isDefender = ["DFC", "LD", "LI"].includes(positions[0]);
  const teamOVR = Number(context?.teamAverageOVR);
  // En plantillas modestas se espera menos porterías a cero; ajustar la
  // referencia evita penalizar al central por el nivel defensivo colectivo.
  const cleanReference = isDefender && Number.isFinite(teamOVR) && teamOVR > 0
    ? clamp(0.24 + (teamOVR - 70) * 0.006, 0.12, 0.34)
    : weights.clean;

  // Se compara la producción por 90 con una referencia razonable para el rol.
  // Puede superar 1 en temporadas excepcionales; no hay un techo artificial
  // que impida que una campaña histórica destaque.
  const goalRatio = clamp(goalsPer90 / Math.max(weights.goal, 0.01), 0, 2.5);
  const assistRatio = clamp(assistsPer90 / Math.max(weights.assist, 0.01), 0, 2.5);
  const cleanRatio = clamp(cleanPerMatch / Math.max(cleanReference, 0.01), 0, 2.0);

  return clamp(
    goalRatio * weights.goalWeight +
      assistRatio * weights.assistWeight +
      cleanRatio * weights.cleanWeight,
    0,
    2.5,
  );
}

function calculatePerformanceIndex(
  stats: DynamicPlayerStats,
  positions: PosCode[],
  _context?: { teamAverageOVR?: number },
): number {
  if (stats.seasonAppearances <= 0) return -0.10;

  // Algunas ligas de simulación rápida no guardaban notas partido a partido.
  // Si no hay muestra de notas, usamos un valor neutro en vez de interpretar
  // el 6.0 de inicialización como una temporada desastrosa.
  const hasRatingSample =
    Number(stats.seasonRatingCount) > 0 ||
    Number(stats.seasonRatingTotal) > 0 ||
    Number(stats.seasonAverageRating) > 6.05;
  const averageRating = hasRatingSample ? (Number(stats.seasonAverageRating) || 6.65) : 6.65;
  // 6.55 es una temporada discreta, 7.0 una campaña buena y 7.5+ una temporada
  // sobresaliente. La nota gana importancia para puestos defensivos, donde los
  // goles y asistencias no describen la mayor parte del trabajo.
  const ratingPart = clamp((averageRating - 6.55) / 0.85, -1, 1);

  const productionIndex = calculateProductionImpact(stats, positions, _context);
  const primary = positions[0];
  const isDefender = ["DFC", "LD", "LI"].includes(primary);
  const isDefensiveMidfielder = primary === "MCD";
  const role = roleFromPositions(positions);

  // Un central no debe perder desarrollo por no marcar ni por una estadística
  // de porterías a cero que históricamente solo se guardaba para el portero.
  // Para el MCD la producción ofensiva modesta es casi neutra; las campañas
  // excepcionales sí suman.
  const productionPart = isDefender
    ? clamp((productionIndex - 0.04) / 1.25, 0, 0.72)
    : isDefensiveMidfielder
      ? clamp((productionIndex - 0.05) / 1.15, -0.05, 1)
      : role === "MID"
        ? clamp((productionIndex - 0.28) / 1.10, -0.32, 1)
        : clamp((productionIndex - 0.42) / 1.15, -0.60, 1);

  const mvpRate = stats.seasonMVPs / Math.max(1, stats.seasonAppearances);
  const mvpPart = clamp((mvpRate - 0.02) / 0.12, 0, 1);
  const availability = clamp(stats.seasonAppearances / 24, 0, 1);
  const minutesPerAppearance = stats.seasonMinutes / Math.max(1, stats.seasonAppearances);
  const minuteQuality = clamp((minutesPerAppearance - 45) / 45, 0, 1);

  let ratingWeight: number;
  let productionWeight: number;
  let mvpWeight: number;
  let availabilityWeight: number;
  if (isDefender) {
    // Defensa y portería a cero son señales reales de una buena temporada para
    // un central/lateral. Antes la progresión dependía casi sólo de la nota y
    // el jugador apenas recibía crédito por sostener una defensa fiable.
    ratingWeight = 0.60;
    productionWeight = 0.22;
    mvpWeight = 0.07;
    availabilityWeight = 0.09;
  } else if (isDefensiveMidfielder) {
    ratingWeight = 0.50;
    productionWeight = 0.32;
    mvpWeight = 0.10;
    availabilityWeight = 0.06;
  } else if (role === "GK") {
    ratingWeight = 0.42;
    productionWeight = 0.42;
    mvpWeight = 0.09;
    availabilityWeight = 0.05;
  } else if (role === "MID") {
    ratingWeight = 0.43;
    productionWeight = 0.43;
    mvpWeight = 0.09;
    availabilityWeight = 0.05;
  } else {
    ratingWeight = 0.28;
    productionWeight = 0.59;
    mvpWeight = 0.10;
    availabilityWeight = 0.03;
  }

  return clamp(
    ratingPart * ratingWeight +
      productionPart * productionWeight +
      mvpPart * mvpWeight +
      availability * availabilityWeight +
      minuteQuality * 0.02,
    -1,
    1,
  );
}

function getAttributeWeights(positions: PosCode[]): PlayerAttributeRatings {
  const role = roleFromPositions(positions);
  switch (role) {
    case "GK":
      return { PAC: 0.05, SHO: 0.02, PAS: 0.18, DRI: 0.05, DEF: 0.5, PHY: 0.2 };
    case "DEF":
      return { PAC: 0.15, SHO: 0.04, PAS: 0.17, DRI: 0.06, DEF: 0.35, PHY: 0.23 };
    case "MID":
      return { PAC: 0.08, SHO: 0.15, PAS: 0.31, DRI: 0.2, DEF: 0.13, PHY: 0.13 };
    default:
      return { PAC: 0.17, SHO: 0.37, PAS: 0.12, DRI: 0.2, DEF: 0.03, PHY: 0.11 };
  }
}

function calculateYouthPlayingTimeFactor(stats: DynamicPlayerStats, age: number): number {
  if (age > 25) return 0;
  const appearanceFactor = clamp(stats.seasonAppearances / (age <= 21 ? 20 : 24), 0, 1);
  const minutesFactor = clamp(stats.seasonMinutes / (age <= 21 ? 1500 : 1800), 0, 1);
  const starterMinutes = clamp(
    (stats.seasonMinutes / Math.max(1, stats.seasonAppearances) - 45) / 45,
    -0.6,
    0.8,
  );
  return clamp(appearanceFactor * 0.52 + minutesFactor * 0.38 + (starterMinutes + 0.6) * 0.10, 0, 1);
}

function developmentHeadroomFactor(stats: DynamicPlayerStats): number {
  const gap = stats.potentialOVR - stats.currentOVR;

  // El margen importa mucho más en un prospecto de media baja que en una
  // estrella que ya está en 87-91. Llegar al potencial no es automático:
  // cuanto más alto es el OVR actual, más exigente es la progresión.
  if (stats.currentOVR >= 88) return clamp(0.52 + gap / 16, 0.42, 0.88);
  if (stats.currentOVR >= 84) return clamp(0.64 + gap / 13, 0.52, 1.02);
  if (stats.currentOVR >= 80) return clamp(0.76 + gap / 11, 0.60, 1.18);
  return clamp(0.88 + gap / 8, 0.62, 1.48);
}

/**
 * Additional in-season development for production well above a player's role.
 * It's deliberately expressed per 90 and requires a meaningful minutes sample:
 * 30+ striker goals can create a genuine breakout, while a small hot streak or
 * an elite OVR alone cannot trigger it. Values are monthly growth points before
 * age and OVR difficulty factors are applied.
 */
function exceptionalSeasonOutputBonus(stats: DynamicPlayerStats, positions: PosCode[]): number {
  const appearances = Math.max(0, Number(stats.seasonAppearances) || 0);
  const minutes = Math.max(0, Number(stats.seasonMinutes) || 0);
  if (appearances < 7 || minutes < 600) return 0;

  const per90Minutes = Math.max(90, minutes);
  const goalsPer90 = (Math.max(0, Number(stats.seasonGoals) || 0) / per90Minutes) * 90;
  const assistsPer90 = (Math.max(0, Number(stats.seasonAssists) || 0) / per90Minutes) * 90;
  const sample = clamp(Math.min(appearances / 10, minutes / 900), 0, 1);
  const hasRatingSample =
    Number(stats.seasonRatingCount) > 0 ||
    Number(stats.seasonRatingTotal) > 0 ||
    Number(stats.seasonAverageRating) > 6.05;
  const rating = hasRatingSample ? (Number(stats.seasonAverageRating) || 6.65) : 6.65;
  const quality = clamp((rating - 6.0) / 1.25, 0.35, 1.10);
  const role = roleFromPositions(positions);

  let goalBonus = 0;
  let assistBonus = 0;
  if (role === "FWD") {
    // El umbral equivale aproximadamente a un delantero titular que marca
    // 15-18 goles de liga. Los 30-35 goles sí constituyen una temporada de
    // explosión y pueden aportar cerca de +0.4 a la progresión mensual.
    goalBonus = clamp((goalsPer90 - 0.42) * 0.68, 0, 0.45);
    assistBonus = clamp((assistsPer90 - 0.25) * 0.38, 0, 0.12);
  } else if (role === "MID") {
    goalBonus = clamp((goalsPer90 - 0.18) * 0.27, 0, 0.11);
    assistBonus = clamp((assistsPer90 - 0.25) * 0.48, 0, 0.17);
  } else if (role === "DEF") {
    goalBonus = clamp((goalsPer90 - 0.06) * 0.18, 0, 0.055);
    assistBonus = clamp((assistsPer90 - 0.12) * 0.28, 0, 0.07);
  }

  return clamp((goalBonus + assistBonus) * sample * quality, 0, 0.36);
}

function isHighLevelYoungStar(stats: DynamicPlayerStats, age: number): boolean {
  return age <= 25 && stats.currentOVR >= 87;
}

function isYoungProspect(stats: DynamicPlayerStats, age: number): boolean {
  const gap = stats.potentialOVR - stats.currentOVR;
  return age <= 23 && (stats.currentOVR <= 82 || gap >= 8);
}

function updatePotentialEstimate(
  potential: number,
  stats: DynamicPlayerStats,
  age: number,
  performance: number,
): number {
  const playingTime = calculateYouthPlayingTimeFactor(stats, age);
  const trajectory = clamp((stats.currentOVR - stats.baseOVR) / 5, -1, 1);
  let delta = 0;

  // El potencial es una previsión dinámica, no un techo. Una temporada enorme
  // permite descubrir que un jugador estaba infravalorado, aunque ya partiera
  // de una media alta o tuviera potencial inicial igual a su OVR.
  if (performance >= 0.70) {
    delta += 0.10 + (performance - 0.70) * 0.10;
    if (playingTime > 0.55) delta += 0.025;
    if (trajectory > 0.20) delta += (trajectory - 0.20) * 0.03;
  } else if (performance >= 0.40) {
    delta += performance * 0.08;
    if (playingTime > 0.65 && age <= 24) delta += 0.03;
  } else if (performance <= -0.45) {
    delta += performance * 0.07;
  } else {
    delta += performance * 0.025;
  }

  // Solo la juventud puede aportar un pequeño extra por proyección; nunca
  // basta por sí sola para disparar el potencial.
  if (age <= 23 && performance >= 0.20) delta += 0.02;

  return clamp(potential + clamp(delta, -0.18, 0.20), 50, 99);
}

function applyAttributeProgression(
  stats: DynamicPlayerStats,
  positions: PosCode[],
  ovrDelta: number,
  injuryDaysRemaining: number,
): PlayerAttributeRatings {
  const current = stats.attributes ?? {
    PAC: stats.currentOVR,
    SHO: stats.currentOVR,
    PAS: stats.currentOVR,
    DRI: stats.currentOVR,
    DEF: stats.currentOVR,
    PHY: stats.currentOVR,
  };
  const weights = getAttributeWeights(positions);
  const injuryPenalty = injuryDaysRemaining >= 30 ? 0.7 : injuryDaysRemaining >= 14 ? 0.85 : 1;
  const magnitude = Math.max(0.02, Math.abs(ovrDelta) * 4.2) * injuryPenalty;

  return ATTRIBUTE_KEYS.reduce((acc, key) => {
    const delta = ovrDelta >= 0 ? magnitude * weights[key] * 1.8 : -magnitude * weights[key] * 1.35;
    acc[key] = clamp(Number(current[key] ?? 0) + delta, 1, 99);
    return acc;
  }, {} as PlayerAttributeRatings);
}

export function calculateMonthlyProgression(
  stats: DynamicPlayerStats,
  age: number,
  positions: PosCode[],
  _currentMonth = 0,
  _currentYear = 0,
  context?: {
    injuryDaysRemaining?: number;
    teamAverageOVR?: number;
  },
): number {
  const safe = normalizeDynamicStats(stats, stats?.baseOVR ?? 70, stats?.potentialOVR ?? 80, stats?.attributes);
  const injuryDaysRemaining = Math.max(0, Number(context?.injuryDaysRemaining) || 0);
  const performance = calculatePerformanceIndex(safe, positions, context);
  const playingTime = calculateYouthPlayingTimeFactor(safe, age);
  const headroomFactor = developmentHeadroomFactor(safe);
  const prospect = isYoungProspect(safe, age);

  let delta: number;

  if (prospect) {
    // La mayor parte del crecimiento se reparte entre los meses. Las promesas
    // que juegan regularmente y tienen margen progresan más que los suplentes.
    delta = performance * 0.25;
    delta += playingTime * 0.11 * headroomFactor;
    delta += headroomFactor * 0.030;
    if (performance >= 0.55) delta += 0.050 * headroomFactor;
  } else {
    delta = performance * 0.30;
    delta += Math.max(0, performance - 0.30) * 0.065 * Math.max(0.70, headroomFactor);
    if (performance >= 0.70) delta += 0.022;
  }

  // Un rendimiento excepcional por encima de lo normal para la demarcación
  // también impulsa la media durante la temporada. Esto evita que 30-35 goles
  // de un delantero joven queden reducidos a un cambio casi invisible al verano.
  // La bonificación se modera por el margen de desarrollo, la edad y la media.
  const outputBonus = exceptionalSeasonOutputBonus(safe, positions);
  delta += outputBonus * clamp(0.75 + headroomFactor * 0.22, 0.80, 1.10);

  // Los centrales y laterales deben poder progresar aunque no marquen. Un
  // titular defensivo con continuidad, minutos y notas decentes acumula margen
  // de desarrollo durante el año; las porterías a cero registradas aparte
  // refuerzan la señal, y la curva de OVR sigue limitando a las estrellas.
  const primaryIsDefender = ["DFC", "LD", "LI"].includes(positions[0]);
  if (primaryIsDefender && safe.seasonAppearances >= 8 && performance >= -0.05) {
    const defensiveAvailability = clamp(safe.seasonAppearances / 24, 0, 1);
    const minutesPerAppearance = safe.seasonMinutes / Math.max(1, safe.seasonAppearances);
    const defensiveMinutes = clamp((minutesPerAppearance - 50) / 40, 0, 1);
    const hasRatingSample =
      Number(safe.seasonRatingCount) > 0 ||
      Number(safe.seasonRatingTotal) > 0 ||
      Number(safe.seasonAverageRating) > 6.05;
    const defensiveRating = hasRatingSample ? (Number(safe.seasonAverageRating) || 6.65) : 6.65;
    const defensiveForm = clamp((defensiveRating - 6.25) / 0.85, 0.40, 1.0);
    delta += 0.070 * defensiveAvailability * defensiveMinutes * defensiveForm * headroomFactor;
  }

  // La edad afecta de forma gradual al crecimiento positivo. Las malas
  // actuaciones y la falta de minutos también pueden provocar regresión.
  if (delta > 0) delta *= clamp(ageGrowthFactor(age), 0.72, 1.18);

  if (age >= 31 && performance < -0.10) {
    delta -= 0.012 * Math.min(3, age - 30) * Math.abs(performance);
  }

  if (safe.seasonAppearances === 0) {
    delta -= 0.055;
  } else if (safe.seasonAppearances < 4 && performance < 0.05) {
    delta -= 0.015;
  }

  if (performance < -0.20 && safe.seasonAppearances > 0) {
    delta -= Math.min(0.085, (Math.abs(performance) - 0.20) * 0.14);
  }

  // Una buena nota y la continuidad son el motor mensual, pero una media alta
  // impone cada vez más exigencia: a 94 OVR el mismo rendimiento genera sólo
  // una fracción de la subida que tendría un jugador de 80.
  if (delta > 0) delta *= overallGrowthFactor(safe.currentOVR);

  if (safe.seasonAppearances >= 8 && performance >= 0.65) {
    delta = Math.max(delta, 0.085 * overallGrowthFactor(safe.currentOVR));
  } else if (safe.seasonAppearances >= 8 && performance >= 0.40) {
    delta = Math.max(delta, 0.04 * overallGrowthFactor(safe.currentOVR));
  }

  if (injuryDaysRemaining >= 60) delta *= 0.45;
  else if (injuryDaysRemaining >= 30) delta *= 0.65;
  else if (injuryDaysRemaining >= 14) delta *= 0.82;

  // El límite normal de crecimiento mensual sigue siendo contenido. Solo una
  // campaña verdaderamente extraordinaria puede superar el antiguo techo de
  // +0.34; de esta forma el progreso se reparte durante el año en vez de caer
  // como una subida masiva en el cierre de temporada.
  return clamp(delta, -0.30, 0.58);
}

export function calculateSeasonEndProgression(
  stats: DynamicPlayerStats,
  age: number,
  positions: PosCode[],
  _seasonNumber: number,
  context?: { injuryDaysRemaining?: number; teamAverageOVR?: number; dateIso?: string },
): number {
  const safe = normalizeDynamicStats(stats, stats?.baseOVR ?? 70, stats?.potentialOVR ?? 80, stats?.attributes);
  const performance = calculatePerformanceIndex(safe, positions, context);
  const headroomFactor = developmentHeadroomFactor(safe);
  const playingTime = calculateYouthPlayingTimeFactor(safe, age);
  const prospect = isYoungProspect(safe, age);

  // El cierre anual es un ajuste pequeño, no una segunda gran subida. La mejora
  // principal ya se ha acumulado durante la temporada mediante la progresión
  // mensual. La edad, los minutos y el rendimiento pueden inclinar el balance.
  let delta = performance * 0.22;
  if (prospect) {
    delta += 0.055 * headroomFactor + 0.025 * playingTime;
    if (performance >= 0.60) delta += 0.045 * headroomFactor;
  } else if (performance >= 0.30) {
    delta += (performance - 0.30) * 0.045 * Math.max(0.70, headroomFactor);
  }

  if (safe.seasonAppearances === 0) {
    delta -= 0.12;
  } else if (safe.seasonAppearances < 6 && performance < 0) {
    delta -= 0.06;
  }
  if (performance < -0.20) {
    delta -= Math.min(0.18, (Math.abs(performance) - 0.20) * 0.24);
  }

  const injuryDaysRemaining = Math.max(0, Number(context?.injuryDaysRemaining) || 0);
  if (injuryDaysRemaining >= 30) delta *= 0.70;

  // El bonus de juventud sólo aparece si el jugador ha tenido una temporada
  // mínimamente positiva y disputado minutos; la edad avanzada sí puede traer
  // una pequeña caída incluso si la temporada ha sido correcta.
  let ageAdjustment = 0;
  if (safe.seasonAppearances >= 8 && performance >= 0.20) {
    if (age <= 20) ageAdjustment = 0.055;
    else if (age <= 23) ageAdjustment = 0.035;
    else if (age <= 25) ageAdjustment = 0.015;
  }
  if (age >= 30) {
    ageAdjustment -= Math.min(0.24, (age - 29) * 0.035);
  }

  // Ganar títulos también impulsa el desarrollo: el valor es pequeño pero
  // acumulativo, y se aplica antes del límite final para que una temporada
  // llena de trofeos no provoque saltos irreales. Las estrellas con media alta
  // reciben menos por la curva de exigencia.
  const trophyBonus = Math.min(0.22, Math.max(0, Number(safe.seasonTrophies) || 0) * 0.055);
  delta += trophyBonus;

  const primaryIsDefender = ["DFC", "LD", "LI"].includes(positions[0]);
  if (primaryIsDefender && safe.seasonAppearances >= 18 && performance >= 0.20) {
    const defensiveContinuity = clamp(safe.seasonAppearances / 30, 0, 1);
    const defensiveRating =
      Number(safe.seasonRatingCount) > 0 || Number(safe.seasonRatingTotal) > 0 || Number(safe.seasonAverageRating) > 6.05
        ? (Number(safe.seasonAverageRating) || 6.65)
        : 6.65;
    if (defensiveRating >= 6.65) {
      delta += 0.06 * defensiveContinuity * headroomFactor;
    }
  }

  // Para los jugadores de 90+ OVR sólo una campaña excepcional permite sumar
  // una fracción visible al cierre. Las bajadas por rendimiento, edad o falta
  // de continuidad no se maquillan con este factor.
  if (delta > 0) delta *= overallGrowthFactor(safe.currentOVR);
  delta += ageAdjustment;

  return clamp(delta, -0.48, 0.48);
}

export function initializeDynamicStats(
  baseOVR: number,
  potentialOVR = Math.min(baseOVR + 10, 99),
  attributes?: Partial<PlayerAttributeRatings>,
): DynamicPlayerStats {
  const safeBase = clamp(Number(baseOVR) || 70, 50, 99);
  const attrs = normalizeDynamicStats(
    { currentOVR: safeBase, baseOVR: safeBase, potentialOVR },
    safeBase,
    potentialOVR,
    attributes,
  ).attributes;

  return {
    seasonGoals: 0,
    seasonAssists: 0,
    seasonAppearances: 0,
    seasonMinutes: 0,
    seasonMVPs: 0,
    seasonCleanSheets: 0,
    seasonAverageRating: 6.0,
    seasonRatingTotal: 0,
    seasonRatingCount: 0,
    seasonTrophies: 0,
    monthlyStats: [],
    currentOVR: safeBase,
    baseOVR: safeBase,
    potentialOVR: clamp(Number(potentialOVR) || safeBase, 50, 99),
    attributes: attrs,
    formHistory: [],
    careerSeasons: [],
    lastProgressionMonth: -1,
    lastProgressionYear: -1,
    lastProgressionDelta: 0,
    lastProgressionDate: undefined,
    lastProgressionReason: undefined,
    lastSeasonEndSeason: 0,
  };
}

export function updatePlayerMatchStats(
  stats: DynamicPlayerStats,
  goals: number,
  assists: number,
  rating: number,
  minutes: number,
  isMVP: boolean,
  isCleanSheet: boolean,
  currentMonth: number,
  currentYear: number,
): DynamicPlayerStats {
  const updated = normalizeDynamicStats(stats, stats.baseOVR, stats.potentialOVR, stats.attributes);

  updated.seasonGoals += Math.max(0, Number(goals) || 0);
  updated.seasonAssists += Math.max(0, Number(assists) || 0);
  updated.seasonAppearances += 1;
  updated.seasonMinutes += Math.max(0, Number(minutes) || 0);
  if (isMVP) updated.seasonMVPs += 1;
  if (isCleanSheet) updated.seasonCleanSheets += 1;

  const previousTotal = updated.seasonRatingTotal ?? updated.seasonAverageRating * Math.max(0, updated.seasonRatingCount ?? updated.seasonAppearances - 1);
  updated.seasonRatingTotal = previousTotal + Math.max(0, Number(rating) || 0);
  updated.seasonRatingCount = Math.max(1, updated.seasonRatingCount ?? updated.seasonAppearances);
  updated.seasonAverageRating = updated.seasonRatingTotal / updated.seasonRatingCount;
  updated.formHistory = [...updated.formHistory, Math.max(0, Number(rating) || 0)].slice(-10);

  let monthStats = updated.monthlyStats.find(
    (m) => m.month === currentMonth && m.year === currentYear,
  );

  if (!monthStats) {
    monthStats = {
      month: currentMonth,
      year: currentYear,
      goals: 0,
      assists: 0,
      appearances: 0,
      averageRating: 6.0,
      mvpCount: 0,
      cleanSheets: 0,
      ratingTotal: 0,
      ratingCount: 0,
    };
    updated.monthlyStats.push(monthStats);
  }

  monthStats.goals += Math.max(0, Number(goals) || 0);
  monthStats.assists += Math.max(0, Number(assists) || 0);
  monthStats.appearances += 1;
  if (isMVP) monthStats.mvpCount += 1;
  if (isCleanSheet) monthStats.cleanSheets += 1;
  monthStats.ratingTotal = (monthStats.ratingTotal ?? monthStats.averageRating * Math.max(0, monthStats.ratingCount ?? monthStats.appearances - 1)) + Math.max(0, Number(rating) || 0);
  monthStats.ratingCount = (monthStats.ratingCount ?? monthStats.appearances - 1) + 1;
  monthStats.averageRating = monthStats.ratingTotal / Math.max(1, monthStats.ratingCount);

  return updated;
}

export function applyMonthlyProgression(
  stats: DynamicPlayerStats,
  age: number,
  positions: PosCode[],
  currentMonth: number,
  currentYear: number,
  context?: { injuryDaysRemaining?: number; teamAverageOVR?: number; dateIso?: string },
): DynamicPlayerStats {
  const updated = normalizeDynamicStats(stats, stats?.baseOVR ?? 70, stats?.potentialOVR ?? 80, stats?.attributes);

  if (updated.lastProgressionMonth === currentMonth && updated.lastProgressionYear === currentYear) {
    return updated;
  }

  const change = calculateMonthlyProgression(updated, age, positions, currentMonth, currentYear, context);
  // El OVR visible sigue siendo entero, pero la progresión interna conserva
  // decimales para que el gráfico muestre el crecimiento real de cada mes.
  const latestMonthlyOvr = [...(updated.monthlyStats ?? [])]
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
    .reverse()
    .find((entry) => Number.isFinite(Number(entry.ovr)))?.ovr;
  const oldProgressionOvr = Number.isFinite(Number(latestMonthlyOvr))
    ? Number(latestMonthlyOvr)
    : updated.currentOVR;
  const rawNextOvr = clamp(oldProgressionOvr + change, 50, 99);
  const rawDelta = rawNextOvr - oldProgressionOvr;
  updated.currentOVR = Number(rawNextOvr.toFixed(3));
  updated.attributes = applyAttributeProgression(
    updated,
    positions,
    rawDelta,
    Number(context?.injuryDaysRemaining) || 0,
  );

  const potentialPerformance = calculatePerformanceIndex(updated, positions);
  updated.potentialOVR = updatePotentialEstimate(
    updated.potentialOVR,
    updated,
    age,
    potentialPerformance,
  );

  updated.lastProgressionMonth = currentMonth;
  updated.lastProgressionYear = currentYear;
  updated.lastProgressionDelta = rawDelta;
  updated.lastProgressionDate = context?.dateIso;

  // Guardamos un punto de OVR por mes para poder pintar una línea temporal real
  // de progresión. La media visible siempre es entera.
  const monthly = [...(updated.monthlyStats ?? [])].map((entry) => ({ ...entry }));
  const monthlyEntry = monthly.find((entry) => entry.year === currentYear && entry.month === currentMonth);
  if (monthlyEntry) {
    monthlyEntry.ovr = Number(rawNextOvr.toFixed(2));
  } else {
    monthly.push({
      month: currentMonth,
      year: currentYear,
      goals: 0,
      assists: 0,
      appearances: 0,
      averageRating: 6,
      mvpCount: 0,
      cleanSheets: 0,
      ratingTotal: 0,
      ratingCount: 0,
      ovr: Number(rawNextOvr.toFixed(2)),
    });
  }
  updated.monthlyStats = monthly;

  if (rawDelta > 0.02) updated.lastProgressionReason = "Buen rendimiento y margen de desarrollo";
  else if (rawDelta < -0.02) updated.lastProgressionReason = "Rendimiento, edad o falta de continuidad";
  else if ((context?.injuryDaysRemaining ?? 0) >= 30) updated.lastProgressionReason = "Progresión limitada por lesión larga";
  else updated.lastProgressionReason = "Evolución estable";

  return updated;
}

export function applySeasonEndProgression(
  stats: DynamicPlayerStats,
  age: number,
  positions: PosCode[],
  seasonNumber: number,
  teamId: string,
  context?: { injuryDaysRemaining?: number; teamAverageOVR?: number; dateIso?: string },
): DynamicPlayerStats {
  const updated = normalizeDynamicStats(stats, stats?.baseOVR ?? 70, stats?.potentialOVR ?? 80, stats?.attributes);
  if (updated.lastSeasonEndSeason === seasonNumber) return updated;

  const change = calculateSeasonEndProgression(updated, age, positions, seasonNumber, context);
  const oldOvr = updated.currentOVR;
  const rawNextOvr = clamp(oldOvr + change, 50, 99);
  const rawDelta = rawNextOvr - oldOvr;

  updated.currentOVR = Number(rawNextOvr.toFixed(3));
  updated.attributes = applyAttributeProgression(
    updated,
    positions,
    rawDelta,
    Number(context?.injuryDaysRemaining) || 0,
  );
  updated.lastProgressionDelta = rawDelta;
  updated.lastProgressionDate = context?.dateIso;
  updated.lastProgressionReason = "Ajuste de cierre de temporada";

  const seasonRecord: SeasonStats = {
    season: seasonNumber,
    teamId,
    goals: updated.seasonGoals,
    assists: updated.seasonAssists,
    appearances: updated.seasonAppearances,
    averageRating: updated.seasonAverageRating,
    mvpCount: updated.seasonMVPs,
    cleanSheets: updated.seasonCleanSheets,
    trophies: updated.seasonTrophies,
    finalOVR: Math.round(updated.currentOVR),
  };

  updated.careerSeasons = [...updated.careerSeasons.filter((s) => s.season !== seasonNumber), seasonRecord];
  updated.potentialOVR = updatePotentialEstimate(updated.potentialOVR, updated, age, calculatePerformanceIndex(updated, positions, context));

  // El OVR base es el de inicio de carrera y NO se mueve. Así podemos medir la
  // progresión acumulada de toda la partida y respetar el diferencial 80/94 vs 90/94.
  updated.seasonGoals = 0;
  updated.seasonAssists = 0;
  updated.seasonAppearances = 0;
  updated.seasonMinutes = 0;
  updated.seasonMVPs = 0;
  updated.seasonCleanSheets = 0;
  updated.seasonAverageRating = 6.0;
  updated.seasonRatingTotal = 0;
  updated.seasonRatingCount = 0;
  updated.seasonTrophies = 0;
  updated.monthlyStats = [];
  updated.lastSeasonEndSeason = seasonNumber;

  return updated;
}

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
  MonthlyStats,
  PlayerAttributeRatings,
  SeasonStats,
} from "@/types/playerStats";
import { type PosCode } from "@/lib/positions";

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

  const currentOVR = Math.round(Math.max(50, Math.min(99, n(source.currentOVR, baseOVR))));
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
    careerSeasons: arr<SeasonStats>(source.careerSeasons),
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
  if (age <= 18) return 1.55;
  if (age <= 20) return 1.4;
  if (age <= 22) return 1.25;
  if (age <= 24) return 1.12;
  if (age <= 27) return 0.95;
  if (age <= 29) return 0.72;
  if (age <= 31) return 0.48;
  if (age <= 33) return 0.27;
  if (age <= 35) return 0.12;
  return 0;
}

function ageDeclineFactor(age: number): number {
  if (age <= 23) return 0.15;
  if (age <= 27) return 0.25;
  if (age <= 29) return 0.45;
  if (age <= 31) return 0.75;
  if (age <= 33) return 1.0;
  if (age <= 35) return 1.35;
  return 1.8;
}

function roleFromPositions(positions: PosCode[]): "GK" | "DEF" | "MID" | "FWD" {
  if (positions.includes("GK")) return "GK";
  if (positions.some((p) => ["DC", "ED", "EI", "MCO"].includes(p))) return "FWD";
  if (positions.some((p) => ["MCD", "MC", "MD", "MI"].includes(p))) return "MID";
  return "DEF";
}

function roleWeights(role: "GK" | "DEF" | "MID" | "FWD") {
  switch (role) {
    case "GK":
      return { goal: 0.01, assist: 0.015, clean: 0.55 };
    case "DEF":
      return { goal: 0.08, assist: 0.12, clean: 0.26 };
    case "MID":
      return { goal: 0.16, assist: 0.2, clean: 0.08 };
    default:
      return { goal: 0.34, assist: 0.18, clean: 0.01 };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateProductionImpact(
  stats: DynamicPlayerStats,
  positions: PosCode[],
): number {
  const role = roleFromPositions(positions);
  const weights = roleWeights(role);
  const apps = Math.max(1, stats.seasonAppearances);
  const goalsPerMatch = stats.seasonGoals / apps;
  const assistsPerMatch = stats.seasonAssists / apps;
  const cleanPerMatch = stats.seasonCleanSheets / apps;

  // Comparamos con una producción razonable para el rol. No hace falta que un
  // central marque como un delantero para progresar: se le evalúa por su propio rol.
  const goalNorm = goalsPerMatch / Math.max(weights.goal, 0.01);
  const assistNorm = assistsPerMatch / Math.max(weights.assist, 0.01);
  const cleanNorm = cleanPerMatch / Math.max(weights.clean, 0.01);

  const production = goalNorm * 0.45 + assistNorm * 0.35 + cleanNorm * 0.2;
  return clamp(production, 0, 2);
}

function calculatePerformanceIndex(
  stats: DynamicPlayerStats,
  positions: PosCode[],
  context?: { teamAverageOVR?: number },
): number {
  if (stats.seasonAppearances <= 0) return -0.05;

  const averageRating = stats.seasonAverageRating || 6;
  const teamAverage = Number(context?.teamAverageOVR);
  // En equipos de menor nivel el estándar de actuación es ligeramente menor,
  // porque el jugador suele disponer de menos recursos y oportunidades. A la
  // vez, un jugador que sobresale claramente sobre sus compañeros recibe un
  // pequeño extra por rendimiento relativo. El ajuste es deliberadamente suave.
  const standardRelief = Number.isFinite(teamAverage)
    ? clamp((74 - teamAverage) / 20, -0.12, 0.22)
    : 0;
  const relativeTeamPerformance = Number.isFinite(teamAverage)
    ? clamp((stats.currentOVR - teamAverage) / 14, -1, 1)
    : 0;
  const ratingPart = clamp((averageRating - (6.6 - standardRelief)) / 1.1, -1, 1);
  const productionMultiplier = 1 + standardRelief * 0.35 + Math.max(0, relativeTeamPerformance) * 0.08;
  const productionPart = clamp(
    (calculateProductionImpact(stats, positions) * productionMultiplier) - 0.75,
    -1,
    1,
  );
  const mvpRate = stats.seasonMVPs / Math.max(1, stats.seasonAppearances);
  const mvpPart = clamp(mvpRate / 0.16, 0, 1);
  const consistency = clamp(stats.seasonAppearances / 24, 0, 1);
  const minutesPerAppearance = stats.seasonMinutes / Math.max(1, stats.seasonAppearances);
  const minuteQuality = clamp((minutesPerAppearance - 35) / 55, 0, 1);

  return clamp(
    ratingPart * 0.44 +
      productionPart * 0.24 +
      mvpPart * 0.14 +
      consistency * 0.08 +
      minuteQuality * 0.06 +
      relativeTeamPerformance * 0.04,
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

function getLatestMonthlyStats(stats: DynamicPlayerStats): MonthlyStats | null {
  if (!stats.monthlyStats.length) return null;
  return [...stats.monthlyStats].sort(
    (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month),
  )[stats.monthlyStats.length - 1] ?? null;
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
  // El jugador que está claramente por debajo de su proyección estimada tiene
  // mucho más margen de crecimiento que uno que ya está cerca o por encima de ella.
  return clamp(0.75 + (stats.potentialOVR - stats.currentOVR) / 10, 0.52, 1.48);
}

function updatePotentialEstimate(
  potential: number,
  stats: DynamicPlayerStats,
  age: number,
  performance: number,
): number {
  const playingTime = calculateYouthPlayingTimeFactor(stats, age);
  const trajectory = clamp((stats.currentOVR - stats.baseOVR) / 6, -1, 1);
  let delta = 0;

  if (age <= 23) {
    // Para un joven, el potencial estimado debe reaccionar de verdad a lo que
    // está ocurriendo: muchos minutos + buen rendimiento pueden convertir una
    // antigua previsión de 78 en una previsión de 82-85. Sin minutos o con una
    // mala temporada, esa previsión también puede bajar.
    delta += (playingTime - 0.45) * 0.44;
    delta += performance * 0.22;
    delta += trajectory * 0.18;
    if (age <= 21 && playingTime > 0.75 && performance > -0.15) delta += 0.10;
    if (age <= 23 && performance > 0.60) delta += 0.10;
    if (age <= 23 && performance < -0.55 && playingTime < 0.45) delta -= 0.16;
    if (stats.seasonAppearances === 0) delta -= 0.08;
  } else if (age <= 26) {
    delta += (playingTime - 0.45) * 0.18;
    delta += performance * 0.09;
    delta += trajectory * 0.06;
  } else if (age >= 31) {
    delta += performance * 0.035;
    delta += trajectory * 0.03;
    if (performance < -0.45) delta -= 0.05;
  } else {
    delta += performance * 0.05;
    delta += trajectory * 0.035;
  }

  return clamp(potential + clamp(delta, -0.42, 0.52), 50, 99);
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

  // La exposición competitiva tiene un peso propio en los jóvenes. Un chico de
  // 18-23 años que juega mucho puede mejorar aunque su rendimiento sea simplemente
  // normal; hacerlo muy bien acelera todavía más la progresión.
  let delta = performance * 0.15;
  if (age <= 25) {
    const youthFactor = ageGrowthFactor(age);
    const developmentBonus = playingTime * (0.10 + 0.08 * youthFactor) * headroomFactor;
    const trainingBase = (1 - playingTime) * 0.025 * Math.max(0.7, youthFactor);
    delta += developmentBonus + trainingBase;
    if (performance > 0.55) delta += 0.04 * headroomFactor;
  } else if (performance > 0) {
    delta *= ageGrowthFactor(age) * Math.max(0.65, headroomFactor);
  } else {
    delta *= Math.max(0.2, ageDeclineFactor(age));
  }

  if (injuryDaysRemaining >= 60) delta *= 0.35;
  else if (injuryDaysRemaining >= 30) delta *= 0.55;
  else if (injuryDaysRemaining >= 14) delta *= 0.75;

  if (age >= 31 && performance < -0.45) delta -= 0.02;

  return clamp(delta, -0.32, 0.42);
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

  let delta = performance * 0.65;
  if (age <= 25) {
    delta += playingTime * (0.45 + ageGrowthFactor(age) * 0.15) * headroomFactor;
  } else if (performance > 0) {
    delta *= ageGrowthFactor(age) * Math.max(0.65, headroomFactor);
  } else {
    delta *= Math.max(0.3, ageDeclineFactor(age));
  }

  const injuryDaysRemaining = Math.max(0, Number(context?.injuryDaysRemaining) || 0);
  if (injuryDaysRemaining >= 30) delta *= 0.65;

  // La progresión mensual ya hace el trabajo fino; el cierre de temporada solo
  // consolida la tendencia para evitar saltos artificiales de 4-5 puntos.
  return clamp(delta, -1.5, 1.75);
}

export function initializeDynamicStats(
  baseOVR: number,
  potentialOVR = Math.min(baseOVR + 10, 99),
  attributes?: Partial<PlayerAttributeRatings>,
): DynamicPlayerStats {
  const safeBase = Math.round(Math.max(50, Math.min(99, Number(baseOVR) || 70)));
  const attrs = normalizeDynamicStats(
    { currentOVR: safeBase, baseOVR: safeBase, potentialOVR, attributes },
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
  let rawNextOvr = clamp(oldProgressionOvr + change, 50, 99);

  // La media visible es entera. Los atributos pueden seguir progresando aunque
  // ese pequeño avance todavía no alcance el siguiente punto de OVR.
  const nextOvr = Math.round(rawNextOvr);
  const rawDelta = rawNextOvr - oldProgressionOvr;
  const finalDelta = nextOvr - updated.currentOVR;
  updated.currentOVR = nextOvr;
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
  updated.lastProgressionDelta = finalDelta;
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

  if (finalDelta > 0.02) updated.lastProgressionReason = "Buen rendimiento y margen de desarrollo";
  else if (finalDelta < -0.02) updated.lastProgressionReason = "Rendimiento, edad o falta de continuidad";
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
  const nextOvr = Math.round(rawNextOvr);
  const rawDelta = rawNextOvr - oldOvr;

  updated.currentOVR = nextOvr;
  updated.attributes = applyAttributeProgression(
    updated,
    positions,
    rawDelta,
    Number(context?.injuryDaysRemaining) || 0,
  );
  updated.lastProgressionDelta = nextOvr - oldOvr;
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
    finalOVR: updated.currentOVR,
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

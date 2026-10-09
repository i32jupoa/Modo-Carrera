import { clamp, seededRange, seededUnit } from "@/lib/transfers/random";
import { ACADEMY_FACILITIES, ACADEMY_LIMITS, ACADEMY_PROGRESSION } from "./academyConstants";
import { generateAnnualIntake } from "./academyGenerator";
import { simulateAcademyMatch } from "./academySimulation";
import { createEmptyAcademySeasonStats } from "./academyTypes";
import type { AcademyPlayer, AcademySeasonRecord, ClubAcademyState } from "./academyTypes";

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function seasonNumber(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month >= 7 ? year : year - 1;
}

function monthIndex(month: number, year: number): number {
  return year * 12 + month;
}

function previousMonthStats(stats: AcademyPlayer["academyStats"], date: string) {
  if (!stats?.monthlyStats?.length) return undefined;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const currentIndex = monthIndex(month, year);
  return stats.monthlyStats
    .filter((entry) => monthIndex(entry.month, entry.year) < currentIndex)
    .slice()
    .sort((a, b) => monthIndex(b.month, b.year) - monthIndex(a.month, a.year))[0];
}

function withMonthlyOvrSnapshot(stats: AcademyPlayer["academyStats"], date: string, ovr: number, startingOvr: number): NonNullable<AcademyPlayer["academyStats"]> {
  const base = stats ?? createEmptyAcademySeasonStats(seasonNumber(date), startingOvr);
  const month = Number(date.slice(5, 7));
  const year = Number(date.slice(0, 4));
  const monthlyStats = [...(base.monthlyStats ?? [])];
  const existingIndex = monthlyStats.findIndex((entry) => entry.month === month && entry.year === year);
  if (existingIndex >= 0) monthlyStats[existingIndex] = { ...monthlyStats[existingIndex], ovr: Number(ovr.toFixed(2)) };
  else monthlyStats.push({ month, year, appearances: 0, minutes: 0, goals: 0, assists: 0, cleanSheets: 0, yellowCards: 0, redCards: 0, ratingTotal: 0, ratingCount: 0, averageRating: 0, ovr: Number(ovr.toFixed(2)) });
  return { ...base, startingOvr: base.startingOvr || Math.round(startingOvr), monthlyStats };
}

function applyMonthlyYouthGrowthToPlayer(player: AcademyPlayer, state: ClubAcademyState, date: string, saveId: string): AcademyPlayer {
  // Los convocados progresan exclusivamente por el motor del primer equipo.
  if (!(["academy", "loaned", "listed"] as string[]).includes(player.status)) return player;

  const currentInternalOvr = clamp(Number(player.internalOvr ?? player.ovr), ACADEMY_LIMITS.minOvr, player.potential);
  const gap = Math.max(0, player.potential - currentInternalOvr);
  const ageFactor = player.age <= 17 ? 1.18 : player.age <= 19 ? 1.08 : player.age === 20 ? 0.92 : 0.68;
  const profileFactor = player.growthProfile === "early"
    ? 1.12
    : player.growthProfile === "late"
      ? (player.age >= 19 ? 1.28 : 0.82)
      : player.growthProfile === "stagnant" ? 0.48 : 1;
  const traitFactor = player.traits.includes("hard-worker")
    ? 1.08
    : player.traits.includes("temperamental")
      ? 0.94
      : player.traits.includes("diamond") ? 1.06 : 1;
  const facilityFactor = ACADEMY_FACILITIES.progressionMultiplierByLevel[state.facilityLevel - 1] ?? 1;
  const coachLevel = state.youthCoach?.level ?? 0;
  const coachBonus = coachLevel > 0
    ? (1 + coachLevel * 0.035) * (player.positions.some((position) => {
      const group = position === "GK" ? "GK" : ["DFC", "LD", "LI"].includes(position) ? "DEF" : ["DC", "ED", "EI"].includes(position) ? "ATT" : "MID";
      return group === state.youthCoach?.specialty;
    }) ? ACADEMY_LIMITS.coachSpecialtyMultiplier : 1)
    : 1;
  const mentorBonus = player.mentorId ? ACADEMY_LIMITS.mentorBonus : 1;
  const loanBonus = player.status === "loaned"
    ? ((player.loanReports?.[player.loanReports.length - 1]?.minutes ?? 0) >= 60 ? 1.08 : 0.94)
    : 1;
  const retrainingPenalty = player.retrainingUntil && date <= player.retrainingUntil ? ACADEMY_LIMITS.retrainingProgressPenalty : 1;

  const stats = player.academyStats ?? createEmptyAcademySeasonStats(seasonNumber(date), player.ovr);
  const previousMonth = previousMonthStats(stats, date);
  const appearances = previousMonth?.appearances ?? 0;
  const minutes = previousMonth?.minutes ?? 0;
  const averageRating = previousMonth?.averageRating ?? 0;
  const minutesFactor = clamp(minutes / ACADEMY_PROGRESSION.expectedMonthlyMinutes, 0, 1);
  const ratingDelta = averageRating > 0 ? clamp(averageRating - ACADEMY_PROGRESSION.ratingTarget, -1, 1) : 0;
  const performanceContribution = ratingDelta * ACADEMY_PROGRESSION.performanceWeight;
  const potentialContribution = Math.min(1, gap / 30) * ACADEMY_PROGRESSION.potentialGapWeight;
  const minutesContribution = minutesFactor * ACADEMY_PROGRESSION.minutesWeight;
  let development = ACADEMY_PROGRESSION.noMinutesBaseline + potentialContribution + minutesContribution + performanceContribution;

  // Una mala temporada sí puede frenar o invertir ligeramente el OVR cuando
  // el jugador ha tenido suficientes minutos para que el dato sea relevante.
  if (appearances > 0 && averageRating > 0 && averageRating < ACADEMY_PROGRESSION.poorRatingThreshold) {
    development -= (ACADEMY_PROGRESSION.poorRatingThreshold - averageRating) * ACADEMY_PROGRESSION.negativePerformanceFactor;
  }
  if (player.potential >= 82 && gap > 8) development += ACADEMY_PROGRESSION.highPotentialBonus;

  const variance = seededRange(
    ACADEMY_PROGRESSION.varianceMin,
    ACADEMY_PROGRESSION.varianceMax,
    saveId,
    state.teamId,
    player.id,
    monthKey(date),
  );
  const rawDelta = development * ageFactor * profileFactor * traitFactor * facilityFactor * coachBonus * mentorBonus * loanBonus * retrainingPenalty * variance;
  const delta = Math.round(clamp(rawDelta, ACADEMY_PROGRESSION.monthlyMinDelta, ACADEMY_PROGRESSION.monthlyMaxDelta) * 100) / 100;
  const nextInternalOvr = clamp(currentInternalOvr + delta, ACADEMY_LIMITS.minOvr, player.potential);
  const spread = Math.max(-0.35, Math.min(0.35, delta * 0.38));
  const attributes = Object.fromEntries(Object.entries(player.attributes).map(([key, value]) => [
    key,
    Math.round(clamp(value + spread * (0.7 + seededUnit(saveId, player.id, key, monthKey(date)) * 0.6), 20, 99) * 10) / 10,
  ])) as AcademyPlayer["attributes"];
  const retrainingActive = player.retrainingUntil && date <= player.retrainingUntil;
  const nextStats = withMonthlyOvrSnapshot(stats, date, nextInternalOvr, stats.startingOvr || Math.round(currentInternalOvr));
  return {
    ...player,
    internalOvr: Number(nextInternalOvr.toFixed(2)),
    ovr: Math.round(nextInternalOvr),
    attributes,
    academyStats: nextStats,
    retrainingPosition: retrainingActive ? player.retrainingPosition : undefined,
    retrainingUntil: retrainingActive ? player.retrainingUntil : undefined,
  };
}

export function applyMonthlyYouthGrowth(player: AcademyPlayer, state: ClubAcademyState, date: string, saveId: string): AcademyPlayer {
  return applyMonthlyYouthGrowthToPlayer(player, state, date, saveId);
}

function finishSeasonRecord(player: AcademyPlayer): AcademySeasonRecord | null {
  const stats = player.academyStats;
  if (!stats || stats.appearances <= 0) return null;
  return {
    season: stats.season,
    appearances: stats.appearances,
    minutes: stats.minutes,
    goals: stats.goals,
    assists: stats.assists,
    cleanSheets: stats.cleanSheets,
    yellowCards: stats.yellowCards,
    redCards: stats.redCards,
    averageRating: Number((stats.ratingCount > 0 ? stats.ratingTotal / stats.ratingCount : 0).toFixed(2)),
    finalOVR: Math.round(Number(player.internalOvr ?? player.ovr)),
  };
}

function resetForNewSeason(player: AcademyPlayer, newSeason: number): AcademyPlayer {
  const record = finishSeasonRecord(player);
  return {
    ...player,
    age: Math.min(21, player.age + 1),
    contractYearsLeft: Math.max(0, player.contractYearsLeft - 1),
    minutesThisSeason: 0,
    academyStats: createEmptyAcademySeasonStats(newSeason, Math.round(Number(player.internalOvr ?? player.ovr))),
    academyCareerSeasons: record
      ? [...(player.academyCareerSeasons ?? []), record].slice(-10)
      : (player.academyCareerSeasons ?? []).slice(-10),
  };
}

function isSeasonStart(date: string): boolean {
  return date.slice(5, 10) === "07-01";
}

/**
 * Simula un partido juvenil para la fecha de un partido de Liga del primer equipo.
 * Esta función se llama explícitamente desde el avance del calendario: visitar
 * Cantera, un día normal o una jornada de Copa no genera un partido juvenil.
 */
export function simulateAcademyLeagueMatchOnDate(
  state: ClubAcademyState,
  matchDate: string,
  saveId: string,
): ClubAcademyState {
  // Evita duplicados si el botón de avance se pulsa varias veces en el mismo día
  // o si una carga/re-render repite la sincronización asíncrona.
  if (state.lastAcademyMatchDate && state.lastAcademyMatchDate >= matchDate) return state;

  const simulated = simulateAcademyMatch(state.players, matchDate, saveId);
  if (simulated.opponent === "Sin partido") return state;

  return {
    ...state,
    players: simulated.players,
    lastAcademyMatchDate: matchDate,
    updatedAt: new Date().toISOString(),
  };
}

function nextMonthStart(date: string): string {
  let year = Number(date.slice(0, 4));
  let month = Number(date.slice(5, 7)) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Avanza solo los hitos que realmente necesitan trabajo (inicio de mes y de
 * temporada). Antes se iteraba por cada día y se simulaban partidos cada siete
 * días para cualquier club, incluidos todos los clubes de la simulación de
 * mercado. Eso multiplicaba el coste del botón Avanzar día.
 *
 * Los partidos se ejecutan únicamente a través de simulateAcademyLeagueMatchOnDate.
 */
export function advanceAcademyToDate(state: ClubAcademyState, currentDate: string, saveId: string): ClubAcademyState {
  const last = state.lastProgressionDate ?? `${state.lastIntakeSeason}-07-01`;
  if (last >= currentDate) return state;

  let players = state.players;
  let lastSeason = state.lastIntakeSeason;
  let manualPromotionAvailable = state.manualPromotionAvailable ?? true;
  let eventDate = nextMonthStart(last);
  let processedMonths = 0;
  const maxMonthSteps = Math.max(1, Math.ceil(ACADEMY_PROGRESSION.maxDaysToProcess / 28));

  while (eventDate <= currentDate && processedMonths < maxMonthSteps) {
    processedMonths += 1;
    const growthDate = `${eventDate.slice(0, 7)}-01`;
    const progressionState: ClubAcademyState = {
      ...state,
      players,
      lastIntakeSeason: lastSeason,
    };

    players = players.map((player) => {
      const normalized: AcademyPlayer = {
        ...player,
        academyStats: player.academyStats ?? createEmptyAcademySeasonStats(seasonNumber(growthDate), Math.round(Number(player.internalOvr ?? player.ovr))),
        academyCareerSeasons: player.academyCareerSeasons ?? [],
      };
      return applyMonthlyYouthGrowthToPlayer(normalized, progressionState, growthDate, saveId);
    });

    if (isSeasonStart(eventDate) && Number(eventDate.slice(0, 4)) > lastSeason) {
      const newSeason = Number(eventDate.slice(0, 4));
      players = players.map((player) => resetForNewSeason(player, newSeason));
      lastSeason = newSeason;
      const intakeState: ClubAcademyState = { ...state, players, lastIntakeSeason: lastSeason };
      const additions = generateAnnualIntake(saveId, intakeState, lastSeason);
      players = [...players.filter((player) => player.status !== "promoted"), ...additions];
      manualPromotionAvailable = false;
    }

    eventDate = nextMonthStart(eventDate);
  }

  // No se recorren ni se clonan los jugadores en días sin hitos de progresión.
  // La fecha sí se avanza para que las siguientes llamadas sean idempotentes.
  return {
    ...state,
    players: processedMonths > 0 ? players.slice(0, ACADEMY_LIMITS.maxPlayers) : state.players,
    lastIntakeSeason: lastSeason,
    lastProgressionDate: currentDate,
    manualPromotionAvailable,
    updatedAt: processedMonths > 0 ? new Date().toISOString() : state.updatedAt,
  };
}

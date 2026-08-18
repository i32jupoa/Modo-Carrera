/**
 * Sistema de progresión y regresión dinámica de jugadores.
 * Los OVRs cambian mensualmente (cambios sutiles) y al final de temporada
 * (cambios mayores) basado en rendimiento, edad y estadísticas.
 */

import type { DynamicPlayerStats, MonthlyStats, SeasonStats } from "@/types/playerStats";
import { type PosCode } from "@/lib/positions";

/**
 * Calcula el modificador de edad para progresión.
 * Jóvenes progresan más rápido, veteranos decaen más rápido.
 */
function getAgeModifier(age: number, isProgression: boolean): number {
  if (isProgression) {
    // Progresión: jóvenes progresan más
    if (age <= 18) return 1.5;
    if (age <= 21) return 1.3;
    if (age <= 24) return 1.1;
    if (age <= 28) return 0.8;
    if (age <= 32) return 0.4;
    return 0.1; // Veteranos casi no progresan
  } else {
    // Regresión: veteranos decaen más rápido
    if (age <= 24) return 0.1;
    if (age <= 28) return 0.3;
    if (age <= 32) return 0.7;
    if (age <= 35) return 1.2;
    return 1.8; // Jugadores muy viejos decaen muy rápido
  }
}

/**
 * Calcula el puntaje de rendimiento de un jugador basado en sus estadísticas.
 */
function calculatePerformanceScore(stats: DynamicPlayerStats): number {
  if (stats.seasonAppearances === 0) return 5.0; // Neutral si no ha jugado

  const ratingScore = stats.seasonAverageRating / 10; // 0.0 - 1.0
  const goalsPerGame = stats.seasonGoals / stats.seasonAppearances;
  const assistsPerGame = stats.seasonAssists / stats.seasonAppearances;
  const mvpPerGame = stats.seasonMVPs / stats.seasonAppearances;
  const cleanSheetPerGame = stats.seasonCleanSheets / stats.seasonAppearances;

  // Puntaje base de valoración
  let score = ratingScore * 40;

  // Bonuses por estadísticas
  score += goalsPerGame * 15;
  score += assistsPerGame * 8;
  score += mvpPerGame * 10;
  score += cleanSheetPerGame * 5;

  // Penalización por muy pocos minutos
  if (stats.seasonMinutes < stats.seasonAppearances * 45) {
    score *= 0.7;
  }

  return Math.min(score, 100);
}

/**
 * Calcula el cambio de OVR mensual (c cambios sutiles).
 * Rango: -0.3 a +0.3
 */
export function calculateMonthlyProgression(
  stats: DynamicPlayerStats,
  age: number,
  positions: PosCode[],
): number {
  const performanceScore = calculatePerformanceScore(stats);
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // Obtener estadísticas del mes actual si existen
  const currentMonthStats = stats.monthlyStats.find(
    (m) => m.month === currentMonth && m.year === currentYear,
  );

  if (!currentMonthStats || currentMonthStats.appearances === 0) {
    // Si no ha jugado este mes, ligera regresión por falta de actividad
    return -0.05 * getAgeModifier(age, false);
  }

  // Calcular rendimiento mensual
  const monthlyRating = currentMonthStats.averageRating / 10;
  const monthlyGoals = currentMonthStats.goals / (currentMonthStats.appearances || 1);
  const monthlyAssists = currentMonthStats.assists / (currentMonthStats.appearances || 1);

  // Base de cambio
  let change = (monthlyRating - 0.6) * 0.2; // -0.08 a +0.08 basado en rating

  // Bonuses por goles/asistencias
  change += monthlyGoals * 0.03;
  change += monthlyAssists * 0.02;

  // MVP bonus
  change += (currentMonthStats.mvpCount / (currentMonthStats.appearances || 1)) * 0.05;

  // Aplicar modificador de edad
  const ageMod = getAgeModifier(age, change > 0);
  change *= ageMod;

  // Limitar cambio mensual a ±0.3
  return Math.max(-0.3, Math.min(0.3, change));
}

/**
 * Calcula el cambio de OVR al final de temporada (cambios mayores).
 * Rango: -5 a +5
 */
export function calculateSeasonEndProgression(
  stats: DynamicPlayerStats,
  age: number,
  positions: PosCode[],
  seasonNumber: number,
): number {
  const performanceScore = calculatePerformanceScore(stats);

  // Base de cambio basado en rendimiento (50 = neutral)
  let change = (performanceScore - 50) / 10; // -5 a +5

  // Ajuste por número de apariciones (consistencia importa)
  if (stats.seasonAppearances < 10) {
    change *= 0.3; // Penalización por muy pocos partidos
  } else if (stats.seasonAppearances < 20) {
    change *= 0.6;
  }

  // Aplicar modificador de edad
  const ageMod = getAgeModifier(age, change > 0);
  change *= ageMod;

  // Bonus por trofeos ganados
  change += stats.seasonTrophies * 0.5;

  // Limitar cambio estacional a ±5
  return Math.max(-5, Math.min(5, change));
}

/**
 * Inicializa estadísticas dinámicas para un jugador nuevo.
 */
export function initializeDynamicStats(baseOVR: number): DynamicPlayerStats {
  return {
    seasonGoals: 0,
    seasonAssists: 0,
    seasonAppearances: 0,
    seasonMinutes: 0,
    seasonMVPs: 0,
    seasonCleanSheets: 0,
    seasonAverageRating: 6.0,
    seasonTrophies: 0,
    monthlyStats: [],
    currentOVR: baseOVR,
    baseOVR: baseOVR,
    potentialOVR: Math.min(baseOVR + 10, 99), // Potencial inicial
    formHistory: [],
    careerSeasons: [],
    lastProgressionMonth: 0,
    lastProgressionYear: 0,
    lastSeasonEndSeason: 0,
  };
}

/**
 * Actualiza las estadísticas de un jugador después de un partido.
 */
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
  const updated = { ...stats };

  // Actualizar estadísticas de temporada
  updated.seasonGoals += goals;
  updated.seasonAssists += assists;
  updated.seasonAppearances += 1;
  updated.seasonMinutes += minutes;
  if (isMVP) updated.seasonMVPs += 1;
  if (isCleanSheet) updated.seasonCleanSheets += 1;

  // Actualizar media de valoración (media móvil)
  const totalRating = updated.seasonAverageRating * (updated.seasonAppearances - 1);
  updated.seasonAverageRating = (totalRating + rating) / updated.seasonAppearances;

  // Actualizar historial de forma (últimos 10)
  updated.formHistory = [...updated.formHistory, rating].slice(-10);

  // Actualizar estadísticas mensuales
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
    };
    updated.monthlyStats.push(monthStats);
  }

  monthStats.goals += goals;
  monthStats.assists += assists;
  monthStats.appearances += 1;
  if (isMVP) monthStats.mvpCount += 1;
  if (isCleanSheet) monthStats.cleanSheets += 1;

  const monthTotalRating = monthStats.averageRating * (monthStats.appearances - 1);
  monthStats.averageRating = (monthTotalRating + rating) / monthStats.appearances;

  return updated;
}

/**
 * Aplica progresión mensual a un jugador.
 */
export function applyMonthlyProgression(
  stats: DynamicPlayerStats,
  age: number,
  positions: PosCode[],
  currentMonth: number,
  currentYear: number,
): DynamicPlayerStats {
  // Solo progresar una vez por mes
  if (stats.lastProgressionMonth === currentMonth && stats.lastProgressionYear === currentYear) {
    return stats;
  }

  const change = calculateMonthlyProgression(stats, age, positions);
  const updated = { ...stats };

  updated.currentOVR = Math.max(50, Math.min(99, updated.currentOVR + change));
  updated.lastProgressionMonth = currentMonth;
  updated.lastProgressionYear = currentYear;

  return updated;
}

/**
 * Aplica progresión de fin de temporada a un jugador.
 */
export function applySeasonEndProgression(
  stats: DynamicPlayerStats,
  age: number,
  positions: PosCode[],
  seasonNumber: number,
  teamId: string,
): DynamicPlayerStats {
  // Solo progresar una vez por temporada
  if (stats.lastSeasonEndSeason === seasonNumber) {
    return stats;
  }

  const change = calculateSeasonEndProgression(stats, age, positions, seasonNumber);
  const updated = { ...stats };

  // Guardar estadísticas de temporada en historial
  const seasonRecord: SeasonStats = {
    season: seasonNumber,
    teamId,
    goals: stats.seasonGoals,
    assists: stats.seasonAssists,
    appearances: stats.seasonAppearances,
    averageRating: stats.seasonAverageRating,
    mvpCount: stats.seasonMVPs,
    cleanSheets: stats.seasonCleanSheets,
    trophies: 0, // Se actualiza por separado
    finalOVR: stats.currentOVR,
  };

  updated.careerSeasons.push(seasonRecord);

  // Aplicar cambio al OVR base y actual
  updated.baseOVR = Math.max(50, Math.min(99, updated.baseOVR + change));
  updated.currentOVR = updated.baseOVR;

  // Ajustar potencial basado en edad y rendimiento
  if (age <= 22 && change > 0) {
    updated.potentialOVR = Math.min(99, updated.potentialOVR + change * 0.5);
  } else if (age >= 32) {
    updated.potentialOVR = Math.max(updated.baseOVR, updated.potentialOVR - 1);
  }

  // Resetear estadísticas de temporada
  updated.seasonGoals = 0;
  updated.seasonAssists = 0;
  updated.seasonAppearances = 0;
  updated.seasonMinutes = 0;
  updated.seasonMVPs = 0;
  updated.seasonCleanSheets = 0;
  updated.seasonAverageRating = 6.0;
  updated.seasonTrophies = 0;
  updated.monthlyStats = [];

  updated.lastSeasonEndSeason = seasonNumber;

  return updated;
}

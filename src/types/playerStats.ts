/**
 * Estadísticas dinámicas de un jugador que cambian con el tiempo
 * basado en rendimiento, edad y otros factores.
 */

export interface MonthlyStats {
  month: number;
  year: number;
  goals: number;
  assists: number;
  appearances: number;
  averageRating: number;
  mvpCount: number;
  cleanSheets: number;
}

export interface SeasonStats {
  season: number;
  teamId: string;
  goals: number;
  assists: number;
  appearances: number;
  averageRating: number;
  mvpCount: number;
  cleanSheets: number;
  trophies: number;
  finalOVR: number;
}

export interface DynamicPlayerStats {
  // Estadísticas acumuladas por temporada actual
  seasonGoals: number;
  seasonAssists: number;
  seasonAppearances: number;
  seasonMinutes: number;
  seasonMVPs: number;
  seasonCleanSheets: number;
  seasonAverageRating: number;
  seasonTrophies: number; // Trofeos ganados esta temporada
  
  // Estadísticas mensuales para progresión sutil
  monthlyStats: MonthlyStats[];
  
  // Progresión/regresión
  currentOVR: number; // OVR dinámico actual
  baseOVR: number; // OVR base del JSON
  potentialOVR: number; // Potencial dinámico ajustado
  
  // Historial de rendimiento
  formHistory: number[]; // Últimos 10 ratings
  careerSeasons: SeasonStats[];
  
  // Estado de progresión
  lastProgressionMonth: number;
  lastProgressionYear: number;
  lastSeasonEndSeason: number;
}

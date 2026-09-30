/**
 * Estadísticas dinámicas de un jugador que cambian con el tiempo
 * en función del rendimiento, edad, potencial, lesiones y minutos.
 */

export interface PlayerAttributeRatings {
  PAC: number;
  SHO: number;
  PAS: number;
  DRI: number;
  DEF: number;
  PHY: number;
}

export interface MonthlyStats {
  month: number;
  year: number;
  goals: number;
  assists: number;
  appearances: number;
  averageRating: number;
  mvpCount: number;
  cleanSheets: number;
  ratingTotal?: number;
  ratingCount?: number;
  teamId?: string;
  /** Valor interno decimal de evolución del OVR en el cierre de ese mes. La media visible sigue siendo entera. */
  ovr?: number;
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
  seasonRatingTotal?: number;
  seasonRatingCount?: number;
  seasonTrophies: number;

  // Progresión mensual
  monthlyStats: MonthlyStats[];

  // Media y potencial dinámicos
  /** OVR dinámico interno; puede conservar decimales aunque la interfaz muestre un entero. */
  currentOVR: number;
  /** Media de referencia con la que arrancó la carrera. No sube con la progresión. */
  baseOVR: number;
  potentialOVR: number;

  // Atributos dinámicos visibles y utilizables por el simulador
  attributes?: PlayerAttributeRatings;

  // Historial de rendimiento
  formHistory: number[];
  careerSeasons: SeasonStats[];

  // Estado de progresión
  lastProgressionMonth: number;
  lastProgressionYear: number;
  lastProgressionDelta: number;
  lastProgressionDate?: string;
  lastProgressionReason?: string;
  lastSeasonEndSeason: number;
}

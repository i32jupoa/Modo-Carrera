import type { PosCode } from "@/lib/positions";
import type { PlayerAttributeRatings } from "@/types/playerStats";
import { ACADEMY_GROWTH_PROFILES, ACADEMY_TRAITS } from "./academyConstants";

export type AcademyStatus = "academy" | "loaned" | "called-up" | "listed" | "promoted" | "released" | "sold";
export type AcademyTrait = (typeof ACADEMY_TRAITS)[number];
export type AcademyGrowthProfile = (typeof ACADEMY_GROWTH_PROFILES)[number];
export type YouthCoachSpecialty = "GK" | "DEF" | "MID" | "ATT";

export interface AcademyMonthlyStats {
  month: number;
  year: number;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  yellowCards: number;
  redCards: number;
  ratingTotal: number;
  ratingCount: number;
  averageRating: number;
  /** OVR interno al cierre/actualización de ese mes. */
  ovr?: number;
}

export interface AcademySeasonStats {
  season: number;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  yellowCards: number;
  redCards: number;
  ratingTotal: number;
  ratingCount: number;
  averageRating: number;
  /** OVR con el que comenzó la temporada de cantera. */
  startingOvr?: number;
  formHistory: number[];
  monthlyStats: AcademyMonthlyStats[];
  lastMatchDate?: string;
  lastOpponent?: string;
}

export interface AcademySeasonRecord {
  season: number;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  yellowCards: number;
  redCards: number;
  averageRating: number;
  finalOVR: number;
}

export interface AcademyPlayer {
  id: number;
  teamId: string;
  name: string;
  nation: string;
  birthdate: string;
  age: number;
  positions: PosCode[];
  /** OVR interno decimal; la interfaz siempre muestra Math.round(OVR). */
  internalOvr?: number;
  ovr: number;
  potential: number;
  potentialEstimate: { min: number; max: number };
  attributes: PlayerAttributeRatings;
  traits: AcademyTrait[];
  growthProfile: AcademyGrowthProfile;
  joinedSeason: number;
  contractYearsLeft: number;
  status: AcademyStatus;
  loanClubId?: string;
  /** Minutos acumulados en partidos de cantera del curso actual. */
  minutesThisSeason: number;
  academyStats?: AcademySeasonStats;
  academyCareerSeasons?: AcademySeasonRecord[];
  promotedAt?: { date: string; reason: string };
  value?: number;
  mentorId?: number;
  loanStartedAt?: string;
  loanReturnDate?: string;
  loanReports?: AcademyLoanReport[];
  saleFuturePercentage?: number;
  buybackClause?: number;
  retrainingPosition?: PosCode;
  retrainingUntil?: string;
}

export interface AcademyLoanReport {
  date: string;
  minutes: number;
  averageRating: number;
  ovr: number;
  delta: number;
  note: string;
}

export interface ClubAcademyState {
  teamId: string;
  facilityLevel: 1 | 2 | 3 | 4 | 5;
  youthCoach?: { specialty: YouthCoachSpecialty; level: number };
  players: AcademyPlayer[];
  lastIntakeSeason: number;
  manualPromotionAvailable?: boolean;
  lastProgressionDate?: string;
  lastAcademyMatchDate?: string;
  updatedAt: string;
  mentorAssignments?: Record<string, number>;
  history?: AcademyCareerRecord[];
}

export interface AcademyCareerRecord {
  playerId: number;
  playerName: string;
  teamId: string;
  date: string;
  outcome: "promoted" | "sold" | "released" | "debut";
  detail?: string;
}

export interface AcademyPromotionCandidate {
  playerId: number;
  score: number;
  reason: string;
}

export interface AcademyPromotionEvent {
  id: string;
  date: string;
  playerId: number;
  playerName: string;
  teamId: string;
  reason: string;
  wasUserDecision: boolean;
}

export interface AcademyNotificationSummary {
  newTalent: number;
  readyToPromote: number;
  expiringContracts: number;
  squadGap: boolean;
}

export function createEmptyAcademySeasonStats(season: number, startingOvr = 0): AcademySeasonStats {
  return {
    season,
    appearances: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    yellowCards: 0,
    redCards: 0,
    ratingTotal: 0,
    ratingCount: 0,
    averageRating: 0,
    startingOvr: Math.round(startingOvr),
    formHistory: [],
    monthlyStats: [],
  };
}

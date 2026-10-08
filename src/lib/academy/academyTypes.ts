import type { PosCode } from "@/lib/positions";
import type { PlayerAttributeRatings } from "@/types/playerStats";
import { ACADEMY_GROWTH_PROFILES, ACADEMY_TRAITS } from "./academyConstants";

export type AcademyStatus = "academy" | "loaned" | "called-up" | "listed" | "promoted" | "released" | "sold";
export type AcademyTrait = (typeof ACADEMY_TRAITS)[number];
export type AcademyGrowthProfile = (typeof ACADEMY_GROWTH_PROFILES)[number];
export type YouthCoachSpecialty = "GK" | "DEF" | "MID" | "ATT";

export interface AcademyPlayer {
  id: number;
  teamId: string;
  name: string;
  nation: string;
  birthdate: string;
  age: number;
  positions: PosCode[];
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
  minutesThisSeason: number;
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

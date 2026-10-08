export const ACADEMY_ID_BASE = 900_000_000;
export const ACADEMY_ID_SPAN = 90_000_000;

export const ACADEMY_LIMITS = {
  minPlayers: 16,
  maxPlayers: 22,
  annualIntakeMin: 4,
  annualIntakeMax: 6,
  intakeMinAge: 15,
  intakeMaxAge: 17,
  academyMinAge: 16,
  academyMaxAge: 21,
  professionalPromotionMinAge: 18,
  retireFromAcademyAge: 21,
  minOvr: 38,
  maxOvr: 62,
  minPotential: 55,
  maxPotential: 88,
  rareHighPotentialCutoff: 82,
  highPotentialChance: 0.13,
  foreignNationChance: 0.2,
  baseContractYears: 2,
  promotionContractMinYears: 2,
  promotionContractMaxYears: 4,
  promotionWageBudgetShare: 0.018,
  notificationPotentialThreshold: 78,
  promotionOvrGapToSquad: 10,
  facilityUpgradeCosts: [0, 2_000_000, 5_000_000, 10_000_000, 18_000_000, 30_000_000] as readonly number[],
  youthCoachUpgradeCosts: [0, 1_000_000, 2_500_000, 5_000_000, 9_000_000, 15_000_000] as readonly number[],
  mentorBonus: 1.14,
  retrainingProgressPenalty: 0.72,
  retrainingCost: 25000,
  coachSpecialtyMultiplier: 1.06,
  academySaleFuturePercentageMax: 50,
  academyBuybackMaxMultiplier: 1.35,
  loanReportIntervalDays: 28,
} as const;

export const ACADEMY_PROMOTION_LIMITS = {
  preSeasonMin: 0,
  preSeasonMax: 3,
  windowMax: 2,
  emergencyMax: 1,
} as const;

export const ACADEMY_FACILITIES = {
  min: 1,
  max: 5,
  default: 1,
  ovrBonusByLevel: [0, 1, 2, 3, 4, 5] as readonly number[],
  potentialBonusByLevel: [0, 0, 2, 3, 5, 7] as readonly number[],
  progressionMultiplierByLevel: [0.85, 0.95, 1, 1.1, 1.2, 1.3] as readonly number[],
  annualIntakeBonusByLevel: [0, 0, 0, 1, 1, 2] as readonly number[],
} as const;

export const ACADEMY_SCORE_WEIGHTS = {
  positionFit: 0.25,
  ovr: 0.3,
  potential: 0.2,
  age: 0.1,
  clubPreference: 0.15,
} as const;

export const ACADEMY_TRAITS = [
  "diamond",
  "early",
  "late-bloomer",
  "hard-worker",
  "temperamental",
] as const;

export const ACADEMY_GROWTH_PROFILES = [
  "normal",
  "early",
  "late",
  "stagnant",
] as const;

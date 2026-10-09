export const ACADEMY_ID_BASE = 900_000_000;
export const ACADEMY_ID_SPAN = 90_000_000;

export const ACADEMY_LIMITS = {
  minPlayers: 16,
  maxPlayers: 28,
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

/**
 * Composición objetivo para una cantera de 28 jugadores. Los grupos coinciden
 * con la estructura visual de Plantilla: 3 POR, 9 DEF, 8 MED, 8 ATA.
 */
export const ACADEMY_TARGET_POSITION_COUNTS = {
  GK: 3,
  DFC: 5,
  LD: 2,
  LI: 2,
  MCD: 2,
  MC: 2,
  MCO: 2,
  MD: 1,
  MI: 1,
  ED: 2,
  EI: 2,
  DC: 4,
} as const;

export const ACADEMY_POSITION_GROUP_COUNTS = {
  GK: 3,
  DEF: 9,
  MID: 8,
  FWD: 8,
} as const;

/** Una segunda demarcación solo se genera cuando supera este porcentaje. */
export const ACADEMY_SECONDARY_POSITION_CHANCE = 0.35;

/**
 * Compatibilidad futbolística para posiciones secundarias. Solo se puede
 * elegir una posición de esta tabla; GK no tiene ninguna alternativa.
 */
export const ACADEMY_SECONDARY_POSITION_COMPATIBILITY = {
  GK: [],
  DFC: ["MCD", "LD", "LI"],
  LD: ["ED", "MD", "DFC", "LI"],
  LI: ["EI", "MI", "DFC", "LD"],
  MCD: ["DFC", "MC"],
  MC: ["MCD", "MCO", "MD", "MI"],
  MCO: ["MC", "DC", "MD", "MI", "ED", "EI"],
  MD: ["ED", "LD", "MC", "MCO", "MI"],
  MI: ["EI", "LI", "MC", "MCO", "MD"],
  ED: ["MD", "DC", "EI", "MCO"],
  EI: ["MI", "DC", "ED", "MCO"],
  DC: ["MCO", "ED", "EI"],
} as const;

export const ACADEMY_SIMULATION = {
  lineup: { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  substitutionsPerMatch: 3,
  starterMinMinutes: 66,
  starterMaxMinutes: 90,
  substituteMinMinutes: 18,
  substituteMaxMinutes: 35,
  opponentMinOvr: 45,
  opponentMaxOvr: 68,
  opponentVariance: 8,
  teamExpectedGoalsBase: 1.18,
  teamExpectedGoalsStrengthFactor: 0.72,
  teamExpectedGoalsMin: 0.25,
  teamExpectedGoalsMax: 3.25,
  opponentExpectedGoalsBase: 1.02,
  opponentExpectedGoalsStrengthFactor: 0.58,
  opponentExpectedGoalsMin: 0.22,
  opponentExpectedGoalsMax: 2.75,
  maxGoalsPerTeam: 5,
  goalAssistChance: 0.64,
  yellowCardChance: 0.075,
  redCardChance: 0.008,
  ratingMin: 5.1,
  ratingMax: 9.55,
  ratingNoiseMin: -0.34,
  ratingNoiseMax: 0.34,
  maxFormHistory: 10,
  cleanSheetMinMinutes: 60,
  ratingIndividualWeight: 0.02,
  ratingTeamStrengthCap: 0.3,
} as const;

export const ACADEMY_PROGRESSION = {
  monthlyMinDelta: -0.08,
  monthlyMaxDelta: 0.68,
  noMinutesBaseline: 0.07,
  performanceWeight: 0.13,
  minutesWeight: 0.46,
  expectedMonthlyMinutes: 270,
  ageWeight: 0.22,
  potentialGapWeight: 0.34,
  ratingTarget: 7.05,
  poorRatingThreshold: 6.25,
  highPotentialBonus: 0.12,
  varianceMin: 0.82,
  varianceMax: 1.18,
  negativePerformanceFactor: 0.7,
  maxDaysToProcess: 3700,
  progressionHistoryMonths: 12,
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

import { formatSeasonLabel, getSeasonStartYear } from "./calendarFactory.ts";

export type SeasonRolloverDates = {
  fromSeason: string;
  toSeason: string;
  seasonStartYear: number;
  nextSeasonStartYear: number;
  seasonNumber: number;
  endDate: string;
  nextStartDate: string;
};

export function getSeasonRolloverDates(season: string): SeasonRolloverDates {
  const seasonStartYear = getSeasonStartYear(season);
  const nextSeasonStartYear = seasonStartYear + 1;
  return {
    fromSeason: season,
    toSeason: formatSeasonLabel(nextSeasonStartYear),
    seasonStartYear,
    nextSeasonStartYear,
    seasonNumber: Math.max(1, seasonStartYear - 2025),
    endDate: `${nextSeasonStartYear}-06-30`,
    nextStartDate: `${nextSeasonStartYear}-07-01`,
  };
}

/** Cheap, pure boundary check safe to use from globally mounted UI components. */
export function isSeasonRolloverDue(
  save: { season?: string | null; currentDate?: string | null } | null | undefined,
): boolean {
  if (!save?.season || !save.currentDate) return false;
  return String(save.currentDate) >= getSeasonRolloverDates(save.season).endDate;
}

export type RolloverProgressStage =
  | "checkpoint"
  | "archive"
  | "progression"
  | "contracts"
  | "loans"
  | "retirements"
  | "academy"
  | "competitions"
  | "economy"
  | "commit";

export type RolloverProgress = {
  stage: RolloverProgressStage;
  progress: number;
  message: string;
};

export function remainingInjuryDays(injuredUntilDate: string | undefined, targetDate: string): number {
  if (!injuredUntilDate || !/^\d{4}-\d{2}-\d{2}$/.test(injuredUntilDate)) return 0;
  const target = Date.parse(`${targetDate}T00:00:00Z`);
  const until = Date.parse(`${injuredUntilDate}T00:00:00Z`);
  if (!Number.isFinite(target) || !Number.isFinite(until) || until <= target) return 0;
  return Math.max(0, Math.ceil((until - target) / 86_400_000));
}

/**
 * Reset the match/season counters without discarding dynamic OVR progression,
 * age overrides, career history, or a genuinely long injury.
 */
export function resetPlayerSeasonCounters<T extends Record<string, any>>(
  previous: T,
  defaults: T,
  nextStartDate: string,
): T {
  const daysRemaining = remainingInjuryDays(previous.injuredUntilDate, nextStartDate);
  const preserveInjury = daysRemaining > 14;
  const dynamic = previous.dynamicStats && typeof previous.dynamicStats === "object"
    ? {
        ...previous.dynamicStats,
        seasonGoals: 0,
        seasonAssists: 0,
        seasonAppearances: 0,
        seasonMinutes: 0,
        seasonMVPs: 0,
        seasonCleanSheets: 0,
        seasonAverageRating: 6,
        seasonRatingTotal: 0,
        seasonRatingCount: 0,
        seasonTrophies: 0,
        monthlyStats: [],
        formHistory: [],
      }
    : previous.dynamicStats;
  return {
    ...defaults,
    dynamicStats: dynamic,
    ageOverride: previous.ageOverride,
    ageOverrideSeason: previous.ageOverrideSeason,
    morale: 65,
    energy: 100,
    energyLastUpdatedDate: nextStartDate,
    formHistory: [],
    squadRole: previous.squadRole,
    squadRoleIsNegotiated: previous.squadRoleIsNegotiated,
    satisfactionMissStreak: 0,
    satisfactionNotCalledStreak: 0,
    satisfactionBenchStreak: 0,
    ...(preserveInjury
      ? {
          injuredUntil: previous.injuredUntil ?? 0,
          injuredUntilDate: previous.injuredUntilDate,
          injuryStartDate: previous.injuryStartDate,
          injuryDurationDays: previous.injuryDurationDays,
          injuryType: previous.injuryType,
          injuryArea: previous.injuryArea,
          injuryReason: previous.injuryReason,
        }
      : {}),
  } as T;
}

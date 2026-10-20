import { teamById, type LeagueId } from "@/data/teams";
import { generateLeagueFixtures } from "@/lib/season";
import {
  getSeasonCalendarAnchors,
  INITIAL_SEASON_START_YEAR,
  type SeasonCalendarOptions,
} from "@/lib/season/calendarFactory";
import {
  assignFixtureDates,
  LEAGUE_MD1_FRIDAY,
  rawToSchedule,
  scheduleNeedsRealisticDates,
} from "@/lib/fixtureScheduler";

/** Legacy constants retained for consumers that still need 2026/27 anchors. */
export const LEAGUE_SEASON_KICKOFF = "2026-08-15";
export function leagueSeasonKickoff(seasonStartYear = INITIAL_SEASON_START_YEAR): string {
  return getSeasonCalendarAnchors(seasonStartYear).leagueKickoffSaturday;
}
export function leagueMatchday1Friday(seasonStartYear = INITIAL_SEASON_START_YEAR): string {
  return getSeasonCalendarAnchors(seasonStartYear).leagueMatchday1Friday;
}
export { LEAGUE_MD1_FRIDAY, scheduleNeedsRealisticDates };

export type ScheduleFixture = {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  isPlayed: boolean;
  homeScore: number | null;
  awayScore: number | null;
  competition: "Liga" | "cup" | "ucl";
  /** UEFA competition identity when the fixture reuses the UCL schedule engine. */
  europeanCompetition?: "uel" | "uecl";
  matchday: number;
  /** Optional descriptive round label for non-league fixtures (e.g. promotion playoffs). */
  round?: string;
  /** Marks promotion/relegation playoff matches in the day modal. */
  promotionPlayoff?: boolean;
};

/** Full league calendar with realistic weekday spread + 72h rest. */
export function buildFullLeagueSchedule(
  league: LeagueId,
  protectedDates?: Map<string, Set<string>>,
  options: SeasonCalendarOptions = {},
): ScheduleFixture[] {
  const raw = generateLeagueFixtures(league, options);
  const dates = assignFixtureDates(raw, protectedDates, options);
  return rawToSchedule(raw, dates, options);
}

export function buildUserLeagueSchedule(
  myTeamId: string,
  league: LeagueId,
  protectedDates?: Map<string, Set<string>>,
  options: SeasonCalendarOptions = {},
): ScheduleFixture[] {
  return buildFullLeagueSchedule(league, protectedDates, options).filter(
    (f) => f.homeTeam === myTeamId || f.awayTeam === myTeamId,
  );
}

/** Merge played results when upgrading from partial (user-only) schedules. */
export function mergeScheduleWithPlayed(
  full: ScheduleFixture[],
  existing: ScheduleFixture[],
  league: LeagueId,
): ScheduleFixture[] {
  const played = new Map(existing.filter((f) => f.isPlayed).map((f) => [f.id, f]));
  let merged = full.map((f) => {
    const prev = played.get(f.id);
    if (!prev) return f;
    return {
      ...f,
      isPlayed: prev.isPlayed,
      homeScore: prev.homeScore,
      awayScore: prev.awayScore,
    };
  });
  // Existing dates are part of the fixed season calendar. Never shift an
  // unplayed fixture after the season has started. The optional `full` schedule
  // already contains the canonical dates for newly-added fixtures.
  return merged;
}

export function userFixtures(fixtures: ScheduleFixture[], myTeamId: string): ScheduleFixture[] {
  return fixtures.filter((f) => f.homeTeam === myTeamId || f.awayTeam === myTeamId);
}

export function scheduleFixturesByDate(
  fixtures: ScheduleFixture[],
): Map<string, ScheduleFixture[]> {
  const map = new Map<string, ScheduleFixture[]>();
  for (const f of fixtures) {
    const list = map.get(f.date) ?? [];
    list.push(f);
    map.set(f.date, list);
  }
  return map;
}

export function opponentLabel(fixture: ScheduleFixture, myTeamId: string): string {
  const oppId = fixture.homeTeam === myTeamId ? fixture.awayTeam : fixture.homeTeam;
  return teamById(oppId).short;
}

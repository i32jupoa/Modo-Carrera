import { teamById, type LeagueId } from "@/data/teams";
import { generateLeagueFixtures } from "@/lib/season";
import {
  assignFixtureDates,
  LEAGUE_MD1_FRIDAY,
  rawToSchedule,
  rescheduleUnplayedFixtures,
  scheduleNeedsRealisticDates,
} from "@/lib/fixtureScheduler";

/** First league matchday anchor (Saturday display reference). */
export const LEAGUE_SEASON_KICKOFF = "2025-08-16";
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
  matchday: number;
};

/** Full league calendar with realistic weekday spread + 72h rest. */
export function buildFullLeagueSchedule(league: LeagueId): ScheduleFixture[] {
  const raw = generateLeagueFixtures(league);
  const dates = assignFixtureDates(raw);
  return rawToSchedule(raw, dates);
}

export function buildUserLeagueSchedule(myTeamId: string, league: LeagueId): ScheduleFixture[] {
  return buildFullLeagueSchedule(league).filter(
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
  if (scheduleNeedsRealisticDates(merged)) {
    merged = rescheduleUnplayedFixtures(merged, generateLeagueFixtures(league));
  }
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

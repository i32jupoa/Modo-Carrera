import { teamById } from "@/data/teams";
import type { Player } from "@/data/players";
import type { ScheduleFixture } from "@/lib/leagueSchedule";
import { simulateMatch, type SimResult } from "@/lib/simulation";

export type FixtureResult = {
  homeScore: number;
  awayScore: number;
};

export function simulateScheduleFixture(
  fixture: ScheduleFixture,
  getXI: (teamId: string, matchday: number) => Player[],
): FixtureResult {
  const full = simulateScheduleFixtureDetailed(fixture, getXI);
  return { homeScore: full.homeGoals, awayScore: full.awayGoals };
}

export function simulateScheduleFixtureDetailed(
  fixture: ScheduleFixture,
  getXI: (teamId: string, matchday: number) => Player[],
): SimResult {
  const home = teamById(fixture.homeTeam);
  const away = teamById(fixture.awayTeam);
  const homeXI = getXI(fixture.homeTeam, fixture.matchday);
  const awayXI = getXI(fixture.awayTeam, fixture.matchday);
  return simulateMatch(home, away, homeXI, awayXI);
}

export function applyFixtureResult(
  fixtures: ScheduleFixture[],
  fixtureId: string,
  scores: FixtureResult,
): ScheduleFixture[] {
  return fixtures.map((f) =>
    f.id === fixtureId
      ? {
          ...f,
          isPlayed: true,
          homeScore: scores.homeScore,
          awayScore: scores.awayScore,
        }
      : f,
  );
}

export function unplayedOnDate(fixtures: ScheduleFixture[], iso: string): ScheduleFixture[] {
  return fixtures.filter((f) => f.date === iso && !f.isPlayed);
}

export function involvesTeam(fixture: ScheduleFixture, teamId: string): boolean {
  return fixture.homeTeam === teamId || fixture.awayTeam === teamId;
}

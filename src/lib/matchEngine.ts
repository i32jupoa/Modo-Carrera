import { teamById } from "@/data/teams";
import type { Player } from "@/data/players";
import type { ScheduleFixture } from "@/lib/leagueSchedule";
import { simulateMatch, simulateMatchFast, type SimResult } from "@/lib/simulation";

export type FixtureResult = {
  homeScore: number;
  awayScore: number;
};

export function simulateScheduleFixture(
  fixture: ScheduleFixture,
  getXI: (teamId: string, matchday: number) => Player[],
): FixtureResult {
  const full = simulateScheduleFixtureFastDetailed(fixture, getXI);
  return { homeScore: full.homeGoals, awayScore: full.awayGoals };
}

/**
 * Fast schedule simulation for calendar/background matches. It keeps the same
 * rich result shape used by the stats pipeline, but avoids the expensive
 * event-by-event simulation used for matches the user actually watches live.
 */
export function simulateScheduleFixtureFastDetailed(
  fixture: ScheduleFixture,
  getXI: (teamId: string, matchday: number) => Player[],
  matchOptions: Parameters<typeof simulateMatchFast>[4] = {},
): SimResult {
  const home = teamById(fixture.homeTeam);
  const away = teamById(fixture.awayTeam);
  const homeXI = getXI(fixture.homeTeam, fixture.matchday);
  const awayXI = getXI(fixture.awayTeam, fixture.matchday);

  if (!home || !away) {
    return {
      homeGoals: 0,
      awayGoals: 0,
      events: [],
      cards: [],
      injuries: [],
      xgHome: 0,
      xgAway: 0,
      highlights: [],
      ratings: [],
      mvp: null,
      homeLineup: homeXI,
      awayLineup: awayXI,
      homeStartingLineup: homeXI,
      awayStartingLineup: awayXI,
      homeFinalLineup: homeXI,
      awayFinalLineup: awayXI,
      substitutions: [],
      energyAtEnd: {},
    };
  }

  if (homeXI.length !== 11 || awayXI.length !== 11) {
    throw new Error(
      `No se puede simular ${fixture.id} sin dos onces legales de 11 (${homeXI.length}/11 y ${awayXI.length}/11).`,
    );
  }

  return simulateMatchFast(home, away, homeXI, awayXI, matchOptions);
}

export function simulateScheduleFixtureDetailed(
  fixture: ScheduleFixture,
  getXI: (teamId: string, matchday: number) => Player[],
): SimResult {
  const home = teamById(fixture.homeTeam);
  const away = teamById(fixture.awayTeam);
  const homeXI = getXI(fixture.homeTeam, fixture.matchday);
  const awayXI = getXI(fixture.awayTeam, fixture.matchday);
  if (homeXI.length !== 11 || awayXI.length !== 11) {
    throw new Error(
      `No se puede simular ${fixture.id} sin dos onces legales de 11 (${homeXI.length}/11 y ${awayXI.length}/11).`,
    );
  }
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

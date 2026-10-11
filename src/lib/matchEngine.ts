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

  if (homeXI.length === 0 || awayXI.length === 0) {
    // Un XI vacío ya no debe convertir silenciosamente todos los partidos de
    // calendario en 0-0. Usamos una estimación por fuerza de equipos como red
    // de seguridad; cuando hay alineaciones válidas se mantiene el motor normal.
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const homeXg = clamp(1.25 + (home.att - away.def) * 0.018 + (home.mid - away.mid) * 0.006, 0.25, 3.2);
    const awayXg = clamp(1.05 + (away.att - home.def) * 0.018 + (away.mid - home.mid) * 0.006, 0.2, 3.0);
    const poisson = (lambda: number) => {
      const threshold = Math.exp(-lambda);
      let product = 1;
      let goals = 0;
      do {
        goals += 1;
        product *= Math.random();
      } while (product > threshold && goals < 8);
      return Math.max(0, goals - 1);
    };
    return {
      homeGoals: poisson(homeXg),
      awayGoals: poisson(awayXg),
      events: [],
      cards: [],
      injuries: [],
      xgHome: homeXg,
      xgAway: awayXg,
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

  return simulateMatchFast(home, away, homeXI, awayXI);
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

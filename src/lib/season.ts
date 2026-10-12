import { type LeagueId, teamById, teamsByLeague } from "@/data/teams";
import type { Player } from "@/data/players";
import { simulateMatch, type SimResult } from "@/lib/simulation";
import {
  INITIAL_SEASON_START_YEAR,
  createSeasonTeamOrder,
  scopedCalendarSeed,
  createSeededRandom,
  type SeasonCalendarOptions,
} from "@/lib/season/calendarFactory";

export type Competition = "league" | "cup" | "ucl";

export type EuropeanCompetition = "ucl" | "uel" | "uecl";

export type Fixture = {
  id: string;
  competition: Competition;
  league: LeagueId; // for league fixtures = that league; for cup = host league; for UCL = "all" via metadata
  matchday: number; // for league: 1..N; for cup/UCL: round number 1..M
  round?: string; // friendly label e.g. "R16", "QF", "SF", "Final"
  /** Actual calendar date used to play/simulate the fixture (ISO yyyy-mm-dd). */
  date?: string;
  homeId: string;
  awayId: string;
  result?: SimResult;
  /** European cup identity while reusing the Champions League match engine. */
  europeanCompetition?: EuropeanCompetition;
};

export type Standing = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

export function generateLeagueFixtures(
  league: LeagueId,
  options: SeasonCalendarOptions = {},
): Fixture[] {
  const seasonStartYear = options.seasonStartYear ?? INITIAL_SEASON_START_YEAR;
  const legacyInitialSeason = seasonStartYear === INITIAL_SEASON_START_YEAR;
  const teamContext = options.teamLeagueOverrides === undefined
    ? undefined
    : { teamLeagueOverrides: options.teamLeagueOverrides };
  const teams = teamsByLeague(league, teamContext);
  let ids = teams.map((t) => t.id);

  // Preserve the original 2026/27 fixture IDs and order for existing saves.
  // Later seasons use a stable, season-scoped shuffle so the order changes
  // between campaigns without making saves depend on runtime randomness.
  const scheduleScope = `league-fixtures:${league}`;
  const scheduleSeed = scopedCalendarSeed(options.seed, seasonStartYear, scheduleScope);
  const random = createSeededRandom(scheduleSeed);
  if (!legacyInitialSeason) {
    ids = createSeasonTeamOrder(ids, seasonStartYear, options.seed, scheduleScope);
  }

  // Handle odd number of teams by adding a bye.
  if (ids.length % 2 !== 0) ids.push("__BYE__");

  const numTeams = ids.length;
  const rounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;
  const fixtures: Fixture[] = [];
  let teamArray = ids.slice();
  const lastHomeAway = new Map<string, { side: "home" | "away"; streak: number }>();

  for (let round = 0; round < rounds; round += 1) {
    const pairings: Array<{ team1: string; team2: string }> = [];
    for (let index = 0; index < matchesPerRound; index += 1) {
      const team1 = teamArray[index];
      const team2 = teamArray[numTeams - 1 - index];
      if (team1 === "__BYE__" || team2 === "__BYE__") continue;
      pairings.push({ team1, team2 });
    }

    // In the first season retain the exact historic home/away algorithm. In
    // future seasons choose the round orientation that minimises repeated
    // home/away runs; a seeded tie-break keeps the result reproducible.
    let invertRound = round % 2 !== 0;
    if (!legacyInitialSeason) {
      const orientationCost = (invert: boolean): number => {
        let cost = 0;
        for (const pair of pairings) {
          const home = invert ? pair.team2 : pair.team1;
          const away = invert ? pair.team1 : pair.team2;
          for (const [teamId, side] of [[home, "home"], [away, "away"]] as const) {
            const previous = lastHomeAway.get(teamId);
            if (previous?.side === side) cost += previous.streak >= 2 ? 6 : 2;
          }
        }
        return cost;
      };
      const normalCost = orientationCost(false);
      const invertedCost = orientationCost(true);
      invertRound = invertedCost < normalCost || (invertedCost === normalCost && random() < 0.5);
    }

    for (const pair of pairings) {
      const home = invertRound ? pair.team2 : pair.team1;
      const away = invertRound ? pair.team1 : pair.team2;
      fixtures.push({
        id: `${league}-r${round + 1}-${home}-${away}`,
        competition: "league",
        league,
        matchday: round + 1,
        homeId: home,
        awayId: away,
      });
      if (!legacyInitialSeason) {
        for (const [teamId, side] of [[home, "home"], [away, "away"]] as const) {
          const previous = lastHomeAway.get(teamId);
          lastHomeAway.set(teamId, {
            side,
            streak: previous?.side === side ? previous.streak + 1 : 1,
          });
        }
      }
    }

    // Circle method: keep the first item fixed and rotate the remainder.
    teamArray = [teamArray[0], teamArray[numTeams - 1], ...teamArray.slice(1, numTeams - 1)];
  }

  // Second half mirrors the first half with inverted venues, preserving a
  // complete double round-robin for every even or odd league size.
  const firstHalfFixtures = fixtures.slice();
  for (const fixture of firstHalfFixtures) {
    fixtures.push({
      id: `${fixture.league}-r${fixture.matchday + rounds}-${fixture.awayId}-${fixture.homeId}`,
      competition: "league",
      league: fixture.league,
      matchday: fixture.matchday + rounds,
      homeId: fixture.awayId,
      awayId: fixture.homeId,
    });
  }

  return fixtures;
}

export function emptyStandings(league: LeagueId, context?: { teamLeagueOverrides?: Readonly<Record<string, string>> }): Standing[] {
  return teamsByLeague(league, context).map((t) => ({
    teamId: t.id,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
  }));
}

export function applyResult(standings: Standing[], f: Fixture): Standing[] {
  if (!f.result) return standings;
  const { homeGoals, awayGoals } = f.result;
  return standings.map((s) => {
    if (s.teamId === f.homeId) {
      const won = homeGoals > awayGoals ? 1 : 0;
      const drawn = homeGoals === awayGoals ? 1 : 0;
      const lost = homeGoals < awayGoals ? 1 : 0;
      return {
        ...s,
        played: s.played + 1,
        won: s.won + won,
        drawn: s.drawn + drawn,
        lost: s.lost + lost,
        gf: s.gf + homeGoals,
        ga: s.ga + awayGoals,
        gd: s.gd + (homeGoals - awayGoals),
        points: s.points + won * 3 + drawn,
      };
    }
    if (s.teamId === f.awayId) {
      const won = awayGoals > homeGoals ? 1 : 0;
      const drawn = homeGoals === awayGoals ? 1 : 0;
      const lost = awayGoals < homeGoals ? 1 : 0;
      return {
        ...s,
        played: s.played + 1,
        won: s.won + won,
        drawn: s.drawn + drawn,
        lost: s.lost + lost,
        gf: s.gf + awayGoals,
        ga: s.ga + homeGoals,
        gd: s.gd + (awayGoals - homeGoals),
        points: s.points + won * 3 + drawn,
      };
    }
    return s;
  });
}

export function sortStandings(standings: Standing[]): Standing[] {
  return standings.slice().sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return teamById(a.teamId).name.localeCompare(teamById(b.teamId).name);
  });
}

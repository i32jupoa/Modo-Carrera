import { LeagueId, Team, TEAMS, teamById, teamsByLeague } from "@/data/teams";
import { Player } from "@/data/players";
import { simulateMatch, SimResult } from "@/lib/simulation";

export type Competition = "league" | "cup" | "ucl";

export type Fixture = {
  id: string;
  competition: Competition;
  league: LeagueId; // for league fixtures = that league; for cup = host league; for UCL = "all" via metadata
  matchday: number; // for league: 1..N; for cup/UCL: round number 1..M
  round?: string; // friendly label e.g. "R16", "QF", "SF", "Final"
  homeId: string;
  awayId: string;
  result?: SimResult;
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

export function generateLeagueFixtures(league: LeagueId): Fixture[] {
  const teams = teamsByLeague(league);
  const ids = teams.map((t) => t.id);
  if (ids.length % 2 !== 0) ids.push("__BYE__");
  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;

  const fixtures: Fixture[] = [];
  let arr = ids.slice();

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      if (home !== "__BYE__" && away !== "__BYE__") {
        const isFlipped = r % 2 === 1 && i === 0;
        const h = isFlipped ? away : home;
        const a = isFlipped ? home : away;
        fixtures.push({
          id: `${league}-r${r + 1}-${h}-${a}`,
          competition: "league",
          league,
          matchday: r + 1,
          homeId: h,
          awayId: a,
        });
      }
    }
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  const firstHalf = fixtures.slice();
  for (const f of firstHalf) {
    fixtures.push({
      id: `${f.league}-r${f.matchday + rounds}-${f.awayId}-${f.homeId}`,
      competition: "league",
      league: f.league,
      matchday: f.matchday + rounds,
      homeId: f.awayId,
      awayId: f.homeId,
    });
  }

  return fixtures;
}

export function emptyStandings(league: LeagueId): Standing[] {
  return teamsByLeague(league).map((t) => ({
    teamId: t.id,
    played: 0, won: 0, drawn: 0, lost: 0,
    gf: 0, ga: 0, gd: 0, points: 0,
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
        played: s.played + 1, won: s.won + won, drawn: s.drawn + drawn, lost: s.lost + lost,
        gf: s.gf + homeGoals, ga: s.ga + awayGoals, gd: s.gd + (homeGoals - awayGoals),
        points: s.points + won * 3 + drawn,
      };
    }
    if (s.teamId === f.awayId) {
      const won = awayGoals > homeGoals ? 1 : 0;
      const drawn = homeGoals === awayGoals ? 1 : 0;
      const lost = awayGoals < homeGoals ? 1 : 0;
      return {
        ...s,
        played: s.played + 1, won: s.won + won, drawn: s.drawn + drawn, lost: s.lost + lost,
        gf: s.gf + awayGoals, ga: s.ga + homeGoals, gd: s.gd + (awayGoals - homeGoals),
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

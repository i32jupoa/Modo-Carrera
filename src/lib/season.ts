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
  const n = ids.length;
  
  // Handle odd number of teams by adding a bye
  if (n % 2 !== 0) {
    ids.push("__BYE__");
  }
  
  const numTeams = ids.length;
  const rounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;

  const fixtures: Fixture[] = [];
  
  // Create a copy of the team array for rotation
  let teamArray = ids.slice();
  
  // Generate first half of the season (rounds 1 to N-1)
  for (let round = 0; round < rounds; round++) {
    const roundFixtures: Fixture[] = [];
    
    // Pair teams for this round using circle method
    for (let i = 0; i < matchesPerRound; i++) {
      const team1 = teamArray[i];
      const team2 = teamArray[numTeams - 1 - i];
      
      // Skip bye teams
      if (team1 === "__BYE__" || team2 === "__BYE__") {
        continue;
      }
      
      // Alternate home/away to ensure better distribution
      // For even rounds, invert the home/away assignment
      const isEvenRound = round % 2 === 0;
      const home = isEvenRound ? team1 : team2;
      const away = isEvenRound ? team2 : team1;
      
      roundFixtures.push({
        id: `${league}-r${round + 1}-${home}-${away}`,
        competition: "league",
        league,
        matchday: round + 1,
        homeId: home,
        awayId: away,
      });
    }
    
    fixtures.push(...roundFixtures);
    
    // Rotate the array for the next round (keep first team fixed, rotate others)
    // Standard circle method: first element stays, rest rotate
    teamArray = [teamArray[0], teamArray[numTeams - 1], ...teamArray.slice(1, numTeams - 1)];
  }
  
  // Generate second half of the season as perfect mirror of first half
  // Each fixture from the first half is duplicated with inverted home/away
  const firstHalfFixtures = fixtures.slice();
  for (const f of firstHalfFixtures) {
    fixtures.push({
      id: `${f.league}-r${f.matchday + rounds}-${f.awayId}-${f.homeId}`,
      competition: "league",
      league: f.league,
      matchday: f.matchday + rounds,
      homeId: f.awayId,  // Inverted: away becomes home
      awayId: f.homeId,  // Inverted: home becomes away
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

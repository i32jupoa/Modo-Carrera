import { teamById } from "@/data/teams";
import type { ScheduleFixture } from "@/lib/leagueSchedule";

export type LeagueStandingRow = {
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

function emptyRow(teamId: string): LeagueStandingRow {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
  };
}

/** Standings from played Liga fixtures in the Zustand schedule. */
export function computeLeagueStandings(
  fixtures: ScheduleFixture[],
  teamIds: string[],
): LeagueStandingRow[] {
  const table = new Map<string, LeagueStandingRow>();
  for (const id of teamIds) table.set(id, emptyRow(id));

  for (const f of fixtures) {
    if (!f.isPlayed || f.homeScore == null || f.awayScore == null) continue;
    const home = table.get(f.homeTeam) ?? emptyRow(f.homeTeam);
    const away = table.get(f.awayTeam) ?? emptyRow(f.awayTeam);
    const hg = f.homeScore;
    const ag = f.awayScore;

    home.played++;
    away.played++;
    home.gf += hg;
    home.ga += ag;
    away.gf += ag;
    away.ga += hg;

    if (hg > ag) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (hg < ag) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }

    table.set(f.homeTeam, home);
    table.set(f.awayTeam, away);
  }

  const rows = [...table.values()].map((r) => ({
    ...r,
    gd: r.gf - r.ga,
  }));

  return rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return teamById(a.teamId).name.localeCompare(teamById(b.teamId).name);
  });
}

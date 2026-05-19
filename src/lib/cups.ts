import { LeagueId, TEAMS, teamById, teamsByLeague } from "@/data/teams";
import { Fixture } from "@/lib/season";

/* ============================================================
 *  NATIONAL CUP  (per league, knockout, 16 teams)
 * ============================================================ */
export const CUP_SCHEDULE: { matchday: number; round: string; size: number }[] = [
  { matchday: 6, round: "R16", size: 16 },
  { matchday: 12, round: "QF", size: 8 },
  { matchday: 22, round: "SF", size: 4 },
  { matchday: 30, round: "Final", size: 2 },
];

export function initCup(league: LeagueId): { fixtures: Fixture[]; participants: string[] } {
  const teams = teamsByLeague(league).slice().sort((a, b) => (b.att + b.mid + b.def) - (a.att + a.mid + a.def));
  const sixteen = teams.slice(0, 16);
  const seeded = seedKnockout(sixteen.map((t) => t.id));
  const fixtures: Fixture[] = [];
  for (let i = 0; i < seeded.length; i += 2) {
    fixtures.push({
      id: `cup-${league}-R16-${i}`, competition: "cup", league,
      matchday: CUP_SCHEDULE[0].matchday, round: "R16",
      homeId: seeded[i], awayId: seeded[i + 1],
    });
  }
  return { fixtures, participants: sixteen.map((t) => t.id) };
}

/* ============================================================
 *  UEFA CHAMPIONS LEAGUE — group stage (8 groups of 4) + KO
 * ============================================================ */
export const UCL_GROUP_MDS = [3, 5, 7, 9, 11, 13]; // 6 group matchdays
export const UCL_KO_SCHEDULE = [
  { matchday: 18, round: "R16", size: 16 },
  { matchday: 22, round: "QF", size: 8 },
  { matchday: 28, round: "SF", size: 4 },
  { matchday: 34, round: "Final", size: 2 },
];

// Backward-compat alias (existing UI imports this name)
export const UCL_SCHEDULE = UCL_KO_SCHEDULE;

// Backward-compat wrapper used by store.ts
export function buildNextRound(
  comp: "cup" | "ucl",
  league: LeagueId | null,
  _fromRound: string,
  winners: string[],
  nextStep: { matchday: number; round: string },
  _roundIdx?: number,
): Fixture[] {
  return buildNextKORound(comp, league, winners, nextStep);
}

export type UCLGroup = {
  id: string; // "A", "B", ...
  teamIds: string[]; // 4
};

export type UCLStanding = {
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

export function initUCL(): { fixtures: Fixture[]; groups: UCLGroup[]; standings: Record<string, UCLStanding[]> } {
  const ovr = (id: string) => { const t = teamById(id); return t.att + t.mid + t.def; };
  const pickTop = (lg: LeagueId, n: number) =>
    teamsByLeague(lg).slice().sort((a, b) => ovr(b.id) - ovr(a.id)).slice(0, n).map((t) => t.id);

  // 32 teams: 7 from LaLiga & Premier, 6 from Serie A/Bundesliga/Ligue 1
  const pool = [
    ...pickTop("laliga", 7),
    ...pickTop("premier", 7),
    ...pickTop("seriea", 6),
    ...pickTop("bundesliga", 6),
    ...pickTop("ligue1", 6),
  ];

  // Pot-based seeding: pot 1 = top 8, pot 2 = next 8, etc.
  const sorted = pool.slice().sort((a, b) => ovr(b) - ovr(a));
  const pots = [sorted.slice(0, 8), sorted.slice(8, 16), sorted.slice(16, 24), sorted.slice(24, 32)];

  // 8 groups: pick 1 from each pot in round-robin order
  const groups: UCLGroup[] = [];
  const groupIds = ["A", "B", "C", "D", "E", "F", "G", "H"];
  for (let g = 0; g < 8; g++) {
    groups.push({ id: groupIds[g], teamIds: [pots[0][g], pots[1][g], pots[2][g], pots[3][g]] });
  }

  // Generate group fixtures: each pair plays home/away = 6 matches per team = 12 fixtures per group
  const fixtures: Fixture[] = [];
  for (const g of groups) {
    const [a, b, c, d] = g.teamIds;
    const pairs: [string, string, number][] = [
      // MD 1: a-b, c-d
      [a, b, 0], [c, d, 0],
      // MD 2: a-c, d-b
      [a, c, 1], [d, b, 1],
      // MD 3: b-c, a-d
      [b, c, 2], [a, d, 2],
      // Reverse (MD 4..6)
      [b, a, 3], [d, c, 3],
      [c, a, 4], [b, d, 4],
      [c, b, 5], [d, a, 5],
    ];
    for (const [home, away, mdIdx] of pairs) {
      fixtures.push({
        id: `ucl-G${g.id}-${UCL_GROUP_MDS[mdIdx]}-${home}-${away}`,
        competition: "ucl", league: teamById(home).league,
        matchday: UCL_GROUP_MDS[mdIdx],
        round: `Grupo ${g.id}`,
        homeId: home, awayId: away,
      });
    }
  }

  const standings: Record<string, UCLStanding[]> = {};
  for (const g of groups) {
    standings[g.id] = g.teamIds.map((id) => ({
      teamId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
    }));
  }

  return { fixtures, groups, standings };
}

export function applyUCLResult(standings: UCLStanding[], f: Fixture): UCLStanding[] {
  if (!f.result) return standings;
  const { homeGoals, awayGoals } = f.result;
  return standings.map((s) => {
    if (s.teamId === f.homeId) {
      const w = homeGoals > awayGoals ? 1 : 0;
      const d = homeGoals === awayGoals ? 1 : 0;
      const l = homeGoals < awayGoals ? 1 : 0;
      return {
        ...s, played: s.played + 1, won: s.won + w, drawn: s.drawn + d, lost: s.lost + l,
        gf: s.gf + homeGoals, ga: s.ga + awayGoals, gd: s.gd + (homeGoals - awayGoals),
        points: s.points + w * 3 + d,
      };
    }
    if (s.teamId === f.awayId) {
      const w = awayGoals > homeGoals ? 1 : 0;
      const d = homeGoals === awayGoals ? 1 : 0;
      const l = awayGoals < homeGoals ? 1 : 0;
      return {
        ...s, played: s.played + 1, won: s.won + w, drawn: s.drawn + d, lost: s.lost + l,
        gf: s.gf + awayGoals, ga: s.ga + homeGoals, gd: s.gd + (awayGoals - homeGoals),
        points: s.points + w * 3 + d,
      };
    }
    return s;
  });
}

export function sortUCLStandings(s: UCLStanding[]): UCLStanding[] {
  return s.slice().sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
}

/** After group stage: take top 2 from each group, build R16 bracket. */
export function buildUCLKnockout(groups: UCLGroup[], standings: Record<string, UCLStanding[]>): Fixture[] {
  // Get qualifiers
  const winners: Record<string, string> = {};
  const runners: Record<string, string> = {};
  for (const g of groups) {
    const sorted = sortUCLStandings(standings[g.id]);
    winners[g.id] = sorted[0].teamId;
    runners[g.id] = sorted[1].teamId;
  }
  // Bracket: A1 vs B2, B1 vs A2, C1 vs D2, D1 vs C2, E1 vs F2, F1 vs E2, G1 vs H2, H1 vs G2
  const pairs: [string, string][] = [
    [winners.A, runners.B], [winners.B, runners.A],
    [winners.C, runners.D], [winners.D, runners.C],
    [winners.E, runners.F], [winners.F, runners.E],
    [winners.G, runners.H], [winners.H, runners.G],
  ];
  return pairs.map(([home, away], i) => ({
    id: `ucl-R16-${i}`, competition: "ucl" as const,
    league: teamById(home).league,
    matchday: UCL_KO_SCHEDULE[0].matchday, round: "R16",
    homeId: home, awayId: away,
  }));
}

function seedKnockout(ids: string[]): string[] {
  const n = ids.length;
  const out: string[] = [];
  for (let i = 0; i < n / 2; i++) { out.push(ids[i]); out.push(ids[n - 1 - i]); }
  return out;
}

export function buildNextKORound(
  comp: "cup" | "ucl",
  league: LeagueId | null,
  winners: string[],
  scheduleStep: { matchday: number; round: string },
): Fixture[] {
  const fixtures: Fixture[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    const id = comp === "cup"
      ? `cup-${league}-${scheduleStep.round}-${i}`
      : `ucl-${scheduleStep.round}-${i}`;
    fixtures.push({
      id, competition: comp,
      league: comp === "cup" ? (league as LeagueId) : teamById(winners[i]).league,
      matchday: scheduleStep.matchday, round: scheduleStep.round,
      homeId: winners[i], awayId: winners[i + 1],
    });
  }
  return fixtures;
}

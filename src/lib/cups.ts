// @ts-nocheck
import {
  LeagueId,
  TEAMS,
  teamById,
  teamsByLeague,
  LEAGUES,
  LEAGUES_BY_COUNTRY,
  getAllTeams,
  type Team,
} from "@/data/teams";
import { Fixture } from "@/lib/season";
import {
  findSafeNationalCupDateOnOrBefore,
  NATIONAL_CUP_START,
} from "@/lib/calendarRules";

/* ============================================================
 *  NATIONAL CUP  (per country, dynamic size based on total teams)
 *  Modeled after Spanish Copa del Rey with realistic scheduling
 *  First draw is 2 days after first league match (Aug 18)
 * ============================================================ */

// Legacy static schedule — kept for backward compatibility only.
// New scheduling uses getCupStructureForCountry() which anchors to league matchdays.
// Offsets from CUP_START (2025-07-07). Draw = Monday between two league matchdays, Match = Wednesday (+2).
export const CUP_SCHEDULE: {
  matchday: number;
  round: string;
  size: number;
  drawMatchday: number;
}[] = [
  { drawMatchday: 96, matchday: 98, round: "R32", size: 64 }, // Draw Mon between J9-J10,  Match Wed
  { drawMatchday: 145, matchday: 147, round: "R16", size: 32 }, // Draw Mon between J16-J17, Match Wed
  { drawMatchday: 173, matchday: 175, round: "Octavos", size: 16 }, // Draw Mon between J20-J21, Match Wed
  { drawMatchday: 208, matchday: 210, round: "QF", size: 8 }, // Draw Mon between J25-J26, Match Wed
  { drawMatchday: 236, matchday: 238, round: "SF", size: 4 }, // Draw Mon between J29-J30, Match Wed
  { drawMatchday: 264, matchday: 266, round: "Final", size: 2 }, // Draw Mon between J33-J34, Match Wed
];

/**
 * Power of 2 Bracket Algorithm
 * Calculates preliminary round and bye distribution to ensure main bracket is a perfect power of 2
 *
 * RULES:
 * 1. Worst teams (lower divisions) play preliminary round
 * 2. Best teams (higher divisions) receive bye (skip prelim)
 * 3. All subsequent draws are 100% random (no pots, no seeding)
 *
 * @param teams - Array of teams to calculate bracket for
 * @returns Object with preliminary teams, bye teams, target bracket size, and round name
 */
export function calculateCupBracket(teams: Team[]): {
  preliminaryTeams: Team[];
  byeTeams: Team[];
  targetBracketSize: number;
  preliminaryCount: number;
  byeCount: number;
  firstRoundName: string;
} {
  const N = teams.length;

  // Find the highest power of 2 that is <= N (Target Bracket Size T)
  // T = 2^floor(log2(N))
  const T = Math.pow(2, Math.floor(Math.log2(N)));

  // If N = T, no preliminary round needed
  if (N === T) {
    return {
      preliminaryTeams: [],
      byeTeams: teams,
      targetBracketSize: T,
      preliminaryCount: 0,
      byeCount: N,
      firstRoundName: getRoundNameForSize(T),
    };
  }

  // Calculate teams to eliminate to reach T
  const E = N - T;

  // Calculate teams in preliminary round (always even)
  const P = E * 2;

  // Calculate teams with bye
  const B = N - P;

  // Sort teams by division/reputation (best teams first - higher tier = lower tier number)
  const sortedTeams = [...teams].sort((a, b) => {
    // Sort by league tier (lower tier number = better division)
    const aLeague = LEAGUES[a.league as LeagueId];
    const bLeague = LEAGUES[b.league as LeagueId];
    const aTier = aLeague?.tier ?? 999;
    const bTier = bLeague?.tier ?? 999;

    if (aTier !== bTier) {
      return aTier - bTier; // Lower tier number = better (comes first)
    }

    // If same tier, sort by overall rating (higher = better)
    const aOvr = a.att + a.mid + a.def;
    const bOvr = b.att + b.mid + b.def;
    return bOvr - aOvr;
  });

  // Top B teams (best teams) receive bye (skip prelim)
  const byeTeams = sortedTeams.slice(0, B);

  // Bottom P teams (worst teams) go to preliminary round
  const preliminaryTeams = sortedTeams.slice(B);

  return {
    preliminaryTeams,
    byeTeams,
    targetBracketSize: T,
    preliminaryCount: P,
    byeCount: B,
    firstRoundName: getRoundNameForSize(T),
  };
}

/**
 * Get round name based on bracket size
 * 64 = "32avos de Final" (R32)
 * 32 = "16avos de Final" (R16)
 * 16 = "Octavos de Final"
 * 8 = "Cuartos de Final" (QF)
 * 4 = "Semifinales" (SF)
 * 2 = "Final"
 */
function getRoundNameForSize(size: number): string {
  switch (size) {
    case 64:
      return "R32"; // 32avos de Final
    case 32:
      return "R16"; // 16avos de Final
    case 16:
      return "Octavos"; // Octavos de Final
    case 8:
      return "QF"; // Cuartos de Final
    case 4:
      return "SF"; // Semifinales
    case 2:
      return "Final";
    default:
      return "Unknown";
  }
}

// Calculate total teams in a country (sum of all teams from all leagues)
export function getTotalTeamsInCountry(country: string): number {
  const countryLeagues = Object.values(LEAGUES).filter((lg) => lg.country === country);
  let total = 0;
  for (const league of countryLeagues) {
    total += teamsByLeague(league.id as LeagueId).length;
  }
  return total;
}

// Generate dynamic cup structure based on total teams in country
// Main cup rounds, from the largest common bracket to the final.
// This table is intentionally kept independent from dates: dates are assigned
// by the global synchronized calendar below.
const ROUND_CALENDAR = [
  { name: "R32", size: 64 },
  { name: "R16", size: 32 },
  { name: "Octavos", size: 16 },
  { name: "QF", size: 8 },
  { name: "SF", size: 4 },
  { name: "Final", size: 2 },
] as const;

// Cup finals land together late in the season, on the first safe Tue/Wed/Thu
// on or before this target date. Round slots are at least 42 days apart: the
// draw is 14 days before the match and there is a 28-day buffer before the
// next planned draw, so background simulation has room to be spread safely.
const GLOBAL_CUP_FINAL_TARGET_MATCHDAY = 318; // 2026-05-21 relative to 2025-07-07
const GLOBAL_CUP_ROUND_GAP = 42;
const GLOBAL_CUP_DRAW_GAP = 14;

type CupScheduleStep = {
  matchday: number;
  round: string;
  size: number;
  drawMatchday: number;
  globalSlot: number;
};

const GLOBAL_CUP_SCHEDULE_CACHE = new Map<string, CupScheduleStep[]>();
let GLOBAL_CUP_ROUND_COUNT_CACHE: number | null = null;

function getMainBracketSizeForCountry(country: string): number {
  const totalTeams = getTotalTeamsInCountry(country);

  if (totalTeams >= 64) return 64;
  if (totalTeams >= 32) return 32;
  if (totalTeams >= 16) return 16;
  if (totalTeams >= 8) return 8;
  if (totalTeams >= 4) return 4;
  return 2;
}

function getPreliminaryTeamsCountForCountry(country: string): number {
  const totalTeams = getTotalTeamsInCountry(country);
  const mainBracketSize = getMainBracketSizeForCountry(country);
  const teamsToEliminate = Math.max(0, totalTeams - mainBracketSize);
  return teamsToEliminate > 0 ? teamsToEliminate * 2 : 0;
}

function getLocalCupRoundDefinitions(country: string) {
  const mainBracketSize = getMainBracketSizeForCountry(country);
  const preliminaryTeams = getPreliminaryTeamsCountForCountry(country);
  const rounds: { name: string; size: number }[] = [];

  if (preliminaryTeams > 0) rounds.push({ name: "Preliminar", size: preliminaryTeams });

  for (const entry of ROUND_CALENDAR) {
    if (entry.size === 0) continue;
    if (mainBracketSize >= entry.size) {
      rounds.push({ name: entry.name, size: entry.size });
    }
  }

  return { rounds, mainBracketSize, preliminaryTeams };
}

function getAllCupCountries(): string[] {
  return Object.keys(LEAGUES_BY_COUNTRY).filter((country) => {
    const primaryLeague = LEAGUES_BY_COUNTRY[country]?.[0]?.id;
    return !!primaryLeague && getTotalTeamsInCountry(country) >= 2;
  });
}

function getGlobalCupRoundCount(): number {
  if (GLOBAL_CUP_ROUND_COUNT_CACHE !== null) return GLOBAL_CUP_ROUND_COUNT_CACHE;

  let maxRounds = 0;
  for (const country of getAllCupCountries()) {
    maxRounds = Math.max(maxRounds, getLocalCupRoundDefinitions(country).rounds.length);
  }

  GLOBAL_CUP_ROUND_COUNT_CACHE = Math.max(1, maxRounds);
  return GLOBAL_CUP_ROUND_COUNT_CACHE;
}

/**
 * Global national-cup calendar.
 *
 * Every country is aligned by the END of its competition, not by the first
 * round. A country with fewer rounds therefore enters the common calendar
 * later, so all national-cup finals land on the same day.
 *
 * Each round gets a synchronized slot with at least 42 days between match
 * dates:
 *   - draw: 14 days before the round match
 *   - background-simulation window: up to 28 days before the next draw
 * The next draw is still gated by the completion of every country in the
 * previous global round.
 */
export function getGlobalCupScheduleForCountry(country: string): CupScheduleStep[] {
  const cached = GLOBAL_CUP_SCHEDULE_CACHE.get(country);
  if (cached) return cached;

  const local = getLocalCupRoundDefinitions(country);
  const maxRounds = getGlobalCupRoundCount();
  const startSlot = Math.max(0, maxRounds - local.rounds.length);

  const globalMatchdays = new Array<number>(maxRounds);
  // Search backwards from the late-season final target until each slot lands on
  // a safe Tue/Wed/Thu in a non-European week. The target offset is fixed, while
  // the actual weekday is chosen by calendarRules.
  const targetFinalIso = new Date(
    `${NATIONAL_CUP_START}T00:00:00Z`,
  );
  targetFinalIso.setUTCDate(targetFinalIso.getUTCDate() + GLOBAL_CUP_FINAL_TARGET_MATCHDAY);
  let currentIso = findSafeNationalCupDateOnOrBefore(targetFinalIso.toISOString().slice(0, 10));
  globalMatchdays[maxRounds - 1] = Math.round(
    (new Date(`${currentIso}T00:00:00Z`).getTime() -
      new Date(`${NATIONAL_CUP_START}T00:00:00Z`).getTime()) /
      86400000,
  );

  for (let slot = maxRounds - 2; slot >= 0; slot--) {
    let candidate = new Date(`${currentIso}T00:00:00Z`);
    candidate.setUTCDate(candidate.getUTCDate() - GLOBAL_CUP_ROUND_GAP);
    let candidateIso = candidate.toISOString().slice(0, 10);
    candidateIso = findSafeNationalCupDateOnOrBefore(candidateIso);
    globalMatchdays[slot] = Math.round(
      (new Date(`${candidateIso}T00:00:00Z`).getTime() -
        new Date(`${NATIONAL_CUP_START}T00:00:00Z`).getTime()) /
        86400000,
    );
    currentIso = candidateIso;
  }

  const schedule = local.rounds.map((round, localIndex) => {
    const globalSlot = startSlot + localIndex;
    const matchday = globalMatchdays[globalSlot];
    const drawMatchday = matchday - GLOBAL_CUP_DRAW_GAP;

    return {
      matchday,
      round: round.name,
      size: round.size,
      drawMatchday,
      globalSlot,
    };
  });

  GLOBAL_CUP_SCHEDULE_CACHE.set(country, schedule);
  return schedule;
}

export function getGlobalCupRoundCountForTesting(): number {
  return getGlobalCupRoundCount();
}

// Generate dynamic cup schedule based on the total number of teams in a country.
// The round count is still country-specific, but its dates are aligned to the
// shared global calendar so every country's final is played on the same day.
export function getCupStructureForCountry(country: string): {
  schedule: CupScheduleStep[];
  preliminaryTeams: number;
  mainBracketSize: number;
} {
  const local = getLocalCupRoundDefinitions(country);
  const schedule = getGlobalCupScheduleForCountry(country);

  return {
    schedule,
    preliminaryTeams: local.preliminaryTeams,
    mainBracketSize: local.mainBracketSize,
  };
}

// Generate dynamic cup schedule based on actual bracket size (legacy function)
export function getCupScheduleForSize(
  teamCount: number,
): { matchday: number; round: string; size: number; drawMatchday: number }[] {
  const rounds: { matchday: number; round: string; size: number; drawMatchday: number }[] = [];
  if (teamCount >= 32) rounds.push({ matchday: 2, round: "R32", size: 32, drawMatchday: 1 });
  if (teamCount >= 16) rounds.push({ matchday: 6, round: "R16", size: 16, drawMatchday: 5 });
  if (teamCount >= 8) rounds.push({ matchday: 10, round: "QF", size: 8, drawMatchday: 9 });
  if (teamCount >= 4) rounds.push({ matchday: 15, round: "SF", size: 4, drawMatchday: 14 });
  rounds.push({ matchday: 20, round: "Final", size: 2, drawMatchday: 19 });
  return rounds;
}

export function initCup(country: string): {
  fixtures: Fixture[];
  participants: string[];
  preliminaryParticipants: string[];
  structure: ReturnType<typeof getCupStructureForCountry>;
} {
  // Get all teams for this country
  const allTeams = getAllTeams().filter((t) => {
    const league = LEAGUES[t.league as LeagueId];
    return league?.country === country;
  });

  // Use the power of 2 bracket algorithm
  // This automatically selects worst teams for prelim and best teams for bye
  const bracket = calculateCupBracket(allTeams);

  // Get cup structure for this country
  const structure = getCupStructureForCountry(country);

  // Extract team IDs from bracket calculation
  const preliminaryParticipants = bracket.preliminaryTeams.map((t) => t.id);
  const mainBracketParticipants = bracket.byeTeams.map((t) => t.id);

  return {
    fixtures: [],
    participants: mainBracketParticipants,
    preliminaryParticipants,
    structure,
  };
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

export function initUCL(): {
  fixtures: Fixture[];
  groups: UCLGroup[];
  standings: Record<string, UCLStanding[]>;
} {
  const ovr = (id: string) => {
    const t = teamById(id);
    return t.att + t.mid + t.def;
  };

  // Dynamic UCL pool: get top 4 teams from each European league, then take top 32 overall
  const europeanLeagues = Object.keys(LEAGUES).filter((lg) => {
    const country = LEAGUES[lg]?.country || "";
    return [
      "España",
      "Inglaterra",
      "Italia",
      "Alemania",
      "Francia",
      "Portugal",
      "Países Bajos",
      "Turquía",
      "Bélgica",
      "Polonia",
      "Suiza",
      "Dinamarca",
      "Suecia",
      "Noruega",
      "Austria",
      "Escocia",
      "Rumanía",
    ].includes(country);
  }) as LeagueId[];

  let pool: string[] = [];
  for (const lg of europeanLeagues) {
    const top = teamsByLeague(lg)
      .slice()
      .sort((a, b) => ovr(b.id) - ovr(a.id))
      .slice(0, 4)
      .map((t) => t.id);
    pool.push(...top);
  }

  // If not enough teams from European leagues, fill with best overall teams
  if (pool.length < 32) {
    const allTeams = getAllTeams().sort((a, b) => ovr(b.id) - ovr(a.id));
    const existing = new Set(pool);
    for (const t of allTeams) {
      if (pool.length >= 32) break;
      if (!existing.has(t.id)) pool.push(t.id);
    }
  }

  // Trim to 32 and deduplicate
  pool = pool.slice(0, 32);

  // Pot-based seeding: pot 1 = top 8, pot 2 = next 8, etc.
  const sorted = pool.slice().sort((a, b) => ovr(b) - ovr(a));
  const pots = [
    sorted.slice(0, 8),
    sorted.slice(8, 16),
    sorted.slice(16, 24),
    sorted.slice(24, 32),
  ];

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
      [a, b, 0],
      [c, d, 0],
      // MD 2: a-c, d-b
      [a, c, 1],
      [d, b, 1],
      // MD 3: b-c, a-d
      [b, c, 2],
      [a, d, 2],
      // Reverse (MD 4..6)
      [b, a, 3],
      [d, c, 3],
      [c, a, 4],
      [b, d, 4],
      [c, b, 5],
      [d, a, 5],
    ];
    for (const [home, away, mdIdx] of pairs) {
      fixtures.push({
        id: `ucl-G${g.id}-${UCL_GROUP_MDS[mdIdx]}-${home}-${away}`,
        competition: "ucl",
        league: teamById(home).league,
        matchday: UCL_GROUP_MDS[mdIdx],
        round: `Grupo ${g.id}`,
        homeId: home,
        awayId: away,
      });
    }
  }

  const standings: Record<string, UCLStanding[]> = {};
  for (const g of groups) {
    standings[g.id] = g.teamIds.map((id) => ({
      teamId: id,
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
        ...s,
        played: s.played + 1,
        won: s.won + w,
        drawn: s.drawn + d,
        lost: s.lost + l,
        gf: s.gf + homeGoals,
        ga: s.ga + awayGoals,
        gd: s.gd + (homeGoals - awayGoals),
        points: s.points + w * 3 + d,
      };
    }
    if (s.teamId === f.awayId) {
      const w = awayGoals > homeGoals ? 1 : 0;
      const d = homeGoals === awayGoals ? 1 : 0;
      const l = awayGoals < homeGoals ? 1 : 0;
      return {
        ...s,
        played: s.played + 1,
        won: s.won + w,
        drawn: s.drawn + d,
        lost: s.lost + l,
        gf: s.gf + awayGoals,
        ga: s.ga + homeGoals,
        gd: s.gd + (awayGoals - homeGoals),
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
export function buildUCLKnockout(
  groups: UCLGroup[],
  standings: Record<string, UCLStanding[]>,
): Fixture[] {
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
    [winners.A, runners.B],
    [winners.B, runners.A],
    [winners.C, runners.D],
    [winners.D, runners.C],
    [winners.E, runners.F],
    [winners.F, runners.E],
    [winners.G, runners.H],
    [winners.H, runners.G],
  ];
  return pairs.map(([home, away], i) => ({
    id: `ucl-R16-${i}`,
    competition: "ucl" as const,
    league: teamById(home).league,
    matchday: UCL_KO_SCHEDULE[0].matchday,
    round: "R16",
    homeId: home,
    awayId: away,
  }));
}

function seedKnockout(ids: string[]): string[] {
  const n = ids.length;
  const out: string[] = [];
  // Safe pairing: high seeds vs low seeds
  for (let i = 0; i < Math.floor(n / 2); i++) {
    out.push(ids[i]);
    out.push(ids[n - 1 - i]);
  }
  return out;
}

export function buildNextKORound(
  comp: "cup" | "ucl",
  league: LeagueId | null,
  winners: string[],
  scheduleStep: { matchday: number; round: string },
): Fixture[] {
  // Fisher-Yates shuffle for 100% random draw (no pots, no seeding)
  const shuffled = [...winners];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const fixtures: Fixture[] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const id =
      comp === "cup"
        ? `cup-${league}-${scheduleStep.round}-${i}`
        : `ucl-${scheduleStep.round}-${i}`;
    fixtures.push({
      id,
      competition: comp,
      league: comp === "cup" ? (league as LeagueId) : teamById(shuffled[i]).league,
      matchday: scheduleStep.matchday,
      round: scheduleStep.round,
      homeId: shuffled[i],
      awayId: shuffled[i + 1],
    });
  }
  return fixtures;
}

import { teamById } from "@/data/teams";
import { assignUCLPots } from "@/data/ucl";
import { Fixture } from "@/lib/season";
import { UCL_CALENDAR, UCL_START, UCLBracketSlot, UCLPhase } from "@/data/ucl";

// ============================================================
//  SWISS DRAW — SIMPLE VERSION (no country restrictions)
//  Each team plays 2 opponents per pot: 1 home, 1 away.
//  Algorithm: for each pot, shuffle teams into pairs of 9 pairs
//  (18 teams × 2 opponents = 18 pairs, each pair assigned H/A).
// ============================================================

type Opponent = { teamId: string; isHome: boolean };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a derangement (permutation with no fixed points) of arr using
 * a guaranteed rotation by a random offset in [1, n-1].
 */
function derange(arr: string[]): string[] {
  const n = arr.length;
  const offset = 1 + Math.floor(Math.random() * (n - 1));
  return arr.map((_, i) => arr[(i + offset) % n]);
}

/**
 * Within a pot of n teams, produce n pairs so each team appears exactly once as home
 * and once as away (2 unique rivals per team, no self-match, no duplicate pairs).
 * Uses one derangement: base[i] (home) vs deranged[i] (away).
 * Returns exactly n pairs.
 */
function pairPot(pot: string[]): { homeId: string; awayId: string }[] {
  const n = pot.length;
  // Try up to 100 shuffles to find a valid derangement with no self-match
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = shuffle(pot);
    const der = derange(base);
    // Verify no self-match (derange guarantees this but double-check after shuffle)
    if (base.some((t, i) => t === der[i])) continue;
    return base.map((homeId, i) => ({ homeId, awayId: der[i] }));
  }
  // Fallback: guaranteed offset-1 derangement
  const base = shuffle(pot);
  return base.map((homeId, i) => ({ homeId, awayId: base[(i + 1) % n] }));
}

/**
 * UCL Swiss draw: each team plays 2 opponents from each of the 4 pots = 8 total.
 * - Cross-pot: 6 combos × 18 pairs (2-regular bipartite) = 108 pairs
 * - Within-pot: 4 pots × 9 pairs (2-regular) = 36 pairs
 * - Total: 144 pairs, every team has exactly 8 distinct opponents (2 from each pot).
 */
export function runSwissDraw(participants: string[]): { assignments: Map<string, Opponent[]>, matrix: boolean[][], teamIndex: Map<string, number> } {
  const pots = assignUCLPots(participants);
  const assignments = new Map<string, Opponent[]>();
  for (const t of participants) assignments.set(t, []);

  // 36x36 matrix for visualization
  const teamIndex = new Map<string, number>();
  participants.forEach((t, i) => teamIndex.set(t, i));
  const matrix: boolean[][] = Array.from({ length: 36 }, () => Array(36).fill(false));

  function bipartite2Regular(groupA: string[], groupB: string[]): { homeId: string; awayId: string }[] {
    const n = groupA.length;
    const pairs: { homeId: string; awayId: string }[] = [];
    const aShuf = shuffle(groupA);
    const bShuf = shuffle(groupB);
    for (let i = 0; i < n; i++) {
      pairs.push({ homeId: aShuf[i], awayId: bShuf[i] });
    }
    const bDer = derange(bShuf);
    for (let i = 0; i < n; i++) {
      if (bDer[i] === bShuf[i]) {
        const j = (i + 1) % n;
        [bDer[i], bDer[j]] = [bDer[j], bDer[i]];
      }
      pairs.push({ homeId: bDer[i], awayId: aShuf[i] });
    }
    return pairs;
  }

  // Cross-pot pairings
  for (let pi = 0; pi < 4; pi++) {
    for (let pj = pi + 1; pj < 4; pj++) {
      const pairs = bipartite2Regular(pots[pi], pots[pj]);
      for (const { homeId, awayId } of pairs) {
        assignments.get(homeId)!.push({ teamId: awayId, isHome: true });
        assignments.get(awayId)!.push({ teamId: homeId, isHome: false });
        const ia = teamIndex.get(homeId)!;
        const ib = teamIndex.get(awayId)!;
        matrix[ia][ib] = true;
        matrix[ib][ia] = true;
      }
    }
  }

  // Within-pot pairings
  for (const pot of pots) {
    const pairs = pairPot(pot);
    for (const { homeId, awayId } of pairs) {
      assignments.get(homeId)!.push({ teamId: awayId, isHome: true });
      assignments.get(awayId)!.push({ teamId: homeId, isHome: false });
      const ia = teamIndex.get(homeId)!;
      const ib = teamIndex.get(awayId)!;
      matrix[ia][ib] = true;
      matrix[ib][ia] = true;
    }
  }

  return { assignments, matrix, teamIndex };
}

// ============================================================
//  CONVERT ASSIGNMENTS → FIXTURES (8 matchdays)
// ============================================================
export function assignmentsToFixtures(
  assignments: Map<string, Opponent[]>,
  participants: string[],
  startDayOffset: number, // UCL_CALENDAR.leagueDay[0] — day offset from UCL_START for matchday 1
): Fixture[] {
  // Assign rounds using each team's shuffled opponent index.
  // Each team has exactly 8 opponents → shuffle their list → opponent at index i plays in round i.
  // For each pair (A, B where A is home), use A's index of B as the round.
  // Conflicts (B already has a different round for A) are resolved by swapping indices within A's list.

  // Step 1: Give each team a random permutation of rounds for their 8 opponents
  const teamOpponentOrder = new Map<string, string[]>();
  for (const [team, opps] of assignments) {
    teamOpponentOrder.set(team, shuffle(opps.map(o => o.teamId)));
  }

  // Step 2: For each pair, the round = index of opponent in home team's list.
  // Ensure consistency: if A plays B in round r, then B must also play A in round r.
  // We do one pass: for each home pair (A→B), look up A's round for B.
  // Then check B's list: if B has A at a different slot s, swap B[s] with B[r].
  const pairs: { homeId: string; awayId: string }[] = [];
  const seen = new Set<string>();
  for (const [team, opps] of assignments) {
    for (const opp of opps) {
      if (opp.isHome) {
        const key = `${team}__${opp.teamId}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push({ homeId: team, awayId: opp.teamId });
        }
      }
    }
  }

  // Reconcile: for each pair (home, away), force away's slot for home to match home's slot for away
  for (const { homeId, awayId } of pairs) {
    const homeList = teamOpponentOrder.get(homeId)!;
    const awayList = teamOpponentOrder.get(awayId)!;
    const round = homeList.indexOf(awayId); // round assigned by home
    const awaySlot = awayList.indexOf(homeId);
    if (awaySlot !== round) {
      // swap awayList[round] with awayList[awaySlot]
      const tmp = awayList[round];
      awayList[round] = awayList[awaySlot];
      awayList[awaySlot] = tmp;
    }
  }

  // Step 3: Emit fixtures — round = home team's index of away team
  const fixtures: Fixture[] = [];
  for (const { homeId, awayId } of pairs) {
    const round = teamOpponentOrder.get(homeId)!.indexOf(awayId);
    const dayOffset = startDayOffset + round;
    fixtures.push({
      id: `ucl-sw-md${round + 1}-${homeId}-${awayId}`,
      competition: "ucl",
      league: teamById(homeId).league,
      matchday: dayOffset,
      round: `Jornada ${round + 1}`,
      homeId,
      awayId,
    });
  }

  return fixtures;
}

// ============================================================
//  PLAYOFF DRAW (9th–24th vs conditional seeding)
//  9/10 vs 23/24 | 11/12 vs 21/22 | 13/14 vs 19/20 | 15/16 vs 17/18
//  Seeds (9–16) play leg 2 at home
// ============================================================
export function drawUCLPlayoffs(
  rankedTeams: string[], // positions 0=1st…35=36th, only indices 8..23 used
): { homeId: string; awayId: string }[] {
  // slots 8-23 = 9th to 24th
  const seeds = rankedTeams.slice(8, 16);   // 9–16 (home in leg 2)
  const unseeded = rankedTeams.slice(16, 24); // 17–24

  // Pairing: seed i (0-indexed) vs unseeded[7-i] (mirror)
  const pairs: { homeId: string; awayId: string }[] = [];

  // Within each band, randomize which specific team faces which
  const band0s = shuffle(seeds.slice(0, 2));   // 9,10
  const band0u = shuffle(unseeded.slice(6, 8)); // 23,24
  const band1s = shuffle(seeds.slice(2, 4));   // 11,12
  const band1u = shuffle(unseeded.slice(4, 6)); // 21,22
  const band2s = shuffle(seeds.slice(4, 6));   // 13,14
  const band2u = shuffle(unseeded.slice(2, 4)); // 19,20
  const band3s = shuffle(seeds.slice(6, 8));   // 15,16
  const band3u = shuffle(unseeded.slice(0, 2)); // 17,18

  const bands = [[band0s, band0u], [band1s, band1u], [band2s, band2u], [band3s, band3u]];
  for (const [s, u] of bands) {
    pairs.push({ homeId: u[0], awayId: s[0] }); // leg 1: unseeded home
    pairs.push({ homeId: u[1], awayId: s[1] });
  }

  return pairs;
}

export function playoffPairsToFixtures(
  pairs: { homeId: string; awayId: string }[],
  leg1DayOffset: number,
  leg2DayOffset: number,
): Fixture[] {
  const fixtures: Fixture[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const { homeId, awayId } = pairs[i];
    fixtures.push({
      id: `ucl-po-leg1-${i}`,
      competition: "ucl",
      league: teamById(homeId).league,
      matchday: leg1DayOffset,
      round: "Playoff-Leg1",
      homeId,
      awayId,
    });
    // Leg 2: seed (away in leg 1) plays at home
    fixtures.push({
      id: `ucl-po-leg2-${i}`,
      competition: "ucl",
      league: teamById(awayId).league,
      matchday: leg2DayOffset,
      round: "Playoff-Leg2",
      homeId: awayId,
      awayId: homeId,
    });
  }
  return fixtures;
}

// ============================================================
//  KNOCKOUT BRACKET (R16 fixed seeding)
//  Top8 vs playoff winners, fixed bracket style
//  1st/2nd on opposite halves
// ============================================================
export function buildUCLBracket(
  top8: string[],         // [1st, 2nd, ..., 8th]
  playoffWinners: string[], // 8 winners from playoffs, in seed order (best seed first)
  dayOffsets: {
    r16Leg1: number; r16Leg2: number;
    qfLeg1: number;  qfLeg2: number;
    sfLeg1: number;  sfLeg2: number;
    final: number;
  },
): { fixtures: Fixture[]; bracket: UCLBracketSlot[] } {
  // Matchups: top8[i] vs playoffWinners[7-i] (best vs worst playoff winner)
  // Bracket halves: 0-3 = top half, 4-7 = bottom half
  // 1st (index 0) and 2nd (index 1) are on opposite halves
  const r16Pairs: { seed: string; winner: string }[] = [];
  for (let i = 0; i < 8; i++) {
    r16Pairs.push({ seed: top8[i], winner: playoffWinners[7 - i] });
  }

  const fixtures: Fixture[] = [];
  const bracket: UCLBracketSlot[] = [];

  // R16 (8 ties)
  for (let i = 0; i < 8; i++) {
    const { seed, winner } = r16Pairs[i];
    fixtures.push({
      id: `ucl-r16-${i}-leg1`,
      competition: "ucl",
      league: teamById(winner).league,
      matchday: dayOffsets.r16Leg1,
      round: "R16-Leg1",
      homeId: winner, // seed plays leg 2 at home
      awayId: seed,
    });
    fixtures.push({
      id: `ucl-r16-${i}-leg2`,
      competition: "ucl",
      league: teamById(seed).league,
      matchday: dayOffsets.r16Leg2,
      round: "R16-Leg2",
      homeId: seed,
      awayId: winner,
    });

    bracket.push({
      id: `R16-${i + 1}`,
      round: "r16",
      homeId: seed,
      awayId: winner,
      legOneMatchday: dayOffsets.r16Leg1,
      legTwoMatchday: dayOffsets.r16Leg2,
      isFinal: false,
    });
  }

  // QF, SF, Final slots (TBD — filled as rounds complete)
  for (let i = 0; i < 4; i++) {
    bracket.push({
      id: `QF-${i + 1}`,
      round: "qf",
      homeId: null,
      awayId: null,
      legOneMatchday: dayOffsets.qfLeg1,
      legTwoMatchday: dayOffsets.qfLeg2,
      isFinal: false,
    });
  }
  for (let i = 0; i < 2; i++) {
    bracket.push({
      id: `SF-${i + 1}`,
      round: "sf",
      homeId: null,
      awayId: null,
      legOneMatchday: dayOffsets.sfLeg1,
      legTwoMatchday: dayOffsets.sfLeg2,
      isFinal: false,
    });
  }
  bracket.push({
    id: "F",
    round: "final",
    homeId: null,
    awayId: null,
    legOneMatchday: dayOffsets.final,
    legTwoMatchday: dayOffsets.final,
    isFinal: true,
  });

  return { fixtures, bracket };
}

// ============================================================
//  AGGREGATE WINNER (for two-legged ties)
//  No away goals rule — aggregate tie → extra time + penalties
// ============================================================
export function getAggregateWinner(
  leg1: Fixture,
  leg2: Fixture,
): "leg2Home" | "leg2Away" | "extra" {
  if (!leg1.result || !leg2.result) return "extra";

  // leg2 homeId = team that was away in leg1
  const aggHome = (leg2.result.homeGoals ?? 0) + (leg1.result.awayGoals ?? 0);
  const aggAway = (leg2.result.awayGoals ?? 0) + (leg1.result.homeGoals ?? 0);

  if (aggHome > aggAway) return "leg2Home";
  if (aggAway > aggHome) return "leg2Away";
  return "extra"; // needs penalties/ET
}

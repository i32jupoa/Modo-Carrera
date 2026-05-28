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
  startDayOffset: number,
): Fixture[] {
  // Build 8 perfect matchings (1-factors) from the 8-regular graph
  // Each round must have exactly 18 matches (36 teams / 2)

  // Step 1: Extract all unique pairs
  const allPairs: { homeId: string; awayId: string }[] = [];
  const seen = new Set<string>();
  const teamOpponentCount = new Map<string, number>();
  
  for (const team of participants) {
    teamOpponentCount.set(team, 0);
  }
  
  for (const [team, opps] of assignments) {
    for (const opp of opps) {
      if (opp.isHome) {
        const key = `${team}__${opp.teamId}`;
        if (!seen.has(key)) {
          seen.add(key);
          allPairs.push({ homeId: team, awayId: opp.teamId });
          teamOpponentCount.set(team, (teamOpponentCount.get(team) || 0) + 1);
          teamOpponentCount.set(opp.teamId, (teamOpponentCount.get(opp.teamId) || 0) + 1);
        }
      }
    }
  }
  
  // Log opponent counts for debugging
  console.log(`[assignmentsToFixtures] Total pairs: ${allPairs.length}`);
  console.log(`[assignmentsToFixtures] Team opponent counts:`, 
    Array.from(teamOpponentCount.entries()).map(([t, c]) => ({ team: t, count: c })).filter(t => t.count !== 8)
  );

  // Step 2: Use DFS-based maximum matching for each round
  // This guarantees finding a perfect matching if one exists
  
  function findPerfectMatching(pairs: { homeId: string; awayId: string }[]): { homeId: string; awayId: string }[] | null {
    // Build adjacency list
    const adj = new Map<string, string[]>();
    for (const team of participants) adj.set(team, []);
    for (const p of pairs) {
      adj.get(p.homeId)!.push(p.awayId);
      adj.get(p.awayId)!.push(p.homeId);
    }
    
    // Shuffle adjacency lists for randomness
    for (const list of adj.values()) {
      shuffle(list);
    }
    
    const match = new Map<string, string | null>();
    for (const team of participants) match.set(team, null);
    
    function dfs(u: string, visited: Set<string>): boolean {
      for (const v of adj.get(u)!) {
        if (visited.has(v)) continue;
        visited.add(v);
        
        const currentMatch = match.get(v);
        if (currentMatch === null || dfs(currentMatch, visited)) {
          match.set(u, v);
          match.set(v, u);
          return true;
        }
      }
      return false;
    }
    
    let matchingSize = 0;
    for (const team of participants) {
      if (match.get(team) === null) {
        const visited = new Set<string>();
        if (dfs(team, visited)) {
          matchingSize++;
        }
      }
    }
    
    // Check if we have a perfect matching (18 edges = 36 matched vertices)
    if (matchingSize !== 18) return null;
    
    // Extract pairs from matching
    const result: { homeId: string; awayId: string }[] = [];
    const used = new Set<string>();
    for (const [u, v] of match.entries()) {
      if (v && !used.has(u) && !used.has(v)) {
        // Find the original pair
        const pair = pairs.find(p => 
          (p.homeId === u && p.awayId === v) || (p.homeId === v && p.awayId === u)
        );
        if (pair) {
          result.push(pair);
          used.add(u);
          used.add(v);
        }
      }
    }
    
    return result.length === 18 ? result : null;
  }
  
  const rounds: { homeId: string; awayId: string }[][] = [];
  let remainingPairs = [...allPairs];
  
  for (let round = 0; round < 8; round++) {
    let matching: { homeId: string; awayId: string }[] | null = null;
    
    // Try multiple shuffles to find a perfect matching
    for (let attempt = 0; attempt < 50; attempt++) {
      // Shuffle remaining pairs
      remainingPairs = shuffle([...remainingPairs]);
      matching = findPerfectMatching(remainingPairs);
      if (matching) break;
    }
    
    if (!matching) {
      console.warn(`[assignmentsToFixtures] Could not find perfect matching for round ${round}`);
      // Fallback to greedy
      matching = [];
      const usedTeams = new Set<string>();
      for (const p of remainingPairs) {
        if (!usedTeams.has(p.homeId) && !usedTeams.has(p.awayId)) {
          matching.push(p);
          usedTeams.add(p.homeId);
          usedTeams.add(p.awayId);
        }
      }
    }
    
    // Remove used pairs
    const usedKeys = new Set(matching.map(m => `${m.homeId}__${m.awayId}`));
    remainingPairs = remainingPairs.filter(p => !usedKeys.has(`${p.homeId}__${p.awayId}`));
    
    rounds.push(matching);
    console.log(`[assignmentsToFixtures] Round ${round}: ${matching.length} matches, ${remainingPairs.length} remaining`);
  }
  
  // Log distribution
  const roundCounts = rounds.map(r => r.length);
  console.log(`[assignmentsToFixtures] Round distribution:`, roundCounts);
  console.log(`[assignmentsToFixtures] Total assigned: ${roundCounts.reduce((a, b) => a + b, 0)} / ${allPairs.length}`);

  // Step 3: Emit fixtures
  const fixtures: Fixture[] = [];
  for (let round = 0; round < 8; round++) {
    const dayOffset = UCL_CALENDAR.leagueDay[round];
    for (const { homeId, awayId } of rounds[round]) {
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
  }

  // Log for debugging
  const rmaFixtures = fixtures.filter(f => f.homeId === "rma" || f.awayId === "rma");
  console.log(`[assignmentsToFixtures] rma fixtures:`, rmaFixtures.map(f => ({ round: f.round, homeId: f.homeId, awayId: f.awayId })));

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


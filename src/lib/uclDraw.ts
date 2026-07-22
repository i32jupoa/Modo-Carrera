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
        if (currentMatch === null || (currentMatch && dfs(currentMatch, visited))) {
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
  
  // Try to partition the 8-regular graph into 8 perfect matchings.
  // If any round fails to reach 18 matches, restart the partition with a fresh shuffle.
  let rounds: { homeId: string; awayId: string }[][] | null = null;
  for (let outer = 0; outer < 40 && !rounds; outer++) {
    const tryRounds: { homeId: string; awayId: string }[][] = [];
    let remainingPairs = shuffle([...allPairs]);
    let ok = true;
    for (let round = 0; round < 8; round++) {
      let matching: { homeId: string; awayId: string }[] | null = null;
      for (let attempt = 0; attempt < 80; attempt++) {
        remainingPairs = shuffle([...remainingPairs]);
        matching = findPerfectMatching(remainingPairs);
        if (matching && matching.length === 18) break;
        matching = null;
      }
      if (!matching) { ok = false; break; }
      const usedKeys = new Set(matching.map(m => `${m.homeId}__${m.awayId}`));
      remainingPairs = remainingPairs.filter(p => !usedKeys.has(`${p.homeId}__${p.awayId}`));
      tryRounds.push(matching);
    }
    if (ok && tryRounds.length === 8 && tryRounds.every(r => r.length === 18)) {
      rounds = tryRounds;
    }
  }
  if (!rounds) {
    throw new Error("[assignmentsToFixtures] Failed to partition into 8 perfect matchings");
  }

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



  // If there are penalties, determine winner from penalty shootout
  if (leg2.result.penalties) {
    const penHome = leg2.result.penalties.homeGoals;
    const penAway = leg2.result.penalties.awayGoals;
    if (penHome > penAway) return "leg2Home";
    if (penAway > penHome) return "leg2Away";
  }

  // If there's extra time but no penalties, use extra time aggregate
  if (leg2.result.extraTime) {
    const etHome = (leg2.result.homeGoals ?? 0) + (leg2.result.extraTime.homeGoals ?? 0) + (leg1.result.awayGoals ?? 0);
    const etAway = (leg2.result.awayGoals ?? 0) + (leg2.result.extraTime.awayGoals ?? 0) + (leg1.result.homeGoals ?? 0);
    if (etHome > etAway) return "leg2Home";
    if (etAway > etHome) return "leg2Away";
  }

  if (aggHome > aggAway) return "leg2Home";

  if (aggAway > aggHome) return "leg2Away";

  return "extra"; // needs penalties/ET

}



// ============================================================

//  CREATE KNOCKOUT FIXTURES FOR NEXT ROUND

//  Creates QF, SF, or Final fixtures based on winners from previous round

// ============================================================

export function createKnockoutFixtures(

  round: "qf" | "sf" | "final",

  winners: string[], // Ordered winners from previous round

  dayOffsets: {

    leg1: number;

    leg2: number;

  },

  existingFixtures: Fixture[],

): Fixture[] {

  const newFixtures: Fixture[] = [];



  if (round === "qf" && winners.length === 8) {

    // 4 QF ties: R16-1 winner vs R16-2 winner, R16-3 vs R16-4, etc.

    for (let i = 0; i < 4; i++) {

      const homeWinner = winners[i * 2];

      const awayWinner = winners[i * 2 + 1];



      newFixtures.push({

        id: `ucl-qf-${i}-leg1`,

        competition: "ucl",

        league: teamById(homeWinner).league,

        matchday: dayOffsets.leg1,

        round: "QF-Leg1",

        homeId: homeWinner,

        awayId: awayWinner,

      });



      newFixtures.push({

        id: `ucl-qf-${i}-leg2`,

        competition: "ucl",

        league: teamById(awayWinner).league,

        matchday: dayOffsets.leg2,

        round: "QF-Leg2",

        homeId: awayWinner,

        awayId: homeWinner,

      });

    }

  } else if (round === "sf" && winners.length === 4) {

    // 2 SF ties: QF-1 winner vs QF-2 winner, QF-3 vs QF-4

    for (let i = 0; i < 2; i++) {

      const homeWinner = winners[i * 2];

      const awayWinner = winners[i * 2 + 1];



      newFixtures.push({

        id: `ucl-sf-${i}-leg1`,

        competition: "ucl",

        league: teamById(homeWinner).league,

        matchday: dayOffsets.leg1,

        round: "SF-Leg1",

        homeId: homeWinner,

        awayId: awayWinner,

      });



      newFixtures.push({

        id: `ucl-sf-${i}-leg2`,

        competition: "ucl",

        league: teamById(awayWinner).league,

        matchday: dayOffsets.leg2,

        round: "SF-Leg2",

        homeId: awayWinner,

        awayId: homeWinner,

      });

    }

  } else if (round === "final" && winners.length === 2) {

    // Final is single leg

    newFixtures.push({

      id: `ucl-final`,

      competition: "ucl",

      league: teamById(winners[0]).league,

      matchday: dayOffsets.leg1,

      round: "Final",

      homeId: winners[0],

      awayId: winners[1],

    });

  }



  return newFixtures;

}



// ============================================================

//  ADVANCE UCL BRACKET

//  Determines winners from completed round and advances to next round

//  Returns updated fixtures array with next round fixtures added

// ============================================================

export function advanceUCLBracket(

  fixtures: Fixture[],

  bracket: UCLBracketSlot[],

  currentPhase: "r16" | "qf" | "sf",

  dayOffsets: {

    qfLeg1: number; qfLeg2: number;

    sfLeg1: number; sfLeg2: number;

    final: number;

  },

): { fixtures: Fixture[]; bracket: UCLBracketSlot[]; nextPhase: "r16" | "qf" | "sf" | "final" | "done" } {

  const updatedBracket = [...bracket];

  let updatedFixtures = [...fixtures];

  let winners: string[] = [];



  if (currentPhase === "r16") {

    // Determine R16 winners (8 ties)

    for (let i = 0; i < 8; i++) {

      const leg1 = fixtures.find(f => f.id === `ucl-r16-${i}-leg1`);

      const leg2 = fixtures.find(f => f.id === `ucl-r16-${i}-leg2`);

      if (!leg1?.result || !leg2?.result) {

        return { fixtures, bracket, nextPhase: "r16" }; // Not all matches complete

      }



      const winner = getAggregateWinner(leg1, leg2);

      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;

      winners.push(winnerId!);

      // DO NOT update bracket slot - keep original teams immutable
      // The bracket should always show the original matchup, not the winner

    }



    // Create QF fixtures

    const qfFixtures = createKnockoutFixtures("qf", winners, { leg1: dayOffsets.qfLeg1, leg2: dayOffsets.qfLeg2 }, updatedFixtures);

    updatedFixtures = [...updatedFixtures, ...qfFixtures];



    // Fill QF bracket slots respecting bracket tree
    // R16-1 winner vs R16-2 winner → QF-1
    // R16-3 winner vs R16-4 winner → QF-2
    // R16-5 winner vs R16-6 winner → QF-3
    // R16-7 winner vs R16-8 winner → QF-4
    const qfMatchups = [
      { slotId: "QF-1", r16Indices: [0, 1] },
      { slotId: "QF-2", r16Indices: [2, 3] },
      { slotId: "QF-3", r16Indices: [4, 5] },
      { slotId: "QF-4", r16Indices: [6, 7] },
    ];

    for (const matchup of qfMatchups) {
      const qfSlot = updatedBracket.find(s => s.id === matchup.slotId);
      if (qfSlot) {
        qfSlot.homeId = winners[matchup.r16Indices[0]];
        qfSlot.awayId = winners[matchup.r16Indices[1]];
      }
    }



    return { fixtures: updatedFixtures, bracket: updatedBracket, nextPhase: "qf" };

  }



  if (currentPhase === "qf") {

    // Determine QF winners (4 ties)

    for (let i = 0; i < 4; i++) {

      const leg1 = fixtures.find(f => f.id === `ucl-qf-${i}-leg1`);

      const leg2 = fixtures.find(f => f.id === `ucl-qf-${i}-leg2`);

      if (!leg1?.result || !leg2?.result) {

        return { fixtures, bracket, nextPhase: "qf" }; // Not all matches complete

      }



      const winner = getAggregateWinner(leg1, leg2);

      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;

      winners.push(winnerId!);

    }



    // Create SF fixtures

    const sfFixtures = createKnockoutFixtures("sf", winners, { leg1: dayOffsets.sfLeg1, leg2: dayOffsets.sfLeg2 }, updatedFixtures);

    updatedFixtures = [...updatedFixtures, ...sfFixtures];



    // Fill SF bracket slots respecting bracket tree
    // QF-1 winner vs QF-2 winner → SF-1
    // QF-3 winner vs QF-4 winner → SF-2
    const sfMatchups = [
      { slotId: "SF-1", qfIndices: [0, 1] },
      { slotId: "SF-2", qfIndices: [2, 3] },
    ];

    for (const matchup of sfMatchups) {
      const sfSlot = updatedBracket.find(s => s.id === matchup.slotId);
      if (sfSlot) {
        sfSlot.homeId = winners[matchup.qfIndices[0]];
        sfSlot.awayId = winners[matchup.qfIndices[1]];
      }
    }



    return { fixtures: updatedFixtures, bracket: updatedBracket, nextPhase: "sf" };

  }



  if (currentPhase === "sf") {

    // Determine SF winners (2 ties)

    for (let i = 0; i < 2; i++) {

      const leg1 = fixtures.find(f => f.id === `ucl-sf-${i}-leg1`);

      const leg2 = fixtures.find(f => f.id === `ucl-sf-${i}-leg2`);

      if (!leg1?.result || !leg2?.result) {

        return { fixtures, bracket, nextPhase: "sf" }; // Not all matches complete

      }



      const winner = getAggregateWinner(leg1, leg2);

      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;

      winners.push(winnerId!);

    }



    // Create Final fixture

    const finalFixtures = createKnockoutFixtures("final", winners, { leg1: dayOffsets.final, leg2: dayOffsets.final }, updatedFixtures);

    updatedFixtures = [...updatedFixtures, ...finalFixtures];



    // Fill Final bracket slot

    const finalSlot = updatedBracket.find(s => s.id === "F");

    if (finalSlot) {

      finalSlot.homeId = winners[0];

      finalSlot.awayId = winners[1];

    }



    return { fixtures: updatedFixtures, bracket: updatedBracket, nextPhase: "final" };

  }



  return { fixtures, bracket, nextPhase: "done" };

}



// ============================================================

//  FULL UCL BRACKET — From Playoffs to Final (Fixed bracket)

//  Creates complete bracket with Playoff Routes A-D and fixed R16-QF-SF-Final

// ============================================================

export type PlayoffRoute = "A" | "B" | "C" | "D";

/** Play-off tie index (0–7) → R16 bracket slot id */
export const PLAYOFF_INDEX_TO_R16_SLOT: Record<number, string> = {
  6: "R16-1", 7: "R16-7",
  4: "R16-3", 5: "R16-5",
  2: "R16-4", 3: "R16-6",
  0: "R16-2", 1: "R16-8",
};

export function r16FixtureIndexFromSlot(slotId: string): number {
  return parseInt(slotId.replace("R16-", ""), 10) - 1;
}

export function isRealTeamId(id: string | null | undefined): id is string {
  return !!id && !id.startsWith("winner-") && !id.startsWith("po-winner-");
}

export interface PlayoffPair {

  route: PlayoffRoute;

  seeded: string;    // 9-16

  unseeded: string;  // 17-24

}

export interface FullBracket {

  playoffPairs: PlayoffPair[];

  playoffFixtures: Fixture[];

  r16Fixtures: Fixture[];

  qfFixtures: Fixture[];

  sfFixtures: Fixture[];

  finalFixture: Fixture[];

  bracket: UCLBracketSlot[];

}



export function buildFullUCLBracket(

  rankedTeams: string[], // [1st, 2nd, ..., 36th] - full ranking from league phase

  dayOffsets: {

    playoffLeg1: number; playoffLeg2: number;

    r16Leg1: number; r16Leg2: number;

    qfLeg1: number; qfLeg2: number;

    sfLeg1: number; sfLeg2: number;

    final: number;

  }

): FullBracket {

  const top8 = rankedTeams.slice(0, 8);

  const playoffSeeds = rankedTeams.slice(8, 16);  // 9-16

  const playoffUnseeds = rankedTeams.slice(16, 24); // 17-24



  // Helper to shuffle array

  const shuffle = <T,>(arr: T[]): T[] => {

    const a = [...arr];

    for (let i = a.length - 1; i > 0; i--) {

      const j = Math.floor(Math.random() * (i + 1));

      [a[i], a[j]] = [a[j], a[i]];

    }

    return a;

  };



  // Create Playoff Routes with random draw within constraints

  // Route A: 9-10 vs 23-24

  const routeASeeds = shuffle(playoffSeeds.slice(0, 2)); // 9, 10

  const routeAUnseeds = shuffle(playoffUnseeds.slice(6, 8)); // 23, 24

  // Route B: 11-12 vs 21-22

  const routeBSeeds = shuffle(playoffSeeds.slice(2, 4)); // 11, 12

  const routeBUnseeds = shuffle(playoffUnseeds.slice(4, 6)); // 21, 22

  // Route C: 13-14 vs 19-20

  const routeCSeeds = shuffle(playoffSeeds.slice(4, 6)); // 13, 14

  const routeCUnseeds = shuffle(playoffUnseeds.slice(2, 4)); // 19, 20

  // Route D: 15-16 vs 17-18

  const routeDSeeds = shuffle(playoffSeeds.slice(6, 8)); // 15, 16

  const routeDUnseeds = shuffle(playoffUnseeds.slice(0, 2)); // 17, 18



  const playoffPairs: PlayoffPair[] = [

    { route: "A", seeded: routeASeeds[0], unseeded: routeAUnseeds[0] },

    { route: "A", seeded: routeASeeds[1], unseeded: routeAUnseeds[1] },

    { route: "B", seeded: routeBSeeds[0], unseeded: routeBUnseeds[0] },

    { route: "B", seeded: routeBSeeds[1], unseeded: routeBUnseeds[1] },

    { route: "C", seeded: routeCSeeds[0], unseeded: routeCUnseeds[0] },

    { route: "C", seeded: routeCSeeds[1], unseeded: routeCUnseeds[1] },

    { route: "D", seeded: routeDSeeds[0], unseeded: routeDUnseeds[0] },

    { route: "D", seeded: routeDSeeds[1], unseeded: routeDUnseeds[1] },

  ];



  // Create Playoff fixtures (seeded plays 2nd leg at home)

  const playoffFixtures: Fixture[] = [];

  const playoffSlots: UCLBracketSlot[] = [];

  playoffPairs.forEach((pair, i) => {

    playoffFixtures.push({

      id: `ucl-playoff-${i}-leg1`,

      competition: "ucl",

      league: teamById(pair.unseeded).league,

      matchday: dayOffsets.playoffLeg1,

      round: "Playoff-Leg1",

      homeId: pair.unseeded,

      awayId: pair.seeded,

    });

    playoffFixtures.push({

      id: `ucl-playoff-${i}-leg2`,

      competition: "ucl",

      league: teamById(pair.seeded).league,

      matchday: dayOffsets.playoffLeg2,

      round: "Playoff-Leg2",

      homeId: pair.seeded,

      awayId: pair.unseeded,

    });



    playoffSlots.push({

      id: `PO-${i + 1}`,

      round: "playoff",

      homeId: pair.seeded,

      awayId: pair.unseeded,

      legOneMatchday: dayOffsets.playoffLeg1,

      legTwoMatchday: dayOffsets.playoffLeg2,

      isFinal: false,

    });

  });



  // Define bracket structure for R16 onwards

  // Route winners go to specific R16 slots:

  // Route D winners → play vs 1st, 2nd

  // Route C winners → play vs 3rd, 4th

  // Route B winners → play vs 5th, 6th

  // Route A winners → play vs 7th, 8th



  const r16Structure = [

    { top8Rank: 0, route: "D", slotId: "R16-1" },  // 1st vs Route D winner

    { top8Rank: 7, route: "A", slotId: "R16-2" },  // 8th vs Route A winner

    { top8Rank: 3, route: "C", slotId: "R16-3" },  // 4th vs Route C winner

    { top8Rank: 4, route: "B", slotId: "R16-4" },  // 5th vs Route B winner

    { top8Rank: 2, route: "C", slotId: "R16-5" },  // 3rd vs Route C winner

    { top8Rank: 5, route: "B", slotId: "R16-6" },  // 6th vs Route B winner

    { top8Rank: 1, route: "D", slotId: "R16-7" },  // 2nd vs Route D winner

    { top8Rank: 6, route: "A", slotId: "R16-8" },  // 7th vs Route A winner

  ];



  // Create R16 fixtures with placeholder for route winners

  const r16Fixtures: Fixture[] = [];

  const r16Slots: UCLBracketSlot[] = [];



  r16Structure.forEach((struct, i) => {

    const seedTeam = top8[struct.top8Rank];

    // Route winner will be determined after playoffs - use placeholder

    const routeWinner = `winner-route-${struct.route}-${i % 2 === 0 ? 1 : 2}`;



    // Leg1: Route winner plays home (they were unseeded in playoffs)

    // Leg2: Top 8 team plays home

    r16Fixtures.push({

      id: `ucl-r16-${i}-leg1`,

      competition: "ucl",

      league: teamById(seedTeam).league,

      matchday: dayOffsets.r16Leg1,

      round: "R16-Leg1",

      homeId: routeWinner as string,

      awayId: seedTeam,

    });

    r16Fixtures.push({

      id: `ucl-r16-${i}-leg2`,

      competition: "ucl",

      league: teamById(seedTeam).league,

      matchday: dayOffsets.r16Leg2,

      round: "R16-Leg2",

      homeId: seedTeam,

      awayId: routeWinner as string,

    });



    r16Slots.push({

      id: struct.slotId,

      round: "r16",

      homeId: seedTeam,

      awayId: routeWinner as string,

      legOneMatchday: dayOffsets.r16Leg1,

      legTwoMatchday: dayOffsets.r16Leg2,

      isFinal: false,

    });

  });



  // Create QF bracket (predefined from R16 winners)

  // QF1: R16-1 winner vs R16-2 winner

  // QF2: R16-3 winner vs R16-4 winner

  // QF3: R16-5 winner vs R16-6 winner

  // QF4: R16-7 winner vs R16-8 winner

  const qfStructure = [

    { r16Slots: [0, 1], slotId: "QF-1" },

    { r16Slots: [2, 3], slotId: "QF-2" },

    { r16Slots: [4, 5], slotId: "QF-3" },

    { r16Slots: [6, 7], slotId: "QF-4" },

  ];



  const qfFixtures: Fixture[] = [];

  const qfSlots: UCLBracketSlot[] = [];



  qfStructure.forEach((struct, i) => {

    const placeholderHome = `winner-${r16Slots[struct.r16Slots[0]].id}`;

    const placeholderAway = `winner-${r16Slots[struct.r16Slots[1]].id}`;



    qfFixtures.push({

      id: `ucl-qf-${i}-leg1`,

      competition: "ucl",

      league: "premier",

      matchday: dayOffsets.qfLeg1,

      round: "QF-Leg1",

      homeId: placeholderHome,

      awayId: placeholderAway,

    });

    qfFixtures.push({

      id: `ucl-qf-${i}-leg2`,

      competition: "ucl",

      league: "premier",

      matchday: dayOffsets.qfLeg2,

      round: "QF-Leg2",

      homeId: placeholderAway,

      awayId: placeholderHome,

    });



    qfSlots.push({

      id: struct.slotId,

      round: "qf",

      homeId: null,

      awayId: null,

      legOneMatchday: dayOffsets.qfLeg1,

      legTwoMatchday: dayOffsets.qfLeg2,

      isFinal: false,

    });

  });



  // Create SF bracket

  // SF1: QF-1 winner vs QF-2 winner

  // SF2: QF-3 winner vs QF-4 winner

  const sfStructure = [

    { qfSlots: [0, 1], slotId: "SF-1" },

    { qfSlots: [2, 3], slotId: "SF-2" },

  ];



  const sfFixtures: Fixture[] = [];

  const sfSlots: UCLBracketSlot[] = [];



  sfStructure.forEach((struct, i) => {

    const placeholderHome = `winner-${qfSlots[struct.qfSlots[0]].id}`;

    const placeholderAway = `winner-${qfSlots[struct.qfSlots[1]].id}`;



    sfFixtures.push({

      id: `ucl-sf-${i}-leg1`,

      competition: "ucl",

      league: "premier",

      matchday: dayOffsets.sfLeg1,

      round: "SF-Leg1",

      homeId: placeholderHome,

      awayId: placeholderAway,

    });

    sfFixtures.push({

      id: `ucl-sf-${i}-leg2`,

      competition: "ucl",

      league: "premier",

      matchday: dayOffsets.sfLeg2,

      round: "SF-Leg2",

      homeId: placeholderAway,

      awayId: placeholderHome,

    });



    sfSlots.push({

      id: struct.slotId,

      round: "sf",

      homeId: null,

      awayId: null,

      legOneMatchday: dayOffsets.sfLeg1,

      legTwoMatchday: dayOffsets.sfLeg2,

      isFinal: false,

    });

  });



  // Create Final fixture

  const finalFixture: Fixture[] = [{

    id: `ucl-final`,

    competition: "ucl",

    league: "premier",

    matchday: dayOffsets.final,

    round: "Final",

    homeId: "winner-SF-1",

    awayId: "winner-SF-2",

  }];



  const finalSlot: UCLBracketSlot = {

    id: "F",

    round: "final",

    homeId: null,

    awayId: null,

    legOneMatchday: dayOffsets.final,

    legTwoMatchday: dayOffsets.final,

    isFinal: true,

  };



  // Combine all bracket slots

  const bracket: UCLBracketSlot[] = [

    ...playoffSlots,

    ...r16Slots,

    ...qfSlots,

    ...sfSlots,

    finalSlot,

  ];



  return {

    playoffPairs,

    playoffFixtures,

    r16Fixtures,

    qfFixtures,

    sfFixtures,

    finalFixture,

    bracket,

  };

}



// ============================================================

//  UPDATE BRACKET WITH ACTUAL WINNERS

//  After each round completes, update bracket slots with real winners

// ============================================================

export function updateBracketWithWinners(

  bracket: UCLBracketSlot[],

  fixtures: Fixture[],

  phase: "playoff" | "r16" | "qf" | "sf"

): UCLBracketSlot[] {

  const updated = [...bracket];



  if (phase === "playoff") {

    // Update R16 slots with actual playoff winners

    for (let i = 0; i < 8; i++) {

      const leg1 = fixtures.find(f => f.id === `ucl-playoff-${i}-leg1`);

      const leg2 = fixtures.find(f => f.id === `ucl-playoff-${i}-leg2`);

      if (!leg1?.result || !leg2?.result) continue;



      const winner = getAggregateWinner(leg1, leg2);

      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;



      const r16SlotId = PLAYOFF_INDEX_TO_R16_SLOT[i];

      const r16Slot = updated.find(s => s.id === r16SlotId);

      if (r16Slot && winnerId) {

        r16Slot.awayId = winnerId;

      }

    }

  }



  if (phase === "r16") {

    // Update QF slots with R16 winners

    for (let i = 0; i < 8; i++) {

      const leg1 = fixtures.find(f => f.id === `ucl-r16-${i}-leg1`);

      const leg2 = fixtures.find(f => f.id === `ucl-r16-${i}-leg2`);

      if (!leg1?.result || !leg2?.result) continue;



      const winner = getAggregateWinner(leg1, leg2);

      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;



      // QF mapping: R16-1/2 → QF-1, R16-3/4 → QF-2, etc.

      const qfIndex = Math.floor(i / 2);

      const qfSlot = updated.find(s => s.id === `QF-${qfIndex + 1}`);

      if (qfSlot && winnerId) {

        if (i % 2 === 0) {

          qfSlot.homeId = winnerId;

        } else {

          qfSlot.awayId = winnerId;

        }

      }



      const r16Slot = updated.find(s => s.id === `R16-${i + 1}`);

      if (r16Slot && winnerId) {

        r16Slot.awayId = winnerId;

      }

    }

  }



  if (phase === "qf") {

    // Update SF slots with QF winners

    for (let i = 0; i < 4; i++) {

      const leg1 = fixtures.find(f => f.id === `ucl-qf-${i}-leg1`);

      const leg2 = fixtures.find(f => f.id === `ucl-qf-${i}-leg2`);

      if (!leg1?.result || !leg2?.result) continue;



      const winner = getAggregateWinner(leg1, leg2);

      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;



      // SF mapping: QF-1/2 → SF-1, QF-3/4 → SF-2

      const sfIndex = Math.floor(i / 2);

      const sfSlot = updated.find(s => s.id === `SF-${sfIndex + 1}`);

      if (sfSlot && winnerId) {

        if (i % 2 === 0) {

          sfSlot.homeId = winnerId;

        } else {

          sfSlot.awayId = winnerId;

        }

      }

    }

  }



  if (phase === "sf") {

    // Update Final slot with SF winners

    for (let i = 0; i < 2; i++) {

      const leg1 = fixtures.find(f => f.id === `ucl-sf-${i}-leg1`);

      const leg2 = fixtures.find(f => f.id === `ucl-sf-${i}-leg2`);

      if (!leg1?.result || !leg2?.result) continue;



      const winner = getAggregateWinner(leg1, leg2);

      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;



      const finalSlot = updated.find(s => s.id === "F");

      if (finalSlot && winnerId) {

        if (i === 0) {

          finalSlot.homeId = winnerId;

        } else {

          finalSlot.awayId = winnerId;

        }

      }

    }

  }



  return updated;

}

/** After a play-off tie completes, wire the winner into the pre-drawn R16 fixtures. */
export function propagatePlayoffWinnerToR16Fixtures(
  fixtures: Fixture[],
  playoffIndex: number,
  winnerId: string,
): Fixture[] {
  const slotId = PLAYOFF_INDEX_TO_R16_SLOT[playoffIndex];
  if (!slotId) return fixtures;
  const r16Idx = r16FixtureIndexFromSlot(slotId);
  return fixtures.map(f => {
    if (f.id === `ucl-r16-${r16Idx}-leg1`) return { ...f, homeId: winnerId };
    if (f.id === `ucl-r16-${r16Idx}-leg2`) return { ...f, awayId: winnerId };
    return f;
  });
}


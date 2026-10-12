/**
 * Pure promotion/relegation engine. It only receives plain data, does not read
 * browser APIs, mutate input and is deterministic for the same seed + tables.
 */
export type LeagueStandingRow = {
  teamId: string;
  played?: number;
  won?: number;
  gd?: number;
  gf?: number;
  points?: number;
};

export type PromotionClub = {
  id: string;
  name: string;
  leagueId: string;
  att: number;
  mid: number;
  def: number;
};

export type PromotionPyramidConfig = {
  country: string;
  leagueIds: readonly string[]; // from highest to lowest
  mode: "promotion-playoff" | "relegation-playoff";
  playoffCandidates?: number;
};

export type ClubMovement = {
  teamId: string;
  teamName: string;
  fromLeague: string;
  toLeague: string;
  reason: "direct-promotion" | "promotion-playoff" | "direct-relegation" | "relegation-playoff";
};

export type PlayoffTieResult = {
  country: string;
  stage: string;
  homeTeamId: string;
  awayTeamId: string;
  firstLeg: { homeGoals: number; awayGoals: number };
  secondLeg: { homeGoals: number; awayGoals: number };
  winnerId: string;
  decidedBy: "aggregate" | "extra-time";
};

export type PromotionRelegationResult = {
  seasonStartYear: number;
  nextSeasonStartYear: number;
  movements: ClubMovement[];
  promotedByLeague: Record<string, string[]>;
  relegatedByLeague: Record<string, string[]>;
  playoffTies: PlayoffTieResult[];
  skippedPyramids: { country: string; reason: string }[];
};

export type PromotionRelegationInput = {
  seasonStartYear: number;
  seed: number;
  teams: readonly PromotionClub[];
  standings: Readonly<Record<string, readonly LeagueStandingRow[] | undefined>>;
  pyramids?: readonly PromotionPyramidConfig[];
};

export const DEFAULT_PROMOTION_PYRAMIDS: readonly PromotionPyramidConfig[] = [
  { country: "España", leagueIds: ["laliga", "laliga2"], mode: "promotion-playoff", playoffCandidates: 4 },
  { country: "Inglaterra", leagueIds: ["premier", "championship", "leagueone", "leaguetwo"], mode: "promotion-playoff", playoffCandidates: 4 },
  { country: "Italia", leagueIds: ["seriea", "serieb"], mode: "promotion-playoff", playoffCandidates: 6 },
  { country: "Alemania", leagueIds: ["bundesliga", "bundesliga2", "liga3"], mode: "relegation-playoff" },
  { country: "Francia", leagueIds: ["ligue1", "ligue2"], mode: "relegation-playoff" },
];

function stableSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 1;
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function overall(team: PromotionClub): number {
  return (team.att + team.mid + team.def) / 3;
}

function rankingForLeague(
  leagueId: string,
  input: PromotionRelegationInput,
  effectiveTeamLeague: ReadonlyMap<string, string>,
): PromotionClub[] {
  const rows = new Map((input.standings[leagueId] ?? []).map((row) => [row.teamId, row] as const));
  return input.teams
    .filter((team) => (effectiveTeamLeague.get(team.id) ?? team.leagueId) === leagueId)
    .slice()
    .sort((a, b) => {
      const ar = rows.get(a.id);
      const br = rows.get(b.id);
      const aPoints = Number(ar?.points ?? 0);
      const bPoints = Number(br?.points ?? 0);
      if (aPoints !== bPoints) return bPoints - aPoints;
      const aGd = Number(ar?.gd ?? 0);
      const bGd = Number(br?.gd ?? 0);
      if (aGd !== bGd) return bGd - aGd;
      const aGf = Number(ar?.gf ?? 0);
      const bGf = Number(br?.gf ?? 0);
      if (aGf !== bGf) return bGf - aGf;
      const aWon = Number(ar?.won ?? 0);
      const bWon = Number(br?.won ?? 0);
      if (aWon !== bWon) return bWon - aWon;
      const aPlayed = Number(ar?.played ?? 0);
      const bPlayed = Number(br?.played ?? 0);
      if (aPlayed !== bPlayed) return bPlayed - aPlayed;
      // Empty legacy tables have no merit data yet, so team level provides a
      // stable fallback instead of alphabetical order randomly determining promotion.
      const strengthDiff = overall(b) - overall(a);
      return strengthDiff || a.name.localeCompare(b.name);
    });
}

function poisson(lambda: number, random: () => number): number {
  const threshold = Math.exp(-Math.max(0.05, Math.min(3.2, lambda)));
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= Math.max(Number.MIN_VALUE, random());
  } while (product > threshold && count < 12);
  return count - 1;
}

function goalsFor(attacker: PromotionClub, defender: PromotionClub, home: boolean, random: () => number): number {
  const attack = Number(attacker.att || overall(attacker));
  const defence = Number(defender.def || overall(defender));
  const lambda = 1.22 + (attack - defence) * 0.035 + (home ? 0.14 : 0);
  return poisson(Math.max(0.25, Math.min(2.65, lambda)), random);
}

function simulateTwoLegTie(
  first: PromotionClub,
  second: PromotionClub,
  seed: number,
  country: string,
  stage: string,
): PlayoffTieResult {
  const random = makeRandom(seed);
  const firstHomeGoals = goalsFor(first, second, true, random);
  const firstAwayGoals = goalsFor(second, first, false, random);
  const secondHomeGoals = goalsFor(second, first, true, random);
  const secondAwayGoals = goalsFor(first, second, false, random);
  const firstAggregate = firstHomeGoals + secondAwayGoals;
  const secondAggregate = firstAwayGoals + secondHomeGoals;
  let winnerId: string;
  let decidedBy: "aggregate" | "extra-time" = "aggregate";
  if (firstAggregate > secondAggregate) winnerId = first.id;
  else if (secondAggregate > firstAggregate) winnerId = second.id;
  else {
    decidedBy = "extra-time";
    const strengthDiff = overall(first) - overall(second) + 1.5;
    const chanceFirst = 1 / (1 + Math.exp(-strengthDiff / 7));
    winnerId = random() < chanceFirst ? first.id : second.id;
  }
  return {
    country,
    stage,
    homeTeamId: first.id,
    awayTeamId: second.id,
    firstLeg: { homeGoals: firstHomeGoals, awayGoals: firstAwayGoals },
    secondLeg: { homeGoals: secondHomeGoals, awayGoals: secondAwayGoals },
    winnerId,
    decidedBy,
  };
}

function simulatePromotionPlayoff(
  candidates: PromotionClub[],
  seed: number,
  country: string,
  stagePrefix: string,
  ties: PlayoffTieResult[],
): string | null {
  if (candidates.length < 2) return null;
  const match = (a: PromotionClub, b: PromotionClub, stage: string) => {
    const result = simulateTwoLegTie(
      a,
      b,
      stableSeed(`${seed}|${country}|${stage}|${a.id}|${b.id}`),
      country,
      stage,
    );
    ties.push(result);
    return candidates.find((team) => team.id === result.winnerId)!;
  };

  if (candidates.length >= 6) {
    // Italy-style six-team access playoff: 5v8 and 6v7, followed by 3rd/4th.
    const qfA = match(candidates[2], candidates[5], `${stagePrefix}-cuartos-1`);
    const qfB = match(candidates[3], candidates[4], `${stagePrefix}-cuartos-2`);
    const semiA = match(candidates[0], qfB, `${stagePrefix}-semifinal-1`);
    const semiB = match(candidates[1], qfA, `${stagePrefix}-semifinal-2`);
    return match(semiA, semiB, `${stagePrefix}-final`).id;
  }

  const semifinalA = match(candidates[0], candidates[candidates.length - 1], `${stagePrefix}-semifinal-1`);
  const semifinalB = match(candidates[1], candidates[candidates.length - 2], `${stagePrefix}-semifinal-2`);
  return match(semifinalA, semifinalB, `${stagePrefix}-final`).id;
}

/**
 * Calculates tier movements without modifying any input. League sizes are
 * preserved because each movement across a boundary is paired with a movement
 * in the opposite direction. The bottom tier never relegates anyone further.
 */
export function calculatePromotionRelegation(input: PromotionRelegationInput): PromotionRelegationResult {
  const pyramids = input.pyramids ?? DEFAULT_PROMOTION_PYRAMIDS;
  const effectiveTeamLeague = new Map(input.teams.map((team) => [team.id, team.leagueId] as const));
  const movements: ClubMovement[] = [];
  const playoffTies: PlayoffTieResult[] = [];
  const skippedPyramids: { country: string; reason: string }[] = [];
  const promotedByLeague: Record<string, string[]> = {};
  const relegatedByLeague: Record<string, string[]> = {};
  const moved = new Set<string>();

  const addMovement = (team: PromotionClub, toLeague: string, reason: ClubMovement["reason"]) => {
    if (moved.has(team.id) || team.leagueId === toLeague) return;
    moved.add(team.id);
    movements.push({ teamId: team.id, teamName: team.name, fromLeague: team.leagueId, toLeague, reason });
    if (reason === "direct-promotion" || reason === "promotion-playoff") {
      (promotedByLeague[team.leagueId] ??= []).push(team.id);
    } else {
      (relegatedByLeague[team.leagueId] ??= []).push(team.id);
    }
  };

  for (const pyramid of pyramids) {
    if (pyramid.leagueIds.length < 2) {
      skippedPyramids.push({ country: pyramid.country, reason: "La pirámide no contiene al menos dos divisiones" });
      continue;
    }

    for (let index = 0; index < pyramid.leagueIds.length - 1; index += 1) {
      const upperLeague = pyramid.leagueIds[index];
      const lowerLeague = pyramid.leagueIds[index + 1];
      const upper = rankingForLeague(upperLeague, input, effectiveTeamLeague);
      const lower = rankingForLeague(lowerLeague, input, effectiveTeamLeague);
      if (upper.length < 5 || lower.length < 3) {
        skippedPyramids.push({ country: pyramid.country, reason: `${upperLeague}/${lowerLeague}: faltan equipos para resolver los movimientos y posibles playoffs` });
        continue;
      }

      const directCount = Math.min(2, upper.length - 1, lower.length - 1);
      const requiredPlayoffCandidates = pyramid.mode === "promotion-playoff"
        ? (pyramid.playoffCandidates ?? 4)
        : 0;
      if (pyramid.mode === "promotion-playoff" && lower.length - directCount < requiredPlayoffCandidates) {
        skippedPyramids.push({
          country: pyramid.country,
          reason: `${lowerLeague}/${upperLeague}: hacen falta ${requiredPlayoffCandidates} candidatos de playoff tras los ascensos directos`,
        });
        continue;
      }

      // Direct access: the first two in the lower tier rise and the last two
      // in the upper tier descend. These are disjoint from the playoff places.
      for (const team of lower.slice(0, directCount)) addMovement(team, upperLeague, "direct-promotion");
      for (const team of upper.slice(-directCount)) addMovement(team, lowerLeague, "direct-relegation");

      if (pyramid.mode === "promotion-playoff") {
        const candidateCount = Math.min(requiredPlayoffCandidates, lower.length - directCount);
        const candidates = lower.slice(directCount, directCount + candidateCount);
        const winnerId = simulatePromotionPlayoff(
          candidates,
          stableSeed(`${input.seed}|${input.seasonStartYear}|${pyramid.country}|${lowerLeague}|${upperLeague}`),
          pyramid.country,
          `${lowerLeague}-ascenso`,
          playoffTies,
        );
        const winner = lower.find((team) => team.id === winnerId);
        if (winner) addMovement(winner, upperLeague, "promotion-playoff");
        // Spain, England and Italy use a third promotion/relegation place.
        for (const team of upper.slice(-3)) {
          if (!moved.has(team.id)) addMovement(team, lowerLeague, "direct-relegation");
        }
      } else {
        // Adapted German/French survival playoff: 16th in the upper tier plays
        // 3rd in the lower tier over two legs. The winner remains/goes up.
        const upperCandidate = upper[upper.length - 3];
        const lowerCandidate = lower[2];
        const tie = simulateTwoLegTie(
          upperCandidate,
          lowerCandidate,
          stableSeed(`${input.seed}|${input.seasonStartYear}|${pyramid.country}|${upperLeague}|${lowerLeague}|relegation-playoff`),
          pyramid.country,
          `${upperLeague}-permanencia`,
        );
        playoffTies.push(tie);
        if (tie.winnerId === lowerCandidate.id) {
          addMovement(upperCandidate, lowerLeague, "relegation-playoff");
          addMovement(lowerCandidate, upperLeague, "promotion-playoff");
        }
      }
    }
  }

  return {
    seasonStartYear: input.seasonStartYear,
    nextSeasonStartYear: input.seasonStartYear + 1,
    movements,
    promotedByLeague,
    relegatedByLeague,
    playoffTies,
    skippedPyramids,
  };
}

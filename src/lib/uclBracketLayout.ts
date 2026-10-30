/**
 * Maps each play-off tie to the fixed round-of-16 slot it feeds.
 * Keep this mapping shared by draw propagation and the bracket UI so the
 * displayed paths cannot drift away from the actual competition tree.
 */
export const PLAYOFF_INDEX_TO_R16_SLOT: Record<number, string> = {
  6: "R16-1",
  7: "R16-7",
  4: "R16-3",
  5: "R16-5",
  2: "R16-4",
  3: "R16-6",
  0: "R16-2",
  1: "R16-8",
};

export type BracketSlotIdentity = { id: string };

/**
 * Returns the play-off ties in the exact order of the R16 slots they feed.
 * Missing legacy entries remain null instead of shifting every later path.
 */
export function orderPlayoffByR16<T extends BracketSlotIdentity>(
  playoff: T[],
  r16: T[],
): Array<T | null> {
  const playoffIndexByR16Slot = new Map(
    Object.entries(PLAYOFF_INDEX_TO_R16_SLOT).map(([playoffIndex, slotId]) => [
      slotId,
      Number(playoffIndex),
    ]),
  );

  return r16.map((nextRoundMatch) => {
    const playoffIndex = playoffIndexByR16Slot.get(nextRoundMatch.id);
    return playoffIndex === undefined ? null : playoff[playoffIndex] ?? null;
  });
}


/**
 * Splits an already ordered UEFA bracket into mirrored halves around the final.
 * The right half is reversed so its path flows inward toward the centre.
 */
export function splitUclBracketSides<T>(playoff: T[], r16: T[], qf: T[], sf: T[]) {
  return {
    left: {
      playoff: playoff.slice(0, 4),
      r16: r16.slice(0, 4),
      qf: qf.slice(0, 2),
      sf: sf[0] ?? null,
    },
    right: {
      playoff: playoff.slice(4, 8).reverse(),
      r16: r16.slice(4, 8).reverse(),
      qf: qf.slice(2, 4).reverse(),
      sf: sf[1] ?? null,
    },
  };
}

/**
 * Orders a two-legged tie for display with the club hosting Leg 2 first.
 * `fallbackHomeIsLeg2Home` describes the persisted slot convention when a
 * matching Leg 2 fixture has not yet been materialized.
 */
export function orderTieBySecondLegHome(
  fallbackHome: string | null,
  fallbackAway: string | null,
  leg2: { homeId?: string | null; awayId?: string | null } | null | undefined,
  fallbackHomeIsLeg2Home: boolean,
): { top: string | null; bottom: string | null } {
  if (typeof leg2?.homeId === "string" && leg2.homeId && typeof leg2?.awayId === "string" && leg2.awayId) {
    return { top: leg2.homeId, bottom: leg2.awayId };
  }
  return fallbackHomeIsLeg2Home
    ? { top: fallbackHome, bottom: fallbackAway }
    : { top: fallbackAway, bottom: fallbackHome };
}

/**
 * League-phase merit carried through every knockout round. A smaller number
 * means a better seed (1st place has priority over 2nd, etc.).
 */
export type KnockoutSeedRanks = Record<string, number>;

/** Build the immutable starting priority from the final league-phase table. */
export function buildKnockoutSeedRanks(rankedTeamIds: readonly string[]): KnockoutSeedRanks {
  return Object.fromEntries(
    rankedTeamIds
      .filter((teamId): teamId is string => typeof teamId === "string" && teamId.length > 0)
      .map((teamId, index) => [teamId, index + 1]),
  );
}

function rankOf(teamId: string, seedRanks: KnockoutSeedRanks): number {
  const rank = Number(seedRanks[teamId]);
  return Number.isFinite(rank) && rank > 0 ? rank : Number.MAX_SAFE_INTEGER;
}

/**
 * A team that eliminates a better-ranked opponent inherits that opponent's
 * better seed priority. The inherited priority is permanent for the rest of
 * this edition, including after the team wins further ties.
 */
export function inheritKnockoutSeedRank(
  seedRanks: KnockoutSeedRanks,
  winnerId: string,
  eliminatedId: string,
): KnockoutSeedRanks {
  if (!winnerId || !eliminatedId || winnerId === eliminatedId) return seedRanks;
  const inheritedRank = Math.min(rankOf(winnerId, seedRanks), rankOf(eliminatedId, seedRanks));
  if (inheritedRank === Number.MAX_SAFE_INTEGER) return seedRanks;
  return { ...seedRanks, [winnerId]: inheritedRank };
}

/** The side with the better inherited league-phase priority hosts Leg 2. */
export function getSecondLegHomeBySeed(
  firstTeamId: string,
  secondTeamId: string,
  seedRanks: KnockoutSeedRanks,
): string {
  const firstRank = rankOf(firstTeamId, seedRanks);
  const secondRank = rankOf(secondTeamId, seedRanks);
  return firstRank <= secondRank ? firstTeamId : secondTeamId;
}

/**
 * Orient both fixtures in a two-legged tie using inherited seeding: the team
 * with the better priority plays Leg 1 away and Leg 2 at home.
 */
export function orientTwoLegTieBySeed(
  firstTeamId: string,
  secondTeamId: string,
  seedRanks: KnockoutSeedRanks,
): { leg1HomeId: string; leg1AwayId: string; leg2HomeId: string; leg2AwayId: string } {
  const leg2HomeId = getSecondLegHomeBySeed(firstTeamId, secondTeamId, seedRanks);
  const leg2AwayId = leg2HomeId === firstTeamId ? secondTeamId : firstTeamId;
  return {
    leg1HomeId: leg2AwayId,
    leg1AwayId: leg2HomeId,
    leg2HomeId,
    leg2AwayId,
  };
}


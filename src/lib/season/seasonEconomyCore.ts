/**
 * Núcleo determinista de economía de fin de temporada.
 * No importa React, el store ni APIs del navegador: recibe cifras explícitas
 * y devuelve un nuevo estado financiero que puede probarse headless.
 */

export type EuropeanCompetitionId = "ucl" | "uel" | "uecl";
export type FinanceMode = "user" | "ai";

export type SeasonEconomyClubInput = {
  clubId: string;
  mode: FinanceMode;
  currentBudget: number;
  initialBudget: number;
  wageBudget: number;
  wageBill: number;
  spent: number;
  earned: number;
  previousLeagueId: string;
  nextLeagueId: string;
  finalPosition: number | null;
  leagueSize: number;
  promoted?: boolean;
  relegated?: boolean;
  wonDomesticCup?: boolean;
  currentEuropeanCompetition?: EuropeanCompetitionId | null;
  nextEuropeanCompetition?: EuropeanCompetitionId | null;
  europeanChampion?: EuropeanCompetitionId | null;
  /** The user's UCL milestone system already pays their European prizes. */
  userUclPrizeLedgerAlreadyPaid?: boolean;
};

export type SeasonEconomyBreakdown = {
  broadcastRevenue: number;
  leaguePositionPrize: number;
  domesticCupPrize: number;
  europeanParticipationRevenue: number;
  europeanChampionPrize: number;
  nextSeasonCommercialRevenue: number;
  totalRevenue: number;
};

export type SeasonEconomySettlement = {
  clubId: string;
  mode: FinanceMode;
  previousBudget: number;
  previousInitialBudget: number;
  initialBudget: number;
  budget: number;
  appliedRevenue: number;
  totalBudget: number;
  wageBudget: number;
  wageBill: number;
  spent: number;
  earned: number;
  breakdown: SeasonEconomyBreakdown;
};

export type SeasonEconomyLedgerResult = {
  season: string;
  updates: SeasonEconomySettlement[];
  ledger: string[];
  skipped: boolean;
  totalRevenue: number;
};

type LeagueEconomyProfile = {
  /** Stable economic tier used when a club changes division. */
  tierFactor: number;
  /** Annual broadcast/commercial baseline per club, euros. */
  broadcast: number;
  /** Position-based domestic prize pool per league, euros. */
  positionPool: number;
  /** Cup winner prize, euros. */
  cupPrize: number;
};

const M = 1_000_000;
const FINANCE_FLOOR = 500_000;
const MAX_AI_BUDGET_MULTIPLE = 4;
const MAX_USER_BUDGET_MULTIPLE = 3.5;

const LEAGUE_PROFILES: Record<string, LeagueEconomyProfile> = {
  premier: { tierFactor: 1, broadcast: 18 * M, positionPool: 22 * M, cupPrize: 4 * M },
  laliga: { tierFactor: 0.95, broadcast: 10 * M, positionPool: 12 * M, cupPrize: 2.8 * M },
  seriea: { tierFactor: 0.85, broadcast: 9 * M, positionPool: 10 * M, cupPrize: 2.5 * M },
  bundesliga: { tierFactor: 0.9, broadcast: 10 * M, positionPool: 10 * M, cupPrize: 2.4 * M },
  ligue1: { tierFactor: 0.75, broadcast: 7 * M, positionPool: 8 * M, cupPrize: 1.8 * M },
  championship: { tierFactor: 0.52, broadcast: 4 * M, positionPool: 4 * M, cupPrize: 900_000 },
  laliga2: { tierFactor: 0.4, broadcast: 2_500_000, positionPool: 2 * M, cupPrize: 700_000 },
  serieb: { tierFactor: 0.43, broadcast: 2_400_000, positionPool: 2 * M, cupPrize: 650_000 },
  bundesliga2: { tierFactor: 0.48, broadcast: 2_800_000, positionPool: 2 * M, cupPrize: 700_000 },
  ligue2: { tierFactor: 0.4, broadcast: 2 * M, positionPool: 1_800_000, cupPrize: 600_000 },
  leagueone: { tierFactor: 0.25, broadcast: 1_500_000, positionPool: M, cupPrize: 400_000 },
  leaguetwo: { tierFactor: 0.18, broadcast: M, positionPool: 700_000, cupPrize: 300_000 },
  liga3: { tierFactor: 0.28, broadcast: 1_300_000, positionPool: 900_000, cupPrize: 350_000 },
  ligaportugal: { tierFactor: 0.48, broadcast: 4 * M, positionPool: 3 * M, cupPrize: 900_000 },
  eredivisie: { tierFactor: 0.45, broadcast: 3_800_000, positionPool: 2_500_000, cupPrize: 800_000 },
  trendyolsuperlig: { tierFactor: 0.42, broadcast: 3_200_000, positionPool: 2_200_000, cupPrize: 700_000 },
  trendyolsperlig: { tierFactor: 0.42, broadcast: 3_200_000, positionPool: 2_200_000, cupPrize: 700_000 },
  scottish: { tierFactor: 0.36, broadcast: 2_500_000, positionPool: 1_500_000, cupPrize: 600_000 },
  mls: { tierFactor: 0.4, broadcast: 2_500_000, positionPool: 1_500_000, cupPrize: 500_000 },
  lpf: { tierFactor: 0.32, broadcast: 2_200_000, positionPool: 1_300_000, cupPrize: 450_000 },
};

function finiteNonNegative(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getLeagueEconomyProfile(leagueId: string): LeagueEconomyProfile {
  const exact = LEAGUE_PROFILES[leagueId];
  if (exact) return exact;
  const id = String(leagueId).toLowerCase();
  if (id.includes("leagueone")) return LEAGUE_PROFILES.leagueone;
  if (id.includes("leaguetwo")) return LEAGUE_PROFILES.leaguetwo;
  if (id.includes("championship")) return LEAGUE_PROFILES.championship;
  if (id.includes("laliga2")) return LEAGUE_PROFILES.laliga2;
  if (id.includes("bundesliga2")) return LEAGUE_PROFILES.bundesliga2;
  if (id.includes("ligue2")) return LEAGUE_PROFILES.ligue2;
  if (id.includes("serieb")) return LEAGUE_PROFILES.serieb;
  // Competitions with no complete domestic pyramid use a conservative base.
  return { tierFactor: 0.32, broadcast: 1_250_000, positionPool: 850_000, cupPrize: 300_000 };
}

function recalculatedInitialBudget(input: SeasonEconomyClubInput, oldInitial: number): number {
  const sourceFactor = getLeagueEconomyProfile(input.previousLeagueId).tierFactor;
  const targetFactor = getLeagueEconomyProfile(input.nextLeagueId).tierFactor;
  let multiplier = 1;
  if (input.promoted) {
    multiplier = clamp(targetFactor / Math.max(0.01, sourceFactor), 1.2, 1.6);
  } else if (input.relegated) {
    multiplier = clamp(targetFactor / Math.max(0.01, sourceFactor), 0.5, 0.8);
  } else if (input.previousLeagueId !== input.nextLeagueId) {
    multiplier = clamp(targetFactor / Math.max(0.01, sourceFactor), 0.75, 1.25);
  }
  return Math.max(FINANCE_FLOOR, Math.min(1_000_000_000, Math.round(oldInitial * multiplier)));
}

function calculateRevenue(input: SeasonEconomyClubInput, baseline: number): SeasonEconomyBreakdown {
  const profile = getLeagueEconomyProfile(input.previousLeagueId);
  const position = Number(input.finalPosition);
  const size = Math.max(1, finiteNonNegative(input.leagueSize, 1));
  const validPosition = Number.isFinite(position) && position >= 1 && position <= size;
  const positionShare = validPosition ? clamp((size - position + 1) / size, 0, 1) : 0.25;

  // Broadcast revenue is steady, while final league position distributes a
  // separate prize pool. This is paid for every active domestic division.
  const broadcastRevenue = profile.broadcast;
  const leaguePositionPrize = Math.round(profile.positionPool * positionShare);
  const domesticCupPrize = input.wonDomesticCup ? profile.cupPrize : 0;

  // AI clubs receive centralised end-of-season UEFA income here. The user's
  // Champions League milestones are already paid by the match engine, so UCL
  // payments are not duplicated for that club.
  const euParticipation = input.currentEuropeanCompetition;
  let europeanParticipationRevenue = euParticipation === "ucl" ? 18_600_000
    : euParticipation === "uel" ? 7_500_000
      : euParticipation === "uecl" ? 3_500_000 : 0;
  if (input.mode === "user" && euParticipation === "ucl" && input.userUclPrizeLedgerAlreadyPaid !== false) {
    europeanParticipationRevenue = 0;
  }

  const euroChampions: Record<EuropeanCompetitionId, number> = {
    ucl: 25_000_000,
    uel: 8_000_000,
    uecl: 4_500_000,
  };
  let europeanChampionPrize = input.europeanChampion ? euroChampions[input.europeanChampion] : 0;
  if (input.mode === "user" && input.europeanChampion === "ucl") {
    // UCL title prize is granted at the final by store.ts.
    europeanChampionPrize = 0;
  }

  // A small commercial uplift for the next campaign's European participation
  // is not UEFA prize money and does not replace the next season's milestones.
  const nextSeasonCommercialRevenue = input.nextEuropeanCompetition === "ucl" ? 2_500_000
    : input.nextEuropeanCompetition === "uel" ? 1_200_000
      : input.nextEuropeanCompetition === "uecl" ? 600_000 : 0;

  // Low-budget clubs still receive the league's guaranteed broadcast share;
  // the baseline is used only to keep exceptional mismatched data sensible.
  const safeBroadcast = Math.min(broadcastRevenue, Math.max(1_000_000, baseline * 0.35));
  const totalRevenue = safeBroadcast + leaguePositionPrize + domesticCupPrize
    + europeanParticipationRevenue + europeanChampionPrize + nextSeasonCommercialRevenue;
  return {
    broadcastRevenue: safeBroadcast,
    leaguePositionPrize,
    domesticCupPrize,
    europeanParticipationRevenue,
    europeanChampionPrize,
    nextSeasonCommercialRevenue,
    totalRevenue: finiteNonNegative(totalRevenue),
  };
}

export function calculateSeasonEconomyForClub(input: SeasonEconomyClubInput): SeasonEconomySettlement {
  const currentBudget = finiteNonNegative(input.currentBudget);
  const previousInitialBudget = Math.max(FINANCE_FLOOR, finiteNonNegative(input.initialBudget, FINANCE_FLOOR));
  const initialBudget = recalculatedInitialBudget(input, previousInitialBudget);
  const breakdown = calculateRevenue(input, initialBudget);
  const maxMultiple = input.mode === "user" ? MAX_USER_BUDGET_MULTIPLE : MAX_AI_BUDGET_MULTIPLE;
  const budget = clamp(currentBudget + breakdown.totalRevenue, FINANCE_FLOOR, initialBudget * maxMultiple);
  const wageBill = finiteNonNegative(input.wageBill);
  const oldWageBudget = finiteNonNegative(input.wageBudget);
  let wageBudget: number;
  let totalBudget: number;

  if (input.mode === "user") {
    const previousRatio = currentBudget > 0 ? clamp(oldWageBudget / currentBudget, 0.05, 0.3) : 0.2;
    wageBudget = Math.max(wageBill, Math.round(budget * previousRatio));
    totalBudget = budget;
  } else {
    // In the AI ledger, transfer and wage allocations are separate buckets.
    const oldTotal = Math.max(1, currentBudget + oldWageBudget);
    const wageRatio = clamp(oldWageBudget / oldTotal, 0.15, 0.5);
    const targetWages = Math.round(budget * wageRatio / Math.max(0.01, 1 - wageRatio));
    wageBudget = Math.max(wageBill, Math.min(initialBudget * 1.5, targetWages));
    totalBudget = budget + wageBudget;
  }

  return {
    clubId: input.clubId,
    mode: input.mode,
    previousBudget: currentBudget,
    previousInitialBudget,
    initialBudget,
    budget,
    appliedRevenue: Math.max(0, budget - currentBudget),
    totalBudget,
    wageBudget,
    wageBill,
    spent: 0,
    earned: 0,
    breakdown,
  };
}

/**
 * Idempotent batch settlement. Calling it again with a season already in the
 * ledger returns no updates, so a retry cannot grant annual income twice.
 */
export function settleSeasonEconomyForCampaign(
  season: string,
  clubs: readonly SeasonEconomyClubInput[],
  previousLedger: readonly string[] = [],
): SeasonEconomyLedgerResult {
  const ledger = [...new Set(previousLedger.filter((entry) => typeof entry === "string" && entry.length > 0))];
  if (ledger.includes(season)) {
    return { season, updates: [], ledger, skipped: true, totalRevenue: 0 };
  }
  const updates = clubs.map(calculateSeasonEconomyForClub);
  ledger.push(season);
  return {
    season,
    updates,
    ledger: ledger.slice(-80),
    skipped: false,
    totalRevenue: updates.reduce((sum, update) => sum + update.breakdown.totalRevenue, 0),
  };
}

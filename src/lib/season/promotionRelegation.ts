import {
  getAllTeams,
  getPrimaryLeagueForCountry,
  getTeamLeagueId,
  LEAGUES,
  type LeagueId,
  type TeamLeagueContext,
} from "@/data/teams";
import { initCup } from "@/lib/cups";
import { emptyStandings, generateLeagueFixtures, type Fixture, type Standing } from "@/lib/season";
import { getSeasonStartYear } from "@/lib/season/calendarFactory";
import type { SaveGame } from "@/lib/store";
import {
  calculatePromotionRelegation,
  type PromotionRelegationResult,
} from "./promotionRelegationCore";
import { getPlayedPromotionPlayoffWinners } from "./promotionPlayoffs";

export type PromotionRelegationSaveView = Pick<SaveGame, "season" | "calendarSeed" | "standings" | "teamLeagueOverrides"> & Partial<Pick<SaveGame, "cupFixtures">>;

/** Calculate the next tier movements from one career's final league tables. */
export function calculateSavePromotionRelegation(save: PromotionRelegationSaveView): PromotionRelegationResult {
  const seasonStartYear = getSeasonStartYear(save.season);
  const overrides = save.teamLeagueOverrides ?? {};
  const teams = getAllTeams({ teamLeagueOverrides: {} }).map((team) => ({
    id: team.id,
    name: team.name,
    leagueId: overrides[team.id] ?? team.league,
    att: team.att,
    mid: team.mid,
    def: team.def,
  }));
  return calculatePromotionRelegation({
    seasonStartYear,
    seed: Number.isSafeInteger(save.calendarSeed) && Number(save.calendarSeed) >= 0
      ? Number(save.calendarSeed)
      : 1,
    teams,
    standings: save.standings ?? {},
    playoffWinners: save.cupFixtures ? getPlayedPromotionPlayoffWinners(save) : {},
  });
}

/**
 * Apply only the league-assignment changes from a calculated result. This is
 * intentionally separate from the full rollover pipeline so season closing can
 * archive the previous tables before resetting fixtures/standings.
 */
export function applyPromotionRelegationAssignments(
  save: Pick<SaveGame, "teamLeagueOverrides">,
  result: PromotionRelegationResult,
): Record<string, LeagueId> {
  const overrides: Record<string, LeagueId> = { ...(save.teamLeagueOverrides ?? {}) };
  const staticLeagueByTeam = new Map(
    getAllTeams({ teamLeagueOverrides: {} }).map((team) => [team.id, team.league] as const),
  );
  for (const movement of result.movements) {
    const baseLeague = staticLeagueByTeam.get(movement.teamId);
    if (!baseLeague) continue;
    if (movement.toLeague === baseLeague) delete overrides[movement.teamId];
    else overrides[movement.teamId] = movement.toLeague as LeagueId;
  }
  return overrides;
}

/** Useful for callers that need to know the effective league without cloning a team. */
export function effectiveLeagueAfterMovements(
  teamId: string,
  overrides: Readonly<Record<string, string>> | undefined,
  result: PromotionRelegationResult,
): string | null {
  const movement = result.movements.find((entry) => entry.teamId === teamId);
  return movement?.toLeague ?? overrides?.[teamId] ?? null;
}


export type NextSeasonDomesticState = {
  teamLeagueOverrides: Record<string, LeagueId>;
  myLeague: LeagueId;
  fixtures: Record<LeagueId, Fixture[]>;
  standings: Record<LeagueId, Standing[]>;
  currentMatchday: Record<LeagueId, number>;
  cupFixtures: Record<LeagueId, Fixture[]>;
  cupChampion: Record<LeagueId, string | null>;
  cupDrawPending: null;
};

/**
 * Build the domestic competition state for the next season after calculating
 * promotions/relegations. This pure-ish preparation helper does not mutate the
 * incoming SaveGame and is intended for the season-rollover transaction added
 * in the next phase.
 */
export function prepareNextSeasonDomesticState(
  save: Pick<SaveGame, "season" | "calendarSeed" | "standings" | "teamLeagueOverrides" | "myTeamId">,
  movementResult: PromotionRelegationResult = calculateSavePromotionRelegation(save),
): NextSeasonDomesticState {
  const teamLeagueOverrides = applyPromotionRelegationAssignments(save, movementResult);
  const teamContext: TeamLeagueContext = { teamLeagueOverrides };
  const seed = Number.isSafeInteger(save.calendarSeed) && Number(save.calendarSeed) >= 0
    ? Number(save.calendarSeed)
    : 1;
  const seasonStartYear = movementResult.nextSeasonStartYear;
  const leagueIds = Object.keys(LEAGUES) as LeagueId[];

  const fixtures: Record<LeagueId, Fixture[]> = {} as Record<LeagueId, Fixture[]>;
  const standings: Record<LeagueId, Standing[]> = {} as Record<LeagueId, Standing[]>;
  const currentMatchday: Record<LeagueId, number> = {} as Record<LeagueId, number>;

  for (const leagueId of leagueIds) {
    fixtures[leagueId] = generateLeagueFixtures(leagueId, {
      seasonStartYear,
      seed,
      teamLeagueOverrides,
    });
    standings[leagueId] = emptyStandings(leagueId, teamContext);
    currentMatchday[leagueId] = 1;
  }

  const cupFixtures: Record<LeagueId, Fixture[]> = {} as Record<LeagueId, Fixture[]>;
  const cupChampion: Record<LeagueId, string | null> = {} as Record<LeagueId, string | null>;
  const countries = new Set(
    Object.values(LEAGUES)
      .map((league) => league.country)
      .filter((country): country is string => Boolean(country)),
  );

  for (const country of countries) {
    const primaryLeague = getPrimaryLeagueForCountry(country) as LeagueId | undefined;
    if (!primaryLeague) continue;
    const cup = initCup(country, seasonStartYear, teamContext);
    (cupFixtures as Record<string, unknown>)[`${primaryLeague}_structure`] = cup.structure;
    cupFixtures[primaryLeague] = [];
    cupChampion[primaryLeague] = null;
  }

  const myLeague = getTeamLeagueId(save.myTeamId, teamContext) as LeagueId | null;
  if (!myLeague || !LEAGUES[myLeague]) {
    throw new Error(`La liga del equipo del usuario no es válida para la siguiente temporada: ${String(myLeague)}`);
  }

  return {
    teamLeagueOverrides,
    myLeague,
    fixtures,
    standings,
    currentMatchday,
    cupFixtures,
    cupChampion,
    cupDrawPending: null,
  };
}

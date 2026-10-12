import {
  getAllTeams,
  getTeamLeagueId,
  LEAGUES,
  getPrimaryLeagueForCountry,
  type LeagueId,
} from "@/data/teams";
import { getSeasonStartYear } from "@/lib/season/calendarFactory";
import {
  appendEuropeanCoefficientSeason,
  calculateEuropeanAssociationCoefficient,
  calculateEuropeanQualification,
  type EuropeanAssociation,
  type EuropeanCoefficientSeason,
  type EuropeanClub,
  type EuropeanFixtureResult,
  type EuropeanQualification,
  type EuropeanQualificationInput,
  type EuropeanStanding,
} from "./europeanQualificationCore";

export type EuropeanCompetitionKey = "ucl" | "uel" | "uecl";

export type EuropeanQualificationSave = {
  season?: string;
  teamLeagueOverrides?: Record<string, string>;
  standings?: Record<string, readonly EuropeanStanding[] | undefined>;
  cupChampion?: Record<string, string | null | undefined>;
  uclChampion?: string | null;
  uelChampion?: string | null;
  ueclChampion?: string | null;
  ucl?: { participants?: readonly string[] | null } | null;
  uel?: { participants?: readonly string[] | null } | null;
  uecl?: { participants?: readonly string[] | null } | null;
  uclFixtures?: readonly any[];
  uelFixtures?: readonly any[];
  ueclFixtures?: readonly any[];
  associationCoefficientHistory?: EuropeanCoefficientSeason[];
  europeanQualification?: EuropeanQualificationSnapshot;
};

export type EuropeanQualificationSnapshot = EuropeanQualification & {
  /** Campaña a la que pertenecen estas plazas (no la que acaba de terminar). */
  seasonStartYear: number;
};

const initialQualificationCache = new Map<string, EuropeanQualificationSnapshot>();

function cloneQualificationSnapshot(value: EuropeanQualificationSnapshot): EuropeanQualificationSnapshot {
  return {
    ...value,
    ucl: [...value.ucl],
    uel: [...value.uel],
    uecl: [...value.uecl],
    associationRanking: [...value.associationRanking],
    associationScores: { ...value.associationScores },
  };
}

// Solo asociaciones europeas cuyas ligas existen en la base jugable del proyecto.
// El identificador de asociación es la clave de su máxima división doméstica.
const ASSOCIATION_DEFINITIONS: Array<{ id: string; country: string; topLeagueId: string }> = [
  { id: "premier", country: "Inglaterra", topLeagueId: "premier" },
  { id: "laliga", country: "España", topLeagueId: "laliga" },
  { id: "seriea", country: "Italia", topLeagueId: "seriea" },
  { id: "bundesliga", country: "Alemania", topLeagueId: "bundesliga" },
  { id: "ligue1", country: "Francia", topLeagueId: "ligue1" },
  { id: "ligaportugal", country: "Portugal", topLeagueId: "ligaportugal" },
  { id: "eredivisie", country: "Países Bajos", topLeagueId: "eredivisie" },
  { id: "trendyolsperlig", country: "Turquía", topLeagueId: "trendyolsperlig" },
  { id: "1aproleague", country: "Bélgica", topLeagueId: "1aproleague" },
  { id: "ekstraklasa", country: "Polonia", topLeagueId: "ekstraklasa" },
  { id: "bracksuperleague", country: "Suiza", topLeagueId: "bracksuperleague" },
  { id: "3fsuperliga", country: "Dinamarca", topLeagueId: "3fsuperliga" },
  { id: "allsvenskan", country: "Suecia", topLeagueId: "allsvenskan" },
  { id: "eliteserien", country: "Noruega", topLeagueId: "eliteserien" },
  { id: "austrianbundesliga", country: "Austria", topLeagueId: "austrianbundesliga" },
  { id: "scottish", country: "Escocia", topLeagueId: "scottish" },
  { id: "superliga", country: "Rumanía", topLeagueId: "superliga" },
];

function availableAssociations(): EuropeanAssociation[] {
  return ASSOCIATION_DEFINITIONS
    .filter((definition) => {
      const league = LEAGUES[definition.topLeagueId];
      return Boolean(league && league.country === definition.country);
    })
    .map(({ id, country, topLeagueId }) => ({ id, name: country, topLeagueId }));
}

function toFixtureResults(fixtures: readonly any[] | undefined): EuropeanFixtureResult[] {
  if (!Array.isArray(fixtures)) return [];
  return fixtures.flatMap((fixture) => {
    const result = fixture?.result;
    if (!result || typeof fixture.homeId !== "string" || typeof fixture.awayId !== "string") return [];
    const homeGoals = Number(result.homeGoals);
    const awayGoals = Number(result.awayGoals);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return [];
    return [{ homeId: fixture.homeId, awayId: fixture.awayId, homeGoals, awayGoals, result }];
  });
}

function buildQualificationInput(save: EuropeanQualificationSave = {}): EuropeanQualificationInput {
  const teamLeagueOverrides = save.teamLeagueOverrides ?? {};
  const context = { teamLeagueOverrides };
  const associations = availableAssociations();
  const countryToAssociation = new Map(associations.map((association) => [association.name, association.id] as const));
  const clubs: EuropeanClub[] = getAllTeams(context).map((team) => {
    const leagueId = getTeamLeagueId(team.id, context) ?? team.league;
    const country = LEAGUES[String(leagueId)]?.country;
    return {
      id: team.id,
      name: team.name,
      leagueId: String(leagueId),
      associationId: country ? countryToAssociation.get(country) ?? null : null,
      strength: Number(team.att || 0) + Number(team.mid || 0) + Number(team.def || 0),
    };
  });

  const cupWinnersByAssociation: Record<string, string | null> = {};
  for (const association of associations) {
    const primaryLeague = (getPrimaryLeagueForCountry(association.name) ?? association.topLeagueId) as LeagueId;
    cupWinnersByAssociation[association.id] =
      save.cupChampion?.[association.topLeagueId] ?? save.cupChampion?.[primaryLeague] ?? null;
  }

  const seasonStartYear = getSeasonStartYear(save.season);
  return {
    seasonStartYear,
    associations,
    clubs,
    standings: save.standings ?? {},
    cupWinnersByAssociation,
    champions: {
      ucl: save.uclChampion ?? null,
      uel: save.uelChampion ?? null,
      uecl: save.ueclChampion ?? null,
    },
    coefficientHistory: save.associationCoefficientHistory ?? [],
    results: {
      ucl: toFixtureResults(save.uclFixtures),
      uel: toFixtureResults(save.uelFixtures),
      uecl: toFixtureResults(save.ueclFixtures),
    },
    participants: {
      ucl: save.ucl?.participants ?? [],
      uel: save.uel?.participants ?? [],
      uecl: save.uecl?.participants ?? [],
    },
  };
}

export function selectEuropeanParticipants(save: EuropeanQualificationSave): EuropeanQualification {
  return calculateEuropeanQualification(buildQualificationInput(save));
}

export function getInitialEuropeanQualification(
  seasonStartYear = 2026,
  teamLeagueOverrides: Record<string, string> = {},
): EuropeanQualificationSnapshot {
  const overrideKey = Object.keys(teamLeagueOverrides).sort().map((key) => `${key}:${teamLeagueOverrides[key]}`).join("|");
  const cacheKey = `${seasonStartYear}|${overrideKey}`;
  const cached = initialQualificationCache.get(cacheKey);
  if (cached) return cloneQualificationSnapshot(cached);
  const save: EuropeanQualificationSave = {
    season: `${seasonStartYear}/${String((seasonStartYear + 1) % 100).padStart(2, "0")}`,
    teamLeagueOverrides,
    standings: {},
    cupChampion: {},
  };
  const qualification = calculateEuropeanQualification(buildQualificationInput(save));
  const snapshot = { ...qualification, seasonStartYear };
  initialQualificationCache.set(cacheKey, snapshot);
  return cloneQualificationSnapshot(snapshot);
}

export function getInitialEuropeanParticipants(competition: EuropeanCompetitionKey): string[] {
  const initial = getInitialEuropeanQualification(2026);
  return [...initial[competition]];
}

function isValidParticipantList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length === 36 && value.every((id) => typeof id === "string") && new Set(value).size === 36;
}

export function getEuropeanParticipantsForSave(
  save: EuropeanQualificationSave,
  competition: EuropeanCompetitionKey,
): string[] {
  const seasonStartYear = getSeasonStartYear(save.season);
  const stored = save.europeanQualification;
  if (stored && stored.seasonStartYear === seasonStartYear && isValidParticipantList(stored[competition])) {
    return [...stored[competition]];
  }
  if (seasonStartYear === 2026) return getInitialEuropeanParticipants(competition);
  const calculated = selectEuropeanParticipants(save);
  return [...calculated[competition]];
}

/**
 * Se ejecuta al cerrar la campaña, ANTES de limpiar tablas y fixtures. Añade
 * una sola vez el coeficiente de esa temporada y deja guardadas las plazas de
 * la siguiente. Es puro: no persiste ni modifica el save original.
 */
export function prepareEuropeanQualificationForNextSeason<T extends EuropeanQualificationSave>(save: T): T {
  const input = buildQualificationInput(save);
  const seasonStartYear = input.seasonStartYear;
  let history = (save.associationCoefficientHistory ?? []).map((item) => ({
    seasonStartYear: item.seasonStartYear,
    pointsByAssociation: { ...item.pointsByAssociation },
  }));

  if (!history.some((item) => item.seasonStartYear === seasonStartYear)) {
    const coefficient = calculateEuropeanAssociationCoefficient(input);
    if (coefficient.completedMatches > 0) {
      history = appendEuropeanCoefficientSeason(history, {
        seasonStartYear,
        pointsByAssociation: coefficient.pointsByAssociation,
      });
    }
  }

  const qualification = calculateEuropeanQualification({ ...input, coefficientHistory: history });
  const snapshot: EuropeanQualificationSnapshot = {
    ...qualification,
    seasonStartYear: seasonStartYear + 1,
  };
  return {
    ...save,
    associationCoefficientHistory: history,
    europeanQualification: snapshot,
  } as T;
}

/** Utilidad de auditoría: devuelve los IDs de asociaciones disponibles en orden. */
export function getAvailableEuropeanAssociationIds(): string[] {
  return availableAssociations().map((association) => association.id);
}

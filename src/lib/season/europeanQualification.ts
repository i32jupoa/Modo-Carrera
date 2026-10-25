import {
  getAllTeams,
  getTeamLeagueId,
  LEAGUES,
  getPrimaryLeagueForCountry,
  type LeagueId,
} from "@/data/teams";
import { getSeasonStartYear } from "@/lib/season/calendarFactory";
import { getSeasonArchive } from "./seasonHistory";
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
  saveId?: string;
  season?: string;
  teamLeagueOverrides?: Record<string, string>;
  standings?: Record<string, readonly EuropeanStanding[] | undefined>;
  cupChampion?: Record<string, string | null | undefined>;
  /** Fixtures guardados de las copas domésticas; se usan como respaldo si falta cupChampion. */
  cupFixtures?: Record<string, readonly any[] | undefined>;
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
  { id: "hellasliga", country: "Grecia", topLeagueId: "hellasliga" },
  { id: "ceskaliga", country: "Chequia", topLeagueId: "ceskaliga" },
  { id: "ukrayinaliha", country: "Ucrania", topLeagueId: "ukrayinaliha" },
  { id: "ligahrvatska", country: "Croacia", topLeagueId: "ligahrvatska" },
  { id: "ligacyprus", country: "Chipre", topLeagueId: "ligacyprus" },
  { id: "sseairtricitypd", country: "Irlanda", topLeagueId: "sseairtricitypd" },
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

  const clubIds = new Set(clubs.map((club) => club.id));
  const cupWinnersByAssociation: Record<string, string | null> = {};
  for (const association of associations) {
    const primaryLeague = String(getPrimaryLeagueForCountry(association.name) ?? association.topLeagueId);
    const countryLeagueIds = Object.entries(LEAGUES)
      .filter(([, league]) => league.country === association.name)
      .map(([leagueId]) => leagueId);
    const candidateKeys = [...new Set([association.topLeagueId, primaryLeague, ...countryLeagueIds])];
    let winner: string | null = null;

    // La clave canónica debe ser la copa de la asociación, no necesariamente
    // la primera división que aparece en el catálogo. Algunas partidas antiguas
    // guardaban el campeón bajo otra liga nacional del mismo país.
    for (const key of candidateKeys) {
      const candidate = save.cupChampion?.[key];
      if (typeof candidate === "string" && candidate && clubIds.has(candidate)) {
        winner = candidate;
        break;
      }
    }

    // Migración/respaldo para guardados sin cupChampion: inferirlo solo desde
    // una final jugada, con resultado definitivo o tanda de penaltis.
    if (!winner) {
      const finals = candidateKeys.flatMap((key) => (save.cupFixtures?.[key] ?? []).map((fixture) => ({ key, fixture })))
        .filter(({ fixture }) => /final/i.test(String(fixture?.round ?? fixture?.stage ?? fixture?.name ?? ""))
          && fixture?.result
          && typeof fixture.homeId === "string"
          && typeof fixture.awayId === "string"
          && clubIds.has(fixture.homeId)
          && clubIds.has(fixture.awayId))
        .sort((a, b) => String(b.fixture.date ?? "").localeCompare(String(a.fixture.date ?? "")));
      for (const { fixture } of finals) {
        const result = fixture.result;
        const homeGoals = Number(result.homeGoals);
        const awayGoals = Number(result.awayGoals);
        if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;
        let winnerId: string | null = homeGoals > awayGoals ? fixture.homeId : awayGoals > homeGoals ? fixture.awayId : null;
        if (!winnerId && result.extraTime) {
          const homeExtra = Number(result.extraTime.homeGoals);
          const awayExtra = Number(result.extraTime.awayGoals);
          if (Number.isFinite(homeExtra) && Number.isFinite(awayExtra) && homeExtra !== awayExtra) {
            winnerId = homeExtra > awayExtra ? fixture.homeId : fixture.awayId;
          }
        }
        if (!winnerId && result.penalties) {
          const homePens = Number(result.penalties.homeGoals);
          const awayPens = Number(result.penalties.awayGoals);
          if (Number.isFinite(homePens) && Number.isFinite(awayPens) && homePens !== awayPens) {
            winnerId = homePens > awayPens ? fixture.homeId : fixture.awayId;
          }
        }
        if (winnerId) {
          winner = winnerId;
          break;
        }
      }
    }
    cupWinnersByAssociation[association.id] = winner;
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

function repairStoredCupPriority(
  save: EuropeanQualificationSave,
  stored: EuropeanQualificationSnapshot,
): EuropeanQualificationSnapshot {
  const input = buildQualificationInput(save);
  const ucl = [...stored.ucl];
  const uel = [...stored.uel];
  const uecl = [...stored.uecl];
  const majorLeagueIds = new Set(["laliga", "premier", "seriea", "bundesliga", "ligue1"]);
  // Una clasificación guardada corresponde a la temporada actual; sus plazas
  // se determinan con la copa de la temporada anterior. `save.cupChampion` y
  // `cupFixtures` ya pertenecen a la copa actual (y suelen estar vacíos tras el
  // cambio de temporada), por lo que para reparar partidas antiguas usamos el
  // archivo de la campaña previa en vez de promocionar al campeón equivocado.
  const currentStartYear = getSeasonStartYear(save.season);
  const previousSeason = `${currentStartYear - 1}/${String(currentStartYear % 100).padStart(2, "0")}`;
  const previousArchive = save.saveId ? getSeasonArchive(save.saveId, previousSeason) : null;
  const archivedCupWinnerByLeague = new Map<string, string>();
  for (const cup of previousArchive?.domesticCupChampions ?? []) {
    if (majorLeagueIds.has(cup.leagueId) && typeof cup.teamId === "string" && cup.teamId) {
      archivedCupWinnerByLeague.set(cup.leagueId, cup.teamId);
    }
  }
  for (const cup of previousArchive?.domesticCupDetails ?? []) {
    if (majorLeagueIds.has(cup.leagueId) && typeof cup.championId === "string" && cup.championId
      && !archivedCupWinnerByLeague.has(cup.leagueId)) {
      archivedCupWinnerByLeague.set(cup.leagueId, cup.championId);
    }
  }
  const cupWinners = [...new Set([...archivedCupWinnerByLeague.values()])];
  const cupWinnerSet = new Set(cupWinners);

  for (const winner of cupWinners) {
    // Champions always wins the tie-break: a cup winner already in UCL cannot
    // also appear in Europa/Conference.
    if (ucl.includes(winner)) {
      const uelIndex = uel.indexOf(winner);
      if (uelIndex >= 0) uel.splice(uelIndex, 1);
      const ueclIndex = uecl.indexOf(winner);
      if (ueclIndex >= 0) uecl.splice(ueclIndex, 1);
      continue;
    }
    if (uel.includes(winner)) {
      const lowerIndex = uecl.indexOf(winner);
      if (lowerIndex >= 0) uecl.splice(lowerIndex, 1);
      continue;
    }

    // Cup victory upgrades a lower league-based place (including Conference)
    // to Europa. If the snapshot was made by an older rules version, promote
    // the cup winner and cascade the displaced league place into Conference.
    const lowerIndex = uecl.indexOf(winner);
    if (lowerIndex >= 0) uecl.splice(lowerIndex, 1);
    let displaced: string | undefined;
    for (let i = uel.length - 1; i >= 0; i -= 1) {
      const candidate = uel[i];
      if (!cupWinnerSet.has(candidate) && !ucl.includes(candidate)) {
        displaced = candidate;
        uel.splice(i, 1);
        break;
      }
    }
    if (!displaced && uel.length >= 36) {
      displaced = uel.pop();
    }
    if (!uel.includes(winner)) uel.push(winner);
    if (displaced && !ucl.includes(displaced) && !uel.includes(displaced) && !uecl.includes(displaced)) {
      // If the winner was coming from Conference, the removal above opened a
      // Conference slot. Otherwise cascade the displaced Europa team down and
      // free the lowest Conference place to keep exactly 36 teams per league.
      if (lowerIndex < 0 && uecl.length >= 36) uecl.pop();
      uecl.push(displaced);
    }
  }

  // Guardar una competición europea por club incluso en snapshots antiguos
  // que pudieran contener duplicados. La prioridad siempre es Champions > Europa
  // League > Conference; si quitamos una entrada duplicada, la plaza se rellena
  // desde el cálculo de clasificación actual para mantener 36 participantes.
  const recalculated = calculateEuropeanQualification(input);
  const seen = new Set<string>();
  const repairedLists: Record<EuropeanCompetitionKey, string[]> = { ucl: [], uel: [], uecl: [] };
  for (const competition of ["ucl", "uel", "uecl"] as const) {
    const current = competition === "ucl" ? ucl : competition === "uel" ? uel : uecl;
    for (const teamId of current) {
      if (!teamId || seen.has(teamId)) continue;
      repairedLists[competition].push(teamId);
      seen.add(teamId);
    }
    for (const teamId of recalculated[competition]) {
      if (repairedLists[competition].length >= 36) break;
      if (seen.has(teamId)) continue;
      repairedLists[competition].push(teamId);
      seen.add(teamId);
    }
  }
  return { ...stored, ...repairedLists };
}

export function getEuropeanParticipantsForSave(
  save: EuropeanQualificationSave,
  competition: EuropeanCompetitionKey,
): string[] {
  const seasonStartYear = getSeasonStartYear(save.season);
  const stored = save.europeanQualification;
  if (stored && stored.seasonStartYear === seasonStartYear
      && isValidParticipantList(stored.ucl) && isValidParticipantList(stored.uel) && isValidParticipantList(stored.uecl)) {
    return [...repairStoredCupPriority(save, stored)[competition]];
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

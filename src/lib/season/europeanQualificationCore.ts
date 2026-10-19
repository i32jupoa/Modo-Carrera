/**
 * Núcleo puro de clasificación europea y coeficientes de asociaciones.
 * No importa React, el store ni APIs del navegador; recibe datos planos para
 * poder testearlo headless y reutilizarlo durante la transición de temporada.
 */
export type EuropeanAssociation = {
  id: string;
  name: string;
  topLeagueId: string;
};

export type EuropeanClub = {
  id: string;
  name: string;
  leagueId: string;
  associationId: string | null;
  strength: number;
};

export type EuropeanStanding = {
  teamId: string;
  points?: number;
  gd?: number;
  gf?: number;
  won?: number;
  played?: number;
};

export type EuropeanFixtureResult = {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  result?: unknown;
};

export type EuropeanCoefficientSeason = {
  seasonStartYear: number;
  pointsByAssociation: Record<string, number>;
};

export type EuropeanQualificationInput = {
  seasonStartYear: number;
  associations: readonly EuropeanAssociation[];
  clubs: readonly EuropeanClub[];
  standings?: Readonly<Record<string, readonly EuropeanStanding[] | undefined>>;
  cupWinnersByAssociation?: Readonly<Record<string, string | null | undefined>>;
  champions?: { ucl?: string | null; uel?: string | null; uecl?: string | null };
  coefficientHistory?: readonly EuropeanCoefficientSeason[];
  results?: Readonly<Record<"ucl" | "uel" | "uecl", readonly EuropeanFixtureResult[] | undefined>>;
  participants?: Readonly<Record<"ucl" | "uel" | "uecl", readonly string[] | undefined>>;
};

export type EuropeanQualification = {
  seasonStartYear: number;
  ucl: string[];
  uel: string[];
  uecl: string[];
  associationRanking: string[];
  associationScores: Record<string, number>;
};

export type EuropeanCoefficientCalculation = {
  seasonStartYear: number;
  pointsByAssociation: Record<string, number>;
  completedMatches: number;
};

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function clubStrength(club: EuropeanClub | undefined): number {
  return club && Number.isFinite(club.strength) ? club.strength : 0;
}

function rowsForAssociation(
  association: EuropeanAssociation,
  input: EuropeanQualificationInput,
  clubsById: ReadonlyMap<string, EuropeanClub>,
): EuropeanClub[] {
  const leagueClubs = input.clubs.filter(
    (club) => club.associationId === association.id && club.leagueId === association.topLeagueId,
  );
  const validIds = new Set(leagueClubs.map((club) => club.id));
  const rows = (input.standings?.[association.topLeagueId] ?? []).filter((row) => validIds.has(row.teamId));
  const rowRank = new Map(rows.map((row, index) => [row.teamId, { row, index }] as const));
  return leagueClubs.slice().sort((a, b) => {
    const ar = rowRank.get(a.id);
    const br = rowRank.get(b.id);
    if (ar && br) {
      const ap = Number(ar.row.points ?? 0);
      const bp = Number(br.row.points ?? 0);
      if (ap !== bp) return bp - ap;
      const agd = Number(ar.row.gd ?? 0);
      const bgd = Number(br.row.gd ?? 0);
      if (agd !== bgd) return bgd - agd;
      const agf = Number(ar.row.gf ?? 0);
      const bgf = Number(br.row.gf ?? 0);
      if (agf !== bgf) return bgf - agf;
      const aw = Number(ar.row.won ?? 0);
      const bw = Number(br.row.won ?? 0);
      if (aw !== bw) return bw - aw;
      return ar.index - br.index;
    }
    if (ar) return -1;
    if (br) return 1;
    return clubStrength(b) - clubStrength(a) || a.id.localeCompare(b.id);
  }).filter((club) => clubsById.has(club.id));
}

function baselineAssociationScore(
  association: EuropeanAssociation,
  input: EuropeanQualificationInput,
): number {
  const clubs = input.clubs
    .filter((club) => club.associationId === association.id && club.leagueId === association.topLeagueId)
    .slice()
    .sort((a, b) => clubStrength(b) - clubStrength(a))
    .slice(0, 5);
  if (clubs.length === 0) return 0;
  // La primera campaña no contiene cinco temporadas históricas oficiales. Este
  // indicador aproximado parte de la fuerza real de los clubes del juego.
  return clubs.reduce((sum, club) => sum + clubStrength(club), 0) / clubs.length / 30;
}

export function rankEuropeanAssociations(input: EuropeanQualificationInput): {
  ranking: string[];
  scores: Record<string, number>;
} {
  const history = (input.coefficientHistory ?? [])
    .slice()
    .sort((a, b) => a.seasonStartYear - b.seasonStartYear)
    .slice(-5);
  const scores: Record<string, number> = {};
  for (const association of input.associations) {
    if (history.length === 0) {
      scores[association.id] = baselineAssociationScore(association, input);
      continue;
    }
    let weightedPoints = 0;
    let totalWeight = 0;
    history.forEach((season, index) => {
      const weight = index + 1;
      weightedPoints += Math.max(0, Number(season.pointsByAssociation[association.id] ?? 0)) * weight;
      totalWeight += weight;
    });
    scores[association.id] = totalWeight > 0 ? weightedPoints / totalWeight : 0;
  }
  const ranking = input.associations
    .slice()
    .sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0) || a.id.localeCompare(b.id))
    .map((association) => association.id);
  return { ranking, scores };
}

export function calculateEuropeanAssociationCoefficient(
  input: EuropeanQualificationInput,
): EuropeanCoefficientCalculation {
  const pointsByAssociation: Record<string, number> = Object.fromEntries(
    input.associations.map((association) => [association.id, 0]),
  );
  const clubIdsByAssociation: Record<string, Set<string>> = Object.fromEntries(
    input.associations.map((association) => [association.id, new Set<string>()]),
  );
  const clubById = new Map(input.clubs.map((club) => [club.id, club] as const));
  let completedMatches = 0;

  for (const competition of ["ucl", "uel", "uecl"] as const) {
    const participatingIds = unique([
      ...(input.participants?.[competition] ?? []),
      ...((input.results?.[competition] ?? []).flatMap((fixture) => [fixture.homeId, fixture.awayId])),
    ]);
    for (const teamId of participatingIds) {
      const associationId = clubById.get(teamId)?.associationId;
      if (associationId && clubIdsByAssociation[associationId]) clubIdsByAssociation[associationId].add(teamId);
    }

    for (const fixture of input.results?.[competition] ?? []) {
      if (!fixture || !fixture.homeId || !fixture.awayId) continue;
      if (!Number.isFinite(fixture.homeGoals) || !Number.isFinite(fixture.awayGoals)) continue;
      completedMatches += 1;
      const homeAssociation = clubById.get(fixture.homeId)?.associationId;
      const awayAssociation = clubById.get(fixture.awayId)?.associationId;
      if (fixture.homeGoals > fixture.awayGoals) {
        if (homeAssociation && pointsByAssociation[homeAssociation] !== undefined) pointsByAssociation[homeAssociation] += 2;
      } else if (fixture.homeGoals < fixture.awayGoals) {
        if (awayAssociation && pointsByAssociation[awayAssociation] !== undefined) pointsByAssociation[awayAssociation] += 2;
      } else {
        if (homeAssociation && pointsByAssociation[homeAssociation] !== undefined) pointsByAssociation[homeAssociation] += 1;
        if (awayAssociation && pointsByAssociation[awayAssociation] !== undefined) pointsByAssociation[awayAssociation] += 1;
      }
    }
  }

  for (const association of input.associations) {
    const count = clubIdsByAssociation[association.id]?.size ?? 0;
    pointsByAssociation[association.id] = count > 0 ? pointsByAssociation[association.id] / count : 0;
    pointsByAssociation[association.id] = Math.round(pointsByAssociation[association.id] * 1000) / 1000;
  }

  return { seasonStartYear: input.seasonStartYear, pointsByAssociation, completedMatches };
}

export function appendEuropeanCoefficientSeason(
  history: readonly EuropeanCoefficientSeason[] | undefined,
  season: EuropeanCoefficientSeason,
): EuropeanCoefficientSeason[] {
  const deduped = new Map<number, EuropeanCoefficientSeason>();
  for (const item of history ?? []) deduped.set(item.seasonStartYear, item);
  if (!deduped.has(season.seasonStartYear)) deduped.set(season.seasonStartYear, season);
  return [...deduped.values()]
    .sort((a, b) => a.seasonStartYear - b.seasonStartYear)
    .slice(-5)
    .map((item) => ({
      seasonStartYear: item.seasonStartYear,
      pointsByAssociation: { ...item.pointsByAssociation },
    }));
}

function interleavedCandidates(
  ranking: readonly string[],
  candidatesByAssociation: ReadonlyMap<string, readonly EuropeanClub[]>,
): string[] {
  const output: string[] = [];
  const maximumDepth = Math.max(0, ...[...candidatesByAssociation.values()].map((clubs) => clubs.length));
  for (let depth = 0; depth < maximumDepth; depth += 1) {
    for (const associationId of ranking) {
      const club = candidatesByAssociation.get(associationId)?.[depth];
      if (club) output.push(club.id);
    }
  }
  return unique(output);
}

/**
 * Asignación directa a fase de liga: 36 clubes por competición y sin repetir
 * equipos entre Champions, Europa League y Conference League. Las plazas son
 * una adaptación determinista del acceso UEFA, sin rondas previas.
 */
export function calculateEuropeanQualification(input: EuropeanQualificationInput): EuropeanQualification {
  const clubsById = new Map(input.clubs.map((club) => [club.id, club] as const));
  const associationInfo = new Map(input.associations.map((association) => [association.id, association] as const));
  const { ranking, scores } = rankEuropeanAssociations(input);
  const candidatesByAssociation = new Map<string, EuropeanClub[]>();
  for (const association of input.associations) {
    candidatesByAssociation.set(association.id, rowsForAssociation(association, input, clubsById));
  }

  const allLeagueCandidates = interleavedCandidates(ranking, candidatesByAssociation);
  const globallyUsed = new Set<string>();
  const resolveExisting = (teamId: string | null | undefined): string | null =>
    teamId && clubsById.has(teamId) ? teamId : null;
  const sortedByStrength = (ids: readonly string[]) => unique(ids)
    .filter((id) => clubsById.has(id))
    .sort((a, b) => clubStrength(clubsById.get(b)) - clubStrength(clubsById.get(a)) || a.localeCompare(b));

  const addFromAssociationSlots = (
    destination: string[],
    slotsForRank: (rank: number) => number,
    excluded: ReadonlySet<string>,
  ) => {
    ranking.forEach((associationId, index) => {
      if (destination.length >= 36) return;
      const requestedSlots = slotsForRank(index + 1);
      if (requestedSlots <= 0) return;
      const association = associationInfo.get(associationId);
      const alreadyQualifiedFromLeague = association
        ? destination.filter((id) => {
            const club = clubsById.get(id);
            return club?.associationId === associationId && club.leagueId === association.topLeagueId;
          }).length
        : 0;
      const slotsStillNeeded = Math.max(0, requestedSlots - alreadyQualifiedFromLeague);
      if (slotsStillNeeded === 0) return;
      const source = candidatesByAssociation.get(associationId) ?? [];
      let added = 0;
      for (const club of source) {
        if (destination.length >= 36 || added >= slotsStillNeeded) break;
        if (excluded.has(club.id) || destination.includes(club.id)) continue;
        destination.push(club.id);
        added += 1;
      }
    });
  };
  const fillTo36 = (destination: string[], candidates: readonly string[], excluded: ReadonlySet<string>) => {
    for (const id of candidates) {
      if (destination.length >= 36) break;
      if (!excluded.has(id) && !destination.includes(id) && clubsById.has(id)) destination.push(id);
    }
    // Fallback includes any European registered club whose association has a
    // valid top-tier mapping. It is not allowed to introduce non-UEFA leagues.
    if (destination.length < 36) {
      const fallback = input.clubs
        .filter((club) => club.associationId && associationInfo.has(club.associationId))
        .slice()
        .sort((a, b) => clubStrength(b) - clubStrength(a) || a.id.localeCompare(b.id));
      for (const club of fallback) {
        if (destination.length >= 36) break;
        if (!excluded.has(club.id) && !destination.includes(club.id)) destination.push(club.id);
      }
    }
    if (destination.length !== 36) {
      throw new Error(`No hay suficientes clubes europeos distintos para completar 36 plazas (obtenidos: ${destination.length}).`);
    }
  };

  // Champions League: title holders first, then association league places.
  const ucl: string[] = [];
  for (const champion of [input.champions?.ucl, input.champions?.uel]) {
    const id = resolveExisting(champion);
    if (id && !ucl.includes(id)) ucl.push(id);
  }
  // Los dos coeficientes UEFA más altos reciben una plaza adicional (5.º
  // clasificado), como sucede con los puestos de rendimiento europeo de la vida real.
  addFromAssociationSlots(ucl, (rank) => rank <= 2 ? 5 : rank <= 4 ? 4 : rank <= 6 ? 3 : rank <= 10 ? 2 : 1, new Set(ucl));
  fillTo36(ucl, allLeagueCandidates, new Set());
  const uclParticipants = sortedByStrength(ucl);
  for (const id of uclParticipants) globallyUsed.add(id);

  // Europa League: Conference champion plus winners of domestic cups in the
  // five major leagues. UCL has absolute priority: a cup winner already in UCL
  // stays there and cannot appear in UEL or UECL. Otherwise winning the cup
  // upgrades a lower league-place qualification (including Conference) to UEL.
  const uel: string[] = [];
  const ueclChampion = resolveExisting(input.champions?.uecl);
  if (ueclChampion && !globallyUsed.has(ueclChampion)) uel.push(ueclChampion);
  const majorDomesticCupAssociations = new Set(
    input.associations
      .filter((association) => ["laliga", "premier", "seriea", "bundesliga", "ligue1"].includes(association.topLeagueId))
      .map((association) => association.id),
  );
  const cupWinners = ranking
    .filter((associationId) => majorDomesticCupAssociations.has(associationId))
    .map((associationId) => resolveExisting(input.cupWinnersByAssociation?.[associationId]))
    .filter((id): id is string => Boolean(id));
  for (const id of cupWinners) {
    if (uel.length >= 36) break;
    if (!globallyUsed.has(id) && !uel.includes(id)) uel.push(id);
  }
  addFromAssociationSlots(uel, (rank) => rank <= 5 ? 3 : rank <= 10 ? 2 : 1, new Set([...globallyUsed, ...uel]));
  fillTo36(uel, allLeagueCandidates, new Set(globallyUsed));
  const uelParticipants = sortedByStrength(uel);
  for (const id of uelParticipants) globallyUsed.add(id);

  // Conference League: the next eligible league places after Champions and
  // Europa, cascaded by association ranking and then by league position.
  const uecl: string[] = [];
  addFromAssociationSlots(uecl, (rank) => rank <= 6 ? 3 : rank <= 12 ? 2 : 1, globallyUsed);
  const remainingLeagueCandidates = allLeagueCandidates.filter((id) => !globallyUsed.has(id));
  fillTo36(uecl, remainingLeagueCandidates, globallyUsed);
  const ueclParticipants = sortedByStrength(uecl);

  const allSelected = [...uclParticipants, ...uelParticipants, ...ueclParticipants];
  if (allSelected.length !== 108 || new Set(allSelected).size !== 108) {
    throw new Error("La clasificación europea debe producir 108 plazas distintas sin solapamientos.");
  }
  for (const list of [uclParticipants, uelParticipants, ueclParticipants]) {
    if (list.length !== 36 || new Set(list).size !== 36) {
      throw new Error("Cada competición europea debe tener 36 clubes distintos.");
    }
  }

  return {
    seasonStartYear: input.seasonStartYear,
    ucl: uclParticipants,
    uel: uelParticipants,
    uecl: ueclParticipants,
    associationRanking: ranking,
    associationScores: scores,
  };
}

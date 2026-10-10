import { teamById, type Team } from "@/data/teams";
import type { SaveGame } from "@/lib/store";
import type { Standing, Fixture } from "@/lib/season";
import { listTransfers } from "@/lib/transfers/TransferHistory";
import { getPlayer } from "@/lib/transfers/PlayerIndex";
import { detectFixtureFacts, detectStandingsFacts, snapshotStandings, type CoreFixture, type CoreStanding } from "./NewsDetectorCore";
import { createEmptyNewsState, mergeNewsState, normalizeNewsState, type NewsEvent, type NewsState } from "./NewsEvents";

function allFixtures(save: SaveGame): Fixture[] {
  const out: Fixture[] = [];
  for (const fixtures of Object.values(save.fixtures ?? {})) out.push(...(fixtures ?? []));
  for (const fixtures of Object.values(save.cupFixtures ?? {})) {
    if (Array.isArray(fixtures)) out.push(...fixtures);
  }
  out.push(...(save.uclFixtures ?? []));
  out.push(...(save.uelFixtures ?? []));
  out.push(...(save.ueclFixtures ?? []));
  const europeFromState = [save.ucl, save.uel, save.uecl]
    .filter(Boolean)
    .flatMap((state) => {
      const legacyFixtures = (state as (typeof state & { fixtures?: Fixture[] }) | null)?.fixtures;
      return Array.isArray(legacyFixtures) ? legacyFixtures : [];
    });
  out.push(...(europeFromState as Fixture[]));
  const seen = new Set<string>();
  return out.filter((fixture) => {
    if (!fixture?.id || seen.has(fixture.id)) return false;
    seen.add(fixture.id);
    return true;
  });
}

function teamStrength(teamId: string): number {
  const team = teamById(teamId) as Team | undefined;
  if (!team) return 0;
  return (Number(team.att) + Number(team.mid) + Number(team.def)) / 3;
}

function teamName(teamId: string): string {
  return teamById(teamId)?.name ?? teamId;
}

function toCoreStandings(record: Record<string, Standing[]>): Record<string, CoreStanding[]> {
  const out: Record<string, CoreStanding[]> = {};
  for (const [leagueId, rows] of Object.entries(record ?? {})) {
    out[leagueId] = rows.map((row) => ({
      teamId: row.teamId,
      played: row.played,
      points: row.points,
      gd: row.gd,
    }));
  }
  return out;
}

function addEuropeanStandings(save: SaveGame, target: Record<string, CoreStanding[]>): void {
  for (const [competition, state] of [["ucl", save.ucl], ["uel", save.uel], ["uecl", save.uecl]] as const) {
    if (!state?.table || !Array.isArray(state.table)) continue;
    target[competition] = state.table.map((row) => ({
      teamId: row.teamId,
      played: row.played,
      points: row.points,
      gd: row.gd,
    }));
  }
}


function buildNewsScanSignature(save: SaveGame, playerState?: NewsPlayerState): string {
  const fixtures = allFixtures(save);
  const played = fixtures.filter((fixture) => !!fixture.result);
  const currentDate = playerState?.currentDate ?? "";
  const injuryCount = Object.values(playerState?.stats ?? {}).filter((stats) => stats.injuryStartDate === currentDate).length;
  const allStandings = toCoreStandings(save.standings ?? {});
  addEuropeanStandings(save, allStandings);
  const leaderBits = Object.entries(allStandings)
    .map(([league, rows]) => {
      const sorted = [...rows].sort((a, b) => b.points - a.points || b.gd - a.gd);
      const top = sorted[0];
      return `${league}:${top?.teamId ?? ""}:${top?.points ?? 0}:${top?.gd ?? 0}`;
    })
    .sort()
    .join("|");
  return `${currentDate}|${played.length}|${listTransfers().length}|${injuryCount}|${leaderBits}`;
}

function enrichTopLeagueRelevance(event: NewsEvent): NewsEvent {
  const league = event.entities.leagueId;
  const topLeagues = new Set(["premier", "laliga", "seriea", "bundesliga", "ligue1"]);
  const bonus = event.category === "europa" ? 8 : topLeagues.has(league ?? "") ? 5 : 0;
  return bonus ? { ...event, relevance: Math.min(100, event.relevance + bonus) } : event;
}

function isRecentFact(date: string | undefined, currentDate: string, maxDays = 7): boolean {
  if (!date) return false;
  const timestamp = Date.parse(`${date}T12:00:00Z`);
  const currentTimestamp = Date.parse(`${currentDate}T12:00:00Z`);
  if (!Number.isFinite(timestamp) || !Number.isFinite(currentTimestamp)) return date >= currentDate;
  return timestamp >= currentTimestamp - maxDays * 86_400_000 && timestamp <= currentTimestamp + 86_400_000;
}

function getExistingFactIds(state: NewsState): Set<string> {
  return new Set(state.processedFactIds);
}

function initialNewsState(save: SaveGame): NewsState {
  const base = createEmptyNewsState();
  const fixtures = allFixtures(save);
  const processed = fixtures.filter((fixture) => !!fixture.result).map((fixture) => `match:${fixture.id}`);
  for (const record of listTransfers()) processed.push(`transfer:${record.id}`);
  base.processedFactIds = processed.slice(-4000);
  const initialStandings = toCoreStandings(save.standings ?? {});
  addEuropeanStandings(save, initialStandings);
  base.standingsSnapshot = snapshotStandings(initialStandings);
  return base;
}

function transferEvent(record: ReturnType<typeof listTransfers>[number], userTeamId: string, date: string): NewsEvent {
  const player = getPlayer(record.playerId);
  const teamIds = [record.fromClubId, record.toClubId].filter((id): id is string => !!id);
  const userInvolved = teamIds.includes(userTeamId);
  const fee = Number(record.fee) || 0;
  const previousRecordFee = Math.max(0, ...listTransfers().filter((candidate) => candidate.id !== record.id).map((candidate) => Number(candidate.fee) || 0));
  const isTransferRecord = fee > 0 && fee > previousRecordFee;
  return {
    id: `transfer:${record.id}`,
    date: record.date || date,
    type: "transfer",
    category: "mercado",
    relevance: Math.min(100, 45 + Math.min(35, fee / 4_000_000) + (player && Number((player as unknown as { ovr?: number; rating?: number }).ovr ?? (player as unknown as { rating?: number }).rating ?? 0) >= 88 ? 12 : 0) + (userInvolved ? 18 : 0)),
    entities: { teamIds, playerIds: [record.playerId], leagueId: teamById(record.toClubId)?.league },
    data: {
      scorerNames: [record.playerName],
      fromClubId: record.fromClubId,
      fromClubName: record.fromClubId ? teamName(record.fromClubId) : undefined,
      toClubId: record.toClubId,
      toClubName: teamName(record.toClubId),
      transferFee: fee,
      transferType: record.type,
      wage: record.wage,
      isTransferRecord,
      previousRecordFee: previousRecordFee || undefined,
    },
  };
}

export interface NewsBuildResult {
  state: NewsState;
  events: NewsEvent[];
}

export interface NewsPlayerState {
  currentDate?: string;
  stats?: Record<string, {
    injuryStartDate?: string;
    injuryDurationDays?: number;
    injuryType?: string;
    injuryArea?: string;
  }>;
  getSimPlayer?: (playerId: string) => {
    id: string;
    name: string;
    rating: number;
    teamId: string;
  } | undefined;
}

/**
 * Compara la partida con el bloque mínimo persistido por noticias.
 *
 * El primer arranque de una partida antigua sólo crea el punto de partida y
 * no publica noticias históricas. A partir de ahí sólo entran hechos nuevos.
 */
export function detectNews(save: SaveGame, rawState: unknown, playerState?: NewsPlayerState): NewsBuildResult {
  const hasState = !!rawState;
  let state = hasState ? normalizeNewsState(rawState) : initialNewsState(save);
  const currentDate = playerState?.currentDate || new Date().toISOString().slice(0, 10);
  const scanSignature = buildNewsScanSignature(save, playerState);
  if (hasState && state.scanSignature === scanSignature) return { state, events: [] };
  const processed = getExistingFactIds(state);
  const currentStandings = toCoreStandings(save.standings ?? {});
  addEuropeanStandings(save, currentStandings);
  const previousStandings = Object.fromEntries(
    Object.entries(state.standingsSnapshot ?? {}).map(([league, rows]) => [
      league,
      rows.map((row) => ({ teamId: row.teamId, played: 0, points: row.points, gd: row.gd })),
    ]),
  ) as Record<string, CoreStanding[]>;
  const events: NewsEvent[] = [];
  const fixtures = allFixtures(save);

  for (const fixture of fixtures) {
    if (!fixture.result || !isRecentFact(fixture.date, currentDate)) continue;
    const fixtureEventId = `match:${fixture.id}`;
    if (processed.has(fixtureEventId)) continue;

    const coreFixture: CoreFixture = {
      id: fixture.id,
      date: fixture.date,
      matchday: fixture.matchday,
      competition: fixture.competition,
      league: fixture.league,
      round: fixture.round,
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      europeanCompetition: fixture.europeanCompetition,
      result: fixture.result,
    };
    const rawFacts = detectFixtureFacts(
      coreFixture,
      currentDate,
      previousStandings,
      currentStandings,
      (teamId) => ({ value: teamStrength(teamId) }),
      save.myTeamId,
    );
    const facts = rawFacts.map((fact) => ({
      ...fact,
      data: {
        ...fact.data,
        homeName: teamName(fixture.homeId),
        awayName: teamName(fixture.awayId),
        newLeaderName: fact.data.newLeaderId ? teamName(fact.data.newLeaderId) : undefined,
        previousLeaderName: fact.data.previousLeaderId ? teamName(fact.data.previousLeaderId) : undefined,
        competition: fixture.europeanCompetition ?? fixture.competition,
      },
    }));
    const enrichedFacts = facts.map((fact) => enrichTopLeagueRelevance(fact));
    if ((fixture.competition === "cup" || fixture.europeanCompetition) && fixture.round && /final|semi|quarter|round of 16|octavos|cuartos|semifinal/i.test(fixture.round)) {
      const homeGoals = fixture.result.homeGoals;
      const awayGoals = fixture.result.awayGoals;
      enrichedFacts.push({
        id: `competition-result:${fixture.id}`,
        date: fixture.date ?? currentDate,
        type: "competition_result",
        category: fixture.europeanCompetition ? "europa" : "liga",
        relevance: Math.min(100, 70 + (fixture.round.toLowerCase().includes("final") ? 20 : 8) + ((fixture.homeId === save.myTeamId || fixture.awayId === save.myTeamId) ? 10 : 0)),
        entities: { teamIds: [fixture.homeId, fixture.awayId], competitionId: fixture.europeanCompetition, leagueId: fixture.league },
        data: {
          homeId: fixture.homeId,
          awayId: fixture.awayId,
          result: `${homeGoals}-${awayGoals}`,
          homeGoals,
          awayGoals,
          round: fixture.round,
          competition: fixture.europeanCompetition ?? fixture.competition,
          homeName: teamName(fixture.homeId),
          awayName: teamName(fixture.awayId),
        },
      });
    }
    events.push(...enrichedFacts.filter((fact) => !processed.has(fact.id)));
    processed.add(fixtureEventId);
    for (const fact of enrichedFacts) processed.add(fact.id);
  }

  const standingsFacts = detectStandingsFacts(previousStandings, currentStandings, currentDate, save.myTeamId).map((fact) => ({
    ...enrichTopLeagueRelevance(fact),
    data: {
      ...fact.data,
      newLeaderName: fact.data.newLeaderId ? teamName(fact.data.newLeaderId) : undefined,
      previousLeaderName: fact.data.previousLeaderId ? teamName(fact.data.previousLeaderId) : undefined,
      teamName: fact.data.teamId ? teamName(fact.data.teamId) : undefined,
    },
  }));

  // Añadimos el resultado real del anterior líder cuando está disponible en la
  // misma ventana reciente; nunca fabricamos una consecuencia a partir de datos
  // que no estén en los fixtures guardados.
  for (const fact of standingsFacts) {
    if (!fact.data.previousLeaderId) continue;
    const rivalFixture = fixtures.find((fixture) =>
      fixture.result &&
      isRecentFact(fixture.date, currentDate) &&
      fixture.league === fact.entities.leagueId &&
      (fixture.europeanCompetition === fact.entities.competitionId || !fact.entities.competitionId) &&
      (fixture.homeId === fact.data.previousLeaderId || fixture.awayId === fact.data.previousLeaderId),
    );
    if (rivalFixture?.result) {
      const homeGoals = rivalFixture.result.homeGoals;
      const awayGoals = rivalFixture.result.awayGoals;
      fact.data.directRivalResult = `${homeGoals}-${awayGoals}`;
    }
  }
  for (const fact of standingsFacts) {
    if (!processed.has(fact.id)) events.push(fact);
    processed.add(fact.id);
  }

  for (const record of listTransfers()) {
    const id = `transfer:${record.id}`;
    if (processed.has(id) || !isRecentFact(record.date, currentDate)) continue;
    events.push(transferEvent(record, save.myTeamId, currentDate));
    processed.add(id);
  }

  // Lesiones registradas fuera de un partido también están disponibles en el
  // estado persistido de jugadores. Se limitan a las lesiones que tienen fecha
  // explícita, evitando inferencias sobre estados antiguos.
  for (const [playerId, stats] of Object.entries(playerState?.stats ?? {})) {
    const startDate = stats.injuryStartDate;
    if (!startDate || startDate !== currentDate) continue;
    const id = `injury-state:${playerId}:${startDate}`;
    if (processed.has(id)) continue;
    const player = playerState?.getSimPlayer?.(playerId);
    events.push({
      id,
      date: startDate,
      type: "injury",
      category: "jugadores",
      relevance: Math.min(100, 50 + Math.min(30, Number(stats.injuryDurationDays ?? 0) / 4) + (player && Number((player as unknown as { ovr?: number; rating?: number }).ovr ?? (player as unknown as { rating?: number }).rating ?? 0) >= 88 ? 10 : 0)),
      entities: { playerIds: [playerId], teamIds: player?.teamId ? [player.teamId] : [] },
      data: {
        scorerNames: [player?.name ?? playerId],
        durationDays: stats.injuryDurationDays,
        injuryType: stats.injuryType,
        bodyPart: stats.injuryArea,
      },
    });
    processed.add(id);
  }

  const ranked = [...events].sort((a, b) => b.relevance - a.relevance || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const selected: NewsEvent[] = [];
  const typeCount = new Map<NewsEvent["type"], number>();
  const categoryCount = new Map<NewsEvent["category"], number>();
  const leagueCount = new Map<string, number>();

  for (const event of ranked) {
    const typeCountValue = typeCount.get(event.type) ?? 0;
    const categoryCountValue = categoryCount.get(event.category) ?? 0;
    const previous = selected[selected.length - 1];
    const eventLeague = event.entities.leagueId ?? event.entities.competitionId ?? "unknown";
    const eventLeagueCount = leagueCount.get(eventLeague) ?? 0;
    if (typeCountValue >= 4 || categoryCountValue >= 4 || eventLeagueCount >= 3) continue;
    if (previous && previous.category === event.category && selected.length < 8) continue;
    selected.push(event);
    typeCount.set(event.type, typeCountValue + 1);
    categoryCount.set(event.category, categoryCountValue + 1);
    leagueCount.set(eventLeague, eventLeagueCount + 1);
    if (selected.length >= 12) break;
  }

  // Los hechos descartados por relevancia siguen marcados como procesados,
  // por lo que no reaparecerán al guardar/cargar la misma jornada.
  state = mergeNewsState(state, selected);
  state.processedFactIds = Array.from(new Set([...state.processedFactIds, ...processed, ...events.map((event) => event.id)])).slice(-4000);
  state.standingsSnapshot = snapshotStandings(currentStandings);
  state.scanSignature = scanSignature;

  return { state, events: selected };
}

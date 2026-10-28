import { getSaveItem, listSaveKeys, setSaveItem, removeSaveItem, flushSaveStorage } from "../saveStorage.ts";
import type { SaveGame } from "../store";
import type { RetiredPlayerRecord } from "./retirements";
import type { PromotionRelegationResult } from "./promotionRelegationCore";

export type SeasonHistoryLeague = {
  leagueId: string;
  championId: string | null;
  table: Array<{
    teamId: string;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    gd: number;
    points: number;
    /** Last five league results from the archived season, oldest to newest. */
    form?: Array<"W" | "D" | "L">;
  }>;
};

export type ArchivedMatch = {
  id: string;
  leagueId: string;
  matchday: number;
  round: string | null;
  date: string | null;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  homePenalties?: number;
  awayPenalties?: number;
  extraTimeHomeGoals?: number;
  extraTimeAwayGoals?: number;
};

export type ArchivedSeasonTransfer = {
  id: string;
  date: string;
  playerId: string;
  playerName: string;
  fromClubId: string | null;
  toClubId: string;
  fromLeague?: string | null;
  toLeague?: string | null;
  fee: number;
  type: string;
};

export type ArchivedEuropeanCompetition = {
  competition: "ucl" | "uel" | "uecl";
  championId: string | null;
  leaguePhaseTable?: Array<{
    teamId: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    gd: number;
    points: number;
  }>;
  fixtures: ArchivedMatch[];
};

export type SeasonArchiveAwardWinner = {
  category: string;
  playerId: string | null;
  playerName: string;
};

export type PlayerSeasonArchiveRecord = {
  playerId: string;
  playerName: string;
  clubId: string | null;
  goals: number;
  assists: number;
  appearances: number;
  /** Trophies attributed to this player's club in this season. */
  trophies?: string[];
  /** Snapshot data used by the archived team of the season. */
  positions?: string[];
  ovr?: number;
};

export type SeasonArchiveElevenPlayer = {
  playerId: string;
  playerName: string;
  clubId: string | null;
  slot: "GK" | "DEF" | "MID" | "FWD";
  position: string;
  ovr: number;
  goals: number;
  assists: number;
  appearances: number;
};

export type SeasonArchive = {
  version: 1;
  saveId: string;
  season: string;
  archivedAt: string;
  /** Snapshot of the user's club/campaign context at the time the season closed. */
  myTeamId?: string;
  myLeague?: string;
  myFinalPosition?: number | null;
  /** Optional additions keep archives created by older versions readable. */
  awardWinners?: SeasonArchiveAwardWinner[];
  /** Compact records only for players who appeared or recorded a contribution. */
  playerSeasonRecords?: PlayerSeasonArchiveRecord[];
  /** Best performers by position from the finished season; optional for old archives. */
  teamOfSeason?: SeasonArchiveElevenPlayer[];
  /** Most notable completed transfers during the archived campaign. */
  featuredTransfers?: Array<{
    id: string;
    date: string;
    playerId: string;
    playerName: string;
    fromClubId: string | null;
    toClubId: string;
    fee: number;
    type: string;
  }>;
  /** Compact full-market snapshot, capped to keep long-running saves bounded. */
  seasonTransfers?: ArchivedSeasonTransfer[];
  /** Finished domestic cup ties, grouped by country/cup. Optional for legacy saves. */
  domesticCupDetails?: Array<{
    leagueId: string;
    championId: string | null;
    fixtures: ArchivedMatch[];
  }>;
  /** European league-phase standings and finished ties from the archived season. */
  europeanCompetitionDetails?: ArchivedEuropeanCompetition[];
  /** Compact financial result for the user club after closing this season. */
  financeSummary?: {
    teamId: string;
    fromLeague: string;
    toLeague: string;
    previousBudget: number;
    nextBudget: number;
    annualRevenue: number;
    promoted: boolean;
    relegated: boolean;
  };
  /** Clubs qualified to each European competition in the following season. */
  nextSeasonEuropeanQualification?: {
    seasonStartYear: number;
    ucl: string[];
    uel: string[];
    uecl: string[];
    associationRanking: string[];
    associationScores: Record<string, number>;
  };
  leagues: SeasonHistoryLeague[];
  domesticCupChampions: Array<{ leagueId: string; teamId: string }>;
  europeanChampions: { ucl: string | null; uel: string | null; uecl: string | null };
  awards: Record<string, string | null>;
  topScorers: Array<{ playerId: string; playerName: string; clubId: string | null; goals: number }>;
  retirements: RetiredPlayerRecord[];
  promotions: Array<{ teamId: string; fromLeague: string; toLeague: string }>;
  relegations: Array<{ teamId: string; fromLeague: string; toLeague: string }>;
};

export type SeasonHistoryIndex = {
  count: number;
  latestSeason: string;
  updatedAt: string;
};

const ARCHIVE_AWARD_LABELS: Record<string, string> = {
  ballonDor: "Balón de Oro",
  goldenBoy: "Golden Boy",
  goldenShoe: "Bota de Oro",
  goldenPass: "Pase de Oro",
  goldenGlove: "Guante de Oro",
  championsBestPlayer: "Mejor jugador Champions",
  europaLeagueBestPlayer: "Mejor jugador Europa League",
  conferenceLeagueBestPlayer: "Mejor jugador Conference League",
};

/** Normalizes award rows for both current archives and earlier v1 archives without player IDs. */
export function getSeasonArchiveAwards(archive: SeasonArchive): SeasonArchiveAwardWinner[] {
  if (archive.awardWinners?.length) return archive.awardWinners;
  return Object.entries(archive.awards ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([category, playerName]) => ({ category: ARCHIVE_AWARD_LABELS[category] ?? category, playerId: null, playerName }));
}

export function seasonArchiveKey(saveId: string, season: string): string {
  return `fcsim:season-history:v1:${saveId}:${encodeURIComponent(season)}`;
}

/** Maximum full transfer rows retained per campaign. Featured transfers remain separately available. */
export const MAX_ARCHIVED_SEASON_TRANSFERS = 2000;

function archiveFinishedFixtures(fixtures: unknown, leagueId: string): ArchivedMatch[] {
  if (!Array.isArray(fixtures)) return [];
  const archived: ArchivedMatch[] = [];
  for (const raw of fixtures as any[]) {
    const result = raw?.result;
    if (!result || !Number.isFinite(Number(result.homeGoals)) || !Number.isFinite(Number(result.awayGoals))) continue;
    if (!raw?.homeId || !raw?.awayId) continue;
    archived.push({
      id: String(raw.id ?? `${leagueId}-${raw.matchday}-${raw.homeId}-${raw.awayId}`),
      leagueId: String(leagueId),
      matchday: Math.max(0, Number(raw.matchday) || 0),
      round: typeof raw.round === "string" && raw.round ? raw.round : null,
      date: typeof raw.date === "string" && raw.date ? raw.date : null,
      homeId: String(raw.homeId),
      awayId: String(raw.awayId),
      homeGoals: Math.max(0, Number(result.homeGoals) || 0),
      awayGoals: Math.max(0, Number(result.awayGoals) || 0),
      ...(result.penalties && Number.isFinite(Number(result.penalties.homeGoals)) && Number.isFinite(Number(result.penalties.awayGoals)) ? {
        homePenalties: Math.max(0, Number(result.penalties.homeGoals)),
        awayPenalties: Math.max(0, Number(result.penalties.awayGoals)),
      } : {}),
      ...(result.extraTime && Number.isFinite(Number(result.extraTime.homeGoals)) && Number.isFinite(Number(result.extraTime.awayGoals)) ? {
        extraTimeHomeGoals: Math.max(0, Number(result.extraTime.homeGoals)),
        extraTimeAwayGoals: Math.max(0, Number(result.extraTime.awayGoals)),
      } : {}),
    });
  }
  return archived.sort((a, b) => a.matchday - b.matchday || String(a.date ?? "").localeCompare(String(b.date ?? "")) || a.id.localeCompare(b.id));
}

export function seasonPositionGroup(positions: readonly string[]): SeasonArchiveElevenPlayer["slot"] | null {
  const codes = positions
    .flatMap((position) => String(position).split(/[\/,|;]/g))
    .map((position) => position.trim().toUpperCase())
    .filter(Boolean);
  if (!codes.length) return null;

  const goalkeeper = new Set(["GK", "POR", "GOALKEEPER", "PT"]);
  const defender = new Set(["DFC", "CB", "DEF", "LD", "LI", "RB", "LB", "RWB", "LWB", "CD", "LCB", "RCB", "RFB", "LFB"]);
  const midfielder = new Set(["MCD", "CDM", "MC", "CM", "MCO", "CAM", "MD", "MI", "RM", "LM", "MID", "DM", "AM", "CMF"]);
  const forward = new Set(["DC", "ST", "CF", "ED", "EI", "RW", "LW", "FWD", "ATT", "SS", "RF", "LF", "LS", "RS", "CS"]);
  const groupFor = (code: string): SeasonArchiveElevenPlayer["slot"] | null =>
    goalkeeper.has(code) ? "GK" : defender.has(code) ? "DEF" : midfielder.has(code) ? "MID" : forward.has(code) ? "FWD" : null;

  // La primera posición es la demarcación principal. No se debe convertir a
  // un extremo en defensa sólo porque tenga una posición alternativa atrás
  // (p. ej. Dembélé ST/MCO/ED o un MCD con DFC como alternativa).
  const primary = groupFor(codes[0]);
  if (primary) return primary;
  for (const code of codes.slice(1)) {
    const fallback = groupFor(code);
    if (fallback) return fallback;
  }
  return null;
}

/** Uses only archived season statistics and player snapshot fields; it does not consult the next season's roster. */
export function buildSeasonTeamOfSeason(records: readonly PlayerSeasonArchiveRecord[]): SeasonArchiveElevenPlayer[] {
  const candidates = records
    .filter((record) => record.playerId && record.playerName && (Number(record.appearances) > 0 || Number(record.goals) > 0 || Number(record.assists) > 0))
    .map((record) => ({
      record,
      slot: seasonPositionGroup(record.positions ?? []),
      score: (Math.max(0, Number(record.ovr) || 0) * 0.5) + (Math.min(45, Math.max(0, Number(record.appearances) || 0)) * 0.35) + (Math.max(0, Number(record.goals) || 0) * 0.55) + (Math.max(0, Number(record.assists) || 0) * 0.35),
    }))
    .sort((a, b) => b.score - a.score || a.record.playerName.localeCompare(b.record.playerName));
  const selected = new Map<string, SeasonArchiveElevenPlayer>();
  const roleOrder: Array<SeasonArchiveElevenPlayer["slot"]> = ["GK", "DEF", "MID", "FWD"];
  const roleCounts: Record<SeasonArchiveElevenPlayer["slot"], number> = { GK: 1, DEF: 4, MID: 3, FWD: 3 };
  for (const slot of roleOrder) {
    for (const candidate of candidates) {
      if (selected.size >= 11 || selected.has(candidate.record.playerId) || candidate.slot !== slot) continue;
      const count = [...selected.values()].filter((player) => player.slot === slot).length;
      if (count >= roleCounts[slot]) break;
      selected.set(candidate.record.playerId, {
        playerId: candidate.record.playerId,
        playerName: candidate.record.playerName,
        clubId: candidate.record.clubId ?? null,
        slot,
        position: (candidate.record.positions ?? []).join("/") || slot,
        ovr: Math.max(0, Number(candidate.record.ovr) || 0),
        goals: Math.max(0, Number(candidate.record.goals) || 0),
        assists: Math.max(0, Number(candidate.record.assists) || 0),
        appearances: Math.max(0, Number(candidate.record.appearances) || 0),
      });
    }
  }
  // Some imported player databases have incomplete position codes. Fill any
  // remaining slots with the best unused eligible players, without duplicating IDs.
  for (const candidate of candidates) {
    if (selected.size >= 11) break;
    if (selected.has(candidate.record.playerId)) continue;
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const player of selected.values()) counts[player.slot] += 1;
    const preferred = candidate.slot;
    const slot = preferred && counts[preferred] < roleCounts[preferred]
      ? preferred
      : preferred
        ? roleOrder.find((role) => counts[role] < roleCounts[role]) ?? preferred
        : (["MID", "FWD", "DEF", "GK"] as const).find((role) => counts[role] < roleCounts[role]) ?? "MID";
    selected.set(candidate.record.playerId, {
      playerId: candidate.record.playerId,
      playerName: candidate.record.playerName,
      clubId: candidate.record.clubId ?? null,
      slot,
      position: (candidate.record.positions ?? []).join("/") || slot,
      ovr: Math.max(0, Number(candidate.record.ovr) || 0),
      goals: Math.max(0, Number(candidate.record.goals) || 0),
      assists: Math.max(0, Number(candidate.record.assists) || 0),
      appearances: Math.max(0, Number(candidate.record.appearances) || 0),
    });
  }
  return [...selected.values()].sort((a, b) => roleOrder.indexOf(a.slot) - roleOrder.indexOf(b.slot) || b.ovr - a.ovr || b.goals - a.goals);
}

function compactArchivedTransfers(transfers: readonly ArchivedSeasonTransfer[]): ArchivedSeasonTransfer[] {
  const normalized = transfers
    .filter((transfer) => transfer && transfer.id && transfer.playerName && transfer.toClubId)
    .map((transfer) => ({
      id: String(transfer.id),
      date: String(transfer.date ?? ""),
      playerId: String(transfer.playerId ?? ""),
      playerName: String(transfer.playerName),
      fromClubId: transfer.fromClubId == null ? null : String(transfer.fromClubId),
      toClubId: String(transfer.toClubId),
      fromLeague: transfer.fromLeague == null ? null : String(transfer.fromLeague),
      toLeague: transfer.toLeague == null ? null : String(transfer.toLeague),
      fee: Math.max(0, Number(transfer.fee) || 0),
      type: String(transfer.type ?? "permanent"),
    }));
  const unique = new Map<string, ArchivedSeasonTransfer>();
  for (const transfer of normalized) unique.set(transfer.id, transfer);
  const all = [...unique.values()];
  if (all.length <= MAX_ARCHIVED_SEASON_TRANSFERS) {
    return all.sort((a, b) => a.date.localeCompare(b.date) || a.playerName.localeCompare(b.playerName));
  }
  // Preserve a mix of the most expensive deals and the latest market activity.
  const chosen = new Map<string, ArchivedSeasonTransfer>();
  for (const transfer of [...all].sort((a, b) => b.fee - a.fee || b.date.localeCompare(a.date)).slice(0, MAX_ARCHIVED_SEASON_TRANSFERS * 0.6)) chosen.set(transfer.id, transfer);
  for (const transfer of [...all].sort((a, b) => b.date.localeCompare(a.date) || b.fee - a.fee)) {
    if (chosen.size >= MAX_ARCHIVED_SEASON_TRANSFERS) break;
    chosen.set(transfer.id, transfer);
  }
  return [...chosen.values()].sort((a, b) => a.date.localeCompare(b.date) || a.playerName.localeCompare(b.playerName));
}

export function buildSeasonArchive(input: {
  saveId: string;
  save: SaveGame;
  awards?: Record<string, string | null>;
  awardWinners?: SeasonArchiveAwardWinner[];
  playerSeasonRecords?: PlayerSeasonArchiveRecord[];
  featuredTransfers?: NonNullable<SeasonArchive["featuredTransfers"]>;
  seasonTransfers?: NonNullable<SeasonArchive["seasonTransfers"]>;
  nextSeasonEuropeanQualification?: SeasonArchive["nextSeasonEuropeanQualification"];
  topScorers?: SeasonArchive["topScorers"];
  retirements?: RetiredPlayerRecord[];
  movement?: PromotionRelegationResult;
  archivedAt?: string;
}): SeasonArchive {
  const { save } = input;
  const teamForm = new Map<string, Array<"W" | "D" | "L">>();
  const leagueFixtures = Object.values(save.fixtures ?? {}).flat()
    .filter((fixture) => fixture?.competition === "league" && fixture.result && Number.isFinite(Number(fixture.result.homeGoals)) && Number.isFinite(Number(fixture.result.awayGoals)))
    .sort((a, b) => Number(a.matchday ?? 0) - Number(b.matchday ?? 0) || String(a.date ?? "").localeCompare(String(b.date ?? "")) || String(a.id).localeCompare(String(b.id)));
  for (const fixture of leagueFixtures) {
    const homeForm = teamForm.get(fixture.homeId) ?? [];
    const awayForm = teamForm.get(fixture.awayId) ?? [];
    const homeGoals = Number(fixture.result!.homeGoals);
    const awayGoals = Number(fixture.result!.awayGoals);
    homeForm.push(homeGoals > awayGoals ? "W" : homeGoals < awayGoals ? "L" : "D");
    awayForm.push(awayGoals > homeGoals ? "W" : awayGoals < homeGoals ? "L" : "D");
    teamForm.set(fixture.homeId, homeForm.slice(-5));
    teamForm.set(fixture.awayId, awayForm.slice(-5));
  }
  const leagues: SeasonHistoryLeague[] = Object.entries(save.standings ?? {}).map(([leagueId, rows]) => {
    const sorted = [...(rows ?? [])].sort((a, b) =>
      Number(b.points ?? 0) - Number(a.points ?? 0) ||
      Number(b.gd ?? 0) - Number(a.gd ?? 0) ||
      Number(b.gf ?? 0) - Number(a.gf ?? 0) ||
      String(a.teamId).localeCompare(String(b.teamId)),
    );
    return {
      leagueId,
      championId: sorted[0]?.teamId ?? null,
      table: sorted.map((row, index) => ({
        teamId: row.teamId,
        position: index + 1,
        played: Number(row.played ?? 0),
        won: Number(row.won ?? 0),
        drawn: Number(row.drawn ?? 0),
        lost: Number(row.lost ?? 0),
        gf: Number(row.gf ?? 0),
        ga: Number(row.ga ?? 0),
        gd: Number(row.gd ?? 0),
        points: Number(row.points ?? 0),
        ...(teamForm.has(row.teamId) ? { form: [...(teamForm.get(row.teamId) ?? [])] } : {}),
      })),
    };
  });
  const myLeague = String(save.myLeague ?? "");
  const myLeagueArchive = leagues.find((league) => league.leagueId === myLeague);
  const myFinalPosition = myLeagueArchive?.table.find((row) => row.teamId === save.myTeamId)?.position ?? null;
  const domesticCupChampions = Object.entries(save.cupChampion ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([leagueId, teamId]) => ({ leagueId, teamId }));
  const europeanChampions = { ucl: save.uclChampion ?? null, uel: save.uelChampion ?? null, uecl: save.ueclChampion ?? null };
  const titlesByClub = new Map<string, string[]>();
  const addTitle = (teamId: string | null | undefined, title: string) => {
    if (!teamId) return;
    const titles = titlesByClub.get(teamId) ?? [];
    titles.push(title);
    titlesByClub.set(teamId, titles);
  };
  for (const league of leagues) addTitle(league.championId, `Liga · ${league.leagueId}`);
  for (const cup of domesticCupChampions) addTitle(cup.teamId, `Copa · ${cup.leagueId}`);
  addTitle(europeanChampions.ucl, "Champions League");
  addTitle(europeanChampions.uel, "Europa League");
  addTitle(europeanChampions.uecl, "Conference League");
  const playerSeasonRecords = (input.playerSeasonRecords ?? []).map((record) => ({
    ...record,
    trophies: record.clubId ? [...(titlesByClub.get(record.clubId) ?? [])] : [],
  }));
  const movements = input.movement?.movements ?? [];
  return {
    version: 1,
    saveId: input.saveId,
    season: save.season,
    archivedAt: input.archivedAt ?? new Date().toISOString(),
    myTeamId: save.myTeamId,
    myLeague,
    myFinalPosition,
    awardWinners: (input.awardWinners ?? Object.entries(input.awards ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
      .map(([category, playerName]) => ({ category, playerId: null, playerName })))
      .filter((winner) => Boolean(winner.playerName)),
    leagues,
    domesticCupChampions,
    europeanChampions,
    playerSeasonRecords,
    teamOfSeason: buildSeasonTeamOfSeason(playerSeasonRecords),
    seasonTransfers: compactArchivedTransfers(input.seasonTransfers ?? input.featuredTransfers ?? []),
    domesticCupDetails: Object.entries(save.cupFixtures ?? {})
      .filter(([leagueId, fixtures]) => !leagueId.endsWith("_structure") && Array.isArray(fixtures))
      .map(([leagueId, fixtures]) => ({
        leagueId,
        championId: typeof (save.cupChampion as Record<string, unknown> | undefined)?.[leagueId] === "string"
          ? String((save.cupChampion as Record<string, unknown>)[leagueId])
          : null,
        fixtures: archiveFinishedFixtures(fixtures, leagueId),
      }))
      .filter((cup) => cup.fixtures.length > 0 || Boolean(cup.championId)),
    europeanCompetitionDetails: ([
      { competition: "ucl" as const, fixtures: save.uclFixtures, state: save.ucl, championId: save.uclChampion },
      { competition: "uel" as const, fixtures: save.uelFixtures, state: save.uel, championId: save.uelChampion },
      { competition: "uecl" as const, fixtures: save.ueclFixtures, state: save.uecl, championId: save.ueclChampion },
    ]).map(({ competition, fixtures, state, championId }) => ({
      competition,
      championId: championId ?? null,
      leaguePhaseTable: (state?.leaguePhaseTable ?? state?.table ?? []).map((row: any) => ({
        teamId: String(row.teamId),
        played: Math.max(0, Number(row.played) || 0),
        won: Math.max(0, Number(row.won) || 0),
        drawn: Math.max(0, Number(row.drawn) || 0),
        lost: Math.max(0, Number(row.lost) || 0),
        gf: Math.max(0, Number(row.gf) || 0),
        ga: Math.max(0, Number(row.ga) || 0),
        gd: Number(row.gd) || 0,
        points: Math.max(0, Number(row.points) || 0),
      })),
      fixtures: archiveFinishedFixtures(fixtures, competition),
    })).filter((competition) => competition.fixtures.length > 0 || competition.leaguePhaseTable?.length || Boolean(competition.championId)),
    featuredTransfers: (input.featuredTransfers ?? []).slice(0, 12).map((transfer) => ({
      id: String(transfer.id),
      date: String(transfer.date),
      playerId: String(transfer.playerId),
      playerName: String(transfer.playerName),
      fromClubId: transfer.fromClubId == null ? null : String(transfer.fromClubId),
      toClubId: String(transfer.toClubId),
      fee: Math.max(0, Number(transfer.fee) || 0),
      type: String(transfer.type),
    })),
    nextSeasonEuropeanQualification: input.nextSeasonEuropeanQualification ? {
      seasonStartYear: input.nextSeasonEuropeanQualification.seasonStartYear,
      ucl: [...input.nextSeasonEuropeanQualification.ucl],
      uel: [...input.nextSeasonEuropeanQualification.uel],
      uecl: [...input.nextSeasonEuropeanQualification.uecl],
      associationRanking: [...input.nextSeasonEuropeanQualification.associationRanking],
      associationScores: { ...input.nextSeasonEuropeanQualification.associationScores },
    } : undefined,
    awards: { ...(input.awards ?? {}) },
    topScorers: (input.topScorers ?? []).slice(0, 100),
    retirements: (input.retirements ?? []).map((record) => ({ ...record })),
    promotions: movements.filter((item) => String(item.reason).includes("promotion")).map((item) => ({ teamId: item.teamId, fromLeague: item.fromLeague, toLeague: item.toLeague })),
    relegations: movements.filter((item) => String(item.reason).includes("relegation")).map((item) => ({ teamId: item.teamId, fromLeague: item.fromLeague, toLeague: item.toLeague })),
  };
}

export async function persistSeasonArchive(archive: SeasonArchive): Promise<void> {
  const key = seasonArchiveKey(archive.saveId, archive.season);
  const alreadyStored = getSaveItem(key);
  if (!alreadyStored) {
    const ok = setSaveItem(key, JSON.stringify(archive));
    if (!ok) throw new Error("No se pudo poner el historial de temporada en la cola de guardado.");
    await flushSaveStorage();
  }
}

function normalizeSeasonArchive(value: unknown, saveId: string): SeasonArchive | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<SeasonArchive>;
  if (parsed.version !== 1 || parsed.saveId !== saveId || typeof parsed.season !== "string" || !parsed.season) return null;
  const european: Partial<SeasonArchive["europeanChampions"]> = parsed.europeanChampions && typeof parsed.europeanChampions === "object"
    ? parsed.europeanChampions
    : {};
  return {
    ...(parsed as SeasonArchive),
    archivedAt: typeof parsed.archivedAt === "string" ? parsed.archivedAt : "",
    leagues: Array.isArray(parsed.leagues) ? parsed.leagues : [],
    domesticCupChampions: Array.isArray(parsed.domesticCupChampions) ? parsed.domesticCupChampions : [],
    europeanChampions: {
      ucl: typeof european.ucl === "string" ? european.ucl : null,
      uel: typeof european.uel === "string" ? european.uel : null,
      uecl: typeof european.uecl === "string" ? european.uecl : null,
    },
    awards: parsed.awards && typeof parsed.awards === "object" && !Array.isArray(parsed.awards) ? parsed.awards : {},
    topScorers: Array.isArray(parsed.topScorers) ? parsed.topScorers : [],
    retirements: Array.isArray(parsed.retirements) ? parsed.retirements : [],
    promotions: Array.isArray(parsed.promotions) ? parsed.promotions : [],
    relegations: Array.isArray(parsed.relegations) ? parsed.relegations : [],
    awardWinners: Array.isArray(parsed.awardWinners) ? parsed.awardWinners : undefined,
    playerSeasonRecords: Array.isArray(parsed.playerSeasonRecords) ? parsed.playerSeasonRecords : undefined,
    teamOfSeason: Array.isArray(parsed.teamOfSeason) ? parsed.teamOfSeason : undefined,
    featuredTransfers: Array.isArray(parsed.featuredTransfers) ? parsed.featuredTransfers : undefined,
    seasonTransfers: Array.isArray(parsed.seasonTransfers) ? parsed.seasonTransfers : undefined,
    domesticCupDetails: Array.isArray(parsed.domesticCupDetails) ? parsed.domesticCupDetails : undefined,
    europeanCompetitionDetails: Array.isArray(parsed.europeanCompetitionDetails) ? parsed.europeanCompetitionDetails : undefined,
  };
}

export function getSeasonArchive(saveId: string, season: string): SeasonArchive | null {
  const value = getSaveItem(seasonArchiveKey(saveId, season));
  if (!value) return null;
  try {
    const parsed = normalizeSeasonArchive(JSON.parse(value), saveId);
    return parsed?.season === season ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Read the lightweight history index from keys only. Rollover uses this to
 * update SaveGame.seasonHistoryIndex without parsing every season archive (each
 * archive can contain thousands of individual player-season records).
 */
export function getSeasonArchiveIndex(saveId: string): { count: number; latestSeason: string | null } {
  const prefix = `fcsim:season-history:v1:${saveId}:`;
  const seasons = listSaveKeys()
    .filter((key) => key.startsWith(prefix))
    .map((key) => {
      try { return decodeURIComponent(key.slice(prefix.length)); } catch { return null; }
    })
    .filter((season): season is string => Boolean(season))
    .sort((a, b) => a.localeCompare(b));
  return { count: seasons.length, latestSeason: seasons.at(-1) ?? null };
}

export function listSeasonArchives(saveId: string): SeasonArchive[] {
  const prefix = `fcsim:season-history:v1:${saveId}:`;
  return listSaveKeys()
    .filter((key) => key.startsWith(prefix))
    .map((key) => {
      const value = getSaveItem(key);
      if (!value) return null;
      try {
        return normalizeSeasonArchive(JSON.parse(value), saveId);
      } catch {
        return null;
      }
    })
    .filter((archive): archive is SeasonArchive => Boolean(archive))
    .sort((a, b) => a.season.localeCompare(b.season));
}

export function removeSeasonArchive(saveId: string, season: string): void {
  removeSaveItem(seasonArchiveKey(saveId, season));
}


export type ClubPalmaresEntry = {
  teamId: string;
  leagueTitles: number;
  domesticCupTitles: number;
  uclTitles: number;
  uelTitles: number;
  ueclTitles: number;
  totalTitles: number;
  seasons: string[];
};

/** Aggregate titles across archived seasons. Works with archives written before newer optional fields existed. */
export function buildClubPalmares(archives: readonly SeasonArchive[]): ClubPalmaresEntry[] {
  const clubs = new Map<string, ClubPalmaresEntry>();
  const ensure = (teamId: string): ClubPalmaresEntry => {
    let entry = clubs.get(teamId);
    if (!entry) {
      entry = { teamId, leagueTitles: 0, domesticCupTitles: 0, uclTitles: 0, uelTitles: 0, ueclTitles: 0, totalTitles: 0, seasons: [] };
      clubs.set(teamId, entry);
    }
    return entry;
  };
  for (const archive of archives) {
    for (const league of archive.leagues ?? []) {
      if (league.championId) {
        const entry = ensure(league.championId);
        entry.leagueTitles += 1;
        if (!entry.seasons.includes(archive.season)) entry.seasons.push(archive.season);
      }
    }
    for (const cup of archive.domesticCupChampions ?? []) {
      if (!cup.teamId) continue;
      const entry = ensure(cup.teamId);
      entry.domesticCupTitles += 1;
      if (!entry.seasons.includes(archive.season)) entry.seasons.push(archive.season);
    }
    const european: Array<[string | null | undefined, keyof Pick<ClubPalmaresEntry, "uclTitles" | "uelTitles" | "ueclTitles">]> = [
      [archive.europeanChampions?.ucl, "uclTitles"],
      [archive.europeanChampions?.uel, "uelTitles"],
      [archive.europeanChampions?.uecl, "ueclTitles"],
    ];
    for (const [teamId, key] of european) {
      if (!teamId) continue;
      const entry = ensure(teamId);
      entry[key] += 1;
      if (!entry.seasons.includes(archive.season)) entry.seasons.push(archive.season);
    }
  }
  return [...clubs.values()]
    .map((entry) => ({
      ...entry,
      totalTitles: entry.leagueTitles + entry.domesticCupTitles + entry.uclTitles + entry.uelTitles + entry.ueclTitles,
      seasons: entry.seasons.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.totalTitles - a.totalTitles || a.teamId.localeCompare(b.teamId));
}

export type PlayerPalmaresEntry = {
  playerId: string | null;
  playerName: string;
  careerGoals: number;
  careerAssists: number;
  seasonsPlayed: number;
  seasons: string[];
  clubs: Array<{ clubId: string; seasons: string[] }>;
  titles: Array<{ title: string; season: string; clubId: string }>;
  awards: Array<{ category: string; season: string }>;
  topScorerSeasons: Array<{ season: string; goals: number }>;
};

/** Aggregate goals, seasons, club honours and individual awards without current player data. */
export function buildPlayerPalmares(archives: readonly SeasonArchive[]): PlayerPalmaresEntry[] {
  const players = new Map<string, PlayerPalmaresEntry>();
  const ensure = (playerId: string | null | undefined, playerName: string): PlayerPalmaresEntry => {
    const normalizedId = playerId && playerId.length ? playerId : null;
    const key = normalizedId ? `id:${normalizedId}` : `name:${playerName.trim().toLocaleLowerCase()}`;
    let entry = players.get(key);
    if (!entry) {
      entry = { playerId: normalizedId, playerName, careerGoals: 0, careerAssists: 0, seasonsPlayed: 0, seasons: [], clubs: [], titles: [], awards: [], topScorerSeasons: [] };
      players.set(key, entry);
    }
    return entry;
  };
  for (const archive of archives) {
    const hasSeasonRecords = Array.isArray(archive.playerSeasonRecords) && archive.playerSeasonRecords.length > 0;
    const touchedThisSeason = new Set<string>();
    for (const record of archive.playerSeasonRecords ?? []) {
      if (!record.playerName || !record.playerId) continue;
      const entry = ensure(record.playerId, record.playerName);
      if (touchedThisSeason.has(record.playerId)) continue;
      touchedThisSeason.add(record.playerId);
      entry.careerGoals += Math.max(0, Number(record.goals) || 0);
      entry.careerAssists += Math.max(0, Number(record.assists) || 0);
      const contributed = Number(record.appearances) > 0 || Number(record.goals) > 0 || Number(record.assists) > 0;
      if (contributed && !entry.seasons.includes(archive.season)) entry.seasons.push(archive.season);
      if (record.clubId) {
        let club = entry.clubs.find((item) => item.clubId === record.clubId);
        if (!club) { club = { clubId: record.clubId, seasons: [] }; entry.clubs.push(club); }
        if (contributed && !club.seasons.includes(archive.season)) club.seasons.push(archive.season);
      }
      for (const title of record.trophies ?? []) {
        if (record.clubId && !entry.titles.some((item) => item.season === archive.season && item.title === title && item.clubId === record.clubId)) {
          entry.titles.push({ title, season: archive.season, clubId: record.clubId });
        }
      }
    }
    // Old archives did not include full player-season records. Use their top-scorer
    // table as a limited fallback and clearly preserve only the data actually stored.
    if (!hasSeasonRecords) {
      for (const scorer of archive.topScorers ?? []) {
        if (!scorer.playerId || !scorer.playerName || touchedThisSeason.has(scorer.playerId)) continue;
        touchedThisSeason.add(scorer.playerId);
        const entry = ensure(scorer.playerId, scorer.playerName);
        entry.careerGoals += Math.max(0, Number(scorer.goals) || 0);
        if (Number(scorer.goals) > 0 && !entry.seasons.includes(archive.season)) entry.seasons.push(archive.season);
        if (scorer.clubId) {
          let club = entry.clubs.find((item) => item.clubId === scorer.clubId);
          if (!club) { club = { clubId: scorer.clubId, seasons: [] }; entry.clubs.push(club); }
          if (!club.seasons.includes(archive.season)) club.seasons.push(archive.season);
        }
      }
    }

    const seenWinners = new Set<string>();
    for (const winner of archive.awardWinners ?? []) {
      if (!winner.playerName) continue;
      const entry = ensure(winner.playerId, winner.playerName);
      const unique = `${winner.category}:${archive.season}`;
      if (!seenWinners.has(unique)) {
        entry.awards.push({ category: winner.category, season: archive.season });
        seenWinners.add(unique);
      }
    }
    // Legacy archives only had names, not IDs. Preserve those honours as name-linked records.
    if (!archive.awardWinners?.length) {
      for (const [category, playerName] of Object.entries(archive.awards ?? {})) {
        if (playerName) ensure(null, playerName).awards.push({ category, season: archive.season });
      }
    }
    const leadingScorer = archive.topScorers?.[0];
    if (leadingScorer?.playerName && Number(leadingScorer.goals) > 0) {
      const entry = ensure(leadingScorer.playerId || null, leadingScorer.playerName);
      if (!entry.topScorerSeasons.some((item) => item.season === archive.season)) {
        entry.topScorerSeasons.push({ season: archive.season, goals: Number(leadingScorer.goals) });
      }
    }
  }
  return [...players.values()]
    .map((entry) => ({
      ...entry,
      seasonsPlayed: entry.seasons.length,
      seasons: entry.seasons.sort((a, b) => a.localeCompare(b)),
      clubs: entry.clubs.map((club) => ({ ...club, seasons: club.seasons.sort((a, b) => a.localeCompare(b)) })).sort((a, b) => b.seasons.length - a.seasons.length),
      titles: entry.titles.sort((a, b) => a.season.localeCompare(b.season) || a.title.localeCompare(b.title)),
      awards: entry.awards.sort((a, b) => a.season.localeCompare(b.season) || a.category.localeCompare(b.category)),
      topScorerSeasons: entry.topScorerSeasons.sort((a, b) => a.season.localeCompare(b.season)),
    }))
    .sort((a, b) => (b.careerGoals - a.careerGoals) || (b.titles.length - a.titles.length) || (b.awards.length - a.awards.length) || a.playerName.localeCompare(b.playerName));
}

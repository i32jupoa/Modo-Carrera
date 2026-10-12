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
  }>;
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
  /** The 36 clubs qualified to each European competition in the following season. */
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

export function buildSeasonArchive(input: {
  saveId: string;
  save: SaveGame;
  awards?: Record<string, string | null>;
  awardWinners?: SeasonArchiveAwardWinner[];
  playerSeasonRecords?: PlayerSeasonArchiveRecord[];
  featuredTransfers?: NonNullable<SeasonArchive["featuredTransfers"]>;
  nextSeasonEuropeanQualification?: SeasonArchive["nextSeasonEuropeanQualification"];
  topScorers?: SeasonArchive["topScorers"];
  retirements?: RetiredPlayerRecord[];
  movement?: PromotionRelegationResult;
  archivedAt?: string;
}): SeasonArchive {
  const { save } = input;
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

export function getSeasonArchive(saveId: string, season: string): SeasonArchive | null {
  const value = getSaveItem(seasonArchiveKey(saveId, season));
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as SeasonArchive;
    return parsed?.version === 1 && parsed.saveId === saveId && parsed.season === season ? parsed : null;
  } catch {
    return null;
  }
}

export function listSeasonArchives(saveId: string): SeasonArchive[] {
  const prefix = `fcsim:season-history:v1:${saveId}:`;
  return listSaveKeys()
    .filter((key) => key.startsWith(prefix))
    .map((key) => {
      const value = getSaveItem(key);
      if (!value) return null;
      try {
        const archive = JSON.parse(value) as SeasonArchive;
        return archive?.version === 1 && archive.saveId === saveId ? archive : null;
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

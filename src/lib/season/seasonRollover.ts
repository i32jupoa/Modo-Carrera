/**
 * Transactional season rollover. Heavy systems are imported lazily so the
 * module is safe to load from the UI without creating circular store imports.
 */
import { settleSeasonEconomyForCampaign } from "./seasonEconomyCore";
import type { SaveGame } from "../store";
import { getCupFixtureDateIso, getEuropeanFixtureDateIso } from "@/lib/fixtureDates";
import { getSeasonCalendarAnchors, getSeasonStartYear } from "./calendarFactory";
import { getSeasonRolloverDates, isSeasonRolloverDue, resetPlayerSeasonCounters, type RolloverProgress, type RolloverProgressStage } from "./seasonRolloverCore";
export { isSeasonRolloverDue };
import { selectSeasonRetirements, type RetiredPlayerRecord } from "./retirements";
import { beginSeasonRollover, endSeasonRollover, waitForMarketBackgroundTasks } from "./seasonRolloverLock";
import { buildSeasonArchive, getSeasonArchive, persistSeasonArchive, type PlayerSeasonArchiveRecord, type SeasonArchive } from "./seasonHistory";

const BACKUP_PREFIX = "fcsim:season-transition-backup:v1:";
const JOURNAL_PREFIX = "fcsim:season-transition-journal:v1:";
const JOURNAL_VERSION = 1;

type TransitionJournal = {
  version: number;
  saveId: string;
  fromSeason: string;
  toSeason: string;
  stage: RolloverProgressStage | "committed";
  updatedAt: string;
  hadArchive: boolean;
};

type TransitionBackup = {
  version: number;
  saveId: string;
  fromSeason: string;
  toSeason: string;
  /** Legacy inline fields are still accepted when recovering older checkpoints. */
  savePayload?: string;
  market?: any;
  academy?: any;
  /** Large snapshots live in separate storage records to avoid a giant JSON.stringify peak. */
  savePayloadKey?: string;
  marketPayloadKey?: string;
  academyPayloadKey?: string;
  hadArchive: boolean;
};

function transitionCheckpointKeys(saveId: string) {
  const prefix = `${BACKUP_PREFIX}${saveId}`;
  return {
    backup: prefix,
    savePayload: `${prefix}:save-payload`,
    marketPayload: `${prefix}:market-payload`,
    academyPayload: `${prefix}:academy-payload`,
  };
}

function resolveTransitionBackup(
  stored: TransitionBackup | null,
  getSaveItem: (key: string) => string | null,
): TransitionBackup | null {
  if (!stored || stored.version !== JOURNAL_VERSION || !stored.saveId) return null;
  const savePayload = stored.savePayload ?? (stored.savePayloadKey ? getSaveItem(stored.savePayloadKey) ?? undefined : undefined);
  if (!savePayload) return null;

  let market = stored.market;
  if (market === undefined && stored.marketPayloadKey) {
    const raw = getSaveItem(stored.marketPayloadKey);
    if (!raw) return null;
    market = safeJson(raw);
    if (!market) return null;
  }

  let academy = stored.academy;
  if (academy === undefined && stored.academyPayloadKey) {
    const raw = getSaveItem(stored.academyPayloadKey);
    if (raw === null) return null;
    try { academy = JSON.parse(raw); } catch { return null; }
  }

  return { ...stored, savePayload, market, academy };
}

function removeTransitionCheckpointSidecars(
  saveId: string,
  removeSaveItem: (key: string) => void,
) {
  const keys = transitionCheckpointKeys(saveId);
  removeSaveItem(keys.savePayload);
  removeSaveItem(keys.marketPayload);
  removeSaveItem(keys.academyPayload);
}

export type AdvanceSeasonOptions = {
  onProgress?: (progress: RolloverProgress) => void;
  /** Test hooks only. Production should use the persisted current save. */
  allowIncompleteCompetitions?: boolean;
};

let activeRollover: { key: string; promise: Promise<SaveGame> } | null = null;
const broadcastRolloverKeys = new Set<string>();

function hasResult(fixture: any): boolean {
  const result = fixture?.result;
  return Boolean(result && Number.isFinite(Number(result.homeGoals)) && Number.isFinite(Number(result.awayGoals)));
}

/**
 * Ensures a due season rollover runs from any entry point (calendar, global day
 * bar, or a recovered legacy save). The persisted SaveGame remains authoritative,
 * but the live Zustand clock may be newer while a save batch is being flushed.
 */
export async function advanceSeasonIfDue(
  _save?: SaveGame | null,
  options: AdvanceSeasonOptions = {},
): Promise<SaveGame | null> {
  const { loadSave, saveSave } = await import("../store");
  const { usePlayersStore } = await import("@/store/playersStore");
  const persisted = loadSave();
  if (!persisted) return null;

  const liveState = usePlayersStore.getState();
  let effectiveSave = persisted;
  if (
    _save && _save.myTeamId === persisted.myTeamId && _save.season === persisted.season &&
    String(_save.currentDate ?? "") > String(effectiveSave.currentDate ?? "")
  ) {
    effectiveSave = { ...effectiveSave, currentDate: String(_save.currentDate) };
  }
  if (
    liveState.myTeamId && liveState.myTeamId === persisted.myTeamId &&
    liveState.currentDate && String(liveState.currentDate) > String(effectiveSave.currentDate ?? "")
  ) {
    effectiveSave = { ...effectiveSave, currentDate: liveState.currentDate };
  }
  if (effectiveSave.currentDate !== persisted.currentDate) saveSave(effectiveSave);

  if (!isSeasonRolloverDue(effectiveSave)) return null;
  if (liveState.myTeamId === effectiveSave.myTeamId && liveState.pendingUserMatch) {
    const pendingMatchId = liveState.pendingUserMatch.id;
    // At the hard season boundary, don't strand the career because the calendar
    // jump left a legacy pending-user-match marker behind. Try to resolve it with
    // the normal match/statistics pipeline; rollover remains recoverable if the
    // cached fixture no longer exists in the current calendar.
    const resolved = liveState.simulateMatchForCalendarJump(pendingMatchId);
    if (!resolved) {
      console.warn(
        `[season-rollover] El partido pendiente ${pendingMatchId} no pudo reconciliarse automáticamente; se continúa con el cierre para no bloquear la carrera.`,
      );
    }
  }
  const readiness = canAdvanceToNextSeason(effectiveSave);
  if (!readiness.ok && !options.allowIncompleteCompetitions) {
    throw new Error(readiness.reason ?? "La temporada todavía no está lista para cerrarse.");
  }
  const nextSave = await advanceToNextSeason(effectiveSave, options);
  if (nextSave.season !== effectiveSave.season && typeof window !== "undefined") {
    const { getCurrentSaveId } = await import("../savedGames");
    const broadcastKey = `${getCurrentSaveId() ?? "career"}:${effectiveSave.myTeamId}:${effectiveSave.season}->${nextSave.season}`;
    if (!broadcastRolloverKeys.has(broadcastKey)) {
      broadcastRolloverKeys.add(broadcastKey);
      window.dispatchEvent(new CustomEvent("fcsim:save-updated", {
        detail: { reason: "season-rollover", fromSeason: effectiveSave.season, toSeason: nextSave.season },
      }));
    }
  }
  return nextSave;
}

/**
 * While the season is in progress, reports unresolved fixtures. At the 30 June
 * boundary, the rollover must remain available: background leagues are not all
 * simulated in real time, and stale fixture records must never deadlock a career.
 */
export function canAdvanceToNextSeason(save: SaveGame): { ok: boolean; reason?: string } {
  const dates = getSeasonRolloverDates(save.season);
  const currentDate = String(save.currentDate ?? "");
  // The season boundary must always be recoverable. Background leagues are not
  // all simulated day-by-day, so requiring every world fixture to have a result
  // makes 30 June a permanent dead end. We still validate fixtures while the
  // season is in progress, but at/after the cutoff the rollover owns recovery.
  // A save strictly after the cutoff is a legacy/inconsistent career and must
  // also be repaired retroactively without touching summer transfers.
  if (currentDate >= dates.endDate) return { ok: true };
  const seasonStartYear = dates.seasonStartYear;
  const leagueStart = getSeasonCalendarAnchors(seasonStartYear).leagueKickoffSaturday;

  const fixtureDate = (fixture: any, kind: "league" | "cup" | "ucl" | "uel" | "uecl"): string | null => {
    if (!fixture) return null;
    if (kind === "cup") return getCupFixtureDateIso(fixture, seasonStartYear);
    if (kind === "ucl" || kind === "uel" || kind === "uecl") {
      return getEuropeanFixtureDateIso(fixture, kind, seasonStartYear);
    }
    if (typeof fixture.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(fixture.date)) return fixture.date.slice(0, 10);
    const matchday = Number(fixture.matchday);
    if (!Number.isFinite(matchday) || matchday < 1) return null;
    const date = new Date(`${leagueStart}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + (matchday - 1) * 7);
    return date.toISOString().slice(0, 10);
  };

  const domestic = Object.values(save.fixtures ?? {}).flatMap((fixtures: any) => Array.isArray(fixtures) ? fixtures : []);
  // cupFixtures contains `${league}_structure` metadata beside actual arrays.
  const cups = Object.values(save.cupFixtures ?? {}).filter(Array.isArray).flatMap((fixtures: any) => fixtures ?? []);
  const european = [
    ...(save.uclFixtures ?? []).map((fixture: any) => ({ ...fixture, __competition: "ucl" })),
    ...(save.uelFixtures ?? []).map((fixture: any) => ({ ...fixture, __competition: "uel" })),
    ...(save.ueclFixtures ?? []).map((fixture: any) => ({ ...fixture, __competition: "uecl" })),
  ];
  const all = [
    ...domestic.map((fixture: any) => ({ fixture, kind: "league" as const })),
    ...cups.map((fixture: any) => ({ fixture, kind: "cup" as const })),
    ...european.map((fixture: any) => ({ fixture, kind: fixture.__competition as "ucl" | "uel" | "uecl" })),
  ];
  // Only fixtures belonging to the season being closed and scheduled on/before
  // 30 June can block the rollover. Future/next-season fixtures often have no
  // result yet and must not deadlock the boundary forever.
  const seasonFixtures = all.filter(({ fixture, kind }) => {
    const date = fixtureDate(fixture, kind);
    return date !== null && date <= dates.endDate;
  });
  if (!seasonFixtures.length) return { ok: false, reason: "No se han encontrado partidos fechados para la temporada que se va a cerrar." };
  const pending = seasonFixtures.filter(({ fixture }) => !hasResult(fixture));
  if (pending.length) {
    const examples = pending.slice(0, 4).map(({ fixture, kind }) => {
      const date = fixtureDate(fixture, kind);
      return `${fixture.homeId ?? "?"}–${fixture.awayId ?? "?"}${date ? ` (${date})` : ""}`;
    }).join(", ");
    return {
      ok: false,
      reason: `Quedan ${pending.length} partidos de esta temporada sin resultado${examples ? `, por ejemplo: ${examples}` : ""}. El cierre automático los tratará como pendientes de fondo.`,
    };
  }
  return { ok: true };
}

let lastRolloverStage = "init";
function emitProgress(options: AdvanceSeasonOptions, stage: RolloverProgressStage, progress: number, message: string) {
  lastRolloverStage = stage;
  console.info(`[season-rollover] ${progress}% · ${stage} · ${message}`);
  options.onProgress?.({ stage, progress, message });
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function safeJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

async function keysFor(saveId: string) {
  const { getSaveItem } = await import("../saveStorage");
  return {
    saveKey: `fcsim:save:v2:${saveId}`,
    backupKey: `${BACKUP_PREFIX}${saveId}`,
    journalKey: `${JOURNAL_PREFIX}${saveId}`,
    getSaveItem,
  };
}

async function persistJournal(key: string, journal: TransitionJournal) {
  const { setSaveItem, flushSaveStorage } = await import("../saveStorage");
  if (!setSaveItem(key, JSON.stringify({ ...journal, updatedAt: new Date().toISOString() }))) {
    throw new Error("No se pudo guardar el registro de recuperación de fin de temporada.");
  }
  await flushSaveStorage();
}

async function rollbackFromBackup(backup: TransitionBackup): Promise<void> {
  const { setSaveItem, removeSaveItem, flushSaveStorage } = await import("../saveStorage");
  const { saveSave } = await import("../store");
  const { restorePlayersStoreState } = await import("../savedGames");
  const { detachWorldBridge, attachWorldBridge, hydrateWorld, flushWorldMoves } = await import("../transfers/WorldSync");
  const { resetMarketIndex } = await import("../transfers/PlayerIndex");
  const { applyTransferSnapshot, saveTransferSystem } = await import("../transfers/Persistence");
  const { saveAcademySave, clearAcademySave } = await import("../academy/academyPersistence");
  const { flushSaveStorage: flush } = await import("../saveStorage");

  detachWorldBridge();
  const parsedSave = safeJson<SaveGame & { playersStoreState?: any }>(backup.savePayload);
  if (parsedSave) {
    restorePlayersStoreState(parsedSave);
    const originalSave = parsedSave as SaveGame;
    setSaveItem(`fcsim:save:v2:${backup.saveId}`, backup.savePayload);
    resetMarketIndex();
    if (backup.market) applyTransferSnapshot(backup.market);
    if (backup.academy) await saveAcademySave(backup.academy, backup.saveId);
    else await clearAcademySave(backup.saveId);
    attachWorldBridge();
    hydrateWorld();
    flushWorldMoves();
    await saveTransferSystem();
    saveSave(originalSave);
    // Restore the exact checkpoint payload again after the store cache is reset.
    setSaveItem(`fcsim:save:v2:${backup.saveId}`, backup.savePayload);
    await flush();
  }
  if (!backup.hadArchive) {
    const { removeSeasonArchive } = await import("./seasonHistory");
    removeSeasonArchive(backup.saveId, backup.fromSeason);
  }
  const { removeSaveItem: remove } = await import("../saveStorage");
  remove(`${BACKUP_PREFIX}${backup.saveId}`);
  remove(`${JOURNAL_PREFIX}${backup.saveId}`);
  removeTransitionCheckpointSidecars(backup.saveId, remove);
  await flushSaveStorage();
}

/** Recover an interrupted transaction at startup. Returns true if recovery ran. */
export async function recoverInterruptedSeasonTransition(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  beginSeasonRollover();
  try {
    const { initSaveStorage, getSaveItem, removeSaveItem, flushSaveStorage } = await import("../saveStorage");
    const { getCurrentSaveId } = await import("../savedGames");
    await initSaveStorage();
    // Drain market work started before the recovery lock; do not restore over an in-flight write.
    await waitForMarketBackgroundTasks();
    const saveId = getCurrentSaveId();
    if (!saveId) return false;
    const journalKey = `${JOURNAL_PREFIX}${saveId}`;
    const checkpointKeys = transitionCheckpointKeys(saveId);
    const backupKey = checkpointKeys.backup;
    const journal = safeJson<TransitionJournal>(getSaveItem(journalKey));
    const backupRecord = safeJson<TransitionBackup>(getSaveItem(backupKey));
    const backup = resolveTransitionBackup(backupRecord, getSaveItem);
    if (!journal && !backupRecord) {
      // A renderer may have stopped between writing checkpoint sidecars and
      // publishing the small checkpoint index. Remove those orphaned copies.
      removeTransitionCheckpointSidecars(saveId, removeSaveItem);
      await flushSaveStorage();
      return false;
    }
    if (journal?.stage === "committed") {
      removeSaveItem(backupKey);
      removeSaveItem(journalKey);
      removeTransitionCheckpointSidecars(saveId, removeSaveItem);
      await flushSaveStorage();
      return true;
    }
    if (!backup || backup.saveId !== saveId) {
      // A backup without a valid journal means no mutation should have started.
      if (!journal) {
        removeSaveItem(backupKey);
        removeTransitionCheckpointSidecars(saveId, removeSaveItem);
      }
      await flushSaveStorage();
      return false;
    }
    await rollbackFromBackup(backup);
    return true;
  } finally {
    endSeasonRollover();
  }
}

function awardsForArchive(snapshot: any): Record<string, string | null> {
  return {
    ballonDor: snapshot?.ballon?.player?.name ?? null,
    goldenBoy: snapshot?.goldenBoy?.player?.name ?? null,
    goldenShoe: snapshot?.shoe?.award?.player?.name ?? null,
    goldenPass: snapshot?.pass?.award?.player?.name ?? null,
    goldenGlove: snapshot?.glove?.player?.name ?? null,
    championsBestPlayer: snapshot?.championsPlayer?.player?.name ?? null,
    europaLeagueBestPlayer: snapshot?.europaLeaguePlayer?.player?.name ?? null,
    conferenceLeagueBestPlayer: snapshot?.conferenceLeaguePlayer?.player?.name ?? null,
  };
}

function awardWinnersForArchive(snapshot: any) {
  const candidates: Array<[string, any]> = [
    ["Balón de Oro", snapshot?.ballon?.player],
    ["Golden Boy", snapshot?.goldenBoy?.player],
    ["Bota de Oro", snapshot?.shoe?.award?.player],
    ["Pase de Oro", snapshot?.pass?.award?.player],
    ["Guante de Oro", snapshot?.glove?.player],
    ["Mejor jugador Champions", snapshot?.championsPlayer?.player],
    ["Mejor jugador Europa League", snapshot?.europaLeaguePlayer?.player],
    ["Mejor jugador Conference League", snapshot?.conferenceLeaguePlayer?.player],
  ];
  return candidates
    .filter(([, player]) => player && String(player.name ?? "").trim())
    .map(([category, player]) => ({ category, playerId: player.id == null ? null : String(player.id), playerName: String(player.name) }));
}

function topScorersFromStore(
  store: any,
  rawPlayers: any[] = store.getRawPlayers(),
): Array<{ playerId: string; playerName: string; clubId: string | null; goals: number }> {
  return rawPlayers
    .map((player: any) => {
      const id = String(player.ID);
      const stats = store.stats?.[id];
      const goals = Math.max(0, Number(stats?.goals ?? 0), Number(stats?.dynamicStats?.seasonGoals ?? 0));
      const sim = store.getSimPlayer(id);
      return { playerId: id, playerName: String(player.Name ?? sim?.name ?? id), clubId: sim?.teamId ?? null, goals };
    })
    .filter((player: any) => player.goals > 0)
    .sort((a: any, b: any) => b.goals - a.goals || a.playerName.localeCompare(b.playerName))
    .slice(0, 100);
}

function playerSeasonRecordsFromStore(store: any, rawPlayers: any[] = store.getRawPlayers()): PlayerSeasonArchiveRecord[] {
  const records: PlayerSeasonArchiveRecord[] = [];
  for (const player of rawPlayers) {
    const id = String(player.ID);
    if (!id) continue;
    const stats = store.stats?.[id];
    const dynamic = stats?.dynamicStats ?? {};
    const sim = store.getSimPlayer(id);
    const goals = Math.max(0, Number(stats?.goals ?? 0), Number(dynamic?.seasonGoals ?? 0));
    const assists = Math.max(0, Number(stats?.assists ?? 0), Number(dynamic?.seasonAssists ?? 0));
    const appearances = Math.max(0, Number(stats?.appearances ?? 0), Number(dynamic?.seasonAppearances ?? 0));
    if (goals <= 0 && assists <= 0 && appearances <= 0) continue;
    records.push({
      playerId: id,
      playerName: String(player.Name ?? sim?.name ?? id),
      clubId: sim?.teamId == null ? null : String(sim.teamId),
      goals,
      assists,
      appearances,
      positions: Array.isArray(sim?.positions) ? sim.positions.map(String) : [String(player.Position ?? "")].filter(Boolean),
      ovr: Math.max(0, Number(sim?.rating ?? player.OVR) || 0),
      trophies: [],
    });
  }
  return records;
}

function notification(
  type: NonNullable<SaveGame["seasonNotifications"]>[number]["type"],
  season: string,
  date: string,
  message: string,
  extra: Partial<NonNullable<SaveGame["seasonNotifications"]>[number]> = {},
) {
  return { id: `${season}:${type}:${extra.playerId ?? extra.teamId ?? message.slice(0, 24)}`, type, season, date, message, read: false, ...extra };
}

function ensureValidAiSquads(teamIds: string[], overrides: Record<string, string>, userTeamId: string, nextDate: string) {
  // Emergency free-agent fills are deliberately limited to clubs with a missing
  // XI or a missing core position; normal market strategy remains untouched.
  return import("../transfers/PlayerIndex").then(({ getClubPlayers, getFreeAgents, reassignPlayerClub, updatePlayer }) => {
    const { getTeamLeagueId, teamById } = requireTeams();
    let free = getFreeAgents();
    const needFor = (players: any[], group: string) => players.filter((p) => p.group === group).length;
    for (const teamId of teamIds) {
      if (teamId === userTeamId) continue;
      let roster = getClubPlayers(teamId);
      const leagueId = getTeamLeagueId(teamId, { teamLeagueOverrides: overrides }) ?? teamById(teamId).league;
      let additions = 0;
      const needs: string[] = [];
      if (needFor(roster, "GK") < 1) needs.push("GK");
      if (roster.filter((p) => p.group === "CB" || p.group === "FB").length < 3) needs.push("DEF");
      if (roster.filter((p) => p.group === "CM" || p.group === "WING").length < 3) needs.push("MID");
      if (needFor(roster, "ST") < 1) needs.push("ST");
      if (roster.length < 11) while (needs.length + additions < Math.max(4, 11 - roster.length)) needs.push("ANY");
      for (const need of needs) {
        if (additions >= 11 || roster.length >= 18) break;
        const eligible = free.filter((p) => {
          if (p.retired || p.clubId || p.loanClubId) return false;
          if (need === "GK") return p.group === "GK";
          if (need === "DEF") return p.group === "CB" || p.group === "FB";
          if (need === "MID") return p.group === "CM" || p.group === "WING";
          if (need === "ST") return p.group === "ST";
          return true;
        });
        if (!eligible.length) continue;
        const target = roster.length ? roster.reduce((sum: number, p: any) => sum + p.ovr, 0) / roster.length : 65;
        eligible.sort((a, b) => Math.abs(a.ovr - target) - Math.abs(b.ovr - target) || a.id.localeCompare(b.id));
        const player = eligible[0];
        reassignPlayerClub(player.id, teamId, leagueId, { force: true });
        updatePlayer(player.id, {
          retired: false,
          contract: { ...player.contract, yearsLeft: Math.max(2, player.contract.yearsLeft), wage: player.contract.wage },
          loanClubId: null, loanOwnerClubId: null, loanEndDate: null, loanListed: false,
          transferListed: false, listReason: null, minutesShare: 0,
        });
        additions++;
        roster = getClubPlayers(teamId);
        free = free.filter((candidate) => candidate.id !== player.id);
      }
    }
  });
}

// Kept as a function so the module doesn't eagerly import the large team data
// registry if only the pure helpers are used in tests.
function requireTeams() {
  // These imports are statically resolved by TypeScript/Vite, but the helper is
  // only reached inside the async market phase.
  return teamHelpers;
}
import * as teamHelpers from "@/data/teams";

/**
 * Close the current campaign and construct the next one. The original SaveGame
 * is never mutated; all persistent side effects are protected by a backup and
 * an idempotence ledger.
 */
export function advanceToNextSeason(save: SaveGame, options: AdvanceSeasonOptions = {}): Promise<SaveGame> {
  const key = `${save.myTeamId}:${save.season}`;
  if (activeRollover) {
    if (activeRollover.key === key) return activeRollover.promise;
    return Promise.reject(new Error("Ya hay una transición de temporada activa en otra carrera."));
  }

  // This must be synchronous: runAdvanceToNextSeason changes currentDate after
  // yielding to the UI, which would otherwise wake MarketClock mid-transaction.
  beginSeasonRollover();
  let promise!: Promise<SaveGame>;
  promise = runAdvanceToNextSeason(save, options).finally(() => {
    // Keep the clock frozen through a possible rollback, and ALWAYS release it.
    endSeasonRollover();
    if (activeRollover?.promise === promise) activeRollover = null;
  });
  activeRollover = { key, promise };
  return promise;
}

async function runAdvanceToNextSeason(save: SaveGame, options: AdvanceSeasonOptions = {}): Promise<SaveGame> {
  lastRolloverStage = "initialization";
  if (typeof window === "undefined") throw new Error("El cambio de temporada solo puede ejecutarse en el navegador.");
  const { initSaveStorage, getSaveItem, setSaveItem, removeSaveItem, flushSaveStorage } = await import("../saveStorage");
  const { getCurrentSaveId, persistCurrentSave, restorePlayersStoreState } = await import("../savedGames");
  const { loadSave, saveSave, applySeasonEndProgressionToAllPlayers, recalculateUserSquadRoles, initializeEuropeanCompetition, initializeChampionsCompetition } = await import("../store");
  const { usePlayersStore, defaultStats } = await import("@/store/playersStore");
  const { invalidateSquadsCache } = await import("@/data/players");
  const { getAllTeams, getTeamLeagueId, setActiveTeamLeagueOverrides, teamById } = await import("@/data/teams");
  const { calculateSavePromotionRelegation, prepareNextSeasonDomesticState } = await import("./promotionRelegation");
  const { prepareEuropeanQualificationForNextSeason } = await import("./europeanQualification");
  const { getClubPlayers, getMarketIndex, getFreeAgents, reassignPlayerClub, updatePlayer, snapshotAllPlayerDeltas, resetMarketIndex } = await import("../transfers/PlayerIndex");
  const { loadTransferSave, applyTransferSnapshot, snapshotTransferSystem, saveTransferSystem } = await import("../transfers/Persistence");
  const { attachWorldBridge, detachWorldBridge, hydrateWorld, flushWorldMoves, syncUserLoanRoster } = await import("../transfers/WorldSync");
  const { runClubContractCycle, advanceSeason: advanceContracts } = await import("../transfers/ContractEngine");
  const { resolveLoansEndOfSeason } = await import("../transfers/LoanEngine");
  const { reconcileAcademyLoans } = await import("../academy/academyLoanBridge");
  const { loadAcademySave, saveAcademySave, clearAcademySave } = await import("../academy/academyPersistence");
  const { useAcademyStore } = await import("../academy/academyStore");
  const { beginAcademyAiFastForward, endAcademyAiFastForward, flushAcademyAiPendingChanges } = await import("../academy/academyAiMatchdayRunner");
  const { runAcademyAnnualIntakeForAllClubs, runAcademyPreseasonPromotions } = await import("../academy/academyPromotionEngine");
  const { getAwardsSnapshot } = await import("../awards");
  const { listTransfers } = await import("../transfers/TransferHistory");
  const { getTeamLeagueId: resolveTeamLeague } = await import("@/data/teams");

  // Wait for ticks/save operations that began before the lock was acquired.
  // The lock prevents new ticks; draining old tasks makes backup/rollback coherent.
  await waitForMarketBackgroundTasks();
  await initSaveStorage();
  const saveId = getCurrentSaveId();
  if (!saveId) throw new Error("No hay una partida activa; no se puede iniciar una transición de temporada.");
  const current = loadSave();
  if (!current || current.myTeamId !== save.myTeamId || current.season !== save.season) {
    throw new Error("La partida activa ha cambiado desde que se solicitó el cierre. Vuelve a cargar la carrera.");
  }
  const rolloverDates = getSeasonRolloverDates(current.season);
  // A committed transition always changes `season` and records the closed season
  // in the ledger in the same SaveGame. If the *current* season is still in the
  // ledger, the save is inconsistent (e.g. a partial/legacy write). Retry only
  // once its calendar has reached the cutoff; before then, don't mutate it.
  const staleLedgerEntry = (current.seasonRolloverLedger ?? []).includes(current.season);
  if (staleLedgerEntry && String(current.currentDate ?? "") < rolloverDates.endDate) return current;
  const readiness = canAdvanceToNextSeason(current);
  if (!readiness.ok && !options.allowIncompleteCompetitions) throw new Error(readiness.reason ?? "La temporada todavía no está lista para cerrarse.");

  const dates = getSeasonRolloverDates(current.season);
  const originalCurrentDate = String(current.currentDate ?? dates.endDate);
  const retroactiveRollover = originalCurrentDate > dates.endDate;
  const backupKey = `${BACKUP_PREFIX}${saveId}`;
  const journalKey = `${JOURNAL_PREFIX}${saveId}`;
  const saveKey = `fcsim:save:v2:${saveId}`;
  let backup: TransitionBackup | null = null;
  let archiveSaved = false;
  let worldAttached = false;
  let userFinanceSummary: NonNullable<SeasonArchive["financeSummary"]> | undefined;
  let nextSeasonEconomyLedger: string[] = [...(current.seasonEconomyLedger ?? [])];
  let economySettlementFailed = false;
  let postSeasonTransferPlayerIds = new Set<string>();

  lastRolloverStage = "init";
  try {
    emitProgress(options, "checkpoint", 2, "Preparando punto de recuperación…");
    // Ensure market runtime represents this save before taking its checkpoint.
    const savedMarket = await loadTransferSave();
    if (savedMarket) applyTransferSnapshot(savedMarket);
    if (retroactiveRollover) {
      // Repairing an August save must retain permanent signings and loans already
      // completed in July/August. Those players' current contracts/loan states
      // belong to the next campaign and must not be rolled back one year.
      postSeasonTransferPlayerIds = new Set(
        listTransfers()
          .filter((record) => record.date > dates.endDate && record.date <= originalCurrentDate)
          .flatMap((record: any) => [String(record.playerId), ...(record.clauses?.playerSwapIds ?? []).map(String)]),
      );
    }
    attachWorldBridge(); worldAttached = true;
    hydrateWorld(); flushWorldMoves();
    syncUserLoanRoster();
    if (!persistCurrentSave(current, { immediate: true })) throw new Error("No se pudo guardar el punto de recuperación de la partida.");
    await flushSaveStorage();
    const savePayload = getSaveItem(saveKey);
    if (!savePayload) throw new Error("No se pudo leer el punto de recuperación recién guardado.");
    const checkpointKeys = transitionCheckpointKeys(saveId);
    const academySnapshot = await loadAcademySave(saveId);
    const hadArchive = Boolean(getSeasonArchive(saveId, current.season));

    // Do not serialize the save, full market snapshot, and academy snapshot into
    // one enormous JSON string. This duplicated tens of megabytes at rollover
    // and could make Chrome terminate the renderer with "out of memory". The
    // save payload is already a string, so reusing that string in its own key
    // avoids another stringify/copy; each other snapshot is serialized alone.
    if (!setSaveItem(checkpointKeys.savePayload, savePayload)) {
      throw new Error("No se pudo guardar la copia de recuperación de la partida.");
    }
    const marketSnapshotPayload = JSON.stringify({ ...snapshotTransferSystem(), players: snapshotAllPlayerDeltas() });
    if (!setSaveItem(checkpointKeys.marketPayload, marketSnapshotPayload)) {
      throw new Error("No se pudo guardar la copia de recuperación del mercado.");
    }
    if (!setSaveItem(checkpointKeys.academyPayload, JSON.stringify(academySnapshot))) {
      throw new Error("No se pudo guardar la copia de recuperación de la cantera.");
    }
    backup = {
      version: JOURNAL_VERSION,
      saveId,
      fromSeason: current.season,
      toSeason: dates.toSeason,
      savePayloadKey: checkpointKeys.savePayload,
      marketPayloadKey: checkpointKeys.marketPayload,
      academyPayloadKey: checkpointKeys.academyPayload,
      hadArchive,
    };
    if (!setSaveItem(backupKey, JSON.stringify(backup))) throw new Error("No se pudo guardar el índice del checkpoint de la transición.");
    await flushSaveStorage();
    await persistJournal(journalKey, { version: JOURNAL_VERSION, saveId, fromSeason: current.season, toSeason: dates.toSeason, stage: "checkpoint", updatedAt: new Date().toISOString(), hadArchive });
    await yieldToUi();

    usePlayersStore.setState({ currentDate: dates.endDate } as any);
    const awardsSnapshot = getAwardsSnapshot(current);
    const awards = awardsForArchive(awardsSnapshot);
    const awardWinners = awardWinnersForArchive(awardsSnapshot);
    // One raw-player projection is enough for both archive views. Calling
    // getRawPlayers twice rebuilt tens of thousands of player objects at once.
    const storeForArchive = usePlayersStore.getState();
    const rawPlayersForArchive = storeForArchive.getRawPlayers();
    const playerSeasonRecords = playerSeasonRecordsFromStore(storeForArchive, rawPlayersForArchive);
    const topScorers = topScorersFromStore(storeForArchive, rawPlayersForArchive);
    const seasonStartDate = `${dates.seasonStartYear}-07-01`;
    const seasonTransfers = listTransfers()
      .filter((record) => record.date >= seasonStartDate && record.date <= dates.endDate)
      .map((record) => ({
        id: record.id,
        date: record.date,
        playerId: record.playerId,
        playerName: record.playerName,
        fromClubId: record.fromClubId,
        toClubId: record.toClubId,
        fromLeague: record.fromClubId
          ? (getTeamLeagueId(record.fromClubId, { teamLeagueOverrides: current.teamLeagueOverrides }) ?? teamById(record.fromClubId).league)
          : null,
        toLeague: getTeamLeagueId(record.toClubId, { teamLeagueOverrides: current.teamLeagueOverrides }) ?? teamById(record.toClubId).league,
        fee: record.fee,
        type: record.type,
      }));
    const featuredTransfers = [...seasonTransfers]
      .sort((a, b) => (Number(b.fee) || 0) - (Number(a.fee) || 0) || Number(a.type !== "permanent") - Number(b.type !== "permanent") || b.date.localeCompare(a.date))
      .slice(0, 12)
      .map(({ id, date, playerId, playerName, fromClubId, toClubId, fee, type }) => ({ id, date, playerId, playerName, fromClubId, toClubId, fee, type }));
    const movement = calculateSavePromotionRelegation(current);
    const domestic = prepareNextSeasonDomesticState(current, movement);
    const european = prepareEuropeanQualificationForNextSeason(current);

    emitProgress(options, "archive", 12, "Archivando clasificaciones, premios y goleadores…");
    const archiveBase = buildSeasonArchive({
      saveId,
      save: current,
      awards,
      awardWinners,
      playerSeasonRecords,
      featuredTransfers,
      seasonTransfers,
      nextSeasonEuropeanQualification: european.europeanQualification,
      topScorers,
      retirements: [],
      movement,
    });
    await persistJournal(journalKey, { version: JOURNAL_VERSION, saveId, fromSeason: current.season, toSeason: dates.toSeason, stage: "archive", updatedAt: new Date().toISOString(), hadArchive });
    await yieldToUi();

    emitProgress(options, "progression", 22, "Aplicando progresión deportiva de fin de temporada…");
    // Los premios individuales son hitos de carrera. Sumarlos como trofeos de
    // temporada antes del cálculo permite que Balón de Oro, Bota/Pase de Oro y
    // premios continentales aporten una mejora moderada y persistente.
    const awardCountByPlayer = new Map<string, number>();
    for (const winner of awardWinners) {
      if (!winner.playerId) continue;
      awardCountByPlayer.set(winner.playerId, (awardCountByPlayer.get(winner.playerId) ?? 0) + 1);
    }
    if (awardCountByPlayer.size > 0) {
      const state = usePlayersStore.getState();
      const nextStats = { ...(state.stats ?? {}) } as Record<string, any>;
      for (const [playerId, count] of awardCountByPlayer) {
        const currentStats = nextStats[playerId];
        if (!currentStats?.dynamicStats) continue;
        nextStats[playerId] = {
          ...currentStats,
          dynamicStats: {
            ...currentStats.dynamicStats,
            seasonTrophies: Math.max(0, Number(currentStats.dynamicStats.seasonTrophies) || 0) + Math.min(3, count),
          },
        };
      }
      usePlayersStore.setState({ stats: nextStats } as any);
    }
    applySeasonEndProgressionToAllPlayers(dates.seasonNumber);
    // Keep the market's OVR/potential index in sync with the progression layer
    // before AI contract decisions and retirement checks run.
    const progressedRaw = usePlayersStore.getState().getRawPlayers();
    for (const raw of progressedRaw as any[]) {
      const playerId = String(raw.ID);
      const marketPlayer = getMarketIndex().byId.get(playerId);
      if (!marketPlayer) continue;
      const rating = Number(raw.OVR);
      const potential = Number(raw.potential);
      const patch: Record<string, any> = {};
      if (Number.isFinite(rating) && rating > 0 && rating !== marketPlayer.ovr) patch.ovr = rating;
      if (Number.isFinite(potential) && potential > 0 && potential !== marketPlayer.potential) patch.potential = potential;
      if (Object.keys(patch).length) updatePlayer(playerId, patch);
    }
    await yieldToUi();

    emitProgress(options, "loans", 30, "Resolviendo cesiones y opciones de compra…");
    const loanReturns = resolveLoansEndOfSeason(dates.endDate, { excludePlayerIds: postSeasonTransferPlayerIds });
    await reconcileAcademyLoans(dates.endDate);
    flushWorldMoves();
    await yieldToUi();

    emitProgress(options, "retirements", 38, "Evaluando retiradas y actualizando edades…");
    const statsNow = usePlayersStore.getState().stats ?? {};
    // Derive date-based ages from the real birthdates and increment only legacy
    // players without a birthdate; that avoids a double +1 for birthday players.
    usePlayersStore.setState({ currentDate: dates.nextStartDate } as any);
    const rawAtNext = usePlayersStore.getState().getRawPlayers();
    const rawById = new Map(rawAtNext.map((player: any) => [String(player.ID), player]));
    const nextStatsWithAge = { ...statsNow } as Record<string, any>;
    for (const raw of rawAtNext as any[]) {
      const playerId = String(raw.ID);
      const previous = nextStatsWithAge[playerId] ?? defaultStats();
      if (!raw.birthdate && previous.ageOverrideSeason !== dates.toSeason) {
        nextStatsWithAge[playerId] = { ...previous, ageOverride: Math.max(0, Number(previous.ageOverride ?? raw.Age ?? 0) + 1), ageOverrideSeason: dates.toSeason };
      }
    }
    usePlayersStore.setState({ stats: nextStatsWithAge, currentDate: dates.nextStartDate } as any);
    const rawAtNextUpdated = usePlayersStore.getState().getRawPlayers();
    const ageById = new Map<string, number>(rawAtNextUpdated.map((player: any) => [String(player.ID), Number(player.Age) || 0] as [string, number]));
    for (const player of getMarketIndex().byId.values()) {
      const age = ageById.get(player.id);
      if (age !== undefined && age > 0 && age !== player.age) updatePlayer(player.id, { age });
    }
    const candidates = Array.from(getMarketIndex().byId.values()).map((player: any) => {
      const stats = usePlayersStore.getState().stats?.[player.id];
      const raw = rawById.get(player.id) as any;
      const injuryDaysRemaining = stats?.injuredUntilDate
        ? Math.max(0, Math.ceil((Date.parse(`${stats.injuredUntilDate}T00:00:00Z`) - Date.parse(`${dates.nextStartDate}T00:00:00Z`)) / 86_400_000))
        : 0;
      return {
        id: player.id,
        name: player.name,
        age: player.age,
        ovr: player.ovr,
        clubId: player.clubId,
        isGoalkeeper: player.group === "GK",
        isLegend: player.ovr >= 90 || Boolean(raw?.isLegend),
        injuryDaysRemaining,
        contractYearsLeft: player.contract.yearsLeft,
        alreadyRetired: Boolean(player.retired),
      };
    });
    const retirements = selectSeasonRetirements(candidates, {
      seed: Number(current.calendarSeed ?? 1), season: current.season, retiredAt: dates.endDate,
    });
    const { ensurePlayersRetired } = await import("../transfers/PlayerIndex");
    ensurePlayersRetired(retirements.map((retirement) => retirement.playerId));
    flushWorldMoves(); syncUserLoanRoster();
    const statsAfterAge = usePlayersStore.getState().stats ?? {};
    const resetStats: Record<string, any> = {};
    for (const [playerId, previous] of Object.entries(statsAfterAge)) {
      resetStats[playerId] = resetPlayerSeasonCounters(previous as any, defaultStats() as any, retroactiveRollover ? originalCurrentDate : dates.nextStartDate);
    }
    usePlayersStore.setState({ stats: resetStats, currentDate: dates.nextStartDate } as any);
    invalidateSquadsCache();
    await yieldToUi();

    // Las retiradas se deciden y se separan de las plantillas ANTES de que
    // expiren los contratos. Así un futbolista retirado no pasa fugazmente por
    // agentes libres ni recibe una renovación de la IA en este mismo cierre.
    emitProgress(options, "contracts", 50, "Procesando renovaciones y vencimientos de contrato…");
    const allTeams = getAllTeams({ teamLeagueOverrides: current.teamLeagueOverrides });
    for (let i = 0; i < allTeams.length; i++) {
      const team = allTeams[i];
      if (team.id === current.myTeamId) continue;
      runClubContractCycle(team.id, { date: dates.endDate, phase: "late-season", reviewList: false, excludePlayerIds: postSeasonTransferPlayerIds });
      if (i % 20 === 0) await yieldToUi();
    }
    advanceContracts(dates.endDate, { excludePlayerIds: postSeasonTransferPlayerIds });
    const userExpiries: Array<{ playerId: string; playerName: string; fromClubId: string }> = [];
    for (const player of getClubPlayers(current.myTeamId)) {
      if (postSeasonTransferPlayerIds.has(player.id) || player.retired) continue;
      const contract = player.contract;
      if (contract.yearsLeft <= 1) {
        userExpiries.push({ playerId: player.id, playerName: player.name, fromClubId: current.myTeamId });
        reassignPlayerClub(player.id, null, "free", { force: true });
        updatePlayer(player.id, { contract: { ...contract, yearsLeft: 0 }, minutesShare: 0, transferListed: false, listReason: null });
      } else {
        updatePlayer(player.id, { contract: { ...contract, yearsLeft: contract.yearsLeft - 1 } });
      }
    }
    flushWorldMoves(); syncUserLoanRoster();
    await yieldToUi();

    emitProgress(options, "academy", 63, "Generando y promoviendo nuevos talentos…");
    const academySeason = dates.nextSeasonStartYear;
    const academyDate = dates.nextStartDate;
    const startedAcademyBatch = await beginAcademyAiFastForward(saveId, academyDate, current.myTeamId);
    try {
      runAcademyAnnualIntakeForAllClubs(academyDate);
      runAcademyPreseasonPromotions(academyDate);
      const academyFlushOk = await flushAcademyAiPendingChanges(saveId);
      if (!academyFlushOk) throw new Error("No se pudieron guardar los cambios de la cantera durante la pretemporada.");
    } finally {
      if (startedAcademyBatch) endAcademyAiFastForward(saveId);
    }
    const academyStore = useAcademyStore.getState();
    await academyStore.ensureClub(current.myTeamId, academySeason, academyDate, { fastForward: true, playLeagueMatch: false });
    await academyStore.addAnnualIntake(current.myTeamId, academySeason);
    await reconcileAcademyLoans(academyDate);
    const academyAfter = await loadAcademySave(saveId);
    if (academyAfter) await saveAcademySave(academyAfter, saveId);
    await yieldToUi();

    emitProgress(options, "competitions", 76, "Preparando las ligas y competiciones de la nueva temporada…");
    const { getFinances: getCurrentFinances } = await import("../transfers/BudgetManager");
    const currentFinancialsBeforeLeagueChanges = new Map(
      allTeams.map((team) => [team.id, { ...getCurrentFinances(team.id) }] as const),
    );
    setActiveTeamLeagueOverrides(domestic.teamLeagueOverrides);
    // Realismo de descenso: los clubes de IA que bajan de categoría suelen
    // perder alguna pieza importante por ambición, cláusulas y necesidad de
    // ajustar salarios. No se liberan jugadores automáticamente: se ponen en
    // venta 1-2 titulares de nivel alto para que el mercado pueda negociar su
    // salida durante la ventana, dejando intactos los clubes del usuario.
    const relegatedAiTeams = movement.movements
      .filter((entry) => String(entry.reason).includes("relegation") && entry.teamId !== current.myTeamId)
      .map((entry) => entry.teamId);
    for (const clubId of relegatedAiTeams) {
      const squad = getClubPlayers(clubId)
        .filter((player) => !player.retired && player.age <= 30 && player.contract.yearsLeft > 1 && !player.transferListed)
        .sort((a, b) => (b.ovr - a.ovr) || (b.value - a.value));
      if (squad.length < 1) continue;
      const clubStrength = squad.reduce((sum, player) => sum + player.ovr, 0) / squad.length;
      const candidates = squad.filter((player) => player.ovr >= Math.max(76, clubStrength + 2)).slice(0, squad.length >= 20 ? 2 : 1);
      for (const player of candidates) updatePlayer(player.id, { transferListed: true, listReason: "needs-cash" });
    }
    for (const player of getMarketIndex().byId.values()) {
      if (!player.clubId || player.retired) continue;
      const leagueId = resolveTeamLeague(player.clubId, { teamLeagueOverrides: domestic.teamLeagueOverrides });
      if (leagueId && player.leagueId !== leagueId) reassignPlayerClub(player.id, player.clubId, leagueId, { force: true });
    }
    await ensureValidAiSquads(allTeams.map((team) => team.id), domestic.teamLeagueOverrides, current.myTeamId, dates.nextStartDate);
    flushWorldMoves(); syncUserLoanRoster();

    emitProgress(options, "economy", 87, "Liquidando ingresos, premios y presupuestos de la nueva temporada…");
    const {
      getFinances,
      setFinances,
      setUserClubBridge,
    } = await import("../transfers/BudgetManager");
    // Ensure the economy adapter always targets this career's user budget,
    // even when the market clock component is temporarily unmounted.
    const userFinanceBeforeEconomy = {
      budget: usePlayersStore.getState().budget,
      wageBudget: usePlayersStore.getState().wageBudget,
      wageBill: usePlayersStore.getState().wageBill,
    };
    try {
      setUserClubBridge({
        clubId: current.myTeamId,
        getBudget: () => usePlayersStore.getState().budget,
        setBudget: (value) => usePlayersStore.setState({ budget: Math.max(0, Math.round(value)) }),
        getWageBudget: () => usePlayersStore.getState().wageBudget,
        setWageBudget: (value) => usePlayersStore.setState({ wageBudget: Math.max(0, Math.round(value)) }),
      });

      const rankedByLeague = new Map<string, Array<{ teamId: string }>>();
      for (const [leagueId, rows] of Object.entries(current.standings ?? {})) {
        const ranked = [...(rows ?? [])].sort((a: any, b: any) =>
          Number(b.points ?? 0) - Number(a.points ?? 0) ||
          Number(b.gd ?? 0) - Number(a.gd ?? 0) ||
          Number(b.gf ?? 0) - Number(a.gf ?? 0) ||
          Number(b.won ?? 0) - Number(a.won ?? 0) ||
          String(a.teamId).localeCompare(String(b.teamId)),
        );
        rankedByLeague.set(leagueId, ranked.map((row: any) => ({ teamId: String(row.teamId) })));
      }
      const positionByTeam = new Map<string, { leagueId: string; position: number; size: number }>();
      for (const [leagueId, rows] of rankedByLeague) {
        rows.forEach((row, index) => positionByTeam.set(row.teamId, { leagueId, position: index + 1, size: rows.length }));
      }
      const teamIdsByCompetition = {
        ucl: new Set<string>([...(current.ucl?.participants ?? []), ...(current.europeanQualification?.ucl ?? [])]),
        uel: new Set<string>([...(current.uel?.participants ?? []), ...(current.europeanQualification?.uel ?? [])]),
        uecl: new Set<string>([...(current.uecl?.participants ?? []), ...(current.europeanQualification?.uecl ?? [])]),
      };
      const nextTeamIdsByCompetition = {
        ucl: new Set<string>(european.europeanQualification?.ucl ?? []),
        uel: new Set<string>(european.europeanQualification?.uel ?? []),
        uecl: new Set<string>(european.europeanQualification?.uecl ?? []),
      };
      const currentEuropeanFor = (teamId: string): "ucl" | "uel" | "uecl" | null =>
        teamIdsByCompetition.ucl.has(teamId) ? "ucl"
          : teamIdsByCompetition.uel.has(teamId) ? "uel"
            : teamIdsByCompetition.uecl.has(teamId) ? "uecl" : null;
      const nextEuropeanFor = (teamId: string): "ucl" | "uel" | "uecl" | null =>
        nextTeamIdsByCompetition.ucl.has(teamId) ? "ucl"
          : nextTeamIdsByCompetition.uel.has(teamId) ? "uel"
            : nextTeamIdsByCompetition.uecl.has(teamId) ? "uecl" : null;
      const currentCupWinners = new Set(Object.values(current.cupChampion ?? {}).filter((id): id is string => typeof id === "string" && id.length > 0));
      const movementsByTeam = new Map(movement.movements.map((entry) => [entry.teamId, entry] as const));
      const financeInputs = allTeams.map((team) => {
        const finance = currentFinancialsBeforeLeagueChanges.get(team.id) ?? getFinances(team.id);
        const liveFinance = getFinances(team.id);
        const previousLeagueId = String(getTeamLeagueId(team.id, { teamLeagueOverrides: current.teamLeagueOverrides }) ?? team.league);
        const nextLeagueId = String(resolveTeamLeague(team.id, { teamLeagueOverrides: domestic.teamLeagueOverrides }) ?? team.league);
        const finalPosition = positionByTeam.get(team.id);
        const movementForTeam = movementsByTeam.get(team.id);
        const euroChampion = current.uclChampion === team.id ? "ucl"
          : current.uelChampion === team.id ? "uel"
            : current.ueclChampion === team.id ? "uecl" : null;
        return {
          clubId: team.id,
          mode: team.id === current.myTeamId ? "user" as const : "ai" as const,
          currentBudget: finance.budget,
          initialBudget: finance.initialBudget,
          wageBudget: finance.wageBudget,
          wageBill: liveFinance.wageBill,
          spent: finance.spent,
          earned: finance.earned,
          previousLeagueId,
          nextLeagueId,
          finalPosition: finalPosition?.position ?? null,
          leagueSize: finalPosition?.size ?? 20,
          promoted: Boolean(movementForTeam && String(movementForTeam.reason).includes("promotion")),
          relegated: Boolean(movementForTeam && String(movementForTeam.reason).includes("relegation")),
          wonDomesticCup: currentCupWinners.has(team.id),
          currentEuropeanCompetition: currentEuropeanFor(team.id),
          nextEuropeanCompetition: nextEuropeanFor(team.id),
          europeanChampion: euroChampion,
          userUclPrizeLedgerAlreadyPaid: (current.uclPrizesAwarded ?? []).includes("participation"),
        };
      });
      lastRolloverStage = "economy:calculate";
      const economyResult = settleSeasonEconomyForCampaign(
        current.season,
        financeInputs,
        current.seasonEconomyLedger ?? [],
      );
      nextSeasonEconomyLedger = economyResult.ledger;
      if (!economyResult.skipped) {
        for (const update of economyResult.updates) {
          if (update.mode === "user") {
            usePlayersStore.setState({
              budget: update.budget,
              wageBudget: update.wageBudget,
              wageBill: update.wageBill,
            } as any);
            userFinanceSummary = {
              teamId: update.clubId,
              fromLeague: String(getTeamLeagueId(update.clubId, { teamLeagueOverrides: current.teamLeagueOverrides }) ?? ""),
              toLeague: String(getTeamLeagueId(update.clubId, { teamLeagueOverrides: domestic.teamLeagueOverrides }) ?? ""),
              previousBudget: update.previousBudget,
              nextBudget: update.budget,
              annualRevenue: update.appliedRevenue,
              promoted: Boolean(movementsByTeam.get(update.clubId) && String(movementsByTeam.get(update.clubId)?.reason).includes("promotion")),
              relegated: Boolean(movementsByTeam.get(update.clubId) && String(movementsByTeam.get(update.clubId)?.reason).includes("relegation")),
            };
          }
          setFinances({
            clubId: update.clubId,
            budget: update.budget,
            initialBudget: update.initialBudget,
            totalBudget: update.totalBudget,
            wageBudget: update.wageBudget,
            wageBill: update.wageBill,
            spent: update.spent,
            earned: update.earned,
          });
        }
      }
    } catch (economyError) {
      // Annual income is non-critical to committing a playable new season. If a
      // migrated/corrupt club record breaks settlement, restore the exact
      // pre-economy budgets, leave the ledger unpaid, report it, and continue.
      console.error("[season-rollover] La liquidación económica falló; se conservan los presupuestos previos y continúa el cambio de temporada.", economyError);
      for (const finance of currentFinancialsBeforeLeagueChanges.values()) {
        setFinances({ ...finance });
      }
      usePlayersStore.setState(userFinanceBeforeEconomy as any);
      nextSeasonEconomyLedger = [...(current.seasonEconomyLedger ?? [])];
      economySettlementFailed = true;
      userFinanceSummary = undefined;
      try {
        const { toast } = await import("sonner");
        toast.warning("La liquidación económica no se ha aplicado", {
          description: "Se han conservado los presupuestos anteriores para no bloquear el inicio de la nueva temporada.",
        });
      } catch {
        // A missing toast host must never prevent the season transition.
      }
    }

    await yieldToUi();

    lastRolloverStage = "next-save:assemble";
    const notifications: NonNullable<SaveGame["seasonNotifications"]> = [];
    for (const expiry of userExpiries) notifications.push(notification("contract_expired", dates.toSeason, dates.nextStartDate, `${expiry.playerName} ha terminado contrato y queda libre.`, { playerId: expiry.playerId, playerName: expiry.playerName, teamId: expiry.fromClubId }));
    for (const retirement of retirements.filter((entry) => entry.lastClubId === current.myTeamId)) {
      notifications.push(notification("player_retired", dates.toSeason, dates.nextStartDate, `${retirement.playerName} se retira a los ${retirement.age} años.`, { playerId: retirement.playerId, playerName: retirement.playerName, teamId: current.myTeamId }));
    }
    const myMovement = movement.movements.find((entry) => entry.teamId === current.myTeamId);
    if (myMovement && String(myMovement.reason).includes("promotion")) {
      notifications.push(notification("promoted", dates.toSeason, dates.nextStartDate, `¡Ascendéis! ${teamById(current.myTeamId).name} jugará en ${domestic.myLeague} la próxima temporada.`, { teamId: current.myTeamId }));
    } else if (myMovement && String(myMovement.reason).includes("relegation")) {
      notifications.push(notification("relegated", dates.toSeason, dates.nextStartDate, `${teamById(current.myTeamId).name} desciende y competirá en ${domestic.myLeague} la próxima temporada.`, { teamId: current.myTeamId }));
    }
    notifications.push(notification("season_started", dates.toSeason, dates.nextStartDate, `Comienza la temporada ${dates.toSeason}. Se han actualizado las plantillas, los calendarios y las plazas europeas.`, { teamId: current.myTeamId }));

    const updatedRaw = usePlayersStore.getState().getRawPlayers();
    const pendingRenewals = getClubPlayers(current.myTeamId)
      .filter((player) => player.contract.yearsLeft <= 1 && !player.retired)
      .map((player) => ({ playerId: player.id, playerName: player.name, yearsLeft: player.contract.yearsLeft, wage: player.contract.wage, expiresAt: `${dates.nextSeasonStartYear + 1}-06-30`, season: dates.toSeason }));

    // Assemble compact line-ups from current ownership, never retaining retired,
    // transferred or loaned-out IDs from the previous campaign.
    const { getClubPlayers: clubPlayersNow } = await import("../transfers/PlayerIndex");
    const nextLineups: Record<string, string[]> = {};
    const nextSubstitutes: Record<string, string[]> = {};
    for (const team of getAllTeams({ teamLeagueOverrides: domestic.teamLeagueOverrides })) {
      const squad = clubPlayersNow(team.id).filter((player: any) => !player.retired);
      const sorted = [...squad].sort((a: any, b: any) => b.ovr - a.ovr || a.id.localeCompare(b.id));
      const previousXI = current.lineups?.[team.id] ?? [];
      const xi = previousXI.filter((id) => sorted.some((player: any) => player.id === id)).slice(0, 11);
      for (const player of sorted) {
        if (xi.length >= 11) break;
        if (!xi.includes(player.id)) xi.push(player.id);
      }
      nextLineups[team.id] = xi;
      nextSubstitutes[team.id] = sorted.map((player: any) => player.id).filter((id) => !xi.includes(id)).slice(0, 12);
    }

    const movementNotifications = notifications;
    let nextSave: SaveGame = {
      ...current,
      ...domestic,
      season: dates.toSeason,
      currentDate: retroactiveRollover ? originalCurrentDate : dates.nextStartDate,
      myLeague: domestic.myLeague,
      teamLeagueOverrides: domestic.teamLeagueOverrides,
      associationCoefficientHistory: european.associationCoefficientHistory,
      europeanQualification: european.europeanQualification,
      lineups: nextLineups,
      substitutes: nextSubstitutes,
      suspensions: {},
      pendingBackgroundSims: [],
      ucl: null,
      uel: null,
      uecl: null,
      uclFixtures: [], uelFixtures: [], ueclFixtures: [],
      uclChampion: null, uelChampion: null, ueclChampion: null,
      uclPrizesAwarded: [], uelPrizesAwarded: [], ueclPrizesAwarded: [],
      cupDrawPending: null,
      seasonRolloverLedger: [...new Set([...(current.seasonRolloverLedger ?? []), current.season])].slice(-80),
      seasonEconomyVersion: 1,
      seasonEconomyLedger: economySettlementFailed
        ? nextSeasonEconomyLedger.slice(-80)
        : nextSeasonEconomyLedger.includes(current.season)
          ? nextSeasonEconomyLedger
          : [...nextSeasonEconomyLedger, current.season].slice(-80),
      retiredPlayers: [...(current.retiredPlayers ?? []), ...retirements].slice(-5000),
      seasonNotifications: [...(current.seasonNotifications ?? []), ...movementNotifications].slice(-250),
      pendingUserContractRenewals: pendingRenewals,
      squadRoleRecalculationKey: undefined,
      academyEvents: current.academyEvents ?? [],
    };
    lastRolloverStage = "competitions:initialize-next-season";
    nextSave = initializeChampionsCompetition(nextSave);
    nextSave = initializeEuropeanCompetition(nextSave, "uel");
    nextSave = initializeEuropeanCompetition(nextSave, "uecl");
    nextSave = recalculateUserSquadRoles(nextSave, true, true);
    const archive = { ...archiveBase, retirements, ...(userFinanceSummary ? { financeSummary: userFinanceSummary } : {}) };
    lastRolloverStage = "archive:persist-final";
    try {
      await persistSeasonArchive(archive);
      archiveSaved = true;
    } catch (archiveError) {
      console.error("[season-rollover] No se pudo guardar el historial de la temporada; se continúa sin el archivo histórico.", archiveError);
      try {
        const { toast } = await import("sonner");
        toast.warning("La temporada se cerrará sin guardar el resumen histórico", {
          description: "El archivo de temporada no se ha podido persistir, pero no se bloqueará el inicio de la siguiente campaña.",
        });
      } catch {
        // Optional UI feedback must not block the transition.
      }
    }
    // The index only needs the archive keys, not deserialized archives. Loading
    // every year's full player-season records here caused another large memory
    // spike on top of the rollover checkpoint and the active save.
    const { getSeasonArchiveIndex } = await import("./seasonHistory");
    const archiveIndex = getSeasonArchiveIndex(saveId);
    nextSave.seasonHistoryIndex = { count: archiveIndex.count, latestSeason: archiveIndex.latestSeason ?? current.season, updatedAt: new Date().toISOString() };

    // Publish the new SaveGame into the authoritative cache first, then rebuild
    // Zustand's user-facing league schedule from the new season. The official
    // fixtures inherit those exact dates, matching fresh-career initialization.
    usePlayersStore.setState({
      currentDate: nextSave.currentDate,
      pendingUserMatch: null,
      lastUserMatchResult: null,
      pendingCupDraw: false,
      pendingUclDraw: null,
      pendingDrawQueue: [],
      dismissedMatchIds: [],
    } as any);
    saveSave(nextSave);
    usePlayersStore.getState().generateLeagueSchedule(nextSave.myTeamId, nextSave.myLeague);
    const scheduledUserFixtures = usePlayersStore.getState().fixtures ?? [];
    if (scheduledUserFixtures.length > 0) {
      const scheduledById = new Map(scheduledUserFixtures.map((fixture: any) => [fixture.id, fixture] as const));
      const officialLeagueFixtures = (nextSave.fixtures?.[nextSave.myLeague] ?? []).map((fixture: any) => {
        const scheduled: any = scheduledById.get(fixture.id);
        return scheduled
          ? { ...fixture, date: scheduled.date, matchday: scheduled.matchday, round: scheduled.round ?? fixture.round }
          : fixture;
      });
      nextSave = {
        ...nextSave,
        fixtures: { ...nextSave.fixtures, [nextSave.myLeague]: officialLeagueFixtures },
      };
    }
    usePlayersStore.setState({ currentDate: nextSave.currentDate } as any);
    // Mark this season boundary as already handled before unlocking MarketClock.
    // This prevents duplicate advanceSeason / end-of-season loans / preseason academy.
    lastRolloverStage = "market:mark-season-committed";
    const { markSeasonRolloverComplete } = await import("../transfers/MarketSimulation");
    markSeasonRolloverComplete(nextSave.currentDate);
    const ps = usePlayersStore.getState();
    ps.syncWageStateFromMarket?.();
    invalidateSquadsCache();
    emitProgress(options, "commit", 92, "Guardando el mercado y preparando la confirmación final…");
    lastRolloverStage = "commit:save-market";
    if (!(await saveTransferSystem())) throw new Error("No se pudo guardar el estado del mercado de fichajes.");
    lastRolloverStage = "commit:publish-save";
    saveSave(nextSave);
    if (!persistCurrentSave(nextSave, { immediate: true })) throw new Error("No se pudo persistir el guardado de la nueva temporada.");
    lastRolloverStage = "commit:flush-save";
    await flushSaveStorage();
    emitProgress(options, "commit", 96, "Confirmando el guardado de la nueva temporada…");
    await persistJournal(journalKey, { version: JOURNAL_VERSION, saveId, fromSeason: current.season, toSeason: dates.toSeason, stage: "committed", updatedAt: new Date().toISOString(), hadArchive });
    removeSaveItem(backupKey);
    removeSaveItem(journalKey);
    removeTransitionCheckpointSidecars(saveId, removeSaveItem);
    await flushSaveStorage();
    emitProgress(options, "commit", 100, `Temporada ${dates.toSeason} preparada.`);
    return nextSave;
  } catch (error) {
    const errorDetails = error instanceof Error
      ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`
      : String(error);
    console.error(`[season-rollover] FALLÓ en la fase "${lastRolloverStage}". Se revierte al punto de recuperación.\n${errorDetails}`, error);
    try {
      if (backup) {
        // Resolve large payloads only on rollback, never during the normal close.
        const rollbackBackup = resolveTransitionBackup(backup, getSaveItem);
        if (!rollbackBackup) throw new Error("No se pudo leer el checkpoint de recuperación de la temporada.");
        await rollbackFromBackup(rollbackBackup);
      } else {
        removeSaveItem(backupKey);
        removeSaveItem(journalKey);
        removeTransitionCheckpointSidecars(saveId, removeSaveItem);
        await flushSaveStorage();
      }
    } catch (rollbackError) {
      console.error("Error recuperando el checkpoint del cambio de temporada:", rollbackError);
    }
    if (worldAttached) detachWorldBridge();
    if (error instanceof Error) throw error;
    throw new Error("Falló el cambio de temporada por un error desconocido.");
  }
}

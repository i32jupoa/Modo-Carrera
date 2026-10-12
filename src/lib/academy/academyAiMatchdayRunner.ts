import { getAllTeams, teamById, type LeagueId } from "@/data/teams";
import { measureCalendarJumpPhase, recordCalendarJumpCounter } from "@/lib/calendarJumpProfiler";
import { buildFullLeagueSchedule, type ScheduleFixture } from "@/lib/leagueSchedule";
import { deriveCareerCalendarSeed } from "@/lib/season/calendarFactory";
import { getCurrentSaveId } from "@/lib/savedGames";
import { clearAcademyAiCacheForSave, hydrateAcademyAiCache, setAcademyAiStateChangeHandler, simulateAcademyLeagueMatchForAiClub } from "./academyPromotionEngine";
import { clearAcademyAiSave, loadAcademyAiSave, saveAcademyAiClubStates } from "./academyAiPersistence";
import type { ClubAcademyState } from "./academyTypes";

const BASE_SEASON = 2026;
const CLUBS_PER_SLICE = 8;
const SCHEDULE_CACHE_LIMIT = 4;
const ACTIVE_SAVE_KEY = "fcsim:save:current";

type LeagueCalendar = Map<string, Set<string>>;
type RuntimeEntry = {
  clubs: Record<string, ClubAcademyState>;
  /** Estados pendientes de persistir durante el salto; se confirman en checkpoints. */
  pendingChanges: Record<string, ClubAcademyState>;
  hydrated: boolean;
  userTeamId?: string;
  lastKnownDate?: string;
  loading?: Promise<void>;
};

const runtimeBySave = new Map<string, RuntimeEntry>();
const scheduleByKey = new Map<string, LeagueCalendar>();
const scheduleLoading = new Map<string, Promise<LeagueCalendar>>();
const invalidatedSaveIds = new Set<string>();
const batchedSaveIds = new Set<string>();

// Si el mercado promociona o hace progresar una cantera durante el salto,
// incorporamos también ese cambio al próximo checkpoint y no lo sobrescribimos
// con una versión anterior guardada antes de la promoción.
setAcademyAiStateChangeHandler((saveId, teamId, state) => {
  if (!batchedSaveIds.has(saveId)) return;
  const runtime = runtimeBySave.get(saveId);
  if (!runtime) return;
  runtime.clubs[teamId] = state;
  runtime.pendingChanges[teamId] = state;
});

function activeSaveIs(saveId: string): boolean {
  if (invalidatedSaveIds.has(saveId)) return false;
  if (getCurrentSaveId() !== saveId) return false;
  if (typeof window !== "undefined") {
    return window.localStorage.getItem(ACTIVE_SAVE_KEY) === saveId;
  }
  return true;
}

function seasonForDate(date: string): number {
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 7 ? year : year - 1;
}

export function shiftAcademyFixtureDateToSeason(date: string, season: number): string {
  const year = Number(date.slice(0, 4)) + (season - BASE_SEASON);
  return `${year}${date.slice(4)}`;
}

export function getAcademyTeamsScheduledForDate(
  calendar: ReadonlyMap<string, ReadonlySet<string>>,
  date: string,
  userTeamId: string,
): string[] {
  return [...(calendar.get(date) ?? [])].filter((teamId) => teamId !== userTeamId).sort();
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

async function ensureRuntime(saveId: string, date: string, userTeamId: string): Promise<RuntimeEntry> {
  let entry = runtimeBySave.get(saveId);
  if (!entry) {
    entry = { clubs: {}, pendingChanges: {}, hydrated: false };
    runtimeBySave.set(saveId, entry);
  }
  entry.userTeamId = userTeamId;
  entry.lastKnownDate = date;
  if (entry.hydrated) return entry;
  if (!entry.loading) {
    entry.loading = (async () => {
      const persisted = await loadAcademyAiSave(saveId);
      if (!activeSaveIs(saveId)) return;
      entry!.clubs = persisted.clubs ?? {};
      hydrateAcademyAiCache(saveId, date, entry!.clubs, userTeamId);
      entry!.hydrated = true;
    })().finally(() => {
      entry!.loading = undefined;
    });
  }
  await entry.loading;
  return entry;
}

function addFixtureToCalendar(calendar: LeagueCalendar, date: string, homeTeam: string, awayTeam: string): void {
  if (!date || !homeTeam || !awayTeam || homeTeam === "__BYE__" || awayTeam === "__BYE__") return;
  let teams = calendar.get(date);
  if (!teams) {
    teams = new Set<string>();
    calendar.set(date, teams);
  }
  teams.add(homeTeam);
  teams.add(awayTeam);
}

async function buildCalendar(
  saveId: string,
  date: string,
  userTeamId: string,
  userLeagueFixtures: readonly ScheduleFixture[],
  fastForward = false,
): Promise<LeagueCalendar> {
  const season = seasonForDate(date);
  const userLeague = teamById(userTeamId).league;
  const key = `${saveId}|${season}|${userLeague}`;
  const cached = scheduleByKey.get(key);
  if (cached) return cached;
  const loading = scheduleLoading.get(key);
  if (loading) return loading;

  const buildPromise = (async () => {
    const calendar: LeagueCalendar = new Map();
    const teams = getAllTeams();
    const leagueIds = [...new Set(teams.map((team) => team.league).filter(Boolean))];
    const clubsPerLeague = new Map<string, number>();
    for (const team of teams) clubsPerLeague.set(team.league, (clubsPerLeague.get(team.league) ?? 0) + 1);
    const actualUserLeagueFixtures = userLeagueFixtures.filter((fixture) => fixture.competition === "Liga" && Boolean(fixture.date));

    for (let index = 0; index < leagueIds.length; index += 1) {
      if (!activeSaveIs(saveId)) return calendar;
      const leagueId = leagueIds[index];
      if ((clubsPerLeague.get(leagueId) ?? 0) < 2) continue;
      try {
        if (leagueId === userLeague && actualUserLeagueFixtures.length > 0) {
          for (const fixture of actualUserLeagueFixtures) {
            addFixtureToCalendar(calendar, fixture.date, fixture.homeTeam, fixture.awayTeam);
          }
        } else {
          const schedule = buildFullLeagueSchedule(leagueId as LeagueId, undefined, {
            seasonStartYear: season,
            seed: deriveCareerCalendarSeed(saveId, season),
          });
          for (const fixture of schedule) {
            addFixtureToCalendar(calendar, fixture.date, fixture.homeTeam, fixture.awayTeam);
          }
        }
      } catch (error) {
        // Una liga irregular no debe impedir que el resto de las academias avance.
        console.warn(`[academy-ai] no se pudo construir calendario de ${leagueId}:`, error);
      }
      // Construimos la tabla repartida en varias tareas para no bloquear el render.
      if (!fastForward && index % 2 === 1) await yieldToBrowser();
    }

    if (activeSaveIs(saveId)) {
      scheduleByKey.set(key, calendar);
      while (scheduleByKey.size > SCHEDULE_CACHE_LIMIT) {
        const firstKey = scheduleByKey.keys().next().value;
        if (firstKey) scheduleByKey.delete(firstKey);
        else break;
      }
    }
    return calendar;
  })();
  scheduleLoading.set(key, buildPromise);
  try {
    return await buildPromise;
  } finally {
    scheduleLoading.delete(key);
  }
}

export interface SimulateAiAcademyMatchdayArgs {
  saveId: string;
  date: string;
  userTeamId: string;
  userLeagueFixtures: readonly ScheduleFixture[];
  /** En salto de calendario se mantienen los cálculos, pero se evitan yields por sublotes. */
  fastForward?: boolean;
}

/**
 * Simula los filiales/juveniles de los clubes de IA cuyo primer equipo juega
 * Liga en esa fecha. Se procesa en rebanadas y se escribe IndexedDB una sola
 * vez por fecha, sin bloquear el handler de Avanzar día.
 */
export async function simulateAiAcademiesForDate(args: SimulateAiAcademyMatchdayArgs): Promise<number> {
  const { saveId, date, userTeamId, userLeagueFixtures, fastForward = false } = args;
  if (!saveId || !activeSaveIs(saveId)) return 0;
  const runtime = await ensureRuntime(saveId, date, userTeamId);
  if (!activeSaveIs(saveId)) return 0;

  const calendar = await measureCalendarJumpPhase("simulation.academy.ai.buildCalendar", () =>
    buildCalendar(saveId, date, userTeamId, userLeagueFixtures, fastForward),
  );
  if (!activeSaveIs(saveId)) return 0;
  const teamIds = getAcademyTeamsScheduledForDate(calendar, date, userTeamId);
  recordCalendarJumpCounter("academy.ai.clubsScheduled", teamIds.length);
  if (teamIds.length === 0) return 0;

  let changed = 0;
  const changedStates: Record<string, ClubAcademyState> = {};
  await measureCalendarJumpPhase("simulation.academy.ai.matchSimulation", async () => {
    for (let offset = 0; offset < teamIds.length; offset += CLUBS_PER_SLICE) {
      if (!activeSaveIs(saveId)) return;
      const slice = teamIds.slice(offset, offset + CLUBS_PER_SLICE);
      for (const teamId of slice) {
        if (!activeSaveIs(saveId)) return;
        const state = simulateAcademyLeagueMatchForAiClub(saveId, teamId, date);
        if (!state) continue;
        runtime.clubs[teamId] = state;
        changedStates[teamId] = state;
        changed += 1;
      }
      // En avance manual se mantiene la cesión al navegador. En salto ya se
      // procesa por checkpoints y no se intercala una tarea por cada sublote.
      if (!fastForward && offset + CLUBS_PER_SLICE < teamIds.length) await yieldToBrowser();
    }
  });

  recordCalendarJumpCounter("academy.ai.clubsSimulated", changed);
  if (changed > 0 && activeSaveIs(saveId)) {
    if (fastForward) {
      // Las stats ya están aplicadas al estado en memoria. Se guarda el último
      // estado de cada club cada siete días y al final del salto; dos partidos
      // del mismo club dentro de un checkpoint quedan acumulados en ese estado.
      Object.assign(runtime.pendingChanges, changedStates);
      recordCalendarJumpCounter("academy.ai.deferredClubWrites", Object.keys(changedStates).length);
    } else {
      const persisted = await measureCalendarJumpPhase("simulation.academy.ai.persist", () =>
        saveAcademyAiClubStates(
          saveId,
          changedStates,
          () => !invalidatedSaveIds.has(saveId),
        ),
      );
      if (!persisted) console.warn(`[academy-ai] no se pudo persistir el estado del ${date}.`);
    }
  }
  return changed;
}

/** Prepara el runtime juvenil antes de empezar un salto y activa la acumulación en memoria. */
export async function beginAcademyAiFastForward(saveId: string, date: string, userTeamId: string): Promise<boolean> {
  if (!saveId || !activeSaveIs(saveId)) return false;
  await ensureRuntime(saveId, date, userTeamId);
  if (!activeSaveIs(saveId)) return false;
  batchedSaveIds.add(saveId);
  return true;
}

/** Deja de acumular cambios en memoria al terminar o abortar el salto. */
export function endAcademyAiFastForward(saveId: string): void {
  batchedSaveIds.delete(saveId);
}

/** Persiste de forma atómica las academias modificadas desde el último checkpoint. */
export async function flushAcademyAiPendingChanges(saveId: string): Promise<boolean> {
  const runtime = runtimeBySave.get(saveId);
  if (!runtime || Object.keys(runtime.pendingChanges).length === 0) return true;
  if (!activeSaveIs(saveId)) return false;

  const snapshot = { ...runtime.pendingChanges };
  const snapshotIds = Object.keys(snapshot);
  recordCalendarJumpCounter("academy.ai.pendingClubsFlushed", snapshotIds.length);
  const persisted = await measureCalendarJumpPhase("simulation.academy.ai.persist", () =>
    saveAcademyAiClubStates(
      saveId,
      snapshot,
      () => activeSaveIs(saveId),
      { yieldBetweenBatches: false },
    ),
  );
  if (!persisted) return false;

  for (const teamId of snapshotIds) {
    if (runtime.pendingChanges[teamId] === snapshot[teamId]) delete runtime.pendingChanges[teamId];
  }
  return true;
}

/** Descarta estados aún no confirmados y restaura el runtime desde IndexedDB. */
export async function discardAcademyAiPendingChanges(saveId: string): Promise<void> {
  const runtime = runtimeBySave.get(saveId);
  if (!runtime || Object.keys(runtime.pendingChanges).length === 0) return;

  const persisted = await loadAcademyAiSave(saveId);
  runtime.clubs = persisted.clubs ?? {};
  runtime.pendingChanges = {};
  clearAcademyAiCacheForSave(saveId);
  hydrateAcademyAiCache(
    saveId,
    runtime.lastKnownDate ?? `${BASE_SEASON}-07-01`,
    runtime.clubs,
    runtime.userTeamId ?? null,
  );
}

export async function hydrateAcademyAiRuntimeForSave(saveId: string, date: string, userTeamId: string): Promise<void> {
  if (!saveId || !activeSaveIs(saveId)) return;
  await ensureRuntime(saveId, date, userTeamId);
}

export async function clearAcademyAiRuntimeForSave(saveId: string): Promise<void> {
  invalidatedSaveIds.add(saveId);
  runtimeBySave.delete(saveId);
  for (const key of scheduleByKey.keys()) if (key.startsWith(`${saveId}|`)) scheduleByKey.delete(key);
  for (const key of scheduleLoading.keys()) if (key.startsWith(`${saveId}|`)) scheduleLoading.delete(key);
  clearAcademyAiCacheForSave(saveId);
  await clearAcademyAiSave(saveId);
}

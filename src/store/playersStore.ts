/**
 * Global player database (EA FC 26 JSON) + mutable season stats.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import playersData from "@/data/players.json";
import { TEAMS, teamById, type LeagueId } from "@/data/teams";
import { defaultLineup, type Player, type Position } from "@/data/players";
import {
  addDaysToIso,
  GAME_START_DATE,
  isMarketOpenForIso,
} from "@/lib/transferWindows";
import {
  buildFullLeagueSchedule,
  mergeScheduleWithPlayed,
  scheduleNeedsRealisticDates,
  type ScheduleFixture,
} from "@/lib/leagueSchedule";
import { rescheduleUnplayedFixtures } from "@/lib/fixtureScheduler";
import { generateLeagueFixtures } from "@/lib/season";
import type { SimResult } from "@/lib/simulation";
import {
  applyFixtureResult,
  involvesTeam,
  simulateScheduleFixture,
  simulateScheduleFixtureDetailed,
  unplayedOnDate,
} from "@/lib/matchEngine";

export type FcPlayer = {
  ID: number;
  Name: string;
  OVR: number;
  PAC: number;
  SHO: number;
  PAS: number;
  DRI: number;
  DEF: number;
  PHY: number;
  Position: string;
  Age: number;
  Team: string;
  League: string;
  card?: string;
};

export const INITIAL_BUDGET = 100_000_000;
export { GAME_START_DATE } from "@/lib/transferWindows";

export type TransferResult =
  | { ok: true }
  | { ok: false; reason: string };

export type PlayerStats = {
  goals: number;
  assists: number;
  appearances: number;
  injuredUntil: number;
  injuryReason?: string;
  morale: number;
  formHistory: number[];
};

const RAW_PLAYERS = playersData as FcPlayer[];
export const PLAYERS_DB_SIZE = RAW_PLAYERS.length;

const TEAM_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  TEAMS.map((t) => [t.name, t.id]),
);

const PLAYERS_BY_TEAM: Record<string, FcPlayer[]> = {};
for (const p of RAW_PLAYERS) {
  if (!PLAYERS_BY_TEAM[p.Team]) PLAYERS_BY_TEAM[p.Team] = [];
  PLAYERS_BY_TEAM[p.Team].push(p);
}

const FC_BY_ID = new Map<string, FcPlayer>(
  RAW_PLAYERS.map((p) => [String(p.ID), p]),
);

function defaultStats(): PlayerStats {
  return {
    goals: 0,
    assists: 0,
    appearances: 0,
    injuredUntil: 0,
    morale: 70,
    formHistory: [],
  };
}

export function mapEaPosition(pos: string): Position {
  if (pos === "GK") return "GK";
  const u = pos.toUpperCase();
  if (["CB", "LB", "RB", "LWB", "RWB", "SW", "LCB", "RCB"].includes(u)) return "DEF";
  if (["ST", "CF", "LW", "RW", "LF", "RF", "LS", "RS"].includes(u)) return "FWD";
  return "MID";
}

function _posCap(pos: string): number {
  const u = pos.toUpperCase();
  if (u === "GK") return 85;
  if (["CB", "LB", "RB", "LWB", "RWB", "SW", "LCB", "RCB"].includes(u)) return 140;
  return 200;
}

function _ageMult(age: number): number {
  if (age <= 20) return 1.0;
  if (age <= 23) return 0.95;
  if (age <= 27) return 0.85;
  if (age <= 30) return 0.65;
  if (age <= 33) return 0.4;
  return 0.2;
}

export function marketValueMillions(ovr: number, age: number, pos = "MID", teamAvgOvr = 75): number {
  if (ovr < 50) return 0.1;
  const cap = _posCap(pos);
  const normalizedOvr = Math.max(0, Math.min(1, (ovr - 50) / 45));
  const base = Math.pow(normalizedOvr, 2.8) * cap;
  const prestige = 1 + Math.max(0, (teamAvgOvr - 75) / 50) * 0.15;
  const value = base * _ageMult(age) * prestige;
  return Math.max(0.1, Math.min(cap, Math.round(value * 10) / 10));
}

export function marketValueEuros(fc: FcPlayer): number {
  return Math.round(marketValueMillions(fc.OVR, fc.Age, fc.Position) * 1_000_000);
}

export function teamInitialBudget(avgOvr: number): number {
  // Piecewise linear interpolation with anchors: 90→160M, 85→125M, 75→35M, 70→13M
  const anchors: [number, number][] = [[90, 160], [85, 125], [75, 35], [70, 13]];
  if (avgOvr >= 90) return 160_000_000;
  for (let i = 0; i < anchors.length - 1; i++) {
    const [ovrHi, budHi] = anchors[i];
    const [ovrLo, budLo] = anchors[i + 1];
    if (avgOvr >= ovrLo) {
      const t = (avgOvr - ovrLo) / (ovrHi - ovrLo);
      return Math.round((budLo + t * (budHi - budLo)) * 1_000_000);
    }
  }
  // Below 70: steep drop to floor
  const below = Math.max(1, 13 - (70 - avgOvr) * 2);
  return Math.round(below * 1_000_000);
}

export function formatEuro(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return m >= 10 ? `€${Math.round(m)}M` : `€${m.toFixed(1)}M`;
  }
  if (amount >= 1_000) return `€${Math.round(amount / 1_000)}K`;
  return `€${amount}`;
}

export const POS_LABEL_ES: Record<Position, string> = {
  GK: "POR",
  DEF: "DEF",
  MID: "MED",
  FWD: "DEL",
};

function syncSquadFromRoster(rosterIds: string[]): FcPlayer[] {
  return rosterIds
    .map((id) => FC_BY_ID.get(id))
    .filter((p): p is FcPlayer => !!p);
}

function fcToPlayer(
  fc: FcPlayer,
  stats: PlayerStats,
  teamIdOverride?: string,
): Player | undefined {
  const teamId = teamIdOverride ?? TEAM_NAME_TO_ID[fc.Team];
  if (!teamId) return undefined;
  const id = String(fc.ID);
  return {
    id,
    name: fc.Name,
    position: mapEaPosition(fc.Position),
    rating: fc.OVR,
    age: fc.Age,
    teamId,
    marketValue: marketValueMillions(fc.OVR, fc.Age, fc.Position),
    isReal: true,
    goals: stats.goals,
    assists: stats.assists,
    appearances: stats.appearances,
    injuredUntil: stats.injuredUntil,
    injuryReason: stats.injuryReason,
    morale: stats.morale,
    formHistory: stats.formHistory,
  };
}

type PlayersState = {
  loaded: boolean;
  myTeamId: string | null;
  squad: FcPlayer[];
  rosterIds: string[];
  budget: number;
  /** ISO date YYYY-MM-DD */
  currentDate: string;
  /** Calendario completo de liga con fechas y resultados */
  fixtures: ScheduleFixture[];
  /** Partido del usuario pendiente de simular (día de partido) */
  pendingUserMatch: ScheduleFixture | null;
  /** Resultado recién simulado (modal post-partido) */
  lastUserMatchResult: SimResult | null;
  stats: Record<string, PlayerStats>;
  /** IDs de partidos cuyo modal de notificación ha sido descartado permanentemente */
  dismissedMatchIds: string[];

  init: () => void;
  advanceTime: (days: number) => number;
  simulateMatch: (matchId: string) => void;
  clearPendingMatch: () => void;
  dismissMatch: (matchId: string) => void;
  resetGameDate: () => void;
  isMarketOpen: () => boolean;
  generateLeagueSchedule: (myTeamId: string, league: LeagueId) => void;
  ensureLeagueSchedule: () => void;
  setMyTeam: (teamId: string, opts?: { resetBudget?: boolean }) => void;
  hydrateMyTeam: () => void;
  clear: () => void;
  resetAllStats: () => void;
  resetBudget: () => void;
  importLegacyStats: (players: Record<string, Player>) => void;

  buyPlayer: (playerId: string, cost: number) => TransferResult;
  sellPlayer: (playerId: string, price: number) => TransferResult;
  isInMyRoster: (playerId: string) => boolean;
  searchMarket: (opts: {
    search: string;
    position: Position | "all";
    limit?: number;
  }) => FcPlayer[];

  getFcSquadByTeamId: (teamId: string) => FcPlayer[];
  getSimPlayer: (playerId: string) => Player | undefined;
  getSimSquad: (teamId: string) => Player[];
  getSimXI: (teamId: string, lineupIds: string[], leagueMatchday: number) => Player[];

  recordAppearance: (playerId: string) => void;
  recordGoal: (playerId: string) => void;
  recordAssist: (playerId: string) => void;
  recordInjury: (playerId: string, injuredUntil: number, reason: string) => void;
};

export const usePlayersStore = create<PlayersState>()(
  persist(
    (set, get) => ({
      loaded: false,
      myTeamId: null,
      squad: [],
      rosterIds: [],
      budget: INITIAL_BUDGET,
      currentDate: GAME_START_DATE,
      fixtures: [],
      pendingUserMatch: null,
      lastUserMatchResult: null,
      stats: {},
      dismissedMatchIds: [],

      generateLeagueSchedule: (_myTeamId, league) => {
        set({
          fixtures: buildFullLeagueSchedule(league),
          pendingUserMatch: null,
          lastUserMatchResult: null,
        });
      },

      ensureLeagueSchedule: () => {
        const { myTeamId, fixtures } = get();
        if (!myTeamId) return;
        const team = teamById(myTeamId);
        const league = team.league;
        const full = buildFullLeagueSchedule(league);
        if (fixtures.length === 0) {
          set({ fixtures: full });
          return;
        }
        if (fixtures.length < full.length) {
          set({ fixtures: mergeScheduleWithPlayed(full, fixtures, league) });
          return;
        }
        if (scheduleNeedsRealisticDates(fixtures)) {
          set({
            fixtures: rescheduleUnplayedFixtures(
              fixtures,
              generateLeagueFixtures(league),
            ),
          });
        }
      },

      clearPendingMatch: () =>
        set({ pendingUserMatch: null, lastUserMatchResult: null }),

      dismissMatch: (matchId) =>
        set((state) => ({
          dismissedMatchIds: [...state.dismissedMatchIds, matchId],
          pendingUserMatch: null,
          lastUserMatchResult: null,
        })),

      simulateMatch: (matchId) => {
        const state = get();
        state.init();
        const fixture = state.fixtures.find((f) => f.id === matchId);
        if (!fixture || fixture.isPlayed) return;

        const sim = simulateScheduleFixtureDetailed(fixture, (teamId, matchday) =>
          state.getSimXI(teamId, [], matchday),
        );
        const scores = {
          homeScore: sim.homeGoals,
          awayScore: sim.awayGoals,
        };
        let nextFixtures = applyFixtureResult(state.fixtures, matchId, scores);

        const sameDay = unplayedOnDate(nextFixtures, fixture.date).filter(
          (f) => f.id !== matchId && !involvesTeam(f, state.myTeamId!),
        );
        for (const other of sameDay) {
          const otherScores = simulateScheduleFixture(other, (teamId, md) =>
            state.getSimXI(teamId, [], md),
          );
          nextFixtures = applyFixtureResult(nextFixtures, other.id, otherScores);
        }

        set({
          fixtures: nextFixtures,
          lastUserMatchResult: sim,
        });
      },

      advanceTime: (days) => {
        if (days <= 0) return 0;
        const state = get();
        
        if (!state.myTeamId) {
          set({ currentDate: addDaysToIso(state.currentDate, days) });
          return days;
        }
        
        state.init();

        const onDay = unplayedOnDate(state.fixtures, state.currentDate);
        const userMatch = onDay.find((f) => involvesTeam(f, state.myTeamId!));
        if (userMatch) return 0;

        if (get().pendingUserMatch) return 0;

        let date = state.currentDate;
        let fixtures = state.fixtures;
        let advanced = 0;
        let pendingUserMatch: ScheduleFixture | null = null;

        const simFixture = (f: ScheduleFixture) => {
          const scores = simulateScheduleFixture(f, (teamId, md) =>
            get().getSimXI(teamId, [], md),
          );
          fixtures = applyFixtureResult(fixtures, f.id, scores);
        };

        for (let d = 0; d < days; d++) {
          const nextDate = addDaysToIso(date, 1);
          const onDay = unplayedOnDate(fixtures, nextDate);
          const userMatch = onDay.find((f) =>
            involvesTeam(f, state.myTeamId!),
          );

          if (userMatch) {
            for (const f of onDay) {
              if (f.id !== userMatch.id) simFixture(f);
            }
            date = nextDate;
            advanced++;
            pendingUserMatch = fixtures.find((f) => f.id === userMatch.id) ?? userMatch;
            break;
          }

          for (const f of onDay) simFixture(f);
          date = nextDate;
          advanced++;
        }

        set({
          currentDate: date,
          fixtures,
          pendingUserMatch,
        });
        return advanced;
      },

      resetGameDate: () => set({ currentDate: GAME_START_DATE }),

      isMarketOpen: () => isMarketOpenForIso(get().currentDate),

      init: () => {
        if (get().loaded) return;
        queueMicrotask(() => {
          set({ loaded: true });
          const teamId = get().myTeamId;
          if (teamId) get().hydrateMyTeam();
        });
      },

      setMyTeam: (teamId, opts) => {
        const team = teamById(teamId);
        const defaultSquad = PLAYERS_BY_TEAM[team.name] ?? [];
        const rosterIds = defaultSquad.map((p) => String(p.ID));
        const prev = get();
        const avgOvr = defaultSquad.length > 0
          ? Math.round(defaultSquad.reduce((s, p) => s + p.OVR, 0) / defaultSquad.length)
          : Math.round((team.att + team.mid + team.def) / 3);
        set({
          myTeamId: teamId,
          rosterIds,
          squad: defaultSquad,
          budget:
            opts?.resetBudget || prev.myTeamId !== teamId
              ? teamInitialBudget(avgOvr)
              : prev.budget,
        });
      },

      hydrateMyTeam: () => {
        const { myTeamId, rosterIds } = get();
        if (!myTeamId) return;
        if (rosterIds.length === 0) {
          const team = teamById(myTeamId);
          const defaultSquad = PLAYERS_BY_TEAM[team.name] ?? [];
          const ids = defaultSquad.map((p) => String(p.ID));
          set({ rosterIds: ids, squad: defaultSquad });
          return;
        }
        set({ squad: syncSquadFromRoster(rosterIds) });
      },

      clear: () =>
        set({
          squad: [],
          rosterIds: [],
          myTeamId: null,
          budget: INITIAL_BUDGET,
          currentDate: GAME_START_DATE,
          fixtures: [],
          pendingUserMatch: null,
          lastUserMatchResult: null,
          dismissedMatchIds: [],
        }),

      resetAllStats: () => set({ stats: {} }),

      resetBudget: () => set({ budget: INITIAL_BUDGET }),

      isInMyRoster: (playerId) => get().rosterIds.includes(playerId),

      buyPlayer: (playerId, cost) => {
        const state = get();
        if (!isMarketOpenForIso(state.currentDate)) {
          return {
            ok: false,
            reason: "El mercado de fichajes está cerrado. Avanza el calendario a una ventana de mercado.",
          };
        }
        if (!state.myTeamId) {
          return { ok: false, reason: "No hay equipo seleccionado." };
        }
        if (state.rosterIds.includes(playerId)) {
          return { ok: false, reason: "El jugador ya está en tu plantilla." };
        }
        const fc = FC_BY_ID.get(playerId);
        if (!fc) return { ok: false, reason: "Jugador no encontrado." };
        if (state.budget < cost) {
          return {
            ok: false,
            reason: `Presupuesto insuficiente (disponible: ${formatEuro(state.budget)}).`,
          };
        }
        const rosterIds = [...state.rosterIds, playerId];
        set({
          budget: state.budget - cost,
          rosterIds,
          squad: syncSquadFromRoster(rosterIds),
        });
        return { ok: true };
      },

      sellPlayer: (playerId, price) => {
        const state = get();
        if (!isMarketOpenForIso(state.currentDate)) {
          return {
            ok: false,
            reason: "El mercado de fichajes está cerrado. Avanza el calendario a una ventana de mercado.",
          };
        }
        if (!state.myTeamId) {
          return { ok: false, reason: "No hay equipo seleccionado." };
        }
        if (!state.rosterIds.includes(playerId)) {
          return { ok: false, reason: "El jugador no está en tu plantilla." };
        }
        if (state.rosterIds.length <= 11) {
          return {
            ok: false,
            reason: "Debes mantener al menos 11 jugadores en la plantilla.",
          };
        }
        const rosterIds = state.rosterIds.filter((id) => id !== playerId);
        set({
          budget: state.budget + price,
          rosterIds,
          squad: syncSquadFromRoster(rosterIds),
        });
        return { ok: true };
      },

      searchMarket: ({ search, position, limit = 100 }) => {
        const inRoster = new Set(get().rosterIds);
        const q = search.trim().toLowerCase();
        const out: FcPlayer[] = [];
        for (const p of RAW_PLAYERS) {
          const id = String(p.ID);
          if (inRoster.has(id)) continue;
          if (position !== "all" && mapEaPosition(p.Position) !== position) continue;
          if (q && !p.Name.toLowerCase().includes(q)) continue;
          out.push(p);
        }
        out.sort((a, b) => b.OVR - a.OVR);
        return out.slice(0, limit);
      },

      importLegacyStats: (players) => {
        const next = { ...get().stats };
        for (const p of Object.values(players)) {
          next[p.id] = {
            goals: p.goals,
            assists: p.assists,
            appearances: p.appearances,
            injuredUntil: p.injuredUntil,
            injuryReason: p.injuryReason,
            morale: p.morale,
            formHistory: p.formHistory ?? [],
          };
        }
        set({ stats: next });
      },

      getFcSquadByTeamId: (teamId) => {
        const { myTeamId, rosterIds } = get();
        if (myTeamId === teamId && rosterIds.length > 0) {
          return syncSquadFromRoster(rosterIds);
        }
        const team = teamById(teamId);
        if (!team) {
          console.warn(`Team not found for ID: ${teamId}`);
          return [];
        }
        const squad = PLAYERS_BY_TEAM[team.name];
        if (!squad) {
          console.warn(`No players found for team: ${team.name} (ID: ${teamId})`);
          return [];
        }
        return squad;
      },

      getSimPlayer: (playerId) => {
        const fc = FC_BY_ID.get(playerId);
        if (!fc) return undefined;
        const stats = get().stats[playerId] ?? defaultStats();
        const { myTeamId, rosterIds } = get();
        const teamIdOverride =
          myTeamId && rosterIds.includes(playerId) ? myTeamId : undefined;
        return fcToPlayer(fc, stats, teamIdOverride);
      },

      getSimSquad: (teamId) => {
        const posOrder: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
        const squad = get().getFcSquadByTeamId(teamId);
        if (!squad || squad.length === 0) {
          console.warn(`Empty squad for team: ${teamId}`);
          return [];
        }
        return squad
          .map((fc) => get().getSimPlayer(String(fc.ID)))
          .filter((p): p is Player => !!p)
          .sort(
            (a, b) =>
              posOrder[a.position] - posOrder[b.position] || b.rating - a.rating,
          );
      },

      getSimXI: (teamId, lineupIds, leagueMatchday) => {
        const unavailable = new Set(
          get()
            .getSimSquad(teamId)
            .filter((p) => p.injuredUntil > leagueMatchday)
            .map((p) => p.id),
        );
        const xi = lineupIds
          .map((id) => get().getSimPlayer(id))
          .filter((p): p is Player => !!p && !unavailable.has(p.id));
        if (xi.length >= 11) return xi.slice(0, 11);
        const squad = get().getSimSquad(teamId);
        const auto = defaultLineup(squad, unavailable)
          .map((id) => get().getSimPlayer(id))
          .filter((p): p is Player => !!p);
        return auto.slice(0, 11);
      },

      recordAppearance: (playerId) => {
        const next = { ...get().stats };
        const s = next[playerId] ?? defaultStats();
        next[playerId] = { ...s, appearances: s.appearances + 1 };
        set({ stats: next });
      },

      recordGoal: (playerId) => {
        const next = { ...get().stats };
        const s = next[playerId] ?? defaultStats();
        next[playerId] = { ...s, goals: s.goals + 1 };
        set({ stats: next });
      },

      recordAssist: (playerId) => {
        const next = { ...get().stats };
        const s = next[playerId] ?? defaultStats();
        next[playerId] = { ...s, assists: s.assists + 1 };
        set({ stats: next });
      },

      recordInjury: (playerId, injuredUntil, reason) => {
        const next = { ...get().stats };
        const s = next[playerId] ?? defaultStats();
        next[playerId] = { ...s, injuredUntil, injuryReason: reason };
        set({ stats: next });
      },
    }),
    {
      name: "fcsim:players:v1",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<PlayersState>),
        currentDate:
          (persisted as Partial<PlayersState>)?.currentDate ?? GAME_START_DATE,
        fixtures: (persisted as Partial<PlayersState>)?.fixtures ?? [],
      }),
      partialize: (s) => ({
        stats: s.stats,
        myTeamId: s.myTeamId,
        rosterIds: s.rosterIds,
        budget: s.budget,
        currentDate: s.currentDate,
        fixtures: s.fixtures,
        dismissedMatchIds: s.dismissedMatchIds,
      }),
    },
  ),
);

/** @deprecated Use usePlayersStore — kept for existing imports */
export const useUserTeam = usePlayersStore;

export function playersStoreInit() {
  usePlayersStore.getState().init();
}

export function selectTopScorers(
  leagueFilter?: LeagueId,
  limit = 30,
): Player[] {
  const store = usePlayersStore.getState();
  store.init();
  const out: Player[] = [];
  for (const [id, st] of Object.entries(store.stats)) {
    if (st.goals <= 0) continue;
    const p = store.getSimPlayer(id);
    if (!p) continue;
    if (leagueFilter && teamById(p.teamId).league !== leagueFilter) continue;
    out.push(p);
  }
  return out
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, limit);
}

export function selectTopAssisters(
  leagueFilter?: LeagueId,
  limit = 30,
): Player[] {
  const store = usePlayersStore.getState();
  store.init();
  const out: Player[] = [];
  for (const [id, st] of Object.entries(store.stats)) {
    if (st.assists <= 0) continue;
    const p = store.getSimPlayer(id);
    if (!p) continue;
    if (leagueFilter && teamById(p.teamId).league !== leagueFilter) continue;
    out.push(p);
  }
  return out
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals)
    .slice(0, limit);
}

export function selectInjuredPlayers(
  matchdaysByLeague: Record<LeagueId, number>,
  teamId?: string,
): Player[] {
  const store = usePlayersStore.getState();
  store.init();
  const out: Player[] = [];
  for (const [id, st] of Object.entries(store.stats)) {
    if (st.injuredUntil <= 0) continue;
    const p = store.getSimPlayer(id);
    if (!p) continue;
    const md = matchdaysByLeague[teamById(p.teamId).league];
    if (st.injuredUntil <= md) continue;
    if (teamId && p.teamId !== teamId) continue;
    out.push(p);
  }
  return out.sort((a, b) => a.injuredUntil - b.injuredUntil);
}

export function buildDefaultLineups(): Record<string, string[]> {
  const store = usePlayersStore.getState();
  store.init();
  const lineups: Record<string, string[]> = {};
  for (const t of TEAMS) {
    const squad = store.getSimSquad(t.id);
    lineups[t.id] = defaultLineup(squad);
  }
  return lineups;
}

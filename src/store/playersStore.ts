/**

 * Global player database (EA FC 26 JSON) + mutable season stats.

 */



import { create } from "zustand";

import { persist, createJSONStorage } from "zustand/middleware";

import playersData from "@/data/players.json";

import { TEAMS, teamById, leagueIdFromName, type LeagueId } from "@/data/teams";

import { defaultLineup, type Player, type Position, marketValueFor } from "@/data/players";

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



// Sophisticated market valuation using the new Transfermarkt-style system
export function marketValueMillions(ovr: number, age: number, pos = "MID", teamId = "", leagueId = "", isStar = false, teamAvgRating = 75): number {
  const result = marketValueFor(ovr, age, pos, teamId, leagueId, 0, 0, 0, isStar, teamAvgRating);
  return result.value;
}

export function marketValueEuros(fc: FcPlayer, teamId = "", leagueId = "", teamAvgRating = 75): number {
  const isStar = fc.OVR >= 82;
  // If leagueId not provided, get it from player's league name
  const effectiveLeagueId = leagueId || leagueIdFromName(fc.League || "");
  return Math.round(marketValueMillions(fc.OVR, fc.Age, fc.Position, teamId, effectiveLeagueId, isStar, teamAvgRating) * 1_000_000);
}



export function teamInitialBudget(avgOvr: number, leagueId = ""): number {

  // Piecewise linear interpolation with anchors: 90→160M, 85→125M, 75→35M, 70→13M

  const anchors: [number, number][] = [[90, 160], [85, 125], [75, 35], [70, 13]];

  let budget = 160_000_000;

  if (avgOvr >= 90) {
    budget = 160_000_000;
  } else {
    let found = false;
    for (let i = 0; i < anchors.length - 1; i++) {
      const [ovrHi, budHi] = anchors[i];
      const [ovrLo, budLo] = anchors[i + 1];
      if (avgOvr >= ovrLo) {
        const t = (avgOvr - ovrLo) / (ovrHi - ovrLo);
        budget = Math.round((budLo + t * (budHi - budLo)) * 1_000_000);
        found = true;
        break;
      }
    }
    if (!found) {
      // Below 70: steep drop to floor
      const below = Math.max(1, 13 - (70 - avgOvr) * 2);
      budget = Math.round(below * 1_000_000);
    }
  }

  // +40% global increase for all teams
  budget = Math.round(budget * 1.40);

  // 20% discount for teams NOT in top 5 leagues (except specific leagues)
  const top5Leagues = new Set(["laliga", "premier", "seriea", "bundesliga", "ligue1"]);
  
  // Leagues that should NOT have the 20% discount: Portugal, Belgium, Turkey, Netherlands
  const noDiscountLeagues = new Set([
    "ligaportugal",      // Liga Portugal
    "1aproleague",       // 1A Pro League (Belgium)
    "trendyolsperlig",   // Trendyol Süper Lig (Turkey)
    "eredivisie",        // Eredivisie (Netherlands)
  ]);
  
  // Saudi League gets +450% bonus instead of discount
  const saudiLeagueId = "roshnsaudileague"; // ROSHN Saudi League
  
  if (leagueId === saudiLeagueId) {
    // +450% bonus for Saudi teams (budget * 5.5 = original + 450%)
    budget = Math.round(budget * 5.5);
  } else if (leagueId && !top5Leagues.has(leagueId) && !noDiscountLeagues.has(leagueId)) {
    // -20% for non-top-5 leagues (except the ones listed above)
    budget = Math.round(budget * 0.8);
  }

  return budget;

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

  let teamId = teamIdOverride ?? TEAM_NAME_TO_ID[fc.Team];

  // For dynamic teams not in TEAM_NAME_TO_ID, look up by normalized name

  if (!teamId && fc.Team) {

    const normalizedName = fc.Team.toLowerCase().replace(/[^a-z0-9]/g, '');

    const team = teamById(normalizedName);

    if (team && team.name === fc.Team) {

      teamId = team.id;

    }

  }

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

  getRawPlayers: () => FcPlayer[];



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

          const result = simulateScheduleFixtureDetailed(f, (teamId, md) =>

            get().getSimXI(teamId, [], md),

          );

          // Record stats from simulation events
          const homeXI = get().getSimXI(f.homeTeam, [], f.matchday);
          const awayXI = get().getSimXI(f.awayTeam, [], f.matchday);
          
          // Record appearances for all starters
          for (const p of [...homeXI, ...awayXI]) {
            get().recordAppearance(p.id);
          }
          
          // Record goals and assists from events
          for (const ev of result.events) {
            if (ev.type === "goal") {
              get().recordGoal(ev.scorerId);
              if (ev.assistId) {
                get().recordAssist(ev.assistId);
              }
            }
          }

          fixtures = applyFixtureResult(fixtures, f.id, { 
            homeScore: result.homeGoals, 
            awayScore: result.awayGoals 
          });

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

              ? teamInitialBudget(avgOvr, team.league)

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

      getRawPlayers: () => RAW_PLAYERS,



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

    if (teamId && String(p.teamId) !== String(teamId)) continue;

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


// @ts-nocheck
import { persistCurrentSave } from "./savedGames";
import {
  LeagueId,
  TEAMS,
  teamById,
  teamsByLeague,
  LEAGUES,
  LEAGUES_BY_COUNTRY,
  getPrimaryLeagueForCountry,
  Team,
} from "@/data/teams";
import { type PosCode, canPlayPosition, isNaturalFor } from "@/lib/positions";

// Funciones auxiliares para determinar tipo de jugador basado en posiciones específicas
function isGoalkeeper(positions: PosCode[]): boolean {
  return positions.includes("GK");
}

function isDefensive(positions: PosCode[]): boolean {
  return positions.some((p) => ["DFC", "LD", "LI", "CAD", "CAI"].includes(p));
}

function isMidfield(positions: PosCode[]): boolean {
  return positions.some((p) => ["MCD", "MC", "MCO", "MD", "MI"].includes(p));
}

function isAttacking(positions: PosCode[]): boolean {
  return positions.some((p) => ["ED", "EI", "DC", "SD"].includes(p));
}

import { Player, defaultLineup } from "@/data/players";

import {
  buildDefaultLineups,
  playersStoreInit,
  selectInjuredPlayers,
  selectTopAssisters,
  selectTopScorers,
  usePlayersStore,
  withPlayerStatsBatch,
  withPlayerStatsBatchAsync,
} from "@/store/playersStore";

import {
  applyResult,
  emptyStandings,
  Fixture,
  generateLeagueFixtures,
  sortStandings,
  Standing,
} from "@/lib/season";

import { addDaysToIso } from "@/lib/transferWindows";
import { applyMonthlyProgressionToAll } from "@/lib/monthlyProgression";
import { applySeasonEndProgressionToAll } from "@/lib/seasonEndProgression";
import { applySeasonEndProgressionToPlayer } from "@/lib/progressionHelper";
import { applyMonthlyProgressionToPlayer } from "@/lib/progressionHelper";
import type { DynamicPlayerStats } from "@/types/playerStats";
import { invalidateSquadsCache, generateAllSquads } from "@/data/players";

/**
 * Parse season string (e.g., "2025-26") to season number (e.g., 1)
 */
function parseSeasonNumber(season: string): number {
  const startYear = parseInt(season.split("-")[0]);
  return startYear - 2025 + 1; // 2025-26 is season 1
}

/**
 * Apply season-end progression to all players in the players store
 */
function applySeasonEndProgressionToAllPlayers(seasonNumber: number): void {
  const store = usePlayersStore.getState();
  const allStats = store.stats;

  // Apply season-end progression to each player's dynamic stats
  for (const [playerId, stats] of Object.entries(allStats)) {
    if (!stats.dynamicStats) continue;

    // Get player info for age and positions
    const player = store.getSimPlayer(playerId);
    if (!player) continue;

    const { updatedStats, newOVR } = applySeasonEndProgressionToPlayer(
      player,
      stats.dynamicStats,
      seasonNumber,
    );

    // Update the stats with the modified dynamic stats
    store.mutatePlayerStat(playerId, (s) => ({
      ...s,
      dynamicStats: updatedStats,
    }));
  }

  // Invalidate squads cache so new ratings are used when squads are regenerated
  invalidateSquadsCache();
}

/**
 * Apply monthly progression to all players in the players store
 */
function applyMonthlyProgressionToAllPlayers(currentMonth: number, currentYear: number): void {
  const store = usePlayersStore.getState();
  const allStats = store.stats;

  // Apply monthly progression to each player's dynamic stats
  for (const [playerId, stats] of Object.entries(allStats)) {
    if (!stats.dynamicStats) continue;

    // Get player info for age and positions
    const player = store.getSimPlayer(playerId);
    if (!player) continue;

    const { updatedStats, newOVR } = applyMonthlyProgressionToPlayer(
      player,
      stats.dynamicStats,
      currentMonth,
      currentYear,
    );

    // Update the stats with the modified dynamic stats
    store.mutatePlayerStat(playerId, (s) => ({
      ...s,
      dynamicStats: updatedStats,
    }));
  }

  // Invalidate squads cache so new ratings are used when squads are regenerated
  invalidateSquadsCache();

  // Regenerate squads with updated dynamic stats
  generateAllSquads(allStats);
}

import {
  simulateMatch,
  simulateMatchFast,
  simulateCupMatch,
  SimResult,
  MatchEvent,
  InjuryEvent,
  CardEvent,
  simulateExtraTime,
  simulatePenaltyShootout,
} from "@/lib/simulation";
import { loadTactics } from "@/lib/teamTactics";

import {
  buildNextRound,
  CUP_SCHEDULE,
  getCupScheduleForSize,
  initCup,
  initUCL,
  UCL_SCHEDULE,
  getCupStructureForCountry,
} from "@/lib/cups";

import {
  UCL_CALENDAR,
  UCL_START,
  UCL_SEASON1_IDS,
  emptyTableEntry,
  sortUCLTable,
  applyUCLResult as applyUCLTableResult,
  isUCLLeaguePhaseFixture,
  type UCLState,
} from "@/data/ucl";

import {
  runSwissDraw,
  assignmentsToFixtures,
  buildFullUCLBracket,
  propagatePlayoffWinnerToR16Fixtures,
  isRealTeamId,
  getAggregateWinner,
  updateBracketWithWinners,
} from "@/lib/uclDraw";
import { UCL_SIMULATION_DAYS } from "@/data/ucl";

import {
  ALL_FORMATIONS,
  FORMATION_COORDINATES,
  slotPosCode,
  type FormationName,
} from "@/lib/formations";
import { FIVE_DEFENDER_TEAMS, getTeamStyle, formationsForStyle } from "@/lib/teamProfile";

// Generate a CPU XI using a random (or specified) formation, always returning exactly 11 players

// Returns ids in slot order so MiniPitch can position them correctly by role

/**
 * Coloca 11 jugadores disponibles en los huecos de una formación concreta,
 * respetando su demarcación real (natural o adaptable), igual que el 11
 * ideal de /equipos (ver `estimatedEleven` en teamProfile.ts). Devuelve los
 * ids en el mismo orden que los huecos de la formación (Object.keys), que es
 * el orden que espera <MiniPitch> para pintar cada jugador en su sitio.
 */
function pickXIForFormation(
  squad: Player[],
  unavailable: Set<string>,
  formation: FormationName,
): { ids: string[]; score: number } {
  const coords = FORMATION_COORDINATES[formation];
  const slotKeys = Object.keys(coords);
  const available = squad.filter((p) => !unavailable.has(p.id));
  const used = new Set<string>();
  const slotIds: (string | null)[] = new Array(slotKeys.length).fill(null);
  let score = 0;

  slotKeys.forEach((key, idx) => {
    const required = slotPosCode(key);
    const candidates = available
      .filter((p) => !used.has(p.id))
      .map((p) => ({
        p,
        natural: isNaturalFor(p.positions, required),
        can: canPlayPosition(p.positions, required),
      }))
      .filter((c) => c.can)
      .sort((a, b) => b.p.rating - a.p.rating || (b.natural ? 1 : 0) - (a.natural ? 1 : 0));

    if (candidates.length > 0) {
      const pick = candidates[0];
      used.add(pick.p.id);
      slotIds[idx] = pick.p.id;
      score += pick.p.rating - (pick.natural ? 0 : 5);
    } else {
      // Hueco sin candidato natural/adaptable disponible (p.ej. plantilla muy
      // corta de una demarcación por lesiones). Se rellenará después con el
      // mejor jugador libre que quede, para no salir a jugar con menos de 11.
      score -= 40;
    }
  });

  if (slotIds.some((id) => id === null)) {
    const leftovers = available.filter((p) => !used.has(p.id)).sort((a, b) => b.rating - a.rating);
    for (let i = 0; i < slotIds.length; i++) {
      if (slotIds[i] === null && leftovers.length > 0) {
        const p = leftovers.shift()!;
        slotIds[i] = p.id;
        used.add(p.id);
      }
    }
  }

  return { ids: slotIds.filter((id): id is string => !!id), score };
}

// Genera el once de un equipo CPU eligiendo, entre el catálogo de
// formaciones típicas de su estilo de juego (ofensivo / equilibrado /
// defensivo — el mismo catálogo que el 11 ideal de /equipos), la que mejor
// encaje con los jugadores realmente disponibles en ese momento (se excluyen
// lesionados y sancionados vía `unavailable`). Así, si un titular habitual
// no puede jugar, tanto la alineación como la táctica se adaptan a lo que
// queda en la plantilla, en vez de forzar siempre el mismo dibujo.
function generateCPUXI(
  squad: Player[],
  unavailable: Set<string>,
  team: Team,
  forcedFormation?: FormationName,
): { ids: string[]; formation: FormationName } {
  if (forcedFormation) {
    const { ids } = pickXIForFormation(squad, unavailable, forcedFormation);
    return { ids, formation: forcedFormation };
  }

  const { style } = getTeamStyle(team);
  const candidateFormations = formationsForStyle(style);

  let best: { ids: string[]; formation: FormationName; score: number } | null = null;
  for (const formation of candidateFormations) {
    const picked = pickXIForFormation(squad, unavailable, formation);
    const fiveBackBonus = FIVE_DEFENDER_TEAMS.has(team.name) && formation.includes("5-") ? 12 : 0;
    const score = picked.score + fiveBackBonus;
    if (!best || score > best.score) {
      best = { ids: picked.ids, formation, score };
    }
  }

  return { ids: best!.ids, formation: best!.formation };
}

// Helper to determine winner of a cup match (considering extra time and penalties)

function getCupMatchWinner(result: any): "home" | "away" {
  if (!result) return "home";

  // If penalties exist, they determine the winner

  if (result.penalties) {
    return result.penalties.homeGoals >= result.penalties.awayGoals ? "home" : "away";
  }

  // If extra time exists, use total score (regular + extra time)

  if (result.extraTime) {
    const totalHome = result.homeGoals + result.extraTime.homeGoals;

    const totalAway = result.awayGoals + result.extraTime.awayGoals;

    return totalHome >= totalAway ? "home" : "away";
  }

  // Regular time only

  return result.homeGoals >= result.awayGoals ? "home" : "away";
}

/**







 * Fix cup draws that were simulated before extra time/penalty logic was implemented







 * This function adds extra time and penalty data to cup matches that ended in draws







 */

export function fixCupDraws(save: SaveGame): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));

  let fixed = false;

  // Detect stale cup fixtures generated with old offsets (pre-league-anchored schedule).

  // New schedule: Preliminar matchday=63, R32 matchday=98. Old schedule had matchday<=20.

  // If any fixture has matchday < 63, the league's cup data is outdated → reset.

  for (const lg of Object.keys(next.cupFixtures) as LeagueId[]) {
    const list = next.cupFixtures[lg];

    if (!list || list.length === 0) continue;

    const stale = list.some((f: any) => (f.matchday as number) < 63);

    if (stale) {
      next.cupFixtures[lg] = [];

      delete (next.cupFixtures as any)[`${lg}_structure`];
    }
  }

  for (const lg of Object.keys(next.cupFixtures) as LeagueId[]) {
    const cupFixtures = next.cupFixtures[lg];

    if (!cupFixtures) continue;

    for (let i = 0; i < cupFixtures.length; i++) {
      const f = cupFixtures[i];

      if (!f.result) continue;

      // Check if this is a draw without extra time/penalty data

      if (f.result.homeGoals === f.result.awayGoals && !f.result.extraTime && !f.result.penalties) {
        console.log(
          `[fixCupDraws] Fixing draw in fixture ${f.id}: ${f.homeId} ${f.result.homeGoals}-${f.result.awayGoals} ${f.awayId}`,
        );

        const home = teamById(f.homeId);

        const away = teamById(f.awayId);

        if (!home || !away) continue;

        const homeXI = getStarters(next, f.homeId);

        const awayXI = getStarters(next, f.awayId);

        // Simulate extra time

        const etResult = simulateExtraTime(home, away, homeXI, awayXI);

        f.result.extraTime = {
          homeGoals: etResult.homeGoals,

          awayGoals: etResult.awayGoals,

          events: etResult.events,
        };

        // Check if still tied after extra time

        const totalHome = f.result.homeGoals + etResult.homeGoals;

        const totalAway = f.result.awayGoals + etResult.awayGoals;

        if (totalHome === totalAway) {
          // Simulate penalty shootout

          const penaltyResult = simulatePenaltyShootout(homeXI, awayXI);

          f.result.penalties = {
            homeGoals: penaltyResult.homeGoals,

            awayGoals: penaltyResult.awayGoals,

            shootout: penaltyResult.shootout,
          };
        }

        fixed = true;
      }
    }
  }

  if (fixed) {
    console.log("[fixCupDraws] Fixed cup draws in save");
  }

  return next;
}

export type Suspension = {
  playerId: string;

  playerName: string;

  matchdaysRemaining: number; // Number of matchdays the suspension lasts
};

export type SaveGame = {
  version: 2;

  myTeamId: string;

  myLeague: LeagueId;

  season: string;

  // league

  fixtures: Record<LeagueId, Fixture[]>;

  standings: Record<LeagueId, Standing[]>;

  currentMatchday: Record<LeagueId, number>;

  // lineups per team: ordered XI player ids (EA FC player IDs as strings)

  lineups: Record<string, string[]>;

  // formations per team

  formations: Record<string, string>;

  // player suspensions (red cards)

  suspensions: Record<string, Suspension[]>; // teamId -> suspensions

  // cups (per league)

  cupFixtures: Record<LeagueId, Fixture[]>;

  cupChampion: Record<LeagueId, string | null>;

  // cup draw pending state (for user's league only)

  cupDrawPending: { league: LeagueId; round: string; teams: string[] } | null;

  // Scheduled background league/cup simulations: { league, matchday, isCup, scheduledDate }

  pendingBackgroundSims: { league: LeagueId; matchday: number; isCup: boolean; date: string }[];

  // UCL (legacy flat fixtures — kept for backward compat)

  uclFixtures: Fixture[];

  uclChampion: string | null;

  /** Prize milestone keys already paid to the user's team (avoid duplicates). */
  uclPrizesAwarded?: string[];

  // UCL Swiss format (new)

  ucl: import("@/data/ucl").UCLState | null;
};

const STORAGE_KEY = "fcsim:save:v2";
const STORAGE_KEY_MULTIPLE = "fcsim:saves:v2";

export type SavedGameMeta = {
  id: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  league: string;
  season: string;
  createdAt: string;
  lastPlayed: string;
};

// Dynamically get all league IDs from the LEAGUES object (supports all 45+ leagues)

export const ALL_LEAGUES: LeagueId[] = Object.keys(LEAGUES) as LeagueId[];

type LegacySave = SaveGame & { players?: Record<string, Player> };

export function loadSave(): SaveGame | null {
  if (typeof window === "undefined") return null;

  try {
    // Clear old v1 saves silently

    localStorage.removeItem("fcsim:save:v1");

    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as LegacySave;

    if (parsed.version !== 2) return null;

    // MIGRATION: Convert old cupFixtures structure if needed

    // Old structure: cupFixtures keyed by league (each league had its own cup)

    // New structure: cupFixtures keyed by primary league (one cup per country)

    if (parsed.cupFixtures) {
      const countriesWithLeagues = new Map<string, LeagueId[]>();

      for (const lg of Object.keys(LEAGUES) as LeagueId[]) {
        const country = LEAGUES[lg]?.country;

        if (country) {
          if (!countriesWithLeagues.has(country)) {
            countriesWithLeagues.set(country, []);
          }

          countriesWithLeagues.get(country)!.push(lg);
        }
      }

      // Create new cupFixtures structure

      const newCupFixtures: Record<LeagueId, Fixture[]> = {} as never;

      const newCupChampion: Record<LeagueId, string | null> = {} as never;

      for (const [country, leaguesInCountry] of countriesWithLeagues) {
        const primaryLeague = leaguesInCountry[0];

        // Merge cup fixtures from all leagues in this country

        let allFixtures: Fixture[] = [];

        for (const lg of leaguesInCountry) {
          const leagueFixtures = parsed.cupFixtures[lg];

          if (leagueFixtures) {
            allFixtures = [...allFixtures, ...leagueFixtures];
          }
        }

        newCupFixtures[primaryLeague] = allFixtures;

        newCupChampion[primaryLeague] = null;
      }

      parsed.cupFixtures = newCupFixtures;

      parsed.cupChampion = newCupChampion;
    }

    playersStoreInit();

    const ps = usePlayersStore.getState();

    if (parsed.players && Object.keys(parsed.players).length > 0) {
      ps.importLegacyStats(parsed.players);

      parsed.lineups = buildDefaultLineups();

      delete parsed.players;

      const migrated = parsed as SaveGame;

      saveSave(migrated);

      return migrated;
    }

    const save = parsed as SaveGame;

    // Save the migrated structure

    saveSave(save);

    return save;
  } catch (err) {
    console.error("Error loading save:", err);

    return null;
  }
}

/**
 * Aligera la partida antes de guardarla.
 *
 * Cada partido simulado guardaba narración, estadísticas y notas de los 22
 * jugadores. Con todas las ligas, copas y Champions eso desbordaba la cuota de
 * `localStorage` ("exceeded the quota") a mitad de temporada. Aquí se conserva
 * el resultado, los goles y las tarjetas (lo que alimenta clasificaciones,
 * pichichis y sanciones) y se descarta el detalle pesado, salvo en los últimos
 * partidos de tu equipo, que son los que puedes volver a abrir.
 */
const DETAILED_MATCHES_KEPT = 6;

function slimResult(result: any, keepDetail: boolean): any {
  if (!result) return result;
  if (keepDetail) return result;

  // Los partidos de otros equipos también deben poder abrirse en Jornadas,
  // Champions y Copa con una crónica coherente. Antes se eliminaban `highlights`
  // al guardar, por lo que desaparecían paradones, palos y cambios forzados.
  // Conservamos solo el detalle ligero que necesita la UI: eventos, tarjetas,
  // highlights, sustituciones, XI y formación. Se siguen descartando las
  // estadísticas pesadas y las notas/rating completas para no volver a llenar
  // localStorage.
  const { stats, extraTime, ...rest } = result;

  const compactHighlights = Array.isArray(rest.highlights)
    ? rest.highlights.map((h: any) => ({
        minute: h.minute,
        team: h.team,
        type: h.type,
        playerId: h.playerId,
        playerName: h.playerName,
        detail: h.detail,
      }))
    : undefined;

  const slimExtra = extraTime
    ? {
        homeGoals: extraTime.homeGoals,
        awayGoals: extraTime.awayGoals,
        events: extraTime.events ?? [],
        highlights: extraTime.highlights ?? [],
      }
    : undefined;

  const compact = {
    ...rest,
    ...(compactHighlights ? { highlights: compactHighlights } : {}),
  };

  return slimExtra ? { ...compact, extraTime: slimExtra } : compact;
}

function slimFixtures(list: any[] | undefined, myTeamId: string, detailedIds: Set<string>): any[] {
  if (!Array.isArray(list)) return list as any;
  return list.map((f) => {
    if (!f?.result) return f;
    const mine = f.homeId === myTeamId || f.awayId === myTeamId;
    return { ...f, result: slimResult(f.result, mine && detailedIds.has(f.id)) };
  });
}

export function slimSave(s: SaveGame): SaveGame {
  try {
    const myTeamId = s.myTeamId;
    // Los últimos partidos jugados por tu equipo mantienen todo el detalle.
    const played: any[] = [];
    const collect = (list: any) => {
      if (!Array.isArray(list)) return;
      for (const f of list) {
        if (f?.result && (f.homeId === myTeamId || f.awayId === myTeamId)) played.push(f);
      }
    };
    for (const lg of Object.keys(s.fixtures ?? {})) collect((s.fixtures as any)[lg]);
    for (const lg of Object.keys(s.cupFixtures ?? {})) collect((s.cupFixtures as any)[lg]);
    collect(s.uclFixtures);
    const detailedIds = new Set<string>(
      played.slice(-DETAILED_MATCHES_KEPT).map((f) => String(f.id)),
    );

    const fixtures: any = {};
    for (const lg of Object.keys(s.fixtures ?? {})) {
      fixtures[lg] = slimFixtures((s.fixtures as any)[lg], myTeamId, detailedIds);
    }
    const cupFixtures: any = {};
    for (const lg of Object.keys(s.cupFixtures ?? {})) {
      cupFixtures[lg] = slimFixtures((s.cupFixtures as any)[lg], myTeamId, detailedIds);
    }
    const ucl: any = s.ucl
      ? {
          ...s.ucl,
          fixtures: Array.isArray((s.ucl as any).fixtures)
            ? slimFixtures((s.ucl as any).fixtures, myTeamId, detailedIds)
            : (s.ucl as any).fixtures,
        }
      : s.ucl;

    return {
      ...s,
      fixtures,
      cupFixtures,
      uclFixtures: slimFixtures(s.uclFixtures, myTeamId, detailedIds),
      ucl,
    };
  } catch {
    return s;
  }
}

export function saveSave(s: SaveGame) {
  if (typeof window === "undefined") return;

  const slim = slimSave(s);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch (e) {
    console.warn("saveSave: almacenamiento lleno", (e as Error)?.message);
    // Limpiar localStorage y reintentar
    console.log("Limpiando localStorage y reintentando...");
    localStorage.clear();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      console.log("Save guardado después de limpiar localStorage");
    } catch (retryError) {
      console.error("saveSave: falló incluso después de limpiar localStorage", retryError);
      throw retryError;
    }
  }
  try {
    persistCurrentSave(slim);
  } catch (e) {
    console.error("persistCurrentSave failed", e);
  }
}

export function clearSave() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(STORAGE_KEY);

  usePlayersStore.getState().resetAllStats();

  usePlayersStore.getState().clear();
}

export function newSave(myTeamId: string): SaveGame {
  const team = teamById(myTeamId);

  if (!team || team.id !== myTeamId) throw new Error("Equipo no encontrado");

  playersStoreInit();

  usePlayersStore.getState().resetAllStats();

  usePlayersStore.getState().resetGameDate();

  usePlayersStore.getState().setMyTeam(myTeamId, { resetBudget: true });

  usePlayersStore.getState().generateLeagueSchedule(myTeamId, team.league);

  const lineups = buildDefaultLineups();

  const fixtures: Record<LeagueId, Fixture[]> = {} as never;

  const standings: Record<LeagueId, Standing[]> = {} as never;

  const currentMatchday: Record<LeagueId, number> = {} as never;

  const cupFixtures: Record<LeagueId, Fixture[]> = {} as never;

  const cupChampion: Record<LeagueId, string | null> = {} as never;

  const formations: Record<string, string> = {} as never;

  const suspensions: Record<string, Suspension[]> = {} as never;

  // Generate fixtures for ALL leagues dynamically, not just Big 5

  const allLeagues = Object.keys(LEAGUES) as LeagueId[];

  for (const lg of allLeagues) {
    fixtures[lg] = generateLeagueFixtures(lg);

    standings[lg] = emptyStandings(lg);

    currentMatchday[lg] = 1;
  }

  // Generate cups BY COUNTRY (not by league) - Domestic cups aggregate all teams from all leagues within the same country

  // We use the league ID as the key, but only create one cup per country

  const countriesWithLeagues = new Map<string, LeagueId[]>();

  for (const lg of allLeagues) {
    const country = LEAGUES[lg]?.country;

    if (country) {
      if (!countriesWithLeagues.has(country)) {
        countriesWithLeagues.set(country, []);
      }

      countriesWithLeagues.get(country)!.push(lg);
    }
  }

  for (const [country, leaguesInCountry] of countriesWithLeagues) {
    try {
      // Use the first league in the country as the key for the cup

      const primaryLeague = leaguesInCountry[0];

      // Initialize cup using the new country-based function

      const cupData = initCup(country);

      // Store the structure for later use

      (cupFixtures as any)[`${primaryLeague}_structure`] = cupData.structure;

      // DO NOT create fixtures initially - fixtures are only created after the draw

      cupFixtures[primaryLeague] = [];

      cupChampion[primaryLeague] = null;
    } catch (err) {
      console.error(`Error initializing cup for country ${country}:`, err);

      // Fallback: create empty cup for this country

      const primaryLeague = leaguesInCountry[0];

      cupFixtures[primaryLeague] = [];

      cupChampion[primaryLeague] = null;
    }
  }

  const ucl: import("@/lib/season").Fixture[] = []; // UCL fixtures generated on draw day, not at init

  return {
    version: 2,

    myTeamId,

    myLeague: team.league,

    season: "2025/26",

    fixtures,
    standings,
    currentMatchday,

    lineups,

    formations,

    suspensions,

    cupFixtures,
    cupChampion,

    cupDrawPending: null,

    pendingBackgroundSims: [],

    uclFixtures: ucl,

    uclChampion: null,

    ucl: null,
  };
}

/* ============================================================







 *  SIMULATION CORE







 * ============================================================ */

// Process red cards and create suspensions

function processRedCards(
  save: SaveGame,
  cards: CardEvent[],
  homeTeamId: string,
  awayTeamId: string,
): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));

  for (const card of cards) {
    if (card.cardType === "red") {
      const teamId = card.team === "home" ? homeTeamId : awayTeamId;

      // Suspension length: 1-3 matchdays for direct red cards, 1 matchday for second yellow

      let suspensionLength: number;

      if (card.isSecondYellow) {
        suspensionLength = 1; // 1 matchday for double yellow
      } else {
        // Random suspension length: 1, 2, or 3 matchdays for direct red cards

        suspensionLength = Math.floor(Math.random() * 3) + 1;
      }

      const suspension: Suspension = {
        playerId: card.playerId,

        playerName: card.playerName,

        matchdaysRemaining: suspensionLength,
      };

      // Add suspension to the team's suspension list

      if (!next.suspensions[teamId]) {
        next.suspensions[teamId] = [];
      }

      next.suspensions[teamId].push(suspension);

      console.log(
        `Red card for ${card.playerName} (${teamId}): ${suspensionLength} matchday suspension`,
      );
    }
  }

  return next;
}

// Decrease suspension counters for all teams (called after each matchday)

function decreaseSuspensions(save: SaveGame): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));

  for (const teamId in next.suspensions) {
    const suspensions = next.suspensions[teamId];

    if (suspensions && suspensions.length > 0) {
      // Decrease matchdaysRemaining for each suspension

      next.suspensions[teamId] = suspensions

        .map((s) => ({ ...s, matchdaysRemaining: s.matchdaysRemaining - 1 }))

        .filter((s) => s.matchdaysRemaining > 0); // Remove completed suspensions
    }
  }

  return next;
}

export function getStartersWithFormation(
  save: SaveGame,
  teamId: string,
  options?: { randomFormation?: boolean },
): { players: Player[]; formation: FormationName } {
  const store = usePlayersStore.getState();

  store.init();

  const team = teamById(teamId);

  if (!team) return { players: [], formation: "Táctica 4-4-2" };

  const lg = team.league;

  const md = save.currentMatchday[lg] ?? 1;

  const lineup = save.lineups[teamId] ?? [];

  const suspensions = save.suspensions[teamId] ?? [];

  const suspendedPlayerIds = new Set(
    suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
  );

  const squad = store.getSimSquad(teamId);

  const injuredIds = new Set(squad.filter((p) => p.injuredUntil > md).map((p) => p.id));

  const unavailable = new Set([...suspendedPlayerIds, ...injuredIds]);

  // Solo el equipo del usuario tiene una alineación persistente.
  // Los equipos CPU deben generar su XI desde la plantilla ACTUAL de la partida,
  // para que los fichajes, lesiones y sanciones se reflejen inmediatamente.
  const isUserTeam = teamId === save.myTeamId;

  if (!isUserTeam || lineup.length === 0 || options?.randomFormation) {
    const savedFormation = save.formations[teamId] as FormationName | undefined;
    const existingFormation = options?.randomFormation
      ? undefined
      : FIVE_DEFENDER_TEAMS.has(team.name) && !savedFormation?.includes("5-")
        ? undefined
        : savedFormation;

    const { ids: autoIds, formation } = generateCPUXI(squad, unavailable, team, existingFormation);

    if (!save.formations[teamId]) save.formations[teamId] = formation;

    const players = autoIds
      .map((id) => store.getSimPlayer(id))
      .filter((p): p is Player => !!p)
      .slice(0, 11);

    return {
      players,
      formation: (save.formations[teamId] as FormationName) || formation,
    };
  }

  // El usuario sí conserva su alineación manual.
  const filteredLineup = lineup.filter((playerId) => !unavailable.has(playerId));
  const players = store.getSimXI(teamId, filteredLineup, md);

  return {
    players,
    formation: (save.formations[teamId] as FormationName) || "Táctica 4-4-2",
  };
}

export function getStarters(save: SaveGame, teamId: string): Player[] {
  const store = usePlayersStore.getState();

  store.init();

  const team = teamById(teamId);

  if (!team) {
    console.warn(`getStarters: Team not found for ID: ${teamId}`);

    return [];
  }

  const lg = team.league;

  const md = save.currentMatchday[lg] ?? 1;

  // Get the lineup

  const lineup = save.lineups[teamId] ?? [];

  // Get suspended players for this team

  const suspensions = save.suspensions[teamId] ?? [];

  const suspendedPlayerIds = new Set(
    suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
  );

  // Build unavailable set (injured + suspended)

  const squad = store.getSimSquad(teamId);

  const injuredIds = new Set(squad.filter((p) => p.injuredUntil > md).map((p) => p.id));

  const unavailable = new Set([...suspendedPlayerIds, ...injuredIds]);

  // La alineación guardada solo pertenece al usuario. Los equipos CPU deben
  // regenerar su XI a partir de su plantilla actual, nunca reutilizar el XI
  // inicial creado por buildDefaultLineups(), porque los fichajes lo invalidan.
  const isUserTeam = teamId === save.myTeamId;

  if (!isUserTeam || lineup.length === 0) {
    const existingFormation = save.formations[teamId] as FormationName | undefined;
    const { ids: autoIds, formation } = generateCPUXI(squad, unavailable, team, existingFormation);

    if (!save.formations[teamId]) {
      save.formations[teamId] = formation;
    }

    return autoIds
      .map((id) => store.getSimPlayer(id))
      .filter((p): p is Player => !!p)
      .slice(0, 11);
  }

  // El usuario sí conserva su alineación manual.
  const filteredLineup = lineup.filter((playerId) => !unavailable.has(playerId));
  return store.getSimXI(teamId, filteredLineup, md);
}

/**
 * Returns realistic bench players for a team: squad members not already in
 * the starting XI and not injured/suspended, best-rated first. Used so that
 * in-match substitutions bring on real players instead of inventing IDs.
 */
export function getBenchForTeam(save: SaveGame, teamId: string, xi: Player[]): Player[] {
  const store = usePlayersStore.getState();
  store.init();

  const team = teamById(teamId);
  if (!team) return [];

  const lg = team.league;
  const md = save.currentMatchday[lg] ?? 1;

  const suspensions = save.suspensions[teamId] ?? [];
  const suspendedPlayerIds = new Set(
    suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
  );

  const squad = store.getSimSquad(teamId);
  const injuredIds = new Set(squad.filter((p) => p.injuredUntil > md).map((p) => p.id));
  const unavailable = new Set([...suspendedPlayerIds, ...injuredIds]);

  const xiIds = new Set(xi.map((p) => p.id));

  return squad
    .filter((p) => !xiIds.has(p.id) && !unavailable.has(p.id))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 7);
}

export function squadOf(_save: SaveGame, teamId: string): Player[] {
  const store = usePlayersStore.getState();

  store.init();

  return store.getSimSquad(teamId);
}

function applyMatchToStats(save: SaveGame, fixture: Fixture): SaveGame {
  if (!fixture.result) return save;

  const r = fixture.result;

  const store = usePlayersStore.getState();

  const homeXI = getStarters(save, fixture.homeId);

  const awayXI = getStarters(save, fixture.awayId);

  let updatedSave = save;

  // Process red cards and create suspensions

  if (r.cards && r.cards.length > 0) {
    updatedSave = processRedCards(updatedSave, r.cards, fixture.homeId, fixture.awayId);
  }

  for (const p of [...homeXI, ...awayXI]) {
    store.recordAppearance(p.id, fixture.competition);
  }

  // A substitute who actually enters the match also gets an appearance.
  // Keep the stored event as the source of truth so players who stayed on the
  // bench are not credited with an appearance.
  for (const sub of r.substitutions ?? []) {
    store.recordAppearance(sub.playerInId, fixture.competition);
  }

  // Process regular time events

  for (const ev of r.events) {
    // Own goals must never be credited to the scorer in the stats tables.
    if (ev.type === "own_goal") continue;

    store.recordGoal(ev.scorerId, fixture.competition);

    if (ev.assistId) store.recordAssist(ev.assistId, fixture.competition);
  }

  // Process extra time events (goals and assists count for stats)

  if (r.extraTime && r.extraTime.events) {
    for (const ev of r.extraTime.events) {
      if (ev.type === "own_goal") continue;

      store.recordGoal(ev.scorerId, fixture.competition);

      if (ev.assistId) store.recordAssist(ev.assistId, fixture.competition);
    }
  }

  // Process cards (including those from extra time)

  for (const card of r.cards) {
    if (card.cardType === "yellow") {
      store.recordYellowCard(card.playerId);

      store.incrementAccumulatedYellowCards(card.playerId);

      // Check if accumulated yellow cards reaches 5

      const stats = store.stats[card.playerId];

      if (stats && stats.accumulatedYellowCards >= 5) {
        // Suspend player for next match

        const p = store.getSimPlayer(card.playerId);

        if (p) {
          const teamLeague = teamById(p.teamId).league;

          store.recordInjury(
            card.playerId,
            updatedSave.currentMatchday[teamLeague] + 1,
            "5 amarillas acumuladas",
          );

          // Reset accumulated yellow cards after suspension is applied

          store.resetAccumulatedYellowCards(card.playerId);
        }
      }
    } else if (card.cardType === "red") {
      store.recordRedCard(card.playerId);

      // If it's a second yellow, also count it as a yellow card

      if (card.isSecondYellow) {
        store.recordYellowCard(card.playerId);

        store.incrementAccumulatedYellowCards(card.playerId);
      }
    }
  }

  for (const inj of r.injuries) {
    const p = store.getSimPlayer(inj.playerId);

    if (!p) continue;

    const teamLeague = teamById(p.teamId).league;

    store.recordInjury(
      inj.playerId,

      updatedSave.currentMatchday[teamLeague] + inj.weeks,

      inj.reason,
    );
  }

  // Auto-update user's lineup if their players got injured or red-carded during the match

  const isUserMatch = fixture.homeId === save.myTeamId || fixture.awayId === save.myTeamId;

  if (isUserMatch) {
    const userTeamId = save.myTeamId;

    const userLineup = save.lineups[userTeamId] || [];

    const squad = store.getSimSquad(userTeamId);

    const leagueMd = save.currentMatchday[save.myLeague];

    console.log("Auto-update lineup check:", {
      userTeamId,
      userLineupLength: userLineup.length,
      squadSize: squad.length,
      leagueMd,
    });

    // Get red carded players for user's team

    const redCardedPlayerIds = new Set(
      (r.cards || [])

        .filter((c) => c.cardType === "red" && squad.find((p) => p.id === c.playerId))

        .map((c) => c.playerId),
    );

    // Get injured players for user's team

    const injuredPlayerIds = new Set(
      (r.injuries || [])

        .filter((inj) => squad.find((p) => p.id === inj.playerId))

        .map((inj) => inj.playerId),
    );

    console.log("Players to remove:", {
      redCarded: Array.from(redCardedPlayerIds),
      injured: Array.from(injuredPlayerIds),
    });

    // Players that need to be removed from starting XI

    const playersToRemove = new Set([...redCardedPlayerIds, ...injuredPlayerIds]);

    if (playersToRemove.size > 0) {
      let newLineup = [...userLineup];

      const benchPlayers = squad.filter((p) => !userLineup.includes(p.id));

      console.log("Bench players:", benchPlayers.length);

      // For each player to remove, find a replacement from bench

      for (const playerIdToRemove of playersToRemove) {
        const playerToRemove = squad.find((p) => p.id === playerIdToRemove);

        if (!playerToRemove) continue;

        const idx = newLineup.indexOf(playerIdToRemove);

        if (idx === -1) continue; // Player not in starting XI

        // Find a healthy replacement from bench (not injured, not suspended, same position)

        const suspensions = updatedSave.suspensions[userTeamId] || [];

        const suspendedPlayerIds = new Set(
          suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
        );

        const replacement = benchPlayers.find(
          (p) =>
            p.injuredUntil <= leagueMd &&
            !suspendedPlayerIds.has(p.id) &&
            p.positions.some((pos) => playerToRemove.positions.includes(pos)),
        );

        if (replacement) {
          // Replace the player

          newLineup[idx] = replacement.id;

          console.log(`Replaced ${playerToRemove.name} with ${replacement.name}`);
        } else {
          // No replacement available, move to end of lineup (will be filtered out later)

          newLineup = newLineup.filter((id) => id !== playerIdToRemove);

          console.log(`Removed ${playerToRemove.name} - no replacement available`);
        }
      }

      // Ensure we have exactly 11 players in the lineup

      if (newLineup.length < 11) {
        // Add any available bench players to fill the lineup

        const availableBench = benchPlayers.filter(
          (p) =>
            p.injuredUntil <= leagueMd &&
            !suspendedPlayerIds.has(p.id) &&
            !playersToRemove.has(p.id) &&
            !newLineup.includes(p.id),
        );

        console.log("Available bench for filling:", availableBench.length);

        while (newLineup.length < 11 && availableBench.length > 0) {
          newLineup.push(availableBench.shift()!.id);
        }

        // If still not enough players, add ANY available player as last resort

        if (newLineup.length < 11) {
          const anyAvailable = squad.filter((p) => !newLineup.includes(p.id));

          console.log("Adding any available players as last resort:", anyAvailable.length);

          while (newLineup.length < 11 && anyAvailable.length > 0) {
            newLineup.push(anyAvailable.shift()!.id);
          }
        }
      }

      console.log("Final lineup length:", newLineup.length);

      // Only update if we have exactly 11 players

      if (newLineup.length === 11) {
        updatedSave = setLineup(updatedSave, userTeamId, newLineup);
      } else {
        console.error("Failed to maintain 11 players in lineup, keeping original");
      }
    }
  }

  // Clean sheets (GK of team that conceded 0)
  try {
    const homeGoals = r.homeGoals ?? 0;
    const awayGoals = r.awayGoals ?? 0;
    if (awayGoals === 0) {
      const gk = homeXI.find((p) => p.positions.includes("GK"));
      if (gk) store.recordCleanSheet(gk.id, fixture.competition);
    }
    if (homeGoals === 0) {
      const gk = awayXI.find((p) => p.positions.includes("GK"));
      if (gk) store.recordCleanSheet(gk.id, fixture.competition);
    }
    // MOTM: top scorer of the match (or a random starter of winner if 0-0)
    const scorerCounts: Record<string, number> = {};
    for (const ev of r.events ?? []) {
      if (ev.type === "own_goal") continue;
      scorerCounts[ev.scorerId] = (scorerCounts[ev.scorerId] ?? 0) + 1;
    }
    for (const ev of r.extraTime?.events ?? []) {
      if (ev.type === "own_goal") continue;
      scorerCounts[ev.scorerId] = (scorerCounts[ev.scorerId] ?? 0) + 1;
    }
    let motmId: string | undefined;
    let best = 0;
    for (const [pid, n] of Object.entries(scorerCounts)) {
      if (n > best) {
        best = n;
        motmId = pid;
      }
    }
    // The simulation now produces per-player ratings: the MVP is the best rated
    // player of the match, which is far more accurate than "top scorer".
    if (r.mvp?.playerId) motmId = r.mvp.playerId;
    // Match ratings feed each player's form history.
    for (const pr of r.ratings ?? []) store.recordMatchRating(pr.playerId, pr.rating);
    if (!motmId) {
      const winnerXI =
        homeGoals > awayGoals
          ? homeXI
          : awayGoals > homeGoals
            ? awayXI
            : Math.random() < 0.5
              ? homeXI
              : awayXI;
      motmId = winnerXI[Math.floor(Math.random() * winnerXI.length)]?.id;
    }
    if (motmId) store.recordMotm(motmId, fixture.competition);
  } catch {}

  return updatedSave;
}

function simulateFixtureInline(
  save: SaveGame,
  fixture: Fixture,
  fast = false,
  isCup = false,
): Fixture {
  // Apply monthly progression for league matches (only once per month)
  if (fixture.competition === "league") {
    const seasonStart = new Date("2025-08-16T12:00:00Z");
    const matchDate = new Date(seasonStart.getTime() + (fixture.matchday - 1) * 7 * 86400000);
    const currentMonth = matchDate.getMonth();
    const currentYear = matchDate.getFullYear();

    // Check if we haven't applied monthly progression for this month yet
    const progressionKey = `monthlyProgression-${currentYear}-${currentMonth}`;
    if (!save.uclPrizesAwarded?.includes(progressionKey)) {
      applyMonthlyProgressionToAllPlayers(currentMonth, currentYear);
      save.uclPrizesAwarded = [...(save.uclPrizesAwarded || []), progressionKey];
    }
  }

  if (fixture.result) return fixture;

  const home = teamById(fixture.homeId);

  const away = teamById(fixture.awayId);

  if (!home || !away) {
    console.warn(`simulateFixtureInline: Team not found for fixture ${fixture.id}`, {
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      home,
      away,
    });

    // Return fixture with default result to avoid breaking the simulation

    return {
      ...fixture,
      result: {
        homeGoals: 0,
        awayGoals: 0,
        events: [],
        cards: [],
        injuries: [],
        xgHome: 0,
        xgAway: 0,
      },
    };
  }

  const homeXI = getStarters(save, fixture.homeId);

  const awayXI = getStarters(save, fixture.awayId);

  // If either team has no players, return a default result

  if (homeXI.length === 0 || awayXI.length === 0) {
    console.warn(`simulateFixtureInline: Empty squad for fixture ${fixture.id}`, {
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      homeXI: homeXI.length,
      awayXI: awayXI.length,
    });

    return {
      ...fixture,
      result: {
        homeGoals: 0,
        awayGoals: 0,
        events: [],
        cards: [],
        injuries: [],
        xgHome: 0,
        xgAway: 0,
      },
    };
  }

  // Use cup simulation for cup matches (with extra time and penalties)

  // Use fast simulation for bulk matchdays, detailed for user's matches

  const homeFormationForSim =
    (save.formations[fixture.homeId] as FormationName | undefined) || "Táctica 4-4-2";
  const awayFormationForSim =
    (save.formations[fixture.awayId] as FormationName | undefined) || "Táctica 4-4-2";
  const homeBenchForSim = getBenchForTeam(save, fixture.homeId, homeXI);
  const awayBenchForSim = getBenchForTeam(save, fixture.awayId, awayXI);

  const result = isCup
    ? simulateCupMatch(home, away, homeXI, awayXI, {
        homeBench: homeBenchForSim,
        awayBench: awayBenchForSim,
        homeTactics: loadTactics(fixture.homeId),
        awayTactics: loadTactics(fixture.awayId),
        homeFormation: homeFormationForSim,
        awayFormation: awayFormationForSim,
      })
    : fast
      ? simulateMatchFast(home, away, homeXI, awayXI, {
          homeBench: homeBenchForSim,
          awayBench: awayBenchForSim,
          homeTactics: loadTactics(fixture.homeId),
          awayTactics: loadTactics(fixture.awayId),
          homeFormation: homeFormationForSim,
          awayFormation: awayFormationForSim,
        })
      : simulateMatch(home, away, homeXI, awayXI, {
          homeBench: homeBenchForSim,
          awayBench: awayBenchForSim,
          homeTactics: loadTactics(fixture.homeId),
          awayTactics: loadTactics(fixture.awayId),
          homeFormation: homeFormationForSim,
          awayFormation: awayFormationForSim,
        });

  return { ...fixture, result };
}

/* ============================================================







 *  USER FLOW







 * ============================================================ */

export function getMyNextFixture(save: SaveGame): Fixture | null {
  const lg = save.myLeague;

  return (
    save.fixtures[lg].find(
      (f) =>
        !f.result &&
        f.matchday === save.currentMatchday[lg] &&
        (f.homeId === save.myTeamId || f.awayId === save.myTeamId),
    ) ?? null
  );
}

export function getMyNextFixtureAny(save: SaveGame): Fixture | null {
  const seasonStart = new Date("2025-08-16T12:00:00Z");

  const cupStart = new Date("2025-07-07T00:00:00Z");

  const allFixtures: Array<{ fixture: Fixture; dateMs: number }> = [];

  // Get league fixtures

  for (const lg of Object.keys(save.fixtures)) {
    save.fixtures[lg as LeagueId].forEach((f) => {
      if (!f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)) {
        const matchdayDate = new Date(seasonStart.getTime() + (f.matchday - 1) * 7 * 86400000);

        allFixtures.push({ fixture: f, dateMs: matchdayDate.getTime() });
      }
    });
  }

  // Get cup fixtures (use July-based dates: matchday = day offset from July 7th)

  for (const lg of Object.keys(save.cupFixtures)) {
    save.cupFixtures[lg as LeagueId].forEach((f) => {
      if (!f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)) {
        // Cup matchday = day offset from July 7th (0=Jul7, 1=Jul8, etc.)

        const cupMatchDate = new Date(cupStart.getTime() + f.matchday * 86400000);

        allFixtures.push({ fixture: f, dateMs: cupMatchDate.getTime() });
      }
    });
  }

  // Get UCL fixtures

  if (save.uclFixtures) {
    const uclStart = new Date(UCL_START + "T00:00:00Z");

    save.uclFixtures.forEach((f) => {
      if (!f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)) {
        // UCL matchday = absolute day offset from UCL_START

        const matchdayDate = new Date(uclStart.getTime() + f.matchday * 86400000);

        allFixtures.push({ fixture: f, dateMs: matchdayDate.getTime() });
      }
    });
  }

  // Sort by date and return the first one

  allFixtures.sort((a, b) => a.dateMs - b.dateMs);

  return allFixtures[0]?.fixture ?? null;
}

export function getMyUpcomingCupFixtures(save: SaveGame): Fixture[] {
  const out: Fixture[] = [];

  const leagueMd = save.currentMatchday[save.myLeague];

  try {
    // Get the primary league for the user's country (the league that holds the cup)

    const userCountry = LEAGUES[save.myLeague]?.country;

    const primaryLeague = userCountry ? getPrimaryLeagueForCountry(userCountry) : save.myLeague;

    const cupKey = (primaryLeague || save.myLeague) as LeagueId;

    // Get the dynamic cup structure for the user's country

    const structure =
      (save.cupFixtures as any)[`${cupKey}_structure`] ||
      getCupStructureForCountry(userCountry || "");

    const cupSchedule = structure.schedule;

    // Only show fixtures for rounds that have been drawn (fixtures exist)

    const cupFixtures =
      save.cupFixtures[cupKey]?.filter(
        (f) => !f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId),
      ) || [];

    // Show all cup fixtures that exist (have been drawn)

    // Don't filter by drawMatchday since draws can happen earlier than scheduled

    if (cupFixtures.length > 0) {
      out.push(...cupFixtures);
    }
  } catch (err) {
    console.error("Error en getMyUpcomingCupFixtures:", err);
  }

  const ucl = save.uclFixtures?.find(
    (f) => !f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId),
  );

  if (ucl) out.push(ucl);

  return out;
}

/**







 * Get round name based on team count (pure mathematical calculation)







 * Used for dynamic round naming in cup draws







 */

export function getRoundNameByTeamCount(teamCount: number): string {
  if (teamCount === 128) return "64avos de Final";

  if (teamCount === 64) return "32avos de Final";

  if (teamCount === 32) return "16avos de Final";

  if (teamCount === 16) return "Octavos de Final";

  if (teamCount === 8) return "Cuartos de Final";

  if (teamCount === 4) return "Semifinales";

  if (teamCount === 2) return "Final";

  return "Fase Previa";
}

/**







 * Get surviving teams for the next cup round based on current fixtures







 * This calculates winners from the most recent completed round







 */

export function getSurvivingCupTeams(save: SaveGame, league: LeagueId): string[] {
  const list = save.cupFixtures[league];

  if (!list || list.length === 0) return [];

  const roundOrder = ["Preliminar", "R32", "R16", "Octavos", "QF", "SF", "Final"];

  const existingRounds = [...new Set(list.map((f) => f.round).filter((r): r is string => !!r))];

  const sortedRounds = existingRounds.sort((a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b));

  console.log(`getSurvivingCupTeams: Existing rounds: ${sortedRounds.join(", ")}`);

  // Find the most recent completed round

  let mostRecentCompletedRound: string | null = null;

  for (let i = sortedRounds.length - 1; i >= 0; i--) {
    const round = sortedRounds[i];

    const roundFixtures = list.filter((f) => f.round === round);

    const allHaveResults = roundFixtures.every((f) => f.result);

    console.log(
      `getSurvivingCupTeams: Round ${round} has ${roundFixtures.length} fixtures, all have results: ${allHaveResults}`,
    );

    if (allHaveResults) {
      mostRecentCompletedRound = round;

      break;
    }
  }

  if (!mostRecentCompletedRound) {
    console.log(`getSurvivingCupTeams: No completed rounds found`);

    return [];
  }

  console.log(`getSurvivingCupTeams: Most recent completed round: ${mostRecentCompletedRound}`);

  // Get winners from the most recent completed round

  const completedRoundFixtures = list.filter((f) => f.round === mostRecentCompletedRound);

  const winners = completedRoundFixtures.map((f) => {
    if (!f.result) return f.homeId;

    return getCupMatchWinner(f.result) === "home" ? f.homeId : f.awayId;
  });

  console.log(
    `getSurvivingCupTeams: Found ${winners.length} winners from ${mostRecentCompletedRound}`,
  );

  return winners;
}

/**







 * Simulate all unplayed cup fixtures for a specific matchday







 */

export function simulateCupMatchday(save: SaveGame, league: LeagueId, matchday: number): SaveGame {
  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const cupFixtures = next.cupFixtures[league];

  if (!cupFixtures) return next;

  const roundFixtures = cupFixtures.filter((f) => f.matchday === matchday && !f.result);

  for (const f of roundFixtures) {
    const simmed = simulateFixtureInline(next, f, false, true);

    const idx = cupFixtures.findIndex((x) => x.id === f.id);

    if (idx >= 0) {
      cupFixtures[idx] = simmed;

      next = applyMatchToStats(next, simmed);
    }
  }

  // Process cup draws after simulating matches

  processCupDrawsOnly(next, league);

  return next;
}

/**







 * Simulate all unplayed cup fixtures for a specific matchday across ALL VIP countries







 * Uses the EXACT same logic format as advanceMatchdayLayered:







 * - VIP countries (Big 5 + Belgium + Netherlands + Portugal + Turkey + user's country): detailed simulation







 * - Background countries: O(1) mathematical simulation







 */

export async function simulateCupMatchdayLayered(
  save: SaveGame,
  matchday: number,
  onProgress?: (processed: number, total: number) => void,
): Promise<SaveGame> {
  const BATCH_SIZE = 100;

  const userLeague = save.myLeague;

  // Cup league for the user's country (used to decide deep vs fast sim)

  const userCountryForCup = LEAGUES[userLeague]?.country;

  const userCupLeague = userCountryForCup
    ? (getPrimaryLeagueForCountry(userCountryForCup) as LeagueId)
    : userLeague;

  // Determine VIP cup leagues upfront to avoid cloning all cup fixtures

  const vipCupLeagueSet = new Set(
    (Object.keys(save.cupFixtures) as LeagueId[]).filter((lg) => isVIPLeague(lg, userLeague)),
  );

  // Partial clone: only deep copy VIP cup fixtures

  let next: SaveGame = {
    ...save,

    fixtures: { ...save.fixtures },

    standings: { ...save.standings },

    cupFixtures: { ...save.cupFixtures },

    currentMatchday: { ...save.currentMatchday },

    suspensions: JSON.parse(JSON.stringify(save.suspensions)),
  };

  for (const lg of vipCupLeagueSet) {
    if (save.cupFixtures[lg]) next.cupFixtures[lg] = save.cupFixtures[lg].map((f) => ({ ...f }));
  }

  const store = usePlayersStore.getState();

  const allFixtures: { fixture: Fixture; league: LeagueId; isVIP: boolean }[] = [];

  // Collect only VIP cup fixtures for this matchday

  for (const lg of vipCupLeagueSet) {
    const cupFixtures = next.cupFixtures[lg];

    if (!cupFixtures) continue;

    const fixtures = cupFixtures.filter((f) => f.matchday === matchday && !f.result);

    for (const f of fixtures) {
      allFixtures.push({ fixture: f, league: lg, isVIP: true });
    }
  }

  console.log(`simulateCupMatchdayLayered: Total fixtures to simulate: ${allFixtures.length}`);

  console.log(`simulateCupMatchdayLayered: Leagues with fixtures:`, [
    ...new Set(allFixtures.map((f) => f.league)),
  ]);

  const totalMatches = allFixtures.length;

  let processed = 0;

  // Process in batches with yield control

  for (let i = 0; i < allFixtures.length; i += BATCH_SIZE) {
    const batch = allFixtures.slice(i, i + BATCH_SIZE);

    // Process this batch synchronously (fast)

    for (const { fixture, league, isVIP } of batch) {
      const home = teamById(fixture.homeId);

      const away = teamById(fixture.awayId);

      if (!home || !away) continue;

      let result: SimResult;

      if (league === userCupLeague) {
        // DEEP SIMULATION for user's own cup

        const homeXI = getStarters(next, fixture.homeId);

        const awayXI = getStarters(next, fixture.awayId);

        if (homeXI.length === 0 || awayXI.length === 0) {
          result = {
            homeGoals: 0,
            awayGoals: 0,
            events: [],
            cards: [],
            injuries: [],
            xgHome: 0,
            xgAway: 0,
          };
        } else {
          result = simulateCupMatch(home, away, homeXI, awayXI, {
            homeTactics: loadTactics(fixture.homeId),
            awayTactics: loadTactics(fixture.awayId),
            homeFormation:
              (next.formations[fixture.homeId] as FormationName | undefined) || "Táctica 4-4-2",
            awayFormation:
              (next.formations[fixture.awayId] as FormationName | undefined) || "Táctica 4-4-2",
          });

          next = applyMatchToStats(next, { ...fixture, result });
        }
      } else {
        // FAST SIMULATION for other VIP cups + stats/injuries

        result = generateFakeMatchResult(home, away);

        if (result.homeGoals === result.awayGoals) {
          const etH = Math.random() < 0.3 ? Math.floor(Math.random() * 2) : 0;

          const etA = Math.random() < 0.3 ? Math.floor(Math.random() * 2) : 0;

          result.extraTime = { homeGoals: etH, awayGoals: etA, events: [] };

          if (result.homeGoals + etH === result.awayGoals + etA) {
            result.penalties = {
              homeGoals: Math.random() < 0.5 ? 5 : 4,
              awayGoals: Math.random() < 0.5 ? 4 : 5,
              shootout: [],
            };
          }
        }

        const hXI = selectMatchPlayers(store.getSimSquad(home.id));

        const aXI = selectMatchPlayers(store.getSimSquad(away.id));

        hXI.forEach((p) => store.recordAppearance(p.id));

        aXI.forEach((p) => store.recordAppearance(p.id));

        recordFakeMatchStats(store, hXI, aXI, result, next.currentMatchday[league]);
      }

      // Apply result to cup fixtures

      const cupFixtures = next.cupFixtures[league];

      if (cupFixtures) {
        const idx = cupFixtures.findIndex((x) => x.id === fixture.id);

        if (idx >= 0) {
          cupFixtures[idx] = { ...fixture, result };
        }
      }

      processed++;
    }

    // Report progress

    if (onProgress) {
      onProgress(processed, totalMatches);
    }

    // Yield control every batch

    if (i + BATCH_SIZE < allFixtures.length) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  console.log(`simulateCupMatchdayLayered: Completed ${processed}/${totalMatches} fixtures`);

  // Decrease suspension counters after cup matchday

  next = decreaseSuspensions(next);

  return next;
}

/**







 * Simulate all remaining Cup fixtures for a specific round across ALL active countries







 * This is used after the user plays a Cup match to simulate AI vs AI matches







 * Uses the EXACT same logic format as league matchday simulations:







 * - VIP countries (Big 5 + Belgium + Netherlands + Portugal + Turkey + user's country): detailed simulation







 * - Background countries: O(1) mathematical simulation







 */

export async function simulateRemainingCupMatches(
  save: SaveGame,
  currentRound: string,
): Promise<SaveGame> {
  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const userLeague = next.myLeague;

  // Get all leagues that have cup fixtures

  const allLeagues = Object.keys(next.cupFixtures) as LeagueId[];

  for (const lg of allLeagues) {
    const cupFixtures = next.cupFixtures[lg];

    if (!cupFixtures) continue;

    // Determine if this league/country is VIP (active) - MIRRORS league logic

    const isVIP = isVIPLeague(lg, userLeague);

    // Get fixtures for the current round that don't have results

    const roundFixtures = cupFixtures.filter((f) => f.round === currentRound && !f.result);

    for (const f of roundFixtures) {
      // Skip if this is the user's team (already played)

      if (f.homeId === next.myTeamId || f.awayId === next.myTeamId) continue;

      const home = teamById(f.homeId);

      const away = teamById(f.awayId);

      if (!home || !away) continue;

      let result: SimResult;

      if (isVIP) {
        // DEEP SIMULATION for VIP countries - EXACT same logic as league VIP matches

        const homeXI = getStarters(next, f.homeId);

        const awayXI = getStarters(next, f.awayId);

        if (homeXI.length === 0 || awayXI.length === 0) {
          console.warn(
            `Empty squad for VIP cup fixture ${f.id}: ${f.homeId} (${homeXI.length}) vs ${f.awayId} (${awayXI.length})`,
          );

          result = {
            homeGoals: 0,
            awayGoals: 0,
            events: [],
            cards: [],
            injuries: [],
            xgHome: 0,
            xgAway: 0,
          };
        } else {
          result = simulateMatch(home, away, homeXI, awayXI, {
            homeBench: getBenchForTeam(next, f.homeId, homeXI),
            awayBench: getBenchForTeam(next, f.awayId, awayXI),
            homeTactics: loadTactics(fixture.homeId),
            awayTactics: loadTactics(fixture.awayId),
            homeFormation:
              (next.formations[f.homeId] as FormationName | undefined) || "Táctica 4-4-2",
            awayFormation:
              (next.formations[f.awayId] as FormationName | undefined) || "Táctica 4-4-2",
          });

          next = applyMatchToStats(next, { ...f, result });

          // Handle cup draws: extra time and penalties

          if (result.homeGoals === result.awayGoals) {
            // Simulate extra time

            const etResult = simulateExtraTime(home, away, homeXI, awayXI);

            result.extraTime = {
              homeGoals: etResult.homeGoals,

              awayGoals: etResult.awayGoals,

              events: etResult.events,
            };

            // Check if still tied after extra time

            const totalHome = result.homeGoals + etResult.homeGoals;

            const totalAway = result.awayGoals + etResult.awayGoals;

            if (totalHome === totalAway) {
              // Simulate penalty shootout

              const penaltyResult = simulatePenaltyShootout(homeXI, awayXI);

              result.penalties = {
                homeGoals: penaltyResult.homeGoals,

                awayGoals: penaltyResult.awayGoals,

                shootout: penaltyResult.shootout,
              };
            }
          }
        }
      } else {
        // O(1) MATH SIMULATION for background countries - EXACT same logic as league background matches

        result = generateFakeMatchResult(home, away);

        // Handle cup draws: extra time and penalties for background countries

        if (result.homeGoals === result.awayGoals) {
          // Simulate extra time (simplified for background)

          const etHomeGoals = Math.random() < 0.3 ? Math.floor(Math.random() * 2) : 0;

          const etAwayGoals = Math.random() < 0.3 ? Math.floor(Math.random() * 2) : 0;

          result.extraTime = {
            homeGoals: etHomeGoals,

            awayGoals: etAwayGoals,

            events: [],
          };

          // Check if still tied after extra time

          const totalHome = result.homeGoals + etHomeGoals;

          const totalAway = result.awayGoals + etAwayGoals;

          if (totalHome === totalAway) {
            // Simulate penalty shootout using the same function as VIP for consistency

            const homeXI = getStarters(next, f.homeId);

            const awayXI = getStarters(next, f.awayId);

            const penaltyResult = simulatePenaltyShootout(homeXI, awayXI);

            result.penalties = {
              homeGoals: penaltyResult.homeGoals,

              awayGoals: penaltyResult.awayGoals,

              shootout: penaltyResult.shootout,
            };
          }
        }

        // No stats recording for background countries to save time (same as league)
      }

      // Apply result to cup fixtures

      const idx = cupFixtures.findIndex((x) => x.id === f.id);

      if (idx >= 0) {
        cupFixtures[idx] = { ...f, result };
      } else {
        console.warn(`Cup fixture not found in array: ${f.id} in league ${lg}`);
      }
    }
  }

  // DO NOT call processCupDrawsOnly here - it's for advancing bracket after league matchdays

  // Cup draws are handled separately in the calendar

  return next;
}

/**







 * Simulate all unplayed UCL fixtures for a specific matchday







 */

/**
 * UEFA Champions League prize money (approx. 2024/25 in EUR).
 * Only credited to the user's team. Milestone prizes use `uclPrizesAwarded`
 * as an idempotency key so re-simulation never double-pays.
 */
export const UCL_PRIZES = {
  participation: 18_600_000,
  leagueWin: 2_100_000,
  leagueDraw: 700_000,
  advanceR16: 11_000_000,
  advanceQF: 12_500_000,
  advanceSF: 15_000_000,
  finalist: 18_500_000,
  champion: 25_000_000,
} as const;

function addToUserBudget(save: SaveGame, teamId: string, amount: number) {
  if (!amount || teamId !== save.myTeamId) return;
  try {
    usePlayersStore.setState((s) => ({ budget: (s as any).budget + amount }));
  } catch {}
}

function grantUCLPrizeOnce(save: SaveGame, key: string, teamId: string, amount: number) {
  if (teamId !== save.myTeamId) return;
  save.uclPrizesAwarded = save.uclPrizesAwarded ?? [];
  if (save.uclPrizesAwarded.includes(key)) return;
  save.uclPrizesAwarded.push(key);
  addToUserBudget(save, teamId, amount);
}

/**
 * Apply post-match aftermath for a UCL fixture to BOTH teams:
 *  - decrement suspension counters by 1 (remove completed)
 *  - decrement injuredUntil by 1 for still-injured squad members (recover one matchday earlier)
 *  - credit league-phase prize money to the user's team when applicable
 */
function applyUCLMatchAftermath(save: SaveGame, homeId: string, awayId: string): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  for (const teamId of [homeId, awayId]) {
    // Suspensions
    if (next.suspensions && next.suspensions[teamId]?.length) {
      next.suspensions[teamId] = next.suspensions[teamId]
        .map((s: any) => ({ ...s, matchdaysRemaining: s.matchdaysRemaining - 1 }))
        .filter((s: any) => s.matchdaysRemaining > 0);
    }
    // Injuries — bump injuredUntil down by 1 for players still injured per their league matchday
    const lg = teamById(teamId).league as any;
    const md = next.currentMatchday?.[lg] ?? 0;
    const squad = next.squads?.[teamId];
    if (squad?.length) {
      for (const p of squad) {
        if (p.injuredUntil && p.injuredUntil > md) {
          p.injuredUntil = Math.max(md, p.injuredUntil - 1);
        }
      }
    }
  }

  // Prize money — participation + league-phase W/D for user's team
  if (next.myTeamId === homeId || next.myTeamId === awayId) {
    grantUCLPrizeOnce(next, "participation", next.myTeamId, UCL_PRIZES.participation);
    const fx = next.uclFixtures?.find(
      (f) =>
        f.homeId === homeId && f.awayId === awayId && f.result && f.round?.startsWith("Jornada"),
    );
    if (fx?.result) {
      const isHome = next.myTeamId === homeId;
      const gf = isHome ? fx.result.homeGoals : fx.result.awayGoals;
      const ga = isHome ? fx.result.awayGoals : fx.result.homeGoals;
      if (gf > ga) addToUserBudget(next, next.myTeamId, UCL_PRIZES.leagueWin);
      else if (gf === ga) addToUserBudget(next, next.myTeamId, UCL_PRIZES.leagueDraw);
    }
  }

  return next;
}

export function simulateUCLMatchday(save: SaveGame, matchday: number): SaveGame {
  let next: SaveGame = JSON.parse(JSON.stringify(save));

  console.log(
    `[simulateUCLMatchday] START - matchday: ${matchday}, total fixtures: ${next.uclFixtures?.length ?? 0}`,
  );

  if (!next.uclFixtures) return next;

  const matchdayFixtures = next.uclFixtures.filter((f) => f.matchday === matchday && !f.result);

  console.log(`[simulateUCLMatchday] fixtures to simulate: ${matchdayFixtures.length}`);

  if (matchdayFixtures.length === 0) {
    console.log(
      `[simulateUCLMatchday] No fixtures to simulate - all fixtures on matchday:`,
      next.uclFixtures
        .filter((f) => f.matchday === matchday)
        .map((f) => ({ id: f.id, hasResult: !!f.result })),
    );
  }

  for (const f of matchdayFixtures) {
    const simmed = simulateFixtureInline(next, f);

    console.log(
      `[simulateUCLMatchday] simulated ${f.id}: ${simmed.result?.homeGoals}-${simmed.result?.awayGoals}`,
    );

    const idx = next.uclFixtures.findIndex((x) => x.id === f.id);

    if (idx >= 0) {
      next.uclFixtures[idx] = simmed;

      next = applyMatchToStats(next, simmed);
      next = applyUCLMatchAftermath(next, simmed.homeId, simmed.awayId);

      // Update UCL table (league phase only)

      if (simmed.result && next.ucl && isUCLLeaguePhaseFixture(simmed.round)) {
        next.ucl.table = applyUCLTableResult(
          next.ucl.table,
          simmed.homeId,
          simmed.awayId,
          simmed.result.homeGoals,
          simmed.result.awayGoals,
        );
      }
    }
  }

  // Note: UCL draws are not implemented yet, but could be added here in the future

  return next;
}

/**







 * Play a specific fixture by ID: simulate just my game, leave the rest of the matchday open.







 */

export function playSpecificFixture(
  save: SaveGame,
  fixtureId: string,
): { save: SaveGame; fixture: Fixture | null } {
  let next: SaveGame = JSON.parse(JSON.stringify(save));

  console.log("playSpecificFixture called with fixtureId:", fixtureId);

  // Try to find fixture in league fixtures

  let fixture = next.fixtures[next.myLeague].find((f) => f.id === fixtureId);

  if (fixture && !fixture.result) {
    console.log("Found fixture in league fixtures:", fixture.id);

    const simmed = simulateFixtureInline(next, fixture);

    const idx = next.fixtures[next.myLeague].findIndex((x) => x.id === fixtureId);

    if (idx >= 0) {
      next.fixtures[next.myLeague][idx] = simmed;

      next.standings[next.myLeague] = applyResult(next.standings[next.myLeague], simmed);

      next = applyMatchToStats(next, simmed);
    }

    return { save: next, fixture: simmed };
  }

  // Try to find fixture in cup fixtures

  for (const lg of Object.keys(next.cupFixtures)) {
    fixture = next.cupFixtures[lg as LeagueId].find((f) => f.id === fixtureId);

    if (fixture && !fixture.result) {
      console.log("Found fixture in cup fixtures:", fixture.id, "league:", lg);

      // Check if this is a user match - if so, use regular simulation (no auto extra time/penalties)

      const isUserMatch = fixture.homeId === next.myTeamId || fixture.awayId === next.myTeamId;

      const simmed = simulateFixtureInline(next, fixture, false, isUserMatch ? false : true);

      const idx = next.cupFixtures[lg as LeagueId].findIndex((x) => x.id === fixtureId);

      if (idx >= 0) {
        next.cupFixtures[lg as LeagueId][idx] = simmed;

        next = applyMatchToStats(next, simmed);
      }

      return { save: next, fixture: simmed };
    }
  }

  // Try to find fixture in UCL fixtures

  if (next.uclFixtures) {
    fixture = next.uclFixtures.find((f) => f.id === fixtureId);

    if (fixture && !fixture.result) {
      console.log("Found fixture in UCL fixtures:", fixture.id);

      const simmed = simulateFixtureInline(next, fixture);

      const idx = next.uclFixtures.findIndex((x) => x.id === fixtureId);

      if (idx >= 0) {
        next.uclFixtures[idx] = simmed;

        next = applyMatchToStats(next, simmed);

        // Update UCL table (league phase only)

        if (simmed.result && next.ucl && isUCLLeaguePhaseFixture(simmed.round)) {
          next.ucl.table = applyUCLTableResult(
            next.ucl.table,
            simmed.homeId,
            simmed.awayId,
            simmed.result.homeGoals,
            simmed.result.awayGoals,
          );
        }
      }

      return { save: next, fixture: simmed };
    }
  }

  console.log("Fixture not found in any competition:", fixtureId);

  return { save: next, fixture: null };
}

/**







 * Play my next league match: simulate just my game, leave the rest of the matchday open.







 */

export function playMyNextMatch(save: SaveGame): { save: SaveGame; fixture: Fixture | null } {
  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const my = getMyNextFixture(next);

  if (!my) return { save: next, fixture: null };

  const simmed = simulateFixtureInline(next, my);

  const idx = next.fixtures[next.myLeague].findIndex((x) => x.id === my.id);

  next.fixtures[next.myLeague][idx] = simmed;

  next.standings[next.myLeague] = applyResult(next.standings[next.myLeague], simmed);

  next = applyMatchToStats(next, simmed);

  return { save: next, fixture: simmed };
}

/**







 * Play my next cup match: simulate just my cup game.







 */

export function playMyNextCupMatch(save: SaveGame): { save: SaveGame; fixture: Fixture | null } {
  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const myCupFixtures = getMyUpcomingCupFixtures(next).filter((f) => f.competition === "cup");

  if (myCupFixtures.length === 0) return { save: next, fixture: null };

  const my = myCupFixtures[0];

  const simmed = simulateFixtureInline(next, my, false, true);

  const idx = next.cupFixtures[next.myLeague].findIndex((x) => x.id === my.id);

  next.cupFixtures[next.myLeague][idx] = simmed;

  next = applyMatchToStats(next, simmed);

  return { save: next, fixture: simmed };
}

// Fast synchronous version for UI responsiveness - only simulates essential leagues

export function finishMatchdayFast(save: SaveGame, leaguesToSim?: LeagueId[]): SaveGame {
  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const targetLeagues = leaguesToSim || [save.myLeague];

  for (const lg of targetLeagues) {
    const md = next.currentMatchday[lg];

    const remaining = next.fixtures[lg]?.filter((f) => f.matchday === md && !f.result) || [];

    for (const f of remaining) {
      // Use fast simulation mode for all matches in fast mode

      const sim = simulateFixtureInline(next, f, true);

      const idx = next.fixtures[lg].findIndex((x) => x.id === f.id);

      if (idx >= 0) next.fixtures[lg][idx] = sim;

      next.standings[lg] = applyResult(next.standings[lg], sim);

      next = applyMatchToStats(next, sim);
    }

    next.currentMatchday[lg] = md + 1;
  }

  // Decrease suspension counters after advancing matchday

  next = decreaseSuspensions(next);

  // Advance cup for simulated leagues only

  for (const cupLg of targetLeagues) {
    advanceCupForLeague(next, cupLg);
  }

  if (targetLeagues.includes(save.myLeague)) {
    advanceUCL(next);
  }

  return next;
}

// ULTRA-FAST: Generate fake but realistic match result (no squad lookup, O(1))

function generateFakeMatchResult(home: Team, away: Team): SimResult {
  const homeOvr = (home.att + home.mid + home.def) / 3;

  const awayOvr = (away.att + away.mid + away.def) / 3;

  const diff = homeOvr - awayOvr;

  // Increased RNG variation to reduce draws

  const rng = () => Math.floor(Math.random() * 5) - 2;

  // Base goals with more variation

  let homeGoals = Math.max(0, Math.round(1.2 + diff * 0.05 + rng() * 0.8));

  let awayGoals = Math.max(0, Math.round(1.0 - diff * 0.05 + rng() * 0.8));

  homeGoals = Math.min(homeGoals, 6);

  awayGoals = Math.min(awayGoals, 5);

  // Minimal events - just result, no individual scorers

  return {
    homeGoals,

    awayGoals,

    events: [], // No events - we'll fake stats in batch at the end

    cards: [],

    injuries: [],

    xgHome: homeGoals * 0.85,

    xgAway: awayGoals * 0.85,
  };
}

// Ultra-fast fake stats generation - simplified for speed

function generateFakeStatsForBackgroundLeagues(save: SaveGame, leagues: LeagueId[]) {
  const store = usePlayersStore.getState();

  // Limit stats generation to keep it fast

  const MAX_PLAYERS_PER_LEAGUE = 50;

  for (const lg of leagues) {
    const matchday = save.currentMatchday[lg];

    if (matchday <= 2) continue; // Skip early matchdays

    const leagueTeamsList = teamsByLeague(lg);

    let playersProcessed = 0;

    for (const team of leagueTeamsList) {
      if (playersProcessed >= MAX_PLAYERS_PER_LEAGUE) break;

      const squad = store.getSimSquad(team.id);

      if (squad.length === 0) continue;

      const gamesPlayed = matchday - 1;

      // Only process top players (faster)

      const topPlayers = squad.slice(0, 5);

      for (const player of topPlayers) {
        if (playersProcessed >= MAX_PLAYERS_PER_LEAGUE) break;

        if (player.positions.includes("GK")) {
          store.recordAppearance(player.id);

          playersProcessed++;

          continue;
        }

        // Simple stat generation

        const goalProb = isAttacking(player.positions)
          ? 0.5
          : isMidfield(player.positions)
            ? 0.2
            : 0.05;

        const expectedGoals = Math.floor(gamesPlayed * goalProb * (player.rating / 80));

        const goals = Math.min(expectedGoals, gamesPlayed);

        const assists = Math.floor(goals * 0.6);

        const appearances = Math.max(goals, Math.min(gamesPlayed, 5));

        // Batch record (single calls)

        if (appearances > 0) store.recordAppearance(player.id);

        for (let g = 0; g < Math.min(goals, 3); g++) store.recordGoal(player.id);

        for (let a = 0; a < Math.min(assists, 2); a++) store.recordAssist(player.id);

        playersProcessed++;
      }
    }
  }
}

// Big 5 European leagues for VIP deep simulation

const BIG5_LEAGUES: LeagueId[] = ["laliga", "premier", "seriea", "bundesliga", "ligue1"];

// Additional important leagues for VIP deep simulation

const IMPORTANT_LEAGUES: LeagueId[] = [
  "ligaportugal",
  "1aproleague",
  "eredivisie",
  "trendyolsperlig",
];

function isVIPLeague(leagueId: LeagueId, userLeague: LeagueId): boolean {
  return (
    leagueId === userLeague ||
    BIG5_LEAGUES.includes(leagueId) ||
    IMPORTANT_LEAGUES.includes(leagueId)
  );
}

// Generate realistic player stats for O(1) leagues based on match results (OPTIMIZED)

export function generateRealisticStatsForO1Leagues(
  save: SaveGame,
  o1Leagues: LeagueId[],
  maxMatchday?: number,
  startMatchday?: number,
) {
  const store = usePlayersStore.getState();

  for (const lg of o1Leagues) {
    const currentMatchday = save.currentMatchday[lg] - 1; // Current matchday just finished

    if (currentMatchday < 1) continue;

    // Limit to the user's current matchday to keep stats in sync

    const limitMatchday = maxMatchday ? Math.min(currentMatchday, maxMatchday) : currentMatchday;

    // Start from the specified matchday (or 1 if not specified)

    const startFrom = startMatchday || 1;

    // Process matchdays from startFrom to limitMatchday

    for (let md = startFrom; md <= limitMatchday; md++) {
      const leagueFixtures = save.fixtures[lg].filter((f) => f.matchday === md && f.result);

      if (leagueFixtures.length === 0) continue;

      // Batch process all fixtures in this matchday

      const allPlayersToRecord = new Map<string, Player[]>(); // teamId -> players

      // First pass: collect all players who played

      for (const fixture of leagueFixtures) {
        const homeTeam = teamById(fixture.homeId);

        const awayTeam = teamById(fixture.awayId);

        if (!homeTeam || !awayTeam) continue;

        const homeSquad = store.getSimSquad(homeTeam.id);

        const awaySquad = store.getSimSquad(awayTeam.id);

        // Quick selection without detailed formation constraints for speed

        const selectMatchPlayers = (squad: Player[]): Player[] => {
          const gks = squad.filter((p) => isGoalkeeper(p.positions)).slice(0, 1);

          const defs = squad.filter((p) => isDefensive(p.positions)).slice(0, 4);

          const mids = squad.filter((p) => isMidfield(p.positions)).slice(0, 4);

          const fwds = squad.filter((p) => isAttacking(p.positions)).slice(0, 2);

          let players = [...gks, ...defs, ...mids, ...fwds];

          if (players.length < 11) {
            const remaining = squad.filter((p) => !players.includes(p));

            players = [...players, ...remaining.slice(0, 11 - players.length)];
          }

          return players.slice(0, 11);
        };

        const homePlayers = selectMatchPlayers(homeSquad);

        const awayPlayers = selectMatchPlayers(awaySquad);

        allPlayersToRecord.set(homeTeam.id, homePlayers);

        allPlayersToRecord.set(awayTeam.id, awayPlayers);
      }

      // Second pass: record appearances (batch)

      for (const [teamId, players] of allPlayersToRecord) {
        for (const player of players) {
          store.recordAppearance(player.id);
        }
      }

      // Third pass: generate injuries (6% chance per team)

      for (const [teamId, players] of allPlayersToRecord) {
        if (Math.random() > 0.06) continue;

        const victim = players[Math.floor(Math.random() * players.length)];

        const weeks = 1 + Math.floor(Math.random() * 5);

        const reasons = ["Muscular", "Rodilla", "Tobillo", "Lesión menor", "Fatiga"];

        const reason = reasons[Math.floor(Math.random() * reasons.length)];

        store.recordInjury(victim.id, md + weeks, reason);
      }

      // Fourth pass: assign goals and assists based on fixture results

      for (const fixture of leagueFixtures) {
        if (!fixture.result) continue;

        const homePlayers = allPlayersToRecord.get(fixture.homeId) || [];

        const awayPlayers = allPlayersToRecord.get(fixture.awayId) || [];

        if (homePlayers.length === 0 || awayPlayers.length === 0) continue;

        const assignGoals = (teamGoals: number, players: Player[]) => {
          const forwards = players.filter((p) => isAttacking(p.positions));

          const mids = players.filter((p) => isMidfield(p.positions));

          const defs = players.filter((p) => isDefensive(p.positions));

          for (let i = 0; i < teamGoals; i++) {
            const rand = Math.random();

            let scorer: Player | undefined;

            if (rand < 0.7 && forwards.length > 0) {
              scorer = forwards[Math.floor(Math.random() * forwards.length)];
            } else if (rand < 0.95 && mids.length > 0) {
              scorer = mids[Math.floor(Math.random() * mids.length)];
            } else if (defs.length > 0) {
              scorer = defs[Math.floor(Math.random() * defs.length)];
            }

            if (scorer) store.recordGoal(scorer.id);
          }
        };

        const assignAssists = (teamGoals: number, players: Player[]) => {
          const mids = players.filter((p) => isMidfield(p.positions));

          const forwards = players.filter((p) => isAttacking(p.positions));

          const assists = Math.floor(teamGoals * 0.7);

          for (let i = 0; i < assists; i++) {
            const rand = Math.random();

            let assister: Player | undefined;

            if (rand < 0.6 && mids.length > 0) {
              assister = mids[Math.floor(Math.random() * mids.length)];
            } else if (forwards.length > 0) {
              assister = forwards[Math.floor(Math.random() * forwards.length)];
            }

            if (assister) store.recordAssist(assister.id);
          }
        };

        assignGoals(fixture.result.homeGoals, homePlayers);

        assignGoals(fixture.result.awayGoals, awayPlayers);

        assignAssists(fixture.result.homeGoals, homePlayers);

        assignAssists(fixture.result.awayGoals, awayPlayers);
      }
    }
  }
}

/**







 * LAYERED SIMULATION - MAXIMUM PERFORMANCE:







 * - VIP Leagues (Big 5 + User's league): Deep simulation







 * - Background Leagues: O(1) fast math only







 * - Ultra-small batches with forced UI updates







 */

export async function simulateBackgroundLeaguesOnly(
  save: SaveGame,
  currentDate: string,
  nextMatchDate?: string,
  onProgress?: (processed: number, total: number) => void,
): Promise<SaveGame> {
  const next: SaveGame = JSON.parse(JSON.stringify(save));

  const userLeague = next.myLeague;

  const backgroundLeagues: LeagueId[] = [];

  // Collect background leagues that have fixtures to simulate

  for (const lg of Object.keys(next.fixtures) as LeagueId[]) {
    const md = next.currentMatchday[lg];

    const fixtures = next.fixtures[lg].filter((f) => f.matchday === md && !f.result);

    const isVIP = isVIPLeague(lg, userLeague);

    if (!isVIP && fixtures.length > 0) backgroundLeagues.push(lg);
  }

  if (backgroundLeagues.length === 0) return save;

  // If there are already pending league sims not yet processed, skip re-scheduling

  // to avoid duplicates and uneven distribution

  const existingPending = (next.pendingBackgroundSims || []).filter((s) => !s.isCup);

  if (existingPending.length > 0) return save;

  // Use provided dates; fall back to +7 days if no match date known

  const baseDate = nextMatchDate || addDaysToIso(currentDate, 7);

  // Distribute across 3 days: -1, 0 (match day), +1

  // For N=19: 6, 6, 7. For N=18: 6, 6, 6. General: floor(N/3) or ceil(N/3).

  const newScheduledSims = [...(next.pendingBackgroundSims || [])];

  const total = backgroundLeagues.length;

  const perDay = Math.floor(total / 3);

  const remainder = total % 3;

  // slot sizes: day0 gets perDay, day1 gets perDay, day2 gets perDay + remainder

  const slotSizes = [perDay, perDay, perDay + remainder];

  const offsets = [-1, 0, 1];

  let slotIndex = 0;

  let countInSlot = 0;

  for (const lg of backgroundLeagues) {
    const matchday = next.currentMatchday[lg];

    const alreadyScheduled = newScheduledSims.some(
      (s) => s.league === lg && s.matchday === matchday && !s.isCup,
    );

    if (!alreadyScheduled) {
      // Advance slot if current slot is full

      while (slotIndex < 2 && countInSlot >= slotSizes[slotIndex]) {
        slotIndex++;

        countInSlot = 0;
      }

      const offset = offsets[slotIndex];

      const scheduledDate = addDaysToIso(baseDate, offset);

      newScheduledSims.push({ league: lg, matchday, isCup: false, date: scheduledDate });

      countInSlot++;
    }
  }

  next.pendingBackgroundSims = newScheduledSims;

  return next;
}

export async function scheduleBackgroundCupsOnly(
  save: SaveGame,
  matchday: number,
  currentDate: string,
): Promise<SaveGame> {
  const next: SaveGame = JSON.parse(JSON.stringify(save));

  const userLeague = next.myLeague;

  const backgroundCupLeagues: LeagueId[] = [];

  // Collect background cup leagues that have fixtures to simulate

  for (const lg of Object.keys(next.cupFixtures) as LeagueId[]) {
    const cupFixtures = next.cupFixtures[lg];

    if (!cupFixtures) continue;

    const isVIP = isVIPLeague(lg, userLeague);

    const fixtures = cupFixtures.filter((f) => f.matchday === matchday && !f.result);

    if (!isVIP && fixtures.length > 0) backgroundCupLeagues.push(lg);
  }

  if (backgroundCupLeagues.length === 0) return save;

  // If there are already pending cup sims not yet processed, skip re-scheduling

  const existingCupPending = (next.pendingBackgroundSims || []).filter((s) => s.isCup);

  if (existingCupPending.length > 0) return save;

  // Distribution: 5 countries the day BEFORE the cup event, rest the day AFTER

  // For N=11: 5 before, 6 after. For N=10: 5 before, 5 after.

  const newScheduledSims = [...(next.pendingBackgroundSims || [])];

  const BEFORE_COUNT = 5;

  let countBefore = 0;

  for (const lg of backgroundCupLeagues) {
    const alreadyScheduled = newScheduledSims.some(
      (s) => s.league === lg && s.matchday === matchday && s.isCup,
    );

    if (!alreadyScheduled) {
      const offset = countBefore < BEFORE_COUNT ? -1 : 1;

      const scheduledDate = addDaysToIso(currentDate, offset);

      newScheduledSims.push({ league: lg, matchday, isCup: true, date: scheduledDate });

      countBefore++;
    }
  }

  next.pendingBackgroundSims = newScheduledSims;

  return next;
}

// Shared helper: given a squad of players and a result, record goals/assists/cards/injuries

function recordFakeMatchStats(
  store: ReturnType<typeof usePlayersStore.getState>,
  homePlayers: Player[],
  awayPlayers: Player[],
  result: SimResult,
  currentMatchday: number,
) {
  // Fast-simulated matches already contain the same authoritative events as
  // detailed matches. Never generate a second, random set of scorers/cards:
  // that could credit a player who had already been substituted.
  const allPlayers = new Map(
    [
      ...homePlayers,
      ...awayPlayers,
      ...(result.homeLineup ?? []),
      ...(result.awayLineup ?? []),
    ].map((p) => [p.id, p]),
  );

  const participants = new Set<string>();
  for (const p of result.homeLineup ?? homePlayers) participants.add(p.id);
  for (const p of result.awayLineup ?? awayPlayers) participants.add(p.id);
  for (const sub of result.substitutions ?? []) participants.add(sub.playerInId);

  for (const playerId of participants) {
    store.recordAppearance(playerId);
  }

  for (const event of result.events ?? []) {
    if (event.type === "own_goal") continue;
    store.recordGoal(event.scorerId);
    if (event.assistId) store.recordAssist(event.assistId);
  }

  for (const card of result.cards ?? []) {
    if (card.cardType === "yellow") {
      store.recordYellowCard(card.playerId);
    } else {
      store.recordRedCard(card.playerId);
      if (card.isSecondYellow) store.recordYellowCard(card.playerId);
    }
  }

  for (const injury of result.injuries ?? []) {
    const player = allPlayers.get(injury.playerId);
    if (player) {
      store.recordInjury(
        injury.playerId,
        currentMatchday + Math.max(1, injury.weeks),
        injury.reason,
      );
    }
  }

  for (const event of result.extraTime?.events ?? []) {
    if (event.type === "own_goal") continue;
    store.recordGoal(event.scorerId);
    if (event.assistId) store.recordAssist(event.assistId);
  }
}

// Shared helper: select 11 match players from a squad

function selectMatchPlayers(squad: Player[]): Player[] {
  const gks = squad.filter((p) => isGoalkeeper(p.positions)).slice(0, 1);

  const defs = squad.filter((p) => isDefensive(p.positions)).slice(0, 4);

  const mids = squad.filter((p) => isMidfield(p.positions)).slice(0, 4);

  const fwds = squad.filter((p) => isAttacking(p.positions)).slice(0, 2);

  let players = [...gks, ...defs, ...mids, ...fwds];

  if (players.length < 11) {
    const remaining = squad.filter((p) => !players.includes(p));

    players = [...players, ...remaining.slice(0, 11 - players.length)];
  }

  return players.slice(0, 11);
}

export function processScheduledBackgroundSims(save: SaveGame, today: string): SaveGame {
  return withPlayerStatsBatch(() => {
    const pending = save.pendingBackgroundSims ?? [];

    const due = pending.filter((p) => p.date === today);

    if (due.length === 0) return save;

    // Partial clone: only deep copy leagues/cups that are due today

    const dueLeagues = new Set(due.filter((p) => !p.isCup).map((p) => p.league));

    const dueCups = new Set(due.filter((p) => p.isCup).map((p) => p.league));

    const next: SaveGame = {
      ...save,

      fixtures: { ...save.fixtures },

      standings: { ...save.standings },

      cupFixtures: { ...save.cupFixtures },

      currentMatchday: { ...save.currentMatchday },

      pendingBackgroundSims: [...(save.pendingBackgroundSims ?? [])],
    };

    for (const lg of dueLeagues) {
      if (save.fixtures[lg]) next.fixtures[lg] = save.fixtures[lg].map((f) => ({ ...f }));

      if (save.standings[lg]) next.standings[lg] = save.standings[lg].map((s) => ({ ...s }));
    }

    for (const lg of dueCups) {
      if (save.cupFixtures[lg]) next.cupFixtures[lg] = save.cupFixtures[lg].map((f) => ({ ...f }));
    }

    const processedKeys = new Set<string>();

    const store = usePlayersStore.getState();

    for (const entry of due) {
      const { league, matchday, isCup } = entry;

      const key = `${isCup ? "cup" : "lg"}:${league}:${matchday}`;

      if (isCup) {
        const list = next.cupFixtures[league];

        if (!list) {
          processedKeys.add(key);
          continue;
        }

        const fixtures = list.filter((f) => f.matchday === matchday && !f.result);

        for (const f of fixtures) {
          const home = teamById(f.homeId);

          const away = teamById(f.awayId);

          if (!home || !away) continue;

          const result = generateFakeMatchResult(home, away);

          // Handle draws in cup: simple extra time

          if (result.homeGoals === result.awayGoals) {
            const etH = Math.random() < 0.3 ? 1 : 0;

            const etA = Math.random() < 0.3 ? 1 : 0;

            result.extraTime = { homeGoals: etH, awayGoals: etA, events: [] };

            if (result.homeGoals + etH === result.awayGoals + etA) {
              result.penalties = {
                homeGoals: Math.random() < 0.5 ? 5 : 4,

                awayGoals: Math.random() < 0.5 ? 4 : 5,

                shootout: [],
              };
            }
          }

          const idx = next.cupFixtures[league].findIndex((x) => x.id === f.id);

          if (idx >= 0) next.cupFixtures[league][idx] = { ...f, result };
        }

        processedKeys.add(key);
      } else {
        const leagueFixtures = next.fixtures[league];

        if (!leagueFixtures) {
          processedKeys.add(key);
          continue;
        }

        const fixtures = leagueFixtures.filter((f) => f.matchday === matchday && !f.result);

        const allPlayersToRecord = new Map<string, Player[]>();

        // First pass: collect players

        for (const f of fixtures) {
          const home = teamById(f.homeId);

          const away = teamById(f.awayId);

          if (!home || !away) continue;

          allPlayersToRecord.set(home.id, selectMatchPlayers(store.getSimSquad(home.id)));

          allPlayersToRecord.set(away.id, selectMatchPlayers(store.getSimSquad(away.id)));
        }

        // Second pass: record appearances

        for (const players of allPlayersToRecord.values()) {
          for (const player of players) store.recordAppearance(player.id);
        }

        // Third pass: simulate and assign stats (goals, assists, cards, injuries)

        for (const f of fixtures) {
          const home = teamById(f.homeId);

          const away = teamById(f.awayId);

          if (!home || !away) continue;

          const result = generateFakeMatchResult(home, away);

          const idx = next.fixtures[league].findIndex((x) => x.id === f.id);

          if (idx >= 0) {
            next.fixtures[league][idx] = { ...f, result };

            next.standings[league] = applyResult(
              next.standings[league],
              next.fixtures[league][idx],
            );

            const homePlayers = allPlayersToRecord.get(f.homeId) || [];

            const awayPlayers = allPlayersToRecord.get(f.awayId) || [];

            recordFakeMatchStats(
              store,
              homePlayers,
              awayPlayers,
              result,
              next.currentMatchday[league],
            );
          }
        }

        if (fixtures.length > 0) next.currentMatchday[league]++;

        processedKeys.add(key);
      }
    }

    // Remove processed entries from pendingBackgroundSims

    next.pendingBackgroundSims = (next.pendingBackgroundSims ?? []).filter((p) => {
      const key = `${p.isCup ? "cup" : "lg"}:${p.league}:${p.matchday}`;

      return !processedKeys.has(key);
    });

    return next;
  });
}

export async function advanceMatchdayLayered(
  save: SaveGame,
  onProgress?: (processed: number, total: number) => void,
): Promise<SaveGame> {
  return withPlayerStatsBatchAsync(async () => {
    const BATCH_SIZE = 100;

    const userLeague = save.myLeague;

    // Determine VIP leagues upfront to avoid cloning all 7000+ fixtures

    const vipLeagueSet = new Set(
      (Object.keys(save.fixtures) as LeagueId[]).filter((lg) => isVIPLeague(lg, userLeague)),
    );

    // Partial clone: shallow copy top-level, deep copy only VIP fixtures/standings/cupFixtures

    let next: SaveGame = {
      ...save,

      fixtures: { ...save.fixtures },

      standings: { ...save.standings },

      cupFixtures: { ...save.cupFixtures },

      currentMatchday: { ...save.currentMatchday },

      formations: { ...save.formations },

      suspensions: JSON.parse(JSON.stringify(save.suspensions)),

      lineups: { ...save.lineups },
    };

    for (const lg of vipLeagueSet) {
      next.fixtures[lg] = save.fixtures[lg].map((f) => ({ ...f }));

      next.standings[lg] = save.standings[lg].map((s) => ({ ...s }));

      if (save.cupFixtures[lg]) next.cupFixtures[lg] = save.cupFixtures[lg].map((f) => ({ ...f }));
    }

    // Only process VIP leagues - background leagues are handled by the scheduling system

    const allFixtures: { fixture: Fixture; league: LeagueId; isVIP: boolean }[] = [];

    for (const lg of vipLeagueSet) {
      const md = next.currentMatchday[lg];

      const fixtures = next.fixtures[lg].filter((f) => f.matchday === md && !f.result);

      for (const f of fixtures) {
        allFixtures.push({ fixture: f, league: lg, isVIP: true });
      }
    }

    // console.log(`advanceMatchdayLayered: Total fixtures to simulate: ${allFixtures.length}`);

    // console.log(`advanceMatchdayLayered: Leagues with fixtures:`, [...new Set(allFixtures.map(f => f.league))]);

    const totalMatches = allFixtures.length;

    const store = usePlayersStore.getState();

    let processed = 0;

    // Process in batches with yield control

    for (let i = 0; i < allFixtures.length; i += BATCH_SIZE) {
      const batch = allFixtures.slice(i, i + BATCH_SIZE);

      // Process this batch synchronously (fast)

      for (const { fixture, league, isVIP } of batch) {
        const home = teamById(fixture.homeId);

        const away = teamById(fixture.awayId);

        if (!home || !away) continue;

        let result: SimResult;

        if (league === userLeague) {
          // DEEP SIMULATION for user's own league

          const homeXI = getStarters(next, fixture.homeId);

          const awayXI = getStarters(next, fixture.awayId);

          if (homeXI.length === 0 || awayXI.length === 0) {
            result = {
              homeGoals: 0,
              awayGoals: 0,
              events: [],
              cards: [],
              injuries: [],
              xgHome: 0,
              xgAway: 0,
            };
          } else {
            result = simulateMatch(home, away, homeXI, awayXI, {
              homeBench: getBenchForTeam(next, fixture.homeId, homeXI),
              awayBench: getBenchForTeam(next, fixture.awayId, awayXI),
              homeTactics: loadTactics(fixture.homeId),
              awayTactics: loadTactics(fixture.awayId),
              homeFormation:
                (next.formations[fixture.homeId] as FormationName | undefined) || "Táctica 4-4-2",
              awayFormation:
                (next.formations[fixture.awayId] as FormationName | undefined) || "Táctica 4-4-2",
            });

            next = applyMatchToStats(next, { ...fixture, result });
          }
        } else {
          // FAST, pero detallada: incluso los partidos de otros equipos deben
          // guardar XI, formación, goleadores, asistencias, tarjetas, paradones,
          // palos y sustituciones para que la pantalla de crónica sea completa.
          const homeData = getStartersWithFormation(next, fixture.homeId);
          const awayData = getStartersWithFormation(next, fixture.awayId);
          const hXI = homeData.players;
          const aXI = awayData.players;

          result = simulateMatchFast(home, away, hXI, aXI, {
            homeBench: getBenchForTeam(next, fixture.homeId, hXI),
            awayBench: getBenchForTeam(next, fixture.awayId, aXI),
            homeTactics: loadTactics(fixture.homeId),
            awayTactics: loadTactics(fixture.awayId),
            homeFormation: homeData.formation,
            awayFormation: awayData.formation,
          });

          hXI.forEach((p) => store.recordAppearance(p.id));
          aXI.forEach((p) => store.recordAppearance(p.id));

          recordFakeMatchStats(store, hXI, aXI, result, next.currentMatchday[league]);
        }

        // Apply result

        const idx = next.fixtures[league].findIndex((x) => x.id === fixture.id);

        if (idx >= 0) {
          next.fixtures[league][idx] = { ...fixture, result };

          next.standings[league] = applyResult(next.standings[league], next.fixtures[league][idx]);
        } else {
          console.warn(`Fixture not found in array: ${fixture.id} in league ${league}`);
        }

        processed++;
      }

      // Advance matchday counters

      const leaguesInBatch = new Set(batch.map((b) => b.league));

      for (const lg of leaguesInBatch) {
        next.currentMatchday[lg]++;
      }

      // Update progress

      onProgress?.(processed, totalMatches);

      // Yield control every few batches to prevent UI blocking

      if (i % (BATCH_SIZE * 2) === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    console.log(
      `advanceMatchdayLayered: Completed. Processed ${processed}/${totalMatches} matches`,
    );

    // Sync currentMatchday for the cup league to match user's league

    const userCountry = LEAGUES[next.myLeague]?.country;

    if (userCountry) {
      const cupLeague = getPrimaryLeagueForCountry(userCountry) as LeagueId;

      if (cupLeague && cupLeague !== next.myLeague) {
        next.currentMatchday[cupLeague] = next.currentMatchday[next.myLeague];
      }
    }

    // Reset CPU team formations so each matchday they pick a new random formation

    for (const teamId in next.formations) {
      if (teamId !== next.myTeamId) {
        delete next.formations[teamId];
      }
    }

    // Decrease suspension counters after advancing matchday

    next = decreaseSuspensions(next);

    // Process cup draws without simulating matches

    // Only process cup draws for VIP leagues

    const vipCupLeagues = (Object.keys(next.cupFixtures) as LeagueId[]).filter((lg) =>
      isVIPLeague(lg, userLeague),
    );

    for (const cupLg of vipCupLeagues) {
      processCupDrawsOnly(next, cupLg);
    }

    return next;
  });
}

/**







 * Legacy function - kept for compatibility.







 * Use advanceMatchdayLayered for better performance.







 */

export async function finishMatchday(
  save: SaveGame,
  onProgress?: (leaguesDone: number, total: number) => void,
): Promise<SaveGame> {
  return advanceMatchdayLayered(save, onProgress);
}

/**







 * Process cup draws without simulating matches







 * This is called when advancing league matchdays to trigger draw notifications







 */

function processCupDrawsOnly(save: SaveGame, lg: LeagueId) {
  const list = save.cupFixtures[lg];

  if (!list) return; // No cup for this league

  const leagueMd = save.currentMatchday[lg];

  // Get the dynamic cup structure for this league's country

  const country = LEAGUES[lg]?.country;

  if (!country) return;

  // Check if user is in the same country (not necessarily same league)

  const userCountry = LEAGUES[save.myLeague]?.country;

  const isUserCountry = country === userCountry;

  const structure =
    (save.cupFixtures as any)[`${lg}_structure`] || getCupStructureForCountry(country);

  const cupSchedule = structure.schedule;

  // Special case: if no fixtures exist yet, do nothing - calendar.tsx handles draw notifications based on game date

  // Get unique rounds that exist in this cup and sort them in order

  const roundOrder = cupSchedule.map((s) => s.round);

  const existingRounds = [...new Set(list.map((f) => f.round).filter((r): r is string => !!r))];

  const sortedRounds = existingRounds.sort((a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b));

  // Build dynamic schedule based on existing rounds

  const dynamicSchedule = sortedRounds
    .map((round) => {
      const schedule = cupSchedule.find((s) => s.round === round);

      if (!schedule) return null;

      return { matchday: schedule.matchday, round, size: 0, drawMatchday: schedule.drawMatchday };
    })
    .filter(Boolean) as Array<{
    matchday: number;
    round: string;
    size: number;
    drawMatchday: number;
  }>;

  for (let roundIdx = 0; roundIdx < dynamicSchedule.length; roundIdx++) {
    const step = dynamicSchedule[roundIdx];

    const roundFixtures = list.filter((f) => f.round === step.round);

    if (roundFixtures.length === 0) continue;

    // Check if we've reached the draw matchday for the NEXT round (if current round is complete)

    const playedAll = roundFixtures.every((f) => f.result);

    const nextStep = cupSchedule[roundIdx + 1];

    if (playedAll && nextStep && isUserCountry) {
      // If current round is complete and we've reached the draw matchday for next round

      // Skip draw for Final - auto-assign the final matchup

      if (nextStep.round === "Final" && leagueMd >= nextStep.drawMatchday) {
        const winners = roundFixtures.map((f) => {
          if (!f.result) return f.homeId;

          return getCupMatchWinner(f.result) === "home" ? f.homeId : f.awayId;
        });

        // Auto-create final fixture without draw

        if (winners.length === 2) {
          const nextStepWithDraw = {
            matchday: nextStep.matchday,
            round: nextStep.round,
            drawMatchday: nextStep.drawMatchday,
          };

          const built = buildNextRound(
            "cup",
            lg,
            step.round,
            winners,
            nextStepWithDraw,
            roundIdx + 1,
          );

          list.push(...built);
        }
      }
    }
  }
}

function advanceCupForLeague(save: SaveGame, lg: LeagueId) {
  const next: SaveGame = save;

  const list = next.cupFixtures[lg];

  if (!list) return; // No cup for this league

  const leagueMd = next.currentMatchday[lg];

  // Get the dynamic cup structure for this league's country

  const country = LEAGUES[lg]?.country;

  if (!country) return;

  // Check if user is in the same country (not necessarily same league)

  const userCountry = LEAGUES[next.myLeague]?.country;

  const isUserCountry = country === userCountry;

  const structure =
    (save.cupFixtures as any)[`${lg}_structure`] || getCupStructureForCountry(country);

  const cupSchedule = structure.schedule;

  // Special case: if no fixtures exist yet, do nothing - calendar.tsx handles draw notifications based on game date

  // Get unique rounds that exist in this cup and sort them in order

  const roundOrder = cupSchedule.map((s) => s.round);

  const existingRounds = [...new Set(list.map((f) => f.round).filter((r): r is string => !!r))];

  const sortedRounds = existingRounds.sort((a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b));

  // Build dynamic schedule based on existing rounds

  const dynamicSchedule = sortedRounds
    .map((round, idx) => {
      const schedule = cupSchedule.find((s) => s.round === round);

      if (!schedule) return null;

      return { matchday: schedule.matchday, round, size: 0, drawMatchday: schedule.drawMatchday };
    })
    .filter(Boolean) as Array<{
    matchday: number;
    round: string;
    size: number;
    drawMatchday: number;
  }>;

  for (let roundIdx = 0; roundIdx < dynamicSchedule.length; roundIdx++) {
    const step = dynamicSchedule[roundIdx];

    const roundFixtures = list.filter((f) => f.round === step.round);

    if (roundFixtures.length === 0) continue;

    // Check if we've reached the draw matchday for the NEXT round (if current round is complete)

    const playedAll = roundFixtures.every((f) => f.result);

    const nextStep = cupSchedule[roundIdx + 1];

    if (playedAll && nextStep && isUserCountry) {
      // If current round is complete and we've reached the draw matchday for next round

      // Skip draw for Final - auto-assign the final matchup

      if (nextStep.round === "Final" && leagueMd >= nextStep.drawMatchday) {
        const winners = roundFixtures.map((f) => {
          if (!f.result) return f.homeId;

          return getCupMatchWinner(f.result) === "home" ? f.homeId : f.awayId;
        });

        // Auto-create final fixture without draw

        if (winners.length === 2) {
          const nextStepWithDraw = {
            matchday: nextStep.matchday,
            round: nextStep.round,
            drawMatchday: nextStep.drawMatchday,
          };

          const built = buildNextRound(
            "cup",
            lg,
            step.round,
            winners,
            nextStepWithDraw,
            roundIdx + 1,
          );

          list.push(...built);
        }
      }
    }

    if (!playedAll && leagueMd > step.matchday) {
      // sim unplayed

      for (const f of roundFixtures) {
        if (f.result) continue;

        const sim = simulateFixtureInline(save, f, false, true);

        const idx = list.findIndex((x) => x.id === f.id);

        if (idx >= 0) list[idx] = sim;

        save = applyMatchToStats(save, sim);
      }
    }

    const playedAllAfterSim = roundFixtures.every((f) => f.result);

    if (playedAllAfterSim) {
      if (!nextStep) {
        // final winner

        const final = list.find((f) => f.round === "Final");

        if (final?.result && !save.cupChampion[lg]) {
          const champ = getCupMatchWinner(final.result) === "home" ? final.homeId : final.awayId;

          save.cupChampion[lg] = champ;
        }

        continue;
      }

      const alreadyBuilt = list.some((f) => f.round === nextStep.round);

      if (!alreadyBuilt && !isUserCountry) {
        // For non-user leagues, auto-build next round

        const winners = roundFixtures.map((f) => {
          if (!f.result) return f.homeId;

          return getCupMatchWinner(f.result) === "home" ? f.homeId : f.awayId;
        });

        const nextStepWithDraw = {
          matchday: nextStep.matchday,
          round: nextStep.round,
          drawMatchday: nextStep.drawMatchday,
        };

        const built = buildNextRound(
          "cup",
          lg,
          step.round,
          winners,
          nextStepWithDraw,
          roundIdx + 1,
        );

        list.push(...built);
      }

      // For user's league, we wait for the draw modal to build the next round
    }
  }
}

function advanceUCL(save: SaveGame) {
  const list = save.uclFixtures;

  // UCL "match calendar" tied to user's league matchday (simpler)

  const leagueMd = save.currentMatchday[save.myLeague];

  for (let roundIdx = 0; roundIdx < UCL_SCHEDULE.length; roundIdx++) {
    const step = UCL_SCHEDULE[roundIdx];

    const roundFixtures = list.filter((f) => f.round === step.round);

    if (roundFixtures.length === 0) continue;

    if (leagueMd > step.matchday) {
      for (const f of roundFixtures) {
        if (f.result) continue;

        const sim = simulateFixtureInline(save, f);

        const idx = list.findIndex((x) => x.id === f.id);

        list[idx] = sim;

        applyMatchToStats(save, sim);
      }
    }

    const playedAll = list.filter((f) => f.round === step.round).every((f) => f.result);

    if (playedAll) {
      const next = UCL_SCHEDULE[roundIdx + 1];

      if (!next) {
        const final = list.find((f) => f.round === "Final");

        if (final?.result && !save.uclChampion) {
          save.uclChampion =
            getCupMatchWinner(final.result) === "home" ? final.homeId : final.awayId;
        }

        continue;
      }

      const alreadyBuilt = list.some((f) => f.round === next.round);

      if (!alreadyBuilt) {
        const winners = list

          .filter((f) => f.round === step.round)

          .map((f) => (getCupMatchWinner(f.result!) === "home" ? f.homeId : f.awayId));

        const built = buildNextRound("ucl", null, step.round, winners, next, roundIdx + 1);

        list.push(...built);
      }
    }
  }
}

/* ============================================================







 *  SELECTORS







 * ============================================================ */

export function getSortedStandings(save: SaveGame, league: LeagueId): Standing[] {
  return sortStandings(save.standings[league]);
}

export function getMyRecentResults(save: SaveGame, limit = 5): Fixture[] {
  return save.fixtures[save.myLeague]

    .filter((f) => f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId))

    .slice(-limit)

    .reverse();
}

export function getTeamRecentResults(
  save: SaveGame,
  teamId: string,
  leagueId: string,
  limit = 5,
): Fixture[] {
  return save.fixtures[leagueId]

    .filter((f) => f.result && (f.homeId === teamId || f.awayId === teamId))

    .slice(-limit)

    .reverse();
}

export function getMatchdayFixtures(save: SaveGame, league: LeagueId, matchday: number): Fixture[] {
  return save.fixtures[league].filter((f) => f.matchday === matchday);
}

export function topScorers(_save: SaveGame, limit = 30, leagueFilter?: LeagueId): Player[] {
  return selectTopScorers(leagueFilter, limit);
}

export function topAssisters(_save: SaveGame, limit = 30, leagueFilter?: LeagueId): Player[] {
  return selectTopAssisters(leagueFilter, limit);
}

export function currentInjuries(save: SaveGame, teamId?: string): Player[] {
  return selectInjuredPlayers(save.currentMatchday, teamId);
}

export function isPlayerInjured(save: SaveGame, playerId: string): boolean {
  const p = usePlayersStore.getState().getSimPlayer(playerId);

  if (!p) return false;

  const lg = teamById(p.teamId).league;

  return p.injuredUntil > save.currentMatchday[lg];
}

export function setLineup(save: SaveGame, teamId: string, xi: string[]): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));

  next.lineups[teamId] = xi;

  return next;
}

export function setFormation(save: SaveGame, teamId: string, formation: string): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));

  next.formations[teamId] = formation;

  return next;
}

/**







 * Check if a date has any fixtures within 2 days (before or after)







 */

function hasFixtureConflict(save: SaveGame, date: Date): boolean {
  const dateIso = date.toISOString().split("T")[0];

  const dateObj = new Date(dateIso);

  // Check 2 days before and after

  for (let i = -2; i <= 2; i++) {
    const checkDate = new Date(dateObj.getTime() + i * 86400000);

    const checkDateIso = checkDate.toISOString().split("T")[0];

    // Check league fixtures

    for (const lg of Object.keys(save.fixtures)) {
      const hasFixture = save.fixtures[lg as LeagueId]?.some((f) => {
        const fixtureDate = new Date(seasonStartForLeague(lg, f.matchday));

        return fixtureDate.toISOString().split("T")[0] === checkDateIso;
      });

      if (hasFixture) return true;
    }

    // Check cup fixtures

    for (const lg of Object.keys(save.cupFixtures)) {
      const hasFixture = save.cupFixtures[lg as LeagueId]?.some((f) => {
        const fixtureDate = new Date(seasonStartForLeague(lg, f.matchday));

        return fixtureDate.toISOString().split("T")[0] === checkDateIso;
      });

      if (hasFixture) return true;
    }

    // Check UCL fixtures

    const hasUclFixture = save.uclFixtures?.some((f) => {
      const fixtureDate = new Date(seasonStartForLeague(save.myLeague, f.matchday));

      return fixtureDate.toISOString().split("T")[0] === checkDateIso;
    });

    if (hasUclFixture) return true;
  }

  return false;
}

function seasonStartForLeague(league: LeagueId, matchday: number): Date {
  const seasonStart = new Date("2025-08-16T12:00:00Z");

  return new Date(seasonStart.getTime() + (matchday - 1) * 7 * 86400000);
}

/**







 * Apply cup draw results - creates fixtures for the next cup round







 * Schedules cup matches intelligently to avoid conflicts with other fixtures







 */

/**







 * Get the current cup round for a league







 */

export function getCurrentCupRound(save: SaveGame, league: LeagueId): string | null {
  const list = save.cupFixtures[league];

  if (!list || list.length === 0) return null;

  const roundOrder = ["R32", "R16", "QF", "SF", "Final"];

  const existingRounds = [...new Set(list.map((f) => f.round).filter((r): r is string => !!r))];

  const sortedRounds = existingRounds.sort((a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b));

  // Find the first round with unplayed fixtures

  for (const round of sortedRounds) {
    const roundFixtures = list.filter((f) => f.round === round);

    if (roundFixtures.some((f) => !f.result)) {
      return round;
    }
  }

  return sortedRounds[sortedRounds.length - 1] || null;
}

/**







 * Automatically draw cup fixtures for foreign countries (VIP leagues)







 * This is called before opening the user's cup draw modal to ensure all AI leagues have their matchups







 */

export function autoDrawForeignCups(save: SaveGame, currentDate?: string): SaveGame {
  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const userLeague = next.myLeague;

  const userCountry = LEAGUES[userLeague]?.country;

  // Cup starts July 7, 2025. cupDayOffset = days since July 7th.

  const CUP_START = new Date("2025-07-07T00:00:00Z");

  const todayDate = currentDate ? new Date(currentDate + "T00:00:00Z") : new Date();

  const cupDayOffset = Math.floor((todayDate.getTime() - CUP_START.getTime()) / 86400000);

  // Get all VIP leagues (Big 5 + Belgium + Netherlands + Portugal + Turkey)

  const vipLeagues = [...BIG5_LEAGUES, ...IMPORTANT_LEAGUES] as LeagueId[];

  // Filter out leagues from the user's country (we handle that interactively)

  const foreignVipLeagues = vipLeagues.filter((lg) => {
    const country = LEAGUES[lg]?.country;

    return country && country !== userCountry;
  });

  for (const lg of foreignVipLeagues) {
    const country = LEAGUES[lg]?.country;

    if (!country) continue;

    // Skip if this is the user's country

    if (country === userCountry) continue;

    // Find the primary league for this country (the league that holds the cup)

    const primaryLeague = getPrimaryLeagueForCountry(country) as LeagueId;

    if (!primaryLeague) continue;

    let list = next.cupFixtures[primaryLeague];

    if (!list) continue;

    // Always recalculate fresh cup data to avoid stale saves

    const freshCupData = initCup(country);

    const freshSchedule = getCupStructureForCountry(country).schedule;

    // Detect and reset stale cup data with wrong number of fixtures (from old buggy saves)

    if (list.length > 0) {
      const expectedPrelimMatches = Math.floor(freshCupData.preliminaryParticipants.length / 2);

      const prelimFixtures = list.filter((f) => f.round === "Preliminar");

      // If Preliminar exists but has significantly fewer matches than expected, reset

      if (
        prelimFixtures.length > 0 &&
        expectedPrelimMatches > 1 &&
        prelimFixtures.length < expectedPrelimMatches * 0.8
      ) {
        next.cupFixtures[primaryLeague] = [];

        delete (next.cupFixtures as any)[`${primaryLeague}_structure`];

        list = next.cupFixtures[primaryLeague];
      } else {
        // Also check first main round

        const firstMainStep = freshSchedule.find((s) => s.round !== "Preliminar");

        if (firstMainStep) {
          const mainFixtures = list.filter((f) => f.round === firstMainStep.round);

          const expectedMainMatches = Math.floor(
            (freshCupData.participants.length +
              Math.floor(freshCupData.preliminaryParticipants.length / 2)) /
              2,
          );

          if (
            mainFixtures.length > 0 &&
            expectedMainMatches > 1 &&
            mainFixtures.length < expectedMainMatches * 0.8
          ) {
            next.cupFixtures[primaryLeague] = [];

            delete (next.cupFixtures as any)[`${primaryLeague}_structure`];

            list = next.cupFixtures[primaryLeague];
          }
        }
      }
    }

    // Use fresh schedule (not the potentially stale saved structure)

    const cupSchedule = freshSchedule;

    // Special case: if no fixtures exist yet, trigger first round draw

    if (list.length === 0) {
      const firstRound = cupSchedule[0];

      if (firstRound && cupDayOffset >= firstRound.drawMatchday) {
        // Reuse already-computed fresh cup data

        const cupData = freshCupData;

        // Auto-simulate preliminary round if it exists

        if (firstRound.round === "Preliminar") {
          // Use only preliminary participants for the preliminary round

          const preliminaryTeams = cupData.preliminaryParticipants || [];

          // Create preliminary fixtures and simulate them

          const preliminaryFixtures: Fixture[] = [];

          for (let i = 0; i < preliminaryTeams.length; i += 2) {
            if (i + 1 < preliminaryTeams.length) {
              preliminaryFixtures.push({
                id: `cup-${primaryLeague}-prelim-${i}`,

                competition: "cup",

                league: primaryLeague,

                matchday: firstRound.matchday,

                round: firstRound.round,

                homeId: preliminaryTeams[i],

                awayId: preliminaryTeams[i + 1],
              });
            }
          }

          // Simulate all preliminary fixtures

          const simulatedPrelimFixtures: Fixture[] = [];

          for (const f of preliminaryFixtures) {
            const simmed = simulateFixtureInline(next, f, false, true);

            simulatedPrelimFixtures.push(simmed);

            next = applyMatchToStats(next, simmed);
          }

          // Re-sync list after applyMatchToStats reassigned next

          list = next.cupFixtures[primaryLeague]!;

          for (const simmed of simulatedPrelimFixtures) {
            const idx = list.findIndex((x) => x.id === simmed.id);

            if (idx >= 0) {
              list[idx] = simmed;
            } else {
              list.push(simmed);
            }
          }

          // Get winners for next round from the simulated fixtures in list

          const winners = preliminaryFixtures.map((f) => {
            const simmed = list.find((x) => x.id === f.id);

            if (!simmed || !simmed.result) return f.homeId;

            return getCupMatchWinner(simmed.result) === "home" ? simmed.homeId : simmed.awayId;
          });

          // Auto-create next round fixtures

          const nextStep = cupSchedule[1];

          if (nextStep) {
            // Combine winners with main bracket participants

            const mainBracketTeams = cupData.participants.filter(
              (id) => !preliminaryTeams.includes(id),
            );

            const drawTeams = [...winners, ...mainBracketTeams];

            const nextStepWithDraw = {
              matchday: nextStep.matchday,
              round: nextStep.round,
              drawMatchday: nextStep.drawMatchday,
            };

            const built = buildNextRound(
              "cup",
              primaryLeague,
              firstRound.round,
              drawTeams,
              nextStepWithDraw,
              1,
            );

            list.push(...built);
          }
        } else {
          // No preliminary round, create first round fixtures directly

          const cupTeams = cupData.participants;

          const nextStepWithDraw = {
            matchday: firstRound.matchday,
            round: firstRound.round,
            drawMatchday: firstRound.drawMatchday,
          };

          const built = buildNextRound("cup", primaryLeague, "", cupTeams, nextStepWithDraw, 0);

          list.push(...built);
        }
      }
    }

    // Auto-simulate remaining rounds for foreign countries

    // Re-sync list in case the Special case above created new fixtures (applyMatchToStats reassigns next)

    list = next.cupFixtures[primaryLeague]!;

    const roundOrder = cupSchedule.map((s) => s.round);

    const existingRounds = [...new Set(list.map((f) => f.round).filter((r): r is string => !!r))];

    const sortedRounds = existingRounds.sort(
      (a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b),
    );

    const dynamicSchedule = sortedRounds
      .map((round) => {
        const schedule = cupSchedule.find((s) => s.round === round);

        if (!schedule) return null;

        return { matchday: schedule.matchday, round, size: 0, drawMatchday: schedule.drawMatchday };
      })
      .filter(Boolean) as Array<{
      matchday: number;
      round: string;
      size: number;
      drawMatchday: number;
    }>;

    for (let roundIdx = 0; roundIdx < dynamicSchedule.length; roundIdx++) {
      // Re-sync list in case applyMatchToStats reassigned next in a previous iteration

      list = next.cupFixtures[primaryLeague]!;

      const step = dynamicSchedule[roundIdx];

      const roundFixtures = list.filter((f) => f.round === step.round);

      if (roundFixtures.length === 0) continue;

      // Check if current round is complete

      const playedAll = roundFixtures.every((f) => f.result);

      // Find index of this round in the full cupSchedule (not dynamicSchedule)

      const fullRoundIdx = cupSchedule.findIndex((s) => s.round === step.round);

      const nextStepFull = fullRoundIdx >= 0 ? cupSchedule[fullRoundIdx + 1] : undefined;

      // Check next round doesn't already have fixtures

      const nextRoundAlreadyExists = nextStepFull
        ? list.some((f) => f.round === nextStepFull.round)
        : false;

      if (
        playedAll &&
        nextStepFull &&
        !nextRoundAlreadyExists &&
        cupDayOffset >= nextStepFull.drawMatchday
      ) {
        // Collect winners from this round

        const roundWinners = roundFixtures.map((f) => {
          if (!f.result) return f.homeId;

          return getCupMatchWinner(f.result) === "home" ? f.homeId : f.awayId;
        });

        let drawTeams = roundWinners;

        // If current round is Preliminar, combine winners with bye teams for the main bracket

        if (step.round === "Preliminar") {
          const cupData = initCup(country);

          const prelimTeamIds = cupData.preliminaryParticipants || [];

          const mainBracketTeams = cupData.participants.filter((id) => !prelimTeamIds.includes(id));

          drawTeams = [...roundWinners, ...mainBracketTeams];
        }

        // Auto-create next round fixtures

        const nextStepWithDraw = {
          matchday: nextStepFull.matchday,
          round: nextStepFull.round,
          drawMatchday: nextStepFull.drawMatchday,
        };

        const built = buildNextRound(
          "cup",
          primaryLeague,
          step.round,
          drawTeams,
          nextStepWithDraw,
          fullRoundIdx + 1,
        );

        list.push(...built);
      }

      // Simulate unplayed fixtures in current round

      if (!playedAll && cupDayOffset >= step.matchday) {
        for (const f of roundFixtures) {
          if (!f.result) {
            const simmed = simulateFixtureInline(next, f, false, true);

            next = applyMatchToStats(next, simmed);

            // Re-sync list after applyMatchToStats reassigns next

            list = next.cupFixtures[primaryLeague]!;

            const idx = list.findIndex((x) => x.id === f.id);

            if (idx >= 0) {
              list[idx] = simmed;
            } else {
              list.push(simmed);
            }
          }
        }
      }
    }
  }

  return next;
}

export function applyCupDraw(
  save: SaveGame,
  league: LeagueId,
  round: string,
  matchups: [string, string][],
): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));

  const list = next.cupFixtures[league];

  console.log(
    `applyCupDraw called for league: ${league}, round: ${round}, matchups: ${matchups.length}`,
  );

  console.log(`cupFixtures keys: ${Object.keys(next.cupFixtures)}`);

  console.log(`list exists: ${!!list}, list length: ${list?.length || 0}`);

  if (!list) {
    console.error(`Cup fixtures list not found for league: ${league}`);

    return next;
  }

  // Get the dynamic cup structure for this league's country

  const country = LEAGUES[league]?.country;

  if (!country) {
    console.error(`Country not found for league: ${league}`);

    return next;
  }

  const structure =
    (next.cupFixtures as any)[`${league}_structure`] || getCupStructureForCountry(country);

  const cupSchedule = structure.schedule;

  // Find the matchday for this round from the dynamic schedule

  const roundSchedule = cupSchedule.find((s) => s.round === round);

  if (!roundSchedule) {
    console.error(`Round ${round} not found in cup schedule`);

    return next;
  }

  // matchday in schedule = day offset from July 7th (draw=0, match=1, draw=2, match=3...)

  const matchDayOffset = roundSchedule.matchday;

  console.log(
    `Creating ${matchups.length} fixtures for day offset ${matchDayOffset} from July 7th (round: ${round})`,
  );

  // Create fixtures from matchups

  for (let i = 0; i < matchups.length; i++) {
    const [home, away] = matchups[i];

    const fixture = {
      id: `cup-${league}-${round}-${i}`,

      competition: "cup" as const,

      league,

      matchday: matchDayOffset, // day offset from July 7th

      round,

      homeId: home,

      awayId: away,
    };

    list.push(fixture);

    console.log(`Created fixture: ${fixture.id} - ${home} vs ${away}`);
  }

  console.log(`Total fixtures in list after draw: ${list.length}`);

  // Clear cup draw pending

  next.cupDrawPending = null;

  return next;
}

// ============================================================

//  UCL DRAW FUNCTIONS

// ============================================================

export function applyUCLLeagueDraw(
  save: SaveGame,
  preCalculatedDraw?: {
    assignments: Map<string, Opponent[]>;
    matrix: boolean[][];
    teamIndex: Map<string, number>;
  },
): SaveGame {
  const next: SaveGame = {
    ...save,
    ucl: save.ucl ? { ...save.ucl, drawState: { ...save.ucl.drawState } } : null,
  };

  if (!next.ucl) return next;

  const participants = next.ucl.participants;

  // Robust retry: regenerate the swiss draw entirely if scheduling 8x18 fails.
  let fixtures: Fixture[] | null = null;
  const MAX_REGEN = 20;
  for (let attempt = 0; attempt < MAX_REGEN && !fixtures; attempt++) {
    try {
      const draw =
        attempt === 0 && preCalculatedDraw ? preCalculatedDraw : runSwissDraw(participants);
      const f = assignmentsToFixtures(draw.assignments, participants, UCL_CALENDAR.leagueDay[0]);
      // Verify every team has exactly 8 fixtures across the 8 matchdays
      const counts = new Map<string, number>();
      for (const fx of f) {
        counts.set(fx.homeId, (counts.get(fx.homeId) || 0) + 1);
        counts.set(fx.awayId, (counts.get(fx.awayId) || 0) + 1);
      }
      const allEight = participants.every((t) => counts.get(t) === 8);
      if (f.length === 144 && allEight) {
        fixtures = f;
      } else {
        console.warn(`[applyUCLLeagueDraw] Attempt ${attempt + 1}: invalid distribution, retrying`);
      }
    } catch (err) {
      console.warn(`[applyUCLLeagueDraw] Attempt ${attempt + 1} threw:`, err);
    }
  }
  if (!fixtures) {
    throw new Error(
      "UCL league draw failed after retries — could not produce 8 matches for every team",
    );
  }

  next.uclFixtures = [
    ...(next.uclFixtures ?? []).filter((f) => !f.round?.startsWith("Jornada")),
    ...fixtures,
  ];

  next.ucl.drawState.leagueDone = true;

  next.ucl.phase = "league";

  return next;
}

export function applyUCLLeagueResult(save: SaveGame, fixtureId: string): SaveGame {
  const next: SaveGame = {
    ...save,
    ucl: save.ucl ? { ...save.ucl, table: [...save.ucl.table] } : null,
  };

  if (!next.ucl) return next;

  const f = next.uclFixtures.find((x) => x.id === fixtureId);

  if (!f?.result) return next;

  if (isUCLLeaguePhaseFixture(f.round)) {
    next.ucl.table = applyUCLTableResult(
      next.ucl.table,
      f.homeId,
      f.awayId,
      f.result.homeGoals,
      f.result.awayGoals,
    );
  }

  return next;
}

export function applyUCLPlayoffDraw(save: SaveGame): SaveGame {
  const next: SaveGame = {
    ...save,
    ucl: save.ucl ? { ...save.ucl, drawState: { ...save.ucl.drawState } } : null,
  };

  if (!next.ucl) return next;

  const sorted = sortUCLTable(next.ucl.table).map((e) => e.teamId);

  // Freeze league-phase standings for the table UI
  next.ucl.leaguePhaseTable = sortUCLTable([...next.ucl.table]);

  const full = buildFullUCLBracket(sorted, {
    playoffLeg1: UCL_CALENDAR.playoffLeg1,
    playoffLeg2: UCL_CALENDAR.playoffLeg2,
    r16Leg1: UCL_CALENDAR.r16Leg1,
    r16Leg2: UCL_CALENDAR.r16Leg2,
    qfLeg1: UCL_CALENDAR.qfLeg1,
    qfLeg2: UCL_CALENDAR.qfLeg2,
    sfLeg1: UCL_CALENDAR.sfLeg1,
    sfLeg2: UCL_CALENDAR.sfLeg2,
    final: UCL_CALENDAR.final,
  });

  const leagueFixtures = (next.uclFixtures ?? []).filter((f) => f.round?.startsWith("Jornada"));

  next.uclFixtures = [
    ...leagueFixtures,
    ...full.playoffFixtures,
    ...full.r16Fixtures,
    ...full.qfFixtures,
    ...full.sfFixtures,
    ...full.finalFixture,
  ];

  next.ucl.bracket = full.bracket;
  next.ucl.drawState.playoffDone = true;
  next.ucl.drawState.knockoutDone = true;
  next.ucl.phase = "playoff";

  return next;
}

/** Legacy no-op: full bracket is created at play-off draw. */
export function applyUCLKnockoutDraw(save: SaveGame): SaveGame {
  const next: SaveGame = {
    ...save,
    ucl: save.ucl ? { ...save.ucl, drawState: { ...save.ucl.drawState } } : null,
  };

  if (!next.ucl) return next;

  if (!next.ucl.drawState.knockoutDone) {
    next.ucl.drawState.knockoutDone = true;
  }

  return next;
}

// Simulate a UCL league matchday with proper simulation and table updates

export function simulateUCLLeagueMatchday(save: SaveGame, matchday: number): SaveGame {
  let next: SaveGame = JSON.parse(JSON.stringify(save));

  if (!next.uclFixtures || !next.ucl) return next;

  const toSimulate = next.uclFixtures.filter(
    (f) =>
      f.matchday === matchday && !f.result && !f.round?.includes("-Leg") && f.round !== "Final",
  );

  for (const f of toSimulate) {
    const simmed = simulateFixtureInline(next, f, false, false);

    const idx = next.uclFixtures.findIndex((x) => x.id === f.id);

    if (idx >= 0) {
      next.uclFixtures[idx] = simmed;

      next = applyMatchToStats(next, simmed);
      next = applyUCLMatchAftermath(next, simmed.homeId, simmed.awayId);

      // Update UCL table (league phase only)

      if (simmed.result && isUCLLeaguePhaseFixture(simmed.round)) {
        next.ucl.table = applyUCLTableResult(
          next.ucl.table,
          simmed.homeId,
          simmed.awayId,
          simmed.result.homeGoals,
          simmed.result.awayGoals,
        );
      }
    }
  }

  return next;
}

// Simulate a UCL knockout matchday with proper two-leg logic

export function simulateUCLKnockoutMatchday(save: SaveGame, matchday: number): SaveGame {
  let next: SaveGame = JSON.parse(JSON.stringify(save));

  if (!next.uclFixtures) return next;

  const toSimulate = next.uclFixtures.filter((f) => f.matchday === matchday && !f.result);

  console.log(
    `[simulateUCLKnockoutMatchday] matchday: ${matchday}, fixtures to simulate: ${toSimulate.length}`,
  );

  for (const f of toSimulate) {
    if (!isRealTeamId(f.homeId) || !isRealTeamId(f.awayId)) continue;

    const isUserMatch = f.homeId === next.myTeamId || f.awayId === next.myTeamId;
    const isLeg2 = f.round?.endsWith("-Leg2");
    const isLeg1 = f.round?.endsWith("-Leg1");

    const isFinal = f.round === "Final";

    const isKnockout =
      isFinal ||
      isLeg2 ||
      isLeg1 ||
      f.round?.includes("Playoff") ||
      f.round?.includes("R16") ||
      f.round?.includes("QF") ||
      f.round?.includes("SF");

    let simmed: Fixture;

    if (isFinal) {
      // Single leg — ET+penalties if draw
      simmed = simulateFixtureInline(next, f, false, true);
    } else {
      // Leg1 / Leg2 / any knockout leg — plain 90' simulation
      simmed = simulateFixtureInline(next, f, false, false);
    }

    // Resolve aggregate ties on Leg2: simulate ET and (if still level) penalties.
    if (isLeg2 && simmed.result) {
      const leg1 = next.uclFixtures!.find(
        (l) =>
          l.round === f.round!.replace("Leg2", "Leg1") &&
          ((l.homeId === f.awayId && l.awayId === f.homeId) ||
            (l.homeId === f.homeId && l.awayId === f.awayId)),
      );
      if (leg1?.result) {
        const aggHome = simmed.result.homeGoals + leg1.result.awayGoals;
        const aggAway = simmed.result.awayGoals + leg1.result.homeGoals;
        if (aggHome === aggAway && !simmed.result.extraTime) {
          const home = teamById(simmed.homeId);
          const away = teamById(simmed.awayId);
          const homeXI = getStarters(next, simmed.homeId);
          const awayXI = getStarters(next, simmed.awayId);
          const etResult = simulateExtraTime(home, away, homeXI, awayXI);
          simmed.result.extraTime = {
            homeGoals: etResult.homeGoals,
            awayGoals: etResult.awayGoals,
            events: etResult.events,
          };
          if (aggHome + etResult.homeGoals === aggAway + etResult.awayGoals) {
            const penResult = simulatePenaltyShootout(homeXI, awayXI);
            simmed.result.penalties = {
              homeGoals: penResult.homeGoals,
              awayGoals: penResult.awayGoals,
              shootout: penResult.shootout,
            };
          }
        }
      }
    }

    console.log(
      `[simulateUCLKnockoutMatchday] simulated ${f.id} (${f.round}): ${simmed.result?.homeGoals}-${simmed.result?.awayGoals}`,
    );

    const idx = next.uclFixtures.findIndex((x) => x.id === f.id);

    if (idx >= 0) {
      next.uclFixtures[idx] = simmed;

      next = applyMatchToStats(next, simmed);
      next = applyUCLMatchAftermath(next, simmed.homeId, simmed.awayId);
    }
  }

  return next;
}

/** Check if user team is participating in a specific UCL phase */
function isUserParticipatingInUCLPhase(
  save: SaveGame,
  userTeamId: string,
  fixtureRound: string,
): boolean {
  if (!save.ucl) return false;

  // League phase: check if user is in participants
  if (isUCLLeaguePhaseFixture(fixtureRound)) {
    return save.ucl.participants.includes(userTeamId);
  }

  // Playoff: check if user is in playoff bracket (positions 9-16 in league table)
  if (fixtureRound?.includes("Playoff")) {
    if (!save.ucl.table) return false;
    const sorted = sortUCLTable(save.ucl.table);
    const userIndex = sorted.findIndex((e) => e.teamId === userTeamId);
    return userIndex >= 8 && userIndex < 16; // Positions 9-16
  }

  // Knockout phases: check if user is in bracket for that round
  if (save.ucl.bracket) {
    const phase = fixtureRound?.includes("R16")
      ? "r16"
      : fixtureRound?.includes("QF")
        ? "qf"
        : fixtureRound?.includes("SF")
          ? "sf"
          : fixtureRound === "Final"
            ? "final"
            : null;

    if (phase) {
      return save.ucl.bracket.some(
        (slot) =>
          slot.round === phase && (slot.homeId === userTeamId || slot.awayId === userTeamId),
      );
    }
  }

  return false;
}

/** Simulate UCL fixtures on a calendar day that do not involve the user's team. */
export function simulateBackgroundUCLDay(
  save: SaveGame,
  dayOffset: number,
  userTeamId: string,
): SaveGame {
  const dayFixtures = (save.uclFixtures ?? []).filter((f) => f.matchday === dayOffset && !f.result);
  const aiFixtures = dayFixtures.filter(
    (f) =>
      f.homeId !== userTeamId &&
      f.awayId !== userTeamId &&
      isRealTeamId(f.homeId) &&
      isRealTeamId(f.awayId),
  );
  if (aiFixtures.length === 0) return save;

  // Skip simulation if user is participating in this phase
  const userParticipating = aiFixtures.some((f) =>
    isUserParticipatingInUCLPhase(save, userTeamId, f.round || ""),
  );
  if (userParticipating) {
    console.log(
      `[simulateBackgroundUCLDay] Skipping AI matches on day ${dayOffset} - user is participating in this phase`,
    );
    return save;
  }

  const isLeagueDay = UCL_CALENDAR.leagueDay.includes(dayOffset);
  if (isLeagueDay) {
    let onlyAi = JSON.parse(JSON.stringify(save)) as SaveGame;
    for (const f of aiFixtures) {
      const simmed = simulateFixtureInline(onlyAi, f, false, false);
      const idx = onlyAi.uclFixtures!.findIndex((x) => x.id === f.id);
      if (idx >= 0 && simmed.result) {
        onlyAi.uclFixtures![idx] = simmed;
        onlyAi = applyMatchToStats(onlyAi, simmed);
        onlyAi = applyUCLMatchAftermath(onlyAi, simmed.homeId, simmed.awayId);
        if (onlyAi.ucl && isUCLLeaguePhaseFixture(simmed.round)) {
          onlyAi.ucl.table = applyUCLTableResult(
            onlyAi.ucl.table,
            simmed.homeId,
            simmed.awayId,
            simmed.result.homeGoals,
            simmed.result.awayGoals,
          );
        }
      }
    }
    return onlyAi;
  }

  let next = JSON.parse(JSON.stringify(save)) as SaveGame;
  for (const f of aiFixtures) {
    const isUserMatch = f.homeId === next.myTeamId || f.awayId === next.myTeamId;
    const isLeg2 = f.round?.endsWith("-Leg2");
    const isFinal = f.round === "Final";
    const isKnockout =
      isFinal ||
      isLeg2 ||
      f.round?.includes("Playoff") ||
      f.round?.includes("R16") ||
      f.round?.includes("QF") ||
      f.round?.includes("SF");
    let simmed: Fixture;
    if (isFinal) {
      simmed = simulateFixtureInline(next, f, false, true);
    } else if (isLeg2) {
      simmed = simulateFixtureInline(next, f, false, false);
      if (simmed.result) {
        const leg1 = next.uclFixtures!.find(
          (l) =>
            l.round === f.round!.replace("Leg2", "Leg1") &&
            ((l.homeId === f.awayId && l.awayId === f.homeId) ||
              (l.homeId === f.homeId && l.awayId === f.awayId)),
        );
        if (leg1?.result) {
          const leg2HomeAgg = simmed.result.homeGoals + leg1.result.awayGoals;
          const leg2AwayAgg = simmed.result.awayGoals + leg1.result.homeGoals;
          if (leg2HomeAgg === leg2AwayAgg) {
            const home = teamById(simmed.homeId);
            const away = teamById(simmed.awayId);
            const homeXI = getStarters(next, simmed.homeId);
            const awayXI = getStarters(next, simmed.awayId);
            const etResult = simulateExtraTime(home, away, homeXI, awayXI);
            simmed.result.extraTime = {
              homeGoals: etResult.homeGoals,
              awayGoals: etResult.awayGoals,
              events: etResult.events,
            };
            const etHomeAgg = leg2HomeAgg + etResult.homeGoals;
            const etAwayAgg = leg2AwayAgg + etResult.awayGoals;
            if (etHomeAgg === etAwayAgg) {
              const penResult = simulatePenaltyShootout(homeXI, awayXI);
              simmed.result.penalties = {
                homeGoals: penResult.homeGoals,
                awayGoals: penResult.awayGoals,
                shootout: penResult.shootout,
              };
            }
          }
        }
      }
    } else {
      simmed = simulateFixtureInline(next, f, false, false);
    }
    const idx = next.uclFixtures!.findIndex((x) => x.id === f.id);
    if (idx >= 0) {
      next.uclFixtures![idx] = simmed;
      next = applyMatchToStats(next, simmed);
      next = applyUCLMatchAftermath(next, simmed.homeId, simmed.awayId);
    }
  }
  return next;
}

/** Simulate UCL AI fixtures on a calendar day where user is participating (called on "return to season"). */
export function simulateUserPhaseUCLDay(
  save: SaveGame,
  dayOffset: number,
  userTeamId: string,
): SaveGame {
  const dayFixtures = (save.uclFixtures ?? []).filter((f) => f.matchday === dayOffset && !f.result);
  const aiFixtures = dayFixtures.filter(
    (f) =>
      f.homeId !== userTeamId &&
      f.awayId !== userTeamId &&
      isRealTeamId(f.homeId) &&
      isRealTeamId(f.awayId),
  );
  if (aiFixtures.length === 0) return save;

  // Only simulate if user is participating in this phase
  const userParticipating = aiFixtures.some((f) =>
    isUserParticipatingInUCLPhase(save, userTeamId, f.round || ""),
  );
  if (!userParticipating) {
    console.log(`[simulateUserPhaseUCLDay] Skipping - user is not participating in this phase`);
    return save;
  }

  const isLeagueDay = UCL_CALENDAR.leagueDay.includes(dayOffset);
  if (isLeagueDay) {
    let next = JSON.parse(JSON.stringify(save)) as SaveGame;
    for (const f of aiFixtures) {
      const simmed = simulateFixtureInline(next, f, false, false);
      const idx = next.uclFixtures!.findIndex((x) => x.id === f.id);
      if (idx >= 0 && simmed.result) {
        next.uclFixtures![idx] = simmed;
        next = applyMatchToStats(next, simmed);
        next = applyUCLMatchAftermath(next, simmed.homeId, simmed.awayId);
        if (next.ucl && isUCLLeaguePhaseFixture(simmed.round)) {
          next.ucl.table = applyUCLTableResult(
            next.ucl.table,
            simmed.homeId,
            simmed.awayId,
            simmed.result.homeGoals,
            simmed.result.awayGoals,
          );
        }
      }
    }
    return next;
  }

  let next = JSON.parse(JSON.stringify(save)) as SaveGame;
  for (const f of aiFixtures) {
    const isUserMatch = f.homeId === next.myTeamId || f.awayId === next.myTeamId;
    const isLeg2 = f.round?.endsWith("-Leg2");
    const isFinal = f.round === "Final";
    const isKnockout =
      isFinal ||
      isLeg2 ||
      f.round?.includes("Playoff") ||
      f.round?.includes("R16") ||
      f.round?.includes("QF") ||
      f.round?.includes("SF");
    let simmed: Fixture;
    if (isFinal) {
      simmed = simulateFixtureInline(next, f, false, true);
    } else if (isLeg2) {
      simmed = simulateFixtureInline(next, f, false, false);
      if (simmed.result) {
        const leg1 = next.uclFixtures!.find(
          (l) =>
            l.round === f.round!.replace("Leg2", "Leg1") &&
            ((l.homeId === f.awayId && l.awayId === f.homeId) ||
              (l.homeId === f.homeId && l.awayId === f.awayId)),
        );
        if (leg1?.result) {
          const leg2HomeAgg = simmed.result.homeGoals + leg1.result.awayGoals;
          const leg2AwayAgg = simmed.result.awayGoals + leg1.result.homeGoals;
          if (leg2HomeAgg === leg2AwayAgg) {
            const home = teamById(simmed.homeId);
            const away = teamById(simmed.awayId);
            const homeXI = getStarters(next, simmed.homeId);
            const awayXI = getStarters(next, simmed.awayId);
            const etResult = simulateExtraTime(home, away, homeXI, awayXI);
            simmed.result.extraTime = {
              homeGoals: etResult.homeGoals,
              awayGoals: etResult.awayGoals,
              events: etResult.events,
            };
            const etHomeAgg = leg2HomeAgg + etResult.homeGoals;
            const etAwayAgg = leg2AwayAgg + etResult.awayGoals;
            if (etHomeAgg === etAwayAgg) {
              const penResult = simulatePenaltyShootout(homeXI, awayXI);
              simmed.result.penalties = {
                homeGoals: penResult.homeGoals,
                awayGoals: penResult.awayGoals,
                shootout: penResult.shootout,
              };
            }
          }
        }
      }
    } else {
      simmed = simulateFixtureInline(next, f, false, false);
    }

    console.log(
      `[simulateUserPhaseUCLDay] simulated ${f.id} (${f.round}): ${simmed.result?.homeGoals}-${simmed.result?.awayGoals}`,
    );

    const idx = next.uclFixtures.findIndex((x) => x.id === f.id);
    if (idx >= 0) {
      next.uclFixtures[idx] = simmed;
      next = applyMatchToStats(next, simmed);
      next = applyUCLMatchAftermath(next, simmed.homeId, simmed.awayId);
    }
  }

  return next;
}

function allPlayoffTiesComplete(fixtures: Fixture[]): boolean {
  for (let i = 0; i < 8; i++) {
    const leg1 = fixtures.find((f) => f.id === `ucl-playoff-${i}-leg1`);
    const leg2 = fixtures.find((f) => f.id === `ucl-playoff-${i}-leg2`);
    if (!leg1?.result || !leg2?.result) return false;
  }
  return true;
}

function allKnockoutLeg2Complete(fixtures: Fixture[], prefix: string, count: number): boolean {
  for (let i = 0; i < count; i++) {
    const leg2 = fixtures.find((f) => f.id === `ucl-${prefix}-${i}-leg2`);
    if (!leg2?.result) return false;
  }
  return true;
}

/** Simulate all unplayed UCL AI fixtures from league phase through the given calendar offset. */
export function simulatePendingUCLThroughDay(
  save: SaveGame,
  throughOffset: number,
  userTeamId: string,
): SaveGame {
  let next = save;
  for (const md of UCL_SIMULATION_DAYS) {
    if (md > throughOffset) break;
    next = simulateBackgroundUCLDay(next, md, userTeamId);
  }
  return processUCLKnockoutProgress(next, throughOffset);
}

/** Wire winners into the bracket and advance UCL phase after results exist. */
export function processUCLKnockoutProgress(save: SaveGame, throughOffset: number): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  if (!next.ucl || !next.uclFixtures) return save;

  const fixtures = next.uclFixtures;

  if (throughOffset >= UCL_CALENDAR.playoffLeg2 && allPlayoffTiesComplete(fixtures)) {
    next.ucl.bracket = updateBracketWithWinners(next.ucl.bracket, fixtures, "playoff");
    for (let i = 0; i < 8; i++) {
      const leg1 = fixtures.find((f) => f.id === `ucl-playoff-${i}-leg1`);
      const leg2 = fixtures.find((f) => f.id === `ucl-playoff-${i}-leg2`);
      if (!leg1?.result || !leg2?.result) continue;
      const winner = getAggregateWinner(leg1, leg2);
      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;
      if (winnerId) {
        next.uclFixtures = propagatePlayoffWinnerToR16Fixtures(next.uclFixtures, i, winnerId);
        grantUCLPrizeOnce(next, `advanceR16-${winnerId}`, winnerId, UCL_PRIZES.advanceR16);
      }
    }
    if (next.ucl.phase === "playoff") {
      next.ucl.phase = "r16";
    }
  }

  if (throughOffset >= UCL_CALENDAR.r16Leg2 && allKnockoutLeg2Complete(fixtures, "r16", 8)) {
    next.ucl.bracket = updateBracketWithWinners(next.ucl.bracket, fixtures, "r16");
    for (let i = 0; i < 8; i++) {
      const leg1 = fixtures.find((f) => f.id === `ucl-r16-${i}-leg1`);
      const leg2 = fixtures.find((f) => f.id === `ucl-r16-${i}-leg2`);
      if (!leg1?.result || !leg2?.result) continue;
      const winner = getAggregateWinner(leg1, leg2);
      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;
      const qfIndex = Math.floor(i / 2);
      const isFirst = i % 2 === 0;
      const qfLeg1 = next.uclFixtures.find((f) => f.id === `ucl-qf-${qfIndex}-leg1`);
      const qfLeg2 = next.uclFixtures.find((f) => f.id === `ucl-qf-${qfIndex}-leg2`);
      if (qfLeg1 && winnerId) {
        if (isFirst) qfLeg1.homeId = winnerId;
        else qfLeg1.awayId = winnerId;
      }
      if (qfLeg2 && winnerId) {
        if (isFirst) qfLeg2.awayId = winnerId;
        else qfLeg2.homeId = winnerId;
      }
      if (winnerId)
        grantUCLPrizeOnce(next, `advanceQF-${winnerId}`, winnerId, UCL_PRIZES.advanceQF);
    }
    if (["playoff", "r16"].includes(next.ucl.phase)) {
      next.ucl.phase = "qf";
    }
  }

  if (throughOffset >= UCL_CALENDAR.qfLeg2 && allKnockoutLeg2Complete(fixtures, "qf", 4)) {
    next.ucl.bracket = updateBracketWithWinners(next.ucl.bracket, fixtures, "qf");
    for (let i = 0; i < 4; i++) {
      const leg1 = fixtures.find((f) => f.id === `ucl-qf-${i}-leg1`);
      const leg2 = fixtures.find((f) => f.id === `ucl-qf-${i}-leg2`);
      if (!leg1?.result || !leg2?.result) continue;
      const winner = getAggregateWinner(leg1, leg2);
      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;
      const sfIndex = Math.floor(i / 2);
      const isFirst = i % 2 === 0;
      const sfLeg1 = next.uclFixtures.find((f) => f.id === `ucl-sf-${sfIndex}-leg1`);
      const sfLeg2 = next.uclFixtures.find((f) => f.id === `ucl-sf-${sfIndex}-leg2`);
      if (sfLeg1 && winnerId) {
        if (isFirst) sfLeg1.homeId = winnerId;
        else sfLeg1.awayId = winnerId;
      }
      if (sfLeg2 && winnerId) {
        if (isFirst) sfLeg2.awayId = winnerId;
        else sfLeg2.homeId = winnerId;
      }
      if (winnerId)
        grantUCLPrizeOnce(next, `advanceSF-${winnerId}`, winnerId, UCL_PRIZES.advanceSF);
    }
    if (["playoff", "r16", "qf"].includes(next.ucl.phase)) {
      next.ucl.phase = "sf";
    }
  }

  if (throughOffset >= UCL_CALENDAR.sfLeg2 && allKnockoutLeg2Complete(fixtures, "sf", 2)) {
    next.ucl.bracket = updateBracketWithWinners(next.ucl.bracket, fixtures, "sf");
    for (let i = 0; i < 2; i++) {
      const leg1 = fixtures.find((f) => f.id === `ucl-sf-${i}-leg1`);
      const leg2 = fixtures.find((f) => f.id === `ucl-sf-${i}-leg2`);
      if (!leg1?.result || !leg2?.result) continue;
      const winner = getAggregateWinner(leg1, leg2);
      const winnerId = winner === "leg2Home" ? leg2.homeId : leg2.awayId;
      const finalFixture = next.uclFixtures.find((f) => f.id === "ucl-final");
      if (finalFixture && winnerId) {
        if (i === 0) finalFixture.homeId = winnerId;
        else finalFixture.awayId = winnerId;
      }
      if (winnerId) grantUCLPrizeOnce(next, `finalist-${winnerId}`, winnerId, UCL_PRIZES.finalist);
    }
    if (["playoff", "r16", "qf", "sf"].includes(next.ucl.phase)) {
      next.ucl.phase = "final";
    }
  }

  const final = fixtures.find((f) => f.id === "ucl-final");
  if (throughOffset >= UCL_CALENDAR.final && final?.result) {
    next.ucl.phase = "done";
    next.uclChampion =
      final.result.homeGoals >= final.result.awayGoals ? final.homeId : final.awayId;
    if (next.uclChampion) {
      // Champion gets champion bonus on top of the finalist bonus already granted at SF completion.
      grantUCLPrizeOnce(
        next,
        `champion-${next.uclChampion}`,
        next.uclChampion,
        UCL_PRIZES.champion,
      );
    }

    // Apply season-end progression to all players (only once per season)
    const seasonNumber = parseSeasonNumber(next.season);
    const progressionKey = `seasonEndProgression-${next.season}`;
    if (!next.uclPrizesAwarded?.includes(progressionKey)) {
      applySeasonEndProgressionToAllPlayers(seasonNumber);
      next.uclPrizesAwarded = [...(next.uclPrizesAwarded || []), progressionKey];
    }
  }

  return next;
}

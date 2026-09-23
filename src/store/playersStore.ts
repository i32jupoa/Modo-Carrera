// @ts-nocheck
/**















 * Global player database (EA FC 26 JSON) + mutable season stats.















 */

import { create } from "zustand";

import { persist, createJSONStorage } from "zustand/middleware";

import playersData from "@/data/playersData";
import { buildPositions } from "@/lib/positions";
import type { Position } from "@/data/players";

import {
  TEAMS,
  getAllTeams,
  teamById,
  findTeamStrict,
  leagueIdFromName,
  type LeagueId,
  teamsByLeague,
  applyTeamRating,
  getLeagueTier,
} from "@/data/teams";
import { computeTeamRatingFromSquad, finalizeTeamRating, type RatedSquadMember } from "@/lib/teamRating";

import { defaultLineup, type Player, marketValueFor } from "@/data/players";
import {
  initializeDynamicStats,
  updatePlayerMatchStats,
  applyMonthlyProgression,
  applySeasonEndProgression,
} from "@/lib/playerProgression";
import type { DynamicPlayerStats } from "@/types/playerStats";

import { addDaysToIso, GAME_START_DATE, isMarketOpenForIso } from "@/lib/transferWindows";
import { recoverStamina, STAMINA_START } from "@/lib/liveMatch";

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

import {
  loadSave,
  saveSave,
  generateRealisticStatsForO1Leagues,
  autoDrawForeignCups,
  simulateCupMatchdayLayered,
  simulateBackgroundLeaguesOnly,
  scheduleBackgroundCupsOnly,
  processScheduledBackgroundSims,
  fixCupDraws,
  simulateUCLKnockoutMatchday,
  simulateUCLLeagueMatchday,
  simulateBackgroundUCLDay,
  simulatePendingUCLThroughDay,
  applyUCLPlayoffDraw,
  type SaveGame,
} from "@/lib/store";

import { getCupStructureForCountry, initCup } from "@/lib/cups";

import {
  UCL_CALENDAR,
  UCL_START,
  UCL_SEASON1_IDS,
  uclDayOffset,
  emptyTableEntry,
  assignUCLPots,
  sortUCLTable,
} from "@/data/ucl";

import { runSwissDraw, assignmentsToFixtures } from "@/lib/uclDraw";

import { LEAGUES, getPrimaryLeagueForCountry } from "@/data/teams";
import { getClubProfile, estimateFinancialPower } from "@/lib/transfers/ClubStrategy";
import {
  initialBudget as computeClubInitialBudget,
  syncWageBill,
} from "@/lib/transfers/BudgetManager";
import { estimateAnnualWage } from "@/lib/transfers/SalaryEngine";
import { getClubWageBill, getPlayer } from "@/lib/transfers/PlayerIndex";
import { renewUserPlayer, type UserRenewalInput } from "@/lib/transfers/ContractEngine";
import { saveTransferSystem } from "@/lib/transfers/Persistence";

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

// Track which matchdays have already generated stats to avoid duplicates

const GENERATED_STATS_KEY_PREFIX = "fcsim:generated_stats:";

function generatedStatsKey(): string | null {
  const saveId = getCurrentSaveId();
  return saveId ? `${GENERATED_STATS_KEY_PREFIX}${saveId}` : null;
}

function getGeneratedMatchdays(): Record<string, number> {
  const key = generatedStatsKey();
  if (!key) return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function setGeneratedMatchday(leagueId: LeagueId, matchday: number) {
  const key = generatedStatsKey();
  if (!key) return;
  const current = getGeneratedMatchdays();

  current[leagueId] = Math.max(current[leagueId] || 0, matchday);

  localStorage.setItem(key, JSON.stringify(current));
}

function hasGeneratedMatchday(leagueId: LeagueId, matchday: number): boolean {
  const current = getGeneratedMatchdays();

  return (current[leagueId] || 0) >= matchday;
}

// Clear the tracker for the active career to force regeneration

export function clearGeneratedStatsTracker() {
  const key = generatedStatsKey();
  if (key) localStorage.removeItem(key);
}

// Generate stats on-demand for a specific league if it's O(1

export function ensureStatsForLeague(leagueId: LeagueId) {
  const save = loadSave();

  if (!save) return;

  if (!isVIPLeague(leagueId, save.myLeague)) {
    const currentMatchday = save.currentMatchday[leagueId] - 1;

    if (currentMatchday < 1) return;

    // Get the last matchday we generated stats for

    const lastGenerated = getGeneratedMatchdays()[leagueId] || 0;

    // Only generate stats for matchdays we haven't processed yet

    if (lastGenerated < currentMatchday) {
      // Clear existing stats for this league's players to avoid accumulation

      const store = usePlayersStore.getState();

      const leagueTeams = teamsByLeague(leagueId);

      for (const team of leagueTeams) {
        const squad = store.getSimSquad(team.id);

        for (const player of squad) {
          // Reset stats for this player

          const currentStats = store.stats[player.id];

          if (currentStats) {
            store.stats = {
              ...store.stats,

              [player.id]: {
                ...currentStats,

                appearances: 0,

                goals: 0,

                assists: 0,
              },
            };
          }
        }
      }

      generateRealisticStatsForO1Leagues(
        save,
        [leagueId],
        save.currentMatchday[save.myLeague],
        lastGenerated + 1,
      );

      setGeneratedMatchday(leagueId, currentMatchday);
    }
  }
}

// ...

export type FcPlayer = {
  ID: number;

  Name: string;

  OVR: number;

  /** Potencial real del dataset de jugadores. */
  potential?: number;

  PAC: number;

  SHO: number;

  PAS: number;

  DRI: number;

  DEF: number;

  PHY: number;

  Position: string;
  "Alternative positions"?: string;
  Nation?: string;

  Age: number;

  /** Fecha de nacimiento ISO (YYYY-MM-DD), cuando está disponible. */
  birthdate?: string;

  Team: string;

  League: string;

  card?: string;
};

export const INITIAL_BUDGET = 100_000_000;

export { GAME_START_DATE } from "@/lib/transferWindows";

export type TransferResult = { ok: true } | { ok: false; reason: string };

export type PlayerStats = {
  goals: number;

  assists: number;

  appearances: number;

  cupGoals: number;

  cupAssists: number;

  cupAppearances: number;
  uclGoals: number;
  uclAssists: number;
  uclAppearances: number;
  cleanSheets: number;
  cupCleanSheets: number;
  uclCleanSheets: number;
  motm: number;
  cupMotm: number;
  uclMotm: number;

  /** Legacy league-matchday marker kept for backwards compatibility. */
  injuredUntil: number;

  /** Exact recovery date (YYYY-MM-DD). Used for ALL competitions. */
  injuredUntilDate?: string;
  /** Date on which the injury happened. */
  injuryStartDate?: string;
  /** Total duration in calendar days. */
  injuryDurationDays?: number;
  /** Broad injury type (e.g. Muscular, Joint, Bone). */
  injuryType?: string;
  /** Body area affected. */
  injuryArea?: string;

  injuryReason?: string;

  morale: number;

  formHistory: number[];

  yellowCards: number;

  redCards: number;

  accumulatedYellowCards: number;

  /** Energía física persistente del jugador (0-100). */
  energy: number;
  /** Última fecha hasta la que se aplicó recuperación. */
  energyLastUpdatedDate: string;

  /** Estadísticas dinámicas que cambian con el tiempo (persistidas por partida) */
  dynamicStats?: DynamicPlayerStats;
};

let RAW_PLAYERS = playersData as FcPlayer[];

export const PLAYERS_DB_SIZE = RAW_PLAYERS.length;

/** Calcula la edad real de un jugador para una fecha concreta de la partida.
 *  Si no existe fecha de nacimiento, conserva la edad del dataset como fallback. */
export function playerAgeAtDate(
  birthdate: string | undefined,
  currentDate: string | undefined,
  fallbackAge: number,
): number {
  if (!birthdate) return Math.max(0, Math.trunc(Number(fallbackAge) || 0));

  const birth = String(birthdate).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const current = String(currentDate ?? "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!birth || !current) return Math.max(0, Math.trunc(Number(fallbackAge) || 0));

  const birthYear = Number(birth[1]);
  const birthMonth = Number(birth[2]);
  const birthDay = Number(birth[3]);
  const currentYear = Number(current[1]);
  const currentMonth = Number(current[2]);
  const currentDay = Number(current[3]);

  if (!birthYear || !birthMonth || !birthDay || !currentYear || !currentMonth || !currentDay) {
    return Math.max(0, Math.trunc(Number(fallbackAge) || 0));
  }

  let age = currentYear - birthYear;

  // Los nacidos el 29 de febrero cumplen años el 28 de febrero en años no bisiestos.
  const isLeapYear = (currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0;
  const anniversaryDay = birthMonth === 2 && birthDay === 29 && !isLeapYear ? 28 : birthDay;

  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < anniversaryDay)) {
    age -= 1;
  }

  return Math.max(0, age);
}

let cachedAgeDate: string | null = null;

/** Actualiza las edades de la base central y fuerza una nueva referencia del array. */
function syncPlayerAgesForDate(currentDate: string): void {
  if (!currentDate || cachedAgeDate === currentDate) return;

  for (const player of RAW_PLAYERS) {
    if (!player.birthdate) continue;
    player.Age = playerAgeAtDate(player.birthdate, currentDate, player.Age);
  }

  // Una nueva referencia hace que las búsquedas que dependen del listado se
  // vuelvan a renderizar al cruzar un cumpleaños, sin recrear los objetos.
  RAW_PLAYERS = RAW_PLAYERS.slice();
  cachedAgeDate = currentDate;
  SQUAD_CACHE = new Map();
}


const TEAM_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  TEAMS.map((t) => [t.name, t.id]),
);

const PLAYERS_BY_TEAM: Record<string, FcPlayer[]> = {};

/** Club inicial exacto del registro de la base de datos. Nunca usa
 * coincidencias parciales (Barcelona SC no puede convertirse en FC Barcelona). */
function baseClubId(p: FcPlayer): string | null {
  return findTeamStrict(p.Team, p.League)?.id ?? null;
}

export function baseClubOfPlayer(playerId: string): string | null {
  const raw = FC_BY_ID.get(playerId);
  return raw ? baseClubId(raw) : null;
}

export function fcPlayerById(playerId: string): FcPlayer | undefined {
  return FC_BY_ID.get(playerId);
}

for (const p of RAW_PLAYERS) {
  const teamKey = baseClubId(p);

  if (!teamKey) continue;

  if (!PLAYERS_BY_TEAM[teamKey]) PLAYERS_BY_TEAM[teamKey] = [];

  PLAYERS_BY_TEAM[teamKey].push(p);
}

const FC_BY_ID = new Map<string, FcPlayer>(RAW_PLAYERS.map((p) => [String(p.ID), p]));

// ============================================================================
// REGISTRO CENTRAL DE PLANTILLAS
// ----------------------------------------------------------------------------
// `PLAYERS_BY_TEAM` refleja los datos base del JSON. Los traspasos (de la IA o
// del usuario) se guardan como "overrides" jugador -> club, de modo que toda la
// aplicación vea siempre la plantilla real y no la del arranque de la partida.
// Un club vacío ("") significa agente libre.
// ============================================================================

/** Overrides vivos: id de jugador -> id de club ("" = agente libre). */
let CLUB_OVERRIDES: Record<string, string> = {};
/** Caché de plantillas ya calculadas; se invalida al cambiar los overrides. */
let SQUAD_CACHE = new Map<string, FcPlayer[]>();

// La partida empieza el 1/7/2025: desde aquí toda la edad se calcula por fecha de nacimiento.
syncPlayerAgesForDate(GAME_START_DATE);

// Calculamos la media real de cada equipo en cuanto tenemos las plantillas
// base cargadas, para que incluso en el menú principal (antes de empezar o
// cargar una partida) la media mostrada ya refleje a los jugadores reales.
recomputeAllTeamRatings();

/** Sustituye por completo el mapa de overrides (carga de partida). */
export function setClubOverrides(next: Record<string, string>): void {
  CLUB_OVERRIDES = { ...next };
  SQUAD_CACHE = new Map();
  recomputeAllTeamRatings();
}

/** Resetea completamente los overrides (nueva partida). */
export function resetClubOverrides(): void {
  CLUB_OVERRIDES = {};
  SQUAD_CACHE = new Map();
  recomputeAllTeamRatings();
}

/** Overrides actuales (para guardar con la partida). */
export function getClubOverrides(): Record<string, string> {
  return CLUB_OVERRIDES;
}

/** Aplica un traspaso al registro central. `toClubId` null = agente libre. */
export function setPlayerClub(playerId: string, toClubId: string | null): void {
  const fromClubId = clubOfPlayer(playerId);
  CLUB_OVERRIDES[playerId] = toClubId ?? "";
  SQUAD_CACHE = new Map();
  // El fichaje/venta cambia la plantilla real de ambos clubes implicados, así
  // que su media (att/mid/def) debe recalcularse en el acto.
  if (fromClubId) recomputeTeamRating(fromClubId);
  if (toClubId) recomputeTeamRating(toClubId);
}

/** Club real de un jugador hoy (override si existe, si no el del JSON). */
export function clubOfPlayer(playerId: string): string | null {
  const override = CLUB_OVERRIDES[playerId];
  if (override !== undefined) return override === "" ? null : override;
  const raw = FC_BY_ID.get(playerId);
  return raw ? baseClubId(raw) : null;
}

/** Plantilla real de un club, con todos los traspasos ya aplicados. */
export function squadForTeam(teamId: string): FcPlayer[] {
  const cached = SQUAD_CACHE.get(teamId);
  if (cached) return cached;
  const base = PLAYERS_BY_TEAM[teamId] ?? [];
  const overrideIds = Object.keys(CLUB_OVERRIDES);
  if (overrideIds.length === 0) {
    SQUAD_CACHE.set(teamId, base);
    return base;
  }
  // Salen los que se han ido; entran los fichados desde otros clubes.
  const squad = base.filter((p) => {
    const override = CLUB_OVERRIDES[String(p.ID)];
    return override === undefined || override === teamId;
  });
  for (const playerId of overrideIds) {
    if (CLUB_OVERRIDES[playerId] !== teamId) continue;
    const raw = FC_BY_ID.get(playerId);
    if (!raw) continue;
    if (baseClubId(raw) === teamId) continue; // ya estaba en `base`
    squad.push(raw);
  }
  SQUAD_CACHE.set(teamId, squad);
  return squad;
}

function defaultStats(): PlayerStats {
  return {
    goals: 0,

    assists: 0,

    appearances: 0,

    cupGoals: 0,

    cupAssists: 0,

    cupAppearances: 0,
    uclGoals: 0,
    uclAssists: 0,
    uclAppearances: 0,
    cleanSheets: 0,
    cupCleanSheets: 0,
    uclCleanSheets: 0,
    motm: 0,
    cupMotm: 0,
    uclMotm: 0,

    injuredUntil: 0,

    injuredUntilDate: undefined,
    injuryStartDate: undefined,
    injuryDurationDays: undefined,
    injuryType: undefined,
    injuryArea: undefined,

    morale: 70,

    formHistory: [],

    yellowCards: 0,

    redCards: 0,

    accumulatedYellowCards: 0,

    energy: STAMINA_START,
    energyLastUpdatedDate: GAME_START_DATE,
  };
}

export function mapEaPosition(pos: string): Position {
  if (pos === "GK") return "GK";

  const u = pos.toUpperCase();

  if (["CB", "LB", "RB", "LWB", "RWB", "SW", "LCB", "RCB"].includes(u)) return "DEF";

  if (["ST", "CF", "LW", "RW", "LF", "RF", "LS", "RS"].includes(u)) return "FWD";

  return "MID";
}

// ============================================================================
// MEDIA DE EQUIPO DINÁMICA
// ----------------------------------------------------------------------------
// La media (att/mid/def) de cada club se recalcula siempre a partir de su
// plantilla real (`squadForTeam`), dando mucho más peso al once titular que
// al banquillo (ver `computeTeamRatingFromSquad`). Así, la media nunca queda
// desconectada de los jugadores reales: si un equipo de una categoría
// inferior tiene mejores jugadores que uno de una superior, su media lo
// reflejará. Se recalcula cada vez que cambia una plantilla (fichajes,
// ventas, cesiones, carga de partida, nueva partida).
// ============================================================================

function recomputeTeamRating(teamId: string): void {
  if (!teamId) return;
  const squad = squadForTeam(teamId);
  const rated: RatedSquadMember[] = squad.map((fc) => ({
    rating: fc.OVR || 70,
    position: mapEaPosition(fc.Position),
    age: fc.Age,
  }));
  const raw = computeTeamRatingFromSquad(rated);
  const tier = getLeagueTier(teamById(teamId).league);
  const rating = finalizeTeamRating(raw, tier);
  applyTeamRating(teamId, rating);
}

/** Recalcula la media de todos los equipos del juego a partir de sus plantillas reales. */
export function recomputeAllTeamRatings(): void {
  for (const team of getAllTeams()) {
    recomputeTeamRating(team.id);
  }
}

// Sophisticated market valuation using the new Transfermarkt-style system

export function marketValueMillions(
  ovr: number,
  age: number,
  pos = "MID",
  teamId = "",
  leagueId = "",
  isStar = false,
  teamAvgRating = 75,
  potential?: number,
): number {
  const result = marketValueFor(
    ovr,
    age,
    pos,
    teamId,
    leagueId,
    0,
    0,
    0,
    isStar,
    teamAvgRating,
    undefined,
    undefined,
    potential,
  );

  return result.value;
}

export function marketValueEuros(
  fc: FcPlayer,
  teamId = "",
  leagueId = "",
  teamAvgRating = 75,
): number {
  const isStar = fc.OVR >= 82;

  // If leagueId not provided, get it from player's league name

  const effectiveLeagueId = leagueId || leagueIdFromName(fc.League || "");

  return Math.round(
    marketValueMillions(
      fc.OVR,
      fc.Age,
      fc.Position,
      teamId,
      effectiveLeagueId,
      isStar,
      teamAvgRating,
      fc.potential,
    ) * 1_000_000,
  );
}

export function teamInitialBudget(avgOvr: number, leagueId = "", clubId = ""): number {
  // Misma fórmula que usan los clubes IA (ver BudgetManager.initialBudget):
  // un club vale lo mismo lo controle la IA o el usuario. Antes esta función
  // tenía su propia interpolación piecewise ajena al resto del mercado, y por
  // tanto un mismo club podía arrancar con presupuestos distintos según quién
  // lo llevara.
  if (clubId) {
    return computeClubInitialBudget(getClubProfile(clubId));
  }

  // Fallback si no se conoce el clubId: perfil aproximado a partir de la
  // media del equipo y el peso real de su liga (misma tabla que usa
  // ClubStrategy para cualquier club), en vez de una fórmula aparte.
  const financialPower = estimateFinancialPower(avgOvr, leagueId);
  return computeClubInitialBudget({ clubId: "", leagueId, financialPower } as ClubProfile);
}

export function formatEuro(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(safe) >= 1_000_000) {
    return `€${(safe / 1_000_000).toFixed(2)}M`;
  }

  if (Math.abs(safe) >= 1_000) return `€${(safe / 1_000).toFixed(2)}K`;

  return `€${safe.toFixed(2)}`;
}

export const POS_LABEL_ES: Record<Position, string> = {
  GK: "POR",

  DEF: "DEF",

  MID: "MED",

  FWD: "DEL",
};

export function syncSquadFromRoster(rosterIds: string[]): FcPlayer[] {
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
    const normalizedName = fc.Team.toLowerCase().replace(/[^a-z0-9]/g, "");

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
    positions: buildPositions(fc.Position, (fc as any)["Alternative positions"]),

    rating: fc.OVR,

    potential: Math.max(fc.OVR, Number(fc.potential ?? fc.OVR)),

    age: fc.Age,

    teamId,

    marketValue: marketValueMillions(
      fc.OVR,
      fc.Age,
      fc.Position,
      "",
      "",
      false,
      75,
      fc.potential,
    ),

    isReal: true,

    goals: stats.goals,

    assists: stats.assists,

    appearances: stats.appearances,

    injuredUntil: stats.injuredUntil,

    injuredUntilDate: stats.injuredUntilDate,
    injuryStartDate: stats.injuryStartDate,
    injuryDurationDays: stats.injuryDurationDays,
    injuryType: stats.injuryType,
    injuryArea: stats.injuryArea,
    injuryReason: stats.injuryReason,

    morale: stats.morale,

    formHistory: stats.formHistory,

    energy: Math.max(0, Math.min(100, Number(stats.energy ?? STAMINA_START))),

    // Inicializar estadísticas dinámicas si no existen
    dynamicStats: stats.dynamicStats || initializeDynamicStats(fc.OVR),
  };
}

type PlayersState = {
  loaded: boolean;

  myTeamId: string | null;

  squad: FcPlayer[];

  rosterIds: string[];
  /** Jugadores cedidos al club del usuario: se integran en la plantilla sin cambiar su propietario. */
  loanedPlayers: Record<string, { fromClubId: string; endDate: string }>;
  /** Traspasos aplicados al mundo: id de jugador -> id de club ("" = libre). */
  clubOverrides: Record<string, string>;

  budget: number;

  /** Margen salarial anual disponible adicional (máximo 30% del presupuesto económico total). */
  wageBudget: number;

  /** Masa salarial anual comprometida por los jugadores de la plantilla. */
  wageBill: number;

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

  /** Sorteo de copa pendiente (bloquea el avance igual que pendingUserMatch) */

  pendingCupDraw: boolean;

  /** Sorteo UCL pendiente */

  pendingUclDraw: "league" | "playoff" | "knockout" | null;

  init: () => void;

  advanceTime: (days: number) => number;

  simulateMatch: (matchId: string) => void;

  clearPendingMatch: () => void;

  clearPendingCupDraw: () => void;

  clearPendingUclDraw: () => void;

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
  /** Descuenta un gasto extraordinario del presupuesto total. */
  spendBudget: (cost: number) => boolean;
  /** Reparte el presupuesto total entre fichajes y salarios, entre el 5% y el 30%. */
  setWageBudget: (value: number) => void;
  /** Sincroniza la masa salarial con los contratos reales del motor de mercado. */
  syncWageStateFromMarket: () => void;
  /** Renueva un contrato usando la fuente única de verdad del mercado. */
  renewPlayerContract: (input: Omit<UserRenewalInput, "clubId">) => ReturnType<typeof renewUserPlayer>;

  importLegacyStats: (players: Record<string, Player>) => void;

  buyPlayer: (playerId: string, cost: number) => TransferResult;
  /**
   * Aplica al mundo los traspasos cerrados por el motor de mercado.
   * Es el único punto por el que la IA modifica plantillas ajenas.
   */
  applyMarketMoves: (moves: { playerId: string; toClubId: string | null }[]) => void;
  /** Añade/quita una cesión temporal en la plantilla del usuario. */
  addLoanedPlayer: (playerId: string, fromClubId: string, endDate: string) => TransferResult;
  removeLoanedPlayer: (playerId: string) => void;
  isLoanedPlayer: (playerId: string) => boolean;

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

  /** Aplica el resultado físico de un partido a los dos equipos. */
  setTeamMatchEnergy: (teamId: string, energyByPlayer: Record<string, number>, matchDate?: string) => void;
  /** Recupera energía día a día hasta la fecha indicada. */
  recoverPlayerEnergyToDate: (targetDate: string) => void;

  recordAppearance: (playerId: string, competition?: string, minutes?: number) => void;

  recordGoal: (playerId: string, competition?: string) => void;

  recordAssist: (playerId: string, competition?: string) => void;
  /** Removes one goal previously credited to a player (never goes below 0). */
  unrecordGoal: (playerId: string, competition?: string) => void;
  /** Removes one assist previously credited to a player (never goes below 0). */
  unrecordAssist: (playerId: string, competition?: string) => void;
  recordCleanSheet: (playerId: string, competition?: string) => void;

  recordMotm: (playerId: string, competition?: string) => void;
  recordMatchRating: (playerId: string, rating: number) => void;

  recordYellowCard: (playerId: string) => void;

  recordRedCard: (playerId: string) => void;

  incrementAccumulatedYellowCards: (playerId: string) => void;

  resetAccumulatedYellowCards: (playerId: string) => void;

  recordInjury: (
    playerId: string,
    injuredUntil: number,
    reason: string,
    meta?: {
      startDate?: string;
      untilDate?: string;
      durationDays?: number;
      injuryType?: string;
      injuryArea?: string;
    },
  ) => void;
};

let statsBatchDepth = 0;
let batchedStats: Record<string, PlayerStats> | null = null;

function mutatePlayerStat(
  get: () => PlayersState,
  set: (partial: Partial<PlayersState>) => void,
  playerId: string,
  updater: (stats: PlayerStats) => PlayerStats,
) {
  const source = batchedStats ?? get().stats;
  const next = batchedStats ?? { ...source };
  const existing = source[playerId] ?? defaultStats();
  // Any player can receive a stat event before another action has created its
  // dynamic season block. Initialise it here so appearances, minutes, goals,
  // ratings, MVP and clean sheets are never silently discarded on first use.
  const fc = FC_BY_ID.get(String(playerId));
  const dynamicStats = existing.dynamicStats
    ? existing.dynamicStats
    : (() => {
        const dynamic = initializeDynamicStats(Number(fc?.OVR) || 70);
        // Migrate the old season counters when the player already has legacy
        // stats but no dynamic block yet. This also repairs saves created
        // before dynamic season statistics were introduced.
        dynamic.seasonGoals = Number(existing.goals) || 0;
        dynamic.seasonAssists = Number(existing.assists) || 0;
        dynamic.seasonAppearances = Number(existing.appearances) || 0;
        dynamic.seasonCleanSheets = Number(existing.cleanSheets) || 0;
        dynamic.seasonMVPs = Number(existing.motm) || 0;
        return dynamic;
      })();
  const stats = existing.dynamicStats ? existing : { ...existing, dynamicStats };

  next[playerId] = updater(stats);
  if (batchedStats) batchedStats = next;
  else set({ stats: next });
}

function currentDateParts(iso: string | undefined): { year: number; month: number } {
  const fallback = new Date();
  const [y, m] = String(iso ?? "").split("-").map(Number);
  return {
    year: Number.isFinite(y) && y > 0 ? y : fallback.getFullYear(),
    month: Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : fallback.getMonth(),
  };
}

type MonthlyDelta = {
  goals?: number;
  assists?: number;
  appearances?: number;
  mvpCount?: number;
  cleanSheets?: number;
  rating?: number;
};

function withMonthlyDelta(
  dynamic: DynamicPlayerStats,
  isoDate: string | undefined,
  delta: MonthlyDelta,
): DynamicPlayerStats {
  const { year, month } = currentDateParts(isoDate);
  const monthlyStats = [...(dynamic.monthlyStats ?? [])].map((entry) => ({ ...entry }));
  let entry = monthlyStats.find((m) => m.year === year && m.month === month);

  if (!entry) {
    entry = {
      month,
      year,
      goals: 0,
      assists: 0,
      appearances: 0,
      averageRating: 6,
      mvpCount: 0,
      cleanSheets: 0,
      ratingTotal: 0,
      ratingCount: 0,
    };
    monthlyStats.push(entry);
  }

  entry.goals += delta.goals ?? 0;
  entry.assists += delta.assists ?? 0;
  entry.appearances += delta.appearances ?? 0;
  entry.mvpCount += delta.mvpCount ?? 0;
  entry.cleanSheets += delta.cleanSheets ?? 0;

  if (delta.rating !== undefined && Number.isFinite(delta.rating)) {
    entry.ratingTotal = (entry.ratingTotal ?? 0) + delta.rating;
    entry.ratingCount = (entry.ratingCount ?? 0) + 1;
    entry.averageRating = entry.ratingTotal / entry.ratingCount;
  }

  return { ...dynamic, monthlyStats };
}

export function beginPlayerStatsBatch() {
  if (statsBatchDepth++ === 0) {
    batchedStats = { ...usePlayersStore.getState().stats };
  }
}

export function endPlayerStatsBatch() {
  if (statsBatchDepth <= 0) return;
  statsBatchDepth--;
  if (statsBatchDepth === 0 && batchedStats) {
    const stats = batchedStats;
    batchedStats = null;
    usePlayersStore.setState({ stats } as any);
  }
}

export function withPlayerStatsBatch<T>(fn: () => T): T {
  beginPlayerStatsBatch();
  try {
    return fn();
  } finally {
    endPlayerStatsBatch();
  }
}

export async function withPlayerStatsBatchAsync<T>(fn: () => Promise<T>): Promise<T> {
  beginPlayerStatsBatch();
  try {
    return await fn();
  } finally {
    endPlayerStatsBatch();
  }
}

function estimateSquadWageBill(teamId: string, squad: FcPlayer[]): number {
  if (!squad.length) return 0;
  const avg = squad.reduce((sum, p) => sum + p.OVR, 0) / squad.length;
  return squad.reduce((sum, p) => {
    const value = marketValueEuros(p, teamId, teamById(teamId).league, avg);
    return sum + estimateAnnualWage(value, p.Age, p.OVR);
  }, 0);
}

function wageAllocation(totalBudget: number, preferredRatio = 0.2): number {
  const total = Math.max(0, Math.round(totalBudget));
  if (total === 0) return 0;
  const ratio = Math.max(0.05, Math.min(0.30, preferredRatio));
  return Math.round(total * ratio);
}

function initialWageBudget(totalBudget: number): number {
  return wageAllocation(totalBudget, 0.2);
}

export const usePlayersStore = create<PlayersState>()(
  persist(
    (set, get) => ({
      loaded: false,

      myTeamId: null,

      squad: [],

      rosterIds: [],
      loanedPlayers: {},
      clubOverrides: {},

      budget: INITIAL_BUDGET,

      wageBudget: initialWageBudget(INITIAL_BUDGET),

      wageBill: 0,

      currentDate: GAME_START_DATE,

      fixtures: [],

      pendingUserMatch: null,

      lastUserMatchResult: null,

      pendingCupDraw: false,

      pendingUclDraw: null,

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

      clearPendingMatch: () => set({ pendingUserMatch: null, lastUserMatchResult: null }),

      clearPendingCupDraw: () => set({ pendingCupDraw: false }),

      clearPendingUclDraw: () => set({ pendingUclDraw: null }),

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

        if (sim.energyAtEnd) {
          state.setTeamMatchEnergy(fixture.homeTeam, sim.energyAtEnd, fixture.date);
          state.setTeamMatchEnergy(fixture.awayTeam, sim.energyAtEnd, fixture.date);
        }

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
          const nextDate = addDaysToIso(state.currentDate, days);
          get().recoverPlayerEnergyToDate(nextDate);
          syncPlayerAgesForDate(nextDate);
          set({ currentDate: nextDate });

          return days;
        }

        state.init();

        const onDay = unplayedOnDate(state.fixtures, state.currentDate);

        const userMatch = onDay.find((f) => involvesTeam(f, state.myTeamId!));

        if (userMatch) return 0;

        if (get().pendingUserMatch) return 0;

        if (get().pendingCupDraw) return 0;

        if (get().pendingUclDraw) return 0;

        // --- Copa: procesar al avanzar día, sin depender del calendario ---

        {
          const rawSave = loadSave();

          if (rawSave) {
            const nextDate = addDaysToIso(state.currentDate, 1);

            // 1. Procesar copas extranjeras solo en temporada de copa (julio-mayo)

            let currentSave = rawSave;

            const nextDateObj = new Date(nextDate + "T00:00:00Z");

            const month = nextDateObj.getMonth() + 1; // 1-12

            const isCupSeason = month >= 7 || month <= 5; // Julio-Diciembre o Enero-Mayo

            if (isCupSeason) {
              try {
                currentSave = autoDrawForeignCups(fixCupDraws(rawSave), nextDate);
              } catch {
                /* keep rawSave */
              }
            }

            // 3. Programar ligas background alrededor del próximo partido del usuario

            try {
              // Get next match date from schedule fixtures (ScheduleFixture[] with real ISO dates)

              const storeState = usePlayersStore.getState();

              const nextScheduledMatch = storeState.fixtures.find((f) => !f.isPlayed);

              const nextMatchDate = nextScheduledMatch?.date;

              simulateBackgroundLeaguesOnly(currentSave, nextDate, nextMatchDate).then((result) => {
                if (result) {
                  // Programar copas background también

                  scheduleBackgroundCupsOnly(
                    result,
                    result.currentMatchday[result.myLeague],
                    nextDate,
                  ).then((withCups) => {
                    if (withCups) {
                      const withProcessed = processScheduledBackgroundSims(withCups, nextDate);

                      saveSave(withProcessed);
                    }
                  });
                }
              });
            } catch {
              /* keep currentSave */
            }

            // 2. Detectar si hoy es día de sorteo del usuario

            try {
              const userCountry = LEAGUES[currentSave.myLeague]?.country;

              const primaryLeague = userCountry
                ? getPrimaryLeagueForCountry(userCountry)
                : currentSave.myLeague;

              const cupKey = (primaryLeague || currentSave.myLeague) as LeagueId;

              const CUP_START = new Date("2025-07-07T00:00:00Z");

              const todayOffset = Math.floor(
                (new Date(nextDate).getTime() - CUP_START.getTime()) / 86400000,
              );

              const cupStructure =
                (currentSave.cupFixtures as any)[`${cupKey}_structure`] ||
                getCupStructureForCountry(userCountry || "");

              const cupSchedule = cupStructure.schedule;

              const isInPreliminary = (() => {
                try {
                  return (
                    initCup(userCountry || "").preliminaryParticipants?.includes(
                      currentSave.myTeamId,
                    ) || false
                  );
                } catch {
                  return false;
                }
              })();

              const relevantSchedule = cupSchedule.filter((s: any) =>
                s.round === "Preliminar" ? isInPreliminary : true,
              );

              const cupFixtures = currentSave.cupFixtures[cupKey] || [];

              const isDrawDay = relevantSchedule.some((s: any) => {
                const drawDate = new Date(CUP_START.getTime() + s.drawMatchday * 86400000);

                const drawDateIso = drawDate.toISOString().slice(0, 10);

                if (drawDateIso !== nextDate) return false;

                return !cupFixtures.some((f: any) => f.round === s.round);
              });

              if (isDrawDay) {
                // Guardar copas extranjeras procesadas y bloquear para sorteo

                saveSave(currentSave);

                syncPlayerAgesForDate(nextDate);
                set({ currentDate: nextDate, pendingCupDraw: true });

                return 1;
              }

              // 3. Simular prelim del usuario 2 días antes del sorteo, si no está en prelim

              const prelimRound = cupSchedule.find((s: any) => s.round === "Preliminar");

              if (prelimRound && !isInPreliminary) {
                const triggerOffset = prelimRound.drawMatchday - 2;

                if (todayOffset === triggerOffset) {
                  const prelimFixturesExist = (currentSave.cupFixtures[cupKey] || []).some(
                    (f: any) => f.round === "Preliminar",
                  );

                  if (!prelimFixturesExist) {
                    try {
                      const cupData = initCup(userCountry || "");

                      const prelimTeams = cupData.preliminaryParticipants || [];

                      if (!currentSave.cupFixtures[cupKey]) currentSave.cupFixtures[cupKey] = [];

                      for (let i = 0; i + 1 < prelimTeams.length; i += 2) {
                        const hg = Math.floor(Math.random() * 4);

                        const ag = Math.floor(Math.random() * 4);

                        (currentSave.cupFixtures[cupKey] as any[]).push({
                          id: `cup-${cupKey}-prelim-${i}`,

                          competition: "cup",

                          league: cupKey,

                          matchday: prelimRound.matchday,

                          round: "Preliminar",

                          homeId: prelimTeams[i],

                          awayId: prelimTeams[i + 1],

                          result: {
                            homeGoals: hg,
                            awayGoals: ag,
                            events: [],
                            injuries: [],
                            xgHome: hg,
                            xgAway: ag,
                          },
                        });
                      }
                    } catch {
                      /* ignore */
                    }
                  }
                }
              }

              // 4. Simular matchday de copa si usuario eliminado y es día de partido

              const todayMatchday = cupSchedule.find(
                (s: any) => s.matchday === todayOffset,
              )?.matchday;

              if (todayMatchday !== undefined) {
                const unplayedCupFixtures = (currentSave.cupFixtures[cupKey] || []).filter(
                  (f: any) => !f.result,
                );

                const userHasCupFixture = unplayedCupFixtures.some(
                  (f: any) =>
                    f.homeId === currentSave.myTeamId || f.awayId === currentSave.myTeamId,
                );

                if (!userHasCupFixture && unplayedCupFixtures.length > 0) {
                  // Simular sincrónicamente con resultados simples

                  for (const f of unplayedCupFixtures.filter(
                    (f: any) => f.matchday === todayMatchday,
                  )) {
                    const hg = Math.floor(Math.random() * 4);

                    const ag = Math.floor(Math.random() * 4);

                    const idx = (currentSave.cupFixtures[cupKey] as any[]).findIndex(
                      (x: any) => x.id === f.id,
                    );

                    if (idx >= 0) {
                      (currentSave.cupFixtures[cupKey] as any[])[idx] = {
                        ...f,

                        result: {
                          homeGoals: hg,
                          awayGoals: ag,
                          events: [],
                          injuries: [],
                          xgHome: hg,
                          xgAway: ag,
                        },
                      };
                    }
                  }
                }
              }

              saveSave(currentSave);
            } catch (e) {
              saveSave(currentSave);
            }
          }
        }

        // --- UCL: detectar dias de sorteo y partidos ---

        {
          const rawSave = loadSave();

          if (rawSave) {
            const nextDate = addDaysToIso(state.currentDate, 1);

            const offset = uclDayOffset(nextDate);

            console.log(
              `[advanceTime] currentDate: ${state.currentDate}, nextDate: ${nextDate}, offset: ${offset}`,
            );

            console.log(
              `[advanceTime] UCL Calendar - leagueDraw: ${UCL_CALENDAR.leagueDraw}, playoffDraw: ${UCL_CALENDAR.playoffDraw}, knockoutDraw: ${UCL_CALENDAR.knockoutDraw}`,
            );

            console.log(`[advanceTime] drawState:`, rawSave.ucl?.drawState);

            if (!rawSave.ucl && offset >= UCL_CALENDAR.leagueDraw) {
              rawSave.ucl = {
                phase: "league" as const,

                seasonNumber: 1,

                participants: UCL_SEASON1_IDS,

                table: UCL_SEASON1_IDS.map(emptyTableEntry),

                drawState: { leagueDone: false, playoffDone: false, knockoutDone: false },

                leaguePhaseTable: null,

                bracket: [],
              };

              saveSave(rawSave);
            }

            if (rawSave.ucl) {
              const ucl = rawSave.ucl;

              // League draw day

              console.log(
                `[advanceTime] Checking league draw: offset=${offset}, leagueDraw=${UCL_CALENDAR.leagueDraw}, leagueDone=${ucl.drawState.leagueDone}`,
              );

              if (offset === UCL_CALENDAR.leagueDraw && !ucl.drawState.leagueDone) {
                console.log(`[advanceTime] TRIGGERING LEAGUE DRAW`);

                saveSave(rawSave);

                syncPlayerAgesForDate(nextDate);
                set({ currentDate: nextDate, pendingUclDraw: "league" });

                return 1;
              }

              // Playoff draw day - ALWAYS show modal regardless of team position

              console.log(
                `[advanceTime] Checking playoff draw: offset=${offset}, playoffDraw=${UCL_CALENDAR.playoffDraw}, leagueDone=${ucl.drawState.leagueDone}, playoffDone=${ucl.drawState.playoffDone}`,
              );

              if (
                offset === UCL_CALENDAR.playoffDraw &&
                ucl.drawState.leagueDone &&
                !ucl.drawState.playoffDone
              ) {
                console.log(`[advanceTime] TRIGGERING PLAYOFF DRAW - Always shown`);

                const drawn = applyUCLPlayoffDraw(rawSave);

                saveSave(drawn);

                syncPlayerAgesForDate(nextDate);
                set({ currentDate: nextDate, pendingUclDraw: "playoff" });

                return 1;
              }

              // Knockout draw day

              console.log(
                `[advanceTime] Checking knockout draw: offset=${offset}, knockoutDraw=${UCL_CALENDAR.knockoutDraw}, knockoutDone=${ucl.drawState.knockoutDone}`,
              );

              // Octavos draw day (15 Jul): mark draw done; phase advances only after play-offs finish
              if (offset === UCL_CALENDAR.knockoutDraw && !ucl.drawState.knockoutDone) {
                rawSave.ucl.drawState.knockoutDone = true;
                saveSave(rawSave);
              }

              // Catch up all UCL AI fixtures through this date (play-offs, knockouts, etc.)
              if (ucl.drawState.leagueDone && offset >= UCL_CALENDAR.leagueDay[0]) {
                const synced = simulatePendingUCLThroughDay(rawSave, offset, rawSave.myTeamId);
                rawSave.uclFixtures = synced.uclFixtures;
                if (synced.ucl) rawSave.ucl = synced.ucl;
                if (synced.uclChampion) rawSave.uclChampion = synced.uclChampion;
                saveSave(rawSave);
              }
            }
          }
        }

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

          // Record the real participation/minutes produced by the simulation.
          const minuteMap = new Map(
            (result.ratings ?? []).map((r: any) => [r.playerId, Number(r.minutes) || 0]),
          );
          const participants = result.ratings?.length
            ? result.ratings.map((r: any) => r.playerId)
            : [...homeXI, ...awayXI].map((p) => p.id);

          for (const playerId of participants) {
            get().recordAppearance(playerId, f.competition, minuteMap.has(playerId) ? minuteMap.get(playerId) : 90);
          }

          // Persist physical energy after every simulated fixture. The method
          // also resets unused bench/reserve players to 100 as required.
          if (result.energyAtEnd) {
            get().setTeamMatchEnergy(f.homeTeam, result.energyAtEnd, f.date);
            get().setTeamMatchEnergy(f.awayTeam, result.energyAtEnd, f.date);
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

            awayScore: result.awayGoals,
          });
        };

        for (let d = 0; d < days; d++) {
          const nextDate = addDaysToIso(date, 1);

          // La energía se recupera con el paso del calendario, nunca por forma.
          get().recoverPlayerEnergyToDate(nextDate);

          const onDay = unplayedOnDate(fixtures, nextDate);

          const userMatch = onDay.find((f) => involvesTeam(f, state.myTeamId!));

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

        syncPlayerAgesForDate(date);

        set({
          currentDate: date,

          fixtures,

          pendingUserMatch,
          squad: state.squad.length ? [...state.squad] : state.squad,
        });

        return advanced;
      },

      resetGameDate: () => {
        syncPlayerAgesForDate(GAME_START_DATE);
        set({ currentDate: GAME_START_DATE, squad: [...get().squad] });
      },

      isMarketOpen: () => isMarketOpenForIso(get().currentDate),

      init: () => {
        syncPlayerAgesForDate(get().currentDate);
        if (get().loaded) return;

        queueMicrotask(() => {
          set({ loaded: true });

          const teamId = get().myTeamId;

          if (teamId) get().hydrateMyTeam();
        });
      },

      setMyTeam: (teamId, opts) => {
        const team = teamById(teamId);
        const defaultSquad = squadForTeam(team.id);
        const rosterIds = defaultSquad.map((p) => String(p.ID));
        const prev = get();
        const avgOvr =
          defaultSquad.length > 0
            ? defaultSquad.reduce((sum, p) => sum + p.OVR, 0) / defaultSquad.length
            : (team.att + team.mid + team.def) / 3;

        const shouldReset = opts?.resetBudget || prev.myTeamId !== teamId;
        let totalBudget = shouldReset ? teamInitialBudget(avgOvr, team.league, team.id) : prev.budget;
        const wageBill = getClubWageBill(teamId);

        totalBudget = Math.max(0, Math.round(totalBudget));
        const previousRatio =
          prev.myTeamId === teamId && prev.budget > 0
            ? (prev.wageBudget ?? initialWageBudget(prev.budget)) / prev.budget
            : 0.2;
        const wageBudget = wageAllocation(totalBudget, previousRatio);

        set({
          myTeamId: teamId,
          rosterIds,
          squad: defaultSquad,
          loanedPlayers: shouldReset ? {} : prev.loanedPlayers,
          budget: totalBudget,
          wageBill,
          wageBudget,
        });
      },

      hydrateMyTeam: () => {
        const { myTeamId, rosterIds } = get();
        if (!myTeamId) return;

        const team = teamById(myTeamId);
        const currentRosterIds =
          rosterIds.length > 0 ? rosterIds : squadForTeam(team.id).map((p) => String(p.ID));
        const state = get();
        const wageBill = getClubWageBill(myTeamId);

        // En el modelo actual `budget` es el presupuesto TOTAL. La masa salarial
        // real (`wageBill`) nunca aumenta artificialmente ese presupuesto.
        // Las partidas nuevas/actualizadas conservan el total directamente.
        const totalBudget = Math.max(0, Math.round(state.budget || INITIAL_BUDGET));
        const ratio =
          state.budget > 0
            ? (state.wageBudget || totalBudget * 0.2) / Math.max(1, state.budget)
            : 0.2;
        const wageBudget = wageAllocation(totalBudget, ratio);

        set({
          rosterIds: currentRosterIds,
          squad: syncSquadFromRoster(currentRosterIds),
          budget: totalBudget,
          wageBill,
          wageBudget,
        });
      },

      clear: () => {
        syncPlayerAgesForDate(GAME_START_DATE);
        set({
          squad: [],

          rosterIds: [],
          loanedPlayers: {},
          clubOverrides: {},

          myTeamId: null,

          budget: INITIAL_BUDGET,
          wageBudget: initialWageBudget(INITIAL_BUDGET),
          wageBill: 0,

          currentDate: GAME_START_DATE,

          fixtures: [],

          pendingUserMatch: null,

          lastUserMatchResult: null,

          dismissedMatchIds: [],
          stats: {},
        });
      },

      resetAllStats: () => set({ stats: {} }),

      resetBudget: () => {
        const state = get();
        const team = state.myTeamId ? teamById(state.myTeamId) : null;
        const baseTotal = team
          ? teamInitialBudget((team.att + team.mid + team.def) / 3, team.league, team.id)
          : INITIAL_BUDGET;
        const wageBill = state.myTeamId ? getClubWageBill(state.myTeamId) : 0;
        const total = Math.max(0, Math.round(baseTotal));
        set({
          budget: total,
          wageBill,
          wageBudget: wageAllocation(total, 0.2),
        });
      },

      spendBudget: (cost) => {
        const state = get();
        const amount = Math.max(0, Math.round(cost));
        if (amount <= 0 || state.budget < amount) return false;

        const total = Math.max(0, state.budget - amount);
        const ratio =
          state.budget > 0
            ? (state.wageBudget || state.budget * 0.2) / Math.max(1, state.budget)
            : 0.2;
        set({
          budget: total,
          wageBudget: wageAllocation(total, ratio),
        });
        return true;
      },

      setWageBudget: (value) => {
        const state = get();
        const total = Math.max(0, Math.round(state.budget || 0));
        const requestedRatio = total > 0 ? Math.round(value) / total : 0.2;
        const wageBill = state.myTeamId ? getClubWageBill(state.myTeamId) : state.wageBill;
        set({
          budget: total,
          wageBudget: wageAllocation(total, requestedRatio),
          wageBill,
        });
      },

      syncWageStateFromMarket: () => {
        const state = get();
        if (!state.myTeamId) return;
        const bill = getClubWageBill(state.myTeamId);
        const total = Math.max(0, Math.round(state.budget || 0));
        const ratio =
          total > 0
            ? (state.wageBudget || total * 0.2) / Math.max(1, state.budget || total)
            : 0.2;
        set({
          wageBill: bill,
          wageBudget: wageAllocation(total, ratio),
          budget: total,
        });
      },

      renewPlayerContract: (input) => {
        const state = get();
        if (!state.myTeamId) {
          return {
            playerId: input.playerId,
            playerName: "Jugador",
            clubId: "",
            renewed: false,
            accepted: false,
            wage: input.wage,
            years: input.years,
            releaseClause: input.releaseClause,
            signingBonus: input.signingBonus,
            previousWage: 0,
            message: "No hay equipo seleccionado.",
          };
        }
        const result = renewUserPlayer({ ...input, clubId: state.myTeamId });
        if (result.renewed) {
          const rosterIds = [...state.rosterIds];
          set({
            wageBill: getClubWageBill(state.myTeamId),
            squad: syncSquadFromRoster(rosterIds),
          });
          syncWageBill(state.myTeamId);
          get().syncWageStateFromMarket();
          void saveTransferSystem();
        }
        return result;
      },

      isInMyRoster: (playerId) => get().rosterIds.includes(playerId),

      buyPlayer: (playerId, cost) => {
        const state = get();

        if (!isMarketOpenForIso(state.currentDate)) {
          return {
            ok: false,

            reason:
              "El mercado de fichajes está cerrado. Avanza el calendario a una ventana de mercado.",
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
        // El mundo tiene que enterarse: el jugador deja su club y pasa al tuyo.
        setPlayerClub(playerId, state.myTeamId);

        set({
          clubOverrides: { ...getClubOverrides() },

          budget: state.budget - cost,
          wageBill: getClubWageBill(state.myTeamId),

          rosterIds,

          squad: syncSquadFromRoster(rosterIds),
        });

        return { ok: true };
      },

      applyMarketMoves: (moves) => {
        if (!moves.length) return;
        for (const move of moves) setPlayerClub(move.playerId, move.toClubId);
        set({ clubOverrides: { ...getClubOverrides() } });
      },

      addLoanedPlayer: (playerId, fromClubId, endDate) => {
        const state = get();
        if (!state.myTeamId) return { ok: false, reason: "No hay equipo seleccionado." };
        if (state.rosterIds.includes(playerId)) {
          return { ok: false, reason: "El jugador ya está en tu plantilla." };
        }
        const rosterIds = [...state.rosterIds, playerId];
        set({
          rosterIds,
          loanedPlayers: {
            ...state.loanedPlayers,
            [playerId]: { fromClubId, endDate },
          },
          squad: syncSquadFromRoster(rosterIds),
        });
        return { ok: true };
      },

      removeLoanedPlayer: (playerId) => {
        const state = get();
        if (!state.loanedPlayers[playerId]) return;
        const rosterIds = state.rosterIds.filter((id) => id !== playerId);
        const nextLoans = { ...state.loanedPlayers };
        delete nextLoans[playerId];
        set({
          rosterIds,
          loanedPlayers: nextLoans,
          squad: syncSquadFromRoster(rosterIds),
        });
      },

      isLoanedPlayer: (playerId) => !!get().loanedPlayers[playerId],

      sellPlayer: (playerId, price) => {
        const state = get();

        if (!isMarketOpenForIso(state.currentDate)) {
          return {
            ok: false,

            reason:
              "El mercado de fichajes está cerrado. Avanza el calendario a una ventana de mercado.",
          };
        }

        if (!state.myTeamId) {
          return { ok: false, reason: "No hay equipo seleccionado." };
        }

        if (!state.rosterIds.includes(playerId)) {
          return { ok: false, reason: "El jugador no está en tu plantilla." };
        }

        if (state.loanedPlayers[playerId]) {
          return {
            ok: false,
            reason: "Un jugador cedido no se puede vender: debe volver a su club de origen.",
          };
        }

        if (state.rosterIds.length <= 11) {
          return {
            ok: false,

            reason: "Debes mantener al menos 11 jugadores en la plantilla.",
          };
        }

        const rosterIds = state.rosterIds.filter((id) => id !== playerId);
        // Si el motor de mercado ya ha colocado al jugador en su nuevo club se
        // respeta; si la venta se hace fuera del mercado, queda sin equipo.
        if (clubOfPlayer(playerId) === state.myTeamId) setPlayerClub(playerId, null);

        const nextWageBill = getClubWageBill(state.myTeamId);
        // Las ventas del mercado ya han actualizado la caja a través de
        // BudgetManager.registerSale(). `sellPlayer()` solo reconcilia la
        // plantilla; no vuelve a sumar el salario liberado ni la venta.
        // Esto evita duplicar el ahorro salarial cuando el motor cierra una
        // negociación y la UI sincroniza la plantilla inmediatamente.
        const nextTotal = Math.max(0, Math.round(state.budget));
        const ratio =
          nextTotal > 0
            ? (state.wageBudget || nextTotal * 0.20) / Math.max(1, state.budget)
            : 0.20;

        set({
          clubOverrides: { ...getClubOverrides() },
          budget: nextTotal,
          wageBill: nextWageBill,
          wageBudget: wageAllocation(nextTotal, ratio),
          rosterIds,
          squad: syncSquadFromRoster(rosterIds),
        });

        return { ok: true };
      },

      searchMarket: ({ search, position, limit = 100 }) => {
        syncPlayerAgesForDate(get().currentDate);
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

      getRawPlayers: () => {
        syncPlayerAgesForDate(usePlayersStore.getState().currentDate);
        return RAW_PLAYERS;
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

            yellowCards: 0,

            redCards: 0,

            accumulatedYellowCards: 0,
            energy: Math.max(0, Math.min(100, Number((p as any).energy ?? STAMINA_START))),
            energyLastUpdatedDate: GAME_START_DATE,
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

        const squad = squadForTeam(team.id);

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

        // El club real manda: primero la plantilla del usuario, después los
        // traspasos ya cerrados (CLUB_OVERRIDES) y sólo al final el club que
        // traía el JSON base. Sin esto, un jugador fichado por otro club
        // seguía saliendo con el escudo de su equipo anterior en alineaciones
        // y clasificaciones individuales.
        const overriddenClub = clubOfPlayer(playerId);
        const teamIdOverride =
          myTeamId && rosterIds.includes(playerId) ? myTeamId : (overriddenClub ?? undefined);

        // La energía física persistente es exclusiva de los jugadores que
        // pertenecen a la plantilla del usuario. No inferimos esto solo por
        // `teamIdOverride`: un movimiento/traspaso legado podría dejar un
        // clubOverride apuntando temporalmente al equipo del usuario y hacer
        // que un jugador CPU arrastre energía de una jornada anterior.
        // Los equipos CPU empiezan SIEMPRE cada partido con 100 y su desgaste
        // solo existe dentro de la simulación de ese encuentro.
        const isUserControlledPlayer = !!myTeamId && rosterIds.includes(playerId);
        const playerForGame = fcToPlayer(fc, stats, teamIdOverride);
        if (!isUserControlledPlayer) {
          playerForGame.energy = STAMINA_START;
          playerForGame.energyLastUpdatedDate = get().currentDate || GAME_START_DATE;
        }

        return playerForGame;
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

          .sort((a, b) => posOrder[a.position] - posOrder[b.position] || b.rating - a.rating);
      },

      getSimXI: (teamId, lineupIds, leagueMatchday) => {
        const currentDate = get().currentDate;
        const unavailable = new Set(
          get()
            .getSimSquad(teamId)
            .filter((p) => isPlayerInjuredAtDate(p, currentDate, leagueMatchday))
            .map((p) => p.id),
        );

        const xi = lineupIds

          .map((id) => get().getSimPlayer(id))

          .filter((p): p is Player => !!p && p.teamId === teamId && !unavailable.has(p.id));

        return xi.slice(0, 11);
      },

      setTeamMatchEnergy: (teamId, energyByPlayer, matchDate) => {
        const currentUserTeamId = get().myTeamId;

        // Solo se persiste la energía del equipo controlado por el usuario.
        // La energía de los rivales es temporal y siempre vuelve a 100 al
        // comenzar su siguiente partido.
        if (!currentUserTeamId || teamId !== currentUserTeamId) return;

        const date = matchDate || get().currentDate || GAME_START_DATE;
        const squad = get().getSimSquad(teamId);
        if (!squad.length) return;
        const next = { ...get().stats };
        for (const player of squad) {
          const existing = next[player.id] ?? defaultStats();
          const rawEnergy = Number(energyByPlayer[player.id]);
          const energy = Number.isFinite(rawEnergy)
            ? Math.max(0, Math.min(100, rawEnergy))
            : STAMINA_START;
          next[player.id] = {
            ...existing,
            energy,
            energyLastUpdatedDate: date,
          };
        }
        set({ stats: next });
      },

      recoverPlayerEnergyToDate: (targetDate) => {
        const current = get();
        const targetMs = new Date(`${targetDate}T00:00:00Z`).getTime();
        if (!Number.isFinite(targetMs) || !current.myTeamId) return;

        // Solo recuperamos la energía persistente del equipo del usuario.
        // La CPU no arrastra fatiga entre partidos: sus jugadores siempre
        // vuelven a 100 al iniciar cada encuentro.
        const userSquadIds = new Set(
          current.getFcSquadByTeamId(current.myTeamId).map((p) => String(p.ID)),
        );
        const next = { ...current.stats };
        let changed = false;

        const diffDays = (from: string, to: string) => {
          const fromMs = new Date(`${from}T00:00:00Z`).getTime();
          if (!Number.isFinite(fromMs) || targetMs <= fromMs) return 0;
          return Math.floor((targetMs - fromMs) / 86400000);
        };

        for (const [playerId, raw] of Object.entries(next)) {
          if (!userSquadIds.has(String(playerId))) continue;

          const stats = raw ?? defaultStats();
          const energy = Number.isFinite(Number(stats.energy))
            ? Math.max(0, Math.min(100, Number(stats.energy)))
            : STAMINA_START;
          const lastDate = stats.energyLastUpdatedDate || current.currentDate || GAME_START_DATE;
          const days = diffDays(lastDate, targetDate);
          if (days <= 0 && stats.energy === energy && stats.energyLastUpdatedDate === lastDate) continue;

          const recovered = days > 0 ? recoverStamina(energy, days) : energy;
          if (recovered !== stats.energy || stats.energyLastUpdatedDate !== targetDate) {
            next[playerId] = {
              ...stats,
              energy: recovered,
              energyLastUpdatedDate: targetDate,
            };
            changed = true;
          }
        }

        if (changed) set({ stats: next });
      },

      recordAppearance: (playerId, competition, minutes = 90) => {
        const parsedMinutes = Number(minutes);
        const safeMinutes = Math.max(
          0,
          Math.min(120, Math.round(Number.isFinite(parsedMinutes) ? parsedMinutes : 90)),
        );

        mutatePlayerStat(get, set, playerId, (s) => {
          const isCup = competition === "cup";
          const isUcl = competition === "ucl";
          return {
            ...s,
            appearances: s.appearances + 1,
            cupAppearances: (s.cupAppearances ?? 0) + (isCup ? 1 : 0),
            uclAppearances: (s.uclAppearances ?? 0) + (isUcl ? 1 : 0),
          };
        });

        // Match minutes are supplied by the match engine when available.
        // Legacy callers without a value keep the old 90-minute fallback.
        mutatePlayerStat(get, set, playerId, (s) => {
          if (!s.dynamicStats) return s;
          const dynamic = {
            ...s.dynamicStats,
            // The legacy appearances counter is the source used by Team Stats;
            // mirror it here so the detail sheet cannot drift from that screen.
            seasonAppearances: s.appearances,
            seasonMinutes: s.dynamicStats.seasonMinutes + safeMinutes,
          };
          return { ...s, dynamicStats: withMonthlyDelta(dynamic, get().currentDate, { appearances: 1 }) };
        });
        return;
      },

      recordGoal: (playerId, competition) => {
        mutatePlayerStat(get, set, playerId, (s) => {
          const isCup = competition === "cup";
          const isUcl = competition === "ucl";
          return {
            ...s,
            goals: s.goals + 1,
            cupGoals: (s.cupGoals ?? 0) + (isCup ? 1 : 0),
            uclGoals: (s.uclGoals ?? 0) + (isUcl ? 1 : 0),
          };
        });

        // Update season + historical monthly stats.
        mutatePlayerStat(get, set, playerId, (s) => {
          if (!s.dynamicStats) return s;
          const dynamic = { ...s.dynamicStats, seasonGoals: s.goals };
          return { ...s, dynamicStats: withMonthlyDelta(dynamic, get().currentDate, { goals: 1 }) };
        });
        return;
      },

      recordAssist: (playerId, competition) => {
        mutatePlayerStat(get, set, playerId, (s) => {
          const isCup = competition === "cup";
          const isUcl = competition === "ucl";
          return {
            ...s,
            assists: s.assists + 1,
            cupAssists: (s.cupAssists ?? 0) + (isCup ? 1 : 0),
            uclAssists: (s.uclAssists ?? 0) + (isUcl ? 1 : 0),
          };
        });

        // Update season + historical monthly stats.
        mutatePlayerStat(get, set, playerId, (s) => {
          if (!s.dynamicStats) return s;
          const dynamic = { ...s.dynamicStats, seasonAssists: s.assists };
          return { ...s, dynamicStats: withMonthlyDelta(dynamic, get().currentDate, { assists: 1 }) };
        });
        return;
      },

      unrecordGoal: (playerId, competition) => {
        const dec = (n: number) => Math.max(0, n - 1);
        mutatePlayerStat(get, set, playerId, (s) => {
          const isCup = competition === "cup";
          const isUcl = competition === "ucl";
          return {
            ...s,
            goals: dec(s.goals),
            cupGoals: isCup ? dec(s.cupGoals ?? 0) : (s.cupGoals ?? 0),
            uclGoals: isUcl ? dec(s.uclGoals ?? 0) : (s.uclGoals ?? 0),
            dynamicStats: s.dynamicStats
              ? { ...s.dynamicStats, seasonGoals: dec(s.dynamicStats.seasonGoals) }
              : s.dynamicStats,
          };
        });
      },

      unrecordAssist: (playerId, competition) => {
        const dec = (n: number) => Math.max(0, n - 1);
        mutatePlayerStat(get, set, playerId, (s) => {
          const isCup = competition === "cup";
          const isUcl = competition === "ucl";
          return {
            ...s,
            assists: dec(s.assists),
            cupAssists: isCup ? dec(s.cupAssists ?? 0) : (s.cupAssists ?? 0),
            uclAssists: isUcl ? dec(s.uclAssists ?? 0) : (s.uclAssists ?? 0),
            dynamicStats: s.dynamicStats
              ? { ...s.dynamicStats, seasonAssists: dec(s.dynamicStats.seasonAssists) }
              : s.dynamicStats,
          };
        });
      },

      recordCleanSheet: (playerId, competition) => {
        mutatePlayerStat(get, set, playerId, (s) => {
          const isCup = competition === "cup";
          const isUcl = competition === "ucl";
          return {
            ...s,
            cleanSheets: (s.cleanSheets ?? 0) + 1,
            cupCleanSheets: (s.cupCleanSheets ?? 0) + (isCup ? 1 : 0),
            uclCleanSheets: (s.uclCleanSheets ?? 0) + (isUcl ? 1 : 0),
          };
        });

        // Update season + historical monthly stats.
        mutatePlayerStat(get, set, playerId, (s) => {
          if (!s.dynamicStats) return s;
          const dynamic = { ...s.dynamicStats, seasonCleanSheets: s.cleanSheets };
          return { ...s, dynamicStats: withMonthlyDelta(dynamic, get().currentDate, { cleanSheets: 1 }) };
        });
        return;
      },
      recordMatchRating: (playerId, rating) => {
        const safeRating = Math.max(1, Math.min(10, Number(rating) || 6));

        // Feeds the 1-10 match rating into the player's form history and the
        // season/monthly averages used by awards.
        mutatePlayerStat(get, set, playerId, (s) => {
          const history = [...(s.formHistory ?? []), safeRating];
          if (!s.dynamicStats) return { ...s, formHistory: history.slice(-6) };

          const dynamicHistory = [...(s.dynamicStats.formHistory ?? []), safeRating];
          const previousCount = s.dynamicStats.seasonRatingCount ?? 0;
          const previousTotal = s.dynamicStats.seasonRatingTotal ?? 0;
          const seasonRatingCount = previousCount + 1;
          const seasonRatingTotal = previousTotal + safeRating;
          const dynamic = {
            ...s.dynamicStats,
            formHistory: dynamicHistory.slice(-10),
            seasonRatingCount,
            seasonRatingTotal,
            seasonAverageRating: seasonRatingTotal / seasonRatingCount,
          };

          return {
            ...s,
            formHistory: history.slice(-6),
            dynamicStats: withMonthlyDelta(dynamic, get().currentDate, { rating: safeRating }),
          };
        });
      },
      recordMotm: (playerId, competition) => {
        mutatePlayerStat(get, set, playerId, (s) => {
          const isCup = competition === "cup";
          const isUcl = competition === "ucl";
          return {
            ...s,
            motm: (s.motm ?? 0) + 1,
            cupMotm: (s.cupMotm ?? 0) + (isCup ? 1 : 0),
            uclMotm: (s.uclMotm ?? 0) + (isUcl ? 1 : 0),
          };
        });

        // Update season + historical monthly stats.
        mutatePlayerStat(get, set, playerId, (s) => {
          if (!s.dynamicStats) return s;
          const dynamic = { ...s.dynamicStats, seasonMVPs: s.motm };
          return { ...s, dynamicStats: withMonthlyDelta(dynamic, get().currentDate, { mvpCount: 1 }) };
        });
        return;
      },

      recordYellowCard: (playerId) => {
        mutatePlayerStat(get, set, playerId, (s) => ({ ...s, yellowCards: s.yellowCards + 1 }));
        return;

        const next = { ...get().stats };

        const s = next[playerId] ?? defaultStats();

        next[playerId] = { ...s, yellowCards: s.yellowCards + 1 };

        set({ stats: next });
      },

      recordRedCard: (playerId) => {
        mutatePlayerStat(get, set, playerId, (s) => ({ ...s, redCards: s.redCards + 1 }));
        return;

        const next = { ...get().stats };

        const s = next[playerId] ?? defaultStats();

        next[playerId] = { ...s, redCards: s.redCards + 1 };

        set({ stats: next });
      },

      incrementAccumulatedYellowCards: (playerId) => {
        mutatePlayerStat(get, set, playerId, (s) => ({
          ...s,
          accumulatedYellowCards: s.accumulatedYellowCards + 1,
        }));
        return;

        const next = { ...get().stats };

        const s = next[playerId] ?? defaultStats();

        next[playerId] = { ...s, accumulatedYellowCards: s.accumulatedYellowCards + 1 };

        set({ stats: next });
      },

      resetAccumulatedYellowCards: (playerId) => {
        mutatePlayerStat(get, set, playerId, (s) => ({ ...s, accumulatedYellowCards: 0 }));
        return;

        const next = { ...get().stats };

        const s = next[playerId] ?? defaultStats();

        next[playerId] = { ...s, accumulatedYellowCards: 0 };

        set({ stats: next });
      },

      recordInjury: (playerId, injuredUntil, reason, meta) => {
        mutatePlayerStat(get, set, playerId, (s) => ({
          ...s,
          injuredUntil,
          injuryReason: reason,
          injuredUntilDate: meta?.untilDate ?? s.injuredUntilDate,
          injuryStartDate: meta?.startDate ?? s.injuryStartDate,
          injuryDurationDays: meta?.durationDays ?? s.injuryDurationDays,
          injuryType: meta?.injuryType ?? s.injuryType,
          injuryArea: meta?.injuryArea ?? s.injuryArea,
        }));
        return;

        const next = { ...get().stats };

        const s = next[playerId] ?? defaultStats();

        next[playerId] = { ...s, injuredUntil, injuryReason: reason };

        set({ stats: next });
      },
    }),

    {
      name: "fcsim:players:v1",

      // Esta copia del estado de jugadores (plantilla, estadísticas de la
      // temporada) NO se escribe en `localStorage`: pesaba más de 2 MB y era
      // una copia duplicada de lo que ya guarda la ranura de la partida
      // (`fcsim:save:v2:{id}`, que ahora vive en IndexedDB y es la fuente de
      // verdad). Además, el propio juego borraba esta clave en cada arranque
      // y al cargar una partida, así que sólo consumía cuota. Se mantiene
      // como caché de sesión en memoria para no cambiar el comportamiento.
      storage: createJSONStorage(() => {
        const mem = new Map<string, string>();
        // Limpia cualquier resto de la versión anterior que siguiera
        // ocupando cuota en `localStorage`.
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem("fcsim:players:v1");
          } catch {
            /* si falla no es crítico */
          }
        }
        return {
          length: 0,
          key: () => null,
          clear: () => mem.clear(),
          getItem: (k: string) => mem.get(k) ?? null,
          removeItem: (k: string) => {
            mem.delete(k);
          },
          setItem: (k: string, v: string) => {
            mem.set(k, v);
          },
        } as unknown as Storage;
      }),


      merge: (persisted, current) => {
        const saved = (persisted as Partial<PlayersState>) ?? {};
        const overrides = saved.clubOverrides ?? {};
        const myTeamId = saved.myTeamId ?? null;
        // Migración de partidas creadas con el antiguo emparejamiento parcial:
        // conserva la plantilla base correcta y todos los fichajes registrados,
        // pero elimina jugadores de clubes homónimos añadidos por error.
        const rosterIds = (saved.rosterIds ?? []).filter((playerId) => {
          if (!myTeamId) return true;
          const override = overrides[playerId];
          if (override !== undefined) return override === myTeamId;
          const raw = FC_BY_ID.get(playerId);
          return raw ? baseClubId(raw) === myTeamId : false;
        });

        // Migrate old saves that have the legacy counters but no dynamic
        // season block yet. This repairs the first matches played before the
        // dynamic-statistics system was initialised for that player.
        const restoredStats = { ...(saved.stats ?? {}) } as Record<string, PlayerStats>;
        for (const [playerId, legacy] of Object.entries(restoredStats)) {
          if (legacy.dynamicStats) continue;
          const fc = FC_BY_ID.get(String(playerId));
          const dynamic = initializeDynamicStats(Number(fc?.OVR) || 70);
          dynamic.seasonGoals = Number(legacy.goals) || 0;
          dynamic.seasonAssists = Number(legacy.assists) || 0;
          dynamic.seasonAppearances = Number(legacy.appearances) || 0;
          dynamic.seasonCleanSheets = Number(legacy.cleanSheets) || 0;
          dynamic.seasonMVPs = Number(legacy.motm) || 0;
          restoredStats[playerId] = { ...legacy, dynamicStats: dynamic };
        }

        // El registro central de plantillas vive fuera de React: hay que
        // rehidratarlo antes de que nadie pida una plantilla.
        setClubOverrides(overrides);
        const restoredDate = (persisted as Partial<PlayersState>)?.currentDate ?? GAME_START_DATE;
        syncPlayerAgesForDate(restoredDate);
        return {
          ...current,

          ...saved,

          stats: restoredStats,

          wageBudget: saved.wageBudget ?? Math.round((saved.budget ?? INITIAL_BUDGET) * 0.68),
          wageBill: saved.wageBill ?? 0,

          rosterIds,

          squad: syncSquadFromRoster(rosterIds),

          currentDate: restoredDate,

          fixtures: (persisted as Partial<PlayersState>)?.fixtures ?? [],
        };
      },

      partialize: (s) =>
        statsBatchDepth > 0
          ? {
              myTeamId: s.myTeamId,
              rosterIds: s.rosterIds,
              clubOverrides: s.clubOverrides,

              budget: s.budget,
              wageBudget: s.wageBudget,
              wageBill: s.wageBill,
              currentDate: s.currentDate,
              dismissedMatchIds: s.dismissedMatchIds,
            }
          : {
              stats: s.stats,

              myTeamId: s.myTeamId,

              rosterIds: s.rosterIds,
              clubOverrides: s.clubOverrides,

              budget: s.budget,
              wageBudget: s.wageBudget,
              wageBill: s.wageBill,

              currentDate: s.currentDate,

              fixtures: s.fixtures,

              dismissedMatchIds: s.dismissedMatchIds,
            },
    },
  ),
);

/** @deprecated Use usePlayersStore — kept for existing imports */

export const useUserTeam = usePlayersStore;

export function playersStoreInit() {
  usePlayersStore.getState().init();
}

export function useCurrentDate(): string {
  return usePlayersStore((s) => s.currentDate);
}

export function selectTopScorers(
  leagueFilter?: LeagueId,

  limit = 30,

  competition: "all" | "league" | "cup" | "ucl" = "all",

  cupCountry?: string,
): Player[] {
  const store = usePlayersStore.getState();

  store.init();

  const out: Player[] = [];

  for (const [id, st] of Object.entries(store.stats)) {
    const goals =
      competition === "cup"
        ? (st.cupGoals ?? 0)
        : competition === "ucl"
          ? (st.uclGoals ?? 0)
          : competition === "league"
            ? st.goals - (st.cupGoals ?? 0) - (st.uclGoals ?? 0)
            : st.goals;

    if (goals <= 0) continue;

    const p = store.getSimPlayer(id);

    if (!p) continue;

    if (leagueFilter && teamById(p.teamId).league !== leagueFilter) continue;

    if (competition === "cup" && cupCountry) {
      const teamCountry = LEAGUES[teamById(p.teamId).league as LeagueId]?.country;

      if (teamCountry !== cupCountry) continue;
    }

    const assistsOut =
      competition === "cup"
        ? (st.cupAssists ?? 0)
        : competition === "ucl"
          ? (st.uclAssists ?? 0)
          : competition === "league"
            ? st.assists - (st.cupAssists ?? 0) - (st.uclAssists ?? 0)
            : st.assists;
    const apps =
      competition === "cup"
        ? (st.cupAppearances ?? 0)
        : competition === "ucl"
          ? (st.uclAppearances ?? 0)
          : competition === "league"
            ? st.appearances - (st.cupAppearances ?? 0) - (st.uclAppearances ?? 0)
            : st.appearances;
    out.push({ ...p, goals, assists: assistsOut, appearances: apps });
  }

  return out

    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)

    .slice(0, limit);
}

export function selectTopAssisters(
  leagueFilter?: LeagueId,

  limit = 30,

  competition: "all" | "league" | "cup" | "ucl" = "all",

  cupCountry?: string,
): Player[] {
  const store = usePlayersStore.getState();

  store.init();

  const out: Player[] = [];

  for (const [id, st] of Object.entries(store.stats)) {
    const assists =
      competition === "cup"
        ? (st.cupAssists ?? 0)
        : competition === "ucl"
          ? (st.uclAssists ?? 0)
          : competition === "league"
            ? st.assists - (st.cupAssists ?? 0) - (st.uclAssists ?? 0)
            : st.assists;

    if (assists <= 0) continue;

    const p = store.getSimPlayer(id);

    if (!p) continue;

    if (leagueFilter && teamById(p.teamId).league !== leagueFilter) continue;

    if (competition === "cup" && cupCountry) {
      const teamCountry = LEAGUES[teamById(p.teamId).league as LeagueId]?.country;

      if (teamCountry !== cupCountry) continue;
    }

    const goalsOut =
      competition === "cup"
        ? (st.cupGoals ?? 0)
        : competition === "ucl"
          ? (st.uclGoals ?? 0)
          : competition === "league"
            ? st.goals - (st.cupGoals ?? 0) - (st.uclGoals ?? 0)
            : st.goals;
    const apps2 =
      competition === "cup"
        ? (st.cupAppearances ?? 0)
        : competition === "ucl"
          ? (st.uclAppearances ?? 0)
          : competition === "league"
            ? st.appearances - (st.cupAppearances ?? 0) - (st.uclAppearances ?? 0)
            : st.appearances;
    out.push({ ...p, goals: goalsOut, assists, appearances: apps2 });
  }

  return out

    .sort((a, b) => b.assists - a.assists || b.goals - a.goals)

    .slice(0, limit);
}

export function selectTopYellowCards(
  leagueFilter?: LeagueId | "big5",

  limit = 30,
): (Player & { yellowCards: number; redCards: number })[] {
  const store = usePlayersStore.getState();

  store.init();

  const out: (Player & { yellowCards: number; redCards: number })[] = [];

  for (const [id, st] of Object.entries(store.stats)) {
    if ((st.yellowCards ?? 0) <= 0) continue;

    const p = store.getSimPlayer(id);

    if (!p) continue;

    if (leagueFilter) {
      const team = teamById(p.teamId);
      if (!team) continue;
      const playerLeague = team.league;
      if (leagueFilter === "big5") {
        if (!BIG5_LEAGUES.includes(playerLeague as LeagueId)) continue;
      } else if (playerLeague !== leagueFilter) {
        continue;
      }
    }

    out.push({ ...p, yellowCards: st.yellowCards ?? 0, redCards: st.redCards ?? 0 });
  }

  return out
    .sort((a, b) => b.yellowCards - a.yellowCards || b.redCards - a.redCards)
    .slice(0, limit);
}

export function selectTopRedCards(
  leagueFilter?: LeagueId | "big5",

  limit = 30,
): (Player & { yellowCards: number; redCards: number })[] {
  const store = usePlayersStore.getState();

  store.init();

  const out: (Player & { yellowCards: number; redCards: number })[] = [];

  for (const [id, st] of Object.entries(store.stats)) {
    if ((st.redCards ?? 0) <= 0) continue;

    const p = store.getSimPlayer(id);

    if (!p) continue;

    if (leagueFilter) {
      const team = teamById(p.teamId);
      if (!team) continue;
      const playerLeague = team.league;
      if (leagueFilter === "big5") {
        if (!BIG5_LEAGUES.includes(playerLeague as LeagueId)) continue;
      } else if (playerLeague !== leagueFilter) {
        continue;
      }
    }

    out.push({ ...p, yellowCards: st.yellowCards ?? 0, redCards: st.redCards ?? 0 });
  }

  return out
    .sort((a, b) => b.redCards - a.redCards || b.yellowCards - a.yellowCards)
    .slice(0, limit);
}

export function selectTopCleanSheets(
  leagueFilter?: LeagueId | "big5",
  limit = 30,
  competition: "all" | "league" | "cup" | "ucl" = "all",
): (Player & { cleanSheets: number })[] {
  const store = usePlayersStore.getState();
  store.init();
  const out: (Player & { cleanSheets: number })[] = [];
  for (const [id, st] of Object.entries(store.stats)) {
    const cs =
      competition === "cup"
        ? (st.cupCleanSheets ?? 0)
        : competition === "ucl"
          ? (st.uclCleanSheets ?? 0)
          : competition === "league"
            ? (st.cleanSheets ?? 0) - (st.cupCleanSheets ?? 0) - (st.uclCleanSheets ?? 0)
            : (st.cleanSheets ?? 0);
    if (cs <= 0) continue;
    const p = store.getSimPlayer(id);
    if (!p) continue;
    if (p.position !== "POR" && p.position !== "GK") continue;
    if (leagueFilter) {
      const team = teamById(p.teamId);
      if (!team) continue;
      const playerLeague = team.league;
      if (leagueFilter === "big5") {
        if (!BIG5_LEAGUES.includes(playerLeague as LeagueId)) continue;
      } else if (playerLeague !== leagueFilter) {
        continue;
      }
    }
    out.push({ ...p, cleanSheets: cs });
  }
  return out.sort((a, b) => b.cleanSheets - a.cleanSheets).slice(0, limit);
}

export function selectTopMotm(
  leagueFilter?: LeagueId | "big5",
  limit = 30,
  competition: "all" | "league" | "cup" | "ucl" = "all",
): (Player & { motm: number })[] {
  const store = usePlayersStore.getState();
  store.init();
  const out: (Player & { motm: number })[] = [];
  for (const [id, st] of Object.entries(store.stats)) {
    const m =
      competition === "cup"
        ? (st.cupMotm ?? 0)
        : competition === "ucl"
          ? (st.uclMotm ?? 0)
          : competition === "league"
            ? (st.motm ?? 0) - (st.cupMotm ?? 0) - (st.uclMotm ?? 0)
            : (st.motm ?? 0);
    if (m <= 0) continue;
    const p = store.getSimPlayer(id);
    if (!p) continue;
    if (leagueFilter) {
      const team = teamById(p.teamId);
      if (!team) continue;
      const playerLeague = team.league;
      if (leagueFilter === "big5") {
        if (!BIG5_LEAGUES.includes(playerLeague as LeagueId)) continue;
      } else if (playerLeague !== leagueFilter) {
        continue;
      }
    }
    out.push({ ...p, motm: m });
  }
  return out.sort((a, b) => b.motm - a.motm).slice(0, limit);
}

export function isPlayerInjuredAtDate(
  player: Pick<Player, "injuredUntil" | "injuredUntilDate">,
  currentDate: string,
  fallbackMatchday?: number,
): boolean {
  if (player.injuredUntilDate) return currentDate < player.injuredUntilDate;
  return typeof fallbackMatchday === "number" ? player.injuredUntil > fallbackMatchday : player.injuredUntil > 0;
}

export function injuryRemainingDays(
  player: Pick<Player, "injuredUntil" | "injuredUntilDate">,
  currentDate: string,
  fallbackMatchday?: number,
): number {
  if (player.injuredUntilDate) {
    const start = new Date(`${currentDate}T00:00:00Z`).getTime();
    const end = new Date(`${player.injuredUntilDate}T00:00:00Z`).getTime();
    return Math.max(0, Math.ceil((end - start) / 86400000));
  }
  if (typeof fallbackMatchday === "number") {
    return Math.max(0, (player.injuredUntil ?? 0) - fallbackMatchday) * 7;
  }
  return 0;
}

export function selectInjuredPlayers(
  currentDate: string,
  teamId?: string,
  matchdaysByLeague?: Record<LeagueId, number>,
): Player[] {
  const store = usePlayersStore.getState();

  store.init();

  const out: Player[] = [];

  for (const [id] of Object.entries(store.stats)) {
    const p = store.getSimPlayer(id);
    if (!p) continue;

    const league = teamById(p.teamId)?.league;
    const fallbackMatchday = league && matchdaysByLeague ? matchdaysByLeague[league] : undefined;
    if (!isPlayerInjuredAtDate(p, currentDate, fallbackMatchday)) continue;

    if (teamId && String(p.teamId) !== String(teamId)) continue;

    out.push(p);
  }

  return out.sort((a, b) => {
    const aLeague = teamById(a.teamId)?.league;
    const bLeague = teamById(b.teamId)?.league;
    const aDays = injuryRemainingDays(a, currentDate, aLeague ? matchdaysByLeague?.[aLeague] : undefined);
    const bDays = injuryRemainingDays(b, currentDate, bLeague ? matchdaysByLeague?.[bLeague] : undefined);
    return aDays - bDays;
  });
}

export function buildDefaultLineups(): Record<string, string[]> {
  const store = usePlayersStore.getState();

  store.init();

  const lineups: Record<string, string[]> = {};

  for (const t of getAllTeams()) {
    const squad = store.getSimSquad(t.id);

    lineups[t.id] = defaultLineup(squad);
  }

  return lineups;
}

import { findTeamByName, getAllTeams, type Team } from "@/data/teams";
import { UCL_START, uclCalendarForSeason, uclStartForSeason, type UCLState } from "@/data/ucl";
import { inferSeasonStartYearFromDate, INITIAL_SEASON_START_YEAR } from "@/lib/season/calendarFactory";
import { getInitialEuropeanParticipants, getEuropeanParticipantsForSave, type EuropeanQualificationSave } from "@/lib/season/europeanQualification";

type EuropeanCompetitionId = "uel" | "uecl";

export type EuropeanCompetitionConfig = {
  id: EuropeanCompetitionId;
  name: string;
  shortName: string;
  route: "/europa-league" | "/conference-league";
  primary: string;
  secondary: string;
  accent: string;
  softAccent: string;
  flag: string;
  participants: string[];
};

// A few clubs are represented in the in-game database under a localized/legacy name.
const NAME_ALIASES: Record<string, string[]> = {
  Atalanta: ["Bergamo Calcio", "Atalanta"],
  Lazio: ["Latium", "Lazio"],
  Stuttgart: ["VfB Stuttgart", "Stuttgart"],
  "Eintracht Frankfurt": ["Frankfurt", "Eintracht Frankfurt"],
  Freiburg: ["SC Freiburg", "Freiburg"],
  Lille: ["LOSC Lille", "Lille"],
  Lyon: ["OL", "Olympique Lyon", "Lyon"],
  Nice: ["OGC Nice", "OGC Niza", "Nice"],
  Villarreal: ["Villarreal CF", "Villarreal"],
  "Real Betis": ["Real Betis", "Betis"],
  Benfica: ["SL Benfica", "Benfica"],
  Braga: ["SC Braga", "Braga"],
  Estoril: ["Estoril Praia", "Estoril"],
  Rennes: ["Stade Rennais FC", "Rennes"],
  "Çorum FK": ["Çorum Futbol Kulübü", "Çorum FK"],
  "AZ Alkmaar": ["AZ", "AZ Alkmaar"],
  "Universitatea Craiova": ["Univ. Craiova", "Universitatea Craiova"],
  "Universitatea Cluj": ["FC Univ. Cluj", "Universitatea Cluj"],
  Genk: ["KRC Genk", "Genk"],
  Anderlecht: ["RSC Anderlecht", "Anderlecht"],
  Mainz: ["1. FSV Mainz 05", "Mainz"],
  Hoffenheim: ["TSG Hoffenheim", "Hoffenheim"],
  "Werder Bremen": ["SV Werder Bremen", "Werder Bremen"],
  Celta: ["Celta", "RC Celta", "Celta de Vigo"],
  Sevilla: ["Sevilla FC", "Sevilla"],
  Valencia: ["Valencia CF", "Valencia"],
  "Casa Pia": ["Casa Pia AC", "Casa Pia"],
  "Sturm Graz": ["SK Sturm Graz", "Sturm Graz"],
  Djurgården: ["Djurgårdens IF", "Djurgården"],
  "SK Rapid": ["SK Rapid", "SK Rapid Wien", "Rapid Wien"],
  "FC Twente": ["FC Twente", "Twente"],
  "FC Utrecht": ["FC Utrecht", "Utrecht"],
  "sc Heerenveen": ["sc Heerenveen", "Heerenveen"],
  Raków: ["Raków", "Raków Częstochowa"],
  "Standard Lieja": ["Standard Liège", "Standard Lieja", "Standard de Liege"],
  "F.C. København": ["F.C. København", "FC København", "København"],
};


function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function resolveByName(name: string): string | null {
  const all = getAllTeams();
  const candidates = [name, ...(NAME_ALIASES[name] ?? [])];

  // 1) Primero buscamos coincidencias exactas en el registro real de equipos.
  for (const candidate of candidates) {
    const key = normalize(candidate);
    const exact = all.find((team) => normalize(team.name) === key || normalize(team.id) === key);
    if (exact) return exact.id;
  }

  // 2) Como segunda capa usamos el resolver central de clubes, que conoce los
  // alias históricos del dataset (p. ej. Rennes -> Stade Rennais FC).
  for (const candidate of candidates) {
    const resolved = findTeamByName(candidate);
    if (resolved) return resolved.id;
  }

  return null;
}

export function ensureEuropeanTeam(name: string): string {
  const resolved = resolveByName(name);
  if (!resolved) {
    throw new Error(`Equipo europeo sin plantilla/equipo real: ${name}`);
  }
  return resolved;
}

export function getEuropeanTeam(name: string): Team {
  const id = ensureEuropeanTeam(name);
  const existing = getAllTeams().find((team) => team.id === id);
  if (!existing) throw new Error(`Equipo europeo no encontrado en el registro: ${name}`);
  return existing;
}

/**
 * Compatibilidad con saves/código antiguo. Ya no inyecta clubes ficticios:
 * el registro europeo debe contener exclusivamente equipos reales.
 */
export function injectEuropeanPlaceholders(teams: Team[]): Team[] {
  return [...teams];
}

function buildParticipantIds(names: string[]): string[] {
  return names.map(ensureEuropeanTeam);
}

export const EUROPEAN_CONFIGS: Record<EuropeanCompetitionId, EuropeanCompetitionConfig> = {
  uel: {
    id: "uel",
    name: "UEFA Europa League",
    shortName: "Europa League",
    route: "/europa-league",
    primary: "#f97316",
    secondary: "#fb923c",
    accent: "orange",
    softAccent: "rgba(249,115,22,.16)",
    flag: "🟠",
    participants: getInitialEuropeanParticipants("uel"),
  },
  uecl: {
    id: "uecl",
    name: "UEFA Conference League",
    shortName: "Conference League",
    route: "/conference-league",
    primary: "#22c55e",
    secondary: "#4ade80",
    accent: "green",
    softAccent: "rgba(34,197,94,.16)",
    flag: "🟢",
    participants: getInitialEuropeanParticipants("uecl"),
  },
};

export const EUROPEAN_START = UCL_START; // Legacy 2026/27 alias; use uclStartForSeason(year) for dynamic dates.

function nextThursdayOffset(offset: number, seasonStartYear = INITIAL_SEASON_START_YEAR): number {
  const start = new Date(`${uclStartForSeason(seasonStartYear)}T00:00:00Z`);
  const date = new Date(start.getTime() + offset * 86400000);
  const day = date.getUTCDay();
  const delta = (4 - day + 7) % 7;
  return offset + (delta === 0 ? 7 : delta);
}

// Champions stays on Tuesday/Wednesday. Europa League and Conference League
// always use the Thursday of the same UEFA match week. 2026/27 stays byte-for-
// byte compatible; subsequent seasons derive weekdays from their real year.
export function europeanCalendar(seasonStartYear = INITIAL_SEASON_START_YEAR) {
  const champions = uclCalendarForSeason(seasonStartYear);
  const leagueDays = champions.leagueDay.map((offset) => nextThursdayOffset(offset, seasonStartYear));
  const playoffLeg1 = nextThursdayOffset(champions.playoffLeg1, seasonStartYear);
  const playoffLeg2 = nextThursdayOffset(champions.playoffLeg2, seasonStartYear);

  return {
    leagueDraw: nextThursdayOffset(champions.leagueDraw, seasonStartYear),
    leagueDay: leagueDays,
    playoffDraw: leagueDays[leagueDays.length - 1] + 2,
    playoffLeg1,
    playoffLeg2,
    knockoutDraw: playoffLeg2 + 2,
    r16Leg1: nextThursdayOffset(champions.r16Leg1, seasonStartYear),
    r16Leg2: nextThursdayOffset(champions.r16Leg2, seasonStartYear),
    qfLeg1: nextThursdayOffset(champions.qfLeg1, seasonStartYear),
    qfLeg2: nextThursdayOffset(champions.qfLeg2, seasonStartYear),
    sfLeg1: nextThursdayOffset(champions.sfLeg1, seasonStartYear),
    sfLeg2: nextThursdayOffset(champions.sfLeg2, seasonStartYear),
    final: nextThursdayOffset(champions.final, seasonStartYear),
  };
}

export type EuropeanStateKey = "uel" | "uecl";
export type EuropeanState = UCLState;

export function isEuropeanCompetition(value: unknown): value is EuropeanCompetitionId {
  return value === "uel" || value === "uecl";
}

export function europeanCalendarDate(offset: number, seasonStartYear = INITIAL_SEASON_START_YEAR): string {
  const start = new Date(`${uclStartForSeason(seasonStartYear)}T00:00:00Z`);
  return new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10);
}

export function teamIsInEuropeanCompetition(
  competition: EuropeanCompetitionId,
  teamId: string,
  save?: EuropeanQualificationSave,
): boolean {
  const participants = save
    ? getEuropeanParticipantsForSave(save, competition)
    : EUROPEAN_CONFIGS[competition].participants;
  return participants.includes(teamId);
}

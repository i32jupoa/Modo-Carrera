import { getAllTeams, teamById, type Team } from "@/data/teams";
import { UCL_CALENDAR, UCL_START, type UCLState } from "@/data/ucl";

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

const EUROPA_NAMES = [
  "Newcastle Utd", "Spurs", "Man Utd", "Atalanta", "AS Roma", "Lazio",
  "Stuttgart", "Eintracht Frankfurt", "Freiburg", "Lille", "Lyon", "Nice",
  "Real Sociedad", "Villarreal", "Real Betis", "Benfica", "Braga", "Estoril",
  "Trabzonspor", "Beşiktaş", "Çorum FK", "Ajax", "AZ Alkmaar", "N.E.C. Nimega",
  "Slavia Praha", "Sparta Praha", "Viktoria Plzeň", "Genk", "Anderlecht", "Standard Lieja",
  "Widzew Łódź", "Jagiellonia", "Górnik Zabrze", "F.C. København", "LASK", "Universitatea Craiova",
];

const CONFERENCE_NAMES = [
  "Aston Villa", "Brighton", "Crystal Palace", "Bologna", "Fiorentina", "Torino",
  "Rennes", "RC Lens", "Strasbourg", "Mainz", "Hoffenheim", "Werder Bremen",
  "Sevilla", "Celta", "Valencia", "FC Twente", "FC Utrecht", "sc Heerenveen",
  "Başakşehir", "Göztepe", "Konyaspor", "Arouca", "Casa Pia", "Nacional",
  "Lech Poznań", "Raków", "GKS Katowice", "Hearts", "Hibernian", "Sturm Graz",
  "SK Rapid", "Hammarby", "Djurgården", "Viking FK", "Universitatea Cluj", "KV Cortrijk",
];

// A few clubs are represented in the in-game database under a localized/legacy name.
const NAME_ALIASES: Record<string, string[]> = {
  Atalanta: ["Bergamo Calcio", "Atalanta"],
  Lazio: ["Latium", "Lazio"],
  Stuttgart: ["VfB Stuttgart", "Stuttgart"],
  "Eintracht Frankfurt": ["Frankfurt", "Eintracht Frankfurt"],
  Freiburg: ["SC Freiburg", "Freiburg"],
  Lille: ["LOSC Lille", "Lille"],
  Lyon: ["OL", "Lyon", "Olympique Lyon"],
  Nice: ["OGC Nice", "Nice", "OGC Niza"],
  Villarreal: ["Villarreal CF", "Villarreal"],
  "Real Betis": ["Real Betis", "Betis"],
  "Universitatea Craiova": ["Univ. Craiova", "Universitatea Craiova"],
  Mainz: ["1. FSV Mainz 05", "Mainz"],
  Hoffenheim: ["TSG Hoffenheim", "Hoffenheim"],
  "Werder Bremen": ["SV Werder Bremen", "Werder Bremen"],
  Celta: ["Celta", "RC Celta", "Celta de Vigo"],
  Sevilla: ["Sevilla FC", "Sevilla"],
  Valencia: ["Valencia CF", "Valencia"],
  "KV Cortrijk": ["KV Kortrijk", "KV Cortrijk"],
  "Casa Pia": ["Casa Pia AC", "Casa Pia"],
  "Sturm Graz": ["SK Sturm Graz", "Sturm Graz"],
  Djurgården: ["Djurgårdens IF", "Djurgården"],
  "SK Rapid": ["SK Rapid", "SK Rapid Wien", "Rapid Wien"],
  "FC Twente": ["FC Twente", "Twente"],
  "FC Utrecht": ["FC Utrecht", "Utrecht"],
  "sc Heerenveen": ["sc Heerenveen", "Heerenveen"],
  Raków: ["Raków", "Raków Częstochowa"],
  Genk: ["KRC Genk", "Genk"],
  "Standard Lieja": ["Standard Liège", "Standard Lieja", "Standard de Liege"],
  Anderlecht: ["RSC Anderlecht", "Anderlecht"],
  "LASK": ["LASK"],
  "F.C. København": ["F.C. København", "FC København", "København"],
  "Çorum FK": ["Çorum FK", "Çorum Futbol Kulübü"],
};

const PLACEHOLDER_TEAMS: Record<string, Omit<Team, "id">> = {
  "Benfica": { name: "Benfica", short: "SLB", city: "Lisboa", league: "ligaportugal", att: 78, mid: 78, def: 76, stars: [], color: "#e60012" },
  "Braga": { name: "Braga", short: "SCB", city: "Braga", league: "ligaportugal", att: 72, mid: 72, def: 70, stars: [], color: "#d71920" },
  "Estoril": { name: "Estoril", short: "EST", city: "Estoril", league: "ligaportugal", att: 66, mid: 67, def: 65, stars: [], color: "#f5d000" },
  "Rennes": { name: "Rennes", short: "REN", city: "Rennes", league: "ligue1", att: 73, mid: 73, def: 71, stars: [], color: "#e11d48" },  "AZ Alkmaar": {
    name: "AZ Alkmaar", short: "AZ", city: "Alkmaar", league: "eredivisie", att: 73, mid: 73, def: 72,
    stars: [], color: "#D2122E",
  },
  "Universitatea Cluj": {
    name: "Universitatea Cluj", short: "UCL", city: "Cluj-Napoca", league: "superliga", att: 68, mid: 68, def: 67,
    stars: [], color: "#111827",
  },
  "KV Cortrijk": {
    name: "KV Cortrijk", short: "KOR", city: "Kortrijk", league: "1aproleague", att: 67, mid: 67, def: 66,
    stars: [], color: "#E30613",
  },
};

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function resolveByName(name: string): string | null {
  const all = getAllTeams();
  const candidates = [name, ...(NAME_ALIASES[name] ?? [])];
  for (const candidate of candidates) {
    const key = normalize(candidate);
    const exact = all.find((team) => normalize(team.name) === key || normalize(team.id) === key);
    if (exact) return exact.id;
  }
  return null;
}

function ensurePlaceholder(name: string): string | null {
  const existing = resolveByName(name);
  if (existing) return existing;
  const placeholder = PLACEHOLDER_TEAMS[name];
  return placeholder ? normalize(name) : null;
}

export function ensureEuropeanTeam(name: string): string {
  const resolved = resolveByName(name) ?? ensurePlaceholder(name);
  if (!resolved) throw new Error(`Equipo europeo no encontrado: ${name}`);
  return resolved;
}

export function getEuropeanTeam(name: string): Team {
  const id = ensureEuropeanTeam(name);
  const existing = getAllTeams().find((team) => team.id === id);
  if (existing) return existing;
  const placeholder = PLACEHOLDER_TEAMS[name];
  return { id, ...placeholder } as Team;
}

export function injectEuropeanPlaceholders(teams: Team[]): Team[] {
  const existing = new Set(teams.map((team) => team.id));
  const extra = Object.entries(PLACEHOLDER_TEAMS)
    .map(([name, team]) => ({ id: normalize(name), ...team }))
    .filter((team) => !existing.has(team.id));
  return [...teams, ...extra];
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
    participants: buildParticipantIds(EUROPA_NAMES),
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
    participants: buildParticipantIds(CONFERENCE_NAMES),
  },
};

export const EUROPEAN_START = UCL_START;

// Exact Champions calendar, shifted one day for both competitions.
export function europeanCalendar() {
  return {
    leagueDraw: UCL_CALENDAR.leagueDraw + 1,
    leagueDay: UCL_CALENDAR.leagueDay.map((d) => d + 1),
    playoffDraw: UCL_CALENDAR.playoffDraw + 1,
    playoffLeg1: UCL_CALENDAR.playoffLeg1 + 1,
    playoffLeg2: UCL_CALENDAR.playoffLeg2 + 1,
    knockoutDraw: UCL_CALENDAR.knockoutDraw + 1,
    r16Leg1: UCL_CALENDAR.r16Leg1 + 1,
    r16Leg2: UCL_CALENDAR.r16Leg2 + 1,
    qfLeg1: UCL_CALENDAR.qfLeg1 + 1,
    qfLeg2: UCL_CALENDAR.qfLeg2 + 1,
    sfLeg1: UCL_CALENDAR.sfLeg1 + 1,
    sfLeg2: UCL_CALENDAR.sfLeg2 + 1,
    final: UCL_CALENDAR.final + 1,
  } as const;
}

export type EuropeanStateKey = "uel" | "uecl";
export type EuropeanState = UCLState;

export function isEuropeanCompetition(value: unknown): value is EuropeanCompetitionId {
  return value === "uel" || value === "uecl";
}

export function europeanCalendarDate(offset: number): string {
  const start = new Date(`${EUROPEAN_START}T00:00:00Z`);
  return new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10);
}

export function teamIsInEuropeanCompetition(competition: EuropeanCompetitionId, teamId: string): boolean {
  return EUROPEAN_CONFIGS[competition].participants.includes(teamId);
}

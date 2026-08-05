/**
 * Personalidad de mercado de cada club.
 *
 * El perfil es determinista (misma semilla => mismo perfil) y se deriva de los
 * datos reales del equipo: media deportiva, liga y categoría. Sobre esa base se
 * aplican ajustes concretos para clubes con identidad de mercado muy marcada
 * (gasto de Madrid/PSG, scouting joven del Brighton, ventas del Sevilla...).
 */

import { getAllTeams, teamById, type Team } from "@/data/teams";
import { clamp, seededRange } from "./random";
import type { ClubProfile } from "./types";

/**
 * Peso económico/reputacional de cada liga cargada en el juego (0 a 1).
 *
 * Esta es la ÚNICA tabla de fuerza de liga del juego: la usan tanto el poder
 * financiero y la reputación de los clubes IA como el presupuesto inicial del
 * equipo del usuario (`BudgetManager.initialBudget`), así que un mismo club
 * vale lo mismo lo lleve la IA o el usuario. Antes solo estaban afinadas 8
 * claves (varias de ellas con ids que ni siquiera existían, como "portugal" o
 * "saudi" en vez de "ligaportugal"/"roshnsaudileague") y el resto de las ~37
 * ligas restantes caían todas en el mismo 0.35 genérico. Ahora cada liga
 * cargada tiene su propio peso, así que ligas "menores" como Argentina,
 * Turquía o la MLS ya no quedan homogeneizadas entre sí.
 */
const LEAGUE_WEIGHT: Record<string, number> = {
  // Top 5 europeas
  premier: 1,
  laliga: 0.9,
  bundesliga: 0.85,
  seriea: 0.83,
  ligue1: 0.75,
  // Ligas "grandes" de segundo nivel económico
  roshnsaudileague: 0.8, // Arabia Saudí: pocos clubes históricos pero petrodólares
  eredivisie: 0.6,
  ligaportugal: 0.55,
  trendyolsperlig: 0.55,
  championship: 0.55, // segunda inglesa: TV muy rica
  mls: 0.5,
  // Segundas divisiones "top 5" y ligas medias europeas
  laliga2: 0.45,
  bundesliga2: 0.45,
  "1aproleague": 0.45, // Bélgica: fuerte en scouting/reventa
  serieb: 0.42,
  scottish: 0.42,
  lpf: 0.4, // Argentina: clubes históricos, economía débil
  bracksuperleague: 0.4, // Suiza
  ligue2: 0.38,
  austrianbundesliga: 0.38,
  "3fsuperliga": 0.35, // Dinamarca
  // Ligas menores
  eliteserien: 0.3, // Noruega
  allsvenskan: 0.3, // Suecia
  pkobpekstraklasa: 0.3, // Polonia
  superliga: 0.28, // Rumanía
  leagueone: 0.28, // Inglaterra 3ª
  liga3: 0.25, // Alemania 3ª
  leaguetwo: 0.22, // Inglaterra 4ª
};

/** Peso por defecto para cualquier liga que aparezca sin entrada propia. */
const DEFAULT_LEAGUE_WEIGHT = 0.3;

function leagueWeight(leagueId: string): number {
  return LEAGUE_WEIGHT[leagueId] ?? DEFAULT_LEAGUE_WEIGHT;
}

/** Ligas top 5 europeas: no sufren la penalización por liga "menor". */
export const TOP5_LEAGUES = new Set(["laliga", "premier", "seriea", "bundesliga", "ligue1"]);

/**
 * Ligas fuera del top 5 que quedan exentas de la penalización del -20%
 * (Portugal, Bélgica, Turquía y Países Bajos: mercados de reventa fuertes).
 */
export const NO_DISCOUNT_LEAGUES = new Set([
  "ligaportugal", // Liga Portugal
  "1aproleague", // 1A Pro League (Bélgica)
  "trendyolsperlig", // Trendyol Süper Lig (Turquía)
  "eredivisie", // Eredivisie (Países Bajos)
]);

/** Liga saudí: recibe un bonus de mercado en vez de penalización. */
export const SAUDI_LEAGUE_ID = "roshnsaudileague";

const LEAGUE_COUNTRY: Record<string, string> = {
  premier: "England",
  championship: "England",
  leagueone: "England",
  leaguetwo: "England",
  laliga: "Spain",
  laliga2: "Spain",
  seriea: "Italy",
  serieb: "Italy",
  bundesliga: "Germany",
  bundesliga2: "Germany",
  liga3: "Germany",
  ligue1: "France",
  ligue2: "France",
  ligaportugal: "Portugal",
  eredivisie: "Netherlands",
  roshnsaudileague: "Saudi Arabia",
  trendyolsperlig: "Turkey",
  mls: "United States",
  lpf: "Argentina",
  scottish: "Scotland",
  "1aproleague": "Belgium",
  pkobpekstraklasa: "Poland",
  bracksuperleague: "Switzerland",
  "3fsuperliga": "Denmark",
  allsvenskan: "Sweden",
  eliteserien: "Norway",
  austrianbundesliga: "Austria",
  superliga: "Romania",
};

/** Ajustes manuales de identidad de mercado por club. */
const CLUB_OVERRIDES: Record<
  string,
  Partial<Omit<ClubProfile, "style">> & { style?: Partial<ClubProfile["style"]> }
> = {
  rma: {
    financialPower: 0.98,
    reputation: 1,
    ambition: 0.98,
    youthPreference: 0.55,
    aggression: 0.85,
    patience: 0.7,
    sellingToughness: 1.5,
    style: { pace: 0.75, passing: 0.55 },
  },
  bar: {
    financialPower: 0.72,
    reputation: 0.97,
    ambition: 0.95,
    academyFocus: 0.9,
    youthPreference: 0.75,
    sellingToughness: 1.35,
    style: { passing: 0.9, physical: 0.35 },
  },
  mci: {
    financialPower: 0.97,
    reputation: 0.95,
    ambition: 0.95,
    aggression: 0.8,
    patience: 0.75,
    style: { passing: 0.92, physical: 0.4 },
  },
  psg: {
    financialPower: 0.99,
    reputation: 0.9,
    ambition: 0.97,
    aggression: 0.9,
    patience: 0.4,
    youthPreference: 0.7,
    style: { pace: 0.85 },
  },
  che: {
    financialPower: 0.93,
    reputation: 0.85,
    aggression: 0.9,
    youthPreference: 0.9,
    patience: 0.35,
    style: { pace: 0.75, physical: 0.6 },
  },
  liv: {
    financialPower: 0.88,
    reputation: 0.92,
    patience: 0.85,
    aggression: 0.55,
    youthPreference: 0.65,
    style: { pace: 0.85, physical: 0.65 },
  },
  ars: {
    financialPower: 0.86,
    reputation: 0.9,
    youthPreference: 0.8,
    patience: 0.7,
    style: { passing: 0.8 },
  },
  bri: {
    financialPower: 0.5,
    reputation: 0.62,
    youthPreference: 0.98,
    academyFocus: 0.85,
    patience: 0.9,
    sellingToughness: 1.45,
    buyingWillingness: 0.8,
    style: { passing: 0.8 },
  },
  sev: {
    financialPower: 0.42,
    reputation: 0.68,
    youthPreference: 0.6,
    patience: 0.5,
    sellingToughness: 1.3,
    buyingWillingness: 0.75,
    style: { defending: 0.65 },
  },
  atm: {
    financialPower: 0.7,
    reputation: 0.85,
    veteranPreference: 0.6,
    patience: 0.7,
    style: { physical: 0.8, defending: 0.8, pace: 0.35 },
  },
  bay: {
    financialPower: 0.9,
    reputation: 0.95,
    leaguePreference: 0.7,
    nationalPreference: 0.7,
    patience: 0.8,
    style: { passing: 0.85, pace: 0.65 },
  },
  bvb: {
    financialPower: 0.62,
    reputation: 0.8,
    youthPreference: 0.95,
    sellingToughness: 1.3,
    style: { pace: 0.85 },
  },
  juv: {
    financialPower: 0.68,
    reputation: 0.85,
    veteranPreference: 0.55,
    patience: 0.6,
    style: { defending: 0.75, physical: 0.55 },
  },
  ath: {
    nationalPreference: 1,
    academyFocus: 1,
    youthPreference: 0.8,
    style: { physical: 0.75, pace: 0.55 },
  },
};

/** Poder económico base a partir de la calidad deportiva y la liga. */
/** Poder financiero a partir de una media de calidad (0-1) y una liga, sin depender de un club real. Usado como fallback cuando aún no hay un id de club conocido (p. ej. antes de confirmar la elección de equipo). */
export function estimateFinancialPower(avgOvr: number, leagueId: string): number {
  return clamp((avgOvr - 62) / 26, 0, 1) * 0.7 + leagueWeight(leagueId) * 0.3;
}

function baseFinancialPower(team: Team): number {
  const quality = (team.att + team.mid + team.def) / 3;
  return estimateFinancialPower(quality, team.league);
}

function baseReputation(team: Team): number {
  const quality = (team.att + team.mid + team.def) / 3;
  const category = team.category === "Gigante" ? 0.2 : team.category === "Aspirante" ? 0.1 : 0;
  return clamp(((quality - 60) / 30) * 0.6 + leagueWeight(team.league) * 0.3 + category, 0, 1);
}

/**
 * Identidad táctica de reclutamiento por defecto, para los clubes que no
 * tienen un ajuste manual en `CLUB_OVERRIDES`. Se deriva de la forma del
 * equipo (¿pesa más el medio que el ataque y la defensa juntos? ¿la defensa
 * sobre el ataque?) y de una variación determinista por club, para que no
 * todos los equipos sin ficha propia recluten exactamente igual.
 */
function baseStyle(team: Team, seed: string): ClubProfile["style"] {
  const midSpread = team.mid - (team.att + team.def) / 2;
  const defSpread = team.def - team.att;
  return {
    pace: clamp(seededRange(0.3, 0.7, seed, "style-pace") + (team.att > team.mid ? 0.1 : 0), 0, 1),
    passing: clamp(0.45 + midSpread / 30 + seededRange(-0.15, 0.15, seed, "style-passing"), 0, 1),
    physical: clamp(
      seededRange(0.3, 0.7, seed, "style-physical") + (team.def > team.mid ? 0.1 : 0),
      0,
      1,
    ),
    defending: clamp(0.4 + defSpread / 30 + seededRange(-0.1, 0.15, seed, "style-defending"), 0, 1),
  };
}

function buildProfile(team: Team): ClubProfile {
  const seed = team.id;
  const financialPower = clamp(baseFinancialPower(team), 0.05, 1);
  const reputation = clamp(baseReputation(team), 0.05, 1);

  const profile: ClubProfile = {
    clubId: team.id,
    leagueId: team.league,
    financialPower,
    reputation,
    patience: clamp(seededRange(0.3, 0.9, seed, "patience"), 0, 1),
    aggression: clamp(seededRange(0.25, 0.9, seed, "aggression") + financialPower * 0.15, 0, 1),
    youthPreference: clamp(seededRange(0.2, 0.9, seed, "youth") + (1 - financialPower) * 0.2, 0, 1),
    veteranPreference: clamp(seededRange(0.1, 0.6, seed, "veteran"), 0, 1),
    nationalPreference: clamp(seededRange(0.2, 0.8, seed, "nation"), 0, 1),
    leaguePreference: clamp(seededRange(0.2, 0.8, seed, "league"), 0, 1),
    academyFocus: clamp(seededRange(0.2, 0.9, seed, "academy"), 0, 1),
    ambition: clamp(seededRange(0.3, 0.9, seed, "ambition") + reputation * 0.2, 0, 1),
    sellingToughness: clamp(
      0.85 + reputation * 0.5 + seededRange(-0.1, 0.15, seed, "sell"),
      0.7,
      1.6,
    ),
    buyingWillingness: clamp(
      0.75 + financialPower * 0.5 + seededRange(-0.1, 0.15, seed, "buy"),
      0.6,
      1.4,
    ),
    country: LEAGUE_COUNTRY[team.league] ?? "",
    style: baseStyle(team, seed),
  };

  const override = CLUB_OVERRIDES[team.id];
  if (!override) return profile;
  return {
    ...profile,
    ...override,
    style: { ...profile.style, ...override.style },
  };
}

let cache: Map<string, ClubProfile> | null = null;

function getCache(): Map<string, ClubProfile> {
  if (!cache) {
    cache = new Map();
    for (const team of getAllTeams()) cache.set(team.id, buildProfile(team));
  }
  return cache;
}

/** Perfil de mercado de un club (se construye la primera vez que se pide). */
export function getClubProfile(clubId: string): ClubProfile {
  const cached = getCache().get(clubId);
  if (cached) return cached;
  const profile = buildProfile(teamById(clubId));
  getCache().set(clubId, profile);
  return profile;
}

/** Todos los perfiles conocidos. */
export function getAllClubProfiles(): ClubProfile[] {
  return Array.from(getCache().values());
}

/** Reinicia los perfiles (al cargar otra partida). */
export function resetClubProfiles(): void {
  cache = null;
}

/** ¿Es un club capaz de pelear por un fichaje de este calibre? */
export function canClubAffordProfileWise(
  profile: ClubProfile,
  fee: number,
  maxSpend: number,
): boolean {
  return fee <= maxSpend * profile.buyingWillingness;
}

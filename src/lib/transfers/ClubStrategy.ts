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

/** Ligas consideradas de primer nivel para reputación y poder económico. */
const TOP_LEAGUES: Record<string, number> = {
  premier: 1,
  laliga: 0.9,
  seriea: 0.85,
  bundesliga: 0.85,
  ligue1: 0.75,
  portugal: 0.6,
  eredivisie: 0.6,
  saudi: 0.55,
};

const LEAGUE_COUNTRY: Record<string, string> = {
  premier: "England",
  laliga: "Spain",
  laliga2: "Spain",
  seriea: "Italy",
  bundesliga: "Germany",
  ligue1: "France",
  portugal: "Portugal",
  eredivisie: "Netherlands",
  saudi: "Saudi Arabia",
};

/** Ajustes manuales de identidad de mercado por club. */
const CLUB_OVERRIDES: Record<string, Partial<ClubProfile>> = {
  rma: { financialPower: 0.98, reputation: 1, ambition: 0.98, youthPreference: 0.55, aggression: 0.85, patience: 0.7, sellingToughness: 1.5 },
  fcb: { financialPower: 0.72, reputation: 0.97, ambition: 0.95, academyFocus: 0.9, youthPreference: 0.75, sellingToughness: 1.35 },
  mci: { financialPower: 0.97, reputation: 0.95, ambition: 0.95, aggression: 0.8, patience: 0.75 },
  psg: { financialPower: 0.99, reputation: 0.9, ambition: 0.97, aggression: 0.9, patience: 0.4, youthPreference: 0.7 },
  che: { financialPower: 0.93, reputation: 0.85, aggression: 0.9, youthPreference: 0.9, patience: 0.35 },
  liv: { financialPower: 0.88, reputation: 0.92, patience: 0.85, aggression: 0.55, youthPreference: 0.65 },
  ars: { financialPower: 0.86, reputation: 0.9, youthPreference: 0.8, patience: 0.7 },
  bri: { financialPower: 0.5, reputation: 0.62, youthPreference: 0.98, academyFocus: 0.85, patience: 0.9, sellingToughness: 1.45, buyingWillingness: 0.8 },
  sev: { financialPower: 0.42, reputation: 0.68, youthPreference: 0.6, patience: 0.5, sellingToughness: 1.3, buyingWillingness: 0.75 },
  atm: { financialPower: 0.7, reputation: 0.85, veteranPreference: 0.6, patience: 0.7 },
  bay: { financialPower: 0.9, reputation: 0.95, leaguePreference: 0.7, nationalPreference: 0.7, patience: 0.8 },
  bvb: { financialPower: 0.62, reputation: 0.8, youthPreference: 0.95, sellingToughness: 1.3 },
  juv: { financialPower: 0.68, reputation: 0.85, veteranPreference: 0.55, patience: 0.6 },
  ath: { nationalPreference: 1, academyFocus: 1, youthPreference: 0.8 },
};

/** Poder económico base a partir de la calidad deportiva y la liga. */
function baseFinancialPower(team: Team): number {
  const quality = (team.att + team.mid + team.def) / 3;
  const leagueWeight = TOP_LEAGUES[team.league] ?? 0.35;
  return clamp((quality - 62) / 26, 0, 1) * 0.7 + leagueWeight * 0.3;
}

function baseReputation(team: Team): number {
  const quality = (team.att + team.mid + team.def) / 3;
  const leagueWeight = TOP_LEAGUES[team.league] ?? 0.3;
  const category = team.category === "Gigante" ? 0.2 : team.category === "Aspirante" ? 0.1 : 0;
  return clamp((quality - 60) / 30 * 0.6 + leagueWeight * 0.3 + category, 0, 1);
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
    sellingToughness: clamp(0.85 + reputation * 0.5 + seededRange(-0.1, 0.15, seed, "sell"), 0.7, 1.6),
    buyingWillingness: clamp(0.75 + financialPower * 0.5 + seededRange(-0.1, 0.15, seed, "buy"), 0.6, 1.4),
    country: LEAGUE_COUNTRY[team.league] ?? "",
  };

  const override = CLUB_OVERRIDES[team.id];
  return override ? { ...profile, ...override } : profile;
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
export function canClubAffordProfileWise(profile: ClubProfile, fee: number, maxSpend: number): boolean {
  return fee <= maxSpend * profile.buyingWillingness;
}

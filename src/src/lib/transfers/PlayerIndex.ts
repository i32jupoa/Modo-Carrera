/**
 * Índices del mundo del mercado.
 *
 * Convierte los datos brutos de `playersData` en `MarketPlayer` tipados y
 * construye, una sola vez, los índices que necesita el motor: por club, por
 * demarcación, por liga y por rating. Todas las búsquedas del motor pasan por
 * aquí para evitar recorrer las ~19.000 fichas en cada decisión (O(n²)).
 *
 * Los índices se actualizan de forma incremental cuando un jugador cambia de
 * club, se pone en la lista de transferibles o firma un nuevo contrato.
 */

import rawPlayers from "@/data/playersData";
import { getAllTeams, teamKeyFromName, type Team } from "@/data/teams";
import { marketValueFor } from "@/data/players";
import { CONTRACT_RULES, SQUAD_LIMITS, WAGE_RULES } from "./constants";
import { clamp, seededRange, seededUnit } from "./random";
import { POSITION_GROUPS, type Contract, type MarketPlayer, type PlayerPersonality, type PositionGroup } from "./types";

/** Ficha bruta del JSON de jugadores (sólo los campos que usa el mercado). */
interface RawPlayerRecord {
  ID?: number | string;
  Name?: string;
  OVR?: number;
  Age?: number;
  Position?: string;
  Nation?: string;
  Team?: string;
  League?: string;
}

/** Traduce la posición del JSON a la demarcación que usa el mercado. */
export function positionGroupOf(position: string): PositionGroup {
  const up = String(position || "CM").toUpperCase();
  if (up === "GK") return "GK";
  if (up === "CB") return "CB";
  if (["LB", "RB", "LWB", "RWB"].includes(up)) return "FB";
  if (["CM", "CDM", "CAM", "LM", "RM"].includes(up)) return "CM";
  if (["LW", "RW", "LF", "RF"].includes(up)) return "WING";
  if (["ST", "CF"].includes(up)) return "ST";
  return "CM";
}

/** Potencial estimado: los jóvenes tienen recorrido, los veteranos no. */
function estimatePotential(ovr: number, age: number, seed: string): number {
  if (age >= 29) return ovr;
  const room = clamp((29 - age) * 1.6, 0, 14);
  const talent = seededUnit(seed, "potential");
  return Math.round(clamp(ovr + room * (0.35 + talent * 0.65), ovr, 94));
}

/** Contrato inicial coherente con la edad y el valor del jugador. */
function buildContract(value: number, age: number, seed: string): Contract {
  const byAge = CONTRACT_RULES.yearsByAge.find((entry) => age <= entry.maxAge);
  const baseYears = byAge ? byAge.years : CONTRACT_RULES.minYears;
  // Al arrancar la partida casi nadie está en su último año: los contratos que
  // expiran deben ser la excepción, no la norma (si no, todo el mundo saldría
  // gratis y el mercado perdería sentido).
  const roll = seededUnit(seed, "years");
  const yearsLeft = clamp(
    roll < 0.12 ? CONTRACT_RULES.minYears : Math.round(1 + roll * (baseYears - 1)),
    CONTRACT_RULES.minYears,
    CONTRACT_RULES.maxYears,
  );
  const wage = Math.max(WAGE_RULES.minimumWage, Math.round(value * WAGE_RULES.valueToWage));
  return {
    yearsLeft,
    wage,
    releaseClause: Math.round(value * CONTRACT_RULES.releaseClauseFactor),
    signingBonus: Math.round(wage * CONTRACT_RULES.signingBonusShare),
  };
}

/** Personalidad determinista: el mismo jugador siempre piensa igual. */
function buildPersonality(seed: string, age: number, ovr: number): PlayerPersonality {
  const youth = clamp((SQUAD_LIMITS.veteranAge - age) / 14, 0, 1);
  return {
    ambition: clamp(seededRange(0.2, 0.9, seed, "amb") + (ovr - 75) / 100, 0, 1),
    loyalty: clamp(seededRange(0.1, 0.9, seed, "loy") + (1 - youth) * 0.15, 0, 1),
    greed: clamp(seededRange(0.15, 0.95, seed, "gre"), 0, 1),
    playingTimeDesire: clamp(seededRange(0.25, 0.95, seed, "min") + youth * 0.2, 0, 1),
    adventure: clamp(seededRange(0.1, 0.9, seed, "adv"), 0, 1),
  };
}

// ============================================================================
// CONSTRUCCIÓN
// ============================================================================

/** Colección de índices del mercado. */
export interface MarketIndex {
  /** Todos los jugadores por id. */
  byId: Map<string, MarketPlayer>;
  /** Ids de jugadores por club. */
  byClub: Map<string, Set<string>>;
  /** Ids por demarcación. */
  byGroup: Map<PositionGroup, Set<string>>;
  /** Ids por liga. */
  byLeague: Map<string, Set<string>>;
  /** Ids por franja de rating (clave = decena, p. ej. 80 => 80-89). */
  byRating: Map<number, Set<string>>;
  /** Ids sin club. */
  freeAgents: Set<string>;
}

function addTo<K>(map: Map<K, Set<string>>, key: K, id: string): void {
  const bucket = map.get(key);
  if (bucket) bucket.add(id);
  else map.set(key, new Set([id]));
}

function removeFrom<K>(map: Map<K, Set<string>>, key: K, id: string): void {
  map.get(key)?.delete(id);
}

/** Franja de rating usada por el índice. */
export function ratingBucket(ovr: number): number {
  return Math.floor(ovr / 5) * 5;
}

function teamLookup(): Map<string, Team> {
  const map = new Map<string, Team>();
  for (const team of getAllTeams()) map.set(team.id, team);
  return map;
}

function buildIndex(): MarketIndex {
  const teams = teamLookup();
  const index: MarketIndex = {
    byId: new Map(),
    byClub: new Map(),
    byGroup: new Map(),
    byLeague: new Map(),
    byRating: new Map(),
    freeAgents: new Set(),
  };

  const records = (Array.isArray(rawPlayers) ? rawPlayers : []) as RawPlayerRecord[];

  // Media por club: necesaria para valorar correctamente a cada jugador.
  const ratingSum = new Map<string, { sum: number; count: number }>();
  const resolvedClub: string[] = new Array(records.length);
  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const key = raw.Team ? teamKeyFromName(raw.Team) : "";
    const clubId = key && teams.has(key) ? key : "";
    resolvedClub[i] = clubId;
    if (!clubId) continue;
    const entry = ratingSum.get(clubId);
    const ovr = raw.OVR ?? 70;
    if (entry) {
      entry.sum += ovr;
      entry.count += 1;
    } else {
      ratingSum.set(clubId, { sum: ovr, count: 1 });
    }
  }

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const clubId = resolvedClub[i];
    const team = clubId ? teams.get(clubId) : undefined;
    const leagueId = team?.league ?? "free";
    const id = raw.ID !== undefined ? String(raw.ID) : `p-${i}`;
    const ovr = raw.OVR ?? 70;
    const age = raw.Age ?? 24;
    const position = raw.Position ?? "CM";
    const stats = clubId ? ratingSum.get(clubId) : undefined;
    const clubAverage = stats && stats.count > 0 ? stats.sum / stats.count : 72;
    const valueM = marketValueFor(ovr, age, position, clubId, leagueId, 0, 0, 0, false, clubAverage).value;
    const value = Math.round(valueM * 1_000_000);

    const player: MarketPlayer = {
      id,
      name: raw.Name ?? "Jugador",
      age,
      ovr,
      potential: estimatePotential(ovr, age, id),
      position,
      group: positionGroupOf(position),
      nation: raw.Nation ?? "",
      clubId: clubId || null,
      leagueId,
      value,
      contract: buildContract(value, age, id),
      personality: buildPersonality(id, age, ovr),
      transferListed: false,
      listReason: null,
      loanListed: false,
      loanClubId: null,
      minutesShare: 0,
    };

    index.byId.set(id, player);
    if (clubId) addTo(index.byClub, clubId, id);
    else index.freeAgents.add(id);
    addTo(index.byGroup, player.group, id);
    addTo(index.byLeague, leagueId, id);
    addTo(index.byRating, ratingBucket(ovr), id);
  }

  return index;
}

let cached: MarketIndex | null = null;

/** Devuelve los índices, construyéndolos la primera vez que se piden. */
export function getMarketIndex(): MarketIndex {
  if (!cached) cached = buildIndex();
  return cached;
}

/** Fuerza la reconstrucción (al cargar otra partida). */
export function resetMarketIndex(): void {
  cached = null;
}

// ============================================================================
// CONSULTAS
// ============================================================================

/** Jugador por id. */
export function getPlayer(playerId: string): MarketPlayer | undefined {
  return getMarketIndex().byId.get(playerId);
}

function idsToPlayers(index: MarketIndex, ids: Iterable<string>): MarketPlayer[] {
  const out: MarketPlayer[] = [];
  for (const id of ids) {
    const player = index.byId.get(id);
    if (player) out.push(player);
  }
  return out;
}

/** Plantilla completa de un club. */
export function getClubPlayers(clubId: string): MarketPlayer[] {
  const index = getMarketIndex();
  return idsToPlayers(index, index.byClub.get(clubId) ?? []);
}

/** Jugadores de una liga. */
export function getLeaguePlayers(leagueId: string): MarketPlayer[] {
  const index = getMarketIndex();
  return idsToPlayers(index, index.byLeague.get(leagueId) ?? []);
}

/** Agentes libres. */
export function getFreeAgents(): MarketPlayer[] {
  const index = getMarketIndex();
  return idsToPlayers(index, index.freeAgents);
}

/** Filtro de búsqueda de candidatos. */
export interface CandidateQuery {
  group: PositionGroup;
  minOvr?: number;
  maxOvr?: number;
  minAge?: number;
  maxAge?: number;
  maxValue?: number;
  /** Clubes cuyos jugadores no interesan (p. ej. el propio club). */
  excludeClubIds?: readonly string[];
  /** Limita a estas ligas. */
  leagueIds?: readonly string[];
  limit?: number;
}

/**
 * Busca candidatos usando los índices por demarcación y rating, de forma que
 * el coste depende del tamaño de la franja y no del total de jugadores.
 */
export function findCandidates(query: CandidateQuery): MarketPlayer[] {
  const index = getMarketIndex();
  const minOvr = query.minOvr ?? 0;
  const maxOvr = query.maxOvr ?? 99;
  const excluded = new Set(query.excludeClubIds ?? []);
  const leagues = query.leagueIds ? new Set(query.leagueIds) : null;
  const groupIds = index.byGroup.get(query.group) ?? new Set<string>();

  const candidates: MarketPlayer[] = [];
  for (let bucket = ratingBucket(minOvr); bucket <= ratingBucket(maxOvr); bucket += 5) {
    const ids = index.byRating.get(bucket);
    if (!ids) continue;
    for (const id of ids) {
      if (!groupIds.has(id)) continue;
      const player = index.byId.get(id);
      if (!player) continue;
      if (player.ovr < minOvr || player.ovr > maxOvr) continue;
      if (query.minAge !== undefined && player.age < query.minAge) continue;
      if (query.maxAge !== undefined && player.age > query.maxAge) continue;
      if (query.maxValue !== undefined && player.value > query.maxValue) continue;
      if (player.clubId && excluded.has(player.clubId)) continue;
      if (leagues && !leagues.has(player.leagueId)) continue;
      candidates.push(player);
    }
  }

  candidates.sort((a, b) => b.ovr - a.ovr);
  return query.limit ? candidates.slice(0, query.limit) : candidates;
}

// ============================================================================
// ACTUALIZACIÓN INCREMENTAL
// ============================================================================

/** Mueve a un jugador de club manteniendo los índices coherentes. */
export function reassignPlayerClub(playerId: string, clubId: string | null, leagueId?: string): void {
  const index = getMarketIndex();
  const player = index.byId.get(playerId);
  if (!player) return;

  if (player.clubId) removeFrom(index.byClub, player.clubId, playerId);
  else index.freeAgents.delete(playerId);
  removeFrom(index.byLeague, player.leagueId, playerId);

  player.clubId = clubId;
  player.leagueId = leagueId ?? (clubId ? player.leagueId : "free");
  player.transferListed = false;
  player.listReason = null;
  player.loanClubId = null;

  if (clubId) addTo(index.byClub, clubId, playerId);
  else index.freeAgents.add(playerId);
  addTo(index.byLeague, player.leagueId, playerId);
}

/** Aplica cambios puntuales a un jugador reindexando lo que haga falta. */
export function updatePlayer(playerId: string, patch: Partial<MarketPlayer>): MarketPlayer | undefined {
  const index = getMarketIndex();
  const player = index.byId.get(playerId);
  if (!player) return undefined;

  if (patch.ovr !== undefined && patch.ovr !== player.ovr) {
    removeFrom(index.byRating, ratingBucket(player.ovr), playerId);
    addTo(index.byRating, ratingBucket(patch.ovr), playerId);
  }
  if (patch.group !== undefined && patch.group !== player.group) {
    removeFrom(index.byGroup, player.group, playerId);
    addTo(index.byGroup, patch.group, playerId);
  }
  Object.assign(player, patch);
  return player;
}

/** Demarcaciones disponibles (reexportado por comodidad del motor). */
export const ALL_POSITION_GROUPS = POSITION_GROUPS;

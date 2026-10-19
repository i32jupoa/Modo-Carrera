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
import { getAllTeams, findTeamStrict, teamById, type Team } from "@/data/teams";
import { marketValueFor } from "@/data/players";
import { CONTRACT_RULES, SQUAD_LIMITS, WAGE_RULES } from "./constants";
import { estimateAnnualWage } from "./SalaryEngine";
import { clamp, seededRange, seededUnit } from "./random";
import { isBlockedUserMove } from "./MarketLocks";
import { DYNAMIC_MARKET_BY_ID, getDynamicMarketPlayers } from "@/lib/academy/academyRuntime";
import {
  POSITION_GROUPS,
  type Contract,
  type MarketPlayer,
  type PlayerPersonality,
  type PositionGroup,
  type TransferListReason,
} from "./types";

/** Ficha bruta del JSON de jugadores (sólo los campos que usa el mercado). */
interface RawPlayerRecord {
  ID?: number | string;
  Name?: string;
  OVR?: number;
  potential?: number;
  Age?: number;
  Position?: string;
  Nation?: string;
  Team?: string;
  League?: string;
  PAC?: number;
  PAS?: number;
  PHY?: number;
  DEF?: number;
}

/** Traduce la posición del JSON a la demarcación que usa el mercado. */
export function positionGroupOf(position: string): PositionGroup {
  const up = String(position || "CM").toUpperCase();
  if (up === "GK") return "GK";
  if (up === "CB") return "CB";
  if (["LB", "RB", "LWB", "RWB"].includes(up)) return "FB";
  if (["CM", "CDM", "CAM"].includes(up)) return "CM";
  // LM/RM se consideran jugadores de banda para el mercado: evita que
  // fichajes como Michael Olise se interpreten como centrocampistas cuando
  // el club está buscando extremos y, sobre todo, permite detectar
  // correctamente el overbooking de jugadores de banda.
  if (["LW", "RW", "LF", "RF", "LM", "RM"].includes(up)) return "WING";
  if (["ST", "CF"].includes(up)) return "ST";
  return "CM";
}

/** Contrato inicial coherente con la edad y el valor del jugador. */
function buildContract(value: number, age: number, ovr: number, seed: string): Contract {
  const byAge = CONTRACT_RULES.yearsByAge.find((entry) => age <= entry.maxAge);
  const baseYears = byAge ? byAge.years : CONTRACT_RULES.minYears;
  // Al arrancar la partida casi nadie está en su último año: los contratos que
  // expiran deben ser la excepción, no la norma (si no, todo el mundo saldría
  // gratis y el mercado perdería sentido).
  //
  // Esa excepción, además, no puede repartirse por igual entre un suplente
  // cualquiera y una estrella mundial: en la vida real los clubes renuevan a
  // sus mejores activos mucho antes de dejarlos llegar al último año. Sin
  // este ajuste, ~1 de cada 8 jugadores (ovr incluido) arrancaba la partida a
  // un año de quedarse libre —protección de "jugador clave" que salta con
  // contrato corto— así que salían a la venta nombres como Rodrygo o Carvajal
  // en la primera semana de mercado sin que nadie los hubiera puesto en
  // venta. `eliteProtection` reduce esa probabilidad cuanto mejor es el
  // jugador, hasta casi anularla en el nivel top mundial.
  const eliteProtection = clamp((ovr - 75) / 18, 0, 1);
  const expiringChance = 0.12 * (1 - eliteProtection * 0.9);
  const roll = seededUnit(seed, "years");
  const yearsLeft = clamp(
    roll < expiringChance ? CONTRACT_RULES.minYears : Math.round(1 + roll * (baseYears - 1)),
    CONTRACT_RULES.minYears,
    CONTRACT_RULES.maxYears,
  );
  const wage = Math.max(WAGE_RULES.minimumWage, estimateAnnualWage(value, age, ovr));
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

/** Ledger de retiradas de la carrera actualmente cargada. */
const retiredLedgerIds = new Set<string>();
const retiredLedgerNames = new Set<string>();

function normalizePlayerIdentity(name: unknown): string {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isRetiredIdentity(id: unknown, name: unknown): boolean {
  const key = String(id ?? "").trim();
  const normalizedName = normalizePlayerIdentity(name);
  return (key !== "" && retiredLedgerIds.has(key))
    || (normalizedName !== "" && retiredLedgerNames.has(normalizedName));
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
    const rawId = raw.ID !== undefined ? String(raw.ID) : `p-${i}`;
    if (isRetiredIdentity(rawId, raw.Name)) {
      retiredLedgerIds.add(rawId);
      const retiredName = normalizePlayerIdentity(raw.Name);
      if (retiredName) retiredLedgerNames.add(retiredName);
      resolvedClub[i] = "";
      continue;
    }
    // Emparejamiento ESTRICTO (igualdad exacta o alias declarado, sin
    // coincidencias parciales): el resto del juego (plantilla del usuario,
    // `src/data/players.ts`) ya usa esta función. El mercado usaba antes
    // `teamKeyFromName`, que acepta que un nombre "contenga" el id de un
    // club — con ids cortos de 3 letras (p. ej. "ang" de Angers) eso hacía
    // que decenas de equipos con ese id como subcadena de su nombre (o del
    // nombre del equipo) se fusionaran por error en la misma plantilla,
    // inflándola a cientos de jugadores.
    const key = raw.Team ? (findTeamStrict(raw.Team, raw.League)?.id ?? "") : "";
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
    const id = raw.ID !== undefined ? String(raw.ID) : `p-${i}`;
    const isRetired = isRetiredIdentity(id, raw.Name);
    if (isRetired) {
      retiredLedgerIds.add(id);
      const retiredName = normalizePlayerIdentity(raw.Name);
      if (retiredName) retiredLedgerNames.add(retiredName);
    }
    const clubId = isRetired ? "" : resolvedClub[i];
    const team = clubId ? teams.get(clubId) : undefined;
    const leagueId = isRetired ? "retired" : team?.league ?? "free";
    const ovr = raw.OVR ?? 70;
    const age = raw.Age ?? 24;
    const position = raw.Position ?? "CM";
    const stats = clubId ? ratingSum.get(clubId) : undefined;
    const clubAverage = stats && stats.count > 0 ? stats.sum / stats.count : 72;
    const potential = Math.max(ovr, Number(raw.potential ?? ovr));
    const valueM = marketValueFor(
      ovr,
      age,
      position,
      clubId,
      leagueId,
      0,
      0,
      0,
      false,
      clubAverage,
      undefined,
      undefined,
      potential,
    ).value;
    const value = Math.round(valueM * 1_000_000);

    const player: MarketPlayer = {
      id,
      name: raw.Name ?? "Jugador",
      age,
      ovr,
      potential,
      position,
      group: positionGroupOf(position),
      nation: raw.Nation ?? "",
      clubId: clubId || null,
      leagueId,
      value,
      contract: buildContract(value, age, ovr, id),
      personality: buildPersonality(id, age, ovr),
      transferListed: false,
      listReason: null,
      loanListed: false,
      loanClubId: null,
      loanOwnerClubId: null,
      loanEndDate: null,
      minutesShare: 0,
      ...(isRetired ? { retired: true } : {}),
      attributes: {
        pace: raw.PAC ?? 50,
        passing: raw.PAS ?? 50,
        physical: raw.PHY ?? 50,
        defending: raw.DEF ?? 50,
      },
    };

    index.byId.set(id, player);
    if (isRetired) {
      player.clubId = null;
      player.leagueId = "retired";
      player.transferListed = false;
      player.listReason = null;
      player.loanListed = false;
      player.loanClubId = null;
      player.loanOwnerClubId = null;
      player.loanEndDate = null;
      player.minutesShare = 0;
      touched.add(id);
      continue;
    }
    if (clubId) addTo(index.byClub, clubId, id);
    else index.freeAgents.add(id);
    addTo(index.byGroup, player.group, id);
    addTo(index.byLeague, leagueId, id);
    addTo(index.byRating, ratingBucket(ovr), id);
  }

  return index;
}

let cached: MarketIndex | null = null;

function deactivateRetiredPlayer(index: MarketIndex, player: MarketPlayer): void {
  const id = String(player.id);
  retiredLedgerIds.add(id);
  const normalizedName = normalizePlayerIdentity(player.name);
  if (normalizedName) retiredLedgerNames.add(normalizedName);
  if (player.clubId) removeFrom(index.byClub, player.clubId, id);
  index.freeAgents.delete(id);
  removeFrom(index.byGroup, player.group, id);
  removeFrom(index.byLeague, player.leagueId, id);
  removeFrom(index.byRating, ratingBucket(player.ovr), id);
  player.clubId = null;
  player.leagueId = "retired";
  player.retired = true;
  player.transferListed = false;
  player.listReason = null;
  player.loanListed = false;
  player.loanClubId = null;
  player.loanOwnerClubId = null;
  player.loanEndDate = null;
  player.minutesShare = 0;
  touched.add(id);
}

type RetiredPlayerIdentityRecord = string | number | {
  playerId?: string | number;
  id?: string | number;
  ID?: string | number;
  playerName?: string;
  name?: string;
  Name?: string;
};

/** Reemplaza el ledger al cargar otra carrera y excluye sus retirados de todos los índices activos.
 * Acepta IDs y registros completos: el nombre normalizado protege también ante fichas
 * duplicadas/importadas que conservan el nombre pero llevan un ID diferente. */
export function setRetiredPlayersLedger(players: Iterable<RetiredPlayerIdentityRecord>): void {
  retiredLedgerIds.clear();
  retiredLedgerNames.clear();
  for (const raw of players) {
    const record = typeof raw === "object" && raw !== null ? raw : null;
    const rawId = record ? (record.playerId ?? record.id ?? record.ID) : raw;
    const id = String(rawId ?? "").trim();
    if (id) retiredLedgerIds.add(id);
    const name = normalizePlayerIdentity(record?.playerName ?? record?.name ?? record?.Name);
    if (name) retiredLedgerNames.add(name);
  }
  if (!cached) return;
  for (const player of cached.byId.values()) {
    if (isRetiredIdentity(player.id, player.name)) deactivateRetiredPlayer(cached, player);
  }
}

function insertDynamicMarketPlayer(index: MarketIndex, player: MarketPlayer): void {
  if (index.byId.has(player.id)) return;
  const id = String(player.id);
  if (player.retired) retiredLedgerIds.add(id);
  if (isRetiredIdentity(id, player.name)) {
    retiredLedgerIds.add(id);
    const normalizedName = normalizePlayerIdentity(player.name);
    if (normalizedName) retiredLedgerNames.add(normalizedName);
    const retired = { ...player, id, clubId: null, leagueId: "retired", retired: true as const, transferListed: false, listReason: null, loanListed: false, loanClubId: null, loanOwnerClubId: null, loanEndDate: null, minutesShare: 0 };
    index.byId.set(id, retired);
    touched.add(id);
    return;
  }
  index.byId.set(id, player);
  if (player.clubId) addTo(index.byClub, player.clubId, id);
  else index.freeAgents.add(id);
  addTo(index.byGroup, player.group, id);
  addTo(index.byLeague, player.leagueId, id);
  addTo(index.byRating, ratingBucket(player.ovr), id);
}

/** Devuelve los índices, construyéndolos la primera vez que se piden. */
export function getMarketIndex(): MarketIndex {
  if (!cached) {
    cached = buildIndex();
    for (const player of getDynamicMarketPlayers()) insertDynamicMarketPlayer(cached, player);
  }
  return cached;
}

/** Fuerza la reconstrucción (al cargar otra partida). */
export function resetMarketIndex(): void {
  cached = null;
  touched.clear();
}


/** Registra incrementalmente un jugador creado por la cantera/promoción. */
export function registerDynamicMarketPlayer(player: MarketPlayer): void {
  const normalized = { ...player, id: String(player.id) };
  DYNAMIC_MARKET_BY_ID.set(normalized.id, normalized);
  insertDynamicMarketPlayer(getMarketIndex(), normalized);
}

/** Elimina un jugador dinámico de todos los índices. */
export function unregisterDynamicMarketPlayer(playerId: string): void {
  const index = getMarketIndex();
  const id = String(playerId);
  const player = index.byId.get(id);
  DYNAMIC_MARKET_BY_ID.delete(id);
  if (!player) return;
  index.byId.delete(id);
  if (player.clubId) removeFrom(index.byClub, player.clubId, id);
  index.freeAgents.delete(id);
  removeFrom(index.byGroup, player.group, id);
  removeFrom(index.byLeague, player.leagueId, id);
  removeFrom(index.byRating, ratingBucket(player.ovr), id);
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
  return idsToPlayers(index, index.byClub.get(clubId) ?? [])
    .filter((player) => !player.retired && !["academy", "loaned", "listed"].includes(player.academyStatus ?? ""));
}


/** Salario anual determinista del jugador tal y como lo usa el mercado. */
export function getPlayerAnnualWage(playerId: string): number {
  return getMarketIndex().byId.get(String(playerId))?.contract.wage ?? 0;
}

/** Masa salarial anual estimada de una plantilla. */
export function getClubWageBill(clubId: string): number {
  return getClubPlayers(clubId).reduce((sum, player) => sum + player.contract.wage, 0);
}
/** Jugadores de una liga. */
export function getLeaguePlayers(leagueId: string): MarketPlayer[] {
  const index = getMarketIndex();
  return idsToPlayers(index, index.byLeague.get(leagueId) ?? []).filter((player) => !player.retired);
}

/** Agentes libres. */
export function getFreeAgents(): MarketPlayer[] {
  const index = getMarketIndex();
  return idsToPlayers(index, index.freeAgents).filter((player) => !player.retired);
}

/** Filtro de búsqueda de candidatos. */
export interface CandidateQuery {
  group: PositionGroup;
  /** Club comprador; permite aplicar reglas especiales de elegibilidad. */
  clubId?: string;
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
      if (!player || player.retired) continue;
      if (player.ovr < minOvr || player.ovr > maxOvr) continue;
      if (query.minAge !== undefined && player.age < query.minAge) continue;
      if (query.maxAge !== undefined && player.age > query.maxAge) continue;
      if (query.maxValue !== undefined && player.value > query.maxValue) continue;
      if (player.clubId && excluded.has(player.clubId)) continue;
      if (leagues && !leagues.has(player.leagueId)) continue;
      // Athletic Club solo puede fichar jugadores españoles. Se aplica en el
      // índice para que ningún buscador de candidatos de la IA pueda saltarse
      // la regla por accidente.
      if (query.clubId === "ath" && player.nation.trim().toLowerCase() !== "españa") continue;
      candidates.push(player);
    }
  }

  candidates.sort((a, b) => b.ovr - a.ovr);
  return query.limit ? candidates.slice(0, query.limit) : candidates;
}

// ============================================================================
// ACTUALIZACIÓN INCREMENTAL
// ============================================================================

/**
 * Observador de cambios de club. Lo usa `WorldSync` para replicar en el estado
 * del juego cualquier traspaso que cierre el motor (también los de la IA).
 */
type ClubMoveListener = (playerId: string, clubId: string | null) => void;
let clubMoveListener: ClubMoveListener | null = null;

/** Registra (o quita, con `null`) el observador de cambios de club. */
export function setClubMoveListener(listener: ClubMoveListener | null): void {
  clubMoveListener = listener;
}

/**
 * Suscriptores internos que necesitan invalidar sus propias cachés cuando
 * cambia una plantilla (p. ej. la nacionalidad dominante de `TransferEngine`
 * o los informes de plantilla de `SquadAnalyzer`). A diferencia de
 * `clubMoveListener` (un único observador externo para `WorldSync`), aquí
 * puede haber varios suscriptores y sólo les interesa qué clubes cambiaron.
 */
const squadChangeListeners: Array<(clubIds: readonly string[]) => void> = [];

/** Se llama cuando uno o más clubes cambian de plantilla (ficha entra/sale). */
export function onSquadChanged(listener: (clubIds: readonly string[]) => void): void {
  squadChangeListeners.push(listener);
}

function notifySquadChanged(clubIds: ReadonlyArray<string | null | undefined>): void {
  const ids = Array.from(new Set(clubIds.filter((id): id is string => !!id)));
  if (ids.length === 0) return;
  for (const listener of squadChangeListeners) listener(ids);
}

/** Mueve a un jugador de club manteniendo los índices coherentes. */
export function reassignPlayerClub(
  playerId: string,
  clubId: string | null,
  leagueId?: string,
  options?: { force?: boolean },
): void {
  const index = getMarketIndex();
  const player = index.byId.get(playerId);
  if (!player) return;

  // Una retirada es terminal: no se puede mover ni siquiera a agentes libres.
  if (player.retired || isRetiredIdentity(playerId, player.name)) {
    retiredLedgerIds.add(String(playerId));
    deactivateRetiredPlayer(index, player);
    return;
  }

  const previousClubId = player.clubId;

  // Barrera del club del usuario: nadie entra ni sale de su plantilla si no
  // es dentro de una operación que él haya cerrado (o una sincronización
  // explícita con el estado real de la partida, que pasa `force`).
  if (!options?.force && isBlockedUserMove(previousClubId, clubId)) return;

  if (player.clubId) removeFrom(index.byClub, player.clubId, playerId);
  else index.freeAgents.delete(playerId);
  removeFrom(index.byLeague, player.leagueId, playerId);

  player.clubId = clubId;
  player.leagueId = leagueId ?? (clubId ? player.leagueId : "free");
  player.transferListed = false;
  player.listReason = null;
  player.loanClubId = null;
  player.loanEndDate = null;

  if (clubId) addTo(index.byClub, clubId, playerId);
  else index.freeAgents.add(playerId);
  addTo(index.byLeague, player.leagueId, playerId);
  touched.add(playerId);

  clubMoveListener?.(playerId, clubId);
  // El club que pierde el jugador y el que lo gana ven afectada su
  // nacionalidad dominante, su informe de plantilla, etc.
  notifySquadChanged([previousClubId, clubId]);
}

/** Aplica cambios puntuales a un jugador reindexando lo que haga falta. */
export function updatePlayer(
  playerId: string,
  patch: Partial<MarketPlayer>,
): MarketPlayer | undefined {
  const index = getMarketIndex();
  const player = index.byId.get(playerId);
  if (!player) return undefined;

  // El mercado no debe reactivar ni modificar fichas retiradas; el historial
  // archivado conserva sus estadísticas, pero el jugador deja el mundo activo.
  if (player.retired || isRetiredIdentity(playerId, player.name)) {
    retiredLedgerIds.add(String(playerId));
    deactivateRetiredPlayer(index, player);
    return player;
  }
  if (patch.retired === true) {
    retiredLedgerIds.add(String(playerId));
    Object.assign(player, patch);
    deactivateRetiredPlayer(index, player);
    return player;
  }

  if (patch.ovr !== undefined && patch.ovr !== player.ovr) {
    removeFrom(index.byRating, ratingBucket(player.ovr), playerId);
    addTo(index.byRating, ratingBucket(patch.ovr), playerId);
  }
  if (patch.group !== undefined && patch.group !== player.group) {
    removeFrom(index.byGroup, player.group, playerId);
    addTo(index.byGroup, patch.group, playerId);
  }
  Object.assign(player, patch);
  touched.add(playerId);
  return player;
}

/** Demarcaciones disponibles (reexportado por comodidad del motor). */
export const ALL_POSITION_GROUPS = POSITION_GROUPS;

// ============================================================================
// PERSISTENCIA
// ============================================================================

/** Ids de jugadores cuyo estado ha cambiado respecto a los datos base. */
const touched = new Set<string>();

/** Campos mutables de un jugador que hay que guardar en la partida. */
export interface PlayerDelta {
  id: string;
  clubId: string | null;
  leagueId: string;
  contract: Contract;
  transferListed: boolean;
  listReason: TransferListReason | null;
  loanListed: boolean;
  loanClubId: string | null;
  loanOwnerClubId: string | null;
  loanEndDate: string | null;
  minutesShare: number;
  age?: number;
  retired?: boolean;
}

function deltaOf(player: MarketPlayer): PlayerDelta {
  return {
    id: player.id,
    clubId: player.clubId,
    leagueId: player.leagueId,
    contract: { ...player.contract },
    transferListed: player.transferListed,
    listReason: player.listReason,
    loanListed: player.loanListed,
    loanClubId: player.loanClubId,
    loanOwnerClubId: player.loanOwnerClubId,
    loanEndDate: player.loanEndDate,
    minutesShare: player.minutesShare,
    // Age and retirement are career-scoped mutable fields, not static FC data.
    ...(player.age !== undefined ? { age: player.age } : {}),
    ...(player.retired !== undefined ? { retired: player.retired } : {}),
  };
}

/** Marca a un jugador como modificado (uso interno del motor). */
export function markPlayerDirty(playerId: string): void {
  touched.add(playerId);
}

/**
 * Retira de forma idempotente a los jugadores del ledger de la carrera.
 * Se usa tanto en el cierre de temporada como al restaurar una partida: el
 * ledger del save permite recuperar la retirada incluso si falta el snapshot
 * de IndexedDB del mercado o es de una versión anterior.
 */
export function ensurePlayersRetired(playerIds: Iterable<string | number>): void {
  const ids = [...playerIds].map((rawId) => String(rawId ?? "").trim()).filter(Boolean);
  // Registrar primero todos los IDs: la construcción inicial del índice ya
  // debe saber que no son agentes libres ni jugadores de sus clubes originales.
  for (const id of ids) retiredLedgerIds.add(id);
  const index = getMarketIndex();
  for (const id of ids) {
    const player = index.byId.get(id);
    if (player) deactivateRetiredPlayer(index, player);
  }
}

/** Instantánea de todos los jugadores modificados. */
export function snapshotPlayerDeltas(): PlayerDelta[] {
  const index = getMarketIndex();
  const out: PlayerDelta[] = [];
  for (const id of touched) {
    const player = index.byId.get(id);
    if (player) out.push(deltaOf(player));
  }
  return out;
}

/** Instantánea completa utilizable como checkpoint temporal de una transición. */
export function snapshotAllPlayerDeltas(): PlayerDelta[] {
  const index = getMarketIndex();
  return Array.from(index.byId.values(), (player) => deltaOf(player));
}

/** Reaplica los cambios guardados sobre el índice recién construido. */
export function restorePlayerDeltas(deltas: readonly PlayerDelta[]): void {
  for (const delta of deltas) {
    const index = getMarketIndex();
    const player = index.byId.get(String(delta.id));
    if (!player) continue;
    if (delta.retired === true || isRetiredIdentity(delta.id, player.name)) {
      retiredLedgerIds.add(String(delta.id));
      deactivateRetiredPlayer(index, player);
      continue;
    }

    // Migración de partidas anteriores: antes `clubId` seguía siendo el
    // propietario y `loanClubId` era sólo el destino. Ahora el jugador vive
    // en el destino y guardamos al propietario en `loanOwnerClubId`.
    const legacyLoan = !!delta.loanClubId && !delta.loanOwnerClubId;
    // La retirada manda sobre el club guardado (incluso si un save antiguo
    // dejó clubId con un equipo). Nunca restaurar un retirado como plantilla.
    const effectiveClubId = delta.retired ? null : legacyLoan ? delta.loanClubId : delta.clubId;
    const effectiveLeague = delta.retired
      ? "free"
      : legacyLoan && delta.loanClubId
        ? teamById(delta.loanClubId).league
        : delta.leagueId;
    if (player.clubId !== effectiveClubId || player.leagueId !== effectiveLeague) {
      reassignPlayerClub(delta.id, effectiveClubId, effectiveLeague, { force: true });
    }
    updatePlayer(delta.id, {
      contract: { ...delta.contract },
      transferListed: delta.transferListed,
      listReason: delta.listReason,
      loanListed: delta.loanListed,
      loanClubId: delta.loanClubId,
      loanOwnerClubId: delta.loanOwnerClubId ?? (legacyLoan ? delta.clubId : null),
      loanEndDate: delta.loanEndDate ?? null,
      minutesShare: delta.minutesShare,
      ...(delta.age !== undefined ? { age: delta.age } : {}),
      ...(delta.retired !== undefined ? { retired: delta.retired } : {}),
    });
  }
}

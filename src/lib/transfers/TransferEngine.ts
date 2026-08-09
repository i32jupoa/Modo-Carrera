/**
 * Motor de fichajes.
 *
 * Ciclo completo de una operación desde el punto de vista del club comprador:
 *
 *   necesidad -> búsqueda por índices -> lista corta -> puntuación -> elección
 *   -> negociación (con mejoras y cláusulas) -> decisión del jugador
 *   -> cierre del traspaso, o abandono y alternativa de la lista corta.
 *
 * Nada de lógica de calendario aquí: la simulación diaria decide qué clubes
 * actúan y llama a `runClubTransferCycle`.
 */

import { teamById } from "@/data/teams";
import { transferWindowKey } from "../transferWindows";
import {
  BIG_DEAL_DAILY_LIMIT,
  CONTRACT_RULES,
  DECISION_ACCURACY,
  ELITE_EXIT,
  IDEAL_SQUAD_SHAPE,
  MARKET_TIMING,
  POSITION_AGE_CURVE,
  PRICE_MULTIPLIERS,
  REPUTATION_OVR_FLOOR,
  SCORE_WEIGHTS,
  SEARCH_LIMITS,
  SQUAD_LIMITS,
  STAR_THRESHOLD,
  WAGE_RULES,
} from "./constants";
import { getClubProfile } from "./ClubStrategy";
import { bigSigningSpendCapRatio } from "./MarketPacing";
import {
  canAfford,
  getUserClubId,
  maxSpend,
  maxWageOffer,
  needsToSell,
  registerSale,
  registerSigning,
} from "./BudgetManager";
import {
  findCandidates,
  getClubPlayers,
  getFreeAgents,
  getMarketIndex,
  getPlayer,
  onSquadChanged,
  reassignPlayerClub,
  updatePlayer,
} from "./PlayerIndex";
import { getSquadReport, playerImprovesSquad } from "./SquadAnalyzer";
import {
  coreDeparturesFor,
  isUserApprovedMove,
  recentCoreLossOvr,
  registerCoreDeparture,
  windowDeficit,
} from "./MarketLocks";
import { isAvailable, valuePlayer } from "./MarketValuation";
import { decideOnMove, wageDemand } from "./PlayerDecision";
import {
  applyImprovement,
  createTransferOffer,
  decideImprovement,
  emptyClauses,
  isClosed,
  openNegotiation,
  processCounterOffer,
  proposeClauses,
  withdrawOffer,
} from "./NegotiationEngine";
import {
  clearInterest,
  competitionFor,
  dropInterest,
  escalatedPrice,
  registerInterest,
  sellerShouldWait,
} from "./BidWar";
import { clamp, seededUnit } from "./random";
import {
  POSITION_GROUPS,
  type ClubProfile,
  type MarketPlayer,
  type MarketValuation,
  type PositionGroup,
  type SquadNeed,
  type SquadReport,
  type TransferOffer,
  type TransferRecord,
  type TransferType,
} from "./types";

/** Escala un valor a 0..1 dentro de un rango. */
function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

// ============================================================================
// PUNTUACIÓN DE CANDIDATOS
// ============================================================================

const dominantNations = new Map<string, string>();

/**
 * Traspasos (no cesiones) cerrados entre un comprador y un vendedor
 * concretos dentro de la ventana en curso. Clave: `windowKey:buyerId:sellerId`.
 * Ver `MARKET_TIMING.maxSameSellerPurchasesPerBuyer`.
 */
const buyerSellerDeals = new Map<string, number>();

function buyerSellerKey(date: string, buyerId: string, sellerId: string): string {
  return `${transferWindowKey(date)}:${buyerId}:${sellerId}`;
}

function buyerSellerDealCount(date: string, buyerId: string, sellerId: string): number {
  return buyerSellerDeals.get(buyerSellerKey(date, buyerId, sellerId)) ?? 0;
}

function recordBuyerSellerDeal(date: string, buyerId: string, sellerId: string): void {
  const key = buyerSellerKey(date, buyerId, sellerId);
  buyerSellerDeals.set(key, (buyerSellerDeals.get(key) ?? 0) + 1);
}

// La nacionalidad dominante depende de la plantilla actual. Si no se
// invalida cuando entra o sale un jugador, un club que fiche a varios
// brasileños seguiría "reconociendo como de casa" a la nacionalidad antigua
// durante el resto de la partida. Se limpia sólo la entrada del club
// afectado, no todo el caché.
onSquadChanged((clubIds) => {
  for (const clubId of clubIds) dominantNations.delete(clubId);
});

/** Nacionalidad predominante de la plantilla: define el "jugador de casa". */
export function clubDominantNation(clubId: string): string {
  const cached = dominantNations.get(clubId);
  if (cached !== undefined) return cached;
  const counts = new Map<string, number>();
  for (const player of getClubPlayers(clubId)) {
    if (!player.nation) continue;
    counts.set(player.nation, (counts.get(player.nation) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [nation, count] of counts) {
    if (count > bestCount) {
      best = nation;
      bestCount = count;
    }
  }
  dominantNations.set(clubId, best);
  return best;
}

/** Desglose de la puntuación de un candidato (para depuración y rumores). */
export interface ScoreBreakdown {
  need: number;
  quality: number;
  potential: number;
  age: number;
  price: number;
  wage: number;
  nationality: number;
  league: number;
  prestige: number;
  /** Encaje con la identidad táctica de reclutamiento del club. */
  style: number;
}

/** Candidato puntuado. */
export interface ScoredCandidate {
  player: MarketPlayer;
  group: PositionGroup;
  score: number;
  breakdown: ScoreBreakdown;
  /** Precio de salida estimado. */
  askingPrice: number;
  /** Salario anual que pedirá el jugador. */
  wageDemand: number;
}

/**
 * Preferencia por la edad según el perfil del club y la posición.
 * Un portero de 33 años está en su mejor momento; un extremo de 33, no: cada
 * demarcación tiene su propio tramo de rendimiento óptimo (`POSITION_AGE_CURVE`).
 */
function ageScore(player: MarketPlayer, profile: ClubProfile): number {
  if (player.age <= SQUAD_LIMITS.youngAge)
    return clamp(0.35 + profile.youthPreference * 0.65, 0, 1);

  const curve = POSITION_AGE_CURVE[player.group];
  if (player.age <= curve.peakStart) return 0.8;
  if (player.age <= curve.peakEnd) return 0.85;
  if (player.age <= curve.declineEnd) return clamp(0.45 + profile.veteranPreference * 0.3, 0, 1);
  return clamp(profile.veteranPreference * 0.6, 0, 1);
}

/**
 * Encaje con la identidad táctica del club: media de los atributos del
 * jugador ponderada por lo que ese club valora (posesión pesa `passing`,
 * pressing/contragolpe pesa `pace`, un bloque físico pesa `physical`...).
 * Así un mismo delantero encaja de forma distinta en el Manchester City que
 * en el Atlético, en vez de que todos los clubes busquen exactamente lo mismo.
 */
function styleFitScore(
  attributes: MarketPlayer["attributes"],
  style: ClubProfile["style"],
): number {
  const totalWeight = style.pace + style.passing + style.physical + style.defending;
  if (totalWeight <= 0) return 0.5;
  const weighted =
    (attributes.pace / 99) * style.pace +
    (attributes.passing / 99) * style.passing +
    (attributes.physical / 99) * style.physical +
    (attributes.defending / 99) * style.defending;
  return clamp(weighted / totalWeight, 0, 1);
}

/**
 * Suelo de OVR ligado a la reputación del club (ver `REPUTATION_OVR_FLOOR`).
 * Estable durante toda la ventana, a diferencia de `report.startingRating`,
 * que se recalcula a diario y puede desplomarse si el club pierde varios
 * titulares seguidos en pocos días.
 */
function reputationOvrFloor(profile: ClubProfile): number {
  return REPUTATION_OVR_FLOOR.base + profile.reputation * REPUTATION_OVR_FLOOR.maxBonus;
}

/**
 * ¿Es el candidato de un rival directo de arriba de tabla en la misma liga?
 * Dos clubes "Gigante" de la misma competición casi nunca se traspasan
 * titulares entre sí en la vida real (Real Madrid-Barça, City-Liverpool,
 * Bayern-Dortmund...): la rivalidad deportiva pesa más que el encaje táctico
 * o económico. No se bloquea del todo (alguna vez pasa), pero se penaliza
 * con fuerza en `scoreCandidate` (ver `DECISION_ACCURACY.domesticRivalScorePenalty`).
 */
function isDirectDomesticRival(clubId: string, player: MarketPlayer): boolean {
  if (!player.clubId || player.clubId === clubId) return false;
  if (player.leagueId !== getClubProfile(clubId).leagueId) return false;
  return teamById(clubId).category === "Gigante" && teamById(player.clubId).category === "Gigante";
}

/** Puntúa a un candidato para un club y una necesidad concretas. */
export function scoreCandidate(input: {
  clubId: string;
  player: MarketPlayer;
  need: SquadNeed;
  report: SquadReport;
  cacheKey: string;
  spendCeiling: number;
  wageCeiling: number;
}): ScoredCandidate {
  const { player, need, report, cacheKey } = input;
  const profile = getClubProfile(input.clubId);
  const valuation = valuePlayer(player.id, {
    cacheKey,
    competition: competitionFor(player.id, input.clubId),
  });
  const wage = wageDemand(player.id, input.clubId);

  const breakdown: ScoreBreakdown = {
    need: need.urgency,
    quality: normalize(player.ovr - report.startingRating, -6, 6),
    potential:
      normalize(player.potential - player.ovr, 0, 10) * (0.4 + profile.youthPreference * 0.6),
    age: ageScore(player, profile),
    price: 1 - normalize(valuation.listPrice, 0, Math.max(1, input.spendCeiling)),
    wage: 1 - normalize(wage, 0, Math.max(1, input.wageCeiling)),
    nationality:
      player.nation && player.nation === clubDominantNation(input.clubId)
        ? profile.nationalPreference
        : 1 - profile.nationalPreference * 0.5,
    league:
      player.leagueId === profile.leagueId
        ? profile.leaguePreference
        : 1 - profile.leaguePreference * 0.5,
    prestige: 1 - Math.abs(normalize(player.ovr, 60, 92) - profile.reputation),
    style: styleFitScore(player.attributes, profile.style),
  };

  const score =
    breakdown.need * SCORE_WEIGHTS.need +
    breakdown.quality * SCORE_WEIGHTS.quality +
    breakdown.potential * SCORE_WEIGHTS.potential +
    breakdown.age * SCORE_WEIGHTS.age +
    breakdown.price * SCORE_WEIGHTS.price +
    breakdown.wage * SCORE_WEIGHTS.wage +
    breakdown.nationality * SCORE_WEIGHTS.nationality +
    breakdown.league * SCORE_WEIGHTS.league +
    breakdown.prestige * SCORE_WEIGHTS.prestige +
    breakdown.style * SCORE_WEIGHTS.style;

  // Ningún director deportivo es perfectamente racional: a veces un club se
  // encandila con un nombre conocido más allá de si encaja de verdad.
  const starstruck =
    player.ovr >= STAR_THRESHOLD - 4 &&
    seededUnit(input.clubId, player.id, cacheKey, "starstruck") <
      DECISION_ACCURACY.starstruckChance;
  const withStarstruck = starstruck ? score + DECISION_ACCURACY.starstruckBonus : score;

  // Reemplazo reactivo: si el club acaba de perder a un jugador de nivel en
  // esta demarcación, se prima a los candidatos de nivel parecido al que se
  // fue (el "sustituto natural"), no sólo al que más mejora la media actual.
  const lossOvr = recentCoreLossOvr(input.clubId, need.group);
  const replacementBonus =
    lossOvr > 0 ? clamp(1 - Math.abs(player.ovr - lossOvr) / 10, 0, 1) * 0.12 : 0;

  // Ruido de ojeador: baraja el orden entre candidatos de nivel similar de
  // forma estable dentro de una misma partida (ver `DECISION_ACCURACY.
  // scoutingNoise`), para que no sea siempre el mismo puñado de nombres el
  // que se lleva todos los traspasos caros en cada partida nueva.
  const scoutingNoise =
    (seededUnit(input.clubId, player.id, "scout-noise") - 0.5) * DECISION_ACCURACY.scoutingNoise;

  const withBonuses = withStarstruck + replacementBonus + scoutingNoise;
  const finalScore = isDirectDomesticRival(input.clubId, player)
    ? withBonuses - DECISION_ACCURACY.domesticRivalScorePenalty
    : withBonuses;

  return {
    player,
    group: player.group,
    score: Math.round(clamp(finalScore, 0, 1) * 1000) / 1000,
    breakdown,
    askingPrice: valuation.listPrice,
    wageDemand: wage,
  };
}

// ============================================================================
// MEMORIA DE INTENTOS
// ----------------------------------------------------------------------------
// Sin esto, un club evalúa la lista corta cada día sin recordar los intentos
// fallidos: si un jugador puntúa muy alto, puede recibir una oferta idéntica
// a diario aunque la rechazara ayer. Se guarda el último desenlace negativo
// por pareja club-jugador y se respeta un periodo de enfriamiento antes de
// volver a intentarlo; el periodo depende de por qué se rompió el intento.
// ============================================================================

/** Motivos de fracaso que activan un enfriamiento (no aplica a "unavailable"). */
type CooldownOutcome = "rejected-by-club" | "rejected-by-player" | "too-expensive";

const PURSUIT_COOLDOWN_DAYS: Record<CooldownOutcome, number> = {
  "rejected-by-club": 21,
  "rejected-by-player": 30,
  "too-expensive": 14,
};

/** Último intento fallido de un club por un jugador. */
export interface PursuitMemoryEntry {
  clubId: string;
  playerId: string;
  date: string;
  outcome: CooldownOutcome;
}

/** `clubId:playerId` -> último intento fallido. */
const pursuitMemory = new Map<string, PursuitMemoryEntry>();

function pursuitKey(clubId: string, playerId: string): string {
  return `${clubId}:${playerId}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

function isCooldownOutcome(outcome: PursuitOutcome): outcome is CooldownOutcome {
  return (
    outcome === "rejected-by-club" ||
    outcome === "rejected-by-player" ||
    outcome === "too-expensive"
  );
}

/** ¿Sigue el club en periodo de espera tras un rechazo reciente de este jugador? */
export function isPursuitOnCooldown(clubId: string, playerId: string, date: string): boolean {
  const entry = pursuitMemory.get(pursuitKey(clubId, playerId));
  if (!entry) return false;
  return daysBetween(entry.date, date) < PURSUIT_COOLDOWN_DAYS[entry.outcome];
}

function rememberPursuit(
  clubId: string,
  playerId: string,
  date: string,
  outcome: PursuitOutcome,
): void {
  if (!isCooldownOutcome(outcome)) return;
  pursuitMemory.set(pursuitKey(clubId, playerId), { clubId, playerId, date, outcome });
}

/** Instantánea de la memoria de intentos (para persistir entre partidas). */
export function snapshotPursuitMemory(): PursuitMemoryEntry[] {
  return Array.from(pursuitMemory.values());
}

/** Restaura la memoria de intentos de una partida guardada. */
export function restorePursuitMemory(entries: readonly PursuitMemoryEntry[]): void {
  pursuitMemory.clear();
  for (const entry of entries)
    pursuitMemory.set(pursuitKey(entry.clubId, entry.playerId), { ...entry });
}

// ============================================================================
// BÚSQUEDA Y LISTA CORTA
// ============================================================================

/** Opciones de búsqueda de objetivos. */
export interface ShortlistOptions {
  cacheKey: string;
  /** Limita la búsqueda a estas ligas. */
  leagueIds?: readonly string[];
  /** Tamaño máximo de la lista corta. */
  size?: number;
  /** Últimos días de la ventana: sin restricción de ritmo en fichajes grandes. */
  deadlineDay?: boolean;
}

/**
 * Construye la lista corta para una necesidad concreta.
 * La búsqueda usa los índices por demarcación y rating, filtra por
 * disponibilidad real y descarta lo que no mejora la plantilla.
 */
export function buildShortlist(
  clubId: string,
  need: SquadNeed,
  options: ShortlistOptions,
): ScoredCandidate[] {
  const report = getSquadReport(clubId, options.cacheKey);
  const profile = getClubProfile(clubId);
  const spendCeiling = maxSpend(clubId);
  const wageCeiling = maxWageOffer(clubId);

  // Ritmo de fichajes grandes: al principio de la ventana sólo se compromete
  // una fracción del techo de gasto en una sola operación (ver
  // `MarketPacing`), así que los "bombazos" no se cierran todos en los
  // primeros días. Una necesidad crítica arranca con más margen, y el
  // deadline day no tiene restricción.
  const bigCapRatio = bigSigningSpendCapRatio(clubId, options.cacheKey, {
    deadlineDay: options.deadlineDay,
    critical: need.priority === "critical",
  });
  const effectiveSpendCeiling = Math.round(spendCeiling * bigCapRatio);

  // Rango de calidad: nadie busca por debajo de su banquillo ni muy por encima
  // de lo que su reputación le permite atraer. El suelo también respeta la
  // reputación del club (estable), no sólo el rating del once recalculado a
  // diario: así un club como el Real Madrid no se pone a mirar suplentes de
  // ligas menores sólo porque acaba de perder a varios titulares seguidos en
  // la misma ventana.
  const minOvr = Math.round(
    Math.max(58, report.startingRating - 4, reputationOvrFloor(profile) - REPUTATION_OVR_FLOOR.shortlistSlack),
  );
  const maxOvr = Math.round(
    clamp(report.startingRating + 6 + profile.reputation * 4, minOvr + 2, 99),
  );

  // Los jugadores del club del usuario nunca entran en la lista corta de la
  // IA: un fichaje del usuario sólo puede salir de una oferta explícita que
  // el usuario acepte (ver `UserNegotiation`), nunca de esta búsqueda
  // automática club-contra-club.
  const userClubId = getUserClubId();
  const excludeClubIds = userClubId && userClubId !== clubId ? [clubId, userClubId] : [clubId];

  const candidates = findCandidates({
    group: need.group,
    minOvr,
    maxOvr,
    maxValue: effectiveSpendCeiling,
    excludeClubIds,
    leagueIds: options.leagueIds,
    limit: SEARCH_LIMITS.candidatesPerNeed,
  });

  const buyerContext = {
    clubId,
    spendCeiling: effectiveSpendCeiling,
    critical: need.priority === "critical",
  };

  const scored: ScoredCandidate[] = [];
  for (const player of candidates) {
    if (!isAvailable(player.id, options.cacheKey, buyerContext)) continue;
    if (isPursuitOnCooldown(clubId, player.id, options.cacheKey)) continue;
    if (!playerImprovesSquad(report, player)) continue;
    // No más de N traspasos con el mismo vendedor en la misma ventana: evita
    // que un rival se lleve dos o tres titulares del mismo club de golpe.
    if (
      player.clubId &&
      buyerSellerDealCount(options.cacheKey, clubId, player.clubId) >=
        MARKET_TIMING.maxSameSellerPurchasesPerBuyer
    )
      continue;
    if (player.contract.wage > wageCeiling * 1.4) continue;
    const entry = scoreCandidate({
      clubId,
      player,
      need,
      report,
      cacheKey: options.cacheKey,
      spendCeiling,
      wageCeiling,
    });
    if (entry.score < SEARCH_LIMITS.minimumScore) continue;
    if (entry.askingPrice > effectiveSpendCeiling) continue;
    scored.push(entry);
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, options.size ?? SEARCH_LIMITS.shortlistSize);
}

/** Necesidades que el club va a atacar hoy, de más a menos urgente. */
export function priorityNeeds(clubId: string, cacheKey: string, limit = 2): SquadNeed[] {
  const report = getSquadReport(clubId, cacheKey);
  return report.needs
    .slice()
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, limit);
}

/**
 * Necesidad "blanda" para fichajes especulativos de mercado avanzado: a
 * diferencia de `priorityNeeds` (que sólo devuelve huecos por encima del
 * umbral de urgencia, 0.15), esto señala el grupo con la media más floja
 * respecto al resto de la plantilla aunque no llegue a ese umbral. Se usa
 * para que un club con la plantilla ya cubierta pueda seguir mirando
 * refuerzos de rotación en agosto — como en la vida real — en vez de
 * desaparecer del mercado en cuanto cierra sus urgencias.
 */
export function weakestGroupNeed(clubId: string, cacheKey: string): SquadNeed | null {
  const report = getSquadReport(clubId, cacheKey);
  let weakest: SquadNeed | null = null;
  let worstGap = -Infinity;
  for (const group of POSITION_GROUPS) {
    const shape = IDEAL_SQUAD_SHAPE[group];
    if (report.countByGroup[group] >= shape.max) continue;
    if (report.countByGroup[group] === 0) continue; // ya cubierto por priorityNeeds
    const gap = report.startingRating - report.ratingByGroup[group];
    if (gap > worstGap) {
      worstGap = gap;
      weakest = {
        group,
        urgency: clamp(gap / 10, 0, 1),
        count: report.countByGroup[group],
        quality: report.ratingByGroup[group],
        priority: "low",
      };
    }
  }
  return weakest;
}

/**
 * Ciclo especulativo: un único intento de mejorar el grupo más flojo de la
 * plantilla, sin exigir que la necesidad sea urgente. Lo usa la simulación
 * diaria para dar algo de vida al mercado en agosto, cuando ya no quedan
 * huecos "de verdad" pero un club ambicioso seguiría mirando refuerzos.
 */
export function runClubOpportunisticCycle(
  clubId: string,
  options: ClubCycleOptions,
): ClubCycleResult {
  const result: ClubCycleResult = { clubId, transfers: [], attempts: [], shortlisted: 0 };
  const need = weakestGroupNeed(clubId, options.date);
  if (!need || need.urgency <= 0.1) return result;

  const shortlist = buildShortlist(clubId, need, {
    cacheKey: options.date,
    deadlineDay: options.deadlineDay,
  });
  result.shortlisted = shortlist.length;
  const candidate = shortlist[0];
  if (!candidate) return result;

  const attempt = pursueTarget(clubId, candidate.player.id, {
    date: options.date,
    deadlineDay: options.deadlineDay,
    critical: need.priority === "critical",
  });
  result.attempts.push(attempt);
  if (attempt.outcome === "signed" && attempt.record) result.transfers.push(attempt.record);
  return result;
}

// ============================================================================
// NEGOCIACIÓN COMPLETA POR UN OBJETIVO
// ============================================================================

export type PursuitOutcome =
  | "signed"
  | "rejected-by-club"
  | "rejected-by-player"
  | "too-expensive"
  | "waiting"
  | "unavailable";

/** Resultado de perseguir a un objetivo. */
export interface PursuitResult {
  outcome: PursuitOutcome;
  playerId: string;
  clubId: string;
  /** Traspaso cerrado, si se ha firmado. */
  record: TransferRecord | null;
  /** Última oferta puesta sobre la mesa. */
  offer: TransferOffer | null;
  rounds: number;
  message: string;
}

/** Opciones de una persecución. */
export interface PursuitOptions {
  date: string;
  deadlineDay?: boolean;
  /** Tipo de operación (permanente por defecto). */
  type?: TransferType;
  /**
   * La necesidad que motiva esta persecución es crítica para el comprador.
   * Repite en `pursueTarget` la misma condición ya evaluada en
   * `buildShortlist` para que un jugador clave que sólo se destapó ahí por
   * tratarse de una necesidad crítica no se vuelva a bloquear aquí por no
   * pasársela.
   */
  critical?: boolean;
}

/**
 * Intenta fichar a un jugador concreto: abre la negociación, mejora la oferta
 * mientras el precio siga dentro de su techo y consulta al jugador antes de
 * firmar. Si el vendedor cierra la puerta o el precio se va, abandona.
 */
export function pursueTarget(
  clubId: string,
  playerId: string,
  options: PursuitOptions,
): PursuitResult {
  const player = getPlayer(playerId);
  const cacheKey = options.date;

  const fail = (
    outcome: PursuitOutcome,
    message: string,
    offer: TransferOffer | null,
    rounds = 0,
  ): PursuitResult => {
    rememberPursuit(clubId, playerId, options.date, outcome);
    return { outcome, playerId, clubId, record: null, offer, rounds, message };
  };

  if (!player) return fail("unavailable", "El jugador no existe.", null);
  if (player.clubId === clubId) return fail("unavailable", "Ya pertenece al club.", null);
  // Cinturón y tirantes: aunque `buildShortlist` ya nunca debería proponer a
  // un jugador del usuario, esta comprobación cierra la puerta por completo.
  // Ningún club rival puede llevarse a un jugador del usuario sin pasar por
  // una oferta que el usuario acepte explícitamente.
  const userClubId = getUserClubId();
  if (userClubId && player.clubId === userClubId && clubId !== userClubId) {
    return fail("unavailable", `${player.name} pertenece a tu club: no se puede fichar sin tu acuerdo.`, null);
  }
  const buyerContext = {
    clubId,
    spendCeiling: maxSpend(clubId),
    critical: options.critical ?? false,
  };
  if (!isAvailable(playerId, cacheKey, buyerContext)) {
    return fail("unavailable", `${player.name} no está en el mercado.`, null);
  }

  // El vendedor también tiene voz: ningún club se queda sin plantilla ni
  // encadena salidas sin reponer. Si ya ha perdido más gente de la que ha
  // fichado en esta ventana, cierra la puerta hasta que se refuerce.
  let isCoreDeparture = false;
  if (player.clubId) {
    const sellerReport = getSquadReport(player.clubId, cacheKey);
    if (sellerReport.size <= SQUAD_LIMITS.minSquadSize) {
      return fail("unavailable", `${teamById(player.clubId).name} no puede quedarse sin efectivos.`, null);
    }
    if (windowDeficit(player.clubId) >= MARKET_TIMING.maxWindowDeficit) {
      return fail(
        "unavailable",
        `${teamById(player.clubId).name} no venderá a nadie más hasta reforzarse.`,
        null,
      );
    }
    // El jugador no es un descarte claro de plantilla (no está en las listas
    // de transferibles/cedibles del análisis): es un titular o casi. Un club
    // sólo se desprende de un puñado de esos por ventana, no de media
    // alineación — ver `maxCoreDeparturesPerWindow`.
    isCoreDeparture =
      !sellerReport.transferables.includes(playerId) && !sellerReport.loanables.includes(playerId);
    if (
      isCoreDeparture &&
      coreDeparturesFor(player.clubId) >= MARKET_TIMING.maxCoreDeparturesPerWindow
    ) {
      return fail(
        "unavailable",
        `${teamById(player.clubId).name} ya ha soltado suficientes titulares esta ventana.`,
        null,
      );
    }
  }
  const sellerIdForCoreTracking = player.clubId;

  const profile = getClubProfile(clubId);
  const spendCeiling = maxSpend(clubId);
  const wageCeiling = maxWageOffer(clubId);
  const wageAsked = wageDemand(playerId, clubId);

  if (wageAsked > wageCeiling) {
    return fail("too-expensive", `${player.name} pide una ficha fuera del tope salarial.`, null);
  }

  let valuation = valuePlayer(playerId, {
    cacheKey,
    competition: competitionFor(playerId, clubId),
    deadlineDay: options.deadlineDay,
  });

  // Oferta de salida: por debajo de lo esperado, pero nunca insultante, y
  // siempre por encima de las pujas rivales si hay competencia. Algunos días
  // un club negocia peor de lo habitual y sale a pagar de más en vez de
  // abrir bajo y regatear (errores de juicio reales, no un club infalible).
  const generousMood =
    seededUnit(clubId, playerId, cacheKey, "generous-mood") < DECISION_ACCURACY.generousMoodChance;
  const openingMultiplier =
    0.8 + profile.aggression * 0.15 + (generousMood ? DECISION_ACCURACY.generousMoodBoost : 0);
  const opening = escalatedPrice(
    playerId,
    clubId,
    Math.max(valuation.minimumPrice, valuation.expectedPrice * openingMultiplier),
  );

  if (opening > spendCeiling || !canAfford(clubId, opening, wageAsked)) {
    return fail("too-expensive", `${player.name} está fuera del alcance económico del club.`, null);
  }

  const clauses =
    options.type && options.type !== "permanent" && options.type !== "free"
      ? emptyClauses()
      : proposeClauses(
          clubId,
          valuation,
          Math.max(0, valuation.expectedPrice - opening),
          `${clubId}-${playerId}`,
        );

  const offer = createTransferOffer({
    playerId,
    playerName: player.name,
    fromClubId: clubId,
    toClubId: player.clubId ?? "",
    amount: player.clubId ? opening : 0,
    // El comprador endulza la ficha desde el principio si puede permitírselo:
    // es más barato convencer al jugador con salario que subir el traspaso.
    wageOffer: Math.round(
      Math.min(
        wageCeiling,
        wageAsked * (WAGE_RULES.moveRaise + (profile.buyingWillingness - 1) * 0.15),
      ),
    ),
    type: options.type ?? (player.clubId ? "permanent" : "free"),
    clauses,
    date: options.date,
  });

  registerInterest({
    clubId,
    playerId,
    amount: offer.amount,
    wageOffer: offer.wageOffer,
    date: options.date,
  });
  const negotiation = openNegotiation(offer, valuation, options.date);

  // Agente libre: no hay club vendedor, sólo hay que convencer al jugador.
  if (!player.clubId) {
    return closeWithPlayerDecision(offer, valuation, options, negotiation.rounds);
  }

  let rounds = 0;
  while (rounds < MARKET_TIMING.maxNegotiationRounds) {
    rounds += 1;
    const response = processCounterOffer(offer, valuation);
    negotiation.rounds = rounds;
    negotiation.lastUpdate = options.date;

    if (response.status === "accepted") {
      const sellerId = player.clubId;
      const urgent = needsToSell(sellerId);
      if (
        !options.deadlineDay &&
        sellerShouldWait(playerId, sellerId, offer.amount, valuation.expectedPrice, urgent)
      ) {
        offer.status = "pending";
        return {
          outcome: "waiting",
          playerId,
          clubId,
          record: null,
          offer,
          rounds,
          message: `${teamById(sellerId).name} espera mejores ofertas por ${player.name}.`,
        };
      }
      if (!options.deadlineDay && !canCloseBigDeal(options.date, offer.amount)) {
        offer.status = "pending";
        return {
          outcome: "waiting",
          playerId,
          clubId,
          record: null,
          offer,
          rounds,
          message: `${teamById(sellerId).name} y ${teamById(clubId).name} tienen acuerdo por ${player.name}, pero el anuncio se retrasa: hoy ya hay demasiados bombazos en el mercado.`,
        };
      }
      const closed = closeWithPlayerDecisionAndTrack(
        offer,
        valuation,
        options,
        rounds,
        sellerIdForCoreTracking,
        isCoreDeparture,
        player.group,
        player.ovr,
        player.name,
      );
      if (closed.outcome === "signed") recordBigDeal(options.date, offer.amount);
      return closed;
    }

    if (isClosed(response.status) || response.status === "final-rejection") {
      withdrawOffer(offer);
      dropInterest(playerId, clubId);
      return fail("rejected-by-club", response.message, offer, rounds);
    }

    const decision = decideImprovement(offer, response, valuation, spendCeiling);
    if (decision.action === "withdraw") {
      withdrawOffer(offer);
      dropInterest(playerId, clubId);
      return fail("too-expensive", decision.message, offer, rounds);
    }
    if (decision.action === "hold") {
      offer.status = "pending";
      return {
        outcome: "waiting",
        playerId,
        clubId,
        record: null,
        offer,
        rounds,
        message: decision.message,
      };
    }

    applyImprovement(offer, decision);
    registerInterest({
      clubId,
      playerId,
      amount: offer.amount,
      wageOffer: offer.wageOffer,
      date: options.date,
    });
    valuation = valuePlayer(playerId, {
      cacheKey,
      competition: competitionFor(playerId, clubId),
      deadlineDay: options.deadlineDay,
    });
  }

  withdrawOffer(offer);
  dropInterest(playerId, clubId);
  return fail("rejected-by-club", `No hay acuerdo por ${player.name}.`, offer, rounds);
}

/** Igual que `closeWithPlayerDecision`, pero además lleva la cuenta de
 *  salidas "de nivel" del club vendedor si el fichaje se cierra. */
function closeWithPlayerDecisionAndTrack(
  offer: TransferOffer,
  valuation: MarketValuation,
  options: PursuitOptions,
  rounds: number,
  sellerId: string | null,
  isCoreDeparture: boolean,
  departingGroup: PositionGroup,
  departingOvr: number,
  departingName: string,
): PursuitResult {
  const result = closeWithPlayerDecision(offer, valuation, options, rounds);
  if (result.outcome === "signed" && isCoreDeparture && sellerId) {
    registerCoreDeparture(sellerId, departingGroup, departingOvr, departingName);
  }
  return result;
}

// ============================================================================
// REPARTO DE "BOMBAZOS" POR DÍA
// ============================================================================

/** Día para el que se lleva la cuenta de bombazos anunciados. */
let bigDealDayKey = "";
/** Bombazos ya anunciados en `bigDealDayKey`. */
let bigDealsToday = 0;

function rollBigDealCounterIfNeeded(date: string): void {
  if (date !== bigDealDayKey) {
    bigDealDayKey = date;
    bigDealsToday = 0;
  }
}

/**
 * ¿Puede anunciarse hoy una operación de esta cuantía? Las operaciones por
 * debajo de `BIG_DEAL_DAILY_LIMIT.minFee` nunca se ven afectadas: el tope
 * sólo existe para que los fichajes estrella no se amontonen todos en el
 * mismo día en todo el mercado.
 */
function canCloseBigDeal(date: string, amount: number): boolean {
  if (amount < BIG_DEAL_DAILY_LIMIT.minFee) return true;
  rollBigDealCounterIfNeeded(date);
  return bigDealsToday < BIG_DEAL_DAILY_LIMIT.maxPerDay;
}

/** Registra un bombazo ya cerrado hoy (no hace nada si no llega al umbral). */
function recordBigDeal(date: string, amount: number): void {
  if (amount < BIG_DEAL_DAILY_LIMIT.minFee) return;
  rollBigDealCounterIfNeeded(date);
  bigDealsToday += 1;
}

/** Reinicia el contador de bombazos (nueva partida). */
export function resetBigDealPacing(): void {
  bigDealDayKey = "";
  bigDealsToday = 0;
}

/** Con acuerdo entre clubes, decide el jugador. */
function closeWithPlayerDecision(
  offer: TransferOffer,
  valuation: MarketValuation,
  options: PursuitOptions,
  rounds: number,
): PursuitResult {
  const decision = decideOnMove({
    playerId: offer.playerId,
    toClubId: offer.fromClubId,
    wageOffer: offer.wageOffer,
    cacheKey: options.date,
    loan: offer.type !== "permanent" && offer.type !== "free",
    deadlineDay: options.deadlineDay,
  });

  if (
    decision.verdict === "negotiating" &&
    decision.wageRequested <= maxWageOffer(offer.fromClubId)
  ) {
    // El club sube la ficha para cerrar: es más barato que subir el traspaso.
    offer.wageOffer = Math.round(decision.wageRequested * WAGE_RULES.moveRaise);
  } else if (decision.verdict !== "accepted") {
    withdrawOffer(offer);
    dropInterest(offer.playerId, offer.fromClubId);
    rememberPursuit(offer.fromClubId, offer.playerId, options.date, "rejected-by-player");
    return {
      outcome: "rejected-by-player",
      playerId: offer.playerId,
      clubId: offer.fromClubId,
      record: null,
      offer,
      rounds,
      message: decision.message,
    };
  }

  const record = completeTransfer(offer, options.date);
  return {
    outcome: "signed",
    playerId: offer.playerId,
    clubId: offer.fromClubId,
    record,
    offer,
    rounds,
    message: record
      ? `${offer.playerName} firma por ${teamById(offer.fromClubId).name}.`
      : "El traspaso no pudo completarse.",
  };
}

// ============================================================================
// CIERRE DEL TRASPASO
// ============================================================================

/** Duración del nuevo contrato según la edad. */
function contractYearsFor(age: number): number {
  const entry = CONTRACT_RULES.yearsByAge.find((row) => age <= row.maxAge);
  return entry ? entry.years : CONTRACT_RULES.minYears;
}

/**
 * Aplica un acuerdo al mundo del mercado: mueve al jugador (y a los incluidos
 * en el intercambio), le firma contrato nuevo y ajusta las cuentas de ambos
 * clubes. Devuelve el registro del traspaso.
 */
export function completeTransfer(offer: TransferOffer, date: string): TransferRecord | null {
  const player = getPlayer(offer.playerId);
  if (!player) return null;

  const buyerId = offer.fromClubId;
  const sellerId = player.clubId;

  // Barrera final: un jugador del usuario sólo cambia de club dentro de una
  // operación que él haya cerrado (`UserNegotiation`). Cualquier otra vía
  // —IA, cesiones, obligaciones de compra— queda anulada aquí.
  const userClub = getUserClubId();
  if (userClub && sellerId === userClub && buyerId !== userClub && !isUserApprovedMove()) {
    return null;
  }
  const buyerLeague = teamById(buyerId).league;
  const isLoan =
    offer.type === "loan" || offer.type === "loan-option" || offer.type === "loan-obligation";

  const record: TransferRecord = {
    id: `tr-${offer.id}`,
    date,
    playerId: player.id,
    playerName: player.name,
    fromClubId: sellerId,
    toClubId: buyerId,
    fee: offer.amount,
    wage: offer.wageOffer,
    type: offer.type,
    clauses: offer.clauses,
  };

  // Jugadores incluidos en el intercambio: viajan en sentido contrario.
  if (sellerId) {
    for (const swapId of offer.clauses.playerSwapIds) {
      const swap = getPlayer(swapId);
      if (!swap || swap.clubId !== buyerId) continue;
      reassignPlayerClub(swapId, sellerId, teamById(sellerId).league);
      updatePlayer(swapId, { minutesShare: 0 });
    }
  }

  if (isLoan) {
    updatePlayer(player.id, {
      loanClubId: buyerId,
      loanListed: false,
      minutesShare: 0,
    });
  } else {
    reassignPlayerClub(player.id, buyerId, buyerLeague);
    updatePlayer(player.id, {
      minutesShare: 0,
      loanClubId: null,
      loanListed: false,
      contract: {
        yearsLeft: contractYearsFor(player.age),
        wage: offer.wageOffer,
        releaseClause: Math.round(
          Math.max(player.value, offer.amount) * CONTRACT_RULES.releaseClauseFactor,
        ),
        signingBonus: Math.round(offer.wageOffer * CONTRACT_RULES.signingBonusShare),
      },
    });
  }

  registerSigning(buyerId, offer.amount, offer.wageOffer);
  if (sellerId && !isLoan) {
    registerSale(sellerId, offer.amount, player.contract.wage);
    if (sellerId !== buyerId) recordBuyerSellerDeal(date, buyerId, sellerId);
  }

  offer.status = "accepted";
  clearInterest(player.id);
  return record;
}

// ============================================================================
// CICLO DE UN CLUB
// ============================================================================

/** Resultado del ciclo de fichajes de un club. */
export interface ClubCycleResult {
  clubId: string;
  /** Traspasos cerrados. */
  transfers: TransferRecord[];
  /** Intentos realizados (incluye abandonos). */
  attempts: PursuitResult[];
  /** Objetivos evaluados. */
  shortlisted: number;
}

/** Opciones del ciclo diario de un club. */
export interface ClubCycleOptions {
  date: string;
  deadlineDay?: boolean;
  /** Máximo de fichajes a intentar cerrar en este ciclo. */
  maxSignings?: number;
  /**
   * El club todavía no ha cerrado su cupo mínimo de fichajes de la ventana
   * (ver `minSigningsFor` en `MarketSimulation`). Si es así, el ciclo se
   * ejecuta aunque el club necesite hacer caja: el cupo mínimo no puede
   * quedar bloqueado indefinidamente por la salud financiera del club.
   */
  belowMinimum?: boolean;
}

/**
 * Un club revisa sus necesidades, elige objetivos y negocia.
 * Si el primero de la lista se cae, prueba con la alternativa.
 */
export function runClubTransferCycle(clubId: string, options: ClubCycleOptions): ClubCycleResult {
  const result: ClubCycleResult = { clubId, transfers: [], attempts: [], shortlisted: 0 };
  const cacheKey = options.date;
  const maxSignings = options.maxSignings ?? 1;
  const report = getSquadReport(clubId, cacheKey);

  // Techo duro de plantilla: por muy "crítica" que el análisis marque una
  // necesidad, ningún club ficha por encima de este tamaño. Sin este límite
  // incondicional, una necesidad que no se cierra del todo con un fichaje de
  // nivel bajo (típico de la red de seguridad) podía repetirse día tras día
  // sin fin y disparar la plantilla a decenas de jugadores en una misma
  // demarcación.
  if (report.size >= SQUAD_LIMITS.maxSquadSize + 2) return result;

  // Con la plantilla saturada sólo se ficha para tapar un agujero grave, y
  // ningún club compra mientras necesite hacer caja.
  const needs = priorityNeeds(clubId, cacheKey);
  const urgentOnly = report.size >= SQUAD_LIMITS.maxSquadSize;
  // Un club al que le faltan jugadores ficha aunque tenga que hacer caja: la
  // prioridad es mantener una plantilla completa, no el balance.
  const understaffed =
    report.size < SQUAD_LIMITS.minSquadSize + 4 || windowDeficit(clubId) > 0;
  // Tampoco se congela del todo si el club sigue por debajo de su cupo
  // mínimo de fichajes de la ventana (`belowMinimum`, calculado por la
  // simulación diaria): antes este corte era total —ni siquiera una
  // necesidad crítica se atendía—, así que un club con la masa salarial
  // ajustada (habitual en los clubes grandes, que gastan cerca del tope)
  // podía pasarse la ventana entera sin fichar nada y sin que la red de
  // seguridad de fichajes (limitada a agentes libres de su nivel, casi
  // inexistentes para un club top) pudiera compensarlo nunca.
  const mustBuyRegardless = understaffed || (options.belowMinimum ?? false);
  const hasUrgentNeed = needs.some(
    (need) => need.priority === "critical" || need.priority === "high",
  );
  if (needsToSell(clubId) && !mustBuyRegardless && !hasUrgentNeed) return result;
  // Con la caja apretada, sólo se atienden agujeros de verdad (crítico o
  // alto) salvo que el club esté obligado a comprar igualmente.
  const restrictToUrgent = urgentOnly || (needsToSell(clubId) && !mustBuyRegardless);

  for (const need of needs) {
    if (restrictToUrgent && need.priority !== "critical" && need.priority !== "high") continue;
    if (result.transfers.length >= maxSignings) break;
    const shape = IDEAL_SQUAD_SHAPE[need.group];
    if (need.count >= shape.max) continue;

    const shortlist = buildShortlist(clubId, need, { cacheKey, deadlineDay: options.deadlineDay });
    result.shortlisted += shortlist.length;

    for (const candidate of shortlist) {
      const attempt = pursueTarget(clubId, candidate.player.id, {
        date: options.date,
        deadlineDay: options.deadlineDay,
        critical: need.priority === "critical",
      });
      result.attempts.push(attempt);
      if (attempt.outcome === "signed" && attempt.record) {
        result.transfers.push(attempt.record);
        break;
      }
      // "waiting" mantiene la negociación viva: no se prueba alternativa hoy.
      if (attempt.outcome === "waiting") break;
    }
  }

  return result;
}

/**
 * Último recurso de un club que se ha quedado sin hacer nada en la ventana:
 * firmar a un agente libre que encaje en su necesidad principal. No hay club
 * vendedor que pueda bloquear la operación, así que sirve para que ningún
 * equipo termine el mercado completamente parado.
 */
export function signBestFreeAgent(clubId: string, date: string): TransferRecord | null {
  const report = getSquadReport(clubId, date);
  if (report.size >= SQUAD_LIMITS.maxSquadSize) return null;

  const wageCeiling = maxWageOffer(clubId);
  const profile = getClubProfile(clubId);
  let needs: SquadNeed[] = priorityNeeds(clubId, date, 3);
  // Cuando el análisis de plantilla no ve ningún agujero pero el club sigue
  // por debajo de su cupo mínimo de fichajes de la ventana, se ignora el
  // filtro de "hueco libre por demarcación": un club de sobra completo
  // también ficha profundidad de vez en cuando en la vida real. El único
  // límite real sigue siendo el tamaño máximo de plantilla, ya comprobado
  // arriba.
  const ignoreShapeCap = needs.length === 0;
  if (ignoreShapeCap) {
    needs = POSITION_GROUPS.map((group) => ({
      group,
      urgency: 0,
      count: report.countByGroup[group],
      quality: report.ratingByGroup[group],
      priority: "low" as const,
    })).sort((a, b) => a.count - b.count);
  }

  for (const need of needs) {
    const shape = IDEAL_SQUAD_SHAPE[need.group];
    if (!ignoreShapeCap && need.count >= shape.max) continue;

    // Nada de estrellas: se busca al mejor agente libre que encaje con el
    // nivel real de la plantilla, que es el que puede decir que sí. Pero
    // tampoco al revés: si no hay ningún agente libre cerca de ese nivel, no
    // se fuerza el fichaje del "menos malo" (ver `freeAgentMaxOvrGap`) — un
    // club top no ficha a un suplente de league one sólo por cubrir el cupo.
    const ceilingOvr = report.startingRating + 1;
    const floorOvr = Math.max(
      ceilingOvr - MARKET_TIMING.freeAgentMaxOvrGap,
      reputationOvrFloor(profile) - REPUTATION_OVR_FLOOR.freeAgentSlack,
    );
    const options = getFreeAgents()
      .filter(
        (player) =>
          player.group === need.group && player.ovr <= ceilingOvr && player.ovr >= floorOvr,
      )
      .filter((player) => wageDemand(player.id, clubId) <= wageCeiling)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 12);

    for (const player of options) {
      // Red de última instancia: nadie bloquea la operación salvo el propio
      // jugador, así que se ofrece algo por encima de lo que pide (nunca por
      // debajo del tope salarial del club) para maximizar que diga que sí.
      // Sin este margen, un empate técnico en la puntuación de decisión
      // dejaba muchos fichajes de relleno en "se lo está pensando" para
      // siempre.
      const demanded = wageDemand(player.id, clubId);
      const wageOffer = Math.min(wageCeiling, Math.round(demanded * 1.5));
      const decision = decideOnMove({
        playerId: player.id,
        toClubId: clubId,
        wageOffer,
        cacheKey: date,
      });
      if (decision.verdict !== "accepted") continue;

      const offer = createTransferOffer({
        playerId: player.id,
        playerName: player.name,
        fromClubId: clubId,
        toClubId: clubId,
        amount: 0,
        wageOffer,
        type: "free",
        date,
      });
      const record = completeTransfer(offer, date);
      if (record) return record;
    }
  }
  return null;
}

/**
 * Red de seguridad de ventas: el equivalente, del lado del vendedor, a
 * `signBestFreeAgent`. Si un club de la IA llega tarde en la ventana de
 * verano sin haber soltado a nadie, coloca a su transferible más
 * prescindible en otro club rival con hueco y presupuesto. Sin esto, un
 * club podía terminar el verano sin vender a nadie simplemente porque
 * ningún rival se había fijado en sus descartes por iniciativa propia.
 */
export function forceSellSurplusPlayer(clubId: string, date: string): TransferRecord | null {
  const report = getSquadReport(clubId, date);
  if (report.size <= SQUAD_LIMITS.minSquadSize) return null;
  if (coreDeparturesFor(clubId) >= MARKET_TIMING.maxCoreDeparturesPerWindow) {
    // El club ya ha soltado suficientes titulares esta ventana: si no le
    // queda ningún descarte real (`transferables` vacío), es más realista
    // que se quede sin cubrir el cupo de ventas esta vez a que malvenda a
    // otro titular sólo para no incumplir el mínimo.
    if (report.transferables.length === 0) return null;
  }

  let pool: readonly string[] = report.transferables;
  if (pool.length === 0) {
    // El análisis habitual no señala a ningún "descarte" claro, pero el
    // club sigue por debajo de su cupo mínimo de ventas de verano. Se busca
    // al menos prescindible de verdad: el peor valorado de una demarcación
    // que tenga margen por encima de su mínimo, sin tocar nunca el piso de
    // plantilla — y sin bajar nunca de un nivel razonablemente por debajo
    // del once titular. Antes este filtro no comprobaba nivel alguno, así
    // que en una plantilla muy nivelada (todo el bloque de un color) podía
    // acabar "forzando" la venta de alguien que en realidad era un titular
    // más, sólo por ser el peor valorado de su grupo.
    const fallbackFloor = report.startingRating - SQUAD_LIMITS.benchGapForSale + 2;
    pool = getClubPlayers(clubId)
      .filter(
        (player) =>
          report.countByGroup[player.group] > IDEAL_SQUAD_SHAPE[player.group].min &&
          player.ovr <= fallbackFloor,
      )
      .sort((a, b) => a.ovr - b.ovr)
      .slice(0, 5)
      .map((player) => player.id);
  }
  if (pool.length === 0) return null;

  // El más prescindible primero: peor valorado respecto a su grupo.
  const candidates = pool
    .map((id) => getPlayer(id))
    .filter((player): player is MarketPlayer => Boolean(player))
    .sort((a, b) => a.ovr - b.ovr);
  if (candidates.length === 0) return null;

  const userClubId = getUserClubId();
  const buyerIds = Array.from(getMarketIndex().byClub.keys()).filter(
    (id) => id !== clubId && id !== userClubId,
  );

  // Rebajas progresivas sólo sobre el traspaso: un jugador de un club
  // grande puede no tener comprador al precio de mercado ni con el
  // descuento habitual de deadline day, así que se va bajando el precio de
  // traspaso hasta que algún club pueda permitírselo. La ficha del jugador
  // NO se rebaja — al contrario, se ofrece por encima de lo que pide, que es
  // lo único que de verdad mueve su decisión de aceptar o no (rebajarla
  // garantizaba el rechazo automático por sueldo insultante).
  const fireSaleDiscounts = [PRICE_MULTIPLIERS.deadlineDiscount, 0.55, 0.35];

  for (const player of candidates) {
    if (!isAvailable(player.id, date)) continue;
    const valuation = valuePlayer(player.id, { cacheKey: date, deadlineDay: true });

    // Compradores en orden determinista pero distinto cada día y jugador,
    // para no vaciar siempre la plantilla del mismo club rival. Con cientos
    // de clubes en el mundo, evaluar a todos por cada intento sale caro sin
    // aportar nada: una muestra ya da suficiente variedad para encontrar
    // comprador.
    const ranked = buyerIds
      .map((id) => ({ id, roll: seededUnit(clubId, player.id, id, date, "force-sell") }))
      .sort((a, b) => a.roll - b.roll)
      .slice(0, 60);

    for (const { id: buyerId } of ranked) {
      const buyerReport = getSquadReport(buyerId, date);
      if (buyerReport.size >= SQUAD_LIMITS.maxSquadSize) continue;
      // El comprador tiene que tener un hueco real en esa demarcación (no
      // sólo sitio genérico en la plantilla) y el jugador tiene que encajar
      // con su nivel — ni muy por debajo (un club top no ficha un suplente
      // de liga menor sólo porque puede pagarlo) ni muy por encima (un
      // club pequeño no se lleva a un titular de un gigante a precio de
      // saldo). Sin este filtro, la selección de comprador era puramente
      // aleatoria entre "tiene sitio y presupuesto", así que cualquier club
      // del mundo podía acabar fichando el descarte de cualquier otro,
      // tuviera o no sentido para su plantilla.
      const shapeForGroup = IDEAL_SQUAD_SHAPE[player.group];
      if (buyerReport.countByGroup[player.group] >= shapeForGroup.max) continue;
      const buyerProfile = getClubProfile(buyerId);
      const buyerFloor = reputationOvrFloor(buyerProfile) - REPUTATION_OVR_FLOOR.shortlistSlack;
      const buyerCeiling = buyerReport.startingRating + 6 + buyerProfile.reputation * 4;
      if (player.ovr < buyerFloor || player.ovr > buyerCeiling) continue;

      // Se ofrece bastante por encima de lo que pide: es una salida de
      // emergencia, no una negociación al céntimo, y maximiza que el
      // jugador diga que sí en vez de quedarse "pensándoselo" para siempre.
      const demanded = wageDemand(player.id, buyerId);
      const wageOffer = Math.min(maxWageOffer(buyerId), Math.round(demanded * 1.5));
      if (wageOffer < demanded) continue; // el club destino no puede pagar ni lo mínimo.

      const decision = decideOnMove({
        playerId: player.id,
        toClubId: buyerId,
        wageOffer,
        cacheKey: date,
      });
      if (decision.verdict !== "accepted") continue;

      for (const discount of fireSaleDiscounts) {
        const askingPrice = Math.round(valuation.listPrice * discount);
        if (!canAfford(buyerId, askingPrice, wageOffer)) continue;

        const offer = createTransferOffer({
          playerId: player.id,
          playerName: player.name,
          fromClubId: buyerId,
          toClubId: buyerId,
          amount: askingPrice,
          wageOffer,
          type: "permanent",
          date,
        });
        const record = completeTransfer(offer, date);
        if (record) return record;
      }
    }
  }
  return null;
}

/**
 * Salida de galáctico: con muy poca frecuencia, un club de máxima reputación
 * recibe una oferta lo bastante grande como para dejar salir a uno de sus
 * titulares de verdad (nunca un descarte de los que ya cubre
 * `forceSellSurplusPlayer`), igual que en la vida real un crack puede
 * cambiar de aires en pleno verano aunque su club no "necesite" vender.
 * Respeta el mismo tope de salidas de nivel por ventana que cualquier otra
 * operación (`maxCoreDeparturesPerWindow`) y exige un comprador de peso real
 * pagando cerca del precio pleno, nunca una rebaja de saldo.
 */
export function attemptEliteDeparture(clubId: string, date: string): TransferRecord | null {
  const profile = getClubProfile(clubId);
  if (profile.reputation < ELITE_EXIT.reputationThreshold) return null;
  if (coreDeparturesFor(clubId) >= MARKET_TIMING.maxCoreDeparturesPerWindow) return null;

  const report = getSquadReport(clubId, date);
  if (report.size <= SQUAD_LIMITS.minSquadSize + 2) return null;

  // Sólo titulares de verdad: nunca porteros (posición demasiado sensible
  // para este tipo de saga) ni nadie que ya esté en las listas de
  // transferibles/cedibles — a esos ya los cubre la red de ventas normal.
  const candidates = getClubPlayers(clubId)
    .filter((player) => player.group !== "GK")
    .filter(
      (player) =>
        !report.transferables.includes(player.id) && !report.loanables.includes(player.id),
    )
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 6);
  if (candidates.length === 0) return null;

  const userClubId = getUserClubId();
  const buyerIds = Array.from(getMarketIndex().byClub.keys()).filter(
    (id) => id !== clubId && id !== userClubId,
  );

  for (const player of candidates) {
    if (!isAvailable(player.id, date)) continue;
    const valuation = valuePlayer(player.id, { cacheKey: date, deadlineDay: false });

    const ranked = buyerIds
      .map((id) => ({ id, roll: seededUnit(clubId, player.id, id, date, "elite-exit") }))
      .sort((a, b) => a.roll - b.roll)
      .slice(0, 40);

    for (const { id: buyerId } of ranked) {
      const buyerProfile = getClubProfile(buyerId);
      // Sólo un club de peso real puede tentar a un galáctico: dinero por
      // encima de la media y no muy por debajo en reputación.
      if (buyerProfile.financialPower < ELITE_EXIT.minBuyerFinancialPower) continue;
      if (buyerProfile.reputation < profile.reputation - ELITE_EXIT.maxReputationGap) continue;

      const buyerReport = getSquadReport(buyerId, date);
      if (buyerReport.size >= SQUAD_LIMITS.maxSquadSize) continue;
      const shapeForGroup = IDEAL_SQUAD_SHAPE[player.group];
      if (buyerReport.countByGroup[player.group] >= shapeForGroup.max) continue;

      // Precio pleno (nunca rebajado): esto no es una salida de emergencia.
      const askingPrice = valuation.idealPrice;
      const demanded = wageDemand(player.id, buyerId);
      const wageOffer = Math.min(maxWageOffer(buyerId), Math.round(demanded * 1.3));
      if (wageOffer < demanded) continue;
      if (!canAfford(buyerId, askingPrice, wageOffer)) continue;

      const decision = decideOnMove({
        playerId: player.id,
        toClubId: buyerId,
        wageOffer,
        cacheKey: date,
      });
      if (decision.verdict !== "accepted") continue;

      const offer = createTransferOffer({
        playerId: player.id,
        playerName: player.name,
        fromClubId: buyerId,
        toClubId: buyerId,
        amount: askingPrice,
        wageOffer,
        type: "permanent",
        date,
      });
      const record = completeTransfer(offer, date);
      if (record) {
        registerCoreDeparture(clubId, player.group, player.ovr, player.name);
        return record;
      }
    }
  }
  return null;
}

/**
 * Decide de forma determinista si un club se plantea reforzarse hoy.
 * Lo usa la simulación diaria para repartir la actividad por el calendario.
 */
export function clubWantsToActToday(clubId: string, date: string, share: number): boolean {
  const profile = getClubProfile(clubId);
  const chance = clamp(share * (0.5 + profile.aggression), 0, 1);
  return seededUnit(clubId, date, "act") < chance;
}

/** Limpia las cachés propias del motor (al cargar otra partida). */
export function resetTransferEngine(): void {
  dominantNations.clear();
  pursuitMemory.clear();
  buyerSellerDeals.clear();
  resetBigDealPacing();
}

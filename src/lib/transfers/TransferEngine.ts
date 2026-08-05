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
import {
  CONTRACT_RULES,
  DECISION_ACCURACY,
  IDEAL_SQUAD_SHAPE,
  MARKET_TIMING,
  POSITION_AGE_CURVE,
  SCORE_WEIGHTS,
  SEARCH_LIMITS,
  SQUAD_LIMITS,
  STAR_THRESHOLD,
  WAGE_RULES,
} from "./constants";
import { getClubProfile } from "./ClubStrategy";
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
  getPlayer,
  onSquadChanged,
  reassignPlayerClub,
  updatePlayer,
} from "./PlayerIndex";
import { getSquadReport, playerImprovesSquad } from "./SquadAnalyzer";
import { isUserApprovedMove, windowDeficit } from "./MarketLocks";
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
import type {
  ClubProfile,
  MarketPlayer,
  MarketValuation,
  PositionGroup,
  SquadNeed,
  SquadReport,
  TransferOffer,
  TransferRecord,
  TransferType,
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
  const finalScore = starstruck ? score + DECISION_ACCURACY.starstruckBonus : score;

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

  // Rango de calidad: nadie busca por debajo de su banquillo ni muy por encima
  // de lo que su reputación le permite atraer.
  const minOvr = Math.round(Math.max(58, report.startingRating - 4));
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
    maxValue: spendCeiling,
    excludeClubIds,
    leagueIds: options.leagueIds,
    limit: SEARCH_LIMITS.candidatesPerNeed,
  });

  const scored: ScoredCandidate[] = [];
  for (const player of candidates) {
    if (!isAvailable(player.id, options.cacheKey)) continue;
    if (isPursuitOnCooldown(clubId, player.id, options.cacheKey)) continue;
    if (!playerImprovesSquad(report, player)) continue;
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
    if (entry.askingPrice > spendCeiling) continue;
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
  if (!isAvailable(playerId, cacheKey)) {
    return fail("unavailable", `${player.name} no está en el mercado.`, null);
  }

  // El vendedor también tiene voz: ningún club se queda sin plantilla ni
  // encadena salidas sin reponer. Si ya ha perdido más gente de la que ha
  // fichado en esta ventana, cierra la puerta hasta que se refuerce.
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
  }

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
      return closeWithPlayerDecision(offer, valuation, options, rounds);
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
  if (sellerId && !isLoan) registerSale(sellerId, offer.amount, player.contract.wage);

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

  // Con la plantilla saturada sólo se ficha para tapar un agujero grave, y
  // ningún club compra mientras necesite hacer caja.
  const needs = priorityNeeds(clubId, cacheKey);
  const urgentOnly = report.size >= SQUAD_LIMITS.maxSquadSize;
  // Un club al que le faltan jugadores ficha aunque tenga que hacer caja: la
  // prioridad es mantener una plantilla completa, no el balance.
  const understaffed =
    report.size < SQUAD_LIMITS.minSquadSize + 4 || windowDeficit(clubId) > 0;
  if (needsToSell(clubId) && !understaffed) return result;

  for (const need of needs) {
    if (urgentOnly && need.priority !== "critical" && need.priority !== "high") continue;
    if (result.transfers.length >= maxSignings) break;
    const shape = IDEAL_SQUAD_SHAPE[need.group];
    if (need.count >= shape.max) continue;

    const shortlist = buildShortlist(clubId, need, { cacheKey });
    result.shortlisted += shortlist.length;

    for (const candidate of shortlist) {
      const attempt = pursueTarget(clubId, candidate.player.id, {
        date: options.date,
        deadlineDay: options.deadlineDay,
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
}

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
  IDEAL_SQUAD_SHAPE,
  MARKET_TIMING,
  SCORE_WEIGHTS,
  SEARCH_LIMITS,
  SQUAD_LIMITS,
  WAGE_RULES,
} from "./constants";
import { getClubProfile } from "./ClubStrategy";
import {
  canAfford,
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
  reassignPlayerClub,
  updatePlayer,
} from "./PlayerIndex";
import { getSquadReport, playerImprovesSquad } from "./SquadAnalyzer";
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

/** Preferencia por la edad según el perfil del club. */
function ageScore(player: MarketPlayer, profile: ClubProfile): number {
  if (player.age <= SQUAD_LIMITS.youngAge) return clamp(0.35 + profile.youthPreference * 0.65, 0, 1);
  if (player.age <= 26) return 0.8;
  if (player.age <= 29) return 0.65;
  if (player.age < SQUAD_LIMITS.veteranAge) return clamp(0.45 + profile.veteranPreference * 0.3, 0, 1);
  return clamp(profile.veteranPreference * 0.6, 0, 1);
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
    potential: normalize(player.potential - player.ovr, 0, 10) * (0.4 + profile.youthPreference * 0.6),
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
    breakdown.prestige * SCORE_WEIGHTS.prestige;

  return {
    player,
    group: player.group,
    score: Math.round(clamp(score, 0, 1) * 1000) / 1000,
    breakdown,
    askingPrice: valuation.listPrice,
    wageDemand: wage,
  };
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
  const maxOvr = Math.round(clamp(report.startingRating + 6 + profile.reputation * 4, minOvr + 2, 99));

  const candidates = findCandidates({
    group: need.group,
    minOvr,
    maxOvr,
    maxValue: spendCeiling,
    excludeClubIds: [clubId],
    leagueIds: options.leagueIds,
    limit: SEARCH_LIMITS.candidatesPerNeed,
  });

  const scored: ScoredCandidate[] = [];
  for (const player of candidates) {
    if (!isAvailable(player.id, options.cacheKey)) continue;
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

  const fail = (outcome: PursuitOutcome, message: string, offer: TransferOffer | null, rounds = 0): PursuitResult => ({
    outcome,
    playerId,
    clubId,
    record: null,
    offer,
    rounds,
    message,
  });

  if (!player) return fail("unavailable", "El jugador no existe.", null);
  if (player.clubId === clubId) return fail("unavailable", "Ya pertenece al club.", null);
  if (!isAvailable(playerId, cacheKey)) {
    return fail("unavailable", `${player.name} no está en el mercado.`, null);
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
  // siempre por encima de las pujas rivales si hay competencia.
  const opening = escalatedPrice(
    playerId,
    clubId,
    Math.max(valuation.minimumPrice, valuation.expectedPrice * (0.8 + profile.aggression * 0.15)),
  );

  if (opening > spendCeiling || !canAfford(clubId, opening, wageAsked)) {
    return fail("too-expensive", `${player.name} está fuera del alcance económico del club.`, null);
  }

  const clauses =
    options.type && options.type !== "permanent" && options.type !== "free"
      ? emptyClauses()
      : proposeClauses(clubId, valuation, Math.max(0, valuation.expectedPrice - opening), `${clubId}-${playerId}`);

  const offer = createTransferOffer({
    playerId,
    playerName: player.name,
    fromClubId: clubId,
    toClubId: player.clubId ?? "",
    amount: player.clubId ? opening : 0,
    // El comprador endulza la ficha desde el principio si puede permitírselo:
    // es más barato convencer al jugador con salario que subir el traspaso.
    wageOffer: Math.round(
      Math.min(wageCeiling, wageAsked * (WAGE_RULES.moveRaise + (profile.buyingWillingness - 1) * 0.15)),
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

  if (decision.verdict === "negotiating" && decision.wageRequested <= maxWageOffer(offer.fromClubId)) {
    // El club sube la ficha para cerrar: es más barato que subir el traspaso.
    offer.wageOffer = Math.round(decision.wageRequested * WAGE_RULES.moveRaise);
  } else if (decision.verdict !== "accepted") {
    withdrawOffer(offer);
    dropInterest(offer.playerId, offer.fromClubId);
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
  const buyerLeague = teamById(buyerId).league;
  const isLoan = offer.type === "loan" || offer.type === "loan-option" || offer.type === "loan-obligation";

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
  if (needsToSell(clubId)) return result;

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
}

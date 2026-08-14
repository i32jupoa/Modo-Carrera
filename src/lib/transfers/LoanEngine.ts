/**
 * Motor de cesiones.
 *
 * Una cesión tiene dos lados:
 *
 *   - el club propietario, que quiere dar minutos a un joven o quitarse una
 *     ficha que no usa,
 *   - el club receptor, que necesita cubrir una demarcación sin pagar traspaso.
 *
 * Aquí viven las dos decisiones, la búsqueda de destino, el reparto salarial,
 * la opción/obligación de compra y la vuelta de los cedidos al final de la
 * temporada. El cierre de la operación reutiliza `completeTransfer`.
 */

import { teamById } from "@/data/teams";
import { CONTRACT_RULES, LOAN_RULES, MARKET_TIMING, SQUAD_LIMITS, WAGE_RULES } from "./constants";
import { getClubProfile } from "./ClubStrategy";
import { maxWageOffer, registerLoanOut, registerSale, registerSigning } from "./BudgetManager";
import {
  getClubPlayers,
  getMarketIndex,
  getPlayer,
  reassignPlayerClub,
  updatePlayer,
} from "./PlayerIndex";
import { getSquadReport } from "./SquadAnalyzer";
import { isKeyPlayer } from "./MarketValuation";
import { decideOnMove } from "./PlayerDecision";
import { buildLoanTerms, createTransferOffer, emptyClauses } from "./NegotiationEngine";
import { completeTransfer } from "./TransferEngine";
import { contractYearsForAge } from "./ContractEngine";
import { recordTransfer, transfersForPlayer } from "./TransferHistory";
import { arrivalsFor, isPlayerSettled } from "./MarketLocks";
import { clamp, seededUnit } from "./random";
import type { MarketPlayer, TransferRecord, TransferType } from "./types";

/** Llegadas máximas por club y ventana (compras + cesiones). */
const MAX_ARRIVALS_PER_WINDOW = 3;

/** Tipos de operación que son una cesión. */
export type LoanType = Extract<TransferType, "loan" | "loan-option" | "loan-obligation">;

/** Resultado de intentar una cesión. */
export interface LoanResult {
  playerId: string;
  playerName: string;
  ownerClubId: string;
  borrowerClubId: string;
  agreed: boolean;
  type: LoanType;
  record: TransferRecord | null;
  message: string;
}

// ============================================================================
// DECISIÓN DEL CLUB PROPIETARIO
// ============================================================================

/**
 * ¿Cedería el club a este jugador?
 * Se ceden jóvenes con potencial que no juegan y descartes con ficha alta;
 * nunca titulares ni jugadores clave del proyecto.
 */
export function wantsToLoanOut(clubId: string, playerId: string, cacheKey: string): boolean {
  const player = getPlayer(playerId);
  if (!player || player.clubId !== clubId || player.loanClubId) return false;
  if (isKeyPlayer(playerId, cacheKey)) return false;

  const report = getSquadReport(clubId, cacheKey);
  const gap = report.startingRating - player.ovr;
  if (gap < LOAN_RULES.ratingGap) return false;

  const youngWithRoom = player.age <= LOAN_RULES.maxAge && player.potential > player.ovr + 2;
  const surplus = report.surplus.includes(player.group);
  return youngWithRoom || surplus;
}

/** Jugadores que el club pondría en el mercado de cesiones hoy. */
export function loanCandidates(clubId: string, cacheKey: string): MarketPlayer[] {
  return getClubPlayers(clubId)
    .filter((player) => !isPlayerSettled(player.id) && wantsToLoanOut(clubId, player.id, cacheKey))
    .sort((a, b) => b.potential - a.potential);
}

/** Tipo de cesión que se pacta, según lo que interesa al propietario. */
export function decideLoanType(playerId: string, cacheKey: string): LoanType {
  const player = getPlayer(playerId);
  if (!player) return "loan";
  const roll = seededUnit(playerId, cacheKey, "loantype");
  // A los jóvenes con futuro no se les pone opción de compra: se les recupera.
  if (player.age <= LOAN_RULES.maxAge && player.potential > player.ovr + 4) return "loan";
  if (roll < LOAN_RULES.obligationChance) return "loan-obligation";
  if (roll < LOAN_RULES.obligationChance + LOAN_RULES.optionChance) return "loan-option";
  return "loan";
}

// ============================================================================
// DECISIÓN DEL CLUB RECEPTOR
// ============================================================================

/**
 * ¿Le sirve la cesión al club receptor?
 * Debe cubrir una necesidad real, mejorar (o al menos igualar) su banquillo y
 * caber en su tope salarial con el reparto pactado.
 */
export function wantsToLoanIn(
  borrowerClubId: string,
  playerId: string,
  wageShare: number,
  cacheKey: string,
): boolean {
  const player = getPlayer(playerId);
  if (!player) return false;
  if (isPlayerSettled(playerId)) return false;
  // Ningún club acapara el mercado: como mucho tres llegadas por ventana.
  if (arrivalsFor(borrowerClubId) >= MAX_ARRIVALS_PER_WINDOW) return false;
  const report = getSquadReport(borrowerClubId, cacheKey);
  if (report.size >= SQUAD_LIMITS.maxSquadSize) return false;

  const need = report.needs.find((entry) => entry.group === player.group);
  if (!need) return false;

  const wageCost = player.contract.wage * wageShare;
  if (wageCost > maxWageOffer(borrowerClubId)) return false;

  // Interesa si mejora la demarcación o si es una promesa mejor que su nivel.
  const groupRating = report.ratingByGroup[player.group] ?? report.benchRating;
  const improves = player.ovr >= groupRating - 1;
  const prospect = player.age <= LOAN_RULES.maxAge && player.potential > groupRating;
  if (!improves && !prospect) return false;

  const profile = getClubProfile(borrowerClubId);
  const chance = clamp(0.4 + need.urgency * 0.4 + profile.youthPreference * 0.2, 0, 1);
  return seededUnit(borrowerClubId, playerId, cacheKey, "loanin") < chance;
}

/** Busca destinos plausibles para un cedido: clubes con hueco en su puesto. */
export function findLoanDestinations(playerId: string, cacheKey: string, limit = 5): string[] {
  const player = getPlayer(playerId);
  if (!player) return [];
  const owner = player.clubId;
  const wageShare = LOAN_RULES.defaultWageShare;

  const clubIds = Array.from(getMarketIndex().byClub.keys()).filter((id) => id !== owner);
  // Se prioriza el club con mayor necesidad en la demarcación del jugador.
  const scored: Array<{ clubId: string; urgency: number }> = [];
  for (const clubId of clubIds) {
    const report = getSquadReport(clubId, cacheKey);
    const need = report.needs.find((entry) => entry.group === player.group);
    if (!need) continue;
    // El cedido debe ser útil ahí, pero no una estrella para ese club.
    if (player.ovr < report.benchRating - LOAN_RULES.ratingGap) continue;
    // Tampoco encaja quien es demasiado bueno para ese club: nadie cede a un
    // titular indiscutible a un equipo que le queda muy por debajo.
    if (player.ovr > report.startingRating + LOAN_RULES.ratingGap) continue;
    if (!wantsToLoanIn(clubId, playerId, wageShare, cacheKey)) continue;
    // La urgencia sola hacía que TODAS las cesiones acabaran en los mismos
    // dos o tres clubes. Se le añade un jitter estable por jugador y se
    // penaliza a quien ya ha recibido gente esta ventana.
    const jitter = 0.6 + seededUnit(clubId, playerId, cacheKey, "loandest") * 0.9;
    const crowding = arrivalsFor(clubId) * 0.2;
    scored.push({ clubId, urgency: need.urgency * jitter - crowding });
  }

  scored.sort((a, b) => b.urgency - a.urgency);
  return scored.slice(0, limit).map((entry) => entry.clubId);
}

// ============================================================================
// CIERRE DE LA CESIÓN
// ============================================================================

/** Intenta cerrar la cesión de un jugador a un club concreto. */
export function arrangeLoan(
  playerId: string,
  borrowerClubId: string,
  options: { date: string; type?: LoanType; deadlineDay?: boolean },
): LoanResult {
  const player = getPlayer(playerId);
  const type = options.type ?? decideLoanType(playerId, options.date);
  const base: LoanResult = {
    playerId,
    playerName: player?.name ?? "Jugador",
    ownerClubId: player?.clubId ?? "",
    borrowerClubId,
    agreed: false,
    type,
    record: null,
    message: "La cesión no se puede plantear.",
  };
  if (!player || !player.clubId || player.loanClubId) return base;
  if (player.clubId === borrowerClubId) return base;

  const clauses = buildLoanTerms(playerId, type, `${playerId}-${borrowerClubId}-${options.date}`);
  if (!wantsToLoanIn(borrowerClubId, playerId, clauses.wageShare, options.date)) {
    return { ...base, message: `${teamById(borrowerClubId).name} no ve encaje a la cesión.` };
  }

  const offer = createTransferOffer({
    playerId,
    playerName: player.name,
    buyerClubId: borrowerClubId,
    sellerClubId: player.clubId,
    amount: 0,
    wageOffer: Math.round(player.contract.wage * clauses.wageShare),
    type,
    clauses,
    date: options.date,
  });

  // En una cesión el jugador mantiene su ficha: el reparto salarial sólo
  // decide qué parte paga cada club, no lo que él cobra.
  const decision = decideOnMove({
    playerId,
    toClubId: borrowerClubId,
    wageOffer: player.contract.wage,
    cacheKey: options.date,
    loan: true,
    deadlineDay: options.deadlineDay,
  });

  if (decision.verdict !== "accepted") {
    offer.status = "rejected";
    return { ...base, message: decision.message };
  }

  const ownerClubId = player.clubId;
  const wageBefore = player.contract.wage;
  const record = completeTransfer(offer, options.date);
  if (!record) return base;

  updatePlayer(playerId, { loanListed: false });
  registerLoanOut(ownerClubId, wageBefore, clauses.wageShare);

  return {
    playerId,
    playerName: player.name,
    ownerClubId,
    borrowerClubId,
    agreed: true,
    type,
    record,
    message: `${player.name} sale cedido a ${teamById(borrowerClubId).name}.`,
  };
}

// ============================================================================
// CICLO DE CESIONES DE UN CLUB
// ============================================================================

/** Resultado del ciclo de cesiones de un club. */
export interface LoanCycleResult {
  clubId: string;
  loans: LoanResult[];
}

/** El club propietario intenta colocar a sus cedibles. */
export function runClubLoanCycle(
  clubId: string,
  options: { date: string; deadlineDay?: boolean; maxLoans?: number },
): LoanCycleResult {
  const cacheKey = options.date;
  const maxLoans = options.maxLoans ?? 2;
  const result: LoanCycleResult = { clubId, loans: [] };

  const report = getSquadReport(clubId, cacheKey);
  if (report.size <= SQUAD_LIMITS.minSquadSize) return result;

  let closed = 0;
  for (const player of loanCandidates(clubId, cacheKey)) {
    if (closed >= maxLoans) break;
    updatePlayer(player.id, { loanListed: true });
    for (const destination of findLoanDestinations(
      player.id,
      cacheKey,
      MARKET_TIMING.maxNegotiationsPerClub,
    )) {
      const attempt = arrangeLoan(player.id, destination, {
        date: options.date,
        deadlineDay: options.deadlineDay,
      });
      result.loans.push(attempt);
      if (attempt.agreed) {
        closed += 1;
        break;
      }
    }
  }

  return result;
}

// ============================================================================
// FIN DE TEMPORADA
// ============================================================================

/** Cedido que vuelve a su club, o cuya cesión se convierte en traspaso firme. */
export interface LoanReturn {
  playerId: string;
  playerName: string;
  ownerClubId: string;
  /** Si la cesión tenía obligación de compra, el traspaso resultante. */
  purchase: TransferRecord | null;
  message: string;
}

/** Convierte una cesión con obligación de compra en un traspaso permanente. */
function executeLoanObligation(
  player: MarketPlayer,
  ownerClubId: string,
  borrowerClubId: string,
  loanRecord: TransferRecord,
  date: string,
): TransferRecord {
  const wageShare = clamp(loanRecord.clauses.wageShare, 0, 1);
  const fee = Math.max(0, loanRecord.clauses.optionFee);
  const wage = player.contract.wage;

  reassignPlayerClub(player.id, borrowerClubId, teamById(borrowerClubId).league);
  updatePlayer(player.id, {
    loanClubId: null,
    loanListed: false,
    minutesShare: 0,
    contract: {
      yearsLeft: contractYearsForAge(player.age),
      wage,
      releaseClause: Math.round(Math.max(player.value, fee) * CONTRACT_RULES.releaseClauseFactor),
      signingBonus: Math.round(wage * CONTRACT_RULES.signingBonusShare),
    },
  });

  // El receptor ya pagaba su parte del sueldo durante la cesión; sólo se le
  // añade la parte que aún cubría el dueño. El dueño se quita de encima el
  // resto de la ficha, que es lo único que le quedaba por cubrir.
  registerSigning(borrowerClubId, fee, Math.max(0, wage - wage * wageShare));
  registerSale(ownerClubId, fee, wage * (1 - wageShare));

  const record: TransferRecord = {
    id: `tr-obligation-${player.id}-${date}`,
    date,
    playerId: player.id,
    playerName: player.name,
    fromClubId: ownerClubId,
    toClubId: borrowerClubId,
    fee,
    wage,
    type: "permanent",
    clauses: emptyClauses(),
  };
  recordTransfer(record);
  return record;
}

/**
 * Devuelve a todos los cedidos a su club de origen al acabar la temporada.
 * Las cesiones con obligación de compra se ejecutan antes de la vuelta: el
 * jugador pasa en firme al club receptor por la cifra pactada al cerrar la
 * cesión, en lugar de volver con su dueño original (antes esto no ocurría:
 * toda cesión volvía a su sitio sin más, aunque tuviera obligación de compra).
 */
export function resolveLoansEndOfSeason(date: string): LoanReturn[] {
  const returns: LoanReturn[] = [];
  for (const player of getMarketIndex().byId.values()) {
    if (!player.loanClubId || !player.clubId) continue;
    const borrowerClubId = player.loanClubId;
    const ownerClubId = player.clubId;

    const loanRecord = transfersForPlayer(player.id).find(
      (r) =>
        r.toClubId === borrowerClubId &&
        r.fromClubId === ownerClubId &&
        (r.type === "loan" || r.type === "loan-option" || r.type === "loan-obligation"),
    );

    if (loanRecord?.type === "loan-obligation") {
      const purchase = executeLoanObligation(player, ownerClubId, borrowerClubId, loanRecord, date);
      returns.push({
        playerId: player.id,
        playerName: player.name,
        ownerClubId,
        purchase,
        message: `${teamById(borrowerClubId).name} ejecuta la obligación de compra de ${player.name}.`,
      });
      continue;
    }

    updatePlayer(player.id, { loanClubId: null, loanListed: false, minutesShare: 0 });
    returns.push({
      playerId: player.id,
      playerName: player.name,
      ownerClubId,
      purchase: null,
      message: `${player.name} vuelve de su cesión a ${teamById(ownerClubId).name} (${date}).`,
    });
  }
  return returns;
}

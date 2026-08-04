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
import { LOAN_RULES, MARKET_TIMING, SQUAD_LIMITS, WAGE_RULES } from "./constants";
import { getClubProfile } from "./ClubStrategy";
import { maxWageOffer, registerLoanOut } from "./BudgetManager";
import { getClubPlayers, getMarketIndex, getPlayer, updatePlayer } from "./PlayerIndex";
import { getSquadReport } from "./SquadAnalyzer";
import { isKeyPlayer } from "./MarketValuation";
import { decideOnMove } from "./PlayerDecision";
import { buildLoanTerms, createTransferOffer } from "./NegotiationEngine";
import { completeTransfer } from "./TransferEngine";
import { clamp, seededUnit } from "./random";
import type { MarketPlayer, TransferRecord, TransferType } from "./types";

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
    .filter((player) => wantsToLoanOut(clubId, player.id, cacheKey))
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
export function findLoanDestinations(
  playerId: string,
  cacheKey: string,
  limit = 5,
): string[] {
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
    scored.push({ clubId, urgency: need.urgency });
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
    fromClubId: borrowerClubId,
    toClubId: player.clubId,
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
    for (const destination of findLoanDestinations(player.id, cacheKey, MARKET_TIMING.maxNegotiationsPerClub)) {
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

/** Cedido que vuelve a su club. */
export interface LoanReturn {
  playerId: string;
  playerName: string;
  ownerClubId: string;
  message: string;
}

/**
 * Devuelve a todos los cedidos a su club de origen al acabar la temporada.
 * Las obligaciones de compra se ejecutan antes de la vuelta.
 */
export function resolveLoansEndOfSeason(date: string): LoanReturn[] {
  const returns: LoanReturn[] = [];
  for (const player of getMarketIndex().byId.values()) {
    if (!player.loanClubId || !player.clubId) continue;
    updatePlayer(player.id, { loanClubId: null, loanListed: false, minutesShare: 0 });
    returns.push({
      playerId: player.id,
      playerName: player.name,
      ownerClubId: player.clubId,
      message: `${player.name} vuelve de su cesión a ${teamById(player.clubId).name} (${date}).`,
    });
  }
  return returns;
}

/**
 * Motor de contratos.
 *
 * Cubre todo lo que ocurre con un contrato al margen de un traspaso:
 *
 *   - renovaciones (el club ofrece, el jugador acepta o pide más),
 *   - decisión de poner a alguien en la lista de transferibles y por qué,
 *   - fin de temporada: descuento de años, jugadores que quedan libres y
 *     firmas de agentes libres.
 *
 * Aquí no hay calendario propio: la simulación diaria decide cuándo llamar a
 * `runClubContractCycle` y el cambio de temporada llama a `advanceSeason`.
 */

import { teamById } from "@/data/teams";
import { CONTRACT_RULES, SQUAD_LIMITS, WAGE_RULES } from "./constants";
import { getClubProfile } from "./ClubStrategy";
import { maxWageOffer, needsToSell } from "./BudgetManager";
import {
  getClubPlayers,
  getMarketIndex,
  getPlayer,
  reassignPlayerClub,
  updatePlayer,
} from "./PlayerIndex";
import { getSquadReport } from "./SquadAnalyzer";
import { isKeyPlayer } from "./MarketValuation";
import { decideOnRenewal, wantsOut } from "./PlayerDecision";
import { clamp, seededUnit } from "./random";
import type { Contract, MarketPlayer, SquadReport, TransferListReason } from "./types";

// ============================================================================
// RENOVACIONES
// ============================================================================

/** Resultado de un intento de renovación. */
export interface RenewalOutcome {
  playerId: string;
  playerName: string;
  clubId: string;
  renewed: boolean;
  /** Ficha final acordada (o la última ofrecida si no hubo acuerdo). */
  wage: number;
  years: number;
  message: string;
}

/** Años de contrato que un club ofrece según la edad del jugador. */
export function contractYearsForAge(age: number): number {
  const entry = CONTRACT_RULES.yearsByAge.find((row) => age <= row.maxAge);
  return clamp(entry ? entry.years : CONTRACT_RULES.minYears, CONTRACT_RULES.minYears, CONTRACT_RULES.maxYears);
}

/** Nuevo contrato tras una renovación. */
function renewedContract(player: MarketPlayer, wage: number, years: number): Contract {
  return {
    yearsLeft: years,
    wage,
    releaseClause: Math.round(player.value * CONTRACT_RULES.releaseClauseFactor),
    signingBonus: Math.round(wage * CONTRACT_RULES.signingBonusShare),
  };
}

/**
 * ¿Quiere el club renovar a este jugador?
 * Renueva a quien es importante, joven con recorrido o simplemente mejor que
 * su banquillo; no renueva a veteranos por debajo del nivel del once ni a
 * descartes, y nunca si la ficha se sale del tope salarial.
 */
export function clubWantsToRenew(clubId: string, playerId: string, cacheKey: string): boolean {
  const player = getPlayer(playerId);
  if (!player || player.clubId !== clubId) return false;
  if (player.transferListed && player.listReason !== "contract-ending") return false;

  const report = getSquadReport(clubId, cacheKey);
  const profile = getClubProfile(clubId);

  if (player.age > CONTRACT_RULES.maxRenewalAge && player.ovr < report.startingRating) return false;

  const isYoungProspect =
    player.age <= SQUAD_LIMITS.youngAge && player.potential >= report.startingRating - 1;
  const isUseful = player.ovr >= report.startingRating - SQUAD_LIMITS.benchGapForSale / 2;

  if (!isYoungProspect && !isUseful && !isKeyPlayer(playerId, cacheKey)) return false;

  // Un club ambicioso renueva antes; uno conservador deja correr el contrato.
  const chance = clamp(0.45 + profile.ambition * 0.4 + (isYoungProspect ? 0.15 : 0), 0, 1);
  return seededUnit(clubId, playerId, cacheKey, "renew") < chance;
}

/**
 * Intenta renovar a un jugador: el club ofrece la ficha que puede pagar y el
 * jugador decide. Si pide más y cabe en el tope, el club mejora una vez.
 */
export function attemptRenewal(clubId: string, playerId: string, cacheKey: string): RenewalOutcome {
  const player = getPlayer(playerId);
  const base: RenewalOutcome = {
    playerId,
    playerName: player?.name ?? "Jugador",
    clubId,
    renewed: false,
    wage: player?.contract.wage ?? WAGE_RULES.minimumWage,
    years: 0,
    message: "No se puede renovar a este jugador.",
  };
  if (!player || player.clubId !== clubId) return base;

  const ceiling = maxWageOffer(clubId);
  const ask = decideOnRenewal(playerId, cacheKey);
  let offeredWage = Math.min(ceiling, Math.round(player.contract.wage * CONTRACT_RULES.renewalRaise));
  let decision = decideOnRenewal(playerId, cacheKey, offeredWage);

  if (!decision.accepted && ask.wageRequested <= ceiling) {
    offeredWage = ask.wageRequested;
    decision = decideOnRenewal(playerId, cacheKey, offeredWage);
  }

  if (!decision.accepted) {
    // Si no renueva y le queda un año o menos, pasa a ser vendible.
    if (player.contract.yearsLeft <= 1) {
      listForTransfer(playerId, "contract-ending");
    }
    return { ...base, wage: offeredWage, message: decision.message };
  }

  const years = clamp(
    Math.max(decision.yearsRequested, contractYearsForAge(player.age)),
    CONTRACT_RULES.minYears,
    CONTRACT_RULES.maxYears,
  );
  updatePlayer(playerId, {
    contract: renewedContract(player, offeredWage, years),
    transferListed: false,
    listReason: null,
  });

  return {
    playerId,
    playerName: player.name,
    clubId,
    renewed: true,
    wage: offeredWage,
    years,
    message: `${player.name} renueva con ${teamById(clubId).name} hasta ${years} temporada(s) más.`,
  };
}

// ============================================================================
// LISTA DE TRANSFERIBLES
// ============================================================================

/** Pone a un jugador en la lista de transferibles. */
export function listForTransfer(playerId: string, reason: TransferListReason): void {
  updatePlayer(playerId, { transferListed: true, listReason: reason });
}

/** Lo saca de la lista de transferibles. */
export function unlistFromTransfer(playerId: string): void {
  updatePlayer(playerId, { transferListed: false, listReason: null });
}

/** Motivo por el que el club dejaría salir a un jugador, si hay alguno. */
export function saleReasonFor(
  clubId: string,
  player: MarketPlayer,
  report: SquadReport,
  cacheKey: string,
): TransferListReason | null {
  if (isKeyPlayer(player.id, cacheKey)) return null;
  if (player.contract.yearsLeft <= CONTRACT_RULES.minYears - 1) return "contract-ending";
  if (player.age >= SQUAD_LIMITS.veteranAge && player.ovr < report.startingRating) return "too-old";
  if (report.surplus.includes(player.group) && player.ovr < report.startingRating) return "surplus";
  if (player.ovr <= report.startingRating - SQUAD_LIMITS.benchGapForSale) return "no-minutes";
  if (wantsOut(player.id, cacheKey) && player.ovr < report.startingRating) return "no-minutes";
  if (needsToSell(clubId)) return "needs-cash";
  if (player.contract.yearsLeft <= 1) return "contract-ending";
  return null;
}

/**
 * Revisa la plantilla y actualiza la lista de transferibles del club.
 * Nunca deja la plantilla por debajo del mínimo y respeta las decisiones que
 * el usuario haya tomado a mano (`listReason === "user"`).
 */
export function reviewTransferList(clubId: string, cacheKey: string): string[] {
  const report = getSquadReport(clubId, cacheKey);
  const players = getClubPlayers(clubId);
  const listed: string[] = [];
  let squadSize = report.size;

  for (const player of players) {
    if (player.listReason === "user") {
      listed.push(player.id);
      continue;
    }
    const reason = saleReasonFor(clubId, player, report, cacheKey);
    if (reason && squadSize > SQUAD_LIMITS.minSquadSize) {
      listForTransfer(player.id, reason);
      listed.push(player.id);
      squadSize -= 1;
    } else if (player.transferListed) {
      unlistFromTransfer(player.id);
    }
  }

  return listed;
}

// ============================================================================
// CICLO DE CONTRATOS DE UN CLUB
// ============================================================================

/** Resultado del ciclo de contratos de un club. */
export interface ContractCycleResult {
  clubId: string;
  renewals: RenewalOutcome[];
  /** Ids puestos en la lista de transferibles. */
  listed: string[];
}

/**
 * El club revisa contratos: renueva a quien quiere conservar y actualiza la
 * lista de transferibles. Sólo mira a quien está en el último tramo de
 * contrato, para no reescribir toda la plantilla cada día.
 */
export function runClubContractCycle(
  clubId: string,
  options: { date: string; maxRenewals?: number },
): ContractCycleResult {
  const cacheKey = options.date;
  const maxRenewals = options.maxRenewals ?? 2;
  const result: ContractCycleResult = { clubId, renewals: [], listed: [] };

  const expiring = getClubPlayers(clubId)
    .filter((player) => player.contract.yearsLeft <= 1 && !player.loanClubId)
    .sort((a, b) => b.ovr - a.ovr);

  for (const player of expiring) {
    if (result.renewals.filter((r) => r.renewed).length >= maxRenewals) break;
    if (!clubWantsToRenew(clubId, player.id, cacheKey)) continue;
    result.renewals.push(attemptRenewal(clubId, player.id, cacheKey));
  }

  result.listed = reviewTransferList(clubId, cacheKey);
  return result;
}

// ============================================================================
// FIN DE TEMPORADA
// ============================================================================

/** Jugador que ha quedado libre al acabar su contrato. */
export interface ContractExpiry {
  playerId: string;
  playerName: string;
  fromClubId: string;
  message: string;
}

/**
 * Cierra la temporada en lo que a contratos respecta: descuenta un año a
 * todos, deja libres a los que se acaban y limpia las listas.
 */
export function advanceSeason(date: string): ContractExpiry[] {
  const expiries: ContractExpiry[] = [];

  for (const team of getAllClubIds()) {
    for (const player of getClubPlayers(team)) {
      const yearsLeft = player.contract.yearsLeft - 1;
      if (yearsLeft >= CONTRACT_RULES.minYears) {
        updatePlayer(player.id, { contract: { ...player.contract, yearsLeft } });
        continue;
      }
      // Contrato agotado: agente libre a partir de esta fecha.
      const fromClubId = player.clubId ?? team;
      reassignPlayerClub(player.id, null, "free");
      updatePlayer(player.id, {
        contract: { ...player.contract, yearsLeft: 0 },
        minutesShare: 0,
      });
      expiries.push({
        playerId: player.id,
        playerName: player.name,
        fromClubId,
        message: `${player.name} termina contrato con ${teamById(fromClubId).name} el ${date}.`,
      });
    }
  }

  return expiries;
}

/** Ids de todos los clubes con jugadores indexados. */
function getAllClubIds(): string[] {
  return Array.from(getMarketIndex().byClub.keys());
}

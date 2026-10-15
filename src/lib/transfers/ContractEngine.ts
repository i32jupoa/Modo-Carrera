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
import { CONTRACT_RULES, POSITION_AGE_CURVE, SQUAD_LIMITS, WAGE_RULES } from "./constants";
import { getClubProfile } from "./ClubStrategy";
import {
  getFinances,
  getUserClubId,
  maxWageOffer,
  needsToSell,
  registerRenewal,
  additionalWageCommitment,
  syncWageBill,
} from "./BudgetManager";
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
import { logRenewal, setRenewalLogDate } from "./RenewalLog";
import { isClosed, listNegotiations } from "./NegotiationEngine";
import { clubRenewalProbability, getContractRenewalPhase, getContractRenewalPhaseKey, type ContractRenewalPhase } from "./RenewalPolicy";
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
  /** Salario antes del intento, para que el histórico no lea el contrato ya actualizado. */
  previousWage?: number;
  message: string;
}

export interface UserRenewalInput {
  playerId: string;
  clubId: string;
  years: number;
  wage: number;
  releaseClause: number;
  signingBonus: number;
  squadRole?: import("./types").SquadRole;
}

export interface UserRenewalOutcome extends RenewalOutcome {
  accepted: boolean;
  releaseClause: number;
  signingBonus: number;
  previousWage: number;
}

/** Renueva manualmente a un jugador de la plantilla del usuario.
 * La operación utiliza el mismo contrato que ve el mercado y actualiza la
 * economía compartida (masa salarial + prima de renovación).
 */
export function renewUserPlayer(input: UserRenewalInput): UserRenewalOutcome {
  const player = getPlayer(input.playerId);
  const base: UserRenewalOutcome = {
    playerId: input.playerId,
    playerName: player?.name ?? "Jugador",
    clubId: input.clubId,
    renewed: false,
    accepted: false,
    wage: player?.contract.wage ?? WAGE_RULES.minimumWage,
    years: player?.contract.yearsLeft ?? 0,
    releaseClause: player?.contract.releaseClause ?? 0,
    signingBonus: player?.contract.signingBonus ?? 0,
    previousWage: player?.contract.wage ?? 0,
    message: "No se puede renovar a este jugador.",
  };
  if (!player || player.clubId !== input.clubId) return base;
  if (getUserClubId() !== input.clubId) {
    return { ...base, message: "El club del usuario no está conectado al presupuesto de la partida." };
  }

  const years = clamp(Math.round(input.years), CONTRACT_RULES.minYears, CONTRACT_RULES.maxYears);
  const wage = Math.max(WAGE_RULES.minimumWage, Math.round(input.wage));
  const releaseClause = Math.max(0, Math.round(input.releaseClause));
  const signingBonus = Math.max(0, Math.round(input.signingBonus));
  syncWageBill(input.clubId);
  const finances = getFinances(input.clubId);
  // La bolsa salarial representa el margen disponible para nuevas obligaciones
  // salariales. En una renovación sólo se añade la diferencia positiva entre
  // la nueva ficha y la actual: 20M -> 25M consume 5M, no 25M.
  const wageDelta = Math.round(wage - player.contract.wage);
  const wageCommitment = additionalWageCommitment(player.contract.wage, wage);
  const availableWageRoom = Math.max(0, Math.round(finances.wageBudget));
  const transferRoom = Math.max(0, finances.budget - finances.wageBudget);
  // El salario nuevo no se paga íntegramente al firmar.
  // Sólo se reserva la diferencia respecto al salario actual. Esa reserva se
  // resta tanto de la bolsa económica total como de la bolsa salarial, de
  // modo que el dinero para fichajes sólo se vea afectado por la prima.
  const nextTotal = Math.max(0, finances.budget - wageDelta - signingBonus);
  const nextWageBudget = Math.max(0, finances.wageBudget - wageDelta);
  const nextWageBill = Math.max(0, finances.wageBill + wageDelta);

  if (wageCommitment > availableWageRoom) {
    return {
      ...base,
      wage,
      years,
      releaseClause,
      signingBonus,
      message: `La renovación supera el margen salarial disponible (${Math.max(0, Math.round(availableWageRoom)).toLocaleString("es-ES")} €).`,
    };
  }
  if (signingBonus > transferRoom) {
    return {
      ...base,
      wage,
      years,
      releaseClause,
      signingBonus,
      message: `No puedes pagar la prima de renovación con el presupuesto de fichajes. Disponible: ${Math.round(transferRoom).toLocaleString("es-ES")} €.`,
    };
  }

  const previousWage = player.contract.wage;
  // Actualizamos primero la contabilidad económica usando el contrato antiguo
  // como referencia. Así la subida salarial se cuenta exactamente una vez;
  // después se escribe el nuevo contrato en el índice de jugadores.
  registerRenewal(input.clubId, previousWage, wage, signingBonus);
  updatePlayer(input.playerId, {
    contract: {
      yearsLeft: years,
      wage,
      releaseClause,
      signingBonus,
    },
    transferListed: false,
    listReason: null,
  });
  logRenewal({
    playerId: input.playerId,
    playerName: player.name,
    clubId: input.clubId,
    wage,
    previousWage,
    years,
    releaseClause,
    byUser: true,
  });

  return {
    ...base,
    renewed: true,
    accepted: true,
    wage,
    years,
    releaseClause,
    signingBonus,
    previousWage,
    message: `${player.name} ha renovado por ${years} temporada(s).`,
  };
}

/** Años de contrato que un club ofrece según la edad del jugador. */
export function contractYearsForAge(age: number): number {
  const entry = CONTRACT_RULES.yearsByAge.find((row) => age <= row.maxAge);
  return clamp(
    entry ? entry.years : CONTRACT_RULES.minYears,
    CONTRACT_RULES.minYears,
    CONTRACT_RULES.maxYears,
  );
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
export function clubWantsToRenew(
  clubId: string,
  playerId: string,
  cacheKey: string,
  phase: ContractRenewalPhase = "late-season",
): boolean {
  const player = getPlayer(playerId);
  if (!player || player.retired || player.clubId !== clubId) return false;
  if (player.transferListed && player.listReason !== "contract-ending") return false;

  const report = getSquadReport(clubId, cacheKey);
  const profile = getClubProfile(clubId);
  const renewalCurve = POSITION_AGE_CURVE[player.group];
  const isDecliningVeteran = player.age > renewalCurve.declineEnd && player.ovr < report.startingRating;
  if (isDecliningVeteran) return false;

  const isYoungProspect =
    player.age <= SQUAD_LIMITS.youngAge && player.potential >= report.startingRating - 1;
  const isUseful = player.ovr >= report.startingRating - SQUAD_LIMITS.benchGapForSale / 2;
  const keyPlayer = isKeyPlayer(playerId, cacheKey);

  // No se renuevan descartes salvo que sean una promesa con recorrido o un
  // jugador clave. La prioridad real se decide antes de recorrer el listado.
  if (!isYoungProspect && !isUseful && !keyPlayer) return false;

  const chance = clubRenewalProbability({
    phase,
    ambition: profile.ambition,
    isKeyPlayer: keyPlayer,
    isYoungProspect,
    isUseful,
    isDecliningVeteran,
  });
  return seededUnit(clubId, playerId, cacheKey, "renew-club-willingness") < chance;
}

/**
 * Intenta renovar a un jugador: el club ofrece la ficha que puede pagar y el
 * jugador decide. Si pide más y cabe en el tope, el club mejora una vez.
 */
export function attemptRenewal(clubId: string, playerId: string, cacheKey: string, date?: string): RenewalOutcome {
  const player = getPlayer(playerId);
  const base: RenewalOutcome = {
    playerId,
    playerName: player?.name ?? "Jugador",
    clubId,
    renewed: false,
    wage: player?.contract.wage ?? WAGE_RULES.minimumWage,
    years: 0,
    previousWage: player?.contract.wage ?? WAGE_RULES.minimumWage,
    message: "No se puede renovar a este jugador.",
  };
  if (!player || player.retired || player.clubId !== clubId) return base;

  const finances = getFinances(clubId);
  const wageRoom = Math.max(0, Math.round(finances.wageBudget - finances.wageBill));
  const transferRoom = Math.max(0, Math.round(finances.budget - finances.initialBudget * 0.05));
  // Una renovación compromete el incremento salarial y la prima. El límite de
  // oferta combina el margen salarial real con el presupuesto disponible, sin
  // tocar la economía del club del usuario (que nunca entra en el ciclo IA).
  const maxRaiseFromBudget = Math.max(
    0,
    Math.floor((transferRoom + player.contract.wage) / (1 + CONTRACT_RULES.signingBonusShare)) - player.contract.wage,
  );
  const affordableCeiling = player.contract.wage + Math.min(wageRoom, maxRaiseFromBudget);
  const ceiling = Math.min(maxWageOffer(clubId), affordableCeiling);
  const ask = decideOnRenewal(playerId, cacheKey, undefined, date);
  let offeredWage = Math.min(ceiling, Math.round(player.contract.wage * CONTRACT_RULES.renewalRaise));
  let decision = decideOnRenewal(playerId, cacheKey, offeredWage, date);

  if (!decision.accepted && ask.wageRequested <= ceiling) {
    offeredWage = ask.wageRequested;
    decision = decideOnRenewal(playerId, cacheKey, offeredWage, date);
  }

  const betterExternalOffer = listNegotiations().some(({ offer }) =>
    offer.playerId === playerId &&
    offer.sellerClubId === clubId &&
    offer.buyerClubId !== clubId &&
    !isClosed(offer.status) &&
    offer.wageOffer > offeredWage
  );
  if (betterExternalOffer && decision.accepted) {
    decision = {
      ...decision,
      accepted: false,
      message: `${player.name} está valorando una oferta salarial mejor de otro club.`,
    };
  }

  const wageCommitment = additionalWageCommitment(player.contract.wage, offeredWage);
  const signingBonus = Math.round(offeredWage * CONTRACT_RULES.signingBonusShare);
  const cashRoom = Math.max(0, Math.round(finances.budget - finances.initialBudget * 0.05));
  if (
    !decision.accepted ||
    wageCommitment > wageRoom ||
    wageCommitment + signingBonus > cashRoom
  ) {
    // Si no renueva y le queda un año o menos, pasa a ser vendible. Las
    // renovaciones posteriores no le fuerzan a firmar ni ignoran su rechazo.
    if (player.contract.yearsLeft <= 1) listForTransfer(playerId, "contract-ending");
    return { ...base, wage: offeredWage, message: decision.accepted
      ? "El club no dispone de margen salarial o económico suficiente para cerrar la renovación."
      : decision.message };
  }

  const years = clamp(
    Math.max(decision.yearsRequested, contractYearsForAge(player.age)),
    CONTRACT_RULES.minYears,
    CONTRACT_RULES.maxYears,
  );
  const previousWage = player.contract.wage;
  // Registrar la operación primero para que presupuesto y masa salarial se
  // actualicen junto al contrato de mercado.
  registerRenewal(clubId, previousWage, offeredWage, signingBonus);
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
    previousWage,
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
  if (
    player.age >= POSITION_AGE_CURVE[player.group].declineEnd &&
    player.ovr < report.startingRating
  )
    return "too-old";
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
 * Revisión contractual de una plantilla. Las renovaciones sólo se evalúan en
 * las fases de enero y abril-junio; la revisión de transferibles puede seguir
 * realizándose al abrir una ventana de mercado.
 */
export function runClubContractCycle(
  clubId: string,
  options: {
    date: string;
    maxRenewals?: number;
    reviewList?: boolean;
    excludePlayerIds?: ReadonlySet<string>;
    phase?: ContractRenewalPhase | null;
    renewalsEnabled?: boolean;
  },
): ContractCycleResult {
  const result: ContractCycleResult = { clubId, renewals: [], listed: [] };
  setRenewalLogDate(options.date);

  const phase = options.phase === undefined ? getContractRenewalPhase(options.date) : options.phase;
  if (options.renewalsEnabled !== false && phase !== null && clubId !== getUserClubId()) {
    syncWageBill(clubId);
    const phaseKey = getContractRenewalPhaseKey(options.date, phase);
    const expiring = getClubPlayers(clubId)
      .filter((player) =>
        !player.retired &&
        player.contract.yearsLeft <= 1 &&
        !player.loanClubId &&
        !options.excludePlayerIds?.has(player.id)
      )
      .sort((a, b) => {
        const report = getSquadReport(clubId, phaseKey);
        const rank = (player: MarketPlayer) => {
          const key = isKeyPlayer(player.id, phaseKey);
          const young = player.age <= SQUAD_LIMITS.youngAge && player.potential >= report.startingRating - 1;
          const useful = player.ovr >= report.startingRating - SQUAD_LIMITS.benchGapForSale / 2;
          return Number(key) * 1_000 + Number(young) * 500 + Number(useful) * 250 + player.ovr * 2 + player.potential * 0.1;
        };
        return rank(b) - rank(a);
      });

    // El límite por defecto es la cantidad de candidatos elegibles: ya no hay
    // un tope estructural de dos renovaciones por club en el cierre anual.
    const maxRenewals = Math.max(0, options.maxRenewals ?? expiring.length);
    for (const player of expiring) {
      if (result.renewals.filter((renewal) => renewal.renewed).length >= maxRenewals) break;
      if (!clubWantsToRenew(clubId, player.id, phaseKey, phase)) continue;
      const outcome = attemptRenewal(clubId, player.id, phaseKey, options.date);
      result.renewals.push(outcome);
      if (outcome.renewed) {
        logRenewal({
          date: options.date,
          playerId: outcome.playerId,
          playerName: outcome.playerName,
          clubId: outcome.clubId,
          wage: outcome.wage,
          previousWage: outcome.previousWage ?? player.contract.wage,
          years: outcome.years,
          releaseClause: Math.round(player.value * CONTRACT_RULES.releaseClauseFactor),
          byUser: false,
        });
      }
    }
  }

  // Fuera de la ventana de fichajes no hace falta recalcular la lista completa
  // de transferibles todos los días: se volverá a revisar al abrir el mercado.
  if (options.reviewList !== false) {
    result.listed = reviewTransferList(clubId, options.date);
  }

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
export function advanceSeason(date: string, options: { excludePlayerIds?: ReadonlySet<string> } = {}): ContractExpiry[] {
  const expiries: ContractExpiry[] = [];

  const userClubId = getUserClubId();
  for (const team of getAllClubIds()) {
    // Los contratos del club del usuario no se resuelven solos: nadie sale de
    // su plantilla sin que él lo decida.
    if (userClubId && team === userClubId) continue;
    for (const player of getClubPlayers(team)) {
      // Retroactive repairs must not decrement the new contract of a player
      // who was already transferred during the summer window.
      if (options.excludePlayerIds?.has(player.id)) continue;
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

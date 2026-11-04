/**
 * Motor de cláusulas de rescisión. Todas las operaciones pasan por
 * completeTransfer para conservar índices, economía, historial y cerrojos.
 */
import { RELEASE_CLAUSE_RULES, SQUAD_LIMITS, WAGE_RULES } from "./constants";
import { canAfford, creditUserTransferBudget, getFinances, getUserClubId } from "./BudgetManager";
import { getClubProfile } from "./ClubStrategy";
import { desireToLeave, expectedPlayingTime, wageDemand, wantsOut } from "./PlayerDecision";
import { getClubPlayers, getPlayer } from "./PlayerIndex";
import { createTransferOffer } from "./NegotiationEngine";
import { completeTransfer } from "./TransferEngine";
import { recordTransfer } from "./TransferHistory";
import { withUserApproval, canPlayerMoveAgain, isPlayerSettled } from "./MarketLocks";
import { getMarketPlayerSquadRole } from "./MarketPlayerSignals";
import { daysIntoTransferWindow, isMarketOpenForIso, transferWindowKey } from "@/lib/transferWindows";
import type { MarketPlayer, TransferRecord } from "./types";

const windowCounts = new Map<string, Map<string, number>>();
const globalCounts = new Map<string, number>();
const dailyCounts = new Map<string, number>();
const userIncomingCounts = new Map<string, number>();
/** Una única ronda de interés del mercado por fecha; evita reintentos al rehidratar el mismo día. */
const userOpportunityDates = new Set<string>();
/** Objetivos ya tanteados por comprador durante cada ventana; permite que otro club distinto vuelva a intentarlo. */
const userTargetedPlayers = new Set<string>();

/**
 * Las rondas automáticas IA-IA comienzan el segundo día de la ventana. La
 * ronda especial contra el club del usuario puede solicitar una excepción
 * limitada al primer día, pero sigue su propio disparador aleatorio.
 */
export function isAiReleaseClauseTimingAllowed(date: string): boolean {
  return isMarketOpenForIso(date) &&
    daysIntoTransferWindow(date) >= RELEASE_CLAUSE_RULES.minimumWindowDay;
}

export interface ClauseAttemptResult {
  success: boolean;
  reason: string;
  transfer?: TransferRecord;
  acceptanceScore?: number;
}

function count(window: string, clubId: string): number {
  return windowCounts.get(window)?.get(clubId) ?? 0;
}

function incrementClubCount(window: string, clubId: string): void {
  let clubs = windowCounts.get(window);
  if (!clubs) { clubs = new Map(); windowCounts.set(window, clubs); }
  clubs.set(clubId, count(window, clubId) + 1);
}

function increment(window: string, clubId: string): void {
  incrementClubCount(window, clubId);
  globalCounts.set(window, (globalCounts.get(window) ?? 0) + 1);
}

export function releaseClauseDesire(player: MarketPlayer, date = "2026-07-01"): number {
  return Math.max(0, Math.min(1, desireToLeave(player.id, date.slice(0, 7))));
}

/** Rol actual del jugador en el club vendedor. Si la partida aún no tiene
 * roles hidratados, se aplica una estimación conservadora a partir de media y minutos. */
export function releaseClauseCurrentRole(player: MarketPlayer): "star" | "starter" | "rotation" | "secondary" | "prospect" {
  const role = getMarketPlayerSquadRole(player.id);
  if (role) return role;
  if (player.age <= 21 && player.ovr < 78) return "prospect";
  if (player.ovr >= 88 && player.minutesShare >= 0.58) return "star";
  if (player.ovr >= 83 && player.minutesShare >= 0.48) return "starter";
  if (player.minutesShare < 0.18) return "secondary";
  return "rotation";
}

/**
 * Multiplicador específico para promesas: edad baja + potencial claramente
 * superior a la media actual implican una protección extra frente a cláusulas.
 * No hace imposible su salida, pero evita que sean siempre los primeros objetivos.
 */
export function releaseClausePromiseProtectionMultiplier(player: MarketPlayer): number {
  const developmentGap = Math.max(0, player.potential - player.ovr);
  const highPotential = player.potential >= 85 && player.ovr <= 82;
  if (player.age <= 20 && (developmentGap >= 10 || highPotential)) return 0.22;
  if (player.age <= 22 && (developmentGap >= 8 || highPotential)) return 0.32;
  if (player.age <= 23 && (developmentGap >= 7 || player.potential >= 88)) return 0.45;
  return 1;
}

/** Marca una fecha para que el mercado no vuelva a abrir la ronda de salidas
 * del usuario si el reloj o la partida se rehidratan durante el mismo día. */
export function claimUserReleaseClauseOpportunity(date: string): boolean {
  if (userOpportunityDates.has(date)) return false;
  userOpportunityDates.add(date);
  if (userOpportunityDates.size > 180) {
    const keep = [...userOpportunityDates].slice(-120);
    userOpportunityDates.clear();
    keep.forEach((entry) => userOpportunityDates.add(entry));
  }
  return true;
}

export function hasUserReleaseClauseTargetBeenTried(date: string, playerId: string, buyerClubId = "*"): boolean {
  const window = transferWindowKey(date);
  return userTargetedPlayers.has(`${window}:${buyerClubId}:${playerId}`) ||
    userTargetedPlayers.has(`${window}:*:${playerId}`);
}

export function markUserReleaseClauseTargetTried(date: string, playerId: string, buyerClubId = "*"): void {
  userTargetedPlayers.add(`${transferWindowKey(date)}:${buyerClubId}:${playerId}`);
  if (userTargetedPlayers.size > 800) {
    const currentWindow = transferWindowKey(date);
    const keep = [...userTargetedPlayers].filter((entry) => entry.startsWith(`${currentWindow}:`)).slice(-250);
    userTargetedPlayers.clear();
    keep.forEach((entry) => userTargetedPlayers.add(entry));
  }
}

/** Salario de reserva para abandonar el club actual. Un jugador contento,
 * leal y con un rol alto puede exigir varias veces su ficha actual. */
export function releaseClauseWageDemand(player: MarketPlayer, buyerClubId: string, date = "2026-07-01"): number {
  const desire = releaseClauseDesire(player, date);
  const satisfaction = 1 - desire;
  const loyalty = Math.max(0, Math.min(1, player.personality.loyalty));
  const role = releaseClauseCurrentRole(player);
  const base = Math.max(WAGE_RULES.minimumWage, wageDemand(player.id, buyerClubId));
  const ambitionGap = Math.max(0,
    player.personality.ambition * 0.65 -
    ((getClubProfile(buyerClubId)?.reputation ?? 0.5) -
      (getClubProfile(player.clubId ?? "")?.reputation ?? 0.5)),
  );
  const promiseProtection = releaseClausePromiseProtectionMultiplier(player);
  const promisePremium = RELEASE_CLAUSE_RULES.promiseWagePremium * (1 - promiseProtection);
  const premium =
    RELEASE_CLAUSE_RULES.contentmentWagePremium * Math.pow(satisfaction, 1.35) +
    RELEASE_CLAUSE_RULES.loyaltyWagePremium * loyalty * satisfaction +
    RELEASE_CLAUSE_RULES.roleWagePremium[role] +
    RELEASE_CLAUSE_RULES.ambitionWagePremium * ambitionGap +
    promisePremium -
    RELEASE_CLAUSE_RULES.discontentWageDiscount * desire;
  return Math.max(WAGE_RULES.minimumWage, Math.ceil((base * Math.max(0.65, 1 + premium)) / 1_000) * 1_000);
}

/** Prioridad de búsqueda IA: combina la opción real de aceptación con el
 * atractivo deportivo, para que los clubes solventes también persigan titulares. */
export function releaseClauseTargetQualityMultiplier(player: MarketPlayer): number {
  const overallQuality = Math.max(0, Math.min(1, (player.ovr - 70) / 30));
  const marketQuality = Math.max(0, Math.min(1, Math.log10(Math.max(1, player.value) / 5_000_000) / 2));
  return 0.85 + overallQuality * 0.85 + marketQuality * 0.35;
}

/**
 * Compara la cláusula con el valor de mercado para detectar contratos mal
 * protegidos. Una cláusula de hasta un 15 % por encima del valor ya es una
 * oportunidad para un comprador grande; por debajo del valor de mercado es
 * todavía más atractiva. El multiplicador influye en la prioridad y en la
 * probabilidad, sin convertir una cláusula claramente cara en una ganga.
 */
export function releaseClausePriceAttractivenessMultiplier(player: MarketPlayer): number {
  const marketValue = Math.max(1, Number(player.value) || 1);
  const clause = Math.max(0, Number(player.contract.releaseClause) || 0);
  if (clause <= 0) return 1;
  const ratio = clause / marketValue;
  if (ratio <= 0.85) return 2.6;
  if (ratio <= 1.00) return 2.3;
  if (ratio <= 1.15) return 2.0;
  if (ratio <= 1.30) return 1.55;
  if (ratio <= 1.50) return 1.20;
  if (ratio >= 2.50) return 0.70;
  return 1;
}

/** Una ganga clara se ejecuta pagando la cláusula, sin puja ni negociación con el club vendedor. */
export function isReleaseClauseBargain(player: MarketPlayer): boolean {
  const marketValue = Math.max(1, Number(player.value) || 1);
  const clause = Math.max(0, Number(player.contract.releaseClause) || 0);
  return clause > 0 && clause <= marketValue * 1.15;
}

/** Probabilidad por oportunidad comprador-jugador. Un jugador contento
 * conserva una probabilidad residual visible. Lealtad, rol y protección de
 * promesas siguen modulando el interés, y una cláusula infravalorada lo eleva. */
export function releaseClauseProbability(player: MarketPlayer, buyerClubId: string, date = "2026-07-01"): number {
  if (player.transferListed || player.loanListed || player.contract.releaseClause <= 0) return 0;
  const desire = releaseClauseDesire(player, date);
  const wantsToLeave = wantsOut(player.id, date.slice(0, 7));
  const effectiveDesire = wantsToLeave ? Math.max(desire, 0.68) : desire;
  const buyer = getClubProfile(buyerClubId);
  const seller = player.clubId ? getClubProfile(player.clubId) : null;
  const samePositionCount = getClubPlayers(buyerClubId).filter((candidate) => candidate.group === player.group).length;
  // Una plantilla profunda reduce el interés, pero no lo anula: con el corte
  // anterior (>4) casi todos los clubes descartaban de golpe a defensas y
  // centrocampistas, dejando únicamente un puñado de candidatos.
  const positionNeed = samePositionCount <= 2 ? 1.16
    : samePositionCount <= 4 ? 0.78
      : samePositionCount <= 6 ? 0.56
        : 0.38;
  const role = releaseClauseCurrentRole(player);
  const roleFactor = RELEASE_CLAUSE_RULES.roleProbabilityMultiplier[role];
  const promiseFactor = releaseClausePromiseProtectionMultiplier(player);
  const loyaltyFactor = Math.max(0.12, 1 - player.personality.loyalty * (1 - effectiveDesire) * 0.72);
  const motivation = RELEASE_CLAUSE_RULES.happyPlayerProbabilityFloor +
    (1 - RELEASE_CLAUSE_RULES.happyPlayerProbabilityFloor) * Math.pow(effectiveDesire, RELEASE_CLAUSE_RULES.desireExponent);
  const need = buyer && seller ? Math.max(0.65, Math.min(1.18, 0.76 + buyer.aggression * 0.26)) : 0.76;
  const aggression = 0.72 + (buyer?.aggression ?? 0.5) * 0.5;
  const windowFactor = transferWindowKey(date).endsWith(":winter")
    ? RELEASE_CLAUSE_RULES.winterProbabilityFactor
    : 1;
  const calculatedChance = RELEASE_CLAUSE_RULES.baseProbability * motivation * roleFactor * loyaltyFactor *
    need * positionNeed * aggression * promiseFactor;
  // El interés residual de jugadores felices no puede caer a décimas de punto
  // porcentual después de multiplicar lealtad, rol y necesidad posicional.
  // Las promesas conservan un suelo menor gracias a promiseFactor.
  const roleFloor = RELEASE_CLAUSE_RULES.happyPlayerMinimumAttemptChance[role] * promiseFactor;
  const priceAttractiveness = releaseClausePriceAttractivenessMultiplier(player);
  return Math.min(
    RELEASE_CLAUSE_RULES.maxProbability,
    Math.max(calculatedChance, roleFloor) * priceAttractiveness * windowFactor,
  );
}

/** Demanda salarial y puntuación de aceptación para una oferta de contrato. */
export function evaluateClauseContract(player: MarketPlayer, buyerClubId: string, offeredWage: number, date = "2026-07-01"): {
  accepted: boolean; score: number; requestedWage: number; message: string;
} {
  const desire = releaseClauseDesire(player, date);
  const satisfaction = 1 - desire;
  const buyer = getClubProfile(buyerClubId);
  const current = getClubProfile(player.clubId ?? "");
  const role = releaseClauseCurrentRole(player);
  const requestedWage = releaseClauseWageDemand(player, buyerClubId, date);
  const ratio = offeredWage / Math.max(1, requestedWage);
  const reputationStep = Math.max(0, Math.min(1,
    ((buyer?.reputation ?? 0.5) - (current?.reputation ?? 0.5) + 0.25) / 0.75,
  ));
  const expectedMinutes = expectedPlayingTime(player, buyerClubId, date.slice(0, 7));
  const wageSatisfaction = Math.max(0, Math.min(1, (ratio - 0.78) / 1.82));
  const loyaltyResistance = player.personality.loyalty * satisfaction;
  const roleResistance = RELEASE_CLAUSE_RULES.roleAcceptanceResistance[role];
  const promiseResistance = RELEASE_CLAUSE_RULES.promiseAcceptanceResistance *
    (1 - releaseClausePromiseProtectionMultiplier(player));
  const score = Math.max(0, Math.min(1,
    0.20 + desire * 0.25 + wageSatisfaction * 0.50 + reputationStep * 0.08 +
    expectedMinutes * 0.08 - loyaltyResistance * 0.10 - roleResistance * 0.08 - promiseResistance,
  ));
  const accepted = score >= RELEASE_CLAUSE_RULES.acceptanceThreshold && ratio >= RELEASE_CLAUSE_RULES.minimumWageRatio;
  return {
    accepted, score, requestedWage,
    message: accepted ? "El jugador acepta las condiciones del contrato." :
      satisfaction > 0.65
        ? `El jugador está muy satisfecho con su club y su rol (${role}). Para plantearse salir necesitaría una oferta salarial extraordinaria, además de un proyecto y minutos convincentes.`
        : `El jugador exige un salario de ${requestedWage.toLocaleString("es-ES")} €/año y no acepta la propuesta actual.`,
  };
}

/** Cuota exclusiva de clausulazos IA contra clubes IA. */
export function releaseClauseAiQuotaReason(buyerClubId: string, date: string): string | null {
  const window = transferWindowKey(date);
  const windowType = window.endsWith(":winter") ? "winter" : "summer";
  const dayKey = `${window}:${date}`;
  const dailyLimit = RELEASE_CLAUSE_RULES.maxGlobalPerDay[windowType];
  const clubLimit = RELEASE_CLAUSE_RULES.maxPerClubPerWindow[windowType];
  if ((globalCounts.get(window) ?? 0) >= RELEASE_CLAUSE_RULES.maxAiGlobalByWindow[windowType]) {
    return `Se alcanzó el límite global de clausulazos IA de esta ventana (${RELEASE_CLAUSE_RULES.maxAiGlobalByWindow[windowType]}).`;
  }
  if ((dailyCounts.get(dayKey) ?? 0) >= dailyLimit) {
    return `Hoy ya se alcanzó el límite diario de clausulazos IA (${dailyLimit}).`;
  }
  if (count(window, buyerClubId) >= clubLimit) {
    return `Este club ya alcanzó su límite de clausulazos en esta ventana (${clubLimit}).`;
  }
  return null;
}

/** Cupo de salidas del club del usuario: 2 en verano y 1 en invierno. */
export function releaseClauseUserIncomingQuotaReason(date: string): string | null {
  const window = transferWindowKey(date);
  const windowType = window.endsWith(":winter") ? "winter" : "summer";
  const limit = RELEASE_CLAUSE_RULES.maxUserIncomingByWindow[windowType];
  if ((userIncomingCounts.get(window) ?? 0) >= limit) {
    return `Tu club ya ha recibido el máximo de ${limit} clausulazo${limit === 1 ? "" : "s"} de esta ventana.`;
  }
  return null;
}

export function attemptReleaseClause(input: {
  playerId: string; buyerClubId: string; date: string; wageOffer?: number;
  contractYears?: number; forceChance?: boolean; allowFirstDay?: boolean;
}): ClauseAttemptResult {
  const player = getPlayer(input.playerId);
  if (!player || !player.clubId || player.clubId === input.buyerClubId) return { success: false, reason: "Jugador o club de origen no válido." };
  if (!isMarketOpenForIso(input.date)) return { success: false, reason: "La ventana de mercado está cerrada." };
  if (player.contract.releaseClause <= 0) return { success: false, reason: "El jugador no tiene cláusula de rescisión." };
  if (player.transferListed || player.loanListed) return { success: false, reason: "El jugador está en el mercado: corresponde presentar una oferta normal." };
  if (!canPlayerMoveAgain(player.id, input.date)) return { success: false, reason: "El jugador no puede cambiar de club otra vez durante esta ventana." };
  if (isPlayerSettled(player.id) && !wantsOut(player.id, input.date.slice(0, 7))) {
    return { success: false, reason: "El jugador está protegido temporalmente tras su último fichaje o renovación." };
  }
  const buyerPlayers = getClubPlayers(input.buyerClubId);
  if (buyerPlayers.length >= SQUAD_LIMITS.maxSquadSize) return { success: false, reason: "La plantilla compradora ha alcanzado su límite." };
  const sellerPlayers = getClubPlayers(player.clubId);
  if (sellerPlayers.length <= SQUAD_LIMITS.minSquadSize ||
      (player.group === "GK" && sellerPlayers.filter(p => p.group === "GK").length <= 1)) {
    return { success: false, reason: "La salida dejaría al club vendedor sin plantilla mínima o sin portero." };
  }
  const window = transferWindowKey(input.date);
  const dayKey = `${window}:${input.date}`;
  const timingAllowed = isAiReleaseClauseTimingAllowed(input.date) ||
    (input.allowFirstDay === true && isMarketOpenForIso(input.date));
  if (!input.forceChance && !timingAllowed) {
    return { success: false, reason: "Los clubes no activan cláusulas el primer día de mercado." };
  }
  // El cupo del club del usuario es distinto del cupo IA-vs-IA. Los pagos
  // manuales se resuelven en UserNegotiation y no consumen ninguno de ellos.
  const userClubId = getUserClubId();
  const isUserDeparture = Boolean(userClubId && player.clubId === userClubId && input.buyerClubId !== userClubId);
  if (!input.forceChance) {
    const windowType = window.endsWith(":winter") ? "winter" : "summer";
    const quotaReason = isUserDeparture
      ? releaseClauseUserIncomingQuotaReason(input.date) ??
        (count(window, input.buyerClubId) >= RELEASE_CLAUSE_RULES.maxPerClubPerWindow[windowType]
          ? `Este club ya alcanzó su límite de clausulazos en esta ventana (${RELEASE_CLAUSE_RULES.maxPerClubPerWindow[windowType]}).`
          : null)
      : releaseClauseAiQuotaReason(input.buyerClubId, input.date);
    if (quotaReason) return { success: false, reason: quotaReason };
  }
  const fee = Math.round(player.contract.releaseClause);
  const requestedWage = releaseClauseWageDemand(player, input.buyerClubId, input.date);
  const desire = releaseClauseDesire(player, input.date);
  const satisfaction = 1 - desire;
  const role = releaseClauseCurrentRole(player);
  const aiMultiplier = Math.min(
    RELEASE_CLAUSE_RULES.aiMaximumWageMultiplier,
    1.35 + satisfaction * 1.35 + player.personality.loyalty * satisfaction * 0.55 +
      RELEASE_CLAUSE_RULES.roleAcceptanceResistance[role] * 1.4,
  );
  const wage = Math.max(WAGE_RULES.minimumWage, Math.round(input.wageOffer ?? requestedWage * aiMultiplier));
  if (!canAfford(input.buyerClubId, fee, wage)) return { success: false, reason: "Presupuesto o límite salarial insuficiente." };
  const terms = evaluateClauseContract(player, input.buyerClubId, wage, input.date);
  if (!terms.accepted) return { success: false, reason: terms.message, acceptanceScore: terms.score };
  // Cuando el precio de rescisión es una ganga, el comprador interesado no
  // pierde tiempo negociando: ejecuta la cláusula directamente. La validación
  // económica, el límite de mercado y la aceptación del jugador siguen activos.
  if (!input.forceChance && !isReleaseClauseBargain(player) &&
      Math.random() > releaseClauseProbability(player, input.buyerClubId, input.date)) {
    return { success: false, reason: "El club no considera asumible el riesgo de pagar la cláusula." };
  }
  const offer = createTransferOffer({
    playerId: player.id, playerName: player.name, buyerClubId: input.buyerClubId,
    sellerClubId: player.clubId, amount: fee, wageOffer: wage, date: input.date,
    clauses: { contractYears: input.contractYears ?? 4 },
  });
  // La marca viaja por el cierre común: así historial, finanzas, feed y buzón
  // identifican el movimiento como cláusula desde el primer registro.
  offer.isReleaseClause = true;
  const sellerId = player.clubId;
  const sellerWasUserClub = sellerId === getUserClubId();
  // Capturar antes del cierre: completeTransfer cambia el contrato al salario
  // del comprador antes de registrar la venta.
  const sellerWageSaved = Math.max(0, Math.round(player.contract.wage || 0));
  const sellerBudgetBefore = sellerWasUserClub ? getFinances(sellerId).budget : null;
  const record = withUserApproval(() => completeTransfer(offer, input.date));
  if (!record) return { success: false, reason: "No se pudo completar el traspaso; se han conservado los estados originales." };
  record.isReleaseClause = true;
  record.sellerWageSaved = sellerWageSaved;
  if (sellerWasUserClub && sellerBudgetBefore !== null) {
    // completeTransfer registra normalmente la venta. Esta barrera idempotente
    // garantiza que el precio de la cláusula Y el salario anual que deja de
    // pagar el vendedor lleguen íntegros al presupuesto, incluso si una ruta
    // legacy omite registerSale: sólo acredita la diferencia que falte.
    const expectedBudget = sellerBudgetBefore + fee + sellerWageSaved;
    const currentBudget = getFinances(sellerId).budget;
    if (currentBudget < expectedBudget) {
      const bridgeBudget = expectedBudget;
      // La escritura del presupuesto de usuario se hace mediante la función
      // económica central, sin tocar la reserva salarial.
      creditUserTransferBudget(sellerId, bridgeBudget - currentBudget);
    }
  }
  recordTransfer(record);
  if (!input.forceChance) {
    if (isUserDeparture) {
      userIncomingCounts.set(window, (userIncomingCounts.get(window) ?? 0) + 1);
      // El cupo de comprador se comparte con operaciones IA-IA: un mismo
      // club no puede clausular primero a tu jugador y después a otro rival.
      incrementClubCount(window, input.buyerClubId);
    } else {
      increment(window, input.buyerClubId);
      dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);
    }
  }
  return { success: true, reason: `Cláusula pagada: ${fee.toLocaleString("es-ES")} €.`, transfer: record, acceptanceScore: terms.score };
}

export interface ReleaseClauseSaveState {
  windowCounts: Array<[string, Array<[string, number]>]>;
  globalCounts: Array<[string, number]>;
  dailyCounts?: Array<[string, number]>;
  userIncomingCounts?: Array<[string, number]>;
  userOpportunityDates?: string[];
  userTargetedPlayers?: string[];
  /** v3: objetivos por comprador; v1/v2 guardaban bloqueos globales demasiado restrictivos. */
  userTargetTrackingVersion?: number;
}
export function snapshotReleaseClauseState(): ReleaseClauseSaveState {
  return {
    windowCounts: [...windowCounts].map(([key, value]) => [key, [...value]]),
    globalCounts: [...globalCounts],
    dailyCounts: [...dailyCounts],
    userIncomingCounts: [...userIncomingCounts],
    userOpportunityDates: [...userOpportunityDates],
    userTargetedPlayers: [...userTargetedPlayers],
    userTargetTrackingVersion: 3,
  };
}
export function restoreReleaseClauseState(state?: ReleaseClauseSaveState): void {
  windowCounts.clear(); globalCounts.clear(); dailyCounts.clear(); userIncomingCounts.clear();
  userOpportunityDates.clear(); userTargetedPlayers.clear();
  for (const [key, entries] of state?.windowCounts ?? []) windowCounts.set(key, new Map(entries));
  for (const [key, value] of state?.globalCounts ?? []) globalCounts.set(key, value);
  for (const [key, value] of state?.dailyCounts ?? []) dailyCounts.set(key, value);
  for (const [key, value] of state?.userIncomingCounts ?? []) userIncomingCounts.set(key, value);
  for (const date of state?.userOpportunityDates ?? []) userOpportunityDates.add(date);
  // V1/V2 guardaban una marca global por jugador y podían impedir que otros
  // clubes lo intentasen. Sólo conservamos las marcas creadas con el esquema v3.
  if ((state?.userTargetTrackingVersion ?? 0) >= 3) {
    for (const key of state?.userTargetedPlayers ?? []) userTargetedPlayers.add(key);
  }
}
export function resetReleaseClauseState(): void {
  windowCounts.clear(); globalCounts.clear(); dailyCounts.clear(); userIncomingCounts.clear();
  userOpportunityDates.clear(); userTargetedPlayers.clear();
}
export function releaseClauseCanBePaid(playerId: string, buyerClubId: string, date: string): ClauseAttemptResult {
  const player = getPlayer(playerId);
  if (!player) return { success: false, reason: "Jugador no encontrado." };
  if (!isMarketOpenForIso(date)) return { success: false, reason: "La ventana de mercado está cerrada." };
  if (player.clubId === buyerClubId) return { success: false, reason: "El jugador ya pertenece a tu club." };
  if (!player.clubId) return { success: false, reason: "Los agentes libres no tienen club al que pagar una cláusula." };
  if (player.contract.releaseClause <= 0) return { success: false, reason: "El jugador no tiene cláusula de rescisión." };
  if (player.transferListed || player.loanListed) return { success: false, reason: "El jugador está en el mercado; presenta una oferta normal." };
  if (!canPlayerMoveAgain(player.id, date)) return { success: false, reason: "El jugador no puede cambiar de club otra vez durante esta ventana." };
  if (isPlayerSettled(player.id) && !wantsOut(player.id, date.slice(0, 7))) {
    return { success: false, reason: "El jugador está protegido temporalmente tras su último fichaje o renovación." };
  }
  const buyerPlayers = getClubPlayers(buyerClubId);
  if (buyerPlayers.length >= SQUAD_LIMITS.maxSquadSize) return { success: false, reason: "Tu plantilla ha alcanzado el límite de jugadores." };
  const sellerPlayers = getClubPlayers(player.clubId);
  if (sellerPlayers.length <= SQUAD_LIMITS.minSquadSize ||
      (player.group === "GK" && sellerPlayers.filter(p => p.group === "GK").length <= 1)) {
    return { success: false, reason: "La operación dejaría al club vendedor sin plantilla mínima o sin portero." };
  }
  // La ficha definitiva se introduce en el modal; aquí validamos solo el pago
  // de la cláusula. El margen salarial se comprueba con el salario negociado
  // y vuelve a validarse de forma atómica en attemptReleaseClause().
  if (!canAfford(buyerClubId, player.contract.releaseClause, 0)) return { success: false, reason: "Presupuesto de fichajes insuficiente para pagar íntegramente la cláusula." };
  return { success: true, reason: "Cláusula disponible; falta negociar el contrato con el jugador." };
}

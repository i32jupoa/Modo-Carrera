/**
 * Negociación de contratos dentro del propio club.
 *
 * El jugador ya pertenece al proyecto: se reutilizan las decisiones y
 * demandas del mercado, pero con un umbral más flexible y bonus por lealtad,
 * permanencia y condición de canterano.
 */

import { addDaysToIso } from "@/lib/transferWindows";
import {
  CONTRACT_RULES,
  INTERNAL_CONTRACT_NEGOTIATION,
  WAGE_RULES,
} from "./constants";
import {
  decideOnRenewal,
  minimumSquadRole,
  preferredContractYears,
  roleRank,
  wageDemand,
} from "./PlayerDecision";
import { getPlayer } from "./PlayerIndex";
import { clamp, normalize, seededRange } from "./random";
import type { Contract, MarketPlayer, SquadRole } from "./types";

export type InternalContractKind = "renewal" | "promotion" | "youth-renewal";

export interface InternalContractOffer {
  years: number;
  wage: number;
  releaseClause: number;
  signingBonus: number;
  squadRole: SquadRole;
}

export interface InternalContractContext {
  morale?: number;
  currentRole?: SquadRole;
  yearsAtClub?: number;
  homegrown?: boolean;
  expectedRole?: SquadRole;
  cacheKey?: string;
  /** Señal de satisfacción agregada (0–100) derivada del estado del jugador. */
  satisfaction?: number;
}

export type InternalContractVerdict = "accepted" | "counter" | "rejected";

export interface InternalContractEvaluation {
  verdict: InternalContractVerdict;
  counter?: InternalContractOffer;
  mood: number;
  score: number;
  reasons: string[];
  wageRequested: number;
  yearsRequested: number;
  roleRequested: SquadRole;
  signingBonusRequested: number;
  insulting: boolean;
  moraleDelta: number;
  message: string;
  coolingUntil?: string;
}

export interface InternalContractHistoryEntry {
  round: number;
  by: "club" | "player";
  offer: InternalContractOffer;
  verdict?: InternalContractVerdict;
  text: string;
  date: string;
}

export interface InternalContractNegotiationState {
  id: string;
  playerId: string;
  playerName: string;
  clubId: string;
  kind: InternalContractKind;
  startedOn: string;
  updatedOn: string;
  round: number;
  counterOffers: number;
  offer: InternalContractOffer;
  counterOffer?: InternalContractOffer;
  demand: {
    wage: number;
    years: number;
    role: SquadRole;
    signingBonus: number;
  };
  mood: number;
  lastMessage: string;
  status: "open" | "accepted" | "rejected" | "withdrawn";
  pendingAcceptedOffer?: InternalContractOffer;
  coolingUntil?: string;
  history: InternalContractHistoryEntry[];
}

const negotiations = new Map<string, InternalContractNegotiationState>();

function negotiationId(playerId: string, clubId: string, kind: InternalContractKind): string {
  return `internal-contract:${kind}:${clubId}:${playerId}`;
}

function roleLabel(role: SquadRole): string {
  switch (role) {
    case "star": return "Estrella";
    case "starter": return "Titular";
    case "rotation": return "Rotación";
    case "prospect": return "Promesa";
    default: return "Secundario";
  }
}

function normaliseContractOffer(player: MarketPlayer, offer: InternalContractOffer): InternalContractOffer {
  return {
    years: clamp(Math.round(offer.years), CONTRACT_RULES.minYears, CONTRACT_RULES.maxYears),
    wage: Math.max(WAGE_RULES.minimumWage, Math.round(offer.wage)),
    releaseClause: Math.max(0, Math.round(offer.releaseClause)),
    signingBonus: Math.max(0, Math.round(offer.signingBonus)),
    squadRole: offer.squadRole,
  };
}

function defaultRole(player: MarketPlayer, context: InternalContractContext, cacheKey: string): SquadRole {
  if (context.expectedRole) return context.expectedRole;
  try {
    return minimumSquadRole(player.id, player.clubId ?? "", cacheKey);
  } catch {
    if (player.age <= 21 && player.ovr < 78) return "prospect";
    if (player.ovr >= 88) return "star";
    if (player.ovr >= 82) return "starter";
    if (player.ovr >= 76) return "rotation";
    return "secondary";
  }
}

function fallbackWageDemand(player: MarketPlayer): number {
  return Math.max(WAGE_RULES.minimumWage, wageDemand(player.id, player.clubId));
}

function requestedValues(
  player: MarketPlayer,
  kind: InternalContractKind,
  context: InternalContractContext,
  date: string,
): { wage: number; years: number; role: SquadRole; signingBonus: number } {
  const cacheKey = context.cacheKey ?? date;
  const role = defaultRole(player, context, cacheKey);
  const renewal = kind === "renewal" ? decideOnRenewal(player.id, cacheKey) : null;
  const externalWage = renewal?.wageRequested ?? fallbackWageDemand(player);
  const wage = Math.max(
    WAGE_RULES.minimumWage,
    Math.round((
      externalWage * (
        1 - INTERNAL_CONTRACT_NEGOTIATION.ownedWageFlexibility -
        (context.homegrown ? INTERNAL_CONTRACT_NEGOTIATION.homegrownWageFlexibility : 0)
      )
    ) / 5_000) * 5_000,
  );
  const preferredYears = renewal?.yearsRequested ?? preferredContractYears(player.id);
  const years = clamp(
    Math.round(preferredYears),
    CONTRACT_RULES.minYears,
    CONTRACT_RULES.maxYears,
  );
  const signingBonus = kind === "youth-renewal"
    ? 0
    : Math.round(Math.max(0, wage * INTERNAL_CONTRACT_NEGOTIATION.signingBonusShare) / 1_000) * 1_000;
  return {
    wage: Math.max(WAGE_RULES.minimumWage, wage),
    years,
    role,
    signingBonus,
  };
}

function buildCounter(
  offer: InternalContractOffer,
  demand: { wage: number; years: number; role: SquadRole; signingBonus: number },
): InternalContractOffer {
  const nextWage = Math.round(
    offer.wage + (demand.wage - offer.wage) * INTERNAL_CONTRACT_NEGOTIATION.counterWageStep,
  );
  const yearsGap = demand.years - offer.years;
  const nextYears = yearsGap > 0
    ? Math.min(
        demand.years,
        offer.years + Math.max(1, Math.round(yearsGap * INTERNAL_CONTRACT_NEGOTIATION.counterYearsStep)),
      )
    : offer.years;
  const role = roleRank(offer.squadRole) < roleRank(demand.role)
    ? demand.role
    : offer.squadRole;
  const bonus = demand.signingBonus > 0
    ? Math.round(Math.max(offer.signingBonus, demand.signingBonus * 0.9) / 1_000) * 1_000
    : offer.signingBonus;
  return {
    ...offer,
    wage: Math.max(WAGE_RULES.minimumWage, nextWage),
    years: nextYears,
    signingBonus: bonus,
    squadRole: role,
  };
}

/** Evalúa una oferta concreta sin cambiar el estado del mundo. */
export function evaluateInternalOffer(input: {
  playerId: string;
  kind: InternalContractKind;
  offer: InternalContractOffer;
  context?: InternalContractContext;
  date?: string;
  player?: MarketPlayer;
}): InternalContractEvaluation {
  const player = input.player ?? getPlayer(input.playerId);
  const date = input.date ?? "2026-07-01";
  if (!player || (player.clubId === null && input.kind !== "promotion")) {
    return {
      verdict: "rejected",
      mood: 0,
      score: 0,
      reasons: ["No se ha encontrado un jugador válido para esta negociación."],
      wageRequested: WAGE_RULES.minimumWage,
      yearsRequested: 1,
      roleRequested: "secondary",
      signingBonusRequested: 0,
      insulting: false,
      moraleDelta: 0,
      message: "No se puede abrir esta negociación.",
    };
  }

  const context = input.context ?? {};
  const demand = requestedValues(player, input.kind, context, date);
  const offer = normaliseContractOffer(player, input.offer);
  const cacheKey = context.cacheKey ?? date;
  const roleGap = roleRank(demand.role) - roleRank(offer.squadRole);
  const wageRatio = offer.wage / Math.max(1, demand.wage);
  const yearsGap = demand.years - offer.years;
  const bonusRatio = demand.signingBonus > 0
    ? offer.signingBonus / demand.signingBonus
    : 1;

  const wageScore = input.kind === "youth-renewal"
    ? 1
    : clamp(normalize(wageRatio, INTERNAL_CONTRACT_NEGOTIATION.negotiationWageFloor, 1.08), 0, 1);
  const roleScore = input.kind === "youth-renewal"
    ? 1
    : clamp(0.84 - Math.max(0, roleGap) * INTERNAL_CONTRACT_NEGOTIATION.rolePenaltyPerGap + Math.max(0, -roleGap) * 0.04, 0, 1);
  const yearsScore = clamp(0.88 - Math.max(0, yearsGap) * INTERNAL_CONTRACT_NEGOTIATION.yearsPenaltyPerGap, 0, 1);
  const bonusScore = input.kind === "youth-renewal"
    ? 1
    : clamp(normalize(bonusRatio, 0.6, 1.1), 0, 1);
  const morale = clamp(Number(context.morale ?? 70) / 100, 0, 1);
  const satisfaction = clamp(Number(context.satisfaction ?? context.morale ?? 70) / 100, 0, 1);
  const loyalty = clamp(player.personality.loyalty, 0, 1);
  const tenureYears = clamp(Math.floor(context.yearsAtClub ?? 0), 0, 10);
  const tenureBonus = Math.min(
    INTERNAL_CONTRACT_NEGOTIATION.tenureBonusMax,
    tenureYears * INTERNAL_CONTRACT_NEGOTIATION.tenureBonusPerYear,
  );
  const homegrownBonus = context.homegrown ? INTERNAL_CONTRACT_NEGOTIATION.homegrownBonus : 0;
  const satisfactionScore = clamp(
    loyalty * 0.35 + morale * 0.25 + satisfaction * 0.20 + tenureBonus + homegrownBonus + (1 - player.personality.greed) * 0.1,
    0,
    1,
  );
  const variance = seededRange(
    INTERNAL_CONTRACT_NEGOTIATION.deterministicVarianceMin,
    INTERNAL_CONTRACT_NEGOTIATION.deterministicVarianceMax,
    player.id,
    player.clubId ?? "internal",
    input.kind,
    date.slice(0, 7),
  );

  const rawScore =
    wageScore * INTERNAL_CONTRACT_NEGOTIATION.wageWeight +
    roleScore * INTERNAL_CONTRACT_NEGOTIATION.roleWeight +
    yearsScore * INTERNAL_CONTRACT_NEGOTIATION.yearsWeight +
    bonusScore * INTERNAL_CONTRACT_NEGOTIATION.signingBonusWeight +
    satisfactionScore * INTERNAL_CONTRACT_NEGOTIATION.loyaltyWeight +
    variance;
  const score = clamp(rawScore, 0, 1);
  const loyaltyFlex = loyalty * 0.06;
  const threshold = clamp(
    INTERNAL_CONTRACT_NEGOTIATION.acceptanceScoreThreshold - loyaltyFlex - tenureBonus - homegrownBonus,
    0.25,
    INTERNAL_CONTRACT_NEGOTIATION.acceptanceScoreThreshold,
  );

  const insulting =
    (input.kind !== "youth-renewal" && wageRatio < INTERNAL_CONTRACT_NEGOTIATION.insultingWageRatio) ||
    (yearsGap >= 3 && roleGap >= 2);

  const reasons: string[] = [];
  if (wageRatio >= 1) reasons.push("la ficha iguala o supera lo que esperaba");
  else if (wageRatio >= 0.9) reasons.push("la ficha está muy cerca de su petición");
  else reasons.push(`considera que la ficha debería acercarse a ${demand.wage.toLocaleString("es-ES")} €/año`);

  if (roleGap <= 0) reasons.push(`el rol de ${roleLabel(offer.squadRole)} le convence`);
  else reasons.push(`prefiere un rol de ${roleLabel(demand.role)}`);

  if (yearsGap <= 0) reasons.push(`la duración de ${offer.years} años le encaja`);
  else if (yearsGap === 1) reasons.push(`preferiría ${demand.years} años, pero acepta hablarlo`);
  else reasons.push(`quiere un compromiso contractual mayor`);

  if (context.homegrown) reasons.push("valora especialmente su vínculo con la cantera y el club");
  else if (loyalty >= 0.72) reasons.push("su lealtad al club facilita el acuerdo");
  if (morale < 0.4) reasons.push("su satisfacción actual es baja y está menos predispuesto");

  const exceptional =
    offer.wage / Math.max(1, demand.wage) >= INTERNAL_CONTRACT_NEGOTIATION.exceptionalWageRatio &&
    roleGap <= 0 &&
    yearsGap <= 0;
  const accepted = !insulting && (score >= threshold || exceptional);

  let verdict: InternalContractVerdict;
  if (accepted) verdict = "accepted";
  else if (insulting || score < threshold - 0.16) verdict = "rejected";
  else verdict = "counter";

  const counter = verdict === "counter" ? buildCounter(offer, demand) : undefined;
  const moodBase =
    52 +
    satisfactionScore * 38 +
    (score - threshold) * 40 -
    (insulting ? INTERNAL_CONTRACT_NEGOTIATION.insultingMoraleDrop : 0);
  const mood = Math.round(clamp(moodBase, 8, 98));
  const moraleDelta = insulting
    ? -INTERNAL_CONTRACT_NEGOTIATION.insultingMoraleDrop
    : verdict === "accepted" || score >= threshold + 0.04
      ? INTERNAL_CONTRACT_NEGOTIATION.positiveMoraleGain
      : 0;

  let message = "";
  if (verdict === "accepted") {
    message = `Me parecen buenas condiciones. Puedo firmar por ${offer.years} años y el rol de ${roleLabel(offer.squadRole)}.`;
  } else if (verdict === "counter" && counter) {
    const parts = [`acercaría la ficha a ${counter.wage.toLocaleString("es-ES")} €/año`];
    if (counter.years !== offer.years) parts.push(`subiría el contrato a ${counter.years} años`);
    if (counter.squadRole !== offer.squadRole) parts.push(`aceptaría con rol de ${roleLabel(counter.squadRole)}`);
    message = `Quiero seguir en el club, pero ${parts.join(", ")}.`;
  } else if (insulting) {
    message = "La propuesta está demasiado lejos de lo que considero razonable para mi situación. Me ha molestado bastante.";
  } else {
    message = "No encuentro un punto suficientemente bueno en estas condiciones. Prefiero dejar la negociación.";
  }

  return {
    verdict,
    counter,
    mood,
    score,
    reasons,
    wageRequested: demand.wage,
    yearsRequested: demand.years,
    roleRequested: demand.role,
    signingBonusRequested: demand.signingBonus,
    insulting,
    moraleDelta,
    message,
    coolingUntil: verdict === "rejected" ? addDaysToIso(date, INTERNAL_CONTRACT_NEGOTIATION.coolingDays) : undefined,
  };
}

export function buildInitialInternalOffer(input: {
  playerId: string;
  kind: InternalContractKind;
  date: string;
  context?: InternalContractContext;
}): InternalContractOffer {
  const player = getPlayer(input.playerId);
  if (!player) {
    return { years: 2, wage: WAGE_RULES.minimumWage, releaseClause: 0, signingBonus: 0, squadRole: "rotation" };
  }
  const demand = requestedValues(player, input.kind, input.context ?? {}, input.date);
  return {
    years: demand.years,
    wage: Math.max(
      WAGE_RULES.minimumWage,
      Math.round(demand.wage * 0.9 / 1_000) * 1_000,
    ),
    releaseClause: Math.max(0, Math.round(player.contract.releaseClause || player.value * 1.7)),
    signingBonus: input.kind === "youth-renewal" ? 0 : Math.round(demand.signingBonus * 0.75 / 1_000) * 1_000,
    squadRole: input.context?.currentRole ?? demand.role,
  };
}

export function startInternalContractNegotiation(input: {
  playerId: string;
  clubId: string;
  kind: InternalContractKind;
  date: string;
  context?: InternalContractContext;
}): InternalContractNegotiationState | { blockedUntil: string } {
  const player = getPlayer(input.playerId);
  if (!player) throw new Error("Jugador no encontrado.");
  const id = negotiationId(input.playerId, input.clubId, input.kind);
  const existing = negotiations.get(id);
  if (existing?.status === "open") return existing;
  if (existing?.coolingUntil && existing.coolingUntil > input.date) {
    return { blockedUntil: existing.coolingUntil };
  }

  const offer = buildInitialInternalOffer(input);
  const demand = requestedValues(player, input.kind, input.context ?? {}, input.date);
  const state: InternalContractNegotiationState = {
    id,
    playerId: input.playerId,
    playerName: player.name,
    clubId: input.clubId,
    kind: input.kind,
    startedOn: input.date,
    updatedOn: input.date,
    round: 0,
    counterOffers: 0,
    offer,
    demand,
    mood: Math.round(clamp((input.context?.morale ?? 70), 0, 100)),
    lastMessage: "Listo para escuchar tu propuesta.",
    status: "open",
    history: [],
  };
  negotiations.set(id, state);
  return state;
}

export function submitInternalContractOffer(input: {
  negotiationId: string;
  offer: InternalContractOffer;
  date: string;
  context?: InternalContractContext;
}): InternalContractEvaluation & { negotiation: InternalContractNegotiationState } {
  const state = negotiations.get(input.negotiationId);
  if (!state) throw new Error("Negociación interna no encontrada.");
  if (state.status !== "open") {
    return {
      verdict: state.status === "accepted" ? "accepted" : "rejected",
      counter: state.counterOffer,
      mood: state.mood,
      score: 0,
      reasons: ["La negociación ya ha terminado."],
      wageRequested: state.demand.wage,
      yearsRequested: state.demand.years,
      roleRequested: state.demand.role,
      signingBonusRequested: state.demand.signingBonus,
      insulting: false,
      moraleDelta: 0,
      message: state.lastMessage,
      coolingUntil: state.coolingUntil,
      negotiation: state,
    };
  }

  const player = getPlayer(state.playerId);
  if (!player) throw new Error("Jugador no encontrado.");
  const evaluation = evaluateInternalOffer({
    playerId: state.playerId,
    kind: state.kind,
    offer: input.offer,
    context: input.context,
    date: input.date,
    player,
  });
  state.round += 1;
  state.updatedOn = input.date;
  state.offer = normaliseContractOffer(player, input.offer);
  state.demand = {
    wage: evaluation.wageRequested,
    years: evaluation.yearsRequested,
    role: evaluation.roleRequested,
    signingBonus: evaluation.signingBonusRequested,
  };
  state.mood = evaluation.mood;
  state.counterOffer = evaluation.counter;
  state.lastMessage = evaluation.message;
  state.history.push({
    round: state.round,
    by: "club",
    offer: state.offer,
    date: input.date,
    verdict: evaluation.verdict,
    text: `Oferta del club: ${state.offer.wage.toLocaleString("es-ES")} €/año · ${state.offer.years} años · ${roleLabel(state.offer.squadRole)}.`,
  });
  state.history.push({
    round: state.round,
    by: "player",
    offer: evaluation.counter ?? state.offer,
    date: input.date,
    verdict: evaluation.verdict,
    text: evaluation.message,
  });

  let verdict = evaluation.verdict;
  if (verdict === "counter") {
    state.counterOffers += 1;
    if (state.counterOffers > INTERNAL_CONTRACT_NEGOTIATION.maxCounterOffers) {
      verdict = "rejected";
      state.status = "rejected";
      state.coolingUntil = addDaysToIso(input.date, INTERNAL_CONTRACT_NEGOTIATION.coolingDays);
      state.lastMessage = "Hemos intercambiado varias propuestas y prefiero dejar la negociación por ahora.";
      state.counterOffer = undefined;
    }
  } else if (verdict === "accepted") {
    // La aceptación del jugador es provisional hasta que el store aplique el
    // contrato. Así, una falta de presupuesto/plazas nunca deja la sesión
    // atascada en un estado terminal.
    state.status = "open";
    state.pendingAcceptedOffer = state.offer;
    state.coolingUntil = undefined;
  } else {
    state.status = "rejected";
    state.coolingUntil = evaluation.coolingUntil;
    state.counterOffer = undefined;
  }

  state.lastMessage = verdict === "accepted"
    ? evaluation.message
    : state.lastMessage;
  negotiations.set(state.id, state);

  return {
    ...evaluation,
    verdict,
    counter: verdict === "counter" ? state.counterOffer : undefined,
    coolingUntil: state.coolingUntil,
    message: state.lastMessage,
    negotiation: { ...state, history: state.history.slice() },
  };
}

export function withdrawInternalContractNegotiation(negotiationIdValue: string, date: string): InternalContractNegotiationState | null {
  const state = negotiations.get(negotiationIdValue);
  if (!state) return null;
  state.status = "withdrawn";
  state.updatedOn = date;
  state.counterOffer = undefined;
  state.pendingAcceptedOffer = undefined;
  state.lastMessage = "Has retirado la oferta. Puedes volver a intentarlo más adelante.";
  negotiations.set(state.id, state);
  return { ...state, history: state.history.slice() };
}

export function acceptInternalCounterOffer(negotiationIdValue: string, date: string): InternalContractNegotiationState | null {
  const state = negotiations.get(negotiationIdValue);
  if (!state || state.status !== "open" || !state.counterOffer) return null;
  state.offer = state.counterOffer;
  state.counterOffer = undefined;
  state.pendingAcceptedOffer = state.offer;
  state.updatedOn = date;
  state.lastMessage = "Perfecto. Estoy dispuesto a firmar estas condiciones.";
  negotiations.set(state.id, state);
  return { ...state, history: state.history.slice() };
}

export function completeInternalContractNegotiation(negotiationIdValue: string, accepted: boolean, date: string): void {
  const state = negotiations.get(negotiationIdValue);
  if (!state) return;
  state.updatedOn = date;
  state.status = accepted ? "accepted" : "rejected";
  if (accepted) {
    state.counterOffer = undefined;
    state.pendingAcceptedOffer = undefined;
    state.coolingUntil = undefined;
  } else {
    state.pendingAcceptedOffer = undefined;
    state.coolingUntil = addDaysToIso(date, INTERNAL_CONTRACT_NEGOTIATION.coolingDays);
  }
  negotiations.set(state.id, state);
}

export function getInternalContractNegotiation(negotiationIdValue: string): InternalContractNegotiationState | undefined {
  const state = negotiations.get(negotiationIdValue);
  return state ? { ...state, history: state.history.slice() } : undefined;
}

export function getInternalContractNegotiationsSnapshot(): InternalContractNegotiationState[] {
  return Array.from(negotiations.values()).map((state) => ({ ...state, history: state.history.slice() }));
}

export function hydrateInternalContractNegotiations(snapshot: readonly InternalContractNegotiationState[] | undefined): void {
  negotiations.clear();
  for (const state of snapshot ?? []) {
    if (!state?.id || !state.playerId || !state.clubId) continue;
    negotiations.set(state.id, {
      ...state,
      history: Array.isArray(state.history) ? state.history.slice() : [],
    });
  }
}

export function clearInternalContractNegotiations(): void {
  negotiations.clear();
}

export function contractFromMarketPlayer(player: MarketPlayer): Contract {
  return { ...player.contract };
}

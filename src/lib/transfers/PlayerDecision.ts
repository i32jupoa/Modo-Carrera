/**
 * Decisión del jugador.
 *
 * Un traspaso no se cierra sólo entre clubes: el jugador tiene la última
 * palabra. Aquí se calcula qué salario pide, cuánto le atrae el club de
 * destino (proyecto, minutos, país, liga), si quiere salir de su club actual y
 * si aceptaría una renovación.
 *
 * Todas las decisiones son deterministas: mismo jugador + mismo club + misma
 * semilla => misma respuesta.
 */

import { getClubProfile } from "./ClubStrategy";
import { CONTRACT_RULES, SQUAD_LIMITS, WAGE_RULES } from "./constants";
import { getPlayer } from "./PlayerIndex";
import { getSquadReport } from "./SquadAnalyzer";
import { clamp, lerp, normalize, seededRange } from "./random";
import type { MarketPlayer, PlayerDecision, PlayerDecisionVerdict } from "./types";

// ============================================================================
// SALARIO PEDIDO
// ============================================================================

/**
 * Salario anual que el jugador exige para firmar por `toClubId`.
 *
 * Parte de su salario actual (nunca acepta bajar salvo que el club sea muy
 * superior) y aplica subida por cambio de club, codicia y estatus.
 */
export function wageDemand(playerId: string, toClubId: string | null): number {
  const player = getPlayer(playerId);
  if (!player) return WAGE_RULES.minimumWage;

  const current = Math.max(WAGE_RULES.minimumWage, player.contract.wage);
  const fair = Math.max(WAGE_RULES.minimumWage, Math.round(player.value * WAGE_RULES.valueToWage));
  const base = Math.max(current, fair);

  let raise = WAGE_RULES.moveRaise + player.personality.greed * 0.35;

  if (toClubId) {
    const target = getClubProfile(toClubId);
    const origin = player.clubId ? getClubProfile(player.clubId) : null;
    const stepUp = origin ? target.reputation - origin.reputation : 0;
    // Ir a un club mucho mejor rebaja las exigencias; bajar de nivel las sube.
    raise -= clamp(stepUp, -0.4, 0.4) * 0.3 * (1 - player.personality.greed);
    // Un club con poco poder económico no puede fichar a quien pide mucho:
    // el jugador lo sabe y no rebaja nada por ellos.
    raise += (1 - target.financialPower) * 0.05;
  }

  if (!player.clubId) raise = 1; // agente libre: sin prima de cambio de club.

  return Math.max(WAGE_RULES.minimumWage, Math.round((base * raise) / 5_000) * 5_000);
}

// ============================================================================
// ATRACTIVO DEL DESTINO
// ============================================================================

/** Minutos esperados en el club de destino (0..1). */
export function expectedPlayingTime(player: MarketPlayer, toClubId: string, cacheKey: string): number {
  const report = getSquadReport(toClubId, cacheKey);
  if (report.size === 0) return 0.9;
  const gap = player.ovr - report.startingRating;
  const groupCount = report.countByGroup[player.group];
  const crowding = normalize(groupCount, 2, 7);
  return clamp(normalize(gap, -8, 4) * (1 - crowding * 0.35) + (gap > 0 ? 0.15 : 0), 0.02, 1);
}

/** Cuánto le atrae al jugador el proyecto del club de destino (0..1). */
export function clubAppeal(player: MarketPlayer, toClubId: string, cacheKey: string): number {
  const target = getClubProfile(toClubId);
  const origin = player.clubId ? getClubProfile(player.clubId) : null;
  const p = player.personality;

  const prestige = target.reputation;
  const minutes = expectedPlayingTime(player, toClubId, cacheKey);
  const sameCountry = target.country !== "" && target.country === nationOf(player);
  const sameLeague = origin ? origin.leagueId === target.leagueId : true;

  let appeal =
    prestige * (0.35 + p.ambition * 0.4) +
    minutes * (0.2 + p.playingTimeDesire * 0.45) +
    target.ambition * 0.12;

  // Cambiar de país o de liga sólo gusta a los aventureros.
  if (!sameLeague) appeal += (p.adventure - 0.5) * 0.22;
  if (sameCountry) appeal += 0.08;

  // Dar un paso atrás en reputación desmotiva.
  if (origin) appeal += clamp(target.reputation - origin.reputation, -0.5, 0.5) * 0.3;

  return clamp(appeal / 1.35, 0, 1);
}

function nationOf(player: MarketPlayer): string {
  return player.nation || "";
}

// ============================================================================
// ¿QUIERE SALIR?
// ============================================================================

/**
 * Ganas de salir del club actual (0..1): pocos minutos, contrato acabando,
 * ambición no satisfecha o estar en la lista de transferibles.
 */
export function desireToLeave(playerId: string, cacheKey: string): number {
  const player = getPlayer(playerId);
  if (!player) return 0;
  if (!player.clubId) return 1;

  const p = player.personality;
  const report = getSquadReport(player.clubId, cacheKey);
  const profile = getClubProfile(player.clubId);

  const minutes = clamp(normalize(player.ovr - report.startingRating, -10, 3), 0, 1);
  let desire = (1 - minutes) * p.playingTimeDesire * 0.55;

  // Jugador muy por encima de su club: quiere un proyecto mayor.
  const overqualified = clamp(normalize(player.ovr - report.startingRating, 2, 10), 0, 1);
  desire += overqualified * p.ambition * (1 - profile.reputation) * 0.5;

  if (player.contract.yearsLeft <= 1) desire += 0.2;
  if (player.transferListed) desire += 0.35;
  if (player.age >= SQUAD_LIMITS.veteranAge && minutes < 0.4) desire += 0.15;

  desire -= p.loyalty * 0.3;
  desire += seededRange(-0.05, 0.05, player.id, "leave") ;

  return clamp(desire, 0, 1);
}

/** ¿Ha pedido públicamente salir del club? */
export function wantsOut(playerId: string, cacheKey: string): boolean {
  return desireToLeave(playerId, cacheKey) >= 0.68;
}

// ============================================================================
// DECISIÓN SOBRE UNA OFERTA
// ============================================================================

export interface MoveDecisionInput {
  playerId: string;
  toClubId: string;
  /** Salario anual ofrecido en euros. */
  wageOffer: number;
  /** Clave de caché de informes (normalmente la fecha simulada). */
  cacheKey: string;
  /** Cesión en lugar de traspaso. */
  loan?: boolean;
  /** Últimos días de la ventana: el jugador es menos exigente. */
  deadlineDay?: boolean;
}

function verdictFor(score: number, wageRatio: number): PlayerDecisionVerdict {
  if (wageRatio < 0.8) return "rejected-wage";
  if (score >= 0.62) return "accepted";
  if (score >= 0.5) return "negotiating";
  return "rejected-project";
}

/** Decide si el jugador acepta el traspaso y en qué condiciones. */
export function decideOnMove(input: MoveDecisionInput): PlayerDecision {
  const player = getPlayer(input.playerId);
  // En una cesión el jugador conserva su contrato: no exige subida, sólo que
  // se le respete la ficha que ya tiene.
  const required = input.loan
    ? Math.max(WAGE_RULES.minimumWage, getPlayer(input.playerId)?.contract.wage ?? WAGE_RULES.minimumWage)
    : wageDemand(input.playerId, input.toClubId);

  if (!player) {
    return {
      playerId: input.playerId,
      verdict: "rejected-project",
      score: 0,
      appeal: 0,
      wageRequested: required,
      playingTime: 0,
      message: "Jugador no encontrado.",
    };
  }

  const appeal = clubAppeal(player, input.toClubId, input.cacheKey);
  const playingTime = expectedPlayingTime(player, input.toClubId, input.cacheKey);
  const wageRatio = required > 0 ? input.wageOffer / required : 1;
  const leave = desireToLeave(input.playerId, input.cacheKey);
  const p = player.personality;

  // El peso del dinero depende de la codicia; el del proyecto, de la ambición.
  const moneyScore = clamp(normalize(wageRatio, 0.75, 1.4), 0, 1);
  let score =
    appeal * (0.5 - p.greed * 0.15) +
    moneyScore * (0.28 + p.greed * 0.22) +
    leave * 0.22;

  if (input.loan) {
    // Una cesión no es dejar el club: lo que pesa son los minutos, y bajar de
    // nivel deportivo importa mucho menos.
    score += playingTime * (0.18 + p.playingTimeDesire * 0.22);
    score += (1 - appeal) * 0.12;
  }
  if (input.deadlineDay) score += 0.05;
  if (!input.loan) score -= p.loyalty * 0.12 * (player.clubId ? 1 : 0);
  score = clamp(score, 0, 1);

  const verdict = verdictFor(score, wageRatio);

  return {
    playerId: player.id,
    verdict,
    score: Math.round(score * 100) / 100,
    appeal: Math.round(appeal * 100) / 100,
    wageRequested: required,
    playingTime: Math.round(playingTime * 100) / 100,
    message: messageFor(verdict, player, wageRatio, appeal),
  };
}

function messageFor(
  verdict: PlayerDecisionVerdict,
  player: MarketPlayer,
  wageRatio: number,
  appeal: number,
): string {
  switch (verdict) {
    case "accepted":
      return `${player.name} acepta las condiciones y quiere firmar.`;
    case "negotiating":
      return wageRatio < 1
        ? `${player.name} está interesado, pero pide mejorar la ficha.`
        : `${player.name} se lo está pensando.`;
    case "rejected-wage":
      return `${player.name} rechaza la ficha ofrecida: está muy por debajo de lo que pide.`;
    default:
      return appeal < 0.35
        ? `${player.name} no ve atractivo el proyecto deportivo.`
        : `${player.name} prefiere quedarse donde está.`;
  }
}

// ============================================================================
// RENOVACIONES
// ============================================================================

export interface RenewalDecision {
  playerId: string;
  accepted: boolean;
  /** Salario anual pedido para renovar. */
  wageRequested: number;
  /** Años que pide de contrato. */
  yearsRequested: number;
  message: string;
}

/** ¿Aceptaría el jugador renovar con su club actual? */
export function decideOnRenewal(playerId: string, cacheKey: string, offeredWage?: number): RenewalDecision {
  const player = getPlayer(playerId);
  if (!player || !player.clubId) {
    return {
      playerId,
      accepted: false,
      wageRequested: WAGE_RULES.minimumWage,
      yearsRequested: 1,
      message: "El jugador no tiene club con el que renovar.",
    };
  }

  const fair = Math.max(WAGE_RULES.minimumWage, Math.round(player.value * WAGE_RULES.valueToWage));
  const requested = Math.round(
    Math.max(player.contract.wage * CONTRACT_RULES.renewalRaise, fair) *
      (1 + player.personality.greed * 0.15),
  );
  const byAge = CONTRACT_RULES.yearsByAge.find((entry) => player.age <= entry.maxAge);
  const yearsRequested = clamp(byAge ? byAge.years : CONTRACT_RULES.minYears, CONTRACT_RULES.minYears, CONTRACT_RULES.maxYears);

  if (player.age > CONTRACT_RULES.maxRenewalAge && player.ovr < 82) {
    return {
      playerId,
      accepted: false,
      wageRequested: requested,
      yearsRequested: 1,
      message: `${player.name} está en el tramo final de su carrera y no renovará.`,
    };
  }

  const leave = desireToLeave(playerId, cacheKey);
  const wageRatio = offeredWage !== undefined ? offeredWage / requested : 1;
  const happiness = lerp(1 - leave, 1, player.personality.loyalty * 0.5);
  const accepted = wageRatio >= 0.95 && happiness >= 0.45;

  return {
    playerId,
    accepted,
    wageRequested: requested,
    yearsRequested: Math.round(yearsRequested),
    message: accepted
      ? `${player.name} renueva su contrato.`
      : wageRatio < 0.95
        ? `${player.name} pide una ficha mayor para renovar.`
        : `${player.name} quiere buscar un nuevo destino.`,
  };
}

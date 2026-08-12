/**
 * Análisis de plantilla.
 *
 * Determina qué necesita realmente un club: cuántos jugadores tiene por
 * demarcación, la calidad del once y del banquillo, dónde hay huecos, dónde
 * sobra gente y a quién conviene vender o ceder. El motor de fichajes nunca
 * busca un jugador para una posición que no aparezca en `needs`.
 */

import { IDEAL_SQUAD_SHAPE, SQUAD_LIMITS } from "./constants";
import { recentCoreLossOvr, recentCoreSigningOvr } from "./MarketLocks";
import { getClubPlayers, onSquadChanged } from "./PlayerIndex";
import { clamp } from "./random";
import { POSITION_GROUPS, type MarketPlayer, type PositionGroup, type SquadNeed, type SquadReport } from "./types";

function emptyByGroup<T>(value: T): Record<PositionGroup, T> {
  return {
    GK: value,
    CB: value,
    FB: value,
    CM: value,
    WING: value,
    ST: value,
  };
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Prioridad textual derivada de la urgencia numérica. */
function priorityOf(urgency: number): SquadNeed["priority"] {
  if (urgency >= 0.75) return "critical";
  if (urgency >= 0.5) return "high";
  if (urgency >= 0.3) return "medium";
  return "low";
}

/**
 * Urgencia de una demarcación: combina falta de efectivos y falta de calidad
 * respecto a la media del club, y reacciona a una salida de nivel reciente
 * en esa misma demarcación (ver más abajo).
 */
function computeUrgency(
  clubId: string,
  group: PositionGroup,
  players: MarketPlayer[],
  squadRating: number,
  recentLossOvr: number,
): number {
  const shape = IDEAL_SQUAD_SHAPE[group];
  const count = players.length;
  const shortage = count < shape.min ? 1 : count < shape.ideal ? 0.5 : 0;

  const best = players
    .slice()
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, Math.max(1, shape.min - 1));
  const quality = average(best.map((p) => p.ovr));
  const qualityGap = squadRating > 0 ? clamp((squadRating - quality) / 8, 0, 1) : 0;

  const baseUrgency = clamp(shortage * 0.6 + qualityGap * 0.4, 0, 1);
  if (recentLossOvr <= 0) return baseUrgency;

  // Reemplazo reactivo: si el club acaba de perder a un jugador de nivel en
  // esta demarcación (p. ej. su extremo estrella), la urgencia sube aunque
  // el hueco numérico ya lo tape cualquier suplente — en la vida real el
  // club sale a buscar un sustituto de nivel similar, no se conforma con
  // cubrir el cupo. Cuanto mayor la diferencia entre lo perdido y lo que
  // queda, más urgente (y más "crítica") se vuelve la necesidad.
  const dropSeverity = clamp((recentLossOvr - Math.max(quality, squadRating - 8)) / 12, 0, 1);
  const reactiveUrgency = clamp(0.55 + dropSeverity * 0.35, 0.55, 0.95);
  
  // Si el club acaba de fichar un jugador de calidad en esta posición,
  // reducir la urgencia para evitar fichajes duplicados, pero solo si el
  // fichaje es de nivel igual o mejor que la pérdida
  const recentSigning = recentCoreSigningOvr(clubId, group);
  if (recentSigning > 0 && recentSigning >= recentLossOvr) {
    // El fichaje reciente es de nivel igual o mejor que la pérdida
    return Math.max(baseUrgency * 0.3, 0); // Reducir significativamente la urgencia
  }
  
  return Math.max(baseUrgency, reactiveUrgency);
}

/** ¿Debería el club poner a este jugador en la lista de transferibles? */
function isTransferable(player: MarketPlayer, startingRating: number, countInGroup: number): boolean {
  const shape = IDEAL_SQUAD_SHAPE[player.group];
  if (player.contract.yearsLeft <= 0) return true;
  if (player.age >= SQUAD_LIMITS.veteranAge && player.ovr < startingRating - 2) return true;
  if (countInGroup > shape.max) return true;
  return player.ovr < startingRating - SQUAD_LIMITS.benchGapForSale;
}

/** ¿Es un joven al que le conviene una cesión? */
function isLoanable(player: MarketPlayer, startingRating: number): boolean {
  return (
    player.age <= SQUAD_LIMITS.youngAge &&
    player.ovr < startingRating - 2 &&
    player.potential > player.ovr + 2
  );
}

/** Genera el informe completo de una plantilla. */
export function analyzeSquad(clubId: string): SquadReport {
  const squad = getClubPlayers(clubId);
  const sorted = squad.slice().sort((a, b) => b.ovr - a.ovr);
  const starters = sorted.slice(0, 11);
  const bench = sorted.slice(11, 22);
  const startingRating = average(starters.map((p) => p.ovr));
  const benchRating = average(bench.map((p) => p.ovr));

  const countByGroup = emptyByGroup(0);
  const ratingByGroup = emptyByGroup(0);
  const byGroup = new Map<PositionGroup, MarketPlayer[]>();
  for (const group of POSITION_GROUPS) byGroup.set(group, []);
  for (const player of squad) byGroup.get(player.group)?.push(player);

  const needs: SquadNeed[] = [];
  const surplus: PositionGroup[] = [];

  for (const group of POSITION_GROUPS) {
    const players = byGroup.get(group) ?? [];
    countByGroup[group] = players.length;
    ratingByGroup[group] = Math.round(average(players.map((p) => p.ovr)) * 10) / 10;

    const urgency = computeUrgency(clubId, group, players, startingRating, recentCoreLossOvr(clubId, group));
    if (urgency > 0.15) {
      needs.push({
        group,
        urgency,
        count: players.length,
        quality: ratingByGroup[group],
        priority: priorityOf(urgency),
      });
    }
    if (players.length > IDEAL_SQUAD_SHAPE[group].max) surplus.push(group);
  }

  needs.sort((a, b) => b.urgency - a.urgency);

  const transferables: string[] = [];
  const loanables: string[] = [];
  for (const player of squad) {
    if (isLoanable(player, startingRating)) loanables.push(player.id);
    else if (isTransferable(player, startingRating, countByGroup[player.group])) transferables.push(player.id);
  }

  return {
    clubId,
    size: squad.length,
    averageAge: Math.round(average(squad.map((p) => p.age)) * 10) / 10,
    startingRating: Math.round(startingRating * 10) / 10,
    benchRating: Math.round(benchRating * 10) / 10,
    countByGroup,
    ratingByGroup,
    needs,
    surplus,
    transferables,
    loanables,
  };
}

/**
 * ¿Mejora este jugador la plantilla lo suficiente como para ficharlo?
 *
 * `lenient` (por defecto `false`) relaja el margen exigido, hasta permitir
 * fichajes "de nivel similar" (hasta 3 puntos de OVR por debajo del grupo).
 * Lo usa `TransferEngine` cuando un club está obligado a cerrar su cupo
 * mínimo de fichajes de la ventana (`belowMinimum`): sin esta vía, un club
 * con una demarcación ya muy fuerte (un Real Madrid con su ataque titular)
 * nunca encontraba a nadie que "mejorara" esa posición y se quedaba sin
 * fichar NADA en toda la ventana, aunque hubiera media docena de jugadores
 * de nivel top disponibles. En la vida real los grandes clubes también
 * fichan profundidad de plantilla o releva a futuro aunque el titular
 * actual sea mejor.
 */
export function playerImprovesSquad(
  report: SquadReport,
  player: MarketPlayer,
  lenient = false,
): boolean {
  const groupRating = report.ratingByGroup[player.group];
  const margin = lenient ? -3 : SQUAD_LIMITS.improvementMargin;
  const bar = Math.max(groupRating, report.startingRating - 2) + margin;
  if (player.ovr >= bar) return true;
  // Una promesa con recorrido también encaja aunque hoy no sea titular.
  return player.age <= SQUAD_LIMITS.youngAge && player.potential >= report.startingRating + 1;
}

/** ¿Puede el club vender sin quedarse corto de efectivos? */
export function canSell(report: SquadReport, group: PositionGroup): boolean {
  if (report.size <= SQUAD_LIMITS.minSquadSize) return false;
  return report.countByGroup[group] > IDEAL_SQUAD_SHAPE[group].min;
}

/** Informe cacheado por club durante un mismo día de simulación. */
const reportCache = new Map<string, { key: string; report: SquadReport }>();

// Sin esto, un informe calculado a primera hora del día se quedaba
// "congelado" el resto de la jornada: si el club fichaba o vendía a media
// tarde, todo el mundo que consultara su plantilla después seguía viendo el
// tamaño y las necesidades de antes de esa operación. En un mundo con
// cientos de clubes, eso permitía que un mismo club (normalmente el más
// rico, siempre "con hueco" según el caché) recibiera decenas de fichajes
// el mismo día sin que el límite de plantilla lo frenara nunca a mitad de
// jornada.
onSquadChanged((clubIds) => {
  for (const clubId of clubIds) reportCache.delete(clubId);
});

/** Informe con caché por fecha: evita recalcular la misma plantilla mil veces. */
export function getSquadReport(clubId: string, cacheKey: string): SquadReport {
  const cached = reportCache.get(clubId);
  if (cached && cached.key === cacheKey) return cached.report;
  const report = analyzeSquad(clubId);
  reportCache.set(clubId, { key: cacheKey, report });
  return report;
}

/** Vacía la caché de informes. */
export function resetSquadReports(): void {
  reportCache.clear();
}

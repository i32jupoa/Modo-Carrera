/**
 * Motor de rumores.
 *
 * Los rumores NO se inventan: se derivan del interés real registrado en
 * `BidWar`, de las búsquedas que hacen los clubes y de las renovaciones en
 * curso. Su fiabilidad depende de lo avanzada que esté la operación, así que
 * un rumor fuerte suele acabar en fichaje y uno débil casi nunca.
 */

import { teamById } from "@/data/teams";
import { RUMOR_RULES } from "./constants";
import { bidsFor, competitionFor } from "./BidWar";
import { getPlayer } from "./PlayerIndex";
import { getUserClubId } from "./BudgetManager";
import { seededUnit } from "./random";
import type { PositionGroup, Rumor, RumorKind } from "./types";

/** Rumores publicados, del más antiguo al más reciente. */
const rumors: Rumor[] = [];

function clubName(clubId: string): string {
  return teamById(clubId)?.name ?? clubId;
}

function makeId(
  kind: RumorKind,
  clubId: string,
  playerId: string | null,
  date: string,
  stage = "base",
): string {
  return `rumor:${kind}:${stage}:${clubId}:${playerId ?? "-"}:${date}`;
}

/** ¿Ya existe este rumor? Evita repetir la misma noticia cada día. */
function alreadyPublished(id: string): boolean {
  return rumors.some((rumor) => rumor.id === id);
}

/** Rumores ya publicados por un club en una fecha concreta. */
function publishedTodayBy(clubId: string, date: string): number {
  let count = 0;
  for (let i = rumors.length - 1; i >= 0; i -= 1) {
    const rumor = rumors[i]!;
    if (rumor.date !== date) break;
    if (rumor.clubId === clubId) count += 1;
  }
  return count;
}

function publish(rumor: Rumor): Rumor | null {
  if (alreadyPublished(rumor.id)) return null;

  // El mercado de la IA no puede generar ni "resolver" noticias que
  // involucren al club del usuario. Esas operaciones las gestiona él y el
  // feed automático no debe adelantarse a ninguna de sus decisiones.
  const userClubId = getUserClubId();
  if (userClubId && (rumor.clubId === userClubId || rumor.targetClubId === userClubId)) return null;

  // Un mismo club puede protagonizar varias historias reales en un día. El
  // límite es alto a propósito: queremos un ecosistema de rumores claramente
  // más amplio que el de fichajes, sin permitir que un solo equipo monopolice
  // el feed.
  if (publishedTodayBy(rumor.clubId, rumor.date) >= RUMOR_RULES.maxPerClubPerDay) return null;
  rumors.push(rumor);
  if (rumors.length > RUMOR_RULES.maxStored)
    rumors.splice(0, rumors.length - RUMOR_RULES.maxStored);
  return rumor;
}

// ============================================================================
// GENERADORES
// ============================================================================

export type InterestRumorStage = "exploratory" | "advanced" | "agreed";

/**
 * Rumor derivado de una persecución real del motor de fichajes.
 *
 * Una misma operación puede pasar por tres noticias distintas: tanteo inicial,
 * negociación avanzada y principio de acuerdo. Los objetos anteriores se
 * conservan; la confirmación final se publica como una noticia nueva.
 */
export function rumorInterest(
  clubId: string,
  playerId: string,
  date: string,
  stage: InterestRumorStage = "advanced",
): Rumor | null {
  const player = getPlayer(playerId);
  const userClubId = getUserClubId();
  if (!player || !player.clubId || player.clubId === clubId) return null;
  if (userClubId && (player.clubId === userClubId || clubId === userClubId)) return null;

  const publishChance =
    stage === "exploratory"
      ? RUMOR_RULES.exploratoryInterestPublishChance
      : RUMOR_RULES.strongInterestPublishChance;
  if (seededUnit(clubId, playerId, date, `rumor-${stage}`) > publishChance) return null;

  const rivals = competitionFor(playerId, clubId);
  const reliability =
    stage === "exploratory"
      ? Math.min(0.84, 0.62 + rivals * 0.04)
      : stage === "agreed"
        ? Math.min(0.995, 0.94 + rivals * 0.02)
        : Math.min(0.97, 0.86 + rivals * 0.035);

  const text =
    stage === "exploratory"
      ? `El ${clubName(clubId)} ha sondeado al ${clubName(player.clubId)} por ${player.name}. Empiezan los contactos y la operación está en una fase inicial.`
      : stage === "agreed"
        ? `Las negociaciones entre el ${clubName(clubId)} y el ${clubName(player.clubId)} por ${player.name} están muy avanzadas. El acuerdo se acerca.`
        : `El ${clubName(clubId)} y el ${clubName(player.clubId)} negocian el fichaje de ${player.name}. Las conversaciones están avanzadas.`;

  return publish({
    id: makeId("interest", clubId, playerId, date, stage),
    date,
    kind: "interest",
    clubId,
    playerId,
    targetClubId: player.clubId,
    text,
    reliability,
  });
}

/** Actualización diaria de una puja que sigue viva. */
export function rumorActiveBid(
  clubId: string,
  playerId: string,
  date: string,
): Rumor | null {
  const player = getPlayer(playerId);
  const userClubId = getUserClubId();
  if (!player || !player.clubId || !playerId) return null;
  if (userClubId && (player.clubId === userClubId || clubId === userClubId)) return null;
  if (seededUnit(clubId, playerId, date, "active-rumor") > RUMOR_RULES.activeInterestPublishChance) return null;

  const rivals = competitionFor(playerId, clubId);
  return publish({
    id: makeId("interest", clubId, playerId, date, "active"),
    date,
    kind: "interest",
    clubId,
    playerId,
    targetClubId: player.clubId,
    text:
      rivals > 0
        ? `El ${clubName(clubId)} mantiene abiertas las negociaciones por ${player.name}. Otros clubes también siguen pendientes.`
        : `El ${clubName(clubId)} sigue negociando con el ${clubName(player.clubId)} por ${player.name}.`,
    reliability: Math.min(0.94, 0.78 + rivals * 0.04),
  });
}

/** Rumor de guerra de ofertas cuando hay dos o más clubes detrás. */
export function rumorBidWar(playerId: string, date: string): Rumor | null {
  const bids = bidsFor(playerId);
  const userClubId = getUserClubId();
  // Si el usuario está en la puja, esa negociación es suya y no se convierte
  // en rumor automático del mercado de la IA.
  if (userClubId && bids.some((bid) => bid.clubId === userClubId)) return null;
  if (bids.length < 2) return null;
  if (seededUnit(playerId, date, "bid-war-rumor") > RUMOR_RULES.bidWarPublishChance) return null;
  const player = getPlayer(playerId);
  if (!player || !player.clubId) return null;

  const names = bids
    .slice(0, 3)
    .map((bid) => clubName(bid.clubId))
    .join(", ");
  return publish({
    id: makeId("bid-war", bids[0]!.clubId, playerId, date),
    date,
    kind: "bid-war",
    clubId: bids[0]!.clubId,
    playerId,
    targetClubId: player.clubId,
    text: `Subasta por ${player.name}: ${names} se disputan su fichaje.`,
    reliability: Math.min(0.97, 0.84 + bids.length * 0.04),
  });
}

/** Rumor de jugador que quiere salir de su club. */
export function rumorWantsOut(playerId: string, date: string): Rumor | null {
  const player = getPlayer(playerId);
  if (!player || !player.clubId) return null;
  return publish({
    id: makeId("wants-out", player.clubId, playerId, date),
    date,
    kind: "wants-out",
    clubId: player.clubId,
    playerId,
    text: `${player.name} pide salir del ${clubName(player.clubId)} y busca un nuevo destino.`,
    reliability: 0.7,
  });
}

/** Rumor de club buscando refuerzos en una demarcación concreta. */
export function rumorSearching(clubId: string, group: PositionGroup, date: string): Rumor | null {
  if (seededUnit(clubId, group, date, "search-rumor") > RUMOR_RULES.publishChance) return null;
  return publish({
    id: makeId("searching", clubId, group, date),
    date,
    kind: "searching",
    clubId,
    playerId: null,
    targetClubId: null,
    text: `El ${clubName(clubId)} busca refuerzos para la demarcación de ${GROUP_LABEL[group]}.`,
    reliability: 0.55,
  });
}

/** Rumor de renovación en marcha o cerrada. */
export function rumorRenewal(
  clubId: string,
  playerId: string,
  agreed: boolean,
  date: string,
): Rumor | null {
  const player = getPlayer(playerId);
  if (!player) return null;
  return publish({
    id: makeId("renewal", clubId, playerId, date),
    date,
    kind: "renewal",
    clubId,
    playerId,
    targetClubId: clubId,
    text: agreed
      ? `${player.name} renueva con el ${clubName(clubId)}.`
      : `El ${clubName(clubId)} negocia la renovación de ${player.name}, sin acuerdo por ahora.`,
    reliability: agreed ? 1 : 0.6,
  });
}

const GROUP_LABEL: Record<PositionGroup, string> = {
  GK: "portería",
  CB: "central",
  FB: "lateral",
  CM: "centro del campo",
  WING: "extremo",
  ST: "delantero centro",
};

/** Publica la confirmación de un fichaje cerrado por la IA. */
export function rumorConfirmedTransfer(
  clubId: string,
  playerId: string,
  sellerClubId: string | null,
  date: string,
): Rumor | null {
  const player = getPlayer(playerId);
  const userClubId = getUserClubId();
  if (!player || !sellerClubId) return null;
  if (userClubId && (clubId === userClubId || sellerClubId === userClubId)) return null;

  return publish({
    id: makeId("interest", clubId, playerId, date, "confirmed"),
    date,
    kind: "interest",
    clubId,
    playerId,
    targetClubId: sellerClubId,
    text: `Se confirma el fichaje de ${player.name}: el ${clubName(clubId)} llega a un acuerdo con el ${clubName(sellerClubId)}.`,
    reliability: 1,
  });
}

/**
 * Crea una confirmación nueva sin borrar el rumor anterior.
 * Así el historial conserva la secuencia "tanteo → negociación → fichaje".
 */
export function confirmRumorForTransfer(
  clubId: string,
  playerId: string,
  sellerClubId: string | null,
  date: string,
): Rumor | null {
  return rumorConfirmedTransfer(clubId, playerId, sellerClubId, date);
}

// ============================================================================
// CONSULTA
// ============================================================================

/** Rumores más recientes primero. */
export function listRumors(limit = 30): Rumor[] {
  return [...rumors].reverse().slice(0, limit);
}

/** Rumores de un club. */
export function rumorsForClub(clubId: string, limit = 20): Rumor[] {
  return [...rumors]
    .reverse()
    .filter((rumor) => rumor.clubId === clubId)
    .slice(0, limit);
}

/** Rumores sobre un jugador. */
export function rumorsForPlayer(playerId: string, limit = 10): Rumor[] {
  return [...rumors]
    .reverse()
    .filter((rumor) => rumor.playerId === playerId)
    .slice(0, limit);
}

/** Rumores publicados en los últimos días definidos en `RUMOR_RULES`. */
export function freshRumors(date: string, limit = 20): Rumor[] {
  const now = Date.parse(date);
  const window = RUMOR_RULES.freshnessDays * 86_400_000;
  return [...rumors]
    .reverse()
    .filter((rumor) => Number.isNaN(now) || now - Date.parse(rumor.date) <= window)
    .slice(0, limit);
}

/**
 * Rumores publicados desde una fecha (incluida), de más reciente a más
 * antiguo. Se usa para ver la ventana de mercado completa de un club.
 */
export function rumorsSince(since: string, limit = 1000): Rumor[] {
  return [...rumors]
    .reverse()
    .filter((rumor) => rumor.date >= since)
    .slice(0, limit);
}

/** Vacía los rumores (al cargar otra partida). */
export function resetRumors(): void {
  rumors.length = 0;
}

/** Rumores serializables para guardar con la partida. */
export function snapshotRumors(): Rumor[] {
  return [...rumors];
}

/** Restaura los rumores desde una partida guardada. */
export function restoreRumors(saved: readonly Rumor[]): void {
  rumors.length = 0;
  rumors.push(...saved.slice(-RUMOR_RULES.maxStored));
}

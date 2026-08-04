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
import { seededUnit } from "./random";
import type { PositionGroup, Rumor, RumorKind } from "./types";

/** Rumores publicados, del más antiguo al más reciente. */
const rumors: Rumor[] = [];

function clubName(clubId: string): string {
  return teamById(clubId)?.name ?? clubId;
}

function makeId(kind: RumorKind, clubId: string, playerId: string | null, date: string): string {
  return `rumor:${kind}:${clubId}:${playerId ?? "-"}:${date}`;
}

/** ¿Ya existe este rumor? Evita repetir la misma noticia cada día. */
function alreadyPublished(id: string): boolean {
  return rumors.some((rumor) => rumor.id === id);
}

function publish(rumor: Rumor): Rumor | null {
  if (alreadyPublished(rumor.id)) return null;
  rumors.push(rumor);
  if (rumors.length > RUMOR_RULES.maxStored) rumors.splice(0, rumors.length - RUMOR_RULES.maxStored);
  return rumor;
}

// ============================================================================
// GENERADORES
// ============================================================================

/**
 * Rumor de interés de un club por un jugador. Sólo se publica parte de las
 * veces: la prensa no se entera de todo.
 */
export function rumorInterest(clubId: string, playerId: string, date: string): Rumor | null {
  const player = getPlayer(playerId);
  if (!player) return null;
  if (seededUnit(clubId, playerId, date, "rumor") > RUMOR_RULES.publishChance) return null;

  const rivals = competitionFor(playerId, clubId);
  const reliability = Math.min(0.9, 0.35 + rivals * 0.12);
  return publish({
    id: makeId("interest", clubId, playerId, date),
    date,
    kind: "interest",
    clubId,
    playerId,
    text: `El ${clubName(clubId)} sigue de cerca a ${player.name} (${player.position}, ${player.age} años).`,
    reliability,
  });
}

/** Rumor de guerra de ofertas cuando hay dos o más clubes detrás. */
export function rumorBidWar(playerId: string, date: string): Rumor | null {
  const bids = bidsFor(playerId);
  if (bids.length < 2) return null;
  const player = getPlayer(playerId);
  if (!player) return null;

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
    text: `Subasta por ${player.name}: ${names} se disputan su fichaje.`,
    reliability: Math.min(0.95, 0.5 + bids.length * 0.15),
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
    text: `El ${clubName(clubId)} busca refuerzos para la demarcación de ${GROUP_LABEL[group]}.`,
    reliability: 0.55,
  });
}

/** Rumor de renovación en marcha o cerrada. */
export function rumorRenewal(clubId: string, playerId: string, agreed: boolean, date: string): Rumor | null {
  const player = getPlayer(playerId);
  if (!player) return null;
  return publish({
    id: makeId("renewal", clubId, playerId, date),
    date,
    kind: "renewal",
    clubId,
    playerId,
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

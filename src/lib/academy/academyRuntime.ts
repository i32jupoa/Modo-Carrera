import type { FcPlayer } from "@/store/playersStore";
import type { MarketPlayer } from "@/lib/transfers/types";
import type { AcademyPromotionEvent } from "./academyTypes";

/** Registro en memoria de jugadores creados dinámicamente. No contiene lógica de persistencia. */
export const DYNAMIC_BY_ID = new Map<string, FcPlayer>();
export const DYNAMIC_MARKET_BY_ID = new Map<string, MarketPlayer>();
export const CALLED_UP_BY_TEAM = new Map<string, FcPlayer[]>();

/** Hechos pequeños y estructurados que alimentan Noticias y el Buzón. */
let PROMOTION_EVENTS: AcademyPromotionEvent[] = [];

export function recordAcademyPromotionEvent(event: AcademyPromotionEvent): void {
  PROMOTION_EVENTS = [event, ...PROMOTION_EVENTS.filter((candidate) => candidate.id !== event.id)].slice(0, 80);
}

export function getAcademyPromotionEvents(): AcademyPromotionEvent[] {
  return PROMOTION_EVENTS.slice();
}

export function hydrateAcademyPromotionEvents(events: readonly AcademyPromotionEvent[] | undefined): void {
  PROMOTION_EVENTS = Array.isArray(events) ? events.slice(0, 80) : [];
}

export function getDynamicMarketPlayers(): MarketPlayer[] {
  return Array.from(DYNAMIC_MARKET_BY_ID.values());
}

export function setCalledUpPlayer(teamId: string, player: FcPlayer): void {
  const current = CALLED_UP_BY_TEAM.get(teamId) ?? [];
  if (!current.some((candidate) => candidate.ID === player.ID)) CALLED_UP_BY_TEAM.set(teamId, [...current, player]);
}

export function getCalledUpPlayers(teamId: string): FcPlayer[] {
  return (CALLED_UP_BY_TEAM.get(teamId) ?? []).slice();
}

export function clearCalledUpPlayer(teamId: string, playerId: string): void {
  const next = (CALLED_UP_BY_TEAM.get(teamId) ?? []).filter((player) => String(player.ID) !== String(playerId));
  if (next.length) CALLED_UP_BY_TEAM.set(teamId, next);
  else CALLED_UP_BY_TEAM.delete(teamId);
}

export function hydrateDynamicMarketPlayers(players: readonly MarketPlayer[] | undefined): void {
  DYNAMIC_MARKET_BY_ID.clear();
  for (const player of players ?? []) DYNAMIC_MARKET_BY_ID.set(String(player.id), player);
}

export function clearAcademyRuntime(): void {
  DYNAMIC_BY_ID.clear();
  DYNAMIC_MARKET_BY_ID.clear();
  CALLED_UP_BY_TEAM.clear();
  PROMOTION_EVENTS = [];
}

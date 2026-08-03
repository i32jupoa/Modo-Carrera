/**
 * Guerra de ofertas.
 *
 * Registra el interés real de cada club por cada jugador para que:
 *  - la valoración suba cuando hay competencia (`competitionFor`),
 *  - el club vendedor pueda esperar mejores ofertas antes de aceptar,
 *  - y el jugador elija destino cuando varias ofertas son válidas.
 *
 * Es la única fuente de verdad sobre "quién va detrás de quién", y de ella se
 * alimentarán después los rumores.
 */

import { getClubProfile } from "./ClubStrategy";
import { decideOnMove } from "./PlayerDecision";
import { clamp } from "./random";

/** Puja concreta de un club por un jugador. */
export interface Bid {
  clubId: string;
  playerId: string;
  /** Importe fijo ofrecido en euros. */
  amount: number;
  /** Salario anual ofrecido al jugador. */
  wageOffer: number;
  /** Fecha ISO de la última actualización de la puja. */
  date: string;
}

/** Resultado de resolver una guerra de ofertas. */
export interface BidWarOutcome {
  playerId: string;
  /** Club ganador, o null si ninguna oferta convence al jugador. */
  winnerClubId: string | null;
  /** Pujas ordenadas de mejor a peor a ojos del jugador. */
  ranking: Array<{ clubId: string; amount: number; score: number }>;
  message: string;
}

/** playerId -> clubId -> puja. */
const interest = new Map<string, Map<string, Bid>>();

/** Registra o actualiza el interés de un club por un jugador. */
export function registerInterest(bid: Bid): void {
  let byClub = interest.get(bid.playerId);
  if (!byClub) {
    byClub = new Map();
    interest.set(bid.playerId, byClub);
  }
  const previous = byClub.get(bid.clubId);
  byClub.set(bid.clubId, {
    ...bid,
    amount: Math.max(bid.amount, previous?.amount ?? 0),
  });
}

/** Retira el interés de un club. */
export function dropInterest(playerId: string, clubId: string): void {
  const byClub = interest.get(playerId);
  if (!byClub) return;
  byClub.delete(clubId);
  if (byClub.size === 0) interest.delete(playerId);
}

/** Elimina todo el interés por un jugador (traspaso cerrado). */
export function clearInterest(playerId: string): void {
  interest.delete(playerId);
}

/** Pujas vivas por un jugador. */
export function bidsFor(playerId: string): Bid[] {
  return Array.from(interest.get(playerId)?.values() ?? []);
}

/** Número de clubes que compiten por el jugador, sin contar al indicado. */
export function competitionFor(playerId: string, excludeClubId?: string): number {
  const byClub = interest.get(playerId);
  if (!byClub) return 0;
  if (!excludeClubId) return byClub.size;
  return byClub.has(excludeClubId) ? byClub.size - 1 : byClub.size;
}

/** Mejor puja fija registrada por un jugador. */
export function bestBid(playerId: string): Bid | null {
  return bidsFor(playerId).reduce<Bid | null>(
    (best, bid) => (!best || bid.amount > best.amount ? bid : best),
    null,
  );
}

/**
 * Precio al que un club debe elevar su puja para seguir en la carrera.
 * Los clubes agresivos rebasan con holgura; los pacientes apenas igualan.
 */
export function escalatedPrice(playerId: string, clubId: string, floor: number): number {
  const profile = getClubProfile(clubId);
  const rival = bestBid(playerId);
  const base = Math.max(floor, rival && rival.clubId !== clubId ? rival.amount : floor);
  const overbid = 1 + clamp(0.02 + profile.aggression * 0.12 - profile.patience * 0.04, 0.01, 0.15);
  return Math.round((base * overbid) / 100_000) * 100_000;
}

/**
 * ¿Le conviene al vendedor esperar?
 * Con varios interesados y sin urgencia por hacer caja, el club deja correr
 * unos días para que suba el precio.
 */
export function sellerShouldWait(
  playerId: string,
  sellerClubId: string,
  offerAmount: number,
  expectedPrice: number,
  urgent: boolean,
): boolean {
  if (urgent) return false;
  if (offerAmount >= expectedPrice) return false;
  const rivals = competitionFor(playerId);
  if (rivals < 2) return false;
  return getClubProfile(sellerClubId).patience > 0.45;
}

/**
 * Resuelve la subasta: el jugador elige entre las ofertas registradas
 * combinando lo que le convence el proyecto y lo fuerte que es la puja.
 */
export function resolveBidWar(playerId: string, cacheKey: string): BidWarOutcome {
  const bids = bidsFor(playerId);
  if (bids.length === 0) {
    return { playerId, winnerClubId: null, ranking: [], message: "Nadie ha pujado." };
  }

  const maxAmount = bids.reduce((max, bid) => Math.max(max, bid.amount), 1);
  const ranking = bids
    .map((bid) => {
      const decision = decideOnMove({
        playerId,
        toClubId: bid.clubId,
        wageOffer: bid.wageOffer,
        cacheKey,
      });
      const feeStrength = bid.amount / maxAmount;
      const viable = decision.verdict === "accepted" || decision.verdict === "negotiating";
      const score = viable ? decision.score * 0.75 + feeStrength * 0.25 : 0;
      return { clubId: bid.clubId, amount: bid.amount, score: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score || b.amount - a.amount);

  const winner = ranking[0] && ranking[0].score > 0 ? ranking[0].clubId : null;
  return {
    playerId,
    winnerClubId: winner,
    ranking,
    message: winner
      ? `El jugador elige su destino entre ${bids.length} ofertas.`
      : "El jugador no acepta ninguna de las ofertas recibidas.",
  };
}

/** Reinicia el registro de intereses (al cargar otra partida). */
export function resetBidWars(): void {
  interest.clear();
}

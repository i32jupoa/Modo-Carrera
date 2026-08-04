/**
 * Puente entre el motor de mercado y el mundo real de la partida.
 *
 * Antes existían dos mundos paralelos: el índice del mercado (construido desde
 * el JSON de jugadores) y el estado del juego (`playersStore`). Los traspasos
 * de la IA no se veían en ninguna plantilla y los del usuario no existían para
 * el motor. Este módulo los une:
 *
 * - `hydrateWorld()` copia el estado real (plantilla del usuario y traspasos ya
 *   aplicados) sobre el índice recién construido.
 * - `attachWorldBridge()` hace que cada movimiento permanente del índice se
 *   publique en el store, de modo que toda la aplicación vea la plantilla real.
 *
 * Los movimientos se acumulan en un buffer y se vuelcan al store en un solo
 * `set`, para no provocar un render por fichaje durante la simulación diaria.
 */

import { usePlayersStore } from "@/store/playersStore";
import { getMarketIndex, getPlayer, reassignPlayerClub, setClubMoveListener } from "./PlayerIndex";
import { teamById } from "@/data/teams";

/** Movimiento pendiente de volcar al store. */
interface PendingMove {
  playerId: string;
  toClubId: string | null;
}

const pending = new Map<string, PendingMove>();
let attached = false;

/** Encola un movimiento del índice para publicarlo en el store. */
function queueMove(playerId: string, toClubId: string | null): void {
  pending.set(playerId, { playerId, toClubId });
}

/** Vuelca al store todos los movimientos acumulados. */
export function flushWorldMoves(): void {
  if (pending.size === 0) return;
  const moves = Array.from(pending.values());
  pending.clear();
  usePlayersStore.getState().applyMarketMoves(moves);
}

/**
 * Conecta el índice con el store. Idempotente: llamarlo varias veces no
 * duplica la suscripción.
 */
export function attachWorldBridge(): void {
  if (attached) return;
  attached = true;
  setClubMoveListener(queueMove);
}

/** Desconecta el puente (cambio de partida). */
export function detachWorldBridge(): void {
  attached = false;
  pending.clear();
  setClubMoveListener(null);
}

/**
 * Alinea el índice del mercado con el estado real de la partida.
 *
 * 1. Aplica los traspasos ya registrados en el store (`clubOverrides`).
 * 2. Fuerza que la plantilla del usuario en el índice sea exactamente su
 *    `rosterIds`: lo que él ha fichado es suyo y lo que ha vendido ya no está.
 */
export function hydrateWorld(): void {
  const state = usePlayersStore.getState();
  const index = getMarketIndex();

  // 1) Traspasos ya conocidos por la partida.
  for (const [playerId, clubId] of Object.entries(state.clubOverrides ?? {})) {
    const player = index.byId.get(playerId);
    if (!player) continue;
    const target = clubId === "" ? null : clubId;
    if (player.clubId === target) continue;
    reassignPlayerClub(playerId, target, target ? teamById(target).league : "free");
  }

  // 2) La plantilla del usuario manda sobre cualquier otra fuente.
  const myTeamId = state.myTeamId;
  if (!myTeamId) return;
  const roster = new Set(state.rosterIds);
  const league = teamById(myTeamId).league;

  for (const playerId of roster) {
    const player = getPlayer(playerId);
    if (player && player.clubId !== myTeamId) {
      reassignPlayerClub(playerId, myTeamId, league);
    }
  }

  for (const player of index.byClub.get(myTeamId)
    ? Array.from(index.byClub.get(myTeamId)!)
    : []) {
    if (roster.has(player)) continue;
    // Estaba en tu equipo según los datos base pero ya no está en tu plantilla:
    // lo vendiste antes de que existiera el mercado, queda sin club.
    reassignPlayerClub(player, null, "free");
  }

  // La hidratación no debe reescribir el store con lo que acaba de leer.
  pending.clear();
}

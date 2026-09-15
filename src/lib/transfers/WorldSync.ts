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

import { syncSquadFromRoster, usePlayersStore } from "@/store/playersStore";
import { getClubWageBill, getMarketIndex, getPlayer, reassignPlayerClub, setClubMoveListener } from "./PlayerIndex";
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
export function syncUserLoanRoster(): void {
  const store = usePlayersStore.getState();
  const myTeamId = store.myTeamId;
  if (!myTeamId) return;

  const active = new Map<string, { fromClubId: string; endDate: string }>();
  for (const player of getMarketIndex().byId.values()) {
    if (player.loanClubId !== myTeamId || !player.loanOwnerClubId) continue;
    active.set(player.id, {
      fromClubId: player.loanOwnerClubId,
      endDate: player.loanEndDate ?? '',
    });
  }

  const currentRoster = new Set(store.rosterIds);
  const nextRoster = new Set(store.rosterIds);

  // Una plantilla debe representar siempre dónde juega el futbolista HOY.
  // Por tanto, cualquier jugador cuyo club efectivo ya no sea el usuario debe
  // salir de `rosterIds`. Esto cubre especialmente las cesiones salientes:
  // antes el motor movía al jugador al destino, pero el roster del usuario
  // conservaba su id y acababa mostrándolo en ambos clubes.
  for (const playerId of [...nextRoster]) {
    const marketPlayer = getPlayer(playerId);
    if (marketPlayer && marketPlayer.clubId !== myTeamId) {
      nextRoster.delete(playerId);
    }
  }

  // Las cesiones entrantes sí son parte de la plantilla del club usuario.
  for (const playerId of active.keys()) nextRoster.add(playerId);

  // Compatibilidad con partidas antiguas que aún tenían registrada una cesión
  // saliente pero mantenían el jugador en el roster.
  for (const [playerId, loan] of Object.entries(store.loanedPlayers ?? {})) {
    if (loan.fromClubId === myTeamId) nextRoster.delete(playerId);
  }

  const changedRoster = currentRoster.size !== nextRoster.size || [...currentRoster].some((id) => !nextRoster.has(id));
  const loanKeys = Object.keys(store.loanedPlayers ?? {});
  const changedLoans = loanKeys.length !== active.size || loanKeys.some((id) => {
    const a = store.loanedPlayers[id];
    const b = active.get(id);
    return !b || a.fromClubId !== b.fromClubId || a.endDate !== b.endDate;
  });

  if (changedRoster || changedLoans) {
    const nextRosterIds = [...nextRoster];
    const nextWageBill = getClubWageBill(myTeamId);
    const currentWageBudget = usePlayersStore.getState().wageBudget || 0;
    // La plantilla visible debe derivarse del roster QUE ESTAMOS ESCRIBIENDO.
    // Leerla del store antes del `setState` devolvía la plantilla anterior
    // (el store todavía tenía los `rosterIds` viejos), así que un jugador
    // vendido o cedido seguía apareciendo hasta que algo más forzaba un
    // recálculo. Ese era el origen de "lo cedo y sigue en mi plantilla".
    usePlayersStore.setState({
      rosterIds: nextRosterIds,
      loanedPlayers: Object.fromEntries(active),
      squad: syncSquadFromRoster(nextRosterIds),
      wageBill: nextWageBill,
      wageBudget: Math.max(currentWageBudget, nextWageBill),
    });
  }
}


export function flushWorldMoves(): void {
  if (pending.size > 0) {
    const moves = Array.from(pending.values());
    pending.clear();
    usePlayersStore.getState().applyMarketMoves(moves);
  }
  syncUserLoanRoster();
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
    reassignPlayerClub(playerId, target, target ? teamById(target).league : "free", {
      force: true,
    });
  }

  // 2) La plantilla del usuario manda sobre cualquier otra fuente.
  const myTeamId = state.myTeamId;
  if (!myTeamId) return;
  const roster = new Set(state.rosterIds);
  const league = teamById(myTeamId).league;

  for (const playerId of roster) {
    const loan = state.loanedPlayers[playerId];
    if (loan?.fromClubId !== myTeamId) continue;
    const player = getPlayer(playerId);
    if (player && player.clubId !== myTeamId) {
      reassignPlayerClub(playerId, myTeamId, league, { force: true });
    }
  }
  // Nota: los jugadores que el índice sitúa en tu club pero no aparecen en tu
  // plantilla NO se liberan. Antes se les dejaba sin club y la IA los fichaba
  // como agentes libres (el caso de Rodrygo al Aston Villa): cualquier hueco
  // entre `rosterIds` y el índice se resolvía sacando gente de tu equipo.

  syncUserLoanRoster();

  // La hidratación no debe reescribir el store con lo que acaba de leer.
  pending.clear();
}

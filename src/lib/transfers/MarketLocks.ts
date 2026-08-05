/**
 * Cerrojos de mercado.
 *
 * Un jugador que ya ha cambiado de club en la ventana en curso queda
 * "asentado": acaba de firmar un contrato y no vuelve a moverse hasta la
 * siguiente ventana. Sin esto, el mismo jugador podía aparecer en tres
 * traspasos distintos antes de que empezara la temporada.
 *
 * Además se lleva la cuenta de llegadas por club dentro de la ventana, para
 * que el mercado no concentre todas las operaciones en los mismos dos o tres
 * equipos (el caso típico: todas las cesiones acababan en el mismo club).
 *
 * El módulo no depende de ningún otro del motor, así que puede usarse desde
 * cualquier punto sin crear ciclos de importación.
 */

/** Ventana activa (`temporada:ventana`). Vacío = mercado sin inicializar. */
let activeWindowKey = "";

/** playerId -> ventana en la que se movió. */
const settled = new Map<string, string>();

/** clubId -> nº de jugadores que han llegado en la ventana activa. */
const arrivals = new Map<string, number>();

/** Fija la ventana activa. Al cambiar de ventana se liberan los cerrojos. */
export function setLockWindow(key: string): void {
  if (key === activeWindowKey) return;
  activeWindowKey = key;
  settled.clear();
  arrivals.clear();
}

/** Ventana activa para los cerrojos. */
export function currentLockWindow(): string {
  return activeWindowKey;
}

/** Marca a un jugador como recién fichado: no se moverá más esta ventana. */
export function lockPlayer(playerId: string): void {
  if (!activeWindowKey) return;
  settled.set(playerId, activeWindowKey);
}

/** ¿El jugador ya ha cambiado de club en esta ventana? */
export function isPlayerSettled(playerId: string): boolean {
  if (!activeWindowKey) return false;
  return settled.get(playerId) === activeWindowKey;
}

/** Registra una llegada a un club en la ventana activa. */
export function registerArrival(clubId: string): void {
  if (!clubId) return;
  arrivals.set(clubId, (arrivals.get(clubId) ?? 0) + 1);
}

/** Llegadas de un club en la ventana activa. */
export function arrivalsFor(clubId: string): number {
  return arrivals.get(clubId) ?? 0;
}

/** Limpia todos los cerrojos (cambio de partida). */
export function resetMarketLocks(): void {
  activeWindowKey = "";
  settled.clear();
  arrivals.clear();
}

/**
 * Reconstruye los cerrojos a partir del historial guardado: todo traspaso
 * cerrado dentro de la ventana activa vuelve a bloquear a su jugador.
 */
export function rebuildLocks(
  records: readonly { playerId: string; toClubId: string; date: string }[],
  windowKeyOf: (date: string) => string,
): void {
  settled.clear();
  arrivals.clear();
  if (!activeWindowKey) return;
  for (const record of records) {
    if (windowKeyOf(record.date) !== activeWindowKey) continue;
    settled.set(record.playerId, activeWindowKey);
    if (record.toClubId) arrivals.set(record.toClubId, (arrivals.get(record.toClubId) ?? 0) + 1);
  }
}

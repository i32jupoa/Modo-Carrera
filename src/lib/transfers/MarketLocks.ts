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

/** clubId -> nº de jugadores que se han marchado en la ventana activa. */
const departures = new Map<string, number>();

/**
 * clubId -> nº de salidas "de nivel" (jugadores que de verdad eran titulares
 * o casi, no descartes de plantilla) en la ventana activa.
 *
 * Sin este contador, nada impedía que un club perdiera a media alineación
 * titular en la misma ventana: cada venta se evaluaba de forma aislada
 * (¿el comprador puede pagar? ¿el jugador dice que sí?) sin memoria de
 * cuántos titulares ya se habían ido esa misma ventana. Un club de la IA
 * podía acabar vendiendo a sus dos porteros titulares y a media defensa en
 * dos semanas — nada realista.
 */
const coreDepartures = new Map<string, number>();

/**
 * `clubId:group` -> mejor OVR (y nombre) de una salida "de nivel" reciente en
 * esa demarcación dentro de la ventana activa.
 *
 * Con esto un club que pierde a un jugador top puede reaccionar buscando de verdad un reemplazo de nivel similar (ver `SquadAnalyzer.computeUrgency`), en vez de limitarse a rellenar el hueco numérico con cualquiera. Se guarda aquí (no en `SquadAnalyzer` ni en `TransferEngine`) para evitar un ciclo de imports: este módulo no depende de ningún otro, así que tanto el análisis de plantilla como el motor de fichajes pueden leerlo sin problema.
 */
const lastCoreLoss = new Map<string, { ovr: number; playerName: string }>();

/**
 * `clubId:group` -> mejor OVR (y nombre) de un fichaje "de nivel" reciente en esa demarcación dentro de la ventana activa.
 *
 * Con esto un club que acaba de fichar un jugador de calidad en una posición puede evitar fichajes duplicados en la misma posición (ver `SquadAnalyzer.computeUrgency`).
 */
const lastCoreSigning = new Map<string, { ovr: number; playerName: string }>();

function coreLossKey(clubId: string, group: string): string {
  return `${clubId}:${group}`;
}

/**
 * Salidas aprobadas explícitamente por el usuario.
 *
 * Ningún jugador del club del usuario puede cambiar de equipo si no es dentro
 * de una operación que él haya cerrado. `UserNegotiation` abre esta ventana
 * justo antes de ejecutar el acuerdo y la cierra al terminar.
 */
let userApprovedDepth = 0;

/** Ejecuta `fn` marcando la operación como aprobada por el usuario. */
export function withUserApproval<T>(fn: () => T): T {
  userApprovedDepth += 1;
  try {
    return fn();
  } finally {
    userApprovedDepth -= 1;
  }
}

/** ¿Estamos dentro de una operación aprobada por el usuario? */
export function isUserApprovedMove(): boolean {
  return userApprovedDepth > 0;
}

/**
 * Club protegido: el del usuario. Nadie entra ni sale de esa plantilla si no
 * es dentro de una operación que él haya cerrado. Se guarda aquí (y no sólo
 * en el puente de presupuesto) porque este módulo no depende de ningún otro
 * y sobrevive a los desmontajes de React.
 */
let protectedClubId: string | null = null;

/** Fija el club del usuario protegido frente a la simulación. */
export function setProtectedClubId(clubId: string | null): void {
  if (clubId) protectedClubId = clubId;
}

/** Club del usuario protegido, si se conoce. */
export function getProtectedClubId(): string | null {
  return protectedClubId;
}

/**
 * ¿Este movimiento toca la plantilla del usuario sin su aprobación?
 * Cubre tanto salidas (venta, cesión, fin de contrato) como entradas.
 */
export function isBlockedUserMove(fromClubId: string | null, toClubId: string | null): boolean {
  if (!protectedClubId) return false;
  if (isUserApprovedMove()) return false;
  const touchesUser = fromClubId === protectedClubId || toClubId === protectedClubId;
  return touchesUser && fromClubId !== toClubId;
}

/** Fija la ventana activa. Al cambiar de ventana se liberan los cerrojos. */
export function setLockWindow(key: string): void {
  if (key === activeWindowKey) return;
  activeWindowKey = key;
  settled.clear();
  arrivals.clear();
  departures.clear();
  coreDepartures.clear();
  lastCoreLoss.clear();
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

/** Registra una salida de un club en la ventana activa. */
export function registerDeparture(clubId: string | null): void {
  if (!clubId) return;
  departures.set(clubId, (departures.get(clubId) ?? 0) + 1);
}

/** Salidas de un club en la ventana activa. */
export function departuresFor(clubId: string): number {
  return departures.get(clubId) ?? 0;
}

/**
 * Registra una salida "de nivel" (titular o casi) de un club en la ventana
 * activa. Si se pasa demarcación y OVR, también queda memoria de qué nivel
 * hay que reponer en esa posición (ver `recentCoreLossOvr`).
 */
export function registerCoreDeparture(
  clubId: string | null,
  group?: string,
  ovr?: number,
  playerName?: string,
): void {
  if (!clubId) return;
  coreDepartures.set(clubId, (coreDepartures.get(clubId) ?? 0) + 1);
  if (group && typeof ovr === "number") {
    const key = coreLossKey(clubId, group);
    const existing = lastCoreLoss.get(key);
    if (!existing || ovr > existing.ovr) {
      lastCoreLoss.set(key, { ovr, playerName: playerName ?? "" });
    }
  }
}

/** Salidas "de nivel" de un club en la ventana activa. */
export function coreDeparturesFor(clubId: string): number {
  return coreDepartures.get(clubId) ?? 0;
}

/**
 * Mejor OVR perdido recientemente por un club en una demarcación concreta,
 * dentro de la ventana activa (0 si no ha perdido a nadie de nivel ahí).
 */
export function recentCoreLossOvr(clubId: string, group: string): number {
  return lastCoreLoss.get(coreLossKey(clubId, group))?.ovr ?? 0;
}

/**
 * Registra un fichaje "de nivel" (titular o casi) de un club en la ventana
 * activa. Si se pasa demarcación y OVR, queda memoria de qué nivel se ha
 * fichado en esa posición (ver `recentCoreSigningOvr`).
 */
export function registerCoreSigning(
  clubId: string | null,
  group?: string,
  ovr?: number,
  playerName?: string,
): void {
  if (!clubId) return;
  if (group && typeof ovr === "number") {
    const key = coreLossKey(clubId, group);
    const existing = lastCoreSigning.get(key);
    if (!existing || ovr > existing.ovr) {
      lastCoreSigning.set(key, { ovr, playerName: playerName ?? "" });
    }
  }
}

/**
 * Mejor OVR fichado recientemente por un club en una demarcación concreta,
 * dentro de la ventana activa (0 si no ha fichado a nadie de nivel ahí).
 */
export function recentCoreSigningOvr(clubId: string, group: string): number {
  return lastCoreSigning.get(coreLossKey(clubId, group))?.ovr ?? 0;
}

/**
 * Saldo de la ventana: positivo si el club ha perdido más gente de la que ha
 * fichado. La simulación lo usa para que nadie termine el mercado con media
 * plantilla.
 */
export function windowDeficit(clubId: string): number {
  return departuresFor(clubId) - arrivalsFor(clubId);
}

/** Limpia todos los cerrojos (cambio de partida). */
export function resetMarketLocks(): void {
  activeWindowKey = "";
  settled.clear();
  arrivals.clear();
  departures.clear();
  coreDepartures.clear();
  lastCoreLoss.clear();
  lastCoreSigning.clear();
  userApprovedDepth = 0;
}

/**
 * Reconstruye los cerrojos a partir del historial guardado: todo traspaso
 * cerrado dentro de la ventana activa vuelve a bloquear a su jugador.
 */
export function rebuildLocks(
  records: readonly { playerId: string; toClubId: string; fromClubId?: string | null; date: string }[],
  windowKeyOf: (date: string) => string,
): void {
  settled.clear();
  arrivals.clear();
  departures.clear();
  coreDepartures.clear();
  lastCoreLoss.clear();
  if (!activeWindowKey) return;
  for (const record of records) {
    if (windowKeyOf(record.date) !== activeWindowKey) continue;
    settled.set(record.playerId, activeWindowKey);
    if (record.toClubId) arrivals.set(record.toClubId, (arrivals.get(record.toClubId) ?? 0) + 1);
    if (record.fromClubId) {
      departures.set(record.fromClubId, (departures.get(record.fromClubId) ?? 0) + 1);
    }
  }
}

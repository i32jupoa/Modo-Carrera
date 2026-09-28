/**
 * Señales de uso de plantilla y lesiones que necesita el mercado de la IA.
 *
 * Se mantiene fuera de Zustand y del motor de fichajes para evitar ciclos de
 * imports: `playersStore` registra aquí las apariciones/lesiones y el mercado
 * consulta las señales al decidir compras y cesiones.
 */

export interface MarketUsageSnapshot {
  playerId: string;
  clubId: string;
  season: number;
  appearances: number;
  minutes: number;
}

export interface MarketInjurySnapshot {
  playerId: string;
  clubId: string;
  startDate: string;
  untilDate: string;
  durationDays: number;
}

interface UsageBucket {
  appearances: number;
  minutes: number;
}

interface InjurySignal {
  playerId: string;
  clubId: string;
  startDate: string;
  untilDate: string;
  durationDays: number;
}

const usage = new Map<string, Map<string, UsageBucket>>();
const injuries = new Map<string, InjurySignal>();

function seasonOf(date: string): number {
  const month = Number(date.slice(5, 7));
  const year = Number(date.slice(0, 4));
  return month >= 7 ? year : year - 1;
}

function usageKey(season: number, clubId: string): string {
  return `${season}:${clubId}`;
}

/** Limpia todas las señales (nueva partida). */
export function resetMarketPlayerSignals(): void {
  usage.clear();
  injuries.clear();
}

/** Registra una aparición real del jugador para su club y temporada. */
export function recordMarketAppearance(
  playerId: string,
  clubId: string | null | undefined,
  date: string,
  minutes: number,
): void {
  if (!playerId || !clubId) return;
  const season = seasonOf(date);
  const key = usageKey(season, clubId);
  const players = usage.get(key) ?? new Map<string, UsageBucket>();
  const current = players.get(playerId) ?? { appearances: 0, minutes: 0 };
  players.set(playerId, {
    appearances: current.appearances + 1,
    minutes: current.minutes + Math.max(0, Math.min(120, Math.round(minutes))),
  });
  usage.set(key, players);
}

/**
 * Rehidrata las señales de uso de una partida guardada. El historial del
 * mercado ya existe, pero estas señales se reconstruyen desde las estadísticas
 * persistidas de la temporada para que una partida cargada tenga el mismo
 * comportamiento que una partida jugada desde cero.
 */
export function hydrateMarketPlayerSignals(
  entries: readonly {
    playerId: string;
    clubId: string | null | undefined;
    date: string;
    appearances: number;
    minutes: number;
  }[],
): void {
  resetMarketPlayerSignals();
  for (const entry of entries) {
    if (!entry.clubId) continue;
    const season = seasonOf(entry.date);
    const key = usageKey(season, entry.clubId);
    const players = usage.get(key) ?? new Map<string, UsageBucket>();
    players.set(entry.playerId, {
      appearances: Math.max(0, Number(entry.appearances) || 0),
      minutes: Math.max(0, Number(entry.minutes) || 0),
    });
    usage.set(key, players);
  }
}



/** Rehidrata lesiones persistidas de la partida para que el mercado pueda reaccionar. */
export function hydrateMarketPlayerInjuries(entries: readonly MarketInjurySnapshot[]): void {
  for (const entry of entries) {
    if (!entry.playerId || !entry.clubId || !entry.startDate || !entry.untilDate) continue;
    if (!Number.isFinite(Number(entry.durationDays)) || Number(entry.durationDays) <= 0) continue;
    injuries.set(entry.playerId, {
      playerId: entry.playerId,
      clubId: entry.clubId,
      startDate: entry.startDate,
      untilDate: entry.untilDate,
      durationDays: Number(entry.durationDays),
    });
  }
}

/** Registra una lesión y su fecha exacta de recuperación. */
export function recordMarketInjury(
  playerId: string,
  clubId: string | null | undefined,
  startDate: string,
  untilDate: string,
  durationDays: number,
): void {
  if (!playerId || !clubId || !startDate || !untilDate) return;
  injuries.set(playerId, {
    playerId,
    clubId,
    startDate,
    untilDate,
    durationDays: Math.max(0, Number(durationDays) || 0),
  });
}

export function getPlayerUsage(
  playerId: string,
  clubId: string | null | undefined,
  date: string,
): { appearances: number; minutes: number; minutesShare: number } {
  if (!clubId) return { appearances: 0, minutes: 0, minutesShare: 0 };
  const players = usage.get(usageKey(seasonOf(date), clubId));
  const current = players?.get(playerId) ?? { appearances: 0, minutes: 0 };
  let maxMinutes = 0;
  for (const bucket of players?.values() ?? []) maxMinutes = Math.max(maxMinutes, bucket.minutes);
  const minutesShare = maxMinutes > 0 ? Math.max(0, Math.min(1, current.minutes / maxMinutes)) : 0;
  return { ...current, minutesShare };
}

/**
 * Devuelve jugadores con una lesión larga aún activa.
 * 42 días equivale a seis semanas: una ausencia así sí justifica que un club
 * reaccione en enero buscando una solución temporal o un recambio.
 */
export function getLongTermInjuredPlayerIds(
  clubId: string,
  date: string,
  minDurationDays = 42,
): string[] {
  const out: string[] = [];
  for (const injury of injuries.values()) {
    if (injury.clubId !== clubId) continue;
    if (injury.durationDays < minDurationDays) continue;
    if (date < injury.untilDate) out.push(injury.playerId);
  }
  return out;
}

/**
 * Escritura segura en `localStorage`.
 *
 * Antes, cuando el navegador se quedaba sin cuota, el juego llamaba a
 * `localStorage.clear()` y reintentaba: eso borraba TODAS las partidas y,
 * sobre todo, el mercado guardado (rumores, negociaciones e historial de
 * traspasos), que es exactamente lo que el jugador veía desaparecer tras
 * simular un partido. Aquí nunca se borra todo: se liberan primero las
 * cachés reconstruibles y, si hace falta, los archivos de mercado más
 * antiguos, y jamás se lanza una excepción hacia la UI.
 */

const PLAYERS_CACHE_KEY = "fcsim:players:v1";
const GENERATED_STATS_KEY = "fcsim:generated_stats";
const MARKET_PREFIX = "fcsim:market:v1";
const CURRENT_SAVE_ID_KEY = "fcsim:save:current";
/** Marca de los archivos de mercado ya cerrados: `...:{saveId}:w:{ventana}`. */
export const MARKET_ARCHIVE_MARKER = ":w:";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function isQuotaError(error: unknown): boolean {
  const e = error as { name?: string; code?: number; message?: string } | null;
  if (!e) return false;
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 ||
    e.code === 1014 ||
    /quota/i.test(e.message ?? "")
  );
}

function allKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * Claves que se pueden sacrificar, en orden: primero cachés que se
 * reconstruyen solas, luego archivos de mercado de OTRAS partidas (de la
 * ventana más antigua a la más reciente) y, como último recurso, los
 * archivos antiguos de la partida activa.
 */
function pruneCandidates(protectedKey: string): string[] {
  const activeId = localStorage.getItem(CURRENT_SAVE_ID_KEY);
  const archives = allKeys().filter(
    (k) => k.startsWith(MARKET_PREFIX) && k.includes(MARKET_ARCHIVE_MARKER),
  );
  const windowOf = (k: string) => k.slice(k.indexOf(MARKET_ARCHIVE_MARKER) + MARKET_ARCHIVE_MARKER.length);
  const byWindowAsc = (a: string, b: string) => windowOf(a).localeCompare(windowOf(b));
  const others = archives.filter((k) => !activeId || !k.includes(`:${activeId}${MARKET_ARCHIVE_MARKER}`));
  const mine = archives.filter((k) => activeId && k.includes(`:${activeId}${MARKET_ARCHIVE_MARKER}`));

  return [
    PLAYERS_CACHE_KEY,
    GENERATED_STATS_KEY,
    ...others.sort(byWindowAsc),
    ...mine.sort(byWindowAsc),
  ].filter((k) => k !== protectedKey && localStorage.getItem(k) !== null);
}

/** Guarda una clave. Devuelve `false` si no ha podido, pero nunca lanza. */
export function safeSetItem(key: string, value: string): boolean {
  if (!hasStorage()) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaError(error)) {
      console.warn("[storage] no se pudo guardar", key, (error as Error)?.message);
      return false;
    }
    for (const candidate of pruneCandidates(key)) {
      try {
        localStorage.removeItem(candidate);
        localStorage.setItem(key, value);
        console.warn("[storage] espacio liberado eliminando", candidate);
        return true;
      } catch {
        /* seguimos liberando */
      }
    }
    console.warn("[storage] almacenamiento lleno: no se ha guardado", key);
    return false;
  }
}

export function safeRemoveItem(key: string): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* nada que hacer */
  }
}

/**
 * Escritura segura en `localStorage`.
 *
 * Antes, cuando el navegador se quedaba sin cuota, el juego llamaba a
 * `localStorage.clear()` y reintentaba: eso borraba TODAS las partidas y,
 * sobre todo, el mercado guardado (rumores, negociaciones e historial de
 * traspasos), que es exactamente lo que el jugador veía desaparecer tras
 * simular un partido. Aquí nunca se borra todo: se liberan primero las
 * cachés reconstruibles y, si hace falta, restos de mercado que pudieran
 * quedar sin migrar, y jamás se lanza una excepción hacia la UI.
 *
 * IMPORTANTE: el mercado (con diferencia lo que más pesaba) ya NO vive aquí:
 * vive en IndexedDB (ver `src/lib/transfers/marketIdb.ts` y `Persistence.ts`),
 * que no tiene la cuota tan ajustada de `localStorage`. Lo que queda en
 * `localStorage` (plantillas, guardado de la partida, metadatos) es mucho
 * más pequeño, así que esta cuota debería dejar de agotarse en la práctica;
 * este archivo se mantiene igualmente como red de seguridad.
 */

const PLAYERS_CACHE_KEY = "fcsim:players:v1";
const GENERATED_STATS_KEY = "fcsim:generated_stats";
const MARKET_PREFIX = "fcsim:market:v1";
const CURRENT_SAVE_ID_KEY = "fcsim:save:current";
const SAVES_LIST_KEY = "fcsim:saves:v2";
const SAVE_KEY_PREFIX = "fcsim:save:v2:";
const NOTIFICATIONS_PREFIX = "fcsim:market-notifications:v1:";
const GENERATED_STATS_PREFIX = "fcsim:generated_stats:";
const POSITION_HISTORY_PREFIX = "modo-carrera:pos-history:";
const LEGACY_GENERATED_STATS_KEY = "fcsim:generated_stats";
const LEGACY_POSITION_HISTORY_KEY = "modo-carrera:pos-history";
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
  const windowOf = (k: string) =>
    k.slice(k.indexOf(MARKET_ARCHIVE_MARKER) + MARKET_ARCHIVE_MARKER.length);
  const byWindowAsc = (a: string, b: string) => windowOf(a).localeCompare(windowOf(b));
  const others = archives.filter(
    (k) => !activeId || !k.includes(`:${activeId}${MARKET_ARCHIVE_MARKER}`),
  );
  const mine = archives.filter(
    (k) => activeId && k.includes(`:${activeId}${MARKET_ARCHIVE_MARKER}`),
  );

  return [
    PLAYERS_CACHE_KEY,
    GENERATED_STATS_KEY,
    ...others.sort(byWindowAsc),
    ...mine.sort(byWindowAsc),
  ].filter((k) => k !== protectedKey && localStorage.getItem(k) !== null);
}

function validSaveIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SAVES_LIST_KEY);
    const metas = raw ? (JSON.parse(raw) as Array<{ id?: string }>) : [];
    const ids = new Set(metas.map((m) => m?.id).filter((id): id is string => !!id));
    const activeId = localStorage.getItem(CURRENT_SAVE_ID_KEY);
    if (activeId) ids.add(activeId);
    return ids;
  } catch {
    return new Set();
  }
}

/**
 * Borra restos de partidas que ya no existen (mercado, notificaciones y
 * ranura de guardado de un `id` que no aparece en la lista de partidas).
 * Puede pasar, por ejemplo, si un borrado se interrumpió a medias. Es basura
 * pura: no hay forma de volver a esas partidas, así que liberarla siempre es
 * seguro. Se ejecuta una vez al arrancar la app y también como primer paso
 * al quedarnos sin cuota, antes de tocar nada que sí esté en uso.
 */
export function cleanupOrphanedStorage(): void {
  if (!hasStorage()) return;
  try {
    const valid = validSaveIds();
    // Restos globales de versiones antiguas: ya no pueden representar una
    // partida concreta y, por tanto, nunca deben volver a entrar en una carrera.
    localStorage.removeItem(LEGACY_GENERATED_STATS_KEY);
    localStorage.removeItem(LEGACY_POSITION_HISTORY_KEY);

    for (const key of allKeys()) {
      let id: string | null = null;
      if (key.startsWith(SAVE_KEY_PREFIX)) {
        id = key.slice(SAVE_KEY_PREFIX.length);
      } else if (key.startsWith(`${MARKET_PREFIX}:`)) {
        id = key.slice(MARKET_PREFIX.length + 1).split(MARKET_ARCHIVE_MARKER)[0] ?? null;
      } else if (key.startsWith(NOTIFICATIONS_PREFIX)) {
        id = key.slice(NOTIFICATIONS_PREFIX.length);
      } else if (key.startsWith(GENERATED_STATS_PREFIX)) {
        id = key.slice(GENERATED_STATS_PREFIX.length);
      } else if (key.startsWith(POSITION_HISTORY_PREFIX)) {
        id = key.slice(POSITION_HISTORY_PREFIX.length);
      }
      if (id && !valid.has(id)) {
        try {
          localStorage.removeItem(key);
        } catch {
          /* seguimos con el resto */
        }
      }
    }
  } catch {
    /* si algo falla aquí no es crítico: seguimos como si no hubiera huérfanos */
  }
}

/**
 * Vuelca en consola un resumen de qué ocupa `localStorage`: total usado y las
 * claves más pesadas. Sólo se usa quan ya no hay nada más que intentar (se ha
 * limpiado lo huérfano y lo prescindible y aun así no cabe), para poder ver
 * en las herramientas de desarrollador qué es lo que realmente llena la
 * cuota en vez de tener que adivinarlo.
 */
function logStorageBreakdown(failedKey: string, valueSize: number): void {
  try {
    const sizes = allKeys().map((k) => {
      const v = localStorage.getItem(k) ?? "";
      return { key: k, bytes: v.length };
    });
    const total = sizes.reduce((sum, s) => sum + s.bytes, 0);
    sizes.sort((a, b) => b.bytes - a.bytes);
    console.warn(
      `[storage] cuota agotada guardando "${failedKey}" (${(valueSize / 1024).toFixed(1)} KB). ` +
        `Total ya ocupado en localStorage: ${(total / 1024).toFixed(1)} KB en ${sizes.length} claves.`,
    );
    console.table(
      sizes.slice(0, 15).map((s) => ({ clave: s.key, KB: (s.bytes / 1024).toFixed(1) })),
    );
  } catch {
    /* el propio diagnóstico no debe romper nada */
  }
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

    cleanupOrphanedStorage();
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      /* seguimos liberando */
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
    logStorageBreakdown(key, value.length);
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

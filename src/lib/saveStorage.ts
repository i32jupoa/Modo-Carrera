/**
 * Almacén de las partidas guardadas (las ranuras `fcsim:save:v2:{id}`).
 *
 * Por qué existe: `localStorage` tiene un techo fijo de unos 5 MB por sitio
 * que no se puede ampliar. Una carrera real ocupa mucho más que eso (sólo las
 * estadísticas de jugador y la crónica de partidos de una temporada ya pasan
 * de 5 MB), así que a las pocas jornadas aparecía el aviso de
 * "almacenamiento lleno" y la partida dejaba de guardarse. IndexedDB no tiene
 * ese techo: su cuota va ligada al espacio libre en disco (cientos de MB o
 * más), igual que ya se hizo con el mercado de fichajes.
 *
 * El problema práctico es que IndexedDB es asíncrono y todo el juego lee la
 * partida de forma síncrona (`loadSave()` se llama dentro del render de
 * muchísimas pantallas). La solución aquí es un espejo en memoria:
 *
 *  1. Al arrancar, `initSaveStorage()` abre IndexedDB, se trae TODAS las
 *     ranuras de golpe y, además, migra cualquier ranura que aún viviera en
 *     `localStorage` (partidas creadas con la versión anterior).
 *  2. A partir de ahí, leer es síncrono (del espejo en memoria) y escribir
 *     actualiza el espejo al instante y manda la escritura a IndexedDB en
 *     segundo plano, sin bloquear la interfaz.
 *
 * Si IndexedDB no estuviera disponible (modo privado muy restrictivo, un
 * navegador antiguo), se cae de vuelta a `localStorage` con el mismo
 * comportamiento tolerante de antes: nada de esto lanza excepciones nunca.
 */

import { safeSetItem, safeRemoveItem } from "./safeStorage";

const DB_NAME = "fcsim-saves";
const DB_VERSION = 1;
const STORE = "saves";

/** Prefijo de las ranuras de partida, idéntico al que usaba `localStorage`. */
export const SAVE_KEY_PREFIX = "fcsim:save:v2:";

/** Espejo en memoria: clave de ranura -> JSON serializado. */
const mirror = new Map<string, string>();

let ready = false;
let usingFallback = false;
let initPromise: Promise<void> | null = null;
let db: IDBDatabase | null = null;

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!hasIdb()) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (value: IDBDatabase | null) => {
      if (settled) {
        // Si la apertura termina después de nuestro límite, no dejamos una
        // conexión abierta que pueda bloquear otras operaciones/actualizaciones.
        try {
          value?.close();
        } catch {
          /* noop */
        }
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      console.warn('[saveStorage] IndexedDB tardó demasiado en abrir; usando almacenamiento de respaldo.');
      finish(null);
    }, 2500);

    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => finish(req.result);
      req.onerror = () => {
        console.warn('[saveStorage] IndexedDB no disponible:', req.error);
        finish(null);
      };
      req.onblocked = () => {
        console.warn('[saveStorage] apertura de IndexedDB bloqueada; usando almacenamiento de respaldo temporal.');
        finish(null);
      };
    } catch (e) {
      console.warn('[saveStorage] IndexedDB no disponible:', (e as Error)?.message);
      finish(null);
    }
  });
}

function idbPut(key: string, value: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!db) {
      resolve(false);
      return;
    }
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn("[saveStorage] no se pudo escribir", key, tx.error);
        resolve(false);
      };
      tx.onabort = () => resolve(false);
    } catch (e) {
      console.warn("[saveStorage] error escribiendo", key, (e as Error)?.message);
      resolve(false);
    }
  });
}

function idbDelete(key: string): Promise<void> {
  return new Promise((resolve) => {
    if (!db) {
      resolve();
      return;
    }
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function idbLoadAll(): Promise<Array<[string, string]>> {
  return new Promise((resolve) => {
    if (!db) {
      resolve([]);
      return;
    }

    let settled = false;
    const finish = (value: Array<[string, string]>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      console.warn('[saveStorage] La lectura inicial de partidas tardó demasiado; continuando con el espejo disponible.');
      finish([]);
    }, 4000);

    try {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();
      tx.oncomplete = () => {
        const keys = (keysReq.result ?? []) as IDBValidKey[];
        const vals = (valsReq.result ?? []) as unknown[];
        const out: Array<[string, string]> = [];
        keys.forEach((k, i) => {
          const v = vals[i];
          if (typeof k === 'string' && typeof v === 'string') out.push([k, v]);
        });
        finish(out);
      };
      tx.onerror = () => finish([]);
      tx.onabort = () => finish([]);
    } catch {
      finish([]);
    }
  });
}

/** Cola de escrituras: sólo se manda a disco el último valor de cada clave. */
const pendingWrites = new Map<string, string | null>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

async function flushPending(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (pendingWrites.size > 0) {
      const entries = [...pendingWrites.entries()];
      pendingWrites.clear();
      for (const [key, value] of entries) {
        if (value === null) {
          if (usingFallback) safeRemoveItem(key);
          else await idbDelete(key);
          continue;
        }
        if (usingFallback) {
          safeSetItem(key, value);
          continue;
        }
        const ok = await idbPut(key, value);
        if (!ok) {
          // Último recurso: intentar `localStorage` para no perder la jornada.
          safeSetItem(key, value);
        }
      }
    }
  } finally {
    flushing = false;
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPending();
  }, 0);
}

/**
 * Prepara el almacén: abre IndexedDB, carga las ranuras en memoria y migra
 * las que aún estuvieran en `localStorage`. Es idempotente y nunca lanza.
 */
export function initSaveStorage(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (typeof window === 'undefined') {
      ready = true;
      return;
    }

    try {
      db = await openDb();
      usingFallback = !db;

      // La carga de las partidas nunca debe bloquear el arranque. Si IndexedDB
      // responde normalmente, volcamos sus ranuras al espejo; si tarda más del
      // límite, continuamos y `getSaveItem()` podrá leer el legado de
      // localStorage mientras termina la recuperación.
      if (db) {
        for (const [key, value] of await idbLoadAll()) mirror.set(key, value);
      }
    } catch (e) {
      console.warn('[saveStorage] inicialización incompleta:', (e as Error)?.message);
      usingFallback = !db;
    } finally {
      ready = true;
    }

    // La migración de partidas antiguas puede implicar varios megabytes y
    // muchas transacciones. Se ejecuta después de marcar el almacén como listo
    // para que nunca sea responsable de dejar la pantalla de inicio congelada.
    void migrateLegacySaveSlotsInBackground();
  })();
  return initPromise;
}

async function migrateLegacySaveSlotsInBackground(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SAVE_KEY_PREFIX)) legacyKeys.push(key);
    }

    // Sólo migramos ranuras que no estén ya en memoria. Conservar el dato en
    // localStorage hasta confirmar la copia evita perder una carrera antigua
    // si se interrumpe el navegador durante la migración.
    for (const key of legacyKeys) {
      let value: string | null = null;
      try {
        value = localStorage.getItem(key);
      } catch {
        value = null;
      }
      if (!value) continue;

      if (!mirror.has(key)) {
        mirror.set(key, value);
        if (db) {
          const ok = await idbPut(key, value);
          if (ok) safeRemoveItem(key);
        }
      } else if (db) {
        safeRemoveItem(key);
      }
    }
  } catch (e) {
    console.warn('[saveStorage] migración de partidas heredadas aplazada:', (e as Error)?.message);
  }
}

export function isSaveStorageReady(): boolean {
  return ready;
}

/** ¿Estamos limitados a `localStorage` porque IndexedDB no está disponible? */
export function isSaveStorageFallback(): boolean {
  return usingFallback;
}

/** Lectura síncrona de una ranura. */
export function getSaveItem(key: string): string | null {
  const cached = mirror.get(key);
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Escritura de una ranura. Devuelve `true` siempre que el valor haya quedado
 * registrado (espejo en memoria + cola hacia IndexedDB): a diferencia de
 * `localStorage`, aquí no hay una cuota de pocos MB que pueda rechazarlo.
 */
export function setSaveItem(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  mirror.set(key, value);
  pendingWrites.set(key, value);
  scheduleFlush();
  if (usingFallback) {
    // Sin IndexedDB no podemos prometer más de lo que dé `localStorage`.
    return safeSetItem(key, value);
  }
  return true;
}

export function removeSaveItem(key: string): void {
  mirror.delete(key);
  pendingWrites.set(key, null);
  scheduleFlush();
  safeRemoveItem(key);
}

export function listSaveKeys(): string[] {
  return [...mirror.keys()];
}

/** Fuerza el volcado a disco de lo que quede en la cola (al cerrar, etc.). */
export function flushSaveStorage(): Promise<void> {
  return flushPending();
}

/** Espacio aproximado ocupado por las partidas, en KB (para diagnóstico). */
export function saveStorageUsageKB(): number {
  let bytes = 0;
  for (const v of mirror.values()) bytes += v.length;
  return Math.round(bytes / 1024);
}

/**
 * Borra ranuras de partidas que ya no existen en la lista de partidas
 * guardadas (restos de un borrado interrumpido). Es basura pura: liberarla
 * siempre es seguro.
 */
export function cleanupOrphanedSaveSlots(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("fcsim:saves:v2");
    const metas = raw ? (JSON.parse(raw) as Array<{ id?: string }>) : [];
    const valid = new Set(metas.map((m) => m?.id).filter((id): id is string => !!id));
    const active = localStorage.getItem("fcsim:save:current");
    if (active) valid.add(active);
    if (valid.size === 0) return;
    for (const key of listSaveKeys()) {
      if (!key.startsWith(SAVE_KEY_PREFIX)) continue;
      const id = key.slice(SAVE_KEY_PREFIX.length);
      if (!valid.has(id)) removeSaveItem(key);
    }
  } catch {
    /* el saneado no es crítico */
  }
}

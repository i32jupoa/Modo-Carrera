/**
 * Almacén del mercado de fichajes en IndexedDB.
 *
 * Por qué existe este archivo: `localStorage` da entre 5 y 10 MB por sitio
 * en la mayoría de navegadores, y el mercado (rumores, negociaciones,
 * historial de traspasos, archivado ventana a ventana) es, con diferencia,
 * lo que más pesa de todo lo que guarda la partida — en una carrera larga
 * podía por sí solo ocupar varios MB en una única clave. Eso era la causa
 * directa del aviso "almacenamiento lleno" al volver de un partido: entre el
 * mercado y el resto de claves (plantillas, guardado de la partida...) se
 * superaba la cuota del navegador.
 *
 * IndexedDB no tiene ese techo tan bajo: su cuota está ligada al espacio
 * libre en disco (normalmente cientos de MB o más), así que es donde vive
 * ahora el mercado. La API que expone (`idbGetItem`/`idbSetItem`/
 * `idbRemoveItem`/`idbListKeys`) es deliberadamente parecida a la de
 * `localStorage` para que `Persistence.ts` cambie lo mínimo — sólo que ahora
 * son funciones asíncronas, y `Persistence.ts` ya vive detrás de un
 * `useEffect` (ver `useMarketClock.ts`), así que no hace falta tocar nada
 * síncrono del arranque de la app para adoptarlas.
 *
 * Ninguna de estas funciones lanza: si IndexedDB no está disponible (algún
 * navegador muy antiguo, o un modo privado especialmente restrictivo), se
 * devuelve `null`/`false`/`[]` según corresponda y se avisa por consola, pero
 * nunca se rompe la app.
 */

const DB_NAME = "fcsim-market";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn("[marketIdb] IndexedDB no disponible:", req.error);
        resolve(null);
      };
      req.onblocked = () => {
        console.warn(
          "[marketIdb] apertura de IndexedDB bloqueada (otra pestaña con una versión antigua abierta)",
        );
      };
    } catch (e) {
      console.warn("[marketIdb] IndexedDB no disponible:", e);
      resolve(null);
    }
  });
  return dbPromise;
}

/** Lee una clave. `null` si no existe o si IndexedDB no está disponible. */
export async function idbGetItem(key: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Guarda una clave. Devuelve `false` si no ha podido (nunca lanza). */
export async function idbSetItem(key: string, value: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn("[marketIdb] fallo al guardar", key, tx.error);
        resolve(false);
      };
      tx.onabort = () => resolve(false);
    } catch (e) {
      console.warn("[marketIdb] fallo al guardar", key, e);
      resolve(false);
    }
  });
}

/** Borra una clave. Nunca lanza. */
export async function idbRemoveItem(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Lista todas las claves guardadas (opcionalmente filtradas por prefijo). */
export async function idbListKeys(prefix?: string): Promise<string[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => {
        const keys = (req.result as IDBValidKey[]).map(String);
        resolve(prefix ? keys.filter((k) => k.startsWith(prefix)) : keys);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

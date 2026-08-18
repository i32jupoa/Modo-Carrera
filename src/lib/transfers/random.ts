/**
 * Generación de números pseudoaleatorios determinista.
 *
 * El mercado debe ser reproducible dentro de una misma partida: dos avances
 * del mismo día con la misma semilla producen el mismo resultado, pero dos
 * temporadas distintas nunca se parecen.
 */

/** Hash estable de una cadena (FNV-1a de 32 bits). */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Generador mulberry32: rápido, sin estado global y con buena distribución. */
export function createRng(seed: number | string): () => number {
  let state = (typeof seed === "string" ? hashString(seed) : seed) >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// SEMILLA POR PARTIDA
// ----------------------------------------------------------------------------
// Sin esto, dos partidas nuevas distintas producían exactamente el mismo
// mercado: mismo club puja por el mismo jugador en la misma fecha siempre,
// porque la semilla sólo dependía de los ids y la fecha. Se añade aquí un
// "salt" estable por partida (el id de la partida guardada) que se mezcla en
// todas las claves, así que dos partidas siguen siendo reproducibles al
// recargarlas, pero ya no son la misma partida disfrazada.
// ============================================================================

let marketSeedSalt = "";

/** Fija el salt de partida (normalmente el id de la partida guardada). */
export function setMarketSeedSalt(salt: string | null | undefined): void {
  marketSeedSalt = salt ?? "";
}

/** Valor determinista en [0, 1) para una clave concreta. */
export function seededUnit(...parts: Array<string | number>): number {
  const key = marketSeedSalt ? `${marketSeedSalt}|${parts.join("|")}` : parts.join("|");
  return createRng(key)();
}

/** Valor determinista dentro de un rango. */
export function seededRange(min: number, max: number, ...parts: Array<string | number>): number {
  return min + seededUnit(...parts) * (max - min);
}

/** Entero determinista dentro de un rango inclusivo. */
export function seededInt(min: number, max: number, ...parts: Array<string | number>): number {
  return Math.floor(seededRange(min, max + 1, ...parts));
}

/** Elige un elemento de la lista de forma determinista. */
export function seededPick<T>(
  items: readonly T[],
  ...parts: Array<string | number>
): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(seededUnit(...parts) * items.length))];
}

/** Restringe un valor a un rango. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Interpolación lineal. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** Normaliza un valor a 0..1 dentro de un rango. */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

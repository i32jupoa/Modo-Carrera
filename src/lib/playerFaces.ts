// Mapa id → imagen de la carta del jugador (misma fuente que usa el
// apartado de Equipos / 11 tipo), para poder mostrar la cara aunque el
// objeto de partida guardado no traiga `cardImage`.
import playersData from "@/data/playersData";

let cache: Map<string, string> | null = null;

function getMap(): Map<string, string> {
  if (cache) return cache;
  const m = new Map<string, string>();
  const arr = Array.isArray(playersData) ? (playersData as any[]) : [];
  for (const p of arr) {
    const id = p?.ID != null ? String(p.ID) : "";
    const card = p?.card || p?.cardImage || p?.PhotoUrl || "";
    if (id && card) m.set(id, card);
  }
  cache = m;
  return m;
}

/** Devuelve la URL de la cara del jugador (o undefined si no hay). */
export function faceUrl(id?: string | number, fallback?: string): string | undefined {
  if (fallback) return fallback;
  if (id == null) return undefined;
  return getMap().get(String(id)) || undefined;
}

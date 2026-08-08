// Perfil deportivo de un equipo derivado de sus atributos y plantilla.
// Se usa en /teams para mostrar la táctica estimada de la IA y su 11 tipo,
// reutilizando los mismos conceptos que el motor de partido (teamTactics.ts).

import type { Team } from "@/data/teams";
import type { FcPlayer } from "@/store/playersStore";
import type { DefenseLine, PlayStyle, Pressure } from "@/lib/teamTactics";
import { ALL_FORMATIONS, FORMATION_COORDINATES, type FormationName } from "@/lib/formations";

/* ------------------------------------------------------------------ orden */

/**
 * Orden natural de posiciones: portero, lateral derecho, centrales,
 * lateral izquierdo, mediocentro defensivo, mediocentro, mediocentro
 * ofensivo, extremos y delanteros.
 */
export const POSITION_ORDER = [
  "GK",
  "RB",
  "RWB",
  "CB",
  "LB",
  "LWB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "RW",
  "LM",
  "LW",
  "CF",
  "ST",
] as const;

export function positionRank(pos: string): number {
  const i = (POSITION_ORDER as readonly string[]).indexOf((pos || "").toUpperCase());
  return i < 0 ? POSITION_ORDER.length : i;
}

/** Ordena una plantilla por posición y, dentro de cada posición, por media. */
export function sortByPosition<T extends { Position: string; OVR: number }>(list: T[]): T[] {
  return list.slice().sort((a, b) => {
    const d = positionRank(a.Position) - positionRank(b.Position);
    return d !== 0 ? d : b.OVR - a.OVR;
  });
}

export type PosGroup = "POR" | "DEF" | "MED" | "DEL";

export function positionGroup(pos: string): PosGroup {
  const p = (pos || "").toUpperCase();
  if (p === "GK") return "POR";
  if (["CB", "RB", "LB", "RWB", "LWB"].includes(p)) return "DEF";
  if (["CDM", "CM", "CAM", "RM", "LM"].includes(p)) return "MED";
  if (["RW", "LW", "ST", "CF"].includes(p)) return "DEL";
  return "MED";
}

/* --------------------------------------------------------------- tácticas */

export type EstimatedTactics = {
  style: PlayStyle;
  pressure: Pressure;
  defenseLine: DefenseLine;
  formation: string;
};

const STYLE_LABEL: Record<PlayStyle, string> = {
  defensive: "Defensivo",
  balanced: "Equilibrado",
  offensive: "Ofensivo",
};

const LEVEL_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export function styleLabel(s: PlayStyle): string {
  return STYLE_LABEL[s];
}

export function levelLabel(l: "low" | "medium" | "high"): string {
  return LEVEL_LABEL[l];
}

/**
 * Deduce el plan de partido de un equipo controlado por la IA a partir de
 * su ataque / medio / defensa. Es determinista: el mismo equipo siempre
 * juega igual, así que coincide con lo que verás en el partido.
 */
export function estimateTactics(team: Team): EstimatedTactics {
  const ov = (team.att + team.mid + team.def) / 3;
  const attBias = team.att - team.def;

  let style: PlayStyle = "balanced";
  if (attBias >= 3) style = "offensive";
  else if (attBias <= -3) style = "defensive";
  // Los grandes dominan el balón aunque estén equilibrados.
  if (style === "balanced" && ov >= 84) style = "offensive";

  let pressure: Pressure = "medium";
  if (ov >= 82 && style !== "defensive") pressure = "high";
  else if (ov < 70 || style === "defensive") pressure = "low";

  let defenseLine: DefenseLine = "medium";
  if (style === "offensive" && team.def >= 80) defenseLine = "high";
  else if (style === "defensive" || team.def < 70) defenseLine = "low";

  const formation =
    style === "offensive" ? (ov >= 84 ? "4-3-3" : "4-2-3-1") : style === "defensive" ? "4-4-2" : "4-2-3-1";

  return { style, pressure, defenseLine, formation };
}

/* ------------------------------------------------------------------ 11 tipo */

type Slot = {
  /** Etiqueta en español que se pinta sobre el campo. */
  label: string;
  /** Demarcaciones naturales para el hueco (sin penalización). */
  natural: string[];
  /** Demarcaciones que pueden adaptarse (penalización pequeña). */
  adaptable: string[];
  group: PosGroup;
};

/**
 * Definición de cada tipo de hueco a partir de la clave usada en
 * FORMATION_COORDINATES (gk, lb, cb1, cdm2, lw...). Las listas son
 * deliberadamente estrictas: un medio izquierdo puede jugar de extremo
 * izquierdo, pero nunca de lateral izquierdo.
 */
const SLOT_DEFS: Record<string, Slot> = {
  gk: { label: "POR", natural: ["GK"], adaptable: [], group: "POR" },
  cb: { label: "DFC", natural: ["CB"], adaptable: ["RB", "LB", "CDM"], group: "DEF" },
  lb: { label: "LI", natural: ["LB", "LWB"], adaptable: ["CB"], group: "DEF" },
  rb: { label: "LD", natural: ["RB", "RWB"], adaptable: ["CB"], group: "DEF" },
  lwb: { label: "CAI", natural: ["LWB", "LB"], adaptable: ["LM"], group: "DEF" },
  rwb: { label: "CAD", natural: ["RWB", "RB"], adaptable: ["RM"], group: "DEF" },
  cdm: { label: "MCD", natural: ["CDM"], adaptable: ["CM", "CB"], group: "MED" },
  cm: { label: "MC", natural: ["CM"], adaptable: ["CDM", "CAM"], group: "MED" },
  cam: { label: "MCO", natural: ["CAM"], adaptable: ["CM", "CF"], group: "MED" },
  lm: { label: "MI", natural: ["LM"], adaptable: ["LW", "LWB", "CM"], group: "MED" },
  rm: { label: "MD", natural: ["RM"], adaptable: ["RW", "RWB", "CM"], group: "MED" },
  lw: { label: "EI", natural: ["LW"], adaptable: ["LM", "CF", "ST"], group: "DEL" },
  rw: { label: "ED", natural: ["RW"], adaptable: ["RM", "CF", "ST"], group: "DEL" },
  st: { label: "DC", natural: ["ST"], adaptable: ["CF"], group: "DEL" },
  cf: { label: "SD", natural: ["CF"], adaptable: ["ST", "CAM"], group: "DEL" },
};

/** Quita el sufijo numérico de la clave (cb1 → cb). */
function slotKeyBase(key: string): string {
  return key.replace(/\d+$/, "");
}

/** Huecos (en orden) de cualquier formación de Dirección de equipo. */
export function formationSlots(formation: string): Slot[] {
  const coords = FORMATION_COORDINATES[formation as FormationName];
  if (!coords) return [];
  return Object.keys(coords).map((key) => {
    const def = SLOT_DEFS[slotKeyBase(key)];
    if (def) return def;
    const role = coords[key].role;
    const group: PosGroup = role === "GK" ? "POR" : role === "DEF" ? "DEF" : role === "MID" ? "MED" : "DEL";
    return { label: role, natural: [], adaptable: [], group };
  });
}

export type ElevenSlot = { label: string; player: FcPlayer | null; natural: boolean };

/**
 * 11 tipo estimado: para cada hueco de la formación coge al jugador libre
 * con mejor media que encaje de forma natural; si no hay, uno adaptable y,
 * como último recurso, alguien de la misma demarcación.
 */
export function estimatedEleven(formation: string, squad: FcPlayer[]): ElevenSlot[] {
  const slots = formationSlots(formation);
  if (!slots.length) return [];
  const used = new Set<number>();
  const pool = squad.slice().sort((a, b) => b.OVR - a.OVR);
  const posOf = (p: FcPlayer) => (p.Position || "").toUpperCase();

  return slots.map((slot) => {
    const free = (extra?: (p: FcPlayer) => boolean) =>
      pool.find((p) => !used.has(p.ID) && (!extra || extra(p)));

    const exact = free((p) => slot.natural.includes(posOf(p)));
    const adapted = exact ?? free((p) => slot.adaptable.includes(posOf(p)));
    const sameGroup = adapted ?? free((p) => positionGroup(p.Position) === slot.group);
    const pick = sameGroup ?? free() ?? null;
    if (pick) used.add(pick.ID);
    return { label: slot.label, player: pick, natural: !!exact };
  });
}

/** Media del 11 tipo, útil para comparar con el overall del equipo. */
export function elevenAverage(eleven: ElevenSlot[]): number {
  const list = eleven.map((s) => s.player).filter((p): p is FcPlayer => !!p);
  if (!list.length) return 0;
  return Math.round(list.reduce((a, p) => a + p.OVR, 0) / list.length);
}

/* -------------------------------------------------- mejor dibujo por plantilla */

/**
 * Puntúa un 11: suma de medias con penalización cuando el jugador no ocupa
 * su demarcación natural o cuando el hueco se queda vacío.
 */
function elevenScore(eleven: ElevenSlot[]): number {
  return eleven.reduce((acc, s) => {
    if (!s.player) return acc - 40;
    return acc + s.player.OVR - (s.natural ? 0 : 5);
  }, 0);
}

/**
 * Elige, entre todas las formaciones disponibles en Dirección de equipo, la
 * que mejor encaja con la plantilla (mejor media en su sitio natural).
 */
export function bestFormationForSquad(squad: FcPlayer[]): FormationName {
  let best: FormationName = "Táctica 4-2-3-1 (2)";
  let bestScore = -Infinity;
  for (const formation of ALL_FORMATIONS) {
    const score = elevenScore(estimatedEleven(formation, squad));
    if (score > bestScore) {
      bestScore = score;
      best = formation;
    }
  }
  return best;
}


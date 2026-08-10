/**
 * Sistema de demarcaciones detalladas.
 *
 * Sustituye por completo al viejo agrupamiento en 4 bloques
 * (POR / DEF / MED / DEL): cada jugador tiene una LISTA de demarcaciones
 * (su posición principal + sus "Alternative positions" de la base de datos),
 * TODAS al mismo nivel, y cada hueco del 11 titular exige una demarcación
 * concreta (GK, DFC, LI, MC, MD, ED...).
 */

export type PosCode =
  | "GK"
  | "DFC"
  | "LD"
  | "LI"
  | "CAD"
  | "CAI"
  | "MCD"
  | "MC"
  | "MCO"
  | "MD"
  | "MI"
  | "ED"
  | "EI"
  | "DC"
  | "SD";

export const ALL_POS_CODES: PosCode[] = [
  "GK", "DFC", "LD", "LI", "CAD", "CAI",
  "MCD", "MC", "MCO", "MD", "MI",
  "ED", "EI", "SD", "DC",
];

/** Nombre largo (ES) de cada demarcación. */
export const POS_NAME: Record<PosCode, string> = {
  GK: "portero",
  DFC: "defensa central",
  LD: "lateral derecho",
  LI: "lateral izquierdo",
  CAD: "carrilero derecho",
  CAI: "carrilero izquierdo",
  MCD: "mediocentro defensivo",
  MC: "mediocentro",
  MCO: "mediocentro ofensivo",
  MD: "medio derecho",
  MI: "medio izquierdo",
  ED: "extremo derecho",
  EI: "extremo izquierdo",
  SD: "segundo delantero",
  DC: "delantero centro",
};

/** Alias (EA/inglés/español) → demarcación canónica. */
const ALIASES: Record<string, PosCode> = {
  GK: "GK", POR: "GK", PT: "GK",
  CB: "DFC", LCB: "DFC", RCB: "DFC", SW: "DFC", DFC: "DFC",
  RB: "LD", RFB: "LD", LD: "LD",
  LB: "LI", LFB: "LI", LI: "LI",
  RWB: "CAD", CAD: "CAD",
  LWB: "CAI", CAI: "CAI",
  CDM: "MCD", MCD: "MCD", DM: "MCD",
  CM: "MC", MC: "MC",
  CAM: "MCO", MCO: "MCO", AM: "MCO",
  RM: "MD", MD: "MD",
  LM: "MI", MI: "MI",
  RW: "ED", RF: "ED", ED: "ED",
  LW: "EI", LF: "EI", EI: "EI",
  ST: "DC", CS: "DC", LS: "DC", RS: "DC", DC: "DC",
  CF: "SD", SD: "SD",
};

export function toPosCode(raw: string): PosCode | null {
  const key = String(raw ?? "").trim().toUpperCase();
  if (!key) return null;
  return ALIASES[key] ?? null;
}

/**
 * Demarcaciones "casi idénticas": se permiten al alinear (sin ellas muchos
 * huecos serían imposibles de cubrir), pero no cuentan como encaje perfecto.
 */
const COMPATIBLE: Partial<Record<PosCode, PosCode[]>> = {
  DC: ["SD"],
  SD: ["DC"],
  LD: ["CAD"],
  CAD: ["LD"],
  LI: ["CAI"],
  CAI: ["LI"],
  MC: ["MCD", "MCO"],
  MCD: ["MC"],
  MCO: ["MC"],
};

/** Parsea el campo "Alternative positions" del dataset: "['RW', 'ST']". */
export function parseAlternativePositions(raw: unknown): PosCode[] {
  if (!raw) return [];
  const text = String(raw);
  const out: PosCode[] = [];
  for (const match of text.matchAll(/[A-Za-z]+/g)) {
    const code = toPosCode(match[0]);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Lista completa de demarcaciones de un jugador (principal + alternativas). */
export function buildPositions(main: unknown, alternatives: unknown): PosCode[] {
  const list: PosCode[] = [];
  const mainCode = toPosCode(String(main ?? ""));
  if (mainCode) list.push(mainCode);
  for (const code of parseAlternativePositions(alternatives)) {
    if (!list.includes(code)) list.push(code);
  }
  return list;
}

/** Demarcaciones de un jugador ya construido, con fallback razonable. */
export function playerPosCodes(player: {
  positions?: PosCode[] | string[];
  position?: string;
}): PosCode[] {
  const listed = (player.positions ?? []) as string[];
  const parsed = listed.map((p) => toPosCode(p)).filter((p): p is PosCode => !!p);
  if (parsed.length > 0) return parsed;
  const fallback = toPosCode(player.position ?? "");
  if (fallback) return [fallback];
  // Grupos legados (DEF/MID/FWD) sin demarcación concreta.
  const legacy = String(player.position ?? "").toUpperCase();
  if (legacy === "DEF") return ["DFC"];
  if (legacy === "MID") return ["MC"];
  if (legacy === "FWD") return ["DC"];
  return [];
}

/** Etiqueta corta para UI: "MD · ED". */
export function formatPositions(codes: PosCode[]): string {
  return codes.length ? codes.join(" · ") : "—";
}

/** ¿Encaja exactamente el jugador en la demarcación pedida? */
export function isNaturalFor(codes: PosCode[], slot: PosCode): boolean {
  return codes.includes(slot);
}

/** ¿Puede el jugador ocupar el hueco (exacto o demarcación casi idéntica)? */
export function canPlayPosition(codes: PosCode[], slot: PosCode): boolean {
  if (codes.includes(slot)) return true;
  const compat = COMPATIBLE[slot] ?? [];
  return codes.some((c) => compat.includes(c));
}

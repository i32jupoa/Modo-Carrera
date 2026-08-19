// Perfil deportivo de un equipo derivado de sus atributos y plantilla.
// Se usa en /teams para mostrar la táctica estimada de la IA y su 11 tipo,
// reutilizando los mismos conceptos que el motor de partido (teamTactics.ts).

import type { Team } from "@/data/teams";
import type { FcPlayer } from "@/store/playersStore";
import type { DefenseLine, PlayStyle, Pressure } from "@/lib/teamTactics";
import { ALL_FORMATIONS, FORMATION_COORDINATES, type FormationName } from "@/lib/formations";
import { buildPositions, canPlayPosition, type PosCode } from "@/lib/positions";

/* ------------------------------------------------------- formaciones por estilo */

/** Formaciones típicas según el estilo de juego del equipo */
const FORMATIONS_BY_STYLE: Record<PlayStyle, FormationName[]> = {
  offensive: [
    "Táctica 4-3-3",
    "Táctica 4-2-3-1 (2)",
    "Táctica 4-2-3-1 con 3 MCO",
    "Táctica 4-3-3 con mediocentro ofensivo",
  ],
  balanced: [
    "Táctica 4-3-3",
    "Táctica 4-2-3-1 (2)",
    "Táctica 4-3-3 con mediocentro defensivo",
    "Táctica 4-4-2",
    "Táctica 4-1-4-1",
  ],
  defensive: [
    "Táctica 5-3-2",
    "Táctica 4-5-1",
    "Táctica 5-2-2-1",
    "Táctica 5-2-1-2",
    "Táctica 4-4-2",
  ],
};

/** Mapeo de estilos de juego específicos por equipo (del CSV team_play_styles.csv) */
const TEAM_STYLES: Record<string, PlayStyle> = {
  // España - La Liga
  "Athletic Club": "offensive",
  "Atlético de Madrid": "defensive",
  "CA Osasuna": "defensive",
  "CD Leganés": "defensive",
  Celta: "offensive",
  "Cádiz CF": "defensive",
  "D. Alavés": "defensive",
  "FC Barcelona": "offensive",
  "Getafe CF": "defensive",
  "Girona FC": "offensive",
  "R. Valladolid CF": "balanced",
  "RCD Espanyol": "balanced",
  "RCD Mallorca": "defensive",
  "Rayo Vallecano": "offensive",
  "Real Betis": "offensive",
  "Real Madrid": "offensive",
  "Real Sociedad": "offensive",
  "Sevilla FC": "offensive",
  "UD Las Palmas": "balanced",
  "Valencia CF": "offensive",
  "Villarreal CF": "offensive",
  // Italia - Serie A
  "AS Roma": "offensive",
  "Bergamo Calcio": "offensive",
  Bologna: "offensive",
  Cagliari: "defensive",
  Como: "offensive",
  Empoli: "defensive",
  Fiorentina: "offensive",
  Genoa: "defensive",
  "Hellas Verona": "defensive",
  Juventus: "offensive",
  Latium: "offensive",
  Lecce: "defensive",
  "Milano FC": "offensive",
  Monza: "balanced",
  Parma: "offensive",
  Pisa: "balanced",
  "SSC Napoli": "offensive",
  Torino: "defensive",
  Udinese: "defensive",
  Venezia: "defensive",
  // Italia - Serie B
  "Lombardia FC": "defensive",
  // Alemania - Bundesliga
  "Borussia Dortmund": "offensive",
  "FC Bayern München": "offensive",
  Frankfurt: "offensive",
  Leverkusen: "offensive",
  "M'gladbach": "offensive",
  "RB Leipzig": "offensive",
  "SC Freiburg": "offensive",
  "SV Werder Bremen": "offensive",
  "TSG Hoffenheim": "offensive",
  "VfB Stuttgart": "offensive",
  // Francia - Ligue 1
  "AS Monaco": "offensive",
  "LOSC Lille": "offensive",
  OL: "offensive",
  OM: "offensive",
  "Paris SG": "offensive",
  "RC Lens": "offensive",
  "Stade Brestois 29": "offensive",
  "Stade Rennais FC": "offensive",
  "Toulouse FC": "offensive",
  // Inglaterra - Premier League
  Arsenal: "offensive",
  "Aston Villa": "offensive",
  Brentford: "offensive",
  Brighton: "offensive",
  Chelsea: "offensive",
  Fulham: "offensive",
  Ipswich: "offensive",
  Liverpool: "offensive",
  "Man Utd": "offensive",
  "Manchester City": "offensive",
  Spurs: "offensive",
  "West Ham": "offensive",
  Wolves: "offensive",
  // Países Bajos - Eredivisie
  AZ: "offensive",
  Ajax: "offensive",
  "FC Twente": "offensive",
  "FC Utrecht": "offensive",
  Feyenoord: "offensive",
  "N.E.C. Nijmegen": "offensive",
  PSV: "offensive",
  // Portugal - Primeira Liga
  "FC Famalicão": "offensive",
  "FC Porto": "offensive",
  "SC Braga": "offensive",
  "SL Benfica": "offensive",
  "Sporting CP": "offensive",
  "Vitória SC": "offensive",
};

/** Presión y línea defensiva según el estilo de juego */
const TACTICS_BY_STYLE: Record<PlayStyle, { pressure: Pressure; defenseLine: DefenseLine }> = {
  offensive: { pressure: "high", defenseLine: "high" },
  balanced: { pressure: "medium", defenseLine: "medium" },
  defensive: { pressure: "low", defenseLine: "low" },
};

/**
 * Obtiene el estilo de juego específico del equipo del CSV si existe,
 * si no usa estimateTactics. También devuelve presión y línea defensiva
 * basadas en el estilo.
 */
export function getTeamStyle(team: Team): {
  style: PlayStyle;
  pressure: Pressure;
  defenseLine: DefenseLine;
} {
  const style = TEAM_STYLES[team.name] || estimateTactics(team).style;
  const { pressure, defenseLine } = TACTICS_BY_STYLE[style];
  return { style, pressure, defenseLine };
}

/**
 * Catálogo de formaciones típicas de un estilo de juego (equilibrado,
 * defensivo u ofensivo). Es el mismo catálogo que usa el 11 ideal de
 * /equipos, para que el motor de partido (jornadas, Champions, Copa)
 * elija tácticas coherentes con la identidad real del equipo en vez de
 * sortear entre las 24 formaciones sin criterio.
 */
export function formationsForStyle(style: PlayStyle): FormationName[] {
  return FORMATIONS_BY_STYLE[style];
}

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
    style === "offensive"
      ? ov >= 84
        ? "4-3-3"
        : "4-2-3-1"
      : style === "defensive"
        ? "4-4-2"
        : "4-2-3-1";

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
    const group: PosGroup =
      role === "GK" ? "POR" : role === "DEF" ? "DEF" : role === "MID" ? "MED" : "DEL";
    return { label: role, natural: [], adaptable: [], group };
  });
}

export type ElevenSlot = { label: string; player: FcPlayer | null; natural: boolean };

/**
 * 11 tipo estimado: para cada hueco de la formación coge al jugador libre
 * con mejor media que encaje usando posiciones principales y secundarias.
 * Prioriza la posición principal sobre la secundaria cuando hay empate de OVR.
 * Ignora lesiones para mostrar el 11 ideal del equipo.
 */
export function estimatedEleven(formation: string, squad: FcPlayer[]): ElevenSlot[] {
  const slots = formationSlots(formation);
  if (!slots.length) return [];
  const used = new Set<number>();

  // Convertir etiquetas de slot a PosCode del sistema de posiciones
  const slotToPosCode: Record<string, PosCode> = {
    POR: "GK",
    DFC: "DFC",
    LI: "LI",
    LD: "LD",
    CAI: "CAI",
    CAD: "CAD",
    MCD: "MCD",
    MC: "MC",
    MCO: "MCO",
    MI: "MI",
    MD: "MD",
    EI: "EI",
    ED: "ED",
    DC: "DC",
    SD: "SD",
  };

  return slots.map((slot) => {
    const requiredPos = slotToPosCode[slot.label];
    if (!requiredPos) {
      // Fallback para slots no mapeados
      const pool = squad.slice().sort((a, b) => b.OVR - a.OVR);
      const pick = pool.find((p) => !used.has(p.ID)) ?? null;
      if (pick) used.add(pick.ID);
      return { label: slot.label, player: pick, natural: false };
    }

    // Obtener jugadores que pueden jugar en la posición requerida
    const candidates = squad
      .filter((p) => !used.has(p.ID))
      .map((p) => {
        const codes = buildPositions(p.Position, p["Alternative positions"]);
        const isPrimary = codes[0] === requiredPos; // La primera posición es la principal
        const canPlay = codes.includes(requiredPos) || canPlayPosition(codes, requiredPos);
        return { player: p, isPrimary, canPlay };
      })
      .filter((c) => c.canPlay);

    if (candidates.length === 0) {
      return { label: slot.label, player: null, natural: false };
    }

    // Ordenar: primero por OVR, luego por si es posición principal
    candidates.sort((a, b) => {
      if (b.player.OVR !== a.player.OVR) {
        return b.player.OVR - a.player.OVR;
      }
      // Si mismo OVR, priorizar posición principal
      return (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
    });

    const pick = candidates[0].player;
    used.add(pick.ID);
    return { label: slot.label, player: pick, natural: candidates[0].isPrimary };
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

/** Equipos cuya identidad defensiva prioriza una línea de cinco. */
export const FIVE_DEFENDER_TEAMS = new Set(["Getafe CF", "Lombardia FC"]);

/**
 * Elige, entre las formaciones típicas del estilo del equipo, la que mejor
 * encaja con la plantilla (mejor media en su sitio natural).
 * Usa el estilo específico del equipo del CSV si está disponible, si no usa estimateTactics.
 */
export function bestFormationForSquad(squad: FcPlayer[], team: Team): FormationName {
  // Usar estilo específico del CSV si existe, si no usar estimateTactics
  const style = TEAM_STYLES[team.name] || estimateTactics(team).style;
  const candidateFormations = FORMATIONS_BY_STYLE[style];

  let best: FormationName = candidateFormations[0] || "Táctica 4-2-3-1 (2)";
  let bestScore = -Infinity;

  for (const formation of candidateFormations) {
    const fiveBackBonus = FIVE_DEFENDER_TEAMS.has(team.name) && formation.includes("5-") ? 12 : 0;
    const score = elevenScore(estimatedEleven(formation, squad)) + fiveBackBonus;
    if (score > bestScore) {
      bestScore = score;
      best = formation;
    }
  }
  return best;
}

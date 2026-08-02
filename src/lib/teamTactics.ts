// Lightweight per-team tactics persisted in localStorage.
// Kept out of the SaveGame store on purpose: pure UI/tactics state.

export type PlayStyle = "defensive" | "balanced" | "offensive";
export type Pressure = "low" | "medium" | "high";
export type DefenseLine = "low" | "medium" | "high";

export type TeamTactics = {
  style: PlayStyle;
  pressure: Pressure;
  defenseLine: DefenseLine;
  captainId: string | null;
  penaltyTakerId: string | null;
  freekickTakerId: string | null;
  cornerTakerId: string | null;
};

const STORAGE_PREFIX = "modo-carrera:tactics:";

export const DEFAULT_TACTICS: TeamTactics = {
  style: "balanced",
  pressure: "medium",
  defenseLine: "medium",
  captainId: null,
  penaltyTakerId: null,
  freekickTakerId: null,
  cornerTakerId: null,
};

export function loadTactics(teamId: string): TeamTactics {
  if (typeof window === "undefined") return { ...DEFAULT_TACTICS };
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + teamId);
    if (!raw) return { ...DEFAULT_TACTICS };
    return { ...DEFAULT_TACTICS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_TACTICS };
  }
}

export function saveTactics(teamId: string, tactics: TeamTactics): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + teamId, JSON.stringify(tactics));
  } catch {
    /* ignore quota errors */
  }
}
// ---------------------------------------------------------------- modifiers
// Everything the match engine needs to know about a team's tactics, derived
// from what the user configures in "Editar alineación / Tácticas".

export type TacticsModifiers = {
  /** Multiplier applied to the team's attacking output. */
  attack: number;
  /** Multiplier applied to the team's defensive solidity. */
  defense: number;
  /** Multiplier applied to per-minute energy drain. */
  stamina: number;
  /** Multiplier applied to card/foul risk. */
  aggression: number;
};

export function tacticsModifiers(t?: Partial<TeamTactics> | null): TacticsModifiers {
  const style = t?.style ?? "balanced";
  const pressure = t?.pressure ?? "medium";
  const line = t?.defenseLine ?? "medium";

  let attack = 1;
  let defense = 1;
  let stamina = 1;
  let aggression = 1;

  // Play style: the main lever. Offensive creates more chances but concedes
  // more; defensive is the mirror image.
  if (style === "offensive") {
    attack *= 1.14;
    defense *= 0.9;
    stamina *= 1.1;
  } else if (style === "defensive") {
    attack *= 0.86;
    defense *= 1.13;
    stamina *= 0.92;
  }

  // Pressure: high press wins the ball higher (more chances) but burns energy
  // and produces more fouls.
  if (pressure === "high") {
    attack *= 1.07;
    defense *= 1.04;
    stamina *= 1.18;
    aggression *= 1.25;
  } else if (pressure === "low") {
    attack *= 0.95;
    defense *= 0.98;
    stamina *= 0.86;
    aggression *= 0.85;
  }

  // Defensive line: high line compresses the pitch but is vulnerable to balls
  // in behind; low line sits deep and concedes fewer clear chances.
  if (line === "high") {
    attack *= 1.05;
    defense *= 0.94;
    stamina *= 1.05;
  } else if (line === "low") {
    attack *= 0.96;
    defense *= 1.07;
    stamina *= 0.95;
  }

  return { attack, defense, stamina, aggression };
}

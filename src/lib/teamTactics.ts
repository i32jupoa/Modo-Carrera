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
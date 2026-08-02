// Live match state: everything needed to freeze a match mid-play, let the user
// edit the lineup / tactics, and resume at the exact same minute.

export type LivePhase =
  | "playing"
  | "halftime"
  | "et_break"
  | "et_playing"
  | "et_halftime";

export type LiveSub = {
  minute: number;
  outId: string;
  outName: string;
  inId: string;
  inName: string;
};

export type LiveMatchState = {
  v: number;
  fixtureId: string;
  minute: number;
  phase: LivePhase;
  homeScore: number;
  awayScore: number;
  /** Full precomputed simulation result so the replay can continue after a reload. */
  result: any;
  feed: any[];
  cardFeed: any[];
  highlightFeed: any[];
  /** My team's current XI (ids, in formation order) and bench. */
  lineup: string[];
  bench: string[];
  formation: string;
  /** Players that left the pitch and cannot come back (red card / injury with no sub left). */
  gone: string[];
  subsUsed: number;
  windowsUsed: number;
  subs: LiveSub[];
  /** 0-100 energy per player id. */
  stamina: Record<string, number>;
  isExtraTime: boolean;
  matchType: "LEAGUE" | "CUP" | "UCL";
  cupRound?: string;
  handledInjuries: string[];
};

export const LIVE_VERSION = 3;
const KEY = "mc:live-match";

export function saveLive(state: LiveMatchState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...state, v: LIVE_VERSION }));
  } catch {
    /* ignore quota */
  }
}

export function loadLive(fixtureId?: string): LiveMatchState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const st = JSON.parse(raw) as LiveMatchState;
    if (st.v !== LIVE_VERSION) return null;
    if (fixtureId && st.fixtureId !== fixtureId) return null;
    return st;
  } catch {
    return null;
  }
}

export function clearLive() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- subs rules

/** 5 substitutions in 3 windows; extra time grants one more of each. */
export function subLimits(isExtraTime: boolean) {
  return {
    maxSubs: isExtraTime ? 6 : 5,
    maxWindows: isExtraTime ? 4 : 3,
  };
}

/** Half-time (and the extra-time breaks) do not consume a window. */
export function isFreeWindow(phase: LivePhase) {
  return phase === "halftime" || phase === "et_break" || phase === "et_halftime";
}

export type SubCheck = { ok: boolean; reason?: string };

export function canSubstitute(
  state: Pick<LiveMatchState, "subsUsed" | "windowsUsed" | "isExtraTime" | "phase">,
  count = 1,
): SubCheck {
  const { maxSubs, maxWindows } = subLimits(state.isExtraTime);
  if (state.subsUsed + count > maxSubs) {
    return { ok: false, reason: `Sin cambios disponibles (${state.subsUsed}/${maxSubs})` };
  }
  if (!isFreeWindow(state.phase) && state.windowsUsed >= maxWindows) {
    return { ok: false, reason: `Sin ventanas de cambio disponibles (${state.windowsUsed}/${maxWindows})` };
  }
  return { ok: true };
}

// ------------------------------------------------------------------ stamina

export const STAMINA_START = 100;

function baseDrain(position: string): number {
  const p = (position || "").toUpperCase();
  if (["GK", "POR"].includes(p)) return 0.18;
  if (["CB", "DFC", "RB", "LB", "LD", "LI", "DEF"].includes(p)) return 0.55;
  if (["CDM", "MCD", "CM", "MC", "CAM", "MCO", "RM", "LM", "MD", "MI", "MID"].includes(p)) return 0.78;
  return 0.66;
}

/** Energy lost in one minute, modulated by the team pressure setting. */
export function drainPerMinute(position: string, pressure: "low" | "medium" | "high"): number {
  const mult = pressure === "high" ? 1.2 : pressure === "low" ? 0.85 : 1;
  return baseDrain(position) * mult;
}

/** Effective rating penalty caused by fatigue (0 when fresh). */
export function fatiguePenalty(stamina: number): number {
  if (stamina >= 70) return 0;
  if (stamina >= 50) return (70 - stamina) * 0.08;
  return 1.6 + (50 - stamina) * 0.16;
}

/** Extra injury-risk multiplier caused by fatigue. */
export function fatigueInjuryRisk(stamina: number): number {
  if (stamina >= 65) return 1;
  if (stamina >= 45) return 1.4;
  if (stamina >= 30) return 2;
  return 2.8;
}

export function staminaTone(stamina: number): "ok" | "warn" | "danger" {
  if (stamina >= 65) return "ok";
  if (stamina >= 40) return "warn";
  return "danger";
}

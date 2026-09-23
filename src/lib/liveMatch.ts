// Live match state: everything needed to freeze a match mid-play, let the user
// edit the lineup / tactics, and resume at the exact same minute.

export type LivePhase = "playing" | "halftime" | "et_break" | "et_playing" | "et_halftime";

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
  /** Injuries that forced a lineup edit: playerId -> formation slot index that must be filled by a bench player. */
  pendingForcedInjurySlots?: Record<string, number>;
  /** Formation slot indexes occupied by red-card holes. The red-card player stays
   * blocked, while the hole can be moved by rearranging players already on the pitch. */
  goneSlotIndexes?: Record<string, number>;
  subsUsed: number;
  windowsUsed: number;
  subs: LiveSub[];
  /** 0-100 energy per player id. */
  stamina: Record<string, number>;
  isExtraTime: boolean;
  matchType: "LEAGUE" | "CUP" | "UCL";
  cupRound?: string;
  handledInjuries: string[];
  /** Live match presentation/controller state. Optional for v3 saves. */
  momentum?: number;
  momentumHistory?: Array<{ minute: number; value: number }>;
  managerEffects?: any;
  narrative?: any[];
  keyMoments?: any[];
  /** Exact timeline already resolved on the pitch. Kept separate from the future pre-simulated timeline. */
  playedEvents?: any[];
  playedCards?: any[];
  playedHighlights?: any[];
  /** Rival substitutions already executed, so resume/fast-forward never repeats them. */
  opponentSubsDone?: any[];
  /** Small tactical bias carried by the live layer into upcoming events. */
  outcomeBias?: number;
  scene?: {
    kind: "prelude" | "resolution" | "var" | "penalty_intro";
    moment?: any;
    resolution?: any;
    source?: any;
  } | null;
};

export const LIVE_VERSION = 8;
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
    if (st.v !== LIVE_VERSION && st.v !== 5 && st.v !== 4 && st.v !== 3) return null;
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
    return {
      ok: false,
      reason: `Sin ventanas de cambio disponibles (${state.windowsUsed}/${maxWindows})`,
    };
  }
  return { ok: true };
}

// ------------------------------------------------------------------ stamina

export const STAMINA_START = 100;

function baseDrain(position: string): number {
  const p = (position || "").toUpperCase();
  // Calibrated so a full 90' at medium pressure costs roughly 25-35 energy
  // instead of draining a player almost completely.
  if (["GK", "POR"].includes(p)) return 0.08;
  if (["CB", "DFC", "RB", "LB", "LD", "LI", "DEF"].includes(p)) return 0.27;
  if (["CDM", "MCD", "CM", "MC", "CAM", "MCO", "RM", "LM", "MD", "MI", "MID"].includes(p))
    return 0.38;
  return 0.32;
}

/**
 * Energy lost in one minute. `staminaMult` comes from `tacticsModifiers()` so
 * the play style / pressure / defensive line chosen in the tactics screen has
 * a direct impact on how quickly the team tires.
 */
export function drainPerMinute(
  position: string,
  pressure: "low" | "medium" | "high",
  staminaMult = 1,
): number {
  const mult = pressure === "high" ? 1.12 : pressure === "low" ? 0.9 : 1;
  return baseDrain(position) * mult * staminaMult;
}

/** Effective rating penalty caused by fatigue (0 when fresh). */
export function fatiguePenalty(stamina: number): number {
  if (stamina >= 70) return 0;
  if (stamina >= 50) return (70 - stamina) * 0.08;
  return 1.6 + (50 - stamina) * 0.16;
}

/** Extra injury-risk multiplier caused by fatigue. */
/** Multiplicador de rendimiento puramente físico. La forma del jugador no interviene. */
export function staminaPerformanceMultiplier(stamina: number): number {
  const e = Math.max(0, Math.min(100, Number(stamina) || 0));
  if (e >= 90) return 0.97 + (e - 90) * 0.003;
  if (e >= 80) return 0.94 + (e - 80) * 0.003;
  if (e >= 70) return 0.89 + (e - 70) * 0.005;
  if (e >= 60) return 0.82 + (e - 60) * 0.007;
  if (e >= 50) return 0.73 + (e - 50) * 0.009;
  if (e >= 40) return 0.62 + (e - 40) * 0.011;
  if (e >= 30) return 0.50 + (e - 30) * 0.012;
  if (e >= 20) return 0.36 + (e - 20) * 0.014;
  if (e >= 10) return 0.25 + (e - 10) * 0.011;
  return 0.15 + e * 0.01;
}

/** Recuperación determinista diaria: cada día de descanso suma exactamente 5 de energía, con tope en 100. */
export function recoverStamina(stamina: number, days: number): number {
  let value = Math.max(0, Math.min(100, Number(stamina) || 0));
  const safeDays = Math.max(0, Math.floor(Number(days) || 0));

  for (let i = 0; i < safeDays && value < 100; i++) {
    value = Math.min(100, value + 5);
  }

  return Math.round(value);
}

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

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
  /** Rival live state, persisted so returning from the lineup editor never regenerates a European opponent. */
  opponentXI?: any[];
  opponentBench?: any[];
  opponentFormation?: string;
  opponentPlan?: { minute: number; outId: string; inId: string }[];
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

function safeArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function safeIdList(value: any): string[] {
  return safeArray(value)
    .map((item: any) => (typeof item === "string" ? item : item?.id))
    .filter(Boolean)
    .map(String);
}

function sanitizeLoadedLiveState(raw: any): LiveMatchState {
  const result = raw?.result && typeof raw.result === "object" ? { ...raw.result } : {};

  result.events = safeArray(result.events);
  result.cards = safeArray(result.cards);
  result.highlights = safeArray(result.highlights);
  result.substitutions = safeArray(result.substitutions);
  result.injuries = safeArray(result.injuries);
  result.homeLineup = safeArray(result.homeLineup);
  result.awayLineup = safeArray(result.awayLineup);

  if (result.extraTime && typeof result.extraTime === "object") {
    result.extraTime = {
      ...result.extraTime,
      events: safeArray(result.extraTime.events),
      substitutions: safeArray(result.extraTime.substitutions),
    };
  }

  if (result.penalties && typeof result.penalties === "object") {
    result.penalties = {
      ...result.penalties,
      shootout: safeArray(result.penalties.shootout),
    };
  }

  const lineup = safeIdList(raw?.lineup).slice(0, 11);
  const bench = safeIdList(raw?.bench)
    .filter((id: string) => !lineup.includes(id))
    .slice(0, 12);

  const stamina =
    raw?.stamina && typeof raw.stamina === "object" && !Array.isArray(raw.stamina)
      ? raw.stamina
      : {};

  return {
    ...raw,
    v: Number(raw?.v) || LIVE_VERSION,
    fixtureId: String(raw?.fixtureId ?? ""),
    minute: Math.max(0, Number(raw?.minute) || 0),
    phase: raw?.phase || "playing",
    homeScore: Number(raw?.homeScore) || 0,
    awayScore: Number(raw?.awayScore) || 0,
    result,
    feed: safeArray(raw?.feed),
    cardFeed: safeArray(raw?.cardFeed),
    highlightFeed: safeArray(raw?.highlightFeed),
    lineup,
    bench,
    formation: typeof raw?.formation === "string" ? raw.formation : "Táctica 4-4-2",
    gone: safeIdList(raw?.gone),
    goneSlotIndexes:
      raw?.goneSlotIndexes && typeof raw.goneSlotIndexes === "object"
        ? raw.goneSlotIndexes
        : {},
    pendingForcedInjurySlots:
      raw?.pendingForcedInjurySlots && typeof raw.pendingForcedInjurySlots === "object"
        ? raw.pendingForcedInjurySlots
        : {},
    subsUsed: Number(raw?.subsUsed) || 0,
    windowsUsed: Number(raw?.windowsUsed) || 0,
    subs: safeArray(raw?.subs),
    stamina,
    isExtraTime: !!raw?.isExtraTime,
    matchType: raw?.matchType === "CUP" ? "CUP" : raw?.matchType === "UCL" ? "UCL" : "LEAGUE",
    cupRound: raw?.cupRound,
    handledInjuries: safeIdList(raw?.handledInjuries),
    momentum: Number.isFinite(Number(raw?.momentum)) ? Number(raw.momentum) : 50,
    momentumHistory: safeArray(raw?.momentumHistory),
    managerEffects:
      raw?.managerEffects && typeof raw.managerEffects === "object"
        ? raw.managerEffects
        : undefined,
    narrative: safeArray(raw?.narrative),
    keyMoments: safeArray(raw?.keyMoments),
    playedEvents: safeArray(raw?.playedEvents),
    playedCards: safeArray(raw?.playedCards),
    playedHighlights: safeArray(raw?.playedHighlights),
    opponentXI: safeArray(raw?.opponentXI),
    opponentBench: safeArray(raw?.opponentBench),
    opponentFormation:
      typeof raw?.opponentFormation === "string" ? raw.opponentFormation : "Táctica 4-4-2",
    opponentPlan: safeArray(raw?.opponentPlan),
    opponentSubsDone: safeArray(raw?.opponentSubsDone),
    outcomeBias: Number.isFinite(Number(raw?.outcomeBias)) ? Number(raw.outcomeBias) : 0,
    scene: raw?.scene && typeof raw.scene === "object" ? raw.scene : null,
  } as LiveMatchState;
}

export function loadLive(fixtureId?: string): LiveMatchState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    if (parsed?.v !== LIVE_VERSION && parsed?.v !== 5 && parsed?.v !== 4 && parsed?.v !== 3) return null;
    if (fixtureId && parsed.fixtureId !== fixtureId) return null;
    return sanitizeLoadedLiveState(parsed);
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

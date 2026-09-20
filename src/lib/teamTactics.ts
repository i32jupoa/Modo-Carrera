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

export type TacticPlan = {
  id: string;
  name: string;
  formation: string;
  lineup: string[];
  substitutes: string[];
  tactics: TeamTactics;
};

export type TacticPlanState = {
  activeId: string;
  plans: TacticPlan[];
};

const STORAGE_PREFIX = "modo-carrera:tactics:";
const PLANS_STORAGE_PREFIX = "modo-carrera:tactic-plans:";
const CURRENT_SAVE_ID_KEY = "fcsim:save:current";

function activeCareerId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CURRENT_SAVE_ID_KEY);
}

function plansStorageKey(teamId: string): string {
  const careerId = activeCareerId();
  return careerId
    ? `${PLANS_STORAGE_PREFIX}${careerId}:${teamId}`
    : `${PLANS_STORAGE_PREFIX}${teamId}`;
}

function tacticsStorageKey(teamId: string): string {
  const careerId = activeCareerId();
  return careerId
    ? `${STORAGE_PREFIX}${careerId}:${teamId}`
    : `${STORAGE_PREFIX}${teamId}`;
}

export const DEFAULT_TACTICS: TeamTactics = {
  style: "balanced",
  pressure: "medium",
  defenseLine: "medium",
  captainId: null,
  penaltyTakerId: null,
  freekickTakerId: null,
  cornerTakerId: null,
};

function normalizeTactics(input?: Partial<TeamTactics> | null): TeamTactics {
  return { ...DEFAULT_TACTICS, ...(input ?? {}) };
}

export function loadTacticPlans(teamId: string): TacticPlanState | null {
  if (typeof window === "undefined" || !teamId) return null;

  try {
    const rawPlans = window.localStorage.getItem(plansStorageKey(teamId));
    if (rawPlans) {
      const parsed = JSON.parse(rawPlans) as Partial<TacticPlanState>;
      const plans = Array.isArray(parsed.plans)
        ? parsed.plans
            .filter((plan): plan is TacticPlan => !!plan && typeof plan.id === "string")
            .slice(0, 3)
            .map((plan) => ({
              id: plan.id,
              name: plan.name || plan.id,
              formation: plan.formation || "Táctica 4-3-3",
              lineup: Array.isArray(plan.lineup) ? plan.lineup.filter(Boolean) : [],
              substitutes: Array.isArray(plan.substitutes)
                ? plan.substitutes.filter(Boolean).slice(0, 12)
                : [],
              tactics: normalizeTactics(plan.tactics),
            }))
        : [];

      if (plans.length > 0) {
        const activeId = plans.some((plan) => plan.id === parsed.activeId)
          ? (parsed.activeId as string)
          : plans[0].id;
        return { activeId, plans };
      }
    }

    // La clave antigua basada únicamente en el equipo solo puede usarse cuando
    // no existe una partida activa. En una carrera guardada nunca la leemos,
    // porque podría proceder de otra carrera con el mismo club.
    if (activeCareerId()) return null;

    const legacyRaw = window.localStorage.getItem(STORAGE_PREFIX + teamId);
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
    if (legacy) {
      return {
        activeId: "plan-a",
        plans: [
          {
            id: "plan-a",
            name: "Plan A",
            formation: "Táctica 4-3-3",
            lineup: [],
            substitutes: [],
            tactics: normalizeTactics(legacy),
          },
        ],
      };
    }
  } catch {
    /* ignore malformed/legacy localStorage data */
  }

  return null;
}

export function saveTacticPlans(teamId: string, state: TacticPlanState): void {
  if (typeof window === "undefined" || !teamId) return;
  try {
    const plans = state.plans.slice(0, 3).map((plan) => ({
      ...plan,
      lineup: plan.lineup.filter(Boolean),
      substitutes: plan.substitutes.filter(Boolean).slice(0, 12),
      tactics: normalizeTactics(plan.tactics),
    }));
    const activeId = plans.some((plan) => plan.id === state.activeId)
      ? state.activeId
      : plans[0]?.id ?? "plan-a";
    const normalized = { activeId, plans };
    window.localStorage.setItem(plansStorageKey(teamId), JSON.stringify(normalized));

    // Keep the legacy key synchronized so older surfaces that only read
    // loadTactics() continue to work without knowing about tactic plans.
    const active = plans.find((plan) => plan.id === activeId);
    if (active) {
      window.localStorage.setItem(tacticsStorageKey(teamId), JSON.stringify(active.tactics));
    }
  } catch {
    /* ignore quota errors */
  }
}

export function createTacticPlan(input: Partial<TacticPlan> & Pick<TacticPlan, "id" | "name">): TacticPlan {
  return {
    id: input.id,
    name: input.name,
    formation: input.formation ?? "Táctica 4-3-3",
    lineup: input.lineup ? [...input.lineup] : [],
    substitutes: input.substitutes ? input.substitutes.filter(Boolean).slice(0, 12) : [],
    tactics: normalizeTactics(input.tactics),
  };
}

export function loadTactics(teamId: string): TeamTactics {
  const state = loadTacticPlans(teamId);
  const active = state?.plans.find((plan) => plan.id === state.activeId);
  if (active) return { ...active.tactics };

  if (typeof window === "undefined") return { ...DEFAULT_TACTICS };
  try {
    const raw = window.localStorage.getItem(tacticsStorageKey(teamId));
    if (!raw) return { ...DEFAULT_TACTICS };
    return normalizeTactics(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TACTICS };
  }
}

export function saveTactics(teamId: string, tactics: TeamTactics): void {
  const state = loadTacticPlans(teamId);
  if (state && state.plans.length > 0) {
    saveTacticPlans(teamId, {
      ...state,
      plans: state.plans.map((plan) =>
        plan.id === state.activeId ? { ...plan, tactics: normalizeTactics(tactics) } : plan,
      ),
    });
    return;
  }

  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tacticsStorageKey(teamId), JSON.stringify(normalizeTactics(tactics)));
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

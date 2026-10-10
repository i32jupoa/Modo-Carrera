// Lightweight per-team tactics persisted in localStorage.
// Kept out of the SaveGame store on purpose: pure UI/tactics state.

export type PlayStyle = "defensive" | "balanced" | "offensive";
export type Pressure = "low" | "medium" | "high";
export type DefenseLine = "low" | "medium" | "high";
export type Tempo = "slow" | "normal" | "high";
export type TeamWidth = "narrow" | "normal" | "wide";
export type PassingStyle = "short" | "mixed" | "direct";
export type TimeWasting = "low" | "normal" | "high";
export type MarkingStyle = "zonal" | "man" | "intense";
export type AggressionLevel = "low" | "normal" | "high";

export type TeamTactics = {
  style: PlayStyle;
  pressure: Pressure;
  defenseLine: DefenseLine;
  tempo: Tempo;
  width: TeamWidth;
  attackingWidth: TeamWidth;
  passingStyle: PassingStyle;
  counterAttack: boolean;
  timeWasting: TimeWasting;
  marking: MarkingStyle;
  aggressionLevel: AggressionLevel;
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
  tempo: "normal",
  width: "normal",
  attackingWidth: "normal",
  passingStyle: "mixed",
  counterAttack: false,
  timeWasting: "normal",
  marking: "zonal",
  aggressionLevel: "normal",
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

const TACTICS_CACHE = new Map<string, TeamTactics>();

export function loadTactics(teamId: string): TeamTactics {
  const cached = TACTICS_CACHE.get(teamId);
  if (cached) return { ...cached };

  const state = loadTacticPlans(teamId);
  const active = state?.plans.find((plan) => plan.id === state.activeId);
  if (active) {
    const tactics = { ...active.tactics };
    TACTICS_CACHE.set(teamId, tactics);
    return { ...tactics };
  }

  if (typeof window === "undefined") {
    TACTICS_CACHE.set(teamId, { ...DEFAULT_TACTICS });
    return { ...DEFAULT_TACTICS };
  }
  try {
    const raw = window.localStorage.getItem(tacticsStorageKey(teamId));
    if (!raw) {
      TACTICS_CACHE.set(teamId, { ...DEFAULT_TACTICS });
      return { ...DEFAULT_TACTICS };
    }
    const tactics = normalizeTactics(JSON.parse(raw));
    TACTICS_CACHE.set(teamId, tactics);
    return { ...tactics };
  } catch {
    TACTICS_CACHE.set(teamId, { ...DEFAULT_TACTICS });
    return { ...DEFAULT_TACTICS };
  }
}

export function saveTactics(teamId: string, tactics: TeamTactics): void {
  const normalized = normalizeTactics(tactics);
  TACTICS_CACHE.set(teamId, normalized);
  const state = loadTacticPlans(teamId);
  if (state && state.plans.length > 0) {
    saveTacticPlans(teamId, {
      ...state,
      plans: state.plans.map((plan) =>
        plan.id === state.activeId ? { ...plan, tactics: normalized } : plan,
      ),
    });
    return;
  }

  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tacticsStorageKey(teamId), JSON.stringify(normalized));
  } catch {
    /* ignore quota errors */
  }
}
// ---------------------------------------------------------------- modifiers
// Everything the match engine needs to know about a team's tactics, derived
// from what the user configures in "Editar alineación / Tácticas".

export type TacticsModifiers = {
  /** Multiplicadores de rendimiento ofensivo, defensivo y desgaste. */
  attack: number;
  defense: number;
  stamina: number;
  aggression: number;
  possession: number;
  chanceCreation: number;
  defensiveRisk: number;
  foulRisk: number;
};

/**
 * Traduce la configuración táctica a efectos acotados y acumulables.
 * Ninguna opción domina a todas las demás: cada mejora tiene coste o una
 * vulnerabilidad compensatoria. Las interacciones contra el rival se aplican
 * en expectedGoals(), donde están disponibles las dos configuraciones.
 */
export function tacticsModifiers(t?: Partial<TeamTactics> | null): TacticsModifiers {
  const style = t?.style ?? "balanced";
  const pressure = t?.pressure ?? "medium";
  const line = t?.defenseLine ?? "medium";
  const tempo = t?.tempo ?? "normal";
  const width = t?.width ?? "normal";
  const attackingWidth = t?.attackingWidth ?? "normal";
  const passing = t?.passingStyle ?? "mixed";
  const counter = t?.counterAttack ?? false;
  const wasting = t?.timeWasting ?? "normal";
  const marking = t?.marking ?? "zonal";
  const aggressionLevel = t?.aggressionLevel ?? "normal";

  let attack = 1;
  let defense = 1;
  let stamina = 1;
  let aggression = 1;
  let possession = 1;
  let chanceCreation = 1;
  let defensiveRisk = 1;
  let foulRisk = 1;

  if (style === "offensive") {
    attack *= 1.07; defense *= 0.96; stamina *= 1.04; defensiveRisk *= 1.06;
  } else if (style === "defensive") {
    attack *= 0.94; defense *= 1.06; stamina *= 0.97; defensiveRisk *= 0.94;
  }
  if (pressure === "high") {
    attack *= 1.035; defense *= 1.025; stamina *= 1.075;
    aggression *= 1.08; foulRisk *= 1.12;
  } else if (pressure === "low") {
    attack *= 0.975; defense *= 0.99; stamina *= 0.94;
    aggression *= 0.92; foulRisk *= 0.90;
  }
  if (line === "high") {
    attack *= 1.015; defense *= 0.985; stamina *= 1.025; defensiveRisk *= 1.12;
  } else if (line === "low") {
    attack *= 0.985; defense *= 1.04; stamina *= 0.975; defensiveRisk *= 0.91;
  }
  if (tempo === "high") {
    attack *= 1.035; chanceCreation *= 1.04; stamina *= 1.065; defensiveRisk *= 1.035;
  } else if (tempo === "slow") {
    attack *= 0.975; possession *= 1.045; stamina *= 0.955; defensiveRisk *= 0.97;
  }
  if (width === "wide") {
    possession *= 1.015; defense *= 0.99; stamina *= 1.015;
  } else if (width === "narrow") {
    defense *= 1.015; possession *= 0.985; defensiveRisk *= 0.985;
  }
  if (attackingWidth === "wide") {
    attack *= 1.025; chanceCreation *= 1.035; stamina *= 1.025; defense *= 0.99;
  } else if (attackingWidth === "narrow") {
    possession *= 1.02; chanceCreation *= 0.975; defense *= 1.01;
  }
  if (passing === "short") {
    possession *= 1.045; attack *= 0.985; stamina *= 1.01;
  } else if (passing === "direct") {
    attack *= 1.025; chanceCreation *= 1.025; possession *= 0.965; defensiveRisk *= 1.025;
  }
  if (counter) {
    attack *= 1.025; chanceCreation *= 1.02; possession *= 0.985; defense *= 0.995;
  }
  if (wasting === "high") {
    attack *= 0.965; stamina *= 0.985; defensiveRisk *= 0.985;
  } else if (wasting === "low") {
    attack *= 1.01; stamina *= 1.005; defensiveRisk *= 1.015;
  }
  if (marking === "man") {
    defense *= 1.025; stamina *= 1.025; foulRisk *= 1.10; defensiveRisk *= 1.025;
  } else if (marking === "intense") {
    defense *= 1.04; stamina *= 1.055; aggression *= 1.13; foulRisk *= 1.24; defensiveRisk *= 1.04;
  }
  if (aggressionLevel === "high") {
    aggression *= 1.20; foulRisk *= 1.20; stamina *= 1.02; defense *= 1.005;
  } else if (aggressionLevel === "low") {
    aggression *= 0.82; foulRisk *= 0.82; defense *= 0.99;
  }

  // Evita que apilar varias instrucciones genere multiplicadores extremos.
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  return {
    attack: clamp(attack, 0.82, 1.22),
    defense: clamp(defense, 0.82, 1.22),
    stamina: clamp(stamina, 0.88, 1.22),
    aggression: clamp(aggression, 0.65, 1.65),
    possession: clamp(possession, 0.88, 1.12),
    chanceCreation: clamp(chanceCreation, 0.88, 1.15),
    defensiveRisk: clamp(defensiveRisk, 0.80, 1.30),
    foulRisk: clamp(foulRisk, 0.65, 1.65),
  };
}

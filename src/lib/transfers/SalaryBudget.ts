import { USER_WAGE_BUDGET_RULES } from "./constants";

export interface WageBudgetBounds {
  min: number;
  max: number;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function allocationBounds(totalBudget: number): WageBudgetBounds {
  if (totalBudget <= 0) return { min: 0, max: 0 };
  const min = Math.min(totalBudget, Math.ceil(totalBudget * USER_WAGE_BUDGET_RULES.minimumShare));
  const max = Math.max(
    min,
    Math.min(totalBudget, Math.floor(totalBudget * USER_WAGE_BUDGET_RULES.standardMaximumShare)),
  );
  return { min, max };
}

/**
 * La bolsa salarial vuelve al reparto original del juego: parte del 20% del
 * presupuesto total y el deslizador permite asignar entre el 5% y el 30%.
 * `wageBill` se conserva como dato independiente (masa salarial real); no debe
 * cambiar automáticamente el reparto ni comerse el dinero destinado a fichajes.
 */
export function normalizeUserWageBudget(
  totalBudgetValue: number,
  _wageBillValue: number,
  preferredShare = USER_WAGE_BUDGET_RULES.defaultShare,
): number {
  const totalBudget = finiteNonNegative(totalBudgetValue);
  if (totalBudget <= 0) return 0;

  const { min, max } = allocationBounds(totalBudget);
  const share = Math.max(
    USER_WAGE_BUDGET_RULES.minimumShare,
    Math.min(
      USER_WAGE_BUDGET_RULES.standardMaximumShare,
      Number.isFinite(preferredShare) ? preferredShare : USER_WAGE_BUDGET_RULES.defaultShare,
    ),
  );
  return Math.max(min, Math.min(max, Math.round(totalBudget * share)));
}

/** Rango del deslizador original: 5%-30% del presupuesto total para salarios. */
export function userWageBudgetBounds(
  totalBudgetValue: number,
  _wageBillValue: number,
  _currentWageBudgetValue = 0,
): WageBudgetBounds {
  return allocationBounds(finiteNonNegative(totalBudgetValue));
}

/**
 * Mantiene la asignación salarial al cambiar el presupuesto total, pero la
 * conserva siempre dentro del rango original del juego. Los ingresos por
 * traspasos o premios aumentan la caja disponible para fichajes; no amplían
 * automáticamente la bolsa salarial.
 */
export function preserveUserWageBudget(
  totalBudgetValue: number,
  _wageBillValue: number,
  currentWageBudgetValue: number,
): number {
  const totalBudget = finiteNonNegative(totalBudgetValue);
  if (totalBudget <= 0) return 0;

  const { min, max } = allocationBounds(totalBudget);
  const currentWageBudget = currentWageBudgetValue > 0
    ? finiteNonNegative(currentWageBudgetValue)
    : Math.round(totalBudget * USER_WAGE_BUDGET_RULES.defaultShare);
  return Math.max(min, Math.min(max, currentWageBudget));
}

/**
 * Migra guardados donde el campo `wageBudget` contenía por error la parte de
 * fichajes (por encima del 55%). Después aplica el reparto salarial original
 * de 5%-30%, con 20% por defecto. La masa salarial se conserva aparte y no
 * debe invertir las dos cantidades de la barra.
 */
export function migrateUserWageBudget(
  totalBudgetValue: number,
  savedWageBudgetValue: number | null | undefined,
  _wageBillValue: number,
  defaultShare = USER_WAGE_BUDGET_RULES.defaultShare,
): number {
  const totalBudget = finiteNonNegative(totalBudgetValue);
  if (totalBudget <= 0) return 0;

  const savedAllocation = savedWageBudgetValue == null
    ? Math.round(totalBudget * defaultShare)
    : finiteNonNegative(savedWageBudgetValue);
  const salaryAllocation = savedAllocation / totalBudget > USER_WAGE_BUDGET_RULES.legacyTransferAllocationThreshold
    ? Math.max(0, totalBudget - savedAllocation)
    : savedAllocation;
  const preferredShare = salaryAllocation / totalBudget;
  return normalizeUserWageBudget(totalBudget, 0, preferredShare);
}

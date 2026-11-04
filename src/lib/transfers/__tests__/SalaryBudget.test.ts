import { describe, expect, it } from "vitest";
import { migrateUserWageBudget, normalizeUserWageBudget, preserveUserWageBudget, userWageBudgetBounds } from "../SalaryBudget";

describe("SalaryBudget", () => {
  it("parte del 20% original para salarios y mantiene el tope del 30%", () => {
    const totalBudget = 250_000_000;
    const wageBudget = normalizeUserWageBudget(totalBudget, 170_000_000, 0.2);

    expect(wageBudget).toBe(50_000_000);
    expect(wageBudget / totalBudget).toBe(0.2);
    expect(totalBudget - wageBudget).toBe(200_000_000);
  });

  it("limita el deslizador al rango original de 5%-30%, aunque la masa salarial sea mayor", () => {
    const bounds = userWageBudgetBounds(250_000_000, 170_000_000, 182_500_000);

    expect(bounds.min).toBe(12_500_000);
    expect(bounds.max).toBe(75_000_000);
  });

  it("no amplía automáticamente salarios hasta absorber el presupuesto de fichajes", () => {
    const salaryBudget = preserveUserWageBudget(250_000_000, 170_000_000, 50_000_000);
    expect(salaryBudget).toBe(50_000_000);
    expect(250_000_000 - salaryBudget).toBe(200_000_000);
  });

  it("migra una bolsa antigua de fichajes del 68% a una reserva salarial del 30% máximo", () => {
    const migrated = migrateUserWageBudget(200_000_000, 136_000_000, 48_000_000);
    expect(migrated).toBe(60_000_000);
  });

  it("corrige una asignación salarial guardada con el valor invertido", () => {
    const migrated = migrateUserWageBudget(200_000_000, 180_000_000, 150_000_000);
    expect(migrated).toBe(20_000_000);
  });

  it("usa el 20% de salarios cuando el guardado no tiene asignación", () => {
    const migrated = migrateUserWageBudget(200_000_000, undefined, 0);
    expect(migrated).toBe(40_000_000);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const { playersByClub } = vi.hoisted(() => ({
  playersByClub: new Map<string, Array<{ contract: { wage: number } }>>(),
}));

vi.mock("../PlayerIndex", () => ({
  getClubPlayers: (clubId: string) => playersByClub.get(clubId) ?? [],
}));
vi.mock("../ClubStrategy", () => ({
  SAUDI_LEAGUE_ID: "saudi",
  getClubProfile: (clubId: string) => ({
    id: clubId,
    leagueId: "laliga",
    reputation: 0.5,
    financialPower: 0.5,
  }),
}));

import {
  canAfford,
  creditUserTransferBudget,
  getFinances,
  registerSigning,
  registerSale,
  resetFinances,
  setFinances,
  setUserClubBridge,
  syncWageBill,
  setWageBudget as setClubWageBudget,
} from "../BudgetManager";

describe("BudgetManager — separación de fichajes y salarios", () => {
  afterEach(() => {
    setUserClubBridge(null);
    resetFinances();
    playersByClub.clear();
  });

  it("descuenta la cláusula de fichajes y el salario solo de la capacidad salarial", () => {
    let budget = 100_000_000;
    let wageBudget = 30_000_000;
    playersByClub.set("user", [{ contract: { wage: 20_000_000 } }]);

    setUserClubBridge({
      clubId: "user",
      getBudget: () => budget,
      setBudget: (value) => { budget = value; },
      getWageBudget: () => wageBudget,
      setWageBudget: (value) => { wageBudget = value; },
    });
    setFinances({
      clubId: "user",
      budget,
      initialBudget: budget,
      totalBudget: budget,
      wageBudget,
      wageBill: 20_000_000,
      spent: 0,
      earned: 0,
    });

    expect(canAfford("user", 50_000_000, 10_000_000)).toBe(true);

    // completeTransfer ya ha movido al jugador y actualizado su salario antes
    // de llamar a registerSigning; el índice refleja la nueva masa salarial.
    playersByClub.set("user", [
      { contract: { wage: 20_000_000 } },
      { contract: { wage: 5_000_000 } },
    ]);
    registerSigning("user", 50_000_000, 5_000_000);

    expect(budget).toBe(50_000_000);
    expect(wageBudget).toBe(30_000_000);
    expect(getFinances("user").wageBill).toBe(25_000_000);
    expect(canAfford("user", 0, 5_000_000)).toBe(true);
    expect(canAfford("user", 0, 5_000_001)).toBe(false);
  });

  it("en una venta normal, ingresa solo el traspaso y libera margen salarial", () => {
    let budget = 100_000_000;
    let wageBudget = 30_000_000;
    playersByClub.set("user", [
      { contract: { wage: 20_000_000 } },
      { contract: { wage: 5_000_000 } },
    ]);
    setUserClubBridge({
      clubId: "user",
      getBudget: () => budget,
      setBudget: (value) => { budget = value; },
      getWageBudget: () => wageBudget,
      setWageBudget: (value) => { wageBudget = value; },
    });
    setFinances({
      clubId: "user", budget, initialBudget: budget, totalBudget: budget,
      wageBudget, wageBill: 25_000_000, spent: 0, earned: 0,
    });

    // La plantilla ya no incluye al futbolista vendido.
    playersByClub.set("user", [{ contract: { wage: 20_000_000 } }]);
    const transferBudgetBefore = budget - wageBudget;
    registerSale("user", 12_000_000, 5_000_000);

    expect(budget).toBe(112_000_000);
    expect(wageBudget).toBe(30_000_000);
    expect(getFinances("user").budget - getFinances("user").wageBudget)
      .toBe(transferBudgetBefore + 12_000_000);
    expect(getFinances("user").wageBill).toBe(20_000_000);
  });


  it("en un clausulazo recibido, suma también el salario anual liberado al presupuesto", () => {
    let budget = 100_000_000;
    let wageBudget = 30_000_000;
    playersByClub.set("user", [
      { contract: { wage: 20_000_000 } },
      { contract: { wage: 5_000_000 } },
    ]);
    setUserClubBridge({
      clubId: "user",
      getBudget: () => budget,
      setBudget: (value) => { budget = value; },
      getWageBudget: () => wageBudget,
      setWageBudget: (value) => { wageBudget = value; },
    });
    setFinances({
      clubId: "user", budget, initialBudget: budget, totalBudget: budget,
      wageBudget, wageBill: 25_000_000, spent: 0, earned: 0,
    });

    // El jugador ya está fuera cuando se registra el clausulazo.
    playersByClub.set("user", [{ contract: { wage: 20_000_000 } }]);
    registerSale("user", 60_000_000, 5_000_000, true);

    expect(budget).toBe(165_000_000);
    // El ingreso completo (cláusula + salario ahorrado) va a fichajes;
    // la bolsa salarial asignada no absorbe parte del abono.
    expect(wageBudget).toBe(30_000_000);
    expect(getFinances("user").wageBill).toBe(20_000_000);
    expect(getFinances("user").budget - getFinances("user").wageBudget).toBe(135_000_000);
  });

  it("mantiene el tope salarial original del 30% aunque la masa real sea mayor", () => {
    let budget = 200_000_000;
    let wageBudget = 40_000_000;
    playersByClub.set("user", [{ contract: { wage: 145_000_000 } }]);
    setUserClubBridge({
      clubId: "user",
      getBudget: () => budget,
      setBudget: (value) => { budget = value; },
      getWageBudget: () => wageBudget,
      setWageBudget: (value) => { wageBudget = value; },
    });
    setFinances({
      clubId: "user", budget, initialBudget: budget, totalBudget: budget,
      wageBudget, wageBill: 145_000_000, spent: 0, earned: 0,
    });

    syncWageBill("user");
    setClubWageBudget("user", 160_000_000);

    expect(wageBudget).toBe(60_000_000);
    expect(getFinances("user").wageBill).toBe(145_000_000);
  });

  it("mantiene conectado el presupuesto real después de resetear el ledger del mercado", () => {
    let budget = 100_000_000;
    let wageBudget = 30_000_000;
    playersByClub.set("user", [
      { contract: { wage: 20_000_000 } },
      { contract: { wage: 5_000_000 } },
    ]);
    setUserClubBridge({
      clubId: "user",
      getBudget: () => budget,
      setBudget: (value) => { budget = value; },
      getWageBudget: () => wageBudget,
      setWageBudget: (value) => { wageBudget = value; },
    });
    setFinances({
      clubId: "user", budget, initialBudget: budget, totalBudget: budget,
      wageBudget, wageBill: 25_000_000, spent: 0, earned: 0,
    });

    // resetTransferSystem() limpia este ledger antes de arrancar una carrera,
    // pero no debe romper el puente hacia el Zustand store.
    resetFinances();
    playersByClub.set("user", [{ contract: { wage: 20_000_000 } }]);
    registerSale("user", 60_000_000, 5_000_000, true);

    expect(budget).toBe(165_000_000);
    expect(wageBudget).toBe(30_000_000);
    expect(getFinances("user").wageBill).toBe(20_000_000);
  });

  it("acredita íntegramente una cláusula en fichajes sin tocar salarios", () => {
    let budget = 100_000_000;
    let wageBudget = 30_000_000;
    playersByClub.set("user", [{ contract: { wage: 20_000_000 } }]);
    setUserClubBridge({
      clubId: "user",
      getBudget: () => budget,
      setBudget: (value) => { budget = value; },
      getWageBudget: () => wageBudget,
      setWageBudget: (value) => { wageBudget = value; },
    });
    setFinances({
      clubId: "user", budget, initialBudget: budget, totalBudget: budget,
      wageBudget, wageBill: 20_000_000, spent: 0, earned: 0,
    });

    creditUserTransferBudget("user", 60_000_000);

    expect(budget).toBe(160_000_000);
    expect(wageBudget).toBe(30_000_000);
    expect(getFinances("user").budget - getFinances("user").wageBudget).toBe(130_000_000);
  });

});

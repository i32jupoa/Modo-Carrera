import assert from "node:assert/strict";
import {
  calculateSeasonEconomyForClub,
  settleSeasonEconomyForCampaign,
} from "../src/lib/season/seasonEconomyCore.ts";
import { migrateSeasonEconomyFields } from "../src/lib/season/seasonEconomyMigration.ts";

const user = calculateSeasonEconomyForClub({
  clubId: "user-club", mode: "user", currentBudget: 80_000_000, initialBudget: 120_000_000,
  wageBudget: 20_000_000, wageBill: 15_000_000, spent: 0, earned: 0,
  previousLeagueId: "laliga2", nextLeagueId: "laliga", finalPosition: 1, leagueSize: 22,
  promoted: true, wonDomesticCup: true, nextEuropeanCompetition: "ucl",
});
assert.ok(user.initialBudget >= 144_000_000, "el ascenso debe mejorar el presupuesto base");
assert.ok(user.budget > 80_000_000, "se deben abonar ingresos y premios al cierre");
assert.ok(user.budget <= user.initialBudget * 3.5, "el presupuesto de usuario debe tener un techo para evitar inflación ilimitada");
assert.ok(user.wageBudget >= user.wageBill, "el margen salarial no puede quedar por debajo de la masa comprometida");
assert.equal(user.spent, 0, "se reinician métricas de gasto de la ventana anterior");

const relegated = calculateSeasonEconomyForClub({
  clubId: "relegated", mode: "ai", currentBudget: 60_000_000, initialBudget: 100_000_000,
  wageBudget: 20_000_000, wageBill: 15_000_000, spent: 7_000_000, earned: 8_000_000,
  previousLeagueId: "premier", nextLeagueId: "championship", finalPosition: 18, leagueSize: 20,
  relegated: true, currentEuropeanCompetition: "ucl", nextEuropeanCompetition: null,
});
assert.ok(relegated.initialBudget <= 80_000_000, "el descenso debe reducir el presupuesto de referencia");
assert.ok(relegated.wageBudget >= relegated.wageBill);
assert.equal(relegated.earned, 0);
assert.equal(relegated.spent, 0);
assert.ok(relegated.budget <= relegated.initialBudget * 4, "el presupuesto de IA se limita a cuatro veces la referencia");
assert.ok(relegated.breakdown.europeanParticipationRevenue > 0);

const noDuplicate = settleSeasonEconomyForCampaign("2027/28", [
  { clubId: "club", mode: "ai", currentBudget: 5_000_000, initialBudget: 10_000_000, wageBudget: 2_000_000,
    wageBill: 1_500_000, spent: 500_000, earned: 1_000_000, previousLeagueId: "seriea", nextLeagueId: "seriea",
    finalPosition: 4, leagueSize: 20 },
], []);
const retried = settleSeasonEconomyForCampaign("2027/28", [
  { clubId: "club", mode: "ai", currentBudget: 5_000_000, initialBudget: 10_000_000, wageBudget: 2_000_000,
    wageBill: 1_500_000, spent: 500_000, earned: 1_000_000, previousLeagueId: "seriea", nextLeagueId: "seriea",
    finalPosition: 4, leagueSize: 20 },
], noDuplicate.ledger);
assert.equal(noDuplicate.updates.length, 1);
assert.equal(retried.skipped, true, "la liquidación de una campaña ya registrada debe omitirse");
assert.equal(retried.updates.length, 0, "un reintento no debe pagar ingresos otra vez");
assert.deepEqual(retried.ledger, noDuplicate.ledger);

const migrated = migrateSeasonEconomyFields({ version: 2, season: "2026/27", myTeamId: "club" });
assert.equal(migrated.changed, true, "los guardados antiguos deben migrar el ledger económico");
assert.deepEqual(migrated.save.seasonEconomyLedger, []);
assert.equal(migrated.save.seasonEconomyVersion, 1);
const cleaned = migrateSeasonEconomyFields({ seasonEconomyVersion: 1, seasonEconomyLedger: ["2026/27", "bad", "2026/27"] });
assert.deepEqual(cleaned.save.seasonEconomyLedger, ["2026/27"], "el ledger migra entradas inválidas y duplicadas");
console.log("season-economy-test: OK — ingresos por categoría, premios, promociones, descensos, topes y migración idempotente");

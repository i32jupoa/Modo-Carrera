import { describe, expect, it } from "vitest";
import { ALL_FORMATIONS, FORMATION_COORDINATES } from "@/lib/formations";
import { isAiFormationAllowed } from "@/lib/teamProfile";

describe("formaciones permitidas para equipos de la IA", () => {
  it("rechaza todos los esquemas que alinean con tres defensas", () => {
    const threeDefenderFormations = ALL_FORMATIONS.filter((formation) =>
      Object.values(FORMATION_COORDINATES[formation]).filter((slot) => slot.role === "DEF").length === 3,
    );

    expect(threeDefenderFormations.length).toBeGreaterThan(0);
    for (const formation of threeDefenderFormations) {
      expect(isAiFormationAllowed(formation), formation).toBe(false);
    }
  });

  it("solo admite onces completos con cuatro o cinco defensas y un portero", () => {
    const allowed = ALL_FORMATIONS.filter(isAiFormationAllowed);

    expect(allowed.length).toBeGreaterThan(0);
    for (const formation of allowed) {
      const roles = Object.values(FORMATION_COORDINATES[formation]).map((slot) => slot.role);
      expect(roles.filter((role) => role === "GK")).toHaveLength(1);
      expect(roles.filter((role) => role === "DEF").length).toBeGreaterThanOrEqual(4);
      expect(roles).toHaveLength(11);
    }
  });
});

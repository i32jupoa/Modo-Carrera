import { describe, expect, it } from "vitest";
import type { Player } from "@/data/players";
import { computeSquadRole, assignSquadRoles } from "../squadRoles";
import type { SquadRole } from "@/lib/transfers/types";

function player(id: string, rating: number, potential: number, age = 24, position = "MC"): Player {
  return {
    id,
    name: id,
    rating,
    potential,
    age,
    positions: position === "GK" ? ["GK"] : [position as never],
  } as unknown as Player;
}

describe("squad roles", () => {
  it("gives a small squad a local star and roughly follows the expected distribution", () => {
    const squad = Array.from({ length: 25 }, (_, index) => player(`p${index}`, 70 + index));
    const roles = assignSquadRoles(squad, new Set(["p24", "p23", "p22", "p21", "p20", "p19", "p18", "p17", "p16", "p15", "p14"]));
    const counts = Object.values(roles).reduce<Record<SquadRole, number>>((acc, role) => {
      acc[role] += 1;
      return acc;
    }, { star: 0, starter: 0, rotation: 0, secondary: 0, prospect: 0 });

    expect(counts.star).toBeGreaterThanOrEqual(1);
    expect(counts.star).toBeLessThanOrEqual(3);
    expect(counts.starter + counts.star).toBeGreaterThanOrEqual(9);
    expect(counts.rotation).toBeGreaterThanOrEqual(5);
  });

  it("always preserves a negotiated role", () => {
    const squad = [player("a", 88, 90), player("b", 82, 85), player("c", 75, 90)];
    expect(computeSquadRole(squad[0], squad, { negotiatedRole: "rotation" })).toBe("rotation");
    const roles = assignSquadRoles(squad, new Set(["a"]), new Map([["a", "prospect" as SquadRole]]));
    expect(roles.a).toBe("prospect");
  });

  it("can identify a young high-potential player as a prospect when the player is not yet an OVR leader", () => {
    const squad = [
      player("star", 88, 89, 27),
      player("starter", 84, 85, 25),
      player("young", 72, 86, 19),
      player("older", 70, 71, 29),
      player("older2", 68, 70, 30),
      player("older3", 66, 67, 31),
    ];
    expect(computeSquadRole(squad[2], squad, { typicalXIIds: new Set(["star", "starter"]) })).toBe("prospect");
  });
});

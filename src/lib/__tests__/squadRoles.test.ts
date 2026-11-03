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

  it("keeps the expected hierarchy on a 30-player squad", () => {
    const squad = Array.from({ length: 30 }, (_, index) =>
      player(`p${index}`, 80 - Math.floor(index / 3), 83 - Math.floor(index / 4), 24),
    );
    const roles = assignSquadRoles(squad, new Set(squad.slice(0, 11).map((p) => p.id)));
    const counts = Object.values(roles).reduce<Record<SquadRole, number>>((acc, role) => {
      acc[role] += 1;
      return acc;
    }, { star: 0, starter: 0, rotation: 0, secondary: 0, prospect: 0 });

    expect(counts.star).toBeGreaterThanOrEqual(1);
    expect(counts.starter).toBeGreaterThanOrEqual(8);
    expect(counts.rotation).toBeGreaterThanOrEqual(5);
    expect(counts.secondary + counts.prospect).toBeGreaterThan(0);
  });

  it("does not turn a weak midfield into an all-attacking starting hierarchy", () => {
    const squad = [
      ...Array.from({ length: 2 }, (_, index) => player(`g${index}`, 70 + index, 72, 28, "GK")),
      ...Array.from({ length: 8 }, (_, index) => player(`d${index}`, 72 + index, 75, 25, "DFC")),
      ...Array.from({ length: 4 }, (_, index) => player(`m${index}`, 62 + index, 70, 24, "MC")),
      ...Array.from({ length: 10 }, (_, index) => player(`a${index}`, 82 - index, 84, 24, "DC")),
    ];
    const typicalXI = new Set(["g0", "d0", "d1", "d2", "d3", "m0", "m1", "m2", "m3", "a0", "a1"]);
    const roles = assignSquadRoles(squad, typicalXI);
    const attackingCore = squad.filter((p) => ["star", "starter"].includes(roles[p.id]) && p.positions?.some((pos) => pos === "DC"));
    const midfieldCore = squad.filter((p) => ["star", "starter"].includes(roles[p.id]) && p.positions?.some((pos) => pos === "MC"));

    expect(attackingCore).toHaveLength(2);
    expect(midfieldCore).toHaveLength(4);
  });


  it("keeps a reserve striker in rotation instead of promoting him to starter", () => {
    const squad = [
      player("gk1", 88, 88, 29, "GK"),
      player("gk2", 79, 80, 27, "GK"),
      ...Array.from({ length: 4 }, (_, index) => player(`def${index + 1}`, 84 - index, 85, 25, "DFC")),
      player("def5", 78, 80, 24, "DFC"),
      ...Array.from({ length: 3 }, (_, index) => player(`mid${index + 1}`, 86 - index, 88, 25, "MC")),
      player("mid4", 78, 82, 23, "MC"),
      player("wing1", 88, 90, 25, "LW"),
      player("wing2", 80, 84, 24, "RW"),
      player("wing3", 77, 80, 23, "LW"),
      player("st1", 91, 93, 27, "DC"),
      player("st2", 80, 87, 20, "DC"),
      player("carlos-espi", 77, 86, 20, "DC"),
    ];
    const typicalXI = new Set([
      "gk1", "def1", "def2", "def3", "def4", "mid1", "mid2", "mid3", "wing1", "wing2", "st1",
    ]);
    const roles = assignSquadRoles(squad, typicalXI);

    expect(roles["carlos-espi"]).toBe("rotation");
    expect(roles["carlos-espi"]).not.toBe("starter");
    expect(roles["st2"]).toBe("rotation");
  });

  it("does not classify an established 77-OVR young striker as a prospect", () => {
    const squad = [
      player("gk", 84, 85, 28, "GK"),
      ...Array.from({ length: 4 }, (_, index) => player(`d${index}`, 82 - index, 84, 26, "DFC")),
      ...Array.from({ length: 3 }, (_, index) => player(`m${index}`, 82 - index, 85, 25, "MC")),
      player("lw", 86, 88, 25, "LW"),
      player("rw", 80, 84, 24, "RW"),
      player("st", 90, 92, 27, "DC"),
      player("carlos", 77, 86, 20, "DC"),
    ];
    const typicalXI = new Set(squad.slice(0, 11).map((p) => p.id));
    const roles = assignSquadRoles(squad, typicalXI);

    expect(roles.carlos).toBe("rotation");
  });

  it("uses the negotiated role even when it conflicts with the automatic positional ranking", () => {
    const squad = [
      player("best", 90, 92, 27, "DC"),
      player("mid", 68, 72, 26, "MC"),
      player("def", 70, 71, 25, "DFC"),
    ];
    const roles = assignSquadRoles(
      squad,
      new Set(["best", "mid", "def"]),
      new Map([["mid", "star" as SquadRole]]),
    );

    expect(roles.mid).toBe("star");
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

import { describe, expect, it } from "vitest";
import { buildAiMatchSquad } from "@/lib/store";
import type { Player } from "@/data/players";

function player(id: string, positions: string[], rating = 70): Player {
  return {
    id,
    name: id,
    teamId: "test-team",
    positions,
    rating,
    energy: 60,
  } as unknown as Player;
}

describe("buildAiMatchSquad", () => {
  const xi = [
    player("gk", ["GK"], 80),
    player("li", ["LI"], 78),
    player("cb-1", ["DFC"], 77),
    player("cb-2", ["DFC"], 76),
    player("ld", ["LD"], 75),
    player("mc-1", ["MC"], 74),
    player("mc-2", ["MC"], 73),
    player("mc-3", ["MC"], 72),
    player("ei", ["EI"], 71),
    player("dc", ["DC"], 70),
    player("ed", ["ED"], 69),
  ];

  it("accepts a complete eleven without changing its slot order", () => {
    const selected = buildAiMatchSquad("test-team", xi, new Set(), xi, "Táctica 4-3-3");
    expect(selected).toHaveLength(11);
    expect(selected.map((player) => player.id)).toEqual(xi.map((player) => player.id));
  });

  it("does not complete a partial XI with arbitrary players", () => {
    expect(buildAiMatchSquad("test-team", xi.slice(0, 5), new Set(), xi)).toEqual([]);
  });

  it("does not reintroduce injured or suspended players as emergency cover", () => {
    const unavailable = new Set(["dc"]);
    expect(buildAiMatchSquad("test-team", xi, unavailable, xi, "Táctica 4-3-3")).toEqual([]);
  });

  it("rejects a complete but positionally incoherent XI", () => {
    const mismatched = [...xi];
    mismatched[9] = player("defender-up-front", ["DFC"], 99);
    expect(buildAiMatchSquad("test-team", mismatched, new Set(), mismatched, "Táctica 4-3-3")).toEqual([]);
  });

  it("does not mutate persistent player energy while validating an XI", () => {
    const candidates = xi.map((player) => ({ ...player, energy: 37 }));
    buildAiMatchSquad("test-team", candidates, new Set(), candidates, "Táctica 4-3-3");
    expect(candidates.every((player) => player.energy === 37)).toBe(true);
  });
});

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
  const roster = [
    player("gk", ["GK"], 80),
    ...Array.from({ length: 4 }, (_, i) => player(`def-${i}`, ["CB"], 75 - i)),
    ...Array.from({ length: 4 }, (_, i) => player(`mid-${i}`, ["CM"], 70 - i)),
    ...Array.from({ length: 4 }, (_, i) => player(`fwd-${i}`, ["ST"], 69 - i)),
  ];

  it("always completes an XI to eleven unique players and includes a goalkeeper", () => {
    const xi = buildAiMatchSquad("test-team", roster.slice(0, 5), new Set(), roster);
    expect(xi).toHaveLength(11);
    expect(new Set(xi.map((p) => p.id)).size).toBe(11);
    expect(xi.some((p) => p.positions.includes("GK"))).toBe(true);
  });

  it("does not select unavailable players while enough eligible players exist", () => {
    const unavailable = new Set(["gk", "def-0"]);
    const xi = buildAiMatchSquad("test-team", [], unavailable, roster);
    expect(xi).toHaveLength(11);
    expect(xi.some((p) => unavailable.has(p.id))).toBe(false);
  });

  it("uses emergency cover rather than reducing the XI when the roster is short on eligible players", () => {
    const unavailable = new Set(roster.slice(0, 5).map((p) => p.id));
    const xi = buildAiMatchSquad("test-team", [], unavailable, roster);
    expect(xi).toHaveLength(11);
    expect(xi.some((p) => unavailable.has(p.id))).toBe(true);
  });

  it("does not mutate persistent player energy while building an XI", () => {
    const candidates = roster.map((p) => ({ ...p, energy: 37 }));
    buildAiMatchSquad("test-team", candidates.slice(0, 5), new Set(), candidates);
    expect(candidates.every((p) => p.energy === 37)).toBe(true);
  });
});

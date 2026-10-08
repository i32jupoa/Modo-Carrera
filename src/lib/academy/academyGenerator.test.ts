import { describe, expect, it } from "vitest";
import { ACADEMY_ID_BASE, ACADEMY_ID_SPAN, ACADEMY_LIMITS } from "./academyConstants";
import { generateAcademyState } from "./academyGenerator";
import { advanceAcademyToDate } from "./academyProgression";

describe("academy generator", () => {
  it("is deterministic for the same save, club and season", () => {
    const a = generateAcademyState("save-1", "bar", 2026);
    const b = generateAcademyState("save-1", "bar", 2026);
    expect(a.players).toEqual(b.players);
  });

  it("keeps players inside the designed ranges and ids in the reserved block", () => {
    const state = generateAcademyState("save-2", "ath", 2026);
    expect(state.players.length).toBeGreaterThanOrEqual(ACADEMY_LIMITS.minPlayers);
    expect(state.players.length).toBeLessThanOrEqual(ACADEMY_LIMITS.maxPlayers);
    expect(new Set(state.players.map((player) => player.id)).size).toBe(state.players.length);
    for (const player of state.players) {
      expect(player.ovr).toBeGreaterThanOrEqual(ACADEMY_LIMITS.minOvr);
      expect(player.ovr).toBeLessThanOrEqual(ACADEMY_LIMITS.maxOvr);
      expect(player.potential).toBeGreaterThanOrEqual(ACADEMY_LIMITS.minPotential);
      expect(player.potential).toBeLessThanOrEqual(ACADEMY_LIMITS.maxPotential);
      expect(player.id).toBeGreaterThanOrEqual(ACADEMY_ID_BASE);
      expect(player.id).toBeLessThan(ACADEMY_ID_BASE + ACADEMY_ID_SPAN);
    }
  });

  it("adds growth and a new intake when advancing to the next season", () => {
    const initial = generateAcademyState("save-3", "bri", 2026);
    const advanced = advanceAcademyToDate(initial, "2027-07-15", "save-3");
    expect(advanced.lastIntakeSeason).toBe(2027);
    expect(advanced.lastProgressionDate).toBe("2027-07-15");
    expect(advanced.players.length).toBeLessThanOrEqual(ACADEMY_LIMITS.maxPlayers);
  });
});

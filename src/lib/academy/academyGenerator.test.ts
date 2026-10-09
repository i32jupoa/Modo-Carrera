import { describe, expect, it } from "vitest";
import {
  ACADEMY_ID_BASE,
  ACADEMY_ID_SPAN,
  ACADEMY_LIMITS,
  ACADEMY_POSITION_GROUP_COUNTS,
  ACADEMY_SECONDARY_POSITION_COMPATIBILITY,
  ACADEMY_TARGET_POSITION_COUNTS,
} from "./academyConstants";
import { generateAcademyState } from "./academyGenerator";
import { advanceAcademyToDate } from "./academyProgression";

describe("academy generator", () => {
  it("is deterministic for the same save, club and season", () => {
    const a = generateAcademyState("save-1", "bar", 2026);
    const b = generateAcademyState("save-1", "bar", 2026);
    expect(a.players).toEqual(b.players);
  });

  it("starts every new academy at level 1/5 for facilities and youth coach", () => {
    const clubs = ["rma", "psg", "ars", "mil", "bar", "bri"];

    for (const teamId of clubs) {
      const state = generateAcademyState(`save-${teamId}`, teamId, 2026);
      expect(state.facilityLevel).toBe(1);
      expect(state.youthCoach?.level).toBe(1);
    }
  });

  it("keeps players inside the designed ranges and ids in the reserved block", () => {
    const state = generateAcademyState("save-2", "ath", 2026);
    expect(state.players.length).toBeGreaterThanOrEqual(ACADEMY_LIMITS.minPlayers);
    expect(state.players.length).toBeLessThanOrEqual(ACADEMY_LIMITS.maxPlayers);
    expect(new Set(state.players.map((player) => player.id)).size).toBe(state.players.length);
    for (const player of state.players) {
      expect(player.ovr).toBeGreaterThanOrEqual(ACADEMY_LIMITS.minOvr);
      expect(player.ovr).toBeLessThanOrEqual(ACADEMY_LIMITS.maxOvr);
      expect(player.internalOvr).toBe(player.ovr);
      expect(player.potential).toBeGreaterThanOrEqual(ACADEMY_LIMITS.minPotential);
      expect(player.potential).toBeLessThanOrEqual(ACADEMY_LIMITS.maxPotential);
      expect(player.id).toBeGreaterThanOrEqual(ACADEMY_ID_BASE);
      expect(player.id).toBeLessThan(ACADEMY_ID_BASE + ACADEMY_ID_SPAN);
      expect(player.positions.length).toBeLessThanOrEqual(2);
      if (player.positions[0] === "GK") expect(player.positions).toEqual(["GK"]);
      if (player.positions[1]) expect(ACADEMY_SECONDARY_POSITION_COMPATIBILITY[player.positions[0]]).toContain(player.positions[1]);
    }
  });

  it("preserves a balanced line profile instead of generating positions uniformly at random", () => {
    const state = generateAcademyState("balance-test", "rma", 2026);
    const counts = Object.fromEntries(Object.keys(ACADEMY_TARGET_POSITION_COUNTS).map((position) => [position, 0])) as Record<string, number>;
    for (const player of state.players) counts[player.positions[0]] = (counts[player.positions[0]] ?? 0) + 1;

    const groupCounts = {
      GK: counts.GK ?? 0,
      DEF: (counts.DFC ?? 0) + (counts.LD ?? 0) + (counts.LI ?? 0),
      MID: (counts.MCD ?? 0) + (counts.MC ?? 0) + (counts.MCO ?? 0) + (counts.MD ?? 0) + (counts.MI ?? 0),
      FWD: (counts.ED ?? 0) + (counts.EI ?? 0) + (counts.DC ?? 0),
    };
    const targetSize = state.players.length;
    for (const [group, target] of Object.entries(ACADEMY_POSITION_GROUP_COUNTS)) {
      const scaledTarget = targetSize * target / ACADEMY_LIMITS.maxPlayers;
      expect(Math.abs((groupCounts[group as keyof typeof groupCounts] ?? 0) - scaledTarget)).toBeLessThanOrEqual(2);
    }
  });

  it("fills future intakes from the most deficient positions and never exceeds 28", () => {
    const state = generateAcademyState("save-3", "bri", 2026);
    const stripped = {
      ...state,
      players: state.players.filter((player) => !["GK", "LD"].includes(player.positions[0])).slice(0, 12),
      manualPromotionAvailable: true,
    };
    const advanced = advanceAcademyToDate(stripped, "2027-07-15", "save-3");
    expect(advanced.lastIntakeSeason).toBe(2027);
    expect(advanced.lastProgressionDate).toBe("2027-07-15");
    expect(advanced.players.length).toBeLessThanOrEqual(ACADEMY_LIMITS.maxPlayers);
    expect(advanced.players.some((player) => ["GK", "LD", "LI"].includes(player.positions[0]))).toBe(true);
  });
});

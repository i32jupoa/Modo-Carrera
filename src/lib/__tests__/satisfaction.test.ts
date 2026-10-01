import { describe, expect, it } from "vitest";
import type { Player } from "@/data/players";
import { computePostMatchSatisfaction, SATISFACTION_CONFIG } from "../satisfaction";
import type { PlayerStats } from "@/store/playersStore";
import type { Suspension } from "@/lib/store";

function player(id: string): Player {
  return { id, name: id, rating: 80, potential: 82, age: 25, positions: ["MC"] } as unknown as Player;
}

function stats(role: PlayerStats["squadRole"]): Record<string, PlayerStats> {
  return {
    p: { morale: 70, squadRole: role, satisfactionMissStreak: 0 } as PlayerStats,
  };
}

function result(starts: string[] = []): Parameters<typeof computePostMatchSatisfaction>[0]["result"] {
  return {
    homeGoals: 0,
    awayGoals: 0,
    homeStartingLineup: starts.map((id) => player(id)),
    awayStartingLineup: [],
    ratings: [],
    substitutions: [],
    events: [],
    mvp: null,
  };
}

describe("post-match satisfaction", () => {
  it("drops star/starter satisfaction on the third consecutive non-start", () => {
    let current = stats("star");
    for (let i = 1; i <= 2; i += 1) {
      current = computePostMatchSatisfaction({
        teamId: "T", homeTeamId: "T", squad: [player("p")], stats: current,
        matchDate: `2026-09-0${i}`, result: result(), suspensions: {},
      }).updatedStats;
      expect(current.p.satisfactionMissStreak).toBe(i);
      expect(current.p.morale).toBe(70);
    }
    current = computePostMatchSatisfaction({
      teamId: "T", homeTeamId: "T", squad: [player("p")], stats: current,
      matchDate: "2026-09-03", result: result(), suspensions: {},
    }).updatedStats;
    expect(current.p.satisfactionMissStreak).toBe(SATISFACTION_CONFIG.thresholds.star);
    expect(current.p.morale).toBeLessThan(70);
  });

  it("uses the fourth consecutive match as the rotation threshold", () => {
    let current = stats("rotation");
    for (let i = 1; i <= 3; i += 1) {
      current = computePostMatchSatisfaction({
        teamId: "T", homeTeamId: "T", squad: [player("p")], stats: current,
        matchDate: `2026-10-0${i}`, result: result(), suspensions: {},
      }).updatedStats;
      expect(current.p.morale).toBe(70);
    }
    current = computePostMatchSatisfaction({
      teamId: "T", homeTeamId: "T", squad: [player("p")], stats: current,
      matchDate: "2026-10-04", result: result(), suspensions: {},
    }).updatedStats;
    expect(current.p.morale).toBeLessThan(70);
  });

  it("freezes morale and the streak while injured before kickoff", () => {
    const current = computePostMatchSatisfaction({
      teamId: "T", homeTeamId: "T", squad: [player("p")],
      stats: {
        p: { morale: 30, squadRole: "star", satisfactionMissStreak: 2, injuredUntilDate: "2026-10-10", injuryStartDate: "2026-09-20" } as PlayerStats,
      },
      matchDate: "2026-10-01", result: result(), suspensions: {},
    }).updatedStats;
    expect(current.p.morale).toBe(30);
    expect(current.p.satisfactionMissStreak).toBe(2);
  });

  it("freezes morale and the streak while suspended before kickoff", () => {
    const suspension: Suspension = { playerId: "p", playerName: "p", competition: "league", matchdaysRemaining: 1 };
    const current = computePostMatchSatisfaction({
      teamId: "T", homeTeamId: "T", squad: [player("p")],
      stats: { p: { morale: 30, squadRole: "star", satisfactionMissStreak: 2 } as PlayerStats },
      matchDate: "2026-10-01", result: result(), suspensions: { T: [suspension] },
      competition: "league",
    }).updatedStats;
    expect(current.p.morale).toBe(30);
    expect(current.p.satisfactionMissStreak).toBe(2);
  });
});


describe("expectativas de estrellas y titulares", () => {
  it("penaliza a una estrella por no ser convocada", () => {
    const current = computePostMatchSatisfaction({
      teamId: "T", homeTeamId: "T", squad: [player("p")],
      stats: { p: { morale: 80, squadRole: "star" } as PlayerStats },
      matchDate: "2026-08-01", competition: "league", result: result(),
      suspensions: {}, typicalXIIds: new Set(), calledUpIds: new Set(),
    }).updatedStats;
    expect(current.p.morale).toBeLessThan(80);
    expect(current.p.satisfactionNotCalledStreak).toBe(1);
  });

  it("penaliza una racha de tres partidos como suplente", () => {
    let current = { p: { morale: 80, squadRole: "star" } as PlayerStats };
    for (let i = 1; i <= 3; i += 1) {
      current = computePostMatchSatisfaction({
        teamId: "T", homeTeamId: "T", squad: [player("p")], stats: current,
        matchDate: `2026-08-0${i}`, competition: "league", result: result(),
        suspensions: {}, typicalXIIds: new Set(), calledUpIds: new Set(["p"]),
      }).updatedStats;
    }
    expect(current.p.satisfactionBenchStreak).toBe(3);
    expect(current.p.morale).toBeLessThan(80);
  });
});

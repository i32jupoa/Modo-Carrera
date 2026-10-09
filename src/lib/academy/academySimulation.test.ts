import { describe, expect, it } from "vitest";
import {
  ACADEMY_PROGRESSION,
  ACADEMY_SECONDARY_POSITION_CHANCE,
  ACADEMY_SECONDARY_POSITION_COMPATIBILITY,
  ACADEMY_SIMULATION,
} from "./academyConstants";
import { generateAcademyState } from "./academyGenerator";
import { advanceAcademyToDate, applyMonthlyYouthGrowth, simulateAcademyLeagueMatchOnDate } from "./academyProgression";
import { simulateAcademyMatch } from "./academySimulation";
import { createEmptyAcademySeasonStats, type AcademyPlayer } from "./academyTypes";

const ALL_POSITIONS = [
  "GK", "DFC", "LD", "LI", "MCD", "MC", "MCO", "MD", "MI", "ED", "EI", "DC",
] as const;

function testPlayer(id: number, position: AcademyPlayer["positions"][number], overrides: Partial<AcademyPlayer> = {}): AcademyPlayer {
  return {
    id,
    teamId: "rma",
    name: `Canterano ${id}`,
    nation: "España",
    birthdate: "2008-01-01",
    age: 18,
    positions: [position],
    ovr: 60,
    potential: 82,
    potentialEstimate: { min: 78, max: 85 },
    attributes: { PAC: 60, SHO: 60, PAS: 60, DRI: 60, DEF: 60, PHY: 60 },
    traits: ["hard-worker"],
    growthProfile: "normal",
    joinedSeason: 2026,
    contractYearsLeft: 2,
    status: "academy",
    minutesThisSeason: 0,
    academyStats: createEmptyAcademySeasonStats(2026, 60),
    academyCareerSeasons: [],
    ...overrides,
  };
}

describe("simulación y progresión de cantera", () => {

  it("genera resultados deterministas y estadísticas separadas", () => {
    const players = ALL_POSITIONS.flatMap((position, index) => [
      testPlayer(900_000_000 + index * 2, position),
      testPlayer(900_000_001 + index * 2, position),
    ]);
    players[0].status = "called-up";
    players[0].academyStats = createEmptyAcademySeasonStats(2026, 60);

    const a = simulateAcademyMatch(players, "2026-08-08", "save-rma");
    const b = simulateAcademyMatch(players, "2026-08-08", "save-rma");

    expect(a).toEqual(b);
    expect(a.opponent).not.toBe("Sin partido");
    expect(a.teamGoals).toBeGreaterThanOrEqual(0);
    expect(a.teamGoals).toBeLessThanOrEqual(ACADEMY_SIMULATION.maxGoalsPerTeam);
    expect(a.opponentGoals).toBeGreaterThanOrEqual(0);
    expect(a.opponentGoals).toBeLessThanOrEqual(ACADEMY_SIMULATION.maxGoalsPerTeam);

    const calledUp = a.players.find((player) => player.id === players[0].id);
    expect(calledUp?.academyStats?.appearances).toBe(0);
    expect(a.players.some((player) => (player.academyStats?.appearances ?? 0) > 0)).toBe(true);
    expect(a.players.some((player) => (player.minutesThisSeason ?? 0) > 0)).toBe(true);
  });

  it("no simula partidos en días normales y simula una única vez cuando se indica una jornada de Liga", () => {
    const state = {
      ...generateAcademyState("advance-test", "rma", 2026),
      lastProgressionDate: "2026-07-01",
      lastAcademyMatchDate: "2026-07-01",
    };
    const advanced = advanceAcademyToDate(state, "2026-09-01", "advance-test");
    expect(advanced.lastProgressionDate).toBe("2026-09-01");
    expect(advanced.lastAcademyMatchDate).toBe("2026-07-01");
    expect(advanced.players.every((player) => (player.academyStats?.appearances ?? 0) === 0)).toBe(true);

    const match = simulateAcademyLeagueMatchOnDate(advanced, "2026-09-05", "advance-test");
    expect(match.lastAcademyMatchDate).toBe("2026-09-05");
    expect(match.players.some((player) => (player.academyStats?.appearances ?? 0) > 0)).toBe(true);

    const repeated = simulateAcademyLeagueMatchOnDate(match, "2026-09-05", "advance-test");
    expect(repeated).toBe(match);
  });

  it("solo permite segundas posiciones de la tabla de compatibilidad", () => {
    const generated = generateAcademyState("position-test", "rma", 2026);
    for (const player of generated.players) {
      if (player.positions[0] === "GK") expect(player.positions).toEqual(["GK"]);
      if (player.positions.length > 1) {
        const primary = player.positions[0];
        const secondary = player.positions[1];
        expect(ACADEMY_SECONDARY_POSITION_COMPATIBILITY[primary]).toContain(secondary);
      }
    }
    expect(ACADEMY_SECONDARY_POSITION_CHANCE).toBeGreaterThan(0);
    expect(ACADEMY_SECONDARY_POSITION_CHANCE).toBeLessThan(1);
  });

  it("usa minutos y rendimiento mensual para modular la progresión", () => {
    const wellUsed = testPlayer(900_100_001, "MC", {
      academyStats: {
        ...createEmptyAcademySeasonStats(2026, 60),
        monthlyStats: [{
          month: 7,
          year: 2026,
          appearances: 4,
          minutes: 340,
          goals: 2,
          assists: 2,
          cleanSheets: 0,
          yellowCards: 0,
          redCards: 0,
          ratingTotal: 31.2,
          ratingCount: 4,
          averageRating: 7.8,
          ovr: 60.5,
        }],
      },
    });
    const unused = testPlayer(900_100_002, "MC", {
      academyStats: {
        ...createEmptyAcademySeasonStats(2026, 60),
        monthlyStats: [{
          month: 7,
          year: 2026,
          appearances: 0,
          minutes: 0,
          goals: 0,
          assists: 0,
          cleanSheets: 0,
          yellowCards: 0,
          redCards: 0,
          ratingTotal: 0,
          ratingCount: 0,
          averageRating: 0,
          ovr: 60,
        }],
      },
    });
    const state = {
      teamId: "rma",
      facilityLevel: 1 as const,
      youthCoach: { specialty: "MID" as const, level: 1 },
      players: [wellUsed, unused],
      lastIntakeSeason: 2026,
      lastProgressionDate: "2026-07-01",
      lastAcademyMatchDate: "2026-07-01",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };

    const progressedUsed = applyMonthlyYouthGrowth(wellUsed, state, "2026-08-01", "save-rma");
    const progressedUnused = applyMonthlyYouthGrowth(unused, state, "2026-08-01", "save-rma");

    expect(progressedUsed.ovr).toBeGreaterThanOrEqual(progressedUnused.ovr);
    expect(progressedUsed.academyStats?.monthlyStats.at(-1)?.ovr).toBeDefined();
    expect(progressedUsed.internalOvr).toBeGreaterThan(progressedUsed.ovr - 0.5);
    expect(progressedUnused.internalOvr).toBeGreaterThan(60);
    expect(progressedUnused.ovr).toBe(60);
    expect(progressedUnused.academyStats?.startingOvr).toBe(60);
    expect(ACADEMY_PROGRESSION.monthlyMaxDelta).toBeGreaterThan(ACADEMY_PROGRESSION.noMinutesBaseline);
  });
});

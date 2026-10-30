import { afterEach, describe, expect, it } from "vitest";
import type { Player } from "@/data/players";
import {
  selectDeadBallTaker,
  selectPenaltyTaker,
  simulatePenaltyShootout,
} from "@/lib/simulation";

function player(id: string, position = "MC", shooting = 70): Player {
  return {
    id,
    name: id,
    positions: [position] as any,
    rating: 70,
    potential: 75,
    age: 25,
    teamId: "test-team",
    marketValue: 1,
    isReal: false,
    goals: 0,
    assists: 0,
    appearances: 0,
    injuredUntil: 0,
    morale: 70,
    formHistory: [],
    energy: 100,
    attributes: { SHO: shooting, PAS: shooting, PHY: 65, DEF: 50, PAC: 60, DRI: 65 },
  } as Player;
}

const originalRandom = Math.random;
afterEach(() => {
  Math.random = originalRandom;
});

describe("lanzadores de balón parado", () => {
  const keeper = player("keeper", "GK");
  const assigned = player("assigned", "MC", 82);
  const other = player("other", "DC", 96);
  const xi = [keeper, assigned, other];

  it("respeta al lanzador elegido para los penaltis", () => {
    expect(selectPenaltyTaker(xi, "assigned")?.id).toBe("assigned");
  });

  it("respeta al lanzador elegido para las faltas y los córners", () => {
    expect(selectDeadBallTaker(xi, "assigned", "freekick")?.id).toBe("assigned");
    expect(selectDeadBallTaker(xi, "assigned", "corner")?.id).toBe("assigned");
  });

  it("usa una alternativa disponible cuando el lanzador asignado ya no está en el campo", () => {
    expect(selectPenaltyTaker([keeper, other], "assigned")?.id).toBe("other");
    expect(selectDeadBallTaker([keeper, other], "assigned", "freekick")?.id).toBe("other");
    expect(selectDeadBallTaker([keeper, other], "assigned", "corner")?.id).toBe("other");
  });

  it("coloca al lanzador designado como primer tirador de la tanda", () => {
    const sequence = [0.1, 0.9];
    let index = 0;
    Math.random = () => sequence[index++ % sequence.length];
    const result = simulatePenaltyShootout(xi, [player("away-keeper", "GK"), player("away-taker"), player("away-2", "DC")], {
      homePenaltyTakerId: "assigned",
      awayPenaltyTakerId: "away-2",
    });
    expect(result.shootout[0]?.playerId).toBe("assigned");
    expect(result.shootout[1]?.playerId).toBe("away-2");
  });

  it("respeta el orden personalizado de la tanda", () => {
    const home = [player("h1", "MC", 60), player("h2", "DC", 90), player("h3", "DC", 80)];
    const away = [player("a1"), player("a2"), player("a3")];
    const sequence = Array.from({ length: 100 }, (_, index) => (index % 2 ? 0.9 : 0.1));
    let index = 0;
    Math.random = () => sequence[index++ % sequence.length];
    const result = simulatePenaltyShootout(home, away, {
      homePenaltyOrderIds: ["h2", "h3", "h1"],
      awayPenaltyOrderIds: ["a3", "a1", "a2"],
    });
    expect(result.shootout[0]?.playerId).toBe("h2");
    expect(result.shootout[1]?.playerId).toBe("a3");
    expect(result.shootout[2]?.playerId).toBe("h3");
    expect(result.shootout[3]?.playerId).toBe("a1");
  });

  it("permite que el especialista designado sea portero si el entrenador lo elige", () => {
    expect(selectPenaltyTaker(xi, "keeper")?.id).toBe("keeper");
  });
});

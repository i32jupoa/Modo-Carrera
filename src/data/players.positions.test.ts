import { describe, expect, it } from "vitest";
import { bestStartingLineup, defaultLineup, generateAllSquads, type Player } from "./players";
import { FORMATION_COORDINATES, slotPosCode } from "@/lib/formations";
import { playerPosCodes } from "@/lib/positions";

function player(id: string, positions: Player["positions"], rating = 80): Player {
  return {
    id, name: id, positions, rating, potential: rating, age: 25, teamId: "test",
    marketValue: 1, isReal: true, goals: 0, assists: 0, appearances: 0,
    injuredUntil: 0, morale: 50, formHistory: [],
  };
}

describe("defaultLineup respeta las demarcaciones", () => {
  it("nunca coloca a un delantero centro en un hueco de MC", () => {
    const squad = [
      player("gk", ["GK"]), player("li", ["LI"]), player("cb1", ["DFC"]),
      player("cb2", ["DFC"]), player("ld", ["LD"]), player("mc1", ["MC"]),
      player("mc2", ["MC"]), player("mco", ["MCO"]), player("ei", ["EI"]),
      player("lautaro", ["DC"], 99), player("ed", ["ED"]),
    ];

    const lineup = defaultLineup(squad);
    const midfieldIds = new Set(["mc1", "mc2", "mco"]);
    expect(lineup.slice(5, 8).filter(Boolean).every((id) => midfieldIds.has(id))).toBe(true);
    expect(lineup.slice(5, 8)).not.toContain("lautaro");
  });

  it("deja vacíos los puestos de MC si solo hay un MCO", () => {
    const squad = [
      player("gk", ["GK"]), player("li", ["LI"]), player("cb1", ["DFC"]),
      player("cb2", ["DFC"]), player("ld", ["LD"]), player("dc1", ["DC"]),
      player("dc2", ["DC"]), player("mco", ["MCO"]), player("ei", ["EI"]),
      player("dc3", ["DC"]), player("ed", ["ED"]),
    ];

    const lineup = defaultLineup(squad);
    expect(lineup.slice(5, 8)).toEqual(["", "", ""]);
  });
});


describe("mejor alineación inicial por plantilla", () => {
  it("elige una formación que encaja con el Inter y alinea sus once mejores especialistas", () => {
    const inter = generateAllSquads().int ?? [];
    const setup = bestStartingLineup(inter);
    const slots = Object.keys(FORMATION_COORDINATES[setup.formation]);
    const selected = setup.ids.map((id) => inter.find((candidate) => candidate.id === id)).filter(Boolean) as Player[];

    expect(setup.formation).toBe("Táctica 3-5-2");
    expect(setup.ids).toHaveLength(11);
    expect(new Set(setup.ids.filter(Boolean)).size).toBe(setup.ids.filter(Boolean).length);
    expect(selected).toHaveLength(11);
    setup.ids.forEach((id, index) => {
      const candidate = inter.find((item) => item.id === id);
      expect(id).toBeTruthy();
      expect(candidate && playerPosCodes(candidate)).toContain(slotPosCode(slots[index]));
    });
    expect(selected.map((candidate) => candidate.name)).toContain("Lautaro Martínez");
  });

  it("deja vacíos los puestos sin especialista y prioriza cubrir el máximo de huecos", () => {
    const squad = [
      player("gk", ["GK"]), player("li", ["LI"]), player("cb1", ["DFC"]),
      player("cb2", ["DFC"]), player("cb3", ["DFC"]), player("ld", ["LD"]),
      player("mc1", ["MC"]), player("mcd", ["MCD"]), player("mc2", ["MC"]),
      player("dc1", ["DC"]),
    ];
    const setup = bestStartingLineup(squad);
    expect(setup.ids).toHaveLength(11);
    expect(setup.filledSlots).toBe(10);
    expect(setup.ids.filter(Boolean)).toHaveLength(10);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import type { Player } from "@/data/players";
import {
  calculateTacticalFit,
  chooseAITactics,
  DEFAULT_TACTICS,
  normalizeTactics,
  setTacticalSystem,
  TACTICAL_SYSTEMS,
  tacticalMatchupMultiplier,
  tacticsModifiers,
  TACTICAL_SYSTEMS_FOR_UI,
  TACTICAL_MENTALITIES,
  TACTICAL_OPTIONS_BY_MENTALITY,
  TACTICAL_GAME_STYLES,
  setTacticalGameStyle,
  createTacticPlan,
  type TacticalSystem,
} from "@/lib/teamTactics";

function makeXI(profile: "lento" | "rapido" | "tecnico"): Player[] {
  const positions = ["GK", "LI", "DFC", "DFC", "LD", "MC", "MC", "MCO", "EI", "DC", "ED"];
  const stats = {
    lento: { PAC: 18, SHO: 58, PAS: 62, DRI: 55, DEF: 24, PHY: 18 },
    rapido: { PAC: 91, SHO: 76, PAS: 72, DRI: 81, DEF: 79, PHY: 90 },
    tecnico: { PAC: 65, SHO: 68, PAS: 91, DRI: 90, DEF: 58, PHY: 62 },
  }[profile];
  return positions.map((position, index) => ({
    id: `${profile}-${index}`,
    name: `${profile}-${index}`,
    positions: [position] as any,
    rating: 70,
    potential: 75,
    age: 25,
    teamId: `test-${profile}`,
    marketValue: 1,
    isReal: false,
    goals: 0,
    assists: 0,
    appearances: 0,
    injuredUntil: 0,
    morale: 70,
    formHistory: [],
    energy: 92,
    attributes: { ...stats },
  } as Player));
}

describe("sistemas tácticos", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("expone nueve tácticas jugables con ventajas, riesgos y relaciones coherentes", () => {
    expect(TACTICAL_SYSTEMS_FOR_UI).toHaveLength(9);
    for (const system of TACTICAL_SYSTEMS_FOR_UI) {
      expect(system.advantages.length).toBeGreaterThan(0);
      expect(system.risks.length).toBeGreaterThan(0);
      expect(system.goodAgainst.length).toBeGreaterThan(0);
      expect(system.vulnerableTo.length).toBeGreaterThan(0);
      for (const rivalId of system.goodAgainst) {
        const rival = TACTICAL_SYSTEMS_FOR_UI.find((item) => item.id === rivalId)!;
        expect(rival.vulnerableTo, `${system.id} debe contrarrestar ${rivalId}`).toContain(system.id);
      }
      for (const rivalId of system.vulnerableTo) {
        const rival = TACTICAL_SYSTEMS_FOR_UI.find((item) => item.id === rivalId) ?? TACTICAL_SYSTEMS.find((item) => item.id === rivalId)!;
        expect(rival.goodAgainst, `${rivalId} debe castigar a ${system.id}`).toContain(system.id);
      }
    }
  });

  it("presenta tres tácticas por mentalidad y cinco estilos de juego independientes", () => {
    expect(TACTICAL_MENTALITIES.map((item) => item.id)).toEqual(["defensive", "balanced", "offensive"]);
    expect(TACTICAL_SYSTEMS_FOR_UI).toHaveLength(9);
    expect(TACTICAL_OPTIONS_BY_MENTALITY.defensive.map((item) => item.id)).toEqual([
      "low_block_counter", "close_out", "vertical_transition",
    ]);
    expect(TACTICAL_OPTIONS_BY_MENTALITY.balanced.map((item) => item.id)).toEqual([
      "possession", "mid_block_press", "build_up",
    ]);
    expect(TACTICAL_OPTIONS_BY_MENTALITY.offensive.map((item) => item.id)).toEqual([
      "gegenpress", "wing_play", "inside_overload",
    ]);
    expect(TACTICAL_GAME_STYLES).toHaveLength(5);
    for (const mentality of TACTICAL_MENTALITIES) {
      for (const option of TACTICAL_OPTIONS_BY_MENTALITY[mentality.id]) {
        expect(option.advantages.length).toBeGreaterThan(0);
        expect(option.risks.length).toBeGreaterThan(0);
      }
    }
    expect(normalizeTactics({ system: "offside_trap" }).system).toBe("mid_block_press");
    expect(normalizeTactics({ system: "inside_overload" }).system).toBe("inside_overload");
    expect(normalizeTactics({ system: "close_out" }).system).toBe("close_out");
  });

  it("entra en plantilla con un plan realmente equilibrado por defecto", () => {
    expect(DEFAULT_TACTICS.system).toBe("possession");
    expect(DEFAULT_TACTICS.mentality).toBe("balanced");
    expect(DEFAULT_TACTICS.gameStyle).toBe("balanced");
    expect(TACTICAL_OPTIONS_BY_MENTALITY.balanced.some((item) => item.id === DEFAULT_TACTICS.system)).toBe(true);
    const initialPlan = createTacticPlan({ id: "plan-a", name: "Plan equilibrado" });
    expect(initialPlan.tactics.system).toBe("possession");
    expect(initialPlan.tactics.gameStyle).toBe("balanced");
  });

  it("permite cambiar el estilo de juego sin alterar mentalidad ni táctica", () => {
    const tactic = setTacticalSystem(DEFAULT_TACTICS, "low_block_counter");
    const counterStyle = setTacticalGameStyle(tactic, "counter");
    expect(counterStyle.system).toBe("low_block_counter");
    expect(counterStyle.mentality).toBe("defensive");
    expect(counterStyle.gameStyle).toBe("counter");
    expect(counterStyle.style).toBe(tactic.style);
    const withPlayerRoles = setTacticalGameStyle({ ...tactic, captainId: "captain-2", penaltyTakerId: "penalty-2" }, "wide");
    expect(withPlayerRoles.system).toBe("low_block_counter");
    expect(withPlayerRoles.gameStyle).toBe("wide");
    expect(withPlayerRoles.captainId).toBe("captain-2");
    expect(withPlayerRoles.penaltyTakerId).toBe("penalty-2");
    const oldVersion = normalizeTactics({ system: "direct_play", passingStyle: "direct" });
    expect(oldVersion.system).toBe("vertical_transition");
    expect(oldVersion.gameStyle).toBe("direct");
    expect(normalizeTactics({ system: "set_piece" }).system).toBe("possession");
  });

  it("migra los campos antiguos y elimina órdenes secundarias que ya no se muestran", () => {
    const migrated = normalizeTactics({
      style: "defensive",
      pressure: "low",
      defenseLine: "low",
      counterAttack: true,
      timeWasting: "high",
      secondaryInstructions: ["regroup", "early_crosses", "attack_set_pieces"],
      captainId: "captain-1",
    });
    expect(migrated.system).toBe("low_block_counter");
    expect(migrated.secondaryInstructions).toEqual([]);
    expect(migrated.captainId).toBe("captain-1");
    expect(normalizeTactics({ system: "not-a-system" as TacticalSystem }).system).toBe("possession");
  });

  it("un once lento y sin fondo rinde peor en presión que uno rápido", () => {
    const lento = makeXI("lento");
    const rapido = makeXI("rapido");
    const fitLento = calculateTacticalFit("gegenpress", lento);
    const fitRapido = calculateTacticalFit("gegenpress", rapido);
    const fitTecnico = calculateTacticalFit("possession", makeXI("tecnico"));
    expect(fitLento).toBeLessThan(66);
    expect(fitRapido).toBeGreaterThanOrEqual(84);
    expect(fitTecnico).toBeGreaterThan(fitLento);

    const badPress = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "gegenpress"), lento);
    const neutralPossession = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "possession"), lento);
    expect(badPress.attack).toBeLessThan(neutralPossession.attack);
    expect(badPress.injuryRisk).toBeGreaterThan(neutralPossession.injuryRisk);
  });

  it("el gegenpress pierde intensidad cuando el once llega agotado al tramo final", () => {
    const xi = makeXI("rapido");
    const press = setTacticalSystem(DEFAULT_TACTICS, "gegenpress");
    const firstHalf = tacticsModifiers(press, xi, { minute: 45, averageStamina: 55 });
    const late = tacticsModifiers(press, xi, { minute: 70, averageStamina: 55 });
    expect(late.attack).toBeLessThan(firstHalf.attack);
    expect(late.highRecoveries).toBeLessThan(firstHalf.highRecoveries);
  });

  it("crea perfiles de ocasión distintos según el sistema principal y el estilo de juego", () => {
    const xi = makeXI("rapido");
    const gegenpress = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "gegenpress"), xi);
    const possession = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "possession"), xi);
    const wings = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "wing_play"), xi);
    const direct = tacticsModifiers(setTacticalGameStyle(DEFAULT_TACTICS, "direct"), xi);
    const counterStyle = tacticsModifiers(setTacticalGameStyle(setTacticalSystem(DEFAULT_TACTICS, "low_block_counter"), "counter"), xi);
    const possessionStyle = tacticsModifiers(setTacticalGameStyle(setTacticalSystem(DEFAULT_TACTICS, "low_block_counter"), "possession"), xi);

    expect(gegenpress.highRecoveries).toBeGreaterThan(possession.highRecoveries);
    expect(possession.possession).toBeGreaterThan(gegenpress.possession);
    expect(wings.crossThreat).toBeGreaterThan(possession.crossThreat);
    expect(direct.longBallThreat).toBeGreaterThan(possession.longBallThreat);
    expect(counterStyle.counterThreat).toBeGreaterThan(possessionStyle.counterThreat);
    expect(possessionStyle.possession).toBeGreaterThan(counterStyle.possession);
    expect(normalizeTactics({ system: "set_piece" }).system).toBe("possession");
  });

  it("aplica relaciones de ventaja y vulnerabilidad con intensidad acotada", () => {
    expect(tacticalMatchupMultiplier("gegenpress", "possession")).toBeGreaterThan(1);
    expect(tacticalMatchupMultiplier("gegenpress", "build_up")).toBeLessThan(1);
    expect(tacticalMatchupMultiplier("possession", "low_block_counter")).toBeGreaterThan(1);
    expect(tacticalMatchupMultiplier("possession", "vertical_transition")).toBeLessThan(1);
    for (const system of TACTICAL_SYSTEMS_FOR_UI) {
      for (const rival of TACTICAL_SYSTEMS_FOR_UI) {
        const multiplier = tacticalMatchupMultiplier(system.id, rival.id);
        expect(multiplier).toBeGreaterThanOrEqual(0.925);
        expect(multiplier).toBeLessThanOrEqual(1.075);
      }
    }
  });

  it("vincula las ventajas y los riesgos visibles a modificadores que usa el partido", () => {
    const xi = makeXI("tecnico");
    const base = tacticsModifiers(DEFAULT_TACTICS, xi);
    const lowBlock = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "low_block_counter"), xi);
    const vertical = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "vertical_transition"), xi);
    const midBlock = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "mid_block_press"), xi);
    const buildUp = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "build_up"), xi);
    const press = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "gegenpress"), xi);
    const wide = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "wing_play"), xi);
    const inside = tacticsModifiers(setTacticalSystem(DEFAULT_TACTICS, "inside_overload"), xi);

    // Bloque bajo: reduce el peligro rival, pero también las ocasiones propias.
    expect(lowBlock.defense).toBeGreaterThan(base.defense);
    expect(lowBlock.chanceCreation).toBeLessThan(base.chanceCreation);

    // Transición: más contras a cambio de menos control del balón.
    expect(vertical.counterThreat).toBeGreaterThan(base.counterThreat);
    expect(vertical.possession).toBeLessThan(base.possession);

    // Presión media/alta: se refleja en robos, desgaste y disciplina.
    expect(midBlock.highRecoveries).toBeGreaterThan(base.highRecoveries);
    expect(midBlock.stamina).toBeGreaterThan(base.stamina);
    expect(midBlock.foulRisk).toBeGreaterThan(base.foulRisk);
    expect(press.highRecoveries).toBeGreaterThan(base.highRecoveries);
    expect(press.defensiveRisk).toBeGreaterThan(base.defensiveRisk);

    // Salida desde atrás: más posesión, pero más exposición ante las contras.
    expect(buildUp.possession).toBeGreaterThan(base.possession);
    expect(buildUp.defensiveRisk).toBeGreaterThan(base.defensiveRisk);

    // Bandas y ataque interior: afectan a centros y al perfil de ocasiones.
    expect(wide.crossThreat).toBeGreaterThan(base.crossThreat);
    expect(inside.centralThreat).toBeGreaterThan(base.centralThreat);
    expect(inside.crossThreat).toBeLessThan(base.crossThreat);

    const visibleText = TACTICAL_SYSTEMS_FOR_UI.flatMap((item) => [item.identity, ...item.advantages, ...item.risks]).join(" ").toLowerCase();
    expect(visibleText).not.toContain("pases filtrados");
    expect(visibleText).not.toContain("pase filtrado");
  });

  it("elige una táctica de CPU determinista para la misma plantilla y equipo", () => {
    const xi = makeXI("rapido");
    const first = chooseAITactics(xi, "cpu-club", { minute: 0 });
    const second = chooseAITactics(xi, "cpu-club", { minute: 0 });
    expect(first.system).toBe(second.system);
    expect(first.aiManaged).toBe(true);
    const trailing = chooseAITactics(xi, "cpu-club", { minute: 78, scoreDiff: -1 });
    expect(TACTICAL_SYSTEMS_FOR_UI.some((system) => system.id === trailing.system)).toBe(true);
  });
});

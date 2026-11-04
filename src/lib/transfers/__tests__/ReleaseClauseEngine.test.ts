import { beforeEach, describe, expect, it, vi } from "vitest";

const { desire, currentRole } = vi.hoisted(() => ({
  desire: vi.fn<(id: string, key: string) => number>(),
  currentRole: vi.fn<() => "star" | "starter" | "rotation" | "secondary" | "prospect">(),
}));
vi.mock("../PlayerDecision", () => ({
  desireToLeave: (id: string, key: string) => desire(id, key),
  wantsOut: (id: string, key: string) => desire(id, key) >= 0.68,
  wageDemand: () => 2_000_000,
  expectedPlayingTime: () => 0.85,
}));
vi.mock("../MarketPlayerSignals", () => ({
  getMarketPlayerSquadRole: () => currentRole(),
}));
vi.mock("../ClubStrategy", () => ({
  getClubProfile: (clubId: string) => ({
    clubId, aggression: 0.8, reputation: clubId === "buyer" ? 0.9 : 0.5,
  }),
}));

import { createTransferOffer } from "../NegotiationEngine";
import { RELEASE_CLAUSE_RULES } from "../constants";
import {
  evaluateClauseContract,
  isAiReleaseClauseTimingAllowed,
  releaseClauseProbability,
  releaseClauseWageDemand,
  releaseClauseTargetQualityMultiplier,
  releaseClausePriceAttractivenessMultiplier,
  isReleaseClauseBargain,
  releaseClausePromiseProtectionMultiplier,
  claimUserReleaseClauseOpportunity,
  hasUserReleaseClauseTargetBeenTried,
  markUserReleaseClauseTargetTried,
  releaseClauseAiQuotaReason,
  releaseClauseUserIncomingQuotaReason,
  restoreReleaseClauseState,
  snapshotReleaseClauseState,
  resetReleaseClauseState,
} from "../ReleaseClauseEngine";
import type { MarketPlayer } from "../types";

const player: MarketPlayer = {
  id: "p1", name: "Jugador", age: 25, ovr: 82, potential: 85,
  position: "MC", group: "CM", nation: "España", clubId: "seller",
  leagueId: "league", value: 30_000_000,
  contract: { yearsLeft: 2, wage: 2_000_000, releaseClause: 60_000_000, signingBonus: 0 },
  personality: { ambition: 0.6, loyalty: 0.4, greed: 0.5, playingTimeDesire: 0.7, adventure: 0.5 },
  transferListed: false, listReason: null, loanListed: false,
  loanClubId: null, loanOwnerClubId: null, loanEndDate: null, minutesShare: 0.4,
  attributes: { pace: 70, passing: 80, physical: 70, defending: 65 },
};

describe("ReleaseClauseEngine", () => {
  beforeEach(() => {
    resetReleaseClauseState();
    desire.mockReset();
    currentRole.mockReset();
    currentRole.mockReturnValue("rotation");
  });

  it("da más probabilidad al jugador descontento que al satisfecho", () => {
    desire.mockReturnValue(0.9);
    const unhappy = releaseClauseProbability(player, "buyer", "2026-07-01");
    desire.mockReturnValue(0.1);
    const happy = releaseClauseProbability(player, "buyer", "2026-07-01");
    expect(unhappy).toBeGreaterThan(happy);
  });

  it("mantiene una probabilidad residual visible para un jugador satisfecho sin borrar la protección de rol", () => {
    desire.mockReturnValue(0.12);
    currentRole.mockReturnValue("star");
    const probability = releaseClauseProbability(player, "buyer", "2026-07-10");
    expect(probability).toBeGreaterThan(0);
    expect(probability).toBeGreaterThanOrEqual(RELEASE_CLAUSE_RULES.happyPlayerMinimumAttemptChance.star);
  });

  it("da a un jugador de rotación una probabilidad ligeramente superior a una promesa", () => {
    desire.mockReturnValue(0.55);
    currentRole.mockReturnValue("rotation");
    const rotationProbability = releaseClauseProbability(player, "buyer", "2026-07-10");
    currentRole.mockReturnValue("prospect");
    const prospectProbability = releaseClauseProbability(player, "buyer", "2026-07-10");
    expect(rotationProbability).toBeGreaterThan(prospectProbability);
    expect(rotationProbability / prospectProbability).toBeCloseTo(1 / 0.62, 2);
  });


  it("da prioridad de búsqueda a jugadores de mayor nivel cuando el comprador puede pagarlos", () => {
    const important = { ...player, ovr: 88, value: 75_000_000 };
    const modest = { ...player, ovr: 73, value: 7_000_000 };
    expect(releaseClauseTargetQualityMultiplier(important))
      .toBeGreaterThan(releaseClauseTargetQualityMultiplier(modest));
  });

  it("detecta cláusulas mal ajustadas y las prioriza frente a su valor de mercado", () => {
    const bargain = { ...player, value: 200_000_000, contract: { ...player.contract, releaseClause: 210_000_000 } };
    const fair = { ...player, value: 200_000_000, contract: { ...player.contract, releaseClause: 300_000_000 } };
    expect(isReleaseClauseBargain(bargain)).toBe(true);
    expect(isReleaseClauseBargain(fair)).toBe(false);
    expect(releaseClausePriceAttractivenessMultiplier(bargain)).toBe(2);
    expect(releaseClausePriceAttractivenessMultiplier(bargain))
      .toBeGreaterThan(releaseClausePriceAttractivenessMultiplier(fair));
  });

  it("configura volumen suficiente para 200+ clausulazos IA-IA en verano", () => {
    expect(RELEASE_CLAUSE_RULES.maxAiGlobalByWindow.summer).toBeGreaterThanOrEqual(200);
    expect(RELEASE_CLAUSE_RULES.aiAttemptsPerClubDay.summer).toBeGreaterThan(1);
    expect(RELEASE_CLAUSE_RULES.maxPerClubPerWindow.summer).toBeGreaterThan(1);
    expect(RELEASE_CLAUSE_RULES.maxAiGlobalByWindow.winter).toBeLessThan(50);
  });

  it("usa los multiplicadores de rol acordados", () => {
    expect(RELEASE_CLAUSE_RULES.roleProbabilityMultiplier).toEqual({
      star: 0.5,
      starter: 0.75,
      rotation: 1,
      secondary: 1,
      prospect: 0.62,
    });
  });

  it("protege especialmente a las promesas jóvenes con potencial alto", () => {
    const promise = { ...player, age: 19, ovr: 70, potential: 89 };
    const established = { ...player, age: 25, ovr: 82, potential: 85 };
    expect(releaseClausePromiseProtectionMultiplier(promise)).toBe(0.22);
    expect(releaseClausePromiseProtectionMultiplier(established)).toBe(1);
    desire.mockReturnValue(0.72);
    const promiseProbability = releaseClauseProbability(promise, "buyer", "2026-07-10");
    const establishedProbability = releaseClauseProbability(established, "buyer", "2026-07-10");
    expect(promiseProbability).toBeLessThan(establishedProbability * 0.3);
    expect(releaseClauseWageDemand(promise, "buyer", "2026-07-10"))
      .toBeGreaterThan(releaseClauseWageDemand(established, "buyer", "2026-07-10"));
  });

  it("permite ventanas tranquilas, pero mantiene rondas suficientes durante el mercado", () => {
    expect(RELEASE_CLAUSE_RULES.userIncomingQuietWindowChance.summer).toBeGreaterThan(0);
    expect(RELEASE_CLAUSE_RULES.userIncomingQuietWindowChance.summer).toBeLessThan(0.2);
    expect(RELEASE_CLAUSE_RULES.userIncomingDailyOpportunityChance.summer).toBeGreaterThan(0.1);
    expect(RELEASE_CLAUSE_RULES.userIncomingDailyOpportunityChance.summer).toBeGreaterThanOrEqual(0.2);
    expect(RELEASE_CLAUSE_RULES.userIncomingQuietWindowMultiplier).toBeGreaterThan(0);
    expect(RELEASE_CLAUSE_RULES.userIncomingQuietWindowMultiplier).toBeLessThan(0.6);
    expect(RELEASE_CLAUSE_RULES.userIncomingStartDay.summer).toBe(1);
    expect(RELEASE_CLAUSE_RULES.userIncomingStartDay.winter).toBe(1);
    expect(RELEASE_CLAUSE_RULES.userIncomingBuyerAttemptsPerOpportunity.summer).toBe(8);
    expect(RELEASE_CLAUSE_RULES.userIncomingPlayerAttemptsPerBuyer.summer).toBe(4);
    expect(RELEASE_CLAUSE_RULES.userIncomingDailyOpportunityChance.summer).toBeGreaterThanOrEqual(0.35);
    expect(RELEASE_CLAUSE_RULES.maxUserIncomingByWindow.summer).toBe(2);
    expect(RELEASE_CLAUSE_RULES.maxUserIncomingByWindow.winter).toBe(1);
  });

  it("migra las listas antiguas de jugadores tanteados que podían bloquear la ventana", () => {
    restoreReleaseClauseState({
      windowCounts: [],
      globalCounts: [],
      userTargetedPlayers: ["2026:summer:p1"],
    });
    expect(hasUserReleaseClauseTargetBeenTried("2026-07-10", "p1")).toBe(false);
    expect(snapshotReleaseClauseState().userTargetTrackingVersion).toBe(3);
  });

  it("no repite una ronda diaria, pero permite que otro comprador pruebe al mismo jugador", () => {
    expect(claimUserReleaseClauseOpportunity("2026-07-10")).toBe(true);
    expect(claimUserReleaseClauseOpportunity("2026-07-10")).toBe(false);
    expect(hasUserReleaseClauseTargetBeenTried("2026-07-10", "p1")).toBe(false);
    markUserReleaseClauseTargetTried("2026-07-10", "p1", "buyer-a");
    expect(hasUserReleaseClauseTargetBeenTried("2026-07-10", "p1", "buyer-a")).toBe(true);
    expect(hasUserReleaseClauseTargetBeenTried("2026-07-10", "p1", "buyer-b")).toBe(false);
    expect(hasUserReleaseClauseTargetBeenTried("2027-07-10", "p1", "buyer-a")).toBe(false);
  });

  it("hace más difícil clausular a una estrella que a un jugador secundario", () => {
    desire.mockReturnValue(0.72);
    currentRole.mockReturnValue("star");
    const starProbability = releaseClauseProbability(player, "buyer", "2026-07-10");
    currentRole.mockReturnValue("secondary");
    const secondaryProbability = releaseClauseProbability(player, "buyer", "2026-07-10");
    expect(secondaryProbability).toBeGreaterThan(starProbability);
  });

  it("exige mucho más salario a un jugador feliz, leal y con rol de estrella", () => {
    desire.mockReturnValue(0.08);
    currentRole.mockReturnValue("star");
    const happyDemand = releaseClauseWageDemand({
      ...player,
      personality: { ...player.personality, loyalty: 0.95 },
    }, "buyer", "2026-07-10");
    desire.mockReturnValue(0.88);
    currentRole.mockReturnValue("secondary");
    const unhappyDemand = releaseClauseWageDemand(player, "buyer", "2026-07-10");
    expect(happyDemand).toBeGreaterThan(unhappyDemand * 2);
  });

  it("mantiene IA-IA desde el segundo día y habilita la ronda del usuario desde el primero con azar", () => {
    expect(isAiReleaseClauseTimingAllowed("2026-07-01")).toBe(false);
    expect(isAiReleaseClauseTimingAllowed("2026-07-02")).toBe(true);
    expect(isAiReleaseClauseTimingAllowed("2026-07-03")).toBe(true);
    expect(isAiReleaseClauseTimingAllowed("2026-09-02")).toBe(false);
    expect(isAiReleaseClauseTimingAllowed("2027-01-01")).toBe(false);
    expect(isAiReleaseClauseTimingAllowed("2027-01-02")).toBe(true);
    expect(RELEASE_CLAUSE_RULES.userIncomingStartDay.summer).toBe(1);
    expect(RELEASE_CLAUSE_RULES.userIncomingDailyOpportunityChance.summer).toBeLessThan(1);
    expect(RELEASE_CLAUSE_RULES.userIncomingDailyOpportunityChance.winter).toBeLessThan(1);
    expect(RELEASE_CLAUSE_RULES.userIncomingQuietWindowMultiplier).toBeGreaterThan(0);
  });

  it("reduce todavía más la probabilidad durante el mercado de invierno", () => {
    desire.mockReturnValue(0.72);
    const summer = releaseClauseProbability(player, "buyer", "2026-07-10");
    const winter = releaseClauseProbability(player, "buyer", "2027-01-10");
    expect(winter).toBeGreaterThan(0);
    expect(winter).toBeLessThan(summer);
  });

  it("no permite clausular jugadores transferibles o cedibles", () => {
    desire.mockReturnValue(1);
    expect(releaseClauseProbability({ ...player, transferListed: true }, "buyer")).toBe(0);
    expect(releaseClauseProbability({ ...player, loanListed: true }, "buyer")).toBe(0);
  });

  it("un jugador feliz y leal puede rechazar una propuesta aunque haya cláusula", () => {
    desire.mockReturnValue(0.05);
    currentRole.mockReturnValue("star");
    const happy = { ...player, personality: { ...player.personality, loyalty: 0.98 } };
    const decision = evaluateClauseContract(happy, "buyer", 2_000_000, "2026-07-01");
    expect(decision.accepted).toBe(false);
    expect(decision.message).toContain("muy satisfecho");
  });

  it("un jugador feliz y poco leal puede aceptar si recibe una oferta extraordinaria", () => {
    desire.mockReturnValue(0.08);
    currentRole.mockReturnValue("secondary");
    const happy = { ...player, personality: { ...player.personality, loyalty: 0.05 } };
    const demand = releaseClauseWageDemand(happy, "buyer", "2026-07-10");
    const decision = evaluateClauseContract(happy, "buyer", demand * 3.2, "2026-07-10");
    expect(decision.accepted).toBe(true);
  });

  it("limita IA-vs-IA por ventana, club y día con cupos distintos en verano e invierno", () => {
    restoreReleaseClauseState({
      windowCounts: [["2026:summer", [["buyer", 1]]]],
      globalCounts: [["2026:summer", 280]],
      dailyCounts: [["2026:summer:2026-07-10", 12]],
    });
    expect(releaseClauseAiQuotaReason("other", "2026-07-10")).toContain("límite global");

    restoreReleaseClauseState({
      windowCounts: [["2026:summer", [["buyer", 3]]]],
      globalCounts: [["2026:summer", 1]],
      dailyCounts: [],
    });
    expect(releaseClauseAiQuotaReason("buyer", "2026-07-11")).toContain("límite de clausulazos");

    restoreReleaseClauseState({
      windowCounts: [],
      globalCounts: [["2026:summer", 2]],
      dailyCounts: [["2026:summer:2026-07-11", 12]],
    });
    expect(releaseClauseAiQuotaReason("other", "2026-07-11")).toContain("límite diario");

    restoreReleaseClauseState({
      windowCounts: [],
      globalCounts: [["2026:winter", 24]],
      dailyCounts: [],
    });
    expect(releaseClauseAiQuotaReason("buyer", "2027-01-10")).toContain("límite global");
  });

  it("limita las salidas del club del usuario a dos en verano y una en invierno", () => {
    restoreReleaseClauseState({
      windowCounts: [],
      globalCounts: [],
      userIncomingCounts: [["2026:summer", 2], ["2027:winter", 1]],
    });
    expect(releaseClauseUserIncomingQuotaReason("2026-07-12")).toContain("máximo de 2 clausulazos");
    expect(releaseClauseUserIncomingQuotaReason("2027-01-12")).toContain("máximo de 1 clausulazo");
    expect(releaseClauseUserIncomingQuotaReason("2027-07-12")).toBeNull();
  });


  it("un jugador muy descontento puede aceptar un contrato atractivo", () => {
    desire.mockReturnValue(0.92);
    const decision = evaluateClauseContract(player, "buyer", 3_200_000, "2026-07-10");
    expect(decision.accepted).toBe(true);
  });

  it("transporta la cláusula negociada en una oferta de fichaje", () => {
    const offer = createTransferOffer({
      playerId: "p1", playerName: "Jugador", buyerClubId: "buyer",
      sellerClubId: "seller", amount: 60_000_000, wageOffer: 2_000_000,
      clauses: { releaseClause: 95_000_000 },
    });
    expect(offer.clauses.releaseClause).toBe(95_000_000);
  });

  it("persiste y restaura contadores y rondas anti-exploit con compatibilidad antigua", () => {
    claimUserReleaseClauseOpportunity("2026-07-10");
    markUserReleaseClauseTargetTried("2026-07-10", "p1", "buyer-a");
    const state = snapshotReleaseClauseState();
    expect(state.windowCounts).toEqual([]);
    restoreReleaseClauseState(undefined);
    expect(snapshotReleaseClauseState().globalCounts).toEqual([]);
    // Los saves V1 anteriores sólo tenían estos dos campos.
    restoreReleaseClauseState({ windowCounts: [], globalCounts: [] });
    expect(snapshotReleaseClauseState().dailyCounts).toEqual([]);
    expect(snapshotReleaseClauseState().userOpportunityDates).toEqual([]);
    restoreReleaseClauseState(state);
    expect(snapshotReleaseClauseState()).toEqual(state);
    expect(claimUserReleaseClauseOpportunity("2026-07-10")).toBe(false);
    expect(hasUserReleaseClauseTargetBeenTried("2026-07-10", "p1", "buyer-a")).toBe(true);
  });
});

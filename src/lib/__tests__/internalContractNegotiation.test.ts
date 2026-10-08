import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { MarketPlayer } from "@/lib/transfers/types";
import {
  evaluateInternalOffer,
  submitInternalContractOffer,
  startInternalContractNegotiation,
  getInternalContractNegotiation,
  clearInternalContractNegotiations,
  type InternalContractOffer,
} from "@/lib/transfers/InternalContractNegotiation";
import { INTERNAL_CONTRACT_NEGOTIATION } from "@/lib/transfers/constants";
import { additionalWageCommitment, registerRenewal, setFinances, setUserClubBridge, snapshotFinances } from "@/lib/transfers/BudgetManager";
import { registerDynamicMarketPlayer, unregisterDynamicMarketPlayer } from "@/lib/transfers/PlayerIndex";
import { applyMonthlyYouthGrowth } from "@/lib/academy/academyProgression";
import { syncCalledUpAcademyPlayer } from "@/lib/academy/academyCallUp";
import type { AcademyPlayer, ClubAcademyState } from "@/lib/academy/academyTypes";
import type { PlayerStats } from "@/store/playersStore";

const player: MarketPlayer = {
  id: "900000123",
  name: "Mario García",
  age: 20,
  ovr: 76,
  potential: 87,
  position: "CM",
  group: "CM",
  nation: "España",
  clubId: "club-test",
  leagueId: "league-test",
  value: 18_000_000,
  contract: {
    yearsLeft: 2,
    wage: 1_000_000,
    releaseClause: 36_000_000,
    signingBonus: 500_000,
  },
  personality: {
    ambition: 0.6,
    loyalty: 0.78,
    greed: 0.35,
    playingTimeDesire: 0.85,
    adventure: 0.2,
  },
  transferListed: false,
  listReason: null,
  loanListed: false,
  loanClubId: null,
  loanOwnerClubId: "club-test",
  loanEndDate: null,
  minutesShare: 0,
  attributes: { pace: 70, passing: 78, physical: 66, defending: 52 },
};

const academyPlayer: AcademyPlayer = {
  id: 900000123,
  teamId: "club-test",
  name: "Mario García",
  nation: "España",
  birthdate: "2006-05-03",
  age: 20,
  positions: ["CM"],
  ovr: 76,
  potential: 87,
  potentialEstimate: { min: 84, max: 89 },
  attributes: { PAC: 70, SHO: 60, PAS: 78, DRI: 74, DEF: 52, PHY: 66 },
  traits: ["hard-worker"],
  growthProfile: "normal",
  joinedSeason: 2025,
  contractYearsLeft: 2,
  status: "academy",
  minutesThisSeason: 0,
};

const academyState: ClubAcademyState = {
  teamId: "club-test",
  facilityLevel: 3,
  youthCoach: { specialty: "MID", level: 3 },
  players: [academyPlayer],
  lastIntakeSeason: 2025,
  manualPromotionAvailable: true,
  lastProgressionDate: "2026-07-01",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function offer(overrides: Partial<InternalContractOffer> = {}): InternalContractOffer {
  return {
    years: 3,
    wage: 2_000_000,
    releaseClause: 36_000_000,
    signingBonus: 250_000,
    squadRole: "prospect",
    ...overrides,
  };
}

beforeEach(() => {
  clearInternalContractNegotiations();
  registerDynamicMarketPlayer(player);
});
afterEach(() => unregisterDynamicMarketPlayer(player.id));

describe("flujo de cierre tras aceptación", () => {
  it("deja el acuerdo pendiente hasta confirmar el cierre", () => {
    const state = startInternalContractNegotiation({
      playerId: player.id,
      clubId: "club-test",
      kind: "renewal",
      date: "2026-10-08",
      context: { morale: 95, currentRole: "starter", yearsAtClub: 6, satisfaction: 95 },
    });
    if ("blockedUntil" in state) throw new Error("La negociación no debería estar bloqueada");
    const accepted = submitInternalContractOffer({
      negotiationId: state.id,
      offer: { ...state.offer, wage: Math.max(state.offer.wage, state.demand.wage), years: state.demand.years, squadRole: state.demand.role, signingBonus: state.demand.signingBonus },
      date: "2026-10-08",
      context: { morale: 95, currentRole: "starter", yearsAtClub: 6, satisfaction: 95 },
    });
    if (accepted.verdict !== "accepted") throw new Error("La oferta de prueba debería ser aceptada");
    expect(accepted.negotiation.pendingAcceptedOffer).toBeDefined();
    expect(accepted.negotiation.status).toBe("open");
  });
});

describe("presupuesto salarial de contratos internos", () => {
  it("una renovación descuenta sólo el incremento salarial y la prima del presupuesto de fichajes", () => {
    let budget = 200_000_000;
    let wageBudget = 40_000_000;
    setUserClubBridge({
      clubId: "club-test",
      getBudget: () => budget,
      setBudget: (value) => { budget = value; },
      getWageBudget: () => wageBudget,
      setWageBudget: (value) => { wageBudget = value; },
    });
    setFinances({
      clubId: "club-test",
      budget,
      initialBudget: budget,
      totalBudget: budget,
      wageBudget,
      wageBill: 100_000_000,
      spent: 0,
      earned: 0,
    });

    registerRenewal("club-test", 1_000_000, 20_000_000, 2_000_000);
    const finances = snapshotFinances().find((entry) => entry.clubId === "club-test")!;

    expect(finances.budget).toBe(179_000_000);
    expect(finances.wageBudget).toBe(21_000_000);
    expect(finances.wageBill).toBe(119_000_000);
    expect(finances.budget - finances.wageBudget).toBe(158_000_000);
    expect(budget).toBe(179_000_000);
    expect(wageBudget).toBe(21_000_000);

    setUserClubBridge(null);
  });

  it("sólo consume la subida salarial al renovar", () => {
    expect(additionalWageCommitment(20_000_000, 25_000_000)).toBe(5_000_000);
    expect(additionalWageCommitment(25_000_000, 20_000_000)).toBe(0);
  });

  it("una promoción consume la ficha completa porque parte de salario 0", () => {
    expect(additionalWageCommitment(0, 3_000_000)).toBe(3_000_000);
  });
});

describe("negociación interna de contratos", () => {
  it("acepta una oferta fuerte de un jugador propio", () => {
    const evaluation = evaluateInternalOffer({
      playerId: player.id,
      kind: "renewal",
      date: "2026-08-10",
      player,
      context: { morale: 85, currentRole: "rotation", yearsAtClub: 4 },
      offer: offer({ years: 4, wage: 2_400_000, squadRole: "starter", signingBonus: 800_000 }),
    });

    expect(evaluation.verdict).toBe("accepted");
  });

  it("puede contraofertar antes de rechazar y nunca depende de Math.random", () => {
    const candidateOffers: InternalContractOffer[] = [
      offer({ wage: 1_700_000, years: 2, squadRole: "secondary", signingBonus: 0 }),
      offer({ wage: 1_500_000, years: 3, squadRole: "secondary", signingBonus: 0 }),
      offer({ wage: 1_250_000, years: 2, squadRole: "rotation", signingBonus: 0 }),
      offer({ wage: 1_050_000, years: 1, squadRole: "secondary", signingBonus: 0 }),
    ];

    const verdicts = candidateOffers.map((candidate) => evaluateInternalOffer({
      playerId: player.id,
      kind: "renewal",
      date: "2026-08-10",
      player,
      context: { morale: 62, currentRole: "rotation", yearsAtClub: 1 },
      offer: candidate,
    }).verdict);

    expect(verdicts).toContain("counter");
    expect(evaluateInternalOffer({
      playerId: player.id,
      kind: "renewal",
      date: "2026-08-10",
      player,
      context: { morale: 25, currentRole: "rotation", yearsAtClub: 0 },
      offer: offer({ wage: 200_000, years: 1, squadRole: "secondary", signingBonus: 0 }),
    }).verdict).toBe("rejected");
  });

  it("usa un umbral interno inferior al de los movimientos externos", () => {
    expect(INTERNAL_CONTRACT_NEGOTIATION.acceptanceScoreThreshold).toBeLessThan(
      INTERNAL_CONTRACT_NEGOTIATION.externalAcceptanceScoreReference,
    );
  });

  it("limita a tres contraofertas y conserva un estado reintentable", () => {
    const started = startInternalContractNegotiation({
      playerId: player.id,
      clubId: player.clubId!,
      kind: "renewal",
      date: "2026-08-10",
      context: { morale: 60, currentRole: "rotation", yearsAtClub: 2 },
    });
    expect("blockedUntil" in started).toBe(false);
    if ("blockedUntil" in started) return;

    let state = started;
    let counterRounds = 0;
    for (let index = 0; index < INTERNAL_CONTRACT_NEGOTIATION.maxCounterOffers + 1; index += 1) {
      const result = submitInternalContractOffer({
        negotiationId: state.id,
        date: `2026-08-${String(11 + index).padStart(2, "0")}`,
        context: { morale: 55, currentRole: "rotation", yearsAtClub: 2 },
        offer: offer({ wage: 1_500_000, years: 3, squadRole: "secondary", signingBonus: 0 }),
      });
      state = result.negotiation;
      if (result.verdict === "counter") counterRounds += 1;
      if (result.verdict === "rejected") break;
    }

    expect(counterRounds).toBeLessThanOrEqual(INTERNAL_CONTRACT_NEGOTIATION.maxCounterOffers);
    expect(getInternalContractNegotiation(state.id)?.status).toBe("rejected");
  });
});

describe("progresión de cantera y sincronización", () => {
  it("excluye a un canterano convocado del crecimiento de cantera", () => {
    const calledUp = { ...academyPlayer, status: "called-up" as const };
    const result = applyMonthlyYouthGrowth(calledUp, academyState, "2026-08-15", "save-test");
    expect(result).toBe(calledUp);
    expect(result.ovr).toBe(academyPlayer.ovr);
  });

  it("sincroniza el OVR y atributos ganados en el primer equipo al desconvocar", () => {
    const stats = {
      ...({} as PlayerStats),
      dynamicStats: {
        currentOVR: 81.7,
        potentialOVR: 89.4,
        attributes: { PAC: 72, SHO: 64, PAS: 81, DRI: 77, DEF: 55, PHY: 69 },
        seasonMinutes: 735,
      },
      morale: 74,
    } as PlayerStats;
    const result = syncCalledUpAcademyPlayer(
      { ...academyPlayer, status: "called-up", ovr: 76 },
      undefined,
      stats,
    );

    expect(result.status).toBe("academy");
    expect(result.ovr).toBe(82);
    expect(result.potential).toBe(89);
    expect(result.attributes.PAS).toBe(81);
    expect(result.minutesThisSeason).toBe(735);
  });
});

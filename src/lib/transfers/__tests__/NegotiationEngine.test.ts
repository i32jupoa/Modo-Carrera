import { describe, expect, it } from "vitest";
import { createTransferOffer, emptyClauses } from "../NegotiationEngine";

/**
 * Regresión del fallo de nombres `fromClubId`/`toClubId`: antes el campo
 * "comprador" se llamaba `fromClubId` (nombre que sugería lo contrario) y
 * `toClubId` no se usaba nunca para saber quién vendía de verdad. Ahora los
 * campos se llaman `buyerClubId`/`sellerClubId` y este test fija ese
 * contrato: cada uno debe llevar el club que dice llevar, sin cruzarse.
 */
describe("createTransferOffer", () => {
  it("no confunde comprador y vendedor", () => {
    const offer = createTransferOffer({
      playerId: "p1",
      playerName: "Jugador de Prueba",
      buyerClubId: "club-comprador",
      sellerClubId: "club-vendedor",
      amount: 10_000_000,
      wageOffer: 1_000_000,
    });

    expect(offer.buyerClubId).toBe("club-comprador");
    expect(offer.sellerClubId).toBe("club-vendedor");
    expect(offer.buyerClubId).not.toBe(offer.sellerClubId);
  });

  it("acepta vendedor vacío para agentes libres, sin tocar el comprador", () => {
    const offer = createTransferOffer({
      playerId: "p2",
      playerName: "Agente Libre",
      buyerClubId: "club-comprador",
      sellerClubId: "",
      amount: 0,
      wageOffer: 500_000,
      type: "free",
      clauses: emptyClauses(),
    });

    expect(offer.buyerClubId).toBe("club-comprador");
    expect(offer.sellerClubId).toBe("");
    expect(offer.type).toBe("free");
  });

  it("nunca deja el importe por debajo de cero", () => {
    const offer = createTransferOffer({
      playerId: "p3",
      playerName: "Jugador",
      buyerClubId: "a",
      sellerClubId: "b",
      amount: -5,
      wageOffer: 100_000,
    });

    expect(offer.amount).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  createTransferOffer,
  emptyClauses,
  generateCounterOffer,
  offerWorth,
} from "../NegotiationEngine";

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


describe("valor de futura venta", () => {
  const valuation = {
    playerId: "p1",
    marketValue: 50_000_000,
    minimumPrice: 50_000_000,
    expectedPrice: 55_000_000,
    idealPrice: 60_000_000,
    maximumPrice: 70_000_000,
    listPrice: 55_000_000,
    isStar: false,
    competition: 0,
  };

  it("puede hacer mejor una oferta menor con sell-on que una mayor sin sell-on", () => {
    const noSellOn = createTransferOffer({
      playerId: "p1",
      playerName: "Jugador de Prueba",
      buyerClubId: "club-comprador",
      sellerClubId: "club-vendedor",
      amount: 60_000_000,
      wageOffer: 1_000_000,
    });
    const withSellOn = createTransferOffer({
      playerId: "p1",
      playerName: "Jugador de Prueba",
      buyerClubId: "club-comprador",
      sellerClubId: "club-vendedor",
      amount: 55_000_000,
      wageOffer: 1_000_000,
      clauses: { sellOnPercent: 0.30 },
    });

    expect(offerWorth(withSellOn, valuation)).toBeGreaterThan(
      offerWorth(noSellOn, valuation),
    );
  });

  it("no inventa valor cuando el porcentaje es 0%", () => {
    const offer = createTransferOffer({
      playerId: "p1",
      playerName: "Jugador de Prueba",
      buyerClubId: "club-comprador",
      sellerClubId: "club-vendedor",
      amount: 60_000_000,
      wageOffer: 1_000_000,
      clauses: { sellOnPercent: 0 },
    });

    expect(offerWorth(offer, valuation)).toBe(60_000_000);
  });
});


describe("contraofertas del vendedor", () => {
  const valuation = {
    playerId: "p1",
    marketValue: 50_000_000,
    minimumPrice: 50_000_000,
    expectedPrice: 55_000_000,
    idealPrice: 60_000_000,
    maximumPrice: 70_000_000,
    listPrice: 55_000_000,
    isStar: false,
    competition: 0,
  };

  it("no sube por encima de la demanda previa del club", () => {
    const counter = generateCounterOffer(
      140_000_000,
      valuation,
      2,
      0,
      141_000_000,
    );

    expect(counter).toBeLessThanOrEqual(141_000_000);
  });

  it("sin una demanda previa mantiene el comportamiento normal", () => {
    const counter = generateCounterOffer(
      40_000_000,
      valuation,
      1,
      0,
    );

    expect(counter).toBeGreaterThanOrEqual(40_000_000);
  });
});

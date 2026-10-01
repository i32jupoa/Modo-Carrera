import { describe, expect, it } from "vitest";
import type { Player } from "@/data/players";
import { answerMailboxMessage, createEmptyMailbox, opportunityCountFromRoll, opportunityTargetCount, remainingMessagesBetweenMatches, releasePendingMailboxResolutions, resolveMailboxPromises } from "../mailbox";
import { SATISFACTION_CONFIG } from "../satisfaction";

function player(id: string): Player {
  return { id, name: id, rating: 75, potential: 82, age: 20, positions: ["MC"], teamId: "T" } as unknown as Player;
}

const fixture = { id: "fixture-1", date: "2026-10-08", competition: "league", league: "ESP1", matchday: 5, homeId: "T", awayId: "OPP" } as never;

describe("mailbox promises", () => {
  it("creates a pending promise from the quick reply", () => {
    const p = player("p");
    const base = createEmptyMailbox();
    const message = {
      id: "m1", playerId: p.id, sender: "player" as const, kind: "opportunity" as const,
      text: "Míster, ¿puedo jugar?", date: "2026-10-01", read: true,
    };
    const result = answerMailboxMessage(base, p, message, "promise", "2026-10-01", fixture, new Map([["OPP", "Elche"]]));
    expect(result.promiseCreated?.status).toBe("pending");
    expect(result.promiseCreated?.fixtureId).toBe("fixture-1");
  });

  it("fulfills a promise when the player starts or gets significant minutes", () => {
    const p = player("p");
    const base = {
      ...createEmptyMailbox(),
      sequence: 1,
      promises: [{ id: "promise-1", playerId: "p", fixtureId: "fixture-1", fixtureDate: "2026-10-08", promisedAt: "2026-10-01", status: "pending" as const }],
    };
    const resolved = resolveMailboxPromises(base, "fixture-1", new Map([["p", { minutes: SATISFACTION_CONFIG.significantMinutes, started: false, available: true }]]), [p], "2026-10-08");
    expect(resolved.resolved[0]?.status).toBe("fulfilled");
    expect(resolved.moraleDeltas.p).toBe(SATISFACTION_CONFIG.mailboxPromiseSuccessBonus);
  });

  it("applies the strong penalty when a promised opportunity is missed", () => {
    const p = player("p");
    const base = {
      ...createEmptyMailbox(),
      promises: [{ id: "promise-1", playerId: "p", fixtureId: "fixture-1", fixtureDate: "2026-10-08", promisedAt: "2026-10-01", status: "pending" as const }],
    };
    const resolved = resolveMailboxPromises(base, "fixture-1", new Map([["p", { minutes: 12, started: false, available: true }]]), [p], "2026-10-08");
    expect(resolved.resolved[0]?.status).toBe("failed");
    expect(resolved.moraleDeltas.p).toBe(SATISFACTION_CONFIG.mailboxPromiseFailurePenalty);
  });
  it("does not allow a second manager response until the player writes again", () => {
    const p = player("p");
    const base = {
      ...createEmptyMailbox(),
      conversations: [{
        playerId: p.id,
        updatedAt: "2026-10-01",
        unreadCount: 0,
        messages: [
          { id: "m1", playerId: p.id, sender: "player" as const, kind: "opportunity" as const, text: "Míster, necesito minutos.", date: "2026-10-01", read: true },
          { id: "m2", playerId: p.id, sender: "manager" as const, kind: "positive" as const, text: "Hablamos después.", date: "2026-10-01", read: true },
        ],
        lastKind: "positive" as const,
      }],
    };
    const result = answerMailboxMessage(base, p, base.conversations[0].messages[0], "no", "2026-10-01", undefined);
    expect(result.applied).toBe(false);
    expect(result.state.conversations[0]?.messages).toHaveLength(2);
    expect(result.moraleDelta).toBe(0);
  });

  it("limits incoming player messages to two between two user matches", () => {
    const base = createEmptyMailbox();
    const matches = [
      { id: "m1", date: "2026-10-01", competition: "league", league: "ESP1", matchday: 4, homeId: "T", awayId: "OPP1" },
      { id: "m2", date: "2026-10-08", competition: "league", league: "ESP1", matchday: 5, homeId: "OPP2", awayId: "T" },
    ] as never;
    const withTwo = {
      ...base,
      conversations: [
        {
          playerId: "p", updatedAt: "2026-10-07", unreadCount: 2,
          messages: [
            { id: "1", playerId: "p", sender: "player" as const, kind: "opportunity" as const, text: "uno", date: "2026-10-02", read: false },
            { id: "2", playerId: "p", sender: "player" as const, kind: "complaint" as const, text: "dos", date: "2026-10-04", read: false },
          ],
        },
      ],
    };
    expect(remainingMessagesBetweenMatches(withTwo, matches, "T", "2026-10-07")).toBe(0);
    expect(remainingMessagesBetweenMatches(withTwo, matches, "T", "2026-10-08")).toBe(0);
    expect(remainingMessagesBetweenMatches(base, matches, "T", "2026-10-07")).toBe(2);
  });

  it("uses the requested 70/20/10 opportunity distribution thresholds", () => {
    expect(opportunityCountFromRoll(0)).toBe(0);
    expect(opportunityCountFromRoll(69)).toBe(0);
    expect(opportunityCountFromRoll(70)).toBe(1);
    expect(opportunityCountFromRoll(89)).toBe(1);
    expect(opportunityCountFromRoll(90)).toBe(2);
    expect(opportunityCountFromRoll(99)).toBe(2);
  });

  it("always releases a pending promise resolution even when the normal mailbox cap is full", () => {
    const p = player("p");
    const base = {
      ...createEmptyMailbox(),
      conversations: [{
        playerId: p.id, updatedAt: "2026-10-06", unreadCount: 0,
        messages: [
          { id: "a", playerId: p.id, sender: "player" as const, kind: "complaint" as const, text: "uno", date: "2026-10-02", read: true },
          { id: "b", playerId: p.id, sender: "player" as const, kind: "positive" as const, text: "dos", date: "2026-10-03", read: true },
        ],
      }],
      promises: [{ id: "promise-1", playerId: p.id, fixtureId: "fixture-1", fixtureDate: "2026-10-08", promisedAt: "2026-10-01", status: "failed" as const, resolutionPending: true }],
    };
    const released = releasePendingMailboxResolutions(base, [p], "2026-10-08", [fixture], "T");
    expect(released.messages).toHaveLength(1);
    expect(released.messages[0]?.kind).toBe("promise_failure");
  });

  it("classifies a great promised performance separately from a poor one", () => {
    const p = player("p");
    const base = {
      ...createEmptyMailbox(),
      promises: [{ id: "promise-1", playerId: p.id, fixtureId: "fixture-1", fixtureDate: "2026-10-08", promisedAt: "2026-10-01", status: "pending" as const }],
    };
    const great = resolveMailboxPromises(base, "fixture-1", new Map([[p.id, { minutes: 90, started: true, available: true, rating: 8.4, isMvp: true }]]), [p], "2026-10-08");
    expect(great.resolved[0]?.resolutionPerformance).toBe("great");
    const poorBase = {
      ...base,
      promises: [{ id: "promise-2", playerId: p.id, fixtureId: "fixture-1", fixtureDate: "2026-10-08", promisedAt: "2026-10-01", status: "pending" as const }],
    };
    const poor = resolveMailboxPromises(poorBase, "fixture-1", new Map([[p.id, { minutes: 90, started: true, available: true, rating: 5.2 }]]), [p], "2026-10-08");
    expect(poor.resolved[0]?.resolutionPerformance).toBe("poor");
  });

});

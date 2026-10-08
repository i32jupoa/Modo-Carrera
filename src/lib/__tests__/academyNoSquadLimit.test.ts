import { describe, expect, it } from "vitest";
import { SQUAD_LIMITS } from "@/lib/transfers/constants";

describe("límite de plantilla", () => {
  it("no impone un máximo de jugadores", () => {
    expect(SQUAD_LIMITS.maxSquadSize).toBe(Number.POSITIVE_INFINITY);
    expect(35 >= SQUAD_LIMITS.maxSquadSize).toBe(false);
    expect(100 >= SQUAD_LIMITS.maxSquadSize).toBe(false);
  });
});

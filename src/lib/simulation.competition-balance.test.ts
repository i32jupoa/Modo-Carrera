import { describe, expect, it } from "vitest";
import type { Team } from "@/data/teams";
import {
  applyCompetitionQualityProfile,
  isLowerTierFixture,
  moderateLowerTierGap,
} from "@/lib/simulation";

function team(id: string, league: string): Team {
  return {
    id,
    name: id,
    short: id,
    city: "",
    league,
    att: 70,
    mid: 70,
    def: 70,
    stars: [],
    color: "#000000",
  };
}

describe("competitive balance by competition", () => {
  it.each([
    { league: "laliga2", tier: 2 },
    { league: "championship", tier: 2 },
    { league: "leagueone", tier: 3 },
    { league: "leaguetwo", tier: 4 },
    { league: "serieb", tier: 2 },
    { league: "bundesliga2", tier: 2 },
    { league: "liga3", tier: 3 },
    { league: "ligue2", tier: 2 },
  ])("applies lower-division parity to $league (tier $tier)", ({ league }) => {
    expect(isLowerTierFixture(team("home", league), team("away", league))).toBe(true);
  });

  it("does not apply lower-division parity to top-tier or cross-division fixtures", () => {
    expect(isLowerTierFixture(team("home", "premier"), team("away", "premier"))).toBe(false);
    expect(isLowerTierFixture(team("home", "championship"), team("away", "premier"))).toBe(false);
  });

  it("softens small and medium lower-tier gaps without erasing large talent gaps", () => {
    expect(moderateLowerTierGap(8)).toBeCloseTo(3.84);
    expect(moderateLowerTierGap(15)).toBeCloseTo(9.6);
    expect(moderateLowerTierGap(25)).toBeCloseTo(20.5);
    expect(moderateLowerTierGap(-15)).toBeCloseTo(-9.6);
    expect(moderateLowerTierGap(25)).toBeGreaterThan(moderateLowerTierGap(15));
  });

  it("makes Champions League quality gaps 20% more influential without changing other competitions", () => {
    expect(applyCompetitionQualityProfile(10, "ucl")).toBe(12);
    expect(applyCompetitionQualityProfile(10, "uel")).toBe(10);
    expect(applyCompetitionQualityProfile(-10, "ucl")).toBe(-12);
    expect(applyCompetitionQualityProfile(10)).toBe(10);
  });
});

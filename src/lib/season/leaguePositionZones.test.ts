import { describe, expect, it } from "vitest";
import type { SaveGame } from "@/lib/store";
import { getLeaguePositionZones } from "./leaguePositionZones";

function finalFixture(leg: 1 | 2, homeId: string, awayId: string, homeGoals: number, awayGoals: number) {
  return {
    id: `promotion-playoff:2026:España:es-laliga2-final:leg${leg}`,
    competition: "cup" as const,
    league: "laliga2",
    matchday: 903 + leg,
    round: `Playoff ascenso · Final-Leg${leg}`,
    date: leg === 1 ? "2027-05-24" : "2027-05-27",
    homeId,
    awayId,
    result: { homeGoals, awayGoals } as any,
    promotionPlayoff: {
      country: "España" as const,
      seasonStartYear: 2026,
      tieId: "es-laliga2-final",
      stage: "final" as const,
      leg,
      homeSeed: leg === 1 ? 5 : 3,
      awaySeed: leg === 1 ? 3 : 5,
    },
  };
}

function survivalFixture(
  country: "Francia" | "Alemania",
  league: "ligue2" | "bundesliga2",
  leg: 1 | 2,
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number,
) {
  return {
    id: `promotion-playoff:2026:${country}:survival:leg${leg}`,
    competition: "cup" as const,
    league,
    matchday: 911 + leg,
    round: `Playoff permanencia-Leg${leg}`,
    date: leg === 1 ? "2027-05-20" : "2027-05-23",
    homeId,
    awayId,
    result: { homeGoals, awayGoals } as any,
    promotionPlayoff: {
      country,
      seasonStartYear: 2026,
      tieId: country === "Francia" ? "fr-ligue1-ligue2-survival" : "de-bundesliga-bundesliga2-survival",
      stage: "survival" as const,
      leg,
      homeSeed: leg === 1 ? 3 : 16,
      awaySeed: leg === 1 ? 16 : 3,
    },
  };
}

describe("promotion playoff standings marker", () => {
  it("marks the team that wins the completed Spanish promotion final as promoted", () => {
    const winnerId = "playoff-winner";
    const save = {
      cupFixtures: {
        laliga2: [
          finalFixture(1, winnerId, "opponent", 1, 0),
          finalFixture(2, "opponent", winnerId, 0, 1),
        ],
      },
    } as unknown as SaveGame;
    const standings = [
      { teamId: "first" },
      { teamId: "second" },
      { teamId: winnerId },
      { teamId: "fourth" },
      { teamId: "fifth" },
      { teamId: "sixth" },
    ];

    const zones = getLeaguePositionZones(save, "laliga2", standings);
    expect(zones.get(winnerId)).toContain("promotion-playoff-winner");
    expect(zones.get(winnerId)).toContain("promotion-playoff");
  });


  it.each([
    { country: "Francia" as const, league: "ligue2" as const },
    { country: "Alemania" as const, league: "bundesliga2" as const },
  ])("marks the lower-tier club promoted after winning the $country survival playoff", ({ country, league }) => {
    const winnerId = "lower-tier-winner";
    const upperTierClub = "upper-tier-club";
    const save = {
      cupFixtures: {
        [league]: [
          survivalFixture(country, league, 1, winnerId, upperTierClub, 1, 0),
          survivalFixture(country, league, 2, upperTierClub, winnerId, 0, 1),
        ],
      },
    } as unknown as SaveGame;
    const standings = [
      { teamId: "first" },
      { teamId: "second" },
      { teamId: winnerId },
      { teamId: "fourth" },
    ];

    const zones = getLeaguePositionZones(save, league, standings);
    expect(zones.get(winnerId)).toContain("promotion-playoff-winner");
  });


  it("marks the winner of the English Championship one-match promotion final", () => {
    const winnerId = "championship-playoff-winner";
    const save = {
      cupFixtures: {
        championship: [{
          id: "promotion-playoff:2026:Inglaterra:en-championship-final:leg1",
          competition: "cup" as const,
          league: "championship",
          matchday: 933,
          round: "Playoff ascenso Championship · Final",
          date: "2027-05-24",
          homeId: winnerId,
          awayId: "championship-opponent",
          result: { homeGoals: 2, awayGoals: 1 } as any,
          promotionPlayoff: {
            country: "Inglaterra" as const,
            seasonStartYear: 2026,
            tieId: "en-championship-final",
            stage: "final" as const,
            leg: 1 as const,
            homeSeed: 3,
            awaySeed: 4,
          },
        }],
      },
    } as unknown as SaveGame;
    const standings = [
      { teamId: "first" },
      { teamId: "second" },
      { teamId: "third" },
      { teamId: "fourth" },
      { teamId: winnerId },
      { teamId: "sixth" },
    ];
    const zones = getLeaguePositionZones(save, "championship", standings);
    expect(zones.get(winnerId)).toContain("promotion-playoff-winner");
  });

  it("does not mark a winner before both legs of the final have a result", () => {
    const winnerId = "playoff-winner";
    const save = {
      cupFixtures: {
        laliga2: [
          finalFixture(1, winnerId, "opponent", 1, 0),
          { ...finalFixture(2, "opponent", winnerId, 0, 1), result: undefined },
        ],
      },
    } as unknown as SaveGame;
    const standings = [
      { teamId: "first" },
      { teamId: "second" },
      { teamId: winnerId },
      { teamId: "fourth" },
      { teamId: "fifth" },
      { teamId: "sixth" },
    ];

    const zones = getLeaguePositionZones(save, "laliga2", standings);
    expect(zones.get(winnerId)).not.toContain("promotion-playoff-winner");
  });
});

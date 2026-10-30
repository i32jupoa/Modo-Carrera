import { describe, expect, it } from "vitest";
import { TEAMS } from "@/data/teams";
import { defaultLineup, generateAllSquads, type Player } from "@/data/players";
import { expectedGoals } from "@/lib/simulation";
import { DEFAULT_TACTICS, setTacticalSystem, TACTICAL_SYSTEMS_FOR_UI } from "@/lib/teamTactics";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number): number {
  const limit = Math.exp(-Math.max(0.01, lambda));
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= Math.random();
  } while (product > limit && count < 30);
  return count - 1;
}

function balancedTeams(): { home: (typeof TEAMS)[number]; away: (typeof TEAMS)[number]; homeXI: Player[]; awayXI: Player[] } {
  const squads = generateAllSquads();
  const candidates = TEAMS.flatMap((team) => {
    const squad = squads[team.id] ?? [];
    const ids = defaultLineup(squad);
    const xi = ids.map((id) => squad.find((player) => player.id === id)).filter(Boolean) as Player[];
    if (xi.length !== 11) return [];
    const average = xi.reduce((sum, player) => sum + player.rating, 0) / xi.length;
    return [{ team, xi, average }];
  });

  let best: { home: (typeof TEAMS)[number]; away: (typeof TEAMS)[number]; homeXI: Player[]; awayXI: Player[]; gap: number } | null = null;
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const first = candidates[i];
      const second = candidates[j];
      if (first.team.league !== second.team.league) continue;
      const gap = Math.abs(first.average - second.average);
      if (!best || gap < best.gap) {
        best = { home: first.team, away: second.team, homeXI: first.xi, awayXI: second.xi, gap };
      }
    }
  }
  if (!best) throw new Error("No se encontraron dos plantillas comparables en la misma liga.");
  return best;
}

describe("equilibrio entre sistemas tácticos", () => {
  it("simula las nueve tácticas en emparejamientos parejos sin dominadores ni exceso de goles", () => {
    const originalRandom = Math.random;
    const random = seededRandom(20261030);
    Math.random = random;
    try {
      const { home, away, homeXI, awayXI } = balancedTeams();
      const plans = TACTICAL_SYSTEMS_FOR_UI.map((system) => setTacticalSystem(DEFAULT_TACTICS, system.id));
      const gamesPerVenue = 100;
      const pointsRates: number[] = [];
      let totalGoals = 0;
      let totalMatches = 0;

      for (let first = 0; first < TACTICAL_SYSTEMS_FOR_UI.length; first += 1) {
        for (let second = first + 1; second < TACTICAL_SYSTEMS_FOR_UI.length; second += 1) {
          let firstPoints = 0;
          let matches = 0;
          for (let game = 0; game < gamesPerVenue; game += 1) {
            const homeXg = expectedGoals(home, away, homeXI, awayXI, plans[first], plans[second]);
            const homeGoals = poisson(homeXg.lh);
            const awayGoals = poisson(homeXg.la);
            totalGoals += homeGoals + awayGoals;
            totalMatches += 1;
            if (homeGoals > awayGoals) firstPoints += 3;
            else if (homeGoals === awayGoals) firstPoints += 1;
            matches += 1;

            const awayXg = expectedGoals(away, home, awayXI, homeXI, plans[second], plans[first]);
            const rivalGoals = poisson(awayXg.lh);
            const firstGoals = poisson(awayXg.la);
            totalGoals += rivalGoals + firstGoals;
            totalMatches += 1;
            if (firstGoals > rivalGoals) firstPoints += 3;
            else if (firstGoals === rivalGoals) firstPoints += 1;
            matches += 1;
          }
          // El porcentaje de puntos absorbe empates y se calcula con la sede equilibrada.
          const firstPointsRate = firstPoints / (matches * 3);
          pointsRates.push(firstPointsRate);
          expect(
            firstPointsRate,
            `${TACTICAL_SYSTEMS_FOR_UI[first].name} vs ${TACTICAL_SYSTEMS_FOR_UI[second].name}: ${(firstPointsRate * 100).toFixed(1)}% de puntos`,
          ).toBeGreaterThanOrEqual(0.4);
          expect(firstPointsRate).toBeLessThanOrEqual(0.6);
        }
      }

      const goalsPerMatch = totalGoals / totalMatches;
      expect(goalsPerMatch).toBeGreaterThanOrEqual(2.6);
      expect(goalsPerMatch).toBeLessThanOrEqual(3.05);
      expect(pointsRates.length).toBe(36);
    } finally {
      Math.random = originalRandom;
    }
  }, 120_000);
});

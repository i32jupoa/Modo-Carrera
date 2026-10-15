/** Deterministic retirement selection for a single career season. */

import { stableSeed } from "./calendarFactory.ts";

export type RetirementCandidate = {
  id: string;
  name: string;
  age: number;
  ovr: number;
  clubId: string | null;
  isGoalkeeper?: boolean;
  isLegend?: boolean;
  injuryDaysRemaining?: number;
  /** Años restantes de contrato; refuerza ligeramente la opción de retiro al final de ciclo. */
  contractYearsLeft?: number;
  alreadyRetired?: boolean;
};

export type RetiredPlayerRecord = {
  playerId: string;
  playerName: string;
  age: number;
  ovr: number;
  lastClubId: string | null;
  season: string;
  retiredAt: string;
  reason: "age" | "age-and-injury" | "free-agent";
};

function unit(seedText: string): number {
  return stableSeed(seedText) / 0x1_0000_0000;
}

/**
 * Probability curve is intentionally conservative at 34 and rises sharply
 * after 37. Elite players can stay longer; goalkeepers receive a two-year
 * age allowance. A 43-year-old outfield player (45-year-old goalkeeper) is
 * forced to retire, keeping the long-running world bounded.
 */
export function retirementProbability(candidate: RetirementCandidate): number {
  if (candidate.alreadyRetired || !Number.isFinite(candidate.age) || candidate.age < 34) return 0;
  const age = Math.max(0, candidate.age - (candidate.isGoalkeeper ? 2 : 0));
  let probability = age < 34 ? 0 : age === 34 ? 0.025 : age === 35 ? 0.065 : age === 36 ? 0.13 : age === 37 ? 0.25 : age === 38 ? 0.40 : age === 39 ? 0.58 : age === 40 ? 0.74 : age === 41 ? 0.88 : age === 42 ? 0.96 : 1;

  // Legends are protected through their late thirties, but not indefinitely.
  if ((candidate.isLegend || candidate.ovr >= 90) && age <= 39) probability *= 0.42;
  else if (candidate.ovr >= 85 && age <= 38) probability *= 0.62;

  if (candidate.ovr < 62) probability += 0.12;
  else if (candidate.ovr < 68) probability += 0.06;
  if (candidate.contractYearsLeft !== undefined && candidate.contractYearsLeft <= 1) probability += 0.08;
  if (!candidate.clubId) probability += 0.08;
  if ((candidate.injuryDaysRemaining ?? 0) >= 90) probability += 0.10;
  return Math.max(0, Math.min(1, probability));
}

export function selectSeasonRetirements(
  candidates: readonly RetirementCandidate[],
  options: { seed: number; season: string; retiredAt: string },
): RetiredPlayerRecord[] {
  const result: RetiredPlayerRecord[] = [];
  for (const candidate of candidates) {
    if (!candidate.id || candidate.alreadyRetired) continue;
    const probability = retirementProbability(candidate);
    if (probability <= 0) continue;
    const roll = unit(`${options.seed}|retirement|${options.season}|${candidate.id}`);
    if (roll >= probability) continue;
    result.push({
      playerId: candidate.id,
      playerName: candidate.name,
      age: Math.max(0, Math.round(candidate.age)),
      ovr: Math.max(0, Math.round(candidate.ovr)),
      lastClubId: candidate.clubId,
      season: options.season,
      retiredAt: options.retiredAt,
      reason: (candidate.injuryDaysRemaining ?? 0) >= 90 ? "age-and-injury" : !candidate.clubId ? "free-agent" : "age",
    });
  }
  return result.sort((a, b) => a.playerId.localeCompare(b.playerId));
}

type SubstitutionEvent = {
  minute: number;
  team: "home" | "away";
  playerOutId: string;
  playerOutName?: string;
  playerInId: string;
  playerInName?: string;
};
type InjuryEvent = {
  team: "home" | "away";
  playerId: string;
  playerName: string;
  minute?: number;
  replacementId?: string;
  replacementName?: string;
  forcedSub?: boolean;
};

function countSubWindows(substitutions: SubstitutionEvent[], team: "home" | "away"): number {
  return new Set(
    substitutions
      .filter((s) => s.team === team)
      .map((s) => Number(s.minute) || 0),
  ).size;
}

/**
 * An injury is a real substitution event, not a bonus change. Tactical
 * substitutions are generated before the injury is known, so an early injury
 * can temporarily make the precomputed plan exceed the legal 5 changes / 3
 * windows. Reconcile the future plan here:
 *
 * - add the forced replacement immediately at the injury minute;
 * - if the replacement was also scheduled to enter later, cancel that later
 *   tactical entry;
 * - remove the latest future tactical changes needed to get back to 5 total;
 * - remove the latest future window(s) needed to get back to 3 windows.
 *
 * Changes that happened before the injury are never removed.
 */
function reconcileSubstitutionsAfterInjuries(
  plannedSubs: SubstitutionEvent[],
  injuries: InjuryEvent[],
): SubstitutionEvent[] {
  let result = [...plannedSubs];

  for (const injury of injuries) {
    if (
      !injury.forcedSub ||
      !injury.replacementId ||
      !injury.replacementName ||
      injury.minute === undefined
    ) {
      continue;
    }

    const injuryMinute = injury.minute;
    const replacementId = injury.replacementId;
    const replacementName = injury.replacementName;

    const alreadyForced = result.some(
      (sub) =>
        sub.team === injury.team &&
        sub.playerOutId === injury.playerId &&
        sub.playerInId === replacementId &&
        sub.minute === injuryMinute,
    );
    if (alreadyForced) continue;

    // A future tactical substitution cannot consume the same bench player after
    // he has been used as the injury replacement.
    result = result.filter(
      (sub) =>
        !(
          sub.team === injury.team &&
          sub.minute > injuryMinute &&
          sub.playerInId === replacementId
        ),
    );

    const forcedSub: SubstitutionEvent = {
      minute: injuryMinute,
      team: injury.team,
      playerOutId: injury.playerId,
      playerOutName: injury.playerName,
      playerInId: replacementId,
      playerInName: replacementName,
    };
    result.push(forcedSub);

    const isForced = (sub: SubstitutionEvent) =>
      sub.team === injury.team &&
      sub.playerOutId === injury.playerId &&
      sub.playerInId === replacementId &&
      sub.minute === injuryMinute;

    // Only future tactical substitutions are disposable: everything before the
    // injury has already happened and must remain in the authoritative timeline.
    const isFutureTactical = (sub: SubstitutionEvent) =>
      sub.team === injury.team && sub.minute > injuryMinute && !isForced(sub);

    while (result.filter((sub) => sub.team === injury.team).length > 5) {
      const removableIndexes = result
        .map((sub, index) => ({ sub, index }))
        .filter(({ sub }) => isFutureTactical(sub))
        .sort((a, b) => b.sub.minute - a.sub.minute || b.index - a.index);
      const last = removableIndexes[0];
      if (!last) break;
      result.splice(last.index, 1);
    }

    while (countSubWindows(result, injury.team) > 3) {
      const future = result
        .map((sub, index) => ({ sub, index }))
        .filter(({ sub }) => isFutureTactical(sub));

      if (future.length === 0) break;

      const latestWindow = Math.max(...future.map(({ sub }) => sub.minute));
      const removeIndexes = future
        .filter(({ sub }) => sub.minute === latestWindow)
        .map(({ index }) => index)
        .sort((a, b) => b - a);

      if (removeIndexes.length === 0) break;
      for (const index of removeIndexes) result.splice(index, 1);
    }

  }

  return result.sort((a, b) => a.minute - b.minute);
}

/**
 * Generate the additional substitution allowance available during extra time.
 * The regular phase allows 5 changes in 3 windows; extra time adds exactly
 * one more change and one more window, so the remaining allowance is calculated
 * from what each side actually used before minute 90.
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const baseSubs: SubstitutionEvent[] = [
  { minute: 47, team: "away", playerOutId: "o1", playerInId: "i1" },
  { minute: 52, team: "away", playerOutId: "o2", playerInId: "i2" },
  { minute: 52, team: "away", playerOutId: "o3", playerInId: "i3" },
  { minute: 52, team: "away", playerOutId: "o4", playerInId: "i4" },
  { minute: 70, team: "away", playerOutId: "o5", playerInId: "i5" },
];

const earlyInjury: InjuryEvent = {
  minute: 6,
  team: "away",
  playerId: "o0",
  playerName: "Adama Traoré",
  replacementId: "i0",
  replacementName: "Reemplazo",
  forcedSub: true,
};

const repaired = reconcileSubstitutionsAfterInjuries(baseSubs, [earlyInjury]);
assert(repaired.length === 5, "early injury must keep total substitutions at 5");
assert(repaired.some((s) => s.minute === 6 && s.playerOutId === "o0" && s.playerInId === "i0"),
  "forced injury substitution must be inserted at injury minute");
assert(new Set(repaired.map((s) => s.minute)).size === 3, "early injury must respect 3 substitution windows");
assert(!repaired.some((s) => s.minute === 70), "latest future tactical substitution should be dropped first");

const collisionSubs: SubstitutionEvent[] = [
  { minute: 50, team: "away", playerOutId: "o1", playerInId: "i1" },
  { minute: 62, team: "away", playerOutId: "o2", playerInId: "i2" },
];
const collisionInjury: InjuryEvent = {
  minute: 10,
  team: "away",
  playerId: "o0",
  playerName: "Adama Traoré",
  replacementId: "i2",
  replacementName: "Reemplazo futuro",
  forcedSub: true,
};
const collisionRepaired = reconcileSubstitutionsAfterInjuries(collisionSubs, [collisionInjury]);
assert(collisionRepaired.some((s) => s.minute === 10 && s.playerInId === "i2"),
  "a future planned entrant can be repurposed for the injury");
assert(!collisionRepaired.some((s) => s.minute === 62 && s.playerInId === "i2"),
  "repurposed injury replacement must not enter again later");

console.log("injury substitution regression tests: OK");

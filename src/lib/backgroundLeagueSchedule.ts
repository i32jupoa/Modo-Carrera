import { addIsoDays } from "./season/calendarFactory.ts";

export type BackgroundLeagueCalendarFixture = {
  homeId?: string;
  awayId?: string;
  matchday: number;
  date?: string | null;
  result?: unknown;
};

export type BackgroundLeagueSimulationSlot = {
  matchday: number;
  side: "before" | "after";
  date: string;
};

function validIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    ? date
    : null;
}

/**
 * Assign background-league rounds to the two calendar days surrounding the
 * controlled club's league fixture. The caller splits leagues evenly between
 * the "before" and "after" slots, so a full round is never simulated in one
 * large burst.
 *
 * Persisted fixture dates are authoritative. The kickoff-based date is only a
 * compatibility fallback for old saves whose user-league fixtures lack dates.
 */
export function getBackgroundLeagueSimulationSlots(
  userLeagueFixtures: readonly BackgroundLeagueCalendarFixture[],
  myTeamId: string,
  simulationDate: string,
  leagueKickoffSaturday: string,
  nextMatchDate?: string,
): BackgroundLeagueSimulationSlot[] {
  const today = validIsoDate(simulationDate);
  if (!today || !myTeamId) return [];

  const beforeDate = addIsoDays(today, 1);
  const afterDate = addIsoDays(today, -1);
  const slots = new Map<string, BackgroundLeagueSimulationSlot>();
  const ownFixtures = userLeagueFixtures.filter(
    (fixture) => fixture.homeId === myTeamId || fixture.awayId === myTeamId,
  );

  const fixtureDate = (fixture: BackgroundLeagueCalendarFixture): string | null => {
    const explicitDate = validIsoDate(fixture.date);
    if (explicitDate) return explicitDate;
    const matchday = Number(fixture.matchday);
    if (!Number.isInteger(matchday) || matchday < 1) return null;
    return addIsoDays(leagueKickoffSaturday, (matchday - 1) * 7);
  };

  const addSlot = (matchday: number, side: "before" | "after") => {
    if (!Number.isInteger(matchday) || matchday < 1) return;
    slots.set(`${side}:${matchday}`, { matchday, side, date: today });
  };

  for (const fixture of ownFixtures) {
    const matchday = Number(fixture.matchday);
    const date = fixtureDate(fixture);
    if (!date) continue;

    // The day before the user's match: only an outstanding user fixture can
    // open this slot. The day after is still valid when the user skipped or
    // dismissed the match instead of completing it normally.
    if (date === beforeDate && !fixture.result) addSlot(matchday, "before");
    if (date === afterDate) addSlot(matchday, "after");
  }

  // A legacy calendar can carry the date in Zustand but not in the persisted
  // SaveGame. Use the passed upcoming date as a narrowly-scoped fallback.
  if (
    ![...slots.values()].some((slot) => slot.side === "before") &&
    validIsoDate(nextMatchDate) === beforeDate
  ) {
    const nextFixture = ownFixtures
      .filter((fixture) => !fixture.result)
      .sort((a, b) => Number(a.matchday) - Number(b.matchday))[0];
    if (nextFixture) addSlot(Number(nextFixture.matchday), "before");
  }

  return [...slots.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday || a.side.localeCompare(b.side),
  );
}

export function getBackgroundLeagueSlotSide(leagueIndex: number): "before" | "after" {
  return Math.abs(Math.trunc(leagueIndex)) % 2 === 0 ? "before" : "after";
}

/**
 * Return the date on which an overflow round becomes eligible for simulation.
 * Overflow rounds are those beyond the controlled league's final matchday (for
 * example, matchdays 39-42 in Segunda when the user's top-flight league has 38).
 * We wait until the latest scheduled fixture date in the round so that the
 * complete round is simulated together, and fall back to the season kickoff
 * cadence for legacy saves without persisted fixture dates.
 */
export function getBackgroundLeagueOverflowRoundDueDate(
  fixtures: readonly BackgroundLeagueCalendarFixture[],
  matchday: number,
  userLeagueMaxMatchday: number,
  simulationDate: string,
  leagueKickoffSaturday: string,
): string | null {
  const today = validIsoDate(simulationDate);
  if (!today || !Number.isInteger(matchday) || matchday <= userLeagueMaxMatchday) return null;

  const roundFixtures = fixtures.filter((fixture) => Number(fixture.matchday) === matchday);
  if (roundFixtures.length === 0) return null;

  const persistedDates = roundFixtures
    .map((fixture) => validIsoDate(fixture.date))
    .filter((date): date is string => Boolean(date))
    .sort();
  const dueDate = persistedDates.length > 0
    ? persistedDates[persistedDates.length - 1]
    : addIsoDays(leagueKickoffSaturday, (matchday - 1) * 7);

  return dueDate <= today ? dueDate : null;
}

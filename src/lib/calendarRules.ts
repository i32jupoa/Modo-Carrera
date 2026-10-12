import { uclCalendarForSeason, uclStartForSeason } from "@/data/ucl";
import { addDaysToIso, parseDateOnly } from "@/lib/transferWindows";
import {
  getSeasonCalendarAnchors,
  inferSeasonStartYearFromDate,
  INITIAL_SEASON_START_YEAR,
} from "@/lib/season/calendarFactory";

/** Legacy 2026/27 anchor retained for existing callers and saved data. */
export const NATIONAL_CUP_START = "2026-07-07";
export function nationalCupStartForSeason(seasonStartYear = INITIAL_SEASON_START_YEAR): string {
  return getSeasonCalendarAnchors(seasonStartYear).nationalCupStart;
}
export function nationalCupDateForSeason(matchdayOffset: number, seasonStartYear = INITIAL_SEASON_START_YEAR): string {
  return addDaysToIso(nationalCupStartForSeason(seasonStartYear), matchdayOffset);
}

/** A cup match is only allowed Tue/Wed/Thu in a week with no European match. */
export const NATIONAL_CUP_MATCH_WEEKDAYS = new Set([2, 3, 4]);

function dateAtOffset(startIso: string, offset: number): string {
  return addDaysToIso(startIso, offset);
}

function weekday(iso: string): number {
  return parseDateOnly(iso).getDay();
}

function weekStart(iso: string): string {
  const d = parseDateOnly(iso);
  const mondayOffset = (d.getDay() + 6) % 7;
  return addDaysToIso(iso, -mondayOffset);
}

function nextThursdayOffset(offset: number, seasonStartYear: number): number {
  const iso = dateAtOffset(uclStartForSeason(seasonStartYear), offset);
  const day = weekday(iso);
  const delta = (4 - day + 7) % 7;
  return offset + (delta === 0 ? 7 : delta);
}

/** All Tuesday/Wednesday dates from the Champions calendar. */
export function getChampionsMatchDateOffsets(seasonStartYear = INITIAL_SEASON_START_YEAR): number[] {
  const calendar = uclCalendarForSeason(seasonStartYear);
  return [
    ...calendar.leagueDay,
    calendar.playoffLeg1,
    calendar.playoffLeg2,
    calendar.r16Leg1,
    calendar.r16Leg2,
    calendar.qfLeg1,
    calendar.qfLeg2,
    calendar.sfLeg1,
    calendar.sfLeg2,
    calendar.final,
  ];
}

/** Europa League and Conference League use the Thursday of the UEFA match week. */
export function getEuropeanThursdayOffsets(seasonStartYear = INITIAL_SEASON_START_YEAR): number[] {
  return [...new Set(getChampionsMatchDateOffsets(seasonStartYear).map((offset) => nextThursdayOffset(offset, seasonStartYear)))].sort(
    (a, b) => a - b,
  );
}

/** Weeks containing a European fixture are protected from national-cup matches. */
export function isEuropeanMatchWeek(dateIso: string, seasonStartYear?: number): boolean {
  const resolvedYear = seasonStartYear ?? inferSeasonStartYearFromDate(dateIso);
  const targetWeek = weekStart(dateIso);
  const start = uclStartForSeason(resolvedYear);
  for (const offset of getChampionsMatchDateOffsets(resolvedYear)) {
    if (weekStart(dateAtOffset(start, offset)) === targetWeek) return true;
  }
  for (const offset of getEuropeanThursdayOffsets(resolvedYear)) {
    if (weekStart(dateAtOffset(start, offset)) === targetWeek) return true;
  }
  return false;
}

export function isSafeNationalCupDate(dateIso: string, seasonStartYear?: number): boolean {
  return NATIONAL_CUP_MATCH_WEEKDAYS.has(weekday(dateIso)) && !isEuropeanMatchWeek(dateIso, seasonStartYear);
}

export function getSafeNationalCupDatesBetween(
  startIso: string,
  endIsoInclusive: string,
  seasonStartYear?: number,
): string[] {
  const dates: string[] = [];
  const resolvedYear = seasonStartYear ?? inferSeasonStartYearFromDate(startIso);
  let cursor = startIso;
  for (let guard = 0; guard < 400 && cursor <= endIsoInclusive; guard += 1) {
    if (isSafeNationalCupDate(cursor, resolvedYear)) dates.push(cursor);
    cursor = addDaysToIso(cursor, 1);
  }
  return dates;
}

export function findSafeNationalCupDateOnOrBefore(startIso: string, seasonStartYear?: number): string {
  const resolvedYear = seasonStartYear ?? inferSeasonStartYearFromDate(startIso);
  let cursor = startIso;
  for (let guard = 0; guard < 90; guard += 1) {
    if (isSafeNationalCupDate(cursor, resolvedYear)) return cursor;
    cursor = addDaysToIso(cursor, -1);
  }
  return startIso;
}


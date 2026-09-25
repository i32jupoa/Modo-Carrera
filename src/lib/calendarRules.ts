import { UCL_CALENDAR, UCL_START } from "@/data/ucl";
import { addDaysToIso, parseDateOnly } from "@/lib/transferWindows";

/** Fixed season anchors used by all protected-competition calendars. */
export const NATIONAL_CUP_START = "2025-07-07";

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

function nextThursdayOffset(offset: number): number {
  const iso = dateAtOffset(UCL_START, offset);
  const day = weekday(iso); // Sun 0 ... Sat 6
  const delta = (4 - day + 7) % 7;
  return offset + (delta === 0 ? 7 : delta);
}

/** All Tuesday/Wednesday dates from the Champions calendar. */
export function getChampionsMatchDateOffsets(): number[] {
  return [
    ...UCL_CALENDAR.leagueDay,
    UCL_CALENDAR.playoffLeg1,
    UCL_CALENDAR.playoffLeg2,
    UCL_CALENDAR.r16Leg1,
    UCL_CALENDAR.r16Leg2,
    UCL_CALENDAR.qfLeg1,
    UCL_CALENDAR.qfLeg2,
    UCL_CALENDAR.sfLeg1,
    UCL_CALENDAR.sfLeg2,
    UCL_CALENDAR.final,
  ];
}

/** Europe/Europa/Conference use Thursday dates in the same UEFA match weeks. */
export function getEuropeanThursdayOffsets(): number[] {
  return [...new Set(getChampionsMatchDateOffsets().map(nextThursdayOffset))].sort(
    (a, b) => a - b,
  );
}

/**
 * The week is protected whenever Champions, Europa League or Conference League
 * has a match. National cups are forbidden during those weeks.
 */
export function isEuropeanMatchWeek(dateIso: string): boolean {
  const targetWeek = weekStart(dateIso);
  for (const offset of getChampionsMatchDateOffsets()) {
    if (weekStart(dateAtOffset(UCL_START, offset)) === targetWeek) return true;
  }
  for (const offset of getEuropeanThursdayOffsets()) {
    if (weekStart(dateAtOffset(UCL_START, offset)) === targetWeek) return true;
  }
  return false;
}

export function isSafeNationalCupDate(dateIso: string): boolean {
  return NATIONAL_CUP_MATCH_WEEKDAYS.has(weekday(dateIso)) && !isEuropeanMatchWeek(dateIso);
}

export function getSafeNationalCupDatesBetween(
  startIso: string,
  endIsoInclusive: string,
): string[] {
  const dates: string[] = [];
  let cursor = startIso;
  for (let guard = 0; guard < 120 && cursor <= endIsoInclusive; guard++) {
    if (isSafeNationalCupDate(cursor)) dates.push(cursor);
    cursor = addDaysToIso(cursor, 1);
  }
  return dates;
}

export function findSafeNationalCupDateOnOrBefore(startIso: string): string {
  let cursor = startIso;
  for (let guard = 0; guard < 90; guard++) {
    if (isSafeNationalCupDate(cursor)) return cursor;
    cursor = addDaysToIso(cursor, -1);
  }
  return startIso;
}

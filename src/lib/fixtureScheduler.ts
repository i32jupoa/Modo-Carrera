import type { Fixture } from "@/lib/season";
import type { ScheduleFixture } from "@/lib/leagueSchedule";
import { addDaysToIso, parseDateOnly } from "@/lib/transferWindows";

/** Minimum calendar days between two matches for the same team (72h). */
export const MIN_REST_DAYS = 3;

/** Friday anchor for matchday 1 (season kickoff Saturday → Friday before). */
export const LEAGUE_MD1_FRIDAY = "2025-08-15";

/** Day offsets from Friday: Vie, Sáb, Dom, Lun, Mar, Mié, Jue. */
const MATCHDAY_SLOT_OFFSETS = [0, 1, 1, 2, 2, 0, 1, 1, 2, 2];

function daysBetween(fromIso: string, toIso: string): number {
  const a = parseDateOnly(fromIso).getTime();
  const b = parseDateOnly(toIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

function matchdayFriday(matchday: number): string {
  return addDaysToIso(LEAGUE_MD1_FRIDAY, (matchday - 1) * 7);
}

function teamCanPlay(teamId: string, dateIso: string, lastPlayed: Map<string, string>): boolean {
  const last = lastPlayed.get(teamId);
  if (!last) return true;
  return daysBetween(last, dateIso) >= MIN_REST_DAYS;
}

function assignDate(
  homeId: string,
  awayId: string,
  preferredIso: string,
  lastPlayed: Map<string, string>,
): string {
  const candidates: string[] = [preferredIso];
  let cursor = preferredIso;
  for (let i = 0; i < 21; i++) {
    cursor = addDaysToIso(cursor, 1);
    candidates.push(cursor);
  }

  for (const iso of candidates) {
    if (teamCanPlay(homeId, iso, lastPlayed) && teamCanPlay(awayId, iso, lastPlayed)) {
      lastPlayed.set(homeId, iso);
      lastPlayed.set(awayId, iso);
      return iso;
    }
  }

  lastPlayed.set(homeId, preferredIso);
  lastPlayed.set(awayId, preferredIso);
  return preferredIso;
}

function slotOffsetsForCount(count: number): number[] {
  const base = [...MATCHDAY_SLOT_OFFSETS];
  while (base.length < count) {
    base.push(base.length % 7);
  }
  return base.slice(0, count);
}

/** Assign realistic dates across the week with 72h rest per team. */
export function assignFixtureDates(
  raw: Pick<Fixture, "id" | "matchday" | "homeId" | "awayId">[],
): Map<string, string> {
  const byMatchday = new Map<number, typeof raw>();
  for (const f of raw) {
    const list = byMatchday.get(f.matchday) ?? [];
    list.push(f);
    byMatchday.set(f.matchday, list);
  }

  const dates = new Map<string, string>();
  const lastPlayed = new Map<string, string>();
  const matchdays = [...byMatchday.keys()].sort((a, b) => a - b);

  for (const md of matchdays) {
    const matches = byMatchday.get(md)!;
    const friday = matchdayFriday(md);
    const offsets = slotOffsetsForCount(matches.length);

    for (let i = 0; i < matches.length; i++) {
      const f = matches[i];
      const preferred = addDaysToIso(friday, offsets[i]);
      const iso = assignDate(f.homeId, f.awayId, preferred, lastPlayed);
      dates.set(f.id, iso);
    }
  }

  return dates;
}

export function rawToSchedule(raw: Fixture[], dates: Map<string, string>): ScheduleFixture[] {
  return raw.map((f) => ({
    id: f.id,
    date: dates.get(f.id) ?? matchdayFriday(f.matchday),
    homeTeam: f.homeId,
    awayTeam: f.awayId,
    isPlayed: false,
    homeScore: null,
    awayScore: null,
    competition: "Liga" as const,
    matchday: f.matchday,
  }));
}

/** Re-date unplayed fixtures; keep played results as-is. */
export function rescheduleUnplayedFixtures(
  fixtures: ScheduleFixture[],
  raw: Fixture[],
): ScheduleFixture[] {
  const unplayedIds = new Set(fixtures.filter((f) => !f.isPlayed).map((f) => f.id));
  const rawUnplayed = raw.filter((f) => unplayedIds.has(f.id));
  if (rawUnplayed.length === 0) return fixtures;

  const played = fixtures.filter((f) => f.isPlayed);
  const lastPlayed = new Map<string, string>();
  for (const f of played) {
    if (!f.date) continue;
    for (const tid of [f.homeTeam, f.awayTeam]) {
      const prev = lastPlayed.get(tid);
      if (!prev || f.date > prev) lastPlayed.set(tid, f.date);
    }
  }

  const byMd = new Map<number, Fixture[]>();
  for (const f of rawUnplayed) {
    const list = byMd.get(f.matchday) ?? [];
    list.push(f);
    byMd.set(f.matchday, list);
  }

  const newDates = new Map<string, string>();
  for (const md of [...byMd.keys()].sort((a, b) => a - b)) {
    const matches = byMd.get(md)!;
    const friday = matchdayFriday(md);
    const offsets = slotOffsetsForCount(matches.length);
    for (let i = 0; i < matches.length; i++) {
      const f = matches[i];
      const preferred = addDaysToIso(friday, offsets[i]);
      const iso = assignDate(f.homeId, f.awayId, preferred, lastPlayed);
      newDates.set(f.id, iso);
    }
  }

  return fixtures.map((f) =>
    unplayedIds.has(f.id) ? { ...f, date: newDates.get(f.id) ?? f.date } : f,
  );
}

export function scheduleNeedsRealisticDates(fixtures: ScheduleFixture[]): boolean {
  const sample = fixtures.filter((f) => !f.isPlayed).slice(0, 40);
  if (sample.length === 0) return false;
  const weekdays = new Set(sample.map((f) => parseDateOnly(f.date).getDay()));
  return weekdays.size <= 1;
}

import type { Fixture } from "@/lib/season";
import type { ScheduleFixture } from "@/lib/leagueSchedule";
import { getLeagueTier } from "@/data/teams";
import { addDaysToIso, parseDateOnly } from "./transferWindows.ts";
import { isEuropeanMatchWeek } from "./calendarRules.ts";
import {
  addIsoDays,
  createSeededRandom,
  getDomesticSeasonEndDate,
  getSeasonCalendarAnchors,
  scopedCalendarSeed,
  type SeasonCalendarOptions,
} from "./season/calendarFactory.ts";

/** Minimum calendar days between two matches for the same team (72h). */
export const MIN_REST_DAYS = 3;

/** Friday anchor retained for older screens and migrations. */
export const LEAGUE_MD1_FRIDAY = "2026-08-14";

const WEEKEND_WINDOW_OFFSETS = [-1, 0, 1]; // Friday, Saturday, Sunday
const MIDWEEK_WINDOW_OFFSETS = [0, 1]; // Tuesday, Wednesday
const MATCHDAY_FALLBACK_WEEKDAYS = new Set([0, 2, 3, 5, 6]);

function daysBetween(fromIso: string, toIso: string): number {
  const a = parseDateOnly(fromIso).getTime();
  const b = parseDateOnly(toIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

function matchdayFriday(matchday: number, seasonStartYear = 2026): string {
  const anchor = getSeasonCalendarAnchors(seasonStartYear).leagueMatchday1Friday;
  return addDaysToIso(anchor, (matchday - 1) * 7);
}

function teamCanPlayBeforeNext(
  teamId: string,
  dateIso: string,
  nextPlayed: Map<string, string>,
): boolean {
  const next = nextPlayed.get(teamId);
  if (!next) return true;
  return daysBetween(dateIso, next) >= MIN_REST_DAYS;
}

function teamCanPlayWithProtections(
  teamId: string,
  dateIso: string,
  nextPlayed: Map<string, string>,
  protectedDates?: Map<string, Set<string>>,
): boolean {
  const specialDates = protectedDates?.get(teamId);
  if (specialDates) {
    for (const specialDate of specialDates) {
      if (Math.abs(daysBetween(specialDate, dateIso)) < MIN_REST_DAYS) return false;
    }
  }
  return teamCanPlayBeforeNext(teamId, dateIso, nextPlayed);
}

function seededShuffle<T>(values: readonly T[], seed: number): T[] {
  const result = values.slice();
  const random = createSeededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function leagueIdFromFixtures(raw: readonly { league?: string; id: string }[]): string {
  return raw[0]?.league ?? raw[0]?.id.match(/^(.*)-r\d+-/)?.[1] ?? "league";
}

function selectEvenly<T>(values: readonly T[], count: number): T[] {
  if (count <= 0 || values.length === 0) return [];
  if (count >= values.length) return values.slice();
  if (count === 1) return [values[values.length - 1]];
  const selected: T[] = [];
  const used = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const candidate = Math.round((index * (values.length - 1)) / (count - 1));
    if (!used.has(candidate)) {
      used.add(candidate);
      selected.push(values[candidate]);
    }
  }
  return selected;
}

/**
 * Domestic leagues finish one week before the first-Saturday-of-June UCL final.
 * Divisions with promotion/relegation play-offs reserve the two weeks before
 * the domestic deadline for those ties. The English Championship (46 rounds)
 * and other 42+ round divisions use Tuesday/Saturday slots to finish regular
 * season early enough for their post-season phase.
 */
export function getLeagueSchedulingDeadline(
  leagueId: string,
  totalRounds: number,
  seasonStartYear = 2026,
): string {
  let reserveDays = 0;
  if (totalRounds >= 42 || ["laliga2", "championship", "leagueone", "leaguetwo", "serieb"].includes(leagueId)) {
    reserveDays = 15;
  } else if (["ligue1", "ligue2", "bundesliga", "bundesliga2"].includes(leagueId)) {
    reserveDays = 13;
  }
  return addIsoDays(getDomesticSeasonEndDate(seasonStartYear), -reserveDays);
}

/**
 * Generate the official dates for league matchdays. Ordinary seasons use
 * evenly-spaced Saturdays. 42/46-round seasons insert occasional Tuesdays.
 * When a lower-division club is in Europe, the *whole division's* round dates
 * avoid UEFA weeks; available Tuesday/Saturday slots are used to keep the
 * season within its deadline without making that club play during Europe weeks.
 */
export function getLeagueRoundTargetDates(
  leagueId: string,
  totalRounds: number,
  seasonStartYear = 2026,
  hasEuropeanParticipant = false,
): string[] {
  if (!Number.isInteger(totalRounds) || totalRounds <= 0) return [];
  const kickoff = getSeasonCalendarAnchors(seasonStartYear).leagueKickoffSaturday;
  const deadline = getLeagueSchedulingDeadline(leagueId, totalRounds, seasonStartYear);
  // Only a second-tier league with a European participant must reserve the
  // entire UEFA week. First divisions can play on the adjacent weekend when
  // the exact UEFA fixture date and the 72h rest window are protected.
  const skipEuropeanWeeks = hasEuropeanParticipant && getLeagueTier(leagueId) === 2;
  const saturdays: string[] = [];
  const tuesdays: string[] = [];

  for (let cursor = kickoff; cursor <= deadline; cursor = addIsoDays(cursor, 1)) {
    const day = parseDateOnly(cursor).getDay();
    if (day !== 2 && day !== 6) continue;
    if (skipEuropeanWeeks && isEuropeanMatchWeek(cursor, seasonStartYear)) continue;
    if (day === 6) saturdays.push(cursor);
    else tuesdays.push(cursor);
  }

  let selected: string[];
  if (saturdays.length >= totalRounds) {
    selected = selectEvenly(saturdays, totalRounds);
  } else {
    const extraMidweeks = totalRounds - saturdays.length;
    if (tuesdays.length >= extraMidweeks) {
      selected = [...saturdays, ...selectEvenly(tuesdays, extraMidweeks)].sort();
    } else {
      // This branch is only a defensive fallback for an unusually dense custom
      // UEFA calendar. Use every remaining safe slot evenly; never cross the
      // domestic deadline or violate the three-day minimum.
      const allCandidates = [...saturdays, ...tuesdays].sort();
      if (allCandidates.length < totalRounds) {
        throw new Error(`No hay suficientes fechas para ${leagueId}: ${totalRounds} jornadas antes del ${deadline}`);
      }
      selected = selectEvenly(allCandidates, totalRounds).sort();
    }
  }

  if (selected.length !== totalRounds) {
    throw new Error(`Calendario incompleto para ${leagueId}: ${selected.length}/${totalRounds} jornadas`);
  }
  for (let index = 1; index < selected.length; index += 1) {
    if (daysBetween(selected[index - 1], selected[index]) < MIN_REST_DAYS) {
      throw new Error(`El calendario de ${leagueId} no respeta los ${MIN_REST_DAYS} días de descanso`);
    }
  }
  return selected;
}

function windowForTargetDate(targetDate: string): string[] {
  const weekday = parseDateOnly(targetDate).getDay();
  const offsets = weekday === 2 ? MIDWEEK_WINDOW_OFFSETS : WEEKEND_WINDOW_OFFSETS;
  return offsets.map((offset) => addIsoDays(targetDate, offset));
}

type DateSelectionOptions = {
  leagueId: string;
  seasonStartYear: number;
  deadline: string;
  notBeforeDate: string;
  europeanTeamIds?: ReadonlySet<string>;
};

function teamCanUseDate(teamId: string, dateIso: string, options: DateSelectionOptions): boolean {
  // The user's explicit no-league-in-UEFA-weeks rule is for second divisions
  // that can schedule midweek rounds to compensate. Top-flight clubs must be
  // allowed to use the adjacent weekend when 72h rest is respected; blocking
  // the entire UEFA week made 38-round calendars mathematically over-constrained.
  return !(
    getLeagueTier(options.leagueId) === 2 &&
    Boolean(options.europeanTeamIds?.size) &&
    isEuropeanMatchWeek(dateIso, options.seasonStartYear)
  );
}

function isSafeLeagueDate(
  homeId: string,
  awayId: string,
  dateIso: string,
  nextPlayed: Map<string, string>,
  protectedDates: Map<string, Set<string>> | undefined,
  options: DateSelectionOptions,
): boolean {
  if (dateIso < options.notBeforeDate || dateIso > options.deadline) return false;
  if (!teamCanUseDate(homeId, dateIso, options) || !teamCanUseDate(awayId, dateIso, options)) return false;
  return (
    teamCanPlayWithProtections(homeId, dateIso, nextPlayed, protectedDates) &&
    teamCanPlayWithProtections(awayId, dateIso, nextPlayed, protectedDates)
  );
}

/**
 * Search a safe Tue/Wed/Fri/Sat/Sun around the target within the competition's
 * hard deadline. A forward-only overflow can cascade: one postponed fixture
 * is pushed into the following round, which then pushes the next round, until
 * the final fixture has no room left before the deadline. Search both sides
 * while respecting the already reserved next match for each club.
 */
function findSafeSpillDate(
  homeId: string,
  awayId: string,
  startIso: string,
  nextPlayed: Map<string, string>,
  protectedDates: Map<string, Set<string>> | undefined,
  options: DateSelectionOptions,
): string {
  const kickoff = getSeasonCalendarAnchors(options.seasonStartYear).leagueKickoffSaturday;
  const anchor = startIso < kickoff ? kickoff : startIso;
  const maxDistance = Math.max(
    Math.abs(daysBetween(kickoff, anchor)),
    Math.abs(daysBetween(anchor, options.deadline)),
  );

  for (let distance = 0; distance <= maxDistance; distance += 1) {
    // Prefer the earlier date at equal distance. Later rounds are already
    // reserved, so this fills gaps without pushing the calendar tail forward.
    const candidates = distance === 0
      ? [anchor]
      : [addIsoDays(anchor, -distance), addIsoDays(anchor, distance)];
    for (const cursor of candidates) {
      if (cursor < kickoff || cursor > options.deadline) continue;
      if (!MATCHDAY_FALLBACK_WEEKDAYS.has(parseDateOnly(cursor).getDay())) continue;
      if (isSafeLeagueDate(homeId, awayId, cursor, nextPlayed, protectedDates, options)) return cursor;
    }
  }
  throw new Error(`No se ha encontrado una fecha segura antes del ${options.deadline} para ${homeId} - ${awayId}`);
}

function chooseFixtureDate(
  homeId: string,
  awayId: string,
  preferredIso: string,
  candidates: string[],
  nextPlayed: Map<string, string>,
  protectedDates: Map<string, Set<string>> | undefined,
  options: DateSelectionOptions,
): string {
  const viable = candidates
    .filter((candidate) => candidate <= options.deadline)
    .sort((a, b) => Math.abs(daysBetween(preferredIso, a)) - Math.abs(daysBetween(preferredIso, b)));
  for (const candidate of viable) {
    if (isSafeLeagueDate(homeId, awayId, candidate, nextPlayed, protectedDates, options)) return candidate;
  }
  return findSafeSpillDate(homeId, awayId, preferredIso, nextPlayed, protectedDates, options);
}

function dateSelectionOptions(
  leagueId: string,
  totalRounds: number,
  seasonStartYear: number,
  options: SeasonCalendarOptions,
  raw?: readonly { homeId?: string; awayId?: string }[],
): DateSelectionOptions {
  const europeanTeamIds = new Set(options.europeanTeamIds ?? []);
  const hasEuropeanParticipant = raw?.some(
    (fixture) => europeanTeamIds.has(String(fixture.homeId)) || europeanTeamIds.has(String(fixture.awayId)),
  ) ?? false;
  return {
    leagueId,
    seasonStartYear,
    deadline: getLeagueSchedulingDeadline(leagueId, totalRounds, seasonStartYear),
    notBeforeDate: options.notBeforeDate ?? getSeasonCalendarAnchors(seasonStartYear).leagueKickoffSaturday,
    europeanTeamIds: hasEuropeanParticipant ? europeanTeamIds : undefined,
  };
}

/**
 * Re-date an existing schedule while retaining played results and fixture IDs.
 * Unplayed fixtures follow the new season-wide matchday calendar. Completed
 * fixtures are fixed reservations and are never modified.
 */
export function rescheduleLeagueAroundSpecialFixtures(
  fixtures: ScheduleFixture[],
  protectedDates?: Map<string, Set<string>>,
  options: SeasonCalendarOptions = {},
): ScheduleFixture[] {
  if (fixtures.length === 0) return fixtures;

  const next = fixtures.map((fixture) => ({ ...fixture }));
  const fixedDates = new Map<string, Set<string>>();
  for (const [teamId, dates] of protectedDates ?? []) fixedDates.set(teamId, new Set(dates));
  for (const fixture of next.filter((fixture) => fixture.isPlayed)) {
    for (const teamId of [fixture.homeTeam, fixture.awayTeam]) {
      const dates = fixedDates.get(teamId) ?? new Set<string>();
      dates.add(fixture.date);
      fixedDates.set(teamId, dates);
    }
  }

  const byMatchday = new Map<number, ScheduleFixture[]>();
  for (const fixture of next.filter((fixture) => !fixture.isPlayed)) {
    const list = byMatchday.get(Number(fixture.matchday)) ?? [];
    list.push(fixture);
    byMatchday.set(Number(fixture.matchday), list);
  }

  const seasonStartYear = options.seasonStartYear ?? 2026;
  const leagueScope = next[0]?.id.match(/^(.*)-r\d+-/)?.[1] ?? "league";
  const totalRounds = Math.max(1, ...next.map((fixture) => Number(fixture.matchday) || 0));
  const allRaw = next.map((fixture) => ({ homeId: fixture.homeTeam, awayId: fixture.awayTeam }));
  const selection = dateSelectionOptions(leagueScope, totalRounds, seasonStartYear, options, allRaw);
  const roundTargets = getLeagueRoundTargetDates(
    leagueScope,
    totalRounds,
    seasonStartYear,
    Boolean(selection.europeanTeamIds?.size),
  );
  const notBeforeDate = options.notBeforeDate ?? getSeasonCalendarAnchors(seasonStartYear).leagueKickoffSaturday;
  // Schedule from the final round backwards. This gives every earlier round
  // an already-reserved next match and prevents late spill dates from cascading
  // into the final weeks of the season.
  const nextPlayed = new Map<string, string>();

  for (const matchday of [...byMatchday.keys()].sort((a, b) => b - a)) {
    const matches = byMatchday.get(matchday)!;
    const ordered = seededShuffle(
      matches,
      scopedCalendarSeed(options.seed, seasonStartYear, `league-date-slots:${leagueScope}:${matchday}`),
    );
    const target = roundTargets[matchday - 1] ?? addDaysToIso(getSeasonCalendarAnchors(seasonStartYear).leagueKickoffSaturday, (matchday - 1) * 7);
    const preferred = target < notBeforeDate ? notBeforeDate : target;
    const candidates = windowForTargetDate(preferred).filter((date) => date >= notBeforeDate);

    for (const fixture of ordered) {
      const date = chooseFixtureDate(
        fixture.homeTeam,
        fixture.awayTeam,
        preferred,
        candidates,
        nextPlayed,
        fixedDates,
        selection,
      );
      fixture.date = date;
      nextPlayed.set(fixture.homeTeam, date);
      nextPlayed.set(fixture.awayTeam, date);
    }
  }

  return next;
}

/** Assign realistic dates to every official league matchday. */
export function assignFixtureDates(
  raw: (Pick<Fixture, "id" | "matchday" | "homeId" | "awayId"> & { league?: string })[],
  protectedDates?: Map<string, Set<string>>,
  options: SeasonCalendarOptions = {},
): Map<string, string> {
  const byMatchday = new Map<number, typeof raw>();
  for (const fixture of raw) {
    const list = byMatchday.get(fixture.matchday) ?? [];
    list.push(fixture);
    byMatchday.set(fixture.matchday, list);
  }

  const dates = new Map<string, string>();
  // Work backwards so future rounds constrain each placement. A forward-only
  // greedy pass can push an early fixture past several later rounds and leave
  // the last matchday impossible to schedule.
  const nextPlayed = new Map<string, string>();
  const matchdays = [...byMatchday.keys()].sort((a, b) => b - a);
  const leagueId = leagueIdFromFixtures(raw);
  const totalRounds = Math.max(1, ...matchdays);
  const seasonStartYear = options.seasonStartYear ?? 2026;
  const selection = dateSelectionOptions(leagueId, totalRounds, seasonStartYear, options, raw);
  const roundTargets = getLeagueRoundTargetDates(
    leagueId,
    totalRounds,
    seasonStartYear,
    Boolean(selection.europeanTeamIds?.size),
  );

  for (const matchday of matchdays) {
    const shuffledMatches = seededShuffle(
      byMatchday.get(matchday)!,
      scopedCalendarSeed(options.seed, seasonStartYear, `league-date-slots:${leagueId}:${matchday}`),
    );
    const preferred = roundTargets[matchday - 1] ?? matchdayFriday(matchday, seasonStartYear);
    const candidates = windowForTargetDate(preferred);

    for (const fixture of shuffledMatches) {
      const date = chooseFixtureDate(
        fixture.homeId,
        fixture.awayId,
        preferred,
        candidates,
        nextPlayed,
        protectedDates,
        selection,
      );
      nextPlayed.set(fixture.homeId, date);
      nextPlayed.set(fixture.awayId, date);
      dates.set(fixture.id, date);
    }
  }

  return dates;
}

export function rawToSchedule(
  raw: Fixture[],
  dates: Map<string, string>,
  options: SeasonCalendarOptions = {},
): ScheduleFixture[] {
  return raw.map((fixture) => ({
    id: fixture.id,
    date: dates.get(fixture.id) ?? matchdayFriday(fixture.matchday, options.seasonStartYear),
    homeTeam: fixture.homeId,
    awayTeam: fixture.awayId,
    isPlayed: false,
    homeScore: null,
    awayScore: null,
    competition: "Liga" as const,
    matchday: fixture.matchday,
  }));
}

/** Re-date unplayed fixtures; keep played results as-is. */
export function rescheduleUnplayedFixtures(
  fixtures: ScheduleFixture[],
  raw: Fixture[],
  options: SeasonCalendarOptions = {},
): ScheduleFixture[] {
  const unplayedIds = new Set(fixtures.filter((fixture) => !fixture.isPlayed).map((fixture) => fixture.id));
  const rawUnplayed = raw.filter((fixture) => unplayedIds.has(fixture.id));
  if (rawUnplayed.length === 0) return fixtures;

  const played = fixtures.filter((fixture) => fixture.isPlayed);
  const fixedDates = new Map<string, Set<string>>();
  for (const fixture of played) {
    if (!fixture.date) continue;
    for (const teamId of [fixture.homeTeam, fixture.awayTeam]) {
      const set = fixedDates.get(teamId) ?? new Set<string>();
      set.add(fixture.date);
      fixedDates.set(teamId, set);
    }
  }
  const dateMap = assignFixtureDates(rawUnplayed, fixedDates, options);
  return fixtures.map((fixture) =>
    unplayedIds.has(fixture.id) ? { ...fixture, date: dateMap.get(fixture.id) ?? fixture.date } : fixture,
  );
}

export function scheduleNeedsRealisticDates(fixtures: ScheduleFixture[]): boolean {
  const sample = fixtures.filter((fixture) => !fixture.isPlayed).slice(0, 40);
  if (sample.length === 0) return false;
  const weekdays = new Set(sample.map((fixture) => parseDateOnly(fixture.date).getDay()));
  return weekdays.size <= 1;
}

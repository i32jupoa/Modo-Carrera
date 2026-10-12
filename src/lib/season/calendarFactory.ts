/**
 * Pure calendar helpers shared by every season-aware calendar generator.
 *
 * Existing 2026/27 careers keep their original calendar and fixture IDs. From
 * 2027/28 onwards, a persisted career seed combined with the season year and
 * league produces a stable but different round-robin order each season.
 */
export const INITIAL_SEASON_START_YEAR = 2026;

export type SeasonCalendarOptions = {
  seasonStartYear?: number;
  seed?: number;
  /** Career-specific club divisions. Empty/absent means the original static leagues. */
  teamLeagueOverrides?: Readonly<Record<string, string>>;
};

export type SeasonCalendarAnchors = {
  seasonStartYear: number;
  gameStartDate: string;
  nationalCupStart: string;
  leagueKickoffSaturday: string;
  leagueMatchday1Friday: string;
  summerWindowStart: string;
  summerWindowEnd: string;
  winterWindowStart: string;
  winterWindowEnd: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function isoFromUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function utcDateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function addIsoDays(iso: string, days: number): string {
  const date = utcDateFromIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoFromUtcDate(date);
}

export function getSeasonStartYear(season?: string | null, fallback = INITIAL_SEASON_START_YEAR): number {
  const match = typeof season === "string" ? season.match(/^\s*(\d{4})\s*(?:\/|-|–|—)\s*(?:\d{2}|\d{4})\s*$/) : null;
  const year = match ? Number(match[1]) : Number.NaN;
  return Number.isInteger(year) && year >= 1900 && year <= 9998 ? year : fallback;
}

export function formatSeasonLabel(seasonStartYear: number): string {
  const start = Math.trunc(seasonStartYear);
  const end = start + 1;
  return `${start}/${String(end % 100).padStart(2, "0")}`;
}

/** Infer a season start year from a calendar date (July–December belong to that year). */
export function inferSeasonStartYearFromDate(iso: string, fallback = INITIAL_SEASON_START_YEAR): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fallback;
  const [year, month] = iso.split("-").map(Number);
  if (!Number.isInteger(year) || month < 1 || month > 12) return fallback;
  return month >= 7 ? year : year - 1;
}

/** Stable 32-bit FNV-1a hash; safe to persist as an ordinary number. */
export function stableSeed(value: string | number): number {
  const text = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function deriveCareerCalendarSeed(teamId: string, seasonStartYear = INITIAL_SEASON_START_YEAR): number {
  return stableSeed(`modo-carrera-calendar|${teamId}|${seasonStartYear}`) || 1;
}

export function scopedCalendarSeed(seed: number | undefined, seasonStartYear: number, scope: string): number {
  return stableSeed(`${Number.isFinite(seed) ? Math.trunc(seed as number) : 0}|${seasonStartYear}|${scope}`) || 1;
}

/** Mulberry32 PRNG. It is deterministic across browser and Node runtimes. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(values: readonly T[], seed: number): T[] {
  const result = values.slice();
  const random = createSeededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/**
 * Stable team order for a season. For a fixed club set, consecutive years are
 * guaranteed not to reuse the same ordering; this avoids the tiny-but-possible
 * collision of two independent pseudo-random permutations. The first campaign
 * is deliberately left untouched for compatibility with existing saves.
 */
export function createSeasonTeamOrder<T>(
  values: readonly T[],
  seasonStartYear: number,
  seed: number | undefined,
  scope: string,
): T[] {
  if (seasonStartYear <= INITIAL_SEASON_START_YEAR || values.length < 2) return values.slice();

  let previousOrder = values.slice();
  for (let year = INITIAL_SEASON_START_YEAR + 1; year < seasonStartYear; year += 1) {
    const candidate = seededShuffle(values, scopedCalendarSeed(seed, year, scope));
    if (candidate.every((value, index) => value === previousOrder[index])) {
      [candidate[0], candidate[1]] = [candidate[1], candidate[0]];
    }
    previousOrder = candidate;
  }

  const current = seededShuffle(values, scopedCalendarSeed(seed, seasonStartYear, scope));
  if (current.every((value, index) => value === previousOrder[index])) {
    [current[0], current[1]] = [current[1], current[0]];
  }
  return current;
}

/** Saturday closest to 15 August; ties prefer the earlier Saturday. */
export function getLeagueKickoffSaturday(seasonStartYear: number): string {
  const target = new Date(Date.UTC(seasonStartYear, 7, 15, 12));
  const daysSinceSaturday = (target.getUTCDay() - 6 + 7) % 7;
  const previousSaturday = new Date(target);
  previousSaturday.setUTCDate(previousSaturday.getUTCDate() - daysSinceSaturday);
  const nextSaturday = new Date(previousSaturday);
  nextSaturday.setUTCDate(nextSaturday.getUTCDate() + 7);
  const previousDistance = Math.abs(previousSaturday.getTime() - target.getTime());
  const nextDistance = Math.abs(nextSaturday.getTime() - target.getTime());
  return isoFromUtcDate(previousDistance <= nextDistance ? previousSaturday : nextSaturday);
}

export function getSeasonCalendarAnchors(seasonStartYear = INITIAL_SEASON_START_YEAR): SeasonCalendarAnchors {
  const kickoff = getLeagueKickoffSaturday(seasonStartYear);
  return {
    seasonStartYear,
    gameStartDate: `${seasonStartYear}-07-01`,
    nationalCupStart: `${seasonStartYear}-07-07`,
    leagueKickoffSaturday: kickoff,
    leagueMatchday1Friday: addIsoDays(kickoff, -1),
    summerWindowStart: `${seasonStartYear}-07-01`,
    summerWindowEnd: `${seasonStartYear}-09-01`,
    winterWindowStart: `${seasonStartYear + 1}-01-01`,
    winterWindowEnd: `${seasonStartYear + 1}-01-31`,
  };
}

function closestWeekday(date: Date, weekday: number): Date {
  const candidate = new Date(date);
  let best = new Date(date);
  let bestDistance = Number.POSITIVE_INFINITY;
  // Searching left-to-right intentionally makes a tie resolve to the earlier date.
  for (let delta = -3; delta <= 3; delta += 1) {
    candidate.setTime(date.getTime());
    candidate.setUTCDate(date.getUTCDate() + delta);
    if (candidate.getUTCDay() !== weekday) continue;
    if (Math.abs(delta) < bestDistance) {
      best = new Date(candidate);
      bestDistance = Math.abs(delta);
    }
  }
  return best;
}

/**
 * Shift a 2026/27 reference calendar date into another season while retaining
 * the event's intended weekday (Tue/Wed/Thu UEFA pattern). Leap years are
 * handled by Date's UTC calendar arithmetic.
 */
export function shiftReferenceDateToSeason(
  referenceIso: string,
  seasonStartYear: number,
  preserveWeekday = true,
): string {
  const reference = utcDateFromIso(referenceIso);
  const target = new Date(reference);
  const month = reference.getUTCMonth();
  const day = reference.getUTCDate();
  target.setUTCFullYear(seasonStartYear + (month < 6 ? 1 : 0));
  // setUTCFullYear on Feb 29 rolls to March 1 in non-leap years, which is the
  // least surprising civil-calendar representation for a seasonal anchor.
  if (target.getUTCMonth() !== month && month === 1 && day === 29) {
    target.setUTCMonth(2, 1);
  }
  if (preserveWeekday) {
    return isoFromUtcDate(closestWeekday(target, reference.getUTCDay()));
  }
  return isoFromUtcDate(target);
}

export function getDateOffset(startIso: string, targetIso: string): number {
  return Math.round((utcDateFromIso(targetIso).getTime() - utcDateFromIso(startIso).getTime()) / 86_400_000);
}

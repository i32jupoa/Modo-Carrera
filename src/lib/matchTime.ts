/**
 * Canonical match-clock formatter.
 *
 * Match results store elapsed minutes as numbers. In regular time, values after
 * 90 represent second-half stoppage time (91 => 90+1). Extra-time events are
 * tagged with `matchPeriod: "extraTime"` by the history view, so 91..120 remain
 * normal extra-time minutes instead of being misread as 90+N.
 *
 * The explicit stoppage fields also support first-half and extra-time stoppage
 * periods without guessing from the numeric minute (e.g. minute 47 could be
 * either 47' or 45+2, depending on its period metadata).
 */
export type MatchMinuteContext = {
  minuteLabel?: string | null;
  displayMinuteLabel?: string | null;
  displayMinute?: string | null;
  clockLabel?: string | null;
  matchPeriod?: string | null;
  phase?: string | null;
  isExtraTime?: boolean;
  stoppagePeriod?: string | null;
  addedTimePeriod?: string | null;
  stoppageElapsed?: number | string | null;
  addedMinute?: number | string | null;
  addedTimeBase?: number | string | null;
  minuteBase?: number | string | null;
};

const STOPPAGE_ORDER: Record<string, number> = {
  firstHalf: 45,
  first_half: 45,
  firstHalfStoppage: 45,
  first_half_stoppage: 45,
  secondHalf: 90,
  second_half: 90,
  secondHalfStoppage: 90,
  second_half_stoppage: 90,
  extraFirstHalf: 105,
  extra_first_half: 105,
  extraFirstHalfStoppage: 105,
  extra_first_half_stoppage: 105,
  extraSecondHalf: 120,
  extra_second_half: 120,
  extraSecondHalfStoppage: 120,
  extra_second_half_stoppage: 120,
};

const STOPPAGE_BASES: Record<string, number> = {
  firstHalf: 45,
  first_half: 45,
  firstHalfStoppage: 45,
  first_half_stoppage: 45,
  secondHalf: 90,
  second_half: 90,
  secondHalfStoppage: 90,
  second_half_stoppage: 90,
  extraFirstHalf: 105,
  extra_first_half: 105,
  extraFirstHalfStoppage: 105,
  extra_first_half_stoppage: 105,
  extraSecondHalf: 120,
  extra_second_half: 120,
  extraSecondHalfStoppage: 120,
  extra_second_half_stoppage: 120,
};

function cleanMinuteLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[′'’]+$/, "");
  return normalized || null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Convert a numeric minute or an already formatted clock ("90+4") to elapsed minutes. */
export function getMatchMinuteElapsedValue(value: unknown, context: MatchMinuteContext = {}): number | null {
  let minute: number | null = null;
  if (typeof value === "string") {
    const normalized = cleanMinuteLabel(value);
    const addedTimeMatch = normalized?.match(/^(\d+)\s*\+\s*(\d+)$/);
    if (addedTimeMatch) {
      minute = Number(addedTimeMatch[1]) + Number(addedTimeMatch[2]);
    }
  }
  minute ??= finiteNumber(value);
  if (minute === null) return null;

  // Some live events store the period's base minute (90/105/120) and persist
  // the stoppage counter separately. Convert that pair to an elapsed position
  // for timeline placement without losing the formatted label.
  const periodKey = String(context.stoppagePeriod ?? context.addedTimePeriod ?? "");
  const base = finiteNumber(context.addedTimeBase ?? context.minuteBase) ?? STOPPAGE_BASES[periodKey];
  if (base !== undefined && base !== null) {
    const elapsed = finiteNumber(context.stoppageElapsed ?? context.addedMinute) ?? minute - base;
    if (elapsed > 0) return Math.round(base) + Math.round(elapsed);
  }
  return minute;
}

/** Returns a clock label without a trailing apostrophe, e.g. `90+4` or `94`. */
export function formatMatchMinute(minuteValue: unknown, context: MatchMinuteContext = {}): string {
  // A live stoppage clock is the most precise source. It must win over older
  // fallback labels such as "90+1" when the persisted elapsed stoppage is 4.
  const periodKey = String(context.stoppagePeriod ?? context.addedTimePeriod ?? "");
  const explicitBase = finiteNumber(context.addedTimeBase ?? context.minuteBase);
  const stoppageBase = explicitBase ?? STOPPAGE_BASES[periodKey];
  if (stoppageBase !== undefined && stoppageBase !== null) {
    const explicitElapsed = finiteNumber(context.stoppageElapsed ?? context.addedMinute);
    const elapsed = explicitElapsed ?? (getMatchMinuteElapsedValue(minuteValue) ?? 0) - stoppageBase;
    if (elapsed > 0) return `${Math.round(stoppageBase)}+${Math.round(elapsed)}`;
  }

  const explicitLabel =
    cleanMinuteLabel(context.minuteLabel) ??
    cleanMinuteLabel(context.displayMinuteLabel) ??
    cleanMinuteLabel(context.displayMinute) ??
    cleanMinuteLabel(context.clockLabel);
  if (explicitLabel) return explicitLabel;

  // Some saved/live events already carry the clock as a string ("90+4").
  // Preserve that notation instead of trying to coerce it to a number.
  const stringMinute = typeof minuteValue === "string" ? cleanMinuteLabel(minuteValue) : null;
  if (stringMinute && /^\d+\s*\+\s*\d+$/.test(stringMinute)) {
    return stringMinute.replace(/\s*\+\s*/, "+");
  }

  const minute = getMatchMinuteElapsedValue(minuteValue);
  if (minute === null) return "—";
  const roundedMinute = Math.max(0, Math.round(minute));

  const phase = String(context.matchPeriod ?? context.phase ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const isExtraTime = context.isExtraTime === true || phase === "extratime" || phase === "et";

  if (isExtraTime) {
    // The extra-time simulator uses 91–120 as the actual clock. Only values
    // beyond 120 are unambiguously added time without further period metadata.
    if (roundedMinute > 120) return `120+${roundedMinute - 120}`;
    return String(roundedMinute);
  }

  // In the regular-time result model, minutes after 90 are stoppage time.
  if (roundedMinute > 90 && roundedMinute <= 100) return `90+${roundedMinute - 90}`;
  // Also support explicitly persisted clocks beyond the full extra-time limit.
  if (roundedMinute > 120) return `120+${roundedMinute - 120}`;

  return String(roundedMinute);
}

export function formatMatchMinuteWithMark(minuteValue: unknown, context: MatchMinuteContext = {}): string {
  return `${formatMatchMinute(minuteValue, context)}′`;
}


/** Attach phase metadata to events stored in the extra-time result bucket. */
export function markExtraTimeEvent<T extends Record<string, any>>(event: T): T & MatchMinuteContext {
  const minute = finiteNumber(event.minute);
  const existingLabel = cleanMinuteLabel(event.minuteLabel) ?? cleanMinuteLabel(event.displayMinuteLabel);
  const boundaryLabel = minute === 105 ? "105+1" : minute === 120 ? "120+1" : undefined;
  return {
    ...event,
    matchPeriod: "extraTime",
    ...(!existingLabel && boundaryLabel ? { displayMinuteLabel: boundaryLabel } : {}),
  };
}

/** Numeric key for ordering events when two phases reuse similar minute values. */
export function getMatchMinuteSortValue(minuteValue: unknown, context: MatchMinuteContext = {}): number {
  const minute = getMatchMinuteElapsedValue(minuteValue);
  if (minute === null) return Number.POSITIVE_INFINITY;

  const explicitBase = finiteNumber(context.addedTimeBase ?? context.minuteBase);
  const periodKey = String(context.stoppagePeriod ?? context.addedTimePeriod ?? "");
  const base = explicitBase ?? STOPPAGE_ORDER[periodKey];
  if (base !== undefined && base !== null) {
    const explicitElapsed = finiteNumber(context.stoppageElapsed ?? context.addedMinute);
    const elapsed = explicitElapsed ?? Math.max(0, Math.round(minute) - base);
    return base + Math.max(0, elapsed) / 100;
  }

  const phase = String(context.matchPeriod ?? context.phase ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const isExtraTime = context.isExtraTime === true || phase === "extratime" || phase === "et";
  if (!isExtraTime && minute > 90 && minute <= 100) {
    return 90 + (minute - 90) / 100;
  }
  if (!isExtraTime && minute > 120) return 120 + (minute - 120) / 100;
  return minute;
}

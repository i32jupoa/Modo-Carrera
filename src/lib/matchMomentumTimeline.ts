import { getMatchMinuteElapsedValue } from "@/lib/matchTime";

export type MomentumHistorySample = { minute: number; value: number; stoppagePeriod?: string; stoppageElapsed?: number | string; matchPeriod?: string };
export type MomentumMinuteStat = {
  minute: number;
  team: "home" | "away";
  shot?: number;
  shotOnTarget?: number;
  corner?: number;
  xg?: number;
  stoppagePeriod?: string;
  stoppageElapsed?: number | string;
  matchPeriod?: string;
};

export type MomentumTimelineBar = {
  minute: number;
  side: "home" | "away" | null;
  intensity: number;
  active: boolean;
  homeShare: number;
  homePressure: number;
  awayPressure: number;
};

type TeamSide = "home" | "away";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const oppositeSide = (side: TeamSide): TeamSide => side === "home" ? "away" : "home";

function getSide(item: any): TeamSide | null {
  const side = item?.teamSide ?? item?.team;
  return side === "home" || side === "away" ? side : null;
}

/**
 * Builds a minute-by-minute, home-up / away-down pressure chart.
 * Momentum provides the sustained territorial trend; shots, xG and decisive
 * highlights create the visible peaks for dangerous attacks.
 */
export function buildMatchMomentumTimeline({
  currentMinute,
  scaleMinute,
  userSide,
  momentumHistory = [],
  minuteStats = [],
  events = [],
  highlights = [],
  moments = [],
}: {
  currentMinute: number;
  scaleMinute?: number;
  userSide: TeamSide;
  momentumHistory?: MomentumHistorySample[];
  minuteStats?: MomentumMinuteStat[];
  events?: any[];
  highlights?: any[];
  moments?: any[];
}): MomentumTimelineBar[] {
  const elapsedMinute = (item: any): number | null => {
    if (!item || item.minute === undefined || item.minute === null) return null;
    return getMatchMinuteElapsedValue(item.minute, item);
  };
  const dataEndMinute = Math.max(
    0,
    ...momentumHistory.map((item) => elapsedMinute(item) ?? 0),
    ...minuteStats.map((item) => elapsedMinute(item) ?? 0),
    ...events.map((item) => elapsedMinute(item) ?? 0),
    ...highlights.map((item) => elapsedMinute(item) ?? 0),
    ...moments.map((item) => elapsedMinute(item) ?? 0),
  );
  const playedThrough = Math.max(0, Math.floor(Number(currentMinute) || 0), Math.floor(dataEndMinute));
  const endMinute = Math.max(90, playedThrough, Math.floor(Number(scaleMinute) || 0));

  const momentumByMinute = new Map<number, number>();
  for (const point of momentumHistory) {
    const minute = Math.floor(elapsedMinute(point) ?? Number.NaN);
    const value = Number(point?.value);
    if (Number.isFinite(minute) && minute >= 0 && minute <= playedThrough && Number.isFinite(value)) {
      // Later samples in the same minute win, which also covers resolved scenes.
      momentumByMinute.set(minute, clamp(value, 0, 100));
    }
  }

  const pressureByMinute = new Map<number, { home: number; away: number }>();
  const pressureAt = (minute: number) => {
    let current = pressureByMinute.get(minute);
    if (!current) {
      current = { home: 0, away: 0 };
      pressureByMinute.set(minute, current);
    }
    return current;
  };

  for (const row of minuteStats) {
    const minute = Math.floor(elapsedMinute(row) ?? Number.NaN);
    if (!Number.isFinite(minute) || minute < 1 || minute > playedThrough) continue;
    const side = getSide(row);
    if (!side) continue;
    const pressure = pressureAt(minute);
    // A shot on target weighs more than a routine attempt; xG creates the
    // strongest statistical lift when a chance is genuinely clear.
    pressure[side] +=
      Math.max(0, Number(row.shot) || 0) * 1.25 +
      Math.max(0, Number(row.shotOnTarget) || 0) * 2.35 +
      Math.max(0, Number(row.corner) || 0) * 0.8 +
      Math.max(0, Number(row.xg) || 0) * 15;
  }

  const goalWeights: Record<string, number> = {
    goal: 19,
    penalty_goal: 23,
    free_kick_goal: 21,
    own_goal: 19,
  };
  for (const event of events) {
    const minute = Math.floor(elapsedMinute(event) ?? Number.NaN);
    const side = getSide(event);
    const weight = goalWeights[String(event?.type ?? "")];
    if (!side || !weight || minute < 1 || minute > playedThrough) continue;
    pressureAt(minute)[side] += weight;
  }

  // Highlights and resolved moments can represent the same incident. De-dup
  // them so a big chance never gets an artificial double peak.
  const seenHighlights = new Set<string>();
  const highlightWeights: Record<string, number> = {
    big_chance: 19,
    woodwork: 16,
    save: 8,
    penalty_missed: 18,
    penalty_awarded: 13,
    var_disallowed: 13,
    chance: 7,
    counter: 8,
    corner: 4,
    dangerous_free_kick: 8,
  };
  for (const item of [...highlights, ...moments]) {
    const minute = Math.floor(elapsedMinute(item) ?? Number.NaN);
    const type = String(item?.type ?? "");
    const recordedSide = getSide(item);
    const weight = highlightWeights[type];
    if (!recordedSide || !weight || minute < 1 || minute > playedThrough) continue;
    // A save belongs to the defending keeper, but the pressure belongs to the
    // attacking team that forced it.
    const attackingSide = type === "save" ? oppositeSide(recordedSide) : recordedSide;
    const identity = `${minute}:${type}:${attackingSide}:${String(item?.playerId ?? item?.playerName ?? item?.detail ?? "")}`;
    if (seenHighlights.has(identity)) continue;
    seenHighlights.add(identity);
    const extraSaveWeight = type === "save" && /parad[oó]n/i.test(String(item?.detail ?? item?.title ?? "")) ? 7 : 0;
    pressureAt(minute)[attackingSide] += weight + extraSaveWeight;
  }

  const bars: MomentumTimelineBar[] = [];
  let lastMomentum = momentumByMinute.get(0) ?? 50;
  let lastSide: TeamSide | null = null;

  for (let minute = 1; minute <= endMinute; minute++) {
    if (minute > playedThrough) {
      bars.push({ minute, side: null, intensity: 0, active: false, homeShare: 50, homePressure: 0, awayPressure: 0 });
      continue;
    }
    if (momentumByMinute.has(minute)) lastMomentum = momentumByMinute.get(minute)!;
    const homeShare = userSide === "home" ? lastMomentum : 100 - lastMomentum;
    const pressure = pressureByMinute.get(minute) ?? { home: 0, away: 0 };

    // Sustained momentum determines who is imposing the match; dangerous
    // actions can swing that minute and increase the peak substantially.
    const momentumSignal = (homeShare - 50) * 0.62;
    const pressureSignal = (pressure.home - pressure.away) * 0.48;
    const signal = momentumSignal + pressureSignal;
    let side: TeamSide | null = null;
    if (signal > 0.35) side = "home";
    else if (signal < -0.35) side = "away";
    else if (pressure.home > pressure.away) side = "home";
    else if (pressure.away > pressure.home) side = "away";
    else if (homeShare > 50.5) side = "home";
    else if (homeShare < 49.5) side = "away";
    else side = lastSide;

    const peakDanger = Math.max(pressure.home, pressure.away);
    const intensity = side
      ? clamp(0.055 + (Math.abs(signal) / 20) * 0.30 + (peakDanger / 32) * 0.58, 0.055, 0.96)
      : 0;
    if (side) lastSide = side;

    bars.push({
      minute,
      side,
      intensity,
      active: true,
      homeShare,
      homePressure: pressure.home,
      awayPressure: pressure.away,
    });
  }

  return bars;
}

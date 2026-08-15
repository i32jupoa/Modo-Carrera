// Match statistics + player ratings engine.
// Pure functions: no side effects, no store access.

import type { Player } from "@/data/players";
import { type PosCode } from "@/lib/positions";

// Funciones auxiliares para determinar tipo de jugador basado en posiciones específicas
function isGoalkeeper(positions: PosCode[]): boolean {
  return positions.includes("GK");
}

function isDefensive(positions: PosCode[]): boolean {
  return positions.some(p => ["DFC", "LD", "LI", "CAD", "CAI"].includes(p));
}

function isMidfield(positions: PosCode[]): boolean {
  return positions.some(p => ["MCD", "MC", "MCO", "MD", "MI"].includes(p));
}

function isAttacking(positions: PosCode[]): boolean {
  return positions.some(p => ["ED", "EI", "DC", "SD"].includes(p));
}

export type TeamStats = {
  possession: number; // 0..100
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  offsides: number;
  passes: number;
  passesCompleted: number;
  passAccuracy: number; // 0..100
  saves: number;
  xg: number;
};

export type MinuteDelta = {
  minute: number;
  team: "home" | "away";
  shot: number;
  shotOnTarget: number;
  corner: number;
  foul: number;
  offside: number;
  passes: number;
  passesCompleted: number;
  xg: number;
};

export type MatchStats = {
  home: TeamStats;
  away: TeamStats;
  timeline: MinuteDelta[];
};

export type PlayerRating = {
  playerId: string;
  playerName: string;
  team: "home" | "away";
  position: string;
  rating: number;
  goals: number;
  assists: number;
  saves: number;
  yellow: number;
  red: boolean;
  minutes: number;
};

const rnd = () => Math.random();
const between = (min: number, max: number) => min + rnd() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function emptyStats(): TeamStats {
  return {
    possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0,
    offsides: 0, passes: 0, passesCompleted: 0, passAccuracy: 0, saves: 0, xg: 0,
  };
}

function emptyDelta(minute: number, team: "home" | "away"): MinuteDelta {
  return {
    minute, team, shot: 0, shotOnTarget: 0, corner: 0,
    foul: 0, offside: 0, passes: 0, passesCompleted: 0, xg: 0,
  };
}

export type StatsInput = {
  xgHome: number;
  xgAway: number;
  homeGoals: number;
  awayGoals: number;
  homeGoalMinutes: number[];
  awayGoalMinutes: number[];
  homeStrength: number;
  awayStrength: number;
  firstMinute?: number;
  lastMinute?: number;
};

/**
 * Builds coherent match statistics and a minute-by-minute timeline so the UI
 * can render them live while the clock runs.
 */
export function buildMatchStats(input: StatsInput): MatchStats {
  const first = input.firstMinute ?? 1;
  const last = input.lastMinute ?? 90;
  const span = Math.max(1, last - first + 1);

  const home = emptyStats();
  const away = emptyStats();

  home.xg = Math.round(input.xgHome * 100) / 100;
  away.xg = Math.round(input.xgAway * 100) / 100;

  // Possession derives from relative strength + relative xG, with noise.
  const strengthShare =
    input.homeStrength / Math.max(1, input.homeStrength + input.awayStrength);
  const xgShare = input.xgHome / Math.max(0.1, input.xgHome + input.xgAway);
  const rawPossession = (strengthShare * 0.55 + xgShare * 0.45) * 100 + between(-6, 6);
  home.possession = Math.round(clamp(rawPossession, 28, 72));
  away.possession = 100 - home.possession;

  // Shots follow xG with realistic conversion noise, never below the goals scored.
  const shotsFrom = (xg: number, goals: number) =>
    Math.max(goals, Math.round(xg / between(0.09, 0.15)) + Math.round(between(0, 3)));
  home.shots = clamp(shotsFrom(input.xgHome, input.homeGoals), 2, 34);
  away.shots = clamp(shotsFrom(input.xgAway, input.awayGoals), 2, 34);

  home.shotsOnTarget = clamp(
    Math.max(input.homeGoals, Math.round(home.shots * between(0.3, 0.5))), input.homeGoals, home.shots);
  away.shotsOnTarget = clamp(
    Math.max(input.awayGoals, Math.round(away.shots * between(0.3, 0.5))), input.awayGoals, away.shots);

  home.corners = clamp(Math.round(home.shots * between(0.35, 0.75)), 0, 18);
  away.corners = clamp(Math.round(away.shots * between(0.35, 0.75)), 0, 18);

  home.fouls = Math.round(between(6, 16) * (span / 90));
  away.fouls = Math.round(between(6, 16) * (span / 90));
  home.offsides = Math.round(between(0, 4) * (span / 90));
  away.offsides = Math.round(between(0, 4) * (span / 90));

  // Saves = opponent shots on target that were not goals.
  home.saves = Math.max(0, away.shotsOnTarget - input.awayGoals);
  away.saves = Math.max(0, home.shotsOnTarget - input.homeGoals);

  // Passes scale with possession and quality.
  const totalPasses = Math.round(between(780, 1080) * (span / 90));
  home.passes = Math.round((totalPasses * home.possession) / 100);
  away.passes = totalPasses - home.passes;
  const accFor = (strength: number) => clamp(58 + (strength - 60) * 0.75 + between(-4, 4), 62, 93);
  const homeAcc = accFor(input.homeStrength);
  const awayAcc = accFor(input.awayStrength);
  home.passesCompleted = Math.round((home.passes * homeAcc) / 100);
  away.passesCompleted = Math.round((away.passes * awayAcc) / 100);
  home.passAccuracy = Math.round(homeAcc);
  away.passAccuracy = Math.round(awayAcc);

  // ---- Minute-by-minute distribution -------------------------------------
  const timeline: MinuteDelta[] = [];
  const buckets = new Map<string, MinuteDelta>();
  const getBucket = (minute: number, team: "home" | "away") => {
    const key = `${minute}-${team}`;
    let b = buckets.get(key);
    if (!b) {
      b = emptyDelta(minute, team);
      buckets.set(key, b);
      timeline.push(b);
    }
    return b;
  };

  const randomMinute = () => first + Math.floor(rnd() * span);

  const distribute = (
    team: "home" | "away",
    key: keyof MinuteDelta,
    total: number,
    reserved: number[] = [],
  ) => {
    let remaining = total;
    for (const m of reserved) {
      if (remaining <= 0) break;
      const b = getBucket(clamp(m, first, last), team);
      (b[key] as number) += 1;
      remaining--;
    }
    for (let i = 0; i < remaining; i++) {
      const b = getBucket(randomMinute(), team);
      (b[key] as number) += 1;
    }
  };

  // Goals always have a shot + shot on target in the same minute.
  distribute("home", "shot", home.shots, input.homeGoalMinutes);
  distribute("away", "shot", away.shots, input.awayGoalMinutes);
  distribute("home", "shotOnTarget", home.shotsOnTarget, input.homeGoalMinutes);
  distribute("away", "shotOnTarget", away.shotsOnTarget, input.awayGoalMinutes);
  distribute("home", "corner", home.corners);
  distribute("away", "corner", away.corners);
  distribute("home", "foul", home.fouls);
  distribute("away", "foul", away.fouls);
  distribute("home", "offside", home.offsides);
  distribute("away", "offside", away.offsides);

  // xG accumulates on shot minutes, proportionally.
  const spreadXg = (team: "home" | "away", totalXg: number, totalShots: number) => {
    if (totalShots <= 0) return;
    const shotBuckets = timeline.filter((b) => b.team === team && b.shot > 0);
    const shotSum = shotBuckets.reduce((s, b) => s + b.shot, 0) || 1;
    for (const b of shotBuckets) b.xg += (totalXg * b.shot) / shotSum;
  };
  spreadXg("home", home.xg, home.shots);
  spreadXg("away", away.xg, away.shots);

  // Passes spread evenly minute by minute.
  for (let m = first; m <= last; m++) {
    const h = getBucket(m, "home");
    h.passes += Math.round(home.passes / span);
    h.passesCompleted += Math.round(home.passesCompleted / span);
    const a = getBucket(m, "away");
    a.passes += Math.round(away.passes / span);
    a.passesCompleted += Math.round(away.passesCompleted / span);
  }

  timeline.sort((a, b) => a.minute - b.minute);
  return { home, away, timeline };
}

/** Accumulates the timeline up to (and including) a given minute. */
export function accumulateStats(stats: MatchStats, minute: number): { home: TeamStats; away: TeamStats } {
  const home = emptyStats();
  const away = emptyStats();
  home.xg = 0; away.xg = 0;

  for (const d of stats.timeline) {
    if (d.minute > minute) continue;
    const t = d.team === "home" ? home : away;
    t.shots += d.shot;
    t.shotsOnTarget += d.shotOnTarget;
    t.corners += d.corner;
    t.fouls += d.foul;
    t.offsides += d.offside;
    t.passes += d.passes;
    t.passesCompleted += d.passesCompleted;
    t.xg += d.xg;
  }

  home.saves = Math.min(stats.home.saves, Math.max(0, away.shotsOnTarget));
  away.saves = Math.min(stats.away.saves, Math.max(0, home.shotsOnTarget));
  home.xg = Math.round(home.xg * 100) / 100;
  away.xg = Math.round(away.xg * 100) / 100;
  home.passAccuracy = home.passes > 0 ? Math.round((home.passesCompleted / home.passes) * 100) : 0;
  away.passAccuracy = away.passes > 0 ? Math.round((away.passesCompleted / away.passes) * 100) : 0;

  const totalPoss = home.passes + away.passes;
  if (totalPoss > 0) {
    home.possession = Math.round((home.passes / totalPoss) * 100);
    away.possession = 100 - home.possession;
  } else {
    home.possession = 50;
    away.possession = 50;
  }
  return { home, away };
}

// ---------------------------------------------------------------------------
// Player ratings (1-10)
// ---------------------------------------------------------------------------

export type RatingInput = {
  homeXI: Player[];
  awayXI: Player[];
  homeGoals: number;
  awayGoals: number;
  goals: Array<{ team: "home" | "away"; scorerId: string; assistId?: string; ownGoal?: boolean }>;
  cards: Array<{ team: "home" | "away"; playerId: string; cardType: "yellow" | "red"; minute: number }>;
  minutesPlayed: Record<string, number>;
  homeSaves: number;
  awaySaves: number;
  penaltiesMissed?: Array<{ playerId: string }>;
};

export function computePlayerRatings(input: RatingInput): { ratings: PlayerRating[]; mvp: PlayerRating | null } {
  const ratings: PlayerRating[] = [];

  const build = (xi: Player[], team: "home" | "away") => {
    const scored = team === "home" ? input.homeGoals : input.awayGoals;
    const conceded = team === "home" ? input.awayGoals : input.homeGoals;
    const teamSaves = team === "home" ? input.homeSaves : input.awaySaves;
    const resultMod = scored > conceded ? 0.4 : scored === conceded ? 0 : -0.35;

    for (const p of xi) {
      const minutes = input.minutesPlayed[p.id] ?? 90;
      const goals = input.goals.filter(
        (g) => g.team === team && g.scorerId === p.id && !g.ownGoal,
      ).length;
      const ownGoals = input.goals.filter((g) => g.ownGoal && g.scorerId === p.id).length;
      const assists = input.goals.filter((g) => g.assistId === p.id).length;
      const yellow = input.cards.filter(
        (c) => c.playerId === p.id && c.cardType === "yellow",
      ).length;
      const red = input.cards.some((c) => c.playerId === p.id && c.cardType === "red");
      const saves = isGoalkeeper(p.positions) ? teamSaves : 0;
      const missedPen = (input.penaltiesMissed ?? []).filter((x) => x.playerId === p.id).length;

      let r = 6.0;

      // Baseline from quality: better players are slightly more consistent.
      r += ((p.rating - 72) / 100) * 1.2;

      // Attacking contributions.
      const goalBonus = isAttacking(p.positions) ? 1.0 : isMidfield(p.positions) ? 1.25 : isDefensive(p.positions) ? 1.5 : 2.5;
      r += goals * goalBonus;
      r += assists * 0.75;

      // Goalkeeper / defensive contributions.
      if (isGoalkeeper(p.positions)) {
        r += saves * 0.18;
        r += conceded === 0 ? 1.0 : -conceded * 0.35;
      } else if (isDefensive(p.positions)) {
        r += conceded === 0 ? 0.6 : -conceded * 0.18;
      } else if (isMidfield(p.positions)) {
        r += conceded === 0 ? 0.2 : -conceded * 0.06;
      }

      // Penalties.
      r -= yellow * 0.35;
      if (red) r -= 1.6;
      r -= ownGoals * 1.6;
      r -= missedPen * 0.9;

      // Result and time on the pitch.
      r += resultMod;
      if (minutes < 90) r -= (90 - minutes) / 90 * 0.35;

      // Small random spread for the intangibles.
      r += between(-0.35, 0.35);

      ratings.push({
        playerId: p.id,
        playerName: p.name,
        team,
        position: p.positions[0] || "MC",
        rating: Math.round(clamp(r, 3, 10) * 10) / 10,
        goals,
        assists,
        saves,
        yellow,
        red,
        minutes,
      });
    }
  };

  build(input.homeXI, "home");
  build(input.awayXI, "away");

  const mvp = ratings.length
    ? ratings.reduce((best, cur) => (cur.rating > best.rating ? cur : best))
    : null;

  return { ratings, mvp };
}

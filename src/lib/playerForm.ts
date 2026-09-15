import type { PlayerStats } from "@/store/playersStore";

export type PlayerForm = "up" | "flat" | "down";

export function recentFiveRatings(stats?: PlayerStats): number[] {
  const history = stats?.dynamicStats?.formHistory?.length
    ? stats.dynamicStats.formHistory
    : stats?.formHistory ?? [];
  return history.slice(-5);
}

export function getPlayerForm(stats?: PlayerStats): PlayerForm {
  const ratings = recentFiveRatings(stats);
  if (!ratings.length) return "flat";
  const average = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
  if (average >= 7) return "up";
  if (average >= 6) return "flat";
  return "down";
}

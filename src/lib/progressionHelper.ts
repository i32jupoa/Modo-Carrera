/**
 * Helper functions for integrating player progression into the game flow.
 * 
 * NOTE: These functions are placeholders for future integration.
 * The actual integration points need to be identified in the game flow
 * where dates advance and seasons end.
 */

import { applyMonthlyProgression } from "./playerProgression";
import { applySeasonEndProgression } from "./playerProgression";
import type { DynamicPlayerStats } from "@/types/playerStats";
import type { PosCode } from "@/lib/positions";
import type { Player } from "@/data/players";

/**
 * Applies monthly progression to a single player's dynamic stats.
 * This is a helper function that can be called from the game loop.
 */
export function applyMonthlyProgressionToPlayer(
  player: Player,
  dynamicStats: DynamicPlayerStats,
  currentMonth: number,
  currentYear: number
): { updatedStats: DynamicPlayerStats; newOVR: number } {
  const updatedStats = applyMonthlyProgression(
    dynamicStats,
    player.age,
    player.positions,
    currentMonth,
    currentYear
  );
  
  return {
    updatedStats,
    newOVR: updatedStats.currentOVR,
  };
}

/**
 * Applies season-end progression to a single player's dynamic stats.
 * This is a helper function that can be called when a season ends.
 */
export function applySeasonEndProgressionToPlayer(
  player: Player,
  dynamicStats: DynamicPlayerStats,
  seasonNumber: number
): { updatedStats: DynamicPlayerStats; newOVR: number } {
  const updatedStats = applySeasonEndProgression(
    dynamicStats,
    player.age,
    player.positions,
    seasonNumber,
    player.teamId
  );
  
  return {
    updatedStats,
    newOVR: updatedStats.currentOVR,
  };
}

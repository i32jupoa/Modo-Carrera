/**
 * Sistema de progresión mensual para todos los jugadores.
 * Se llama cuando el juego avanza un mes para aplicar cambios sutiles de OVR.
 */

import { applyMonthlyProgression } from "./playerProgression";
import type { Player } from "@/data/players";

/**
 * Aplica progresión mensual a todos los jugadores de una lista.
 * Esta función debe llamarse cuando el juego avanza un mes.
 */
export function applyMonthlyProgressionToAll(
  players: Player[],
  currentMonth: number,
  currentYear: number
): Player[] {
  return players.map(player => {
    if (!player.dynamicStats) return player;
    
    const updatedStats = applyMonthlyProgression(
      player.dynamicStats,
      player.age,
      player.positions,
      currentMonth,
      currentYear
    );
    
    // Actualizar el OVR del jugador si cambió
    const newOVR = updatedStats.currentOVR;
    
    return {
      ...player,
      rating: newOVR,
      dynamicStats: updatedStats,
    };
  });
}

/**
 * Aplica progresión mensual a un solo jugador.
 */
export function applyMonthlyProgressionToPlayer(
  player: Player,
  currentMonth: number,
  currentYear: number
): Player {
  if (!player.dynamicStats) return player;
  
  const updatedStats = applyMonthlyProgression(
    player.dynamicStats,
    player.age,
    player.positions,
    currentMonth,
    currentYear
  );
  
  return {
    ...player,
    rating: updatedStats.currentOVR,
    dynamicStats: updatedStats,
  };
}

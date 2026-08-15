/**
 * Sistema de progresión de fin de temporada para todos los jugadores.
 * Se llama cuando termina una temporada para aplicar cambios mayores de OVR.
 */

import { applySeasonEndProgression } from "./playerProgression";
import type { Player } from "@/data/players";

/**
 * Aplica progresión de fin de temporada a todos los jugadores de una lista.
 * Esta función debe llamarse cuando termina una temporada.
 */
export function applySeasonEndProgressionToAll(
  players: Player[],
  seasonNumber: number,
  teamId?: string
): Player[] {
  return players.map(player => {
    if (!player.dynamicStats) return player;
    
    const playerTeamId = teamId || player.teamId;
    
    const updatedStats = applySeasonEndProgression(
      player.dynamicStats,
      player.age,
      player.positions,
      seasonNumber,
      playerTeamId
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
 * Aplica progresión de fin de temporada a un solo jugador.
 */
export function applySeasonEndProgressionToPlayer(
  player: Player,
  seasonNumber: number,
  teamId?: string
): Player {
  if (!player.dynamicStats) return player;
  
  const playerTeamId = teamId || player.teamId;
  
  const updatedStats = applySeasonEndProgression(
    player.dynamicStats,
    player.age,
    player.positions,
    seasonNumber,
    playerTeamId
  );
  
  return {
    ...player,
    rating: updatedStats.currentOVR,
    dynamicStats: updatedStats,
  };
}

/**
 * Añade un trofeo a las estadísticas dinámicas de un jugador.
 */
export function addTrophyToPlayer(player: Player): Player {
  if (!player.dynamicStats) return player;
  
  return {
    ...player,
    dynamicStats: {
      ...player.dynamicStats,
      seasonTrophies: player.dynamicStats.seasonTrophies + 1,
    },
  };
}

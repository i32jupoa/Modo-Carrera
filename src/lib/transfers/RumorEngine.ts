/**
 * RumorEngine - Sistema de rumores de transferencias
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { TransferRumor, RumorType } from './types';
import { 
  RUMOR_DURATION_DAYS,
  RUMOR_GENERATION_PROBABILITY,
  RUMOR_CREDIBILITY,
} from './constants';
import { teamById } from '@/data/teams';

// ============================================================================
// ALMACENAMIENTO DE RUMORES
// ============================================================================

const activeRumors = new Map<string, TransferRumor[]>();

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Genera un ID único para un rumor
 * @returns ID único
 */
function generateRumorId(): string {
  return `rumor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Genera una fuente para el rumor
 * @returns Fuente del rumor
 */
function generateRumorSource(): 'reliable' | 'speculative' | 'unconfirmed' {
  const rand = Math.random();
  if (rand < 0.2) return 'reliable';
  if (rand < 0.6) return 'speculative';
  return 'unconfirmed';
}

/**
 * Crea un nuevo rumor de transferencia
 * @param type - Tipo de rumor
 * @param playerId - ID del jugador (opcional)
 * @param fromClubId - ID del club interesado (opcional)
 * @param toClubId - ID del club del jugador (opcional)
 * @param position - Posición buscada (opcional)
 * @param credibility - Credibilidad del rumor (0-100)
 * @returns Rumor creado
 */
export function createRumor(
  type: RumorType,
  playerId?: string,
  fromClubId?: string,
  toClubId?: string,
  position?: any,
  credibility: number = RUMOR_CREDIBILITY.speculative
): TransferRumor {
  return {
    id: generateRumorId(),
    type,
    playerId,
    fromClubId,
    toClubId,
    position,
    credibility,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + RUMOR_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    source: generateRumorSource(),
  };
}

/**
 * Genera rumores aleatorios para el mercado
 * @param allPlayers - Todos los jugadores
 * @param allClubs - Todos los clubes
 * @returns Rumores generados
 */
export function generateRandomRumors(
  allPlayers: any[],
  allClubs: any[]
): TransferRumor[] {
  const rumors: TransferRumor[] = [];
  
  // Solo generar rumores para jugadores destacados (OVR >= 80)
  const starPlayers = allPlayers.filter(p => p.OVR >= 80);
  
  for (const player of starPlayers) {
    // Probabilidad de generar rumor
    if (Math.random() > RUMOR_GENERATION_PROBABILITY) {
      continue;
    }
    
    const fromTeam = teamById(player.Team);
    if (!fromTeam) continue;
    
    // Seleccionar club potencial
    const potentialClubs = allClubs.filter(c => 
      c.id !== player.Team && 
      (c.att + c.mid + c.def) / 3 >= 75
    );
    
    if (potentialClubs.length === 0) continue;
    
    const toTeam = potentialClubs[Math.floor(Math.random() * potentialClubs.length)];
    
    // Determinar tipo de rumor
    const rumorType = selectRumorType(player.OVR);
    
    // Determinar credibilidad
    const credibility = selectRumorCredibility();
    
    const rumor = createRumor(
      rumorType,
      player.id,
      toTeam.id,
      fromTeam.id,
      player.position,
      credibility
    );
    
    rumors.push(rumor);
    addRumorToActiveRumors(rumor);
  }
  
  return rumors;
}

/**
 * Selecciona el tipo de rumor basado en la valoración del jugador
 * @param playerRating - Valoración del jugador
 * @returns Tipo de rumor
 */
function selectRumorType(playerRating: number): RumorType {
  if (playerRating >= 88) {
    const types: RumorType[] = ['negotiation_started', 'medical_scheduled', 'club_following'];
    return types[Math.floor(Math.random() * types.length)];
  } else if (playerRating >= 82) {
    const types: RumorType[] = ['club_following', 'player_wants_out', 'negotiation_started'];
    return types[Math.floor(Math.random() * types.length)];
  } else {
    const types: RumorType[] = ['club_following', 'club_seeking'];
    return types[Math.floor(Math.random() * types.length)];
  }
}

/**
 * Selecciona la credibilidad del rumor
 * @returns Credibilidad (0-100)
 */
function selectRumorCredibility(): number {
  const rand = Math.random();
  if (rand < 0.1) return RUMOR_CREDIBILITY.reliable;
  if (rand < 0.4) return RUMOR_CREDIBILITY.speculative;
  return RUMOR_CREDIBILITY.unconfirmed;
}

/**
 * Añade un rumor a los rumores activos
 * @param rumor - Rumor a añadir
 */
function addRumorToActiveRumors(rumor: TransferRumor): void {
  const { playerId } = rumor;
  
  if (!playerId) return;
  
  if (!activeRumors.has(playerId)) {
    activeRumors.set(playerId, []);
  }
  
  const playerRumors = activeRumors.get(playerId)!;
  playerRumors.push(rumor);
}

/**
 * Obtiene rumores activos de un jugador
 * @param playerId - ID del jugador
 * @returns Rumores del jugador
 */
export function getPlayerRumors(playerId: string): TransferRumor[] {
  return activeRumors.get(playerId) || [];
}

/**
 * Obtiene todos los rumores activos
 * @returns Todos los rumores activos
 */
export function getAllActiveRumors(): TransferRumor[] {
  const allRumors: TransferRumor[] = [];
  
  for (const playerRumors of activeRumors.values()) {
    allRumors.push(...playerRumors);
  }
  
  return allRumors.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Obtiene rumores activos de un club
 * @param clubId - ID del club
 * @returns Rumores del club
 */
export function getClubRumors(clubId: string): TransferRumor[] {
  const allRumors = getAllActiveRumors();
  
  return allRumors.filter(rumor => 
    rumor.fromClubId === clubId || rumor.toClubId === clubId
  );
}

/**
 * Limpia rumores expirados
 * @returns Número de rumores eliminados
 */
export function clearExpiredRumors(): number {
  const now = new Date();
  let removed = 0;
  
  for (const [playerId, rumors] of activeRumors.entries()) {
    const validRumors = rumors.filter(rumor => {
      const expiresAt = new Date(rumor.expiresAt);
      return expiresAt > now;
    });
    
    removed += rumors.length - validRumors.length;
    
    if (validRumors.length === 0) {
      activeRumors.delete(playerId);
    } else {
      activeRumors.set(playerId, validRumors);
    }
  }
  
  return removed;
}

/**
 * Verifica si un rumor ha expirado
 * @param rumor - Rumor a verificar
 * @returns Si ha expirado
 */
export function isRumorExpired(rumor: TransferRumor): boolean {
  const now = new Date();
  const expiresAt = new Date(rumor.expiresAt);
  return expiresAt < now;
}

/**
 * Actualiza la credibilidad de un rumor
 * @param rumorId - ID del rumor
 * @param newCredibility - Nueva credibilidad
 * @returns Si se actualizó correctamente
 */
export function updateRumorCredibility(
  rumorId: string,
  newCredibility: number
): boolean {
  for (const playerRumors of activeRumors.values()) {
    const rumor = playerRumors.find(r => r.id === rumorId);
    if (rumor) {
      rumor.credibility = Math.max(0, Math.min(100, newCredibility));
      return true;
    }
  }
  return false;
}

/**
 * Desmiente un rumor
 * @param rumorId - ID del rumor
 * @returns Si se desmintió correctamente
 */
export function debunkRumor(rumorId: string): boolean {
  for (const playerRumors of activeRumors.values()) {
    const rumorIndex = playerRumors.findIndex(r => r.id === rumorId);
    if (rumorIndex !== -1) {
      playerRumors.splice(rumorIndex, 1);
      return true;
    }
  }
  return false;
}

/**
 * Limpia todos los rumores
 */
export function clearAllRumors(): void {
  activeRumors.clear();
}

/**
 * Limpia rumores de un jugador
 * @param playerId - ID del jugador
 */
export function clearPlayerRumors(playerId: string): void {
  activeRumors.delete(playerId);
}

/**
 * Exporta todos los rumores activos
 * @returns Rumores activos
 */
export function exportRumors(): Map<string, TransferRumor[]> {
  return new Map(activeRumors);
}

/**
 * Importa rumores
 * @param rumors - Rumores a importar
 */
export function importRumors(rumors: Map<string, TransferRumor[]>): void {
  activeRumors.clear();
  
  for (const [playerId, playerRumors] of rumors.entries()) {
    activeRumors.set(playerId, [...playerRumors]);
  }
}

/**
 * Obtiene estadísticas de rumores
 * @returns Estadísticas
 */
export function getRumorStats(): {
  totalRumors: number;
  playersWithRumors: number;
  expiredRumors: number;
  averageCredibility: number;
} {
  const allRumors = getAllActiveRumors();
  const expired = allRumors.filter(r => isRumorExpired(r)).length;
  
  const totalCredibility = allRumors.reduce((sum, r) => sum + r.credibility, 0);
  const avgCredibility = allRumors.length > 0 ? totalCredibility / allRumors.length : 0;
  
  return {
    totalRumors: allRumors.length,
    playersWithRumors: activeRumors.size,
    expiredRumors: expired,
    averageCredibility: avgCredibility,
  };
}


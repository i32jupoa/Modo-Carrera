/**
 * TransferHistory - Sistema de historial de fichajes
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { TransferRecord, TransferType } from './types';

// ============================================================================
// ALMACENAMIENTO DE HISTORIAL
// ============================================================================

const transferHistory = new Map<string, TransferRecord[]>();
const MAX_HISTORY_PER_CLUB = 100;

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Registra un fichaje en el historial
 * @param record - Registro del fichaje
 */
export function recordTransfer(record: TransferRecord): void {
  const { fromClubId, toClubId } = record;
  
  // Añadir al historial del club vendedor
  addTransferToClubHistory(fromClubId, record);
  
  // Añadir al historial del club comprador
  addTransferToClubHistory(toClubId, record);
}

/**
 * Añade un fichaje al historial de un club
 * @param clubId - ID del club
 * @param record - Registro del fichaje
 */
function addTransferToClubHistory(clubId: string, record: TransferRecord): void {
  if (!transferHistory.has(clubId)) {
    transferHistory.set(clubId, []);
  }
  
  const clubHistory = transferHistory.get(clubId)!;
  
  // Añadir al principio (más reciente primero)
  clubHistory.unshift(record);
  
  // Limitar tamaño del historial
  if (clubHistory.length > MAX_HISTORY_PER_CLUB) {
    clubHistory.pop();
  }
}

/**
 * Obtiene el historial de fichajes de un club
 * @param clubId - ID del club
 * @returns Historial de fichajes
 */
export function getClubTransferHistory(clubId: string): TransferRecord[] {
  return transferHistory.get(clubId) || [];
}

/**
 * Obtiene el historial de fichajes de entrada de un club
 * @param clubId - ID del club
 * @returns Fichajes de entrada
 */
export function getClubInboundTransfers(clubId: string): TransferRecord[] {
  const history = getClubTransferHistory(clubId);
  return history.filter(record => record.toClubId === clubId);
}

/**
 * Obtiene el historial de fichajes de salida de un club
 * @param clubId - ID del club
 * @returns Fichajes de salida
 */
export function getClubOutboundTransfers(clubId: string): TransferRecord[] {
  const history = getClubTransferHistory(clubId);
  return history.filter(record => record.fromClubId === clubId);
}

/**
 * Obtiene el historial de fichajes de un jugador
 * @param playerId - ID del jugador
 * @returns Historial de fichajes del jugador
 */
export function getPlayerTransferHistory(playerId: string): TransferRecord[] {
  const allRecords: TransferRecord[] = [];
  
  for (const clubHistory of transferHistory.values()) {
    const playerRecords = clubHistory.filter(record => record.playerId === playerId);
    allRecords.push(...playerRecords);
  }
  
  // Ordenar por fecha (más reciente primero)
  return allRecords.sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/**
 * Obtiene todos los fichajes de una ventana de mercado
 * @param windowStart - Fecha de inicio de la ventana
 * @param windowEnd - Fecha de fin de la ventana
 * @returns Fichajes de la ventana
 */
export function getTransfersInWindow(
  windowStart: string,
  windowEnd: string
): TransferRecord[] {
  const allRecords: TransferRecord[] = [];
  
  for (const clubHistory of transferHistory.values()) {
    const windowRecords = clubHistory.filter(record => {
      const transferDate = new Date(record.date);
      const startDate = new Date(windowStart);
      const endDate = new Date(windowEnd);
      
      return transferDate >= startDate && transferDate <= endDate;
    });
    
    allRecords.push(...windowRecords);
  }
  
  // Eliminar duplicados (mismo fichaje aparece en historial de ambos clubes)
  const uniqueRecords = new Map<string, TransferRecord>();
  for (const record of allRecords) {
    const key = `${record.playerId}-${record.date}`;
    uniqueRecords.set(key, record);
  }
  
  return Array.from(uniqueRecords.values());
}

/**
 * Calcula el gasto total de un club en una ventana
 * @param clubId - ID del club
 * @param windowStart - Fecha de inicio
 * @param windowEnd - Fecha de fin
 * @returns Gasto total
 */
export function calculateClubSpendingInWindow(
  clubId: string,
  windowStart: string,
  windowEnd: string
): number {
  const inboundTransfers = getClubInboundTransfers(clubId);
  
  return inboundTransfers
    .filter(record => {
      const transferDate = new Date(record.date);
      const startDate = new Date(windowStart);
      const endDate = new Date(windowEnd);
      
      return transferDate >= startDate && transferDate <= endDate;
    })
    .reduce((total, record) => total + (record.amount || 0), 0);
}

/**
 * Calcula los ingresos totales de un club en una ventana
 * @param clubId - ID del club
 * @param windowStart - Fecha de inicio
 * @param windowEnd - Fecha de fin
 * @returns Ingresos totales
 */
export function calculateClubIncomeInWindow(
  clubId: string,
  windowStart: string,
  windowEnd: string
): number {
  const outboundTransfers = getClubOutboundTransfers(clubId);
  
  return outboundTransfers
    .filter(record => {
      const transferDate = new Date(record.date);
      const startDate = new Date(windowStart);
      const endDate = new Date(windowEnd);
      
      return transferDate >= startDate && transferDate <= endDate;
    })
    .reduce((total, record) => total + (record.amount || 0), 0);
}

/**
 * Calcula el balance neto de un club en una ventana
 * @param clubId - ID del club
 * @param windowStart - Fecha de inicio
 * @param windowEnd - Fecha de fin
 * @returns Balance neto (ingresos - gastos)
 */
export function calculateClubNetBalanceInWindow(
  clubId: string,
  windowStart: string,
  windowEnd: string
): number {
  const income = calculateClubIncomeInWindow(clubId, windowStart, windowEnd);
  const spending = calculateClubSpendingInWindow(clubId, windowStart, windowEnd);
  
  return income - spending;
}

/**
 * Obtiene los fichajes más caros de una ventana
 * @param windowStart - Fecha de inicio
 * @param windowEnd - Fecha de fin
 * @param limit - Número máximo de fichajes
 * @returns Fichajes más caros
 */
export function getMostExpensiveTransfersInWindow(
  windowStart: string,
  windowEnd: string,
  limit: number = 10
): TransferRecord[] {
  const transfers = getTransfersInWindow(windowStart, windowEnd);
  
  return transfers
    .filter(record => record.amount && record.amount > 0)
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, limit);
}

/**
 * Obtiene los fichajes más baratos de una ventana
 * @param windowStart - Fecha de inicio
 * @param windowEnd - Fecha de fin
 * @param limit - Número máximo de fichajes
 * @returns Fichajes más baratos
 */
export function getCheapestTransfersInWindow(
  windowStart: string,
  windowEnd: string,
  limit: number = 10
): TransferRecord[] {
  const transfers = getTransfersInWindow(windowStart, windowEnd);
  
  return transfers
    .filter(record => record.amount && record.amount > 0)
    .sort((a, b) => (a.amount || 0) - (b.amount || 0))
    .slice(0, limit);
}

/**
 * Obtiene estadísticas de fichajes por tipo
 * @param windowStart - Fecha de inicio
 * @param windowEnd - Fecha de fin
 * @returns Estadísticas por tipo
 */
export function getTransferStatsByType(
  windowStart: string,
  windowEnd: string
): Record<TransferType, number> {
  const transfers = getTransfersInWindow(windowStart, windowEnd);
  
  const stats: Record<TransferType, number> = {} as Record<TransferType, number>;
  
  for (const record of transfers) {
    stats[record.type] = (stats[record.type] || 0) + 1;
  }
  
  return stats;
}

/**
 * Busca fichajes por nombre de jugador
 * @param playerName - Nombre del jugador
 * @returns Fichajes encontrados
 */
export function searchTransfersByPlayer(playerName: string): TransferRecord[] {
  const allRecords: TransferRecord[] = [];
  
  for (const clubHistory of transferHistory.values()) {
    const matches = clubHistory.filter(record => 
      record.playerName.toLowerCase().includes(playerName.toLowerCase())
    );
    allRecords.push(...matches);
  }
  
  // Eliminar duplicados
  const uniqueRecords = new Map<string, TransferRecord>();
  for (const record of allRecords) {
    const key = `${record.playerId}-${record.date}`;
    uniqueRecords.set(key, record);
  }
  
  return Array.from(uniqueRecords.values());
}

/**
 * Busca fichajes por nombre de club
 * @param clubName - Nombre del club
 * @returns Fichajes encontrados
 */
export function searchTransfersByClub(clubName: string): TransferRecord[] {
  const allRecords: TransferRecord[] = [];
  
  for (const [clubId, clubHistory] of transferHistory.entries()) {
    const matches = clubHistory.filter(record => 
      record.fromClubName.toLowerCase().includes(clubName.toLowerCase()) ||
      record.toClubName.toLowerCase().includes(clubName.toLowerCase())
    );
    allRecords.push(...matches);
  }
  
  // Eliminar duplicados
  const uniqueRecords = new Map<string, TransferRecord>();
  for (const record of allRecords) {
    const key = `${record.playerId}-${record.date}`;
    uniqueRecords.set(key, record);
  }
  
  return Array.from(uniqueRecords.values());
}

/**
 * Limpia el historial de un club
 * @param clubId - ID del club
 */
export function clearClubTransferHistory(clubId: string): void {
  transferHistory.delete(clubId);
}

/**
 * Limpia todo el historial de fichajes
 */
export function clearAllTransferHistory(): void {
  transferHistory.clear();
}

/**
 * Exporta el historial completo
 * @returns Historial completo
 */
export function exportTransferHistory(): Map<string, TransferRecord[]> {
  return new Map(transferHistory);
}

/**
 * Importa el historial completo
 * @param history - Historial a importar
 */
export function importTransferHistory(history: Map<string, TransferRecord[]>): void {
  transferHistory.clear();
  
  for (const [clubId, records] of history.entries()) {
    transferHistory.set(clubId, [...records]);
  }
}

/**
 * Obtiene estadísticas generales del historial
 * @returns Estadísticas
 */
export function getTransferHistoryStats(): {
  totalTransfers: number;
  totalClubs: number;
  totalSpent: number;
  averageTransferFee: number;
} {
  let totalTransfers = 0;
  let totalSpent = 0;
  
  for (const clubHistory of transferHistory.values()) {
    totalTransfers += clubHistory.length;
    
    for (const record of clubHistory) {
      if (record.amount) {
        totalSpent += record.amount;
      }
    }
  }
  
  return {
    totalTransfers,
    totalClubs: transferHistory.size,
    totalSpent,
    averageTransferFee: totalTransfers > 0 ? totalSpent / totalTransfers : 0,
  };
}

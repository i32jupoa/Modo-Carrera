/**
 * Compatibilidad con partidas existentes
 * Asegura que el nuevo sistema de transferencias no rompa partidas guardadas
 */

import { 
  initializeTransferSystem,
  importTransferSystemState,
  exportTransferSystemState,
} from './integration';

// ============================================================================
// VERSION DEL SISTEMA
// ============================================================================

const TRANSFER_SYSTEM_VERSION = '1.0.0';
const STORAGE_KEY = 'fcsim:transfer_system:v1';

// ============================================================================
// MIGRACION DE DATOS
// ============================================================================

/**
 * Verifica si una partida guardada necesita migracion
 * @param saveData - Datos de la partida guardada
 * @returns Si necesita migracion
 */
export function needsMigration(saveData: any): boolean {
  // Si no tiene datos del sistema de transferencias, necesita inicializacion
  if (!saveData.transferSystem) {
    return true;
  }
  
  // Si la version es diferente, necesita migracion
  if (saveData.transferSystem.version !== TRANSFER_SYSTEM_VERSION) {
    return true;
  }
  
  return false;
}

/**
 * Migra una partida guardada al nuevo sistema
 * @param saveData - Datos de la partida guardada
 * @returns Datos migrados
 */
export function migrateSaveData(saveData: any): any {
  console.log('[TransferCompatibility] Iniciando migracion de partida');
  
  // Si no tiene sistema de transferencias, inicializar uno nuevo
  if (!saveData.transferSystem) {
    const currentDate = saveData.currentDate || '2025-07-01';
    initializeTransferSystem(currentDate);
    
    saveData.transferSystem = {
      version: TRANSFER_SYSTEM_VERSION,
      initialized: true,
      lastSimulationDate: currentDate,
    };
    
    console.log('[TransferCompatibility] Sistema de transferencias inicializado');
  } else {
    // Migrar desde version anterior
    saveData.transferSystem = migrateFromVersion(saveData.transferSystem);
  }
  
  return saveData;
}

/**
 * Migra desde una version especifica
 * @param oldSystem - Sistema antiguo
 * @returns Sistema migrado
 */
function migrateFromVersion(oldSystem: any): any {
  const version = oldSystem.version || '0.0.0';
  
  console.log(`[TransferCompatibility] Migrando desde version ${version}`);
  
  // Migracion especifica segun version
  switch (version) {
    case '0.0.0':
      return migrateFromV0(oldSystem);
    default:
      // Si es la misma version, no hacer nada
      return oldSystem;
  }
}

/**
 * Migracion desde version 0.0.0 (sin sistema de transferencias)
 * @param oldSystem - Sistema antiguo
 * @returns Sistema migrado
 */
function migrateFromV0(oldSystem: any): any {
  return {
    ...oldSystem,
    version: TRANSFER_SYSTEM_VERSION,
    initialized: true,
    migratedAt: new Date().toISOString(),
  };
}

// ============================================================================
// COMPATIBILIDAD CON STORE EXISTENTE
// ============================================================================

/**
 * Asegura que el playersStore sea compatible con el nuevo sistema
 * @param playersState - Estado actual del playersStore
 * @returns Estado compatible
 */
export function ensurePlayersStoreCompatibility(playersState: any): any {
  // Si ya tiene los campos del nuevo sistema, no hacer nada
  if (playersState.transferSystem) {
    return playersState;
  }
  
  // Anadir campos del nuevo sistema sin modificar los existentes
  return {
    ...playersState,
    transferSystem: {
      version: TRANSFER_SYSTEM_VERSION,
      initialized: false,
      lastSimulationDate: playersState.currentDate || '2025-07-01',
    },
  };
}

/**
 * Verifica si el playersStore tiene datos del nuevo sistema
 * @param playersState - Estado del playersStore
 * @returns Si es compatible
 */
export function hasTransferSystemData(playersState: any): boolean {
  return !!playersState.transferSystem;
}

// ============================================================================
// PERSISTENCIA
// ============================================================================

/**
 * Guarda el estado del sistema de transferencias en localStorage
 */
export function saveTransferSystemToStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const state = exportTransferSystemState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.log('[TransferCompatibility] Estado guardado en localStorage');
  } catch (error) {
    console.error('[TransferCompatibility] Error al guardar estado:', error);
  }
}

/**
 * Carga el estado del sistema de transferencias desde localStorage
 * @returns Estado cargado o null
 */
export function loadTransferSystemFromStorage(): any {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    
    const state = JSON.parse(data);
    importTransferSystemState(state);
    
    console.log('[TransferCompatibility] Estado cargado desde localStorage');
    return state;
  } catch (error) {
    console.error('[TransferCompatibility] Error al cargar estado:', error);
    return null;
  }
}

/**
 * Limpia el estado del sistema de transferencias de localStorage
 */
export function clearTransferSystemFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[TransferCompatibility] Estado eliminado de localStorage');
  } catch (error) {
    console.error('[TransferCompatibility] Error al limpiar estado:', error);
  }
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Obtiene la version actual del sistema
 * @returns Version
 */
export function getTransferSystemVersion(): string {
  return TRANSFER_SYSTEM_VERSION;
}

/**
 * Verifica si una versión es compatible
 * @param version - Versión a verificar
 * @returns Si es compatible
 */
export function isVersionCompatible(version: string): boolean {
  // Por ahora, todas las versiones son compatibles
  // En el futuro, implementar lógica de versiones semánticas
  return true;
}

/**
 * Obtiene información de diagnóstico del sistema
 * @returns Información de diagnóstico
 */
export function getDiagnosticInfo(): any {
  return {
    version: TRANSFER_SYSTEM_VERSION,
    storageKey: STORAGE_KEY,
    hasStorageData: typeof window !== "undefined" ? !!localStorage.getItem(STORAGE_KEY) : false,
    timestamp: new Date().toISOString(),
  };
}

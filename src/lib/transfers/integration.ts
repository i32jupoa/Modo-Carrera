/**
 * Integración del sistema de transferencias con el calendario existente
 * Conecta el nuevo sistema modular con el flujo del juego
 */

import { 
  initializeMarketSimulation, 
  simulateMarketDay, 
  resetForNewWindow,
  getSimulationState,
} from './MarketSimulation';
import { 
  calculateInitialBudget, 
  createInitialBudgetState,
  generateAllInitialBudgets,
} from './BudgetManager';
import { generateAllStrategies } from './ClubStrategy';
import { TEAMS } from '@/data/teams';
import { isMarketOpenForIso } from '@/lib/transferWindows';

// ============================================================================
// ESTADO DE INTEGRACIÓN
// ============================================================================

let isInitialized = false;
let budgetStates = new Map<string, any>();
let lastSimulationDate = '';

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

/**
 * Inicializa el sistema de transferencias
 * Debe llamarse al iniciar una nueva partida
 * @param startDate - Fecha de inicio (ISO date)
 */
export function initializeTransferSystem(startDate: string): void {
  // Inicializar simulación de mercado
  initializeMarketSimulation(startDate);
  
  // Generar estrategias para todos los clubes
  generateAllStrategies();
  
  // Generar presupuestos iniciales
  budgetStates = generateAllInitialBudgets();
  
  // Si generateAllInitialBudgets no está implementado, generar manualmente
  if (budgetStates.size === 0) {
    for (const team of TEAMS) {
      const budget = calculateInitialBudget(team.id);
      const budgetState = createInitialBudgetState(team.id);
      budgetStates.set(team.id, budgetState);
    }
  }
  
  isInitialized = true;
  lastSimulationDate = startDate;
  
  console.log('[TransferSystem] Sistema inicializado', {
    startDate,
    clubs: budgetStates.size,
  });
}

/**
 * Verifica si el sistema está inicializado
 * @returns Si está inicializado
 */
export function isTransferSystemInitialized(): boolean {
  return isInitialized;
}

// ============================================================================
// SIMULACIÓN DIARIA
// ============================================================================

/**
 * Simula el mercado para un día específico
 * Debe llamarse cada vez que el calendario avanza
 * @param currentDate - Fecha actual (ISO date)
 * @param allPlayers - Todos los jugadores del juego
 * @returns Resultado de la simulación
 */
export function simulateMarketForDate(
  currentDate: string,
  allPlayers: any[]
): { success: boolean; message: string; data?: any } {
  // Verificar si el sistema está inicializado
  if (!isInitialized) {
    initializeTransferSystem(currentDate);
  }
  
  // Si ya simulamos esta fecha, no repetir
  if (lastSimulationDate === currentDate) {
    return { success: true, message: 'Ya simulado para esta fecha' };
  }
  
  // Verificar si el mercado está abierto
  const isMarketOpen = isMarketOpenForIso(currentDate);
  
  if (!isMarketOpen) {
    // Mercado cerrado: solo renovar contratos
    const result = simulateMarketDay(currentDate, allPlayers, budgetStates);
    lastSimulationDate = currentDate;
    return result;
  }
  
  // Mercado abierto: simular normalmente
  const result = simulateMarketDay(currentDate, allPlayers, budgetStates);
  lastSimulationDate = currentDate;
  
  return result;
}

/**
 * Simula el mercado al avanzar múltiples días
 * @param startDate - Fecha de inicio
 * @param endDate - Fecha de fin
 * @param allPlayers - Todos los jugadores
 * @returns Resultado de la simulación
 */
export function simulateMarketForDateRange(
  startDate: string,
  endDate: string,
  allPlayers: any[]
): { success: boolean; message: string; data?: any } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);
  
  let totalActions = 0;
  const results: any[] = [];
  
  while (current <= end) {
    const isoDate = current.toISOString().split('T')[0];
    const result = simulateMarketForDate(isoDate, allPlayers);
    
    if (result.success && result.data) {
      totalActions += result.data.clubsActed || 0;
      results.push({ date: isoDate, ...result.data });
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return {
    success: true,
    message: `Simulados ${results.length} días, ${totalActions} acciones`,
    data: { results, totalActions },
  };
}

// ============================================================================
// GESTION DE VENTANAS DE MERCADO
// ============================================================================

/**
 * Se llama al abrir una nueva ventana de mercado
 * @param currentDate - Fecha actual
 * @param additionalIncomes - Ingresos adicionales por club
 */
export function onMarketWindowOpen(
  currentDate: string,
  additionalIncomes: Map<string, number> = new Map()
): void {
  // Reiniciar presupuestos para nueva ventana
  resetForNewWindow(currentDate, budgetStates, additionalIncomes);
  
  console.log('[TransferSystem] Nueva ventana de mercado', {
    date: currentDate,
    additionalIncomes: Object.fromEntries(additionalIncomes),
  });
}

/**
 * Se llama al cerrar una ventana de mercado
 * @param currentDate - Fecha actual
 */
export function onMarketWindowClose(currentDate: string): void {
  const state = getSimulationState();
  
  console.log('[TransferSystem] Ventana de mercado cerrada', {
    date: currentDate,
    window: state.currentWindow,
    activeOffers: state.activeOffers.length,
  });
}

/**
 * Verifica si estamos en un periodo de Deadline Day
 * @param currentDate - Fecha actual
 * @returns Si es Deadline Day
 */
export function isDeadlineDay(currentDate: string): boolean {
  const date = new Date(currentDate);
  const day = date.getDate();
  const month = date.getMonth();
  
  // Últimos 5 días de agosto (verano)
  if (month === 7 && day >= 27) return true;
  
  // Últimos 5 días de enero (invierno)
  if (month === 0 && day >= 27) return true;
  
  return false;
}

// ============================================================================
// GESTION DE PRESUPUESTOS
// ============================================================================

/**
 * Obtiene el estado del presupuesto de un club
 * @param clubId - ID del club
 * @returns Estado del presupuesto
 */
export function getClubBudgetState(clubId: string): any {
  return budgetStates.get(clubId);
}

/**
 * Actualiza el presupuesto de un club después de una venta
 * @param clubId - ID del club
 * @param saleAmount - Cantidad de la venta
 */
export function updateBudgetAfterSale(clubId: string, saleAmount: number): void {
  const budgetState = budgetStates.get(clubId);
  if (!budgetState) return;
  
  const updated = {
    ...budgetState,
    currentBudget: budgetState.currentBudget + saleAmount,
    windowIncome: budgetState.windowIncome + saleAmount,
    lastUpdated: new Date().toISOString(),
  };
  
  budgetStates.set(clubId, updated);
}

/**
 * Actualiza el presupuesto de un club después de una compra
 * @param clubId - ID del club
 * @param purchaseAmount - Cantidad de la compra
 * @param playerWage - Salario semanal del jugador
 * @returns Si fue exitoso
 */
export function updateBudgetAfterPurchase(
  clubId: string,
  purchaseAmount: number,
  playerWage: number
): boolean {
  const budgetState = budgetStates.get(clubId);
  if (!budgetState) return false;
  
  // Verificar presupuesto
  if (budgetState.currentBudget < purchaseAmount) return false;
  
  // Verificar masa salarial
  const newWageBill = budgetState.weeklyWageBill + playerWage;
  if (newWageBill > budgetState.maxWageBill) return false;
  
  const updated = {
    ...budgetState,
    currentBudget: budgetState.currentBudget - purchaseAmount,
    windowSpending: budgetState.windowSpending + purchaseAmount,
    weeklyWageBill: newWageBill,
    lastUpdated: new Date().toISOString(),
  };
  
  budgetStates.set(clubId, updated);
  return true;
}

/**
 * Obtiene todos los estados de presupuesto
 * @returns Mapa de clubId a estado de presupuesto
 */
export function getAllBudgetStates(): Map<string, any> {
  return new Map(budgetStates);
}

/**
 * Establece todos los estados de presupuesto (para cargar partida)
 * @param states - Estados de presupuesto
 */
export function setAllBudgetStates(states: Map<string, any>): void {
  budgetStates = new Map(states);
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Reinicia el sistema de transferencias
 */
export function resetTransferSystem(): void {
  isInitialized = false;
  budgetStates.clear();
  lastSimulationDate = '';
  
  console.log('[TransferSystem] Sistema reiniciado');
}

/**
 * Obtiene estadísticas del sistema
 * @returns Estadísticas
 */
export function getTransferSystemStats(): any {
  const state = getSimulationState();
  
  return {
    initialized: isInitialized,
    lastSimulationDate,
    currentWindow: state.currentWindow,
    currentDay: state.currentDay,
    activeOffers: state.activeOffers.length,
    activeRumors: state.activeRumors.length,
    clubsWithBudget: budgetStates.size,
  };
}

/**
 * Exporta el estado del sistema para guardar partida
 * @returns Estado serializable
 */
export function exportTransferSystemState(): any {
  return {
    isInitialized,
    lastSimulationDate,
    budgetStates: Array.from(budgetStates.entries()),
    simulationState: getSimulationState(),
  };
}

/**
 * Importa el estado del sistema al cargar partida
 * @param state - Estado exportado
 */
export function importTransferSystemState(state: any): void {
  isInitialized = state.isInitialized || false;
  lastSimulationDate = state.lastSimulationDate || '';
  budgetStates = new Map(state.budgetStates || []);
  
  if (state.simulationState) {
    // Restaurar estado de simulación si es necesario
  }
  
  console.log('[TransferSystem] Estado importado', {
    initialized: isInitialized,
    budgetStates: budgetStates.size,
  });
}

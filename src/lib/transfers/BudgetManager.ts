/**
 * BudgetManager - Gestión de presupuestos dinámicos
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { BudgetState } from './types';
import { 
  INITIAL_BUDGET_BY_CATEGORY,
  CLUB_CATEGORY_RANGES,
  WAGE_BILL_PERCENTAGE,
} from './constants';
import { teamById } from '@/data/teams';

// ============================================================================
// CACHE DE PRESUPUESTOS
// ============================================================================

const budgetCache = new Map<string, BudgetState>();

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Calcula el presupuesto inicial de un club
 * @param clubId - ID del club
 * @returns Presupuesto inicial en euros
 */
export function calculateInitialBudget(clubId: string): number {
  const team = teamById(clubId);
  if (!team) return 15_000_000; // Fallback a 15M
  
  const category = getClubCategory(team);
  const budgetMillions = INITIAL_BUDGET_BY_CATEGORY[category];
  
  // Ajustar por presupuesto específico del equipo si existe
  if (team.budget) {
    return team.budget * 1_000_000;
  }
  
  return budgetMillions * 1_000_000;
}

/**
 * Crea el estado inicial del presupuesto de un club
 * @param clubId - ID del club
 * @param contracts - Contratos del club (opcional)
 * @returns Estado del presupuesto
 */
export function createInitialBudgetState(
  clubId: string,
  contracts: any[] = []
): BudgetState {
  const initialBudget = calculateInitialBudget(clubId);
  const weeklyWageBill = calculateWeeklyWageBill(contracts);
  const maxWageBill = initialBudget * WAGE_BILL_PERCENTAGE / 52; // Anual a semanal
  
  return {
    clubId,
    currentBudget: initialBudget,
    totalWindowBudget: initialBudget,
    windowSpending: 0,
    windowIncome: 0,
    weeklyWageBill,
    maxWageBill,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Actualiza el presupuesto después de una venta
 * @param budgetState - Estado actual del presupuesto
 * @param saleAmount - Cantidad de la venta en euros
 * @returns Estado actualizado
 */
export function updateBudgetAfterSale(
  budgetState: BudgetState,
  saleAmount: number
): BudgetState {
  return {
    ...budgetState,
    currentBudget: budgetState.currentBudget + saleAmount,
    windowIncome: budgetState.windowIncome + saleAmount,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Actualiza el presupuesto después de una compra
 * @param budgetState - Estado actual del presupuesto
 * @param purchaseAmount - Cantidad de la compra en euros
 * @param playerWage - Salario semanal del jugador
 * @returns Estado actualizado o null si no hay presupuesto suficiente
 */
export function updateBudgetAfterPurchase(
  budgetState: BudgetState,
  purchaseAmount: number,
  playerWage: number
): BudgetState | null {
  // Verificar si hay presupuesto suficiente
  if (budgetState.currentBudget < purchaseAmount) {
    return null;
  }
  
  // Verificar si el salario excede el máximo
  const newWageBill = budgetState.weeklyWageBill + playerWage;
  if (newWageBill > budgetState.maxWageBill) {
    return null;
  }
  
  return {
    ...budgetState,
    currentBudget: budgetState.currentBudget - purchaseAmount,
    windowSpending: budgetState.windowSpending + purchaseAmount,
    weeklyWageBill: newWageBill,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Actualiza el presupuesto al inicio de una nueva ventana
 * @param budgetState - Estado actual del presupuesto
 * @param additionalIncome - Ingresos adicionales (premios, TV, etc.)
 * @returns Estado actualizado
 */
export function resetBudgetForNewWindow(
  budgetState: BudgetState,
  additionalIncome: number = 0
): BudgetState {
  // El presupuesto base se mantiene más ingresos adicionales
  const baseBudget = budgetState.totalWindowBudget;
  const newBudget = baseBudget + additionalIncome;
  
  return {
    ...budgetState,
    currentBudget: newBudget,
    totalWindowBudget: newBudget,
    windowSpending: 0,
    windowIncome: 0,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Calcula la masa salarial semanal total
 * @param contracts - Lista de contratos
 * @returns Masa salarial semanal en euros
 */
export function calculateWeeklyWageBill(contracts: any[]): number {
  return contracts.reduce((total, contract) => {
    return total + (contract.weeklyWage || 0);
  }, 0);
}

/**
 * Verifica si un club puede permitirse un fichaje
 * @param budgetState - Estado del presupuesto
 * @param transferFee - Cantidad del traspaso
 * @param weeklyWage - Salario semanal
 * @returns Si puede permitirse el fichaje
 */
export function canAffordTransfer(
  budgetState: BudgetState,
  transferFee: number,
  weeklyWage: number
): boolean {
  // Verificar presupuesto de transferencia
  if (budgetState.currentBudget < transferFee) {
    return false;
  }
  
  // Verificar límite salarial
  const newWageBill = budgetState.weeklyWageBill + weeklyWage;
  if (newWageBill > budgetState.maxWageBill) {
    return false;
  }
  
  return true;
}

/**
 * Calcula el presupuesto máximo disponible para un fichaje
 * @param budgetState - Estado del presupuesto
 * @param weeklyWage - Salario semanal del jugador
 * @returns Presupuesto máximo disponible
 */
export function calculateMaxTransferFee(
  budgetState: BudgetState,
  weeklyWage: number
): number {
  // Presupuesto actual
  let maxFee = budgetState.currentBudget;
  
  // Ajustar por límite salarial
  const availableWageSpace = budgetState.maxWageBill - budgetState.weeklyWageBill;
  if (weeklyWage > availableWageSpace) {
    // Si el salario excede el espacio disponible, reducir el presupuesto
    const wageExcess = weeklyWage - availableWageSpace;
    const wageCostEquivalent = wageExcess * 52; // Convertir a anual
    maxFee = Math.max(0, maxFee - wageCostEquivalent);
  }
  
  return maxFee;
}

/**
 * Calcula el salario máximo semanal que un club puede pagar
 * @param budgetState - Estado del presupuesto
 * @returns Salario máximo semanal
 */
export function calculateMaxWeeklyWage(budgetState: BudgetState): number {
  return budgetState.maxWageBill - budgetState.weeklyWageBill;
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Determina la categoría de un club según su valoración media
 * @param team - Equipo
 * @returns Categoría del club
 */
function getClubCategory(team: { att: number; mid: number; def: number }): keyof typeof CLUB_CATEGORY_RANGES {
  const avgRating = (team.att + team.mid + team.def) / 3;
  
  if (avgRating >= CLUB_CATEGORY_RANGES.elite.min && avgRating <= CLUB_CATEGORY_RANGES.elite.max) {
    return 'elite';
  }
  if (avgRating >= CLUB_CATEGORY_RANGES.big.min && avgRating <= CLUB_CATEGORY_RANGES.big.max) {
    return 'big';
  }
  if (avgRating >= CLUB_CATEGORY_RANGES.mid.min && avgRating <= CLUB_CATEGORY_RANGES.mid.max) {
    return 'mid';
  }
  if (avgRating >= CLUB_CATEGORY_RANGES.small.min && avgRating <= CLUB_CATEGORY_RANGES.small.max) {
    return 'small';
  }
  return 'minnow';
}

/**
 * Obtiene el estado del presupuesto de un club
 * @param clubId - ID del club
 * @returns Estado del presupuesto
 */
export function getBudgetState(clubId: string): BudgetState | null {
  return budgetCache.get(clubId) || null;
}

/**
 * Guarda el estado del presupuesto de un club
 * @param budgetState - Estado del presupuesto
 */
export function setBudgetState(budgetState: BudgetState): void {
  budgetCache.set(budgetState.clubId, budgetState);
}

/**
 * Limpia la caché de presupuestos
 */
export function clearBudgetCache(): void {
  budgetCache.clear();
}

/**
 * Genera presupuestos iniciales para todos los clubes
 * @returns Mapa de clubId a estado de presupuesto
 */
export function generateAllInitialBudgets(): Map<string, BudgetState> {
  const budgets = new Map<string, BudgetState>();
  
  // Esto se completará cuando tengamos acceso a todos los clubes
  // Por ahora es un placeholder
  return budgets;
}

// ============================================================================
// ANÁLISIS DE PRESUPUESTO
// ============================================================================

/**
 * Calcula el porcentaje de presupuesto gastado en la ventana actual
 * @param budgetState - Estado del presupuesto
 * @returns Porcentaje gastado (0-100)
 */
export function calculateBudgetSpentPercentage(budgetState: BudgetState): number {
  if (budgetState.totalWindowBudget === 0) return 0;
  return (budgetState.windowSpending / budgetState.totalWindowBudget) * 100;
}

/**
 * Calcula el porcentaje de masa salarial utilizado
 * @param budgetState - Estado del presupuesto
 * @returns Porcentaje de masa salarial (0-100)
 */
export function calculateWageBillPercentage(budgetState: BudgetState): number {
  if (budgetState.maxWageBill === 0) return 0;
  return (budgetState.weeklyWageBill / budgetState.maxWageBill) * 100;
}

/**
 * Determina si un club está en crisis financiera
 * @param budgetState - Estado del presupuesto
 * @returns Si está en crisis
 */
export function isInFinancialCrisis(budgetState: BudgetState): boolean {
  // Crisis si el presupuesto es muy bajo y la masa salarial es alta
  const budgetLow = budgetState.currentBudget < 10_000_000; // Menos de 10M
  const wageBillHigh = calculateWageBillPercentage(budgetState) > 90;
  
  return budgetLow && wageBillHigh;
}

/**
 * Determina si un club puede gastar agresivamente
 * @param budgetState - Estado del presupuesto
 * @returns Si puede gastar agresivamente
 */
export function canSpendAggressively(budgetState: BudgetState): boolean {
  const spentPercentage = calculateBudgetSpentPercentage(budgetState);
  const wagePercentage = calculateWageBillPercentage(budgetState);
  
  // Puede gastar agresivamente si ha gastado menos del 50% y la masa salarial está bajo control
  return spentPercentage < 50 && wagePercentage < 70;
}

/**
 * Calcula el presupuesto disponible por semana
 * @param budgetState - Estado del presupuesto
 * @returns Presupuesto semanal disponible
 */
export function calculateWeeklyAvailableBudget(budgetState: BudgetState): number {
  const remainingBudget = budgetState.currentBudget;
  const weeksRemaining = 52; // Asumiendo una temporada completa
  
  return remainingBudget / weeksRemaining;
}

/**
 * Proyecta el presupuesto al final de la ventana
 * @param budgetState - Estado del presupuesto
 * @param expectedSales - Ventas esperadas
 * @returns Presupuesto proyectado
 */
export function projectEndOfWindowBudget(
  budgetState: BudgetState,
  expectedSales: number = 0
): number {
  return budgetState.currentBudget - budgetState.windowSpending + budgetState.windowIncome + expectedSales;
}

/**
 * MarketSimulation - IA diaria del mercado
 * Sistema modular de transferencias inspirado en EA FC + Football Manager
 */

import type { MarketSimulationState, TransferResult } from './types';
import { 
  MARKET_ACTION_INTERVAL_DAYS,
  TRANSFER_SEARCH_PROBABILITY,
  DEADLINE_DAY_PROBABILITY,
  DEADLINE_DAY_THRESHOLD,
  MAX_SIMULTANEOUS_OFFERS,
} from './constants';
import { shouldSeekTransfers, shouldSellPlayers } from './ClubStrategy';
import { analyzeSquad, identifyTransferablePlayers, identifyLoanablePlayers } from './SquadAnalyzer';
import { canAffordTransfer, resetBudgetForNewWindow } from './BudgetManager';
import { findTransferCandidates, selectBestCandidate, initiateTransferNegotiation, shouldSellPlayer } from './TransferEngine';
import { createTransferOffer, processIncomingOffer, addActiveNegotiation, clearExpiredNegotiations } from './NegotiationEngine';
import { generateContract, shouldRenewContract, generateRenewalOffer } from './ContractEngine';
import { isMarketOpenForIso, parseDateOnly } from '@/lib/transferWindows';
import { TEAMS } from '@/data/teams';

// ============================================================================
// ESTADO DE SIMULACIÓN
// ============================================================================

let simulationState: MarketSimulationState = {
  currentDay: 0,
  currentWindow: 'closed',
  activeOffers: [],
  activeRumors: [],
  clubsActedToday: new Set(),
  lastSimulationDate: '',
};

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Inicializa la simulación del mercado
 * @param startDate - Fecha de inicio (ISO date)
 */
export function initializeMarketSimulation(startDate: string): void {
  simulationState = {
    currentDay: 0,
    currentWindow: getCurrentWindow(startDate),
    activeOffers: [],
    activeRumors: [],
    clubsActedToday: new Set(),
    lastSimulationDate: startDate,
  };
}

/**
 * Simula un día del mercado
 * @param currentDate - Fecha actual (ISO date)
 * @param allPlayers - Todos los jugadores
 * @param budgetStates - Estados de presupuesto por club
 * @returns Resultado de la simulación
 */
export function simulateMarketDay(
  currentDate: string,
  allPlayers: any[],
  budgetStates: Map<string, any>
): TransferResult {
  const date = parseDateOnly(currentDate);
  const isMarketOpen = isMarketOpenForIso(currentDate);
  
  // Actualizar ventana de mercado
  simulationState.currentWindow = getCurrentWindow(currentDate);
  
  // Si el mercado está cerrado, solo renovar contratos
  if (!isMarketOpen) {
    return simulateClosedMarketDay(currentDate, allPlayers, budgetStates);
  }
  
  // Limpiar negociaciones expiradas
  clearExpiredNegotiations();
  
  // Determinar si es Deadline Day
  const isDeadlineDay = isDeadlineDayPeriod(currentDate);
  
  // Incrementar día
  simulationState.currentDay++;
  simulationState.lastSimulationDate = currentDate;
  
  // Resetear clubes que han actuado hoy
  simulationState.clubsActedToday.clear();
  
  // Simular acciones para cada club
  const results: TransferResult[] = [];
  
  for (const team of TEAMS) {
    // Saltar si el club ya actuó hoy (para simular progresivamente)
    if (simulationState.clubsActedToday.has(team.id)) {
      continue;
    }
    
    // Probabilidad de que el club actúe hoy
    const actionProbability = isDeadlineDay ? DEADLINE_DAY_PROBABILITY : TRANSFER_SEARCH_PROBABILITY;
    
    if (Math.random() > actionProbability) {
      continue;
    }
    
    const clubResult = simulateClubActions(
      team.id,
      currentDate,
      allPlayers,
      budgetStates.get(team.id),
      isDeadlineDay
    );
    
    results.push(clubResult);
    simulationState.clubsActedToday.add(team.id);
  }
  
  return {
    success: true,
    message: `Día simulado: ${currentDate}`,
    data: {
      clubsActed: simulationState.clubsActedToday.size,
      results,
    },
  };
}

/**
 * Simula acciones de un club específico
 * @param clubId - ID del club
 * @param currentDate - Fecha actual
 * @param allPlayers - Todos los jugadores
 * @param budgetState - Estado del presupuesto
 * @param isDeadlineDay - Si es Deadline Day
 * @returns Resultado de la simulación
 */
function simulateClubActions(
  clubId: string,
  currentDate: string,
  allPlayers: any[],
  budgetState: any,
  isDeadlineDay: boolean
): TransferResult {
  if (!budgetState) {
    return { success: false, message: 'Sin presupuesto' };
  }
  
  const clubPlayers = allPlayers.filter(p => p.Team === clubId);
  const squadAnalysis = analyzeSquad(clubId, clubPlayers);
  
  // 1. Renovar contratos
  const renewals = simulateContractRenewals(clubId, clubPlayers, currentDate);
  
  // 2. Buscar fichajes si hay necesidades
  const transfers = simulateTransferSearch(
    clubId,
    currentDate,
    allPlayers,
    budgetState,
    squadAnalysis,
    isDeadlineDay
  );
  
  // 3. Vender jugadores si es necesario
  const sales = simulatePlayerSales(
    clubId,
    currentDate,
    clubPlayers,
    budgetState,
    squadAnalysis,
    isDeadlineDay
  );
  
  return {
    success: true,
    message: `Acciones simuladas para ${clubId}`,
    data: {
      renewals,
      transfers,
      sales,
    },
  };
}

/**
 * Simula renovaciones de contratos
 * @param clubId - ID del club
 * @param players - Jugadores del club
 * @param currentDate - Fecha actual
 * @returns Renovaciones realizadas
 */
function simulateContractRenewals(
  clubId: string,
  players: any[],
  currentDate: string
): number {
  let renewals = 0;
  
  for (const player of players) {
    // Simular contrato (en un sistema real vendrían de ContractEngine)
    const contract = generateContract(
      player.id || String(player.ID),
      clubId,
      5_000_000, // Valor estimado
      player.Age,
      player.OVR,
      currentDate
    );
    
    // Verificar si debe renovarse
    if (shouldRenewContract(contract, player.OVR, player.Age)) {
      renewals++;
      // En un sistema real, se generaría la oferta de renovación
    }
  }
  
  return renewals;
}

/**
 * Simula búsqueda de fichajes
 * @param clubId - ID del club
 * @param currentDate - Fecha actual
 * @param allPlayers - Todos los jugadores
 * @param budgetState - Estado del presupuesto
 * @param squadAnalysis - Análisis de plantilla
 * @param isDeadlineDay - Si es Deadline Day
 * @returns Fichajes realizados
 */
function simulateTransferSearch(
  clubId: string,
  currentDate: string,
  allPlayers: any[],
  budgetState: any,
  squadAnalysis: any,
  isDeadlineDay: boolean
): number {
  // Verificar si el club debe buscar fichajes
  if (!shouldSeekTransfers(clubId, budgetState.currentBudget, squadAnalysis.needs)) {
    return 0;
  }
  
  // Verificar si puede permitirse fichajes
  if (!canAffordTransfer(budgetState, 10_000_000, 50_000)) {
    return 0;
  }
  
  // Buscar candidatos
  const candidates = findTransferCandidates(
    clubId,
    allPlayers,
    budgetState,
    squadAnalysis.needs
  );
  
  if (candidates.length === 0) {
    return 0;
  }
  
  // Seleccionar mejor candidato
  const selected = selectBestCandidate(candidates, budgetState.currentBudget);
  
  if (!selected) {
    return 0;
  }
  
  // Iniciar negociación
  const player = allPlayers.find(p => (p.id || String(p.ID)) === selected.playerId);
  if (!player) {
    return 0;
  }
  
  const baseValue = 5_000_000; // Valor base estimado
  const offerAmount = Math.round(baseValue * (0.8 + Math.random() * 0.4));
  
  const result = initiateTransferNegotiation(clubId, selected.playerId, offerAmount, player);
  
  if (result.success) {
    // Crear oferta y añadir a negociaciones activas
    const offer = createTransferOffer(clubId, player.Team, selected.playerId, offerAmount);
    addActiveNegotiation(offer);
    simulationState.activeOffers.push(offer);
    
    return 1;
  }
  
  return 0;
}

/**
 * Simula ventas de jugadores
 * @param clubId - ID del club
 * @param currentDate - Fecha actual
 * @param players - Jugadores del club
 * @param budgetState - Estado del presupuesto
 * @param squadAnalysis - Análisis de plantilla
 * @param isDeadlineDay - Si es Deadline Day
 * @returns Ventas realizadas
 */
function simulatePlayerSales(
  clubId: string,
  currentDate: string,
  players: any[],
  budgetState: any,
  squadAnalysis: any,
  isDeadlineDay: boolean
): number {
  // Verificar si el club debe vender
  const transferList = identifyTransferablePlayers(players, squadAnalysis);
  
  if (!shouldSellPlayers(clubId, budgetState.currentBudget, transferList.length)) {
    return 0;
  }
  
  let sales = 0;
  
  for (const playerId of transferList.slice(0, 3)) {
    // Simular oferta entrante
    const player = players.find(p => (p.id || String(p.ID)) === playerId);
    if (!player) continue;
    
    const baseValue = 5_000_000; // Valor base estimado
    const offerAmount = Math.round(baseValue * (0.7 + Math.random() * 0.5));
    
    if (shouldSellPlayer(clubId, player, offerAmount)) {
      sales++;
      // En un sistema real, se procesaría la venta
    }
  }
  
  return sales;
}

/**
 * Simula un día con mercado cerrado
 * @param currentDate - Fecha actual
 * @param allPlayers - Todos los jugadores
 * @param budgetStates - Estados de presupuesto
 * @returns Resultado de la simulación
 */
function simulateClosedMarketDay(
  currentDate: string,
  allPlayers: any[],
  budgetStates: Map<string, any>
): TransferResult {
  // Solo renovar contratos
  let totalRenewals = 0;
  
  for (const team of TEAMS) {
    const clubPlayers = allPlayers.filter(p => p.Team === team.id);
    const renewals = simulateContractRenewals(team.id, clubPlayers, currentDate);
    totalRenewals += renewals;
  }
  
  return {
    success: true,
    message: `Día cerrado simulado: ${currentDate}`,
    data: {
      renewals: totalRenewals,
    },
  };
}

/**
 * Simula el Deadline Day
 * @param currentDate - Fecha actual
 * @param allPlayers - Todos los jugadores
 * @param budgetStates - Estados de presupuesto
 * @returns Resultado de la simulación
 */
export function simulateDeadlineDay(
  currentDate: string,
  allPlayers: any[],
  budgetStates: Map<string, any>
): TransferResult {
  // Simular con mayor probabilidad de acción
  return simulateMarketDay(currentDate, allPlayers, budgetStates);
}

/**
 * Reinicia el presupuesto para una nueva ventana
 * @param currentDate - Fecha actual
 * @param budgetStates - Estados de presupuesto
 * @param additionalIncomes - Ingresos adicionales por club
 */
export function resetForNewWindow(
  currentDate: string,
  budgetStates: Map<string, any>,
  additionalIncomes: Map<string, number> = new Map()
): void {
  for (const [clubId, budgetState] of budgetStates.entries()) {
    const additionalIncome = additionalIncomes.get(clubId) || 0;
    const newBudgetState = resetBudgetForNewWindow(budgetState, additionalIncome);
    budgetStates.set(clubId, newBudgetState);
  }
  
  // Limpiar ofertas activas
  simulationState.activeOffers = [];
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Determina la ventana de mercado actual
 * @param date - Fecha
 * @returns Ventana actual
 */
function getCurrentWindow(date: string): 'summer' | 'winter' | 'closed' {
  const parsed = parseDateOnly(date);
  const month = parsed.getMonth();
  
  // Verano: julio (6) - agosto (8)
  if (month >= 6 && month <= 8) {
    return 'summer';
  }
  
  // Invierno: enero (0)
  if (month === 0) {
    return 'winter';
  }
  
  return 'closed';
}

/**
 * Determina si es periodo de Deadline Day
 * @param currentDate - Fecha actual
 * @returns Si es Deadline Day
 */
function isDeadlineDayPeriod(currentDate: string): boolean {
  const window = getCurrentWindow(currentDate);
  if (window === 'closed') return false;
  
  const parsed = parseDateOnly(currentDate);
  const day = parsed.getDate();
  const month = parsed.getMonth();
  
  // Últimos días de agosto (verano)
  if (window === 'summer' && month === 8 && day >= (31 - DEADLINE_DAY_THRESHOLD)) {
    return true;
  }
  
  // Últimos días de enero (invierno)
  if (window === 'winter' && month === 0 && day >= (31 - DEADLINE_DAY_THRESHOLD)) {
    return true;
  }
  
  return false;
}

/**
 * Obtiene el estado actual de la simulación
 * @returns Estado de la simulación
 */
export function getSimulationState(): MarketSimulationState {
  return simulationState;
}

/**
 * Obtiene las ofertas activas
 * @returns Ofertas activas
 */
export function getActiveOffers(): any[] {
  return simulationState.activeOffers;
}

/**
 * Obtiene los rumores activos
 * @returns Rumores activos
 */
export function getActiveRumors(): any[] {
  return simulationState.activeRumors;
}

/**
 * Limpia el estado de la simulación
 */
export function clearSimulationState(): void {
  simulationState = {
    currentDay: 0,
    currentWindow: 'closed',
    activeOffers: [],
    activeRumors: [],
    clubsActedToday: new Set(),
    lastSimulationDate: '',
  };
}

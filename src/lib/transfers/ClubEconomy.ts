import { getClubPlayers, getPlayer } from './PlayerIndex';
import { WAGE_RULES } from './constants';
import { clamp } from './random';

/**
 * Convierte el contrato del motor de mercado en la representación económica
 * que usa la interfaz. El motor es la fuente única de verdad del salario.
 */
export function playerAnnualSalary(playerId: string): number {
  return Math.max(WAGE_RULES.minimumWage, Math.round(getPlayer(playerId)?.contract.wage ?? WAGE_RULES.minimumWage));
}

export function clubWageBill(clubId: string): number {
  return Math.round(getClubPlayers(clubId).reduce((sum, player) => sum + player.contract.wage, 0));
}

/**
 * Modelo económico del usuario:
 * - `totalBudget` es todo el dinero disponible del club.
 * - `wageBudget` es la parte reservada a salarios (5%–30% del total).
 * - `transferBudget` es lo que queda para fichajes.
 * La masa salarial real se mantiene aparte en `wageBill`.
 */
export function normalizeClubBudget(totalBudget: number, wageBill: number): { totalBudget: number; wageBudget: number; transferBudget: number } {
  const total = Math.max(0, Math.round(totalBudget));
  const wageBudget = Math.round(total * 0.20);
  return {
    totalBudget: total,
    wageBudget,
    transferBudget: total - wageBudget,
  };
}

export function clampWageAllocation(totalBudget: number, _currentWageBill: number, requestedWageBudget: number): number {
  const total = Math.max(0, Math.round(totalBudget));
  const minWage = Math.ceil(total * 0.05);
  const maxWage = Math.floor(total * 0.30);
  return clamp(Math.round(requestedWageBudget), minWage, maxWage);
}

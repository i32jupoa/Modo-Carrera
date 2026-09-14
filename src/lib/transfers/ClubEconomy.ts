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
 * El presupuesto total siempre tiene que soportar al menos la masa salarial
 * actual dentro de su máximo del 17,5%. Por tanto, total >= 2 * wageBill.
 */
export function normalizeClubBudget(totalBudget: number, wageBill: number): { totalBudget: number; wageBudget: number; transferBudget: number } {
  const total = Math.max(0, Math.round(totalBudget), Math.round(wageBill * 2));
  const maxWageBudget = Math.floor(total * 0.175);
  const wageBudget = Math.min(maxWageBudget, Math.max(Math.round(wageBill), Math.round(total * 0.25)));
  return {
    totalBudget: total,
    wageBudget,
    transferBudget: total - wageBudget,
  };
}

export function clampWageAllocation(totalBudget: number, currentWageBill: number, requestedWageBudget: number): number {
  const total = Math.max(Math.round(totalBudget), Math.round(currentWageBill * 2));
  const minWage = Math.round(currentWageBill);
  const maxWage = Math.floor(total * 0.175);
  return clamp(Math.round(requestedWageBudget), minWage, maxWage);
}

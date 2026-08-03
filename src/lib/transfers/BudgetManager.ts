/**
 * Gestión económica de los clubes de la IA.
 *
 * Cada club tiene un presupuesto de fichajes y un tope salarial derivados de su
 * poder económico. El presupuesto se mueve con las ventas, los premios de fin
 * de temporada y el gasto en fichajes, siempre con límites duros para que la
 * IA no se arruine ni acumule cantidades absurdas.
 */

import { BUDGET_RULES, WAGE_RULES } from "./constants";
import { getClubProfile } from "./ClubStrategy";
import { getClubPlayers } from "./PlayerIndex";
import { clamp } from "./random";
import type { ClubFinances, ClubProfile } from "./types";

/** Presupuesto inicial de fichajes según el poder económico del club. */
function initialBudget(profile: ClubProfile): number {
  const power = clamp(profile.financialPower, 0, 1);
  // Escala exponencial: los grandes manejan cifras de otro orden.
  const budget = 2_000_000 + Math.pow(power, 3.2) * 260_000_000;
  return Math.max(BUDGET_RULES.floor, Math.round(budget));
}

/** Masa salarial comprometida hoy por el club. */
function currentWageBill(clubId: string): number {
  return getClubPlayers(clubId).reduce((sum, player) => sum + player.contract.wage, 0);
}

function createFinances(clubId: string): ClubFinances {
  const profile = getClubProfile(clubId);
  const budget = initialBudget(profile);
  const wageBill = currentWageBill(clubId);
  return {
    clubId,
    budget,
    initialBudget: budget,
    wageBudget: Math.max(wageBill * 1.12, Math.round(budget * WAGE_RULES.wageBudgetFactor)),
    wageBill,
    spent: 0,
    earned: 0,
  };
}

const finances = new Map<string, ClubFinances>();

/** Finanzas de un club (se crean bajo demanda). */
export function getFinances(clubId: string): ClubFinances {
  let entry = finances.get(clubId);
  if (!entry) {
    entry = createFinances(clubId);
    finances.set(clubId, entry);
  }
  return entry;
}

/** Sustituye las finanzas de un club (al cargar una partida guardada). */
export function setFinances(entry: ClubFinances): void {
  finances.set(entry.clubId, entry);
}

/** Instantánea de todas las finanzas conocidas (para persistir). */
export function snapshotFinances(): ClubFinances[] {
  return Array.from(finances.values()).map((entry) => ({ ...entry }));
}

/** Reinicia las finanzas de todos los clubes. */
export function resetFinances(): void {
  finances.clear();
}

/** Dinero que un club está dispuesto a gastar en un solo fichaje. */
export function maxSpend(clubId: string): number {
  const entry = getFinances(clubId);
  const usable = entry.budget * (1 - BUDGET_RULES.reserveShare);
  return Math.max(0, Math.round(usable));
}

/** Salario máximo que el club puede ofrecer a un solo jugador. */
export function maxWageOffer(clubId: string): number {
  const entry = getFinances(clubId);
  const room = entry.wageBudget - entry.wageBill;
  const singleCap = entry.wageBudget * WAGE_RULES.maxShareSingle;
  return Math.max(WAGE_RULES.minimumWage, Math.round(Math.min(room, singleCap)));
}

/** ¿Puede el club asumir traspaso y salario? */
export function canAfford(clubId: string, fee: number, wage: number): boolean {
  return fee <= maxSpend(clubId) && wage <= maxWageOffer(clubId);
}

/** Registra un fichaje: descuenta traspaso y suma salario. */
export function registerSigning(clubId: string, fee: number, wage: number): void {
  const entry = getFinances(clubId);
  entry.budget = Math.max(0, entry.budget - fee);
  entry.spent += fee;
  entry.wageBill += wage;
}

/** Registra una venta: parte del ingreso vuelve al presupuesto. */
export function registerSale(clubId: string, fee: number, wage: number): void {
  const entry = getFinances(clubId);
  entry.budget += Math.round(fee * BUDGET_RULES.saleReinvestment);
  entry.earned += fee;
  entry.wageBill = Math.max(0, entry.wageBill - wage);
}

/** Registra el ahorro salarial de una cesión con reparto de sueldo. */
export function registerLoanOut(clubId: string, wage: number, wageShareCovered: number): void {
  const entry = getFinances(clubId);
  entry.wageBill = Math.max(0, entry.wageBill - wage * clamp(wageShareCovered, 0, 1));
}

/** ¿El club necesita vender para poder operar? */
export function needsToSell(clubId: string): boolean {
  const entry = getFinances(clubId);
  return entry.budget < entry.initialBudget * 0.1 || entry.wageBill > entry.wageBudget;
}

/** Reinicia la ventana: ingresos por premios y nuevo colchón. */
export function refillForNewWindow(clubId: string): void {
  const entry = getFinances(clubId);
  entry.budget = Math.max(
    BUDGET_RULES.floor,
    Math.round(entry.budget + entry.initialBudget * BUDGET_RULES.windowRefill),
  );
  entry.spent = 0;
  entry.earned = 0;
  entry.wageBill = currentWageBill(clubId);
}

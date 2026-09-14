import { clamp } from "./random";

/**
 * Salario bruto anual estimado para un jugador.
 *
 * Se usa en todo el mercado y no depende del club destino, de modo que cada
 * jugador tiene una ficha coherente independientemente de quién lo consulte.
 * El nivel del club influye sólo a través del valor de mercado ya calculado.
 */
export function estimateAnnualWage(value: number, age: number, ovr: number): number {
  const millionValue = Math.max(0, value) / 1_000_000;
  const elitePremium = clamp((ovr - 82) / 12, 0, 1) * 0.035;
  const ageAdjustment = age >= 30 ? 0.92 : age <= 22 ? 0.93 : 1;
  const wageRate = (0.095 + elitePremium) * ageAdjustment;
  const floor = ovr >= 80 ? 500_000 : ovr >= 72 ? 180_000 : 60_000;
  const ceiling = ovr >= 90 ? 45_000_000 : ovr >= 85 ? 28_000_000 : 12_000_000;
  return Math.round(clamp(millionValue * wageRate * 1_000_000, floor, ceiling));
}

/**
 * Política temporal y deportiva de renovaciones de clubes controlados por la IA.
 *
 * Las revisiones se concentran en dos fases por temporada: enero y el tramo
 * abril-junio. Las funciones son puras para poder probar la política sin
 * inicializar el mercado, IndexedDB ni el store de React.
 */

export type ContractRenewalPhase = "winter" | "late-season";

export interface RenewalProbabilityInput {
  phase: ContractRenewalPhase;
  ambition: number;
  isKeyPlayer: boolean;
  isYoungProspect: boolean;
  isUseful: boolean;
  isDecliningVeteran: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Devuelve la fase de revisión de contratos para una fecha ISO o null. */
export function getContractRenewalPhase(date: string): ContractRenewalPhase | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const month = Number(date.slice(5, 7));
  if (month === 1) return "winter";
  if (month >= 4 && month <= 6) return "late-season";
  return null;
}

/** Clave estable por temporada y fase, no por día de simulación. */
export function getContractRenewalPhaseKey(
  date: string,
  phase: ContractRenewalPhase,
): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const seasonStartYear = month >= 7 ? year : year - 1;
  return `${seasonStartYear}:${phase}`;
}

/**
 * Probabilidad de que el club decida presentar una oferta en esta fase.
 * La aceptación del futbolista se calcula por separado en PlayerDecision.
 * Las ofertas son la norma para titulares y jugadores útiles: se busca una retención
 * cercana al 90 %, mientras que salario, rol, ambición y presupuesto siguen pudiendo
 * frustrar un acuerdo individual.
 */
export function clubRenewalProbability(input: RenewalProbabilityInput): number {
  // La retención de jugadores importantes debe ser la norma. La primera fase
  // intenta anticiparse a las salidas y la fase final insiste si el jugador
  // sigue siendo útil. Los motivos deportivos/económicos se deciden aparte.
  const base = input.phase === "winter" ? 0.56 : 0.82;
  const ambition = clamp(Number.isFinite(input.ambition) ? input.ambition : 0.5, 0, 1);
  const probability =
    base +
    ambition * 0.08 +
    (input.isKeyPlayer ? 0.08 : 0) +
    (input.isYoungProspect ? 0.07 : 0) +
    (input.isUseful ? 0.04 : 0) -
    (input.isDecliningVeteran ? 0.28 : 0);

  return clamp(probability, 0.05, 0.97);
}

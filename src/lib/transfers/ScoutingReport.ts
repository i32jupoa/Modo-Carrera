import type { ScoutingEntry } from "./Scouting";
import { scoutFieldIsDetected, type ScoutField } from "./Scouting";
import type { ScoutingReport } from "./UserNegotiation";

export type ScoutingEstimate =
  | { kind: "exact"; value: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "unknown" };

type ReportQuality = {
  salarySpread: number;
  valueSpread: number;
  potentialSpreadMin: number;
  potentialSpreadMax: number;
  unknownChance: number;
};

const QUALITY: Record<number, ReportQuality> = {
  // El potencial se muestra con una incertidumbre mucho mayor en los ojeadores
  // de baja calidad. El intervalo se interpreta como ANCHO TOTAL, no como
  // distancia a cada lado del potencial real.
  0.5: { salarySpread: 0.30, valueSpread: 0.28, potentialSpreadMin: 10, potentialSpreadMax: 16, unknownChance: 0 },
  1:   { salarySpread: 0.25, valueSpread: 0.22, potentialSpreadMin: 9, potentialSpreadMax: 14, unknownChance: 0 },
  1.5: { salarySpread: 0.22, valueSpread: 0.19, potentialSpreadMin: 8, potentialSpreadMax: 12, unknownChance: 0 },
  2:   { salarySpread: 0.17, valueSpread: 0.15, potentialSpreadMin: 6, potentialSpreadMax: 10, unknownChance: 0 },
  2.5: { salarySpread: 0.14, valueSpread: 0.12, potentialSpreadMin: 5, potentialSpreadMax: 8, unknownChance: 0 },
  3:   { salarySpread: 0.11, valueSpread: 0.09, potentialSpreadMin: 4, potentialSpreadMax: 7, unknownChance: 0 },
  3.5: { salarySpread: 0.085, valueSpread: 0.07, potentialSpreadMin: 3, potentialSpreadMax: 5, unknownChance: 0 },
  4:   { salarySpread: 0.065, valueSpread: 0.055, potentialSpreadMin: 2, potentialSpreadMax: 4, unknownChance: 0 },
  4.5: { salarySpread: 0.045, valueSpread: 0.035, potentialSpreadMin: 1, potentialSpreadMax: 2, unknownChance: 0 },
  5:   { salarySpread: 0, valueSpread: 0, potentialSpreadMin: 0, potentialSpreadMax: 0, unknownChance: 0 },
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: string): number {
  let value = hashString(seed) || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 1_000_000) / 1_000_000;
}

function seededInt(seed: string, min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(min + seededUnit(seed) * (max - min + 1));
}

export function isScoutingFieldDetected(entry: ScoutingEntry, field: ScoutField): boolean {
  if (Array.isArray(entry.detectedFields) && entry.detectedFields.includes(field)) return true;
  if (Array.isArray(entry.detectedFields) && entry.detectedFields.length > 0) return false;
  return scoutFieldIsDetected(entry.scoutRating, field, `${entry.playerId}:${entry.startedAt}:${entry.scoutId}`);
}

export function estimateScoutingMoney(
  value: number,
  entry: ScoutingEntry,
  field: string,
): ScoutingEstimate {
  const quality = QUALITY[entry.scoutRating] ?? QUALITY[0.5];
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;

  // Un ojeador de 5★ no estima: entrega el dato exacto y nunca devuelve
  // intervalos ni "No encontrado".
  if (entry.scoutRating === 5 || (quality.salarySpread === 0 && quality.valueSpread === 0)) {
    return { kind: "exact", value: safeValue };
  }

  if (seededUnit(`${entry.playerId}:${entry.startedAt}:${field}:unknown`) < quality.unknownChance * 0.9) {
    return { kind: "unknown" };
  }

  const salaryField = field === "salary" || field === "wage-demand";
  const spread = salaryField ? quality.salarySpread : quality.valueSpread;
  if (spread <= 0.03) {
    const rounded = Math.round(safeValue / 50_000) * 50_000;
    if (seededUnit(`${entry.playerId}:${entry.startedAt}:${field}:exact`) > 0.18) {
      return { kind: "exact", value: rounded };
    }
  }

  // El dato real ya no queda en el centro por diseño. Primero elegimos el
  // ancho total del intervalo y después una posición aleatoria del dato real
  // dentro de ese intervalo. Así un informe puede dar, por ejemplo, 105–205
  // cuando el valor real es 200, en vez de obligarlo a quedar cerca del centro.
  const widthFactor = Math.max(0.03, spread * (1.6 + seededUnit(`${entry.playerId}:${entry.startedAt}:${field}:width`) * 0.8));
  const actualPosition = 0.08 + seededUnit(`${entry.playerId}:${entry.startedAt}:${field}:position`) * 0.84;
  const lowFactor = Math.max(0.02, 1 - widthFactor * actualPosition);
  const highFactor = 1 + widthFactor * (1 - actualPosition);
  const unit = value >= 10_000_000 ? 100_000 : 50_000;
  const min = Math.max(0, Math.round((value * lowFactor) / unit) * unit);
  const max = Math.max(min + unit, Math.round((value * highFactor) / unit) * unit);

  return { kind: "range", min, max };
}

export function estimateScoutingPotential(
  actualPotential: number,
  entry: ScoutingEntry,
  minimumOverall = actualPotential,
): ScoutingEstimate {
  const safeActualPotential = Number.isFinite(actualPotential)
    ? Math.max(1, Math.round(actualPotential))
    : Math.max(1, Math.round(minimumOverall));
  const safeOvr = Number.isFinite(minimumOverall)
    ? Math.max(1, Math.round(minimumOverall))
    : safeActualPotential;
  const quality = QUALITY[entry.scoutRating] ?? QUALITY[0.5];

  if (entry.scoutRating === 5 || (quality.potentialSpreadMin === 0 && quality.potentialSpreadMax === 0)) {
    return { kind: "exact", value: safeActualPotential };
  }

  if (seededUnit(`${entry.playerId}:${entry.startedAt}:potential:unknown`) < quality.unknownChance) {
    return { kind: "unknown" };
  }

  const requestedSpan = seededInt(
    `${entry.playerId}:${entry.startedAt}:potential:span`,
    quality.potentialSpreadMin,
    quality.potentialSpreadMax,
  );

  // El intervalo debe contener al potencial real, pero el potencial real NO
  // debe quedar en el centro de forma sistemática. Elegimos aleatoriamente
  // cuánto espacio queda a la izquierda y a la derecha, respetando que el
  // extremo inferior nunca baje del OVR y el superior no pase de 99.
  const lowerRoom = Math.max(0, safeActualPotential - safeOvr);
  const upperRoom = Math.max(0, 99 - safeActualPotential);
  const feasibleSpan = Math.min(requestedSpan, lowerRoom + upperRoom);

  if (feasibleSpan <= 0) {
    return { kind: "range", min: safeOvr, max: safeActualPotential };
  }

  const minLeftPad = Math.max(0, feasibleSpan - upperRoom);
  const maxLeftPad = Math.min(feasibleSpan, lowerRoom);
  const leftPad = seededInt(
    `${entry.playerId}:${entry.startedAt}:potential:left-pad`,
    minLeftPad,
    maxLeftPad,
  );
  const rightPad = feasibleSpan - leftPad;

  const min = Math.max(safeOvr, safeActualPotential - leftPad);
  const max = Math.min(99, safeActualPotential + rightPad);

  return { kind: "range", min, max };
}

export function formatScoutingEstimate(
  value: number,
  entry: ScoutingEntry,
  field: string,
  formatMoney: (amount: number) => string,
): string {
  const estimate = estimateScoutingMoney(value, entry, field);
  if (estimate.kind === "unknown") return "No encontrado";
  if (estimate.kind === "exact") return formatMoney(estimate.value);
  return `${formatMoney(estimate.min)} – ${formatMoney(estimate.max)}`;
}

export function scoutingNegotiationDisplay(
  report: ScoutingReport,
  entry: ScoutingEntry,
  formatMoney: (amount: number) => string,
) {
  const minimum = estimateScoutingMoney(report.valuation.minimumPrice, entry, "club-minimum");
  const ideal = estimateScoutingMoney(report.valuation.idealPrice, entry, "club-ideal");
  const clubRange = minimum.kind === "unknown" || ideal.kind === "unknown"
    ? "No encontrado"
    : formatMoney(minimum.kind === "range" ? minimum.min : minimum.value) +
      " – " +
      formatMoney(ideal.kind === "range" ? ideal.max : ideal.value);

  const marketDetected = isScoutingFieldDetected(entry, "marketValue");
  const askingDetected = isScoutingFieldDetected(entry, "askingPrice");

  return {
    marketValue: marketDetected ? formatScoutingEstimate(report.valuation.marketValue, entry, "value", formatMoney) : "—",
    askingPrice: askingDetected ? formatScoutingEstimate(report.askingPrice, entry, "asking", formatMoney) : "—",
    clubRange,
    maximumPrice: askingDetected
      ? formatScoutingEstimate(report.valuation.maximumPrice, entry, "maximum-price", formatMoney)
      : "—",
    contractYearsLeft: `${report.contractYearsLeft} temporada(s)`,
    competition: report.competition > 0 ? `${report.competition} club(es)` : "Sin rivales",
  };
}

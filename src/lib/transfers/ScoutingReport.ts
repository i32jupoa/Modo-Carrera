import type { ScoutingEntry } from "./Scouting";
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
  0.5: { salarySpread: 0.30, valueSpread: 0.28, potentialSpreadMin: 5, potentialSpreadMax: 9, unknownChance: 0.30 },
  1: { salarySpread: 0.24, valueSpread: 0.23, potentialSpreadMin: 5, potentialSpreadMax: 8, unknownChance: 0.22 },
  1.5: { salarySpread: 0.20, valueSpread: 0.19, potentialSpreadMin: 4, potentialSpreadMax: 7, unknownChance: 0.18 },
  2: { salarySpread: 0.17, valueSpread: 0.16, potentialSpreadMin: 4, potentialSpreadMax: 6, unknownChance: 0.14 },
  2.5: { salarySpread: 0.14, valueSpread: 0.13, potentialSpreadMin: 3, potentialSpreadMax: 6, unknownChance: 0.11 },
  3: { salarySpread: 0.11, valueSpread: 0.10, potentialSpreadMin: 3, potentialSpreadMax: 5, unknownChance: 0.08 },
  3.5: { salarySpread: 0.09, valueSpread: 0.08, potentialSpreadMin: 2, potentialSpreadMax: 4, unknownChance: 0.06 },
  4: { salarySpread: 0.07, valueSpread: 0.06, potentialSpreadMin: 2, potentialSpreadMax: 3, unknownChance: 0.04 },
  4.5: { salarySpread: 0.05, valueSpread: 0.045, potentialSpreadMin: 1, potentialSpreadMax: 2, unknownChance: 0.02 },
  5: { salarySpread: 0, valueSpread: 0, potentialSpreadMin: 0, potentialSpreadMax: 0, unknownChance: 0 },
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

  const spread = field === "salary" ? quality.salarySpread : quality.valueSpread;
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
): ScoutingEstimate {
  const safePotential = Number.isFinite(actualPotential) ? Math.max(1, Math.round(actualPotential)) : 1;
  const quality = QUALITY[entry.scoutRating] ?? QUALITY[0.5];

  // 5★: potencial exacto, siempre.
  if (entry.scoutRating === 5 || (quality.potentialSpreadMin === 0 && quality.potentialSpreadMax === 0)) {
    return { kind: "exact", value: safePotential };
  }

  if (seededUnit(`${entry.playerId}:${entry.startedAt}:potential:unknown`) < quality.unknownChance) {
    return { kind: "unknown" };
  }

  const potentialMin = Number.isFinite(quality.potentialSpreadMin)
    ? Math.max(0, Math.floor(quality.potentialSpreadMin))
    : 0;
  const potentialMax = Number.isFinite(quality.potentialSpreadMax)
    ? Math.max(potentialMin, Math.floor(quality.potentialSpreadMax))
    : potentialMin;
  const spread = seededInt(
    `${entry.playerId}:${entry.startedAt}:potential:spread`,
    potentialMin,
    potentialMax,
  );
  if (!Number.isFinite(spread) || spread <= 0) return { kind: "exact", value: safePotential };

  // Igual que con el dinero, el potencial real puede quedar en cualquier
  // punto razonable del intervalo, no necesariamente en el centro.
  const totalSpan = Math.max(1, spread * 2);
  const actualPosition = 0.1 + seededUnit(`${entry.playerId}:${entry.startedAt}:potential:position`) * 0.8;
  const lowPad = Math.round(totalSpan * actualPosition);
  const highPad = Math.max(1, totalSpan - lowPad);

  return {
    kind: "range",
    min: Math.max(1, safePotential - lowPad),
    max: Math.min(99, safePotential + highPad),
  };
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

  return {
    marketValue: formatScoutingEstimate(report.valuation.marketValue, entry, "value", formatMoney),
    askingPrice: formatScoutingEstimate(report.askingPrice, entry, "asking", formatMoney),
    clubRange,
    maximumPrice: formatScoutingEstimate(report.valuation.maximumPrice, entry, "maximum-price", formatMoney),
    contractYearsLeft: `${report.contractYearsLeft} temporada(s)`,
    competition: report.competition > 0 ? `${report.competition} club(es)` : "Sin rivales",
  };
}

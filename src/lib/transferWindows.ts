/** Transfer windows + date helpers (local calendar, no UTC drift). */

export const GAME_START_DATE = "2025-07-01";

export const TRANSFER_WINDOWS = {
  summer: {
    id: "summer",
    label: "Ventana de verano",
    /** 1 Jul — 1 Sep (inclusive) */
    startMonth: 6,
    startDay: 1,
    endMonth: 8,
    endDay: 1,
  },
  winter: {
    id: "winter",
    label: "Ventana de invierno",
    /** 1 Ene — 31 Ene (inclusive) */
    startMonth: 0,
    startDay: 1,
    endMonth: 0,
    endDay: 31,
  },
} as const;

export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysToIso(iso: string, days: number): string {
  const d = parseDateOnly(iso);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

export function sameDateOnly(a: string, b: string): boolean {
  return a === b;
}

function dayIndex(d: Date): number {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}

function isInRange(
  d: Date,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
): boolean {
  const y = d.getFullYear();
  const start = new Date(y, startMonth, startDay);
  const end = new Date(y, endMonth, endDay);
  const t = dayIndex(d);
  return t >= dayIndex(start) && t <= dayIndex(end);
}

export function isSummerTransferWindow(d: Date): boolean {
  const w = TRANSFER_WINDOWS.summer;
  return isInRange(d, w.startMonth, w.startDay, w.endMonth, w.endDay);
}

export function isWinterTransferWindow(d: Date): boolean {
  const w = TRANSFER_WINDOWS.winter;
  return isInRange(d, w.startMonth, w.startDay, w.endMonth, w.endDay);
}

export function isMarketOpenForDate(d: Date): boolean {
  return isSummerTransferWindow(d) || isWinterTransferWindow(d);
}

export function isMarketOpenForIso(iso: string): boolean {
  return isMarketOpenForDate(parseDateOnly(iso));
}

export function activeTransferWindowLabel(d: Date): string | null {
  if (isSummerTransferWindow(d)) return TRANSFER_WINDOWS.summer.label;
  if (isWinterTransferWindow(d)) return TRANSFER_WINDOWS.winter.label;
  return null;
}

export function formatGameDate(iso: string): string {
  return parseDateOnly(iso).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Identificador estable de la ventana de mercado (año + tipo) para una fecha
 * ISO dada. Se usa para llevar la cuenta de cosas por ventana (cupos,
 * límites entre dos clubes...) sin depender de la simulación diaria.
 */
export function transferWindowKey(iso: string): string {
  const d = parseDateOnly(iso);
  const year = d.getFullYear();
  if (isSummerTransferWindow(d)) return `${year}:summer`;
  if (isWinterTransferWindow(d)) return `${year}:winter`;
  return `${year}:closed`;
}

/** True if `day` falls inside the transfer window that contains `current` (same year). */
export function isTransferWindowDay(day: Date, current: Date): boolean {
  if (isSummerTransferWindow(current)) return isSummerTransferWindow(day);
  if (isWinterTransferWindow(current)) return isWinterTransferWindow(day);
  return false;
}

/** Límites (inicio/fin) de la ventana de mercado que contiene `d`, o null si está cerrado. */
function windowBounds(d: Date): { start: Date; end: Date } | null {
  const y = d.getFullYear();
  if (isSummerTransferWindow(d)) {
    const w = TRANSFER_WINDOWS.summer;
    return { start: new Date(y, w.startMonth, w.startDay), end: new Date(y, w.endMonth, w.endDay) };
  }
  if (isWinterTransferWindow(d)) {
    const w = TRANSFER_WINDOWS.winter;
    return { start: new Date(y, w.startMonth, w.startDay), end: new Date(y, w.endMonth, w.endDay) };
  }
  return null;
}

/**
 * Día dentro de la ventana de mercado vigente (1 = primer día). 0 si el
 * mercado está cerrado en esa fecha. Se usa para repartir la actividad de
 * la IA a lo largo de toda la ventana en vez de amontonarla al principio
 * (ver `transfers/MarketPacing.ts`).
 */
export function daysIntoTransferWindow(iso: string): number {
  const d = parseDateOnly(iso);
  const bounds = windowBounds(d);
  if (!bounds) return 0;
  return Math.round((d.getTime() - bounds.start.getTime()) / 86_400_000) + 1;
}

/** Duración total (en días) de la ventana de mercado vigente en `iso`, o 0 si está cerrado. */
export function transferWindowLengthDays(iso: string): number {
  const d = parseDateOnly(iso);
  const bounds = windowBounds(d);
  if (!bounds) return 0;
  return Math.round((bounds.end.getTime() - bounds.start.getTime()) / 86_400_000) + 1;
}

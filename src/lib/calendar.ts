import { Fixture } from "@/lib/season";
import { getCupFixtureDateIso, getEuropeanFixtureDateIso } from "@/lib/fixtureDates";

/** Season starts Saturday August 15, 2026. */
export const SEASON_START = new Date("2026-08-15T12:00:00Z");

/** League matchdays = weekly Saturdays. Cup midweek (Wed = -3d), UCL group/KO midweek (Tue = -4d). */
export function fixtureDate(f: Fixture): Date {
  // Persisted fixture dates are canonical for league matches; UEFA/cup dates
  // are resolved through their fixed competition calendars so legacy +/-1 day
  // values cannot leak into any generic calendar consumer.
  if (f.competition === "cup") {
    const iso = getCupFixtureDateIso(f);
    if (iso) return new Date(`${iso}T12:00:00Z`);
  }
  if (f.competition === "ucl") {
    const competition = f.europeanCompetition ?? "ucl";
    const iso = getEuropeanFixtureDateIso(f, competition);
    if (iso) return new Date(`${iso}T12:00:00Z`);
  }
  if (f.date) return new Date(`${String(f.date).slice(0, 10)}T12:00:00Z`);

  const weekOffset = (f.matchday - 1) * 7;
  const t = SEASON_START.getTime() + weekOffset * 86400000;
  return new Date(t);
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", weekday: "short" });
}

export function fmtMonth(d: Date): string {
  const m = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function monthDays(year: number, month: number): Date[] {
  const out: Date[] = [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // start from Monday before/on the first
  const startWeekday = (first.getDay() + 6) % 7; // 0 = Mon
  const start = new Date(first);
  start.setDate(first.getDate() - startWeekday);
  // build a full grid (42 cells, 6 rows)
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
    if (i >= 34 && d > last) break;
  }
  return out;
}

export const COMP_COLORS = {
  league: { bg: "bg-primary/20", border: "border-primary/40", text: "text-primary", label: "Liga" },
  cup: { bg: "bg-accent/20", border: "border-accent/40", text: "text-accent", label: "Copa" },
  ucl: {
    bg: "bg-purple-500/20",
    border: "border-purple-500/40",
    text: "text-purple-300",
    label: "UCL",
  },
} as const;

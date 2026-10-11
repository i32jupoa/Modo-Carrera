/**
 * Instrumentación opt-in para diagnosticar el salto de calendario.
 * Activación desde DevTools: localStorage.setItem("fcsim:profile-calendar-jump", "1").
 * Desactivación: localStorage.removeItem("fcsim:profile-calendar-jump").
 */

type CalendarJumpProfile = {
  startedAt: number;
  fromDate: string;
  targetDate: string;
  phasesMs: Record<string, number>;
  phaseCalls: Record<string, number>;
  counters: Record<string, number>;
};

const PROFILE_KEY = "fcsim:profile-calendar-jump";
let activeProfile: CalendarJumpProfile | null = null;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function profilingEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(PROFILE_KEY) === "1";
  } catch {
    return false;
  }
}

export function startCalendarJumpProfile(fromDate: string, targetDate: string): boolean {
  if (!profilingEnabled()) {
    activeProfile = null;
    return false;
  }
  activeProfile = {
    startedAt: now(),
    fromDate,
    targetDate,
    phasesMs: {},
    phaseCalls: {},
    counters: {},
  };
  console.info(`[CalendarJumpProfiler] Perfil activo: ${fromDate} → ${targetDate}`);
  return true;
}

export function isCalendarJumpProfileActive(): boolean {
  return activeProfile !== null;
}

export function recordCalendarJumpCounter(name: string, amount = 1): void {
  if (!activeProfile) return;
  activeProfile.counters[name] = (activeProfile.counters[name] ?? 0) + amount;
}

export function recordCalendarJumpDuration(name: string, durationMs: number): void {
  if (!activeProfile || !Number.isFinite(durationMs)) return;
  activeProfile.phasesMs[name] = (activeProfile.phasesMs[name] ?? 0) + Math.max(0, durationMs);
  activeProfile.phaseCalls[name] = (activeProfile.phaseCalls[name] ?? 0) + 1;
}

export function measureCalendarJumpPhase<T>(name: string, operation: () => T): T {
  if (!activeProfile) return operation();
  const startedAt = now();
  try {
    const result = operation();
    if (result && typeof (result as any).then === "function") {
      return (result as any).finally(() => recordCalendarJumpDuration(name, now() - startedAt));
    }
    recordCalendarJumpDuration(name, now() - startedAt);
    return result;
  } catch (error) {
    recordCalendarJumpDuration(name, now() - startedAt);
    throw error;
  }
}

export function finishCalendarJumpProfile(finalDate: string, outcome: "ok" | "error"): void {
  if (!activeProfile) return;
  const profile = activeProfile;
  activeProfile = null;
  const totalMs = now() - profile.startedAt;
  const elapsedDays = Math.max(
    0,
    Math.round(
      (Date.parse(`${finalDate}T00:00:00Z`) - Date.parse(`${profile.fromDate}T00:00:00Z`)) / 86_400_000,
    ),
  );
  const phases = Object.entries(profile.phasesMs)
    .map(([phase, total]) => ({
      fase: phase,
      llamadas: profile.phaseCalls[phase] ?? 0,
      total_ms: Number(total.toFixed(2)),
      media_ms: Number((total / Math.max(1, profile.phaseCalls[phase] ?? 1)).toFixed(2)),
    }))
    .sort((a, b) => b.total_ms - a.total_ms);
  const calls = Object.entries(profile.counters)
    .map(([counter, total]) => ({ contador: counter, total }))
    .sort((a, b) => b.total - a.total);

  console.groupCollapsed(
    `[CalendarJumpProfiler] ${outcome.toUpperCase()} · ${elapsedDays} días · ${(totalMs / 1000).toFixed(2)} s · ${(totalMs / Math.max(1, elapsedDays)).toFixed(1)} ms/día`,
  );
  console.table(phases);
  console.table(calls);
  console.info({
    desde: profile.fromDate,
    objetivo: profile.targetDate,
    fechaFinal: finalDate,
    díasAvanzados: elapsedDays,
    tiempoTotalMs: Number(totalMs.toFixed(2)),
    tiempoMedioPorDíaMs: Number((totalMs / Math.max(1, elapsedDays)).toFixed(2)),
    resultado: outcome,
  });
  console.groupEnd();
}

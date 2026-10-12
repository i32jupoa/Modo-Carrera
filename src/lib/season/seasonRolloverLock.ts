/** Shared synchronous guard between the season transaction and the market clock. */
let rolloverDepth = 0;
const listeners = new Set<(inProgress: boolean) => void>();
const marketTasks = new Set<Promise<unknown>>();

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener(isSeasonRolloverInProgress());
    } catch (error) {
      console.error("[season-rollover] No se pudo notificar el estado del reloj de mercado:", error);
    }
  }
}

export function isSeasonRolloverInProgress(): boolean {
  return rolloverDepth > 0;
}

export function subscribeSeasonRollover(listener: (inProgress: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function beginSeasonRollover(): void {
  const wasActive = rolloverDepth > 0;
  rolloverDepth += 1;
  if (!wasActive) notifyListeners();
}

export function endSeasonRollover(): void {
  if (rolloverDepth === 0) return;
  rolloverDepth -= 1;
  if (rolloverDepth === 0) notifyListeners();
}

/** Track async market work that could otherwise persist over a rollover checkpoint/rollback. */
export function trackMarketBackgroundTask<T>(task: Promise<T>): Promise<T> {
  let tracked: Promise<T>;
  tracked = task.finally(() => marketTasks.delete(tracked));
  marketTasks.add(tracked);
  return tracked;
}

export async function waitForMarketBackgroundTasks(): Promise<void> {
  while (marketTasks.size > 0) {
    await Promise.allSettled(Array.from(marketTasks));
  }
}

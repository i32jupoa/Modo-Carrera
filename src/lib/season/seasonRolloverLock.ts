/** Shared guard for the season transaction and the market clock. */
let seasonRolloverInProgress = false;
const pendingMarketBackgroundTasks = new Set<Promise<unknown>>();
const rolloverListeners = new Set<(inProgress: boolean) => void>();

function notifyRolloverListeners(): void {
  for (const listener of rolloverListeners) {
    try {
      listener(seasonRolloverInProgress);
    } catch (error) {
      console.error("[season-rollover] Error notificando al reloj del mercado:", error);
    }
  }
}

export function subscribeSeasonRollover(listener: (inProgress: boolean) => void): () => void {
  rolloverListeners.add(listener);
  return () => {
    rolloverListeners.delete(listener);
  };
}

export function beginSeasonRollover(): void {
  seasonRolloverInProgress = true;
  notifyRolloverListeners();
}

export function endSeasonRollover(): void {
  seasonRolloverInProgress = false;
  notifyRolloverListeners();
}

export function isSeasonRolloverInProgress(): boolean {
  return seasonRolloverInProgress;
}

/** Register async market work so the rollover checkpoint can drain in-flight ticks. */
export function trackMarketBackgroundTask<T>(task: Promise<T>): Promise<T> {
  let tracked: Promise<T>;
  tracked = task.finally(() => pendingMarketBackgroundTasks.delete(tracked));
  pendingMarketBackgroundTasks.add(tracked);
  return tracked;
}

export async function waitForMarketBackgroundTasks(): Promise<void> {
  while (pendingMarketBackgroundTasks.size > 0) {
    await Promise.allSettled(Array.from(pendingMarketBackgroundTasks));
  }
}

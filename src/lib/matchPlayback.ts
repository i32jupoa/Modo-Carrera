import type { MatchEvent, CardEvent, HighlightEvent } from "@/lib/simulation";

// Playback speed: 16x slower than the original pace (2x slower than before).
export const MATCH_TICK_MS = 800;
export const MATCH_START_DELAY_MS = 4000;
export const EXTRA_TIME_TICK_MS = 1600;

const KEY = "mc:match-snapshot";

export type MatchSnapshot = {
  fixtureId: string;
  minute: number;
  feed: MatchEvent[];
  cardFeed: CardEvent[];
  highlightFeed: HighlightEvent[];
};

export function saveMatchSnapshot(snap: MatchSnapshot) {
  try { sessionStorage.setItem(KEY, JSON.stringify(snap)); } catch {}
}

export function loadMatchSnapshot(fixtureId: string): MatchSnapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as MatchSnapshot;
    return snap.fixtureId === fixtureId ? snap : null;
  } catch { return null; }
}

export function clearMatchSnapshot() {
  try { sessionStorage.removeItem(KEY); } catch {}
}

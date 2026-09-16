import { create } from "zustand";
import type { UserDealEventKind } from "@/lib/transfers/UserNegotiation";

export type NotificationKind = UserDealEventKind;

export interface MarketNotification {
  id: string;
  /** Identificador estable de la negociación que originó el evento. */
  dealId?: string;
  kind: NotificationKind;
  text: string;
  date: string;
  read: boolean;
}

interface NotificationsState {
  items: MarketNotification[];
  /** Notificaciones sin leer agrupadas por tono. */
  counts: Record<NotificationKind, number>;
  add: (events: Array<{ dealId?: string; kind: NotificationKind; text: string }>, date: string) => void;
  markAllRead: () => void;
  clear: () => void;
  hydrate: (saveId: string | null) => void;
}

const MAX_ITEMS = 60;
const STORAGE_PREFIX = "fcsim:market-notifications:v1";

let currentSaveId: string | null = null;

function emptyCounts(): Record<NotificationKind, number> {
  return { good: 0, info: 0, bad: 0 };
}

function countUnread(items: MarketNotification[]): Record<NotificationKind, number> {
  const counts = emptyCounts();
  for (const item of items) if (!item.read) counts[item.kind] += 1;
  return counts;
}

function persist(items: MarketNotification[]): void {
  if (typeof window === "undefined" || !currentSaveId) return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}:${currentSaveId}`, JSON.stringify(items));
  } catch {
    /* almacenamiento lleno o no disponible: las notificaciones son efímeras */
  }
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  counts: emptyCounts(),

  add: (events, date) => {
    if (events.length === 0) return;

    const existing = get().items;
    const fresh: MarketNotification[] = [];
    for (const [index, event] of events.entries()) {
      // Un mismo éxito de una negociación no debe volver a crear un punto
      // verde cada día. El dealId identifica de forma estable la operación;
      // para eventos antiguos sin dealId mantenemos el comportamiento previo.
      if (event.dealId) {
        const duplicate = existing.some(
          (item) => item.dealId === event.dealId && item.kind === event.kind && item.text === event.text,
        );
        if (duplicate || fresh.some(
          (item) => item.dealId === event.dealId && item.kind === event.kind && item.text === event.text,
        )) continue;
      }

      fresh.push({
        id: event.dealId
          ? `deal-${event.dealId}-${event.kind}-${event.text}`
          : `${date}-${Date.now().toString(36)}-${index}`,
        dealId: event.dealId,
        kind: event.kind,
        text: event.text,
        date,
        read: false,
      });
    }

    if (fresh.length === 0) return;
    const items = [...fresh, ...existing].slice(0, MAX_ITEMS);
    persist(items);
    set({ items, counts: countUnread(items) });
  },

  markAllRead: () => {
    const { items } = get();
    if (items.every((item) => item.read)) return;
    const read = items.map((item) => ({ ...item, read: true }));
    persist(read);
    set({ items: read, counts: emptyCounts() });
  },

  clear: () => {
    persist([]);
    set({ items: [], counts: emptyCounts() });
  },

  hydrate: (saveId) => {
    currentSaveId = saveId;
    if (typeof window === "undefined" || !saveId) {
      set({ items: [], counts: emptyCounts() });
      return;
    }
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${saveId}`);
      const items = raw ? (JSON.parse(raw) as MarketNotification[]) : [];
      set({ items, counts: countUnread(items) });
    } catch {
      set({ items: [], counts: emptyCounts() });
    }
  },
}));

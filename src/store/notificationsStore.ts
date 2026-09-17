import { create } from "zustand";
import { getUserDeal, type UserDealEventKind } from "@/lib/transfers/UserNegotiation";

export type NotificationKind = UserDealEventKind;

export interface MarketNotification {
  id: string;
  /** Identificador estable de la negociación que originó el evento. */
  dealId?: string;
  /** Sección donde debe consumirse esta novedad. */
  section?: MarketNotificationSection;
  kind: NotificationKind;
  text: string;
  date: string;
  read: boolean;
}

export type MarketNotificationSection = "deals" | "offers";

interface NotificationsState {
  items: MarketNotification[];
  /** Novedades sin leer separadas entre negociaciones y ofertas recibidas. */
  counts: Record<MarketNotificationSection, number>;
  add: (events: Array<{ dealId?: string; direction: "in" | "out"; kind: NotificationKind; text: string }>, date: string) => void;
  markSectionRead: (section: MarketNotificationSection) => void;
  refreshCounts: () => void;
  markAllRead: () => void;
  clear: () => void;
  hydrate: (saveId: string | null) => void;
}

const MAX_ITEMS = 60;
const STORAGE_PREFIX = "fcsim:market-notifications:v1";

let currentSaveId: string | null = null;

function emptyCounts(): Record<MarketNotificationSection, number> {
  return { deals: 0, offers: 0 };
}

function sectionForNotification(item: MarketNotification): MarketNotificationSection {
  if (item.section) return item.section;
  if (item.dealId) {
    const deal = getUserDeal(item.dealId);
    if (deal) return deal.direction === "out" ? "offers" : "deals";
  }
  // Compatibilidad con notificaciones antiguas que no puedan enlazarse con
  // una negociación ya cargada: las conservamos en la sección principal.
  return "deals";
}

function countUnread(items: MarketNotification[]): Record<MarketNotificationSection, number> {
  const counts = emptyCounts();
  for (const item of items) {
    if (!item.read) counts[sectionForNotification(item)] += 1;
  }
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
        // Un éxito es una sola novedad por negociación. Aunque avance el día
        // o el motor vuelva a emitir el mismo cierre con otro texto, nunca
        // debe multiplicar el punto verde.
        const duplicate = existing.some(
          (item) => item.dealId === event.dealId && item.kind === event.kind &&
            (event.kind === "good" || item.text === event.text),
        );
        if (duplicate || fresh.some(
          (item) => item.dealId === event.dealId && item.kind === event.kind &&
            (event.kind === "good" || item.text === event.text),
        )) continue;
      }

      fresh.push({
        id: event.dealId
          ? `deal-${event.dealId}-${event.kind}-${event.text}`
          : `${date}-${Date.now().toString(36)}-${index}`,
        dealId: event.dealId,
        section: event.direction === "out" ? "offers" : "deals",
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

  markSectionRead: (section) => {
    const { items } = get();
    const read = items.map((item) =>
      sectionForNotification(item) === section ? { ...item, read: true } : item,
    );
    if (read.every((item, index) => item.read === items[index]?.read)) return;
    persist(read);
    set({ items: read, counts: countUnread(read) });
  },

  refreshCounts: () => {
    const { items } = get();
    const enriched = items.map((item) => {
      if (item.section || !item.dealId) return item;
      const deal = getUserDeal(item.dealId);
      if (!deal) return item;
      return { ...item, section: deal.direction === "out" ? "offers" : "deals" };
    });
    const changed = enriched.some((item, index) => item.section !== items[index]?.section);
    if (changed) persist(enriched);
    set({ items: enriched, counts: countUnread(enriched) });
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
      const parsed = raw ? (JSON.parse(raw) as MarketNotification[]) : [];
      const seenGood = new Set<string>();
      const items = parsed.filter((item) => {
        if (item.kind !== "good" || !item.dealId) return true;
        const key = item.dealId;
        if (seenGood.has(key)) return false;
        seenGood.add(key);
        return true;
      });
      if (items.length !== parsed.length) persist(items);
      set({ items, counts: countUnread(items) });
    } catch {
      set({ items: [], counts: emptyCounts() });
    }
  },
}));

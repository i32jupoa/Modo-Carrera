import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePlayersStore } from "@/store/playersStore";
import {
  useNotificationsStore,
  type MarketNotification,
  type MarketNotificationSection,
} from "@/store/notificationsStore";
import { NotificationCard } from "./NotificationCard";

const SECTION_ROUTE: Record<MarketNotificationSection, string> = {
  deals: "/transfers",
  offers: "/transfers",
  mailbox: "/mailbox",
};

/** Campana con la bandeja de notificaciones (escudos, jugadores y banderas). */
export function NotificationCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const myTeamId = usePlayersStore((s: { myTeamId?: string | null }) => s.myTeamId);
  const items = useNotificationsStore((s) => s.items);
  const counts = useNotificationsStore((s) => s.counts);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const markSectionRead = useNotificationsStore((s) => s.markSectionRead);
  const unread = counts.deals + counts.offers + counts.mailbox;

  const groups = useMemo(() => {
    const map = new Map<string, MarketNotification[]>();
    for (const it of items) {
      const key = it.date || "Sin fecha";
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [items]);

  if (!myTeamId) return null;

  const go = (item: MarketNotification) => {
    const section: MarketNotificationSection =
      item.section ?? (item.kind === "mailbox" ? "mailbox" : "deals");
    markSectionRead(section);
    setOpen(false);
    void navigate({ to: SECTION_ROUTE[section] as never });
  };

  return (
    <div className="fixed right-3 top-3 z-40">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-card/90 shadow-lg backdrop-blur transition hover:border-primary/60"
            aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.6rem] font-black text-primary-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(92vw,26rem)] p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h3 className="text-sm font-black">Notificaciones</h3>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-[0.65rem] font-bold text-primary disabled:text-muted-foreground"
            >
              Marcar todo como leído
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-3 space-y-3">
            {groups.length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                No tienes notificaciones. Aquí verás ofertas, fichajes y mensajes de tus jugadores.
              </p>
            )}
            {groups.map(([date, list]) => (
              <section key={date}>
                <div className="mb-1.5 px-1 text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
                  {date}
                </div>
                <div className="space-y-2">
                  {list.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => go(it)}
                      className="block w-full text-left transition hover:opacity-90"
                    >
                      <NotificationCard item={it} compact showUnread />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CalendarDays, Mail, ArrowRight, CheckCircle2, XCircle, BriefcaseBusiness } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { CountryFlag } from "@/components/CountryFlag";
import { faceUrl } from "@/lib/playerFaces";
import { usePlayersStore } from "@/store/playersStore";
import { teamById } from "@/data/teams";
import { useNotificationsStore, type MarketNotification } from "@/store/notificationsStore";

function dayLabel(date: string, today: string): string {
  if (date === today) return "Hoy";
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return "Ayer";
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
}

function categoryIcon(notification: MarketNotification) {
  if (notification.kind === "mailbox") return Mail;
  if (notification.kind === "good") return CheckCircle2;
  if (notification.kind === "bad") return XCircle;
  return Bell;
}

function Visual({ notification }: { notification: MarketNotification }) {
  const visual = notification.visual;
  const playerInfo = visual?.players?.[0];
  const player = playerInfo ? usePlayersStore.getState().getSimPlayer(playerInfo.id) : undefined;
  const teamIds = visual?.teamIds ?? [];
  const from = teamIds[0] ? teamById(teamIds[0]) : undefined;
  const to = teamIds[1] ? teamById(teamIds[1]) : undefined;
  const singleTeam = teamIds.length === 1 && !from ? teamById(teamIds[0]) : undefined;
  const country = visual?.countries?.[0];

  if (!playerInfo && !from && !to && !singleTeam && !country) return null;

  return (
    <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/35 p-1.5">
      {playerInfo && <PlayerFace name={playerInfo.name} image={faceUrl(playerInfo.id, player?.cardImage)} role={roleFromPosition(player?.positions?.[0] ?? "MID")} size={28} showRing={false} />}
      {country && <CountryFlag country={country} />}
      {from && <TeamBadge team={from} size={24} />}
      {from && to && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
      {to && <TeamBadge team={to} size={24} />}
      {!from && !to && singleTeam && <TeamBadge team={singleTeam} size={24} />}
      {!player && playerInfo && <BriefcaseBusiness className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
    </div>
  );
}

export function MarketNotificationInbox() {
  const navigate = useNavigate();
  const currentDate = usePlayersStore((state) => state.currentDate);
  const items = useNotificationsStore((state) => state.items);
  const markNotificationRead = useNotificationsStore((state) => state.markNotificationRead);
  const markAllRead = useNotificationsStore((state) => state.markAllRead);
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const groups = new Map<string, MarketNotification[]>();
    for (const notification of items.slice(0, 30)) {
      const group = groups.get(notification.date) ?? [];
      group.push(notification);
      groups.set(notification.date, group);
    }
    return Array.from(groups.entries());
  }, [items]);

  const unread = items.filter((item) => !item.read).length;

  const openNotification = (notification: MarketNotification) => {
    setOpen(false);
    markNotificationRead(notification.id);
    if (notification.section === "mailbox") navigate({ to: "/mailbox" });
    else navigate({ to: "/transfers", search: { q: "" } });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="relative inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-sm font-bold hover:border-primary/50" aria-label="Abrir bandeja de notificaciones">
          <Bell className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">Novedades</span>
          {unread > 0 && <span className="grid min-w-5 h-5 place-items-center rounded-full bg-yellow-400 px-1.5 text-[0.62rem] font-black text-black">{unread > 99 ? "99+" : unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(390px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border/60 p-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-black"><Bell className="h-4 w-4 text-primary" /> Bandeja</div>
            <div className="mt-0.5 text-[0.62rem] text-muted-foreground">Mercado y buzón, agrupados por día</div>
          </div>
          {unread > 0 && <button type="button" className="text-[0.62rem] font-bold text-primary hover:underline" onClick={markAllRead}>Marcar todo leído</button>}
        </div>
        <div className="max-h-[430px] overflow-y-auto p-2">
          {grouped.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              <CalendarDays className="mx-auto h-7 w-7 opacity-40" />
              <p className="mt-2 font-bold">No hay novedades todavía.</p>
            </div>
          ) : grouped.map(([date, notifications]) => (
            <div key={date} className="mb-3 last:mb-0">
              <div className="px-2 py-1 text-[0.57rem] font-black uppercase tracking-[0.16em] text-muted-foreground">{dayLabel(date, currentDate)}</div>
              <div className="space-y-1">
                {notifications.map((notification) => {
                  const Icon = categoryIcon(notification);
                  return (
                    <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={`w-full rounded-xl border p-2.5 text-left transition hover:border-primary/40 hover:bg-secondary/30 ${notification.read ? "border-border/50 bg-background/20" : "border-primary/20 bg-primary/5"}`}>
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${notification.read ? "bg-secondary/60 text-muted-foreground" : "bg-primary/10 text-primary"}`}><Icon className="h-3.5 w-3.5" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="min-w-0 flex-1 text-xs font-bold leading-snug">{notification.text}</p>
                            {!notification.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />}
                          </div>
                          <Visual notification={notification} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

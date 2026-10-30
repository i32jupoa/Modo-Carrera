import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Bell,
  CalendarDays,
  CheckCheck,
  FileText,
  UserRound,
} from "lucide-react";
import { loadSave, saveSaveWithRetry, type SaveGame } from "@/lib/store";
import { TeamBadge } from "@/components/TeamBadge";

export const Route = createFileRoute("/mailbox")({ component: SeasonInboxPage });

type SeasonNotification = NonNullable<SaveGame["seasonNotifications"]>[number];

const META: Record<SeasonNotification["type"], { label: string; icon: typeof Bell; tone: string }> = {
  contract_expired: { label: "Contrato", icon: FileText, tone: "text-amber-300 bg-amber-400/10 border-amber-400/25" },
  player_retired: { label: "Retirada", icon: UserRound, tone: "text-violet-300 bg-violet-400/10 border-violet-400/25" },
  promoted: { label: "Ascenso", icon: ArrowUpCircle, tone: "text-emerald-300 bg-emerald-400/10 border-emerald-400/25" },
  relegated: { label: "Descenso", icon: ArrowDownCircle, tone: "text-red-300 bg-red-400/10 border-red-400/25" },
  season_started: { label: "Nueva temporada", icon: CalendarDays, tone: "text-sky-300 bg-sky-400/10 border-sky-400/25" },
};

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function SeasonInboxPage() {
  const [save, setSave] = useState<SaveGame | null>(() => loadSave());
  const notifications = useMemo(
    () => [...(save?.seasonNotifications ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [save?.seasonNotifications],
  );
  const unread = notifications.filter((item) => !item.read).length;

  const persistNotifications = (nextNotifications: SeasonNotification[]) => {
    if (!save) return;
    const nextSave: SaveGame = { ...save, seasonNotifications: nextNotifications };
    if (!saveSaveWithRetry(nextSave)) return;
    setSave(nextSave);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("career-season-notifications-updated"));
  };

  const markAllRead = () => {
    if (unread === 0) return;
    persistNotifications((save?.seasonNotifications ?? []).map((item) => ({ ...item, read: true })));
  };

  const markOneRead = (id: string) => {
    const current = save?.seasonNotifications ?? [];
    if (!current.some((item) => item.id === id && !item.read)) return;
    persistNotifications(current.map((item) => item.id === id ? { ...item, read: true } : item));
  };

  if (!save) {
    return <div className="flex min-h-[70vh] items-center justify-center text-muted-foreground">No hay una partida cargada.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Bell className="h-5 w-5" /></div>
          <div>
            <p className="text-[0.6rem] font-black uppercase tracking-[0.2em] text-primary">Noticias de temporada</p>
            <h1 className="text-2xl font-black tracking-tight">Buzón</h1>
            <p className="mt-1 text-xs text-muted-foreground">Cierre de campaña, cambios de categoría, contratos y retiradas.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-right">
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">Sin leer</p>
            <p className="scoreline text-xl font-black">{unread}</p>
          </div>
          <button type="button" onClick={markAllRead} disabled={unread === 0} className="rounded-xl border border-primary/30 px-3 py-2 text-xs font-black text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40">
            <CheckCheck className="mr-1.5 inline h-3.5 w-3.5" />Marcar como leídas{unread > 0 ? ` (${unread})` : ""}
          </button>
        </div>
      </header>

      {notifications.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-border/60 bg-card/40 px-6 text-center text-muted-foreground">
          <Bell className="h-9 w-9 opacity-40" />
          <p className="mt-3 font-bold text-foreground">No hay comunicados todavía</p>
          <p className="mt-1 max-w-md text-xs">Aquí aparecerán las noticias importantes del club al cerrar o comenzar una temporada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((item) => {
            const meta = META[item.type];
            const Icon = meta.icon;
            return (
              <article key={item.id} className={`rounded-2xl border p-4 transition ${item.read ? "border-border/50 bg-card/35" : "border-primary/25 bg-card/70 shadow-sm"}`}>
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${meta.tone}`}><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.58rem] font-black uppercase tracking-wider text-muted-foreground">{item.season} · {meta.label}</span>
                      {!item.read && <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" title="Sin leer" />}
                    </div>
                    <p className="mt-1 text-sm font-semibold leading-relaxed">{item.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.62rem] text-muted-foreground">
                      <span>{formatDate(item.date)}</span>
                      {item.teamId && <><span>·</span><TeamBadge teamId={item.teamId} size={18} /></>}
                    </div>
                  </div>
                  {!item.read && <button type="button" onClick={() => markOneRead(item.id)} className="shrink-0 rounded-lg px-2 py-1 text-[0.6rem] font-bold text-primary hover:bg-primary/10">Leída</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Bell,
  CalendarDays,
  FileText,
  UserRound,
  Activity,
  Clock,
  HeartPulse,
  Trophy,
  ChevronRight,
  CheckCheck,
  Coins,
} from "lucide-react";
import { loadSave, saveSaveWithRetry, type SaveGame } from "@/lib/store";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";
import { LEAGUES, teamById } from "@/data/teams";
import type { Player } from "@/data/players";
import { usePlayersStore } from "@/store/playersStore";

export const Route = createFileRoute("/mailbox")({ component: SeasonInboxPage });

type SeasonNotification = NonNullable<SaveGame["seasonNotifications"]>[number];

type MessageMeta = {
  label: string;
  icon: typeof Bell;
  tone: string;
  accent: string;
  wash: string;
  kicker: string;
};

const META: Record<SeasonNotification["type"], MessageMeta> = {
  contract_expired: { label: "Contrato", icon: FileText, tone: "text-sky-300 bg-sky-400/10 border-sky-400/25", accent: "#38bdf8", wash: "from-sky-500/12 via-transparent to-transparent", kicker: "GESTIÓN DE PLANTILLA" },
  player_retired: { label: "Retirada", icon: UserRound, tone: "text-violet-300 bg-violet-400/10 border-violet-400/25", accent: "#a78bfa", wash: "from-violet-500/12 via-transparent to-transparent", kicker: "CARRERA DEL JUGADOR" },
  promoted: { label: "Ascenso", icon: ArrowUpCircle, tone: "text-lime-300 bg-lime-400/10 border-lime-400/25", accent: "#a3e635", wash: "from-lime-500/12 via-transparent to-transparent", kicker: "OBJETIVO CONSEGUIDO" },
  relegated: { label: "Descenso", icon: ArrowDownCircle, tone: "text-red-300 bg-red-400/10 border-red-400/25", accent: "#fb7185", wash: "from-rose-500/12 via-transparent to-transparent", kicker: "RESULTADO DE TEMPORADA" },
  season_started: { label: "Nueva temporada", icon: CalendarDays, tone: "text-indigo-300 bg-indigo-400/10 border-indigo-400/25", accent: "#818cf8", wash: "from-indigo-500/12 via-transparent to-transparent", kicker: "NUEVO CURSO" },
  player_injured: { label: "Lesión", icon: Activity, tone: "text-rose-300 bg-rose-400/10 border-rose-400/25", accent: "#fb7185", wash: "from-rose-500/12 via-transparent to-transparent", kicker: "PARTE MÉDICO" },
  player_recovered: { label: "Recuperación", icon: HeartPulse, tone: "text-teal-300 bg-teal-400/10 border-teal-400/25", accent: "#2dd4bf", wash: "from-teal-500/12 via-transparent to-transparent", kicker: "PARTE MÉDICO" },
  contract_one_year: { label: "Contrato: queda un año", icon: Clock, tone: "text-sky-300 bg-sky-400/10 border-sky-400/25", accent: "#38bdf8", wash: "from-sky-500/12 via-transparent to-transparent", kicker: "PLANIFICACIÓN · CONTRATOS" },
  contract_expiring_soon: { label: "Contrato: quedan tres meses", icon: Clock, tone: "text-sky-300 bg-sky-400/10 border-sky-400/25", accent: "#38bdf8", wash: "from-sky-500/12 via-transparent to-transparent", kicker: "ATENCIÓN · CONTRATOS" },
  player_of_round: { label: "Jugador de la jornada", icon: Trophy, tone: "text-amber-300 bg-amber-400/10 border-amber-400/25", accent: "#f59e0b", wash: "from-amber-500/12 via-transparent to-transparent", kicker: "MEJOR DE LA LIGA" },
  player_of_month: { label: "Jugador del mes", icon: Trophy, tone: "text-amber-300 bg-amber-400/10 border-amber-400/25", accent: "#f59e0b", wash: "from-amber-500/12 via-transparent to-transparent", kicker: "PREMIO MENSUAL" },
  player_of_european_round: { label: "Jugador de la jornada europea", icon: Trophy, tone: "text-amber-300 bg-amber-400/10 border-amber-400/25", accent: "#f59e0b", wash: "from-amber-500/12 via-transparent to-transparent", kicker: "COMPETICIONES UEFA" },
  release_clause_paid: { label: "Clausulazo", icon: Bell, tone: "text-fuchsia-300 bg-fuchsia-400/10 border-fuchsia-400/25", accent: "#e879f9", wash: "from-fuchsia-500/12 via-transparent to-transparent", kicker: "SALIDA POR CLÁUSULA" },
  financial_income: { label: "Ingreso del club", icon: Coins, tone: "text-emerald-300 bg-emerald-400/10 border-emerald-400/25", accent: "#34d399", wash: "from-emerald-500/12 via-transparent to-transparent", kicker: "INGRESOS Y PREMIOS" },
};

function formatEuro(amount: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function SeasonInboxPage() {
  const [save, setSave] = useState<SaveGame | null>(() => loadSave());
  const notifications = useMemo(
    () => [...(save?.seasonNotifications ?? [])]
      // Compatibilidad con partidas que ya guardaron avisos de hat-trick:
      // se ocultan también los mensajes antiguos al migrar el buzón.
      .filter((item) => !["player_hat_trick", "player_of_match"].includes(item.type as string))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [save?.seasonNotifications],
  );
  const unread = notifications.filter((item) => !item.read).length;

  const club = useMemo(() => {
    if (!save?.myTeamId) return null;
    try {
      return teamById(save.myTeamId, { teamLeagueOverrides: save.teamLeagueOverrides });
    } catch {
      return null;
    }
  }, [save?.myTeamId, save?.teamLeagueOverrides]);
  const clubLeagueName = club ? (LEAGUES[String(club.league)]?.name ?? String(club.league)) : "";
  const squadById = useMemo(() => {
    if (!save?.myTeamId) return new Map<string, Player>();
    try {
      const squad = usePlayersStore.getState().getSimSquad(save.myTeamId);
      return new Map<string, Player>(squad.map((player) => [String(player.id), player] as const));
    } catch {
      // El buzón debe seguir funcionando incluso durante la carga de la plantilla.
      return new Map<string, Player>();
    }
  }, [save?.myTeamId, save?.seasonNotifications]);

  const persistNotifications = (nextNotifications: SeasonNotification[]) => {
    if (!save) return;
    const nextSave: SaveGame = { ...save, seasonNotifications: nextNotifications };
    if (!saveSaveWithRetry(nextSave)) return;
    setSave(nextSave);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("career-season-notifications-updated"));
  };

  const markOneRead = (id: string) => {
    const current = save?.seasonNotifications ?? [];
    if (!current.some((item) => item.id === id && !item.read)) return;
    persistNotifications(current.map((item) => item.id === id ? { ...item, read: true } : item));
  };

  const markAllRead = () => {
    const current = save?.seasonNotifications ?? [];
    if (!current.some((item) => !item.read)) return;
    persistNotifications(current.map((item) => item.read ? item : { ...item, read: true }));
  };

  if (!save) {
    return <div className="flex min-h-[70vh] items-center justify-center text-muted-foreground">No hay una partida cargada.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <header className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-5 shadow-lg shadow-black/5 sm:flex sm:items-center sm:justify-between">
        <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex min-w-0 items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-inner"><Bell className="h-6 w-6" /></div>
          <div className="min-w-0">
            <p className="text-[0.6rem] font-black uppercase tracking-[0.22em] text-primary">Centro de comunicaciones</p>
            <h1 className="text-2xl font-black tracking-tight">Buzón</h1>
            <p className="mt-1 text-xs text-muted-foreground">Las novedades deportivas y de gestión de tu club, reunidas en un solo lugar.</p>
          </div>
        </div>
        <div className="relative mt-4 flex items-center gap-3 sm:mt-0">
          {club && <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/50 bg-background/50 px-3 py-2">
            <TeamLogo teamName={club.name} leagueName={clubLeagueName} size={30} />
            <div className="min-w-0"><p className="truncate text-xs font-black">{club.name}</p><p className="text-[0.58rem] text-muted-foreground">Tu club</p></div>
          </div>}
          <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-right">
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">Sin leer</p>
            <p className="scoreline text-xl font-black">{unread}</p>
          </div>
        </div>
      </header>

      {unread > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3.5 py-2.5 text-xs font-bold text-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CheckCheck className="h-4 w-4" />
            Marcar todo como leído
          </button>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-border/60 bg-card/40 px-6 text-center text-muted-foreground">
          <div className="grid h-16 w-16 place-items-center rounded-2xl border border-border/50 bg-background/60"><Bell className="h-7 w-7 opacity-50" /></div>
          <p className="mt-4 font-bold text-foreground">No hay comunicados todavía</p>
          <p className="mt-1 max-w-md text-xs">Aquí aparecerán las noticias del equipo, los premios deportivos y todos los ingresos del club que no procedan de fichajes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => {
            const meta = META[item.type];
            const Icon = meta.icon;
            const player = item.playerId ? squadById.get(String(item.playerId)) : undefined;
            const playerName = item.playerName ?? player?.name ?? "Jugador";
            const playerImage = item.playerId ? faceUrl(item.playerId, player?.cardImage) : undefined;
            const playerRole = roleFromPosition(player?.positions?.[0] ?? "MID");
            const hasPlayer = Boolean(item.playerId || item.playerName);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => markOneRead(item.id)}
                aria-label={`${item.read ? "Mensaje leído" : "Marcar como leído"}: ${item.message}`}
                className={`group relative w-full overflow-hidden rounded-2xl border text-left transition duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-xl hover:shadow-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${item.read ? "border-border/55 bg-card/50" : "border-primary/30 bg-card/85 shadow-md shadow-black/5"}`}
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${meta.wash}`} />
                <div className="relative flex items-stretch">
                  <div className="w-1 shrink-0" style={{ backgroundColor: meta.accent }} />
                  <div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${meta.tone}`}>
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[0.56rem] font-black uppercase tracking-[0.16em] text-muted-foreground">{meta.kicker}</span>
                          {!item.read && <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wide text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />No leído</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-black leading-tight sm:text-[0.95rem]">{hasPlayer ? playerName : meta.label}</h2>
                          <span className={`rounded-md border px-2 py-0.5 text-[0.55rem] font-bold ${meta.tone}`}>{item.category ?? meta.label}</span>
                          {Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 && (
                            <span className={`rounded-lg border px-2.5 py-1 text-xs font-black tabular-nums ${meta.tone}`}>+{formatEuro(Number(item.amount))}</span>
                          )}
                        </div>
                        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-[0.8rem]">{item.message}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.61rem] text-muted-foreground/80">
                          <span>{formatDate(item.date)}</span>
                          <span className="opacity-50">·</span>
                          <span>Temporada {item.season}</span>
                          {club && <><span className="opacity-50">·</span><span className="font-semibold">{club.name}</span></>}
                        </div>
                      </div>
                    </div>

                    {hasPlayer && (
                      <div className={`relative order-first flex h-[92px] w-[92px] shrink-0 items-center justify-center self-center rounded-2xl border border-white/10 bg-gradient-to-br from-background/90 via-secondary/45 to-background/75 shadow-inner sm:order-first sm:h-[104px] sm:w-[104px] ${item.read ? "opacity-80" : ""}`}>
                        <div className="pointer-events-none absolute inset-2 rounded-full blur-xl" style={{ backgroundColor: `${meta.accent}24` }} />
                        <PlayerFace name={playerName} image={playerImage} role={playerRole} size={82} showRing={false} className="relative z-10 border-2 border-white/15 bg-secondary shadow-xl" />
                      </div>
                    )}
                    <div className="hidden h-8 w-8 shrink-0 place-items-center rounded-full border border-border/50 bg-background/40 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground sm:grid">
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

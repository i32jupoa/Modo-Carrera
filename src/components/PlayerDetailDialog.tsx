import { useId, useMemo } from "react";
import {
  Activity,
  Banknote,
  CalendarDays,
  Cake,
  CircleDollarSign,
  Goal,
  Handshake,
  HeartHandshake,
  Medal,
  Shield,
  ShieldAlert,
  Sparkles,
  Star,
  Tag,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TeamLogo } from "@/components/TeamLogo";
import { MoodFace } from "@/components/MoodFace";
import { RoleBadge } from "@/components/RoleBadge";
import { PlayerFace, ROLE_TEXT, roleFromPosition } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";
import type { FcPlayer, PlayerStats } from "@/store/playersStore";
import { formatEuro, mapEaPosition, POS_LABEL_ES, marketValueEuros } from "@/store/playersStore";
import { getPlayer, getPlayerAnnualWage } from "@/lib/transfers";
import type { Team } from "@/data/teams";
import type { LeagueId } from "@/data/teams";
import { LEAGUES } from "@/data/teams";
import type { DynamicPlayerStats } from "@/types/playerStats";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line, ReferenceLine } from "recharts";

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function ovrTone(ovr: number): string {
  if (ovr >= 85) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (ovr >= 78) return "bg-primary/15 text-primary border-primary/40";
  if (ovr >= 70) return "bg-yellow-500/15 text-yellow-300 border-yellow-500/40";
  return "bg-muted text-muted-foreground border-border/40";
}



function formatBirthdate(birthdate?: string): string {
  if (!birthdate) return "No disponible";
  const match = birthdate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return birthdate;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

function formatMonthLabel(month: number, year: number): string {
  const label = new Intl.DateTimeFormat("es-ES", { month: "short" }).format(
    new Date(Date.UTC(year, Math.max(0, month - 1), 1)),
  );
  return `${label.replace(".", "")} ${String(year).slice(-2)}`;
}

function DetailMetric({
  icon: Icon,
  label,
  value,
  accent = "text-foreground",
  hint,
}: {
  icon: typeof Goal;
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/65 p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`mt-1.5 scoreline text-lg font-black leading-none ${accent}`}>{value}</p>
      {hint && <p className="mt-1 text-[0.55rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(99, Math.round(value)));
  const tone = v >= 85 ? "bg-emerald-400" : v >= 75 ? "bg-primary" : v >= 60 ? "bg-yellow-400" : "bg-muted-foreground";
  return (
    <div>
      <div className="flex items-center justify-between text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="scoreline text-foreground">{v}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div className={`h-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function SectionHeading({ icon: Icon, title, subtitle }: { icon: typeof Goal; title: string; subtitle?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-black">{title}</h3>
        </div>
        {subtitle && <p className="mt-1 text-[0.65rem] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function SeasonProgressChart({
  monthlyStats,
  baseOvr,
  currentOvr,
}: {
  monthlyStats?: DynamicPlayerStats["monthlyStats"];
  baseOvr: number;
  currentOvr: number;
}) {
  const chartId = useId().replace(/:/g, "");
  const points = useMemo(() => {
    const monthly = [...(monthlyStats ?? [])]
      .filter((entry) => Number.isFinite(Number(entry.ovr)))
      .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
      .map((entry) => ({
        key: `${entry.year}-${entry.month}`,
        label: formatMonthLabel(entry.month, entry.year),
        fullLabel: new Intl.DateTimeFormat("es-ES", {
          month: "long",
          year: "numeric",
        }).format(new Date(Date.UTC(entry.year, Math.max(0, entry.month - 1), 1))),
        ovr: Number(Number(entry.ovr).toFixed(2)),
        appearances: Number(entry.appearances ?? 0),
      }));

    const deduped: typeof monthly = [];
    for (const point of monthly) {
      if (deduped.length && deduped[deduped.length - 1].key === point.key) {
        deduped[deduped.length - 1] = point;
      } else {
        deduped.push(point);
      }
    }

    const startOvr = Number(baseOvr);
    const actualVisibleOvr = Math.round(currentOvr);
    const actualProgressionOvr = deduped[deduped.length - 1]?.ovr ?? actualVisibleOvr;
    const startPoint = {
      key: "career-start",
      label: "Inicio",
      fullLabel: "Media inicial",
      ovr: Number(startOvr.toFixed(2)),
      appearances: 0,
    };
    if (!deduped.length) {
      return [startPoint, { key: "current", label: "Ahora", fullLabel: "Evolución actual", ovr: Number(actualProgressionOvr.toFixed(2)), appearances: 0 }];
    }

    const withStart = deduped[0].ovr === startOvr ? deduped : [startPoint, ...deduped];
    const last = withStart[withStart.length - 1];
    if (!last || Math.abs(last.ovr - actualProgressionOvr) > 0.005) {
      withStart.push({ key: "current", label: "Ahora", fullLabel: "Evolución actual", ovr: Number(actualProgressionOvr.toFixed(2)), appearances: 0 });
    }
    return withStart;
  }, [monthlyStats, baseOvr, currentOvr]);

  const first = points[0]?.ovr ?? Number(baseOvr);
  const last = points[points.length - 1]?.ovr ?? Number(currentOvr);
  const peak = Math.max(...points.map((p) => p.ovr));
  const low = Math.min(...points.map((p) => p.ovr));
  const delta = last - first;
  const range = Math.max(0.6, peak - low);
  const padding = range <= 1.5 ? 0.45 : 0.3;
  const domainMin = Math.max(1, low - padding);
  const domainMax = Math.min(99, peak + padding);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload;
    if (!item) return null;
    const firstOvr = Math.round(baseOvr);
    const change = item.ovr - firstOvr;
    return (
      <div className="min-w-[180px] rounded-2xl border border-primary/20 bg-background/95 p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[0.5rem] font-black uppercase tracking-[0.18em] text-primary">Evolución</p>
            <p className="mt-1 text-xs font-bold capitalize text-foreground">{item.fullLabel}</p>
          </div>
          <div className="flex min-w-[72px] flex-col items-end rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-2 shadow-lg shadow-primary/10">
            <span className="text-[0.45rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Valor interno</span>
            <span className="mt-0.5 text-lg font-black text-primary">{Number(item.ovr).toFixed(2)}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-[0.62rem] font-bold">
          <span className="text-muted-foreground">Cambio desde el inicio</span>
          <span className={change > 0 ? "text-emerald-300" : change < 0 ? "text-destructive" : "text-muted-foreground"}>
            {change > 0 ? "+" : ""}{Number(change).toFixed(2)}
          </span>
        </div>
        {item.appearances > 0 && (
          <div className="mt-1 flex items-center justify-between text-[0.6rem] font-semibold text-muted-foreground">
            <span>Partidos registrados</span>
            <span className="text-foreground">{item.appearances}</span>
          </div>
        )}
      </div>
    );
  };

  const progressionTone = delta > 0
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : delta < 0
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-border/60 bg-muted/20 text-muted-foreground";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.12),transparent_32%),radial-gradient(circle_at_bottom_left,hsl(160_70%_50%/0.08),transparent_28%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--card)/0.72))] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

      <div className="border-b border-border/50 px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[0.55rem] font-black uppercase tracking-[0.2em] text-primary">
              <TrendingUp className="h-3.5 w-3.5" />
              Progreso del jugador
            </div>
            <h4 className="mt-3 text-lg font-black tracking-tight">Evolución de la media durante la temporada</h4>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              La media que ves en el juego siempre es entera; esta línea muestra los decimales internos para que se aprecie cada paso de la evolución.
            </p>
          </div>

          <div className={`inline-flex items-center gap-3 self-start rounded-2xl border px-3.5 py-2.5 lg:self-auto ${progressionTone}`}>
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-background/40">
              {delta > 0 ? <TrendingUp className="h-4 w-4" /> : delta < 0 ? <TrendingDown className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-[0.5rem] font-black uppercase tracking-wider text-muted-foreground">Cambio interno</p>
              <p className="mt-0.5 text-xl font-black scoreline">{delta > 0 ? "+" : ""}{Number(delta).toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-3">
            <p className="text-[0.5rem] font-black uppercase tracking-[0.16em] text-muted-foreground">Inicio</p>
            <p className="mt-1.5 text-2xl font-black scoreline">{Math.round(baseOvr)}</p>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 shadow-inner shadow-primary/5">
            <p className="text-[0.5rem] font-black uppercase tracking-[0.16em] text-primary">Actual</p>
            <p className="mt-1.5 text-2xl font-black scoreline text-primary">{Math.round(currentOvr)}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-background/25 p-3">
            <p className="text-[0.5rem] font-black uppercase tracking-[0.16em] text-muted-foreground">Mejor media</p>
            <p className="mt-1.5 text-2xl font-black scoreline">{Math.round(peak)}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-background/25 p-3">
            <p className="text-[0.5rem] font-black uppercase tracking-[0.16em] text-muted-foreground">Registros</p>
            <p className="mt-1.5 text-2xl font-black scoreline">{Math.max(0, points.length - 1)}</p>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-5">
        <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-b from-background/65 to-background/20 p-2 shadow-inner sm:p-3">
          <div className="pointer-events-none absolute inset-x-10 top-4 h-16 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 18, right: 18, left: -4, bottom: 18 }}>
                <defs>
                  <linearGradient id={`ovrLine-${chartId}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="55%" stopColor="hsl(187 86% 62%)" />
                    <stop offset="100%" stopColor="hsl(142 76% 46%)" />
                  </linearGradient>
                  <filter id={`ovrGlow-${chartId}`} x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <CartesianGrid strokeDasharray="2 7" className="stroke-border/25" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9, fontWeight: 700 }}
                  minTickGap={26}
                  dy={8}
                />
                <YAxis
                  domain={[domainMin, domainMax]}
                  allowDecimals={true}
                  tickFormatter={(value: number) => Number(value).toFixed(1)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9, fontWeight: 700 }}
                  width={28}
                  dx={-2}
                />
                <ReferenceLine y={Number(baseOvr)} stroke="hsl(var(--border))" strokeDasharray="5 5" strokeOpacity={0.45} />
                <Tooltip cursor={{ stroke: "hsl(var(--primary) / 0.18)", strokeWidth: 1.5 }} content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="ovr"
                  stroke={`url(#ovrLine-${chartId})`}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={({ cx, cy, index }: any) => {
                    const item = points[index];
                    const isCurrent = index === points.length - 1;
                    return (
                      <g key={`dot-${item?.key ?? index}`}>
                        <circle cx={cx} cy={cy} r={isCurrent ? 6.5 : 4} fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth={2} />
                        {isCurrent && <circle cx={cx} cy={cy} r={10} fill="none" stroke="hsl(var(--primary) / 0.16)" strokeWidth={2.5} />}
                      </g>
                    );
                  }}
                  activeDot={{ r: 6, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
                  isAnimationActive={false}
                  filter={`url(#ovrGlow-${chartId})`}
                />
              </LineChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute left-3 top-2 rounded-lg border border-border/50 bg-background/60 px-2 py-1 text-[0.48rem] font-black uppercase tracking-[0.14em] text-muted-foreground backdrop-blur-md">
              Inicio: {Math.round(baseOvr)}
            </div>
            <div className="pointer-events-none absolute right-3 top-2 rounded-lg border border-primary/25 bg-primary/10 px-2 py-1 text-[0.48rem] font-black uppercase tracking-[0.14em] text-primary backdrop-blur-md">
              OVR visible: {Math.round(currentOvr)} · Evolución: {Number(last).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-background/20 px-3 py-2.5">
            <p className="text-[0.5rem] font-black uppercase tracking-wider text-muted-foreground">Punto más bajo</p>
            <p className="mt-1 text-sm font-black scoreline">{low}</p>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
            <p className="text-[0.5rem] font-black uppercase tracking-wider text-primary">Lectura</p>
            <p className="mt-1 text-sm font-black">
              {Math.abs(delta) < 0.005 ? "Estable" : delta > 0 ? "Crecimiento" : "Regresión"}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-background/20 px-3 py-2.5">
            <p className="text-[0.5rem] font-black uppercase tracking-wider text-muted-foreground">Último registro</p>
            <p className="mt-1 text-sm font-black">{points[points.length - 1]?.label ?? "Actual"}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-background/15 px-3 py-2 text-[0.55rem] font-bold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.7)]" /> Evolución del OVR</span>
          <span>La línea usa la evolución decimal interna; el OVR mostrado en el resto del juego sigue siendo entero.</span>
        </div>
      </div>
    </section>
  );
}
function FormStrip({ values }: { values: number[] }) {
  const recent = values.slice(-10);
  if (!recent.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/55 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-muted-foreground">Forma reciente</p>
          <p className="mt-1 text-xs text-muted-foreground">Últimas valoraciones registradas</p>
        </div>
        <span className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">{recent.length} partidos</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {recent.map((rating, index) => (
          <span key={`${index}-${rating}`} className={`grid h-8 min-w-8 place-items-center rounded-lg border px-1.5 text-[0.65rem] font-black ${rating >= 8 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : rating >= 7 ? "border-primary/30 bg-primary/10 text-primary" : rating >= 6 ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {Number(rating).toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface PlayerDetailDialogProps {
  player: FcPlayer | null;
  team: Team | null;
  stats?: PlayerStats;
  open: boolean;
  onClose: () => void;
  /** true para Mi Plantilla; false para Centro de Clubes. */
  privateMode?: boolean;
  fixtures?: any[];
  myTeamId?: string | null;
  onRenew?: () => void;
  onToggleListed?: () => void;
  onListLoan?: () => void;
  isListed?: boolean;
  isMarketOpen?: boolean;
  /** Oculta el estado de ánimo en fichas públicas de Centro de Clubes. */
  showMorale?: boolean;
}

export function PlayerDetailDialog({
  player: selected,
  team,
  stats: selectedStats,
  open,
  onClose,
  privateMode = false,
  fixtures = [],
  myTeamId = null,
  onRenew,
  onToggleListed,
  onListLoan,
  isListed = false,
  isMarketOpen = false,
  showMorale = true,
}: PlayerDetailDialogProps) {
  if (!selected || !team) return null;

  const pos = mapEaPosition(selected.Position);
  const morale = selectedStats?.morale ?? 70;
  const injured = !!selectedStats?.injuredUntilDate || (selectedStats?.injuredUntil ?? 0) > 0;
  const marketPlayer = getPlayer(String(selected.ID));
  const marketContract = marketPlayer?.contract;
  const value = marketValueEuros(selected);
  const wage = marketContract?.wage ?? getPlayerAnnualWage(String(selected.ID));
  const dynamicOvr = Math.round(Number(selectedStats?.dynamicStats?.currentOVR ?? selected.OVR));
  const baseOvr = Math.round(Number(selectedStats?.dynamicStats?.baseOVR ?? selected.OVR));
  const potential = Math.round(Number(selectedStats?.dynamicStats?.potentialOVR ?? selected.potential ?? selected.OVR));
  const ovrDelta = dynamicOvr - baseOvr;
  const seasonAppearances = Number(selectedStats?.appearances ?? selectedStats?.dynamicStats?.seasonAppearances ?? 0);
  const seasonMinutes = Number(selectedStats?.dynamicStats?.seasonMinutes ?? 0);
  const seasonGoals = Number(selectedStats?.goals ?? selectedStats?.dynamicStats?.seasonGoals ?? 0);
  const seasonAssists = Number(selectedStats?.assists ?? selectedStats?.dynamicStats?.seasonAssists ?? 0);
  const seasonMVPs = Number(selectedStats?.dynamicStats?.seasonMVPs ?? selectedStats?.motm ?? 0);
  const seasonCleanSheets = Number(selectedStats?.dynamicStats?.seasonCleanSheets ?? selectedStats?.cleanSheets ?? 0);
  const seasonRating = Number(selectedStats?.dynamicStats?.seasonAverageRating ?? (selectedStats?.formHistory?.length ? selectedStats.formHistory.reduce((sum, value) => sum + value, 0) / selectedStats.formHistory.length : 0));
  const seasonTrophies = Number(selectedStats?.dynamicStats?.seasonTrophies ?? 0);
  const currentForm = selectedStats?.formHistory?.length ? selectedStats.formHistory[selectedStats.formHistory.length - 1] : 0;
  const dynamicAttributes = selectedStats?.dynamicStats?.attributes;
  const progressionReason = selectedStats?.dynamicStats?.lastProgressionReason;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto overflow-x-hidden p-0">
        <div className={`relative overflow-hidden bg-gradient-to-br p-5 ${pos === "GK" ? "from-amber-500/30 to-amber-500/0 border-amber-500/40" : pos === "DEF" ? "from-sky-500/30 to-sky-500/0 border-sky-500/40" : pos === "MID" ? "from-emerald-500/30 to-emerald-500/0 border-emerald-500/40" : "from-rose-500/30 to-rose-500/0 border-rose-500/40"}`}>
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-background/10 blur-3xl" />
          <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full p-2 text-foreground/70 transition hover:bg-background/30 hover:text-foreground" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
          <DialogHeader className="relative">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex items-end gap-3">
                <div className="w-28 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-secondary/50 shadow-xl">
                  {faceUrl(String(selected.ID), selected.card) ? (
                    <img src={faceUrl(String(selected.ID), selected.card)} alt={selected.Name} className="h-36 w-full object-cover object-top" />
                  ) : (
                    <div className="grid h-36 place-items-center text-xs text-muted-foreground">Sin foto</div>
                  )}
                </div>
                <div className="mb-1 flex flex-col items-center gap-2">
                  <div className={`grid h-16 w-16 place-items-center rounded-2xl border scoreline text-2xl font-black shadow-lg ${ovrTone(dynamicOvr)}`}>{dynamicOvr}</div>
                  {privateMode && (
                    <div className="rounded-xl border border-border/50 bg-background/45 px-2.5 py-1.5 text-center backdrop-blur">
                      <p className="text-[0.48rem] font-black uppercase tracking-wider text-muted-foreground">POT</p>
                      <p className="scoreline text-sm font-black">{Math.round(potential)}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-2xl font-black tracking-tight">{selected.Name}</DialogTitle>
                  <span className={`rounded-full border px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider ${ROLE_TEXT[roleFromPosition(selected.Position)]}`}>{POS_LABEL_ES[pos]}</span>
                  {privateMode && isListed && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider text-amber-300">En venta</span>}
                </div>
                <DialogDescription className="mt-1 text-xs font-semibold uppercase tracking-wider">{selected.Position} · {selected.Age} años · {selected.Nation ?? "Nacionalidad no disponible"}</DialogDescription>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/35 px-2.5 py-2 backdrop-blur">
                    <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={30} className="rounded-md" />
                    <div><p className="text-[0.48rem] font-bold uppercase tracking-wider text-muted-foreground">Equipo</p><p className="text-xs font-black">{team.name}</p></div>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/35 px-2.5 py-2 text-xs font-bold backdrop-blur"><Cake className="h-3.5 w-3.5" />{formatBirthdate(selected.birthdate)}</div>
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          {privateMode && (
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <DetailMetric icon={Target} label="Valor" value={formatEuro(value)} accent="text-emerald-300" hint="Valor de mercado" />
              <DetailMetric icon={Banknote} label="Salario" value={`${formatEuro(wage)}/año`} accent="text-primary" />
              <DetailMetric icon={CalendarDays} label="Contrato" value={`${marketContract?.yearsLeft ?? 0} temp.`} />
              <DetailMetric icon={Shield} label="Cláusula" value={formatEuro(marketContract?.releaseClause ?? 0)} accent="text-amber-300" />
            </section>
          )}

          <section className="space-y-3">
            <SectionHeading icon={Medal} title="Rendimiento de temporada" subtitle="Impacto real en los partidos disputados" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <DetailMetric icon={Users} label="Partidos" value={String(seasonAppearances)} />
              <DetailMetric icon={Timer} label="Minutos" value={seasonMinutes.toLocaleString("es-ES")} />
              <DetailMetric icon={Star} label="Media" value={seasonRating > 0 ? seasonRating.toFixed(2) : "—"} accent="text-primary" />
              <DetailMetric icon={Goal} label="Goles" value={String(seasonGoals)} />
              <DetailMetric icon={Sparkles} label="Asistencias" value={String(seasonAssists)} />
              <DetailMetric icon={Trophy} label="Trofeos" value={String(seasonTrophies)} accent="text-amber-300" />
            </div>
            {pos === "GK" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <DetailMetric icon={Shield} label="Porterías a 0" value={String(seasonCleanSheets)} accent="text-emerald-300" hint="Esta temporada" />
                <DetailMetric icon={Star} label="MVP" value={String(seasonMVPs)} accent="text-amber-300" />
                <DetailMetric icon={Shield} label="Ratio" value={seasonAppearances > 0 ? `${((seasonCleanSheets / seasonAppearances) * 100).toFixed(0)}%` : "—"} hint="Partidos con portería a cero" />
              </div>
            )}
          </section>

          <section className="space-y-3">
            <SectionHeading icon={TrendingUp} title="Evolución del jugador" subtitle="Cómo ha cambiado su media durante la partida" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <DetailMetric icon={Shield} label="Media inicial" value={String(baseOvr)} />
              <DetailMetric icon={TrendingUp} label="Media actual" value={String(dynamicOvr)} accent={ovrDelta >= 0 ? "text-emerald-300" : "text-destructive"} hint={`${ovrDelta >= 0 ? "+" : ""}${ovrDelta} OVR`} />
              {privateMode && <DetailMetric icon={Medal} label="Potencial estimado" value={String(Math.round(potential))} hint="Proyección dinámica, no un techo." />}
              <DetailMetric icon={Star} label="Forma" value={currentForm > 0 ? Number(currentForm).toFixed(1) : "—"} accent="text-primary" />
            </div>
            {progressionReason && <p className="text-[0.65rem] text-muted-foreground">Última evolución: <span className="font-bold text-foreground">{progressionReason}</span></p>}
          </section>

          <SeasonProgressChart
            monthlyStats={selectedStats?.dynamicStats?.monthlyStats ?? []}
            baseOvr={baseOvr}
            currentOvr={dynamicOvr}
          />
          <FormStrip values={selectedStats?.formHistory ?? []} />

          {showMorale && (
            <section className="rounded-xl border border-border/60 bg-card/55 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-muted-foreground">Satisfacción</p>
                  <p className="mt-1 text-xs text-muted-foreground">{morale}/100 · impacto de la satisfacción</p>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={selectedStats?.squadRole} compact />
                  <MoodFace morale={morale} size={17} showLabel />
                </div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted/40"><div className={`h-full ${morale >= 60 ? "bg-emerald-400" : morale >= 40 ? "bg-yellow-400" : morale >= 20 ? "bg-orange-400" : "bg-destructive"}`} style={{ width: `${Math.max(4, Math.min(100, morale))}%` }} /></div>
              <p className="mt-2 text-[0.65rem] text-muted-foreground">{selectedStats?.satisfactionLastReason ?? "Satisfacción estable."}</p>
            </section>
          )}

          <section className="space-y-3">
            <SectionHeading icon={Target} title="Perfil técnico" subtitle="Atributos principales del jugador" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border/60 bg-card/55 p-4">
              <StatBar label="PAC" value={Number(dynamicAttributes?.PAC ?? selected.PAC)} />
              <StatBar label="SHO" value={Number(dynamicAttributes?.SHO ?? selected.SHO)} />
              <StatBar label="PAS" value={Number(dynamicAttributes?.PAS ?? selected.PAS)} />
              <StatBar label="DRI" value={Number(dynamicAttributes?.DRI ?? selected.DRI)} />
              <StatBar label="DEF" value={Number(dynamicAttributes?.DEF ?? selected.DEF)} />
              <StatBar label="PHY" value={Number(dynamicAttributes?.PHY ?? selected.PHY)} />
            </div>
          </section>

          {(injured || (privateMode && isListed)) && (
            <div className="flex flex-wrap gap-2">
              {injured && <span className="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-destructive"><Activity className="h-3 w-3" />Lesionado</span>}
              {privateMode && isListed && <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-amber-300"><Tag className="h-3 w-3" />En el mercado</span>}
            </div>
          )}

          {privateMode && (
            <div className="grid grid-cols-1 gap-2 border-t border-border/50 pt-4 sm:grid-cols-3">
              {onRenew && <button type="button" onClick={onRenew} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs font-black text-emerald-300 transition hover:bg-emerald-500/20"><HeartHandshake className="h-4 w-4" />Renovar contrato</button>}
              {onToggleListed && <button type="button" onClick={onToggleListed} disabled={!isMarketOpen} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${isListed ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25" : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"}`}><Tag className="h-4 w-4" />{isListed ? "Retirar de venta" : "Poner en venta"}</button>}
              {onListLoan && <button type="button" onClick={onListLoan} disabled={!isMarketOpen || !!marketPlayer?.loanClubId} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-xs font-black text-primary transition disabled:cursor-not-allowed disabled:opacity-40"><Handshake className="h-4 w-4" />{marketPlayer?.loanListed ? "Retirar de cesión" : "Listar en cesión"}</button>}
            </div>
          )}

          {privateMode && !isMarketOpen && <p className="flex items-center gap-1 text-[0.65rem] text-muted-foreground"><ShieldAlert className="h-3 w-3" />Mercado cerrado. Las operaciones se reanudarán en la próxima ventana.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

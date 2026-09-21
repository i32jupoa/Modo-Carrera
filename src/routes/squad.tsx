import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, saveSave } from "@/lib/store";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerFace, ROLE_TEXT, roleFromPosition } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";
import {
  usePlayersStore,
  type FcPlayer,
  formatEuro,
  marketValueEuros,
  mapEaPosition,
  POS_LABEL_ES,
} from "@/store/playersStore";
import type { Position } from "@/data/players";
import type { DynamicPlayerStats } from "@/types/playerStats";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { toast } from "sonner";
import {
  Wallet,
  Smile,
  Meh,
  Frown,
  HeartHandshake,
  Tag,
  X,
  Activity,
  ShieldAlert,
  Goal,
  Sparkles,
  Shield,
  CalendarDays,
  Banknote,
  CircleDollarSign,
  Handshake,
  Cake,
  Star,
  Trophy,
  TrendingUp,
  TrendingDown,
  Medal,
  Target,
  Users,
} from "lucide-react";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { useUserMarket } from "@/hooks/useUserMarket";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";
import {
  getPlayer,
  getPlayerAnnualWage,
  listForTransfer,
  unlistFromTransfer,
} from "@/lib/transfers";
import { saveTransferSystem } from "@/lib/transfers/Persistence";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/squad")({ component: SquadPage });

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

const POSITION_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];
const POSITION_FULL: Record<Position, string> = {
  GK: "Porteros",
  DEF: "Defensas",
  MID: "Centrocampistas",
  FWD: "Delanteros",
};
const POSITION_ACCENT: Record<Position, string> = {
  GK: "from-amber-500/30 to-amber-500/0 border-amber-500/40 text-amber-300",
  DEF: "from-sky-500/30 to-sky-500/0 border-sky-500/40 text-sky-300",
  MID: "from-emerald-500/30 to-emerald-500/0 border-emerald-500/40 text-emerald-300",
  FWD: "from-rose-500/30 to-rose-500/0 border-rose-500/40 text-rose-300",
};

function ovrTone(ovr: number): string {
  if (ovr >= 85) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (ovr >= 78) return "bg-primary/15 text-primary border-primary/40";
  if (ovr >= 70) return "bg-yellow-500/15 text-yellow-300 border-yellow-500/40";
  return "bg-muted text-muted-foreground border-border/40";
}

function moodLabel(m: number) {
  if (m >= 80) return { label: "Encantado", Icon: Smile, tone: "text-emerald-400" };
  if (m >= 60) return { label: "Satisfecho", Icon: Smile, tone: "text-primary" };
  if (m >= 40) return { label: "Indiferente", Icon: Meh, tone: "text-yellow-300" };
  if (m >= 20) return { label: "Descontento", Icon: Frown, tone: "text-orange-400" };
  return { label: "Furioso", Icon: Frown, tone: "text-destructive" };
}

function SummaryMetric({
  label,
  value,
  accent = "text-foreground",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
      <p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 scoreline text-base font-black ${accent}`}>{value}</p>
    </div>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(99, value));
  const tone =
    v >= 85
      ? "bg-emerald-400"
      : v >= 75
        ? "bg-primary"
        : v >= 60
          ? "bg-yellow-400"
          : "bg-muted-foreground";
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


function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Target;
  title: string;
  subtitle?: string;
}) {
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

function SeasonProgressChart({
  monthlyStats,
}: {
  monthlyStats: NonNullable<ReturnType<typeof usePlayersStore.getState>["stats"][string]>["monthlyStats"];
}) {
  const points = useMemo(
    () =>
      [...(monthlyStats ?? [])]
        .filter((entry) => (entry.ratingCount ?? entry.appearances) > 0 && entry.averageRating > 0)
        .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
        .map((entry) => ({
          label: formatMonthLabel(entry.month, entry.year),
          media: Number(entry.averageRating.toFixed(2)),
          partidos: entry.appearances,
        })),
    [monthlyStats],
  );

  if (points.length === 0) {
    return (
      <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-border/60 bg-secondary/20 p-6 text-center">
        <div>
          <TrendingUp className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm font-bold">Sin valoraciones todavía</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            La evolución de la media aparecerá aquí a medida que el jugador dispute partidos.
          </p>
        </div>
      </div>
    );
  }

  const first = points[0].media;
  const last = points[points.length - 1].media;
  const delta = Number((last - first).toFixed(2));
  const trendUp = delta >= 0;

  return (
    <div className="rounded-xl border border-border/60 bg-card/55 p-3">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Progreso de la media
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Valoración media por mes de temporada</p>
        </div>
        <div className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${
          trendUp
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-destructive/30 bg-destructive/10 text-destructive"
        }`}>
          {trendUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(2)}
        </div>
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              minTickGap={18}
            />
            <YAxis
              domain={[
                (dataMin: number) => Math.max(0, Math.floor(dataMin - 1)),
                (dataMax: number) => Math.min(10, Math.ceil(dataMax + 1)),
              ]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              width={32}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid hsl(var(--border) / 0.6)",
                background: "hsl(var(--background) / 0.96)",
                fontSize: 12,
              }}
              formatter={(value: number | string) => [`${Number(value).toFixed(2)}`, "Media"]}
              labelFormatter={(label) => String(label)}
            />
            <Line
              type="monotone"
              dataKey="media"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              dot={{ r: 3, fill: "hsl(var(--primary))" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-between text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

function FormStrip({ values }: { values: number[] }) {
  const recent = values.slice(-10);
  if (recent.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/55 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Forma reciente
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Últimas valoraciones registradas</p>
        </div>
        <span className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">
          {recent.length} partidos
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {recent.map((rating, index) => (
          <span
            key={`${index}-${rating}`}
            className={`grid h-8 min-w-8 place-items-center rounded-lg border px-1.5 text-[0.65rem] font-black ${
              rating >= 8
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : rating >= 7
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : rating >= 6
                    ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {Number(rating).toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

function PlayerCard({ p, onClick }: { p: FcPlayer; onClick: () => void }) {
  const stats = usePlayersStore((s) => s.stats[String(p.ID)]);
  const pos = mapEaPosition(p.Position);
  const morale = stats?.morale ?? 70;
  const mood = moodLabel(morale);
  const injured = (stats?.injuredUntil ?? 0) > 0;
  const contract = getPlayer(String(p.ID))?.contract;
  const wage = contract?.wage ?? getPlayerAnnualWage(String(p.ID));
  const potential = Math.max(p.OVR, Number(p.potential ?? p.OVR));

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full overflow-hidden rounded-2xl border border-border/60 bg-card/80 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-card"
    >
      <div className={`w-1 shrink-0 bg-gradient-to-b ${POSITION_ACCENT[pos].replace("from-", "from-").replace(" to-", " to-")}`} />
      <div className="flex min-w-0 flex-1 items-center gap-3 p-3">
        <PlayerFace
          name={p.Name}
          image={p.card}
          role={roleFromPosition(p.Position)}
          size={54}
          className="bg-secondary/40"
        />
        <div className="flex shrink-0 flex-col gap-1">
          <div
            className={`grid h-10 w-12 place-items-center rounded-xl border scoreline text-lg font-black ${ovrTone(
              p.OVR,
            )}`}
          >
            {p.OVR}
          </div>
          <div className="px-1 text-center">
            <p className="text-[0.48rem] font-bold uppercase tracking-wider text-muted-foreground">POT</p>
            <p className="scoreline text-sm font-black text-muted-foreground">{potential}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black">{p.Name}</span>
            {injured && (
              <span title="Lesionado" className="text-destructive">
                <Activity className="h-3 w-3" />
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-wider text-muted-foreground">
            <span className={`rounded bg-secondary/60 px-1.5 py-0.5 ${ROLE_TEXT[roleFromPosition(p.Position)]}`}>
              {POS_LABEL_ES[pos]}
            </span>
            <span>{p.Age} años</span>
            <span>{contract?.yearsLeft ?? "—"} temp.</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[0.58rem] uppercase tracking-wider text-muted-foreground">Salario</span>
            <span className="scoreline text-xs font-black text-primary">{formatEuro(wage)}/año</span>
          </div>
        </div>
        <div className={`hidden flex-col items-end gap-1 sm:flex ${mood.tone}`}>
          <mood.Icon className="h-4 w-4" />
          <span className="text-[0.5rem] font-bold uppercase tracking-wider">{mood.label}</span>
        </div>
      </div>
    </button>
  );
}

function RenewalModal({
  p,
  budget,
  wageBill,
  wageBudget,
  onClose,
  onConfirm,
}: {
  p: FcPlayer;
  budget: number;
  wageBill: number;
  wageBudget: number;
  onClose: () => void;
  onConfirm: (input: {
    playerId: string;
    years: number;
    wage: number;
    releaseClause: number;
    signingBonus: number;
  }) => void;
}) {
  const contract = getPlayer(String(p.ID))?.contract;
  const currentWage = contract?.wage ?? getPlayerAnnualWage(String(p.ID));
  const [years, setYears] = useState(Math.max(2, Math.min(5, contract?.yearsLeft ?? 3)));
  const [wageM, setWageM] = useState(currentWage / 1_000_000);
  const [clauseM, setClauseM] = useState((contract?.releaseClause ?? marketValueEuros(p) * 1.8) / 1_000_000);
  const [bonusM, setBonusM] = useState((contract?.signingBonus ?? currentWage * 0.2) / 1_000_000);

  const wage = Math.round(Math.max(0, wageM) * 1_000_000);
  const releaseClause = Math.round(Math.max(0, clauseM) * 1_000_000);
  const signingBonus = Math.round(Math.max(0, bonusM) * 1_000_000);
  const availableRoom = Math.max(0, wageBudget - wageBill + currentWage);
  const wageDelta = wage - currentWage;
  const invalidWage = wage > availableRoom;
  const invalidBonus = signingBonus > budget;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <div className="bg-gradient-to-br from-emerald-500/20 via-primary/10 to-transparent p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <HeartHandshake className="h-5 w-5 text-emerald-300" />
              Renovar contrato
            </DialogTitle>
            <DialogDescription>
              {p.Name} · {p.OVR} OVR · contrato actual {contract?.yearsLeft ?? 0} temporadas
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ContractMetric icon={Banknote} label="Salario actual" value={`${formatEuro(currentWage)}/año`} />
            <ContractMetric icon={CalendarDays} label="Duración" value={`${contract?.yearsLeft ?? 0} temp.`} />
            <ContractMetric icon={Shield} label="Cláusula actual" value={formatEuro(contract?.releaseClause ?? 0)} />
            <ContractMetric icon={CircleDollarSign} label="Prima actual" value={formatEuro(contract?.signingBonus ?? 0)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Duración nueva (años)" value={years} onChange={setYears} min={1} max={5} step={1} suffix="años" />
            <NumberField label="Salario anual" value={wageM} onChange={setWageM} min={0} step={0.05} suffix="M €" />
            <NumberField label="Cláusula de rescisión" value={clauseM} onChange={setClauseM} min={0} step={0.1} suffix="M €" />
            <NumberField label="Prima / ficha de renovación" value={bonusM} onChange={setBonusM} min={0} step={0.05} suffix="M €" />
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                Impacto económico
              </span>
              <span className="text-xs font-black">
                {wageDelta >= 0 ? "+" : ""}
                {formatEuro(wageDelta)}/año
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg border border-border/50 bg-background/30 p-2.5">
                <p className="text-muted-foreground">Margen salarial</p>
                <p className={`mt-0.5 font-black ${invalidWage ? "text-destructive" : "text-emerald-300"}`}>
                  {formatEuro(Math.max(0, availableRoom - wage))}
                </p>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/30 p-2.5">
                <p className="text-muted-foreground">Presupuesto tras la prima</p>
                <p className={`mt-0.5 font-black ${invalidBonus ? "text-destructive" : "text-emerald-300"}`}>
                  {formatEuro(Math.max(0, budget - signingBonus))}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
            Este contrato será el mismo que verá <strong className="text-foreground">Mercado</strong>:
            salario, años, cláusula y prima quedan guardados en la ficha única del jugador.
          </div>

          {(invalidWage || invalidBonus) && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {invalidWage && `El salario supera tu margen salarial (${formatEuro(availableRoom)} disponibles). `}
              {invalidBonus && `La prima supera tu presupuesto (${formatEuro(budget)} disponibles).`}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={invalidWage || invalidBonus || years < 1 || years > 5 || wage <= 0}
              onClick={() =>
                onConfirm({
                  playerId: String(p.ID),
                  years,
                  wage,
                  releaseClause,
                  signingBonus,
                })
              }
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-emerald-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirmar renovación
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-secondary px-4 py-3 text-sm font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContractMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-2.5">
      <div className="flex items-center gap-1.5 text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 text-xs font-black">{value}</p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number;
  step: number;
  suffix: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[0.62rem] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value)))}
          className="w-full rounded-xl border border-border bg-secondary px-3 py-2.5 pr-12 text-sm font-black outline-none focus:border-primary"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.65rem] font-bold text-muted-foreground">
          {suffix}
        </span>
      </div>
    </label>
  );
}

function LoanSearchModal({
  p,
  listed,
  onToggle,
  onClose,
}: {
  p: FcPlayer;
  listed: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const marketPlayer = getPlayer(String(p.ID));
  const loaned = !!marketPlayer?.loanClubId;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <div className="bg-gradient-to-br from-primary/20 via-card to-transparent p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <Handshake className="h-5 w-5 text-primary" />
              Buscar cesión
            </DialogTitle>
            <DialogDescription>
              {p.Name} · {p.OVR} OVR · {p.Age} años
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-border/60 bg-card/60 p-4 text-sm">
            <p className="font-bold">Buscar destino temporal</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Lista al jugador como disponible para una cesión. Los clubes interesados enviarán ofertas
              y la negociación continuará desde Mercado → Ofertas recibidas. La prima suele ser gratis o
              baja, y se negocia qué porcentaje del salario paga cada club. También pueden llegar ofertas
              sin haberlo listado.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border/50 bg-secondary/40 p-3">
              <p className="text-muted-foreground">Estado</p>
              <p className="mt-1 font-black">{loaned ? "Ya está cedido" : listed ? "Buscando destino" : "Sin búsqueda"}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-secondary/40 p-3">
              <p className="text-muted-foreground">Prima habitual</p>
              <p className="mt-1 font-black">Gratis / baja</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loaned}
              onClick={onToggle}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                listed ? "border border-amber-500/40 bg-amber-500/15 text-amber-300" : "bg-primary text-primary-foreground"
              }`}
            >
              {listed ? "Cancelar búsqueda" : "Buscar destino"}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl bg-secondary px-4 py-3 text-sm font-bold">
              Cerrar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SquadPage() {
  const navigate = useNavigate();
  const { loading } = usePlayersReady();
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const currentDate = usePlayersStore((s) => s.currentDate);
  const squad = usePlayersStore((s) => s.squad);
  const fixtures = usePlayersStore((s) => s.fixtures);
  const budget = usePlayersStore((s) => s.budget);
  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const hydrate = usePlayersStore((s) => s.hydrateMyTeam);
  const wageBudget = usePlayersStore((s) => s.wageBudget);
  const renewPlayerContract = usePlayersStore((s) => s.renewPlayerContract);
  const syncWageStateFromMarket = usePlayersStore((s) => s.syncWageStateFromMarket);
  const { isMarketOpen } = useTransferMarket();
  const market = useUserMarket(!!myTeamId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renewalPlayerId, setRenewalPlayerId] = useState<string | null>(null);
  const [loanSearchPlayerId, setLoanSearchPlayerId] = useState<string | null>(null);
  const [loanSearchListed, setLoanSearchListed] = useState(false);
  const [listed, setListed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const save = loadSave();
    if (!save) {
      navigate({ to: "/" });
      return;
    }
    if (!myTeamId) {
      setMyTeam(save.myTeamId);
    } else if (squad.length === 0) {
      hydrate();
    }
  }, [myTeamId, squad.length, navigate, setMyTeam, hydrate, syncWageStateFromMarket]);

  useEffect(() => {
    syncWageStateFromMarket();
    setListed(
      new Set(
        squad
          .filter((player) => getPlayer(String(player.ID))?.transferListed)
          .map((player) => String(player.ID)),
      ),
    );
  }, [myTeamId, squad, syncWageStateFromMarket]);

  const byPos = useMemo(() => {
    const buckets: Record<Position, FcPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const p of squad) buckets[mapEaPosition(p.Position)].push(p);
    for (const k of POSITION_ORDER) buckets[k].sort((a, b) => b.OVR - a.OVR);
    return buckets;
  }, [squad]);

  const avgOvr = squad.length
    ? (squad.reduce((s, p) => s + p.OVR, 0) / squad.length).toFixed(1)
    : "—";
  const totalValue = squad.reduce((s, p) => s + marketValueEuros(p), 0);
  const currentWageBill = squad.reduce((sum, p) => sum + getPlayerAnnualWage(String(p.ID)), 0);
  const effectiveWageBudget = Math.max(wageBudget || 0, currentWageBill);

  const selected = selectedId ? (squad.find((p) => String(p.ID) === selectedId) ?? null) : null;
  // Subscribe to the selected player's stats so the detail card always
  // refreshes immediately after a match updates appearances/minutes/etc.
  const selectedStats = usePlayersStore((s) =>
    selectedId ? s.stats[selectedId] : undefined,
  );

  function handleRenewSubmit(input: {
    playerId: string;
    years: number;
    wage: number;
    releaseClause: number;
    signingBonus: number;
  }) {
    const result = renewPlayerContract(input);
    if (!result.renewed) {
      toast.error("No se pudo renovar", { description: result.message });
      return;
    }
    toast.success(`${result.playerName} renovado`, {
      description: `${result.years} temporadas · ${formatEuro(result.wage)}/año · cláusula ${formatEuro(result.releaseClause)}`,
    });
    syncWageStateFromMarket();
    setRenewalPlayerId(null);
  }

  function handleToggleListed(p: FcPlayer) {
    const id = String(p.ID);
    const marketPlayer = getPlayer(id);
    if (!marketPlayer) return;
    if (marketPlayer.transferListed) {
      unlistFromTransfer(id);
      setListed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.info(`${p.Name} retirado del mercado`);
    } else {
      listForTransfer(id, "user");
      setListed((prev) => new Set(prev).add(id));
      toast.success(`${p.Name} puesto en venta`, {
        description: `Las ofertas aparecerán en Mercado → Ofertas recibidas.`,
      });
    }
    void saveTransferSystem();
  }

  function handleToggleLoanSearch(p: FcPlayer) {
    const id = String(p.ID);
    const next = !(getPlayer(id)?.loanListed ?? false);
    market.setLoanListed(id, next);
    setLoanSearchListed(next);
  }

  if (!myTeamId) return null;
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <PlayersLoading message="Cargando datos de jugadores…" />
      </div>
    );
  }
  const team = teamById(myTeamId);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <MarketStatusBanner className="mb-6" />

      {/* Header card */}
      <div className="panel-glow mb-6 overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-5 sm:flex sm:flex-wrap sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={56} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black sm:text-2xl">{team.name}</h1>
              <p className="text-xs text-muted-foreground">
                Mi Plantilla · {getLeagueName(team.league)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryMetric label="Jugadores" value={String(squad.length)} />
            <SummaryMetric label="OVR medio" value={avgOvr} accent="text-primary" />
            <SummaryMetric label="Valor plantilla" value={formatEuro(totalValue)} accent="text-emerald-400" />
            <SummaryMetric label="Saldo fichajes" value={formatEuro(budget)} accent="text-primary" />
          </div>
        </div>
      </div>

      {squad.length === 0 ? (
        <div className="panel p-6">
          <p className="text-sm text-muted-foreground">
            No hay jugadores en la base de datos local para <strong>{team.name}</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {POSITION_ORDER.map((pos) => {
            const players = byPos[pos];
            if (players.length === 0) return null;
            return (
              <section key={pos}>
                <div
                  className={`mb-3 flex items-center gap-3 rounded-xl border bg-gradient-to-r p-3 ${POSITION_ACCENT[pos]}`}
                >
                  <span className="scoreline text-2xl font-black">{POS_LABEL_ES[pos]}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold uppercase tracking-wider">
                      {POSITION_FULL[pos]}
                    </p>
                    <p className="text-[0.65rem] uppercase tracking-wider opacity-70">
                      {players.length} jugadores · OVR medio{" "}
                      {(players.reduce((s, p) => s + p.OVR, 0) / players.length).toFixed(1)}
                    </p>
                  </div>
                  {listed.size > 0 && (
                    <span className="rounded-full border border-current/30 bg-background/40 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider">
                      {players.filter((p) => listed.has(String(p.ID))).length} en mercado
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {players.map((p) => (
                    <PlayerCard key={p.ID} p={p} onClick={() => setSelectedId(String(p.ID))} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Player detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto overflow-x-hidden p-0">
          {selected &&
            (() => {
              const pos = mapEaPosition(selected.Position);
              const morale = selectedStats?.morale ?? 70;
              const mood = moodLabel(morale);
              const injured = (selectedStats?.injuredUntil ?? 0) > 0;
              const marketPlayer = getPlayer(String(selected.ID));
              const marketContract = marketPlayer?.contract;
              const isListed = marketPlayer?.transferListed ?? listed.has(String(selected.ID));
              const value = marketValueEuros(selected);
              const wage = marketContract?.wage ?? getPlayerAnnualWage(String(selected.ID));
              const dynamicOvr = Math.round(Number(selectedStats?.currentOVR ?? selected.OVR));
              const baseOvr = Math.round(Number(selectedStats?.baseOVR ?? selected.OVR));
              const potential = Math.max(
                dynamicOvr,
                Number(selectedStats?.potentialOVR ?? selected.potential ?? selected.OVR),
              );
              const ovrDelta = dynamicOvr - baseOvr;
              // Use the same authoritative legacy counters as the Team Stats screen.
              const seasonAppearances = Number(selectedStats?.appearances ?? 0);
              const seasonGoals = Number(selectedStats?.goals ?? 0);
              const seasonAssists = Number(selectedStats?.assists ?? 0);
              const seasonMVPs = Number(
                selectedStats?.dynamicStats?.seasonMVPs ?? selectedStats?.motm ?? 0,
              );
              const seasonCleanSheets = Number(
                selectedStats?.dynamicStats?.seasonCleanSheets ?? selectedStats?.cleanSheets ?? 0,
              );
              const seasonRating = Number(
                selectedStats?.dynamicStats && selectedStats.dynamicStats.seasonAppearances > 0
                  ? selectedStats.dynamicStats.seasonAverageRating
                  : selectedStats?.formHistory?.length
                    ? selectedStats.formHistory.reduce((sum, value) => sum + value, 0) / selectedStats.formHistory.length
                    : 0,
              );
              const seasonTrophies = Number(selectedStats?.dynamicStats?.seasonTrophies ?? 0);
              const currentForm =
                selectedStats?.formHistory?.length
                  ? selectedStats.formHistory[selectedStats.formHistory.length - 1]
                  : 0;

              return (
                <>
                  {/* Player hero */}
                  <div className={`relative overflow-hidden bg-gradient-to-br p-5 ${POSITION_ACCENT[pos]}`}>
                    <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-background/10 blur-3xl" />
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="absolute right-3 top-3 z-10 rounded-full p-2 text-foreground/70 transition hover:bg-background/30 hover:text-foreground"
                      aria-label="Cerrar"
                    >
                      <X className="h-4 w-4" />
                    </button>

                    <DialogHeader className="relative">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <div className="flex items-end gap-3">
                          <div className="w-28 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-secondary/50 shadow-xl">
                            {faceUrl(String(selected.ID), selected.card) ? (
                              <img
                                src={faceUrl(String(selected.ID), selected.card)}
                                alt={selected.Name}
                                className="h-36 w-full object-cover object-top"
                              />
                            ) : (
                              <div className="grid h-36 place-items-center text-xs text-muted-foreground">
                                Sin foto
                              </div>
                            )}
                          </div>
                          <div className="mb-1 flex flex-col items-center gap-2">
                            <div
                              className={`grid h-16 w-16 place-items-center rounded-2xl border scoreline text-2xl font-black shadow-lg ${ovrTone(
                                dynamicOvr,
                              )}`}
                            >
                              {dynamicOvr}
                            </div>
                            <div className="rounded-xl border border-border/50 bg-background/45 px-2.5 py-1.5 text-center backdrop-blur">
                              <p className="text-[0.48rem] font-black uppercase tracking-wider text-muted-foreground">
                                POT
                              </p>
                              <p className="scoreline text-sm font-black">{potential}</p>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <DialogTitle className="text-2xl font-black tracking-tight">
                              {selected.Name}
                            </DialogTitle>
                            <span className={`rounded-full border px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider ${ROLE_TEXT[roleFromPosition(selected.Position)]}`}>
                              {POS_LABEL_ES[pos]}
                            </span>
                            {isListed && (
                              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider text-amber-300">
                                En venta
                              </span>
                            )}
                          </div>

                          <DialogDescription className="mt-1 text-xs font-semibold uppercase tracking-wider">
                            {selected.Position} · {selected.Age} años · {selected.Nation ?? "Nacionalidad no disponible"}
                          </DialogDescription>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/35 px-2.5 py-2 backdrop-blur">
                              <TeamLogo
                                teamName={team.name}
                                leagueName={getLeagueName(team.league)}
                                size={30}
                                className="rounded-md"
                              />
                              <div>
                                <p className="text-[0.48rem] font-bold uppercase tracking-wider text-muted-foreground">
                                  Equipo
                                </p>
                                <p className="text-xs font-black">{team.name}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/35 px-2.5 py-2 text-xs font-bold backdrop-blur">
                              <Cake className="h-3.5 w-3.5" />
                              {formatBirthdate(selected.birthdate)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </DialogHeader>
                  </div>

                  <div className="space-y-5 p-4 sm:p-5">
                    {/* Executive snapshot */}
                    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <DetailMetric
                        icon={Target}
                        label="Valor"
                        value={formatEuro(value)}
                        accent="text-emerald-300"
                        hint="Valor de mercado"
                      />
                      <DetailMetric
                        icon={Banknote}
                        label="Salario"
                        value={`${formatEuro(wage)}/año`}
                        accent="text-primary"
                      />
                      <DetailMetric
                        icon={CalendarDays}
                        label="Contrato"
                        value={`${marketContract?.yearsLeft ?? 0} temp.`}
                      />
                      <DetailMetric
                        icon={Shield}
                        label="Cláusula"
                        value={formatEuro(marketContract?.releaseClause ?? 0)}
                        accent="text-amber-300"
                      />
                    </section>

                    {/* Season performance */}
                    <section className="space-y-3">
                      <SectionHeading
                        icon={Medal}
                        title="Rendimiento de temporada"
                        subtitle="Impacto real en los partidos disputados"
                      />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                        <DetailMetric icon={Users} label="Partidos" value={String(seasonAppearances)} />
                        <DetailMetric
                          icon={Star}
                          label="Media"
                          value={seasonRating > 0 ? seasonRating.toFixed(2) : "—"}
                          accent="text-primary"
                        />
                        <DetailMetric icon={Goal} label="Goles" value={String(seasonGoals)} />
                        <DetailMetric icon={Sparkles} label="Asistencias" value={String(seasonAssists)} />
                        <DetailMetric
                          icon={Trophy}
                          label="Trofeos"
                          value={String(seasonTrophies)}
                          accent="text-amber-300"
                        />
                      </div>

                      {pos === "GK" && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <DetailMetric
                            icon={Shield}
                            label="Porterías a 0"
                            value={String(seasonCleanSheets)}
                            accent="text-emerald-300"
                            hint="Esta temporada"
                          />
                          <DetailMetric
                            icon={Star}
                            label="MVP"
                            value={String(seasonMVPs)}
                            accent="text-amber-300"
                          />
                          <DetailMetric
                            icon={Shield}
                            label="Ratio"
                            value={
                              seasonAppearances > 0
                                ? `${((seasonCleanSheets / seasonAppearances) * 100).toFixed(0)}%`
                                : "—"
                            }
                            hint="Partidos con portería a cero"
                          />
                        </div>
                      )}
                    </section>

                    {/* OVR progression */}
                    <section className="space-y-3">
                      <SectionHeading
                        icon={TrendingUp}
                        title="Evolución del jugador"
                        subtitle="Cómo ha cambiado su media durante la partida"
                      />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <DetailMetric icon={Shield} label="Media inicial" value={String(baseOvr)} />
                        <DetailMetric
                          icon={TrendingUp}
                          label="Media actual"
                          value={String(dynamicOvr)}
                          accent={ovrDelta >= 0 ? "text-emerald-300" : "text-destructive"}
                          hint={`${ovrDelta >= 0 ? "+" : ""}${ovrDelta} OVR`}
                        />
                        <DetailMetric icon={Medal} label="Potencial" value={String(potential)} />
                        <DetailMetric
                          icon={Star}
                          label="Forma"
                          value={currentForm > 0 ? Number(currentForm).toFixed(1) : "—"}
                          accent="text-primary"
                        />
                      </div>
                    </section>

                    <SeasonProgressChart monthlyStats={selectedStats?.monthlyStats ?? []} />
                    <FormStrip values={selectedStats?.formHistory ?? []} />

                    {/* Mood */}
                    <section className="rounded-xl border border-border/60 bg-card/55 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-muted-foreground">
                            Estado de ánimo
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {morale}/100 · impacto de la satisfacción en la plantilla
                          </p>
                        </div>
                        <span className={`flex items-center gap-1.5 text-sm font-black ${mood.tone}`}>
                          <mood.Icon className="h-4 w-4" />
                          {mood.label}
                        </span>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                          className={`h-full transition-[width] ${
                            morale >= 60
                              ? "bg-emerald-400"
                              : morale >= 40
                                ? "bg-yellow-400"
                                : "bg-destructive"
                          }`}
                          style={{ width: `${Math.max(4, Math.min(100, morale))}%` }}
                        />
                      </div>
                    </section>

                    {/* Technical profile */}
                    <section className="space-y-3">
                      <SectionHeading
                        icon={Target}
                        title="Perfil técnico"
                        subtitle="Atributos principales del jugador"
                      />
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border/60 bg-card/55 p-4">
                        <StatBar label="PAC" value={selected.PAC} />
                        <StatBar label="SHO" value={selected.SHO} />
                        <StatBar label="PAS" value={selected.PAS} />
                        <StatBar label="DRI" value={selected.DRI} />
                        <StatBar label="DEF" value={selected.DEF} />
                        <StatBar label="PHY" value={selected.PHY} />
                      </div>
                    </section>

                    {/* Status flags */}
                    {(injured || isListed) && (
                      <div className="flex flex-wrap gap-2">
                        {injured && (
                          <span className="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-destructive">
                            <Activity className="h-3 w-3" />
                            Lesionado
                          </span>
                        )}
                        {isListed && (
                          <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-amber-300">
                            <Tag className="h-3 w-3" />
                            En el mercado
                          </span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="grid grid-cols-1 gap-2 border-t border-border/50 pt-4 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => setRenewalPlayerId(String(selected.ID))}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs font-black text-emerald-300 transition hover:bg-emerald-500/20"
                      >
                        <HeartHandshake className="h-4 w-4" />
                        Renovar contrato
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleListed(selected)}
                        disabled={!isMarketOpen}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          isListed
                            ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                            : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                        }`}
                      >
                        <Tag className="h-4 w-4" />
                        {isListed ? "Retirar de venta" : "Poner en venta"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLoanSearchPlayerId(String(selected.ID));
                          setLoanSearchListed(getPlayer(String(selected.ID))?.loanListed ?? false);
                        }}
                        disabled={!isMarketOpen || !!getPlayer(String(selected.ID))?.loanClubId}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          getPlayer(String(selected.ID))?.loanListed
                            ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                            : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                        }`}
                      >
                        <Handshake className="h-4 w-4" />
                        {getPlayer(String(selected.ID))?.loanListed ? "Retirar de cesión" : "Listar en cesión"}
                      </button>
                    </div>

                    {!isMarketOpen && (
                      <p className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                        <ShieldAlert className="h-3 w-3" />
                        Mercado cerrado. Las operaciones se reanudarán en la próxima ventana.
                      </p>
                    )}
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>

      {loanSearchPlayerId && (() => {
        const loanPlayer = squad.find((player) => String(player.ID) === loanSearchPlayerId);
        if (!loanPlayer) return null;
        return (
          <LoanSearchModal
            p={loanPlayer}
            listed={loanSearchListed}
            onClose={() => setLoanSearchPlayerId(null)}
            onToggle={() => handleToggleLoanSearch(loanPlayer)}
          />
        );
      })()}

      {renewalPlayerId && (() => {
        const renewalPlayer = squad.find((p) => String(p.ID) === renewalPlayerId) ?? null;
        if (!renewalPlayer) return null;
        return (
          <RenewalModal
            p={renewalPlayer}
            budget={budget}
            wageBill={currentWageBill}
            wageBudget={effectiveWageBudget}
            onClose={() => setRenewalPlayerId(null)}
            onConfirm={handleRenewSubmit}
          />
        );
      })()}
    </div>
  );
}

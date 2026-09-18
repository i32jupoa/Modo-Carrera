import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { Activity, Clock3, Goal, SearchCheck, ShieldCheck, Sparkles, Target, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { faceUrl } from "@/lib/playerFaces";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { getScoutCapabilities, type ScoutingEntry } from "@/lib/transfers/Scouting";
import { buildPositions, formatShortPositions } from "@/lib/positions";
import type { ScoutingReport } from "@/lib/transfers/UserNegotiation";
import { estimateScoutingMoney, estimateScoutingPotential, isScoutingFieldDetected } from "@/lib/transfers/ScoutingReport";
import { formatEuro, usePlayersStore, type FcPlayer, type PlayerStats } from "@/store/playersStore";

type ScoutFieldKey = "potential" | "marketValue" | "salary" | "askingPrice" | "wageDemand";

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeText(value: unknown, fallback = "—"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function safeFormatEuro(value: unknown): string {
  try {
    return formatEuro(Math.max(0, safeNumber(value)));
  } catch {
    const amount = Math.max(0, safeNumber(value));
    if (amount >= 1_000_000) return `€${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `€${(amount / 1_000).toFixed(2)}K`;
    return `€${amount.toFixed(2)}`;
  }
}

function safeRating(entry?: ScoutingEntry | null): number {
  const value = safeNumber(entry?.scoutRating, 0.5);
  return [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].includes(value) ? value : 0.5;
}

function safePositions(player: FcPlayer): ReturnType<typeof buildPositions> {
  try {
    return buildPositions(player?.Position, player?.["Alternative positions"]);
  } catch {
    return [];
  }
}

function safeDetected(entry: ScoutingEntry | null | undefined, field: ScoutFieldKey): boolean {
  if (!entry) return false;
  try {
    return isScoutingFieldDetected(entry, field);
  } catch {
    return false;
  }
}

function safeCapabilities(entry: ScoutingEntry | null | undefined) {
  const fallback = { fieldsDetected: 2, precision: 2, minSlots: 2, maxSlots: 2, slots: 2, minDays: 11, maxDays: 12 };
  if (!entry) return { fieldsDetected: 5, precision: 5, minSlots: 10, maxSlots: 10, slots: 10, minDays: 2, maxDays: 3 };
  try {
    return getScoutCapabilities(safeRating(entry));
  } catch {
    return fallback;
  }
}

function safeEstimateMoney(value: unknown, entry: ScoutingEntry | null | undefined, field: string) {
  if (!entry) return { kind: "unknown" } as const;
  try {
    return estimateScoutingMoney(safeNumber(value), entry, field);
  } catch {
    return { kind: "unknown" } as const;
  }
}

function safeEstimatePotential(value: unknown, minimumOverall: unknown, entry: ScoutingEntry | null | undefined) {
  const safeValue = Math.max(1, Math.round(safeNumber(value, 1)));
  const safeOvr = Math.max(1, Math.round(safeNumber(minimumOverall, safeValue)));
  if (!entry) return { kind: "exact", value: safeValue } as const;
  try {
    return estimateScoutingPotential(safeValue, entry, safeOvr);
  } catch {
    // Último respaldo: nunca se muestra un mínimo por debajo de la media.
    return { kind: "range", min: Math.min(safeOvr, safeValue), max: Math.max(safeOvr, Math.min(99, safeValue + 1)) } as const;
  }
}

function formatEstimate(estimate: ReturnType<typeof safeEstimateMoney>): string {
  if (estimate.kind === "unknown") return "—";
  if (estimate.kind === "exact") return safeFormatEuro(estimate.value);
  return `${safeFormatEuro(estimate.min)} – ${safeFormatEuro(estimate.max)}`;
}

function safeStats(player: FcPlayer): PlayerStats | undefined {
  try {
    const stats = usePlayersStore.getState()?.stats;
    const raw = stats?.[String(player.ID)];
    return raw && typeof raw === "object" ? raw : undefined;
  } catch {
    return undefined;
  }
}

function initialsFor(value: string): string {
  const initials = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials || "J";
}

function safeFaceSrc(player: FcPlayer): string | undefined {
  try {
    const rawUrl = typeof (player as any)?.url === "string" ? (player as any).url : undefined;
    const rawCard = typeof player.card === "string" ? player.card : undefined;
    const resolved = faceUrl(player.ID, rawUrl || rawCard);
    return typeof resolved === "string" && resolved.trim() ? resolved : undefined;
  } catch {
    const rawUrl = typeof (player as any)?.url === "string" ? (player as any).url : undefined;
    const rawCard = typeof player.card === "string" ? player.card : undefined;
    return rawUrl?.trim() || rawCard?.trim() || undefined;
  }
}

function SafePlayerFace({ player }: { player: FcPlayer }) {
  const name = safeText(player.Name, "Jugador");
  const src = safeFaceSrc(player);
  let role: ReturnType<typeof roleFromPosition> = "MID";
  try {
    role = roleFromPosition(player.Position);
  } catch {
    role = "MID";
  }

  return (
    <PlayerFace
      name={name}
      image={src}
      role={role}
      size={112}
      showRing={false}
      className="rounded-2xl border border-border/60 bg-secondary/60 shadow-lg"
    />
  );
}

function SafeTeamLogo({ team, league }: { team: string; league: string }) {
  const teamName = safeText(team, "Equipo desconocido");
  const leagueName = safeText(league, "");
  const initials = initialsFor(teamName);
  const src = leagueName
    ? `/logos/${encodeURIComponent(leagueName)}/${encodeURIComponent(teamName)}.png`
    : "";

  return (
    <span className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-[0.48rem] font-black text-muted-foreground">
      {initials}
      {src && (
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
      <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <div className="mt-1 break-words font-black">{value}</div>
    </div>
  );
}

function ScoutStarsInline({ rating }: { rating: number }) {
  return <span className="text-xs font-black tracking-tight text-amber-300">{safeNumber(rating, 0.5).toLocaleString("es-ES")}★</span>;
}

class ReportModalBoundary extends Component<
  { children: ReactNode; player: FcPlayer; open: boolean; onClose: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("Error interno del informe de ojeador; se muestra la vista segura.", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const player = this.props.player;
    const name = safeText(player?.Name, "Jugador");
    const ovr = Math.round(safeNumber(player?.OVR));
    const age = Math.round(safeNumber(player?.Age));
    const positions = safePositions(player);

    return (
      <Dialog open={this.props.open} onOpenChange={(value) => !value && this.props.onClose()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Informe de ojeador</DialogTitle>
            <DialogDescription>Informe seguro de {name}. Los datos básicos y de temporada se muestran aunque exista información antigua incompatible.</DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-4 border-b border-border/60 pb-4">
            <div className="h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-secondary/60 shadow-lg">
              <SafePlayerFace player={player} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-2xl font-black">{name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{positions.length ? formatShortPositions(positions.slice(0, 1)) : "—"} · {age} años</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <SafeTeamLogo team={safeText(player?.Team, "Equipo desconocido")} league={safeText(player?.League, "")} />
                <span className="font-bold">{safeText(player?.Team, "Equipo desconocido")}</span>
              </div>
            </div>
            <div className="rounded-xl border bg-secondary/40 px-3 py-2 text-center">
              <div className="text-[0.6rem] font-bold uppercase text-muted-foreground">Media</div>
              <div className="scoreline text-2xl font-black">{ovr}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Potencial" value="—" icon={TrendingUp} />
            <Stat label="Valor de mercado" value="—" icon={Target} />
            <Stat label="Salario" value="—" />
            <Stat label="Precio que pide el club" value="—" />
            <Stat label="Salario que pide el jugador" value="—" />
            <Stat label="Cláusula" value="—" icon={ShieldCheck} />
            <Stat label="Años de contrato" value="—" icon={Clock3} />
            <Stat label="Partidos" value="—" icon={Activity} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }
}

function ScoutingDetailsModalBody({
  player,
  report,
  scoutingEntry,
  open,
  onClose,
}: {
  player: FcPlayer;
  report: ScoutingReport | null;
  scoutingEntry?: ScoutingEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  const playerName = safeText(player.Name, "Jugador");
  const positions = safePositions(player);
  const alternatives = positions.slice(1);
  const rating = safeRating(scoutingEntry);
  const capabilities = safeCapabilities(scoutingEntry);
  const safeOvr = Math.max(0, Math.round(safeNumber(player.OVR)));
  const rawPotential = safeNumber(player.potential, safeOvr);
  const safePotential = Math.max(safeOvr, Math.round(rawPotential));
  const valuation = report?.valuation;
  const marketValue = safeNumber(valuation?.marketValue);
  const potential = safeEstimatePotential(safePotential, safeOvr, scoutingEntry);
  const salary = safeEstimateMoney(report?.salary, scoutingEntry, "salary");
  const value = safeEstimateMoney(marketValue, scoutingEntry, "value");
  const askingPrice = safeEstimateMoney(report?.askingPrice, scoutingEntry, "asking");
  const wageDemand = safeEstimateMoney(report?.wageDemand, scoutingEntry, "wage-demand");
  const stats = safeStats(player);
  const dynamicStats = stats?.dynamicStats;
  const seasonAppearances = Math.round(safeNumber(dynamicStats?.seasonAppearances ?? stats?.appearances));
  const seasonGoals = Math.round(safeNumber(dynamicStats?.seasonGoals ?? stats?.goals));
  const seasonAssists = Math.round(safeNumber(dynamicStats?.seasonAssists ?? stats?.assists));
  const seasonMVPs = Math.round(safeNumber(dynamicStats?.seasonMVPs ?? stats?.motm));
  const seasonCleanSheets = Math.round(safeNumber(dynamicStats?.seasonCleanSheets ?? stats?.cleanSheets));
  const history = Array.isArray(dynamicStats?.formHistory)
    ? dynamicStats.formHistory.filter((value): value is number => Number.isFinite(Number(value))).map(Number)
    : Array.isArray(stats?.formHistory)
      ? stats.formHistory.filter((value): value is number => Number.isFinite(Number(value))).map(Number)
      : [];
  const dynamicRating = dynamicStats ? safeNumber(dynamicStats.seasonAverageRating, NaN) : NaN;
  const seasonAverageRating = Number.isFinite(dynamicRating)
    ? dynamicRating
    : history.length > 0
      ? history.reduce((sum, value) => sum + value, 0) / history.length
      : null;
  const yellowCards = Math.round(safeNumber(stats?.yellowCards));
  const redCards = Math.round(safeNumber(stats?.redCards));
  const reportReleaseClause = report ? safeNumber(report.releaseClause) : NaN;
  const reportContractYears = report ? Math.max(0, Math.round(safeNumber(report.contractYearsLeft))) : null;
  const ratingLabel = `${rating.toLocaleString("es-ES")}★`;
  const precisionLabel = `${safeNumber(capabilities.precision, 2).toLocaleString("es-ES")} / 5`;
  const faceFallbackName = initialsFor(playerName);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="text-xl font-black">Informe de ojeador</DialogTitle>
            {scoutingEntry && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[0.65rem] font-black text-primary">
                <SearchCheck className="h-3.5 w-3.5" /> {ratingLabel} ojeador
              </span>
            )}
          </div>
          <DialogDescription>Información del jugador y datos detectados por el ojeador.</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-4 border-b border-border/60 pb-4">
          <div className="h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-secondary/60 shadow-lg">
            <SafePlayerFace player={player} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-2xl font-black">{playerName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {positions.length ? formatShortPositions(positions.slice(0, 1)) : "—"} · {Math.round(safeNumber(player.Age))} años
                </p>
                {alternatives.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">También: {formatShortPositions(alternatives)}</p>}
              </div>
              <div className="rounded-xl border bg-secondary/40 px-3 py-2 text-center">
                <div className="text-[0.6rem] font-bold uppercase text-muted-foreground">Media</div>
                <div className="scoreline text-2xl font-black">{safeOvr}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <SafeTeamLogo team={safeText(player.Team, "Equipo desconocido")} league={safeText(player.League, "")} />
              <span className="font-bold">{safeText(player.Team, "Equipo desconocido")}</span>
            </div>
          </div>
        </div>

        {scoutingEntry && (
          <div className="mt-4 rounded-2xl border border-border/60 bg-card/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.62rem] font-black uppercase tracking-wider text-primary">Datos detectados</p>
                <p className="mt-1 text-xs text-muted-foreground">{capabilities.fieldsDetected}/5 campos · precisión {precisionLabel}</p>
              </div>
              <ScoutStarsInline rating={rating} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="Potencial"
                value={safeDetected(scoutingEntry, "potential")
                  ? potential.kind === "exact"
                    ? potential.value
                    : potential.kind === "range"
                      ? `${potential.min} – ${potential.max}`
                      : "—"
                  : "—"}
                icon={TrendingUp}
              />
              <Stat label="Valor de mercado" value={safeDetected(scoutingEntry, "marketValue") ? formatEstimate(value) : "—"} icon={Target} />
              <Stat label="Salario" value={safeDetected(scoutingEntry, "salary") ? `${formatEstimate(salary)}/año` : "—"} />
              <Stat label="Precio que pide el club" value={safeDetected(scoutingEntry, "askingPrice") ? formatEstimate(askingPrice) : "—"} />
              <Stat label="Salario que pide el jugador" value={safeDetected(scoutingEntry, "wageDemand") ? `${formatEstimate(wageDemand)}/año` : "—"} />
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-border/60 bg-card/40 p-4">
          <p className="text-[0.62rem] font-black uppercase tracking-wider text-primary">Información adicional</p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Cláusula" value={reportReleaseClause === reportReleaseClause ? safeFormatEuro(reportReleaseClause) : "—"} icon={ShieldCheck} />
            <Stat label="Años de contrato" value={reportContractYears == null ? "—" : reportContractYears} icon={Clock3} />
            <Stat label="Partidos" value={seasonAppearances} icon={Activity} />
            <Stat label="Goles" value={seasonGoals} icon={Goal} />
            <Stat label="Asistencias" value={seasonAssists} icon={Sparkles} />
            <Stat label="G+A" value={seasonGoals + seasonAssists} />
            <Stat label="Tarjetas amarillas" value={yellowCards} />
            <Stat label="Tarjetas rojas" value={redCards} />
            <Stat label="Nota media" value={seasonAverageRating == null ? "—" : seasonAverageRating.toFixed(2)} />
            <Stat label="MVP" value={seasonMVPs} />
            <Stat label="Porterías a cero" value={seasonCleanSheets} />
          </div>
        </div>

        {report && (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Competencia" value={Math.max(0, Math.round(safeNumber(report.competition)))} />
            <Stat label="Disponible" value={report.available ? "Sí" : "No"} />
            <Stat label="En venta" value={report.transferListed ? "Sí" : "No"} />
            <Stat label="Quiere salir" value={report.wantsOut ? "Sí" : "No"} />
          </div>
        )}
        <div className="sr-only" aria-hidden="true">Cara: {faceFallbackName}</div>
      </DialogContent>
    </Dialog>
  );
}

export function ScoutingDetailsModal({
  player,
  report,
  scoutingEntry,
  open,
  onClose,
}: {
  player: FcPlayer | null;
  report: ScoutingReport | null;
  scoutingEntry?: ScoutingEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!player) return null;
  return (
    <ReportModalBoundary player={player} open={open} onClose={onClose}>
      <ScoutingDetailsModalBody
        player={player}
        report={report}
        scoutingEntry={scoutingEntry}
        open={open}
        onClose={onClose}
      />
    </ReportModalBoundary>
  );
}

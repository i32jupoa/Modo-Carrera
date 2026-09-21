import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Search,
  Clock3,
  Eye,
  Filter,
  ShieldCheck,
  Sparkles,
  UserRoundX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { loadSave } from "@/lib/store";
import { usePlayersReady } from "@/components/PlayersLoading";
import { CountryFlag } from "@/components/CountryFlag";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";
import { LeagueLogo } from "@/components/LeagueLogo";
import { LEAGUES } from "@/data/teams";
import { clubOfPlayer, formatEuro, usePlayersStore, type FcPlayer } from "@/store/playersStore";
import {
  ensureScoutingState,
  dismissHiredScout,
  getScoutCapabilities,
  getScoutSlots,
  getScoutingState,
  hireScout,
  listScouting,
  releaseHiredScout,
  removeScouting,
  startScouting,
  type ScoutCandidate,
  type ScoutRating,
  type ScoutingEntry,
} from "@/lib/transfers/Scouting";
import { ScoutingDetailsModal } from "@/components/market/ScoutingDetailsModal";
import { scoutPlayer, type ScoutingReport } from "@/lib/transfers/UserNegotiation";
import { ALL_POS_CODES, POS_NAME, buildPositions, formatShortPositions, type PosCode } from "@/lib/positions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/scouting")({ component: ScoutingPage });


class ScoutingReportBoundary extends Component<{ children: ReactNode; player: FcPlayer; reportEntry: ScoutingEntry }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("Error al renderizar el informe de ojeador", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <Dialog open onOpenChange={() => undefined}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-black">Informe de ojeador</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card/50 p-4">
                <PlayerFace
                  name={this.props.player.Name}
                  image={typeof this.props.player.card === "string" ? this.props.player.card : undefined}
                  role={roleFromPosition(this.props.player.Position)}
                  size={76}
                  showRing={false}
                  className="rounded-xl border border-border/60"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-black">{this.props.player.Name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{this.props.player.Team} · {this.props.player.Age} años</p>
                  <p className="mt-1 text-sm font-bold">Media {this.props.player.OVR}</p>
                </div>
                <TeamLogo teamName={this.props.player.Team} leagueName={this.props.player.League} size={46} />
              </div>
              <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                <p className="text-[0.65rem] font-black uppercase tracking-wider text-primary">Datos del informe</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div><span className="text-xs text-muted-foreground">Ojeador</span><p className="font-black">{this.props.reportEntry.scoutRating.toLocaleString("es-ES")}★</p></div>
                  <div><span className="text-xs text-muted-foreground">Potencial</span><p className="font-black">—</p></div>
                  <div><span className="text-xs text-muted-foreground">Valor de mercado</span><p className="font-black">—</p></div>
                  <div><span className="text-xs text-muted-foreground">Salario</span><p className="font-black">—</p></div>
                  <div><span className="text-xs text-muted-foreground">Precio que pide el club</span><p className="font-black">—</p></div>
                  <div><span className="text-xs text-muted-foreground">Salario que pide el jugador</span><p className="font-black">—</p></div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      );
    }
    return this.props.children;
  }
}

function starsLabel(rating: ScoutRating): string {
  return `${rating.toLocaleString("es-ES")} / 5`;
}

function starsVisual(rating: ScoutRating): string[] {
  return Array.from({ length: 5 }, (_, index) => {
    const filled = rating >= index + 1;
    const half = !filled && rating >= index + 0.5;
    return filled ? "full" : half ? "half" : "empty";
  });
}

function daysUntilNextCatalog(currentDate: string): number {
  const [year, month, day] = currentDate.split("-").map(Number);
  const nextMonthUtc = month === 12
    ? Date.UTC(year + 1, 0, 1)
    : Date.UTC(year, month, 1);
  const currentUtc = Date.UTC(year, month - 1, day);
  return Math.max(1, Math.ceil((nextMonthUtc - currentUtc) / 86_400_000));
}

function nextCatalogDateLabel(currentDate: string): string {
  const [year, month] = currentDate.split("-").map(Number);
  const nextMonthDate = month === 12
    ? new Date(Date.UTC(year + 1, 0, 1))
    : new Date(Date.UTC(year, month, 1));
  return nextMonthDate.toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });
}

function daysRemaining(entry: ScoutingEntry, currentDate: string): number {
  return Math.max(
    0,
    Math.ceil(
      (new Date(`${entry.readyAt}T00:00:00Z`).getTime() -
        new Date(`${currentDate}T00:00:00Z`).getTime()) /
        86_400_000,
    ),
  );
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ScoutStars({ rating, size = "sm" }: { rating: ScoutRating; size?: "sm" | "lg" }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${size === "lg" ? "text-lg" : "text-sm"}`} aria-label={starsLabel(rating)}>
      {starsVisual(rating).map((kind, index) => (
        <span
          key={index}
          className={kind === "full" ? "text-amber-300" : kind === "half" ? "text-amber-200/70" : "text-muted-foreground/30"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function ScoutCard({
  scout,
  hired,
  blockedByExisting,
  dismissed,
  onHire,
}: {
  scout: ScoutCandidate;
  hired: boolean;
  blockedByExisting: boolean;
  dismissed: boolean;
  onHire: (scout: ScoutCandidate) => void;
}) {
  const capabilities = getScoutCapabilities(scout.rating);
  const actualSlots = getScoutSlots(scout.id, scout.rating);
  return (
    <article className="panel overflow-hidden flex min-w-[255px] max-w-[280px] shrink-0 snap-start flex-col">
      <div className="relative bg-gradient-to-br from-primary/15 via-card to-card p-4 border-b border-border/50">
        <div className="flex items-start gap-3">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-primary/25 bg-secondary/70 shadow-lg shadow-primary/10">
            <img
              src={scout.photoUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-full bg-black/45 px-1.5 py-0.5 text-center text-[0.48rem] font-black tracking-wider text-white/80 backdrop-blur-sm">
              {scout.rating.toLocaleString("es-ES")}★
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black leading-tight break-words">{scout.name}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <CountryFlag country={scout.country} size="sm" />
              <span>{scout.country}</span>
            </div>
            <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1">
              <ScoutStars rating={scout.rating} />
              <span className="text-[0.55rem] font-black uppercase tracking-wider text-muted-foreground">{starsLabel(scout.rating)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[0.58rem] uppercase tracking-wider text-muted-foreground">Coste de contratación</p>
            <p className="scoreline text-xl font-black text-primary">{formatEuro(scout.cost)}</p>
          </div>
          <div className="text-right">
            <p className="text-[0.58rem] uppercase tracking-wider text-muted-foreground">Capacidad</p>
            <p className="font-black">{actualSlots} simultáneo{actualSlots === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl border border-border/50 bg-secondary/30 p-2.5">
            <p className="text-muted-foreground">Campos</p>
            <p className="mt-1 font-black">{capabilities.fieldsDetected}/5</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-secondary/30 p-2.5">
            <p className="text-muted-foreground">Precisión</p>
            <p className="mt-1 font-black">{capabilities.precision.toLocaleString("es-ES")}/5</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-secondary/30 p-2.5">
            <p className="text-muted-foreground">Informe</p>
            <p className="mt-1 font-black">{capabilities.minDays}–{capabilities.maxDays} días</p>
          </div>
        </div>

        <button
          type="button"
          disabled={hired || dismissed || blockedByExisting}
          onClick={() => onHire(scout)}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hired ? "Ojeador contratado" : dismissed ? "No disponible" : blockedByExisting ? "Ya tienes un ojeador" : "Contratar ojeador"}
        </button>
      </div>
    </article>
  );
}

function LeagueBadge({ league, size = "sm" }: { league: string; size?: "sm" | "md" | "lg" }) {
  if (!league) {
    const sizeClasses = size === "sm" ? "h-6 w-6" : size === "md" ? "h-8 w-8" : "h-10 w-10";
    return <span className={`grid ${sizeClasses} shrink-0 place-items-center rounded-md bg-secondary text-[0.6rem] font-black text-muted-foreground`}>L</span>;
  }
  return <LeagueLogo league={league} size={size} fallback={<span className={`grid ${size === "sm" ? "h-6 w-6" : size === "md" ? "h-8 w-8" : "h-10 w-10"} shrink-0 place-items-center rounded-md bg-secondary text-[0.6rem] font-black text-muted-foreground`}>L</span>} />;
}

function LeaguePicker({
  value,
  leagues,
  disabled,
  onChange,
}: {
  value: string;
  leagues: string[];
  disabled: boolean;
  onChange: (league: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLeague = value || "";

  return (
    <div className="relative">
      <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Liga</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2.5 text-left text-sm outline-none transition hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LeagueBadge league={selectedLeague} />
        <span className="min-w-0 flex-1 truncate">{selectedLeague || "Cualquier liga"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && (
        <div className="absolute inset-x-0 z-30 mt-2 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-secondary ${!value ? "bg-secondary/70" : ""}`}
          >
            <LeagueBadge league="" size="md" />
            <span className="min-w-0 flex-1 truncate font-semibold">Cualquier liga</span>
            {!value && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>
          {leagues.map((league) => (
            <button
              key={league}
              type="button"
              onClick={() => {
                onChange(league);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-secondary ${value === league ? "bg-secondary/70" : ""}`}
            >
              <LeagueBadge league={league} />
              <span className="min-w-0 flex-1 truncate text-xs font-bold">{league}</span>
              {value === league && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoutingPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const myTeamId = usePlayersStore((state) => state.myTeamId);
  const budget = usePlayersStore((state) => state.budget);
  const currentDate = usePlayersStore((state) => state.currentDate);
  const rawPlayers = usePlayersStore((state) => state.getRawPlayers?.() || []);
  const spendBudget = usePlayersStore((state) => state.spendBudget);
  const [positionFilter, setPositionFilter] = useState<PosCode | "">("");
  const [minOvr, setMinOvr] = useState("");
  const [maxOvr, setMaxOvr] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [nationFilter, setNationFilter] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("");
  const [clubStatus, setClubStatus] = useState<"all" | "free">("all");
  const [sortBy, setSortBy] = useState<"ovr" | "age">("ovr");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const RESULTS_PER_PAGE = 20;
  const [reportEntry, setReportEntry] = useState<ScoutingEntry | null>(null);
  const [reportData, setReportData] = useState<ScoutingReport | null>(null);
  const [dismissScoutOpen, setDismissScoutOpen] = useState(false);

  useEffect(() => {
    const save = loadSave();
    if (!save) navigate({ to: "/" });
  }, [navigate]);

  const state = useMemo(() => (ready ? getScoutingState(currentDate) : null), [ready, currentDate, refresh]);
  const assignments = useMemo(() => (ready ? listScouting(currentDate) : []), [ready, currentDate, refresh]);
  const hiredScout = state?.hiredScout ?? null;
  const catalog = state?.catalog ?? [];

  const pendingCount = assignments.filter((item) => item.status === "pending").length;
  const scoutCapacity = hiredScout ? getScoutSlots(hiredScout.id, hiredScout.rating) : 0;
  const availableScoutSlots = Math.max(0, scoutCapacity - pendingCount);
  const hasAvailableScoutSlot = availableScoutSlots > 0;

  const nationOptions = useMemo(
    () => Array.from(new Set((rawPlayers as FcPlayer[]).map((player) => player.Nation).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "es")),
    [rawPlayers],
  );
  const leagueOptions = useMemo(() => {
    const leagues = Object.values(LEAGUES).map((league) => league.name);
    const majorLeagues = [
      "LALIGA EA SPORTS",
      "Premier League",
      "Bundesliga",
      "Serie A Enilive",
      "Ligue 1 McDonald's",
    ];
    return leagues.sort((a, b) => {
      const aIndex = majorLeagues.indexOf(a);
      const bIndex = majorLeagues.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }
      return a.localeCompare(b, "es");
    });
  }, []);

  const hasSearchCriteria = Boolean(
    positionFilter ||
      minOvr.trim() ||
      maxOvr.trim() ||
      minAge.trim() ||
      maxAge.trim() ||
      nationFilter ||
      leagueFilter ||
      clubStatus !== "all",
  );

  const hasSearched = Boolean(hiredScout && hasSearchCriteria);

  const availableSearchPlayers = useMemo(() => {
    if (!hasSearched) return [];

    const minOvrValue = optionalNumber(minOvr);
    const maxOvrValue = optionalNumber(maxOvr);
    const minAgeValue = optionalNumber(minAge);
    const maxAgeValue = optionalNumber(maxAge);
    const roster = new Set(usePlayersStore.getState().rosterIds);
    const assigned = new Set(assignments.map((entry) => entry.playerId));
    const multiplier = sortDirection === "asc" ? 1 : -1;

    return (rawPlayers as FcPlayer[])
      .filter((player) => !roster.has(String(player.ID)) && !assigned.has(String(player.ID)))
      .filter((player) => {
        const positions = buildPositions(player.Position, player["Alternative positions"]);
        if (positionFilter && !positions.includes(positionFilter)) return false;
        if (minOvrValue !== null && Number(player.OVR) < minOvrValue) return false;
        if (maxOvrValue !== null && Number(player.OVR) > maxOvrValue) return false;
        if (minAgeValue !== null && Number(player.Age) < minAgeValue) return false;
        if (maxAgeValue !== null && Number(player.Age) > maxAgeValue) return false;
        if (nationFilter && (player.Nation ?? "") !== nationFilter) return false;
        if (leagueFilter && player.League !== leagueFilter) return false;
        if (clubStatus === "free" && clubOfPlayer(String(player.ID)) !== null) return false;
        return true;
      })
      .sort((a, b) => {
        const aValue = sortBy === "ovr" ? Number(a.OVR) : Number(a.Age);
        const bValue = sortBy === "ovr" ? Number(b.OVR) : Number(b.Age);
        const valueDifference = (Number.isFinite(aValue) ? aValue : 0) - (Number.isFinite(bValue) ? bValue : 0);
        if (valueDifference !== 0) return valueDifference * multiplier;
        return a.Name.localeCompare(b.Name, "es");
      });
  }, [assignments, clubStatus, hasSearched, leagueFilter, maxAge, maxOvr, minAge, minOvr, nationFilter, positionFilter, rawPlayers, sortBy, sortDirection]);

  const totalSearchPages = Math.max(1, Math.ceil(availableSearchPlayers.length / RESULTS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalSearchPages);
  const paginatedSearchPlayers = availableSearchPlayers.slice(
    (safeCurrentPage - 1) * RESULTS_PER_PAGE,
    safeCurrentPage * RESULTS_PER_PAGE,
  );

  const selectedReportPlayer = reportEntry
    ? ((rawPlayers as FcPlayer[]).find((player) => String(player.ID) === reportEntry.playerId) ?? null)
    : null;

  function refreshPage() {
    ensureScoutingState(currentDate);
    setRefresh((value) => value + 1);
  }

  function handleHire(scout: ScoutCandidate) {
    if (hiredScout) {
      toast.error(`Ya tienes contratado a ${hiredScout.name}.`);
      return;
    }
    if (budget < scout.cost) {
      toast.error("No tienes presupuesto suficiente para contratar a este ojeador.", {
        description: `Necesitas ${formatEuro(scout.cost)} y dispones de ${formatEuro(budget)}.`,
      });
      return;
    }

    const result = hireScout(scout.id, currentDate);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    if (!spendBudget(scout.cost)) {
      releaseHiredScout();
      toast.error("No se pudo descontar el coste de contratación.");
      return;
    }
    toast.success(`${scout.name} se ha incorporado al club`, {
      description: `${scout.rating.toLocaleString("es-ES")} estrellas · ${getScoutSlots(scout.id, scout.rating)} ojeos simultáneos.`,
    });
    refreshPage();
  }

  function handleDismissScout() {
    const scout = dismissHiredScout();
    if (!scout) return;
    setDismissScoutOpen(false);
    toast.success(`${scout.name} ha sido despedido`, {
      description: "Este ojeador ya no podrá volver a contratarse.",
    });
    refreshPage();
  }

  function resetSearch() {
    setPositionFilter("");
    setMinOvr("");
    setMaxOvr("");
    setMinAge("");
    setMaxAge("");
    setNationFilter("");
    setLeagueFilter("");
    setClubStatus("all");
    setSortBy("ovr");
    setSortDirection("desc");
    setCurrentPage(1);
    setSearchDialogOpen(false);
  }

  function renderSearchResultPlayer(player: FcPlayer) {
    const positions = buildPositions(player.Position, player["Alternative positions"]);
    const entry = assignments.find((item) => item.playerId === String(player.ID));
    const playerFace = faceUrl(String(player.ID), player.card);
    const scoutBlocked = !entry && !hasAvailableScoutSlot;

    return (
      <div
        key={player.ID}
        className="rounded-2xl border border-border/60 bg-card/60 p-3.5 shadow-sm"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-secondary/50">
              {playerFace ? (
                <img
                  src={playerFace}
                  alt={player.Name}
                  className="h-full w-full object-cover object-top"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-[0.55rem] font-black text-muted-foreground">
                  SIN FOTO
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-black">{player.Name}</p>
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.62rem] font-black text-primary">
                  {player.OVR}
                </span>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                {clubOfPlayer(String(player.ID)) === null ? (
                  <span className="inline-flex items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[0.6rem] font-bold text-emerald-300">
                    Agente libre
                  </span>
                ) : (
                  <>
                    <TeamLogo teamName={player.Team} leagueName={player.League} size={28} />
                    <span className="truncate font-semibold text-foreground">{player.Team}</span>
                  </>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.62rem] text-muted-foreground">
                <span>{formatShortPositions(positions.slice(0, 2))}</span>
                <span>·</span>
                <LeagueBadge league={player.League} />
                <span className="truncate">{player.League || "Liga desconocida"}</span>
                <span>·</span>
                <CountryFlag country={player.Nation || ""} size="sm" />
                <span>{player.Nation || "Nacionalidad desconocida"}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="min-w-[64px] rounded-xl border border-border/40 bg-secondary/30 px-2.5 py-2 text-center">
              <p className="text-[0.5rem] font-black uppercase tracking-wider text-muted-foreground">Media</p>
              <p className="mt-0.5 scoreline font-black">{player.OVR}</p>
            </div>
            <div className="min-w-[64px] rounded-xl border border-border/40 bg-secondary/30 px-2.5 py-2 text-center">
              <p className="text-[0.5rem] font-black uppercase tracking-wider text-muted-foreground">Edad</p>
              <p className="mt-0.5 scoreline font-black">{player.Age}</p>
            </div>
            <div className="flex min-w-[118px] flex-col items-stretch gap-1">
              <button
                type="button"
                disabled={!!entry || scoutBlocked}
                onClick={() => handleScoutPlayer(String(player.ID), player.Name)}
                title={scoutBlocked ? "No hay huecos de ojeo disponibles" : undefined}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                {entry ? "En ojeo" : scoutBlocked ? "Sin huecos" : "Ojear"}
              </button>
              {scoutBlocked && (
                <span className="text-center text-[0.55rem] font-semibold leading-tight text-amber-300">
                  No quedan huecos de ojeo.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function handleScoutPlayer(playerId: string, playerName: string) {
    if (!hiredScout) {
      toast.error("Contrata un ojeador antes de enviar jugadores.");
      return;
    }

    const result = startScouting(playerId, currentDate);
    if (!result.ok) {
      toast.error(result.reason);
      refreshPage();
      return;
    }

    const days = getScoutCapabilities(result.entry.scoutRating);
    toast.success(`${playerName} añadido al plan de ojeo`, {
      description: `El informe estará listo en ${days.minDays}–${days.maxDays} días.`,
    });
    refreshPage();
  }

  function handleRemove(playerId: string) {
    removeScouting(playerId);
    toast.success("Jugador retirado de la lista de ojeo.");
    refreshPage();
  }

  function handleViewReport(entry: ScoutingEntry) {
    const player = (rawPlayers as FcPlayer[]).find((candidate) => String(candidate.ID) === entry.playerId);
    if (!player) {
      toast.error("No se ha podido encontrar al jugador para generar el informe.");
      return;
    }

    try {
      const generatedReport = scoutPlayer(entry.playerId, myTeamId, currentDate);
      if (!generatedReport) {
        toast.error("No se ha podido generar el informe de ojeador.");
        return;
      }
      setReportData(generatedReport);
      setReportEntry(entry);
    } catch {
      toast.error("No se ha podido generar el informe de ojeador.", {
        description: "El informe ha encontrado un dato no disponible. Puedes volver a intentarlo.",
      });
    }
  }

  if (!myTeamId) return null;
  if (loading || !ready) {
    return <div className="p-4 md:p-6">Cargando ojeadores…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="panel-glow overflow-hidden">
        <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Mi equipo · Staff</p>
            <h1 className="mt-1 text-2xl font-black md:text-3xl">Ojeador</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Contrata un profesional del catálogo mensual y úsalo para investigar jugadores con una precisión que mejora según su valoración.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
              <p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">Presupuesto</p>
              <p className="mt-1 scoreline text-base font-black text-primary">{formatEuro(budget)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
              <p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">Ojeos activos</p>
              <p className="mt-1 scoreline text-base font-black">{assignments.filter((item) => item.status === "pending").length} / {hiredScout ? getScoutSlots(hiredScout.id, hiredScout.rating) : 0}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 col-span-2 sm:col-span-1">
              <p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">Nuevo catálogo</p>
              <p className="mt-1 scoreline text-base font-black text-primary">{daysUntilNextCatalog(currentDate)} días</p>
              <p className="mt-0.5 text-[0.58rem] text-muted-foreground">Renueva el {nextCatalogDateLabel(currentDate)}</p>
            </div>
          </div>
        </div>
      </div>

      {!hiredScout ? (
        <section className="rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-card to-card p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black">Tu club no dispone de ojeadores</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Contrata uno del catálogo de este mes para poder iniciar ojeos de jugadores.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-black">Ojeador del club</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">{hiredScout.name}</span>
                  <CountryFlag country={hiredScout.country} size="sm" />
                  <span>{hiredScout.country}</span>
                  <ScoutStars rating={hiredScout.rating} />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs">
                <p className="text-muted-foreground">Beneficios</p>
                <p className="mt-1 font-black">{getScoutSlots(hiredScout.id, hiredScout.rating)} simultáneos · {getScoutCapabilities(hiredScout.rating).minDays}–{getScoutCapabilities(hiredScout.rating).maxDays} días · {getScoutCapabilities(hiredScout.rating).fieldsDetected}/5 campos · precisión {getScoutCapabilities(hiredScout.rating).precision.toLocaleString("es-ES")}/5</p>
              </div>
              <button
                type="button"
                onClick={() => setDismissScoutOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs font-black text-destructive transition hover:bg-destructive/10"
              >
                <UserRoundX className="h-3.5 w-3.5" />
                Despedir
              </button>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-black">Catálogo del mes</h2>
            <p className="text-xs text-muted-foreground">Cada mes aparecen 5 ojeadores nuevos con valoración y precio propios.</p>
          </div>
          <span className="rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 text-[0.65rem] font-bold">5 candidatos</span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {catalog.map((scout) => (
            <ScoutCard
              key={scout.id}
              scout={scout}
              hired={hiredScout?.id === scout.id}
              blockedByExisting={!!hiredScout && hiredScout.id !== scout.id}
              dismissed={state?.dismissedScoutIds.includes(scout.id) ?? false}
              onHire={handleHire}
            />
          ))}
        </div>
        <p className="mt-3 text-[0.65rem] text-muted-foreground">
          Los retratos son avatares ficticios integrados localmente para que el catálogo no dependa de servicios externos.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Buscar por criterios</h2>
              <p className="mt-1 text-xs text-muted-foreground">Define el perfil que buscas y los resultados se actualizan automáticamente sobre toda la base de jugadores disponible.</p>
            </div>
            <Filter className="h-5 w-5 shrink-0 text-primary" />
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label>
                <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Posición</span>
                <select
                  value={positionFilter}
                  onChange={(event) => setPositionFilter(event.target.value as PosCode | "")}
                  disabled={!hiredScout}
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Cualquier posición</option>
                  {ALL_POS_CODES.map((code) => (
                    <option key={code} value={code}>{POS_NAME[code]} ({code})</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Situación</span>
                <select
                  value={clubStatus}
                  onChange={(event) => {
                    const value = event.target.value as "all" | "free";
                    setClubStatus(value);
                    if (value === "free") setLeagueFilter("");
                  }}
                  disabled={!hiredScout}
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="all">Todos los jugadores</option>
                  <option value="free">Solo agentes libres</option>
                </select>
              </label>

              <div className={clubStatus === "free" ? "opacity-50" : ""}>
                <LeaguePicker
                  value={leagueFilter}
                  leagues={leagueOptions}
                  disabled={!hiredScout || clubStatus === "free"}
                  onChange={setLeagueFilter}
                />
              </div>

              <label>
                <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Nacionalidad</span>
                <select
                  value={nationFilter}
                  onChange={(event) => setNationFilter(event.target.value)}
                  disabled={!hiredScout}
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Cualquier nacionalidad</option>
                  {nationOptions.map((nation) => <option key={nation} value={nation}>{nation}</option>)}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Media mínima</span>
                <input
                  type="number" min="1" max="99" value={minOvr} onChange={(event) => setMinOvr(event.target.value)}
                  disabled={!hiredScout} placeholder="Ej. 75"
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Media máxima</span>
                <input
                  type="number" min="1" max="99" value={maxOvr} onChange={(event) => setMaxOvr(event.target.value)}
                  disabled={!hiredScout} placeholder="Ej. 85"
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Edad mínima</span>
                <input
                  type="number" min="15" max="50" value={minAge} onChange={(event) => setMinAge(event.target.value)}
                  disabled={!hiredScout} placeholder="Ej. 18"
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Edad máxima</span>
                <input
                  type="number" min="15" max="50" value={maxAge} onChange={(event) => setMaxAge(event.target.value)}
                  disabled={!hiredScout} placeholder="Ej. 23"
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Ordenar por</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as "ovr" | "age")}
                  disabled={!hiredScout}
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="ovr">Media</option>
                  <option value="age">Edad</option>
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Orden</span>
                <select
                  value={sortDirection}
                  onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}
                  disabled={!hiredScout}
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="asc">Ascendente</option>
                  <option value="desc">Descendente</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end">
            <button
              type="button"
              onClick={resetSearch}
              disabled={!hasSearchCriteria && !hasSearched}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-black text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpiar filtros
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-border/60 bg-secondary/15 px-4 py-4">
            {hasSearched ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-black">{availableSearchPlayers.length.toLocaleString("es-ES")} jugadores cumplen los criterios.</p>
                <button
                  type="button"
                  onClick={() => setSearchDialogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-black text-primary hover:bg-primary/15"
                >
                  <Search className="h-3.5 w-3.5" />
                  Ver resultados
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Define al menos un criterio para buscar jugadores.</p>
            )}
          </div>
        </div>

        <div className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Plan de ojeo</h2>
              <p className="mt-1 text-xs text-muted-foreground">Aquí aparecerán los jugadores en investigación y los informes terminados.</p>
            </div>
            <Clock3 className="h-5 w-5 text-primary shrink-0" />
          </div>

          <div className="mt-4 space-y-2">
            {assignments.length === 0 ? (
              <div className="rounded-xl border border-border/50 bg-secondary/20 p-6 text-center text-xs text-muted-foreground">No hay ningún jugador en el plan de ojeo.</div>
            ) : (
              assignments.map((entry) => {
                const player = (rawPlayers as FcPlayer[]).find((candidate) => String(candidate.ID) === entry.playerId);
                if (!player) return null;
                const pending = entry.status === "pending";
                return (
                  <div key={entry.playerId} className="rounded-xl border border-border/50 bg-card/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{player.Name}</p>
                      </div>
                      <button type="button" onClick={() => handleRemove(entry.playerId)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive" aria-label={`Quitar a ${player.Name}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      {pending ? (
                        <span className="inline-flex items-center gap-1.5 text-primary font-bold"><Clock3 className="h-3.5 w-3.5 animate-pulse" /> {daysRemaining(entry, currentDate)} días restantes</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-emerald-300 font-bold"><Eye className="h-3.5 w-3.5" /> Informe listo</span>
                      )}
                      {!pending && <button type="button" onClick={() => handleViewReport(entry)} className="rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground hover:brightness-110">Ver informe</button>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="max-w-4xl overflow-hidden p-0">
          <div className="flex max-h-[74vh] flex-col">
            <DialogHeader className="border-b border-border/60 px-5 py-5 pr-14">
              <DialogTitle className="text-xl font-black">Resultados de la búsqueda</DialogTitle>
              <DialogDescription>
                {availableSearchPlayers.length.toLocaleString("es-ES")} jugadores cumplen los criterios.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {paginatedSearchPlayers.length === 0 ? (
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-10 text-center text-sm text-muted-foreground">
                  No hay jugadores que cumplan los criterios de búsqueda.
                </div>
              ) : (
                <div className="space-y-2">
                  {paginatedSearchPlayers.map(renderSearchResultPlayer)}
                </div>
              )}
            </div>

            {availableSearchPlayers.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-black hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <p className="text-xs font-bold text-muted-foreground">
                  Página {safeCurrentPage} de {totalSearchPages}
                </p>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalSearchPages, page + 1))}
                  disabled={safeCurrentPage >= totalSearchPages}
                  className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-black hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dismissScoutOpen} onOpenChange={setDismissScoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Despedir a {hiredScout?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              El ojeador abandonará el club. Después de despedirlo, este mismo ojeador quedará bloqueado y no podrás contratarlo de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDismissScout}>
              Despedir ojeador
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedReportPlayer && reportEntry && (
        <ScoutingReportBoundary player={selectedReportPlayer} reportEntry={reportEntry}>
          <ScoutingDetailsModal
            player={selectedReportPlayer}
            report={reportData}
            scoutingEntry={reportEntry}
            open={!!reportEntry}
            onClose={() => { setReportEntry(null); setReportData(null); }}
          />
        </ScoutingReportBoundary>
      )}
    </div>
  );
}

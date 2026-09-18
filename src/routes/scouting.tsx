import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Eye,
  Filter,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
  UserRoundX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { loadSave } from "@/lib/store";
import { usePlayersReady } from "@/components/PlayersLoading";
import { CountryFlag } from "@/components/CountryFlag";
import { LeagueLogo } from "@/components/LeagueLogo";
import { LEAGUES } from "@/data/teams";
import { formatEuro, marketValueEuros, usePlayersStore, type FcPlayer } from "@/store/playersStore";
import {
  ensureScoutingState,
  dismissHiredScout,
  getScoutCapabilities,
  getScoutingState,
  hireScout,
  listScouting,
  releaseHiredScout,
  removeScouting,
  startScoutingBatch,
  type ScoutCandidate,
  type ScoutRating,
  type ScoutingEntry,
} from "@/lib/transfers/Scouting";
import { ScoutingDetailsModal } from "@/components/market/ScoutingDetailsModal";
import { scoutPlayer } from "@/lib/transfers/UserNegotiation";
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

export const Route = createFileRoute("/scouting")({ component: ScoutingPage });

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
            <p className="font-black">{capabilities.slots} simultáneo{capabilities.slots === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border/50 bg-secondary/30 p-2.5">
            <p className="text-muted-foreground">Informe</p>
            <p className="mt-1 font-black">{capabilities.minDays}–{capabilities.maxDays} días</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-secondary/30 p-2.5">
            <p className="text-muted-foreground">Precisión</p>
            <p className="mt-1 font-black">{scout.rating >= 4.5 ? "Muy alta" : scout.rating >= 3 ? "Alta" : scout.rating >= 2 ? "Media" : "Básica"}</p>
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
  const [maxAge, setMaxAge] = useState("");
  const [minPotential, setMinPotential] = useState("");
  const [maxValueM, setMaxValueM] = useState("");
  const [nationFilter, setNationFilter] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("");
  const [scanQuantity, setScanQuantity] = useState("1");
  const [refresh, setRefresh] = useState(0);
  const [reportEntry, setReportEntry] = useState<ScoutingEntry | null>(null);
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
  const scoutCapabilities = hiredScout ? getScoutCapabilities(hiredScout.rating) : null;
  const remainingCapacity = Math.max(0, (scoutCapabilities?.slots ?? 0) - pendingCount);

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
      maxAge.trim() ||
      minPotential.trim() ||
      maxValueM.trim() ||
      nationFilter ||
      leagueFilter,
  );

  const candidateSearch = useMemo(() => {
    if (!ready || !hiredScout || !hasSearchCriteria) {
      return { total: 0, ids: [] as string[] };
    }

    const minOvrValue = optionalNumber(minOvr);
    const maxAgeValue = optionalNumber(maxAge);
    const minPotentialValue = optionalNumber(minPotential);
    const maxValueValue = optionalNumber(maxValueM);
    const roster = new Set(usePlayersStore.getState().rosterIds);
    const assigned = new Set(assignments.map((entry) => entry.playerId));

    const ids = (rawPlayers as FcPlayer[])
      .filter((player) => !roster.has(String(player.ID)) && !assigned.has(String(player.ID)))
      .filter((player) => {
        const positions = buildPositions(player.Position, player["Alternative positions"]);
        if (positionFilter && !positions.includes(positionFilter)) return false;

        const safePotential = Number(player.potential ?? player.OVR);
        if (minOvrValue !== null && player.OVR < minOvrValue) return false;
        if (maxAgeValue !== null && player.Age > maxAgeValue) return false;
        if (minPotentialValue !== null && safePotential < minPotentialValue) return false;
        if (nationFilter && (player.Nation ?? "") !== nationFilter) return false;
        if (leagueFilter && player.League !== leagueFilter) return false;

        const marketValue = marketValueEuros(player);
        if (maxValueValue !== null && marketValue > maxValueValue * 1_000_000) return false;
        return true;
      })
      .map((player) => String(player.ID));

    return { total: ids.length, ids };
  }, [
    assignments,
    hasSearchCriteria,
    hiredScout,
    leagueFilter,
    maxAge,
    maxValueM,
    minOvr,
    minPotential,
    nationFilter,
    positionFilter,
    rawPlayers,
    ready,
  ]);

  const activeCapacity = scoutCapabilities?.slots ?? 0;
  const requestedQuantity = optionalNumber(scanQuantity);
  const normalizedRequestedQuantity = requestedQuantity === null ? 0 : Math.floor(requestedQuantity);
  const quantityIsValid = normalizedRequestedQuantity >= 1;
  const quantityExceedsScoutCapacity = normalizedRequestedQuantity > activeCapacity;
  const quantityExceedsRemainingCapacity = normalizedRequestedQuantity > remainingCapacity;
  const quantityExceedsMatches = normalizedRequestedQuantity > candidateSearch.total;
  const requestedQuantityBlocked = !quantityIsValid || quantityExceedsScoutCapacity || quantityExceedsRemainingCapacity || quantityExceedsMatches;

  function pickRandomPlayerIds(ids: string[], quantity: number): string[] {
    const shuffled = [...ids];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled.slice(0, quantity);
  }

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
      // Rollback para no perder dinero si otra pestaña cambió el presupuesto
      // entre la comprobación y el descuento real.
      releaseHiredScout();
      toast.error("No se pudo descontar el coste de contratación.");
      return;
    }
    toast.success(`${scout.name} se ha incorporado al club`, {
      description: `${scout.rating.toLocaleString("es-ES")} estrellas · ${getScoutCapabilities(scout.rating).slots} ojeos simultáneos.`,
    });
    refreshPage();
  }

  function handleDismissScout() {
    const scout = dismissHiredScout();
    if (!scout) return;
    setDismissScoutOpen(false);
    toast.success(`${scout.name} ha sido despedido`, {
      description: "Este ojeador ya no podrá volver a contratarse."
    });
    refreshPage();
  }

  function resetSearch() {
    setPositionFilter("");
    setMinOvr("");
    setMaxAge("");
    setMinPotential("");
    setMaxValueM("");
    setNationFilter("");
    setLeagueFilter("");
    setScanQuantity("1");
  }

  function handleStartBatch() {
    if (!hiredScout || !hasSearchCriteria) return;

    const requested = normalizedRequestedQuantity;
    if (requested < 1) {
      toast.error("Indica cuántos jugadores quieres ojear.");
      return;
    }
    if (requested > activeCapacity) {
      toast.error(`Este ojeador solo admite ${activeCapacity} ojeo${activeCapacity === 1 ? "" : "s"} simultáneo${activeCapacity === 1 ? "" : "s"}.`);
      return;
    }
    if (requested > remainingCapacity) {
      toast.error(`Solo quedan ${remainingCapacity} hueco${remainingCapacity === 1 ? "" : "s"} disponible${remainingCapacity === 1 ? "" : "s"}.`);
      return;
    }
    if (candidateSearch.total === 0) {
      toast.error("No hay jugadores que cumplan esos criterios.");
      return;
    }

    const playerIds = pickRandomPlayerIds(candidateSearch.ids, requested);
    const result = startScoutingBatch(playerIds, currentDate);
    if (!result.ok) {
      toast.error(result.reason);
      refreshPage();
      return;
    }

    const days = getScoutCapabilities(result.entries[0].scoutRating);
    toast.success(`${result.entries.length} jugador${result.entries.length === 1 ? "" : "es"} añadido${result.entries.length === 1 ? "" : "s"} al plan de ojeo`, {
      description: `El informe estará listo en ${days.minDays}–${days.maxDays} días.`,
    });
    setScanQuantity("1");
    refreshPage();
  }

  function handleRemove(playerId: string) {
    removeScouting(playerId);
    toast.success("Jugador retirado de la lista de ojeo.");
    refreshPage();
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
              <p className="mt-1 scoreline text-base font-black">{assignments.filter((item) => item.status === "pending").length} / {hiredScout ? getScoutCapabilities(hiredScout.rating).slots : 0}</p>
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
                <p className="mt-1 font-black">{getScoutCapabilities(hiredScout.rating).slots} simultáneos · {getScoutCapabilities(hiredScout.rating).minDays}–{getScoutCapabilities(hiredScout.rating).maxDays} días</p>
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
              <p className="mt-1 text-xs text-muted-foreground">No necesitas decirle un nombre: define el perfil que buscas y el ojeador rastreará toda la base de jugadores.</p>
            </div>
            <Filter className="h-5 w-5 shrink-0 text-primary" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

            <LeaguePicker
              value={leagueFilter}
              leagues={leagueOptions}
              disabled={!hiredScout}
              onChange={setLeagueFilter}
            />

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

            <label>
              <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Media mínima</span>
              <input
                type="number" min="1" max="99" value={minOvr} onChange={(event) => setMinOvr(event.target.value)}
                disabled={!hiredScout} placeholder="Ej. 75"
                className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Edad máxima</span>
              <input
                type="number" min="15" max="50" value={maxAge} onChange={(event) => setMaxAge(event.target.value)}
                disabled={!hiredScout} placeholder="Ej. 23"
                className="w-full rounded-xl border border-border bg-secondary py-3 px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Potencial mínimo</span>
              <input
                type="number" min="1" max="99" value={minPotential} onChange={(event) => setMinPotential(event.target.value)}
                disabled={!hiredScout} placeholder="Ej. 85"
                className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Valor máx. de mercado (M€)</span>
              <input
                type="number" min="0" step="0.1" value={maxValueM} onChange={(event) => setMaxValueM(event.target.value)}
                disabled={!hiredScout} placeholder="Ej. 4"
                className="w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="min-w-0">
              <p className="text-sm font-black">Capacidad del ojeador</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{remainingCapacity} hueco{remainingCapacity === 1 ? "" : "s"} disponible{remainingCapacity === 1 ? "" : "s"} ahora · selección aleatoria entre todos los jugadores que cumplen los criterios.</p>
            </div>
            <div className="flex items-end gap-2">
              <label>
                <span className="mb-1.5 block text-[0.58rem] font-black uppercase tracking-wider text-muted-foreground">Jugadores a ojear</span>
                <input
                  type="number" min="1" max={Math.max(1, activeCapacity)} value={scanQuantity}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (!raw) {
                      setScanQuantity("");
                      return;
                    }
                    const parsed = Math.floor(Number(raw));
                    if (!Number.isFinite(parsed)) return;
                    setScanQuantity(String(Math.min(activeCapacity || 1, Math.max(1, parsed))));
                  }}
                  disabled={!hiredScout || activeCapacity === 0}
                  className="w-24 rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm font-black outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <button
                type="button"
                onClick={handleStartBatch}
                disabled={!hiredScout || !hasSearchCriteria || candidateSearch.total === 0 || requestedQuantityBlocked}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <UserRoundPlus className="h-3.5 w-3.5" /> Ojear
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.7rem] font-black">{hasSearchCriteria ? `${candidateSearch.total.toLocaleString("es-ES")} jugadores cumplen los criterios` : "Define al menos un criterio para buscar."}</p>
              {hiredScout && hasSearchCriteria && candidateSearch.total > 0 && (
                <p className="mt-1 text-[0.63rem] text-muted-foreground">No se muestran los candidatos: el ojeador elige jugadores al azar entre las coincidencias.</p>
              )}
            </div>
            <button
              type="button"
              onClick={resetSearch}
              disabled={!hasSearchCriteria}
              className="rounded-lg border border-border bg-card px-3 py-2 text-[0.65rem] font-black text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpiar filtros
            </button>
          </div>

          {hiredScout && hasSearchCriteria && requestedQuantityBlocked && (
            <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-[0.65rem] font-bold text-amber-200">
              {quantityExceedsScoutCapacity
                ? `Has pedido ${normalizedRequestedQuantity} jugadores, pero este ojeador admite como máximo ${activeCapacity} simultáneos. Reduce la cantidad para desbloquear «Ojear».`
                : quantityExceedsRemainingCapacity
                  ? `Has pedido ${normalizedRequestedQuantity} jugadores, pero solo quedan ${remainingCapacity} huecos libres. Reduce la cantidad para desbloquear «Ojear».`
                  : quantityExceedsMatches
                    ? `Has pedido ${normalizedRequestedQuantity} jugadores, pero solo hay ${candidateSearch.total} jugadores que cumplen los criterios. Reduce la cantidad para desbloquear «Ojear».`
                    : "Indica una cantidad válida de jugadores para desbloquear «Ojear»."}
            </p>
          )}

          {!hasSearchCriteria && (
            <div className="mt-3 rounded-xl border border-dashed border-border/70 bg-secondary/20 p-5 text-center text-xs text-muted-foreground">Por ejemplo: <span className="font-bold text-foreground">ED/RW · menos de 4 M€ · 21 años o menos</span>.</div>
          )}
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
                        <p className="mt-0.5 text-xs text-muted-foreground">Ojeador: {entry.scoutRating.toLocaleString("es-ES")} estrellas</p>
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
                      {!pending && <button type="button" onClick={() => setReportEntry(entry)} className="rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground hover:brightness-110">Ver informe</button>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-border/50 bg-card/40 p-4 text-xs text-muted-foreground">
        <p className="font-bold text-foreground">Progresión de calidad</p>
        <p className="mt-1">Un ojeador de 0,5 estrellas permite 1 jugador simultáneo y tarda 12–15 días. Un ojeador de 5 estrellas permite 10 simultáneos y tarda 2–4 días; entre ambos puntos la capacidad, la velocidad y la precisión aumentan gradualmente.</p>
      </div>

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
        <ScoutingDetailsModal
          player={selectedReportPlayer}
          report={scoutPlayer(reportEntry.playerId, myTeamId, currentDate)}
          scoutingEntry={reportEntry}
          open={!!reportEntry}
          onClose={() => setReportEntry(null)}
        />
      )}
    </div>
  );
}

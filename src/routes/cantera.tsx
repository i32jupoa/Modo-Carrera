import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  GraduationCap,
  GitCompareArrows,
  Search,
  SearchCode,
  Settings2,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { teamById, LEAGUES } from "@/data/teams";
import { PlayerDetailDialog } from "@/components/PlayerDetailDialog";
import { ContractNegotiationModal } from "@/components/contracts/ContractNegotiationModal";
import { LoanSearchModal } from "@/components/LoanSearchModal";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";
import { loadSave, saveSave } from "@/lib/store";
import { usePlayersStore } from "@/store/playersStore";
import { academyPlayerToFcPlayer, academyPlayerToStats, academyContract } from "@/lib/academy/academyAdapters";
import { useAcademyStore } from "@/lib/academy/academyStore";
import { ACADEMY_FACILITIES, ACADEMY_LIMITS } from "@/lib/academy/academyConstants";
import type { AcademyPlayer } from "@/lib/academy/academyTypes";
import { analyzeSquad } from "@/lib/transfers/SquadAnalyzer";
import { getPlayer } from "@/lib/transfers";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { POS_SHORT, POSITION_GROUP_ORDER, positionGroupFromCode, sortByPositionGroupAndOvr } from "@/lib/positions";

export const Route = createFileRoute("/cantera")({ component: AcademyPage });

function seasonFromDate(date: string): number {
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : 2026;
}

function potentialLabel(player: AcademyPlayer): string {
  return `${Math.round(player.potentialEstimate.min)}–${Math.round(player.potentialEstimate.max)}`;
}

function growthLabel(player: AcademyPlayer): string {
  if (player.traits.includes("diamond")) return "Diamante en bruto";
  if (player.traits.includes("late-bloomer")) return "Late bloomer";
  if (player.traits.includes("early")) return "Talento precoz";
  if (player.traits.includes("hard-worker")) return "Trabajador";
  return "Proyecto";
}

function AcademyCard({ player, onClick }: { player: AcademyPlayer; onClick: () => void }) {
  const position = POS_SHORT[player.positions[0] ?? "MC"] ?? "MC";
  const firstTeamStats = usePlayersStore((state) => state.stats[String(player.id)]);
  const firstTeamAppearances = Number(firstTeamStats?.appearances ?? firstTeamStats?.dynamicStats?.seasonAppearances ?? 0);
  const firstTeamRating = Number(firstTeamStats?.dynamicStats?.seasonAverageRating ?? 0);
  const role = roleFromPosition(player.positions[0] ?? "MC");
  const visibleOvr = Math.round(Number(player.internalOvr ?? player.ovr));
  const ready = player.age >= ACADEMY_LIMITS.professionalPromotionMinAge && visibleOvr >= 55;
  const ovr = visibleOvr;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-3 text-left transition hover:border-primary/40 hover:bg-card/80"
    >
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent" />
      <div className="relative flex gap-3">
        <PlayerFace name={player.name} role={role} size={58} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{player.name}</p>
              <p className="mt-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-muted-foreground">
                {position} · {player.age} años · {player.nation}
              </p>
            </div>
            <span className="scoreline rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-lg font-black text-primary">{ovr}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[0.58rem] font-bold">
            <span className="rounded-full border border-border/50 bg-secondary/70 px-2 py-1">POT {potentialLabel(player)}</span>
            <span className="rounded-full border border-border/50 bg-secondary/70 px-2 py-1">{growthLabel(player)}</span>
            {(player.academyStats?.appearances ?? 0) > 0 && <span className="rounded-full border border-border/50 bg-secondary/70 px-2 py-1">PJ cantera {player.academyStats?.appearances ?? 0} · {player.academyStats?.averageRating.toFixed(1)}</span>}
            {player.status === "called-up" && firstTeamAppearances > 0 && <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-blue-300">PJ primer equipo {firstTeamAppearances}{firstTeamRating > 0 ? ` · ${firstTeamRating.toFixed(1)}` : ""}</span>}
            {ready && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">Listo</span>}
            {player.status === "loaned" && <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-blue-300">Cedido</span>}
            {player.status === "listed" && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-300">En venta</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function AcademyPage() {
  const myTeamId = usePlayersStore((state) => state.myTeamId);
  const currentDate = usePlayersStore((state) => state.currentDate);
  const team = myTeamId ? teamById(myTeamId) : null;
  const userSquad = usePlayersStore((state) => state.squad);
  const academy = useAcademyStore((state) => myTeamId ? state.clubs[myTeamId] : undefined);
  const ensureClub = useAcademyStore((state) => state.ensureClub);
  const promoteForUser = useAcademyStore((state) => state.promoteForUser);
  const callUpForUser = useAcademyStore((state) => state.callUpForUser);
  const uncallForUser = useAcademyStore((state) => state.uncallForUser);
  const prepareForInternalContractNegotiation = useAcademyStore((state) => state.prepareForInternalContractNegotiation);
  const releaseForUser = useAcademyStore((state) => state.releaseForUser);
  const renewYouthContract = useAcademyStore((state) => state.renewYouthContract);
  const addAnnualIntake = useAcademyStore((state) => state.addAnnualIntake);
  const upgradeFacilities = useAcademyStore((state) => state.upgradeFacilities);
  const upgradeYouthCoach = useAcademyStore((state) => state.upgradeYouthCoach);
  const setLoanSearchForUser = useAcademyStore((state) => state.setLoanSearchForUser);
  const toggleTransferListForUser = useAcademyStore((state) => state.toggleTransferListForUser);
  const { isMarketOpen } = useTransferMarket();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionPlayerId, setActionPlayerId] = useState<number | null>(null);
  const [contractKind, setContractKind] = useState<"promotion" | "youth-renewal" | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [sort, setSort] = useState<"ovr" | "potential" | "age">("ovr");
  const [compareId, setCompareId] = useState<number | null>(null);
  const [loanSearchPlayerId, setLoanSearchPlayerId] = useState<number | null>(null);
  const [loanSearchListed, setLoanSearchListed] = useState(false);
  const [upgradeType, setUpgradeType] = useState<"facility" | "coach" | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [releaseConfirmId, setReleaseConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!myTeamId) return;
    let cancelled = false;
    setLoading(true);
    void ensureClub(myTeamId, seasonFromDate(currentDate), currentDate).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [currentDate, ensureClub, myTeamId]);

  const players = academy?.players.filter((player) => ["academy", "loaned", "called-up", "listed"].includes(player.status)) ?? [];
  const filtered = useMemo(() => {
    const visible = players.filter((player) => {
      const matchesQuery = !query.trim() || player.name.toLowerCase().includes(query.trim().toLowerCase());
      const matchesPosition = position === "ALL" || player.positions.includes(position as AcademyPlayer["positions"][number]);
      return matchesQuery && matchesPosition;
    });

    const grouped = sortByPositionGroupAndOvr(visible, (player) => player.positions[0] ?? "MC", (player) => player.ovr);
    if (sort === "ovr") return grouped;

    return grouped.slice().sort((a, b) => {
      const groupDiff = POSITION_GROUP_ORDER[positionGroupFromCode(a.positions[0])] - POSITION_GROUP_ORDER[positionGroupFromCode(b.positions[0])];
      if (groupDiff !== 0) return groupDiff;
      if (sort === "potential") return b.potentialEstimate.max - a.potentialEstimate.max || b.ovr - a.ovr;
      return a.age - b.age || b.ovr - a.ovr;
    });
  }, [players, position, query, sort]);

  const selected = selectedId == null ? null : players.find((player) => player.id === selectedId) ?? null;
  const actionPlayer = actionPlayerId == null ? null : players.find((player) => player.id === actionPlayerId) ?? null;
  const selectedStats = usePlayersStore((state) => selectedId != null ? (state.stats[String(selectedId)] ?? undefined) : undefined);
  const selectedUncallBlocked = useMemo(() => {
    if (!selected || selected.status !== "called-up" || !myTeamId) return false;
    const save = loadSave();
    const xi = save?.lineups?.[myTeamId] ?? [];
    const bench = save?.substitutes?.[myTeamId] ?? [];
    return xi.includes(String(selected.id)) || bench.includes(String(selected.id));
  }, [myTeamId, selected, currentDate]);
  const selectedFc = selected && team ? academyPlayerToFcPlayer({
    ...selected,
    ovr: selected.status === "called-up"
      ? Math.round(Number(selectedStats?.dynamicStats?.currentOVR ?? selected.ovr))
      : Math.round(Number(selected.internalOvr ?? selected.ovr)),
    potential: selected.status === "called-up"
      ? Math.round(Number(selectedStats?.dynamicStats?.potentialOVR ?? selected.potential))
      : Math.round(selected.potential),
    attributes: selected.status === "called-up"
      ? (selectedStats?.dynamicStats?.attributes ?? selected.attributes)
      : selected.attributes,
  }, team.name, LEAGUES[team.league]?.name ?? team.league) : null;

  const needsReport = useMemo(() => {
    if (!myTeamId) return null;
    try { return analyzeSquad(myTeamId, currentDate || "academy"); } catch { return null; }
  }, [myTeamId, currentDate]);
  const comparePlayer = compareId == null ? null : players.find((player) => player.id === compareId) ?? null;
  const youngSquad = userSquad.filter((player) => player.Age <= 21 && String(player.ID).startsWith("900"));
  const readyCount = players.filter((player) => player.age >= 18 && Math.round(player.ovr) >= 55).length;
  const highPotentialCount = players.filter((player) => player.potentialEstimate.min >= ACADEMY_LIMITS.notificationPotentialThreshold).length;

  const openContractNegotiation = (kind: "promotion" | "youth-renewal") => {
    if (!selected) return;
    if (kind === "promotion" && selected.age < ACADEMY_LIMITS.professionalPromotionMinAge) {
      toast.error("El canterano todavía no puede firmar un contrato profesional.");
      return;
    }
    prepareForInternalContractNegotiation(selected.id, currentDate);
    setActionPlayerId(selected.id);
    setContractKind(kind);
    setSelectedId(null);
  };

  const handleCallUp = async () => {
    if (!selected) return;
    const player = selected;
    setSelectedId(null);
    const result = await callUpForUser(player.id);
    if (!result.ok) toast.error(result.reason);
    else toast.success(`${player.name} ha sido convocado al primer equipo.`, { description: "Aparecerá en Reservas de Dirección de equipo sin ocupar una plaza de plantilla." });
  };

  const handleUncall = async () => {
    if (!selected) return;
    const player = selected;
    const result = await uncallForUser(player.id, currentDate);
    if (!result.ok) toast.error(result.reason);
    else {
      toast.success(`${player.name} vuelve a la cantera.`, { description: "Su progreso del primer equipo se ha sincronizado y se conserva." });
      setSelectedId(null);
    }
  };

  const handleLoan = () => {
    if (!selected) return;
    if (!isMarketOpen) { toast.error("El mercado está cerrado. La búsqueda de cesión estará disponible en la próxima ventana."); return; }
    const playerId = selected.id;
    const listed = Boolean(getPlayer(String(playerId))?.loanListed);
    setSelectedId(null);
    setLoanSearchPlayerId(playerId);
    setLoanSearchListed(listed);
  };

  const toggleLoanSearch = async () => {
    if (loanSearchPlayerId == null) return;
    const next = !loanSearchListed;
    const result = await setLoanSearchForUser(loanSearchPlayerId, next, currentDate);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    setLoanSearchListed(next);
    toast.success(next ? "Búsqueda de cesión activada." : "Búsqueda de cesión cancelada.");
  };

  const handleSale = async () => {
    if (!selected) return;
    if (!isMarketOpen) { toast.error("El mercado está cerrado. La salida estará disponible en la próxima ventana."); return; }
    const player = selected;
    const result = await toggleTransferListForUser(player.id, currentDate);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    setSelectedId(null);
    if (result.listed) toast.success(`${player.name} puesto en venta.`, { description: "Las ofertas aparecerán en Mercado → Ofertas recibidas." });
    else toast.info(`${player.name} retirado de la lista de transferibles.`);
  };

  const handleRelease = () => {
    if (!selected) return;
    setSelectedId(null);
    setReleaseConfirmId(selected.id);
  };

  const handleConfirmRelease = async () => {
    if (releaseConfirmId == null) return;
    const player = players.find((candidate) => candidate.id === releaseConfirmId);
    if (!player) {
      setReleaseConfirmId(null);
      return;
    }
    const result = await releaseForUser(player.id);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    setReleaseConfirmId(null);
    setSelectedId(null);
    toast.success(`${player.name} ha sido liberado de la cantera.`);
  };

  const handleFacilityUpgrade = async () => {
    if (!myTeamId) return;
    const result = await upgradeFacilities(myTeamId);
    if (!result.ok) toast.error(result.reason);
    else toast.success(`Instalaciones mejoradas al nivel ${result.level}.`, { description: `Inversión de ${result.cost.toLocaleString("es-ES")} € confirmada.` });
    setUpgradeType(null);
  };

  const handleCoachUpgrade = async () => {
    if (!myTeamId) return;
    const result = await upgradeYouthCoach(myTeamId);
    if (!result.ok) toast.error(result.reason);
    else toast.success(`Entrenador juvenil mejorado al nivel ${result.level}.`, { description: `Inversión de ${result.cost.toLocaleString("es-ES")} € confirmada.` });
    setUpgradeType(null);
  };

  const handleNewIntake = async () => {
    if (!myTeamId) return;
    const result = await addAnnualIntake(myTeamId, seasonFromDate(currentDate));
    if (!result.ok) toast.error(result.reason);
    else toast.success(`Nueva promoción generada: ${result.added} jugadores.`, { description: "Los nuevos canteranos ya están disponibles en la academia." });
    setIntakeOpen(false);
  };

  if (!team) return <div className="p-6 text-sm text-muted-foreground">No hay una partida activa.</div>;

  const facilityLevel = academy?.facilityLevel ?? ACADEMY_FACILITIES.default;
  const coachLevel = academy?.youthCoach?.level ?? 1;
  const coachSpecialty = academy?.youthCoach?.specialty ?? "MID";
  const nextFacility = Math.min(ACADEMY_FACILITIES.max, facilityLevel + 1);
  const nextCoach = Math.min(5, coachLevel + 1);
  const facilityCost = ACADEMY_LIMITS.facilityUpgradeCosts[nextFacility] ?? 0;
  const coachCost = ACADEMY_LIMITS.youthCoachUpgradeCosts[nextCoach] ?? 0;
  const currentFacilityGrowth = Math.round((ACADEMY_FACILITIES.progressionMultiplierByLevel[facilityLevel - 1] ?? 1) * 100);
  const nextFacilityGrowth = Math.round((ACADEMY_FACILITIES.progressionMultiplierByLevel[nextFacility - 1] ?? 1) * 100);
  const currentCoachBonus = coachLevel * 3.5;
  const nextCoachBonus = nextCoach * 3.5;
  const facilityPotential = ACADEMY_FACILITIES.potentialBonusByLevel[facilityLevel] ?? 0;
  const nextFacilityPotential = ACADEMY_FACILITIES.potentialBonusByLevel[nextFacility] ?? facilityPotential;
  const intakeBonus = ACADEMY_FACILITIES.annualIntakeBonusByLevel[facilityLevel] ?? 0;
  const nextIntakeBonus = ACADEMY_FACILITIES.annualIntakeBonusByLevel[nextFacility] ?? intakeBonus;

  return (
    <div className="min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="panel-glow overflow-hidden rounded-3xl p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"><GraduationCap className="h-7 w-7" /></div>
              <div>
                <div className="flex items-center gap-3"><h1 className="text-2xl font-black tracking-tight sm:text-3xl">Cantera</h1><TeamLogo teamName={team.name} leagueName={LEAGUES[team.league]?.name ?? team.league} size={30} /></div>
                <p className="mt-1 text-sm text-muted-foreground">Desarrollo de talento de {team.name}. Las decisiones de promoción son tuyas.</p>
              </div>
            </div>
            <button type="button" onClick={() => setIntakeOpen(true)} disabled={loading || players.length >= ACADEMY_LIMITS.maxPlayers || academy?.manualPromotionAvailable === false} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-black transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40">
              <Sparkles className="h-4 w-4" /> {players.length >= ACADEMY_LIMITS.maxPlayers ? "Cantera llena" : academy?.manualPromotionAvailable === false ? "Promoción generada" : "Nueva promoción"}
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat icon={Users} label="Canteranos" value={String(players.length)} />
            <Stat icon={TrendingUp} label="Listos para subir" value={String(readyCount)} />
            <Stat icon={Sparkles} label="POT 78+" value={String(highPotentialCount)} />
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-black"><SearchCode className="h-4 w-4 text-primary" /> Entrenador juvenil</div><span className="scoreline text-xs font-black text-primary">{coachLevel}/5</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary/70" role="progressbar" aria-label="Nivel del entrenador juvenil" aria-valuemin={0} aria-valuemax={5} aria-valuenow={coachLevel}><div className="h-full rounded-full bg-primary" style={{ width: `${(coachLevel / 5) * 100}%` }} /></div>
                <p className="mt-2 text-xs text-muted-foreground">Especialidad {coachSpecialty}. Aumenta la velocidad de progresión y aporta un bonus adicional a su grupo de posición.</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[0.65rem]">
                  <MiniEffect label="Progresión base" value={`+${currentCoachBonus.toFixed(1)}%`} />
                  <MiniEffect label={`Especialidad ${coachSpecialty}`} value="+6% adicional" />
                </div>
              </div>
              <button type="button" onClick={() => setUpgradeType("coach")} disabled={coachLevel >= 5} className="shrink-0 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[0.65rem] font-black text-primary disabled:cursor-not-allowed disabled:opacity-40">
                {coachLevel >= 5 ? "Máximo" : `Mejorar · ${coachCost.toLocaleString("es-ES")} €`}
              </button>
            </div>
          </div>
        </section>

        <section className="panel rounded-2xl p-4" aria-label="Buscar y filtrar canteranos">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-muted-foreground">Filtra y ordena los jugadores de la cantera.</p>
            </div>
            <span className="rounded-full border border-border/60 bg-secondary/50 px-3 py-1 text-[0.65rem] font-black text-muted-foreground">{filtered.length} de {players.length} jugadores</span>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre..." aria-label="Buscar canteranos por nombre" className="w-full rounded-xl border border-border bg-secondary/60 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary/50" /></div>
            <select value={position} onChange={(event) => setPosition(event.target.value)} className="rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm font-bold outline-none focus:border-primary/50"><option value="ALL">Todas las posiciones</option><option value="GK">Porteros</option><option value="DFC">Centrales</option><option value="LD">Laterales der.</option><option value="LI">Laterales izq.</option><option value="MCD">Pivotes</option><option value="MC">Centrocampistas</option><option value="MCO">Mediapuntas</option><option value="MD">Medios derechos</option><option value="MI">Medios izquierdos</option><option value="ED">Extremos derechos</option><option value="EI">Extremos izquierdos</option><option value="DC">Delanteros</option></select>
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm font-bold outline-none focus:border-primary/50"><option value="ovr">Ordenar por OVR</option><option value="potential">Ordenar por POT estimado</option><option value="age">Ordenar por edad</option></select>
          </div>
        </section>

        

        {loading ? <div className="panel rounded-2xl p-8 text-center text-sm text-muted-foreground">Generando la cantera de forma determinista…</div> : filtered.length === 0 ? <div className="panel rounded-2xl p-8 text-center"><GraduationCap className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 text-sm font-black">No hay canteranos que coincidan</p><p className="mt-1 text-xs text-muted-foreground">Prueba otro filtro o espera a la siguiente promoción.</p></div> : <div className="space-y-5">{(["POR", "DEF", "MED", "DEL"] as const).map((group) => {
          const groupPlayers = filtered.filter((player) => {
            const pos = player.positions[0] ?? "MC";
            const normalized = positionGroupFromCode(pos);
            return (group === "POR" && normalized === "GK") || (group === "DEF" && normalized === "DEF") || (group === "MED" && normalized === "MID") || (group === "DEL" && normalized === "FWD");
          });
          if (!groupPlayers.length) return null;
          const groupLabel = group === "POR" ? "Porteros" : group === "DEF" ? "Defensas" : group === "MED" ? "Centrocampistas" : "Delanteros";
          const tone = group === "POR" ? "border-orange-500/35 from-orange-500/15 text-orange-300" : group === "DEF" ? "border-sky-500/35 from-sky-500/15 text-sky-300" : group === "MED" ? "border-emerald-500/35 from-emerald-500/15 text-emerald-300" : "border-rose-500/35 from-rose-500/15 text-rose-300";
          const avg = Math.round(groupPlayers.reduce((sum, player) => sum + Number(player.internalOvr ?? player.ovr), 0) / groupPlayers.length);
          return <section key={group} className="space-y-3"><div className={`mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-gradient-to-r to-card/20 p-3 ${tone}`}><span className="scoreline text-lg font-black">{group}</span><div className="flex-1"><p className="text-sm font-bold uppercase tracking-wider">{groupLabel}</p><p className="text-[0.65rem] uppercase tracking-wider opacity-70">{groupPlayers.length} jugadores · OVR medio {avg}</p></div></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{groupPlayers.map((player) => <AcademyCard key={player.id} player={player} onClick={() => setSelectedId(player.id)} />)}</div></section>;
        })}</div>}
      </div>

      <PlayerDetailDialog
        open={!!selected && !!selectedFc}
        onClose={() => setSelectedId(null)}
        player={selectedFc}
        team={team}
        stats={selectedStats ?? (selected ? academyPlayerToStats(selected) : undefined)}
        academyStats={selected?.academyStats}
        privateMode
        myTeamId={myTeamId}
        isMarketOpen={isMarketOpen}
        academyMode
        academyPotentialEstimate={selected?.potentialEstimate}
        onPromote={selected && ["academy", "called-up"].includes(selected.status) ? () => openContractNegotiation("promotion") : undefined}
        onLoan={selected?.status === "academy" ? handleLoan : undefined}
        onSellAcademy={selected && ["academy", "listed"].includes(selected.status) ? handleSale : undefined}
        onCallUp={selected?.status === "academy" ? handleCallUp : undefined}
        onUncall={selected?.status === "called-up" ? handleUncall : undefined}
        onUncallDisabled={selectedUncallBlocked}
        onRenewYouth={selected?.status === "academy" ? () => openContractNegotiation("youth-renewal") : undefined}
        onRelease={selected?.status === "academy" ? handleRelease : undefined}
        academyStatusLabel={selected ? ({ academy: "En cantera", loaned: "Cedido", listed: "En venta", "called-up": "Convocado" } as Record<string, string>)[selected.status] ?? "Cantera" : "Cantera"}
      />

      {loanSearchPlayerId != null && (() => {
        const player = players.find((candidate) => candidate.id === loanSearchPlayerId);
        if (!player) return null;
        const fc = academyPlayerToFcPlayer(player, team.name, LEAGUES[team.league]?.name ?? team.league);
        return <LoanSearchModal p={fc} listed={loanSearchListed} onClose={() => setLoanSearchPlayerId(null)} onToggle={() => void toggleLoanSearch()} />;
      })()}

      {contractKind && actionPlayer && team && myTeamId && (() => {
        const stats = usePlayersStore.getState().stats[String(actionPlayer.id)];
        const negotiationPlayer = academyPlayerToFcPlayer({
          ...actionPlayer,
          ovr: Math.round(Number(stats?.dynamicStats?.currentOVR ?? actionPlayer.ovr)),
          potential: Math.round(Number(stats?.dynamicStats?.potentialOVR ?? actionPlayer.potential)),
          attributes: stats?.dynamicStats?.attributes ?? actionPlayer.attributes,
        }, team.name, LEAGUES[team.league]?.name ?? team.league);
        const marketPlayer = getPlayer(String(actionPlayer.id));
        if (!marketPlayer) return null;
        return (
          <ContractNegotiationModal
            player={negotiationPlayer}
            clubId={myTeamId}
            kind={contractKind}
            currentDate={currentDate}
            currentContract={academyContract(actionPlayer)}
            context={{
              morale: stats?.morale ?? 70,
              satisfaction: Math.max(0, Math.min(100, 80 - Number(stats?.satisfactionMissStreak ?? 0) * 8 - Number(stats?.satisfactionBenchStreak ?? 0) * 4 - Number(stats?.satisfactionNotCalledStreak ?? 0) * 5)),
              currentRole: "prospect",
              yearsAtClub: Math.max(0, seasonFromDate(currentDate) - actionPlayer.joinedSeason),
              homegrown: true,
              cacheKey: currentDate.slice(0, 10),
            }}
            onClose={() => { setContractKind(null); setActionPlayerId(null); }}
            onPersist={() => { const save = loadSave(); if (save) saveSave(save); }}
            onAccepted={async (offer) => {
              if (contractKind === "promotion") {
                const result = promoteForUser(actionPlayer.id, { years: offer.years, wage: offer.wage, releaseClause: offer.releaseClause, signingBonus: offer.signingBonus, squadRole: offer.squadRole });
                if (!result.ok) return { ok: false, reason: result.reason };
              } else {
                const result = await renewYouthContract(actionPlayer.id, offer.years, offer.squadRole);
                if (!result.ok) return { ok: false, reason: result.reason };
              }
              setContractKind(null);
              setActionPlayerId(null);
              setSelectedId(null);
              const save = loadSave();
              if (save) saveSave(save);
              return { ok: true };
            }}
          />
        );
      })()}

      {releaseConfirmId != null && (() => {
        const player = players.find((candidate) => candidate.id === releaseConfirmId);
        if (!player) return null;
        return (
          <Dialog open onOpenChange={(open) => !open && setReleaseConfirmId(null)}>
            <DialogContent className="max-w-md overflow-hidden border-rose-400/20 bg-background/95 p-0 shadow-2xl shadow-rose-950/20 backdrop-blur-xl">
              <div className="relative overflow-hidden border-b border-border/50 bg-gradient-to-br from-rose-500/20 via-rose-500/5 to-transparent p-5">
                <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl" />
                <DialogHeader className="relative">
                  <DialogTitle className="text-xl font-black">Liberar canterano</DialogTitle>
                  <DialogDescription className="mt-1 text-sm leading-6">
                    Vas a retirar definitivamente a <span className="font-black text-foreground">{player.name}</span> de tu cantera. Esta decisión no se puede deshacer.
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4">
                  <PlayerFace name={player.name} role={roleFromPosition(player.positions[0] ?? "CM")} size={52} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{player.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">OVR {Math.round(player.ovr)} · {player.age} años · {player.nation}</p>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">El jugador desaparecerá de la cantera y de los registros dinámicos asociados a ella.</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setReleaseConfirmId(null)} className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-black transition hover:bg-secondary/80">Cancelar</button>
                  <button type="button" onClick={() => void handleConfirmRelease()} className="rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-2.5 text-xs font-black text-rose-200 transition hover:bg-rose-500/25">Sí, liberar jugador</button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {upgradeType && <Dialog open onOpenChange={(open) => !open && setUpgradeType(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">{upgradeType === "facility" ? "Mejorar instalaciones de cantera" : "Mejorar entrenador juvenil"}</DialogTitle>
            <DialogDescription>Revisa exactamente qué cambia antes de gastar el presupuesto.</DialogDescription>
          </DialogHeader>
          {upgradeType === "facility" ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-4"><p className="text-sm font-black">Nivel {facilityLevel} → {nextFacility}</p><p className="mt-1 text-xs text-muted-foreground">La calidad de las instalaciones afecta directamente a la cantera generada y a su desarrollo.</p></div>
              <div className="grid gap-2 sm:grid-cols-2"><MiniEffect label="Progresión" value={`${currentFacilityGrowth}% → ${nextFacilityGrowth}%`} /><MiniEffect label="POT adicional" value={`+${facilityPotential} → +${nextFacilityPotential}`} /><MiniEffect label="OVR inicial" value={`+${ACADEMY_FACILITIES.ovrBonusByLevel[facilityLevel] ?? 0} → +${ACADEMY_FACILITIES.ovrBonusByLevel[nextFacility] ?? 0}`} /><MiniEffect label="Promoción anual" value={`+${intakeBonus} → +${nextIntakeBonus}`} /></div>
              <p className="text-xs text-muted-foreground">Coste: <strong className="text-foreground">{facilityCost.toLocaleString("es-ES")} €</strong>. El pago se descuenta inmediatamente del presupuesto.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-4"><p className="text-sm font-black">Nivel {coachLevel} → {nextCoach}</p><p className="mt-1 text-xs text-muted-foreground">El nivel aumenta el ritmo mensual de crecimiento de los canteranos.</p></div>
              <div className="grid gap-2 sm:grid-cols-2"><MiniEffect label="Progresión base" value={`+${currentCoachBonus.toFixed(1)}% → +${nextCoachBonus.toFixed(1)}%`} /><MiniEffect label={`Especialidad ${coachSpecialty}`} value="+6% adicional al grupo correspondiente" /></div>
              <p className="text-xs text-muted-foreground">Coste: <strong className="text-foreground">{coachCost.toLocaleString("es-ES")} €</strong>. La especialidad actual no cambia con la mejora, solo sube la capacidad del entrenador.</p>
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setUpgradeType(null)} className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-black">Cancelar</button><button type="button" onClick={() => void (upgradeType === "facility" ? handleFacilityUpgrade() : handleCoachUpgrade())} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground">Confirmar mejora</button></div>
        </DialogContent>
      </Dialog>}

      {intakeOpen && <Dialog open onOpenChange={(open) => !open && setIntakeOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-xl font-black">Generar nueva promoción</DialogTitle><DialogDescription>Vas a incorporar una nueva hornada de jóvenes a la cantera.</DialogDescription></DialogHeader>
          <div className="mt-4 space-y-3"><div className="rounded-xl border border-border/60 bg-secondary/30 p-4"><p className="text-sm font-black">Qué ocurrirá</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Se crearán de forma determinista varios jugadores de 15–17 años según tu nivel de instalaciones, la identidad del club y la temporada. Cada jugador tendrá nombre y nacionalidad coherentes y un perfil único.</p></div><MiniEffect label="Plazas actuales" value={`${players.length}/${ACADEMY_LIMITS.maxPlayers}`} /><p className="text-xs text-muted-foreground">Esta acción no promociona a nadie al primer equipo: solamente añade la nueva promoción a la cantera.</p></div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setIntakeOpen(false)} className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-black">Cancelar</button><button type="button" onClick={() => void handleNewIntake()} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground">Confirmar nueva promoción</button></div>
        </DialogContent>
      </Dialog>}
    </div>
  );
}

function MiniEffect({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border/50 bg-secondary/40 p-2.5"><p className="text-muted-foreground">{label}</p><p className="mt-0.5 font-black text-foreground">{value}</p></div>;
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div className="rounded-2xl border border-border/50 bg-secondary/30 p-3"><div className="flex items-center gap-2 text-[0.6rem] font-black uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div><p className="mt-1 text-lg font-black">{value}</p></div>;
}

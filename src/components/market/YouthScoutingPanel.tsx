import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarClock, Clock3, Eye, FileText, GraduationCap, Search, ShieldCheck, Sparkles, UserRoundX, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CountryFlag } from "@/components/CountryFlag";
import { TeamLogo } from "@/components/TeamLogo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContractNegotiationModal } from "@/components/contracts/ContractNegotiationModal";
import { formatEuro, usePlayersStore, type FcPlayer } from "@/store/playersStore";
import { useAcademyStore } from "@/lib/academy/academyStore";
import { ACADEMY_LIMITS } from "@/lib/academy/academyConstants";
import { COUNTRY_NAMES, academyCountryLabel } from "@/lib/academy/academyNames";
import { POS_NAME, type PosCode } from "@/lib/positions";
import {
  dismissYouthScout,
  deleteYouthScoutReport,
  getYouthScoutingState,
  hireYouthScout,
  isYouthProspectSigned,
  markYouthProspectSigned,
  releaseYouthScout,
  saveYouthScoutingSearch,
  daysInMonthLabel,
  type YouthProspect,
  type YouthScoutReport,
  type YouthScoutCandidate,
} from "@/lib/transfers/YouthScouting";
import { registerDynamicMarketPlayer, unregisterDynamicMarketPlayer, positionGroupOf } from "@/lib/transfers/PlayerIndex";
import type { MarketPlayer } from "@/lib/transfers/types";
import type { InternalContractOffer } from "@/lib/transfers/InternalContractNegotiation";

const COUNTRY_OPTIONS = Object.keys(COUNTRY_NAMES)
  .map((country) => ({ value: country, label: academyCountryLabel(country) }))
  .sort((a, b) => a.label.localeCompare(b.label, "es"));

const POSITION_GROUPS: { label: string; positions: PosCode[] }[] = [
  { label: "Portería", positions: ["GK"] },
  { label: "Defensa", positions: ["DFC", "LD", "LI"] },
  { label: "Centrocampo", positions: ["MCD", "MC", "MCO", "MD", "MI"] },
  { label: "Ataque", positions: ["ED", "EI", "DC"] },
];

function daysUntil(currentDate: string, targetDate: string): number {
  const current = Date.parse(`${currentDate.slice(0, 10)}T00:00:00Z`);
  const target = Date.parse(`${targetDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(current) || !Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - current) / 86_400_000));
}

function formatIsoDate(date: string): string {
  const value = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(value)
    ? new Date(value).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : date;
}

function prospectNumericId(prospectId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < prospectId.length; index += 1) {
    hash ^= prospectId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let id = 2_000_000_000 + ((hash >>> 0) % 140_000_000);
  // No pisa a jugadores del catálogo ni a jugadores dinámicos de otras pantallas.
  while (usePlayersStore.getState().dynamicPlayers?.[String(id)]) id = 2_000_000_000 + ((id - 1_999_999_999) % 140_000_000);
  return id;
}

function fcPosition(position: PosCode): string {
  const positions: Record<PosCode, string> = {
    GK: "GK", DFC: "CB", LD: "RB", LI: "LB", MCD: "CDM", MC: "CM",
    MCO: "CAM", MD: "RM", MI: "LM", ED: "RW", EI: "LW", DC: "ST",
  };
  return positions[position] ?? "CM";
}

function ScoutStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs" aria-label={`${rating.toLocaleString("es-ES")} de 5 estrellas`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={rating >= index + 1 ? "text-amber-300" : rating >= index + 0.5 ? "text-amber-200/70" : "text-muted-foreground/30"}>★</span>
      ))}
    </span>
  );
}

function YouthScoutCard({
  scout,
  hired,
  blocked,
  dismissed,
  onHire,
}: {
  scout: YouthScoutCandidate;
  hired: boolean;
  blocked: boolean;
  dismissed: boolean;
  onHire: (scout: YouthScoutCandidate) => void;
}) {
  return (
    <article className="panel flex min-w-[220px] max-w-[242px] shrink-0 snap-start flex-col overflow-hidden">
      <div className="border-b border-border/50 bg-gradient-to-br from-emerald-500/15 via-card to-card p-3">
        <div className="flex items-start gap-2.5">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-emerald-500/25 bg-secondary/70 shadow-lg">
            <img src={scout.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            <span className="absolute inset-x-1 bottom-1 rounded-full bg-black/45 px-1.5 py-0.5 text-center text-[0.48rem] font-black text-white/90">{scout.rating.toLocaleString("es-ES")}★</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-black leading-tight">{scout.name}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><CountryFlag country={scout.country} size="sm" /><span>{scout.country}</span></div>
            <div className="mt-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5"><ScoutStars rating={scout.rating} /></div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[0.58rem] uppercase tracking-wider text-muted-foreground">Contratación · 50% menos</p>
            <p className="scoreline text-lg font-black text-emerald-300">{formatEuro(scout.cost)}</p>
          </div>
          <div className="text-right"><p className="text-[0.58rem] uppercase tracking-wider text-muted-foreground">Informe</p><p className="font-black">Mensual</p></div>
        </div>
        <div className="rounded-lg border border-border/50 bg-secondary/30 p-2 text-[0.7rem] leading-relaxed text-muted-foreground">
          {scout.rating >= 4 ? "Mayor probabilidad de descubrir talento de alto potencial." : scout.rating >= 2.5 ? "Buen equilibrio entre cantidad y calidad de las promesas." : "Busca talento joven a menor coste, con resultados más imprevisibles."}
        </div>
        <button type="button" disabled={hired || blocked || dismissed} onClick={() => onHire(scout)} className="mt-auto w-full rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          {hired ? "Ojeador contratado" : dismissed ? "No disponible" : blocked ? "Ya tienes un ojeador" : "Contratar ojeador"}
        </button>
      </div>
    </article>
  );
}

function ProspectCard({
  prospect,
  onSign,
  signed,
  full,
}: {
  prospect: YouthProspect;
  onSign: (prospect: YouthProspect) => void;
  signed: boolean;
  full: boolean;
}) {
  const positionLabel = prospect.positions.map((position) => POS_NAME[position]).join(" / ");
  const highPotential = prospect.potentialEstimate.min >= 80;
  return (
    <article className="group overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card/85 via-card/65 to-emerald-500/[0.035] p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-400/25 hover:shadow-lg hover:shadow-emerald-950/10">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-emerald-500/20 bg-gradient-to-br from-emerald-400/20 to-cyan-500/10 text-emerald-300 shadow-inner"><GraduationCap className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black">{prospect.name}</p>
              {highPotential && <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[0.58rem] font-black text-emerald-300">Alto potencial</span>}
              {signed && <span className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[0.58rem] font-black text-muted-foreground">En cantera</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <CountryFlag country={prospect.nation} size="sm" /><span>{prospect.nation}</span><span>·</span><span>{prospect.age} años</span><span>·</span><span>{positionLabel}</span>
            </div>
            <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 px-2 py-1">
              <TeamLogo teamName={prospect.sourceClubName || "Cantera de origen"} leagueName={prospect.sourceLeagueName || ""} size={23} className="shrink-0" />
              <div className="min-w-0"><p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">Canterano de</p><p className="truncate text-xs font-black text-foreground">{prospect.sourceClubName || "Club de formación"}</p></div>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              <div className="rounded-lg border border-border/40 bg-secondary/30 px-2 py-1"><p className="text-[0.52rem] font-bold uppercase tracking-wider text-muted-foreground">Media</p><p className="scoreline text-sm font-black">{prospect.ovr}</p></div>
              <div className="rounded-lg border border-border/40 bg-secondary/30 px-2 py-1"><p className="text-[0.52rem] font-bold uppercase tracking-wider text-muted-foreground">Potencial estimado</p><p className="scoreline text-sm font-black">{prospect.potentialEstimate.min}–{prospect.potentialEstimate.max}</p></div>
              <div className="col-span-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 sm:col-span-1"><p className="text-[0.52rem] font-bold uppercase tracking-wider text-muted-foreground">Coste de incorporación</p><p className="scoreline text-sm font-black text-emerald-300">{formatEuro(prospect.price)}</p></div>
            </div>
          </div>
        </div>
        <button type="button" disabled={signed || full} onClick={() => onSign(prospect)} className="min-h-9 shrink-0 rounded-lg bg-primary px-3 py-2 text-[0.7rem] font-black text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
          {signed ? "En tu cantera" : full ? "Cantera llena" : "Negociar contrato"}
        </button>
      </div>
    </article>
  );
}

function ReportSection({
  report,
  onViewReport,
  currentDate,
}: {
  report: YouthScoutReport;
  onViewReport: (reportId: string) => void;
  currentDate: string;
}) {
  const pending = report.status === "pending";
  const remaining = daysUntil(currentDate, report.readyAt);
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card/65 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 bg-gradient-to-r from-emerald-500/[0.09] via-transparent to-cyan-500/[0.045] p-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${pending ? "border-amber-400/25 bg-amber-400/10 text-amber-300" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"}`}>
            {pending ? <CalendarClock className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-black capitalize">Informe de {daysInMonthLabel(report.readyAt.slice(0, 7))}</h3><span className={`rounded-full border px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider ${pending ? "border-amber-400/25 bg-amber-400/10 text-amber-200" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"}`}>{pending ? "En investigación" : "Informe disponible"}</span></div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{report.scoutName} · {academyCountryLabel(report.country)} · {report.positions.map((position) => POS_NAME[position]).join(", ")}</p>
            <p className="mt-1 text-[0.62rem] text-muted-foreground">Búsqueda: {formatIsoDate(report.startedAt)} · {pending ? `Entrega prevista: ${formatIsoDate(report.readyAt)}` : `Entregado: ${formatIsoDate(report.readyAt)}`}</p>
          </div>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/45 px-2.5 py-1.5 text-right">
          <p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">{pending ? "Estado del informe" : "Promesas encontradas"}</p>
          <p className="scoreline text-base font-black text-emerald-300">{pending ? "En curso" : report.candidates.length}</p>
        </div>
      </div>
      {pending ? (
        <div className="p-3 md:p-4">
          <div className="mx-auto max-w-xl text-center">
            <div className="relative mx-auto grid h-12 w-12 place-items-center rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-400/15 to-orange-500/5 text-amber-300 shadow-inner">
              <Clock3 className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-amber-300 ring-4 ring-card" />
            </div>
            <p className="mt-3 text-base font-black">La red de ojeadores está trabajando</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Los nombres, medias y potenciales permanecerán ocultos hasta que termine el seguimiento de 30 días.</p>
            <div className="mx-auto mt-3 max-w-sm rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2">
              <p className="scoreline text-xl font-black text-amber-200">{remaining} {remaining === 1 ? "día" : "días"}</p>
              <p className="mt-0.5 text-[0.65rem] font-semibold text-muted-foreground">para recibir el informe completo</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary/80"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${Math.max(2, Math.min(100, ((30 - remaining) / 30) * 100))}%` }} /></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 md:px-4">
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">El seguimiento ha terminado. Ya puedes consultar las fichas completas de los jóvenes detectados y negociar el contrato de las promesas que te interesen.</p>
          <button type="button" onClick={() => onViewReport(report.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground transition hover:brightness-110"><Eye className="h-4 w-4" />Ver informe completo</button>
        </div>
      )}
    </section>
  );
}

export function YouthScoutingPanel({ currentDate, teamId, budget }: { currentDate: string; teamId: string; budget: number }) {
  const spendBudget = usePlayersStore((state) => state.spendBudget);
  const ensureClub = useAcademyStore((state) => state.ensureClub);
  const clubAcademy = useAcademyStore((state) => state.clubs[teamId]);
  const recruitScoutedProspect = useAcademyStore((state) => state.recruitScoutedProspect);
  const [refresh, setRefresh] = useState(0);
  const [country, setCountry] = useState("");
  const [positions, setPositions] = useState<PosCode[]>([]);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [negotiationProspect, setNegotiationProspect] = useState<YouthProspect | null>(null);
  const [negotiationPlayer, setNegotiationPlayer] = useState<FcPlayer | null>(null);
  const [negotiationMarketId, setNegotiationMarketId] = useState<string | null>(null);
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);
  const [selectedScoutId, setSelectedScoutId] = useState<string | null>(null);

  const state = useMemo(() => getYouthScoutingState(currentDate), [currentDate, refresh]);
  const hiredScouts = state.hiredScouts;
  const scout = hiredScouts.find((item) => item.id === selectedScoutId) ?? hiredScouts[0] ?? null;
  const reports = useMemo(() => [...state.reports].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [state.reports]);
  const savedPositionsKey = state.positions.join(",");
  useEffect(() => {
    setCountry(state.country || "");
    setPositions((savedPositionsKey ? savedPositionsKey.split(",") : []).slice(0, 3) as PosCode[]);
  }, [state.country, savedPositionsKey, refresh]);
  const academyCount = clubAcademy?.players.filter((player) => ["academy", "loaned", "called-up", "listed"].includes(player.status)).length ?? 0;
  const academyFull = academyCount >= ACADEMY_LIMITS.maxPlayers;
  const viewingReport = viewingReportId ? reports.find((report) => report.id === viewingReportId && report.status === "completed") ?? null : null;

  useEffect(() => {
    const year = Number(currentDate.slice(0, 4)) || 2026;
    void ensureClub(teamId, year, currentDate).catch(() => undefined);
  }, [currentDate, ensureClub, teamId]);

  useEffect(() => {
    const marketId = negotiationMarketId;
    return () => {
      if (marketId) unregisterDynamicMarketPlayer(marketId);
    };
  }, [negotiationMarketId]);

  function refreshPanel() {
    setRefresh((value) => value + 1);
  }

  function handleHire(candidate: YouthScoutCandidate) {
    if (hiredScouts.length >= 3) {
      toast.error("Ya tienes contratados los 3 ojeadores de cantera permitidos.");
      return;
    }
    if (budget < candidate.cost) {
      toast.error("No tienes presupuesto suficiente para contratar a este ojeador.", {
        description: `Necesitas ${formatEuro(candidate.cost)} y dispones de ${formatEuro(budget)}.`,
      });
      return;
    }
    const result = hireYouthScout(candidate.id, currentDate);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    if (!spendBudget(candidate.cost)) {
      releaseYouthScout(candidate.id);
      toast.error("No se pudo descontar el coste de contratación.");
      refreshPanel();
      return;
    }
    setCountry("");
    setPositions([]);
    toast.success(`${candidate.name} se ha incorporado al cuerpo de ojeadores de cantera.`, {
      description: `${candidate.rating.toLocaleString("es-ES")} estrellas · contratación con un 50% de descuento.`,
    });
    refreshPanel();
  }

  function handleSaveSearch() {
    if (positions.length > 3) {
      toast.error("Solo puedes seleccionar 3 posiciones como máximo.");
      return;
    }
    const result = saveYouthScoutingSearch(currentDate, country, positions, scout?.id);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    toast.success(result.generatedReport ? "Búsqueda de cantera iniciada." : "Búsqueda guardada.", {
      description: result.generatedReport
        ? "El informe completo se desbloqueará dentro de 30 días. Tendrás que iniciar cada nueva búsqueda manualmente."
        : "La búsqueda se guardó; el informe se pondrá en marcha cuando haya una partida activa.",
    });
    refreshPanel();
  }

  function closeProspectNegotiation() {
    if (negotiationMarketId) unregisterDynamicMarketPlayer(negotiationMarketId);
    setNegotiationProspect(null);
    setNegotiationPlayer(null);
    setNegotiationMarketId(null);
  }

  function handleSign(prospect: YouthProspect) {
    if (isYouthProspectSigned(prospect) || negotiationProspect) return;
    if (budget < prospect.price) {
      toast.error("No tienes presupuesto suficiente para negociar su incorporación.", {
        description: `La cantera de origen pide ${formatEuro(prospect.price)} y tu presupuesto actual es ${formatEuro(budget)}.`,
      });
      return;
    }

    const numericId = prospectNumericId(prospect.id);
    const marketId = String(numericId);
    const primary = prospect.positions[0] ?? "MC";
    const baseWage = Math.max(35_000, Math.round((prospect.ovr * 1_800 + Math.max(0, prospect.potential - prospect.ovr) * 700) / 1_000) * 1_000);
    const marketPlayer: MarketPlayer = {
      id: marketId,
      name: prospect.name,
      age: prospect.age,
      ovr: prospect.ovr,
      potential: prospect.potential,
      position: fcPosition(primary),
      group: positionGroupOf(fcPosition(primary)),
      nation: prospect.nation,
      clubId: prospect.sourceClubId ?? null,
      leagueId: prospect.sourceLeagueId ?? "",
      value: prospect.price,
      contract: {
        yearsLeft: 2,
        wage: baseWage,
        releaseClause: Math.round(prospect.price * 2),
        signingBonus: Math.round(baseWage * 0.15),
      },
      personality: {
        ambition: Math.min(0.95, 0.48 + prospect.potential / 220),
        loyalty: 0.56,
        greed: Math.min(0.72, 0.22 + prospect.ovr / 180),
        playingTimeDesire: 0.94,
        adventure: 0.58,
      },
      transferListed: false,
      listReason: null,
      loanListed: false,
      loanClubId: null,
      loanOwnerClubId: null,
      loanEndDate: null,
      minutesShare: 0,
      attributes: {
        pace: prospect.attributes.PAC,
        passing: prospect.attributes.PAS,
        physical: prospect.attributes.PHY,
        defending: prospect.attributes.DEF,
      },
    };
    const negotiationPlayer: FcPlayer = {
      ID: numericId,
      Name: prospect.name,
      OVR: prospect.ovr,
      potential: prospect.potential,
      PAC: prospect.attributes.PAC,
      SHO: prospect.attributes.SHO,
      PAS: prospect.attributes.PAS,
      DRI: prospect.attributes.DRI,
      DEF: prospect.attributes.DEF,
      PHY: prospect.attributes.PHY,
      Position: fcPosition(primary),
      "Alternative positions": prospect.positions.slice(1).map(fcPosition).join(","),
      Nation: prospect.nation,
      Age: prospect.age,
      birthdate: prospect.birthdate,
      Team: prospect.sourceClubName ?? "Agente libre",
      League: prospect.sourceLeagueName ?? "",
    };
    registerDynamicMarketPlayer(marketPlayer);
    setNegotiationMarketId(marketId);
    setNegotiationProspect(prospect);
    setNegotiationPlayer(negotiationPlayer);
  }

  async function acceptProspectContract(offer: InternalContractOffer): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!negotiationProspect) return { ok: false, reason: "No se ha encontrado la promesa que estás negociando." };
    const result = await recruitScoutedProspect(teamId, negotiationProspect, currentDate, {
      years: offer.years,
      wage: offer.wage,
      releaseClause: offer.releaseClause,
      signingBonus: offer.signingBonus,
    });
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }
    markYouthProspectSigned(negotiationProspect.id, currentDate, result.playerId);
    refreshPanel();
    return { ok: true };
  }

  function handleDismiss() {
    const dismissed = dismissYouthScout(scout?.id);
    if (!dismissed) return;
    setDismissOpen(false);
    toast.success(`${dismissed.name} ha dejado el club.`, { description: "Los informes anteriores se conservan." });
    setSelectedScoutId(null);
    refreshPanel();
  }

  function handleDeleteReport(reportId: string) {
    if (!deleteYouthScoutReport(reportId)) return;
    if (viewingReportId === reportId) setViewingReportId(null);
    toast.success("Informe eliminado.");
    refreshPanel();
  }

  function togglePosition(position: PosCode) {
    setPositions((current) => {
      if (current.includes(position)) return current.filter((value) => value !== position);
      if (current.length >= 3) {
        toast.error("Puedes seleccionar como máximo 3 posiciones.", { description: "Quita una posición seleccionada antes de añadir otra." });
        return current;
      }
      return [...current, position];
    });
  }

  return (
    <div className="space-y-3">
      <div className="panel-glow relative isolate overflow-hidden rounded-xl border border-emerald-400/15 bg-gradient-to-br from-emerald-500/[0.13] via-card/80 to-cyan-500/[0.07] shadow-lg shadow-emerald-950/10">
        <div className="pointer-events-none absolute -right-12 -top-20 -z-10 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-[0.18em] text-emerald-200"><Sparkles className="h-3 w-3" /> Red internacional de talento</div>
            <h2 className="mt-2 text-lg font-black tracking-tight md:text-xl">Ojeador de canteras</h2>
            <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">Explora las academias de clubes reales, filtra por país y hasta tres posiciones, y recibe un informe completo tras 30 días de seguimiento. La decisión final y la negociación del contrato siempre son tuyas.</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[0.6rem] font-bold">
              <span className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-background/35 px-2 py-1"><Clock3 className="h-3.5 w-3.5 text-amber-300" /> Informes a 30 días</span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-background/35 px-2 py-1"><Users className="h-3.5 w-3.5 text-emerald-300" /> 5–8 promesas por informe</span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-background/35 px-2 py-1"><BadgeCheck className="h-3.5 w-3.5 text-cyan-300" /> Contrato negociable</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-2 md:w-[270px] md:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-background/40 p-2.5"><p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">Presupuesto</p><p className="mt-1 scoreline text-sm font-black text-primary">{formatEuro(budget)}</p></div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-2.5"><p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">Tu cantera</p><p className="mt-1 scoreline text-sm font-black">{academyCount} <span className="text-xs text-muted-foreground">/ {ACADEMY_LIMITS.maxPlayers}</span></p><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${Math.min(100, (academyCount / ACADEMY_LIMITS.maxPlayers) * 100)}%` }} /></div></div>
          </div>
        </div>
      </div>

      <>
        <section>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div><h3 className="text-base font-black">Ojeadores disponibles este mes</h3><p className="text-xs text-muted-foreground">Tres opciones nuevas cada mes. Perfiles de cantera independientes y contratación un 50% más barata que la de un ojeador estándar equivalente.</p></div>
            <span className="rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 text-[0.65rem] font-bold">{state.catalog.length} candidatos</span>
          </div>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {state.catalog.map((candidate) => <YouthScoutCard key={candidate.id} scout={candidate} hired={hiredScouts.some((item) => item.id === candidate.id)} blocked={hiredScouts.length >= 3} dismissed={state.dismissedScoutIds.includes(candidate.id)} onHire={handleHire} />)}
          </div>
        </section>
      {hiredScouts.length > 0 && <section className="panel p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black">Ojeadores contratados</h3><span className="text-xs text-muted-foreground">{hiredScouts.length}/3</span></div><div className="flex flex-wrap gap-2">{hiredScouts.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedScoutId(item.id); setCountry(""); setPositions([]); }} className={`rounded-lg border px-3 py-2 text-left text-xs ${scout?.id === item.id ? "border-emerald-400/50 bg-emerald-400/10" : "border-border bg-secondary/30"}`}><span className="block font-bold">{item.name}</span><span className="text-muted-foreground">{item.rating}★</span></button>)}</div></section>}
      {scout && (
        <section className="panel p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-300"><ShieldCheck className="h-4 w-4" /></div>
              <div><p className="font-black">Ojeador de cantera contratado</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-bold text-foreground">{scout.name}</span><CountryFlag country={scout.country} size="sm" /><span>{scout.country}</span><ScoutStars rating={scout.rating} /></div></div>
            </div>
            <div className="flex items-center gap-3"><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"><p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Recolección mensual</p><p className="mt-1 text-xs font-black">{scout.rating <= 1.5 ? "5 jugadores" : scout.rating <= 2.5 ? "6 jugadores" : scout.rating <= 3.5 ? "7 jugadores" : "8 jugadores"}</p></div><button type="button" onClick={() => setDismissOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs font-black text-destructive transition hover:bg-destructive/10"><UserRoundX className="h-3.5 w-3.5" />Despedir</button></div>
          </div>

          <div className="mt-4 border-t border-border/50 pt-4">
            <div className="mb-3"><h3 className="text-sm font-black">Configurar búsqueda</h3><p className="mt-1 text-xs text-muted-foreground">Elige país y hasta 3 posiciones. Solo se inicia una búsqueda cuando pulses el botón. Cada ojeador puede tener una búsqueda activa.</p></div>
            <div className="grid gap-3 lg:grid-cols-[minmax(180px,0.7fr)_1.3fr]">
              <label><span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">País</span><select value={country} onChange={(event) => setCountry(event.target.value)} className="w-full rounded-lg border border-border bg-secondary px-2.5 py-2 text-xs outline-none focus:border-primary"><option value="">Seleccionar país</option>{COUNTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <div><div className="mb-1.5 flex flex-wrap items-center justify-between gap-2"><span className="text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Posiciones deseadas</span><span className={`rounded-full border px-2 py-0.5 text-[0.58rem] font-black ${positions.length === 3 ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-border/60 bg-secondary/50 text-muted-foreground"}`}>{positions.length}/3 seleccionadas</span></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{POSITION_GROUPS.map((group) => <div key={group.label} className="rounded-lg border border-border/50 bg-secondary/20 p-2"><p className="mb-2 text-[0.6rem] font-black uppercase tracking-wider text-muted-foreground">{group.label}</p><div className="flex flex-wrap gap-1">{group.positions.map((position) => <button key={position} type="button" aria-pressed={positions.includes(position)} onClick={() => togglePosition(position)} disabled={!positions.includes(position) && positions.length >= 3} className={`rounded-md border px-1.5 py-1 text-[0.68rem] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${positions.includes(position) ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200 shadow-sm" : "border-border/50 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>{position}</button>)}</div></div>)}</div></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{country ? COUNTRY_OPTIONS.find((option) => option.value === country)?.label : "Ningún país seleccionado"} · {positions.length ? positions.join(", ") : "Ninguna posición seleccionada"}</p><button type="button" disabled={!country || positions.length === 0 || positions.length > 3} onClick={handleSaveSearch} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><Search className="h-4 w-4" />Iniciar búsqueda · 30 días</button></div>
          </div>
        </section>
      )}
      </>

      <section className="space-y-2.5">
        <div className="flex items-end justify-between gap-2"><div><h3 className="text-base font-black">Informes mensuales</h3><p className="mt-1 text-xs text-muted-foreground">Revisa los jugadores encontrados y ficha solo las promesas que te interesen. Las incorporaciones pasan directamente a tu cantera.</p></div><div className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/30 px-2 py-1.5 text-[0.7rem] font-bold"><Users className="h-4 w-4 text-emerald-300" />{reports.length} informe{reports.length === 1 ? "" : "s"}</div></div>
        {reports.length === 0 ? (
          <div className="panel rounded-xl p-5 text-center"><Sparkles className="mx-auto h-7 w-7 text-emerald-300" /><p className="mt-2 text-sm font-black">Todavía no hay informes</p><p className="mt-1 text-xs text-muted-foreground">Contrata un ojeador, configura país y hasta tres posiciones. No habrá informe hasta que inicies una búsqueda y pasen 30 días.</p></div>
        ) : reports.map((report) => <div key={report.id} className="relative"><ReportSection report={report} onViewReport={setViewingReportId} currentDate={currentDate} /><button type="button" onClick={() => handleDeleteReport(report.id)} className="absolute right-3 top-3 rounded-md border border-destructive/20 bg-card/90 p-1.5 text-destructive hover:bg-destructive/10" aria-label="Eliminar informe" title="Eliminar informe"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
      </section>

      {viewingReport && (
        <Dialog open onOpenChange={(open) => !open && setViewingReportId(null)}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0">
            <div className="border-b border-border/60 bg-gradient-to-br from-emerald-500/15 via-card to-cyan-500/[0.06] p-4 pr-10 md:p-5">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-black"><FileText className="h-4 w-4 text-emerald-300" /> Informe de cantera · {daysInMonthLabel(viewingReport.readyAt.slice(0, 7))}</DialogTitle>
                <DialogDescription>{viewingReport.scoutName} · {viewingReport.scoutRating.toLocaleString("es-ES")} estrellas · {academyCountryLabel(viewingReport.country)} · {viewingReport.positions.map((position) => POS_NAME[position]).join(", ")} · {viewingReport.candidates.length} promesas detectadas</DialogDescription>
              </DialogHeader>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[0.6rem] font-bold text-muted-foreground">
                <span className="rounded-lg border border-border/50 bg-background/40 px-2 py-1">Inicio: {formatIsoDate(viewingReport.startedAt)}</span>
                <span className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1.5 text-emerald-200">Informe entregado: {formatIsoDate(viewingReport.readyAt)}</span>
              </div>
            </div>
            <div className="space-y-2 p-3 md:p-4">
              {viewingReport.candidates.map((prospect) => (
                <ProspectCard key={prospect.id} prospect={prospect} signed={isYouthProspectSigned(prospect)} full={academyFull} onSign={handleSign} />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {negotiationProspect && negotiationPlayer && (
        <ContractNegotiationModal
          key={`youth-prospect-contract-${negotiationPlayer.ID}`}
          player={negotiationPlayer}
          clubId={teamId}
          kind="promotion"
          currentDate={currentDate}
          currentContract={{ yearsLeft: 0, wage: 0, releaseClause: 0, signingBonus: 0 }}
          title="Negociar contrato de cantera"
          description={`Acuerda el salario, la duración, la cláusula y la prima con ${negotiationProspect.name} antes de incorporarlo a tu academia. Precio de incorporación: ${formatEuro(negotiationProspect.price)}.`}
          successTitle="Promesa fichada"
          successDescription={`${negotiationProspect.name} se incorpora a tu cantera por ${formatEuro(negotiationProspect.price)}, con el contrato acordado.`}
          context={{ morale: 72, satisfaction: 72, currentRole: "prospect", expectedRole: "prospect", yearsAtClub: 0, homegrown: false, cacheKey: `youth-scout:${currentDate}:${negotiationProspect.id}` }}
          onClose={closeProspectNegotiation}
          onAccepted={acceptProspectContract}
        />
      )}

      {dismissOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setDismissOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="dismiss-youth-scout-title" className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-2xl"><h3 id="dismiss-youth-scout-title" className="text-base font-black">¿Despedir a {scout?.name}?</h3><p className="mt-1.5 text-xs text-muted-foreground">El ojeador dejará el club. Los informes anteriores y sus jugadores seguirán disponibles.</p><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setDismissOpen(false)} className="rounded-lg border border-border px-3 py-2 text-xs font-black">Cancelar</button><button type="button" onClick={handleDismiss} className="rounded-lg bg-destructive px-3 py-2 text-xs font-black text-destructive-foreground">Despedir ojeador</button></div></div></div>}
    </div>
  );
}

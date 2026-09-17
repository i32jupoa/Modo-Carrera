import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  ChevronDown,
  Clock3,
  Filter,
  Layers3,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import type { FcPlayer } from "@/store/playersStore";
import { formatEuro } from "@/store/playersStore";
import { LEAGUES, getAllTeams, teamById, type LeagueId } from "@/data/teams";
import { DealCard } from "@/components/market/DealCard";
import { stageLabel, type UserDeal } from "@/lib/transfers";

interface Props {
  deals: UserDeal[];
  rawPlayers: FcPlayer[];
  onImprove: (dealId: string, amount: number, wage: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onAcceptDemand: (dealId: string) => void;
  onImproveWage: (dealId: string, wage: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onConfirm: (dealId: string) => void;
  onAbandon: (dealId: string) => void;
  onAcceptIncoming: (dealId: string, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onCounterIncoming: (dealId: string, demand: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onCounterOutgoing: (dealId: string, demand: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onRejectIncoming: (dealId: string) => void;
}

type OfferFilter = "all" | "permanent" | "loan" | "pending";
type OfferSort = "priority" | "recent" | "amount" | "rating";

function isLoan(deal: UserDeal) {
  return deal.offer.type === "loan" || deal.offer.type === "loan-option" || deal.offer.type === "loan-obligation";
}

function isOpen(deal: UserDeal) {
  return deal.stage !== "completed" && deal.stage !== "failed";
}

function isActionable(deal: UserDeal) {
  return deal.stage === "incoming";
}

function typeLabel(deal: UserDeal) {
  if (!isLoan(deal)) return "Traspaso";
  if (deal.offer.type === "loan-option") return "Cesión + opción";
  if (deal.offer.type === "loan-obligation") return "Cesión + obligación";
  return "Cesión";
}

function typeTone(deal: UserDeal) {
  return isLoan(deal)
    ? "border-sky-400/25 bg-sky-400/10 text-sky-200"
    : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
}

function shortAmount(amount: number) {
  return formatEuro(Math.max(0, amount));
}

function leagueName(clubId: string) {
  try {
    const league = teamById(clubId)?.league;
    return league ? LEAGUES[league as LeagueId]?.name ?? league : "";
  } catch {
    return "";
  }
}

function offerValue(deal: UserDeal) {
  if (isLoan(deal)) return deal.offer.amount;
  return deal.offer.amount;
}

function dateKey(value: string) {
  return new Date(`${value}T00:00:00Z`).getTime() || 0;
}

export function IncomingOffersBoard({
  deals,
  rawPlayers,
  onImprove,
  onAcceptDemand,
  onImproveWage,
  onConfirm,
  onAbandon,
  onAcceptIncoming,
  onCounterIncoming,
  onCounterOutgoing,
  onRejectIncoming,
}: Props) {
  const [filter, setFilter] = useState<OfferFilter>("all");
  const [sort, setSort] = useState<OfferSort>("priority");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const playersById = useMemo(() => new Map(rawPlayers.map((p) => [String(p.ID), p])), [rawPlayers]);

  const active = useMemo(() => deals.filter(isOpen), [deals]);
  const pending = useMemo(() => active.filter(isActionable), [active]);
  const transferCount = useMemo(() => active.filter((d) => !isLoan(d)).length, [active]);
  const loanCount = useMemo(() => active.filter(isLoan).length, [active]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return active
      .filter((deal) => {
        if (filter === "permanent" && isLoan(deal)) return false;
        if (filter === "loan" && !isLoan(deal)) return false;
        if (filter === "pending" && !isActionable(deal)) return false;
        if (!normalized) return true;
        const player = playersById.get(deal.playerId);
        const club = teamById(deal.otherClubId)?.name ?? deal.otherClubId;
        return `${deal.playerName} ${club} ${typeLabel(deal)} ${stageLabel(deal.stage)}`.toLowerCase().includes(normalized)
          || player?.Name.toLowerCase().includes(normalized);
      })
      .sort((a, b) => {
        if (sort === "recent") return dateKey(b.updatedOn) - dateKey(a.updatedOn);
        if (sort === "amount") return offerValue(b) - offerValue(a);
        if (sort === "rating") return (playersById.get(b.playerId)?.OVR ?? 0) - (playersById.get(a.playerId)?.OVR ?? 0);
        return Number(isActionable(b)) - Number(isActionable(a)) || dateKey(b.updatedOn) - dateKey(a.updatedOn) || offerValue(b) - offerValue(a);
      });
  }, [active, filter, playersById, query, sort]);

  const groups = useMemo(() => {
    const map = new Map<string, UserDeal[]>();
    for (const deal of filtered) {
      const current = map.get(deal.playerId) ?? [];
      current.push(deal);
      map.set(deal.playerId, current);
    }
    return Array.from(map.entries()).map(([playerId, playerDeals]) => {
      const player = playersById.get(playerId);
      const sortedDeals = [...playerDeals].sort((a, b) => {
        return Number(isActionable(b)) - Number(isActionable(a)) || offerValue(b) - offerValue(a);
      });
      const top = sortedDeals[0];
      return {
        playerId,
        deals: sortedDeals,
        player,
        top,
        actionable: sortedDeals.filter(isActionable).length,
        highest: Math.max(...sortedDeals.map(offerValue), 0),
      };
    }).sort((a, b) => {
      return Number(b.actionable > 0) - Number(a.actionable > 0)
        || b.actionable - a.actionable
        || b.highest - a.highest
        || (playersById.get(b.playerId)?.OVR ?? 0) - (playersById.get(a.playerId)?.OVR ?? 0);
    });
  }, [filtered, playersById]);

  const toggleGroup = (playerId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const emptyMessage = active.length === 0
    ? "No hay ofertas activas ahora mismo. Cuando llegue una propuesta aparecerá aquí organizada automáticamente."
    : "No hay ofertas que coincidan con estos filtros.";

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/12 via-card to-card p-5 md:p-6 shadow-xl shadow-black/10">
        <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-primary text-[0.65rem] uppercase tracking-[0.22em] font-black">
                <Sparkles className="h-3.5 w-3.5" /> Central de mercado
              </div>
              <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight">Ofertas recibidas</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Todas las propuestas por tus jugadores, agrupadas por futbolista para comparar clubes y condiciones de un vistazo.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
              <Metric label="Pendientes" value={pending.length} tone={pending.length ? "amber" : "muted"} icon={<Clock3 className="h-4 w-4" />} />
              <Metric label="Traspasos" value={transferCount} tone="emerald" icon={<ArrowUpRight className="h-4 w-4" />} />
              <Metric label="Cesiones" value={loanCount} tone="sky" icon={<ArrowDownLeft className="h-4 w-4" />} />
            </div>
          </div>

          {pending.length > 0 && (
            <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3.5 flex flex-wrap items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
                <Clock3 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-amber-100">{pending.length === 1 ? "1 oferta requiere tu decisión" : `${pending.length} ofertas requieren tu decisión`}</p>
                <p className="text-xs text-amber-100/65 mt-0.5">Aceptar, rechazar o contraofertar desde la propia tarjeta.</p>
              </div>
              <button
                type="button"
                onClick={() => setFilter("pending")}
                className="ml-auto rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-200 hover:bg-amber-300/15 transition"
              >
                Ver pendientes
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card/70 p-3 md:p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar jugador o club..."
              className="w-full rounded-xl border border-border bg-secondary/70 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-primary/50"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-secondary/50 p-1">
              <Filter className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
              {(["all", "permanent", "loan", "pending"] as OfferFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[0.68rem] font-black transition ${filter === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {value === "all" ? "Todas" : value === "permanent" ? "Traspasos" : value === "loan" ? "Cesiones" : "Pendientes"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[0.63rem] uppercase tracking-wider text-muted-foreground font-black">Ordenar</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as OfferSort)} className="bg-transparent text-xs font-bold outline-none">
                <option value="priority">Mi decisión primero</option>
                <option value="recent">Más recientes</option>
                <option value="amount">Mayor oferta</option>
                <option value="rating">Mayor media</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      {groups.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground/60">
            <Layers3 className="h-6 w-6" />
          </div>
          <p className="mt-4 font-black">{emptyMessage}</p>
          <p className="mt-1 text-sm text-muted-foreground">Prueba a cambiar el filtro o la búsqueda.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const player = group.player;
            const isExpanded = expanded.has(group.playerId);
            const playerRole = roleFromPosition(player?.Position ?? "MID");
            const currentClub = player?.Team ? getAllTeams().find((team) => team.name === player.Team) : null;

            return (
              <section key={group.playerId} className={`overflow-hidden rounded-3xl border bg-card shadow-sm transition ${group.actionable ? "border-amber-400/30 shadow-amber-950/10" : "border-border"}`}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.playerId)}
                  className="w-full text-left"
                >
                  <div className="relative overflow-hidden p-4 md:p-5 bg-gradient-to-r from-card via-card to-primary/[0.035]">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                      <PlayerFace name={group.top.playerName} image={player?.card} role={playerRole} size={70} showRing={true} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg md:text-xl font-black truncate">{group.top.playerName}</h3>
                          {player && <span className={`scoreline rounded-lg border px-2 py-1 text-xs font-black ${player.OVR >= 85 ? "border-green-400/30 bg-green-400/10 text-green-200" : "border-border/50 bg-secondary text-foreground"}`}>{player.OVR} MED</span>}
                          {player && <span className="rounded-lg border border-border/50 bg-secondary px-2 py-1 text-[0.65rem] font-bold text-muted-foreground">{player.Age} años</span>}
                          <span className="rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-[0.65rem] font-black text-primary">{group.deals.length} {group.deals.length === 1 ? "oferta" : "ofertas"}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {group.deals.length} clubes interesados</span>
                          <span className="inline-flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5" /> Hasta {shortAmount(group.highest)}</span>
                          {currentClub && <span className="inline-flex items-center gap-1.5"><TeamLogo teamName={currentClub.name} leagueName={leagueName(currentClub.id)} size={18} /> {currentClub.name}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end md:self-center">
                        {group.actionable > 0 && (
                          <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-[0.62rem] uppercase tracking-wider font-black text-amber-200">
                            {group.actionable === 1 ? "Requiere respuesta" : `${group.actionable} requieren respuesta`}
                          </span>
                        )}
                        <span className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary/70 text-muted-foreground">
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                <div className="border-t border-border/60 bg-secondary/20 px-3 py-3 md:px-4 md:py-4">
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {group.deals.map((deal) => {
                      const club = teamById(deal.otherClubId);
                      return (
                        <div key={deal.id} className={`rounded-2xl border p-3 ${isActionable(deal) ? "border-amber-400/20 bg-amber-400/[0.045]" : "border-border/60 bg-card/60"}`}>
                          <div className="flex items-center gap-2.5">
                            <TeamLogo teamName={club?.name ?? deal.otherClubId} leagueName={club ? leagueName(club.id) : ""} size={38} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black">{club?.name ?? deal.otherClubId}</p>
                              <p className="text-[0.68rem] text-muted-foreground truncate">{club ? leagueName(club.id) : "Club"}</p>
                            </div>
                            <span className={`rounded-full border px-2 py-1 text-[0.58rem] font-black uppercase tracking-wider ${typeTone(deal)}`}>{typeLabel(deal)}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-border/50 bg-secondary/60 px-3 py-2">
                              <p className="text-[0.56rem] uppercase tracking-wider text-muted-foreground font-black">Oferta</p>
                              <p className="mt-0.5 text-sm font-black text-primary">{shortAmount(offerValue(deal))}</p>
                            </div>
                            <div className="rounded-xl border border-border/50 bg-secondary/60 px-3 py-2">
                              <p className="text-[0.56rem] uppercase tracking-wider text-muted-foreground font-black">Estado</p>
                              <p className={`mt-0.5 text-[0.72rem] font-black ${isActionable(deal) ? "text-amber-200" : "text-muted-foreground"}`}>{stageLabel(deal.stage)}</p>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {isLoan(deal) ? (
                              <>
                                <span className="rounded-lg border border-sky-400/15 bg-sky-400/5 px-2 py-1 text-[0.58rem] font-bold text-sky-100/80">Mi club paga {Math.round((deal.offer.clauses.wageShare ?? 0) * 100)}% ficha</span>
                                <span className="rounded-lg border border-border/50 bg-secondary/50 px-2 py-1 text-[0.58rem] font-bold text-muted-foreground">{deal.offer.clauses.loanDurationMonths || 12} meses</span>
                                {deal.offer.type !== "loan" && <span className="rounded-lg border border-border/50 bg-secondary/50 px-2 py-1 text-[0.58rem] font-bold text-muted-foreground">{deal.offer.type === "loan-option" ? "Opción" : "Compra obligatoria"} · {shortAmount(deal.offer.clauses.optionFee ?? 0)}</span>}
                              </>
                            ) : (
                              <span className="rounded-lg border border-emerald-400/15 bg-emerald-400/5 px-2 py-1 text-[0.58rem] font-bold text-emerald-100/80">Futura venta · {Math.round((deal.offer.clauses.sellOnPercent ?? 0) * 100)}%</span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[0.62rem] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {deal.updatedOn}</span>
                            {deal.competition > 0 && <span className="inline-flex items-center gap-1 text-primary"><Trophy className="h-3 w-3" /> {deal.competition} en competencia</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
                    <p className="text-[0.68rem] text-muted-foreground">Abre el grupo para revisar y gestionar cada negociación.</p>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.playerId)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[0.68rem] font-black text-primary hover:bg-primary/10 transition"
                    >
                      {isExpanded ? "Ocultar negociaciones" : "Gestionar ofertas"}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-3 border-t border-border/60 bg-black/[0.03] p-3 md:p-4">
                    {group.deals.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        onImprove={onImprove}
                        onAcceptDemand={onAcceptDemand}
                        onImproveWage={onImproveWage}
                        onConfirm={onConfirm}
                        onAbandon={onAbandon}
                        onAcceptIncoming={onAcceptIncoming}
                        onCounterIncoming={onCounterIncoming}
                        onCounterOutgoing={onCounterOutgoing}
                        onRejectIncoming={onRejectIncoming}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone, icon }: { label: string; value: number; tone: "amber" | "emerald" | "sky" | "muted"; icon: ReactNode }) {
  const toneClass = tone === "amber"
    ? "text-amber-200 bg-amber-400/10 border-amber-400/20"
    : tone === "emerald"
      ? "text-emerald-200 bg-emerald-400/10 border-emerald-400/20"
      : tone === "sky"
        ? "text-sky-200 bg-sky-400/10 border-sky-400/20"
        : "text-muted-foreground bg-secondary/70 border-border/60";
  return (
    <div className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 opacity-80">{icon}<span className="text-[0.56rem] uppercase tracking-wider font-black">{label}</span></div>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

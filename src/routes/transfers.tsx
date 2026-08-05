import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { TEAMS, teamById, getAllTeams, LeagueId, LEAGUES, leagueIdFromName } from "@/data/teams";
import type { Position } from "@/data/players";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usePlayersStore,
  formatEuro,
  marketValueEuros,
  mapEaPosition,
  POS_LABEL_ES,
  FcPlayer,
} from "@/store/playersStore";
import { Search, Wallet, UserPlus, Filter, X } from "lucide-react";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";
import { useUserMarket } from "@/hooks/useUserMarket";
import { NegotiationModal } from "@/components/market/NegotiationModal";
import { DealCard } from "@/components/market/DealCard";
import { MarketFeed } from "@/components/market/MarketFeed";
import type { ScoutingReport } from "@/lib/transfers";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

// Filter option types
type PriceBracket = "all" | "0-1" | "1-5" | "5-15" | "15-40" | "40-80" | "80-150" | "150+";
type AgeBracket = "all" | "16-20" | "21-25" | "26-30" | "31-35" | "36+";
type RatingBracket = "all" | "<70" | "70-75" | "75-80" | "80-85" | "85-90" | "90+";
type SortField = "ovr" | "age" | "price";
type SortOrder = "asc" | "desc";

interface FilterState {
  position: Position | "all";
  price: PriceBracket;
  league: LeagueId | "all";
  team: string;
  age: AgeBracket;
  rating: RatingBracket;
  sortField: SortField;
  sortOrder: SortOrder;
}

interface FilterOption<T> {
  value: T;
  label: string;
}

// Filter definitions with explicit category labels
const POSITION_OPTIONS: FilterOption<Position | "all">[] = [
  { value: "all", label: "Posición: Todas" },
  { value: "GK", label: "Portero" },
  { value: "DEF", label: "Defensa" },
  { value: "MID", label: "Mediocentro" },
  { value: "FWD", label: "Delantero" },
];

const PRICE_OPTIONS: FilterOption<PriceBracket>[] = [
  { value: "all", label: "Precio: Todos" },
  { value: "0-1", label: "Menos de 1M" },
  { value: "1-5", label: "1M - 5M" },
  { value: "5-15", label: "5M - 15M" },
  { value: "15-40", label: "15M - 40M" },
  { value: "40-80", label: "40M - 80M" },
  { value: "80-150", label: "80M - 150M" },
  { value: "150+", label: "150M+" },
];

const AGE_OPTIONS: FilterOption<AgeBracket>[] = [
  { value: "all", label: "Edad: Todas" },
  { value: "16-20", label: "16 - 20 años" },
  { value: "21-25", label: "21 - 25 años" },
  { value: "26-30", label: "26 - 30 años" },
  { value: "31-35", label: "31 - 35 años" },
  { value: "36+", label: "36+ años" },
];

const RATING_OPTIONS: FilterOption<RatingBracket>[] = [
  { value: "all", label: "Media: Todas" },
  { value: "<70", label: "Menos de 70" },
  { value: "70-75", label: "70 - 75" },
  { value: "75-80", label: "75 - 80" },
  { value: "80-85", label: "80 - 85" },
  { value: "85-90", label: "85 - 90" },
  { value: "90+", label: "90+" },
];

const SORT_FIELD_OPTIONS: FilterOption<SortField>[] = [
  { value: "ovr", label: "Ordenar por: Valoración" },
  { value: "age", label: "Ordenar por: Edad" },
  { value: "price", label: "Ordenar por: Precio" },
];

const SORT_ORDER_OPTIONS: FilterOption<SortOrder>[] = [
  { value: "desc", label: "↓ Descendente" },
  { value: "asc", label: "↑ Ascendente" },
];

// Helper to get all leagues with proper names and flags
function getLeaguesFromTeams(): FilterOption<LeagueId | "all">[] {
  const allLeagues = Object.values(LEAGUES);
  return [
    { value: "all", label: "Liga: Todas" },
    ...allLeagues.map((l) => ({
      value: l.id as LeagueId,
      label: `${l.flag} ${l.name}`,
    })),
  ];
}

// Helper to get teams for a specific league
function getTeamsForLeague(league: LeagueId | "all"): FilterOption<string>[] {
  if (league === "all") return [{ value: "all", label: "Equipo: Todos" }];
  const teams = getAllTeams().filter((t) => t.league === league);
  return [
    { value: "all", label: "Equipo: Todos" },
    ...teams.map((t) => ({ value: t.name, label: t.name })),
  ];
}

// Combined filter logic
function applyFilters(
  players: FcPlayer[],
  filters: FilterState,
  inRoster: Set<string>,
  searchQuery: string,
  teamAverages: Record<string, number>
): FcPlayer[] {
  return players.filter((p) => {
    const id = String(p.ID);

    // Exclude players in user's roster
    if (inRoster.has(id)) return false;

    // Search query filter
    if (searchQuery && !p.Name.toLowerCase().includes(searchQuery)) return false;

    // Position filter
    if (filters.position !== "all" && mapEaPosition(p.Position) !== filters.position)
      return false;

    // Price filter
    if (filters.price !== "all") {
      const teamAvg = teamAverages[p.Team] || 75;
      const cost = marketValueEuros(p, "", "", teamAvg);
      const costM = cost / 1_000_000;
      switch (filters.price) {
        case "0-1":
          if (costM > 1) return false;
          break;
        case "1-5":
          if (costM < 1 || costM > 5) return false;
          break;
        case "5-15":
          if (costM < 5 || costM > 15) return false;
          break;
        case "15-40":
          if (costM < 15 || costM > 40) return false;
          break;
        case "40-80":
          if (costM < 40 || costM > 80) return false;
          break;
        case "80-150":
          if (costM < 80 || costM > 150) return false;
          break;
        case "150+":
          if (costM < 150) return false;
          break;
      }
    }

    // League filter - use player's League field converted to ID
    if (filters.league !== "all") {
      const playerLeagueId = leagueIdFromName(p.League);
      if (playerLeagueId !== filters.league) return false;
    }

    // Team filter
    if (filters.team !== "all" && p.Team !== filters.team) return false;

    // Age filter
    if (filters.age !== "all") {
      switch (filters.age) {
        case "16-20":
          if (p.Age < 16 || p.Age > 20) return false;
          break;
        case "21-25":
          if (p.Age < 21 || p.Age > 25) return false;
          break;
        case "26-30":
          if (p.Age < 26 || p.Age > 30) return false;
          break;
        case "31-35":
          if (p.Age < 31 || p.Age > 35) return false;
          break;
        case "36+":
          if (p.Age < 36) return false;
          break;
      }
    }

    // Rating filter
    if (filters.rating !== "all") {
      switch (filters.rating) {
        case "<70":
          if (p.OVR >= 70) return false;
          break;
        case "70-75":
          if (p.OVR < 70 || p.OVR > 75) return false;
          break;
        case "75-80":
          if (p.OVR < 75 || p.OVR > 80) return false;
          break;
        case "80-85":
          if (p.OVR < 80 || p.OVR > 85) return false;
          break;
        case "85-90":
          if (p.OVR < 85 || p.OVR > 90) return false;
          break;
        case "90+":
          if (p.OVR < 90) return false;
          break;
      }
    }

    return true;
  });
}

export const Route = createFileRoute("/transfers")({ component: TransfersPage });

const TEAM_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  TEAMS.map((t) => [t.name, t.id]),
);

function ovrBadgeClass(ovr: number): string {
  if (ovr >= 85) return "bg-green-500/20 text-green-300 border-green-500/40";
  if (ovr >= 75) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
  return "bg-muted text-muted-foreground border-border/40";
}

type MarketTab = "market" | "deals" | "offers" | "feed";

const TABS: { value: MarketTab; label: string }[] = [
  { value: "market", label: "Buscar jugadores" },
  { value: "deals", label: "Mis negociaciones" },
  { value: "offers", label: "Ofertas recibidas" },
  { value: "feed", label: "Rumores y traspasos" },
];

function TransfersPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const budget = usePlayersStore((s) => s.budget);
  const rawPlayers = usePlayersStore((s) => s.getRawPlayers?.() || []);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const rosterIds = usePlayersStore((s) => s.rosterIds);
  const { isMarketOpen } = useTransferMarket();
  const market = useUserMarket(ready);

  const [save, setSave] = useState<SaveGame | null>(null);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [tab, setTab] = useState<MarketTab>("market");

  // Jugador seleccionado para negociar y su informe de ojeadores.
  const [target, setTarget] = useState<FcPlayer | null>(null);
  const [report, setReport] = useState<ScoutingReport | null>(null);

  // Calculate team averages for proper discount application
  const teamAverages = useMemo(() => {
    const ratings: Record<string, number[]> = {};
    for (const p of rawPlayers) {
      if (!ratings[p.Team]) ratings[p.Team] = [];
      ratings[p.Team].push(p.OVR);
    }
    const averages: Record<string, number> = {};
    for (const [team, teamRatings] of Object.entries(ratings)) {
      averages[team] =
        teamRatings.length > 0
          ? Math.round(teamRatings.reduce((a, b) => a + b, 0) / teamRatings.length)
          : 75;
    }
    return averages;
  }, [rawPlayers]);

  const [filters, setFilters] = useState<FilterState>({
    position: "all",
    price: "all",
    league: "all",
    team: "all",
    age: "all",
    rating: "all",
    sortField: "ovr",
    sortOrder: "desc",
  });

  useEffect(() => {
    setFilters((prev) => ({ ...prev, team: "all" }));
  }, [filters.league]);

  useEffect(() => {
    const s = loadSave();
    if (!s) {
      navigate({ to: "/" });
      return;
    }
    setSave(s);
    if (!myTeamId) setMyTeam(s.myTeamId);
  }, [navigate, myTeamId, setMyTeam]);

  const inRoster = useMemo(() => new Set(rosterIds), [rosterIds]);

  const players = useMemo(() => {
    if (!ready) return [];
    const filtered = applyFilters(
      rawPlayers,
      filters,
      inRoster,
      search.trim().toLowerCase(),
      teamAverages,
    );
    const sorted = filtered.sort((a, b) => {
      let comparison = 0;
      switch (filters.sortField) {
        case "ovr":
          comparison = a.OVR - b.OVR;
          break;
        case "age":
          comparison = a.Age - b.Age;
          break;
        case "price": {
          const avgA = teamAverages[a.Team] || 75;
          const avgB = teamAverages[b.Team] || 75;
          comparison = marketValueEuros(a, "", "", avgA) - marketValueEuros(b, "", "", avgB);
          break;
        }
      }
      return filters.sortOrder === "asc" ? comparison : -comparison;
    });
    return sorted.slice(0, 250);
  }, [ready, filters, inRoster, search, rawPlayers, teamAverages]);

  const activeFiltersCount = useMemo(
    () =>
      (["position", "price", "league", "team", "age", "rating"] as const).filter(
        (key) => filters[key] !== "all",
      ).length,
    [filters],
  );

  const leagueOptions = useMemo(() => getLeaguesFromTeams(), []);
  const teamOptions = useMemo(() => getTeamsForLeague(filters.league), [filters.league]);

  const resetFilters = () => {
    setFilters({
      position: "all",
      price: "all",
      league: "all",
      team: "all",
      age: "all",
      rating: "all",
      sortField: "ovr",
      sortOrder: "desc",
    });
    setSearch("");
  };

  /** Abre la negociación con el informe real del motor de mercado. */
  function openNegotiation(player: FcPlayer) {
    setTarget(player);
    setReport(market.scout(String(player.ID)));
  }

  if (!save) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <PlayersLoading message="Cargando mercado de fichajes…" />
      </div>
    );
  }

  const myTeam = myTeamId ? teamById(myTeamId) : null;
  const openDeals = market.outgoing.filter((d) => d.stage !== "completed" && d.stage !== "failed");
  const openOffers = market.incoming.filter((d) => d.stage !== "completed" && d.stage !== "failed");

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <MarketStatusBanner className="mb-6" />

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black">Mercado de fichajes</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Negociaciones reales con clubes y jugadores
            {myTeam ? ` · ${myTeam.name}` : ""}
            {market.deadlineDay ? " · último día de mercado" : ""}
          </p>
        </div>
        <div className="panel-glow px-4 py-3 flex items-center gap-3 min-w-[200px]">
          <Wallet className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Presupuesto</p>
            <p className="text-xl font-black scoreline text-primary">{formatEuro(budget)}</p>
          </div>
        </div>
      </div>

      {/* Pestañas del mercado */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((option) => {
          const count =
            option.value === "deals"
              ? openDeals.length
              : option.value === "offers"
                ? openOffers.length
                : 0;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTab(option.value)}
              className={`px-3 py-2 rounded-lg text-sm font-bold border transition ${
                tab === option.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary/50"
              }`}
            >
              {option.label}
              {count > 0 && (
                <span className="ml-2 rounded-full bg-secondary text-foreground px-2 py-0.5 text-xs">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "market" && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre…"
                className="w-full bg-secondary border border-border rounded-lg pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition ${
                showFilters || activeFiltersCount > 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary/50"
              }`}
            >
              <Filter className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="ml-1 bg-primary-foreground text-primary rounded-full px-2 py-0.5 text-xs">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="panel p-4 mb-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Filtros avanzados</h3>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    <X className="h-3 w-3" />
                    Limpiar filtros
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <SelectField
                  label="Posición"
                  value={filters.position}
                  options={POSITION_OPTIONS}
                  onChange={(value) =>
                    setFilters((prev) => ({ ...prev, position: value as Position | "all" }))
                  }
                />
                <SelectField
                  label="Precio"
                  value={filters.price}
                  options={PRICE_OPTIONS}
                  onChange={(value) => setFilters((prev) => ({ ...prev, price: value as PriceBracket }))}
                />
                <SelectField
                  label="Edad"
                  value={filters.age}
                  options={AGE_OPTIONS}
                  onChange={(value) => setFilters((prev) => ({ ...prev, age: value as AgeBracket }))}
                />
                <SelectField
                  label="Media"
                  value={filters.rating}
                  options={RATING_OPTIONS}
                  onChange={(value) => setFilters((prev) => ({ ...prev, rating: value as RatingBracket }))}
                />

                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    Liga
                  </label>
                  <Select
                    value={filters.league}
                    onValueChange={(value) =>
                      setFilters((prev) => ({ ...prev, league: value as LeagueId | "all" }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Liga: Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      {leagueOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.value === "all" ? (
                            <span>{opt.label}</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <LeagueLogo
                                league={LEAGUES[opt.value as LeagueId]?.name || ""}
                                size="sm"
                              />
                              <span>{LEAGUES[opt.value as LeagueId]?.name || opt.label}</span>
                            </div>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    Equipo
                  </label>
                  <select
                    value={filters.team}
                    onChange={(e) => setFilters((prev) => ({ ...prev, team: e.target.value }))}
                    disabled={filters.league === "all"}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {teamOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <SelectField
                  label="Ordenar por"
                  value={filters.sortField}
                  options={SORT_FIELD_OPTIONS}
                  onChange={(value) => setFilters((prev) => ({ ...prev, sortField: value as SortField }))}
                />
                <SelectField
                  label="Dirección"
                  value={filters.sortOrder}
                  options={SORT_ORDER_OPTIONS}
                  onChange={(value) => setFilters((prev) => ({ ...prev, sortOrder: value as SortOrder }))}
                />
              </div>
            </div>
          )}

          {players.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-muted-foreground">
              No hay jugadores que coincidan con los filtros.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {players.map((p) => {
                const id = String(p.ID);
                const pos = mapEaPosition(p.Position);
                const teamAvg = teamAverages[p.Team] || 75;
                const cost = marketValueEuros(p, "", "", teamAvg);
                const clubId = TEAM_NAME_TO_ID[p.Team];
                const club = clubId ? teamById(clubId) : null;
                const negotiating = market.deals.some(
                  (d) => d.playerId === id && d.stage !== "completed" && d.stage !== "failed",
                );

                return (
                  <article
                    key={id}
                    className="panel overflow-hidden flex flex-col hover:border-primary/40 transition"
                  >
                    <div className="flex gap-3 p-3 border-b border-border/40">
                      <div className="w-14 h-[4.5rem] shrink-0 rounded overflow-hidden bg-secondary/60 grid place-items-center">
                        {p.card ? (
                          <img
                            src={p.card}
                            alt=""
                            className="w-full h-full object-cover object-top"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-white/5 opacity-80" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold truncate text-sm leading-tight">{p.Name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {POS_LABEL_ES[pos]} · {p.Age}a
                        </p>
                        {club && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <TeamLogo
                              teamName={club.name}
                              leagueName={getLeagueName(club.league)}
                              size={18}
                            />
                            <span className="text-[0.65rem] text-muted-foreground truncate">
                              {p.Team}
                            </span>
                          </div>
                        )}
                      </div>
                      <span
                        className={`scoreline text-sm font-black px-2 py-1 rounded border h-fit ${ovrBadgeClass(p.OVR)}`}
                      >
                        {p.OVR}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-3 mt-auto">
                      <div>
                        <p className="text-[0.6rem] uppercase text-muted-foreground">Valor de mercado</p>
                        <p className="font-black scoreline text-primary">{formatEuro(cost)}</p>
                      </div>
                      <button
                        type="button"
                        disabled={!isMarketOpen || negotiating || !market.ready}
                        onClick={() => openNegotiation(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {negotiating ? "Negociando" : "Negociar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "deals" && (
        <div className="space-y-3">
          {market.outgoing.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-muted-foreground">
              No tienes negociaciones abiertas. Busca un jugador y envía una oferta.
            </div>
          ) : (
            market.outgoing.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                onImprove={market.improveOffer}
                onAcceptDemand={market.acceptDemand}
                onImproveWage={market.improveWage}
                onConfirm={market.confirmDeal}
                onAbandon={market.abandonDeal}
                onAcceptIncoming={market.acceptIncoming}
                onCounterIncoming={market.counterIncoming}
                onRejectIncoming={market.rejectIncoming}
              />
            ))
          )}
        </div>
      )}

      {tab === "offers" && (
        <div className="space-y-3">
          {market.incoming.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-muted-foreground">
              Ningún club ha ofertado por tus jugadores todavía.
            </div>
          ) : (
            market.incoming.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                onImprove={market.improveOffer}
                onAcceptDemand={market.acceptDemand}
                onImproveWage={market.improveWage}
                onConfirm={market.confirmDeal}
                onAbandon={market.abandonDeal}
                onAcceptIncoming={market.acceptIncoming}
                onCounterIncoming={market.counterIncoming}
                onRejectIncoming={market.rejectIncoming}
              />
            ))
          )}
        </div>
      )}

      {tab === "feed" && (
        <MarketFeed
          rumors={market.rumors}
          history={market.history}
          summary={market.summary}
          userDeals={market.deals}
          myTeamId={myTeamId}
        />
      )}

      {target && (
        <NegotiationModal
          playerName={target.Name}
          playerCard={target.card}
          ovr={target.OVR}
          age={target.Age}
          clubName={target.Team}
          report={report}
          budget={budget}
          onClose={() => setTarget(null)}
          onSubmit={({ amount, wageOffer, clauses }) => {
            market.makeOffer({ playerId: String(target.ID), amount, wageOffer, clauses });
            setTarget(null);
          }}
        />
      )}
    </div>
  );
}

/** Desplegable simple reutilizado por los filtros. */
function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

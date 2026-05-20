import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { TEAMS, teamById, getAllTeams, LeagueId, LEAGUES, leagueIdFromName } from "@/data/teams";
import type { Position } from "@/data/players";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import {
  usePlayersStore,
  formatEuro,
  marketValueEuros,
  mapEaPosition,
  POS_LABEL_ES,
  FcPlayer,
} from "@/store/playersStore";
import { toast } from "sonner";
import { Search, Wallet, UserPlus, Filter, X } from "lucide-react";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";

// Filter option types
type PriceBracket = "all" | "0-5" | "5-15" | "15-40" | "40-80" | "80+";
type AgeBracket = "all" | "16-20" | "21-25" | "26-30" | "31+";

interface FilterState {
  position: Position | "all";
  price: PriceBracket;
  league: LeagueId | "all";
  team: string;
  age: AgeBracket;
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
  { value: "0-5", label: "0 - 5M" },
  { value: "5-15", label: "5M - 15M" },
  { value: "15-40", label: "15M - 40M" },
  { value: "40-80", label: "40M - 80M" },
  { value: "80+", label: "80M+" },
];

const AGE_OPTIONS: FilterOption<AgeBracket>[] = [
  { value: "all", label: "Edad: Todas" },
  { value: "16-20", label: "16 - 20 años" },
  { value: "21-25", label: "21 - 25 años" },
  { value: "26-30", label: "26 - 30 años" },
  { value: "31+", label: "31+ años" },
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
  searchQuery: string
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
      const cost = marketValueEuros(p);
      const costM = cost / 1_000_000;
      switch (filters.price) {
        case "0-5":
          if (costM > 5) return false;
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
        case "80+":
          if (costM < 80) return false;
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
        case "31+":
          if (p.Age < 31) return false;
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
  if (ovr >= 75) return "bg-yellow-500/20 text-yellow-500/40";
  return "bg-muted text-muted-foreground border-border/40";
}

function TransfersPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const budget = usePlayersStore((s) => s.budget);
  const buyPlayer = usePlayersStore((s) => s.buyPlayer);
  const rawPlayers = usePlayersStore((s) => s.getRawPlayers?.() || []);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const rosterIds = usePlayersStore((s) => s.rosterIds);
  const { isMarketOpen } = useTransferMarket();

  const [save, setSave] = useState<SaveGame | null>(null);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Advanced filter states
  const [filters, setFilters] = useState<FilterState>({
    position: "all",
    price: "all",
    league: "all",
    team: "all",
    age: "all",
  });

  // Reset team filter when league changes
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
    const allPlayers = rawPlayers.length > 0 ? rawPlayers : [];
    const filtered = applyFilters(
      allPlayers,
      filters,
      inRoster,
      search.trim().toLowerCase()
    );
    return filtered.sort((a, b) => b.OVR - a.OVR).slice(0, 100);
  }, [ready, filters, inRoster, search, rawPlayers]);

  const activeFiltersCount = useMemo(() => {
    return Object.entries(filters).filter(([key, val]) => {
      if (key === "position") return val !== "all";
      if (key === "price") return val !== "all";
      if (key === "league") return val !== "all";
      if (key === "team") return val !== "all";
      if (key === "age") return val !== "all";
      return false;
    }).length;
  }, [filters]);

  const leagueOptions = useMemo(() => getLeaguesFromTeams(), []);
  const teamOptions = useMemo(
    () => getTeamsForLeague(filters.league),
    [filters.league]
  );

  const resetFilters = () => {
    setFilters({
      position: "all",
      price: "all",
      league: "all",
      team: "all",
      age: "all",
    });
    setSearch("");
  };

  function handleBuy(playerId: string, name: string, cost: number) {
    const result = buyPlayer(playerId, cost);
    if (result.ok) {
      toast.success(`${name} fichado`, {
        description: `Coste: ${formatEuro(cost)} · Saldo: ${formatEuro(usePlayersStore.getState().budget)}`,
      });
    } else {
      toast.error("No se pudo fichar", { description: result.reason });
    }
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

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <MarketStatusBanner className="mb-6" />

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black">Mercado de fichajes</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Hasta 100 resultados · jugadores fuera de tu plantilla
            {myTeam ? ` · ${myTeam.name}` : ""}
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

      {/* Search and Filter Toggle */}
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

      {/* Advanced Filters Panel */}
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
            {/* Position Filter */}
            <div className="space-y-1.5">
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Posición
              </label>
              <select
                value={filters.position}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    position: e.target.value as Position | "all",
                  }))
                }
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
              >
                {POSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Price Filter */}
            <div className="space-y-1.5">
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Precio
              </label>
              <select
                value={filters.price}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    price: e.target.value as PriceBracket,
                  }))
                }
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
              >
                {PRICE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Age Filter */}
            <div className="space-y-1.5">
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Edad
              </label>
              <select
                value={filters.age}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    age: e.target.value as AgeBracket,
                  }))
                }
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
              >
                {AGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* League Filter */}
            <div className="space-y-1.5">
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Liga
              </label>
              <select
                value={filters.league}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    league: e.target.value as LeagueId | "all",
                  }))
                }
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
              >
                {leagueOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Team Filter - Disabled when no league selected */}
            <div className="space-y-1.5">
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Equipo
              </label>
              <select
                value={filters.team}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, team: e.target.value }))
                }
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
          </div>

          {/* Active Filters Summary */}
          {activeFiltersCount > 0 && (
            <div className="pt-2 border-t border-border/40">
              <p className="text-xs text-muted-foreground">
                Filtros activos:{" "}
                <span className="text-foreground">
                  {[
                    filters.position !== "all" &&
                      POSITION_OPTIONS.find((o) => o.value === filters.position)
                        ?.label,
                    filters.price !== "all" &&
                      PRICE_OPTIONS.find((o) => o.value === filters.price)
                        ?.label,
                    filters.age !== "all" &&
                      AGE_OPTIONS.find((o) => o.value === filters.age)?.label,
                    filters.league !== "all" &&
                      leagueOptions.find((o) => o.value === filters.league)
                        ?.label,
                    filters.team !== "all" && filters.team,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </span>
              </p>
            </div>
          )}
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
            const cost = marketValueEuros(p);
            const clubId = TEAM_NAME_TO_ID[p.Team];
            const club = clubId ? teamById(clubId) : null;
            const canAfford = budget >= cost;

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
                      <span className="text-2xl opacity-40">⚽</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate text-sm leading-tight">{p.Name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {POS_LABEL_ES[pos]} · {p.Age}a
                    </p>
                    {club && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <TeamBadge team={club} size={18} />
                        <span className="text-[0.65rem] text-muted-foreground truncate">{p.Team}</span>
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
                    <p className="text-[0.6rem] uppercase text-muted-foreground">Valor</p>
                    <p className="font-black scoreline text-primary">{formatEuro(cost)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!canAfford || !isMarketOpen}
                    onClick={() => handleBuy(id, p.Name, cost)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Fichar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

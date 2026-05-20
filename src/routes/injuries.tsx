import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { teamById, LEAGUES, type LeagueId, getAllTeams } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { selectInjuredPlayers } from "@/store/playersStore";
import type { Player } from "@/data/players";
import { Activity, Shield, Check, Filter, X } from "lucide-react";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

interface FilterState {
  myTeam: boolean;
  league: LeagueId | "all";
  team: string;
}

interface FilterOption<T> {
  value: T;
  label: string;
}

function getLeaguesFromTeams(): FilterOption<LeagueId | "all">[] {
  const allLeagues = Object.values(LEAGUES);
  return [
    { value: "all", label: "🌍 Todas las ligas" },
    ...allLeagues.map((l) => ({
      value: l.id as LeagueId,
      label: `${l.flag} ${l.name}`,
    })),
  ];
}

function getTeamsForLeague(league: LeagueId | "all", allTeams: ReturnType<typeof getAllTeams>): FilterOption<string>[] {
  if (league === "all") return [{ value: "all", label: "Todos los equipos" }];
  const teams = allTeams.filter((t) => t.league === league);
  return [
    { value: "all", label: "Todos los equipos" },
    ...teams.map((t) => ({ value: t.id, label: t.name })),
  ];
}

export const Route = createFileRoute("/injuries")({ component: InjuriesPage });

function InjuriesPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const allTeams = useMemo(() => getAllTeams(), []);

  const [filters, setFilters] = useState<FilterState>({
    myTeam: true,
    league: "all",
    team: "all",
  });

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s);
  }, [navigate]);

  // Reset team filter when league changes
  useEffect(() => {
    setFilters((prev) => ({ ...prev, team: "all" }));
  }, [filters.league]);

  const allInjuredPlayers = useMemo(() => {
    if (!save || !ready) return [];
    // Pass myTeamId to filter at source when myTeam is selected
    const teamFilter = filters.myTeam ? save.myTeamId : undefined;
    return selectInjuredPlayers(save.currentMatchday, teamFilter);
  }, [save, ready, filters.myTeam]);

  const filteredList = useMemo(() => {
    let list = allInjuredPlayers;

    // Filter by my team (default behavior)
    if (filters.myTeam && save) {
      list = list.filter((p) => String(p.teamId) === String(save.myTeamId));
    }

    // Filter by league
    if (filters.league !== "all") {
      list = list.filter((p) => {
        const playerTeam = teamById(p.teamId);
        return playerTeam?.league === filters.league;
      });
    }

    // Filter by specific team
    if (filters.team !== "all") {
      list = list.filter((p) => p.teamId === filters.team);
    }

    return list;
  }, [allInjuredPlayers, filters, save]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (!filters.myTeam) count++; // Count as filter when showing other teams
    if (filters.league !== "all") count++;
    if (filters.team !== "all") count++;
    return count;
  }, [filters]);

  const leagueOptions = useMemo(() => getLeaguesFromTeams(), []);
  const teamOptions = useMemo(
    () => getTeamsForLeague(filters.league, allTeams),
    [filters.league, allTeams]
  );

  const resetFilters = () => {
    setFilters({
      myTeam: true,
      league: "all",
      team: "all",
    });
    setShowFilters(false);
  };

  if (!save) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <PlayersLoading message="Cargando datos de jugadores…" />
      </div>
    );
  }

  const isEmpty = filteredList.length === 0;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-destructive/20 text-destructive grid place-items-center">
            <Activity className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-black">Parte de lesiones</h1>
        </div>

        {/* Filter Toggle Button */}
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

      {/* Filters Panel */}
      {showFilters && (
        <div className="panel p-4 mb-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Filtros</h3>
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
            {/* My Team Toggle - Removed Todos button, always defaults to My Team */}
            <div className="space-y-1.5">
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Equipo
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilters((f) => ({ ...f, myTeam: true, league: "all", team: "all" }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                    filters.myTeam
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:border-primary/50"
                  }`}
                >
                  Mi equipo
                </button>
                <button
                  onClick={() => setFilters((f) => ({ ...f, myTeam: false }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                    !filters.myTeam
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:border-primary/50"
                  }`}
                >
                  Otros equipos
                </button>
              </div>
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

            {/* Team Filter */}
            <div className="space-y-1.5">
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Equipo específico
              </label>
              <select
                value={filters.team}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, team: e.target.value }))
                }
                disabled={filters.league === "all" && filters.team === "all"}
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
        </div>
      )}

      {/* Empty State */}
      {isEmpty ? (
        <div className="panel p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary grid place-items-center mx-auto mb-4">
            <Shield className="h-8 w-8" />
          </div>
          <p className="text-sm text-muted-foreground">
            {filters.myTeam ? "Plantilla 100% sana." : "Sin lesionados registrados todavía."}
          </p>
          {activeFiltersCount > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Prueba a ajustar los filtros
            </p>
          )}
        </div>
      ) : (
        /* List */
        <div className="panel divide-y divide-border/40">
          {filteredList.map((p) => {
            const team = teamById(p.teamId);
            const md = save.currentMatchday[team.league];
            const out = p.injuredUntil - md;
            return (
              <div key={p.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3">
                <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={32} />
                <div className="min-w-0">
                  <div className="font-bold truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {team.short} · <span className="capitalize">{p.injuryReason ?? "lesión"}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black scoreline text-destructive">{out}</div>
                  <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                    {out === 1 ? "jornada" : "jornadas"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

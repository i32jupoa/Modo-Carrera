import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { teamById, LEAGUES, type LeagueId, getAllTeams } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { selectInjuredPlayers } from "@/store/playersStore";
import type { Player } from "@/data/players";
import { Activity, Shield, Filter, X, Stethoscope, AlertTriangle, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

function getTeamsForLeague(
  league: LeagueId | "all",
  allTeams: ReturnType<typeof getAllTeams>,
): FilterOption<string>[] {
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
    if (!s) {
      navigate({ to: "/" });
      return;
    }
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
    [filters.league, allTeams],
  );

  const resetFilters = () => {
    setFilters({
      myTeam: true,
      league: "all",
      team: "all",
    });
    setShowFilters(false);
  };

  const summary = useMemo(() => {
    if (!save) return { total: 0, severe: 0, light: 0, avg: 0 };
    let severe = 0;
    let light = 0;
    let totalOut = 0;
    for (const p of filteredList) {
      const team = teamById(p.teamId);
      const md = save.currentMatchday[team.league] ?? 0;
      const out = p.injuredUntil - md;
      totalOut += out;
      if (out >= 6) severe++;
      else light++;
    }
    return {
      total: filteredList.length,
      severe,
      light,
      avg: filteredList.length ? Math.round(totalOut / filteredList.length) : 0,
    };
  }, [filteredList, save]);

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
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-destructive/40 bg-destructive/15 text-destructive">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black leading-tight">Parte de lesiones</h1>
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              Servicios médicos del club
            </p>
          </div>
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

      {/* Summary tiles */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card/60 p-3">
          <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">
            En enfermería
          </p>
          <p className="scoreline text-2xl font-black text-destructive">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 p-3">
          <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">
            Lesión grave
          </p>
          <p className="scoreline text-2xl font-black text-orange-400">
            <AlertTriangle className="mr-1 inline h-4 w-4" />
            {summary.severe}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 p-3">
          <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">
            Lesión leve
          </p>
          <p className="scoreline text-2xl font-black text-yellow-300">{summary.light}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 p-3">
          <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">
            Baja media
          </p>
          <p className="scoreline text-2xl font-black text-primary">
            <Clock className="mr-1 inline h-4 w-4" />
            {summary.avg}j
          </p>
        </div>
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
                  onClick={() =>
                    setFilters((f) => ({ ...f, myTeam: true, league: "all", team: "all" }))
                  }
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
              <Select
                value={filters.league}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    league: value as LeagueId | "all",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas las ligas" />
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

            {/* Team Filter */}
            <div className="space-y-1.5">
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Equipo específico
              </label>
              <select
                value={filters.team}
                onChange={(e) => setFilters((prev) => ({ ...prev, team: e.target.value }))}
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
            <p className="text-xs text-muted-foreground mt-2">Prueba a ajustar los filtros</p>
          )}
        </div>
      ) : (
        /* List */
        <div className="space-y-2">
          {filteredList.map((p) => {
            const team = teamById(p.teamId);
            const md = save.currentMatchday[team.league];
            const out = p.injuredUntil - md;
            const severe = out >= 6;
            const moderate = out >= 3 && out < 6;
            const tone = severe
              ? "border-destructive/50 from-destructive/15"
              : moderate
                ? "border-orange-500/40 from-orange-500/10"
                : "border-yellow-500/40 from-yellow-500/10";
            const accent = severe
              ? "text-destructive"
              : moderate
                ? "text-orange-400"
                : "text-yellow-300";
            const totalDuration = Math.max(out, 4);
            const recoveryPct = Math.max(
              0,
              Math.min(100, ((totalDuration - out) / totalDuration) * 100),
            );
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border bg-gradient-to-r to-transparent p-3 ${tone}`}
              >
                <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={40} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold">{p.name}</span>
                    <span className="rounded bg-secondary/60 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-foreground/70">
                      {team.short}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[0.65rem] text-muted-foreground">
                    <Activity className={`h-3 w-3 ${accent}`} />
                    <span className="capitalize">{p.injuryReason ?? "lesión muscular"}</span>
                    <span>·</span>
                    <span>{severe ? "Grave" : moderate ? "Moderada" : "Leve"}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                    <div
                      className={`h-full ${
                        severe ? "bg-destructive" : moderate ? "bg-orange-400" : "bg-yellow-400"
                      }`}
                      style={{ width: `${recoveryPct}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className={`scoreline text-2xl font-black ${accent}`}>{out}</div>
                  <div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">
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

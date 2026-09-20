import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { teamById, LEAGUES, type LeagueId, getAllTeams } from "@/data/teams";
import { PlayerFace } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import {
  injuryRemainingDays,
  selectInjuredPlayers,
  usePlayersStore,
} from "@/store/playersStore";
import type { Player } from "@/data/players";
import {
  Activity,
  CalendarDays,
  Clock3,
  Filter,
  HeartPulse,
  Info,
  MapPin,
  ShieldAlert,
  Stethoscope,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function slugifyAssetName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function publicLeagueLogoCandidates(leagueName: string): string[] {
  const encodedLeague = encodeURIComponent(leagueName);
  const slug = slugifyAssetName(leagueName);
  return [
    `/logos/${encodedLeague}/${slug}.svg`,
    `/logos/${encodedLeague}/${slug}.png`,
    `/logos/${encodedLeague}/${encodeURIComponent(leagueName)}.svg`,
    `/logos/${encodedLeague}/${encodeURIComponent(leagueName)}.png`,
  ];
}

function PublicLeagueLogo({
  leagueName,
  size = 28,
  className = "",
}: {
  leagueName: string;
  size?: number;
  className?: string;
}) {
  const [candidate, setCandidate] = useState(0);
  const candidates = publicLeagueLogoCandidates(leagueName);

  if (candidate >= candidates.length) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-[0.52rem] font-black uppercase tracking-tight text-muted-foreground ${className}`}
        style={{ width: size, height: size }}
      >
        {leagueName.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={candidates[candidate]}
      alt={leagueName}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      onError={() => setCandidate((value) => value + 1)}
    />
  );
}

function PublicTeamLogo({
  teamName,
  leagueName,
  size = 32,
  className = "",
}: {
  teamName: string;
  leagueName: string;
  size?: number;
  className?: string;
}) {
  const [candidate, setCandidate] = useState(0);
  const encodedLeague = encodeURIComponent(leagueName);
  const encodedTeam = encodeURIComponent(teamName);
  const teamCandidates = [
    `/logos/${encodedLeague}/${encodedTeam}.png`,
    `/logos/${encodedLeague}/${encodedTeam}.svg`,
  ];

  if (candidate >= teamCandidates.length) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-[0.55rem] font-black text-muted-foreground ${className}`}
        style={{ width: size, height: size }}
      >
        {teamName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((word) => word[0])
          .join("")
          .toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={teamCandidates[candidate]}
      alt={teamName}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      onError={() => setCandidate((value) => value + 1)}
    />
  );
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
    { value: "all", label: "Todas las ligas" },
    ...allLeagues.map((l) => ({
      value: l.id as LeagueId,
      label: l.name,
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

function formatDuration(days: number): string {
  if (days <= 1) return "1 día";
  if (days < 7) return `${days} días`;
  if (days < 14) return "1 semana";
  if (days < 30) return `${Math.round(days / 7)} semanas`;
  if (days < 60) return "1 mes";
  if (days < 90) return `${Math.round(days / 30)} meses`;
  return `${Math.round(days / 30)} meses`;
}

function formatDate(date?: string): string {
  if (!date) return "Sin fecha disponible";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Sin fecha disponible";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function remainingLabel(days: number): string {
  if (days <= 0) return "Recuperado";
  return `${formatDuration(days)} de baja restante`;
}

function injuryTypeAccent(type?: string): string {
  const normalized = (type || "").toLowerCase();
  if (normalized.includes("fractura") || normalized.includes("luxación")) {
    return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  }
  if (normalized.includes("muscular") || normalized.includes("tendinitis")) {
    return "border-primary/30 bg-primary/10 text-primary";
  }
  if (normalized.includes("esguince") || normalized.includes("articular")) {
    return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  }
  return "border-destructive/30 bg-destructive/10 text-destructive";
}

export const Route = createFileRoute("/injuries")({ component: InjuriesPage });

function InjuriesPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const currentDate = usePlayersStore((s) => s.currentDate);
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

  useEffect(() => {
    setFilters((prev) => ({ ...prev, team: "all" }));
  }, [filters.league]);

  const allInjuredPlayers = useMemo(() => {
    if (!save || !ready) return [];
    return selectInjuredPlayers(
      currentDate,
      filters.myTeam ? save.myTeamId : undefined,
      save.currentMatchday,
    );
  }, [save, ready, filters.myTeam, currentDate]);

  const filteredList = useMemo(() => {
    let list = allInjuredPlayers;

    if (filters.league !== "all") {
      list = list.filter((p) => teamById(p.teamId)?.league === filters.league);
    }

    if (filters.team !== "all") {
      list = list.filter((p) => p.teamId === filters.team);
    }

    return list;
  }, [allInjuredPlayers, filters]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (!filters.myTeam) count++;
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
    setFilters({ myTeam: true, league: "all", team: "all" });
    setShowFilters(false);
  };

  const myTeam = save ? teamById(save.myTeamId) : undefined;

  if (!save) return null;
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <PlayersLoading message="Cargando parte médico…" />
      </div>
    );
  }

  const isEmpty = filteredList.length === 0;

  return (
    <div className="mx-auto max-w-6xl p-4 pb-10 md:p-6">
      <div className="relative overflow-hidden rounded-3xl border border-destructive/20 bg-gradient-to-br from-destructive/15 via-card/80 to-background p-5 shadow-xl md:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-destructive/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-destructive/25 bg-destructive/15 text-destructive shadow-inner">
              <Stethoscope className="h-7 w-7" />
            </div>
            <div>
              <p className="mb-1 text-[0.62rem] font-black uppercase tracking-[0.22em] text-destructive/80">
                Servicios médicos
              </p>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">Parte de lesiones</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Estado actualizado de los jugadores de baja. Una lesión bloquea al futbolista para
                cualquier competición hasta la fecha de recuperación.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {myTeam && (
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/45 px-3 py-2 backdrop-blur">
                <PublicTeamLogo
                  teamName={myTeam.name}
                  leagueName={getLeagueName(myTeam.league)}
                  size={30}
                />
                <div>
                  <p className="text-[0.55rem] font-black uppercase tracking-wider text-muted-foreground">
                    Equipo actual
                  </p>
                  <p className="text-xs font-bold">{myTeam.short || myTeam.name}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold transition ${
                showFilters || activeFiltersCount > 0
                  ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/15"
                  : "border-border/60 bg-background/45 hover:border-primary/50 hover:bg-card"
              }`}
            >
              <Filter className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="rounded-full bg-primary-foreground px-1.5 py-0.5 text-[0.62rem] font-black text-primary">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-2 text-[0.65rem] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/35 px-2.5 py-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(currentDate)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/35 px-2.5 py-1.5">
            <HeartPulse className="h-3.5 w-3.5 text-destructive" />
            {filteredList.length} {filteredList.length === 1 ? "jugador de baja" : "jugadores de baja"}
          </span>
        </div>
      </div>

      {showFilters && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-4 shadow-lg backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">Filtrar parte médico</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Consulta las bajas de cualquier equipo o competición.</p>
            </div>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">
                Equipo
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, myTeam: true, league: "all", team: "all" }))}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    filters.myTeam
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background/50 hover:border-primary/50"
                  }`}
                >
                  Mi equipo
                </button>
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, myTeam: false }))}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    !filters.myTeam
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background/50 hover:border-primary/50"
                  }`}
                >
                  Otros equipos
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">
                Liga
              </label>
              <Select
                value={filters.league}
                onValueChange={(value) => setFilters((f) => ({ ...f, league: value as LeagueId | "all" }))}
              >
                <SelectTrigger className="h-11 rounded-xl border-border bg-background/50">
                  <div className="flex min-w-0 items-center gap-2">
                    {filters.league === "all" ? (
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-[0.68rem]">🌍</span>
                    ) : (
                      <PublicLeagueLogo leagueName={getLeagueName(filters.league)} size={22} />
                    )}
                    <SelectValue
                      placeholder="Seleccionar liga"
                      className="truncate"
                    >
                      {filters.league === "all" ? "Todas las ligas" : getLeagueName(filters.league)}
                    </SelectValue>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {leagueOptions.map((option) => {
                    const league = option.value === "all" ? undefined : LEAGUES[option.value as LeagueId];
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2.5">
                          {league ? (
                            <PublicLeagueLogo leagueName={league.name} size={20} />
                          ) : (
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-[0.6rem]">
                              🌍
                            </span>
                          )}
                          <span className="truncate">{option.label}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">
                Equipo concreto
              </label>
              <Select
                value={filters.team}
                onValueChange={(value) => setFilters((f) => ({ ...f, team: value }))}
              >
                <SelectTrigger className="h-11 rounded-xl border-border bg-background/50">
                  <div className="flex min-w-0 items-center gap-2">
                    {filters.team === "all" ? (
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-[0.68rem]">⚽</span>
                    ) : (() => {
                      const selectedTeam = allTeams.find((t) => t.id === filters.team);
                      return selectedTeam ? (
                        <PublicTeamLogo teamName={selectedTeam.name} leagueName={getLeagueName(selectedTeam.league)} size={22} />
                      ) : null;
                    })()}
                    <SelectValue
                      placeholder="Seleccionar equipo"
                      className="truncate"
                    >
                      {filters.team === "all"
                        ? "Todos los equipos"
                        : allTeams.find((t) => t.id === filters.team)?.name || "Seleccionar equipo"}
                    </SelectValue>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {teamOptions.map((option) => {
                    const team = option.value === "all" ? undefined : allTeams.find((t) => t.id === option.value);
                    const leagueName = team ? getLeagueName(team.league) : undefined;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex min-w-0 items-center gap-2.5">
                          {team ? (
                            <PublicTeamLogo teamName={team.name} leagueName={leagueName!} size={20} />
                          ) : (
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-[0.6rem]">
                              ⚽
                            </span>
                          )}
                          <span className="truncate">{option.label}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="mt-5 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/70 to-background p-8 shadow-lg md:p-12">
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full border border-primary/25 bg-primary/10 text-primary shadow-lg shadow-primary/10">
              <ShieldAlert className="h-9 w-9" />
            </div>
            <p className="mt-5 text-2xl font-black">No hay ninguna lesión.</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              La plantilla está disponible. Cuando un jugador sufra una lesión, aparecerá aquí con
              toda la información médica y su fecha estimada de regreso.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {filteredList.map((player) => {
            const team = teamById(player.teamId);
            if (!team) return null;

            const remaining = injuryRemainingDays(player, currentDate, save.currentMatchday[team.league]);
            const total = Math.max(1, player.injuryDurationDays ?? remaining ?? 7);
            const elapsed = Math.max(0, Math.min(total, total - remaining));
            const progress = Math.max(3, Math.min(100, (elapsed / total) * 100));
            const tone = injuryTypeAccent(player.injuryType || player.injuryReason);

            return (
              <article
                key={player.id}
                className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/75 shadow-lg transition hover:-translate-y-0.5 hover:border-destructive/30 hover:shadow-xl"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-destructive/50 to-transparent" />
                <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] lg:p-6">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex shrink-0 flex-col items-center gap-3">
                      <div className="grid h-28 w-28 place-items-center rounded-3xl border border-border/60 bg-background/70 p-4 shadow-xl ring-1 ring-white/5">
                        <PublicTeamLogo
                          teamName={team.name}
                          leagueName={getLeagueName(team.league)}
                          size={92}
                          className="h-[92px] w-[92px]"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background/50 px-2.5 py-1 text-[0.58rem] font-black uppercase tracking-wider text-muted-foreground">
                        <PublicLeagueLogo leagueName={getLeagueName(team.league)} size={18} />
                        {getLeagueName(team.league)}
                      </div>
                    </div>

                    <div className="relative shrink-0 self-start">
                      <div className="rounded-full border-4 border-destructive/20 bg-background p-1 shadow-xl">
                        <PlayerFace
                          name={player.name}
                          image={faceUrl(player.id, player.cardImage)}
                          size={72}
                          showRing={false}
                          className="bg-secondary"
                        />
                      </div>
                      <div className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-destructive text-white shadow-lg">
                        <Activity className="h-3.5 w-3.5" />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-xl font-black tracking-tight">{player.name}</h2>
                        <span className={`rounded-full border px-2.5 py-1 text-[0.58rem] font-black uppercase tracking-wider ${tone}`}>
                          {player.injuryType || "Lesión"}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground/85">OVR {player.rating}</span>
                        <span className="text-border">·</span>
                        <span>{player.positions?.join(" / ") || "Jugador"}</span>
                        <span className="text-border">·</span>
                        <span className="font-semibold text-foreground/85">{team.name}</span>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-2xl border border-border/50 bg-background/40 p-3">
                          <div className="flex items-center gap-2 text-[0.58rem] font-black uppercase tracking-[0.15em] text-muted-foreground">
                            <Info className="h-3.5 w-3.5" />
                            Diagnóstico
                          </div>
                          <p className="mt-1.5 text-sm font-bold">{player.injuryReason || player.injuryType || "Lesión no especificada"}</p>
                        </div>
                        <div className="rounded-2xl border border-border/50 bg-background/40 p-3">
                          <div className="flex items-center gap-2 text-[0.58rem] font-black uppercase tracking-[0.15em] text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            Zona afectada
                          </div>
                          <p className="mt-1.5 text-sm font-bold">{player.injuryArea || "No especificada"}</p>
                        </div>
                        <div className="rounded-2xl border border-border/50 bg-background/40 p-3">
                          <div className="flex items-center gap-2 text-[0.58rem] font-black uppercase tracking-[0.15em] text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Inicio
                          </div>
                          <p className="mt-1.5 text-sm font-bold">{formatDate(player.injuryStartDate)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between rounded-3xl border border-destructive/15 bg-gradient-to-br from-destructive/10 via-background/40 to-background/20 p-4 lg:p-5">
                    <div>
                      <div className="mb-3 flex items-center gap-2 rounded-2xl border border-border/50 bg-background/35 px-2.5 py-2">
                        <PublicLeagueLogo leagueName={getLeagueName(team.league)} size={24} />
                        <span className="text-[0.68rem] font-black uppercase tracking-wider text-foreground/80">
                          {getLeagueName(team.league)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[0.6rem] font-black uppercase tracking-[0.18em] text-muted-foreground">
                            Recuperación
                          </p>
                          <p className="mt-1 text-2xl font-black text-destructive">{remainingLabel(remaining)}</p>
                        </div>
                        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-2.5 text-destructive">
                          <Clock3 className="h-5 w-5" />
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="mb-2 flex items-center justify-between text-[0.62rem] font-bold text-muted-foreground">
                          <span>Progreso de recuperación</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-destructive via-orange-400 to-primary transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-border/50 bg-background/45 p-3">
                        <p className="text-[0.55rem] font-black uppercase tracking-wider text-muted-foreground">Baja total</p>
                        <p className="mt-1 text-sm font-black">{formatDuration(total)}</p>
                      </div>
                      <div className="rounded-2xl border border-border/50 bg-background/45 p-3">
                        <p className="text-[0.55rem] font-black uppercase tracking-wider text-muted-foreground">Regreso estimado</p>
                        <p className="mt-1 text-sm font-black">{formatDate(player.injuredUntilDate)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 bg-background/20 px-5 py-3.5 text-[0.62rem] text-muted-foreground lg:px-6">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                    Jugador bloqueado hasta su recuperación
                  </span>
                  <span className="font-semibold">No disponible para ninguna competición</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

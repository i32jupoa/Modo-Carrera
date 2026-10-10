import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { getCurrentSaveId } from "@/lib/savedGames";
import {
  teamsByLeague,
  teamById,
  overall,
  type LeagueId,
  type Team,
  getAllTeams,
  LEAGUES_BY_COUNTRY,
  LEAGUES,
} from "@/data/teams";
import {
  usePlayersStore,
  ensureStatsForLeague,
  squadForTeam,
  syncSquadFromRoster,
  clubOfPlayer,
  type PlayerStats,
  type FcPlayer,
} from "@/store/playersStore";
import { TeamLogo } from "@/components/TeamLogo";
import { resolveCurrentPlayerClub } from "@/lib/playerClub";
import { CountryFlag } from "@/components/CountryFlag";
import { LeagueLogo } from "@/components/LeagueLogo";
import { loadTactics } from "@/lib/teamTactics";
import {
  estimateTactics,
  estimatedEleven,
  bestFormationForSquad,
  elevenAverage,
  sortByPosition,
  styleLabel,
  getTeamStyle,
  levelLabel,
} from "@/lib/teamProfile";
import { PlayerFace, ROLE_TEXT, roleFromPosition } from "@/components/PlayerFace";
import { formatPositionLabel, sortByPositionGroupAndOvr } from "@/lib/positions";
import { TypicalElevenPitch } from "@/components/TypicalElevenPitch";
import { getPlayerForm } from "@/lib/playerForm";
import { PlayerDetailDialog } from "@/components/PlayerDetailDialog";
import { useAcademyStore } from "@/lib/academy/academyStore";
import { loadAcademyAiClub } from "@/lib/academy/academyAiPersistence";
import { getAcademyStateForInspection, hydrateAcademyAiCache } from "@/lib/academy/academyPromotionEngine";
import type { ClubAcademyState, AcademyStatus } from "@/lib/academy/academyTypes";
import { Search, X, Trophy, CalendarDays, ArrowUp, ArrowDown, Minus, GraduationCap, Sparkles } from "lucide-react";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

// Las plantillas salen del registro central del store, que ya tiene aplicados
// todos los traspasos (los del usuario y los de la IA).

// Helper to get player stats from store
function getPlayerStats(playerId: string): PlayerStats {
  const store = usePlayersStore.getState();
  return (
    store.stats[playerId] ?? {
      goals: 0,
      assists: 0,
      appearances: 0,
      injuredUntil: 0,
      injuryReason: undefined,
      morale: 70,
      formHistory: [],
      yellowCards: 0,
      redCards: 0,
    }
  );
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const Route = createFileRoute("/teams")({ component: TeamsPage });

type AcademyStatusFilter = "all" | "academy" | "called-up" | "loaned" | "listed";

function academyStatusLabel(status: AcademyStatus): string {
  switch (status) {
    case "called-up": return "Convocado";
    case "loaned": return "Cedible / cedido";
    case "listed": return "En venta";
    case "academy": return "En cantera";
    default: return status;
  }
}

function ClubAcademyPanel({
  teamName,
  club,
  isUserTeam,
  loading,
  error,
  onOpenAcademy,
}: {
  teamName: string;
  club?: ClubAcademyState | null;
  isUserTeam: boolean;
  loading: boolean;
  error?: string | null;
  onOpenAcademy: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AcademyStatusFilter>("all");

  useEffect(() => {
    setQuery("");
    setStatusFilter("all");
  }, [teamName]);

  const activePlayers = useMemo(() => {
    const players = (club?.players ?? []).filter((player) =>
      ["academy", "called-up", "loaned", "listed"].includes(player.status),
    );
    const normalizedQuery = norm(query.trim());
    const filtered = players.filter((player) => {
      if (statusFilter !== "all" && player.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return norm(player.name).includes(normalizedQuery)
        || player.positions.some((position) => norm(position).includes(normalizedQuery))
        || norm(player.nation).includes(normalizedQuery);
    });
    return sortByPositionGroupAndOvr(
      filtered,
      (player) => player.positions[0] ?? "MC",
      (player) => Number(player.internalOvr ?? player.ovr),
    );
  }, [club, query, statusFilter]);

  const promisingCount = (club?.players ?? []).filter((player) =>
    ["academy", "called-up", "loaned", "listed"].includes(player.status)
      && player.potentialEstimate.max >= 75
      && player.age <= 21,
  ).length;
  const averageOvr = activePlayers.length
    ? Math.round(activePlayers.reduce((sum, player) => sum + Number(player.internalOvr ?? player.ovr), 0) / activePlayers.length)
    : 0;

  if (loading) {
    return <div className="rounded-2xl border border-border/50 bg-secondary/10 p-8 text-center text-sm text-muted-foreground">Cargando los datos de la cantera de {teamName}…</div>;
  }
  if (!club) {
    return <div role={error ? "alert" : undefined} className={`rounded-2xl border p-8 text-center text-sm ${error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border/50 bg-secondary/10 text-muted-foreground"}`}>{error ?? `No se ha podido cargar la cantera de ${teamName}. Vuelve a seleccionar el club para reintentar.`}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/50 bg-secondary/10 p-3"><div className="text-[0.62rem] uppercase tracking-wider text-muted-foreground">Instalaciones</div><div className="mt-1 text-lg font-black">{club.facilityLevel}/5</div></div>
        <div className="rounded-xl border border-border/50 bg-secondary/10 p-3"><div className="text-[0.62rem] uppercase tracking-wider text-muted-foreground">Canteranos activos</div><div className="mt-1 text-lg font-black">{activePlayers.length}</div></div>
        <div className="rounded-xl border border-border/50 bg-secondary/10 p-3"><div className="text-[0.62rem] uppercase tracking-wider text-muted-foreground">Media de cantera</div><div className="mt-1 text-lg font-black">{activePlayers.length ? averageOvr : "—"}</div></div>
        <div className="rounded-xl border border-border/50 bg-secondary/10 p-3"><div className="text-[0.62rem] uppercase tracking-wider text-muted-foreground">Promesas (POT ≥ 75)</div><div className="mt-1 text-lg font-black text-primary">{promisingCount}</div></div>
      </div>

      <div className="rounded-xl border border-border/40 bg-card/40 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-black"><GraduationCap className="h-4 w-4 text-primary" />Cantera de {teamName}</div>
            <div className="mt-1 text-[0.68rem] text-muted-foreground">Plantilla juvenil completa, ordenada por líneas. Las estadísticas son independientes del primer equipo.</div>
          </div>
          {isUserTeam
            ? <button type="button" onClick={onOpenAcademy} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary">Gestionar mi cantera</button>
            : <span className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-1.5 text-[0.68rem] text-muted-foreground">Consulta · solo lectura</span>}
        </div>

        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar canterano, posición o nacionalidad…"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs outline-none focus:border-primary"
            aria-label="Buscar canteranos"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as AcademyStatusFilter)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs outline-none focus:border-primary"
            aria-label="Filtrar estado de canteranos"
          >
            <option value="all">Todos los estados</option>
            <option value="academy">En cantera</option>
            <option value="called-up">Convocados</option>
            <option value="loaned">Cedidos</option>
            <option value="listed">En venta</option>
          </select>
        </div>

        <div className="mb-2 flex items-center justify-between text-[0.68rem] text-muted-foreground">
          <span>{activePlayers.length} jugadores</span>
          <span>Entrenador juvenil nivel {club.youthCoach?.level ?? 1}/5</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-secondary/30 text-[0.62rem] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Jugador</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5 text-right">OVR</th><th className="px-3 py-2.5 text-right">POT.</th><th className="px-3 py-2.5 text-right">PJ</th><th className="px-3 py-2.5 text-right">MIN</th><th className="px-3 py-2.5 text-right">G</th><th className="px-3 py-2.5 text-right">A</th><th className="px-3 py-2.5 text-right">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {activePlayers.map((player) => {
                const stats = player.academyStats;
                return (
                  <tr key={player.id} className="transition hover:bg-secondary/20">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold">{player.name}</div>
                      <div className="mt-0.5 text-[0.65rem] text-muted-foreground">{player.positions.join(" / ")} · {player.age} años · {player.nation}</div>
                    </td>
                    <td className="px-3 py-2.5"><span className={`rounded-md px-2 py-1 text-[0.62rem] font-semibold ${player.status === "called-up" ? "bg-primary/10 text-primary" : "bg-secondary/50 text-muted-foreground"}`}>{academyStatusLabel(player.status)}</span></td>
                    <td className="px-3 py-2.5 text-right font-black scoreline">{Math.round(Number(player.internalOvr ?? player.ovr))}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-primary">{player.potentialEstimate.min}–{player.potentialEstimate.max}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{stats?.appearances ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{stats?.minutes ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{stats?.goals ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{stats?.assists ?? 0}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{stats?.ratingCount ? stats.averageRating.toFixed(2) : "—"}</td>
                  </tr>
                );
              })}
              {activePlayers.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">{query || statusFilter !== "all" ? "No hay canteranos que coincidan con el filtro." : "Este club aún no tiene canteranos registrados."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[0.65rem] text-muted-foreground">Los datos de otros clubes son de consulta: no puedes gestionar sus convocatorias, contratos o promociones desde tu carrera.</p>
      </div>
    </div>
  );
}

type PanelTab = "squad" | "tactics" | "academy";

function TeamsPage() {
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<LeagueId>("laliga");
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<PanelTab>("squad");
  const [otherClubAcademy, setOtherClubAcademy] = useState<ClubAcademyState | null>(null);
  const [otherClubAcademyLoading, setOtherClubAcademyLoading] = useState(false);
  const [otherClubAcademyError, setOtherClubAcademyError] = useState<string | null>(null);
  const currentDate = usePlayersStore((s: any) => s.currentDate);
  const playerStats = usePlayersStore((s: any) => s.stats);
  const academyClub = useAcademyStore((state) => selectedTeam ? state.clubs[selectedTeam.id] : undefined);
  const ensureAcademyClub = useAcademyStore((state) => state.ensureClub);
  const teamsSectionRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = loadSave();
    if (!s) {
      navigate({ to: "/" });
      return;
    }
    setSave(s);
    setSelectedLeague(s.myLeague);
  }, [navigate]);

  // Generate stats on-demand when league changes
  useEffect(() => {
    if (selectedLeague) {
      try {
        ensureStatsForLeague(selectedLeague);
      } catch (error) {
        console.error("No se pudieron preparar las estadísticas de la liga; se muestran los datos disponibles.", error);
      }
    }
  }, [selectedLeague]);

  // Scroll a la sección de equipos solo cuando el usuario cambia de liga,
  // nunca en el primer render (antes la página saltaba sola al entrar).
  const didMountLeague = useRef(false);
  useEffect(() => {
    if (!didMountLeague.current) {
      didMountLeague.current = true;
      return;
    }
    teamsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedLeague]);

  // Al elegir un equipo, llevamos la vista a su ficha.
  useEffect(() => {
    if (selectedTeam) {
      requestAnimationFrame(() =>
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }, [selectedTeam]);

  // Get teams for selected league
  const teams = useMemo(() => {
    if (!selectedLeague) return [];
    return teamsByLeague(selectedLeague)
      .slice()
      .sort((a, b) => overall(b) - overall(a));
  }, [selectedLeague]);

  /* ------------------------------------------------- búsqueda global */

  const q = norm(query.trim());

  const rawPlayers = useMemo(() => {
    try {
      return usePlayersStore.getState().getRawPlayers?.() ?? [];
    } catch (error) {
      console.error("No se pudo preparar la búsqueda de jugadores; usando resultados vacíos.", error);
      return [];
    }
  }, [playerStats, currentDate]);

  const teamResults = useMemo(() => {
    if (q.length < 2) return [];
    return getAllTeams()
      .filter(
        (t) =>
          norm(t.name).includes(q) || norm(t.short || "").includes(q) || norm(t.city).includes(q),
      )
      .sort((a, b) => overall(b) - overall(a))
      .slice(0, 8);
  }, [q]);

  const playerResults = useMemo(() => {
    if (q.length < 3) return [];
    return (rawPlayers as FcPlayer[])
      .filter((p) => norm(p.Name).includes(q))
      .sort((a, b) => b.OVR - a.OVR)
      .slice(0, 10);
  }, [q, rawPlayers]);

  /* ------------------------------------------------- equipo seleccionado */

  const clubOverrides = usePlayersStore((s: any) => s.clubOverrides);
  const myTeamId = usePlayersStore((s: any) => s.myTeamId);
  const myRosterIds = usePlayersStore((s: any) => s.rosterIds);
  const getFcSquadByTeamId = usePlayersStore((s: any) => s.getFcSquadByTeamId);
  // `clubOverrides` y `rosterIds` DEBEN estar en las dependencias: son los que
  // cambian al cerrar una venta o una cesión. Sin ellos el `useMemo` devolvía
  // la plantilla cacheada y el jugador seguía apareciendo en la ficha del
  // equipo aunque ya se hubiera marchado.
  const teamSquad = useMemo(() => {
    if (!selectedTeam) return [];
    try {
      return getFcSquadByTeamId(selectedTeam.id) ?? [];
    } catch (error) {
      console.error("No se pudo cargar la plantilla del equipo; usando una plantilla vacía.", error);
      return [];
    }
  }, [selectedTeam, clubOverrides, myTeamId, myRosterIds, currentDate, getFcSquadByTeamId]);

  const isUserTeam = !!save && selectedTeam?.id === save.myTeamId;

  useEffect(() => {
    if (!selectedTeam || tab !== "academy" || !save) {
      setOtherClubAcademyLoading(false);
      setOtherClubAcademyError(null);
      return;
    }

    let cancelled = false;
    const date = currentDate || `${save.season}-07-01`;
    if (isUserTeam) {
      setOtherClubAcademy(null);
      setOtherClubAcademyError(null);
      setOtherClubAcademyLoading(false);
      void ensureAcademyClub(selectedTeam.id, save.season, date).catch((error) => {
        console.error("No se pudo cargar la cantera del equipo del usuario.", error);
      });
      return () => { cancelled = true; };
    }

    const saveId = getCurrentSaveId();
    if (!saveId) {
      setOtherClubAcademy(null);
      setOtherClubAcademyError("No hay una partida activa.");
      setOtherClubAcademyLoading(false);
      return;
    }

    setOtherClubAcademy(null);
    setOtherClubAcademyError(null);
    setOtherClubAcademyLoading(true);
    void loadAcademyAiClub(saveId, selectedTeam.id).then((persistedClub) => {
      if (cancelled || getCurrentSaveId() !== saveId) return;
      if (persistedClub) {
        // Hidrata exclusivamente el club seleccionado. No se cargan ni
        // recorren cientos de academias al abrir Centro de Clubes.
        hydrateAcademyAiCache(saveId, date, { [selectedTeam.id]: persistedClub }, save.myTeamId);
      }
      const academy = getAcademyStateForInspection(saveId, selectedTeam.id, date);
      if (!academy) {
        setOtherClubAcademyError("No se ha podido cargar la cantera de este club.");
        return;
      }
      setOtherClubAcademy(academy);
    }).catch((error) => {
      console.error(`No se pudo cargar la cantera de ${selectedTeam.name}.`, error);
      if (!cancelled) setOtherClubAcademyError("No se ha podido cargar esta cantera. Vuelve a seleccionar el club para reintentar.");
    }).finally(() => {
      if (!cancelled) setOtherClubAcademyLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedTeam?.id, selectedTeam?.name, tab, save?.season, save?.myTeamId, currentDate, isUserTeam, ensureAcademyClub]);

  const selectedTeamPlayer = selectedPlayerId
    ? (teamSquad.find((p) => String(p.ID) === String(selectedPlayerId)) ?? null)
    : null;
  const selectedTeamPlayerStats = selectedPlayerId ? playerStats[String(selectedPlayerId)] : undefined;

  // Dibujo que mejor encaja con la plantilla, entre las formaciones típicas del estilo del equipo.
  const bestFormation = useMemo(() => {
    if (!selectedTeam || !teamSquad.length) return null;
    try {
      return bestFormationForSquad(teamSquad, selectedTeam);
    } catch (error) {
      console.error("No se pudo calcular la mejor formación; usando una formación segura.", error);
      return "Táctica 4-2-3-1 (2)" as const;
    }
  }, [teamSquad, selectedTeam]);

  // Táctica: la real si es tu equipo, la estimada si la lleva la IA.
  const tactics = useMemo(() => {
    if (!selectedTeam) return null;
    try {
      const est = estimateTactics(selectedTeam);
      const teamStyle = getTeamStyle(selectedTeam);
      const formation = bestFormation ?? est.formation;
      if (isUserTeam) {
        try {
          const real = loadTactics(selectedTeam.id);
          return {
            ...est,
            formation,
            style: real.style,
            pressure: real.pressure,
            defenseLine: real.defenseLine,
          };
        } catch {
          return { ...est, formation };
        }
      }
      return {
        ...est,
        formation,
        style: teamStyle.style,
        pressure: teamStyle.pressure,
        defenseLine: teamStyle.defenseLine,
      };
    } catch (error) {
      console.error("No se pudo calcular la táctica del equipo; usando valores seguros.", error);
      return {
        style: "balanced" as const,
        pressure: "medium" as const,
        defenseLine: "medium" as const,
        formation: bestFormation ?? "Táctica 4-2-3-1 (2)",
      };
    }
  }, [selectedTeam, isUserTeam, bestFormation]);

  const eleven = useMemo(() => {
    if (!tactics || !teamSquad.length) return [];
    try {
      return estimatedEleven(tactics.formation, teamSquad);
    } catch (error) {
      console.error("No se pudo calcular el 11 tipo; ocultando esa sección.", error);
      return [];
    }
  }, [tactics, teamSquad]);

  const sortedSquad = useMemo(() => sortByPosition(teamSquad), [teamSquad]);

  function openTeam(t: Team) {
    setSelectedTeam(t);
    setSelectedLeague(t.league as LeagueId);
    setTab("squad");
    setQuery("");
    setOpenCountry(null);
  }

  if (!save) return null;


  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black">Centro de Clubes</h1>
          <p className="text-xs text-muted-foreground">
            {getAllTeams().length} plantillas · busca un club o un jugador de cualquier liga
          </p>
        </div>
        <Link to="/season" className="text-xs text-muted-foreground hover:text-foreground">
          ← Central
        </Link>
      </div>

      {/* Búsqueda global */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Busca "Napoli" o "Kane"…'
          className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border border-border text-sm outline-none focus:border-primary transition"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpiar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {q.length >= 2 && (
          <div className="absolute z-30 mt-2 w-full rounded-xl border border-border bg-card shadow-xl overflow-hidden max-h-[26rem] overflow-y-auto">
            {teamResults.length === 0 && playerResults.length === 0 && (
              <div className="px-4 py-3 text-xs text-muted-foreground">Sin resultados</div>
            )}

            {teamResults.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[0.6rem] uppercase tracking-wider text-muted-foreground bg-secondary/30">
                  Equipos
                </div>
                {teamResults.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTeam(t)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary/40 transition text-left"
                  >
                    <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{t.name}</div>
                      <div className="text-[0.65rem] text-muted-foreground truncate">
                        {getLeagueName(t.league)}
                      </div>
                    </div>
                    <span className="text-sm font-black scoreline">{overall(t)}</span>
                  </button>
                ))}
              </div>
            )}

            {playerResults.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[0.6rem] uppercase tracking-wider text-muted-foreground bg-secondary/30">
                  Jugadores
                </div>
                {playerResults.map((p) => {
                  const currentClub = resolveCurrentPlayerClub(String(p.ID), p);
                  const club = currentClub.team;
                  return (
                    <button
                      key={p.ID}
                      onClick={() => {
                        if (club) openTeam(club);
                        else setQuery("");
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary/40 transition text-left"
                    >
                      <span className="text-[0.6rem] uppercase text-muted-foreground w-8">
                        {formatPositionLabel(p.Position)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{p.Name}</div>
                        <div className="text-[0.65rem] text-muted-foreground truncate">
                          {currentClub.teamName}
                        </div>
                      </div>
                      <span className="text-sm font-black scoreline">{Math.round(p.OVR)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Country-based League Selection */}
      <div className="mb-6 space-y-2">
        {Object.entries(LEAGUES_BY_COUNTRY).map(([country, leagues]) => (
          <div key={country} className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setOpenCountry(openCountry === country ? null : country)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-card hover:bg-secondary/40 transition text-sm font-semibold"
            >
              <div className="flex items-center gap-2">
                <CountryFlag country={country} />
                <span>{country}</span>
              </div>
              <span className="text-muted-foreground text-xs">
                {openCountry === country ? "▲" : "▼"}
              </span>
            </button>
            {openCountry === country && (
              <div className="flex flex-wrap gap-2 px-4 py-3 bg-secondary/20 border-t border-border">
                {leagues.map((lg) => (
                  <button
                    key={lg.id}
                    onClick={() => {
                      setSelectedLeague(lg.id as LeagueId);
                      setSelectedTeam(null);
                      setOpenCountry(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border flex items-center gap-2 ${
                      selectedLeague === lg.id
                        ? "bg-primary text-primary-foreground border-primary glow-neon"
                        : "bg-card text-foreground border-border hover:border-primary/60"
                    }`}
                  >
                    <LeagueLogo league={lg.name} size="sm" />
                    {lg.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Teams Grid */}
      {selectedLeague && (
        <div ref={teamsSectionRef} className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <LeagueLogo league={getLeagueName(selectedLeague)} size="sm" />
              {getLeagueName(selectedLeague)}
            </h2>
            <div className="flex items-center gap-2">
              <Link
                to="/standings"
                search={{ league: selectedLeague }}
                className="px-2.5 py-1 rounded-lg text-[0.7rem] font-semibold border border-border bg-card hover:border-primary/60 flex items-center gap-1.5"
              >
                <Trophy className="w-3 h-3" /> Clasificación
              </Link>
              <Link
                to="/fixtures"
                search={{ league: selectedLeague }}
                className="px-2.5 py-1 rounded-lg text-[0.7rem] font-semibold border border-border bg-card hover:border-primary/60 flex items-center gap-1.5"
              >
                <CalendarDays className="w-3 h-3" /> Jornadas
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {teams.map((t) => {
              const ov = overall(t);
              const isSelected = selectedTeam?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => (isSelected ? setSelectedTeam(null) : openTeam(t))}
                  className={`text-left p-4 rounded-xl panel transition group hover:border-primary hover:-translate-y-0.5 ${
                    isSelected ? "border-primary glow-neon bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{t.city}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                      ATA {t.att} · MED {t.mid} · DEF {t.def}
                    </div>
                    <div
                      className={`text-xl font-black scoreline ${
                        ov >= 85
                          ? "text-primary"
                          : ov >= 78
                            ? "text-accent"
                            : "text-muted-foreground"
                      }`}
                    >
                      {ov}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Team */}
      {selectedTeam && (
        <div ref={panelRef} className="panel p-5">
          <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <TeamLogo
                teamName={selectedTeam.name}
                leagueName={getLeagueName(selectedTeam.league)}
                size={48}
              />
              <div>
                <h2 className="font-bold text-lg leading-tight">{selectedTeam.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {getLeagueName(selectedTeam.league)} · {teamSquad.length} jugadores
                  {isUserTeam && " · tu equipo"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedTeam(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:border-primary/60 bg-card"
            >
              Cerrar
            </button>
          </div>

          {/* Acciones cruzadas */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Link
              to="/standings"
              search={{ league: selectedTeam.league, highlight: selectedTeam.id }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:border-primary/60 flex items-center gap-1.5"
            >
              <Trophy className="w-3.5 h-3.5" /> Ver clasificación
            </Link>
            <Link
              to="/fixtures"
              search={{ league: selectedTeam.league, team: selectedTeam.id }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:border-primary/60 flex items-center gap-1.5"
            >
              <CalendarDays className="w-3.5 h-3.5" /> Ver su calendario
            </Link>
            {isUserTeam && (
              <Link
                to="/lineup"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-primary/60 bg-primary/10 hover:bg-primary/20 flex items-center gap-1.5"
              >
                Editar mis tácticas
              </Link>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-border/60">
            {[
              { id: "squad" as PanelTab, label: "Plantilla" },
              { id: "tactics" as PanelTab, label: "Táctica y 11 tipo" },
              { id: "academy" as PanelTab, label: "Cantera" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "academy" && selectedTeam && (
            <ClubAcademyPanel
              teamName={selectedTeam.name}
              club={isUserTeam ? academyClub : otherClubAcademy}
              isUserTeam={isUserTeam}
              loading={isUserTeam ? !academyClub : otherClubAcademyLoading}
              error={isUserTeam ? null : otherClubAcademyError}
              onOpenAcademy={() => navigate({ to: "/cantera" })}
            />
          )}

          {tab === "tactics" && tactics && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <StatChip label="Plan" value={styleLabel(tactics.style)} />
                <StatChip label="Presión" value={levelLabel(tactics.pressure)} />
                <StatChip label="Línea defensiva" value={levelLabel(tactics.defenseLine)} />
                <StatChip label="Dibujo" value={tactics.formation} />
              </div>
              <p className="text-[0.65rem] text-muted-foreground">
                {isUserTeam
                  ? "Táctica real configurada en Dirección de equipo: es la que aplica el motor de partido."
                  : "Plan estimado que aplicará la IA en el partido, derivado de su ataque, medio y defensa."}
              </p>

              {eleven.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      11 tipo estimado · {tactics.formation}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      Media del once{" "}
                      <span className="font-black scoreline text-foreground">
                        {elevenAverage(eleven)}
                      </span>
                    </span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
                    <TypicalElevenPitch
                      eleven={eleven}
                      formation={tactics.formation}
                      className="mx-auto w-full max-w-[380px]"
                    />

                    <div className="space-y-1.5">
                      {eleven.map((slot, i) => {
                        const role = roleFromPosition(slot.label);
                        return (
                          <div
                            key={`${slot.label}-${i}`}
                            className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-secondary/20 px-2.5 py-1.5"
                          >
                            <PlayerFace
                              name={slot.player?.Name ?? "—"}
                              image={slot.player?.card}
                              role={role}
                              size={30}
                            />
                            <span
                              className={`w-10 shrink-0 text-[0.6rem] font-black uppercase ${ROLE_TEXT[role]}`}
                            >
                              {slot.label}
                            </span>
                            <span className="flex-1 truncate text-xs font-medium">
                              {slot.player?.Name ?? "—"}
                            </span>
                            <span className="text-xs font-black scoreline">
                              {slot.player?.OVR ?? "-"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "squad" && sortedSquad.length > 0 && (
            <>
              {/* Squad Table with Full Stats */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/60">
                      <th className="text-left py-2 px-1">Jugador</th>
                      <th className="text-center py-2 px-1">Med</th>
                      <th className="text-center py-2 px-1">Edad</th>
                      <th className="text-center py-2 px-1">PJ</th>
                      <th className="text-center py-2 px-1">Goles</th>
                      <th className="text-center py-2 px-1">Asis</th>
                      <th className="text-center py-2 px-1">Contrib.</th>
                      <th className="text-center py-2 px-1">TA</th>
                      <th className="text-center py-2 px-1">TR</th>
                      <th className="text-center py-2 px-1">Nota media</th>
                      <th className="text-center py-2 px-1">MVP</th>
                      <th className="text-center py-2 px-1">P0</th>
                      <th className="text-center py-2 px-1">Forma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSquad.map((p) => {
                      const stats = getPlayerStats(String(p.ID));
                      const goalContributions = stats.goals + stats.assists;
                      const dynamicStats = stats.dynamicStats;
                      const averageRating =
                        (dynamicStats?.seasonAppearances ?? 0) > 0
                          ? (dynamicStats?.seasonAverageRating ?? null)
                          : stats.formHistory?.length
                            ? stats.formHistory.reduce((sum, value) => sum + value, 0) / stats.formHistory.length
                            : null;
                      const mvpCount = dynamicStats?.seasonMVPs ?? stats.motm ?? 0;
                      const cleanSheets = dynamicStats?.seasonCleanSheets ?? stats.cleanSheets ?? 0;

                      const form = getPlayerForm(stats);

                      return (
                        <tr
                          key={p.ID}
                          onClick={() => setSelectedPlayerId(String(p.ID))}
                          className="cursor-pointer border-b border-border/30 hover:bg-secondary/20"
                        >
                          <td className="py-2 px-1">
                            <div className="flex items-center gap-2.5">
                              <PlayerFace
                                name={p.Name}
                                image={p.card}
                                role={roleFromPosition(p.Position)}
                                size={34}
                              />
                              <span
                                className={`w-9 shrink-0 text-[0.65rem] font-black uppercase ${
                                  ROLE_TEXT[roleFromPosition(p.Position)]
                                }`}
                              >
                                {formatPositionLabel(p.Position)}
                              </span>
                              <span className="font-medium truncate">{p.Name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-1 text-center">
                            <span
                              className={`font-bold scoreline ${
                                p.OVR >= 82 ? "text-primary" : p.OVR >= 78 ? "text-accent" : ""
                              }`}
                            >
                              {Math.round(p.OVR)}
                            </span>
                          </td>
                          <td className="py-2 px-1 text-center text-muted-foreground">{p.Age}</td>
                          <td className="py-2 px-1 text-center scoreline">{stats.appearances ?? 0}</td>
                          <td className="py-2 px-1 text-center font-semibold text-primary">
                            {stats.goals ?? 0}
                          </td>
                          <td className="py-2 px-1 text-center font-semibold text-accent">
                            {stats.assists ?? 0}
                          </td>
                          <td className="py-2 px-1 text-center font-bold">{goalContributions}</td>
                          <td className="py-2 px-1 text-center text-yellow-500">
                            {stats.yellowCards ?? 0}
                          </td>
                          <td className="py-2 px-1 text-center text-red-500">{stats.redCards ?? 0}</td>
                          <td className="py-2 px-1 text-center scoreline font-semibold">
                            {averageRating == null ? "—" : averageRating.toFixed(2)}
                          </td>
                          <td className="py-2 px-1 text-center scoreline font-semibold text-yellow-500">{mvpCount}</td>
                          <td className="py-2 px-1 text-center scoreline font-semibold text-sky-400">{cleanSheets}</td>
                          <td className="py-2 px-1 text-center">
                            <span
                              title={form === "up" ? "Buena forma" : form === "down" ? "Mala forma" : "Forma estable"}
                              className={`inline-flex items-center justify-center ${form === "up" ? "text-emerald-400" : form === "down" ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {form === "up" ? <ArrowUp className="h-4 w-4" /> : form === "down" ? <ArrowDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "squad" && sortedSquad.length === 0 && (
            <div className="text-center text-muted-foreground py-6">
              No hay datos de jugadores disponibles para {selectedTeam.name}
            </div>
          )}
        </div>
      )}

      <PlayerDetailDialog
        open={!!selectedTeamPlayer}
        onClose={() => setSelectedPlayerId(null)}
        player={selectedTeamPlayer}
        team={selectedTeam}
        stats={selectedTeamPlayerStats}
        privateMode={false}
        fixtures={[]}
        myTeamId={myTeamId}
        showMorale={false}
      />
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2">
      <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { loadSave, SaveGame } from "@/lib/store";
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
  type PlayerStats,
  type FcPlayer,
} from "@/store/playersStore";
import { TeamLogo } from "@/components/TeamLogo";
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
  levelLabel,
} from "@/lib/teamProfile";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { PlayerFace, ROLE_TEXT, roleFromPosition } from "@/components/PlayerFace";
import { TypicalElevenPitch } from "@/components/TypicalElevenPitch";
import { Search, X, Trophy, CalendarDays, Repeat } from "lucide-react";

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

type PanelTab = "squad" | "tactics";

function TeamsPage() {
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<LeagueId>("laliga");
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<PanelTab>("squad");
  const teamsSectionRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { isMarketOpen } = useTransferMarket();

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
      ensureStatsForLeague(selectedLeague);
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

  const teamResults = useMemo(() => {
    if (q.length < 2) return [];
    return getAllTeams()
      .filter((t) => norm(t.name).includes(q) || norm(t.short || "").includes(q) || norm(t.city).includes(q))
      .sort((a, b) => overall(b) - overall(a))
      .slice(0, 8);
  }, [q]);

  const rawPlayers = usePlayersStore((s: any) => s.getRawPlayers?.() ?? []);
  const playerResults = useMemo(() => {
    if (q.length < 3) return [];
    return (rawPlayers as FcPlayer[])
      .filter((p) => norm(p.Name).includes(q))
      .sort((a, b) => b.OVR - a.OVR)
      .slice(0, 10);
  }, [q, rawPlayers]);

  /* ------------------------------------------------- equipo seleccionado */

  const clubOverrides = usePlayersStore((s: any) => s.clubOverrides);
  const teamSquad = useMemo(() => {
    if (!selectedTeam) return [];
    return squadForTeam(selectedTeam.id);
  }, [selectedTeam, clubOverrides]);

  const isUserTeam = !!save && selectedTeam?.id === save.myTeamId;

  // Dibujo que mejor encaja con la plantilla, entre todos los de Dirección de equipo.
  const bestFormation = useMemo(
    () => (teamSquad.length ? bestFormationForSquad(teamSquad) : null),
    [teamSquad],
  );

  // Táctica: la real si es tu equipo, la estimada si la lleva la IA.
  const tactics = useMemo(() => {
    if (!selectedTeam) return null;
    const est = estimateTactics(selectedTeam);
    const formation = bestFormation ?? est.formation;
    if (isUserTeam) {
      const real = loadTactics(selectedTeam.id);
      return { ...est, formation, style: real.style, pressure: real.pressure, defenseLine: real.defenseLine };
    }
    return { ...est, formation };
  }, [selectedTeam, isUserTeam, bestFormation]);

  const eleven = useMemo(() => {
    if (!tactics || !teamSquad.length) return [];
    return estimatedEleven(tactics.formation, teamSquad);
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

  const canOffer = isMarketOpen && !isUserTeam;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black">Equipos</h1>
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
                  const club = getAllTeams().find((t) => t.name === p.Team);
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
                        {p.Position}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{p.Name}</div>
                        <div className="text-[0.65rem] text-muted-foreground truncate">{p.Team}</div>
                      </div>
                      <span className="text-sm font-black scoreline">{p.OVR}</span>
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
                        ov >= 85 ? "text-primary" : ov >= 78 ? "text-accent" : "text-muted-foreground"
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
            {isUserTeam ? (
              <Link
                to="/lineup"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-primary/60 bg-primary/10 hover:bg-primary/20 flex items-center gap-1.5"
              >
                Editar mis tácticas
              </Link>
            ) : (
              <Link
                to="/transfers"
                search={{ q: selectedTeam.name }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:border-primary/60 flex items-center gap-1.5"
              >
                <Repeat className="w-3.5 h-3.5" /> Ver en el mercado
              </Link>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-border/60">
            {(
              [
                { id: "squad" as PanelTab, label: "Plantilla" },
                { id: "tactics" as PanelTab, label: "Táctica y 11 tipo" },
              ]
            ).map((t) => (
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
                      <th className="text-center py-2 px-1">Estado</th>
                      {canOffer && <th className="text-center py-2 px-1">Fichar</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSquad.map((p) => {
                      const stats = getPlayerStats(String(p.ID));
                      const goalContributions = stats.goals + stats.assists;

                      // Get suspension status (only for user's team)
                      let suspensionStatus = "";
                      if (isUserTeam) {
                        const suspensions = save.suspensions[save.myTeamId] ?? [];
                        const suspension = suspensions.find((s) => s.playerId === String(p.ID));
                        if (suspension && suspension.matchdaysRemaining > 0) {
                          suspensionStatus = `S${suspension.matchdaysRemaining}j`;
                        }
                      }

                      // Check injury status
                      let injuryStatus = "";
                      if (stats.injuredUntil > 0) {
                        injuryStatus = `I${stats.injuredUntil}j`;
                      }

                      const status = suspensionStatus || injuryStatus || "-";

                      return (
                        <tr key={p.ID} className="border-b border-border/30 hover:bg-secondary/20">
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
                                {p.Position}
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
                              {p.OVR}
                            </span>
                          </td>
                          <td className="py-2 px-1 text-center text-muted-foreground">{p.Age}</td>
                          <td className="py-2 px-1 text-center scoreline">{stats.appearances}</td>
                          <td className="py-2 px-1 text-center font-semibold text-primary">
                            {stats.goals}
                          </td>
                          <td className="py-2 px-1 text-center font-semibold text-accent">
                            {stats.assists}
                          </td>
                          <td className="py-2 px-1 text-center font-bold">{goalContributions}</td>
                          <td className="py-2 px-1 text-center text-yellow-500">{stats.yellowCards}</td>
                          <td className="py-2 px-1 text-center text-red-500">{stats.redCards}</td>
                          <td className="py-2 px-1 text-center font-semibold">{status}</td>
                          {canOffer && (
                            <td className="py-2 px-1 text-center">
                              <Link
                                to="/transfers"
                                search={{ q: p.Name, player: String(p.ID) }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[0.65rem] font-bold border border-primary/50 text-primary hover:bg-primary/10 transition whitespace-nowrap"
                              >
                                <Repeat className="w-3 h-3" /> Ofertar
                              </Link>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[0.65rem] text-muted-foreground mt-3">
                Orden por posición · PJ = Partidos Jugados · Contrib. = Goles + Asistencias · TA/TR =
                tarjetas · Estado: S = Sancionado, I = Lesionado, j = jornadas restantes
                {!isMarketOpen && !isUserTeam && " · el mercado está cerrado, no puedes ofertar ahora"}
              </p>
            </>
          )}

          {tab === "squad" && sortedSquad.length === 0 && (
            <div className="text-center text-muted-foreground py-6">
              No hay datos de jugadores disponibles para {selectedTeam.name}
            </div>
          )}
        </div>
      )}
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { LEAGUES_BY_COUNTRY, LeagueId, overall, teamsByLeague, teamById, getAllTeams, type Team } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { usePlayersStore, type PlayerStats } from "@/store/playersStore";
import type { FcPlayer } from "@/store/playersStore";

// Map team names to players - same logic as playersStore but without affecting global state
const PLAYERS_BY_TEAM: Record<string, FcPlayer[]> = {};
const RAW_PLAYERS = usePlayersStore.getState().getRawPlayers?.() || [];

// Build player mapping for scouting (doesn't affect userTeam)
for (const p of RAW_PLAYERS) {
  if (!PLAYERS_BY_TEAM[p.Team]) PLAYERS_BY_TEAM[p.Team] = [];
  PLAYERS_BY_TEAM[p.Team].push(p);
}

// Helper to get player stats from store
function getPlayerStats(playerId: string): PlayerStats {
  const store = usePlayersStore.getState();
  return store.stats[playerId] ?? {
    goals: 0,
    assists: 0,
    appearances: 0,
    injuredUntil: 0,
    injuryReason: undefined,
    morale: 70,
    formHistory: [],
  };
}

export const Route = createFileRoute("/teams")({ component: TeamsPage });

function TeamsPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<LeagueId>("laliga");
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s);
    setSelectedLeague(s.myLeague);
  }, [navigate]);

  // Get teams for selected league
  const teams = useMemo(() => {
    if (!selectedLeague) return [];
    return teamsByLeague(selectedLeague).slice().sort((a, b) => overall(b) - overall(a));
  }, [selectedLeague]);

  // Get full squad for selected team (from raw data, not user state)
  const teamSquad = useMemo(() => {
    if (!selectedTeam) return [];
    return PLAYERS_BY_TEAM[selectedTeam.name] || [];
  }, [selectedTeam]);

  if (!save) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <PlayersLoading message="Cargando datos de jugadores…" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-black mb-2">Equipos</h1>
      <p className="text-xs text-muted-foreground mb-6">
        Explora las {getAllTeams().length} plantillas disponibles · Selecciona un país y liga para ver los equipos
      </p>

      {/* Country-based League Selection */}
      <div className="mb-6 space-y-2">
        {Object.entries(LEAGUES_BY_COUNTRY).map(([country, leagues]) => (
          <div key={country} className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setOpenCountry(openCountry === country ? null : country)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-card hover:bg-secondary/40 transition text-sm font-semibold"
            >
              <span className="flex items-center gap-2">
                <span className="text-lg">{leagues[0]?.flag}</span>
                {country}
              </span>
              <span className="text-muted-foreground text-xs">{openCountry === country ? "▲" : "▼"}</span>
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
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                      selectedLeague === lg.id
                        ? "bg-primary text-primary-foreground border-primary glow-neon"
                        : "bg-card text-foreground border-border hover:border-primary/60"
                    }`}
                  >
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
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            {teamById(teams[0]?.id || "")?.league ? teamsByLeague(selectedLeague)[0]?.name : "Equipos"}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {teams.map((t) => {
              const ov = overall(t);
              const isSelected = selectedTeam?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTeam(isSelected ? null : t)}
                  className={`text-left p-4 rounded-xl panel transition group hover:border-primary hover:-translate-y-0.5 ${
                    isSelected ? "border-primary glow-neon bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <TeamBadge team={t} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{t.city}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                      ATA {t.att} · MED {t.mid} · DEF {t.def}
                    </div>
                    <div className={`text-xl font-black scoreline ${ov >= 85 ? "text-primary" : ov >= 78 ? "text-accent" : "text-muted-foreground"}`}>
                      {ov}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Team Squad */}
      {selectedTeam && teamSquad.length > 0 && (
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <TeamBadge team={selectedTeam} size={48} />
              <div>
                <h2 className="font-bold text-lg">{selectedTeam.name}</h2>
                <p className="text-xs text-muted-foreground">
                  Plantilla completa · {teamSquad.length} jugadores
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
                  <th className="text-center py-2 px-1">Amarillas</th>
                  <th className="text-center py-2 px-1">Rojas</th>
                </tr>
              </thead>
              <tbody>
                {teamSquad
                  .slice()
                  .sort((a, b) => b.OVR - a.OVR)
                  .map((p) => {
                    const stats = getPlayerStats(String(p.ID));
                    const goalContributions = stats.goals + stats.assists;
                    return (
                      <tr key={p.ID} className="border-b border-border/30 hover:bg-secondary/20">
                        <td className="py-2 px-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[0.65rem] text-muted-foreground uppercase w-8">{p.Position}</span>
                            <span className="font-medium truncate">{p.Name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-1 text-center">
                          <span className={`font-bold scoreline ${p.OVR >= 82 ? "text-primary" : p.OVR >= 78 ? "text-accent" : ""}`}>
                            {p.OVR}
                          </span>
                        </td>
                        <td className="py-2 px-1 text-center text-muted-foreground">{p.Age}</td>
                        <td className="py-2 px-1 text-center scoreline">{stats.appearances}</td>
                        <td className="py-2 px-1 text-center font-semibold text-primary">{stats.goals}</td>
                        <td className="py-2 px-1 text-center font-semibold text-accent">{stats.assists}</td>
                        <td className="py-2 px-1 text-center font-bold">{goalContributions}</td>
                        <td className="py-2 px-1 text-center text-yellow-500">🟨 0</td>
                        <td className="py-2 px-1 text-center text-red-500">🟥 0</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="text-[0.65rem] text-muted-foreground mt-3">
            PJ = Partidos Jugados · Contrib. = Goles + Asistencias · Amarillas y rojas simuladas
          </p>
        </div>
      )}

      {selectedTeam && teamSquad.length === 0 && (
        <div className="panel p-5 text-center text-muted-foreground">
          No hay datos de jugadores disponibles para {selectedTeam.name}
        </div>
      )}
    </div>
  );
}


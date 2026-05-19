import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ALL_LEAGUES, loadSave, SaveGame } from "@/lib/store";
import { LEAGUES, LeagueId, teamById } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { selectTopAssisters } from "@/store/playersStore";

export const Route = createFileRoute("/assists")({ component: AssistsPage });

function AssistsPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [league, setLeague] = useState<LeagueId | "all">("all");

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s);
  }, [navigate]);

  const assisters = useMemo(
    () =>
      save && ready
        ? selectTopAssisters(league === "all" ? undefined : league, 30)
        : [],
    [save, ready, league],
  );

  if (!save) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <PlayersLoading message="Cargando datos de jugadores…" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-black">🎯 Máximos asistentes</h1>
        <select value={league} onChange={(e) => setLeague(e.target.value as LeagueId | "all")}
          className="bg-secondary border border-border rounded px-3 py-1.5 text-sm">
          <option value="all">🌍 Todas las ligas</option>
          {ALL_LEAGUES.map((lg) => (
            <option key={lg} value={lg}>{LEAGUES[lg].flag} {LEAGUES[lg].name}</option>
          ))}
        </select>
      </div>

      {assisters.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Aún no hay asistencias registradas.</p>
      ) : (
        <div className="panel divide-y divide-border/40">
          {assisters.map((p, i) => {
            const team = teamById(p.teamId);
            return (
              <div key={p.id} className="grid grid-cols-[28px_auto_1fr_auto_auto] items-center gap-3 px-4 py-3">
                <span className={`text-sm font-black ${i < 3 ? "text-accent" : "text-muted-foreground"}`}>{i + 1}</span>
                <TeamBadge team={team} size={28} />
                <div className="min-w-0">
                  <div className="font-bold truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{team.name} · {p.goals} goles</div>
                </div>
                <div className="text-xs text-muted-foreground">{p.appearances} PJ</div>
                <div className="text-2xl font-black scoreline text-accent w-10 text-right">{p.assists}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

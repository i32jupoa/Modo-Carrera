import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { selectInjuredPlayers } from "@/store/playersStore";

export const Route = createFileRoute("/injuries")({ component: InjuriesPage });

function InjuriesPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s);
  }, [navigate]);

  const list = useMemo(
    () =>
      save && ready
        ? selectInjuredPlayers(
            save.currentMatchday,
            scope === "mine" ? save.myTeamId : undefined,
          )
        : [],
    [save, ready, scope],
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
        <h1 className="text-2xl font-black">🚑 Parte de lesiones</h1>
        <div className="flex gap-2">
          <button onClick={() => setScope("mine")}
            className={`px-3 py-1.5 rounded text-sm font-semibold border ${scope === "mine" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
            Mi equipo
          </button>
          <button onClick={() => setScope("all")}
            className={`px-3 py-1.5 rounded text-sm font-semibold border ${scope === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
            Toda Europa
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="panel p-8 text-center">
          <div className="text-4xl mb-2">💪</div>
          <p className="text-sm text-muted-foreground">
            {scope === "mine" ? "Plantilla 100% sana." : "Sin lesionados registrados todavía."}
          </p>
        </div>
      ) : (
        <div className="panel divide-y divide-border/40">
          {list.map((p) => {
            const team = teamById(p.teamId);
            const md = save.currentMatchday[team.league];
            const out = p.injuredUntil - md;
            return (
              <div key={p.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3">
                <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={32} />
                <div className="min-w-0">
                  <div className="font-bold truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {team.short} · {p.injuryReason ?? "lesión"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black scoreline text-destructive">{out}</div>
                  <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{out === 1 ? "jornada" : "jornadas"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

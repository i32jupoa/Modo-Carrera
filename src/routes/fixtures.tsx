import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ALL_LEAGUES, getMatchdayFixtures, loadSave, SaveGame } from "@/lib/store";
import { LEAGUES, LeagueId, teamById } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

export const Route = createFileRoute("/fixtures")({ component: FixturesPage });

function FixturesPage() {
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [league, setLeague] = useState<LeagueId>("laliga");
  const [viewMd, setViewMd] = useState(1);

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s); setLeague(s.myLeague); setViewMd(s.currentMatchday[s.myLeague]);
  }, [navigate]);

  if (!save) return null;
  const fixtures = getMatchdayFixtures(save, league, viewMd);
  const totalMd = save.fixtures[league].at(-1)?.matchday ?? 1;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <Link to="/season" className="text-sm text-muted-foreground hover:text-foreground">← Temporada</Link>
        <select value={league} onChange={(e) => setLeague(e.target.value as LeagueId)}
          className="bg-secondary border border-border rounded px-3 py-1.5 text-sm">
          {ALL_LEAGUES.map((lg) => (
            <option key={lg} value={lg}>{LEAGUES[lg].flag} {LEAGUES[lg].name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setViewMd((m) => Math.max(1, m - 1))} disabled={viewMd <= 1}
          className="px-3 py-1.5 rounded bg-card border border-border text-sm disabled:opacity-30">←</button>
        <h2 className="text-2xl font-bold">Jornada {viewMd} <span className="text-muted-foreground text-base font-normal">/ {totalMd}</span></h2>
        <button onClick={() => setViewMd((m) => Math.min(totalMd, m + 1))} disabled={viewMd >= totalMd}
          className="px-3 py-1.5 rounded bg-card border border-border text-sm disabled:opacity-30">→</button>
      </div>

      <div className="panel divide-y divide-border/40">
        {fixtures.map((f) => {
          const home = teamById(f.homeId);
          const away = teamById(f.awayId);
          const isMine = f.homeId === save.myTeamId || f.awayId === save.myTeamId;
          return (
            <div key={f.id} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-3 ${isMine ? "bg-primary/5" : ""}`}>
              <div className="flex items-center gap-3 justify-end min-w-0">
                <span className={`font-semibold truncate ${isMine && f.homeId === save.myTeamId ? "text-primary" : ""}`}>
                  {home.name}
                </span>
                <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={30} />
              </div>
              <div className="scoreline font-bold text-lg min-w-[70px] text-center">
                {f.result ? `${f.result.homeGoals} - ${f.result.awayGoals}` : <span className="text-muted-foreground text-sm font-normal">vs</span>}
              </div>
              <div className="flex items-center gap-3 min-w-0">
                <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={30} />
                <span className={`font-semibold truncate ${isMine && f.awayId === save.myTeamId ? "text-primary" : ""}`}>
                  {away.name}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

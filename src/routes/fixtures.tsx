import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";

import { useState, useEffect } from "react";

import { ALL_LEAGUES, loadSave, SaveGame, getMatchdayFixtures } from "@/lib/store";

import { LEAGUES, teamById, type LeagueId } from "@/data/teams";

import { usePlayersStore, ensureStatsForLeague } from "@/store/playersStore";

import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { MatchStatsModal } from "@/components/MatchStatsModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import type { Fixture } from "@/lib/season";



// Helper to get league name from league ID

function getLeagueName(leagueId: string): string {

  return LEAGUES[leagueId as LeagueId]?.name || leagueId;

}

// Helper to format cup result with extra time or penalties
function formatCupResult(result: any): string {
  if (!result) return "vs";
  
  const { homeGoals, awayGoals, extraTime, penalties } = result;
  
  if (penalties) {
    // Format: Argentina 3 (4) - (2) 3 Francia
    // The score shown is the result after 120 minutes (regular + extra time)
    const totalHome = homeGoals + (extraTime?.homeGoals || 0);
    const totalAway = awayGoals + (extraTime?.awayGoals || 0);
    return `${totalHome} (${penalties.homeGoals}) - (${penalties.awayGoals}) ${totalAway}`;
  } else if (extraTime) {
    // Only show (prórroga) if there's a winner after extra time (not tied)
    const totalHome = homeGoals + extraTime.homeGoals;
    const totalAway = awayGoals + extraTime.awayGoals;
    if (totalHome !== totalAway) {
      // Format: España 1 - 0 Países Bajos (prórroga)
      return `${totalHome} - ${totalAway} (prórroga)`;
    }
    // If still tied after extra time, don't show (prórroga) since it went to penalties
    return `${totalHome} - ${totalAway}`;
  }
  
  return `${homeGoals} - ${awayGoals}`;
}



export const Route = createFileRoute("/fixtures")({
  // Permite llegar desde Equipos con ?league=...&team=teamId
  validateSearch: (search: Record<string, unknown>): { league?: string; team?: string } => ({
    league: typeof search.league === "string" ? search.league : "",
    team: typeof search.team === "string" ? search.team : "",
  }),
  component: FixturesPage,
});



function FixturesPage() {

  const navigate = useNavigate();

  const { league: leagueParam, team: focusTeam } = Route.useSearch();

  const [save, setSave] = useState<SaveGame | null>(null);

  const [league, setLeague] = useState<LeagueId>("laliga");

  const [viewMd, setViewMd] = useState(1);

  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);



  useEffect(() => {

    const s = loadSave();

    if (!s) { navigate({ to: "/" }); return; }

    const lg = (leagueParam || s.myLeague) as LeagueId;

    setSave(s); setLeague(lg); setViewMd(s.currentMatchday[lg] ?? 1);

  }, [navigate, leagueParam]);

  

  // Generate stats on-demand when league changes

  useEffect(() => {

    if (league) {

      ensureStatsForLeague(league);

    }

  }, [league]);



  if (!save) return null;

  const fixtures = getMatchdayFixtures(save, league, viewMd);

  const totalMd = save.fixtures[league].at(-1)?.matchday ?? 1;



  return (

    <div className="p-4 md:p-6 max-w-4xl mx-auto">

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">

        <Link to="/season" className="text-sm text-muted-foreground hover:text-foreground">← Temporada</Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="bg-secondary border border-border rounded px-3 py-1.5 text-sm flex items-center gap-2 hover:border-primary/60 transition">
              <LeagueLogo league={LEAGUES[league].name} size="sm" fallback={<span className="text-xs">{LEAGUES[league].flag}</span>} />
              {LEAGUES[league].name}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {ALL_LEAGUES.map((lg) => (
              <DropdownMenuItem
                key={lg}
                onClick={() => setLeague(lg)}
                className="flex items-center gap-2"
              >
                <LeagueLogo league={LEAGUES[lg].name} size="sm" fallback={<span className="text-xs">{LEAGUES[lg].flag}</span>} />
                {LEAGUES[lg].name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

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

          const isFocus = !!focusTeam && (f.homeId === focusTeam || f.awayId === focusTeam) && !isMine;

          const isHome = f.homeId === save.myTeamId;

          return (

            <div 
              key={f.id} 
              className={`grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-3 ${isMine ? "bg-primary/5" : isFocus ? "bg-accent/10 ring-1 ring-inset ring-accent/40" : ""} ${f.result ? "cursor-pointer hover:bg-accent/20 transition" : ""}`}
              onClick={() => f.result && setSelectedFixture(f)}
            >

              <div className="flex items-center gap-3 justify-end min-w-0">

                <span className={`font-semibold truncate ${isMine && f.homeId === save.myTeamId ? "text-primary" : ""}`}>

                  {home.name}

                </span>

                <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={30} />

              </div>

              <div className="scoreline font-bold text-lg min-w-[70px] text-center">
                {f.competition === 'cup' ? formatCupResult(f.result) : (f.result ? `${f.result.homeGoals} - ${f.result.awayGoals}` : <span className="text-muted-foreground text-sm font-normal">vs</span>)}
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

      <MatchStatsModal fixture={selectedFixture} onClose={() => setSelectedFixture(null)} />

    </div>

  );

}


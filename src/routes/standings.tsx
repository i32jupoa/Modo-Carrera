import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ALL_LEAGUES, loadSave, SaveGame, getSortedStandings } from "@/lib/store";
import { LEAGUES, teamById, teamsByLeague, type LeagueId } from "@/data/teams";
import { usePlayersStore, ensureStatsForLeague } from "@/store/playersStore";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
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

export const Route = createFileRoute("/standings")({
  component: StandingsPage,
});

function StandingsPage() {
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [viewLeague, setViewLeague] = useState<LeagueId>("laliga");

  useEffect(() => {
    const s = loadSave();
    if (!s) {
      navigate({ to: "/" });
      return;
    }
    setSave(s);
    setViewLeague(s.myLeague);
  }, [navigate]);
  
  // Generate stats on-demand when league changes
  useEffect(() => {
    if (viewLeague) {
      ensureStatsForLeague(viewLeague);
    }
  }, [viewLeague]);

  if (!save) return null;

  const standings = getSortedStandings(save, viewLeague);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <Link
            to="/season"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Temporada
          </Link>
          <h1 className="text-2xl font-black mt-2">Clasificación</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {LEAGUES[viewLeague].name} · calculada en vivo desde los partidos jugados
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={viewLeague} onValueChange={(value) => setViewLeague(value as LeagueId)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecciona liga" />
            </SelectTrigger>
            <SelectContent>
              {ALL_LEAGUES.map((lg) => (
                <SelectItem key={lg} value={lg}>
                  <div className="flex items-center gap-2">
                    <LeagueLogo league={LEAGUES[lg].name} size="sm" />
                    <span>{LEAGUES[lg].name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link
            to="/fixtures"
            className="text-xs font-semibold text-primary hover:underline"
          >
            Ver calendario de jornadas →
          </Link>
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Clasificación</h3>
        </div>
        <StandingsTable standings={standings} myTeamId={save.myTeamId} />
      </div>
    </div>
  );
}

function StandingsTable({ standings, myTeamId }: { standings: ReturnType<typeof getSortedStandings>; myTeamId: string }) {
  return (
    <div className="text-xs">
      <div className="grid grid-cols-[24px_1fr_24px_24px_24px_24px_28px_28px_28px_32px] gap-2 text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/60">
        <span>#</span><span>Equipo</span><span className="text-center">PJ</span><span className="text-center">V</span><span className="text-center">E</span><span className="text-center">D</span><span className="text-center">GF</span><span className="text-center">GC</span><span className="text-center">DG</span><span className="text-center">Pts</span>
      </div>
      {standings.map((s, i) => {
        const t = teamById(s.teamId);
        const isMe = s.teamId === myTeamId;
        const zoneColor =
          i < 4 ? "border-l-primary" : i < 6 ? "border-l-accent" :
          i >= standings.length - 3 ? "border-l-destructive" : "border-l-transparent";
        return (
          <div
            key={s.teamId}
            className={`grid grid-cols-[24px_1fr_24px_24px_24px_24px_28px_28px_28px_32px] gap-2 py-1.5 border-b border-border/30 last:border-0 border-l-2 pl-2 ${zoneColor} ${isMe ? "bg-primary/10 text-primary font-bold" : ""}`}
          >
            <span className="text-muted-foreground">{i + 1}</span>
            <span className="flex items-center gap-1.5 min-w-0">
              <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={18} />
              <span className="truncate">{t.name}</span>
            </span>
            <span className="text-center scoreline">{s.played}</span>
            <span className="text-center scoreline text-primary">{s.won}</span>
            <span className="text-center scoreline text-muted-foreground">{s.drawn}</span>
            <span className="text-center scoreline text-destructive">{s.lost}</span>
            <span className="text-center scoreline">{s.gf}</span>
            <span className="text-center scoreline">{s.ga}</span>
            <span className="text-center scoreline">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
            <span className="text-center scoreline font-bold">{s.points}</span>
          </div>
        );
      })}
      <p className="text-[0.65rem] text-muted-foreground mt-3 leading-relaxed">
        <span className="text-primary">●</span> Europa · <span className="text-destructive">●</span> Descenso
      </p>
    </div>
  );
}

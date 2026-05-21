import { createFileRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getMyNextFixture, loadSave, playMyNextMatch, SaveGame, saveSave, setLineup, setFormation } from "@/lib/store";
import { Fixture } from "@/lib/season";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { MatchEvent } from "@/lib/simulation";
import { usePlayersStore } from "@/store/playersStore";
import { MiniPitch, generateCPULineup } from "@/components/MiniPitch";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

export const Route = createFileRoute("/match")({ component: MatchPage });

type Phase = "preview" | "playing" | "done";

function MatchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [phase, setPhase] = useState<Phase>("preview");
  const [minute, setMinute] = useState(0);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const allEventsRef = useRef<MatchEvent[]>([]);
  const fixtureRef = useRef<Fixture | null>(null);
  const clockTimeoutRef = useRef<number | null>(null);
  const fixtures = usePlayersStore((s) => s.fixtures);
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);

  // Extract temporary lineup from router state (if passed from lineup page)
  const routerState = location.state as any;
  const matchLineup = routerState?.matchLineup as string[] | undefined;
  const matchFormation = routerState?.matchFormation as string | undefined;

  // Store original lineup BEFORE applying temporary changes
  const originalLineupRef = useRef<string[] | null>(null);
  const originalFormationRef = useRef<string | null>(null);

  function updateFixtureInStore(fixtureId: string, homeScore: number, awayScore: number) {
    const updated = fixtures.map((f) =>
      f.id === fixtureId
        ? { ...f, isPlayed: true, homeScore, awayScore }
        : f
    );
    usePlayersStore.setState({ fixtures: updated });
  }

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    
    // Store original lineup BEFORE applying temporary changes
    if (matchLineup && matchFormation) {
      originalLineupRef.current = s.lineups[s.myTeamId];
      originalFormationRef.current = s.formations[s.myTeamId];
    }
    
    // Prioritize router state temporary lineup over global store
    let saveToUse = s;
    const usedTemporaryLineup = !!matchLineup && !!matchFormation;
    
    if (usedTemporaryLineup) {
      // Apply temporary lineup as absolute source of truth for this match
      saveToUse = setLineup(s, s.myTeamId, matchLineup);
      saveToUse = setFormation(saveToUse, s.myTeamId, matchFormation);
    }
    
    setSave(saveToUse);
    fixtureRef.current = getMyNextFixture(saveToUse);
    if (!fixtureRef.current) navigate({ to: "/season" });
  }, [navigate, matchLineup, matchFormation]);

  function startMatch() {
    if (!save) return;
    
    // Check if we used a temporary lineup for this match
    const usedTemporaryLineup = !!matchLineup && !!matchFormation;
    // Use the stored original lineup/formation from refs (saved before temporary changes)
    const originalLineup = originalLineupRef.current;
    const originalFormation = originalFormationRef.current;
    
    const { save: newSave, fixture } = playMyNextMatch(save);
    if (!fixture || !fixture.result) return;
    allEventsRef.current = fixture.result.events;
    fixtureRef.current = fixture;
    
    // If we used a temporary lineup, restore the original base lineup before saving
    // This ensures only stats/results are saved, not the temporary lineup changes
    if (usedTemporaryLineup && originalLineup && originalFormation) {
      const saveWithOriginalLineup = setLineup(newSave, newSave.myTeamId, originalLineup);
      const saveWithOriginalFormation = setFormation(saveWithOriginalLineup, newSave.myTeamId, originalFormation);
      setSave(saveWithOriginalFormation);
      saveSave(saveWithOriginalFormation);
    } else {
      setSave(newSave);
      saveSave(newSave);
    }
    
    if (fixture.result) {
      updateFixtureInStore(fixture.id, fixture.result.homeGoals, fixture.result.awayGoals);
    }
    setPhase("playing");
    runClock();
  }

  function runClock() {
    let m = 0;
    const tick = () => {
      m += 1;
      setMinute(m);
      const events = allEventsRef.current.filter((e) => e.minute === m);
      if (events.length > 0) {
        setFeed((prev) => [...events, ...prev]);
        for (const ev of events) {
          if (ev.team === "home") setHomeScore((s) => s + 1);
          else setAwayScore((s) => s + 1);
        }
      }
      if (m >= 90) { setPhase("done"); return; }
      clockTimeoutRef.current = window.setTimeout(tick, 50);
    };
    clockTimeoutRef.current = window.setTimeout(tick, 300);
  }

  function skipToEnd() {
    // Clear the running clock timeout immediately
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }
    
    if (!fixtureRef.current?.result) return;
    setHomeScore(fixtureRef.current.result.homeGoals);
    setAwayScore(fixtureRef.current.result.awayGoals);
    setFeed(allEventsRef.current.slice().reverse());
    setMinute(90);
    setPhase("done");
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clockTimeoutRef.current !== null) {
        window.clearTimeout(clockTimeoutRef.current);
      }
    };
  }, []);

  if (!save || !fixtureRef.current) return null;
  const fixture = fixtureRef.current;
  const home = teamById(fixture.homeId);
  const away = teamById(fixture.awayId);
  const myId = save.myTeamId;
  const isMe = (id: string) => id === myId;
  const injuries = fixture.result?.injuries ?? [];

  // Get lineups for both teams
  const homeSquad = getSimSquad(fixture.homeId);
  const awaySquad = getSimSquad(fixture.awayId);
  
  // Determine home team lineup and formation
  let homeLineup: any[] = [];
  let homeFormation: any = "Táctica 4-4-2";
  
  if (isMe(fixture.homeId)) {
    // User's team - use temporary lineup if available, otherwise use global
    const homeLineupIds = matchLineup || save.lineups[fixture.homeId] || [];
    const homeSquadPlayers = homeSquad.filter(p => homeLineupIds.includes(p.id));
    homeLineup = homeSquadPlayers;
    homeFormation = matchFormation || save.formations[fixture.homeId] || "Táctica 4-4-2";
  } else {
    // CPU team - generate lineup
    const { lineup: cpuLineup, formation: cpuFormation } = generateCPULineup(homeSquad);
    homeLineup = cpuLineup;
    homeFormation = cpuFormation;
  }
  
  // Determine away team lineup and formation
  let awayLineup: any[] = [];
  let awayFormation: any = "Táctica 4-4-2";
  
  if (isMe(fixture.awayId)) {
    // User's team - use temporary lineup if available, otherwise use global
    const awayLineupIds = matchLineup || save.lineups[fixture.awayId] || [];
    const awaySquadPlayers = awaySquad.filter(p => awayLineupIds.includes(p.id));
    awayLineup = awaySquadPlayers;
    awayFormation = matchFormation || save.formations[fixture.awayId] || "Táctica 4-4-2";
  } else {
    // CPU team - generate lineup
    const { lineup: cpuLineup, formation: cpuFormation } = generateCPULineup(awaySquad);
    awayLineup = cpuLineup;
    awayFormation = cpuFormation;
  }
  
  // Check if user's lineup is complete (11 players)
  const userLineup = isMe(fixture.homeId) ? homeLineup : awayLineup;
  const isUserLineupComplete = userLineup.length === 11;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="panel-glow p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <span className="chip">Jornada {fixture.matchday}</span>
          <div className="text-sm scoreline font-bold text-primary">
            {phase === "preview" ? "00'" : `${minute}'`}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 md:gap-6 items-center text-center">
          <div className="flex flex-col items-center gap-2 md:gap-3">
            <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={64} />
            <div className="font-bold text-sm md:text-base">{home.name}</div>
            <MiniPitch startingXI={homeLineup} formation={homeFormation} teamId={fixture.homeId} className="mt-2" />
          </div>
          <div className="scoreline text-5xl md:text-7xl font-black">
            {phase === "preview" ? "–" : homeScore}
            <span className="text-muted-foreground mx-2 md:mx-3">:</span>
            {phase === "preview" ? "–" : awayScore}
          </div>
          <div className="flex flex-col items-center gap-2 md:gap-3">
            <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={64} />
            <div className="font-bold text-sm md:text-base">{away.name}</div>
            <MiniPitch startingXI={awayLineup} formation={awayFormation} teamId={fixture.awayId} className="mt-2" />
          </div>
        </div>

        {phase !== "preview" && (
          <div className="mt-6 h-1 bg-secondary rounded overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(minute / 90) * 100}%` }} />
          </div>
        )}

        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          {phase === "preview" && (
            <>
              <button 
                onClick={startMatch} 
                disabled={!isUserLineupComplete}
                className={`px-8 py-3 rounded-lg font-black ${isUserLineupComplete ? "bg-primary text-primary-foreground glow-neon hover:brightness-110 transition" : "bg-secondary text-muted-foreground pointer-events-none opacity-40"}`}
              >
                {isUserLineupComplete ? "INICIAR PARTIDO" : "ALINEACIÓN INCOMPLETA"}
              </button>
              <button
                onClick={() => navigate({ to: "/lineup", state: { fromMatch: true } as any })}
                className="px-8 py-3 rounded-lg bg-card border border-border font-semibold hover:border-accent transition"
              >
                Editar Alineación
              </button>
            </>
          )}
          {phase === "playing" && (
            <button onClick={skipToEnd} className="px-6 py-2.5 rounded-lg bg-card border border-border text-sm font-semibold hover:border-accent transition">
              Saltar al final
            </button>
          )}
          {phase === "done" && (
            <button onClick={() => navigate({ to: "/season" })} className="px-8 py-3 rounded-lg bg-primary text-primary-foreground font-black glow-neon hover:brightness-110 transition">
              Volver a la temporada →
            </button>
          )}
        </div>
      </div>

      <div className="panel mt-6 p-5">
        <h3 className="font-bold mb-3">Crónica del partido</h3>
        {phase === "preview" ? (
          <p className="text-sm text-muted-foreground">
            {home.name} recibe a {away.name}. Pulsa "Iniciar partido" para comenzar.
          </p>
        ) : feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin goles aún... el partido está disputado.</p>
        ) : (
          <div className="space-y-2">
            {feed.map((e, i) => {
              const scoringTeam = e.team === "home" ? home : away;
              return (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                  <span className="scoreline text-sm text-primary font-bold w-10">{e.minute}'</span>
                  <span className="text-lg">⚽</span>
                  <TeamLogo teamName={scoringTeam.name} leagueName={getLeagueName(scoringTeam.league)} size={22} />
                  <div className="text-sm min-w-0">
                    <span className="font-bold">{e.scorerName}</span>
                    {e.assistName && (
                      <span className="text-muted-foreground"> · asist. {e.assistName}</span>
                    )}
                    <span className="text-muted-foreground"> ({scoringTeam.short})</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {phase === "done" && fixture.result && (
          <>
            {injuries.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/60">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">🚑 Lesiones</div>
                {injuries.map((inj, i) => {
                  const team = inj.team === "home" ? home : away;
                  return (
                    <div key={i} className="text-sm">
                      <span className="font-bold">{inj.playerName}</span>
                      <span className="text-muted-foreground"> ({team.short}) — {inj.reason}, baja {inj.weeks} {inj.weeks === 1 ? "jornada" : "jornadas"}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-border/60 text-xs text-muted-foreground grid grid-cols-2 gap-2">
              <div>xG {home.short}: <span className="text-foreground scoreline">{fixture.result.xgHome.toFixed(2)}</span></div>
              <div className="text-right">xG {away.short}: <span className="text-foreground scoreline">{fixture.result.xgAway.toFixed(2)}</span></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

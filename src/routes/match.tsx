import { createFileRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getMyNextFixture, loadSave, playMyNextMatch, playMyNextCupMatch, SaveGame, saveSave, setLineup, setFormation, getMyNextFixtureAny, playSpecificFixture, simulateCupMatchday, simulateUCLMatchday, advanceMatchdayLayered, simulateCupMatchdayLayered } from "@/lib/store";
import { Fixture } from "@/lib/season";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { MatchEvent, CardEvent } from "@/lib/simulation";
import { usePlayersStore } from "@/store/playersStore";
import { MiniPitch, generateCPULineup } from "@/components/MiniPitch";
import { CountryFlag } from "@/components/CountryFlag";
import { LeagueLogo } from "@/components/LeagueLogo";

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
  const [cardFeed, setCardFeed] = useState<CardEvent[]>([]);
  const allEventsRef = useRef<MatchEvent[]>([]);
  const allCardsRef = useRef<CardEvent[]>([]);
  const fixtureRef = useRef<Fixture | null>(null);
  const clockTimeoutRef = useRef<number | null>(null);
  const fixtures = usePlayersStore((s) => s.fixtures);
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);
  const pendingUserMatch = usePlayersStore((s) => s.pendingUserMatch);
  const [isCupMatch, setIsCupMatch] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [matchType, setMatchType] = useState<'LEAGUE' | 'CUP' | 'UCL'>('LEAGUE');
  const [cupRound, setCupRound] = useState<string | undefined>(undefined);

  // Extract temporary lineup from router state (if passed from lineup page)
  const routerState = location.state as any;
  const matchLineup = routerState?.matchLineup as string[] | undefined;
  const matchFormation = routerState?.matchFormation as string | undefined;

  // Extract match type from router state (if passed from season page)
  useEffect(() => {
    if (routerState?.matchType) {
      setMatchType(routerState.matchType);
      setCupRound(routerState.cupRound);
      setIsCupMatch(routerState.matchType === 'CUP');
    }
  }, [routerState]);

  // FAILSAFE: If matchType is not in router state, determine it from the fixture
  useEffect(() => {
    const fixture = fixtureRef.current;
    if (!matchType && fixture) {
      const determinedMatchType = fixture.competition === "league" ? "LEAGUE" : 
                                   fixture.competition === "cup" ? "CUP" : "UCL";
      setMatchType(determinedMatchType);
      setCupRound(fixture.competition === "cup" ? fixture.round : undefined);
      setIsCupMatch(determinedMatchType === 'CUP');
      console.log("FAILSAFE: Determined matchType from fixture:", determinedMatchType);
    }
  }, [matchType]);

  // Store original lineup BEFORE applying temporary changes
  const originalLineupRef = useRef<string[] | null>(null);
  const originalFormationRef = useRef<string | null>(null);

  async function handleReturnToSeason() {
    if (!save || isSimulating) return;

    setIsSimulating(true);

    try {
      let next: SaveGame;

      // STRICT BRANCHING by matchType - ensure correct simulation for each competition
      if (matchType === 'CUP') {
        // CUP: Simulate ALL Cup fixtures for the matchday across ALL VIP countries
        // Uses the same layered simulation format as league matches
        console.log("Post-match: Simulating CUP matches for matchday:", fixture.matchday);
        next = await simulateCupMatchdayLayered(save, fixture.matchday, (done, total) => {
          console.log(`Cup matches: ${done}/${total}`);
        });
      } else if (matchType === 'UCL') {
        // UCL: Simulate UCL fixtures for the matchday ONLY
        console.log("Post-match: Simulating UCL matches for matchday:", fixture.matchday);
        next = simulateUCLMatchday(save, fixture.matchday);
      } else {
        // LEAGUE: Execute the league matchday simulation
        console.log("Post-match: Simulating LEAGUE matches");
        next = await advanceMatchdayLayered(save, (done, total) => {
          console.log(`Matches: ${done}/${total}`);
        });
      }

      saveSave(next);
      setSave(next);

      navigate({ to: "/season" });
    } catch (err) {
      console.error("Error al simular jornada:", err);
      alert("Error al simular: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSimulating(false);
    }
  }

  function updateFixtureInStore(fixtureId: string, homeScore: number, awayScore: number, isCup: boolean = false) {
    if (isCup) {
      const s = loadSave();
      if (s) {
        const updated = s.cupFixtures[s.myLeague].map((f) =>
          f.id === fixtureId
            ? { ...f, result: { homeGoals: homeScore, awayGoals: awayScore, events: [], cards: [], injuries: [], xgHome: 0, xgAway: 0 } }
            : f
        );
        const newSave = { ...s, cupFixtures: { ...s.cupFixtures, [s.myLeague]: updated } };
        saveSave(newSave);
      }
    } else {
      const updated = fixtures.map((f) =>
        f.id === fixtureId
          ? { ...f, isPlayed: true, homeScore, awayScore }
          : f
      );
      usePlayersStore.setState({ fixtures: updated });
    }
  }

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    
    // Check if this is a cup match from pendingUserMatch
    const isCup = pendingUserMatch?.competition === "cup";
    setIsCupMatch(!!isCup);
    
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
    
    // Get the fixture based on match type
    if (isCup && pendingUserMatch) {
      // Find cup fixture
      const cupFixture = s.cupFixtures[s.myLeague].find(
        f => f.homeId === pendingUserMatch.homeTeam && f.awayId === pendingUserMatch.awayTeam && !f.result
      );
      fixtureRef.current = cupFixture || null;
    } else {
      // Use getMyNextFixtureAny to find next match from any competition
      fixtureRef.current = getMyNextFixtureAny(saveToUse);
    }
    
    if (!fixtureRef.current) navigate({ to: "/season" });
  }, [navigate, matchLineup, matchFormation, pendingUserMatch]);

  async function startMatch() {
    if (!save) return;
    
    if (!fixtureRef.current) return;
    
    // Check if we used a temporary lineup for this match
    const usedTemporaryLineup = !!matchLineup && !!matchFormation;
    // Use the stored original lineup/formation from refs (saved before temporary changes)
    const originalLineup = originalLineupRef.current;
    const originalFormation = originalFormationRef.current;
    
    // Simulate the specific fixture that's currently loaded
    const { save: newSave, fixture } = playSpecificFixture(save, fixtureRef.current.id);
      
    if (!fixture || !fixture.result) return;
    allEventsRef.current = fixture.result.events;
    allCardsRef.current = fixture.result.cards || [];
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
      updateFixtureInStore(fixture.id, fixture.result.homeGoals, fixture.result.awayGoals, isCupMatch);
    }
    
    // Clear pending match after simulation
    if (isCupMatch) {
      usePlayersStore.setState({ pendingUserMatch: null });
      
      // Simulate remaining cup matches for the matchday
      try {
        console.log("Post-match: Simulating remaining CUP matches for matchday:", fixture.matchday);
        const updatedSave = await simulateCupMatchdayLayered(newSave, fixture.matchday, (done, total) => {
          console.log(`Cup matches: ${done}/${total}`);
        });
        saveSave(updatedSave);
        setSave(updatedSave);
      } catch (err) {
        console.error("Error simulating remaining cup matches:", err);
      }
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
      const cards = allCardsRef.current.filter((c) => c.minute === m);
      if (events.length > 0) {
        setFeed((prev) => [...events, ...prev]);
        for (const ev of events) {
          if (ev.team === "home") setHomeScore((s) => s + 1);
          else setAwayScore((s) => s + 1);
        }
      }
      if (cards.length > 0) {
        setCardFeed((prev) => [...cards, ...prev]);
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
    setCardFeed(allCardsRef.current.slice().reverse());
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
    // Use map to preserve the exact order of players as they were positioned
    const homeSquadPlayers = homeLineupIds.map(id => homeSquad.find(p => p.id === id)).filter(Boolean);
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
    // Use map to preserve the exact order of players as they were positioned
    const awaySquadPlayers = awayLineupIds.map(id => awaySquad.find(p => p.id === id)).filter(Boolean);
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
  
  // Round names mapping for cup matches
  const roundNames: Record<string, string> = {
    "R32": "Treintaidosavos",
    "R16": "Dieciseisavos",
    "Octavos": "Octavos de Final",
    "QF": "Cuartos de Final",
    "SF": "Semifinales",
    "Final": "Final"
  };
  
  // Determine header text based on match type
  const headerText = matchType === 'CUP'
    ? `🛡 Copa Nacional · ${cupRound || fixture.round || ""}`
    : matchType === 'UCL'
    ? `⭐ Champions League · Jornada ${fixture.matchday}`
    : `Liga · Jornada ${fixture.matchday}`;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="panel-glow p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <span className="chip">{headerText}</span>
          <div className="text-sm scoreline font-bold text-primary">
            {phase === "preview" ? "00'" : `${minute}'`}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 md:gap-6 items-center text-center">
          <div className="flex flex-col items-center gap-2 md:gap-3">
            <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={64} />
            <div className="flex items-center gap-2">
              <LeagueLogo league={LEAGUES[home.league]?.name || ""} size="sm" />
              <CountryFlag country={LEAGUES[home.league]?.country || ""} />
              <div className="font-bold text-sm md:text-base">{home.name}</div>
            </div>
            <MiniPitch startingXI={homeLineup} formation={homeFormation} teamId={fixture.homeId} className="mt-2" cards={cardFeed.filter(c => c.team === 'home')} />
          </div>
          <div className="scoreline text-5xl md:text-7xl font-black">
            {phase === "preview" ? "–" : homeScore}
            <span className="text-muted-foreground mx-2 md:mx-3">:</span>
            {phase === "preview" ? "–" : awayScore}
          </div>
          <div className="flex flex-col items-center gap-2 md:gap-3">
            <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={64} />
            <div className="flex items-center gap-2">
              <LeagueLogo league={LEAGUES[away.league]?.name || ""} size="sm" />
              <CountryFlag country={LEAGUES[away.league]?.country || ""} />
              <div className="font-bold text-sm md:text-base">{away.name}</div>
            </div>
            <MiniPitch startingXI={awayLineup} formation={awayFormation} teamId={fixture.awayId} className="mt-2" cards={cardFeed.filter(c => c.team === 'away')} />
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
                onClick={() => navigate({ 
                  to: "/lineup", 
                  state: { 
                    fromMatch: true,
                    matchType,
                    cupRound,
                    fixtureId: fixture.id
                  } as any 
                })}
                className="px-8 py-3 rounded-lg bg-card border border-border font-semibold hover:border-accent transition"
              >
                Editar Alineación
              </button>
              <button 
                onClick={startMatch} 
                disabled={!isUserLineupComplete}
                className={`px-8 py-3 rounded-lg font-black ${isUserLineupComplete ? "bg-primary text-primary-foreground glow-neon hover:brightness-110 transition" : "bg-secondary text-muted-foreground pointer-events-none opacity-40"}`}
              >
                {isUserLineupComplete ? "INICIAR PARTIDO" : "ALINEACIÓN INCOMPLETA"}
              </button>
            </>
          )}
          {phase === "playing" && (
            <button onClick={skipToEnd} className="px-6 py-2.5 rounded-lg bg-card border border-border text-sm font-semibold hover:border-accent transition">
              Saltar al final
            </button>
          )}
          {phase === "done" && (
            <button onClick={handleReturnToSeason} disabled={isSimulating} className="px-8 py-3 rounded-lg bg-primary text-primary-foreground font-black glow-neon hover:brightness-110 transition disabled:opacity-50">
              {isSimulating ? 'Simulando...' : 'Volver a la temporada →'}
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
        ) : feed.length === 0 && cardFeed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos aún... el partido está disputado.</p>
        ) : (
          <div className="space-y-2">
            {[...cardFeed, ...feed]
              .sort((a, b) => b.minute - a.minute)
              .map((e, i) => {
                if ('cardType' in e) {
                  // Card event
                  const card = e as CardEvent;
                  const cardTeam = card.team === "home" ? home : away;
                  const cardEmoji = card.cardType === "yellow" ? "🟨" : "🔴";
                  const cardText = card.isSecondYellow ? "2ª amarilla → roja" : card.cardType === "yellow" ? "Tarjeta amarilla" : "Tarjeta roja";
                  return (
                    <div key={`card-${i}`} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                      <span className="scoreline text-sm text-primary font-bold w-10">{card.minute}'</span>
                      <span className="text-lg">{cardEmoji}</span>
                      <TeamLogo teamName={cardTeam.name} leagueName={getLeagueName(cardTeam.league)} size={22} />
                      <div className="text-sm min-w-0">
                        <span className="font-bold">{card.playerName}</span>
                        <span className="text-muted-foreground"> · {cardText}</span>
                        <span className="text-muted-foreground"> ({cardTeam.short})</span>
                      </div>
                    </div>
                  );
                } else {
                  // Goal event
                  const scoringTeam = e.team === "home" ? home : away;
                  return (
                    <div key={`goal-${i}`} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
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
                }
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

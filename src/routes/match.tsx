// @ts-nocheck
import { createFileRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getMyNextFixture, loadSave, playMyNextMatch, playMyNextCupMatch, SaveGame, saveSave, setLineup, setFormation, getMyNextFixtureAny, playSpecificFixture, simulateCupMatchday, simulateUCLMatchday, simulateUCLKnockoutMatchday, advanceMatchdayLayered, simulateCupMatchdayLayered, getStartersWithFormation, simulateUserPhaseUCLDay, processUCLKnockoutProgress } from "@/lib/store";
import { uclDayOffset } from "@/data/ucl";
import { Fixture } from "@/lib/season";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { MatchEvent, CardEvent, simulateExtraTime, simulatePenaltyShootout } from "@/lib/simulation";
import { usePlayersStore } from "@/store/playersStore";
import { MiniPitch } from "@/components/MiniPitch";
import { CountryFlag } from "@/components/CountryFlag";
import { LeagueLogo } from "@/components/LeagueLogo";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

export const Route = createFileRoute("/match")({ component: MatchPage });

type Phase = "preview" | "playing" | "done" | "extra_time" | "penalties";

function MatchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [phase, setPhase] = useState<Phase>("preview");
  const [minute, setMinute] = useState(0);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [extraTimeHomeScore, setExtraTimeHomeScore] = useState(0);
  const [extraTimeAwayScore, setExtraTimeAwayScore] = useState(0);
  const [penaltyHomeScore, setPenaltyHomeScore] = useState(0);
  const [penaltyAwayScore, setPenaltyAwayScore] = useState(0);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [cardFeed, setCardFeed] = useState<CardEvent[]>([]);
  const allEventsRef = useRef<MatchEvent[]>([]);
  const allCardsRef = useRef<CardEvent[]>([]);
  const extraTimeEventsRef = useRef<MatchEvent[]>([]);
  const fixtureRef = useRef<Fixture | null>(null);
  const clockTimeoutRef = useRef<number | null>(null);
  const extraTimeHomeScoreRef = useRef(0);
  const extraTimeAwayScoreRef = useRef(0);
  const homeXIRef = useRef<any[]>([]);
  const awayXIRef = useRef<any[]>([]);
  const fixtures = usePlayersStore((s) => s.fixtures);
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);
  const pendingUserMatch = usePlayersStore((s) => s.pendingUserMatch);
  const [isCupMatch, setIsCupMatch] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [matchType, setMatchType] = useState<'LEAGUE' | 'CUP' | 'UCL'>('LEAGUE');
  const [cupRound, setCupRound] = useState<string | undefined>(undefined);
  const [returningFromLineupEdit, setReturningFromLineupEdit] = useState(false);
  const [penaltyShootoutIndex, setPenaltyShootoutIndex] = useState(0);
  const [penaltyShootoutData, setPenaltyShootoutData] = useState<any[]>([]);

  // Extract temporary lineup from router state (if passed from lineup page)
  const routerState = location.state as any;
  const matchLineup = routerState?.matchLineup as string[] | undefined;
  const matchFormation = routerState?.matchFormation as string | undefined;
  const returningFromLineup = routerState?.returningFromLineupEdit === true;
  const fixtureId = routerState?.fixtureId as string | undefined;

  // Show injury/red card notifications when match ends
  useEffect(() => {
    if (phase !== "done" || !fixtureRef.current?.result || !save) return;
    const result = fixtureRef.current.result;
    const myTeamId = save.myTeamId;
    const fixture = fixtureRef.current;
    const isHome = fixture.homeId === myTeamId;
    const myTeam = isHome ? "home" : "away";

    for (const inj of result.injuries || []) {
      if (inj.team === myTeam) {
        toast.error(`${inj.playerName} se ha lesionado (${inj.reason}) — ${inj.weeks} partido${inj.weeks > 1 ? 's' : ''} de baja`);
      }
    }

    for (const card of result.cards || []) {
      if (card.cardType === "red" && card.team === myTeam) {
        const susp = save.suspensions[myTeamId]?.find(s => s.playerId === card.playerId);
        const matchdays = susp?.matchdaysRemaining ?? 1;
        toast.error(`${card.playerName} expulsado — suspensión de ${matchdays} partido${matchdays > 1 ? 's' : ''}`);
      }
    }
  }, [phase]);

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
        // UCL: Simulate AI matches in user's phase on return to season
        console.log("Post-match: Simulating AI UCL matches for matchday:", fixture.matchday);
        next = simulateUserPhaseUCLDay(save, fixture.matchday, save.myTeamId);
        // Process knockout progression if needed
        const offset = uclDayOffset(usePlayersStore.getState().currentDate);
        next = processUCLKnockoutProgress(next, offset);
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

  function handleGoToExtraTime() {
    if (!save || !fixtureRef.current) return;
    
    const fixture = fixtureRef.current;
    
    // Check if fixture already has extra time result - don't allow going to extra time again
    if (fixture.result?.extraTime) {
      console.log("Fixture already has extra time result, cannot go to extra time again");
      return;
    }
    
    const home = teamById(fixture.homeId);
    const away = teamById(fixture.awayId);
    if (!home || !away) return;
    
    // Get lineups
    const homeXI = getSimSquad(fixture.homeId);
    const awayXI = getSimSquad(fixture.awayId);
    
    // Simulate extra time
    const etResult = simulateExtraTime(home, away, homeXI, awayXI);
    
    // Store extra time events for playback
    extraTimeEventsRef.current = etResult.events;
    
    // Reset minute to 90 for extra time playback
    setMinute(90);
    setPhase("extra_time");
    
    // Start the clock for extra time (90-120)
    runExtraTimeClock();
  }
  
  function runExtraTimeClock() {
    let m = 90;
    const tick = () => {
      m += 1;
      setMinute(m);
      
      // Check for events at this minute
      const eventsAtMinute = extraTimeEventsRef.current.filter(e => e.minute === m);
      if (eventsAtMinute.length > 0) {
        setFeed(prev => [...prev, ...eventsAtMinute]);
        
        // Update scores using refs for immediate access
        eventsAtMinute.forEach(ev => {
          if (ev.type === "goal") {
            console.log(`Goal at minute ${m}: ${ev.team} team scores`);
            if (ev.team === "home") {
              extraTimeHomeScoreRef.current += 1;
              setExtraTimeHomeScore(extraTimeHomeScoreRef.current);
              console.log(`Extra time home score: ${extraTimeHomeScoreRef.current - 1} -> ${extraTimeHomeScoreRef.current}`);
            } else {
              extraTimeAwayScoreRef.current += 1;
              setExtraTimeAwayScore(extraTimeAwayScoreRef.current);
              console.log(`Extra time away score: ${extraTimeAwayScoreRef.current - 1} -> ${extraTimeAwayScoreRef.current}`);
            }
          }
        });
      }
      
      if (m < 120) {
        clockTimeoutRef.current = window.setTimeout(tick, 100);
      } else {
        // Extra time finished - clear timeout
        if (clockTimeoutRef.current !== null) {
          window.clearTimeout(clockTimeoutRef.current);
          clockTimeoutRef.current = null;
        }
        console.log(`Clock reached 120, calling handleExtraTimeFinished`);
        console.log(`Current state: homeScore=${homeScore}, awayScore=${awayScore}, extraTimeHomeScore=${extraTimeHomeScore}, extraTimeAwayScore=${extraTimeAwayScore}`);
        handleExtraTimeFinished();
      }
    };
    
    clockTimeoutRef.current = window.setTimeout(tick, 100);
  }
  
  function handleExtraTimeFinished() {
    const totalHomeScore = homeScore + extraTimeHomeScoreRef.current;
    const totalAwayScore = awayScore + extraTimeAwayScoreRef.current;

    console.log(`Extra time finished: Home: ${homeScore} + ${extraTimeHomeScoreRef.current} = ${totalHomeScore}, Away: ${awayScore} + ${extraTimeAwayScoreRef.current} = ${totalAwayScore}`);
    console.log(`Comparison: ${totalHomeScore} === ${totalAwayScore} = ${totalHomeScore === totalAwayScore}`);
    console.log(`Type check: typeof totalHomeScore = ${typeof totalHomeScore}, typeof totalAwayScore = ${typeof totalAwayScore}`);

    // Check if aggregate is tied for UCL two-legged ties
    let aggregateTied = totalHomeScore === totalAwayScore;
    const isLeg2 = fixtureRef.current?.round?.endsWith("-Leg2");
    if (isLeg2 && save?.uclFixtures) {
      const leg1 = save.uclFixtures.find(l =>
        l.round === fixtureRef.current!.round!.replace("Leg2", "Leg1") &&
        ((l.homeId === fixtureRef.current!.awayId && l.awayId === fixtureRef.current!.homeId) ||
         (l.homeId === fixtureRef.current!.homeId && l.awayId === fixtureRef.current!.awayId))
      );
      if (leg1?.result) {
        const aggHome = totalHomeScore + leg1.result.awayGoals;
        const aggAway = totalAwayScore + leg1.result.homeGoals;
        aggregateTied = aggHome === aggAway;
        console.log(`Aggregate check: leg1 ${leg1.result.homeGoals}-${leg1.result.awayGoals}, leg2 ${totalHomeScore}-${totalAwayScore}, agg ${aggHome}-${aggAway}, tied: ${aggregateTied}`);
      }
    }

    if (aggregateTied) {
      // Go to penalties
      console.log("Scores are tied, going to penalties");
      handlePenaltyShootout();
    } else {
      // Match ended in extra time
      console.log("Match ended in extra time with a winner");
      handleMatchEndWithExtraTime();
    }
  }
  
  function handlePenaltyShootout() {
    if (!save || !fixtureRef.current) return;
    
    const fixture = fixtureRef.current;
    const homeXI = getSimSquad(fixture.homeId);
    const awayXI = getSimSquad(fixture.awayId);
    
    // Store XIs in refs for use in skipPenaltyShootoutToEnd
    homeXIRef.current = homeXI;
    awayXIRef.current = awayXI;
    
    // Simulate penalty shootout data
    const penaltyResult = simulatePenaltyShootout(homeXI, awayXI);
    setPenaltyShootoutData(penaltyResult.shootout);
    setPenaltyShootoutIndex(0);
    
    // Start visual penalty shootout
    setPhase("penalties");
    runPenaltyShootoutClock(penaltyResult.shootout, homeXI, awayXI);
  }
  
  function runPenaltyShootoutClock(shootout: any[], homeXI: any[], awayXI: any[]) {
    let idx = 0;
    const tick = () => {
      if (idx >= shootout.length) {
        // Shootout complete - calculate final scores and finish
        const finalHomeScore = shootout.filter(s => s.team === 'home' && s.scored).length;
        const finalAwayScore = shootout.filter(s => s.team === 'away' && s.scored).length;
        handlePenaltyShootoutFinished(finalHomeScore, finalAwayScore);
        return;
      }
      
      const shot = shootout[idx];
      
      // Get player name from the appropriate XI
      const playerXI = shot.team === 'home' ? homeXI : awayXI;
      const player = playerXI.find(p => p.id === shot.playerId);
      const playerName = player ? player.name : 'Unknown';
      
      // Add penalty event to feed with scored/missed information
      const penaltyEvent: MatchEvent = {
        minute: 120 + idx,
        team: shot.team === 'home' ? 'home' : 'away',
        type: 'penalty' as any,
        scorerId: shot.playerId,
        scorerName: playerName,
        assistName: shot.scored ? '✅ Anotado' : '❌ Fallado',
      };
      setFeed(prev => [...prev, penaltyEvent]);
      
      // Update penalty scores
      if (shot.team === 'home') {
        if (shot.scored) setPenaltyHomeScore(s => s + 1);
      } else {
        if (shot.scored) setPenaltyAwayScore(s => s + 1);
      }
      
      setPenaltyShootoutIndex(idx + 1);
      
      // Check if shootout should end early (traditional format)
      const homeGoals = penaltyShootoutData.slice(0, idx + 1).filter(s => s.team === 'home' && s.scored).length;
      const awayGoals = penaltyShootoutData.slice(0, idx + 1).filter(s => s.team === 'away' && s.scored).length;
      const roundsPlayed = Math.ceil((idx + 1) / 2);
      
      // Check if winner is determined after 5 rounds or in sudden death
      if (roundsPlayed >= 5) {
        const remainingShots = shootout.length - (idx + 1);
        const maxPossibleHome = homeGoals + Math.ceil(remainingShots / 2);
        const maxPossibleAway = awayGoals + Math.floor(remainingShots / 2);
        
        if (homeGoals > maxPossibleAway || awayGoals > maxPossibleHome) {
          // Winner determined, calculate final scores and stop shootout
          const finalHomeScore = shootout.filter(s => s.team === 'home' && s.scored).length;
          const finalAwayScore = shootout.filter(s => s.team === 'away' && s.scored).length;
          setTimeout(() => handlePenaltyShootoutFinished(finalHomeScore, finalAwayScore), 500);
          return;
        }
      }
      
      idx++;
      clockTimeoutRef.current = window.setTimeout(tick, 2000);
    };
    
    clockTimeoutRef.current = window.setTimeout(tick, 2000);
  }
  
  function handlePenaltyShootoutFinished(homePenaltyScore?: number, awayPenaltyScore?: number) {
    if (!save || !fixtureRef.current) return;

    const fixture = fixtureRef.current;

    // Use provided scores or current state
    const finalHomePenaltyScore = homePenaltyScore !== undefined ? homePenaltyScore : penaltyHomeScore;
    const finalAwayPenaltyScore = awayPenaltyScore !== undefined ? awayPenaltyScore : penaltyAwayScore;

    console.log(`handlePenaltyShootoutFinished: finalHomePenaltyScore=${finalHomePenaltyScore}, finalAwayPenaltyScore=${finalAwayPenaltyScore}`);

    // Save result with penalties
    updateFixtureInStore(
      fixture.id,
      homeScore + extraTimeHomeScoreRef.current,
      awayScore + extraTimeAwayScoreRef.current,
      true,
      { homeGoals: extraTimeHomeScoreRef.current, awayGoals: extraTimeAwayScoreRef.current },
      { homeGoals: finalHomePenaltyScore, awayGoals: finalAwayPenaltyScore },
      matchType === 'UCL'
    );

    // Reload the fixture from save to get updated result
    const s = loadSave();
    if (s) {
      let found = null;
      // Check UCL fixtures first if it's a UCL match
      if (matchType === 'UCL' && s.uclFixtures) {
        found = s.uclFixtures.find(f => f.id === fixture.id);
        if (found) {
          fixtureRef.current = found;
          console.log("Reloaded UCL fixture with result after penalties:", found.result);
        }
      }
      // If not found in UCL, check cup fixtures
      if (!found) {
        for (const [league, fixtures] of Object.entries(s.cupFixtures)) {
          found = fixtures.find(f => f.id === fixture.id);
          if (found) {
            fixtureRef.current = found;
            console.log("Reloaded cup fixture with result after penalties:", found.result);
            break;
          }
        }
      }

      // Update the save state with the reloaded save
      setSave(s);

      // Clear pending match after simulation
      usePlayersStore.setState({ pendingUserMatch: null });

      // Clear clock timeout
      if (clockTimeoutRef.current !== null) {
        window.clearTimeout(clockTimeoutRef.current);
        clockTimeoutRef.current = null;
      }

      // Set phase to done immediately, then simulate remaining matches in background
      setPhase("done");
      simulateRemainingCupMatches(fixture.matchday, s);
    } else {
      // Clear pending match after simulation
      usePlayersStore.setState({ pendingUserMatch: null });
      
      // Clear clock timeout
      if (clockTimeoutRef.current !== null) {
        window.clearTimeout(clockTimeoutRef.current);
        clockTimeoutRef.current = null;
      }
      
      // Set phase to done immediately, then simulate remaining matches in background
      setPhase("done");
      simulateRemainingCupMatches(fixture.matchday, save);
    }
  }
  
  function handleMatchEndWithExtraTime() {
    if (!save || !fixtureRef.current) return;

    const fixture = fixtureRef.current;

    console.log(`handleMatchEndWithExtraTime called: homeScore=${homeScore}, extraTimeHomeScoreRef=${extraTimeHomeScoreRef.current}, awayScore=${awayScore}, extraTimeAwayScoreRef=${extraTimeAwayScoreRef.current}`);

    // Save result with extra time
    updateFixtureInStore(
      fixture.id,
      homeScore + extraTimeHomeScoreRef.current,
      awayScore + extraTimeAwayScoreRef.current,
      true,
      { homeGoals: extraTimeHomeScoreRef.current, awayGoals: extraTimeAwayScoreRef.current },
      undefined,
      matchType === 'UCL'
    );

    // Reload the fixture from save to get updated result
    const s = loadSave();
    if (s) {
      let found = null;
      // Check UCL fixtures first if it's a UCL match
      if (matchType === 'UCL' && s.uclFixtures) {
        found = s.uclFixtures.find(f => f.id === fixture.id);
        if (found) {
          fixtureRef.current = found;
          console.log("Reloaded UCL fixture with result:", found.result);
        }
      }
      // If not found in UCL, check cup fixtures
      if (!found) {
        for (const [league, fixtures] of Object.entries(s.cupFixtures)) {
          found = fixtures.find(f => f.id === fixture.id);
          if (found) {
            fixtureRef.current = found;
            console.log("Reloaded cup fixture with result:", found.result);
            break;
          }
        }
      }

      // Update the save state with the reloaded save
      setSave(s);

      // Clear pending match after simulation
      usePlayersStore.setState({ pendingUserMatch: null });

      // Set phase to done immediately, then simulate remaining matches in background
      console.log("Setting phase to done in handleMatchEndWithExtraTime");
      setPhase("done");
      simulateRemainingCupMatches(fixture.matchday, s);
    } else {
      // Clear pending match after simulation
      usePlayersStore.setState({ pendingUserMatch: null });

      // Set phase to done immediately, then simulate remaining matches in background
      console.log("Setting phase to done in handleMatchEndWithExtraTime");
      setPhase("done");
      simulateRemainingCupMatches(fixture.matchday, save);
    }
  }
  
  async function simulateRemainingCupMatches(matchday: number, saveToUse: SaveGame | null = null) {
    try {
      const currentSave = saveToUse || save;
      console.log("Post-extra-time: Simulating remaining CUP matches for matchday:", matchday);
      console.log("simulateRemainingCupMatches: saveToUse provided?", !!saveToUse);
      if (saveToUse) {
        const userFixture = Object.values(saveToUse.cupFixtures).flat().find(f => f.homeId === saveToUse.myTeamId || f.awayId === saveToUse.myTeamId);
        console.log("simulateRemainingCupMatches: user fixture in saveToUse:", userFixture ? JSON.stringify(userFixture.result, null, 2) : "not found");
      }
      const updatedSave = await simulateCupMatchdayLayered(currentSave, matchday, (done, total) => {
        console.log(`Cup matches: ${done}/${total}`);
      });
      saveSave(updatedSave);
      setSave(updatedSave);
      console.log("Cup matches simulation complete, setting phase to done");
    } catch (err) {
      console.error("Error simulating remaining cup matches:", err);
    }
  }

  function updateFixtureInStore(fixtureId: string, homeScore: number, awayScore: number, isCup: boolean = false, extraTimeData?: { homeGoals: number; awayGoals: number }, penaltyData?: { homeGoals: number; awayGoals: number }, isUCL: boolean = false) {
    console.log(`updateFixtureInStore called: fixtureId=${fixtureId}, homeScore=${homeScore}, awayScore=${awayScore}, isCup=${isCup}, isUCL=${isUCL}, extraTimeData=${JSON.stringify(extraTimeData)}, penaltyData=${JSON.stringify(penaltyData)}`);

    if (isUCL) {
      const s = loadSave();
      if (s && s.uclFixtures) {
        // For UCL matches, homeGoals and awayGoals should be regular time only
        // extraTime.homeGoals and extraTime.awayGoals are the additional goals in extra time
        const result: any = {
          homeGoals: homeScore - (extraTimeData?.homeGoals || 0),
          awayGoals: awayScore - (extraTimeData?.awayGoals || 0),
          events: allEventsRef.current,
          cards: allCardsRef.current,
          injuries: [],
          xgHome: 0,
          xgAway: 0
        };

        if (extraTimeData) {
          result.extraTime = {
            homeGoals: extraTimeData.homeGoals,
            awayGoals: extraTimeData.awayGoals,
            events: extraTimeEventsRef.current
          };
          console.log("Adding extraTime to result:", result.extraTime);
        }

        if (penaltyData) {
          result.penalties = {
            homeGoals: penaltyData.homeGoals,
            awayGoals: penaltyData.awayGoals,
            shootout: penaltyShootoutData
          };
          console.log("Adding penalties to result:", result.penalties);
        }

        console.log("Final result to save:", result);

        const updated = s.uclFixtures.map((f) =>
          f.id === fixtureId
            ? { ...f, result }
            : f
        );
        const newSave = { ...s, uclFixtures: updated };
        saveSave(newSave);
        console.log("UCL result saved successfully");
      }
    } else if (isCup) {
      const s = loadSave();
      if (s) {
        // For cup matches, homeGoals and awayGoals should be regular time only
        // extraTime.homeGoals and extraTime.awayGoals are the additional goals in extra time
        const result: any = {
          homeGoals: homeScore - (extraTimeData?.homeGoals || 0),
          awayGoals: awayScore - (extraTimeData?.awayGoals || 0),
          events: allEventsRef.current,
          cards: allCardsRef.current,
          injuries: [],
          xgHome: 0,
          xgAway: 0
        };

        if (extraTimeData) {
          result.extraTime = {
            homeGoals: extraTimeData.homeGoals,
            awayGoals: extraTimeData.awayGoals,
            events: extraTimeEventsRef.current
          };
          console.log("Adding extraTime to result:", result.extraTime);
        }

        if (penaltyData) {
          result.penalties = {
            homeGoals: penaltyData.homeGoals,
            awayGoals: penaltyData.awayGoals,
            shootout: penaltyShootoutData
          };
          console.log("Adding penalties to result:", result.penalties);
        }

        console.log("Final result to save:", result);

        // Find the fixture to determine which league it belongs to
        let fixtureLeague = s.myLeague;
        for (const [league, fixtures] of Object.entries(s.cupFixtures)) {
          const found = fixtures.find(f => f.id === fixtureId);
          if (found) {
            fixtureLeague = league;
            break;
          }
        }

        const leagueFixtures = s.cupFixtures[fixtureLeague];
        if (!leagueFixtures) {
          console.error(`No cup fixtures found for league: ${fixtureLeague}`);
          return;
        }

        const updated = leagueFixtures.map((f) =>
          f.id === fixtureId
            ? { ...f, result }
            : f
        );
        const newSave = { ...s, cupFixtures: { ...s.cupFixtures, [fixtureLeague]: updated } };
        saveSave(newSave);
        console.log("Result saved successfully");
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
    if (isCup && pendingUserMatch && !returningFromLineup) {
      // Find cup fixture (only if not returning from lineup edit)
      const cupFixture = s.cupFixtures[s.myLeague].find(
        f => f.homeId === pendingUserMatch.homeTeam && f.awayId === pendingUserMatch.awayTeam && !f.result
      );
      fixtureRef.current = cupFixture || null;
    } else if (returningFromLineup && fixtureId) {
      // Returning from lineup edit - load the specific fixture by ID
      // First try league fixtures
      let foundFixture = s.fixtures[s.myLeague].find(f => f.id === fixtureId);
      if (!foundFixture) {
        // Try cup fixtures
        for (const lg of Object.keys(s.cupFixtures) as LeagueId[]) {
          foundFixture = s.cupFixtures[lg].find(f => f.id === fixtureId);
          if (foundFixture) break;
        }
      }
      fixtureRef.current = foundFixture || null;
      
      // If fixture has a result, load it into the UI
      if (foundFixture?.result) {
        console.log("Loading fixture with result:", foundFixture.result);
        console.log("Has extraTime:", !!foundFixture.result.extraTime);
        console.log("Has penalties:", !!foundFixture.result.penalties);
        
        allEventsRef.current = foundFixture.result.events;
        allCardsRef.current = foundFixture.result.cards || [];
        setHomeScore(foundFixture.result.homeGoals);
        setAwayScore(foundFixture.result.awayGoals);
        setFeed(foundFixture.result.events.slice().reverse());
        setCardFeed((foundFixture.result.cards || []).slice().reverse());
        setMinute(90);
        
        // Load extra time data if present
        if (foundFixture.result.extraTime) {
          console.log("Loading extra time data:", foundFixture.result.extraTime);
          setExtraTimeHomeScore(foundFixture.result.extraTime.homeGoals);
          setExtraTimeAwayScore(foundFixture.result.extraTime.awayGoals);
          extraTimeHomeScoreRef.current = foundFixture.result.extraTime.homeGoals;
          extraTimeAwayScoreRef.current = foundFixture.result.extraTime.awayGoals;
          extraTimeEventsRef.current = foundFixture.result.extraTime.events || [];
          setMinute(120);
        }
        
        // Load penalty data if present
        if (foundFixture.result.penalties) {
          console.log("Loading penalty data:", foundFixture.result.penalties);
          setPenaltyHomeScore(foundFixture.result.penalties.homeGoals);
          setPenaltyAwayScore(foundFixture.result.penalties.awayGoals);
          setPenaltyShootoutData(foundFixture.result.penalties.shootout || []);
        }
        
        setPhase("done");
        setIsCupMatch(foundFixture.competition === "cup");
        console.log("Phase set to done, isCupMatch:", foundFixture.competition === "cup");
      }
    } else {
      // Use getMyNextFixtureAny to find next match from any competition
      fixtureRef.current = getMyNextFixtureAny(saveToUse);
      // Set isCupMatch based on fixture competition
      if (fixtureRef.current) {
        setIsCupMatch(fixtureRef.current.competition === "cup");
      }
    }
    
    if (!fixtureRef.current) {
      console.error("No fixture found, navigating to season");
      navigate({ to: "/season" });
      return;
    }
  }, [navigate, matchLineup, matchFormation, pendingUserMatch, returningFromLineup]);

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
    
    // For cup matches that end in a draw, don't save the result yet
    // Allow user to edit lineup and go to extra time
    const isCupDraw = isCupMatch && fixture.result.homeGoals === fixture.result.awayGoals;
    
    if (!isCupDraw) {
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
    } else {
      // Cup match ended in draw - don't save result yet, allow extra time
      // Just update the state with the simulated result for display
      setSave(newSave);
      // Keep isCupMatch true so the UI shows the correct buttons
      setIsCupMatch(true);
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
  
  function skipPenaltyShootoutToEnd() {
    // Clear the running clock timeout immediately
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }
    
    // Calculate final penalty scores
    let finalHomeScore = penaltyHomeScore;
    let finalAwayScore = penaltyAwayScore;
    
    // Add all remaining penalty events to feed
    const remainingShots = penaltyShootoutData.slice(penaltyShootoutIndex);
    remainingShots.forEach((shot, idx) => {
      // Get player name from the appropriate XI ref
      const playerXI = shot.team === 'home' ? homeXIRef.current : awayXIRef.current;
      const player = playerXI.find(p => p.id === shot.playerId);
      const playerName = player ? player.name : 'Unknown';
      
      const penaltyEvent: MatchEvent = {
        minute: 120 + penaltyShootoutIndex + idx,
        team: shot.team === 'home' ? 'home' : 'away',
        type: 'penalty' as any,
        scorerId: shot.playerId,
        scorerName: playerName,
        assistName: shot.scored ? '✅ Anotado' : '❌ Fallado',
      };
      setFeed(prev => [...prev, penaltyEvent]);
      
      // Update penalty scores
      if (shot.team === 'home') {
        if (shot.scored) {
          setPenaltyHomeScore(s => s + 1);
          finalHomeScore++;
        }
      } else {
        if (shot.scored) {
          setPenaltyAwayScore(s => s + 1);
          finalAwayScore++;
        }
      }
    });
    
    // Finish shootout with calculated scores
    handlePenaltyShootoutFinished(finalHomeScore, finalAwayScore);
  }
  
  function skipExtraTimeToEnd() {
    // Clear the running clock timeout immediately
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }
    
    // Add all extra time events to feed
    setFeed(prev => [...prev, ...extraTimeEventsRef.current]);
    
    // Set final extra time scores based on actual events
    const etHomeGoals = extraTimeEventsRef.current.filter(e => e.team === 'home' && e.type === 'goal').length;
    const etAwayGoals = extraTimeEventsRef.current.filter(e => e.team === 'away' && e.type === 'goal').length;
    setExtraTimeHomeScore(etHomeGoals);
    setExtraTimeAwayScore(etAwayGoals);
    
    console.log(`Skip extra time: ET scores - Home: ${etHomeGoals}, Away: ${etAwayGoals}, Total Home: ${homeScore + etHomeGoals}, Total Away: ${awayScore + etAwayGoals}`);
    
    setMinute(120);
    handleExtraTimeFinished();
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
  const isHome = fixture.homeId === myId;
  const isMe = (id: string) => id === myId;
  const injuries = fixture.result?.injuries ?? [];

  // Debug: log fixture info
  console.log("Match fixture:", { homeId: fixture.homeId, awayId: fixture.awayId, myId, isHome, homeName: home?.name, awayName: away?.name });

  // Get lineups for both teams
  const homeSquad = getSimSquad(fixture.homeId);
  const awaySquad = getSimSquad(fixture.awayId);
  
  // Determine home team lineup and formation
  let homeLineup: any[] = [];
  let homeFormation: any = "Táctica 4-4-2";
  
  if (isMe(fixture.homeId)) {
    // User's team - use temporary lineup if available, otherwise use global
    const homeLineupIds = matchLineup || save.lineups[fixture.homeId] || [];
    homeLineup = homeLineupIds.map(id => homeSquad.find(p => p.id === id)).filter(Boolean);
    homeFormation = matchFormation || save.formations[fixture.homeId] || "Táctica 4-4-2";
  } else {
    // CPU team - use getStartersWithFormation to get both XI and the formation used
    const { players: homePlayers, formation: homeFmt } = getStartersWithFormation(save, fixture.homeId, { randomFormation: true });
    homeLineup = homePlayers;
    homeFormation = homeFmt;
  }
  
  // Determine away team lineup and formation
  let awayLineup: any[] = [];
  let awayFormation: any = "Táctica 4-4-2";
  
  if (isMe(fixture.awayId)) {
    // User's team - use temporary lineup if available, otherwise use global
    const awayLineupIds = matchLineup || save.lineups[fixture.awayId] || [];
    awayLineup = awayLineupIds.map(id => awaySquad.find(p => p.id === id)).filter(Boolean);
    awayFormation = matchFormation || save.formations[fixture.awayId] || "Táctica 4-4-2";
  } else {
    // CPU team - use getStartersWithFormation to get both XI and the formation used
    const { players: awayPlayers, formation: awayFmt } = getStartersWithFormation(save, fixture.awayId, { randomFormation: true });
    awayLineup = awayPlayers;
    awayFormation = awayFmt;
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
    ? `Copa Nacional · ${cupRound || fixture.round || ""}`
    : matchType === 'UCL'
    ? `Champions League · Jornada ${fixture.matchday}`
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
            {phase === "preview" ? "–" : 
             phase === "extra_time" ? homeScore + extraTimeHomeScore : 
             phase === "penalties" ? `${homeScore + extraTimeHomeScore}(${penaltyHomeScore})` :
             phase === "done" && fixtureRef.current?.result?.penalties ? `${(fixtureRef.current.result.homeGoals + (fixtureRef.current.result.extraTime?.homeGoals || 0))}(${fixtureRef.current.result.penalties.homeGoals})` :
             phase === "done" && fixtureRef.current?.result?.extraTime ? fixtureRef.current.result.homeGoals + fixtureRef.current.result.extraTime.homeGoals :
             phase === "done" ? fixtureRef.current?.result?.homeGoals || homeScore :
             homeScore}
            <span className="text-muted-foreground mx-2 md:mx-3">:</span>
            {phase === "preview" ? "–" : 
             phase === "extra_time" ? awayScore + extraTimeAwayScore : 
             phase === "penalties" ? `${penaltyAwayScore})${awayScore + extraTimeAwayScore}` :
             phase === "done" && fixtureRef.current?.result?.penalties ? `${fixtureRef.current.result.penalties.awayGoals})${(fixtureRef.current.result.awayGoals + (fixtureRef.current.result.extraTime?.awayGoals || 0))}` :
             phase === "done" && fixtureRef.current?.result?.extraTime ? fixtureRef.current.result.awayGoals + fixtureRef.current.result.extraTime.awayGoals :
             phase === "done" ? fixtureRef.current?.result?.awayGoals || awayScore :
             awayScore}
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
            <div className="h-full bg-primary transition-all" style={{ width: `${(minute / (phase === "extra_time" ? 120 : 90)) * 100}%` }} />
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
          {phase === "extra_time" && (
            <button onClick={skipExtraTimeToEnd} className="px-6 py-2.5 rounded-lg bg-card border border-border text-sm font-semibold hover:border-accent transition">
              Saltar al final
            </button>
          )}
          {phase === "penalties" && (
            <button onClick={skipPenaltyShootoutToEnd} className="px-6 py-2.5 rounded-lg bg-card border border-border text-sm font-semibold hover:border-accent transition">
              Saltar al final
            </button>
          )}
          {phase === "done" && (
            <>
              {(() => {
                const isUCLKnockout = matchType === 'UCL' && fixture?.round && (
                  fixture.round === "Final" ||
                  fixture.round.includes("Playoff") ||
                  fixture.round.includes("R16") ||
                  fixture.round.includes("QF") ||
                  fixture.round.includes("SF") ||
                  fixture.round.endsWith("-Leg2")
                );
                const isLeg2 = fixture?.round?.endsWith("-Leg2");
                const isFinal = fixture?.round === "Final";

                // Check if aggregate is tied for two-legged ties
                let aggregateTied = false;
                if (isLeg2 && save?.uclFixtures) {
                  const leg1 = save.uclFixtures.find(l =>
                    l.round === fixture.round!.replace("Leg2", "Leg1") &&
                    ((l.homeId === fixture.awayId && l.awayId === fixture.homeId) ||
                     (l.homeId === fixture.homeId && l.awayId === fixture.awayId))
                  );
                  if (leg1?.result && fixtureRef.current?.result) {
                    const aggHome = fixtureRef.current.result.homeGoals + leg1.result.awayGoals;
                    const aggAway = fixtureRef.current.result.awayGoals + leg1.result.homeGoals;
                    aggregateTied = aggHome === aggAway;
                  }
                }

                // For cup matches: show ET button if match is drawn without ET/penalties
                const shouldShowExtraTimeButtonForCup = (isCupMatch || fixture?.competition === "cup") &&
                  fixtureRef.current?.result?.homeGoals === fixtureRef.current?.result?.awayGoals &&
                  !fixtureRef.current?.result?.extraTime &&
                  !fixtureRef.current?.result?.penalties;

                // For UCL knockout: show ET button only in leg2 when aggregate is tied, or in final when match is drawn
                const shouldShowExtraTimeButtonForUCL = isUCLKnockout &&
                  !fixtureRef.current?.result?.extraTime &&
                  !fixtureRef.current?.result?.penalties &&
                  ((isFinal && fixtureRef.current?.result?.homeGoals === fixtureRef.current?.result?.awayGoals) ||
                   (isLeg2 && aggregateTied));

                const shouldShowExtraTimeButton = shouldShowExtraTimeButtonForCup || shouldShowExtraTimeButtonForUCL;

                return shouldShowExtraTimeButton ? (
                  // Cup/UCL knockout match ended in draw without extra time/penalties - show edit lineup and extra time buttons
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate({ to: "/lineup", state: { fromMatch: true, returningFromLineupEdit: true, matchType, cupRound, fixtureId: fixture.id } })}
                      className="px-6 py-3 rounded-lg bg-card border border-border text-sm font-semibold hover:border-accent transition"
                    >
                      Editar alineación
                    </button>
                    <button
                      onClick={handleGoToExtraTime}
                      className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-black glow-neon hover:brightness-110 transition"
                    >
                      Ir a la prorroga
                    </button>
                  </div>
                ) : (
                  // Normal match or cup match with winner/resolved - show return to season button
                  <button onClick={handleReturnToSeason} disabled={isSimulating} className="px-8 py-3 rounded-lg bg-primary text-primary-foreground font-black glow-neon hover:brightness-110 transition disabled:opacity-50">
                    {isSimulating ? 'Simulando...' : 'Volver a la temporada →'}
                  </button>
                );
              })()}
            </>
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
                  const cardText = card.isSecondYellow ? "2ª amarilla → roja" : card.cardType === "yellow" ? "Tarjeta amarilla" : "Tarjeta roja";
                  return (
                    <div key={`card-${i}`} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                      <span className="scoreline text-sm text-primary font-bold w-10">{card.minute}'</span>
                      <span className={`w-5 h-3 rounded-sm shrink-0 ${card.cardType === 'yellow' ? 'bg-yellow-400' : 'bg-red-500'}`} />
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
                  const isPenalty = e.type === 'penalty';
                  return (
                    <div key={`goal-${i}`} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                      <span className="scoreline text-sm text-primary font-bold w-10">{e.minute}'</span>
                      <span className="text-lg">
                        {isPenalty ? <span className="px-1.5 py-0.5 text-[0.8rem] font-bold rounded bg-white/6">P</span> : <span className="w-3 h-3 inline-block rounded-full bg-white/80" />}
                      </span>
                      <TeamLogo teamName={scoringTeam.name} leagueName={getLeagueName(scoringTeam.league)} size={22} />
                      <div className="text-sm min-w-0">
                        <span className="font-bold">{e.scorerName}</span>
                        {isPenalty && e.assistName && (
                          <span className="text-muted-foreground"> · {e.assistName}</span>
                        )}
                        {!isPenalty && e.assistName && (
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
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Lesiones</div>
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

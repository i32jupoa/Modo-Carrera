// @ts-nocheck
import { createFileRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getMyNextFixture,
  loadSave,
  playMyNextMatch,
  playMyNextCupMatch,
  SaveGame,
  saveSave,
  setLineup,
  setFormation,
  getMyNextFixtureAny,
  playSpecificFixture,
  simulateCupMatchday,
  simulateUCLMatchday,
  simulateUCLKnockoutMatchday,
  advanceMatchdayLayered,
  simulateCupMatchdayLayered,
  getStartersWithFormation,
  simulateUserPhaseUCLDay,
  processUCLKnockoutProgress,
} from "@/lib/store";
import { uclDayOffset } from "@/data/ucl";
import { Fixture } from "@/lib/season";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import {
  MatchEvent,
  CardEvent,
  simulateExtraTime,
  simulatePenaltyShootout,
  type HighlightEvent,
} from "@/lib/simulation";
import { accumulateStats, computePlayerRatings, type MatchStats } from "@/lib/matchStats";
import { MatchStatsPanel } from "@/components/match/MatchStatsPanel";
import { PlayerRatingsPanel } from "@/components/match/PlayerRatingsPanel";
import {
  MATCH_TICK_MS,
  MATCH_START_DELAY_MS,
  EXTRA_TIME_TICK_MS,
  saveMatchSnapshot,
  loadMatchSnapshot,
  clearMatchSnapshot,
} from "@/lib/matchPlayback";
import {
  saveLive,
  loadLive,
  clearLive,
  subLimits,
  isFreeWindow,
  canSubstitute,
  drainPerMinute,
  STAMINA_START,
  type LiveMatchState,
  type LivePhase,
} from "@/lib/liveMatch";
import { loadTactics, tacticsModifiers } from "@/lib/teamTactics";
import { SubstitutionPanel } from "@/components/match/SubstitutionPanel";
import { StaminaPanel } from "@/components/match/StaminaPanel";
import {
  btnPrimary,
  btnSecondary,
  btnGhost,
  infoChip,
  segmentBase,
  segmentItem,
} from "@/components/match/matchUi";
import { Pause, Play, FastForward, Users, ClipboardList } from "lucide-react";
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
  const [matchType, setMatchType] = useState<"LEAGUE" | "CUP" | "UCL">("LEAGUE");
  const [cupRound, setCupRound] = useState<string | undefined>(undefined);
  const [returningFromLineupEdit, setReturningFromLineupEdit] = useState(false);
  const [penaltyShootoutIndex, setPenaltyShootoutIndex] = useState(0);
  const [penaltyShootoutData, setPenaltyShootoutData] = useState<any[]>([]);
  const [highlightFeed, setHighlightFeed] = useState<HighlightEvent[]>([]);
  const allHighlightsRef = useRef<HighlightEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const minuteRef = useRef(0);

  // ---- live match control (pause / subs / stamina) ----
  const pausedRef = useRef(false);
  const scheduleRef = useRef<null | (() => void)>(null);
  const [pauseReason, setPauseReason] = useState<
    null | "manual" | "halftime" | "injury" | "et_break" | "et_halftime"
  >(null);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  const [subsUsed, setSubsUsed] = useState(0);
  const [windowsUsed, setWindowsUsed] = useState(0);
  const [subsMade, setSubsMade] = useState<any[]>([]);
  const [stamina, setStamina] = useState<Record<string, number>>({});
  const staminaRef = useRef<Record<string, number>>({});
  const [myXI, setMyXI] = useState<string[]>([]);
  const myXIRef = useRef<string[]>([]);
  const [myBench, setMyBench] = useState<string[]>([]);
  const myBenchRef = useRef<string[]>([]);
  const [goneIds, setGoneIds] = useState<string[]>([]);
  const goneRef = useRef<string[]>([]);
  const [showSubs, setShowSubs] = useState(false);
  const [forcedOutId, setForcedOutId] = useState<string | null>(null);
  const handledInjuriesRef = useRef<string[]>([]);
  const isExtraTimeRef = useRef(false);
  const halftimeDoneRef = useRef(false);
  const etHalftimeDoneRef = useRef(false);
  const [liveFormation, setLiveFormation] = useState<string | null>(null);
  const restoredRef = useRef(false);
  const myTeamIdRef = useRef<string>("");
  const subsUsedRef = useRef(0);
  const windowsUsedRef = useRef(0);
  const subsRef = useRef<any[]>([]);
  // Substitutions (mine and the rival's) shown inside the match chronicle.
  const [subFeed, setSubFeed] = useState<any[]>([]);
  // Rival (CPU) live lineup + planned substitutions.
  const oppCacheRef = useRef<{ key: string; formation: any } | null>(null);
  const oppXIRef = useRef<any[]>([]);
  const oppBenchRef = useRef<any[]>([]);
  const oppPlanRef = useRef<{ minute: number; outId: string; inId: string }[]>([]);
  const resumeLive = (location.state as any)?.resumeLive === true;

  // Extract temporary lineup from router state (if passed from lineup page)
  const routerState = location.state as any;
  const matchLineup = routerState?.matchLineup as string[] | undefined;
  const matchFormation = routerState?.matchFormation as string | undefined;
  const returningFromLineup = routerState?.returningFromLineupEdit === true;
  const fixtureId = routerState?.fixtureId as string | undefined;

  // Resume a paused match after editing the lineup / tactics: same minute, same
  // score, same feed, same substitutions and same energy levels.
  useEffect(() => {
    if (!resumeLive || restoredRef.current) return;
    const st = loadLive(fixtureId);
    if (!st) return;
    const s = loadSave();
    if (!s) return;
    let fx: any = s.fixtures[s.myLeague]?.find((f: any) => f.id === st.fixtureId);
    if (!fx) {
      for (const lg of Object.keys(s.cupFixtures || {})) {
        fx = (s.cupFixtures as any)[lg]?.find((f: any) => f.id === st.fixtureId);
        if (fx) break;
      }
    }
    if (!fx) fx = (s.uclFixtures || []).find((f: any) => f.id === st.fixtureId);
    if (!fx) return;
    restoredRef.current = true;

    fixtureRef.current = { ...fx, result: st.result };
    setSave(s);
    myTeamIdRef.current = s.myTeamId;
    allEventsRef.current = st.result?.events ?? [];
    allCardsRef.current = st.result?.cards ?? [];
    allHighlightsRef.current = st.result?.highlights ?? [];

    const m = st.minute;
    setFeed(
      allEventsRef.current
        .filter((e: any) => e.minute <= m)
        .slice()
        .reverse(),
    );
    setCardFeed(
      allCardsRef.current
        .filter((c: any) => c.minute <= m)
        .slice()
        .reverse(),
    );
    setHighlightFeed(
      allHighlightsRef.current
        .filter((h: any) => h.minute <= m)
        .slice()
        .reverse(),
    );
    setHomeScore(st.homeScore);
    setAwayScore(st.awayScore);
    setMinute(m);
    minuteRef.current = m;

    myXIRef.current = st.lineup;
    setMyXI(st.lineup);
    myBenchRef.current = st.bench;
    setMyBench(st.bench);
    staminaRef.current = st.stamina || {};
    setStamina(st.stamina || {});
    goneRef.current = st.gone || [];
    setGoneIds(st.gone || []);
    subsUsedRef.current = st.subsUsed;
    setSubsUsed(st.subsUsed);
    windowsUsedRef.current = st.windowsUsed;
    setWindowsUsed(st.windowsUsed);
    subsRef.current = st.subs || [];
    setSubsMade(st.subs || []);
    {
      const mySide = fx.homeId === s.myTeamId ? "home" : "away";
      setSubFeed(
        (st.subs || [])
          .map((sb: any) => ({
            minute: sb.minute,
            team: mySide,
            inName: sb.inName,
            outName: sb.outName,
            playerInId: sb.inId,
            playerOutId: sb.outId,
          }))
          .reverse(),
      );
    }

    handledInjuriesRef.current = st.handledInjuries || [];
    halftimeDoneRef.current = m >= 45;
    isExtraTimeRef.current = st.isExtraTime;
    setMatchType(st.matchType);
    setCupRound(st.cupRound);
    setLiveFormation(st.formation);
    setIsCupMatch(st.matchType === "CUP");

    setPhase("playing");
    pausedRef.current = false;
    setIsPaused(false);
    setPauseReason(null);
    runClock(m);
  }, [resumeLive, fixtureId]);

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
        toast.error(
          `${inj.playerName} se ha lesionado (${inj.reason}) — ${inj.weeks} partido${inj.weeks > 1 ? "s" : ""} de baja`,
        );
      }
    }

    for (const card of result.cards || []) {
      if (card.cardType === "red" && card.team === myTeam) {
        const susp = save.suspensions[myTeamId]?.find((s) => s.playerId === card.playerId);
        const matchdays = susp?.matchdaysRemaining ?? 1;
        toast.error(
          `${card.playerName} expulsado — suspensión de ${matchdays} partido${matchdays > 1 ? "s" : ""}`,
        );
      }
    }
  }, [phase]);

  // Extract match type from router state (if passed from season page)
  useEffect(() => {
    if (routerState?.matchType) {
      setMatchType(routerState.matchType);
      setCupRound(routerState.cupRound);
      setIsCupMatch(routerState.matchType === "CUP");
    }
  }, [routerState]);

  // FAILSAFE: If matchType is not in router state, determine it from the fixture
  useEffect(() => {
    const fixture = fixtureRef.current;
    if (!matchType && fixture) {
      const determinedMatchType =
        fixture.competition === "league" ? "LEAGUE" : fixture.competition === "cup" ? "CUP" : "UCL";
      setMatchType(determinedMatchType);
      setCupRound(fixture.competition === "cup" ? fixture.round : undefined);
      setIsCupMatch(determinedMatchType === "CUP");
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
      if (matchType === "CUP") {
        // CUP: Simulate ALL Cup fixtures for the matchday across ALL VIP countries
        // Uses the same layered simulation format as league matches
        console.log("Post-match: Simulating CUP matches for matchday:", fixture.matchday);
        next = await simulateCupMatchdayLayered(save, fixture.matchday, (done, total) => {
          console.log(`Cup matches: ${done}/${total}`);
        });
      } else if (matchType === "UCL") {
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
    minuteRef.current = 90;
    isExtraTimeRef.current = true;
    pausedRef.current = false;
    setIsPaused(false);
    setPauseReason(null);
    setPhase("extra_time");

    // Start the clock for extra time (90-120)
    runExtraTimeClock();
  }

  function runExtraTimeClock() {
    let m = 90;
    const scheduleEt = (delay?: number) => {
      clockTimeoutRef.current = window.setTimeout(
        tick,
        delay ?? Math.max(40, Math.round(EXTRA_TIME_TICK_MS / speedRef.current)),
      );
    };
    const tick = () => {
      if (pausedRef.current) return;
      m += 1;
      setMinute(m);
      minuteRef.current = m;

      // Check for events at this minute
      const eventsAtMinute = extraTimeEventsRef.current.filter((e) => e.minute === m);
      if (eventsAtMinute.length > 0) {
        setFeed((prev) => [...prev, ...eventsAtMinute]);

        // Update scores using refs for immediate access
        eventsAtMinute.forEach((ev) => {
          if (ev.type === "goal") {
            console.log(`Goal at minute ${m}: ${ev.team} team scores`);
            if (ev.team === "home") {
              extraTimeHomeScoreRef.current += 1;
              setExtraTimeHomeScore(extraTimeHomeScoreRef.current);
              console.log(
                `Extra time home score: ${extraTimeHomeScoreRef.current - 1} -> ${extraTimeHomeScoreRef.current}`,
              );
            } else {
              extraTimeAwayScoreRef.current += 1;
              setExtraTimeAwayScore(extraTimeAwayScoreRef.current);
              console.log(
                `Extra time away score: ${extraTimeAwayScoreRef.current - 1} -> ${extraTimeAwayScoreRef.current}`,
              );
            }
          }
        });
      }

      if (m < 120) {
        if (m === 105 && !etHalftimeDoneRef.current) {
          etHalftimeDoneRef.current = true;
          pausedRef.current = true;
          setIsPaused(true);
          setPauseReason("et_halftime");
          if (clockTimeoutRef.current !== null) {
            window.clearTimeout(clockTimeoutRef.current);
            clockTimeoutRef.current = null;
          }
          return;
        }
        scheduleEt();
      } else {
        // Extra time finished - clear timeout
        if (clockTimeoutRef.current !== null) {
          window.clearTimeout(clockTimeoutRef.current);
          clockTimeoutRef.current = null;
        }
        console.log(`Clock reached 120, calling handleExtraTimeFinished`);
        console.log(
          `Current state: homeScore=${homeScore}, awayScore=${awayScore}, extraTimeHomeScore=${extraTimeHomeScore}, extraTimeAwayScore=${extraTimeAwayScore}`,
        );
        handleExtraTimeFinished();
      }
    };

    scheduleRef.current = () => scheduleEt();
    scheduleEt();
  }

  function handleExtraTimeFinished() {
    const totalHomeScore = homeScore + extraTimeHomeScoreRef.current;
    const totalAwayScore = awayScore + extraTimeAwayScoreRef.current;

    console.log(
      `Extra time finished: Home: ${homeScore} + ${extraTimeHomeScoreRef.current} = ${totalHomeScore}, Away: ${awayScore} + ${extraTimeAwayScoreRef.current} = ${totalAwayScore}`,
    );
    console.log(
      `Comparison: ${totalHomeScore} === ${totalAwayScore} = ${totalHomeScore === totalAwayScore}`,
    );
    console.log(
      `Type check: typeof totalHomeScore = ${typeof totalHomeScore}, typeof totalAwayScore = ${typeof totalAwayScore}`,
    );

    // Check if aggregate is tied for UCL two-legged ties
    let aggregateTied = totalHomeScore === totalAwayScore;
    const isLeg2 = fixtureRef.current?.round?.endsWith("-Leg2");
    if (isLeg2 && save?.uclFixtures) {
      const leg1 = save.uclFixtures.find(
        (l) =>
          l.round === fixtureRef.current!.round!.replace("Leg2", "Leg1") &&
          ((l.homeId === fixtureRef.current!.awayId && l.awayId === fixtureRef.current!.homeId) ||
            (l.homeId === fixtureRef.current!.homeId && l.awayId === fixtureRef.current!.awayId)),
      );
      if (leg1?.result) {
        const aggHome = totalHomeScore + leg1.result.awayGoals;
        const aggAway = totalAwayScore + leg1.result.homeGoals;
        aggregateTied = aggHome === aggAway;
        console.log(
          `Aggregate check: leg1 ${leg1.result.homeGoals}-${leg1.result.awayGoals}, leg2 ${totalHomeScore}-${totalAwayScore}, agg ${aggHome}-${aggAway}, tied: ${aggregateTied}`,
        );
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
        const finalHomeScore = shootout.filter((s) => s.team === "home" && s.scored).length;
        const finalAwayScore = shootout.filter((s) => s.team === "away" && s.scored).length;
        handlePenaltyShootoutFinished(finalHomeScore, finalAwayScore);
        return;
      }

      const shot = shootout[idx];

      // Get player name from the appropriate XI
      const playerXI = shot.team === "home" ? homeXI : awayXI;
      const player = playerXI.find((p) => p.id === shot.playerId);
      const playerName = player ? player.name : "Unknown";

      // Add penalty event to feed with scored/missed information
      const penaltyEvent: MatchEvent = {
        minute: 120 + idx,
        team: shot.team === "home" ? "home" : "away",
        type: "penalty" as any,
        scorerId: shot.playerId,
        scorerName: playerName,
        assistName: shot.scored ? "✅ Anotado" : "❌ Fallado",
      };
      setFeed((prev) => [...prev, penaltyEvent]);

      // Update penalty scores
      if (shot.team === "home") {
        if (shot.scored) setPenaltyHomeScore((s) => s + 1);
      } else {
        if (shot.scored) setPenaltyAwayScore((s) => s + 1);
      }

      setPenaltyShootoutIndex(idx + 1);

      // Check if shootout should end early (traditional format)
      const homeGoals = penaltyShootoutData
        .slice(0, idx + 1)
        .filter((s) => s.team === "home" && s.scored).length;
      const awayGoals = penaltyShootoutData
        .slice(0, idx + 1)
        .filter((s) => s.team === "away" && s.scored).length;
      const roundsPlayed = Math.ceil((idx + 1) / 2);

      // Check if winner is determined after 5 rounds or in sudden death
      if (roundsPlayed >= 5) {
        const remainingShots = shootout.length - (idx + 1);
        const maxPossibleHome = homeGoals + Math.ceil(remainingShots / 2);
        const maxPossibleAway = awayGoals + Math.floor(remainingShots / 2);

        if (homeGoals > maxPossibleAway || awayGoals > maxPossibleHome) {
          // Winner determined, calculate final scores and stop shootout
          const finalHomeScore = shootout.filter((s) => s.team === "home" && s.scored).length;
          const finalAwayScore = shootout.filter((s) => s.team === "away" && s.scored).length;
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
    const finalHomePenaltyScore =
      homePenaltyScore !== undefined ? homePenaltyScore : penaltyHomeScore;
    const finalAwayPenaltyScore =
      awayPenaltyScore !== undefined ? awayPenaltyScore : penaltyAwayScore;

    console.log(
      `handlePenaltyShootoutFinished: finalHomePenaltyScore=${finalHomePenaltyScore}, finalAwayPenaltyScore=${finalAwayPenaltyScore}`,
    );

    // Save result with penalties
    updateFixtureInStore(
      fixture.id,
      homeScore + extraTimeHomeScoreRef.current,
      awayScore + extraTimeAwayScoreRef.current,
      true,
      { homeGoals: extraTimeHomeScoreRef.current, awayGoals: extraTimeAwayScoreRef.current },
      { homeGoals: finalHomePenaltyScore, awayGoals: finalAwayPenaltyScore },
      matchType === "UCL",
    );

    // Reload the fixture from save to get updated result
    const s = loadSave();
    if (s) {
      let found = null;
      // Check UCL fixtures first if it's a UCL match
      if (matchType === "UCL" && s.uclFixtures) {
        found = s.uclFixtures.find((f) => f.id === fixture.id);
        if (found) {
          fixtureRef.current = found;
          console.log("Reloaded UCL fixture with result after penalties:", found.result);
        }
      }
      // If not found in UCL, check cup fixtures
      if (!found) {
        for (const [league, fixtures] of Object.entries(s.cupFixtures)) {
          found = fixtures.find((f) => f.id === fixture.id);
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

    console.log(
      `handleMatchEndWithExtraTime called: homeScore=${homeScore}, extraTimeHomeScoreRef=${extraTimeHomeScoreRef.current}, awayScore=${awayScore}, extraTimeAwayScoreRef=${extraTimeAwayScoreRef.current}`,
    );

    // Save result with extra time
    updateFixtureInStore(
      fixture.id,
      homeScore + extraTimeHomeScoreRef.current,
      awayScore + extraTimeAwayScoreRef.current,
      true,
      { homeGoals: extraTimeHomeScoreRef.current, awayGoals: extraTimeAwayScoreRef.current },
      undefined,
      matchType === "UCL",
    );

    // Reload the fixture from save to get updated result
    const s = loadSave();
    if (s) {
      let found = null;
      // Check UCL fixtures first if it's a UCL match
      if (matchType === "UCL" && s.uclFixtures) {
        found = s.uclFixtures.find((f) => f.id === fixture.id);
        if (found) {
          fixtureRef.current = found;
          console.log("Reloaded UCL fixture with result:", found.result);
        }
      }
      // If not found in UCL, check cup fixtures
      if (!found) {
        for (const [league, fixtures] of Object.entries(s.cupFixtures)) {
          found = fixtures.find((f) => f.id === fixture.id);
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
        const userFixture = Object.values(saveToUse.cupFixtures)
          .flat()
          .find((f) => f.homeId === saveToUse.myTeamId || f.awayId === saveToUse.myTeamId);
        console.log(
          "simulateRemainingCupMatches: user fixture in saveToUse:",
          userFixture ? JSON.stringify(userFixture.result, null, 2) : "not found",
        );
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

  /**
   * Builds the formation, lineups, player ratings and MVP for a match the
   * user just played live (Cup / UCL), so the post-match screen shows the
   * same information as an AI-simulated match instead of leaving those
   * fields empty.
   */
  function buildLiveMatchExtras(s: SaveGame, homeId: string, awayId: string) {
    const homeData = getStartersWithFormation(s, homeId);
    const awayData = getStartersWithFormation(s, awayId);

    const events = allEventsRef.current || [];
    const cards = allCardsRef.current || [];

    const goals = events
      .filter(
        (e) =>
          e.type === "goal" ||
          e.type === "penalty_goal" ||
          e.type === "free_kick_goal" ||
          e.type === "own_goal",
      )
      .map((e) => ({
        team: e.team,
        scorerId: e.scorerId,
        assistId: e.assistId,
        ownGoal: e.type === "own_goal",
      }));

    const ratingCards = cards.map((c) => ({
      team: c.team,
      playerId: c.playerId,
      cardType: c.cardType,
      minute: c.minute,
    }));

    const minutesPlayed: Record<string, number> = {};
    for (const p of [...homeData.players, ...awayData.players]) {
      minutesPlayed[p.id] = 90;
    }

    const homeGoalsCount =
      goals.filter((g) => g.team === "home" && !g.ownGoal).length +
      goals.filter((g) => g.team === "away" && g.ownGoal).length;
    const awayGoalsCount =
      goals.filter((g) => g.team === "away" && !g.ownGoal).length +
      goals.filter((g) => g.team === "home" && g.ownGoal).length;

    const { ratings, mvp } = computePlayerRatings({
      homeXI: homeData.players,
      awayXI: awayData.players,
      homeGoals: homeGoalsCount,
      awayGoals: awayGoalsCount,
      goals,
      cards: ratingCards,
      minutesPlayed,
      homeSaves: 0,
      awaySaves: 0,
    });

    return {
      homeFormation: homeData.formation,
      awayFormation: awayData.formation,
      homeLineup: homeData.players,
      awayLineup: awayData.players,
      ratings,
      mvp,
    };
  }

  function updateFixtureInStore(
    fixtureId: string,
    homeScore: number,
    awayScore: number,
    isCup: boolean = false,
    extraTimeData?: { homeGoals: number; awayGoals: number },
    penaltyData?: { homeGoals: number; awayGoals: number },
    isUCL: boolean = false,
  ) {
    console.log(
      `updateFixtureInStore called: fixtureId=${fixtureId}, homeScore=${homeScore}, awayScore=${awayScore}, isCup=${isCup}, isUCL=${isUCL}, extraTimeData=${JSON.stringify(extraTimeData)}, penaltyData=${JSON.stringify(penaltyData)}`,
    );

    if (isUCL) {
      const s = loadSave();
      if (s && s.uclFixtures) {
        const fx = s.uclFixtures.find((f) => f.id === fixtureId);
        // For UCL matches, homeGoals and awayGoals should be regular time only
        // extraTime.homeGoals and extraTime.awayGoals are the additional goals in extra time
        const result: any = {
          homeGoals: homeScore - (extraTimeData?.homeGoals || 0),
          awayGoals: awayScore - (extraTimeData?.awayGoals || 0),
          events: allEventsRef.current,
          cards: allCardsRef.current,
          injuries: [],
          xgHome: 0,
          xgAway: 0,
        };

        if (fx) {
          try {
            const extras = buildLiveMatchExtras(s, fx.homeId, fx.awayId);
            Object.assign(result, extras);
          } catch (err) {
            console.error("Error building live match extras (UCL):", err);
          }
        }

        if (extraTimeData) {
          result.extraTime = {
            homeGoals: extraTimeData.homeGoals,
            awayGoals: extraTimeData.awayGoals,
            events: extraTimeEventsRef.current,
          };
          console.log("Adding extraTime to result:", result.extraTime);
        }

        if (penaltyData) {
          result.penalties = {
            homeGoals: penaltyData.homeGoals,
            awayGoals: penaltyData.awayGoals,
            shootout: penaltyShootoutData,
          };
          console.log("Adding penalties to result:", result.penalties);
        }

        console.log("Final result to save:", result);

        const updated = s.uclFixtures.map((f) => (f.id === fixtureId ? { ...f, result } : f));
        const newSave = { ...s, uclFixtures: updated };
        saveSave(newSave);
        console.log("UCL result saved successfully");
      }
    } else if (isCup) {
      const s = loadSave();
      if (s) {
        // Find the cup fixture across all leagues first, so we know home/away teams.
        let cupFx: Fixture | undefined;
        for (const fxs of Object.values(s.cupFixtures)) {
          cupFx = fxs.find((f) => f.id === fixtureId);
          if (cupFx) break;
        }

        // For cup matches, homeGoals and awayGoals should be regular time only
        // extraTime.homeGoals and extraTime.awayGoals are the additional goals in extra time
        const result: any = {
          homeGoals: homeScore - (extraTimeData?.homeGoals || 0),
          awayGoals: awayScore - (extraTimeData?.awayGoals || 0),
          events: allEventsRef.current,
          cards: allCardsRef.current,
          injuries: [],
          xgHome: 0,
          xgAway: 0,
        };

        if (cupFx) {
          try {
            const extras = buildLiveMatchExtras(s, cupFx.homeId, cupFx.awayId);
            Object.assign(result, extras);
          } catch (err) {
            console.error("Error building live match extras (Cup):", err);
          }
        }

        if (extraTimeData) {
          result.extraTime = {
            homeGoals: extraTimeData.homeGoals,
            awayGoals: extraTimeData.awayGoals,
            events: extraTimeEventsRef.current,
          };
          console.log("Adding extraTime to result:", result.extraTime);
        }

        if (penaltyData) {
          result.penalties = {
            homeGoals: penaltyData.homeGoals,
            awayGoals: penaltyData.awayGoals,
            shootout: penaltyShootoutData,
          };
          console.log("Adding penalties to result:", result.penalties);
        }

        console.log("Final result to save:", result);

        // Find the fixture to determine which league it belongs to
        let fixtureLeague = s.myLeague;
        for (const [league, fixtures] of Object.entries(s.cupFixtures)) {
          const found = fixtures.find((f) => f.id === fixtureId);
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

        const updated = leagueFixtures.map((f) => (f.id === fixtureId ? { ...f, result } : f));
        const newSave = { ...s, cupFixtures: { ...s.cupFixtures, [fixtureLeague]: updated } };
        saveSave(newSave);
        console.log("Result saved successfully");
      }
    } else {
      const updated = fixtures.map((f) =>
        f.id === fixtureId ? { ...f, isPlayed: true, homeScore, awayScore } : f,
      );
      usePlayersStore.setState({ fixtures: updated });
    }
  }

  useEffect(() => {
    const s = loadSave();
    if (!s) {
      navigate({ to: "/" });
      return;
    }
    if (resumeLive) return; // handled by the live-resume effect

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
        (f) =>
          f.homeId === pendingUserMatch.homeTeam &&
          f.awayId === pendingUserMatch.awayTeam &&
          !f.result,
      );
      fixtureRef.current = cupFixture || null;
    } else if (returningFromLineup && fixtureId) {
      // Returning from lineup edit - load the specific fixture by ID
      // First try league fixtures
      let foundFixture = s.fixtures[s.myLeague].find((f) => f.id === fixtureId);
      if (!foundFixture) {
        // Try cup fixtures
        for (const lg of Object.keys(s.cupFixtures) as LeagueId[]) {
          foundFixture = s.cupFixtures[lg].find((f) => f.id === fixtureId);
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
        allHighlightsRef.current = foundFixture.result.highlights || [];
        setSubFeed(
          (foundFixture.result.substitutions || [])
            .map((sb: any) => ({
              minute: sb.minute,
              team: sb.team,
              inName: sb.playerInName,
              outName: sb.playerOutName,
              playerInId: sb.playerInId,
              playerOutId: sb.playerOutId,
            }))
            .reverse(),
        );
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

  async function startMatch(shouldSkipToEnd = false) {
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
    allHighlightsRef.current = fixture.result.highlights || [];
    setSubFeed(
      (fixture.result.substitutions || [])
        .map((sb: any) => ({
          minute: sb.minute,
          team: sb.team,
          inName: sb.playerInName,
          outName: sb.playerOutName,
          playerInId: sb.playerInId,
          playerOutId: sb.playerOutId,
        }))
        .reverse(),
    );
    fixtureRef.current = fixture;

    // For cup matches that end in a draw, don't save the result yet
    // Allow user to edit lineup and go to extra time
    const isCupDraw = isCupMatch && fixture.result.homeGoals === fixture.result.awayGoals;

    if (!isCupDraw) {
      // If we used a temporary lineup, restore the original base lineup before saving
      // This ensures only stats/results are saved, not the temporary lineup changes
      if (usedTemporaryLineup && originalLineup && originalFormation) {
        const saveWithOriginalLineup = setLineup(newSave, newSave.myTeamId, originalLineup);
        const saveWithOriginalFormation = setFormation(
          saveWithOriginalLineup,
          newSave.myTeamId,
          originalFormation,
        );
        setSave(saveWithOriginalFormation);
        saveSave(saveWithOriginalFormation);
      } else {
        setSave(newSave);
        saveSave(newSave);
      }

      if (fixture.result) {
        updateFixtureInStore(
          fixture.id,
          fixture.result.homeGoals,
          fixture.result.awayGoals,
          isCupMatch,
        );
      }

      // Clear pending match after simulation
      if (isCupMatch) {
        usePlayersStore.setState({ pendingUserMatch: null });

        // Simulate remaining cup matches for the matchday
        try {
          console.log(
            "Post-match: Simulating remaining CUP matches for matchday:",
            fixture.matchday,
          );
          const updatedSave = await simulateCupMatchdayLayered(
            newSave,
            fixture.matchday,
            (done, total) => {
              console.log(`Cup matches: ${done}/${total}`);
            },
          );
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

    initLiveMatch();
    setPhase("playing");
    runClock();
    if (shouldSkipToEnd) {
      skipToEnd(false);
    }
  }

  // ------------------------------------------------------------------ live

  function tickMs() {
    return Math.max(40, Math.round(MATCH_TICK_MS / speedRef.current));
  }

  function mySquad() {
    const id = myTeamIdRef.current || save?.myTeamId;
    return id ? getSimSquad(id) : [];
  }

  function playerById(id: string) {
    return mySquad().find((p) => p.id === id);
  }

  function initLiveMatch() {
    const s = loadSave();
    if (!s) return;
    myTeamIdRef.current = s.myTeamId;
    const squad = getSimSquad(s.myTeamId);
    const ids = (matchLineup || s.lineups[s.myTeamId] || []).filter(Boolean);
    const benchIds = squad
      .filter((p) => !ids.includes(p.id))
      .slice(0, 12)
      .map((p) => p.id);
    const st: Record<string, number> = {};
    squad.forEach((p) => {
      st[p.id] = STAMINA_START;
    });
    myXIRef.current = ids;
    setMyXI(ids);
    myBenchRef.current = benchIds;
    setMyBench(benchIds);
    staminaRef.current = st;
    setStamina(st);
    goneRef.current = [];
    setGoneIds([]);
    subsUsedRef.current = 0;
    setSubsUsed(0);
    windowsUsedRef.current = 0;
    setWindowsUsed(0);
    subsRef.current = [];
    setSubsMade([]);
    handledInjuriesRef.current = [];
    halftimeDoneRef.current = false;
    etHalftimeDoneRef.current = false;
    pausedRef.current = false;
    setIsPaused(false);
    setPauseReason(null);
    setLiveFormation(matchFormation || s.formations[s.myTeamId] || null);
  }

  function currentLivePhase(): LivePhase {
    if (pauseReason === "halftime") return "halftime";
    if (pauseReason === "et_break") return "et_break";
    if (pauseReason === "et_halftime") return "et_halftime";
    return isExtraTimeRef.current ? "et_playing" : "playing";
  }

  function persistLive() {
    const fx = fixtureRef.current;
    if (!fx?.result) return;
    saveLive({
      v: 3,
      fixtureId: fx.id,
      minute: minuteRef.current,
      phase: currentLivePhase(),
      homeScore,
      awayScore,
      result: fx.result,
      feed: [],
      cardFeed: [],
      highlightFeed: [],
      lineup: myXIRef.current,
      bench: myBenchRef.current,
      formation: liveFormation || "Táctica 4-4-2",
      gone: goneRef.current,
      subsUsed: subsUsedRef.current,
      windowsUsed: windowsUsedRef.current,
      subs: subsRef.current,
      stamina: staminaRef.current,
      isExtraTime: isExtraTimeRef.current,
      matchType,
      cupRound,
      handledInjuries: handledInjuriesRef.current,
    });
  }

  function pauseMatch(reason: "manual" | "halftime" | "injury" | "et_break" | "et_halftime") {
    pausedRef.current = true;
    setIsPaused(true);
    setPauseReason(reason);
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }
    persistLive();
  }

  function resumeMatch() {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setIsPaused(false);
    setPauseReason(null);
    setShowSubs(false);
    setForcedOutId(null);
    if (scheduleRef.current) scheduleRef.current();
    else runClock(minuteRef.current);
  }

  /** Drain energy of the players currently on the pitch. */
  function drainStamina() {
    const tactics = myTeamIdRef.current ? loadTactics(myTeamIdRef.current) : null;
    const pressure = (tactics?.pressure ?? "medium") as "low" | "medium" | "high";
    // Play style / defensive line also decide how hard the team runs.
    const staminaMult = tacticsModifiers(tactics).stamina;
    const next = { ...staminaRef.current };
    for (const id of myXIRef.current) {
      const p = playerById(id);
      if (!p) continue;
      next[id] = Math.max(
        0,
        (next[id] ?? STAMINA_START) - drainPerMinute(p.position, pressure, staminaMult),
      );
    }
    staminaRef.current = next;
    setStamina(next);
  }

  /** Injury of one of my players at this exact minute → forced substitution. */
  function checkInjuriesAt(m: number) {
    const fx = fixtureRef.current;
    if (!fx?.result) return false;
    const mySide = fx.homeId === (myTeamIdRef.current || save?.myTeamId) ? "home" : "away";
    const inj = (fx.result.injuries ?? []).find(
      (i: any) =>
        i.team === mySide &&
        (i.minute ?? 60) === m &&
        !handledInjuriesRef.current.includes(i.playerId),
    );
    if (!inj) return false;
    handledInjuriesRef.current = [...handledInjuriesRef.current, inj.playerId];
    if (!myXIRef.current.includes(inj.playerId)) return false;

    const check = canSubstitute(
      {
        subsUsed: subsUsedRef.current,
        windowsUsed: windowsUsedRef.current,
        isExtraTime: isExtraTimeRef.current,
        phase: "playing",
      },
      1,
    );
    const benchAvailable = myBenchRef.current.length > 0;
    if (!check.ok || !benchAvailable) {
      playWithOneLess(inj.playerId, inj.playerName);
      toast.error(
        `${inj.playerName} se lesiona en el ${m}' y no quedan cambios: juegas con uno menos.`,
      );
      return false;
    }
    pauseMatch("injury");
    setForcedOutId(inj.playerId);
    setShowSubs(true);
    toast.warning(`${inj.playerName} se lesiona en el ${m}'. Cambio obligatorio.`);
    return true;
  }

  function playWithOneLess(playerId: string, playerName?: string) {
    myXIRef.current = myXIRef.current.filter((id) => id !== playerId);
    setMyXI(myXIRef.current);
    goneRef.current = [...goneRef.current, playerId];
    setGoneIds(goneRef.current);
    setForcedOutId(null);
    setShowSubs(false);
    persistLive();
    if (playerName)
      toast.info(`${playerName} abandona el campo. Te quedas con ${myXIRef.current.length}.`);
  }

  function applySubstitutions(pairs: { outId: string; inId: string }[]) {
    if (pairs.length === 0) return;
    const free = isFreeWindow(currentLivePhase());
    const check = canSubstitute(
      {
        subsUsed: subsUsedRef.current,
        windowsUsed: windowsUsedRef.current,
        isExtraTime: isExtraTimeRef.current,
        phase: currentLivePhase(),
      },
      pairs.length,
    );
    if (!check.ok) {
      toast.error(check.reason!);
      return;
    }

    const xi = [...myXIRef.current];
    let bench = [...myBenchRef.current];
    const madeNow: any[] = [];
    for (const { outId, inId } of pairs) {
      const idx = xi.indexOf(outId);
      if (idx === -1) continue;
      xi[idx] = inId;
      bench = bench.filter((id) => id !== inId);
      staminaRef.current = { ...staminaRef.current, [inId]: STAMINA_START };
      madeNow.push({
        minute: minuteRef.current,
        outId,
        outName: playerById(outId)?.name ?? outId,
        inId,
        inName: playerById(inId)?.name ?? inId,
      });
    }
    myXIRef.current = xi;
    setMyXI(xi);
    myBenchRef.current = bench;
    setMyBench(bench);
    setStamina(staminaRef.current);
    subsUsedRef.current += madeNow.length;
    setSubsUsed(subsUsedRef.current);
    if (!free) {
      windowsUsedRef.current += 1;
      setWindowsUsed(windowsUsedRef.current);
    }
    subsRef.current = [...subsRef.current, ...madeNow];
    setSubsMade(subsRef.current);
    const mySide =
      fixtureRef.current?.homeId === (myTeamIdRef.current || save?.myTeamId) ? "home" : "away";
    setSubFeed((prev) => [
      ...madeNow
        .map((s) => ({
          minute: s.minute,
          team: mySide,
          inName: s.inName,
          outName: s.outName,
          playerInId: s.inId,
          playerOutId: s.outId,
        }))
        .reverse(),
      ...prev,
    ]);
    setShowSubs(false);
    setForcedOutId(null);
    persistLive();
    toast.success(
      madeNow.length === 1
        ? `${madeNow[0].minute}' Cambio: entra ${madeNow[0].inName} por ${madeNow[0].outName}`
        : `${madeNow.length} cambios realizados`,
    );
  }

  // ------------------------------------------------- rival (CPU) substitutions

  /** Plan 2-3 substitutions for the CPU side, spread across the second half. */
  function planOpponentSubs() {
    const xi = oppXIRef.current;
    const bench = oppBenchRef.current;
    if (xi.length === 0 || bench.length === 0) {
      oppPlanRef.current = [];
      return;
    }
    const count = Math.min(2 + Math.floor(Math.random() * 2), bench.length, xi.length - 1);
    const outPool = xi.filter((p: any) => p.position !== "GK" && p.position !== "POR");
    const plan: { minute: number; outId: string; inId: string }[] = [];
    const usedOut = new Set<string>();
    const usedIn = new Set<string>();
    const baseMinutes = [58, 68, 79];
    for (let i = 0; i < count; i++) {
      const out = outPool.find((p: any) => !usedOut.has(p.id));
      const inn = bench.find((p: any) => !usedIn.has(p.id));
      if (!out || !inn) break;
      usedOut.add(out.id);
      usedIn.add(inn.id);
      plan.push({
        minute: baseMinutes[i] + Math.floor(Math.random() * 5),
        outId: out.id,
        inId: inn.id,
      });
    }
    oppPlanRef.current = plan;
  }

  function applyOpponentSubsAt(m: number) {
    const due = oppPlanRef.current.filter((s) => s.minute === m);
    if (due.length === 0) return;
    const fx = fixtureRef.current;
    if (!fx) return;
    const myId = myTeamIdRef.current || save?.myTeamId;
    const oppSide = fx.homeId === myId ? "away" : "home";
    const xi = [...oppXIRef.current];
    const made: any[] = [];
    for (const s of due) {
      const idx = xi.findIndex((p: any) => p.id === s.outId);
      const inn = oppBenchRef.current.find((p: any) => p.id === s.inId);
      if (idx === -1 || !inn) continue;
      const out = xi[idx];
      xi[idx] = inn;
      oppBenchRef.current = oppBenchRef.current.filter((p: any) => p.id !== inn.id);
      made.push({
        minute: m,
        team: oppSide,
        inName: inn.name,
        outName: out.name,
        playerInId: inn.id,
        playerOutId: out.id,
      });
    }
    if (made.length === 0) return;
    oppXIRef.current = xi;
    setSubFeed((prev) => [...made.reverse(), ...prev]);
  }

  function goEditLineupLive() {
    if (!pausedRef.current) pauseMatch("manual");
    else persistLive();
    navigate({
      to: "/lineup",
      state: {
        fromMatch: true,
        liveMatch: true,
        matchType,
        cupRound,
        fixtureId: fixtureRef.current?.id,
      } as any,
    });
  }

  function runClock(startMinute = 0) {
    let m = startMinute;
    const schedule = (delay?: number) => {
      clockTimeoutRef.current = window.setTimeout(tick, delay ?? tickMs());
    };
    scheduleRef.current = () => schedule();
    const tick = () => {
      if (pausedRef.current) return;
      m += 1;
      setMinute(m);
      minuteRef.current = m;
      const events = allEventsRef.current.filter((e) => e.minute === m);
      const cards = allCardsRef.current.filter((c) => c.minute === m);
      const hls = allHighlightsRef.current.filter((h) => h.minute === m);
      if (hls.length > 0) setHighlightFeed((prev) => [...hls, ...prev]);
      if (events.length > 0) {
        setFeed((prev) => [...events, ...prev]);
        for (const ev of events) {
          if (ev.team === "home") setHomeScore((s) => s + 1);
          else setAwayScore((s) => s + 1);
        }
      }
      if (cards.length > 0) {
        setCardFeed((prev) => [...cards, ...prev]);
        // A red card of my team leaves us one man down for the rest of the match.
        const mySide =
          fixtureRef.current?.homeId === (myTeamIdRef.current || save?.myTeamId) ? "home" : "away";
        for (const c of cards) {
          if (
            c.team === mySide &&
            (c.cardType === "red" || c.isSecondYellow) &&
            myXIRef.current.includes(c.playerId)
          ) {
            playWithOneLess(c.playerId, c.playerName);
          }
        }
      }
      drainStamina();
      applyOpponentSubsAt(m);

      if (m >= 90) {
        setPhase("done");
        clearMatchSnapshot();
        clearLive();
        return;
      }
      if (checkInjuriesAt(m)) return;
      if (m === 45 && !halftimeDoneRef.current) {
        halftimeDoneRef.current = true;
        pauseMatch("halftime");
        return;
      }
      persistLive();
      schedule();
    };
    schedule(startMinute === 0 ? MATCH_START_DELAY_MS : tickMs());
  }

  /**
   * Automatic substitution for MY team while the match is being fast-forwarded.
   * The manager can't intervene, so the assistant takes the most tired outfield
   * players off, mirroring what the CPU does for the rival.
   */
  function autoSubMyTeamAt(m: number): any[] {
    const check = canSubstitute(
      {
        subsUsed: subsUsedRef.current,
        windowsUsed: windowsUsedRef.current,
        isExtraTime: isExtraTimeRef.current,
        phase: "playing",
      },
      1,
    );
    if (!check.ok) return [];
    if (myBenchRef.current.length === 0) return [];

    // Take off the most tired outfield player if he is genuinely gassed.
    const candidates = myXIRef.current
      .map((id) => ({ id, p: playerById(id), st: staminaRef.current[id] ?? STAMINA_START }))
      .filter((c) => c.p && c.p.position !== "GK" && c.p.position !== "POR")
      .sort((a, b) => a.st - b.st);
    const worst = candidates[0];
    if (!worst || worst.st > 62) return [];

    const inId =
      myBenchRef.current.find((id) => {
        const bp = playerById(id);
        return bp && bp.position !== "GK" && bp.position !== "POR";
      }) ?? myBenchRef.current[0];
    if (!inId) return [];

    const xi = [...myXIRef.current];
    xi[xi.indexOf(worst.id)] = inId;
    myXIRef.current = xi;
    setMyXI(xi);
    myBenchRef.current = myBenchRef.current.filter((id) => id !== inId);
    setMyBench(myBenchRef.current);
    staminaRef.current = { ...staminaRef.current, [inId]: STAMINA_START };
    setStamina(staminaRef.current);
    subsUsedRef.current += 1;
    setSubsUsed(subsUsedRef.current);
    windowsUsedRef.current += 1;
    setWindowsUsed(windowsUsedRef.current);

    const entry = {
      minute: m,
      outId: worst.id,
      outName: playerById(worst.id)?.name ?? worst.id,
      inId,
      inName: playerById(inId)?.name ?? inId,
    };
    subsRef.current = [...subsRef.current, entry];
    setSubsMade(subsRef.current);
    const mySide =
      fixtureRef.current?.homeId === (myTeamIdRef.current || save?.myTeamId) ? "home" : "away";
    return [
      {
        minute: m,
        team: mySide,
        inName: entry.inName,
        outName: entry.outName,
        playerInId: entry.inId,
        playerOutId: entry.outId,
      },
    ];
  }

  function skipToEnd(includeOpponentSubs = true) {
    // Clear the running clock timeout immediately
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }

    if (!fixtureRef.current?.result) return;

    // Fast-forward the remaining minutes so stamina keeps draining and our team
    // can make automatic substitutions. When this is triggered from the preview
    // skip button, the opponent does not perform planned subs.
    const madeWhileSkipping: any[] = [];
    for (let m = minuteRef.current + 1; m <= 90; m++) {
      drainStamina();
      if (includeOpponentSubs) {
        const before = oppPlanRef.current.filter((s) => s.minute === m);
        if (before.length > 0) applyOpponentSubsAt(m);
      }
      // My team considers a change roughly every 10 minutes of the second half.
      if (m >= 55 && m % 10 === 0) {
        madeWhileSkipping.push(...autoSubMyTeamAt(m));
      }
    }
    if (madeWhileSkipping.length > 0) {
      setSubFeed((prev) => [...madeWhileSkipping.reverse(), ...prev]);
    }

    setHomeScore(fixtureRef.current.result.homeGoals);
    setAwayScore(fixtureRef.current.result.awayGoals);
    setFeed(allEventsRef.current.slice().reverse());
    setCardFeed(allCardsRef.current.slice().reverse());
    setHighlightFeed(allHighlightsRef.current.slice().reverse());
    setMinute(90);
    minuteRef.current = 90;
    setPhase("done");
    clearMatchSnapshot();
    clearLive();
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
      const playerXI = shot.team === "home" ? homeXIRef.current : awayXIRef.current;
      const player = playerXI.find((p) => p.id === shot.playerId);
      const playerName = player ? player.name : "Unknown";

      const penaltyEvent: MatchEvent = {
        minute: 120 + penaltyShootoutIndex + idx,
        team: shot.team === "home" ? "home" : "away",
        type: "penalty" as any,
        scorerId: shot.playerId,
        scorerName: playerName,
        assistName: shot.scored ? "✅ Anotado" : "❌ Fallado",
      };
      setFeed((prev) => [...prev, penaltyEvent]);

      // Update penalty scores
      if (shot.team === "home") {
        if (shot.scored) {
          setPenaltyHomeScore((s) => s + 1);
          finalHomeScore++;
        }
      } else {
        if (shot.scored) {
          setPenaltyAwayScore((s) => s + 1);
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
    setFeed((prev) => [...prev, ...extraTimeEventsRef.current]);

    // Set final extra time scores based on actual events
    const etHomeGoals = extraTimeEventsRef.current.filter(
      (e) => e.team === "home" && e.type === "goal",
    ).length;
    const etAwayGoals = extraTimeEventsRef.current.filter(
      (e) => e.team === "away" && e.type === "goal",
    ).length;
    setExtraTimeHomeScore(etHomeGoals);
    setExtraTimeAwayScore(etAwayGoals);

    console.log(
      `Skip extra time: ET scores - Home: ${etHomeGoals}, Away: ${etAwayGoals}, Total Home: ${homeScore + etHomeGoals}, Total Away: ${awayScore + etAwayGoals}`,
    );

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
  console.log("Match fixture:", {
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    myId,
    isHome,
    homeName: home?.name,
    awayName: away?.name,
  });

  // Get lineups for both teams
  const homeSquad = getSimSquad(fixture.homeId);
  const awaySquad = getSimSquad(fixture.awayId);

  // Rival lineup is computed only once per fixture (and then mutated by the CPU
  // substitutions), so the mini pitch always shows who is actually on the pitch.
  const oppId = isMe(fixture.homeId) ? fixture.awayId : fixture.homeId;
  if (!oppCacheRef.current || oppCacheRef.current.key !== `${fixture.id}:${oppId}`) {
    const { players: oppPlayers, formation: oppFmt } = getStartersWithFormation(save, oppId, {
      randomFormation: true,
    });
    oppXIRef.current = oppPlayers;
    const oppSquad = getSimSquad(oppId);
    const onPitchIds = new Set(oppPlayers.map((p: any) => p.id));
    oppBenchRef.current = oppSquad
      .filter((p: any) => !onPitchIds.has(p.id) && (p.injuredUntil ?? 0) <= 0)
      .sort((a: any, b: any) => b.rating - a.rating)
      .slice(0, 7);
    oppCacheRef.current = { key: `${fixture.id}:${oppId}`, formation: oppFmt };
    const storedOppSubs = (fixture.result?.substitutions || [])
      .filter((sb: any) => sb.team === (fixture.homeId === oppId ? "home" : "away"))
      .map((sb: any) => ({ minute: sb.minute, outId: sb.playerOutId, inId: sb.playerInId }));
    oppPlanRef.current = storedOppSubs.length > 0 ? storedOppSubs : [];
  }
  const oppFormation = oppCacheRef.current.formation;

  // Determine home team lineup and formation
  let homeLineup: any[] = [];
  let homeFormation: any = "Táctica 4-4-2";

  if (isMe(fixture.homeId)) {
    // User's team - use temporary lineup if available, otherwise use global
    const liveIds = phase !== "preview" && myXI.length > 0 ? myXI : null;
    const homeLineupIds = liveIds || matchLineup || save.lineups[fixture.homeId] || [];
    homeLineup = homeLineupIds.map((id) => homeSquad.find((p) => p.id === id)).filter(Boolean);
    homeFormation =
      (phase !== "preview" && liveFormation) ||
      matchFormation ||
      save.formations[fixture.homeId] ||
      "Táctica 4-4-2";
  } else {
    homeLineup = oppXIRef.current;
    homeFormation = oppFormation;
  }

  // Determine away team lineup and formation
  let awayLineup: any[] = [];
  let awayFormation: any = "Táctica 4-4-2";

  if (isMe(fixture.awayId)) {
    // User's team - use temporary lineup if available, otherwise use global
    const liveIdsAway = phase !== "preview" && myXI.length > 0 ? myXI : null;
    const awayLineupIds = liveIdsAway || matchLineup || save.lineups[fixture.awayId] || [];
    awayLineup = awayLineupIds.map((id) => awaySquad.find((p) => p.id === id)).filter(Boolean);
    awayFormation =
      (phase !== "preview" && liveFormation) ||
      matchFormation ||
      save.formations[fixture.awayId] ||
      "Táctica 4-4-2";
  } else {
    awayLineup = oppXIRef.current;
    awayFormation = oppFormation;
  }

  // Check if user's lineup is complete (11 players)
  const userLineup = isMe(fixture.homeId) ? homeLineup : awayLineup;
  const isUserLineupComplete = userLineup.length === 11;

  // Round names mapping for cup matches
  const roundNames: Record<string, string> = {
    R32: "Treintaidosavos",
    R16: "Dieciseisavos",
    Octavos: "Octavos de Final",
    QF: "Cuartos de Final",
    SF: "Semifinales",
    Final: "Final",
  };

  // Determine header text based on match type
  const headerText =
    matchType === "CUP"
      ? `Copa Nacional · ${cupRound || fixture.round || ""}`
      : matchType === "UCL"
        ? `Champions League · Jornada ${fixture.matchday}`
        : `Liga · Jornada ${fixture.matchday}`;

  const liveMinuteLabel =
    phase === "preview"
      ? "00'"
      : phase === "penalties"
        ? "PEN"
        : phase === "done"
          ? "FINAL"
          : `${minute}'`;

  return (
    <div className="p-3 md:p-4 max-w-[1700px] mx-auto">
      {/* Always-visible match clock */}
      <div className="sticky top-0 z-30 -mx-3 md:-mx-4 mb-3 px-3 md:px-4 py-2 bg-background/85 backdrop-blur border-b border-border/60">
        <div className="flex items-center justify-between gap-3">
          <span className="chip truncate">{headerText}</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold truncate max-w-[8rem] text-right">{home.short}</span>
            <span className="scoreline text-lg font-black tabular-nums">
              {phase === "preview"
                ? "– : –"
                : `${homeScore + extraTimeHomeScore} : ${awayScore + extraTimeAwayScore}`}
            </span>
            <span className="text-sm font-bold truncate max-w-[8rem]">{away.short}</span>
            <span className="scoreline text-lg font-black text-primary tabular-nums w-16 text-right">
              {liveMinuteLabel}
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
        <div className="min-w-0">
          <div className="panel-glow p-4 md:p-6">
            <div className="flex items-center justify-between mb-6">
              <span className="chip">{headerText}</span>
              <div className="text-sm scoreline font-bold text-primary">{liveMinuteLabel}</div>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 md:gap-6 items-center text-center">
              <div className="flex flex-col items-center gap-2 md:gap-3">
                <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={64} />
                <div className="flex items-center gap-2">
                  <LeagueLogo league={LEAGUES[home.league]?.name || ""} size="sm" />
                  <CountryFlag country={LEAGUES[home.league]?.country || ""} />
                  <div className="font-bold text-sm md:text-base">{home.name}</div>
                </div>
                <MiniPitch
                  startingXI={homeLineup}
                  formation={homeFormation}
                  teamId={fixture.homeId}
                  className="mt-2"
                  cards={cardFeed.filter((c) => c.team === "home")}
                  goals={feed}
                  assists={feed}
                  mvp={phase === "done" ? fixture.result?.mvp?.playerId : undefined}
                  substitutions={subFeed.filter((s: any) => s.team === "home")}
                />
              </div>
              <div className="scoreline text-5xl md:text-7xl font-black">
                {phase === "preview"
                  ? "–"
                  : phase === "extra_time"
                    ? homeScore + extraTimeHomeScore
                    : phase === "penalties"
                      ? `${homeScore + extraTimeHomeScore}(${penaltyHomeScore})`
                      : phase === "done" && fixtureRef.current?.result?.penalties
                        ? `${fixtureRef.current.result.homeGoals + (fixtureRef.current.result.extraTime?.homeGoals || 0)}(${fixtureRef.current.result.penalties.homeGoals})`
                        : phase === "done" && fixtureRef.current?.result?.extraTime
                          ? fixtureRef.current.result.homeGoals +
                            fixtureRef.current.result.extraTime.homeGoals
                          : phase === "done"
                            ? fixtureRef.current?.result?.homeGoals || homeScore
                            : homeScore}
                <span className="text-muted-foreground mx-2 md:mx-3">:</span>
                {phase === "preview"
                  ? "–"
                  : phase === "extra_time"
                    ? awayScore + extraTimeAwayScore
                    : phase === "penalties"
                      ? `${penaltyAwayScore})${awayScore + extraTimeAwayScore}`
                      : phase === "done" && fixtureRef.current?.result?.penalties
                        ? `${fixtureRef.current.result.penalties.awayGoals})${fixtureRef.current.result.awayGoals + (fixtureRef.current.result.extraTime?.awayGoals || 0)}`
                        : phase === "done" && fixtureRef.current?.result?.extraTime
                          ? fixtureRef.current.result.awayGoals +
                            fixtureRef.current.result.extraTime.awayGoals
                          : phase === "done"
                            ? fixtureRef.current?.result?.awayGoals || awayScore
                            : awayScore}
              </div>
              <div className="flex flex-col items-center gap-2 md:gap-3">
                <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={64} />
                <div className="flex items-center gap-2">
                  <LeagueLogo league={LEAGUES[away.league]?.name || ""} size="sm" />
                  <CountryFlag country={LEAGUES[away.league]?.country || ""} />
                  <div className="font-bold text-sm md:text-base">{away.name}</div>
                </div>
                <MiniPitch
                  startingXI={awayLineup}
                  formation={awayFormation}
                  teamId={fixture.awayId}
                  className="mt-2"
                  cards={cardFeed.filter((c) => c.team === "away")}
                  goals={feed}
                  assists={feed}
                  mvp={phase === "done" ? fixture.result?.mvp?.playerId : undefined}
                  substitutions={subFeed.filter((s: any) => s.team === "away")}
                />
              </div>
            </div>

            {phase !== "preview" && (
              <div className="mt-6 h-1 bg-secondary rounded overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(minute / (phase === "extra_time" ? 120 : 90)) * 100}%` }}
                />
              </div>
            )}

            <div className="mt-6 flex gap-2 justify-center flex-wrap items-center">
              {phase === "preview" && (
                <>
                  <button
                    onClick={() =>
                      navigate({
                        to: "/lineup",
                        state: {
                          fromMatch: true,
                          matchType,
                          cupRound,
                          fixtureId: fixture.id,
                        } as any,
                      })
                    }
                    className={btnSecondary}
                  >
                    <ClipboardList className="h-4 w-4" /> Editar alineación
                  </button>
                  <button
                    onClick={() => startMatch(false)}
                    disabled={!isUserLineupComplete}
                    className={
                      isUserLineupComplete
                        ? btnPrimary
                        : `${btnSecondary} opacity-40 pointer-events-none`
                    }
                  >
                    {isUserLineupComplete ? "INICIAR PARTIDO" : "ALINEACIÓN INCOMPLETA"}
                  </button>
                  <button
                    onClick={() => startMatch(true)}
                    disabled={!isUserLineupComplete}
                    className={
                      isUserLineupComplete
                        ? btnSecondary
                        : `${btnSecondary} opacity-40 pointer-events-none`
                    }
                  >
                    <FastForward className="h-4 w-4" /> SALTAR AL FINAL
                  </button>
                </>
              )}
              {phase === "playing" && (
                <div className="w-full space-y-3">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className={infoChip}>
                      Cambios {subsUsed}/{subLimits(isExtraTimeRef.current).maxSubs}
                    </span>
                    <span className={infoChip}>
                      Ventanas {windowsUsed}/{subLimits(isExtraTimeRef.current).maxWindows}
                    </span>
                    <span className={infoChip}>En campo {myXI.length}</span>
                    {isPaused && (
                      <span className={infoChip}>
                        {pauseReason === "halftime"
                          ? "Descanso"
                          : pauseReason === "injury"
                            ? "Lesión"
                            : "Pausado"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={() => (isPaused ? resumeMatch() : pauseMatch("manual"))}
                      className={isPaused ? btnPrimary : btnSecondary}
                      disabled={pauseReason === "injury"}
                    >
                      {isPaused ? (
                        <>
                          <Play className="h-4 w-4" /> Reanudar
                        </>
                      ) : (
                        <>
                          <Pause className="h-4 w-4" /> Pausar
                        </>
                      )}
                    </button>
                    <button onClick={goEditLineupLive} className={btnSecondary}>
                      <ClipboardList className="h-4 w-4" /> Alineación y táctica
                    </button>
                    <button onClick={skipToEnd} className={btnGhost}>
                      <FastForward className="h-3.5 w-3.5" /> Saltar al final
                    </button>
                  </div>
                  {isPaused && pauseReason === "halftime" && (
                    <p className="text-center text-xs text-muted-foreground">
                      Descanso · los cambios que hagas ahora no gastan ventana.
                    </p>
                  )}
                </div>
              )}
              {phase === "extra_time" && (
                <div className="w-full flex flex-wrap items-center justify-center gap-2">
                  <span className={infoChip}>
                    Prórroga · cambios {subsUsed}/{subLimits(true).maxSubs}
                  </span>
                  <button
                    onClick={() => (isPaused ? resumeMatch() : pauseMatch("manual"))}
                    className={isPaused ? btnPrimary : btnSecondary}
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-4 w-4" /> Reanudar
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4" /> Pausar
                      </>
                    )}
                  </button>
                  <button onClick={skipExtraTimeToEnd} className={btnGhost}>
                    <FastForward className="h-3.5 w-3.5" /> Saltar al final
                  </button>
                </div>
              )}
              {phase === "penalties" && (
                <button onClick={skipPenaltyShootoutToEnd} className={btnSecondary}>
                  <FastForward className="h-4 w-4" /> Saltar al final
                </button>
              )}
              {phase === "done" && (
                <>
                  {(() => {
                    const isUCLKnockout =
                      matchType === "UCL" &&
                      fixture?.round &&
                      (fixture.round === "Final" ||
                        fixture.round.includes("Playoff") ||
                        fixture.round.includes("R16") ||
                        fixture.round.includes("QF") ||
                        fixture.round.includes("SF") ||
                        fixture.round.endsWith("-Leg2"));
                    const isLeg2 = fixture?.round?.endsWith("-Leg2");
                    const isFinal = fixture?.round === "Final";

                    // Check if aggregate is tied for two-legged ties
                    let aggregateTied = false;
                    if (isLeg2 && save?.uclFixtures) {
                      const leg1 = save.uclFixtures.find(
                        (l) =>
                          l.round === fixture.round!.replace("Leg2", "Leg1") &&
                          ((l.homeId === fixture.awayId && l.awayId === fixture.homeId) ||
                            (l.homeId === fixture.homeId && l.awayId === fixture.awayId)),
                      );
                      if (leg1?.result && fixtureRef.current?.result) {
                        const aggHome = fixtureRef.current.result.homeGoals + leg1.result.awayGoals;
                        const aggAway = fixtureRef.current.result.awayGoals + leg1.result.homeGoals;
                        aggregateTied = aggHome === aggAway;
                      }
                    }

                    // For cup matches: show ET button if match is drawn without ET/penalties
                    const shouldShowExtraTimeButtonForCup =
                      (isCupMatch || fixture?.competition === "cup") &&
                      fixtureRef.current?.result?.homeGoals ===
                        fixtureRef.current?.result?.awayGoals &&
                      !fixtureRef.current?.result?.extraTime &&
                      !fixtureRef.current?.result?.penalties;

                    // For UCL knockout: show ET button only in leg2 when aggregate is tied, or in final when match is drawn
                    const shouldShowExtraTimeButtonForUCL =
                      isUCLKnockout &&
                      !fixtureRef.current?.result?.extraTime &&
                      !fixtureRef.current?.result?.penalties &&
                      ((isFinal &&
                        fixtureRef.current?.result?.homeGoals ===
                          fixtureRef.current?.result?.awayGoals) ||
                        (isLeg2 && aggregateTied));

                    const shouldShowExtraTimeButton =
                      shouldShowExtraTimeButtonForCup || shouldShowExtraTimeButtonForUCL;

                    return shouldShowExtraTimeButton ? (
                      // Cup/UCL knockout match ended in draw without extra time/penalties - show edit lineup and extra time buttons
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            navigate({
                              to: "/lineup",
                              state: {
                                fromMatch: true,
                                returningFromLineupEdit: true,
                                matchType,
                                cupRound,
                                fixtureId: fixture.id,
                              },
                            })
                          }
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
                      <button
                        onClick={handleReturnToSeason}
                        disabled={isSimulating}
                        className={btnPrimary}
                      >
                        {isSimulating ? "Simulando..." : "Volver a la temporada →"}
                      </button>
                    );
                  })()}
                </>
              )}
            </div>
          </div>

          {(phase === "playing" || phase === "extra_time") &&
            showSubs &&
            (() => {
              const onPitch = myXI
                .map((id) => mySquad().find((p: any) => p.id === id))
                .filter(Boolean) as any[];
              const benchPlayers = myBench
                .map((id) => mySquad().find((p: any) => p.id === id))
                .filter(Boolean) as any[];
              const limits = subLimits(isExtraTimeRef.current);
              return (
                <SubstitutionPanel
                  onPitch={onPitch}
                  bench={benchPlayers}
                  stamina={stamina}
                  subsUsed={subsUsed}
                  maxSubs={limits.maxSubs}
                  windowsUsed={windowsUsed}
                  maxWindows={limits.maxWindows}
                  freeWindow={isFreeWindow(currentLivePhase())}
                  forcedOutId={forcedOutId}
                  onConfirm={applySubstitutions}
                  onClose={() => {
                    if (!forcedOutId) setShowSubs(false);
                  }}
                  onPlayShort={() =>
                    forcedOutId && playWithOneLess(forcedOutId, playerById(forcedOutId)?.name)
                  }
                />
              );
            })()}

          {(phase === "playing" || phase === "extra_time" || phase === "done") && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2 items-start">
              {fixture?.result?.stats &&
                (() => {
                  const acc = accumulateStats(fixture.result.stats, phase === "done" ? 90 : minute);
                  return <MatchStatsPanel home={acc.home} away={acc.away} />;
                })()}
              {(phase === "playing" || phase === "extra_time") && (
                <StaminaPanel
                  players={
                    myXI
                      .map((id) => mySquad().find((p: any) => p.id === id))
                      .filter(Boolean) as any[]
                  }
                  stamina={stamina}
                />
              )}
              {phase === "done" && fixture?.result && (
                <PlayerRatingsPanel
                  ratings={fixture.result.ratings ?? []}
                  mvp={fixture.result.mvp}
                  homeName={fixture.homeTeam?.name ?? "Local"}
                  awayName={fixture.awayTeam?.name ?? "Visitante"}
                />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="panel p-5 xl:sticky xl:top-16">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Crónica del partido</h3>
              <span className="scoreline text-sm font-black text-primary tabular-nums">
                {liveMinuteLabel}
              </span>
            </div>
            {phase === "preview" ? (
              <p className="text-sm text-muted-foreground">
                {home.name} recibe a {away.name}. Pulsa "Iniciar partido" para comenzar.
              </p>
            ) : feed.length === 0 &&
              cardFeed.length === 0 &&
              highlightFeed.length === 0 &&
              subFeed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin eventos aún... el partido está disputado.
              </p>
            ) : (
              <div className="space-y-1 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
                {(() => {
                  // Only the highlights that add colour to the chronicle without flooding it.
                  const KEEP: Record<string, { icon: string; label: string }> = {
                    woodwork: { icon: "🥅", label: "Al palo" },
                    penalty_missed: { icon: "❌", label: "Penalti fallado" },
                    // "penalty_awarded" is intentionally NOT kept: a penalty is
                    // reported with a single line (scored or missed).

                    var_disallowed: { icon: "📺", label: "Gol anulado (VAR)" },
                    injury: { icon: "🚑", label: "Lesión" },
                    forced_sub: { icon: "🔁", label: "Cambio forzado" },
                    save: { icon: "🧤", label: "Parada" },
                  };
                  const usedSaves: number[] = [];
                  const hls = highlightFeed.filter((h: any) => {
                    if (!KEEP[h.type]) return false;
                    if (h.type === "save") {
                      // Keep only the outstanding saves, max 3, to avoid overload.
                      if (h.detail !== "¡Paradón!" || usedSaves.length >= 3) return false;
                      usedSaves.push(h.minute);
                    }
                    return true;
                  });
                  const items = [
                    ...cardFeed.map((c: any) => ({ kind: "card", minute: c.minute, data: c })),
                    ...feed.map((e: any) => ({ kind: "goal", minute: e.minute, data: e })),
                    ...hls.map((h: any) => ({ kind: "highlight", minute: h.minute, data: h })),
                    ...subFeed.map((s: any) => ({ kind: "sub", minute: s.minute, data: s })),
                  ].sort((a, b) => b.minute - a.minute);

                  return items.map((item, i) => {
                    const teamOf = (t: string) => (t === "home" ? home : away);
                    if (item.kind === "card") {
                      const card = item.data as CardEvent;
                      const cardTeam = teamOf(card.team);
                      const cardText = card.isSecondYellow
                        ? "2ª amarilla → roja"
                        : card.cardType === "yellow"
                          ? "Tarjeta amarilla"
                          : "Tarjeta roja";
                      return (
                        <div
                          key={`card-${i}`}
                          className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0"
                        >
                          <span className="scoreline text-sm text-primary font-bold w-10">
                            {card.minute}'
                          </span>
                          <span
                            className={`w-5 h-3 rounded-sm shrink-0 ${card.cardType === "yellow" ? "bg-yellow-400" : "bg-red-500"}`}
                          />
                          <TeamLogo
                            teamName={cardTeam.name}
                            leagueName={getLeagueName(cardTeam.league)}
                            size={22}
                          />
                          <div className="text-sm min-w-0">
                            <span className="font-bold">{card.playerName}</span>
                            <span className="text-muted-foreground"> · {cardText}</span>
                            <span className="text-muted-foreground"> ({cardTeam.short})</span>
                          </div>
                        </div>
                      );
                    }
                    if (item.kind === "sub") {
                      const s = item.data;
                      const subTeam = teamOf(s.team);
                      return (
                        <div
                          key={`sub-${i}`}
                          className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0"
                        >
                          <span className="scoreline text-sm text-primary font-bold w-10">
                            {s.minute}'
                          </span>
                          <span className="text-base w-5 text-center shrink-0">🔄</span>
                          <TeamLogo
                            teamName={subTeam.name}
                            leagueName={getLeagueName(subTeam.league)}
                            size={22}
                          />
                          <div className="text-sm min-w-0 truncate">
                            <span className="text-primary font-bold">{s.inName}</span>
                            <span className="text-muted-foreground"> por </span>
                            <span className="text-destructive">{s.outName}</span>
                            <span className="text-muted-foreground"> ({subTeam.short})</span>
                          </div>
                        </div>
                      );
                    }
                    if (item.kind === "highlight") {
                      const h = item.data;
                      const hTeam = teamOf(h.team);
                      const meta = KEEP[h.type];
                      return (
                        <div
                          key={`hl-${i}`}
                          className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0"
                        >
                          <span className="scoreline text-sm text-muted-foreground font-bold w-10">
                            {h.minute}'
                          </span>
                          <span className="text-base w-5 text-center shrink-0">{meta.icon}</span>
                          <TeamLogo
                            teamName={hTeam.name}
                            leagueName={getLeagueName(hTeam.league)}
                            size={22}
                          />
                          <div className="text-sm min-w-0 truncate">
                            <span className="font-semibold">{h.playerName}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {h.detail || meta.label}
                            </span>
                            <span className="text-muted-foreground"> ({hTeam.short})</span>
                          </div>
                        </div>
                      );
                    }
                    const e = item.data;
                    const scoringTeam = teamOf(e.team);
                    const isPenalty = e.type === "penalty" || e.type === "penalty_goal";
                    const isFreeKick = e.type === "free_kick_goal";
                    const isOwnGoal = e.type === "own_goal";
                    return (
                      <div
                        key={`goal-${i}`}
                        className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0"
                      >
                        <span className="scoreline text-sm text-primary font-bold w-10">
                          {e.minute}'
                        </span>
                        <span className="text-lg">
                          {isPenalty ? (
                            <span className="px-1.5 py-0.5 text-[0.8rem] font-bold rounded bg-white/6">
                              P
                            </span>
                          ) : (
                            <span className="w-3 h-3 inline-block rounded-full bg-white/80" />
                          )}
                        </span>
                        <TeamLogo
                          teamName={scoringTeam.name}
                          leagueName={getLeagueName(scoringTeam.league)}
                          size={22}
                        />
                        <div className="text-sm min-w-0">
                          <span className="font-bold">{e.scorerName}</span>
                          {isOwnGoal && (
                            <span className="text-muted-foreground"> · en propia puerta</span>
                          )}
                          {/* A penalty shows one single line including who conceded it. */}
                          {isPenalty && e.detail && (
                            <span className="text-muted-foreground"> · {e.detail}</span>
                          )}
                          {isFreeKick && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {e.detail || "falta directa"}
                            </span>
                          )}
                          {!isPenalty && !isFreeKick && !isOwnGoal && e.assistName && (
                            <span className="text-muted-foreground"> · asist. {e.assistName}</span>
                          )}
                          {!isPenalty && !isFreeKick && !isOwnGoal && e.detail && (
                            <span className="text-muted-foreground"> · {e.detail}</span>
                          )}
                          <span className="text-muted-foreground"> ({scoringTeam.short})</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {phase === "done" && fixture.result && (
              <>
                {injuries.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/60">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Lesiones
                    </div>
                    {injuries.map((inj, i) => {
                      const team = inj.team === "home" ? home : away;
                      return (
                        <div key={i} className="text-sm">
                          <span className="font-bold">{inj.playerName}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            ({team.short}) — {inj.reason}, baja {inj.weeks}{" "}
                            {inj.weeks === 1 ? "jornada" : "jornadas"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-border/60 text-xs text-muted-foreground grid grid-cols-2 gap-2">
                  <div>
                    xG {home.short}:{" "}
                    <span className="text-foreground scoreline">
                      {fixture.result.xgHome.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-right">
                    xG {away.short}:{" "}
                    <span className="text-foreground scoreline">
                      {fixture.result.xgAway.toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

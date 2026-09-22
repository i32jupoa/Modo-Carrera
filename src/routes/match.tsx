// @ts-nocheck
import { createFileRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  getMyNextFixture,
  loadSave,
  playMyNextMatch,
  playMyNextCupMatch,
  SaveGame,
  saveSaveWithRetry,
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
  LIVE_VERSION,
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
import {
  btnPrimary,
  btnSecondary,
  btnGhost,
  infoChip,
  segmentBase,
  segmentItem,
} from "@/components/match/matchUi";
import { Pause, Play, FastForward, ClipboardList } from "lucide-react";
import { isPlayerInjuredAtDate, usePlayersStore } from "@/store/playersStore";
import { MiniPitch } from "@/components/MiniPitch";
import { PlayerFace } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";
import { CountryFlag } from "@/components/CountryFlag";
import { LeagueLogo } from "@/components/LeagueLogo";
import { MomentumBar } from "@/components/match/MomentumBar";
import { LiveEventOverlay } from "@/components/match/LiveEventOverlay";
import { LiveCommentary, type CommentaryEntry } from "@/components/match/LiveCommentary";
import {
  PenaltyDecisionModal,
  type PendingPenalty,
  type PenaltyZoneId,
} from "@/components/match/PenaltyDecisionModal";
import {
  DEFAULT_MANAGER_EFFECTS,
  avg as averageNumbers,
  buildMomentFromEvent,
  buildMomentFromHighlight,
  buildGoalPrelude,
  buildSavePrelude,
  buildDangerPreludeFromHighlight,
  buildNarrativeCommentary,
  buildSyntheticMoment,
  momentumStatus,
  updateMomentum,
  type LiveManagerEffects,
  type LiveMoment,
} from "@/lib/liveMatchEngine";

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
  const homeScoreRef = useRef(0);
  const awayScoreRef = useRef(0);
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

  // ---- living match layer --------------------------------------------------
  const [momentum, setMomentum] = useState(50);
  const momentumRef = useRef(50);
  const [momentumHistory, setMomentumHistory] = useState<Array<{ minute: number; value: number }>>(
    [],
  );
  const momentumHistoryRef = useRef<Array<{ minute: number; value: number }>>([]);
  const [liveMoment, setLiveMoment] = useState<LiveMoment | null>(null);
  const momentTimerRef = useRef<number | null>(null);
  const [managerEffects, setManagerEffects] = useState<LiveManagerEffects>(DEFAULT_MANAGER_EFFECTS);
  const managerEffectsRef = useRef<LiveManagerEffects>({ ...DEFAULT_MANAGER_EFFECTS });
  const [commentaryEntries, setCommentaryEntries] = useState<CommentaryEntry[]>([]);
  const commentaryEntriesRef = useRef<CommentaryEntry[]>([]);
  const lastNarrativeMinuteRef = useRef(-99);
  const lastMajorMomentMinuteRef = useRef(-99);
  const [keyMoments, setKeyMoments] = useState<LiveMoment[]>([]);
  const keyMomentsRef = useRef<LiveMoment[]>([]);
  const [pendingPenalty, setPendingPenalty] = useState<PendingPenalty | null>(null);
  const pendingPenaltySourceRef = useRef<any>(null);
  const pendingPenaltyZoneRef = useRef<PenaltyZoneId | null>(null);
  const pendingSceneRef = useRef<{
    kind: "prelude" | "resolution" | "var" | "penalty_intro";
    moment?: any;
    resolution?: any;
    source?: any;
  } | null>(null);
  const clockRunIdRef = useRef(0);
  const outcomeBiasRef = useRef(0);
  const recentDangerAttackersRef = useRef<Record<"home" | "away", string[]>>({ home: [], away: [] });

  // ---- live match control (pause / subs / stamina) ----
  const pausedRef = useRef(false);
  const pauseReasonRef = useRef<
    | null
    | "manual"
    | "halftime"
    | "injury"
    | "et_break"
    | "et_halftime"
    | "moment"
    | "coach"
    | "penalty"
  >(null);
  const finishScheduledRef = useRef(false);
  const halftimePendingAfterMomentRef = useRef(false);
  const scheduleRef = useRef<null | (() => void)>(null);
  const [pauseReason, setPauseReason] = useState<
    | null
    | "manual"
    | "halftime"
    | "injury"
    | "et_break"
    | "et_halftime"
    | "moment"
    | "coach"
    | "penalty"
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
  const initialMyXIRef = useRef<string[]>([]);
  const finalPerformanceRecordedRef = useRef(false);
  const [myBench, setMyBench] = useState<string[]>([]);
  const myBenchRef = useRef<string[]>([]);
  const [goneIds, setGoneIds] = useState<string[]>([]);
  const goneRef = useRef<string[]>([]);
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
  // Rival substitutions actually shown during the match.
  const oppSubsDoneRef = useRef<any[]>([]);
  // The chronicle as it really happened (after remapping events to the players
  // that were on the pitch at that minute).
  const playedEventsRef = useRef<any[]>([]);
  const playedCardsRef = useRef<any[]>([]);
  const playedHighlightsRef = useRef<any[]>([]);
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

    // Restore the exact timeline already resolved before the route change.
    // Older live snapshots did not have these fields, so use the visible feed
    // / minute as a safe backwards-compatible fallback.
    playedEventsRef.current = Array.isArray((st as any).playedEvents)
      ? (st as any).playedEvents
      : (st.result?.events ?? []).filter(
          (e: any) => Number(e.minute ?? 0) <= Number(st.minute ?? 0),
        );
    playedCardsRef.current = Array.isArray((st as any).playedCards)
      ? (st as any).playedCards
      : (st.result?.cards ?? []).filter(
          (c: any) => Number(c.minute ?? 0) <= Number(st.minute ?? 0),
        );
    playedHighlightsRef.current = Array.isArray((st as any).playedHighlights)
      ? (st as any).playedHighlights
      : (st.result?.highlights ?? []).filter(
          (h: any) => Number(h.minute ?? 0) <= Number(st.minute ?? 0),
        );
    oppSubsDoneRef.current = Array.isArray((st as any).opponentSubsDone)
      ? (st as any).opponentSubsDone
      : [];

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
    homeScoreRef.current = Number(st.homeScore) || 0;
    awayScoreRef.current = Number(st.awayScore) || 0;
    setHomeScore(homeScoreRef.current);
    setAwayScore(awayScoreRef.current);
    setMinute(m);
    minuteRef.current = m;

    const resumeMySide = fx.homeId === s.myTeamId ? "home" : "away";
    const storedInitialXI = (
      resumeMySide === "home" ? fx.result?.homeLineup : fx.result?.awayLineup
    )
      ?.map((p: any) => p.id)
      ?.filter(Boolean);
    initialMyXIRef.current =
      Array.isArray(storedInitialXI) && storedInitialXI.length > 0
        ? storedInitialXI.slice(0, 11)
        : [...(s.lineups[s.myTeamId] ?? st.lineup)].slice(0, 11);
    finalPerformanceRecordedRef.current = false;
    myXIRef.current = st.lineup;
    setMyXI(st.lineup);
    myBenchRef.current = st.bench;
    setMyBench(st.bench);
    staminaRef.current = st.stamina || {};
    setStamina(st.stamina || {});
    const restoredMomentum = Number(st.momentum ?? 50);
    momentumRef.current = restoredMomentum;
    setMomentum(restoredMomentum);
    const restoredMomentumHistory = Array.isArray(st.momentumHistory) ? st.momentumHistory : [];
    momentumHistoryRef.current = restoredMomentumHistory;
    setMomentumHistory(restoredMomentumHistory);
    const restoredEffects = { ...DEFAULT_MANAGER_EFFECTS, ...(st.managerEffects || {}) };
    managerEffectsRef.current = restoredEffects;
    setManagerEffects(restoredEffects);
    outcomeBiasRef.current = Number(st.outcomeBias ?? 0);
    if (Array.isArray(st.narrative)) {
      commentaryEntriesRef.current = st.narrative;
      setCommentaryEntries(st.narrative);
    }
    const restoredMoments = Array.isArray(st.keyMoments) ? st.keyMoments : [];
    keyMomentsRef.current = restoredMoments.slice(-12);
    setKeyMoments(keyMomentsRef.current);
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
    etHalftimeDoneRef.current = m >= 105;
    isExtraTimeRef.current = st.isExtraTime;
    setMatchType(st.matchType);
    setCupRound(st.cupRound);
    setLiveFormation(st.formation);
    setIsCupMatch(st.matchType === "CUP");

    // Restore the exact saved phase. In particular, do not turn a saved
    // halftime into a live second-half clock before the user has returned from
    // lineup editing. The same applies to the break inside extra time.
    const restoredPhase = st.phase || (st.isExtraTime ? "et_playing" : "playing");
    const atBreak = restoredPhase === "halftime" || restoredPhase === "et_halftime";
    setPhase(st.isExtraTime ? "extra_time" : "playing");
    finishScheduledRef.current = false;
    halftimePendingAfterMomentRef.current = false;
    pendingSceneRef.current = (st.scene as any) || null;
    setLiveFormation(st.formation);

    if (st.scene?.moment) {
      setLiveMoment(st.scene.moment);
    }

    // A saved half-time stays stopped. The manager must explicitly start the
    // second half; this is also what lets the lineup screen be used safely.
    if (atBreak) {
      pausedRef.current = true;
      pauseReasonRef.current = restoredPhase === "et_halftime" ? "et_halftime" : "halftime";
      setIsPaused(true);
      setPauseReason(restoredPhase === "et_halftime" ? "et_halftime" : "halftime");
      if (st.narrative) commentaryEntriesRef.current = st.narrative;
      return;
    }

    // If the browser was refreshed during a two-step event, restore the scene
    // instead of skipping it.
    if (st.scene?.moment) {
      pausedRef.current = true;
      pauseReasonRef.current = "moment";
      setIsPaused(true);
      setPauseReason("moment");
      return;
    }

    pausedRef.current = false;
    pauseReasonRef.current = null;
    setIsPaused(false);
    setPauseReason(null);
    if (st.isExtraTime) runExtraTimeClock(m);
    else runClock(m);
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

      const persisted = saveSaveWithRetry(next);
      setSave(next);

      if (!persisted) {
        // El mercado (lo que más pesaba, con diferencia) ya no vive en
        // localStorage, así que esto ya casi nunca debería fallar por cuota.
        // Si aun así falla (disco realmente lleno, modo privado muy
        // restrictivo...) avisamos sin bloquear: el resultado ya está
        // aplicado en memoria (`setSave(next)` de arriba) y bloquear aquí
        // sólo dejaría al jugador atascado sin poder seguir la partida.
        toast.error(
          "No se pudo guardar en el dispositivo (almacenamiento lleno). El partido se ha jugado igualmente, pero conviene liberar espacio pronto.",
        );
      }

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

  function runExtraTimeClock(startMinute = 90) {
    const runId = ++clockRunIdRef.current;
    let m = Math.max(90, startMinute);
    const scheduleEt = (delay?: number) => {
      if (pausedRef.current || runId !== clockRunIdRef.current) return;
      clockTimeoutRef.current = window.setTimeout(
        tick,
        delay ?? Math.max(40, Math.round(EXTRA_TIME_TICK_MS / speedRef.current)),
      );
    };
    const tick = () => {
      if (pausedRef.current || runId !== clockRunIdRef.current) return;
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
          announceHalftime(true);
          pauseMatch("et_halftime");
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
      saveSaveWithRetry(updatedSave);
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

    // `team` always represents the team credited with the goal. For an own
    // goal, only `scorerId` belongs to the opposite team.
    const homeGoalsCount = goals.filter((g) => g.team === "home").length;
    const awayGoalsCount = goals.filter((g) => g.team === "away").length;

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
        saveSaveWithRetry(newSave);
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
        saveSaveWithRetry(newSave);
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
        homeScoreRef.current = Number(foundFixture.result.homeGoals) || 0;
        awayScoreRef.current = Number(foundFixture.result.awayGoals) || 0;
        setHomeScore(homeScoreRef.current);
        setAwayScore(awayScoreRef.current);
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
    // The chronicle starts empty: MY substitutions are decided by the manager
    // (or by the assistant only when the match is simulated to the end), and the
    // rival ones are revealed as the clock reaches their minute.
    setSubFeed([]);

    // Rival lineup and substitutions: use exactly the ones the engine used for
    // this result, so his changes happen at their minute and every goal belongs
    // to a player that is really on the pitch.
    {
      const myId = myTeamIdRef.current || save.myTeamId;
      const oppSide = fixture.homeId === myId ? "away" : "home";
      const oppId = oppSide === "home" ? fixture.homeId : fixture.awayId;
      const planned = (fixture.result.substitutions || [])
        .filter((sb: any) => sb.team === oppSide)
        .map((sb: any) => ({ minute: sb.minute, outId: sb.playerOutId, inId: sb.playerInId }))
        .sort((a: any, b: any) => a.minute - b.minute);

      const simLineup: any[] =
        (oppSide === "home" ? fixture.result.homeLineup : fixture.result.awayLineup) || [];
      if (simLineup.length > 0) {
        const oppSquad = getSimSquad(oppId);
        const onPitch = new Set(simLineup.map((p: any) => p.id));
        const plannedIn = planned
          .map((s: any) => oppSquad.find((p: any) => p.id === s.inId))
          .filter((p: any) => p && !onPitch.has(p.id));
        const rest = oppSquad
          .filter(
            (p: any) =>
              !onPitch.has(p.id) &&
              !isPlayerInjuredAtDate(p, usePlayersStore.getState().currentDate) &&
              !plannedIn.some((q: any) => q.id === p.id),
          )
          .sort((a: any, b: any) => b.rating - a.rating)
          .slice(0, 7);
        oppXIRef.current = simLineup;
        oppBenchRef.current = [...plannedIn, ...rest];
        oppCacheRef.current = {
          key: `${fixture.id}:${oppId}`,
          formation:
            (oppSide === "home" ? fixture.result.homeFormation : fixture.result.awayFormation) ||
            oppCacheRef.current?.formation ||
            "Táctica 4-4-2",
        };
      }
      if (planned.length > 0) oppPlanRef.current = planned;
      else planOpponentSubs();
    }
    fixtureRef.current = fixture;
    homeScoreRef.current = 0;
    awayScoreRef.current = 0;
    setHomeScore(0);
    setAwayScore(0);

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
        saveSaveWithRetry(saveWithOriginalFormation);
      } else {
        setSave(newSave);
        saveSaveWithRetry(newSave);
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
          saveSaveWithRetry(updatedSave);
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
    if (oppPlanRef.current.length === 0) planOpponentSubs();
    setPhase("playing");
    runClock();
    if (shouldSkipToEnd) {
      // Simulating to the end: the assistant makes my substitutions and the
      // rival performs his planned ones.
      skipToEnd(true);
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
    initialMyXIRef.current = ids.slice();
    finalPerformanceRecordedRef.current = false;
    myXIRef.current = ids;
    setMyXI(ids);
    myBenchRef.current = benchIds;
    setMyBench(benchIds);
    staminaRef.current = st;
    setStamina(st);
    momentumRef.current = 50;
    setMomentum(50);
    momentumHistoryRef.current = [{ minute: 0, value: 50 }];
    setMomentumHistory(momentumHistoryRef.current);
    managerEffectsRef.current = { ...DEFAULT_MANAGER_EFFECTS };
    setManagerEffects(managerEffectsRef.current);
    outcomeBiasRef.current = 0;
    recentDangerAttackersRef.current = { home: [], away: [] };
    setPendingPenalty(null);
    setLiveMoment(null);
    pendingSceneRef.current = null;
    commentaryEntriesRef.current = [];
    setCommentaryEntries([]);
    keyMomentsRef.current = [];
    setKeyMoments([]);
    lastNarrativeMinuteRef.current = -99;
    lastMajorMomentMinuteRef.current = -99;
    goneRef.current = [];
    setGoneIds([]);
    oppSubsDoneRef.current = [];
    playedEventsRef.current = [];
    playedCardsRef.current = [];
    playedHighlightsRef.current = [];
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
    pauseReasonRef.current = null;
    finishScheduledRef.current = false;
    setIsPaused(false);
    setPauseReason(null);
    setLiveFormation(matchFormation || s.formations[s.myTeamId] || null);
  }

  function currentLivePhase(): LivePhase {
    const activePauseReason = pauseReasonRef.current ?? pauseReason;
    if (activePauseReason === "halftime") return "halftime";
    if (activePauseReason === "et_break") return "et_break";
    if (activePauseReason === "et_halftime") return "et_halftime";
    return isExtraTimeRef.current ? "et_playing" : "playing";
  }

  function announceHalftime(extraTime = false) {
    const title = extraTime ? "DESCANSO DE LA PRÓRROGA" : "DESCANSO";
    const homeTotal = homeScoreRef.current + (extraTime ? extraTimeHomeScoreRef.current : 0);
    const awayTotal = awayScoreRef.current + (extraTime ? extraTimeAwayScoreRef.current : 0);
    toast.info(title, {
      description: `${home.name} ${homeTotal}-${awayTotal} ${away.name}.`,
      duration: 4500,
    });
  }

  function persistLive() {
    const fx = fixtureRef.current;
    if (!fx?.result) return;
    saveLive({
      v: LIVE_VERSION,
      fixtureId: fx.id,
      minute: minuteRef.current,
      phase: currentLivePhase(),
      homeScore: homeScoreRef.current,
      awayScore: awayScoreRef.current,
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
      momentum: momentumRef.current,
      momentumHistory: momentumHistoryRef.current,
      managerEffects: managerEffectsRef.current,
      outcomeBias: outcomeBiasRef.current,
      narrative: commentaryEntries.slice(0, 12),
      keyMoments: keyMomentsRef.current.slice(-12),
      playedEvents: playedEventsRef.current.slice(),
      playedCards: playedCardsRef.current.slice(),
      playedHighlights: playedHighlightsRef.current.slice(),
      opponentSubsDone: oppSubsDoneRef.current.slice(),
      scene: pendingSceneRef.current,
    });
  }

  function pauseMatch(
    reason:
      | "manual"
      | "halftime"
      | "injury"
      | "et_break"
      | "et_halftime"
      | "moment"
      | "coach"
      | "penalty",
  ) {
    clockRunIdRef.current += 1;
    pausedRef.current = true;
    pauseReasonRef.current = reason;
    setIsPaused(true);
    setPauseReason(reason);
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }
    persistLive();
  }

  function restartLiveClock() {
    const startMinute = minuteRef.current;
    const extraTime = isExtraTimeRef.current;
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }
    // Let React flush the decision/lineup state before the next clock run.
    // This prevents a synchronous state transition from racing with the old
    // timer and leaving the live match apparently frozen.
    window.setTimeout(() => {
      if (pausedRef.current) return;
      if (extraTime) runExtraTimeClock(startMinute);
      else runClock(startMinute);
    }, 0);
  }

  function resumeMatch() {
    if (!pausedRef.current) return;
    const previousReason = pauseReasonRef.current ?? pauseReason;
    pausedRef.current = false;
    pauseReasonRef.current = null;
    setIsPaused(false);
    setPauseReason(null);

    // Every pause invalidates the old clock run id. Always create a fresh run
    // when continuing so decisions/events can never leave the match frozen.
    if (previousReason === "et_halftime" || previousReason === "et_break") {
      window.setTimeout(() => {
        if (!pausedRef.current) runExtraTimeClock(Math.min(105, minuteRef.current));
      }, 0);
      return;
    }
    restartLiveClock();
  }

  /*** Drain energy of the players currently on the pitch. */
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
        (next[id] ?? STAMINA_START) -
          drainPerMinute(
            p.position,
            pressure,
            staminaMult * managerEffectsRef.current.staminaMultiplier,
          ),
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
    const benchAvailable = myBenchRef.current.some(
      (id) =>
        !goneRef.current.includes(id) &&
        !isPlayerInjuredAtDate(playerById(id), usePlayersStore.getState().currentDate),
    );
    const canReplaceNow = check.ok && benchAvailable;

    pauseMatch("injury");
    playWithOneLess(inj.playerId, inj.playerName);

    const moment = {
      id: `injury-sub-${m}-${inj.playerId}`,
      type: "injury_substitution",
      minute: m,
      kicker: "🚑 Lesión",
      title: "CAMBIO POR LESIÓN",
      body: canReplaceNow
        ? `${inj.playerName} no puede continuar. El hueco queda vacío hasta que elijas tú al sustituto.`
        : `${inj.playerName} no puede continuar y no quedan cambios disponibles. El equipo seguirá con uno menos.`,
      playerName: inj.playerName,
      playerId: inj.playerId,
      teamName: mySide === "home" ? home.name : away.name,
      teamSide: mySide,
      teamLeagueName: getLeagueName(mySide === "home" ? home.league : away.league),
      emoji: "🚑",
      detail: `${inj.reason || "Lesión"}${inj.weeks ? ` · ${inj.weeks} jornada${inj.weeks > 1 ? "s" : ""} de baja` : ""}`,
      forceLineupEdit: canReplaceNow,
      hardPause: true,
    } as any;
    // Injury is a standalone live interruption.
    // Keeping the scene empty lets continueLiveMoment() route the user to the
    // live lineup editor only when a replacement is actually available.
    pendingSceneRef.current = null;
    showLiveMoment(moment, 3200);
    return true;
  }

  function playWithOneLess(playerId: string, playerName?: string) {
    // A forced injury must vacate the player's exact formation slot. Never
    // filter the XI array: doing that shifts every player after the injured
    // one to a different slot, which can later be interpreted as a different
    // substitution (e.g. Mendy for Militão instead of Mendy for Cucurella).
    const nextXI = myXIRef.current.map((id) => (id === playerId ? "" : id));
    myXIRef.current = nextXI;
    setMyXI(nextXI);

    // Keep the injured player visible in the live bench as an unavailable
    // entry. He/she is already in `gone` so the editor cannot bring them back.
    if (!myBenchRef.current.includes(playerId)) {
      myBenchRef.current = [...myBenchRef.current, playerId];
      setMyBench(myBenchRef.current);
    }

    goneRef.current = Array.from(new Set([...goneRef.current, playerId]));
    setGoneIds(goneRef.current);
    persistLive();
  }

  // ------------------------------------- chronicle consistency (played match)

  function mySideOf(fx: any): "home" | "away" {
    return fx?.homeId === (myTeamIdRef.current || save?.myTeamId) ? "home" : "away";
  }

  /** My players that are really on the pitch right now. */
  function myOnPitchPlayers(): any[] {
    return myXIRef.current.map((id) => playerById(id)).filter(Boolean) as any[];
  }

  function isGkPlayer(p: any) {
    const pos = p?.position ?? "";
    return pos === "GK" || pos === "POR";
  }

  /** Random outfield player of a pool, weighted by rating. */
  function pickCredit(pool: any[], excludeIds: string[] = []) {
    const cands = pool.filter((p) => p && !isGkPlayer(p) && !excludeIds.includes(p.id));
    if (cands.length === 0) return null;
    const weights = cands.map((p) => Math.max(1, (p.rating ?? 70) - 50));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r <= 0) return cands[i];
    }
    return cands[cands.length - 1];
  }

  /**
   * The result is simulated up front with its own substitutions, so a goal or
   * assist can end up credited to a player the manager already took off. This
   * re-credits the event to somebody actually on the pitch at that minute.
   */
  function remapEventToPitch(ev: any) {
    const fx = fixtureRef.current;
    if (!fx || !ev) return ev;
    if (ev.type === "own_goal") return { ...ev };
    const pool = ev.team === mySideOf(fx) ? myOnPitchPlayers() : oppXIRef.current;
    if (!pool || pool.length === 0) return { ...ev };
    const onPitch = new Set(pool.map((p: any) => p.id));
    let next: any = { ...ev, _origScorerId: ev.scorerId, _origAssistId: ev.assistId };
    if (next.scorerId && !onPitch.has(next.scorerId)) {
      const repl = pickCredit(pool);
      if (repl) next = { ...next, scorerId: repl.id, scorerName: repl.name };
    }
    if (next.assistId && (!onPitch.has(next.assistId) || next.assistId === next.scorerId)) {
      const repl = pickCredit(pool, [next.scorerId]);
      next = repl
        ? { ...next, assistId: repl.id, assistName: repl.name }
        : { ...next, assistId: undefined, assistName: undefined };
    }
    return next;
  }

  /** Same idea for cards: nobody off the pitch can be booked. */
  function remapCardToPitch(c: any) {
    const fx = fixtureRef.current;
    if (!fx || !c) return c;
    const pool = c.team === mySideOf(fx) ? myOnPitchPlayers() : oppXIRef.current;
    if (!pool || pool.length === 0) return { ...c };
    const onPitch = new Set(pool.map((p: any) => p.id));
    if (onPitch.has(c.playerId)) return { ...c };
    const repl = pickCredit(pool);
    return repl ? { ...c, playerId: repl.id, playerName: repl.name } : { ...c };
  }

  /** Real substitutions of the match: mine plus the rival ones already shown. */
  function buildPlayedSubstitutions() {
    const fx = fixtureRef.current;
    const mySide = mySideOf(fx);
    const mine = subsRef.current.map((s: any) => ({
      minute: s.minute,
      team: mySide,
      playerOutId: s.outId,
      playerOutName: s.outName,
      playerInId: s.inId,
      playerInName: s.inName,
    }));
    const opp = oppSubsDoneRef.current.map((s: any) => ({
      minute: s.minute,
      team: s.team,
      playerOutId: s.playerOutId,
      playerOutName: s.outName,
      playerInId: s.playerInId,
      playerInName: s.inName,
    }));
    return [...mine, ...opp].sort((a, b) => a.minute - b.minute);
  }

  function persistResultToSave(fixtureId: string, result: any) {
    const s = loadSave();
    if (!s) return;
    const next: any = { ...s };
    let changed = false;

    const patchList = (list: any[]) =>
      list.map((f: any) => {
        if (f.id !== fixtureId || !f.result) return f;
        changed = true;
        return { ...f, result };
      });

    if (next.fixtures) {
      const fixturesNext: any = {};
      for (const lg of Object.keys(next.fixtures)) {
        fixturesNext[lg] = patchList(next.fixtures[lg] || []);
      }
      next.fixtures = fixturesNext;
    }
    if (next.cupFixtures) {
      const cupNext: any = {};
      for (const lg of Object.keys(next.cupFixtures)) {
        cupNext[lg] = patchList(next.cupFixtures[lg] || []);
      }
      next.cupFixtures = cupNext;
    }
    if (next.uclFixtures) next.uclFixtures = patchList(next.uclFixtures);

    if (!changed) return;
    saveSaveWithRetry(next);
    setSave(next);
  }

  /**
   * When the match ends, the chronicle the manager just watched becomes the
   * official one: same goals, same scorers and the substitutions that really
   * happened (mine and the rival's). This is what "Jornadas" shows later.
   */
  function buildActualLivePerformance(result: any) {
    const fx = fixtureRef.current;
    if (!fx) return null;

    const myTeamId = myTeamIdRef.current || save?.myTeamId;
    const mySide: "home" | "away" = fx.homeId === myTeamId ? "home" : "away";
    const oppSide: "home" | "away" = mySide === "home" ? "away" : "home";

    const mySquad = getSimSquad(myTeamId);
    const resultInitialIds = (
      mySide === "home" ? (result.homeLineup ?? []) : (result.awayLineup ?? [])
    )
      .map((p: any) => p?.id)
      .filter(Boolean);
    const initialIds =
      initialMyXIRef.current.length > 0 ? initialMyXIRef.current : resultInitialIds;
    const myInitial = initialIds
      .map((id) => mySquad.find((p: any) => p.id === id))
      .filter(Boolean) as any[];
    const oppInitial = (oppXIRef.current || []).slice();

    const mySubs = subsRef.current.map((s: any) => ({
      minute: Number(s.minute) || 0,
      team: mySide,
      playerOutId: s.outId,
      playerInId: s.inId,
    }));
    const oppSubs = (oppSubsDoneRef.current || []).map((s: any) => ({
      minute: Number(s.minute) || 0,
      team: s.team,
      playerOutId: s.playerOutId,
      playerInId: s.playerInId,
    }));
    const substitutions = [...mySubs, ...oppSubs].sort((a, b) => a.minute - b.minute);

    const actualParticipants = (initial: any[], side: "home" | "away") => {
      const players = [...initial];
      const byId = new Map(players.map((p) => [p.id, p]));
      for (const sub of substitutions.filter((x) => x.team === side)) {
        const outIndex = players.findIndex((p) => p.id === sub.playerOutId);
        if (outIndex >= 0)
          players[outIndex] =
            byId.get(sub.playerInId) ??
            (side === mySide
              ? getSimSquad(myTeamId).find((p: any) => p.id === sub.playerInId)
              : getSimSquad(fx.homeId === myTeamId ? fx.awayId : fx.homeId).find(
                  (p: any) => p.id === sub.playerInId,
                ));
        const inPlayer = players.find((p) => p?.id === sub.playerInId);
        if (inPlayer) byId.set(inPlayer.id, inPlayer);
      }
      return players.filter(Boolean);
    };

    const homeParticipants =
      mySide === "home"
        ? actualParticipants(myInitial, "home")
        : actualParticipants(oppInitial, "home");
    const awayParticipants =
      mySide === "away"
        ? actualParticipants(myInitial, "away")
        : actualParticipants(oppInitial, "away");

    const calculateMinutes = (initial: any[], side: "home" | "away", endMinute: number) => {
      const minutes: Record<string, number> = {};
      const onPitch = new Set(initial.map((p) => p.id));
      const startAt = new Map<string, number>();
      for (const id of onPitch) startAt.set(id, 0);

      const addInterval = (id: string, end: number) => {
        const started = startAt.get(id);
        if (started === undefined) return;
        minutes[id] = (minutes[id] ?? 0) + Math.max(0, end - started);
        startAt.delete(id);
      };

      for (const sub of substitutions.filter((x) => x.team === side)) {
        if (onPitch.has(sub.playerOutId)) {
          addInterval(sub.playerOutId, sub.minute);
          onPitch.delete(sub.playerOutId);
        }
        if (!onPitch.has(sub.playerInId)) {
          onPitch.add(sub.playerInId);
          startAt.set(sub.playerInId, sub.minute);
        }
      }

      for (const card of result.cards ?? []) {
        if (card.team !== side || card.cardType !== "red") continue;
        if (onPitch.has(card.playerId)) {
          addInterval(card.playerId, Number(card.minute) || 0);
          onPitch.delete(card.playerId);
        }
      }

      for (const injury of result.injuries ?? []) {
        if (injury.team !== side || injury.minute === undefined || injury.forcedSub) continue;
        if (onPitch.has(injury.playerId)) {
          addInterval(injury.playerId, Number(injury.minute) || 0);
          onPitch.delete(injury.playerId);
        }
      }

      for (const id of onPitch) addInterval(id, endMinute);
      for (const id of new Set(
        initial.concat(homeParticipants, awayParticipants).map((p) => p.id),
      )) {
        minutes[id] = Math.max(0, Math.min(120, Math.round(minutes[id] ?? 0)));
      }
      return minutes;
    };

    const endMinute = result.extraTime ? 120 : 90;
    const minutesPlayed = {
      ...calculateMinutes(mySide === "home" ? myInitial : oppInitial, "home", endMinute),
      ...calculateMinutes(mySide === "away" ? myInitial : oppInitial, "away", endMinute),
    };

    const events = (result.events ?? []).map((e: any) => ({
      team: e.team,
      scorerId: e.scorerId,
      assistId: e.assistId,
      ownGoal: e.type === "own_goal",
    }));
    const cards = (result.cards ?? []).map((c: any) => ({
      team: c.team,
      playerId: c.playerId,
      cardType: c.cardType,
      minute: Number(c.minute) || 0,
    }));
    const homeSaves = (result.highlights ?? []).filter(
      (h: any) => h.team === "home" && h.type === "save",
    ).length;
    const awaySaves = (result.highlights ?? []).filter(
      (h: any) => h.team === "away" && h.type === "save",
    ).length;
    const totalHomeGoals = (result.homeGoals ?? 0) + (result.extraTime?.homeGoals ?? 0);
    const totalAwayGoals = (result.awayGoals ?? 0) + (result.extraTime?.awayGoals ?? 0);

    const { ratings, mvp } = computePlayerRatings({
      homeXI: homeParticipants,
      awayXI: awayParticipants,
      homeGoals: totalHomeGoals,
      awayGoals: totalAwayGoals,
      goals: events,
      cards,
      minutesPlayed,
      homeSaves,
      awaySaves,
    });

    return {
      ratings,
      mvp,
      homeParticipants,
      awayParticipants,
      minutesPlayed,
    };
  }

  function recordFinalUserPerformance(result: any) {
    if (finalPerformanceRecordedRef.current) return null;
    const fx = fixtureRef.current;
    if (!fx) return null;

    const performance = buildActualLivePerformance(result);
    if (!performance) return null;

    const myTeamId = myTeamIdRef.current || save?.myTeamId;
    const mySide: "home" | "away" = fx.homeId === myTeamId ? "home" : "away";
    const myPlayers =
      mySide === "home" ? performance.homeParticipants : performance.awayParticipants;
    const myPlayerIds = new Set(myPlayers.map((p: any) => p.id));
    const store = usePlayersStore.getState();

    for (const p of myPlayers) {
      store.recordAppearance(p.id, fx.competition, performance.minutesPlayed[p.id] ?? 0);
    }

    for (const pr of performance.ratings) {
      if (myPlayerIds.has(pr.playerId)) store.recordMatchRating(pr.playerId, pr.rating);
    }

    const finalHomeGoals = (result.homeGoals ?? 0) + (result.extraTime?.homeGoals ?? 0);
    const finalAwayGoals = (result.awayGoals ?? 0) + (result.extraTime?.awayGoals ?? 0);
    if (mySide === "home" && finalAwayGoals === 0) {
      const gk = myPlayers.find((p: any) => p.positions?.includes("GK"));
      if (gk) store.recordCleanSheet(gk.id, fx.competition);
    }
    if (mySide === "away" && finalHomeGoals === 0) {
      const gk = myPlayers.find((p: any) => p.positions?.includes("GK"));
      if (gk) store.recordCleanSheet(gk.id, fx.competition);
    }

    if (performance.mvp && myPlayerIds.has(performance.mvp.playerId)) {
      store.recordMotm(performance.mvp.playerId, fx.competition);
    }

    finalPerformanceRecordedRef.current = true;
    return performance;
  }

  function finalizePlayedChronicle() {
    const fx = fixtureRef.current;
    if (!fx?.result) return;
    const comp = fx.competition;
    const store = usePlayersStore.getState();

    for (const ev of playedEventsRef.current) {
      if (ev.type === "own_goal") continue;
      const origScorer = ev._origScorerId;
      const origAssist = ev._origAssistId;
      if (origScorer && origScorer !== ev.scorerId) {
        store.unrecordGoal(origScorer, comp);
        if (ev.scorerId) store.recordGoal(ev.scorerId, comp);
      }
      if ((origAssist ?? null) !== (ev.assistId ?? null)) {
        if (origAssist) store.unrecordAssist(origAssist, comp);
        if (ev.assistId) store.recordAssist(ev.assistId, comp);
      }
    }

    const strip = (o: any) => {
      const { _origScorerId, _origAssistId, ...rest } = o;
      return rest;
    };
    const events =
      playedEventsRef.current.length > 0
        ? playedEventsRef.current.map(strip).sort((a: any, b: any) => a.minute - b.minute)
        : fx.result.events;
    const cards =
      playedCardsRef.current.length > 0
        ? playedCardsRef.current.slice().sort((a: any, b: any) => a.minute - b.minute)
        : fx.result.cards;
    const mySide = mySideOf(fx);
    const highlights =
      playedHighlightsRef.current.length > 0
        ? playedHighlightsRef.current
            .filter((h: any) => !(h.type === "forced_sub" && h.team === mySide))
            .slice()
            .sort((a: any, b: any) => a.minute - b.minute)
        : (fx.result.highlights || []).filter(
            (h: any) => !(h.type === "forced_sub" && h.team === mySide),
          );
    const substitutions = buildPlayedSubstitutions();

    // The score shown during the live match is authoritative. Rebuilding the
    // result from the pre-simulated event array can resurrect an old score or
    // lose a live correction such as a VAR cancellation.
    const liveHomeGoals = Math.max(0, Number(homeScoreRef.current) || 0);
    const liveAwayGoals = Math.max(0, Number(awayScoreRef.current) || 0);

    setHomeScore(liveHomeGoals);
    setAwayScore(liveAwayGoals);

    const nextResult = {
      ...fx.result,
      homeGoals: liveHomeGoals,
      awayGoals: liveAwayGoals,
      events,
      cards,
      highlights,
      substitutions,
    };
    fixtureRef.current = { ...fx, result: nextResult } as any;
    allEventsRef.current = events;
    allCardsRef.current = cards;
    allHighlightsRef.current = highlights;

    const performance = recordFinalUserPerformance(nextResult);
    const finalResult = performance
      ? {
          ...nextResult,
          ratings: performance.ratings,
          mvp: performance.mvp,
          homeLineup: performance.homeParticipants,
          awayLineup: performance.awayParticipants,
        }
      : nextResult;

    fixtureRef.current = { ...fx, result: finalResult } as any;
    persistResultToSave(fx.id, finalResult);
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
    const alreadyDone = new Set(
      oppSubsDoneRef.current.map(
        (s: any) => `${s.minute}|${s.outId ?? s.playerOutId}|${s.inId ?? s.playerInId}`,
      ),
    );
    const due = oppPlanRef.current.filter(
      (s) => s.minute === m && !alreadyDone.has(`${s.minute}|${s.outId}|${s.inId}`),
    );
    if (due.length === 0) return;
    const fx = fixtureRef.current;
    if (!fx) return;
    const myId = myTeamIdRef.current || save?.myTeamId;
    const oppSide = fx.homeId === myId ? "away" : "home";
    const xi = [...oppXIRef.current];
    const made: any[] = [];
    for (const s of due) {
      // Be resilient: if the planned player is not on the pitch (or the planned
      // substitute is not on the bench any more) use a valid one instead, so the
      // rival always makes his changes.
      let idx = xi.findIndex((p: any) => p.id === s.outId);
      if (idx === -1) {
        idx = xi.findIndex((p: any) => !isGkPlayer(p));
      }
      const inn =
        oppBenchRef.current.find((p: any) => p.id === s.inId) ??
        oppBenchRef.current.find((p: any) => !isGkPlayer(p)) ??
        oppBenchRef.current[0];
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
    oppSubsDoneRef.current = [...oppSubsDoneRef.current, ...made];
    setSubFeed((prev) => [...made.slice().reverse(), ...prev]);
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

  function pushCommentary(entry: CommentaryEntry) {
    const next = [entry, ...commentaryEntriesRef.current].slice(0, 12);
    commentaryEntriesRef.current = next;
    setCommentaryEntries(next);
  }

  function showLiveMoment(moment: LiveMoment, _duration = 2200, recordKeyMoment = true) {
    // Key moments are deliberate stops: the manager must acknowledge the scene
    // before the clock is allowed to advance again.
    if (momentTimerRef.current !== null) {
      window.clearTimeout(momentTimerRef.current);
      momentTimerRef.current = null;
    }
    setLiveMoment(moment);
    if (recordKeyMoment) {
      keyMomentsRef.current = [...keyMomentsRef.current, moment].slice(-8);
      setKeyMoments(keyMomentsRef.current);
    }
    pausedRef.current = true;
    pauseReasonRef.current = "moment";
    setIsPaused(true);
    setPauseReason("moment");
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }
    persistLive();
  }

  function continueLiveMoment() {
    const scene = pendingSceneRef.current;

    if (scene?.kind === "penalty_intro") {
      const source = scene.source;
      pendingSceneRef.current = null;
      setLiveMoment(null);
      openInteractivePenaltyModal(source);
      return;
    }

    if (scene?.kind === "prelude") {
      const source = scene.source || {};
      setLiveMoment(null);
      resolveDangerScene(source);
      return;
    }

    if (scene?.kind === "resolution") {
      const currentMinute = minuteRef.current;
      const nextVar = scene.source?.nextVar;
      if (nextVar) {
        const varMoment = buildMomentFromHighlight({
          highlight: nextVar,
          homeName: home.name,
          awayName: away.name,
        });
        pendingSceneRef.current = {
          kind: "var",
          moment: {
            ...varMoment,
            id: `${varMoment.id}-review`,
            kicker: "📺 VAR",
            title: "GOL ANULADO",
            body:
              nextVar.detail ||
              `El VAR revisa la acción y anula el gol de ${scene.source?.resolvedGoal?.scorerName || "la jugada"}.`,
            emoji: "📺",
            hardPause: true,
            teamSide: nextVar.team,
            teamName: nextVar.team === "home" ? home.name : away.name,
          },
          source: {
            varHighlight: nextVar,
            goalEvent: scene.source?.resolvedGoal,
          },
        };
        setLiveMoment(pendingSceneRef.current.moment);
        persistLive();
        return;
      }

      pendingSceneRef.current = null;
      setLiveMoment(null);
      if (currentMinute === 45 && !isExtraTimeRef.current) {
        halftimePendingAfterMomentRef.current = false;
        announceHalftime(false);
        pauseMatch("halftime");
        return;
      }
      if (currentMinute >= 90 && !isExtraTimeRef.current) {
        finishRegularLiveMatch();
        return;
      }
      if (currentMinute === 105 && isExtraTimeRef.current) {
        announceHalftime(true);
        pauseMatch("et_halftime");
        return;
      }
      if (currentMinute >= 120 && isExtraTimeRef.current) {
        handleExtraTimeFinished();
        return;
      }
      pausedRef.current = false;
      pauseReasonRef.current = null;
      setIsPaused(false);
      setPauseReason(null);
      persistLive();
      restartLiveClock();
      return;
    }

    if (scene?.kind === "var") {
      cancelGoalForVAR(scene.source);
      pendingSceneRef.current = null;
      setLiveMoment(null);
      const currentMinute = minuteRef.current;
      if (currentMinute >= 90 && !isExtraTimeRef.current) {
        finishRegularLiveMatch();
        return;
      }
      if (currentMinute === 45 && !isExtraTimeRef.current) {
        pauseMatch("halftime");
        return;
      }
      pausedRef.current = false;
      pauseReasonRef.current = null;
      setIsPaused(false);
      setPauseReason(null);
      persistLive();
      restartLiveClock();
      return;
    }

    if (!liveMoment) return;
    const currentMinute = minuteRef.current;
    const wasUserInjury =
      ["injury", "injury_substitution"].includes(liveMoment.type) &&
      liveMoment.teamSide === mySideOf(fixtureRef.current);
    const shouldOpenLineupForInjury =
      wasUserInjury && (liveMoment as any).forceLineupEdit !== false;
    setLiveMoment(null);
    pendingSceneRef.current = null;
    if (momentTimerRef.current !== null) {
      window.clearTimeout(momentTimerRef.current);
      momentTimerRef.current = null;
    }

    if (shouldOpenLineupForInjury) {
      goEditLineupLive();
      return;
    }

    if (currentMinute >= 90 && !isExtraTimeRef.current) {
      finishRegularLiveMatch();
      return;
    }

    if (halftimePendingAfterMomentRef.current && currentMinute === 45) {
      halftimePendingAfterMomentRef.current = false;
      pauseMatch("halftime");
      return;
    }

    pausedRef.current = false;
    pauseReasonRef.current = null;
    setIsPaused(false);
    setPauseReason(null);
    persistLive();
    restartLiveClock();
  }

  function registerMomentum(next: number, m: number) {
    momentumRef.current = next;
    setMomentum(next);
    const point = { minute: m, value: next };
    momentumHistoryRef.current = [...momentumHistoryRef.current, point].slice(-91);
    setMomentumHistory(momentumHistoryRef.current);
  }

  function currentAvgStamina() {
    const values = myXIRef.current.map((id) => staminaRef.current[id] ?? STAMINA_START);
    return averageNumbers(values);
  }

  function pushContextualNarrative(m: number, decisionApplied: string | null = null) {
    const fx = fixtureRef.current;
    if (!fx) return;
    const myId = myTeamIdRef.current || save?.myTeamId;
    const mySide: "home" | "away" = fx.homeId === myId ? "home" : "away";
    const userTeam = mySide === "home" ? teamById(fx.homeId) : teamById(fx.awayId);
    const opponentTeam = mySide === "home" ? teamById(fx.awayId) : teamById(fx.homeId);
    if (!userTeam || !opponentTeam) return;

    const recentEvents = playedEventsRef.current.filter((e) => e.minute >= m - 8 && e.minute <= m);
    const recentHighlights = playedHighlightsRef.current.filter(
      (h) => h.minute >= m - 8 && h.minute <= m,
    );
    const recentSubs = [
      ...subsRef.current.map((x: any) => ({ ...x, team: mySide })),
      ...(oppSubsDoneRef.current || []),
    ].filter((x: any) => x.minute >= m - 8 && x.minute <= m);

    const entry = buildNarrativeCommentary({
      minute: m,
      userTeamName: userTeam.name,
      opponentName: opponentTeam.name,
      momentum: momentumRef.current,
      homeScore: homeScoreRef.current,
      awayScore: awayScoreRef.current,
      userSide: mySide,
      recentEvents,
      recentHighlights,
      recentSubs,
      decisionApplied,
      recentNarratives: commentaryEntriesRef.current,
    });
    // Generic tactical narration is not tied to a footballer. Do not attach a
    // random face merely because another event happened in the same time window.
    // Player faces are reserved for comments explicitly generated about that player.
    pushCommentary({
      ...entry,
      playerId: entry.playerId,
      playerName: entry.playerName,
      teamSide: entry.teamSide,
    });
  }

  function getCurrentPitchPlayers(team: "home" | "away") {
    const myId = myTeamIdRef.current || save?.myTeamId;
    const mySide: "home" | "away" = fixtureRef.current?.homeId === myId ? "home" : "away";
    return team === mySide
      ? myXIRef.current.map((id) => playerById(id)).filter(Boolean)
      : oppXIRef.current;
  }

  function openInteractivePenaltyModal(source: any) {
    const fx = fixtureRef.current;
    if (!fx) return;
    const myId = myTeamIdRef.current || save?.myTeamId;
    const mySide: "home" | "away" = fx.homeId === myId ? "home" : "away";
    const attackingPlayers = (getCurrentPitchPlayers(source.team) as any[]).filter(
      (p) => p && !p.positions?.includes("GK"),
    );
    const tactics = loadTactics(myId || "");
    const designatedId = source.team === mySide ? tactics.penaltyTakerId : null;
    const bestPenaltyTaker = attackingPlayers
      .slice()
      .sort(
        (a, b) =>
          Number(b.penaltyRating ?? b.penalties ?? b.rating ?? 0) -
          Number(a.penaltyRating ?? a.penalties ?? a.rating ?? 0) ||
          Number(b.rating ?? 0) - Number(a.rating ?? 0),
      )[0];
    const preferred =
      attackingPlayers.find((p) => p.id === designatedId) ??
      (source.team === mySide ? attackingPlayers.find((p) => p.id === source.scorerId) : null) ??
      bestPenaltyTaker;
    const defendingPlayers = getCurrentPitchPlayers(
      source.team === "home" ? "away" : "home",
    ) as any[];
    const keeper = defendingPlayers.find((p) => p?.positions?.includes("GK"));
    const attacking = source.team === mySide;

    pendingPenaltySourceRef.current = source;
    if ((Number(source.minute) || minuteRef.current) === 45)
      halftimePendingAfterMomentRef.current = true;
    pendingPenaltyZoneRef.current = null;
    setPendingPenalty({
      minute: Number(source.minute) || minuteRef.current,
      teamName:
        source.team === "home"
          ? (fx.homeTeam?.name ?? "Local")
          : (fx.awayTeam?.name ?? "Visitante"),
      attacking,
      takerId: preferred?.id,
      takerName: preferred?.name,
      keeperName: keeper?.name,
      keeperId: keeper?.id,
      teamLeagueName:
        source.team === "home"
          ? getLeagueName(fx.homeTeam?.league ?? home.league)
          : getLeagueName(fx.awayTeam?.league ?? away.league),
      takerRating: preferred?.penaltyRating ?? preferred?.penalties ?? preferred?.rating,
      keeperRating: keeper?.rating,
      baselineScored: source.type === "penalty_goal",
      detail: source.detail,
    });
    pausedRef.current = true;
    pauseReasonRef.current = "penalty";
    setIsPaused(true);
    setPauseReason("penalty");
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }
  }

  function queueInteractivePenalty(source: any) {
    const fx = fixtureRef.current;
    if (!fx) return;
    const attacking = source.team === mySideOf(fx);
    const teamName = source.team === "home" ? home.name : away.name;
    const kickerName = source.scorerName || (attacking ? "El lanzador" : "El rival");
    const intro: any = {
      id: `penalty-intro-${source.minute}-${source.team}-${source.scorerId || "unknown"}`,
      type: "penalty_intro",
      minute: Number(source.minute) || minuteRef.current,
      kicker: "🚨 Penalti",
      title: "PENALTI",
      body: attacking
        ? `${kickerName} se prepara desde los once metros. Esta vez tú decides dónde colocarlo.`
        : `${teamName} se prepara para lanzar. Lee el momento y decide dónde quieres lanzarte.`,
      playerName: kickerName,
      playerId: source.scorerId || undefined,
      teamName,
      teamLeagueName:
        source.team === "home"
          ? getLeagueName(fx.homeTeam?.league ?? home.league)
          : getLeagueName(fx.awayTeam?.league ?? away.league),
      emoji: "🚨",
      detail: attacking
        ? "Cinco zonas. Un instante para decidir."
        : "Elige una de las cinco zonas e intenta adivinar al lanzador.",
      hardPause: true,
      teamSide: source.team,
    };
    pendingPenaltySourceRef.current = source;
    pendingSceneRef.current = { kind: "penalty_intro", moment: intro, source };
    if ((Number(source.minute) || minuteRef.current) === 45)
      halftimePendingAfterMomentRef.current = true;
    showLiveMoment(intro, 2200, false);
  }

  function weightedPenaltyZone(weights: Record<PenaltyZoneId, number>): PenaltyZoneId {
    const entries = Object.entries(weights) as [PenaltyZoneId, number][];
    const total = entries.reduce((sum, [, weight]) => sum + Math.max(0.01, weight), 0);
    let roll = Math.random() * total;
    for (const [id, weight] of entries) {
      roll -= Math.max(0.01, weight);
      if (roll <= 0) return id;
    }
    return entries[entries.length - 1]?.[0] ?? "center";
  }

  function penaltyZoneLabel(zone: PenaltyZoneId) {
    return {
      "top-left": "arriba izquierda",
      "top-right": "arriba derecha",
      center: "centro",
      "bottom-left": "abajo izquierda",
      "bottom-right": "abajo derecha",
    }[zone];
  }

  function resolveInteractivePenalty(zoneId: PenaltyZoneId) {
    const pending = pendingPenalty;
    const source = pendingPenaltySourceRef.current;
    const fx = fixtureRef.current;
    if (!pending || !source || !fx || pending.resolution) return;

    const attackingSide = source.team as "home" | "away";
    const attackingPlayers = getCurrentPitchPlayers(attackingSide) as any[];
    const selected =
      attackingPlayers.find((p) => p.id === pending.takerId) ??
      attackingPlayers
        .filter((p) => p && !p.positions?.includes("GK"))
        .slice()
        .sort(
          (a, b) =>
            Number(b.penaltyRating ?? b.penalties ?? b.rating ?? 0) -
            Number(a.penaltyRating ?? a.penalties ?? a.rating ?? 0),
        )[0];
    const defendingPlayers = getCurrentPitchPlayers(
      attackingSide === "home" ? "away" : "home",
    ) as any[];
    const keeper = defendingPlayers.find((p) => p?.positions?.includes("GK"));

    const takerRating = Number(selected?.penaltyRating ?? selected?.penalties ?? selected?.rating ?? 74);
    const keeperRating = Number(keeper?.rating ?? 72);
    const baselineBias = pending.baselineScored ? 0.02 : -0.015;
    const zoneDifficulty: Record<PenaltyZoneId, number> = {
      "top-left": 0.09,
      "top-right": 0.09,
      center: -0.11,
      "bottom-left": 0.08,
      "bottom-right": 0.08,
    };

    const keeperWeights: Record<PenaltyZoneId, number> = {
      "top-left": 1.08,
      "top-right": 1.08,
      center: 0.9,
      "bottom-left": 1.2,
      "bottom-right": 1.2,
    };
    const strikerWeights: Record<PenaltyZoneId, number> = {
      "top-left": 1.15,
      "top-right": 1.15,
      center: 0.68,
      "bottom-left": 1.08,
      "bottom-right": 1.08,
    };

    let scored = false;
    let actualTargetZone: PenaltyZoneId;
    if (pending.attacking) {
      // The user's shot is fixed by the clicked cell; the keeper independently
      // chooses a dive cell so the result explains exactly what happened.
      actualTargetZone = weightedPenaltyZone(keeperWeights);
      const keeperGuessed = actualTargetZone === zoneId;
      const accuracy = (takerRating - 70) * 0.006 + baselineBias;
      const keeperFactor = (keeperRating - 75) * 0.0032;
      const chance = Math.max(
        0.48,
        Math.min(
          0.965,
          0.78 + accuracy + zoneDifficulty[zoneId] - keeperFactor - (keeperGuessed ? 0.31 : 0),
        ),
      );
      scored = Math.random() < chance;
    } else {
      // The CPU striker secretly chooses one of the five cells; the manager
      // only controls the goalkeeper's dive.
      actualTargetZone = weightedPenaltyZone(strikerWeights);
      const guessed = actualTargetZone === zoneId;
      const reflex = (keeperRating - 72) * 0.006;
      const strikerQuality = (takerRating - 74) * 0.004;
      const saveChance = Math.max(
        0.07,
        Math.min(
          0.78,
          0.11 + reflex - strikerQuality + (guessed ? 0.52 : 0.02) - zoneDifficulty[actualTargetZone] * 0.35,
        ),
      );
      scored = Math.random() >= saveChance;
    }

    pendingPenaltyZoneRef.current = zoneId;
    const playerName = selected?.name ?? pending.takerName ?? source.scorerName ?? "Lanzador";
    const finalEvent: any = {
      minute: Number(source.minute) || minuteRef.current,
      team: attackingSide,
      type: "penalty_goal",
      scorerId: selected?.id ?? source.scorerId,
      scorerName: playerName,
      detail: source.detail || "Penalti",
    };

    const correctedResult: any = { ...fx.result };
    let correctedEvents = [...(correctedResult.events || [])];
    let correctedHighlights = [...(correctedResult.highlights || [])];
    correctedEvents = correctedEvents.filter((e: any) => e !== source);
    correctedHighlights = correctedHighlights.filter((h: any) => h !== source);

    if (scored) {
      playedEventsRef.current = [...playedEventsRef.current, finalEvent];
      setFeed((prev) => [finalEvent, ...prev]);
      correctedEvents.push(finalEvent);
      if (attackingSide === "home") {
        homeScoreRef.current += 1;
        setHomeScore(homeScoreRef.current);
      } else {
        awayScoreRef.current += 1;
        setAwayScore(awayScoreRef.current);
      }
    } else {
      const missHighlight: any = {
        minute: Number(source.minute) || minuteRef.current,
        team: attackingSide,
        type: "penalty_missed",
        playerId: selected?.id ?? source.scorerId,
        playerName,
        detail: pending.attacking
          ? `El portero se lanza a ${penaltyZoneLabel(actualTargetZone)} y evita el gol.`
          : `${playerName} tira a ${penaltyZoneLabel(actualTargetZone)} y el portero lo detiene.`,
      };
      playedHighlightsRef.current = [...playedHighlightsRef.current, missHighlight];
      setHighlightFeed((prev) => [missHighlight, ...prev]);
      correctedHighlights.push(missHighlight);
    }

    correctedResult.events = correctedEvents.sort((a: any, b: any) => a.minute - b.minute);
    correctedResult.highlights = correctedHighlights.sort((a: any, b: any) => a.minute - b.minute);
    correctedResult.homeGoals = homeScoreRef.current;
    correctedResult.awayGoals = awayScoreRef.current;
    fixtureRef.current = { ...fx, result: correctedResult } as any;
    allEventsRef.current = correctedResult.events;
    allHighlightsRef.current = correctedResult.highlights;

    const success = pending.attacking ? scored : !scored;
    applyLiveMomentumForResolvedAction(
      Number(source.minute) || minuteRef.current,
      scored ? [finalEvent] : [],
      [],
      scored ? [] : [
        {
          minute: Number(source.minute) || minuteRef.current,
          team: attackingSide,
          type: "penalty_missed",
          playerId: selected?.id ?? source.scorerId,
          playerName: playerName,
          detail: pending.attacking
            ? `El portero evita el lanzamiento en ${penaltyZoneLabel(actualTargetZone)}.`
            : `${playerName} lanza a ${penaltyZoneLabel(actualTargetZone)} y el portero detiene el penalti.`,
        },
      ],
    );
    const resolution = {
      success,
      selectedZone: zoneId,
      actualTargetZone,
      label: pending.attacking
        ? scored
          ? "¡GOOOL!"
          : "¡PARADA DEL PORTERO!"
        : !scored
          ? "¡PENALTI PARADO!"
          : "¡GOL! NO LO HAS PARADO",
      detail: pending.attacking
        ? `El portero se lanzó a ${penaltyZoneLabel(actualTargetZone)}.`
        : `${playerName} tiró a ${penaltyZoneLabel(actualTargetZone)}.`,
    } satisfies PendingPenalty["resolution"];

    setPendingPenalty((current) => (current ? { ...current, resolution } : current));
    persistLive();
  }

  function continueInteractivePenalty() {
    const source = pendingPenaltySourceRef.current;
    pendingPenaltySourceRef.current = null;
    pendingPenaltyZoneRef.current = null;
    setPendingPenalty(null);
    pendingSceneRef.current = null;
    const currentMinute = minuteRef.current;
    if (currentMinute >= 90 && !isExtraTimeRef.current) {
      finishRegularLiveMatch();
      return;
    }
    if (currentMinute === 45 && !isExtraTimeRef.current) {
      pauseMatch("halftime");
      return;
    }
    pausedRef.current = false;
    pauseReasonRef.current = null;
    setIsPaused(false);
    setPauseReason(null);
    if (source) persistLive();
    restartLiveClock();
  }

  /** A manager order can tip one real upcoming moment without inventing football from thin air. */
  function applyDecisionToUpcomingFootball(effects: any) {
    const fx = fixtureRef.current;
    if (!fx?.result) return;
    const myId = myTeamIdRef.current || save?.myTeamId;
    const mySide: "home" | "away" = fx.homeId === myId ? "home" : "away";
    const attackPush = Number(effects.attack ?? 1) - 1;
    const counterPush = Number(effects.counter ?? 1) - 1;
    const defensePush = Number(effects.defense ?? 1) - 1;
    const staminaCost = Number(effects.staminaMultiplier ?? 1) - 1;
    const riskPush = Number(effects.risk ?? 0) / 100;
    const delta =
      attackPush * 1.15 +
      counterPush * 0.65 -
      defensePush * 0.95 +
      riskPush * 0.35 -
      staminaCost * 0.45;
    outcomeBiasRef.current = Math.max(-0.45, Math.min(0.45, outcomeBiasRef.current + delta));
    const bias = outcomeBiasRef.current;
    const minute = minuteRef.current;
    const futureEnd = Math.min(90, minute + 20);
    if (Math.abs(bias) < 0.035) return;

    const events = [...(allEventsRef.current || [])];
    const highlights = [...(allHighlightsRef.current || [])];
    const isGoal = (type: any) => ["goal", "free_kick_goal", "own_goal"].includes(type);

    if (bias > 0 && Math.random() < Math.min(0.84, 0.28 + bias * 0.95)) {
      const candidate = highlights.find(
        (h: any) =>
          h.minute > minute &&
          h.minute <= futureEnd &&
          h.team === mySide &&
          h.type === "big_chance" &&
          !events.some((e: any) => e.minute === h.minute && isGoal(e.type)),
      );
      if (candidate) {
        const goal: any = {
          minute: candidate.minute,
          team: mySide,
          type: "goal",
          scorerId: candidate.playerId,
          scorerName: candidate.playerName,
          detail: "La orden acelera la jugada y la gran ocasión se convierte en gol.",
        };
        allEventsRef.current = [...events.filter((e: any) => e !== candidate), goal].sort(
          (a: any, b: any) => a.minute - b.minute,
        );
        allHighlightsRef.current = highlights.filter((h: any) => h !== candidate);
        fixtureRef.current = {
          ...fx,
          result: {
            ...fx.result,
            events: allEventsRef.current,
            highlights: allHighlightsRef.current,
          },
        } as any;
        outcomeBiasRef.current *= 0.35;
        return;
      }
    }

    if (bias < 0 && Math.random() < Math.min(0.8, 0.25 + Math.abs(bias) * 0.9)) {
      const candidate = events.find(
        (e: any) =>
          e.minute > minute &&
          e.minute <= futureEnd &&
          e.team !== mySide &&
          ["goal", "free_kick_goal", "own_goal"].includes(e.type),
      );
      if (candidate) {
        const chance: any = {
          minute: candidate.minute,
          team: candidate.team,
          type: "big_chance",
          playerId: candidate.scorerId,
          playerName: candidate.scorerName,
          detail: "El ajuste defensivo evita el golpe definitivo, pero el susto sigue ahí.",
        };
        allEventsRef.current = events.filter((e: any) => e !== candidate);
        allHighlightsRef.current = [...highlights, chance].sort(
          (a: any, b: any) => a.minute - b.minute,
        );
        fixtureRef.current = {
          ...fx,
          result: {
            ...fx.result,
            events: allEventsRef.current,
            highlights: allHighlightsRef.current,
          },
        } as any;
        outcomeBiasRef.current *= 0.35;
      }
    }
  }

  function applyMinuteOutcome(m: number, rawEvents: any[], rawCards: any[], rawHighlights: any[]) {
    const events = rawEvents.map(remapEventToPitch);
    const cards = rawCards.map(remapCardToPitch);
    const hls = rawHighlights.filter(
      (h: any) => !["penalty_missed", "forced_sub"].includes(h.type),
    );

    if (hls.length > 0) {
      playedHighlightsRef.current = [...playedHighlightsRef.current, ...hls];
      setHighlightFeed((prev) => [...hls, ...prev]);
    }
    if (events.length > 0) {
      playedEventsRef.current = [...playedEventsRef.current, ...events];
      setFeed((prev) => [...events, ...prev]);
      for (const ev of events) {
        if (!["goal", "penalty_goal", "free_kick_goal", "own_goal"].includes(ev.type)) continue;
        if (ev.team === "home") {
          homeScoreRef.current += 1;
          setHomeScore(homeScoreRef.current);
        } else {
          awayScoreRef.current += 1;
          setAwayScore(awayScoreRef.current);
        }
      }
    }
    if (cards.length > 0) {
      playedCardsRef.current = [...playedCardsRef.current, ...cards];
      setCardFeed((prev) => [...cards, ...prev]);
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
    applyOpponentSubsAt(m);
    return { events, cards, hls };
  }

  function getDangerAttacker(side: "home" | "away", preferredId?: string) {
    const players = (getCurrentPitchPlayers(side) as any[]).filter(
      (p) => p && Array.isArray(p.positions) && !p.positions.includes("GK"),
    );
    if (!players.length) return undefined;

    const recent = recentDangerAttackersRef.current[side] ?? [];
    const positionWeight = (positions: any[]) => {
      if (positions.some((p) => p === "DC")) return 6.5;
      if (positions.some((p) => p === "ED" || p === "EI")) return 5.4;
      if (positions.some((p) => p === "MCO")) return 3.8;
      if (positions.some((p) => p === "MD" || p === "MI" || p === "MC")) return 2.4;
      if (positions.some((p) => p === "MCD")) return 1.8;
      if (positions.some((p) => p === "LD" || p === "LI")) return 1.0;
      return 0.65;
    };

    const weighted = players.map((p) => {
      const role = positionWeight(p.positions);
      const rating = Math.max(0.55, Number(p.rating ?? 70) / 75);
      const formValues = Array.isArray(p.formHistory) ? p.formHistory : [];
      const form = formValues.length
        ? 0.75 + (formValues.reduce((a: number, b: number) => a + Number(b || 0), 0) / formValues.length) / 10 * 0.5
        : 1;
      const preferredBoost = p.id === preferredId ? 1.55 : 1;
      const repeatPenalty = recent.includes(p.id)
        ? (recent[recent.length - 1] === p.id ? 0.18 : 0.48)
        : 1;
      const energy = Math.max(0.72, Math.min(1.08, Number(staminaRef.current[p.id] ?? STAMINA_START) / STAMINA_START + 0.15));
      return { player: p, weight: role * rating * form * preferredBoost * repeatPenalty * energy };
    });

    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * Math.max(0.001, total);
    let selected = weighted[weighted.length - 1].player;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) {
        selected = item.player;
        break;
      }
    }
    recentDangerAttackersRef.current[side] = [...recent.slice(-3), selected.id].slice(-4);
    return selected;
  }

  function getDangerKeeper(side: "home" | "away") {
    return (getCurrentPitchPlayers(side) as any[]).find((p) => p?.positions?.includes("GK"));
  }

  function projectedOpponentStamina(side: "home" | "away", minute: number) {
    const teamId = side === "home" ? fixtureRef.current?.homeId : fixtureRef.current?.awayId;
    const tactics = teamId ? loadTactics(teamId) : null;
    const pressure = tactics?.pressure ?? "medium";
    const staminaMultiplier = tacticsModifiers(tactics).stamina;
    const squad = getCurrentPitchPlayers(side) as any[];
    if (!squad.length) return STAMINA_START;
    return averageNumbers(
      squad.map((p) =>
        Math.max(
          0,
          STAMINA_START -
            minute * drainPerMinute(p?.positions?.[0] ?? "MC", pressure, staminaMultiplier),
        ),
      ),
    );
  }

  function currentSideStamina(side: "home" | "away", minute: number) {
    if (side === mySideOf(fixtureRef.current)) return currentAvgStamina();
    return projectedOpponentStamina(side, minute);
  }

  /**
   * A pre-simulated goal is still subject to the actual match context when the
   * live chronicle reaches it. Ratings, current energy, momentum and tactics
   * can make a clear chance stand or disappear, while the underlying result
   * remains recognisably realistic instead of becoming arcade-like.
   */
  function goalStandsInLiveContext(
    team: "home" | "away",
    minute: number,
    preferredScorerId?: string,
  ) {
    const fx = fixtureRef.current;
    if (!fx) return true;
    const defending = team === "home" ? "away" : "home";
    const attackingPlayers = (getCurrentPitchPlayers(team) as any[]).filter(Boolean);
    const defendingPlayers = (getCurrentPitchPlayers(defending) as any[]).filter(Boolean);
    if (!attackingPlayers.length || !defendingPlayers.length) return true;

    const listedAttacker = getDangerAttacker(team, preferredScorerId);
    const teamAttackRating = averageNumbers(attackingPlayers.map((p) => Number(p.rating ?? 70)));
    const attackRating = listedAttacker
      ? teamAttackRating * 0.65 + Number(listedAttacker.rating ?? 70) * 0.35
      : teamAttackRating;
    const defenseRating = averageNumbers(defendingPlayers.map((p) => Number(p.rating ?? 70)));
    const attackEnergy = currentSideStamina(team, minute);
    const defenseEnergy = currentSideStamina(defending, minute);
    const mySide = mySideOf(fx);
    const teamMomentum = team === mySide ? momentumRef.current : 100 - momentumRef.current;
    const teamId = team === "home" ? fx.homeId : fx.awayId;
    const tactics = loadTactics(teamId);
    const mods = tacticsModifiers(tactics);
    const styleEdge = (mods.attack - mods.defense) * 0.8;
    const ratingEdge = (attackRating - defenseRating) * 0.004;
    const energyEdge = (attackEnergy - defenseEnergy) * 0.0025;
    const momentumEdge = (teamMomentum - 50) * 0.0028;
    const chance = Math.max(
      0.55,
      Math.min(0.97, 0.78 + ratingEdge + energyEdge + momentumEdge + styleEdge),
    );
    return Math.random() < chance;
  }

  function applyLiveMomentumForResolvedAction(
    minute: number,
    events: any[],
    cards: any[],
    highlights: any[],
  ) {
    const fx = fixtureRef.current;
    if (!fx) return;
    const mySide = mySideOf(fx);
    const nextMomentum = updateMomentum({
      previous: momentumRef.current,
      minute,
      userSide: mySide,
      homeScore: homeScoreRef.current,
      awayScore: awayScoreRef.current,
      events: events as any,
      cards: cards as any,
      highlights: highlights as any,
      managerEffects: managerEffectsRef.current,
      timeline: fx.result?.stats?.timeline ?? [],
      avgUserStamina: currentAvgStamina(),
    });
    registerMomentum(nextMomentum, minute);
  }

  function cancelGoalForVAR(source: any) {
    const fx = fixtureRef.current;
    const goal = source?.goalEvent;
    const varHighlight = source?.varHighlight;
    if (!fx || !goal) return;

    const sameGoal = (ev: any) =>
      ev &&
      ev.minute === goal.minute &&
      ev.team === goal.team &&
      ev.scorerId === goal.scorerId &&
      ["goal", "free_kick_goal", "penalty_goal", "own_goal"].includes(ev.type);

    playedEventsRef.current = playedEventsRef.current.filter((ev: any) => !sameGoal(ev));
    setFeed((prev) => prev.filter((ev: any) => !sameGoal(ev)));

    if (goal.team === "home") {
      homeScoreRef.current = Math.max(0, homeScoreRef.current - 1);
      setHomeScore(homeScoreRef.current);
    } else {
      awayScoreRef.current = Math.max(0, awayScoreRef.current - 1);
      setAwayScore(awayScoreRef.current);
    }

    if (varHighlight) {
      playedHighlightsRef.current = [
        ...playedHighlightsRef.current.filter(
          (h: any) =>
            !(h.type === "var_disallowed" &&
              h.minute === varHighlight.minute &&
              h.team === varHighlight.team &&
              h.playerId === varHighlight.playerId),
        ),
        varHighlight,
      ];
      setHighlightFeed((prev) => [
        varHighlight,
        ...prev.filter(
          (h: any) =>
            !(h.type === "var_disallowed" &&
              h.minute === varHighlight.minute &&
              h.team === varHighlight.team &&
              h.playerId === varHighlight.playerId),
        ),
      ]);
    }

    allEventsRef.current = (allEventsRef.current || []).filter((ev: any) => !sameGoal(ev));
    allHighlightsRef.current = (allHighlightsRef.current || []).filter(
      (h: any) =>
        !(h.type === "var_disallowed" &&
          h.minute === varHighlight?.minute &&
          h.team === varHighlight?.team &&
          h.playerId === varHighlight?.playerId),
    );
    if (varHighlight && !allHighlightsRef.current.includes(varHighlight)) {
      allHighlightsRef.current = [...allHighlightsRef.current, varHighlight].sort(
        (a: any, b: any) => a.minute - b.minute,
      );
    }

    fixtureRef.current = {
      ...fx,
      result: {
        ...fx.result,
        homeGoals: homeScoreRef.current,
        awayGoals: awayScoreRef.current,
        events: allEventsRef.current,
        highlights: allHighlightsRef.current,
      },
    } as any;

    if (varHighlight) {
      applyLiveMomentumForResolvedAction(Number(goal.minute) || minuteRef.current, [], [], [varHighlight]);
    }

    pushCommentary({
      id: `var-cancel-${goal.minute}-${goal.scorerId}`,
      minute: Number(goal.minute) || minuteRef.current,
      tone: "dramatic",
      text: `${goal.scorerName} había puesto el ${goal.team === "home" ? home.name : away.name}, pero el VAR anula la acción. El marcador vuelve atrás.`,
    });
  }

  function resolveDangerScene(source: any) {
    const fx = fixtureRef.current;
    if (!fx) return;
    const minute = Number(source.minute) || minuteRef.current;
    const rawGoal = source.rawEvents?.find((e: any) =>
      ["goal", "free_kick_goal", "own_goal", "penalty_goal"].includes(e.type),
    );
    const keyHighlight = source.rawHighlights?.find((h: any) =>
      ["save", "woodwork", "big_chance", "penalty_awarded"].includes(h.type),
    );
    const varDecision = source.rawHighlights?.find((h: any) => h.type === "var_disallowed");
    const syntheticVarGoal = !rawGoal && varDecision
      ? {
          minute,
          team: varDecision.team as "home" | "away",
          type: "goal",
          scorerId: varDecision.playerId,
          scorerName: varDecision.playerName,
          detail: "Gol posteriormente revisado por el VAR.",
        }
      : null;
    const goal = rawGoal ?? syntheticVarGoal;

    if (goal) {
      const resolvedGoal = goal.type === "own_goal"
        ? (() => {
            const defendingSide = goal.team === "home" ? "away" : "home";
            const defenders = (getCurrentPitchPlayers(defendingSide) as any[]).filter(Boolean);
            const original = defenders.find((p) => p.id === goal.scorerId);
            const defensivePool = defenders.filter(
              (p) => Array.isArray(p.positions) && (
                p.positions.some((pos: string) => ["DFC", "LD", "LI"].includes(pos)) ||
                p.positions.includes("GK")
              ),
            );
            const ownGoalPlayer = original ?? defensivePool[0] ?? defenders[0];
            return {
              ...goal,
              scorerId: ownGoalPlayer?.id ?? goal.scorerId,
              scorerName: ownGoalPlayer?.name ?? goal.scorerName,
            };
          })()
        : (() => {
            const attacker = getDangerAttacker(goal.team, goal.scorerId);
            return {
              ...goal,
              _origScorerId: goal.scorerId,
              _origAssistId: goal.assistId,
              scorerId: attacker?.id ?? goal.scorerId,
              scorerName: attacker?.name ?? goal.scorerName,
            };
          })();

      // The VAR-generated goal is intentionally shown first. Only its final
      // decision determines whether it remains in the official chronicle.
      const stays = varDecision
        ? true
        : goalStandsInLiveContext(goal.team, minute, goal.scorerId);
      if (!stays) {
        allEventsRef.current = (allEventsRef.current || []).filter((e: any) => e !== goal);
        if (fixtureRef.current?.result) {
          fixtureRef.current = {
            ...fixtureRef.current,
            result: { ...fixtureRef.current.result, events: allEventsRef.current },
          } as any;
        }
        const missHighlight = {
          minute,
          team: goal.team,
          type: "big_chance",
          playerId: resolvedGoal.scorerId,
          playerName: resolvedGoal.scorerName,
          detail: "El remate parecía gol, pero el contexto del partido termina frenando la ocasión.",
        };
        const applied = applyMinuteOutcome(minute, [], source.rawCards || [], [missHighlight]);
        applyLiveMomentumForResolvedAction(minute, applied.events, applied.cards, applied.hls);
        const resolution = buildMomentFromHighlight({
          highlight: applied.hls[0] ?? missHighlight,
          homeName: home.name,
          awayName: away.name,
        });
        pendingSceneRef.current = { kind: "resolution", moment: resolution, source: { minute } };
        setLiveMoment(resolution);
        persistLive();
        return;
      }

      const applied = applyMinuteOutcome(minute, [resolvedGoal], source.rawCards || [], []);
      const finalGoal = applied.events[0] ?? resolvedGoal;
      if (!varDecision) {
        applyLiveMomentumForResolvedAction(minute, applied.events, applied.cards, applied.hls);
      }
      const resolution = buildMomentFromEvent({
        event: finalGoal,
        homeName: home.name,
        awayName: away.name,
      });
      pendingSceneRef.current = {
        kind: "resolution",
        moment: resolution,
        source: {
          minute,
          resolvedGoal: finalGoal,
          nextVar: varDecision,
        },
      };
      setLiveMoment(resolution);
      persistLive();
      return;
    }

    if (keyHighlight) {
      if (keyHighlight.type === "penalty_awarded") {
        queueInteractivePenalty({ ...keyHighlight, type: "penalty_awarded" });
        return;
      }
      const applied = applyMinuteOutcome(minute, [], source.rawCards || [], [keyHighlight]);
      applyLiveMomentumForResolvedAction(minute, applied.events, applied.cards, applied.hls);
      const h = applied.hls[0] ?? keyHighlight;
      const resolution = buildMomentFromHighlight({
        highlight: h,
        homeName: home.name,
        awayName: away.name,
      });
      pendingSceneRef.current = {
        kind: "resolution",
        moment: resolution,
        source: { minute },
      };
      setLiveMoment(resolution);
      persistLive();
      return;
    }

    // No resolvable action: continue the regular match clock.
    pendingSceneRef.current = null;
    pausedRef.current = false;
    pauseReasonRef.current = null;
    setIsPaused(false);
    setPauseReason(null);
    persistLive();
    restartLiveClock();
  }

  function stageDangerBeforeResolution(
    m: number,
    rawEvents: any[],
    rawCards: any[],
    rawHighlights: any[],
  ) {
    const fx = fixtureRef.current;
    if (!fx) return false;

    const goal = rawEvents.find((e: any) =>
      ["goal", "free_kick_goal", "own_goal", "penalty_goal"].includes(e.type),
    ) ?? (() => {
      const varHighlight = rawHighlights.find((h: any) => h.type === "var_disallowed");
      return varHighlight
        ? {
            minute: m,
            team: varHighlight.team,
            type: "goal",
            scorerId: varHighlight.playerId,
            scorerName: varHighlight.playerName,
            detail: "Gol pendiente de revisión VAR.",
          }
        : null;
    })();
    const keyHighlight = !goal
      ? rawHighlights.find(
          (h: any) =>
            ["save", "woodwork", "big_chance", "penalty_awarded", "var_disallowed"].includes(h.type),
        )
      : null;
    if (!goal && !keyHighlight) return false;

    // The attacking protagonist must always come from the attacking side. A
    // save highlight is intentionally stored on the defending team because the
    // goalkeeper made the save, so the danger prelude must use the opposite side.
    const attackingSide = (goal?.team ??
      (keyHighlight?.type === "save"
        ? keyHighlight.team === "home"
          ? "away"
          : "home"
        : keyHighlight?.team)) as "home" | "away";

    let dangerBase: any;
    if (goal) {
      // The danger prelude needs an attacking protagonist from the team that
      // receives the goal. With an own goal, however, the actual scorer is a
      // player from the opposite team, so that player is only revealed in the
      // resolution and must never replace the attacking protagonist here.
      const attacker = getDangerAttacker(goal.team, goal.type === "own_goal" ? undefined : goal.scorerId);
      const presentedGoal = attacker
        ? {
            ...goal,
            scorerId: attacker.id,
            scorerName: attacker.name,
            detail:
              goal.type === "own_goal"
                ? `${attacker.name} pone el balón en una zona de peligro y la defensa rival se ve obligada a intervenir.`
                : goal.detail,
          }
        : goal;
      dangerBase = buildGoalPrelude({
        event: presentedGoal,
        homeName: home.name,
        awayName: away.name,
      });
    } else if (keyHighlight?.type === "save") {
      const attacker = getDangerAttacker(attackingSide);
      const presentedHighlight = attacker
        ? { ...keyHighlight, playerId: attacker.id, playerName: attacker.name, team: attackingSide }
        : { ...keyHighlight, team: attackingSide };
      dangerBase = buildSavePrelude({
        highlight: presentedHighlight,
        homeName: home.name,
        awayName: away.name,
      });
    } else {
      const presentedHighlight = keyHighlight
        ? { ...keyHighlight, team: attackingSide }
        : keyHighlight;
      dangerBase = buildDangerPreludeFromHighlight({
        highlight: presentedHighlight,
        homeName: home.name,
        awayName: away.name,
      });
    }

    const dangerTeamName = attackingSide === "home" ? home.name : away.name;
    const attacking = attackingSide === mySideOf(fx);
    const danger = {
      ...dangerBase,
      type: goal ? "goal_prelude" : dangerBase.type,
      kicker: "🚨 Jugada en directo",
      title: goal ? "¡PELIGRO!" : dangerBase.title,
      body: attacking
        ? `${dangerBase.body} La acción entra en zona de definición.`
        : `${dangerBase.body} El rival ha encontrado un hueco y tu defensa intenta contenerlo.`,
      // No decision wheel/choice: this scene is pure match presentation.
      actionPrompt: undefined,
      choices: undefined,
      hardPause: true,
      teamSide: attackingSide,
      teamName: dangerTeamName,
    };

    lastMajorMomentMinuteRef.current = m;
    pendingSceneRef.current = {
      kind: "prelude",
      moment: danger,
      source: { rawEvents, rawCards, rawHighlights, minute: m },
    };
    if (m === 45) halftimePendingAfterMomentRef.current = true;
    drainStamina();
    persistLive();
    showLiveMoment(danger, 2200, false);
    return true;
  }

  function finishRegularLiveMatch() {
    if (finishScheduledRef.current) return;
    clockRunIdRef.current += 1;
    finishScheduledRef.current = true;
    finalizePlayedChronicle();
    setPhase("done");
    pausedRef.current = true;
    pauseReasonRef.current = null;
    setIsPaused(false);
    setPauseReason(null);
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }
    if (momentTimerRef.current !== null) {
      window.clearTimeout(momentTimerRef.current);
      momentTimerRef.current = null;
    }
    clearMatchSnapshot();
    clearLive();
  }

  function runClock(startMinute = 0) {
    const runId = ++clockRunIdRef.current;
    let m = startMinute;
    const schedule = (delay?: number) => {
      if (pausedRef.current || runId !== clockRunIdRef.current) return;
      clockTimeoutRef.current = window.setTimeout(tick, delay ?? tickMs());
    };
    scheduleRef.current = () => schedule();

    const selectMajorMoment = (events: any[], cards: any[], highlights: any[], minute: number) => {
      // Goals are staged separately: danger -> resolution -> celebration.
      const red = cards.find((c) => c.cardType === "red" || c.isSecondYellow);
      if (red) {
        return {
          moment: {
            id: `red-${red.minute}-${red.playerId}`,
            type: "red_card",
            minute: red.minute,
            kicker: "🟥 Tarjeta roja",
            title: "ROJA",
            body: `${red.playerName} es expulsado. El partido cambia por completo para ${red.team === "home" ? home.name : away.name}.`,
            playerName: red.playerName,
            teamName: red.team === "home" ? home.name : away.name,
            emoji: "🟥",
            detail: red.reason,
            hardPause: true,
            teamSide: red.team,
          },
          emergency: true,
        };
      }
      const yellow = cards.find((c) => c.cardType === "yellow" && !c.isSecondYellow);
      if (yellow) {
        return {
          moment: {
            id: `yellow-${yellow.minute}-${yellow.playerId}`,
            type: "yellow_card",
            minute: yellow.minute,
            kicker: "🟨 Tarjeta amarilla",
            title: "AMARILLA",
            body: `${yellow.playerName} recibe tarjeta amarilla.`,
            playerName: yellow.playerName,
            teamName: yellow.team === "home" ? home.name : away.name,
            emoji: "🟨",
            detail: yellow.reason,
            hardPause: true,
            teamSide: yellow.team,
          },
          emergency: true,
        };
      }

      const priority: Record<string, number> = {
        var_disallowed: 100,
        injury: 95,
        woodwork: 90,
        big_chance: 85,
        save: 80,
      };
      const candidates = highlights
        .filter((h: any) => Object.prototype.hasOwnProperty.call(priority, h.type))
        .slice()
        .sort((a: any, b: any) => (priority[b.type] ?? 0) - (priority[a.type] ?? 0));
      const highlight = candidates[0];
      if (!highlight) return null;

      const emergency = ["var_disallowed", "injury"].includes(highlight.type);
      // A major moment is deliberately rare. Emergency incidents can interrupt
      // immediately; ordinary spectacular actions need a healthy gap.
      const requiredGap =
        highlight.type === "save"
          ? 24
          : highlight.type === "big_chance"
            ? 22
            : highlight.type === "woodwork"
              ? 20
              : 18;
      const enoughGap = minute - lastMajorMomentMinuteRef.current >= requiredGap;
      if (!emergency && !enoughGap) return null;
      const baseMoment = buildMomentFromHighlight({
        highlight,
        homeName: home.name,
        awayName: away.name,
      });
      const userTeamMoment = highlight.team === mySideOf(fixtureRef.current);
      const looksLikeCounter =
        highlight.type === "big_chance" && userTeamMoment && momentumRef.current >= 67;
      const moment = looksLikeCounter
        ? {
            ...baseMoment,
            id: `${baseMoment.id}-counter`,
            type: "counter",
            kicker: "⚡ Contraataque",
            title: "CONTRAATAQUE",
            body: `${highlight.playerName} recibe tras una recuperación y el ${highlight.team === "home" ? home.name : away.name} ataca el espacio antes de que el rival pueda replegarse.`,
            emoji: "⚡",
          }
        : baseMoment;
      return { moment, emergency };
    };
    const tick = () => {
      if (pausedRef.current || runId !== clockRunIdRef.current) return;
      m += 1;
      setMinute(m);
      minuteRef.current = m;

      const rawEvents = allEventsRef.current.filter((e) => e.minute === m);
      const rawCards = allCardsRef.current.filter((c) => c.minute === m);
      const rawHighlights = allHighlightsRef.current
        .filter((h) => h.minute === m)
        .filter((h) => !(h.type === "forced_sub" && h.team === mySideOf(fixtureRef.current)));

      // Penalties are interactive scenes of their own. A penalty goal is not
      // credited to the scoreboard until the manager resolves the shootout.
      const penaltySource =
        rawEvents.find((e: any) => e.type === "penalty_goal") ??
        rawHighlights.find((h: any) => h.type === "penalty_missed");
      if (penaltySource) {
        queueInteractivePenalty(penaltySource);
        return;
      }

      // The most memorable scoring moments start with a short danger scene.
      // This is the key MADFUT/Pacybits-like rhythm: anticipation -> resolution.
      if (stageDangerBeforeResolution(m, rawEvents, rawCards, rawHighlights)) {
        return;
      }

      const applied = applyMinuteOutcome(m, rawEvents, rawCards, rawHighlights);
      const events = applied.events;
      const cards = applied.cards;
      const hls = applied.hls;

      const fx = fixtureRef.current;
      const mySide: "home" | "away" =
        fx?.homeId === (myTeamIdRef.current || save?.myTeamId) ? "home" : "away";
      const nextMomentum = updateMomentum({
        previous: momentumRef.current,
        minute: m,
        userSide: mySide,
        homeScore: homeScoreRef.current,
        awayScore: awayScoreRef.current,
        events,
        cards,
        highlights: hls,
        managerEffects: managerEffectsRef.current,
        timeline: fx?.result?.stats?.timeline ?? [],
        avgUserStamina: currentAvgStamina(),
      });
      const momentumShift = Math.abs(nextMomentum - momentumRef.current);
      registerMomentum(nextMomentum, m);

      drainStamina();

      // Injuries keep their own manager flow (medical stop → mandatory change),
      // but the major-moment overlay is shown first so the incident actually
      // feels important rather than being hidden inside the substitution panel.
      const injury = rawHighlights.find((h: any) => h.type === "injury" && (h.minute ?? 0) === m);
      if (injury && mySide === injury.team && myXIRef.current.includes(injury.playerId)) {
        if (checkInjuriesAt(m)) return;
      }

      const selected = selectMajorMoment(events, cards, rawHighlights, m);
      const importantMoment = selected?.moment ?? null;
      const isMajor = !!importantMoment;
      const isEmergency =
        !!selected?.emergency ||
        ["goal", "free_kick_goal", "own_goal", "red_card", "yellow_card"].includes(importantMoment?.type ?? "");

      if (importantMoment) {
        lastMajorMomentMinuteRef.current = m;
        if (m === 45) halftimePendingAfterMomentRef.current = true;
      }

      // Commentary is deliberately less noisy than the raw event feed. It is
      // produced for major scenes, meaningful momentum swings, substitutions,
      // or once every ~5 minutes when there is a real tactical story to tell.
      const lastCommentGap = m - lastNarrativeMinuteRef.current;
      const hasSub =
        subsRef.current.some((s: any) => s.minute === m) ||
        (oppSubsDoneRef.current || []).some((s: any) => s.minute === m);
      const shouldComment =
        isMajor || hasSub || momentumShift >= 8 || (lastCommentGap >= 5 && m % 5 === 0);
      if (shouldComment) {
        pushContextualNarrative(m);
        lastNarrativeMinuteRef.current = m;
      }

      persistLive();

      // A major scene is now a real stop. Nothing advances until the manager
      // presses “Continuar partido”. This also lets us catch a 45' or 90' scene
      // without accidentally running into 46' / 91'.
      if (importantMoment) {
        if (m === 45) halftimePendingAfterMomentRef.current = true;
        showLiveMoment(importantMoment, isEmergency ? 3200 : 2600);
        return;
      }

      if (checkInjuriesAt(m)) return;

      if (m === 45 && !halftimeDoneRef.current) {
        halftimeDoneRef.current = true;
        announceHalftime(false);
        pauseMatch("halftime");
        return;
      }

      if (pausedRef.current) return;

      if (m >= 90) {
        finishRegularLiveMatch();
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
  function autoSubMyTeamAt(m: number, staminaThreshold = 62): any[] {
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

    // Take off the most tired outfield player.
    const candidates = myXIRef.current
      .map((id) => ({ id, p: playerById(id), st: staminaRef.current[id] ?? STAMINA_START }))
      .filter((c) => c.p && c.p.position !== "GK" && c.p.position !== "POR")
      .sort((a, b) => a.st - b.st);
    const worst = candidates[0];
    if (!worst || worst.st > staminaThreshold) return [];

    const inId =
      myBenchRef.current.find((id) => {
        const bp = playerById(id);
        return (
          bp &&
          !goneRef.current.includes(id) &&
          !isPlayerInjuredAtDate(bp, usePlayersStore.getState().currentDate) &&
          bp.position !== "GK" &&
          bp.position !== "POR"
        );
      }) ??
      myBenchRef.current.find(
        (id) =>
          !goneRef.current.includes(id) &&
          !isPlayerInjuredAtDate(playerById(id), usePlayersStore.getState().currentDate),
      );
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
    if (clockTimeoutRef.current !== null) {
      window.clearTimeout(clockTimeoutRef.current);
      clockTimeoutRef.current = null;
    }
    clockRunIdRef.current += 1;
    pausedRef.current = true;
    pauseReasonRef.current = "manual";

    const fx = fixtureRef.current;
    if (!fx?.result) return;

    const currentMinute = Math.max(0, Math.min(90, minuteRef.current));

    const uniq = (items: any[], key: (x: any) => string) => {
      const out: any[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        const k = key(item);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(item);
      }
      return out;
    };
    const eventKey = (e: any) =>
      `${e.minute}|${e.team}|${e.type}|${e.scorerId ?? e.playerId ?? ""}|${e.assistId ?? ""}|${e.detail ?? ""}`;
    const cardKey = (c: any) => `${c.minute}|${c.team}|${c.cardType}|${c.playerId}`;
    const highlightKey = (h: any) =>
      `${h.minute}|${h.team}|${h.type}|${h.playerId ?? ""}|${h.detail ?? ""}`;

    // The React feed is a second source of truth for the first half. This is
    // crucial because those events may have been remapped to the players actually on the pitch
    // after the original pre-simulation was generated. Never throw them away.
    const feedEvents = (feed || []).filter((e: any) => Number(e.minute ?? 0) <= currentMinute);
    const feedCards = (cardFeed || []).filter((c: any) => Number(c.minute ?? 0) <= currentMinute);
    const feedHighlights = (highlightFeed || []).filter(
      (h: any) => Number(h.minute ?? 0) <= currentMinute,
    );
    playedEventsRef.current = uniq([...playedEventsRef.current, ...feedEvents], eventKey);
    playedCardsRef.current = uniq([...playedCardsRef.current, ...feedCards], cardKey);
    playedHighlightsRef.current = uniq(
      [...playedHighlightsRef.current, ...feedHighlights],
      highlightKey,
    );

    const madeWhileSkipping: any[] = [];
    for (let m = currentMinute + 1; m <= 90; m++) {
      drainStamina();
      if (includeOpponentSubs && oppPlanRef.current.some((s) => s.minute === m)) {
        applyOpponentSubsAt(m);
      }
      const autoSubMinutes = [61, 71, 80];
      if (autoSubMinutes.includes(m)) {
        madeWhileSkipping.push(...autoSubMyTeamAt(m, m === 61 ? 80 : 101));
      }

      const evs = allEventsRef.current.filter((e) => e.minute === m).map(remapEventToPitch);
      const freshEvs = evs.filter((ev: any) =>
        !playedEventsRef.current.some((existing: any) => eventKey(existing) === eventKey(ev)),
      );
      playedEventsRef.current = uniq([...playedEventsRef.current, ...evs], eventKey);
      for (const ev of freshEvs) {
        if (!["goal", "penalty_goal", "free_kick_goal", "own_goal"].includes(ev.type)) continue;
        if (ev.team === "home") homeScoreRef.current += 1;
        else awayScoreRef.current += 1;
      }

      const cds = allCardsRef.current.filter((c) => c.minute === m).map(remapCardToPitch);
      playedCardsRef.current = uniq([...playedCardsRef.current, ...cds], cardKey);

      const hls = allHighlightsRef.current
        .filter((h) => h.minute === m)
        .filter((h) => !(h.type === "forced_sub" && h.team === mySideOf(fixtureRef.current)));
      playedHighlightsRef.current = uniq([...playedHighlightsRef.current, ...hls], highlightKey);
    }

    if (madeWhileSkipping.length > 0) {
      setSubFeed((prev) => [...madeWhileSkipping.slice().reverse(), ...prev]);
    }

    // From this point on there is only one authoritative timeline: what has
    // actually been resolved. The future pre-simulation is never displayed.
    finalizePlayedChronicle();
    setHomeScore(homeScoreRef.current);
    setAwayScore(awayScoreRef.current);
    setFeed(
      playedEventsRef.current
        .slice()
        .sort((a: any, b: any) => a.minute - b.minute)
        .reverse(),
    );
    setCardFeed(
      playedCardsRef.current
        .slice()
        .sort((a: any, b: any) => a.minute - b.minute)
        .reverse(),
    );
    setHighlightFeed(
      playedHighlightsRef.current
        .slice()
        .sort((a: any, b: any) => a.minute - b.minute)
        .reverse(),
    );
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
      clockRunIdRef.current += 1;
      if (clockTimeoutRef.current !== null) {
        window.clearTimeout(clockTimeoutRef.current);
      }
      if (momentTimerRef.current !== null) window.clearTimeout(momentTimerRef.current);
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
      .filter(
        (p: any) =>
          !onPitchIds.has(p.id) &&
          !isPlayerInjuredAtDate(p, usePlayersStore.getState().currentDate),
      )
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
    <div
      className={`p-1.5 md:p-2 max-w-[1240px] mx-auto ${phase === "playing" ? "pb-24 md:pb-5" : ""}`}
    >
      {/* Always-visible match clock */}
      <div className="sticky top-0 z-30 -mx-3 md:-mx-4 mb-1 px-1.5 md:px-2 py-1 bg-background/85 backdrop-blur border-b border-border/60">
        <div className="flex items-center justify-between gap-3">
          <span className="chip truncate">{headerText}</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold truncate max-w-[8rem] text-right">{home.short}</span>
            <span className="scoreline text-base font-black tabular-nums">
              {phase === "preview"
                ? "– : –"
                : `${homeScore + extraTimeHomeScore} : ${awayScore + extraTimeAwayScore}`}
            </span>
            <span className="text-sm font-bold truncate max-w-[8rem]">{away.short}</span>
            <span className="scoreline text-lg font-black text-primary tabular-nums w-12 text-right">
              {liveMinuteLabel}
            </span>
          </div>
        </div>
      </div>

      {phase !== "preview" && (
        <div className="mb-4 grid gap-2 lg:grid-cols-[0.8fr_1.2fr]">
          <MomentumBar
            compact
            value={isHome ? 100 - momentum : momentum}
            homeLabel={home.short}
            awayLabel={away.short}
            status={momentumStatus(
              momentum,
              isHome ? home.name : away.name,
              isHome ? away.name : home.name,
            )}
          />
          <LiveCommentary
            latest={commentaryEntries[0] ?? null}
            entries={commentaryEntries.slice(0, 4)}
            compact
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
        <div className="min-w-0">
          <div className="panel-glow p-3 md:p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="chip">{headerText}</span>
              <div className="text-sm scoreline font-bold text-primary">{liveMinuteLabel}</div>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 md:gap-6 items-center text-center">
              <div className="flex flex-col items-center gap-2 md:gap-3">
                <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={36} />
                <div className="flex items-center gap-2">
                  <LeagueLogo league={LEAGUES[home.league]?.name || ""} size="sm" />
                  <CountryFlag country={LEAGUES[home.league]?.country || ""} />
                  <div className="font-bold text-sm md:text-base">{home.name}</div>
                </div>
                <MiniPitch
                  startingXI={homeLineup}
                  formation={homeFormation}
                  teamId={fixture.homeId}
                  className="mt-1"
                  cards={cardFeed.filter((c) => c.team === "home")}
                  goals={feed}
                  assists={feed}
                  mvp={phase === "done" ? fixture.result?.mvp?.playerId : undefined}
                  substitutions={subFeed.filter((s: any) => s.team === "home")}
                  stamina={isHome ? stamina : {}}
                />
              </div>
              <div className="scoreline text-3xl md:text-4xl font-black">
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
                <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={36} />
                <div className="flex items-center gap-2">
                  <LeagueLogo league={LEAGUES[away.league]?.name || ""} size="sm" />
                  <CountryFlag country={LEAGUES[away.league]?.country || ""} />
                  <div className="font-bold text-sm md:text-base">{away.name}</div>
                </div>
                <MiniPitch
                  startingXI={awayLineup}
                  formation={awayFormation}
                  teamId={fixture.awayId}
                  className="mt-1"
                  cards={cardFeed.filter((c) => c.team === "away")}
                  goals={feed}
                  assists={feed}
                  mvp={phase === "done" ? fixture.result?.mvp?.playerId : undefined}
                  substitutions={subFeed.filter((s: any) => s.team === "away")}
                  stamina={!isHome ? stamina : {}}
                />
              </div>
            </div>

            {phase !== "preview" && (
              <div className="mt-4 h-1 bg-secondary rounded overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(minute / (phase === "extra_time" ? 120 : 90)) * 100}%` }}
                />
              </div>
            )}

            <div className="mt-4 flex gap-1.5 justify-center flex-wrap items-center">
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
                <div className="w-full space-y-2">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <div className={segmentBase}>
                      {[1, 2, 4].map((value) => (
                        <button
                          key={value}
                          onClick={() => {
                            speedRef.current = value;
                            setSpeed(value);
                          }}
                          className={segmentItem(speed === value)}
                        >
                          {value}x
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => (isPaused ? resumeMatch() : pauseMatch("manual"))}
                      className={`${isPaused ? btnPrimary : btnSecondary} px-3 py-1.5 text-xs`}
                      disabled={
                        pauseReason === "injury" ||
                        pauseReason === "coach" ||
                        pauseReason === "penalty" ||
                        pauseReason === "moment"
                      }
                    >
                      {isPaused ? (
                        <>
                          <Play className="h-3.5 w-3.5" />{" "}
                          {pauseReason === "halftime"
                            ? "Comenzar 2ª parte"
                            : pauseReason === "et_halftime"
                              ? "Continuar prórroga"
                              : "Reanudar"}
                        </>
                      ) : (
                        <>
                          <Pause className="h-3.5 w-3.5" /> Pausar
                        </>
                      )}
                    </button>
                    <button
                      onClick={goEditLineupLive}
                      className={`${btnSecondary} px-3 py-1.5 text-xs`}
                    >
                      <ClipboardList className="h-3.5 w-3.5" /> Alineación
                    </button>
                    <button onClick={skipToEnd} className={`${btnGhost} px-3 py-1.5 text-xs`}>
                      <FastForward className="h-3.5 w-3.5" /> Saltar
                    </button>
                  </div>
                </div>
              )}
              {phase === "extra_time" && (
                <div className="w-full flex flex-wrap items-center justify-center gap-2">
                  <span className={infoChip}>Prórroga</span>
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

          {(phase === "playing" || phase === "extra_time" || phase === "done") && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2 items-start">
              {fixture?.result?.stats &&
                (() => {
                  const acc = accumulateStats(fixture.result.stats, phase === "done" ? 90 : minute);
                  return <MatchStatsPanel home={acc.home} away={acc.away} />;
                })()}
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
                    corner: { icon: "🚩", label: "Córner" },
                    counterattack: { icon: "⚡", label: "Contraataque" },
                    blocked_shot: { icon: "🛡️", label: "Remate bloqueado" },
                    offside: { icon: "🚩", label: "Fuera de juego" },
                    big_chance: { icon: "🔥", label: "Gran ocasión" },
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
                          <PlayerFace
                            name={card.playerName}
                            image={faceUrl(card.playerId)}
                            size={24}
                            showRing={false}
                            className="shrink-0"
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
                          <PlayerFace
                            name={s.inName}
                            image={faceUrl(s.playerInId)}
                            size={24}
                            showRing={false}
                            className="shrink-0"
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
                          <PlayerFace
                            name={h.playerName || "Jugador"}
                            image={faceUrl(h.playerId)}
                            size={24}
                            showRing={false}
                            className="shrink-0"
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
                        <PlayerFace
                          name={e.scorerName || "Jugador"}
                          image={faceUrl(e.scorerId)}
                          size={24}
                          showRing={false}
                          className="shrink-0"
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

      <AnimatePresence>
        {phase !== "preview" && liveMoment && (
          <LiveEventOverlay
            event={
              liveMoment
                ? ({
                    ...(liveMoment as any),
                    teamLeagueName:
                      liveMoment.teamSide === "home"
                        ? getLeagueName(home.league)
                        : getLeagueName(away.league),
                  } as any)
                : null
            }
            onContinue={continueLiveMoment}
          />
        )}
      </AnimatePresence>
      <PenaltyDecisionModal
        penalty={pendingPenalty}
        onResolve={resolveInteractivePenalty}
        onContinue={continueInteractivePenalty}
      />
    </div>
  );
}

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
  setSubstitutes,
  getMyNextFixtureAny,
  playSpecificFixture,
  simulateCupMatchday,
  simulateUCLMatchday,
  simulateUCLKnockoutMatchday,
  advanceMatchdayLayered,
  simulateCupMatchdayLayered,
  getStartersWithFormation,
  getSuspendedPlayerIdsForCompetition,
  getSuspensionForPlayer,
  commitLiveFixtureDiscipline,
  simulateUserPhaseUCLDay,
  processUCLKnockoutProgress,
  commitLiveFixtureResult,
} from "@/lib/store";
import { uclDayOffset, isUCLLeaguePhaseFixture } from "@/data/ucl";
import { EUROPEAN_START } from "@/data/europeanCompetitions";
import { applyResult, Fixture } from "@/lib/season";
import { FORMATION_COORDINATES, type FormationName } from "@/lib/formations";
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
import { addDaysToIso } from "@/lib/transferWindows";
import { getPlayerShootingStats } from "@/data/players";
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
  buildMissDetail,
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

const DEFAULT_FORMATION: FormationName = "Táctica 4-4-2";

function normalizeFormation(value: unknown): FormationName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FORMATION_COORDINATES, value)
    ? (value as FormationName)
    : DEFAULT_FORMATION;
}

export const Route = createFileRoute("/match")({ component: MatchPage });

function getEuropeanFixtureList(save: any, competition?: string): any[] {
  if (competition === "uel") return Array.isArray(save?.uelFixtures) ? save.uelFixtures : [];
  if (competition === "uecl") return Array.isArray(save?.ueclFixtures) ? save.ueclFixtures : [];
  return [];
}

function findFixtureInEuropeanCompetitions(save: any, fixtureId: string): any | null {
  for (const [competition, list] of [["uel", save?.uelFixtures], ["uecl", save?.ueclFixtures]] as const) {
    if (!Array.isArray(list)) continue;
    const found = list.find((f: any) => f.id === fixtureId);
    if (found) return { ...found, europeanCompetition: competition };
  }
  return null;
}

function europeanCompetitionOf(fixture: any): "uel" | "uecl" | undefined {
  const value = fixture?.europeanCompetition;
  return value === "uel" || value === "uecl" ? value : undefined;
}

function isEuropeanFixture(fixture: any): boolean {
  return !!europeanCompetitionOf(fixture);
}

function normalizeLiveArray(value: any): any[] {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeLiveResult(rawResult: any): any {
  const r = rawResult && typeof rawResult === "object" ? { ...rawResult } : {};
  r.events = normalizeLiveArray(r.events);
  r.cards = normalizeLiveArray(r.cards);
  r.highlights = normalizeLiveArray(r.highlights);
  r.substitutions = normalizeLiveArray(r.substitutions);
  r.injuries = normalizeLiveArray(r.injuries);
  r.homeGoals = Number.isFinite(Number(r.homeGoals)) ? Number(r.homeGoals) : 0;
  r.awayGoals = Number.isFinite(Number(r.awayGoals)) ? Number(r.awayGoals) : 0;
  if (r.extraTime && typeof r.extraTime === "object") {
    r.extraTime = {
      ...r.extraTime,
      events: normalizeLiveArray(r.extraTime.events),
      substitutions: normalizeLiveArray(r.extraTime.substitutions),
      homeGoals: Number.isFinite(Number(r.extraTime.homeGoals)) ? Number(r.extraTime.homeGoals) : 0,
      awayGoals: Number.isFinite(Number(r.extraTime.awayGoals)) ? Number(r.extraTime.awayGoals) : 0,
    };
  }
  if (r.penalties && typeof r.penalties === "object") {
    r.penalties = {
      ...r.penalties,
      shootout: normalizeLiveArray(r.penalties.shootout),
      homeGoals: Number.isFinite(Number(r.penalties.homeGoals)) ? Number(r.penalties.homeGoals) : 0,
      awayGoals: Number.isFinite(Number(r.penalties.awayGoals)) ? Number(r.penalties.awayGoals) : 0,
    };
  }
  r.homeLineup = normalizeLiveArray(r.homeLineup);
  r.awayLineup = normalizeLiveArray(r.awayLineup);
  if (!Number.isFinite(Number(r.xgHome))) r.xgHome = r.homeGoals;
  if (!Number.isFinite(Number(r.xgAway))) r.xgAway = r.awayGoals;
  return r;
}

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
  const extraTimeSubsRef = useRef<any[]>([]);
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
  const currentMatchCompetition = () => {
    const fixtureCompetition = fixtureRef.current?.competition;
    if (fixtureCompetition) return fixtureCompetition;
    return matchType === "CUP" ? "cup" : matchType === "UCL" ? "ucl" : "league";
  };
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
  // Timer used when temporarily resuming the live match after lineup edits.
  // It must exist even when no resume timer is scheduled because React Strict
  // Mode runs effect cleanups during the initial development mount.
  const transientResumeTimerRef = useRef<number | null>(null);
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
    kind: "prelude" | "resolution" | "var" | "penalty_intro" | "card";
    moment?: any;
    resolution?: any;
    source?: any;
  } | null>(null);
  const clockRunIdRef = useRef(0);
  const outcomeBiasRef = useRef(0);

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
  const playerScoringStatsRecordedRef = useRef(false);
  const [myBench, setMyBench] = useState<string[]>([]);
  const myBenchRef = useRef<string[]>([]);
  const [goneIds, setGoneIds] = useState<string[]>([]);
  const goneRef = useRef<string[]>([]);
  const goneSlotIndexesRef = useRef<Record<string, number>>({});
  // Injuries with an available replacement must be resolved in the lineup editor.
  const pendingForcedInjurySlotsRef = useRef<Record<string, number>>({});
  const lastDangerAttackerRef = useRef<Record<"home" | "away", string | null>>({ home: null, away: null });
  const [forcedOutId, setForcedOutId] = useState<string | null>(null);
  const handledInjuriesRef = useRef<string[]>([]);
  const isExtraTimeRef = useRef(false);
  const halftimeDoneRef = useRef(false);
  const etHalftimeDoneRef = useRef(false);
  const [liveFormation, setLiveFormation] = useState<string | null>(null);
  const restoredRef = useRef(false);
  // When returning from Dirección de equipo, the live snapshot is hydrated
  // during an effect. The clock must NOT start from that first render because
  // the render-local fixture/team objects (home/away) are still empty. Keep a
  // tiny pending token and consume it from a second effect after React has
  // rendered the restored save + fixture. This is the same safe ordering for
  // league, cup, Champions, Europa League and Conference League.
  const resumeClockRef = useRef<{ minute: number; isExtraTime: boolean } | null>(null);
  const [resumeClockPending, setResumeClockPending] = useState(false);
  const myTeamIdRef = useRef<string>("");
  const subsUsedRef = useRef(0);
  const windowsUsedRef = useRef(0);
  const subsRef = useRef<any[]>([]);
  // Planned substitutions used only when the manager chooses "Saltar al final".
  // Keeping the plan per match makes the count/timings vary instead of replaying
  // the same 61'/71'/80' pattern on every simulated match.
  const autoSubPlanRef = useRef<number[]>([]);
  // Substitutions (mine and the rival's) shown inside the match chronicle.
  const [subFeed, setSubFeed] = useState<any[]>([]);
  // Rival (CPU) live lineup + planned substitutions.
  const oppCacheRef = useRef<{ key: string; formation: any } | null>(null);
  const oppXIRef = useRef<any[]>([]);
  const oppBenchRef = useRef<any[]>([]);
  const oppPlanRef = useRef<{ minute: number; outId: string; inId: string }[]>([]);
  // Rival substitutions actually shown during the match.
  const oppSubsDoneRef = useRef<any[]>([]);
  // Rival substitutions that share a minute with an injury are deferred until
  // the injury notification has been shown/resolved. This keeps the chronology
  // faithful: injury first, forced change immediately after.
  const deferredOpponentSubMinutesRef = useRef<Set<number>>(new Set());
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

    try {
      // IMPORTANT: do not assume the live snapshot is perfectly shaped. Older
      // saves and the different match engines (league/cup/UCL/UEL/UECL) have
      // produced slightly different result payloads over time. A malformed
      // array/object here used to throw before the MatchPage could render again.
      let fx: any = s.fixtures?.[s.myLeague]?.find((f: any) => f.id === st.fixtureId);
      if (!fx) {
        for (const lg of Object.keys(s.cupFixtures || {})) {
          const list = (s.cupFixtures as any)?.[lg];
          if (!Array.isArray(list)) continue;
          fx = list.find((f: any) => f.id === st.fixtureId);
          if (fx) break;
        }
      }
      if (!fx) fx = (s.uclFixtures || []).find((f: any) => f.id === st.fixtureId);
      if (!fx) fx = findFixtureInEuropeanCompetitions(s, st.fixtureId);
      if (!fx) return;

      const restoredResult = normalizeLiveResult(st.result ?? fx.result ?? {});
      const safeLineup = normalizeLiveArray(st.lineup)
        .map((id: any) => String(id))
        .filter(Boolean)
        .slice(0, 11);
      const savedXI = normalizeLiveArray(s.lineups?.[s.myTeamId])
        .map((id: any) => String(id))
        .filter(Boolean)
        .slice(0, 11);
      const finalXI = safeLineup.length > 0 ? safeLineup : savedXI;
      const safeBench = normalizeLiveArray(st.bench)
        .map((id: any) => String(id))
        .filter((id: string) => id && !finalXI.includes(id))
        .slice(0, 12);
      const savedBench = normalizeLiveArray(s.substitutes?.[s.myTeamId])
        .map((id: any) => String(id))
        .filter((id: string) => id && !finalXI.includes(id))
        .slice(0, 12);
      const finalBench = safeBench.length > 0 ? safeBench : savedBench;
      const safeSubs = normalizeLiveArray(st.subs);
      const safeGone = normalizeLiveArray(st.gone).map((id: any) => String(id)).filter(Boolean);
      const safeHandledInjuries = normalizeLiveArray(st.handledInjuries).map((id: any) => String(id)).filter(Boolean);
      const safeFeed = normalizeLiveArray(st.feed);
      const safeCardFeed = normalizeLiveArray(st.cardFeed);
      const safeHighlightFeed = normalizeLiveArray(st.highlightFeed);
      const safePlayedEvents = normalizeLiveArray((st as any).playedEvents);
      const safePlayedCards = normalizeLiveArray((st as any).playedCards);
      const safePlayedHighlights = normalizeLiveArray((st as any).playedHighlights);
      const safeOpponentXI = normalizeLiveArray((st as any).opponentXI);
      const safeOpponentBench = normalizeLiveArray((st as any).opponentBench);
      const safeOpponentPlan = normalizeLiveArray((st as any).opponentPlan)
        .map((p: any) => ({
          minute: Number(p?.minute) || 0,
          outId: String(p?.outId ?? p?.playerOutId ?? ""),
          inId: String(p?.inId ?? p?.playerInId ?? ""),
        }))
        .filter((p: any) => p.outId && p.inId);
      const safeOpponentSubsDone = normalizeLiveArray((st as any).opponentSubsDone);
      const safeStamina =
        st.stamina && typeof st.stamina === "object" && !Array.isArray(st.stamina)
          ? st.stamina
          : {};

      restoredRef.current = true;
      fixtureRef.current = { ...fx, result: restoredResult };
      setSave(s);
      myTeamIdRef.current = s.myTeamId;

      allEventsRef.current = restoredResult.events;
      allCardsRef.current = restoredResult.cards;
      allHighlightsRef.current = restoredResult.highlights;

      playedEventsRef.current =
        safePlayedEvents.length > 0
          ? safePlayedEvents
          : restoredResult.events.filter(
              (e: any) => Number(e?.minute ?? 0) <= Number(st.minute ?? 0),
            );
      playedCardsRef.current =
        safePlayedCards.length > 0
          ? safePlayedCards
          : restoredResult.cards.filter(
              (c: any) => Number(c?.minute ?? 0) <= Number(st.minute ?? 0),
            );
      playedHighlightsRef.current =
        safePlayedHighlights.length > 0
          ? safePlayedHighlights
          : restoredResult.highlights.filter(
              (h: any) => Number(h?.minute ?? 0) <= Number(st.minute ?? 0),
            );
      oppSubsDoneRef.current = safeOpponentSubsDone;

      const m = Math.max(0, Number(st.minute) || 0);
      setFeed(
        allEventsRef.current.filter((e: any) => Number(e?.minute ?? 0) <= m).slice().reverse(),
      );
      setCardFeed(
        allCardsRef.current.filter((c: any) => Number(c?.minute ?? 0) <= m).slice().reverse(),
      );
      setHighlightFeed(
        allHighlightsRef.current
          .filter((h: any) => Number(h?.minute ?? 0) <= m)
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
      const storedInitialXI = normalizeLiveArray(
        resumeMySide === "home" ? restoredResult.homeLineup : restoredResult.awayLineup,
      )
        .map((p: any) => (typeof p === "string" ? p : p?.id))
        .filter(Boolean)
        .slice(0, 11);
      initialMyXIRef.current =
        storedInitialXI.length > 0 ? storedInitialXI : finalXI.slice(0, 11);
      finalPerformanceRecordedRef.current = false;
      myXIRef.current = finalXI;
      setMyXI(finalXI);
      myBenchRef.current = finalBench;
      setMyBench(finalBench);
      staminaRef.current = safeStamina;
      setStamina(safeStamina);

      const restoredMomentum = Number(st.momentum ?? 50);
      momentumRef.current = restoredMomentum;
      setMomentum(restoredMomentum);
      const restoredMomentumHistory = Array.isArray(st.momentumHistory)
        ? st.momentumHistory
        : [];
      momentumHistoryRef.current = restoredMomentumHistory;
      setMomentumHistory(restoredMomentumHistory);
      const restoredEffects = {
        ...DEFAULT_MANAGER_EFFECTS,
        ...(st.managerEffects && typeof st.managerEffects === "object"
          ? st.managerEffects
          : {}),
      };
      managerEffectsRef.current = restoredEffects;
      setManagerEffects(restoredEffects);
      outcomeBiasRef.current = Number(st.outcomeBias ?? 0) || 0;

      if (Array.isArray(st.narrative)) {
        commentaryEntriesRef.current = st.narrative;
        setCommentaryEntries(st.narrative);
      }
      const restoredMoments = Array.isArray(st.keyMoments) ? st.keyMoments : [];
      keyMomentsRef.current = restoredMoments.filter(isChronicleMoment).slice(-200);
      setKeyMoments(keyMomentsRef.current);
      goneRef.current = safeGone;
      setGoneIds(safeGone);
      goneSlotIndexesRef.current = { ...((st as any).goneSlotIndexes || {}) };
      pendingForcedInjurySlotsRef.current = {
        ...((st as any).pendingForcedInjurySlots || {}),
      };
      subsUsedRef.current = Number(st.subsUsed) || 0;
      setSubsUsed(subsUsedRef.current);
      windowsUsedRef.current = Number(st.windowsUsed) || 0;
      setWindowsUsed(windowsUsedRef.current);
      subsRef.current = safeSubs;
      setSubsMade(safeSubs);

      const mySide = fx.homeId === s.myTeamId ? "home" : "away";
      setSubFeed(
        safeSubs
          .map((sb: any) => ({
            minute: Number(sb?.minute) || 0,
            team: mySide,
            inName: sb?.inName ?? sb?.playerInName ?? "",
            outName: sb?.outName ?? sb?.playerOutName ?? "",
            playerInId: sb?.inId ?? sb?.playerInId,
            playerOutId: sb?.outId ?? sb?.playerOutId,
          }))
          .reverse(),
      );

      handledInjuriesRef.current = safeHandledInjuries;
      halftimeDoneRef.current = m >= 45;
      etHalftimeDoneRef.current = m >= 105;
      isExtraTimeRef.current = !!st.isExtraTime;
      setMatchType(st.matchType === "CUP" ? "CUP" : st.matchType === "UCL" ? "UCL" : "LEAGUE");
      setCupRound(st.cupRound);
      setLiveFormation(st.formation || "Táctica 4-4-2");
      setIsCupMatch(st.matchType === "CUP");

      // Restore rival state from the live snapshot when available. This keeps
      // all competition types on the same path and avoids re-generating an
      // opponent after leaving the lineup editor.
      if (safeOpponentXI.length > 0) {
        oppXIRef.current = safeOpponentXI.map((p: any) =>
          typeof p === "string" ? playerById(p) : p,
        ).filter(Boolean);
        oppBenchRef.current = safeOpponentBench.map((p: any) =>
          typeof p === "string" ? playerById(p) : p,
        ).filter(Boolean);
        oppPlanRef.current = safeOpponentPlan;
        oppCacheRef.current = {
          key: `${fx.id}:${fx.homeId === s.myTeamId ? fx.awayId : fx.homeId}`,
          formation: normalizeFormation((st as any).opponentFormation),
        };
      }

      const restoredPhase =
        st.phase || (st.isExtraTime ? "et_playing" : "playing");
      const atBreak = restoredPhase === "halftime" || restoredPhase === "et_halftime";
      setPhase(st.isExtraTime ? "extra_time" : "playing");
      finishScheduledRef.current = false;
      halftimePendingAfterMomentRef.current = false;
      pendingSceneRef.current = (st.scene as any) || null;

      if (st.scene?.moment) setLiveMoment(st.scene.moment);

      if (atBreak) {
        pausedRef.current = true;
        pauseReasonRef.current =
          restoredPhase === "et_halftime" ? "et_halftime" : "halftime";
        setIsPaused(true);
        setPauseReason(
          restoredPhase === "et_halftime" ? "et_halftime" : "halftime",
        );
        resumeClockRef.current = null;
        setResumeClockPending(false);
        return;
      }

      if (st.scene?.moment) {
        pausedRef.current = true;
        pauseReasonRef.current = "moment";
        setIsPaused(true);
        setPauseReason("moment");
        resumeClockRef.current = null;
        setResumeClockPending(false);
        return;
      }

      pausedRef.current = false;
      pauseReasonRef.current = null;
      setIsPaused(false);
      setPauseReason(null);
      resumeClockRef.current = { minute: m, isExtraTime: !!st.isExtraTime };
      setResumeClockPending(true);
    } catch (error) {
      // Never let a legacy/live-snapshot shape crash the whole route. Recover
      // the simplest playable state from the persisted fixture instead.
      console.error("Live match resume failed; using safe fallback", error, {
        fixtureId,
        liveVersion: (st as any)?.v,
      });

      const fallbackResult = normalizeLiveResult((st as any)?.result ?? fx?.result ?? {});
      const fallbackXI = normalizeLiveArray(s.lineups?.[s.myTeamId])
        .map((id: any) => String(id))
        .filter(Boolean)
        .slice(0, 11);
      const fallbackBench = normalizeLiveArray(s.substitutes?.[s.myTeamId])
        .map((id: any) => String(id))
        .filter((id: string) => id && !fallbackXI.includes(id))
        .slice(0, 12);

      restoredRef.current = true;
      fixtureRef.current = { ...fx, result: fallbackResult };
      setSave(s);
      myTeamIdRef.current = s.myTeamId;
      myXIRef.current = fallbackXI;
      setMyXI(fallbackXI);
      myBenchRef.current = fallbackBench;
      setMyBench(fallbackBench);
      homeScoreRef.current = Number((st as any)?.homeScore) || Number(fallbackResult.homeGoals) || 0;
      awayScoreRef.current = Number((st as any)?.awayScore) || Number(fallbackResult.awayGoals) || 0;
      setHomeScore(homeScoreRef.current);
      setAwayScore(awayScoreRef.current);
      const fallbackMinute = Math.max(0, Number((st as any)?.minute) || 0);
      minuteRef.current = fallbackMinute;
      setMinute(fallbackMinute);
      setPhase("playing");
      pausedRef.current = false;
      setIsPaused(false);
      setPauseReason(null);
      resumeClockRef.current = {
        minute: fallbackMinute,
        isExtraTime: !!(st as any)?.isExtraTime,
      };
      setResumeClockPending(true);
    }
  }, [resumeLive, fixtureId]);

  // Start a restored live match only after the restored save/fixture has made
  // it through a React render. Starting it from the hydration effect above can
  // capture undefined `home`/`away` bindings and crash MatchPage as soon as a
  // non-league match hits its first highlight/card/halftime scene.
  useEffect(() => {
    if (!resumeLive || !resumeClockPending || !save) return;
    const pending = resumeClockRef.current;
    const fx = fixtureRef.current;
    if (!pending || !fx) return;

    resumeClockRef.current = null;
    setResumeClockPending(false);

    if (pausedRef.current) return;
    if (pending.isExtraTime) runExtraTimeClock(pending.minute);
    else runClock(pending.minute);
  }, [resumeLive, resumeClockPending, save]);

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
        toast.error(`${inj.playerName} se ha lesionado (${inj.reason})`);
      }
    }

    for (const card of result.cards || []) {
      if (card.cardType === "red" && card.team === myTeam) {
        const susp = getSuspensionForPlayer(
          save,
          myTeamId,
          card.playerId,
          currentMatchCompetition(),
        );
        const matchdays = susp?.matchdaysRemaining ?? 1;
        const competitionLabel =
          currentMatchCompetition() === "cup"
            ? "Copa"
            : currentMatchCompetition() === "ucl"
              ? "Champions"
              : "Liga";
        toast.error(
          `${card.playerName} expulsado — suspensión de ${matchdays} partido${matchdays > 1 ? "s" : ""} en ${competitionLabel}`,
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
      // Reload the persisted career so the final live result (and the
      // standings updated with it) is always the source of truth. React state
      // updates are asynchronous, and clicking the button immediately after
      // the final chronicle could otherwise pass the provisional SaveGame.
      const latestSave = loadSave() ?? save;
      let next: SaveGame;

      // STRICT BRANCHING by matchType - ensure correct simulation for each competition
      if (matchType === "CUP") {
        // CUP: Simulate ALL Cup fixtures for the matchday across ALL VIP countries
        // Uses the same layered simulation format as league matches
        console.log("Post-match: Simulating CUP matches for matchday:", fixture.matchday);
        next = await simulateCupMatchdayLayered(latestSave, fixture.matchday, (done, total) => {
          console.log(`Cup matches: ${done}/${total}`);
        });
      } else if (isEuropeanFixture(fixture)) {
        const europeanCompetition = europeanCompetitionOf(fixture)!;
        const { processEuropeanKnockoutProgress } = await import("@/lib/store");
        // The fixture matchday is already the absolute UEFA calendar offset
        // (e.g. 78 for UEL MD1). Do not derive it from the current date: after
        // a browser refresh the two can temporarily differ by one day.
        // Same behaviour as Champions League when the user returns from a
        // watched match: simulate the OTHER fixtures of this exact European
        // matchday, while keeping the user's already-committed result intact.
        // The previous code used simulatePendingEuropeanThroughDay(), whose
        // background path intentionally skips AI matches whenever the user
        // participates in the competition. That is correct for calendar
        // catch-up, but wrong immediately after the user's match.
        const { simulateEuropeanUserPhaseDay } = await import("@/lib/store");
        next = simulateEuropeanUserPhaseDay(
          latestSave,
          europeanCompetition,
          Number(fixture.matchday),
          latestSave.myTeamId,
        );
        next = processEuropeanKnockoutProgress(
          next,
          europeanCompetition,
          Number(fixture.matchday),
        );
      } else if (matchType === "UCL") {
        next = simulateUserPhaseUCLDay(latestSave, fixture.matchday, latestSave.myTeamId);
        next = processUCLKnockoutProgress(next, uclDayOffset(usePlayersStore.getState().currentDate));
      } else {
        // LEAGUE: Execute the league matchday simulation
        console.log("Post-match: Simulating LEAGUE matches");
        next = await advanceMatchdayLayered(latestSave, (done, total) => {
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

    // Use the actual lineups currently on the pitch. The user's side keeps
    // manual control of its extra-time changes; the CPU side receives its
    // additional simulation allowance automatically.
    const userId = myTeamIdRef.current || save.myTeamId;
    const userIsHome = fixture.homeId === userId;
    const homeXI = userIsHome ? (myXIRef.current.length ? myXIRef.current.map((id) => playerById(id)).filter(Boolean) : getSimSquad(fixture.homeId)) : oppXIRef.current;
    const awayXI = userIsHome ? oppXIRef.current : (myXIRef.current.length ? myXIRef.current.map((id) => playerById(id)).filter(Boolean) : getSimSquad(fixture.awayId));
    const homeBench = userIsHome
      ? []
      : oppBenchRef.current;
    const awayBench = userIsHome
      ? oppBenchRef.current
      : [];
    const regularSubstitutions = [
      ...subsRef.current.map((s: any) => ({
        minute: Number(s.minute) || 0,
        team: userIsHome ? "home" : "away",
        playerOutId: s.outId ?? s.playerOutId,
        playerOutName: s.outName ?? s.playerOutName,
        playerInId: s.inId ?? s.playerInId,
        playerInName: s.inName ?? s.playerInName,
      })),
      ...oppSubsDoneRef.current.map((s: any) => ({
        minute: Number(s.minute) || 0,
        team: userIsHome ? "away" : "home",
        playerOutId: s.outId ?? s.playerOutId,
        playerOutName: s.outName ?? s.playerOutName,
        playerInId: s.inId ?? s.playerInId,
        playerInName: s.inName ?? s.playerInName,
      })),
    ];
    const regularCards = playedCardsRef.current.length > 0
      ? playedCardsRef.current
      : (fixture.result?.cards || []);

    const etResult = simulateExtraTime(home, away, homeXI as any[], awayXI as any[], {
      homeBench,
      awayBench,
      regularSubstitutions,
      regularCards,
    });

    // Store only the CPU side's preplanned extra-time substitutions. The user
    // can make the additional change(s) manually through Dirección de equipo.
    const cpuSide = userIsHome ? "away" : "home";
    extraTimeSubsRef.current = (etResult.substitutions || []).filter((s: any) => s.team === cpuSide);
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

      // Apply the CPU's extra-time substitutions at their planned minutes.
      const etSubsAtMinute = extraTimeSubsRef.current.filter((s: any) => Number(s.minute) === m);
      if (etSubsAtMinute.length > 0) {
        const fx = fixtureRef.current;
        const userId = myTeamIdRef.current || save?.myTeamId;
        const cpuSide = fx && fx.homeId === userId ? "away" : "home";
        const xi = [...oppXIRef.current];
        const made: any[] = [];
        for (const s of etSubsAtMinute) {
          if (s.team !== cpuSide) continue;
          const outIndex = xi.findIndex((p: any) => p?.id === (s.playerOutId ?? s.outId));
          const incoming = oppBenchRef.current.find((p: any) => p?.id === (s.playerInId ?? s.inId));
          if (outIndex < 0 || !incoming) continue;
          const outgoing = xi[outIndex];
          xi[outIndex] = incoming;
          oppBenchRef.current = oppBenchRef.current.filter((p: any) => p.id !== incoming.id);
          const entry = {
            minute: m,
            team: cpuSide,
            inName: incoming.name,
            outName: outgoing.name,
            playerInId: incoming.id,
            playerOutId: outgoing.id,
          };
          made.push(entry);
        }
        if (made.length > 0) {
          oppXIRef.current = xi;
          oppSubsDoneRef.current = [...oppSubsDoneRef.current, ...made];
          setSubFeed((prev) => [...made.slice().reverse(), ...prev]);
        }
      }

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
          showHalftimeMoment(true);
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
    if (isLeg2) {
      const aggregateFixtures = fixtureRef.current?.europeanCompetition
        ? getEuropeanFixtureList(save, fixtureRef.current.europeanCompetition)
        : (save?.uclFixtures ?? []);
      const leg1 = aggregateFixtures.find(
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
    const userId = myTeamIdRef.current || save.myTeamId;
    const userIsHome = fixture.homeId === userId;
    const homeXI = userIsHome
      ? (myXIRef.current.length ? myXIRef.current.map((id) => playerById(id)).filter(Boolean) : getSimSquad(fixture.homeId))
      : oppXIRef.current;
    const awayXI = userIsHome
      ? oppXIRef.current
      : (myXIRef.current.length ? myXIRef.current.map((id) => playerById(id)).filter(Boolean) : getSimSquad(fixture.awayId));

    // Store XIs in refs for use in skipPenaltyShootoutToEnd
    homeXIRef.current = homeXI as any[];
    awayXIRef.current = awayXI as any[];

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
      matchType === "UCL" || isEuropeanFixture(fixture),
    );

    // Reload the fixture from save to get updated result
    const s = loadSave();
    if (s) {
      let found = null;
      if (isEuropeanFixture(fixture)) {
        found = findFixtureInEuropeanCompetitions(s, fixture.id);
        if (found) { fixtureRef.current = found; console.log("Reloaded European fixture with result after penalties:", found.result); }
      } else if (matchType === "UCL" && s.uclFixtures) {
        found = s.uclFixtures.find((f) => f.id === fixture.id);
        if (found) { fixtureRef.current = found; console.log("Reloaded UCL fixture with result after penalties:", found.result); }
      }
      // If not found in UCL, check cup fixtures
      if (!found) {
        for (const [league, fixtures] of Object.entries(s.cupFixtures)) {
          if (!Array.isArray(fixtures)) continue;
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
      matchType === "UCL" || isEuropeanFixture(fixture),
    );

    // Reload the fixture from save to get updated result
    const s = loadSave();
    if (s) {
      let found = null;
      if (isEuropeanFixture(fixture)) {
        found = findFixtureInEuropeanCompetitions(s, fixture.id);
        if (found) { fixtureRef.current = found; console.log("Reloaded European fixture with result:", found.result); }
      } else if (matchType === "UCL" && s.uclFixtures) {
        found = s.uclFixtures.find((f) => f.id === fixture.id);
        if (found) { fixtureRef.current = found; console.log("Reloaded UCL fixture with result:", found.result); }
      }
      // If not found in UCL, check cup fixtures
      if (!found) {
        for (const [league, fixtures] of Object.entries(s.cupFixtures)) {
          if (!Array.isArray(fixtures)) continue;
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
          .filter((list): list is any[] => Array.isArray(list))
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
      const europeanCompetition = fixtureRef.current?.europeanCompetition as "uel" | "uecl" | undefined;
      const fixtureList = europeanCompetition ? getEuropeanFixtureList(s, europeanCompetition) : (s?.uclFixtures ?? []);
      if (s && fixtureList) {
        const fx = fixtureList.find((f) => f.id === fixtureId);
        // For UCL matches, homeGoals and awayGoals should be regular time only
        // extraTime.homeGoals and extraTime.awayGoals are the additional goals in extra time
        const result: any = {
          // Keep the original simulation payload (especially match statistics)
          // and replace only the parts that the live chronicle actually changed.
          // playSpecificFixture() pre-simulates the fixture once, so its stats
          // are already coherent and should not disappear when the manager
          // chooses "Saltar al final" or finishes the live match.
          ...(fx?.result ?? {}),
          homeGoals: homeScore - (extraTimeData?.homeGoals || 0),
          awayGoals: awayScore - (extraTimeData?.awayGoals || 0),
          events: allEventsRef.current,
          cards: allCardsRef.current,
          injuries: fx?.result?.injuries ?? [],
          xgHome: Number.isFinite(fx?.result?.xgHome) ? fx.result.xgHome : 0,
          xgAway: Number.isFinite(fx?.result?.xgAway) ? fx.result.xgAway : 0,
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
        commitLiveInjuriesToPlayersStore(fx, result);

        const updated = fixtureList.map((f) => (f.id === fixtureId ? { ...f, result, europeanCompetition: europeanCompetition ?? f.europeanCompetition } : f));
        const newSave = europeanCompetition
          ? { ...s, [europeanCompetition === "uel" ? "uelFixtures" : "ueclFixtures"]: updated }
          : { ...s, uclFixtures: updated };
        saveSaveWithRetry(newSave as any);
        console.log(europeanCompetition ? `${europeanCompetition} result saved successfully` : "UCL result saved successfully");
      }
    } else if (isCup) {
      const s = loadSave();
      if (s) {
        // Find the cup fixture across all leagues first, so we know home/away teams.
        let cupFx: Fixture | undefined;
        for (const fxs of Object.values(s.cupFixtures)) {
          if (!Array.isArray(fxs)) continue;
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
          injuries: cupFx?.result?.injuries ?? [],
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
        commitLiveInjuriesToPlayersStore(cupFx, result);

        // Find the fixture to determine which league it belongs to
        let fixtureLeague = s.myLeague;
        for (const [league, fixtures] of Object.entries(s.cupFixtures)) {
          if (!Array.isArray(fixtures)) continue;
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
      originalLineupRef.current = s.lineups?.[s.myTeamId] ?? [];
      originalFormationRef.current = s.formations?.[s.myTeamId] ?? DEFAULT_FORMATION;
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
      let cupFixture: any = null;
      for (const list of Object.values(s.cupFixtures || {})) {
        if (!Array.isArray(list)) continue;
        cupFixture = list.find(
          (f: any) =>
            f.homeId === pendingUserMatch.homeTeam &&
            f.awayId === pendingUserMatch.awayTeam &&
            !f.result,
        );
        if (cupFixture) break;
      }
      fixtureRef.current = cupFixture || null;
    } else if (returningFromLineup && fixtureId) {
      // Returning from lineup edit - load the specific fixture by ID
      // First try league fixtures
      let foundFixture = s.fixtures?.[s.myLeague]?.find((f) => f.id === fixtureId);
      if (!foundFixture) {
        // Try cup fixtures
        for (const lg of Object.keys(s.cupFixtures || {}) as LeagueId[]) {
          const cupList = s.cupFixtures[lg];
          if (!Array.isArray(cupList)) continue;
          foundFixture = cupList.find((f) => f.id === fixtureId);
          if (foundFixture) break;
        }
      }
      if (!foundFixture) {
        const european = findFixtureInEuropeanCompetitions(s, fixtureId);
        if (european) foundFixture = european as any;
      }
      fixtureRef.current = foundFixture || null;

      // If fixture has a result, load it into the UI
      if (foundFixture?.result) {
        console.log("Loading fixture with result:", foundFixture.result);
        console.log("Has extraTime:", !!foundFixture.result.extraTime);
        console.log("Has penalties:", !!foundFixture.result.penalties);

        allEventsRef.current = foundFixture.result.events ?? [];
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
        setFeed((foundFixture.result.events ?? []).slice().reverse());
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
      // Open the fixture explicitly selected from the Season page. Falling
      // back to getMyNextFixtureAny is only for legacy navigation without an id.
      if (fixtureId) {
        let foundFixture = saveToUse.fixtures?.[saveToUse.myLeague]?.find(
          (f) => f.id === fixtureId,
        );

        if (!foundFixture) {
          for (const list of Object.values(saveToUse.cupFixtures || {})) {
            if (!Array.isArray(list)) continue;
            foundFixture = list.find((f: any) => f.id === fixtureId);
            if (foundFixture) break;
          }
        }

        if (!foundFixture) {
          foundFixture = saveToUse.uclFixtures?.find((f) => f.id === fixtureId);
        }
        if (!foundFixture) {
          foundFixture = findFixtureInEuropeanCompetitions(saveToUse, fixtureId);
        }

        fixtureRef.current = foundFixture || null;
      } else {
        fixtureRef.current = getMyNextFixtureAny(saveToUse);
      }

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

    // Always simulate from the freshest persisted save, not from a potentially
    // stale SeasonPage React snapshot. This guarantees the XI selected in
    // Alineación (e.g. Lunin instead of Courtois) is the XI the match engine
    // actually receives. A one-off lineup passed through router state remains
    // authoritative for this match only.
    let simulationSave = loadSave() ?? save;
    if (usedTemporaryLineup && matchLineup?.length && matchFormation) {
      simulationSave = setLineup(simulationSave, simulationSave.myTeamId, matchLineup);
      simulationSave = setFormation(simulationSave, simulationSave.myTeamId, matchFormation);
      const temporarySubs = Array.isArray(routerState?.matchSubstitutes)
        ? routerState.matchSubstitutes.filter(Boolean).slice(0, 12)
        : undefined;
      if (temporarySubs) {
        simulationSave = setSubstitutes(simulationSave, simulationSave.myTeamId, temporarySubs);
      }
    }

    const { save: newSave, fixture } = playSpecificFixture(
      simulationSave,
      fixtureRef.current.id,
    );

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
          undefined,
          undefined,
          matchType === "UCL" || isEuropeanFixture(fixture),
        );

        // The European save path is isolated from `uclFixtures`. Reload the
        // exact fixture we just committed so the live route cannot continue
        // with a stale pre-match result object.
        const committed = loadSave();
        if (committed) {
          const comp = europeanCompetitionOf(fixture);
          const committedFixture = comp
            ? findFixtureInEuropeanCompetitions(committed, fixture.id)
            : committed.uclFixtures?.find((f) => f.id === fixture.id);
          if (committedFixture) fixtureRef.current = committedFixture;
          setSave(committed);
        }
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

    if (shouldSkipToEnd) {
      // Do NOT start the real-time clock before fast-forwarding. Starting a
      // timeout here created a race with `skipToEnd()` and could leave the match
      // visually parked at 0' while the scheduled clock was immediately
      // cancelled. Fast-forward now owns the whole resolution path.
      setPhase("playing");
      try {
        skipToEnd(true);
      } catch (error) {
        // "Saltar al final" is allowed to recover from malformed legacy match
        // data. Never leave the route in an unfinished state or reject the
        // async startMatch promise.
        console.error("startMatch: skipToEnd failed", error);
        const current = fixtureRef.current;
        if (current?.result) {
          persistResultToSave(current.id, current.result);
        }
        setMinute(90);
        minuteRef.current = 90;
        setPhase("done");
      }
    } else {
      setPhase("playing");
      runClock();
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
    const ids = (matchLineup || s.lineups?.[s.myTeamId] || []).filter(Boolean).slice(0, 11);

    // IMPORTANT: only players explicitly registered as substitutes can enter
    // during this match. Everyone else remains in "Reservas" and is never
    // eligible for an automatic or manual in-match change.
    const configuredSubstitutes = Array.isArray(routerState?.matchSubstitutes)
      ? routerState.matchSubstitutes
      : Array.isArray(s.substitutes?.[s.myTeamId])
        ? s.substitutes[s.myTeamId]
        : [];
    const suspendedIds = getSuspendedPlayerIdsForCompetition(
      s,
      s.myTeamId,
      currentMatchCompetition(),
    );
    const matchDate = (fixtureRef.current as any)?.date ?? usePlayersStore.getState().currentDate;
    const matchday = Number((fixtureRef.current as any)?.matchday ?? 1);
    let benchIds = configuredSubstitutes
      .map((id) => String(id))
      .filter((id) => !ids.includes(id))
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is any => !!p)
      .filter((p) => !suspendedIds.has(p.id) && !isPlayerInjuredAtDate(p, matchDate, matchday))
      .slice(0, 12)
      .map((p) => p.id);

    // IMPORTANT: an empty/forkless substitute list means there are NO legal
    // in-match substitutes. Never promote players from Reservas here. Only
    // players explicitly saved in `substitutes[myTeamId]` can appear on the
    // match bench and enter the field.
    const st: Record<string, number> = {};
    const startingSet = new Set(ids);
    squad.forEach((p) => {
      // Starters carry their persisted physical energy into the match.
      // Everyone who begins on the bench/reserves is fresh at 100 for this match.
      st[p.id] = startingSet.has(p.id)
        ? Math.max(0, Math.min(100, Number(p.energy ?? STAMINA_START)))
        : STAMINA_START;
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
    goneSlotIndexesRef.current = {};
    pendingForcedInjurySlotsRef.current = {};
    setGoneIds([]);
    oppSubsDoneRef.current = [];
    deferredOpponentSubMinutesRef.current = new Set();
    playedEventsRef.current = [];
    playedCardsRef.current = [];
    playedHighlightsRef.current = [];
    subsUsedRef.current = 0;
    setSubsUsed(0);
    windowsUsedRef.current = 0;
    setWindowsUsed(0);
    subsRef.current = [];
    setSubsMade([]);
    autoSubPlanRef.current = [];
    handledInjuriesRef.current = [];
    halftimeDoneRef.current = false;
    etHalftimeDoneRef.current = false;
    pausedRef.current = false;
    pauseReasonRef.current = null;
    finishScheduledRef.current = false;
    setIsPaused(false);
    setPauseReason(null);
    setLiveFormation(matchFormation || s.formations?.[s.myTeamId] || null);
  }

  function currentLivePhase(): LivePhase {
    const activePauseReason = pauseReasonRef.current ?? pauseReason;
    if (activePauseReason === "halftime") return "halftime";
    if (activePauseReason === "et_break") return "et_break";
    if (activePauseReason === "et_halftime") return "et_halftime";
    return isExtraTimeRef.current ? "et_playing" : "playing";
  }

  const CHRONICLE_ONLY_TYPES = new Set([
    "save",
    "woodwork",
    "big_chance",
    "penalty_missed",
    "penalty_save",
    "penalty_goal",
    "injury",
    "injury_substitution",
    "forced_sub",
    "var",
    "var_disallowed",
    "red_card",
  ]);

  const isChronicleMoment = (moment: Partial<LiveMoment> | null | undefined) =>
    !!moment && CHRONICLE_ONLY_TYPES.has(String(moment.type ?? ""));

  function recordChronicleMoment(moment: LiveMoment) {
    // Prelude/presentation scenes (e.g. "SE CARGA EL DISPARO") pause the
    // match but must never become a permanent chronicle entry. The chronicle
    // is reserved for the resolved football event.
    if (!isChronicleMoment(moment)) return;
    const normalized = { ...moment } as LiveMoment;
    const same = (a: LiveMoment, b: LiveMoment) =>
      a.id === b.id ||
      (Number(a.minute ?? -1) === Number(b.minute ?? -2) &&
        String((a as any).type ?? "") === String((b as any).type ?? "") &&
        String((a as any).playerId ?? "") === String((b as any).playerId ?? "") &&
        String((a as any).title ?? "") === String((b as any).title ?? ""));
    const withoutDuplicate = keyMomentsRef.current.filter((item) => !same(item, normalized));
    keyMomentsRef.current = [...withoutDuplicate, normalized].slice(-200);
    setKeyMoments(keyMomentsRef.current);
  }

  function buildCardMoment(card: any): LiveMoment {
    const isSecondYellow = Boolean(card?.isSecondYellow);
    const isRed = card?.cardType === "red" || isSecondYellow;
    const team = card?.team === "home" ? home : away;
    return {
      id: `${isRed ? "red" : "yellow"}-${card?.minute ?? minuteRef.current}-${card?.playerId ?? "unknown"}`,
      type: isRed ? "red_card" : "yellow_card",
      minute: Number(card?.minute) || minuteRef.current,
      kicker: isRed ? "🟥 Tarjeta roja" : "🟨 Tarjeta amarilla",
      title: isSecondYellow ? "SEGUNDA AMARILLA" : isRed ? "ROJA" : "AMARILLA",
      body: isRed
        ? `${card?.playerName ?? "Jugador"} es expulsado. ${team.name} se queda con uno menos.`
        : `${card?.playerName ?? "Jugador"} ve la tarjeta amarilla.`,
      playerName: card?.playerName,
      playerId: card?.playerId,
      teamName: team.name,
      emoji: isRed ? "🟥" : "🟨",
      detail: card?.reason,
      hardPause: true,
      teamSide: card?.team,
    };
  }

  function showHalftimeMoment(extraTime = false) {
    const title = extraTime ? "DESCANSO DE LA PRÓRROGA" : "DESCANSO";
    const homeTotal = homeScoreRef.current + (extraTime ? extraTimeHomeScoreRef.current : 0);
    const awayTotal = awayScoreRef.current + (extraTime ? extraTimeAwayScoreRef.current : 0);
    const minute = extraTime ? 105 : 45;
    showLiveMoment(
      {
        id: `halftime-notification-${extraTime ? "et" : "regular"}-${minute}-${homeTotal}-${awayTotal}`,
        type: "halftime",
        minute,
        kicker: "⏸️ Descanso",
        title,
        body: `${home.name} ${homeTotal}-${awayTotal} ${away.name}.`,
        emoji: "⏸️",
        hardPause: true,
        teamName: `${home.name} vs ${away.name}`,
      } as any,
      3200,
      false,
    );
  }

  function announceHalftime(extraTime = false) {
    const title = extraTime ? "DESCANSO DE LA PRÓRROGA" : "DESCANSO";
    const homeTotal = homeScoreRef.current + (extraTime ? extraTimeHomeScoreRef.current : 0);
    const awayTotal = awayScoreRef.current + (extraTime ? extraTimeAwayScoreRef.current : 0);
    const minute = extraTime ? 105 : 45;
    recordChronicleMoment({
      id: `halftime-${extraTime ? "et" : "regular"}-${minute}-${homeTotal}-${awayTotal}`,
      type: "halftime",
      minute,
      kicker: "⏸️ Descanso",
      title,
      body: `${home.name} ${homeTotal}-${awayTotal} ${away.name}.`,
      emoji: "⏸️",
      hardPause: true,
      teamSide: undefined as any,
      teamName: "",
    } as any);
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
      goneSlotIndexes: { ...goneSlotIndexesRef.current },
      pendingForcedInjurySlots: { ...pendingForcedInjurySlotsRef.current },
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
      keyMoments: keyMomentsRef.current.slice(-200),
      playedEvents: playedEventsRef.current.slice(),
      playedCards: playedCardsRef.current.slice(),
      playedHighlights: playedHighlightsRef.current.slice(),
      opponentXI: oppXIRef.current.slice(),
      opponentBench: oppBenchRef.current.slice(),
      opponentFormation: oppCacheRef.current?.formation || "Táctica 4-4-2",
      opponentPlan: oppPlanRef.current.slice(),
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

  /** Injury of one of my players at this exact minute → the player leaves the pitch immediately. */
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

    // Registrar la lesión en el estado persistente en el mismo instante en que
    // ocurre. Así el jugador queda bloqueado también si el entrenador entra en
    // el editor de alineación durante la pausa por lesión. Al terminar el
    // encuentro se vuelve a confirmar y se guarda el snapshot definitivo.
    commitLiveInjuriesToPlayersStore(fx, fx.result);
    const currentIndex = myXIRef.current.indexOf(inj.playerId);
    if (currentIndex < 0) return false;

    const check = canSubstitute(
      {
        subsUsed: subsUsedRef.current,
        windowsUsed: windowsUsedRef.current,
        isExtraTime: isExtraTimeRef.current,
        phase: currentLivePhase(),
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

    // A real injury always removes the player from the pitch immediately.
    // When a legal replacement exists, remember the exact slot and force the
    // manager to fill it in the live lineup editor before returning.
    playWithOneLess(inj.playerId, inj.playerName, "injury");
    if (canReplaceNow) {
      pendingForcedInjurySlotsRef.current = {
        ...pendingForcedInjurySlotsRef.current,
        [inj.playerId]: currentIndex,
      };
    }
    persistLive();

    const moment = {
      id: `injury-sub-${m}-${inj.playerId}`,
      type: "injury_substitution",
      minute: m,
      kicker: "🚑 Lesión",
      title: "LESIÓN",
      body: canReplaceNow
        ? `${inj.playerName} sale del campo por lesión. Puedes sustituirlo o reorganizar el hueco antes de continuar.`
        : `${inj.playerName} sale del campo por lesión y el equipo seguirá con uno menos.`,
      playerName: inj.playerName,
      playerId: inj.playerId,
      teamName: mySide === "home" ? home.name : away.name,
      teamSide: mySide,
      teamLeagueName: getLeagueName(mySide === "home" ? home.league : away.league),
      emoji: "🚑",
      detail: inj.reason || "Lesión",
      forceLineupEdit: canReplaceNow,
      hardPause: true,
    } as any;
    pendingSceneRef.current = null;
    showLiveMoment(moment, 3200);
    return true;
  }

  function playWithOneLess(
    playerId: string,
    playerName?: string,
    reason: "red_card" | "injury" | "other" = "other",
  ) {
    const currentIndex = myXIRef.current.indexOf(playerId);
    // A player who leaves because of a red card or injury is permanently out
    // for the rest of this match. He must NOT be returned to the substitutes
    // list, otherwise the lineup editor could expose him as a legal replacement.
    if (currentIndex >= 0 && reason !== "red_card") {
      // Keep the old slot only through goneSlotIndexes/pending injury state.
      // The player itself is never re-added to the bench.
    }
    const nextXI = myXIRef.current.map((id) => (id === playerId ? "" : id));

    // A red card owns the exact slot vacated by the expelled player. Record it
    // immediately for both direct reds and second-yellow reds, so the lineup
    // editor can always render a movable red-card hole after returning.
    if (reason === "red_card" && currentIndex >= 0) {
      goneSlotIndexesRef.current = {
        ...goneSlotIndexesRef.current,
        [playerId]: currentIndex,
      };
    }

    myXIRef.current = nextXI;
    setMyXI(nextXI);

    // Keep players who have left the pitch visible in the match bench.
    // They are still blocked by `liveGoneIds()`, so they cannot return, but
    // they must not visually disappear from the substitutes panel.
    myBenchRef.current = Array.from(
      new Set([
        ...myBenchRef.current.filter((id) => id !== playerId),
        playerId,
      ]),
    );
    setMyBench(myBenchRef.current);

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
    if (ev.type === "own_goal") return normalizeOwnGoalEvent(ev);
    const pool = ev.team === mySideOf(fx) ? myOnPitchPlayers() : oppXIRef.current;
    if (!pool || pool.length === 0) return { ...ev };
    const activePool = pool.filter(Boolean);
    const onPitch = new Set(activePool.map((p: any) => p.id));
    let next: any = { ...ev, _origScorerId: ev.scorerId, _origAssistId: ev.assistId };
    if (next.scorerId && !onPitch.has(next.scorerId)) {
      const repl = pickCredit(activePool);
      if (repl) next = { ...next, scorerId: repl.id, scorerName: repl.name };
    }
    if (next.assistId && (!onPitch.has(next.assistId) || next.assistId === next.scorerId)) {
      const repl = pickCredit(activePool, [next.scorerId]);
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
    const activePool = pool.filter(Boolean);
    const onPitch = new Set(activePool.map((p: any) => p.id));
    if (onPitch.has(c.playerId)) return { ...c };
    const repl = pickCredit(activePool);
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

  /**
   * The live match engine generates injury events up front, but they are only
   * match-result data until we commit the result. Earlier live matches forgot
   * this second step, so the injury disappeared from Dirección de equipo and
   * Lesiones as soon as the user returned to the season.
   *
   * Commit every injury for both teams. The operation is idempotent because
   * `recordInjury` stores the same absolute recovery date instead of adding a
   * new injury on top of an existing one.
   */
  function commitLiveInjuriesToPlayersStore(fixture: any, result: any) {
    if (!fixture || !result) return;
    const injuries = Array.isArray(result.injuries) ? result.injuries : [];
    if (injuries.length === 0) return;

    const playerStore = usePlayersStore.getState();
    const rawMatchDate = fixture.date || playerStore.currentDate;
    const matchDate = typeof rawMatchDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawMatchDate)
      ? rawMatchDate
      : playerStore.currentDate;

    for (const injury of injuries) {
      try {
        const playerId = injury?.playerId ? String(injury.playerId) : "";
        if (!playerId) continue;

        // `getSimPlayer` resolves the current club (including transfers), so the
        // injury is attached to the same player record that Dirección de equipo
        // and Lesiones read afterwards.
        const player = playerStore.getSimPlayer(playerId);
        if (!player) {
          console.warn(`[injuries] jugador no encontrado al cerrar ${fixture.id}: ${playerId}`);
          continue;
        }

        const requestedDays = Number(injury.durationDays);
        const requestedWeeks = Number(injury.weeks);
        const durationDays = Math.min(180,
          Number.isFinite(requestedDays) && requestedDays > 0
            ? requestedDays
            : Math.max(7, Number.isFinite(requestedWeeks) && requestedWeeks > 0 ? requestedWeeks * 7 : 7),
        );
        const safeDuration = Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 7;
        const untilDate = addDaysToIso(matchDate, safeDuration);
        const teamLeague = teamById(player.teamId)?.league;
        const currentLeagueMd = teamLeague
          ? (save?.currentMatchday?.[teamLeague] ?? 1)
          : 1;
        const fallbackWeeks = Math.max(1, Math.ceil(safeDuration / 7));

        playerStore.recordInjury(
          playerId,
          currentLeagueMd + (Number.isFinite(requestedWeeks) && requestedWeeks > 0
            ? Math.ceil(requestedWeeks)
            : fallbackWeeks),
          injury.reason || injury.diagnosis || "Lesión",
          {
            startDate: matchDate,
            untilDate,
            durationDays: safeDuration,
            injuryType: injury.injuryType ?? injury.diagnosis,
            injuryArea: injury.bodyPart,
          },
        );
      } catch (error) {
        // Nunca dejes que un registro médico mal formado bloquee el cierre del
        // partido ni el guardado del resultado.
        console.error(`[injuries] no se pudo registrar una lesión en ${fixture.id}:`, error);
      }
    }
  }

  function persistResultToSave(fixtureId: string, result: any) {
    const current = loadSave();
    if (!current || !result) return current ?? null;

    // Todas las competiciones usan una única ruta de commit. Esto evita que
    // la vista de partido dependa de helpers internos del motor europeo y,
    // sobre todo, impide errores como `runEuropeanEngine is not defined` al
    // cerrar un partido de Europa League/Conference.
    const next = commitLiveFixtureResult(current, fixtureId, result);
    setSave(next);
    return next;
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

    const getTeamSquad = (teamId: string) => getSimSquad(teamId);

    const initialIdsForSide = (side: "home" | "away") => {
      if (side === mySide && initialMyXIRef.current.length > 0) {
        return initialMyXIRef.current.slice(0, 11);
      }
      const fallback = side === "home" ? result.homeStartingLineup ?? result.homeLineup : result.awayStartingLineup ?? result.awayLineup;
      return Array.isArray(fallback)
        ? fallback.map((p: any) => p?.id ?? p).filter(Boolean).slice(0, 11)
        : [];
    };

    const initialPlayersForSide = (side: "home" | "away") => {
      const teamId = side === "home" ? fx.homeId : fx.awayId;
      const squad = getTeamSquad(teamId);
      return initialIdsForSide(side)
        .map((id: string) => squad.find((p: any) => p.id === id))
        .filter(Boolean) as any[];
    };

    const homeInitial = initialPlayersForSide("home");
    const awayInitial = initialPlayersForSide("away");

    const substitutions = [
      ...subsRef.current.map((s: any) => ({
        minute: Number(s.minute) || 0,
        team: mySide,
        playerOutId: s.outId,
        playerInId: s.inId,
      })),
      ...(oppSubsDoneRef.current || []).map((s: any) => ({
        minute: Number(s.minute) || 0,
        team: s.team,
        playerOutId: s.outId ?? s.playerOutId,
        playerInId: s.inId ?? s.playerInId,
      })),
    ].sort((a, b) => a.minute - b.minute);

    const squadCache = new Map<string, any[]>([
      [fx.homeId, getTeamSquad(fx.homeId)],
      [fx.awayId, getTeamSquad(fx.awayId)],
    ]);

    const resolvePlayer = (side: "home" | "away", id: string) =>
      squadCache
        .get(side === "home" ? fx.homeId : fx.awayId)
        ?.find((p: any) => p.id === id);

    // Final XI = who is actually on the pitch at full time.
    const finalLineup = (initial: any[], side: "home" | "away") => {
      const players = [...initial];
      for (const sub of substitutions.filter((x) => x.team === side)) {
        const outIndex = players.findIndex((p: any) => p.id === sub.playerOutId);
        const incoming = resolvePlayer(side, sub.playerInId);
        if (outIndex >= 0 && incoming) players[outIndex] = incoming;
      }
      return players.filter(Boolean);
    };

    // Participants = every player who actually appeared: every starter plus
    // every substitute who entered. A starter who was later substituted off
    // must remain in this collection so his appearance, minutes and rating are
    // retained. This is deliberately different from the final XI.
    const participants = (initial: any[], side: "home" | "away") => {
      const out = [...initial];
      const seen = new Set(initial.map((p) => p.id));
      for (const sub of substitutions.filter((x) => x.team === side)) {
        const incoming = resolvePlayer(side, sub.playerInId);
        if (incoming && !seen.has(incoming.id)) {
          out.push(incoming);
          seen.add(incoming.id);
        }
      }
      return out;
    };

    const homeParticipants = participants(homeInitial, "home");
    const awayParticipants = participants(awayInitial, "away");
    const homeFinalXI = finalLineup(homeInitial, "home");
    const awayFinalXI = finalLineup(awayInitial, "away");

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

      const allParticipants = side === "home" ? homeParticipants : awayParticipants;
      for (const p of allParticipants) {
        minutes[p.id] = Math.max(0, Math.min(120, Math.round(minutes[p.id] ?? 0)));
      }

      // A late substitution still counts as an appearance even if the engine's
      // minute arithmetic gives it 0. Give it the minimum visible match minute.
      for (const sub of substitutions.filter((x) => x.team === side)) {
        if (minutes[sub.playerInId] === 0) minutes[sub.playerInId] = 1;
      }

      return minutes;
    };

    const endMinute = result.extraTime ? 120 : 90;
    const minutesPlayed = {
      ...calculateMinutes(homeInitial, "home", endMinute),
      ...calculateMinutes(awayInitial, "away", endMinute),
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
      homeStartingXI: homeInitial,
      awayStartingXI: awayInitial,
      homeParticipants,
      awayParticipants,
      homeFinalXI,
      awayFinalXI,
      minutesPlayed,
    };
  }

  function recordFinalUserPerformance(result: any) {
    if (finalPerformanceRecordedRef.current) return null;
    const fx = fixtureRef.current;
    if (!fx) return null;

    const performance = buildActualLivePerformance(result);
    if (!performance) return null;

    const store = usePlayersStore.getState();
    const participants = [...performance.homeParticipants, ...performance.awayParticipants];

    // Every player who actually appeared gets one appearance, regardless of
    // whether he started or entered from the bench. Do this for BOTH teams.
    for (const p of participants) {
      store.recordAppearance(p.id, fx.competition, performance.minutesPlayed[p.id] ?? 1);
    }

    // Persist match ratings for every player who actually appeared, including
    // starters who were later substituted and substitutes who entered.
    for (const pr of performance.ratings) {
      store.recordMatchRating(pr.playerId, pr.rating);
    }

    const finalHomeGoals = (result.homeGoals ?? 0) + (result.extraTime?.homeGoals ?? 0);
    const finalAwayGoals = (result.awayGoals ?? 0) + (result.extraTime?.awayGoals ?? 0);

    // Preserve the existing clean-sheet behaviour, but evaluate the goalkeeper
    // who was actually on the pitch at full time for each side.
    if (finalAwayGoals === 0) {
      const gk = performance.homeFinalXI.find((p: any) => p.positions?.includes("GK"));
      if (gk && performance.minutesPlayed[gk.id] > 0) {
        store.recordCleanSheet(gk.id, fx.competition);
      }
    }
    if (finalHomeGoals === 0) {
      const gk = performance.awayFinalXI.find((p: any) => p.positions?.includes("GK"));
      if (gk && performance.minutesPlayed[gk.id] > 0) {
        store.recordCleanSheet(gk.id, fx.competition);
      }
    }

    if (performance.mvp) {
      store.recordMotm(performance.mvp.playerId, fx.competition);
    }

    // Match energy is physical state, independent from form. Persist the
    // exact final stamina for the manager's XI and reconstruct the opponent's
    // energy from the substitutions that actually happened in the chronicle.
    // This avoids using the engine's pre-planned substitution list when the AI
    // changed its plan during the live match. Unused bench/reserve players are
    // reset to 100 by setTeamMatchEnergy.
    const myTeamId = myTeamIdRef.current || save?.myTeamId;
    const opponentTeamId = myTeamId && fx.homeId === myTeamId ? fx.awayId : fx.homeId;

    if (myTeamId) {
      store.setTeamMatchEnergy(myTeamId, { ...staminaRef.current }, fx.date);
    }

    if (opponentTeamId) {
      const opponentSide: "home" | "away" = fx.homeId === opponentTeamId ? "home" : "away";
      const opponentInitial = opponentSide === "home" ? performance.homeParticipants : performance.awayParticipants;
      const opponentSubstitutions = [
        ...(oppSubsDoneRef.current || [])
          .filter((sub: any) => sub.team === opponentSide)
          .map((sub: any) => ({
            minute: Number(sub.minute) || 0,
            playerOutId: sub.outId ?? sub.playerOutId,
            playerInId: sub.inId ?? sub.playerInId,
          })),
      ].sort((a, b) => a.minute - b.minute);
      const opponentTactics = loadTactics(opponentTeamId) || {};
      const opponentPressure = opponentTactics.pressure || "medium";
      const opponentStaminaMultiplier = tacticsModifiers(opponentTactics).stamina;

      const opponentEnergy: Record<string, number> = {};
      for (const player of opponentInitial) {
        const mins = Number(performance.minutesPlayed[player.id] ?? 0);
        if (mins <= 0) {
          opponentEnergy[player.id] = STAMINA_START;
          continue;
        }
        // The opponent is CPU-controlled: every player starts this match
        // fully fresh, regardless of the energy stored on the player object.
        // CPU fatigue is only an in-match effect and is never carried into
        // their next fixture.
        const startEnergy = STAMINA_START;
        const drain = drainPerMinute(
          player.positions?.[0] ?? "MC",
          opponentPressure as "low" | "medium" | "high",
          opponentStaminaMultiplier,
        );
        opponentEnergy[player.id] = Math.round(
          Math.max(0, Math.min(100, startEnergy - mins * drain)) * 10,
        ) / 10;
      }

      store.setTeamMatchEnergy(opponentTeamId, opponentEnergy, fx.date);
    }

    finalPerformanceRecordedRef.current = true;
    return performance;
  }

  function finalizePlayedChronicle() {
    const fx = fixtureRef.current;
    if (!fx?.result) return;
    const comp = fx.competition;
    const store = usePlayersStore.getState();

    // The live match is provisional until it ends, so its goals/assists must
    // be committed exactly once from the final chronicle. Previously we only
    // reconciled changed scorers against an imaginary provisional stat, which
    // meant unchanged scorers were never credited at all.
    const strip = (o: any) => {
      const { _origScorerId, _origAssistId, ...rest } = o;
      return rest;
    };
    if (!playerScoringStatsRecordedRef.current) {
      const scoringEvents = [
        ...playedEventsRef.current.map(strip),
        ...extraTimeEventsRef.current,
      ].filter((ev: any) =>
        ev &&
        ["goal", "penalty_goal", "free_kick_goal"].includes(ev.type) &&
        ev.scorerId,
      );

      for (const ev of scoringEvents) {
        store.recordGoal(ev.scorerId, comp);
        if (ev.assistId) store.recordAssist(ev.assistId, comp);
      }

      playerScoringStatsRecordedRef.current = true;
    }

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

    // The live chronicle is the source of truth for the final regular-time
    // score. The fixture can still contain the pre-simulated score from before
    // entering the live match (for example 1-0 at half-time), so spreading
    // fx.result here would resurrect that old score and ignore goals that were
    // actually played during the fast-forward.
    // The live score refs are the only authoritative score once the match has
    // started. Rebuilding the score from the pre-simulated events can resurrect
    // a discarded goal or miss an interactive penalty/VAR decision.
    const liveHomeGoals = Number(homeScoreRef.current || 0);
    const liveAwayGoals = Number(awayScoreRef.current || 0);

    homeScoreRef.current = liveHomeGoals;
    awayScoreRef.current = liveAwayGoals;
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

    // Goal/assist statistics are committed above for both teams before the
    // user-only performance pass. This keeps the final scorer table in sync
    // with the official live chronicle.
    const performance = recordFinalUserPerformance(nextResult);
    const finalResult = performance
      ? {
          ...nextResult,
          ratings: performance.ratings,
          mvp: performance.mvp,
          // `homeLineup` / `awayLineup` are the STARTING XI. Keep them stable
          // for the post-match lineup screen even when a starter was subbed
          // off. The final XI is persisted separately for consumers that need
          // the players on the pitch at the end.
          homeLineup: performance.homeStartingXI,
          awayLineup: performance.awayStartingXI,
          homeStartingLineup: performance.homeStartingXI,
          awayStartingLineup: performance.awayStartingXI,
          homeFinalLineup: performance.homeFinalXI,
          awayFinalLineup: performance.awayFinalXI,
          energyAtEnd: {
            ...(nextResult.energyAtEnd || {}),
            ...staminaRef.current,
          },
        }
      : nextResult;

    fixtureRef.current = { ...fx, result: finalResult } as any;
    commitLiveInjuriesToPlayersStore(fx, finalResult);
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
    const fx = fixtureRef.current;
    if (!fx) return;
    const myId = myTeamIdRef.current || save?.myTeamId;
    const oppSide = fx.homeId === myId ? "away" : "home";
    const redIds = new Set(
      (fx.result?.cards || [])
        .filter((c: any) => c.team === oppSide && (c.cardType === "red" || c.isSecondYellow) && Number(c.minute ?? 0) <= m)
        .map((c: any) => c.playerId),
    );
    const due = oppPlanRef.current.filter(
      (s) =>
        s.minute === m &&
        !alreadyDone.has(`${s.minute}|${s.outId}|${s.inId}`) &&
        !redIds.has(s.outId),
    );
    if (due.length === 0) return;
    const xi = [...oppXIRef.current];
    const made: any[] = [];
    for (const s of due) {
      // Be resilient: if the planned player is not on the pitch (or the planned
      // substitute is not on the bench any more) use a valid one instead, so the
      // rival always makes his changes.
      let idx = xi.findIndex((p: any) => p?.id === s.outId);
      if (idx === -1) {
        idx = xi.findIndex((p: any) => p && !isGkPlayer(p));
      }
      const inn =
        oppBenchRef.current.find((p: any) => p.id === s.inId) ??
        oppBenchRef.current.find((p: any) => !isGkPlayer(p)) ??
        oppBenchRef.current[0];
      if (idx === -1 || !inn) continue;
      const out = xi[idx];
      if (!out) continue;
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
    // before the clock is allowed to advance again. Every notification that is
    // actually shown to the manager is also stored in the match chronicle.
    if (momentTimerRef.current !== null) {
      window.clearTimeout(momentTimerRef.current);
      momentTimerRef.current = null;
    }
    setLiveMoment(moment);
    if (recordKeyMoment) {
      recordChronicleMoment(moment);
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

    if (scene?.kind === "card") {
      const remainingCards = Array.isArray(scene.source?.remainingCards) ? scene.source.remainingCards : [];
      const currentMinute = minuteRef.current;
      if (remainingCards.length > 0) {
        const [card, ...restCards] = remainingCards;
        pendingSceneRef.current = {
          kind: "card",
          moment: buildCardMoment(card),
          source: {
            remainingCards: restCards,
            nextHalftime: restCards.length === 0 && currentMinute === 45 && !isExtraTimeRef.current,
            extraTime: false,
          },
        };
        setLiveMoment(pendingSceneRef.current.moment);
        return;
      }

      pendingSceneRef.current = null;
      setLiveMoment(null);
      if (scene.source?.nextHalftime) {
        if (scene.source.extraTime) {
          showHalftimeMoment(true);
        } else {
          showHalftimeMoment(false);
        }
        return;
      }
      if (currentMinute >= 90 && !isExtraTimeRef.current) {
        finishRegularLiveMatch();
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

    if (scene?.kind === "resolution") {
      const currentMinute = minuteRef.current;
      const nextVar = scene.source?.nextVar;
      if (nextVar) {
        const liveVarHighlight = remapHighlightToPitch(nextVar);
        const varMoment = buildMomentFromHighlight({
          highlight: liveVarHighlight,
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
            cards: scene.source?.cards || [],
          },
        };
        setLiveMoment(pendingSceneRef.current.moment);
        persistLive();
        return;
      }

      const resolvedCards = Array.isArray(scene.source?.cards) ? scene.source.cards : [];
      if (resolvedCards.length > 0) {
        const [card, ...restCards] = resolvedCards;
        pendingSceneRef.current = {
          kind: "card",
          moment: buildCardMoment(card),
          source: {
            remainingCards: restCards,
            nextHalftime: restCards.length === 0 && currentMinute === 45 && !isExtraTimeRef.current,
            extraTime: false,
          },
        };
        setLiveMoment(pendingSceneRef.current.moment);
        return;
      }

      const remainingPostCards = Array.isArray(scene.source?.remainingCards) ? scene.source.remainingCards : [];
      if (remainingPostCards.length > 0) {
        const [card, ...restCards] = remainingPostCards;
        pendingSceneRef.current = {
          kind: "card",
          moment: buildCardMoment(card),
          source: {
            remainingCards: restCards,
            nextHalftime: restCards.length === 0 && currentMinute === 45 && !isExtraTimeRef.current,
            extraTime: false,
          },
        };
        setLiveMoment(pendingSceneRef.current.moment);
        return;
      }

      pendingSceneRef.current = null;
      setLiveMoment(null);
      if (currentMinute === 45 && !isExtraTimeRef.current) {
        halftimePendingAfterMomentRef.current = false;
        showHalftimeMoment(false);
        return;
      }
      if (currentMinute >= 90 && !isExtraTimeRef.current) {
        finishRegularLiveMatch();
        return;
      }
      if (currentMinute === 105 && isExtraTimeRef.current) {
        showHalftimeMoment(true);
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
      const varCards = Array.isArray(scene.source?.cards) ? scene.source.cards : [];
      pendingSceneRef.current = null;
      setLiveMoment(null);
      const currentMinute = minuteRef.current;
      if (varCards.length > 0) {
        const [card, ...restCards] = varCards;
        pendingSceneRef.current = {
          kind: "card",
          moment: buildCardMoment(card),
          source: {
            remainingCards: restCards,
            nextHalftime: restCards.length === 0 && currentMinute === 45 && !isExtraTimeRef.current,
            extraTime: false,
          },
        };
        setLiveMoment(pendingSceneRef.current.moment);
        return;
      }
      if (currentMinute >= 90 && !isExtraTimeRef.current) {
        finishRegularLiveMatch();
        return;
      }
      if (currentMinute === 45 && !isExtraTimeRef.current) {
        showHalftimeMoment(false);
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
    const wasOpponentInjury =
      liveMoment.type === "injury" && liveMoment.teamSide && liveMoment.teamSide !== mySideOf(fixtureRef.current);
    const wasMyRedCard =
      liveMoment.type === "red_card" && liveMoment.teamSide === mySideOf(fixtureRef.current);
    const wasHalftime = liveMoment.type === "halftime";
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

    // After a red card, the player is already off the pitch, but the manager
    // decides which formation slot becomes the visible vacancy. Open the live
    // lineup editor instead of silently choosing the old slot.
    if (wasMyRedCard) {
      goEditLineupLive();
      return;
    }

    // For an opponent injury, execute the forced substitution only after the
    // injury notification has been acknowledged. The chronicle therefore reads
    // naturally: 29' injury, then 29' change.
    if (wasOpponentInjury && deferredOpponentSubMinutesRef.current.has(currentMinute)) {
      deferredOpponentSubMinutesRef.current.delete(currentMinute);
      applyOpponentSubsAt(currentMinute);
      const deferredForced = (allHighlightsRef.current || []).filter(
        (h: any) =>
          h.minute === currentMinute &&
          h.type === "forced_sub" &&
          h.team !== mySideOf(fixtureRef.current),
      );
      if (deferredForced.length > 0) {
        const nextHighlights = [...playedHighlightsRef.current, ...deferredForced];
        playedHighlightsRef.current = nextHighlights.filter(
          (item, index, arr) =>
            arr.findIndex(
              (x) =>
                x.minute === item.minute &&
                x.type === item.type &&
                x.team === item.team &&
                x.playerId === item.playerId,
            ) === index,
        );
        setHighlightFeed((prev) => [
          ...deferredForced,
          ...prev.filter(
            (item: any) =>
              !deferredForced.some(
                (d: any) =>
                  d.minute === item.minute && d.type === item.type && d.team === item.team && d.playerId === item.playerId,
              ),
          ),
        ]);
      }
      persistLive();
    }

    if (wasHalftime && currentMinute === 45 && !isExtraTimeRef.current) {
      halftimePendingAfterMomentRef.current = false;
      pauseReasonRef.current = "halftime";
      setPauseReason("halftime");
      pausedRef.current = true;
      setIsPaused(true);
      halftimeDoneRef.current = true;
      persistLive();
      return;
    }

    if (wasHalftime && currentMinute === 105 && isExtraTimeRef.current) {
      halftimePendingAfterMomentRef.current = false;
      pauseReasonRef.current = "et_halftime";
      setPauseReason("et_halftime");
      pausedRef.current = true;
      setIsPaused(true);
      etHalftimeDoneRef.current = true;
      persistLive();
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
    const fx = fixtureRef.current;
    const myId = myTeamIdRef.current || save?.myTeamId;
    if (fx?.homeId === myId) {
      return team === "home"
        ? myXIRef.current.map((id) => playerById(id)).filter(Boolean)
        : (oppXIRef.current || []).filter(Boolean);
    }
    if (fx?.awayId === myId) {
      return team === "away"
        ? myXIRef.current.map((id) => playerById(id)).filter(Boolean)
        : (oppXIRef.current || []).filter(Boolean);
    }
    // Fallback defensivo para partidas antiguas sin myTeamId consistente.
    return team === mySideOf(fx)
      ? myXIRef.current.map((id) => playerById(id)).filter(Boolean)
      : (oppXIRef.current || []).filter(Boolean);
  }

  function openInteractivePenaltyModal(source: any) {
    const fx = fixtureRef.current;
    if (!fx) return;
    const myId = myTeamIdRef.current || save?.myTeamId;
    const mySide: "home" | "away" = fx.homeId === myId ? "home" : "away";
    const attackingPlayers = (getCurrentPitchPlayers(source.team) as any[]).filter(
      (p) => p && !isGoalkeeperForDanger(p),
    );
    const tactics = loadTactics(myId || "");
    const designatedId = source.team === mySide ? tactics.penaltyTakerId : null;
    const shootingScore = (p: any) => {
      const s = getPlayerShootingStats(p?.id);
      const penalties = Number(p?.penaltyRating ?? p?.penalties ?? s.penalties ?? 0);
      return (penalties * 0.45) + (s.finishing * 0.22) + (s.shooting * 0.13) +
        (s.composure * 0.10) + (s.shotPower * 0.05) + (s.volleys * 0.03) +
        (s.longShots * 0.02);
    };
    const bestPenaltyTaker = attackingPlayers
      .slice()
      .sort((a, b) => shootingScore(b) - shootingScore(a) || Number(b.rating ?? 0) - Number(a.rating ?? 0))[0];
    const preferred =
      attackingPlayers.find((p) => p.id === designatedId) ??
      (source.team === mySide ? attackingPlayers.find((p) => p.id === source.scorerId) : null) ??
      bestPenaltyTaker;
    const defendingPlayers = getCurrentPitchPlayers(
      source.team === "home" ? "away" : "home",
    ) as any[];
    const keeper = defendingPlayers.find((p) => isGoalkeeperForDanger(p));
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
        .filter((p) => p && !isGoalkeeperForDanger(p))
        .slice()
        .sort((a, b) => {
          const score = (p: any) => {
            const s = getPlayerShootingStats(p?.id);
            const penalties = Number(p?.penaltyRating ?? p?.penalties ?? s.penalties ?? 0);
            return (penalties * 0.45) + (s.finishing * 0.22) + (s.shooting * 0.13) +
              (s.composure * 0.10) + (s.shotPower * 0.05) + (s.volleys * 0.03) +
              (s.longShots * 0.02);
          };
          return score(b) - score(a) || Number(b.rating ?? 0) - Number(a.rating ?? 0);
        })[0];
    const defendingPlayers = getCurrentPitchPlayers(
      attackingSide === "home" ? "away" : "home",
    ) as any[];
    const keeper = defendingPlayers.find((p) => isGoalkeeperForDanger(p));

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
      // The selected cell is the actual shot location. The keeper independently
      // chooses a dive cell. If both are the same physical zone, the keeper
      // always gets there: a shot cannot be a goal when the goalkeeper correctly
      // dives to that exact cell.
      actualTargetZone = weightedPenaltyZone(keeperWeights);
      const keeperGuessed = actualTargetZone === zoneId;
      const accuracy = (takerRating - 70) * 0.0055 + baselineBias;
      const keeperFactor = (keeperRating - 75) * 0.0028;
      if (keeperGuessed) {
        scored = false;
      } else {
        const chance = Math.max(
          0.62,
          Math.min(0.985, 0.86 + accuracy + zoneDifficulty[zoneId] - keeperFactor),
        );
        scored = Math.random() < chance;
      }
    } else {
      // The CPU striker secretly chooses a physical target zone. The manager
      // controls only the goalkeeper's dive. Matching the exact zone always
      // produces a save; a different zone normally produces a goal, with
      // goalkeeper/taker quality adding only a small secondary swing.
      actualTargetZone = weightedPenaltyZone(strikerWeights);
      const guessed = actualTargetZone === zoneId;
      // En los penaltis que lanza la CPU, la decisión del portero del usuario
      // tiene que ser determinante: solo hay parada si ambas direcciones
      // coinciden. Si el portero se lanza a otra zona, no puede aparecer una
      // parada "por suerte" porque eso contradice la decisión visual tomada.
      if (guessed) {
        scored = false;
      } else {
        scored = true;
      }
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
        ? `Jugador tiró: ${penaltyZoneLabel(zoneId)} · Portero se lanzó: ${penaltyZoneLabel(actualTargetZone)}.`
        : `Jugador tiró: ${penaltyZoneLabel(actualTargetZone)} · Portero se lanzó: ${penaltyZoneLabel(zoneId)}.`,
    } satisfies PendingPenalty["resolution"];

    recordChronicleMoment({
      id: `penalty-resolution-${source.minute}-${attackingSide}-${selected?.id ?? source.scorerId ?? "unknown"}-${zoneId}-${actualTargetZone}-${scored}`,
      type: scored ? "penalty_goal" : "penalty_save",
      minute: Number(source.minute) || minuteRef.current,
      kicker: "🥅 Penalti",
      title: resolution.label,
      body: `${playerName} · ${pending.attacking ? "Lanzamiento" : "Parada desde la portería"}. ${resolution.detail}`,
      detail: resolution.detail,
      playerId: selected?.id ?? source.scorerId,
      playerName,
      teamSide: attackingSide,
      teamName: attackingSide === "home" ? home.name : away.name,
      emoji: scored ? "⚽" : "🧤",
      hardPause: true,
    } as any);

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
      showHalftimeMoment(false);
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

  function remapHighlightToPitch(h: any) {
    const fx = fixtureRef.current;
    if (!fx || !h) return h;

    // Highlights are generated before the live manager can change the XI.
    // Re-anchor the protagonist to whoever is ACTUALLY on the pitch when the
    // minute is reached. This is especially important for goalkeeper saves:
    // a keeper who was replaced before the highlight must never appear as the
    // player making the save.
    const highlightTeam = h.team as "home" | "away";
    const players = (getCurrentPitchPlayers(highlightTeam) as any[]).filter(Boolean);
    if (!players.length) return { ...h };

    if (h.type === "save") {
      const keeper = players.find((p) => isGoalkeeperForDanger(p));
      if (!keeper) return { ...h };
      if (h.playerId === keeper.id && h.playerName === keeper.name) return { ...h };
      return {
        ...h,
        playerId: keeper.id,
        playerName: keeper.name,
      };
    }

    // For all other player-based highlights, keep the original footballer when
    // he is still on the pitch; otherwise replace it with a valid outfield
    // player from that team.
    if (h.playerId && players.some((p) => p.id === h.playerId)) return { ...h };
    const repl = pickCredit(players);
    return repl ? { ...h, playerId: repl.id, playerName: repl.name } : { ...h };
  }

  function applyMinuteOutcome(m: number, rawEvents: any[], rawCards: any[], rawHighlights: any[]) {
    const fx = fixtureRef.current;
    const mySide = mySideOf(fx);
    const opponentSide = mySide === "home" ? "away" : "home";
    const hasOpponentInjury = rawHighlights.some(
      (h: any) => h.type === "injury" && h.team === opponentSide,
    );
    if (hasOpponentInjury) {
      deferredOpponentSubMinutesRef.current.add(m);
    }

    const events = rawEvents.map(remapEventToPitch);
    const cards = rawCards.map(remapCardToPitch);
    const hls = rawHighlights
      .filter((h: any) => {
        if (h.type === "penalty_missed") return false;
        // Forced opponent changes are shown only after the injury interruption.
        if (h.type === "forced_sub" && hasOpponentInjury && h.team === opponentSide) return false;
        return h.type !== "forced_sub";
      })
      .map(remapHighlightToPitch);

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
          // A red card removes the player immediately, but the vacant formation
          // slot is deliberately left unassigned. The manager chooses the hole
          // position in the live lineup editor after the notification.
          playWithOneLess(c.playerId, c.playerName, "red_card");
        }
      }
    }
    // Rival red cards remove the player from the minimap immediately, while
    // preserving his original formation slot as an actual empty space.
    for (const c of cards) {
      if (c.team !== opponentSide || !(c.cardType === "red" || c.isSecondYellow)) continue;
      const idx = oppXIRef.current.findIndex((p: any) => p?.id === c.playerId);
      if (idx >= 0) oppXIRef.current[idx] = null;
      oppPlanRef.current = oppPlanRef.current.filter((plan: any) => plan.outId !== c.playerId);
    }
    if (!hasOpponentInjury) {
      applyOpponentSubsAt(m);
    }
    return { events, cards, hls };
  }

  function playerPositionCodesForDanger(player: any): string[] {
    const raw = [
      ...(Array.isArray(player?.positions) ? player.positions : []),
      player?.position,
      player?.role,
    ].filter(Boolean);
    return Array.from(new Set(raw.map((p: any) => String(p).toUpperCase())));
  }

  function isGoalkeeperForDanger(player: any) {
    const positions = playerPositionCodesForDanger(player);
    return positions.some((p) => ["GK", "POR", "GOALKEEPER", "PORTERO"].includes(p));
  }

  function dangerRoleWeight(player: any) {
    const positions = playerPositionCodesForDanger(player);
    if (positions.some((p) => ["ST", "CF", "SS", "DC", "DEL", "DC9", "SD"].includes(p))) return 7.2;
    if (positions.some((p) => ["LW", "RW", "LM", "RM", "EI", "ED", "MI", "MD", "EXTREMO"].includes(p))) return 6.2;
    if (positions.some((p) => ["CAM", "AM", "MCO", "MP", "MCOF"].includes(p))) return 5.6;
    if (positions.some((p) => ["CM", "MC", "CDM", "MCD", "DM", "MDMC"].includes(p))) return 4.5;
    if (positions.some((p) => ["LB", "RB", "LWB", "RWB", "LI", "LD", "CAI", "CAD"].includes(p))) return 2.6;
    if (positions.some((p) => ["CB", "DFC", "DCB", "LIB", "D", "DEF"].includes(p))) return 1.8;
    return 2.4;
  }

  function pickWeightedDangerPlayer(players: any[], roleWeight: (p: any) => number, excludeIds: string[] = []) {
    const candidates = players.filter(
      (p) => p && p.id && !excludeIds.includes(p.id) && !isGoalkeeperForDanger(p),
    );
    if (!candidates.length) return null;
    const weighted = candidates.map((p) => {
      const rating = Number(p.rating ?? p.overall ?? 70);
      const stamina = Number(staminaRef.current[p.id] ?? STAMINA_START);
      const energyFactor = 0.68 + Math.max(0, Math.min(1, stamina / 100)) * 0.32;
      const ratingFactor = 0.7 + Math.max(0, Math.min(1, (rating - 45) / 55)) * 0.75;
      return { p, weight: Math.max(0.05, roleWeight(p) * energyFactor * ratingFactor) };
    });
    const total = weighted.reduce((sum, x) => sum + x.weight, 0);
    let roll = Math.random() * total;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) return entry.p;
    }
    return weighted[weighted.length - 1]?.p ?? candidates[0];
  }

  function getDangerAttacker(side: "home" | "away", preferredId?: string) {
    const players = (getCurrentPitchPlayers(side) as any[]).filter(
      (p) => p && !isGoalkeeperForDanger(p),
    );
    if (!players.length) return null;

    // Una atribución explícita (por ejemplo, un gol de Mbappé) manda siempre.
    // La variedad solo se aplica cuando NO existe un protagonista conocido.
    const preferred = players.find((p) => p.id === preferredId);
    if (preferred) {
      lastDangerAttackerRef.current[side] = preferred.id;
      return preferred;
    }

    const lastId = lastDangerAttackerRef.current[side];
    const chosen =
      pickWeightedDangerPlayer(players, dangerRoleWeight, lastId ? [lastId] : []) ??
      players[0];

    lastDangerAttackerRef.current[side] = chosen?.id ?? lastId ?? null;
    return chosen;
  }

  function getDangerDefender(side: "home" | "away", preferredId?: string, excludeIds: string[] = []) {
    const players = (getCurrentPitchPlayers(side) as any[]).filter(
      (p) => p && !isGoalkeeperForDanger(p) && !excludeIds.includes(p.id),
    );
    if (!players.length) return null;
    const defenders = players.filter((p) => {
      const positions = playerPositionCodesForDanger(p);
      return positions.some((pos) =>
        ["CB", "DFC", "DCB", "LB", "RB", "LWB", "RWB", "LI", "LD", "CAI", "CAD", "CDM", "MCD"].includes(pos),
      );
    });
    const pool = defenders.length ? defenders : players;
    return (preferredId && pool.find((p) => p.id === preferredId)) ??
      pickWeightedDangerPlayer(pool, (p) => {
        const positions = playerPositionCodesForDanger(p);
        if (positions.some((pos) => ["CB", "DFC", "DCB"].includes(pos))) return 6.5;
        if (positions.some((pos) => ["LB", "RB", "LWB", "RWB", "LI", "LD", "CAI", "CAD"].includes(pos))) return 5;
        if (positions.some((pos) => ["CDM", "MCD"].includes(pos))) return 4;
        return 2;
      }) ?? pool[0];
  }

  function playerSideOnPitch(playerId?: string): "home" | "away" | null {
    if (!playerId) return null;
    const fx = fixtureRef.current;
    if (!fx) return null;
    const homePlayers = getCurrentPitchPlayers("home") as any[];
    const awayPlayers = getCurrentPitchPlayers("away") as any[];
    if (homePlayers.some((p) => p?.id === playerId)) return "home";
    if (awayPlayers.some((p) => p?.id === playerId)) return "away";
    return null;
  }

  function normalizeOwnGoalEvent(goal: any) {
    if (!goal || goal.type !== "own_goal") return goal;
    const originalScorerSide = playerSideOnPitch(goal.scorerId);
    let scoringTeam = goal.team as "home" | "away";
    if (originalScorerSide && originalScorerSide === scoringTeam) {
      scoringTeam = scoringTeam === "home" ? "away" : "home";
    }
    const defendingSide = scoringTeam === "home" ? "away" : "home";
    const preferred = originalScorerSide === defendingSide ? goal.scorerId : undefined;
    const defender = getDangerDefender(defendingSide, preferred);
    return {
      ...goal,
      team: scoringTeam,
      scorerId: defender?.id ?? goal.scorerId,
      scorerName: defender?.name ?? goal.scorerName,
      assistId: undefined,
      assistName: undefined,
      detail: `Gol en propia de ${defender?.name ?? goal.scorerName ?? "un defensor"}.`,
    };
  }

  function getDangerKeeper(side: "home" | "away") {
    return (getCurrentPitchPlayers(side) as any[]).find((p) => isGoalkeeperForDanger(p));
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
    const goal = rawGoal?.type === "own_goal" ? normalizeOwnGoalEvent(rawGoal) : rawGoal;
    const keyHighlight = source.rawHighlights?.find((h: any) =>
      ["save", "woodwork", "big_chance", "penalty_awarded"].includes(h.type),
    );
    const varDecisionRaw = source.rawHighlights?.find((h: any) => h.type === "var_disallowed");

    if (goal) {
      // A normal goal belongs to an attacker from goal.team. An own goal is
      // different: goal.team is the team that receives the goal, while the
      // scorer belongs to the opposite team. Never replace the own-goal scorer
      // with an attacker from the scoring team, otherwise a defender/keeper
      // from the wrong side can appear as the scorer.
      const resolvedGoal = goal.type === "own_goal"
        ? { ...goal }
        : (() => {
            const attacker = getDangerAttacker(goal.team, goal.scorerId);
            return {
              ...goal,
              scorerId: attacker?.id ?? goal.scorerId,
              scorerName: attacker?.name ?? goal.scorerName,
            };
          })();

      // VAR must always reference the same scorer as the goal it reviews.
      // Older generated highlights could carry a different player id/name,
      // which is why a disallowed Mbappé goal could be displayed as Vinícius.
      const varDecision = varDecisionRaw && resolvedGoal
        ? {
            ...varDecisionRaw,
            team: resolvedGoal.team,
            playerId: resolvedGoal.scorerId,
            playerName: resolvedGoal.scorerName,
            detail: varDecisionRaw.detail || `Gol de ${resolvedGoal.scorerName} anulado por VAR`,
          }
        : varDecisionRaw;

      // The VAR-generated goal is intentionally shown first. Only its final
      // decision determines whether it remains in the official chronicle.
      const stays = varDecision
        ? true
        : goalStandsInLiveContext(goal.team, minute, goal.scorerId);
      if (!stays) {
        allEventsRef.current = (allEventsRef.current || []).filter(
          (e: any) =>
            !(
              Number(e.minute) === minute &&
              e.team === goal.team &&
              e.type === goal.type &&
              (e.scorerId === goal.scorerId || e.scorerName === goal.scorerName)
            ),
        );
        if (fixtureRef.current?.result) {
          fixtureRef.current = {
            ...fixtureRef.current,
            result: { ...fixtureRef.current.result, events: allEventsRef.current },
          } as any;
        }
        const attackingSide = goal.team as "home" | "away";
        const defendingSide = attackingSide === "home" ? "away" : "home";
        // El atacante debe pertenecer al equipo que estaba atacando y el
        // defensor al equipo contrario. No reutilizamos un nombre del mismo XI.
        const missAttacker = getDangerAttacker(attackingSide, resolvedGoal.scorerId);
        const missDefender = getDangerDefender(
          defendingSide,
          undefined,
          missAttacker ? [missAttacker.id] : [],
        );
        const missHighlight = {
          minute,
          team: attackingSide,
          type: "big_chance",
          playerId: missAttacker?.id ?? resolvedGoal.scorerId,
          playerName: missAttacker?.name ?? resolvedGoal.scorerName,
          detail: buildMissDetail({
            attackerName: missAttacker?.name ?? resolvedGoal.scorerName ?? "El atacante",
            defenderName: missDefender?.name,
            minute,
            eventType: goal.type,
          }),
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

      if (rawGoal && fixtureRef.current?.result) {
        const currentEvents = [...(allEventsRef.current || [])];
        const replaceAt = currentEvents.findIndex(
          (event: any) =>
            Number(event.minute) === Number(rawGoal.minute) &&
            event.type === rawGoal.type,
        );
        if (replaceAt >= 0) {
          currentEvents[replaceAt] = resolvedGoal;
        } else {
          currentEvents.push(resolvedGoal);
        }
        allEventsRef.current = currentEvents.sort((a: any, b: any) => a.minute - b.minute);
        fixtureRef.current = {
          ...fixtureRef.current,
          result: { ...fixtureRef.current.result, events: allEventsRef.current },
        } as any;
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
          cards: applied.cards,
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
        source: { minute, cards: applied.cards },
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

    const rawGoal = rawEvents.find((e: any) =>
      ["goal", "free_kick_goal", "own_goal", "penalty_goal"].includes(e.type),
    );
    const goal = rawGoal?.type === "own_goal" ? normalizeOwnGoalEvent(rawGoal) : rawGoal;
    const keyHighlight = !goal
      ? rawHighlights.find(
          (h: any) =>
            ["save", "woodwork", "big_chance", "penalty_awarded"].includes(h.type),
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
      // The highlight was generated from the pre-match simulation, but the
      // live match may have a different XI because the manager changed the
      // lineup or a substitution already happened. Re-anchor every visible
      // protagonist to a player who is actually on the pitch at this minute.
      const presentedHighlight = keyHighlight
        ? remapHighlightToPitch({ ...keyHighlight, team: attackingSide })
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
        ? dangerBase.body
        : `${dangerBase.body} Tu defensa intenta cerrar el último pase y obligar al atacante a decidir con prisa.`,
      // No decision wheel/choice: this scene is pure match presentation.
      actionPrompt: undefined,
      choices: undefined,
      hardPause: true,
      teamSide: attackingSide,
      teamName: dangerTeamName,
    };

    lastMajorMomentMinuteRef.current = m;
    const stagedEvents = rawEvents.map((event: any) =>
      event === rawGoal && goal ? goal : event,
    );
    if (rawGoal && goal && rawGoal !== goal) {
      allEventsRef.current = (allEventsRef.current || []).map((event: any) =>
        event === rawGoal ? goal : event,
      );
      fixtureRef.current = {
        ...fixtureRef.current,
        result: { ...fixtureRef.current.result, events: allEventsRef.current },
      } as any;
    }
    pendingSceneRef.current = {
      kind: "prelude",
      moment: danger,
      source: { rawEvents: stagedEvents, rawCards, rawHighlights, minute: m },
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
          moment: buildCardMoment(red),
          emergency: true,
          isCard: true,
        };
      }

      const yellow = cards.find((c) => c.cardType === "yellow");
      if (yellow) {
        return {
          moment: buildCardMoment(yellow),
          emergency: true,
          isCard: true,
        };
      }

      if (minute === 45 && !halftimeDoneRef.current) {
        return {
          moment: {
            id: `halftime-${minute}-${homeScoreRef.current}-${awayScoreRef.current}`,
            type: "halftime",
            minute,
            kicker: "⏸️ Descanso",
            title: "DESCANSO",
            body: `${home.name} ${homeScoreRef.current}-${awayScoreRef.current} ${away.name}.`,
            emoji: "⏸️",
            hardPause: true,
            teamName: `${home.name} vs ${away.name}`,
          },
          emergency: true,
          isHalftime: true,
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
      // Major highlights are also generated before the live XI can change.
      // Never build a player-facing notification from a stale bench player.
      const liveHighlight = remapHighlightToPitch(highlight);
      const baseMoment = buildMomentFromHighlight({
        highlight: liveHighlight,
        homeName: home.name,
        awayName: away.name,
      });
      const userTeamMoment = liveHighlight.team === mySideOf(fixtureRef.current);
      const looksLikeCounter =
        liveHighlight.type === "big_chance" && userTeamMoment && momentumRef.current >= 67;
      const moment = looksLikeCounter
        ? {
            ...baseMoment,
            id: `${baseMoment.id}-counter`,
            type: "counter",
            kicker: "⚡ Contraataque",
            title: "CONTRAATAQUE",
            body: `${liveHighlight.playerName} recibe tras una recuperación y el ${liveHighlight.team === "home" ? home.name : away.name} ataca el espacio antes de que el rival pueda replegarse.`,
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
        ["goal", "free_kick_goal", "own_goal", "red_card", "yellow_card", "halftime"].includes(
          importantMoment?.type ?? "",
        );

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
        if (m === 45 && importantMoment.type !== "halftime") halftimePendingAfterMomentRef.current = true;
        // Cards and the halftime board are transient notifications. They are
        // already rendered from the dedicated card feed / match state and
        // should not create duplicate chronicle entries.
        const transientCardOrBreak =
          importantMoment.type === "yellow_card" ||
          importantMoment.type === "red_card" ||
          importantMoment.type === "halftime";
        showLiveMoment(importantMoment, isEmergency ? 3200 : 2600, !transientCardOrBreak);
        return;
      }

      if (checkInjuriesAt(m)) return;

      if (m === 45 && !halftimeDoneRef.current) {
        halftimeDoneRef.current = true;
        showHalftimeMoment(false);
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
   * Resolve one of my injuries automatically during "Saltar al final".
   * The detailed engine already decides whether a compatible replacement exists
   * and stores that forced substitution in the fixture result; the fast-forward
   * layer must actually execute it, otherwise an injured player could remain on
   * the pitch for the rest of the simulated match.
   */
  function autoResolveMyInjuryAt(m: number): any[] {
    const fx = fixtureRef.current;
    if (!fx?.result) return [];
    const mySide = mySideOf(fx);
    const injury = (fx.result.injuries || []).find(
      (i: any) =>
        i.team === mySide &&
        Number(i.minute ?? 0) === m &&
        !handledInjuriesRef.current.includes(i.playerId),
    );
    if (!injury) return [];

    const currentIndex = myXIRef.current.indexOf(injury.playerId);
    if (currentIndex < 0) return [];
    handledInjuriesRef.current = [...handledInjuriesRef.current, injury.playerId];

    // The injured player always leaves the pitch, even when no legal change remains.
    playWithOneLess(injury.playerId, injury.playerName, "injury");

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

    const planned = (fx.result.substitutions || []).find(
      (sub: any) =>
        sub.team === mySide &&
        Number(sub.minute ?? 0) === m &&
        sub.playerOutId === injury.playerId,
    );

    const benchPlayers = myBenchRef.current
      .filter((id) => !goneRef.current.includes(id))
      .map((id) => playerById(id))
      .filter(Boolean);
    const isGK = (p: any) => {
      const pos = [
        ...(Array.isArray(p?.positions) ? p.positions : []),
        p?.position,
      ].filter(Boolean).map((x: any) => String(x).toUpperCase());
      return pos.some((x: string) => ["GK", "POR", "GOALKEEPER", "PORTERO"].includes(x));
    };
    const injuredPlayer = playerById(injury.playerId);
    const compatible = benchPlayers.filter((p: any) =>
      injuredPlayer ? isGK(p) === isGK(injuredPlayer) : true,
    );
    if (!compatible.length) return [];

    let playerIn = planned
      ? compatible.find((p: any) => p.id === planned.playerInId)
      : undefined;
    if (!playerIn) {
      const samePosition = injuredPlayer
        ? compatible.filter((p: any) => {
            const outPositions = new Set([
              ...(Array.isArray(injuredPlayer.positions) ? injuredPlayer.positions : []),
              injuredPlayer.position,
            ].filter(Boolean));
            return (Array.isArray(p.positions) ? p.positions : [p.position]).some((pos: any) =>
              outPositions.has(pos),
            );
          })
        : [];
      const pool = samePosition.length ? samePosition : compatible;
      playerIn = pool.slice().sort(
        (a: any, b: any) => (b.rating ?? 70) - (a.rating ?? 70),
      )[0];
    }
    if (!playerIn) return [];

    const xi = [...myXIRef.current];
    const emptyIndex = xi.findIndex((id) => !id);
    const targetIndex = emptyIndex >= 0 ? emptyIndex : currentIndex;
    if (targetIndex < 0) return [];
    xi[targetIndex] = playerIn.id;
    myXIRef.current = xi;
    setMyXI(xi);
    myBenchRef.current = Array.from(
      new Set([
        ...myBenchRef.current.filter((id) => id !== playerIn.id),
        injury.playerId,
      ]),
    );
    setMyBench(myBenchRef.current);
    staminaRef.current = { ...staminaRef.current, [playerIn.id]: STAMINA_START };
    setStamina(staminaRef.current);

    // The forced injury substitution uses one of the normal substitution
    // windows unless it shares a minute with another already-made change.
    const lastSub = subsRef.current[subsRef.current.length - 1];
    const sameWindow = lastSub && Number(lastSub.minute) === m;
    subsUsedRef.current += 1;
    setSubsUsed(subsUsedRef.current);
    if (!sameWindow) {
      windowsUsedRef.current += 1;
      setWindowsUsed(windowsUsedRef.current);
    }

    const entry = {
      minute: m,
      outId: injury.playerId,
      outName: injury.playerName,
      inId: playerIn.id,
      inName: playerIn.name,
    };
    subsRef.current = [...subsRef.current, entry];
    setSubsMade(subsRef.current);
    delete pendingForcedInjurySlotsRef.current[injury.playerId];

    return [{
      minute: m,
      team: mySide,
      inName: entry.inName,
      outName: entry.outName,
      playerInId: entry.inId,
      playerOutId: entry.outId,
      forcedInjury: true,
    }];
  }

  /**
   * Build a varied automatic-substitution plan for "Saltar al final".
   * The number of changes is random within the legal 0-5 range and is grouped
   * into 1-3 substitution windows, so 2, 3, 4 or 5 are all possible.
   */
  function buildAutoSubPlan(fromMinute: number): number[] {
    const usableBench = myBenchRef.current.filter((id) => {
      const p = playerById(id);
      return !!p && !goneRef.current.includes(id) &&
        !isPlayerInjuredAtDate(p, usePlayersStore.getState().currentDate);
    });
    const maxByRoster = Math.min(5, usableBench.length, Math.max(0, myXIRef.current.filter(Boolean).length - 1));
    if (maxByRoster <= 0 || fromMinute >= 88) return [];

    // Realistic distribution: 2-3 changes are common, while 0/1 and 5 remain
    // possible. The late in the match we start, the fewer changes we can plan.
    const maxByTime = fromMinute >= 75 ? 1 : fromMinute >= 66 ? 2 : fromMinute >= 55 ? 4 : 5;
    const maxTotal = Math.min(maxByRoster, maxByTime);
    const weights = [0.06, 0.12, 0.27, 0.31, 0.18, 0.06];
    const usableWeight = weights.slice(0, maxTotal + 1).reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * usableWeight;
    let total = 0;
    for (let i = 0; i <= maxTotal; i++) {
      total += weights[i];
      if (roll <= total) {
        const selected = i;
        if (selected === 0) return [];
        const minutes: number[] = [];
        const windows = selected >= 4 ? 2 + Math.floor(Math.random() * 2) : selected >= 2 ? 1 + Math.floor(Math.random() * 2) : 1;
        const counts = Array<number>(windows).fill(1);
        let remaining = selected - windows;
        while (remaining > 0) {
          counts[Math.floor(Math.random() * windows)] += 1;
          remaining -= 1;
        }

        const windowMinutes: number[] = [];
        for (let w = 0; w < windows; w++) {
          const minStart = w === 0
            ? Math.max(fromMinute + 3, 55)
            : windowMinutes[w - 1] + 6 + Math.floor(Math.random() * 7);
          const maxStart = w === 0 ? 69 : 84;
          if (minStart > maxStart) break;
          const minute = Math.min(maxStart, minStart + Math.floor(Math.random() * 6));
          windowMinutes.push(minute);
        }

        for (let w = 0; w < windowMinutes.length; w++) {
          for (let j = 0; j < counts[w]; j++) minutes.push(windowMinutes[w]);
        }
        return minutes.sort((a, b) => a - b);
      }
    }
    return [];
  }

  /**
   * Automatic substitution for MY team while the match is being fast-forwarded.
   * The outgoing and incoming player are selected dynamically, and only from
   * the real starting XI + the explicitly configured substitutes.
   */
  function autoSubMyTeamAt(m: number): any[] {
    const plannedForMinute = autoSubPlanRef.current.filter((minute) => minute === m).length;
    if (plannedForMinute <= 0) return [];

    const check = canSubstitute(
      {
        subsUsed: subsUsedRef.current,
        windowsUsed: windowsUsedRef.current,
        isExtraTime: isExtraTimeRef.current,
        phase: "playing",
      },
      1,
    );
    if (!check.ok || myBenchRef.current.length === 0) return [];

    const isGK = (p: any) => {
      const positions = Array.isArray(p?.positions) ? p.positions.map((x: any) => String(x).toUpperCase()) : [];
      const position = String(p?.position ?? "").toUpperCase();
      return position === "GK" || position === "POR" || positions.includes("GK") || positions.includes("POR");
    };
    const isInjured = (p: any) => !!p && isPlayerInjuredAtDate(p, usePlayersStore.getState().currentDate);
    const alreadyEntered = new Set(subsRef.current.map((s: any) => s.inId));

    const candidatesOut = myXIRef.current
      .map((id) => ({ id, p: playerById(id), st: staminaRef.current[id] ?? STAMINA_START }))
      .filter((c) => c.p && !isGK(c.p) && !goneRef.current.includes(c.id));
    if (candidatesOut.length === 0) return [];

    // Do not always remove the exact same lowest-stamina player. Pick among the
    // tired/less-fresh group with a small random component.
    candidatesOut.sort((a, b) =>
      ((100 - b.st) + Math.random() * 14) - ((100 - a.st) + Math.random() * 14),
    );
    const outPool = candidatesOut.slice(0, Math.min(5, candidatesOut.length));
    const worst = outPool[Math.floor(Math.random() * outPool.length)];
    if (!worst?.p) return [];

    const benchPlayers = myBenchRef.current
      .filter((id) => !goneRef.current.includes(id) && !alreadyEntered.has(id))
      .map((id) => playerById(id))
      .filter((p): p is any => !!p && !isInjured(p));

    const roleCompatible = benchPlayers.filter((p) => isGK(p) === isGK(worst.p));
    if (roleCompatible.length === 0) return [];

    const samePosition = roleCompatible.filter((p) => {
      const outPositions = new Set([...(Array.isArray(worst.p.positions) ? worst.p.positions : []), worst.p.position].filter(Boolean));
      return (Array.isArray(p.positions) ? p.positions : [p.position]).some((pos: any) => outPositions.has(pos));
    });
    const inPool = (samePosition.length > 0 ? samePosition : roleCompatible).slice();
    inPool.sort((a, b) =>
      ((b.rating ?? 70) + Math.random() * 6) - ((a.rating ?? 70) + Math.random() * 6),
    );
    const playerIn = inPool[Math.floor(Math.random() * Math.min(4, inPool.length))];
    if (!playerIn) return [];

    const xi = [...myXIRef.current];
    const outIndex = xi.indexOf(worst.id);
    if (outIndex < 0) return [];
    xi[outIndex] = playerIn.id;
    myXIRef.current = xi;
    setMyXI(xi);
    myBenchRef.current = Array.from(
      new Set([
        ...myBenchRef.current.filter((id) => id !== playerIn.id && id !== worst.id),
        worst.id,
      ]),
    );
    setMyBench(myBenchRef.current);
    goneRef.current = Array.from(new Set([...goneRef.current, worst.id]));
    setGoneIds(goneRef.current);
    staminaRef.current = { ...staminaRef.current, [playerIn.id]: STAMINA_START };
    setStamina(staminaRef.current);
    subsUsedRef.current += 1;
    setSubsUsed(subsUsedRef.current);

    // Multiple substitutions in the same planned window count as ONE window.
    // This is why the manager can legally make 4-5 changes instead of being
    // accidentally capped at 3.
    const lastSub = subsRef.current[subsRef.current.length - 1];
    const sameWindow = lastSub && Number(lastSub.minute) === Number(m);
    if (!sameWindow) {
      windowsUsedRef.current += 1;
      setWindowsUsed(windowsUsedRef.current);
    }

    const entry = {
      minute: m,
      outId: worst.id,
      outName: worst.p.name,
      inId: playerIn.id,
      inName: playerIn.name,
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
    if (!fx) return;

    // `Saltar al final` always requires an authoritative simulated result.
    // Older saves can arrive here without one; finish safely instead of leaving
    // a half-initialised live match running at 0'.
    if (!fx.result) {
      console.error("skipToEnd: fixture has no simulated result", fx.id);
      setMinute(90);
      minuteRef.current = 90;
      setPhase("done");
      return;
    }

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

    // Create the assistant's substitution plan once per simulated match. It is
    // deliberately randomised so the same three minutes/players are not replayed.
    autoSubPlanRef.current = buildAutoSubPlan(currentMinute);

    const madeWhileSkipping: any[] = [];
    for (let m = currentMinute + 1; m <= 90; m++) {
      drainStamina();

      // Injuries are emergency events: resolve them before ordinary planned
      // substitutions so the injured player can never remain on the pitch.
      const forcedInjurySubs = autoResolveMyInjuryAt(m);
      if (forcedInjurySubs.length > 0) {
        madeWhileSkipping.push(...forcedInjurySubs);
      }

      const opponentInjuryAtMinute = allHighlightsRef.current.some(
        (h: any) =>
          h.minute === m &&
          h.type === "injury" &&
          h.team !== mySideOf(fixtureRef.current),
      );
      if (autoSubPlanRef.current.includes(m)) {
        // A minute can contain 2-3 substitutions in the same legal window.
        const plannedCount = autoSubPlanRef.current.filter((minute) => minute === m).length;
        for (let i = 0; i < plannedCount; i++) {
          madeWhileSkipping.push(...autoSubMyTeamAt(m));
        }
      }

      const evs = allEventsRef.current.filter((e) => e.minute === m).map(remapEventToPitch);
      playedEventsRef.current = uniq([...playedEventsRef.current, ...evs], eventKey);
      for (const ev of evs) {
        if (!["goal", "penalty_goal", "free_kick_goal", "own_goal"].includes(ev.type)) continue;
        if (ev.team === "home") homeScoreRef.current += 1;
        else if (ev.team === "away") awayScoreRef.current += 1;
      }

      const cds = allCardsRef.current.filter((c) => c.minute === m).map(remapCardToPitch);
      playedCardsRef.current = uniq([...playedCardsRef.current, ...cds], cardKey);

      const hls = allHighlightsRef.current
        .filter((h) => h.minute === m)
        .filter((h) => !(h.type === "forced_sub" && h.team === mySideOf(fixtureRef.current)))
        .filter((h) => !(opponentInjuryAtMinute && h.type === "forced_sub"));
      playedHighlightsRef.current = uniq([...playedHighlightsRef.current, ...hls], highlightKey);
      if (includeOpponentSubs) {
        applyOpponentSubsAt(m);
      }
    }

    if (madeWhileSkipping.length > 0) {
      setSubFeed((prev) => [...madeWhileSkipping.slice().reverse(), ...prev]);
    }

    // Some older European saves contain a valid final score but an incomplete
    // events array. Never let that turn "Saltar al final" into "only changes":
    // reconstruct the missing goal entries from the final score before closing
    // the chronicle.
    {
      const ensureGoalEvents = (team: "home" | "away", expectedGoals: number) => {
        if (expectedGoals <= 0) return;
        const current = playedEventsRef.current.filter(
          (e: any) =>
            e.team === team &&
            ["goal", "own_goal", "free_kick_goal", "penalty_goal"].includes(e.type),
        ).length;
        let missing = expectedGoals - current;
        if (missing <= 0) return;
        const sideXI = team === "home" ? homeXIRef.current : awayXIRef.current;
        const candidates = sideXI.filter(Boolean);
        if (candidates.length === 0) return;
        for (let i = 0; i < missing; i++) {
          const p = candidates[(current + i) % candidates.length];
          const minute = Math.min(90, Math.max(1, 5 + Math.floor((84 * (i + 1)) / (missing + 1))));
          playedEventsRef.current.push({
            minute,
            team,
            type: "goal",
            scorerId: p.id,
            scorerName: p.name,
            detail: "Gol generado al cerrar la simulación",
          });
        }
      };
      ensureGoalEvents("home", Number(fx.result.homeGoals) || 0);
      ensureGoalEvents("away", Number(fx.result.awayGoals) || 0);

      // Once missing events have been restored, derive the regular-time score
      // from the chronicle itself. This prevents finalizePlayedChronicle() from
      // persisting 0-0 merely because the live loop had no goal event for an
      // older European fixture.
      const chronicleGoals = (team: "home" | "away") =>
        playedEventsRef.current.filter(
          (e: any) =>
            e.team === team &&
            ["goal", "own_goal", "free_kick_goal", "penalty_goal"].includes(e.type),
        ).length;
      homeScoreRef.current = chronicleGoals("home");
      awayScoreRef.current = chronicleGoals("away");
    }

    // From this point on there is only one authoritative timeline: what has
    // actually been resolved. The future pre-simulation is never displayed.
    try {
      finalizePlayedChronicle();
    } catch (error) {
      // A malformed historical stat must never leave the match route without
      // a finish button. Preserve the authoritative fixture result and close
      // the live session even if an optional post-match stat pass fails.
      console.error("skipToEnd: error closing chronicle", error);
      fixtureRef.current = { ...fx, result: { ...fx.result } } as any;
      persistResultToSave(fx.id, fx.result);
    }
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

    // The stored final score is authoritative. This also protects legacy or
    // provisional results whose event list did not contain every goal.
    const finalHome = Number(fx.result.homeGoals);
    const finalAway = Number(fx.result.awayGoals);
    if (Number.isFinite(finalHome)) homeScoreRef.current = finalHome;
    if (Number.isFinite(finalAway)) awayScoreRef.current = finalAway;
    setHomeScore(homeScoreRef.current);
    setAwayScore(awayScoreRef.current);

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

    // Apply all CPU extra-time substitutions immediately when fast-forwarding.
    const fx = fixtureRef.current;
    const userId = myTeamIdRef.current || save?.myTeamId;
    const cpuSide = fx && fx.homeId === userId ? "away" : "home";
    const pendingCpuSubs = extraTimeSubsRef.current.filter((s: any) => s.team === cpuSide);
    if (pendingCpuSubs.length > 0) {
      const xi = [...oppXIRef.current];
      const made: any[] = [];
      for (const s of pendingCpuSubs) {
        const outIndex = xi.findIndex((p: any) => p?.id === (s.playerOutId ?? s.outId));
        const incoming = oppBenchRef.current.find((p: any) => p?.id === (s.playerInId ?? s.inId));
        if (outIndex < 0 || !incoming) continue;
        const outgoing = xi[outIndex];
        xi[outIndex] = incoming;
        oppBenchRef.current = oppBenchRef.current.filter((p: any) => p.id !== incoming.id);
        made.push({
          minute: Number(s.minute) || 0,
          team: cpuSide,
          inName: incoming.name,
          outName: outgoing.name,
          playerInId: incoming.id,
          playerOutId: outgoing.id,
        });
      }
      if (made.length > 0) {
        oppXIRef.current = xi;
        const existingKeys = new Set((oppSubsDoneRef.current || []).map((s: any) => `${s.minute}|${s.playerOutId ?? s.outId}|${s.playerInId ?? s.inId}`));
        oppSubsDoneRef.current = [
          ...(oppSubsDoneRef.current || []),
          ...made.filter((s) => !existingKeys.has(`${s.minute}|${s.playerOutId}|${s.playerInId}`)),
        ];
        setSubFeed((prev) => [...made.slice().reverse(), ...prev]);
      }
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
      if (transientResumeTimerRef.current !== null)
        window.clearTimeout(transientResumeTimerRef.current);
    };
  }, []);

  if (!save || !fixtureRef.current) return null;
  const fixture = fixtureRef.current;
  const home = teamById(fixture.homeId);
  const away = teamById(fixture.awayId);
  const myId = save.myTeamId || "";
  const isHome = fixture.homeId === myId;
  const isMe = (id: string) => id === myId;
  const injuries = fixture.result?.injuries ?? [];
  const savedFormations = save.formations ?? {};
  const savedLineups = save.lineups ?? {};

  // Debug: log fixture info
  console.log("Match fixture:", {
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    myId,
    isHome,
    homeName: home?.name,
    awayName: away?.name,
  });

  // The preview must never fail just because a legacy save contains an
  // incomplete/missing squad. Keep rendering the match and fall back to an
  // empty squad when the store data is malformed.
  const safeGetSimSquad = (teamId: string) => {
    try {
      const squad = getSimSquad(teamId);
      return Array.isArray(squad) ? squad : [];
    } catch (error) {
      console.error("Error loading squad for MatchPage:", { teamId, error });
      return [];
    }
  };

  const homeSquad = safeGetSimSquad(fixture.homeId);
  const awaySquad = safeGetSimSquad(fixture.awayId);

  // Rival lineup is computed only once per fixture (and then mutated by the CPU
  // substitutions), so the mini pitch always shows who is actually on the pitch.
  const oppId = isMe(fixture.homeId) ? fixture.awayId : fixture.homeId;
  if (!oppCacheRef.current || oppCacheRef.current.key !== `${fixture.id}:${oppId}`) {
    let oppPlayers: any[] = [];
    let oppFmt: FormationName = DEFAULT_FORMATION;

    try {
      const generated = getStartersWithFormation(save, oppId, {
        randomFormation: true,
      });
      oppPlayers = Array.isArray(generated?.players) ? generated.players : [];
      oppFmt = normalizeFormation(generated?.formation);
    } catch (error) {
      console.error("Error generating rival lineup in MatchPage:", { fixtureId: fixture.id, oppId, error });
      // Safe fallback: use the current squad, without asking the CPU lineup
      // generator to process a possibly inconsistent legacy save.
      oppPlayers = safeGetSimSquad(oppId).slice(0, 11);
      oppFmt = DEFAULT_FORMATION;
    }

    const oppSide = fixture.homeId === oppId ? "home" : "away";
    const storedOppLineup = normalizeLiveArray(phase !== "preview" ? fixture.result?.[oppSide === "home" ? "homeLineup" : "awayLineup"] : []);
    const storedOppPlayers = storedOppLineup
      .map((p: any) => (typeof p === "string" ? playerById(p) : p))
      .filter(Boolean);
    if (oppPlayers.length === 0 && storedOppPlayers.length > 0) {
      oppPlayers = storedOppPlayers.slice(0, 11);
    }

    oppXIRef.current = oppPlayers;
    const oppSquad = safeGetSimSquad(oppId);
    const onPitchIds = new Set(oppPlayers.map((p: any) => p.id));
    const currentDate = usePlayersStore.getState().currentDate;
    oppBenchRef.current = oppSquad
      .filter(
        (p: any) =>
          !onPitchIds.has(p.id) &&
          (!currentDate || !isPlayerInjuredAtDate(p, currentDate)),
      )
      .sort((a: any, b: any) => b.rating - a.rating)
      .slice(0, 7);
    oppCacheRef.current = { key: `${fixture.id}:${oppId}`, formation: oppFmt };
    const storedOppSubs = (fixture.result?.substitutions || [])
      .filter((sb: any) => sb.team === (fixture.homeId === oppId ? "home" : "away"))
      .map((sb: any) => ({ minute: sb.minute, outId: sb.playerOutId, inId: sb.playerInId }));
    oppPlanRef.current = storedOppSubs.length > 0 ? storedOppSubs : [];
  }
  const oppFormation = normalizeFormation(oppCacheRef.current?.formation);

  // Determine home team lineup and formation
  let homeLineup: any[] = [];
  let homeFormation: any = "Táctica 4-4-2";

  if (isMe(fixture.homeId)) {
    // User's team - use temporary lineup if available, otherwise use global
    const liveIds = phase !== "preview" && myXI.length > 0 ? myXI : null;
    const homeLineupIdsRaw = liveIds || matchLineup || savedLineups[fixture.homeId] || [];
    const homeLineupIds = Array.isArray(homeLineupIdsRaw) ? homeLineupIdsRaw : [];
    homeLineup = homeLineupIds.map((id) => homeSquad.find((p) => p.id === id)).filter(Boolean);
    if (homeLineup.length < 11 && phase !== "preview") {
      const storedHome = normalizeLiveArray(fixture.result?.homeLineup);
      if (storedHome.length > 0) {
        homeLineup = storedHome.map((p: any) => (typeof p === "string" ? playerById(p) : p)).filter(Boolean).slice(0, 11);
      }
    }
    homeFormation =
      (phase !== "preview" && liveFormation) ||
      matchFormation ||
      savedFormations[fixture.homeId] ||
      DEFAULT_FORMATION;
    homeFormation = normalizeFormation(homeFormation);
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
    const awayLineupIdsRaw = liveIdsAway || matchLineup || savedLineups[fixture.awayId] || [];
    const awayLineupIds = Array.isArray(awayLineupIdsRaw) ? awayLineupIdsRaw : [];
    awayLineup = awayLineupIds.map((id) => awaySquad.find((p) => p.id === id)).filter(Boolean);
    if (awayLineup.length < 11 && phase !== "preview") {
      const storedAway = normalizeLiveArray(fixture.result?.awayLineup);
      if (storedAway.length > 0) {
        awayLineup = storedAway.map((p: any) => (typeof p === "string" ? playerById(p) : p)).filter(Boolean).slice(0, 11);
      }
    }
    awayFormation =
      (phase !== "preview" && liveFormation) ||
      matchFormation ||
      savedFormations[fixture.awayId] ||
      DEFAULT_FORMATION;
    awayFormation = normalizeFormation(awayFormation);
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

  // Determine header text based on match type. In Europa/Conference,
  // `fixture.matchday` is the absolute UEFA calendar offset (e.g. 78), not
  // the competition round. The public label must use md1..md8 / playoff /
  // knockout instead of exposing that internal day counter.
  const europeanRoundLabel = (round: string | undefined, fallback: number | undefined) => {
    const md = String(round ?? "").match(/^md(\d+)$/i);
    if (md) return `Jornada ${md[1]}`;
    if (round?.startsWith("Playoff")) return "Playoff";
    if (round?.startsWith("R16")) return "Octavos";
    if (round?.startsWith("QF")) return "Cuartos";
    if (round?.startsWith("SF")) return "Semifinal";
    if (round === "Final") return "Final";
    return typeof fallback === "number" ? `Jornada ${fallback}` : "";
  };

  const headerText =
    matchType === "CUP"
      ? `Copa Nacional · ${cupRound || fixture.round || ""}`
      : isEuropeanFixture(fixture)
        ? `${europeanCompetitionOf(fixture) === "uel" ? "Europa League" : "Conference League"} · ${europeanRoundLabel(fixture.round, fixture.matchday)}`
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
                  injuries={injuries}
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
                  injuries={injuries}
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
                      (matchType === "UCL" || isEuropeanFixture(fixture)) &&
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
                    if (isLeg2) {
                      const aggregateFixtures = fixtureRef.current?.europeanCompetition
                        ? getEuropeanFixtureList(save, fixtureRef.current.europeanCompetition)
                        : (save?.uclFixtures ?? []);
                      const leg1 = aggregateFixtures.find(
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
              subFeed.length === 0 &&
              keyMoments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin eventos aún... el partido está disputado.
              </p>
            ) : (
              <div className="space-y-1 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
                {(() => {
                  // Only the highlights that add colour to the chronicle without flooding it.
                  const KEEP: Record<string, { icon: string; label: string }> = {
                    woodwork: { icon: "🥅", label: "Al palo" },
                    big_chance: { icon: "❌", label: "Fallo" },
                    penalty_missed: { icon: "❌", label: "Penalti fallado" },
                    // "penalty_awarded" is intentionally NOT kept: a penalty is
                    // reported with a single line (scored or missed).
                    var_disallowed: { icon: "📺", label: "Gol anulado (VAR)" },
                    injury: { icon: "🚑", label: "Lesión" },
                    save: { icon: "🧤", label: "Paradón" },
                  };
                  const liveMomentAlreadyShows = (h: any) =>
                    keyMoments.some(
                      (moment: any) =>
                        Number(moment.minute ?? -1) === Number(h.minute ?? -2) &&
                        (moment.playerId ? String(moment.playerId) === String(h.playerId ?? "") : true) &&
                        (moment.teamSide ? moment.teamSide === h.team : true) &&
                        ["save", "injury", "injury_substitution", "var", "var_disallowed", "penalty_missed", "penalty_save", "penalty_goal"].includes(String(moment.type ?? "")),
                    );
                  const hls = highlightFeed.filter((h: any) => KEEP[h.type]);
                  const liveMoments = keyMoments
                    .filter(isChronicleMoment)
                    .map((m: any) => ({
                      kind: "moment",
                      minute: Number(m.minute ?? 0),
                      data: m,
                    }));
                  const items = [
                    ...liveMoments,
                    ...cardFeed.map((c: any) => ({ kind: "card", minute: c.minute, data: c })),
                    ...feed.map((e: any) => ({ kind: "goal", minute: e.minute, data: e })),
                    ...hls
                      .filter((h: any) => !liveMomentAlreadyShows(h))
                      .map((h: any) => ({ kind: "highlight", minute: h.minute, data: h })),
                    ...subFeed.map((s: any) => ({ kind: "sub", minute: s.minute, data: s })),
                  ].sort((a, b) => {
                    const minuteDiff = Number(b.minute) - Number(a.minute);
                    if (minuteDiff !== 0) return minuteDiff;
                    const rank: Record<string, number> = {
                      moment: 10,
                      card: 20,
                      goal: 30,
                      highlight: 40,
                      sub: 90,
                    };
                    return (rank[a.kind] ?? 50) - (rank[b.kind] ?? 50);
                  });

                  return items.map((item, i) => {
                    const teamOf = (t: string) => (t === "home" ? home : away);
                    if (item.kind === "moment") {
                      const m = item.data as any;
                      const mTeam = m.teamSide ? teamOf(m.teamSide) : null;
                      return (
                        <div
                          key={`moment-${m.id}-${i}`}
                          className="flex items-start gap-3 rounded-lg border-b border-border/40 py-2.5"
                        >
                          <span className="scoreline w-10 shrink-0 pt-0.5 text-sm font-bold text-primary">
                            {m.minute}'
                          </span>
                          <span className="w-5 shrink-0 text-center text-base">{m.emoji || m.kicker?.slice(0, 2) || "⚡"}</span>
                          {mTeam ? (
                            <TeamLogo
                              teamName={mTeam.name}
                              leagueName={getLeagueName(mTeam.league)}
                              size={22}
                            />
                          ) : (
                            <span className="w-[22px] shrink-0" />
                          )}
                          {m.playerId ? (
                            <PlayerFace
                              name={m.playerName || "Jugador"}
                              image={faceUrl(m.playerId)}
                              size={24}
                              showRing={false}
                              className="shrink-0"
                            />
                          ) : (
                            <span className="w-6 shrink-0" />
                          )}
                          <div className="min-w-0 text-sm">
                            <span className="font-black">{m.playerName || m.title || m.kicker || "Jugada"}</span>
                            {m.playerName && m.title && <span className="text-muted-foreground"> · {m.title}</span>}
                            {m.body && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{m.body}</div>}
                            {!m.body && m.detail && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{m.detail}</div>}
                            {mTeam && <span className="ml-1 text-muted-foreground">({mTeam.short})</span>}
                          </div>
                        </div>
                      );
                    }
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
                            ({team.short}) — {inj.reason}
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
                ? (() => {
                    const currentTeamPlayers = liveMoment.teamSide
                      ? (getCurrentPitchPlayers(liveMoment.teamSide) as any[])
                      : [];
                    const currentPlayer = liveMoment.playerId
                      ? currentTeamPlayers.find((p: any) => p?.id === liveMoment.playerId)
                      : null;
                    return {
                      ...(liveMoment as any),
                      teamLeagueName:
                        liveMoment.teamSide === "home"
                          ? getLeagueName(home.league)
                          : getLeagueName(away.league),
                      playerImage: liveMoment.playerId
                        ? faceUrl(liveMoment.playerId, currentPlayer?.cardImage)
                        : undefined,
                    } as any;
                  })()
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

// @ts-nocheck
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  loadSave,
  saveSave,
  beginSaveBatch,
  checkpointSaveBatchDay,
  isSaveBatchCheckpointDueNextDay,
  endSaveBatch,
  abortSaveBatch,
  persistCalendarJumpMarketState,
  commitCalendarScheduleResults,
  repairPlaceholderCalendarResults,
  applyCupDraw,
  autoDrawForeignCups,
  simulateRemainingCupMatches,
  getCurrentCupRound,
  getRoundNameByTeamCount,
  getSurvivingCupTeams,
  simulateCupMatchday,
  simulateCupMatchdayLayered,
  simulateBackgroundLeaguesOnly,
  scheduleBackgroundCupsOnly,
  processScheduledBackgroundSims,
  fixCupDraws,
  isGlobalNationalCupRoundComplete,
  applyUCLLeagueDraw,
  applyUCLPlayoffDraw,
  applyUCLKnockoutDraw,
  simulatePendingUCLThroughDay,
  simulatePendingEuropeanThroughDay,
  simulateUCLMatchday,
  simulateUCLKnockoutMatchday,
  processUCLKnockoutProgress,
  applyEuropeanLeagueDraw,
  applyEuropeanPlayoffDraw,
  applyEuropeanKnockoutDraw,
  simulateEuropeanLeagueMatchday,
  simulateEuropeanKnockoutMatchday,
  processEuropeanKnockoutProgress,
  initializeEuropeanCompetition,
} from "@/lib/store";

import { monthDays, fmtMonth, COMP_COLORS } from "@/lib/calendar";

import {
  startCalendarJumpProfile,
  finishCalendarJumpProfile,
  isCalendarJumpProfileActive,
  recordCalendarJumpCounter,
  recordCalendarJumpDuration,
  measureCalendarJumpPhase,
} from "@/lib/calendarJumpProfiler";
import { setCalendarJumpActive } from "@/lib/calendarJumpState";

import { getCupStructureForCountry, initCup } from "@/lib/cups";

import { usePlayersStore, clearCalendarJumpBackgroundErrors } from "@/store/playersStore";

import { snapshotTransferSystem, applyTransferSnapshot } from "@/lib/transfers/Persistence";

import { useTransferMarket } from "@/hooks/useTransferMarket";

import { MarketStatusBanner } from "@/components/MarketStatusBanner";

import { TeamLogo } from "@/components/TeamLogo";
import { TeamBadge } from "@/components/TeamBadge";
import type { Fixture } from "@/lib/season";

import { CupDrawModal } from "@/components/CupDrawModal";

import { UCLDrawModal } from "@/components/UCLDrawModal";
import { EuropeanDrawModal } from "@/components/EuropeanDrawModal";
import { Trophy } from "lucide-react";

import { UCL_START, UCL_CALENDAR, UCL_SEASON1_IDS, uclDayOffset } from "@/data/ucl";
import { runSwissDraw } from "@/lib/uclDraw";
import { EUROPEAN_CONFIGS, europeanCalendar, EUROPEAN_START } from "@/data/europeanCompetitions";

import { teamById, LEAGUES, getPrimaryLeagueForCountry, type LeagueId } from "@/data/teams";

import {
  isSummerTransferWindow,
  isWinterTransferWindow,
  isTransferWindowDay,
  parseDateOnly,
  toDateOnly,
  addDaysToIso,
} from "@/lib/transferWindows";

import { involvesTeam, unplayedOnDate } from "@/lib/matchEngine";

import { opponentLabel, scheduleFixturesByDate, userFixtures } from "@/lib/leagueSchedule";
import { getCupFixtureDateIso, getEuropeanFixtureDateIso } from "@/lib/fixtureDates";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Helper to get league name from league ID

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function CalendarTeamLogo({ teamId, size = 14 }: { teamId: string; size?: number }) {
  try {
    const team = teamById(teamId);
    return <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={size} />;
  } catch {
    return <TeamBadge teamId={teamId} size={size} />;
  }
}

function calendarResultLabel(result: Fixture["result"]): string | null {
  if (!result) return null;
  const home = Number(result.homeGoals ?? 0) + Number(result.extraTime?.homeGoals ?? 0);
  const away = Number(result.awayGoals ?? 0) + Number(result.extraTime?.awayGoals ?? 0);
  if (result.penalties) return `${home} (${result.penalties.homeGoals})–(${result.penalties.awayGoals}) ${away}`;
  return `${home}–${away}`;
}

function EuropeanCalendarChip({ fixture, label, color, title }: {
  fixture: Fixture;
  label: string;
  color: string;
  title: string;
}) {
  const result = calendarResultLabel(fixture.result);
  const detail = fixture.result?.penalties ? " · decidido por penaltis" : fixture.result?.extraTime ? " · prórroga" : "";
  return (
    <div key={fixture.id} className={`flex items-center justify-center gap-1 w-full min-w-0 text-[0.5rem] leading-tight font-bold px-0.5 py-0.5 rounded ${color} text-white ring-1 ring-inset ring-primary/70`} title={`${title}${result ? ` · ${result}${detail}` : " · Pendiente"}`}>
      <CalendarTeamLogo teamId={fixture.homeId} size={12} />
      <span className="truncate">{result ?? label}</span>
      <CalendarTeamLogo teamId={fixture.awayId} size={12} />
    </div>
  );
}

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function CalendarPage() {
  const renderStartedAtRef = useRef(typeof performance !== "undefined" ? performance.now() : Date.now());
  renderStartedAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
  // Contador y duración de render/commit: solo tienen coste apreciable si se
  // activa el profiler opt-in durante un salto.
  recordCalendarJumpCounter("calendar.reactRenders");
  useLayoutEffect(() => {
    if (!isCalendarJumpProfileActive()) return;
    const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordCalendarJumpDuration("calendar.reactRenderCommit", endedAt - renderStartedAtRef.current);
  });
  const navigate = useNavigate();

  const currentDateIso = usePlayersStore((s) => s.currentDate);

  const advanceTime = usePlayersStore((s) => s.advanceTime);

  const pendingCupDraw = usePlayersStore((s) => s.pendingCupDraw);
  const clearPendingCupDraw = usePlayersStore((s) => s.clearPendingCupDraw);

  const myTeamId = usePlayersStore((s) => s.myTeamId);

  const fixtures = usePlayersStore((s) => s.fixtures);

  const ensureLeagueSchedule = usePlayersStore((s) => s.ensureLeagueSchedule);

  const pendingMatch = usePlayersStore((s) => s.pendingUserMatch);

  const { isMarketOpen } = useTransferMarket();

  const [save, setSave] = useState(loadSave());

  const [showCupDrawModal, setShowCupDrawModal] = useState(false);

  const [isAdvancing, setIsAdvancing] = useState(false);
  const jumpInProgressRef = useRef(false);
  const [jumpStartDate, setJumpStartDate] = useState<string | null>(null);
  const [selectedJumpDate, setSelectedJumpDate] = useState<string | null>(null);
  const [jumpMessage, setJumpMessage] = useState<string | null>(null);

  const pendingUclDraw = usePlayersStore((s) => s.pendingUclDraw);
  const pendingDrawQueue = usePlayersStore((s) => s.pendingDrawQueue ?? []);

  const finishPendingDraw = usePlayersStore((s) => s.finishPendingDraw);

  const [showUclDrawModal, setShowUclDrawModal] = useState(false);

  const activePendingDraw = pendingDrawQueue[0] ?? (pendingCupDraw ? "cup" : pendingUclDraw);

  // Open exactly one draw modal at a time. When several draws fall on the same
  // date, finishing one advances the queue to the next without advancing the day.
  useEffect(() => {
    if (activePendingDraw === "cup") {
      setShowCupDrawModal(true);
      setShowUclDrawModal(false);
    } else if (activePendingDraw) {
      setShowUclDrawModal(true);
      setShowCupDrawModal(false);
    }
  }, [activePendingDraw]);

  const gameDate = useMemo(
    () => parseDateOnly(currentDateIso),

    [currentDateIso],
  );

  const [browseMonth, setBrowseMonth] = useState<{
    year: number;

    month: number;
  } | null>(null);

  useEffect(() => {
    const s = loadSave();

    if (!s) {
      navigate({ to: "/" });

      return;
    }

    ensureLeagueSchedule();

    // Fix cup draws that were simulated before extra time/penalty logic

    const fixedSave = fixCupDraws(s);

    if (fixedSave !== s) {
      saveSave(fixedSave);

      setSave(fixedSave);
    } else {
      setSave(s);
    }
  }, [navigate, ensureLeagueSchedule]);

  // Check for cup draw pending after save changes

  useEffect(() => {
    // Los sorteos intermedios se procesan en el motor del salto. Este efecto
    // solo administra los modales de la fecha actual cuando no hay salto activo.
    if (!save || isAdvancing) return;

    try {
      const userCountry = LEAGUES[save.myLeague]?.country;

      const primaryLeague = userCountry ? getPrimaryLeagueForCountry(userCountry) : save.myLeague;

      const cupKey = (primaryLeague || save.myLeague) as LeagueId;

      // Get the dynamic cup structure for the user's country

      const cupStructure =
        (save.cupFixtures as any)[`${cupKey}_structure`] ||
        getCupStructureForCountry(userCountry || "");

      const cupSchedule = cupStructure.schedule;

      // Get user's team to filter relevant rounds

      const myTeamId = save.myTeamId;

      let isInPreliminary = false;

      let preliminaryTeams: string[] = [];

      try {
        const cupData = initCup(userCountry || "");

        isInPreliminary = cupData.preliminaryParticipants?.includes(myTeamId) || false;

        preliminaryTeams = cupData.preliminaryParticipants || [];
      } catch (err) {
        console.error("Error checking preliminary participants:", err);
      }

      // Filter schedule to only include rounds relevant to user's team

      const relevantSchedule = cupSchedule.filter((step) => {
        if (step.round === "Preliminar") return isInPreliminary;

        return true; // All other rounds are relevant
      });

      const firstScheduleRound = cupSchedule[0]; // Use full schedule to check for prelim

      // Convert drawMatchdays to actual dates (cup starts July 7, 2026)

      // drawMatchday = days offset from July 7th (0=Jul7, 1=Jul8, etc.)

      const cupStart = new Date("2026-07-07T00:00:00Z");

      const today = currentDateIso; // already an ISO string like "2026-07-07"

      // Check if today is a cup draw day

      const isDrawDay = relevantSchedule.some((s) => {
        const drawDate = new Date(cupStart.getTime() + s.drawMatchday * 86400000);

        const drawDateOnly = toDateOnly(drawDate);

        return drawDateOnly === today;
      });

      const cupFixtures = save.cupFixtures[cupKey] || [];

      // For draw day check: only block if the CURRENT draw day's round already has fixtures

      const currentDrawRound = relevantSchedule.find((s) => {
        const drawDate = new Date(
          new Date("2026-07-07T00:00:00Z").getTime() + s.drawMatchday * 86400000,
        );

        return toDateOnly(drawDate) === today;
      });

      const hasCurrentRoundFixtures = currentDrawRound
        ? cupFixtures.some((f) => f.round === currentDrawRound.round)
        : false;

      // Check if user is eliminated from cup (team not in any unplayed cup fixture)

      const userInCup = cupFixtures.some(
        (f) => (f.homeId === myTeamId || f.awayId === myTeamId) && !f.result,
      );

      // Check if today is a cup match day

      const isCupMatchDay = cupSchedule.some((s) => {
        const matchDate = new Date(cupStart.getTime() + s.matchday * 86400000);

        return toDateOnly(matchDate) === today;
      });

      // Get the matchday for today if it's a cup match day

      const currentCupMatchday = cupSchedule.find((s) => {
        const matchDate = new Date(cupStart.getTime() + s.matchday * 86400000);

        return toDateOnly(matchDate) === today;
      })?.matchday;

      // Los partidos de copa se simulan desde el store/background scheduler.
      // El calendario solo presenta las fechas y los sorteos; no ejecuta una
      // segunda simulación al renderizar.

      // A draw is shown on its calendar date, but if some country
      // finishes the previous global round later, the draw waits until the
      // whole worldwide round is complete. The calendar date remains the
      // planned draw date.
      const drawReadyRound = relevantSchedule.find((s) => {
        const drawDate = new Date(
          new Date("2026-07-07T00:00:00Z").getTime() + s.drawMatchday * 86400000,
        );
        const drawDue = toDateOnly(drawDate) <= today;
        if (!drawDue) return false;
        if (cupFixtures.some((f) => f.round === s.round)) return false;

        // A bye only removes the user's own match, never the global round
        // dependency. The previous global round must be complete in every
        // country before this draw can appear.
        const previousStep = cupSchedule.find(
          (candidate) => candidate.globalSlot === s.globalSlot - 1,
        );
        return previousStep
          ? isGlobalNationalCupRoundComplete(save, previousStep.globalSlot)
          : true;
      });

      // Show notification when the planned date has arrived and the global
      // previous round is complete. This can therefore fire a few days late
      // only if a background cup simulation had to finish its final batch.
      if (drawReadyRound && !hasCurrentRoundFixtures && !save.cupDrawPending) {
        const cupData = initCup(userCountry || "");

        const preliminaryTeams = cupData.preliminaryParticipants || [];

        // Get the round for this specific draw day

        const currentRound = drawReadyRound || relevantSchedule.find((s) => {
          const drawDate = new Date(
            new Date("2026-07-07T00:00:00Z").getTime() + s.drawMatchday * 86400000,
          );

          return toDateOnly(drawDate) === today;
        });

        if (currentRound) {
          const updated = loadSave();

          if (!updated) return;

          // Use surviving teams if available, otherwise use initial participants

          const survivingTeams = getSurvivingCupTeams(updated, cupKey);

          // The first non-preliminary round in the schedule (R32, R16, Octavos, etc.)

          const firstMainRound = relevantSchedule.find((s) => s.round !== "Preliminar");

          let drawTeams: string[];

          if (currentRound.round === "Preliminar") {
            drawTeams = preliminaryTeams;
          } else if (
            firstScheduleRound?.round === "Preliminar" &&
            currentRound.round === firstMainRound?.round
          ) {
            // First main round after prelim: combine prelim winners with bye teams

            const prelimWinners = getSurvivingCupTeams(updated, cupKey);

            const mainBracketTeams = cupData.participants.filter(
              (id) => !preliminaryTeams.includes(id),
            );

            drawTeams = [...prelimWinners, ...mainBracketTeams];


          } else {
            // For all subsequent rounds (QF, SF, Final), use surviving teams from previous round

            drawTeams = survivingTeams.length > 0 ? survivingTeams : cupData.participants;
          }

          updated.cupDrawPending = { league: cupKey, round: currentRound.round, teams: drawTeams };

          saveSave(updated);

          setSave(updated);
        }
      }

      // Show modal if cupDrawPending is set

      if (save.cupDrawPending) {
        try {
          const withForeignDraws = autoDrawForeignCups(save, currentDateIso);

          saveSave(withForeignDraws);
        } catch (err) {
          console.error("Error en auto-draw de copas:", err);
        }

        setShowCupDrawModal(true);
      }
    } catch (err) {
      console.error("Error in cup draw check:", err);
    }
  }, [save?.cupDrawPending, currentDateIso, isAdvancing]); // Re-run outside automated jumps

  useEffect(() => {
    // Durante el salto cada día se procesa en memoria y se persiste por el motor;
    // releer todo el JSON en cada cambio de fecha solo ralentiza la animación.
    // La partida visible se refresca una vez al terminar el salto.
    if (isAdvancing) return;
    const latest = loadSave();
    if (latest) setSave(latest);
  }, [currentDateIso, isAdvancing]);

  useLayoutEffect(() => {
    setBrowseMonth(null);
  }, [currentDateIso]);

  const viewYear = browseMonth?.year ?? gameDate.getFullYear();

  const viewMonth = browseMonth?.month ?? gameDate.getMonth();


  const grid = useMemo(
    () => monthDays(viewYear, viewMonth),

    [viewYear, viewMonth],
  );

  const myFixtures = useMemo(
    () => (myTeamId ? userFixtures(fixtures, myTeamId) : []),

    [fixtures, myTeamId],
  );

  const fixturesByDate = useMemo(
    () => scheduleFixturesByDate(myFixtures),

    [myFixtures],
  );

  // Add cup fixtures for the user's team

  const myCupFixtures = useMemo(() => {
    if (!save || !myTeamId) return [];

    try {
      // Get the primary league for the user's country (the league that holds the cup)

      const userCountry = LEAGUES[save.myLeague]?.country;

      const primaryLeague = userCountry ? getPrimaryLeagueForCountry(userCountry) : save.myLeague;

      const cupKey = (primaryLeague || save.myLeague) as LeagueId;

      return (
        save.cupFixtures[cupKey]?.filter((f) => f.homeId === myTeamId || f.awayId === myTeamId) ||
        []
      );
    } catch (err) {
      console.error("Error al cargar fixtures de copa:", err);

      return [];
    }
  }, [save, myTeamId]);

  const cupFixturesByDate = useMemo(() => {
    const map = new Map<string, typeof myCupFixtures>();

    // Cup starts July 7, 2026. matchday field = day offset from July 7th (0=Jul7, 1=Jul8...)

    const cupStart = new Date("2026-07-07T00:00:00Z");

    for (const f of myCupFixtures) {
      const dateIso = getCupFixtureDateIso(f);
      if (!dateIso) continue;

      const list = map.get(dateIso) ?? [];

      list.push(f);

      map.set(dateIso, list);
    }

    return map;
  }, [myCupFixtures]);

  // Combine league and cup fixtures for calendar display

  const allFixturesByDate = useMemo(() => {
    const combined = new Map<
      string,
      Array<{
        competition: "Liga" | "cup" | "league";
        matchday: number;
        homeTeam?: string;
        awayTeam?: string;
        homeId?: string;
        awayId?: string;
        id: string;
        isPlayed?: boolean;
        homeScore?: number | null;
        awayScore?: number | null;
        result?: Fixture["result"];
      }>
    >();

    // Add league fixtures

    for (const [date, fixtures] of fixturesByDate.entries()) {
      combined.set(date, fixtures as any);
    }

    // Add cup fixtures

    for (const [date, fixtures] of cupFixturesByDate.entries()) {
      const existing = combined.get(date) || [];

      combined.set(date, [...existing, ...fixtures] as any);
    }

    return combined;
  }, [fixturesByDate, cupFixturesByDate]);

  // Calculate cup draw days based on July 7th schedule

  const cupDrawDays = useMemo(() => {
    if (!save) return new Set<string>();

    const drawDays = new Set<string>();

    // Cup starts July 7, 2026 - alternating: draw, match, draw, match...

    // drawMatchday = days offset from July 7th (0=Jul7, 2=Jul9, 4=Jul11...)

    const cupStart = new Date("2026-07-07T12:00:00Z");

    const userCountry = LEAGUES[save.myLeague]?.country;

    if (!userCountry) return drawDays;

    const primaryLeague = getPrimaryLeagueForCountry(userCountry) || save.myLeague;

    const cupKey = primaryLeague as LeagueId;

    try {
      const cupStructure =
        (save.cupFixtures as any)[`${cupKey}_structure`] || getCupStructureForCountry(userCountry);

      const cupSchedule = cupStructure.schedule || [];

      const myTeamId = save.myTeamId;

      let isInPreliminary = false;

      try {
        const cupData = initCup(userCountry);

        isInPreliminary = cupData.preliminaryParticipants?.includes(myTeamId) || false;
      } catch {}

      const relevantSchedule = cupSchedule.filter((step: any) => {
        if (step.round === "Preliminar") return isInPreliminary;

        return true;
      });

      for (const s of relevantSchedule) {
        const drawDate = new Date(cupStart.getTime() + s.drawMatchday * 86400000);

        drawDays.add(toDateOnly(drawDate));
      }
    } catch (err) {
      console.error("Error calculating cup draw days:", err);
    }

    return drawDays;
  }, [save?.myLeague, save?.myTeamId, save?.cupFixtures]);

  // UCL draw days (3 sorteos: liga, playoff, knockout)

  const uclDrawDays = useMemo(() => {
    const days = new Set<string>();

    const start = new Date(UCL_START + "T00:00:00Z");

    days.add(toDateOnly(new Date(start.getTime() + UCL_CALENDAR.leagueDraw * 86400000)));

    days.add(toDateOnly(new Date(start.getTime() + UCL_CALENDAR.playoffDraw * 86400000)));

    days.add(toDateOnly(new Date(start.getTime() + UCL_CALENDAR.knockoutDraw * 86400000)));

    return days;
  }, []);

  // UCL match days for the user's team

  const uclMyFixtures = useMemo(() => {
    if (!save?.myTeamId) return [];

    return (save.uclFixtures ?? []).filter(
      (f) => f.homeId === save!.myTeamId || f.awayId === save!.myTeamId,
    );
  }, [save?.uclFixtures, save?.myTeamId]);

  const uclMatchDays = useMemo(() => {
    const map = new Map<string, typeof uclMyFixtures>();

    for (const f of uclMyFixtures) {
      const iso = getEuropeanFixtureDateIso(f, "ucl");
      if (!iso) continue;
      const list = map.get(iso) ?? [];
      list.push(f);
      map.set(iso, list);
    }

    return map;
  }, [uclMyFixtures]);

  const europeanCalendars = europeanCalendar();
  const uelMyFixtures = useMemo(() =>
    (save?.uelFixtures ?? []).filter((f) => f.homeId === save!.myTeamId || f.awayId === save!.myTeamId),
    [save?.uelFixtures, save?.myTeamId],
  );
  const ueclMyFixtures = useMemo(() =>
    (save?.ueclFixtures ?? []).filter((f) => f.homeId === save!.myTeamId || f.awayId === save!.myTeamId),
    [save?.ueclFixtures, save?.myTeamId],
  );
  const makeEuropeanMatchDays = (list: typeof uelMyFixtures) => {
    const map = new Map<string, typeof uelMyFixtures>();
    for (const f of list) {
      const competition = f.europeanCompetition === "uecl" ? "uecl" : "uel";
      const iso = getEuropeanFixtureDateIso(f, competition);
      if (!iso) continue;
      const group = map.get(iso) ?? [];
      group.push(f);
      map.set(iso, group);
    }
    return map;
  };
  const uelMatchDays = useMemo(() => makeEuropeanMatchDays(uelMyFixtures), [uelMyFixtures]);
  const ueclMatchDays = useMemo(() => makeEuropeanMatchDays(ueclMyFixtures), [ueclMyFixtures]);
  const europeanDrawDays = useMemo(() => {
    const days = new Map<string, string[]>();
    const start = new Date(EUROPEAN_START + "T00:00:00Z");
    for (const [comp, cfg] of Object.entries(EUROPEAN_CONFIGS)) {
      for (const key of ["leagueDraw", "playoffDraw", "knockoutDraw"] as const) {
        const iso = toDateOnly(new Date(start.getTime() + europeanCalendars[key] * 86400000));
        const names = days.get(iso) ?? [];
        names.push(`${cfg.shortName} · ${key === "leagueDraw" ? "Liga" : key === "playoffDraw" ? "Play-off" : "Octavos"}`);
        days.set(iso, names);
      }
    }
    return days;
  }, [europeanCalendars]);

  function prevMonth() {
    if (viewMonth === 0) {
      setBrowseMonth({ year: viewYear - 1, month: 11 });
    } else {
      setBrowseMonth({ year: viewYear, month: viewMonth - 1 });
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setBrowseMonth({ year: viewYear + 1, month: 0 });
    } else {
      setBrowseMonth({ year: viewYear, month: viewMonth + 1 });
    }
  }

  function goToToday() {
    setBrowseMonth(null);
  }

  const handleAdvanceDay = async () => {
    if (!save || isAdvancing) return;

    setIsAdvancing(true);

    try {
      // La tienda es la única autoridad que avanza el calendario. Antes esta
      // pantalla programaba ligas/copas y después volvía a llamar a advanceTime,
      // dejando dos pipelines compitiendo por el mismo save.
      // `advanceTime` puede pausar voluntariamente para mostrar un partido o un
      // sorteo pendiente. En ese caso el propio store ya ha actualizado el estado.
      advanceTime(1);

    } catch (err) {
      console.error('[Calendar] Error al avanzar el día:',
        err instanceof Error ? (err.stack || err.message) : err,
      );
    } finally {
      setIsAdvancing(false);
    }
  };

  // Cede el control un instante para que React/navegador puedan pintar la fecha
  // nueva, sin esperar un fotograma completo (~16 ms) por día. La simulación sigue
  // ejecutándose en orden, pero el salto largo tarda mucho menos.
  const waitForCalendarEffects = () => new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
      window.setTimeout(resolve, 0);
    } else {
      resolve();
    }
  });

  function shuffledMatchups(teams: string[]): [string, string][] {
    const shuffled = [...teams];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    const matchups: [string, string][] = [];
    for (let index = 0; index + 1 < shuffled.length; index += 2) {
      matchups.push([shuffled[index], shuffled[index + 1]]);
    }
    return matchups;
  }

  function resolveNationalCupDraw(currentSave: ReturnType<typeof loadSave>, date: string) {
    if (!currentSave?.myTeamId) return null;
    const country = LEAGUES[currentSave.myLeague]?.country;
    if (!country) return null;
    const cupLeague = (getPrimaryLeagueForCountry(country) || currentSave.myLeague) as LeagueId;
    const storedPending = currentSave.cupDrawPending;
    if (storedPending && storedPending.league === cupLeague && Array.isArray(storedPending.teams) && storedPending.teams.length >= 2) {
      return applyCupDraw(currentSave, cupLeague, storedPending.round, shuffledMatchups(storedPending.teams));
    }
    const cupData = initCup(country);
    const fullSchedule =
      ((currentSave.cupFixtures as any)?.[`${cupLeague}_structure`]?.schedule ??
        getCupStructureForCountry(country).schedule) as any[];
    const isInPreliminary = !!cupData.preliminaryParticipants?.includes(currentSave.myTeamId);
    const relevantSchedule = fullSchedule.filter((step) => step.round !== "Preliminar" || isInPreliminary);
    const cupFixtures = Array.isArray(currentSave.cupFixtures?.[cupLeague])
      ? currentSave.cupFixtures[cupLeague]
      : [];
    const cupStart = parseDateOnly("2026-07-07");
    const dueStep = relevantSchedule.find((step) => {
      const drawDate = new Date(cupStart.getTime() + Number(step.drawMatchday) * 86400000);
      const drawIso = toDateOnly(drawDate);
      if (drawIso > date || cupFixtures.some((fixture: any) => fixture.round === step.round)) return false;
      const previousStep = fullSchedule.find((candidate) => candidate.globalSlot === step.globalSlot - 1);
      return !previousStep || isGlobalNationalCupRoundComplete(currentSave, previousStep.globalSlot);
    });
    if (!dueStep) return null;

    let drawTeams: string[];
    const firstFullStep = fullSchedule[0];
    const firstMainRound = relevantSchedule.find((step) => step.round !== "Preliminar");
    if (dueStep.round === "Preliminar") {
      drawTeams = [...(cupData.preliminaryParticipants ?? [])];
    } else if (firstFullStep?.round === "Preliminar" && dueStep.round === firstMainRound?.round) {
      const preliminaryWinners = getSurvivingCupTeams(currentSave, cupLeague);
      const mainBracketTeams = cupData.participants.filter((id) => !cupData.preliminaryParticipants?.includes(id));
      drawTeams = [...preliminaryWinners, ...mainBracketTeams];
    } else {
      const survivingTeams = getSurvivingCupTeams(currentSave, cupLeague);
      drawTeams = survivingTeams.length > 0 ? survivingTeams : [...cupData.participants];
    }
    if (drawTeams.length < 2) return null;
    const next = applyCupDraw(currentSave, cupLeague, dueStep.round, shuffledMatchups(drawTeams));
    saveSave(next);
    return next;
  }

  function resolvePendingDrawsForJump(date: string): boolean {
    // La mayoría de los días no tienen sorteos. Consultar el estado primero evita
    // parsear el guardado completo en cada día de un salto largo.
    const store = usePlayersStore.getState();
    let queue = [...(store.pendingDrawQueue ?? [])];
    if (queue.length === 0) {
      if (store.pendingCupDraw) queue.push("cup");
      if (store.pendingUclDraw) queue.push(store.pendingUclDraw as any);
    }
    if (queue.length === 0) return false;
    let currentSave = loadSave();
    if (!currentSave) return false;

    for (const draw of queue) {
      try {
        if (draw === "cup") {
          const resolvedCupDraw = resolveNationalCupDraw(currentSave, date);
          if (!resolvedCupDraw) return false;
          currentSave = resolvedCupDraw;
        } else if (draw === "league") {
          if (!currentSave.ucl?.drawState?.leagueDone) {
            currentSave = applyUCLLeagueDraw(currentSave, runSwissDraw(UCL_SEASON1_IDS));
          }
          currentSave = simulatePendingUCLThroughDay(currentSave, uclDayOffset(date), currentSave.myTeamId);
        } else if (draw === "playoff") {
          if (currentSave.ucl && !currentSave.ucl.drawState.playoffDone) currentSave = applyUCLPlayoffDraw(currentSave);
          currentSave = simulatePendingUCLThroughDay(currentSave, uclDayOffset(date), currentSave.myTeamId);
        } else if (draw === "knockout") {
          if (currentSave.ucl && !currentSave.ucl.drawState.knockoutDone) currentSave = applyUCLKnockoutDraw(currentSave);
          currentSave = simulatePendingUCLThroughDay(currentSave, uclDayOffset(date), currentSave.myTeamId);
        } else {
          const [competition, phase] = draw.split("-") as ["uel" | "uecl", "league" | "playoff" | "knockout"];
          currentSave = initializeEuropeanCompetition(currentSave, competition);
          const europeanState = (currentSave as any)[competition];
          if (phase === "league" && !europeanState?.drawState?.leagueDone) {
            currentSave = applyEuropeanLeagueDraw(
              currentSave,
              competition,
              runSwissDraw(EUROPEAN_CONFIGS[competition].participants),
            );
          } else if (phase === "playoff" && !europeanState?.drawState?.playoffDone) {
            currentSave = applyEuropeanPlayoffDraw(currentSave, competition);
          } else if (phase === "knockout" && !europeanState?.drawState?.knockoutDone) {
            currentSave = applyEuropeanKnockoutDraw(currentSave, competition);
          }
          currentSave = simulatePendingEuropeanThroughDay(
            currentSave,
            competition,
            Math.floor((parseDateOnly(date).getTime() - parseDateOnly(EUROPEAN_START).getTime()) / 86400000),
            currentSave.myTeamId,
          );
        }
        saveSave(currentSave);
        usePlayersStore.getState().finishPendingDraw();
      } catch (error) {
        console.error("[Calendar] No se pudo resolver automáticamente un sorteo durante el salto:", draw, error);
        return false;
      }
    }
    // SORTEO_VISIBLE_EN_SALTO: un sorteo es un evento raro (unas pocas veces por
    // temporada), así que publicamos el save ya sorteado también durante el salto.
    // Así los partidos nuevos de tu equipo aparecen en el calendario al momento y
    // no solo al llegar a la fecha final.
    setSave(currentSave);
    return true;
  }

  function persistScheduledLeagueResults(date: string): any | null {
    // Primero filtrar el pequeño calendario en memoria. En un día normal no hay
    // resultados pendientes aquí, así que no hace falta leer/parsing del guardado.
    const candidates = usePlayersStore.getState().fixtures
      .filter((fixture) => fixture.date === date && fixture.isPlayed && fixture.homeScore != null && fixture.awayScore != null);
    if (candidates.length === 0) return null;

    const currentSave = loadSave();
    if (!currentSave) return null;

    const officialFixtures = currentSave.fixtures?.[currentSave.myLeague] ?? [];
    const officialPendingIds = new Set(
      officialFixtures.filter((fixture: any) => !fixture.result).map((fixture: any) => fixture.id),
    );
    const scheduledResults = candidates
      .filter((fixture) => officialPendingIds.has(fixture.id))
      .map((fixture) => ({
        fixtureId: fixture.id,
        date: fixture.date,
        result: {
          homeGoals: Number(fixture.homeScore) || 0,
          awayGoals: Number(fixture.awayScore) || 0,
          events: [],
          cards: [],
          injuries: [],
          xgHome: 0,
          xgAway: 0,
          highlights: [],
          ratings: [],
          substitutions: [],
        },
        scoreOnly: true,
      }));

    if (scheduledResults.length === 0) return null;

    const updatedSave = commitCalendarScheduleResults(currentSave, scheduledResults);
    saveSave(updatedSave);
    return updatedSave;
  }

  async function resolveIntermediateDate(date: string): Promise<boolean> {
    const store = usePlayersStore.getState();
    const teamId = store.myTeamId;
    if (!teamId) return false;
    let handled = false;
    // Suprimir primero cualquier modal del día intermedio; el partido sigue en
    // el calendario y se simulará justo después por el mismo motor rápido.
    const pendingAtStart = usePlayersStore.getState().pendingUserMatch;
    if (pendingAtStart) {
      usePlayersStore.getState().dismissMatch(pendingAtStart.id);
      handled = true;
    }
    if (measureCalendarJumpPhase("simulation.drawResolution", () => resolvePendingDrawsForJump(date))) handled = true;

    // En días normales advanceTime ya resuelve los partidos de IA. Si un sorteo
    // bloqueó ese tick, aquí recuperamos también cualquier partido de liga que
    // quedara sin procesar. Primero IA y después el equipo del usuario.
    const scheduleMatches = usePlayersStore.getState().fixtures
      .filter((fixture) => fixture.date === date && !fixture.isPlayed)
      .sort((a, b) => Number(involvesTeam(a, teamId)) - Number(involvesTeam(b, teamId)) || a.id.localeCompare(b.id));
    for (const fixture of scheduleMatches) {
      if (usePlayersStore.getState().simulateMatchForCalendarJump(fixture.id)) handled = true;
    }
    const unresolvedLeagueMatches = usePlayersStore.getState().fixtures.filter(
      (fixture) => fixture.date === date && !fixture.isPlayed,
    );
    if (unresolvedLeagueMatches.length > 0) {
      throw new Error(
        `No se han podido completar todos los partidos de liga del ${date}: ${unresolvedLeagueMatches.length} pendiente(s). El salto se ha detenido para no perder resultados.`,
      );
    }

    const persistedSave = persistScheduledLeagueResults(date);
    if (persistedSave) handled = true;
    let currentSave = persistedSave ?? loadSave();
    if (currentSave) {
      const country = LEAGUES[currentSave.myLeague]?.country;
      const cupLeague = (country ? getPrimaryLeagueForCountry(country) : currentSave.myLeague) as LeagueId;
      const countryCup = currentSave.cupFixtures?.[cupLeague];
      if (Array.isArray(countryCup)) {
        const cupMatchdays = new Set<number>(
          countryCup
            .filter((fixture: any) => !fixture.result && (fixture.homeId === teamId || fixture.awayId === teamId))
            .filter((fixture: any) => getCupFixtureDateIso(fixture) === date)
            .map((fixture: any) => Number(fixture.matchday)),
        );
        for (const matchday of cupMatchdays) {
          currentSave = await simulateCupMatchdayLayered(currentSave, matchday, undefined, cupLeague);
          saveSave(currentSave);
          handled = true;
        }
        const unresolvedCupMatches = (currentSave?.cupFixtures?.[cupLeague] ?? []).filter(
          (fixture: any) => !fixture.result && (fixture.homeId === teamId || fixture.awayId === teamId) && getCupFixtureDateIso(fixture) === date,
        );
        if (unresolvedCupMatches.length > 0) {
          throw new Error(`No se han podido completar todos los partidos de copa del ${date}. El salto se ha detenido para no perder resultados.`);
        }
      }

      const uclMatchdays = new Set<number>(
        (currentSave.uclFixtures ?? [])
          .filter((fixture: any) => !fixture.result && (fixture.homeId === teamId || fixture.awayId === teamId))
          .filter((fixture: any) => getEuropeanFixtureDateIso(fixture, "ucl") === date)
          .map((fixture: any) => Number(fixture.matchday)),
      );
      for (const matchday of uclMatchdays) {
        const dayFixtures = (currentSave.uclFixtures ?? []).filter((fixture: any) => fixture.matchday === matchday && !fixture.result);
        const isLeaguePhase = dayFixtures.some((fixture: any) => /^Jornada\s+\d+$/i.test(String(fixture.round ?? "")));
        currentSave = isLeaguePhase
          ? simulateUCLMatchday(currentSave, matchday)
          : simulateUCLKnockoutMatchday(currentSave, matchday);
        currentSave = processUCLKnockoutProgress(currentSave, uclDayOffset(date));
        saveSave(currentSave);
        handled = true;
      }
      const unresolvedUclMatches = (currentSave.uclFixtures ?? []).filter(
        (fixture: any) => !fixture.result && (fixture.homeId === teamId || fixture.awayId === teamId) && getEuropeanFixtureDateIso(fixture, "ucl") === date,
      );
      if (unresolvedUclMatches.length > 0) {
        throw new Error(`No se han podido completar todos los partidos de Champions del ${date}. El salto se ha detenido para no perder resultados.`);
      }

      for (const competition of ["uel", "uecl"] as const) {
        const fixtureKey = competition === "uel" ? "uelFixtures" : "ueclFixtures";
        const europeanMatchdays = new Set<number>(
          (((currentSave as any)[fixtureKey] ?? []) as any[])
            .filter((fixture: any) => !fixture.result && (fixture.homeId === teamId || fixture.awayId === teamId))
            .filter((fixture: any) => getEuropeanFixtureDateIso(fixture, competition) === date)
            .map((fixture: any) => Number(fixture.matchday)),
        );
        for (const matchday of europeanMatchdays) {
          const list = (((currentSave as any)[fixtureKey] ?? []) as any[]).filter((fixture: any) => Number(fixture.matchday) === matchday && !fixture.result);
          const isLeaguePhase = list.some((fixture: any) => /^Jornada\s+\d+$/i.test(String(fixture.round ?? "")));
          currentSave = isLeaguePhase
            ? simulateEuropeanLeagueMatchday(currentSave, competition, matchday)
            : simulateEuropeanKnockoutMatchday(currentSave, competition, matchday);
          const europeanOffset = Math.floor(
            (parseDateOnly(date).getTime() - parseDateOnly(EUROPEAN_START).getTime()) / 86400000,
          );
          currentSave = processEuropeanKnockoutProgress(currentSave, competition, europeanOffset);
          saveSave(currentSave);
          handled = true;
        }
        const finalList = (((currentSave as any)[fixtureKey] ?? []) as any[]);
        const unresolvedEuropeanMatches = finalList.filter(
          (fixture: any) => !fixture.result && (fixture.homeId === teamId || fixture.awayId === teamId) && getEuropeanFixtureDateIso(fixture, competition) === date,
        );
        if (unresolvedEuropeanMatches.length > 0) {
          const label = competition === "uel" ? "Europa League" : "Conference League";
          throw new Error(`No se han podido completar todos los partidos de ${label} del ${date}. El salto se ha detenido para no perder resultados.`);
        }
      }
    }

    // Suprimir los avisos de partido que correspondían a eventos ya resueltos.
    const latest = usePlayersStore.getState();
    if (latest.pendingUserMatch) {
      const pendingId = latest.pendingUserMatch.id;
      latest.dismissMatch(pendingId);
      handled = true;
    }

    if (handled && currentSave && !jumpInProgressRef.current) setSave(currentSave);
    return handled;
  }

  const handleJumpToDate = async () => {
    const targetDate = selectedJumpDate;
    const initialDate = usePlayersStore.getState().currentDate;
    if (!targetDate || targetDate <= initialDate || jumpInProgressRef.current) return;

    const profileEnabled = startCalendarJumpProfile(initialDate, targetDate);
    let batchOpen = false;
    let outcome: "ok" | "error" = "error";
    let lastCheckpointState: any = null;
    let lastCheckpointMarketState: any = null;

    const restoreCheckpointMarketState = async () => {
      if (!lastCheckpointMarketState) return;
      try {
        applyTransferSnapshot(lastCheckpointMarketState);
        const persisted = await persistCalendarJumpMarketState();
        if (!persisted) {
          console.error("[Calendar] No se pudo persistir la restauración del mercado tras el rollback.");
        }
      } catch (marketRollbackError) {
        console.error("[Calendar] Falló la restauración del mercado durante el rollback:", marketRollbackError);
      }
    };

    const captureRollbackState = () => {
      const state = usePlayersStore.getState();
      return {
        ...state,
        squad: state.squad.map((player: any) => ({
          ...player,
          dynamicStats: player.dynamicStats ? { ...player.dynamicStats } : player.dynamicStats,
        })),
        fixtures: state.fixtures.map((fixture: any) => ({ ...fixture, result: fixture.result ? { ...fixture.result } : fixture.result })),
        stats: Object.fromEntries(Object.entries(state.stats ?? {}).map(([id, stat]: [string, any]) => [
          id,
          { ...stat, formHistory: Array.isArray(stat.formHistory) ? [...stat.formHistory] : stat.formHistory },
        ])),
        dismissedMatchIds: [...(state.dismissedMatchIds ?? [])],
        pendingDrawQueue: (state.pendingDrawQueue ?? []).map((item: any) => ({ ...item })),
        loanedPlayers: { ...(state.loanedPlayers ?? {}) },
        clubOverrides: { ...(state.clubOverrides ?? {}) },
        dynamicPlayers: Object.fromEntries(Object.entries(state.dynamicPlayers ?? {}).map(([id, player]: [string, any]) => [
          id,
          { ...player, dynamicStats: player.dynamicStats ? { ...player.dynamicStats } : player.dynamicStats },
        ])),
      };
    };

    // Reparación única de placeholders históricos. Se hace antes de iniciar el
    // batch, de forma que la reparación válida no dependa de cómo termine el salto.
    try {
      const officialBeforeJump = loadSave();
      if (officialBeforeJump) {
        const repaired = measureCalendarJumpPhase("calendar.repairPlaceholderResults", () =>
          repairPlaceholderCalendarResults(officialBeforeJump),
        );
        if (typeof performance !== "undefined") {
          recordCalendarJumpCounter("calendar.placeholderResultsRepaired", repaired.repairedIds.length);
        }
        if (repaired.repairedIds.length > 0) {
          saveSave(repaired.save);
          const leagueResults = new Map(
            (repaired.save.fixtures?.[repaired.save.myLeague] ?? []).map((fixture: any) => [fixture.id, fixture]),
          );
          usePlayersStore.setState((state: any) => ({
            fixtures: state.fixtures.map((fixture: any) => {
              if (!repaired.repairedIds.includes(fixture.id)) return fixture;
              const official: any = leagueResults.get(fixture.id);
              if (!official?.result) return fixture;
              return {
                ...fixture,
                isPlayed: true,
                homeScore: Number(official.result.homeGoals) || 0,
                awayScore: Number(official.result.awayGoals) || 0,
              };
            }),
          }));
        }
      }
    } catch (repairError) {
      console.warn("[Calendar] No se pudieron reparar resultados antiguos vacíos:", repairError);
    }

    // Bloquea nuevos clics mientras terminan posibles tareas del avance manual
    // anterior. Ese drenaje ocurre ANTES de abrir el batch de persistencia.
    jumpInProgressRef.current = true;
    setCalendarJumpActive(true);
    setIsAdvancing(true);
    setJumpStartDate(initialDate);
    setJumpMessage(null);
    clearCalendarJumpBackgroundErrors();
    try {
      await measureCalendarJumpPhase("calendar.awaitInitialBackgroundTasks", () =>
        usePlayersStore.getState().waitForCalendarBackgroundTasks(),
      );
    } catch (backgroundError) {
      setJumpMessage(backgroundError instanceof Error ? backgroundError.message : "No se pudieron completar las tareas previas al salto.");
      jumpInProgressRef.current = false;
      setCalendarJumpActive(false);
      setJumpStartDate(null);
      setIsAdvancing(false);
      if (profileEnabled) finishCalendarJumpProfile(usePlayersStore.getState().currentDate, "error");
      return;
    }

    try {
      const marketPersisted = await persistCalendarJumpMarketState();
      if (!marketPersisted) throw new Error("El almacenamiento del mercado no confirmó el guardado inicial.");
      lastCheckpointMarketState = snapshotTransferSystem();
    } catch (marketError) {
      setJumpMessage(marketError instanceof Error ? marketError.message : "No se pudo guardar el mercado antes del salto.");
      jumpInProgressRef.current = false;
      setCalendarJumpActive(false);
      setJumpStartDate(null);
      setIsAdvancing(false);
      if (profileEnabled) finishCalendarJumpProfile(usePlayersStore.getState().currentDate, "error");
      return;
    }

    if (!beginSaveBatch({ checkpointEveryDays: 7 })) {
      setJumpMessage("No se ha podido guardar el estado actual antes del salto. No se ha avanzado el calendario.");
      jumpInProgressRef.current = false;
      setCalendarJumpActive(false);
      setJumpStartDate(null);
      setIsAdvancing(false);
      if (profileEnabled) finishCalendarJumpProfile(usePlayersStore.getState().currentDate, "error");
      return;
    }
    batchOpen = true;

    let iterations = 0;
    try {
      await usePlayersStore.getState().beginCalendarJumpAcademyAiBatch();
      lastCheckpointState = captureRollbackState();

      while (usePlayersStore.getState().currentDate < targetDate && iterations < 800) {
        iterations += 1;
        recordCalendarJumpCounter("calendar.loopIterations");
        const before = usePlayersStore.getState().currentDate;

        // Modo jump usa los mismos subsistemas que el avance normal, pero evita
        // simular el día destino y no persiste cada mutación intermedia en disco.
        const advanced = measureCalendarJumpPhase("calendar.advanceTime", () =>
          advanceTime(1, { simulateAllLeagues: true, mode: "jump", targetDate }),
        );
        const after = usePlayersStore.getState().currentDate;
        recordCalendarJumpCounter("calendar.advanceTime.calls");

        if (after === before || advanced === 0) {
          // El reloj se puede detener para un sorteo o un partido del usuario.
          // Resolvemos el evento y repetimos el mismo día hasta que el pipeline
          // normal pueda continuar; no se descarta ni se salta el bloqueo.
          const dateToResolve = after === before ? before : after;
          const handled = await measureCalendarJumpPhase("calendar.resolveIntermediateDate", () =>
            resolveIntermediateDate(dateToResolve),
          );
          if (!handled && usePlayersStore.getState().currentDate === before) {
            throw new Error(`El calendario no pudo avanzar desde ${before}; hay un evento pendiente que no se ha podido resolver.`);
          }

          const currentAfterResolve = usePlayersStore.getState().currentDate;
          await measureCalendarJumpPhase("calendar.yieldToBrowser", waitForCalendarEffects);
          if (currentAfterResolve > before) {
            recordCalendarJumpCounter("calendar.daysAdvanced");
            const checkpointDue = isSaveBatchCheckpointDueNextDay();
            if (checkpointDue) {
              await measureCalendarJumpPhase("calendar.awaitCheckpointBackgroundTasks", () =>
                usePlayersStore.getState().waitForCalendarBackgroundTasks(),
              );
              await measureCalendarJumpPhase("calendar.flushAcademyAiCheckpoint", () =>
                usePlayersStore.getState().flushCalendarJumpAcademyAiChanges(),
              );
              const marketPersisted = await persistCalendarJumpMarketState();
              if (!marketPersisted) throw new Error(`No se pudo guardar el mercado en el checkpoint del ${currentAfterResolve}.`);
            }
            const checkpoint = checkpointSaveBatchDay();
            if (!checkpoint.persisted) throw new Error(`No se pudo guardar el checkpoint del ${currentAfterResolve}. El salto se ha detenido.`);
            if (checkpoint.checkpointed) {
              lastCheckpointState = captureRollbackState();
              lastCheckpointMarketState = snapshotTransferSystem();
            }
          }
          continue;
        }

        // Días intermedios: cerrar competiciones del día que acaba de abrirse.
        // La fecha final se deja intacta para que aparezcan sus eventos habituales.
        if (after < targetDate) {
          await measureCalendarJumpPhase("calendar.resolveIntermediateDate", () => resolveIntermediateDate(after));
        }

        recordCalendarJumpCounter("calendar.daysAdvanced");
        await measureCalendarJumpPhase("calendar.yieldToBrowser", waitForCalendarEffects);
        const checkpointDue = isSaveBatchCheckpointDueNextDay();
        if (checkpointDue) {
          await measureCalendarJumpPhase("calendar.awaitCheckpointBackgroundTasks", () =>
            usePlayersStore.getState().waitForCalendarBackgroundTasks(),
          );
          await measureCalendarJumpPhase("calendar.flushAcademyAiCheckpoint", () =>
            usePlayersStore.getState().flushCalendarJumpAcademyAiChanges(),
          );
          const marketPersisted = await persistCalendarJumpMarketState();
          if (!marketPersisted) throw new Error(`No se pudo guardar el mercado en el checkpoint del ${after}.`);
        }

        const checkpoint = checkpointSaveBatchDay();
        if (!checkpoint.persisted) throw new Error(`No se pudo guardar el checkpoint del ${after}. El salto se ha detenido.`);
        if (checkpoint.checkpointed) {
          lastCheckpointState = captureRollbackState();
          lastCheckpointMarketState = snapshotTransferSystem();
        }
      }

      if (usePlayersStore.getState().currentDate !== targetDate) {
        throw new Error(iterations >= 800
          ? "El salto supera el límite de seguridad de días procesables."
          : `El calendario se detuvo en ${usePlayersStore.getState().currentDate}, antes de la fecha solicitada ${targetDate}.`);
      }

      await measureCalendarJumpPhase("calendar.awaitBackgroundTasks", () =>
        usePlayersStore.getState().waitForCalendarBackgroundTasks(),
      );
      await measureCalendarJumpPhase("calendar.flushAcademyAiFinal", () =>
        usePlayersStore.getState().flushCalendarJumpAcademyAiChanges(),
      );
      await measureCalendarJumpPhase("calendar.finalYield", waitForCalendarEffects);

      // El mercado vive en IndexedDB separado; se persiste y confirma ANTES del
      // commit final del SaveGame para evitar declarar éxito con ese sidecar pendiente.
      const finalMarketPersisted = await persistCalendarJumpMarketState();
      if (!finalMarketPersisted) throw new Error("No se ha podido guardar el mercado al finalizar el salto.");

      // Una única persistencia final, salvo checkpoints de seguridad cada 7 días.
      if (!endSaveBatch()) {
        // endSaveBatch conserva su snapshot si el guardado final falla; abort lo
        // restaura en memoria para que la carrera no parezca completada sin guardarse.
        const checkpointSave = abortSaveBatch();
        batchOpen = false;
        if (lastCheckpointState) {
          usePlayersStore.setState(lastCheckpointState, true);
          usePlayersStore.getState().init();
        }
        if (checkpointSave) setSave(checkpointSave);
        throw new Error("No se pudo guardar el estado final del salto. Se ha restaurado el último checkpoint válido.");
      }
      batchOpen = false;
      await usePlayersStore.getState().finishCalendarJumpAcademyAiBatch();

      const finalDate = usePlayersStore.getState().currentDate;
      setSave(loadSave());
      setSelectedJumpDate(null);
      setJumpMessage(`Calendario avanzado hasta el ${parseDateOnly(finalDate).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}. Se han procesado los eventos de los días anteriores; los del día destino siguen pendientes.`);
      outcome = "ok";
    } catch (error) {
      console.error("[Calendar] Error al saltar hasta la fecha seleccionada:", error);
      try {
        await usePlayersStore.getState().waitForCalendarBackgroundTasks();
      } catch (backgroundError) {
        console.warn("[Calendar] No se pudieron drenar todas las tareas de fondo antes del rollback:", backgroundError);
      }
      try {
        await usePlayersStore.getState().discardCalendarJumpAcademyAiChanges();
      } catch (academyRollbackError) {
        console.error("[Calendar] No se pudieron descartar las academias de IA pendientes:", academyRollbackError);
      }
      try {
        await usePlayersStore.getState().finishCalendarJumpAcademyAiBatch();
      } catch (academyBatchError) {
        console.error("[Calendar] No se pudo cerrar el modo batch de academias IA:", academyBatchError);
      }
      clearCalendarJumpBackgroundErrors();
      if (batchOpen) {
        const checkpointSave = abortSaveBatch();
        batchOpen = false;
        if (lastCheckpointState) {
          usePlayersStore.setState(lastCheckpointState, true);
          usePlayersStore.getState().init();
        }
        if (checkpointSave) setSave(checkpointSave);
        else setSave(loadSave());
      }
      await restoreCheckpointMarketState();
      setJumpMessage(error instanceof Error ? error.message : "No se ha podido completar el salto de calendario.");
    } finally {
      const finalDate = usePlayersStore.getState().currentDate;
      jumpInProgressRef.current = false;
      setCalendarJumpActive(false);
      setJumpStartDate(null);
      setIsAdvancing(false);
      if (profileEnabled) finishCalendarJumpProfile(finalDate, outcome);
    }
  };

  const handleCupDrawComplete = (matchups: [string, string][]) => {
    if (!save?.cupDrawPending) return;

    // Get the primary league for the user's country (the league that holds the cup)

    const userCountry = LEAGUES[save.myLeague]?.country;

    const primaryLeague = userCountry ? getPrimaryLeagueForCountry(userCountry) : save.myLeague;

    const cupKey = (primaryLeague || save.myLeague) as LeagueId;

    const next = applyCupDraw(save, cupKey, save.cupDrawPending.round, matchups);

    saveSave(next);

    // Reload the save to ensure UI updates

    const reloaded = loadSave();

    if (reloaded) {
      setSave(reloaded);
    }
    ensureLeagueSchedule();

    setShowCupDrawModal(false);

    clearPendingCupDraw();

    // Clear the notification flag so it can show again for future rounds

    sessionStorage.removeItem("cupDrawNotified");
  };

  const viewDate = new Date(viewYear, viewMonth, 1);

  const onCurrentMonth = viewYear === gameDate.getFullYear() && viewMonth === gameDate.getMonth();

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black">Calendario</h1>

          <p className="text-xs text-muted-foreground mt-1 capitalize">
            Día actual del juego · avanza el tiempo para abrir ventanas de mercado
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!pendingMatch || isAdvancing}
            onClick={handleAdvanceDay}
            className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition shadow-[0_0_12px_hsl(var(--primary)/0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdvancing ? "Simulando..." : "Avanzar día"}
          </button>
        </div>
      </div>

      <MarketStatusBanner className="mb-6" />

      <div className="panel-glow p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={prevMonth}
            className="p-2 rounded-lg border border-border hover:border-primary/60 transition"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <h2 className="text-lg font-black capitalize">{fmtMonth(viewDate)}</h2>

            {!onCurrentMonth && (
              <button
                type="button"
                onClick={goToToday}
                className="text-xs text-primary hover:underline mt-0.5"
              >
                Ir al mes actual
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={nextMonth}
            className="p-2 rounded-lg border border-border hover:border-primary/60 transition"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="text-center text-[0.65rem] font-bold uppercase text-muted-foreground py-1"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.map((day) => {
            const inMonth = day.getMonth() === viewMonth;

            const iso = toDateOnly(day);

            const isToday = iso === currentDateIso;
            const canSelectJumpDate = iso > currentDateIso && !isAdvancing;
            const isSelectedJumpDate = selectedJumpDate === iso;

            const isWindow = isSummerTransferWindow(day) || isWinterTransferWindow(day);

            const windowHighlight = isMarketOpen && isTransferWindowDay(day, gameDate);

            const dayFixtures = allFixturesByDate.get(iso) ?? [];

            const isDrawDay = cupDrawDays.has(iso);

            return (
              <div
                key={iso + String(inMonth)}
                role={canSelectJumpDate ? "button" : undefined}
                tabIndex={canSelectJumpDate ? 0 : -1}
                aria-pressed={isSelectedJumpDate}
                aria-label={canSelectJumpDate ? `Seleccionar ${iso} para saltar el calendario` : undefined}
                onClick={() => {
                  if (!canSelectJumpDate) return;
                  setSelectedJumpDate(iso);
                  setJumpMessage(null);
                }}
                onKeyDown={(event) => {
                  if (canSelectJumpDate && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    setSelectedJumpDate(iso);
                    setJumpMessage(null);
                  }
                }}
                className={[
                  "min-h-[4.5rem] rounded-md border p-1 flex flex-col items-stretch justify-start gap-0.5 transition",

                  inMonth ? "border-border/60 bg-card/40" : "border-transparent opacity-30",
                  canSelectJumpDate ? "cursor-pointer hover:border-primary/60 hover:bg-primary/5" : "",
                  isSelectedJumpDate ? "ring-2 ring-amber-400 border-amber-400 bg-amber-400/10 z-[2]" : "",

                  isWindow && inMonth ? "bg-emerald-500/5 border-emerald-500/20" : "",

                  isToday
                    ? "ring-2 ring-primary border-primary bg-primary/10 font-black z-[1]"
                    : "",
                ].join(" ")}
              >
                <span
                  className={`text-xs text-center ${isToday ? "text-primary" : inMonth ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {day.getDate()}
                </span>

                {isToday && (
                  <span className="text-[0.55rem] uppercase tracking-wider text-primary font-bold text-center">
                    Hoy
                  </span>
                )}

                <div className="flex flex-col gap-0.5 w-full mt-auto">
                  {inMonth &&
                    myTeamId &&
                    allFixturesByDate
                      .get(iso)
                      ?.map((f) => {
                        const isHome = f.homeTeam === myTeamId || f.homeId === myTeamId;

                        const opponentId = isHome ? f.awayTeam || f.awayId : f.homeTeam || f.homeId;

                        if (!opponentId) return null;

                        const isCup = f.competition === "cup";
                        const color = isCup ? "bg-purple-600/90" : "bg-red-600/90";
                        const label = isCup ? "C" : `J${f.matchday}`;
                        const savedResult = (f as any).result;
                        const scheduleResult = (f as any).isPlayed && (f as any).homeScore != null && (f as any).awayScore != null
                          ? `${(f as any).homeScore}–${(f as any).awayScore}`
                          : null;
                        const score = calendarResultLabel(savedResult) ?? scheduleResult;
                        const homeId = f.homeId || f.homeTeam;
                        const awayId = f.awayId || f.awayTeam;
                        if (!homeId || !awayId) return null;
                        return (
                          <div
                            key={f.id}
                            className={`flex items-center justify-center gap-1 w-full min-w-0 text-[0.5rem] leading-tight font-bold px-0.5 py-0.5 rounded ${color} text-white ${homeId === myTeamId || awayId === myTeamId ? "ring-1 ring-inset ring-primary/70" : ""}`}
                            title={`${isCup ? "Copa" : "Liga"} · ${homeId === myTeamId ? "Local" : "Visitante"}${score ? ` · Resultado ${score}` : " · Pendiente"}`}
                          >
                            <CalendarTeamLogo teamId={homeId} size={12} />
                            <span className="truncate">{score ?? label}</span>
                            <CalendarTeamLogo teamId={awayId} size={12} />
                          </div>
                        );
                      })
                      .filter(Boolean)}

                  {inMonth && uelMatchDays.has(iso) && uelMatchDays.get(iso)!.map((f) => (
                    <EuropeanCalendarChip key={f.id} fixture={f} label="UEL" color="bg-orange-600/90" title={`Europa League · ${f.homeId === myTeamId ? "Local" : "Visitante"}`} />
                  ))}

                  {inMonth && ueclMatchDays.has(iso) && ueclMatchDays.get(iso)!.map((f) => (
                    <EuropeanCalendarChip key={f.id} fixture={f} label="UECL" color="bg-green-600/90" title={`Conference League · ${f.homeId === myTeamId ? "Local" : "Visitante"}`} />
                  ))}

                  {windowHighlight && inMonth && !isToday && dayFixtures.length === 0 && (
                    <span
                      className="mx-auto w-1.5 h-1.5 rounded-full bg-emerald-400/80"
                      title="Ventana de mercado"
                    />
                  )}

                  {isDrawDay && inMonth && !isToday && (
                    <div className="mx-auto flex items-center gap-1 px-2 py-1 bg-purple-500/20 border border-purple-500/40 rounded-full">
                      <span className="text-[0.35rem] font-bold text-purple-300 uppercase">
                        Sorteo
                      </span>
                    </div>
                  )}

                  {uclDrawDays.has(iso) && inMonth && (
                    <div className="mx-auto flex items-center gap-1 px-2 py-1 bg-blue-500/20 border border-blue-500/40 rounded-full">
                      <Trophy className="h-3 w-3 text-blue-300" />
                      <span className="text-[0.35rem] font-bold text-blue-300 uppercase">
                        UCL Draw
                      </span>
                    </div>
                  )}

                  {inMonth && europeanDrawDays.has(iso) && (
                    <div className="flex flex-wrap justify-center gap-1">
                      {europeanDrawDays.get(iso)!.map((label) => (
                        <div key={label} className={`mx-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${label.startsWith("Europa") ? "bg-orange-500/20 border-orange-500/40" : "bg-green-500/20 border-green-500/40"}`}>
                          <Trophy className={`h-2.5 w-2.5 ${label.startsWith("Europa") ? "text-orange-300" : "text-green-300"}`} />
                          <span className={`text-[0.32rem] font-bold uppercase ${label.startsWith("Europa") ? "text-orange-300" : "text-green-300"}`}>
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {inMonth && uclMatchDays.has(iso) && uclMatchDays.get(iso)!.map((f) => (
                    <EuropeanCalendarChip key={f.id} fixture={f} label="UCL" color="bg-blue-700/90" title={`Champions League · ${f.homeId === myTeamId ? "Local" : "Visitante"}`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {selectedJumpDate && selectedJumpDate > currentDateIso && (
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold">Saltar al {parseDateOnly(selectedJumpDate).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</p>
              {isAdvancing ? (
                <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                  Procesando {parseDateOnly(currentDateIso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })} · quedan {Math.max(0, Math.round((parseDateOnly(selectedJumpDate).getTime() - parseDateOnly(currentDateIso).getTime()) / 86400000))} días
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Se simularán los días intermedios en orden, incluidos partidos, sorteos, estadísticas, sanciones, lesiones y eventos del mercado. Los eventos del propio día seleccionado quedarán pendientes como de costumbre.</p>
              )}
              {isAdvancing && jumpStartDate && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-label="Progreso del salto">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-100"
                    style={{
                      width: `${Math.max(0, Math.min(100, ((parseDateOnly(currentDateIso).getTime() - parseDateOnly(jumpStartDate).getTime()) / Math.max(1, parseDateOnly(selectedJumpDate).getTime() - parseDateOnly(jumpStartDate).getTime())) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={isAdvancing}
                onClick={() => setSelectedJumpDate(null)}
                className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isAdvancing || !selectedJumpDate || selectedJumpDate <= currentDateIso}
                onClick={handleJumpToDate}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-black text-primary-foreground shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAdvancing ? `Simulando ${Math.max(0, Math.round((parseDateOnly(selectedJumpDate).getTime() - parseDateOnly(currentDateIso).getTime()) / 86400000))} días…` : "Confirmar salto"}
              </button>
            </div>
          </div>
        )}

        {jumpMessage && (
          <div className="mt-3 rounded-lg border border-border bg-card/70 px-4 py-3 text-xs text-muted-foreground">
            {jumpMessage}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-border/40 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded ring-2 ring-primary bg-primary/20" />
            Día actual
          </span>

          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" />
            Ventana de fichajes
          </span>

          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-red-600/90" />
            Partido de liga
          </span>

          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-purple-600/90" />
            Partido de copa
          </span>

          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400/80" />
            Sorteo de copa
          </span>

          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-blue-700/90" />
            Partido UCL
          </span>

          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400/80" />
            Sorteo UCL
          </span>

          <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-orange-600/90" /> Europa League</span>
          <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-green-600/90" /> Conference League</span>
        </div>
      </div>

      {showUclDrawModal && activePendingDraw && activePendingDraw !== "cup" && (
        activePendingDraw.startsWith("uel-") || activePendingDraw.startsWith("uecl-") ? (
          <EuropeanDrawModal
            type={activePendingDraw.split("-")[1] as "league" | "playoff" | "knockout"}
            competition={activePendingDraw.startsWith("uel-") ? "uel" : "uecl"}
            save={save!}
            onClose={() => {
              setShowUclDrawModal(false);
              setSave(loadSave());
            }}
            onComplete={(updated) => {
              const comp = activePendingDraw.startsWith("uel-") ? "uel" : "uecl";
              const offset = uclDayOffset(usePlayersStore.getState().currentDate);
              const synced = simulatePendingEuropeanThroughDay(updated, comp, offset, updated.myTeamId);
              saveSave(synced);
              setSave(loadSave());
              ensureLeagueSchedule();
              setShowUclDrawModal(false);
              finishPendingDraw();
            }}
          />
        ) : (
          <UCLDrawModal
            type={activePendingDraw as "league" | "playoff" | "knockout"}
            save={save!}
            onClose={() => { setShowUclDrawModal(false); setSave(loadSave()); }}
            onComplete={(updated) => {
              const offset = uclDayOffset(usePlayersStore.getState().currentDate);
              const synced = simulatePendingUCLThroughDay(updated, offset, updated.myTeamId);
              saveSave(synced);
              setSave(loadSave());
              ensureLeagueSchedule();
              setShowUclDrawModal(false);
              finishPendingDraw();
            }}
          />
        )
      )}

      {save?.cupDrawPending && (
        <CupDrawModal
          isOpen={showCupDrawModal}
          onClose={() => {
            setShowCupDrawModal(false);

            clearPendingCupDraw();

            const updated = loadSave();

            if (updated) {
              updated.cupDrawPending = null;

              saveSave(updated);

              setSave(updated);
            }
          }}
          round={save.cupDrawPending.round}
          teams={save.cupDrawPending.teams}
          league={save.cupDrawPending.league}
          onComplete={(matchups) => {
            const updated = loadSave();

            if (updated && save.cupDrawPending) {
              const withDraw = applyCupDraw(
                updated,
                save.cupDrawPending.league,
                save.cupDrawPending.round,
                matchups,
              );
              withDraw.cupDrawPending = null;

              saveSave(withDraw);

              setSave(withDraw);
              ensureLeagueSchedule();
              setShowCupDrawModal(false);
              finishPendingDraw();
            }
          }}
        />
      )}
    </div>
  );
}

// @ts-nocheck
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";

import {
  loadSave,
  saveSave,
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
} from "@/lib/store";

import { monthDays, fmtMonth, COMP_COLORS } from "@/lib/calendar";

import { getCupStructureForCountry, initCup } from "@/lib/cups";

import { usePlayersStore } from "@/store/playersStore";

import { useTransferMarket } from "@/hooks/useTransferMarket";

import { MarketStatusBanner } from "@/components/MarketStatusBanner";

import { TeamLogo } from "@/components/TeamLogo";

import { CupDrawModal } from "@/components/CupDrawModal";

import { UCLDrawModal } from "@/components/UCLDrawModal";
import { EuropeanDrawModal } from "@/components/EuropeanDrawModal";
import { Trophy } from "lucide-react";

import { UCL_START, UCL_CALENDAR, uclDayOffset } from "@/data/ucl";
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

import { ChevronLeft, ChevronRight } from "lucide-react";

// Helper to get league name from league ID

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function CalendarPage() {
  const navigate = useNavigate();

  const currentDateIso = usePlayersStore((s) => s.currentDate);

  const advanceTime = usePlayersStore((s) => s.advanceTime);

  const clearPendingCupDraw = usePlayersStore((s) => s.clearPendingCupDraw);

  const myTeamId = usePlayersStore((s) => s.myTeamId);

  const fixtures = usePlayersStore((s) => s.fixtures);

  const ensureLeagueSchedule = usePlayersStore((s) => s.ensureLeagueSchedule);

  const pendingMatch = usePlayersStore((s) => s.pendingUserMatch);

  const { isMarketOpen } = useTransferMarket();

  const [save, setSave] = useState(loadSave());

  const [showCupDrawModal, setShowCupDrawModal] = useState(false);

  const [isAdvancing, setIsAdvancing] = useState(false);

  const pendingUclDraw = usePlayersStore((s) => s.pendingUclDraw);

  const clearPendingUclDraw = usePlayersStore((s) => s.clearPendingUclDraw);

  const [showUclDrawModal, setShowUclDrawModal] = useState(false);

  // Open UCL draw modal when pending

  useEffect(() => {
    if (pendingUclDraw) setShowUclDrawModal(true);
  }, [pendingUclDraw]);

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
    if (!save) return;

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

      // Convert drawMatchdays to actual dates (cup starts July 7, 2025)

      // drawMatchday = days offset from July 7th (0=Jul7, 1=Jul8, etc.)

      const cupStart = new Date("2025-07-07T00:00:00Z");

      const today = currentDateIso; // already an ISO string like "2025-07-07"

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
          new Date("2025-07-07T00:00:00Z").getTime() + s.drawMatchday * 86400000,
        );

        return toDateOnly(drawDate) === today;
      });

      const hasCurrentRoundFixtures = currentDrawRound
        ? cupFixtures.some((f) => f.round === currentDrawRound.round)
        : false;

      console.log(
        `[Calendar cup check] userCountry: ${userCountry}, myTeamId: ${myTeamId}, isInPreliminary: ${isInPreliminary}`,
      );

      console.log(
        `[Calendar cup check] today: ${today}, isDrawDay: ${isDrawDay}, hasCurrentRoundFixtures: ${hasCurrentRoundFixtures}, cupDrawPending: ${!!save.cupDrawPending}`,
      );

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

      console.log(
        `[Calendar cup check] userInCup: ${userInCup}, isCupMatchDay: ${isCupMatchDay}, currentCupMatchday: ${currentCupMatchday}`,
      );

      // Los partidos de copa se simulan desde el store/background scheduler.
      // El calendario solo presenta las fechas y los sorteos; no ejecuta una
      // segunda simulación al renderizar.

      // A draw is shown on its calendar date, but if some country
      // finishes the previous global round later, the draw waits until the
      // whole worldwide round is complete. The calendar date remains the
      // planned draw date.
      const drawReadyRound = relevantSchedule.find((s) => {
        const drawDate = new Date(
          new Date("2025-07-07T00:00:00Z").getTime() + s.drawMatchday * 86400000,
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
            new Date("2025-07-07T00:00:00Z").getTime() + s.drawMatchday * 86400000,
          );

          return toDateOnly(drawDate) === today;
        });

        if (currentRound) {
          const updated = loadSave();

          if (!updated) return;

          // Use surviving teams if available, otherwise use initial participants

          console.log(
            `[Calendar] About to call getSurvivingCupTeams for round: ${currentRound.round}`,
          );

          const survivingTeams = getSurvivingCupTeams(updated, cupKey);

          console.log(`[Calendar] getSurvivingCupTeams returned ${survivingTeams.length} teams`);

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

            console.log(
              `[Calendar] ${currentRound.round} after prelim: combining ${prelimWinners.length} prelim winners with ${mainBracketTeams.length} main bracket teams`,
            );
          } else {
            // For all subsequent rounds (QF, SF, Final), use surviving teams from previous round

            drawTeams = survivingTeams.length > 0 ? survivingTeams : cupData.participants;
          }

          console.log(
            `[Calendar] Using ${drawTeams.length} teams for draw of round ${currentRound.round}`,
          );

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
  }, [save?.cupDrawPending, currentDateIso]); // Re-run when cupDrawPending or current date changes

  useEffect(() => {
    const latest = loadSave();
    if (latest) setSave(latest);
  }, [currentDateIso]);

  useLayoutEffect(() => {
    setBrowseMonth(null);
  }, [currentDateIso]);

  const viewYear = browseMonth?.year ?? gameDate.getFullYear();

  const viewMonth = browseMonth?.month ?? gameDate.getMonth();

  const calendarKey = `${currentDateIso}-${viewYear}-${viewMonth}`;

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

    // Cup starts July 7, 2025. matchday field = day offset from July 7th (0=Jul7, 1=Jul8...)

    const cupStart = new Date("2025-07-07T00:00:00Z");

    for (const f of myCupFixtures) {
      const matchDate = new Date(cupStart.getTime() + f.matchday * 86400000);

      const dateIso = toDateOnly(matchDate);

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

    // Cup starts July 7, 2025 - alternating: draw, match, draw, match...

    // drawMatchday = days offset from July 7th (0=Jul7, 2=Jul9, 4=Jul11...)

    const cupStart = new Date("2025-07-07T12:00:00Z");

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

    const start = new Date(UCL_START + "T00:00:00Z");

    for (const f of uclMyFixtures) {
      // f.matchday = day offset from UCL_START

      const matchDate = new Date(start.getTime() + f.matchday * 86400000);

      const iso = toDateOnly(matchDate);

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
    const start = new Date(EUROPEAN_START + "T00:00:00Z");
    for (const f of list) {
      const iso = toDateOnly(new Date(start.getTime() + f.matchday * 86400000));
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
      const advanced = advanceTime(1);
      const latest = usePlayersStore.getState();

      // `advanceTime` puede pausar voluntariamente para mostrar un partido o un
      // sorteo pendiente. En ese caso el propio store ya ha actualizado el estado.
      if (advanced === 0) {
        console.log('[Calendar] advanceTime pausado:', {
          currentDate: latest.currentDate,
          pendingUserMatch: !!latest.pendingUserMatch,
          pendingCupDraw: !!latest.pendingCupDraw,
          pendingUclDraw: !!latest.pendingUclDraw,
        });
      }

    } catch (err) {
      console.error('[Calendar] Error al avanzar el día:',
        err instanceof Error ? (err.stack || err.message) : err,
      );
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleCupDrawComplete = (matchups: [string, string][]) => {
    if (!save?.cupDrawPending) return;

    // Get the primary league for the user's country (the league that holds the cup)

    const userCountry = LEAGUES[save.myLeague]?.country;

    const primaryLeague = userCountry ? getPrimaryLeagueForCountry(userCountry) : save.myLeague;

    const cupKey = (primaryLeague || save.myLeague) as LeagueId;

    console.log(
      `handleCupDrawComplete called with ${matchups.length} matchups for league ${cupKey}`,
    );

    const next = applyCupDraw(save, cupKey, save.cupDrawPending.round, matchups);

    console.log(
      `After applyCupDraw, cupFixtures[${cupKey}] has ${next.cupFixtures[cupKey]?.length || 0} fixtures`,
    );

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

      <div className="panel-glow p-4" key={calendarKey}>
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

            const isWindow = isSummerTransferWindow(day) || isWinterTransferWindow(day);

            const windowHighlight = isMarketOpen && isTransferWindowDay(day, gameDate);

            const dayFixtures = allFixturesByDate.get(iso) ?? [];

            const isDrawDay = cupDrawDays.has(iso);

            return (
              <div
                key={iso + String(inMonth)}
                className={[
                  "min-h-[4.5rem] rounded-md border p-1 flex flex-col items-stretch justify-start gap-0.5 transition",

                  inMonth ? "border-border/60 bg-card/40" : "border-transparent opacity-30",

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

                        const opponent = teamById(opponentId);

                        const myTeam = teamById(myTeamId);

                        const isCup = f.competition === "cup";

                        const bgColor = isCup ? "bg-purple-600/90" : "bg-red-600/90";

                        const label = isCup ? "C" : `J${f.matchday}`;

                        return (
                          <div
                            key={f.id}
                            className={`flex items-center justify-center gap-1 w-full text-[0.5rem] leading-tight font-bold px-0.5 py-0.5 rounded ${bgColor} text-white`}
                            title={`${isCup ? "Copa" : "Liga"} - ${isHome ? "Local" : "Visitante"}`}
                          >
                            {isHome && (
                              <TeamLogo
                                teamName={myTeam.name}
                                leagueName={getLeagueName(myTeam.league)}
                                size={12}
                              />
                            )}

                            {!isHome && (
                              <TeamLogo
                                teamName={opponent.name}
                                leagueName={getLeagueName(opponent.league)}
                                size={12}
                              />
                            )}

                            <span>{label}</span>

                            {isHome && (
                              <TeamLogo
                                teamName={opponent.name}
                                leagueName={getLeagueName(opponent.league)}
                                size={14}
                              />
                            )}

                            {!isHome && (
                              <TeamLogo
                                teamName={myTeam.name}
                                leagueName={getLeagueName(myTeam.league)}
                                size={14}
                              />
                            )}
                          </div>
                        );
                      })
                      .filter(Boolean)}

                  {inMonth && uelMatchDays.has(iso) && uelMatchDays.get(iso)!.map((f) => {
                    const isHome = f.homeId === myTeamId;
                    const opponentId = isHome ? f.awayId : f.homeId;
                    const opponent = teamById(opponentId);
                    const mine = teamById(myTeamId!);
                    return opponent ? (
                      <div key={f.id} className="flex items-center justify-center gap-1 w-full text-[0.5rem] leading-tight font-bold px-0.5 py-0.5 rounded bg-orange-600/90 text-white" title={`Europa League - ${isHome ? "Local" : "Visitante"}`}>
                        <TeamLogo teamName={(isHome ? mine : opponent).name} leagueName={getLeagueName((isHome ? mine : opponent).league)} size={12} />
                        <span>UEL</span>
                      </div>
                    ) : null;
                  })}

                  {inMonth && ueclMatchDays.has(iso) && ueclMatchDays.get(iso)!.map((f) => {
                    const isHome = f.homeId === myTeamId;
                    const opponentId = isHome ? f.awayId : f.homeId;
                    const opponent = teamById(opponentId);
                    const mine = teamById(myTeamId!);
                    return opponent ? (
                      <div key={f.id} className="flex items-center justify-center gap-1 w-full text-[0.5rem] leading-tight font-bold px-0.5 py-0.5 rounded bg-green-600/90 text-white" title={`Conference League - ${isHome ? "Local" : "Visitante"}`}>
                        <TeamLogo teamName={(isHome ? mine : opponent).name} leagueName={getLeagueName((isHome ? mine : opponent).league)} size={12} />
                        <span>UECL</span>
                      </div>
                    ) : null;
                  })}

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

                  {inMonth &&
                    uclMatchDays.has(iso) &&
                    uclMatchDays.get(iso)!.map((f) => {
                      const isHome = f.homeId === myTeamId;

                      const opponentId = isHome ? f.awayId : f.homeId;

                      try {
                        const opponent = teamById(opponentId);

                        const myTeam = teamById(myTeamId!);

                        return (
                          <div
                            key={f.id}
                            className="flex items-center justify-center gap-1 w-full text-[0.5rem] leading-tight font-bold px-0.5 py-0.5 rounded bg-blue-700/90 text-white"
                            title={`UCL - ${isHome ? "Local" : "Visitante"}`}
                          >
                            {isHome && (
                              <TeamLogo
                                teamName={myTeam.name}
                                leagueName={getLeagueName(myTeam.league)}
                                size={12}
                              />
                            )}

                            {!isHome && (
                              <TeamLogo
                                teamName={opponent.name}
                                leagueName={getLeagueName(opponent.league)}
                                size={12}
                              />
                            )}

                            <Trophy className="h-3 w-3 inline-block text-white/90" />

                            {isHome && (
                              <TeamLogo
                                teamName={opponent.name}
                                leagueName={getLeagueName(opponent.league)}
                                size={14}
                              />
                            )}

                            {!isHome && (
                              <TeamLogo
                                teamName={myTeam.name}
                                leagueName={getLeagueName(myTeam.league)}
                                size={14}
                              />
                            )}
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })}
                </div>
              </div>
            );
          })}
        </div>

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

      {showUclDrawModal && pendingUclDraw && (
        pendingUclDraw.startsWith("uel-") || pendingUclDraw.startsWith("uecl-") ? (
          <EuropeanDrawModal
            type={pendingUclDraw.split("-")[1] as "league" | "playoff" | "knockout"}
            competition={pendingUclDraw.startsWith("uel-") ? "uel" : "uecl"}
            save={save!}
            onClose={() => {
              setShowUclDrawModal(false);
              clearPendingUclDraw();
              setSave(loadSave());
            }}
            onComplete={(updated) => {
              const comp = pendingUclDraw.startsWith("uel-") ? "uel" : "uecl";
              const offset = uclDayOffset(usePlayersStore.getState().currentDate);
              const synced = simulatePendingEuropeanThroughDay(updated, comp, offset, updated.myTeamId);
              saveSave(synced);
              setSave(loadSave());
              ensureLeagueSchedule();
              setShowUclDrawModal(false);
              clearPendingUclDraw();

              // UEL and UECL share the exact same calendar day. Queue the second draw immediately.
              const type = pendingUclDraw.split("-")[1] as "league" | "playoff" | "knockout";
              const other = comp === "uel" ? "uecl" : "uel";
              const otherState = synced[other];
              const cal = europeanCalendar();
              const currentOffset = uclDayOffset(usePlayersStore.getState().currentDate);
              const relevantKey = type === "league" ? "leagueDraw" : type === "playoff" ? "playoffDraw" : "knockoutDraw";
              if (otherState && currentOffset === cal[relevantKey]) {
                const done = relevantKey === "leagueDraw" ? otherState.drawState.leagueDone : relevantKey === "playoffDraw" ? otherState.drawState.playoffDone : otherState.drawState.knockoutDone;
                if (!done) {
                  usePlayersStore.setState({ pendingUclDraw: `${other}-${type}` });
                  return;
                }
              }
            }}
          />
        ) : (
          <UCLDrawModal
            type={pendingUclDraw}
            save={save!}
            onClose={() => { setShowUclDrawModal(false); clearPendingUclDraw(); setSave(loadSave()); }}
            onComplete={(updated) => {
              const offset = uclDayOffset(usePlayersStore.getState().currentDate);
              const synced = simulatePendingUCLThroughDay(updated, offset, updated.myTeamId);
              saveSave(synced); setSave(loadSave()); ensureLeagueSchedule(); setShowUclDrawModal(false); clearPendingUclDraw();
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

              saveSave(withDraw);

              setSave(withDraw);
              ensureLeagueSchedule();
            }
          }}
        />
      )}
    </div>
  );
}

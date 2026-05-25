import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";

import { loadSave, saveSave, applyCupDraw, autoDrawForeignCups, simulateRemainingCupMatches, getCurrentCupRound, getRoundNameByTeamCount, getSurvivingCupTeams, simulateCupMatchday, simulateCupMatchdayLayered, simulateBackgroundLeaguesOnly, scheduleBackgroundCupsOnly, processScheduledBackgroundSims, fixCupDraws, applyUCLLeagueDraw, applyUCLPlayoffDraw, applyUCLKnockoutDraw } from "@/lib/store";

import { monthDays, fmtMonth, COMP_COLORS } from "@/lib/calendar";

import { getCupStructureForCountry, initCup } from "@/lib/cups";

import { usePlayersStore } from "@/store/playersStore";

import { useTransferMarket } from "@/hooks/useTransferMarket";

import { MarketStatusBanner } from "@/components/MarketStatusBanner";

import { TeamLogo } from "@/components/TeamLogo";

import { CupDrawModal } from "@/components/CupDrawModal";

import { UCLDrawModal } from "@/components/UCLDrawModal";

import { UCL_START, UCL_CALENDAR } from "@/data/ucl";

import { teamById, LEAGUES, getPrimaryLeagueForCountry, type LeagueId } from "@/data/teams";

import {

  isSummerTransferWindow,

  isWinterTransferWindow,

  isTransferWindowDay,

  parseDateOnly,

  toDateOnly,

  addDaysToIso,

} from "@/lib/transferWindows";

import {

  involvesTeam,

  unplayedOnDate,

} from "@/lib/matchEngine";

import {

  opponentLabel,

  scheduleFixturesByDate,

  userFixtures,

} from "@/lib/leagueSchedule";

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

      const cupStructure = (save.cupFixtures as any)[`${cupKey}_structure`] || getCupStructureForCountry(userCountry || "");

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

      const relevantSchedule = cupSchedule.filter(step => {

        if (step.round === "Preliminar") return isInPreliminary;

        return true; // All other rounds are relevant

      });

      

      const firstScheduleRound = cupSchedule[0]; // Use full schedule to check for prelim

      const firstRelevantRound = relevantSchedule[0]; // Use filtered schedule for draw logic

      

      // Convert drawMatchdays to actual dates (cup starts July 7, 2025)

      // drawMatchday = days offset from July 7th (0=Jul7, 1=Jul8, etc.)

      const cupStart = new Date("2025-07-07T00:00:00Z");

      const today = currentDateIso; // already an ISO string like "2025-07-07"

      

      // Check if today is a cup draw day

      const isDrawDay = relevantSchedule.some(s => {

        const drawDate = new Date(cupStart.getTime() + s.drawMatchday * 86400000);

        const drawDateOnly = toDateOnly(drawDate);

        return drawDateOnly === today;

      });

      

      const cupFixtures = save.cupFixtures[cupKey] || [];

      // Check if any cup fixture exists at all (preliminary or main bracket)

      const hasCupFixtures = cupFixtures.length > 0;

      // For draw day check: only block if the CURRENT draw day's round already has fixtures

      const currentDrawRound = relevantSchedule.find(s => {

        const drawDate = new Date(new Date("2025-07-07T00:00:00Z").getTime() + s.drawMatchday * 86400000);

        return toDateOnly(drawDate) === today;

      });

      const hasCurrentRoundFixtures = currentDrawRound

        ? cupFixtures.some(f => f.round === currentDrawRound.round)

        : false;

      

      // Check if we are 2 days before the first draw day (for auto-simulating preliminary)

      // Use the full schedule to get the preliminary round draw day

      const prelimRound = cupSchedule.find(s => s.round === "Preliminar");

      const prelimDrawDay = prelimRound?.drawMatchday;

      const todayOffset = Math.floor((new Date(today).getTime() - new Date("2025-07-07T00:00:00Z").getTime()) / 86400000);

      const isTwoDaysBeforePrelimDraw = prelimDrawDay !== undefined && todayOffset === prelimDrawDay - 2;

      

      console.log(`[Calendar cup check] userCountry: ${userCountry}, myTeamId: ${myTeamId}, isInPreliminary: ${isInPreliminary}`);

      console.log(`[Calendar cup check] today: ${today}, isDrawDay: ${isDrawDay}, hasCurrentRoundFixtures: ${hasCurrentRoundFixtures}, cupDrawPending: ${!!save.cupDrawPending}`);

      console.log(`[Calendar cup check] isTwoDaysBeforePrelimDraw: ${isTwoDaysBeforePrelimDraw}, prelimDrawDay: ${prelimDrawDay}, todayOffset: ${todayOffset}`);

      

      // Check if user is eliminated from cup (team not in any unplayed cup fixture)

      const userInCup = cupFixtures.some(f => 

        (f.homeId === myTeamId || f.awayId === myTeamId) && !f.result

      );

      

      // Check if today is a cup match day

      const isCupMatchDay = cupSchedule.some(s => {

        const matchDate = new Date(cupStart.getTime() + s.matchday * 86400000);

        return toDateOnly(matchDate) === today;

      });

      

      // Get the matchday for today if it's a cup match day

      const currentCupMatchday = cupSchedule.find(s => {

        const matchDate = new Date(cupStart.getTime() + s.matchday * 86400000);

        return toDateOnly(matchDate) === today;

      })?.matchday;

      

      console.log(`[Calendar cup check] userInCup: ${userInCup}, isCupMatchDay: ${isCupMatchDay}, currentCupMatchday: ${currentCupMatchday}`);

      

      // Auto-simulate cup matches on match days if user is eliminated

      if (isCupMatchDay && !userInCup && currentCupMatchday !== undefined) {

        const fixturesForMatchday = cupFixtures.filter(f => f.matchday === currentCupMatchday && !f.result);

        console.log(`[Calendar] Auto-simulating cup matches for matchday ${currentCupMatchday}: ${fixturesForMatchday.length} fixtures`);

        if (fixturesForMatchday.length > 0) {

          const updated = loadSave();

          if (!updated) return;

          

          const simmed = simulateCupMatchday(updated, cupKey, currentCupMatchday);

          saveSave(simmed);

          setSave(simmed);

          console.log(`[Calendar] Auto-simulated ${fixturesForMatchday.length} cup fixtures for matchday ${currentCupMatchday}`);

        }

      }

      

      // Auto-simulate preliminary round 2 days before prelim draw if user not in prelim

      console.log(`[Calendar] Prelim auto-sim check: isTwoDaysBeforePrelimDraw=${isTwoDaysBeforePrelimDraw}, !isInPreliminary=${!isInPreliminary}, prelimRound?.round=${prelimRound?.round}`);

      if (isTwoDaysBeforePrelimDraw && !isInPreliminary && prelimRound?.round === "Preliminar") {

        const prelimFixturesExist = cupFixtures.some(f => f.round === "Preliminar");

        console.log(`[Calendar] Prelim fixtures exist: ${prelimFixturesExist}, preliminaryTeams.length: ${preliminaryTeams.length}`);

        if (!prelimFixturesExist) {

          console.log(`[Calendar] Auto-simulating preliminary round 2 days before first draw`);

          const updated = loadSave();

          if (!updated) return;

          

          const prelimFixtures: any[] = [];

          for (let i = 0; i + 1 < preliminaryTeams.length; i += 2) {

            prelimFixtures.push({

              id: `cup-${cupKey}-prelim-${i}`,

              competition: "cup",

              league: cupKey,

              matchday: firstScheduleRound.matchday,

              round: "Preliminar",

              homeId: preliminaryTeams[i],

              awayId: preliminaryTeams[i + 1],

            });

          }

          // Add preliminary fixtures to save

          if (!updated.cupFixtures[cupKey]) updated.cupFixtures[cupKey] = [];

          for (const f of prelimFixtures) {

            // Simple simulation: random winner

            const homeGoals = Math.floor(Math.random() * 4);

            const awayGoals = Math.floor(Math.random() * 4);

            updated.cupFixtures[cupKey].push({

              ...f,

              result: { homeGoals, awayGoals, events: [], injuries: [], xgHome: homeGoals, xgAway: awayGoals }

            });

          }

          saveSave(updated);

          setSave(updated);

        }

      }

      

      // Show notification if it's a draw day and this round hasn't been drawn yet

      if (isDrawDay && !hasCurrentRoundFixtures && !save.cupDrawPending) {

        const cupData = initCup(userCountry || "");

        const preliminaryTeams = cupData.preliminaryParticipants || [];

        const userIsInPreliminary = preliminaryTeams.includes(myTeamId);

        

        // Get the round for this specific draw day

        const currentRound = relevantSchedule.find(s => {

          const drawDate = new Date(new Date("2025-07-07T00:00:00Z").getTime() + s.drawMatchday * 86400000);

          return toDateOnly(drawDate) === today;

        });

        

        if (currentRound) {

          const updated = loadSave();

          if (!updated) return;

          

          // Use surviving teams if available, otherwise use initial participants

          console.log(`[Calendar] About to call getSurvivingCupTeams for round: ${currentRound.round}`);

          const survivingTeams = getSurvivingCupTeams(updated, cupKey);

          console.log(`[Calendar] getSurvivingCupTeams returned ${survivingTeams.length} teams`);

          

          // The first non-preliminary round in the schedule (R32, R16, Octavos, etc.)

          const firstMainRound = relevantSchedule.find(s => s.round !== "Preliminar");



          let drawTeams: string[];

          if (currentRound.round === "Preliminar") {

            drawTeams = preliminaryTeams;

          } else if (firstScheduleRound?.round === "Preliminar" && currentRound.round === firstMainRound?.round) {

            // First main round after prelim: combine prelim winners with bye teams

            const prelimWinners = getSurvivingCupTeams(updated, cupKey);

            const mainBracketTeams = cupData.participants.filter(id => !preliminaryTeams.includes(id));

            drawTeams = [...prelimWinners, ...mainBracketTeams];

            console.log(`[Calendar] ${currentRound.round} after prelim: combining ${prelimWinners.length} prelim winners with ${mainBracketTeams.length} main bracket teams`);

          } else {

            // For all subsequent rounds (QF, SF, Final), use surviving teams from previous round

            drawTeams = survivingTeams.length > 0 ? survivingTeams : cupData.participants;

          }

          console.log(`[Calendar] Using ${drawTeams.length} teams for draw of round ${currentRound.round}`);

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

      return save.cupFixtures[cupKey]?.filter(

        f => f.homeId === myTeamId || f.awayId === myTeamId

      ) || [];

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

    const combined = new Map<string, Array<{ competition: "Liga" | "cup" | "league"; matchday: number; homeTeam?: string; awayTeam?: string; homeId?: string; awayId?: string; id: string }>>();

    

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

      const cupStructure = (save.cupFixtures as any)[`${cupKey}_structure`] || getCupStructureForCountry(userCountry);

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

      f => f.homeId === save!.myTeamId || f.awayId === save!.myTeamId

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

    if (!save) return;



    setIsAdvancing(true);



    // Always process foreign cup draws/results first, before any early returns

    let currentSave = save;

    try {

      currentSave = autoDrawForeignCups(save, currentDateIso);

      saveSave(currentSave);

      setSave(currentSave);

    } catch (err) {

      console.error("Error auto-processing foreign cups:", err);

    }



    // Programar ligas background alrededor del próximo partido del usuario

    try {

      const nextScheduledMatch = fixtures.find(f => !f.isPlayed);

      const nextMatchDate = nextScheduledMatch?.date;

      currentSave = await simulateBackgroundLeaguesOnly(currentSave, currentDateIso, nextMatchDate);

      saveSave(currentSave);

      setSave(currentSave);

    } catch (err) {

      console.error("Error scheduling background leagues:", err);

    }



    // Programar copas background también

    try {

      currentSave = await scheduleBackgroundCupsOnly(currentSave, currentSave.currentMatchday[currentSave.myLeague], currentDateIso);

      saveSave(currentSave);

      setSave(currentSave);

    } catch (err) {

      console.error("Error scheduling background cups:", err);

    }



    // Procesar simulaciones programadas para hoy

    try {

      currentSave = processScheduledBackgroundSims(currentSave, currentDateIso);

      saveSave(currentSave);

      setSave(currentSave);

    } catch (err) {

      console.error("Error processing scheduled background sims:", err);

    }

    

    try {

      // Get the primary league for the user's country (the league that holds the cup)

      const userCountry = LEAGUES[currentSave.myLeague]?.country;

      const primaryLeague = userCountry ? getPrimaryLeagueForCountry(userCountry) : currentSave.myLeague;

      const cupKey = (primaryLeague || currentSave.myLeague) as LeagueId;

      

      // Check if today is a cup match day and user has a cup fixture

      const cupStart = new Date("2025-07-07T00:00:00Z");

      const todayCupFixtures = myCupFixtures.filter(f => {

        const matchDate = new Date(cupStart.getTime() + f.matchday * 86400000);

        return toDateOnly(matchDate) === currentDateIso;

      });

      

      if (todayCupFixtures.length > 0) {

        // User has a cup fixture today - let advanceTime handle it (will navigate to match)

        setIsAdvancing(false);

        advanceTime(1);

        return;

      }

      

      // Check if user is eliminated from cup and today is a cup match day for the league

      const userCupFixtures = currentSave.cupFixtures[cupKey]?.filter(f => !f.result) || [];

      const userHasCupFixture = userCupFixtures.some(f => f.homeId === currentSave.myTeamId || f.awayId === currentSave.myTeamId);

      

      if (!userHasCupFixture && todayCupFixtures.length === 0) {

        // User is eliminated from cup - auto-simulate the cup matchday

        // Get the matchday for today from the cup schedule

        const cupStart = new Date("2025-07-07T00:00:00Z");

        const todayOffset = Math.floor((new Date(currentDateIso).getTime() - cupStart.getTime()) / 86400000);

        

        // Find which matchday corresponds to today

        const cupStructure = (currentSave.cupFixtures as any)[`${cupKey}_structure`] || getCupStructureForCountry(userCountry || "");

        const cupSchedule = cupStructure.schedule;

        const todayMatchday = cupSchedule.find(s => s.matchday === todayOffset)?.matchday;

        

        if (todayMatchday !== undefined) {

          console.log(`[Calendar] Auto-simulating cup matchday ${todayMatchday} for eliminated user (using layered simulation)`);

          const simulated = await simulateCupMatchdayLayered(currentSave, todayMatchday, (done, total) => {

            console.log(`Cup matches: ${done}/${total}`);

          });

          saveSave(simulated);

          setSave(simulated);

          // Now advance the day (this is the last step, like "back to season" but advancing day instead of navigating)

          advanceTime(1);

          setIsAdvancing(false);

          return;

        }

      }

      

      // Advance time

      advanceTime(1);

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

    

    console.log(`handleCupDrawComplete called with ${matchups.length} matchups for league ${cupKey}`);

    

    const next = applyCupDraw(save, cupKey, save.cupDrawPending.round, matchups);

    console.log(`After applyCupDraw, cupFixtures[${cupKey}] has ${next.cupFixtures[cupKey]?.length || 0} fixtures`);

    

    saveSave(next);

    

    // Reload the save to ensure UI updates

    const reloaded = loadSave();

    if (reloaded) {

      setSave(reloaded);

    }

    

    setShowCupDrawModal(false);

    clearPendingCupDraw();

    

    // Clear the notification flag so it can show again for future rounds

    sessionStorage.removeItem('cupDrawNotified');

  };



  const viewDate = new Date(viewYear, viewMonth, 1);

  const onCurrentMonth =

    viewYear === gameDate.getFullYear() && viewMonth === gameDate.getMonth();



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

            const isWindow =

              isSummerTransferWindow(day) || isWinterTransferWindow(day);

            const windowHighlight =

              isMarketOpen && isTransferWindowDay(day, gameDate);

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

                    allFixturesByDate.get(iso)?.map((f) => {

                      const isHome = f.homeTeam === myTeamId || f.homeId === myTeamId;

                      const opponentId = isHome ? (f.awayTeam || f.awayId) : (f.homeTeam || f.homeId);

                      if (!opponentId) return null;

                      const opponent = teamById(opponentId);

                      const myTeam = teamById(myTeamId);

                      const isCup = f.competition === "cup";

                      const bgColor = isCup ? "bg-purple-600/90" : "bg-red-600/90";

                      const label = isCup ? "🛡" : `J${f.matchday}`;

                      return (

                        <div

                          key={f.id}

                          className={`flex items-center justify-center gap-1 w-full text-[0.5rem] leading-tight font-bold px-0.5 py-0.5 rounded ${bgColor} text-white`}

                          title={`${isCup ? "Copa" : "Liga"} - ${isHome ? "Local" : "Visitante"}`}

                        >

                          {isHome && <TeamLogo teamName={myTeam.name} leagueName={getLeagueName(myTeam.league)} size={12} />}

                          {!isHome && <TeamLogo teamName={opponent.name} leagueName={getLeagueName(opponent.league)} size={12} />}

                          <span>{label}</span>

                          {isHome && <TeamLogo teamName={opponent.name} leagueName={getLeagueName(opponent.league)} size={14} />}

                          {!isHome && <TeamLogo teamName={myTeam.name} leagueName={getLeagueName(myTeam.league)} size={14} />}

                        </div>

                      );

                    }).filter(Boolean)}

                  {windowHighlight && inMonth && !isToday && dayFixtures.length === 0 && (

                    <span

                      className="mx-auto w-1.5 h-1.5 rounded-full bg-emerald-400/80"

                      title="Ventana de mercado"

                    />

                  )}

                  {isDrawDay && inMonth && !isToday && (

                    <div className="mx-auto flex items-center gap-1 px-2 py-1 bg-purple-500/20 border border-purple-500/40 rounded-full">

                      <span className="text-[0.4rem] font-bold text-purple-400">🎱</span>

                      <span className="text-[0.35rem] font-bold text-purple-300 uppercase">Sorteo</span>

                    </div>

                  )}

                  {uclDrawDays.has(iso) && inMonth && (

                    <div className="mx-auto flex items-center gap-1 px-2 py-1 bg-blue-500/20 border border-blue-500/40 rounded-full">

                      <span className="text-[0.4rem] font-bold text-blue-400">🏆</span>

                      <span className="text-[0.35rem] font-bold text-blue-300 uppercase">UCL Draw</span>

                    </div>

                  )}

                  {inMonth && uclMatchDays.has(iso) && uclMatchDays.get(iso)!.map((f) => {

                    const isHome = f.homeId === myTeamId;

                    const opponentId = isHome ? f.awayId : f.homeId;

                    try {

                      const opponent = teamById(opponentId);

                      const myTeam = teamById(myTeamId!);

                      return (

                        <div

                          key={f.id}

                          className="flex items-center justify-center gap-1 w-full text-[0.5rem] leading-tight font-bold px-0.5 py-0.5 rounded bg-blue-700/90 text-white"

                          title={`UCL - ${isHome ? 'Local' : 'Visitante'}`}

                        >

                          {isHome && <TeamLogo teamName={myTeam.name} leagueName={getLeagueName(myTeam.league)} size={12} />}

                          {!isHome && <TeamLogo teamName={opponent.name} leagueName={getLeagueName(opponent.league)} size={12} />}

                          <span>🏆</span>

                          {isHome && <TeamLogo teamName={opponent.name} leagueName={getLeagueName(opponent.league)} size={14} />}

                          {!isHome && <TeamLogo teamName={myTeam.name} leagueName={getLeagueName(myTeam.league)} size={14} />}

                        </div>

                      );

                    } catch { return null; }

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

        </div>

      </div>

      

      {showUclDrawModal && pendingUclDraw && (

        <UCLDrawModal

          type={pendingUclDraw}

          save={save!}

          onClose={() => {

            setShowUclDrawModal(false);

            clearPendingUclDraw();

            setSave(loadSave());

          }}

          onComplete={(updated) => {

            saveSave(updated);

            setSave(loadSave());

            setShowUclDrawModal(false);

            clearPendingUclDraw();

          }}

        />

      )}



      {save.cupDrawPending && (

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

              const withDraw = applyCupDraw(updated, save.cupDrawPending.league, save.cupDrawPending.round, matchups);

              saveSave(withDraw);

              setSave(withDraw);

            }

          }}

        />

      )}

    </div>

  );

}


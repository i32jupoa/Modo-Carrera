import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { loadSave, saveSave, applyCupDraw, autoDrawForeignCups, simulateRemainingCupMatches, getCurrentCupRound } from "@/lib/store";
import { monthDays, fmtMonth, COMP_COLORS } from "@/lib/calendar";
import { usePlayersStore } from "@/store/playersStore";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";
import { TeamLogo } from "@/components/TeamLogo";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}
import {
  isSummerTransferWindow,
  isWinterTransferWindow,
  isTransferWindowDay,
  parseDateOnly,
  toDateOnly,
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

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function CalendarPage() {
  const navigate = useNavigate();
  const currentDateIso = usePlayersStore((s) => s.currentDate);
  const advanceTime = usePlayersStore((s) => s.advanceTime);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const fixtures = usePlayersStore((s) => s.fixtures);
  const ensureLeagueSchedule = usePlayersStore((s) => s.ensureLeagueSchedule);
  const pendingMatch = usePlayersStore((s) => s.pendingUserMatch);
  const { isMarketOpen } = useTransferMarket();

  const [save, setSave] = useState(loadSave());
  const [showCupDrawModal, setShowCupDrawModal] = useState(false);

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
    setSave(s);
  }, [navigate, ensureLeagueSchedule]);

  // Check for cup draw pending after save changes
  useEffect(() => {
    if (!save) return;
    
    const userCountry = LEAGUES[save.myLeague]?.country;
    const primaryLeague = userCountry ? Object.keys(LEAGUES).find(lg => LEAGUES[lg]?.country === userCountry) : save.myLeague;
    const cupKey = (primaryLeague || save.myLeague) as LeagueId;
    const leagueMd = save.currentMatchday[save.myLeague];
    
    // Define cup schedule with draw matchdays
    const cupSchedule = [
      { round: "R32", drawMatchday: 1 },
      { round: "R16", drawMatchday: 5 },
      { round: "QF", drawMatchday: 9 },
      { round: "SF", drawMatchday: 14 },
      { round: "Final", drawMatchday: 19 },
    ];
    
    // Check if today is a cup draw day for the user's country
    const isDrawDay = cupSchedule.some(s => s.drawMatchday === leagueMd);
    const cupFixtures = save.cupFixtures[cupKey] || [];
    const hasFirstRoundFixtures = cupFixtures.some(f => f.round === "R32");
    
    // Show notification if it's a draw day and no fixtures exist yet (or cupDrawPending is set)
    if ((isDrawDay && !hasFirstRoundFixtures) || save.cupDrawPending) {
      // Auto-draw foreign cups BEFORE opening the user's cup draw modal
      try {
        const withForeignDraws = autoDrawForeignCups(save);
        saveSave(withForeignDraws);
        
        // Show the modal for the user's draw
        setShowCupDrawModal(true);
      } catch (err) {
        console.error("Error en auto-draw de copas:", err);
        // If auto-draw fails, still show the modal for the user
        setShowCupDrawModal(true);
      }
    }
  }, [save?.cupDrawPending, save?.currentMatchday]); // Only re-run when cupDrawPending or matchday changes

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
      const primaryLeague = userCountry ? Object.keys(LEAGUES).find(lg => LEAGUES[lg]?.country === userCountry) : save.myLeague;
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
    // Calculate dates for cup fixtures based on matchday
    // Season starts Aug 16, 2025 (Saturday), each league matchday is 1 week later
    // Cup matches are played 3 days after the league matchday (Wednesday)
    const seasonStart = new Date("2025-08-16T12:00:00Z");
    
    for (const f of myCupFixtures) {
      // Cup match is 3 days after the league matchday
      const leagueMatchdayDate = new Date(seasonStart.getTime() + (f.matchday - 1) * 7 * 86400000);
      const cupMatchDate = new Date(leagueMatchdayDate.getTime() + 3 * 86400000);
      const dateIso = cupMatchDate.toISOString().split('T')[0];
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

  // Calculate cup draw days based on current matchday
  const cupDrawDays = useMemo(() => {
    if (!save) return new Set<string>();
    const drawDays = new Set<string>();
    
    // CUP_SCHEDULE draw matchdays: 1, 5, 9, 14, 19
    // Calculate the actual dates for these draw days
    // Season starts Aug 16, 2025 (Saturday), each league matchday is 1 week later
    // Draw days are 2 days after the league matchday (Monday instead of Saturday)
    const seasonStart = new Date("2025-08-16T12:00:00Z");
    const drawMatchdays = [1, 5, 9, 14, 19];
    
    for (const drawMd of drawMatchdays) {
      // League matchday is on Saturday
      const leagueMatchdayDate = new Date(seasonStart.getTime() + (drawMd - 1) * 7 * 86400000);
      // Draw is 2 days after the league matchday (Monday)
      const drawDate = new Date(leagueMatchdayDate.getTime() + 2 * 86400000);
      const drawDateIso = drawDate.toISOString().split('T')[0];
      drawDays.add(drawDateIso);
    }
    
    return drawDays;
  }, [save]);

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
    
    // Get the primary league for the user's country (the league that holds the cup)
    const userCountry = LEAGUES[save.myLeague]?.country;
    const primaryLeague = userCountry ? Object.keys(LEAGUES).find(lg => LEAGUES[lg]?.country === userCountry) : save.myLeague;
    const cupKey = (primaryLeague || save.myLeague) as LeagueId;
    
    // Check if today is a cup match day and user has a cup fixture
    const todayCupFixtures = myCupFixtures.filter(f => {
      const seasonStart = new Date("2025-08-16T12:00:00Z");
      const leagueMatchdayDate = new Date(seasonStart.getTime() + (f.matchday - 1) * 7 * 86400000);
      const cupMatchDate = new Date(leagueMatchdayDate.getTime() + 3 * 86400000);
      const dateIso = cupMatchDate.toISOString().split('T')[0];
      return dateIso === currentDateIso;
    });
    
    if (todayCupFixtures.length > 0) {
      // User has a cup fixture today - let advanceTime handle it (will navigate to match)
      advanceTime(1);
      return;
    }
    
    // Check if user is eliminated from cup and today is a cup match day for the league
    const userCupFixtures = save.cupFixtures[cupKey]?.filter(f => !f.result) || [];
    const userHasCupFixture = userCupFixtures.some(f => f.homeId === save.myTeamId || f.awayId === save.myTeamId);
    
    if (!userHasCupFixture && todayCupFixtures.length === 0) {
      // User is eliminated from cup - auto-simulate the cup round
      const currentRound = getCurrentCupRound(save, cupKey);
      if (currentRound) {
        const simulated = await simulateRemainingCupMatches(save, currentRound);
        saveSave(simulated);
        setSave(simulated);
      }
    }
    
    // Advance time
    advanceTime(1);
  };

  const handleCupDrawComplete = (matchups: [string, string][]) => {
    if (!save?.cupDrawPending) return;
    
    // Get the primary league for the user's country (the league that holds the cup)
    const userCountry = LEAGUES[save.myLeague]?.country;
    const primaryLeague = userCountry ? Object.keys(LEAGUES).find(lg => LEAGUES[lg]?.country === userCountry) : save.myLeague;
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
            disabled={!!pendingMatch}
            onClick={handleAdvanceDay}
            className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition shadow-[0_0_12px_hsl(var(--primary)/0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Avanzar día
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
        </div>
      </div>
    </div>
  );
}

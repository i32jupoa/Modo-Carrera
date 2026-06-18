import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";

import { useState, useEffect } from "react";

import { ALL_LEAGUES, loadSave, SaveGame, advanceMatchdayLayered, getSortedStandings, getMatchdayFixtures, getMyNextFixtureAny, getMyRecentResults, getTeamRecentResults, simulateCupMatchday, simulateUCLMatchday, saveSave } from "@/lib/store";

import { LEAGUES, teamById, teamsByLeague, type LeagueId, type Team, LEAGUES_BY_COUNTRY } from "@/data/teams";
import { UCL_START } from "@/data/ucl";

import { type Fixture } from "@/lib/season";

import { usePlayersStore, ensureStatsForLeague, useCurrentDate } from "@/store/playersStore";

import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { CountryFlag } from "@/components/CountryFlag";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ArrowUp, ArrowDown, AlertTriangle, Bell, Newspaper, Briefcase, Building2, Cloud, Flag } from "lucide-react";
import {
  themeForFixture,
  refereeFor,
  weatherFor,
  trackPosition,
  getPositionHistory,
  getTrend,
  buildNews,
  type CentralTheme,
} from "@/lib/seasonExtras";



// Helper to get league name from league ID

function getLeagueName(leagueId: string): string {

  return LEAGUES[leagueId as LeagueId]?.name || leagueId;

}



export const Route = createFileRoute("/season")({ component: SeasonPage });



function SeasonPage() {

  const navigate = useNavigate();

  const [save, setSave] = useState<SaveGame | null>(null);

  const [viewLeague, setViewLeague] = useState<LeagueId>("laliga");

  const [isSimulating, setIsSimulating] = useState(false);

  const [simProgress, setSimProgress] = useState({ done: 0, total: 0 });



  useEffect(() => {

    const s = loadSave();

    if (!s) { navigate({ to: "/" }); return; }

    setSave(s);

    setViewLeague(s.myLeague);

  }, [navigate]);

  

  // Generate stats on-demand when league changes

  useEffect(() => {

    if (viewLeague) {

      ensureStatsForLeague(viewLeague);

    }

  }, [viewLeague]);



  const currentDate = useCurrentDate();

  const fixtures = usePlayersStore((s) => s.fixtures);

  if (!save) return null;

  const myTeam = teamById(save.myTeamId);

  const nextFixture = getMyNextFixtureAny(save);

  const recent = getMyRecentResults(save, 5);

  const standings = getSortedStandings(save, viewLeague);

  const myLeagueTotalMatchdays = (teamsByLeague(save.myLeague).length - 1) * 2;

  const seasonComplete = save.currentMatchday[save.myLeague] > myLeagueTotalMatchdays;

  const myPos = standings.findIndex((s) => s.teamId === save.myTeamId) + 1;

  const myLineup = save?.lineups[save.myTeamId] || [];
  const activeStartersCount = myLineup.filter((id: string) => id && id.trim() !== "").length;
  const isLineupComplete = activeStartersCount === 11;

  // Theme (changes UI based on the next match: liga / champions / copa)
  const theme: CentralTheme = themeForFixture(nextFixture);

  // Trend: track current position in history and compare to previous matchday
  const currentMd = save.currentMatchday[save.myLeague];
  const posHistory = myPos > 0
    ? trackPosition(save.myLeague, save.myTeamId, currentMd, myPos)
    : getPositionHistory(save.myLeague, save.myTeamId);
  const trend = getTrend(posHistory);

  // Injured count for notifications
  let injuredCount = 0;
  try {
    const ps = usePlayersStore.getState();
    const md = save.currentMatchday[save.myLeague];
    for (const id of myLineup) {
      if (!id) continue;
      const st = (ps as any).stats?.[id];
      if (st && st.injuredUntil && st.injuredUntil > md) injuredCount++;
    }
  } catch {}

  // News (deterministic per matchday)
  const news = buildNews(myTeam.name, `${save.myTeamId}:${currentMd}`);

  // UCL phase table (only used when ucl theme)
  const uclTable = save.ucl?.leaguePhaseTable ?? save.ucl?.table ?? [];

  function handlePlayMatch(fixture: Fixture) {
    if (!save || !isLineupComplete) {
      alert("La alineación no está completa. Debes tener 11 jugadores titulares para jugar el partido.");
      return;
    }
    if (!save.myTeamId) return;

    // Determine match type from the fixture
    const matchType = fixture.competition === "league" ? "LEAGUE" : 
                     fixture.competition === "cup" ? "CUP" : "UCL";
    const cupRound = fixture.competition === "cup" ? fixture.round : undefined;

    // Navigate directly to match with matchType in state
    navigate({ to: "/match", state: { matchType, cupRound, fixtureId: fixture.id } as any });
  }



  async function simulateRest() {
    if (!save || isSimulating) return;

    setIsSimulating(true);

    setSimProgress({ done: 0, total: 0 });

    

    try {

      console.time('simulateRest');

      let next: SaveGame;

      // Find the last played match to determine competition type
      let lastPlayedFixture: Fixture | null = null;
      let competitionType: "league" | "cup" | "ucl" | null = null;

      // Check league fixtures
      const leagueFixtures = save.fixtures[save.myLeague].filter(f => f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId));
      if (leagueFixtures.length > 0) {
        lastPlayedFixture = leagueFixtures[leagueFixtures.length - 1];
        competitionType = "league";
      }

      // Check cup fixtures
      for (const lg of Object.keys(save.cupFixtures)) {
        const cupFixtures = save.cupFixtures[lg as LeagueId].filter(f => f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId));
        if (cupFixtures.length > 0) {
          const lastCupFixture = cupFixtures[cupFixtures.length - 1];
          if (!lastPlayedFixture || lastCupFixture.matchday > lastPlayedFixture.matchday) {
            lastPlayedFixture = lastCupFixture;
            competitionType = "cup";
          }
        }
      }

      // Check UCL fixtures
      if (save.uclFixtures) {
        const uclFixtures = save.uclFixtures.filter(f => f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId));
        if (uclFixtures.length > 0) {
          const lastUCLFixture = uclFixtures[uclFixtures.length - 1];
          if (!lastPlayedFixture || lastUCLFixture.matchday > lastPlayedFixture.matchday) {
            lastPlayedFixture = lastUCLFixture;
            competitionType = "ucl";
          }
        }
      }

      if (!competitionType) {
        competitionType = "league"; // Default to league
      }

      // Simulate based on competition type
      if (competitionType === "cup") {
        // Simulate cup fixtures for the matchday ONLY
        next = simulateCupMatchday(save, save.myLeague, lastPlayedFixture?.matchday || save.currentMatchday[save.myLeague]);
      } else if (competitionType === "ucl") {
        // Simulate UCL fixtures for the matchday ONLY
        next = simulateUCLMatchday(save, lastPlayedFixture?.matchday || save.currentMatchday[save.myLeague]);
      } else {
        // Simulate league fixtures
        next = await advanceMatchdayLayered(save, (done, total) => {
          setSimProgress({ done, total });
          console.log(`Matches: ${done}/${total}`);
        });
      }

      

      console.timeEnd('simulateRest');

      saveSave(next);

      setSave(next);

    } catch (err) {

      console.error("Error al simular jornada:", err);

      alert("Error al simular: " + (err instanceof Error ? err.message : String(err)));

    } finally {

      setIsSimulating(false);

      setSimProgress({ done: 0, total: 0 });

    }

  }


  async function simulateUntilEnd() {

    if (!save || isSimulating) return;

    setIsSimulating(true);

    

    try {

      console.time('simulateUntilEnd');

      let cur = save; 

      let safety = 0;

      

      while (cur.currentMatchday[cur.myLeague] <= myLeagueTotalMatchdays && safety < 100) {

        cur = await advanceMatchdayLayered(cur);

        safety++;

        // Yield control every 5 matchdays

        if (safety % 5 === 0) {

          await new Promise(r => setTimeout(r, 0));

        }

      }

      

      saveSave(cur);

      setSave(cur);

      console.timeEnd('simulateUntilEnd');

    } catch (err) {

      console.error("Error al simular temporada:", err);

      alert("Error al simular: " + (err instanceof Error ? err.message : String(err)));

    } finally {

      setIsSimulating(false);

    }

  }



  return (

    <div className={`p-4 md:p-6 max-w-6xl mx-auto relative ${theme.bgOverlay}`}>

      {/* Theme banner */}
      {theme.id !== "default" && (
        <div className={`mb-4 flex items-center justify-between gap-3 px-4 py-2 rounded-lg border ${theme.cardBorder} ${theme.badge}`}>
          <div className="flex items-center gap-2 text-sm font-bold tracking-wide">
            {theme.id === "ucl" ? "⭐" : "🏆"} Modo {theme.label} activo
          </div>
          <span className="text-[0.65rem] uppercase tracking-widest opacity-80">Próximo partido</span>
        </div>
      )}

      {/* Header strip — club summary */}
      <div className={`mb-6 panel p-4 rounded-xl border ${theme.cardBorder} flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex items-center gap-4">
          <div
            className="relative rounded-xl p-2 bg-gradient-to-br from-background to-secondary"
            style={{
              transform: "perspective(400px) rotateX(6deg) rotateY(-6deg)",
              boxShadow: "0 10px 24px -10px rgba(0,0,0,0.5), 0 2px 6px rgba(255,255,255,0.06) inset",
            }}
          >
            <TeamLogo teamName={myTeam.name} leagueName={getLeagueName(myTeam.league)} size={56} />
          </div>
          <div>
            <h1 className="text-2xl font-black leading-tight">{myTeam.name}</h1>
            <p className="text-xs text-muted-foreground">
              Jornada {currentMd} de {myLeagueTotalMatchdays} · {LEAGUES[save.myLeague].name}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="chip text-[0.65rem]">PJ {standings.find(s=>s.teamId===save.myTeamId)?.played ?? 0}</span>
              <span className="chip text-[0.65rem]">V {standings.find(s=>s.teamId===save.myTeamId)?.won ?? 0}</span>
              <span className="chip text-[0.65rem]">E {standings.find(s=>s.teamId===save.myTeamId)?.drawn ?? 0}</span>
              <span className="chip text-[0.65rem]">D {standings.find(s=>s.teamId===save.myTeamId)?.lost ?? 0}</span>
              <span className="chip text-[0.65rem]">DG {(standings.find(s=>s.teamId===save.myTeamId)?.gd ?? 0) > 0 ? "+" : ""}{standings.find(s=>s.teamId===save.myTeamId)?.gd ?? 0}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <MiniTrendChart history={posHistory} />
          <div className="text-right">
            <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Posición</div>
            <div className={`text-3xl font-black scoreline ${theme.accent}`}>{myPos || "-"}º</div>
            {trend.delta !== 0 && (
              <div className={`flex items-center justify-end gap-1 text-xs font-bold ${trend.delta > 0 ? "text-emerald-400" : "text-destructive"}`}>
                {trend.delta > 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                {Math.abs(trend.delta)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notificaciones */}
      <NotificationsBar
        isLineupComplete={isLineupComplete}
        injuredCount={injuredCount}
        nextFixture={nextFixture}
        theme={theme}
      />



      <div className="grid lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 space-y-6">

          {seasonComplete ? (

            <div className="panel-glow p-8 text-center">

              <span className="chip mb-3">Temporada finalizada</span>

              <h2 className="text-3xl font-black mb-2">¡Liga completada!</h2>

              <p className="text-muted-foreground">

                Posición final: <span className="text-primary font-bold">{myPos}º</span>

              </p>

            </div>

          ) : nextFixture ? (

            <NextMatchCard fixture={nextFixture} myId={save.myTeamId} onPlayMatch={handlePlayMatch} theme={theme} />

          ) : null}


          {!seasonComplete && null}



          <div className="panel p-5">

            <div className="flex items-center justify-between mb-4">

              <h3 className="font-bold">Últimos resultados</h3>
            </div>

            {recent.length === 0 ? (

              <p className="text-sm text-muted-foreground">Aún no has jugado ningún partido.</p>

            ) : (

              <div className="space-y-2">

                {recent.map((f) => <ResultRow key={f.id} fixture={f} myId={save.myTeamId} />)}

              </div>

            )}

          </div>



          <NewsPanel news={news} theme={theme} />

          <OtherLeaguesPanel save={save} />

        </div>



        <div className="space-y-6">

          <div className={`panel p-5 border ${theme.cardBorder}`}>

            <div className="flex items-center justify-between mb-3">

              <h3 className="font-bold">
                {theme.id === "ucl" ? "Champions · Fase de Liga" : "Clasificación"}
              </h3>

              {theme.id !== "ucl" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="bg-secondary border border-border rounded px-2 py-1 text-xs flex items-center gap-2 hover:border-primary/60 transition">
                    <LeagueLogo league={LEAGUES[viewLeague].name} size="sm" fallback={<span className="text-xs">{LEAGUES[viewLeague].flag}</span>} />
                    {LEAGUES[viewLeague].name}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {ALL_LEAGUES.map((lg) => (
                    <DropdownMenuItem
                      key={lg}
                      onClick={() => setViewLeague(lg)}
                      className="flex items-center gap-2"
                    >
                      <LeagueLogo league={LEAGUES[lg].name} size="sm" fallback={<span className="text-xs">{LEAGUES[lg].flag}</span>} />
                      {LEAGUES[lg].name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              )}

            </div>

            {theme.id === "ucl" && uclTable.length > 0
              ? <UCLMiniTable table={uclTable} myTeamId={save.myTeamId} />
              : <StandingsTable standings={standings} myTeamId={save.myTeamId} />}

          </div>

        </div>

      </div>

    </div>

  );

}



function NextMatchCard({ fixture, myId, onPlayMatch, theme }: { fixture: Fixture; myId: string; onPlayMatch: (fixture: Fixture) => void; theme: CentralTheme }) {

  const navigate = useNavigate();

  const home = teamById(fixture.homeId);

  const away = teamById(fixture.awayId);

  const isHome = fixture.homeId === myId;

  const fixtures = usePlayersStore((s) => s.fixtures);

  const myTeamId = usePlayersStore((s) => s.myTeamId);

  const dismissMatch = usePlayersStore((s) => s.dismissMatch);

  const save = loadSave();

  const currentDate = useCurrentDate();

  // Determine competition type and header text
  const roundNames: Record<string, string> = {
    "R32": "Treintaidosavos",
    "R16": "Dieciseisavos",
    "Octavos": "Octavos de Final",
    "QF": "Cuartos de Final",
    "SF": "Semifinales",
    "Final": "Final",
    "Preliminar": "Preliminar"
  };
  
  let headerText = "";
  if (fixture.competition === "cup") {
    headerText = `Copa Nacional · ${roundNames[fixture.round || ""] || fixture.round || ""}`;
  } else if (fixture.competition === "ucl") {
    headerText = `Champions League · ${fixture.round || 'Fase de Liga'}`;
  } else {
    headerText = `Liga · Jornada ${fixture.matchday}`;
  }



  // Check if user's lineup is complete (11 valid players)

  const myLineup = save?.lineups[myId] || [];

  const activeStartersCount = myLineup.filter((id: string) => id && id.trim() !== "").length;

  const isLineupComplete = activeStartersCount === 11;

  // Calculate match date based on competition type
  const seasonStart = new Date("2025-08-16T12:00:00Z");
  const cupStart = new Date("2025-07-07T00:00:00Z");
  
  let matchDateIso: string;
  let matchDate: Date;
  
  if (fixture.competition === "league") {
    // For league fixtures, use the actual fixture date from the calendar fixtures
    const scheduleFixture = fixtures.find(
      (f: any) => f.homeTeam === fixture.homeId && f.awayTeam === fixture.awayId && f.matchday === fixture.matchday
    );
    matchDateIso = scheduleFixture?.date || currentDate;
    matchDate = new Date(matchDateIso + "T12:00:00Z");
  } else if (fixture.competition === "cup") {
    // For cup: matchday = day offset from July 7th
    matchDate = new Date(cupStart.getTime() + fixture.matchday * 86400000);
    matchDateIso = matchDate.getFullYear() + '-' + 
      String(matchDate.getMonth() + 1).padStart(2, '0') + '-' + 
      String(matchDate.getDate()).padStart(2, '0');
  } else {
    // For UCL: matchday = absolute day offset from UCL_START
    const uclStart = new Date(UCL_START + "T00:00:00Z");
    matchDate = new Date(uclStart.getTime() + fixture.matchday * 86400000);
    matchDateIso = matchDate.getFullYear() + '-' + 
      String(matchDate.getMonth() + 1).padStart(2, '0') + '-' + 
      String(matchDate.getDate()).padStart(2, '0');
  }
  
  const isMatchDay = currentDate === matchDateIso;
  
  // Calculate days remaining
  const currentDateObj = new Date(currentDate + "T00:00:00Z");
  const matchDateObj = new Date(matchDateIso + "T00:00:00Z");
  const daysDiff = Math.ceil((matchDateObj.getTime() - currentDateObj.getTime()) / (1000 * 60 * 60 * 24));
  
  let daysRemainingText = "";
  if (daysDiff === 0) {
    daysRemainingText = "Hoy";
  } else if (daysDiff === 1) {
    daysRemainingText = "Mañana";
  } else if (daysDiff > 1) {
    daysRemainingText = `En ${daysDiff} días`;
  } else {
    daysRemainingText = `Hace ${Math.abs(daysDiff)} días`;
  }



  // Get recent results for both teams

  const homeRecent = save ? getTeamRecentResults(save, fixture.homeId, save.myLeague, 5) : [];

  const awayRecent = save ? getTeamRecentResults(save, fixture.awayId, save.myLeague, 5) : [];

  const referee = refereeFor(fixture.id);
  const weather = weatherFor(fixture.id);

  return (

    <div className={`panel-glow p-6 border ${theme.cardBorder} ${theme.bgOverlay}`}>

      <div className="flex items-center justify-between mb-4">

        <div className="flex flex-col gap-1">

          <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded text-[0.7rem] border ${theme.badge}`}>{headerText}</span>

          <span className={`text-xs font-medium ${theme.accent}`}>

            {new Date(matchDateIso + "T00:00:00Z").toLocaleDateString("es-ES", { 
              weekday: "long", 
              year: "numeric", 
              month: "short", 
              day: "numeric" 
            })} · <span className="text-primary font-semibold">{daysRemainingText}</span>
          </span>

        </div>

        <span className="text-xs text-muted-foreground uppercase tracking-wider">{isHome ? "Local" : "Visitante"}</span>

      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center text-center mb-6">

        <TeamSide team={home} side="left" recentResults={homeRecent} label="LOCAL" />
        <div className="text-3xl font-black text-muted-foreground">VS</div>
        <TeamSide team={away} side="right" recentResults={awayRecent} label="VISITANTE" />

      </div>

      {/* Referee + weather */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border/40">
          <Flag className="w-4 h-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Árbitro</div>
            <div className="text-xs font-bold truncate">{referee.name}</div>
            <div className="text-[0.6rem] text-muted-foreground">Severidad {referee.strictness}/100</div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border/40">
          <span className="text-xl leading-none">{weather.icon}</span>
          <div className="min-w-0">
            <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Clima</div>
            <div className="text-xs font-bold truncate">{weather.label}</div>
            <div className="text-[0.6rem] text-muted-foreground">{weather.temp}°C</div>
          </div>
        </div>
      </div>

      {/* Action buttons */}

      <div className="space-y-2">

        {/* Play button - only enabled on match day with complete lineup */}

        <button

          onClick={() => onPlayMatch(fixture)}

          disabled={!isLineupComplete || !isMatchDay}

          className={`w-full py-3 rounded-lg font-black tracking-wide transition ${

            isLineupComplete && isMatchDay

              ? `${theme.primaryBtn} glow-neon hover:brightness-110`

              : "bg-secondary text-muted-foreground pointer-events-none opacity-50"

          }`}

        >

          {!isLineupComplete ? "ALINEACIÓN INCOMPLETA" : !isMatchDay ? `${daysRemainingText} · ${matchDateIso}` : "JUGAR"}

        </button>

      </div>

    </div>

  );

}



function TeamSide({ team, side, recentResults, label }: { team: ReturnType<typeof teamById>; side: "left" | "right"; recentResults: Fixture[]; label?: string }) {
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);
  const squad = getSimSquad(team.id);
  const bestPlayer = squad.length > 0 ? squad.reduce((best, current) => current.rating > best.rating ? current : best) : null;

  return (

    <div className="flex flex-col items-center gap-2">

      {label && (
        <span className="text-[0.6rem] font-bold text-muted-foreground uppercase tracking-widest bg-secondary/50 px-2 py-0.5 rounded">
          {label}
        </span>
      )}

      <div className={`flex items-center gap-3 ${side === "right" ? "flex-row-reverse" : ""}`}>

        <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={56} />

        <div className={side === "right" ? "text-right" : "text-left"}>

          <div className="font-bold leading-tight">{team.name}</div>

          <div className="text-xs text-muted-foreground">{bestPlayer ? bestPlayer.name : team.city}</div>

        </div>

      </div>

      {recentResults.length > 0 && (

        <div className="flex gap-1">

          {recentResults.map((f) => {

            const r = f.result!;

            const teamGoals = f.homeId === team.id ? r.homeGoals : r.awayGoals;

            const oppGoals = f.homeId === team.id ? r.awayGoals : r.homeGoals;

            const outcome = teamGoals > oppGoals ? "V" : teamGoals < oppGoals ? "D" : "E";

            const outcomeColor =

              outcome === "V" ? "bg-primary text-primary-foreground" :

              outcome === "D" ? "bg-destructive text-destructive-foreground" :

              "bg-muted text-foreground";

            return (

              <div key={f.id} className={`w-5 h-5 rounded grid place-items-center text-[0.65rem] font-black ${outcomeColor}`}>

                {outcome}

              </div>

            );

          })}

        </div>

      )}

    </div>

  );

}



function ResultRow({ fixture, myId }: { fixture: Fixture; myId: string }) {

  const home = teamById(fixture.homeId);

  const away = teamById(fixture.awayId);

  const r = fixture.result!;

  const myGoals = fixture.homeId === myId ? r.homeGoals : r.awayGoals;

  const oppGoals = fixture.homeId === myId ? r.awayGoals : r.homeGoals;

  const outcome = myGoals > oppGoals ? "V" : myGoals < oppGoals ? "D" : "E";

  const outcomeColor =

    outcome === "V" ? "bg-primary text-primary-foreground" :

    outcome === "D" ? "bg-destructive text-destructive-foreground" :

    "bg-muted text-foreground";

  const isHome = fixture.homeId === myId;

  return (

    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">

      <div className={`w-6 h-6 rounded grid place-items-center text-xs font-black ${outcomeColor}`}>

        {outcome}

      </div>

      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />

      <span className="text-sm flex-1 truncate">{home.short}</span>

      <span className="scoreline text-lg">{r.homeGoals} <span className="text-muted-foreground">-</span> {r.awayGoals}</span>

      <span className="text-sm flex-1 truncate text-right">{away.short}</span>

      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />

      <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold w-6 text-center">

        {isHome ? "H" : "A"}

      </span>

    </div>

  );

}



function StandingsTable({ standings, myTeamId }: { standings: ReturnType<typeof getSortedStandings>; myTeamId: string }) {

  return (

    <div className="text-xs">

      <div className="grid grid-cols-[24px_1fr_24px_28px_32px] gap-2 text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/60">

        <span>#</span><span>Equipo</span><span className="text-center">PJ</span><span className="text-center">DG</span><span className="text-center">Pts</span>

      </div>

      {standings.map((s, i) => {

        const t = teamById(s.teamId);

        const isMe = s.teamId === myTeamId;

        const zoneColor =

          i < 4 ? "border-l-primary" : i < 6 ? "border-l-accent" :

          i >= standings.length - 3 ? "border-l-destructive" : "border-l-transparent";

        return (

          <div

            key={s.teamId}

            className={`grid grid-cols-[24px_1fr_24px_28px_32px] gap-2 py-1.5 border-b border-border/30 last:border-0 border-l-2 pl-2 ${zoneColor} ${isMe ? "bg-primary/10 text-primary font-bold" : ""}`}

          >

            <span className="text-muted-foreground">{i + 1}</span>

            <span className="flex items-center gap-1.5 min-w-0">

              <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={18} />

              <span className="truncate">{t.short}</span>

            </span>

            <span className="text-center scoreline">{s.played}</span>

            <span className="text-center scoreline">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>

            <span className="text-center scoreline font-bold">{s.points}</span>

          </div>

        );

      })}

      <p className="text-[0.65rem] text-muted-foreground mt-3 leading-relaxed">
        <span className="text-primary">●</span> Europa · <span className="text-destructive">●</span> Descenso
      </p>

    </div>

  );

}



// Big 5 European leagues only

const BIG5_LEAGUES: LeagueId[] = ["laliga", "premier", "bundesliga", "ligue1", "seriea"];



function OtherLeaguesPanel({ save }: { save: SaveGame }) {

  // Only show Big 5 leagues (excluding user's current league if it's one of them)

  const others = BIG5_LEAGUES.filter((l) => l !== save.myLeague);

  

  return (

    <div className="panel p-5">

      <h3 className="font-bold mb-4">Resultados en Europa</h3>

      <div className="grid sm:grid-cols-2 gap-4">

        {others.map((lg) => {

          // Find the highest matchday with results that is <= current matchday

          const fixtures = save.fixtures[lg];

          const currentMd = save.currentMatchday[lg];

          const matchdaysWithResults = new Set(

            fixtures.filter(f => f.result && f.matchday <= currentMd).map(f => f.matchday)

          );

          const highestMd = matchdaysWithResults.size > 0 ? Math.max(1, ...matchdaysWithResults) : currentMd;

          

          const allFixtures = getMatchdayFixtures(save, lg, highestMd);

          const fixturesWithResults = allFixtures.filter((f) => f.result);

          

          return (

            <div key={lg}>

              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <CountryFlag country={LEAGUES[lg].country} />
                {LEAGUES[lg].name} · J{highestMd}
              </div>

              {fixturesWithResults.length === 0 ? (

                <p className="text-xs text-muted-foreground">

                  {allFixtures.length === 0 

                    ? `Sin partidos en esta jornada (MD actual: ${save.currentMatchday[lg]}, fixtures totales: ${save.fixtures[lg]?.length || 0})` 

                    : `Partidos no jugados aún (${allFixtures.length} partidos) - Usa "Simular resto de la jornada"`}

                </p>

              ) : (

                <div className="space-y-1">

                  {fixturesWithResults.slice(0, 5).map((f) => {

                    const h = teamById(f.homeId);

                    const a = teamById(f.awayId);

                    return (

                      <div key={f.id} className="flex items-center gap-2 text-xs">

                        <span className="flex-1 text-right truncate flex items-center justify-end gap-1.5">

                          {h.short}

                          <TeamLogo teamName={h.name} leagueName={getLeagueName(h.league)} size={16} />

                        </span>

                        <span className="scoreline font-bold">{f.result!.homeGoals}-{f.result!.awayGoals}</span>

                        <span className="flex-1 truncate flex items-center gap-1.5">

                          <TeamLogo teamName={a.name} leagueName={getLeagueName(a.league)} size={16} />

                          {a.short}

                        </span>

                      </div>

                    );

                  })}

                </div>

              )}

            </div>

          );

        })}

      </div>

    </div>

  );

}



// ===== Extra components =====

function MiniTrendChart({ history }: { history: { matchday: number; pos: number }[] }) {
  if (history.length < 2) {
    return (
      <div className="hidden sm:flex flex-col items-center justify-center text-[0.6rem] text-muted-foreground w-28 h-14 border border-dashed border-border/40 rounded-md">
        Sin histórico
      </div>
    );
  }
  const w = 112;
  const h = 56;
  const pad = 4;
  const positions = history.map((h) => h.pos);
  const maxPos = Math.max(...positions);
  const minPos = Math.min(...positions);
  const range = Math.max(1, maxPos - minPos);
  const pts = history.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / (history.length - 1);
    // invert: lower pos number is better → higher in chart
    const y = pad + ((p.pos - minPos) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="hidden sm:block">
      <div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground mb-1 text-center">Evolución</div>
      <svg width={w} height={h} className="block">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary/70" />
        <circle cx={last[0]} cy={last[1]} r="2.5" className="fill-primary" />
      </svg>
    </div>
  );
}

function NotificationsBar({
  isLineupComplete,
  injuredCount,
  nextFixture,
  theme,
}: {
  isLineupComplete: boolean;
  injuredCount: number;
  nextFixture: Fixture | null;
  theme: CentralTheme;
}) {
  const items: { icon: any; text: string; tone: string }[] = [];
  if (!isLineupComplete) {
    items.push({ icon: AlertTriangle, text: "Alineación incompleta — completa tu 11 titular", tone: "text-destructive border-destructive/40 bg-destructive/10" });
  }
  if (injuredCount > 0) {
    items.push({ icon: AlertTriangle, text: `${injuredCount} titular${injuredCount === 1 ? "" : "es"} con problemas físicos`, tone: "text-amber-300 border-amber-400/40 bg-amber-500/10" });
  }
  if (nextFixture?.competition === "ucl") {
    items.push({ icon: Bell, text: "Próximo: Champions League — partido especial", tone: "text-blue-200 border-blue-400/40 bg-blue-500/10" });
  } else if (nextFixture?.competition === "cup") {
    items.push({ icon: Bell, text: "Próximo: Copa Nacional — eliminación directa", tone: "text-amber-200 border-amber-400/40 bg-amber-500/10" });
  }
  if (items.length === 0) {
    items.push({ icon: Bell, text: "Todo en orden. ¡Suerte en la próxima jornada!", tone: `text-muted-foreground border-border/50 bg-secondary/20` });
  }
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs ${it.tone}`}>
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{it.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function NewsPanel({ news, theme }: { news: ReturnType<typeof buildNews>; theme: CentralTheme }) {
  const catMeta: Record<string, { icon: any; label: string; color: string }> = {
    club: { icon: Building2, label: "Club", color: "text-primary" },
    liga: { icon: Newspaper, label: "Liga", color: "text-blue-400" },
    mercado: { icon: Briefcase, label: "Mercado", color: "text-amber-400" },
  };
  return (
    <div className={`panel p-5 border ${theme.cardBorder}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">Noticias</h3>
        <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Resumen de la semana</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {news.map((n) => {
          const meta = catMeta[n.cat];
          const Icon = meta.icon;
          return (
            <div key={n.id} className="rounded-lg border border-border/50 bg-secondary/20 p-3 hover:border-primary/40 transition">
              <div className={`flex items-center gap-1.5 text-[0.6rem] uppercase tracking-wider font-bold mb-1 ${meta.color}`}>
                <Icon className="w-3 h-3" />
                {meta.label}
              </div>
              <div className="text-sm font-bold leading-tight mb-1">{n.icon} {n.title}</div>
              <p className="text-xs text-muted-foreground leading-snug">{n.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UCLMiniTable({ table, myTeamId }: { table: any[]; myTeamId: string }) {
  const sorted = [...table].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  return (
    <div className="text-xs">
      <div className="grid grid-cols-[24px_1fr_24px_28px_32px] gap-2 text-muted-foreground uppercase tracking-wider pb-2 border-b border-blue-500/30">
        <span>#</span><span>Equipo</span><span className="text-center">PJ</span><span className="text-center">DG</span><span className="text-center">Pts</span>
      </div>
      {sorted.slice(0, 12).map((s, i) => {
        const t = teamById(s.teamId);
        const isMe = s.teamId === myTeamId;
        const zone =
          i < 8 ? "border-l-blue-400" :
          i < 24 ? "border-l-indigo-400/60" :
          "border-l-destructive";
        return (
          <div
            key={s.teamId}
            className={`grid grid-cols-[24px_1fr_24px_28px_32px] gap-2 py-1.5 border-b border-blue-500/20 last:border-0 border-l-2 pl-2 ${zone} ${isMe ? "bg-blue-500/15 text-blue-200 font-bold" : ""}`}
          >
            <span className="text-muted-foreground">{i + 1}</span>
            <span className="flex items-center gap-1.5 min-w-0">
              <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={18} />
              <span className="truncate">{t.short}</span>
            </span>
            <span className="text-center scoreline">{s.played}</span>
            <span className="text-center scoreline">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
            <span className="text-center scoreline font-bold">{s.points}</span>
          </div>
        );
      })}
      <p className="text-[0.65rem] text-muted-foreground mt-3 leading-relaxed">
        <span className="text-blue-400">●</span> Top 8 (Octavos) · <span className="text-indigo-400">●</span> Playoff · <span className="text-destructive">●</span> Eliminado
      </p>
    </div>
  );
}

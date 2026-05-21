import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ALL_LEAGUES, loadSave, SaveGame, advanceMatchdayLayered, getSortedStandings, getMatchdayFixtures, getMyNextFixture, getMyUpcomingCupFixtures, getMyRecentResults, getTeamRecentResults } from "@/lib/store";
import { LEAGUES, teamById, teamsByLeague, type LeagueId, type Team } from "@/data/teams";
import { type Fixture } from "@/lib/season";
import { usePlayersStore, ensureStatsForLeague } from "@/store/playersStore";
import { TeamLogo } from "@/components/TeamLogo";
import { saveSave } from "@/lib/store";

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

  if (!save) return null;

  const myTeam = teamById(save.myTeamId);
  const nextFixture = getMyNextFixture(save);
  const cupFixtures = getMyUpcomingCupFixtures(save);
  const recent = getMyRecentResults(save, 5);
  const standings = getSortedStandings(save, viewLeague);
  const myLeagueTotalMatchdays = (teamsByLeague(save.myLeague).length - 1) * 2;
  const seasonComplete = save.currentMatchday[save.myLeague] > myLeagueTotalMatchdays;
  const myPos = standings.findIndex((s) => s.teamId === save.myTeamId) + 1;

  async function simulateRest() {
    if (!save || isSimulating) return;
    setIsSimulating(true);
    setSimProgress({ done: 0, total: 0 });
    
    try {
      console.time('simulateRest');
      
      // Use Layered Simulation: deep for user's league, O(1) math for others
      const next = await advanceMatchdayLayered(save, (done, total) => {
        setSimProgress({ done, total });
        console.log(`Matches: ${done}/${total}`);
      });
      
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
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header strip */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TeamLogo teamName={myTeam.name} leagueName={getLeagueName(myTeam.league)} size={44} />
          <div>
            <h1 className="text-2xl font-black leading-tight">{myTeam.name}</h1>
            <p className="text-xs text-muted-foreground">
              Jornada {save.currentMatchday[save.myLeague]} de {myLeagueTotalMatchdays} · {LEAGUES[save.myLeague].name}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Posición</div>
          <div className="text-3xl font-black text-primary scoreline">{myPos || "-"}º</div>
        </div>
      </div>

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
            <NextMatchCard fixture={nextFixture} myId={save.myTeamId} matchday={save.currentMatchday[save.myLeague]} />
          ) : null}

          {cupFixtures.length > 0 && (
            <div className="panel p-5">
              <h3 className="font-bold mb-3 text-sm uppercase tracking-wider text-muted-foreground">
                Próximos partidos de copa
              </h3>
              <div className="space-y-2">
                {cupFixtures.map((f) => (
                  <CupFixtureRow key={f.id} fixture={f} myId={save.myTeamId} />
                ))}
              </div>
            </div>
          )}

          {!seasonComplete && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={simulateRest}
                disabled={isSimulating}
                className={`px-5 py-2.5 rounded-lg border text-sm font-semibold transition ${
                  isSimulating 
                    ? 'opacity-50 cursor-not-allowed border-border' 
                    : 'border-border hover:border-accent'
                }`}
              >
                {isSimulating ? 'Simulando...' : 'Simular resto de la jornada →'}
              </button>
              <button
                onClick={simulateUntilEnd}
                className="px-5 py-2.5 rounded-lg bg-card border border-border text-sm font-semibold hover:border-destructive/60 transition text-muted-foreground"
              >
                Simular hasta fin de temporada
              </button>
            </div>
          )}

          <div className="panel p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">Últimos resultados</h3>
              <Link to="/fixtures" className="text-xs text-muted-foreground hover:text-primary">Ver todos →</Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no has jugado ningún partido.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((f) => <ResultRow key={f.id} fixture={f} myId={save.myTeamId} />)}
              </div>
            )}
          </div>

          <OtherLeaguesPanel save={save} />
        </div>

        <div className="space-y-6">
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Clasificación</h3>
              <select
                value={viewLeague}
                onChange={(e) => setViewLeague(e.target.value as LeagueId)}
                className="bg-secondary border border-border rounded px-2 py-1 text-xs"
              >
                {ALL_LEAGUES.map((lg) => (
                  <option key={lg} value={lg}>{LEAGUES[lg].flag} {LEAGUES[lg].name}</option>
                ))}
              </select>
            </div>
            <StandingsTable standings={standings} myTeamId={save.myTeamId} />
          </div>
        </div>
      </div>
    </div>
  );
}

function NextMatchCard({ fixture, myId, matchday }: { fixture: Fixture; myId: string; matchday: number }) {
  const navigate = useNavigate();
  const home = teamById(fixture.homeId);
  const away = teamById(fixture.awayId);
  const isHome = fixture.homeId === myId;
  const fixtures = usePlayersStore((s) => s.fixtures);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const dismissMatch = usePlayersStore((s) => s.dismissMatch);
  const save = loadSave();

  // Check if user's lineup is complete (11 valid players)
  const myLineup = save?.lineups[myId] || [];
  const activeStartersCount = myLineup.filter((id: string) => id && id.trim() !== "").length;
  const isLineupComplete = activeStartersCount === 11;

  // Get recent results for both teams
  const homeRecent = save ? getTeamRecentResults(save, fixture.homeId, save.myLeague, 5) : [];
  const awayRecent = save ? getTeamRecentResults(save, fixture.awayId, save.myLeague, 5) : [];

  function handlePlayMatch() {
    if (!isLineupComplete) {
      alert("La alineación no está completa. Debes tener 11 jugadores titulares para jugar el partido.");
      return;
    }
    if (!myTeamId) return;
    const scheduleFixture = fixtures.find(
      (f) => f.homeId === fixture.homeId && f.awayId === fixture.awayId && f.matchday === matchday
    );
    if (scheduleFixture?.date) {
      usePlayersStore.setState({ currentDate: scheduleFixture.date });
      dismissMatch(scheduleFixture.id);
    }
    navigate({ to: "/match" });
  }

  return (
    <div className="panel-glow p-6">
      <div className="flex items-center justify-between mb-5">
        <span className="chip">Liga · Jornada {matchday}</span>
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{isHome ? "Local" : "Visitante"}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center text-center mb-6">
        <TeamSide team={home} side="left" recentResults={homeRecent} />
        <div className="text-3xl font-black text-muted-foreground">VS</div>
        <TeamSide team={away} side="right" recentResults={awayRecent} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate({ to: "/lineup", search: { from: "season" } })}
          className="text-center py-3 rounded-lg bg-card border border-border font-semibold hover:border-accent transition"
        >
          Editar alineación
        </button>
        <button
          onClick={handlePlayMatch}
          disabled={!isLineupComplete}
          className={`text-center py-3 rounded-lg font-black tracking-wide transition ${
            isLineupComplete 
              ? "bg-primary text-primary-foreground glow-neon hover:brightness-110" 
              : "bg-secondary text-muted-foreground pointer-events-none opacity-40"
          }`}
        >
          {isLineupComplete ? "JUGAR" : "ALINEACIÓN INCOMPLETA"}
        </button>
      </div>
    </div>
  );
}

function TeamSide({ team, side, recentResults }: { team: ReturnType<typeof teamById>; side: "left" | "right"; recentResults: Fixture[] }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`flex items-center gap-3 ${side === "right" ? "flex-row-reverse" : ""}`}>
        <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={56} />
        <div className={side === "right" ? "text-right" : "text-left"}>
          <div className="font-bold leading-tight">{team.name}</div>
          <div className="text-xs text-muted-foreground">{team.stars[0] ?? team.city}</div>
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

function CupFixtureRow({ fixture, myId }: { fixture: Fixture; myId: string }) {
  const home = teamById(fixture.homeId);
  const away = teamById(fixture.awayId);
  const isHome = fixture.homeId === myId;
  const opponent = isHome ? away : home;
  const compLabel = fixture.competition === "ucl" ? "🏆 Champions" : "🛡 Copa";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
      <span className="text-xs font-bold w-24 text-accent">{compLabel}</span>
      <span className="text-xs font-bold text-muted-foreground w-10">{fixture.round}</span>
      <TeamLogo teamName={opponent.name} leagueName={getLeagueName(opponent.league)} size={24} />
      <span className="text-sm flex-1 truncate">
        {isHome ? "vs" : "@"} {opponent.name}
      </span>
      <span className="text-xs text-muted-foreground">J{fixture.matchday}</span>
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
        <span className="text-primary">●</span> Champions · <span className="text-accent">●</span> Europa · <span className="text-destructive">●</span> Descenso
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
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {LEAGUES[lg].flag} {LEAGUES[lg].name} · J{highestMd}
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

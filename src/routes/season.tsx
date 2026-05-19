import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ALL_LEAGUES, finishMatchday, getMatchdayFixtures, getMyNextFixture,
  getMyRecentResults, getMyUpcomingCupFixtures, getSortedStandings,
  loadSave, SaveGame, saveSave,
} from "@/lib/store";
import { Fixture } from "@/lib/season";
import { LEAGUES, LeagueId, teamById, teamsByLeague } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { usePlayersStore } from "@/store/playersStore";

export const Route = createFileRoute("/season")({ component: SeasonPage });

function SeasonPage() {
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [viewLeague, setViewLeague] = useState<LeagueId>("laliga");

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s);
    setViewLeague(s.myLeague);
  }, [navigate]);

  if (!save) return null;

  const myTeam = teamById(save.myTeamId);
  const nextFixture = getMyNextFixture(save);
  const cupFixtures = getMyUpcomingCupFixtures(save);
  const recent = getMyRecentResults(save, 5);
  const standings = getSortedStandings(save, viewLeague);
  const myLeagueTotalMatchdays = (teamsByLeague(save.myLeague).length - 1) * 2;
  const seasonComplete = save.currentMatchday[save.myLeague] > myLeagueTotalMatchdays;
  const myPos = standings.findIndex((s) => s.teamId === save.myTeamId) + 1;

  function simulateRest() {
    if (!save) return;
    try {
      const next = finishMatchday(save);
      saveSave(next);
      setSave(next);
    } catch (err) {
      console.error("Error al simular jornada:", err);
      alert("Error al simular: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  function simulateUntilEnd() {
    if (!save) return;
    try {
      let cur = save; let safety = 0;
      while (cur.currentMatchday[cur.myLeague] <= myLeagueTotalMatchdays && safety < 100) {
        cur = finishMatchday(cur); safety++;
      }
      saveSave(cur); setSave(cur);
    } catch (err) {
      console.error("Error al simular temporada:", err);
      alert("Error al simular: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header strip */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TeamBadge team={myTeam} size={44} />
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
                className="px-5 py-2.5 rounded-lg bg-card border border-border text-sm font-semibold hover:border-accent transition"
              >
                Simular resto de la jornada →
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

  function handlePlayMatch() {
    if (!myTeamId) return;
    const scheduleFixture = fixtures.find(
      (f) => f.homeTeam === fixture.homeId && f.awayTeam === fixture.awayId && f.matchday === matchday
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
        <TeamSide team={home} side="left" />
        <div className="text-3xl font-black text-muted-foreground">VS</div>
        <TeamSide team={away} side="right" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/lineup"
          className="text-center py-3 rounded-lg bg-card border border-border font-semibold hover:border-accent transition"
        >
          Editar alineación
        </Link>
        <button
          onClick={handlePlayMatch}
          className="text-center py-3 rounded-lg bg-primary text-primary-foreground font-black tracking-wide glow-neon hover:brightness-110 transition"
        >
          JUGAR
        </button>
      </div>
    </div>
  );
}

function TeamSide({ team, side }: { team: ReturnType<typeof teamById>; side: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-3 ${side === "right" ? "flex-row-reverse" : ""}`}>
      <TeamBadge team={team} size={56} />
      <div className={side === "right" ? "text-right" : "text-left"}>
        <div className="font-bold leading-tight">{team.name}</div>
        <div className="text-xs text-muted-foreground">{team.stars[0] ?? team.city}</div>
      </div>
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
      <TeamBadge team={opponent} size={24} />
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
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
      <div className={`w-6 h-6 rounded grid place-items-center text-xs font-black ${outcomeColor}`}>
        {outcome}
      </div>
      <TeamBadge team={home} size={24} />
      <span className="text-sm flex-1 truncate">{home.short}</span>
      <span className="scoreline text-lg">{r.homeGoals} <span className="text-muted-foreground">-</span> {r.awayGoals}</span>
      <span className="text-sm flex-1 truncate text-right">{away.short}</span>
      <TeamBadge team={away} size={24} />
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
              <TeamBadge team={t} size={18} />
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

function OtherLeaguesPanel({ save }: { save: SaveGame }) {
  const others = ALL_LEAGUES.filter((l) => l !== save.myLeague);
  return (
    <div className="panel p-5">
      <h3 className="font-bold mb-4">Resultados en Europa</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        {others.map((lg) => {
          const md = Math.max(1, save.currentMatchday[lg] - 1);
          const fixtures = getMatchdayFixtures(save, lg, md).filter((f) => f.result);
          return (
            <div key={lg}>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {LEAGUES[lg].flag} {LEAGUES[lg].name} · J{md}
              </div>
              {fixtures.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin partidos aún</p>
              ) : (
                <div className="space-y-1">
                  {fixtures.slice(0, 5).map((f) => {
                    const h = teamById(f.homeId);
                    const a = teamById(f.awayId);
                    return (
                      <div key={f.id} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 text-right truncate">{h.short}</span>
                        <span className="scoreline font-bold">{f.result!.homeGoals}-{f.result!.awayGoals}</span>
                        <span className="flex-1 truncate">{a.short}</span>
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

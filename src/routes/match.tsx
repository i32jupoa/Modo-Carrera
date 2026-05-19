import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getMyNextFixture, loadSave, playMyNextMatch, SaveGame, saveSave } from "@/lib/store";
import { Fixture } from "@/lib/season";
import { teamById } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { MatchEvent } from "@/lib/simulation";

export const Route = createFileRoute("/match")({ component: MatchPage });

type Phase = "preview" | "playing" | "done";

function MatchPage() {
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [phase, setPhase] = useState<Phase>("preview");
  const [minute, setMinute] = useState(0);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const allEventsRef = useRef<MatchEvent[]>([]);
  const fixtureRef = useRef<Fixture | null>(null);

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s);
    fixtureRef.current = getMyNextFixture(s);
    if (!fixtureRef.current) navigate({ to: "/season" });
  }, [navigate]);

  function startMatch() {
    if (!save) return;
    const { save: newSave, fixture } = playMyNextMatch(save);
    if (!fixture || !fixture.result) return;
    allEventsRef.current = fixture.result.events;
    fixtureRef.current = fixture;
    setSave(newSave);
    saveSave(newSave);
    setPhase("playing");
    runClock();
  }

  function runClock() {
    let m = 0;
    const tick = () => {
      m += 1;
      setMinute(m);
      const events = allEventsRef.current.filter((e) => e.minute === m);
      if (events.length > 0) {
        setFeed((prev) => [...events, ...prev]);
        for (const ev of events) {
          if (ev.team === "home") setHomeScore((s) => s + 1);
          else setAwayScore((s) => s + 1);
        }
      }
      if (m >= 90) { setPhase("done"); return; }
      setTimeout(tick, 50);
    };
    setTimeout(tick, 300);
  }

  function skipToEnd() {
    if (!fixtureRef.current?.result) return;
    setHomeScore(fixtureRef.current.result.homeGoals);
    setAwayScore(fixtureRef.current.result.awayGoals);
    setFeed(allEventsRef.current.slice().reverse());
    setMinute(90);
    setPhase("done");
  }

  if (!save || !fixtureRef.current) return null;
  const fixture = fixtureRef.current;
  const home = teamById(fixture.homeId);
  const away = teamById(fixture.awayId);
  const myId = save.myTeamId;
  const isMe = (id: string) => id === myId;
  const injuries = fixture.result?.injuries ?? [];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="panel-glow p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <span className="chip">Jornada {fixture.matchday}</span>
          <div className="text-sm scoreline font-bold text-primary">
            {phase === "preview" ? "00'" : `${minute}'`}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 md:gap-6 items-center text-center">
          <div className="flex flex-col items-center gap-2 md:gap-3">
            <TeamBadge team={home} size={64} />
            <div className="font-bold text-sm md:text-base">{home.name}</div>
            {isMe(home.id) && <span className="chip text-[0.6rem]">Tú</span>}
          </div>
          <div className="scoreline text-5xl md:text-7xl font-black">
            {phase === "preview" ? "–" : homeScore}
            <span className="text-muted-foreground mx-2 md:mx-3">:</span>
            {phase === "preview" ? "–" : awayScore}
          </div>
          <div className="flex flex-col items-center gap-2 md:gap-3">
            <TeamBadge team={away} size={64} />
            <div className="font-bold text-sm md:text-base">{away.name}</div>
            {isMe(away.id) && <span className="chip text-[0.6rem]">Tú</span>}
          </div>
        </div>

        {phase !== "preview" && (
          <div className="mt-6 h-1 bg-secondary rounded overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(minute / 90) * 100}%` }} />
          </div>
        )}

        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          {phase === "preview" && (
            <button onClick={startMatch} className="px-8 py-3 rounded-lg bg-primary text-primary-foreground font-black glow-neon hover:brightness-110 transition">
              INICIAR PARTIDO
            </button>
          )}
          {phase === "playing" && (
            <button onClick={skipToEnd} className="px-6 py-2.5 rounded-lg bg-card border border-border text-sm font-semibold hover:border-accent transition">
              Saltar al final
            </button>
          )}
          {phase === "done" && (
            <button onClick={() => navigate({ to: "/season" })} className="px-8 py-3 rounded-lg bg-primary text-primary-foreground font-black glow-neon hover:brightness-110 transition">
              Volver a la temporada →
            </button>
          )}
        </div>
      </div>

      <div className="panel mt-6 p-5">
        <h3 className="font-bold mb-3">Crónica del partido</h3>
        {phase === "preview" ? (
          <p className="text-sm text-muted-foreground">
            {home.name} recibe a {away.name}. Pulsa "Iniciar partido" para comenzar.
          </p>
        ) : feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin goles aún... el partido está disputado.</p>
        ) : (
          <div className="space-y-2">
            {feed.map((e, i) => {
              const scoringTeam = e.team === "home" ? home : away;
              return (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                  <span className="scoreline text-sm text-primary font-bold w-10">{e.minute}'</span>
                  <span className="text-lg">⚽</span>
                  <TeamBadge team={scoringTeam} size={22} />
                  <div className="text-sm min-w-0">
                    <span className="font-bold">{e.scorerName}</span>
                    {e.assistName && (
                      <span className="text-muted-foreground"> · asist. {e.assistName}</span>
                    )}
                    <span className="text-muted-foreground"> ({scoringTeam.short})</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {phase === "done" && fixture.result && (
          <>
            {injuries.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/60">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">🚑 Lesiones</div>
                {injuries.map((inj, i) => {
                  const team = inj.team === "home" ? home : away;
                  return (
                    <div key={i} className="text-sm">
                      <span className="font-bold">{inj.playerName}</span>
                      <span className="text-muted-foreground"> ({team.short}) — {inj.reason}, baja {inj.weeks} {inj.weeks === 1 ? "jornada" : "jornadas"}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-border/60 text-xs text-muted-foreground grid grid-cols-2 gap-2">
              <div>xG {home.short}: <span className="text-foreground scoreline">{fixture.result.xgHome.toFixed(2)}</span></div>
              <div className="text-right">xG {away.short}: <span className="text-foreground scoreline">{fixture.result.xgAway.toFixed(2)}</span></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

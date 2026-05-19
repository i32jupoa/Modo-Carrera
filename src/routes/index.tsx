import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LEAGUES, LeagueId, TEAMS, teamsByLeague, overall } from "@/data/teams";
import { loadSave, newSave, saveSave, clearSave } from "@/lib/store";
import { usePlayersStore } from "@/store/playersStore";
import { TeamBadge } from "@/components/TeamBadge";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [hasSave, setHasSave] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState<LeagueId>("laliga");
  const [hoverTeam, setHoverTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHasSave(!!loadSave());
  }, []);

  const teams = useMemo(
    () => teamsByLeague(selectedLeague).slice().sort((a, b) => overall(b) - overall(a)),
    [selectedLeague]
  );

  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const initPlayers = usePlayersStore((s) => s.init);

  function pickTeam(id: string) {
    setLoading(true);
    setTimeout(() => {
      initPlayers();
      const s = newSave(id);
      saveSave(s);
      setMyTeam(id);
      navigate({ to: "/season" });
    }, 50);
  }

  function resetGame() {
    if (confirm("¿Borrar la partida guardada y empezar de cero?")) {
      clearSave();
      setHasSave(false);
    }
  }

  return (
    <div className="min-h-screen">
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-10 text-center">
        <span className="chip mb-5 inline-flex">Top 5 Ligas · Copa · Champions</span>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight">
          Vive la temporada<br />
          <span className="text-primary text-glow">como un mánager</span>
        </h1>
        <p className="mt-5 text-muted-foreground max-w-xl mx-auto text-sm md:text-base">
          Plantillas, alineaciones, lesiones, goleadores, copa nacional y Champions League.
          Todo el ecosistema del fútbol europeo en una simulación.
        </p>

        {hasSave && (
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/season"
              className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-bold glow-neon hover:brightness-110 transition"
            >
              Continuar partida →
            </Link>
            <button
              onClick={resetGame}
              className="px-4 py-3 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-destructive/60 transition text-sm"
            >
              Nueva partida
            </button>
          </div>
        )}
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Elige tu equipo</h2>
          <p className="text-xs text-muted-foreground">{TEAMS.length} clubes disponibles</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {(Object.values(LEAGUES) as { id: LeagueId; name: string; flag: string }[]).map((lg) => (
            <button
              key={lg.id}
              onClick={() => setSelectedLeague(lg.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition border ${
                selectedLeague === lg.id
                  ? "bg-primary text-primary-foreground border-primary glow-neon"
                  : "bg-card text-foreground border-border hover:border-primary/60"
              }`}
            >
              <span className="mr-1.5">{lg.flag}</span>
              {lg.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {teams.map((t) => {
            const ov = overall(t);
            const isHover = hoverTeam === t.id;
            return (
              <button
                key={t.id}
                disabled={loading}
                onMouseEnter={() => setHoverTeam(t.id)}
                onMouseLeave={() => setHoverTeam(null)}
                onClick={() => pickTeam(t.id)}
                className={`text-left p-4 rounded-xl panel transition group hover:border-primary hover:-translate-y-0.5 disabled:opacity-50 ${
                  isHover ? "glow-neon" : ""
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <TeamBadge team={t} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.city}</div>
                  </div>
                  <div className={`text-2xl font-black scoreline ${ov >= 85 ? "text-primary" : ov >= 78 ? "text-accent" : "text-muted-foreground"}`}>
                    {ov}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  <Stat label="ATA" value={t.att} />
                  <Stat label="MED" value={t.mid} />
                  <Stat label="DEF" value={t.def} />
                </div>
                {t.stars.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground truncate">
                    ★ {t.stars.slice(0, 2).join(" · ")}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {loading && (
          <p className="text-center text-sm text-muted-foreground mt-6 animate-pulse">
            Generando plantillas, calendario y cuadros de copa…
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center bg-secondary/40 rounded py-1">
      <span>{label}</span>
      <span className="text-sm font-bold text-foreground">{value}</span>
    </div>
  );
}

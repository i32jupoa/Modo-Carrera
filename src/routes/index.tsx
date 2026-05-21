import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LEAGUES_BY_COUNTRY, LEAGUES, LeagueId, getAllTeams, teamsByLeague, overall } from "@/data/teams";
import { loadSave, newSave, saveSave, clearSave } from "@/lib/store";
import { usePlayersStore } from "@/store/playersStore";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { CountryFlag } from "@/components/CountryFlag";
import { LeagueLogo } from "@/components/LeagueLogo";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [hasSave, setHasSave] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState<LeagueId | null>(null);
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [hoverTeam, setHoverTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHasSave(!!loadSave());
  }, []);

  const teams = useMemo(
    () => selectedLeague ? teamsByLeague(selectedLeague).slice().sort((a, b) => overall(b) - overall(a)) : [],
    [selectedLeague]
  );

  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const initPlayers = usePlayersStore((s) => s.init);

  function pickTeam(id: string) {
    setLoading(true);
    setTimeout(() => {
      try {
        initPlayers();
        const s = newSave(id);
        saveSave(s);
        setMyTeam(id);
        navigate({ to: "/season" });
      } catch (err) {
        console.error("Failed to start career:", err);
        setLoading(false);
        alert("Error al iniciar la carrera. Intenta con otro equipo.");
      }
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
        <div className="mb-6">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-4">
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient">
              Dynasty Manager
            </span>
          </h1>
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-primary/50"></div>
            <span className="text-2xl">⚽</span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-primary/50"></div>
          </div>
        </div>
        <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
          Cada temporada cuenta una historia. Lleva a tu equipo desde la lucha por el descenso hasta conquistar Europa. Fichajes, tácticas, desarrollo y gloria: el futuro de tu club está en tus manos.
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
          <p className="text-xs text-muted-foreground">{getAllTeams().length} clubes disponibles</p>
        </div>

        <div className="mb-6 space-y-2">
          {Object.entries(LEAGUES_BY_COUNTRY).map(([country, leagues]) => (
            <div key={country} className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setOpenCountry(openCountry === country ? null : country)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-card hover:bg-secondary/40 transition text-sm font-semibold"
              >
                <div className="flex items-center gap-2">
                  <CountryFlag country={country} />
                  <span>{country}</span>
                </div>
                <span className="text-muted-foreground text-xs">{openCountry === country ? "▲" : "▼"}</span>
              </button>
              {openCountry === country && (
                <div className="flex flex-wrap gap-2 px-4 py-3 bg-secondary/20 border-t border-border">
                  {leagues.map((lg) => (
                    <button
                      key={lg.id}
                      onClick={() => setSelectedLeague(lg.id as LeagueId)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border flex items-center gap-2 ${
                        selectedLeague === lg.id
                          ? "bg-primary text-primary-foreground border-primary glow-neon"
                          : "bg-card text-foreground border-border hover:border-primary/60"
                      }`}
                    >
                      <LeagueLogo league={lg.name} size="sm" />
                      {lg.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                  <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={44} />
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

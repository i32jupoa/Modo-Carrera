import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame, squadOf } from "@/lib/store";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { LEAGUES, LeagueId, overall, TEAMS, teamsByLeague } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";

export const Route = createFileRoute("/teams")({ component: TeamsPage });

function TeamsPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [league, setLeague] = useState<LeagueId>("laliga");
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s); setLeague(s.myLeague);
  }, [navigate]);

  const teams = useMemo(() => teamsByLeague(league).slice().sort((a, b) => overall(b) - overall(a)), [league]);
  if (!save) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <PlayersLoading message="Cargando datos de jugadores…" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-black mb-2">Equipos</h1>
      <p className="text-xs text-muted-foreground mb-6">Explora las {TEAMS.length} plantillas de las 5 grandes ligas.</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {Object.values(LEAGUES).map((lg) => (
          <button key={lg.id} onClick={() => { setLeague(lg.id); setOpenTeam(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${league === lg.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/60"}`}>
            <span className="mr-1">{lg.flag}</span>{lg.name}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {teams.map((t) => {
          const isOpen = openTeam === t.id;
          const ov = overall(t);
          const squad = isOpen && ready ? squadOf(save, t.id).slice(0, 11) : [];
          return (
            <div key={t.id} className="panel overflow-hidden">
              <button onClick={() => setOpenTeam(isOpen ? null : t.id)}
                className="w-full grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 p-3 hover:bg-secondary/30">
                <TeamBadge team={t} size={36} />
                <div className="min-w-0 text-left">
                  <div className="font-bold truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.city} · ATA {t.att} · MED {t.mid} · DEF {t.def}</div>
                </div>
                <div className={`text-2xl font-black scoreline ${ov >= 85 ? "text-primary" : ov >= 78 ? "text-accent" : "text-muted-foreground"}`}>{ov}</div>
                <span className="text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div className="border-t border-border/40 px-4 py-3 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                  {squad.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-1">
                      <span>
                        <span className="text-[0.65rem] text-muted-foreground mr-2">{p.position}</span>
                        {p.name}
                      </span>
                      <span className="scoreline font-bold text-foreground">{p.rating}</span>
                    </div>
                  ))}
                  <div className="col-span-full mt-2 pt-2 border-t border-border/40 text-center">
                    <Link to="/squad" className="text-xs text-primary hover:underline">
                      Ver plantilla completa (solo mi equipo) →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

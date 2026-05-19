import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { loadSave } from "@/lib/store";
import { usePlayersStore } from "@/store/playersStore";
import { LeagueTable } from "@/components/LeagueTable";
import { LEAGUES } from "@/data/teams";
import { teamById } from "@/data/teams";

export const Route = createFileRoute("/standings")({
  component: StandingsPage,
});

function StandingsPage() {
  const navigate = useNavigate();
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const ensureLeagueSchedule = usePlayersStore((s) => s.ensureLeagueSchedule);

  useEffect(() => {
    const save = loadSave();
    if (!save) {
      navigate({ to: "/" });
      return;
    }
    ensureLeagueSchedule();
  }, [navigate, ensureLeagueSchedule]);

  const league = myTeamId ? teamById(myTeamId).league : "laliga";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <Link
            to="/season"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Temporada
          </Link>
          <h1 className="text-2xl font-black mt-2">Clasificación</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {LEAGUES[league].flag} {LEAGUES[league].name} · calculada en vivo desde
            los partidos jugados
          </p>
        </div>
        <Link
          to="/fixtures"
          className="text-xs font-semibold text-primary hover:underline"
        >
          Ver calendario de jornadas →
        </Link>
      </div>

      <LeagueTable league={league} />
    </div>
  );
}

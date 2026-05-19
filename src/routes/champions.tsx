import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { teamById } from "@/data/teams";
import { UCL_SCHEDULE } from "@/lib/cups";
import { KOFixtureRow } from "./cup";

export const Route = createFileRoute("/champions")({ component: ChampionsPage });

const ROUND_LABEL: Record<string, string> = {
  R16: "Octavos", QF: "Cuartos", SF: "Semifinales", Final: "Final",
};

function ChampionsPage() {
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveGame | null>(null);

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s);
  }, [navigate]);

  if (!save) return null;
  const fixtures = save.uclFixtures;
  const champion = save.uclChampion;
  const myId = save.myTeamId;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black">🏆 UEFA Champions League</h1>
        <p className="text-xs text-muted-foreground">16 equipos · eliminatoria directa · top de las 5 grandes ligas</p>
      </div>

      {champion && (
        <div className="panel-glow p-6 mb-6 text-center">
          <div className="text-5xl mb-2">⭐</div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Campeón de Europa</div>
          <div className="text-3xl font-black text-primary">{teamById(champion).name}</div>
        </div>
      )}

      <div className="space-y-6">
        {UCL_SCHEDULE.map((step: { matchday: number; round: string }) => {
          const rf = fixtures.filter((f) => f.round === step.round);
          return (
            <div key={step.round}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold uppercase tracking-wider">{ROUND_LABEL[step.round]}</h2>
                <span className="text-xs text-muted-foreground">Jornada {step.matchday}</span>
              </div>
              <div className="panel">
                {rf.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-4 py-3">Pendiente de sortear</p>
                ) : (
                  <div className="divide-y divide-border/40">
                    {rf.map((f) => <KOFixtureRow key={f.id} f={f} myId={myId} />)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

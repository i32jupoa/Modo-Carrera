import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ALL_LEAGUES, loadSave, SaveGame } from "@/lib/store";
import { LEAGUES, LeagueId, teamById } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { CUP_SCHEDULE } from "@/lib/cups";
import { Fixture } from "@/lib/season";

export const Route = createFileRoute("/cup")({ component: CupPage });

const ROUND_LABEL: Record<string, string> = {
  R16: "Octavos", QF: "Cuartos", SF: "Semifinales", Final: "Final",
};

function CupPage() {
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [league, setLeague] = useState<LeagueId>("laliga");

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s); setLeague(s.myLeague);
  }, [navigate]);

  if (!save) return null;
  const fixtures = save.cupFixtures[league];
  const champion = save.cupChampion[league];
  const myId = save.myTeamId;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">🛡 Copa nacional</h1>
          <p className="text-xs text-muted-foreground">Eliminatoria a partido único · 16 mejores equipos</p>
        </div>
        <select value={league} onChange={(e) => setLeague(e.target.value as LeagueId)}
          className="bg-secondary border border-border rounded px-3 py-1.5 text-sm">
          {ALL_LEAGUES.map((lg) => (
            <option key={lg} value={lg}>{LEAGUES[lg].flag} {LEAGUES[lg].name}</option>
          ))}
        </select>
      </div>

      {champion && (
        <div className="panel-glow p-6 mb-6 text-center">
          <div className="text-4xl mb-2">🏆</div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Campeón</div>
          <div className="text-2xl font-black text-primary">{teamById(champion).name}</div>
        </div>
      )}

      <div className="space-y-6">
        {CUP_SCHEDULE.map((step) => {
          const rf = fixtures.filter((f) => f.round === step.round);
          if (rf.length === 0) return (
            <RoundBlock key={step.round} label={ROUND_LABEL[step.round]} matchday={step.matchday}>
              <p className="text-xs text-muted-foreground px-4 py-3">Pendiente de sortear</p>
            </RoundBlock>
          );
          return (
            <RoundBlock key={step.round} label={ROUND_LABEL[step.round]} matchday={step.matchday}>
              <div className="divide-y divide-border/40">
                {rf.map((f) => <KOFixtureRow key={f.id} f={f} myId={myId} />)}
              </div>
            </RoundBlock>
          );
        })}
      </div>
    </div>
  );
}

function RoundBlock({ label, matchday, children }: { label: string; matchday: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">{label}</h2>
        <span className="text-xs text-muted-foreground">Jornada {matchday}</span>
      </div>
      <div className="panel">{children}</div>
    </div>
  );
}

export function KOFixtureRow({ f, myId }: { f: Fixture; myId: string }) {
  const home = teamById(f.homeId);
  const away = teamById(f.awayId);
  const isMine = f.homeId === myId || f.awayId === myId;
  const winner = f.result ? (f.result.homeGoals >= f.result.awayGoals ? "home" : "away") : null;
  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 ${isMine ? "bg-primary/5" : ""}`}>
      <div className="flex items-center gap-2 justify-end min-w-0">
        <span className={`truncate text-sm ${winner === "home" ? "font-bold text-primary" : winner === "away" ? "text-muted-foreground line-through" : "font-semibold"}`}>
          {home.name}
        </span>
        <TeamBadge team={home} size={26} />
      </div>
      <div className="scoreline font-bold text-base text-center min-w-[70px]">
        {f.result ? `${f.result.homeGoals} - ${f.result.awayGoals}` : <span className="text-muted-foreground text-xs">vs</span>}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <TeamBadge team={away} size={26} />
        <span className={`truncate text-sm ${winner === "away" ? "font-bold text-primary" : winner === "home" ? "text-muted-foreground line-through" : "font-semibold"}`}>
          {away.name}
        </span>
      </div>
    </div>
  );
}

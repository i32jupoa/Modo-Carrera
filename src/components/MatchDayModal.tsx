import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePlayersStore } from "@/store/playersStore";
import {
  applyFixtureResult,
  involvesTeam,
  simulateScheduleFixture,
  unplayedOnDate,
} from "@/lib/matchEngine";
import { teamById, overall, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Zap } from "lucide-react";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

export function MatchDayModal() {
  const navigate = useNavigate();
  const pending = usePlayersStore((s) => s.pendingUserMatch);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const currentDate = usePlayersStore((s) => s.currentDate);
  const fixtures = usePlayersStore((s) => s.fixtures);
  const lastUserMatchResult = usePlayersStore((s) => s.lastUserMatchResult);
  const clearPendingMatch = usePlayersStore((s) => s.clearPendingMatch);
  const dismissMatch = usePlayersStore((s) => s.dismissMatch);
  const dismissedMatchIds = usePlayersStore((s) => s.dismissedMatchIds);

  useEffect(() => {
    if (!myTeamId || pending) return;
    const onDay = unplayedOnDate(fixtures, currentDate);
    const today = onDay.find((f) => involvesTeam(f, myTeamId));
    if (!today) return;

    if (dismissedMatchIds.includes(today.id)) return;

    const store = usePlayersStore.getState();
    let nextFixtures = store.fixtures;
    for (const f of onDay) {
      if (f.id === today.id) continue;
      const scores = simulateScheduleFixture(f, (teamId, md) =>
        store.getSimXI(teamId, [], md),
      );
      nextFixtures = applyFixtureResult(nextFixtures, f.id, scores);
    }
    usePlayersStore.setState({
      fixtures: nextFixtures,
      pendingUserMatch: today,
      lastUserMatchResult: null,
    });
  }, [currentDate, fixtures, myTeamId, pending, dismissedMatchIds]);

  const live = useMemo(() => {
    if (!pending) return null;
    return fixtures.find((f) => f.id === pending.id) ?? pending;
  }, [pending, fixtures]);

  if (!pending || !myTeamId || !live) return null;

  const home = teamById(live.homeTeam);
  const away = teamById(live.awayTeam);
  const isHome = live.homeTeam === myTeamId;
  const myTeam = isHome ? home : away;
  const rival = isHome ? away : home;

  const played =
    live.isPlayed && live.homeScore != null && live.awayScore != null;

  const myGoals = played
    ? isHome
      ? live.homeScore!
      : live.awayScore!
    : null;
  const rivalGoals = played
    ? isHome
      ? live.awayScore!
      : live.homeScore!
    : null;

  const scorers = lastUserMatchResult?.events ?? [];

  function handleDismiss() {
    if (pending) {
      dismissMatch(pending.id);
    }
  }

  function handleNavigateToMatch(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) {
      dismissMatch(pending.id);
    }
    navigate({ to: "/match" });
  }

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) handleDismiss();
      }}
    >
      <DialogContent
        className="sm:max-w-lg border-primary/30 bg-gradient-to-b from-card to-background p-0 overflow-hidden gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-accent to-primary" />
        <div className="p-6">
          <DialogHeader className="text-center space-y-1 mb-6">
            <span className="chip mx-auto text-[0.65rem]">Jornada {live.matchday}</span>
            <DialogTitle className="text-2xl font-black tracking-tight">
              {played ? "Resultado final" : "Día de partido"}
            </DialogTitle>
            <DialogDescription>
              {played
                ? "Partido disputado. Revisa el marcador y los goleadores."
                : "Tu equipo juega hoy. Simula el encuentro para continuar la temporada."}
            </DialogDescription>
          </DialogHeader>

          <div className="relative rounded-xl border border-border/80 bg-background/60 p-6 mb-4 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.12),transparent_70%)] pointer-events-none" />
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 relative">
              <div className="flex flex-col items-center gap-2 text-center">
                <TeamLogo teamName={myTeam.name} leagueName={getLeagueName(myTeam.league)} size={56} />
                <span className="font-black text-sm leading-tight">{myTeam.name}</span>
                <span className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  OVR {overall(myTeam)}
                </span>
              </div>
              <div className="flex flex-col items-center min-w-[5.5rem]">
                {played ? (
                  <div className="scoreline text-4xl font-black text-primary tabular-nums">
                    {myGoals} - {rivalGoals}
                  </div>
                ) : (
                  <span className="text-2xl font-black text-muted-foreground">VS</span>
                )}
                {played && (
                  <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground mt-1">
                    Final
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <TeamLogo teamName={rival.name} leagueName={getLeagueName(rival.league)} size={56} />
                <span className="font-black text-sm leading-tight">{rival.name}</span>
                <span className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  OVR {overall(rival)}
                </span>
              </div>
            </div>
          </div>

          {played && scorers.length > 0 && (
            <div className="mb-4 rounded-lg border border-border/60 bg-muted/10 p-3 max-h-36 overflow-y-auto">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Goleadores
              </p>
              <ul className="space-y-1 text-xs">
                {scorers.map((ev, i) => (
                  <li key={`${ev.scorerId}-${ev.minute}-${i}`} className="flex justify-between gap-2">
                    <span>
                      <span className="text-muted-foreground">{ev.minute}&apos;</span>{" "}
                      {ev.scorerName}
                      {ev.assistName ? (
                        <span className="text-muted-foreground"> ({ev.assistName})</span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {ev.team === "home" ? home.short : away.short}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!played ? (
            <button
              type="button"
              onClick={handleNavigateToMatch}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:brightness-110 transition shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
            >
              <Zap className="h-4 w-4" />
              Simular partido
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDismiss}
              className="w-full py-3 rounded-lg border border-border bg-card font-bold text-sm hover:border-primary/60 transition"
            >
              Continuar
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

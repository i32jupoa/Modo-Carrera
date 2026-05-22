import { useState, useEffect } from "react";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/components/TeamLogo";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

// Lightning icon component
function LightningIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M13 2L3 14H12L11 22L21 10H12L13 2Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Soccer ball icon component
function SoccerBallIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="currentColor" strokeWidth="1"/>
      <path
        d="M12 2L15 8L12 12L9 8L12 2Z"
        fill="currentColor"
      />
      <path
        d="M12 22L9 16L12 12L15 16L12 22Z"
        fill="currentColor"
      />
      <path
        d="M2 12L8 9L12 12L8 15L2 12Z"
        fill="currentColor"
      />
      <path
        d="M22 12L16 15L12 12L16 9L22 12Z"
        fill="currentColor"
      />
      <path
        d="M4 4L8 8L12 12L8 16L4 4Z"
        fill="currentColor"
      />
      <path
        d="M20 4L16 8L12 12L16 16L20 4Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Trophy icon component
function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Trophy cup */}
      <path
        d="M5 6C5 4 6 3 8 3H16C18 3 19 4 19 6V8C19 11 17 13 15 13H9C7 13 5 11 5 8V6Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Trophy handles */}
      <path
        d="M5 6C3 6 2 7 2 9C2 11 3 12 5 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M19 6C21 6 22 7 22 9C22 11 21 12 19 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Trophy stem */}
      <path
        d="M9 13V16H15V13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Trophy base */}
      <path
        d="M7 16H17"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 16V18H16V16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Star on trophy */}
      <path
        d="M12 5L13.5 8H16.5L14 10L15 13L12 11L9 13L10 10L7.5 8H10.5L12 5Z"
        fill="currentColor"
      />
    </svg>
  );
}

interface CupDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  round: string;
  teams: string[];
  league: string;
  onComplete: (matchups: [string, string][]) => void;
}

export function CupDrawModal({ isOpen, onClose, round, teams, league, onComplete }: CupDrawModalProps) {
  const [mode, setMode] = useState<"select" | "quick" | "interactive">("select");
  const [quickMatchups, setQuickMatchups] = useState<[string, string][]>([]);
  const [interactiveMatchups, setInteractiveMatchups] = useState<[string, string][]>([]);
  const [drawnTeams, setDrawnTeams] = useState<string[]>([]);
  const [remainingTeams, setRemainingTeams] = useState<string[]>([]);
  const [currentHome, setCurrentHome] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [drawInterval, setDrawInterval] = useState<NodeJS.Timeout | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode("select");
      setQuickMatchups([]);
      setInteractiveMatchups([]);
      setDrawnTeams([]);
      setRemainingTeams(teams);
      setCurrentHome(null);
      setIsAnimating(false);
      if (drawInterval) {
        clearInterval(drawInterval);
        setDrawInterval(null);
      }
    }
  }, [isOpen, teams]);

  const roundNames: Record<string, string> = {
    R32: "Treintaidosavos",
    R16: "Dieciseisavos",
    Octavos: "Octavos de Final",
    QF: "Cuartos de Final",
    SF: "Semifinales",
    Final: "Final",
  };

  // Determine round name based on number of teams
  const getRoundName = (teamCount: number): string => {
    switch (teamCount) {
      case 2: return "Final";
      case 4: return "Semifinales";
      case 8: return "Cuartos de Final";
      case 16: return "Octavos de Final";
      case 32: return "Dieciseisavos";
      case 64: return "Treintaidosavos";
      default: return roundNames[round] || round;
    }
  };

  const roundLabel = getRoundName(teams.length);

  // Quick Sim: Instantly pair all teams randomly
  const handleQuickSim = () => {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const matchups: [string, string][] = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      matchups.push([shuffled[i], shuffled[i + 1]]);
    }
    setQuickMatchups(matchups);
    setMode("quick");
  };

  // Interactive Draw: Step-by-step animation
  const startInteractiveDraw = () => {
    setMode("interactive");
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    setDrawnTeams(shuffled);
    setRemainingTeams([...teams]);
    setCurrentHome(null);
    setInteractiveMatchups([]);
    setIsAnimating(true);

    let ballIndex = 0;
    const interval = setInterval(() => {
      if (ballIndex >= shuffled.length) {
        setIsAnimating(false);
        clearInterval(interval);
        setDrawInterval(null);
        return;
      }

      if (ballIndex % 2 === 0) {
        // Even index = Home team
        setCurrentHome(shuffled[ballIndex]);
      } else {
        // Odd index = Away team, create matchup
        const home = shuffled[ballIndex - 1];
        const away = shuffled[ballIndex];
        setInteractiveMatchups(prev => [...prev, [home, away]]);
        setCurrentHome(null);
        // Remove both teams from remaining when matchup is complete
        setRemainingTeams(prev => prev.filter(t => t !== home && t !== away));
      }

      ballIndex++;
    }, 1500); // 1.5 seconds per ball

    setDrawInterval(interval);
  };

  const stopInteractiveDraw = () => {
    if (drawInterval) {
      clearInterval(drawInterval);
      setDrawInterval(null);
    }
    setIsAnimating(false);
  };

  const handleComplete = () => {
    const finalMatchups = mode === "quick" ? quickMatchups : interactiveMatchups;
    if (finalMatchups.length > 0) {
      onComplete(finalMatchups);
      onClose();
    }
  };

  const getTeam = (id: string) => teamById(id);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => {
      // Only allow closing if a draw has been completed
      if (!open && (quickMatchups.length > 0 || interactiveMatchups.length > 0)) {
        onClose();
      }
    }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl max-h-[90vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg"
          )}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h2 className="text-2xl font-black">
            Sorteo de Copa Nacional - {roundLabel}
          </h2>
        </div>

        {mode === "select" && (
          <div className="space-y-6 py-6">
            <p className="text-muted-foreground">
              {teams.length} equipos clasificados para esta ronda. Elige cómo quieres realizar el sorteo:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                onClick={handleQuickSim}
                variant="outline"
                className="h-32 flex flex-col items-center justify-center gap-3 text-lg font-bold hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                <LightningIcon className="w-12 h-12" />
                Simulación Rápida
              </Button>

              {round !== "Final" && (
                <Button
                  onClick={startInteractiveDraw}
                  variant="outline"
                  className="h-32 flex flex-col items-center justify-center gap-3 text-lg font-bold hover:border-primary/60"
                >
                  <SoccerBallIcon className="w-12 h-12" />
                  Simular Sorteo
                </Button>
              )}
            </div>

            <div className="bg-muted/50 p-4 rounded-lg text-sm text-muted-foreground space-y-2">
              <p><strong>Simulación Rápida:</strong> Empareja todos los equipos instantáneamente de forma aleatoria.</p>
              <p><strong>Simular Sorteo:</strong> Revela los equipos uno por uno con animación para crear suspense.</p>
            </div>
          </div>
        )}

        {mode === "quick" && quickMatchups.length > 0 && (
          <div className="space-y-6 py-6">
            <h3 className="font-bold text-lg">Emparejamientos Generados</h3>
            <div className="grid gap-2">
              {quickMatchups.map(([home, away], idx) => {
                const homeTeam = getTeam(home);
                const awayTeam = getTeam(away);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3 flex-1 justify-end">
                      <TeamLogo teamName={homeTeam?.name || home} leagueName={getLeagueName(homeTeam?.league || "")} size={24} />
                      <span className="font-semibold">{homeTeam?.name || home}</span>
                    </div>
                    <div className="px-4 text-muted-foreground font-black">VS</div>
                    <div className="flex items-center gap-3 flex-1 justify-start">
                      <span className="font-semibold">{awayTeam?.name || away}</span>
                      <TeamLogo teamName={awayTeam?.name || away} leagueName={getLeagueName(awayTeam?.league || "")} size={24} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 justify-end">
              <Button onClick={handleComplete} className="glow-neon">
                Confirmar Emparejamientos
              </Button>
            </div>
          </div>
        )}

        {mode === "interactive" && (
          <div className="space-y-6 py-6">
            <h3 className="font-bold text-lg">Sorteo Interactivo</h3>

            {/* Draw Pot Visualization */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-full w-32 h-32 mx-auto flex items-center justify-center border-4 border-gray-700 shadow-xl">
              {isAnimating ? (
                <TrophyIcon className="w-16 h-16 text-white" />
              ) : currentHome ? (
                <div className="text-center px-2">
                  <div className="text-2xl font-black text-white">🏠</div>
                  <div className="text-xs text-white mt-1">Local</div>
                </div>
              ) : (
                <SoccerBallIcon className="w-16 h-16" />
              )}
            </div>

            {currentHome && (
              <div className="text-center py-4">
                <div className="inline-flex items-center gap-2 bg-primary/20 px-4 py-2 rounded-lg">
                  <span className="text-sm text-muted-foreground">Equipo Local:</span>
                  <span className="font-bold">{getTeam(currentHome)?.name || currentHome}</span>
                </div>
              </div>
            )}

            {/* Dynamic Matchup Table */}
            {interactiveMatchups.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground">Emparejamientos:</h4>
                <div className="grid gap-2">
                  {interactiveMatchups.map(([home, away], idx) => {
                    const homeTeam = getTeam(home);
                    const awayTeam = getTeam(away);
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-muted/20 rounded-lg animate-in slide-in-from-bottom-2 duration-300"
                      >
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <TeamLogo teamName={homeTeam?.name || home} leagueName={getLeagueName(homeTeam?.league || "")} size={24} />
                          <span className="font-semibold text-sm">{homeTeam?.name || home}</span>
                        </div>
                        <div className="px-3 text-muted-foreground font-bold text-sm">VS</div>
                        <div className="flex items-center gap-2 flex-1 justify-start">
                          <span className="font-semibold text-sm">{awayTeam?.name || away}</span>
                          <TeamLogo teamName={awayTeam?.name || away} leagueName={getLeagueName(awayTeam?.league || "")} size={24} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Remaining Teams */}
            {remainingTeams.length > 0 && (
              <div className="bg-muted/30 p-3 rounded-lg">
                <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                  Equipos restantes en el bombo: {remainingTeams.length}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {remainingTeams.map((teamId) => {
                    const team = getTeam(teamId);
                    return (
                      <div
                        key={teamId}
                        className="flex items-center gap-2 bg-card px-2 py-1 rounded border border-border"
                      >
                        <TeamLogo teamName={team?.name || teamId} leagueName={getLeagueName(team?.league || "")} size={20} />
                        <span className="text-xs">{team?.name || teamId}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {interactiveMatchups.length > 0 && !isAnimating && interactiveMatchups.length * 2 === teams.length && (
              <div className="flex gap-3 justify-end">
                <Button onClick={handleComplete} className="glow-neon">
                  Confirmar Emparejamientos
                </Button>
              </div>
            )}
          </div>
        )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

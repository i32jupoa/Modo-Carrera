import React, { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { loadSave, getMyRecentResults } from "@/lib/store";
import { teamById } from "@/data/teams";

export default function MainActionCards({
  hasSave,
  resetGame,
  loading,
  onContinueGame,
}: {
  hasSave: boolean;
  resetGame: () => void;
  loading: boolean;
  onContinueGame?: (save: any) => void;
}) {
  const recentResults = useMemo(() => {
    const save = hasSave ? loadSave() : null;
    if (!save) return [];
    return getMyRecentResults(save, 5);
  }, [hasSave]);
  return (
    <div className="mt-8">
      <div
        className="flex items-center justify-center gap-6 flex-wrap animate-fade-in"
      >
        {hasSave ? (
          <div 
            onClick={() => {
              const save = loadSave();
              if (save && onContinueGame) {
                onContinueGame(save);
              }
            }}
            className="continue-card-aaa group max-w-3xl w-full interactive-hover cursor-pointer"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-700 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10" />

            <div className="relative z-10 flex items-center justify-between gap-8">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-white/50 mb-3">Continuar carrera</div>

                <div className="text-4xl font-black mb-2">Tu carrera guardada</div>

                <div className="flex items-center gap-3 text-white/60 text-sm">
                  {recentResults.length > 0 ? (
                    <span>Últimos partidos</span>
                  ) : (
                    <span>Próximo reto te espera</span>
                  )}
                </div>

                {recentResults.length > 0 && (
                  <div className="flex gap-2 mt-5">
                    {recentResults.map((f, i) => {
                      const r = f.result!;
                      const teamGoals = f.homeId === loadSave()!.myTeamId ? r.homeGoals : r.awayGoals;
                      const oppGoals = f.homeId === loadSave()!.myTeamId ? r.awayGoals : r.homeGoals;
                      const outcome = teamGoals > oppGoals ? 'V' : teamGoals < oppGoals ? 'D' : 'E';
                      const outcomeColor = outcome === 'V' ? 'bg-green-500/30 text-green-300 border border-green-500/40' : outcome === 'D' ? 'bg-red-500/30 text-red-300 border border-red-500/40' : 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/40';

                      return (
                        <div
                          key={f.id}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${outcomeColor} animate-slide-in`}
                          style={{ animationDelay: `${i * 0.05}s` }}
                          title={`${outcome === 'V' ? 'Victoria' : outcome === 'D' ? 'Derrota' : 'Empate'}: ${teamGoals}-${oppGoals}`}
                        >
                          {outcome}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="text-right">
                <div className="text-sm text-white/50 mb-2">Progreso</div>
                <div className="text-2xl font-black">Continuar →</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="continue-card-aaa max-w-3xl w-full p-8 text-center">
            <div className="text-lg font-bold mb-2">No hay ninguna carrera activa.</div>
            <div className="text-sm text-white/60 mb-4">Crea una carrera y empieza a construir tu dinastía.</div>
            <AlertDialog>
                <AlertDialogTrigger asChild>
                <button className="px-6 py-3 rounded-lg glass text-foreground font-semibold hover:bg-white/10 transition text-lg interactive-hover">Nueva partida</button>
              </AlertDialogTrigger>

              <AlertDialogContent className="glass-dark">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-2xl font-black gradient-text-premium">¿Crear nueva partida?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">Se generará una nueva carrera desde cero.</AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel className="glass">Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={resetGame} className="button-premium">Crear y empezar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  );
}

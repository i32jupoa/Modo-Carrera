import React from "react";
import { Play, X, Save, Trophy, Calendar } from "lucide-react";

export default function FloatingContinuePanel({
  visible,
  teamName,
  teamColor,
  leagueName,
  season,
  position,
  points,
  matchesPlayed,
  onContinue,
  onDismiss,
}: {
  visible: boolean;
  teamName?: string;
  teamColor?: string;
  leagueName?: string;
  season?: string;
  position?: number;
  points?: number;
  matchesPlayed?: number;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const color = teamColor || "#6366f1";

  return (
    <>
      {visible && (
        <div
          className="fixed bottom-20 right-6 z-40 w-[300px] rounded-2xl border border-white/15 backdrop-blur-2xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] overflow-hidden animate-slide-in-right"
          style={{
            background: `linear-gradient(135deg, ${color}30 0%, rgba(10,10,20,0.92) 60%)`,
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />

          <div className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-white/70" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-bold">Carrera en curso</span>
              </div>
              <button
                onClick={onDismiss}
                className="text-white/40 hover:text-white/80 transition"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {teamName && (
              <div className="text-lg font-black text-white mb-1 leading-tight">{teamName}</div>
            )}
            <div className="text-xs text-white/60 mb-3">
              {leagueName && <span>{leagueName}</span>}
              {season && <span> · {season}</span>}
            </div>
            
            {(position !== undefined || points !== undefined || matchesPlayed !== undefined) && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {position !== undefined && (
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Posición</div>
                    <div className="text-lg font-black text-white">{position}º</div>
                  </div>
                )}
                {points !== undefined && (
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Puntos</div>
                    <div className="text-lg font-black text-white">{points}</div>
                  </div>
                )}
                {matchesPlayed !== undefined && (
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Partidos</div>
                    <div className="text-lg font-black text-white">{matchesPlayed}</div>
                  </div>
                )}
              </div>
            )}
            
            <div className="text-xs text-white/60 mb-4">Tu temporada te espera. Continúa donde lo dejaste.</div>

            <button
              onClick={onContinue}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm text-white transition hover:brightness-125"
              style={{ background: `linear-gradient(90deg, ${color}, ${color}cc)` }}
            >
              <Play className="h-4 w-4 fill-white" />
              Continuar partida
            </button>
          </div>
        </div>
      )}
    </>
  );
}

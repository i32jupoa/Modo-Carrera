import React from "react";
import { Save, Rocket } from "lucide-react";

export default function MainActionCards({
  savedGamesCount,
  loading,
  onLoadGame,
  onNewGame,
}: {
  savedGamesCount: number;
  loading: boolean;
  onLoadGame: () => void;
  onNewGame: () => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto mt-10 animate-fade-in">
      <button
        onClick={onLoadGame}
        disabled={loading}
        className="continue-card-aaa group text-left relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-700 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/50 mb-3">Continuar</div>
            <div className="text-3xl font-black mb-2">Cargar partida</div>
            <div className="text-sm text-white/60">
              {savedGamesCount === 0
                ? "No tienes partidas guardadas"
                : `${savedGamesCount} partida${savedGamesCount === 1 ? "" : "s"} guardada${savedGamesCount === 1 ? "" : "s"}`}
            </div>
          </div>
          <div className="shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 grid place-items-center group-hover:scale-110 transition-transform duration-300">
            <Save className="h-7 w-7 text-primary" />
          </div>
        </div>
      </button>

      <button
        onClick={onNewGame}
        disabled={loading}
        className="continue-card-aaa group text-left relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-700 bg-gradient-to-bl from-accent/10 via-primary/5 to-transparent" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/50 mb-3">Comenzar</div>
            <div className="text-3xl font-black mb-2">Nueva Partida</div>
            <div className="text-sm text-white/60">
              Elige un club y empieza tu camino hacia la gloria
            </div>
          </div>
          <div className="shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/30 grid place-items-center group-hover:scale-110 transition-transform duration-300">
            <Rocket className="h-7 w-7 text-accent" />
          </div>
        </div>
      </button>
    </div>
  );
}

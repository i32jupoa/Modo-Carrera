import { ArrowRight, FolderOpen, Plus } from "lucide-react";

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
    <div className="hero-actions mt-8 grid w-full max-w-[760px] grid-cols-1 gap-3 sm:grid-cols-[1.15fr_1fr]">
      <button
        type="button"
        onClick={onNewGame}
        disabled={loading}
        className="hero-action hero-action-primary group text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="hero-action-icon grid shrink-0 place-items-center" aria-hidden>
          <Plus className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <span className="hero-action-copy flex min-w-0 flex-1 flex-col">
          <span className="hero-action-overline">EMPEZAR DE CERO</span>
          <span className="hero-action-title">Nueva carrera</span>
          <span className="hero-action-description">Elige tu club y toma el mando</span>
        </span>
        <ArrowRight className="hero-action-arrow h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
      </button>

      <button
        type="button"
        onClick={onLoadGame}
        disabled={loading}
        className="hero-action hero-action-secondary group text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="hero-action-icon grid shrink-0 place-items-center" aria-hidden>
          <FolderOpen className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="hero-action-copy flex min-w-0 flex-1 flex-col">
          <span className="hero-action-overline">VOLVER AL BANQUILLO</span>
          <span className="hero-action-title">Cargar partida</span>
          <span className="hero-action-description">
            {savedGamesCount === 0
              ? "Todavía no hay carreras guardadas"
              : `${savedGamesCount} carrera${savedGamesCount === 1 ? "" : "s"} guardada${savedGamesCount === 1 ? "" : "s"}`}
          </span>
        </span>
        <ArrowRight className="hero-action-arrow h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
      </button>
    </div>
  );
}

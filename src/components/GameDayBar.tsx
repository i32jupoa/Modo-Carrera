import { FastForward, Trophy } from "lucide-react";
import { usePlayersStore } from "@/store/playersStore";
import { formatGameDate } from "@/lib/transferWindows";
import { loadSave } from "@/lib/store";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

export function GameDayBar() {
  const currentDate = usePlayersStore((s) => s.currentDate);
  const advanceTime = usePlayersStore((s) => s.advanceTime);
  const pendingMatch = usePlayersStore((s) => s.pendingUserMatch);
  const pendingCupDraw = usePlayersStore((s) => s.pendingCupDraw);
  const pendingUclDraw = usePlayersStore((s) => s.pendingUclDraw);
  const [hasSave, setHasSave] = useState(false);

  useEffect(() => {
    setHasSave(!!loadSave());
  }, [currentDate]);

  if (!hasSave) return null;

  return (
    <div className="ml-auto flex items-center gap-3">
      {pendingUclDraw && (
        <Link
          to="/calendar"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/40 text-blue-400 text-xs font-semibold hover:bg-blue-500/25 transition"
        >
          <Trophy className="h-3.5 w-3.5 shrink-0" />
          🏆 Sorteo UCL · Ir al Calendario
        </Link>
      )}
      {pendingCupDraw && (
        <Link
          to="/calendar"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/15 border border-yellow-500/40 text-yellow-400 text-xs font-semibold hover:bg-yellow-500/25 transition"
        >
          <Trophy className="h-3.5 w-3.5 shrink-0" />
          ¡Sorteo de copa! Ir al Calendario
        </Link>
      )}
      <span className="hidden sm:inline text-xs text-muted-foreground capitalize truncate max-w-[12rem]">
        {formatGameDate(currentDate)}
      </span>
      <button
        type="button"
        disabled={!!pendingMatch || !!pendingCupDraw || !!pendingUclDraw}
        onClick={() => advanceTime(1)}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition shadow-[0_0_12px_hsl(var(--primary)/0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FastForward className="h-4 w-4" />
        Avanzar día
      </button>
    </div>
  );
}

import { FastForward } from "lucide-react";
import { usePlayersStore } from "@/store/playersStore";
import { formatGameDate } from "@/lib/transferWindows";
import { loadSave } from "@/lib/store";
import { useEffect, useState } from "react";

export function GameDayBar() {
  const currentDate = usePlayersStore((s) => s.currentDate);
  const advanceTime = usePlayersStore((s) => s.advanceTime);
  const pendingMatch = usePlayersStore((s) => s.pendingUserMatch);
  const [hasSave, setHasSave] = useState(false);

  useEffect(() => {
    setHasSave(!!loadSave());
  }, [currentDate]);

  if (!hasSave) return null;

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="hidden sm:inline text-xs text-muted-foreground capitalize truncate max-w-[12rem]">
        {formatGameDate(currentDate)}
      </span>
      <button
        type="button"
        disabled={!!pendingMatch}
        onClick={() => advanceTime(1)}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition shadow-[0_0_12px_hsl(var(--primary)/0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FastForward className="h-4 w-4" />
        Avanzar día
      </button>
    </div>
  );
}

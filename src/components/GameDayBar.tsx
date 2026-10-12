import { FastForward, Trophy } from "lucide-react";
import { usePlayersStore } from "@/store/playersStore";
import { formatGameDate } from "@/lib/transferWindows";
import { loadSave } from "@/lib/store";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getSeasonRolloverDates, isSeasonRolloverDue } from "@/lib/season/seasonRolloverCore";
import { useCalendarJumpState } from "@/lib/calendarJumpState";
import { Link } from "@tanstack/react-router";

const EMPTY_PENDING_DRAW_QUEUE: string[] = [];

export function GameDayBar() {
  const currentDate = usePlayersStore((s) => s.currentDate);
  const advanceTime = usePlayersStore((s) => s.advanceTime);
  const pendingMatch = usePlayersStore((s) => s.pendingUserMatch);
  const pendingCupDraw = usePlayersStore((s) => s.pendingCupDraw);
  const pendingUclDraw = usePlayersStore((s) => s.pendingUclDraw);
  const pendingDrawQueue = usePlayersStore((s) => (s.pendingDrawQueue ?? EMPTY_PENDING_DRAW_QUEUE) as string[]);
  const [hasSave, setHasSave] = useState(false);
  const [rolloverBusy, setRolloverBusy] = useState(false);
  const rolloverPromiseRef = useRef<Promise<boolean> | null>(null);

  const ensureSeasonRollover = useCallback(async (): Promise<boolean> => {
    if (rolloverPromiseRef.current) return rolloverPromiseRef.current;
    const promise = (async () => {
      const save = loadSave();
      if (!save) return false;
      const liveDate = usePlayersStore.getState().currentDate;
      const effectiveSave = liveDate > String(save.currentDate ?? "")
        ? { ...save, currentDate: liveDate }
        : save;
      if (!isSeasonRolloverDue(effectiveSave)) return false;

      setRolloverBusy(true);
      try {
        const { advanceSeasonIfDue } = await import("@/lib/season/seasonRollover");
        const nextSave = await advanceSeasonIfDue(effectiveSave);
        if (nextSave && nextSave.season !== save.season) {
          toast.success(`Temporada ${nextSave.season} preparada`, {
            description: "Se han actualizado las ligas, los calendarios y las competiciones.",
          });
          return true;
        }
        return false;
      } catch (error) {
        console.error("[GameDayBar] No se pudo cerrar automáticamente la temporada:", error);
        toast.error("No se ha podido cerrar la temporada", {
          description: error instanceof Error ? error.message : "Consulta la consola para ver el error.",
        });
        return false;
      } finally {
        setRolloverBusy(false);
      }
    })();
    rolloverPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      if (rolloverPromiseRef.current === promise) rolloverPromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    setHasSave(!!loadSave());
    // The calendar owns its checkpointed rollover while a multi-day jump is
    // active. Never let the global header race that transaction.
    if (useCalendarJumpState.getState().active) return;
    const save = loadSave();
    if (!save || pendingMatch) return;
    const effectiveDate = currentDate > String(save.currentDate ?? "") ? currentDate : String(save.currentDate ?? "");
    if (!isSeasonRolloverDue({ ...save, currentDate: effectiveDate })) return;
    const cutoff = getSeasonRolloverDates(save.season).endDate;
    const hasQueuedDraw = pendingCupDraw || pendingUclDraw || pendingDrawQueue.length > 0;
    // At the exact cutoff let normal draw processing complete first. A legacy
    // save already past 30 June, however, must be recoverable even if stale draw
    // flags survived from the previous season.
    if (hasQueuedDraw && effectiveDate <= cutoff) return;
    void ensureSeasonRollover();
  }, [currentDate, pendingMatch, pendingCupDraw, pendingUclDraw, pendingDrawQueue, ensureSeasonRollover]);

  if (!hasSave) return null;

  const activeDraw = pendingDrawQueue[0] ?? (pendingCupDraw ? "cup" : pendingUclDraw);
  const isUel = typeof activeDraw === "string" && activeDraw.startsWith("uel-");
  const isUecl = typeof activeDraw === "string" && activeDraw.startsWith("uecl-");
  const isCup = activeDraw === "cup";

  return (
    <div className="ml-auto flex items-center gap-3">
      {activeDraw && (
        <Link
          to="/calendar"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            isCup
              ? "bg-yellow-500/15 border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/25"
              : isUel
                ? "bg-orange-500/15 border border-orange-500/40 text-orange-400 hover:bg-orange-500/25"
                : isUecl
                  ? "bg-green-500/15 border border-green-500/40 text-green-400 hover:bg-green-500/25"
                  : "bg-blue-500/15 border border-blue-500/40 text-blue-400 hover:bg-blue-500/25"
          }`}
        >
          <Trophy className="h-3.5 w-3.5 shrink-0" />
          {isCup
            ? "Sorteo de copa"
            : isUel
              ? "Sorteo Europa League"
              : isUecl
                ? "Sorteo Conference League"
                : "Sorteo UCL"} · Ir al Calendario
        </Link>
      )}
      <span className="hidden sm:inline text-xs text-muted-foreground capitalize truncate max-w-[12rem]">
        {formatGameDate(currentDate)}
      </span>
      <button
        type="button"
        disabled={!!pendingMatch || !!activeDraw || rolloverBusy}
        onClick={async () => {
          if (useCalendarJumpState.getState().active) return;
          const save = loadSave();
          const liveDate = usePlayersStore.getState().currentDate;
          const effectiveDate = save && liveDate > String(save.currentDate ?? "") ? liveDate : String(save?.currentDate ?? liveDate);
          if (save && isSeasonRolloverDue({ ...save, currentDate: effectiveDate })) {
            await ensureSeasonRollover();
            return;
          }
          advanceTime(1);
          // advanceTime can arrive at 30 June; explicitly check the newly reached day.
          await ensureSeasonRollover();
        }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition shadow-[0_0_12px_hsl(var(--primary)/0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FastForward className="h-4 w-4" />
        Avanzar día
      </button>
    </div>
  );
}

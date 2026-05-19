import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { loadSave } from "@/lib/store";
import { monthDays, fmtMonth, COMP_COLORS } from "@/lib/calendar";
import { usePlayersStore } from "@/store/playersStore";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";
import {
  isSummerTransferWindow,
  isWinterTransferWindow,
  isTransferWindowDay,
  parseDateOnly,
  toDateOnly,
} from "@/lib/transferWindows";
import {
  involvesTeam,
  unplayedOnDate,
} from "@/lib/matchEngine";
import {
  opponentLabel,
  scheduleFixturesByDate,
  userFixtures,
} from "@/lib/leagueSchedule";
import { ChevronLeft, ChevronRight, FastForward } from "lucide-react";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function CalendarPage() {
  const navigate = useNavigate();
  const currentDateIso = usePlayersStore((s) => s.currentDate);
  const advanceTime = usePlayersStore((s) => s.advanceTime);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const fixtures = usePlayersStore((s) => s.fixtures);
  const ensureLeagueSchedule = usePlayersStore((s) => s.ensureLeagueSchedule);
  const pendingMatch = usePlayersStore((s) => s.pendingUserMatch);
  const { isMarketOpen } = useTransferMarket();

  const gameDate = useMemo(
    () => parseDateOnly(currentDateIso),
    [currentDateIso],
  );

  const [browseMonth, setBrowseMonth] = useState<{
    year: number;
    month: number;
  } | null>(null);

  useEffect(() => {
    const save = loadSave();
    if (!save) {
      navigate({ to: "/" });
      return;
    }
    ensureLeagueSchedule();
  }, [navigate, ensureLeagueSchedule]);

  useLayoutEffect(() => {
    setBrowseMonth(null);
  }, [currentDateIso]);

  const viewYear = browseMonth?.year ?? gameDate.getFullYear();
  const viewMonth = browseMonth?.month ?? gameDate.getMonth();
  const calendarKey = `${currentDateIso}-${viewYear}-${viewMonth}`;

  const grid = useMemo(
    () => monthDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const myFixtures = useMemo(
    () => (myTeamId ? userFixtures(fixtures, myTeamId) : []),
    [fixtures, myTeamId],
  );

  const fixturesByDate = useMemo(
    () => scheduleFixturesByDate(myFixtures),
    [myFixtures],
  );

  function prevMonth() {
    if (viewMonth === 0) {
      setBrowseMonth({ year: viewYear - 1, month: 11 });
    } else {
      setBrowseMonth({ year: viewYear, month: viewMonth - 1 });
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setBrowseMonth({ year: viewYear + 1, month: 0 });
    } else {
      setBrowseMonth({ year: viewYear, month: viewMonth + 1 });
    }
  }

  function goToToday() {
    setBrowseMonth(null);
  }

  const viewDate = new Date(viewYear, viewMonth, 1);
  const onCurrentMonth =
    viewYear === gameDate.getFullYear() && viewMonth === gameDate.getMonth();

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black">Calendario</h1>
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            Día actual del juego · avanza el tiempo para abrir ventanas de mercado
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!pendingMatch}
            onClick={() => advanceTime(1)}
            className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition shadow-[0_0_12px_hsl(var(--primary)/0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Avanzar día
          </button>
          <button
            type="button"
            disabled={!!pendingMatch}
            onClick={() => advanceTime(7)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-xs font-bold hover:border-primary/60 transition"
          >
            <FastForward className="h-3.5 w-3.5" />
            +7 días
          </button>
        </div>
      </div>

      <MarketStatusBanner className="mb-6" />

      <div className="panel-glow p-4" key={calendarKey}>
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={prevMonth}
            className="p-2 rounded-lg border border-border hover:border-primary/60 transition"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <h2 className="text-lg font-black capitalize">{fmtMonth(viewDate)}</h2>
            {!onCurrentMonth && (
              <button
                type="button"
                onClick={goToToday}
                className="text-xs text-primary hover:underline mt-0.5"
              >
                Ir al mes actual
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={nextMonth}
            className="p-2 rounded-lg border border-border hover:border-primary/60 transition"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="text-center text-[0.65rem] font-bold uppercase text-muted-foreground py-1"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.map((day) => {
            const inMonth = day.getMonth() === viewMonth;
            const iso = toDateOnly(day);
            const isToday = iso === currentDateIso;
            const isWindow =
              isSummerTransferWindow(day) || isWinterTransferWindow(day);
            const windowHighlight =
              isMarketOpen && isTransferWindowDay(day, gameDate);
            const dayFixtures = fixturesByDate.get(iso) ?? [];

            return (
              <div
                key={iso + String(inMonth)}
                className={[
                  "min-h-[4.5rem] rounded-md border p-1 flex flex-col items-stretch justify-start gap-0.5 transition",
                  inMonth ? "border-border/60 bg-card/40" : "border-transparent opacity-30",
                  isWindow && inMonth ? "bg-emerald-500/5 border-emerald-500/20" : "",
                  isToday
                    ? "ring-2 ring-primary border-primary bg-primary/10 font-black z-[1]"
                    : "",
                ].join(" ")}
              >
                <span
                  className={`text-xs text-center ${isToday ? "text-primary" : inMonth ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {day.getDate()}
                </span>
                {isToday && (
                  <span className="text-[0.55rem] uppercase tracking-wider text-primary font-bold text-center">
                    Hoy
                  </span>
                )}
                <div className="flex flex-col gap-0.5 w-full mt-auto">
                  {inMonth &&
                    myTeamId &&
                    dayFixtures.map((f) => (
                      <span
                        key={f.id}
                        className="block w-full text-[0.5rem] leading-tight font-bold text-center px-0.5 py-0.5 rounded bg-red-600/90 text-white truncate"
                        title={`Jornada ${f.matchday}`}
                      >
                        Liga: vs {opponentLabel(f, myTeamId)}
                      </span>
                    ))}
                  {windowHighlight && inMonth && !isToday && dayFixtures.length === 0 && (
                    <span
                      className="mx-auto w-1.5 h-1.5 rounded-full bg-emerald-400/80"
                      title="Ventana de mercado"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-border/40 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded ring-2 ring-primary bg-primary/20" />
            Día actual
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" />
            Ventana de fichajes
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-red-600/90" />
            Partido de liga
          </span>
          <span className="inline-flex items-center gap-2 opacity-60">
            <span className={`w-3 h-3 rounded ${COMP_COLORS.ucl.bg} border ${COMP_COLORS.ucl.border}`} />
            Champions (próximamente)
          </span>
        </div>
      </div>
    </div>
  );
}

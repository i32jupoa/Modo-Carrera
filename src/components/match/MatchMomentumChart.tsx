import { motion } from "framer-motion";
import {
  buildMatchMomentumTimeline,
  type MomentumHistorySample,
  type MomentumMinuteStat,
} from "@/lib/matchMomentumTimeline";
import { formatMatchMinuteWithMark, getMatchMinuteElapsedValue } from "@/lib/matchTime";

type TeamSide = "home" | "away";

export type MatchMomentumChartProps = {
  minute: number;
  homeLabel: string;
  awayLabel: string;
  homeName?: string;
  awayName?: string;
  momentumHistory?: MomentumHistorySample[];
  userSide?: TeamSide;
  minuteStats?: MomentumMinuteStat[];
  events?: any[];
  highlights?: any[];
  moments?: any[];
  matchPeriod?: string | null;
  stoppagePeriod?: string | null;
  stoppageElapsed?: number | string | null;
  homeColor?: string;
  awayColor?: string;
  completed?: boolean;
};

/** Shared live/final momentum chart. Its source data is stored on the fixture result. */
export function MatchMomentumChart({
  minute,
  homeLabel,
  awayLabel,
  homeName,
  awayName,
  momentumHistory = [],
  userSide = "home",
  minuteStats = [],
  events = [],
  highlights = [],
  moments = [],
  matchPeriod,
  stoppagePeriod,
  stoppageElapsed,
  homeColor = "#2D8CFF",
  awayColor = "#F43F75",
  completed = false,
}: MatchMomentumChartProps) {
  const clockContext = { matchPeriod, stoppagePeriod, stoppageElapsed };
  const currentElapsedMinute = getMatchMinuteElapsedValue(minute, clockContext) ?? minute;
  const chartEndMinute = Math.max(90, currentElapsedMinute, matchPeriod === "extraTime" ? 120 : 0);
  const bars = buildMatchMomentumTimeline({
    currentMinute: currentElapsedMinute,
    scaleMinute: chartEndMinute,
    userSide,
    momentumHistory,
    minuteStats,
    events,
    highlights,
    moments,
  });
  const currentBar = [...bars].reverse().find((bar) => bar.active && bar.side);
  const dominanceLabel = currentBar?.side === "home"
    ? `${homeLabel} ${completed ? "dominó el último tramo" : "domina ahora"}`
    : currentBar?.side === "away"
      ? `${awayLabel} ${completed ? "dominó el último tramo" : "domina ahora"}`
      : "Partido equilibrado";
  const ticks = chartEndMinute > 90
    ? [0, 15, 30, 45, 60, 75, 90, 105, 120].filter((tick) => tick <= chartEndMinute)
    : [0, 15, 30, 45, 60, 75, 90];
  const markerPosition = Math.max(0, Math.min(100, (currentElapsedMinute / chartEndMinute) * 100));
  const momentMarkers = (() => {
    const markers: Array<{ minute: number; side: TeamSide; symbol: string; label: string; key: string }> = [];
    const seen = new Set<string>();
    const add = (minuteValue: unknown, sideValue: unknown, type: string, detail = "") => {
      const minute = Math.floor(Number(minuteValue));
      const side = sideValue === "home" || sideValue === "away" ? sideValue : null;
      if (!side || !Number.isFinite(minute) || minute < 1 || minute > currentElapsedMinute) return;
      const normalized = type.toLowerCase();
      let symbol = "";
      let label = "";
      if (["penalty_goal", "penalty_scored"].includes(normalized)) { symbol = "⚽"; label = "Penalti convertido"; }
      else if (["goal", "free_kick_goal", "own_goal"].includes(normalized)) { symbol = "⚽"; label = "Gol"; }
      else if (["var_disallowed", "goal_disallowed"].includes(normalized)) { symbol = "🚫"; label = "Gol anulado"; }
      else if (["penalty_missed", "penalty_failed"].includes(normalized)) { symbol = "✕"; label = "Penalti fallado"; }
      else if (normalized === "woodwork") { symbol = "🥅"; label = "Remate al palo"; }
      if (!symbol) return;
      const key = `${minute}:${side}:${label}:${detail}`;
      if (seen.has(key)) return;
      seen.add(key);
      markers.push({ minute, side, symbol, label, key });
    };
    for (const event of events) add(event?.minute, event?.teamSide ?? event?.team, String(event?.type ?? ""), String(event?.detail ?? ""));
    for (const item of [...highlights, ...moments]) add(item?.minute, item?.teamSide ?? item?.team, String(item?.type ?? ""), String(item?.detail ?? ""));
    return markers.sort((a, b) => a.minute - b.minute);
  })();

  return (
    <section
      className="match-timeline-panel rounded-2xl border border-border/70 bg-card/65 p-3 backdrop-blur sm:p-4"
      aria-label="Dominio por minuto"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Dominio por minuto
        </div>
        <div className="text-[0.62rem] font-bold text-foreground/85">{dominanceLabel}</div>
      </div>

      <div className="mb-2 flex items-center justify-between gap-3 text-[0.62rem] font-bold">
        <span className="flex min-w-0 items-center gap-1.5 truncate" style={{ color: homeColor }}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: homeColor }} />
          <span className="truncate">{homeLabel}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 truncate" style={{ color: awayColor }}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: awayColor }} />
          <span className="truncate">{awayLabel}</span>
        </span>
      </div>

      <div className="relative h-[82px] overflow-hidden rounded-md bg-background/55">
        <div className="absolute inset-x-0 top-1/2 z-[1] h-px bg-border/90" />
        <div className="absolute inset-y-0 left-0 right-0 flex items-stretch gap-px">
          {bars.map((bar) => {
            const color = bar.side === "home" ? homeColor : bar.side === "away" ? awayColor : "transparent";
            return (
              <div
                key={bar.minute}
                className="relative min-w-0 flex-1"
                title={bar.active
                  ? `${formatMatchMinuteWithMark(bar.minute, { matchPeriod })} · ${bar.side === "home" ? homeName ?? homeLabel : bar.side === "away" ? awayName ?? awayLabel : "Equilibrado"}`
                  : `${bar.minute}' · Sin jugar`}
              >
                {bar.active && bar.side && (
                  <div
                    className={`absolute left-[16%] right-[16%] ${bar.side === "home" ? "bottom-1/2 rounded-t-[2px]" : "top-1/2 rounded-b-[2px]"}`}
                    style={{
                      height: `${Math.max(3, bar.intensity * 46)}%`,
                      backgroundColor: color,
                      opacity: 0.42 + bar.intensity * 0.56,
                      transition: "height 220ms ease, opacity 220ms ease",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {momentMarkers.map((item) => (
          <div
            key={item.key}
            className={`pointer-events-none absolute z-[3] flex h-4 min-w-4 -translate-x-1/2 items-center justify-center rounded-full border border-white/70 bg-slate-950/90 px-0.5 text-[9px] leading-none shadow ${item.side === "home" ? "top-0.5" : "bottom-0.5"}`}
            style={{ left: `${Math.max(1.5, Math.min(98.5, (item.minute / chartEndMinute) * 100))}%` }}
            title={`${formatMatchMinuteWithMark(item.minute, { matchPeriod })} · ${item.label} · ${item.side === "home" ? homeName ?? homeLabel : awayName ?? awayLabel}`}
            aria-label={`${item.label}, ${item.side === "home" ? homeLabel : awayLabel}`}
          >{item.symbol}</div>
        ))}
        <motion.div
          className="pointer-events-none absolute inset-y-0 z-[2] w-px bg-foreground/65 shadow-[0_0_5px_rgba(255,255,255,.35)]"
          animate={{ left: `${markerPosition}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 20 }}
        />
      </div>

      <div className="relative mt-1.5 h-3 text-[0.53rem] tabular-nums text-muted-foreground">
        {ticks.map((tick) => (
          <span key={tick} className="absolute -translate-x-1/2" style={{ left: `${(tick / chartEndMinute) * 100}%` }}>
            {tick === 0 ? "0'" : `${tick}'`}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[0.58rem] text-muted-foreground">
        <span>Inicio</span>
        <span>{completed ? "Partido finalizado" : `En directo · ${formatMatchMinuteWithMark(minute, clockContext)}`}</span>
        <span>{formatMatchMinuteWithMark(chartEndMinute, { matchPeriod })}</span>
      </div>
    </section>
  );
}

import { motion } from "framer-motion";

const ICONS: Record<string, string> = {
  goal: "⚽",
  penalty_goal: "⚽",
  free_kick_goal: "🎯",
  own_goal: "⚽",
  save: "🧤",
  woodwork: "💥",
  var_disallowed: "📺",
  penalty_missed: "❌",
  injury: "🚑",
  forced_sub: "🔁",
  big_chance: "🔥",
  corner: "🚩",
  red_card: "🟥",
  yellow_card: "🟨",
  chance: "⚡",
  counter: "⚡",
  dangerous_free_kick: "🎯",
};

type TimelineItem = {
  id: string;
  minute: number;
  icon: string;
  label: string;
  side?: "home" | "away";
  priority: number;
};

export function MatchTimeline({
  minute,
  homeLabel,
  awayLabel,
  homeName,
  awayName,
  events,
  cards,
  highlights,
  substitutions,
  moments = [],
  momentumHistory,
}: {
  minute: number;
  homeLabel: string;
  awayLabel: string;
  homeName?: string;
  awayName?: string;
  events: any[];
  cards: any[];
  highlights: any[];
  substitutions: any[];
  moments?: Array<{ id: string; minute: number; type: string; title: string; teamName?: string; playerName?: string; teamSide?: "home" | "away" }>;
  momentumHistory: Array<{ minute: number; value: number }>;
}) {
  const items: TimelineItem[] = [
    ...events.map((e: any, i) => ({
      id: `event-${e.minute}-${e.scorerId || i}`,
      minute: Number(e.minute) || 0,
      icon: ICONS[e.type] || "⚽",
      label: e.type === "own_goal" ? "Gol en propia" : e.scorerName || "Gol",
      side: e.team,
      priority: 5,
    })),
    ...cards.map((c: any, i) => ({
      id: `card-${c.minute}-${c.playerId || i}`,
      minute: Number(c.minute) || 0,
      icon: ICONS[c.cardType === "red" || c.isSecondYellow ? "red_card" : "yellow_card"] ?? "🟨",
      label: c.playerName || "Tarjeta",
      side: c.team,
      priority: c.cardType === "red" || c.isSecondYellow ? 5 : 2,
    })),
    ...highlights
      .filter((h: any) => h.type !== "save" || h.detail === "¡Paradón!")
      .map((h: any, i) => ({
        id: `highlight-${h.minute}-${h.type}-${h.playerId || i}`,
        minute: Number(h.minute) || 0,
        icon: ICONS[h.type] || "⚡",
        label: h.playerName || h.detail || h.type,
        side: h.team,
        priority: ["big_chance", "woodwork", "var_disallowed", "injury"].includes(h.type) ? 4 : 3,
      })),
    ...substitutions.map((s: any, i) => ({
      id: `sub-${s.minute}-${s.inId || s.playerInId || i}`,
      minute: Number(s.minute) || 0,
      icon: ICONS.forced_sub,
      label: `${s.inName || s.playerInName || "Entra"} por ${s.outName || s.playerOutName || "jugador"}`,
      side: s.team,
      priority: 2,
    })),
    ...moments
      .filter((m: any) => ["chance", "counter", "corner", "dangerous_free_kick", "big_chance"].includes(m.type))
      .map((m: any) => ({
        id: `moment-${m.id}`,
        minute: Number(m.minute) || 0,
        icon: ICONS[m.type] || "⚡",
        label: m.playerName || m.title,
        side: m.teamSide ?? ((m.teamName === (homeName ?? homeLabel)) ? "home" : (m.teamName === (awayName ?? awayLabel)) ? "away" : undefined),
        priority: m.type === "big_chance" ? 5 : 3,
      })),
  ]
    .filter((item) => item.minute <= minute)
    .sort((a, b) => a.minute - b.minute || b.priority - a.priority);

  const visible = items.slice(-10);
  const maxMinute = Math.max(90, minute || 1);
  const latestMomentum = momentumHistory[momentumHistory.length - 1]?.value ?? 50;

  return (
    <div className="rounded-2xl border border-border/70 bg-card/65 backdrop-blur p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Línea de tiempo
        </div>
        <div className="text-[0.65rem] text-muted-foreground tabular-nums">
          {homeLabel} · {awayLabel}
        </div>
      </div>

      <div className="relative mt-4 h-12">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-border/80" />
        {Array.from({ length: 7 }).map((_, i) => {
          const m = Math.round((maxMinute / 6) * i);
          return (
            <div key={i} className="absolute top-[calc(50%-3px)]" style={{ left: `${(m / maxMinute) * 100}%` }}>
              <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              <div className="mt-2 -translate-x-1/2 text-[0.55rem] tabular-nums text-muted-foreground">{m}'</div>
            </div>
          );
        })}
        {visible.map((item) => {
          const left = `${Math.max(0, Math.min(100, (item.minute / maxMinute) * 100))}%`;
          const homeSide = item.side === "home";
          return (
            <motion.div
              key={item.id}
              className="absolute top-0 -translate-x-1/2"
              style={{ left }}
              initial={{ opacity: 0, scale: 0.7, y: homeSide ? -2 : 2 }}
              animate={{ opacity: 1, scale: 1, y: homeSide ? -8 : 18 }}
              title={`${item.minute}' · ${item.label}`}
            >
              <div className="flex h-6 min-w-6 items-center justify-center rounded-full border border-border bg-background/95 px-1.5 text-[0.72rem] shadow-sm">
                {item.icon}
              </div>
            </motion.div>
          );
        })}
        <motion.div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-1.5 rounded-full bg-primary shadow-[0_0_14px_hsl(var(--primary)/.45)]"
          animate={{ left: `${Math.max(0, Math.min(100, (minute / maxMinute) * 100))}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 18 }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[0.62rem] uppercase tracking-wider text-muted-foreground">
        <span>Inicio</span>
        <span>Momento actual · {Math.round(latestMomentum)}%</span>
        <span>90'</span>
      </div>
    </div>
  );
}

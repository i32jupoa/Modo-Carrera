import { VisualStrip } from "@/components/news/NewsVisuals";
import type { MarketNotification } from "@/store/notificationsStore";

const KIND_STYLE: Record<string, { bar: string; emoji: string }> = {
  good: { bar: "bg-emerald-400", emoji: "✅" },
  bad: { bar: "bg-red-400", emoji: "⚠️" },
  info: { bar: "bg-blue-400", emoji: "💬" },
  mailbox: { bar: "bg-primary", emoji: "✉️" },
};

/** Tarjeta de una notificación con escudos, caras de jugadores y banderas. */
export function NotificationCard({
  item,
  compact = false,
  showUnread = false,
}: {
  item: MarketNotification;
  compact?: boolean;
  showUnread?: boolean;
}) {
  const style = KIND_STYLE[item.kind] ?? KIND_STYLE.info;
  const visual = item.visual;
  const hasVisual = !!visual && (visual.teamIds.length > 0 || visual.players.length > 0);
  return (
    <div className="flex w-full items-stretch gap-3 rounded-xl border border-border/60 bg-card/90 p-3 text-left backdrop-blur">
      <span className={`w-1 shrink-0 rounded-full ${style.bar}`} aria-hidden />
      {hasVisual && visual && (
        <VisualStrip
          visual={{
            teamIds: visual.teamIds.slice(0, 2),
            players: visual.players.slice(0, 1),
            countries: visual.countries.slice(0, 1),
          }}
          size={compact ? 34 : 42}
          className="shrink-0 self-center"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] font-black uppercase tracking-wide truncate">
            {style.emoji} {item.title ?? "Novedad"}
          </span>
          {showUnread && !item.read && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" />
          )}
        </div>
        <p className={`text-xs leading-snug text-muted-foreground ${compact ? "line-clamp-2" : ""}`}>
          {item.text}
        </p>
        {item.date && <div className="mt-1 text-[0.6rem] text-muted-foreground/70">{item.date}</div>}
      </div>
    </div>
  );
}

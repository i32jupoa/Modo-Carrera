import { motion } from "framer-motion";

export function MatchSituationPanel({
  minute,
  status,
  homeName,
  awayName,
  homeShots,
  awayShots,
  homeXg,
  awayXg,
  recentHomeShots,
  recentAwayShots,
  risk,
}: {
  minute: number;
  status: string;
  homeName: string;
  awayName: string;
  homeShots: number;
  awayShots: number;
  homeXg: number;
  awayXg: number;
  recentHomeShots: number;
  recentAwayShots: number;
  risk: number;
}) {
  const drama = Math.min(100, Math.round(Math.abs(homeShots - awayShots) * 4 + Math.abs(homeXg - awayXg) * 12 + risk * 0.35));
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 backdrop-blur p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-muted-foreground">Lectura del partido</div>
          <div className="mt-1 text-sm font-black">{status}</div>
        </div>
        <div className="rounded-full border border-border bg-background/50 px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">
          {minute}'
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/60 bg-background/30 p-3">
          <div className="text-[0.62rem] uppercase tracking-wider text-muted-foreground">Tiros</div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <span className="text-lg font-black tabular-nums">{homeShots}</span>
            <span className="text-xs text-muted-foreground">{homeName}</span>
            <span className="text-lg font-black tabular-nums">{awayShots}</span>
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-secondary">
            <motion.div className="bg-primary" animate={{ width: `${(homeShots / Math.max(1, homeShots + awayShots)) * 100}%` }} />
            <motion.div className="bg-destructive" animate={{ width: `${(awayShots / Math.max(1, homeShots + awayShots)) * 100}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 p-3">
          <div className="text-[0.62rem] uppercase tracking-wider text-muted-foreground">xG</div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <span className="text-lg font-black tabular-nums">{homeXg.toFixed(2)}</span>
            <span className="text-xs text-muted-foreground">vs</span>
            <span className="text-lg font-black tabular-nums">{awayXg.toFixed(2)}</span>
          </div>
          <div className="mt-2 text-[0.65rem] text-muted-foreground">
            Últimos 10' · {recentHomeShots} - {recentAwayShots} tiros
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[0.65rem] text-muted-foreground">
        <span>Riesgo de la orden: {risk}/90</span>
        <span>{drama >= 72 ? "🔥 Tramo de máxima tensión" : drama >= 48 ? "⚡ Partido abierto" : "Control y paciencia"}</span>
      </div>
    </div>
  );
}

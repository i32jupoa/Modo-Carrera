import { motion } from "framer-motion";

interface MomentumBarProps {
  value: number;
  homeLabel: string;
  awayLabel: string;
  status: string;
  compact?: boolean;
}

export function MomentumBar({ value, homeLabel, awayLabel, status, compact = false }: MomentumBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const homePct = 100 - clamped;
  const homeDominant = homePct > 58;
  const awayDominant = clamped > 58;

  return (
    <div className={`rounded-xl border border-border/70 bg-card/70 backdrop-blur ${compact ? "p-2.5" : "p-4"} shadow-sm`}>
      <div className={`flex items-center justify-between gap-2 ${compact ? "mb-1" : "mb-2"}`}>
        <div className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-muted-foreground">
          Momentum del partido
        </div>
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-xs font-black ${homeDominant ? "text-primary" : awayDominant ? "text-destructive" : "text-foreground"}`}
        >
          {status}
        </motion.div>
      </div>
      <div className={`flex items-center justify-between gap-3 ${compact ? "text-[0.68rem] mb-1" : "text-xs mb-2"} font-bold`}>
        <span className={homeDominant ? "text-primary" : "text-muted-foreground"}>{homeLabel}</span>
        <span className={awayDominant ? "text-destructive" : "text-muted-foreground"}>{awayLabel}</span>
      </div>
      <div className={`relative ${compact ? "h-2" : "h-3"} overflow-hidden rounded-full bg-secondary/80 border border-border/50`}>
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/80"
          animate={{ width: `${homePct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        />
        <motion.div
          className="absolute inset-y-0 right-0 rounded-full bg-destructive/70"
          animate={{ width: `${clamped}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        />
        <motion.div
          className={`absolute top-1/2 -translate-y-1/2 ${compact ? "h-4 w-1" : "h-5 w-1.5"} rounded-full bg-foreground shadow-[0_0_14px_hsl(var(--primary)/.35)]`}
          animate={{ left: `calc(${homePct}% - 3px)` }}
          transition={{ type: "spring", stiffness: 150, damping: 16 }}
        />
      </div>
      <div className={`${compact ? "mt-1 text-[0.56rem]" : "mt-2 text-[0.65rem]"} flex justify-between tabular-nums text-muted-foreground`}>
        <span>{Math.round(homePct)}%</span>
        <span className="uppercase tracking-wider">Momentum</span>
        <span>{Math.round(clamped)}%</span>
      </div>
    </div>
  );
}

import { motion } from "framer-motion";
import { ClipboardList, Play, Sparkles } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";

export function HalftimeOverlay({
  minute,
  homeName,
  awayName,
  homeScore,
  awayScore,
  momentum,
  isExtraTime = false,
  homeLeagueName,
  awayLeagueName,
  onContinue,
  onEdit,
}: {
  minute: number;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  momentum: number;
  isExtraTime?: boolean;
  homeLeagueName?: string;
  awayLeagueName?: string;
  onContinue: () => void;
  onEdit: () => void;
}) {
  const breakLabel = isExtraTime ? "Descanso de la prórroga" : "DESCANSO";
  const nextLabel = "Continuar";
  const momentumText = momentum >= 62 ? `${homeName} llega mejor al descanso` : momentum <= 38 ? `${awayName} llega mejor al descanso` : "El partido llega igualado al descanso";

  return (
    <motion.div
      className="match-halftime-overlay fixed inset-0 z-[88] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 170, damping: 18 }}
        className="match-halftime-card w-full max-w-2xl overflow-hidden rounded-3xl border border-primary/30 bg-card shadow-2xl"
      >
        <div className="match-halftime-header border-b border-border/60 bg-primary/5 p-5 text-center sm:p-7">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-[0.68rem] font-black uppercase tracking-[0.24em] text-primary">{breakLabel}</div>
          <div className="match-halftime-scoreline mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-5">
            <div className="min-w-0 text-center">
              <div className="match-halftime-team-logo mx-auto flex h-14 w-14 items-center justify-center">
                <TeamLogo teamName={homeName} leagueName={homeLeagueName || ""} size={42} className="block max-h-full max-w-full" />
              </div>
              <div className="mt-2 truncate text-xs font-extrabold sm:text-sm">{homeName}</div>
              <div className="mt-1 text-[0.58rem] font-black uppercase tracking-[0.15em] text-muted-foreground">LOCAL</div>
            </div>
            <span className="match-halftime-digits scoreline text-4xl font-black tabular-nums sm:text-5xl">{homeScore} <span className="text-muted-foreground/45">—</span> {awayScore}</span>
            <div className="min-w-0 text-center">
              <div className="match-halftime-team-logo mx-auto flex h-14 w-14 items-center justify-center">
                <TeamLogo teamName={awayName} leagueName={awayLeagueName || ""} size={42} className="block max-h-full max-w-full" />
              </div>
              <div className="mt-2 truncate text-xs font-extrabold sm:text-sm">{awayName}</div>
              <div className="mt-1 text-[0.58rem] font-black uppercase tracking-[0.15em] text-muted-foreground">VISITANTE</div>
            </div>
          </div>
          <div className="match-halftime-momentum mt-5 text-left">
            <div className="mb-1.5 flex items-center justify-between text-[0.58rem] font-black uppercase tracking-[0.16em] text-muted-foreground">
              <span>Control del partido</span><span>{Math.round(Math.max(0, Math.min(100, momentum)))}% / {Math.round(100 - Math.max(0, Math.min(100, momentum)))}%</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted/70">
              <div className="h-full rounded-l-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, momentum))}%` }} />
              <div className="h-full flex-1 bg-sky-400/80" />
            </div>
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {momentumText} · minuto {minute}'
          </div>
        </div>

        <div className="match-halftime-actions grid gap-3 p-4 md:grid-cols-2">
          <button
            type="button"
            onClick={onEdit}
            className="group rounded-2xl border border-border bg-background/40 p-4 text-left transition hover:border-primary/50 hover:bg-primary/5"
          >
            <div className="flex items-center gap-3">
              <span className="rounded-xl border border-border/60 bg-secondary/70 p-3 text-primary">
                <ClipboardList className="h-5 w-5" />
              </span>
              <div>
                <div className="font-black">Editar alineación y táctica</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Ajusta la estructura completa antes de volver al césped.
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onContinue}
            className="group rounded-2xl border border-primary/40 bg-primary/10 p-4 text-left transition hover:bg-primary/15"
          >
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-primary/15 p-3 text-primary">
                <Play className="h-5 w-5" />
              </span>
              <div>
                <div className="font-black">{nextLabel}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Volverás al partido, pero el reloj seguirá pausado hasta que pulses «Comenzar 2ª parte».
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="border-t border-border/50 bg-background/25 px-6 py-4 text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-foreground">Descanso · partido pausado</div>
          <div className="mt-1 text-[0.68rem] text-muted-foreground">Puedes ajustar la alineación o cerrar esta pantalla. La segunda parte no empezará hasta que la inicies.</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

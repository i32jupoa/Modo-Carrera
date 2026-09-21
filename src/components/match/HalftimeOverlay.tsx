import { motion } from "framer-motion";
import { ClipboardList, Play, Sparkles } from "lucide-react";

export function HalftimeOverlay({
  minute,
  homeName,
  awayName,
  homeScore,
  awayScore,
  momentum,
  isExtraTime = false,
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
  onContinue: () => void;
  onEdit: () => void;
}) {
  const breakLabel = isExtraTime ? "Descanso de la prórroga" : "DESCANSO";
  const nextLabel = isExtraTime ? "Continuar prórroga" : "Comenzar segunda parte";
  const momentumText = momentum >= 62 ? `${homeName} llega mejor al descanso` : momentum <= 38 ? `${awayName} llega mejor al descanso` : "El partido llega igualado al descanso";

  return (
    <motion.div
      className="fixed inset-0 z-[88] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 170, damping: 18 }}
        className="w-full max-w-2xl overflow-hidden rounded-3xl border border-primary/30 bg-card shadow-2xl"
      >
        <div className="border-b border-border/60 bg-primary/5 p-7 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-[0.68rem] font-black uppercase tracking-[0.24em] text-primary">{breakLabel}</div>
          <div className="mt-3 flex items-center justify-center gap-5 text-lg font-black md:text-xl">
            <span className="max-w-[38%] truncate text-right">{homeName}</span>
            <span className="scoreline text-4xl md:text-5xl">{homeScore} - {awayScore}</span>
            <span className="max-w-[38%] truncate text-left">{awayName}</span>
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {momentumText} · minuto {minute}'
          </div>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2">
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
                  El partido seguirá exactamente desde el minuto {minute}'.
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="border-t border-border/50 bg-background/25 px-6 py-4 text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-foreground">El partido está detenido</div>
          <div className="mt-1 text-[0.68rem] text-muted-foreground">Continúa o entra en Dirección de equipo para modificar la alineación y la táctica.</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

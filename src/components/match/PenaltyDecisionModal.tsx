import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, Shield } from "lucide-react";
import { PlayerFace } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";
import { faceUrl } from "@/lib/playerFaces";

export type PenaltyZoneId =
  | "top-left"
  | "top-center"
  | "top-right"
  | "mid-left"
  | "center"
  | "mid-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface PenaltyPlayerOption {
  id: string;
  name: string;
  rating: number;
  detail?: string;
}

export interface PendingPenalty {
  minute: number;
  teamName: string;
  attacking: boolean;
  takerId?: string;
  takerName?: string;
  keeperName?: string;
  keeperId?: string;
  teamLeagueName?: string;
  takerRating?: number;
  keeperRating?: number;
  baselineScored: boolean;
  detail?: string;
  candidates?: PenaltyPlayerOption[];
}

const zones: Array<{ id: PenaltyZoneId; label: string; glyph: string }> = [
  { id: "top-left", label: "Arriba izquierda", glyph: "↖" },
  { id: "top-center", label: "Arriba centro", glyph: "↑" },
  { id: "top-right", label: "Arriba derecha", glyph: "↗" },
  { id: "mid-left", label: "Media izquierda", glyph: "←" },
  { id: "center", label: "Centro", glyph: "•" },
  { id: "mid-right", label: "Media derecha", glyph: "→" },
  { id: "bottom-left", label: "Abajo izquierda", glyph: "↙" },
  { id: "bottom-center", label: "Abajo centro", glyph: "↓" },
  { id: "bottom-right", label: "Abajo derecha", glyph: "↘" },
];

export function PenaltyDecisionModal({
  penalty,
  onResolve,
}: {
  penalty: PendingPenalty | null;
  onResolve: (zone: PenaltyZoneId) => void;
}) {
  return (
    <AnimatePresence>
      {penalty && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-3 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.98 }}
            className="w-full max-w-xl max-h-[92vh] overflow-y-auto overflow-hidden rounded-2xl border border-primary/40 bg-card shadow-2xl"
          >
            <div className="border-b border-border/60 bg-primary/5 p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                {penalty.teamLeagueName && (
                  <TeamLogo
                    teamName={penalty.teamName}
                    leagueName={penalty.teamLeagueName}
                    size={24}
                  />
                )}
                <div className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                  {penalty.minute}' · Penalti
                </div>
              </div>
              <div className="mt-1 text-3xl">🚨</div>
              <h2 className="mt-1 text-2xl font-black">PENALTI</h2>
              <p className="mt-1 text-sm text-muted-foreground">{penalty.teamName}</p>
              {penalty.detail && (
                <p className="mt-3 text-xs text-muted-foreground">{penalty.detail}</p>
              )}
            </div>

            <div className="p-4">
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-black">
                  {penalty.attacking ? (
                    <Crosshair className="h-4 w-4 text-primary" />
                  ) : (
                    <Shield className="h-4 w-4 text-primary" />
                  )}
                  {penalty.attacking ? "Elige dónde tirarlo" : "Elige dónde lanzarte"}
                </div>
                <div className="text-[0.62rem] uppercase tracking-[0.15em] text-muted-foreground">
                  9 zonas
                </div>
              </div>

              <div className="mx-auto mt-3 max-w-sm rounded-xl border border-border/70 bg-background/25 p-3 shadow-inner">
                <div className="mb-3 flex items-center justify-center gap-5">
                  <div className="flex flex-col items-center gap-1">
                    <PlayerFace
                      name={penalty.takerName ?? "Lanzador"}
                      image={faceUrl(penalty.takerId)}
                      size={42}
                      showRing={false}
                    />
                    <span className="max-w-[7rem] truncate text-[0.58rem] font-black">
                      {penalty.takerName ?? "Lanzador"}
                    </span>
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    vs
                  </span>
                  <div className="flex flex-col items-center gap-1">
                    <PlayerFace
                      name={penalty.keeperName ?? "Portero"}
                      image={faceUrl(penalty.keeperId)}
                      size={42}
                      role="GK"
                      showRing={false}
                    />
                    <span className="max-w-[7rem] truncate text-[0.58rem] font-black">
                      {penalty.keeperName ?? "Portero"}
                    </span>
                  </div>
                </div>
                <div className="mb-3 flex items-center justify-between px-1 text-[0.58rem] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  <span>
                    {penalty.attacking
                      ? (penalty.takerName ?? "Lanzador")
                      : (penalty.keeperName ?? "Portero")}
                  </span>
                  <span className="tabular-nums">
                    {penalty.attacking
                      ? `OVR ${penalty.takerRating ?? "—"} · GK ${penalty.keeperRating ?? "—"}`
                      : `GK ${penalty.keeperRating ?? "—"} · Lanzador ${penalty.takerRating ?? "—"}`}
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-xl border-4 border-foreground/70 bg-background p-2">
                  <div
                    className="absolute inset-0 opacity-[0.12]"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, transparent 32.7%, currentColor 33%, transparent 33.3%, transparent 66.0%, currentColor 66.3%, transparent 66.6%), linear-gradient(to bottom, transparent 32.7%, currentColor 33%, transparent 33.3%, transparent 66.0%, currentColor 66.3%, transparent 66.6%)",
                    }}
                    aria-hidden
                  />
                  <div className="relative z-10 grid grid-cols-3 gap-1.5 aspect-[1.55]">
                    {zones.map((zone) => (
                      <motion.button
                        key={zone.id}
                        type="button"
                        onClick={() => onResolve(zone.id)}
                        whileHover={{ scale: 1.035, y: -1 }}
                        whileTap={{ scale: 0.96 }}
                        className="group relative rounded-md border border-foreground/10 bg-background/30 text-xl md:text-2xl font-black transition hover:border-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-35"
                        title={zone.label}
                        aria-label={zone.label}
                      >
                        <span className="transition group-hover:scale-110">{zone.glyph}</span>
                        <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-background/85 px-1.5 py-0.5 text-[0.45rem] font-black uppercase tracking-wider text-muted-foreground opacity-0 transition group-hover:opacity-100">
                          {zone.label}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between px-1 text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>🎯 Esquinas = más difíciles de parar</span>
                  <span>🧤 Centro = más accesible</span>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-border/60 bg-secondary/35 p-2.5 text-[0.68rem] text-muted-foreground">
                La calidad del lanzador y del portero cambia el margen. Un buen disparo a la esquina
                suele ser muy complicado de detener; un objetivo pobre puede costarte el penalti.
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

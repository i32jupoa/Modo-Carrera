import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, Shield } from "lucide-react";
import { PlayerFace } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";
import { faceUrl } from "@/lib/playerFaces";

export type PenaltyZoneId =
  | "top-left"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-right";

export interface PenaltyPlayerOption {
  id: string;
  name: string;
  rating: number;
  detail?: string;
}

export interface PenaltyResolution {
  success: boolean;
  selectedZone: PenaltyZoneId;
  actualTargetZone?: PenaltyZoneId;
  label: string;
  detail: string;
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
  resolution?: PenaltyResolution;
}

const zones: Array<{
  id: PenaltyZoneId;
  label: string;
  top: string;
  left: string;
}> = [
  { id: "top-left", label: "Arriba izquierda", top: "22%", left: "21%" },
  { id: "top-right", label: "Arriba derecha", top: "22%", left: "79%" },
  { id: "center", label: "Centro", top: "50%", left: "50%" },
  { id: "bottom-left", label: "Abajo izquierda", top: "78%", left: "21%" },
  { id: "bottom-right", label: "Abajo derecha", top: "78%", left: "79%" },
];

function zoneLabel(zoneId?: PenaltyZoneId) {
  return zones.find((z) => z.id === zoneId)?.label ?? "—";
}

function zoneClass(
  zoneId: PenaltyZoneId,
  resolution: PenaltyResolution | undefined,
): string {
  const base =
    "relative rounded-full border-2 bg-white/5 font-black transition";
  if (!resolution) {
    return `${base} border-foreground/10 hover:border-primary hover:bg-primary/10`;
  }

  const selected = zoneId === resolution.selectedZone;
  const actual = zoneId === resolution.actualTargetZone;
  if (selected && resolution.success) return `${base} border-emerald-400 bg-emerald-500/15 text-emerald-300 shadow-[0_0_26px_rgba(52,211,153,.18)]`;
  if (selected && !resolution.success) return `${base} border-red-400 bg-red-500/15 text-red-300 shadow-[0_0_26px_rgba(248,113,113,.16)]`;
  if (actual) return `${base} border-amber-300/80 bg-amber-300/10 text-amber-200`;
  return `${base} border-foreground/10 bg-background/20 opacity-55`;
}

export function PenaltyDecisionModal({
  penalty,
  onResolve,
  onContinue,
}: {
  penalty: PendingPenalty | null;
  onResolve: (zone: PenaltyZoneId) => void;
  onContinue: () => void;
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
            className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl border border-primary/40 bg-card shadow-2xl"
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
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-black">
                  {penalty.attacking ? (
                    <Crosshair className="h-4 w-4 text-primary" />
                  ) : (
                    <Shield className="h-4 w-4 text-primary" />
                  )}
                  {penalty.attacking ? "Elige dónde tirar" : "Elige dónde lanzarte"}
                </div>
                <div className="text-[0.62rem] uppercase tracking-[0.15em] text-muted-foreground">
                  5 casillas
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
                      ? `PEN ${penalty.takerRating ?? "—"} · GK ${penalty.keeperRating ?? "—"}`
                      : `GK ${penalty.keeperRating ?? "—"} · PEN ${penalty.takerRating ?? "—"}`}
                  </span>
                </div>

                <div className="relative mx-auto aspect-[1.42/1] w-full max-w-md overflow-hidden rounded-b-xl border-x-[7px] border-b-[7px] border-white/80 bg-sky-700 shadow-[inset_0_0_0_2px_rgba(255,255,255,.12),0_18px_45px_rgba(0,0,0,.28)]">
                  <div
                    className="absolute inset-0 opacity-80"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg, transparent 0 12px, rgba(255,255,255,.12) 12px 13px), repeating-linear-gradient(90deg, transparent 0 14px, rgba(255,255,255,.12) 14px 15px)",
                    }}
                  />
                  <div className="absolute inset-x-0 top-0 h-2 border-b border-white/80 bg-white/90" />
                  <div className="absolute left-0 top-0 h-full w-2 bg-white/90" />
                  <div className="absolute right-0 top-0 h-full w-2 bg-white/90" />
                  <div className="absolute inset-[8%] rounded-sm border-2 border-white/25" />
                  {zones.map((zone) => (
                    <motion.button
                      key={zone.id}
                      type="button"
                      disabled={Boolean(penalty.resolution)}
                      onClick={() => onResolve(zone.id)}
                      whileHover={!penalty.resolution ? { scale: 1.05 } : undefined}
                      whileTap={!penalty.resolution ? { scale: 0.94 } : undefined}
                      className={`absolute h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition md:h-24 md:w-24 ${zoneClass(zone.id, penalty.resolution)}`}
                      style={{ top: zone.top, left: zone.left }}
                      title={zone.label}
                      aria-label={zone.label}
                    >
                      <span className="sr-only">{zone.label}</span>
                    </motion.button>
                  ))}
                </div>

                {!penalty.resolution ? (
                  <div className="mt-2 flex items-center justify-between px-1 text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">
                    <span>🎯 Cinco zonas · decide rápido</span>
                    <span>🧤 La calidad influye</span>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <div
                      className={`rounded-lg border px-3 py-2 text-sm font-black ${
                        penalty.resolution.success
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                          : "border-red-400/40 bg-red-500/10 text-red-300"
                      }`}
                    >
                      {penalty.resolution.label}
                    </div>
                    <div className="grid gap-2 text-[0.68rem] text-muted-foreground sm:grid-cols-2">
                      <div className="rounded-lg border border-border/60 bg-background/30 p-2">
                        <span className="font-black text-foreground">Jugador tiró:</span>{" "}
                        {zoneLabel(
                          penalty.attacking
                            ? penalty.resolution.selectedZone
                            : penalty.resolution.actualTargetZone,
                        )}
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/30 p-2">
                        <span className="font-black text-foreground">Portero se lanzó:</span>{" "}
                        {zoneLabel(
                          penalty.attacking
                            ? penalty.resolution.actualTargetZone
                            : penalty.resolution.selectedZone,
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{penalty.resolution.detail}</p>
                    <button
                      type="button"
                      onClick={onContinue}
                      className="mt-1 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition hover:opacity-90"
                    >
                      Continuar partido
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

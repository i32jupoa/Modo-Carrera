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
  gridColumn: number;
  gridRow: number;
}> = [
  { id: "top-left", label: "Arriba izquierda", gridColumn: 1, gridRow: 1 },
  { id: "top-right", label: "Arriba derecha", gridColumn: 3, gridRow: 1 },
  { id: "center", label: "Centro", gridColumn: 2, gridRow: 2 },
  { id: "bottom-left", label: "Abajo izquierda", gridColumn: 1, gridRow: 3 },
  { id: "bottom-right", label: "Abajo derecha", gridColumn: 3, gridRow: 3 },
];

function zoneLabel(zoneId?: PenaltyZoneId) {
  return zones.find((z) => z.id === zoneId)?.label ?? "—";
}

function zoneClass(
  zoneId: PenaltyZoneId,
  resolution: PenaltyResolution | undefined,
): string {
  const base =
    "relative border-2 bg-white/5 font-black transition";
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

                <div
                  className="relative mx-auto aspect-[1.72/1] w-full max-w-md overflow-hidden rounded-xl bg-[linear-gradient(180deg,#173f27_0%,#1f6b3a_55%,#2f8a45_100%)] shadow-[0_24px_55px_rgba(0,0,0,.38)]"
                  aria-label="Portería para elegir zona del penalti"
                >
                  {/* Césped delante de la portería */}
                  <div
                    className="absolute inset-x-0 bottom-0 h-[23%] opacity-70"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 2px, transparent 2px 10px), linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.18))",
                    }}
                  />

                  {/* Red profunda: panel trasero + laterales para dar sensación 3D */}
                  <div
                    className="absolute left-[7%] right-[7%] top-[10%] bottom-[13%] overflow-hidden border border-white/20 bg-[rgba(255,255,255,.035)]"
                    style={{
                      transform: "perspective(700px) rotateX(7deg) translateY(1px)",
                      transformOrigin: "50% 0%",
                      backgroundImage:
                        "repeating-linear-gradient(0deg, rgba(255,255,255,.16) 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, rgba(255,255,255,.16) 0 1px, transparent 1px 12px)",
                    }}
                  />
                  <div
                    className="absolute left-[1.5%] top-[13%] bottom-[7%] w-[7%] skew-y-[18deg] origin-left border-l border-t border-white/25 bg-[rgba(255,255,255,.04)]"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg, rgba(255,255,255,.12) 0 1px, transparent 1px 11px), repeating-linear-gradient(90deg, rgba(255,255,255,.12) 0 1px, transparent 1px 11px)",
                    }}
                  />
                  <div
                    className="absolute right-[1.5%] top-[13%] bottom-[7%] w-[7%] -skew-y-[18deg] origin-right border-r border-t border-white/25 bg-[rgba(255,255,255,.04)]"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg, rgba(255,255,255,.12) 0 1px, transparent 1px 11px), repeating-linear-gradient(90deg, rgba(255,255,255,.12) 0 1px, transparent 1px 11px)",
                    }}
                  />

                  {/* Boca de la portería: dos postes y larguero, como una portería real */}
                  <div className="absolute inset-x-[4%] top-[5%] bottom-[7%] rounded-[5px] bg-black/10 shadow-[inset_0_0_0_2px_rgba(255,255,255,.12),0_12px_22px_rgba(0,0,0,.22)]" />
                  <div className="absolute left-[4%] top-[5%] bottom-[7%] z-10 w-3 rounded-full bg-gradient-to-r from-white via-slate-100 to-slate-400 shadow-[2px_3px_5px_rgba(0,0,0,.28)]" />
                  <div className="absolute right-[4%] top-[5%] bottom-[7%] z-10 w-3 rounded-full bg-gradient-to-r from-slate-400 via-slate-100 to-white shadow-[-2px_3px_5px_rgba(0,0,0,.28)]" />
                  <div className="absolute left-[4%] right-[4%] top-[5%] z-10 h-3 rounded-full bg-gradient-to-b from-white via-slate-100 to-slate-400 shadow-[0_3px_5px_rgba(0,0,0,.3)]" />

                  {/* Red de la boca, visible por detrás de los cinco huecos */}
                  <div
                    className="absolute left-[7.2%] right-[7.2%] top-[10%] bottom-[10%] opacity-65"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg, transparent 0 14px, rgba(255,255,255,.22) 14px 15px), repeating-linear-gradient(90deg, transparent 0 14px, rgba(255,255,255,.22) 14px 15px)",
                    }}
                  />

                  {/* Cinco zonas fijas en una cuadrícula 3×3: cuatro esquinas + centro.
                      La cuadrícula evita que los botones se descuadren según el ancho de pantalla. */}
                  <div className="absolute left-[10%] right-[10%] top-[14%] bottom-[13%] z-20 grid grid-cols-3 grid-rows-3 gap-2 md:gap-3">
                    {zones.map((zone) => (
                      <motion.button
                        key={zone.id}
                        type="button"
                        disabled={Boolean(penalty.resolution)}
                        onClick={() => onResolve(zone.id)}
                        whileHover={!penalty.resolution ? { scale: 1.04 } : undefined}
                        whileTap={!penalty.resolution ? { scale: 0.97 } : undefined}
                        className={`flex min-h-0 w-full items-center justify-center rounded-lg border-2 px-1 text-[0.58rem] font-black uppercase tracking-[0.08em] transition md:text-[0.62rem] ${zoneClass(zone.id, penalty.resolution)}`}
                        style={{
                          gridColumn: zone.gridColumn,
                          gridRow: zone.gridRow,
                          borderStyle: penalty.resolution ? "solid" : "dashed",
                          background:
                            penalty.resolution
                              ? undefined
                              : "linear-gradient(180deg, rgba(255,255,255,.08), rgba(0,0,0,.08))",
                          boxShadow: penalty.resolution
                            ? undefined
                            : "inset 0 0 20px rgba(255,255,255,.035), 0 4px 12px rgba(0,0,0,.12)",
                        }}
                        title={zone.label}
                        aria-label={zone.label}
                      >
                        <span className="flex flex-col items-center justify-center gap-1 leading-tight">
                          <span className="h-2.5 w-2.5 rounded-full border border-white/55 bg-white/25 shadow-[0_0_12px_rgba(255,255,255,.16)] md:h-3 md:w-3" />
                          <span className="text-white/70">{zone.id === "center" ? "CENTRO" : zone.id === "top-left" ? "↖" : zone.id === "top-right" ? "↗" : zone.id === "bottom-left" ? "↙" : "↘"}</span>
                        </span>
                      </motion.button>
                    ))}
                  </div>

                  {/* Línea de gol */}
                  <div className="absolute inset-x-[4%] bottom-[6%] h-[3px] rounded-full bg-white/80 shadow-[0_1px_3px_rgba(0,0,0,.25)]" />
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

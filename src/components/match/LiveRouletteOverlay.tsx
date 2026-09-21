import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, CircleDot, Gauge, Sparkles } from "lucide-react";
import { PlayerFace } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";

export type RouletteOutcome = {
  id: string;
  label: string;
  shortLabel?: string;
  emoji: string;
  weight: number;
};

export type LiveRouletteData = {
  id: string;
  minute: number;
  teamName: string;
  playerName?: string;
  playerId?: string;
  sideLabel: string;
  outcomes: RouletteOutcome[];
  selectedOutcomeId: string;
  stageLabel?: string;
};

function pointOnWheel(angleDeg: number, radius: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: 150 + radius * Math.cos(radians),
    y: 150 + radius * Math.sin(radians),
  };
}

function sectorPath(startDeg: number, endDeg: number, outerRadius = 138, innerRadius = 0) {
  const start = pointOnWheel(startDeg, outerRadius);
  const end = pointOnWheel(endDeg, outerRadius);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  if (innerRadius <= 0) {
    return `M 150 150 L ${start.x} ${start.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  }

  const innerEnd = pointOnWheel(endDeg, innerRadius);
  const innerStart = pointOnWheel(startDeg, innerRadius);
  return `M ${innerStart.x} ${innerStart.y} L ${start.x} ${start.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${end.x} ${end.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
}

const sectorColors: Record<string, string> = {
  goal: "#22c55e",
  save: "#3b82f6",
  woodwork: "#8b5cf6",
  corner: "#f59e0b",
  penalty: "#ef4444",
  counter: "#06b6d4",
  foul: "#a855f7",
  blocked: "#64748b",
  offside: "#ec4899",
  miss: "#eab308",
};

const resultLabels: Record<string, string> = {
  goal: "GOL",
  save: "PARADA",
  woodwork: "PALO",
  corner: "CÓRNER",
  penalty: "PENALTI",
  counter: "CONTRA",
  foul: "FALTA",
  blocked: "BLOQUEO",
  offside: "FUERA JUEGO",
  miss: "FUERA",
};

export function LiveRouletteOverlay({
  data,
  onFinished,
}: {
  data: LiveRouletteData | null;
  onFinished: (outcomeId: string) => void;
}) {
  return (
    <AnimatePresence>
      {data && <RouletteCard key={data.id} data={data} onFinished={onFinished} />}
    </AnimatePresence>
  );
}

function RouletteCard({
  data,
  onFinished,
}: {
  data: LiveRouletteData;
  onFinished: (outcomeId: string) => void;
}) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const sectors = useMemo(() => {
    const total = data.outcomes.reduce((sum, outcome) => sum + Math.max(0.01, outcome.weight), 0);
    let cursor = 0;

    return data.outcomes.map((outcome) => {
      const start = cursor;
      const sweep = (Math.max(0.01, outcome.weight) / total) * 360;
      cursor += sweep;
      return {
        ...outcome,
        start,
        end: cursor,
        probability: (Math.max(0.01, outcome.weight) / total) * 100,
        fill: sectorColors[outcome.id] ?? "#7c3aed",
      };
    });
  }, [data.outcomes]);

  const selectedIndex = Math.max(
    0,
    data.outcomes.findIndex((item) => item.id === data.selectedOutcomeId),
  );
  const selected = sectors[selectedIndex] ?? sectors[0];
  const selectedCenter = selected ? selected.start + (selected.end - selected.start) / 2 : 0;
  const finalRotation = 360 * 7 - selectedCenter;

  function startSpin() {
    if (isSpinning || hasFinished || !data.outcomes.length) return;
    setIsSpinning(true);

    window.setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setHasFinished(true);
      onFinishedRef.current(data.selectedOutcomeId);
    }, 3150);
  }

  const selectedLabel = resultLabels[data.selectedOutcomeId] ?? "RESULTADO";

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[94] flex items-center justify-center p-3 md:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(59,130,246,.10),transparent_35%),linear-gradient(rgba(7,10,16,.78),rgba(7,10,16,.92))] backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />

        <motion.div
          className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#11151f]/98 shadow-[0_30px_100px_rgba(0,0,0,.55)]"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.985 }}
          transition={{ type: "spring", stiffness: 170, damping: 21 }}
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-primary to-amber-400" />

          <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-4 md:px-7">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[0.62rem] font-black uppercase tracking-[0.18em] text-cyan-300">
                <CircleDot className="h-3.5 w-3.5" />
                <span>{data.stageLabel || "Resolución de la jugada"}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-white/60">
                <span>{data.minute}'</span>
                <span>·</span>
                <span className="truncate">{data.teamName}</span>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.58rem] font-black uppercase tracking-[0.14em] text-white/55 sm:flex">
              <Gauge className="h-3.5 w-3.5" />
              Ruleta de partido
            </div>
          </div>

          <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,.8fr)_minmax(0,1.35fr)] md:items-center md:p-7">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.02))] p-5">
              <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/15 blur-3xl" />
              <div className="relative flex items-center gap-4 md:block">
                <div className="flex justify-center">
                  <PlayerFace
                    name={data.playerName || "Jugador"}
                    image={faceUrl(data.playerId)}
                    size={88}
                    showRing
                    className="shrink-0 shadow-2xl"
                  />
                </div>
                <div className="min-w-0 md:mt-4 md:text-center">
                  <div className="text-[0.58rem] font-black uppercase tracking-[0.16em] text-white/45">
                    Protagonista
                  </div>
                  <div className="mt-1 truncate text-xl font-black tracking-tight text-white">
                    {data.playerName || data.teamName}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-white/55">{data.sideLabel}</div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/8 bg-black/15 p-3 text-center">
                <div className="text-[0.55rem] font-black uppercase tracking-[0.17em] text-white/40">
                  Resultado oculto
                </div>
                <div className="mt-1 text-sm font-black text-white/85">
                  Pulsa <span className="text-cyan-300">GIRAR</span> para resolver la acción
                </div>
              </div>
            </div>

            <div>
              <div className="relative mx-auto w-full max-w-[30rem]">
                <div className="absolute left-1/2 top-0 z-40 -translate-x-1/2 -translate-y-1">
                  <div className="relative">
                    <div className="h-0 w-0 border-l-[13px] border-r-[13px] border-t-[24px] border-l-transparent border-r-transparent border-t-white drop-shadow-[0_5px_12px_rgba(0,0,0,.65)]" />
                    <div className="absolute left-1/2 top-1 h-0 w-0 -translate-x-1/2 border-l-[8px] border-r-[8px] border-t-[15px] border-l-transparent border-r-transparent border-t-primary" />
                  </div>
                </div>

                <div className="relative aspect-square rounded-full border-[10px] border-[#1b2230] bg-[#0d1118] p-1 shadow-[0_20px_60px_rgba(0,0,0,.45)]">
                  <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                  <motion.div
                    className="absolute inset-1 rounded-full"
                    initial={{ rotate: 0 }}
                    animate={{ rotate: isSpinning ? finalRotation : 0 }}
                    transition={{
                      duration: 3,
                      ease: [0.1, 0.72, 0.1, 1],
                    }}
                  >
                    <svg
                      viewBox="0 0 300 300"
                      className="h-full w-full"
                      aria-label="Ruleta de la jugada"
                      role="img"
                    >
                      <defs>
                        <radialGradient id="roulette-hub" cx="50%" cy="42%" r="70%">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity=".15" />
                          <stop offset="45%" stopColor="#111827" stopOpacity=".98" />
                          <stop offset="100%" stopColor="#05070b" stopOpacity="1" />
                        </radialGradient>
                        <linearGradient id="roulette-metal" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity=".28" />
                          <stop offset="50%" stopColor="#ffffff" stopOpacity=".04" />
                          <stop offset="100%" stopColor="#000000" stopOpacity=".35" />
                        </linearGradient>
                      </defs>

                      <circle cx="150" cy="150" r="145" fill="#080b10" />
                      <circle cx="150" cy="150" r="141" fill="url(#roulette-metal)" stroke="#2a3444" strokeWidth="3" />

                      {sectors.map((sector) => {
                        const center = sector.start + (sector.end - sector.start) / 2;
                        const sweep = sector.end - sector.start;
                        const labelRadius = sweep < 24 ? 111 : sweep < 38 ? 102 : 94;
                        const label = sector.shortLabel || resultLabels[sector.id] || sector.label;
                        const pos = pointOnWheel(center, labelRadius);
                        const fontSize = sweep < 22 ? 6.4 : sweep < 30 ? 7.2 : 8.5;

                        return (
                          <g key={sector.id}>
                            <path
                              d={sectorPath(sector.start, sector.end, 137, 11)}
                              fill={sector.fill}
                              stroke="#0b0f15"
                              strokeWidth="2.4"
                            />
                            <path
                              d={sectorPath(sector.start + 0.7, sector.end - 0.7, 134, 16)}
                              fill="none"
                              stroke="#ffffff"
                              strokeOpacity=".12"
                              strokeWidth="1"
                            />
                            <text
                              x={pos.x}
                              y={pos.y - 2}
                              fill="#ffffff"
                              textAnchor="middle"
                              fontSize={fontSize}
                              fontWeight="900"
                              letterSpacing=".2"
                              style={{
                                paintOrder: "stroke",
                                stroke: "rgba(0,0,0,.4)",
                                strokeWidth: 2,
                              }}
                            >
                              <tspan x={pos.x} dy="0">
                                {sector.emoji}
                              </tspan>
                              <tspan x={pos.x} dy={fontSize + 4} fontSize={Math.max(5.5, fontSize - 1)}>
                                {label}
                              </tspan>
                            </text>
                          </g>
                        );
                      })}

                      <circle cx="150" cy="150" r="44" fill="url(#roulette-hub)" stroke="#2f3a4c" strokeWidth="3" />
                      <circle cx="150" cy="150" r="37" fill="none" stroke="#ffffff" strokeOpacity=".08" />
                    </svg>
                  </motion.div>

                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.button
                      type="button"
                      onClick={startSpin}
                      disabled={isSpinning || hasFinished}
                      whileHover={!isSpinning ? { scale: 1.05 } : undefined}
                      whileTap={!isSpinning ? { scale: 0.97 } : undefined}
                      className="group relative z-30 flex h-24 w-24 flex-col items-center justify-center rounded-full border-[5px] border-[#202a3a] bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,.18),transparent_34%),linear-gradient(145deg,#1d2735,#080b11)] text-center shadow-[0_12px_30px_rgba(0,0,0,.6)] transition disabled:cursor-default"
                    >
                      <span className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-cyan-300">
                        {isSpinning ? "Girando" : "Tu turno"}
                      </span>
                      <span className="mt-0.5 text-lg font-black tracking-tight text-white">
                        {isSpinning ? "..." : "GIRAR"}
                      </span>
                      {!isSpinning && <ChevronRight className="mt-0.5 h-4 w-4 text-white/45 transition group-hover:translate-x-0.5" />}
                    </motion.button>
                  </div>

                  <div className="pointer-events-none absolute inset-5 rounded-full border border-white/8" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {sectors.map((sector) => (
                  <div
                    key={sector.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1.5"
                  >
                    <span
                      className="h-2 w-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,.16)]"
                      style={{ backgroundColor: sector.fill }}
                    />
                    <span className="text-[0.55rem] font-black uppercase tracking-[0.08em] text-white/70">
                      {sector.emoji} {resultLabels[sector.id] || sector.label}
                    </span>
                    <span className="text-[0.53rem] font-black tabular-nums text-white/35">
                      {sector.probability.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-center text-[0.58rem] font-bold uppercase tracking-[0.11em] text-white/38">
                <Sparkles className="h-3.5 w-3.5 text-cyan-300/60" />
                <span>
                  {isSpinning
                    ? `La ruleta está resolviendo la acción…`
                    : `La probabilidad se adapta al jugador, al rival y al momento del partido.`}
                </span>
              </div>
            </div>
          </div>

          {hasFinished && (
            <div className="border-t border-white/8 bg-white/[0.025] px-5 py-3 text-center text-xs font-black uppercase tracking-[0.12em] text-white/55">
              {selectedLabel}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

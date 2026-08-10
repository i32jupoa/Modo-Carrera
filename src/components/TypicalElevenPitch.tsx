import type { ElevenSlot } from "@/lib/teamProfile";
import { FORMATION_COORDINATES, type FormationName } from "@/lib/formations";
import { PlayerFace, ROLE_TEXT, roleFromPosition, type PosRole } from "@/components/PlayerFace";

const LEGEND: Array<{ role: PosRole; label: string }> = [
  { role: "GK", label: "Portería" },
  { role: "DEF", label: "Defensa" },
  { role: "MID", label: "Centro del campo" },
  { role: "ATT", label: "Delantera" },
];

const FALLBACK: FormationName = "Táctica 4-2-3-1 (2)";

interface Props {
  eleven: ElevenSlot[];
  formation: string;
  className?: string;
}

export function TypicalElevenPitch({ eleven, formation, className = "" }: Props) {
  const coords = FORMATION_COORDINATES[formation as FormationName] ?? FORMATION_COORDINATES[FALLBACK];
  const layout = Object.keys(coords).map((k) => coords[k]);

  return (
    <div className={className}>
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-primary/20 shadow-lg"
        style={{
          aspectRatio: "3 / 4",
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--color-pitch) 92%, black) 0%, var(--color-pitch) 50%, color-mix(in oklab, var(--color-pitch) 92%, black) 100%)",
        }}
      >
        {/* Franjas de césped */}
        <div className="pointer-events-none absolute inset-0 opacity-25">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0"
              style={{
                top: `${i * 12.5}%`,
                height: "12.5%",
                background: i % 2 === 0 ? "rgba(255,255,255,0.06)" : "transparent",
              }}
            />
          ))}
        </div>

        {/* Líneas del campo */}
        <div className="pointer-events-none absolute inset-[3%] rounded-md border-2 border-white/25">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-white/25" />
          <div className="absolute left-1/2 top-1/2 h-[22%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />
          <div className="absolute left-1/2 top-0 h-[14%] w-[56%] -translate-x-1/2 border-2 border-t-0 border-white/25" />
          <div className="absolute left-1/2 top-0 h-[6%] w-[28%] -translate-x-1/2 border-2 border-t-0 border-white/25" />
          <div className="absolute bottom-0 left-1/2 h-[14%] w-[56%] -translate-x-1/2 border-2 border-b-0 border-white/25" />
          <div className="absolute bottom-0 left-1/2 h-[6%] w-[28%] -translate-x-1/2 border-2 border-b-0 border-white/25" />
        </div>

        {/* Jugadores */}
        {eleven.map((slot, i) => {
          const coord = layout[i] ?? { top: 50, left: 50 };
          const role = roleFromPosition(slot.label);
          const name = slot.player?.Name ?? "—";
          const surname = name.split(" ").slice(-1)[0];

          return (
            <div
              key={`${slot.label}-${i}`}
              className="absolute flex w-[22%] flex-col items-center"
              style={{ top: `${coord.top}%`, left: `${coord.left}%`, transform: "translate(-50%,-50%)" }}
            >
              <div className="relative">
                <PlayerFace
                  name={name}
                  image={slot.player?.card}
                  role={role}
                  size={40}
                  className="bg-background/70 shadow-md"
                  showRing={false}
                />
                {slot.player && (
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-background/90 px-1 text-[0.55rem] font-black leading-tight text-foreground shadow">
                    {slot.player.OVR}
                  </span>
                )}
              </div>
              <span className={`mt-1 text-[0.58rem] font-black uppercase tracking-wide ${ROLE_TEXT[role]}`}>
                {slot.label}
              </span>
              <span className="max-w-full truncate text-[0.58rem] font-semibold leading-tight text-white/90">
                {surname}
              </span>
            </div>
          );
        })}
      </div>

      {/* Leyenda de colores */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {LEGEND.map((l) => (
          <span key={l.role} className="flex items-center gap-1.5 text-[0.62rem] font-semibold">
            <span className={`h-2 w-2 rounded-full ${ROLE_TEXT[l.role]}`} style={{ backgroundColor: "currentColor" }} />
            <span className={ROLE_TEXT[l.role]}>{l.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

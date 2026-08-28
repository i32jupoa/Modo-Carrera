import { PositionCoordinate } from "@/lib/formations";
import { PlayerFace } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";

interface FootballPitchProps {
  children: React.ReactNode;
}

export function FootballPitch({ children }: FootballPitchProps) {
  return (
    <div
      className="relative w-full max-w-md mx-auto overflow-hidden rounded-2xl border border-primary/20 shadow-lg"
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

      {/* Player nodes */}
      {children}
    </div>
  );
}

interface PlayerNodeProps {
  player: {
    id: string;
    name: string;
    rating: number;
    position: string;
    /** Demarcación del hueco que ocupa en el campo ("EI"). */
    slotLabel?: string;
    /** Resto de demarcaciones del jugador (burbuja): ["MD", "DC"]. */
    otherPositions?: string[];
    injured?: boolean;
    suspended?: boolean;
    cardImage?: string;
  };
  coordinates: PositionCoordinate;
  isSelected: boolean;
  onClick: () => void;
}

// Helper to truncate name to surname or first word
function getShortName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return name;
  // Return last name (surname) or first name if it's short
  const lastName = parts[parts.length - 1];
  if (lastName.length <= 8) return lastName;
  // If last name is long, return first name
  const firstName = parts[0];
  if (firstName.length <= 8) return firstName;
  // Return first 8 chars of last name
  return lastName.substring(0, 8);
}

export function PlayerNode({ player, coordinates, isSelected, onClick }: PlayerNodeProps) {
  const shortName = getShortName(player.name);
  const isUnavailable = player.injured || player.suspended;

  return (
    <button
      onClick={onClick}
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 w-[5.5rem] flex flex-col items-center justify-center bg-transparent transition-all duration-200 ${
        isSelected
          ? "scale-110 drop-shadow-[0_0_6px_hsl(var(--primary))]"
          : isUnavailable
            ? "opacity-60"
            : "hover:scale-105"
      }`}
      style={{
        top: `${coordinates.top}%`,
        left: `${coordinates.left}%`,
      }}
      title={`${player.name} (${player.rating}) - ${[player.slotLabel, ...(player.otherPositions ?? [])].filter(Boolean).join(" · ") || player.position}${player.injured ? " - Lesionado" : ""}${player.suspended ? " - Suspendido" : ""}`}
      disabled={isUnavailable}
    >
      <span className="relative">
        <PlayerFace
          name={player.name}
          image={faceUrl(player.id, player.cardImage)}
          size={48}
          showRing={false}
          className="shadow-md"
        />
        <span className="absolute -bottom-1 -right-1 rounded-full bg-background/90 px-1.5 text-[0.6rem] font-black leading-tight text-foreground shadow">
          {player.rating}
        </span>
        {player.otherPositions && player.otherPositions.length > 0 && (
          <span className="absolute -top-1 -left-1 max-w-[3.5rem] truncate rounded-full border border-primary/40 bg-background/85 px-1 text-[0.45rem] font-bold uppercase leading-[0.9rem] text-foreground/70 shadow">
            {player.otherPositions.join(" · ")}
          </span>
        )}
      </span>
      <span className="mt-0.5 text-[0.6rem] font-medium leading-tight truncate max-w-full px-1 text-foreground drop-shadow">
        {shortName}
      </span>
      {player.slotLabel && (
        <span className="text-[0.55rem] font-black uppercase leading-tight text-foreground drop-shadow">
          {player.slotLabel}
        </span>
      )}
      {player.injured && (
        <span
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-orange-400"
          title="Lesionado"
        />
      )}
      {player.suspended && (
        <span
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500"
          title="Suspendido"
        />
      )}
    </button>
  );
}

import { useState } from "react";

export type PosRole = "GK" | "DEF" | "MID" | "ATT";

/** Demarcaciones (etiquetas ES e inglesas) → grupo de posición. */
export function roleFromPosition(pos: string): PosRole {
  const p = (pos || "").toUpperCase();
  if (["GK", "POR"].includes(p)) return "GK";
  if (["CB", "RB", "LB", "RWB", "LWB", "DFC", "LD", "LI", "CAD", "CAI", "DEF"].includes(p))
    return "DEF";
  if (
    ["CDM", "CM", "CAM", "RM", "LM", "MCD", "MC", "MCO", "MD", "MI", "MID"].includes(p)
  )
    return "MID";
  return "ATT";
}

export const ROLE_TEXT: Record<PosRole, string> = {
  GK: "text-pos-gk",
  DEF: "text-pos-def",
  MID: "text-pos-mid",
  ATT: "text-pos-att",
};

export const ROLE_BORDER: Record<PosRole, string> = {
  GK: "border-pos-gk",
  DEF: "border-pos-def",
  MID: "border-pos-mid",
  ATT: "border-pos-att",
};

export const ROLE_BG: Record<PosRole, string> = {
  GK: "bg-pos-gk/15",
  DEF: "bg-pos-def/15",
  MID: "bg-pos-mid/15",
  ATT: "bg-pos-att/15",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

interface PlayerFaceProps {
  name: string;
  image?: string;
  role?: PosRole;
  size?: number;
  className?: string;
  /** Aro de color según la demarcación. Se puede desactivar (alineación). */
  showRing?: boolean;
}

/**
 * Cara del jugador tomada de la imagen de su carta en la base de datos.
 * Recorta la parte superior de la carta (donde está el retrato) y cae en
 * las iniciales si no hay imagen o falla la carga.
 */
export function PlayerFace({
  name,
  image,
  role = "MID",
  size = 32,
  className = "",
  showRing = true,
}: PlayerFaceProps) {
  const [failed, setFailed] = useState(false);
  const showImage = !!image && !failed;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${
        showRing ? `border-2 ${ROLE_BORDER[role]} ${ROLE_BG[role]}` : "border-0 bg-secondary"
      } ${className}`}
      style={{ width: size, height: size }}
      aria-hidden={showImage ? undefined : true}
    >
      {showImage ? (
        <img
          src={image}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
          style={{ objectPosition: "44% 30%", transform: "scale(1.45)" }}
        />
      ) : (
        <span className={`text-[0.6rem] font-black ${ROLE_TEXT[role]}`}>{initials(name)}</span>
      )}
    </span>
  );
}

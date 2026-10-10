import { useState } from "react";

export type PosRole = "GK" | "DEF" | "MID" | "ATT";

/** Demarcaciones (etiquetas ES e inglesas) → grupo de posición. */
export function roleFromPosition(pos: string): PosRole {
  const p = (pos || "").toUpperCase();
  if (["GK", "POR"].includes(p)) return "GK";
  if (["CB", "RB", "LB", "RWB", "LWB", "DFC", "LD", "LI", "DEF"].includes(p))
    return "DEF";
  if (["CDM", "CM", "CAM", "RM", "LM", "MCD", "MC", "MCO", "MD", "MI", "MID"].includes(p))
    return "MID";
  return "ATT";
}

export const ROLE_TEXT: Record<PosRole, string> = {
  GK: "text-muted-foreground",
  DEF: "text-muted-foreground",
  MID: "text-muted-foreground",
  ATT: "text-muted-foreground",
};

export const ROLE_BORDER: Record<PosRole, string> = {
  GK: "border-border",
  DEF: "border-border",
  MID: "border-border",
  ATT: "border-border",
};

export const ROLE_BG: Record<PosRole, string> = {
  GK: "bg-secondary/60",
  DEF: "bg-secondary/60",
  MID: "bg-secondary/60",
  ATT: "bg-secondary/60",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Recorte de la imagen de la carta: qué punto de la imagen queda centrado
 * en el círculo y cuánto se hace zoom sobre ella. Las cartas traen bastante
 * espacio vacío alrededor del jugador (parámetro `padding` de la API de EA),
 * así que se hace zoom para que la cara ocupe el círculo sin quedar
 * gigante ni descentrada. Ajustar aquí si hace falta afinar el encuadre.
 */
const FACE_OBJECT_POSITION = "50% 24%";
const FACE_SCALE = 1.05;

interface PlayerFaceProps {
  name: string;
  image?: string;
  role?: PosRole;
  size?: number;
  className?: string;
  /** Borde neutro del retrato; ya no depende de la demarcación. */
  showRing?: boolean;
  /** Use a rectangular card crop in expanded player details. */
  shape?: "circle" | "square";
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
  shape = "circle",
}: PlayerFaceProps) {
  const [failed, setFailed] = useState(false);
  const showImage = !!image && !failed;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${shape === "square" ? "rounded-xl" : "rounded-full"} ${
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
          style={{ objectPosition: FACE_OBJECT_POSITION, transform: `scale(${FACE_SCALE})` }}
        />
      ) : (
        <span
          className={`text-[0.6rem] font-black ${showRing ? ROLE_TEXT[role] : "text-foreground/70"}`}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}

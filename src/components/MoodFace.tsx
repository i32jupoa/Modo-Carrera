import { memo } from "react";
import { Angry, Frown, Laugh, Meh, Smile } from "lucide-react";

export const MOOD_LEVELS = [
  { min: 80, label: "Encantado", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-400/20", icon: Laugh },
  { min: 60, label: "Satisfecho", color: "text-lime-300", bg: "bg-lime-500/10 border-lime-300/20", icon: Smile },
  { min: 40, label: "Indiferente", color: "text-yellow-300", bg: "bg-yellow-500/10 border-yellow-300/20", icon: Meh },
  { min: 20, label: "Descontento", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-400/20", icon: Frown },
  { min: 0, label: "Furioso", color: "text-red-400", bg: "bg-red-500/10 border-red-400/20", icon: Angry },
] as const;

export function moodLabel(morale: number): {
  label: "Encantado" | "Satisfecho" | "Indiferente" | "Descontento" | "Furioso";
  tone: string;
} {
  const value = Math.max(0, Math.min(100, Math.round(morale)));
  const level = MOOD_LEVELS.find((entry) => value >= entry.min) ?? MOOD_LEVELS[4];
  return { label: level.label, tone: level.color };
}

interface MoodFaceProps {
  morale: number;
  size?: number;
  className?: string;
  showLabel?: boolean;
  showTooltip?: boolean;
}

export const MoodFace = memo(function MoodFace({ morale, size = 18, className = "", showLabel = false, showTooltip = true }: MoodFaceProps) {
  const value = Math.max(0, Math.min(100, Math.round(morale)));
  const level = MOOD_LEVELS.find((entry) => value >= entry.min) ?? MOOD_LEVELS[4];
  const Icon = level.icon;
  const title = `${level.label} · satisfacción ${value}/100`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${showLabel ? `rounded-full border px-2 py-1 ${level.bg}` : ""} ${className}`}
      title={showTooltip ? title : undefined}
      aria-label={title}
    >
      <Icon className={level.color} style={{ width: size, height: size }} strokeWidth={2.2} />
      {showLabel && <span className={`text-[0.65rem] font-bold ${level.color}`}>{level.label}</span>}
    </span>
  );
});

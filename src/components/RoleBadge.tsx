import { memo } from "react";
import { CircleDot, Crown, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { SquadRole } from "@/lib/transfers/types";
import { SQUAD_ROLE_LABELS } from "@/lib/squadRoles";

const CONFIG: Record<SquadRole, { icon: typeof Crown; classes: string }> = {
  star: { icon: Crown, classes: "border-amber-400/25 bg-amber-500/10 text-amber-300" },
  starter: { icon: ShieldCheck, classes: "border-sky-400/25 bg-sky-500/10 text-sky-300" },
  rotation: { icon: CircleDot, classes: "border-violet-400/25 bg-violet-500/10 text-violet-300" },
  secondary: { icon: UsersRound, classes: "border-zinc-400/25 bg-zinc-500/10 text-zinc-300" },
  prospect: { icon: Sparkles, classes: "border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-300" },
};

interface RoleBadgeProps {
  role?: SquadRole;
  compact?: boolean;
  className?: string;
}

export const RoleBadge = memo(function RoleBadge({ role = "secondary", compact = false, className = "" }: RoleBadgeProps) {
  const config = CONFIG[role];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-bold ${compact ? "px-1.5 py-0.5 text-[0.55rem]" : "px-2 py-1 text-xs"} ${config.classes} ${className}`}>
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
      {SQUAD_ROLE_LABELS[role]}
    </span>
  );
});

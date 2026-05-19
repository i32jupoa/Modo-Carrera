import { Team } from "@/data/teams";

export function TeamBadge({ team, size = 36 }: { team: Team; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-md font-bold text-[0.7rem] shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${team.color}, color-mix(in oklab, ${team.color} 60%, #000))`,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.6)",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
      title={team.name}
    >
      {team.short}
    </div>
  );
}

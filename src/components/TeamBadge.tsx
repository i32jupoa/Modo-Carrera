import { Team, teamById } from "@/data/teams";

export function TeamBadge({
  team,
  teamId,
  size = 36,
}: {
  team?: Team;
  teamId?: string;
  size?: number;
}) {
  let t: Team | null = team ?? null;
  if (!t && teamId) {
    try {
      t = teamById(teamId);
    } catch {
      t = null;
    }
  }
  if (!t) {
    return (
      <div
        className="flex items-center justify-center rounded-md font-bold text-[0.7rem] shrink-0 bg-muted text-muted-foreground"
        style={{ width: size, height: size, border: "1px solid rgba(255,255,255,0.1)" }}
        title={teamId ?? "?"}
      >
        ?
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-md font-bold text-[0.7rem] shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${t.color}, color-mix(in oklab, ${t.color} 60%, #000))`,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.6)",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
      title={t.name}
    >
      {t.short}
    </div>
  );
}

import type { PlayerRating } from "@/lib/matchStats";

function ratingColor(r: number) {
  if (r >= 8) return "bg-emerald-500 text-white";
  if (r >= 7) return "bg-primary text-primary-foreground";
  if (r >= 6) return "bg-muted text-foreground";
  return "bg-destructive text-destructive-foreground";
}

export function PlayerRatingsPanel({
  ratings, mvp, homeName, awayName,
}: { ratings: PlayerRating[]; mvp?: PlayerRating | null; homeName: string; awayName: string }) {
  if (!ratings || ratings.length === 0) return null;
  const render = (team: "home" | "away", title: string) => (
    <div className="space-y-1">
      <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {ratings.filter((r) => r.team === team).sort((a, b) => b.rating - a.rating).map((r) => (
        <div key={r.playerId} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1 text-sm">
          <span className="truncate">
            <span className="mr-1 text-xs text-muted-foreground">{r.position}</span>
            {r.playerName}
            {r.goals > 0 && <span className="ml-1">{"⚽".repeat(Math.min(r.goals, 4))}</span>}
            {r.assists > 0 && <span className="ml-1 text-xs text-muted-foreground">{r.assists}A</span>}
            {r.red && <span className="ml-1">🟥</span>}
            {!r.red && r.yellow > 0 && <span className="ml-1">🟨</span>}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${ratingColor(r.rating)}`}>
            {r.rating.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide">Notas del partido</h3>
      {mvp && (
        <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
          <span className="font-bold">MVP:</span> {mvp.playerName} ({mvp.rating.toFixed(1)})
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {render("home", homeName)}
        {render("away", awayName)}
      </div>
    </div>
  );
}

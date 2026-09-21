import { Player } from "@/data/players";
import { staminaTone } from "@/lib/liveMatch";

function shortName(name: string) {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length <= 1) return name;
  return parts[parts.length - 1];
}

function toneClass(value: number) {
  const tone = staminaTone(value);
  if (tone === "danger") return "text-destructive";
  if (tone === "warn") return "text-amber-300";
  return "text-emerald-300";
}

export function PitchEnergyPanel({
  players,
  stamina,
  side = "left",
}: {
  players: Player[];
  stamina: Record<string, number>;
  side?: "left" | "right";
}) {
  if (!players.length || !Object.keys(stamina).length) return <div />;

  return (
    <div className={`flex h-full min-w-0 flex-col justify-center gap-1.5 ${side === "right" ? "items-end" : "items-start"}`}>
      <div className={`mb-0.5 text-[0.5rem] font-black uppercase tracking-[0.14em] text-muted-foreground ${side === "right" ? "text-right" : "text-left"}`}>Energía</div>
      {players.map((player) => {
        const value = Math.max(0, Math.min(100, stamina[player.id] ?? 100));
        return (
          <div key={player.id} className="w-full min-w-0 rounded-md border border-border/40 bg-background/45 px-1.5 py-1">
            <div className={`flex items-center gap-1 ${side === "right" ? "justify-end" : "justify-start"}`}>
              {side === "left" && <span className="truncate text-[0.5rem] font-bold text-muted-foreground">{shortName(player.name)}</span>}
              <span className={`shrink-0 text-[0.5rem] font-black tabular-nums ${toneClass(value)}`}>{Math.round(value)}</span>
              {side === "right" && <span className="truncate text-[0.5rem] font-bold text-muted-foreground">{shortName(player.name)}</span>}
            </div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${value >= 70 ? "bg-emerald-400" : value >= 40 ? "bg-amber-400" : "bg-destructive"}`}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

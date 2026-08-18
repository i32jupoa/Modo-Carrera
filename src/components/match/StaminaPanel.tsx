import { staminaTone } from "@/lib/liveMatch";

type P = { id: string; name: string; position: string; rating?: number };

export function StaminaBar({ value }: { value: number }) {
  const tone = staminaTone(value);
  const color = tone === "ok" ? "bg-primary" : tone === "warn" ? "bg-yellow-400" : "bg-destructive";
  return (
    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
      <div
        className={`h-full ${color} transition-all`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function StaminaPanel({
  players,
  stamina,
}: {
  players: P[];
  stamina: Record<string, number>;
}) {
  if (players.length === 0) return null;
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm">Energía de tus jugadores</h3>
        <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          Bajo 40% cae el rendimiento
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {players.map((p) => {
          const st = stamina[p.id] ?? 100;
          return (
            <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-[0.6rem] font-bold text-muted-foreground w-8">
                    {p.position}
                  </span>
                  <span className="truncate text-xs font-semibold">{p.name}</span>
                </div>
                <div className="mt-1">
                  <StaminaBar value={st} />
                </div>
              </div>
              <span className="shrink-0 scoreline text-xs tabular-nums text-muted-foreground w-9 text-right">
                {Math.round(st)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

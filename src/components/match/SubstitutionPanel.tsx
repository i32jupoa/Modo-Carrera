import { useState } from "react";
import { btnGhost, btnPrimary, btnSecondary, infoChip } from "./matchUi";
import { StaminaBar } from "./StaminaPanel";
import { ArrowLeftRight, X } from "lucide-react";

type P = { id: string; name: string; position: string; rating?: number };

export function SubstitutionPanel({
  onPitch,
  bench,
  stamina,
  subsUsed,
  maxSubs,
  windowsUsed,
  maxWindows,
  freeWindow,
  forcedOutId,
  onConfirm,
  onClose,
  onPlayShort,
}: {
  onPitch: P[];
  bench: P[];
  stamina: Record<string, number>;
  subsUsed: number;
  maxSubs: number;
  windowsUsed: number;
  maxWindows: number;
  freeWindow: boolean;
  forcedOutId?: string | null;
  onConfirm: (pairs: { outId: string; inId: string }[]) => void;
  onClose: () => void;
  onPlayShort?: () => void;
}) {
  const [pairs, setPairs] = useState<{ outId: string; inId: string }[]>([]);
  const [pendingOut, setPendingOut] = useState<string | null>(forcedOutId ?? null);

  const usedOut = new Set(pairs.map((p) => p.outId));
  const usedIn = new Set(pairs.map((p) => p.inId));
  const remaining = maxSubs - subsUsed - pairs.length;
  const canAddMore = remaining > 0;

  function pickIn(inId: string) {
    if (!pendingOut || !canAddMore) return;
    setPairs((prev) => [...prev, { outId: pendingOut, inId }]);
    setPendingOut(null);
  }

  const nameOf = (id: string) =>
    onPitch.find((p) => p.id === id)?.name ?? bench.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="panel p-5 mt-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-bold truncate">Cambios</h3>
          <p className="text-xs text-muted-foreground">
            {forcedOutId
              ? "Cambio forzado por lesión: elige el sustituto."
              : pendingOut
                ? `Sale ${nameOf(pendingOut)} — elige quién entra.`
                : "Elige el jugador que sale."}
          </p>
        </div>
        <button className={btnGhost} onClick={onClose} type="button">
          <X className="h-3.5 w-3.5" /> Cerrar
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className={infoChip}>Cambios {subsUsed + pairs.length}/{maxSubs}</span>
        <span className={infoChip}>
          Ventanas {windowsUsed + (pairs.length > 0 && !freeWindow ? 1 : 0)}/{maxWindows}
        </span>
        {freeWindow && <span className={infoChip}>Descanso · no gasta ventana</span>}
      </div>

      {pairs.length > 0 && (
        <ul className="mb-4 space-y-1">
          {pairs.map((p, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <ArrowLeftRight className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">
                <span className="text-destructive">{nameOf(p.outId)}</span> →{" "}
                <span className="text-primary font-semibold">{nameOf(p.inId)}</span>
              </span>
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={() => setPairs((prev) => prev.filter((_, j) => j !== i))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2">En el campo</div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {onPitch.map((p) => {
              const disabled = usedOut.has(p.id) || (!!forcedOutId && p.id !== forcedOutId);
              const active = pendingOut === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPendingOut(p.id)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition disabled:opacity-30 ${
                    active ? "border-primary bg-primary/10" : "border-border/70 hover:border-accent"
                  }`}
                >
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                    <span className="text-[0.6rem] font-bold text-muted-foreground w-8">{p.position}</span>
                    <span className="truncate text-xs font-semibold">{p.name}</span>
                    <span className="scoreline text-xs tabular-nums text-muted-foreground">
                      {Math.round(stamina[p.id] ?? 100)}%
                    </span>
                  </div>
                  <div className="mt-1.5"><StaminaBar value={stamina[p.id] ?? 100} /></div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2">Banquillo</div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {bench.length === 0 && (
              <p className="text-xs text-muted-foreground">No quedan suplentes disponibles.</p>
            )}
            {bench.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={usedIn.has(p.id) || !pendingOut || !canAddMore}
                onClick={() => pickIn(p.id)}
                className="w-full text-left rounded-lg border border-border/70 px-3 py-2 transition hover:border-accent disabled:opacity-30"
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="text-[0.6rem] font-bold text-muted-foreground w-8">{p.position}</span>
                  <span className="truncate text-xs font-semibold">{p.name}</span>
                  <span className="scoreline text-xs tabular-nums text-muted-foreground">
                    {p.rating ?? ""}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 justify-end">
        {forcedOutId && onPlayShort && (
          <button type="button" className={btnSecondary} onClick={onPlayShort}>
            Jugar con uno menos
          </button>
        )}
        <button
          type="button"
          className={btnPrimary}
          disabled={pairs.length === 0}
          onClick={() => onConfirm(pairs)}
        >
          Confirmar {pairs.length > 0 ? `(${pairs.length})` : ""}
        </button>
      </div>
    </div>
  );
}

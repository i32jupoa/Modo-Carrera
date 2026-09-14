import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { TEAMS } from "@/data/teams";
import { formatEuro } from "@/store/playersStore";
import { windowForDate } from "@/lib/transferWindows";

interface PlayerOption {
  id: string;
  name: string;
  ovr: number;
  age: number;
}

interface Props {
  player: PlayerOption;
  currentClubId: string;
  currentDate: string;
  onClose: () => void;
  onSubmit: (input: {
    borrowerClubId: string;
    loanFee: number;
    wageShare: number;
    durationMonths: number;
  }) => void;
}

export function LoanOutModal({
  player,
  currentClubId,
  currentDate,
  onClose,
  onSubmit,
}: Props) {
  const winter = windowForDate(currentDate) === "winter";
  const durationMonths = winter ? 6 : 12;
  const destinations = useMemo(
    () => TEAMS.filter((team) => team.id !== currentClubId).sort((a, b) => a.name.localeCompare(b.name)),
    [currentClubId],
  );
  const [borrowerClubId, setBorrowerClubId] = useState(destinations[0]?.id ?? "");
  const [fee, setFee] = useState(0.25);
  const [wageShare, setWageShare] = useState(70);

  const submit = () => {
    if (!borrowerClubId) return;
    onSubmit({
      borrowerClubId,
      loanFee: Math.round(Math.max(0, fee) * 1_000_000),
      wageShare: wageShare / 100,
      durationMonths,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-auto">
      <div className="panel w-full max-w-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground font-bold">
              Proponer cesión
            </p>
            <h3 className="text-xl font-black">{player.name}</h3>
            <p className="text-xs text-muted-foreground">{player.ovr} media · {player.age} años</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl border border-border/50 bg-secondary/30 p-3 text-xs">
          <p>Duración automática: <span className="font-black text-foreground">{durationMonths} meses</span> ({winter ? "ventana de invierno" : "ventana de verano"}).</p>
          <p className="text-muted-foreground mt-1">El jugador seguirá perteneciendo a tu club y volverá automáticamente al terminar la cesión.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Club receptor</label>
          <select
            value={borrowerClubId}
            onChange={(e) => setBorrowerClubId(e.target.value)}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
          >
            {destinations.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Prima de cesión (M €)</label>
            <input
              type="number"
              min={0}
              step={0.05}
              value={fee}
              onChange={(e) => setFee(Math.max(0, Number(e.target.value)))}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-bold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">% de ficha que paga el club receptor</label>
            <select
              value={100 - wageShare}
              onChange={(e) => setWageShare(100 - Number(e.target.value))}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
            >
              {[0, 10, 20, 30, 40, 50, 60, 70, 80].map((receiverShare) => (
                <option key={receiverShare} value={receiverShare}>{receiverShare}%</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Tú asumirías el {wageShare}% de la ficha durante la cesión.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={submit}
            className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg font-bold"
          >
            Enviar propuesta
          </button>
          <button type="button" onClick={onClose} className="flex-1 bg-secondary py-2 rounded-lg font-bold">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

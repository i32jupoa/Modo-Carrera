import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { TEAMS } from "@/data/teams";
import { formatEuro } from "@/store/playersStore";
import { windowForDate } from "@/lib/transferWindows";
import type { SquadRole } from "@/lib/transfers";

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
  currentRole?: SquadRole;
  onClose: () => void;
  onSubmit: (input: {
    borrowerClubId: string;
    loanFee: number;
    wageShare: number;
    durationMonths: number;
    squadRole?: SquadRole;
  }) => void;
}

export function LoanOutModal({
  player,
  currentClubId,
  currentDate,
  currentRole,
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
  const [squadRole, setSquadRole] = useState<SquadRole>(currentRole ?? (player.age <= 21 && player.ovr < 78 ? "prospect" : player.ovr >= 88 ? "star" : player.ovr >= 82 ? "starter" : player.ovr >= 76 ? "rotation" : "secondary"));

  const submit = () => {
    if (!borrowerClubId) return;
    onSubmit({
      borrowerClubId,
      loanFee: Math.round(Math.max(0, fee) * 1_000_000),
      // El motor guarda el porcentaje del club receptor; la interfaz siempre
      // trabaja con el porcentaje que paga mi club.
      wageShare: (100 - wageShare) / 100,
      durationMonths,
      squadRole,
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
          <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Club con el que quieres negociar</label>
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
            <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">% de ficha que paga mi club</label>
            <select
              value={wageShare}
              onChange={(e) => setWageShare(Number(e.target.value))}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
            >
              {Array.from({ length: 21 }, (_, index) => index * 5).map((share) => (
                <option key={share} value={share}>{share}%</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{`Rol previsto en ${destinations.find((team) => team.id === borrowerClubId)?.name ?? "el club seleccionado"}`}</label>
          <select
            value={squadRole}
            onChange={(e) => setSquadRole(e.target.value as SquadRole)}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-semibold"
          >
            <option value="star">Estrella</option>
            <option value="starter">Titular</option>
            <option value="rotation">Rotación</option>
            <option value="secondary">Rol Secundario</option>
            <option value="prospect">Futuro del club / Promesa</option>
          </select>
        </div>

        <p className="text-xs text-muted-foreground">
          Mi club asumirá el {wageShare}% de la ficha durante la cesión.
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

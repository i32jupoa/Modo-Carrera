import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamLogo } from "@/components/TeamLogo";
import { formatEuro, marketValueEuros, type FcPlayer } from "@/store/playersStore";
import { getPlayerAnnualWage } from "@/lib/transfers";
import { buildPositions, formatShortPositions } from "@/lib/positions";
import type { ScoutingReport } from "@/lib/transfers";
import type { ComponentType } from "react";
import { Target, TrendingUp, Shield, Zap, Crosshair, Dumbbell } from "lucide-react";

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
      <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <div className="font-black mt-1">{value}</div>
    </div>
  );
}

export function ScoutingDetailsModal({
  player,
  report,
  open,
  onClose,
}: {
  player: FcPlayer | null;
  report: ScoutingReport | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!player) return null;

  const positions = buildPositions(player.Position, player["Alternative positions"]);
  const alternatives = positions.slice(1);
  const value = report?.valuation?.marketValue ?? marketValueEuros(player, "", "", 75);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">Informe de ojeador</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 items-start border-b border-border/60 pb-4">
          <div className="w-20 h-24 rounded-xl overflow-hidden bg-secondary/60 shrink-0">
            {player.card ? <img src={player.card} alt="" className="w-full h-full object-cover object-top" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-2xl font-black truncate">{player.Name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{formatShortPositions(positions.slice(0, 1))} · {player.Age} años</p>
                {alternatives.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    También: {formatShortPositions(alternatives)}
                  </p>
                )}
              </div>
              <div className="rounded-xl border px-3 py-2 text-center bg-secondary/40">
                <div className="text-[0.6rem] uppercase text-muted-foreground font-bold">Media</div>
                <div className="text-2xl font-black scoreline">{player.OVR}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
              <TeamLogo teamName={player.Team} leagueName={player.League} size={20} />
              <span>{player.Team}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Stat label="Potencial" value={player.potential ?? player.OVR} icon={TrendingUp} />
          <Stat label="Valor de mercado" value={formatEuro(value)} icon={Target} />
          <Stat label="Salario" value={`${formatEuro(getPlayerAnnualWage(String(player.ID)))}/año`} />
          <Stat label="Cláusula" value={report ? formatEuro(report.releaseClause) : "—"} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          <Stat label="Velocidad" value={player.PAC} icon={Zap} />
          <Stat label="Tiro" value={player.SHO} icon={Crosshair} />
          <Stat label="Pase" value={player.PAS} icon={Target} />
          <Stat label="Regate" value={player.DRI} icon={TrendingUp} />
          <Stat label="Defensa" value={player.DEF} icon={Shield} />
          <Stat label="Físico" value={player.PHY} icon={Dumbbell} />
        </div>

        {report && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Petición del club" value={formatEuro(report.askingPrice)} />
            <Stat label="Competencia" value={report.competition} />
            <Stat label="Años de contrato" value={report.contractYearsLeft} />
            <Stat label="Disponible" value={report.available ? "Sí" : "No"} />
            <Stat label="En venta" value={report.transferListed ? "Sí" : "No"} />
            <Stat label="Quiere salir" value={report.wantsOut ? "Sí" : "No"} />
            <Stat label="Demanda salarial" value={`${formatEuro(report.wageDemand)}/año`} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

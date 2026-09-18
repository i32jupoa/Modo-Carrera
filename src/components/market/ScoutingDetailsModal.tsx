import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamLogo } from "@/components/TeamLogo";
import { formatEuro, marketValueEuros, type FcPlayer } from "@/store/playersStore";
import { getPlayerAnnualWage } from "@/lib/transfers";
import { buildPositions, formatShortPositions } from "@/lib/positions";
import type { ScoutingReport, ScoutingEntry } from "@/lib/transfers";
import { estimateScoutingMoney, estimateScoutingPotential } from "@/lib/transfers/ScoutingReport";
import type { ComponentType } from "react";
import { Target, TrendingUp, Shield, Zap, Crosshair, Dumbbell, SearchCheck } from "lucide-react";

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
      <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <div className="font-black mt-1 break-words">{value}</div>
    </div>
  );
}

function formatEstimate(estimate: ReturnType<typeof estimateScoutingMoney>): string {
  if (estimate.kind === "unknown") return "No encontrado";
  if (estimate.kind === "exact") return formatEuro(estimate.value);
  return `${formatEuro(estimate.min)} – ${formatEuro(estimate.max)}`;
}

export function ScoutingDetailsModal({
  player,
  report,
  scoutingEntry,
  open,
  onClose,
}: {
  player: FcPlayer | null;
  report: ScoutingReport | null;
  scoutingEntry?: ScoutingEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!player) return null;

  const positions = buildPositions(player.Position, player["Alternative positions"]);
  const alternatives = positions.slice(1);
  const marketValue = report?.valuation?.marketValue ?? marketValueEuros(player, "", "", 75);
  const rawOvr = Number(player.OVR);
  const safeOvr = Number.isFinite(rawOvr) ? Math.round(rawOvr) : 0;
  const rawPotential = Number(player.potential);
  const safePotential = Number.isFinite(rawPotential)
    ? Math.max(safeOvr, Math.round(rawPotential))
    : safeOvr;
  const potential = scoutingEntry
    ? estimateScoutingPotential(safePotential, scoutingEntry)
    : { kind: "exact", value: safePotential } as const;
  const salary = scoutingEntry
    ? estimateScoutingMoney(getPlayerAnnualWage(String(player.ID)), scoutingEntry, "salary")
    : { kind: "exact", value: getPlayerAnnualWage(String(player.ID)) } as const;
  const value = scoutingEntry
    ? estimateScoutingMoney(marketValue, scoutingEntry, "value")
    : { kind: "exact", value: marketValue } as const;
  const releaseClause = report?.releaseClause ?? 0;
  const release = releaseClause > 0 && scoutingEntry
    ? estimateScoutingMoney(releaseClause, scoutingEntry, "release")
    : { kind: "unknown" } as const;
  const askingPrice = report && scoutingEntry ? estimateScoutingMoney(report.askingPrice, scoutingEntry, "asking") : null;
  const wageDemand = report && scoutingEntry ? estimateScoutingMoney(report.wageDemand, scoutingEntry, "wage-demand") : null;
  const ratingLabel = scoutingEntry ? `${scoutingEntry.scoutRating.toLocaleString("es-ES")}★` : "—";

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="text-xl font-black">Informe de ojeador</DialogTitle>
            {scoutingEntry && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[0.65rem] font-black text-primary">
                <SearchCheck className="h-3.5 w-3.5" /> {ratingLabel} ojeador
              </span>
            )}
          </div>
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
                  <p className="text-xs text-muted-foreground mt-0.5">También: {formatShortPositions(alternatives)}</p>
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
          <Stat label="Potencial" value={potential.kind === "unknown" ? "No encontrado" : potential.kind === "exact" ? potential.value : `${potential.min} – ${potential.max}`} icon={TrendingUp} />
          <Stat label="Valor de mercado" value={formatEstimate(value)} icon={Target} />
          <Stat label="Salario" value={salary.kind === "unknown" ? "No encontrado" : `${formatEstimate(salary)}/año`} />
          <Stat label="Cláusula" value={formatEstimate(release)} />
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
            <Stat label="Petición del club" value={askingPrice ? formatEstimate(askingPrice) : "—"} />
            <Stat label="Competencia" value={report.competition} />
            <Stat label="Años de contrato" value={report.contractYearsLeft} />
            <Stat label="Disponible" value={report.available ? "Sí" : "No"} />
            <Stat label="En venta" value={report.transferListed ? "Sí" : "No"} />
            <Stat label="Quiere salir" value={report.wantsOut ? "Sí" : "No"} />
            <Stat label="Demanda salarial" value={wageDemand ? `${formatEstimate(wageDemand)}/año` : "—"} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

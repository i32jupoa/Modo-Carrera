import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamLogo } from "@/components/TeamLogo";
import { formatEuro, marketValueEuros, type FcPlayer } from "@/store/playersStore";
import { getPlayerAnnualWage } from "@/lib/transfers";
import { buildPositions, formatShortPositions } from "@/lib/positions";
import type { ScoutingReport, ScoutingEntry } from "@/lib/transfers";
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

type Estimate =
  | { kind: "exact"; value: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "unknown" };

type ReportQuality = {
  potentialSpreadMin: number;
  potentialSpreadMax: number;
  salarySpread: number;
  valueSpread: number;
  unknownChance: number;
};

const QUALITY: Record<number, ReportQuality> = {
  0.5: { potentialSpreadMin: 5, potentialSpreadMax: 9, salarySpread: 0.30, valueSpread: 0.28, unknownChance: 0.30 },
  1: { potentialSpreadMin: 5, potentialSpreadMax: 8, salarySpread: 0.24, valueSpread: 0.23, unknownChance: 0.22 },
  1.5: { potentialSpreadMin: 4, potentialSpreadMax: 7, salarySpread: 0.20, valueSpread: 0.19, unknownChance: 0.18 },
  2: { potentialSpreadMin: 4, potentialSpreadMax: 6, salarySpread: 0.17, valueSpread: 0.16, unknownChance: 0.14 },
  2.5: { potentialSpreadMin: 3, potentialSpreadMax: 6, salarySpread: 0.14, valueSpread: 0.13, unknownChance: 0.11 },
  3: { potentialSpreadMin: 3, potentialSpreadMax: 5, salarySpread: 0.11, valueSpread: 0.10, unknownChance: 0.08 },
  3.5: { potentialSpreadMin: 2, potentialSpreadMax: 4, salarySpread: 0.09, valueSpread: 0.08, unknownChance: 0.06 },
  4: { potentialSpreadMin: 2, potentialSpreadMax: 3, salarySpread: 0.07, valueSpread: 0.06, unknownChance: 0.04 },
  4.5: { potentialSpreadMin: 1, potentialSpreadMax: 2, salarySpread: 0.05, valueSpread: 0.045, unknownChance: 0.02 },
  5: { potentialSpreadMin: 0, potentialSpreadMax: 1, salarySpread: 0.025, valueSpread: 0.02, unknownChance: 0.005 },
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: string): number {
  let value = hashString(seed) || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 1_000_000) / 1_000_000;
}

function seededInt(seed: string, min: number, max: number): number {
  return Math.floor(min + seededUnit(seed) * (max - min + 1));
}

function estimatePotential(player: FcPlayer, entry?: ScoutingEntry): Estimate {
  if (!entry) return { kind: "exact", value: Number(player.potential ?? player.OVR) };
  const quality = QUALITY[entry.scoutRating] ?? QUALITY[0.5];
  if (seededUnit(`${entry.playerId}:${entry.startedAt}:potential:unknown`) < quality.unknownChance) {
    return { kind: "unknown" };
  }
  const actual = Math.max(player.OVR, Number(player.potential ?? player.OVR));
  const spread = seededInt(
    `${entry.playerId}:${entry.startedAt}:potential:spread`,
    quality.potentialSpreadMin,
    quality.potentialSpreadMax,
  );
  if (spread === 0) return { kind: "exact", value: actual };
  return { kind: "range", min: Math.max(1, actual - spread), max: Math.min(99, actual + spread) };
}

function estimateMoney(value: number, entry: ScoutingEntry | undefined, field: string): Estimate {
  if (!entry) return { kind: "exact", value };
  const quality = QUALITY[entry.scoutRating] ?? QUALITY[0.5];
  if (seededUnit(`${entry.playerId}:${entry.startedAt}:${field}:unknown`) < quality.unknownChance * 0.9) {
    return { kind: "unknown" };
  }
  const spread = field === "salary" ? quality.salarySpread : quality.valueSpread;
  if (spread <= 0.03) {
    const rounded = Math.round(value / 50_000) * 50_000;
    if (seededUnit(`${entry.playerId}:${entry.startedAt}:${field}:exact`) > 0.18) {
      return { kind: "exact", value: rounded };
    }
    return { kind: "range", min: Math.max(0, rounded - 100_000), max: rounded + 100_000 };
  }
  const jitter = seededUnit(`${entry.playerId}:${entry.startedAt}:${field}:jitter`);
  const lowFactor = Math.max(0.05, 1 - spread * (0.75 + jitter * 0.5));
  const highFactor = 1 + spread * (0.75 + (1 - jitter) * 0.5);
  const unit = value >= 10_000_000 ? 100_000 : 50_000;
  return {
    kind: "range",
    min: Math.max(0, Math.round((value * lowFactor) / unit) * unit),
    max: Math.round((value * highFactor) / unit) * unit,
  };
}

function formatEstimate(estimate: Estimate): string {
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
  const potential = estimatePotential(player, scoutingEntry);
  const salary = estimateMoney(getPlayerAnnualWage(String(player.ID)), scoutingEntry, "salary");
  const value = estimateMoney(marketValue, scoutingEntry, "value");
  const releaseClause = report?.releaseClause ?? 0;
  const release = releaseClause > 0 ? estimateMoney(releaseClause, scoutingEntry, "release") : { kind: "unknown" } as const;
  const askingPrice = report ? estimateMoney(report.askingPrice, scoutingEntry, "asking") : null;
  const wageDemand = report ? estimateMoney(report.wageDemand, scoutingEntry, "wage-demand") : null;
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

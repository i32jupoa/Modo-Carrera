import { X, History, CheckCircle2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatEuro, fcPlayerById } from "@/store/playersStore";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";
import type { SquadRole, TransferRecord } from "@/lib/transfers";

const ROLE_LABELS: Record<SquadRole, string> = {
  star: "Estrella",
  starter: "Titular",
  rotation: "Rotación",
  secondary: "Rol Secundario",
  prospect: "Futuro del club / Promesa",
};

function typeLabel(type: TransferRecord["type"]): string {
  if (type === "loan") return "Cesión";
  if (type === "loan-option") return "Cesión con opción de compra";
  if (type === "loan-obligation") return "Cesión con compra obligatoria";
  if (type === "free") return "Agente libre";
  return "Fichaje";
}

function leagueName(clubId: string | null): string {
  if (!clubId) return "";
  const team = teamById(clubId);
  return team ? (LEAGUES[team.league as LeagueId]?.name ?? team.league) : "";
}

export function NegotiationDetailsModal({
  record,
  direction,
  onClose,
}: {
  record: TransferRecord;
  direction: "in" | "out";
  onClose: () => void;
}) {
  const player = fcPlayerById(record.playerId);
  const rivalId = direction === "in" ? record.fromClubId : record.toClubId;
  const rival = rivalId ? teamById(rivalId) : null;
  const snapshot = record.userNegotiation;
  const role = record.clauses.squadRole;
  const isLoan = record.type.startsWith("loan");
  const destinationShare = Math.round((record.clauses.wageShare ?? 0) * 100);
  const ownerShare = 100 - destinationShare;

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
      <div className="panel w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 space-y-5">
        <div className="flex items-start gap-3">
          <PlayerFace
            name={record.playerName}
            image={player?.card}
            role={roleFromPosition(player?.Position ?? "MID")}
            size={70}
            showRing={false}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-xl truncate">{record.playerName}</h3>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-wider text-primary">
                {typeLabel(record.type)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {rival && <TeamLogo teamName={rival.name} leagueName={leagueName(rival.id)} size={28} />}
              <span className="text-sm font-bold">{rival?.name ?? "Agente libre"}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {direction === "in" ? "Entrada a tu club" : "Salida de tu club"} · {record.date}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Info label={isLoan ? "Prima de cesión" : "Importe"} value={formatEuro(record.fee)} />
          <Info label="Ficha anual" value={`${formatEuro(record.wage)}/año`} />
          <Info label="Rol acordado" value={role ? ROLE_LABELS[role] : "No especificado"} />
          <Info label="Rondas" value={String(snapshot?.rounds ?? "—")} />
        </div>

        {isLoan && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Info label="Destino paga" value={`${destinationShare}%`} />
            <Info label="Tú pagas" value={`${ownerShare}%`} />
            <Info label="Duración" value={`${record.clauses.loanDurationMonths || 12} meses`} />
            {record.type !== "loan" && (
              <Info label={record.type === "loan-option" ? "Opción de compra" : "Compra obligatoria"} value={formatEuro(record.clauses.optionFee)} />
            )}
          </div>
        )}

        {record.type === "permanent" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border/50 bg-secondary/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Porcentaje de futura venta: </span>
              <span className="font-black">{Math.round(record.clauses.sellOnPercent * 100)}%</span>
            </div>
            <div className="rounded-xl border border-border/50 bg-secondary/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Años de contrato: </span>
              <span className="font-black">{record.clauses.contractYears ?? "—"}</span>
            </div>
          </div>
        )}

        {snapshot?.clubMessage && (
          <div className="rounded-xl border border-border/50 bg-secondary/40 p-3 text-sm">
            <p className="text-[0.62rem] uppercase tracking-wider text-muted-foreground font-black">Respuesta del club</p>
            <p className="mt-1 font-semibold">{snapshot.clubMessage}</p>
          </div>
        )}
        {snapshot?.playerMessage && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
            <p className="text-[0.62rem] uppercase tracking-wider text-emerald-400 font-black">Respuesta del jugador</p>
            <p className="mt-1 font-semibold">{snapshot.playerMessage}</p>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-primary" />
            <h4 className="font-black">Historial de la negociación</h4>
          </div>
          {snapshot?.log?.length ? (
            <div className="space-y-2">
              {snapshot.log.map((entry, index) => (
                <div key={`${entry.date}-${index}`} className="flex gap-3 rounded-xl border border-border/40 bg-secondary/30 p-3">
                  <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center">
                    {index === snapshot.log.length - 1 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-[0.62rem] font-black">{index + 1}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.62rem] uppercase tracking-wider text-muted-foreground font-black">{entry.date}</p>
                    <p className="mt-0.5 text-sm">{entry.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Esta operación se registró antes de guardar el historial detallado de negociaciones.</p>
          )}
        </div>

        <button type="button" onClick={onClose} className="w-full rounded-xl bg-secondary px-4 py-2.5 font-bold hover:bg-secondary/80">
          Cerrar detalles
        </button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 border border-border/40 p-2.5">
      <p className="text-[0.58rem] uppercase font-black tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs font-black">{value}</p>
    </div>
  );
}

import { useState } from "react";
import { teamById } from "@/data/teams";
import { formatEuro } from "@/store/playersStore";
import { stageLabel, type UserDeal } from "@/lib/transfers";

interface Props {
  deal: UserDeal;
  onImprove: (dealId: string, amount: number, wage: number) => void;
  onAcceptDemand: (dealId: string) => void;
  onImproveWage: (dealId: string, wage: number) => void;
  onConfirm: (dealId: string) => void;
  onAbandon: (dealId: string) => void;
  onAcceptIncoming: (dealId: string) => void;
  onCounterIncoming: (dealId: string, demand: number) => void;
  onRejectIncoming: (dealId: string) => void;
}

function clubName(clubId: string): string {
  try {
    return teamById(clubId)?.name ?? clubId;
  } catch {
    return clubId;
  }
}

const STAGE_TONE: Record<string, string> = {
  "waiting-club": "border-border/60 text-muted-foreground",
  "club-counter": "border-yellow-500/40 text-yellow-400",
  "club-waiting": "border-blue-500/40 text-blue-300",
  "player-terms": "border-primary/50 text-primary",
  ready: "border-green-500/50 text-green-400",
  incoming: "border-yellow-500/40 text-yellow-400",
  completed: "border-green-500/40 text-green-400",
  failed: "border-destructive/40 text-destructive",
};

/** Tarjeta de una negociación: estado, mensajes del club/jugador y acciones. */
export function DealCard({
  deal,
  onImprove,
  onAcceptDemand,
  onImproveWage,
  onConfirm,
  onAbandon,
  onAcceptIncoming,
  onCounterIncoming,
  onRejectIncoming,
}: Props) {
  const [amount, setAmount] = useState(Math.round(deal.offer.amount / 100_000) / 10);
  const [wage, setWage] = useState(Math.round(deal.offer.wageOffer / 100_000) / 10);
  const [demand, setDemand] = useState(
    Math.round((deal.valuation.idealPrice || deal.offer.amount) / 100_000) / 10,
  );
  const closed = deal.stage === "completed" || deal.stage === "failed";

  return (
    <article
      className={`panel p-4 space-y-3 border ${STAGE_TONE[deal.stage] ?? "border-border/60"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold truncate">{deal.playerName}</p>
          <p className="text-xs text-muted-foreground">
            {deal.direction === "in" ? "Compra a " : "Venta a "}
            {clubName(deal.otherClubId)} · ronda {deal.rounds}
          </p>
        </div>
        <span className="text-[0.65rem] uppercase tracking-wider font-bold shrink-0">
          {stageLabel(deal.stage)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Cell label="Tu oferta" value={formatEuro(deal.offer.amount)} />
        <Cell label="Ficha" value={`${formatEuro(deal.offer.wageOffer)}/año`} />
        {deal.clubDemand > 0 && <Cell label="El club pide" value={formatEuro(deal.clubDemand)} />}
        {deal.playerWageDemand > 0 && (
          <Cell label="El jugador pide" value={`${formatEuro(deal.playerWageDemand)}/año`} />
        )}
        {deal.offer.clauses.addOns > 0 && (
          <Cell label="Variables" value={formatEuro(deal.offer.clauses.addOns)} />
        )}
        {deal.offer.clauses.sellOnPercent > 0 && (
          <Cell
            label="Futura venta"
            value={`${Math.round(deal.offer.clauses.sellOnPercent * 100)}%`}
          />
        )}
      </div>

      {deal.clubMessage && <p className="text-xs text-muted-foreground">{deal.clubMessage}</p>}
      {deal.playerMessage && <p className="text-xs text-primary">{deal.playerMessage}</p>}

      {!closed && deal.stage === "club-counter" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <NumberInput label="Nueva oferta (M €)" value={amount} onChange={setAmount} />
            <NumberInput label="Ficha (M €)" value={wage} onChange={setWage} step={0.1} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Action
              label={`Igualar ${formatEuro(deal.clubDemand)}`}
              onClick={() => onAcceptDemand(deal.id)}
              primary
            />
            <Action
              label="Mejorar oferta"
              onClick={() =>
                onImprove(deal.id, Math.round(amount * 1_000_000), Math.round(wage * 1_000_000))
              }
            />
            <Action label="Retirarse" onClick={() => onAbandon(deal.id)} />
          </div>
        </div>
      )}

      {!closed && deal.stage === "club-waiting" && (
        <div className="flex flex-wrap gap-2">
          <NumberInput label="Subir oferta (M €)" value={amount} onChange={setAmount} />
          <Action
            label="Mejorar"
            primary
            onClick={() => onImprove(deal.id, Math.round(amount * 1_000_000), deal.offer.wageOffer)}
          />
          <Action label="Retirarse" onClick={() => onAbandon(deal.id)} />
        </div>
      )}

      {!closed && deal.stage === "player-terms" && (
        <div className="flex flex-wrap items-end gap-2">
          <NumberInput label="Ficha ofrecida (M €)" value={wage} onChange={setWage} step={0.1} />
          <Action
            label="Ofrecer ficha"
            primary
            onClick={() => onImproveWage(deal.id, Math.round(wage * 1_000_000))}
          />
          <Action label="Abandonar" onClick={() => onAbandon(deal.id)} />
        </div>
      )}

      {!closed && deal.stage === "ready" && (
        <div className="flex flex-wrap gap-2">
          <Action
            label={deal.direction === "in" ? "Cerrar fichaje" : "Cerrar venta"}
            primary
            onClick={() => onConfirm(deal.id)}
          />
          <Action label="Cancelar" onClick={() => onAbandon(deal.id)} />
        </div>
      )}

      {!closed && deal.stage === "incoming" && (
        <div className="flex flex-wrap items-end gap-2">
          <Action label="Aceptar venta" primary onClick={() => onAcceptIncoming(deal.id)} />
          <NumberInput label="Pedir (M €)" value={demand} onChange={setDemand} />
          <Action
            label="Contraofertar"
            onClick={() => onCounterIncoming(deal.id, Math.round(demand * 1_000_000))}
          />
          <Action label="Rechazar" onClick={() => onRejectIncoming(deal.id)} />
        </div>
      )}

      {!closed && deal.stage === "waiting-club" && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">
            Respuesta prevista: {deal.respondsOn}
          </span>
          <Action label="Retirar oferta" onClick={() => onAbandon(deal.id)} />
        </div>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Historial de la negociación
        </summary>
        <ul className="mt-2 space-y-1">
          {deal.log.map((entry, index) => (
            <li key={`${entry.date}-${index}`} className="text-muted-foreground">
              <span className="text-foreground">{entry.date}</span> · {entry.text}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/50 rounded px-2 py-1.5">
      <p className="text-[0.6rem] uppercase text-muted-foreground">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step = 0.5,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
      {label}
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="mt-1 w-32 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm font-bold text-foreground"
      />
    </label>
  );
}

function Action({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
        primary
          ? "bg-primary text-primary-foreground hover:brightness-110"
          : "bg-secondary hover:bg-secondary/70"
      }`}
    >
      {label}
    </button>
  );
}

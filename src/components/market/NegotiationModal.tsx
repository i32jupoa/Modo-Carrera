import { useState } from "react";
import { X } from "lucide-react";
import { formatEuro } from "@/store/playersStore";
import type { OfferClauses, ScoutingReport } from "@/lib/transfers";

interface Props {
  playerName: string;
  playerCard?: string;
  ovr: number;
  age: number;
  clubName: string;
  report: ScoutingReport | null;
  budget: number;
  onSubmit: (input: { amount: number; wageOffer: number; clauses: Partial<OfferClauses> }) => void;
  onClose: () => void;
}

const SELL_ON_OPTIONS = [0, 0.05, 0.1, 0.15];

/** Formulario de oferta: fijo, ficha, variables y % de futura venta. */
export function NegotiationModal({
  playerName,
  playerCard,
  ovr,
  age,
  clubName,
  report,
  budget,
  onSubmit,
  onClose,
}: Props) {
  const asking = report?.askingPrice ?? 0;
  const [amount, setAmount] = useState(Math.round(asking / 100_000) / 10);
  const [wage, setWage] = useState(Math.round((report?.wageDemand ?? 0) / 100_000) / 10);
  const [addOns, setAddOns] = useState(0);
  const [sellOn, setSellOn] = useState(0);

  const amountEuros = Math.round(amount * 1_000_000);
  const wageEuros = Math.round(wage * 1_000_000);
  const overBudget = amountEuros > budget;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-auto">
      <div className="panel w-full max-w-lg p-5 space-y-4">
        <div className="flex items-start gap-3">
          {playerCard && (
            <img src={playerCard} alt="" className="w-14 h-[4.5rem] object-cover rounded" />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-lg leading-tight truncate">{playerName}</h3>
            <p className="text-xs text-muted-foreground">
              {ovr} media · {age} años · {clubName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {report && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Info label="Valor de mercado" value={formatEuro(report.valuation.marketValue)} />
            <Info label="Precio de salida" value={formatEuro(report.askingPrice)} />
            <Info
              label="Horquilla del club"
              value={`${formatEuro(report.valuation.minimumPrice)} – ${formatEuro(report.valuation.idealPrice)}`}
            />
            <Info label="Techo estimado" value={formatEuro(report.valuation.maximumPrice)} />
            <Info label="Ficha que pide" value={`${formatEuro(report.wageDemand)}/año`} />
            <Info label="Contrato" value={`${report.contractYearsLeft} temporada(s)`} />
            <Info
              label="Competencia"
              value={report.competition > 0 ? `${report.competition} club(es)` : "Sin rivales"}
            />
          </div>
        )}

        {report && !report.available && (
          <p className="text-xs text-yellow-400">
            El club lo considera intransferible: hará falta una oferta muy por encima de su valor.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Traspaso (M €)" value={amount} onChange={setAmount} step={0.5} />
          <Field label="Ficha anual (M €)" value={wage} onChange={setWage} step={0.1} />
          <Field label="Variables (M €)" value={addOns} onChange={setAddOns} step={0.5} />
          <div className="space-y-1.5">
            <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              % futura venta
            </label>
            <select
              value={sellOn}
              onChange={(e) => setSellOn(Number(e.target.value))}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
            >
              {SELL_ON_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {Math.round(option * 100)}%
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Presupuesto disponible:{" "}
          <span className="text-foreground font-bold">{formatEuro(budget)}</span>
          {overBudget && (
            <span className="text-destructive"> · oferta por encima del presupuesto</span>
          )}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={overBudget || amountEuros <= 0}
            onClick={() =>
              onSubmit({
                amount: amountEuros,
                wageOffer: wageEuros,
                clauses: { addOns: Math.round(addOns * 1_000_000), sellOnPercent: sellOn },
              })
            }
            className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg font-bold disabled:opacity-40"
          >
            Enviar oferta
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-secondary py-2 rounded-lg font-bold"
          >
            Cancelar
          </button>
        </div>
        <p className="text-[0.65rem] text-muted-foreground">
          El club tardará entre 1 y 3 días en responder. Pagar la cláusula obliga a vender.
        </p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-3 py-2">
      <p className="text-[0.6rem] uppercase text-muted-foreground">{label}</p>
      <p className="font-bold text-sm">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-bold"
      />
    </div>
  );
}

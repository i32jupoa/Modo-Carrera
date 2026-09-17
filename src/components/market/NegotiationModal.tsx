import { useState } from "react";
import { X } from "lucide-react";
import { formatEuro } from "@/store/playersStore";
import { windowForDate } from "@/lib/transferWindows";
import type { OfferClauses, ScoutingReport, SquadRole } from "@/lib/transfers";

interface Props {
  playerName: string;
  playerCard?: string;
  ovr: number;
  age: number;
  clubName: string;
  report: ScoutingReport | null;
  budget: number;
  wageBudget?: number;
  wageBill?: number;
  currentWage?: number;
  currentDate: string;
  /**
   * El jugador acaba de fichar en firme esta misma ventana: no se puede
   * volver a ofertar por él en firme hasta la siguiente. El traspaso queda
   * bloqueado en el propio formulario (no como error al enviar) y solo cabe
   * negociar una cesión.
   */
  transferLocked?: boolean;
  onSubmit: (input: {
    amount: number;
    wageOffer: number;
    type: "permanent" | "loan" | "loan-option" | "loan-obligation";
    clauses: Partial<OfferClauses>;
  }) => void;
  onClose: () => void;
}

const SELL_ON_OPTIONS = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
const LOAN_DURATION_OPTIONS = [6, 12, 24] as const;
const LOAN_WAGE_SHARE_OPTIONS = Array.from({ length: 21 }, (_, index) => index * 5);

/** Formulario de oferta para traspasos y cesiones. */
export function NegotiationModal({
  playerName,
  playerCard,
  ovr,
  age,
  clubName,
  report,
  budget,
  wageBudget = 0,
  wageBill = 0,
  currentWage = 0,
  currentDate,
  transferLocked = false,
  onSubmit,
  onClose,
}: Props) {
  const asking = report?.askingPrice ?? 0;
  const [operation, setOperation] = useState<"transfer" | "loan">(
    transferLocked ? "loan" : "transfer",
  );
  const [loanType, setLoanType] = useState<"loan" | "loan-option" | "loan-obligation">("loan");
  const type = operation === "transfer" ? "permanent" : loanType;
  const [amount, setAmount] = useState(Math.round(asking / 100_000) / 10);
  const [sellOn, setSellOn] = useState(0);
  const [wageShare, setWageShare] = useState(50);
  const [loanSellOn, setLoanSellOn] = useState(0);
  const [loanOptionFee, setLoanOptionFee] = useState(Math.round((asking * 1.1) / 100_000) / 10);
  const [loanDurationMonths, setLoanDurationMonths] = useState<number>(
    windowForDate(currentDate) === "winter" ? 6 : 12,
  );

  const amountEuros = Math.round(amount * 1_000_000);
  const wageEuros = type === "permanent"
    ? Math.max(0, Math.round(report?.wageDemand ?? 0))
    : Math.max(0, Math.round(currentWage));
  const transferBudget = Math.max(0, budget - wageBudget);
  const wageCommitmentEuros = type === "permanent" ? 0 : Math.round(wageEuros * (wageShare / 100));
  const overBudget = amountEuros > transferBudget;
  const overWageBudget = wageCommitmentEuros > Math.max(0, wageBudget);

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

        {transferLocked && (
          <p className="text-xs text-amber-400">
            {playerName} acaba de fichar en firme esta ventana: solo se puede negociar una cesión hasta la próxima.
          </p>
        )}

        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
          <p className="text-[0.62rem] uppercase tracking-wider text-primary font-black">Paso 1 de 2</p>
          <p className="mt-0.5 font-black text-sm">Negociación con el club</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Primero se acuerdan únicamente las condiciones de la operación con el club. El rol, el salario y la duración del contrato se negocian con el jugador después de la aceptación del club.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            Tipo de operación
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={transferLocked}
              onClick={() => setOperation("transfer")}
              title={transferLocked ? "Recién fichado: no se puede ofertar en firme hasta la próxima ventana." : undefined}
              className={`rounded-xl border px-3 py-3 text-sm font-black transition ${
                transferLocked
                  ? "border-border/40 bg-secondary/40 text-muted-foreground/40 cursor-not-allowed"
                  : operation === "transfer"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Traspaso
            </button>
            <button
              type="button"
              onClick={() => setOperation("loan")}
              className={`rounded-xl border px-3 py-3 text-sm font-black transition ${
                operation === "loan"
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Cesión
            </button>
          </div>
        </div>

        {operation === "loan" && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/20 p-3">
            <div className="space-y-1.5">
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Condiciones de la cesión
              </label>
              <select
                value={loanType}
                onChange={(e) => setLoanType(e.target.value as "loan" | "loan-option" | "loan-obligation")}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="loan">Sin opción de compra</option>
                <option value="loan-option">Con opción de compra</option>
                <option value="loan-obligation">Con compra obligatoria</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Prima de cesión (M €)"
                value={amount}
                onChange={setAmount}
                step={0.05}
              />
              <div className="space-y-1.5">
                <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  Duración de la cesión
                </label>
                <select
                  value={loanDurationMonths}
                  onChange={(e) => setLoanDurationMonths(Number(e.target.value))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  {LOAN_DURATION_OPTIONS.map((months) => (
                    <option key={months} value={months}>
                      {months === 6 ? "6 meses" : months === 12 ? "1 año" : "2 años"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  % del sueldo que paga mi club
                </label>
                <select
                  value={wageShare}
                  onChange={(e) => setWageShare(Number(e.target.value))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  {LOAN_WAGE_SHARE_OPTIONS.map((share) => (
                    <option key={share} value={share}>{share}%</option>
                  ))}
                </select>
              </div>

            {loanType !== "loan" && (
              <>
                <Field
                  label={loanType === "loan-option" ? "Precio opción de compra (M €)" : "Precio compra obligatoria (M €)"}
                  value={loanOptionFee}
                  onChange={setLoanOptionFee}
                  step={0.1}
                />
                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    % para tu club en una futura reventa
                  </label>
                <select
                  value={loanSellOn}
                  onChange={(e) => setLoanSellOn(Number(e.target.value))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  {SELL_ON_OPTIONS.map((option) => (
                    <option key={option} value={option}>{Math.round(option * 100)}%</option>
                  ))}
                </select>
                </div>
              </>
            )}
          </div>
        )}

        {operation === "transfer" && (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Precio de traspaso (M €)"
              value={amount}
              onChange={setAmount}
              step={0.05}
            />
            <div className="space-y-1.5">
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                % de futura venta
              </label>
              <select
                value={sellOn}
                onChange={(e) => setSellOn(Number(e.target.value))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
              >
                {SELL_ON_OPTIONS.map((option) => (
                  <option key={option} value={option}>{Math.round(option * 100)}%</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Presupuesto total: <span className="text-foreground font-bold">{formatEuro(budget)}</span></p>
          <p>Dinero para fichajes: <span className="text-foreground font-bold">{formatEuro(transferBudget)}</span></p>
          {type !== "permanent" && (
            <>
              <p>Presupuesto salarial: <span className="text-foreground font-bold">{formatEuro(wageBudget)} al año</span></p>
              <p>Mi club pagará el <span className="text-foreground font-bold">{wageShare}%</span> del sueldo actual y {clubName} pagará el <span className="text-foreground font-bold">{100 - wageShare}%</span>.</p>
            </>
          )}
          {type === "permanent" && (
            <p>El salario y los años de contrato no forman parte de esta oferta: se negocian en el paso 2 con el jugador.</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={overBudget || overWageBudget || amountEuros <= 0}
            onClick={() =>
              onSubmit({
                amount: amountEuros,
                // El salario es un valor interno de arranque; en un traspaso no se negocia con el club.
                wageOffer: wageEuros,
                type,
                clauses: type === "permanent"
                  ? { sellOnPercent: sellOn }
                  : {
                      sellOnPercent: loanType === "loan" ? 0 : loanSellOn,
                      wageShare: wageShare / 100,
                      loanDurationMonths,
                      optionFee: loanType === "loan" ? 0 : Math.max(0, Math.round(loanOptionFee * 1_000_000)),
                    },
              })
            }
            className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg font-bold disabled:opacity-40"
          >
            Enviar propuesta al club
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
          Si el club acepta, se abrirá el paso 2 para negociar directamente con el jugador.
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


const SQUAD_ROLE_OPTIONS: Array<{ value: SquadRole; label: string; description: string }> = [
  { value: "star", label: "Estrella", description: "Titular indiscutible en los partidos importantes. Si encadena varios banquillos, su moral puede caer drásticamente." },
  { value: "starter", label: "Titular", description: "Espera iniciar la mayoría de los partidos, pero entiende mejor la rotación y el descanso." },
  { value: "rotation", label: "Rotación", description: "Espera minutos con regularidad, como suplente habitual o titular en partidos de rotación." },
  { value: "secondary", label: "Rol Secundario", description: "Acepta pocos minutos y un papel de reserva, especialmente en copas menores, amistosos o por lesiones." },
  { value: "prospect", label: "Futuro del club / Promesa", description: "Rol pensado para jóvenes con potencial: no exige un sitio en el primer equipo a corto plazo y una cesión puede encajar muy bien." },
];


function defaultSquadRole(ovr: number, age: number): SquadRole {
  if (age <= 21 && ovr < 78) return "prospect";
  if (ovr >= 88) return "star";
  if (ovr >= 82) return "starter";
  if (ovr >= 76) return "rotation";
  return "secondary";
}

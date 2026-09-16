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
  const [wage, setWage] = useState(Math.round((report?.wageDemand ?? 0) / 100_000) / 10);
  const [sellOn, setSellOn] = useState(0);
  const [squadRole, setSquadRole] = useState<SquadRole>(defaultSquadRole(ovr, age));
  const [contractYears, setContractYears] = useState(defaultContractYears(age));
  const [wageShare, setWageShare] = useState(50);
  const [loanDurationMonths, setLoanDurationMonths] = useState<number>(
    windowForDate(currentDate) === "winter" ? 6 : 12,
  );

  const amountEuros = Math.round(amount * 1_000_000);
  const wageEuros = type === "permanent" ? Math.round(wage * 1_000_000) : Math.max(0, Math.round(currentWage));
  const transferBudget = Math.max(0, budget - wageBudget);
  const wageCommitmentEuros =
    type === "permanent" ? wageEuros : Math.round(wageEuros * (wageShare / 100));
  const overBudget = amountEuros > transferBudget;
  const overWageBudget = wageCommitmentEuros > wageBudget;

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
            <Info label="Ficha estimada" value={`${formatEuro(report.wageDemand)}/año`} />
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

        <div className="space-y-2">
          <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            Rol en tu equipo
          </label>
          <select
            value={squadRole}
            onChange={(e) => setSquadRole(e.target.value as SquadRole)}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-semibold"
          >
            {SQUAD_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
            {SQUAD_ROLE_OPTIONS.find((option) => option.value === squadRole)?.description}
          </p>
        </div>

        {operation === "loan" && (
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
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={type === "permanent" ? "Traspaso (M €)" : "Prima de cesión (M €)"}
            value={amount}
            onChange={setAmount}
            step={0.05}
          />

          {type === "permanent" ? (
            <>
              <Field label="Ficha anual (M €)" value={wage} onChange={setWage} step={0.1} />
              <div className="space-y-1.5">
                <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  Años de contrato
                </label>
                <select
                  value={contractYears}
                  onChange={(e) => setContractYears(Number(e.target.value))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  {[1,2,3,4,5,6].map((years) => (
                    <option key={years} value={years}>{years} {years === 1 ? "año" : "años"}</option>
                  ))}
                </select>
              </div>
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
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  Sueldo anual del jugador
                </label>
                <div className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground font-bold">
                  {formatEuro(currentWage)} <span className="text-muted-foreground font-normal">/año</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  Tiempo cedido
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
              <div className="space-y-1.5">
                <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  % del sueldo que paga tu club
                </label>
                <select
                  value={wageShare}
                  onChange={(e) => setWageShare(Number(e.target.value))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((share) => (
                    <option key={share} value={share}>{share}%</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Presupuesto total:{" "}<span className="text-foreground font-bold">{formatEuro(budget)}</span></p>
          <p>Dinero para fichajes:{" "}<span className="text-foreground font-bold">{formatEuro(transferBudget)}</span>{overBudget && <span className="text-destructive"> · oferta por encima del dinero disponible</span>}</p>
          <p>Presupuesto salarial:{" "}<span className="text-foreground font-bold">{formatEuro(wageBudget)} al año</span>{overWageBudget && <span className="text-destructive"> · el salario supera la asignación salarial</span>}</p>
          {type !== "permanent" && (
            <p>Duración: <span className="text-foreground font-bold">{loanDurationMonths === 6 ? "6 meses" : loanDurationMonths === 12 ? "1 año" : "2 años"}</span> · tu club asume el <span className="text-foreground font-bold">{wageShare}%</span> del sueldo actual.</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={
             overBudget ||
             overWageBudget ||
             (type === "permanent" ? amountEuros <= 0 : amountEuros < 0) ||
             wageEuros < 0
           }
            onClick={() =>
              onSubmit({
                amount: amountEuros,
                wageOffer: wageEuros,
                type,
                clauses: {
                  sellOnPercent: type === "permanent" ? sellOn : 0,
                  wageShare: type === "permanent" ? 0 : wageShare / 100,
                  loanDurationMonths: type === "permanent" ? 0 : loanDurationMonths,
                  squadRole,
                  contractYears: type === "permanent" ? contractYears : undefined,
                },
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
          El club tardará entre 1 y 3 días en responder. Las cesiones se integran en tu plantilla
          de forma temporal y el jugador vuelve automáticamente al club propietario al vencer el contrato.
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

function defaultContractYears(age: number): number {
  if (age <= 21) return 5;
  if (age <= 24) return 4;
  if (age <= 29) return 4;
  if (age <= 32) return 3;
  return 2;
}

function defaultSquadRole(ovr: number, age: number): SquadRole {
  if (age <= 21 && ovr < 78) return "prospect";
  if (ovr >= 88) return "star";
  if (ovr >= 82) return "starter";
  if (ovr >= 76) return "rotation";
  return "secondary";
}

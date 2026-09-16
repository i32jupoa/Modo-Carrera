import { useState } from "react";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { formatEuro, fcPlayerById } from "@/store/playersStore";
import { stageLabel, type UserDeal, type SquadRole } from "@/lib/transfers";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";

interface Props {
  deal: UserDeal;
  onImprove: (dealId: string, amount: number, wage: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onAcceptDemand: (dealId: string) => void;
  onImproveWage: (dealId: string, wage: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onConfirm: (dealId: string) => void;
  onAbandon: (dealId: string) => void;
  onAcceptIncoming: (dealId: string) => void;
  onCounterIncoming: (dealId: string, demand: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onRejectIncoming: (dealId: string) => void;
}

function clubName(clubId: string): string {
  try {
    return teamById(clubId)?.name ?? clubId;
  } catch {
    return clubId;
  }
}

function leagueName(clubId: string): string {
  try {
    const league = teamById(clubId)?.league;
    return league ? (LEAGUES[league as LeagueId]?.name ?? league) : "";
  } catch {
    return "";
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

/** Tarjeta de una negociación: estado, condiciones y acciones. */
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
  const [playerRole, setPlayerRole] = useState<SquadRole>(deal.offer.clauses.squadRole ?? "rotation");
  const [contractYears, setContractYears] = useState(deal.offer.clauses.contractYears ?? deal.playerYearsDemand ?? 4);
  const [demand, setDemand] = useState(
    Math.round((deal.valuation.idealPrice || deal.offer.amount) / 100_000) / 10,
  );
  const [loanWageShare, setLoanWageShare] = useState(
    Math.round((deal.offer.clauses.wageShare ?? 0) * 100),
  );
  const [loanDurationMonths, setLoanDurationMonths] = useState(
    deal.offer.clauses.loanDurationMonths || 12,
  );
  const [loanOptionFee, setLoanOptionFee] = useState(
    Math.round((deal.offer.clauses.optionFee ?? 0) / 100_000) / 10,
  );
  const closed = deal.stage === "completed" || deal.stage === "failed";
  const isLoan =
    deal.offer.type === "loan" ||
    deal.offer.type === "loan-option" ||
    deal.offer.type === "loan-obligation";
  const operationLabel = isLoan
    ? deal.direction === "in"
      ? "Cesión desde "
      : "Cesión a "
    : deal.direction === "in"
      ? "Compra a "
      : "Venta a ";
  const duration = deal.offer.clauses.loanDurationMonths || 0;
  const rawPlayer = fcPlayerById(deal.playerId);
  const otherClub = teamById(deal.otherClubId);
  const otherClubLeague = otherClub ? leagueName(deal.otherClubId) : "";

  return (
    <article
      className={`panel overflow-hidden border ${STAGE_TONE[deal.stage] ?? "border-border/60"}`}
    >
      <div className="relative p-4 pb-3 bg-gradient-to-r from-card via-card to-primary/5">
        <div className="flex items-center gap-3">
          <PlayerFace
            name={deal.playerName}
            image={rawPlayer?.card}
            role={roleFromPosition(rawPlayer?.Position ?? "MID")}
            size={58}
            showRing={false}
          />
          <div className="min-w-0 flex-1">
            <p className="font-black truncate text-base">{deal.playerName}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {otherClub && (
                <TeamLogo
                  teamName={otherClub.name}
                  leagueName={otherClubLeague}
                  size={24}
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{operationLabel}{clubName(deal.otherClubId)}</p>
                <p className="text-[0.68rem] text-muted-foreground">Ronda {deal.rounds}</p>
              </div>
            </div>
          </div>
          <span className="text-[0.62rem] uppercase tracking-wider font-black shrink-0 px-2 py-1 rounded-full bg-secondary/70 border border-border/50">
            {stageLabel(deal.stage)}
          </span>
        </div>
      </div>
      <div className="p-4 space-y-3">

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Cell label={isLoan ? "Prima de cesión" : deal.direction === "out" ? "Oferta del club" : "Tu oferta"} value={formatEuro(deal.offer.amount)} />
        {!isLoan && <Cell label="Ficha" value={`${formatEuro(deal.offer.wageOffer)}/año`} />}
        {deal.clubDemand > 0 && <Cell label="El club pide" value={formatEuro(deal.clubDemand)} />}
        {!isLoan && deal.direction === "in" && deal.playerWageDemand > 0 && (
          <Cell label="El jugador pide" value={`${formatEuro(deal.playerWageDemand)}/año`} />
        )}
        {isLoan && (
          <>
            <Cell label="Sueldo anual (ficha vigente)" value={`${formatEuro(deal.offer.wageOffer)}/año`} />
            <Cell
              label="Sueldo que paga el club destino"
              value={`${Math.round((deal.offer.clauses.wageShare ?? 0) * 100)}%`}
            />
            <Cell
              label="Sueldo que pagas tú"
              value={`${100 - Math.round((deal.offer.clauses.wageShare ?? 0) * 100)}%`}
            />
            <Cell label="Duración" value={`${duration} meses`} />
            {deal.offer.type !== "loan" && (
              <Cell
                label={deal.offer.type === "loan-option" ? "Opción de compra" : "Compra obligatoria"}
                value={formatEuro(deal.offer.clauses.optionFee)}
              />
            )}
          </>
        )}
        {deal.offer.clauses.squadRole && deal.direction === "in" && (
          <Cell label="Rol en tu equipo" value={ROLE_LABELS[deal.offer.clauses.squadRole]} />
        )}
        {!isLoan && deal.offer.clauses.sellOnPercent > 0 && (
          <Cell
            label="Futura venta"
            value={`${Math.round(deal.offer.clauses.sellOnPercent * 100)}%`}
          />
        )}
      </div>

      {deal.clubMessage && <p className="text-xs text-muted-foreground">{deal.clubMessage}</p>}
      {deal.playerMessage && (
        <p className={`text-xs ${deal.stage === "failed" ? "text-destructive" : "text-primary"}`}>
          {deal.playerMessage}
        </p>
      )}

      {!closed && deal.stage === "club-counter" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <NumberInput
              label={isLoan ? "Prima (M €)" : "Nueva oferta (M €)"}
              value={amount}
              onChange={setAmount}
            />
            {!isLoan && (
              <NumberInput label="Ficha (M €)" value={wage} onChange={setWage} step={0.1} />
            )}
          </div>
          {isLoan && (
            <div className="grid grid-cols-2 gap-2">
              <SelectNumber label="% de sueldo" value={loanWageShare} onChange={setLoanWageShare} options={[0,10,20,30,40,50,60,70,80,90,100]} />
              <SelectNumber label="Duración" value={loanDurationMonths} onChange={setLoanDurationMonths} options={[6,12,24]} formatter={(v) => v === 6 ? "6 meses" : v === 12 ? "1 año" : "2 años"} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Action
              label={`Igualar ${formatEuro(deal.clubDemand)}`}
              onClick={() => onAcceptDemand(deal.id)}
              primary
            />
            <Action
              label="Mejorar oferta"
              onClick={() =>
                onImprove(
                  deal.id,
                  Math.round(amount * 1_000_000),
                  isLoan ? deal.offer.wageOffer : Math.round(wage * 1_000_000),
                  isLoan
                    ? { wageShare: loanWageShare / 100, loanDurationMonths }
                    : undefined,
                )
              }
            />
            <Action label="Retirarse" onClick={() => onAbandon(deal.id)} />
          </div>
        </div>
      )}

      {!closed && deal.stage === "club-waiting" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">El club está valorando tu propuesta. Espera su respuesta.</span>
          <Action label="Retirarse" onClick={() => onAbandon(deal.id)} />
        </div>
      )}

      {!closed && deal.stage === "player-terms" && (
        <div className="space-y-2">
          {deal.playerRoleDemand && (
            <p className="text-xs text-muted-foreground">
              El jugador considera razonable como mínimo el rol <span className="font-bold text-foreground">{ROLE_LABELS[deal.playerRoleDemand]}</span>
              {!isLoan && deal.playerYearsDemand ? <> y {deal.playerYearsDemand} {deal.playerYearsDemand === 1 ? "año" : "años"} de contrato</> : null}.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {!isLoan && <NumberInput label="Ficha (M €)" value={wage} onChange={setWage} step={0.1} />}
            <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              Rol ofrecido
              <select value={playerRole} onChange={(e) => setPlayerRole(e.target.value as SquadRole)} className="mt-1 w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm font-bold">
                {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {!isLoan && (
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Años
                <select value={contractYears} onChange={(e) => setContractYears(Number(e.target.value))} className="mt-1 w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm font-bold">
                  {[1,2,3,4,5,6].map((years) => <option key={years} value={years}>{years}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Action
              label="Negociar con el jugador"
              primary
              onClick={() => onImproveWage(deal.id, isLoan ? deal.offer.wageOffer : Math.round(wage * 1_000_000), { squadRole: playerRole, contractYears })}
            />
            <Action label="Abandonar" onClick={() => onAbandon(deal.id)} />
          </div>
        </div>
      )}

      {!closed && deal.stage === "ready" && (
        <div className="flex flex-wrap gap-2">
          <Action
            label={isLoan ? "Cerrar cesión" : deal.direction === "in" ? "Cerrar fichaje" : "Cerrar venta"}
            primary
            onClick={() => onConfirm(deal.id)}
          />
          <Action label="Cancelar" onClick={() => onAbandon(deal.id)} />
        </div>
      )}

      {!closed && deal.stage === "incoming" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Action label={isLoan ? "Aceptar cesión" : "Aceptar oferta"} primary onClick={() => onAcceptIncoming(deal.id)} />
            <Action label="Rechazar" onClick={() => onRejectIncoming(deal.id)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label={isLoan ? "Pedir prima (M €)" : "Pedir precio (M €)"} value={demand} onChange={setDemand} />
            {isLoan && (
              <>
                <SelectNumber
                  label="% del sueldo que paga el destino"
                  value={loanWageShare}
                  onChange={setLoanWageShare}
                  options={[0,10,20,30,40,50,60,70,80,90,100]}
                />
                <SelectNumber
                  label="Duración"
                  value={loanDurationMonths}
                  onChange={setLoanDurationMonths}
                  options={[6,12,24]}
                  formatter={(v) => v === 6 ? "6 meses" : v === 12 ? "1 año" : "2 años"}
                />
                {deal.offer.type !== "loan" && (
                  <NumberInput label={deal.offer.type === "loan-option" ? "Precio opción de compra (M €)" : "Precio compra obligatoria (M €)"} value={loanOptionFee} onChange={setLoanOptionFee} step={0.1} />
                )}
              </>
            )}
          </div>
          {isLoan && (
            <p className="text-xs text-muted-foreground">
              La ficha anual no se modifica: {formatEuro(deal.offer.wageOffer)}/año. Si el destino paga el {loanWageShare}%, tu club seguirá pagando el {100 - loanWageShare}%.
            </p>
          )}
          <Action
            label={isLoan ? "Contraofertar condiciones" : "Contraofertar precio"}
            primary
            onClick={() =>
              onCounterIncoming(
                deal.id,
                Math.round(demand * 1_000_000),
                isLoan
                  ? {
                      wageShare: loanWageShare / 100,
                      loanDurationMonths,
                      optionFee: deal.offer.type === "loan" ? deal.offer.clauses.optionFee : Math.round(loanOptionFee * 1_000_000),
                    }
                  : undefined,
              )
            }
          />
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
      </div>
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

function SelectNumber({
  label,
  value,
  onChange,
  options,
  formatter = (v) => `${v}%`,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  options: number[];
  formatter?: (value: number) => string;
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>{formatter(option)}</option>
        ))}
      </select>
    </label>
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


const ROLE_OPTIONS: Array<{ value: SquadRole; label: string }> = [
  { value: "star", label: "Estrella" },
  { value: "starter", label: "Titular" },
  { value: "rotation", label: "Rotación" },
  { value: "secondary", label: "Rol Secundario" },
  { value: "prospect", label: "Futuro del club / Promesa" },
];

const ROLE_LABELS: Record<SquadRole, string> = {
  star: "Estrella",
  starter: "Titular",
  rotation: "Rotación",
  secondary: "Rol Secundario",
  prospect: "Futuro del club / Promesa",
};

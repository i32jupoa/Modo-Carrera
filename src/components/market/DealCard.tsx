import { useEffect, useState } from "react";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { formatEuro, fcPlayerById, usePlayersStore } from "@/store/playersStore";
import { stageLabel, MARKET_TIMING, type UserDeal, type SquadRole } from "@/lib/transfers";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";

interface Props {
  deal: UserDeal;
  onImprove: (dealId: string, amount: number, wage: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onAcceptDemand: (dealId: string) => void;
  onImproveWage: (dealId: string, wage: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onConfirm: (dealId: string) => void;
  onAbandon: (dealId: string) => void;
  onAcceptIncoming: (dealId: string, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onCounterIncoming: (dealId: string, demand: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
  onCounterOutgoing: (dealId: string, demand: number, clauses?: Partial<import("@/lib/transfers").OfferClauses>) => void;
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
  "player-decision": "border-primary/40 text-primary",
  closing: "border-primary/40 text-primary",
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
  onCounterOutgoing,
  onRejectIncoming,
}: Props) {
  const [amount, setAmount] = useState(Math.round(deal.offer.amount / 100_000) / 10);
  const [wage, setWage] = useState(Math.round(deal.offer.wageOffer / 100_000) / 10);
  const [playerRole, setPlayerRole] = useState<SquadRole>(deal.offer.clauses.squadRole ?? "rotation");
  const [contractYears, setContractYears] = useState(deal.offer.clauses.contractYears ?? deal.playerYearsDemand ?? 4);
  const [demand, setDemand] = useState(
    Math.round((deal.valuation.idealPrice || deal.offer.amount) / 100_000) / 10,
  );
  const [incomingLoanRole, setIncomingLoanRole] = useState<SquadRole>(deal.offer.clauses.squadRole ?? "rotation");
  const [loanWageShare, setLoanWageShare] = useState(
    Math.round((deal.offer.clauses.wageShare ?? 0) * 100),
  );
  const [loanDurationMonths, setLoanDurationMonths] = useState(
    deal.offer.clauses.loanDurationMonths || 12,
  );
  const isLoan =
    deal.offer.type === "loan" ||
    deal.offer.type === "loan-option" ||
    deal.offer.type === "loan-obligation";
  useEffect(() => {
    if (!isLoan) return;
    setLoanTypeDemand(deal.clubLoanTypeDemand ?? (deal.offer.type as "loan" | "loan-option" | "loan-obligation"));
    setLoanWageShare(Math.round((deal.offer.clauses.wageShare ?? 0) * 100));
    setLoanDurationMonths(deal.offer.clauses.loanDurationMonths || 12);
    setLoanOptionFee(Math.round((deal.offer.clauses.optionFee ?? 0) / 100_000) / 10);
    setIncomingLoanRole(deal.offer.clauses.squadRole ?? "rotation");
  }, [deal.id, deal.stage, deal.offer.type, deal.offer.amount, deal.offer.clauses.wageShare, deal.offer.clauses.loanDurationMonths, deal.offer.clauses.optionFee, deal.offer.clauses.squadRole, deal.clubLoanTypeDemand, deal.clubSquadRoleDemand, isLoan]);

  // Sincroniza los campos visibles cuando el club hace una nueva propuesta.
  // No depende del valor local mientras el usuario está escribiendo; solo se
  // actualiza cuando cambia realmente la oferta recibida o la etapa.
  useEffect(() => {
    const nextAmount = Math.round(deal.offer.amount / 100_000) / 10;
    setAmount(nextAmount);
    if (deal.stage === "club-counter" && deal.clubDemand > 0) {
      setDemand(Math.round(deal.clubDemand / 100_000) / 10);
    }
  }, [deal.id, deal.stage, deal.offer.amount, deal.clubDemand]);
  const [loanOptionFee, setLoanOptionFee] = useState(
    Math.round((deal.offer.clauses.optionFee ?? 0) / 100_000) / 10,
  );
  const [loanTypeDemand, setLoanTypeDemand] = useState<"loan" | "loan-option" | "loan-obligation">(
    deal.clubLoanTypeDemand ?? (deal.offer.type as "loan" | "loan-option" | "loan-obligation"),
  );
  const [sellOn, setSellOn] = useState(
    Math.round((deal.offer.clauses.sellOnPercent ?? 0) * 100),
  );
  useEffect(() => {
    if (isLoan) return;
    setSellOn(Math.round((deal.offer.clauses.sellOnPercent ?? 0) * 100));
  }, [deal.id, deal.stage, deal.offer.clauses.sellOnPercent, isLoan]);
  const closed = deal.stage === "completed" || deal.stage === "failed";
  const rawPlayer = fcPlayerById(deal.playerId);
  const totalEconomicBudget = usePlayersStore((s) => s.budget);
  const wageBudget = usePlayersStore((s) => s.wageBudget);
  const transferBudget = Math.max(0, totalEconomicBudget - wageBudget);
  const currentCounterAmount = Math.max(0, Math.round(amount * 1_000_000));
  const clubDemandOverBudget =
    deal.direction === "in" &&
    deal.stage === "club-counter" &&
    Math.round(deal.clubDemand || deal.offer.amount) > transferBudget;
  const userCounterOverBudget =
    deal.direction === "in" &&
    deal.stage === "club-counter" &&
    currentCounterAmount > transferBudget;
  // El traspaso acordado no se resta del presupuesto general todavía. Para
  // ESTE jugador, sí limita el salario máximo: total disponible - precio del
  // traspaso ya acordado, además del presupuesto salarial elegido en la barra.
  const playerPhase = deal.stage === "player-terms" || deal.stage === "player-decision";
  const agreedTransferFee = deal.direction === "in" && !isLoan && playerPhase
    ? Math.max(0, Math.round(deal.offer.amount))
    : 0;
  const effectivePlayerWageBudget = Math.min(
    wageBudget,
    Math.max(0, totalEconomicBudget - agreedTransferFee),
  );
  const loanDestinationShare = isLoan
    ? Math.max(0, Math.min(1, deal.offer.clauses.wageShare ?? 0))
    : 1;
  const loanPlayerSalaryCommitment = isLoan && rawPlayer?.contract?.wage
    ? Math.max(0, Math.round(rawPlayer.contract.wage * (1 - loanDestinationShare)))
    : 0;
  const playerFinancialNeed = playerPhase && (
    (!isLoan && deal.direction === "in" && effectivePlayerWageBudget <= 0) ||
    (isLoan && loanPlayerSalaryCommitment > Math.max(0, wageBudget))
  );
  // El bloqueo visual depende del dinero disponible AHORA MISMO. Si el
  // usuario recupera margen moviendo la barra, el precinto desaparece al
  // instante aunque todavía no se haya avanzado un día para limpiar los
  // metadatos del bloqueo temporal.
  const playerFinanciallyBlocked = playerFinancialNeed;
  const playerSalaryOverBudget =
    deal.direction === "in" &&
    deal.stage === "player-terms" &&
    !isLoan &&
    Math.max(0, Math.round(wage * 1_000_000)) > Math.max(0, effectivePlayerWageBudget);
  const playerFinanciallySealed =
    playerPhase &&
    playerFinanciallyBlocked;
  const playerMessageIsFinancialLock =
    deal.playerMessage.startsWith("Ahora mismo no dispongo de dinero suficiente para realizar la operación.")
    || deal.playerMessage.startsWith("Ahora mismo no dispongo del margen salarial necesario para cerrar esta operación.");
  const visiblePlayerMessage = !playerFinanciallySealed && playerMessageIsFinancialLock
    ? "Ya podemos continuar la negociación. Estoy listo para valorar vuestra propuesta."
    : deal.playerMessage;
  const operationLabel = isLoan
    ? deal.direction === "in"
      ? "Cesión desde "
      : "Cesión a "
    : deal.direction === "in"
      ? "Compra a "
      : "Venta a ";
  const duration = deal.offer.clauses.loanDurationMonths || 0;
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
                <p className="text-[0.68rem] text-muted-foreground">Ronda {deal.stage === "player-terms" ? (deal.playerNegotiationRounds ?? 0) : deal.rounds}</p>
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
        {deal.clubDemand > 0 && !(deal.direction === "in" && deal.stage === "player-terms") && (
          <Cell label="El club pide" value={formatEuro(deal.clubDemand)} />
        )}
        {!isLoan && deal.direction === "in" && deal.stage === "player-terms" && deal.playerWageDemand > 0 && (
          <Cell label="El jugador pide" value={`${formatEuro(deal.playerWageDemand)}/año`} />
        )}
        {isLoan && (
          <>
            <Cell
              label="Sueldo que paga el club destino"
              value={`${Math.round((deal.offer.clauses.wageShare ?? 0) * 100)}%`}
            />
            <Cell
              label="Sueldo que pagas tú"
              value={`${100 - Math.round((deal.offer.clauses.wageShare ?? 0) * 100)}%`}
            />
            <Cell label="Duración" value={`${duration} meses`} />
            <Cell
              label="Rol en el destino"
              value={ROLE_OPTIONS.find((option) => option.value === (deal.offer.clauses.squadRole ?? "rotation"))?.label ?? "Rotación"}
            />
            {deal.offer.type !== "loan" && (
              <Cell
                label={deal.offer.type === "loan-option" ? "Opción de compra" : "Compra obligatoria"}
                value={formatEuro(deal.offer.clauses.optionFee)}
              />
            )}
          </>
        )}
        {!isLoan && (
          <Cell
            label="Futura venta"
            value={`${Math.round((deal.offer.clauses.sellOnPercent ?? 0) * 100)}%`}
          />
        )}
      </div>

      {deal.clubMessage && <p className="text-xs text-muted-foreground">{deal.clubMessage}</p>}

      {deal.playerMessage && deal.stage !== "player-terms" && (
        <p className={`text-xs ${deal.stage === "failed" ? "text-destructive" : "text-primary"}`}>
          {deal.playerMessage}
        </p>
      )}

      {!closed && deal.stage === "club-counter" && (
        <div className="space-y-2">
          {!isLoan && (
            <div className="grid grid-cols-2 gap-2">
              <NumberInput
                label="Nueva oferta (M €)"
                value={amount}
                onChange={setAmount}
              />
              <SelectNumber
                label="% de futura venta"
                value={sellOn}
                onChange={setSellOn}
                options={[0,5,10,15,20,25,30,35,40,45,50]}
              />
            </div>
          )}
          {isLoan && (
            <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-secondary/30 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.18em] text-primary font-black">Condiciones de cesión</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ajusta todas las condiciones antes de enviar tu contraoferta.</p>
                </div>
                <span className="rounded-full border border-border/50 bg-secondary/60 px-2 py-1 text-[0.6rem] font-black uppercase tracking-wider">Negociable</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput
                  label="Prima de cesión (M €)"
                  value={amount}
                  onChange={setAmount}
                />
                <SelectNumber label="Sueldo que paga el destino" value={loanWageShare} onChange={setLoanWageShare} options={[0,10,20,30,40,50,60,70,80,90,100]} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SelectNumber label="Duración" value={loanDurationMonths} onChange={setLoanDurationMonths} options={[6,12,24]} formatter={(v) => v === 6 ? "6 meses" : v === 12 ? "1 año" : "2 años"} />
              </div>
              <label className="block text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Rol en el destino
                <select
                  value={incomingLoanRole}
                  onChange={(e) => setIncomingLoanRole(e.target.value as SquadRole)}
                  className="mt-1 w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm font-bold text-foreground outline-none focus:border-primary/50"
                >
                  {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  Condición de compra
                  <select
                    value={loanTypeDemand}
                    onChange={(e) => setLoanTypeDemand(e.target.value as "loan" | "loan-option" | "loan-obligation")}
                    className="mt-1 w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm font-bold text-foreground"
                  >
                    <option value="loan">Sin opción de compra</option>
                    <option value="loan-option">Con opción de compra</option>
                    <option value="loan-obligation">Con compra obligatoria</option>
                  </select>
                </label>
                {loanTypeDemand !== "loan" ? (
                  <NumberInput
                    label={loanTypeDemand === "loan-option" ? "Precio opción (M €)" : "Precio compra obligatoria (M €)"}
                    value={loanOptionFee}
                    onChange={setLoanOptionFee}
                    step={0.1}
                  />
                ) : (
                  <div className="rounded-xl border border-border/40 bg-secondary/30 px-3 py-2">
                    <p className="text-[0.58rem] uppercase tracking-wider text-muted-foreground font-black">Compra</p>
                    <p className="mt-1 text-xs font-bold">Sin opción</p>
                  </div>
                )}
              </div>
              {loanTypeDemand !== "loan" && (
                <SelectNumber label="% para tu club en futura reventa" value={sellOn} onChange={setSellOn} options={[0,5,10,15,20,25,30,35,40,45,50]} />
              )}
              <div className="rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-[0.7rem] text-muted-foreground">
                Tu club paga el <span className="font-black text-foreground">{100 - loanWageShare}%</span> de la ficha. El destino paga el <span className="font-black text-foreground">{loanWageShare}%</span>. El jugador irá como <span className="font-black text-foreground">{ROLE_OPTIONS.find((option) => option.value === incomingLoanRole)?.label ?? "Rotación"}</span>.
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Action
              label="Aceptar condiciones propuestas"
              onClick={() => onAcceptDemand(deal.id)}
              primary
              disabled={clubDemandOverBudget}
            />
            <Action
              label="Contraofertar"
              disabled={
                userCounterOverBudget ||
                (deal.direction === "out" &&
                  (deal.outgoingCounterRounds ?? 0) >= MARKET_TIMING.maxNegotiationRounds)
              }
              onClick={() =>
                deal.direction === "out"
                  ? onCounterOutgoing(
                      deal.id,
                      Math.round(amount * 1_000_000),
                      isLoan
                        ? {
                            wageShare: loanWageShare / 100,
                            loanDurationMonths,
                            optionFee: loanTypeDemand === "loan" ? 0 : Math.round(loanOptionFee * 1_000_000),
                            loanType: loanTypeDemand,
                            squadRole: incomingLoanRole,
                          }
                        : { sellOnPercent: sellOn / 100 },
                    )
                  : onImprove(
                      deal.id,
                      Math.round(amount * 1_000_000),
                      isLoan ? deal.offer.wageOffer : Math.round(wage * 1_000_000),
                      isLoan
                        ? {
                            wageShare: loanWageShare / 100,
                            loanDurationMonths,
                            squadRole: playerRole,
                            sellOnPercent: deal.offer.type === "loan" ? 0 : sellOn / 100,
                            optionFee: deal.offer.type === "loan" ? 0 : Math.round(loanOptionFee * 1_000_000),
                          }
                        : { sellOnPercent: sellOn / 100 },
                    )
              }
            />
            <Action label="Retirarse" onClick={() => onAbandon(deal.id)} />
          </div>
        </div>
      )}

      {!closed && deal.stage === "club-waiting" && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[0.62rem] uppercase tracking-[0.18em] text-blue-300 font-black">Propuesta en valoración</p>
              <p className="mt-0.5 text-xs text-muted-foreground">El club está valorando tu propuesta. Espera su respuesta.</p>
            </div>
            <span className="text-[0.62rem] font-black text-muted-foreground">Respuesta: {deal.respondsOn}</span>
          </div>
          {isLoan && (deal.lastUserCounterClauses || deal.lastUserCounterAmount !== undefined) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Cell label="Prima de cesión" value={formatEuro(deal.lastUserCounterAmount ?? deal.offer.amount)} />
              <Cell label="Sueldo que paga el destino" value={`${Math.round(((deal.lastUserCounterClauses?.wageShare as number | undefined) ?? deal.offer.clauses.wageShare ?? 0) * 100)}%`} />
              <Cell label="Duración" value={`${deal.lastUserCounterClauses?.loanDurationMonths ?? deal.offer.clauses.loanDurationMonths ?? 12} meses`} />
              <Cell label="Rol en el destino" value={(ROLE_OPTIONS.find((option) => option.value === ((deal.lastUserCounterClauses?.squadRole as SquadRole | undefined) ?? deal.offer.clauses.squadRole ?? "rotation"))?.label ?? "Rotación")} />
            </div>
          )}
          <Action label="Retirarse" onClick={() => onAbandon(deal.id)} />
        </div>
      )}

      {!closed && deal.stage === "player-terms" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
            <p className="text-[0.62rem] uppercase tracking-wider text-primary font-black">Paso 2 de 2</p>
            <p className="mt-0.5 font-black text-sm">Negociación con el jugador</p>
            <p className="mt-1 text-xs text-muted-foreground">
              El club ya ha aceptado la operación. Ahora se negocian directamente las condiciones del jugador.
            </p>
          </div>
          {(deal.playerMessage || playerFinanciallySealed) && (
            <div className={`rounded-xl border px-3 py-3 ${playerFinanciallySealed ? "border-amber-400/30 bg-amber-500/5" : "border-primary/20 bg-secondary/40"}`}>
              <p className={`text-[0.6rem] uppercase tracking-wider font-black ${playerFinanciallySealed ? "text-amber-300" : "text-primary"}`}>{deal.playerName}</p>
              <p className="mt-1 text-sm leading-relaxed font-medium">{playerFinanciallySealed ? "Actualmente no se dispone de dinero suficiente para realizar la operación. La negociación queda bloqueada temporalmente hasta recuperar presupuesto salarial." : visiblePlayerMessage}</p>
            </div>
          )}
          <div className={isLoan ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
            <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              Rol ofrecido
              <select value={playerRole} onChange={(e) => setPlayerRole(e.target.value as SquadRole)} className="mt-1 w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm font-bold">
                {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="space-y-1.5">
              <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Salario anual</span>
              {isLoan ? (
                <div className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm font-bold">
                  {formatEuro(deal.offer.wageOffer)}/año <span className="text-muted-foreground font-normal">· no ajustable</span>
                </div>
              ) : (
                <NumberInput
                  label="Salario anual (M €)"
                  value={wage}
                  onChange={setWage}
                  step={0.1}
                />
              )}
            </div>
            {!isLoan && (
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Años de contrato
                <select value={contractYears} onChange={(e) => setContractYears(Number(e.target.value))} className="mt-1 w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm font-bold">
                  {[1,2,3,4,5,6].map((years) => <option key={years} value={years}>{years}</option>)}
                </select>
              </label>
            )}
          </div>
          {isLoan && (
            <p className="text-xs text-muted-foreground">La duración de la cesión y el reparto del sueldo ya quedaron acordados con el club en el paso 1.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {!isLoan && (
              <div className={`rounded-lg border px-3 py-2 text-xs ${playerFinanciallyBlocked || playerSalaryOverBudget ? "border-destructive/35 bg-destructive/5 text-destructive" : "border-border/60 bg-secondary/30 text-muted-foreground"}`}>
                <span className="font-bold text-foreground">Máximo salarial para este fichaje: {formatEuro(effectivePlayerWageBudget)}</span>
              </div>
            )}
            {playerFinanciallyBlocked && (
              <p className="basis-full text-xs text-amber-400">
                Actualmente no se dispone de dinero suficiente para realizar la operación. La negociación queda bloqueada temporalmente hasta recuperar presupuesto salarial.
              </p>
            )}
            <Action
              label="Negociar con el jugador"
              primary
              disabled={playerFinanciallyBlocked || playerSalaryOverBudget}
              onClick={() => onImproveWage(deal.id, isLoan ? deal.offer.wageOffer : Math.round(wage * 1_000_000), { squadRole: playerRole, contractYears })}
            />
            <Action label="Abandonar" onClick={() => onAbandon(deal.id)} />
          </div>
        </div>
      )}

      {!closed && deal.stage === "player-decision" && !playerFinanciallySealed && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
          <p className="text-[0.62rem] uppercase tracking-wider text-primary font-black">Decisión del jugador</p>
          <p className="mt-1 text-sm font-bold">{visiblePlayerMessage || "El jugador está valorando la operación."}</p>
          <p className="mt-1 text-xs text-muted-foreground">Recibirás la respuesta automáticamente en la fecha indicada.</p>
        </div>
      )}

      {!closed && deal.stage === "player-decision" && playerFinanciallySealed && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 px-3 py-3">
          <p className="text-[0.62rem] uppercase tracking-wider text-amber-300 font-black">Negociación con el jugador</p>
          <p className="mt-1 text-sm font-bold text-amber-100">{deal.playerMessage || "Actualmente no se dispone de dinero suficiente para realizar la operación. La negociación queda bloqueada temporalmente hasta recuperar presupuesto salarial."}</p>
        </div>
      )}

      {!closed && deal.stage === "closing" && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
          <p className="text-[0.62rem] uppercase tracking-wider text-primary font-black">Cierre administrativo</p>
          <p className="mt-1 text-sm font-bold">La operación ya está acordada.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            La venta se hará efectiva el {deal.respondsOn}. En ese momento se ingresará el importe y se liberará el salario.
          </p>
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
            <Action
              label={isLoan ? "Aceptar cesión" : "Aceptar oferta"}
              primary
              onClick={() => onAcceptIncoming(deal.id, isLoan ? { squadRole: incomingLoanRole } : undefined)}
            />
            <Action label="Rechazar" onClick={() => onRejectIncoming(deal.id)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label={isLoan ? "Pedir prima (M €)" : "Pedir precio (M €)"} value={demand} onChange={setDemand} />
            {!isLoan && (
              <SelectNumber
                label="% de futura venta"
                value={sellOn}
                onChange={setSellOn}
                options={[0,5,10,15,20,25,30,35,40,45,50]}
              />
            )}
            {isLoan && (
              <>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Condición de compra</label>
                  <select
                    value={loanTypeDemand}
                    onChange={(e) => setLoanTypeDemand(e.target.value as "loan" | "loan-option" | "loan-obligation")}
                    className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm font-bold"
                  >
                    <option value="loan">Sin opción de compra</option>
                    <option value="loan-option">Con opción de compra</option>
                    <option value="loan-obligation">Con compra obligatoria</option>
                  </select>
                </div>
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
                <label className="col-span-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  Rol previsto en el club destino
                  <select
                    value={incomingLoanRole}
                    onChange={(e) => setIncomingLoanRole(e.target.value as SquadRole)}
                    className="mt-1 w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm font-bold"
                  >
                    {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {loanTypeDemand !== "loan" && (
                  <NumberInput label={loanTypeDemand === "loan-option" ? "Precio opción de compra (M €)" : "Precio compra obligatoria (M €)"} value={loanOptionFee} onChange={setLoanOptionFee} step={0.1} />
                )}
              </>
            )}
          </div>
          {isLoan && (
            <p className="text-xs text-muted-foreground">
              La ficha anual no se modifica: {formatEuro(deal.offer.wageOffer)}/año. Si el destino paga el {loanWageShare}%, tu club seguirá pagando el {100 - loanWageShare}%. El rol previsto en el destino será <span className="font-bold text-foreground">{ROLE_OPTIONS.find((option) => option.value === incomingLoanRole)?.label ?? "Rotación"}</span>.
            </p>
          )}
          <Action
            label="Contraofertar"
            primary
            onClick={() =>
              onCounterIncoming(
                deal.id,
                Math.round(demand * 1_000_000),
                isLoan
                  ? {
                      wageShare: loanWageShare / 100,
                      loanDurationMonths,
                      optionFee: loanTypeDemand === "loan" ? 0 : Math.round(loanOptionFee * 1_000_000),
                      loanType: loanTypeDemand,
                      squadRole: incomingLoanRole,
                      sellOnPercent: 0,
                    }
                  : { sellOnPercent: sellOn / 100 },
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
      {playerFinanciallySealed && (
        <div className="absolute inset-0 z-30 pointer-events-auto overflow-hidden rounded-[inherit] cursor-not-allowed" aria-hidden="true">
          <div className="absolute inset-0 bg-black/35 backdrop-grayscale-[0.9]" />
          <div className="absolute -left-[12%] -right-[12%] top-1/2 -translate-y-1/2 -rotate-6 border-y-2 border-dashed border-amber-400/75 bg-amber-500/12 px-4 py-3 shadow-[0_0_28px_rgba(245,158,11,0.18)]">
            <div className="flex items-center justify-center gap-2 text-amber-300 font-black tracking-[0.24em] text-[0.62rem] uppercase">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/50 bg-black/25">🔒</span>
              Precintado · Negociación bloqueada
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/50 bg-black/25">🔒</span>
            </div>
            <p className="mt-1 text-center text-[0.62rem] font-semibold text-amber-100/80 tracking-normal normal-case">
              Actualmente no se dispone de dinero suficiente para realizar la operación. Se reabrirá automáticamente al recuperar margen salarial.
            </p>
          </div>
        </div>
      )}
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
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  max?: number;
}) {
  return (
    <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
      {label}
      <input
        type="number"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const parsed = Math.max(0, Number(e.target.value));
          onChange(max === undefined ? parsed : Math.min(parsed, max));
        }}
        className="mt-1 w-32 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm font-bold text-foreground"
      />
    </label>
  );
}

function Action({
  label,
  onClick,
  primary,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
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


import { useEffect, useState } from "react";
import { Pin, PinOff } from "lucide-react";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { formatEuro, fcPlayerById, usePlayersStore } from "@/store/playersStore";
import { stageLabel, MARKET_TIMING, type UserDeal, type SquadRole } from "@/lib/transfers";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { getPlayer } from "@/lib/transfers/PlayerIndex";
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
  /** Compacta la cabecera cuando la tarjeta ya vive dentro de un grupo por jugador. */
  compactHeader?: boolean;
  /** Marca y acción de fijado, habilitadas en las ofertas recibidas. */
  pinned?: boolean;
  onTogglePin?: (dealId: string, pinned: boolean) => void;
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
  "waiting-club": "border-yellow-500/45 text-yellow-300",
  "club-counter": "border-orange-500/50 text-orange-300",
  "club-waiting": "border-yellow-500/50 text-yellow-300",
  "player-terms": "border-orange-500/50 text-orange-300",
  // El acuerdo entre clubes ya está cerrado; ahora falta la decisión del
  // jugador. El violeta distingue esta fase del resto de estados del mercado.
  "player-decision": "border-violet-500/50 text-violet-300",
  closing: "border-green-500/50 text-green-300",
  ready: "border-green-500/50 text-green-300",
  incoming: "border-yellow-500/50 text-yellow-300",
  completed: "border-green-500/40 text-green-400",
  failed: "border-red-500/45 text-red-300",
};

type DealVisualTone = "rejected" | "loan" | "player-decision" | "accepted" | "incoming" | "default";

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
  compactHeader = false,
  pinned = false,
  onTogglePin,
}: Props) {
  const isLoan =
    deal.offer.type === "loan" ||
    deal.offer.type === "loan-option" ||
    deal.offer.type === "loan-obligation";
  const initialLoanClauses = isLoan && deal.agreedLoanClauses
    ? deal.agreedLoanClauses
    : deal.offer.clauses;

  const [amount, setAmount] = useState(Math.round(deal.offer.amount / 100_000) / 10);
  const [wage, setWage] = useState(Math.round(deal.offer.wageOffer / 100_000) / 10);
  const [playerRole, setPlayerRole] = useState<SquadRole>(initialLoanClauses.squadRole ?? "rotation");
  const [contractYears, setContractYears] = useState(deal.offer.clauses.contractYears ?? deal.playerYearsDemand ?? 4);
  const [signingBonus, setSigningBonus] = useState(
    deal.offer.type === "free"
      ? Math.round((deal.playerSigningBonusDemand ?? deal.offer.amount) / 100_000) / 10
      : Math.round(deal.offer.amount / 100_000) / 10,
  );
  const [demand, setDemand] = useState(
    (deal.offer.type === "loan" || deal.offer.type === "loan-option" || deal.offer.type === "loan-obligation")
      ? Math.round(deal.offer.amount / 100_000) / 10
      : Math.round((deal.valuation.idealPrice || deal.offer.amount) / 100_000) / 10,
  );
  const [incomingLoanRole, setIncomingLoanRole] = useState<SquadRole>(initialLoanClauses.squadRole ?? "rotation");
  const [loanWageShare, setLoanWageShare] = useState(() => {
    const storedDestinationShare = Math.round(Math.round((deal.offer.clauses.wageShare ?? 0) * 20) / 20 * 100);
    return deal.direction === "out" ? 100 - storedDestinationShare : storedDestinationShare;
  });
  const [loanDurationMonths, setLoanDurationMonths] = useState(
    deal.offer.clauses.loanDurationMonths || 12,
  );
  useEffect(() => {
    if (!isLoan) return;
    setLoanTypeDemand(deal.clubLoanTypeDemand ?? (deal.offer.type as "loan" | "loan-option" | "loan-obligation"));
    const storedDestinationShare = Math.round(Math.round((deal.offer.clauses.wageShare ?? 0) * 20) / 20 * 100);
    setLoanWageShare(deal.direction === "out" ? 100 - storedDestinationShare : storedDestinationShare);
    setLoanDurationMonths(deal.offer.clauses.loanDurationMonths || 12);
    setLoanOptionFee(Math.round((deal.offer.clauses.optionFee ?? 0) / 100_000) / 10);
    setIncomingLoanRole(displayedLoanClauses.squadRole ?? "rotation");
  }, [deal.id, deal.stage, deal.offer.type, deal.offer.amount, deal.offer.clauses.wageShare, deal.offer.clauses.loanDurationMonths, deal.offer.clauses.optionFee, deal.offer.clauses.squadRole, deal.clubLoanTypeDemand, deal.clubSquadRoleDemand, isLoan]);

  // Sincroniza los campos visibles cuando el club hace una nueva propuesta.
  // No depende del valor local mientras el usuario está escribiendo; solo se
  // actualiza cuando cambia realmente la oferta recibida o la etapa.
  useEffect(() => {
    const nextAmount = Math.round(deal.offer.amount / 100_000) / 10;
    setAmount(nextAmount);
    setSigningBonus(
      deal.offer.type === "free"
        ? Math.round((deal.playerSigningBonusDemand ?? deal.offer.amount) / 100_000) / 10
        : nextAmount,
    );
    const dealIsLoan = deal.offer.type === "loan" || deal.offer.type === "loan-option" || deal.offer.type === "loan-obligation";
    if (dealIsLoan) {
      // En cesiones, la prima inicial de la contraoferta debe partir siempre
      // de la prima que acaba de ofrecer el club, también cuando es 0 €.
      setDemand(Math.round(deal.offer.amount / 100_000) / 10);
    } else if (deal.stage === "club-counter") {
      setDemand(Math.round((deal.clubDemand || deal.offer.amount) / 100_000) / 10);
    }
  }, [deal.id, deal.stage, deal.offer.amount, deal.playerSigningBonusDemand, deal.clubDemand, deal.offer.type]);
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
  const marketPlayer = getPlayer(String(deal.playerId));
  const freeAgentDeal = deal.offer.type === "free" && !marketPlayer?.clubId;
  const totalEconomicBudget = usePlayersStore((s) => s.budget);
  const wageBudget = usePlayersStore((s) => s.wageBudget);
  // `wageBudget` es la asignación salarial total; `wageBill` es la masa
  // salarial anual ya comprometida. El margen real es la diferencia entre ambas.
  const wageBill = usePlayersStore((s) => s.wageBill ?? 0);
  const transferBudget = Math.max(0, totalEconomicBudget - wageBudget);
  const currentCounterAmount = Math.max(0, Math.round(amount * 1_000_000));
  const clubDemandAmount = Math.max(0, Math.round(deal.clubDemand || deal.offer.amount));
  const clubDemandOverBudget =
    deal.direction === "in" &&
    deal.stage === "club-counter" &&
    clubDemandAmount > transferBudget;
  // La falta de presupuesto para igualar la petición del club NO debe
  // bloquear la posibilidad de contraofertar. Solo se bloquea la contraoferta
  // si el importe que el usuario ha escrito supera su propio presupuesto.
  const userCounterOverBudget =
    deal.direction === "in" &&
    deal.stage === "club-counter" &&
    currentCounterAmount > transferBudget;

  // Si la contraoferta guardada anteriormente supera el presupuesto actual,
  // la ajustamos automáticamente al máximo disponible. Esto permite editar
  // la oferta (por ejemplo, 207M con 209M disponibles) aunque la petición del
  // club sea superior al presupuesto y el botón de aceptar permanezca bloqueado.
  useEffect(() => {
    if (deal.direction !== "in" || deal.stage !== "club-counter" || isLoan) return;
    const maxCounterAmount = Math.max(0, transferBudget) / 1_000_000;
    setAmount((current) => Math.min(current, maxCounterAmount));
  }, [deal.id, deal.direction, deal.stage, isLoan, transferBudget]);
  // El pago fijo queda en la bolsa de fichajes; la fase contractual consulta
  // únicamente el margen salarial que resta después de la masa ya comprometida.
  const playerPhase = deal.stage === "player-terms" || deal.stage === "player-decision";
  // El fijo/prima ya se valida contra transferBudget. El contrato del jugador
  // usa una bolsa separada: asignación salarial menos masa salarial actual.
  const effectivePlayerWageBudget = Math.max(0, wageBudget - Math.max(0, wageBill));
  const displayedLoanClauses = isLoan && deal.agreedLoanClauses
    ? deal.agreedLoanClauses
    : deal.offer.clauses;
  const loanDestinationShare = isLoan
    ? Math.round(Math.max(0, Math.min(1, displayedLoanClauses.wageShare ?? 0)) * 20) / 20
    : 1;
  const myClubLoanShare = isLoan
    ? (deal.direction === "out" ? 1 - loanDestinationShare : loanDestinationShare)
    : 1;
  const loanPlayerSalaryCommitment = isLoan && deal.direction === "in" && marketPlayer?.contract.wage
    ? Math.max(0, Math.round(marketPlayer.contract.wage * myClubLoanShare))
    : 0;
  const playerWageCommitment = isLoan
    ? loanPlayerSalaryCommitment
    : Math.max(0, Math.round(deal.offer.wageOffer));
  const availableWageRoom = effectivePlayerWageBudget;
  const playerFinancialNeed = playerPhase && deal.direction === "in" &&
    playerWageCommitment > availableWageRoom;
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
  const signingBonusOverBudget =
    freeAgentDeal &&
    deal.stage === "player-terms" &&
    Math.max(0, Math.round(signingBonus * 1_000_000)) > transferBudget;
  const playerFinanciallySealed =
    playerPhase &&
    playerFinanciallyBlocked;
  const playerMessageIsFinancialLock =
    deal.playerMessage.startsWith("Ahora mismo no dispongo de dinero suficiente para realizar la operación.")
    || deal.playerMessage.startsWith("Ahora mismo no dispongo del margen salarial necesario para cerrar esta operación.");
  const visiblePlayerMessage = !playerFinanciallySealed && playerMessageIsFinancialLock
    ? "Ya podemos continuar la negociación. Estoy listo para valorar vuestra propuesta."
    : deal.playerMessage;
  const isFreeAgentDeal = deal.offer.type === "free";
  const operationLabel = deal.offer.isReleaseClause
    ? "Cláusula a "
    : isFreeAgentDeal
    ? "Fichaje directo · "
    : isLoan
      ? deal.direction === "in"
        ? "Cesión desde "
        : "Cesión a "
      : deal.direction === "in"
        ? "Compra a "
        : "Venta a ";
  const displayOtherClubName = isFreeAgentDeal ? "Agente libre" : clubName(deal.otherClubId);
  const duration = deal.offer.clauses.loanDurationMonths || 12;
  const otherClub = isFreeAgentDeal ? null : teamById(deal.otherClubId);
  const otherClubLeague = otherClub ? leagueName(deal.otherClubId) : "";
  const incomingAccent = deal.direction === "out";
  const isRejected = deal.stage === "failed" ||
    ["rejected", "final-rejection", "withdrawn", "expired"].includes(deal.offer.status);
  // Las cesiones conservan su identidad azul incluso durante la decisión del
  // jugador. El rechazo, en cambio, siempre tiene prioridad visual y es rojo.
  // Una vez que el jugador da el sí, el estado pasa a closing/ready/completed.
  // El acuerdo entre clubes pendiente de su respuesta sigue siendo violeta.
  const playerAccepted = deal.offer.status === "accepted" &&
    ["closing", "ready", "completed"].includes(deal.stage);
  const visualTone: DealVisualTone = isRejected
    ? "rejected"
    : isLoan
      ? "loan"
      : deal.stage === "player-decision"
        ? "player-decision"
        : playerAccepted
          ? "accepted"
          : incomingAccent && !closed
            ? "incoming"
            : "default";
  const accentText = visualTone === "rejected"
    ? "text-red-300"
    : visualTone === "loan"
      ? "text-blue-300"
      : visualTone === "player-decision"
        ? "text-violet-300"
        : visualTone === "accepted"
          ? "text-emerald-300"
          : incomingAccent ? "text-yellow-300" : "text-green-300";
  const accentBorder = visualTone === "rejected"
    ? "border-red-400/35"
    : visualTone === "loan"
      ? "border-blue-400/30"
      : visualTone === "player-decision"
        ? "border-violet-400/35"
        : visualTone === "accepted"
          ? "border-emerald-400/40"
          : incomingAccent ? "border-yellow-400/25" : "border-green-400/20";
  const accentBackground = visualTone === "rejected"
    ? "bg-red-500/[0.08]"
    : visualTone === "loan"
      ? "bg-blue-500/[0.08]"
      : visualTone === "player-decision"
        ? "bg-violet-500/[0.08]"
        : visualTone === "accepted"
          ? "bg-emerald-500/[0.09]"
          : incomingAccent ? "bg-yellow-400/5" : "bg-green-400/5";
  const headerAccentText = visualTone === "rejected"
    ? "text-red-200"
    : visualTone === "loan"
      ? "text-blue-200"
      : visualTone === "player-decision"
        ? "text-violet-200"
        : visualTone === "accepted"
          ? "text-emerald-200"
          : visualTone === "incoming" ? "text-yellow-200" : "";
  const statusTone = visualTone === "rejected"
    ? STAGE_TONE.failed
    : visualTone === "loan"
      ? "border-blue-500/40 text-blue-300"
      : visualTone === "player-decision"
        ? "border-violet-500/45 text-violet-300"
        : visualTone === "accepted"
          ? "border-emerald-500/45 text-emerald-300"
          : visualTone === "incoming"
            ? "border-cyan-500/40 text-cyan-300"
            : STAGE_TONE[deal.stage] ?? "border-border/50 text-muted-foreground";
  const cardBorder = visualTone === "rejected"
    ? "border-red-500/45"
    : visualTone === "loan"
      ? "border-blue-400/35"
      : visualTone === "player-decision"
        ? "border-violet-400/40"
        : visualTone === "accepted"
          ? "border-emerald-400/45"
          : incomingAccent && !closed
            ? "market-deal-card--pending border-yellow-400/55 ring-1 ring-yellow-400/15 shadow-[0_8px_28px_rgba(244,201,93,0.10)]"
            : STAGE_TONE[deal.stage] ?? "border-border/60";
  const headerGradient = visualTone === "rejected"
    ? "to-red-400/5"
    : visualTone === "loan"
      ? "to-blue-400/10"
      : visualTone === "player-decision"
        ? "to-violet-400/10"
        : visualTone === "accepted"
          ? "to-emerald-400/10"
          : incomingAccent ? "to-yellow-400/5" : "to-primary/5";
  const roleClubName = deal.direction === "out"
    ? (otherClub?.name ?? deal.otherClubId)
    : clubName(deal.userClubId);

  return (
    <article
      className={`market-deal-card panel overflow-hidden border ${cardBorder} ${visualTone === "loan" ? "market-loan-tone" : visualTone === "player-decision" ? "market-player-decision-tone" : visualTone === "rejected" ? "market-rejected-tone" : visualTone === "accepted" ? "market-accepted-tone" : ""}`}
    >
      <div className={`relative ${compactHeader ? "p-3" : "p-4 pb-3"} bg-gradient-to-r from-card via-card ${headerGradient}`}>
        <div className="flex items-center gap-3">
          {!compactHeader && (
            <PlayerFace
              name={deal.playerName}
              image={rawPlayer?.card}
              role={roleFromPosition(rawPlayer?.Position ?? "MID")}
              size={58}
              showRing={false}
            />
          )}
          {compactHeader && otherClub && (
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border/60 bg-secondary/60 shadow-sm">
              <TeamLogo
                teamName={otherClub.name}
                leagueName={otherClubLeague}
                size={30}
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {!compactHeader && <p className="font-black truncate text-base">{deal.playerName}</p>}
            <div className={`${compactHeader ? "" : "mt-1.5"} flex items-center gap-2`}>
              {!compactHeader && otherClub && (
                <TeamLogo
                  teamName={otherClub.name}
                  leagueName={otherClubLeague}
                  size={24}
                />
              )}
              <div className="min-w-0">
                <p className={`text-xs font-semibold truncate ${headerAccentText}`}>{operationLabel}{displayOtherClubName}</p>
                <p className="text-[0.68rem] text-muted-foreground">
                  Ronda {deal.stage === "player-terms" ? (deal.playerNegotiationRounds ?? 0) : deal.rounds}
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {compactHeader && (
              <span className={`text-sm font-black tracking-tight ${headerAccentText || "text-foreground"}`}>
                {formatEuro(deal.offer.amount)}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              {onTogglePin && (
                <button
                  type="button"
                  aria-label={pinned ? "Desfijar oferta" : "Fijar oferta"}
                  title={pinned ? "Desfijar oferta" : "Fijar oferta arriba del mercado"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePin(deal.id, !pinned);
                  }}
                  className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 transition ${
                    pinned
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
                      : "border-border/60 bg-secondary/60 text-muted-foreground hover:border-cyan-400/40 hover:text-cyan-200"
                  }`}
                >
                  {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  <span className="hidden text-[0.58rem] font-black uppercase tracking-wide sm:inline">
                    {pinned ? "Desfijar" : "Fijar"}
                  </span>
                </button>
              )}
              <span className={`text-[0.62rem] uppercase tracking-wider font-black px-2 py-1 rounded-full bg-secondary/70 border ${statusTone}`}>
                {stageLabel(deal.stage)}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-3">

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Cell tone={visualTone} label={deal.offer.isReleaseClause ? "Cláusula de rescisión" : isLoan ? "Prima de cesión" : deal.offer.type === "free" ? "Prima de fichaje acordada" : deal.direction === "out" ? "Oferta del club" : "Tu oferta"} value={formatEuro(deal.offer.amount)} />
        {deal.clubDemand > 0 && !(deal.direction === "in" && deal.stage === "player-terms") && (
          <Cell tone={visualTone} label="El club pide" value={formatEuro(deal.clubDemand)} />
        )}
        {!isLoan && deal.direction === "in" && deal.stage === "player-terms" && deal.playerWageDemand > 0 && (
          <Cell tone={visualTone} label="El jugador pide" value={`${formatEuro(deal.playerWageDemand)}/año`} />
        )}
        {isLoan && (
          <>
            <Cell
              tone={visualTone}
              label="Sueldo que paga mi club"
              value={`${Math.round(myClubLoanShare * 100)}%`}
            />
            <Cell tone={visualTone} label="Duración" value={`${duration} meses`} />
            <Cell
              tone={visualTone}
              label={`Rol en ${roleClubName}`}
              value={ROLE_OPTIONS.find((option) => option.value === (displayedLoanClauses.squadRole ?? "rotation"))?.label ?? "Rotación"}
            />
            <Cell
              tone={visualTone}
              label="Condición de compra"
              value={deal.offer.type === "loan-option" ? `Con opción · ${formatEuro(deal.offer.clauses.optionFee)}` : deal.offer.type === "loan-obligation" ? `Compra obligatoria · ${formatEuro(deal.offer.clauses.optionFee)}` : "Sin opción de compra"}
            />
          </>
        )}
        {!isLoan && (
          <Cell
            tone={visualTone}
            label="Futura venta"
            value={`${Math.round((deal.offer.clauses.sellOnPercent ?? 0) * 100)}%`}
          />
        )}
      </div>

      {deal.clubMessage && <p className="text-xs text-muted-foreground">{deal.clubMessage}</p>}

      {deal.playerMessage && deal.stage !== "player-terms" && (
        <p className={`text-xs ${deal.stage === "failed" ? "text-destructive" : accentText}`}>
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
                max={deal.direction === "in" ? transferBudget / 1_000_000 : undefined}
                onChange={setAmount}
                accent={incomingAccent}
              />
              <SelectNumber
                label="% de futura venta"
                value={sellOn}
                onChange={setSellOn}
                options={[0,5,10,15,20,25,30,35,40,45,50]}
                accent={incomingAccent}
              />
            </div>
          )}
          {isLoan && (
            <div className="rounded-2xl border border-blue-400/30 bg-blue-500/[0.06] p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className={`text-[0.62rem] uppercase tracking-[0.18em] ${accentText} font-black`}>Condiciones de cesión</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ajusta todas las condiciones antes de enviar tu contraoferta.</p>
                </div>
                <span className="rounded-full border border-border/50 bg-secondary/60 px-2 py-1 text-[0.6rem] font-black uppercase tracking-wider">Negociable</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput
                  label="Prima de cesión (M €)"
                  value={amount}
                  onChange={setAmount}
                  blue
                />
                <SelectNumber label="Sueldo que paga mi club" value={loanWageShare} onChange={setLoanWageShare} options={Array.from({ length: 21 }, (_, index) => index * 5)} blue />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SelectNumber label="Duración" value={loanDurationMonths} onChange={setLoanDurationMonths} options={[6,12,24]} formatter={(v) => v === 6 ? "6 meses" : v === 12 ? "1 año" : "2 años"} blue />
              </div>
              <label className="block text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                {`Rol en ${roleClubName}`}
                <select
                  value={incomingLoanRole}
                  onChange={(e) => setIncomingLoanRole(e.target.value as SquadRole)}
                  className="mt-1 w-full rounded-xl border border-blue-400/35 bg-secondary px-3 py-2 text-sm font-bold text-blue-200 outline-none focus:border-blue-400/60"
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
                    className="mt-1 w-full rounded-xl border border-blue-400/35 bg-secondary px-3 py-2 text-sm font-bold text-blue-200"
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
                    blue
                  />
                ) : (
                  <div className="rounded-xl border border-blue-400/25 bg-blue-500/[0.055] px-3 py-2">
                    <p className="text-[0.58rem] uppercase tracking-wider text-muted-foreground font-black">Compra</p>
                    <p className="mt-1 text-xs font-bold text-blue-100">Sin opción</p>
                  </div>
                )}
              </div>
              {loanTypeDemand !== "loan" && (
                <SelectNumber label="% para tu club en futura reventa" value={sellOn} onChange={setSellOn} options={[0,5,10,15,20,25,30,35,40,45,50]} blue />
              )}
              <div className="rounded-xl border border-blue-400/25 bg-blue-500/[0.055] px-3 py-2 text-[0.7rem] text-muted-foreground">
                Mi club pagará el <span className="font-black text-blue-100">{loanWageShare}%</span> de la ficha y {otherClub?.name ?? deal.otherClubId} pagará el <span className="font-black text-blue-100">{100 - loanWageShare}%</span>. El jugador irá como <span className="font-black text-blue-100">{ROLE_OPTIONS.find((option) => option.value === incomingLoanRole)?.label ?? "Rotación"}</span>.
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Action
              label="Aceptar condiciones propuestas"
              onClick={() => onAcceptDemand(deal.id)}
              primary={!incomingAccent}
              tone={incomingAccent ? "warning" : undefined}
              disabled={clubDemandOverBudget}
            />
            {clubDemandOverBudget && deal.direction === "in" && !isLoan && (
              <p className="basis-full text-xs text-orange-400">
                No puedes igualar la petición del club porque supera tu presupuesto de fichajes. Puedes contraofertar cualquier importe que tengas disponible.
              </p>
            )}
            <Action
              label="Contraofertar"
              tone={incomingAccent ? "warning" : undefined}
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
                            wageShare: (100 - loanWageShare) / 100,
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
        <div className={`rounded-2xl border p-3 space-y-2 ${isLoan ? "border-blue-400/30 bg-blue-500/[0.06]" : incomingAccent ? "border-cyan-400/25 bg-cyan-400/[0.055]" : "border-blue-500/20 bg-blue-500/5"}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className={`text-[0.62rem] uppercase tracking-[0.18em] font-black ${isLoan ? "text-blue-300" : incomingAccent ? "text-cyan-300" : "text-blue-300"}`}>Propuesta en valoración</p>
              <p className="mt-0.5 text-xs text-muted-foreground">El club está valorando tu propuesta. Espera su respuesta.</p>
            </div>
            <span className="text-[0.62rem] font-black text-muted-foreground">Respuesta: {deal.respondsOn}</span>
          </div>
          {isLoan && (deal.lastUserCounterClauses || deal.lastUserCounterAmount !== undefined) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Cell tone={visualTone} label="Prima de cesión" value={formatEuro(deal.lastUserCounterAmount ?? deal.offer.amount)} />
              <Cell tone={visualTone} label="Sueldo que paga mi club" value={`${deal.direction === "out" ? 100 - Math.round(((deal.lastUserCounterClauses?.wageShare as number | undefined) ?? deal.offer.clauses.wageShare ?? 0) * 100) : Math.round(((deal.lastUserCounterClauses?.wageShare as number | undefined) ?? deal.offer.clauses.wageShare ?? 0) * 100)}%`} />
              <Cell tone={visualTone} label="Duración" value={`${deal.lastUserCounterClauses?.loanDurationMonths ?? deal.offer.clauses.loanDurationMonths ?? 12} meses`} />
              <Cell tone={visualTone} label={`Rol en ${roleClubName}`} value={(ROLE_OPTIONS.find((option) => option.value === ((deal.lastUserCounterClauses?.squadRole as SquadRole | undefined) ?? displayedLoanClauses.squadRole ?? "rotation"))?.label ?? "Rotación")} />
              <Cell tone={visualTone} label="Condición de compra" value={(deal.lastUserCounterClauses?.loanType ?? deal.offer.type) === "loan-option" ? `Con opción · ${formatEuro(deal.lastUserCounterClauses?.optionFee ?? deal.offer.clauses.optionFee ?? 0)}` : (deal.lastUserCounterClauses?.loanType ?? deal.offer.type) === "loan-obligation" ? `Compra obligatoria · ${formatEuro(deal.lastUserCounterClauses?.optionFee ?? deal.offer.clauses.optionFee ?? 0)}` : "Sin opción de compra"} />
            </div>
          )}
          <Action label="Retirarse" onClick={() => onAbandon(deal.id)} />
        </div>
      )}

      {!closed && deal.stage === "player-terms" && (
        <div className="space-y-3">
          <div className={`rounded-xl border ${accentBorder} ${accentBackground} px-3 py-2.5`}>
            <p className={`text-[0.62rem] uppercase tracking-wider ${accentText} font-black`}>{deal.offer.isReleaseClause ? "Paso 1 de 2" : "Paso 2 de 2"}</p>
            <p className="mt-0.5 font-black text-sm">Negociación con el jugador</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {deal.offer.isReleaseClause
                ? "El club vendedor no interviene. Negocia ahora el salario, el rol y los años directamente con el jugador. Solo si acepta podrás pagar la cláusula y cerrar el fichaje."
                : "El club ya ha aceptado la operación. Ahora se negocian directamente las condiciones del jugador."}
            </p>
          </div>
          {(deal.playerMessage || playerFinanciallySealed) && (
            <div className={`rounded-xl border px-3 py-3 ${playerFinanciallySealed || incomingAccent ? "border-cyan-400/30 bg-cyan-500/5" : "border-primary/20 bg-secondary/40"}`}>
              <p className={`text-[0.6rem] uppercase tracking-wider font-black ${playerFinanciallySealed || incomingAccent ? "text-cyan-300" : "text-primary"}`}>{deal.playerName}</p>
              <p className="mt-1 text-sm leading-relaxed font-medium">{playerFinanciallySealed ? "El margen salarial disponible no cubre las condiciones actuales. La negociación se reabrirá cuando recuperes margen o ajustes el presupuesto salarial." : visiblePlayerMessage}</p>
            </div>
          )}
          <div className={isLoan ? "grid grid-cols-2 gap-2" : freeAgentDeal ? "grid grid-cols-2 sm:grid-cols-4 gap-2" : "grid grid-cols-3 gap-2"}>
            {!isLoan && freeAgentDeal && (
              <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Prima de fichaje
                <NumberInput
                  label="Prima de fichaje (M €)"
                  value={signingBonus}
                  onChange={setSigningBonus}
                  step={0.1}
                />
              </label>
            )}
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
              <div className={`rounded-lg border px-3 py-2 text-xs ${playerFinanciallyBlocked || playerSalaryOverBudget || signingBonusOverBudget ? "border-destructive/35 bg-destructive/5 text-destructive" : "border-border/60 bg-secondary/30 text-muted-foreground"}`}>
                <span className="font-bold text-foreground">Máximo salarial para este fichaje: {formatEuro(effectivePlayerWageBudget)}</span>
                {freeAgentDeal && (
                  <span className="block mt-1 text-muted-foreground">Prima propuesta: {formatEuro(Math.max(0, Math.round(signingBonus * 1_000_000)))} · disponible para fichajes: {formatEuro(transferBudget)}</span>
                )}
              </div>
            )}
            {playerFinanciallyBlocked && (
              <p className="basis-full text-xs text-orange-400">
                El margen salarial disponible no cubre las condiciones actuales. La negociación se reabrirá cuando recuperes margen o ajustes el presupuesto salarial.
              </p>
            )}
            <Action
              label="Negociar con el jugador"
              primary={!incomingAccent}
              tone={incomingAccent ? "warning" : undefined}
              disabled={playerFinanciallyBlocked || playerSalaryOverBudget || signingBonusOverBudget}
              onClick={() => onImproveWage(
                deal.id,
                isLoan ? deal.offer.wageOffer : Math.round(wage * 1_000_000),
                {
                  squadRole: playerRole,
                  contractYears,
                  ...(freeAgentDeal ? { signingBonus: Math.round(signingBonus * 1_000_000) } : {}),
                },
              )}
            />
            <Action label="Abandonar" onClick={() => onAbandon(deal.id)} />
          </div>
        </div>
      )}

      {!closed && deal.stage === "player-decision" && !playerFinanciallySealed && (
        <div className={`rounded-xl border ${accentBorder} ${accentBackground} px-3 py-3`}>
          <p className={`text-[0.62rem] uppercase tracking-wider ${accentText} font-black`}>Decisión del jugador</p>
          <p className="mt-1 text-sm font-bold">{visiblePlayerMessage || "El jugador está valorando la operación."}</p>
          <p className="mt-1 text-xs text-muted-foreground">Recibirás la respuesta automáticamente en la fecha indicada.</p>
        </div>
      )}

      {!closed && deal.stage === "player-decision" && playerFinanciallySealed && (
        <div className="rounded-xl border border-orange-400/30 bg-orange-500/5 px-3 py-3">
          <p className="text-[0.62rem] uppercase tracking-wider text-orange-300 font-black">Negociación con el jugador</p>
          <p className="mt-1 text-sm font-bold text-orange-100">{deal.playerMessage || "El margen salarial disponible no cubre las condiciones actuales. La negociación se reabrirá cuando recuperes margen o ajustes el presupuesto salarial."}</p>
        </div>
      )}

      {!closed && deal.stage === "closing" && (
        <div className={`rounded-xl border ${accentBorder} ${accentBackground} px-3 py-3`}>
          <p className={`text-[0.62rem] uppercase tracking-wider ${accentText} font-black`}>Cierre administrativo</p>
          <p className="mt-1 text-sm font-bold">La operación ya está acordada.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            La venta se hará efectiva el {deal.respondsOn}. En ese momento se ingresará el importe y se liberará el salario.
          </p>
        </div>
      )}

      {!closed && deal.stage === "ready" && (
        <div className="flex flex-wrap gap-2">
          <Action
            label={deal.offer.isReleaseClause ? "Pagar cláusula y cerrar fichaje" : isLoan ? "Cerrar cesión" : deal.direction === "in" ? "Cerrar fichaje" : "Cerrar venta"}
            primary={!incomingAccent}
            tone={incomingAccent ? "warning" : undefined}
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
              tone="success"
              onClick={() => onAcceptIncoming(deal.id, isLoan ? { squadRole: incomingLoanRole } : undefined)}
            />
            <Action label="Rechazar" tone="danger" onClick={() => onRejectIncoming(deal.id)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label={isLoan ? "Pedir prima (M €)" : "Pedir precio (M €)"} value={demand} onChange={setDemand} accent={incomingAccent && !isLoan} blue={isLoan} />
            {!isLoan && (
              <SelectNumber
                label="% de futura venta"
                value={sellOn}
                onChange={setSellOn}
                options={[0,5,10,15,20,25,30,35,40,45,50]}
                accent={incomingAccent}
              />
            )}
            {isLoan && (
              <>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Condición de compra</label>
                  <select
                    value={loanTypeDemand}
                    onChange={(e) => setLoanTypeDemand(e.target.value as "loan" | "loan-option" | "loan-obligation")}
                    className="w-full rounded-lg border border-blue-400/35 bg-secondary px-2 py-1.5 text-sm font-bold text-blue-200"
                  >
                    <option value="loan">Sin opción de compra</option>
                    <option value="loan-option">Con opción de compra</option>
                    <option value="loan-obligation">Con compra obligatoria</option>
                  </select>
                </div>
                <SelectNumber
                  label="% del sueldo que paga mi club"
                  value={loanWageShare}
                  onChange={setLoanWageShare}
                  options={Array.from({ length: 21 }, (_, index) => index * 5)}
                  blue
                />
                <SelectNumber
                  label="Duración"
                  value={loanDurationMonths}
                  onChange={setLoanDurationMonths}
                  options={[6,12,24]}
                  formatter={(v) => v === 6 ? "6 meses" : v === 12 ? "1 año" : "2 años"}
                  blue
                />
                <label className="col-span-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  {`Rol previsto en ${roleClubName}`}
                  <select
                    value={incomingLoanRole}
                    onChange={(e) => setIncomingLoanRole(e.target.value as SquadRole)}
                    className="mt-1 w-full rounded-lg border border-blue-400/35 bg-secondary px-2 py-1.5 text-sm font-bold text-blue-200"
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
              La ficha anual no se modifica: <span className="font-bold text-blue-100">{formatEuro(deal.offer.wageOffer)}/año</span>. Mi club pagará el <span className="font-bold text-blue-100">{loanWageShare}%</span> de la ficha y {otherClub?.name ?? deal.otherClubId} pagará el <span className="font-bold text-blue-100">{100 - loanWageShare}%</span>. El rol previsto en {roleClubName} será <span className="font-bold text-blue-100">{ROLE_OPTIONS.find((option) => option.value === incomingLoanRole)?.label ?? "Rotación"}</span>.
            </p>
          )}
          <Action
            label="Contraofertar"
            tone="warning"
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
          <div className="absolute -left-[12%] -right-[12%] top-1/2 -translate-y-1/2 -rotate-6 border-y-2 border-dashed border-red-400 bg-red-600/80 px-4 py-3 shadow-[0_0_28px_rgba(239,68,68,0.28)]">
            <div className="flex items-center justify-center gap-2 text-white font-black tracking-[0.24em] text-[0.62rem] uppercase">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-300/70 bg-black/25">🔒</span>
              Precintado · Negociación bloqueada
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-300/70 bg-black/25">🔒</span>
            </div>
            <p className="mt-1 text-center text-[0.62rem] font-semibold text-white tracking-normal normal-case">
              El margen salarial disponible no cubre las condiciones actuales. Se reabrirá automáticamente cuando recuperes margen o ajustes el presupuesto salarial.
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function Cell({ label, value, tone = "default" }: { label: string; value: string; tone?: DealVisualTone }) {
  const styles: Record<DealVisualTone, { box: string; label: string; value: string }> = {
    rejected: {
      box: "border-red-400/35 bg-red-500/[0.08]",
      label: "text-red-200/80",
      value: "text-red-100",
    },
    loan: {
      box: "border-blue-400/30 bg-blue-500/[0.08]",
      label: "text-blue-200/80",
      value: "text-blue-100",
    },
    "player-decision": {
      box: "border-violet-400/35 bg-violet-500/[0.08]",
      label: "text-violet-200/80",
      value: "text-violet-100",
    },
    accepted: {
      box: "border-emerald-400/40 bg-emerald-500/[0.09]",
      label: "text-emerald-200/80",
      value: "text-emerald-100",
    },
    incoming: {
      box: "border-cyan-400/25 bg-cyan-400/[0.055]",
      label: "text-cyan-100/75",
      value: "text-yellow-200",
    },
    default: {
      box: "border-transparent bg-secondary/50",
      label: "text-muted-foreground",
      value: "text-foreground",
    },
  };
  const style = styles[tone];

  return (
    <div className={`rounded border px-2 py-1.5 ${style.box}`}>
      <p className={`text-[0.6rem] uppercase ${style.label}`}>{label}</p>
      <p className={`font-bold ${style.value}`}>{value}</p>
    </div>
  );
}

function SelectNumber({
  label,
  value,
  onChange,
  options,
  formatter = (v) => `${v}%`,
  accent = false,
  blue = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  options: number[];
  formatter?: (value: number) => string;
  accent?: boolean;
  blue?: boolean;
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full rounded-lg border bg-secondary px-3 py-2 text-sm ${blue ? "border-blue-400/35 text-blue-200 focus:border-blue-400/60" : accent ? "border-cyan-400/35 text-yellow-200 focus:border-cyan-400/60" : "border-border text-foreground"}`}
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
  accent = false,
  blue = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  max?: number;
  accent?: boolean;
  blue?: boolean;
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
        className={`mt-1 w-32 rounded-lg border bg-secondary px-2 py-1.5 text-sm font-bold ${blue ? "border-blue-400/35 text-blue-200 focus:border-blue-400/60" : accent ? "border-cyan-400/35 text-yellow-200 focus:border-cyan-400/60" : "border-border text-foreground"}`}
      />
    </label>
  );
}

function Action({
  label,
  onClick,
  primary,
  tone,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  tone?: "success" | "danger" | "warning";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
        tone === "success" ? "border border-emerald-500/40 bg-emerald-500 text-white hover:bg-emerald-600"
          : tone === "danger" ? "border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
            : tone === "warning" ? "border border-cyan-400/40 bg-cyan-400/10 text-yellow-200 hover:bg-cyan-400/20"
              : primary ? "bg-primary text-primary-foreground hover:brightness-110" : "bg-secondary hover:bg-secondary/70"
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


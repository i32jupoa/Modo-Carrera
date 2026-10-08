import { additionalWageCommitment } from "@/lib/transfers/BudgetManager";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CircleDollarSign, Handshake, HeartHandshake, Shield, Sparkles, TrendingUp, WalletCards, X, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { RoleBadge } from "@/components/RoleBadge";
import { faceUrl } from "@/lib/playerFaces";
import { formatEuro, type FcPlayer, usePlayersStore } from "@/store/playersStore";
import {
  acceptInternalCounterOffer,
  buildInitialInternalOffer,
  completeInternalContractNegotiation,
  getInternalContractNegotiation,
  startInternalContractNegotiation,
  submitInternalContractOffer,
  withdrawInternalContractNegotiation,
  type InternalContractContext,
  type InternalContractKind,
  type InternalContractOffer,
  type InternalContractNegotiationState,
} from "@/lib/transfers/InternalContractNegotiation";
import { getPlayer } from "@/lib/transfers/PlayerIndex";
import { toast } from "sonner";
import type { Contract, SquadRole } from "@/lib/transfers/types";
import { WAGE_RULES } from "@/lib/transfers/constants";

interface Props {
  player: FcPlayer;
  clubId: string;
  kind: InternalContractKind;
  currentDate: string;
  currentContract: Partial<Contract>;
  context?: InternalContractContext;
  title?: string;
  description?: string;
  onClose: () => void;
  onAccepted: (offer: InternalContractOffer) => Promise<{ ok: true } | { ok: false; reason: string }>;
  onPersist?: () => void;
}

function roleLabel(role: SquadRole): string {
  switch (role) {
    case "star": return "Estrella";
    case "starter": return "Titular";
    case "rotation": return "Rotación";
    case "prospect": return "Promesa";
    default: return "Secundario";
  }
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix: string;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[0.61rem] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <div className="flex items-center rounded-xl border border-border/60 bg-secondary/50 focus-within:border-primary/60">
        <input
          aria-label={label}
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-black outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="px-3 text-[0.62rem] font-black text-muted-foreground">{suffix}</span>
      </div>
    </label>
  );
}

function ContractMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/25 p-3">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <p className="mt-2 text-[0.52rem] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-black">{value}</p>
    </div>
  );
}

function stateCopy(kind: InternalContractKind): { title: string; description: string } {
  if (kind === "promotion") {
    return {
      title: "Primer contrato profesional",
      description: "La promesa ya está en tu estructura. Ahora decide si acepta las condiciones para dar el salto al primer equipo.",
    };
  }
  if (kind === "youth-renewal") {
    return {
      title: "Renovación juvenil",
      description: "Renueva su vínculo de cantera. La predisposición influye en cuánto margen tienes para negociar años y condiciones.",
    };
  }
  return {
    title: "Renovación de contrato",
    description: "Negocia con tu propio jugador. El umbral es más flexible que con un fichaje externo, pero puede exigir mejoras o rechazar la propuesta.",
  };
}

export function ContractNegotiationModal({
  player,
  clubId,
  kind,
  currentDate,
  currentContract,
  context = {},
  title,
  description,
  onClose,
  onAccepted,
  onPersist,
}: Props) {
  const defaultCopy = stateCopy(kind);
  const [session, setSession] = useState<InternalContractNegotiationState | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
  const [years, setYears] = useState(3);
  const [wageM, setWageM] = useState(0);
  const [clauseM, setClauseM] = useState(0);
  const [bonusM, setBonusM] = useState(0);
  const [role, setRole] = useState<SquadRole>(context.currentRole ?? "rotation");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const budget = usePlayersStore((state) => state.budget);
  const wageBudget = usePlayersStore((state) => state.wageBudget);

  const contextRef = useRef(context);
  const persistRef = useRef(onPersist);
  contextRef.current = context;
  persistRef.current = onPersist;

  useEffect(() => {
    // Repara/migra la bolsa salarial antes de calcular la primera oferta.
    // Así una partida antigua con `wageBudget = 0` nunca presenta margen €0
    // si el presupuesto salarial real está disponible en Mercado.
    usePlayersStore.getState().syncWageStateFromMarket();
    const liveContext = contextRef.current;
    const existing = getInternalContractNegotiation(`internal-contract:${kind}:${clubId}:${player.ID}`);
    const started = startInternalContractNegotiation({
      playerId: String(player.ID),
      clubId,
      kind,
      date: currentDate,
      context: liveContext,
    });
    if ("blockedUntil" in started) {
      setBlockedUntil(started.blockedUntil);
      setSession(null);
      return;
    }
    setSession(started);
    const initial = started.offer ?? existing?.offer ?? buildInitialInternalOffer({ playerId: String(player.ID), kind, date: currentDate, context: liveContext });
    setYears(initial.years);
    setWageM(initial.wage / 1_000_000);
    setClauseM(initial.releaseClause / 1_000_000);
    setBonusM(initial.signingBonus / 1_000_000);
    setRole(initial.squadRole);
    persistRef.current?.();
  }, [clubId, currentDate, kind, player.ID]);

  const offer: InternalContractOffer = useMemo(() => ({
    years,
    wage: Math.max(0, Math.round(wageM * 1_000_000)),
    releaseClause: Math.max(0, Math.round(clauseM * 1_000_000)),
    signingBonus: kind === "youth-renewal" ? 0 : Math.max(0, Math.round(bonusM * 1_000_000)),
    squadRole: role,
  }), [bonusM, clauseM, kind, role, wageM, years]);

  const demand = session?.demand;
  const currentWage = Number(currentContract.wage ?? getPlayerAnnualWageFallback(String(player.ID)));
  const currentYears = Number(currentContract.yearsLeft ?? 0);
  const currentClause = Number(currentContract.releaseClause ?? 0);
  const currentBonus = Number(currentContract.signingBonus ?? 0);
  const signingImpact = kind === "youth-renewal" ? 0 : offer.signingBonus;
  const normalizedWageBudget = Math.min(
    Math.max(0, budget),
    wageBudget > 0 ? Math.round(wageBudget) : Math.round(budget * 0.05),
  );
  // Renovar no exige disponer del salario anual completo: sólo la subida
  // respecto a la ficha actual consume margen salarial. En una promoción,
  // el salario actual es 0 y por tanto la ficha completa es la obligación nueva.
  const wageCommitment = kind === "youth-renewal"
    ? 0
    : additionalWageCommitment(kind === "renewal" ? currentWage : 0, offer.wage);
  const availableRoom = Math.max(0, normalizedWageBudget);
  const wageOver = kind !== "youth-renewal" && wageCommitment > availableRoom;
  const transferBudget = Math.max(0, budget - normalizedWageBudget);
  const bonusOver = signingImpact > transferBudget;
  const mood = session?.mood ?? context.morale ?? 70;
  const moodText = mood >= 78 ? "Muy predispuesto" : mood >= 60 ? "Dispuesto a negociar" : mood >= 45 ? "Dubitativo" : "Molesto";
  const moodWidth = `${Math.max(5, Math.min(100, mood))}%`;
  const canSubmit = !!session && !busy && !blockedUntil && !wageOver && !bonusOver;
  const pendingOffer = session?.pendingAcceptedOffer;
  const response = session?.lastMessage ?? "El jugador está esperando tu propuesta.";

  function applyMoodDelta(delta: number) {
    if (!delta) return;
    const current = usePlayersStore.getState().stats[String(player.ID)];
    const nextMorale = Math.max(0, Math.min(100, Math.round((current?.morale ?? context.morale ?? 70) + delta)));
    if (!current) return;
    usePlayersStore.setState({
      stats: {
        ...usePlayersStore.getState().stats,
        [String(player.ID)]: { ...current, morale: nextMorale },
      },
    });
  }

  async function submitOffer() {
    if (!session || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = submitInternalContractOffer({ negotiationId: session.id, offer, date: currentDate, context });
      setSession(result.negotiation);
      applyMoodDelta(result.moraleDelta);
      onPersist?.();
      if (result.verdict === "rejected") {
        toast.error(`${player.Name} rechaza la propuesta.`, { description: result.message });
      } else if (result.verdict === "accepted") {
        toast.success(`${player.Name} acepta las condiciones.`, { description: "Revisa el acuerdo y pulsa «Ahora cerrar operación» para confirmar la renovación." });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo procesar la oferta.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function acceptCounter() {
    if (!session || !session.counterOffer || busy) return;
    setBusy(true);
    setError(null);
    try {
      const accepted = acceptInternalCounterOffer(session.id, currentDate);
      if (!accepted) return;
      setSession(accepted);
      applyMoodDelta(2);
      onPersist?.();
      toast.success(`${player.Name} acepta la contraoferta.`, { description: "Revisa el acuerdo y pulsa «Ahora cerrar operación» para confirmar la renovación." });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo aceptar la contraoferta.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmAcceptedAgreement() {
    if (!session?.pendingAcceptedOffer || busy) return;
    setBusy(true);
    setError(null);
    try {
      const applied = await onAccepted(session.pendingAcceptedOffer);
      if (!applied.ok) {
        setError(applied.reason);
        toast.error("No se ha podido cerrar la renovación", { description: applied.reason });
        return;
      }
      completeInternalContractNegotiation(session.id, true, currentDate);
      const completed = getInternalContractNegotiation(session.id);
      setSession(completed ?? { ...session, status: "accepted", pendingAcceptedOffer: undefined });
      onPersist?.();
      toast.success("Renovación confirmada", { description: `${player.Name} continuará en el club con las nuevas condiciones.` });
      onClose();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo cerrar la renovación.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function withdraw() {
    if (!session || busy) return;
    withdrawInternalContractNegotiation(session.id, currentDate);
    onPersist?.();
    toast.message("Negociación retirada", { description: "El jugador podrá volver a hablar contigo más adelante." });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[94vh] max-w-3xl overflow-y-auto overflow-x-hidden p-0">
        <div className="relative overflow-hidden border-b border-border/50 bg-gradient-to-br from-emerald-500/25 via-primary/10 to-transparent p-5">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <button type="button" onClick={onClose} disabled={busy} className="absolute right-3 top-3 z-10 rounded-full p-2 text-foreground/70 transition hover:bg-background/30 hover:text-foreground disabled:opacity-40" aria-label="Cerrar negociación">
            <X className="h-4 w-4" />
          </button>
          <DialogHeader className="relative">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex items-end gap-3">
                <div className="grid h-28 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/60 bg-secondary/60 shadow-xl sm:h-32">
                  <PlayerFace name={player.Name} image={faceUrl(String(player.ID), player.card)} role={roleFromPosition(player.Position)} size={96} className="rounded-2xl" />
                </div>
                <div className="mb-1 grid h-14 w-14 place-items-center rounded-2xl border border-primary/30 bg-background/40 text-2xl font-black shadow-lg">{Math.round(player.OVR)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-2xl font-black tracking-tight">{title ?? defaultCopy.title}</DialogTitle>
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[0.55rem] font-black uppercase tracking-wider text-primary">Negociación interna</span>
                </div>
                <DialogDescription className="mt-1 text-xs font-semibold">{description ?? defaultCopy.description}</DialogDescription>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-xl border border-border/50 bg-background/35 px-2.5 py-2 text-xs font-black">{player.Name}</span>
                  <span className="rounded-xl border border-border/50 bg-background/35 px-2.5 py-2 text-xs font-bold text-muted-foreground">{player.Age} años · {player.Nation ?? "—"}</span>
                  <RoleBadge role={role} compact />
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          {blockedUntil ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="font-black text-amber-200">Negociación en enfriamiento</p>
              <p className="mt-1 text-xs text-amber-100/75">El jugador quiere dejar pasar un tiempo antes de volver a hablar. Disponible a partir del {blockedUntil}.</p>
            </div>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <ContractMetric icon={WalletCards} label="Salario actual" value={`${formatEuro(currentWage)}/año`} />
                <ContractMetric icon={CalendarDays} label="Contrato" value={`${currentYears || "—"} temp.`} />
                <ContractMetric icon={Shield} label="Cláusula" value={formatEuro(currentClause)} />
                <ContractMetric icon={CircleDollarSign} label="Prima" value={formatEuro(currentBonus)} />
              </section>

              <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4 rounded-2xl border border-border/60 bg-card/50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div><p className="text-[0.61rem] font-black uppercase tracking-[0.16em] text-muted-foreground">Tu propuesta</p><p className="mt-1 text-sm font-black">Condiciones del nuevo contrato</p></div>
                    <Handshake className="h-5 w-5 text-primary" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField label="Duración" value={years} onChange={setYears} min={1} max={5} suffix="años" />
                    <NumberField label="Salario anual" value={wageM} onChange={setWageM} min={0} step={0.05} suffix="M €" />
                    <NumberField label="Cláusula" value={clauseM} onChange={setClauseM} min={0} step={0.1} suffix="M €" />
                    <NumberField label="Prima" value={bonusM} onChange={setBonusM} min={0} step={0.05} suffix="M €" disabled={kind === "youth-renewal"} />
                  </div>
                  <label className="space-y-1.5">
                    <span className="text-[0.61rem] font-black uppercase tracking-[0.16em] text-muted-foreground">Rol esperado</span>
                    <select aria-label="Rol esperado" value={role} onChange={(event) => setRole(event.target.value as SquadRole)} className="w-full rounded-xl border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm font-black outline-none focus:border-primary/60">
                      {(["star", "starter", "rotation", "prospect", "secondary"] as SquadRole[]).map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}
                    </select>
                  </label>
                </div>

                <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="text-[0.61rem] font-black uppercase tracking-[0.16em] text-primary">Lo que espera el jugador</p></div>
                  {demand ? (
                    <div className="space-y-2 text-xs">
                      <DemandRow label="Salario" value={`${formatEuro(demand.wage)}/año`} />
                      <DemandRow label="Duración" value={`${demand.years} años`} />
                      <DemandRow label="Rol" value={roleLabel(demand.role)} />
                      {kind !== "youth-renewal" && <DemandRow label="Prima" value={formatEuro(demand.signingBonus)} />}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">Calculando sus condiciones…</p>}
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-secondary/25 p-4">
                  <div className="flex items-center justify-between gap-2"><span className="text-[0.61rem] font-black uppercase tracking-[0.16em] text-muted-foreground">Predisposición</span><motion.span key={mood} initial={{ opacity: 0.5, y: 2 }} animate={{ opacity: 1, y: 0 }} className="text-xs font-black">{mood}/100 · {moodText}</motion.span></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"><motion.div animate={{ width: moodWidth }} transition={{ duration: 0.35 }} className="h-full rounded-full bg-primary" /></div>
                  <p className="mt-2 text-[0.64rem] text-muted-foreground">La lealtad, el tiempo en el club, el rol y tu trato durante la negociación influyen en este ánimo.</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-secondary/25 p-4">
                  <p className="text-[0.61rem] font-black uppercase tracking-[0.16em] text-muted-foreground">Impacto económico</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-border/50 bg-background/25 p-2.5"><p className="text-muted-foreground">Margen salarial</p><p className={`mt-0.5 font-black ${wageOver ? "text-destructive" : "text-emerald-300"}`}>{formatEuro(Math.max(0, availableRoom - wageCommitment))}</p></div>
                    <div className="rounded-xl border border-border/50 bg-background/25 p-2.5"><p className="text-muted-foreground">Presupuesto tras prima</p><p className={`mt-0.5 font-black ${bonusOver ? "text-destructive" : "text-emerald-300"}`}>{formatEuro(Math.max(0, budget - signingImpact))}</p></div>
                  </div>
                </div>
              </section>

              <AnimatePresence initial={false} mode="wait">
                <motion.div key={response} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10"><HeartHandshake className="h-4 w-4 text-primary" /></div><div><p className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-primary">Respuesta del jugador</p><p aria-live="polite" className="mt-1 text-sm font-semibold leading-relaxed">{response}</p></div></div>
                </motion.div>
              </AnimatePresence>

              {!!session?.history.length && (
                <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
                  <div className="mb-3 flex items-center justify-between"><div><p className="text-[0.61rem] font-black uppercase tracking-[0.16em] text-muted-foreground">Historial</p><p className="mt-1 text-sm font-black">Ronda {Math.min(session.round, 3)} de 3</p></div><TrendingUp className="h-4 w-4 text-primary" /></div>
                  <div className="space-y-2">{session.history.slice(-6).map((entry, index) => <div key={`${entry.round}-${entry.by}-${index}`} className="flex gap-3 rounded-xl border border-border/40 bg-secondary/20 p-2.5"><span className="mt-0.5 shrink-0 rounded-full bg-secondary px-2 py-1 text-[0.55rem] font-black uppercase">{entry.by === "club" ? "Club" : "Jugador"}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{entry.text}</p><p className="mt-1 text-[0.54rem] text-muted-foreground">Ronda {entry.round} · {entry.offer.years} años · {formatEuro(entry.offer.wage)}/año</p></div></div>)}</div>
                </section>
              )}

              {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">{error}</div>}
              {(wageOver || bonusOver) && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">{wageOver && `La subida salarial supera el margen disponible (${formatEuro(availableRoom)}). `}{bonusOver && `La prima supera el presupuesto de fichajes disponible (${formatEuro(transferBudget)}).`}</div>}

              <AnimatePresence initial={false}>
                {pendingOffer && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 shadow-lg shadow-emerald-950/10"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-emerald-300">Acuerdo alcanzado</p>
                        <p className="mt-1 text-sm font-black">{player.Name} ha aceptado tu propuesta.</p>
                        <p className="mt-1 text-xs text-emerald-100/70">Revisa las condiciones y confirma la renovación para aplicar el nuevo contrato y el impacto económico.</p>
                      </div>
                      <button type="button" onClick={confirmAcceptedAgreement} disabled={busy} className="shrink-0 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-black text-emerald-950 shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Cerrando…" : "Ahora cerrar operación"}</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={withdraw} disabled={busy || !!pendingOffer} className="rounded-xl border border-border/60 bg-secondary/60 px-4 py-2.5 text-xs font-black transition hover:border-border disabled:opacity-40">Retirar oferta</button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {session?.counterOffer && !pendingOffer && <button type="button" onClick={acceptCounter} disabled={busy} className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-black text-primary transition hover:bg-primary/15 disabled:opacity-40">Aceptar contraoferta</button>}
                  <button type="button" onClick={submitOffer} disabled={!canSubmit || !!pendingOffer} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-primary-foreground shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Negociando…" : "Ofrecer"}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DemandRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/20 px-3 py-2"><span className="text-muted-foreground">{label}</span><strong>{value}</strong></div>;
}

function getPlayerAnnualWageFallback(playerId: string): number {
  return Number(getPlayer(playerId)?.contract.wage ?? 0);
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePlayersStore } from "@/store/playersStore";
import {
  acceptClubDemand,
  acceptIncomingOffer,
  advanceUserDeals,
  clearFinishedUserDeals,
  counterIncomingOffer,
  finalizeUserDeal,
  freshRumors,
  getSimulationState,
  improvePlayerTerms,
  improveUserOffer,
  isTransferSystemInitialized,
  listTransfers,
  listUserDeals,
  rejectIncomingOffer,
  saveTransferSystem,
  scoutPlayer,
  setUserPlayerTransferListed,
  submitUserOffer,
  summarize,
  syncUserFinances,
  withdrawUserDeal,
  type OfferClauses,
  type Rumor,
  type ScoutingReport,
  type TransferRecord,
  type UserDeal,
} from "@/lib/transfers";
import { flushWorldMoves } from "@/lib/transfers/WorldSync";

/**
 * Puente entre la pantalla de fichajes y el motor de mercado.
 *
 * La UI nunca toca el motor directamente: aquí se avanzan las negociaciones al
 * cambiar la fecha, se ejecutan las acciones del usuario y se sincroniza el
 * resultado con la plantilla y el presupuesto de la partida.
 */
export interface UserMarketApi {
  ready: boolean;
  currentDate: string;
  deals: UserDeal[];
  incoming: UserDeal[];
  outgoing: UserDeal[];
  rumors: Rumor[];
  history: TransferRecord[];
  summary: ReturnType<typeof summarize> | null;
  window: string;
  deadlineDay: boolean;
  windowDay: number;
  scout: (playerId: string) => ScoutingReport | null;
  makeOffer: (input: {
    playerId: string;
    amount: number;
    wageOffer: number;
    clauses?: Partial<OfferClauses>;
  }) => void;
  improveOffer: (dealId: string, amount: number, wageOffer: number) => void;
  acceptDemand: (dealId: string) => void;
  improveWage: (dealId: string, wage: number) => void;
  confirmDeal: (dealId: string) => void;
  abandonDeal: (dealId: string) => void;
  acceptIncoming: (dealId: string) => void;
  counterIncoming: (dealId: string, demand: number) => void;
  rejectIncoming: (dealId: string) => void;
  toggleTransferList: (playerId: string, listed: boolean) => void;
  clearFinished: () => void;
}

export function useUserMarket(enabled: boolean): UserMarketApi {
  const currentDate = usePlayersStore((s) => s.currentDate);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const ready = enabled && typeof window !== "undefined" && isTransferSystemInitialized() && !!myTeamId;

  // Avanza las negociaciones del usuario cada vez que cambia la fecha.
  useEffect(() => {
    if (!ready || !myTeamId) return;
    const events = advanceUserDeals(myTeamId, currentDate);
    flushWorldMoves();
    if (events.length > 0) {
      for (const event of events.slice(0, 4)) toast.info(event.text);
      saveTransferSystem();
      refresh();
    }
  }, [ready, myTeamId, currentDate, refresh]);

  const state = ready ? getSimulationState() : null;

  const deals = useMemo(() => (ready ? listUserDeals() : []), [ready, tick, currentDate]);
  const incoming = useMemo(() => deals.filter((d) => d.direction === "out"), [deals]);
  const outgoing = useMemo(() => deals.filter((d) => d.direction === "in"), [deals]);
  const rumors = useMemo(() => (ready ? freshRumors(currentDate, 200) : []), [ready, currentDate, tick]);
  const history = useMemo(() => (ready ? listTransfers(600) : []), [ready, currentDate, tick]);
  const summary = useMemo(() => (ready ? summarize(listTransfers()) : null), [ready, currentDate, tick]);

  const commit = useCallback(
    (message?: string, error?: string) => {
      if (error) toast.error(error);
      else if (message) toast.success(message);
      saveTransferSystem();
      refresh();
    },
    [refresh],
  );

  const scout = useCallback(
    (playerId: string) => (ready && myTeamId ? scoutPlayer(playerId, myTeamId, currentDate) : null),
    [ready, myTeamId, currentDate],
  );

  const makeOffer = useCallback<UserMarketApi["makeOffer"]>(
    ({ playerId, amount, wageOffer, clauses }) => {
      if (!myTeamId) return;
      const budget = usePlayersStore.getState().budget;
      if (amount > budget) {
        toast.error("No tienes presupuesto para esa oferta.");
        return;
      }
      const result = submitUserOffer({
        playerId,
        userClubId: myTeamId,
        date: currentDate,
        amount,
        wageOffer,
        clauses,
      });
      commit(result.ok ? "Oferta enviada. El club responderá en unos días." : undefined, result.reason);
    },
    [myTeamId, currentDate, commit],
  );

  const improveOffer = useCallback(
    (dealId: string, amount: number, wageOffer: number) => {
      const result = improveUserOffer(dealId, { amount, wageOffer }, currentDate);
      commit(result.ok ? "Oferta mejorada." : undefined, result.reason);
    },
    [currentDate, commit],
  );

  const acceptDemand = useCallback(
    (dealId: string) => {
      const result = acceptClubDemand(dealId, currentDate);
      commit(result.ok ? "Has igualado lo que pide el club." : undefined, result.reason);
    },
    [currentDate, commit],
  );

  const improveWage = useCallback(
    (dealId: string, wage: number) => {
      const result = improvePlayerTerms(dealId, wage, currentDate);
      commit(result.ok ? "Nueva ficha ofrecida al jugador." : undefined, result.reason);
    },
    [currentDate, commit],
  );

  /**
   * Cierra el fichaje de forma atómica.
   *
   * El dinero lo mueve una sola vez el motor (que escribe en el presupuesto de
   * la partida a través del puente), así que aquí sólo se comprueba antes que
   * la operación es viable y después se añade el jugador a la plantilla con
   * coste 0 para no descontar dos veces.
   */
  const confirmDeal = useCallback(
    (dealId: string) => {
      const deal = listUserDeals().find((d) => d.id === dealId);
      if (!deal) {
        commit(undefined, "La negociación ya no existe.");
        return;
      }
      const store = usePlayersStore.getState();
      const fee = deal.offer?.amount ?? 0;
      if (store.budget < fee) {
        commit(undefined, `Presupuesto insuficiente para cerrar el fichaje.`);
        return;
      }
      if (store.rosterIds.includes(deal.playerId)) {
        commit(undefined, "El jugador ya está en tu plantilla.");
        return;
      }
      const result = finalizeUserDeal(dealId, currentDate);
      if (!result.ok || result.fee === undefined || !result.record) {
        commit(undefined, result.reason ?? "No se pudo cerrar la operación.");
        return;
      }
      const bought = store.buyPlayer(result.record.playerId, 0);
      if (!bought.ok) {
        // La plantilla no lo admite: se devuelve el dinero ya descontado.
        syncUserFinances(myTeamId!, result.fee, result.wage ?? 0, true);
        commit(undefined, bought.reason ?? "La plantilla no admite el fichaje.");
        return;
      }
      flushWorldMoves();
      commit(`Fichaje cerrado por ${(result.fee / 1_000_000).toFixed(1)}M €.`);
    },
    [currentDate, commit, myTeamId],
  );

  const abandonDeal = useCallback(
    (dealId: string) => {
      withdrawUserDeal(dealId, currentDate);
      commit("Negociación abandonada.");
    },
    [currentDate, commit],
  );

  /**
   * Acepta la venta de forma atómica: se valida la plantilla antes de cerrar y
   * el ingreso lo aplica el motor una sola vez (precio 0 en el store).
   */
  const acceptIncoming = useCallback(
    (dealId: string) => {
      const store = usePlayersStore.getState();
      if (store.rosterIds.length <= 11) {
        commit(undefined, "Debes mantener al menos 11 jugadores en la plantilla.");
        return;
      }
      const result = acceptIncomingOffer(dealId, currentDate);
      if (!result.ok || result.fee === undefined || !result.record) {
        commit(undefined, result.reason ?? "La venta no se pudo cerrar.");
        return;
      }
      const sold = store.sellPlayer(result.record.playerId, 0);
      if (!sold.ok) {
        commit(undefined, sold.reason ?? "La venta no se pudo aplicar a tu plantilla.");
        return;
      }
      flushWorldMoves();
      commit(`Venta cerrada por ${(result.fee / 1_000_000).toFixed(1)}M €.`);
    },
    [currentDate, commit],
  );

  const counterIncoming = useCallback(
    (dealId: string, demand: number) => {
      const result = counterIncomingOffer(dealId, demand, currentDate);
      commit(result.ok ? "Contraoferta enviada." : undefined, result.reason);
    },
    [currentDate, commit],
  );

  const rejectIncoming = useCallback(
    (dealId: string) => {
      rejectIncomingOffer(dealId, currentDate);
      commit("Oferta rechazada.");
    },
    [currentDate, commit],
  );

  const toggleTransferList = useCallback(
    (playerId: string, listed: boolean) => {
      setUserPlayerTransferListed(playerId, listed);
      commit(listed ? "Jugador en la lista de transferibles." : "Jugador retirado de la lista.");
    },
    [commit],
  );

  const clearFinished = useCallback(() => {
    clearFinishedUserDeals();
    commit();
  }, [commit]);

  return {
    ready,
    currentDate,
    deals,
    incoming,
    outgoing,
    rumors,
    history,
    summary,
    window: state?.window ?? "closed",
    deadlineDay: state?.deadlineDay ?? false,
    windowDay: state?.windowDay ?? 0,
    scout,
    makeOffer,
    improveOffer,
    acceptDemand,
    improveWage,
    confirmDeal,
    abandonDeal,
    acceptIncoming,
    counterIncoming,
    rejectIncoming,
    toggleTransferList,
    clearFinished,
  };
}

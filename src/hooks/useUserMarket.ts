import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatEuro, usePlayersStore } from "@/store/playersStore";
import { useNotificationsStore } from "@/store/notificationsStore";
import {
  acceptClubDemand,
  acceptIncomingOffer,
  advanceUserDeals,
  clearFinishedUserDeals,
  counterIncomingOffer,
  finalizeUserDeal,
  freshRumors,
  getPlayer,
  currentWindowStart,
  getFinances,
  rumorsSince,
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
  submitUserLoanOutOffer,
  setUserPlayerLoanListed,
  submitUserOffer,
  summarize,
  syncUserFinances,
  withdrawUserDeal,
  type OfferClauses,
  type Rumor,
  type TransferType,
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
  /** Rumores de toda la ventana de mercado (para filtrar por club). */
  windowRumors: Rumor[];
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
    type?: TransferType;
    clauses?: Partial<OfferClauses>;
  }) => void;
  setLoanListed: (playerId: string, listed: boolean) => void;
  makeLoanOutOffer: (input: {
    playerId: string;
    borrowerClubId: string;
    loanFee: number;
    wageShare: number;
    durationMonths?: number;
    type?: Extract<TransferType, "loan" | "loan-option" | "loan-obligation">;
  }) => void;
  improveOffer: (dealId: string, amount: number, wageOffer: number, clauses?: Partial<OfferClauses>) => void;
  acceptDemand: (dealId: string) => void;
  improveWage: (dealId: string, wage: number) => void;
  confirmDeal: (dealId: string) => void;
  abandonDeal: (dealId: string) => void;
  acceptIncoming: (dealId: string) => void;
  counterIncoming: (dealId: string, demand: number, clauses?: Partial<OfferClauses>) => void;
  rejectIncoming: (dealId: string) => void;
  toggleTransferList: (playerId: string, listed: boolean) => void;
  clearFinished: () => void;
}

export function useUserMarket(enabled: boolean): UserMarketApi {
  const currentDate = usePlayersStore((s) => s.currentDate);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const ready =
    enabled && typeof window !== "undefined" && isTransferSystemInitialized() && !!myTeamId;

  // Las negociaciones las avanza `MarketNotifier` de forma global (también
  // con la pantalla de mercado cerrada) y sus novedades se muestran como
  // círculos de colores en el menú lateral, no como avisos emergentes. Aquí
  // sólo se refresca la vista cuando llegan novedades nuevas.
  const notificationsVersion = useNotificationsStore((s) => s.items.length);
  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [ready, notificationsVersion, currentDate, refresh]);

  const state = ready ? getSimulationState() : null;

  useEffect(() => {
    if (!ready || !myTeamId) return;
    const loans = usePlayersStore.getState().loanedPlayers;
    for (const [playerId] of Object.entries(loans)) {
      const marketPlayer = getPlayer(playerId);
      if (!marketPlayer || marketPlayer.loanClubId !== myTeamId) {
        usePlayersStore.getState().removeLoanedPlayer(playerId);
      }
    }
  }, [ready, myTeamId, currentDate, tick]);

  const deals = useMemo(() => (ready ? listUserDeals() : []), [ready, tick, currentDate]);
  const incoming = useMemo(() => deals.filter((d) => d.direction === "out"), [deals]);
  const outgoing = useMemo(() => deals.filter((d) => d.direction === "in"), [deals]);
  const rumors = useMemo(
    () => (ready ? freshRumors(currentDate, 200) : []),
    [ready, currentDate, tick],
  );
  // Historial completo de la ventana en curso (o de la última cerrada): la UI
  // lo usa al filtrar por un club concreto.
  const windowRumors = useMemo(
    () => (ready ? rumorsSince(currentWindowStart(currentDate), 3000) : []),
    [ready, currentDate, tick],
  );
  // Historial completo (sin tope): con más actividad de mercado, un tope
  // bajo aquí hacía que el filtro por liga/club, o la orden "más caros",
  // se calculasen sobre solo los últimos cientos de traspasos y se perdiera
  // el récord real si había ocurrido antes. Ordenar/filtrar un array de
  // varios miles de elementos es instantáneo, así que no hace falta capar
  // los datos — sólo lo que se pinta en pantalla (eso ya lo hace
  // `MarketFeed` al final, con su propio límite de renderizado).
  const history = useMemo(() => (ready ? listTransfers() : []), [ready, currentDate, tick]);
  const summary = useMemo(
    () => (ready ? summarize(listTransfers()) : null),
    [ready, currentDate, tick],
  );

  const commit = useCallback(
    (message?: string, error?: string) => {
      if (error) toast.error(error);
      else if (message) toast.success(message);
      saveTransferSystem();
      refresh();
    },
    [refresh],
  );

  /**
   * Refleja al instante en la partida el presupuesto que ha quedado en el
   * motor tras un fichaje o una venta (el motor es la única caja del club).
   */
  const syncBudget = useCallback(() => {
    if (!myTeamId) return;
    const finances = getFinances(myTeamId);
    const current = usePlayersStore.getState();
    if (current.budget !== finances.budget || current.wageBudget !== finances.wageBudget || current.wageBill !== finances.wageBill) {
      usePlayersStore.setState({
        budget: Math.max(0, Math.round(finances.budget)),
        wageBudget: Math.max(0, Math.round(finances.wageBudget)),
        wageBill: Math.max(0, Math.round(finances.wageBill)),
      });
    }
  }, [myTeamId]);

  const scout = useCallback(
    (playerId: string) => (ready && myTeamId ? scoutPlayer(playerId, myTeamId, currentDate) : null),
    [ready, myTeamId, currentDate],
  );

  const makeOffer = useCallback<UserMarketApi["makeOffer"]>(
    ({ playerId, amount, wageOffer, type, clauses }) => {
      if (!myTeamId) return;
      const store = usePlayersStore.getState();
      const budget = store.budget;
      const wageRoom = Math.max(0, store.wageBudget);
      const isLoan =
        type === "loan" || type === "loan-option" || type === "loan-obligation";
      const wageCommitment = isLoan
        ? wageOffer * Math.max(0, Math.min(1, clauses?.wageShare ?? 0.5))
        : wageOffer;
      if (amount > budget) {
        toast.error("No tienes presupuesto para esa oferta.");
        return;
      }
      if (wageCommitment > wageRoom) {
        toast.error("No tienes margen salarial suficiente para asumir esa parte de la ficha.");
        return;
      }
      const result = submitUserOffer({
        playerId,
        userClubId: myTeamId,
        date: currentDate,
        amount,
        wageOffer,
        type,
        clauses,
      });
      commit(
        result.ok ? "Oferta enviada. El club responderá en unos días." : undefined,
        result.reason,
      );
    },
    [myTeamId, currentDate, commit],
  );

  const setLoanListed = useCallback((playerId: string, listed: boolean) => {
    setUserPlayerLoanListed(playerId, listed);
    commit(listed ? "Búsqueda de cesión activada." : "Búsqueda de cesión cancelada.");
  }, [commit]);

  const makeLoanOutOffer = useCallback<UserMarketApi["makeLoanOutOffer"]>(
    ({ playerId, borrowerClubId, loanFee, wageShare, durationMonths, type }) => {
      if (!myTeamId) return;
      const result = submitUserLoanOutOffer({
        playerId,
        userClubId: myTeamId,
        borrowerClubId,
        date: currentDate,
        loanFee,
        wageShare,
        durationMonths,
        type,
      });
      commit(
        result.ok ? "Propuesta de cesión enviada al club." : undefined,
        result.reason,
      );
    },
    [myTeamId, currentDate, commit],
  );

  const improveOffer = useCallback(
    (dealId: string, amount: number, wageOffer: number, clauses?: Partial<OfferClauses>) => {
      const result = improveUserOffer(dealId, { amount, wageOffer, clauses }, currentDate);
      commit(result.ok ? "Oferta mejorada." : undefined, result.reason);
    },
    [currentDate, commit],
  );

  const acceptDemand = useCallback(
    (dealId: string) => {
      const result = acceptClubDemand(dealId, currentDate);
      if (result.silent) {
        commit();
        return;
      }
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
      if (
        result.record.type === "loan" ||
        result.record.type === "loan-option" ||
        result.record.type === "loan-obligation"
      ) {
        const marketPlayer = getPlayer(result.record.playerId);
        const endDate = marketPlayer?.loanEndDate;
        const fromClubId = result.record.fromClubId;
        if (!endDate || !fromClubId) {
          commit(undefined, "La cesión se cerró pero no pudo registrarse su fecha de retorno.");
          return;
        }
        const loaned = store.addLoanedPlayer(result.record.playerId, fromClubId, endDate);
        if (!loaned.ok) {
          syncUserFinances(myTeamId!, result.fee, result.wage ?? 0, true);
          commit(undefined, loaned.reason ?? "No se pudo integrar el cedido en la plantilla.");
          return;
        }
        flushWorldMoves();
        syncBudget();
        commit(`Cesión cerrada por ${(result.fee / 1_000_000).toFixed(1)}M € · vuelve el ${endDate}.`);
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
      syncBudget();
      commit(`Fichaje cerrado por ${(result.fee / 1_000_000).toFixed(1)}M €.`);
    },
    [currentDate, commit, myTeamId, syncBudget],
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
      const pendingDeal = listUserDeals().find((d) => d.id === dealId);
      const isLoan = pendingDeal?.offer?.type === "loan" || pendingDeal?.offer?.type === "loan-option" || pendingDeal?.offer?.type === "loan-obligation";
      // Tanto una venta definitiva como una cesión de salida liberan una
      // plaza de la plantilla del usuario. La diferencia es que en la cesión
      // el club sigue siendo el propietario y el jugador regresará al terminar.
      if (store.rosterIds.length <= 11) {
        commit(undefined, "Debes mantener al menos 11 jugadores en la plantilla.");
        return;
      }
      const result = acceptIncomingOffer(dealId, currentDate);
      if (result.silent) {
        commit();
        return;
      }
      if (!result.ok || result.fee === undefined || !result.record) {
        commit(undefined, result.reason ?? (isLoan ? "La cesión no se pudo cerrar." : "La venta no se pudo cerrar."));
        return;
      }
      if (
        result.record.type === "loan" ||
        result.record.type === "loan-option" ||
        result.record.type === "loan-obligation"
      ) {
        // Cesión de salida: el jugador no abandona la plantilla del propietario.
        // El motor ya ha registrado la parte de salario que asume el receptor.
        flushWorldMoves();
        syncBudget();
        commit(`Cesión cerrada por ${(result.fee / 1_000_000).toFixed(1)}M €.`);
        return;
      }
      const playerBeforeSale = store.getSimPlayer(result.record.playerId);
      const previousWage = playerBeforeSale?.contract.wage ?? result.record.wage ?? 0;
      const sold = store.sellPlayer(result.record.playerId, 0);
      if (!sold.ok) {
        commit(undefined, sold.reason ?? "La venta no se pudo aplicar a tu plantilla.");
        return;
      }
      syncUserFinances(myTeamId!, result.fee, previousWage, true);
      flushWorldMoves();
      syncBudget();
      commit(`Venta cerrada por ${(result.fee / 1_000_000).toFixed(1)}M €.`);
    },
    [currentDate, commit, myTeamId, syncBudget],
  );
  const counterIncoming = useCallback(
    (dealId: string, demand: number, clauses?: Partial<OfferClauses>) => {
      const result = counterIncomingOffer(dealId, demand, currentDate, clauses);
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
    windowRumors,
    history,
    summary,
    window: state?.window ?? "closed",
    deadlineDay: state?.deadlineDay ?? false,
    windowDay: state?.windowDay ?? 0,
    scout,
    makeOffer,
    setLoanListed,
    makeLoanOutOffer,
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

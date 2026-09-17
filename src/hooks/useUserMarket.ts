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
  counterOutgoingDeal,
  finalizeUserDeal,
  freshRumors,
  getPlayer,
  currentWindowStart,
  getFinances,
  setFinances,
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
  canAfford,
  withdrawUserDeal,
  type OfferClauses,
  type Rumor,
  type TransferType,
  type ScoutingReport,
  type TransferRecord,
  type UserDeal,
  type ScoutingEntry,
  startScouting,
  getScoutingEntry,
  listScouting,
  removeScouting,
  activeScoutingCount,
  MAX_ACTIVE_SCOUTS,
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
  scouting: ScoutingEntry[];
  activeScouts: number;
  maxActiveScouts: number;
  getScouting: (playerId: string) => ScoutingEntry | null;
  startScouting: (playerId: string) => boolean;
  removeScouting: (playerId: string) => void;
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
    squadRole?: import("@/lib/transfers").SquadRole;
    type?: Extract<TransferType, "loan" | "loan-option" | "loan-obligation">;
  }) => void;
  improveOffer: (dealId: string, amount: number, wageOffer: number, clauses?: Partial<OfferClauses>) => void;
  acceptDemand: (dealId: string) => void;
  improveWage: (dealId: string, wage: number, clauses?: Partial<OfferClauses>) => void;
  confirmDeal: (dealId: string) => void;
  abandonDeal: (dealId: string) => void;
  acceptIncoming: (dealId: string) => void;
  counterIncoming: (dealId: string, demand: number, clauses?: Partial<OfferClauses>) => void;
  counterOutgoing: (dealId: string, demand: number, clauses?: Partial<OfferClauses>) => void;
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

  const deals = useMemo(() => (ready ? listUserDeals(undefined, currentDate) : []), [ready, tick, currentDate]);
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
   * Sincroniza el motor de mercado CON el estado de la partida.
   *
   * El presupuesto de un club usuario pertenece a `playersStore`; el motor
   * sólo mantiene una copia auxiliar para simulaciones y negociaciones.
   * Nunca debe poder sobrescribir la caja real con una cifra antigua.
   */
  const syncBudget = useCallback(() => {
    if (!myTeamId) return;
    const current = usePlayersStore.getState();
    const market = getFinances(myTeamId);
    setFinances({
      ...market,
      clubId: myTeamId,
      budget: Math.max(0, Math.round(current.budget)),
      totalBudget: Math.max(0, Math.round(current.budget)),
      wageBudget: Math.max(0, Math.round(current.wageBudget)),
      wageBill: Math.max(0, Math.round(current.wageBill)),
    });
  }, [myTeamId]);

  const scout = useCallback(
    (playerId: string) => (ready && myTeamId ? scoutPlayer(playerId, myTeamId, currentDate) : null),
    [ready, myTeamId, currentDate],
  );

  const scouting = useMemo(() => (ready ? listScouting(currentDate) : []), [ready, currentDate, tick]);
  const activeScouts = useMemo(() => (ready ? activeScoutingCount(currentDate) : 0), [ready, currentDate, tick]);

  const beginScouting = useCallback((playerId: string) => {
    if (!ready) return false;
    const result = startScouting(playerId, currentDate);
    if (result.ok) {
      toast.success("Jugador añadido al ojeador. El informe estará listo en 3–5 días.");
      saveTransferSystem();
      refresh();
      return true;
    }
    toast.error(result.reason);
    refresh();
    return false;
  }, [ready, currentDate, refresh]);

  const deleteScouting = useCallback((playerId: string) => {
    removeScouting(playerId);
    toast.success("Jugador eliminado de la lista de ojeador.");
    saveTransferSystem();
    refresh();
  }, [refresh]);

  const makeOffer = useCallback<UserMarketApi["makeOffer"]>(
    ({ playerId, amount, wageOffer, type, clauses }) => {
      if (!myTeamId) return;
      const store = usePlayersStore.getState();
      const totalBudget = Math.max(0, store.budget);
      const wageAllocation = Math.max(0, store.wageBudget);
      const transferBudget = Math.max(0, totalBudget - wageAllocation);
      const isLoan =
        type === "loan" || type === "loan-option" || type === "loan-obligation";
      const wageCommitment = isLoan
        ? wageOffer * Math.max(0, Math.min(1, clauses?.wageShare ?? 0.5))
        : wageOffer;
      if (amount > transferBudget) {
        toast.error("No tienes suficiente dinero destinado a fichajes para esa oferta.");
        return;
      }
      if (wageCommitment > wageAllocation) {
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
    ({ playerId, borrowerClubId, loanFee, wageShare, durationMonths, type, squadRole }) => {
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
        squadRole,
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
      commit(result.ok ? "Has aceptado las condiciones propuestas por el club." : undefined, result.reason);
    },
    [currentDate, commit],
  );

  const improveWage = useCallback(
    (dealId: string, wage: number, clauses?: Partial<OfferClauses>) => {
      const result = improvePlayerTerms(dealId, { wageOffer: wage, ...clauses }, currentDate);
      commit(result.ok ? "Nueva ficha ofrecida al jugador." : undefined, result.reason);
    },
    [currentDate, commit],
  );

  /**
   * Aplica a la partida una salida ya cerrada por el motor: venta definitiva o
   * cesión saliente.
   *
   * Clave: `flushWorldMoves()` se ejecuta SIEMPRE, incluso si `sellPlayer`
   * rechaza la operación por sus propias reglas. El motor ya ha movido al
   * jugador a su nuevo club, así que la plantilla del usuario tiene que
   * reconciliarse con el índice del mercado en este mismo evento. Antes, un
   * `sellPlayer` fallido cortaba la función antes del volcado y el traspaso no
   * se veía hasta avanzar un día (las cesiones no pasaban por ahí, y por eso
   * sí funcionaban al instante).
   */
  const applyUserExit = useCallback(
    (
      result: {
        ok: boolean;
        reason?: string;
        fee?: number;
        wage?: number;
        record?: TransferRecord;
      },
      startingBudget?: number,
      startingWageBill?: number,
    ) => {
      const type = result.record?.type;
      const isLoan = type === "loan" || type === "loan-option" || type === "loan-obligation";

      if (!result.ok || result.fee === undefined || !result.record) {
        flushWorldMoves();
        syncBudget();
        // Una liquidación que no puede aplicarse no debe mostrar una
        // notificación global de error: el motor conserva la operación y
        // el estado visible de la negociación es la fuente de verdad.
        commit();
        return;
      }

      if (isLoan) {
        // El club sigue siendo el propietario, pero el jugador pasa a jugar en
        // el club receptor: sale de tu plantilla hasta que termine la cesión.
        if (startingBudget !== undefined) {
          const current = usePlayersStore.getState();
          const coveredWage =
            (result.wage ?? 0) * Math.max(0, Math.min(1, result.record.clauses?.wageShare ?? 0));
          const nextBudget = Math.max(0, startingBudget + result.fee + coveredWage);
          const originalWage = Math.max(0, result.wage ?? 0);
          const retainedWage = originalWage - coveredWage;
          const nextWageBill = Math.max(0, (startingWageBill ?? current.wageBill) - originalWage + retainedWage);
          const ratio = startingBudget > 0
            ? Math.max(0.05, Math.min(0.30, current.wageBudget / startingBudget))
            : 0.20;
          usePlayersStore.setState({
            budget: nextBudget,
            wageBudget: Math.round(nextBudget * ratio),
            wageBill: Math.round(nextWageBill),
          });
        }
        flushWorldMoves();
        syncBudget();
        commit(`Cesión cerrada por ${(result.fee / 1_000_000).toFixed(1)}M €.`);
        return;
      }

      const store = usePlayersStore.getState();
      // `completeTransfer()` ya ha aplicado el ingreso y la liberación salarial
      // en el motor. Aquí sólo reconciliamos la plantilla; no se vuelve a
      // registrar la venta para evitar duplicar el dinero.
      const sold = store.sellPlayer(result.record.playerId, 0);

      // Reafirmamos la caja con la aritmética de la operación cerrada:
      // presupuesto anterior + precio de venta + salario anual liberado.
      // El salario viene del contrato anterior guardado por finalizeUserDeal.
      if (startingBudget !== undefined) {
        const current = usePlayersStore.getState();
        const nextBudget = Math.max(0, startingBudget + result.fee + Math.max(0, result.wage ?? 0));
        const ratio = startingBudget > 0
          ? Math.max(0.05, Math.min(0.30, current.wageBudget / startingBudget))
          : 0.20;
        usePlayersStore.setState({
          budget: nextBudget,
          wageBudget: Math.round(nextBudget * ratio),
        });
      }

      flushWorldMoves();
      syncBudget();

      // Solo es un error real si, después de reconciliar, el jugador sigue
      // siendo tuyo en el motor.
      const stillMine = getPlayer(result.record.playerId)?.clubId === myTeamId;
      if (!sold.ok && stillMine) {
        commit(undefined, sold.reason ?? "La venta no se pudo aplicar a tu plantilla.");
        return;
      }
      commit(`Venta cerrada por ${(result.fee / 1_000_000).toFixed(1)}M €.`);
    },
    [commit, myTeamId, syncBudget],
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
      const deal = listUserDeals(undefined, currentDate).find((d) => d.id === dealId);
      if (!deal) {
        commit(undefined, "La negociación ya no existe.");
        return;
      }
      const store = usePlayersStore.getState();
      const startingBudget = store.budget;
      const startingWageBill = store.wageBill;

      // Una negociación de SALIDA (vendes tú) también puede llegar a la fase
      // "ready" y mostrar el botón "Cerrar venta". Antes caía en la lógica de
      // fichaje de abajo y se estrellaba contra "El jugador ya está en tu
      // plantilla", dejando la operación a medias: el motor la cerraba más
      // tarde y el jugador solo se iba al avanzar día.
      if (deal.direction === "out") {
        if (store.rosterIds.length <= 11) {
          commit(undefined, "Debes mantener al menos 11 jugadores en la plantilla.");
          return;
        }
        applyUserExit(finalizeUserDeal(dealId, currentDate), startingBudget, startingWageBill);
        return;
      }

      const fee = deal.offer?.amount ?? 0;
      const isLoan =
        deal.offer?.type === "loan" ||
        deal.offer?.type === "loan-option" ||
        deal.offer?.type === "loan-obligation";
      const wageOffer = deal.offer?.wageOffer ?? 0;
      const wageShare = Math.max(0, Math.min(1, deal.offer?.clauses?.wageShare ?? 0.5));
      const wageCommitment = isLoan ? wageOffer * wageShare : wageOffer;
      if (!canAfford(myTeamId!, fee, wageCommitment)) {
        commit(undefined, `El presupuesto o el margen salarial no permiten cerrar esta operación.`);
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
        const loanWageShare = Math.max(0, Math.min(1, result.record.clauses?.wageShare ?? 0.5));
        const wagePaidByUser = Math.max(0, (result.wage ?? 0) * loanWageShare);
        const nextBudget = Math.max(0, startingBudget - result.fee - wagePaidByUser);
        const currentAfterLoan = usePlayersStore.getState();
        const nextRatio = startingBudget > 0
          ? Math.max(0.05, Math.min(0.30, currentAfterLoan.wageBudget / startingBudget))
          : 0.20;
        usePlayersStore.setState({
          budget: nextBudget,
          wageBudget: Math.round(nextBudget * nextRatio),
          wageBill: Math.round(startingWageBill + wagePaidByUser),
        });
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
      const feePaid = result.fee;
      const wagePaid = isLoan
        ? wageCommitment
        : result.record.wage;
      const nextBudget = Math.max(0, startingBudget - feePaid - wagePaid);
      const nextRatio = startingBudget > 0
        ? Math.max(0.05, Math.min(0.30, store.wageBudget / startingBudget))
        : 0.20;
      usePlayersStore.setState({
        budget: nextBudget,
        wageBudget: Math.round(nextBudget * nextRatio),
      });
      flushWorldMoves();
      syncBudget();
      commit(`Fichaje cerrado por ${(result.fee / 1_000_000).toFixed(1)}M €.`);
    },
    [currentDate, commit, myTeamId, syncBudget, applyUserExit],
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
      const startingBudget = store.budget;
      const startingWageBill = store.wageBill;
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
      applyUserExit(result, startingBudget, startingWageBill);
    },
    [currentDate, commit, applyUserExit],
  );
  const counterIncoming = useCallback(
    (dealId: string, demand: number, clauses?: Partial<OfferClauses>) => {
      const result = counterIncomingOffer(dealId, demand, currentDate, clauses);
      commit(result.ok ? "Contraoferta enviada." : undefined, result.reason);
    },
    [currentDate, commit],
  );

  const counterOutgoing = useCallback(
    (dealId: string, demand: number, clauses?: Partial<OfferClauses>) => {
      const result = counterOutgoingDeal(dealId, demand, currentDate, clauses);
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
    clearFinishedUserDeals(currentDate);
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
    scouting,
    activeScouts,
    maxActiveScouts: MAX_ACTIVE_SCOUTS,
    getScouting: (playerId: string) => (ready ? getScoutingEntry(playerId, currentDate) : null),
    startScouting: beginScouting,
    removeScouting: deleteScouting,
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
    counterOutgoing,
    rejectIncoming,
    toggleTransferList,
    clearFinished,
  };
}

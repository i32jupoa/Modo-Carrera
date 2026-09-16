import { useEffect, useRef } from "react";
import { useNotificationsStore } from "@/store/notificationsStore";
import { usePlayersStore } from "@/store/playersStore";
import { usePlayersReady } from "@/components/PlayersLoading";
import { getCurrentSaveId } from "@/lib/savedGames";
import {
  loadOrInitTransferSystem,
  resetTransferSystem,
  saveTransferSystem,
  setMarketSeedSalt,
  setUserClubBridge,
  syncMarketWithGameDate,
  advanceUserDeals,
  clearFinishedUserDeals,
  snapshotUserDeals,
  restoreUserDeals,
} from "@/lib/transfers";
import {
  attachWorldBridge,
  detachWorldBridge,
  flushWorldMoves,
  hydrateWorld,
} from "@/lib/transfers/WorldSync";

/**
 * Reloj del mercado: engancha la simulación al calendario del juego.
 *
 * - inicializa o restaura el mercado la primera vez (sólo en cliente),
 * - simula los días que pasen cada vez que avanza la fecha de la partida,
 * - y guarda el estado tras cada avance.
 */
export function useMarketClock(): void {
  const ready = usePlayersReady();
  const currentDate = usePlayersStore((s) => s.currentDate);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const bootedFor = useRef<string | null>(null);
  // `undefined` = todavía no se ha arrancado el motor en esta sesión de la
  // app. Se distingue de `null` (partida sin id, caso límite) para que la
  // primera carga siempre dispare la inicialización.
  const bootedForSave = useRef<string | null | undefined>(undefined);

  // Presupuesto único: el motor opera directamente sobre el de la partida.
  useEffect(() => {
    if (!myTeamId) {
      setUserClubBridge(null);
      return;
    }
    setUserClubBridge({
      clubId: myTeamId,
      getBudget: () => usePlayersStore.getState().budget,
      setBudget: (value) => usePlayersStore.setState({ budget: Math.max(0, Math.round(value)) }),
      getWageBudget: () => usePlayersStore.getState().wageBudget,
      setWageBudget: (value) => usePlayersStore.setState({ wageBudget: Math.max(0, Math.round(value)) }),
    });
    return () => setUserClubBridge(null);
  }, [myTeamId]);

  useEffect(() => {
    if (typeof window === "undefined" || !ready || !currentDate) return;

    const saveId = getCurrentSaveId();

    // Primera carga de esta sesión, o cambio de partida sin recargar la
    // página (por ejemplo, "Continuar" sobre otra partida desde el menú).
    // El motor guarda todo en variables de módulo (índice, finanzas,
    // historial...), así que si no se vacían explícitamente al cambiar de
    // partida, se seguiría simulando sobre el mundo de la partida anterior.
    // Cada partida tiene su propia ranura de mercado (ver Persistence.ts),
    // así que restaurar aquí siempre trae el mercado de ESTA partida y no
    // el de otra: no hace falta ningún heurístico de fechas para "corregirlo".
    if (bootedForSave.current !== saveId) {
      detachWorldBridge();
      resetTransferSystem();
      // Cada partida tiene su propia semilla: dos partidas nuevas ya no
      // reproducen exactamente el mismo mercado (mismos fichajes, mismas
      // fechas, mismos rivales) sólo por compartir fecha de inicio.
      setMarketSeedSalt(saveId);
      // Marcamos esta partida como "en curso de arranque" ya mismo (antes de
      // que termine de leer IndexedDB) para que un segundo efecto disparado
      // mientras tanto no vuelva a lanzar la carga por duplicado.
      bootedForSave.current = saveId;
      bootedFor.current = currentDate;

      (async () => {
        await loadOrInitTransferSystem(currentDate);
        // El mercado arranca desde el mundo real de la partida, no desde el JSON.
        attachWorldBridge();
        hydrateWorld();
        // Tras restaurar los contratos del mercado, la masa salarial de la partida
        // debe reflejar exactamente esas fichas.
        usePlayersStore.getState().syncWageStateFromMarket();

        // El reloj oficial también resuelve las negociaciones del usuario.
        // Esto evita que una cesión/fichaje quede desconectado del calendario
        // cuando MarketNotifier aún no se ha montado o pierde un tick durante
        // la inicialización.
        try {
          const events = advanceUserDeals(myTeamId!, currentDate);
          const removedFinished = clearFinishedUserDeals(currentDate);
          const add = useNotificationsStore.getState().add;
          if (events.length > 0) {
            add(
              events.map((event) => ({ dealId: event.dealId, kind: event.kind, text: event.text })),
              currentDate,
            );
          }
          if (events.length > 0 || removedFinished) void saveTransferSystem();
        } catch (error) {
          console.error("[MarketClock] Error al resolver negociaciones restauradas.", error);
        }
        void saveTransferSystem();
      })();
      return;
    }

    if (bootedFor.current === currentDate) return;
    bootedFor.current = currentDate;
    try {
      syncMarketWithGameDate(currentDate);
      // Este es el reloj oficial del juego: las negociaciones del usuario deben
      // avanzar aquí, al mismo tiempo que el mercado mundial.
      const dealsBeforeAdvance = snapshotUserDeals();
      try {
        const events = advanceUserDeals(myTeamId!, currentDate);
        const removedFinished = clearFinishedUserDeals(currentDate);
        const add = useNotificationsStore.getState().add;
        if (events.length > 0) {
          add(
            events.map((event) => ({ dealId: event.dealId, kind: event.kind, text: event.text })),
            currentDate,
          );
        }
        if (events.length > 0 || removedFinished) void saveTransferSystem();
      } catch (error) {
        restoreUserDeals(dealsBeforeAdvance);
        console.error("[MarketClock] Error al resolver negociaciones; se conserva su estado anterior.", error);
      }
      // Los fichajes que ha cerrado la IA pasan a las plantillas del juego.
      flushWorldMoves();
    } catch (error) {
      // Un fallo puntual del motor mundial no debe tirar abajo la aplicación ni
      // resetear el estado de las negociaciones del usuario.
      console.error("[MarketClock] Error al sincronizar el mercado con la fecha.", error);
    }
  }, [ready, currentDate]);
}

/** Componente sin UI que mantiene el mercado sincronizado con el calendario. */
export function MarketClock(): null {
  useMarketClock();
  return null;
}

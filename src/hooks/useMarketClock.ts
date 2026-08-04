import { useEffect, useRef } from "react";
import { usePlayersStore } from "@/store/playersStore";
import { usePlayersReady } from "@/components/PlayersLoading";
import {
  clearTransferSave,
  getSimulationState,
  isTransferSystemInitialized,
  loadOrInitTransferSystem,
  resetTransferSystem,
  saveTransferSystem,
  setUserClubBridge,
  syncMarketWithGameDate,
} from "@/lib/transfers";
import { attachWorldBridge, flushWorldMoves, hydrateWorld } from "@/lib/transfers/WorldSync";

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
    });
    return () => setUserClubBridge(null);
  }, [myTeamId]);

  useEffect(() => {
    if (typeof window === "undefined" || !ready || !currentDate) return;

    if (!isTransferSystemInitialized()) {
      const { restored } = loadOrInitTransferSystem(currentDate);
      const state = getSimulationState();
      // Partida nueva (o guardado de otra partida por delante de la fecha):
      // se descarta y se arranca limpio desde la fecha actual.
      if (restored && state && Date.parse(state.lastSimulatedDate) > Date.parse(currentDate)) {
        resetTransferSystem();
        clearTransferSave();
        loadOrInitTransferSystem(currentDate);
      }
      // El mercado arranca desde el mundo real de la partida, no desde el JSON.
      attachWorldBridge();
      hydrateWorld();
      saveTransferSystem();
      bootedFor.current = currentDate;
      return;
    }

    if (bootedFor.current === currentDate) return;
    bootedFor.current = currentDate;
    syncMarketWithGameDate(currentDate);
    // Los fichajes que ha cerrado la IA pasan a las plantillas del juego.
    flushWorldMoves();
  }, [ready, currentDate]);
}

/** Componente sin UI que mantiene el mercado sincronizado con el calendario. */
export function MarketClock(): null {
  useMarketClock();
  return null;
}

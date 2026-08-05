import { useEffect, useRef } from "react";
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
      loadOrInitTransferSystem(currentDate);
      // El mercado arranca desde el mundo real de la partida, no desde el JSON.
      attachWorldBridge();
      hydrateWorld();
      saveTransferSystem();
      bootedForSave.current = saveId;
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

import { useEffect, useRef } from "react";
import { usePlayersStore } from "@/store/playersStore";
import { usePlayersReady } from "@/components/PlayersLoading";
import { getCurrentSaveId } from "@/lib/savedGames";
import { useNotificationsStore } from "@/store/notificationsStore";
import {
  advanceUserDeals,
  clearFinishedUserDeals,
  getSimulationState,
  isTransferSystemInitialized,
  saveTransferSystem,
} from "@/lib/transfers";
import { flushWorldMoves } from "@/lib/transfers/WorldSync";

/**
 * Avanza las negociaciones del usuario con el calendario aunque no esté
 * abierta la pantalla de mercado, y convierte las novedades en notificaciones
 * del menú lateral (verde = buena, azul = informativa, roja = mala).
 */
export function MarketNotifier(): null {
  const ready = usePlayersReady();
  const currentDate = usePlayersStore((s) => s.currentDate);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const addNotifications = useNotificationsStore((s) => s.add);
  const hydrate = useNotificationsStore((s) => s.hydrate);
  const lastDate = useRef<string | null>(null);
  const hydratedFor = useRef<string | null | undefined>(undefined);

  // Cada partida tiene su propia bandeja de notificaciones.
  useEffect(() => {
    if (typeof window === "undefined" || !ready) return;
    const saveId = getCurrentSaveId();
    if (hydratedFor.current === saveId) return;
    hydratedFor.current = saveId;
    lastDate.current = null;
    hydrate(saveId);
  }, [ready, myTeamId, currentDate, hydrate]);

  useEffect(() => {
    if (typeof window === "undefined" || !ready || !currentDate || !myTeamId) return;
    if (!isTransferSystemInitialized()) return;
    if (lastDate.current === currentDate) return;
    lastDate.current = currentDate;

    const events = advanceUserDeals(myTeamId, currentDate);
    flushWorldMoves();
    if (getSimulationState()?.window === "closed") clearFinishedUserDeals();
    if (events.length === 0) return;
    addNotifications(
      events.map((event) => ({ kind: event.kind, text: event.text })),
      currentDate,
    );
    saveTransferSystem();
  }, [ready, currentDate, myTeamId, addNotifications]);

  return null;
}

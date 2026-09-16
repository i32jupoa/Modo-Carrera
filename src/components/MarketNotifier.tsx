import { useEffect } from "react";
import { usePlayersStore } from "@/store/playersStore";
import { usePlayersReady } from "@/components/PlayersLoading";
import { getCurrentSaveId } from "@/lib/savedGames";
import { useNotificationsStore } from "@/store/notificationsStore";

/**
 * Mantiene hidratada la bandeja de notificaciones del mercado.
 *
 * La resolución de negociaciones ya no vive aquí: el reloj oficial del juego
 * (`MarketClock`) es el único responsable de avanzar las negociaciones al
 * cambiar de día. Así evitamos carreras entre dos efectos y, sobre todo, que
 * una cesión quede eternamente en `waiting-club`.
 */
export function MarketNotifier(): null {
  const ready = usePlayersReady();
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const hydrate = useNotificationsStore((s) => s.hydrate);

  useEffect(() => {
    if (typeof window === "undefined" || !ready) return;
    hydrate(getCurrentSaveId());
  }, [ready, myTeamId, hydrate]);

  return null;
}

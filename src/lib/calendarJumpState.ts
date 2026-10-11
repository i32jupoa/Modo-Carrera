import { create } from "zustand";

/**
 * Indica que el calendario está saltando varios días seguidos. Mientras dure,
 * el aviso global de "Día de partido" no debe abrirse: los partidos de los días
 * intermedios se resuelven automáticamente y solo el día destino se deja
 * pendiente para que el usuario lo gestione. Es un store aparte (no persistido)
 * para no verse afectado por los rollbacks del estado de jugadores.
 */
export const useCalendarJumpState = create<{ active: boolean }>(() => ({ active: false }));

export function setCalendarJumpActive(active: boolean): void {
  if (useCalendarJumpState.getState().active !== active) {
    useCalendarJumpState.setState({ active });
  }
}

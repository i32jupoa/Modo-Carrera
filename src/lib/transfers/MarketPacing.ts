/**
 * Ritmo de los fichajes "grandes" dentro de una ventana.
 *
 * `BudgetManager` dice cuánto puede gastar un club en total; este módulo dice
 * cuánto de ese techo puede comprometer HOY en una sola operación. Al
 * principio de la ventana el margen es limitado (incluso para un club rico)
 * y se va abriendo según avanzan los días, a un ritmo propio de cada club
 * (determinista, no todos el mismo día), hasta quedar sin restricción. El
 * deadline day y las necesidades realmente críticas se saltan el límite: en
 * la vida real un agujero grave de plantilla sí se tapa cueste lo que
 * cueste y cuando cueste.
 *
 * Con esto, un fichaje caro respecto al presupuesto del club (un "bombazo")
 * tiende a resolverse más adelante en la ventana en vez de siempre en los
 * primeros días, mientras que los fichajes baratos o de rotación —la
 * inmensa mayoría del mercado— no se ven afectados en absoluto, porque su
 * precio nunca se acerca al tope que impone la rampa.
 */

import {
  daysIntoTransferWindow,
  transferWindowKey,
  transferWindowLengthDays,
} from "../transferWindows";
import { BIG_SIGNING_PACING } from "./constants";
import { getClubProfile } from "./ClubStrategy";
import { clamp, seededUnit } from "./random";

/**
 * Día (dentro de la ventana) en el que un club concreto deja de tener
 * restricción de gasto por operación. Determinista por club y ventana, y
 * ajustado por su personalidad: los clubes agresivos se destapan antes, los
 * pacientes tardan más en soltarse del todo.
 */
function rampDay(clubId: string, date: string): number {
  const windowLen = transferWindowLengthDays(date);
  if (windowLen <= 0) return 0;
  const profile = getClubProfile(clubId);
  const roll = seededUnit(clubId, transferWindowKey(date), "big-signing-ramp");
  const baseFraction =
    BIG_SIGNING_PACING.rampFractionMin +
    roll * (BIG_SIGNING_PACING.rampFractionMax - BIG_SIGNING_PACING.rampFractionMin);
  const adjusted = clamp(
    baseFraction * (1.25 - profile.aggression * 0.45 + profile.patience * 0.3),
    0.04,
    0.9,
  );
  return Math.max(2, Math.round(adjusted * windowLen));
}

/**
 * Fracción de clubes que, siendo elegibles para actuar hoy, realmente se
 * plantean salir a cubrir necesidades "normales" de plantilla (no urgentes).
 * Al principio de la ventana esta fracción es más baja y sube hasta 1 en
 * unos días: así el día de apertura del mercado no ve a los ~700 clubes con
 * algún hueco salir a comprar a la vez, sin necesidad de bloquear a ningún
 * club concreto durante semanas (una versión anterior de este freno usaba un
 * único "día de arranque" aleatorio por club, y para un club con mala suerte
 * en el sorteo —p. ej. el Madrid saliendo en el día 31— eso significaba no
 * fichar NADA durante casi un mes entero, aunque tuviera necesidades reales).
 * Una necesidad urgente (mínimo de ventana, déficit, o una salida reciente de
 * nivel) siempre puede saltarse esta rampa: ver `runClubDay`.
 */
function shoppingRamp(date: string): number {
  const day = daysIntoTransferWindow(date);
  return clamp(0.14 + day / 12, 0.14, 1);
}

export { shoppingRamp };

export interface BigSigningCapOptions {
  /** Últimos días de la ventana: siempre desbloqueado. */
  deadlineDay?: boolean;
  /** Necesidad crítica (agujero grave de plantilla): margen inicial mayor. */
  critical?: boolean;
}

/**
 * Fracción (0..1) del techo de gasto de un club que puede comprometer en una
 * sola operación en la fecha indicada.
 */
export function bigSigningSpendCapRatio(
  clubId: string,
  date: string,
  options: BigSigningCapOptions = {},
): number {
  if (options.deadlineDay) return 1;
  const day = daysIntoTransferWindow(date);
  const ramp = rampDay(clubId, date);
  if (day <= 0 || ramp <= 0) return 1;
  const start = options.critical
    ? BIG_SIGNING_PACING.startRatioCritical
    : BIG_SIGNING_PACING.startRatio;
  const progress = clamp(day / ramp, 0, 1);
  return clamp(start + progress * (1 - start), start, 1);
}

/**
 * Registro de renovaciones de contrato.
 *
 * El historial de traspasos solo guarda operaciones entre clubes; las
 * renovaciones (p. ej. "Vinicius renueva con el Real Madrid") necesitan su
 * propio registro para que el sistema de noticias pueda contarlas como un
 * hecho real ocurrido en la partida.
 */

export interface RenewalRecord {
  id: string;
  date: string;
  playerId: string;
  playerName: string;
  clubId: string;
  /** Salario anual nuevo y anterior (si se conoce), en euros. */
  wage: number;
  previousWage?: number;
  /** Años de contrato tras renovar. */
  years: number;
  releaseClause?: number;
  /** true si la renovación la cerró el usuario. */
  byUser?: boolean;
}

const MAX_RECORDS = 200;
let renewals: RenewalRecord[] = [];
let lastDate = "";

export function setRenewalLogDate(date: string): void {
  if (date) lastDate = date;
}

export function logRenewal(input: Omit<RenewalRecord, "id" | "date"> & { date?: string }): void {
  const date = input.date || lastDate || "";
  if (input.date) lastDate = input.date;
  const id = `ren-${input.playerId}-${date}-${renewals.length}`;
  renewals.push({ ...input, id, date });
  if (renewals.length > MAX_RECORDS) renewals = renewals.slice(-MAX_RECORDS);
}

/** Renovaciones, de la más reciente a la más antigua. */
export function listRenewals(limit?: number): RenewalRecord[] {
  const ordered = [...renewals].reverse();
  return limit === undefined ? ordered : ordered.slice(0, limit);
}

export function snapshotRenewals(): RenewalRecord[] {
  return renewals.map((r) => ({ ...r }));
}

export function restoreRenewals(records: readonly RenewalRecord[] | undefined): void {
  renewals = (records ?? []).slice(-MAX_RECORDS).map((r) => ({ ...r }));
  lastDate = renewals.length ? renewals[renewals.length - 1].date : "";
}

export function resetRenewals(): void {
  renewals = [];
  lastDate = "";
}

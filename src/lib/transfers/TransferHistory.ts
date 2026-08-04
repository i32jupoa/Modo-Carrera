/**
 * Historial de traspasos.
 *
 * Registro único de todas las operaciones cerradas (compras, ventas, cesiones
 * y agentes libres) con precio, fecha, origen y destino. La UI y los rumores
 * leen de aquí; nadie más guarda copias.
 */

import { teamById } from "@/data/teams";
import type { TransferRecord, TransferType } from "./types";

/** Todos los traspasos, del más antiguo al más reciente. */
const history: TransferRecord[] = [];

/** Índice por jugador para consultas rápidas. */
const byPlayer = new Map<string, TransferRecord[]>();

/** Índice por club (aparece tanto si compra como si vende). */
const byClub = new Map<string, TransferRecord[]>();

function pushInto(map: Map<string, TransferRecord[]>, key: string, record: TransferRecord): void {
  const list = map.get(key);
  if (list) list.push(record);
  else map.set(key, [record]);
}

/** Añade un traspaso al historial y actualiza los índices. */
export function recordTransfer(record: TransferRecord): TransferRecord {
  history.push(record);
  pushInto(byPlayer, record.playerId, record);
  if (record.fromClubId) pushInto(byClub, record.fromClubId, record);
  pushInto(byClub, record.toClubId, record);
  return record;
}

/** Añade varios traspasos de una vez. */
export function recordTransfers(records: readonly TransferRecord[]): void {
  for (const record of records) recordTransfer(record);
}

/** Historial completo (más recientes primero). */
export function listTransfers(limit?: number): TransferRecord[] {
  const ordered = [...history].reverse();
  return limit === undefined ? ordered : ordered.slice(0, limit);
}

/** Traspasos de un club, como comprador o como vendedor. */
export function transfersForClub(clubId: string, limit?: number): TransferRecord[] {
  const ordered = [...(byClub.get(clubId) ?? [])].reverse();
  return limit === undefined ? ordered : ordered.slice(0, limit);
}

/** Traspasos de un jugador a lo largo de su carrera. */
export function transfersForPlayer(playerId: string): TransferRecord[] {
  return [...(byPlayer.get(playerId) ?? [])];
}

/** Traspasos cerrados en una fecha concreta. */
export function transfersOnDate(date: string): TransferRecord[] {
  return history.filter((record) => record.date === date);
}

/** Los traspasos más caros registrados. */
export function biggestTransfers(limit = 10): TransferRecord[] {
  return [...history]
    .filter((record) => record.type === "permanent")
    .sort((a, b) => b.fee - a.fee)
    .slice(0, limit);
}

/** Resumen económico de una ventana o de toda la partida. */
export interface TransferSummary {
  total: number;
  totalFees: number;
  permanent: number;
  loans: number;
  frees: number;
  averageFee: number;
  record: TransferRecord | null;
}

/** Calcula el resumen de un conjunto de traspasos (por defecto, todos). */
export function summarize(records: readonly TransferRecord[] = history): TransferSummary {
  const permanent = records.filter((r) => r.type === "permanent");
  const loans = records.filter((r) => r.type.startsWith("loan"));
  const frees = records.filter((r) => r.type === "free");
  const totalFees = records.reduce((sum, r) => sum + r.fee, 0);
  const record = permanent.reduce<TransferRecord | null>(
    (best, r) => (best === null || r.fee > best.fee ? r : best),
    null,
  );
  return {
    total: records.length,
    totalFees,
    permanent: permanent.length,
    loans: loans.length,
    frees: frees.length,
    averageFee: permanent.length > 0 ? totalFees / permanent.length : 0,
    record,
  };
}

/** Frase legible de un traspaso, usada por rumores y feeds. */
export function describeTransfer(record: TransferRecord): string {
  const to = teamById(record.toClubId)?.name ?? record.toClubId;
  const from = record.fromClubId ? (teamById(record.fromClubId)?.name ?? record.fromClubId) : null;
  const fee = formatFee(record.fee, record.type);
  if (!from) return `${record.playerName} firma por el ${to} como agente libre.`;
  if (record.type.startsWith("loan")) return `${record.playerName} sale cedido del ${from} al ${to}.`;
  return `${record.playerName} pasa del ${from} al ${to} por ${fee}.`;
}

function formatFee(fee: number, type: TransferType): string {
  if (type === "free" || fee <= 0) return "0 €";
  if (fee >= 1_000_000) return `${(fee / 1_000_000).toFixed(1)} M€`;
  return `${Math.round(fee / 1000)} K€`;
}

/** Vacía el historial (al cargar otra partida). */
export function resetTransferHistory(): void {
  history.length = 0;
  byPlayer.clear();
  byClub.clear();
}

/** Historial serializable para guardar con la partida. */
export function snapshotTransferHistory(): TransferRecord[] {
  return [...history];
}

/** Restaura el historial desde una partida guardada. */
export function restoreTransferHistory(records: readonly TransferRecord[]): void {
  resetTransferHistory();
  recordTransfers(records);
}

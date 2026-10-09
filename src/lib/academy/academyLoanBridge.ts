import { getCurrentSaveId } from "@/lib/savedGames";
import { getPlayer } from "@/lib/transfers/PlayerIndex";
import { loadAcademySave, saveAcademySave } from "./academyPersistence";
import type { AcademyPlayer, AcademyLoanReport } from "./academyTypes";

/**
 * Sincroniza el estado de los canteranos que salieron cedidos con el mercado.
 * LoanEngine sigue siendo la fuente de verdad de la operación; este puente
 * sólo vuelve a colocar al jugador dentro de la cantera cuando la cesión ha
 * terminado, o lo retira si acabó en traspaso definitivo.
 */
export async function reconcileAcademyLoans(date: string): Promise<void> {
  const saveId = getCurrentSaveId();
  if (!saveId) return;
  const academy = await loadAcademySave(saveId);
  if (!academy) return;

  let changed = false;
  const clubs = { ...academy.clubs };

  for (const [teamId, club] of Object.entries(clubs)) {
    let players = club.players.slice();
    const next: AcademyPlayer[] = [];
    for (const player of players) {
      if (player.status !== "loaned") {
        next.push(player);
        continue;
      }

      const market = getPlayer(String(player.id));
      if (!market) {
        next.push(player);
        continue;
      }

      if (market.clubId === teamId && !market.loanClubId) {
        const reports: AcademyLoanReport[] = player.loanReports ?? [];
        const updated: AcademyPlayer = {
          ...player,
          status: "academy",
          loanClubId: undefined,
          loanStartedAt: undefined,
          loanReturnDate: undefined,
          loanReports: reports,
        };
        next.push(updated);
        changed = true;
        continue;
      }

      if (market.clubId && market.clubId !== teamId && !market.loanClubId) {
        // La cesión terminó en compra: ya no pertenece a la cantera.
        changed = true;
        continue;
      }

      // Seguimiento mensual básico de minutos/valoración cuando sigue cedido.
      const reports = player.loanReports ?? [];
      const last = reports[reports.length - 1];
      if (!last || last.date.slice(0, 7) !== date.slice(0, 7)) {
        const minutesShare = Math.max(0, Math.min(1, Number(market.minutesShare ?? 0)));
        const minutes = Math.round(minutesShare * 900);
        const appearances = Math.round(minutesShare * 12);
        const currentInternalOvr = Number(player.internalOvr ?? player.ovr);
        const delta = Number((market.ovr - currentInternalOvr).toFixed(2));
        next.push({
          ...player,
          internalOvr: Number(Number(market.ovr).toFixed(2)),
          ovr: Math.round(Number(market.ovr)),
          loanReports: [...reports, {
            date,
            minutes,
            averageRating: Number((6.35 + Math.min(1.45, minutesShare * 1.45)).toFixed(2)),
            ovr: market.ovr,
            delta,
            note: appearances >= 8 ? "Está jugando con regularidad y progresa." : appearances >= 4 ? "Está entrando con cierta frecuencia y su evolución es estable." : "Necesita más minutos para acelerar su desarrollo.",
          }],
        });
        changed = true;
      } else {
        next.push(player);
      }
    }

    if (players.length !== next.length || changed) {
      clubs[teamId] = { ...club, players: next, updatedAt: new Date().toISOString() };
    }
  }

  if (changed) {
    await saveAcademySave({ ...academy, clubs, savedAt: new Date().toISOString() }, saveId);
  }
}

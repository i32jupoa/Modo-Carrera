import { findTeamById, LEAGUES, type Team } from "@/data/teams";
import { clubOfPlayer, type FcPlayer } from "@/store/playersStore";

export interface CurrentPlayerClub {
  clubId: string | null;
  team: Team | null;
  teamName: string;
  leagueName: string;
  isFreeAgent: boolean;
}

/**
 * Resuelve el club de un jugador desde el índice vivo del mercado, nunca desde
 * Team/League del dataset base. Esos campos son estáticos y pueden quedarse
 * obsoletos tras un fichaje o una cesión.
 */
export function resolveCurrentPlayerClub(
  playerId: string | number,
  _fallback?: Pick<FcPlayer, "Team" | "League">,
): CurrentPlayerClub {
  const clubId = clubOfPlayer(String(playerId));
  if (clubId) {
    const team = findTeamById(clubId);
    if (team) {
      return {
        clubId,
        team,
        teamName: team.name,
        leagueName: LEAGUES[team.league]?.name ?? team.league ?? "",
        isFreeAgent: false,
      };
    }
  }

  // Un índice explícitamente vacío significa agente libre. Un ID desconocido
  // es un estado de datos incompleto, no un motivo para mostrar el club antiguo.
  if (!clubId) {
    return {
      clubId: null,
      team: null,
      teamName: "Agente libre",
      leagueName: "",
      isFreeAgent: true,
    };
  }
  return {
    clubId,
    team: null,
    teamName: "Club actual desconocido",
    leagueName: "",
    isFreeAgent: false,
  };
}

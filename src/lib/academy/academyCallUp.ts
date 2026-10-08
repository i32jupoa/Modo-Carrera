import type { FcPlayer, PlayerStats } from "@/store/playersStore";
import type { AcademyPlayer } from "./academyTypes";

/**
 * Sincroniza el progreso ganado en el primer equipo con la ficha persistida de
 * cantera antes de desconvocar a un jugador.
 */
export function syncCalledUpAcademyPlayer(
  academyPlayer: AcademyPlayer,
  dynamicPlayer?: FcPlayer,
  stats?: PlayerStats,
): AcademyPlayer {
  const dynamic = stats?.dynamicStats;
  const source = dynamicPlayer;
  const currentOvr = Number(dynamic?.currentOVR ?? source?.OVR ?? academyPlayer.ovr);
  const potential = Number(dynamic?.potentialOVR ?? source?.potential ?? academyPlayer.potential);
  const attributes = dynamic?.attributes ?? (source
    ? {
        PAC: source.PAC,
        SHO: source.SHO,
        PAS: source.PAS,
        DRI: source.DRI,
        DEF: source.DEF,
        PHY: source.PHY,
      }
    : academyPlayer.attributes);

  return {
    ...academyPlayer,
    ovr: Math.round(currentOvr),
    potential: Math.round(potential),
    attributes: {
      PAC: Number(attributes.PAC),
      SHO: Number(attributes.SHO),
      PAS: Number(attributes.PAS),
      DRI: Number(attributes.DRI),
      DEF: Number(attributes.DEF),
      PHY: Number(attributes.PHY),
    },
    minutesThisSeason: Math.max(
      0,
      Math.round(Number(dynamic?.seasonMinutes ?? academyPlayer.minutesThisSeason) || 0),
    ),
    status: "academy",
    loanClubId: undefined,
    loanStartedAt: undefined,
    loanReturnDate: undefined,
  };
}

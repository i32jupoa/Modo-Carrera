import type { FcPlayer, PlayerStats } from "@/store/playersStore";
import { estimateAnnualWage } from "@/lib/transfers/SalaryEngine";
import { marketValueFor } from "@/data/players";
import { teamById } from "@/data/teams";
import type { AcademyPlayer } from "./academyTypes";
import type { PosCode } from "@/lib/positions";

function positionToEa(position: PosCode): string {
  switch (position) {
    case "GK": return "GK";
    case "DFC": return "CB";
    case "LD": return "RB";
    case "LI": return "LB";
    case "MCD": return "CDM";
    case "MC": return "CM";
    case "MCO": return "CAM";
    case "MD": return "RM";
    case "MI": return "LM";
    case "ED": return "RW";
    case "EI": return "LW";
    case "DC": return "ST";
  }
}

export function academyPlayerToFcPlayer(player: AcademyPlayer, teamName: string, leagueName: string): FcPlayer {
  const primary = positionToEa(player.positions[0] ?? "MC");
  const alternatives = player.positions.slice(1).map(positionToEa).join(",");
  const visibleOvr = Math.round(Number(player.internalOvr ?? player.ovr));
  return {
    ID: player.id,
    Name: player.name,
    OVR: visibleOvr,
    potential: Math.round(player.potential),
    PAC: player.attributes.PAC,
    SHO: player.attributes.SHO,
    PAS: player.attributes.PAS,
    DRI: player.attributes.DRI,
    DEF: player.attributes.DEF,
    PHY: player.attributes.PHY,
    Position: primary,
    "Alternative positions": alternatives,
    Nation: player.nation,
    Age: player.age,
    birthdate: player.birthdate,
    Team: teamName,
    League: leagueName,
    card: "academy",
  };
}

export function academyPlayerToStats(player: AcademyPlayer): PlayerStats {
  const now = Math.round(Number(player.internalOvr ?? player.ovr));
  return {
    goals: 0, assists: 0, appearances: 0,
    cupGoals: 0, cupAssists: 0, cupAppearances: 0,
    uclGoals: 0, uclAssists: 0, uclAppearances: 0, uclCleanSheets: 0, uclMotm: 0,
    uelGoals: 0, uelAssists: 0, uelAppearances: 0, uelCleanSheets: 0, uelMotm: 0,
    ueclGoals: 0, ueclAssists: 0, ueclAppearances: 0, ueclCleanSheets: 0, ueclMotm: 0,
    uclYellowCards: 0, uclRedCards: 0, uelYellowCards: 0, uelRedCards: 0, ueclYellowCards: 0, ueclRedCards: 0,
    cleanSheets: 0, cupCleanSheets: 0, motm: 0, cupMotm: 0,
    injuredUntil: 0, morale: 70, formHistory: [], yellowCards: 0, redCards: 0, accumulatedYellowCards: 0,
    energy: 100, energyLastUpdatedDate: new Date().toISOString().slice(0, 10),
    dynamicStats: {
      seasonGoals: 0,
      seasonAssists: 0,
      seasonAppearances: 0,
      seasonMinutes: 0,
      seasonMVPs: 0,
      seasonCleanSheets: 0,
      seasonAverageRating: 0,
      seasonTrophies: 0,
      monthlyStats: [],
      currentOVR: now,
      baseOVR: now,
      potentialOVR: Math.round(player.potential),
      attributes: { ...player.attributes },
      formHistory: [],
      careerSeasons: [],
      lastProgressionMonth: 0,
      lastProgressionYear: player.joinedSeason,
      lastProgressionDelta: 0,
      lastSeasonEndSeason: player.joinedSeason,
    },
  };
}

export function academyMarketValue(player: AcademyPlayer): number {
  let leagueId = "";
  let teamAverage = Math.max(50, player.ovr);
  try {
    const team = player.teamId ? teamById(player.teamId) : undefined;
    // teamById mantiene un fallback por compatibilidad; solo usarlo si el ID
    // coincide realmente para no asignar la liga del fallback a clubes huérfanos.
    if (team && team.id.toLowerCase() === player.teamId.toLowerCase()) {
      leagueId = team.league;
      teamAverage = (team.att + team.mid + team.def) / 3;
    }
  } catch {
    // Las partidas antiguas pueden conservar canteranos de clubes ya no disponibles.
  }

  const market = marketValueFor(
    Math.round(player.ovr),
    player.age,
    positionToEa(player.positions[0] ?? "MC"),
    player.teamId,
    leagueId,
    0,
    0,
    0,
    false,
    teamAverage,
    undefined,
    undefined,
    player.potential,
  );
  return Math.round(market.value * 1_000_000);
}

export function academyContract(player: AcademyPlayer): {
  yearsLeft: number;
  wage: number;
  releaseClause: number;
  signingBonus: number;
} {
  const value = academyMarketValue(player);
  const wage = Math.max(40_000, estimateAnnualWage(value, player.age, Math.round(player.ovr)) * 0.65);
  return {
    yearsLeft: Math.max(1, Math.round(player.contractYearsLeft || 2)),
    wage: Math.max(0, Math.round(Number(player.contractWage ?? wage) / 1000) * 1000),
    releaseClause: Math.max(0, Math.round(Number(player.contractReleaseClause ?? value * 2))),
    signingBonus: Math.max(0, Math.round(Number(player.contractSigningBonus ?? wage * 0.15))),
  };
}

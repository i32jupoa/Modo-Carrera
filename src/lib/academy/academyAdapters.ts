import type { FcPlayer, PlayerStats } from "@/store/playersStore";
import { estimateAnnualWage } from "@/lib/transfers/SalaryEngine";
import { marketValueFor } from "@/data/players";
import { buildPositions } from "@/lib/positions";
import type { AcademyPlayer } from "./academyTypes";

function positionToEa(position: AcademyPlayer["positions"][number]): string {
  switch (position) {
    case "GK": return "GK";
    case "CB": return "CB";
    case "LB": return "LB";
    case "RB": return "RB";
    case "CM": return "CM";
    case "CAM": return "CAM";
    case "CDM": return "CDM";
    case "LW": return "LW";
    case "RW": return "RW";
    case "ST": return "ST";
    case "CF": return "CF";
    default: return "CM";
  }
}

export function academyPlayerToFcPlayer(player: AcademyPlayer, teamName: string, leagueName: string): FcPlayer {
  const primary = positionToEa(player.positions[0] ?? "CM");
  const alternatives = player.positions.slice(1).map(positionToEa).join(",");
  return {
    ID: player.id,
    Name: player.name,
    OVR: Math.round(player.ovr),
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
  const now = player.ovr;
  const stats: PlayerStats = {
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
      potentialOVR: player.potential,
      attributes: { ...player.attributes },
      formHistory: [],
      careerSeasons: [],
      lastProgressionMonth: 0,
      lastProgressionYear: new Date().getFullYear(),
      lastProgressionDelta: 0,
      lastSeasonEndSeason: player.joinedSeason,
    },
  };
  return stats;
}

export function academyMarketValue(player: AcademyPlayer): number {
  const market = marketValueFor(
    Math.round(player.ovr),
    player.age,
    positionToEa(player.positions[0] ?? "CM"),
    player.teamId,
    "",
    0,
    0,
    0,
    false,
    Math.max(50, player.ovr),
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
    yearsLeft: Math.max(2, Math.round(player.contractYearsLeft || 2)),
    wage: Math.round(wage / 1000) * 1000,
    releaseClause: Math.round(value * 2),
    signingBonus: Math.round(wage * 0.15),
  };
}

import { clamp, seededInt, seededPick, seededRange, seededUnit } from "@/lib/transfers/random";
import type { PosCode } from "@/lib/positions";
import {
  ACADEMY_SIMULATION,
} from "./academyConstants";
import { createEmptyAcademySeasonStats } from "./academyTypes";
import type { AcademyMonthlyStats, AcademyPlayer, AcademySeasonStats } from "./academyTypes";

const POSITION_GROUP: Record<PosCode, "GK" | "DEF" | "MID" | "FWD"> = {
  GK: "GK",
  DFC: "DEF",
  LD: "DEF",
  LI: "DEF",
  MCD: "MID",
  MC: "MID",
  MCO: "MID",
  MD: "MID",
  MI: "MID",
  ED: "FWD",
  EI: "FWD",
  DC: "FWD",
};

const GOAL_WEIGHTS: Record<PosCode, number> = {
  GK: 0.02,
  DFC: 0.1,
  LD: 0.14,
  LI: 0.14,
  MCD: 0.24,
  MC: 0.48,
  MCO: 0.86,
  MD: 0.62,
  MI: 0.62,
  ED: 1.0,
  EI: 1.0,
  DC: 1.45,
};

const ASSIST_WEIGHTS: Record<PosCode, number> = {
  GK: 0.03,
  DFC: 0.12,
  LD: 0.32,
  LI: 0.32,
  MCD: 0.46,
  MC: 0.78,
  MCO: 1.05,
  MD: 0.92,
  MI: 0.92,
  ED: 0.88,
  EI: 0.88,
  DC: 0.48,
};

const OPPONENT_NAMES = [
  "Juventud Norte",
  "Atlético Metropolitano",
  "Unión Deportiva Central",
  "Real Horizonte",
  "Deportivo Sierra",
  "Estrella del Sur",
  "Sporting Capital",
  "Academia Levante",
] as const;

interface Participant {
  player: AcademyPlayer;
  minutes: number;
  isStarter: boolean;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  cleanSheet: boolean;
  rating: number;
}

function groupForPlayer(player: AcademyPlayer): "GK" | "DEF" | "MID" | "FWD" {
  return POSITION_GROUP[player.positions[0] ?? "MC"] ?? "MID";
}

function primaryPosition(player: AcademyPlayer): PosCode {
  return player.positions[0] ?? "MC";
}

function currentForm(player: AcademyPlayer): number {
  const history = player.academyStats?.formHistory ?? [];
  return history.length ? history[history.length - 1] : 6.8;
}

function selectionScore(player: AcademyPlayer, date: string): number {
  const stats = player.academyStats;
  const appearances = stats?.appearances ?? 0;
  const minutes = stats?.minutes ?? 0;
  const form = currentForm(player);
  const rotation = seededRange(-0.8, 0.8, date, player.id, "rotation");
  return Number(player.internalOvr ?? player.ovr) * 0.72 + form * 2.25 + player.potential * 0.05 - appearances * 0.72 - minutes * 0.012 + rotation;
}

function sortedCandidates(players: AcademyPlayer[], group: "GK" | "DEF" | "MID" | "FWD", date: string): AcademyPlayer[] {
  return players
    .filter((player) => groupForPlayer(player) === group)
    .slice()
    .sort((a, b) => selectionScore(b, date) - selectionScore(a, date) || b.ovr - a.ovr || a.id - b.id);
}

function selectParticipants(players: AcademyPlayer[], date: string): Participant[] {
  const selected: AcademyPlayer[] = [];
  const targets = ACADEMY_SIMULATION.lineup;
  for (const [group, target] of Object.entries(targets) as Array<["GK" | "DEF" | "MID" | "FWD", number]>) {
    const candidates = sortedCandidates(players, group, date);
    for (const player of candidates.slice(0, target)) selected.push(player);
  }

  // Si la cantera tiene una composición atípica por una partida antigua,
  // completamos el once con los mejores jugadores aún no seleccionados.
  if (selected.length < 11) {
    const fallback = players
      .filter((player) => !selected.includes(player))
      .slice()
      .sort((a, b) => selectionScore(b, date) - selectionScore(a, date) || b.ovr - a.ovr);
    selected.push(...fallback.slice(0, 11 - selected.length));
  }

  const benchCandidates = players
    .filter((player) => !selected.includes(player))
    .slice()
    .sort((a, b) => selectionScore(b, date) - selectionScore(a, date) || b.ovr - a.ovr);

  const participants: Participant[] = selected.map((player, index) => ({
    player,
    minutes: seededInt(
      ACADEMY_SIMULATION.starterMinMinutes,
      ACADEMY_SIMULATION.starterMaxMinutes,
      date,
      player.id,
      "starter-minutes",
      index,
    ),
    isStarter: true,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    cleanSheet: false,
    rating: 0,
  }));

  const substitutes = benchCandidates.slice(0, ACADEMY_SIMULATION.substitutionsPerMatch);
  participants.push(...substitutes.map((player, index) => ({
    player,
    minutes: seededInt(
      ACADEMY_SIMULATION.substituteMinMinutes,
      ACADEMY_SIMULATION.substituteMaxMinutes,
      date,
      player.id,
      "sub-minutes",
      index,
    ),
    isStarter: false,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    cleanSheet: false,
    rating: 0,
  })));
  return participants;
}

function poisson(lambda: number, seedParts: Array<string | number>): number {
  const safeLambda = Math.max(0, lambda);
  const threshold = Math.exp(-safeLambda);
  let product = 1;
  let k = 0;
  while (product > threshold && k < ACADEMY_SIMULATION.maxGoalsPerTeam) {
    product *= seededUnit(...seedParts, k);
    k += 1;
  }
  return Math.max(0, k - 1);
}

function weightedPickParticipant(participants: Participant[], date: string, event: string, weights: Record<PosCode, number>): Participant | null {
  const eligible = participants.filter((participant) => participant.minutes > 0);
  if (!eligible.length) return null;
  const weighted = eligible.map((participant) => ({
    participant,
    weight: Math.max(0.01, participant.minutes / ACADEMY_SIMULATION.starterMaxMinutes * weights[primaryPosition(participant.player)]),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = seededUnit(date, event, "pick") * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.participant;
  }
  return weighted[weighted.length - 1]?.participant ?? null;
}

function updateMonthlyStats(stats: AcademySeasonStats, date: string, patch: Partial<AcademyMonthlyStats>): AcademySeasonStats {
  const month = Number(date.slice(5, 7));
  const year = Number(date.slice(0, 4));
  const monthlyStats = [...(stats.monthlyStats ?? [])];
  let current = monthlyStats.find((entry) => entry.month === month && entry.year === year);
  if (!current) {
    current = {
      month,
      year,
      appearances: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      yellowCards: 0,
      redCards: 0,
      ratingTotal: 0,
      ratingCount: 0,
      averageRating: 0,
    };
    monthlyStats.push(current);
  }
  current.appearances += patch.appearances ?? 0;
  current.minutes += patch.minutes ?? 0;
  current.goals += patch.goals ?? 0;
  current.assists += patch.assists ?? 0;
  current.cleanSheets += patch.cleanSheets ?? 0;
  current.yellowCards += patch.yellowCards ?? 0;
  current.redCards += patch.redCards ?? 0;
  current.ratingTotal += patch.ratingTotal ?? 0;
  current.ratingCount += patch.ratingCount ?? 0;
  current.averageRating = current.ratingCount > 0 ? current.ratingTotal / current.ratingCount : 0;
  if (patch.ovr != null) current.ovr = Number(patch.ovr);
  return { ...stats, monthlyStats };
}

function simulateParticipant(participant: Participant, teamAverage: number, opponentAverage: number, teamGoals: number, opponentGoals: number, date: string): Participant {
  const form = currentForm(participant.player);
  const group = groupForPlayer(participant.player);
  const resultBonus = teamGoals > opponentGoals ? 0.28 : teamGoals === opponentGoals ? 0.05 : -0.2;
  const teamStrengthBonus = clamp((teamAverage - opponentAverage) * 0.025, -ACADEMY_SIMULATION.ratingTeamStrengthCap, ACADEMY_SIMULATION.ratingTeamStrengthCap);
  const individualQualityBonus = clamp((Number(participant.player.internalOvr ?? participant.player.ovr) - teamAverage) * ACADEMY_SIMULATION.ratingIndividualWeight, -0.2, 0.2);
  const formBonus = clamp((form - 6.8) * 0.18, -0.25, 0.3);
  const startBonus = participant.isStarter ? 0.05 : -0.04;
  const eventNoise = seededRange(ACADEMY_SIMULATION.ratingNoiseMin, ACADEMY_SIMULATION.ratingNoiseMax, date, participant.player.id, "rating-noise");
  let rating = 6.35 + resultBonus + teamStrengthBonus + individualQualityBonus + formBonus + startBonus + eventNoise;
  rating += participant.goals * (group === "FWD" ? 0.62 : group === "MID" ? 0.55 : 0.42);
  rating += participant.assists * 0.3;
  rating += participant.cleanSheet ? 0.13 : 0;
  rating -= participant.yellowCards * 0.14;
  rating -= participant.redCards * 1.0;
  return { ...participant, rating: Number(clamp(rating, ACADEMY_SIMULATION.ratingMin, ACADEMY_SIMULATION.ratingMax).toFixed(2)) };
}

export function simulateAcademyMatch(
  players: readonly AcademyPlayer[],
  date: string,
  saveId: string,
): { players: AcademyPlayer[]; opponent: string; teamGoals: number; opponentGoals: number } {
  const activePlayers = players.filter((player) => player.status === "academy" || player.status === "listed");
  if (activePlayers.length < 11) {
    return { players: players.slice(), opponent: "Sin partido", teamGoals: 0, opponentGoals: 0 };
  }

  const season = Number(date.slice(0, 4));
  const opponent = seededPick(OPPONENT_NAMES, saveId, date, "opponent") ?? OPPONENT_NAMES[0];
  const participants = selectParticipants(activePlayers, date);
  const teamAverage = activePlayers.reduce((sum, player) => sum + Number(player.internalOvr ?? player.ovr), 0) / activePlayers.length;
  const opponentAverage = clamp(
    teamAverage + seededRange(-ACADEMY_SIMULATION.opponentVariance, ACADEMY_SIMULATION.opponentVariance, saveId, date, "opponent-strength"),
    ACADEMY_SIMULATION.opponentMinOvr,
    ACADEMY_SIMULATION.opponentMaxOvr,
  );
  const strengthGap = clamp((teamAverage - opponentAverage) / 10, -2, 2);
  const teamExpectedGoals = clamp(
    ACADEMY_SIMULATION.teamExpectedGoalsBase + strengthGap * ACADEMY_SIMULATION.teamExpectedGoalsStrengthFactor + seededRange(-0.16, 0.16, saveId, date, "team-xg-noise"),
    ACADEMY_SIMULATION.teamExpectedGoalsMin,
    ACADEMY_SIMULATION.teamExpectedGoalsMax,
  );
  const opponentExpectedGoals = clamp(
    ACADEMY_SIMULATION.opponentExpectedGoalsBase - strengthGap * ACADEMY_SIMULATION.opponentExpectedGoalsStrengthFactor + seededRange(-0.16, 0.16, saveId, date, "opponent-xg-noise"),
    ACADEMY_SIMULATION.opponentExpectedGoalsMin,
    ACADEMY_SIMULATION.opponentExpectedGoalsMax,
  );
  const teamGoals = poisson(teamExpectedGoals, [saveId, date, "team-goals"]);
  const opponentGoals = poisson(opponentExpectedGoals, [saveId, date, "opp-goals"]);

  const participantsWithEvents = participants.map((participant) => {
    const minutesShare = participant.minutes / 90;
    const yellow = seededUnit(saveId, date, participant.player.id, "yellow") < ACADEMY_SIMULATION.yellowCardChance * minutesShare ? 1 : 0;
    const red = yellow === 1 && seededUnit(saveId, date, participant.player.id, "red") < ACADEMY_SIMULATION.redCardChance * minutesShare ? 1 : 0;
    return { ...participant, yellowCards: yellow, redCards: red };
  });

  for (let goalIndex = 0; goalIndex < teamGoals; goalIndex += 1) {
    const scorer = weightedPickParticipant(participantsWithEvents, date, `goal-${goalIndex}`, GOAL_WEIGHTS);
    if (!scorer) continue;
    scorer.goals += 1;
    if (seededUnit(saveId, date, scorer.player.id, "assist", goalIndex) < ACADEMY_SIMULATION.goalAssistChance) {
      const assister = weightedPickParticipant(
        participantsWithEvents.filter((participant) => participant.player.id !== scorer.player.id),
        date,
        `assist-${goalIndex}`,
        ASSIST_WEIGHTS,
      );
      if (assister) assister.assists += 1;
    }
  }

  const withCleanSheets = participantsWithEvents.map((participant) => ({
    ...participant,
    cleanSheet:
      opponentGoals === 0
      && participant.minutes >= ACADEMY_SIMULATION.cleanSheetMinMinutes
      && ["GK", "DEF"].includes(groupForPlayer(participant.player)),
  }));

  const rated = withCleanSheets.map((participant) =>
    simulateParticipant(participant, teamAverage, opponentAverage, teamGoals, opponentGoals, date),
  );

  const byId = new Map(rated.map((participant) => [participant.player.id, participant]));
  const nextPlayers = players.map((player) => {
    const participant = byId.get(player.id);
    if (!participant) return player;
    const currentStats = player.academyStats
      ? { ...player.academyStats }
      : createEmptyAcademySeasonStats(season);
    const stats: AcademySeasonStats = {
      ...currentStats,
      season: currentStats.season || season,
      appearances: currentStats.appearances + 1,
      minutes: currentStats.minutes + participant.minutes,
      goals: currentStats.goals + participant.goals,
      assists: currentStats.assists + participant.assists,
      cleanSheets: currentStats.cleanSheets + (participant.cleanSheet ? 1 : 0),
      yellowCards: currentStats.yellowCards + participant.yellowCards,
      redCards: currentStats.redCards + participant.redCards,
      ratingTotal: currentStats.ratingTotal + participant.rating,
      ratingCount: currentStats.ratingCount + 1,
      averageRating: (currentStats.ratingTotal + participant.rating) / (currentStats.ratingCount + 1),
      formHistory: [...(currentStats.formHistory ?? []), participant.rating].slice(-ACADEMY_SIMULATION.maxFormHistory),
      lastMatchDate: date,
      lastOpponent: opponent,
      monthlyStats: currentStats.monthlyStats ?? [],
    };
    const withMonthly = updateMonthlyStats(stats, date, {
      appearances: 1,
      minutes: participant.minutes,
      goals: participant.goals,
      assists: participant.assists,
      cleanSheets: participant.cleanSheet ? 1 : 0,
      yellowCards: participant.yellowCards,
      redCards: participant.redCards,
      ratingTotal: participant.rating,
      ratingCount: 1,
      ovr: Number(player.internalOvr ?? player.ovr),
    });
    return {
      ...player,
      minutesThisSeason: player.minutesThisSeason + participant.minutes,
      academyStats: withMonthly,
    };
  });

  return { players: nextPlayers, opponent, teamGoals, opponentGoals };
}

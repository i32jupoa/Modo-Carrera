import type { Player } from "@/data/players";
import type { Suspension } from "@/lib/store";
import type { PlayerStats } from "@/store/playersStore";
import type { SquadRole } from "@/lib/transfers/types";
import { computeSquadRole } from "./squadRoles";

export const SATISFACTION_CONFIG = {
  initialMorale: 70,
  thresholds: { star: 3, starter: 3, rotation: 4, secondary: 6 } as Partial<Record<SquadRole, number>>,
  missDelta: -4,
  starNotCalledDelta: -10,
  starterNotCalledDelta: -7,
  starBenchAfterThreeDelta: -6,
  starterBenchAfterThreeDelta: -4,
  maxWeeklyDrop: 12,
  expectationRecovery: 3,
  goalBonus: 2,
  mvpBonus: 2,
  winBonus: 2,
  lossPenalty: -1,
  prospectPlayBonus: 2,
  significantMinutes: 45,
  lowMoraleThreshold: 25,
  lowMoraleStreakForExit: 2,
  mailboxPromiseGreatBonus: 10,
  mailboxPromiseSuccessBonus: 8,
  mailboxPromisePoorBonus: 3,
  mailboxPromiseFailurePenalty: -20,
  mailboxNoResponsePenalty: -2,
} as const;

const mailboxWantsOutOverrides = new Set<string>();

export function hasMailboxWantsOut(playerId: string): boolean {
  return mailboxWantsOutOverrides.has(playerId);
}

export function hydrateMailboxWantsOutOverrides(stats: Record<string, PlayerStats>): void {
  mailboxWantsOutOverrides.clear();
  for (const [playerId, value] of Object.entries(stats)) {
    if (value.mailboxWantsOut) mailboxWantsOutOverrides.add(playerId);
  }
}

export type SatisfactionChange = {
  playerId: string;
  before: number;
  after: number;
  delta: number;
  reason: string;
  frozen: boolean;
  missedExpectation: boolean;
  starter: boolean;
  minutes: number;
  role: SquadRole;
};

export function clampMorale(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : SATISFACTION_CONFIG.initialMorale)));
}

function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return date;
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function competitionKey(competition: string | undefined): Suspension["competition"] {
  if (competition === "cup") return "cup";
  if (competition === "ucl") return "ucl";
  if (competition === "uel") return "uel";
  if (competition === "uecl") return "uecl";
  return "league";
}

export function wasSuspendedBeforeMatch(
  suspensions: Record<string, Suspension[]>,
  teamId: string,
  playerId: string,
  competition: string | undefined,
): boolean {
  const key = competitionKey(competition);
  return (suspensions[teamId] ?? []).some(
    (s) => s.playerId === playerId && s.matchdaysRemaining > 0 && s.competition === key,
  );
}

export function injuryWasActiveBeforeMatch(stats: PlayerStats, matchDate: string): boolean {
  if (!stats.injuredUntilDate || !matchDate) return false;
  const until = new Date(`${stats.injuredUntilDate}T00:00:00Z`).getTime();
  const start = new Date(`${stats.injuryStartDate ?? "1900-01-01"}T00:00:00Z`).getTime();
  const match = new Date(`${matchDate}T00:00:00Z`).getTime();
  // La fecha de inicio coincide con el propio partido cuando la lesión ocurrió
  // durante el encuentro (muy habitual en el modo directo). Solo congelamos
  // si ya estaba lesionado antes del saque inicial. En saves antiguos sin
  // fecha de lesión usamos el fallback histórico (1900).
  const existedBeforeKickoff = stats.injuryStartDate ? start < match : true;
  return Number.isFinite(until) && Number.isFinite(match) && until > match && existedBeforeKickoff;
}

function winnerForTeam(result: { homeGoals: number; awayGoals: number }, side: "home" | "away"):
  | "win"
  | "draw"
  | "loss" {
  const own = side === "home" ? result.homeGoals : result.awayGoals;
  const opp = side === "home" ? result.awayGoals : result.homeGoals;
  return own > opp ? "win" : own < opp ? "loss" : "draw";
}

export type SatisfactionMatchResult = {
  homeGoals: number;
  awayGoals: number;
  events?: Array<{ type?: string; scorerId?: string }>;
  mvp?: { playerId?: string } | null;
  ratings?: Array<{ playerId: string; minutes?: number; team?: "home" | "away"; rating?: number }>;
  homeStartingLineup?: Player[];
  awayStartingLineup?: Player[];
  homeLineup?: Player[];
  awayLineup?: Player[];
  substitutions?: Array<{ minute: number; team: "home" | "away"; playerOutId: string; playerInId: string }>;
};

function buildMinutesMap(result: SatisfactionMatchResult, teamId: string, homeTeamId: string) {
  const side = teamId === homeTeamId ? "home" : "away";
  const startersRaw = side === "home"
    ? result.homeStartingLineup ?? result.homeLineup ?? []
    : result.awayStartingLineup ?? result.awayLineup ?? [];
  const starters = new Set(startersRaw.map((p) => p.id));
  const minutes = new Map<string, number>();
  for (const player of startersRaw) minutes.set(player.id, 90);
  for (const rating of result.ratings ?? []) {
    if (rating.team && rating.team !== side) continue;
    if (rating.playerId) minutes.set(rating.playerId, Math.max(0, Math.round(Number(rating.minutes) || 0)));
  }
  for (const sub of result.substitutions ?? []) {
    if (sub.team !== side) continue;
    minutes.set(sub.playerOutId, Math.max(0, Math.min(90, Math.round(sub.minute))));
    minutes.set(sub.playerInId, Math.max(1, 90 - Math.round(sub.minute)));
  }
  return { minutes, starters };
}

export type SatisfactionInput = {
  teamId: string;
  homeTeamId: string;
  squad: readonly Player[];
  stats: Record<string, PlayerStats>;
  matchDate: string;
  competition?: string;
  result: SatisfactionMatchResult;
  suspensions: Record<string, Suspension[]>;
  typicalXIIds?: ReadonlySet<string>;
  /** Jugadores convocados para el partido (XI + banquillo). */
  calledUpIds?: ReadonlySet<string>;
};

export function computePostMatchSatisfaction(input: SatisfactionInput): {
  updatedStats: Record<string, PlayerStats>;
  changes: SatisfactionChange[];
} {
  const roles = new Map<string, SquadRole>();
  const typicalXIIds = input.typicalXIIds ?? new Set<string>();
  for (const player of input.squad) {
    roles.set(
      player.id,
      input.stats[player.id]?.squadRole ?? computeSquadRole(player, input.squad, { typicalXIIds }),
    );
  }

  const { minutes, starters } = buildMinutesMap(input.result, input.teamId, input.homeTeamId);
  const calledUpIds = input.calledUpIds ?? new Set<string>([...starters]);
  const side = input.teamId === input.homeTeamId ? "home" : "away";
  const outcome = winnerForTeam(input.result, side);
  const scorerIds = new Set(
    (input.result.events ?? [])
      .filter((event) => event.type === "goal" && event.scorerId)
      .map((event) => event.scorerId as string),
  );
  const mvpId = input.result.mvp?.playerId;
  const nextStats: Record<string, PlayerStats> = { ...input.stats };
  const changes: SatisfactionChange[] = [];

  for (const player of input.squad) {
    const previous: PlayerStats = nextStats[player.id] ?? ({ morale: SATISFACTION_CONFIG.initialMorale } as PlayerStats);
    const storedRole = roles.get(player.id) ?? "secondary";
    // El rol persistido es la fuente de verdad durante la temporada. Los roles
    // automáticos se recalculan únicamente en los puntos de control del mercado
    // y final de temporada; nunca por jornada, para evitar que un jugador salte
    // de rol y pierda/recupere satisfacción artificialmente.
    const role = storedRole;
    const minutesPlayed = minutes.get(player.id) ?? 0;
    const started = starters.has(player.id);
    const frozen =
      wasSuspendedBeforeMatch(input.suspensions, input.teamId, player.id, input.competition) ||
      injuryWasActiveBeforeMatch(previous, input.matchDate);

    if (frozen) {
      nextStats[player.id] = {
        ...previous,
        squadRole: previous.squadRole ?? role,
        morale: clampMorale(previous.morale),
        satisfactionLastReason: "Satisfacción congelada: no estaba disponible por lesión o sanción.",
      };
      changes.push({ playerId: player.id, before: clampMorale(previous.morale), after: clampMorale(previous.morale), delta: 0, reason: "No disponible", frozen: true, missedExpectation: false, starter: started, minutes: minutesPlayed, role });
      continue;
    }

    const threshold = SATISFACTION_CONFIG.thresholds[role] ?? 6;
    const meetsExpectation =
      role === "star" || role === "starter" ? started :
      role === "rotation" ? minutesPlayed > 0 :
      role === "secondary" ? minutesPlayed > 0 :
      minutesPlayed > 0;
    const previousStreak = Number(previous.satisfactionMissStreak ?? 0);
    const previousNotCalledStreak = Number(previous.satisfactionNotCalledStreak ?? 0);
    const previousBenchStreak = Number(previous.satisfactionBenchStreak ?? 0);
    const calledUp = calledUpIds.has(player.id);
    const onBench = calledUp && !started;
    const previousWeek = previous.satisfactionWeekKey;
    const currentWeek = weekKey(input.matchDate);
    const weeklyDrop = previousWeek === currentWeek ? Number(previous.satisfactionWeeklyDrop ?? 0) : 0;
    let streak = previousStreak;
    let notCalledStreak = previousNotCalledStreak;
    let benchStreak = previousBenchStreak;
    let delta = 0;
    let reason = "";
    let specialAvailabilityReason = false;

    if (meetsExpectation) {
      notCalledStreak = 0;
      benchStreak = 0;
      streak = 0;
      if (role !== "prospect") delta += SATISFACTION_CONFIG.expectationRecovery;
      else if (minutesPlayed > 0) delta += SATISFACTION_CONFIG.prospectPlayBonus;
      reason = started ? "Fue titular y cumplió su expectativa." : minutesPlayed > 0 ? "Tuvo minutos y cumplió su expectativa." : "La expectativa de la promesa se mantiene.";
    } else {
      streak += 1;
      if (role === "star" || role === "starter") {
        if (!calledUp) {
          notCalledStreak += 1;
          benchStreak = 0;
          const extraDrop = role === "star" ? SATISFACTION_CONFIG.starNotCalledDelta : SATISFACTION_CONFIG.starterNotCalledDelta;
          delta += extraDrop;
          specialAvailabilityReason = true;
          reason = role === "star"
            ? `No fue convocado por ${notCalledStreak} partido(s) consecutivo(s). Para una estrella, quedarse fuera de la convocatoria afecta mucho a su satisfacción.`
            : `No fue convocado por ${notCalledStreak} partido(s) consecutivo(s).`;
        } else if (onBench) {
          notCalledStreak = 0;
          benchStreak += 1;
          if (benchStreak >= 3) {
            delta += role === "star" ? SATISFACTION_CONFIG.starBenchAfterThreeDelta : SATISFACTION_CONFIG.starterBenchAfterThreeDelta;
            specialAvailabilityReason = true;
            reason = role === "star"
              ? `Lleva ${benchStreak} partidos consecutivos como suplente.`
              : `Lleva ${benchStreak} partidos consecutivos como suplente.`;
          } else {
            reason = `Fue convocado pero lleva ${benchStreak} partido(s) consecutivo(s) como suplente.`;
          }
        }
      }
      if (!specialAvailabilityReason && role !== "prospect" && streak >= threshold) {
        const allowed = Math.max(0, SATISFACTION_CONFIG.maxWeeklyDrop - weeklyDrop);
        const drop = Math.min(Math.abs(SATISFACTION_CONFIG.missDelta), allowed);
        if (role !== "star" && role !== "starter") delta -= drop;
        reason = role === "star" || role === "starter"
          ? minutesPlayed === 0
            ? `Lleva ${streak} partidos sin ser titular ni tener minutos.`
            : `Lleva ${streak} partidos sin ser titular.`
          : `Lleva ${streak} partidos sin jugar.`;
      } else if (!specialAvailabilityReason) {
        reason = role === "star" || role === "starter"
          ? `Sigue esperando minutos: ${streak}/${threshold}.`
          : role === "prospect"
            ? `La promesa sigue esperando una oportunidad: ${streak} partido(s) sin minutos.`
            : `Sin minutos suficientes: ${streak}/${threshold}.`;
      }
    }

    if (scorerIds.has(player.id)) delta += SATISFACTION_CONFIG.goalBonus;
    if (mvpId === player.id) delta += SATISFACTION_CONFIG.mvpBonus;
    if (minutesPlayed > 0 && outcome === "win") delta += SATISFACTION_CONFIG.winBonus;
    if (minutesPlayed > 0 && outcome === "loss") delta += SATISFACTION_CONFIG.lossPenalty;

    const before = clampMorale(previous.morale);
    const negativeDelta = Math.min(0, delta);
    const weeklyAllowedDrop = Math.max(0, SATISFACTION_CONFIG.maxWeeklyDrop - (previousWeek === currentWeek ? weeklyDrop : 0));
    if (negativeDelta < 0 && Math.abs(negativeDelta) > weeklyAllowedDrop) {
      delta += (-negativeDelta - weeklyAllowedDrop);
    }
    const after = clampMorale(before + delta);
    const nextWeeklyDrop = previousWeek === currentWeek ? Math.max(0, weeklyDrop - Math.min(0, delta)) : Math.max(0, -Math.min(0, delta));
    const lowStreak = after < SATISFACTION_CONFIG.lowMoraleThreshold
      ? Number(previous.satisfactionLowMoraleStreak ?? 0) + 1
      : 0;
    const wantsOut = Boolean(previous.mailboxWantsOut) || lowStreak >= SATISFACTION_CONFIG.lowMoraleStreakForExit;

    nextStats[player.id] = {
      ...previous,
      squadRole: previous.squadRole ?? role,
      morale: after,
      satisfactionMissStreak: streak,
      satisfactionNotCalledStreak: notCalledStreak,
      satisfactionBenchStreak: benchStreak,
      satisfactionLastReason: reason,
      satisfactionWeekKey: currentWeek,
      satisfactionWeeklyDrop: nextWeeklyDrop,
      satisfactionLowMoraleStreak: lowStreak,
      mailboxWantsOut: wantsOut,
    };
    if (wantsOut) mailboxWantsOutOverrides.add(player.id);
    else mailboxWantsOutOverrides.delete(player.id);
    changes.push({ playerId: player.id, before, after, delta: after - before, reason, frozen: false, missedExpectation: !meetsExpectation, starter: started, minutes: minutesPlayed, role });
  }
  return { updatedStats: nextStats, changes };
}

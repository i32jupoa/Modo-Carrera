import { addDaysToIso } from "@/lib/transferWindows";
import { clamp, seededRange, seededUnit } from "@/lib/transfers/random";
import { ACADEMY_FACILITIES, ACADEMY_LIMITS } from "./academyConstants";
import { generateAnnualIntake } from "./academyGenerator";
import type { AcademyPlayer, ClubAcademyState } from "./academyTypes";

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function applyMonthlyYouthGrowth(player: AcademyPlayer, state: ClubAcademyState, date: string, saveId: string): AcademyPlayer {
  if (!["academy", "loaned", "called-up"].includes(player.status)) return player;
  const gap = Math.max(0, player.potential - player.ovr);
  const ageFactor = player.age <= 17 ? 1.18 : player.age <= 19 ? 1.08 : player.age === 20 ? 0.92 : 0.68;
  const profileFactor = player.growthProfile === "early" ? 1.12 : player.growthProfile === "late" ? (player.age >= 19 ? 1.28 : 0.82) : player.growthProfile === "stagnant" ? 0.48 : 1;
  const traitFactor = player.traits.includes("hard-worker") ? 1.08 : player.traits.includes("temperamental") ? 0.94 : player.traits.includes("diamond") ? 1.06 : 1;
  const facilityFactor = ACADEMY_FACILITIES.progressionMultiplierByLevel[state.facilityLevel - 1] ?? 1;
  const coachLevel = state.youthCoach?.level ?? 0;
  const coachBonus = coachLevel > 0
    ? (1 + coachLevel * 0.035) * (player.positions.some((position) => {
      const group = position === "GK" ? "GK" : ["CB", "LB", "RB"].includes(position) ? "DEF" : ["ST", "CF", "LW", "RW"].includes(position) ? "ATT" : "MID";
      return group === state.youthCoach?.specialty;
    }) ? ACADEMY_LIMITS.coachSpecialtyMultiplier : 1)
    : 1;
  const mentorBonus = player.mentorId ? ACADEMY_LIMITS.mentorBonus : 1;
  const loanBonus = player.status === "loaned" ? ((player.loanReports?.[player.loanReports.length - 1]?.minutes ?? 0) >= 60 ? 1.08 : 0.94) : 1;
  const retrainingPenalty = player.retrainingUntil && date <= player.retrainingUntil ? ACADEMY_LIMITS.retrainingProgressPenalty : 1;
  const variance = seededRange(0.72, 1.22, saveId, state.teamId, player.id, monthKey(date));
  const rawDelta = Math.max(0, Math.min(0.72, gap / 30)) * 0.55 * ageFactor * profileFactor * traitFactor * facilityFactor * coachBonus * mentorBonus * loanBonus * retrainingPenalty * variance;
  const delta = Math.round(rawDelta * 100) / 100;
  const nextOvr = clamp(player.ovr + delta, 38, player.potential);
  const spread = Math.max(-0.35, Math.min(0.35, delta * 0.38));
  const attributes = Object.fromEntries(Object.entries(player.attributes).map(([key, value]) => [key, Math.round(clamp(value + spread * (0.7 + seededUnit(saveId, player.id, key, monthKey(date)) * 0.6), 20, 99) * 10) / 10])) as AcademyPlayer["attributes"];
  const retrainingActive = player.retrainingUntil && date <= player.retrainingUntil;
  return {
    ...player,
    ovr: Number(nextOvr.toFixed(2)),
    attributes,
    retrainingPosition: retrainingActive ? player.retrainingPosition : undefined,
    retrainingUntil: retrainingActive ? player.retrainingUntil : undefined,
  };
}

export function advanceAcademyToDate(state: ClubAcademyState, currentDate: string, saveId: string): ClubAcademyState {
  const last = state.lastProgressionDate ?? `${state.lastIntakeSeason}-07-01`;
  if (last >= currentDate) return state;

  let cursor = last;
  let players = state.players.slice();
  let lastSeason = state.lastIntakeSeason;
  let manualPromotionAvailable = state.manualPromotionAvailable ?? true;
  let next = cursor;
  while (monthKey(next) !== monthKey(currentDate)) {
    next = addDaysToIso(next, 28);
    if (next > currentDate) break;
    const month = Number(next.slice(5, 7));
    const year = Number(next.slice(0, 4));
    players = players.map((player) => applyMonthlyYouthGrowth(player, state, `${year}-${String(month).padStart(2, "0")}-15`, saveId));
    cursor = next;
    const seasonChanged = year > lastSeason && month >= 7;
    if (seasonChanged) {
      players = players.map((player) => ({
        ...player,
        age: Math.min(21, player.age + 1),
        contractYearsLeft: Math.max(0, player.contractYearsLeft - 1),
        minutesThisSeason: 0,
      }));
      lastSeason = year;
      const intakeState: ClubAcademyState = { ...state, players, lastIntakeSeason: lastSeason };
      const additions = generateAnnualIntake(saveId, intakeState, lastSeason);
      // La progresión anual no expulsa automáticamente a cedidos ni convocados:
      // en la cantera del usuario la decisión de ciclo final sigue siendo manual.
      players = [...players.filter((player) => player.status !== "promoted"), ...additions];
      manualPromotionAvailable = false;
    }
  }

  return {
    ...state,
    players: players.slice(0, ACADEMY_LIMITS.maxPlayers),
    lastIntakeSeason: lastSeason,
    lastProgressionDate: currentDate,
    manualPromotionAvailable,
    updatedAt: new Date().toISOString(),
  };
}

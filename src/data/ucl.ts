import { type LeagueId } from "@/data/teams";
import { getInitialEuropeanParticipants, selectEuropeanParticipants } from "@/lib/season/europeanQualification";
import { addIsoDays, getDateOffset, shiftReferenceDateToSeason } from "@/lib/season/calendarFactory";

// ============================================================
//  UCL SWISS FORMAT — 36 teams, 8 matchdays, single table
// ============================================================

export type UCLPhase = "league" | "playoff" | "r16" | "qf" | "sf" | "final" | "done";

export type UCLTableEntry = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

// A slot in the fixed bracket (R16 onwards)
export type UCLBracketSlot = {
  id: string; // e.g. "R16-1", "QF-1", "SF-1", "F"
  round: UCLPhase;
  homeId: string | null; // null = TBD
  awayId: string | null;
  legOneMatchday: number;
  legTwoMatchday: number; // same as legOne for Final (single leg)
  isFinal: boolean;
};

export type UCLState = {
  phase: UCLPhase;
  seasonNumber: number; // 1 = hardcoded, 2+ = merit
  participants: string[]; // 36 teamIds in pot order (pot1[0..8], pot2[0..8], ...)
  table: UCLTableEntry[];
  /** Snapshot after league MD8 — standings UI uses this once set */
  leaguePhaseTable: UCLTableEntry[] | null;
  drawState: {
    leagueDone: boolean;
    playoffDone: boolean;
    knockoutDone: boolean;
  };
  bracket: UCLBracketSlot[]; // full tree from play-off draw onward
};

export function isUCLLeaguePhaseFixture(round: string | undefined): boolean {
  return !!round?.startsWith("Jornada");
}

// ============================================================
//  PARTICIPANTES BASE DE LA PRIMERA TEMPORADA
//  Se derivan de la fuerza y distribución de los clubes registrados; las
//  temporadas posteriores usan la clasificación por méritos de cada carrera.
//  Se conserva el nombre exportado para compatibilidad con rutas/guardados.
// ============================================================
export const UCL_SEASON1_IDS: string[] = getInitialEuropeanParticipants("ucl");

// ============================================================
//  POT ASSIGNMENT — divide 36 teams into 4 pots of 9 by OVR
// ============================================================
export function assignUCLPots(teamIds: string[]): string[][] {
  // If the list matches UCL_SEASON1_IDS exactly (same IDs, any order),
  // use the canonical positional order so pot assignments are stable.
  const canonical = UCL_SEASON1_IDS;
  const inputSet = new Set(teamIds);
  const useCanonical =
    teamIds.length === canonical.length && canonical.every((id) => inputSet.has(id));

  const ordered = useCanonical ? canonical : [...teamIds];

  return [ordered.slice(0, 9), ordered.slice(9, 18), ordered.slice(18, 27), ordered.slice(27, 36)];
}

// ============================================================
//  CLASIFICACIÓN POR MÉRITOS (compatibilidad con consumidores antiguos)
// ============================================================
export type LeagueSlots = { leagueId: LeagueId; slots: number };

/**
 * Selector heredado. La asignación real ya vive en europeanQualification.ts,
 * que aplica coeficientes de asociaciones, campeones, copas y cascada de plazas.
 */
export function selectUCLParticipants(
  standings: Record<string, { teamId: string; points: number; gd?: number; gf?: number; won?: number; played?: number }[]>,
): string[] {
  return selectEuropeanParticipants({ season: "2027/28", standings }).ucl;
}

// ============================================================
//  CALENDAR OFFSETS (days from UCL_START = 2026-07-01)
//
//  Realistic calendar aligned with the real UEFA Champions League:
//   - League phase: late August → late January
//   - Play-off round: mid-February
//   - Round of 16: March · Quarter-finals: April
//   - Semi-finals: late April / early May · Final: late May
//
//  Anchored on Tuesdays/Wednesdays so they never collide with the
//  Spanish league (Saturdays) or the national cup (Wednesdays on cup
//  matchdays), and keeping at least a 2-day gap between consecutive
//  UCL fixtures.
// ============================================================
export const UCL_START = "2026-07-01";

export const UCL_CALENDAR = {
  leagueDraw: 56, // Wed Aug 26 2026 – Swiss-phase draw
  leagueDay: [76, 90, 111, 126, 147, 160, 202, 209],
  //              ^J1 Sep 15  ^J2 Sep 29  ^J3 Oct 20  ^J4 Nov  4
  //              ^J5 Nov 25  ^J6 Dec  8  ^J7 Jan 19  ^J8 Jan 26
  // Draws after completed rounds: +2 days where possible, while keeping
  // at least 14 days between the draw and the next match.
  playoffDraw: 211, // Thu Jan 28 2027 – 2 days after league phase ends
  playoffLeg1: 230, // Tue Feb 16 2027
  playoffLeg2: 237, // Tue Feb 23 2027
  knockoutDraw: 239, // Thu Feb 25 2027 – 2 days after play-off round ends
  // R16 keeps the minimum 14-day draw-to-match gap.
  r16Leg1: 258, // Tue Mar 16 2027
  r16Leg2: 265, // Tue Mar 23 2027
  qfLeg1: 279, // Tue Apr  6 2027
  qfLeg2: 286, // Tue Apr 13 2027
  sfLeg1: 300, // Tue Apr 27 2027
  sfLeg2: 307, // Tue May  4 2027
  final: 329, // Wed May 26 2027 – single-leg final
};

export function uclStartForSeason(seasonStartYear = 2026): string {
  return `${seasonStartYear}-07-01`;
}

/**
 * Rebuild the UEFA calendar for any season. The reference dates are moved by
 * civil date and snapped to their original weekday, so Tue/Wed UCL fixtures
 * stay on Tue/Wed even when the next season has a different weekday layout.
 * The existing UCL_CALENDAR remains the exact 2026/27 compatibility baseline.
 */
export function uclCalendarForSeason(seasonStartYear = 2026) {
  if (seasonStartYear === 2026) return UCL_CALENDAR;
  const start = uclStartForSeason(seasonStartYear);
  const offset = (referenceOffset: number) => {
    const referenceIso = addIsoDays(UCL_START, referenceOffset);
    const shiftedIso = shiftReferenceDateToSeason(referenceIso, seasonStartYear, true);
    return getDateOffset(start, shiftedIso);
  };
  return {
    leagueDraw: offset(UCL_CALENDAR.leagueDraw),
    leagueDay: UCL_CALENDAR.leagueDay.map(offset),
    playoffDraw: offset(UCL_CALENDAR.playoffDraw),
    playoffLeg1: offset(UCL_CALENDAR.playoffLeg1),
    playoffLeg2: offset(UCL_CALENDAR.playoffLeg2),
    knockoutDraw: offset(UCL_CALENDAR.knockoutDraw),
    r16Leg1: offset(UCL_CALENDAR.r16Leg1),
    r16Leg2: offset(UCL_CALENDAR.r16Leg2),
    qfLeg1: offset(UCL_CALENDAR.qfLeg1),
    qfLeg2: offset(UCL_CALENDAR.qfLeg2),
    sfLeg1: offset(UCL_CALENDAR.sfLeg1),
    sfLeg2: offset(UCL_CALENDAR.sfLeg2),
    final: offset(UCL_CALENDAR.final),
  };
}

export function uclDayOffset(isoDate: string, seasonStartYear = 2026): number {
  const start = new Date(uclStartForSeason(seasonStartYear) + "T00:00:00Z").getTime();
  const d = new Date(isoDate + "T00:00:00Z").getTime();
  return Math.floor((d - start) / 86400000);
}

/** UCL matchdays in chronological order for a specific career season. */
export function uclSimulationDaysForSeason(seasonStartYear = 2026): number[] {
  const calendar = uclCalendarForSeason(seasonStartYear);
  return [
    ...calendar.leagueDay,
    calendar.playoffLeg1,
    calendar.playoffLeg2,
    calendar.r16Leg1,
    calendar.r16Leg2,
    calendar.qfLeg1,
    calendar.qfLeg2,
    calendar.sfLeg1,
    calendar.sfLeg2,
    calendar.final,
  ];
}

/** Legacy 2026/27 offsets retained for compatibility with older consumers. */
export const UCL_SIMULATION_DAYS: number[] = uclSimulationDaysForSeason(2026);

export function uclRoundForOffset(offset: number, seasonStartYear = 2026): string | null {
  const calendar = uclCalendarForSeason(seasonStartYear);
  const li = calendar.leagueDay.indexOf(offset);
  if (li >= 0) return `Jornada ${li + 1}`;
  if (offset === calendar.playoffLeg1) return "Playoff-Leg1";
  if (offset === calendar.playoffLeg2) return "Playoff-Leg2";
  if (offset === calendar.r16Leg1) return "R16-Leg1";
  if (offset === calendar.r16Leg2) return "R16-Leg2";
  if (offset === calendar.qfLeg1) return "QF-Leg1";
  if (offset === calendar.qfLeg2) return "QF-Leg2";
  if (offset === calendar.sfLeg1) return "SF-Leg1";
  if (offset === calendar.sfLeg2) return "SF-Leg2";
  if (offset === calendar.final) return "Final";
  return null;
}

// ============================================================
//  INITIAL TABLE ENTRY
// ============================================================
export function emptyTableEntry(teamId: string): UCLTableEntry {
  return { teamId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

// ============================================================
//  TABLE SORT (pts → gd → gf → teamId alphabetic)
// ============================================================
export function sortUCLTable(table: UCLTableEntry[]): UCLTableEntry[] {
  return [...table].sort(
    (a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.teamId.localeCompare(b.teamId),
  );
}

// ============================================================
//  APPLY RESULT TO TABLE
// ============================================================
export function applyUCLResult(
  table: UCLTableEntry[],
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number,
): UCLTableEntry[] {
  return table.map((e) => {
    if (e.teamId === homeId) {
      const w = homeGoals > awayGoals ? 1 : 0;
      const d = homeGoals === awayGoals ? 1 : 0;
      const l = 1 - w - d;
      return {
        ...e,
        played: e.played + 1,
        won: e.won + w,
        drawn: e.drawn + d,
        lost: e.lost + l,
        gf: e.gf + homeGoals,
        ga: e.ga + awayGoals,
        gd: e.gd + (homeGoals - awayGoals),
        points: e.points + w * 3 + d,
      };
    }
    if (e.teamId === awayId) {
      const w = awayGoals > homeGoals ? 1 : 0;
      const d = homeGoals === awayGoals ? 1 : 0;
      const l = 1 - w - d;
      return {
        ...e,
        played: e.played + 1,
        won: e.won + w,
        drawn: e.drawn + d,
        lost: e.lost + l,
        gf: e.gf + awayGoals,
        ga: e.ga + homeGoals,
        gd: e.gd + (awayGoals - homeGoals),
        points: e.points + w * 3 + d,
      };
    }
    return e;
  });
}

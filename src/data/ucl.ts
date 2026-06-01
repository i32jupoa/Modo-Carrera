import { LeagueId, LEAGUES, teamsByLeague, getAllTeams, teamById } from "@/data/teams";

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
  id: string;          // e.g. "R16-1", "QF-1", "SF-1", "F"
  round: UCLPhase;
  homeId: string | null;   // null = TBD
  awayId: string | null;
  legOneMatchday: number;
  legTwoMatchday: number;  // same as legOne for Final (single leg)
  isFinal: boolean;
};

export type UCLState = {
  phase: UCLPhase;
  seasonNumber: number;           // 1 = hardcoded, 2+ = merit
  participants: string[];         // 36 teamIds in pot order (pot1[0..8], pot2[0..8], ...)
  table: UCLTableEntry[];
  /** Snapshot after league MD8 — standings UI uses this once set */
  leaguePhaseTable: UCLTableEntry[] | null;
  drawState: {
    leagueDone: boolean;
    playoffDone: boolean;
    knockoutDone: boolean;
  };
  bracket: UCLBracketSlot[];      // full tree from play-off draw onward
};

export function isUCLLeaguePhaseFixture(round: string | undefined): boolean {
  return !!round?.startsWith("Jornada");
}

// ============================================================
//  HARDCODED SEASON 1 PARTICIPANTS (36 teams)
//  Ordered by approximate OVR for pot assignment
// ============================================================

// Maps display name → team id used in the game
// These must match the ids in PLAYERS_BY_TEAM / getAllTeams()
export const UCL_SEASON1_IDS: string[] = [
  // ── Bombo 1 — top 9 por media (att+mid+def) ──────────────
  "mci",            // Manchester City        271
  "rma",            // Real Madrid            270
  "bay",            // FC Bayern München      266
  "psg",            // Paris SG               265
  "liv",            // Liverpool              264
  "int",            // Lombardia FC           263
  "ars",            // Arsenal                263
  "bar",            // FC Barcelona           262
  "lev2",           // Leverkusen             258
  // ── Bombo 2 — siguientes 9 ───────────────────────────────
  "nap",            // SSC Napoli             257
  "atm",            // Atlético de Madrid     256
  "juv",            // Juventus               255
  "che",            // Chelsea                252
  "rbl",            // RB Leipzig             251
  "bvb",            // Borussia Dortmund      251
  "mil",            // Milano FC              250
  "fcporto",        // FC Porto     (dynamic)
  "sportingcp",     // Sporting CP  (dynamic)
  // ── Bombo 3 ──────────────────────────────────────────────
  "mon",            // AS Monaco              243
  "mar",            // OM                     243
  "ath",            // Athletic Club          240
  "feyenoord",      // Feyenoord    (dynamic)
  "psv",            // PSV          (dynamic)
  "galatasaray",    // Galatasaray  (dynamic)
  "clubbrugge",     // Club Brugge  (dynamic)
  "fenerbahe",      // Fenerbahçe   (dynamic)
  "fcmidtjylland",  // FC Midtjylland (dynamic)
  // ── Bombo 4 — equipos más modestos ───────────────────────
  "celtic",         // Celtic       (dynamic)
  "rangers",        // Rangers      (dynamic)
  "bscyoungboys",   // BSC Young Boys (dynamic)
  "fkbodglimt",     // FK Bodø/Glimt (dynamic)
  "rbsalzburg",     // RB Salzburg  (dynamic)
  "malmff",         // Malmö FF     (dynamic)
  "legiawarszawa",  // Legia Warszawa (dynamic)
  "fcsb",           // FCSB         (dynamic)
  "runionstg",      // R. Union St.-G. (dynamic)
];

// ============================================================
//  POT ASSIGNMENT — divide 36 teams into 4 pots of 9 by OVR
// ============================================================
export function assignUCLPots(teamIds: string[]): string[][] {
  // If the list matches UCL_SEASON1_IDS exactly (same IDs, any order),
  // use the canonical positional order so pot assignments are stable.
  const canonical = UCL_SEASON1_IDS;
  const inputSet = new Set(teamIds);
  const useCanonical =
    teamIds.length === canonical.length &&
    canonical.every(id => inputSet.has(id));

  const ordered = useCanonical ? canonical : [...teamIds];

  return [
    ordered.slice(0, 9),
    ordered.slice(9, 18),
    ordered.slice(18, 27),
    ordered.slice(27, 36),
  ];
}

// ============================================================
//  MERIT-BASED SELECTION (Season 2+)
//  Uses previous season standings (passed in as parameter)
// ============================================================
export type LeagueSlots = { leagueId: LeagueId; slots: number };

export const UCL_LEAGUE_SLOTS: LeagueSlots[] = [
  { leagueId: "premier",          slots: 4 },
  { leagueId: "laliga",           slots: 4 },
  { leagueId: "seriea",           slots: 4 },
  { leagueId: "bundesliga",       slots: 4 },
  { leagueId: "ligue1",           slots: 3 },
  { leagueId: "ligaportugal",     slots: 2 },
  { leagueId: "trendyolsuperlig", slots: 2 },
  { leagueId: "eredivisie",       slots: 2 },
  { leagueId: "1aproleague",      slots: 2 },
  { leagueId: "scottish",         slots: 2 },
  // 1 champion each
  { leagueId: "superleague",      slots: 1 }, // Switzerland
  { leagueId: "eliteserien",      slots: 1 }, // Norway
  { leagueId: "allsvenskan",      slots: 1 }, // Sweden
  { leagueId: "superliga",        slots: 1 }, // Romania
  { leagueId: "3fSuperliga",      slots: 1 }, // Denmark
  { leagueId: "ekstraklasa",      slots: 1 }, // Poland
  { leagueId: "austrianbundesliga", slots: 1 },
];

/**
 * Select UCL participants based on previous season standings.
 * standings: Record<LeagueId, { teamId: string; points: number }[]> (sorted best first)
 */
export function selectUCLParticipants(
  standings: Record<string, { teamId: string; points: number }[]>
): string[] {
  const selected: string[] = [];
  const used = new Set<string>();

  for (const { leagueId, slots } of UCL_LEAGUE_SLOTS) {
    const leagueTable = standings[leagueId] ?? [];
    let added = 0;
    for (const entry of leagueTable) {
      if (added >= slots) break;
      if (!used.has(entry.teamId)) {
        selected.push(entry.teamId);
        used.add(entry.teamId);
        added++;
      }
    }
  }

  // Pad to 36 if needed (fill with best OVR teams not already selected)
  if (selected.length < 36) {
    const allTeams = getAllTeams().sort((a, b) => {
      const ovrA = a.att + a.mid + a.def;
      const ovrB = b.att + b.mid + b.def;
      return ovrB - ovrA;
    });
    for (const t of allTeams) {
      if (selected.length >= 36) break;
      if (!used.has(t.id)) { selected.push(t.id); used.add(t.id); }
    }
  }

  return selected.slice(0, 36);
}

// ============================================================
//  CALENDAR OFFSETS (days from UCL_START = 2025-07-01)
//  All of July for testing
// ============================================================
export const UCL_START = "2025-07-01";

export const UCL_CALENDAR = {
  leagueDraw:   2,  // Jul 3  → draw modal for swiss phase
  leagueDay:    [3, 4, 5, 6, 7, 8, 9, 10], // Jul 4–11: matchdays 1–8
  playoffDraw:  11, // Jul 12
  playoffLeg1:  12, // Jul 13
  playoffLeg2:  13, // Jul 14
  knockoutDraw: 14, // Jul 15
  r16Leg1:      15, // Jul 16
  r16Leg2:      16, // Jul 17
  qfLeg1:       17, // Jul 18
  qfLeg2:       18, // Jul 19
  sfLeg1:       19, // Jul 20
  sfLeg2:       20, // Jul 21
  final:        21, // Jul 22
};

export function uclDayOffset(isoDate: string): number {
  const start = new Date(UCL_START + "T00:00:00Z").getTime();
  const d = new Date(isoDate + "T00:00:00Z").getTime();
  return Math.floor((d - start) / 86400000);
}

/** UCL matchdays in chronological order (for background simulation catch-up). */
export const UCL_SIMULATION_DAYS: number[] = [
  ...UCL_CALENDAR.leagueDay,
  UCL_CALENDAR.playoffLeg1,
  UCL_CALENDAR.playoffLeg2,
  UCL_CALENDAR.r16Leg1,
  UCL_CALENDAR.r16Leg2,
  UCL_CALENDAR.qfLeg1,
  UCL_CALENDAR.qfLeg2,
  UCL_CALENDAR.sfLeg1,
  UCL_CALENDAR.sfLeg2,
  UCL_CALENDAR.final,
];

export function uclRoundForOffset(offset: number): string | null {
  const li = UCL_CALENDAR.leagueDay.indexOf(offset);
  if (li >= 0) return `Jornada ${li + 1}`;
  if (offset === UCL_CALENDAR.playoffLeg1) return "Playoff-Leg1";
  if (offset === UCL_CALENDAR.playoffLeg2) return "Playoff-Leg2";
  if (offset === UCL_CALENDAR.r16Leg1) return "R16-Leg1";
  if (offset === UCL_CALENDAR.r16Leg2) return "R16-Leg2";
  if (offset === UCL_CALENDAR.qfLeg1) return "QF-Leg1";
  if (offset === UCL_CALENDAR.qfLeg2) return "QF-Leg2";
  if (offset === UCL_CALENDAR.sfLeg1) return "SF-Leg1";
  if (offset === UCL_CALENDAR.sfLeg2) return "SF-Leg2";
  if (offset === UCL_CALENDAR.final) return "Final";
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
  return [...table].sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.teamId.localeCompare(b.teamId)
  );
}

// ============================================================
//  APPLY RESULT TO TABLE
// ============================================================
export function applyUCLResult(table: UCLTableEntry[], homeId: string, awayId: string, homeGoals: number, awayGoals: number): UCLTableEntry[] {
  return table.map(e => {
    if (e.teamId === homeId) {
      const w = homeGoals > awayGoals ? 1 : 0;
      const d = homeGoals === awayGoals ? 1 : 0;
      const l = 1 - w - d;
      return { ...e, played: e.played + 1, won: e.won + w, drawn: e.drawn + d, lost: e.lost + l, gf: e.gf + homeGoals, ga: e.ga + awayGoals, gd: e.gd + (homeGoals - awayGoals), points: e.points + w * 3 + d };
    }
    if (e.teamId === awayId) {
      const w = awayGoals > homeGoals ? 1 : 0;
      const d = homeGoals === awayGoals ? 1 : 0;
      const l = 1 - w - d;
      return { ...e, played: e.played + 1, won: e.won + w, drawn: e.drawn + d, lost: e.lost + l, gf: e.gf + awayGoals, ga: e.ga + homeGoals, gd: e.gd + (awayGoals - homeGoals), points: e.points + w * 3 + d };
    }
    return e;
  });
}

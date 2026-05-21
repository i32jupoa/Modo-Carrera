import { LeagueId, TEAMS, teamById, teamsByLeague, LEAGUES, LEAGUES_BY_COUNTRY, Team } from "@/data/teams";
import { Player } from "@/data/players";
import {
  buildDefaultLineups,
  playersStoreInit,
  selectInjuredPlayers,
  selectTopAssisters,
  selectTopScorers,
  usePlayersStore,
} from "@/store/playersStore";
import {
  applyResult,
  emptyStandings,
  Fixture,
  generateLeagueFixtures,
  sortStandings,
  Standing,
} from "@/lib/season";
import { simulateMatch, simulateMatchFast, SimResult, MatchEvent, InjuryEvent } from "@/lib/simulation";
import { buildNextRound, CUP_SCHEDULE, getCupScheduleForSize, initCup, initUCL, UCL_SCHEDULE } from "@/lib/cups";

export type SaveGame = {
  version: 2;
  myTeamId: string;
  myLeague: LeagueId;
  season: string;
  // league
  fixtures: Record<LeagueId, Fixture[]>;
  standings: Record<LeagueId, Standing[]>;
  currentMatchday: Record<LeagueId, number>;
  // lineups per team: ordered XI player ids (EA FC player IDs as strings)
  lineups: Record<string, string[]>;
  // formations per team
  formations: Record<string, string>;
  // cups (per league)
  cupFixtures: Record<LeagueId, Fixture[]>;
  cupChampion: Record<LeagueId, string | null>;
  // cup draw pending state (for user's league only)
  cupDrawPending: { league: LeagueId; round: string; teams: string[] } | null;
  // UCL
  uclFixtures: Fixture[];
  uclChampion: string | null;
};

const STORAGE_KEY = "fcsim:save:v2";
// Dynamically get all league IDs from the LEAGUES object (supports all 45+ leagues)
export const ALL_LEAGUES: LeagueId[] = Object.keys(LEAGUES) as LeagueId[];

type LegacySave = SaveGame & { players?: Record<string, Player> };

export function loadSave(): SaveGame | null {
  if (typeof window === "undefined") return null;
  try {
    // Clear old v1 saves silently
    localStorage.removeItem("fcsim:save:v1");
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacySave;
    if (parsed.version !== 2) return null;

    // MIGRATION: Convert old cupFixtures structure if needed
    // Old structure: cupFixtures keyed by league (each league had its own cup)
    // New structure: cupFixtures keyed by primary league (one cup per country)
    if (parsed.cupFixtures) {
      const countriesWithLeagues = new Map<string, LeagueId[]>();
      for (const lg of Object.keys(LEAGUES) as LeagueId[]) {
        const country = LEAGUES[lg]?.country;
        if (country) {
          if (!countriesWithLeagues.has(country)) {
            countriesWithLeagues.set(country, []);
          }
          countriesWithLeagues.get(country)!.push(lg);
        }
      }

      // Create new cupFixtures structure
      const newCupFixtures: Record<LeagueId, Fixture[]> = {} as never;
      const newCupChampion: Record<LeagueId, string | null> = {} as never;

      for (const [country, leaguesInCountry] of countriesWithLeagues) {
        const primaryLeague = leaguesInCountry[0];
        
        // Merge cup fixtures from all leagues in this country
        let allFixtures: Fixture[] = [];
        for (const lg of leaguesInCountry) {
          const leagueFixtures = parsed.cupFixtures[lg];
          if (leagueFixtures) {
            allFixtures = [...allFixtures, ...leagueFixtures];
          }
        }
        
        newCupFixtures[primaryLeague] = allFixtures;
        newCupChampion[primaryLeague] = null;
      }

      parsed.cupFixtures = newCupFixtures;
      parsed.cupChampion = newCupChampion;
    }

    playersStoreInit();
    const ps = usePlayersStore.getState();

    if (parsed.players && Object.keys(parsed.players).length > 0) {
      ps.importLegacyStats(parsed.players);
      parsed.lineups = buildDefaultLineups();
      delete parsed.players;
      const migrated = parsed as SaveGame;
      saveSave(migrated);
      return migrated;
    }

    const save = parsed as SaveGame;
    // Save the migrated structure
    saveSave(save);
    return save;
  } catch (err) {
    console.error("Error loading save:", err);
    return null;
  }
}

export function saveSave(s: SaveGame) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearSave() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  usePlayersStore.getState().resetAllStats();
  usePlayersStore.getState().clear();
}

export function newSave(myTeamId: string): SaveGame {
  const team = teamById(myTeamId);
  if (!team || team.id !== myTeamId) throw new Error("Equipo no encontrado");

  playersStoreInit();
  usePlayersStore.getState().resetAllStats();
  usePlayersStore.getState().resetGameDate();
  usePlayersStore.getState().setMyTeam(myTeamId, { resetBudget: true });
  usePlayersStore.getState().generateLeagueSchedule(myTeamId, team.league);
  const lineups = buildDefaultLineups();

  const fixtures: Record<LeagueId, Fixture[]> = {} as never;
  const standings: Record<LeagueId, Standing[]> = {} as never;
  const currentMatchday: Record<LeagueId, number> = {} as never;
  const cupFixtures: Record<LeagueId, Fixture[]> = {} as never;
  const cupChampion: Record<LeagueId, string | null> = {} as never;
  const formations: Record<string, string> = {} as never;

  // Generate fixtures for ALL leagues dynamically, not just Big 5
  const allLeagues = Object.keys(LEAGUES) as LeagueId[];
  for (const lg of allLeagues) {
    fixtures[lg] = generateLeagueFixtures(lg);
    standings[lg] = emptyStandings(lg);
    currentMatchday[lg] = 1;
  }

  // Generate cups BY COUNTRY (not by league) - Domestic cups aggregate all teams from all leagues within the same country
  // We use the league ID as the key, but only create one cup per country
  const countriesWithLeagues = new Map<string, LeagueId[]>();
  for (const lg of allLeagues) {
    const country = LEAGUES[lg]?.country;
    if (country) {
      if (!countriesWithLeagues.has(country)) {
        countriesWithLeagues.set(country, []);
      }
      countriesWithLeagues.get(country)!.push(lg);
    }
  }

  for (const [country, leaguesInCountry] of countriesWithLeagues) {
    try {
      // Use the first league in the country as the key for the cup
      const primaryLeague = leaguesInCountry[0];
      
      // Get all teams from all leagues in this country
      let allTeams: typeof TEAMS = [];
      for (const lg of leaguesInCountry) {
        const leagueTeams = teamsByLeague(lg);
        allTeams = [...allTeams, ...leagueTeams];
      }

      // Sort by rating and take top 32 (or appropriate size)
      const sortedTeams = allTeams.slice().sort((a, b) => (b.att + b.mid + b.def) - (a.att + a.mid + a.def));
      const teamCount = sortedTeams.length;
      let cupSize = 32; // default for national cups
      if (teamCount < 4) cupSize = 2;      // 2-team final only (very small countries)
      else if (teamCount < 8) cupSize = 4;  // SF + Final
      else if (teamCount < 16) cupSize = 8; // QF + SF + Final
      else if (teamCount < 32) cupSize = 16; // R16 + QF + SF + Final
      else cupSize = 32; // R32 + R16 + QF + SF + Final

      const cupTeams = sortedTeams.slice(0, cupSize);
      const participants = cupTeams.map(t => t.id);

      // DO NOT create fixtures initially - fixtures are only created after the draw
      cupFixtures[primaryLeague] = [];
      cupChampion[primaryLeague] = null;
    } catch (err) {
      console.error(`Error initializing cup for country ${country}:`, err);
      // Fallback: create empty cup for this country
      const primaryLeague = leaguesInCountry[0];
      cupFixtures[primaryLeague] = [];
      cupChampion[primaryLeague] = null;
    }
  }

  const { fixtures: ucl } = initUCL();

  return {
    version: 2,
    myTeamId,
    myLeague: team.league,
    season: "2025/26",
    fixtures, standings, currentMatchday,
    lineups,
    formations,
    cupFixtures, cupChampion,
    cupDrawPending: null,
    uclFixtures: ucl,
    uclChampion: null,
  };
}

/* ============================================================
 *  SIMULATION CORE
 * ============================================================ */

function getStarters(save: SaveGame, teamId: string): Player[] {
  const store = usePlayersStore.getState();
  store.init();
  const team = teamById(teamId);
  if (!team) {
    console.warn(`getStarters: Team not found for ID: ${teamId}`);
    return [];
  }
  const lg = team.league;
  const md = save.currentMatchday[lg] ?? 1;
  return store.getSimXI(teamId, save.lineups[teamId] ?? [], md);
}

export function squadOf(_save: SaveGame, teamId: string): Player[] {
  const store = usePlayersStore.getState();
  store.init();
  return store.getSimSquad(teamId);
}

function applyMatchToStats(save: SaveGame, fixture: Fixture) {
  if (!fixture.result) return;
  const r = fixture.result;
  const store = usePlayersStore.getState();
  const homeXI = getStarters(save, fixture.homeId);
  const awayXI = getStarters(save, fixture.awayId);
  for (const p of [...homeXI, ...awayXI]) {
    store.recordAppearance(p.id);
  }
  for (const ev of r.events) {
    store.recordGoal(ev.scorerId);
    if (ev.assistId) store.recordAssist(ev.assistId);
  }
  for (const inj of r.injuries) {
    const p = store.getSimPlayer(inj.playerId);
    if (!p) continue;
    const teamLeague = teamById(p.teamId).league;
    store.recordInjury(
      inj.playerId,
      save.currentMatchday[teamLeague] + inj.weeks,
      inj.reason,
    );
  }
}

function simulateFixtureInline(save: SaveGame, fixture: Fixture, fast = false): Fixture {
  if (fixture.result) return fixture;
  const home = teamById(fixture.homeId);
  const away = teamById(fixture.awayId);
  if (!home || !away) {
    console.warn(`simulateFixtureInline: Team not found for fixture ${fixture.id}`, { homeId: fixture.homeId, awayId: fixture.awayId, home, away });
    // Return fixture with default result to avoid breaking the simulation
    return { ...fixture, result: { homeGoals: 0, awayGoals: 0, events: [], injuries: [], xgHome: 0, xgAway: 0 } };
  }
  const homeXI = getStarters(save, fixture.homeId);
  const awayXI = getStarters(save, fixture.awayId);
  // If either team has no players, return a default result
  if (homeXI.length === 0 || awayXI.length === 0) {
    console.warn(`simulateFixtureInline: Empty squad for fixture ${fixture.id}`, { homeId: fixture.homeId, awayId: fixture.awayId, homeXI: homeXI.length, awayXI: awayXI.length });
    return { ...fixture, result: { homeGoals: 0, awayGoals: 0, events: [], injuries: [], xgHome: 0, xgAway: 0 } };
  }
  // Use fast simulation for bulk matchdays, detailed for user's matches
  const result = fast 
    ? simulateMatchFast(home, away, homeXI, awayXI)
    : simulateMatch(home, away, homeXI, awayXI);
  return { ...fixture, result };
}

/* ============================================================
 *  USER FLOW
 * ============================================================ */

export function getMyNextFixture(save: SaveGame): Fixture | null {
  const lg = save.myLeague;
  return save.fixtures[lg].find(
    (f) => !f.result && f.matchday === save.currentMatchday[lg] &&
      (f.homeId === save.myTeamId || f.awayId === save.myTeamId)
  ) ?? null;
}

export function getMyNextFixtureAny(save: SaveGame): Fixture | null {
  const seasonStart = new Date("2025-08-16T12:00:00Z");
  const allFixtures: Array<{ fixture: Fixture; dateMs: number }> = [];
  
  // Get league fixtures
  for (const lg of Object.keys(save.fixtures)) {
    save.fixtures[lg as LeagueId].forEach(f => {
      if (!f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)) {
        const matchdayDate = new Date(seasonStart.getTime() + (f.matchday - 1) * 7 * 86400000);
        allFixtures.push({ fixture: f, dateMs: matchdayDate.getTime() });
      }
    });
  }
  
  // Get cup fixtures
  for (const lg of Object.keys(save.cupFixtures)) {
    save.cupFixtures[lg as LeagueId].forEach(f => {
      if (!f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)) {
        const matchdayDate = new Date(seasonStart.getTime() + (f.matchday - 1) * 7 * 86400000);
        const cupMatchDate = new Date(matchdayDate.getTime() + 3 * 86400000);
        allFixtures.push({ fixture: f, dateMs: cupMatchDate.getTime() });
      }
    });
  }
  
  // Get UCL fixtures
  if (save.uclFixtures) {
    save.uclFixtures.forEach(f => {
      if (!f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)) {
        const matchdayDate = new Date(seasonStart.getTime() + (f.matchday - 1) * 7 * 86400000);
        allFixtures.push({ fixture: f, dateMs: matchdayDate.getTime() });
      }
    });
  }
  
  // Sort by date and return the first one
  allFixtures.sort((a, b) => a.dateMs - b.dateMs);
  return allFixtures[0]?.fixture ?? null;
}


export function getMyUpcomingCupFixtures(save: SaveGame): Fixture[] {
  const out: Fixture[] = [];
  const leagueMd = save.currentMatchday[save.myLeague];
  
  try {
    // Get the primary league for the user's country (the league that holds the cup)
    const userCountry = LEAGUES[save.myLeague]?.country;
    const primaryLeague = userCountry ? Object.keys(LEAGUES).find(lg => LEAGUES[lg]?.country === userCountry) : save.myLeague;
    const cupKey = (primaryLeague || save.myLeague) as LeagueId;
    
    // Define cup schedule with draw matchdays
    const cupSchedule = [
      { round: "R32", drawMatchday: 1 },
      { round: "R16", drawMatchday: 5 },
      { round: "QF", drawMatchday: 9 },
      { round: "SF", drawMatchday: 14 },
      { round: "Final", drawMatchday: 19 },
    ];
    
    // Only show fixtures for rounds that have been drawn (current matchday >= draw matchday)
    const cupFixtures = save.cupFixtures[cupKey]?.filter(
      (f) => !f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)
    ) || [];
    
    const visibleCupFixtures = cupFixtures.filter(f => {
      if (!f.round) return false;
      const schedule = cupSchedule.find(s => s.round === f.round);
      if (!schedule) return false;
      return leagueMd >= schedule.drawMatchday;
    });
    
    if (visibleCupFixtures.length > 0) {
      out.push(...visibleCupFixtures);
    }
  } catch (err) {
    console.error("Error en getMyUpcomingCupFixtures:", err);
  }
  
  const ucl = save.uclFixtures?.find(
    (f) => !f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)
  );
  if (ucl) out.push(ucl);
  return out;
}

/**
 * Simulate all unplayed cup fixtures for a specific matchday
 */
export function simulateCupMatchday(save: SaveGame, league: LeagueId, matchday: number): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  const cupFixtures = next.cupFixtures[league];
  if (!cupFixtures) return next;

  const roundFixtures = cupFixtures.filter(f => f.matchday === matchday && !f.result);

  for (const f of roundFixtures) {
    const simmed = simulateFixtureInline(next, f);
    const idx = cupFixtures.findIndex(x => x.id === f.id);
    if (idx >= 0) {
      cupFixtures[idx] = simmed;
      applyMatchToStats(next, simmed);
    }
  }

  // Process cup draws after simulating matches
  processCupDrawsOnly(next, league);

  return next;
}

/**
 * Simulate all remaining Cup fixtures for a specific round across ALL active countries
 * This is used after the user plays a Cup match to simulate AI vs AI matches
 * Uses the EXACT same logic format as league matchday simulations:
 * - VIP countries (Big 5 + Belgium + Netherlands + Portugal + Turkey + user's country): detailed simulation
 * - Background countries: O(1) mathematical simulation
 */
export async function simulateRemainingCupMatches(save: SaveGame, currentRound: string): Promise<SaveGame> {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  const userLeague = next.myLeague;
  
  // Get all leagues that have cup fixtures
  const allLeagues = Object.keys(next.cupFixtures) as LeagueId[];
  
  for (const lg of allLeagues) {
    const cupFixtures = next.cupFixtures[lg];
    if (!cupFixtures) continue;
    
    // Determine if this league/country is VIP (active) - MIRRORS league logic
    const isVIP = isVIPLeague(lg, userLeague);
    
    // Get fixtures for the current round that don't have results
    const roundFixtures = cupFixtures.filter(f => f.round === currentRound && !f.result);
    
    for (const f of roundFixtures) {
      // Skip if this is the user's team (already played)
      if (f.homeId === next.myTeamId || f.awayId === next.myTeamId) continue;
      
      const home = teamById(f.homeId);
      const away = teamById(f.awayId);
      
      if (!home || !away) continue;
      
      let result: SimResult;
      
      if (isVIP) {
        // DEEP SIMULATION for VIP countries - EXACT same logic as league VIP matches
        const homeXI = getStarters(next, f.homeId);
        const awayXI = getStarters(next, f.awayId);
        
        if (homeXI.length === 0 || awayXI.length === 0) {
          console.warn(`Empty squad for VIP cup fixture ${f.id}: ${f.homeId} (${homeXI.length}) vs ${f.awayId} (${awayXI.length})`);
          result = { homeGoals: 0, awayGoals: 0, events: [], injuries: [], xgHome: 0, xgAway: 0 };
        } else {
          result = simulateMatch(home, away, homeXI, awayXI);
          applyMatchToStats(next, { ...f, result });
        }
      } else {
        // O(1) MATH SIMULATION for background countries - EXACT same logic as league background matches
        result = generateFakeMatchResult(home, away);
        // No stats recording for background countries to save time (same as league)
      }
      
      // Apply result to cup fixtures
      const idx = cupFixtures.findIndex(x => x.id === f.id);
      if (idx >= 0) {
        cupFixtures[idx] = { ...f, result };
      } else {
        console.warn(`Cup fixture not found in array: ${f.id} in league ${lg}`);
      }
    }
  }
  
  // Process cup draws after simulating matches (advance bracket)
  for (const lg of allLeagues) {
    processCupDrawsOnly(next, lg);
  }
  
  return next;
}

/**
 * Simulate all unplayed UCL fixtures for a specific matchday
 */
export function simulateUCLMatchday(save: SaveGame, matchday: number): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  if (!next.uclFixtures) return next;
  
  const matchdayFixtures = next.uclFixtures.filter(f => f.matchday === matchday && !f.result);
  
  for (const f of matchdayFixtures) {
    const simmed = simulateFixtureInline(next, f);
    const idx = next.uclFixtures.findIndex(x => x.id === f.id);
    if (idx >= 0) {
      next.uclFixtures[idx] = simmed;
      applyMatchToStats(next, simmed);
    }
  }
  
  // Note: UCL draws are not implemented yet, but could be added here in the future
  
  return next;
}

/**
 * Play a specific fixture by ID: simulate just my game, leave the rest of the matchday open.
 */
export function playSpecificFixture(save: SaveGame, fixtureId: string): { save: SaveGame; fixture: Fixture | null } {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  
  // Try to find fixture in league fixtures
  let fixture = next.fixtures[next.myLeague].find(f => f.id === fixtureId);
  if (fixture && !fixture.result) {
    const simmed = simulateFixtureInline(next, fixture);
    const idx = next.fixtures[next.myLeague].findIndex((x) => x.id === fixtureId);
    if (idx >= 0) {
      next.fixtures[next.myLeague][idx] = simmed;
      next.standings[next.myLeague] = applyResult(next.standings[next.myLeague], simmed);
      applyMatchToStats(next, simmed);
    }
    return { save: next, fixture: simmed };
  }
  
  // Try to find fixture in cup fixtures
  for (const lg of Object.keys(next.cupFixtures)) {
    fixture = next.cupFixtures[lg as LeagueId].find(f => f.id === fixtureId);
    if (fixture && !fixture.result) {
      const simmed = simulateFixtureInline(next, fixture);
      const idx = next.cupFixtures[lg as LeagueId].findIndex((x) => x.id === fixtureId);
      if (idx >= 0) {
        next.cupFixtures[lg as LeagueId][idx] = simmed;
        applyMatchToStats(next, simmed);
      }
      return { save: next, fixture: simmed };
    }
  }
  
  // Try to find fixture in UCL fixtures
  if (next.uclFixtures) {
    fixture = next.uclFixtures.find(f => f.id === fixtureId);
    if (fixture && !fixture.result) {
      const simmed = simulateFixtureInline(next, fixture);
      const idx = next.uclFixtures.findIndex((x) => x.id === fixtureId);
      if (idx >= 0) {
        next.uclFixtures[idx] = simmed;
        applyMatchToStats(next, simmed);
      }
      return { save: next, fixture: simmed };
    }
  }
  
  return { save: next, fixture: null };
}

/**
 * Play my next league match: simulate just my game, leave the rest of the matchday open.
 */
export function playMyNextMatch(save: SaveGame): { save: SaveGame; fixture: Fixture | null } {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  const my = getMyNextFixture(next);
  if (!my) return { save: next, fixture: null };
  const simmed = simulateFixtureInline(next, my);
  const idx = next.fixtures[next.myLeague].findIndex((x) => x.id === my.id);
  next.fixtures[next.myLeague][idx] = simmed;
  next.standings[next.myLeague] = applyResult(next.standings[next.myLeague], simmed);
  applyMatchToStats(next, simmed);
  return { save: next, fixture: simmed };
}

/**
 * Play my next cup match: simulate just my cup game.
 */
export function playMyNextCupMatch(save: SaveGame): { save: SaveGame; fixture: Fixture | null } {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  const myCupFixtures = getMyUpcomingCupFixtures(next).filter(f => f.competition === "cup");
  if (myCupFixtures.length === 0) return { save: next, fixture: null };
  
  const my = myCupFixtures[0];
  const simmed = simulateFixtureInline(next, my);
  const idx = next.cupFixtures[next.myLeague].findIndex((x) => x.id === my.id);
  next.cupFixtures[next.myLeague][idx] = simmed;
  applyMatchToStats(next, simmed);
  return { save: next, fixture: simmed };
}

// Fast synchronous version for UI responsiveness - only simulates essential leagues
export function finishMatchdayFast(save: SaveGame, leaguesToSim?: LeagueId[]): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  const targetLeagues = leaguesToSim || [save.myLeague];

  for (const lg of targetLeagues) {
    const md = next.currentMatchday[lg];
    const remaining = next.fixtures[lg]?.filter((f) => f.matchday === md && !f.result) || [];
    
    for (const f of remaining) {
      // Use fast simulation mode for all matches in fast mode
      const sim = simulateFixtureInline(next, f, true);
      const idx = next.fixtures[lg].findIndex((x) => x.id === f.id);
      if (idx >= 0) next.fixtures[lg][idx] = sim;
      next.standings[lg] = applyResult(next.standings[lg], sim);
      applyMatchToStats(next, sim);
    }
    next.currentMatchday[lg] = md + 1;
  }

  // Advance cup for simulated leagues only
  for (const cupLg of targetLeagues) {
    advanceCupForLeague(next, cupLg);
  }
  
  if (targetLeagues.includes(save.myLeague)) {
    advanceUCL(next);
  }

  return next;
}

// ULTRA-FAST: Generate fake but realistic match result (no squad lookup, O(1))
function generateFakeMatchResult(home: Team, away: Team): SimResult {
  const homeOvr = (home.att + home.mid + home.def) / 3;
  const awayOvr = (away.att + away.mid + away.def) / 3;
  const diff = homeOvr - awayOvr;
  
  // Simple RNG
  const rng = () => Math.floor(Math.random() * 4) - 1;
  
  // Base goals
  let homeGoals = Math.max(0, Math.round(1.2 + diff * 0.03 + rng() * 0.5));
  let awayGoals = Math.max(0, Math.round(1.0 - diff * 0.03 + rng() * 0.5));
  
  homeGoals = Math.min(homeGoals, 6);
  awayGoals = Math.min(awayGoals, 5);
  
  // Minimal events - just result, no individual scorers
  return { 
    homeGoals, 
    awayGoals, 
    events: [], // No events - we'll fake stats in batch at the end
    injuries: [], 
    xgHome: homeGoals * 0.85, 
    xgAway: awayGoals * 0.85 
  };
}

// Ultra-fast fake stats generation - simplified for speed
function generateFakeStatsForBackgroundLeagues(save: SaveGame, leagues: LeagueId[]) {
  const store = usePlayersStore.getState();
  
  // Limit stats generation to keep it fast
  const MAX_PLAYERS_PER_LEAGUE = 50;
  
  for (const lg of leagues) {
    const matchday = save.currentMatchday[lg];
    if (matchday <= 2) continue; // Skip early matchdays
    
    const leagueTeamsList = teamsByLeague(lg);
    let playersProcessed = 0;
    
    for (const team of leagueTeamsList) {
      if (playersProcessed >= MAX_PLAYERS_PER_LEAGUE) break;
      
      const squad = store.getSimSquad(team.id);
      if (squad.length === 0) continue;
      
      const gamesPlayed = matchday - 1;
      
      // Only process top players (faster)
      const topPlayers = squad.slice(0, 5);
      
      for (const player of topPlayers) {
        if (playersProcessed >= MAX_PLAYERS_PER_LEAGUE) break;
        if (player.position === "GK") {
          store.recordAppearance(player.id);
          playersProcessed++;
          continue;
        }
        
        // Simple stat generation
        const goalProb = player.position === "FWD" ? 0.5 : player.position === "MID" ? 0.2 : 0.05;
        const expectedGoals = Math.floor(gamesPlayed * goalProb * (player.rating / 80));
        const goals = Math.min(expectedGoals, gamesPlayed);
        const assists = Math.floor(goals * 0.6);
        const appearances = Math.max(goals, Math.min(gamesPlayed, 5));
        
        // Batch record (single calls)
        if (appearances > 0) store.recordAppearance(player.id);
        for (let g = 0; g < Math.min(goals, 3); g++) store.recordGoal(player.id);
        for (let a = 0; a < Math.min(assists, 2); a++) store.recordAssist(player.id);
        
        playersProcessed++;
      }
    }
  }
}

// Big 5 European leagues for VIP deep simulation
const BIG5_LEAGUES: LeagueId[] = ["laliga", "premier", "seriea", "bundesliga", "ligue1"];

// Additional important leagues for VIP deep simulation
const IMPORTANT_LEAGUES: LeagueId[] = ["ligaportugal", "1aproleague", "eredivisie", "trendyolsperlig"];

function isVIPLeague(leagueId: LeagueId, userLeague: LeagueId): boolean {
  return leagueId === userLeague || BIG5_LEAGUES.includes(leagueId) || IMPORTANT_LEAGUES.includes(leagueId);
}

// Generate realistic player stats for O(1) leagues based on match results (OPTIMIZED)
export function generateRealisticStatsForO1Leagues(save: SaveGame, o1Leagues: LeagueId[], maxMatchday?: number, startMatchday?: number) {
  const store = usePlayersStore.getState();
  
  for (const lg of o1Leagues) {
    const currentMatchday = save.currentMatchday[lg] - 1; // Current matchday just finished
    if (currentMatchday < 1) continue;
    
    // Limit to the user's current matchday to keep stats in sync
    const limitMatchday = maxMatchday ? Math.min(currentMatchday, maxMatchday) : currentMatchday;
    
    // Start from the specified matchday (or 1 if not specified)
    const startFrom = startMatchday || 1;
    
    // Process matchdays from startFrom to limitMatchday
    for (let md = startFrom; md <= limitMatchday; md++) {
      const leagueFixtures = save.fixtures[lg].filter(f => f.matchday === md && f.result);
      if (leagueFixtures.length === 0) continue;
      
      // Batch process all fixtures in this matchday
      const allPlayersToRecord = new Map<string, Player[]>(); // teamId -> players
      
      // First pass: collect all players who played
      for (const fixture of leagueFixtures) {
        const homeTeam = teamById(fixture.homeId);
        const awayTeam = teamById(fixture.awayId);
        if (!homeTeam || !awayTeam) continue;
        
        const homeSquad = store.getSimSquad(homeTeam.id);
        const awaySquad = store.getSimSquad(awayTeam.id);
        
        // Quick selection without detailed formation constraints for speed
        const selectMatchPlayers = (squad: Player[]): Player[] => {
          const gks = squad.filter(p => p.position === "GK").slice(0, 1);
          const defs = squad.filter(p => p.position === "DEF").slice(0, 4);
          const mids = squad.filter(p => p.position === "MID").slice(0, 4);
          const fwds = squad.filter(p => p.position === "FWD").slice(0, 2);
          let players = [...gks, ...defs, ...mids, ...fwds];
          if (players.length < 11) {
            const remaining = squad.filter(p => !players.includes(p));
            players = [...players, ...remaining.slice(0, 11 - players.length)];
          }
          return players.slice(0, 11);
        };
        
        const homePlayers = selectMatchPlayers(homeSquad);
        const awayPlayers = selectMatchPlayers(awaySquad);
        
        allPlayersToRecord.set(homeTeam.id, homePlayers);
        allPlayersToRecord.set(awayTeam.id, awayPlayers);
      }
      
      // Second pass: record appearances (batch)
      for (const [teamId, players] of allPlayersToRecord) {
        for (const player of players) {
          store.recordAppearance(player.id);
        }
      }
      
      // Third pass: generate injuries (6% chance per team)
      for (const [teamId, players] of allPlayersToRecord) {
        if (Math.random() > 0.06) continue;
        const victim = players[Math.floor(Math.random() * players.length)];
        const weeks = 1 + Math.floor(Math.random() * 5);
        const reasons = ["Muscular", "Rodilla", "Tobillo", "Lesión menor", "Fatiga"];
        const reason = reasons[Math.floor(Math.random() * reasons.length)];
        store.recordInjury(victim.id, md + weeks, reason);
      }
      
      // Fourth pass: assign goals and assists based on fixture results
      for (const fixture of leagueFixtures) {
        if (!fixture.result) continue;
        
        const homePlayers = allPlayersToRecord.get(fixture.homeId) || [];
        const awayPlayers = allPlayersToRecord.get(fixture.awayId) || [];
        
        if (homePlayers.length === 0 || awayPlayers.length === 0) continue;
        
        const assignGoals = (teamGoals: number, players: Player[]) => {
          const forwards = players.filter(p => p.position === "FWD");
          const mids = players.filter(p => p.position === "MID");
          const defs = players.filter(p => p.position === "DEF");
          
          for (let i = 0; i < teamGoals; i++) {
            const rand = Math.random();
            let scorer: Player | undefined;
            
            if (rand < 0.70 && forwards.length > 0) {
              scorer = forwards[Math.floor(Math.random() * forwards.length)];
            } else if (rand < 0.95 && mids.length > 0) {
              scorer = mids[Math.floor(Math.random() * mids.length)];
            } else if (defs.length > 0) {
              scorer = defs[Math.floor(Math.random() * defs.length)];
            }
            
            if (scorer) store.recordGoal(scorer.id);
          }
        };
        
        const assignAssists = (teamGoals: number, players: Player[]) => {
          const mids = players.filter(p => p.position === "MID");
          const forwards = players.filter(p => p.position === "FWD");
          const assists = Math.floor(teamGoals * 0.7);
          
          for (let i = 0; i < assists; i++) {
            const rand = Math.random();
            let assister: Player | undefined;
            
            if (rand < 0.60 && mids.length > 0) {
              assister = mids[Math.floor(Math.random() * mids.length)];
            } else if (forwards.length > 0) {
              assister = forwards[Math.floor(Math.random() * forwards.length)];
            }
            
            if (assister) store.recordAssist(assister.id);
          }
        };
        
        assignGoals(fixture.result.homeGoals, homePlayers);
        assignGoals(fixture.result.awayGoals, awayPlayers);
        assignAssists(fixture.result.homeGoals, homePlayers);
        assignAssists(fixture.result.awayGoals, awayPlayers);
      }
    }
  }
}

/**
 * LAYERED SIMULATION - MAXIMUM PERFORMANCE:
 * - VIP Leagues (Big 5 + User's league): Deep simulation
 * - Background Leagues: O(1) fast math only
 * - Ultra-small batches with forced UI updates
 */
export async function advanceMatchdayLayered(save: SaveGame, onProgress?: (processed: number, total: number) => void): Promise<SaveGame> {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  const BATCH_SIZE = 100; // Larger batches since we're using O(1) math for background leagues
  
  const userLeague = next.myLeague;
  const backgroundLeagues: LeagueId[] = [];
  const allFixtures: { fixture: Fixture; league: LeagueId; isVIP: boolean }[] = [];
  
  // Collect fixtures
  for (const lg of Object.keys(next.fixtures) as LeagueId[]) {
    const md = next.currentMatchday[lg];
    const fixtures = next.fixtures[lg].filter(f => f.matchday === md && !f.result);
    const isVIP = isVIPLeague(lg, userLeague);
    if (!isVIP && fixtures.length > 0) backgroundLeagues.push(lg);
    for (const f of fixtures) {
      allFixtures.push({ fixture: f, league: lg, isVIP });
    }
  }
  
  console.log(`advanceMatchdayLayered: Total fixtures to simulate: ${allFixtures.length}`);
  console.log(`advanceMatchdayLayered: Leagues with fixtures:`, [...new Set(allFixtures.map(f => f.league))]);
  
  const totalMatches = allFixtures.length;
  let processed = 0;
  
  // Process in batches with yield control
  for (let i = 0; i < allFixtures.length; i += BATCH_SIZE) {
    const batch = allFixtures.slice(i, i + BATCH_SIZE);
    
    // Process this batch synchronously (fast)
    for (const { fixture, league, isVIP } of batch) {
      const home = teamById(fixture.homeId);
      const away = teamById(fixture.awayId);
      if (!home || !away) continue;
      
      let result: SimResult;
      
      if (isVIP) {
        // DEEP SIMULATION for VIP leagues only
        const homeXI = getStarters(next, fixture.homeId);
        const awayXI = getStarters(next, fixture.awayId);
        
        if (homeXI.length === 0 || awayXI.length === 0) {
          console.warn(`Empty squad for VIP fixture ${fixture.id}: ${fixture.homeId} (${homeXI.length}) vs ${fixture.awayId} (${awayXI.length})`);
          result = { homeGoals: 0, awayGoals: 0, events: [], injuries: [], xgHome: 0, xgAway: 0 };
        } else {
          result = simulateMatch(home, away, homeXI, awayXI);
          applyMatchToStats(next, { ...fixture, result });
        }
      } else {
        // O(1) MATH SIMULATION for background leagues (ULTRA FAST)
        result = generateFakeMatchResult(home, away);
        // No stats recording for background leagues to save time
      }
      
      // Apply result
      const idx = next.fixtures[league].findIndex(x => x.id === fixture.id);
      if (idx >= 0) {
        next.fixtures[league][idx] = { ...fixture, result };
        next.standings[league] = applyResult(next.standings[league], next.fixtures[league][idx]);
      } else {
        console.warn(`Fixture not found in array: ${fixture.id} in league ${league}`);
      }
      
      processed++;
    }
    
    // Advance matchday counters
    const leaguesInBatch = new Set(batch.map(b => b.league));
    for (const lg of leaguesInBatch) {
      next.currentMatchday[lg]++;
    }
    
    // Update progress
    onProgress?.(processed, totalMatches);
    
    // Yield control every few batches to prevent UI blocking
    if (i % (BATCH_SIZE * 2) === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  console.log(`advanceMatchdayLayered: Completed. Processed ${processed}/${totalMatches} matches`);
  
  // Process cup draws without simulating matches
  console.time('processCupDraws');
  const cupLeagues = Object.keys(next.cupFixtures) as LeagueId[];
  for (const cupLg of cupLeagues) {
    processCupDrawsOnly(next, cupLg);
  }
  console.timeEnd('processCupDraws');
  
  return next;
}

/**
 * Legacy function - kept for compatibility.
 * Use advanceMatchdayLayered for better performance.
 */
export async function finishMatchday(save: SaveGame, onProgress?: (leaguesDone: number, total: number) => void): Promise<SaveGame> {
  return advanceMatchdayLayered(save, onProgress);
}

/**
 * Process cup draws without simulating matches
 * This is called when advancing league matchdays to trigger draw notifications
 */
function processCupDrawsOnly(save: SaveGame, lg: LeagueId) {
  const list = save.cupFixtures[lg];
  if (!list) return; // No cup for this league
  
  const leagueMd = save.currentMatchday[lg];
  const isUserLeague = lg === save.myLeague;
  
  // Define cup schedule with draw matchdays
  const cupSchedule = [
    { round: "R32", matchday: 2, drawMatchday: 1 },
    { round: "R16", matchday: 6, drawMatchday: 5 },
    { round: "QF", matchday: 10, drawMatchday: 9 },
    { round: "SF", matchday: 15, drawMatchday: 14 },
    { round: "Final", matchday: 20, drawMatchday: 19 },
  ];
  
  // Special case: if no fixtures exist yet, trigger first round draw
  if (list.length === 0 && isUserLeague && !save.cupDrawPending) {
    const firstRound = cupSchedule[0]; // R32
    if (leagueMd >= firstRound.drawMatchday) {
      // Get participants from the league's teams (all teams in the cup)
      const teams = teamsByLeague(lg);
      const country = LEAGUES[lg]?.country;
      if (country) {
        const countryLeagues = LEAGUES_BY_COUNTRY[country] || [];
        const secondDivisions = countryLeagues.filter(l => l.id !== lg);
        for (const secondLeague of secondDivisions) {
          const secondDivTeams = teamsByLeague(secondLeague.id as LeagueId);
          teams.push(...secondDivTeams);
        }
      }
      
      // Sort by rating and take top 32 (or appropriate size)
      const sortedTeams = teams.slice().sort((a, b) => (b.att + b.mid + b.def) - (a.att + a.mid + a.def));
      const cupSize = sortedTeams.length >= 32 ? 32 : sortedTeams.length >= 16 ? 16 : sortedTeams.length >= 8 ? 8 : sortedTeams.length >= 4 ? 4 : 2;
      const cupTeams = sortedTeams.slice(0, cupSize).map(t => t.id);
      
      save.cupDrawPending = { league: lg, round: firstRound.round, teams: cupTeams };
      return;
    }
  }
  
  // Get unique rounds that exist in this cup and sort them in order
  const roundOrder = ["R32", "R16", "QF", "SF", "Final"];
  const existingRounds = [...new Set(list.map(f => f.round).filter((r): r is string => !!r))];
  const sortedRounds = existingRounds.sort((a, b) => 
    roundOrder.indexOf(a) - roundOrder.indexOf(b)
  );
  
  // Build dynamic schedule based on existing rounds
  const dynamicSchedule = sortedRounds.map((round, idx) => {
    const schedule = cupSchedule.find(s => s.round === round);
    if (!schedule) return null;
    return { matchday: schedule.matchday, round, size: 0, drawMatchday: schedule.drawMatchday };
  }).filter(Boolean) as Array<{ matchday: number; round: string; size: number; drawMatchday: number }>;
  
  for (let roundIdx = 0; roundIdx < dynamicSchedule.length; roundIdx++) {
    const step = dynamicSchedule[roundIdx];
    const roundFixtures = list.filter((f) => f.round === step.round);
    if (roundFixtures.length === 0) continue;
    
    // Check if we've reached the draw matchday for the NEXT round (if current round is complete)
    const playedAll = roundFixtures.every((f) => f.result);
    const nextStep = cupSchedule[roundIdx + 1];
    
    if (playedAll && nextStep && isUserLeague) {
      // If current round is complete and we've reached the draw matchday for next round
      // Skip draw for Final - auto-assign the final matchup
      if (nextStep.round === "Final" && leagueMd >= nextStep.drawMatchday) {
        const winners = roundFixtures
          .map((f) => {
            if (!f.result) return f.homeId;
            return f.result.homeGoals >= f.result.awayGoals ? f.homeId : f.awayId;
          });
        // Auto-create final fixture without draw
        if (winners.length === 2) {
          const nextStepWithDraw = { matchday: nextStep.matchday, round: nextStep.round, drawMatchday: nextStep.drawMatchday };
          const built = buildNextRound("cup", lg, step.round, winners, nextStepWithDraw, roundIdx + 1);
          list.push(...built);
        }
      } else if (leagueMd >= nextStep.drawMatchday && !save.cupDrawPending) {
        // Set cup draw pending - this will halt simulation and show modal
        const winners = roundFixtures
          .map((f) => {
            if (!f.result) return f.homeId;
            return f.result.homeGoals >= f.result.awayGoals ? f.homeId : f.awayId;
          });
        save.cupDrawPending = { league: lg, round: nextStep.round, teams: winners };
        return; // Halt simulation for user's league
      }
    }
  }
}

function advanceCupForLeague(save: SaveGame, lg: LeagueId) {
  const list = save.cupFixtures[lg];
  if (!list) return; // No cup for this league
  
  const leagueMd = save.currentMatchday[lg];
  const isUserLeague = lg === save.myLeague;
  
  // Define cup schedule with draw matchdays
  const cupSchedule = [
    { round: "R32", matchday: 2, drawMatchday: 1 },
    { round: "R16", matchday: 6, drawMatchday: 5 },
    { round: "QF", matchday: 10, drawMatchday: 9 },
    { round: "SF", matchday: 15, drawMatchday: 14 },
    { round: "Final", matchday: 20, drawMatchday: 19 },
  ];
  
  // Special case: if no fixtures exist yet, trigger first round draw
  if (list.length === 0 && isUserLeague && !save.cupDrawPending) {
    const firstRound = cupSchedule[0]; // R32
    if (leagueMd >= firstRound.drawMatchday) {
      // Get participants from the league's teams (all teams in the cup)
      // We need to get the participants - they should be stored somewhere
      // For now, we'll use all teams from the league (and second division if applicable)
      const teams = teamsByLeague(lg);
      const country = LEAGUES[lg]?.country;
      if (country) {
        const countryLeagues = LEAGUES_BY_COUNTRY[country] || [];
        const secondDivisions = countryLeagues.filter(l => l.id !== lg);
        for (const secondLeague of secondDivisions) {
          const secondDivTeams = teamsByLeague(secondLeague.id as LeagueId);
          teams.push(...secondDivTeams);
        }
      }
      
      // Sort by rating and take top 32 (or appropriate size)
      const sortedTeams = teams.slice().sort((a, b) => (b.att + b.mid + b.def) - (a.att + a.mid + a.def));
      const cupSize = sortedTeams.length >= 32 ? 32 : sortedTeams.length >= 16 ? 16 : sortedTeams.length >= 8 ? 8 : sortedTeams.length >= 4 ? 4 : 2;
      const cupTeams = sortedTeams.slice(0, cupSize).map(t => t.id);
      
      save.cupDrawPending = { league: lg, round: firstRound.round, teams: cupTeams };
      return;
    }
  }
  
  // Get unique rounds that exist in this cup and sort them in order
  const roundOrder = ["R32", "R16", "QF", "SF", "Final"];
  const existingRounds = [...new Set(list.map(f => f.round).filter((r): r is string => !!r))];
  const sortedRounds = existingRounds.sort((a, b) => 
    roundOrder.indexOf(a) - roundOrder.indexOf(b)
  );
  
  // Build dynamic schedule based on existing rounds
  const dynamicSchedule = sortedRounds.map((round, idx) => {
    const schedule = cupSchedule.find(s => s.round === round);
    if (!schedule) return null;
    return { matchday: schedule.matchday, round, size: 0, drawMatchday: schedule.drawMatchday };
  }).filter(Boolean) as Array<{ matchday: number; round: string; size: number; drawMatchday: number }>;
  
  for (let roundIdx = 0; roundIdx < dynamicSchedule.length; roundIdx++) {
    const step = dynamicSchedule[roundIdx];
    const roundFixtures = list.filter((f) => f.round === step.round);
    if (roundFixtures.length === 0) continue;
    
    // Check if we've reached the draw matchday for the NEXT round (if current round is complete)
    const playedAll = roundFixtures.every((f) => f.result);
    const nextStep = cupSchedule[roundIdx + 1];
    
    if (playedAll && nextStep && isUserLeague) {
      // If current round is complete and we've reached the draw matchday for next round
      // Skip draw for Final - auto-assign the final matchup
      if (nextStep.round === "Final" && leagueMd >= nextStep.drawMatchday) {
        const winners = roundFixtures
          .map((f) => {
            if (!f.result) return f.homeId;
            return f.result.homeGoals >= f.result.awayGoals ? f.homeId : f.awayId;
          });
        // Auto-create final fixture without draw
        if (winners.length === 2) {
          const nextStepWithDraw = { matchday: nextStep.matchday, round: nextStep.round, drawMatchday: nextStep.drawMatchday };
          const built = buildNextRound("cup", lg, step.round, winners, nextStepWithDraw, roundIdx + 1);
          list.push(...built);
        }
      } else if (leagueMd >= nextStep.drawMatchday && !save.cupDrawPending) {
        // Set cup draw pending - this will halt simulation and show modal
        const winners = roundFixtures
          .map((f) => {
            if (!f.result) return f.homeId;
            return f.result.homeGoals >= f.result.awayGoals ? f.homeId : f.awayId;
          });
        save.cupDrawPending = { league: lg, round: nextStep.round, teams: winners };
        return; // Halt simulation for user's league
      }
    }
    
    if (!playedAll && leagueMd > step.matchday) {
      // sim unplayed
      for (const f of roundFixtures) {
        if (f.result) continue;
        const sim = simulateFixtureInline(save, f);
        const idx = list.findIndex((x) => x.id === f.id);
        if (idx >= 0) list[idx] = sim;
        applyMatchToStats(save, sim);
      }
    }
    
    const playedAllAfterSim = roundFixtures.every((f) => f.result);
    if (playedAllAfterSim) {
      if (!nextStep) {
        // final winner
        const final = list.find((f) => f.round === "Final");
        if (final?.result && !save.cupChampion[lg]) {
          const champ = final.result.homeGoals >= final.result.awayGoals ? final.homeId : final.awayId;
          save.cupChampion[lg] = champ;
        }
        continue;
      }
      const alreadyBuilt = list.some((f) => f.round === nextStep.round);
      if (!alreadyBuilt && !isUserLeague) {
        // For non-user leagues, auto-build next round
        const winners = roundFixtures
          .map((f) => {
            if (!f.result) return f.homeId;
            return f.result.homeGoals >= f.result.awayGoals ? f.homeId : f.awayId;
          });
        const nextStepWithDraw = { matchday: nextStep.matchday, round: nextStep.round, drawMatchday: nextStep.drawMatchday };
        const built = buildNextRound("cup", lg, step.round, winners, nextStepWithDraw, roundIdx + 1);
        list.push(...built);
      }
      // For user's league, we wait for the draw modal to build the next round
    }
  }
}

function advanceUCL(save: SaveGame) {
  const list = save.uclFixtures;
  // UCL "match calendar" tied to user's league matchday (simpler)
  const leagueMd = save.currentMatchday[save.myLeague];
  for (let roundIdx = 0; roundIdx < UCL_SCHEDULE.length; roundIdx++) {
    const step = UCL_SCHEDULE[roundIdx];
    const roundFixtures = list.filter((f) => f.round === step.round);
    if (roundFixtures.length === 0) continue;
    if (leagueMd > step.matchday) {
      for (const f of roundFixtures) {
        if (f.result) continue;
        const sim = simulateFixtureInline(save, f);
        const idx = list.findIndex((x) => x.id === f.id);
        list[idx] = sim;
        applyMatchToStats(save, sim);
      }
    }
    const playedAll = list.filter((f) => f.round === step.round).every((f) => f.result);
    if (playedAll) {
      const next = UCL_SCHEDULE[roundIdx + 1];
      if (!next) {
        const final = list.find((f) => f.round === "Final");
        if (final?.result && !save.uclChampion) {
          save.uclChampion = final.result.homeGoals >= final.result.awayGoals ? final.homeId : final.awayId;
        }
        continue;
      }
      const alreadyBuilt = list.some((f) => f.round === next.round);
      if (!alreadyBuilt) {
        const winners = list
          .filter((f) => f.round === step.round)
          .map((f) => f.result!.homeGoals >= f.result!.awayGoals ? f.homeId : f.awayId);
        const built = buildNextRound("ucl", null, step.round, winners, next, roundIdx + 1);
        list.push(...built);
      }
    }
  }
}

/* ============================================================
 *  SELECTORS
 * ============================================================ */

export function getSortedStandings(save: SaveGame, league: LeagueId): Standing[] {
  return sortStandings(save.standings[league]);
}

export function getMyRecentResults(save: SaveGame, limit = 5): Fixture[] {
  return save.fixtures[save.myLeague]
    .filter((f) => f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId))
    .slice(-limit)
    .reverse();
}

export function getTeamRecentResults(save: SaveGame, teamId: string, leagueId: string, limit = 5): Fixture[] {
  return save.fixtures[leagueId]
    .filter((f) => f.result && (f.homeId === teamId || f.awayId === teamId))
    .slice(-limit)
    .reverse();
}

export function getMatchdayFixtures(save: SaveGame, league: LeagueId, matchday: number): Fixture[] {
  return save.fixtures[league].filter((f) => f.matchday === matchday);
}

export function topScorers(_save: SaveGame, limit = 30, leagueFilter?: LeagueId): Player[] {
  return selectTopScorers(leagueFilter, limit);
}

export function topAssisters(_save: SaveGame, limit = 30, leagueFilter?: LeagueId): Player[] {
  return selectTopAssisters(leagueFilter, limit);
}

export function currentInjuries(save: SaveGame, teamId?: string): Player[] {
  return selectInjuredPlayers(save.currentMatchday, teamId);
}

export function isPlayerInjured(save: SaveGame, playerId: string): boolean {
  const p = usePlayersStore.getState().getSimPlayer(playerId);
  if (!p) return false;
  const lg = teamById(p.teamId).league;
  return p.injuredUntil > save.currentMatchday[lg];
}

export function setLineup(save: SaveGame, teamId: string, xi: string[]): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  next.lineups[teamId] = xi;
  return next;
}

export function setFormation(save: SaveGame, teamId: string, formation: string): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  next.formations[teamId] = formation;
  return next;
}

/**
 * Check if a date has any fixtures within 2 days (before or after)
 */
function hasFixtureConflict(save: SaveGame, date: Date): boolean {
  const dateIso = date.toISOString().split('T')[0];
  const dateObj = new Date(dateIso);
  
  // Check 2 days before and after
  for (let i = -2; i <= 2; i++) {
    const checkDate = new Date(dateObj.getTime() + i * 86400000);
    const checkDateIso = checkDate.toISOString().split('T')[0];
    
    // Check league fixtures
    for (const lg of Object.keys(save.fixtures)) {
      const hasFixture = save.fixtures[lg as LeagueId]?.some(
        f => {
          const fixtureDate = new Date(seasonStartForLeague(lg, f.matchday));
          return fixtureDate.toISOString().split('T')[0] === checkDateIso;
        }
      );
      if (hasFixture) return true;
    }
    
    // Check cup fixtures
    for (const lg of Object.keys(save.cupFixtures)) {
      const hasFixture = save.cupFixtures[lg as LeagueId]?.some(
        f => {
          const fixtureDate = new Date(seasonStartForLeague(lg, f.matchday));
          return fixtureDate.toISOString().split('T')[0] === checkDateIso;
        }
      );
      if (hasFixture) return true;
    }
    
    // Check UCL fixtures
    const hasUclFixture = save.uclFixtures?.some(
      f => {
        const fixtureDate = new Date(seasonStartForLeague(save.myLeague, f.matchday));
        return fixtureDate.toISOString().split('T')[0] === checkDateIso;
      }
    );
    if (hasUclFixture) return true;
  }
  
  return false;
}

function seasonStartForLeague(league: LeagueId, matchday: number): Date {
  const seasonStart = new Date("2025-08-16T12:00:00Z");
  return new Date(seasonStart.getTime() + (matchday - 1) * 7 * 86400000);
}

/**
 * Apply cup draw results - creates fixtures for the next cup round
 * Schedules cup matches intelligently to avoid conflicts with other fixtures
 */
/**
 * Get the current cup round for a league
 */
export function getCurrentCupRound(save: SaveGame, league: LeagueId): string | null {
  const list = save.cupFixtures[league];
  if (!list || list.length === 0) return null;
  
  const roundOrder = ["R32", "R16", "QF", "SF", "Final"];
  const existingRounds = [...new Set(list.map(f => f.round).filter((r): r is string => !!r))];
  const sortedRounds = existingRounds.sort((a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b));
  
  // Find the first round with unplayed fixtures
  for (const round of sortedRounds) {
    const roundFixtures = list.filter(f => f.round === round);
    if (roundFixtures.some(f => !f.result)) {
      return round;
    }
  }
  
  return sortedRounds[sortedRounds.length - 1] || null;
}

/**
 * Automatically draw cup fixtures for foreign countries (VIP leagues)
 * This is called before opening the user's cup draw modal to ensure all AI leagues have their matchups
 */
export function autoDrawForeignCups(save: SaveGame): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  const userLeague = next.myLeague;
  const userCountry = LEAGUES[userLeague]?.country;
  
  // Get all VIP leagues (Big 5 + Belgium + Netherlands + Portugal + Turkey)
  const vipLeagues = [...BIG5_LEAGUES, ...IMPORTANT_LEAGUES] as LeagueId[];
  
  // Filter out the user's league (we handle that interactively)
  const foreignVipLeagues = vipLeagues.filter(lg => lg !== userLeague);
  
  for (const lg of foreignVipLeagues) {
    const country = LEAGUES[lg]?.country;
    if (!country) continue;
    
    // Skip if this is the user's country
    if (country === userCountry) continue;
    
    // Find the primary league for this country (the league that holds the cup)
    const primaryLeague = Object.keys(LEAGUES).find(leagueId => LEAGUES[leagueId]?.country === country) as LeagueId;
    if (!primaryLeague) continue;
    
    const list = next.cupFixtures[primaryLeague];
    if (!list) continue;
    
    const leagueMd = next.currentMatchday[primaryLeague];
    
    // Define cup schedule with draw matchdays
    const cupSchedule = [
      { round: "R32", matchday: 2, drawMatchday: 1 },
      { round: "R16", matchday: 6, drawMatchday: 5 },
      { round: "QF", matchday: 10, drawMatchday: 9 },
      { round: "SF", matchday: 15, drawMatchday: 14 },
      { round: "Final", matchday: 20, drawMatchday: 19 },
    ];
    
    // Special case: if no fixtures exist yet, trigger first round draw
    if (list.length === 0) {
      const firstRound = cupSchedule[0]; // R32
      if (leagueMd >= firstRound.drawMatchday) {
        // Get participants from all leagues in this country
        const countryLeagues = LEAGUES_BY_COUNTRY[country] || [];
        let allTeams: typeof TEAMS = [];
        for (const league of countryLeagues) {
          const leagueTeams = teamsByLeague(league.id as LeagueId);
          allTeams = [...allTeams, ...leagueTeams];
        }
        
        // Sort by rating and take top 32 (or appropriate size)
        const sortedTeams = allTeams.slice().sort((a, b) => (b.att + b.mid + b.def) - (a.att + a.mid + a.def));
        const teamCount = sortedTeams.length;
        let cupSize = 32;
        if (teamCount < 4) cupSize = 2;
        else if (teamCount < 8) cupSize = 4;
        else if (teamCount < 16) cupSize = 8;
        else if (teamCount < 32) cupSize = 16;
        else cupSize = 32;
        
        const cupTeams = sortedTeams.slice(0, cupSize).map(t => t.id);
        
        // Auto-generate matchups by pairing teams randomly
        const shuffled = cupTeams.slice().sort(() => Math.random() - 0.5);
        const matchups: [string, string][] = [];
        for (let i = 0; i < shuffled.length; i += 2) {
          if (i + 1 < shuffled.length) {
            matchups.push([shuffled[i], shuffled[i + 1]]);
          }
        }
        
        // Apply the draw automatically
        if (matchups.length > 0) {
          const drawn = applyCupDraw(next, primaryLeague, firstRound.round, matchups);
          Object.assign(next, drawn);
          console.log(`Auto-drew cup fixtures for ${country} (${firstRound.round}): ${matchups.length} matchups`);
        }
      }
    }
    
    // Get unique rounds that exist in this cup and sort them in order
    const roundOrder = ["R32", "R16", "QF", "SF", "Final"];
    const existingRounds = [...new Set(list.map(f => f.round).filter((r): r is string => !!r))];
    const sortedRounds = existingRounds.sort((a, b) => 
      roundOrder.indexOf(a) - roundOrder.indexOf(b)
    );
    
    // Build dynamic schedule based on existing rounds
    const dynamicSchedule = sortedRounds.map((round, idx) => {
      const schedule = cupSchedule.find(s => s.round === round);
      if (!schedule) return null;
      return { matchday: schedule.matchday, round, size: 0, drawMatchday: schedule.drawMatchday };
    }).filter(Boolean) as Array<{ matchday: number; round: string; size: number; drawMatchday: number }>;
    
    for (let roundIdx = 0; roundIdx < dynamicSchedule.length; roundIdx++) {
      const step = dynamicSchedule[roundIdx];
      const roundFixtures = list.filter((f) => f.round === step.round);
      if (roundFixtures.length === 0) continue;
      
      // Check if we've reached the draw matchday for the NEXT round (if current round is complete)
      const playedAll = roundFixtures.every((f) => f.result);
      const nextStep = cupSchedule[roundIdx + 1];
      
      if (playedAll && nextStep && leagueMd >= nextStep.drawMatchday) {
        // Get winners from current round
        const winners = roundFixtures
          .map((f) => {
            if (!f.result) return f.homeId;
            return f.result.homeGoals >= f.result.awayGoals ? f.homeId : f.awayId;
          });
        
        if (nextStep.round === "Final" && winners.length === 2) {
          // Auto-create final fixture without draw
          const nextStepWithDraw = { matchday: nextStep.matchday, round: nextStep.round, drawMatchday: nextStep.drawMatchday };
          const built = buildNextRound("cup", primaryLeague, step.round, winners, nextStepWithDraw, roundIdx + 1);
          list.push(...built);
          console.log(`Auto-created final fixture for ${country}`);
        } else if (nextStep.round !== "Final" && winners.length >= 2) {
          // Auto-generate matchups for next round
          const shuffled = winners.slice().sort(() => Math.random() - 0.5);
          const matchups: [string, string][] = [];
          for (let i = 0; i < shuffled.length; i += 2) {
            if (i + 1 < shuffled.length) {
              matchups.push([shuffled[i], shuffled[i + 1]]);
            }
          }
          
          if (matchups.length > 0) {
            const drawn = applyCupDraw(next, primaryLeague, nextStep.round, matchups);
            Object.assign(next, drawn);
            console.log(`Auto-drew cup fixtures for ${country} (${nextStep.round}): ${matchups.length} matchups`);
          }
        }
      }
    }
  }
  
  return next;
}

export function applyCupDraw(save: SaveGame, league: LeagueId, round: string, matchups: [string, string][]): SaveGame {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  const list = next.cupFixtures[league];
  
  console.log(`applyCupDraw called for league: ${league}, round: ${round}, matchups: ${matchups.length}`);
  console.log(`cupFixtures keys: ${Object.keys(next.cupFixtures)}`);
  console.log(`list exists: ${!!list}, list length: ${list?.length || 0}`);
  
  if (!list) {
    console.error(`Cup fixtures list not found for league: ${league}`);
    return next;
  }
  
  // Get the matchday for this round
  const roundOrder = ["R32", "R16", "QF", "SF", "Final"];
  const roundIndex = roundOrder.indexOf(round);
  const baseMatchday = round === "Final" ? 20 : round === "SF" ? 15 : round === "QF" ? 10 : round === "R16" ? 6 : 2;
  
  // Find an available date with no fixture conflicts within 2 days
  const seasonStart = new Date("2025-08-16T12:00:00Z");
  let availableMatchday = baseMatchday;
  let found = false;
  
  // Search forward for available dates (up to 5 matchdays ahead)
  for (let md = baseMatchday; md <= baseMatchday + 5 && !found; md++) {
    const fixtureDate = new Date(seasonStart.getTime() + (md - 1) * 7 * 86400000);
    if (!hasFixtureConflict(next, fixtureDate)) {
      availableMatchday = md;
      found = true;
    }
  }
  
  console.log(`Creating ${matchups.length} fixtures for matchday ${availableMatchday}`);
  
  // Create fixtures from matchups
  for (let i = 0; i < matchups.length; i++) {
    const [home, away] = matchups[i];
    const fixture = {
      id: `cup-${league}-${round}-${i}`,
      competition: "cup" as const,
      league,
      matchday: availableMatchday,
      round,
      homeId: home,
      awayId: away,
    };
    list.push(fixture);
    console.log(`Created fixture: ${fixture.id} - ${home} vs ${away}`);
  }
  
  console.log(`Total fixtures in list after draw: ${list.length}`);
  
  // Clear cup draw pending
  next.cupDrawPending = null;
  
  return next;
}

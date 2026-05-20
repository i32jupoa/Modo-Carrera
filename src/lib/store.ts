import { LeagueId, TEAMS, teamById, teamsByLeague, LEAGUES, Team } from "@/data/teams";
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

    return parsed as SaveGame;
  } catch { return null; }
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
    const { fixtures: cup } = initCup(lg);
    cupFixtures[lg] = cup;
    cupChampion[lg] = null;
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

export function getMyUpcomingCupFixtures(save: SaveGame): Fixture[] {
  const out: Fixture[] = [];
  const cup = save.cupFixtures[save.myLeague].find(
    (f) => !f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)
  );
  if (cup) out.push(cup);
  const ucl = save.uclFixtures.find(
    (f) => !f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)
  );
  if (ucl) out.push(ucl);
  return out;
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

function isVIPLeague(leagueId: LeagueId, userLeague: LeagueId): boolean {
  return leagueId === userLeague || BIG5_LEAGUES.includes(leagueId);
}

/**
 * LAYERED SIMULATION - MAXIMUM PERFORMANCE:
 * - VIP Leagues (Big 5 + User's league): Deep simulation
 * - Background Leagues: O(1) fast math only
 * - Ultra-small batches with forced UI updates
 */
export async function advanceMatchdayLayered(save: SaveGame, onProgress?: (processed: number, total: number) => void): Promise<SaveGame> {
  const next: SaveGame = JSON.parse(JSON.stringify(save));
  const BATCH_SIZE = 20; // Ultra-small batches for UI responsiveness
  
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
  
  const totalMatches = allFixtures.length;
  let processed = 0;
  
  // Process in ultra-small batches with guaranteed UI updates
  for (let i = 0; i < allFixtures.length; i += BATCH_SIZE) {
    const batch = allFixtures.slice(i, i + BATCH_SIZE);
    
    // Process this batch synchronously (fast)
    for (const { fixture, league, isVIP } of batch) {
      const home = teamById(fixture.homeId);
      const away = teamById(fixture.awayId);
      if (!home || !away) continue;
      
      let result: SimResult;
      
      // Get squads for both teams
      const homeXI = getStarters(next, fixture.homeId);
      const awayXI = getStarters(next, fixture.awayId);
      
      if (homeXI.length === 0 || awayXI.length === 0) {
        result = { homeGoals: 0, awayGoals: 0, events: [], injuries: [], xgHome: 0, xgAway: 0 };
      } else if (isVIP) {
        // DEEP SIMULATION for VIP leagues only
        result = simulateMatch(home, away, homeXI, awayXI);
        applyMatchToStats(next, { ...fixture, result });
      } else {
        // ULTRA-FAST for background leagues - now with player stats!
        result = simulateMatchFast(home, away, homeXI, awayXI);
        applyMatchToStats(next, { ...fixture, result });
      }
      
      // Apply result
      const idx = next.fixtures[league].findIndex(x => x.id === fixture.id);
      if (idx >= 0) {
        next.fixtures[league][idx] = { ...fixture, result };
        next.standings[league] = applyResult(next.standings[league], next.fixtures[league][idx]);
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
    
    // CRITICAL: Yield to browser after EVERY batch to prevent freezing
    // Use 0ms timeout with requestAnimationFrame for smooth UI
    if (i + BATCH_SIZE < allFixtures.length) {
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 0);
        });
      });
    }
  }
  
  // Stats are now recorded during simulation for ALL leagues (VIP and background)
  // No need for fake stats generation anymore
  
  // Advance cups/UCL
  const cupLeagues = Object.keys(next.cupFixtures) as LeagueId[];
  for (const cupLg of cupLeagues) {
    advanceCupForLeague(next, cupLg);
  }
  advanceUCL(next);
  
  return next;
}

/**
 * Legacy function - kept for compatibility.
 * Use advanceMatchdayLayered for better performance.
 */
export async function finishMatchday(save: SaveGame, onProgress?: (leaguesDone: number, total: number) => void): Promise<SaveGame> {
  return advanceMatchdayLayered(save, onProgress);
}

function advanceCupForLeague(save: SaveGame, lg: LeagueId) {
  const list = save.cupFixtures[lg];
  if (!list || list.length === 0) return; // No cup for this league
  
  const leagueMd = save.currentMatchday[lg];
  
  // Get unique rounds that exist in this cup and sort them in order
  const roundOrder = ["R32", "R16", "QF", "SF", "Final"];
  const existingRounds = [...new Set(list.map(f => f.round).filter((r): r is string => !!r))];
  const sortedRounds = existingRounds.sort((a, b) => 
    roundOrder.indexOf(a) - roundOrder.indexOf(b)
  );
  
  // Build dynamic schedule based on existing rounds
  const dynamicSchedule = sortedRounds.map((round, idx) => {
    const matchday = round === "Final" ? 30 : round === "SF" ? 22 : round === "QF" ? 12 : round === "R16" ? 6 : 3;
    return { matchday, round, size: 0 }; // size not used for advancement
  });
  
  for (let roundIdx = 0; roundIdx < dynamicSchedule.length; roundIdx++) {
    const step = dynamicSchedule[roundIdx];
    const roundFixtures = list.filter((f) => f.round === step.round);
    if (roundFixtures.length === 0) continue;
    
    const allPlayed = roundFixtures.every((f) => f.result);
    if (!allPlayed && leagueMd > step.matchday) {
      // sim unplayed
      for (const f of roundFixtures) {
        if (f.result) continue;
        const sim = simulateFixtureInline(save, f);
        const idx = list.findIndex((x) => x.id === f.id);
        if (idx >= 0) list[idx] = sim;
        applyMatchToStats(save, sim);
      }
    }
    
    const playedAll = roundFixtures.every((f) => f.result);
    if (playedAll) {
      const next = dynamicSchedule[roundIdx + 1];
      if (!next) {
        // final winner
        const final = list.find((f) => f.round === "Final");
        if (final?.result && !save.cupChampion[lg]) {
          const champ = final.result.homeGoals >= final.result.awayGoals ? final.homeId : final.awayId;
          save.cupChampion[lg] = champ;
        }
        continue;
      }
      const alreadyBuilt = list.some((f) => f.round === next.round);
      if (!alreadyBuilt) {
        const winners = roundFixtures
          .map((f) => {
            if (!f.result) return f.homeId;
            return f.result.homeGoals >= f.result.awayGoals ? f.homeId : f.awayId;
          });
        if (!step.round || !next.round) continue;
        const nextStep = { matchday: next.matchday, round: next.round };
        const built = buildNextRound("cup", lg, step.round, winners, nextStep, roundIdx + 1);
        list.push(...built);
      }
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

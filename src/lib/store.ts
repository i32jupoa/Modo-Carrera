import { LeagueId, TEAMS, teamById, teamsByLeague, LEAGUES, LEAGUES_BY_COUNTRY, getPrimaryLeagueForCountry, Team } from "@/data/teams";

import { Player, defaultLineup } from "@/data/players";

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

import { simulateMatch, simulateMatchFast, simulateCupMatch, SimResult, MatchEvent, InjuryEvent, CardEvent, simulateExtraTime, simulatePenaltyShootout } from "@/lib/simulation";

import { buildNextRound, CUP_SCHEDULE, getCupScheduleForSize, initCup, initUCL, UCL_SCHEDULE, getCupStructureForCountry } from "@/lib/cups";

import { ALL_FORMATIONS, FORMATION_COORDINATES, type FormationName } from "@/lib/formations";

// Generate a CPU XI using a random (or specified) formation, always returning exactly 11 players
// Returns ids in slot order so MiniPitch can position them correctly by role
function generateCPUXI(squad: Player[], unavailable: Set<string>, forcedFormation?: FormationName): { ids: string[]; formation: FormationName } {
  // Filter available players sorted by rating desc
  const byPos: Record<string, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of squad) {
    if (!unavailable.has(p.id) && byPos[p.position]) {
      byPos[p.position].push(p);
    }
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => b.rating - a.rating);
  }

  // Pick a random formation unless one is specified
  const formation = forcedFormation ?? ALL_FORMATIONS[Math.floor(Math.random() * ALL_FORMATIONS.length)];
  const coords = FORMATION_COORDINATES[formation];
  const slots = Object.values(coords); // always exactly 11 slots

  // Count how many of each role the formation needs
  const needed: Record<string, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const slot of slots) needed[slot.role]++;

  // Build pools: GK→GK, DEF→DEF, MID→MID, ATT→FWD then MID fallback then DEF fallback
  const pools: Record<string, Player[]> = {
    GK:  byPos.GK.slice(0, needed.GK),
    DEF: byPos.DEF.slice(0, needed.DEF),
    MID: byPos.MID.slice(0, needed.MID),
    ATT: [],
  };

  // Fill ATT pool: prefer FWD, then MID leftovers, then DEF leftovers, then any
  const midUsed = pools.MID.map(p => p.id);
  const defUsed = pools.DEF.map(p => p.id);
  const attCandidates = [
    ...byPos.FWD,
    ...byPos.MID.filter(p => !midUsed.includes(p.id)),
    ...byPos.DEF.filter(p => !defUsed.includes(p.id)),
    ...byPos.GK.slice(1), // extra GKs as last resort
  ];
  const usedInPools = new Set([...pools.GK, ...pools.DEF, ...pools.MID].map(p => p.id));
  pools.ATT = attCandidates.filter(p => !usedInPools.has(p.id)).slice(0, needed.ATT);

  // If any pool is short, fill from remaining available players (any position)
  const allUsed = new Set<string>();
  for (const pool of Object.values(pools)) pool.forEach(p => allUsed.add(p.id));
  const remaining = squad
    .filter(p => !unavailable.has(p.id) && !allUsed.has(p.id))
    .sort((a, b) => b.rating - a.rating);

  for (const role of ["GK", "DEF", "MID", "ATT"] as const) {
    while (pools[role].length < needed[role] && remaining.length > 0) {
      const p = remaining.shift()!;
      pools[role].push(p);
      allUsed.add(p.id);
    }
  }

  // Build ids array in slot order (matching formation slot order for MiniPitch index mapping)
  const roleCursors: Record<string, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  const ids: string[] = [];
  for (const slot of slots) {
    const pool = pools[slot.role];
    const cursor = roleCursors[slot.role];
    if (cursor < pool.length) {
      ids.push(pool[cursor].id);
      roleCursors[slot.role]++;
    }
    // If pool exhausted (shouldn't happen with fallback above), skip — MiniPitch handles null
  }

  return { ids, formation };
}



// Helper to determine winner of a cup match (considering extra time and penalties)

function getCupMatchWinner(result: any): "home" | "away" {

  if (!result) return "home";

  

  // If penalties exist, they determine the winner

  if (result.penalties) {

    return result.penalties.homeGoals >= result.penalties.awayGoals ? "home" : "away";

  }

  

  // If extra time exists, use total score (regular + extra time)

  if (result.extraTime) {

    const totalHome = result.homeGoals + result.extraTime.homeGoals;

    const totalAway = result.awayGoals + result.extraTime.awayGoals;

    return totalHome >= totalAway ? "home" : "away";

  }

  

  // Regular time only

  return result.homeGoals >= result.awayGoals ? "home" : "away";

}



/**

 * Fix cup draws that were simulated before extra time/penalty logic was implemented

 * This function adds extra time and penalty data to cup matches that ended in draws

 */

export function fixCupDraws(save: SaveGame): SaveGame {

  let next: SaveGame = JSON.parse(JSON.stringify(save));

  let fixed = false;

  // Detect stale cup fixtures generated with old offsets (pre-league-anchored schedule).
  // New schedule: Preliminar matchday=63, R32 matchday=98. Old schedule had matchday<=20.
  // If any fixture has matchday < 63, the league's cup data is outdated → reset.
  for (const lg of Object.keys(next.cupFixtures) as LeagueId[]) {
    const list = next.cupFixtures[lg];
    if (!list || list.length === 0) continue;
    const stale = list.some((f: any) => (f.matchday as number) < 63);
    if (stale) {
      next.cupFixtures[lg] = [];
      delete (next.cupFixtures as any)[`${lg}_structure`];
    }
  }

  for (const lg of Object.keys(next.cupFixtures) as LeagueId[]) {

    const cupFixtures = next.cupFixtures[lg];

    if (!cupFixtures) continue;

    

    for (let i = 0; i < cupFixtures.length; i++) {

      const f = cupFixtures[i];

      if (!f.result) continue;

      

      // Check if this is a draw without extra time/penalty data

      if (f.result.homeGoals === f.result.awayGoals && !f.result.extraTime && !f.result.penalties) {

        console.log(`[fixCupDraws] Fixing draw in fixture ${f.id}: ${f.homeId} ${f.result.homeGoals}-${f.result.awayGoals} ${f.awayId}`);

        

        const home = teamById(f.homeId);

        const away = teamById(f.awayId);

        if (!home || !away) continue;

        

        const homeXI = getStarters(next, f.homeId);

        const awayXI = getStarters(next, f.awayId);

        

        // Simulate extra time

        const etResult = simulateExtraTime(home, away, homeXI, awayXI);

        f.result.extraTime = {

          homeGoals: etResult.homeGoals,

          awayGoals: etResult.awayGoals,

          events: etResult.events

        };

        

        // Check if still tied after extra time

        const totalHome = f.result.homeGoals + etResult.homeGoals;

        const totalAway = f.result.awayGoals + etResult.awayGoals;

        

        if (totalHome === totalAway) {

          // Simulate penalty shootout

          const penaltyResult = simulatePenaltyShootout(homeXI, awayXI);

          f.result.penalties = {

            homeGoals: penaltyResult.homeGoals,

            awayGoals: penaltyResult.awayGoals,

            shootout: penaltyResult.shootout

          };

        }

        

        fixed = true;

      }

    }

  }

  

  if (fixed) {

    console.log("[fixCupDraws] Fixed cup draws in save");

  }

  

  return next;

}



export type Suspension = {

  playerId: string;

  playerName: string;

  matchdaysRemaining: number; // Number of matchdays the suspension lasts

};



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

  // player suspensions (red cards)

  suspensions: Record<string, Suspension[]>; // teamId -> suspensions

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

  const suspensions: Record<string, Suspension[]> = {} as never;



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

      

      // Initialize cup using the new country-based function

      const cupData = initCup(country);

      

      // Store the structure for later use

      (cupFixtures as any)[`${primaryLeague}_structure`] = cupData.structure;



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

    suspensions,

    cupFixtures, cupChampion,

    cupDrawPending: null,

    uclFixtures: ucl,

    uclChampion: null,

  };

}



/* ============================================================

 *  SIMULATION CORE

 * ============================================================ */



// Process red cards and create suspensions

function processRedCards(save: SaveGame, cards: CardEvent[], homeTeamId: string, awayTeamId: string): SaveGame {

  const next: SaveGame = JSON.parse(JSON.stringify(save));

  

  for (const card of cards) {

    if (card.cardType === "red") {

      const teamId = card.team === "home" ? homeTeamId : awayTeamId;

      

      // Suspension length: 1-3 matchdays for direct red cards, 1 matchday for second yellow

      let suspensionLength: number;

      if (card.isSecondYellow) {

        suspensionLength = 1; // 1 matchday for double yellow

      } else {

        // Random suspension length: 1, 2, or 3 matchdays for direct red cards

        suspensionLength = Math.floor(Math.random() * 3) + 1;

      }

      

      const suspension: Suspension = {

        playerId: card.playerId,

        playerName: card.playerName,

        matchdaysRemaining: suspensionLength,

      };

      

      // Add suspension to the team's suspension list

      if (!next.suspensions[teamId]) {

        next.suspensions[teamId] = [];

      }

      next.suspensions[teamId].push(suspension);

      

      console.log(`Red card for ${card.playerName} (${teamId}): ${suspensionLength} matchday suspension`);

    }

  }

  

  return next;

}



// Decrease suspension counters for all teams (called after each matchday)

function decreaseSuspensions(save: SaveGame): SaveGame {

  const next: SaveGame = JSON.parse(JSON.stringify(save));

  

  for (const teamId in next.suspensions) {

    const suspensions = next.suspensions[teamId];

    if (suspensions && suspensions.length > 0) {

      // Decrease matchdaysRemaining for each suspension

      next.suspensions[teamId] = suspensions

        .map(s => ({ ...s, matchdaysRemaining: s.matchdaysRemaining - 1 }))

        .filter(s => s.matchdaysRemaining > 0); // Remove completed suspensions

    }

  }

  

  return next;

}



export function getStartersWithFormation(save: SaveGame, teamId: string): { players: Player[]; formation: FormationName } {

  const store = usePlayersStore.getState();

  store.init();

  const team = teamById(teamId);

  if (!team) return { players: [], formation: "Táctica 4-4-2" };

  const lg = team.league;

  const md = save.currentMatchday[lg] ?? 1;

  const lineup = save.lineups[teamId] ?? [];

  const suspensions = save.suspensions[teamId] ?? [];

  const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));

  const squad = store.getSimSquad(teamId);

  const injuredIds = new Set(squad.filter(p => p.injuredUntil > md).map(p => p.id));

  const unavailable = new Set([...suspendedPlayerIds, ...injuredIds]);

  if (lineup.length === 0) {

    const existingFormation = save.formations[teamId] as FormationName | undefined;

    const { ids: autoIds, formation } = existingFormation

      ? generateCPUXI(squad, unavailable, existingFormation)

      : generateCPUXI(squad, unavailable);

    if (!save.formations[teamId]) save.formations[teamId] = formation;

    const players = autoIds

      .map(id => store.getSimPlayer(id))

      .filter((p): p is Player => !!p)

      .slice(0, 11);

    return { players, formation: save.formations[teamId] as FormationName || formation };

  }

  const filteredLineup = lineup.filter(playerId => !unavailable.has(playerId));

  const players = store.getSimXI(teamId, filteredLineup, md);

  return { players, formation: (save.formations[teamId] as FormationName) || "Táctica 4-4-2" };

}

export function getStarters(save: SaveGame, teamId: string): Player[] {

  const store = usePlayersStore.getState();

  store.init();

  const team = teamById(teamId);

  if (!team) {

    console.warn(`getStarters: Team not found for ID: ${teamId}`);

    return [];

  }

  const lg = team.league;

  const md = save.currentMatchday[lg] ?? 1;

  

  // Get the lineup

  const lineup = save.lineups[teamId] ?? [];

  

  // Get suspended players for this team

  const suspensions = save.suspensions[teamId] ?? [];

  const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));

  // Build unavailable set (injured + suspended)
  const squad = store.getSimSquad(teamId);
  const injuredIds = new Set(squad.filter(p => p.injuredUntil > md).map(p => p.id));
  const unavailable = new Set([...suspendedPlayerIds, ...injuredIds]);

  // CPU teams (no saved lineup): auto-generate XI from squad with a random formation
  if (lineup.length === 0) {
    // Use existing persisted formation if available, otherwise pick a random one
    const existingFormation = save.formations[teamId] as FormationName | undefined;
    const { ids: autoIds, formation } = existingFormation
      ? generateCPUXI(squad, unavailable, existingFormation)
      : generateCPUXI(squad, unavailable);
    // Persist the chosen formation so re-renders show the same XI
    if (!save.formations[teamId]) {
      save.formations[teamId] = formation;
    }
    return autoIds
      .map(id => store.getSimPlayer(id))
      .filter((p): p is Player => !!p)
      .slice(0, 11);
  }

  // Teams with a saved lineup: respect it strictly, only exclude unavailable players
  const filteredLineup = lineup.filter(playerId => !unavailable.has(playerId));

  return store.getSimXI(teamId, filteredLineup, md);

}



export function squadOf(_save: SaveGame, teamId: string): Player[] {

  const store = usePlayersStore.getState();

  store.init();

  return store.getSimSquad(teamId);

}



function applyMatchToStats(save: SaveGame, fixture: Fixture): SaveGame {

  if (!fixture.result) return save;

  const r = fixture.result;

  const store = usePlayersStore.getState();

  const homeXI = getStarters(save, fixture.homeId);

  const awayXI = getStarters(save, fixture.awayId);

  

  let updatedSave = save;

  

  // Process red cards and create suspensions

  if (r.cards && r.cards.length > 0) {

    updatedSave = processRedCards(updatedSave, r.cards, fixture.homeId, fixture.awayId);

  }

  

  for (const p of [...homeXI, ...awayXI]) {

    store.recordAppearance(p.id, fixture.competition);

  }

  

  // Process regular time events

  for (const ev of r.events) {

    store.recordGoal(ev.scorerId, fixture.competition);

    if (ev.assistId) store.recordAssist(ev.assistId, fixture.competition);

  }

  

  // Process extra time events (goals and assists count for stats)

  if (r.extraTime && r.extraTime.events) {

    for (const ev of r.extraTime.events) {

      store.recordGoal(ev.scorerId, fixture.competition);

      if (ev.assistId) store.recordAssist(ev.assistId, fixture.competition);

    }

  }

  

  // Process cards (including those from extra time)

  for (const card of r.cards) {

    if (card.cardType === "yellow") {

      store.recordYellowCard(card.playerId);

      store.incrementAccumulatedYellowCards(card.playerId);

      // Check if accumulated yellow cards reaches 5

      const stats = store.stats[card.playerId];

      if (stats && stats.accumulatedYellowCards >= 5) {

        // Suspend player for next match

        const p = store.getSimPlayer(card.playerId);

        if (p) {

          const teamLeague = teamById(p.teamId).league;

          store.recordInjury(card.playerId, updatedSave.currentMatchday[teamLeague] + 1, "5 amarillas acumuladas");

          // Reset accumulated yellow cards after suspension is applied

          store.resetAccumulatedYellowCards(card.playerId);

        }

      }

    } else if (card.cardType === "red") {

      store.recordRedCard(card.playerId);

      // If it's a second yellow, also count it as a yellow card

      if (card.isSecondYellow) {

        store.recordYellowCard(card.playerId);

        store.incrementAccumulatedYellowCards(card.playerId);

      }

    }

  }

  for (const inj of r.injuries) {

    const p = store.getSimPlayer(inj.playerId);

    if (!p) continue;

    const teamLeague = teamById(p.teamId).league;

    store.recordInjury(

      inj.playerId,

      updatedSave.currentMatchday[teamLeague] + inj.weeks,

      inj.reason,

    );

  }

  // Auto-update user's lineup if their players got injured or red-carded during the match
  const isUserMatch = fixture.homeId === save.myTeamId || fixture.awayId === save.myTeamId;
  if (isUserMatch) {
    const userTeamId = save.myTeamId;
    const userLineup = save.lineups[userTeamId] || [];
    const squad = store.getSimSquad(userTeamId);
    const leagueMd = save.currentMatchday[save.myLeague];
    
    console.log("Auto-update lineup check:", { userTeamId, userLineupLength: userLineup.length, squadSize: squad.length, leagueMd });
    
    // Get red carded players for user's team
    const redCardedPlayerIds = new Set(
      (r.cards || [])
        .filter(c => c.cardType === "red" && squad.find(p => p.id === c.playerId))
        .map(c => c.playerId)
    );
    
    // Get injured players for user's team
    const injuredPlayerIds = new Set(
      (r.injuries || [])
        .filter(inj => squad.find(p => p.id === inj.playerId))
        .map(inj => inj.playerId)
    );
    
    console.log("Players to remove:", { redCarded: Array.from(redCardedPlayerIds), injured: Array.from(injuredPlayerIds) });
    
    // Players that need to be removed from starting XI
    const playersToRemove = new Set([...redCardedPlayerIds, ...injuredPlayerIds]);
    
    if (playersToRemove.size > 0) {
      let newLineup = [...userLineup];
      const benchPlayers = squad.filter(p => !userLineup.includes(p.id));
      
      console.log("Bench players:", benchPlayers.length);
      
      // For each player to remove, find a replacement from bench
      for (const playerIdToRemove of playersToRemove) {
        const playerToRemove = squad.find(p => p.id === playerIdToRemove);
        if (!playerToRemove) continue;
        
        const idx = newLineup.indexOf(playerIdToRemove);
        if (idx === -1) continue; // Player not in starting XI
        
        // Find a healthy replacement from bench (not injured, not suspended, same position)
        const suspensions = updatedSave.suspensions[userTeamId] || [];
        const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
        
        const replacement = benchPlayers.find(p => 
          p.injuredUntil <= leagueMd &&
          !suspendedPlayerIds.has(p.id) &&
          !playersToRemove.has(p.id) &&
          p.position === playerToRemove.position
        );
        
        if (replacement) {
          // Replace the player
          newLineup[idx] = replacement.id;
          console.log(`Replaced ${playerToRemove.name} with ${replacement.name}`);
        } else {
          // No replacement available, move to end of lineup (will be filtered out later)
          newLineup = newLineup.filter(id => id !== playerIdToRemove);
          console.log(`Removed ${playerToRemove.name} - no replacement available`);
        }
      }
      
      // Ensure we have exactly 11 players in the lineup
      if (newLineup.length < 11) {
        // Add any available bench players to fill the lineup
        const availableBench = benchPlayers.filter(p => 
          p.injuredUntil <= leagueMd &&
          !suspendedPlayerIds.has(p.id) &&
          !playersToRemove.has(p.id) &&
          !newLineup.includes(p.id)
        );
        
        console.log("Available bench for filling:", availableBench.length);
        
        while (newLineup.length < 11 && availableBench.length > 0) {
          newLineup.push(availableBench.shift()!.id);
        }
        
        // If still not enough players, add ANY available player as last resort
        if (newLineup.length < 11) {
          const anyAvailable = squad.filter(p => !newLineup.includes(p.id));
          console.log("Adding any available players as last resort:", anyAvailable.length);
          while (newLineup.length < 11 && anyAvailable.length > 0) {
            newLineup.push(anyAvailable.shift()!.id);
          }
        }
      }
      
      console.log("Final lineup length:", newLineup.length);
      
      // Only update if we have exactly 11 players
      if (newLineup.length === 11) {
        updatedSave = setLineup(updatedSave, userTeamId, newLineup);
      } else {
        console.error("Failed to maintain 11 players in lineup, keeping original");
      }
    }
  }

  return updatedSave;

}



function simulateFixtureInline(save: SaveGame, fixture: Fixture, fast = false, isCup = false): Fixture {

  if (fixture.result) return fixture;

  const home = teamById(fixture.homeId);

  const away = teamById(fixture.awayId);

  if (!home || !away) {

    console.warn(`simulateFixtureInline: Team not found for fixture ${fixture.id}`, { homeId: fixture.homeId, awayId: fixture.awayId, home, away });

    // Return fixture with default result to avoid breaking the simulation

    return { ...fixture, result: { homeGoals: 0, awayGoals: 0, events: [], cards: [], injuries: [], xgHome: 0, xgAway: 0 } };

  }

  const homeXI = getStarters(save, fixture.homeId);

  const awayXI = getStarters(save, fixture.awayId);

  // If either team has no players, return a default result

  if (homeXI.length === 0 || awayXI.length === 0) {

    console.warn(`simulateFixtureInline: Empty squad for fixture ${fixture.id}`, { homeId: fixture.homeId, awayId: fixture.awayId, homeXI: homeXI.length, awayXI: awayXI.length });

    return { ...fixture, result: { homeGoals: 0, awayGoals: 0, events: [], cards: [], injuries: [], xgHome: 0, xgAway: 0 } };

  }

  // Use cup simulation for cup matches (with extra time and penalties)

  // Use fast simulation for bulk matchdays, detailed for user's matches

  const result = isCup 

    ? simulateCupMatch(home, away, homeXI, awayXI)

    : fast 

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

  const cupStart = new Date("2025-07-07T00:00:00Z");

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

  

  // Get cup fixtures (use July-based dates: matchday = day offset from July 7th)

  for (const lg of Object.keys(save.cupFixtures)) {

    save.cupFixtures[lg as LeagueId].forEach(f => {

      if (!f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)) {

        // Cup matchday = day offset from July 7th (0=Jul7, 1=Jul8, etc.)

        const cupMatchDate = new Date(cupStart.getTime() + f.matchday * 86400000);

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

    const primaryLeague = userCountry ? getPrimaryLeagueForCountry(userCountry) : save.myLeague;

    const cupKey = (primaryLeague || save.myLeague) as LeagueId;

    

    // Get the dynamic cup structure for the user's country

    const structure = (save.cupFixtures as any)[`${cupKey}_structure`] || getCupStructureForCountry(userCountry || "");

    const cupSchedule = structure.schedule;

    

    // Only show fixtures for rounds that have been drawn (fixtures exist)

    const cupFixtures = save.cupFixtures[cupKey]?.filter(

      (f) => !f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId)

    ) || [];

    

    // Show all cup fixtures that exist (have been drawn)

    // Don't filter by drawMatchday since draws can happen earlier than scheduled

    if (cupFixtures.length > 0) {

      out.push(...cupFixtures);

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

 * Get round name based on team count (pure mathematical calculation)

 * Used for dynamic round naming in cup draws

 */

export function getRoundNameByTeamCount(teamCount: number): string {

  if (teamCount === 128) return "64avos de Final";

  if (teamCount === 64) return "32avos de Final";

  if (teamCount === 32) return "16avos de Final";

  if (teamCount === 16) return "Octavos de Final";

  if (teamCount === 8) return "Cuartos de Final";

  if (teamCount === 4) return "Semifinales";

  if (teamCount === 2) return "Final";

  return "Fase Previa";

}



/**

 * Get surviving teams for the next cup round based on current fixtures

 * This calculates winners from the most recent completed round

 */

export function getSurvivingCupTeams(save: SaveGame, league: LeagueId): string[] {

  const list = save.cupFixtures[league];

  if (!list || list.length === 0) return [];

  

  const roundOrder = ["Preliminar", "R32", "R16", "Octavos", "QF", "SF", "Final"];

  const existingRounds = [...new Set(list.map(f => f.round).filter((r): r is string => !!r))];

  const sortedRounds = existingRounds.sort((a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b));

  

  console.log(`getSurvivingCupTeams: Existing rounds: ${sortedRounds.join(', ')}`);

  

  // Find the most recent completed round

  let mostRecentCompletedRound: string | null = null;

  for (let i = sortedRounds.length - 1; i >= 0; i--) {

    const round = sortedRounds[i];

    const roundFixtures = list.filter(f => f.round === round);

    const allHaveResults = roundFixtures.every(f => f.result);

    console.log(`getSurvivingCupTeams: Round ${round} has ${roundFixtures.length} fixtures, all have results: ${allHaveResults}`);

    if (allHaveResults) {

      mostRecentCompletedRound = round;

      break;

    }

  }

  

  if (!mostRecentCompletedRound) {

    console.log(`getSurvivingCupTeams: No completed rounds found`);

    return [];

  }

  

  console.log(`getSurvivingCupTeams: Most recent completed round: ${mostRecentCompletedRound}`);

  

  // Get winners from the most recent completed round

  const completedRoundFixtures = list.filter(f => f.round === mostRecentCompletedRound);

  const winners = completedRoundFixtures.map(f => {

    if (!f.result) return f.homeId;

    return getCupMatchWinner(f.result) === "home" ? f.homeId : f.awayId;

  });

  

  console.log(`getSurvivingCupTeams: Found ${winners.length} winners from ${mostRecentCompletedRound}`);

  

  return winners;

}



/**

 * Simulate all unplayed cup fixtures for a specific matchday

 */

export function simulateCupMatchday(save: SaveGame, league: LeagueId, matchday: number): SaveGame {

  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const cupFixtures = next.cupFixtures[league];

  if (!cupFixtures) return next;



  const roundFixtures = cupFixtures.filter(f => f.matchday === matchday && !f.result);



  for (const f of roundFixtures) {

    const simmed = simulateFixtureInline(next, f, false, true);

    const idx = cupFixtures.findIndex(x => x.id === f.id);

    if (idx >= 0) {

      cupFixtures[idx] = simmed;

      next = applyMatchToStats(next, simmed);

    }

  }



  // Process cup draws after simulating matches

  processCupDrawsOnly(next, league);



  return next;

}



/**

 * Simulate all unplayed cup fixtures for a specific matchday across ALL VIP countries

 * Uses the EXACT same logic format as advanceMatchdayLayered:

 * - VIP countries (Big 5 + Belgium + Netherlands + Portugal + Turkey + user's country): detailed simulation

 * - Background countries: O(1) mathematical simulation

 */

export async function simulateCupMatchdayLayered(save: SaveGame, matchday: number, onProgress?: (processed: number, total: number) => void): Promise<SaveGame> {

  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const BATCH_SIZE = 100;

  

  const userLeague = next.myLeague;

  const allFixtures: { fixture: Fixture; league: LeagueId; isVIP: boolean }[] = [];

  

  // Collect cup fixtures from all leagues for this matchday

  for (const lg of Object.keys(next.cupFixtures) as LeagueId[]) {

    const cupFixtures = next.cupFixtures[lg];

    if (!cupFixtures) continue;

    

    const isVIP = isVIPLeague(lg, userLeague);

    const fixtures = cupFixtures.filter(f => f.matchday === matchday && !f.result);

    

    for (const f of fixtures) {

      allFixtures.push({ fixture: f, league: lg, isVIP });

    }

  }

  

  console.log(`simulateCupMatchdayLayered: Total fixtures to simulate: ${allFixtures.length}`);

  console.log(`simulateCupMatchdayLayered: Leagues with fixtures:`, [...new Set(allFixtures.map(f => f.league))]);

  

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

        // DEEP SIMULATION for VIP countries only

        const homeXI = getStarters(next, fixture.homeId);

        const awayXI = getStarters(next, fixture.awayId);

        

        if (homeXI.length === 0 || awayXI.length === 0) {

          console.warn(`Empty squad for VIP cup fixture ${fixture.id}: ${fixture.homeId} (${homeXI.length}) vs ${fixture.awayId} (${awayXI.length})`);

          result = { homeGoals: 0, awayGoals: 0, events: [], cards: [], injuries: [], xgHome: 0, xgAway: 0 };

        } else {

          // Use cup simulation with extra time and penalties

          result = simulateCupMatch(home, away, homeXI, awayXI);

          next = applyMatchToStats(next, { ...fixture, result });

        }

      } else {

        // O(1) MATH SIMULATION for background countries (ULTRA FAST)

        result = generateFakeMatchResult(home, away);

        

        // Handle cup draws: extra time and penalties for background countries

        if (result.homeGoals === result.awayGoals) {

          // Simulate extra time (simplified for background)

          const etHomeGoals = Math.random() < 0.3 ? Math.floor(Math.random() * 2) : 0;

          const etAwayGoals = Math.random() < 0.3 ? Math.floor(Math.random() * 2) : 0;

          result.extraTime = {

            homeGoals: etHomeGoals,

            awayGoals: etAwayGoals,

            events: []

          };

          

          // Check if still tied after extra time

          const totalHome = result.homeGoals + etHomeGoals;

          const totalAway = result.awayGoals + etAwayGoals;

          

          if (totalHome === totalAway) {

            // Simulate penalty shootout using the same function as VIP for consistency

            const penaltyResult = simulatePenaltyShootout(homeXI, awayXI);

            result.penalties = {

              homeGoals: penaltyResult.homeGoals,

              awayGoals: penaltyResult.awayGoals,

              shootout: penaltyResult.shootout

            };

          }

        }

        // No stats recording for background countries to save time

      }

      

      // Apply result to cup fixtures

      const cupFixtures = next.cupFixtures[league];

      if (cupFixtures) {

        const idx = cupFixtures.findIndex(x => x.id === fixture.id);

        if (idx >= 0) {

          cupFixtures[idx] = { ...fixture, result };

        }

      }

      

      processed++;

    }

    

    // Report progress

    if (onProgress) {

      onProgress(processed, totalMatches);

    }

    

    // Yield control every batch

    if (i + BATCH_SIZE < allFixtures.length) {

      await new Promise(r => setTimeout(r, 0));

    }

  }

  

  console.log(`simulateCupMatchdayLayered: Completed ${processed}/${totalMatches} fixtures`);

  // Decrease suspension counters after cup matchday
  next = decreaseSuspensions(next);

  

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

  let next: SaveGame = JSON.parse(JSON.stringify(save));

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

          result = { homeGoals: 0, awayGoals: 0, events: [], cards: [], injuries: [], xgHome: 0, xgAway: 0 };

        } else {

          result = simulateMatch(home, away, homeXI, awayXI);

          next = applyMatchToStats(next, { ...f, result });

          

          // Handle cup draws: extra time and penalties

          if (result.homeGoals === result.awayGoals) {

            // Simulate extra time

            const etResult = simulateExtraTime(home, away, homeXI, awayXI);

            result.extraTime = {

              homeGoals: etResult.homeGoals,

              awayGoals: etResult.awayGoals,

              events: etResult.events

            };

            

            // Check if still tied after extra time

            const totalHome = result.homeGoals + etResult.homeGoals;

            const totalAway = result.awayGoals + etResult.awayGoals;

            

            if (totalHome === totalAway) {

              // Simulate penalty shootout

              const penaltyResult = simulatePenaltyShootout(homeXI, awayXI);

              result.penalties = {

                homeGoals: penaltyResult.homeGoals,

                awayGoals: penaltyResult.awayGoals,

                shootout: penaltyResult.shootout

              };

            }

          }

        }

      } else {

        // O(1) MATH SIMULATION for background countries - EXACT same logic as league background matches

        result = generateFakeMatchResult(home, away);

        

        // Handle cup draws: extra time and penalties for background countries

        if (result.homeGoals === result.awayGoals) {

          // Simulate extra time (simplified for background)

          const etHomeGoals = Math.random() < 0.3 ? Math.floor(Math.random() * 2) : 0;

          const etAwayGoals = Math.random() < 0.3 ? Math.floor(Math.random() * 2) : 0;

          result.extraTime = {

            homeGoals: etHomeGoals,

            awayGoals: etAwayGoals,

            events: []

          };

          

          // Check if still tied after extra time

          const totalHome = result.homeGoals + etHomeGoals;

          const totalAway = result.awayGoals + etAwayGoals;

          

          if (totalHome === totalAway) {

            // Simulate penalty shootout using the same function as VIP for consistency

            const homeXI = getStarters(next, f.homeId);

            const awayXI = getStarters(next, f.awayId);

            const penaltyResult = simulatePenaltyShootout(homeXI, awayXI);

            result.penalties = {

              homeGoals: penaltyResult.homeGoals,

              awayGoals: penaltyResult.awayGoals,

              shootout: penaltyResult.shootout

            };

          }

        }

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

  

  // DO NOT call processCupDrawsOnly here - it's for advancing bracket after league matchdays

  // Cup draws are handled separately in the calendar

  

  return next;

}



/**

 * Simulate all unplayed UCL fixtures for a specific matchday

 */

export function simulateUCLMatchday(save: SaveGame, matchday: number): SaveGame {

  let next: SaveGame = JSON.parse(JSON.stringify(save));

  if (!next.uclFixtures) return next;

  

  const matchdayFixtures = next.uclFixtures.filter(f => f.matchday === matchday && !f.result);

  

  for (const f of matchdayFixtures) {

    const simmed = simulateFixtureInline(next, f);

    const idx = next.uclFixtures.findIndex(x => x.id === f.id);

    if (idx >= 0) {

      next.uclFixtures[idx] = simmed;

      next = applyMatchToStats(next, simmed);

    }

  }

  

  // Note: UCL draws are not implemented yet, but could be added here in the future

  

  return next;

}



/**

 * Play a specific fixture by ID: simulate just my game, leave the rest of the matchday open.

 */

export function playSpecificFixture(save: SaveGame, fixtureId: string): { save: SaveGame; fixture: Fixture | null } {

  let next: SaveGame = JSON.parse(JSON.stringify(save));

  

  console.log("playSpecificFixture called with fixtureId:", fixtureId);

  

  // Try to find fixture in league fixtures

  let fixture = next.fixtures[next.myLeague].find(f => f.id === fixtureId);

  if (fixture && !fixture.result) {

    console.log("Found fixture in league fixtures:", fixture.id);

    const simmed = simulateFixtureInline(next, fixture);

    const idx = next.fixtures[next.myLeague].findIndex((x) => x.id === fixtureId);

    if (idx >= 0) {

      next.fixtures[next.myLeague][idx] = simmed;

      next.standings[next.myLeague] = applyResult(next.standings[next.myLeague], simmed);

      next = applyMatchToStats(next, simmed);

    }

    return { save: next, fixture: simmed };

  }

  

  // Try to find fixture in cup fixtures

  for (const lg of Object.keys(next.cupFixtures)) {

    fixture = next.cupFixtures[lg as LeagueId].find(f => f.id === fixtureId);

    if (fixture && !fixture.result) {

      console.log("Found fixture in cup fixtures:", fixture.id, "league:", lg);

      // Check if this is a user match - if so, use regular simulation (no auto extra time/penalties)

      const isUserMatch = fixture.homeId === next.myTeamId || fixture.awayId === next.myTeamId;

      const simmed = simulateFixtureInline(next, fixture, false, isUserMatch ? false : true);

      const idx = next.cupFixtures[lg as LeagueId].findIndex((x) => x.id === fixtureId);

      if (idx >= 0) {

        next.cupFixtures[lg as LeagueId][idx] = simmed;

        next = applyMatchToStats(next, simmed);

      }

      return { save: next, fixture: simmed };

    }

  }

  

  // Try to find fixture in UCL fixtures

  if (next.uclFixtures) {

    fixture = next.uclFixtures.find(f => f.id === fixtureId);

    if (fixture && !fixture.result) {

      console.log("Found fixture in UCL fixtures:", fixture.id);

      const simmed = simulateFixtureInline(next, fixture);

      const idx = next.uclFixtures.findIndex((x) => x.id === fixtureId);

      if (idx >= 0) {

        next.uclFixtures[idx] = simmed;

        next = applyMatchToStats(next, simmed);

      }

      return { save: next, fixture: simmed };

    }

  }

  

  console.log("Fixture not found in any competition:", fixtureId);

  return { save: next, fixture: null };

}



/**

 * Play my next league match: simulate just my game, leave the rest of the matchday open.

 */

export function playMyNextMatch(save: SaveGame): { save: SaveGame; fixture: Fixture | null } {

  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const my = getMyNextFixture(next);

  if (!my) return { save: next, fixture: null };

  const simmed = simulateFixtureInline(next, my);

  const idx = next.fixtures[next.myLeague].findIndex((x) => x.id === my.id);

  next.fixtures[next.myLeague][idx] = simmed;

  next.standings[next.myLeague] = applyResult(next.standings[next.myLeague], simmed);

  next = applyMatchToStats(next, simmed);

  return { save: next, fixture: simmed };

}



/**

 * Play my next cup match: simulate just my cup game.

 */

export function playMyNextCupMatch(save: SaveGame): { save: SaveGame; fixture: Fixture | null } {

  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const myCupFixtures = getMyUpcomingCupFixtures(next).filter(f => f.competition === "cup");

  if (myCupFixtures.length === 0) return { save: next, fixture: null };

  

  const my = myCupFixtures[0];

  const simmed = simulateFixtureInline(next, my, false, true);

  const idx = next.cupFixtures[next.myLeague].findIndex((x) => x.id === my.id);

  next.cupFixtures[next.myLeague][idx] = simmed;

  next = applyMatchToStats(next, simmed);

  return { save: next, fixture: simmed };

}



// Fast synchronous version for UI responsiveness - only simulates essential leagues

export function finishMatchdayFast(save: SaveGame, leaguesToSim?: LeagueId[]): SaveGame {

  let next: SaveGame = JSON.parse(JSON.stringify(save));

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

      next = applyMatchToStats(next, sim);

    }

    next.currentMatchday[lg] = md + 1;

  }



  // Decrease suspension counters after advancing matchday

  next = decreaseSuspensions(next);



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

  

  // Increased RNG variation to reduce draws

  const rng = () => Math.floor(Math.random() * 5) - 2;

  

  // Base goals with more variation

  let homeGoals = Math.max(0, Math.round(1.2 + diff * 0.05 + rng() * 0.8));

  let awayGoals = Math.max(0, Math.round(1.0 - diff * 0.05 + rng() * 0.8));

  

  homeGoals = Math.min(homeGoals, 6);

  awayGoals = Math.min(awayGoals, 5);

  

  // Minimal events - just result, no individual scorers

  return { 

    homeGoals, 

    awayGoals, 

    events: [], // No events - we'll fake stats in batch at the end

    cards: [],

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

  let next: SaveGame = JSON.parse(JSON.stringify(save));

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

  

  // console.log(`advanceMatchdayLayered: Total fixtures to simulate: ${allFixtures.length}`);

  // console.log(`advanceMatchdayLayered: Leagues with fixtures:`, [...new Set(allFixtures.map(f => f.league))]);

  

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

          result = { homeGoals: 0, awayGoals: 0, events: [], cards: [], injuries: [], xgHome: 0, xgAway: 0 };

        } else {

          result = simulateMatch(home, away, homeXI, awayXI);

          next = applyMatchToStats(next, { ...fixture, result });

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

  

  // Sync currentMatchday for the cup league to match user's league

  const userCountry = LEAGUES[next.myLeague]?.country;

  if (userCountry) {

    const cupLeague = getPrimaryLeagueForCountry(userCountry) as LeagueId;

    if (cupLeague && cupLeague !== next.myLeague) {

      next.currentMatchday[cupLeague] = next.currentMatchday[next.myLeague];

    }

  }

  

  // Reset CPU team formations so each matchday they pick a new random formation
  for (const teamId in next.formations) {
    if (teamId !== next.myTeamId) {
      delete next.formations[teamId];
    }
  }

  // Decrease suspension counters after advancing matchday
  next = decreaseSuspensions(next);

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

  

  // Get the dynamic cup structure for this league's country

  const country = LEAGUES[lg]?.country;

  if (!country) return;

  

  // Check if user is in the same country (not necessarily same league)

  const userCountry = LEAGUES[save.myLeague]?.country;

  const isUserCountry = country === userCountry;

  

  const structure = (save.cupFixtures as any)[`${lg}_structure`] || getCupStructureForCountry(country);

  const cupSchedule = structure.schedule;

  

  // Special case: if no fixtures exist yet, do nothing - calendar.tsx handles draw notifications based on game date

  

  // Get unique rounds that exist in this cup and sort them in order

  const roundOrder = cupSchedule.map(s => s.round);

  const existingRounds = [...new Set(list.map(f => f.round).filter((r): r is string => !!r))];

  const sortedRounds = existingRounds.sort((a, b) => 

    roundOrder.indexOf(a) - roundOrder.indexOf(b)

  );

  

  // Build dynamic schedule based on existing rounds

  const dynamicSchedule = sortedRounds.map((round) => {

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

    

    if (playedAll && nextStep && isUserCountry) {

      // If current round is complete and we've reached the draw matchday for next round

      // Skip draw for Final - auto-assign the final matchup

      if (nextStep.round === "Final" && leagueMd >= nextStep.drawMatchday) {

        const winners = roundFixtures

          .map((f) => {

            if (!f.result) return f.homeId;

            return getCupMatchWinner(f.result) === "home" ? f.homeId : f.awayId;

          });

        // Auto-create final fixture without draw

        if (winners.length === 2) {

          const nextStepWithDraw = { matchday: nextStep.matchday, round: nextStep.round, drawMatchday: nextStep.drawMatchday };

          const built = buildNextRound("cup", lg, step.round, winners, nextStepWithDraw, roundIdx + 1);

          list.push(...built);

        }

      }

    }

  }

}



function advanceCupForLeague(save: SaveGame, lg: LeagueId) {

  let next: SaveGame = save;

  const list = next.cupFixtures[lg];

  if (!list) return; // No cup for this league

  

  const leagueMd = next.currentMatchday[lg];

  

  // Get the dynamic cup structure for this league's country

  const country = LEAGUES[lg]?.country;

  if (!country) return;

  

  // Check if user is in the same country (not necessarily same league)

  const userCountry = LEAGUES[next.myLeague]?.country;

  const isUserCountry = country === userCountry;

  

  const structure = (save.cupFixtures as any)[`${lg}_structure`] || getCupStructureForCountry(country);

  const cupSchedule = structure.schedule;

  

  // Special case: if no fixtures exist yet, do nothing - calendar.tsx handles draw notifications based on game date

  

  // Get unique rounds that exist in this cup and sort them in order

  const roundOrder = cupSchedule.map(s => s.round);

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

    

    if (playedAll && nextStep && isUserCountry) {

      // If current round is complete and we've reached the draw matchday for next round

      // Skip draw for Final - auto-assign the final matchup

      if (nextStep.round === "Final" && leagueMd >= nextStep.drawMatchday) {

        const winners = roundFixtures

          .map((f) => {

            if (!f.result) return f.homeId;

            return getCupMatchWinner(f.result) === "home" ? f.homeId : f.awayId;

          });

        // Auto-create final fixture without draw

        if (winners.length === 2) {

          const nextStepWithDraw = { matchday: nextStep.matchday, round: nextStep.round, drawMatchday: nextStep.drawMatchday };

          const built = buildNextRound("cup", lg, step.round, winners, nextStepWithDraw, roundIdx + 1);

          list.push(...built);

        }

      }

    }

    

    if (!playedAll && leagueMd > step.matchday) {

      // sim unplayed

      for (const f of roundFixtures) {

        if (f.result) continue;

        const sim = simulateFixtureInline(save, f, false, true);

        const idx = list.findIndex((x) => x.id === f.id);

        if (idx >= 0) list[idx] = sim;

        save = applyMatchToStats(save, sim);

      }

    }

    

    const playedAllAfterSim = roundFixtures.every((f) => f.result);

    if (playedAllAfterSim) {

      if (!nextStep) {

        // final winner

        const final = list.find((f) => f.round === "Final");

        if (final?.result && !save.cupChampion[lg]) {

          const champ = getCupMatchWinner(final.result) === "home" ? final.homeId : final.awayId;

          save.cupChampion[lg] = champ;

        }

        continue;

      }

      const alreadyBuilt = list.some((f) => f.round === nextStep.round);

      if (!alreadyBuilt && !isUserCountry) {

        // For non-user leagues, auto-build next round

        const winners = roundFixtures

          .map((f) => {

            if (!f.result) return f.homeId;

            return getCupMatchWinner(f.result) === "home" ? f.homeId : f.awayId;

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

          save.uclChampion = getCupMatchWinner(final.result) === "home" ? final.homeId : final.awayId;

        }

        continue;

      }

      const alreadyBuilt = list.some((f) => f.round === next.round);

      if (!alreadyBuilt) {

        const winners = list

          .filter((f) => f.round === step.round)

          .map((f) => getCupMatchWinner(f.result!) === "home" ? f.homeId : f.awayId);

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

export function autoDrawForeignCups(save: SaveGame, currentDate?: string): SaveGame {

  let next: SaveGame = JSON.parse(JSON.stringify(save));

  const userLeague = next.myLeague;

  const userCountry = LEAGUES[userLeague]?.country;

  // Cup starts July 7, 2025. cupDayOffset = days since July 7th.
  const CUP_START = new Date("2025-07-07T00:00:00Z");
  const todayDate = currentDate ? new Date(currentDate + "T00:00:00Z") : new Date();
  const cupDayOffset = Math.floor((todayDate.getTime() - CUP_START.getTime()) / 86400000);

  // Get all VIP leagues (Big 5 + Belgium + Netherlands + Portugal + Turkey)

  const vipLeagues = [...BIG5_LEAGUES, ...IMPORTANT_LEAGUES] as LeagueId[];

  

  // Filter out leagues from the user's country (we handle that interactively)

  const foreignVipLeagues = vipLeagues.filter(lg => {

    const country = LEAGUES[lg]?.country;

    return country && country !== userCountry;

  });

  

  for (const lg of foreignVipLeagues) {

    const country = LEAGUES[lg]?.country;

    if (!country) continue;

    

    // Skip if this is the user's country

    if (country === userCountry) continue;

    

    // Find the primary league for this country (the league that holds the cup)

    const primaryLeague = getPrimaryLeagueForCountry(country) as LeagueId;

    if (!primaryLeague) continue;

    

    let list = next.cupFixtures[primaryLeague];

    if (!list) continue;

    

    // Always recalculate fresh cup data to avoid stale saves
    const freshCupData = initCup(country);
    const freshSchedule = getCupStructureForCountry(country).schedule;


    // Detect and reset stale cup data with wrong number of fixtures (from old buggy saves)
    if (list.length > 0) {
      const expectedPrelimMatches = Math.floor(freshCupData.preliminaryParticipants.length / 2);
      const prelimFixtures = list.filter(f => f.round === "Preliminar");
      // If Preliminar exists but has significantly fewer matches than expected, reset
      if (prelimFixtures.length > 0 && expectedPrelimMatches > 1 && prelimFixtures.length < expectedPrelimMatches * 0.8) {
        next.cupFixtures[primaryLeague] = [];
        delete (next.cupFixtures as any)[`${primaryLeague}_structure`];
        list = next.cupFixtures[primaryLeague];
      } else {
        // Also check first main round
        const firstMainStep = freshSchedule.find(s => s.round !== "Preliminar");
        if (firstMainStep) {
          const mainFixtures = list.filter(f => f.round === firstMainStep.round);
          const expectedMainMatches = Math.floor(
            (freshCupData.participants.length + Math.floor(freshCupData.preliminaryParticipants.length / 2)) / 2
          );
          if (mainFixtures.length > 0 && expectedMainMatches > 1 && mainFixtures.length < expectedMainMatches * 0.8) {
            next.cupFixtures[primaryLeague] = [];
            delete (next.cupFixtures as any)[`${primaryLeague}_structure`];
            list = next.cupFixtures[primaryLeague];
          }
        }
      }
    }

    // Use fresh schedule (not the potentially stale saved structure)
    const cupSchedule = freshSchedule;

    // Special case: if no fixtures exist yet, trigger first round draw

    if (list.length === 0) {

      const firstRound = cupSchedule[0];

      if (firstRound && cupDayOffset >= firstRound.drawMatchday) {

        // Reuse already-computed fresh cup data
        const cupData = freshCupData;

        

        // Auto-simulate preliminary round if it exists

        if (firstRound.round === "Preliminar") {

          // Use only preliminary participants for the preliminary round

          const preliminaryTeams = cupData.preliminaryParticipants || [];

          

          // Create preliminary fixtures and simulate them

          const preliminaryFixtures: Fixture[] = [];

          for (let i = 0; i < preliminaryTeams.length; i += 2) {

            if (i + 1 < preliminaryTeams.length) {

              preliminaryFixtures.push({

                id: `cup-${primaryLeague}-prelim-${i}`,

                competition: "cup",

                league: primaryLeague,

                matchday: firstRound.matchday,

                round: firstRound.round,

                homeId: preliminaryTeams[i],

                awayId: preliminaryTeams[i + 1],

              });

            }

          }

          

          // Simulate all preliminary fixtures
          const simulatedPrelimFixtures: Fixture[] = [];

          for (const f of preliminaryFixtures) {

            const simmed = simulateFixtureInline(next, f, false, true);
            simulatedPrelimFixtures.push(simmed);
            next = applyMatchToStats(next, simmed);

          }

          // Re-sync list after applyMatchToStats reassigned next
          list = next.cupFixtures[primaryLeague]!;
          for (const simmed of simulatedPrelimFixtures) {
            const idx = list.findIndex(x => x.id === simmed.id);
            if (idx >= 0) {
              list[idx] = simmed;
            } else {
              list.push(simmed);
            }
          }

          

          // Get winners for next round from the simulated fixtures in list

          const winners = preliminaryFixtures.map(f => {

            const simmed = list.find(x => x.id === f.id);

            if (!simmed || !simmed.result) return f.homeId;

            return getCupMatchWinner(simmed.result) === "home" ? simmed.homeId : simmed.awayId;

          });

          

          // Auto-create next round fixtures

          const nextStep = cupSchedule[1];

          if (nextStep) {

            // Combine winners with main bracket participants

            const mainBracketTeams = cupData.participants.filter(id => !preliminaryTeams.includes(id));

            const drawTeams = [...winners, ...mainBracketTeams];

            const nextStepWithDraw = { matchday: nextStep.matchday, round: nextStep.round, drawMatchday: nextStep.drawMatchday };

            const built = buildNextRound("cup", primaryLeague, firstRound.round, drawTeams, nextStepWithDraw, 1);

            list.push(...built);

          }

        } else {

          // No preliminary round, create first round fixtures directly

          const cupTeams = cupData.participants;

          const nextStepWithDraw = { matchday: firstRound.matchday, round: firstRound.round, drawMatchday: firstRound.drawMatchday };

          const built = buildNextRound("cup", primaryLeague, "", cupTeams, nextStepWithDraw, 0);

          list.push(...built);

        }

      }

    }

    

    // Auto-simulate remaining rounds for foreign countries

    // Re-sync list in case the Special case above created new fixtures (applyMatchToStats reassigns next)
    list = next.cupFixtures[primaryLeague]!;

    const roundOrder = cupSchedule.map(s => s.round);

    const existingRounds = [...new Set(list.map(f => f.round).filter((r): r is string => !!r))];

    const sortedRounds = existingRounds.sort((a, b) => 

      roundOrder.indexOf(a) - roundOrder.indexOf(b)

    );

    

    const dynamicSchedule = sortedRounds.map((round) => {

      const schedule = cupSchedule.find(s => s.round === round);

      if (!schedule) return null;

      return { matchday: schedule.matchday, round, size: 0, drawMatchday: schedule.drawMatchday };

    }).filter(Boolean) as Array<{ matchday: number; round: string; size: number; drawMatchday: number }>;

    

    for (let roundIdx = 0; roundIdx < dynamicSchedule.length; roundIdx++) {

      // Re-sync list in case applyMatchToStats reassigned next in a previous iteration
      list = next.cupFixtures[primaryLeague]!;

      const step = dynamicSchedule[roundIdx];

      const roundFixtures = list.filter((f) => f.round === step.round);

      if (roundFixtures.length === 0) continue;

      

      // Check if current round is complete

      const playedAll = roundFixtures.every((f) => f.result);

      // Find index of this round in the full cupSchedule (not dynamicSchedule)
      const fullRoundIdx = cupSchedule.findIndex(s => s.round === step.round);
      const nextStepFull = fullRoundIdx >= 0 ? cupSchedule[fullRoundIdx + 1] : undefined;

      // Check next round doesn't already have fixtures
      const nextRoundAlreadyExists = nextStepFull
        ? list.some(f => f.round === nextStepFull.round)
        : false;

      if (playedAll && nextStepFull && !nextRoundAlreadyExists && cupDayOffset >= nextStepFull.drawMatchday) {

        // Collect winners from this round
        const roundWinners = roundFixtures.map((f) => {
          if (!f.result) return f.homeId;
          return getCupMatchWinner(f.result) === "home" ? f.homeId : f.awayId;
        });

        let drawTeams = roundWinners;

        // If current round is Preliminar, combine winners with bye teams for the main bracket
        if (step.round === "Preliminar") {
          const cupData = initCup(country);
          const prelimTeamIds = cupData.preliminaryParticipants || [];
          const mainBracketTeams = cupData.participants.filter(id => !prelimTeamIds.includes(id));
          drawTeams = [...roundWinners, ...mainBracketTeams];
        }

        // Auto-create next round fixtures
        const nextStepWithDraw = { matchday: nextStepFull.matchday, round: nextStepFull.round, drawMatchday: nextStepFull.drawMatchday };
        const built = buildNextRound("cup", primaryLeague, step.round, drawTeams, nextStepWithDraw, fullRoundIdx + 1);
        list.push(...built);

      }

      

      // Simulate unplayed fixtures in current round

      if (!playedAll && cupDayOffset >= step.matchday) {

        for (const f of roundFixtures) {

          if (!f.result) {

            const simmed = simulateFixtureInline(next, f, false, true);
            next = applyMatchToStats(next, simmed);
            // Re-sync list after applyMatchToStats reassigns next
            list = next.cupFixtures[primaryLeague]!;

            const idx = list.findIndex(x => x.id === f.id);

            if (idx >= 0) {

              list[idx] = simmed;

            } else {
              list.push(simmed);
            }

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

  

  // Get the dynamic cup structure for this league's country

  const country = LEAGUES[league]?.country;

  if (!country) {

    console.error(`Country not found for league: ${league}`);

    return next;

  }

  

  const structure = (next.cupFixtures as any)[`${league}_structure`] || getCupStructureForCountry(country);

  const cupSchedule = structure.schedule;

  

  // Find the matchday for this round from the dynamic schedule

  const roundSchedule = cupSchedule.find(s => s.round === round);

  if (!roundSchedule) {

    console.error(`Round ${round} not found in cup schedule`);

    return next;

  }

  

  // matchday in schedule = day offset from July 7th (draw=0, match=1, draw=2, match=3...)

  const matchDayOffset = roundSchedule.matchday;

  

  console.log(`Creating ${matchups.length} fixtures for day offset ${matchDayOffset} from July 7th (round: ${round})`);

  

  // Create fixtures from matchups

  for (let i = 0; i < matchups.length; i++) {

    const [home, away] = matchups[i];

    const fixture = {

      id: `cup-${league}-${round}-${i}`,

      competition: "cup" as const,

      league,

      matchday: matchDayOffset, // day offset from July 7th

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


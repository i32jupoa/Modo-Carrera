import { Team, TEAMS, teamById } from "./teams";
import playersData from "./players.json";

export type Position = "GK" | "DEF" | "MID" | "FWD";

export type Player = {
  id: string;
  name: string;
  position: Position;
  rating: number;
  age: number;
  teamId: string;
  marketValue: number;
  isReal: boolean;
  goals: number;
  assists: number;
  appearances: number;
  injuredUntil: number;
  injuryReason?: string;
  morale: number;
  formHistory: number[];
  cardImage?: string;
};

// ==================== PERCENTAGE-BASED MARKET VALUATION SYSTEM ====================
// Based on specification:
// 1. Media (50%) - Base value from rating
// 2. Edad (20%) - Age multiplier  
// 3. Posición (15%) - Position adjustment
// 4. Nivel del equipo (15%) - Team prestige
// Max value: €220M

const MAX_GLOBAL_VALUE = 220; // €165M maximum (220 * 0.75 after 25% global discount)
const GLOBAL_DISCOUNT = 0.75; // 25% cheaper for all players

// Base value table per rating - maps OVR to realistic market value
// This represents 50% of the final calculation
const RATING_BASE_VALUES: Record<number, number> = {
  94: 180, 93: 165, 92: 150, 91: 135, 90: 120,  // Elite world class
  89: 105, 88: 90, 87: 78, 86: 68, 85: 60,      // Top players
  84: 52, 83: 45, 82: 40, 81: 35, 80: 30,       // Very good
  79: 25, 78: 20, 77: 16, 76: 13, 75: 10,       // Good
  74: 8, 73: 6.5, 72: 5, 71: 4, 70: 3,          // Solid
  69: 2.2, 68: 1.6, 67: 1.2, 66: 0.9, 65: 0.7,  // Average
  64: 0.5, 63: 0.4, 62: 0.3, 61: 0.25, 60: 0.2, // Squad player
  59: 0.15, 58: 0.12, 57: 0.1, 56: 0.08, 55: 0.06, // Backup
  54: 0.05, 53: 0.04, 52: 0.03, 51: 0.02, 50: 0.01
};

// 1. MEDIA (50%) - Base value lookup
function getBaseValueFromRating(rating: number): number {
  const floorRating = Math.floor(rating);
  // Interpolate between ratings
  const lower = RATING_BASE_VALUES[floorRating] || 0.01;
  const upper = RATING_BASE_VALUES[floorRating + 1] || lower;
  const fraction = rating - floorRating;
  return lower + (upper - lower) * fraction;
}

// 2. EDAD - Detailed age multiplier table as specified
// Applied AFTER 25% global discount
function ageMultiplier(age: number, pos: string): number {
  // Special case: Midfielders 23 or younger get +25% extra (kept from previous)
  const isYoungMidfielder = age <= 23 && (pos === "CM" || pos === "MC" || pos === "MID" || pos === "CAM" || pos === "MCO" || pos === "CDM" || pos === "MCD");
  
  // Age table as specified:
  // 16-17: +5% (x1.05) - Young talents
  // 18-19: +14% (x1.14) - Emerging talent
  // 20-21: +16% (x1.16) - High projection
  // 22-23: +20% (x1.20) - Start of optimal age
  // 24-26: +23% (x1.23) - Maximum optimal age
  // 27-29: +16% (x1.16) - Still high, good experience
  // 30-31: +7% (x1.07) - Depreciation begins
  // 32-33: 0% (x1.00) - Base price, veteran
  // 34-35: -10% (x0.90) - Clear depreciation
  // 36+: -20% (x0.80) - Very veteran
  let ageMult: number;
  if (age <= 17) ageMult = 1.1;
  else if (age <= 19) ageMult = 1.5;
  else if (age <= 21) ageMult = 1.6;
  else if (age <= 23) ageMult = 1.6;
  else if (age <= 26) ageMult = 1.64;  // Peak: 24-26
  else if (age <= 29) ageMult = 1.45;
  else if (age <= 31) ageMult = 1.15;
  else if (age <= 33) ageMult = 1.00;
  else if (age <= 35) ageMult = 0.7;
  else ageMult = 0.4;  // 36+
  
  // Young midfielders (≤23): +25% extra (kept from previous request)
  if (isYoungMidfielder) {
    return ageMult * 1.4;
  }
  
  return ageMult;
}

// 3. POSICIÓN (15%) - Position adjustment as specified + custom modifiers
// Attacking positions: +5% base + 25% extra for forwards = +30% total (x1.30)
// Defensive/GK: -5% base - 40% extra for keepers = -45% total (x0.55)
// Ei, Ed, Md, Mi: +30% extra (as requested)
// Midfield: 0% base
function positionMultiplier(pos: string, age: number): number {
  const forwardPositions = new Set(["ST", "CF", "DC", "FWD"]);
  const wingerPositions = new Set(["LW", "RW", "LM", "RM", "CAM", "MCO"]);
  const defensivePositions = new Set(["CB", "DFC", "DEF", "LB", "RB", "LWB", "RWB", "CDM", "MCD"]);
  const keeperPositions = new Set(["GK", "POR"]);
  const midfieldPositions = new Set(["CM", "MC", "MID"]);
  
  // Base multipliers
  let baseMult = 1.0;
  if (forwardPositions.has(pos)) baseMult = 1.05;  // +5% base for forwards
  else if (wingerPositions.has(pos)) baseMult = 1.05;  // +5% base for wingers/attacking mids
  else if (defensivePositions.has(pos)) baseMult = 0.95;  // -5% for defenders
  else if (keeperPositions.has(pos)) baseMult = 0.95;  // -5% base for keepers
  else if (midfieldPositions.has(pos)) baseMult = 1.0;  // 0% for central midfielders
  
  // Additional modifiers:
  // Goalkeepers: 40% cheaper (additional x0.60 on top of base)
  if (keeperPositions.has(pos)) {
    return baseMult * 0.60;  // Keepers 40% cheaper total
  }
  
  // Forwards: 25% more expensive (additional x1.25 on top of base +5%)
  if (forwardPositions.has(pos)) {
    return baseMult * 1.25;  // Forwards 25% extra = 1.05 * 1.25 = 1.3125 (~+31%)
  }
  
  // Ei (Extremo Izquierdo/LW), Ed (Extremo Derecho/RW), 
  // Mi (Medio Izquierdo/LM), Md (Medio Derecho/RM) +30% extra
  const expensiveWingers = new Set(["LW", "RW", "LM", "RM"]);
  if (expensiveWingers.has(pos)) {
    return baseMult * 1.30;  // +30% extra for Ei, Ed, Mi, Md
  }
  
  // Mediocentro Defensivo (MD/CDM/MCD) also gets +30%
  if (pos === "CDM" || pos === "MCD") {
    return baseMult * 1.30;  // +30% extra for Md (Mediocentro Defensivo)
  }
  
  return baseMult;
}

// 4. NIVEL DEL EQUIPO (15%) - Team/Club multiplier as specified
// Equipo top (media >80 o grandes ligas): +15% (x1.15)
// Equipo medio (media 70–80): +10% (x1.10)
// Equipo bajo (media <70): 0% (x1.0)

const TOP_LEAGUES = new Set(["laliga", "premier", "seriea", "bundesliga", "ligue1"]);
const MID_LEAGUES = new Set(["laliga2", "championship", "serieb", "bundesliga2", "ligue2", "ligaportugal", "eredivisie"]);

function teamMultiplier(teamAvgRating: number, leagueId: string): number {
  // Check league tier first
  if (TOP_LEAGUES.has(leagueId)) return 1.15;
  if (MID_LEAGUES.has(leagueId)) return 1.10;
  
  // Check team rating for non-standard leagues
  if (teamAvgRating > 80) return 1.15;
  if (teamAvgRating >= 70) return 1.10;
  return 1.0;
}

// Generate transfermarkt-style value string
export function formatMarketValue(valueM: number): string {
  if (valueM >= 100) return `€${(valueM).toFixed(0)}M`;
  if (valueM >= 10) return `€${(valueM).toFixed(1)}M`;
  if (valueM >= 1) return `€${(valueM).toFixed(2)}M`;
  return `€${Math.round(valueM * 1000)}K`;
}

// Main valuation function - PERCENTAGE-BASED as specified
// 1. Media (50%) - Base value from rating
// 2. Edad (20%) - Age multiplier  
// 3. Posición (15%) - Position adjustment
// 4. Nivel del equipo (15%) - Team prestige
export function marketValueFor(
  rating: number, 
  age: number, 
  pos = "MID", 
  teamId = "",
  leagueId = "",
  goals = 0,
  assists = 0,
  appearances = 0,
  isStar = false,
  teamAvgRating = 75
): { value: number; explanation: string } {
  
  if (rating < 55) return { value: 0.05, explanation: "Jugador amateur sin valor de mercado" };
  
  // 1. MEDIA (50%) - Base value from rating table
  const baseValue = getBaseValueFromRating(rating);
  
  // 2. EDAD (20%) - Age multiplier (with position for young midfielder bonus)
  const ageMult = ageMultiplier(age, pos);
  
  // 3. POSICIÓN (15%) - Position adjustment (with age for calculations)
  const posMult = positionMultiplier(pos, age);
  
  // 4. NIVEL DEL EQUIPO (15%) - Team/club multiplier
  const teamMult = teamMultiplier(teamAvgRating, leagueId);
  
  // Calculate final value with all multipliers + 25% global discount
  let finalValue = baseValue * ageMult * posMult * teamMult * GLOBAL_DISCOUNT;
  
  // Progressive discounts based on rating (OVR)
  // ≤82: -40%, ≤80: -20% adicional, ≤75: -20% adicional, ≤70: -20% adicional
  if (rating <= 85) {
    finalValue *= 0.75;  // -20%
  }
  if (rating <= 82) {
    finalValue *= 0.65;  // -35%
  }
  if (rating <= 80) {
    finalValue *= 0.60;  // -20% adicional
  }
  if (rating <= 75) {
    finalValue *= 0.60;  // -20% adicional
  }
  if (rating <= 70) {
    finalValue *= 0.60;  // -20% adicional
  }
  
  // Special rule: Players with <=85 OVR and 28+ years get -40% (except goalkeepers)
  const isGoalkeeper = pos === "GK" || pos === "POR";
  if (rating <= 85 && age >= 28 && !isGoalkeeper) {
    finalValue *= 0.60;  // 40% discount
  }
  
  // 40% discount for players NOT in top 5 leagues (laliga, premier, seriea, bundesliga, ligue1)
  const top5Leagues = new Set(["laliga", "premier", "seriea", "bundesliga", "ligue1"]);
  if (!top5Leagues.has(leagueId)) {
    finalValue *= 0.85;  // -40% for non-top-5 leagues
  }
  
  // 25% discount for players in top 5 leagues with team average <= 80
  if (top5Leagues.has(leagueId) && teamAvgRating <= 80) {
    finalValue *= 0.85;  // -15% for weaker teams in top leagues
    console.log(`DISCOUNT APPLIED: ${pos} player in ${leagueId}, teamAvg: ${teamAvgRating}`);
  }
  
  // Cap at global maximum (already reduced by 25%)
  finalValue = Math.min(finalValue, MAX_GLOBAL_VALUE);
  
  // Minimum value floor
  finalValue = Math.max(0.08, finalValue);
  
  // Round to 2 decimals
  finalValue = Math.round(finalValue * 100) / 100;
  
  // Generate explanation
  const reasons: string[] = [];
  
  if (rating >= 90) reasons.push("jugador de clase mundial");
  else if (rating >= 87) reasons.push("jugador de élite");
  else if (rating >= 84) reasons.push("muy buen nivel");
  else if (rating >= 80) reasons.push("buen nivel");
  
  if (age < 22) reasons.push("jóven proyección");
  else if (age <= 29) reasons.push("edad óptima");
  else reasons.push("veterano");
  
  const attackingPositions = new Set(["ST", "CF", "DC", "LW", "RW", "CAM", "MCO", "FWD", "LM", "RM"]);
  const defensivePositions = new Set(["CB", "DFC", "DEF", "GK", "POR", "LB", "RB", "LWB", "RWB", "CDM", "MCD"]);
  if (attackingPositions.has(pos)) reasons.push("posición ofensiva");
  if (defensivePositions.has(pos)) reasons.push("posición defensiva");
  
  if (TOP_LEAGUES.has(leagueId)) reasons.push("liga top");
  else if (MID_LEAGUES.has(leagueId)) reasons.push("liga media");
  else reasons.push("liga menor");
  
  // Add explanation for rating discounts
  if (rating <= 70) {
    reasons.push("media baja ≤70 (descuento máximo)");
  } else if (rating <= 75) {
    reasons.push("media baja ≤75 (descuento alto)");
  } else if (rating <= 80) {
    reasons.push("media ≤80 (descuento medio)");
  } else if (rating <= 82) {
    reasons.push("media ≤82 (descuento 40%)");
  }
  
  // Add explanation for 40% discount on veterans
  if (rating <= 85 && age >= 28 && !isGoalkeeper) {
    reasons.push("jugador veterano con media baja (descuento adicional)");
  }
  
  // Add explanation for non-top-5 league discount
  if (!top5Leagues.has(leagueId)) {
    reasons.push("liga fuera top 5 (descuento 40%)");
  }
  
  // Add explanation for weak top-5 team discount
  if (top5Leagues.has(leagueId) && teamAvgRating <= 80) {
    reasons.push("equipo débil en top 5 (descuento 25%)");
  }
  
  const explanation = reasons.length > 0 
    ? `Valorado en ${formatMarketValue(finalValue)}: ${reasons.join(", ")}.`
    : `Valor estándar de mercado para jugador ${pos} de ${age} años y media ${rating}.`;
  
  return { value: finalValue, explanation };
}

// Legacy function for backwards compatibility
export function legacyMarketValueFor(rating: number, age: number, pos = "MID", teamAvgRating = 75): number {
  const result = marketValueFor(rating, age, pos, "", "", 0, 0, 0, false, teamAvgRating);
  return result.value;
}

function mapPosition(pos: string): Position {
  const up = String(pos || "MID").toUpperCase();
  if (up === "GK") return "GK";
  if (["CB", "LB", "RB", "LWB", "RWB", "DEF"].includes(up)) return "DEF";
  if (["CM", "CDM", "CAM", "LM", "RM", "MID"].includes(up)) return "MID";
  return "FWD"; // ST, LW, RW, CF
}

// Vincula de manera inteligente el string del JSON con los IDs compatibles de teams.ts
function findTeamIdForPlayer(jsonTeamName: string): string {
  if (!jsonTeamName) return "free_agent";
  const normalizedJson = jsonTeamName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Comparamos con los 96 equipos estáticos principales primero
  const match = TEAMS.find(t => {
    const cleanTeamName = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedJson === cleanTeamName || normalizedJson.includes(cleanTeamName) || cleanTeamName.includes(normalizedJson);
  });

  if (match) return match.id;

  // Si es un equipo nuevo del JSON, devolvemos su ID formateado de forma segura
  return jsonTeamName.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

let cachedSquads: Record<string, Player[]> | null = null;
const CACHE_VERSION = 14; // Added discount logging for debugging

export function invalidateSquadsCache() {
  cachedSquads = null;
}

export function generateAllSquads(): Record<string, Player[]> {
  // Always regenerate to ensure fresh market values with new system
  // (Remove this check if performance becomes an issue)
  // if (cachedSquads) return cachedSquads;

  const map: Record<string, Player[]> = {};
  
  // Inicializamos las listas de todos los equipos registrados en el sistema
  TEAMS.forEach(t => {
    map[t.id] = [];
  });
  map["free_agent"] = [];

  const dataArray = Array.isArray(playersData) ? playersData : [];
  
  // PASO 1: Primero recolectamos todos los jugadores sin calcular valores de mercado
  const rawPlayers: Array<{
    id: string;
    name: string;
    position: Position;
    rating: number;
    age: number;
    teamId: string;
    leagueId: string;
    pos: string;
    cardImage: string;
    rawData: any;
    idx: number;
  }> = [];
  
  const teamRatings: Record<string, number[]> = {};
  
  dataArray.forEach((p: any, idx: number) => {
    const rating = p.OVR || p.rating || 70;
    const age = p.Age || p.age || 24;
    const position = mapPosition(p.Position || p.position || "MID");
    const jsonTeamName = p.Team || p.Club || p.team || p.club || "";
    
    const teamId = findTeamIdForPlayer(jsonTeamName);
    const team = teamById(teamId);
    const leagueId = team?.league || "";
    const effectiveTeamId = map[teamId] ? teamId : "free_agent";
    
    // Acumulamos ratings por equipo para calcular la media
    if (!teamRatings[effectiveTeamId]) {
      teamRatings[effectiveTeamId] = [];
    }
    teamRatings[effectiveTeamId].push(rating);
    
    rawPlayers.push({
      id: p.ID ? String(p.ID) : `p-${idx}`,
      name: p.Name || p.name || "Jugador",
      position,
      rating,
      age,
      teamId: effectiveTeamId,
      leagueId,
      pos: p.Position || "MID",
      cardImage: p.card || p.cardImage || p.PhotoUrl || "",
      rawData: p,
      idx
    });
  });
  
  // Calculamos la media de cada equipo
  const teamAverages: Record<string, number> = {};
  for (const [tid, ratings] of Object.entries(teamRatings)) {
    teamAverages[tid] = ratings.length > 0 
      ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
      : 75;
  }
  
  // PASO 2: Calculamos valores de mercado con las medias de equipo reales
  rawPlayers.forEach((rp) => {
    const teamAvgRating = teamAverages[rp.teamId] || 75;
    
    const marketValueResult = marketValueFor(
      rp.rating, 
      rp.age, 
      rp.pos,
      rp.teamId,
      rp.leagueId,
      0, 0, 0,
      false,
      teamAvgRating
    );
    
    const playerObj: Player = {
      id: rp.id,
      name: rp.name,
      position: rp.position,
      rating: rp.rating,
      age: rp.age,
      teamId: rp.teamId,
      marketValue: marketValueResult.value,
      isReal: true,
      goals: 0,
      assists: 0,
      appearances: 0,
      injuredUntil: 0,
      morale: 70,
      formHistory: [],
      cardImage: rp.cardImage
    };

    if (map[rp.teamId]) {
      map[rp.teamId].push(playerObj);
    } else {
      map["free_agent"].push(playerObj);
    }
  });

  // Ordenamos las alineaciones para poner los mejores jugadores arriba y proteger de arrays vacíos
  const order: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  TEAMS.forEach(t => {
    if (map[t.id]) {
      map[t.id].sort((a, b) => order[a.position] - order[b.position] || b.rating - a.rating);
      
      // Si un equipo del JSON viene muy vacío (menos de 11), le inyectamos Agentes Libres para que no rompa la UI
      while (map[t.id].length < 15 && map["free_agent"].length > 0) {
        const filler = map["free_agent"].pop();
        if (filler) {
          map[t.id].push({ ...filler, teamId: t.id, id: `${t.id}-filler-${filler.id}` });
        }
      }
    }
  });

  cachedSquads = map;
  return map;
}

export function generateSquad(team: Team): Player[] {
  const all = generateAllSquads();
  return all[team.id] || [];
}

export function defaultLineup(squad: Player[], unavailable: Set<string> = new Set()): string[] {
  const available = squad.filter((p) => !unavailable.has(p.id));
  const pickN = (pos: Position, n: number) =>
    available.filter((p) => p.position === pos).slice(0, n).map((p) => p.id);
  
  const lineup = [...pickN("GK", 1), ...pickN("DEF", 4), ...pickN("MID", 3), ...pickN("FWD", 3)];
  
  // Si falta gente, rellenamos con lo que sea hasta tener 11 IDs
  if (lineup.length < 11) {
    const used = new Set(lineup);
    const rest = available.filter(p => !used.has(p.id)).sort((a, b) => b.rating - a.rating);
    while (lineup.length < 11 && rest.length > 0) {
      lineup.push(rest.shift()!.id);
    }
  }
  return lineup;
}

export function avgForm(p: Player): number {
  if (p.formHistory.length === 0) return 50;
  const avg = p.formHistory.reduce((a, b) => a + b, 0) / p.formHistory.length;
  return Math.round(avg * 10);
}
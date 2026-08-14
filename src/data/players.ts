import { Team, TEAMS, teamById, findTeamStrict } from "./teams";
import playersData from "./playersData";
import { buildPositions, canPlayPosition, isNaturalFor, playerPosCodes, type PosCode } from "@/lib/positions";

export type Position = "GK" | "DEF" | "MID" | "FWD";

export type Player = {
  id: string;
  name: string;
  position: Position;
  /** Demarcaciones reales (principal + alternativas), todas al mismo nivel. */
  positions?: PosCode[];
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

// ==================== REALISTIC MARKET VALUATION SYSTEM ====================
// Modelo único basado en una curva suave (sin descuentos apilados) para que
// el "valor de mercado" que ve el usuario en el buscador sea la MISMA base
// que usa el motor de negociación (ver src/lib/transfers/MarketValuation.ts).
// Antes existían decenas de multiplicadores y descuentos porcentuales
// aplicados en cadena (edad, posición, liga, media del equipo, umbrales de
// rating...) que hacían que casi cualquier jugador de 90+ de un equipo top
// terminara exactamente en el mismo techo de 220M, sin diferenciar a un
// Mbappé de un Haaland de un canterano de 90 en un equipo pequeño. Esta
// versión usa una curva continua por posición, con techos realistas
// (inspirados en las valoraciones más altas del mercado real) y sin saltos
// bruscos entre rating 85 y 86 o entre liga "top" y "media".

type PositionGroupKey = "GK" | "DEF" | "MID" | "FWD";

/** Techo de valor por grupo de posición (en millones de €). Techo global
 *  absoluto añadido más abajo (GLOBAL_MAX_VALUE_M) para que ni el mejor
 *  jugador del juego supere el fichaje más caro de la historia real
 *  (≈220M, Mbappé al PSG). */
const POSITION_VALUE_CAP: Record<PositionGroupKey, number> = {
  GK: 75,
  DEF: 130,
  MID: 165,
  FWD: 200,
};

/** Techo absoluto en millones de € para CUALQUIER valor o precio del juego
 *  (valor de mercado, precio de negociación, cláusula...). Ni el mejor
 *  jugador del mundo en las mejores condiciones puede superarlo. */
export const GLOBAL_MAX_VALUE_M = 220;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function positionGroupKey(pos: string): PositionGroupKey {
  const up = String(pos || "MID").toUpperCase();
  if (up === "GK" || up === "POR") return "GK";
  if (["CB", "DFC", "DEF", "LB", "RB", "LWB", "RWB"].includes(up)) return "DEF";
  if (["CDM", "MCD", "CM", "MC", "MID", "CAM", "MCO", "LM", "RM", "MD", "MI"].includes(up)) return "MID";
  return "FWD"; // ST, CF, DC, LW, RW, FWD, Ei, Ed...
}

/** Matiz dentro de cada grupo: dos jugadores con el mismo rating no valen
 *  exactamente igual si uno es un extremo desequilibrante y el otro un
 *  pivote defensivo, aunque ambos entren en el grupo "MID". */
function positionRoleModifier(pos: string): number {
  const up = String(pos || "").toUpperCase();
  // Extremos y mediapuntas ofensivos: más valorados por su rareza y atractivo
  if (["LW", "RW", "CAM", "MCO", "LM", "RM", "MD", "MI"].includes(up)) return 1.12;
  // Mediocentros defensivos: menos valorados por su rol más limitado
  if (["CDM", "MCD"].includes(up)) return 0.88;
  // Delanteros centro: valorados por su rol principal
  if (["ST", "CF", "DC"].includes(up)) return 1.08;
  // Centrales defensivos: menos valorados que laterales por su rol más estático
  if (["CB", "DFC", "DEF"].includes(up)) return 0.92;
  // Laterales: valorados por su versatilidad y rareza
  if (["LB", "RB", "LWB", "RWB"].includes(up)) return 1.05;
  return 1.0; // mediocentros puros, GK, etc.
}

/** Curva de rating: continua y muy progresiva (exponente alto). Un jugador
 *  de 91 (el máximo real del juego) se acerca al techo de su posición; un
 *  jugador de 80 se queda en una fracción pequeña de ese techo, como ocurre
 *  en el mercado real, donde la diferencia de precio entre un 91 y un 85 es
 *  enorme y entre un 70 y un 65 es casi simbólica. */
function ratingCurve(rating: number): number {
  const normalized = clamp((rating - 35) / 59, 0, 1.02);
  return Math.pow(normalized, 7);
}

/** Curva de edad: pico entre 24 y 27, prima moderada a la proyección joven
 *  y caída progresiva (sin escalones) a partir de los 30. */
function ageCurveMultiplier(age: number): number {
  if (age <= 17) return 1.0;
  if (age <= 19) return 1.1;
  if (age <= 21) return 1.12;
  if (age <= 23) return 1.15;
  if (age <= 27) return 1.2;
  if (age <= 29) return 1.0;
  if (age <= 31) return 0.78;
  if (age <= 33) return 0.56;
  if (age <= 35) return 0.36;
  return 0.22;
}

const TOP_LEAGUES = new Set(["laliga", "premier", "seriea", "bundesliga", "ligue1"]);
const MID_LEAGUES = new Set(["laliga2", "championship", "serieb", "bundesliga2", "ligue2", "ligaportugal", "eredivisie", "roshnsaudileague"]);

/** Peso económico de la liga: las cinco grandes europeas no sufren
 *  penalización; las ligas "medias" pierden algo de valor; el resto, más. */
function leagueValueMultiplier(leagueId: string): number {
  if (TOP_LEAGUES.has(leagueId)) return 1.0;
  if (MID_LEAGUES.has(leagueId)) return 0.82;
  return 0.65;
}

/** Nivel del equipo: jugar en un equipo mejor sube ligeramente el valor
 *  (visibilidad, competición, calidad de juego alrededor), en un rango
 *  moderado para que no descompense el peso del rating y la edad. */
function teamValueMultiplier(teamAvgRating: number): number {
  return clamp(0.9 + (teamAvgRating - 65) / 130, 0.85, 1.1);
}

// Generate transfermarkt-style value string
export function formatMarketValue(valueM: number): string {
  if (valueM >= 100) return `€${(valueM).toFixed(0)}M`;
  if (valueM >= 10) return `€${(valueM).toFixed(1)}M`;
  if (valueM >= 1) return `€${(valueM).toFixed(2)}M`;
  return `€${Math.round(valueM * 1000)}K`;
}

// Main valuation function — curva continua por posición, edad, liga y equipo.
// Este es el ÚNICO valor de mercado del juego: tanto la interfaz de
// scouting como el motor de negociación (MarketValuation.ts) parten de este
// número, así que el precio que se negocia nunca se dispara muy por encima
// del valor que el usuario ve en la lista.
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

  const group = positionGroupKey(pos);
  const cap = POSITION_VALUE_CAP[group];

  const curve = ratingCurve(rating);
  const ageMult = ageCurveMultiplier(age);
  const roleMult = positionRoleModifier(pos);
  const leagueMult = leagueValueMultiplier(leagueId);
  const teamMult = teamValueMultiplier(teamAvgRating);

  let finalValue = cap * curve * ageMult * roleMult * leagueMult * teamMult;

  // Techo absoluto global: ni el mejor jugador del juego en las mejores
  // condiciones puede superar el fichaje más caro de la historia real.
  finalValue = Math.min(finalValue, GLOBAL_MAX_VALUE_M);
  finalValue = Math.max(0.08, finalValue);
  finalValue = Math.round(finalValue * 100) / 100;

  // Explicación legible para la ficha del jugador.
  const reasons: string[] = [];
  if (rating >= 90) reasons.push("jugador de clase mundial");
  else if (rating >= 87) reasons.push("jugador de élite");
  else if (rating >= 84) reasons.push("muy buen nivel");
  else if (rating >= 80) reasons.push("buen nivel");
  else if (rating >= 75) reasons.push("nivel sólido");
  else reasons.push("jugador de rol");

  if (age <= 21) reasons.push("gran proyección");
  else if (age <= 29) reasons.push("edad óptima");
  else reasons.push("veterano");

  if (group === "FWD" || group === "MID") reasons.push("posición ofensiva");
  else if (group === "DEF") reasons.push("posición defensiva");
  else reasons.push("portero");

  if (TOP_LEAGUES.has(leagueId)) reasons.push("liga top");
  else if (MID_LEAGUES.has(leagueId)) reasons.push("liga media");
  else reasons.push("liga menor");

  if (teamAvgRating >= 80) reasons.push("equipo de primer nivel");

  const explanation = `Valorado en ${formatMarketValue(finalValue)}: ${reasons.join(", ")}.`;

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

// Vincula el string de club del dataset con los IDs de teams.ts usando SOLO
// coincidencias exactas o alias declarados (y la liga, si está disponible).
// Cualquier club que no exista en el juego devuelve "free_agent", de forma que
// las plantillas iniciales son exactamente las de la base de datos.
function findTeamIdForPlayer(jsonTeamName: string, jsonLeagueName?: string): string {
  if (!jsonTeamName) return "free_agent";
  const team = findTeamStrict(jsonTeamName, jsonLeagueName);
  return team ? team.id : "free_agent";
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
    const jsonLeagueName = p.League || p.league || "";
    
    const teamId = findTeamIdForPlayer(jsonTeamName, jsonLeagueName);
    const team = teamId === "free_agent" ? null : teamById(teamId);
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
      positions: buildPositions(
        rp.rawData?.Position ?? rp.pos,
        rp.rawData?.["Alternative positions"],
      ),
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

  // Ordenamos las plantillas (mejores arriba). NO se inyectan jugadores de
  // relleno: la plantilla inicial de cada equipo es exactamente la que
  // aparece en la base de datos.
  const order: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  TEAMS.forEach(t => {
    if (map[t.id]) {
      map[t.id].sort((a, b) => order[a.position] - order[b.position] || b.rating - a.rating);
    }
  });


  cachedSquads = map;
  return map;
}

export function generateSquad(team: Team): Player[] {
  const all = generateAllSquads();
  return all[team.id] || [];
}

/**
 * Demarcaciones exactas del 4-3-3 por defecto, en el MISMO orden que los
 * huecos de FORMATION_COORDINATES["Táctica 4-3-3"]
 * (gk, lb, cb1, cb2, rb, cm1..cm3, lw, st, rw).
 */
const DEFAULT_LINEUP_SLOTS: PosCode[] = [
  "GK", "LI", "DFC", "DFC", "LD", "MC", "MC", "MC", "EI", "DC", "ED",
];

export function defaultLineup(squad: Player[], unavailable: Set<string> = new Set()): string[] {
  const available = squad.filter((p) => !unavailable.has(p.id));
  const byRating = [...available].sort((a, b) => b.rating - a.rating);
  const used = new Set<string>();
  // Mantenemos los índices alineados con los huecos de la formación:
  // si un hueco se queda vacío NO se desplazan los demás.
  const lineup: string[] = DEFAULT_LINEUP_SLOTS.map(() => "");

  // 1ª pasada: sólo demarcación exacta (sin privilegiar la principal).
  DEFAULT_LINEUP_SLOTS.forEach((slot, i) => {
    const pick = byRating.find((p) => !used.has(p.id) && isNaturalFor(playerPosCodes(p), slot));
    if (pick) {
      used.add(pick.id);
      lineup[i] = pick.id;
    }
  });

  // 2ª pasada: demarcaciones casi idénticas (LD↔CAD, DC↔SD, MC↔MCD/MCO...).
  DEFAULT_LINEUP_SLOTS.forEach((slot, i) => {
    if (lineup[i]) return;
    const pick = byRating.find((p) => !used.has(p.id) && canPlayPosition(playerPosCodes(p), slot));
    if (pick) {
      used.add(pick.id);
      lineup[i] = pick.id;
    }
  });

  // 3ª pasada: si aún queda algún hueco sin nadie válido, se rellena con el
  // mejor disponible para no dejar el 11 incompleto.
  const rest = byRating.filter((p) => !used.has(p.id));
  for (let i = 0; i < lineup.length; i++) {
    if (lineup[i]) continue;
    const pick = rest.shift();
    if (!pick) break;
    used.add(pick.id);
    lineup[i] = pick.id;
  }

  return lineup.filter((id) => id !== "");
}

export function avgForm(p: Player): number {
  if (p.formHistory.length === 0) return 50;
  const avg = p.formHistory.reduce((a, b) => a + b, 0) / p.formHistory.length;
  return Math.round(avg * 10);
}

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

function positionCap(pos: string): number {
  const up = String(pos || "").toUpperCase();
  if (up === "GK") return 85;
  if (["CB", "LB", "RB", "LWB", "RWB", "DEF"].includes(up)) return 140;
  return 200;
}

function ageMultiplier(age: number): number {
  if (age <= 20) return 1.0;
  if (age <= 23) return 0.95;
  if (age <= 27) return 0.85;
  if (age <= 30) return 0.65;
  if (age <= 33) return 0.4;
  return 0.2;
}

export function marketValueFor(rating: number, age: number, pos = "MID", teamAvgOvr = 75): number {
  if (rating < 50) return 0.1;
  const cap = positionCap(pos);
  const normalizedOvr = Math.max(0, Math.min(1, (rating - 50) / 45));
  const base = Math.pow(normalizedOvr, 2.8) * cap;
  const prestige = 1 + Math.max(0, (teamAvgOvr - 75) / 50) * 0.15;
  const value = base * ageMultiplier(age) * prestige;
  return Math.max(0.1, Math.min(cap, Math.round(value * 10) / 10));
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

export function generateAllSquads(): Record<string, Player[]> {
  if (cachedSquads) return cachedSquads;

  const map: Record<string, Player[]> = {};
  
  // Inicializamos las listas de todos los equipos registrados en el sistema
  TEAMS.forEach(t => {
    map[t.id] = [];
  });
  map["free_agent"] = [];

  const dataArray = Array.isArray(playersData) ? playersData : [];
  
  dataArray.forEach((p: any, idx: number) => {
    const rating = p.OVR || p.rating || 70;
    const age = p.Age || p.age || 24;
    const position = mapPosition(p.Position || p.position || "MID");
    const jsonTeamName = p.Team || p.Club || p.team || p.club || "";
    
    const teamId = findTeamIdForPlayer(jsonTeamName);

    const playerObj: Player = {
      id: p.ID ? String(p.ID) : `p-${idx}`,
      name: p.Name || p.name || "Jugador",
      position: position,
      rating: rating,
      age: age,
      teamId: map[teamId] ? teamId : "free_agent",
      marketValue: marketValueFor(rating, age, p.Position || "MID"),  
      isReal: true,
      goals: 0,
      assists: 0,
      appearances: 0,
      injuredUntil: 0,
      morale: 70,
      formHistory: [],
      cardImage: p.card || p.cardImage || p.PhotoUrl || ""
    };

    if (map[teamId]) {
      map[teamId].push(playerObj);
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
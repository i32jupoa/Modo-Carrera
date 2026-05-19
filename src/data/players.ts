import { LeagueId, Team, TEAMS } from "./teams";
import { REAL_PLAYERS } from "./realPlayers";

export type Position = "GK" | "DEF" | "MID" | "FWD";

export type Player = {
  id: string;
  name: string;
  position: Position;
  rating: number;
  age: number;
  teamId: string;
  marketValue: number;
  isReal: boolean; // true if name from real-world rosters
  // mutable stats
  goals: number;
  assists: number;
  appearances: number;
  // injury: matchday number (in their league) when available again. 0 = healthy.
  injuredUntil: number;
  injuryReason?: string;
  // morale 0-100, form 0-100
  morale: number;
  formHistory: number[]; // last 5 ratings 0-10
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Backup pools for filler players (bench depth only)
const FIRST_NAMES: Record<LeagueId, string[]> = {
  laliga: ["Adrián", "Iván", "Rubén", "Jorge", "Andrés", "Raúl", "Marcos", "Hugo"],
  premier: ["Tom", "Lewis", "Callum", "Ryan", "Conor", "Alfie", "Charlie"],
  seriea: ["Alessandro", "Gabriele", "Riccardo", "Stefano", "Federico", "Giovanni"],
  bundesliga: ["Jonas", "Moritz", "David", "Paul", "Tobias", "Julian", "Philipp"],
  ligue1: ["Romain", "Quentin", "Adrien", "Bastien", "Clément", "Dorian"],
};

const LAST_NAMES: Record<LeagueId, string[]> = {
  laliga: ["Vega", "Ortega", "Torres", "Navarro", "Molina", "Serrano", "Aguilar"],
  premier: ["Roberts", "Walker", "Wright", "Hughes", "Green", "Hall", "Baker"],
  seriea: ["Greco", "Bruno", "Gallo", "Conti", "Mancini", "Costa", "Giordano"],
  bundesliga: ["Hoffmann", "Schäfer", "Koch", "Bauer", "Richter", "Klein", "Wolf"],
  ligue1: ["Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre"],
};

const POSITION_PLAN: { pos: Position; count: number; ratingBias: keyof Pick<Team, "att" | "mid" | "def"> }[] = [
  { pos: "GK", count: 3, ratingBias: "def" },
  { pos: "DEF", count: 8, ratingBias: "def" },
  { pos: "MID", count: 8, ratingBias: "mid" },
  { pos: "FWD", count: 6, ratingBias: "att" },
];

function marketValueFor(rating: number, age: number): number {
  const peak = 1 - Math.abs(age - 26) * 0.06;
  const base = Math.pow(Math.max(0, rating - 55) / 10, 2.7);
  return Math.max(0.5, Math.round(base * Math.max(0.25, peak) * 10) / 10);
}

export function generateSquad(team: Team): Player[] {
  const rng = mulberry32(hashSeed(team.id));
  const players: Player[] = [];
  const seen = new Set<string>();

  // 1) Real players first (from REAL_PLAYERS data)
  const real = REAL_PLAYERS[team.id] ?? [];
  real.forEach(([pos, name], i) => {
    if (seen.has(name)) return;
    seen.add(name);
    // Real players rated based on team strength + position bias
    const base = pos === "GK" || pos === "DEF" ? team.def : pos === "MID" ? team.mid : team.att;
    // Top real players (first in list) are starters, get top ratings
    const tier = i < 11 ? 0 : i < 18 ? 1 : 2;
    const delta = tier === 0 ? Math.floor(rng() * 6) : tier === 1 ? -3 + Math.floor(rng() * 5) : -7 + Math.floor(rng() * 5);
    const rating = Math.max(65, Math.min(94, base + delta));
    const age = 20 + Math.floor(rng() * 14);
    players.push({
      id: `${team.id}-real-${i}`,
      name, position: pos, rating, age, teamId: team.id,
      marketValue: marketValueFor(rating, age),
      isReal: true,
      goals: 0, assists: 0, appearances: 0,
      injuredUntil: 0, morale: 70, formHistory: [],
    });
  });

  // 2) Fill remaining slots per position with procedural players
  for (const plan of POSITION_PLAN) {
    const already = players.filter((p) => p.position === plan.pos).length;
    const need = Math.max(0, plan.count - already);
    for (let i = 0; i < need; i++) {
      const baseRating = team[plan.ratingBias];
      const idx = already + i;
      const tier = idx < 3 ? 0 : idx < 6 ? 1 : 2;
      const delta = tier === 0 ? -2 + Math.floor(rng() * 6) : tier === 1 ? -8 + Math.floor(rng() * 6) : -16 + Math.floor(rng() * 8);
      const rating = Math.max(55, Math.min(91, baseRating + delta));
      const age = tier === 2 ? 17 + Math.floor(rng() * 6) : 21 + Math.floor(rng() * 14);
      const firsts = FIRST_NAMES[team.league];
      const lasts = LAST_NAMES[team.league];
      const first = firsts[Math.floor(rng() * firsts.length)];
      const last = lasts[Math.floor(rng() * lasts.length)];
      const name = `${first} ${last}`;
      players.push({
        id: `${team.id}-${plan.pos}-${i}-${Math.floor(rng() * 99999)}`,
        name, position: plan.pos, rating, age, teamId: team.id,
        marketValue: marketValueFor(rating, age),
        isReal: false,
        goals: 0, assists: 0, appearances: 0,
        injuredUntil: 0, morale: 60, formHistory: [],
      });
    }
  }

  const order: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  players.sort((a, b) => order[a.position] - order[b.position] || b.rating - a.rating);
  return players;
}

export function generateAllSquads(): Record<string, Player[]> {
  const map: Record<string, Player[]> = {};
  for (const t of TEAMS) {
    map[t.id] = generateSquad(t);
  }
  return map;
}

export function defaultLineup(squad: Player[], unavailable: Set<string> = new Set()): string[] {
  const available = squad.filter((p) => !unavailable.has(p.id));
  const pickN = (pos: Position, n: number) =>
    available.filter((p) => p.position === pos).slice(0, n).map((p) => p.id);
  return [...pickN("GK", 1), ...pickN("DEF", 4), ...pickN("MID", 3), ...pickN("FWD", 3)];
}

export function avgForm(p: Player): number {
  if (p.formHistory.length === 0) return 50;
  const avg = p.formHistory.reduce((a, b) => a + b, 0) / p.formHistory.length;
  return Math.round(avg * 10); // scale 0-10 -> 0-100
}

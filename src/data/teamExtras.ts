import { Team, getAllTeams, teamById } from "./teams";

// Mapa de rivalidades clásicas (por nombre, normalizado en minúsculas y sin acentos)
const RIVAL_MAP: Record<string, string[]> = {
  "real madrid": ["FC Barcelona", "Atlético de Madrid"],
  "fc barcelona": ["Real Madrid", "Espanyol"],
  "barcelona": ["Real Madrid", "Espanyol"],
  "atletico de madrid": ["Real Madrid", "FC Barcelona"],
  "manchester united": ["Manchester City", "Liverpool", "Arsenal"],
  "manchester city": ["Manchester United", "Liverpool"],
  "liverpool": ["Manchester United", "Everton", "Manchester City"],
  "arsenal": ["Tottenham Hotspur", "Chelsea", "Manchester United"],
  "chelsea": ["Tottenham Hotspur", "Arsenal", "Liverpool"],
  "tottenham hotspur": ["Arsenal", "Chelsea"],
  "inter": ["AC Milan", "Juventus"],
  "ac milan": ["Inter", "Juventus"],
  "juventus": ["Inter", "AC Milan", "Torino"],
  "as roma": ["Lazio", "Napoli"],
  "lazio": ["AS Roma"],
  "napoli": ["AS Roma", "Juventus"],
  "bayern munich": ["Borussia Dortmund"],
  "bayern münchen": ["Borussia Dortmund"],
  "borussia dortmund": ["Bayern München", "Schalke 04"],
  "psg": ["Olympique de Marseille", "Olympique Lyonnais"],
  "paris saint-germain": ["Olympique de Marseille", "Olympique Lyonnais"],
  "olympique de marseille": ["PSG", "Olympique Lyonnais"],
  "olympique lyonnais": ["AS Saint-Étienne", "Olympique de Marseille"],
  "ajax": ["Feyenoord", "PSV"],
  "feyenoord": ["Ajax", "PSV"],
  "psv": ["Ajax", "Feyenoord"],
  "porto": ["Benfica", "Sporting CP"],
  "benfica": ["Porto", "Sporting CP"],
  "sporting cp": ["Benfica", "Porto"],
  "celtic": ["Rangers"],
  "rangers": ["Celtic"],
  "boca juniors": ["River Plate"],
  "river plate": ["Boca Juniors"],
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export function getRivals(team: Team): Team[] {
  const key = norm(team.name);
  const names = RIVAL_MAP[key];
  const all = getAllTeams();
  if (names && names.length) {
    return names
      .map((n) => all.find((t) => norm(t.name) === norm(n)))
      .filter((t): t is Team => !!t);
  }
  // Fallback: rivales de la misma liga con overall similar
  return all
    .filter((t) => t.league === team.league && t.id !== team.id)
    .sort((a, b) => Math.abs((a.att + a.mid + a.def) - (team.att + team.mid + team.def))
                 - Math.abs((b.att + b.mid + b.def) - (team.att + team.mid + team.def)))
    .slice(0, 3);
}

// Genera historial reciente ficticio determinista basado en el id del equipo
function seedHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type HistoryEntry = {
  season: string;
  position: number;
  trophies: string[];
  topScorer: string;
  goals: number;
};

export function getRecentHistory(team: Team): HistoryEntry[] {
  const seed = seedHash(team.id);
  const ov = (team.att + team.mid + team.def) / 3;
  const seasons = ["24/25", "23/24", "22/23", "21/22", "20/21"];
  const star = team.stars && team.stars[0] ? team.stars[0] : "Capitán";
  const cupNames = ["Copa Nacional", "Supercopa", "Champions League", "Europa League", "Liga"];

  return seasons.map((s, i) => {
    const variance = ((seed >> (i * 2)) & 0xf) - 7;
    const basePos = ov > 82 ? 2 : ov > 76 ? 5 : ov > 70 ? 9 : 14;
    const position = Math.max(1, Math.min(20, basePos + variance));
    const trophies: string[] = [];
    if (position === 1) trophies.push("Liga");
    if (((seed >> (i * 3)) & 7) === 0 && ov > 72) trophies.push(cupNames[(seed + i) % cupNames.length]);
    const goals = Math.max(8, Math.round(18 + (ov - 70) * 0.6 + ((seed >> i) & 15) - 7));
    return { season: s, position, trophies, topScorer: star, goals };
  });
}

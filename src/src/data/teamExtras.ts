import { Team, getAllTeams, teamById } from "./teams";
import { getClubExtra } from "./clubExtras";
import { realRecentTrophies } from "./leagueWinners";

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
  const all = getAllTeams();
  // 1) Try enriched data (rival1/rival2)
  const extra = getClubExtra(team.name);
  if (extra && (extra.rival1 || extra.rival2)) {
    const names = [extra.rival1, extra.rival2].filter(Boolean) as string[];
    const matches = names
      .map((n) => {
        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        const target = norm(n);
        return all.find((t) => {
          const tn = norm(t.name);
          return tn === target || tn.includes(target) || target.includes(tn);
        });
      })
      .filter((t): t is Team => !!t && t.id !== team.id);
    if (matches.length) return matches;
  }
  // 2) Legacy hardcoded map
  const key = norm(team.name);
  const names = RIVAL_MAP[key];
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
  const seasons = ["24/25", "23/24", "22/23"];
  const star = team.stars && team.stars[0] ? team.stars[0] : "Capitán";
  const real = realRecentTrophies(team.name, team.league);

  return seasons.map((s, i) => {
    const variance = ((seed >> (i * 2)) & 0xf) - 7;
    const basePos = ov > 84 ? 2 : ov > 78 ? 5 : ov > 72 ? 9 : ov > 66 ? 13 : 17;
    let position = Math.max(1, Math.min(20, basePos + variance));
    const trophies = real[s] ?? [];
    // Si gana la liga, position = 1
    if (trophies.some((t) => /liga|premier|bundesliga|serie a|ligue 1|eredivisie|portugal|scottish/i.test(t))) {
      position = 1;
    }
    const goals = Math.max(6, Math.round(15 + (ov - 70) * 0.55 + ((seed >> i) & 11) - 5));
    return { season: s, position, trophies, topScorer: star, goals };
  });
}

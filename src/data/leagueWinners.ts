// Ganadores reales de las últimas 3 temporadas (22/23, 23/24, 24/25)
// Fuente: temporadas más recientes de las grandes ligas. Se usa para
// generar un historial coherente en ClubPreviewModal.

export type SeasonWinners = {
  league: string; // trophy label
  champion: string;
  cupWinner?: string; // Copa nacional
};

// key: leagueId  →  season label → winners
export const LEAGUE_WINNERS: Record<string, Record<string, SeasonWinners>> = {
  laliga: {
    "22/23": { league: "LaLiga", champion: "FC Barcelona", cupWinner: "Real Madrid" },
    "23/24": { league: "LaLiga", champion: "Real Madrid", cupWinner: "Athletic Club" },
    "24/25": { league: "LaLiga", champion: "FC Barcelona", cupWinner: "FC Barcelona" },
  },
  premier: {
    "22/23": { league: "Premier League", champion: "Manchester City", cupWinner: "Manchester City" },
    "23/24": { league: "Premier League", champion: "Manchester City", cupWinner: "Man Utd" },
    "24/25": { league: "Premier League", champion: "Liverpool", cupWinner: "Crystal Palace" },
  },
  seriea: {
    "22/23": { league: "Serie A", champion: "SSC Napoli", cupWinner: "Inter" },
    "23/24": { league: "Serie A", champion: "Lombardia FC", cupWinner: "Juventus" },
    "24/25": { league: "Serie A", champion: "SSC Napoli", cupWinner: "Bologna" },
  },
  bundesliga: {
    "22/23": { league: "Bundesliga", champion: "FC Bayern München", cupWinner: "RB Leipzig" },
    "23/24": { league: "Bundesliga", champion: "Leverkusen", cupWinner: "Leverkusen" },
    "24/25": { league: "Bundesliga", champion: "FC Bayern München", cupWinner: "VfB Stuttgart" },
  },
  ligue1: {
    "22/23": { league: "Ligue 1", champion: "Paris SG", cupWinner: "Toulouse FC" },
    "23/24": { league: "Ligue 1", champion: "Paris SG", cupWinner: "Paris SG" },
    "24/25": { league: "Ligue 1", champion: "Paris SG", cupWinner: "Paris SG" },
  },
  ligaportugal: {
    "22/23": { league: "Liga Portugal", champion: "Benfica" },
    "23/24": { league: "Liga Portugal", champion: "Sporting CP" },
    "24/25": { league: "Liga Portugal", champion: "Sporting CP" },
  },
  eredivisie: {
    "22/23": { league: "Eredivisie", champion: "Feyenoord" },
    "23/24": { league: "Eredivisie", champion: "PSV" },
    "24/25": { league: "Eredivisie", champion: "PSV" },
  },
  scottish: {
    "22/23": { league: "Scottish Prem", champion: "Celtic" },
    "23/24": { league: "Scottish Prem", champion: "Celtic" },
    "24/25": { league: "Scottish Prem", champion: "Celtic" },
  },
};

// Devuelve los títulos reales del club en las últimas 3 temporadas (liga + copa nacional)
export function realRecentTrophies(teamName: string, leagueId: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const seasons = ["24/25", "23/24", "22/23"];
  for (const s of seasons) {
    out[s] = [];
    // Liga del equipo
    const lw = LEAGUE_WINNERS[leagueId]?.[s];
    if (lw) {
      if (lw.champion === teamName) out[s].push(lw.league);
      if (lw.cupWinner === teamName) out[s].push("Copa Nacional");
    }
    // Cup wins in other leagues from same country are rare; we keep it simple.
  }
  return out;
}

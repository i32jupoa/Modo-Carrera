// Team ratings approximate real-world strength (0-100 scale)
// att = attack, def = defense, mid = midfield
export type Team = {
  id: string;
  name: string;
  short: string;
  city: string;
  league: LeagueId;
  att: number;
  mid: number;
  def: number;
  stars: string[]; // star players
  color: string; // primary hex (for badges)
};

export type LeagueId = "laliga" | "premier" | "seriea" | "bundesliga" | "ligue1";

export const LEAGUES: Record<LeagueId, { id: LeagueId; name: string; country: string; flag: string }> = {
  laliga: { id: "laliga", name: "LaLiga", country: "España", flag: "🇪🇸" },
  premier: { id: "premier", name: "Premier League", country: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  seriea: { id: "seriea", name: "Serie A", country: "Italia", flag: "🇮🇹" },
  bundesliga: { id: "bundesliga", name: "Bundesliga", country: "Alemania", flag: "🇩🇪" },
  ligue1: { id: "ligue1", name: "Ligue 1", country: "Francia", flag: "🇫🇷" },
};

export const TEAMS: Team[] = [
  // ===== LALIGA =====
  { id: "rma", name: "Real Madrid", short: "RMA", city: "Madrid", league: "laliga", att: 92, mid: 90, def: 88, stars: ["Mbappé", "Bellingham", "Vinicius Jr."], color: "#FFFFFF" },
  { id: "bar", name: "FC Barcelona", short: "BAR", city: "Barcelona", league: "laliga", att: 90, mid: 88, def: 84, stars: ["Lamine Yamal", "Pedri", "Lewandowski"], color: "#A50044" },
  { id: "atm", name: "Atlético de Madrid", short: "ATM", city: "Madrid", league: "laliga", att: 85, mid: 84, def: 87, stars: ["Griezmann", "Julián Álvarez", "Oblak"], color: "#CB3524" },
  { id: "ath", name: "Athletic Club", short: "ATH", city: "Bilbao", league: "laliga", att: 80, mid: 79, def: 81, stars: ["Nico Williams", "Iñaki Williams"], color: "#EE2523" },
  { id: "rso", name: "Real Sociedad", short: "RSO", city: "San Sebastián", league: "laliga", att: 78, mid: 79, def: 78, stars: ["Take Kubo", "Oyarzabal"], color: "#0067B1" },
  { id: "bet", name: "Real Betis", short: "BET", city: "Sevilla", league: "laliga", att: 77, mid: 77, def: 75, stars: ["Isco", "Antony"], color: "#00954C" },
  { id: "vil", name: "Villarreal CF", short: "VIL", city: "Villarreal", league: "laliga", att: 78, mid: 77, def: 76, stars: ["Yeremy Pino", "Barry"], color: "#FFE667" },
  { id: "val", name: "Valencia CF", short: "VAL", city: "Valencia", league: "laliga", att: 73, mid: 72, def: 73, stars: ["Diego López"], color: "#F18E00" },
  { id: "sev", name: "Sevilla FC", short: "SEV", city: "Sevilla", league: "laliga", att: 74, mid: 73, def: 74, stars: ["En-Nesyri", "Ocampos"], color: "#D40009" },
  { id: "cel", name: "Celta", short: "CEL", city: "Vigo", league: "laliga", att: 75, mid: 74, def: 72, stars: ["Iago Aspas"], color: "#8AC3EE" },
  { id: "gir", name: "Girona FC", short: "GIR", city: "Girona", league: "laliga", att: 76, mid: 75, def: 73, stars: ["Tsygankov"], color: "#CD2229" },
  { id: "mll", name: "RCD Mallorca", short: "MLL", city: "Palma", league: "laliga", att: 70, mid: 71, def: 74, stars: ["Muriqi"], color: "#E20613" },
  { id: "rayo", name: "Rayo Vallecano", short: "RAY", city: "Madrid", league: "laliga", att: 72, mid: 73, def: 72, stars: ["Isi Palazón"], color: "#E53027" },
  { id: "osa", name: "CA Osasuna", short: "OSA", city: "Pamplona", league: "laliga", att: 71, mid: 72, def: 73, stars: ["Budimir"], color: "#D91A21" },
  { id: "get", name: "Getafe CF", short: "GET", city: "Getafe", league: "laliga", att: 70, mid: 71, def: 74, stars: ["Mayoral"], color: "#005999" },
  { id: "ala", name: "D. Alavés", short: "ALA", city: "Vitoria", league: "laliga", att: 68, mid: 69, def: 71, stars: ["Kike García"], color: "#0F2F8C" },
  { id: "lpa", name: "UD Las Palmas", short: "LPA", city: "Las Palmas", league: "laliga", att: 70, mid: 71, def: 70, stars: ["Munir"], color: "#FFE000" },
  { id: "esp", name: "RCD Espanyol", short: "ESP", city: "Barcelona", league: "laliga", att: 69, mid: 70, def: 70, stars: ["Joselu"], color: "#007FC4" },
  { id: "lev", name: "Levante UD", short: "LEV", city: "Valencia", league: "laliga", att: 68, mid: 69, def: 69, stars: ["Brugué"], color: "#B5142C" },
  { id: "ovi", name: "R. Oviedo", short: "OVI", city: "Oviedo", league: "laliga", att: 65, mid: 66, def: 68, stars: ["Santi Cazorla"], color: "#0058A3" },

  // ===== PREMIER LEAGUE =====
  { id: "mci", name: "Manchester City", short: "MCI", city: "Manchester", league: "premier", att: 92, mid: 91, def: 88, stars: ["Haaland", "De Bruyne", "Rodri"], color: "#6CABDD" },
  { id: "liv", name: "Liverpool", short: "LIV", city: "Liverpool", league: "premier", att: 90, mid: 88, def: 86, stars: ["Salah", "Van Dijk", "Szoboszlai"], color: "#C8102E" },
  { id: "ars", name: "Arsenal", short: "ARS", city: "Londres", league: "premier", att: 88, mid: 88, def: 87, stars: ["Saka", "Ødegaard", "Saliba"], color: "#EF0107" },
  { id: "che", name: "Chelsea", short: "CHE", city: "Londres", league: "premier", att: 85, mid: 84, def: 83, stars: ["Palmer", "Caicedo"], color: "#034694" },
  { id: "tot", name: "Spurs", short: "TOT", city: "Londres", league: "premier", att: 84, mid: 82, def: 79, stars: ["Son", "Maddison"], color: "#132257" },
  { id: "mun", name: "Man Utd", short: "MUN", city: "Manchester", league: "premier", att: 83, mid: 82, def: 80, stars: ["Bruno Fernandes", "Garnacho"], color: "#DA291C" },
  { id: "new", name: "Newcastle Utd", short: "NEW", city: "Newcastle", league: "premier", att: 82, mid: 82, def: 83, stars: ["Isak", "Bruno G."], color: "#241F20" },
  { id: "avl", name: "Aston Villa", short: "AVL", city: "Birmingham", league: "premier", att: 81, mid: 81, def: 80, stars: ["Watkins", "McGinn"], color: "#670E36" },
  { id: "bri", name: "Brighton", short: "BRI", city: "Brighton", league: "premier", att: 79, mid: 80, def: 77, stars: ["Mitoma", "João Pedro"], color: "#0057B8" },
  { id: "whu", name: "West Ham", short: "WHU", city: "Londres", league: "premier", att: 77, mid: 77, def: 76, stars: ["Bowen"], color: "#7A263A" },
  { id: "cry", name: "Crystal Palace", short: "CRY", city: "Londres", league: "premier", att: 76, mid: 76, def: 76, stars: ["Eze", "Mateta"], color: "#1B458F" },
  { id: "ful", name: "Fulham", short: "FUL", city: "Londres", league: "premier", att: 75, mid: 76, def: 75, stars: ["Iwobi"], color: "#000000" },
  { id: "bou", name: "AFC Bournemouth", short: "BOU", city: "Bournemouth", league: "premier", att: 75, mid: 74, def: 74, stars: ["Semenyo"], color: "#DA020E" },
  { id: "bre", name: "Brentford", short: "BRE", city: "Londres", league: "premier", att: 74, mid: 74, def: 74, stars: ["Mbeumo"], color: "#E30613" },
  { id: "not", name: "Nott'm Forest", short: "NOT", city: "Nottingham", league: "premier", att: 76, mid: 75, def: 76, stars: ["Wood", "Gibbs-White"], color: "#DD0000" },
  { id: "eve", name: "Everton", short: "EVE", city: "Liverpool", league: "premier", att: 72, mid: 73, def: 76, stars: ["Calvert-Lewin"], color: "#003399" },
  { id: "wol", name: "Wolves", short: "WOL", city: "Wolverhampton", league: "premier", att: 73, mid: 73, def: 73, stars: ["Cunha"], color: "#FDB913" },
  { id: "lee", name: "Leeds United", short: "LEE", city: "Leeds", league: "premier", att: 72, mid: 73, def: 72, stars: ["Piroe"], color: "#FFCD00" },
  { id: "bur", name: "Burnley", short: "BUR", city: "Burnley", league: "premier", att: 70, mid: 71, def: 72, stars: ["Foster"], color: "#6C1D45" },
  { id: "sun", name: "Sunderland", short: "SUN", city: "Sunderland", league: "premier", att: 70, mid: 71, def: 71, stars: ["Mayenda"], color: "#EB172B" },

  // ===== SERIE A =====
  { id: "int", name: "Lombardia FC", short: "INT", city: "Milán", league: "seriea", att: 89, mid: 87, def: 87, stars: ["Lautaro", "Thuram", "Barella"], color: "#0068A8" },
  { id: "nap", name: "SSC Napoli", short: "NAP", city: "Nápoles", league: "seriea", att: 87, mid: 86, def: 84, stars: ["Lukaku", "McTominay", "Kvara"], color: "#12A0D7" },
  { id: "juv", name: "Juventus", short: "JUV", city: "Turín", league: "seriea", att: 85, mid: 84, def: 86, stars: ["Vlahović", "Yıldız"], color: "#000000" },
  { id: "mil", name: "Milano FC", short: "MIL", city: "Milán", league: "seriea", att: 85, mid: 83, def: 82, stars: ["Leão", "Pulisic"], color: "#FB090B" },
  { id: "rom", name: "AS Roma", short: "ROM", city: "Roma", league: "seriea", att: 82, mid: 82, def: 82, stars: ["Dybala", "Pellegrini"], color: "#8E1F2F" },
  { id: "laz", name: "Latium", short: "LAZ", city: "Roma", league: "seriea", att: 80, mid: 81, def: 80, stars: ["Castellanos", "Zaccagni"], color: "#87CEEB" },
  { id: "ata", name: "Bergamo Calcio", short: "ATA", city: "Bérgamo", league: "seriea", att: 84, mid: 82, def: 81, stars: ["Lookman", "Retegui"], color: "#1A5DAA" },
  { id: "fio", name: "Fiorentina", short: "FIO", city: "Florencia", league: "seriea", att: 78, mid: 78, def: 78, stars: ["Kean"], color: "#4B2682" },
  { id: "bol", name: "Bologna", short: "BOL", city: "Bolonia", league: "seriea", att: 78, mid: 78, def: 79, stars: ["Orsolini"], color: "#94262F" },
  { id: "tor", name: "Torino", short: "TOR", city: "Turín", league: "seriea", att: 74, mid: 75, def: 76, stars: ["Zapata"], color: "#8B1A1A" },
  { id: "udi", name: "Udinese", short: "UDI", city: "Udine", league: "seriea", att: 73, mid: 74, def: 75, stars: ["Lucca"], color: "#000000" },
  { id: "gen", name: "Genoa", short: "GEN", city: "Génova", league: "seriea", att: 72, mid: 73, def: 73, stars: ["Pinamonti"], color: "#C8102E" },
  { id: "ver", name: "Hellas Verona", short: "VER", city: "Verona", league: "seriea", att: 70, mid: 71, def: 72, stars: ["Suslov"], color: "#FFD400" },
  { id: "cag", name: "Cagliari", short: "CAG", city: "Cagliari", league: "seriea", att: 71, mid: 71, def: 72, stars: ["Piccoli"], color: "#B4001F" },
  { id: "par", name: "Parma", short: "PAR", city: "Parma", league: "seriea", att: 72, mid: 72, def: 72, stars: ["Bonny"], color: "#FFE600" },
  { id: "lec", name: "Lecce", short: "LEC", city: "Lecce", league: "seriea", att: 69, mid: 70, def: 71, stars: ["Krstović"], color: "#E30613" },
  { id: "com", name: "Como", short: "COM", city: "Como", league: "seriea", att: 74, mid: 74, def: 73, stars: ["Nico Paz"], color: "#0E2B7C" },
  { id: "sas", name: "Sassuolo", short: "SAS", city: "Sassuolo", league: "seriea", att: 73, mid: 72, def: 71, stars: ["Berardi"], color: "#00713B" },
  { id: "pis", name: "Pisa", short: "PIS", city: "Pisa", league: "seriea", att: 68, mid: 69, def: 70, stars: ["Tramoni"], color: "#003D7E" },
  { id: "cre", name: "Cremonese", short: "CRE", city: "Cremona", league: "seriea", att: 67, mid: 68, def: 69, stars: ["Vázquez"], color: "#B40E1C" },

  // ===== BUNDESLIGA (18) =====
  { id: "bay", name: "FC Bayern München", short: "BAY", city: "Múnich", league: "bundesliga", att: 91, mid: 89, def: 86, stars: ["Kane", "Musiala", "Olise"], color: "#DC052D" },
  { id: "bvb", name: "Borussia Dortmund", short: "BVB", city: "Dortmund", league: "bundesliga", att: 85, mid: 84, def: 82, stars: ["Adeyemi", "Guirassy"], color: "#FDE100" },
  { id: "rbl", name: "RB Leipzig", short: "RBL", city: "Leipzig", league: "bundesliga", att: 84, mid: 84, def: 83, stars: ["Openda", "Šeško"], color: "#DD0741" },
  { id: "lev2", name: "Leverkusen", short: "B04", city: "Leverkusen", league: "bundesliga", att: 87, mid: 86, def: 85, stars: ["Wirtz", "Boniface"], color: "#E32221" },
  { id: "stu", name: "VfB Stuttgart", short: "STU", city: "Stuttgart", league: "bundesliga", att: 81, mid: 81, def: 80, stars: ["Undav", "Demirović"], color: "#E32219" },
  { id: "ein", name: "Frankfurt", short: "SGE", city: "Frankfurt", league: "bundesliga", att: 82, mid: 81, def: 79, stars: ["Ekitiké", "Marmoush"], color: "#E1000F" },
  { id: "hof", name: "TSG Hoffenheim", short: "TSG", city: "Sinsheim", league: "bundesliga", att: 75, mid: 75, def: 74, stars: ["Kramarić"], color: "#1961B5" },
  { id: "wob", name: "VfL Wolfsburg", short: "WOB", city: "Wolfsburgo", league: "bundesliga", att: 75, mid: 75, def: 75, stars: ["Wind"], color: "#65B32E" },
  { id: "bre2", name: "SV Werder Bremen", short: "SVW", city: "Bremen", league: "bundesliga", att: 73, mid: 74, def: 75, stars: ["Ducksch"], color: "#1D9053" },
  { id: "fre", name: "SC Freiburg", short: "SCF", city: "Friburgo", league: "bundesliga", att: 75, mid: 76, def: 77, stars: ["Grifo"], color: "#E2231A" },
  { id: "mai", name: "1. FSV Mainz 05", short: "M05", city: "Maguncia", league: "bundesliga", att: 74, mid: 75, def: 76, stars: ["Burkardt"], color: "#C3141E" },
  { id: "bmg", name: "M'gladbach", short: "BMG", city: "Mönchengladbach", league: "bundesliga", att: 73, mid: 73, def: 73, stars: ["Honorat"], color: "#000000" },
  { id: "fcu", name: "Union Berlin", short: "FCU", city: "Berlín", league: "bundesliga", att: 72, mid: 73, def: 76, stars: ["Hollerbach"], color: "#EB1923" },
  { id: "fca", name: "FC Augsburg", short: "FCA", city: "Augsburgo", league: "bundesliga", att: 71, mid: 72, def: 73, stars: ["Tietz"], color: "#BA3733" },
  { id: "kie", name: "Holstein Kiel", short: "KIE", city: "Kiel", league: "bundesliga", att: 68, mid: 69, def: 70, stars: ["Machino"], color: "#0F2A6E" },
  { id: "ham", name: "Hamburger SV", short: "HSV", city: "Hamburgo", league: "bundesliga", att: 72, mid: 72, def: 71, stars: ["Glatzel"], color: "#0F1F4B" },
  { id: "koe", name: "1. FC Köln", short: "KOE", city: "Colonia", league: "bundesliga", att: 71, mid: 71, def: 70, stars: ["Kainz"], color: "#ED1C24" },
  { id: "stp", name: "FC St. Pauli", short: "STP", city: "Hamburgo", league: "bundesliga", att: 68, mid: 69, def: 71, stars: ["Hountondji"], color: "#5C2E1C" },

  // ===== LIGUE 1 (18) =====
  { id: "psg", name: "Paris SG", short: "PSG", city: "París", league: "ligue1", att: 91, mid: 89, def: 85, stars: ["Dembélé", "Doué", "Kvara"], color: "#004170" },
  { id: "mar", name: "OM", short: "OM", city: "Marsella", league: "ligue1", att: 82, mid: 81, def: 80, stars: ["Aubameyang", "Greenwood"], color: "#2FAEE0" },
  { id: "mon", name: "AS Monaco", short: "ASM", city: "Mónaco", league: "ligue1", att: 82, mid: 81, def: 80, stars: ["Embolo", "Akliouche"], color: "#E1000F" },
  { id: "lyo", name: "OL", short: "OL", city: "Lyon", league: "ligue1", att: 80, mid: 79, def: 78, stars: ["Lacazette", "Cherki"], color: "#1D2A6C" },
  { id: "lil", name: "LOSC Lille", short: "LIL", city: "Lille", league: "ligue1", att: 80, mid: 79, def: 79, stars: ["David", "Cabella"], color: "#E20613" },
  { id: "nic", name: "OGC Nice", short: "NIC", city: "Niza", league: "ligue1", att: 77, mid: 78, def: 78, stars: ["Guessand"], color: "#E2001A" },
  { id: "ren", name: "Stade Rennais FC", short: "REN", city: "Rennes", league: "ligue1", att: 77, mid: 77, def: 76, stars: ["Kalimuendo"], color: "#E2001A" },
  { id: "str", name: "Strasbourg", short: "STR", city: "Estrasburgo", league: "ligue1", att: 76, mid: 76, def: 75, stars: ["Emegha"], color: "#0066B3" },
  { id: "rcl", name: "RC Lens", short: "RCL", city: "Lens", league: "ligue1", att: 76, mid: 76, def: 77, stars: ["Thomasson"], color: "#EFB810" },
  { id: "tou", name: "Toulouse FC", short: "TOU", city: "Toulouse", league: "ligue1", att: 73, mid: 74, def: 74, stars: ["Magri"], color: "#582C83" },
  { id: "nan", name: "FC Nantes", short: "NAN", city: "Nantes", league: "ligue1", att: 72, mid: 73, def: 73, stars: ["Mohamed"], color: "#FCD500" },
  { id: "bre3", name: "Stade Brestois 29", short: "BRE", city: "Brest", league: "ligue1", att: 74, mid: 74, def: 74, stars: ["Ajorque"], color: "#C8102E" },
  { id: "ang", name: "Angers SCO", short: "ANG", city: "Angers", league: "ligue1", att: 69, mid: 70, def: 71, stars: ["Lepaul"], color: "#000000" },
  { id: "hav", name: "Havre AC", short: "HAC", city: "Le Havre", league: "ligue1", att: 70, mid: 71, def: 72, stars: ["Soumaré"], color: "#00B0F0" },
  { id: "auxe", name: "AJ Auxerre", short: "AUX", city: "Auxerre", league: "ligue1", att: 71, mid: 71, def: 71, stars: ["Sinayoko"], color: "#0066B3" },
  { id: "metz", name: "FC Metz", short: "MET", city: "Metz", league: "ligue1", att: 70, mid: 70, def: 70, stars: ["Sabaly"], color: "#7C1132" },
  { id: "par2", name: "Paris FC", short: "PFC", city: "París", league: "ligue1", att: 71, mid: 71, def: 71, stars: ["López"], color: "#0066B3" },
  { id: "loi", name: "FC Lorient", short: "FCL", city: "Lorient", league: "ligue1", att: 70, mid: 70, def: 70, stars: ["Bamba"], color: "#FF7F00" },
];

export function teamById(id: string): Team {
  const t = TEAMS.find((x) => x.id === id);
  if (!t) throw new Error(`Team not found: ${id}`);
  return t;
}

export function teamsByLeague(league: LeagueId): Team[] {
  return TEAMS.filter((t) => t.league === league);
}

export function overall(t: Team): number {
  return Math.round((t.att + t.mid + t.def) / 3);
}

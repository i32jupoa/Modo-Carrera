import playersData from "./playersData";

export type LeagueId = "laliga" | "premier" | "seriea" | "bundesliga" | "ligue1" | string;

export type TeamLeagueContext = {
  /** Per-career club divisions; absent entries use the static Team.league. */
  teamLeagueOverrides?: Readonly<Record<string, string>> | null;
};

/**
 * Read-only adapter for legacy consumers that do not yet receive SaveGame explicitly.
 * The active career's overrides are registered by lib/store.ts on load/save; the
 * authoritative persisted source remains SaveGame.teamLeagueOverrides. This registry
 * never mutates TEAMS and can always be bypassed by passing an explicit context.
 */
let activeTeamLeagueOverrides: Readonly<Record<string, string>> | undefined;

export function setActiveTeamLeagueOverrides(
  overrides: Readonly<Record<string, string>> | null | undefined,
): void {
  activeTeamLeagueOverrides = overrides && Object.keys(overrides).length > 0 ? overrides : undefined;
}

function resolveTeamLeagueContext(context?: TeamLeagueContext): TeamLeagueContext | undefined {
  if (context !== undefined) return context;
  return activeTeamLeagueOverrides ? { teamLeagueOverrides: activeTeamLeagueOverrides } : undefined;
}

function withEffectiveLeague(team: Team, context?: TeamLeagueContext): Team {
  const overrides = resolveTeamLeagueContext(context)?.teamLeagueOverrides;
  const effectiveLeague = overrides?.[team.id];
  return effectiveLeague && effectiveLeague !== team.league ? { ...team, league: effectiveLeague } : team;
}

export type Team = {
  id: string;
  name: string;
  short: string;
  city: string;
  league: LeagueId;
  att: number;
  mid: number;
  def: number;
  stars: string[]; // mejores jugadores
  color: string; // color base
  secondaryColor?: string; // color de contraste para estadísticas/elementos bicolores
  category?: "Gigante" | "Aspirante" | "Modesto"; // clasificación del equipo
  budget?: number; // presupuesto inicial en millones €
};

const LEAGUE_TO_COUNTRY: Record<string, { country: string; flag: string }> = {
  "LALIGA EA SPORTS": { country: "España", flag: "🇪🇸" },
  "LALIGA HYPERMOTION": { country: "España", flag: "🇪🇸" },
  "Premier League": { country: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  "EFL Championship": { country: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  "EFL League One": { country: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  "EFL League Two": { country: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  "Serie A Enilive": { country: "Italia", flag: "🇮🇹" },
  "Serie BKT": { country: "Italia", flag: "🇮🇹" },
  Bundesliga: { country: "Alemania", flag: "🇩🇪" },
  "Bundesliga 2": { country: "Alemania", flag: "🇩🇪" },
  "3. Liga": { country: "Alemania", flag: "🇩🇪" },
  "2. BUNDESLIGA": { country: "Alemania", flag: "🇩🇪" },
  "Ligue 1 McDonald's": { country: "Francia", flag: "🇫🇷" },
  "Ligue 2 BKT": { country: "Francia", flag: "🇫🇷" },
  "Liga Portugal": { country: "Portugal", flag: "🇵🇹" },
  "Primeira Liga": { country: "Portugal", flag: "🇵🇹" },
  "PRIMEIRA LIGA": { country: "Portugal", flag: "🇵🇹" },
  Eredivisie: { country: "Países Bajos", flag: "🇳🇱" },
  "Trendyol Süper Lig": { country: "Turquía", flag: "🇹🇷" },
  MLS: { country: "EE.UU.", flag: "🇺🇸" },
  LPF: { country: "Argentina", flag: "🇦🇷" },
  SUPERLIGA: { country: "Rumanía", flag: "🇷🇴" },
  "Scottish Prem": { country: "Escocia", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  "Scottish Premiership": { country: "Escocia", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  "1A Pro League": { country: "Bélgica", flag: "🇧🇪" },
  "BELGIAN PRO LEAGUE": { country: "Bélgica", flag: "🇧🇪" },
  "PKO BP Ekstraklasa": { country: "Polonia", flag: "🇵🇱" },
  Ekstraklasa: { country: "Polonia", flag: "🇵🇱" },
  "Brack Super League": { country: "Suiza", flag: "🇨🇭" },
  "3F Superliga": { country: "Dinamarca", flag: "🇩🇰" },
  "Metropolitan Division": { country: "Dinamarca", flag: "🇩🇰" },
  Allsvenskan: { country: "Suecia", flag: "🇸🇪" },
  Eliteserien: { country: "Noruega", flag: "🇳🇴" },
  "ROSHN Saudi League": { country: "Arabia Saudí", flag: "🇸🇦" },
  "Ö. Bundesliga": { country: "Austria", flag: "🇦🇹" },
  "Liga BBVA MX": { country: "México", flag: "🇲🇽" },
  CSL: { country: "China", flag: "🇨🇳" },
  "K League 1": { country: "Corea del Sur", flag: "🇰🇷" },
  "Isuzu UTE A League": { country: "Australia", flag: "🇦🇺" },
  ISL: { country: "India", flag: "🇮🇳" },
  "SSE Airtricity Men's Premier Division": { country: "Irlanda", flag: "🇮🇪" },
  "Hellas Liga": { country: "Grecia", flag: "🇬🇷" },
  "Česká Liga": { country: "Chequia", flag: "🇨🇿" },
  "Ukrayina Liha": { country: "Ucrania", flag: "🇺🇦" },
  "Liga Hrvatska": { country: "Croacia", flag: "🇭🇷" },
  "Liga Cyprus": { country: "Chipre", flag: "🇨🇾" },
  "Brasileirão Série A": { country: "Brasil", flag: "🇧🇷" },
  "Liga do Brasil": { country: "Brasil", flag: "🇧🇷" },
  "Primera División de Chile": { country: "Chile", flag: "🇨🇱" },
  "Liga de Primera (Chile)": { country: "Chile", flag: "🇨🇱" },
  "Categoría Primera A": { country: "Colombia", flag: "🇨🇴" },
  "Liga Colombia": { country: "Colombia", flag: "🇨🇴" },
  "LigaPro Serie A": { country: "Ecuador", flag: "🇪🇨" },
  "Primera División de Paraguay": { country: "Paraguay", flag: "🇵🇾" },
  "Liga 1 Perú": { country: "Perú", flag: "🇵🇪" },
  "División Profesional de Bolivia": { country: "Bolivia", flag: "🇧🇴" },
  "Primera División de Uruguay": { country: "Uruguay", flag: "🇺🇾" },
  "Liga FUTVE": { country: "Venezuela", flag: "🇻🇪" },
};

const LEAGUE_NAME_TO_ID: Record<string, string> = {
  "LALIGA EA SPORTS": "laliga",
  "LALIGA HYPERMOTION": "laliga2",
  "Premier League": "premier",
  "EFL Championship": "championship",
  "EFL League One": "leagueone",
  "EFL League Two": "leaguetwo",
  "Serie A Enilive": "seriea",
  "Serie BKT": "serieb",
  Bundesliga: "bundesliga",
  "Bundesliga 2": "bundesliga2",
  "2. BUNDESLIGA": "bundesliga2",
  "3. Liga": "liga3",
  "Ligue 1 McDonald's": "ligue1",
  "Ligue 2 BKT": "ligue2",
  "Trendyol Süper Lig": "trendyolsperlig",
  "Scottish Premiership": "scottish",
  "Scottish Prem": "scottish",
  Ekstraklasa: "ekstraklasa",
  "PKO BP Ekstraklasa": "ekstraklasa",
  "3F Superliga": "3fsuperliga",
  "Metropolitan Division": "3fsuperliga",
  "1A Pro League": "1aproleague",
  "BELGIAN PRO LEAGUE": "1aproleague",
  "Primeira Liga": "ligaportugal",
  "PRIMEIRA LIGA": "ligaportugal",
  "Liga Portugal": "ligaportugal",
  Eredivisie: "eredivisie",
  "Ö. Bundesliga": "austrianbundesliga",
  MLS: "mls",
  LPF: "lpf",
  SUPERLIGA: "superliga",
  "Brack Super League": "bracksuperleague",
  Allsvenskan: "allsvenskan",
  Eliteserien: "eliteserien",
  "ROSHN Saudi League": "roshnsaudileague",
  "Liga BBVA MX": "ligabbvamx",
  CSL: "csl",
  "K League 1": "kleague1",
  "Isuzu UTE A League": "aleague",
  ISL: "isl",
  "SSE Airtricity Men's Premier Division": "sseairtricitypd",
  "Hellas Liga": "hellasliga",
  "Česká Liga": "ceskaliga",
  "Ukrayina Liha": "ukrayinaliha",
  "Liga Hrvatska": "ligahrvatska",
  "Liga Cyprus": "ligacyprus",
  "Brasileirão Série A": "brasileirao",
  "Liga do Brasil": "brasileirao",
  "Primera División de Chile": "chileprimera",
  "Liga de Primera (Chile)": "chileprimera",
  "Categoría Primera A": "ligabetplay",
  "Liga Colombia": "ligabetplay",
  "LigaPro Serie A": "ligaproecuador",
  "Primera División de Paraguay": "paraguayprimera",
  "Liga 1 Perú": "liga1peru",
  "División Profesional de Bolivia": "boliviaprofesional",
  "Primera División de Uruguay": "uruguayprimera",
  "Liga FUTVE": "ligafutve",
};

const CANONICAL_LEAGUE_NAME_BY_ID: Record<string, string> = {
  laliga: "LALIGA EA SPORTS",
  laliga2: "LALIGA HYPERMOTION",
  premier: "Premier League",
  championship: "EFL Championship",
  leagueone: "EFL League One",
  leaguetwo: "EFL League Two",
  seriea: "Serie A Enilive",
  serieb: "Serie BKT",
  bundesliga: "Bundesliga",
  bundesliga2: "Bundesliga 2",
  liga3: "3. Liga",
  ligue1: "Ligue 1 McDonald's",
  ligue2: "Ligue 2 BKT",
  trendyolsperlig: "Trendyol Süper Lig",
  scottish: "Scottish Premiership",
  ekstraklasa: "Ekstraklasa",
  "1aproleague": "Belgian Pro League",
  ligaportugal: "Liga Portugal",
  eredivisie: "Eredivisie",
  austrianbundesliga: "Ö. Bundesliga",
  mls: "MLS",
  lpf: "LPF",
  superliga: "SuperLiga (Rumanía)",
  bracksuperleague: "Brack Super League",
  "3fsuperliga": "3F Superliga",
  allsvenskan: "Allsvenskan",
  eliteserien: "Eliteserien",
  roshnsaudileague: "ROSHN Saudi League",
  ligabbvamx: "Liga MX",
  csl: "Chinese Super League",
  kleague1: "K League 1",
  aleague: "A-League Men",
  isl: "Indian Super League",
  sseairtricitypd: "League of Ireland Premier Division",
  hellasliga: "Super League Greece",
  ceskaliga: "Czech First League",
  ukrayinaliha: "Ukrainian Premier League",
  ligahrvatska: "Croatian Football League",
  ligacyprus: "Cypriot First Division",
  brasileirao: "Brasileirão Série A",
  chileprimera: "Primera División de Chile",
  ligabetplay: "Categoría Primera A",
  ligaproecuador: "LigaPro Serie A",
  paraguayprimera: "Primera División de Paraguay",
  liga1peru: "Liga 1 Perú",
  boliviaprofesional: "División Profesional de Bolivia",
  uruguayprimera: "Primera División de Uruguay",
  ligafutve: "Liga FUTVE",
};

function normalizeLeagueLabel(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const NORMALIZED_LEAGUE_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(LEAGUE_NAME_TO_ID).map(([name, id]) => [normalizeLeagueLabel(name), id]),
);
const NORMALIZED_LEAGUE_TO_COUNTRY: Record<string, { country: string; flag: string }> = Object.fromEntries(
  Object.entries(LEAGUE_TO_COUNTRY).map(([name, mapping]) => [normalizeLeagueLabel(name), mapping]),
);

// Solo se excluyen competiciones continentales y ligas para las que el dataset
// no contiene suficientes plantillas completas como para jugar una temporada.
export const EXCLUDED_LEAGUES = new Set<string>([
  "conmebollibertadores",
  "conmebolsudamericana",
  "libertadores",
  "sudamericana",
  "unitedemiratesleague",
  "magyarliga",
  "ligachile",
  "ligaazerbaijan",
  "finnliiga",
  "thailandleague",
  "ligabulgaria",
]);

export function leagueIdFromName(leagueName: string): string {
  return (
    LEAGUE_NAME_TO_ID[leagueName] ??
    NORMALIZED_LEAGUE_NAME_TO_ID[normalizeLeagueLabel(leagueName)] ??
    normalizeLeagueLabel(leagueName)
  );
}

// El export de jugadores coloca parte de los clubes brasileños en ligas vacías
// o en sus torneos CONMEBOL. La pertenencia nacional se resuelve por club para
// que el mercado y las plantillas no conviertan esas competiciones en ligas.
const BRAZILIAN_CLUB_KEYS = new Set([
  "atleticomineiro", "bahia", "botafogo", "corinthians", "cruzeiro", "flamengo",
  "fluminense", "gremio", "mirassol", "palmeiras", "rbbragantino", "santos",
  "saopaulo", "vascodagama",
]);

// Clubes cuya única plantilla del dataset está clasificada en Libertadores /
// Sudamericana. Se reasignan a su liga doméstica real, no a una copa continental.
const SOUTH_AMERICAN_CLUB_LEAGUES: Record<string, string> = {
  // Chile
  "unicatolica": "chileprimera",
  "coquimbounido": "chileprimera",
  "audaxitaliano": "chileprimera",
  "palestino": "chileprimera",
  "ohiggins": "chileprimera",
  // Colombia
  "atlnacional": "ligabetplay",
  "deportestolima": "ligabetplay",
  "indepsantafe": "ligabetplay",
  "indepmedellin": "ligabetplay",
  "junior": "ligabetplay",
  "americadecali": "ligabetplay",
  "millonarios": "ligabetplay",
  // Ecuador
  "lduquito": "ligaproecuador",
  "idv": "ligaproecuador",
  "barcelonasc": "ligaproecuador",
  "depcuenca": "ligaproecuador",
  "macar": "ligaproecuador",
  // Paraguay
  "cerroporteno": "paraguayprimera",
  "libertad": "paraguayprimera",
  "recoleta": "paraguayprimera",
  "olimpia": "paraguayprimera",
  // Perú
  "sportingcristal": "liga1peru",
  "cuscofc": "liga1peru",
  "cusco": "liga1peru",
  "universitario": "liga1peru",
  "cienciano": "liga1peru",
  "alianzaatltico": "liga1peru",
  "alianzaatletico": "liga1peru",
  // Bolivia
  "bolivar": "boliviaprofesional",
  "alwaysready": "boliviaprofesional",
  "blooming": "boliviaprofesional",
  "indpetrolero": "boliviaprofesional",
  // Uruguay
  "penarol": "uruguayprimera",
  "juventud": "uruguayprimera",
  "citytorque": "uruguayprimera",
  "bostonriver": "uruguayprimera",
  // Venezuela
  "ucvfc": "ligafutve",
  "deplaguaira": "ligafutve",
  "puertocabello": "ligafutve",
  "caracasfc": "ligafutve",
  "carabobofc": "ligafutve",
};

function datasetLeagueId(rawLeague: string, rawTeam: string): string | null {
  const teamKey = normalizeTeamLookup(rawTeam);
  if (BRAZILIAN_CLUB_KEYS.has(teamKey)) return "brasileirao";
  const SouthAmericanLeague = SOUTH_AMERICAN_CLUB_LEAGUES[teamKey];
  if (SouthAmericanLeague) return SouthAmericanLeague;
  // Jamshedpur tiene una plantilla completa en el export, pero sin League.
  if (teamKey === "jamshedpurfc") return "isl";
  if (!rawLeague.trim()) return null;
  const id = leagueIdFromName(rawLeague);
  if (id === "ligadobrasil") return "brasileirao";
  return id;
}

function getLeagueCountryMapping(leagueId: string, sourceLabel: string): { country: string; flag: string } | undefined {
  const canonicalName = CANONICAL_LEAGUE_NAME_BY_ID[leagueId];
  if (canonicalName && LEAGUE_TO_COUNTRY[canonicalName]) return LEAGUE_TO_COUNTRY[canonicalName];
  const originalMapping = LEAGUE_TO_COUNTRY[sourceLabel] ?? NORMALIZED_LEAGUE_TO_COUNTRY[normalizeLeagueLabel(sourceLabel)];
  if (originalMapping) return originalMapping;
  for (const [leagueName, mappedId] of Object.entries(LEAGUE_NAME_TO_ID)) {
    if (mappedId !== leagueId) continue;
    const mapping = LEAGUE_TO_COUNTRY[leagueName] ?? NORMALIZED_LEAGUE_TO_COUNTRY[normalizeLeagueLabel(leagueName)];
    if (mapping) return mapping;
  }
  return undefined;
}

function extractLeaguesFromJSON(): Record<string, { id: string; name: string; country: string; flag: string }> {
  const dataArray = Array.isArray(playersData) ? playersData : [];
  const teamCountsByLeague = new Map<string, Map<string, number>>();
  const metadataByLeague = new Map<string, { country: string; flag: string }>();

  for (const player of dataArray) {
    const rawLeague = String(player?.League ?? "").trim();
    const rawTeam = String(player?.Team ?? "").trim();
    if (!rawTeam) continue;
    const id = datasetLeagueId(rawLeague, rawTeam);
    if (!id || EXCLUDED_LEAGUES.has(id)) continue;
    const mapping = getLeagueCountryMapping(id, rawLeague);
    if (!mapping) continue;

    metadataByLeague.set(id, mapping);
    const teamKey = normalizeLeagueLabel(rawTeam);
    if (!teamCountsByLeague.has(id)) teamCountsByLeague.set(id, new Map());
    const counts = teamCountsByLeague.get(id)!;
    counts.set(teamKey, (counts.get(teamKey) ?? 0) + 1);
  }

  const leagues: Record<string, { id: string; name: string; country: string; flag: string }> = {};
  for (const [id, clubCounts] of teamCountsByLeague) {
    // Una competición solo se activa si la base aporta al menos dos plantillas
    // de 11 o más jugadores. Así no aparecen ligas fantasma de un único club.
    const completeClubCount = [...clubCounts.values()].filter((count) => count >= 11).length;
    if (completeClubCount < 2 || EXCLUDED_LEAGUES.has(id)) continue;
    const mapping = metadataByLeague.get(id);
    if (!mapping) continue;
    leagues[id] = {
      id,
      name: CANONICAL_LEAGUE_NAME_BY_ID[id] ?? id,
      country: mapping.country,
      flag: mapping.flag,
    };
  }

  return leagues;
}

export const LEAGUES = extractLeaguesFromJSON();

export type LeagueEntry = { id: string; name: string; country: string; flag: string };

const LEAGUE_COUNTRY_ORDER: Record<string, number> = {
  laliga: 1,
  laliga2: 2,
  premier: 1,
  championship: 2,
  leagueone: 3,
  leaguetwo: 4,
  seriea: 1,
  serieb: 2,
  bundesliga: 1,
  bundesliga2: 2,
  liga3: 3,
  ligue1: 1,
  ligue2: 2,
  brasileirao: 1,
  chileprimera: 1,
  ligabetplay: 1,
  ligaproecuador: 1,
  paraguayprimera: 1,
  liga1peru: 1,
  boliviaprofesional: 1,
  uruguayprimera: 1,
  ligafutve: 1,
};

export const LEAGUES_BY_COUNTRY: Record<string, LeagueEntry[]> = Object.values(LEAGUES).reduce(
  (acc, league) => {
    if (!acc[league.country]) acc[league.country] = [];
    acc[league.country].push(league);
    return acc;
  },
  {} as Record<string, LeagueEntry[]>,
);

for (const countryLeagues of Object.values(LEAGUES_BY_COUNTRY)) {
  countryLeagues.sort(
    (a, b) => (LEAGUE_COUNTRY_ORDER[a.id] ?? 99) - (LEAGUE_COUNTRY_ORDER[b.id] ?? 99) || a.name.localeCompare(b.name),
  );
}

const PRIMARY_LEAGUE_BY_COUNTRY: Record<string, string> = {
  España: "laliga",
  Inglaterra: "premier",
  Italia: "seriea",
  Alemania: "bundesliga",
  Francia: "ligue1",
  Portugal: "ligaportugal",
  "Países Bajos": "eredivisie",
  Turquía: "trendyolsperlig",
  "EE.UU.": "mls",
  Argentina: "lpf",
  Rumanía: "superliga",
  Escocia: "scottish",
  Bélgica: "1aproleague",
  Polonia: "ekstraklasa",
  Suiza: "bracksuperleague",
  Dinamarca: "3fsuperliga",
  Suecia: "allsvenskan",
  Noruega: "eliteserien",
  "Arabia Saudí": "roshnsaudileague",
  Austria: "austrianbundesliga",
  México: "ligabbvamx",
  China: "csl",
  "Corea del Sur": "kleague1",
  Australia: "aleague",
  India: "isl",
  Irlanda: "sseairtricitypd",
  Grecia: "hellasliga",
  Chequia: "ceskaliga",
  Ucrania: "ukrayinaliha",
  Croacia: "ligahrvatska",
  Chipre: "ligacyprus",
  Brasil: "brasileirao",
  Chile: "chileprimera",
  Colombia: "ligabetplay",
  Ecuador: "ligaproecuador",
  Paraguay: "paraguayprimera",
  Perú: "liga1peru",
  Bolivia: "boliviaprofesional",
  Uruguay: "uruguayprimera",
  Venezuela: "ligafutve",
};

/** Devuelve la máxima categoría nacional activa, usada para configurar la copa del país. */
export function getPrimaryLeagueForCountry(country: string): LeagueId | undefined {
  const primary = PRIMARY_LEAGUE_BY_COUNTRY[country];
  if (primary && LEAGUES[primary]) return primary as LeagueId;
  return LEAGUES_BY_COUNTRY[country]?.[0]?.id as LeagueId | undefined;
}

// 1. Cargamos la base estática original de 96 equipos para mantener la compatibilidad de rutas de Lovable
export const TEAMS: Team[] = [
  // ===== LALIGA EA SPORTS (20 equipos) =====
  {
    id: "rma",
    name: "Real Madrid",
    short: "RMA",
    city: "Madrid",
    league: "laliga",
    att: 92,
    mid: 90,
    def: 88,
    stars: ["Mbappé", "Bellingham", "Vinicius Jr."],
    color: "#FFFFFF",
  },
  {
    id: "bar",
    name: "FC Barcelona",
    short: "BAR",
    city: "Barcelona",
    league: "laliga",
    att: 90,
    mid: 88,
    def: 84,
    stars: ["Lamine Yamal", "Pedri", "Lewandowski"],
    color: "#A50044",
  },
  {
    id: "atm",
    name: "Atlético de Madrid",
    short: "ATM",
    city: "Madrid",
    league: "laliga",
    att: 85,
    mid: 84,
    def: 87,
    stars: ["Griezmann", "Julián Álvarez", "Oblak"],
    color: "#CB3524",
  },
  {
    id: "ath",
    name: "Athletic Club",
    short: "ATH",
    city: "Bilbao",
    league: "laliga",
    att: 80,
    mid: 79,
    def: 81,
    stars: ["Nico Williams", "Iñaki Williams"],
    color: "#EE2523",
  },
  {
    id: "rso",
    name: "Real Sociedad",
    short: "RSO",
    city: "San Sebastián",
    league: "laliga",
    att: 78,
    mid: 79,
    def: 78,
    stars: ["Take Kubo", "Oyarzabal"],
    color: "#0067B1",
  },
  {
    id: "bet",
    name: "Real Betis",
    short: "BET",
    city: "Sevilla",
    league: "laliga",
    att: 77,
    mid: 77,
    def: 75,
    stars: ["Isco", "Antony"],
    color: "#00954C",
  },
  {
    id: "vil",
    name: "Villarreal CF",
    short: "VIL",
    city: "Villarreal",
    league: "laliga",
    att: 78,
    mid: 77,
    def: 76,
    stars: ["Yeremy Pino", "Barry"],
    color: "#FFE667",
  },
  {
    id: "val",
    name: "Valencia CF",
    short: "VAL",
    city: "Valencia",
    league: "laliga",
    att: 73,
    mid: 72,
    def: 73,
    stars: ["Diego López"],
    color: "#F18E00",
  },
  {
    id: "sev",
    name: "Sevilla FC",
    short: "SEV",
    city: "Sevilla",
    league: "laliga",
    att: 74,
    mid: 73,
    def: 74,
    stars: ["En-Nesyri", "Ocampos"],
    color: "#D40009",
  },
  {
    id: "cel",
    name: "Celta",
    short: "CEL",
    city: "Vigo",
    league: "laliga",
    att: 75,
    mid: 74,
    def: 72,
    stars: ["Iago Aspas"],
    color: "#8AC3EE",
  },
  {
    id: "gir",
    name: "Girona FC",
    short: "GIR",
    city: "Girona",
    league: "laliga2",
    att: 76,
    mid: 75,
    def: 73,
    stars: ["Tsygankov"],
    color: "#CD2229",
  },
  {
    id: "mll",
    name: "RCD Mallorca",
    short: "MLL",
    city: "Palma",
    league: "laliga2",
    att: 70,
    mid: 71,
    def: 74,
    stars: ["Muriqi"],
    color: "#E20613",
  },
  {
    id: "rayo",
    name: "Rayo Vallecano",
    short: "RAY",
    city: "Madrid",
    league: "laliga",
    att: 72,
    mid: 73,
    def: 72,
    stars: ["Isi Palazón"],
    color: "#E53027",
  },
  {
    id: "osa",
    name: "CA Osasuna",
    short: "OSA",
    city: "Pamplona",
    league: "laliga",
    att: 71,
    mid: 72,
    def: 73,
    stars: ["Budimir"],
    color: "#D91A21",
  },
  {
    id: "get",
    name: "Getafe CF",
    short: "GET",
    city: "Getafe",
    league: "laliga",
    att: 70,
    mid: 71,
    def: 74,
    stars: ["Mayoral"],
    color: "#005999",
  },
  {
    id: "ala",
    name: "D. Alavés",
    short: "ALA",
    city: "Vitoria",
    league: "laliga",
    att: 68,
    mid: 69,
    def: 71,
    stars: ["Kike García"],
    color: "#0F2F8C",
  },
  {
    id: "elc",
    name: "Elche CF",
    short: "ELC",
    city: "Elche",
    league: "laliga",
    att: 69,
    mid: 70,
    def: 70,
    stars: ["Mourad"],
    color: "#007FC4",
  },
  {
    id: "esp",
    name: "RCD Espanyol",
    short: "ESP",
    city: "Barcelona",
    league: "laliga",
    att: 69,
    mid: 70,
    def: 70,
    stars: ["Joselu"],
    color: "#007FC4",
  },
  {
    id: "lev",
    name: "Levante UD",
    short: "LEV",
    city: "Valencia",
    league: "laliga",
    att: 68,
    mid: 69,
    def: 69,
    stars: ["Brugué"],
    color: "#B5142C",
  },
  {
    id: "ovi",
    name: "R. Oviedo",
    short: "OVI",
    city: "Oviedo",
    league: "laliga2",
    att: 71,
    mid: 72,
    def: 72,
    stars: ["Santi Cazorla"],
    color: "#0058A3",
  },

  // ===== LALIGA HYPERMOTION (22 equipos según JSON) =====
  {
    id: "lpa",
    name: "UD Las Palmas",
    short: "LPA",
    city: "Las Palmas",
    league: "laliga2",
    att: 70,
    mid: 71,
    def: 70,
    stars: ["Munir"],
    color: "#FFE000",
  },
  {
    id: "leg",
    name: "CD Leganés",
    short: "LEG",
    city: "Leganés",
    league: "laliga2",
    att: 66,
    mid: 67,
    def: 68,
    stars: ["Sergi González"],
    color: "#0043A8",
  },
  {
    id: "racing",
    name: "R. Racing Club",
    short: "RAC",
    city: "Santander",
    league: "laliga",
    att: 65,
    mid: 66,
    def: 65,
    stars: ["Marco Camus"],
    color: "#008747",
  },
  
  
  {
    id: "alb",
    name: "Albacete BP",
    short: "ALB",
    city: "Albacete",
    league: "laliga2",
    att: 63,
    mid: 64,
    def: 63,
    stars: ["Juanma"],
    color: "#000000",
  },
  {
    id: "burgos",
    name: "Burgos CF",
    short: "BUR",
    city: "Burgos",
    league: "laliga2",
    att: 62,
    mid: 63,
    def: 65,
    stars: ["Curro Sánchez"],
    color: "#FFFFFF",
  },
  {
    id: "eibar",
    name: "SD Eibar",
    short: "EIB",
    city: "Eibar",
    league: "laliga2",
    att: 67,
    mid: 67,
    def: 67,
    stars: ["Ager Aketxe"],
    color: "#A21218",
  },
  {
    id: "grana",
    name: "Granada CF",
    short: "GRA",
    city: "Granada",
    league: "laliga2",
    att: 66,
    mid: 66,
    def: 66,
    stars: ["Lucas Boyé"],
    color: "#C8102E",
  },
  {
    id: "sporting",
    name: "R. Sporting",
    short: "SPO",
    city: "Gijón",
    league: "laliga2",
    att: 66,
    mid: 67,
    def: 66,
    stars: ["Gaspar"],
    color: "#FF0000",
  },
  
  {
    id: "castellon",
    name: "CD Castellón",
    short: "CAS",
    city: "Castellón",
    league: "laliga2",
    att: 62,
    mid: 63,
    def: 63,
    stars: ["Marc Mateu"],
    color: "#FFD700",
  },
  {
    id: "depor",
    name: "RC Deportivo",
    short: "DEP",
    city: "La Coruña",
    league: "laliga",
    att: 64,
    mid: 65,
    def: 65,
    stars: ["Yeremay"],
    color: "#FFFFFF",
  },
  {
    id: "malaga",
    name: "Málaga CF",
    short: "MLG",
    city: "Málaga",
    league: "laliga",
    att: 63,
    mid: 64,
    def: 64,
    stars: ["Antonio Cordero"],
    color: "#7CFC00",
  },
  {
    id: "cordoba",
    name: "Córdoba CF",
    short: "COR",
    city: "Córdoba",
    league: "laliga2",
    att: 64,
    mid: 65,
    def: 64,
    stars: ["Antonio Casas"],
    color: "#FFFFFF",
  },
  {
    id: "valladolid",
    name: "R. Valladolid CF",
    short: "VAD",
    city: "Valladolid",
    league: "laliga2",
    att: 65,
    mid: 66,
    def: 65,
    stars: ["Víctor Meseguer"],
    color: "#7B1F3E",
  },
  {
    id: "cadiz",
    name: "Cádiz CF",
    short: "CAD",
    city: "Cádiz",
    league: "laliga2",
    att: 65,
    mid: 66,
    def: 66,
    stars: ["Chris Ramos"],
    color: "#FDF200",
  },
  {
    id: "almeria",
    name: "UD Almería",
    short: "ALM",
    city: "Almería",
    league: "laliga2",
    att: 66,
    mid: 66,
    def: 65,
    stars: ["Luis Suárez"],
    color: "#FF0000",
  },
  {
    id: "ceuta",
    name: "AD Ceuta FC",
    short: "CEU",
    city: "Ceuta",
    league: "laliga2",
    att: 62,
    mid: 63,
    def: 63,
    stars: ["Rodri"],
    color: "#0000FF",
  },
  {
    id: "andorra",
    name: "FC Andorra",
    short: "AND",
    city: "Andorra",
    league: "laliga2",
    att: 63,
    mid: 64,
    def: 64,
    stars: ["Martí"],
    color: "#800080",
  },
  
  {
    id: "rsb",
    name: "Real Sociedad B",
    short: "RSB",
    city: "San Sebastián",
    league: "laliga2",
    att: 61,
    mid: 62,
    def: 62,
    stars: ["Jon Ander"],
    color: "#0067B1",
  },

  // ===== PREMIER LEAGUE =====
  {
    id: "mci",
    name: "Manchester City",
    short: "MCI",
    city: "Manchester",
    league: "premier",
    att: 92,
    mid: 91,
    def: 88,
    stars: ["Haaland", "De Bruyne", "Rodri"],
    color: "#6CABDD",
  },
  {
    id: "liv",
    name: "Liverpool",
    short: "LIV",
    city: "Liverpool",
    league: "premier",
    att: 90,
    mid: 88,
    def: 86,
    stars: ["Salah", "Van Dijk", "Szoboszlai"],
    color: "#C8102E",
  },
  {
    id: "ars",
    name: "Arsenal",
    short: "ARS",
    city: "Londres",
    league: "premier",
    att: 88,
    mid: 88,
    def: 87,
    stars: ["Saka", "Ødegaard", "Saliba"],
    color: "#EF0107",
  },
  {
    id: "che",
    name: "Chelsea",
    short: "CHE",
    city: "Londres",
    league: "premier",
    att: 85,
    mid: 84,
    def: 83,
    stars: ["Palmer", "Caicedo"],
    color: "#034694",
  },
  {
    id: "tot",
    name: "Spurs",
    short: "TOT",
    city: "Londres",
    league: "premier",
    att: 84,
    mid: 82,
    def: 79,
    stars: ["Son", "Maddison"],
    color: "#132257",
  },
  {
    id: "mun",
    name: "Man Utd",
    short: "MUN",
    city: "Manchester",
    league: "premier",
    att: 83,
    mid: 82,
    def: 80,
    stars: ["Bruno Fernandes", "Garnacho"],
    color: "#DA291C",
  },
  {
    id: "new",
    name: "Newcastle Utd",
    short: "NEW",
    city: "Newcastle",
    league: "premier",
    att: 82,
    mid: 82,
    def: 83,
    stars: ["Isak", "Bruno G."],
    color: "#241F20",
  },
  {
    id: "avl",
    name: "Aston Villa",
    short: "AVL",
    city: "Birmingham",
    league: "premier",
    att: 81,
    mid: 81,
    def: 80,
    stars: ["Watkins", "McGinn"],
    color: "#670E36",
  },
  {
    id: "bri",
    name: "Brighton",
    short: "BRI",
    city: "Brighton",
    league: "premier",
    att: 79,
    mid: 80,
    def: 77,
    stars: ["Mitoma", "João Pedro"],
    color: "#0057B8",
  },
  
  {
    id: "cry",
    name: "Crystal Palace",
    short: "CRY",
    city: "Londres",
    league: "premier",
    att: 76,
    mid: 76,
    def: 76,
    stars: ["Eze", "Mateta"],
    color: "#1B458F",
  },
  {
    id: "ful",
    name: "Fulham",
    short: "FUL",
    city: "Londres",
    league: "premier",
    att: 75,
    mid: 76,
    def: 75,
    stars: ["Iwobi"],
    color: "#000000",
  },
  {
    id: "bou",
    name: "AFC Bournemouth",
    short: "BOU",
    city: "Bournemouth",
    league: "premier",
    att: 75,
    mid: 74,
    def: 74,
    stars: ["Semenyo"],
    color: "#DA020E",
  },
  {
    id: "bre",
    name: "Brentford",
    short: "BRE",
    city: "Londres",
    league: "premier",
    att: 74,
    mid: 74,
    def: 74,
    stars: ["Mbeumo"],
    color: "#E30613",
  },
  {
    id: "not",
    name: "Nott'm Forest",
    short: "NOT",
    city: "Nottingham",
    league: "premier",
    att: 76,
    mid: 75,
    def: 76,
    stars: ["Wood", "Gibbs-White"],
    color: "#DD0000",
  },
  {
    id: "eve",
    name: "Everton",
    short: "EVE",
    city: "Liverpool",
    league: "premier",
    att: 72,
    mid: 73,
    def: 76,
    stars: ["Calvert-Lewin"],
    color: "#003399",
  },
  
  {
    id: "lee",
    name: "Leeds United",
    short: "LEE",
    city: "Leeds",
    league: "premier",
    att: 72,
    mid: 73,
    def: 72,
    stars: ["Piroe"],
    color: "#FFCD00",
  },
  
  {
    id: "sun",
    name: "Sunderland",
    short: "SUN",
    city: "Sunderland",
    league: "premier",
    att: 70,
    mid: 71,
    def: 71,
    stars: ["Mayenda"],
    color: "#EB172B",
  },

  // ===== SERIE A =====
  {
    id: "int",
    name: "Lombardia FC",
    short: "INT",
    city: "Milán",
    league: "seriea",
    att: 89,
    mid: 87,
    def: 87,
    stars: ["Lautaro", "Thuram", "Barella"],
    color: "#0068A8",
  },
  {
    id: "nap",
    name: "SSC Napoli",
    short: "NAP",
    city: "Nápoles",
    league: "seriea",
    att: 87,
    mid: 86,
    def: 84,
    stars: ["Lukaku", "McTominay", "Kvara"],
    color: "#12A0D7",
  },
  {
    id: "juv",
    name: "Juventus",
    short: "JUV",
    city: "Turín",
    league: "seriea",
    att: 85,
    mid: 84,
    def: 86,
    stars: ["Vlahović", "Yıldız"],
    color: "#000000",
  },
  {
    id: "mil",
    name: "Milano FC",
    short: "MIL",
    city: "Milán",
    league: "seriea",
    att: 85,
    mid: 83,
    def: 82,
    stars: ["Leão", "Pulisic"],
    color: "#FB090B",
  },
  {
    id: "rom",
    name: "AS Roma",
    short: "ROM",
    city: "Roma",
    league: "seriea",
    att: 82,
    mid: 82,
    def: 82,
    stars: ["Dybala", "Pellegrini"],
    color: "#8E1F2F",
  },
  {
    id: "laz",
    name: "Latium",
    short: "LAZ",
    city: "Roma",
    league: "seriea",
    att: 80,
    mid: 81,
    def: 80,
    stars: ["Castellanos", "Zaccagni"],
    color: "#87CEEB",
  },
  {
    id: "ata",
    name: "Bergamo Calcio",
    short: "ATA",
    city: "Bérgamo",
    league: "seriea",
    att: 84,
    mid: 82,
    def: 81,
    stars: ["Lookman", "Retegui"],
    color: "#1A5DAA",
  },
  {
    id: "fio",
    name: "Fiorentina",
    short: "FIO",
    city: "Florencia",
    league: "seriea",
    att: 78,
    mid: 78,
    def: 78,
    stars: ["Kean"],
    color: "#4B2682",
  },
  {
    id: "bol",
    name: "Bologna",
    short: "BOL",
    city: "Bolonia",
    league: "seriea",
    att: 78,
    mid: 78,
    def: 79,
    stars: ["Orsolini"],
    color: "#94262F",
  },
  {
    id: "tor",
    name: "Torino",
    short: "TOR",
    city: "Turín",
    league: "seriea",
    att: 74,
    mid: 75,
    def: 76,
    stars: ["Zapata"],
    color: "#8B1A1A",
  },
  {
    id: "udi",
    name: "Udinese",
    short: "UDI",
    city: "Udine",
    league: "seriea",
    att: 73,
    mid: 74,
    def: 75,
    stars: ["Lucca"],
    color: "#000000",
  },
  {
    id: "gen",
    name: "Genoa",
    short: "GEN",
    city: "Génova",
    league: "seriea",
    att: 72,
    mid: 73,
    def: 73,
    stars: ["Pinamonti"],
    color: "#C8102E",
  },
  
  {
    id: "cag",
    name: "Cagliari",
    short: "CAG",
    city: "Cagliari",
    league: "seriea",
    att: 71,
    mid: 71,
    def: 72,
    stars: ["Piccoli"],
    color: "#B4001F",
  },
  {
    id: "par",
    name: "Parma",
    short: "PAR",
    city: "Parma",
    league: "seriea",
    att: 72,
    mid: 72,
    def: 72,
    stars: ["Bonny"],
    color: "#FFE600",
  },
  {
    id: "lec",
    name: "Lecce",
    short: "LEC",
    city: "Lecce",
    league: "seriea",
    att: 69,
    mid: 70,
    def: 71,
    stars: ["Krstović"],
    color: "#E30613",
  },
  {
    id: "com",
    name: "Como",
    short: "COM",
    city: "Como",
    league: "seriea",
    att: 74,
    mid: 74,
    def: 73,
    stars: ["Nico Paz"],
    color: "#0E2B7C",
  },
  {
    id: "sas",
    name: "Sassuolo",
    short: "SAS",
    city: "Sassuolo",
    league: "seriea",
    att: 73,
    mid: 72,
    def: 71,
    stars: ["Berardi"],
    color: "#00713B",
  },

  // ===== BUNDESLIGA =====
  {
    id: "bay",
    name: "FC Bayern München",
    short: "BAY",
    city: "Múnich",
    league: "bundesliga",
    att: 91,
    mid: 89,
    def: 86,
    stars: ["Kane", "Musiala", "Olise"],
    color: "#DC052D",
  },
  {
    id: "bvb",
    name: "Borussia Dortmund",
    short: "BVB",
    city: "Dortmund",
    league: "bundesliga",
    att: 85,
    mid: 84,
    def: 82,
    stars: ["Adeyemi", "Guirassy"],
    color: "#FDE100",
  },
  {
    id: "rbl",
    name: "RB Leipzig",
    short: "RBL",
    city: "Leipzig",
    league: "bundesliga",
    att: 84,
    mid: 84,
    def: 83,
    stars: ["Openda", "Šeško"],
    color: "#DD0741",
  },
  {
    id: "lev2",
    name: "Leverkusen",
    short: "B04",
    city: "Leverkusen",
    league: "bundesliga",
    att: 87,
    mid: 86,
    def: 85,
    stars: ["Wirtz", "Boniface"],
    color: "#E32221",
  },
  {
    id: "stu",
    name: "VfB Stuttgart",
    short: "STU",
    city: "Stuttgart",
    league: "bundesliga",
    att: 81,
    mid: 81,
    def: 80,
    stars: ["Undav", "Demirović"],
    color: "#E32219",
  },
  {
    id: "ein",
    name: "Frankfurt",
    short: "SGE",
    city: "Frankfurt",
    league: "bundesliga",
    att: 82,
    mid: 81,
    def: 79,
    stars: ["Ekitiké", "Marmoush"],
    color: "#E1000F",
  },
  {
    id: "hof",
    name: "TSG Hoffenheim",
    short: "TSG",
    city: "Sinsheim",
    league: "bundesliga",
    att: 75,
    mid: 75,
    def: 74,
    stars: ["Kramarić"],
    color: "#1961B5",
  },
  
  {
    id: "bre2",
    name: "SV Werder Bremen",
    short: "SVW",
    city: "Bremen",
    league: "bundesliga",
    att: 73,
    mid: 74,
    def: 75,
    stars: ["Ducksch"],
    color: "#1D9053",
  },
  {
    id: "fre",
    name: "SC Freiburg",
    short: "SCF",
    city: "Friburgo",
    league: "bundesliga",
    att: 75,
    mid: 76,
    def: 77,
    stars: ["Grifo"],
    color: "#E2231A",
  },
  {
    id: "mai",
    name: "1. FSV Mainz 05",
    short: "M05",
    city: "Maguncia",
    league: "bundesliga",
    att: 74,
    mid: 75,
    def: 76,
    stars: ["Burkardt"],
    color: "#C3141E",
  },
  {
    id: "bmg",
    name: "M'gladbach",
    short: "BMG",
    city: "Mönchengladbach",
    league: "bundesliga",
    att: 73,
    mid: 73,
    def: 73,
    stars: ["Honorat"],
    color: "#000000",
  },
  {
    id: "fcu",
    name: "Union Berlin",
    short: "FCU",
    city: "Berlín",
    league: "bundesliga",
    att: 72,
    mid: 73,
    def: 76,
    stars: ["Hollerbach"],
    color: "#EB1923",
  },
  {
    id: "fca",
    name: "FC Augsburg",
    short: "FCA",
    city: "Augsburgo",
    league: "bundesliga",
    att: 71,
    mid: 72,
    def: 73,
    stars: ["Tietz"],
    color: "#BA3733",
  },
  
  {
    id: "ham",
    name: "Hamburger SV",
    short: "HSV",
    city: "Hamburgo",
    league: "bundesliga",
    att: 72,
    mid: 72,
    def: 71,
    stars: ["Glatzel"],
    color: "#0F1F4B",
  },
  {
    id: "koe",
    name: "1. FC Köln",
    short: "KOE",
    city: "Colonia",
    league: "bundesliga",
    att: 71,
    mid: 71,
    def: 70,
    stars: ["Kainz"],
    color: "#ED1C24",
  },
  

  // ===== LIGUE 1 =====
  {
    id: "psg",
    name: "Paris SG",
    short: "PSG",
    city: "París",
    league: "ligue1",
    att: 91,
    mid: 89,
    def: 85,
    stars: ["Dembélé", "Doué", "Kvara"],
    color: "#004170",
  },
  {
    id: "mar",
    name: "OM",
    short: "OM",
    city: "Marsella",
    league: "ligue1",
    att: 82,
    mid: 81,
    def: 80,
    stars: ["Aubameyang", "Greenwood"],
    color: "#2FAEE0",
  },
  {
    id: "mon",
    name: "AS Monaco",
    short: "ASM",
    city: "Mónaco",
    league: "ligue1",
    att: 82,
    mid: 81,
    def: 80,
    stars: ["Embolo", "Akliouche"],
    color: "#E1000F",
  },
  {
    id: "lyo",
    name: "OL",
    short: "OL",
    city: "Lyon",
    league: "ligue1",
    att: 80,
    mid: 79,
    def: 78,
    stars: ["Lacazette", "Cherki"],
    color: "#1D2A6C",
  },
  {
    id: "lil",
    name: "LOSC Lille",
    short: "LIL",
    city: "Lille",
    league: "ligue1",
    att: 80,
    mid: 79,
    def: 79,
    stars: ["David", "Cabella"],
    color: "#E20613",
  },
  {
    id: "nic",
    name: "OGC Nice",
    short: "NIC",
    city: "Niza",
    league: "ligue1",
    att: 77,
    mid: 78,
    def: 78,
    stars: ["Guessand"],
    color: "#E2001A",
  },
  {
    id: "ren",
    name: "Stade Rennais FC",
    short: "REN",
    city: "Rennes",
    league: "ligue1",
    att: 77,
    mid: 77,
    def: 76,
    stars: ["Kalimuendo"],
    color: "#E2001A",
  },
  {
    id: "str",
    name: "Strasbourg",
    short: "STR",
    city: "Estrasburgo",
    league: "ligue1",
    att: 76,
    mid: 76,
    def: 75,
    stars: ["Emegha"],
    color: "#0066B3",
  },
  {
    id: "rcl",
    name: "RC Lens",
    short: "RCL",
    city: "Lens",
    league: "ligue1",
    att: 76,
    mid: 76,
    def: 77,
    stars: ["Thomasson"],
    color: "#EFB810",
  },
  {
    id: "tou",
    name: "Toulouse FC",
    short: "TOU",
    city: "Toulouse",
    league: "ligue1",
    att: 73,
    mid: 74,
    def: 74,
    stars: ["Magri"],
    color: "#582C83",
  },
  
  {
    id: "bre3",
    name: "Stade Brestois 29",
    short: "BRE",
    city: "Brest",
    league: "ligue1",
    att: 74,
    mid: 74,
    def: 74,
    stars: ["Ajorque"],
    color: "#C8102E",
  },
  {
    id: "ang",
    name: "Angers SCO",
    short: "ANG",
    city: "Angers",
    league: "ligue1",
    att: 69,
    mid: 70,
    def: 71,
    stars: ["Lepaul"],
    color: "#000000",
  },
  {
    id: "hav",
    name: "Havre AC",
    short: "HAC",
    city: "Le Havre",
    league: "ligue1",
    att: 70,
    mid: 71,
    def: 72,
    stars: ["Soumaré"],
    color: "#00B0F0",
  },
  {
    id: "auxe",
    name: "AJ Auxerre",
    short: "AUX",
    city: "Auxerre",
    league: "ligue1",
    att: 71,
    mid: 71,
    def: 71,
    stars: ["Sinayoko"],
    color: "#0066B3",
  },
  
  {
    id: "par2",
    name: "Paris FC",
    short: "PFC",
    city: "París",
    league: "ligue1",
    att: 71,
    mid: 71,
    def: 71,
    stars: ["López"],
    color: "#0066B3",
  },
  {
    id: "loi",
    name: "FC Lorient",
    short: "FCL",
    city: "Lorient",
    league: "ligue1",
    att: 70,
    mid: 70,
    def: 70,
    stars: ["Bamba"],
    color: "#FF7F00",
  },

  // ===== Ascensos temporada 2025/26 (añadidos automáticamente) =====
  {
    id: "ce",
    name: "CD Eldense",
    short: "CDE",
    city: "CD Eldense",
    league: "laliga2",
    att: 66,
    mid: 67,
    def: 64,
    stars: ["Justin Smith", "Fidel", "Floris Smand"],
    color: "#1a1a2e",
  },
  {
    id: "ct",
    name: "CD Tenerife",
    short: "CDT",
    city: "CD Tenerife",
    league: "laliga2",
    att: 66,
    mid: 66,
    def: 66,
    stars: ["Mauro Pittón", "Enric Gallego", "Nacho Gil"],
    color: "#16213e",
  },
  {
    id: "cf",
    name: "Celta Fortuna",
    short: "CEL",
    city: "Celta Fortuna",
    league: "laliga2",
    att: 64,
    mid: 65,
    def: 65,
    stars: ["Hugo Burcio", "Joel López", "Coke Carrillo"],
    color: "#0f3460",
  },
  {
    id: "csf",
    name: "CE Sabadell FC",
    short: "CSF",
    city: "CE Sabadell FC",
    league: "laliga2",
    att: 66,
    mid: 70,
    def: 66,
    stars: ["Pere Pons", "Nicholas Gioacchini", "Pipa"],
    color: "#533483",
  },
  {
    id: "cc",
    name: "Coventry City",
    short: "COV",
    city: "Coventry City",
    league: "premier",
    att: 73,
    mid: 72,
    def: 72,
    stars: ["Carl Rushworth", "Matt Grimes", "Gustavo Hamer"],
    color: "#e94560",
  },
  {
    id: "hc",
    name: "Hull City",
    short: "HUL",
    city: "Hull City",
    league: "premier",
    att: 69,
    mid: 71,
    def: 71,
    stars: ["Konstantinos Tzolakis", "Hidemasa Morita", "Jack Butland"],
    color: "#2c3e50",
  },
  {
    id: "it",
    name: "Ipswich Town",
    short: "IPS",
    city: "Ipswich Town",
    league: "premier",
    att: 71,
    mid: 74,
    def: 74,
    stars: ["Daizen Maeda", "Saša Lukić", "Julio César Enciso"],
    color: "#8e44ad",
  },
  {
    id: "fro",
    name: "Frosinone",
    short: "FRO",
    city: "Frosinone",
    league: "seriea",
    att: 72,
    mid: 69,
    def: 68,
    stars: ["Romano Schmid", "Florian Grillitsch", "Giacomo Calò"],
    color: "#2980b9",
  },
  {
    id: "monz",
    name: "Monza",
    short: "MON",
    city: "Monza",
    league: "seriea",
    att: 71,
    mid: 69,
    def: 69,
    stars: ["Matteo Pessina", "Andrea Colpani", "Samuele Birindelli"],
    color: "#27ae60",
  },
  {
    id: "ven",
    name: "Venezia",
    short: "VEN",
    city: "Venezia",
    league: "seriea",
    att: 72,
    mid: 70,
    def: 69,
    stars: ["Albion Rrahmani", "Lorenzo Montipò", "Gianluca Busio"],
    color: "#e67e22",
  },
  {
    id: "fs0",
    name: "FC Schalke 04",
    short: "FCS",
    city: "FC Schalke 04",
    league: "bundesliga",
    att: 69,
    mid: 69,
    def: 69,
    stars: ["Robin Gosens", "Edin Džeko", "Loris Karius"],
    color: "#c0392b",
  },
  {
    id: "sp0",
    name: "SC Paderborn 07",
    short: "SCP",
    city: "SC Paderborn 07",
    league: "bundesliga",
    att: 66,
    mid: 69,
    def: 67,
    stars: ["Laurin Curda", "Raphael Obermair", "Felix Götze"],
    color: "#16a085",
  },
  {
    id: "se",
    name: "SV Elversberg",
    short: "SVE",
    city: "SV Elversberg",
    league: "bundesliga",
    att: 68,
    mid: 68,
    def: 68,
    stars: ["Lukas Petkov", "Noel Futkeu", "Luca Sirch"],
    color: "#1a1a2e",
  },
  {
    id: "eta",
    name: "ES Troyes AC",
    short: "ETA",
    city: "ES Troyes AC",
    league: "ligue1",
    att: 64,
    mid: 67,
    def: 66,
    stars: ["Junior Diaz", "Antoine Mille", "Adrien Monfray"],
    color: "#16213e",
  },
  {
    id: "lmf",
    name: "Le Mans FC",
    short: "LMF",
    city: "Le Mans FC",
    league: "ligue1",
    att: 69,
    mid: 65,
    def: 70,
    stars: ["Djibril Sidibé", "Billal Brahimi", "Torrente"],
    color: "#0f3460",
  },
];

function generateDynamicTeams(): Team[] {
  const dataArray = Array.isArray(playersData) ? playersData : [];
  const staticNameKeys = new Set(
    TEAMS.flatMap((team) => [normalizeTeamLookup(team.name), normalizeTeamLookup(team.id)]),
  );
  const staticAliasKeys = new Set<string>();
  for (const [alias, target] of Object.entries(TEAM_NAME_ALIASES)) {
    if (staticNameKeys.has(normalizeTeamLookup(target))) {
      staticAliasKeys.add(normalizeTeamLookup(alias));
    }
  }

  // Cada grupo pertenece a una sola liga. Así un ascenso/descenso o un club
  // homónimo de otro país no termina mezclando plantillas de dos competiciones.
  const teamMap = new Map<string, { name: string; league: string; players: any[] }>();
  for (const player of dataArray) {
    const rawLeague = String(player?.League ?? "").trim();
    const rawTeam = String(player?.Team ?? "").trim();
    if (!rawTeam) continue;

    const leagueId = datasetLeagueId(rawLeague, rawTeam);
    if (!leagueId || EXCLUDED_LEAGUES.has(leagueId) || !LEAGUES[leagueId]) continue;

    const rawTeamKey = normalizeTeamLookup(rawTeam);
    const aliasTarget = TEAM_NAME_ALIASES[rawTeamKey];
    const canonicalName = aliasTarget ?? rawTeam;
    const canonicalKey = normalizeTeamLookup(canonicalName);

    // Los equipos definidos manualmente conservan sus IDs históricos, pero
    // sus ligas se sincronizan con el club y la temporada presentes en el JSON.
    if (
      staticNameKeys.has(rawTeamKey) ||
      staticNameKeys.has(canonicalKey) ||
      staticAliasKeys.has(rawTeamKey)
    ) {
      continue;
    }

    const groupKey = `${leagueId}::${canonicalKey}`;
    if (!teamMap.has(groupKey)) {
      teamMap.set(groupKey, { name: canonicalName, league: leagueId, players: [] });
    }
    teamMap.get(groupKey)!.players.push(player);
  }

  // No se crean equipos falsos a partir de grupos incompletos de datos (11
  // jugadores mínimo) ni se activa una competición con un solo club jugable.
  const validTeams = [...teamMap.entries()].filter(([, data]) => data.players.length >= 11);
  const leagueCounts = new Map<string, number>();
  for (const [, data] of validTeams) {
    leagueCounts.set(data.league, (leagueCounts.get(data.league) ?? 0) + 1);
  }
  const playableTeams = validTeams
    .filter(([, data]) => (leagueCounts.get(data.league) ?? 0) >= 2)
    .sort(([, a], [, b]) => a.league.localeCompare(b.league) || a.name.localeCompare(b.name, "es"));

  const colors = [
    "#1a1a2e",
    "#16213e",
    "#0f3460",
    "#533483",
    "#e94560",
    "#2c3e50",
    "#8e44ad",
    "#2980b9",
    "#27ae60",
    "#e67e22",
    "#c0392b",
    "#16a085",
  ];
  const usedIds = new Set(TEAMS.map((team) => normalizeTeamLookup(team.id)));

  return playableTeams.map(([groupKey, data], index) => {
    const sorted = data.players.slice().sort((a, b) => Number(b.OVR || 70) - Number(a.OVR || 70));
    const top3 = sorted.slice(0, 3).map((player: any) => String(player.Name || "Jugador"));
    const averageOvr = sorted.length
      ? Math.round(sorted.reduce((sum: number, player: any) => sum + Number(player.OVR || 70), 0) / sorted.length)
      : 70;
    const averageForPositions = (positions: string[]) => {
      const rolePlayers = sorted.filter((player: any) => positions.includes(String(player.Position ?? "").toUpperCase()));
      return rolePlayers.length
        ? Math.round(rolePlayers.reduce((sum: number, player: any) => sum + Number(player.OVR || 70), 0) / rolePlayers.length)
        : averageOvr;
    };
    const teamKey = normalizeTeamLookup(data.name);
    let id = teamKey || normalizeTeamLookup(groupKey);
    if (usedIds.has(id)) id = `${id}-${data.league}`;
    usedIds.add(id);

    const words = data.name.trim().split(/\s+/).filter(Boolean);
    const shortWords = words.filter((word) => !/^(fc|cf|ac|sc|rc|cd|ud|real|club|de|the)$/i.test(word));
    const acronym = shortWords.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
    const short = acronym.length >= 2 ? acronym.slice(0, 3) : data.name.slice(0, 3).toUpperCase();

    return {
      id,
      name: data.name,
      short,
      city: data.name,
      league: data.league,
      att: Math.max(50, averageForPositions(["ST", "CF", "LW", "RW", "LF", "RF", "CAM"])),
      mid: Math.max(50, averageForPositions(["CM", "CDM", "CAM", "LM", "RM"])),
      def: Math.max(50, averageForPositions(["CB", "LB", "RB", "LWB", "RWB"])),
      stars: top3,
      color: colors[index % colors.length],
    } satisfies Team;
  });
}

let _dynamicTeams: Team[] | null = null;
function getDynamicTeams(): Team[] {
  if (!_dynamicTeams) {
    try {
      _dynamicTeams = generateDynamicTeams() || [];
    } catch (err) {
      console.error("Error generating dynamic teams:", err);
      _dynamicTeams = [];
    }
  }
  return _dynamicTeams;
}

let _allTeamsMap: Map<string, Team> | null = null;
export function getAllTeams(context?: TeamLeagueContext): Team[] {
  synchronizeStaticTeamLeaguesFromDataset();
  const teams = [...TEAMS, ...getDynamicTeams()];
  const overrides = resolveTeamLeagueContext(context)?.teamLeagueOverrides;
  if (!overrides || Object.keys(overrides).length === 0) return teams;
  return teams.map((team) => withEffectiveLeague(team, { teamLeagueOverrides: overrides }));
}

function getTeamsMap(): Map<string, Team> {
  synchronizeStaticTeamLeaguesFromDataset();
  if (!_allTeamsMap) {
    _allTeamsMap = new Map();
    for (const t of TEAMS) _allTeamsMap.set(t.id.toLowerCase(), t);
    for (const t of getDynamicTeams()) _allTeamsMap.set(t.id.toLowerCase(), t);
  }
  return _allTeamsMap;
}

/** Lookup exacto por ID; a diferencia de teamById, no usa un equipo de respaldo. */
export function findTeamById(id: string, context?: TeamLeagueContext): Team | null {
  const normalized = String(id ?? "").toLowerCase().trim();
  const team = normalized ? getTeamsMap().get(normalized) ?? null : null;
  return team ? withEffectiveLeague(team, context) : null;
}

export function normalizeTeamLookup(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const TEAM_NAME_ALIASES: Record<string, string> = {
  manutd: "Man Utd",
  manchesterunited: "Man Utd",
  tottenham: "Spurs",
  tottenhamhotspur: "Spurs",
  newcastleunited: "Newcastle Utd",
  nottinghamforest: "Nott'm Forest",
  nottmforest: "Nott'm Forest",
  // Nombre real usado en el dataset de jugadores ("Notting. Forest"),
  // distinto de los alias anteriores: sin este, el Nottingham Forest se
  // quedaba sin ningún jugador.
  nottingforest: "Nott'm Forest",
  // El dataset usa "Leeds Utd", no "Leeds United".
  leedsutd: "Leeds United",
  inter: "Lombardia FC",
  intermilan: "Lombardia FC",
  acmilan: "Milano FC",
  milan: "Milano FC",
  lazio: "Latium",
  atalanta: "Bergamo Calcio",
  alaves: "D. Alavés",
  deportivoalaves: "D. Alavés",
  elche: "Elche CF",
  realoviedo: "R. Oviedo",
  sportinggijon: "R. Sporting",
  racingsantander: "R. Racing Club",
  realvalladolid: "R. Valladolid CF",
  parisstgermain: "Paris SG",
  psg: "Paris SG",
  marseille: "OM",
  lyon: "OL",
  stadebrest: "Stade Brestois 29",
  lehavre: "Havre AC",
  rennes: "Stade Rennais FC",
  // El dataset trae varios equipos con el nombre en español o abreviado de
  // forma distinta al del juego; sin estos alias esos clubes se quedaban
  // con la plantilla vacía.
  bolonia: "Bologna", // dataset: "Bolonia"
  omarsella: "OM", // dataset: "O. Marsella"
  ogcniza: "OGC Nice", // dataset: "OGC Niza"
  olympiquelyon: "OL", // dataset: "Olympique Lyon"
  stadebrestois: "Stade Brestois 29", // dataset: "Stade Brestois" (sin "29")
  lehavreac: "Havre AC", // dataset: "Le Havre AC"
  celtavigo: "Celta",
  racingclubdesantander: "R. Racing Club",
  albacetebalompie: "Albacete BP",
  cadiz: "Cádiz CF",
  almeria: "UD Almería",
  realzaragoza: "Real Zaragoza",
  westhamunited: "West Ham Utd",
  westham: "West Ham Utd",
  wolves: "Wolves",
  wolverhamptonwanderers: "Wolves",
  sheffieldunited: "Sheffield United",
  leicestercity: "Leicester City",
  necnimega: "NEC Nijmegen",
  necnijmegen: "NEC Nijmegen",
  vflwolfsburgo: "VfL Wolfsburg",
  alemanaaachen: "Alemannia Aachen",
  alemanachaachen: "Alemannia Aachen",
  atlticodesl: "Atlético de San Luis",
  clublen: "Club León",
  fcjurez: "FC Juárez",
  quertarofc: "Querétaro FC",
  olymiakos: "Olympiacos",
  lduquito: "LDU Quito",
  idv: "Independiente del Valle",
  unicatolica: "Universidad Católica",
  indepsantafe: "Independiente Santa Fe",
  indepmedellin: "Independiente Medellín",
  deptolima: "Deportes Tolima",
  deportestolima: "Deportes Tolima",
  barcelonasc: "Barcelona SC",
  depcuenca: "Deportivo Cuenca",
  macar: "Macará",
  alianzaatltico: "Alianza Atlético",
  indepetr: "Independiente Petrolero",
  indpetrolero: "Independiente Petrolero",
  ucvfc: "Universidad Central de Venezuela",
  deplaguaira: "Deportivo La Guaira",
  puertocabello: "Academia Puerto Cabello",
  citytorque: "Montevideo City Torque",
  atlnacional: "Atlético Nacional",
  junior: "Junior de Barranquilla",
  recoleta: "Deportivo Recoleta",
  juventud: "Juventud de Las Piedras",
};

let _staticTeamLeaguesSynced = false;

/**
 * Alinea los clubes heredados con la liga del catálogo de jugadores que acompaña
 * al proyecto. Los IDs históricos no cambian, por lo que las partidas guardadas
 * siguen siendo compatibles, pero los equipos dejan de quedarse en divisiones
 * antiguas después de ascensos, descensos o cambios de temporada.
 */
function synchronizeStaticTeamLeaguesFromDataset(): void {
  if (_staticTeamLeaguesSynced) return;
  _staticTeamLeaguesSynced = true;

  const byName = new Map<string, Team>();
  for (const team of TEAMS) {
    byName.set(normalizeTeamLookup(team.name), team);
    byName.set(normalizeTeamLookup(team.id), team);
  }

  const staticTeamForSourceName = (sourceName: string): Team | undefined => {
    const normalized = normalizeTeamLookup(sourceName);
    const direct = byName.get(normalized);
    if (direct) return direct;
    const alias = TEAM_NAME_ALIASES[normalized];
    return alias ? byName.get(normalizeTeamLookup(alias)) : undefined;
  };

  const countsByTeam = new Map<string, Map<string, number>>();
  for (const player of Array.isArray(playersData) ? playersData : []) {
    const teamName = String(player?.Team ?? "").trim();
    const leagueName = String(player?.League ?? "").trim();
    if (!teamName) continue;
    const leagueId = datasetLeagueId(leagueName, teamName);
    if (!leagueId || !LEAGUES[leagueId] || EXCLUDED_LEAGUES.has(leagueId)) continue;
    const staticTeam = staticTeamForSourceName(teamName);
    if (!staticTeam) continue;

    if (!countsByTeam.has(staticTeam.id)) countsByTeam.set(staticTeam.id, new Map());
    const counts = countsByTeam.get(staticTeam.id)!;
    counts.set(leagueId, (counts.get(leagueId) ?? 0) + 1);
  }

  for (const team of TEAMS) {
    const counts = countsByTeam.get(team.id);
    if (!counts || counts.size === 0) continue;
    const ranked = [...counts.entries()].sort(([leagueA, countA], [leagueB, countB]) =>
      countB - countA || Number(leagueB === team.league) - Number(leagueA === team.league) || leagueA.localeCompare(leagueB),
    );
    const [mostLikelyLeague, playerCount] = ranked[0];
    if (playerCount > 0 && LEAGUES[mostLikelyLeague]) team.league = mostLikelyLeague;
  }
}

let _teamLookupMap: Map<string, Team> | null = null;
function getTeamLookupMap(): Map<string, Team> {
  if (!_teamLookupMap) {
    _teamLookupMap = new Map();
    for (const team of getAllTeams({ teamLeagueOverrides: {} })) {
      _teamLookupMap.set(normalizeTeamLookup(team.id), team);
      _teamLookupMap.set(normalizeTeamLookup(team.name), team);
    }
  }
  return _teamLookupMap;
}

export function findTeamByName(name: string, context?: TeamLeagueContext): Team | null {
  const normalized = normalizeTeamLookup(name);
  if (!normalized) return null;

  const lookup = getTeamLookupMap();
  const direct = lookup.get(normalized);
  if (direct) return withEffectiveLeague(direct, context);

  const aliasTarget = TEAM_NAME_ALIASES[normalized];
  if (aliasTarget) {
    const aliased = lookup.get(normalizeTeamLookup(aliasTarget));
    if (aliased) return withEffectiveLeague(aliased, context);
  }

  const all = getAllTeams(context);
  return (
    all.find((team) => {
      const teamName = normalizeTeamLookup(team.name);
      const teamId = normalizeTeamLookup(team.id);
      return (
        normalized === teamName ||
        normalized === teamId ||
        normalized.includes(teamName) ||
        teamName.includes(normalized) ||
        normalized.includes(teamId) ||
        teamId.includes(normalized)
      );
    }) ?? null
  );
}

export function teamKeyFromName(name: string): string {
  return findTeamByName(name)?.id ?? normalizeTeamLookup(name);
}

/**
 * Emparejamiento ESTRICTO entre el nombre de club del dataset y los equipos
 * del juego. A diferencia de findTeamByName, NO usa coincidencias parciales
 * (que metían, por ejemplo, a los jugadores del "Barcelona SC" de Ecuador en
 * la plantilla del FC Barcelona). Solo acepta:
 *   - igualdad exacta con el id o el nombre normalizado del equipo
 *   - un alias declarado explícitamente
 * Además, si se conoce la liga del jugador en el dataset, esta debe coincidir
 * con la liga del equipo del juego.
 */
export function findTeamStrict(name: string, leagueName?: string, context?: TeamLeagueContext): Team | null {
  const normalized = normalizeTeamLookup(name);
  if (!normalized) return null;

  const lookup = getTeamLookupMap();
  let baseTeam = lookup.get(normalized) ?? null;

  if (!baseTeam) {
    const aliasTarget = TEAM_NAME_ALIASES[normalized];
    if (aliasTarget) baseTeam = lookup.get(normalizeTeamLookup(aliasTarget)) ?? null;
  }

  if (!baseTeam) return null;

  // Disambiguate against the static source-data league before applying career
  // overrides. The players catalogue describes the original club identity; a
  // promotion/relegation must not make an identically named foreign club win
  // the lookup merely because the active career moved the first club.
  if (leagueName) {
    const sourceLeagueId = datasetLeagueId(leagueName, name) ?? leagueIdFromName(leagueName);
    if (sourceLeagueId && baseTeam.league !== sourceLeagueId) {
      const sameNameInSourceLeague = getAllTeams({ teamLeagueOverrides: {} }).find(
        (candidate) => candidate.league === sourceLeagueId
          && (normalizeTeamLookup(candidate.name) === normalized || normalizeTeamLookup(candidate.id) === normalized),
      );
      if (sameNameInSourceLeague) baseTeam = sameNameInSourceLeague;
    }
  }

  return withEffectiveLeague(baseTeam, context);
}

// 3. SÚPER RED DE SEGURIDAD: Esta función JAMÁS lanzará un "Team not found"
export function teamById(id: string, context?: TeamLeagueContext): Team {
  const resolvedContext = resolveTeamLeagueContext(context);
  if (!id) {
    const all = getAllTeams(resolvedContext);
    const fallback = all.find((t) => t.id === "liv") || all[0];
    if (!fallback) throw new Error("No hay equipos registrados en el juego");
    return fallback;
  }

  const query = id.toLowerCase().trim();
  const map = getTeamsMap();

  // O(1) lookup by id
  let found = map.get(query);
  if (found) return withEffectiveLeague(found, resolvedContext);

  // Fallback: search by partial match
  const all = getAllTeams(resolvedContext);
  found = all.find((t) => query.includes(t.id.toLowerCase()) || t.id.toLowerCase().includes(query));
  if (found) return withEffectiveLeague(found, resolvedContext);

  // Fallback: search by normalized name
  const cleanQuery = query.replace(/[^a-z0-9]/g, "");
  found = all.find((t) => t.name.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanQuery);
  if (found) return withEffectiveLeague(found, resolvedContext);

  const fallback = all.find((t) => t.id === "liv") || all[0];
  if (!fallback) throw new Error("No hay equipos registrados en el juego");
  return withEffectiveLeague(fallback, resolvedContext);
}

/** League assigned to a club in this career, without mutating the global Team registry. */
export function getTeamLeagueId(teamOrId: Team | string | null | undefined, context?: TeamLeagueContext): LeagueId | null {
  if (!teamOrId) return null;
  const resolvedContext = resolveTeamLeagueContext(context);
  const teamId = typeof teamOrId === "string" ? teamOrId : teamOrId.id;
  // Resolve the base assignment from the static registry first. A Team object
  // may have been rendered under another career's active context; it must not
  // leak that career's category when an explicit SaveGame is supplied here.
  const baseTeam = findTeamById(teamId, { teamLeagueOverrides: {} });
  if (!baseTeam) return null;
  return resolvedContext?.teamLeagueOverrides?.[baseTeam.id] ?? baseTeam.league;
}

/** Returns clubs in the requested league using the career-specific assignments. */
export function teamsByLeague(league: LeagueId, context?: TeamLeagueContext): Team[] {
  const resolvedContext = resolveTeamLeagueContext(context);
  const overrides = resolvedContext?.teamLeagueOverrides;
  if (!overrides || Object.keys(overrides).length === 0) {
    return getAllTeams(resolvedContext).filter((t) => t.league === league);
  }
  return getAllTeams(resolvedContext).filter((team) => team.league === league);
}

export function overall(t: Team): number {
  return Math.round((t.att + t.mid + t.def) / 3);
}

// ============================================================================
// NIVEL (TIER) DE CADA LIGA DENTRO DE SU PAÍS
// ----------------------------------------------------------------------------
// Solo se modela la jerarquía de divisiones para los países en los que el
// juego incluye varias categorías. El resto de ligas (Portugal, Países
// Bajos, MLS, etc.) son de un único nivel dentro del juego, así que no
// llevan hándicap.
// ============================================================================
const LEAGUE_TIER: Record<string, number> = {
  laliga: 1,
  laliga2: 2,
  premier: 1,
  championship: 2,
  leagueone: 3,
  leaguetwo: 4,
  seriea: 1,
  serieb: 2,
  bundesliga: 1,
  bundesliga2: 2,
  liga3: 3,
  ligue1: 1,
  ligue2: 2,
};

/**
 * Nivel (1 = máxima categoría) de una liga dentro de su país. Acepta tanto
 * una clave de liga como un ID de club; en el segundo caso resuelve primero
 * la categoría efectiva de la carrera activa (o el contexto explícito).
 */
export function getLeagueTier(leagueIdOrTeamId: string, context?: TeamLeagueContext): number {
  let leagueId = leagueIdOrTeamId;
  if (LEAGUE_TIER[leagueId] === undefined) {
    leagueId = getTeamLeagueId(leagueIdOrTeamId, context) ?? leagueIdOrTeamId;
  }
  return LEAGUE_TIER[leagueId] ?? 1;
}

/**
 * Actualiza la media (att/mid/def) de un equipo ya existente, mutando el
 * mismo objeto que devuelven `teamById`/`getAllTeams` para que todas las
 * pantallas y sistemas (fichas de club, partidos, sorteos, IA de mercado...)
 * vean el cambio sin tener que tocar cada punto donde se lee `team.att`.
 * Se llama cada vez que la plantilla real de un club cambia (fichajes,
 * ventas, cesiones) para que la media del equipo esté siempre equiparada a
 * la de sus jugadores actuales.
 */
export function applyTeamRating(
  teamId: string,
  rating: { att: number; mid: number; def: number },
): void {
  const team = getTeamsMap().get(teamId.toLowerCase());
  if (!team) return;
  team.att = rating.att;
  team.mid = rating.mid;
  team.def = rating.def;
}

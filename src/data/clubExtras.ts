import extrasRaw from "./clubExtras.json";

export type ClubExtra = {
  stadium: string;
  year: number;
  capacity: number;
  rival1: string | null;
  rival2: string | null;
  country: string;
  league: string;
};

const EXTRAS: Record<string, ClubExtra> = extrasRaw as any;

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Build a normalized index for fuzzy lookup by team name.
const INDEX: Record<string, ClubExtra> = {};
for (const [name, data] of Object.entries(EXTRAS)) {
  INDEX[norm(name)] = data;
}

// Manual aliases for cases where the in-game team name differs from the
// canonical name in enrich_clubs.py.
const ALIASES: Record<string, string> = {
  lombardiafc: "Inter",
  inter: "Inter",
  milanofc: "AC Milan",
  milan: "AC Milan",
  manutd: "Manchester Utd",
  manchesterunited: "Manchester Utd",
  spurs: "Tottenham",
  tottenhamhotspur: "Tottenham",
  tottenham: "Tottenham",
  newcastleutd: "Newcastle",
  afcbournemouth: "Bournemouth",
  nottmforest: "Nottingham Forest",
  wolves: "Wolves",
  leedsunited: "Leeds United",
  westham: "West Ham",
  crystalpalace: "Crystal Palace",
  parissg: "Paris Saint-Germain",
  psg: "Paris Saint-Germain",
  om: "Olympique de Marseille",
  ol: "Olympique Lyonnais",
  asmonaco: "AS Monaco",
  loscille: "LOSC Lille",
  ogcnice: "OGC Nice",
  staderennaisfc: "Stade Rennais",
  rclens: "RC Lens",
  rcdmallorca: "RCD Mallorca",
  datletico: "D. Alavés",
  dalaves: "D. Alavés",
  elchecf: "Elche",
  rcdespanyol: "RCD Espanyol",
  levanteud: "Levante UD",
  roviedo: "R. Oviedo",
  udlaspalmas: "UD Las Palmas",
  cdleganes: "CD Leganés",
  rracingclub: "Racing Club Santander",
  sdhuesca: "SD Huesca",
  cdmirandes: "CD Mirandés",
  albacetebp: "Albacete BP",
  burgoscf: "Burgos CF",
  sdeibar: "SD Eibar",
  granadacf: "Granada CF",
  rsporting: "R. Sporting",
  realzaragoza: "Real Zaragoza",
  cdcastellon: "CD Castellón",
  rcdeportivo: "RC Deportivo",
  malagacf: "Málaga CF",
  cordobacf: "Córdoba CF",
  rvalladolidcf: "R. Valladolid",
  cadizcf: "Cádiz CF",
  udalmeria: "UD Almería",
  adceutafc: "AD Ceuta",
  fcandorra: "FC Andorra",
  culturalleonesa: "Cultural Leonesa",
  realsociedadb: "Real Sociedad B",
  frankfurt: "Frankfurt",
  leverkusen: "Bayer Leverkusen",
  mgladbach: "Borussia Mönchengladbach",
  ssnapoli: "SSC Napoli",
  latium: "Lazio",
  bergamocalcio: "Atalanta",
  stadebrestois29: "Brest",
  havreac: "Le Havre",
  ajauxerre: "AJ Auxerre",
  fcmetz: "FC Metz",
  parisfc: "Paris FC",
  fclorient: "FC Lorient",
};

export function getClubExtra(name: string): ClubExtra | null {
  const n = norm(name);
  if (INDEX[n]) return INDEX[n];
  const alias = ALIASES[n];
  if (alias) return INDEX[norm(alias)] ?? null;
  // Try suffix/prefix soft match
  for (const k of Object.keys(INDEX)) {
    if (k.includes(n) || n.includes(k)) return INDEX[k];
  }
  return null;
}

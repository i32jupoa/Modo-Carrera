import type { Fixture } from "@/lib/season";

// ---------- Seeded RNG ----------
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ---------- Referee ----------
const REFEREES = [
  "Mateu Lahoz", "De Burgos Bengoetxea", "Munuera Montero", "Hernández Hernández",
  "Gil Manzano", "Cuadra Fernández", "Sánchez Martínez", "Soto Grado",
  "Pizarro Gómez", "González Fuertes", "Martínez Munuera", "Figueroa Vázquez",
  "Daniele Orsato", "Felix Brych", "Anthony Taylor", "Clément Turpin",
  "Slavko Vinčić", "István Kovács", "Szymon Marciniak", "Michael Oliver",
];
export function refereeFor(fixtureId: string): { name: string; strictness: number } {
  const rng = mulberry(hashStr("ref:" + fixtureId));
  return { name: pick(rng, REFEREES), strictness: Math.round(rng() * 50 + 50) }; // 50-100
}

// ---------- Weather ----------
const WEATHERS = [
  { label: "Soleado", icon: "☀️", temp: [22, 32] },
  { label: "Nublado", icon: "☁️", temp: [12, 22] },
  { label: "Lluvia ligera", icon: "🌦️", temp: [10, 18] },
  { label: "Lluvia intensa", icon: "🌧️", temp: [8, 16] },
  { label: "Despejado", icon: "🌤️", temp: [18, 28] },
  { label: "Viento fuerte", icon: "💨", temp: [10, 20] },
  { label: "Niebla", icon: "🌫️", temp: [6, 14] },
  { label: "Tormenta", icon: "⛈️", temp: [12, 22] },
] as const;
export function weatherFor(fixtureId: string) {
  const rng = mulberry(hashStr("wx:" + fixtureId));
  const w = pick(rng, WEATHERS);
  const t = Math.round(w.temp[0] + rng() * (w.temp[1] - w.temp[0]));
  return { label: w.label, icon: w.icon, temp: t };
}

// ---------- Position history ----------
const POS_KEY = "modo-carrera:pos-history";
type PosHistory = Record<string, { matchday: number; pos: number }[]>;

function readHist(): PosHistory {
  if (typeof localStorage === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(POS_KEY) || "{}"); } catch { return {}; }
}
function writeHist(h: PosHistory) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(h)); } catch {}
}
export function trackPosition(league: string, teamId: string, matchday: number, pos: number) {
  const h = readHist();
  const key = `${league}:${teamId}`;
  const arr = h[key] || [];
  const last = arr[arr.length - 1];
  if (!last || last.matchday !== matchday) {
    arr.push({ matchday, pos });
    if (arr.length > 12) arr.shift();
    h[key] = arr;
    writeHist(h);
  }
  return arr;
}
export function getPositionHistory(league: string, teamId: string) {
  const h = readHist();
  return h[`${league}:${teamId}`] || [];
}
export function getTrend(history: { matchday: number; pos: number }[]): { delta: number } {
  if (history.length < 2) return { delta: 0 };
  const a = history[history.length - 1].pos;
  const b = history[history.length - 2].pos;
  return { delta: b - a }; // positive = subió (mejor posición)
}

// ---------- News ----------
export type NewsItem = { id: string; cat: "club" | "liga" | "mercado"; title: string; text: string; icon: string };

const CLUB_NEWS = [
  (t: string) => ({ title: `Entrenamiento intenso en ${t}`, text: "El cuerpo técnico ha redoblado el trabajo físico esta semana." }),
  (t: string) => ({ title: `La afición de ${t} llena el estadio`, text: "Récord de abonados para el próximo partido." }),
  (t: string) => ({ title: `Reunión de capitanes en ${t}`, text: "Los líderes del vestuario piden unidad para la racha." }),
  (t: string) => ({ title: `${t} prepara una sorpresa táctica`, text: "Trabajan variantes de presión alta de cara al rival." }),
];
const LIGA_NEWS = [
  () => ({ title: "Jornada cargada de duelos directos", text: "Varios cruces entre rivales por puestos europeos." }),
  () => ({ title: "El VAR vuelve a ser protagonista", text: "Decisiones polémicas marcan la jornada anterior." }),
  () => ({ title: "Repunte goleador en la liga", text: "Media histórica de goles por partido en este tramo." }),
  () => ({ title: "El liderato cambia de manos", text: "El nuevo líder amplía distancia con sus perseguidores." }),
];
const MERCADO_NEWS = [
  () => ({ title: "Rumores de fichaje invernal", text: "Varios clubes sondean a cracks emergentes." }),
  () => ({ title: "Renovación cerca para una estrella", text: "Su agente y el club avanzan posiciones." }),
  () => ({ title: "Oferta sorpresa desde Arabia", text: "Un club saudí estaría dispuesto a romper el mercado." }),
  () => ({ title: "Cláusula activada por un grande europeo", text: "Movimiento bomba en las próximas horas." }),
];

export function buildNews(teamName: string, seed: string): NewsItem[] {
  const rng = mulberry(hashStr("news:" + seed));
  const club = CLUB_NEWS[Math.floor(rng() * CLUB_NEWS.length)](teamName);
  const liga = LIGA_NEWS[Math.floor(rng() * LIGA_NEWS.length)]();
  const merc = MERCADO_NEWS[Math.floor(rng() * MERCADO_NEWS.length)]();
  return [
    { id: "c", cat: "club", icon: "🏟️", ...club },
    { id: "l", cat: "liga", icon: "📰", ...liga },
    { id: "m", cat: "mercado", icon: "💼", ...merc },
  ];
}

// ---------- Theme ----------
export type CentralTheme = {
  id: "default" | "ucl" | "cup";
  label: string;
  ring: string;
  accent: string;
  badge: string;
  bgOverlay: string;
  cardBorder: string;
  primaryBtn: string;
};

export const THEMES: Record<CentralTheme["id"], CentralTheme> = {
  default: {
    id: "default", label: "Liga",
    ring: "ring-primary/30", accent: "text-primary",
    badge: "bg-primary/15 text-primary border-primary/40",
    bgOverlay: "",
    cardBorder: "border-border/60",
    primaryBtn: "bg-primary text-primary-foreground",
  },
  ucl: {
    id: "ucl", label: "Champions League",
    ring: "ring-blue-400/40",
    accent: "text-blue-300",
    badge: "bg-blue-500/15 text-blue-200 border-blue-400/40",
    bgOverlay:
      "bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.18),_transparent_60%)]",
    cardBorder: "border-blue-500/30",
    primaryBtn: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white",
  },
  cup: {
    id: "cup", label: "Copa",
    ring: "ring-amber-400/40",
    accent: "text-amber-300",
    badge: "bg-amber-500/15 text-amber-200 border-amber-400/40",
    bgOverlay:
      "bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.18),_transparent_60%)]",
    cardBorder: "border-amber-500/30",
    primaryBtn: "bg-gradient-to-r from-amber-500 to-orange-600 text-white",
  },
};

export function themeForFixture(f: Fixture | null | undefined): CentralTheme {
  if (!f) return THEMES.default;
  if (f.competition === "ucl") return THEMES.ucl;
  if (f.competition === "cup") return THEMES.cup;
  return THEMES.default;
}

import { getCurrentSaveId } from "@/lib/savedGames";
import { addDaysToIso } from "@/lib/transferWindows";
import { getAllTeams, LEAGUES } from "@/data/teams";
import { getScoutCostForSeed, type ScoutCandidate, type ScoutRating } from "@/lib/transfers/Scouting";
import { ACADEMY_GROWTH_PROFILES, ACADEMY_SECONDARY_POSITION_COMPATIBILITY } from "@/lib/academy/academyConstants";
import { academyCountryKey, academyCountryLabel, getAcademyNamePool } from "@/lib/academy/academyNames";
import type { AcademyGrowthProfile, AcademyTrait } from "@/lib/academy/academyTypes";
import type { PlayerAttributeRatings } from "@/types/playerStats";
import { ALL_POS_CODES, type PosCode } from "@/lib/positions";

const STORAGE_PREFIX = "fcsim:youth-scouting:v1:";

export type YouthScoutCandidate = ScoutCandidate;
export type HiredYouthScout = YouthScoutCandidate & { hiredAt: string };

export type YouthProspect = {
  id: string;
  name: string;
  nation: string;
  birthdate: string;
  age: number;
  positions: PosCode[];
  ovr: number;
  /** Potencial real; se conserva oculto en el informe y se usa al ficharlo. */
  potential: number;
  potentialEstimate: { min: number; max: number };
  attributes: PlayerAttributeRatings;
  traits: AcademyTrait[];
  growthProfile: AcademyGrowthProfile;
  joinedSeason: number;
  contractYearsLeft: number;
  price: number;
  /** Club real cuya cantera ha detectado al jugador. */
  sourceClubId?: string;
  sourceClubName?: string;
  sourceLeagueId?: string;
  sourceLeagueName?: string;
  signedAt?: string;
  academyPlayerId?: number;
};

export type YouthScoutReport = {
  id: string;
  month: string;
  scoutId: string;
  scoutName: string;
  scoutRating: ScoutRating;
  country: string;
  positions: PosCode[];
  startedAt: string;
  readyAt: string;
  status: "pending" | "completed";
  candidates: YouthProspect[];
};

export type YouthScoutingState = {
  catalogMonth: string;
  catalog: YouthScoutCandidate[];
  hiredScouts: HiredYouthScout[];
  dismissedScoutIds: string[];
  country: string;
  positions: PosCode[];
  reports: YouthScoutReport[];
};

const EMPTY_STATE: YouthScoutingState = {
  catalogMonth: "",
  catalog: [],
  hiredScouts: [],
  dismissedScoutIds: [],
  country: "",
  positions: [],
  reports: [],
};

function storageKey(): string | null {
  const saveId = getCurrentSaveId();
  return saveId ? `${STORAGE_PREFIX}${saveId}` : null;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: string): number {
  let value = hashString(seed) || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 1_000_000) / 1_000_000;
}

function seededInt(seed: string, min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(min + seededUnit(seed) * (max - min + 1));
}

function seededPick<T>(items: readonly T[], seed: string): T {
  return items[seededInt(seed, 0, Math.max(0, items.length - 1))];
}

function readState(): YouthScoutingState {
  if (typeof window === "undefined") return { ...EMPTY_STATE };
  const key = storageKey();
  if (!key) return { ...EMPTY_STATE };
  try {
    const raw = JSON.parse(window.localStorage.getItem(key) || "null") as (Partial<YouthScoutingState> & { hiredScout?: HiredYouthScout | null }) | null;
    if (!raw || typeof raw !== "object") return { ...EMPTY_STATE };
    return {
      catalogMonth: typeof raw.catalogMonth === "string" ? raw.catalogMonth : "",
      catalog: Array.isArray(raw.catalog) ? raw.catalog.filter(isScoutCandidate) : [],
      hiredScouts: Array.isArray(raw.hiredScouts)
        ? raw.hiredScouts.filter(isScoutCandidate).slice(0, 3).map((scout) => ({ ...scout, hiredAt: typeof (scout as HiredYouthScout).hiredAt === "string" ? (scout as HiredYouthScout).hiredAt : "" }))
        : raw.hiredScout && isScoutCandidate(raw.hiredScout) ? [{ ...raw.hiredScout, hiredAt: typeof raw.hiredScout.hiredAt === "string" ? raw.hiredScout.hiredAt : "" }] : [],
      dismissedScoutIds: Array.isArray(raw.dismissedScoutIds)
        ? raw.dismissedScoutIds.filter((id): id is string => typeof id === "string")
        : [],
      country: typeof raw.country === "string" ? raw.country : "",
      positions: Array.isArray(raw.positions)
        ? raw.positions.filter((position): position is PosCode => typeof position === "string" && ALL_POS_CODES.includes(position as PosCode)).slice(0, 3)
        : [],
      reports: Array.isArray(raw.reports)
        ? raw.reports.filter(isYouthReport).map(normalizeStoredReport).slice(-60)
        : [],
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

function isScoutCandidate(value: unknown): value is YouthScoutCandidate {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<YouthScoutCandidate>;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.country === "string"
    && typeof item.cost === "number" && typeof item.photoUrl === "string" && typeof item.catalogMonth === "string"
    && typeof item.rating === "number" && [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].includes(item.rating);
}

function isYouthReport(value: unknown): value is YouthScoutReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<YouthScoutReport>;
  return typeof report.id === "string" && typeof report.month === "string" && typeof report.scoutId === "string"
    && typeof report.scoutName === "string" && typeof report.country === "string" && Array.isArray(report.candidates);
}

function normalizeStoredReport(report: YouthScoutReport): YouthScoutReport {
  // Informes creados antes del plazo de 30 días: conservarlos como completados.
  const legacyStart = `${report.month}-01`;
  const startedAt = typeof report.startedAt === "string" && report.startedAt ? report.startedAt : legacyStart;
  const readyAt = typeof report.readyAt === "string" && report.readyAt ? report.readyAt : startedAt;
  const status = report.status === "pending" || report.status === "completed"
    ? report.status
    : "completed";
  return { ...report, startedAt, readyAt, status };
}

function writeState(state: YouthScoutingState): void {
  if (typeof window === "undefined") return;
  const key = storageKey();
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // No se bloquea la carrera si localStorage no está disponible.
  }
}

/** Perfiles propios del equipo de ojeadores de cantera; no reutilizan las personas del catálogo estándar. */
const YOUTH_SCOUT_POOL: ReadonlyArray<{ name: string; country: string }> = [
  { name: "Ander Etxeberria", country: "España" },
  { name: "Mateo Ríos", country: "Uruguay" },
  { name: "Gaël Fontaine", country: "Francia" },
  { name: "Samuel Okafor", country: "Nigeria" },
  { name: "Youssef El Amrani", country: "Marruecos" },
  { name: "Kenji Nakamura", country: "Japón" },
  { name: "João Figueiredo", country: "Portugal" },
  { name: "Tomás Villalba", country: "Argentina" },
  { name: "Santiago Londoño", country: "Colombia" },
  { name: "Bastien Roche", country: "Francia" },
  { name: "Emil Jørgensen", country: "Dinamarca" },
  { name: "Luka Marinović", country: "Croacia" },
  { name: "Diego Santillán", country: "Chile" },
  { name: "Rafael Nascimento", country: "Brasil" },
  { name: "Nils Bergström", country: "Suecia" },
  { name: "Kwame Mensah", country: "Ghana" },
  { name: "Ali Demir", country: "Turquía" },
  { name: "Aminata Diop", country: "Senegal" },
];

const YOUTH_SCOUT_RATING_WEIGHTS: ReadonlyArray<readonly [ScoutRating, number]> = [
  [1, 7], [1.5, 11], [2, 16], [2.5, 19], [3, 19], [3.5, 14], [4, 8], [4.5, 4], [5, 2],
];

function youthScoutRating(seed: string): ScoutRating {
  const roll = seededUnit(seed) * YOUTH_SCOUT_RATING_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let cumulative = 0;
  for (const [rating, weight] of YOUTH_SCOUT_RATING_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return rating;
  }
  return 3;
}

function buildYouthScoutCandidate(
  currentDate: string,
  index: number,
  usedNames: Set<string> = new Set<string>(),
  fixedRating?: ScoutRating,
): YouthScoutCandidate {
  const month = currentDate.slice(0, 7);
  const saveId = getCurrentSaveId() ?? "default";
  const seed = `${saveId}:${month}:youth-scout:${index}`;
  const available = YOUTH_SCOUT_POOL.filter((person) => !usedNames.has(person.name));
  const person = seededPick(available.length ? available : YOUTH_SCOUT_POOL, `${seed}:person`);
  usedNames.add(person.name);
  const rating = fixedRating ?? youthScoutRating(`${seed}:rating`);
  const standardReferenceCost = getScoutCostForSeed(`${seed}:standard-equivalent-price`, rating);
  // Mismo tramo de precio que un ojeador estándar de esa calidad, exactamente a mitad de coste.
  const cost = standardReferenceCost / 2;
  return {
    id: `academy-scout-${month}-${index}-${hashString(`${seed}:${person.name}`).toString(36)}`,
    name: person.name,
    country: person.country,
    rating,
    cost,
    photoUrl: `/scout-avatars/scout-avatar-${(index % 5) + 1}.png`,
    catalogMonth: month,
  };
}

function buildCatalog(currentDate: string): YouthScoutCandidate[] {
  const usedNames = new Set<string>();
  return Array.from({ length: 3 }, (_, index) => buildYouthScoutCandidate(currentDate, index, usedNames));
}

function candidateCount(rating: ScoutRating): number {
  if (rating <= 1.5) return 5;
  if (rating <= 2.5) return 6;
  if (rating <= 3.5) return 7;
  return 8;
}

function attributesFor(position: PosCode, ovr: number, seed: string): PlayerAttributeRatings {
  const spread = (field: string) => seededInt(`${seed}:${field}`, -6, 7);
  const attributes: PlayerAttributeRatings = {
    PAC: Math.max(25, Math.min(90, ovr - 4 + spread("pac"))),
    SHO: Math.max(20, Math.min(90, ovr - 3 + spread("sho"))),
    PAS: Math.max(25, Math.min(90, ovr - 2 + spread("pas"))),
    DRI: Math.max(25, Math.min(90, ovr - 2 + spread("dri"))),
    DEF: Math.max(20, Math.min(90, ovr - 2 + spread("def"))),
    PHY: Math.max(25, Math.min(90, ovr - 1 + spread("phy"))),
  };
  if (position === "GK") {
    return {
      PAC: 35,
      SHO: 15,
      PAS: Math.max(25, Math.min(85, ovr + spread("gk-pas"))),
      DRI: 25,
      DEF: Math.max(25, Math.min(90, ovr + 5 + spread("gk-def"))),
      PHY: Math.max(25, Math.min(90, ovr + spread("gk-phy"))),
    };
  }
  if (["DFC", "LD", "LI"].includes(position)) {
    attributes.DEF = Math.max(30, Math.min(94, ovr + 5 + spread("def-special")));
    attributes.PHY = Math.max(30, Math.min(92, ovr + 2 + spread("phy-special")));
  }
  if (["DC", "ED", "EI"].includes(position)) {
    attributes.SHO = Math.max(30, Math.min(95, ovr + 5 + spread("sho-special")));
    attributes.DRI = Math.max(30, Math.min(95, ovr + 4 + spread("dri-special")));
  }
  if (["MCD", "MC", "MCO", "MD", "MI"].includes(position)) {
    attributes.PAS = Math.max(30, Math.min(94, ovr + 5 + spread("pas-special")));
    attributes.DRI = Math.max(30, Math.min(92, ovr + 2 + spread("dri-mid")));
  }
  return attributes;
}

function askingPrice(ovr: number, potential: number, age: number, traits: AcademyTrait[], growthProfile: AcademyGrowthProfile, position: PosCode): number {
  // La ficha de incorporación refleja media, potencial y margen de crecimiento;
  // ser más joven y tener rasgos poco comunes aumenta el coste.
  const base = ovr * ovr * 100 + potential * potential * 90 + Math.max(0, potential - ovr) * 18_000;
  const ageMultiplier = 1 + (18 - age) * 0.055;
  const traitMultiplier = (traits.includes("diamond") ? 1.12 : 1) * (traits.includes("hard-worker") ? 1.035 : 1);
  const growthMultiplier = growthProfile === "late" ? 1.06 : growthProfile === "early" ? 1.025 : 1;
  const positionMultiplier = position === "DC" ? 1.04 : position === "GK" ? 0.98 : 1;
  const raw = base * ageMultiplier * traitMultiplier * growthMultiplier * positionMultiplier;
  return Math.max(50_000, Math.round(raw / 25_000) * 25_000);
}

function normalizeCountryName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES");
}

function sourceClubForCountry(country: string, seed: string): { id: string; name: string; leagueId: string; leagueName: string } {
  const teams = getAllTeams({ teamLeagueOverrides: {} });
  const normalizedCountry = normalizeCountryName(academyCountryLabel(country));
  const nationalAcademies = teams.filter((team) => {
    const leagueCountry = LEAGUES[String(team.league)]?.country;
    return leagueCountry && normalizeCountryName(leagueCountry) === normalizedCountry;
  });
  // Si el país no tiene una liga cargada en esta base de datos, el ojeador
  // puede detectar un jugador de esa nacionalidad en la cantera de un club
  // real extranjero (por ejemplo, una promesa brasileña en el Bayern).
  const pool = nationalAcademies.length ? nationalAcademies : teams;
  const team = seededPick(pool, `${seed}:source-club`);
  return {
    id: team.id,
    name: team.name,
    leagueId: String(team.league),
    leagueName: LEAGUES[String(team.league)]?.name ?? String(team.league),
  };
}

function makeProspect(
  periodStart: string,
  saveId: string,
  scout: HiredYouthScout,
  country: string,
  wantedPositions: PosCode[],
  index: number,
  usedNames: Set<string>,
): YouthProspect {
  const seed = `${saveId}:${periodStart}:${scout.id}:${country}:${wantedPositions.join(",")}:${index}`;
  const pool = getAcademyNamePool(country);
  let name = "";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const first = seededPick(pool.first, `${seed}:first:${attempt}`);
    const last = seededPick(pool.last, `${seed}:last:${attempt}`);
    const candidateName = `${first} ${last}`;
    if (!usedNames.has(candidateName)) {
      name = candidateName;
      usedNames.add(name);
      break;
    }
  }
  if (!name) name = `${seededPick(pool.first, seed)} ${seededPick(pool.last, `${seed}:last`)} ${index + 1}`;

  const quality = scout.rating / 5;
  const age = seededInt(`${seed}:age`, 15, 18);
  const primary = seededPick(wantedPositions, `${seed}:position`) ?? "MC";
  const compatible = ACADEMY_SECONDARY_POSITION_COMPATIBILITY[primary].filter((position) => wantedPositions.includes(position as PosCode)) as PosCode[];
  const positions: PosCode[] = [primary];
  if (compatible.length > 0 && seededUnit(`${seed}:secondary`) < 0.24) {
    const secondary = seededPick(compatible, `${seed}:secondary-position`);
    if (secondary && secondary !== primary) positions.push(secondary);
  }

  const ovrRoll = seededUnit(`${seed}:ovr`);
  const ovr = Math.max(38, Math.min(68, 38 + Math.round(Math.pow(ovrRoll, 0.68) * (19 + quality * 8)) + Math.round(quality * 3)));
  const elitePotentialChance = 0.025 + quality * 0.20;
  const rolledPotential = seededUnit(`${seed}:elite`) < elitePotentialChance
    ? Math.min(99, 82 + seededInt(`${seed}:elite-potential`, 0, 13 + Math.round(quality * 4)))
    : Math.max(55, Math.min(88, 55 + Math.round(Math.pow(seededUnit(`${seed}:potential`), 0.72) * (23 + quality * 6)) + Math.round(quality * 3)));
  const potential = Math.max(ovr, rolledPotential);

  const selectedTraits: AcademyTrait[] = [];
  if (potential >= 85 && seededUnit(`${seed}:diamond`) < 0.12 + quality * 0.20) selectedTraits.push("diamond");
  if (seededUnit(`${seed}:worker`) < 0.28) selectedTraits.push("hard-worker");
  if (seededUnit(`${seed}:late`) < 0.13) selectedTraits.push("late-bloomer");
  if (seededUnit(`${seed}:early`) < 0.10) selectedTraits.push("early");
  const traits = (selectedTraits.length ? selectedTraits : ["hard-worker"]).slice(0, 2) as AcademyTrait[];
  const growthProfile = seededPick(ACADEMY_GROWTH_PROFILES, `${seed}:growth`) ?? "normal";
  const year = Number(periodStart.slice(0, 4)) || 2026;
  const birthYear = year - age;
  const birthMonth = seededInt(`${seed}:birth-month`, 1, 12);
  const birthDay = seededInt(`${seed}:birth-day`, 1, 28);
  const birthdate = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;
  const estimateWidth = Math.max(3, Math.round(15 - scout.rating * 2.2));
  const potentialEstimate = {
    min: Math.max(ovr, potential - estimateWidth),
    max: Math.min(99, potential + Math.round(estimateWidth * 0.55)),
  };
  const id = `prospect-${periodStart}-${hashString(seed).toString(36)}`;
  const playerTraits = traits as AcademyTrait[];
  const sourceClub = sourceClubForCountry(country, seed);
  return {
    id,
    name,
    nation: academyCountryLabel(country),
    birthdate,
    age,
    positions,
    ovr,
    potential,
    potentialEstimate,
    attributes: attributesFor(primary, ovr, seed),
    traits: playerTraits,
    growthProfile,
    joinedSeason: year,
    contractYearsLeft: 2,
    price: askingPrice(ovr, potential, age, playerTraits, growthProfile, primary),
    sourceClubId: sourceClub.id,
    sourceClubName: sourceClub.name,
    sourceLeagueId: sourceClub.leagueId,
    sourceLeagueName: sourceClub.leagueName,
  };
}

function generateReport(
  startedAt: string,
  saveId: string,
  scout: HiredYouthScout,
  country: string,
  positions: PosCode[],
): YouthScoutReport {
  const normalizedStart = startedAt.slice(0, 10);
  const readyAt = addDaysToIso(normalizedStart, 30);
  const month = readyAt.slice(0, 7);
  const usedNames = new Set<string>();
  const candidates = Array.from({ length: candidateCount(scout.rating) }, (_, index) =>
    makeProspect(normalizedStart, saveId, scout, country, positions, index, usedNames),
  );
  return {
    id: `${scout.id}:${normalizedStart}`,
    month,
    scoutId: scout.id,
    scoutName: scout.name,
    scoutRating: scout.rating,
    country,
    positions: [...positions],
    startedAt: normalizedStart,
    readyAt,
    status: "pending",
    candidates,
  };
}

function compareReports(a: YouthScoutReport, b: YouthScoutReport): number {
  return a.startedAt.localeCompare(b.startedAt);
}

/**
 * Mantiene informes cada 30 días. La lista de candidatos queda oculta mientras
 * el informe esté pendiente y solo se revela cuando el calendario alcanza readyAt.
 */
function ensureState(currentDate: string): YouthScoutingState {
  const today = currentDate.slice(0, 10);
  const month = today.slice(0, 7);
  const state = readState();
  let next: YouthScoutingState = state;
  let changed = false;

  if (state.catalogMonth !== month || state.catalog.length !== 3 || state.catalog.some((scout) => !scout.id.startsWith("academy-scout-"))) {
    next = { ...next, catalogMonth: month, catalog: buildCatalog(currentDate) };
    changed = true;
  }

  if (next.hiredScouts.some((scout) => scout.id.startsWith("youth-scout-"))) {
    const usedNames = new Set(next.catalog.map((scout) => scout.name));
    const migrated = next.hiredScouts.map((legacyScout, index) => {
      if (!legacyScout.id.startsWith("youth-scout-")) return legacyScout;
      const replacement = buildYouthScoutCandidate(currentDate, index + 3, usedNames, legacyScout.rating);
      return { ...replacement, hiredAt: legacyScout.hiredAt, cost: legacyScout.cost };
    });
    next = { ...next, hiredScouts: migrated };
    changed = true;
  }

  let reports = next.reports.map((report) => {
    if (report.status === "pending" && today >= report.readyAt) {
      changed = true;
      return { ...report, status: "completed" as const };
    }
    return report;
  });



  next = { ...next, reports };
  if (changed) writeState(next);
  return next;
}

export function getYouthScoutingState(currentDate: string): YouthScoutingState {
  return ensureState(currentDate);
}

export function hireYouthScout(scoutId: string, currentDate: string): { ok: true; scout: HiredYouthScout } | { ok: false; reason: string } {
  const state = ensureState(currentDate);
  if (state.hiredScouts.length >= 3) return { ok: false, reason: "Ya tienes contratados los 3 ojeadores de cantera permitidos." };
  if (state.dismissedScoutIds.includes(scoutId)) return { ok: false, reason: "Este ojeador fue despedido y ya no se puede volver a contratar." };
  const candidate = state.catalog.find((scout) => scout.id === scoutId);
  if (!candidate) return { ok: false, reason: "Ese ojeador ya no está disponible en el catálogo." };
  if (state.hiredScouts.some((item) => item.id === scoutId)) return { ok: false, reason: "Este ojeador ya está contratado." };
  const scout: HiredYouthScout = { ...candidate, hiredAt: currentDate };
  writeState({ ...state, hiredScouts: [...state.hiredScouts, scout] });
  return { ok: true, scout };
}

export function releaseYouthScout(scoutId?: string): void {
  const state = readState();
  writeState({ ...state, hiredScouts: scoutId ? state.hiredScouts.filter((scout) => scout.id !== scoutId) : [] });
}

export function dismissYouthScout(scoutId?: string): HiredYouthScout | null {
  const state = readState();
  const scout = state.hiredScouts.find((item) => item.id === scoutId) ?? (scoutId ? null : state.hiredScouts[0]);
  if (!scout) return null;
  const dismissedScoutIds = state.dismissedScoutIds.includes(scout.id) ? state.dismissedScoutIds : [...state.dismissedScoutIds, scout.id];
  writeState({ ...state, hiredScouts: state.hiredScouts.filter((item) => item.id !== scout.id), dismissedScoutIds });
  return scout;
}

export function deleteYouthScoutReport(reportId: string): boolean {
  const state = readState();
  const reports = state.reports.filter((report) => report.id !== reportId);
  if (reports.length === state.reports.length) return false;
  writeState({ ...state, reports });
  return true;
}

export function saveYouthScoutingSearch(currentDate: string, country: string, positions: PosCode[], scoutId?: string): { ok: true; generatedReport: boolean } | { ok: false; reason: string } {
  const state = ensureState(currentDate);
  const scout = state.hiredScouts.find((item) => item.id === scoutId) ?? (scoutId ? undefined : state.hiredScouts[0]);
  if (!scout) return { ok: false, reason: "Contrata primero un ojeador de canteras." };
  const normalizedCountry = academyCountryKey(country.trim());
  const validPositions = Array.from(new Set(positions.filter((position) => ALL_POS_CODES.includes(position))));
  if (!normalizedCountry) return { ok: false, reason: "Selecciona un país para la búsqueda." };
  if (validPositions.length === 0) return { ok: false, reason: "Selecciona al menos una posición." };
  if (validPositions.length > 3) return { ok: false, reason: "Solo puedes buscar un máximo de 3 posiciones a la vez." };
  const saveId = getCurrentSaveId();
  if (!saveId) return { ok: false, reason: "No hay una partida activa para iniciar la búsqueda." };
  const today = currentDate.slice(0, 10);
  if (state.reports.some((report) => report.scoutId === scout.id && report.status === "pending")) return { ok: false, reason: "Este ojeador ya tiene una búsqueda en curso." };
  const report = generateReport(today, saveId, scout, normalizedCountry, validPositions);
  writeState({ ...state, reports: [...state.reports, report].slice(-60) });
  return { ok: true, generatedReport: true };
}

export function markYouthProspectSigned(prospectId: string, currentDate: string, academyPlayerId: number): boolean {
  const state = ensureState(currentDate);
  let found = false;
  const reports = state.reports.map((report) => ({
    ...report,
    candidates: report.candidates.map((prospect) => {
      if (prospect.id !== prospectId) return prospect;
      found = true;
      return { ...prospect, signedAt: currentDate, academyPlayerId };
    }),
  }));
  if (found) writeState({ ...state, reports });
  return found;
}

export function isYouthProspectSigned(prospect: YouthProspect): boolean {
  return Boolean(prospect.signedAt || prospect.academyPlayerId);
}

export function daysInMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year || 2026, (monthNumber || 1) - 1, 1));
  return date.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
}

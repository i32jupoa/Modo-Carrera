import { teamById } from "@/data/teams";
import { getClubProfile } from "@/lib/transfers/ClubStrategy";
import { hashString, seededInt, seededPick, seededRange, seededUnit, clamp } from "@/lib/transfers/random";
import { buildPositions, type PosCode } from "@/lib/positions";
import { ACADEMY_FACILITIES, ACADEMY_GROWTH_PROFILES, ACADEMY_ID_BASE, ACADEMY_ID_SPAN, ACADEMY_LIMITS, ACADEMY_TRAITS } from "./academyConstants";
import { COUNTRY_NAMES, academyCountryKey, academyCountryLabel, getAcademyNamePool } from "./academyNames";
import type { AcademyGrowthProfile, AcademyPlayer, AcademyTrait, ClubAcademyState } from "./academyTypes";

const RESERVED_IDS = new Set<number>();

function seasonNumber(season: number | string): number {
  const n = Number(String(season).slice(0, 4));
  return Number.isFinite(n) ? n : 2026;
}

function ageFromBirthdate(birthdate: string, currentSeason: number): number {
  return Math.max(15, Math.min(21, currentSeason - Number(birthdate.slice(0, 4))));
}

function randomDate(seed: string, season: number, minAge: number, maxAge: number): { birthdate: string; age: number } {
  const age = seededInt(minAge, maxAge, seed, "age");
  const year = season - age;
  const month = seededInt(1, 12, seed, "birth-month");
  const day = seededInt(1, month === 2 ? 28 : 28 + (month % 2), seed, "birth-day");
  return { birthdate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, age };
}

function nameFor(country: string, seed: string, usedNames: Set<string>): string {
  const pool = getAcademyNamePool(country);
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const first = seededPick(pool.first, seed, "first", attempt) ?? pool.first[0];
    const last = seededPick(pool.last, seed, "last", attempt) ?? pool.last[0];
    const name = `${first} ${last}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  const fallback = `${pool.first[0]} ${pool.last[0]} ${seededInt(1, 999, seed, "fallback-name")}`;
  usedNames.add(fallback);
  return fallback;
}

function candidatePositions(seed: string): PosCode[] {
  const primary = seededPick(["GK", "CB", "LB", "RB", "CM", "CAM", "CDM", "LW", "RW", "ST", "CF"] as const, seed, "primary") ?? "CM";
  const alternatives = seededUnit(seed, "alt") < 0.35
    ? [seededPick(["CB", "LB", "RB", "CM", "CAM", "CDM", "LW", "RW", "ST", "CF"] as const, seed, "secondary") ?? "CM"]
    : [];
  return Array.from(new Set([primary, ...alternatives]));
}

function roleAttributes(positions: readonly PosCode[], ovr: number, seed: string) {
  const primary = positions[0];
  const spread = () => seededInt(-5, 7, seed, "spread", primary);
  const base = Math.max(30, ovr - 5);
  const attrs = {
    PAC: clamp(base + spread(), 25, 90),
    SHO: clamp(base + spread(), 25, 90),
    PAS: clamp(base + spread(), 25, 90),
    DRI: clamp(base + spread(), 25, 90),
    DEF: clamp(base + spread(), 20, 90),
    PHY: clamp(base + spread(), 25, 90),
  };
  if (primary === "GK") return { PAC: 40, SHO: 20, PAS: clamp(ovr + spread(), 25, 90), DRI: 35, DEF: clamp(ovr + 4 + spread(), 25, 92), PHY: clamp(ovr + spread(), 25, 92) };
  if (["CB", "LB", "RB"].includes(primary)) {
    attrs.DEF = clamp(ovr + 6 + spread(), 35, 94);
    attrs.PHY = clamp(ovr + 3 + spread(), 30, 92);
  }
  if (["ST", "CF", "LW", "RW"].includes(primary)) {
    attrs.SHO = clamp(ovr + 7 + spread(), 35, 95);
    attrs.DRI = clamp(ovr + 5 + spread(), 35, 95);
  }
  if (["CM", "CAM", "CDM"].includes(primary)) {
    attrs.PAS = clamp(ovr + 6 + spread(), 35, 94);
    attrs.DRI = clamp(ovr + 3 + spread(), 30, 92);
  }
  return attrs;
}

function uniqueAcademyId(saveId: string, teamId: string, season: number, index: number): number {
  const baseSeed = `${saveId}|${teamId}|${season}|${index}`;
  let offset = hashString(baseSeed) % ACADEMY_ID_SPAN;
  let id = ACADEMY_ID_BASE + offset;
  while (RESERVED_IDS.has(id)) {
    offset = (offset + 1) % ACADEMY_ID_SPAN;
    id = ACADEMY_ID_BASE + offset;
  }
  RESERVED_IDS.add(id);
  return id;
}

function potentialFor(seed: string, clubStrength: number, facility: 1 | 2 | 3 | 4 | 5): number {
  const roll = seededUnit(seed, "potential");
  const highChance = ACADEMY_LIMITS.highPotentialChance + clubStrength * 0.09 + (facility - 3) * 0.025;
  if (roll < Math.max(0.03, highChance)) return seededInt(82, ACADEMY_LIMITS.maxPotential, seed, "elite-potential");
  const low = ACADEMY_LIMITS.minPotential;
  const high = 81;
  const shaped = Math.pow(seededUnit(seed, "potential-shape"), 1.55);
  return Math.round(low + shaped * (high - low));
}

function growthProfile(seed: string, potential: number): AcademyGrowthProfile {
  const roll = seededUnit(seed, "growth-profile");
  if (potential >= 80 && roll < 0.18) return "late";
  if (roll < 0.16) return "early";
  if (roll < 0.28) return "stagnant";
  return "normal";
}

function traits(seed: string, potential: number): AcademyTrait[] {
  const out: AcademyTrait[] = [];
  if (potential >= 80 && seededUnit(seed, "trait-diamond") < 0.35) out.push("diamond");
  if (seededUnit(seed, "trait-early") < 0.18) out.push("early");
  if (seededUnit(seed, "trait-late") < 0.14) out.push("late-bloomer");
  if (seededUnit(seed, "trait-worker") < 0.28) out.push("hard-worker");
  if (seededUnit(seed, "trait-temp") < 0.08) out.push("temperamental");
  return out.length ? out.slice(0, 2) : ["hard-worker"];
}

export function generateAcademyState(saveId: string, teamId: string, season: number | string): ClubAcademyState {
  const numericSeason = seasonNumber(season);
  const team = teamById(teamId);
  const profile = getClubProfile(teamId);
  const facility = Math.max(1, Math.min(5, Math.round(3 + (profile.academyFocus - 0.5) * 2))) as 1 | 2 | 3 | 4 | 5;
  const targetSize = seededInt(ACADEMY_LIMITS.minPlayers, ACADEMY_LIMITS.maxPlayers, saveId, teamId, numericSeason, "size");
  const players: AcademyPlayer[] = [];
  const clubStrength = clamp((team.att + team.mid + team.def) / 300, 0, 1);
  const country = profile.country;
  const usedNames = new Set<string>();
  const availableCountries = Object.keys(COUNTRY_NAMES).filter((v) => v !== academyCountryKey(country));

  for (let i = 0; i < targetSize; i += 1) {
    const seed = `${saveId}|${teamId}|${numericSeason}|${i}`;
    const national = seededUnit(seed, "nation") >= ACADEMY_LIMITS.foreignNationChance;
    const nationKey = national ? academyCountryKey(country) : (seededPick(availableCountries, seed, "foreign") ?? academyCountryKey(country));
    const nation = academyCountryLabel(nationKey);
    const birth = randomDate(seed, numericSeason, 16, 20);
    const positions = candidatePositions(seed);
    const facilityBonus = ACADEMY_FACILITIES.ovrBonusByLevel[facility] ?? 0;
    const rawOvr = Math.round(seededRange(ACADEMY_LIMITS.minOvr, ACADEMY_LIMITS.maxOvr, seed, "ovr") + profile.academyFocus * 4 + facilityBonus + clubStrength * 3);
    const ovr = clamp(rawOvr, ACADEMY_LIMITS.minOvr, ACADEMY_LIMITS.maxOvr);
    const potential = potentialFor(seed, profile.academyFocus * 0.55 + clubStrength * 0.45, facility);
    const estimateWidth = Math.max(3, Math.round(10 - profile.academyFocus * 4));
    players.push({
      id: uniqueAcademyId(saveId, teamId, numericSeason, i),
      teamId,
      name: nameFor(nation, seed, usedNames),
      nation,
      birthdate: birth.birthdate,
      age: ageFromBirthdate(birth.birthdate, numericSeason),
      positions,
      ovr,
      potential,
      potentialEstimate: { min: Math.max(50, potential - estimateWidth), max: Math.min(90, potential + Math.round(estimateWidth / 2)) },
      attributes: roleAttributes(positions, ovr, seed),
      traits: traits(seed, potential),
      growthProfile: growthProfile(seed, potential),
      joinedSeason: numericSeason,
      contractYearsLeft: ACADEMY_LIMITS.baseContractYears,
      status: "academy",
      minutesThisSeason: 0,
      value: undefined,
    });
  }

  return {
    teamId,
    facilityLevel: facility,
    youthCoach: { specialty: seededPick(["GK", "DEF", "MID", "ATT"] as const, saveId, teamId, numericSeason, "coach") ?? "MID", level: 2 + (facility >= 4 ? 1 : 0) },
    players,
    // La plantilla base pertenece a la temporada actual; `manualPromotionAvailable`
    // controla de forma independiente si el botón de nueva promoción sigue disponible.
    lastIntakeSeason: numericSeason,
    manualPromotionAvailable: true,
    mentorAssignments: {},
    history: [],
    lastProgressionDate: `${numericSeason}-07-01`,
    updatedAt: new Date().toISOString(),
  };
}

export function generateAnnualIntake(saveId: string, state: ClubAcademyState, season: number | string): AcademyPlayer[] {
  const numericSeason = seasonNumber(season);
  const profile = getClubProfile(state.teamId);
  const facilityBonus = ACADEMY_FACILITIES.annualIntakeBonusByLevel[state.facilityLevel] ?? 0;
  const count = seededInt(ACADEMY_LIMITS.annualIntakeMin, ACADEMY_LIMITS.annualIntakeMax, saveId, state.teamId, numericSeason, "intake-count") + facilityBonus;
  const existing = new Set(state.players.map((p) => p.id));
  const baseSeed = state.players.length + 100;
  const team = teamById(state.teamId);
  const clubStrength = clamp((team.att + team.mid + team.def) / 300, 0, 1);
  const players: AcademyPlayer[] = [];
  const usedNames = new Set(state.players.map((p) => p.name));
  const homeCountry = academyCountryKey(profile.country);
  const availableCountries = Object.keys(COUNTRY_NAMES).filter((v) => v !== homeCountry);
  for (let i = 0; i < count && state.players.length + players.length < ACADEMY_LIMITS.maxPlayers; i += 1) {
    const seed = `${saveId}|${state.teamId}|${numericSeason}|${baseSeed + i}`;
    const birth = randomDate(seed, numericSeason, ACADEMY_LIMITS.intakeMinAge, ACADEMY_LIMITS.intakeMaxAge);
    const positions = candidatePositions(seed);
    const ovr = clamp(Math.round(seededRange(ACADEMY_LIMITS.minOvr, 55, seed, "ovr") + profile.academyFocus * 3 + clubStrength * 2), ACADEMY_LIMITS.minOvr, ACADEMY_LIMITS.maxOvr);
    const potential = potentialFor(seed, profile.academyFocus * 0.6 + clubStrength * 0.4, state.facilityLevel);
    const id = uniqueAcademyId(saveId, state.teamId, numericSeason, baseSeed + i);
    if (existing.has(id)) continue;
    const nationKey = seededUnit(seed, "nation") >= ACADEMY_LIMITS.foreignNationChance ? homeCountry : (seededPick(availableCountries, seed, "foreign") ?? homeCountry);
    const nation = academyCountryLabel(nationKey);
    players.push({
      id, teamId: state.teamId, name: nameFor(nation, seed, usedNames), nation,
      birthdate: birth.birthdate, age: birth.age, positions, ovr, potential,
      potentialEstimate: { min: Math.max(50, potential - 9), max: Math.min(90, potential + 5) },
      attributes: roleAttributes(positions, ovr, seed), traits: traits(seed, potential), growthProfile: growthProfile(seed, potential),
      joinedSeason: numericSeason, contractYearsLeft: ACADEMY_LIMITS.baseContractYears, status: "academy", minutesThisSeason: 0,
    });
  }
  return players;
}

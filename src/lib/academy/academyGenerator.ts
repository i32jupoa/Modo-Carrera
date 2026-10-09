import { teamById } from "@/data/teams";
import { getClubProfile } from "@/lib/transfers/ClubStrategy";
import { hashString, seededInt, seededPick, seededRange, seededUnit, clamp } from "@/lib/transfers/random";
import { type PosCode } from "@/lib/positions";
import {
  ACADEMY_FACILITIES,
  ACADEMY_GROWTH_PROFILES,
  ACADEMY_ID_BASE,
  ACADEMY_ID_SPAN,
  ACADEMY_LIMITS,
  ACADEMY_SECONDARY_POSITION_CHANCE,
  ACADEMY_SECONDARY_POSITION_COMPATIBILITY,
  ACADEMY_TARGET_POSITION_COUNTS,
  ACADEMY_TRAITS,
} from "./academyConstants";
import { COUNTRY_NAMES, academyCountryKey, academyCountryLabel, getAcademyNamePool } from "./academyNames";
import { createEmptyAcademySeasonStats } from "./academyTypes";
import type { AcademyGrowthProfile, AcademyPlayer, AcademyTrait, ClubAcademyState } from "./academyTypes";

const RESERVED_IDS = new Set<number>();
const ACADEMY_POSITION_ORDER = Object.keys(ACADEMY_TARGET_POSITION_COUNTS) as PosCode[];

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

/**
 * Escoge la posición que está más infrarepresentada respecto a la composición
 * objetivo. Los empates se resuelven de forma determinista.
 */
function mostDeficientPosition(currentCounts: Partial<Record<PosCode, number>>, seed: string, stage: string): PosCode {
  let bestRatio = Number.POSITIVE_INFINITY;
  let candidates: PosCode[] = [];
  for (const position of ACADEMY_POSITION_ORDER) {
    const target = ACADEMY_TARGET_POSITION_COUNTS[position];
    const current = currentCounts[position] ?? 0;
    const ratio = current / target;
    if (ratio < bestRatio - 0.0001) {
      bestRatio = ratio;
      candidates = [position];
    } else if (Math.abs(ratio - bestRatio) <= 0.0001) {
      candidates.push(position);
    }
  }
  return seededPick(candidates, seed, "deficit-tie", stage) ?? "MC";
}

function candidatePositions(
  seed: string,
  currentCounts: Partial<Record<PosCode, number>> = {},
  stage = "generation",
): PosCode[] {
  const primary = mostDeficientPosition(currentCounts, seed, stage);
  const compatible = ACADEMY_SECONDARY_POSITION_COMPATIBILITY[primary];
  if (compatible.length && seededUnit(seed, "alt") < ACADEMY_SECONDARY_POSITION_CHANCE) {
    const secondary = seededPick(compatible, seed, "secondary");
    if (secondary) return [primary, secondary as PosCode];
  }
  return [primary];
}

function incrementPositionCount(counts: Partial<Record<PosCode, number>>, position: PosCode): void {
  counts[position] = (counts[position] ?? 0) + 1;
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
  if (["DFC", "LD", "LI"].includes(primary)) {
    attrs.DEF = clamp(ovr + 6 + spread(), 35, 94);
    attrs.PHY = clamp(ovr + 3 + spread(), 30, 92);
  }
  if (["DC", "ED", "EI"].includes(primary)) {
    attrs.SHO = clamp(ovr + 7 + spread(), 35, 95);
    attrs.DRI = clamp(ovr + 5 + spread(), 35, 95);
  }
  if (["MCD", "MC", "MCO", "MD", "MI"].includes(primary)) {
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

function basePlayer(
  saveId: string,
  teamId: string,
  numericSeason: number,
  index: number,
  profile: ReturnType<typeof getClubProfile>,
  clubStrength: number,
  facility: 1 | 2 | 3 | 4 | 5,
  usedNames: Set<string>,
  currentCounts: Partial<Record<PosCode, number>>,
  intake: boolean,
): AcademyPlayer {
  const seed = `${saveId}|${teamId}|${numericSeason}|${index}|${intake ? "intake" : "initial"}`;
  const national = seededUnit(seed, "nation") >= ACADEMY_LIMITS.foreignNationChance;
  const homeCountry = academyCountryKey(profile.country);
  const availableCountries = Object.keys(COUNTRY_NAMES).filter((value) => value !== homeCountry);
  const nationKey = national ? homeCountry : (seededPick(availableCountries, seed, "foreign") ?? homeCountry);
  const nation = academyCountryLabel(nationKey);
  const birth = randomDate(seed, numericSeason, intake ? ACADEMY_LIMITS.intakeMinAge : 16, intake ? ACADEMY_LIMITS.intakeMaxAge : 20);
  const positions = candidatePositions(seed, currentCounts, intake ? "annual-intake" : "initial-squad");
  const facilityBonus = ACADEMY_FACILITIES.ovrBonusByLevel[facility] ?? 0;
  const ovrLow = intake ? ACADEMY_LIMITS.minOvr : ACADEMY_LIMITS.minOvr;
  const ovrHigh = intake ? 55 : ACADEMY_LIMITS.maxOvr;
  const clubBonus = intake ? clubStrength * 2 : clubStrength * 3;
  const focusBonus = intake ? profile.academyFocus * 3 : profile.academyFocus * 4;
  const rawOvr = Math.round(seededRange(ovrLow, ovrHigh, seed, "ovr") + focusBonus + (intake ? 0 : facilityBonus) + clubBonus);
  const ovr = clamp(rawOvr, ACADEMY_LIMITS.minOvr, ACADEMY_LIMITS.maxOvr);
  const potential = potentialFor(seed, profile.academyFocus * (intake ? 0.6 : 0.55) + clubStrength * (intake ? 0.4 : 0.45), facility);
  const estimateWidth = Math.max(3, Math.round(10 - profile.academyFocus * 4));
  const id = uniqueAcademyId(saveId, teamId, numericSeason, index);
  for (const position of positions) incrementPositionCount(currentCounts, position);
  return {
    id,
    teamId,
    name: nameFor(nation, seed, usedNames),
    nation,
    birthdate: birth.birthdate,
    age: ageFromBirthdate(birth.birthdate, numericSeason),
    positions,
    internalOvr: ovr,
    ovr,
    potential,
    potentialEstimate: {
      min: Math.max(50, potential - estimateWidth),
      max: Math.min(90, potential + Math.round(estimateWidth / 2)),
    },
    attributes: roleAttributes(positions, ovr, seed),
    traits: traits(seed, potential),
    growthProfile: growthProfile(seed, potential),
    joinedSeason: numericSeason,
    contractYearsLeft: ACADEMY_LIMITS.baseContractYears,
    status: "academy",
    minutesThisSeason: 0,
    academyStats: createEmptyAcademySeasonStats(numericSeason, ovr),
    academyCareerSeasons: [],
    value: undefined,
  };
}

export function generateAcademyState(saveId: string, teamId: string, season: number | string): ClubAcademyState {
  const numericSeason = seasonNumber(season);
  const team = teamById(teamId);
  const profile = getClubProfile(teamId);
  const facility = ACADEMY_FACILITIES.default;
  const targetSize = seededInt(ACADEMY_LIMITS.minPlayers, ACADEMY_LIMITS.maxPlayers, saveId, teamId, numericSeason, "size");
  const players: AcademyPlayer[] = [];
  const clubStrength = clamp((team.att + team.mid + team.def) / 300, 0, 1);
  const usedNames = new Set<string>();
  const positionCounts: Partial<Record<PosCode, number>> = {};

  for (let i = 0; i < targetSize; i += 1) {
    players.push(basePlayer(saveId, teamId, numericSeason, i, profile, clubStrength, facility, usedNames, positionCounts, false));
  }

  return {
    teamId,
    facilityLevel: facility,
    youthCoach: {
      specialty: seededPick(["GK", "DEF", "MID", "ATT"] as const, saveId, teamId, numericSeason, "coach") ?? "MID",
      level: 1,
    },
    players,
    lastIntakeSeason: numericSeason,
    manualPromotionAvailable: true,
    mentorAssignments: {},
    history: [],
    lastProgressionDate: `${numericSeason}-07-01`,
    lastAcademyMatchDate: `${numericSeason}-07-01`,
    updatedAt: new Date().toISOString(),
  };
}

export function generateAnnualIntake(saveId: string, state: ClubAcademyState, season: number | string): AcademyPlayer[] {
  const numericSeason = seasonNumber(season);
  const profile = getClubProfile(state.teamId);
  const facilityBonus = ACADEMY_FACILITIES.annualIntakeBonusByLevel[state.facilityLevel] ?? 0;
  const count = seededInt(
    ACADEMY_LIMITS.annualIntakeMin,
    ACADEMY_LIMITS.annualIntakeMax,
    saveId,
    state.teamId,
    numericSeason,
    "intake-count",
  ) + facilityBonus;
  const existing = new Set(state.players.map((player) => player.id));
  const baseSeed = state.players.length + 100;
  const team = teamById(state.teamId);
  const clubStrength = clamp((team.att + team.mid + team.def) / 300, 0, 1);
  const players: AcademyPlayer[] = [];
  const usedNames = new Set(state.players.map((player) => player.name));
  const positionCounts: Partial<Record<PosCode, number>> = {};
  for (const player of state.players) incrementPositionCount(positionCounts, player.positions[0] ?? "MC");

  for (let i = 0; i < count && state.players.length + players.length < ACADEMY_LIMITS.maxPlayers; i += 1) {
    const player = basePlayer(
      saveId,
      state.teamId,
      numericSeason,
      baseSeed + i,
      profile,
      clubStrength,
      state.facilityLevel,
      usedNames,
      positionCounts,
      true,
    );
    if (existing.has(player.id)) continue;
    players.push(player);
  }
  return players;
}

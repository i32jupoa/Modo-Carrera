import { Team, teamsByLeague } from "@/data/teams";
import { Player, getPlayerShootingStats } from "@/data/players";
import {
  buildMatchStats,
  computePlayerRatings,
  type MatchStats,
  type PlayerRating,
} from "@/lib/matchStats";
import { tacticsModifiers, type TeamTactics } from "@/lib/teamTactics";
import { type PosCode } from "@/lib/positions";
import { type FormationName } from "@/lib/formations";
import { drainPerMinute, fatigueInjuryRisk, staminaPerformanceMultiplier } from "@/lib/liveMatch";

export type { MatchStats, PlayerRating };

// Funciones auxiliares para determinar tipo de jugador basado en posiciones específicas
function isGoalkeeper(positions: PosCode[]): boolean {
  return positions.includes("GK");
}

function isDefensive(positions: PosCode[]): boolean {
  return positions.some((p) => ["DFC", "LD", "LI"].includes(p));
}

function isMidfield(positions: PosCode[]): boolean {
  return positions.some((p) => ["MCD", "MC", "MCO", "MD", "MI"].includes(p));
}

function isAttacking(positions: PosCode[]): boolean {
  return positions.some((p) => ["ED", "EI", "DC", "MCO"].includes(p));
}

/**
 * Tactics as configured by the manager in "Editar alineación / Tácticas".
 * The engine honours both the play style (which changes how many chances the
 * team creates and concedes) and the designated set-piece takers / captain.
 */
export type SimTactics = Partial<TeamTactics>;

function rand(): number {
  return Math.random();
}

function effectivePlayerRating(player: Player): number {
  return Number(player.rating) * staminaPerformanceMultiplier(player.energy ?? 100);
}

// Weighted scorer pick considering position and OVR for fast simulation
function penaltyTakerScore(player: Player): number {
  const stats = getPlayerShootingStats(player.id);
  const penalties = Number((player as any).penaltyRating ?? (player as any).penalties ?? stats.penalties ?? 0);
  return (penalties * 0.45) + (stats.finishing * 0.22) +
    (stats.shooting * 0.13) + (stats.composure * 0.10) +
    (stats.shotPower * 0.05) + (stats.volleys * 0.03) + (stats.longShots * 0.02);
}

function fastPickScorerWeighted(xi: Player[]): Player | undefined {
  const candidates = xi.filter((p) => !isGoalkeeper(p.positions));
  if (candidates.length === 0) return xi[0];

  // Weight = position factor * effective rating. Physical energy is the only
  // dynamic player condition used by the match engine; form is deliberately ignored.
  const weights = candidates.map((p) => {
    const posFactor = isAttacking(p.positions) ? 5 : isMidfield(p.positions) ? 2 : 0.5;
    const ratingFactor = effectivePlayerRating(p) / 70;
    return posFactor * ratingFactor;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// Fast assister pick with 75% probability, excluding scorer
function fastPickAssister(xi: Player[], scorerId: string): Player | null {
  if (rand() > 0.75) return null; // 75% of goals have an assist
  const candidates = xi.filter((p) => p.id !== scorerId && !isGoalkeeper(p.positions));
  if (candidates.length === 0) return null;

  // Weight toward midfielders and high-OVR players
  const weights = candidates.map((p) => {
    const posFactor = isMidfield(p.positions) ? 3 : isAttacking(p.positions) ? 2 : 1;
    const ratingFactor = effectivePlayerRating(p) / 70;
    return posFactor * ratingFactor;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function poisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}


// Calculate the dynamic average OVR of exactly 11 players on the pitch
export function calculateActiveOVR(activePlayers: Player[]): number {
  if (activePlayers.length === 0) return 70; // Fallback
  const sum = activePlayers.reduce((s, p) => s + effectivePlayerRating(p), 0);
  return sum / activePlayers.length;
}

// Calculate attack strength from XI (forwards and midfielders weighted)
function calculateAttackStrength(xi: Player[]): number {
  if (xi.length === 0) return 65;
  const forwards = xi.filter((p) => isAttacking(p.positions));
  const mids = xi.filter((p) => isMidfield(p.positions));
  const defenders = xi.filter((p) => isDefensive(p.positions));

  // Attack is heavily weighted by forwards (70%), midfielders (25%), defenders (5%)
  const overallAvg = calculateActiveOVR(xi);
  const fwdAvg =
    forwards.length > 0 ? forwards.reduce((s, p) => s + effectivePlayerRating(p), 0) / forwards.length : overallAvg;
  const midAvg =
    mids.length > 0 ? mids.reduce((s, p) => s + effectivePlayerRating(p), 0) / mids.length : overallAvg;
  const defAvg =
    defenders.length > 0 ? defenders.reduce((s, p) => s + effectivePlayerRating(p), 0) / defenders.length : overallAvg;

  return fwdAvg * 0.7 + midAvg * 0.25 + defAvg * 0.05;
}

// Calculate defense strength from XI (defenders and goalkeepers weighted)
function calculateDefenseStrength(xi: Player[]): number {
  if (xi.length === 0) return 65;
  const goalkeepers = xi.filter((p) => isGoalkeeper(p.positions));
  const defenders = xi.filter((p) => isDefensive(p.positions));
  const mids = xi.filter((p) => isMidfield(p.positions));

  // Defense is heavily weighted by defenders (60%), goalkeepers (25%), midfielders (15%)
  const overallAvg = calculateActiveOVR(xi);
  const gkAvg =
    goalkeepers.length > 0 ? goalkeepers.reduce((s, p) => s + effectivePlayerRating(p), 0) / goalkeepers.length : overallAvg;
  const defAvg =
    defenders.length > 0 ? defenders.reduce((s, p) => s + effectivePlayerRating(p), 0) / defenders.length : overallAvg;
  const midAvg =
    mids.length > 0 ? mids.reduce((s, p) => s + effectivePlayerRating(p), 0) / mids.length : overallAvg;

  return defAvg * 0.6 + gkAvg * 0.25 + midAvg * 0.15;
}

export function expectedGoals(
  home: Team,
  away: Team,
  homeXI: Player[] = [],
  awayXI: Player[] = [],
  homeTactics?: SimTactics | null,
  awayTactics?: SimTactics | null,
): { lh: number; la: number } {
  // El resultado de una liga debe depender de forma clara de la calidad de los
  // onces, pero sin convertir cada partido en una victoria automática del
  // favorito. La versión anterior daba demasiado peso a pequeñas diferencias
  // aleatorias de xG y eso podía permitir demasiados equipos inferiores arriba
  // de la clasificación después de pocas jornadas.
  const hMod = tacticsModifiers(homeTactics ?? null);
  const aMod = tacticsModifiers(awayTactics ?? null);

  const homeAttack = calculateAttackStrength(homeXI) || 65;
  const homeDefense = calculateDefenseStrength(homeXI) || 65;
  const awayAttack = calculateAttackStrength(awayXI) || 65;
  const awayDefense = calculateDefenseStrength(awayXI) || 65;

  // Fuerza de partido: el XI real es la señal principal, mientras que la media
  // dinámica del club actúa como estabilizador. Así un equipo de 86 no puede
  // convertirse en un 76 por una alineación CPU mala o por una formación poco
  // afortunada durante unas pocas jornadas.
  const homeXIOverall = calculateActiveOVR(homeXI);
  const awayXIOverall = calculateActiveOVR(awayXI);
  const homeListedOverall = (Number(home.att) + Number(home.mid) + Number(home.def)) / 3;
  const awayListedOverall = (Number(away.att) + Number(away.mid) + Number(away.def)) / 3;

  const homeStrength =
    homeXIOverall * 0.62 +
    homeListedOverall * 0.18 +
    homeAttack * 0.12 +
    homeDefense * 0.08;
  const awayStrength =
    awayXIOverall * 0.62 +
    awayListedOverall * 0.18 +
    awayAttack * 0.12 +
    awayDefense * 0.08;

  // Las tácticas modifican el rendimiento sin borrar la jerarquía de calidad.
  const homeTacticalStrength = homeStrength * ((hMod.attack + hMod.defense) / 2);
  const awayTacticalStrength = awayStrength * ((aMod.attack + aMod.defense) / 2);

  // Una diferencia de calidad debe notarse claramente tras varias jornadas:
  // equipos 5-10 puntos mejores generan bastante más xG, pero siguen existiendo
  // empates y sorpresas puntuales.
  const qualityDiff = Math.max(-28, Math.min(28, homeTacticalStrength - awayTacticalStrength));
  const HOME_MATCH_ADVANTAGE = 2.0;
  const effectiveDiff = qualityDiff + HOME_MATCH_ADVANTAGE;

  // Curva logística más marcada que antes. Esto reduce que plantillas muy
  // inferiores se mantengan sistemáticamente arriba por azar acumulado.
  const share = 0.5 + 0.32 * Math.tanh(effectiveDiff / 7.5);
  // Mantener un total de goles cercano al de un partido profesional evita que
  // los favoritos ganen por pura inflación de xG. La diferencia de calidad se
  // expresa principalmente en cómo se reparte ese total entre ambos equipos.
  const totalXg = 2.55;

  let lh = totalXg * share;
  let la = totalXg * (1 - share);

  // El estilo ofensivo/defensivo ya actúa arriba; aplicamos un pequeño ajuste
  // final para no perder por completo el efecto táctico.
  const styleGoalFactorHome = hMod.attack * 0.55 + hMod.defense * 0.45;
  const styleGoalFactorAway = aMod.attack * 0.55 + aMod.defense * 0.45;
  lh *= 1 + (styleGoalFactorHome - 1) * 0.35;
  la *= 1 + (styleGoalFactorAway - 1) * 0.35;

  // Un toque pequeño de variación por partido evita que el mismo emparejamiento
  // se repita siempre con el mismo xG, pero la aleatoriedad ya no domina el
  // resultado.
  lh *= 0.97 + rand() * 0.06;
  la *= 0.97 + rand() * 0.06;

  return {
    lh: Math.max(0.18, Math.min(3.25, lh)),
    la: Math.max(0.14, Math.min(2.95, la)),
  };
}

export type MatchEvent = {
  minute: number;
  team: "home" | "away";
  /**
   * `goal`          -> regular goal, credited to scorerId
   * `penalty_goal`  -> goal from the penalty spot, credited to scorerId
   * `free_kick_goal`-> direct free kick, credited to scorerId
   * `own_goal`      -> counts for `team` but scorerId belongs to the OTHER team
   *                    and must NOT be credited in the scorers table
   * `penalty`       -> shootout entry (playback only)
   */
  type: "goal" | "penalty_goal" | "free_kick_goal" | "own_goal" | "penalty";
  scorerId: string;
  scorerName: string;
  assistId?: string;
  assistName?: string;
  /**
   * Extra context shown in the chronicle, e.g. which rival player conceded the
   * penalty. Lets a penalty produce a SINGLE chronicle line instead of two.
   */
  detail?: string;
};

/** Non-scoring highlights: saves, woodwork, VAR, missed penalties, forced subs. */
export type HighlightType =
  | "save"
  | "woodwork"
  | "var_disallowed"
  | "penalty_missed"
  | "penalty_awarded"
  | "big_chance"
  | "injury"
  | "forced_sub";

export type HighlightEvent = {
  minute: number;
  team: "home" | "away";
  type: HighlightType;
  playerId: string;
  playerName: string;
  detail?: string;
};

export type CardEvent = {
  minute: number;
  team: "home" | "away";
  playerId: string;
  playerName: string;
  cardType: "yellow" | "red";
  isSecondYellow: boolean; // true if red card is due to second yellow
  reason?: string;
};

export type InjuryEvent = {
  team: "home" | "away";
  playerId: string;
  playerName: string;
  weeks: number;
  /** Exact calendar duration, capped at 180 days. */
  durationDays?: number;
  injuryType?: string;
  bodyPart?: string;
  diagnosis?: string;
  reason: string;
  /** Exact minute of the injury. */
  minute?: number;
  /** Player who came on for the injured one, when a sub was available. */
  replacementId?: string;
  replacementName?: string;
  forcedSub?: boolean;
};

export type SubstitutionEvent = {
  minute: number;
  team: "home" | "away";
  playerOutId: string;
  playerOutName: string;
  playerInId: string;
  playerInName: string;
};

export type SimResult = {
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  cards: CardEvent[];
  injuries: InjuryEvent[];
  xgHome: number;
  xgAway: number;
  highlights?: HighlightEvent[];
  stats?: MatchStats;
  ratings?: PlayerRating[];
  mvp?: PlayerRating | null;
  extraTime?: {
    homeGoals: number;
    awayGoals: number;
    events: MatchEvent[];
    highlights?: HighlightEvent[];
    substitutions?: SubstitutionEvent[];
  };
  penalties?: {
    homeGoals: number;
    awayGoals: number;
    shootout: Array<{ team: "home" | "away"; scored: boolean; playerId?: string }>;
  };
  homeLineup?: Player[];
  awayLineup?: Player[];
  /** Explicit starting XI, preserved even when substitutions occur. */
  homeStartingLineup?: Player[];
  awayStartingLineup?: Player[];
  /** Optional final XI at full time. */
  homeFinalLineup?: Player[];
  awayFinalLineup?: Player[];
  homeFormation?: FormationName;
  awayFormation?: FormationName;
  substitutions?: SubstitutionEvent[];
  /** Final physical energy by player id. */
  energyAtEnd?: Record<string, number>;
};

function pickScorer(xi: Player[]): Player {
  const candidates = xi.filter((p) => !isGoalkeeper(p.positions));
  const weights = candidates.map((p) => {
    const posBonus = isAttacking(p.positions) ? 5 : isMidfield(p.positions) ? 1.6 : 0.4;
    const ratingFactor = effectivePlayerRating(p) / 70;
    return Math.pow(ratingFactor, 2) * posBonus;
  });
  return weightedPick(candidates, weights);
}

function pickAssister(xi: Player[], scorerId: string): Player | null {
  if (rand() > 0.72) return null;
  const candidates = xi.filter((p) => p.id !== scorerId && !isGoalkeeper(p.positions));
  if (candidates.length === 0) return null;
  const weights = candidates.map((p) => {
    const posBonus = isMidfield(p.positions) ? 3 : isAttacking(p.positions) ? 2 : 1;
    return Math.pow(p.rating / 70, 2) * posBonus;
  });
  return weightedPick(candidates, weights);
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export type InjuryProfile = {
  type: string;
  area: string;
  diagnosis: string;
  /** Weight used when selecting a common injury profile. */
  weight: number;
};

export const INJURY_PROFILES: InjuryProfile[] = [
  { type: "Lesión muscular", area: "Muslo", diagnosis: "Contractura muscular", weight: 24 },
  { type: "Lesión muscular", area: "Isquiotibiales", diagnosis: "Sobrecarga muscular", weight: 18 },
  { type: "Esguince", area: "Tobillo", diagnosis: "Esguince leve de tobillo", weight: 17 },
  { type: "Contusión", area: "Rodilla", diagnosis: "Golpe durante el partido", weight: 13 },
  { type: "Lesión muscular", area: "Gemelo", diagnosis: "Rotura fibrilar", weight: 11 },
  { type: "Tendinitis", area: "Rodilla", diagnosis: "Inflamación tendinosa", weight: 7 },
  { type: "Lesión articular", area: "Hombro", diagnosis: "Distensión articular", weight: 4 },
  { type: "Fractura", area: "Pie", diagnosis: "Fractura por traumatismo", weight: 0.9 },
  { type: "Luxación", area: "Hombro", diagnosis: "Luxación articular", weight: 0.7 },
  { type: "Fractura", area: "Pierna", diagnosis: "Fractura de larga recuperación", weight: 0.4 },
];

export function rollInjuryProfile(): InjuryProfile {
  const total = INJURY_PROFILES.reduce((sum, p) => sum + p.weight, 0);
  let r = rand() * total;
  for (const profile of INJURY_PROFILES) {
    r -= profile.weight;
    if (r <= 0) return profile;
  }
  return INJURY_PROFILES[0];
}

/**
 * Durations are deliberately concentrated around 1-2 weeks and 1-2 months.
 * Long layoffs exist, but 3-6 months are intentionally extremely rare.
 */
export function rollInjuryDurationDays(): number {
  const roll = rand() * 100;
  if (roll < 40) return 7;
  if (roll < 68) return 14;
  if (roll < 86) return 30;
  if (roll < 95) return 60;
  if (roll < 98.5) return 90;
  if (roll < 99.5) return 120;
  if (roll < 99.9) return 150;
  return 180;
}


const TARGET_AVERAGE_INJURIES_PER_LEAGUE_MATCHDAY = 5.5;

function injuryChanceForLeague(teamCount: number): number {
  return Math.min(0.45, Math.max(0.12, TARGET_AVERAGE_INJURIES_PER_LEAGUE_MATCHDAY / Math.max(1, teamCount)));
}

function maybeInjury(
  xi: Player[],
  team: "home" | "away",
  bench: Player[] = [],
  plannedSubs: SubstitutionEvent[] = [],
  redCards: Map<string, number> = new Map(),
  tactics: SimTactics | null = null,
  leagueTeamCount = 20,
): InjuryEvent | null {
  const minute = 5 + Math.floor(rand() * 80);
  const active = activePlayersAt(xi, bench, plannedSubs, redCards, team, minute);
  if (active.length === 0) return null;

  const pressure = (tactics?.pressure ?? "medium") as "low" | "medium" | "high";
  const staminaMult = tacticsModifiers(tactics).stamina;
  const candidates = active.map((player) => {
    const priorSub = plannedSubs
      .filter((sub) => sub.team === team && sub.playerInId === player.id && sub.minute <= minute)
      .sort((a, b) => b.minute - a.minute)[0];
    const startedWith = priorSub ? 100 : (player.energy ?? 100);
    const elapsed = priorSub ? Math.max(0, minute - priorSub.minute) : minute;
    const estimatedStamina = Math.max(
      0,
      startedWith - elapsed * drainPerMinute(player.positions?.[0] ?? "CM", pressure, staminaMult),
    );
    return {
      player,
      estimatedStamina,
      fatigueRisk: fatigueInjuryRisk(estimatedStamina),
    };
  });

  // A typical match injury is still uncommon, but slightly more likely than before.
  // Once a player is below 40% energy, the match-level risk rises sharply.
  const anyVeryTired = candidates.some((c) => c.estimatedStamina < 40);
  const baseChance = injuryChanceForLeague(leagueTeamCount);
  const matchInjuryChance = Math.min(0.55, baseChance * (anyVeryTired ? 2.2 : 1));
  if (rand() > matchInjuryChance) return null;

  // Fatigue also makes the low-energy players more likely to be the one who
  // actually suffers the injury.
  const weighted = candidates.map((c) => ({
    player: c.player,
    weight: Math.max(0.25, c.fatigueRisk),
  }));
  const totalWeight = weighted.reduce((sum, c) => sum + c.weight, 0);
  let pick = rand() * totalWeight;
  let victim = weighted[weighted.length - 1].player;
  for (const candidate of weighted) {
    pick -= candidate.weight;
    if (pick <= 0) {
      victim = candidate.player;
      break;
    }
  }

  const durationDays = Math.min(180, rollInjuryDurationDays());
  const profile = rollInjuryProfile();

  // A forced substitution happens whenever a bench player of a compatible
  // profile is available and the injury happens before the 88th minute.
  const plannedIncomingIds = new Set(
    plannedSubs.filter((s) => s.team === team).map((s) => s.playerInId),
  );
  const replacementCandidates = bench.filter(
    (p) => p.id !== victim.id && !plannedIncomingIds.has(p.id),
  );
  const samePos = replacementCandidates.filter((p) =>
    p.positions.some((pos) => victim.positions.includes(pos)),
  );
  const replacement = (samePos.length > 0 ? samePos : replacementCandidates)
    .slice()
    .sort((a, b) => b.rating - a.rating)[0];

  const teamSubCount = plannedSubs.filter((s) => s.team === team).length;
  const canForceSub = teamSubCount < 5 && !!replacement && minute < 88;
  const reason = `${profile.diagnosis} · ${profile.area}`;

  return {
    team,
    playerId: victim.id,
    playerName: victim.name,
    weeks: Math.max(1, Math.ceil(durationDays / 7)),
    durationDays,
    injuryType: profile.type,
    bodyPart: profile.area,
    diagnosis: profile.diagnosis,
    minute,
    reason,
    forcedSub: canForceSub,
    replacementId: canForceSub ? replacement.id : undefined,
    replacementName: canForceSub ? replacement.name : undefined,
  };
}

/**
 * Goals are not uniformly distributed across a match: there are more goals in
 * the second half and a clear spike in the closing minutes.
 */
function seededNoise(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h % 10000) / 10000;
}

function goalMinute(from = 1, to = 90): number {
  const span = to - from + 1;
  const r = rand();
  // Skew towards the end of the match (quadratic-ish bias).
  const skewed = 1 - Math.pow(1 - r, 1.35);
  return from + Math.min(span - 1, Math.floor(skewed * span));
}

// Generate realistic in-match substitutions using each team's actual bench,
// spread across the second half and preferring same-position replacements.
export function generateTacticalSubs(
  xi: Player[],
  bench: Player[],
  team: "home" | "away",
  redCardedPlayers: Map<string, number> = new Map(),
  context?: { teamStyle?: "defensive" | "balanced" | "offensive"; teamStrength?: number; opponentStrength?: number; isHome?: boolean; seed?: string },
): SubstitutionEvent[] {
  if (bench.length === 0 || xi.length === 0) return [];

  const availableOut = xi.filter((p) => !isGoalkeeper(p.positions) && !redCardedPlayers.has(p.id));
  const availableIn = bench.filter((p) => !isGoalkeeper(p.positions));
  if (availableOut.length === 0 || availableIn.length === 0) return [];

  // Sistema de ventanas de cambios: máximo 5 cambios en 3 ventanas
  // Una ventana = cambios en el mismo minuto o muy cercanos
  // El descanso no cuenta como ventana
  const maxSubs = Math.min(5, availableOut.length, availableIn.length);
  if (maxSubs <= 0) return [];

  // Determinar cuántos cambios queremos hacer en total
  const desiredTotal = 1 + Math.floor(rand() * 5); // 1-5 cambios deseados
  const totalSubs = Math.min(desiredTotal, maxSubs);

  // Determinar cuántas ventanas usaremos (máximo 3)
  const maxWindows = Math.min(3, totalSubs);
  let numWindows = 1;
  
  if (totalSubs >= 4) {
    // Para 4-5 cambios, usar 2-3 ventanas
    numWindows = 2 + Math.floor(rand() * 2); // 2-3 ventanas
  } else if (totalSubs >= 2) {
    // Para 2-3 cambios, usar 1-2 ventanas
    numWindows = 1 + Math.floor(rand() * 2); // 1-2 ventanas
  }

  // Distribuir cambios entre las ventanas
  const subsPerWindow: number[] = [];
  let remainingSubs = totalSubs;
  
  for (let i = 0; i < numWindows; i++) {
    if (i === numWindows - 1) {
      // Última ventana: todos los cambios restantes
      subsPerWindow.push(remainingSubs);
    } else {
      // Ventanas anteriores: al menos 1 cambio
      const maxInWindow = Math.min(remainingSubs - (numWindows - i - 1), 3);
      const subsInWindow = 1 + Math.floor(rand() * maxInWindow);
      subsPerWindow.push(subsInWindow);
      remainingSubs -= subsInWindow;
    }
  }

  // Asignar minutos a cada ventana
  const windowMinutes: number[] = [];
  const usedMinutes = new Set<number>();
  
  for (let i = 0; i < numWindows; i++) {
    let minute: number;
    
    if (i === 0) {
      // Primera ventana: 45-70 minutos
      minute = 45 + Math.floor(rand() * 26);
    } else if (i === 1) {
      // Segunda ventana: después de la primera ventana + 5-15 minutos
      const minMinute = windowMinutes[0] + 5;
      minute = Math.min(minMinute + Math.floor(rand() * 16), 85);
    } else {
      // Tercera ventana: después de la segunda ventana + 5-10 minutos
      const minMinute = windowMinutes[1] + 5;
      minute = Math.min(minMinute + Math.floor(rand() * 11), 88);
    }
    
    windowMinutes.push(minute);
    usedMinutes.add(minute);
  }

  // Generar los cambios agrupados por ventana
  const subs: SubstitutionEvent[] = [];
  const usedOut = new Set<string>();
  const usedIn = new Set<string>();
  
  // No se repite siempre el mismo orden de cambios: la prioridad combina
  // media, perfil táctico, contexto del rival y una semilla estable por partido.
  const seed = context?.seed ?? `${team}:${xi.map((p) => p.id).join(",")}:${bench.map((p) => p.id).join(",")}`;
  const style = context?.teamStyle ?? "balanced";
  const strengthDiff = (context?.teamStrength ?? 75) - (context?.opponentStrength ?? 75);

  const outPool = [...availableOut].sort((a, b) => {
    const impactA = style === "offensive" && isAttacking(a.positions) ? 2 : style === "defensive" && isDefensive(a.positions) ? 1.5 : 0;
    const impactB = style === "offensive" && isAttacking(b.positions) ? 2 : style === "defensive" && isDefensive(b.positions) ? 1.5 : 0;
    const fatigueA = (Math.max(0, 90 - a.rating) / 10) + (seededNoise(`${seed}:out:${a.id}`) * 2);
    const fatigueB = (Math.max(0, 90 - b.rating) / 10) + (seededNoise(`${seed}:out:${b.id}`) * 2);
    const contextA = strengthDiff > 6 && style === "offensive" && isAttacking(a.positions) ? 0.6 : impactA;
    const contextB = strengthDiff > 6 && style === "offensive" && isAttacking(b.positions) ? 0.6 : impactB;
    return (a.rating - fatigueA - contextA) - (b.rating - fatigueB - contextB);
  });
  
  for (let windowIdx = 0; windowIdx < numWindows; windowIdx++) {
    const minute = windowMinutes[windowIdx];
    const numSubsInWindow = subsPerWindow[windowIdx];
    
    for (let i = 0; i < numSubsInWindow; i++) {
      if (!addSub(subs, minute, team, outPool, availableIn, usedOut, usedIn, { style, strengthDiff, seed, windowIdx, changeIndex: i })) break;
    }
  }

  return subs.sort((a, b) => a.minute - b.minute);
}

function addSub(
  subs: SubstitutionEvent[],
  minute: number,
  team: "home" | "away",
  outPool: Player[],
  availableIn: Player[],
  usedOut: Set<string>,
  usedIn: Set<string>,
  context?: { style: "defensive" | "balanced" | "offensive"; strengthDiff: number; seed: string; windowIdx: number; changeIndex: number },
): boolean {
  const playerOut = outPool.filter((p) => !usedOut.has(p.id)).sort((a, b) => {
    const pa = seededNoise(`${context?.seed ?? ""}:outpick:${context?.windowIdx}:${context?.changeIndex}:${a.id}`);
    const pb = seededNoise(`${context?.seed ?? ""}:outpick:${context?.windowIdx}:${context?.changeIndex}:${b.id}`);
    return (b.rating * 0.08 + pb) - (a.rating * 0.08 + pa);
  })[0];
  if (!playerOut) return false;
  
  const candidatesIn = availableIn.filter((p) => !usedIn.has(p.id));
  if (candidatesIn.length === 0) return false;
  
  const samePos = candidatesIn.filter((p) =>
    p.positions.some((pos) => playerOut.positions.includes(pos)),
  );
  const pool = samePos.length > 0 ? samePos : candidatesIn;
  const playerIn = pool.slice().sort((a, b) => {
    const score = (p: Player) => {
      const noise = seededNoise(`${context?.seed ?? ""}:inpick:${context?.windowIdx}:${context?.changeIndex}:${p.id}`) * 3;
      const roleBoost =
        context?.style === "offensive" && isAttacking(p.positions)
          ? 2
          : context?.style === "defensive" && isDefensive(p.positions)
            ? 1.5
            : 0;
      const underdogBoost = (context?.strengthDiff ?? 0) < -6 && isAttacking(p.positions) ? 1.5 : 0;
      return p.rating + noise + roleBoost + underdogBoost;
    };
    return score(b) - score(a);
  })[0];

  usedOut.add(playerOut.id);
  usedIn.add(playerIn.id);
  subs.push({
    minute,
    team,
    playerOutId: playerOut.id,
    playerOutName: playerOut.name,
    playerInId: playerIn.id,
    playerInName: playerIn.name,
  });
  
  return true;
}

function countSubWindows(substitutions: SubstitutionEvent[], team: "home" | "away"): number {
  return new Set(
    substitutions
      .filter((s) => s.team === team)
      .map((s) => Number(s.minute) || 0),
  ).size;
}

/**
 * Generate the additional substitution allowance available during extra time.
 * The regular phase allows 5 changes in 3 windows; extra time adds exactly
 * one more change and one more window, so the remaining allowance is calculated
 * from what each side actually used before minute 90.
 */
export function generateExtraTimeSubs(
  xi: Player[],
  bench: Player[],
  team: "home" | "away",
  regularSubs: SubstitutionEvent[] = [],
  regularCards: CardEvent[] = [],
  context?: { teamStyle?: "defensive" | "balanced" | "offensive"; teamStrength?: number; opponentStrength?: number; seed?: string },
): SubstitutionEvent[] {
  if (xi.length === 0 || bench.length === 0) return [];

  const regularTeamSubs = regularSubs.filter((s) => s.team === team);
  const remainingSubs = Math.max(0, 6 - regularTeamSubs.length);
  const remainingWindows = Math.max(0, 4 - countSubWindows(regularSubs, team));
  if (remainingSubs <= 0 || remainingWindows <= 0) return [];

  const redCards = new Map<string, number>();
  for (const card of regularCards) {
    if (card.team === team && card.cardType === "red") redCards.set(card.playerId, card.minute);
  }

  const onPitchAt90 = activePlayersAt(xi, bench, regularSubs, redCards, team, 90);
  const availableOut = onPitchAt90.filter((p) => !isGoalkeeper(p.positions));
  const usedIn = new Set(regularTeamSubs.map((s) => s.playerInId));
  const availableIn = bench.filter((p) => !usedIn.has(p.id) && !redCards.has(p.id) && !isGoalkeeper(p.positions));
  if (availableOut.length === 0 || availableIn.length === 0) return [];

  // In extra time teams commonly use the additional allowance, but not all
  // remaining changes are mandatory. Prefer 1-2 changes, capped by the legal
  // remaining allowance and the available players.
  const maxPossible = Math.min(remainingSubs, availableOut.length, availableIn.length);
  const desiredTotal = maxPossible <= 1
    ? 1
    : Math.random() < 0.72
      ? 2
      : 1;
  const totalSubs = Math.min(maxPossible, desiredTotal);
  if (totalSubs <= 0) return [];

  const numWindows = Math.min(remainingWindows, totalSubs, totalSubs > 1 && Math.random() < 0.65 ? 2 : 1);
  const windowMinutes = numWindows === 1
    ? [94 + Math.floor(Math.random() * 18)]
    : [93 + Math.floor(Math.random() * 8), 107 + Math.floor(Math.random() * 10)];

  const counts = Array<number>(numWindows).fill(1);
  let left = totalSubs - numWindows;
  while (left > 0) {
    counts[Math.floor(Math.random() * numWindows)] += 1;
    left -= 1;
  }

  const seed = context?.seed ?? `${team}:extra:${xi.map((p) => p.id).join(",")}:${bench.map((p) => p.id).join(",")}`;
  const style = context?.teamStyle ?? "balanced";
  const strengthDiff = (context?.teamStrength ?? 75) - (context?.opponentStrength ?? 75);
  const outPool = [...availableOut];
  const subs: SubstitutionEvent[] = [];
  const usedOut = new Set<string>();
  const usedInIds = new Set<string>();

  for (let w = 0; w < numWindows; w++) {
    for (let j = 0; j < counts[w]; j++) {
      if (!addSub(subs, windowMinutes[w], team, outPool, availableIn, usedOut, usedInIds, {
        style,
        strengthDiff,
        seed,
        windowIdx: w,
        changeIndex: j,
      })) break;
    }
  }

  return subs.sort((a, b) => a.minute - b.minute);
}

/**
 * Returns the players actually on the pitch at a given minute, taking into
 * account tactical substitutions and red cards. A player who has left the
 * pitch is never eligible for a later goal, assist, card, injury or highlight.
 */
function activePlayersAt(
  xi: Player[],
  bench: Player[],
  substitutions: SubstitutionEvent[],
  redCards: Map<string, number>,
  team: "home" | "away",
  minute: number,
): Player[] {
  const all = [...xi, ...bench];
  const byId = new Map(all.map((p) => [p.id, p]));
  const starters = new Set(xi.map((p) => p.id));

  const entered = new Set<string>();
  const left = new Set<string>();
  for (const sub of substitutions) {
    if (sub.team !== team || sub.minute > minute) continue;
    left.add(sub.playerOutId);
    entered.add(sub.playerInId);
  }

  return all.filter((p) => {
    const wasStarter = starters.has(p.id);
    const onPitch = wasStarter ? !left.has(p.id) : entered.has(p.id);
    if (!onPitch) return false;
    const redMinute = redCards.get(p.id);
    return redMinute === undefined || redMinute > minute;
  });
}

/** Public wrapper used by tournament/store flows that need the exact players
 * still on the pitch at a given minute (including extra-time substitutions and
 * red cards). */
export function getActivePlayersAtMinute(
  xi: Player[],
  bench: Player[],
  substitutions: SubstitutionEvent[],
  cards: CardEvent[],
  team: "home" | "away",
  minute: number,
): Player[] {
  const redCards = new Map<string, number>(
    cards
      .filter((c) => c.team === team && c.cardType === "red")
      .map((c) => [c.playerId, c.minute]),
  );
  return activePlayersAt(xi, bench, substitutions, redCards, team, minute);
}

function participantsFromSubs(
  xi: Player[],
  bench: Player[],
  substitutions: SubstitutionEvent[],
  team: "home" | "away",
): Player[] {
  const ids = new Set(xi.map((p) => p.id));
  const all = [...xi, ...bench];
  for (const sub of substitutions) {
    if (sub.team === team) ids.add(sub.playerInId);
  }
  return all.filter((p) => ids.has(p.id));
}

function buildMinutesPlayed(
  xi: Player[],
  bench: Player[],
  substitutions: SubstitutionEvent[],
  cards: CardEvent[],
  injuries: InjuryEvent[],
  team: "home" | "away",
  matchDuration = 90,
): Record<string, number> {
  const minutes: Record<string, number> = {};
  const participants = participantsFromSubs(xi, bench, substitutions, team);
  const all = new Set(participants.map((p) => p.id));
  const startAt = new Map<string, number>();
  const onPitch = new Set<string>(xi.map((p) => p.id));

  for (const id of onPitch) startAt.set(id, 0);

  const addInterval = (id: string, endMinute: number) => {
    const started = startAt.get(id);
    if (started === undefined) return;
    minutes[id] = (minutes[id] ?? 0) + Math.max(0, endMinute - started);
    startAt.delete(id);
  };

  const timeline = substitutions
    .filter((s) => s.team === team)
    .slice()
    .sort((a, b) => a.minute - b.minute);

  for (const sub of timeline) {
    if (onPitch.has(sub.playerOutId)) {
      addInterval(sub.playerOutId, sub.minute);
      onPitch.delete(sub.playerOutId);
    }
    if (all.has(sub.playerInId) && !onPitch.has(sub.playerInId)) {
      onPitch.add(sub.playerInId);
      startAt.set(sub.playerInId, sub.minute);
    }
  }

  for (const card of cards) {
    if (card.team !== team || card.cardType !== "red") continue;
    if (onPitch.has(card.playerId)) {
      addInterval(card.playerId, card.minute);
      onPitch.delete(card.playerId);
    }
  }

  for (const injury of injuries) {
    if (injury.team !== team || injury.minute === undefined || injury.forcedSub) continue;
    if (onPitch.has(injury.playerId)) {
      addInterval(injury.playerId, injury.minute);
      onPitch.delete(injury.playerId);
    }
  }

  for (const id of onPitch) {
    addInterval(id, matchDuration);
  }

  // A player who entered and was later injured/expelled is already accounted
  // for above; keep a deterministic integer minute count for the UI.
  for (const id of all) {
    minutes[id] = Math.max(0, Math.min(matchDuration, Math.round(minutes[id] ?? 0)));
  }

  return minutes;
}

/**
 * Calculates final physical energy from the player's persistent pre-match
 * energy, minutes actually spent on the pitch and the team's effort level.
 * Starters use their saved energy; every substitute who enters starts that
 * match at 100. Non-participants remain at 100.
 */
export function calculateEnergyAtEnd(
  xi: Player[],
  bench: Player[],
  substitutions: SubstitutionEvent[],
  cards: CardEvent[],
  injuries: InjuryEvent[],
  team: "home" | "away",
  tactics?: SimTactics | null,
  matchDuration = 90,
): Record<string, number> {
  const minutes = buildMinutesPlayed(xi, bench, substitutions, cards, injuries, team, matchDuration);
  const teamSubs = substitutions.filter((s) => s.team === team);
  const enteredAt = new Map<string, number>();
  for (const sub of teamSubs.slice().sort((a, b) => a.minute - b.minute)) {
    enteredAt.set(sub.playerInId, sub.minute);
  }
  const all = [...xi, ...bench];
  const result: Record<string, number> = {};
  const staminaMultiplier = tacticsModifiers(tactics ?? null).stamina;
  for (const player of all) {
    const mins = Number(minutes[player.id] ?? 0);
    if (mins <= 0) {
      result[player.id] = 100;
      continue;
    }
    const startEnergy = enteredAt.has(player.id) ? 100 : (player.energy ?? 100);
    const drain = drainPerMinute(player.positions?.[0] ?? "MC", (tactics?.pressure ?? "medium") as "low" | "medium" | "high", staminaMultiplier);
    result[player.id] = Math.round(Math.max(0, Math.min(100, startEnergy - mins * drain)) * 10) / 10;
  }
  return result;
}

const buildSaveDetail = (keeper: Player, attacker?: Player) => {
  const name = attacker?.name || "El atacante";
  const variants = [
    `${keeper.name} se estira abajo y atrapa el disparo cruzado de ${name}.`,
    `${name} prueba de primeras, pero ${keeper.name} responde con una mano firme y desvía el balón.`,
    `${keeper.name} sale bien de su portería y tapa el remate de ${name} antes de que pueda ajustar el tiro.`,
    `Disparo raso de ${name} al palo largo; ${keeper.name} llega a tiempo y manda la pelota a córner.`,
    `${name} consigue girarse en el área, aunque ${keeper.name} aguanta el movimiento y bloquea el golpeo.`,
    `${keeper.name} reacciona a quemarropa ante el remate de ${name} y evita el gol con una parada de reflejos.`,
    `Centro atrás y remate de ${name}. ${keeper.name} se hace enorme y rechaza el balón con las dos manos.`,
    `${name} encuentra un pequeño espacio en la frontal, pero ${keeper.name} se vence a tiempo para desviar el disparo.`,
    `Remate potente de ${name}; ${keeper.name} mete los puños y aleja el peligro antes del rechace.`,
    `${keeper.name} lee la jugada, se coloca a tiempo y acaba sacando el tiro de ${name}.`,
    `${name} busca sorprender con un tiro ajustado, pero ${keeper.name} baja rápido y evita que entre por su palo.`,
    `La ocasión termina con un mano a mano: ${keeper.name} espera hasta el último segundo y tapa el remate de ${name}.`,
  ];
  return variants[Math.floor(rand() * variants.length)];
};

const buildWoodworkDetail = (player: Player) => {
  const variants = [
    `${player.name} recorta desde la banda y estrella un disparo seco en el palo.`,
    `${player.name} conecta un remate de primeras que golpea el travesaño y sale despedido.`,
    `Gran golpeo de ${player.name} desde la frontal: la pelota besa la madera y se va fuera.`,
    `${player.name} gana el segundo palo y cabecea al poste. El balón queda muerto antes del despeje.`,
    `Rechace al borde del área y ${player.name} no se lo piensa: latigazo al poste.`,
    `${player.name} encuentra la escuadra con una vaselina, pero el travesaño evita el gol.`,
    `Disparo cruzado de ${player.name} que supera al portero y termina estrellándose en el palo.`,
    `${player.name} se hace hueco entre dos rivales y saca un derechazo que retumba en la madera.`,
    `Centro al segundo palo y remate de ${player.name}; la pelota toca el poste y se marcha por línea de fondo.`,
    `${player.name} engancha un balón suelto dentro del área y el remate acaba en el larguero.`,
  ];
  return variants[Math.floor(rand() * variants.length)];
};

// Ultra-fast simulation for bulk matchdays (no detailed events, just results)
// NOTE: Stats recording is handled by applyMatchToStats after the simulation
export function simulateMatchFast(
  home: Team,
  away: Team,
  homeXI: Player[],
  awayXI: Player[],
  opts: {
    homeBench?: Player[];
    awayBench?: Player[];
    homeTactics?: SimTactics | null;
    awayTactics?: SimTactics | null;
    homeFormation?: FormationName;
    awayFormation?: FormationName;
  } = {},
): SimResult {
  const homeBench = opts.homeBench ?? [];
  const awayBench = opts.awayBench ?? [];
  const homeTactics = opts.homeTactics ?? null;
  const awayTactics = opts.awayTactics ?? null;
  const homeFormation = opts.homeFormation ?? "Táctica 4-4-2";
  const awayFormation = opts.awayFormation ?? "Táctica 4-4-2";

  // A legacy/incomplete save can temporarily produce an empty XI (for example
  // when every available player is suspended or injured). A fast simulation
  // must still complete the matchday instead of dereferencing scorer.id.
  if (homeXI.length === 0 || awayXI.length === 0) {
    return {
      homeGoals: 0,
      awayGoals: 0,
      events: [],
      cards: [],
      injuries: [],
      xgHome: 0,
      xgAway: 0,
      highlights: [],
      ratings: [],
      mvp: null,
      homeLineup: homeXI,
      awayLineup: awayXI,
      homeStartingLineup: homeXI,
      awayStartingLineup: awayXI,
      homeFinalLineup: homeXI,
      awayFinalLineup: awayXI,
      homeFormation,
      awayFormation,
      substitutions: [],
      energyAtEnd: {},
    };
  }

  // Generate substitutions before any match event so every later event uses
  // the correct players actually on the pitch.
  const substitutions = [
    ...generateTacticalSubs(homeXI, homeBench, "home", new Map(), {
      teamStyle: homeTactics?.style,
      teamStrength: (homeXI.reduce((s, p) => s + p.rating, 0) / Math.max(1, homeXI.length)),
      opponentStrength: (awayXI.reduce((s, p) => s + p.rating, 0) / Math.max(1, awayXI.length)),
      isHome: true,
      seed: `home:${home.name}:${away.name}:${homeXI.map((p) => p.id).join(",")}:${awayXI.map((p) => p.id).join(",")}`,
    }),
    ...generateTacticalSubs(awayXI, awayBench, "away", new Map(), {
      teamStyle: awayTactics?.style,
      teamStrength: (awayXI.reduce((s, p) => s + p.rating, 0) / Math.max(1, awayXI.length)),
      opponentStrength: (homeXI.reduce((s, p) => s + p.rating, 0) / Math.max(1, homeXI.length)),
      isHome: false,
      seed: `away:${home.name}:${away.name}:${homeXI.map((p) => p.id).join(",")}:${awayXI.map((p) => p.id).join(",")}`,
    }),
  ].sort((a, b) => a.minute - b.minute);

  // Fast-simulated matches (used by the Big 5, Portugal, Netherlands, Turkey
  // and the other non-user leagues) must also generate authoritative injuries.
  // Previously this path returned `injuries: []`, so those leagues could never
  // produce a player injury even though the detailed simulation could.
  const injuries: InjuryEvent[] = [];
  const homeLeagueTeamCount = teamsByLeague(home.league).length;
  const awayLeagueTeamCount = teamsByLeague(away.league).length;
  const homeInjury = maybeInjury(
    homeXI,
    "home",
    homeBench,
    substitutions,
    new Map(),
    homeTactics,
    homeLeagueTeamCount,
  );
  const awayInjury = maybeInjury(
    awayXI,
    "away",
    awayBench,
    substitutions,
    new Map(),
    awayTactics,
    awayLeagueTeamCount,
  );
  if (homeInjury) injuries.push(homeInjury);
  if (awayInjury) injuries.push(awayInjury);

  // An injury in the fast path can force the same immediate substitution as
  // the detailed simulation, so the injured player is removed from all later
  // match events.
  for (const injury of injuries) {
    if (injury.forcedSub && injury.replacementId && injury.replacementName && injury.minute !== undefined) {
      substitutions.push({
        minute: injury.minute,
        team: injury.team,
        playerOutId: injury.playerId,
        playerOutName: injury.playerName,
        playerInId: injury.replacementId,
        playerInName: injury.replacementName,
      });
    }
  }
  substitutions.sort((a, b) => a.minute - b.minute);

  const { lh, la } = expectedGoals(home, away, homeXI, awayXI, opts.homeTactics, opts.awayTactics);

  // Poisson keeps the goal distribution realistic and, unlike the previous
  // implementation, does NOT force every fast-simulated match to end in a draw.
  const homeGoals = poisson(lh);
  const awayGoals = poisson(la);

  // Minimal events - with weighted scorer selection and assists
  // Stats are recorded later by applyMatchToStats to avoid duplicates
  const events: MatchEvent[] = [];

  // Home team goals
  for (let i = 0; i < homeGoals; i++) {
    const minute = goalMinute();
    const active = activePlayersAt(homeXI, homeBench, substitutions, new Map(), "home", minute);
    const scorer = fastPickScorerWeighted(active);
    if (!scorer) continue;
    const assister = fastPickAssister(active, scorer.id);

    events.push({
      minute,
      team: "home",
      type: "goal",
      scorerId: scorer.id,
      scorerName: scorer.name,
      assistId: assister?.id,
      assistName: assister?.name,
    });
  }

  // Away team goals
  for (let i = 0; i < awayGoals; i++) {
    const minute = goalMinute();
    const active = activePlayersAt(awayXI, awayBench, substitutions, new Map(), "away", minute);
    const scorer = fastPickScorerWeighted(active);
    if (!scorer) continue;
    const assister = fastPickAssister(active, scorer.id);

    events.push({
      minute,
      team: "away",
      type: "goal",
      scorerId: scorer.id,
      scorerName: scorer.name,
      assistId: assister?.id,
      assistName: assister?.name,
    });
  }

  // Keep the scoreboard and chronicle coherent even if a player becomes
  // unavailable between the Poisson score draw and scorer selection.
  const ensureFastGoalEvents = (team: "home" | "away", expectedGoals: number) => {
    if (expectedGoals <= 0) return;
    const count = events.filter(
      (e) =>
        e.team === team &&
        ["goal", "own_goal", "free_kick_goal", "penalty_goal"].includes(e.type),
    ).length;
    let missing = expectedGoals - count;
    if (missing <= 0) return;
    const pool = (team === "home" ? homeXI : awayXI).filter((p) => !isGoalkeeper(p.positions));
    const candidates = pool.length > 0 ? pool : team === "home" ? homeXI : awayXI;
    if (candidates.length === 0) return;
    for (let i = 0; i < missing; i++) {
      const scorer = candidates[(count + i) % candidates.length];
      events.push({
        minute: Math.min(90, Math.max(1, 8 + Math.floor((80 * (i + 1)) / (missing + 1)))),
        team,
        type: "goal",
        scorerId: scorer.id,
        scorerName: scorer.name,
      });
    }
  };
  ensureFastGoalEvents("home", homeGoals);
  ensureFastGoalEvents("away", awayGoals);
  events.sort((a, b) => a.minute - b.minute);

  // Lightweight cards for fast/background matches. This engine is used by
  // background leagues, so it must support the same disciplinary outcomes as
  // the detailed engine: yellow, second yellow -> red and direct red.
  const cards: CardEvent[] = [];
  const CARD_REASONS = [
    "entrada dura",
    "juego peligroso",
    "protestar",
    "cortar un contragolpe",
    "agarrón",
    "perder tiempo",
    "falta táctica",
  ];
  const RED_REASONS = ["entrada muy dura", "mano en el área", "última falta", "conducta violenta"];

  function simulateTeamCardsFast(xi: Player[], bench: Player[], team: "home" | "away") {
    const homeAggression = (homeTactics as SimTactics & { aggression?: number } | null)?.aggression;
    const awayAggression = (awayTactics as SimTactics & { aggression?: number } | null)?.aggression;
    const aggression = (team === "home" ? homeAggression : awayAggression) ?? 1;

    for (const player of [...xi, ...bench]) {
      const base =
        (isGoalkeeper(player.positions)
          ? 0.02
          : isDefensive(player.positions)
            ? 0.115
            : isMidfield(player.positions)
              ? 0.095
              : 0.055) * aggression;

      // Direct red: rare, but available in every competition/match mode.
      if (rand() < 0.0035) {
        const minute = 15 + Math.floor(rand() * 75);
        const active = activePlayersAt(xi, bench, substitutions, new Map(), team, minute);
        if (!active.some((p) => p.id === player.id)) continue;
        cards.push({
          minute,
          team,
          playerId: player.id,
          playerName: player.name,
          cardType: "red",
          isSecondYellow: false,
          reason: RED_REASONS[Math.floor(rand() * RED_REASONS.length)],
        });
        continue;
      }

      if (rand() >= base) continue;

      const firstMinute = 8 + Math.floor(rand() * 75);
      const activeAtFirst = activePlayersAt(xi, bench, substitutions, new Map(), team, firstMinute);
      if (!activeAtFirst.some((p) => p.id === player.id)) continue;

      cards.push({
        minute: firstMinute,
        team,
        playerId: player.id,
        playerName: player.name,
        cardType: "yellow",
        isSecondYellow: false,
        reason: CARD_REASONS[Math.floor(rand() * CARD_REASONS.length)],
      });

      // A booked player can later receive a second yellow and be sent off.
      const timeLeft = Math.max(0, 90 - firstMinute) / 90;
      const secondYellowChance = 0.1 * timeLeft * (isDefensive(player.positions) ? 1.4 : 1);
      if (rand() < secondYellowChance) {
        const secondMinute = Math.min(
          90,
          firstMinute + 5 + Math.floor(rand() * Math.max(1, 90 - firstMinute)),
        );
        const activeAtSecond = activePlayersAt(
          xi,
          bench,
          substitutions,
          new Map(),
          team,
          secondMinute,
        );
        if (activeAtSecond.some((p) => p.id === player.id)) {
          cards.push({
            minute: secondMinute,
            team,
            playerId: player.id,
            playerName: player.name,
            cardType: "red",
            isSecondYellow: true,
            reason: "doble amarilla",
          });
        }
      }
    }
  }

  simulateTeamCardsFast(homeXI, homeBench, "home");
  simulateTeamCardsFast(awayXI, awayBench, "away");
  cards.sort((a, b) => a.minute - b.minute);

  // A red card immediately reduces the team to 10. Remove any tactical
  // substitution planned for that player after the expulsion.
  const fastHomeRedCardedPlayers = new Map<string, number>();
  const fastAwayRedCardedPlayers = new Map<string, number>();
  for (const card of cards) {
    if (card.cardType !== "red") continue;
    if (card.team === "home") fastHomeRedCardedPlayers.set(card.playerId, card.minute);
    else fastAwayRedCardedPlayers.set(card.playerId, card.minute);
  }
  const fastRedCardedPlayers = {
    home: fastHomeRedCardedPlayers,
    away: fastAwayRedCardedPlayers,
  };

  const filteredFastSubs = substitutions.filter((sub) => {
    const redAt = fastRedCardedPlayers[sub.team].get(sub.playerOutId);
    return redAt === undefined || redAt > sub.minute;
  });
  substitutions.length = 0;
  substitutions.push(...filteredFastSubs);
  substitutions.sort((a, b) => a.minute - b.minute);

  // Injured players cannot receive a card after their injury minute.
  const validFastCards = cards.filter((card) => {
    const injury = injuries.find(
      (i) => i.team === card.team && i.playerId === card.playerId && i.minute !== undefined,
    );
    return !injury || card.minute <= (injury.minute as number);
  });
  cards.length = 0;
  cards.push(...validFastCards);
  cards.sort((a, b) => a.minute - b.minute);

  // Rebuild red maps after the injury validity pass.
  fastHomeRedCardedPlayers.clear();
  fastAwayRedCardedPlayers.clear();
  for (const card of cards) {
    if (card.cardType === "red") {
      if (card.team === "home") fastHomeRedCardedPlayers.set(card.playerId, card.minute);
      else fastAwayRedCardedPlayers.set(card.playerId, card.minute);
    }
  }

  const validFastSubsAfterCards = substitutions.filter((sub) => {
    const redAt = fastRedCardedPlayers[sub.team].get(sub.playerOutId);
    return redAt === undefined || redAt > sub.minute;
  });
  substitutions.length = 0;
  substitutions.push(...validFastSubsAfterCards);
  substitutions.sort((a, b) => a.minute - b.minute);

  // If the original scorer was dismissed before his goal, remap it to a player
  // who was actually on the pitch at that minute.
  for (const event of events) {
    const redAt = fastRedCardedPlayers[event.team].get(event.scorerId);
    if (redAt === undefined || event.minute <= redAt) continue;

    const active = activePlayersAt(
      event.team === "home" ? homeXI : awayXI,
      event.team === "home" ? homeBench : awayBench,
      substitutions,
      fastRedCardedPlayers[event.team],
      event.team,
      event.minute,
    ).filter((p) => !isGoalkeeper(p.positions));
    if (active.length === 0) continue;

    const scorer = fastPickScorerWeighted(active);
    if (!scorer) continue;
    const assister = fastPickAssister(active, scorer.id);
    event.scorerId = scorer.id;
    event.scorerName = scorer.name;
    event.assistId = assister?.id;
    event.assistName = assister?.name;
  }

  // A couple of saves and the occasional woodwork, so the chronicle of
  // non-user matches has more than just goals.
  const highlights: HighlightEvent[] = [];

  const addFastSaves = (xi: Player[], bench: Player[], team: "home" | "away") => {
    const count = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const minute = 3 + Math.floor(rand() * 85);
      const activeKeeperPool = activePlayersAt(
      xi,
      bench,
      substitutions,
      team === "home" ? fastHomeRedCardedPlayers : fastAwayRedCardedPlayers,
      team,
      minute,
    );
      const gk = activeKeeperPool.find((p) => isGoalkeeper(p.positions));
      if (!gk) continue;
      const attackingSide = team === "home" ? "away" : "home";
      const attackerPool = activePlayersAt(
        attackingSide === "home" ? homeXI : awayXI,
        attackingSide === "home" ? homeBench : awayBench,
        substitutions,
        attackingSide === "home" ? fastHomeRedCardedPlayers : fastAwayRedCardedPlayers,
        attackingSide,
        minute,
      ).filter((p) => !isGoalkeeper(p.positions));
      const attacker = attackerPool.length
        ? attackerPool[Math.floor(rand() * attackerPool.length)]
        : undefined;
      highlights.push({
        minute,
        team,
        type: "save",
        playerId: gk.id,
        playerName: gk.name,
        detail: buildSaveDetail(gk, attacker),
      });
    }
  };
  addFastSaves(homeXI, homeBench, "home");
  addFastSaves(awayXI, awayBench, "away");

  const addFastWoodwork = (xi: Player[], bench: Player[], team: "home" | "away") => {
    if (rand() > 0.18) return;
    const minute = 3 + Math.floor(rand() * 85);
    const candidates = activePlayersAt(
      xi,
      bench,
      substitutions,
      team === "home" ? fastHomeRedCardedPlayers : fastAwayRedCardedPlayers,
      team,
      minute,
    ).filter(
      (p) => !isGoalkeeper(p.positions),
    );
    if (candidates.length === 0) return;
    const p = candidates[Math.floor(rand() * candidates.length)];
    highlights.push({
      minute,
      team,
      type: "woodwork",
      playerId: p.id,
      playerName: p.name,
      detail: buildWoodworkDetail(p),
    });
  };
  addFastWoodwork(homeXI, homeBench, "home");
  addFastWoodwork(awayXI, awayBench, "away");

  for (const injury of injuries) {
    highlights.push({
      minute: injury.minute ?? 60,
      team: injury.team,
      type: "injury",
      playerId: injury.playerId,
      playerName: injury.playerName,
      detail: injury.reason,
    });
    if (injury.forcedSub && injury.replacementId && injury.replacementName && injury.minute !== undefined) {
      highlights.push({
        minute: injury.minute,
        team: injury.team,
        type: "forced_sub",
        playerId: injury.replacementId,
        playerName: injury.replacementName,
        detail: `Entra por ${injury.playerName} (cambio forzado)`,
      });
    }
  }

  highlights.sort((a, b) => a.minute - b.minute);

  const homeParticipants = participantsFromSubs(homeXI, homeBench, substitutions, "home");
  const awayParticipants = participantsFromSubs(awayXI, awayBench, substitutions, "away");
  const minutesPlayed = {
    ...buildMinutesPlayed(homeXI, homeBench, substitutions, cards, injuries, "home"),
    ...buildMinutesPlayed(awayXI, awayBench, substitutions, cards, injuries, "away"),
  };
  const homeSaves = highlights.filter((h) => h.team === "home" && h.type === "save").length;
  const awaySaves = highlights.filter((h) => h.team === "away" && h.type === "save").length;
  const { ratings, mvp } = computePlayerRatings({
    homeXI: homeParticipants,
    awayXI: awayParticipants,
    homeGoals,
    awayGoals,
    goals: events.map((e) => ({
      team: e.team,
      scorerId: e.scorerId,
      assistId: e.assistId,
      ownGoal: e.type === "own_goal",
    })),
    cards: cards.map((c) => ({
      team: c.team,
      playerId: c.playerId,
      cardType: c.cardType,
      minute: c.minute,
    })),
    minutesPlayed,
    homeSaves,
    awaySaves,
  });

  return {
    homeGoals,
    awayGoals,
    events,
    cards,
    injuries,
    xgHome: lh,
    xgAway: la,
    highlights,
    ratings,
    mvp,
    homeLineup: homeParticipants,
    awayLineup: awayParticipants,
    homeStartingLineup: homeXI,
    awayStartingLineup: awayXI,
    homeFinalLineup: activePlayersAt(homeXI, homeBench, substitutions, new Map(cards.filter((c) => c.team === "home" && c.cardType === "red").map((c) => [c.playerId, c.minute])), "home", 90),
    awayFinalLineup: activePlayersAt(awayXI, awayBench, substitutions, new Map(cards.filter((c) => c.team === "away" && c.cardType === "red").map((c) => [c.playerId, c.minute])), "away", 90),
    homeFormation,
    awayFormation,
    substitutions,
    energyAtEnd: {
      ...calculateEnergyAtEnd(homeXI, homeBench, substitutions, cards, injuries, "home", homeTactics),
      ...calculateEnergyAtEnd(awayXI, awayBench, substitutions, cards, injuries, "away", awayTactics),
    },
  };
}

// Detailed simulation with events and injuries
// NOTE: Stats recording is handled by applyMatchToStats after the simulation
export function simulateMatch(
  home: Team,
  away: Team,
  homeXI: Player[],
  awayXI: Player[],
  opts: {
    homeBench?: Player[];
    awayBench?: Player[];
    homeTactics?: SimTactics | null;
    awayTactics?: SimTactics | null;
    homeFormation?: FormationName;
    awayFormation?: FormationName;
  } = {},
): SimResult {
  const homeBench = opts.homeBench ?? [];
  const awayBench = opts.awayBench ?? [];
  const homeTactics = opts.homeTactics ?? null;
  const awayTactics = opts.awayTactics ?? null;
  const homeFormation = opts.homeFormation ?? "Táctica 4-4-2";
  const awayFormation = opts.awayFormation ?? "Táctica 4-4-2";
  const homeMods = tacticsModifiers(homeTactics);
  const awayMods = tacticsModifiers(awayTactics);

  // Planned CPU substitutions are created before any match events. This makes
  // the match timeline authoritative: once a player leaves, he is no longer
  // eligible for goals, assists, cards, injuries or highlights.
  let substitutions = [
    ...generateTacticalSubs(homeXI, homeBench, "home", new Map(), {
      teamStyle: homeTactics?.style,
      teamStrength: (homeXI.reduce((s, p) => s + p.rating, 0) / Math.max(1, homeXI.length)),
      opponentStrength: (awayXI.reduce((s, p) => s + p.rating, 0) / Math.max(1, awayXI.length)),
      isHome: true,
      seed: `home:${home.name}:${away.name}:${homeXI.map((p) => p.id).join(",")}:${awayXI.map((p) => p.id).join(",")}`,
    }),
    ...generateTacticalSubs(awayXI, awayBench, "away", new Map(), {
      teamStyle: awayTactics?.style,
      teamStrength: (awayXI.reduce((s, p) => s + p.rating, 0) / Math.max(1, awayXI.length)),
      opponentStrength: (homeXI.reduce((s, p) => s + p.rating, 0) / Math.max(1, homeXI.length)),
      isHome: false,
      seed: `away:${home.name}:${away.name}:${homeXI.map((p) => p.id).join(",")}:${awayXI.map((p) => p.id).join(",")}`,
    }),
  ].sort((a, b) => a.minute - b.minute);

  /** Designated taker from the tactics screen, if he is on the pitch. */
  const designated = (
    xi: Player[],
    tactics: SimTactics | null,
    role: "penaltyTakerId" | "freekickTakerId" | "cornerTakerId",
  ): Player | null => {
    const id = tactics?.[role];
    if (!id) return null;
    return xi.find((p) => p.id === id) ?? null;
  };

  // -------------------------------------------------------------------------
  // 1. Cards. Rates are per-player and per-match, calibrated so a typical game
  //    ends with ~2-4 yellows in total and a red card only now and then.
  // -------------------------------------------------------------------------
  const cards: CardEvent[] = [];
  let homeRedCards = 0;
  let awayRedCards = 0;

  const CARD_REASONS = [
    "entrada dura",
    "juego peligroso",
    "protestar",
    "cortar un contragolpe",
    "agarrón",
    "perder tiempo",
    "falta táctica",
  ];
  const RED_REASONS = ["entrada muy dura", "mano en el área", "última falta", "conducta violenta"];

  function simulateTeamCards(xi: Player[], bench: Player[], team: "home" | "away"): number {
    let reds = 0;
    // A high press produces more fouls, a low block fewer.
    const aggression = team === "home" ? homeMods.aggression : awayMods.aggression;
    for (const player of [...xi, ...bench]) {
      // Defenders and defensive midfielders commit more fouls than keepers.
      const base =
        (isGoalkeeper(player.positions)
          ? 0.02
          : isDefensive(player.positions)
            ? 0.115
            : isMidfield(player.positions)
              ? 0.095
              : 0.055) * aggression;

      // Direct red card: rare (~0.35% per player => ~4% per team per match).
      if (rand() < 0.0035) {
        const minute = 15 + Math.floor(rand() * 75);
        const active = activePlayersAt(xi, bench, substitutions, new Map(), team, minute);
        if (!active.some((p) => p.id === player.id)) continue;
        reds++;
        cards.push({
          minute,
          team,
          playerId: player.id,
          playerName: player.name,
          cardType: "red",
          isSecondYellow: false,
          reason: RED_REASONS[Math.floor(rand() * RED_REASONS.length)],
        });
        continue;
      }

      if (rand() >= base) continue;

      const firstMinute = 8 + Math.floor(rand() * 75);
      const activeAtFirst = activePlayersAt(xi, bench, substitutions, new Map(), team, firstMinute);
      if (!activeAtFirst.some((p) => p.id === player.id)) continue;
      cards.push({
        minute: firstMinute,
        team,
        playerId: player.id,
        playerName: player.name,
        cardType: "yellow",
        isSecondYellow: false,
        reason: CARD_REASONS[Math.floor(rand() * CARD_REASONS.length)],
      });

      // Contextual second yellow: only booked players can get one, it becomes
      // more likely the earlier the first yellow arrived and for defenders.
      const timeLeft = Math.max(0, 90 - firstMinute) / 90;
      const secondYellowChance = 0.1 * timeLeft * (isDefensive(player.positions) ? 1.4 : 1);
      if (rand() < secondYellowChance) {
        const secondMinute = Math.min(
          90,
          firstMinute + 5 + Math.floor(rand() * (90 - firstMinute)),
        );
        const activeAtSecond = activePlayersAt(
          xi,
          bench,
          substitutions,
          new Map(),
          team,
          secondMinute,
        );
        if (activeAtSecond.some((p) => p.id === player.id)) {
          reds++;
          cards.push({
            minute: secondMinute,
            team,
            playerId: player.id,
            playerName: player.name,
            cardType: "red",
            isSecondYellow: true,
            reason: "doble amarilla",
          });
        }
      }
    }
    return reds;
  }

  homeRedCards = simulateTeamCards(homeXI, homeBench, "home");
  awayRedCards = simulateTeamCards(awayXI, awayBench, "away");
  cards.sort((a, b) => a.minute - b.minute);

  // Map of red-carded players -> expulsion minute.
  const homeRedCardedPlayers = new Map<string, number>();
  const awayRedCardedPlayers = new Map<string, number>();
  for (const card of cards) {
    if (card.cardType === "red") {
      if (card.team === "home") homeRedCardedPlayers.set(card.playerId, card.minute);
      else awayRedCardedPlayers.set(card.playerId, card.minute);
    }
  }

  // Time-weighted strength: an expelled player only contributes the fraction of
  // the match he actually played.
  function timeWeightedXI(xi: Player[], redCarded: Map<string, number>): Player[] {
    return xi.map((p) => {
      const expulsionMinute = redCarded.get(p.id);
      if (expulsionMinute !== undefined) {
        return { ...p, rating: p.rating * (expulsionMinute / 90) };
      }
      return p;
    });
  }

  /** The designated captain lifts the side slightly while he is on the pitch. */
  function withCaptainBoost(xi: Player[], tactics: SimTactics | null): Player[] {
    const captainId = tactics?.captainId;
    if (!captainId || !xi.some((p) => p.id === captainId)) return xi;
    return xi.map((p) => ({ ...p, rating: p.rating * (p.id === captainId ? 1.03 : 1.008) }));
  }

  const adjustedHomeXI = withCaptainBoost(
    timeWeightedXI(homeXI, homeRedCardedPlayers),
    homeTactics,
  );
  const adjustedAwayXI = withCaptainBoost(
    timeWeightedXI(awayXI, awayRedCardedPlayers),
    awayTactics,
  );

  // -------------------------------------------------------------------------
  // 2. Goals. `expectedGoals` already carries its own variance, so we sample a
  //    plain Poisson here instead of multiplying the lambda a second time
  //    (which used to flatten every result towards a random draw).
  // -------------------------------------------------------------------------
  const { lh, la } = expectedGoals(
    home,
    away,
    adjustedHomeXI,
    adjustedAwayXI,
    homeTactics,
    awayTactics,
  );

  const homeGoalsRaw = poisson(lh);
  const awayGoalsRaw = poisson(la);

  const events: MatchEvent[] = [];
  const highlights: HighlightEvent[] = [];
  const injuries: InjuryEvent[] = [];

  const activeAt = (
    xi: Player[],
    reds: Map<string, number>,
    minute: number,
    team: "home" | "away",
  ) => {
    const active = activePlayersAt(
      xi,
      team === "home" ? homeBench : awayBench,
      substitutions,
      reds,
      team,
      minute,
    );
    return active.filter((p) => {
      const injury = injuries?.find(
        (i) =>
          i.team === team && i.playerId === p.id && i.minute !== undefined && minute > i.minute,
      );
      return !injury;
    });
  };

  // Injuries are generated before goals/highlights so an injured player is
  // immediately removed from the pool of eligible match actions.
  const homeLeagueTeamCount = teamsByLeague(home.league).length;
  const awayLeagueTeamCount = teamsByLeague(away.league).length;
  const homeInj = maybeInjury(
    homeXI,
    "home",
    homeBench,
    substitutions,
    homeRedCardedPlayers,
    homeTactics,
    homeLeagueTeamCount,
  );
  if (homeInj) injuries.push(homeInj);
  const awayInj = maybeInjury(
    awayXI,
    "away",
    awayBench,
    substitutions,
    awayRedCardedPlayers,
    awayTactics,
    awayLeagueTeamCount,
  );
  if (awayInj) injuries.push(awayInj);

  for (const inj of injuries) {
    if (inj.forcedSub && inj.replacementId && inj.replacementName && inj.minute !== undefined) {
      substitutions.push({
        minute: inj.minute,
        team: inj.team,
        playerOutId: inj.playerId,
        playerOutName: inj.playerName,
        playerInId: inj.replacementId,
        playerInName: inj.replacementName,
      });
      highlights.push({
        minute: inj.minute,
        team: inj.team,
        type: "forced_sub",
        playerId: inj.replacementId,
        playerName: inj.replacementName,
        detail: `Entra por ${inj.playerName} (cambio forzado)`,
      });
    }
    highlights.push({
      minute: inj.minute ?? 60,
      team: inj.team,
      type: "injury",
      playerId: inj.playerId,
      playerName: inj.playerName,
      detail: inj.reason,
    });
  }
  substitutions = substitutions.filter((sub) => {
    const injury = injuries.find(
      (i) => i.team === sub.team && i.playerId === sub.playerOutId && i.minute !== undefined,
    );
    return !injury || sub.minute <= (injury.minute as number);
  });
  substitutions.sort((a, b) => a.minute - b.minute);

  // A player who is injured before a booked minute cannot receive that card.
  const validCards = cards.filter((card) => {
    const injury = injuries.find(
      (i) => i.team === card.team && i.playerId === card.playerId && i.minute !== undefined,
    );
    return !injury || card.minute <= (injury.minute as number);
  });
  cards.length = 0;
  cards.push(...validCards);

  // Rebuild red-card maps after the injury validity pass.
  homeRedCardedPlayers.clear();
  awayRedCardedPlayers.clear();
  for (const card of cards) {
    if (card.cardType === "red") {
      if (card.team === "home") homeRedCardedPlayers.set(card.playerId, card.minute);
      else awayRedCardedPlayers.set(card.playerId, card.minute);
    }
  }

  const homeGoalMinutes = Array.from({ length: homeGoalsRaw }, () => goalMinute()).sort(
    (a, b) => a - b,
  );
  const awayGoalMinutes = Array.from({ length: awayGoalsRaw }, () => goalMinute()).sort(
    (a, b) => a - b,
  );

  const finalHomeGoalMinutes: number[] = [];
  const finalAwayGoalMinutes: number[] = [];
  const penaltiesMissed: Array<{ playerId: string }> = [];

  const FOUL_REASONS = ["derriba", "hace falta sobre", "agarra a", "pisa a", "comete mano ante"];

  function buildGoal(
    minute: number,
    team: "home" | "away",
    attackXI: Player[],
    defendXI: Player[],
  ): boolean {
    if (attackXI.length === 0) return false;
    const tactics = team === "home" ? homeTactics : awayTactics;

    // 6% of goals are actually own goals by a defender of the other team.
    if (defendXI.length > 0 && rand() < 0.06) {
      const defenders = defendXI.filter(
        (p) => isDefensive(p.positions) || isGoalkeeper(p.positions),
      );
      const pool = defenders.length > 0 ? defenders : defendXI;
      const unlucky = pool[Math.floor(rand() * pool.length)];
      events.push({
        minute,
        team,
        type: "own_goal",
        scorerId: unlucky.id,
        scorerName: unlucky.name,
      });
      return true;
    }

    // Penalties are generated independently below. Goals must not be the only
    // route into a penalty, otherwise long stretches without goals almost
    // automatically become stretches without penalties.

    // VAR reviews happen AFTER the provisional goal is shown in the live
    // chronicle. The goal is still excluded from the official score unless
    // the review is cleared later.
    const varReview = rand() < 0.07;

    // 6% direct free kicks, taken by the designated free-kick specialist.
    const fkTaker = pickDeadBallTaker(attackXI, tactics, "freekickTakerId");
    if (rand() < 0.06) {
      const shooter = fkTaker ?? pickScorer(attackXI);
      events.push({
        minute,
        team,
        type: "free_kick_goal",
        scorerId: shooter.id,
        scorerName: shooter.name,
        detail: "Falta directa",
      });
      return true;
    }

    const scorer = pickScorer(attackXI);
    // Roughly a fifth of open-play goals come from a corner / dead ball, and
    // those are delivered by the designated corner taker.
    const cornerTaker = pickDeadBallTaker(attackXI, tactics, "cornerTakerId");
    const fromCorner = !!cornerTaker && cornerTaker.id !== scorer.id && rand() < 0.22;
    const assister = fromCorner ? cornerTaker : pickAssister(attackXI, scorer.id);
    events.push({
      minute,
      team,
      type: "goal",
      scorerId: scorer.id,
      scorerName: scorer.name,
      assistId: assister?.id,
      assistName: assister?.name,
      detail: fromCorner ? "A la salida de un córner" : undefined,
    });

    if (varReview) {
      highlights.push({
        minute,
        team,
        type: "var_disallowed",
        playerId: scorer.id,
        playerName: scorer.name,
        detail:
          rand() < 0.6
            ? "Gol anulado por fuera de juego (VAR)"
            : "Gol anulado por falta previa (VAR)",
      });
      return false;
    }
    return true;
  }

  const penaltyRating = (player: Player): number => {
    const stats = getPlayerShootingStats(player.id);
    const direct = Number((player as any).penaltyRating ?? (player as any).penalties ?? 0);
    const penalties = direct || stats.penalties;
    // La elección del lanzador no depende solo de "Penalties": también
    // ponderamos remate, definición y compostura para aproximar la calidad
    // real de tiro del futbolista.
    return (penalties * 0.45) + (stats.finishing * 0.22) +
      (stats.shooting * 0.13) + (stats.composure * 0.10) +
      (stats.shotPower * 0.05) + (stats.volleys * 0.03) +
      (stats.longShots * 0.02);
  };

  const passingRating = (player: Player): number =>
    Number((player as any).shortPassing ?? 0) * 0.55 + Number((player as any).longPassing ?? 0) * 0.45;

  const pickDeadBallTaker = (
    xi: Player[],
    tactics: SimTactics | null,
    key: "freekickTakerId" | "cornerTakerId",
  ): Player | undefined => {
    const active = xi.filter((p) => !isGoalkeeper(p.positions));
    if (!active.length) return undefined;
    const designatedPlayer = designated(xi, tactics, key);
    return (
      designatedPlayer ??
      active.slice().sort((a, b) => passingRating(b) - passingRating(a) || b.rating - a.rating)[0]
    );
  };

  const pickPenaltyTaker = (xi: Player[], tactics: SimTactics | null): Player | undefined => {
    const active = xi.filter((p) => !isGoalkeeper(p.positions));
    if (!active.length) return undefined;
    return designated(xi, tactics, "penaltyTakerId") ??
      active.slice().sort((a, b) => penaltyTakerScore(b) - penaltyTakerScore(a) || b.rating - a.rating)[0];
  };

  const pickAvailableMinute = (team: "home" | "away") => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const minute = 8 + Math.floor(rand() * 81);
      const occupied = events.some((e) => e.minute === minute && e.team === team) ||
        highlights.some((h) => h.minute === minute && h.team === team && ["big_chance", "woodwork", "injury"].includes(h.type));
      if (!occupied) return minute;
    }
    return goalMinute(8, 88);
  };

  const generatePenaltyForTeam = (team: "home" | "away", xi: Player[], bench: Player[], defendXI: Player[], defendReds: Map<string, number>, tactics: SimTactics | null, attackStrength: number, defendStrength: number, isHome: boolean) => {
    const strengthGap = attackStrength - defendStrength;
    const style = tactics?.style ?? "balanced";
    const styleBoost = style === "offensive" ? 0.018 : style === "defensive" ? -0.012 : 0;
    const homeBoost = isHome ? 0.012 : 0;
    const awardChance = Math.max(0.13, Math.min(0.40, 0.22 + strengthGap * 0.006 + styleBoost + homeBoost));
    if (rand() >= awardChance) return false;

    const minute = pickAvailableMinute(team);
    const attackReds = team === "home" ? homeRedCardedPlayers : awayRedCardedPlayers;
    const attackActive = activePlayersAt(xi, bench, substitutions, attackReds, team, minute);
    const defendActive = activePlayersAt(
      defendXI,
      team === "home" ? awayBench : homeBench,
      substitutions,
      defendReds,
      team === "home" ? "away" : "home",
      minute,
    );
    const taker = pickPenaltyTaker(attackActive, tactics);
    if (!taker) return false;

    const foulPool = defendActive.filter((p) => !isGoalkeeper(p.positions));
    const offender = foulPool[Math.floor(rand() * Math.max(1, foulPool.length))];
    const foulVerb = FOUL_REASONS[Math.floor(rand() * FOUL_REASONS.length)];
    const conceded = offender
      ? `Penalti: ${offender.name} ${foulVerb} ${taker.name}`
      : "Penalti señalado";
    const scored = rand() < Math.min(0.91, Math.max(0.68, 0.78 + (penaltyRating(taker) - 75) * 0.005));

    if (scored) {
      events.push({ minute, team, type: "penalty_goal", scorerId: taker.id, scorerName: taker.name, detail: conceded });
      if (team === "home") finalHomeGoalMinutes.push(minute);
      else finalAwayGoalMinutes.push(minute);
    } else {
      penaltiesMissed.push({ playerId: taker.id });
      const keeper = defendActive.find((p) => isGoalkeeper(p.positions));
      highlights.push({ minute, team, type: "penalty_missed", playerId: taker.id, playerName: taker.name, detail: keeper ? `${conceded} — lo falla, para ${keeper.name}` : `${conceded} — lo falla` });
    }
    return true;
  };

  for (const minute of homeGoalMinutes) {
    const attack = activeAt(homeXI, homeRedCardedPlayers, minute, "home");
    const defend = activeAt(awayXI, awayRedCardedPlayers, minute, "away");
    if (buildGoal(minute, "home", attack, defend)) finalHomeGoalMinutes.push(minute);
  }
  for (const minute of awayGoalMinutes) {
    const attack = activeAt(awayXI, awayRedCardedPlayers, minute, "away");
    const defend = activeAt(homeXI, homeRedCardedPlayers, minute, "home");
    if (buildGoal(minute, "away", attack, defend)) finalAwayGoalMinutes.push(minute);
  }

  // Penalty incidents are independent from goal generation, so penalty
  // frequency reflects attacking dominance rather than “would-be goals”.
  const homeAttStrength = calculateAttackStrength(adjustedHomeXI);
  const awayAttStrength = calculateAttackStrength(adjustedAwayXI);
  const homeDefStrength = calculateDefenseStrength(adjustedHomeXI);
  const awayDefStrength = calculateDefenseStrength(adjustedAwayXI);
  generatePenaltyForTeam("home", homeXI, homeBench, awayXI, awayRedCardedPlayers, homeTactics, homeAttStrength, awayDefStrength, true);
  generatePenaltyForTeam("away", awayXI, awayBench, homeXI, homeRedCardedPlayers, awayTactics, awayAttStrength, homeDefStrength, false);

  const homeGoals = finalHomeGoalMinutes.length;
  const awayGoals = finalAwayGoalMinutes.length;
  events.sort((a, b) => a.minute - b.minute);

  // -------------------------------------------------------------------------
  // 4. Match statistics (possession, shots, corners, fouls, passes, live xG).
  // -------------------------------------------------------------------------
  const homeStrength = calculateActiveOVR(homeXI);
  const awayStrength = calculateActiveOVR(awayXI);
  const stats = buildMatchStats({
    xgHome: lh,
    xgAway: la,
    homeGoals,
    awayGoals,
    homeGoalMinutes: finalHomeGoalMinutes,
    awayGoalMinutes: finalAwayGoalMinutes,
    homeStrength,
    awayStrength,
  });

  // -------------------------------------------------------------------------
  // 5. Extra highlights: saves and woodwork, tied to the generated stats.
  // -------------------------------------------------------------------------
  const addSaves = (team: "home" | "away", count: number) => {
    const shown = Math.min(count, 4);
    const xi = team === "home" ? homeXI : awayXI;
    for (let i = 0; i < shown; i++) {
      const minute = 3 + Math.floor(rand() * 85);
      const activeKeeperPool = activeAt(
        xi,
        team === "home" ? homeRedCardedPlayers : awayRedCardedPlayers,
        minute,
        team,
      );
      const gk = activeKeeperPool.find((p) => isGoalkeeper(p.positions));
      if (!gk) continue;
      const attackingSide = team === "home" ? "away" : "home";
      const attackerPool = activeAt(
        attackingSide === "home" ? homeXI : awayXI,
        attackingSide === "home" ? homeRedCardedPlayers : awayRedCardedPlayers,
        minute,
        attackingSide,
      ).filter((p) => !isGoalkeeper(p.positions));
      const attacker = attackerPool.length
        ? attackerPool[Math.floor(rand() * attackerPool.length)]
        : undefined;
      highlights.push({
        minute,
        team,
        type: "save",
        playerId: gk.id,
        playerName: gk.name,
        detail: buildSaveDetail(gk, attacker),
      });
    }
  };
  addSaves("home", stats.home.saves);
  addSaves("away", stats.away.saves);

  const addWoodwork = (team: "home" | "away") => {
    if (rand() > 0.18) return;
    const xi = team === "home" ? homeXI : awayXI;
    const minute = 3 + Math.floor(rand() * 85);
    const active = activeAt(
      xi,
      team === "home" ? homeRedCardedPlayers : awayRedCardedPlayers,
      minute,
      team,
    );
    const candidates = active.filter((p) => !isGoalkeeper(p.positions));
    if (candidates.length === 0) return;
    const p = candidates[Math.floor(rand() * candidates.length)];
    highlights.push({
      minute,
      team,
      type: "woodwork",
      playerId: p.id,
      playerName: p.name,
      detail: buildWoodworkDetail(p),
    });
  };
  addWoodwork("home");
  addWoodwork("away");

  highlights.sort((a, b) => a.minute - b.minute);

  // -------------------------------------------------------------------------
  // 6. Player ratings (1-10) and MVP.
  // -------------------------------------------------------------------------
  const minutesPlayed: Record<string, number> = {
    ...buildMinutesPlayed(homeXI, homeBench, substitutions, cards, injuries, "home"),
    ...buildMinutesPlayed(awayXI, awayBench, substitutions, cards, injuries, "away"),
  };

  const homeParticipants = participantsFromSubs(homeXI, homeBench, substitutions, "home");
  const awayParticipants = participantsFromSubs(awayXI, awayBench, substitutions, "away");

  const { ratings, mvp } = computePlayerRatings({
    homeXI: homeParticipants,
    awayXI: awayParticipants,
    homeGoals,
    awayGoals,
    goals: events.map((e) => ({
      team: e.team,
      scorerId: e.scorerId,
      assistId: e.assistId,
      ownGoal: e.type === "own_goal",
    })),
    cards: cards.map((c) => ({
      team: c.team,
      playerId: c.playerId,
      cardType: c.cardType,
      minute: c.minute,
    })),
    minutesPlayed,
    homeSaves: stats.home.saves,
    awaySaves: stats.away.saves,
    penaltiesMissed,
  });

  // -------------------------------------------------------------------------
  // 7. Substitutions. The tactical substitutions were planned before the
  // event simulation so all previous sections can respect their timing.
  // -------------------------------------------------------------------------
  substitutions = substitutions.filter((sub) => {
    const redAt =
      sub.team === "home"
        ? homeRedCardedPlayers.get(sub.playerOutId)
        : awayRedCardedPlayers.get(sub.playerOutId);
    return redAt === undefined || redAt > sub.minute;
  });

  return {
    homeGoals,
    awayGoals,
    events,
    cards,
    injuries,
    xgHome: lh,
    xgAway: la,
    highlights,
    stats,
    ratings,
    mvp,
    homeLineup: homeXI,
    awayLineup: awayXI,
    homeStartingLineup: homeXI,
    awayStartingLineup: awayXI,
    homeFinalLineup: activePlayersAt(homeXI, homeBench, substitutions, new Map(cards.filter((c) => c.team === "home" && c.cardType === "red").map((c) => [c.playerId, c.minute])), "home", 90),
    awayFinalLineup: activePlayersAt(awayXI, awayBench, substitutions, new Map(cards.filter((c) => c.team === "away" && c.cardType === "red").map((c) => [c.playerId, c.minute])), "away", 90),
    homeFormation,
    awayFormation,
    substitutions,
    energyAtEnd: {
      ...calculateEnergyAtEnd(homeXI, homeBench, substitutions, cards, injuries, "home", homeTactics),
      ...calculateEnergyAtEnd(awayXI, awayBench, substitutions, cards, injuries, "away", awayTactics),
    },
  };
}

// Simulate extra time (90-120 minutes) - lower intensity than regular time
export function simulateExtraTime(
  home: Team,
  away: Team,
  homeXI: Player[],
  awayXI: Player[],
  opts: {
    homeBench?: Player[];
    awayBench?: Player[];
    regularSubstitutions?: SubstitutionEvent[];
    regularCards?: CardEvent[];
    homeTactics?: SimTactics | null;
    awayTactics?: SimTactics | null;
  } = {},
): { homeGoals: number; awayGoals: number; events: MatchEvent[]; substitutions: SubstitutionEvent[] } {
  const homeBench = opts.homeBench ?? [];
  const awayBench = opts.awayBench ?? [];
  const regularSubs = opts.regularSubstitutions ?? [];
  const regularCards = opts.regularCards ?? [];
  const homeRedCards = new Map<string, number>();
  const awayRedCards = new Map<string, number>();
  for (const card of regularCards) {
    if (card.cardType !== "red") continue;
    if (card.team === "home") homeRedCards.set(card.playerId, card.minute);
    else awayRedCards.set(card.playerId, card.minute);
  }

  const homeSubs = generateExtraTimeSubs(homeXI, homeBench, "home", regularSubs, regularCards, {
    teamStyle: opts.homeTactics?.style,
    teamStrength: homeXI.reduce((sum, p) => sum + p.rating, 0) / Math.max(1, homeXI.length),
    opponentStrength: awayXI.reduce((sum, p) => sum + p.rating, 0) / Math.max(1, awayXI.length),
    seed: `et:home:${home.name}:${away.name}:${homeXI.map((p) => p.id).join(",")}`,
  });
  const awaySubs = generateExtraTimeSubs(awayXI, awayBench, "away", regularSubs, regularCards, {
    teamStyle: opts.awayTactics?.style,
    teamStrength: awayXI.reduce((sum, p) => sum + p.rating, 0) / Math.max(1, awayXI.length),
    opponentStrength: homeXI.reduce((sum, p) => sum + p.rating, 0) / Math.max(1, homeXI.length),
    seed: `et:away:${home.name}:${away.name}:${awayXI.map((p) => p.id).join(",")}`,
  });
  const substitutions = [...homeSubs, ...awaySubs].sort((a, b) => a.minute - b.minute);
  const allSubs = [...regularSubs, ...substitutions];

  const activeHome90 = activePlayersAt(homeXI, homeBench, regularSubs, homeRedCards, "home", 90);
  const activeAway90 = activePlayersAt(awayXI, awayBench, regularSubs, awayRedCards, "away", 90);
  const etHomeAvg = activeHome90.length
    ? activeHome90.reduce((s, p) => s + p.rating, 0) / activeHome90.length
    : 60;
  const etAwayAvg = activeAway90.length
    ? activeAway90.reduce((s, p) => s + p.rating, 0) / activeAway90.length
    : 60;

  const { lh, la } = expectedGoals(
    home,
    away,
    activeHome90.map((p) => ({ ...p, rating: p.rating * 0.96 })),
    activeAway90.map((p) => ({ ...p, rating: p.rating * 0.96 })),
    opts.homeTactics ?? null,
    opts.awayTactics ?? null,
  );
  const etXGHome = Math.max(0.03, lh * (0.34 + Math.min(0.10, activeHome90.length * 0.005) + Math.max(0, etHomeAvg - 75) * 0.001));
  const etXGAway = Math.max(0.03, la * (0.34 + Math.min(0.10, activeAway90.length * 0.005) + Math.max(0, etAwayAvg - 75) * 0.001));

  const homeGoals = poisson(etXGHome);
  const awayGoals = poisson(etXGAway);
  const events: MatchEvent[] = [];

  const pickETScorer = (team: "home" | "away", minute: number) => {
    const active = activePlayersAt(
      team === "home" ? homeXI : awayXI,
      team === "home" ? homeBench : awayBench,
      allSubs,
      team === "home" ? homeRedCards : awayRedCards,
      team,
      minute,
    ).filter((p) => !isGoalkeeper(p.positions));
    return active.length > 0 ? fastPickScorerWeighted(active) : (team === "home" ? homeXI[0] : awayXI[0]);
  };

  for (let i = 0; i < homeGoals; i++) {
    const minute = 91 + Math.floor(rand() * 30);
    const scorer = pickETScorer("home", minute);
    if (!scorer) continue;
    const active = activePlayersAt(homeXI, homeBench, allSubs, homeRedCards, "home", minute).filter((p) => !isGoalkeeper(p.positions));
    const assister = active.find((p) => p.id !== scorer.id) ?? null;
    events.push({ minute, team: "home", type: "goal", scorerId: scorer.id, scorerName: scorer.name, assistId: assister?.id, assistName: assister?.name });
  }
  for (let i = 0; i < awayGoals; i++) {
    const minute = 91 + Math.floor(rand() * 30);
    const scorer = pickETScorer("away", minute);
    if (!scorer) continue;
    const active = activePlayersAt(awayXI, awayBench, allSubs, awayRedCards, "away", minute).filter((p) => !isGoalkeeper(p.positions));
    const assister = active.find((p) => p.id !== scorer.id) ?? null;
    events.push({ minute, team: "away", type: "goal", scorerId: scorer.id, scorerName: scorer.name, assistId: assister?.id, assistName: assister?.name });
  }
  events.sort((a, b) => a.minute - b.minute);

  return { homeGoals, awayGoals, events, substitutions };
}

// Simulate penalty shootout (ABAB format, 5 rounds, sudden death)
export function simulatePenaltyShootout(
  homeXI: Player[],
  awayXI: Player[],
): {
  homeGoals: number;
  awayGoals: number;
  shootout: Array<{ team: "home" | "away"; scored: boolean; playerId?: string }>;
} {
  const shootout: Array<{ team: "home" | "away"; scored: boolean; playerId?: string }> = [];

  // Los lanzadores de la tanda se ordenan por calidad de tiro, no por OVR
  // bruto: el especialista en penaltis/remate debe ser quien lidere la lista.
  const homeTakers = [...homeXI].sort((a, b) =>
    penaltyTakerScore(b) - penaltyTakerScore(a) || b.rating - a.rating,
  );
  const awayTakers = [...awayXI].sort((a, b) =>
    penaltyTakerScore(b) - penaltyTakerScore(a) || b.rating - a.rating,
  );

  // Penalty success rate: 50% for each team (as requested)
  const getPenaltySuccess = () => rand() < 0.5;

  let homeGoals = 0;
  let awayGoals = 0;
  let homeTakerIndex = 0;
  let awayTakerIndex = 0;

  // First 5 rounds (ABAB format). After every kick, check whether the
  // trailing side still has enough remaining kicks to catch up. This also
  // handles the important case where one team misses its fifth kick: the
  // other team may already be mathematically confirmed as the winner, so its
  // own fifth kick must NOT be taken.
  for (let round = 0; round < 5; round++) {
    // Home team penalty
    const homeTaker = homeTakers[homeTakerIndex % homeTakers.length];
    const homeScored = getPenaltySuccess();
    shootout.push({ team: "home", scored: homeScored, playerId: homeTaker.id });
    if (homeScored) homeGoals++;
    homeTakerIndex++;

    // Remaining home kicks in the regular five-kick phase.
    const homeRemaining = 5 - (round + 1);
    const awayRemaining = 5 - round;

    // If the away side is already ahead by more than home can possibly make
    // up with its remaining kicks, the shootout ends before the next kick.
    if (awayGoals > homeGoals + homeRemaining) break;

    // The home side may already be mathematically ahead, but the away side
    // still has its kick in this pair and can therefore tie. Only stop here
    // when the away side cannot catch up.
    if (homeGoals > awayGoals + awayRemaining) break;

    // Away team penalty
    const awayTaker = awayTakers[awayTakerIndex % awayTakers.length];
    const awayScored = getPenaltySuccess();
    shootout.push({ team: "away", scored: awayScored, playerId: awayTaker.id });
    if (awayScored) awayGoals++;
    awayTakerIndex++;

    const awayStillRemaining = 5 - (round + 1);
    const homeStillRemaining = 5 - (round + 1);

    // After the away kick, check both mathematical clinching conditions before
    // starting another round.
    if (homeGoals > awayGoals + awayStillRemaining) break;
    if (awayGoals > homeGoals + homeStillRemaining) break;
  }

  // Sudden death: both teams must take one penalty in each pair. A goal by
  // the first taker does NOT finish the shootout because the second taker can
  // still equalise; the winner is decided only after the pair is complete.
  while (homeGoals === awayGoals) {
    const homeTaker = homeTakers[homeTakerIndex % homeTakers.length];
    const homeScored = getPenaltySuccess();
    shootout.push({ team: "home", scored: homeScored, playerId: homeTaker.id });
    if (homeScored) homeGoals++;
    homeTakerIndex++;

    const awayTaker = awayTakers[awayTakerIndex % awayTakers.length];
    const awayScored = getPenaltySuccess();
    shootout.push({ team: "away", scored: awayScored, playerId: awayTaker.id });
    if (awayScored) awayGoals++;
    awayTakerIndex++;

    if (homeGoals !== awayGoals) break;
  }

  return { homeGoals, awayGoals, shootout };
}

// Simulate a full cup match with extra time and penalties
export function simulateCupMatch(
  home: Team,
  away: Team,
  homeXI: Player[],
  awayXI: Player[],
  opts: {
    homeBench?: Player[];
    awayBench?: Player[];
    homeTactics?: SimTactics | null;
    awayTactics?: SimTactics | null;
    homeFormation?: FormationName;
    awayFormation?: FormationName;
  } = {},
): SimResult {
  // Simulate regular time (90 minutes)
  const regularResult = simulateMatch(home, away, homeXI, awayXI, opts);

  // Check if it's a draw - if so, go to extra time
  if (regularResult.homeGoals === regularResult.awayGoals) {
    const regularSubstitutions = regularResult.substitutions ?? [];
    const extraTimeResult = simulateExtraTime(home, away, homeXI, awayXI, {
      homeBench: opts.homeBench ?? [],
      awayBench: opts.awayBench ?? [],
      regularSubstitutions,
      regularCards: regularResult.cards ?? [],
      homeTactics: opts.homeTactics ?? null,
      awayTactics: opts.awayTactics ?? null,
    });
    const totalHome = regularResult.homeGoals + extraTimeResult.homeGoals;
    const combinedSubstitutions = [...regularSubstitutions, ...(extraTimeResult.substitutions ?? [])].sort((a, b) => a.minute - b.minute);
    const homeRedCarded120 = new Map<string, number>(regularResult.cards.filter((c) => c.team === "home" && c.cardType === "red").map((c) => [c.playerId, c.minute]));
    const awayRedCarded120 = new Map<string, number>(regularResult.cards.filter((c) => c.team === "away" && c.cardType === "red").map((c) => [c.playerId, c.minute]));
    const finalHomeLineup120 = activePlayersAt(homeXI, opts.homeBench ?? [], combinedSubstitutions, homeRedCarded120, "home", 120);
    const finalAwayLineup120 = activePlayersAt(awayXI, opts.awayBench ?? [], combinedSubstitutions, awayRedCarded120, "away", 120);
    const totalAway = regularResult.awayGoals + extraTimeResult.awayGoals;

    // If still tied after extra time, go to penalties
    if (totalHome === totalAway) {
      const penaltyResult = simulatePenaltyShootout(finalHomeLineup120, finalAwayLineup120);

      // Combine all results, preserving lineups/formation/ratings/mvp from regular time
      return {
        ...regularResult,
        events: [...regularResult.events, ...extraTimeResult.events],
        extraTime: {
          homeGoals: extraTimeResult.homeGoals,
          awayGoals: extraTimeResult.awayGoals,
          events: extraTimeResult.events,
          substitutions: extraTimeResult.substitutions,
        },
        substitutions: combinedSubstitutions,
        homeFinalLineup: finalHomeLineup120,
        awayFinalLineup: finalAwayLineup120,
        penalties: {
          homeGoals: penaltyResult.homeGoals,
          awayGoals: penaltyResult.awayGoals,
          shootout: penaltyResult.shootout,
        },
        energyAtEnd: {
          ...calculateEnergyAtEnd(homeXI, opts.homeBench ?? [], combinedSubstitutions, regularResult.cards ?? [], regularResult.injuries ?? [], "home", opts.homeTactics, 120),
          ...calculateEnergyAtEnd(awayXI, opts.awayBench ?? [], combinedSubstitutions, regularResult.cards ?? [], regularResult.injuries ?? [], "away", opts.awayTactics, 120),
        },
      };
    } else {
      // Match ended in extra time with a winner
      return {
        ...regularResult,
        events: [...regularResult.events, ...extraTimeResult.events],
        extraTime: {
          homeGoals: extraTimeResult.homeGoals,
          awayGoals: extraTimeResult.awayGoals,
          events: extraTimeResult.events,
          substitutions: extraTimeResult.substitutions,
        },
        substitutions: combinedSubstitutions,
        homeFinalLineup: finalHomeLineup120,
        awayFinalLineup: finalAwayLineup120,
        energyAtEnd: {
          ...calculateEnergyAtEnd(homeXI, opts.homeBench ?? [], combinedSubstitutions, regularResult.cards ?? [], regularResult.injuries ?? [], "home", opts.homeTactics, 120),
          ...calculateEnergyAtEnd(awayXI, opts.awayBench ?? [], combinedSubstitutions, regularResult.cards ?? [], regularResult.injuries ?? [], "away", opts.awayTactics, 120),
        },
      };
    }
  } else {
    // Match ended in regular time with a winner
    return regularResult;
  }
}

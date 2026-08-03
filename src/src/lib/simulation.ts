import { Team } from "@/data/teams";
import { Player } from "@/data/players";
import {
  buildMatchStats,
  computePlayerRatings,
  type MatchStats,
  type PlayerRating,
} from "@/lib/matchStats";
import { tacticsModifiers, type TeamTactics } from "@/lib/teamTactics";

export type { MatchStats, PlayerRating };

/**
 * Tactics as configured by the manager in "Editar alineación / Tácticas".
 * The engine honours both the play style (which changes how many chances the
 * team creates and concedes) and the designated set-piece takers / captain.
 */
export type SimTactics = Partial<TeamTactics>;

function rand(): number { return Math.random(); }


// Weighted scorer pick considering position and OVR for fast simulation
function fastPickScorerWeighted(xi: Player[]): Player {
  const candidates = xi.filter((p) => p.position !== "GK");
  if (candidates.length === 0) return xi[0];
  
  // Weight = position factor * (rating / 70) to favor high-OVR players
  const weights = candidates.map((p) => {
    const posFactor = p.position === "FWD" ? 5 : p.position === "MID" ? 2 : 0.5;
    const ratingFactor = p.rating / 70; // Normalize around 70
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
  const candidates = xi.filter((p) => p.id !== scorerId && p.position !== "GK");
  if (candidates.length === 0) return null;
  
  // Weight toward midfielders and high-OVR players
  const weights = candidates.map((p) => {
    const posFactor = p.position === "MID" ? 3 : p.position === "FWD" ? 2 : 1;
    const ratingFactor = p.rating / 70;
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
  let k = 0; let p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

const HOME_ADVANTAGE = 0.25;

// Calculate the dynamic average OVR of exactly 11 players on the pitch
export function calculateActiveOVR(activePlayers: Player[]): number {
  if (activePlayers.length === 0) return 70; // Fallback
  const sum = activePlayers.reduce((s, p) => s + p.rating, 0);
  return sum / activePlayers.length;
}

// Calculate attack strength from XI (forwards and midfielders weighted)
function calculateAttackStrength(xi: Player[]): number {
  if (xi.length === 0) return 65;
  const forwards = xi.filter(p => p.position === "FWD");
  const mids = xi.filter(p => p.position === "MID");
  const defenders = xi.filter(p => p.position === "DEF");
  
  // Attack is heavily weighted by forwards (70%), midfielders (25%), defenders (5%)
  const fwdAvg = forwards.length > 0 ? forwards.reduce((s, p) => s + p.rating, 0) / forwards.length : 0;
  const midAvg = mids.length > 0 ? mids.reduce((s, p) => s + p.rating, 0) / mids.length : 0;
  const defAvg = defenders.length > 0 ? defenders.reduce((s, p) => s + p.rating, 0) / defenders.length : 0;
  
  return (fwdAvg * 0.7) + (midAvg * 0.25) + (defAvg * 0.05);
}

// Calculate defense strength from XI (defenders and goalkeepers weighted)
function calculateDefenseStrength(xi: Player[]): number {
  if (xi.length === 0) return 65;
  const goalkeepers = xi.filter(p => p.position === "GK");
  const defenders = xi.filter(p => p.position === "DEF");
  const mids = xi.filter(p => p.position === "MID");
  
  // Defense is heavily weighted by defenders (60%), goalkeepers (25%), midfielders (15%)
  const gkAvg = goalkeepers.length > 0 ? goalkeepers.reduce((s, p) => s + p.rating, 0) / goalkeepers.length : 0;
  const defAvg = defenders.length > 0 ? defenders.reduce((s, p) => s + p.rating, 0) / defenders.length : 0;
  const midAvg = mids.length > 0 ? mids.reduce((s, p) => s + p.rating, 0) / mids.length : 0;
  
  return (defAvg * 0.6) + (gkAvg * 0.25) + (midAvg * 0.15);
}

// Team form factor from XI's average morale+form (0.85 - 1.15)
function teamMomentum(xi: Player[]): number {
  if (xi.length === 0) return 1;
  const sum = xi.reduce((s, p) => {
    const formAvg = p.formHistory.length === 0 ? 5 : p.formHistory.reduce((a, b) => a + b, 0) / p.formHistory.length;
    return s + (p.morale * 0.5 + formAvg * 10 * 0.5);
  }, 0);
  const avg = sum / xi.length; // 0-100 scale
  return 0.85 + (avg / 100) * 0.3; // 0.85..1.15
}

export function expectedGoals(
  home: Team,
  away: Team,
  homeXI: Player[] = [],
  awayXI: Player[] = [],
  homeTactics?: SimTactics | null,
  awayTactics?: SimTactics | null,
): { lh: number; la: number } {
  // Tactics (play style / pressure / defensive line) chosen by the manager.
  const hMod = tacticsModifiers(homeTactics ?? null);
  const aMod = tacticsModifiers(awayTactics ?? null);

  // Use dynamic attack/defense strength from actual XI instead of static team ratings
  // Apply 5% home advantage buff to home team's attack strength
  const homeAtt = (calculateAttackStrength(homeXI) || 65) * 1.05 * hMod.attack;
  const homeDef = (calculateDefenseStrength(homeXI) || 65) * hMod.defense;
  const awayAtt = (calculateAttackStrength(awayXI) || 65) * aMod.attack;
  const awayDef = (calculateDefenseStrength(awayXI) || 65) * aMod.defense;
  
  const homeDiff = homeAtt - awayDef;
  const awayDiff = awayAtt - homeDef;
  const mh = teamMomentum(homeXI);
  const ma = teamMomentum(awayXI);
  
  // Progressive weight for OVR difference - every 2 points has increasingly pronounced effect
  // Uses quadratic scaling for more dramatic impact at higher differences
  const homeProgressiveFactor = 0.10 + (Math.abs(homeDiff) / 100) * 0.15;
  const awayProgressiveFactor = 0.10 + (Math.abs(awayDiff) / 100) * 0.15;
  
  const baseHome = 1.3 + homeDiff * homeProgressiveFactor + HOME_ADVANTAGE;
  const baseAway = 1.3 + awayDiff * awayProgressiveFactor;
  
  // Add randomness factor to allow for upsets (David vs Goliath scenarios)
  // Uses normal distribution with higher variance to enable surprises
  const homeRandom = (rand() - 0.5) * 0.8; // ±0.4 variance
  const awayRandom = (rand() - 0.5) * 0.8;
  
  // Apply momentum and randomness
  const lh = Math.max(0.3, (baseHome + homeRandom) * mh);
  const la = Math.max(0.3, (baseAway + awayRandom) * ma);
  
  return { lh, la };
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
  reason: string;
  /** Exact minute of the injury. */
  minute?: number;
  /** Player who came on for the injured one, when a sub was available. */
  replacementId?: string;
  replacementName?: string;
  forcedSub?: boolean;
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
  };
  penalties?: {
    homeGoals: number;
    awayGoals: number;
    shootout: Array<{ team: 'home' | 'away'; scored: boolean; playerId?: string }>;
  };
};

function pickScorer(xi: Player[]): Player {
  const candidates = xi.filter((p) => p.position !== "GK");
  const weights = candidates.map((p) => {
    const posBonus = p.position === "FWD" ? 5 : p.position === "MID" ? 1.6 : 0.4;
    const formAvg = p.formHistory.length === 0 ? 5 : p.formHistory.reduce((a, b) => a + b, 0) / p.formHistory.length;
    const formMul = 0.7 + (formAvg / 10) * 0.6; // 0.7..1.3
    return Math.pow(p.rating / 70, 2) * posBonus * formMul;
  });
  return weightedPick(candidates, weights);
}

function pickAssister(xi: Player[], scorerId: string): Player | null {
  if (rand() > 0.72) return null;
  const candidates = xi.filter((p) => p.id !== scorerId && p.position !== "GK");
  if (candidates.length === 0) return null;
  const weights = candidates.map((p) => {
    const posBonus = p.position === "MID" ? 3 : p.position === "FWD" ? 2 : 1;
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

const INJURY_REASONS = [
  "lesión muscular", "esguince de tobillo", "contractura", "lesión de rodilla",
  "fractura", "rotura fibrilar", "sobrecarga", "golpe en el partido",
];

function maybeInjury(
  xi: Player[],
  team: "home" | "away",
  bench: Player[] = [],
): InjuryEvent | null {
  if (rand() > 0.06) return null;
  const victim = xi[Math.floor(rand() * xi.length)];
  if (!victim) return null;
  const weeks = 1 + Math.floor(rand() * 5);
  const minute = 5 + Math.floor(rand() * 80);

  // A forced substitution happens whenever a bench player of a compatible
  // profile is available and the injury happens before the 88th minute.
  const candidates = bench.filter((p) => p.id !== victim.id);
  const samePos = candidates.filter((p) => p.position === victim.position);
  const replacement = (samePos.length > 0 ? samePos : candidates)
    .slice()
    .sort((a, b) => b.rating - a.rating)[0];

  return {
    team,
    playerId: victim.id,
    playerName: victim.name,
    weeks,
    minute,
    reason: INJURY_REASONS[Math.floor(rand() * INJURY_REASONS.length)],
    forcedSub: !!replacement && minute < 88,
    replacementId: replacement && minute < 88 ? replacement.id : undefined,
    replacementName: replacement && minute < 88 ? replacement.name : undefined,
  };
}

/**
 * Goals are not uniformly distributed across a match: there are more goals in
 * the second half and a clear spike in the closing minutes.
 */
function goalMinute(from = 1, to = 90): number {
  const span = to - from + 1;
  const r = rand();
  // Skew towards the end of the match (quadratic-ish bias).
  const skewed = 1 - Math.pow(1 - r, 1.35);
  return from + Math.min(span - 1, Math.floor(skewed * span));
}

// Ultra-fast simulation for bulk matchdays (no detailed events, just results)
// NOTE: Stats recording is handled by applyMatchToStats after the simulation
export function simulateMatchFast(
  home: Team, away: Team, homeXI: Player[], awayXI: Player[]
): SimResult {
  const { lh, la } = expectedGoals(home, away, homeXI, awayXI);

  // Poisson keeps the goal distribution realistic and, unlike the previous
  // implementation, does NOT force every fast-simulated match to end in a draw.
  const homeGoals = poisson(lh);
  const awayGoals = poisson(la);

  // Minimal events - with weighted scorer selection and assists
  // Stats are recorded later by applyMatchToStats to avoid duplicates
  const events: MatchEvent[] = [];
  
  // Home team goals
  for (let i = 0; i < homeGoals; i++) {
    const scorer = fastPickScorerWeighted(homeXI);
    const assister = fastPickAssister(homeXI, scorer.id);
    
    events.push({
      minute: goalMinute(), team: "home", type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
      assistId: assister?.id, assistName: assister?.name,
    });
  }
  
  // Away team goals
  for (let i = 0; i < awayGoals; i++) {
    const scorer = fastPickScorerWeighted(awayXI);
    const assister = fastPickAssister(awayXI, scorer.id);
    
    events.push({
      minute: goalMinute(), team: "away", type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
      assistId: assister?.id, assistName: assister?.name,
    });
  }

  events.sort((a, b) => a.minute - b.minute);

  // No injuries or cards in fast mode
  return { homeGoals, awayGoals, events, cards: [], injuries: [], xgHome: lh, xgAway: la };
}

// Detailed simulation with events and injuries
// NOTE: Stats recording is handled by applyMatchToStats after the simulation
export function simulateMatch(
  home: Team, away: Team, homeXI: Player[], awayXI: Player[],
  opts: {
    homeBench?: Player[];
    awayBench?: Player[];
    homeTactics?: SimTactics | null;
    awayTactics?: SimTactics | null;
  } = {},
): SimResult {
  const homeBench = opts.homeBench ?? [];
  const awayBench = opts.awayBench ?? [];
  const homeTactics = opts.homeTactics ?? null;
  const awayTactics = opts.awayTactics ?? null;
  const homeMods = tacticsModifiers(homeTactics);
  const awayMods = tacticsModifiers(awayTactics);

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
    "entrada dura", "juego peligroso", "protestar", "cortar un contragolpe",
    "agarrón", "perder tiempo", "falta táctica",
  ];
  const RED_REASONS = [
    "entrada muy dura", "mano en el área", "última falta", "conducta violenta",
  ];

  function simulateTeamCards(xi: Player[], team: "home" | "away"): number {
    let reds = 0;
    // A high press produces more fouls, a low block fewer.
    const aggression = team === "home" ? homeMods.aggression : awayMods.aggression;
    for (const player of xi) {
      // Defenders and defensive midfielders commit more fouls than keepers.
      const base =
        (player.position === "GK" ? 0.02 :
        player.position === "DEF" ? 0.115 :
        player.position === "MID" ? 0.095 : 0.055) * aggression;


      // Direct red card: rare (~0.35% per player => ~4% per team per match).
      if (rand() < 0.0035) {
        reds++;
        cards.push({
          minute: 15 + Math.floor(rand() * 75),
          team, playerId: player.id, playerName: player.name,
          cardType: "red", isSecondYellow: false,
          reason: RED_REASONS[Math.floor(rand() * RED_REASONS.length)],
        });
        continue;
      }

      if (rand() >= base) continue;

      const firstMinute = 8 + Math.floor(rand() * 75);
      cards.push({
        minute: firstMinute,
        team, playerId: player.id, playerName: player.name,
        cardType: "yellow", isSecondYellow: false,
        reason: CARD_REASONS[Math.floor(rand() * CARD_REASONS.length)],
      });

      // Contextual second yellow: only booked players can get one, it becomes
      // more likely the earlier the first yellow arrived and for defenders.
      const timeLeft = Math.max(0, 90 - firstMinute) / 90;
      const secondYellowChance = 0.10 * timeLeft * (player.position === "DEF" ? 1.4 : 1);
      if (rand() < secondYellowChance) {
        reds++;
        cards.push({
          minute: Math.min(90, firstMinute + 5 + Math.floor(rand() * (90 - firstMinute))),
          team, playerId: player.id, playerName: player.name,
          cardType: "red", isSecondYellow: true,
          reason: "doble amarilla",
        });
      }
    }
    return reds;
  }

  homeRedCards = simulateTeamCards(homeXI, "home");
  awayRedCards = simulateTeamCards(awayXI, "away");
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

  const adjustedHomeXI = withCaptainBoost(timeWeightedXI(homeXI, homeRedCardedPlayers), homeTactics);
  const adjustedAwayXI = withCaptainBoost(timeWeightedXI(awayXI, awayRedCardedPlayers), awayTactics);


  // -------------------------------------------------------------------------
  // 2. Goals. `expectedGoals` already carries its own variance, so we sample a
  //    plain Poisson here instead of multiplying the lambda a second time
  //    (which used to flatten every result towards a random draw).
  // -------------------------------------------------------------------------
  const { lh, la } = expectedGoals(
    home, away, adjustedHomeXI, adjustedAwayXI, homeTactics, awayTactics,
  );

  const homeGoalsRaw = poisson(lh);
  const awayGoalsRaw = poisson(la);

  const events: MatchEvent[] = [];
  const highlights: HighlightEvent[] = [];

  const activeAt = (xi: Player[], reds: Map<string, number>, minute: number) =>
    xi.filter((p) => {
      const expMin = reds.get(p.id);
      return expMin === undefined || expMin > minute;
    });

  const homeGoalMinutes = Array.from({ length: homeGoalsRaw }, () => goalMinute()).sort((a, b) => a - b);
  const awayGoalMinutes = Array.from({ length: awayGoalsRaw }, () => goalMinute()).sort((a, b) => a - b);

  const finalHomeGoalMinutes: number[] = [];
  const finalAwayGoalMinutes: number[] = [];
  const penaltiesMissed: Array<{ playerId: string }> = [];

  const FOUL_REASONS = [
    "derriba", "hace falta sobre", "agarra a", "pisa a", "comete mano ante",
  ];

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
      const defenders = defendXI.filter((p) => p.position === "DEF" || p.position === "GK");
      const pool = defenders.length > 0 ? defenders : defendXI;
      const unlucky = pool[Math.floor(rand() * pool.length)];
      events.push({
        minute, team, type: "own_goal",
        scorerId: unlucky.id, scorerName: unlucky.name,
      });
      return true;
    }

    // 9% of chances come from the penalty spot. The taker is ALWAYS the one
    // designated in the tactics screen when he is on the pitch. A penalty
    // produces exactly ONE chronicle entry (scored or missed), never a
    // separate "penalty awarded" line.
    if (rand() < 0.09) {
      const takers = attackXI.filter((p) => p.position !== "GK");
      const taker =
        designated(attackXI, tactics, "penaltyTakerId") ??
        (takers.length > 0
          ? takers.slice().sort((a, b) => b.rating - a.rating)[Math.floor(rand() * Math.min(3, takers.length))]
          : attackXI[0]);

      // Which rival player gave the penalty away.
      const foulPool = defendXI.filter((p) => p.position !== "GK");
      const offender = (foulPool.length > 0 ? foulPool : defendXI)[
        Math.floor(rand() * Math.max(1, (foulPool.length > 0 ? foulPool : defendXI).length))
      ];
      const foulVerb = FOUL_REASONS[Math.floor(rand() * FOUL_REASONS.length)];
      const conceded = offender
        ? `Penalti: ${offender.name} ${foulVerb} ${taker.name}`
        : "Penalti señalado";

      if (rand() < 0.78) {
        events.push({
          minute, team, type: "penalty_goal",
          scorerId: taker.id, scorerName: taker.name,
          detail: conceded,
        });
        return true;
      }
      penaltiesMissed.push({ playerId: taker.id });
      const keeper = defendXI.find((p) => p.position === "GK");
      highlights.push({
        minute, team, type: "penalty_missed",
        playerId: taker.id, playerName: taker.name,
        detail: keeper
          ? `${conceded} — lo falla, para ${keeper.name}`
          : `${conceded} — lo falla`,
      });
      return false;
    }

    // 7% of would-be goals get chalked off by VAR: only the disallowed-goal
    // line is shown, never the goal itself.
    if (rand() < 0.07) {
      const scorer = pickScorer(attackXI);
      highlights.push({
        minute, team, type: "var_disallowed",
        playerId: scorer.id, playerName: scorer.name,
        detail: rand() < 0.6 ? "Gol anulado por fuera de juego (VAR)" : "Gol anulado por falta previa (VAR)",
      });
      return false;
    }

    // 6% direct free kicks, taken by the designated free-kick specialist.
    const fkTaker = designated(attackXI, tactics, "freekickTakerId");
    if (rand() < 0.06) {
      const shooter = fkTaker ?? pickScorer(attackXI);
      events.push({
        minute, team, type: "free_kick_goal",
        scorerId: shooter.id, scorerName: shooter.name,
        detail: "Falta directa",
      });
      return true;
    }

    const scorer = pickScorer(attackXI);
    // Roughly a fifth of open-play goals come from a corner / dead ball, and
    // those are delivered by the designated corner taker.
    const cornerTaker = designated(attackXI, tactics, "cornerTakerId");
    const fromCorner = !!cornerTaker && cornerTaker.id !== scorer.id && rand() < 0.22;
    const assister = fromCorner ? cornerTaker : pickAssister(attackXI, scorer.id);
    events.push({
      minute, team, type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
      assistId: assister?.id, assistName: assister?.name,
      detail: fromCorner ? "A la salida de un córner" : undefined,
    });
    return true;
  }


  for (const minute of homeGoalMinutes) {
    const attack = activeAt(homeXI, homeRedCardedPlayers, minute);
    const defend = activeAt(awayXI, awayRedCardedPlayers, minute);
    if (buildGoal(minute, "home", attack, defend)) finalHomeGoalMinutes.push(minute);
  }
  for (const minute of awayGoalMinutes) {
    const attack = activeAt(awayXI, awayRedCardedPlayers, minute);
    const defend = activeAt(homeXI, homeRedCardedPlayers, minute);
    if (buildGoal(minute, "away", attack, defend)) finalAwayGoalMinutes.push(minute);
  }

  const homeGoals = finalHomeGoalMinutes.length;
  const awayGoals = finalAwayGoalMinutes.length;
  events.sort((a, b) => a.minute - b.minute);

  // -------------------------------------------------------------------------
  // 3. Injuries with exact minute + forced substitution.
  // -------------------------------------------------------------------------
  const injuries: InjuryEvent[] = [];
  const homeAvailableForInjury = homeXI.filter((p) => !homeRedCardedPlayers.has(p.id));
  const awayAvailableForInjury = awayXI.filter((p) => !awayRedCardedPlayers.has(p.id));
  const homeInj = maybeInjury(
    homeAvailableForInjury.length > 0 ? homeAvailableForInjury : homeXI, "home", homeBench);
  if (homeInj) injuries.push(homeInj);
  const awayInj = maybeInjury(
    awayAvailableForInjury.length > 0 ? awayAvailableForInjury : awayXI, "away", awayBench);
  if (awayInj) injuries.push(awayInj);

  for (const inj of injuries) {
    highlights.push({
      minute: inj.minute ?? 60,
      team: inj.team,
      type: "injury",
      playerId: inj.playerId,
      playerName: inj.playerName,
      detail: inj.reason,
    });
    if (inj.forcedSub && inj.replacementName) {
      highlights.push({
        minute: inj.minute ?? 60,
        team: inj.team,
        type: "forced_sub",
        playerId: inj.replacementId!,
        playerName: inj.replacementName,
        detail: `Entra por ${inj.playerName} (cambio forzado)`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. Match statistics (possession, shots, corners, fouls, passes, live xG).
  // -------------------------------------------------------------------------
  const homeStrength = calculateActiveOVR(homeXI);
  const awayStrength = calculateActiveOVR(awayXI);
  const stats = buildMatchStats({
    xgHome: lh, xgAway: la,
    homeGoals, awayGoals,
    homeGoalMinutes: finalHomeGoalMinutes,
    awayGoalMinutes: finalAwayGoalMinutes,
    homeStrength, awayStrength,
  });

  // -------------------------------------------------------------------------
  // 5. Extra highlights: saves and woodwork, tied to the generated stats.
  // -------------------------------------------------------------------------
  const homeGK = homeXI.find((p) => p.position === "GK");
  const awayGK = awayXI.find((p) => p.position === "GK");

  const addSaves = (gk: Player | undefined, team: "home" | "away", count: number) => {
    if (!gk) return;
    const shown = Math.min(count, 4);
    for (let i = 0; i < shown; i++) {
      highlights.push({
        minute: 3 + Math.floor(rand() * 85),
        team, type: "save",
        playerId: gk.id, playerName: gk.name,
        detail: rand() < 0.35 ? "¡Paradón!" : "Buena intervención",
      });
    }
  };
  addSaves(homeGK, "home", stats.home.saves);
  addSaves(awayGK, "away", stats.away.saves);

  const addWoodwork = (xi: Player[], team: "home" | "away") => {
    if (rand() > 0.18) return;
    const candidates = xi.filter((p) => p.position !== "GK");
    if (candidates.length === 0) return;
    const p = candidates[Math.floor(rand() * candidates.length)];
    highlights.push({
      minute: 3 + Math.floor(rand() * 85),
      team, type: "woodwork",
      playerId: p.id, playerName: p.name,
      detail: rand() < 0.5 ? "¡Al palo!" : "¡Al travesaño!",
    });
  };
  addWoodwork(homeXI, "home");
  addWoodwork(awayXI, "away");

  highlights.sort((a, b) => a.minute - b.minute);

  // -------------------------------------------------------------------------
  // 6. Player ratings (1-10) and MVP.
  // -------------------------------------------------------------------------
  const minutesPlayed: Record<string, number> = {};
  for (const p of [...homeXI, ...awayXI]) minutesPlayed[p.id] = 90;
  for (const [id, min] of homeRedCardedPlayers) minutesPlayed[id] = min;
  for (const [id, min] of awayRedCardedPlayers) minutesPlayed[id] = min;
  for (const inj of injuries) {
    if (inj.forcedSub && inj.minute !== undefined) minutesPlayed[inj.playerId] = inj.minute;
  }

  const { ratings, mvp } = computePlayerRatings({
    homeXI, awayXI, homeGoals, awayGoals,
    goals: events.map((e) => ({
      team: e.team,
      scorerId: e.scorerId,
      assistId: e.assistId,
      ownGoal: e.type === "own_goal",
    })),
    cards: cards.map((c) => ({
      team: c.team, playerId: c.playerId, cardType: c.cardType, minute: c.minute,
    })),
    minutesPlayed,
    homeSaves: stats.home.saves,
    awaySaves: stats.away.saves,
    penaltiesMissed,
  });

  return {
    homeGoals, awayGoals, events, cards, injuries,
    xgHome: lh, xgAway: la,
    highlights, stats, ratings, mvp,
  };
}

// Simulate extra time (90-120 minutes) - lower intensity than regular time
export function simulateExtraTime(home: Team, away: Team, homeXI: Player[], awayXI: Player[]): { homeGoals: number; awayGoals: number; events: MatchEvent[] } {
  const { lh, la } = expectedGoals(home, away, homeXI, awayXI);
  // Extra time has lower xG (players are tired)
  const etXGHome = lh * 0.4;
  const etXGAway = la * 0.4;
  
  const homeGoals = poisson(etXGHome);
  const awayGoals = poisson(etXGAway);
  
  const events: MatchEvent[] = [];
  
  // Generate events for extra time (minutes 91-120)
  for (let i = 0; i < homeGoals; i++) {
    const scorer = pickScorer(homeXI);
    const assister = fastPickAssister(homeXI, scorer.id);
    events.push({
      minute: Math.floor(rand() * 30) + 91, team: "home", type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
      assistId: assister?.id, assistName: assister?.name,
    });
  }
  for (let i = 0; i < awayGoals; i++) {
    const scorer = pickScorer(awayXI);
    const assister = fastPickAssister(awayXI, scorer.id);
    events.push({
      minute: Math.floor(rand() * 30) + 91, team: "away", type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
      assistId: assister?.id, assistName: assister?.name,
    });
  }
  events.sort((a, b) => a.minute - b.minute);
  
  return { homeGoals, awayGoals, events };
}

// Simulate penalty shootout (ABAB format, 5 rounds, sudden death)
export function simulatePenaltyShootout(homeXI: Player[], awayXI: Player[]): { homeGoals: number; awayGoals: number; shootout: Array<{ team: 'home' | 'away'; scored: boolean; playerId?: string }> } {
  const shootout: Array<{ team: 'home' | 'away'; scored: boolean; playerId?: string }> = [];
  
  // Get penalty takers (field players + GK, sorted by rating)
  const homeTakers = [...homeXI].sort((a, b) => b.rating - a.rating);
  const awayTakers = [...awayXI].sort((a, b) => b.rating - a.rating);
  
  // Penalty success rate: 50% for each team (as requested)
  const getPenaltySuccess = () => rand() < 0.5;
  
  let homeGoals = 0;
  let awayGoals = 0;
  let homeTakerIndex = 0;
  let awayTakerIndex = 0;
  
  // First 5 rounds (ABAB format)
  for (let round = 0; round < 5; round++) {
    // Home team penalty
    const homeTaker = homeTakers[homeTakerIndex % homeTakers.length];
    const homeScored = getPenaltySuccess();
    shootout.push({ team: 'home', scored: homeScored, playerId: homeTaker.id });
    if (homeScored) homeGoals++;
    homeTakerIndex++;
    
    // Check if away team can still catch up
    const maxAwayPossible = awayGoals + (5 - round);
    if (homeGoals > maxAwayPossible) break;
    
    // Away team penalty
    const awayTaker = awayTakers[awayTakerIndex % awayTakers.length];
    const awayScored = getPenaltySuccess();
    shootout.push({ team: 'away', scored: awayScored, playerId: awayTaker.id });
    if (awayScored) awayGoals++;
    awayTakerIndex++;
    
    // Check if home team can still catch up
    const maxHomePossible = homeGoals + (5 - round - 1);
    if (awayGoals > maxHomePossible) break;
  }
  
  // Sudden death if still tied after 5 rounds
  while (homeGoals === awayGoals) {
    // Home team penalty
    const homeTaker = homeTakers[homeTakerIndex % homeTakers.length];
    const homeScored = getPenaltySuccess();
    shootout.push({ team: 'home', scored: homeScored, playerId: homeTaker.id });
    if (homeScored) homeGoals++;
    homeTakerIndex++;
    
    if (homeGoals !== awayGoals) break;
    
    // Away team penalty
    const awayTaker = awayTakers[awayTakerIndex % awayTakers.length];
    const awayScored = getPenaltySuccess();
    shootout.push({ team: 'away', scored: awayScored, playerId: awayTaker.id });
    if (awayScored) awayGoals++;
    awayTakerIndex++;
  }
  
  return { homeGoals, awayGoals, shootout };
}

// Simulate a full cup match with extra time and penalties
export function simulateCupMatch(
  home: Team, away: Team, homeXI: Player[], awayXI: Player[]
): SimResult {
  // Simulate regular time (90 minutes)
  const regularResult = simulateMatch(home, away, homeXI, awayXI);
  
  // Check if it's a draw - if so, go to extra time
  if (regularResult.homeGoals === regularResult.awayGoals) {
    const extraTimeResult = simulateExtraTime(home, away, homeXI, awayXI);
    const totalHome = regularResult.homeGoals + extraTimeResult.homeGoals;
    const totalAway = regularResult.awayGoals + extraTimeResult.awayGoals;
    
    // If still tied after extra time, go to penalties
    if (totalHome === totalAway) {
      const penaltyResult = simulatePenaltyShootout(homeXI, awayXI);
      
      // Combine all results
      return {
        homeGoals: regularResult.homeGoals,
        awayGoals: regularResult.awayGoals,
        events: [...regularResult.events, ...extraTimeResult.events],
        cards: regularResult.cards,
        injuries: regularResult.injuries,
        xgHome: regularResult.xgHome,
        xgAway: regularResult.xgAway,
        extraTime: {
          homeGoals: extraTimeResult.homeGoals,
          awayGoals: extraTimeResult.awayGoals,
          events: extraTimeResult.events
        },
        penalties: {
          homeGoals: penaltyResult.homeGoals,
          awayGoals: penaltyResult.awayGoals,
          shootout: penaltyResult.shootout
        }
      };
    } else {
      // Match ended in extra time with a winner
      return {
        homeGoals: regularResult.homeGoals,
        awayGoals: regularResult.awayGoals,
        events: [...regularResult.events, ...extraTimeResult.events],
        cards: regularResult.cards,
        injuries: regularResult.injuries,
        xgHome: regularResult.xgHome,
        xgAway: regularResult.xgAway,
        extraTime: {
          homeGoals: extraTimeResult.homeGoals,
          awayGoals: extraTimeResult.awayGoals,
          events: extraTimeResult.events
        }
      };
    }
  } else {
    // Match ended in regular time with a winner
    return regularResult;
  }
}

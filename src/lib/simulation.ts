import { Team } from "@/data/teams";
import { Player } from "@/data/players";

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

export function expectedGoals(home: Team, away: Team, homeXI: Player[] = [], awayXI: Player[] = []): { lh: number; la: number } {
  // Use dynamic attack/defense strength from actual XI instead of static team ratings
  const homeAtt = calculateAttackStrength(homeXI) || 65;
  const homeDef = calculateDefenseStrength(homeXI) || 65;
  const awayAtt = calculateAttackStrength(awayXI) || 65;
  const awayDef = calculateDefenseStrength(awayXI) || 65;
  
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
  type: "goal";
  scorerId: string;
  scorerName: string;
  assistId?: string;
  assistName?: string;
};

export type InjuryEvent = {
  team: "home" | "away";
  playerId: string;
  playerName: string;
  weeks: number;
  reason: string;
};

export type SimResult = {
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  injuries: InjuryEvent[];
  xgHome: number;
  xgAway: number;
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

function maybeInjury(xi: Player[], team: "home" | "away"): InjuryEvent | null {
  if (rand() > 0.06) return null;
  const victim = xi[Math.floor(rand() * xi.length)];
  const weeks = 1 + Math.floor(rand() * 5);
  return {
    team, playerId: victim.id, playerName: victim.name, weeks,
    reason: INJURY_REASONS[Math.floor(rand() * INJURY_REASONS.length)],
  };
}

// Cache for team strength calculations
const teamStrengthCache = new Map<string, number>();

function getTeamStrength(xi: Player[]): number {
  if (xi.length === 0) return 70;
  const key = xi.map(p => p.id).sort().join(',');
  if (teamStrengthCache.has(key)) return teamStrengthCache.get(key)!;
  
  const avg = xi.reduce((s, p) => s + p.rating, 0) / xi.length;
  teamStrengthCache.set(key, avg);
  return avg;
}

// Fast scorer pick without weighted calculations
function fastPickScorer(xi: Player[]): Player {
  const candidates = xi.filter((p) => p.position !== "GK");
  if (candidates.length === 0) return xi[0];
  // Simple random pick with slight bias toward forwards
  const weights = candidates.map((p) => p.position === "FWD" ? 3 : p.position === "MID" ? 2 : 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// Ultra-fast simulation for bulk matchdays (no detailed events, just results)
// NOTE: Stats recording is handled by applyMatchToStats after the simulation
export function simulateMatchFast(
  home: Team, away: Team, homeXI: Player[], awayXI: Player[]
): SimResult {
  const { lh, la } = expectedGoals(home, away, homeXI, awayXI);
  
  // Use normal distribution approximation for speed (faster than poisson)
  const homeGoals = Math.max(0, Math.round(lh + (rand() - 0.5) * Math.sqrt(lh)));
  const awayGoals = Math.max(0, Math.round(la + (rand() - 0.5) * Math.sqrt(la)));
  
  // Minimal events - with weighted scorer selection and assists
  // Stats are recorded later by applyMatchToStats to avoid duplicates
  const events: MatchEvent[] = [];
  
  // Home team goals
  for (let i = 0; i < homeGoals; i++) {
    const scorer = fastPickScorerWeighted(homeXI);
    const assister = fastPickAssister(homeXI, scorer.id);
    
    events.push({
      minute: Math.floor(rand() * 90) + 1, team: "home", type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
      assistId: assister?.id, assistName: assister?.name,
    });
  }
  
  // Away team goals
  for (let i = 0; i < awayGoals; i++) {
    const scorer = fastPickScorerWeighted(awayXI);
    const assister = fastPickAssister(awayXI, scorer.id);
    
    events.push({
      minute: Math.floor(rand() * 90) + 1, team: "away", type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
      assistId: assister?.id, assistName: assister?.name,
    });
  }
  
  // No injuries in fast mode
  return { homeGoals, awayGoals, events, injuries: [], xgHome: lh, xgAway: la };
}

// Detailed simulation with events and injuries
// NOTE: Stats recording is handled by applyMatchToStats after the simulation
export function simulateMatch(
  home: Team, away: Team, homeXI: Player[], awayXI: Player[]
): SimResult {
  const { lh, la } = expectedGoals(home, away, homeXI, awayXI);
  const homeGoals = poisson(lh);
  const awayGoals = poisson(la);

  // Stats are recorded later by applyMatchToStats to avoid duplicates
  const events: MatchEvent[] = [];
  
  for (let i = 0; i < homeGoals; i++) {
    const scorer = pickScorer(homeXI);
    const assister = pickAssister(homeXI, scorer.id);
    events.push({
      minute: Math.floor(rand() * 90) + 1, team: "home", type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
      assistId: assister?.id, assistName: assister?.name,
    });
  }
  for (let i = 0; i < awayGoals; i++) {
    const scorer = pickScorer(awayXI);
    const assister = pickAssister(awayXI, scorer.id);
    events.push({
      minute: Math.floor(rand() * 90) + 1, team: "away", type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
      assistId: assister?.id, assistName: assister?.name,
    });
  }
  events.sort((a, b) => a.minute - b.minute);

  const injuries: InjuryEvent[] = [];
  const homeInj = maybeInjury(homeXI, "home");
  if (homeInj) injuries.push(homeInj);
  const awayInj = maybeInjury(awayXI, "away");
  if (awayInj) injuries.push(awayInj);

  return { homeGoals, awayGoals, events, injuries, xgHome: lh, xgAway: la };
}

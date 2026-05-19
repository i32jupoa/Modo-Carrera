import { Team } from "@/data/teams";
import { Player } from "@/data/players";

function rand(): number { return Math.random(); }

function poisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0; let p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

const HOME_ADVANTAGE = 0.25;

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
  // Safe fallbacks for team stats (minimum 65 for minor league teams)
  const homeAtt = home.att || 65;
  const homeDef = home.def || 65;
  const awayAtt = away.att || 65;
  const awayDef = away.def || 65;
  
  const homeDiff = homeAtt - awayDef;
  const awayDiff = awayAtt - homeDef;
  const mh = teamMomentum(homeXI);
  const ma = teamMomentum(awayXI);
  
  // Base expected goals with minimum floor for competitive matches
  const lh = Math.max(0.5, (1.3 + homeDiff * 0.05 + HOME_ADVANTAGE) * mh);
  const la = Math.max(0.5, (1.3 + awayDiff * 0.05) * ma);
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
export function simulateMatchFast(
  home: Team, away: Team, homeXI: Player[], awayXI: Player[]
): SimResult {
  const { lh, la } = expectedGoals(home, away, homeXI, awayXI);
  
  // Use normal distribution approximation for speed (faster than poisson)
  const homeGoals = Math.max(0, Math.round(lh + (rand() - 0.5) * Math.sqrt(lh)));
  const awayGoals = Math.max(0, Math.round(la + (rand() - 0.5) * Math.sqrt(la)));
  
  // Minimal events - only scorers, no assists, no minute sorting
  const events: MatchEvent[] = [];
  for (let i = 0; i < homeGoals; i++) {
    const scorer = fastPickScorer(homeXI);
    events.push({
      minute: Math.floor(rand() * 90) + 1, team: "home", type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
    });
  }
  for (let i = 0; i < awayGoals; i++) {
    const scorer = fastPickScorer(awayXI);
    events.push({
      minute: Math.floor(rand() * 90) + 1, team: "away", type: "goal",
      scorerId: scorer.id, scorerName: scorer.name,
    });
  }
  
  // No injuries in fast mode
  return { homeGoals, awayGoals, events, injuries: [], xgHome: lh, xgAway: la };
}

export function simulateMatch(
  home: Team, away: Team, homeXI: Player[], awayXI: Player[]
): SimResult {
  const { lh, la } = expectedGoals(home, away, homeXI, awayXI);
  const homeGoals = poisson(lh);
  const awayGoals = poisson(la);

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

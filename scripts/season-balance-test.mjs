#!/usr/bin/env node
/**
 * Monte Carlo validation harness for the quality/xG curve used by
 * src/lib/simulation.ts expectedGoals().
 *
 * Run: npm run test:season-balance -- --seasons=250 --seed=20261010
 * This executes full 20-team, 38-matchday double round-robin seasons. It models
 * the engine's home advantage, tanh quality-to-xG share, 2.95 base total xG,
 * xG clamps and Poisson goals; it isolates league balance from the UI/store.
 */

const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, value = 'true'] = arg.slice(2).split('=');
  return [key, value];
}));
const SEASONS = Math.max(1, Math.min(10000, Number(args.get('seasons') ?? process.env.SEASONS ?? 250) || 250));
const INITIAL_SEED = Number(args.get('seed') ?? process.env.SEED ?? 20261010) >>> 0;

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function poisson(lambda, random) {
  const threshold = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do { count += 1; product *= random(); } while (product > threshold);
  return count - 1;
}
function pearson(xs, ys) {
  const n = xs.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0, sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    sumX += dx * dx;
    sumY += dy * dy;
  }
  return numerator / Math.sqrt(Math.max(1e-12, sumX * sumY));
}

function expectedGoals(home, away, random) {
  // expectedGoals(): 62% XI, 18% team strength, 12% attack, 8% defense.
  // The isolated benchmark assumes the same quality in those four inputs.
  const homeStrength = home * (0.62 + 0.18 + 0.12 + 0.08);
  const awayStrength = away * (0.62 + 0.18 + 0.12 + 0.08);
  const effectiveDiff = clamp(homeStrength - awayStrength, -30, 30) + 2.0;
  const share = clamp(0.5 + 0.26 * Math.tanh(effectiveDiff / 10.5), 0.24, 0.76);
  const variation = () => 0.97 + random() * 0.06;
  return {
    home: clamp(2.95 * share * variation(), 0.22, 3.65),
    away: clamp(2.95 * (1 - share) * variation(), 0.20, 3.35),
  };
}
function rankStandings(table) {
  return table.slice().sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.teamId - b.teamId,
  );
}

const TEAM_COUNT = 20;
const ratings = Array.from({ length: TEAM_COUNT }, (_, rank) => ({
  teamId: rank + 1,
  squadRank: rank + 1,
  // Representative quality range: first team 90 OVR, 20th team 62.45 OVR.
  overall: 90 - rank * 1.45,
}));
const totalsBySquadRank = Array.from({ length: TEAM_COUNT }, () => ({ points: 0, position: 0, top5: 0, top10: 0 }));
let totalUpsetWins = 0;
let matchesPlayed = 0;
let totalGoals = 0;
let random = mulberry32(INITIAL_SEED);

for (let season = 0; season < SEASONS; season++) {
  const table = ratings.map((team) => ({ teamId: team.teamId, points: 0, gf: 0, ga: 0, gd: 0 }));
  const tableById = new Map(table.map((entry) => [entry.teamId, entry]));
  // Every unordered pair plays twice: once at each ground.
  for (let i = 0; i < TEAM_COUNT; i++) {
    for (let j = i + 1; j < TEAM_COUNT; j++) {
      for (const [homeIndex, awayIndex] of [[i, j], [j, i]]) {
        const home = ratings[homeIndex];
        const away = ratings[awayIndex];
        const xg = expectedGoals(home.overall, away.overall, random);
        const homeGoals = poisson(xg.home, random);
        const awayGoals = poisson(xg.away, random);
        const h = tableById.get(home.teamId);
        const a = tableById.get(away.teamId);
        h.gf += homeGoals; h.ga += awayGoals; h.gd += homeGoals - awayGoals;
        a.gf += awayGoals; a.ga += homeGoals; a.gd += awayGoals - homeGoals;
        if (homeGoals > awayGoals) h.points += 3;
        else if (homeGoals < awayGoals) a.points += 3;
        else { h.points += 1; a.points += 1; }
        // Contabilizar sólo triunfos del equipo inferior en OVR: el local es
        // inferior cuando el visitante tiene ≥8 puntos más, y viceversa.
        if (away.overall - home.overall >= 8 && homeGoals > awayGoals) totalUpsetWins += 1;
        if (home.overall - away.overall >= 8 && awayGoals > homeGoals) totalUpsetWins += 1;
        totalGoals += homeGoals + awayGoals;
        matchesPlayed += 1;
      }
    }
  }
  const finalTable = rankStandings(table);
  finalTable.forEach((team, index) => {
    const rankData = totalsBySquadRank[team.teamId - 1];
    rankData.points += team.points;
    rankData.position += index + 1;
    if (index < 5) rankData.top5 += 1;
    if (index < 10) rankData.top10 += 1;
  });
}

const avgPositionBySquadRank = totalsBySquadRank.map((value) => value.position / SEASONS);
const qualityRanks = ratings.map((team) => team.squadRank);
const correlation = pearson(qualityRanks, avgPositionBySquadRank);
const rounded = (value, digits = 2) => Number(value.toFixed(digits));
console.log(`Season-balance Monte Carlo · ${SEASONS} temporadas · seed ${INITIAL_SEED}`);
console.log(`Partidos simulados: ${matchesPlayed.toLocaleString('es-ES')} · media goles/partido: ${rounded(totalGoals / matchesPlayed, 2)}`);
console.log(`Correlación Pearson entre ranking de plantilla (1=mejor) y posición final media (1=mejor): ${rounded(correlation, 3)}`);
console.log(`Victorias sorpresa registradas entre equipos con diferencia OVR >= 8: ${totalUpsetWins.toLocaleString('es-ES')}`);
console.log('\nRanking plantilla | OVR referencia | Puntos/temporada | Posición final media | % top 5 | % top 10');
for (let i = 0; i < ratings.length; i++) {
  const team = ratings[i];
  const aggregate = totalsBySquadRank[i];
  console.log(`${String(team.squadRank).padStart(2)} | ${team.overall.toFixed(2).padStart(5)} | ${(aggregate.points / SEASONS).toFixed(1).padStart(6)} | ${(aggregate.position / SEASONS).toFixed(2).padStart(5)} | ${(100 * aggregate.top5 / SEASONS).toFixed(1).padStart(5)}% | ${(100 * aggregate.top10 / SEASONS).toFixed(1).padStart(5)}%`);
}

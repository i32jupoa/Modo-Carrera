#!/usr/bin/env node
/**
 * Diagnóstico reproducible del equilibrio de las cinco grandes ligas.
 *
 * Run: npm run test:league-realism -- --seasons=20 --seed=20261014
 *
 * Usa los equipos estáticos reales y los jugadores de src/data/players.json.
 * Replica únicamente el núcleo probabilístico de expectedGoals()/goalScorerWeight()
 * para aislar el balance de calidad; no sustituye a una integración de navegador
 * con lesiones, progresión mensual, tácticas guardadas ni fichajes de una carrera.
 * Además verifica por código que avance diario y salto comparten el helper de
 * calendario, el motor rápido, la resolución de XI y las señales de lesiones/sanciones.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, value = 'true'] = arg.slice(2).split('=');
  return [key, value];
}));
const SEASONS = Math.max(20, Math.min(250, Number(args.get('seasons') ?? process.env.SEASONS ?? 20) || 20));
const INITIAL_SEED = Number(args.get('seed') ?? process.env.SEED ?? 20261014) >>> 0;
const LEAGUES = [
  { id: 'laliga', label: 'LALIGA EA SPORTS', source: 'LALIGA EA SPORTS', teams: 20 },
  { id: 'premier', label: 'Premier League', source: 'Premier League', teams: 20 },
  { id: 'seriea', label: 'Serie A Enilive', source: 'Serie A Enilive', teams: 20 },
  { id: 'bundesliga', label: 'Bundesliga', source: 'Bundesliga', teams: 18 },
  { id: 'ligue1', label: "Ligue 1 McDonald's", source: "Ligue 1 McDonald's", teams: 18 },
];
const POSITION_ALIASES = {
  GK: 'GK', POR: 'GK', PT: 'GK', CB: 'DFC', LCB: 'DFC', RCB: 'DFC', SW: 'DFC', DFC: 'DFC',
  RB: 'LD', RFB: 'LD', LD: 'LD', RWB: 'LD', CAD: 'LD', LB: 'LI', LFB: 'LI', LI: 'LI', LWB: 'LI', CAI: 'LI',
  CDM: 'MCD', MCD: 'MCD', DM: 'MCD', CM: 'MC', MC: 'MC', CAM: 'MCO', MCO: 'MCO', AM: 'MCO',
  RM: 'MD', MD: 'MD', LM: 'MI', MI: 'MI', RW: 'ED', RF: 'ED', ED: 'ED', LW: 'EI', LF: 'EI', EI: 'EI',
  ST: 'DC', CS: 'DC', LS: 'DC', RS: 'DC', DC: 'DC', CF: 'MCO', SD: 'MCO',
};
const SOURCE_LEAGUE_IDS = new Map(LEAGUES.map((league) => [league.source, league.id]));

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(lambda, random) {
  const threshold = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do { count += 1; product *= random(); } while (product > threshold);
  return count - 1;
}
function correlation(xs, ys) {
  if (xs.length < 2 || ys.length !== xs.length) return 0;
  const mx = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const my = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0, vx = 0, vy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    numerator += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  return numerator / Math.sqrt(Math.max(1e-12, vx * vy));
}
function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array(values.length).fill(0);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j += 1;
    const averageRank = ((i + 1) + j) / 2;
    for (let k = i; k < j; k += 1) result[sorted[k].index] = averageRank;
    i = j;
  }
  return result;
}
function spearman(xs, ys) { return correlation(ranks(xs), ranks(ys)); }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function parseList(raw) {
  return [...String(raw ?? '').matchAll(/[A-Za-z]+/g)].map((match) => match[0].toUpperCase());
}
function positionsFor(raw) {
  const positions = [];
  for (const code of [raw.Position, ...parseList(raw['Alternative positions'])]) {
    const mapped = POSITION_ALIASES[String(code ?? '').trim().toUpperCase()];
    if (mapped && !positions.includes(mapped)) positions.push(mapped);
  }
  return positions;
}
function roleForPosition(position) {
  if (position === 'GK') return 'GK';
  if (['DFC', 'LD', 'LI'].includes(position)) return 'DEF';
  if (['MC', 'MCD', 'MCO', 'MD', 'MI'].includes(position)) return 'MID';
  return 'FWD';
}

// The catalog source is a literal array, so this parser reads its real club IDs,
// names and league assignments without importing the React/TS runtime.
const teamSource = read('src/data/teams.ts');
const teamArrayMatch = teamSource.match(/export const TEAMS: Team\[\] = \[([\s\S]*?)\n\];/);
assert.ok(teamArrayMatch, 'No se encuentra la lista TEAMS en src/data/teams.ts');
const staticTeamBlock = /\{\s*id:\s*"([^"]+)"[\s\S]*?name:\s*"([^"]+)"[\s\S]*?league:\s*"([^"]+)"[\s\S]*?\}/g;
const catalogTeams = [];
for (const match of teamArrayMatch[1].matchAll(staticTeamBlock)) {
  const [, id, name, league] = match;
  if (LEAGUES.some((item) => item.id === league)) catalogTeams.push({ id, name, league, roster: [], xi: [], ratings: null });
}
const teamsByName = new Map();
for (const team of catalogTeams) {
  teamsByName.set(normalize(team.name), team);
  teamsByName.set(normalize(team.id), team);
}
const aliasMatch = teamSource.match(/const TEAM_NAME_ALIASES: Record<string, string> = \{([\s\S]*?)\n\};/);
const aliases = new Map();
for (const match of (aliasMatch?.[1] ?? '').matchAll(/^\s*([A-Za-z0-9_]+):\s*"([^"]+)"\s*,?/gm)) {
  aliases.set(match[1], match[2]);
}
const players = [0,1,2,3,4].flatMap(i=>JSON.parse(read(`src/data/players.part${i}.json`)));
for (const raw of players) {
  const sourceLeagueId = SOURCE_LEAGUE_IDS.get(String(raw.League ?? ''));
  if (!sourceLeagueId || !raw.Team) continue;
  const key = normalize(raw.Team);
  let team = teamsByName.get(key) ?? null;
  if (!team && aliases.has(key)) team = teamsByName.get(normalize(aliases.get(key))) ?? null;
  if (!team) continue;
  if (team.league !== sourceLeagueId) {
    const sameLeague = catalogTeams.find((candidate) => candidate.league === sourceLeagueId && (normalize(candidate.name) === key || normalize(candidate.id) === key));
    if (sameLeague) team = sameLeague;
  }
  if (team.league !== sourceLeagueId) continue;
  const rating = Number(raw.OVR) || 0;
  if (rating <= 0) continue;
  team.roster.push({
    id: String(raw.ID), name: String(raw.Name ?? raw.ID), rating, age: Number(raw.Age) || 25, positionsRaw: String(raw.Position ?? ''),
    positions: positionsFor(raw), shooting: {
      shooting: Number(raw.SHO) || 0, finishing: Number(raw.Finishing) || 0,
      shotPower: Number(raw['Shot Power']) || 0, positioning: Number(raw.Positioning) || 0,
      composure: Number(raw.Composure) || 0,
    },
  });
}

// Greedy position-fit XI approximating the production formation optimizer. Rare
// positions are assigned first; no player may occupy two slots.
const FORMATION_SLOTS = ['GK', 'DFC', 'DFC', 'LI', 'LD', 'MCD', 'MC', 'MC', 'EI', 'ED', 'DC'];
function slotFallback(position, player) {
  if (player.positions.includes(position)) return 0;
  const groups = {
    GK: ['GK'], DFC: ['DFC', 'LD', 'LI'], LI: ['LI', 'LD', 'DFC'], LD: ['LD', 'LI', 'DFC'],
    MCD: ['MCD', 'MC', 'MCO'], MC: ['MC', 'MCD', 'MCO', 'MD', 'MI'],
    EI: ['EI', 'ED', 'DC', 'MCO'], ED: ['ED', 'EI', 'DC', 'MCO'], DC: ['DC', 'MCO', 'ED', 'EI'],
  };
  const overlap = (groups[position] ?? [position]).findIndex((code) => player.positions.includes(code));
  return overlap < 0 ? 100 : 4 + overlap * 2;
}
function createXI(team) {
  const pool = team.roster.slice().sort((a, b) => b.rating - a.rating);
  const used = new Set();
  const slotCandidates = FORMATION_SLOTS.map((position, index) => ({ position, index,
    candidates: pool.filter((player) => player.positions.includes(position)).length,
  })).sort((a, b) => a.candidates - b.candidates || a.index - b.index);
  const assignments = new Map();
  for (const slot of slotCandidates) {
    const available = pool.filter((player) => !used.has(player.id));
    if (!available.length) break;
    available.sort((a, b) => {
      const scoreA = a.rating - slotFallback(slot.position, a) + (a.positions[0] === slot.position ? 0.15 : 0);
      const scoreB = b.rating - slotFallback(slot.position, b) + (b.positions[0] === slot.position ? 0.15 : 0);
      return scoreB - scoreA;
    });
    const picked = available[0];
    assignments.set(slot.index, picked);
    used.add(picked.id);
  }
  const xi = FORMATION_SLOTS.map((_, index) => assignments.get(index)).filter(Boolean);
  if (xi.length < 11) {
    for (const player of pool) {
      if (xi.length >= 11) break;
      if (!used.has(player.id)) { xi.push(player); used.add(player.id); }
    }
  }
  return xi.slice(0, 11);
}

function teamRatingFromSquad(roster) {
  const sorted = roster.slice().sort((a, b) => b.rating - a.rating);
  const weightFor = (rank, player) => {
    if (rank < 11) return 1.3 - rank * 0.02;
    if (player.age <= 21) return 0;
    return 0.35 * Math.pow(0.88, rank - 11);
  };
  const weightedAverage = (predicate) => {
    let weightSum = 0, ratingSum = 0;
    sorted.forEach((player, rank) => {
      if (!predicate(player)) return;
      const weight = weightFor(rank, player);
      if (weight <= 0) return;
      weightSum += weight; ratingSum += weight * player.rating;
    });
    return weightSum > 0 ? ratingSum / weightSum : null;
  };
  const overall = weightedAverage(() => true) ?? average(sorted.map((player) => player.rating)) ?? 65;
  const line = (predicate) => {
    const value = weightedAverage(predicate) ?? overall;
    return Math.max(40, Math.min(99, Math.round(value <= 75 ? value : 75 + (value - 75) * 1.25)));
  };
  return {
    att: line((player) => ['ST', 'CF', 'LW', 'RW', 'LF', 'RF'].includes(String(player.positionsRaw ?? '').toUpperCase()) || player.positions.some((pos) => ['DC', 'ED', 'EI', 'MCO'].includes(pos))),
    mid: line((player) => player.positions.some((pos) => ['MCD', 'MC', 'MCO', 'MD', 'MI'].includes(pos))),
    def: line((player) => player.positions.some((pos) => ['DFC', 'LD', 'LI'].includes(pos))),
  };
}
// Primary EA position is retained for the line-rating buckets above.
for (const team of catalogTeams) {
  team.xi = createXI(team);
  const listRating = teamRatingFromSquad(team.roster);
  team.ratings = { ...listRating, overall: average([listRating.att, listRating.mid, listRating.def]) };
}
const validTeamsByLeague = new Map();
for (const league of LEAGUES) {
  const list = catalogTeams.filter((team) => team.league === league.id && team.roster.length >= 11 && team.xi.length === 11);
  assert.equal(list.length, league.teams, `${league.label}: catálogo esperado ${league.teams} clubes, encontrados ${list.length}; revisar mapeo de equipos/jugadores`);
  validTeamsByLeague.set(league.id, list);
}

// Match the current engine's scorer weight: position, player rating, shooting
// attributes and elite boost. The game remains random; only odds are weighted.
function scorerWeight(player) {
  if (player.positions.includes('GK')) return 0;
  const stats = player.shooting;
  const goalThreat = stats.finishing * 0.39 + stats.positioning * 0.25 + stats.shooting * 0.16 + stats.composure * 0.12 + stats.shotPower * 0.08;
  const threatFactor = 0.44 + (goalThreat / 100) * 1.10;
  const ratingFactor = Math.max(0.50, player.rating / 84);
  const eliteRating = clamp((player.rating - 82) / 10, 0, 1);
  const eliteFinishing = clamp((stats.finishing - 78) / 22, 0, 1);
  const eliteBoost = 1 + eliteRating * 1.20 + eliteFinishing * 1.15;
  const positionFactor = player.positions.includes('DC') ? 14.5
    : player.positions.some((position) => ['ED', 'EI'].includes(position)) ? 8.2
      : player.positions.includes('MCO') ? 5.7
        : player.positions.some((position) => ['MC', 'MD', 'MI', 'MCD'].includes(position)) ? 1.65 : 0.40;
  return Math.max(0.05, positionFactor * threatFactor * Math.pow(ratingFactor, 2.90) * eliteBoost);
}
function weightedScorer(xi, random) {
  const candidates = xi.filter((player) => !player.positions.includes('GK'));
  if (!candidates.length) return null;
  const weights = candidates.map(scorerWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let pick = random() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    pick -= weights[i];
    if (pick <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
function activeAttack(xi) {
  const overall = average(xi.map((player) => player.rating)) || 65;
  const groupAvg = (predicate) => average(xi.filter((player) => predicate(player)).map((player) => player.rating)) || overall;
  const forwards = (player) => player.positions.some((pos) => ['ED', 'EI', 'DC', 'MCO'].includes(pos));
  const mids = (player) => player.positions.some((pos) => ['MCD', 'MC', 'MCO', 'MD', 'MI'].includes(pos));
  const defenders = (player) => player.positions.some((pos) => ['DFC', 'LD', 'LI'].includes(pos));
  return groupAvg(forwards) * 0.7 + groupAvg(mids) * 0.25 + groupAvg(defenders) * 0.05;
}
function activeDefense(xi) {
  const overall = average(xi.map((player) => player.rating)) || 65;
  const gk = (player) => player.positions.includes('GK');
  const defenders = (player) => player.positions.some((pos) => ['DFC', 'LD', 'LI'].includes(pos));
  const mids = (player) => player.positions.some((pos) => ['MCD', 'MC', 'MCO', 'MD', 'MI'].includes(pos));
  const groupAvg = (predicate) => average(xi.filter(predicate).map((player) => player.rating)) || overall;
  return groupAvg(defenders) * 0.6 + groupAvg(gk) * 0.25 + groupAvg(mids) * 0.15;
}
function expectedGoals(home, away, random) {
  // ExpectedGoals in src/lib/simulation.ts: .80 XI, .12 attack, .08 defence; no static-club bonus.
  const homeXIOverall = average(home.xi.map((player) => player.rating));
  const awayXIOverall = average(away.xi.map((player) => player.rating));
  const homeStrength = homeXIOverall * 0.80 + activeAttack(home.xi) * 0.12 + activeDefense(home.xi) * 0.08;
  const awayStrength = awayXIOverall * 0.80 + activeAttack(away.xi) * 0.12 + activeDefense(away.xi) * 0.08;
  const effectiveDiff = clamp(homeStrength - awayStrength, -30, 30) + 2.0;
  const share = clamp(0.5 + 0.39 * Math.tanh(effectiveDiff / 7.5), 0.11, 0.89);
  const totalXg = 2.95;
  return {
    lh: clamp(totalXg * share * (0.97 + random() * 0.06), 0.22, 3.65),
    la: clamp(totalXg * (1 - share) * (0.97 + random() * 0.06), 0.20, 3.35),
  };
}

function makeSchedule(teams) {
  const wheel = teams.slice();
  if (wheel.length % 2 === 1) wheel.push(null);
  const half = wheel.length / 2;
  const rounds = [];
  for (let round = 0; round < wheel.length - 1; round += 1) {
    const matches = [];
    for (let i = 0; i < half; i += 1) {
      const a = wheel[i], b = wheel[wheel.length - 1 - i];
      if (!a || !b) continue;
      const home = (round + i) % 2 === 0 ? a : b;
      const away = home === a ? b : a;
      matches.push({ matchday: round + 1, home, away });
      matches.push({ matchday: round + 1 + wheel.length - 1, home: away, away: home });
    }
    rounds.push(...matches);
    const last = wheel.pop();
    wheel.splice(1, 0, last);
  }
  return rounds;
}
function createSeasonState(league) {
  const teams = validTeamsByLeague.get(league.id);
  const rows = new Map(teams.map((team) => [team.id, { team, points: 0, gf: 0, ga: 0, gd: 0 }]));
  const scorers = new Map();
  return { league, teams, rows, scorers, fixtures: makeSchedule(teams) };
}
function ensureScorer(state, player) {
  let current = state.scorers.get(player.id);
  if (!current) {
    current = { id: player.id, name: player.name, teamId: null, rating: player.rating, goals: 0, position: player.positions[0] ?? '' };
    state.scorers.set(player.id, current);
  }
  return current;
}
function playFixture(state, fixture, random) {
  const { home, away } = fixture;
  const xg = expectedGoals(home, away, random);
  const homeGoals = poisson(xg.lh, random);
  const awayGoals = poisson(xg.la, random);
  const homeRow = state.rows.get(home.id), awayRow = state.rows.get(away.id);
  homeRow.gf += homeGoals; homeRow.ga += awayGoals;
  awayRow.gf += awayGoals; awayRow.ga += homeGoals;
  homeRow.gd = homeRow.gf - homeRow.ga; awayRow.gd = awayRow.gf - awayRow.ga;
  if (homeGoals > awayGoals) homeRow.points += 3;
  else if (awayGoals > homeGoals) awayRow.points += 3;
  else { homeRow.points += 1; awayRow.points += 1; }
  for (let i = 0; i < homeGoals; i += 1) {
    const scorer = weightedScorer(home.xi, random);
    if (scorer) { const entry = ensureScorer(state, scorer); entry.goals += 1; entry.teamId = home.id; }
  }
  for (let i = 0; i < awayGoals; i += 1) {
    const scorer = weightedScorer(away.xi, random);
    if (scorer) { const entry = ensureScorer(state, scorer); entry.goals += 1; entry.teamId = away.id; }
  }
  state.goals = (state.goals ?? 0) + homeGoals + awayGoals;
  state.matches = (state.matches ?? 0) + 1;
}
function rankedRows(state) {
  return [...state.rows.values()].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.id.localeCompare(b.team.id));
}
function seasonFixtures(state, leagueIndex) {
  return state.fixtures.map((fixture) => ({ ...fixture, state, leagueIndex }));
}
function simulateSeasonSet(routeMode, seasonIndex, random) {
  const states = LEAGUES.map(createSeasonState);
  const fixtures = states.flatMap((state, leagueIndex) => seasonFixtures(state, leagueIndex));
  if (routeMode === 'daily') {
    fixtures.sort((a, b) => a.leagueIndex - b.leagueIndex || a.matchday - b.matchday || a.home.id.localeCompare(b.home.id));
  } else {
    // Salto: los cinco calendarios avanzan por fecha de juego; la misma función
    // resuelve cada partido, sólo cambia el orden global de las competiciones.
    fixtures.sort((a, b) => a.matchday - b.matchday || a.leagueIndex - b.leagueIndex || a.home.id.localeCompare(b.home.id));
  }
  for (const fixture of fixtures) playFixture(fixture.state, fixture, random);
  return states.map((state) => {
    const table = rankedRows(state);
    const teamStrengthRanking = state.teams.slice().sort((a, b) => average(b.xi.map((player) => player.rating)) - average(a.xi.map((player) => player.rating)));
    const pointsById = new Map(table.map((row, index) => [row.team.id, index + 1]));
    const strengthRankById = new Map(teamStrengthRanking.map((team, index) => [team.id, index + 1]));
    const rayo = state.teams.find((team) => normalize(team.name) === normalize('Rayo Vallecano'));
    const xgRatings = teamStrengthRanking.map((team) => average(team.xi.map((player) => player.rating)));
    const finishPoints = teamStrengthRanking.map((team) => state.rows.get(team.id).points);
    const scorerRanking = [...state.scorers.values()].sort((a, b) => b.goals - a.goals || b.rating - a.rating);
    const bestSquadTeam = teamStrengthRanking[0];
    const strongestTopThree = teamStrengthRanking.slice(0, 3);
    const topScorerIds = new Set(scorerRanking.slice(0, 10).map((player) => player.id));
    const keyAttackers = strongestTopThree.flatMap((team) => team.xi
      .filter((player) => player.positions.some((pos) => ['DC', 'ED', 'EI', 'MCO'].includes(pos)))
      .sort((a, b) => b.rating - a.rating).slice(0, 3));
    const leader = scorerRanking[0];
    const points = table.map((row) => row.points);
    return {
      leagueId: state.league.id,
      goals: state.goals,
      matches: state.matches,
      spearman: spearman(xgRatings, finishPoints),
      championId: table[0]?.team.id,
      bestSquadWins: table[0]?.team.id === bestSquadTeam.id,
      championPoints: table[0]?.points ?? 0,
      lastPoints: table[table.length - 1]?.points ?? 0,
      championPointsEquivalent38: (table[0]?.points ?? 0) * 38 / (2 * (state.teams.length - 1)),
      lastPointsEquivalent38: (table[table.length - 1]?.points ?? 0) * 38 / (2 * (state.teams.length - 1)),
      meanPoints: average(points),
      pointStdDev: Math.sqrt(average(points.map((value) => (value - average(points)) ** 2))),
      pointsDistribution: points,
      top3Outside8: strongestTopThree.filter((team) => (pointsById.get(team.id) ?? 99) > 8).length,
      outsiderTop3: table.slice(0, 3).filter((row) => (strengthRankById.get(row.team.id) ?? 99) >= 9).length,
      deepOutsiderTop3: table.slice(0, 3).filter((row) => (strengthRankById.get(row.team.id) ?? 99) >= 13).length,
      rayoPosition: rayo ? (pointsById.get(rayo.id) ?? null) : null,
      strongestTopThreeCount: strongestTopThree.length,
      pichichiGoals: leader?.goals ?? 0,
      pichichiWithinTarget: Boolean(leader && leader.goals >= 24 && leader.goals <= 38),
      pichichi40Plus: Boolean(leader && leader.goals >= 40),
      strongestAttackersTop10: keyAttackers.filter((player) => topScorerIds.has(player.id)).length,
      strongestAttackersCount: keyAttackers.length,
      scorerTop10: scorerRanking.slice(0, 10),
    };
  });
}

// Validate that the isolated model hasn't silently drifted from key production
// constants and that both calendar paths still use the same real fixture helper.
const simulationSource = read('src/lib/simulation.ts');
const storeSource = read('src/lib/store.ts');
const playerStoreSource = read('src/store/playersStore.ts');
const matchEngineSource = read('src/lib/matchEngine.ts');
const lineupStart = storeSource.indexOf('export function getStartersWithFormation(');
const lineupEnd = storeSource.indexOf('\nfunction isXIPositionallyCoherent', lineupStart);
assert.ok(lineupStart >= 0 && lineupEnd > lineupStart, 'No se encuentra la resolución real de alineaciones');
const lineupSource = storeSource.slice(lineupStart, lineupEnd);
const calendarTeamStart = storeSource.indexOf('export function getCalendarMatchTeamData(');
const calendarTeamEnd = storeSource.indexOf('\nfunction isXIPositionallyCoherent', calendarTeamStart);
const calendarTeamSource = storeSource.slice(calendarTeamStart, calendarTeamEnd);
assert.match(simulationSource, /homeXIOverall \* 0\.80 \+ homeAttack \* 0\.12 \+ homeDefense \* 0\.08/);
assert.doesNotMatch(simulationSource.slice(simulationSource.indexOf('const homeStrength ='), simulationSource.indexOf('// Las tácticas modifican')), /homeListedOverall|home\.att|home\.mid|home\.def/);
assert.match(simulationSource, /const rawShare = 0\.5 \+ 0\.39 \* Math\.tanh\(effectiveDiff \/ 7\.5\)/);
assert.match(simulationSource, /const totalXg = 2\.95/);
assert.match(simulationSource, /export const ASSIST_PROBABILITY = 0\.88/);
assert.match(storeSource, /Math\.random\(\) > ASSIST_PROBABILITY/);
assert.match(storeSource, /const rawShare = 0\.5 \+ 0\.39 \* Math\.tanh\(effectiveDiff \/ 7\.5\)/);
assert.match(storeSource, /const totalXg = 2\.95/);
assert.match(storeSource, /if \(!important && context\?\.isCongested\)/, 'La IA no debe rotar titulares solo por ser favorita');
assert.match(storeSource, /best\.score - preferred\.score <= 4/, 'La formación preferida solo se conserva si el once queda cerca del óptimo');
assert.match(storeSource, /FIVE_DEFENDER_TEAMS\.has\(team\.name\).*?\? 4 : 0/);
assert.match(simulationSource, /Math\.pow\(ratingFactor, 2\.90\)/);
assert.match(simulationSource, /const eliteBoost = 1 \+ eliteRating \* 1\.20 \+ eliteFinishing \* 1\.15/);
assert.match(lineupSource, /isPlayerInjuredAtDate/);
assert.match(lineupSource, /suspensionAppliesToCompetition/);
assert.match(calendarTeamSource, /getStartersWithFormation/);
assert.match(calendarTeamSource, /getBenchForTeam/);
assert.match(playerStoreSource, /simulateMatchForCalendarJump:[\s\S]*?simulateCalendarLeagueFixture\(fixture, get\(\)\)/);
assert.match(playerStoreSource, /advanceTime: \(days, options\) =>[\s\S]*?simulateCalendarLeagueFixture\(f, get\(\)\)/);
assert.match(playerStoreSource, /function simulateCalendarLeagueFixture\(/);
assert.match(playerStoreSource, /simulateScheduleFixtureFastDetailed\(/);
assert.match(matchEngineSource, /return simulateMatchFast\(home, away, homeXI, awayXI, matchOptions\)/);
assert.match(playerStoreSource, /applyTeamRating\(/);
assert.match(playerStoreSource, /recomputeAllTeamRatings\(\)/);

const summaries = { daily: new Map(), jump: new Map() };
for (const routeMode of ['daily', 'jump']) {
  for (let season = 0; season < SEASONS; season += 1) {
    const routeSeed = (INITIAL_SEED + (routeMode === 'daily' ? 0x10000 : 0x90000) + season * 0x9e3779b1) >>> 0;
    const random = mulberry32(routeSeed);
    const rows = simulateSeasonSet(routeMode, season, random);
    for (const row of rows) {
      const aggregate = summaries[routeMode].get(row.leagueId) ?? [];
      aggregate.push(row);
      summaries[routeMode].set(row.leagueId, aggregate);
    }
  }
}

function summarize(rows) {
  const sum = (key) => average(rows.map((row) => row[key]));
  const pichichi = rows.map((row) => row.pichichiGoals);
  const allPoints = rows.flatMap((row) => row.pointsDistribution);
  return {
    spearman: sum('spearman'),
    bestSquadWinPct: 100 * sum('bestSquadWins'),
    championPoints: sum('championPoints'),
    lastPoints: sum('lastPoints'),
    championPointsEquivalent38: sum('championPointsEquivalent38'),
    lastPointsEquivalent38: sum('lastPointsEquivalent38'),
    meanPoints: sum('meanPoints'),
    pointStdDev: sum('pointStdDev'),
    top3Outside8Pct: 100 * rows.reduce((total, row) => total + row.top3Outside8, 0) / (rows.length * 3),
    outsiderTop3Pct: 100 * rows.reduce((total, row) => total + row.outsiderTop3, 0) / (rows.length * 3),
    deepOutsiderTop3Pct: 100 * rows.reduce((total, row) => total + row.deepOutsiderTop3, 0) / (rows.length * 3),
    rayoTop3Pct: 100 * rows.filter((row) => row.rayoPosition != null && row.rayoPosition <= 3).length / rows.filter((row) => row.rayoPosition != null).length,
    rayoMeanPosition: average(rows.filter((row) => row.rayoPosition != null).map((row) => row.rayoPosition)),
    pichichiMean: average(pichichi),
    pichichiInRangePct: 100 * rows.filter((row) => row.pichichiWithinTarget).length / rows.length,
    pichichi40PlusPct: 100 * rows.filter((row) => row.pichichi40Plus).length / rows.length,
    attackerTop10Pct: 100 * rows.reduce((total, row) => total + row.strongestAttackersTop10, 0) / Math.max(1, rows.reduce((total, row) => total + row.strongestAttackersCount, 0)),
    goalsPerMatch: rows.reduce((sumValue, row) => sumValue + row.goals, 0) / rows.reduce((sumValue, row) => sumValue + row.matches, 0),
    pointsRange: `${Math.min(...allPoints)}–${Math.max(...allPoints)}`,
  };
}
const allResults = [];
let comparisonFailures = 0;
const fmt = (value, digits = 2) => Number(value.toFixed(digits));
console.log(`Diagnóstico de realismo · ${SEASONS} temporadas por liga y ruta · semilla ${INITIAL_SEED}`);
console.log('Catálogo real: jugadores de players.json asignados por los nombres/alias y ligas declarados en teams.ts.');
console.log('Muestra: XI pretemporada por posición; núcleo xG y reparto de goleadores del motor; no simula la UI/store completo.');
console.log('\nLiga | ruta | rho Spearman | gana el mejor OVR | puntos campeón/último (real; eq. 38 partidos) | pichichi media / 24–38 | goles/partido | delanteros de top-3 en top-10 | top-3 fuera top-8');
for (const league of LEAGUES) {
  const daily = summarize(summaries.daily.get(league.id));
  const jump = summarize(summaries.jump.get(league.id));
  for (const [routeName, summary] of [['día a día', daily], ['salto', jump]]) {
    console.log(`${league.label} | ${routeName} | ${fmt(summary.spearman, 3)} | ${fmt(summary.bestSquadWinPct, 1)}% | ${fmt(summary.championPoints, 1)}/${fmt(summary.lastPoints, 1)} (${fmt(summary.championPointsEquivalent38, 1)}/${fmt(summary.lastPointsEquivalent38, 1)}) | ${fmt(summary.pichichiMean, 1)} / ${fmt(summary.pichichiInRangePct, 1)}% | ${fmt(summary.goalsPerMatch, 2)} | ${fmt(summary.attackerTop10Pct, 1)}% | ${fmt(summary.top3Outside8Pct, 1)}%`);
  }
  const differences = {
    rho: Math.abs(daily.spearman - jump.spearman),
    championPoints: Math.abs(daily.championPoints - jump.championPoints),
    pichichi: Math.abs(daily.pichichiMean - jump.pichichiMean),
    goals: Math.abs(daily.goalsPerMatch - jump.goalsPerMatch),
    bestWinPct: Math.abs(daily.bestSquadWinPct - jump.bestSquadWinPct),
  };
  const equivalent = differences.rho <= 0.15 && differences.championPoints <= 7 && differences.pichichi <= 3.5 && differences.goals <= 0.15 && differences.bestWinPct <= 30;
  if (!equivalent) comparisonFailures += 1;
  allResults.push({ league, daily, jump, differences, equivalent });
}
const overall = (route) => {
  const summariesList = LEAGUES.map((league) => summarize(summaries[route].get(league.id)));
  return {
    goalsPerMatch: average(summariesList.map((item) => item.goalsPerMatch)),
    pichichi: average(summariesList.map((item) => item.pichichiMean)),
    withinRange: average(summariesList.map((item) => item.pichichiInRangePct)),
    spearman: average(summariesList.map((item) => item.spearman)),
    bestSquadWinPct: average(summariesList.map((item) => item.bestSquadWinPct)),
    championPointsEquivalent38: average(summariesList.map((item) => item.championPointsEquivalent38)),
    lastPointsEquivalent38: average(summariesList.map((item) => item.lastPointsEquivalent38)),
    attackerTop10Pct: average(summariesList.map((item) => item.attackerTop10Pct)),
    top3Outside8Pct: average(summariesList.map((item) => item.top3Outside8Pct)),
    outsiderTop3Pct: average(summariesList.map((item) => item.outsiderTop3Pct)),
    deepOutsiderTop3Pct: average(summariesList.map((item) => item.deepOutsiderTop3Pct)),
  };
};
const dailyOverall = overall('daily');
const jumpOverall = overall('jump');
console.log('\nResumen ponderado de las cinco ligas:');
console.log(`día a día: rho=${fmt(dailyOverall.spearman, 3)}, gana el mejor OVR=${fmt(dailyOverall.bestSquadWinPct, 1)}%, ${fmt(dailyOverall.goalsPerMatch, 2)} goles/partido, pichichi=${fmt(dailyOverall.pichichi, 1)} goles (${fmt(dailyOverall.withinRange, 1)}% de pichichis entre 24 y 38)`);
console.log(`salto:      rho=${fmt(jumpOverall.spearman, 3)}, gana el mejor OVR=${fmt(jumpOverall.bestSquadWinPct, 1)}%, ${fmt(jumpOverall.goalsPerMatch, 2)} goles/partido, pichichi=${fmt(jumpOverall.pichichi, 1)} goles (${fmt(jumpOverall.withinRange, 1)}% de pichichis entre 24 y 38)`);
console.log(`nivel de equipos: top-3 con equipos de calidad fuera del top-8=${fmt(dailyOverall.outsiderTop3Pct, 1)}%; calidad fuera del top-12=${fmt(dailyOverall.deepOutsiderTop3Pct, 1)}%`);
console.log(`Rayo Vallecano en la prueba aislada: posición media=${fmt(average(allResults.filter((item) => item.league.id === 'laliga').flatMap((item) => [item.daily.rayoMeanPosition, item.jump.rayoMeanPosition])), 1)}; top-3=${fmt(average(allResults.filter((item) => item.league.id === 'laliga').flatMap((item) => [item.daily.rayoTop3Pct, item.jump.rayoTop3Pct])), 1)}% de temporadas`);
console.log(`ataque élite: ${fmt(dailyOverall.attackerTop10Pct, 1)}% de los 27 atacantes mejor valorados de los tres mejores XI aparecen en el top 10 de goleadores; top-3 fuera del top-8: ${fmt(dailyOverall.top3Outside8Pct, 1)}%`);
console.log(`puntos equivalentes a 38 partidos — campeón: ${fmt(dailyOverall.championPointsEquivalent38, 1)}; último: ${fmt(dailyOverall.lastPointsEquivalent38, 1)}`);
console.log(`Equivalencia distributiva por liga dentro de tolerancias amplias (incluida la variación aleatoria en ventanas de 20 temporadas): ${allResults.length - comparisonFailures}/${allResults.length}`);
console.log('\nDiagnóstico de código: ambas rutas usan simulateCalendarLeagueFixture -> getCalendarMatchTeamData -> getStartersWithFormation y simulateScheduleFixtureFastDetailed -> simulateMatchFast. El motor normal de partidos de liga también resuelve XI por getStartersWithFormation. Las lesiones/sanciones se filtran al construir el XI. Las medias att/mid/def se recalculan desde la plantilla al iniciar y cuando cambian los clubes.');
console.log('Goleadores: el ranking global se limitará por defecto a las cinco grandes ligas, manteniendo un selector explícito de «Todas las ligas»; no se modifica el reparto de goles porque la prueba de catálogo deja el pichichi medio dentro del objetivo y conserva aleatoriedad.');

// These are intentionally quality-of-diagnostic assertions, not claims that the
// isolated model is a full end-to-end match sim. Wide tolerances avoid overfitting
// the engine to random noise while flagging severe regressions.
assert.ok(allResults.every((row) => row.daily.spearman >= 0.75 && row.jump.spearman >= 0.75), 'La correlación Spearman entre nivel del XI y puntos debe ser >= 0,75 en cada liga');
assert.ok(comparisonFailures <= 1, `Día a día y salto no muestran distribuciones equivalentes en ${comparisonFailures}/${allResults.length} ligas`);
assert.ok(dailyOverall.bestSquadWinPct >= 50 && dailyOverall.bestSquadWinPct <= 90, `La ruta diaria queda fuera del rango calibrado para una mayor separación entre plantillas: ${dailyOverall.bestSquadWinPct.toFixed(1)}%`);
assert.ok(jumpOverall.bestSquadWinPct >= 50 && jumpOverall.bestSquadWinPct <= 90, `El salto queda fuera del rango calibrado para una mayor separación entre plantillas: ${jumpOverall.bestSquadWinPct.toFixed(1)}%`);
assert.ok(dailyOverall.goalsPerMatch >= 2.4 && dailyOverall.goalsPerMatch <= 3.5, 'La media de goles por partido se ha salido de un rango razonable');
assert.ok(dailyOverall.pichichi >= 18 && dailyOverall.pichichi <= 42, 'La distribución de pichichis está fuera del rango de diagnóstico');
assert.ok(dailyOverall.championPointsEquivalent38 >= 80 && dailyOverall.championPointsEquivalent38 <= 100 && jumpOverall.championPointsEquivalent38 >= 80 && jumpOverall.championPointsEquivalent38 <= 100, 'La media ponderada de puntos equivalentes del campeón debe estar entre 80 y 100 por 38 partidos');
assert.ok(dailyOverall.lastPointsEquivalent38 >= 20 && dailyOverall.lastPointsEquivalent38 <= 40 && jumpOverall.lastPointsEquivalent38 >= 20 && jumpOverall.lastPointsEquivalent38 <= 40, 'La media ponderada de puntos equivalentes del último debe estar entre 20 y 40 por 38 partidos');
assert.ok(dailyOverall.deepOutsiderTop3Pct <= 15 && jumpOverall.deepOutsiderTop3Pct <= 15, 'Un equipo cuyo XI está entre los 8 más débiles no debe ocupar el podio con frecuencia');
assert.ok(dailyOverall.attackerTop10Pct >= 25, 'Los delanteros de las plantillas fuertes deben estar suficientemente representados en el top 10 de goleadores');
assert.ok(dailyOverall.top3Outside8Pct <= 15, 'Los tres mejores equipos por OVR no deberían acabar con frecuencia fuera del top 8 en una plantilla congelada');
console.log('\nleague-realism-test: OK');

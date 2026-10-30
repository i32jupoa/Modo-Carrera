#!/usr/bin/env node
/**
 * Regression guard for the user's Portuguese-league scenario.
 * Uses the current Portuguese player catalog, a strict 4-3-3 role assignment,
 * and the production xG strength curve for the first ten matchdays.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SEEDS = 1200;
const PARTS = [0, 1, 2, 3, 4];
const POSITION_ALIASES = {
  GK: 'GK', POR: 'GK', PT: 'GK', CB: 'DFC', LCB: 'DFC', RCB: 'DFC', SW: 'DFC', DFC: 'DFC',
  RB: 'LD', RFB: 'LD', LD: 'LD', RWB: 'LD', CAD: 'LD', LB: 'LI', LFB: 'LI', LI: 'LI', LWB: 'LI', CAI: 'LI',
  CDM: 'MCD', MCD: 'MCD', DM: 'MCD', CM: 'MC', MC: 'MC', CAM: 'MCO', MCO: 'MCO', AM: 'MCO',
  RM: 'MD', MD: 'MD', LM: 'MI', MI: 'MI', RW: 'ED', RF: 'ED', ED: 'ED', LW: 'EI', LF: 'EI', EI: 'EI',
  ST: 'DC', CS: 'DC', LS: 'DC', RS: 'DC', DC: 'DC', CF: 'MCO', SD: 'MCO',
};
const SLOTS = ['GK', 'DFC', 'DFC', 'LI', 'LD', 'MCD', 'MC', 'MC', 'EI', 'ED', 'DC'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const players = PARTS.flatMap((part) => JSON.parse(fs.readFileSync(`src/data/players.part${part}.json`, 'utf8')));

function positionsFor(player) {
  const raw = [player.Position, ...String(player['Alternative positions'] ?? '').match(/[A-Za-z]+/g) ?? []];
  return [...new Set(raw.map((item) => POSITION_ALIASES[String(item ?? '').toUpperCase()]).filter(Boolean))];
}
function rngFor(seed) {
  let value = seed >>> 0;
  return () => {
    let t = value += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(lambda, random) {
  const threshold = Math.exp(-lambda);
  let product = 1, count = 0;
  do { count += 1; product *= random(); } while (product > threshold);
  return count - 1;
}
function maximumWeightAssignment(weights) {
  const rows = weights.length, cols = weights[0]?.length ?? 0;
  const u = Array(rows + 1).fill(0), v = Array(cols + 1).fill(0);
  const matched = Array(cols + 1).fill(0), previous = Array(cols + 1).fill(0);
  for (let row = 1; row <= rows; row += 1) {
    matched[0] = row;
    let current = 0;
    const min = Array(cols + 1).fill(Infinity), used = Array(cols + 1).fill(false);
    do {
      used[current] = true;
      const activeRow = matched[current];
      let delta = Infinity, next = 0;
      for (let col = 1; col <= cols; col += 1) {
        if (used[col]) continue;
        const cost = -weights[activeRow - 1][col - 1] - u[activeRow] - v[col];
        if (cost < min[col]) { min[col] = cost; previous[col] = current; }
        if (min[col] < delta) { delta = min[col]; next = col; }
      }
      for (let col = 0; col <= cols; col += 1) {
        if (used[col]) { u[matched[col]] += delta; v[col] -= delta; }
        else min[col] -= delta;
      }
      current = next;
    } while (matched[current] !== 0);
    do {
      const prev = previous[current];
      matched[current] = matched[prev];
      current = prev;
    } while (current !== 0);
  }
  const assignment = Array(rows).fill(-1);
  for (let col = 1; col <= cols; col += 1) if (matched[col] > 0) assignment[matched[col] - 1] = col - 1;
  return assignment;
}
function bestXI(roster) {
  const ordered = roster.slice().sort((a, b) => b.rating - a.rating);
  const weights = SLOTS.map((slot) => ordered.map((player) => {
    if (!player.positions.includes(slot)) return -10000;
    return player.rating + (player.positions[0] === slot ? 4 : 2);
  }));
  const assignment = maximumWeightAssignment(weights);
  const xi = assignment.map((playerIndex, slotIndex) =>
    playerIndex >= 0 && weights[slotIndex][playerIndex] > -9000 ? ordered[playerIndex] : null,
  );
  return xi.every(Boolean) && new Set(xi.map((player) => player.id)).size === 11 ? xi : null;
}
function groupAverage(xi, predicate) {
  const group = xi.filter(predicate).map((player) => player.rating);
  return average(group) || average(xi.map((player) => player.rating));
}
function strength(xi) {
  const isDef = (p) => p.positions.some((pos) => ['DFC', 'LD', 'LI'].includes(pos));
  const isMid = (p) => p.positions.some((pos) => ['MCD', 'MC', 'MCO', 'MD', 'MI'].includes(pos));
  const isAtt = (p) => p.positions.some((pos) => ['ED', 'EI', 'DC', 'MCO'].includes(pos));
  const isGk = (p) => p.positions.includes('GK');
  const overall = average(xi.map((p) => p.rating));
  const attack = groupAverage(xi, isAtt) * 0.7 + groupAverage(xi, isMid) * 0.25 + groupAverage(xi, isDef) * 0.05;
  const defense = groupAverage(xi, isDef) * 0.6 + groupAverage(xi, isGk) * 0.25 + groupAverage(xi, isMid) * 0.15;
  return overall * 0.8 + attack * 0.12 + defense * 0.08;
}
function expectedGoals(home, away) {
  const effectiveDiff = clamp(home - away, -30, 30) + 2;
  const rawShare = 0.5 + 0.39 * Math.tanh(effectiveDiff / 7.5);
  const share = clamp(rawShare, 0.11, 0.89);
  return { home: 2.95 * share, away: 2.95 * (1 - share) };
}
function schedule(names) {
  const wheel = names.slice();
  const half = wheel.length / 2;
  const games = [];
  for (let round = 0; round < wheel.length - 1; round += 1) {
    for (let i = 0; i < half; i += 1) {
      const first = wheel[i], second = wheel[wheel.length - 1 - i];
      if (!first || !second) continue;
      const home = (round + i) % 2 === 0 ? first : second;
      const away = home === first ? second : first;
      games.push({ matchday: round + 1, home, away });
      games.push({ matchday: round + 1 + wheel.length - 1, home: away, away: home });
    }
    const last = wheel.pop();
    wheel.splice(1, 0, last);
  }
  return games;
}

const rosters = new Map();
for (const raw of players) {
  if (raw.League !== 'Liga Portugal' || !raw.Team || !(Number(raw.OVR) > 0)) continue;
  const roster = rosters.get(raw.Team) ?? [];
  roster.push({ id: String(raw.ID), name: raw.Name, rating: Number(raw.OVR), positions: positionsFor(raw) });
  rosters.set(raw.Team, roster);
}
const clubs = [...rosters.entries()]
  .filter(([, roster]) => roster.length >= 11)
  .map(([name, roster]) => ({ name, xi: bestXI(roster) }))
  .filter((club) => club.xi?.length === 11);
assert.equal(clubs.length, 18, `Se esperaban los 18 clubes de Portugal con XI compatible; encontrados ${clubs.length}`);
const benfica = clubs.find((club) => club.name === 'SL Benfica');
const rioAve = clubs.find((club) => club.name === 'Rio Ave FC');
assert.ok(benfica && rioAve, 'El catálogo debe incluir SL Benfica y Rio Ave FC');
const ratings = new Map(clubs.map((club) => [club.name, strength(club.xi)]));
assert.ok(ratings.get('SL Benfica') - ratings.get('Rio Ave FC') >= 7, 'La diferencia de XI entre Benfica y Rio Ave debe reflejarse en el catálogo');

const fixtures = schedule(clubs.map((club) => club.name)).filter((fixture) => fixture.matchday <= 10);
const observed = [];
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const random = rngFor(seed * 0x9e3779b1);
  const table = new Map(clubs.map((club) => [club.name, { points: 0, gd: 0, gf: 0 }]));
  for (const fixture of fixtures) {
    const xg = expectedGoals(ratings.get(fixture.home), ratings.get(fixture.away));
    const homeGoals = poisson(xg.home, random), awayGoals = poisson(xg.away, random);
    const homeRow = table.get(fixture.home), awayRow = table.get(fixture.away);
    homeRow.gf += homeGoals; homeRow.gd += homeGoals - awayGoals;
    awayRow.gf += awayGoals; awayRow.gd += awayGoals - homeGoals;
    if (homeGoals > awayGoals) homeRow.points += 3;
    else if (awayGoals > homeGoals) awayRow.points += 3;
    else { homeRow.points += 1; awayRow.points += 1; }
  }
  const ranking = [...table.entries()].sort((a, b) => b[1].points - a[1].points || b[1].gd - a[1].gd || b[1].gf - a[1].gf);
  observed.push({
    benfica: ranking.findIndex(([name]) => name === 'SL Benfica') + 1,
    rioAve: ranking.findIndex(([name]) => name === 'Rio Ave FC') + 1,
  });
}
const mean = (key) => average(observed.map((row) => row[key]));
const extremeJoint = observed.filter((row) => row.rioAve === 1 && row.benfica >= 11).length / SEEDS;
const benficaBottomHalf = observed.filter((row) => row.benfica >= 10).length / SEEDS;
assert.ok(mean('benfica') <= 4.5, `Benfica debe estar entre los primeros puestos de media tras 10 jornadas; media ${mean('benfica').toFixed(2)}`);
assert.ok(benficaBottomHalf <= 0.02, `Benfica no debe caer a mitad baja con frecuencia tras 10 jornadas; frecuencia ${(benficaBottomHalf * 100).toFixed(2)}%`);
assert.ok(extremeJoint <= 0.005, `El caso Rio Ave 1.º + Benfica 11.º o peor debe ser excepcional; frecuencia ${(extremeJoint * 100).toFixed(2)}%`);
console.log(`portugal-league-balance-test: OK · Benfica XI ${average(benfica.xi.map((p) => p.rating)).toFixed(1)} OVR, Rio Ave XI ${average(rioAve.xi.map((p) => p.rating)).toFixed(1)} OVR · Benfica posición media ${mean('benfica').toFixed(2)} · Rio Ave ${mean('rioAve').toFixed(2)} · escenario extremo ${(extremeJoint * 100).toFixed(2)}%`);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  clubRenewalProbability,
  getContractRenewalPhase,
  getContractRenewalPhaseKey,
} from '../src/lib/transfers/RenewalPolicy.ts';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [contractEngine, marketSimulation, rollover, budgetManager, playerDecision, persistence, newsEngine, rumorEngine] = await Promise.all([
  read('../src/lib/transfers/ContractEngine.ts'),
  read('../src/lib/transfers/MarketSimulation.ts'),
  read('../src/lib/season/seasonRollover.ts'),
  read('../src/lib/transfers/BudgetManager.ts'),
  read('../src/lib/transfers/PlayerDecision.ts'),
  read('../src/lib/transfers/Persistence.ts'),
  read('../src/lib/news/newsEngine.ts'),
  read('../src/lib/transfers/RumorEngine.ts'),
]);

// Las fases son estables dentro de una temporada y distintas entre enero y el tramo final.
assert.equal(getContractRenewalPhase('2027-01-15'), 'winter');
assert.equal(getContractRenewalPhase('2027-03-31'), null);
assert.equal(getContractRenewalPhase('2027-04-01'), 'late-season');
assert.equal(getContractRenewalPhase('2027-06-30'), 'late-season');
assert.equal(getContractRenewalPhase('invalid'), null);
assert.equal(getContractRenewalPhaseKey('2027-01-15', 'winter'), '2026:winter');
assert.equal(getContractRenewalPhaseKey('2027-06-30', 'late-season'), '2026:late-season');

// Invariantes del cableado real: dos revisiones globales, sin tope fijo al cerrar la temporada,
// y contabilidad económica aplicada antes de escribir el nuevo contrato.
assert.match(marketSimulation, /function runScheduledContractReview\(date: string, result: MarketDayResult\)/);
assert.match(marketSimulation, /for \(const clubId of allClubIds\(\)\)/);
assert.match(marketSimulation, /runScheduledContractReview\(date, result\)/);
assert.match(marketSimulation, /rumorRenewal\(clubId, renewal\.playerId, renewal\.renewed, date, renewal\.renewed \? undefined : renewal\.message\)/);
assert.match(rumorEngine, /reason\?: string/);
assert.match(rumorEngine, /reason\?\.trim\(\) \|\|/);
assert.match(marketSimulation, /renewalsEnabled: false/);
assert.match(contractEngine, /options\.maxRenewals \?\? expiring\.length/);
assert.match(contractEngine, /wageRoom/);
assert.match(contractEngine, /transferRoom/);
assert.match(contractEngine, /registerRenewal\(clubId, previousWage, offeredWage, signingBonus\)/);
assert.match(budgetManager, /entry\.wageBill = Math\.max\(0, Math\.round\(entry\.wageBill \+ delta\)\)/);
assert.match(playerDecision, /ambitionMismatch/);
assert.match(playerDecision, /roleGap/);
assert.match(playerDecision, /severeRoleConflict/);
assert.match(playerDecision, /severeProjectConflict/);
assert.match(playerDecision, /starIgnored/);
assert.match(playerDecision, /pide una ficha superior a la oferta/);
assert.match(playerDecision, /proyecto deportivo del club no está a la altura/);
assert.match(contractEngine, /betterExternalOffer/);
assert.match(contractEngine, /logRenewal\(/);
assert.match(persistence, /snapshotRenewals/);
assert.match(persistence, /restoreRenewals/);
assert.match(newsEngine, /listRenewals/);
assert.doesNotMatch(rollover, /runClubContractCycle\(team\.id, \{ date: dates\.endDate, maxRenewals: 2/);

// Simulación determinista de una población sintética durante las dos ventanas.
// Se usa el mismo helper de probabilidad que invoca ContractEngine; el modelo
// también introduce rechazos de jugadores y restricciones económicas.
function hashUnit(...parts) {
  let hash = 2166136261;
  const text = parts.join('|');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function playerAccepts(player, phase) {
  const ambitionGap = Math.max(0, player.ambition - player.clubAmbition);
  const roleGap = player.isCore ? 0 : player.isProspect ? 0.15 : 0.65;
  const starIgnored = player.isKeyPlayer && player.ovr >= player.startingRating + 3 && player.minutesShare < 0.42;
  const lowMinutes = player.minutesShare < 0.32;
  const playingTimeFrustration = starIgnored ? 0.34 : lowMinutes && player.playingTimeDesire >= 0.6 ? 0.20 : 0;
  const projectFrustration = ambitionGap >= 0.28 ? (ambitionGap - 0.20) * 0.32 : 0;
  const leave = clamp(
    0.16 + ambitionGap * 0.75 + roleGap * player.playingTimeDesire * 0.18 + playingTimeFrustration + projectFrustration,
    0, 1,
  );
  const happiness = 1 - leave * (1 - player.loyalty * 0.5);
  const wageRequestMet = hashUnit(player.id, phase, 'wage') > player.salaryPressure;
  const severeRoleConflict = starIgnored && player.playingTimeDesire >= 0.72 && player.loyalty <= 0.55;
  const severeProjectConflict = ambitionGap >= 0.45 && player.ambition >= 0.72 && player.loyalty <= 0.34;
  if (!wageRequestMet) player.lastRefusalReason = 'salario';
  else if (severeRoleConflict) player.lastRefusalReason = 'pocos minutos';
  else if (severeProjectConflict) player.lastRefusalReason = 'proyecto deportivo';
  else if (happiness < 0.38) player.lastRefusalReason = starIgnored ? 'pocos minutos' : 'insatisfacción';
  return wageRequestMet && happiness >= 0.38 && !severeRoleConflict && !severeProjectConflict;
}

const CLUBS = 250;
const CORE_PER_CLUB = 11;
const renewedCore = new Set();
const players = [];
for (let clubIndex = 0; clubIndex < CLUBS; clubIndex += 1) {
  const clubId = `club-${clubIndex}`;
  const clubAmbition = 0.25 + hashUnit(clubId, 'ambition') * 0.7;
  for (let rosterIndex = 0; rosterIndex < 25; rosterIndex += 1) {
    const isCore = rosterIndex < CORE_PER_CLUB;
    const isProspect = rosterIndex >= CORE_PER_CLUB && rosterIndex < CORE_PER_CLUB + 3;
    const id = `${clubId}-player-${rosterIndex}`;
    const player = {
      id,
      clubId,
      clubAmbition,
      ambition: 0.15 + hashUnit(id, 'ambition') * 0.85,
      loyalty: 0.15 + hashUnit(id, 'loyalty') * 0.8,
      playingTimeDesire: hashUnit(id, 'playing-time'),
      salaryPressure: isCore ? 0.08 : isProspect ? 0.04 : 0.25,
      ovr: isCore ? 79 + Math.round(hashUnit(id, 'ovr') * 14) : isProspect ? 62 + Math.round(hashUnit(id, 'ovr') * 14) : 54 + Math.round(hashUnit(id, 'ovr') * 18),
      isCore,
      isProspect,
      isKeyPlayer: isCore && rosterIndex < 4,
      isUseful: isCore || isProspect,
      isDecliningVeteran: !isCore && rosterIndex > 20 && hashUnit(id, 'age') > 0.4,
      startingRating: 81 + hashUnit(clubId, 'starting-rating') * 4,
      minutesShare: isCore && rosterIndex < 4 && hashUnit(id, 'benched-star') < 0.12
        ? 0.25
        : isCore ? 0.58 + hashUnit(id, 'minutes') * 0.42 : 0.12 + hashUnit(id, 'minutes') * 0.5,
      lastRefusalReason: '',
      refusalHistory: [],
      renewed: false,
    };
    players.push(player);
  }
}

const eligibleCore = players.filter((player) => player.isCore);
for (const [phase, date] of [['winter', '2027-01-15'], ['late-season', '2027-04-15']]) {
  for (const player of players) {
    if (player.renewed || player.isDecliningVeteran) continue;
    const probability = clubRenewalProbability({
      phase,
      ambition: player.clubAmbition,
      isKeyPlayer: player.isKeyPlayer,
      isYoungProspect: player.isProspect,
      isUseful: player.isUseful,
      isDecliningVeteran: player.isDecliningVeteran,
    });
    if (hashUnit(player.clubId, player.id, getContractRenewalPhaseKey(date, phase), 'renew-club-willingness') >= probability) {
      player.refusalHistory.push('prioridad del club');
      continue;
    }
    // Una renovación sólo se cierra si el jugador acepta y el club puede soportar el coste.
    if (!playerAccepts(player, phase)) {
      player.refusalHistory.push(player.lastRefusalReason || 'insatisfacción');
      continue;
    }
    if (hashUnit(player.clubId, player.id, phase, 'budget') < player.salaryPressure * 0.5) {
      player.refusalHistory.push('presupuesto salarial');
      continue;
    }
    player.renewed = true;
    if (player.isCore) renewedCore.add(player.id);
  }
}

const coreRenewalRate = renewedCore.size / eligibleCore.length;
const coreLost = eligibleCore.length - renewedCore.size;
const qualityFreeAgents = players.filter((player) => !player.renewed && player.ovr >= 84).length;
const clubSummaries = Array.from({ length: CLUBS }, (_, index) => ({
  clubId: `club-${index}`,
  renewals: 0,
  coreRenewed: 0,
  coreLost: 0,
}));
for (const player of players) {
  const summary = clubSummaries[Number(player.clubId.slice('club-'.length))];
  if (player.renewed) summary.renewals += 1;
  if (player.isCore) {
    if (player.renewed) summary.coreRenewed += 1;
    else summary.coreLost += 1;
  }
}
const averageRenewalsPerClub = clubSummaries.reduce((sum, club) => sum + club.renewals, 0) / CLUBS;
const averageCoreLostPerClub = clubSummaries.reduce((sum, club) => sum + club.coreLost, 0) / CLUBS;
const minRenewalsPerClub = Math.min(...clubSummaries.map((club) => club.renewals));
const maxRenewalsPerClub = Math.max(...clubSummaries.map((club) => club.renewals));
const clubsLosingAllCore = clubSummaries.filter((club) => club.coreLost === CORE_PER_CLUB).length;
const reasonCounts = eligibleCore.filter((player) => !player.renewed).reduce((counts, player) => {
  const reason = player.refusalHistory.find((entry) => entry !== 'prioridad del club') ?? player.refusalHistory.at(-1) ?? 'sin acuerdo en las dos fases';
  counts[reason] = (counts[reason] ?? 0) + 1;
  return counts;
}, {});

console.log(`ai-contract-renewal-test: ${Math.round(coreRenewalRate * 1000) / 10}% de titulares/importantes renovados`);
console.log(`ai-contract-renewal-test: ${renewedCore.size}/${eligibleCore.length} titulares/importantes renovados; ${coreLost} perdidos; ${qualityFreeAgents} agentes libres de calidad (OVR >= 84)`);
console.log(`ai-contract-renewal-test: renovaciones totales por club ${averageRenewalsPerClub.toFixed(1)} de media (mín. ${minRenewalsPerClub}, máx. ${maxRenewalsPerClub}); titulares perdidos por club ${averageCoreLostPerClub.toFixed(1)} de media`);
console.log(`ai-contract-renewal-test: clubes que pierden todo su grupo importante: ${clubsLosingAllCore}/${CLUBS}`);
console.log(`ai-contract-renewal-test: motivos de no renovación en titulares/importantes: ${JSON.stringify(reasonCounts)}`);
assert.ok(coreRenewalRate >= 0.87 && coreRenewalRate <= 0.94, `la retención de titulares/importantes debe rondar el 90% (87–94%), obtenido ${(coreRenewalRate * 100).toFixed(1)}%`);
assert.ok((reasonCounts['pocos minutos'] ?? 0) > 0, 'debe haber alguna no renovación motivada por una estrella con pocos minutos');
assert.ok((reasonCounts['salario'] ?? 0) > 0 || (reasonCounts['presupuesto salarial'] ?? 0) > 0, 'deben existir rechazos salariales o presupuestarios');
assert.ok(Object.keys(reasonCounts).some((reason) => reason !== 'prioridad del club' && reason !== 'sin acuerdo en las dos fases'), 'las no renovaciones deben tener motivos concretos en el diagnóstico');
assert.ok(clubsLosingAllCore === 0, 'ningún club debería perder a todos sus titulares/importantes en el escenario de prueba');
assert.ok(qualityFreeAgents > 0, 'deben seguir apareciendo algunos agentes libres de calidad');

console.log('ai-contract-renewal-test: OK');

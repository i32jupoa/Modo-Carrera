import assert from 'node:assert/strict';
import {
  initializeDynamicStats,
  calculateMonthlyProgression,
  calculateSeasonEndProgression,
} from '../src/lib/playerProgression.ts';

function stats({ ovr = 80, potential = ovr + 8, goals = 0, assists = 4, cleanSheets = 8, appearances = 30, minutes = 2400, averageRating = 6.9 } = {}) {
  const dynamic = initializeDynamicStats(ovr, potential);
  Object.assign(dynamic, {
    seasonAppearances: appearances,
    seasonMinutes: minutes,
    seasonGoals: goals,
    seasonAssists: assists,
    seasonCleanSheets: cleanSheets,
    seasonAverageRating: averageRating,
  });
  return dynamic;
}

const goodSeason80 = stats({ ovr: 80, potential: 90, goals: 8, assists: 7, cleanSheets: 4, averageRating: 7.1 });
const goodSeason94 = stats({ ovr: 94, potential: 96, goals: 28, assists: 10, cleanSheets: 0, minutes: 2700, averageRating: 7.4 });
const monthly80 = calculateMonthlyProgression(goodSeason80, 22, ['MC']);
const monthly94 = calculateMonthlyProgression(goodSeason94, 22, ['DC']);
const end80 = calculateSeasonEndProgression(goodSeason80, 22, ['MC'], 1);
const end94 = calculateSeasonEndProgression(goodSeason94, 22, ['DC'], 1);

assert.ok(monthly80 > monthly94 * 2, `la media 80 debe progresar bastante más que la media 94 (${monthly80} vs ${monthly94})`);
assert.ok(end80 > -0.48 && end80 < 0.38, `el ajuste de fin de temporada debe ser pequeño (${end80})`);
assert.ok(end94 > -0.48 && end94 < 0.38, `el ajuste de fin de temporada para un jugador de élite debe ser pequeño (${end94})`);
assert.ok(Math.abs(end94) < 0.16, `un jugador de 94 OVR no debe ganar mucha media al cierre (${end94})`);

const defensiveMidNoGoals = stats({ ovr: 80, goals: 0, assists: 4, cleanSheets: 8, averageRating: 6.9 });
const defensiveMidGoals = stats({ ovr: 80, goals: 12, assists: 8, cleanSheets: 8, averageRating: 7.3 });
const mcdNoGoalsDelta = calculateMonthlyProgression(defensiveMidNoGoals, 25, ['MCD']);
const mcdGoalsDelta = calculateMonthlyProgression(defensiveMidGoals, 25, ['MCD']);
assert.ok(mcdNoGoalsDelta > 0, `un MCD no debe ser castigado simplemente por marcar pocos goles (${mcdNoGoalsDelta})`);
assert.ok(mcdGoalsDelta > mcdNoGoalsDelta + 0.04, 'una temporada goleadora de un MCD debe recibir una recompensa adicional clara');

const sameSeasonAt19 = calculateSeasonEndProgression(goodSeason80, 19, ['MC'], 1);
const sameSeasonAt35 = calculateSeasonEndProgression(goodSeason80, 35, ['MC'], 1);
assert.ok(sameSeasonAt19 > sameSeasonAt35 + 0.15, `la edad debe influir en el ajuste de cierre (${sameSeasonAt19} vs ${sameSeasonAt35})`);

console.log(`player-progression-balance-test: mensual 80=${monthly80.toFixed(3)}, 94=${monthly94.toFixed(3)}; cierre 80=${end80.toFixed(3)}, 94=${end94.toFixed(3)}`);
console.log(`player-progression-balance-test: MCD sin goles=${mcdNoGoalsDelta.toFixed(3)}, MCD goleador=${mcdGoalsDelta.toFixed(3)}`);
console.log('player-progression-balance-test: OK');

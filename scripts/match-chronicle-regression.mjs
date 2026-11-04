import assert from 'node:assert/strict';
import { buildMatchChronicleItems } from '../src/lib/matchChronicle.ts';
import { formatMatchMinute, formatMatchMinuteWithMark, getMatchMinuteElapsedValue, getMatchMinuteSortValue } from '../src/lib/matchTime.ts';

assert.equal(formatMatchMinute(94), '90+4', 'El 94 de tiempo reglamentario debe mostrarse como 90+4');
assert.equal(formatMatchMinuteWithMark(94), '90+4′', 'El minuto añadido debe conservar el signo de minuto');
assert.equal(formatMatchMinute(94, { matchPeriod: 'extraTime' }), '94', 'El 94 de la prórroga no debe confundirse con el añadido del 90');
assert.equal(formatMatchMinute(47, { stoppagePeriod: 'firstHalf', stoppageElapsed: 2 }), '45+2', 'El añadido de la primera parte debe indicarse explícitamente');
assert.equal(formatMatchMinute(107, { stoppagePeriod: 'extraFirstHalf', stoppageElapsed: 2 }), '105+2', 'El añadido de la primera parte de la prórroga debe indicarse explícitamente');
assert.equal(formatMatchMinute(107, { matchPeriod: 'extraTime', stoppagePeriod: 'extraFirstHalf', stoppageElapsed: 2 }), '105+2', 'El añadido de la prórroga debe prevalecer sobre el minuto bruto');
assert.equal(formatMatchMinute(121, { stoppagePeriod: 'extraSecondHalf', stoppageElapsed: 1 }), '120+1', 'El añadido del final de la prórroga debe indicarse explícitamente');
assert.equal(formatMatchMinute(121, { matchPeriod: 'extraTime', stoppagePeriod: 'extraSecondHalf', stoppageElapsed: 1 }), '120+1', 'El añadido final de la prórroga debe conservarse como 120+1');
assert.equal(formatMatchMinute(120, { displayMinuteLabel: "120+1'" }), '120+1', 'Debe reconocer la etiqueta de reloj guardada por el partido en directo');
assert.equal(formatMatchMinute(94, { stoppagePeriod: 'secondHalf', stoppageElapsed: 4 }), '90+4');
assert.equal(formatMatchMinute(94, { stoppagePeriod: 'secondHalf', stoppageElapsed: 4, displayMinuteLabel: '90+1' }), '90+4', 'El progreso real del añadido prevalece sobre una etiqueta provisional antigua');
assert.equal(formatMatchMinute(47, { stoppagePeriod: 'firstHalf', stoppageElapsed: 2 }), '45+2');
assert.equal(formatMatchMinute(107, { stoppagePeriod: 'extraFirstHalf', stoppageElapsed: 2 }), '105+2');
assert.equal(formatMatchMinute(121, { stoppagePeriod: 'extraSecondHalf', stoppageElapsed: 1 }), '120+1');
assert.equal(formatMatchMinute('90+4'), '90+4', 'Debe conservar minutos añadidos guardados como texto');
assert.equal(getMatchMinuteSortValue('90+4'), getMatchMinuteSortValue(94), 'Una etiqueta 90+4 debe ordenarse como el minuto transcurrido 94');
assert.equal(formatMatchMinute(90, { stoppagePeriod: 'secondHalf', stoppageElapsed: 4 }), '90+4');
assert.equal(getMatchMinuteElapsedValue(90, { stoppagePeriod: 'secondHalf', stoppageElapsed: 4 }), 94, 'La posición de la línea de tiempo debe avanzar hasta el minuto transcurrido real del añadido');
assert.ok(getMatchMinuteSortValue(94, { matchPeriod: 'extraTime' }) > getMatchMinuteSortValue(94), 'La ordenación debe distinguir 94 de tiempo reglamentario y 94 de prórroga');

const items = buildMatchChronicleItems({
  events: [
    { minute: 77, team: 'away', type: 'penalty_goal', scorerId: 'away-pen', scorerName: 'Lanzador visitante', detail: 'Penalti: Defensa local derriba al delantero' },
    { minute: 12, team: 'home', type: 'goal', scorerId: 'home-goal', scorerName: 'Delantero local' },
  ],
  cards: [{ minute: 81, team: 'home', playerId: 'home-card', playerName: 'Central local', cardType: 'red' }],
  highlights: [
    { minute: 25, team: 'home', type: 'save', playerId: 'home-gk', playerName: 'Portero local', detail: 'Buena intervención' },
    { minute: 31, team: 'away', type: 'save', playerId: 'away-gk', playerName: 'Portero visitante', detail: 'Mano fuerte al disparo' },
    { minute: 42, team: 'away', type: 'woodwork', playerId: 'away-wing', playerName: 'Extremo visitante', detail: 'Al larguero' },
    { minute: 59, team: 'away', type: 'penalty_missed', playerId: 'away-pen', playerName: 'Lanzador visitante', detail: 'Penalti: Defensa local derriba al delantero — lo falla' },
    { minute: 63, team: 'home', type: 'big_chance', playerId: 'home-forward', playerName: 'Delantero local', detail: 'Disparo a bocajarro' },
  ],
  substitutions: [{ minute: 70, team: 'away', playerInId: 'away-in', playerInName: 'Suplente visitante', playerOutId: 'away-out', playerOutName: 'Titular visitante' }],
  moments: [
    { id: 'save-moment', type: 'save', minute: 25, teamSide: 'home', playerId: 'home-gk', playerName: 'Portero local', title: 'PARADÓN', body: 'Evita el gol.' },
    { id: 'penalty-save', type: 'penalty_save', minute: 59, teamSide: 'home', playerId: 'home-gk', playerName: 'Portero local', title: 'PENALTI DETENIDO', body: 'Detiene el lanzamiento.' },
  ],
});

assert.ok(items.some((item) => item.kind === 'moment' && item.data.type === 'save'), 'Debe conservar el paradón guardado del directo');
assert.ok(items.some((item) => item.kind === 'highlight' && item.data.type === 'save' && item.data.team === 'away'), 'Debe mostrar las paradas guardadas en partidos simulados de otros equipos');
assert.ok(items.some((item) => item.kind === 'moment' && item.data.type === 'penalty_save'), 'Debe conservar el penalti detenido del directo');
assert.ok(items.some((item) => item.kind === 'highlight' && item.data.type === 'woodwork'), 'Debe mostrar el larguero de partidos simulados');
assert.ok(items.some((item) => item.kind === 'highlight' && item.data.type === 'big_chance'), 'Debe mostrar grandes ocasiones');
assert.ok(items.some((item) => item.kind === 'highlight' && item.data.type === 'penalty_missed'), 'Debe mostrar penaltis fallados');
assert.ok(items.some((item) => item.kind === 'goal' && item.data.type === 'penalty_goal'), 'Debe mostrar penaltis transformados');
assert.ok(items.some((item) => item.kind === 'card'), 'Debe mostrar tarjetas');
assert.ok(items.some((item) => item.kind === 'sub'), 'Debe mostrar sustituciones');
assert.equal(items.filter((item) => item.minute === 25 && item.data.type === 'save').length, 1, 'El paradón no debe duplicarse como highlight y momento');
assert.deepEqual(items.map((item) => item.minute), [...items.map((item) => item.minute)].sort((a, b) => b - a), 'La crónica debe ir del minuto más reciente al más antiguo, igual que el partido en directo');
assert.ok(items.some((item) => item.data.team === 'away'), 'Debe incluir acciones del visitante igual que del local');

console.log('OK: crónica compartida muestra paradones, penaltis, grandes ocasiones, palos, goles, tarjetas y cambios sin duplicar momentos.');

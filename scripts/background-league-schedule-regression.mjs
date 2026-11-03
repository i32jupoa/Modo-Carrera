import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addIsoDays } from '../src/lib/season/calendarFactory.ts';
import {
  getBackgroundLeagueSimulationSlots,
  getBackgroundLeagueSlotSide,
  getBackgroundLeagueOverflowRoundDueDate,
} from '../src/lib/backgroundLeagueSchedule.ts';

const teamId = 'controlled-club';
const kickoff = '2026-08-15';
const fixture = (matchday, date, result = null) => ({
  homeId: teamId,
  awayId: `opponent-${matchday}`,
  matchday,
  date,
  result,
});

assert.deepEqual(
  getBackgroundLeagueSimulationSlots(
    [fixture(4, '2026-09-12')],
    teamId,
    '2026-09-11',
    kickoff,
    '2026-09-12',
  ),
  [{ matchday: 4, side: 'before', date: '2026-09-11' }],
  'La mitad asignada al día anterior debe simularse justo antes del partido de liga del usuario.',
);

assert.deepEqual(
  getBackgroundLeagueSimulationSlots(
    [fixture(4, '2026-09-12', { homeGoals: 2, awayGoals: 1 })],
    teamId,
    '2026-09-13',
    kickoff,
    '2026-09-19',
  ),
  [{ matchday: 4, side: 'after', date: '2026-09-13' }],
  'La otra mitad debe simularse justo después del partido del usuario.',
);

assert.deepEqual(
  getBackgroundLeagueSimulationSlots(
    [fixture(4, '2026-09-12')],
    teamId,
    '2026-09-10',
    kickoff,
    '2026-09-12',
  ),
  [],
  'No debe simularse fuera de las dos fechas contiguas al partido de liga.',
);

assert.deepEqual(
  getBackgroundLeagueSimulationSlots(
    [fixture(1, undefined)],
    teamId,
    '2026-08-14',
    kickoff,
    '2026-08-15',
  ),
  [{ matchday: 1, side: 'before', date: '2026-08-14' }],
  'Los guardados antiguos sin fecha deben usar el calendario semanal como respaldo.',
);

assert.equal(getBackgroundLeagueSlotSide(0), 'before');
assert.equal(getBackgroundLeagueSlotSide(1), 'after');
assert.equal(getBackgroundLeagueSlotSide(2), 'before');
assert.equal(getBackgroundLeagueSlotSide(3), 'after');

// A 38-matchday user league must not stop a longer background competition.
// Each overflow round (e.g. Hypermotion J39-J42) unlocks on its own calendar date.
const hypermotionRound39 = [
  { homeId: 'club-a', awayId: 'club-b', matchday: 39, date: '2027-05-21' },
  { homeId: 'club-c', awayId: 'club-d', matchday: 39, date: '2027-05-23' },
];
assert.equal(
  getBackgroundLeagueOverflowRoundDueDate(hypermotionRound39, 39, 38, '2027-05-22', kickoff),
  null,
  'Una jornada repartida en varios días espera a la fecha del último encuentro.',
);
assert.equal(
  getBackgroundLeagueOverflowRoundDueDate(hypermotionRound39, 39, 38, '2027-05-23', kickoff),
  '2027-05-23',
  'La jornada 39 debe desbloquearse por su fecha propia, aunque la liga controlada termine en la 38.',
);
assert.equal(
  getBackgroundLeagueOverflowRoundDueDate(hypermotionRound39, 38, 38, '2027-06-01', kickoff),
  null,
  'La lógica de jornadas extra no debe alterar el calendario ordinario.',
);
for (const matchday of [39, 40, 41, 42]) {
  const scheduledDate = addIsoDays(kickoff, (matchday - 1) * 7);
  assert.equal(
    getBackgroundLeagueOverflowRoundDueDate(
      [{ homeId: 'club-a', awayId: 'club-b', matchday }],
      matchday, 38, scheduledDate, kickoff,
    ),
    scheduledDate,
    `La jornada extra ${matchday} debe simularse al llegar su fecha.`,
  );
}

const store = readFileSync(new URL('../src/lib/store.ts', import.meta.url), 'utf8');
const players = readFileSync(new URL('../src/store/playersStore.ts', import.meta.url), 'utf8');
const routes = ['fixtures.tsx', 'standings.tsx', 'teams.tsx', 'season.tsx']
  .map((file) => readFileSync(new URL(`../src/routes/${file}`, import.meta.url), 'utf8'))
  .join('\n');

assert.match(store, /getBackgroundLeagueSimulationSlots\(/,
  'El avance diario debe programar las ligas secundarias alrededor del partido del usuario.');
assert.match(store, /processScheduledBackgroundSims\(/,
  'Las jornadas programadas deben resolverse desde la cola automática del calendario.');
assert.match(store, /getBackgroundLeagueOverflowRoundDueDate\(/,
  'Las jornadas por encima del máximo de la liga del usuario deben activarse por sus fechas propias.');
assert.match(store, /firstIncompleteMatchday > userLeagueMaxMatchday/,
  'El scheduler debe reconocer expresamente las jornadas posteriores al final de la liga controlada.');
assert.match(players, /simulatePromotionPlayoffsThroughDate\(currentSave, nextDate, false\)/,
  'Los playoffs de ascenso deben seguir procesándose automáticamente tras completar la liga regular.');
assert.doesNotMatch(players, /ensureStatsForLeague|generateRealisticStatsForO1Leagues/,
  'El store no debe exponer simulación/estadísticas bajo demanda por liga.');
assert.doesNotMatch(routes, /ensureStatsForLeague/,
  'Abrir jornadas, clasificaciones o equipos no debe disparar simulaciones bajo demanda.');

console.log('Background league schedule regression checks passed.');

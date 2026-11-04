import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addFinancialIncomeNotification } from '../src/lib/seasonInbox.ts';

const store = await readFile(new URL('../src/lib/store.ts', import.meta.url), 'utf8');
const rollover = await readFile(new URL('../src/lib/season/seasonRollover.ts', import.meta.url), 'utf8');
const home = await readFile(new URL('../src/routes/index.tsx', import.meta.url), 'utf8');

const helperStart = store.indexOf('export function grantEuropeanParticipationAtSeasonStart');
const helperEnd = store.indexOf('/**', helperStart + 20);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'debe existir el otorgamiento de participación al inicio de temporada');
const helper = store.slice(helperStart, helperEnd);
assert.match(helper, /getSeasonStartYear\(save\.season\).*07-01/s, 'la fecha del premio debe ser el 1 de julio de la temporada');
assert.match(helper, /getEuropeanParticipantsForSave\(save, competition\.id\)/, 'se debe comprobar la plaza real en cada competición europea');
assert.match(helper, /financial_income:\$\{competition\.id\}:participation/, 'el ingreso debe tener una clave idempotente por competición');
assert.match(helper, /date: seasonStartDate/, 'el comunicado debe llevar fecha del 1 de julio');
assert.match(helper, /nextNotifications = Array\.isArray\(save\.seasonNotifications\)/, 'el nuevo comunicado no debe sobrescribirse al terminar el abono');

const newSaveStart = store.indexOf('export function newSave');
const newSaveEnd = store.indexOf('/* ============================================================', newSaveStart);
const newSave = store.slice(newSaveStart, newSaveEnd);
assert.match(newSave, /return grantEuropeanParticipationAtSeasonStart\(initialSave\)/, 'una carrera nueva debe recibir el premio inmediatamente');

const aftermathStart = store.indexOf('function applyUCLMatchAftermath');
const aftermathEnd = store.indexOf('export function simulateUCLMatchday', aftermathStart);
const aftermath = store.slice(aftermathStart, aftermathEnd);
assert.doesNotMatch(aftermath, /grantUCLPrizeOnce\(next,\s*["']participation/, 'el primer partido ya no debe activar el premio de participación');

assert.match(rollover, /nextSave = grantEuropeanParticipationAtSeasonStart\(nextSave\)/, 'el cambio de temporada debe dar el premio al preparar la nueva campaña');
assert.match(home, /save = grantEuropeanParticipationAtSeasonStart\(save\)/, 'las partidas antiguas deben reparar el hito al cargarse');

const notification = addFinancialIncomeNotification([], {
  id: '2027/28:financial_income:ucl:participation', season: '2027/28', date: '2027-07-01',
  teamId: 'club-user', amount: 18_600_000, category: 'Premio deportivo · Champions League',
  message: 'El club ha recibido un premio por participar en la fase liga de la Champions League.',
});
assert.equal(notification[0].date, '2027-07-01', 'el buzón debe reflejar el 1 de julio');
assert.equal(notification[0].amount, 18_600_000);
assert.equal(addFinancialIncomeNotification(notification, {
  id: notification[0].id, season: '2027/28', date: '2027-07-01', teamId: 'club-user',
  amount: 18_600_000, category: 'Premio', message: 'duplicado',
}).length, 1, 'el comunicado no debe duplicarse');

console.log('european-participation-start-date-regression: OK');
console.log('✓ Pago de participación al crear la carrera y al iniciar cada temporada');
console.log('✓ Buzón fechado el 1 de julio');
console.log('✓ Partidas antiguas: corrige la fecha si ya se cobró y evita duplicados');
console.log('✓ El primer partido ya no genera el pago de participación');

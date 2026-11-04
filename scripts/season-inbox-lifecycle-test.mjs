import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addFinancialIncomeNotification, addSquadMilestoneNotifications, removeHatTrickInboxNotifications } from '../src/lib/seasonInbox.ts';

const base = {
  existing: [],
  season: '2027-28',
  date: '2028-03-31',
  teamId: 'club-user',
  recoveries: [
    { id: 'p-recover', name: 'Jugador Recuperado', injuryStartDate: '2028-03-10', injuredUntilDate: '2028-03-31' },
    { id: 'p-old', name: 'Jugador Antiguo', injuryStartDate: '2027-11-01', injuredUntilDate: '2027-11-20' },
  ],
  expiringContracts: [
    { playerId: 'p-contract', playerName: 'Jugador Contrato', expiresAt: '2028-06-29' },
    { playerId: 'p-later', playerName: 'Jugador Lejano', expiresAt: '2029-03-31' },
  ],
};

const first = addSquadMilestoneNotifications(base);
assert.equal(first.length, 3, 'debe crear recuperación y avisos de contrato a tres meses y un año');
assert.equal(first[0].type, 'player_recovered');
assert.match(first[0].message, /vuelve a estar disponible/);
assert.equal(first[1].type, 'contract_expiring_soon');
assert.match(first[1].message, /meses de contrato/);
assert.equal(first[2].type, 'contract_one_year');
assert.match(first[2].message, /aproximadamente un año de contrato/);
assert.equal(addSquadMilestoneNotifications({ ...base, existing: first }).length, first.length, 'los hitos no deben duplicarse');

const skippedDate = addSquadMilestoneNotifications({
  ...base,
  date: '2028-04-02',
  recoveries: [{ id: 'p-recover', name: 'Jugador Recuperado', injuryStartDate: '2028-03-10', injuredUntilDate: '2028-03-31' }],
  expiringContracts: [],
});
assert.equal(skippedDate.length, 1, 'un salto de pocos días no debe perder el aviso de recuperación');

const financialIncome = addFinancialIncomeNotification([], {
  id: '2027-28:financial_income:ucl:advanceQF-club-user',
  season: '2027-28',
  date: '2028-03-14',
  teamId: 'club-user',
  amount: 12_500_000,
  category: 'Premio deportivo · Champions League',
  message: 'El club ha recibido un premio por alcanzar los cuartos de final de la Champions League.',
});
assert.equal(financialIncome.length, 1, 'un ingreso debe generar un comunicado del buzón');
assert.equal(financialIncome[0].type, 'financial_income');
assert.equal(financialIncome[0].amount, 12_500_000);
assert.equal(addFinancialIncomeNotification(financialIncome, {
  id: financialIncome[0].id,
  season: '2027-28', date: '2028-03-14', teamId: 'club-user', amount: 12_500_000,
  category: 'Premio deportivo · Champions League', message: 'Duplicado',
}).length, 1, 'los avisos financieros no deben duplicarse');
assert.equal(addFinancialIncomeNotification(financialIncome, {
  id: 'zero', season: '2027-28', date: '2028-03-14', teamId: 'club-user', amount: 0,
  category: 'Premio', message: 'Sin ingreso',
}).length, 1, 'no se deben notificar importes nulos');

const storeSource = await readFile(new URL('../src/lib/store.ts', import.meta.url), 'utf8');
const dailyMailbox = storeSource.slice(storeSource.indexOf('export function applyDailyMailboxMessages'), storeSource.indexOf('function simulateFixtureInline'));
assert.ok(dailyMailbox.indexOf('seasonNotifications: addSquadMilestoneNotifications') < dailyMailbox.indexOf('if (hasUserMatch || squad.length === 0) return'), 'los avisos de plantilla deben añadirse antes del retorno por partido del usuario');
assert.match(dailyMailbox, /getClubPlayers\(userTeamId\)/, 'los contratos deben reconstruirse desde la plantilla para partidas antiguas');
assert.doesNotMatch(storeSource, /player_hat_trick:/, 'no se deben generar nuevos avisos de hat-trick');

const mailboxUi = await readFile(new URL('../src/routes/mailbox.tsx', import.meta.url), 'utf8');
assert.match(mailboxUi, /player_recovered:/, 'el buzón debe mostrar recuperaciones');
assert.match(mailboxUi, /contract_expiring_soon:/, 'el buzón debe mostrar contratos próximos a vencer');
assert.match(mailboxUi, /financial_income:/, 'el buzón debe mostrar ingresos no procedentes de fichajes');
assert.match(mailboxUi, /formatEuro\(Number\(item.amount\)\)/, 'el buzón debe mostrar el importe ingresado');

const legacy = [
  { id: 'a', type: 'player_hat_trick' },
  { id: 'b', type: 'player_of_match' },
];
assert.deepEqual(removeHatTrickInboxNotifications(legacy).map((item) => item.id), ['b']);

console.log('season-inbox-lifecycle-test: OK');
console.log('✓ Recuperaciones y vencimientos de contrato se notifican una sola vez');
console.log('✓ Los hitos se conservan aunque el usuario dispute un partido ese día');
console.log('✓ Los mensajes antiguos de hat-trick se limpian de la partida');

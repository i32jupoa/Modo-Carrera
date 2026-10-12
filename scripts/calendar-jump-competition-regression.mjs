import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const calendar = readFileSync(new URL('../src/routes/calendar.tsx', import.meta.url), 'utf8');
const players = readFileSync(new URL('../src/store/playersStore.ts', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/MatchDayModal.tsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/lib/store.ts', import.meta.url), 'utf8');

function section(source, start, end) {
  const a = source.indexOf(start);
  assert.notEqual(a, -1, `Falta sección: ${start}`);
  const b = source.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `Falta fin de sección: ${end}`);
  return source.slice(a, b);
}

const resolver = section(calendar, 'async function resolveIntermediateDate(date: string): Promise<boolean> {', 'const handleJumpToDate = async () => {');
const drawResolver = section(calendar, 'function resolvePendingDrawsForJump(date: string): boolean {', 'function persistScheduledLeagueResults(date: string): any | null {');
const dateJump = section(calendar, 'const handleJumpToDate = async () => {', 'const handleCupDrawComplete =');
const advanceTime = section(players, 'advanceTime: (days, options) => {', 'resetGameDate: () => {');
const cupLayeredStart = store.indexOf('export async function simulateCupMatchdayLayered(');
assert.notEqual(cupLayeredStart, -1, 'Debe existir simulateCupMatchdayLayered');
const cupLayeredEnd = store.indexOf('\n/**', cupLayeredStart);
assert.notEqual(cupLayeredEnd, -1, 'Debe terminar el bloque de simulateCupMatchdayLayered');
const cupLayeredSimulator = store.slice(cupLayeredStart, cupLayeredEnd);
const inlineStart = store.indexOf('function simulateFixtureInline(');
assert.notEqual(inlineStart, -1, 'Debe existir simulateFixtureInline');
const inlineEnd = store.indexOf('export function getMyNextFixture(', inlineStart);
assert.notEqual(inlineEnd, -1, 'Debe terminar el bloque de simulateFixtureInline');
const inlineSimulator = store.slice(inlineStart, inlineEnd);

// Individual fast simulation must not throw inside its catch/retry path because its cache is out of scope.
assert.doesNotMatch(inlineSimulator, /homeTactics: getCachedTactics\(fixture\.homeId\)|awayTactics: getCachedTactics\(fixture\.awayId\)/,
  'simulateFixtureInline no debe depender de la caché local de advanceMatchdayLayered.');

// The detailed domestic-cup simulator must not reference a cache scoped to a different function.
assert.match(cupLayeredSimulator, /const cupTacticsCache = new Map<string, ReturnType<typeof loadTactics>>\(\)/,
  'El simulador de copa debe declarar una caché de tácticas propia.');
assert.match(cupLayeredSimulator, /const getCachedTactics = \(teamId: string\) => \{[\s\S]*loadTactics\(teamId\)/,
  'El simulador de copa debe definir getCachedTactics en su propio ámbito.');

// UEFA matches are gathered by their official date, not only by user-team ID.
assert.match(resolver, /uclFixtures[\s\S]*filter\(\(fixture: any\) => !fixture\.result\)[\s\S]*getEuropeanFixtureDateIso\(fixture, "ucl", seasonStartYear\) === date/,
  'La Champions debe simular todas las fixtures pendientes de la fecha concreta.');
assert.match(resolver, /fixtureKey\] \?\? \[\][\s\S]*filter\(\(fixture: any\) => !fixture\.result\)[\s\S]*getEuropeanFixtureDateIso\(fixture, competition, seasonStartYear\) === date/,
  'Europa League y Conference deben simular las fixtures pendientes de su fecha.');

// A user cup fixture must use real cup simulation; the generic calendar modal is not the resolver.
assert.match(resolver, /simulateCupMatchdayLayered\(currentSave, matchday, undefined, cupLeague\)/,
  'Los partidos de la copa del país del usuario deben usar el motor de copa.');
assert.match(resolver, /simulateNationalCupsThroughDate\(currentSave, date, true\)/,
  'Debe existir recuperación de copas nacionales atrasadas incluyendo al equipo del usuario.');

// Draws are completed automatically and the pending modal queue is cleared.
assert.match(calendar, /simulateNationalCupsThroughDate\(currentSave, date, true\)/,
  'Al resolver un sorteo se deben liquidar rondas de copa antiguas antes de validar la siguiente ronda.');
assert.match(drawResolver, /pendingDrawQueue: \[\], pendingCupDraw: false, pendingUclDraw: null/,
  'No pueden quedar notificaciones de sorteo en cola tras el resolvedor automático.');
assert.match(calendar, /function resolveDueNationalCupDrawForJump\(date: string\): boolean[\s\S]*hasDueUndrawnRound[\s\S]*resolveNationalCupDraw\(currentSave, date\)/,
  'El sorteo nacional correspondiente a la fecha destino debe resolverse aunque advanceTime no lo encole.');
assert.match(resolver, /resolveDueNationalCupDrawForJump\(date\)/,
  'Cada fecha alcanzada debe comprobar sorteos de copa vencidos sin abrir el modal.');
assert.doesNotMatch(drawResolver, /if \(!resolvedCupDraw\) return false/,
  'Un sorteo de copa pendiente no debe dejar el avance detenido sin diagnóstico.');

// Include the selected date in resolution and keep match dialog suppressed during the jump.
assert.match(dateJump, /resolveIntermediateDate\(after\)/,
  'La fecha destino también se resuelve para evitar que deje partidos pendientes.');
assert.doesNotMatch(dateJump, /if \(after < targetDate\)[\s\S]*resolveIntermediateDate\(after\)/,
  'El destino no puede excluirse del pipeline de partidos.');
assert.match(modal, /if \(jumpActive \|\| !pending \|\| !myTeamId \|\| !live\) return null/,
  'MatchDayModal debe permanecer oculto mientras el salto está activo.');
assert.match(advanceTime, /if \(isJumpTargetDate\)[\s\S]*targetDayReadyForResolution/,
  'advanceTime debe delegar la fecha destino al resolvedor del salto.');
assert.match(resolver, /setSave\(currentSave\)/,
  'Los resultados nuevos deben refrescar el calendario mientras el salto avanza.');

console.log('Calendar jump competition regression checks passed.');

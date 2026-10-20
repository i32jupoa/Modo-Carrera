import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const calendar = read('src/routes/calendar.tsx');
const store = read('src/lib/store.ts');
const players = read('src/store/playersStore.ts');
const profiler = read('src/lib/calendarJumpProfiler.ts');
const academyStore = read('src/lib/academy/academyStore.ts');
const academyRunner = read('src/lib/academy/academyAiMatchdayRunner.ts');
const academySimulation = read('src/lib/academy/academySimulation.ts');

function section(source, start, end) {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `No se encuentra el inicio de sección: ${start}`);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(endAt, -1, `No se encuentra el final de sección: ${end}`);
  return source.slice(startAt, endAt);
}

const intermediateResolver = section(calendar, 'async function resolveIntermediateDate(date: string): Promise<boolean> {', 'const handleJumpToDate = async () => {');
const pendingDrawResolver = section(calendar, 'function resolvePendingDrawsForJump(date: string): boolean {', 'function persistScheduledLeagueResults(date: string): any | null {');
const jumpHandler = section(calendar, 'const handleJumpToDate = async () => {', 'const handleCupDrawComplete =');
const loadSaveImpl = section(store, 'function loadSaveImpl(): SaveGame | null {', 'export function saveSave(');
const saveSaveImpl = section(store, 'function saveSaveImpl(s: SaveGame): boolean {', 'function scheduleSaveForDisk(): void {');
const batchApi = section(store, 'export function beginSaveBatch(', 'export function saveSaveWithRetry(');
const matchForJump = section(players, 'simulateMatchForCalendarJump: (matchId) => {', 'advanceTime: (days, options) => {');
const advanceTime = section(players, 'advanceTime: (days, options) => {', 'resetGameDate: () => {');
const backgroundSim = section(store, 'function processScheduledBackgroundSimsImpl(', 'export async function advanceMatchdayLayered(');

assert.match(jumpHandler, /advanceTime\(1,\s*\{\s*simulateAllLeagues:\s*true,\s*mode:\s*"jump",\s*targetDate\s*\}\)/s,
  'El salto debe reutilizar advanceTime en modo jump día por día.');
assert.match(jumpHandler, /resolveIntermediateDate\(after\)/,
  'Cada fecha alcanzada debe resolver los eventos del calendario, incluida la fecha destino.');
assert.doesNotMatch(jumpHandler, /if \(after < targetDate\)[\s\S]*resolveIntermediateDate\(after\)/,
  'No se debe dejar sin resolver la fecha destino tras confirmar un salto.');
assert.doesNotMatch(jumpHandler, /persistScheduledLeagueResults\(targetDate\)/,
  'La fecha destino debe usar el mismo resolvedor diario de competiciones, no una persistencia parcial.');
assert.match(jumpHandler, /beginSaveBatch\(\{\s*checkpointEveryDays:\s*7\s*\}\)/,
  'El salto debe guardar checkpoints periódicos.');
assert.match(jumpHandler, /await[\s\S]*waitForCalendarBackgroundTasks\(\)[\s\S]*endSaveBatch\(\)/,
  'Las tareas asíncronas deben terminar antes del guardado final.');
assert.match(jumpHandler, /abortSaveBatch\(\)/,
  'Debe existir rollback del save en caso de fallo.');

assert.match(loadSaveImpl, /parsedSaveCache\?\.saveId === activeId && parsedSaveCache\.authoritative[\s\S]*return parsedSaveCache\.save/,
  'loadSave debe consultar la caché autoritativa antes de leer el almacenamiento.');
assert.match(loadSaveImpl, /loadSave\.JSON\.parse/,
  'JSON.parse debe medirse separadamente.');
assert.match(loadSaveImpl, /if \(!legacySaveKeyCleanupDone\)[\s\S]*localStorage\.removeItem\(\"fcsim:save:v1\"\)/,
  'La limpieza de la clave heredada no debe repetirse en cada lectura de loadSave.');
assert.ok(loadSaveImpl.indexOf('parsedSaveCache?.saveId === activeId && parsedSaveCache.authoritative') < loadSaveImpl.indexOf('localStorage.removeItem(\"fcsim:save:v1\")'),
  'Las lecturas de caché deben evitar incluso la limpieza de almacenamiento heredado.');
assert.match(saveSaveImpl, /if \(saveBatchDepth > 0\)[\s\S]*saveSave\.deferredByBatch[\s\S]*return true/,
  'saveSave debe diferir las escrituras físicas dentro del batch.');
assert.match(batchApi, /saveBatchCheckpointEveryDays[\s\S]*flushSaveBatchNow/,
  'La API de batch debe admitir y ejecutar checkpoints.');
assert.match(store, /export async function persistCalendarJumpMarketState[\s\S]*saveTransferSystem/,
  'El almacenamiento separado del mercado debe poder esperarse antes de confirmar el salto.');
assert.match(jumpHandler, /const finalMarketPersisted = await persistCalendarJumpMarketState\(\)/,
  'El salto no debe declararse completo antes de esperar el guardado final del mercado.');

assert.match(matchForJump, /simulateCalendarLeagueFixture\(fixture, get\(\)\)/,
  'Los partidos de salto deben usar el once y la formación reales de cada club (no un XI genérico).');
assert.doesNotMatch(matchForJump, /calendarLineupIds/,
  'El salto no debe volver al XI genérico por rating, que ignora posiciones y formación.');
assert.match(advanceTime, /simulateCalendarLeagueFixture\(f, get\(\)\)/,
  'El avance diario debe simular la liga con alineaciones reales.');
assert.match(intermediateResolver, /simulateNationalCupsThroughDate\(currentSave, date, true\)/,
  'La fecha destino debe cerrar también partidos de copas nacionales del equipo y de otros países.');
assert.match(intermediateResolver, /setSave\(currentSave\);[\s\S]*return handled;/,
  'Los resultados de copa/Europa se deben publicar en el estado visible durante el salto.');
assert.match(intermediateResolver, /\(fixture: any\) => !fixture\.result\)[\s\S]*getEuropeanFixtureDateIso\(fixture, "ucl", seasonStartYear\) === date/,
  'La Champions debe completar todos los fixtures de la fecha, aunque no sean el del equipo controlado.');
assert.match(pendingDrawResolver, /pendingDrawQueue: \[\], pendingCupDraw: false, pendingUclDraw: null/,
  'Los sorteos automáticos deben limpiar la cola y no disparar modales al salir del salto.');
{
  const modal = fs.readFileSync(path.join(root, 'src/components/MatchDayModal.tsx'), 'utf8');
  assert.match(modal, /useCalendarJumpState/, 'El aviso de día de partido debe respetar el salto de calendario.');
  assert.match(jumpHandler, /setCalendarJumpActive\(true\)[\s\S]*setCalendarJumpActive\(false\)/,
    'El salto debe activar y liberar el indicador que silencia el aviso de partido.');
}
assert.match(matchForJump, /catch \(error\)[\s\S]*return false/,
  'Los errores del partido deben comunicarse al caller para que no avance silenciosamente.');
assert.match(matchForJump, /No hay una alineación válida/,
  'El salto no debe aceptar resultados de partidos con XI vacío y estadísticas incompletas.');
assert.match(advanceTime, /no se guardará un 0-0 ficticio/i,
  'El modo salto no debe convertir fallos de simulación en 0-0.');
assert.match(advanceTime, /mode:\s*"jump"|options\?\.mode === "jump"/,
  'advanceTime debe tener controles específicos para el modo salto.');
assert.match(backgroundSim, /if \(entrySucceeded\) processedKeys\.add\(key\)/,
  'No se deben retirar de la cola jornadas donde ha fallado algún partido.');
assert.match(backgroundSim, /Se elimina una tarea de liga huérfana: no existe la jornada programada[\s\S]*processedKeys\.add\(key\)/,
  'Una entrada de cola cuyo calendario ya no tiene esa jornada debe podarse para que no bloquee saltos futuros.');
assert.match(backgroundSim, /Se elimina una tarea de copa huérfana: no existe la ronda programada[\s\S]*processedKeys\.add\(key\)/,
  'Una entrada de copa sin ronda real debe podarse sin simular ni inventar resultados.');
assert.match(backgroundSim, /Number\(f\.matchday\) === Number\(matchday\)/,
  'Los matchdays numéricos deben compararse de forma tolerante con guardados antiguos.');

assert.match(academyStore, /fastForward\?: boolean/,
  'La persistencia de cantera debe conocer el modo salto.');
assert.match(academyStore, /if \(!persisted && options\?\.fastForward\)/,
  'Un fallo de persistencia de la cantera debe interrumpir el salto.');
assert.match(academyRunner, /pendingChanges/,
  'Las academias IA deben acumular cambios del salto hasta los checkpoints.');
assert.match(academyRunner, /failedClubs\.push\(\{ teamId, error \}\)/,
  'Un error de una cantera IA debe aislarse para no cancelar el salto de todo el calendario.');
assert.match(academyRunner, /flushAcademyAiPendingChanges/,
  'Las academias IA deben poder persistir los cambios pendientes en un checkpoint.');
assert.match(academyStore, /if \(!options\.fastForward\) throw error/,
  'Un partido juvenil defectuoso durante el salto no debe bloquear el calendario del primer equipo.');
assert.match(jumpHandler, /beginCalendarJumpAcademyAiBatch\(\)/,
  'El salto debe activar el batch juvenil antes de procesar fechas.');
assert.match(jumpHandler, /flushCalendarJumpAcademyAiChanges\(\)/,
  'El salto debe confirmar las academias IA en checkpoints y al final.');
assert.match(jumpHandler, /finishCalendarJumpAcademyAiBatch\(\)/,
  'El salto debe cerrar el batch juvenil en éxito o error.')
assert.match(jumpHandler, /discardCalendarJumpAcademyAiChanges\(\)/,
  'Si falla el salto, los cambios juveniles no confirmados deben descartarse.');
assert.match(academyRunner, /academy\.ai\.clubsScheduled/,
  'El profiler debe informar cuántos clubes juveniles se programaron.');
assert.match(academyRunner, /if \(fastForward \? index % 4 === 3 : index % 2 === 1\) await yieldToBrowser\(\)/,
  'La construcción inicial del calendario juvenil debe ceder al navegador incluso durante saltos.');
assert.match(academyRunner, /if \(offset \+ CLUBS_PER_SLICE < teamIds\.length\) await yieldToBrowser\(\)/,
  'La simulación de canteras IA debe ceder al navegador entre sublotes durante saltos largos.');
assert.match(academySimulation, /scoreById\.set\(player\.id, selectionScore\(player, date\)\)/,
  'La puntuación de cada juvenil debe calcularse una sola vez por partido.');
assert.doesNotMatch(academySimulation, /sort\(\(a, b\) => selectionScore\(/,
  'Las ordenaciones no deben recalcular hashes de puntuación en cada comparación.');
assert.match(profiler, /performance\.now\(\)/,
  'La instrumentación debe usar performance.now.');
assert.match(profiler, /tiempoMedioPorDíaMs/,
  'El perfil debe informar del tiempo medio por día.');

console.log('OK: invariantes estáticas del salto de calendario');
console.log('Nota: este test no reemplaza una prueba de integración de una partida real en navegador.');

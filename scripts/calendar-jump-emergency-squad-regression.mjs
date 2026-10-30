import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
const academy = readFileSync(new URL("../src/lib/academy/academyPromotionEngine.ts", import.meta.url), "utf8");
const generator = readFileSync(new URL("../src/lib/academy/academyGenerator.ts", import.meta.url), "utf8");

function section(source, start, end) {
  const a = source.indexOf(start);
  assert.notEqual(a, -1, `Falta sección: ${start}`);
  const b = source.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `Falta fin de sección: ${end}`);
  return source.slice(a, b);
}

const lineup = section(store, "export function getStartersWithFormation(", "export function getStarters(");
const emergencyPromotion = section(academy, "export function promoteAcademyPlayerForMatchPosition(", "export interface AcademyPromotionBatchResult");
const backgroundMatches = section(store, "function processScheduledBackgroundSimsImpl(", "export async function advanceMatchdayLayered(");

assert.match(lineup, /promoteAcademyPlayerForMatchPosition\(teamId, emergencyMatchDate, requiredPosition\)/,
  "La IA debe intentar promocionar canteranos cuando las bajas impiden completar el XI.");
assert.match(lineup, /selection\.missingPositions/,
  "La promoción debe usar las demarcaciones exactas que faltan.");
assert.match(lineup, /if \(solverMissing\.length\) return solverMissing/,
  "Si el solver ya informa los huecos, no se deben tratar los once slots como vacíos.");
assert.match(lineup, /fixtureContext\?\.date/,
  "La edad y el estado de los canteranos deben calcularse con la fecha real del partido.");
assert.match(lineup, /players\.length !== 11/,
  "Un XI parcial nunca puede aceptarse como alineación de partido.");
assert.match(emergencyPromotion, /player\.age >= 16/,
  "La convocatoria de emergencia puede recurrir a canteranos desde los 16 años.");
assert.match(emergencyPromotion, /player\.positions\.includes\(requiredPosition\)/,
  "El canterano promocionado debe tener declarada la demarcación exacta requerida.");
assert.match(emergencyPromotion, /promotePlayer\(state, candidate, reason, date\)/,
  "La convocatoria de emergencia debe incorporar al jugador a la primera plantilla.");
assert.match(emergencyPromotion, /generateEmergencyAcademyProspect\(saveId, teamId, season, requiredPosition, state, DYNAMIC_BY_ID\.keys\(\)\)/,
  "Si no existe ningún juvenil elegible, se debe generar una promesa de emergencia del puesto exacto.");
assert.match(generator, /const positions = forcedPrimaryPosition[\s\S]*?\? \[forcedPrimaryPosition\]/,
  "Las promesas de emergencia deben generarse con la demarcación primaria solicitada.");
assert.match(backgroundMatches, /homeId: f\.homeId, homeName: home\.name[\s\S]*awayId: f\.awayId, awayName: away\.name/,
  "Los bloqueos residuales deben identificar los dos clubes implicados.");
assert.match(backgroundMatches, /date: simulatedDate/,
  "La simulación de una jornada de fondo debe pasar la fecha concreta del partido al selector de XI.");
assert.match(backgroundMatches, /if \(entrySucceeded\) processedKeys\.add\(key\)/,
  "Una jornada solo sale de la cola tras simular correctamente todos sus partidos.");

console.log("Calendar jump emergency squad regression checks passed.");

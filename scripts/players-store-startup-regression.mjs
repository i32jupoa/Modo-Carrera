import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "src/store/playersStore.ts"), "utf8");
const start = source.indexOf("function recomputeTeamRating(teamId: string): void {");
const end = source.indexOf("export function recomputeAllTeamRatings(): void {", start);
assert.ok(start >= 0 && end > start, "No se encuentra recomputeTeamRating en playersStore.ts");
const functionBody = source.slice(start, end);
assert.doesNotMatch(
  functionBody,
  /\bstats\s*(?:\?\.|\.)/,
  "recomputeTeamRating no debe leer una variable stats fuera de su ámbito; se ejecuta al inicializar el módulo",
);
assert.match(functionBody, /age:\s*effectivePlayerAge\(fc\)/, "La media del equipo debe usar la edad segura del registro base");
assert.match(source, /function effectivePlayerAge\(fc: FcPlayer, stats\?: PlayerStats\)/, "Falta el helper para edades persistidas");
console.log("OK: recomputeTeamRating no referencia stats sin declarar; la inicialización del store no debe producir ReferenceError.");

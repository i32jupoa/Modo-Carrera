import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../src/routes/calendar.tsx", import.meta.url), "utf8");

const repairStart = store.indexOf("export function fixCupDraws(save: SaveGame): SaveGame {");
const repairEnd = store.indexOf("export type SuspensionCompetition", repairStart);
assert.notEqual(repairStart, -1, "fixCupDraws must exist");
assert.notEqual(repairEnd, -1, "fixCupDraws section must have an end marker");
const repairBody = store.slice(repairStart, repairEnd);

assert.match(store, /function isPromotionPlayoffFixture\(fixture: any\): boolean/,
  "a shared fixture-type guard must exist");
assert.match(store, /startsWith\("promotion-playoff:"\)/,
  "legacy playoff fixtures must be recognized even if metadata is missing");
assert.match(repairBody, /if \(isPromotionPlayoffFixture\(f\)\) return f;/,
  "cup date migration must preserve playoff fixtures");
assert.match(repairBody, /if \(isPromotionPlayoffFixture\(f\)\) continue;/,
  "cup extra-time migration must not simulate promotion playoff legs");
assert.match(calendar, /\[CalendarPage\] No se pudo reparar un resultado antiguo de copa/,
  "calendar route must catch a failed legacy cup migration and keep the original save");
assert.match(calendar, /catch \(error\)[\s\S]*?setSave\(s\);/,
  "calendar route must remain usable if the legacy repair fails");

console.log("Calendar route / promotion-playoff regression checks passed.");

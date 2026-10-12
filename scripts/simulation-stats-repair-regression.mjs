import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");

assert.match(source, /export function repairCurrentSeasonPlayerStats\(save: SaveGame\)/);
assert.match(source, /statsCommittedFixtureIds/);
assert.match(source, /function generateFakeStatsForBackgroundLeagues[\s\S]*?Disabled intentionally/);
assert.match(source, /simulateMatchFast/);
assert.doesNotMatch(
  source.slice(source.indexOf("function generateFakeStatsForBackgroundLeagues"), source.indexOf("// Big 5 European leagues")),
  /recordGoal\(|recordAppearance\(/,
);

console.log("Simulation stats repair static regression checks passed.");
console.log("Note: these checks validate source wiring, not a browser-level save migration.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
const cup = readFileSync(new URL("../src/routes/cup.tsx", import.meta.url), "utf8");

const fixStart = store.indexOf("export function fixCupDraws(save: SaveGame): SaveGame {");
const fixEnd = store.indexOf("export type SuspensionCompetition", fixStart);
assert.notEqual(fixStart, -1, "fixCupDraws must exist");
assert.notEqual(fixEnd, -1, "fixCupDraws section must have an end marker");
const fixBody = store.slice(fixStart, fixEnd);
assert.match(fixBody, /const seasonStartYear = getSeasonStartYear\(save\.season\)/,
  "fixCupDraws must derive its year from the save parameter");
assert.doesNotMatch(fixBody, /\bparsed\.season\b/,
  "fixCupDraws must not reference the unrelated parsed variable");
assert.match(fixBody, /return fixed \? next : save;/,
  "fixCupDraws should return the original save if it made no changes");

const roundStart = cup.indexOf("function RoundBlock(");
const roundEnd = cup.indexOf("export function KOFixtureRow", roundStart);
assert.notEqual(roundStart, -1, "RoundBlock must exist");
assert.notEqual(roundEnd, -1, "RoundBlock section must have an end marker");
const roundBody = cup.slice(roundStart, roundEnd);
assert.match(roundBody, /seasonStartYear: number;/,
  "RoundBlock must receive its season start year as an explicit prop");
assert.doesNotMatch(roundBody, /\bsave\.season\b/,
  "RoundBlock must not access CupPage's out-of-scope save variable");
assert.match(cup, /seasonStartYear=\{getSeasonStartYear\(save\.season\)\}/,
  "CupPage must pass the season start year to RoundBlock");

console.log("Cup/calendar runtime regression checks passed.");

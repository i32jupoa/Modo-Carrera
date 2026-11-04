import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = new URL("../src/lib/transfers/", import.meta.url);
const market = await readFile(new URL("MarketSimulation.ts", base), "utf8");
const engine = await readFile(new URL("ReleaseClauseEngine.ts", base), "utf8");
const constants = await readFile(new URL("constants.ts", base), "utf8");

// The user-club round is independent from the AI-vs-AI second-day gate.
assert.match(market, /function resolveAiReleaseClauseAgainstUser\([\s\S]*?windowForDate\(date\) === "closed"/);
assert.match(market, /allowFirstDay:\s*true/);
assert.match(market, /const buyers = allClubIds\(\)\.filter/);
assert.doesNotMatch(engine, /if \(samePositionCount > 4\) return 0/);
assert.match(engine, /Math\.max\(calculatedChance, roleFloor\)/);
assert.match(engine, /userTargetTrackingVersion: 3/);
assert.match(engine, /state\?\.userTargetTrackingVersion \?\? 0\) >= 3/);
assert.match(market, /hasUserReleaseClauseTargetBeenTried\(date, player\.id, buyerClubId\)/);
assert.match(market, /markUserReleaseClauseTargetTried\(date, target\.id, buyerClubId\)/);
assert.doesNotMatch(market, /attemptedToday\.has\(player\.id\)/);
assert.match(engine, /export function releaseClausePriceAttractivenessMultiplier/);
assert.match(engine, /export function isReleaseClauseBargain/);
assert.match(engine, /!isReleaseClauseBargain\(player\)/);

for (const [field, expected] of [
  ["userIncomingDailyOpportunityChance: { summer: 0.40, winter: 0.28 }", true],
  ["userIncomingBuyerAttemptsPerOpportunity: { summer: 8, winter: 5 }", true],
  ["userIncomingPlayerAttemptsPerBuyer: { summer: 4, winter: 3 }", true],
  ["happyPlayerMinimumAttemptChance: { star: 0.035, starter: 0.050, rotation: 0.065, secondary: 0.075, prospect: 0.025 }", true],
]) {
  assert.equal(constants.includes(field), expected, `Missing market-balance setting: ${field}`);
}

console.log("OK: user-clause round is reachable from day 1, searches the full buyer pool, does not discard deep-position squads, keeps a non-zero per-player chance, removes the global per-day player bottleneck, boosts bargain clauses, and migrates legacy target locks.");

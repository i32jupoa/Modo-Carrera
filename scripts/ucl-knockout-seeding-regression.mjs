import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildKnockoutSeedRanks,
  getSecondLegHomeBySeed,
  inheritKnockoutSeedRank,
  orientTwoLegTieBySeed,
} from "../src/lib/uclBracketLayout.ts";

const ranked = [
  "barcelona", // 1
  "bayern", // 2
  "liverpool", // 3
  "realmadrid", // 4
  "arsenal", // 5
  "inter", // 6
  "psg", // 7
  "atleti", // 8
  "newcastle", // 9
  "juventus", // 10
];
const baseRanks = buildKnockoutSeedRanks(ranked);

// A first-place team keeps its return-leg advantage after beating a 10th-place team.
let ranks = inheritKnockoutSeedRank(baseRanks, "barcelona", "juventus");
assert.equal(ranks.barcelona, 1);
assert.equal(getSecondLegHomeBySeed("barcelona", "inter", ranks), "barcelona");
assert.deepEqual(orientTwoLegTieBySeed("barcelona", "inter", ranks), {
  leg1HomeId: "inter",
  leg1AwayId: "barcelona",
  leg2HomeId: "barcelona",
  leg2AwayId: "inter",
});

// Atlético (8th) eliminates Bayern (2nd), inherits rank 2, and keeps that
// privilege against Real Madrid (4th) in the next round.
ranks = inheritKnockoutSeedRank(baseRanks, "atleti", "bayern");
assert.equal(ranks.atleti, 2);
assert.equal(getSecondLegHomeBySeed("atleti", "realmadrid", ranks), "atleti");
assert.deepEqual(orientTwoLegTieBySeed("atleti", "realmadrid", ranks), {
  leg1HomeId: "realmadrid",
  leg1AwayId: "atleti",
  leg2HomeId: "atleti",
  leg2AwayId: "realmadrid",
});

// The inherited rank survives another victory and can itself be inherited by
// the next opponent if Atlético is eventually eliminated.
ranks = inheritKnockoutSeedRank(ranks, "atleti", "realmadrid");
assert.equal(ranks.atleti, 2);
ranks = inheritKnockoutSeedRank(ranks, "inter", "atleti");
assert.equal(ranks.inter, 2);
assert.equal(getSecondLegHomeBySeed("inter", "newcastle", ranks), "inter");

// If Juventus eliminates Barcelona, Juventus inherits Barcelona's first-place priority.
ranks = inheritKnockoutSeedRank(baseRanks, "juventus", "barcelona");
assert.equal(ranks.juventus, 1);
assert.equal(getSecondLegHomeBySeed("juventus", "realmadrid", ranks), "juventus");

const storeSource = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
assert.ok(storeSource.includes("next.ucl.knockoutSeedRanks = buildKnockoutSeedRanks(sorted)"));
assert.ok(storeSource.includes("inheritKnockoutSeedRank(seedRanks, winnerId, loserId)"));
assert.ok(storeSource.includes('orientFutureTie("qf", i, firstPathWinner, secondPathWinner)'));
assert.ok(storeSource.includes('orientFutureTie("sf", i, firstPathWinner, secondPathWinner)'));
assert.ok(storeSource.includes("knockoutSeedRanks: state.knockoutSeedRanks ? { ...state.knockoutSeedRanks }"));

console.log("ucl-knockout-seeding-regression: OK");

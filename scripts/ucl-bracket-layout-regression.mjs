import assert from "node:assert/strict";
import { orderPlayoffByR16, orderTieBySecondLegHome, splitUclBracketSides } from "../src/lib/uclBracketLayout.ts";
import { readFileSync } from "node:fs";

const playoff = Array.from({ length: 8 }, (_, index) => ({ id: `PO-${index + 1}` }));
const r16 = Array.from({ length: 8 }, (_, index) => ({ id: `R16-${index + 1}` }));

const ordered = orderPlayoffByR16(playoff, r16).map((match) => match?.id ?? null);
assert.deepEqual(ordered, ["PO-7", "PO-1", "PO-5", "PO-3", "PO-6", "PO-4", "PO-8", "PO-2"]);
assert.equal(new Set(ordered).size, 8, "cada eliminatoria previa debe alimentar un único cruce de octavos");

const missingLatePlayoffTie = orderPlayoffByR16(playoff.slice(0, 7), r16).map((match) => match?.id ?? null);
assert.deepEqual(missingLatePlayoffTie, ["PO-7", "PO-1", "PO-5", "PO-3", "PO-6", "PO-4", null, "PO-2"]);

const qf = Array.from({ length: 4 }, (_, index) => ({ id: `QF-${index + 1}` }));
const sf = Array.from({ length: 2 }, (_, index) => ({ id: `SF-${index + 1}` }));
const orderedMatches = ordered.map((id) => ({ id }));
const sides = splitUclBracketSides(orderedMatches, r16, qf, sf);
assert.deepEqual(sides.left.r16.map((match) => match.id), ["R16-1", "R16-2", "R16-3", "R16-4"]);
assert.deepEqual(sides.right.r16.map((match) => match.id), ["R16-8", "R16-7", "R16-6", "R16-5"]);
assert.deepEqual(sides.left.qf.map((match) => match.id), ["QF-1", "QF-2"]);
assert.deepEqual(sides.right.qf.map((match) => match.id), ["QF-4", "QF-3"]);
assert.equal(sides.left.sf.id, "SF-1");
assert.equal(sides.right.sf.id, "SF-2");
assert.deepEqual(sides.left.playoff.map((match) => match.id), ["PO-7", "PO-1", "PO-5", "PO-3"]);
assert.deepEqual(sides.right.playoff.map((match) => match.id), ["PO-2", "PO-8", "PO-4", "PO-6"]);

// Leg 2 home must be rendered above the opponent regardless of the Leg 1 order.
assert.deepEqual(
  orderTieBySecondLegHome("newcastle", "dortmund", { homeId: "dortmund", awayId: "newcastle" }, false),
  { top: "dortmund", bottom: "newcastle" },
);
// UCL route builds its matchup from Leg 1, so the fallback is reversed.
assert.deepEqual(orderTieBySecondLegHome("leg1-home", "leg1-away", null, false), {
  top: "leg1-away",
  bottom: "leg1-home",
});
// Persisted play-off/R16 slots store the Leg 2 home club first.
assert.deepEqual(orderTieBySecondLegHome("seeded", "unseeded", null, true), {
  top: "seeded",
  bottom: "unseeded",
});
// The engine's persisted QF/SF slot convention is reversed from PO/R16.
assert.deepEqual(orderTieBySecondLegHome("path-one", "path-two", null, false), {
  top: "path-two",
  bottom: "path-one",
});

// Europa and Conference use the same centred, two-sided bracket component.
const uclSource = readFileSync(new URL("../src/routes/ucl.tsx", import.meta.url), "utf8");
assert.ok(uclSource.includes("orderTieBySecondLegHome(home, away, tieFixtures.leg2, false)"));

for (const [route, key] of [["europa-league.tsx", "uel"], ["conference-league.tsx", "uecl"]]) {
  const source = readFileSync(new URL(`../src/routes/${route}`, import.meta.url), "utf8");
  assert.ok(source.includes('import { EuropeanKnockoutBracket } from "@/components/competition/EuropeanKnockoutBracket";'));
  assert.ok(source.includes(`competition="${key}"`));
}


// Two-legged ties must always open the leg selector once both clubs are known,
// while individual pending legs remain disabled and cannot open match details.
const europeanBracketSource = readFileSync(new URL("../src/components/competition/EuropeanKnockoutBracket.tsx", import.meta.url), "utf8");
assert.ok(europeanBracketSource.includes('matchup.round === "final"') && europeanBracketSource.includes('Boolean(matchup.homeTeam && matchup.awayTeam)'), "Europa/Conference two-legged cards open when both clubs are known");
assert.ok(europeanBracketSource.includes("setSelectedTie({ matchup, leg1: tie.leg1, leg2: tie.leg2 });"), "Europa/Conference opens the selector even when both legs are pending");
assert.ok(europeanBracketSource.includes("if (!fixture.result) return;"), "Europa/Conference leg selector rejects pending fixtures");
assert.ok(europeanBracketSource.includes("disabled={!fixture.result}"), "Europa/Conference pending legs are disabled in the selector");
assert.ok(europeanBracketSource.includes("if (tie.single?.result)"), "Europa/Conference final opens only after it has been played");

assert.ok(uclSource.includes('isFinal') && uclSource.includes(': home && away'), "Champions two-legged cards open when both clubs are known");
assert.ok(uclSource.includes("setSelectedTie({ matchup, leg1: tie.leg1, leg2: tie.leg2 });"), "Champions opens the selector even when both legs are pending");
assert.ok(uclSource.includes("if (!fixture.result) return;"), "Champions leg selector rejects pending fixtures");
assert.ok(uclSource.includes("disabled={!fixture.result}"), "Champions pending legs are disabled in the selector");
assert.ok(uclSource.includes("if (tie.single?.result)"), "Champions final opens only after it has been played");

console.log("ucl-bracket-layout-regression: OK");

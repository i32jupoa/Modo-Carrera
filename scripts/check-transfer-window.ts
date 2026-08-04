import assert from "node:assert/strict";
import { windowForDate } from "../src/lib/transfers/MarketSimulation.ts";

assert.equal(windowForDate("2025-09-01"), "summer", "September 1 should still be inside the summer transfer window");
assert.equal(windowForDate("2025-10-01"), "closed", "October 1 should be outside the transfer window");

console.log("transfer window checks passed");

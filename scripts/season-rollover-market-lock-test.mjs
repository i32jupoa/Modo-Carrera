import assert from "node:assert/strict";
import {
  beginSeasonRollover,
  endSeasonRollover,
  isSeasonRolloverInProgress,
  subscribeSeasonRollover,
  trackMarketBackgroundTask,
  waitForMarketBackgroundTasks,
} from "../src/lib/season/seasonRolloverLock.ts";

const changes = [];
const unsubscribe = subscribeSeasonRollover((active) => changes.push(active));
assert.equal(isSeasonRolloverInProgress(), false);
beginSeasonRollover();
beginSeasonRollover();
assert.equal(isSeasonRolloverInProgress(), true);
endSeasonRollover();
assert.equal(isSeasonRolloverInProgress(), true, "nested transactions must keep the shared lock active");
const task = trackMarketBackgroundTask(new Promise((resolve) => setTimeout(() => resolve("done"), 5)));
await waitForMarketBackgroundTasks();
assert.equal(await task, "done");
endSeasonRollover();
assert.equal(isSeasonRolloverInProgress(), false);
assert.deepEqual(changes, [true, false]);
unsubscribe();
console.log("season-rollover-market-lock-test: OK");

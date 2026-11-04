import assert from 'node:assert/strict';
import { buildMatchMomentumTimeline } from '../src/lib/matchMomentumTimeline.ts';
import { formatMatchMinute } from '../src/lib/matchTime.ts';

const homeDominance = buildMatchMomentumTimeline({
  currentMinute: 2,
  userSide: 'home',
  momentumHistory: [{ minute: 0, value: 50 }, { minute: 1, value: 64 }, { minute: 2, value: 67 }],
});
assert.equal(homeDominance[0].side, 'home', 'home dominance should rise above the center line');
assert.equal(homeDominance[1].side, 'home');
assert.ok(homeDominance[1].intensity > homeDominance[0].intensity, 'stronger dominance should make a taller bar');
assert.equal(homeDominance[2].active, false, 'future minutes must remain empty');

const awayDominance = buildMatchMomentumTimeline({
  currentMinute: 1,
  userSide: 'away',
  momentumHistory: [{ minute: 0, value: 50 }, { minute: 1, value: 65 }],
});
assert.equal(awayDominance[0].side, 'away', 'away user momentum must be converted to the away/down direction');

const normalChance = buildMatchMomentumTimeline({
  currentMinute: 1,
  userSide: 'home',
  momentumHistory: [{ minute: 0, value: 50 }, { minute: 1, value: 56 }],
});
const bigChance = buildMatchMomentumTimeline({
  currentMinute: 1,
  userSide: 'home',
  momentumHistory: [{ minute: 0, value: 50 }, { minute: 1, value: 56 }],
  highlights: [{ minute: 1, team: 'home', type: 'big_chance', playerId: 'p1' }],
});
assert.ok(bigChance[0].intensity > normalChance[0].intensity * 1.8, 'a clear chance should create a visibly larger peak');

const savedShot = buildMatchMomentumTimeline({
  currentMinute: 1,
  userSide: 'home',
  highlights: [{ minute: 1, team: 'home', type: 'save', playerId: 'gk1', detail: '¡Paradón!' }],
});
assert.equal(savedShot[0].side, 'away', 'a keeper save means the opposing side created the attack');

const singleBigChance = buildMatchMomentumTimeline({
  currentMinute: 1,
  userSide: 'home',
  highlights: [{ minute: 1, team: 'home', type: 'big_chance', playerId: 'p1' }],
});
const duplicatedBigChance = buildMatchMomentumTimeline({
  currentMinute: 1,
  userSide: 'home',
  highlights: [{ minute: 1, team: 'home', type: 'big_chance', playerId: 'p1' }],
  moments: [{ minute: 1, teamSide: 'home', type: 'big_chance', playerId: 'p1' }],
});
assert.equal(duplicatedBigChance[0].intensity, singleBigChance[0].intensity, 'the same chance in highlights and moments must not double count');

const xgPeak = buildMatchMomentumTimeline({
  currentMinute: 1,
  userSide: 'home',
  minuteStats: [{ minute: 1, team: 'away', shot: 1, shotOnTarget: 1, xg: 0.72 }],
});
assert.equal(xgPeak[0].side, 'away', 'high xG from away should point downward');


const secondHalfAddedTime = buildMatchMomentumTimeline({
  currentMinute: 90,
  userSide: 'home',
  momentumHistory: [{ minute: 89, value: 52 }, { minute: 94, value: 66 }],
  highlights: [{ minute: 90, team: 'home', type: 'big_chance', stoppagePeriod: 'secondHalf', stoppageElapsed: 4 }],
});
assert.equal(secondHalfAddedTime.length, 94, 'the chart must extend through 90+4 rather than stop at 90');
assert.equal(secondHalfAddedTime[93].active, true, 'the 90+4 minute must be active');
assert.equal(secondHalfAddedTime[93].side, 'home', 'stoppage-time chances must influence the correct minute and team');

const firstHalfAddedTime = buildMatchMomentumTimeline({
  currentMinute: 45,
  userSide: 'away',
  highlights: [{ minute: 45, team: 'away', type: 'big_chance', stoppagePeriod: 'firstHalf', stoppageElapsed: 2 }],
});
assert.equal(firstHalfAddedTime[46].active, true, '45+2 must be represented on the timeline');
assert.equal(firstHalfAddedTime[46].side, 'away');

const extraFirstHalfAddedTime = buildMatchMomentumTimeline({
  currentMinute: 105,
  scaleMinute: 120,
  userSide: 'home',
  highlights: [{ minute: 105, team: 'home', type: 'woodwork', matchPeriod: 'extraTime', stoppagePeriod: 'extraFirstHalf', stoppageElapsed: 2 }],
});
assert.equal(extraFirstHalfAddedTime.length, 120, 'the chart must retain the extra-time scale');
assert.equal(extraFirstHalfAddedTime[106].active, true, '105+2 must be represented on the timeline');
assert.equal(extraFirstHalfAddedTime[106].side, 'home');

const extraSecondHalfAddedTime = buildMatchMomentumTimeline({
  currentMinute: 120,
  userSide: 'away',
  momentumHistory: [{ minute: 120, value: 52 }, { minute: 121, value: 65 }],
});
assert.equal(extraSecondHalfAddedTime.length, 121, 'the chart must extend through 120+1');
assert.equal(extraSecondHalfAddedTime[120].active, true);
assert.equal(extraSecondHalfAddedTime[120].side, 'away');


assert.equal(formatMatchMinute(94, { stoppagePeriod: 'secondHalf', stoppageElapsed: 4 }), '90+4', 'second-half stoppage must retain its added-time label');
assert.equal(formatMatchMinute(47, { stoppagePeriod: 'firstHalf', stoppageElapsed: 2 }), '45+2', 'first-half stoppage must retain its added-time label');
assert.equal(formatMatchMinute(107, { matchPeriod: 'extraTime', stoppagePeriod: 'extraFirstHalf', stoppageElapsed: 2 }), '105+2', 'first extra-time stoppage must retain its added-time label');
assert.equal(formatMatchMinute(121, { matchPeriod: 'extraTime', stoppagePeriod: 'extraSecondHalf', stoppageElapsed: 1 }), '120+1', 'second extra-time stoppage must retain its added-time label');

console.log('match-momentum-timeline-regression: OK');

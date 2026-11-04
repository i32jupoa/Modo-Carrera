import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const liveTimeline = read('../src/components/match/MatchTimeline.tsx');
const chart = read('../src/components/match/MatchMomentumChart.tsx');
const showcase = read('../src/components/match/MatchShowcase.tsx');
const modal = read('../src/components/MatchStatsModal.tsx');
const route = read('../src/routes/match.tsx');
const resultType = read('../src/lib/simulation.ts');

assert.match(liveTimeline, /MatchMomentumChart/, 'the live timeline must render the shared momentum chart');
assert.doesNotMatch(liveTimeline, /Array\.from\(\{ length: 7 \}\)/, 'the old horizontal event timeline must be removed');
assert.doesNotMatch(liveTimeline, /ICONS|TimelineItem|Ver eventos|Substitutions/, 'the old icon/event timeline must not remain in the live timeline component');
assert.match(chart, /buildMatchMomentumTimeline/, 'the shared chart must use the real momentum timeline builder');
assert.match(chart, /penalty_goal/, 'the chart must mark converted penalties');
assert.match(chart, /var_disallowed/, 'the chart must mark disallowed goals');
assert.match(chart, /penalty_missed/, 'the chart must mark missed penalties');
assert.match(chart, /woodwork/, 'the chart must mark woodwork');
assert.match(chart, /getMatchMinuteElapsedValue/, 'the chart must map added-time moments onto the extended timeline');
assert.match(chart, /clockContext: \{ \.\.\.clockContext \}/, 'event markers must retain their added-time phase metadata');
assert.match(showcase, /<MatchMomentumChart/, 'the post-match showcase must display the momentum chart');
assert.match(showcase, /Cómo se desarrolló el partido[\s\S]*?<MatchMomentumChart/, 'the summary chart must be inside the match development section');
assert.match(showcase, /result\?\.momentumHistory/, 'the post-match showcase must read the saved curve');
assert.match(modal, /momentumUserSide:/, 'the historical summary must preserve the manager side orientation');
assert.match(route, /momentumHistory: momentumHistoryRef\.current/, 'the final fixture result must persist the curve');
assert.match(route, /momentumFinalMinute:[\s\S]*stoppageTimesRef\.current\?\.secondHalf/, 'the final fixture result must persist second-half stoppage time');
assert.match(route, /stoppageTimesRef\.current\?\.extraSecondHalf/, 'the final fixture result must persist extra-time stoppage time');
assert.match(resultType, /momentumHistory\?: Array/, 'the result schema must include persisted momentum history');
assert.match(read('../src/lib/simulation.ts'), /buildFastMatchMomentumHistory/, 'instant simulations must generate a match-specific momentum curve');

console.log('match-momentum-persistence-regression: OK');

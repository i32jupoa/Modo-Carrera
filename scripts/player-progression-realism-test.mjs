import assert from 'node:assert/strict';
import {
  initializeDynamicStats,
  applyMonthlyProgression,
  applySeasonEndProgression,
} from '../src/lib/playerProgression.ts';

function simulateSeason({
  label,
  ovr,
  potential,
  age,
  goals,
  assists,
  appearances,
  minutes,
  averageRating,
  position,
  mvps = 1,
  hasRatings = true,
}) {
  let dynamic = initializeDynamicStats(ovr, potential);
  const startOVR = dynamic.currentOVR;
  const seasonMonths = 10;

  // Simulate stats accumulating during the season rather than handing the
  // progression engine an end-of-season snapshot from month one.
  for (let month = 0; month < seasonMonths; month++) {
    const fraction = (month + 1) / seasonMonths;
    const appsAtMonth = Math.round(appearances * fraction);
    const ratingAtMonth = 6.60 + (averageRating - 6.60) * fraction;
    Object.assign(dynamic, {
      seasonGoals: Math.round(goals * fraction),
      seasonAssists: Math.round(assists * fraction),
      seasonAppearances: appsAtMonth,
      seasonMinutes: Math.round(minutes * fraction),
      seasonMVPs: Math.round(mvps * fraction),
      seasonAverageRating: hasRatings ? ratingAtMonth : 6.0,
      seasonRatingCount: hasRatings ? appsAtMonth : 0,
      seasonRatingTotal: hasRatings ? ratingAtMonth * appsAtMonth : 0,
    });
    dynamic = applyMonthlyProgression(dynamic, age, position, month, 2026, { teamAverageOVR: 78 });
  }

  dynamic = applySeasonEndProgression(dynamic, age, position, 1, 'club-test');
  return { label, startOVR, endOVR: dynamic.currentOVR, growth: dynamic.currentOVR - startOVR };
}

const breakoutStriker = simulateSeason({
  label: 'Delantero 79 OVR y 34 goles', ovr: 79, potential: 85, age: 25,
  goals: 34, assists: 4, appearances: 35, minutes: 2850,
  averageRating: 7.35, position: ['DC'], mvps: 4,
});
assert.ok(
  breakoutStriker.growth >= 4.8 && breakoutStriker.growth <= 6.2,
  `${breakoutStriker.label}: una campaña de 34 goles debe permitir llegar aproximadamente a 84-85 (${breakoutStriker.startOVR.toFixed(2)} → ${breakoutStriker.endOVR.toFixed(2)}, +${breakoutStriker.growth.toFixed(2)})`,
);

const ordinaryStriker = simulateSeason({
  label: 'Delantero 79 OVR y 20 goles', ovr: 79, potential: 85, age: 25,
  goals: 20, assists: 3, appearances: 34, minutes: 2600,
  averageRating: 7.05, position: ['DC'], mvps: 1,
});
assert.ok(
  ordinaryStriker.growth >= 2 && ordinaryStriker.growth < breakoutStriker.growth - 1,
  `una buena temporada de 20 goles debe mejorar menos que una de 34 (${ordinaryStriker.growth.toFixed(2)} vs ${breakoutStriker.growth.toFixed(2)})`,
);

const eliteStriker = simulateSeason({
  label: 'Delantero 94 OVR y 60 goles', ovr: 94, potential: 96, age: 27,
  goals: 60, assists: 8, appearances: 38, minutes: 3300,
  averageRating: 7.80, position: ['DC'], mvps: 8,
});
assert.ok(
  eliteStriker.growth > 0 && eliteStriker.growth <= 2,
  `una campaña histórica no debe dar una subida desproporcionada a un jugador de 94 (${eliteStriker.growth.toFixed(2)})`,
);

const youngCentreBack = simulateSeason({
  label: 'Central joven con buenas notas', ovr: 78, potential: 88, age: 22,
  goals: 1, assists: 1, appearances: 32, minutes: 2800,
  averageRating: 7.10, position: ['DFC'], mvps: 1,
});
assert.ok(
  youngCentreBack.growth >= 2,
  `un central joven que juega bien debe progresar aunque casi no marque (${youngCentreBack.growth.toFixed(2)})`,
);

const noRatingsCentreBack = simulateSeason({
  label: 'Central sin notas migradas', ovr: 78, potential: 85, age: 24,
  goals: 0, assists: 0, appearances: 30, minutes: 2600,
  averageRating: 6.0, position: ['DFC'], mvps: 0, hasRatings: false,
});
assert.ok(
  noRatingsCentreBack.growth > -0.2 && noRatingsCentreBack.growth < 2.0,
  `un guardado antiguo sin muestra de notas no debe provocar una caída fuerte ni una subida automática (${noRatingsCentreBack.growth.toFixed(2)})`,
);

const cbWithoutCleanSheets = initializeDynamicStats(80, 88);
Object.assign(cbWithoutCleanSheets, {
  seasonAppearances: 28, seasonMinutes: 2450, seasonAverageRating: 6.8,
  seasonRatingCount: 28, seasonRatingTotal: 190.4,
});
const cbWithCleanSheets = { ...cbWithoutCleanSheets, seasonCleanSheets: 11 };
const cbBaselineGrowth = applyMonthlyProgression(cbWithoutCleanSheets, 23, ['DFC'], 5, 2026).currentOVR;
const cbCleanSheetGrowth = applyMonthlyProgression(cbWithCleanSheets, 23, ['DFC'], 5, 2026).currentOVR;
assert.ok(
  cbCleanSheetGrowth > cbBaselineGrowth,
  `las porterías a cero deben mejorar la progresión de un central (${cbBaselineGrowth} vs ${cbCleanSheetGrowth})`,
);

console.log('player-progression-realism-test: OK');
for (const result of [breakoutStriker, ordinaryStriker, eliteStriker, youngCentreBack, noRatingsCentreBack]) {
  console.log(`  ${result.label}: ${result.startOVR.toFixed(2)} → ${result.endOVR.toFixed(2)} (${result.growth >= 0 ? '+' : ''}${result.growth.toFixed(2)})`);
}

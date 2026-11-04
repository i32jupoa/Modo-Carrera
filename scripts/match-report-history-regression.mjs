import assert from 'node:assert/strict';
import { buildMatchPostReport } from '../src/lib/matchReport.ts';

const fixture = {
  id: 'regression-ucl-final',
  competition: 'ucl',
  europeanCompetition: 'ucl',
  homeId: 'home',
  awayId: 'away',
};

const result = {
  homeGoals: 2,
  awayGoals: 2,
  events: [
    { minute: 79, team: 'away', type: 'penalty_goal', scorerName: 'Delantero visitante', detail: 'Penalti: Defensa local derriba al delantero' },
    { minute: 12, team: 'home', type: 'goal', scorerName: 'Extremo local' },
    { minute: 54, team: 'home', type: 'free_kick_goal', scorerName: 'Mediapunta local' },
  ],
  penalties: { homeGoals: 4, awayGoals: 5, shootout: [] },
  stats: {
    home: { possession: 54, shots: 15, shotsOnTarget: 7, xg: 2.1 },
    away: { possession: 46, shots: 11, shotsOnTarget: 5, xg: 1.7 },
  },
  cards: [{ minute: 88, team: 'home', cardType: 'yellow', playerName: 'Defensa local' }],
  injuries: [],
  substitutions: [{ minute: 65, team: 'away', playerInName: 'Suplente', playerOutName: 'Titular' }],
  tacticalImpact: {
    home: { commentary: ['El equipo local presionó alto.'] },
    away: { commentary: ['El visitante buscó salir al contraataque.'] },
  },
};

const report = buildMatchPostReport(fixture, result, {
  homeName: 'Equipo local',
  awayName: 'Equipo visitante',
  competitionName: 'Champions League',
});

assert.match(report.headline, /tanda de penaltis/i);
assert.ok(report.paragraphs[0].includes('Champions League'));
const goalParagraph = report.paragraphs.find((paragraph) => paragraph.includes('Los goles llegaron'));
assert.ok(goalParagraph, 'El resumen debe incluir el orden de los goles');
assert.ok(goalParagraph.indexOf('12′') < goalParagraph.indexOf('54′'));
assert.ok(goalParagraph.indexOf('54′') < goalParagraph.indexOf('79′'));
assert.ok(report.facts.some((fact) => fact.includes('presionó alto')));
assert.ok(report.facts.some((fact) => fact.includes('Sustituciones: 1')));
assert.equal(buildMatchPostReport(fixture, result, { homeName: 'Equipo local', awayName: 'Equipo visitante', competitionName: 'Champions League' }).signature, report.signature, 'La firma debe ser estable para evitar duplicados');

console.log('OK: informe guardable, marcador, penaltis, competición, goles cronológicos, tácticas y firma estable.');

#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../src/routes/scorers.tsx', import.meta.url), 'utf8');
const store = fs.readFileSync(new URL('../src/store/playersStore.ts', import.meta.url), 'utf8');
assert.match(route, /useState<LeagueId \| "all" \| "big5">\("big5"\)/, 'El ranking global debe iniciar en las cinco grandes ligas');
assert.match(route, /competition !== "cup" && league !== "all"/, 'El selector general debe poder filtrar las ligas en las vistas no-copa');
assert.match(route, /competition !== "cup" && \(/, 'Debe mostrarse el selector de liga fuera de las vistas de copa');
assert.match(route, /<SelectItem value="all">Todas las ligas<\/SelectItem>/, 'El usuario debe poder ver todas las ligas');
assert.match(route, /<SelectItem value="big5">5 grandes ligas<\/SelectItem>/, 'El usuario debe poder volver al filtro de las cinco grandes');
assert.match(route, /selectTopScorers\(leagueArg, 30, competition, cupCountryArg\)/);
assert.match(route, /selectTopAssisters\(leagueArg, 30, competition, cupCountryArg\)/);
assert.match(store, /function rankingPlayerFilter\(p: Player, leagueFilter\?: LeagueId \| "big5"\)/);
assert.match(store, /if \(leagueFilter === "big5"\) return BIG5_LEAGUES\.includes\(team\.league as LeagueId\)/);
console.log('scorer-ranking-scope-test: OK — por defecto Big 5, filtro global y opción Todas las ligas');

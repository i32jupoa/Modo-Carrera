import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const teams = read("src/data/teams.ts");
const store = read("src/lib/store.ts");
const savedGames = read("src/lib/savedGames.ts");
const domestic = read("src/lib/season/promotionRelegation.ts");
const season = read("src/lib/season.ts");
const cups = read("src/lib/cups.ts");

assert.match(teams, /export type TeamLeagueContext/);
assert.match(teams, /export function setActiveTeamLeagueOverrides/);
assert.match(teams, /export function getAllTeams\(context\?: TeamLeagueContext\)/);
assert.match(teams, /export function teamById\(id: string, context\?: TeamLeagueContext\)/);
assert.match(teams, /export function teamsByLeague\(league: LeagueId, context\?: TeamLeagueContext\)/);
assert.match(teams, /export function getTeamLeagueId\(teamOrId: Team \| string/);
assert.match(teams, /export function getLeagueTier\(leagueIdOrTeamId: string, context\?: TeamLeagueContext\)/);
assert.match(teams, /findTeamById\(teamId, \{ teamLeagueOverrides: \{\} \}\)/,
  "El helper de liga debe resolver primero la liga base para evitar filtrar overrides de otra carrera");
assert.match(teams, /function getTeamsMap\(\)[\s\S]*for \(const t of TEAMS\)/,
  "El mapa estático de equipos no debe mutarse con los cambios de una carrera");

assert.match(store, /teamLeagueOverrides\?: Record<string, LeagueId>/);
assert.match(store, /setActiveTeamLeagueOverrides\(parsedSaveCache\.save\.teamLeagueOverrides\)/);
assert.match(store, /setActiveTeamLeagueOverrides\(save\.teamLeagueOverrides\)/);
assert.match(store, /setActiveTeamLeagueOverrides\(undefined\)[\s\S]*export function newSave/,
  "Crear una carrera debe limpiar el contexto activo antes de leer equipos");
assert.match(store, /const validOverrides: Record<string, LeagueId>/);
assert.match(savedGames, /teamById\(save\.myTeamId, save\)/,
  "Los metadatos de una carrera deben usar su propio contexto explícito");

assert.match(season, /const teamContext = options\.teamLeagueOverrides === undefined[\s\S]*teamsByLeague\(league, teamContext\)/);
assert.match(season, /export function emptyStandings\(league: LeagueId, context\?/);
assert.match(cups, /export function initCup\([\s\S]*context\?: TeamLeagueContext/);
assert.match(cups, /getAllTeams\(context\)/);
assert.match(domestic, /export function calculateSavePromotionRelegation/);
assert.match(domestic, /teamLeagueOverrides,/);
assert.match(domestic, /generateLeagueFixtures\(leagueId, \{[\s\S]*teamLeagueOverrides,/);
assert.match(domestic, /emptyStandings\(leagueId, teamContext\)/);
assert.match(domestic, /initCup\(country, seasonStartYear, teamContext\)/);

console.log("OK: persistencia y migración de overrides, resolución por carrera y propagación a liga/tabla/copa/calendario");

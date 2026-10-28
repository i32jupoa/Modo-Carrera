import assert from "node:assert/strict";
import fs from "node:fs";

const teams = fs.readFileSync("src/data/teams.ts", "utf8");
const players = [0,1,2,3,4].flatMap(i=>JSON.parse(fs.readFileSync(`src/data/players.part${i}.json`,"utf8")));
const market = fs.readFileSync("src/data/players.ts", "utf8");

const malagaBlock = teams.match(/id: "malaga",[\s\S]*?color: "#[0-9A-Fa-f]{6}"/);
assert.ok(malagaBlock, "Málaga CF debe seguir registrado en el juego");
assert.match(malagaBlock[0], /name: "Málaga CF"/);
assert.match(malagaBlock[0], /league: "laliga2"/, "Málaga debe estar en Segunda División");
assert.ok(players.some((p) => p.Name === "Chupe" && p.Team === "Málaga CF" && p.League === "LALIGA HYPERMOTION"),
  "Chupe y su club original deben permanecer en los datos de jugadores");
assert.ok(players.filter((p) => p.Team === "Málaga CF").length >= 20,
  "La plantilla del Málaga no debe desaparecer del catálogo");
assert.match(market, /function clubMarketAccessibilityMultiplier/,
  "La valoración debe descontar el poder adquisitivo de clubes modestos");
assert.match(market, /function nonEliteQualityMultiplier/,
  "La valoración debe reducir la inflación de jugadores de media 55-87");
assert.match(market, /const teamMult = teamValueMultiplier\(teamAvgRating, teamId\)/,
  "El valor debe usar el club concreto, no solo la media genérica de plantilla");
console.log("OK: Málaga permanece en el juego con sus jugadores y Segunda; el mercado aplica el nivel del club y la liga.");

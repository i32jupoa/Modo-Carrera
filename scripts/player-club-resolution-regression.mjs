import assert from "node:assert/strict";
import fs from "node:fs";

const playerStore = fs.readFileSync("src/store/playersStore.ts", "utf8");
const teamsSource = fs.readFileSync("src/data/teams.ts", "utf8");
const players = [0,1,2,3,4].flatMap(i=>JSON.parse(fs.readFileSync(`src/data/players.part${i}.json`,"utf8")));

// La conversión de FcPlayer a Player debe usar el mismo resolutor estricto que
// agrupa las plantillas; la tabla de nombre literal no contiene los alias.
assert.match(
  playerStore,
  /let teamId = teamIdOverride \?\? baseClubId\(fc\) \?\? TEAM_NAME_TO_ID\[fc\.Team\]/,
  "fcToPlayer debe resolver primero el club original mediante baseClubId/findTeamStrict",
);
assert.match(playerStore, /teamIdOverride \?\? baseClubId\(fc\)/,
  "Un override explícito de traspaso debe tener prioridad sobre el club original");

const aliasBlock = teamsSource.match(/const TEAM_NAME_ALIASES: Record<string, string> = \{([\s\S]*?)\n\};/);
assert.ok(aliasBlock, "No se encuentra el registro central de alias de clubes");
const aliases = new Map();
for (const match of aliasBlock[1].matchAll(/^\s*([a-z0-9]+):\s*"([^"]+)"/gm)) {
  aliases.set(match[1], match[2]);
}
const normalize = (value) => String(value ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]/g, "");

const teamPairs = [...teamsSource.matchAll(/id:\s*"([^"]+)"\s*,\s*\n\s*name:\s*"([^"]+)"/g)];
const teamByName = new Map();
for (const [, id, name] of teamPairs) {
  teamByName.set(normalize(id), { id, name });
  teamByName.set(normalize(name), { id, name });
}
function resolveDatasetTeam(teamName) {
  const key = normalize(teamName);
  const direct = teamByName.get(key);
  if (direct) return direct;
  const target = aliases.get(key);
  return target ? teamByName.get(normalize(target)) ?? null : null;
}

// Regresión de los clubes que muestran el síntoma denunciado. Sus jugadores
// nativos usan alias del dataset y deben pertenecer al club canónico.
const pacho = players.find((player) => player.Name === "Willian Pacho");
assert.ok(pacho, "No se encuentra el jugador de regresión Willian Pacho");
assert.equal(pacho.Team, "PSG");
assert.equal(resolveDatasetTeam(pacho.Team)?.id, "psg", '"PSG" debe resolver a Paris SG');
assert.equal(aliases.get("psg"), "Paris SG");

const lyonPlayer = players.find((player) => player.Team === "Olympique Lyon");
assert.ok(lyonPlayer, "No se encuentran jugadores con el nombre de origen Olympique Lyon");
assert.equal(resolveDatasetTeam(lyonPlayer.Team)?.id, "lyo", '"Olympique Lyon" debe resolver a OL');
assert.equal(aliases.get("olympiquelyon"), "OL");

// El resolvedor no debe modificar jugadores con nombre de equipo ya canónico.
assert.equal(resolveDatasetTeam("Real Madrid")?.id, "rma");

console.log("OK: los jugadores nativos de PSG y OL se pueden convertir a jugadores simulables; los alias de clubes quedan cubiertos.");

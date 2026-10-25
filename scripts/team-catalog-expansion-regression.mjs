import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "src/data/teams.ts");
const playersJsonPath = path.join(projectRoot, "src/data/players.json");
const source = fs.readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  fileName: sourcePath,
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
});

const diagnostics = transpiled.diagnostics ?? [];
assert.equal(
  diagnostics.length,
  0,
  diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"),
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "modo-carrera-catalog-"));
try {
  fs.writeFileSync(path.join(tempDir, "teams.js"), transpiled.outputText, "utf8");
  fs.writeFileSync(
    path.join(tempDir, "playersData.js"),
    `module.exports = { __esModule: true, default: require(${JSON.stringify(playersJsonPath)}) };\n`,
    "utf8",
  );

  const catalog = require(path.join(tempDir, "teams.js"));
  const teams = catalog.getAllTeams();
  const leagues = Object.keys(catalog.LEAGUES);
  const countsByLeague = new Map();
  const ids = new Set();

  for (const team of teams) {
    assert.ok(catalog.LEAGUES[team.league], `Liga no registrada para ${team.name}: ${team.league}`);
    assert.ok(!ids.has(team.id), `ID duplicado: ${team.id}`);
    ids.add(team.id);
    countsByLeague.set(team.league, (countsByLeague.get(team.league) ?? 0) + 1);
  }

  assert.ok(teams.length >= 650, `Se esperaban al menos 650 equipos, encontrados ${teams.length}`);
  assert.ok(leagues.length >= 48, `Se esperaban al menos 48 ligas, encontradas ${leagues.length}`);
  for (const leagueId of leagues) {
    assert.ok((countsByLeague.get(leagueId) ?? 0) >= 2, `La liga ${leagueId} no tiene suficientes equipos jugables`);
  }

  const expectedClubs = [
    ["Santos", "brasileirao"],
    ["Santos Laguna", "ligabbvamx"],
    ["Jamshedpur FC", "isl"],
    ["Atlético Nacional", "ligabetplay"],
    ["Universidad Católica", "chileprimera"],
    ["LDU Quito", "ligaproecuador"],
    ["Deportivo Recoleta", "paraguayprimera"],
    ["Alianza Atlético", "liga1peru"],
    ["Independiente Petrolero", "boliviaprofesional"],
    ["Montevideo City Torque", "uruguayprimera"],
    ["Academia Puerto Cabello", "ligafutve"],
    ["Club León", "ligabbvamx"],
    ["FC Juárez", "ligabbvamx"],
    ["Querétaro FC", "ligabbvamx"],
    ["Olympiacos", "hellasliga"],
  ];
  for (const [name, leagueId] of expectedClubs) {
    assert.ok(
      teams.some((team) => team.name === name && team.league === leagueId),
      `No se ha resuelto correctamente ${name} en ${leagueId}`,
    );
  }

  const sourcePlayers = JSON.parse(fs.readFileSync(playersJsonPath, "utf8"));
  const rosterCounts = new Map(teams.map((team) => [team.id, 0]));
  for (const player of sourcePlayers) {
    const sourceTeam = String(player?.Team ?? "").trim();
    if (!sourceTeam) continue;
    const team = catalog.findTeamStrict(sourceTeam, String(player?.League ?? ""));
    if (team) rosterCounts.set(team.id, (rosterCounts.get(team.id) ?? 0) + 1);
  }

  for (const team of teams) {
    if (catalog.TEAMS.some((staticTeam) => staticTeam.id === team.id)) continue;
    assert.ok(
      (rosterCounts.get(team.id) ?? 0) >= 11,
      `Equipo dinámico sin plantilla utilizable: ${team.name} (${team.id})`,
    );
  }

  console.log(
    `OK: catálogo con ${teams.length} equipos y ${leagues.length} ligas; IDs únicos, ligas jugables y plantillas dinámicas completas.`,
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

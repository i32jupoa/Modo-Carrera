# Corrección: plantillas de IA incompletas y estadísticas anómalas

## Causa raíz

`playersStore.ts` construía `PLAYERS_BY_TEAM` usando `findTeamStrict()`, que reconoce alias y nombres de origen del dataset. Sin embargo, `fcToPlayer()` convertía después esos mismos jugadores usando solamente `TEAM_NAME_TO_ID[fc.Team]` (nombre visible literal) y una segunda comprobación que exigía que `team.name === fc.Team`.

En datos como `Team: "PSG"` o `Team: "Olympique Lyon"`, el club sí se encontraba al agrupar la plantilla (`Paris SG` / `OL`), pero el jugador convertido para el motor de simulación devolvía `undefined`. `getSimSquad()` filtraba esos jugadores y la IA acababa simulando partidos con solo una fracción de su plantilla. Los fichajes podían seguir apareciendo porque el override de club de un traspaso se pasaba directamente a `fcToPlayer()`.

Esto concuerda con los síntomas reportados: futbolistas nativos sin minutos, fichajes que acumulaban casi todas las apariciones y cifras extremas de goles/asistencias.

## Cambios aplicados

- `src/store/playersStore.ts`: `fcToPlayer()` prioriza el override explícito del traspaso y, si no existe, resuelve el club de origen mediante `baseClubId(fc)` / `findTeamStrict()`. Se conserva el comportamiento de overrides vacíos, que representan jugadores liberados.
- `scripts/player-club-resolution-regression.mjs`: nueva regresión que comprueba el caso de PSG, OL, la precedencia de los traspasos y un nombre de club canónico.
- `package.json`: nuevo comando `npm run test:player-club-resolution`.

## Validaciones ejecutadas

Correctos:

- `node scripts/player-club-resolution-regression.mjs`
- `node scripts/players-store-startup-regression.mjs`
- `node scripts/simulation-stats-repair-regression.mjs`
- `node scripts/team-league-overrides-test.mjs`

No se pudo completar `tsc --noEmit`: faltan las dependencias del proyecto (`vite/client`) y `npm ci` no terminó en este entorno. No se afirma que se haya validado un build completo.

## Importante sobre una temporada ya simulada

El arreglo evita que los partidos nuevos vuelvan a usar plantillas incompletas. No puede reconstruir con fiabilidad los goleadores, asistentes ni las alineaciones correctas de encuentros ya simulados, porque el guardado de esa temporada conserva los resultados agregados y las estadísticas erróneas, no una crónica completa con las alineaciones válidas. Para verificar estadísticas realistas es necesario simular una temporada con el código corregido (idealmente una carrera nueva, o la temporada siguiente si el juego ya ha reiniciado sus contadores de temporada).

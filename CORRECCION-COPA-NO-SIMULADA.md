# Corrección: la copa nacional bloqueaba el salto de calendario

## Causa raíz

`simulateCupMatchdayLayered()` llamaba a `getCachedTactics()` en la simulación detallada de los partidos de copa. Sin embargo, esa función auxiliar solo se declaraba dentro de `advanceMatchdayLayered()`, por lo que no era visible desde el simulador de copa. Al llegar a la primera ronda que incluía al equipo controlado, la simulación lanzaba un `ReferenceError`; `handleJumpToDate` cancelaba el salto y recuperaba el último checkpoint. Por eso el día parecía retroceder y el partido seguía sin resultado, obligando a jugarlo manualmente.

## Cambios realizados

- `src/lib/store.ts`: añadida una caché local de tácticas dentro de `simulateCupMatchdayLayered()`, utilizando `loadTactics()` y una `Map` propia del simulador.
- `src/lib/store.ts`: corregidas también las llamadas a `getCachedTactics()` fuera de ámbito dentro de `simulateFixtureInline()`. Esa ruta ya no necesita lanzar un error y ejecutar su fallback para simular rápidamente una jornada.
- `src/routes/calendar.tsx`: el manejador de error del salto registra ahora el nombre, mensaje y stack trace cuando la excepción es un `Error`, en lugar de mostrar solo un objeto plegado o sin detalles. El mensaje de la interfaz también indica dónde consultar la consola si la excepción no tiene mensaje.
- `scripts/calendar-jump-competition-regression.mjs`: añadidas comprobaciones para evitar referencias a cachés fuera de ámbito en ambos simuladores.

## Validaciones ejecutadas

- `node scripts/calendar-jump-invariants.mjs`
- `node scripts/calendar-jump-competition-regression.mjs`
- `node scripts/cup-calendar-runtime-regression.mjs`
- `node scripts/players-store-startup-regression.mjs`
- `node scripts/season-balance-test.mjs` (250 temporadas sintéticas, 95.000 partidos)
- `node --experimental-strip-types scripts/season-calendar-test.mjs`
- `node --experimental-strip-types scripts/season-promotion-test.mjs`
- `node scripts/team-league-overrides-test.mjs`
- `node --experimental-strip-types scripts/season-european-qualification-test.mjs`
- `node --experimental-strip-types scripts/season-rollover-test.mjs`
- `node --experimental-strip-types scripts/season-history-test.mjs`
- `node --experimental-strip-types scripts/season-economy-test.mjs`
- `node --experimental-strip-types scripts/season-lifetime-test.mjs` (20 temporadas sintéticas)

Todas estas pruebas terminaron correctamente. Son tests del núcleo y regresiones estáticas; no equivalen a una prueba end-to-end en navegador. No se ha ejecutado la compilación integral de Vite en este entorno porque el ZIP no incluye `node_modules`.

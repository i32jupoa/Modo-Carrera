# Fase 1 — Calendarios anuales

Esta entrega implementa la primera fase de la evolución hacia temporadas continuas. No constituye todavía el sistema completo de cambio de temporada.

## Qué incluye

- Un módulo puro `src/lib/season/calendarFactory.ts` para interpretar y formatear temporadas, calcular anclajes de calendario, tratar años bisiestos y producir semillas deterministas.
- Un campo opcional `calendarSeed` en `SaveGame`; las partidas antiguas reciben una semilla estable durante la migración, sin modificar el orden de sus partidos de 2026/27.
- Generación reproducible del orden de los equipos y del calendario de liga a partir de 2027/28. El calendario inicial de 2026/27 mantiene exactamente los identificadores, emparejamientos y orden originales.
- Anclajes por año para calendarios de liga, copas nacionales, Champions, Europa League y Conference League; las fechas europeas conservan los días de la semana previstos.
- Integración de las fechas anuales con la selección de partidos, la protección frente a choques con UEFA/copas, los sorteos eliminatorios existentes, los premios mensuales, el calendario de academia de IA y las pantallas relacionadas.
- Un test de calendario ejecutable mediante `npm run test:season-calendar`.

## Verificaciones realizadas

- `node --experimental-strip-types scripts/season-calendar-test.mjs` — correcto.
- `node scripts/calendar-jump-invariants.mjs` — correcto.
- `node scripts/season-balance-test.mjs` — correcto (250 temporadas, 95.000 partidos simulados).
- Transpilación sintáctica de 25 archivos TypeScript/TSX modificados — 0 errores sintácticos.
- Prueba aislada de `generateLeagueFixtures`: compatibilidad exacta con 2026/27 y calendario reproducible con doble vuelta completa para 2027/28, 2028/29 y 2029/30.
- Prueba aislada de las fechas UEFA y de las fechas seguras de copa en años hasta 2100 — correcta.

## Limitación de validación

No se pudo completar `npm run typecheck` ni el build completo en este entorno porque no están instaladas las dependencias del proyecto: el chequeo termina en `TS2688` al no encontrar `vite/client`. El intento de instalar dependencias falló por un error de red/DNS hacia `registry.npmjs.org`. No se afirma, por tanto, que el build integral haya pasado.

## Pendiente para las siguientes fases

Esta entrega no implementa aún ascensos/descensos, pertenencia mutable a ligas, plazas europeas por méritos, el cierre transaccional completo, contratos/cesiones/retiradas anuales, reposición de talento, resumen de temporada, historia/palmarés ni economía recalculada. Se deben construir sobre esta base en fases posteriores y probar con una simulación headless de varias temporadas.

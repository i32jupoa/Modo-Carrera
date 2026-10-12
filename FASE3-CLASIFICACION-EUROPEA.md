# Fase 3 — Clasificación europea dinámica y coeficientes

## Qué incluye

- Clasificación europea separada en un núcleo puro (`src/lib/season/europeanQualificationCore.ts`) y un adaptador al modelo real de la partida (`src/lib/season/europeanQualification.ts`).
- Tres competiciones de 36 participantes cada una; el motor garantiza 108 clubes globalmente distintos y falla de forma explícita si la base no permite completar las plazas.
- Selección basada en ranking de asociaciones, posiciones de liga, ganadores de copa y campeones continentales. Los huecos por duplicaciones se rellenan mediante cascada determinista, sin rondas previas simuladas.
- Historial de coeficientes por temporada con ventana máxima de cinco campañas. Se puntúan los partidos europeos guardados (victoria 2 puntos, empate 1) y se divide por el número de clubes de la asociación que participan.
- Para 2026/27, cuando la carrera todavía no contiene campañas europeas anteriores, el ranking inicial se estima a partir de la fuerza media de los cinco mejores clubes de cada asociación. No se presenta como coeficiente histórico oficial.
- Snapshot de clasificación europea y `associationCoefficientHistory` persistidos en `SaveGame`, con valores por defecto en la migración.
- Participantes conectados a inicialización de los estados europeos, sorteos, rutas de calendario y simulación protegida por fechas.
- Normalización de algunos identificadores de ligas que se encontraban fuera del registro principal (incluidas Ekstraklasa y Scottish Premiership), evitando entradas duplicadas solo por diferencias en etiquetas.

## Asociaciones reconocidas en los datos actuales

El registro real contiene 16 asociaciones con máxima división reconocida y equipos elegibles: Inglaterra, España, Italia, Alemania, Francia, Portugal, Países Bajos, Turquía, Bélgica, Polonia, Suiza, Suecia, Noruega, Austria, Escocia y Rumanía. Dinamarca no se incluye porque no aparece una división danesa con equipos en la base actual.

## Archivos modificados

- `src/lib/season/europeanQualificationCore.ts` (nuevo)
- `src/lib/season/europeanQualification.ts` (nuevo)
- `src/data/ucl.ts`
- `src/data/europeanCompetitions.ts`
- `src/data/teams.ts`
- `src/lib/store.ts`
- `src/routes/calendar.tsx`
- `src/components/UCLDrawModal.tsx`
- `src/components/EuropeanDrawModal.tsx`
- `src/store/playersStore.ts`
- `scripts/season-european-qualification-test.mjs` (nuevo)
- `package.json`

## Pruebas realizadas

- `node --experimental-strip-types scripts/season-european-qualification-test.mjs` — correcto: 36 por competición, 108 clubes distintos, coeficientes y ventana de cinco años.
- `node --experimental-strip-types scripts/season-promotion-test.mjs` — correcto: simulación de 20 temporadas.
- `node --experimental-strip-types scripts/season-calendar-test.mjs` — correcto.
- `node scripts/calendar-jump-invariants.mjs` — correcto.
- `node scripts/team-league-overrides-test.mjs` — correcto.
- Comprobación sintáctica de los 10 archivos TS/TSX modificados — correcta.
- Comprobación estricta de TypeScript para el núcleo, el adaptador y los datos de equipos — correcta.
- Auditoría de ejecución contra la base real: 16 asociaciones activas y tres listas iniciales de 36 clubes sin solapamientos.

La comprobación global `tsc --noEmit` no puede completarse en este entorno porque faltan las dependencias instaladas de Vite y TypeScript informa `Cannot find type definition file for 'vite/client'`. Tampoco se ha validado una sesión completa en navegador.

## Límite deliberado de esta fase

La función pura `prepareEuropeanQualificationForNextSeason(save)` registra el coeficiente de la temporada que termina y guarda la clasificación prevista para la siguiente. La llamada de esa función forma parte de la integración transaccional del cierre de temporada y queda para la fase 4, donde se añadirá el pipeline de transición completo; no se debe invocar después de limpiar las clasificaciones o los fixtures de la campaña anterior.

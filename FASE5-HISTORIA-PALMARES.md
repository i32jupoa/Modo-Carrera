# Fase 5 — Resumen de temporada, historia y palmarés

## Incluido en esta entrega

- Nueva ruta `/history` accesible desde el menú lateral como **Historia y palmarés**.
- Vista por temporada con campeón de cada liga, campeones de copa y Europa, tablas completas, premios, goleadores, ascensos, descensos y retiradas.
- Vista de palmarés por club con títulos de liga, copa, Champions, Europa League y Conference League acumulados en los archivos de la carrera.
- Vista de palmarés individual con goles, asistencias, temporadas disputadas, clubes, títulos, premios y temporadas como máximo goleador.
- Resumen al cerrar temporada desde la Central. Se abre tras guardar la campaña cerrada y antes de continuar jugando la nueva temporada.
- Archivo compacto por temporada en el almacenamiento separado de guardados, con contexto del equipo del usuario, premios vinculados por ID cuando está disponible, registros estadísticos de jugadores, los 12 fichajes destacados y las plazas europeas de la próxima campaña.
- Sección de noticias de temporada en el Buzón: inicio de campaña, ascensos y descensos del equipo del usuario, vencimientos de contratos de su plantilla y retiradas de jugadores suyos. Incluye marcar como leídas.
- Compatibilidad de lectura con archivos históricos anteriores: los campos nuevos son opcionales y las categorías de premios se reconstruyen a partir del formato antiguo cuando hace falta.
- Test `scripts/season-history-test.mjs` y comando `npm run test:season-history`.

## Archivos tocados

- `src/lib/season/seasonHistory.ts`
- `src/lib/season/seasonRollover.ts`
- `src/routes/history.tsx` (nuevo)
- `src/routes/season.tsx`
- `src/routes/mailbox.tsx`
- `src/components/AppSidebar.tsx`
- `src/routeTree.gen.ts`
- `scripts/season-history-test.mjs` (nuevo)
- `package.json`

## Decisiones de implementación

- El historial se guarda por ID de carrera, separado del objeto principal `SaveGame` y en formato compacto.
- La clasificación europea archivada corresponde a la siguiente temporada que acaba de quedar preparada; las listas están agrupadas por competición y pueden desplegarse desde el resumen o desde la historia.
- Los fichajes destacados se seleccionan desde el historial real de transferencias cuyas fechas caen dentro de la temporada archivada, ordenados por importe y priorizando traspasos permanentes cuando hay empate.
- Las estadísticas de palmarés individual se calculan con la información guardada en cada archivo. Para temporadas históricas antiguas sin registros completos de jugador, la interfaz solo puede mostrar los datos disponibles (por ejemplo, premios y máximos goleadores).

## Verificación

Pasaron estos comandos:

- `npm run test:season-history`
- `npm run test:season-rollover`
- `npm run test:season-calendar`
- `npm run test:season-promotion`
- `npm run test:season-european`
- `npm run test:team-league-overrides`
- `npm run test:calendar-jump`
- `npm run test:season-balance` — 250 temporadas Monte Carlo, 95.000 partidos, media de 2,94 goles y correlación 0,997.

También se pasó una comprobación de sintaxis con el compilador TypeScript para los archivos TypeScript/TSX modificados.

## Limitaciones conocidas

No se pudo completar `npm run typecheck` ni una compilación Vite integral porque esta copia de trabajo no incluye las dependencias instaladas y TypeScript reporta que falta `vite/client`. Tampoco se ha realizado una prueba end-to-end en navegador. Por eso, los tests del núcleo y de sintaxis no se deben interpretar como confirmación de que la interfaz completa se ha ejecutado en producción.

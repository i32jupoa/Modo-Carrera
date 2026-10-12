# Fase 6 — Economía, migración y pruebas de larga duración

## Alcance de la entrega

Esta entrega completa la sexta fase de la hoja de ruta de temporadas continuas. Incluye las fases 1–5 del proyecto y añade la liquidación económica de fin de temporada, migración explícita de los nuevos campos y pruebas headless de larga duración. No sustituye una prueba end-to-end de navegador: la compilación integral de la aplicación sigue pendiente porque este entorno no tiene instaladas las dependencias de Vite (`vite/client`).

## Cambios principales

### Núcleo económico puro

Nuevo `src/lib/season/seasonEconomyCore.ts`.

- Calcula ingresos domésticos de final de temporada según la liga/categoría y la posición final.
- Añade premios por copa nacional, participación europea y campeón europeo, más un incremento comercial modesto para la próxima participación europea.
- Considera ascensos y descensos al ajustar el presupuesto base de la temporada siguiente.
- Mantiene separado el presupuesto de fichajes y el presupuesto salarial, cubriendo la masa salarial real.
- Reinicia los acumuladores `spent` y `earned` al empezar la nueva ventana.
- Establece límites para evitar que los presupuestos de IA crezcan sin control (hasta 4× su base recalculada) y un máximo específico para el club del usuario (3,5×).
- No vuelve a pagar al club del usuario los hitos de premio de Champions que ya liquida el motor de partido.
- Usa un ledger por etiqueta de temporada, limitado a 80 registros, para hacer idempotente el pago anual.

Los perfiles de ingresos son una adaptación económica interna del simulador, no una reproducción de cuentas oficiales de clubes. Las ligas sin perfil específico utilizan una base conservadora.

### Persistencia y migración

Nuevo `src/lib/season/seasonEconomyMigration.ts`.

- Introduce `seasonEconomyVersion` y `seasonEconomyLedger` en guardados.
- Convierte guardados antiguos sin esos campos en la versión 1 con un ledger vacío.
- Filtra etiquetas de temporada inválidas, elimina duplicados y limita el historial guardado a 80 campañas.
- La migración se ejecuta en `loadSave()` y marca el guardado para persistencia si ha añadido o corregido campos.

### Integración en el rollover e historial

- `src/lib/season/seasonRollover.ts`: añade la fase económica al pipeline, calcula clasificación final por tabla, aplica ingresos a las finanzas de cada equipo, refleja el nuevo presupuesto del club del usuario y archiva su resumen financiero. La liquidación utiliza el ledger antes de persistir el siguiente guardado.
- `src/lib/season/seasonRolloverCore.ts`: añade la etapa `economy` al tipo de progreso.
- `src/lib/season/seasonHistory.ts` y `src/routes/history.tsx`: almacenan y presentan el presupuesto anterior y nuevo, ingresos aplicados y ascenso/descenso del club del usuario.
- `src/lib/store.ts`: incorpora y migra los campos económicos a los guardados nuevos y antiguos.
- `package.json`: añade los scripts `test:season-economy` y `test:season-lifetime`.
- `scripts/season-economy-test.mjs`: test de ingresos, topes, masa salarial, promoción/descenso, idempotencia y migración.
- `scripts/season-lifetime-test.mjs`: prueba sintética de 20 campañas consecutivas sobre fechas, pirámide doméstica, coeficientes europeos, 108 plazas UEFA únicas, liquidaciones económicas, contratos no negativos, propiedad única de jugadores y migración.

## Pruebas ejecutadas

Han pasado los siguientes comandos dentro del proyecto:

```bash
node --experimental-strip-types scripts/season-economy-test.mjs
node --experimental-strip-types scripts/season-lifetime-test.mjs
node --experimental-strip-types scripts/season-rollover-test.mjs
node --experimental-strip-types scripts/season-history-test.mjs
node --experimental-strip-types scripts/season-calendar-test.mjs
node --experimental-strip-types scripts/season-promotion-test.mjs
node --experimental-strip-types scripts/season-european-qualification-test.mjs
node --experimental-strip-types scripts/team-league-overrides-test.mjs
node --experimental-strip-types scripts/calendar-jump-invariants.mjs
node scripts/season-balance-test.mjs
```

El test de equilibrio continúa simulando 250 temporadas/95.000 partidos, con 2,94 goles por partido de media y correlación de Pearson 0,997 en la relación entre fuerza de plantilla y posición final media.

También se hizo una comprobación sintáctica mediante `transpileModule` sobre nueve archivos TypeScript/TSX/JS modificados: cero diagnósticos. El núcleo puro de economía, migración, calendario, rollover y clasificación ya había pasado una comprobación aislada estricta de TypeScript.

## Verificación pendiente y limitaciones

- `npm run typecheck` no llega a analizar el proyecto completo: falla antes con `TS2688: Cannot find type definition file for 'vite/client'`, porque las dependencias completas no están instaladas en este entorno.
- La prueba `season-lifetime-test.mjs` integra los subsistemas puros con datos sintéticos; no equivale a ejecutar veinte temporadas desde la interfaz real con todos los equipos y almacenes montados.
- La capa de finanzas se liquida desde el rollover. No se ha verificado en un navegador real la presentación final del resumen o el comportamiento tras cerrar la pestaña durante cada etapa de la transición.

## Archivos modificados/añadidos en esta fase

- `FASE6-ECONOMIA-MIGRACION-VALIDACION.md`
- `package.json`
- `scripts/season-economy-test.mjs` (nuevo)
- `scripts/season-lifetime-test.mjs` (nuevo)
- `src/lib/season/seasonEconomyCore.ts` (nuevo)
- `src/lib/season/seasonEconomyMigration.ts` (nuevo)
- `src/lib/season/seasonHistory.ts`
- `src/lib/season/seasonRollover.ts`
- `src/lib/season/seasonRolloverCore.ts`
- `src/lib/store.ts`
- `src/routes/history.tsx`

La entrega completa conserva además los cambios y las notas de las fases 1–5.

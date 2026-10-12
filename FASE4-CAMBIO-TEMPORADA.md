# Fase 4 — Motor de cambio de temporada

## Alcance

Esta entrega añade el núcleo del cierre y preparación de una temporada nueva, sobre las fases 1–3. La transición puede invocarse desde la Central (`/season`) cuando todas las competiciones instanciadas están resueltas o se alcanza el 30 de junio.

## Implementado

- `src/lib/season/seasonRollover.ts`: orquestación por fases, callback de progreso, checkpoint previo, diario de transición, rollback si una fase falla, recuperación al volver a abrir la aplicación e idempotencia por temporada en `seasonRolloverLedger`.
- `src/lib/season/seasonRolloverCore.ts`: cálculo puro de fechas `fin de temporada → 1 de julio siguiente`, reinicio de contadores estacionales conservando la progresión y lesiones largas.
- `src/lib/season/retirements.ts`: selección reproducible de retiradas por semilla, temporada, edad, valoración, situación de agente libre, posición de portero y lesión larga.
- `src/lib/season/seasonHistory.ts`: archivo compacto de tablas finales, campeones, premios, goleadores, retiradas y movimientos de categoría en IndexedDB/almacenamiento de partidas, con un índice compacto en `SaveGame`.
- Conexión al progreso existente de fin de temporada; se elimina el disparador de progresión acoplado a la final de Champions para evitar que se ejecute por separado del cierre.
- Proceso de contratos: la IA revisa renovaciones, los contratos vencidos se liberan, y se registran las expiraciones del club del usuario para notificarlas y poder negociar antes de futuras expiraciones.
- Retorno de cesiones y reconciliación de cesiones de cantera usando `LoanEngine` y `academyLoanBridge` existentes.
- Envejecimiento: edad calculada desde fecha de nacimiento cuando existe; para jugadores legacy sin fecha, un override por temporada evita duplicar el incremento. Edad y retirada se incluyen en `PlayerDelta` para que se persistan por carrera.
- Reinicio de estadísticas estacionales sin borrar las estadísticas de carrera ni la progresión; se mantienen lesiones con más de 14 días pendientes.
- Ingesta/promoción anual de cantera, regeneración de alineaciones y suplentes válidos, y reposición de jugadores libres en plantillas IA cuando faltan posiciones críticas.
- Regeneración del calendario y copas domésticas, ascensos/descensos, plazas europeas, estados y libros de premios de la nueva temporada reutilizando los motores de las fases anteriores.
- Nueva acción en Central con indicador de progreso, y recuperación del checkpoint durante el arranque antes de la limpieza de guardados huérfanos.

## Archivos principales

Nuevos:
- `src/lib/season/retirements.ts`
- `src/lib/season/seasonHistory.ts`
- `src/lib/season/seasonRollover.ts`
- `src/lib/season/seasonRolloverCore.ts`
- `scripts/season-rollover-test.mjs`

Modificados: `src/lib/store.ts`, `src/lib/saveStorage.ts`, `src/store/playersStore.ts`, `src/lib/academy/academyPromotionEngine.ts`, `src/lib/academy/academyStore.ts`, `src/lib/transfers/PlayerIndex.ts`, `src/lib/transfers/types.ts`, `src/lib/transfers/TransferEngine.ts`, `src/lib/transfers/MarketValuation.ts`, `src/routes/__root.tsx`, `src/routes/season.tsx` y `package.json`.

## Validación ejecutada

Han pasado los siguientes comandos:

```bash
npm run test:season-calendar
npm run test:season-promotion
npm run test:season-european
npm run test:team-league-overrides
npm run test:season-rollover
npm run test:calendar-jump
npm run test:season-balance
```

Resultados del test Monte Carlo existente: 250 temporadas, 95.000 partidos, media de 2,94 goles/partido y correlación de 0,997 entre nivel de plantilla y posición media final. Las simulaciones headless de promociones y descensos mantienen estables las divisiones durante 20 temporadas. La prueba nueva comprueba el formato de temporadas, salto `2099/00 → 2100/01`, reinicio de contadores, conservación de lesiones largas, retiradas deterministas y creación del archivo compacto.

También se ha ejecutado una comprobación de sintaxis mediante TypeScript `transpileModule` para los 15 archivos TypeScript/TSX modificados, sin errores de sintaxis.

## Limitaciones conocidas

- No se pudo ejecutar el chequeo integral de tipos ni el build de Vite: las dependencias de desarrollo no están instaladas completamente y `npm run typecheck` falla al no encontrar `vite/client`. La comprobación sintáctica y los scripts indicados no equivalen a una compilación completa ni a una prueba integral en navegador.
- El archivo histórico ya se escribe, pero su pantalla de consulta/Palmarés pertenece a la fase 5.
- Los ajustes completos de presupuestos, ingresos por división y narrativa avanzada pertenecen a la fase 6; en esta fase se generan notificaciones base de inicio, retiradas, vencimientos y movimiento del club.
- Antes de usarlo con una carrera importante, conviene probar la transición en una copia del guardado y comprobar contratos, cesiones y plantillas en navegador.

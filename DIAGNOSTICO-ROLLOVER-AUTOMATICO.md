# Diagnóstico y corrección: cambio automático de temporada

## Causa raíz

La hipótesis **A queda confirmada como causa raíz del comportamiento descrito**: antes de esta corrección, el cierre de temporada era una operación manual expuesta en `src/routes/season.tsx` (`handleAdvanceSeason`, líneas 203–224, y el botón condicionado por `rolloverReadiness` en 692–702). El sistema de avance y el salto de calendario no coordinaban esa transacción al llegar al 30 de junio. El propio `advanceTime` ya contiene la nota de que el reloj no debe cruzar el límite por sí solo (`src/store/playersStore.ts`, 2151–2165), pero faltaba una ruta común que realizara el rollover al encontrar esa frontera.

La corrección introduce `advanceSeasonIfDue()` en `src/lib/season/seasonRollover.ts` (55–100), añade el disparo en `GameDayBar` (24–78 y 114–130), en el avance de un día del calendario (`src/routes/calendar.tsx`, 747–780) y en el bucle del salto (`calendar.tsx`, 1371–1431, 1434–1450 y 1525–1531). El reloj se bloquea en la frontera y solo continúa después de confirmar el cambio de temporada.

## Verificación de las hipótesis A–E

- **A. Falta de disparador automático — CONFIRMADA como raíz.** `season.tsx:203–224` ejecutaba el rollover desde el manejador manual y `season.tsx:692–702` solo mostraba el botón cuando las comprobaciones de la interfaz lo permitían. El avance diario y el salto necesitaban una orquestación propia. Ahora se centraliza en `advanceSeasonIfDue` y en los tres puntos de entrada anteriores.
- **B. Candado del ledger — NO demostrable para el guardado concreto sin leer su estado local.** En `seasonRollover.ts:428–436`, una entrada de ledger de la temporada actual solo impide un reintento si la fecha todavía es anterior al 30 de junio. En la recuperación posterior al límite no se devuelve anticipadamente el guardado antiguo. La nueva función de transición también comparte una promesa en curso por equipo/temporada (`seasonRollover.ts:384–395`) para evitar dos ejecuciones concurrentes. No he inspeccionado directamente tu localStorage/IndexedDB, así que no afirmo si tu ledger contenía `2026/27`.
- **C. Gating de la UI — CONTRIBUYENTE, no causa raíz independiente.** El botón manual de `season.tsx:692–702` se basa en `rolloverReadiness` y en el ledger; no es un disparador conectado al calendario. La ruta del calendario ahora cierra la temporada directamente y muestra un error con motivo si no se puede hacer. `season.tsx:683–689` presenta además el bloqueo y un enlace al calendario cuando se llega al límite con partidos pendientes.
- **D. Error silencioso / rollback — NO hay evidencia de que fuese la causa inicial.** Si se invoca la transición y falla, `seasonRollover.ts:897–909` intenta restaurar el checkpoint y vuelve a lanzar el error. Antes faltaba el disparador, así que el estado descrito no prueba que aquella transacción hubiese llegado a ejecutarse. Ahora el calendario registra nombre, mensaje y stack (`calendar.tsx:1578–1587`), y la barra global muestra un toast detallado (`GameDayBar.tsx:46–51`).
- **E. Fixtures pendientes — RIESGO SECUNDARIO y ahora controlado.** En una partida consistente, al llegar exactamente al 30 de junio, cualquier encuentro aún sin marcador o competición europea no terminada bloquea el cierre con una explicación (`seasonRollover.ts:107–143`). El salto confirma un checkpoint en el 30 de junio antes de lanzar ese error (`calendar.tsx:1388–1406`), así que no restaura siete días anteriores. Para una partida antigua situada estrictamente después del límite, la verificación de fixtures ya no debe impedir reparar retroactivamente el rollover (`seasonRollover.ts:107–114`); un `pendingUserMatch` real sí impide cerrar para no descartar ese partido (`seasonRollover.ts:80–86`).

## Cambios por archivo

- `src/lib/season/seasonRolloverCore.ts`: añade la comprobación pura `isSeasonRolloverDue`, a partir del final de temporada calculado para la etiqueta real.
- `src/lib/season/seasonRollover.ts`: crea el punto de entrada común `advanceSeasonIfDue`, combina de forma conservadora la fecha del guardado y el reloj vivo, comprueba partidos pendientes, reutiliza el checkpoint/transición transaccional, evita rollovers concurrentes y notifica a las rutas montadas después del commit. En partidas posteriores al límite admite recuperación retroactiva y conserva fichajes de verano registrados en el historial.
- `src/store/playersStore.ts`: bloquea `advanceTime` antes de cruzar la frontera de temporada si el rollover asíncrono aún no se ha ejecutado.
- `src/components/GameDayBar.tsx`: detecta la frontera al cargar la partida y al avanzar un día; evita competir contra la transacción por lotes del salto.
- `src/routes/calendar.tsx`: el avance de un solo día y el salto llaman al punto de entrada común. El salto divide los lotes de guardado al llegar al cierre, mantiene checkpoints cada siete días y, si hay competiciones pendientes, se detiene en el límite con un motivo explícito. También repara guardados antiguos que ya están en agosto antes de empezar un nuevo salto.
- `src/routes/season.tsx`: refresca la pantalla al producirse un rollover automático, muestra el resumen archivado y ofrece un acceso al calendario cuando hay pendientes que impiden cerrar la temporada.
- `src/lib/transfers/ContractEngine.ts` y `src/lib/transfers/LoanEngine.ts`: aceptan exclusiones de jugadores con movimientos posteriores al 30 de junio; se usan al reparar una partida de agosto para no volver a procesar como vencimientos/retornos los contratos y las cesiones que ya se modificaron en la ventana de verano.
- `scripts/season-boundary-rollover-test.mjs`: comprueba el cableado del avance diario y salto, idempotencia/recuperación, migración retroactiva, protección de fichajes y una simulación determinista que atraviesa el límite y produce ascensos, descensos y fixtures de la temporada siguiente.
- `package.json`: añade el comando `test:season-boundary-rollover`.

El diff completo con cambios exactos está en `Modo-Carrera-season-rollover-auto.patch` en la entrega, además del código completo de cada archivo en el ZIP.

## Reparar la partida que ya está en agosto de 2027

1. Haz una copia de seguridad de la carpeta del proyecto y, si tienes una función de exportar/duplicar partida en el juego, duplica el guardado actual. No borres `localStorage`, IndexedDB ni los datos del mercado.
2. Instala el ZIP corregido sobre el proyecto, conservando `node_modules` y el archivo de configuración local.
3. Inicia con `npm run dev` y carga la misma carrera. Si `currentDate` es posterior a `2027-06-30` pero `season` continúa en `2026/27`, `GameDayBar` invoca la reparación de forma automática. También se intenta reparar antes del siguiente salto desde Calendario.
4. La reparación calcula ascensos/descensos, archivará la temporada y creará las estructuras de competición/calendarios de `2027/28`. Mantiene la fecha de agosto para no rebobinar el reloj. Los jugadores con transferencias registradas entre `2027-07-01` y la fecha guardada quedan excluidos de los procesos de fin de campaña que pudieran deshacer sus contratos o cesiones; el mercado separado se hidrata y se persiste durante la transacción.
5. Si aparece el mensaje de un `pendingUserMatch`, resuelve primero ese partido desde Calendario. No fuerces el rollover ni borres sus datos: la protección está para no perder un resultado pendiente.

Limitación honesta: no tengo acceso directo a la base IndexedDB/localStorage activa de tu navegador, por lo que no puedo confirmar el contenido de su ledger o del historial de fichajes. La corrección se basa en la fecha guardada y en `listTransfers()` del mercado persistido. Si un fichaje nunca se registró en ese historial, no existe evidencia de ese movimiento para identificar de forma automática al jugador que debe excluirse; en ese caso conserva el backup para poder recuperar el estado original.

## Pruebas

Las siguientes pruebas pasan en el entorno disponible:

```bash
npm run test:season-rollover
npm run test:season-promotion
npm run test:season-calendar
npm run test:calendar-jump
npm run test:calendar-jump-competitions
npm run test:season-boundary-rollover
npm run test:season-lifetime
npm run test:season-economy
npm run test:startup-regression
npm run test:cup-calendar-runtime
npm run test:season-european
npm run test:season-history
npm run test:team-league-overrides
npm run test:season-balance
```

`test:season-boundary-rollover` verifica una simulación determinista que cruza el 30 de junio de 2027 hasta agosto de 2027, cambia de `2026/27` a `2027/28` una sola vez, obtiene al menos un ascenso y un descenso y crea fixtures de la nueva temporada. Es una prueba headless y de cableado/invariantes, no una prueba de navegador completo con IndexedDB real.

No se pudo ejecutar `npm run typecheck`: el entorno no tiene instalada la definición `vite/client` (`TS2688`). Tampoco se ha podido confirmar el arranque end-to-end en el navegador en este entorno.

## Riesgos / decisiones

- En la fecha exacta del 30 de junio, los fixtures que no tengan resultado o las competiciones europeas que no estén en fase `done` detienen el avance con un mensaje; el usuario debe resolver esos pendientes. Se prefiere bloquear a borrar partidos.
- Una partida estrictamente posterior al 30 de junio se trata como antigua/inconsistente y se repara retroactivamente. Si hay un partido pendiente activo del equipo del usuario, la reparación se bloquea en lugar de descartarlo.
- La preservación de fichajes de verano depende de que las operaciones estén en el historial persistido de transferencias y de que los IDs de los jugadores coincidan.
- El test de veinte temporadas y el test de la frontera usan datos sintéticos. Aún se recomienda probar una carrera real con copia de seguridad y ejecutar el build/typecheck en el entorno local que sí tenga las dependencias completas.

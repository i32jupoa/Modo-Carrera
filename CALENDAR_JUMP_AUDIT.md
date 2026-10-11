# Auditoría e implementación: salto del calendario

Fecha de revisión: 11 de octubre de 2026.

## 1. Resumen ejecutivo

- El salto mantiene un avance **día a día** y reutiliza `advanceTime(1, { simulateAllLeagues: true, mode: "jump", targetDate })`; el día objetivo se deja pendiente.
- La causa no era que cada `loadSave()` hiciera siempre `JSON.parse`: ya existía una caché autoritativa. Sin embargo, cada llamada intentaba borrar de `localStorage` una clave obsoleta antes de consultar esa caché; se ha movido la limpieza a una única ejecución por sesión.
- El guardado principal pasa a un **batch en memoria**, con checkpoint cada siete días y persistencia final. Los `saveSave()` intermedios actualizan la caché pero no serializan/escriben el SaveGame completo.
- Se han endurecido los fallos de simulación: en modo salto no se convierte una excepción en un 0-0 ficticio y no se retira de la cola una jornada cuya simulación haya fallado.
- Se añadieron instrumentación `performance.now()` y un test estático reproducible. El test de salto no sustituye a una integración real de navegador.
- No se ha podido medir el rendimiento real en ms/día ni certificar la igualdad integral salto-vs-avance-manual: faltan las dependencias instaladas para compilar y no se dispone de una sesión de juego ejecutable en este entorno.

## 2. Flujo de datos por día

```text
Selección de fecha futura
  └─ esperar tareas de academia pendientes
  └─ guardar/confirmar snapshot del mercado
  └─ beginSaveBatch(checkpointEveryDays = 7)
      └─ repetir hasta la fecha objetivo, sin resolver ese día:
          ├─ advanceTime(1, mode="jump", simulateAllLeagues=true, targetDate)
          │   ├─ fecha y recuperación de energía
          │   ├─ ligas propias/secundarias y copas programadas
          │   ├─ sorteos y competiciones europeas aplicables
          │   ├─ progresión mensual, buzón/noticias y otras tareas diarias
          │   ├─ colas de cantera del usuario y canteras IA
          │   └─ saveSave(): publicar objeto actual en caché; diferir IO principal
          ├─ si el día se detuvo por partido/sorteo, resolver el evento intermedio
          ├─ no confirmar el día hasta que los partidos elegibles estén resueltos
          ├─ acumular estados de academias IA en memoria, sin perder sus partidos/estadísticas
          ├─ ceder al navegador con setTimeout(0) para mostrar avance
          └─ cada 7 días: esperar tareas, persistir academias IA + mercado y checkpoint
      ├─ esperar canteras/tareas pendientes
      ├─ persistir mercado y SaveGame final
      └─ marcar éxito y dejar el día objetivo sin simular

Si falla el pipeline: detener el salto, volver al SaveGame del último checkpoint
válido, restaurar el snapshot de Zustand y restaurar el snapshot de mercado
(mejor esfuerzo). La cantera usa almacenamiento separado y no tiene rollback
atómico completo en esta implementación; ver riesgos residuales.
```

### Llamadas y costes por día

Los conteos exactos de `saveSave()` y `loadSave()` dependen de los eventos de cada fecha; ahora se registran en consola en lugar de presentar un número fijo inventado.

- `advanceTime(1, ...)`: una llamada por iteración del bucle; puede haber otra vuelta sobre el mismo día cuando el calendario se detiene ante un partido o sorteo.
- `resolveIntermediateDate(date)`: se ejecuta para fechas intermedias y también como resolución de un bloqueo. No debe ejecutarse para la fecha objetivo.
- `saveSave()`: puede recibir varias llamadas en un día, pero durante el batch actualiza primero la caché y aplaza la persistencia principal.
- SaveGame principal: un checkpoint por cada siete días completos más el guardado final. Para un salto de N días, se esperan estructuralmente `floor(N/7) + 1` flushes principales si se alcanza el destino; un checkpoint que coincida con el destino puede ir seguido del flush final. El modo de almacenamiento determina si el flush serializa con JSON a `localStorage` o usa el almacenamiento persistente moderno.
- `loadSave()`: todas las llamadas se cuentan, pero `JSON.parse` solo se ejecuta al fallar los caminos de caché/lectura rápida, no en cada llamada. La limpieza de la clave heredada `fcsim:save:v1` se realiza una vez por sesión.
- Mercado y academias son subsistemas persistidos aparte. El mercado se confirma al inicio, en checkpoints y al final. Durante el salto, la academia IA se persiste en checkpoints cada siete días y al final; el avance manual conserva su persistencia por fecha.

## 3. Cuellos de botella

No se incluyen milisegundos estimados como si fueran mediciones: el tiempo real depende del tamaño de la partida, la cantidad de equipos, el almacenamiento y las competiciones activas. La instrumentación incorporada permite medirlo en una partida real.

| Archivo y zona | Coste estructural / evidencia | Cambio aplicado o decisión |
|---|---|---|
| `src/lib/store.ts:1299-1340` (`loadSaveImpl`) | Antes se ejecutaba `localStorage.removeItem("fcsim:save:v1")` incluso cuando la caché autoritativa respondía la lectura. No era un `JSON.parse` por llamada, pero sí I/O síncrono repetido. | Primero se consulta la caché; la clave antigua se limpia una sola vez por sesión. Se miden llamadas totales y parseos reales por separado. |
| `src/lib/store.ts:1869-1900`, `1979-2089` (`saveSaveImpl` y batch) | Una persistencia individual puede construir un save reducido y serializar una estructura grande; el fallback a `localStorage` bloquea el hilo. | En modo salto, `saveSave()` publica la referencia autoritativa en memoria. Se hace flush cada siete días y otro al final, con checkpoint de rollback. El avance normal conserva el camino anterior. |
| `src/routes/calendar.tsx:1180-1266` (`handleJumpToDate`) | El calendario espera cada día y procesa el pipeline secuencialmente; las fechas bloqueadas pueden exigir una vuelta adicional. | Se conserva el orden diario y un `setTimeout(0)` en vez de una espera de fotograma fija. Se instrumentan `advanceTime`, resolución de fecha y yield. No se omiten subsistemas para acelerar. |
| `src/lib/store.ts:5962-6035` (`simulateBackgroundLeaguesOnlyImpl`) | La planificación de ligas extranjeras revisa fixtures de las competiciones activas al avanzar cada fecha; el coste crece con la cantidad de ligas/partidos y días. | La primera jornada incompleta se calcula en una pasada por los fixtures de cada liga y se repara el calendario pendiente según las fechas programadas. El escaneo diario global sigue siendo un coste estructural. |
| `src/lib/store.ts:6609-6978` (`processScheduledBackgroundSimsImpl`) | Las jornadas debidas requieren recorrer y actualizar partidos y estadísticas; búsquedas repetidas de fixture pueden resultar cuadráticas si se busca cada ID en la temporada completa. | Se usan índices por ID y snapshots parciales para ligas/copas debidas. Las jornadas con partidos fallidos no se eliminan silenciosamente de la cola. |
| `src/store/playersStore.ts:187-235`, `src/lib/academy/academyAiMatchdayRunner.ts`, `src/lib/academy/academyStore.ts:80-100` | La cantera genera once, estadísticas de cada jugador y estado serializado por club; repetir ordenaciones y escribir IndexedDB cada día multiplica el coste. | La selección calcula la puntuación de cada jugador una vez por partido. Durante el salto se acumulan estados IA y se serializan/escriben en checkpoints; fallos de salto descartan cambios juveniles no confirmados. El profiler separa generación de calendario, simulación y persistencia. |
| `src/routes/calendar.tsx:956-1035`, `src/store/playersStore.ts:2147-2488` aprox. | Resolver jornadas de copa, sorteos y competiciones europeas puede actualizar múltiples listas del save; varios guardados lógicos pueden ocurrir el mismo día. | Las mutaciones pasan por el batch principal y se mide cada fase; los datos de mercado separados se esperan en checkpoints y al terminar. La compatibilidad con todos los formatos de competición debe seguir validándose en navegador. |

## 4. Auditoría de corrección y riesgos

### Corregido en esta entrega

| Gravedad original | Evidencia | Riesgo y reproducción | Mitigación aplicada |
|---|---|---|---|
| **Crítica** | `src/store/playersStore.ts:2694-2710` | En la vía antigua, una excepción simulando un partido podía marcarlo como jugado con resultado neutro 0-0. Reproducible forzando un error de alineación o del motor durante el salto. | En `mode: "jump"`, ahora se lanza un error contextual y el salto se detiene; el fallback histórico solo se mantiene en el avance normal para no cambiar ese comportamiento sin una migración separada. |
| **Alta** | `src/store/playersStore.ts:1942-2039`; `src/lib/matchEngine.ts:56-95` | Un XI vacío podía generar un 0-0 o un resultado estimado sin estadísticas individuales. | `simulateMatchForCalendarJump` obtiene XI desde la plantilla y rechaza un once vacío antes de confirmar el partido. `advanceTime` también aborta el salto en errores. El fallback de `matchEngine.ts` sigue existiendo para otros llamadores no pertenecientes al salto y queda como deuda separada. |
| **Alta** | `src/lib/store.ts:6810-6968` | Una ronda podía retirarse de `pendingBackgroundSims` aunque faltara una lista de fixtures, un encuentro o su aplicación de resultado. | Cada entrada conserva estado de éxito; se elimina de la cola solo si se completaron los partidos que le corresponden. Los problemas emiten diagnóstico y dejan el partido pendiente. |
| **Alta** | `src/routes/calendar.tsx:1227-1249` | Finalizar también la fecha objetivo haría que se perdieran los partidos/sorteos que el usuario espera gestionar al llegar. | Se procesa solo cuando `after < targetDate`; se verifica que la fecha final sea exactamente la solicitada y hay una aserción estática que evita reintroducir la ruta que confirmaba los resultados del objetivo. |
| **Alta** | `src/routes/calendar.tsx:1166-1280`; `src/lib/store.ts:1979-2089` | Si la operación falla durante el salto, el objeto en memoria y el save físico podrían no coincidir. | Batch de guardado con checkpoints cada siete días, snapshot del estado del store y restauración del mercado. El guardado final solo se declara correcto si el flush confirma éxito. |
| **Media** | `src/lib/store.ts:1299-1325` | La limpieza de clave heredada ejecutada cada vez sumaba operaciones síncronas en cada lectura. | Se prioriza la caché y se limpia la clave v1 una sola vez por sesión. |
| **Media** | `src/store/playersStore.ts:1879-1887`, `src/lib/academy/academyStore.ts:80-100` | Los fallos en colas asíncronas de academia podían quedar fuera del resultado de avance y el salto podía declararse terminado. | El salto espera ambas colas y propaga errores; la persistencia de academia lanza error en modo `fastForward` si no se confirma. |

### Riesgos que no se deben dar por resueltos

1. **Rollback completo entre varios almacenes — gravedad alta/media.** El SaveGame principal y el estado del mercado tienen checkpoints; el estado de cantera del usuario y de la IA se persiste en registros separados de IndexedDB por fecha. Si falla el salto después de que haya avanzado una cantera pero antes del siguiente checkpoint del SaveGame, no existe un snapshot transaccional para restaurarla exactamente. No se debe afirmar atomicidad global.
2. **Aleatoriedad reproducible — gravedad media.** El proyecto usa `Math.random()` en simulación, sorteos y otros sistemas. El test de balance tiene una semilla para ese test aislado, pero no se ha inyectado un PRNG global en todos los subsistemas. Por tanto, aún no puede demostrarse una igualdad byte-a-byte entre N avances manuales y un salto con “la misma semilla”.
3. **Estadísticas de ligas de fondo — limitación de fidelidad.** `generateFakeMatchResult()` (`src/lib/store.ts:5579` aprox.) y `recordFakeMatchStats()` (`:6311` aprox.) son el motor ligero ya usado por la simulación de fondo. Actualizan resultados y estadísticas agregadas que maneja esa vía, pero no construyen para cada partido de todas las ligas un informe detallado idéntico al motor de partido en vivo (línea de eventos, ratings completos y MVP). No se ha reemplazado esa vía por el motor completo porque aumentaría mucho el coste y alteraría el modelo existente.
4. **Límite de 800 días — gravedad baja para saltos normales.** Ahora el límite termina en error explícito en lugar de salida silenciosa. Saltos mayores de 800 días siguen bloqueados intencionadamente por seguridad; deberán hacerse en varios tramos o el límite se podrá revisar después de validar temporadas completas.
5. **No hay paridad end-to-end todavía.** El nuevo test comprueba invariantes estáticas del código y el test de temporadas valida el equilibrio general del motor, pero ninguno simula una misma partida real dos veces para comparar todos los stores.
6. **Build completo pendiente.** En el entorno de trabajo no están instaladas las dependencias de proyecto. Se ha podido transpilar sintácticamente TypeScript con la versión global disponible, pero esto no equivale a `tsc --noEmit` o al build de Vite.

## 5. Diseño elegido

Se eligió un pipeline de día compartido con un modo `jump`, guardado principal por lotes y ejecución secuencial de la lógica existente. Se descartó crear una segunda simulación abreviada que omitiera cálculos de academia, mercado o competiciones.

```text
Avance manual ──────────────┐
                            ├─ advanceTime(días, options)
Salto de calendario ────────┘      ├─ mode="single": comportamiento histórico
                                   └─ mode="jump": errores críticos visibles,
                                      proteger fecha objetivo y persistencia batch

Día intermedio → procesar eventos → validar pendientes → contador/checkpoint
                                                            ↓
                                      guardar al día 7, 14, 21... + final
                                                            ↓
                                      éxito o restauración al último checkpoint
```

Decisiones:
- No se ha introducido una dependencia nueva ni un Worker: el modelo actual modifica Zustand y utiliza storages/servicios auxiliares que no son transferibles sin más a un worker.
- Los cálculos de las competiciones y academias no se omiten. En las academias de IA se quitan los yields por sublote durante el salto, se difiere la serialización/IndexedDB al checkpoint y se precomputan las puntuaciones de selección de juveniles una vez por partido.
- El UI mantiene el yield por día para poder mostrar progreso. La actualización visual sigue cediendo el control al navegador una vez por fecha. Si el profiler sigue mostrando un coste alto, el siguiente cambio sería separar el refresco visual (p. ej. cada 100 ms) del procesamiento interno, validando primero que no se altera el orden del estado ni la capacidad de detener errores.
- Los writes de SaveGame se hacen en checkpoints de siete días, no al final de cada mutación. Se mantiene el guardado final incluso si el último checkpoint coincide con la fecha objetivo.

## 6. Instrumentación

La instrumentación está en `src/lib/calendarJumpProfiler.ts` y está desactivada de forma predeterminada.

1. Abre la partida en el navegador y sus DevTools → Console.
2. Ejecuta:

   ```js
   localStorage.setItem("fcsim:profile-calendar-jump", "1")
   ```

3. Realiza un salto real de 7, 30 y 90 días. Busca el grupo `[CalendarJumpProfiler]` en la consola. Muestra el total, ms/día, duración y número de llamadas por fase/contador.
4. Desactiva después con:

   ```js
   localStorage.removeItem("fcsim:profile-calendar-jump")
   ```

Fases instrumentadas: `advanceTime`, resolución de fecha, yield al navegador, lectura/parseo de save, llamadas y deferred saves, checkpoints, persistencia principal, mercado, simulación y planificación de ligas, partidos de fondo, copas/sorteos, Champions, Europa/Conference, academia de usuario/IA, progresión mensual, buzón/noticias y render commit del calendario.

### Benchmark solicitado (transparencia)

| Salto | Antes (ms total / ms por día) | Después (ms total / ms por día) | Guardados principales esperados después |
|---:|---|---|---:|
| 7 días | Requiere repetir en la misma partida | Pendiente de ejecutar en navegador | Hasta 2 checkpoints/flushes principales y de academia |
| 30 días | Requiere repetir en la misma partida | Pendiente de ejecutar en navegador | Hasta 5 checkpoints/flushes principales y de academia |
| 90 días | Requiere repetir en la misma partida | Pendiente de ejecutar en navegador | Hasta 13 checkpoints/flushes principales y de academia |

Perfil real aportado por el usuario antes de estos cambios: salto 2026-07-01 → 2026-08-29, 59 días, 149.270 ms total (2.530 ms/día). La fase marcada `simulation.academy.ai` acumuló 137.024 ms; `saveSave.total` acumuló solo 2,3 ms entre 306 llamadas y `loadSave.total` 4,3 ms entre 729 llamadas. Las duraciones de las fases asíncronas pueden solaparse y no deben sumarse. El perfil posterior a estos cambios debe medirse en la misma partida y navegador; no se inventan tiempos antes/después.

## 7. Tests ejecutados

| Verificación | Resultado | Qué demuestra / qué no demuestra |
|---|---|---|
| `node scripts/calendar-jump-invariants.mjs` | **Superado** | Comprueba estáticamente que el loop usa el modo jump día a día, no procesa fecha destino, agrupa guardados, conserva fallos de la cola, rechaza XI vacíos y espera persistencia del mercado/cantera. No es end-to-end. |
| `node scripts/season-balance-test.mjs --seasons=50 --seed=20261011` | **Superado** | 50 temporadas / 19.000 partidos; media de 2,95 goles por partido; correlación entre ranking de plantilla y posición media: 0,997. Es un test de equilibrio, no de salto de calendario. |
| `node --check scripts/calendar-jump-invariants.mjs` | **Superado** | Sintaxis del test de Node. |
| `typescript.transpileModule` sobre los TypeScript/TSX modificados | **Superado sintácticamente** | No equivale a comprobar los tipos del proyecto completo ni al build de Vite. |
| `vite build` / `tsc --noEmit` | **No ejecutado** | Faltan dependencias locales (`node_modules`) en este entorno. |
| Paridad N días de salto vs. N llamadas manuales con seed global | **Pendiente** | Requiere inyectar RNG reproducible en toda la simulación, aislar stores y ejecutar integración. No se afirma igualdad integral sin ese test. |

### Test reproducible

```bash
npm run test:calendar-jump
node scripts/season-balance-test.mjs --seasons=50 --seed=20261011
```

## 8. Checklist manual antes de usar en la partida principal

- [ ] Crear una copia del guardado.
- [ ] Activar el profiler y saltar 7 días; verificar que la fecha final es correcta y los eventos de ese día siguen pendientes.
- [ ] Revisar el resultado de tu liga y confirmar que los partidos simulados registran XI/estadísticas, no un 0-0 placeholder.
- [ ] Revisar una jornada de al menos dos ligas extranjeras: resultados completos y clasificación que coincide con los marcadores.
- [ ] Probar un día con copa nacional, un sorteo europeo y un partido intermedio del equipo de usuario.
- [ ] Probar el salto a través de cambio de mes/ventana de fichajes y esperar a que terminen las colas de cantera.
- [ ] Reiniciar el navegador, recargar el guardado y comprobar que fecha, resultados, clasificaciones y mercado coinciden con la memoria vista al finalizar.
- [ ] Repetir 30/90 días y comparar el perfil en la misma máquina/navegador; revisar que el tiempo por día no crece de forma desproporcionada.

## 9. Archivos cambiados en esta entrega

- `src/routes/calendar.tsx`: orquestación del salto, fecha objetivo sin simular, esperas y checkpoints/rollback.
- `src/lib/store.ts`: caché y batch de guardado, limpieza de clave heredada, planificación/cola de ligas y métricas.
- `src/store/playersStore.ts`: modo salto, simulación de partidos con XI válido, errores explícitos y espera de academias.
- `src/lib/calendarJumpProfiler.ts`: instrumentación opt-in.
- `src/lib/academy/academyStore.ts`: detección de error de persistencia en fast-forward.
- `src/lib/academy/academyAiMatchdayRunner.ts`: evitar yields entre bloques de academia durante el salto, sin eliminar simulaciones.
- `scripts/calendar-jump-invariants.mjs`: test de invariantes estáticas.
- `package.json`: comando `test:calendar-jump`.

El archivo ZIP adjunto incluye el proyecto completo, no solo estos cambios.


## 10. Seguimiento tras el perfil real del usuario (11 de octubre de 2026)

El perfil recibido reporta un salto de 59 días en 149,27 s (2.530 ms/día). La fase de academia IA acumuló 137,02 s, por lo que el mayor coste medido estaba en las canteras, no en la serialización del SaveGame principal. `academy.user` reportó 78,41 s en cuatro llamadas, pero estas medidas pueden solaparse en el tiempo de pared con la cola de academias IA que comparte hilo/esperas; no se suman entre sí como si fueran fases secuenciales.

Cambios añadidos en esta revisión:
- `src/lib/academy/academySimulation.ts`: cada puntuación de selección se calcula una vez por jugador y partido y luego se reutiliza en las ordenaciones; se mantiene el mismo comparador de selección.
- `src/lib/academy/academyProgression.ts`: `previousMonthStats` ahora recorre el historial una sola vez para encontrar el mes previo más reciente, evitando `filter` + `slice` + `sort` por cada jugador durante cada progresión mensual.
- `src/lib/academy/academyAiMatchdayRunner.ts` + `academyAiPersistence.ts`: durante saltos, los estados juveniles de la IA se mantienen en memoria y se confirman en cada checkpoint semanal y al final; se elimina el yield por cada ocho clubes en el guardado de checkpoint.
- `src/lib/academy/academyPromotionEngine.ts`: promociones y avances que mutan una cantera durante el salto se añaden al batch para no ser sobrescritos por una copia anterior.
- `src/lib/academy/academyStore.ts`: instrumentación de carga, progresión, partido y persistencia de la cantera del usuario.
- `src/routes/calendar.tsx` + `src/store/playersStore.ts`: se inicializa/cierra el batch juvenil y se descartan los cambios no confirmados si falla el salto. La fecha objetivo no encola partidos de cantera.
- El profiler ahora expone `academy.ai.clubsScheduled`, `academy.ai.clubsSimulated`, `academy.ai.statesGenerated`, `academy.ai.playersGenerated`, `simulation.academy.ai.buildCalendar`, `simulation.academy.ai.matchSimulation` y `simulation.academy.ai.persist`.

La mejora real de ms/día todavía debe medirse en navegador con la misma partida: este entorno no ejecuta el juego ni puede reproducir los 59 días del usuario.

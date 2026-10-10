# Football Sim — informe de cambios y validación

## Entrega

Este informe acompaña al proyecto completo. Se ha mantenido el stack existente (React, TypeScript, TanStack y Zustand) y el idioma español. Los cambios principales se concentran en el motor de partidos, el guardado del resultado, las competiciones europeas y la presentación de la temporada.

## 1. Arquitectura revisada

- **Motor deportivo:** `src/lib/simulation.ts`, `src/lib/matchEngine.ts`, `src/lib/liveMatchEngine.ts` y `src/lib/matchPlayback.ts`. Calcula goles, ocasiones, tarjetas, lesiones, fatiga y eventos.
- **Estado y persistencia:** `src/lib/store.ts`, `src/lib/saveStorage.ts` y los stores en `src/store/`. Conservan equipos, jugadores, partidos, resultados y energía.
- **Calendario y competiciones:** `src/lib/calendar.ts`, `src/lib/fixtureScheduler.ts`, `src/lib/leagueSchedule.ts`, `src/lib/teamForm.ts` y `src/data/europeanCompetitions.ts`.
- **Interfaz:** páginas en `src/routes/` y componentes en `src/components/`. Las rutas relevantes son `match.tsx`, `lineup.tsx`, `season.tsx`, `standings.tsx`, `ucl.tsx`, `europa-league.tsx`, `conference-league.tsx`, `squad.tsx` y `cantera.tsx`.
- **Cantera y noticias:** subsistema `src/lib/academy/` y `src/lib/news/`, con presentación de noticias en `src/components/news/`.

## 2. Bloque A — lógica y datos

### A1. Saltar partido sin perder lo anterior

En `src/routes/match.tsx`, al saltar se conservan los eventos jugados y se añaden los del tramo restante, evitando duplicados por minuto/tipo/jugador. El resultado final se reconstruye desde los eventos de gol combinados y se utiliza al persistir el partido, de forma que el resultado de la crónica no se vuelva a sustituir por un resultado precalculado distinto. También se guardan eventos, tarjetas, sustituciones, notas y energía al finalizar.

Para partidas antiguas que no contienen eventos de gol suficientes se conserva un fallback con el resultado del partido; es una medida de compatibilidad con guardados previos.

### A2. Energía compartida

`src/routes/lineup.tsx` prioriza la energía del estado de partido guardado en el snapshot en lugar de volver a presentar el valor inicial de la ficha del jugador. Se corrige también el cálculo de energía redondeada.

### A3. Portero en todo momento y reserva de la IA

`src/lib/store.ts` reserva un portero suplente elegible al formar el banquillo automático de equipos de IA, siempre que exista uno en la plantilla. En `src/lib/simulation.ts`, la gestión de expulsiones de porteros puede introducir al portero suplente cuando hay cambio y ventana disponibles; se retira un jugador de campo para respetar la inferioridad numérica. Si no hay un cambio reglamentariamente disponible o no hay otro portero, se asigna un jugador de campo apto como portero de emergencia para los cálculos del partido.

### A4. Superioridad e inferioridad

`src/lib/simulation.ts` hace que las expulsiones reduzcan la producción esperada del equipo sancionado y aumenten la del adversario. El efecto se aplica simétricamente a local y visitante. La presión táctica y la fatiga siguen afectando el desgaste.

### A5. Cantera de la IA

El repositorio ya contenía un motor de promociones para equipos de IA en `src/lib/academy/academyPromotionEngine.ts`, conectado desde `src/lib/transfers/MarketSimulation.ts`: promociones de pretemporada, necesidades de plantilla y emergencias cuando hay plantillas por debajo del mínimo. Estas rutas no se han reescrito en esta tanda para no duplicar el sistema existente. Las promociones automáticas dependen de que exista una partida activa y de que la cantera generada tenga jugadores elegibles; no se ha añadido una promoción forzada en todos los clubes y temporadas.

### A6. Rojas y segunda amarilla

`src/lib/simulation.ts` aplica generación de tarjetas a ambos equipos, con probabilidad contextual basada en posición, agresividad y riesgo de faltas. Se mantiene la segunda amarilla como expulsión y se incluye probabilidad de roja directa. El rango de minuto se amplía para cubrir el descuento.

### A7. Aviso al regresar a Central

`src/routes/season.tsx` muestra un aviso de las incidencias de la última jornada del equipo del usuario (lesión o expulsión), con jugador y los datos disponibles de lesión/sanción. Se almacena el identificador leído para no repetir constantemente el mismo aviso.

### A8. Tiempo añadido

`src/lib/simulation.ts` permite acciones hasta el minuto 94 en la simulación de goles, eventos, tarjetas, lesiones y jugadas destacadas. Los cambios por lesión comprueban el límite de sustituciones y ventanas; las sustituciones realizadas en pocos minutos se agrupan como una misma ventana.

### A9. El mensaje no revela el desenlace

`src/routes/match.tsx` ofrece 60 titulares y textos neutrales distintos para las escenas previas. Se elimina el rótulo fijo “JUGADA EN DESARROLLO” y se deja vacío el campo de detalle que antes podía adelantar “Siguiente: el disparo…”. El texto se elige de forma reproducible por encuentro/minuto/equipo, sin depender del desenlace precomputado; las 60 variantes no dicen si la acción terminará en gol o fallo.

### A10. Afinidad posicional

El asignador de alineaciones de la IA en `src/lib/store.ts` utiliza afinidad entre posición solicitada y posición principal/secundaria. En `src/lib/teamProfile.ts` el XI representativo también usa similitud posicional para evitar dejar huecos por una interpretación rígida de la demarcación. La matriz existente diferencia afinidad alta (por ejemplo MCD–MC), media (lateral–central) y muy baja o nula (portero fuera de portería).

### A11. Equilibrio de equipos y prueba de temporadas

En `src/lib/simulation.ts` se ajusta la conversión de diferencia de calidad a cuota de xG para reducir resultados excesivamente aleatorios: se usa una función `tanh` acotada, una ventaja local moderada y una base total cercana a 2,95 xG. La valoración del once, fortaleza colectiva, ataque y defensa continúan ponderando el resultado; las tácticas alteran esas probabilidades y el azar permanece.

Se añade `scripts/season-balance-test.mjs` y el comando `npm run test:season-balance`. **Importante:** es una prueba Monte Carlo aislada que calibra una fórmula con una liga sintética; no ejecuta el juego completo ni reemplaza una prueba de integración en la interfaz.

Resultado obtenido con 250 temporadas y semilla `20261010`:

- Partidos: 95.000.
- Media de goles: 2,94 por partido.
- Correlación de Pearson entre ranking de plantilla y posición final media: 0,997 (1 significa mejor equipo/mejor posición).
- Victorias sorpresa de equipos con diferencia de OVR de al menos 8: 7.114 triunfos del equipo de menor OVR, tras corregir el contador durante la continuación.
- El informe `season-balance-results.txt` contiene los puntos y la posición media por ranking de plantilla.

### A12. Tácticas avanzadas

Los multiplicadores se aplican desde `tacticsModifiers` de `src/lib/teamTactics.ts` y se consumen en `src/lib/simulation.ts` para xG, defensa, desgaste y faltas. La lógica añade interacciones entre presión y salida corta, línea alta y pase directo/contraataque, juego ancho y bloque estrecho, además de contraataques ante equipos dominantes.

| Táctica | Efecto implementado | Coste o contrapartida |
|---|---|---|
| Estilo ofensivo | Ataque ×1,07; defensa ×0,96 | Riesgo defensivo ×1,06 |
| Estilo defensivo | Ataque ×0,94; defensa ×1,06 | Menos capacidad ofensiva |
| Presión alta | Ataque ×1,035; defensa ×1,025; agresividad ×1,08 | Fatiga ×1,075 y riesgo de faltas ×1,12 |
| Presión baja | Reduce agresividad/faltas; agresividad ×0,92 | Menor ataque; stamina ×0,94 |
| Línea alta | Ataque ×1,015 | Defensa base ×0,985, desgaste ×1,025 y riesgo ×1,12; vulnerable a balones a la espalda |
| Línea baja | Defensa ×1,04; riesgo ×0,91 | Ataque ×0,985 |
| Ritmo alto | Ataque ×1,035; creación ×1,04 | Fatiga ×1,065 y riesgo ×1,035 |
| Ritmo lento | Posesión ×1,045 | Ataque ×0,975 |
| Bloque ancho | Posesión ×1,015 | Defensa ×0,99 y desgaste ×1,015 |
| Bloque estrecho | Defensa ×1,015 | Posesión ×0,985 |
| Anchura ofensiva | Ataque ×1,025; ocasiones ×1,035 | Más desgaste y ligera pérdida defensiva |
| Ataque estrecho | Posesión ×1,02 | Creación ×0,975 |
| Pase corto | Posesión ×1,045 | Ataque ×0,985 |
| Pase directo | Ataque ×1,025; ocasiones ×1,025 | Posesión ×0,965 y riesgo ×1,025 |
| Contraataque | Ataque ×1,025; ocasiones ×1,02 | Posesión ×0,985; mejora especialmente contra rival dominante/línea alta |
| Perder tiempo | Ataque ×0,965; fatiga ×0,985 | Menor capacidad para atacar |
| No perder tiempo | Ataque ×1,01 | Riesgo defensivo ×1,015 |
| Marcaje individual | Defensa ×1,025 | Fatiga ×1,025, faltas ×1,10 y riesgo ×1,025 |
| Marcaje intenso | Defensa ×1,04 | Fatiga ×1,055, agresividad ×1,13 y faltas ×1,24 |
| Agresividad alta | Agresividad y faltas ×1,20 | Puede aumentar expulsiones; stamina ×1,02 |
| Agresividad baja | Agresividad y faltas ×0,82 | Defensa ×0,99 |

Los multiplicadores tienen límites para que una única selección táctica no rompa las probabilidades.

## 3. Bloque B — competiciones, forma y eliminatorias

- **B1 — Árbitros:** `src/lib/seasonExtras.ts` separa los pools nacionales (España, Inglaterra, Italia, Alemania y Francia) del pool internacional UEFA. La asignación se mantiene estable por identificador de partido.
- **B2 — Central europea:** `src/routes/season.tsx` detecta el próximo encuentro europeo y presenta la tabla de la competición activa correspondiente en vez de mostrar por defecto la liga doméstica.
- **B3/B4 — Forma:** `src/lib/teamForm.ts` incorpora `getTeamFormsForCompetition()`. `src/routes/standings.tsx` y las páginas de Champions, Europa League y Conference League calculan la forma sólo con partidos de esa competición; la Central mantiene la forma global.
- **B5 — Eliminatorias:** `src/routes/ucl.tsx`, `src/routes/europa-league.tsx` y `src/routes/conference-league.tsx` muestran global, ganador destacado, etiqueta de ronda, partidos de ida/vuelta con fecha y marcadores. Se representa la prórroga con “(a.p.)” y las tandas con “Pen. x-y”. Se elimina la etiqueta “FIN” de las filas de partido.

## 4. Bloque C — interfaz

- **C1:** `src/routes/season.tsx` compacta la cabecera de Central en una línea, elimina el subtítulo largo y quita la barra “Progresión”, conservando “Evolución”.
- **C2:** `src/routes/teams.tsx` calcula la media de las notas a partir de todos los `result.ratings` de los partidos disputados de la temporada (liga, copa y competiciones europeas), ignorando apariciones sin minutos y sin depender de la caché mensual. Sólo recurre a estadísticas dinámicas/historial si no hay notas de partidos disponibles.
- **C3:** no se encontró la fila de accesos descrita (“Ir a: Alineación y banquillo…”) en la versión entregada; por ello no había una fila coincidente que eliminar.
- **C4:** `src/components/match/MomentumBar.tsx` usa los colores locales de equipo local y visitante, coherentes con la barra de estadísticas, en lugar de rojo/verde.
- **C5:** `src/routes/squad.tsx` limita la ficha colapsada a datos compactos y colorea los grupos por posición; `src/components/PlayerFace.tsx` y `src/components/PlayerDetailDialog.tsx` permiten mostrar el retrato cuadrado/rectangular en el detalle, como en el Mercado. Se elimina el mensaje de estado de mercado de la pestaña.
- **C6:** `src/routes/cantera.tsx` agrupa juveniles por POR/DEF/MED/DEL, usando la misma escala de cabecera y acentos cromáticos que Plantilla. Se elimina el título “Promesas de la academia”; las secciones de instalaciones, mapa de necesidades y comparador no se muestran como secciones principales.
- **C7:** el antiguo panel fijo ya no se renderiza. `src/lib/teamOfRound.ts` construye el **Equipo de la jornada** con las notas de la última ronda de una competición concreta; `src/routes/season.tsx` lo añade como noticia normal y `src/components/news/NewsWindow.tsx` muestra el campo/minimapa al abrirla. La vista del XI usa `src/components/TypicalElevenPitch.tsx`.
- **C8:** `src/routes/__root.tsx` detecta la ruta de partido y oculta navegación lateral y elementos globales que distraen mientras el partido está activo; el resto de la navegación vuelve al abandonar esa pantalla.

## 5. Archivos editados (lista completa)

La clasificación siguiente agrupa **todos los archivos de código que difieren del proyecto de partida**, además de los ficheros nuevos de test e informe.

### Motor, estado, tácticas, plantilla y mercado

- `src/lib/simulation.ts`
- `src/lib/store.ts`
- `src/lib/teamTactics.ts`
- `src/lib/teamProfile.ts`
- `src/lib/positions.ts`
- `src/data/players.ts`
- `src/lib/academy/academyPersistence.ts`
- `src/lib/academy/academyProgression.ts`
- `src/lib/transfers/InternalContractNegotiation.ts`
- `src/lib/transfers/TransferEngine.ts`
- `src/lib/transfers/UserNegotiation.ts`
- `src/store/playersStore.ts`

### Resultados, competiciones, árbitros y estadísticas

- `src/lib/teamForm.ts`
- `src/components/TeamForm.tsx`
- `src/components/competition/KnockoutTieList.tsx` (nuevo; agregado global e ida/vuelta compartidos)
- `src/lib/teamOfRound.ts` (nuevo; XI ideal por competición/ronda)
- `src/lib/seasonExtras.ts`
- `src/lib/awards.ts`
- `src/routes/awards.tsx`
- `src/routes/standings.tsx`
- `src/routes/ucl.tsx`
- `src/routes/europa-league.tsx`
- `src/routes/conference-league.tsx`
- `src/routes/scorers.tsx`
- `src/routes/team-stats.tsx`
- `src/routes/teams.tsx`

### Partido, alineaciones y experiencia visual

- `src/routes/match.tsx`
- `src/routes/lineup.tsx`
- `src/routes/__root.tsx`
- `src/components/match/MomentumBar.tsx`
- `src/components/PlayerFace.tsx`
- `src/components/PlayerDetailDialog.tsx`
- `src/components/TypicalElevenPitch.tsx`
- `src/components/news/NewsWindow.tsx`
- `src/routes/squad.tsx`
- `src/routes/cantera.tsx`

### Noticias, bandeja de notificaciones y bandeja de entrada

- `src/components/MarketNotificationInbox.tsx`
- `src/components/NewsPanel.tsx`
- `src/components/NotificationToast.tsx`
- `src/components/news/TeamOfWeekPanel.tsx` (nuevo)
- `src/lib/news/NewsDetector.ts`
- `src/lib/news/NewsDetectorCore.ts`
- `src/lib/news/newsText.ts`
- `src/lib/news/__tests__/news.test.ts`
- `src/lib/mailbox.ts`
- `src/store/notificationsStore.ts`
- `src/routes/season.tsx`
- `src/routes/mailbox.tsx`

### Otras vistas de mercado/contratos y configuración

- `src/components/market/ScoutingDetailsModal.tsx`
- `src/routes/scouting.tsx`
- `src/routes/transfers.tsx`
- `package.json` (comando `test:season-balance`)
- `tsconfig.json` (excluye los ficheros de test del chequeo de producción)
- `scripts/season-balance-test.mjs` (nuevo; métrica de triunfos sorpresa corregida durante la continuación)
- `season-balance-results.txt` (resultados actuales del test)
- `INFORME_CAMBIOS.md` (este informe)

Se han conservado los ficheros de configuración y documentación originales que faltaban en la primera carpeta de trabajo. El ZIP final excluye `node_modules`, `dist` y `.output` porque son dependencias y artefactos generados; se reconstruyen al instalar y ejecutar el proyecto.

## 6. Validación técnica (actualizada el 10-10-2026)

- **TypeScript: pasa.** `npm run typecheck` termina con código 0 y `tsc --noEmit` no informa errores. En esta continuación se corrigieron los últimos errores que quedaban: se añadió una salida segura al informe de ojeador cuando el jugador no está disponible y se eliminaron propiedades duplicadas en los valores estadísticos de fallback.
- **Test de equilibrio: pasa.** `npm run test:season-balance -- --seasons=250 --seed=20261010` simula 95.000 partidos, obtiene 2,94 goles por partido y una correlación de Pearson de 0,997 entre ranking de plantilla y posición final media. La métrica de sorpresas se corrigió para contar sólo triunfos del equipo de menor OVR con una diferencia de al menos 8 puntos; el resultado corregido es 7.114.
- **Build: aún no verificada por dependencias del entorno.** `npm run build` no puede arrancar en este entorno porque el shim local de `cross-env` carece de permiso de ejecución. Ejecutando Vite directamente, Rolldown consigue usar su fallback WASI tras resolver el runtime, pero la compilación se detiene al faltar `lightningcss.linux-x64-gnu.node`. El `node_modules` preinstalado está incompleto; el ZIP no incluye `node_modules`, por lo que debe instalarse con `npm ci` o `npm install` en el equipo de destino antes de probar la build. No se debe interpretar este fallo del entorno como una build validada.
- **ESLint: no validado globalmente.** La ejecución focalizada detecta incumplimientos de Prettier en archivos de base extensos. No se ha aplicado un formateo automático global para evitar generar cambios masivos de presentación ajenos a la corrección funcional.
- **Pruebas de integración visuales:** no se ha podido ejecutar la aplicación web completa en navegador en este entorno; los escenarios A1–C8 siguen listados en la checklist manual y deben validarse en la app tras instalar dependencias.

## 7. Checklist manual (A1–C8)

Marca cada elemento al comprobarlo en una partida de prueba:

- [ ] **A1** Anotar un gol/evento, pulsar “Saltar” y comprobar resultado idéntico en partido, crónica, jornada, clasificación y forma.
- [ ] **A2** Comparar energía durante el partido, al abrir Editar alineación y después del guardado.
- [ ] **A3** Expulsar/lesionar al portero con portero suplente y con cero cambios disponibles; comprobar que siempre hay portero funcional.
- [ ] **A4** Provocar una roja y comparar ocasiones/desgaste durante la inferioridad.
- [ ] **A5** Avanzar pretemporada y cierres de mercado de clubes IA; comprobar ascensos juveniles y que cubren necesidades.
- [ ] **A6** Jugar varios partidos hasta comprobar rojas directas y segundas amarillas para ambos equipos.
- [ ] **A7** Volver a Central tras lesión/expulsión y confirmar aviso, datos y comportamiento de lectura.
- [ ] **A8** Mantener un partido hasta el 90+ y verificar ocasiones, goles, tarjetas y otras acciones.
- [ ] **A9** Confirmar que la notificación previa no permite saber si la jugada terminará en gol o fallo.
- [ ] **A10** Autoalinear equipos con jugadores polivalentes (por ejemplo un MCD en MC) y comprobar que no quedan fuera injustificadamente.
- [ ] **A11** Ejecutar varias veces el test; después simular temporadas completas en la aplicación y contrastar posiciones con la fuerza real de las plantillas.
- [ ] **A12** Cambiar cada táctica avanzada, comprobar su efecto y su contrapartida durante varias jornadas.
- [ ] **B1** Comprobar que los partidos domésticos asignan árbitros de su país y los europeos pueden usar árbitros internacionales.
- [ ] **B2** Con Europa como próximo partido, comprobar la tabla que aparece en Central.
- [ ] **B3** Revisar la forma del rival en Champions, Europa League y Conference League.
- [ ] **B4** Comparar forma de tabla doméstica/europea con forma global de Central.
- [ ] **B5** Comprobar en Champions, Europa y Conference global, ganador en negrita, ida/vuelta, fechas, prórroga, penaltis y ausencia de “FIN”.
- [ ] **C1** Verificar la cabecera compacta y que “Evolución” se mantiene.
- [ ] **C2** Comprobar que jugadores de otras ligas acumulan nota media real durante la temporada.
- [ ] **C3** Confirmar que no aparece la fila de accesos descrita.
- [ ] **C4** Comparar los colores de momentum con los de estadísticas del partido.
- [ ] **C5** Revisar los cuatro grupos, ficha colapsada y retrato cuadrado al expandir.
- [ ] **C6** Revisar agrupación y colores de cantera, y ausencia de secciones descartadas.
- [ ] **C7** Entrar en Noticias desde Central, localizar “Equipo de la jornada” y abrir la tarjeta; debe aparecer el minimapa con el XI de esa ronda y competición.
- [ ] **C8** Iniciar un partido y confirmar que desaparece la navegación global durante el encuentro.

## 8. Decisiones tomadas

1. Se conserva un fallback para resultados antiguos sin eventos de gol suficientes, en lugar de invalidar guardados existentes.
2. El portero de emergencia se elige entre los jugadores activos priorizando adecuación defensiva/física/valoración; no se simula un cambio reglamentario cuando ya no está permitido.
3. La prueba Monte Carlo es sintética y reproducible mediante semilla fija; se informa por separado de la validación manual del motor real.
4. Se mantuvo el estilo y el idioma de la aplicación. No se hizo una reescritura global de los errores de TypeScript previos porque habría ampliado el alcance y dificultado aislar regresiones.
5. El bloque de cantera conserva el motor de promociones existente y su cadencia de pretemporada/ventana/necesidad, sin forzar subidas indiscriminadas.


## 9. Ajustes de la última revisión

- **Equipo de la jornada como noticia:** se elimina la dependencia del panel fijo antiguo. Se genera una noticia para la última ronda disputada de cada competición en la que participa el club del usuario (liga, copa y torneos europeos, según corresponda), para que la de Champions no reemplace a la de liga. Cada noticia se identifica por competición/ronda y, al abrirla, aparece el campo con el XI ideal, sus posiciones y notas. El tema visual distingue liga, copa, Champions, Europa y Conference.
- **Espacio de partido:** `src/routes/match.tsx` amplía el contenedor hasta 1600 px, incrementa los espacios entre paneles y mejora las proporciones entre campo/minimapa, reloj, momentum y crónica en escritorio.
- **Momentum:** `src/components/match/MomentumBar.tsx` recibe exactamente la misma pareja de colores ya calculada para las estadísticas del partido desde `src/lib/matchPresentation.ts`.
- **Variedad de previas:** existen 60 combinaciones de encabezado y texto neutral; no muestran “JUGADA EN DESARROLLO” ni un detalle que anticipe el tipo de resolución.
- **Lesiones simultáneas o de cualquier equipo:** `src/routes/match.tsx` evalúa las lesiones antes de elegir cualquier otro momento destacado, muestra una notificación conjunta si suceden en el mismo minuto, registra todos los jugadores lesionados y ejecuta la sustitución rival incluso cuando el motor no había preparado `forcedSub/replacementId`. Si la lesión coincide con una previa de gol/ocasión, una revisión VAR o un penalti, la incidencia se deja en cola y se muestra al cerrar esa secuencia interactiva, para no perder al segundo lesionado. Si se lesiona el portero rival, usa un portero de banquillo cuando existe y un portero de emergencia cuando no hay otro disponible.
- **Eliminatorias europeas:** `src/components/competition/KnockoutTieList.tsx` se usa en las tres páginas europeas y muestra el global, las dos piernas, la fecha, el ganador de cada partido, prórroga y resultado de penaltis; elimina los rótulos “FIN” del diseño de eliminatorias.
- **Centro de clubes:** se recalcula la nota media por jugador desde la suma de notas de todos sus partidos disputados en la temporada, incluyendo sus partidos de otras ligas y competiciones.
- **Cantera y forma:** se elimina el encabezado “Promesas de la academia”, los encabezados POR/DEF/MED/DEL usan una escala equivalente a Plantilla, y las filas de clasificación doméstica alinean los círculos V/E/D en el centro vertical.

### Validación de esta revisión

- `npm run typecheck`: **correcto, 0 errores** tras los últimos cambios.
- `npm run test:season-balance`: **correcto**, 250 temporadas / 95.000 partidos, 2,94 goles por partido, correlación 0,997 y 7.114 victorias sorpresa registradas.
- `npm run build`: intentado desde este entorno pero no termina porque falta el binario nativo `lightningcss.linux-x64-gnu.node`; `npm run build` también choca con el permiso de ejecución del shim `cross-env`. Esto es una limitación de la instalación local del entorno de trabajo, no una prueba de que la compilación falle en Windows. En el equipo de destino se confirmaron anteriormente `npm ci`, TypeScript y arranque de Vite, pero debe probarse esta nueva versión visual en navegador.

### Checklist específico para esta revisión

- [ ] Pulsar la noticia **Equipo de la jornada** y comprobar que el campo se muestra dentro de la ventana, no como panel fijo.
- [ ] Iniciar un partido y comprobar que los paneles aprovechan el ancho y no quedan apretados/desalineados.
- [ ] Comparar colores de momentum con colores de estadísticas para ambos equipos.
- [ ] Jugar varios partidos y comprobar variación de las 60 previas sin pistas sobre el desenlace.
- [ ] Probar una lesión propia, una del rival, dos lesiones en el mismo minuto y una lesión del portero rival; revisar aviso, crónica y sustitución.
- [ ] Abrir las fases eliminatorias de Champions, Europa y Conference; verificar el global, ida/vuelta y desempates.
- [ ] Comparar notas medias de jugadores de varias ligas con sus valoraciones individuales acumuladas en la temporada.
- [ ] Comprobar que no aparece el apartado “Promesas de la academia” y comparar el tamaño de las cabeceras de cantera con Plantilla.
- [ ] Comparar la alineación vertical de los círculos V/E/D entre LaLiga y Champions.


### Verificación adicional después de secuencias interactivas

- Se añadió `deferredInjuryMinuteRef` en `src/routes/match.tsx`: si en un minuto con lesión se muestra antes una previa de gol/ocasión o un penalti interactivo, la lesión queda pendiente y se procesa cuando termina la cadena de resolución/VAR/tarjetas o el lanzamiento. Esto evita saltarse una lesión que comparte minuto con un evento clave.
- El Equipo de la jornada ahora conserva una noticia para la última ronda jugada de cada competición en la que el club del usuario participa, en vez de mostrar sólo la competición del partido más reciente globalmente.
- Tras estos últimos cambios, `npm run typecheck` termina con 0 errores y `npm run test:season-balance` sigue pasando con 250 temporadas / 95.000 partidos. La build no está verificada en el contenedor Linux por las dependencias nativas ya documentadas.

## Continuación: eliminatorias, progresión de centrales y alineaciones IA (2026-10-10)

- `src/components/competition/KnockoutTieList.tsx`: eliminatorias compactadas; el resumen global queda centrado; se eliminan los títulos de ronda repetidos en cada partido y se muestran únicamente «Ida»/«Vuelta». El desempate por penaltis se integra en el marcador con el formato `1 (3) – (0) 1`; cuando hay prórroga sin penaltis, el texto pasa a «Prórroga».
- `src/lib/teamOfRound.ts` y `src/routes/season.tsx`: la noticia del Equipo de la jornada incorpora el Jugador de la jornada con su nota, junto a la competición y la ronda.
- `src/lib/playerProgression.ts`: los centrales y laterales progresan principalmente por notas y rendimiento defensivo; goles y asistencias tienen un peso menor. El umbral de porterías a cero se ajusta a la media de OVR del equipo, reduciendo exigencias para defensas de clubes modestos.
- `src/lib/store.ts`: la alineación automática penaliza mucho más las posiciones sin afinidad real, evitando que extremos como Rodrygo ocupen puestos de lateral si no constan como posición secundaria válida.
- `src/routes/cantera.tsx`: tamaño de cabeceras de grupos reducido para aproximarlo al de Plantilla. La sección «Promesas de la academia» ya no estaba presente en el archivo revisado.

### Validación de esta continuación
- `npm run typecheck`: correcto, cero errores.
- `npm run test:season-balance`: correcto; 250 temporadas, 95.000 partidos, media de 2,94 goles y correlación de 0,997.
- No se ha podido hacer una validación visual de navegador desde este entorno; comprobar manualmente eliminatorias, noticia de jugador de jornada y alineaciones de IA en el cliente Windows.

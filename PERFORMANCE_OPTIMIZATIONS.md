# Optimización de rendimiento — FC SIM

Esta versión está orientada a que **Avanzar día**, **Simular/Saltar partido** y volver a **Temporada/Central** mantengan un coste casi constante a medida que crece la carrera.

## Cambios aplicados

### Lectura y guardado
- `loadSave()` usa una caché del `SaveGame` activo y evita volver a ejecutar `JSON.parse()` en cada render o navegación.
- `saveSave()` publica el estado en memoria inmediatamente y agrupa la serialización/compactación para ejecutarla fuera del camino crítico de la interacción.
- `flushPendingSaveToDisk()` fuerza el último guardado al ocultar/cerrar la pestaña.
- `saveStorage` mantiene un espejo en memoria y agrupa escrituras hacia IndexedDB.
- `slimResult()` elimina de los partidos históricos las estructuras más pesadas (`stats`, XI completos, tiempo extra redundante) y conserva el detalle útil para la UI.
- La búsqueda de partidos que merecen detalle completo se limita a las competiciones relevantes del club del usuario.

### Simulación de partidos y avance de día
- `advanceTime()` hace una sola lectura de la partida, una sola copia del calendario principal y un único guardado lógico al final del avance normal.
- Se eliminó el patrón de reconstruir el array completo de fixtures por cada partido simulado.
- Las estadísticas de un partido se actualizan con `withPlayerStatsBatch()`, de modo que varios goles/asistencias/apariciones comparten una sola actualización del mapa.
- `simulateMatch` reutiliza una sola copia de fixtures para todos los partidos del mismo día.
- El trabajo pesado de simulación de ligas/copa en segundo plano cede CPU al navegador antes de empezar.
- Una revisión de versión evita que una simulación de fondo antigua pueda publicar sobre una jornada más reciente.

### Copas y simulaciones de fondo
- `fixCupDraws()` usa copy-on-write y no clona la partida cuando no hay nada que reparar.
- `autoDrawForeignCups()` hace una comprobación previa y evita clonar la partida en días sin trabajo de copas extranjeras.
- `processScheduledBackgroundSims()` copia sólo las colecciones que realmente corresponden a las ligas/copas pendientes.
- Corregido el `next` reasignable en el procesamiento de simulaciones programadas (`let` en lugar de `const`).

### React/UI
- `MatchDayModal` ya no ejecuta `loadSave()` en cada render.
- `GameDayBar` dejó de leer la partida completa para pintar la barra.
- `MatchStatsModal` puede recibir el `SaveGame` ya disponible de la pantalla padre.
- La pantalla de temporada memoriza los cálculos caros de próximo partido, resultados recientes y clasificación.
- `Calendar` ya no ejecuta por su cuenta las mismas simulaciones de copa/background que después hacía `advanceTime`; hay una única ruta de avance.

### Mercado y estadísticas
- `saveTransferSystem()` coalesce llamadas concurrentes para no serializar y escribir el mercado varias veces durante una misma interacción.
- La selección de candidatos de emergencia del mercado parte de índices por posición en lugar de recorrer todos los jugadores antes de filtrar.
- Las progresiones mensual y de final de temporada usan el mismo mecanismo batch de estadísticas y ya no dependen de un método inexistente en el store.

## Validación realizada

Se transpilaron con TypeScript, sin errores de sintaxis, los archivos modificados principales, incluyendo:

- `src/lib/store.ts`
- `src/store/playersStore.ts`
- `src/lib/saveStorage.ts`
- `src/lib/transfers/Persistence.ts`
- `src/lib/transfers/TransferEngine.ts`
- `src/components/MatchDayModal.tsx`
- `src/components/MatchStatsModal.tsx`
- `src/components/GameDayBar.tsx`
- `src/routes/__root.tsx`
- `src/routes/calendar.tsx`
- `src/routes/season.tsx`
- `src/routes/fixtures.tsx`
- `src/routes/cup.tsx`
- `src/routes/ucl.tsx`

En este entorno no se pudo completar `npm ci`/`vite build` porque la instalación de dependencias disponible quedó incompleta; por eso no se presenta el build como una validación pasada. El ZIP final no incluye `node_modules`.

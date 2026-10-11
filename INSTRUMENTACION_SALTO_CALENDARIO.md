# Instrumentación de diagnóstico del salto de calendario

## Activación

En DevTools, con el juego cargado, ejecutar:

```js
localStorage.setItem("fcsim:profile-calendar-jump", "1")
```

Recargar la página para asegurar que la instrumentación está activa desde el inicio del salto y ejecutar el mismo rango que produjo el perfil anterior. Al terminar, copiar todo el grupo `[CalendarJumpProfiler]`, incluidas las dos tablas `console.table` y el objeto final.

Desactivar después:

```js
localStorage.removeItem("fcsim:profile-calendar-jump")
```

## Nuevas medidas

- `calendar.resolve.*`: desglosa la función que antes aparecía como una única fase de ~3,1 s/día: selección y simulación de partidos, persistencia de resultados, snapshot de mutación, copas nacionales, Champions, Europa League y Conference League, progreso de eliminatorias y guardados.
- `playersPersist.JSON.stringify`: tiempo real de `JSON.stringify` del middleware Zustand. Se mide en el límite correcto de `PersistStorage`; medir solamente el `Storage.setItem` externo excluiría el tiempo de serialización que ya ocurrió antes de llamarlo.
- `playersPersist.middlewareWrites` y `playersPersist.writesByDate.YYYY-MM-DD`: número de escrituras del middleware total y por fecha de juego. `playersPersist.stringify.bytes` es la suma de caracteres serializados; no equivale exactamente a bytes UTF-8.
- `market.*`: rollover, promociones de cierre de ventana, clubs activos, cada `runClubDay`, expiración de negociaciones y rumores.
- `marketClock.*`: mide el punto real donde React sincroniza el mercado. El mercado no se llama directamente desde `advanceTime`; se sincroniza en el efecto de `useMarketClock`, así que se instrumenta allí en vez de atribuirle tiempo falso a `advanceTime`.

## Tabla que necesito que pegues

1. La tabla de fases ordenada por `total_ms`, sin recortar las primeras 25 filas.
2. Las filas `playersPersist.*`, `market.*`, `marketClock.*` y todas las `calendar.resolve.*`.
3. La tabla de contadores completa, en especial `playersPersist.middlewareWrites`, `playersPersist.writesByDate.*`, `calendar.resolve.leagueFixturesFound`, `market.clubsProcessed` y `market.activeClubDays`.
4. El resumen final con fechas, días avanzados y tiempo total.

Usa un salto de 30 días en una partida de prueba, preferiblemente durante ventana de mercado, y repite exactamente el mismo rango una segunda vez para comparar. No cambies la configuración de cantera entre ambas pruebas.

## Alcance

Esta versión añade medición, no aplica todavía el batch global de persistencia de Zustand. Así se puede confirmar primero si `JSON.stringify` representa una parte material de los ~85 s no explicados. El parche separado `calendar-jump-persist-batch-candidate.patch` contiene una corrección candidata con flush final y flush después del rollback, pero debe activarse solo si las nuevas mediciones confirman que el coste de serialización es relevante.

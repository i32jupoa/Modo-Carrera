# Corrección del salto de calendario: liga, copas y competiciones europeas

## Incidencias corregidas

1. **Resultados de Champions/Europa/Conference no visibles al procesar la fecha**: el resolvedor diario busca ahora todos los encuentros pendientes cuya fecha oficial coincide con el día simulado, no solo aquellos en los que participa el club controlado. Después de simular cada jornada/fase, persiste el `SaveGame` y actualiza el estado visible del calendario.
2. **Sorteo nacional mostrado durante el salto**: el salto resuelve las notificaciones de sorteo en modo silencioso y limpia las colas que activarían los modales. También consulta el calendario persistido para descubrir un sorteo nacional vencido en la propia fecha de destino, incluso si `advanceTime` no lo añadió a la cola.
3. **Partido de copa del equipo del usuario interrumpe el avance**: se simulan los partidos del país del usuario con `simulateCupMatchdayLayered`; si una fixture antigua queda pendiente, se ejecuta el planificador de recuperación de copas y se valida que el resultado esté escrito antes de continuar.
4. **Fecha destino sin resolver**: todas las fechas alcanzadas por el bucle —incluida la fecha elegida— pasan por `resolveIntermediateDate`. Los diálogos de partido y sorteo permanecen silenciados durante el salto.
5. **Guardados innecesarios de reparación**: `fixCupDraws` conserva la referencia de la partida cuando no hay cambios que aplicar, evitando una escritura redundante en los accesos sin incidencias.

## Archivos modificados

- `src/routes/calendar.tsx`
- `src/store/playersStore.ts`
- `src/lib/store.ts` (ya incluía la corrección anterior de `fixCupDraws`; no se introducen cambios nuevos en esta entrega salvo las correcciones previamente incorporadas en el ZIP de base)
- `scripts/calendar-jump-invariants.mjs`
- `scripts/calendar-jump-competition-regression.mjs` (nuevo)
- `package.json`

## Pruebas ejecutadas

- `node scripts/calendar-jump-invariants.mjs`
- `node scripts/calendar-jump-competition-regression.mjs`
- `node scripts/cup-calendar-runtime-regression.mjs`
- `node scripts/players-store-startup-regression.mjs`
- `node scripts/season-balance-test.mjs` — 250 temporadas sintéticas y 95.000 partidos
- `node --experimental-strip-types scripts/season-calendar-test.mjs`
- `node --experimental-strip-types scripts/season-promotion-test.mjs`
- `node scripts/team-league-overrides-test.mjs`
- `node --experimental-strip-types scripts/season-european-qualification-test.mjs`
- `node --experimental-strip-types scripts/season-rollover-test.mjs`
- `node --experimental-strip-types scripts/season-history-test.mjs`
- `node --experimental-strip-types scripts/season-economy-test.mjs`
- `node --experimental-strip-types scripts/season-lifetime-test.mjs` — 20 campañas sintéticas

Todas estas pruebas han pasado. Las pruebas del salto son en su mayoría estáticas/de núcleo y no sustituyen una prueba completa en navegador con una partida real. En este entorno no se ha ejecutado la compilación completa de Vite ni un recorrido end-to-end del navegador.

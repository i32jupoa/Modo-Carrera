# Corrección de calendario y rendimiento de Cantera

## Comportamiento
- Los partidos juveniles solo se simulan cuando el calendario detecta un fixture `competition === "Liga"` del equipo controlado.
- Los días normales y las fechas de copa no generan partidos de cantera.
- Cada fecha de partido es idempotente: una misma jornada no duplica estadísticas aunque la sincronización se invoque varias veces.
- La progresión de cantera procesa inicios de mes y cambio de temporada, no recorre cada día.
- La sincronización asíncrona de Cantera solo se encola en días de Liga o al inicio de mes, reduciendo escrituras IndexedDB.
- La simulación juvenil sigue usando la lista de jugadores `academy` y `listed`; los `called-up` no reciben estadísticas juveniles.

## Archivos
- `src/lib/academy/academyProgression.ts`: progresión por hitos mensuales y función explícita para simular una jornada de Liga.
- `src/lib/academy/academyStore.ts`: permite a la sincronización del calendario pedir un partido juvenil exactamente en una fecha de Liga.
- `src/store/playersStore.ts`: solo encola partidos juveniles en jornadas de Liga; evita sincronizar/guardar cantera en cada día normal.
- `src/lib/academy/academyConstants.ts`: elimina el intervalo semanal, ya que la fecha la determina el calendario de Liga.
- `src/lib/academy/academySimulation.test.ts`: prueba que avanzar fechas normales no genera partidos, que una jornada explícita sí genera estadísticas y que no se duplica.

## Prueba manual
1. Avanza varios días sin partido de Liga: las estadísticas de cantera no deben cambiar.
2. Llega a un partido de Liga del primer equipo: se debe registrar una jornada juvenil para los canteranos no convocados.
3. Avanza por un partido de Copa o un día normal: no debe aumentar el contador de partidos juveniles.
4. Pulsa avanzar varias veces en la misma fecha: no debe duplicar apariciones.
5. Comprueba que los convocados mantienen únicamente las estadísticas del primer equipo.

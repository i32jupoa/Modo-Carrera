# Simulación de cantera de clubes IA

## Diseño

- Se usa el calendario de Liga ya guardado para todos los equipos de la liga del usuario.
- Para las demás ligas se construye una agenda determinista a partir del mismo generador de calendario del juego y se adapta al año de temporada actual.
- Solo se intenta simular la academia de un club cuando su primer equipo tiene partido de Liga en esa fecha. No se simulan partidos juveniles en días sin partido, ni en Copa/Champions.
- La academia de usuario conserva su flujo existente. Las academias IA usan el runtime/caché del motor de promociones para que los partidos, la progresión y las promociones modifiquen el mismo estado.
- Los convocados del usuario están excluidos de los partidos juveniles; sus estadísticas siguen registrándose en el primer equipo.

## Rendimiento

- El calendario se precalcula una vez por save, temporada y liga del usuario; se reutiliza mediante un mapa fecha → clubes.
- Los clubes se procesan en lotes de ocho, cediendo el hilo entre lotes. La acción `Avanzar día` no espera a que termine la simulación de IA.
- Se guardan solo las academias que se han procesado en esa jornada. La serialización se divide en pequeños lotes y todos los cambios se escriben en una única transacción de IndexedDB.
- La persistencia IA usa claves separadas por `saveId` y club. Borrar una partida elimina estas claves y cancela las escrituras pendientes de ese save.

## Pruebas manuales

1. Crea una carrera y avanza por varias fechas sin partido de Liga del primer equipo: no deben aumentar las apariciones juveniles solo por avanzar esos días.
2. Avanza a una fecha con partidos de Liga de la competición del usuario: deben simularse sus canteranos no convocados y los de otros clubes que juegan Liga ese día.
3. Comprueba que las estadísticas juveniles no incrementan las estadísticas de primer equipo de los jugadores IA ya promocionados.
4. Avanza un mes y revisa que las academias IA mantienen sus estadísticas y su OVR interno; los cambios se guardan por `saveId`.
5. Cierra y vuelve a cargar la carrera: no se deben regenerar las estadísticas de partidos ya disputados.
6. Cambia de partida o elimina la carrera activa: no deben aparecer estadísticas, convocatorias ni promociones de la carrera anterior.
7. Avanza varios días seguidos: la simulación de IA debe ejecutarse en segundo plano por bloques y el botón debe seguir respondiendo mientras se procesa.

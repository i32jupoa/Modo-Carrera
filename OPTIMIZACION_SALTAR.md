# Optimización de "Saltar" / "Saltar al final"

## Qué estaba haciendo lento el salto de un partido

1. **Stamina minuto a minuto con trabajo de UI innecesario**
   - Cada minuto de fast-forward llamaba a `drainStamina()`.
   - Esa función volvía a leer las tácticas y hacía `setStamina()` en cada tick aunque el usuario no podía ver esos estados intermedios.
   - Ahora se calcula la misma pérdida de stamina en memoria y se hace un único `setStamina()` al terminar.

2. **Búsquedas lineales repetidas de eventos**
   - En cada minuto se hacía `.filter()` sobre todos los eventos, tarjetas y highlights.
   - Ahora se indexan una vez por minuto y se consultan en O(1).

3. **Deduplicación costosa durante cada minuto**
   - Antes se reconstruían y recorrían arrays completos en cada iteración para evitar duplicados.
   - Ahora se usan `Set` de claves ya vistas y solo se añaden elementos nuevos.

4. **Escrituras a almacenamiento durante lesiones en fast-forward**
   - Una lesión podía provocar `persistLive()` mientras se estaba saltando.
   - Ahora el salto no escribe snapshots intermedios; el resultado final se persiste al cerrar el partido.

5. **Relecturas de alineaciones al simular jornadas**
   - En la liga del usuario, el XI generado para simular el partido se volvía a calcular al registrar las estadísticas.
   - Ahora se reutiliza el mismo XI.

6. **Tácticas leídas del almacenamiento partido a partido**
   - Había una caché de tácticas preparada, pero una de las ramas seguía llamando directamente a `loadTactics()`.
   - Ahora ambas ramas usan la caché.

7. **Banquillo regenerado varias veces dentro de una misma jornada**
   - Se añade una caché por equipo/competición durante la jornada para reutilizar el banquillo calculado.

8. **Log de depuración en cada render de MatchPage**
   - `console.log("Match fixture:", ...)` imprimía un objeto completo en cada render.
   - Se elimina del camino normal porque no aporta nada al usuario y genera ruido de consola.

## Qué no es la causa principal del retraso

Los avisos de Radix sobre `DialogTitle`/`Description` y los `404` de logos son problemas reales, pero no explican el coste principal de "Saltar al final". Conviene corregirlos por separado.

## Verificación

- `src/routes/match.tsx`: parseo/transpilación TypeScript OK.
- `src/lib/store.ts`: parseo/transpilación TypeScript OK.
- El `tsc --noEmit` completo del repositorio sigue devolviendo errores preexistentes en otros archivos (por ejemplo componentes con parámetros `any` implícitos y tipos antiguos), sin errores reportados en los dos archivos modificados.
- El build de Vite no pudo ejecutarse en este entorno porque el `node_modules` incluido en el ZIP carece del binding nativo de `rolldown`; no está relacionado con estos cambios.

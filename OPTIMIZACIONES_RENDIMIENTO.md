# Optimizaciones de rendimiento aplicadas

Se ha optimizado el proyecto para que el coste de las acciones interactivas no crezca con toda la historia de la temporada.

## Cambios principales

- Eliminadas las copias completas `JSON.parse(JSON.stringify(save))` de las rutas de simulación y avance. Se usa copy-on-write: solo se clonan los mapas y arrays que realmente van a cambiar.
- `loadSave()` ahora mantiene una caché del `SaveGame` activo y evita volver a hacer `JSON.parse()` al entrar de nuevo en `/season`, `/match` o pantallas que consultan el guardado.
- `saveSave()` publica primero el estado en memoria y aplaza la compactación + serialización grande de la partida a un hueco de CPU posterior (`requestIdleCallback` cuando está disponible). Esto evita que guardar bloquee botones y navegación.
- Las rutinas diarias de copas, programación de ligas/copa y simulaciones UCL dejaron de copiar toda la carrera en cada llamada.
- `getSimSquad()` reutiliza las plantillas ya convertidas/ordenadas mientras el estado relevante no cambie.
- `getMyNextFixtureAny()` ya no recorre todas las ligas completas: busca directamente en la liga del usuario, la copa correspondiente y UCL.
- `setLineup`, `setFormation` y `setSubstitutes` usan actualizaciones estructurales pequeñas en lugar de clonar toda la partida.

## Comprobación

El `typecheck` del proyecto sigue detectando errores TypeScript preexistentes en otros archivos, pero no reporta errores en `src/lib/store.ts` ni `src/store/playersStore.ts`.

El build no pudo completarse en este entorno porque el `node_modules` entregado dentro del ZIP carece del binding nativo opcional de Rolldown (`@rolldown/binding-linux-x64-gnu`). No se modificó la configuración de dependencias para ocultar ese problema.

Como comprobación aislada del cuello de botella, en una partida sintética de ~2,28 MB, copiar con `JSON.parse(JSON.stringify(...))` costó ~24 ms por copia frente a ~0,05 ms para el snapshot copy-on-write equivalente. Es una microprueba del mecanismo de copia, no una medición end-to-end del navegador.

# Cambio: tema de competición bloqueado durante el partido

- Al entrar en `/match`, la aplicación identifica la competición del encuentro usando `fixtureId` y los metadatos de la ruta.
- El ambiente visual queda guardado en `sessionStorage` y se conserva al abrir Dirección de equipo (`/lineup`) o volver al partido.
- El tema no vuelve a calcularse desde el próximo encuentro mientras continúe el flujo del partido.
- Al volver a `/season` (central de temporada) o al menú principal, se libera el bloqueo y la central vuelve a elegir el tema según el calendario.

El cambio afecta al fondo y al acento visual; no altera la simulación, el resultado ni los datos del partido.

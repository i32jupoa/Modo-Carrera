# Corrección: error «Out of memory» al cerrar temporada

## Cambios

- El checkpoint de transición ya no serializa el guardado completo, la instantánea del mercado y la cantera en un único JSON enorme. Cada carga pesada se guarda por separado; el índice de checkpoint sólo almacena referencias a esas cargas.
- La recuperación de transiciones interrumpidas sigue admitiendo checkpoints antiguos con los campos embebidos.
- Se limpian también las cargas auxiliares huérfanas si una pestaña se cierra antes de publicar el índice del checkpoint.
- El cierre actualiza el índice de temporadas leyendo las claves del archivo histórico, en vez de deserializar todos los archivos de temporadas previas.
- La construcción de goleadores y registros de jugador reutiliza una sola proyección de jugadores durante el archivado.
- La pantalla de resumen carga las filas detalladas de cada clasificación sólo cuando se abre esa liga.
- Añadido el test `test:season-archive-index`.

## Validación realizada

Se ejecutaron correctamente todos los scripts de regresión `scripts/*.mjs`, incluidos el cierre y la recuperación de temporada, el bloqueo del mercado, el historial y el nuevo índice de temporadas. Los tres archivos TypeScript/TSX modificados pasan el análisis sintáctico de TypeScript.

No se pudo ejecutar `tsc --noEmit` ni una compilación completa porque este entorno no tiene instaladas las dependencias del proyecto (`vite/client`). La comprobación final debe hacerse también con una carrera real en el navegador.

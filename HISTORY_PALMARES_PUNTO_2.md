# Historial y Palmarés — Punto 2

## Alcance

Rediseño de `/history` en componentes separados y con carga perezosa por pestaña. El selector global de temporada permanece visible mientras se navega por sus secciones y no cambia al cambiar de pestaña.

## Secciones

1. Resumen de temporada.
2. Clasificaciones de liga, con campeón, mejor ataque/defensa, zonas europeas y de descenso y forma de los últimos cinco encuentros cuando las fixtures históricas contienen esos resultados.
3. Copas nacionales con selector y partidos archivados por ronda.
4. Champions League, Europa League y Conference League con tabla de fase de liga cuando existe y resultados eliminatorios archivados.
5. Premios, máximos goleadores y asistentes.
6. Once estadístico de la temporada, con campo, escudos y datos de los jugadores.
7. Mercado con filtros por tipo, liga, club e importe.
8. Retirados de la temporada e histórico de retiradas.
9. Evolución y palmarés del club del usuario.
10. Récords de la carrera.
11. Palmarés de clubes.
12. Palmarés individual.

## Persistencia y compatibilidad

Los campos nuevos de `SeasonArchive` son opcionales y las entradas históricas con esquema antiguo se normalizan al leerlas. Los archivos antiguos no pueden mostrar datos que nunca guardaron: por ejemplo, un mercado histórico antiguo solo conserva los fichajes destacados, por lo que la UI lo avisa explícitamente.

El mercado completo se archiva con un límite de 2.000 movimientos por temporada para acotar el tamaño de las partidas longevas. El límite intenta preservar los traspasos de mayor importe y, después, los movimientos más recientes. Los resultados de copa y Europa solo se guardan cuando hay marcador final disponible. El once de la temporada es una selección estadística del juego a partir de valoración, apariciones, goles y asistencias; no se presenta como premio oficial independiente.

La forma de liga se guarda como W/D/L en orden cronológico para los últimos cinco partidos de liga disponibles en el cierre. Cuando no hay resultados suficientes, la pantalla deja esa celda vacía en lugar de inventar una racha.

## Pruebas

- `npm run test:season-history`
- `npm run test:season-archive-index`
- Batería de scripts `test:*` del `package.json`.
- `npm run typecheck` requiere las dependencias de desarrollo instaladas; en el entorno donde se preparó este cambio falla antes del chequeo del código por no encontrar `vite/client`.

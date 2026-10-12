# Fase 2 — Pertenencia mutable a ligas y ascensos/descensos

## Alcance de esta entrega

- `SaveGame.teamLeagueOverrides` es el registro persistido por carrera para las divisiones que difieren de `Team.league` en el catálogo base.
- Las lecturas de equipo (`getAllTeams`, `teamById`, `findTeamById`, `findTeamByName`, `findTeamStrict`), `teamsByLeague` y `getTeamLeagueId` resuelven la categoría efectiva sin modificar los objetos globales `TEAMS`.
- `setActiveTeamLeagueOverrides` mantiene un adaptador de lectura para consumidores heredados que aún no reciben el `SaveGame` explícitamente. `loadSave` / `saveSave` lo sincronizan y `newSave` lo limpia antes de crear una carrera distinta. La fuente de verdad sigue siendo `SaveGame.teamLeagueOverrides`.
- La migración de guardados antiguos añade `{}` si el campo no existe, valida IDs de club y conserva los calendarios ya persistidos. La reparación de una fixture rota usa la categoría efectiva de ese guardado al reconstruir el fixture canónico.
- `promotionRelegationCore.ts` es una función pura determinista. Calcula ascensos, descensos y eliminatorias a partir de clasificaciones definitivas y una semilla; no muta ni la entrada ni el registro global.
- `promotionRelegation.ts` adapta el motor al SaveGame, calcula overrides relativos al catálogo estático y prepara tablas, jornadas, calendarios y copas domésticas vacías para la próxima temporada. La transición completa que consuma este resultado se conecta en la fase 4.

## Reglas de movimiento

| País | Intercambio por frontera | Playoff adaptado |
|---|---|---|
| España | Tres ascensos y tres descensos | Cuatro aspirantes a la tercera plaza; semifinales y final a doble partido |
| Inglaterra | Tres ascensos y tres descensos | Cuatro aspirantes a la tercera plaza; semifinales y final a doble partido |
| Italia | Tres ascensos y tres descensos | Seis aspirantes (puestos 3.º–8.º); eliminatorias a doble partido |
| Alemania | Dos intercambios directos, con posible tercero | Club de la categoría superior (tercero por la cola) contra el tercero inferior |
| Francia | Dos intercambios directos, con posible tercero | Club de la categoría superior (tercero por la cola) contra el tercero inferior |

Los IDs de las pirámides son `laliga/laliga2`, `premier/championship/leagueone/leaguetwo`, `seriea/serieb`, `bundesliga/bundesliga2/liga3` y `ligue1/ligue2`. Las ligas no incluidas en estas pirámides no realizan movimientos de categoría. El nivel más bajo nunca desciende fuera de la base de datos jugable.

Se adaptan reglas por tamaño y estructura de las ligas del juego, no se pretende reproducir al 100 % todas las condiciones reglamentarias reales (por ejemplo, las diferencias de goles que pueden cancelar un playoff italiano). En empate de clasificación se usan puntos, diferencia de goles, goles a favor, victorias, partidos jugados y, como último desempate para datos incompletos, fuerza del club y nombre. Los desempates de playoff se resuelven por sorteo determinista derivado de la semilla guardada.

## Integración prevista

La fase 4 llamará a `calculateSavePromotionRelegation(save)` antes de archivar o resetear tablas y luego aplicará `prepareNextSeasonDomesticState(save, result)` dentro del checkpoint transaccional. No se invoca automáticamente al final de esta fase para evitar cambiar de división a mitad de una temporada: eso sucederá cuando exista el orquestador integral de cierre.

## Pruebas

`npm run test:season-promotion` ejecuta un test headless que comprueba determinismo, movimientos únicos, intercambios de tres plazas en las pirámides España/Inglaterra/Italia, playoff de permanencia en Alemania/Francia, tamaños estables de división, base sin descensos adicionales y veinte temporadas seguidas.

Esta prueba pura no sustituye todavía al test integral de veinte temporadas contra todos los datos del juego; se añade en la fase 6, cuando el orquestador de cierre esté conectado.

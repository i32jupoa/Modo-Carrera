# Cuadros de eliminatorias europeos

- Europa League y Conference League usan ahora el mismo componente de cuadro compacto que sigue dos rutas simétricas y termina en una final centrada.
- En las tres competiciones el equipo que juega la vuelta como local aparece en la fila superior de cada cruce. La orientación se toma del partido real de vuelta; se mantiene un fallback para slots aún no materializados.
- El cuadro conserva el orden de cruces mediante la relación play-off → octavos, cuartos y semifinales → final.
- Pulsar una eliminatoria de dos partidos abre un selector de ida/vuelta con escudos, nombres, fechas y marcadores. Al elegir un partido se abre su ficha.

Validación: `node --experimental-strip-types scripts/ucl-bracket-layout-regression.mjs`, `node --experimental-strip-types scripts/season-european-qualification-test.mjs` y `node scripts/calendar-jump-competition-regression.mjs`.

## Prioridad de vuelta por mérito heredado

- La clasificación de la fase de liga asigna una prioridad inicial (1 = mejor puesto).
- Al eliminar a un rival, el ganador hereda la mejor prioridad de los dos. Esa prioridad se conserva en todas las rondas posteriores.
- En cuartos y semifinales, el equipo con mejor prioridad juega la vuelta en casa; los partidos de ida se orientan en sentido inverso.
- La misma lógica se ejecuta en Champions, Europa League y Conference porque las dos últimas reutilizan el motor europeo de Champions.
- En partidas antiguas solo se reorienta una eliminatoria si todavía no se ha disputado ninguna de sus dos piernas, evitando alterar resultados históricos.

Validación adicional: `node --experimental-strip-types scripts/ucl-knockout-seeding-regression.mjs`.

## Selector disponible antes de disputarse la eliminatoria

- Las tarjetas de cruces a doble partido se pueden abrir en cuanto ambos equipos están definidos, aunque la ida y la vuelta sigan pendientes.
- Dentro del selector, cada partido pendiente se muestra desactivado. Solo una ida o vuelta con resultado permite abrir la ficha.
- La validación se aplica tanto al estado del botón como al callback de navegación, para impedir rutas de partido sin resultado.
- La final, al ser un único encuentro y no tener selector de ida/vuelta, permanece desactivada hasta disputarse.

Validación: `node --experimental-strip-types scripts/ucl-bracket-layout-regression.mjs` y `node --experimental-strip-types scripts/ucl-knockout-seeding-regression.mjs`.

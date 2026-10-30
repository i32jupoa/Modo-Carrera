# Cuadro de Champions League: final centrada y selector de ida/vuelta

- El cuadro se muestra en dos mitades simétricas: una ruta a la izquierda y otra a la derecha, con la final en el centro.
- Los play-offs se ordenan primero por el octavo al que alimentan; después, cada mitad se refleja sin alterar los cruces reales.
- Cada pareja de octavos alimenta su cuarto correspondiente, los cuartos alimentan su semifinal y ambas semifinales llegan a la final central.
- Al pulsar una eliminatoria de dos partidos aparece un selector con la ida y la vuelta, sus equipos, fecha, marcador y estado.
- Al seleccionar una de las dos opciones se abre su ficha. Para partidos pendientes se muestra la fecha y los equipos; para partidos jugados se muestran sus estadísticas.
- La final, al ser a partido único, abre directamente su ficha.

Validación: `node --experimental-strip-types scripts/ucl-bracket-layout-regression.mjs`.

## Ajuste visual y escudos en ida/vuelta

- Se elimina de las tarjetas el bloque lateral de estado (`Global`/`Ida`) y el texto `Ver ida/vuelta`.
- Se reduce el ancho de las columnas, la separación y la altura de las tarjetas para que el cuadro sea más compacto sin alterar sus conexiones.
- El selector de ida/vuelta muestra el escudo del club junto a su nombre y el marcador alineado a la derecha.
- Se mantiene la apertura de la ficha del encuentro al seleccionar cada partido.

Validación adicional: transpile sintáctico de `src/routes/ucl.tsx` y `node --experimental-strip-types scripts/ucl-bracket-layout-regression.mjs`.


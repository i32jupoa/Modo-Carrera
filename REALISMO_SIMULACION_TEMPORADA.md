# Ajustes de realismo de temporada

## Qué se ha ajustado

- **Diferencias entre equipos:** la curva de reparto de ocasiones usa `0.36 * tanh(diferencia / 7.5)` con límites 14/86. La versión adjunta que estaba provocando los resultados anómalos aún usaba `0.23 / 8.0` y límites 24/76, por lo que reducía demasiado la ventaja de las plantillas superiores. Se mantienen el factor local, las tácticas y la posibilidad de sorpresa.
- **Goleadores de élite:** el reparto interno de goles da más peso al OVR efectivo, la definición y la posición de remate. No fuerza un número de goles concreto; el resultado colectivo sigue controlando cuántos goles se marcan.
- **Asistentes:** se refuerza el peso de visión, pase, centro, regate y nivel de los creadores, especialmente extremos y mediapuntas. La probabilidad de que un gol tenga asistente sube del 77 % al 84 %.
- **Reparación de estadísticas de partidas antiguas:** se corrige la selección de goleadores reconstruidos. `Player.positions` utiliza códigos normalizados (`DC`, `ED`, `EI`, `MCO`, etc.); la reparación anterior priorizaba códigos en bruto del dataset (`ST`, `RW`, `CAM`) que no suelen aparecer en esos objetos.
- **Rotación de equipos CPU:** la penalización aleatoria a los ocho mejores jugadores se reduce y limita; ya no degrada de forma tan frecuente y drástica a los favoritos en partidos contra rivales inferiores. Los partidos europeos, eliminatorias y duelos importantes siguen sin activar rotación automática.
- **Rutas de respaldo:** los resultados generados cuando no hay un XI utilizable emplean la misma curva y los mismos goles esperados base que el motor normal; evita que una ruta alternativa simule una temporada con reglas diferentes.

## Validación reproducible

Con `node scripts/league-realism-test.mjs --seasons=20 --seed=20261014`:

- Correlación media Spearman entre la calidad del XI y los puntos de liga: aproximadamente **0,89**, frente a aproximadamente 0,80 con los parámetros anteriores.
- Goles medios: aproximadamente **2,95 por partido**.
- Pichichi medio de la prueba aislada: aproximadamente **35 goles por temporada de liga**.
- Líder de asistencias medio de la prueba aislada: aproximadamente **16 asistencias por temporada de liga**.
- En la muestra de referencia, los tres equipos más fuertes terminan fuera del top 8 en menos del **1 %** de los casos.
- Control específico de la Premier en 20 temporadas Monte Carlo (semilla `20261014`): Liverpool entra en el top 4 en el **95 %** de las temporadas, no cae al bottom 6 en ninguna y Everton no acaba entre los dos primeros en ninguna; ambas rutas de calendario dan el mismo resultado en este control.
- La prueba ahora falla si una liga o cualquiera de las rutas de calendario queda por debajo de una correlación de 0,80; también verifica la Premier, la curva del fallback y el límite de rotación.

Son pruebas Monte Carlo de catálogo con plantillas de referencia: no equivalen a repetir dentro del navegador una carrera guardada con fichajes, lesiones, retiradas, progresión y decisiones de la IA. Se mantienen la aleatoriedad y las sorpresas; no se garantiza que el favorito gane todos los partidos.


## Ajuste posterior: manda el once realmente utilizado

Cuando hay once válido, la fuerza de partido utiliza 80% de la media efectiva del XI, 12% del ataque posicional de ese mismo XI y 8% de la defensa posicional del mismo XI. No añade el rating estático del club a esa fuerza: un club de gran reputación con once de media 50 debe rendir como un once de media 50. La valoración del club queda reservada para rutas de emergencia sin alineaciones utilizables. La prueba `scripts/league-realism-test.mjs` incluye un estrés de 10.000 partidos con club reputado de 99 y XI de 50 contra un XI de 80, comprobando que la probabilidad de derrota sea al menos del 80%.

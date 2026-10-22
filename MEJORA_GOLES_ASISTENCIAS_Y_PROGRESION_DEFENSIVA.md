# Ajustes de estadísticas ofensivas y progresión defensiva

## Goles y asistencias

- Se refuerza moderadamente la ponderación de los delanteros centro y de los atacantes de élite por posición, media y atributos de finalización. La selección sigue siendo probabilística y no garantiza goles por partido.
- Los extremos/creadores reciben mayor peso en la selección de asistencias.
- La probabilidad de atribuir una asistencia se centraliza en el motor y sube al 88%, de forma consistente entre partidos detallados y rápidos.
- Cuando un resultado rápido no trae todos los eventos, los goles de respaldo también pueden generar una asistencia ponderada; antes, esos goles siempre quedaban sin asistencia.

## Progresión de centrales y laterales

- Las porterías a cero del equipo se guardan como señal de desarrollo para los defensas que han participado, sin incrementar su estadística pública de porterías a cero reservada al portero.
- Se aplica tanto a partidos rápidos de IA, a simulaciones de liga de fondo como a partidos detallados y partidos jugados en directo.
- La progresión defensiva da más importancia a la fiabilidad defensiva y añade una bonificación mensual moderada por continuidad/minutos y notas aceptables. Sigue limitada por edad, media actual, potencial/margen y rendimiento; no es una subida automática por ser defensa.
- Las porterías a cero se calculan con el marcador final incluyendo prórroga.

## Validación realizada

- `scripts/player-progression-realism-test.mjs`: correcto; central joven con buena temporada pasa aproximadamente de 78 a 81 OVR, y un central sin notas migradas progresa suavemente.
- `scripts/player-progression-balance-test.mjs`: correcto.
- `scripts/league-realism-test.mjs`: correcto en la muestra ejecutada; media global próxima a 2,95 goles por partido y conserva variación entre equipos.
- `scripts/scorer-ranking-scope-test.mjs`: correcto.
- `scripts/simulation-stats-repair-regression.mjs`: correcto.

No se recalculan estadísticas de temporadas ya terminadas. Los ajustes afectan a las siguientes simulaciones y a la progresión que siga acumulándose en la carrera.

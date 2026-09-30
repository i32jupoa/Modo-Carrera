# V6 — Diferencia real entre favoritos y rivales

## Objetivo

La simulación debía reflejar una jerarquía clara: Real Madrid, Barcelona y otros grandes deben poder convertir su superioridad de plantilla en temporadas de ~90 puntos, pero los rivales deben seguir teniendo ocasiones reales para marcar y ganar.

## Cambios

- Curva de reparto de xG más sensible a la diferencia de calidad: `0.34 * tanh(diff / 8.5)` en lugar de `0.24 * tanh(diff / 9.5)`.
- Techo 78/22: un favorito puede dominar, pero el rival no cae a xG artificialmente bajos.
- Entorno de goles de ~3.35 xG por partido.
- El fast-sim de ligas en segundo plano usa la misma curva de fuerza en lugar de una fórmula antigua independiente.
- Los goleadores de esas ligas usan el mismo `goalScorerWeight()` que los partidos simulados con detalle.

## Calibración

Con las valoraciones base de LaLiga del proyecto y 3.000 temporadas Monte Carlo:

| Equipo | Puntos medios | Temporadas >= 90 |
|---|---:|---:|
| Real Madrid | ~91.6 | ~64% |
| FC Barcelona | ~88.6 | ~46% |
| Atlético de Madrid | ~85.9 | ~30% |

En 100.000 partidos aleatorios de la misma liga:

- goles por partido: ~3.35
- porterías a cero por equipo: ~23%
- en los partidos donde un equipo era el más fuerte, el rival marcó al menos un gol en ~77% de los casos agregados

En un enfrentamiento fuerte contra un rival medio, por ejemplo Real Madrid (90) vs Betis (76.3), el modelo queda alrededor de **2.6 xG vs 0.7-0.8 xG**: ventaja muy clara, pero con una probabilidad cercana al 52% de que el rival marque al menos una vez.

## Nota

Los resultados ya jugados no se recalculan; el cambio afecta a nuevas simulaciones.

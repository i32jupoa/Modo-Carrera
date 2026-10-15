# Punto 4 — Diagnóstico y ajuste del realismo de liga y goleadores

## Causa raíz y diagnóstico del flujo

- La resolución de partidos de liga del avance diario y del salto de calendario converge en `simulateCalendarLeagueFixture`, `getCalendarMatchTeamData`, `getStartersWithFormation` y `simulateMatchFast`. El motor de partido usa por tanto el mismo núcleo. Las alineaciones filtran lesionados y jugadores sancionados según la competición.
- Las medias `att/mid/def` se recalculan al inicializar y al cambiar plantillas. La hipótesis de ratings listados necesariamente obsoletos no se confirma de forma general.
- La vista de goleadores mezclaba por defecto ligas con distinta duración y nivel. Ahora arranca en las cinco grandes ligas, con selector para una liga concreta o para «Todas las ligas».
- El modelo de reparto de goles ya dispone de ponderación por posición, atributos de definición, OVR y una bonificación no determinista para delanteros de élite. El test de catálogo no indicó necesidad de subir esos pesos: los pichichis se sitúan en el rango objetivo y los atacantes mejor valorados de las tres mejores plantillas ocupan aproximadamente 9,4 de las 10 plazas del top-10 de goleadores.

## Ajuste del motor

En `src/lib/simulation.ts` se ha cambiado la curva del reparto de ocasiones entre equipos:

```ts
// Antes
const rawShare = 0.5 + 0.26 * Math.tanh(effectiveDiff / 10.5);

// Después
const rawShare = 0.5 + 0.23 * Math.tanh(effectiveDiff / 8.0);
```

La pendiente cerca de equipos parejos aumenta (0,0248 a 0,0288), pero las diferencias extremas se comprimen. Se conserva el tope de 24/76 y el total de xG base de 2,95. El objetivo es que la fuerza de plantilla prediga el rendimiento, sin convertir las diferencias de calidad enormes en victorias casi seguras.

## Resultado antes/después

Diagnóstico de catálogo con semilla fija, 20 temporadas por liga y por ruta. El script usa jugadores y equipos reales del catálogo para construir XI sintéticos y aplicar el núcleo de xG y de goleadores. No ejecuta el store completo, transferencias, progresión, todos los eventos de lesiones ni la UI.

| Métrica agregada | Antes (0,26 / 10,5) | Después (0,23 / 8,0) |
|---|---:|---:|
| Spearman plantilla–puntos, avance diario | 0,775 | 0,802 |
| Spearman plantilla–puntos, salto | 0,770 | 0,798 |
| Gana el mejor OVR, promedio de ligas, avance diario | 55 % | 54 % |
| Gana el mejor OVR, promedio de ligas, salto | 59 % | 56 % |
| Goles por partido, avance diario / salto | 2,95 / 2,96 | 2,94 / 2,97 |
| Pichichi medio, avance diario / salto | 27,8 / 27,9 | 28,2 / 28,2 |
| Pichichis entre 24 y 38 goles, avance diario / salto | 89 % / 82 % | 89 % / 89 % |

En la última ejecución del test, la correlación queda en al menos 0,771 en cada liga y ruta; los puntos equivalentes a 38 jornadas dan 81,6 de media para el campeón y 28,3 para el último. La comparación de distribuciones diaria/salto queda dentro de tolerancias amplias en las cinco ligas.

**Límites conocidos:** Ligue 1 aún muestra una tasa del 80 % para el mejor OVR en esta prueba de plantillas congeladas. El agregado queda en 54 % diario y 56 % por salto, cerca de la referencia del 35–55 %, pero esto no demuestra cómo se comportará una carrera completa con transferencias y progresión. Bundesliga tiene 34 partidos; por eso se informa también la equivalencia normalizada a 38 jornadas.

## Archivos

- `src/lib/simulation.ts`: curva `rawShare` calibrada.
- `src/routes/scorers.tsx`: filtro por defecto de las cinco grandes ligas, con opción de una liga o todas.
- `scripts/season-balance-test.mjs`: actualiza la curva usada en la prueba Monte Carlo.
- `scripts/league-realism-test.mjs`: nuevo test de 20 temporadas y auditoría de ambos caminos.
- `scripts/scorer-ranking-scope-test.mjs`: nueva regresión del selector y alcance del ranking.
- `package.json`: añade `test:league-realism` y `test:scorer-ranking-scope`.
